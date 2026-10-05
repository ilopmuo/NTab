import { useEffect, useMemo, useRef, useState } from 'react'
import { Cake } from 'lucide-react'
import type { Person, Task } from '@/db/types'
import { mutateTasks, restoreTasks } from '@/db/actions'
import { capitalize, dateLabel, fmt, fromYmd, today } from '@/lib/dates'
import { durationLabel } from '@/lib/duration'
import { eventMinutes, eventTime, type CalEvent } from '@/lib/calendarEvents'
import { firstOverlap, layoutColumns, toHHMM, toMin } from '@/lib/schedule'
import { dayAt, dropStart, minuteAt, type GridBox } from '@/lib/weekGrid'
import { haptic } from '@/lib/haptics'
import { swallowNextClick } from '@/components/dayDrag'
import { toast, ui } from '@/app/store'
import { cx } from '@/components/ui'
import { LoadMeter } from './LoadMeter'

const HOUR = 48
const GUTTER = 48
const STEP = 15
const FALLBACK = 30
const LONG_PRESS = 350

interface Item {
  key: string
  kind: 'event' | 'task'
  title: string
  day: string
  start: number
  end: number
  task?: Task
  sub?: string
}

/** Lo que se está arrastrando: un bloque con hora, su borde de abajo o una tarea sin hora */
interface Drag {
  key: string
  mode: 'move' | 'resize'
  day: string
  start: number
  end: number
  /** sobre la rejilla de horas (si no, sobre la franja de «todo el día») */
  inGrid: boolean
  saving?: boolean
}

const nowMin = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * La semana por horas (como Google Calendar o Fantastical): reuniones y tareas
 * con hora en su sitio. Las tareas se arrastran a otra hora u otro día, y las
 * que no tienen hora, desde arriba a un hueco (el «timeboxing» de Akiflow o
 * Sunsama). Tocar un hueco crea una tarea a esa hora.
 */
export function WeekGrid({ days, byDay, evByDay, birthdays }: { days: string[]; byDay: Map<string, Task[]>; evByDay: Map<string, CalEvent[]>; birthdays: { date: string; person: Person }[] }) {
  const t = today()
  const [now, setNow] = useState(nowMin)
  useEffect(() => {
    const i = setInterval(() => setNow(nowMin()), 60_000)
    return () => clearInterval(i)
  }, [])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    for (const d of days) {
      for (const e of evByDay.get(d) ?? []) {
        if (e.allDay || new Date(e.start).toDateString() !== fromYmd(d).toDateString()) continue
        const start = toMin(eventTime(e))
        out.push({ key: `e:${e.id}:${d}`, kind: 'event', title: e.title, day: d, start, end: Math.min(24 * 60, start + Math.max(15, eventMinutes(e))), sub: e.location })
      }
      for (const x of byDay.get(d) ?? []) {
        if (!x.dueTime) continue
        const start = toMin(x.dueTime)
        out.push({ key: x.id, kind: 'task', title: x.title, day: d, start, end: Math.min(24 * 60, start + (x.estimate ?? FALLBACK)), task: x, sub: x.estimate ? durationLabel(x.estimate) : undefined })
      }
    }
    return out
  }, [days, byDay, evByDay])

  const [drag, setDrag] = useState<Drag | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => {
    if (drag?.saving) setDrag(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, byDay])

  const gridRef = useRef<HTMLDivElement>(null)
  const startHour = Math.max(0, Math.min(7, ...items.map((i) => Math.floor(i.start / 60))))
  const endHour = Math.min(24, Math.max(21, ...items.map((i) => Math.ceil(i.end / 60))))
  const box = (): GridBox => {
    const r = gridRef.current!.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, gutter: GUTTER, days: days.length, startHour, hourPx: HOUR }
  }

  const commit = async (task: Task, d: Drag) => {
    const time = toHHMM(d.start)
    const sameDay = task.dueDate === d.day
    if (d.mode === 'resize') {
      if (d.end - d.start === (task.estimate ?? FALLBACK)) return setDrag(null)
      const before = await mutateTasks([task.id], (x) => void (x.estimate = d.end - d.start))
      haptic()
      return toast(`${task.title}: ${durationLabel(d.end - d.start)}`, { label: 'Deshacer', run: () => void restoreTasks(before) })
    }
    if (!d.inGrid) {
      // Soltada arriba: a ese día, sin hora
      if (sameDay && !task.dueTime) return setDrag(null)
      const before = await mutateTasks([task.id], (x) => {
        x.dueDate = d.day
        delete x.dueTime
      })
      haptic()
      return toast(`${task.title} → ${dateLabel(d.day)}, sin hora`, { label: 'Deshacer', run: () => void restoreTasks(before) })
    }
    if (sameDay && task.dueTime === time) return setDrag(null)
    const clash = firstOverlap(d, itemsRef.current.filter((o) => o.kind === 'event' && o.day === d.day))
    const before = await mutateTasks([task.id], (x) => {
      x.dueDate = d.day
      x.dueTime = time
    })
    haptic()
    toast(
      `${task.title} → ${sameDay ? '' : `${dateLabel(d.day)} `}${time}${clash ? ` · se solapa con «${clash.title}»` : ''}`,
      { label: 'Deshacer', run: () => void restoreTasks(before) },
      clash ? 6000 : 4000,
    )
  }

  /** Arrastrar un bloque (o su borde) o una tarea sin hora desde la franja de arriba */
  const startDrag = (e: React.PointerEvent, task: Task, mode: 'move' | 'resize', from?: Item) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const touch = e.pointerType === 'touch'
    const main = document.getElementById('main')
    const sx = e.clientX
    const sy = e.clientY
    const duration = from ? from.end - from.start : (task.estimate ?? FALLBACK)
    // Dónde se cogió el bloque (para que no salte al moverlo)
    const grab = from && mode === 'move' ? Math.max(0, minuteAt(sy, box(), 1) - from.start) : STEP
    let x = sx
    let y = sy
    let started = false
    let raf = 0
    let cur: Drag = { key: task.id, mode, day: from?.day ?? task.dueDate ?? days[0], start: from?.start ?? 9 * 60, end: from?.end ?? 9 * 60 + duration, inGrid: !!from }

    const update = () => {
      const g = box()
      const day = days[dayAt(x, g)]
      if (mode === 'resize') {
        const end = Math.max(cur.start + STEP, Math.min(24 * 60, minuteAt(y, g, STEP) + STEP))
        cur = { ...cur, end }
      } else {
        const inGrid = y >= g.top
        const start = dropStart(y, g, grab, duration, STEP)
        cur = { ...cur, day, inGrid, start, end: start + duration }
      }
      setDrag((d) => (d && d.day === cur.day && d.start === cur.start && d.end === cur.end && d.inGrid === cur.inGrid ? d : { ...cur }))
    }
    const begin = () => {
      started = true
      if (touch) navigator.vibrate?.(10)
      document.body.style.userSelect = 'none'
      setDrag({ ...cur })
      const edge = () => {
        const h = window.innerHeight
        if (main && y < 90) main.scrollBy(0, -Math.ceil((90 - y) / 6))
        else if (main && y > h - 110) main.scrollBy(0, Math.ceil((y - (h - 110)) / 6))
        update()
        raf = requestAnimationFrame(edge)
      }
      raf = requestAnimationFrame(edge)
    }
    const timer = touch ? setTimeout(begin, LONG_PRESS) : undefined
    const move = (ev: PointerEvent) => {
      x = ev.clientX
      y = ev.clientY
      if (!started) {
        if (touch) return void (Math.hypot(x - sx, y - sy) > 10 && cleanup())
        if (Math.hypot(x - sx, y - sy) < 4) return
        begin()
      }
      update()
    }
    const blockScroll = (ev: TouchEvent) => {
      if (started) ev.preventDefault()
    }
    const cleanup = () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      document.removeEventListener('touchmove', blockScroll)
      document.body.style.userSelect = ''
    }
    const up = (ev: PointerEvent) => {
      cleanup()
      if (!started) return
      swallowNextClick(ev)
      setDrag({ ...cur, saving: true })
      void commit(task, cur).catch(() => setDrag(null))
    }
    const cancel = () => {
      cleanup()
      if (started) setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    document.addEventListener('touchmove', blockScroll, { passive: false })
  }

  /** ↑/↓ mueve 15 min (con Mayús, la duración); ←/→, a otro día */
  const onKey = (e: React.KeyboardEvent, it: Item) => {
    const i = days.indexOf(it.day)
    const d: Drag = { key: it.key, mode: 'move', day: it.day, start: it.start, end: it.end, inGrid: true }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const delta = e.key === 'ArrowUp' ? -STEP : STEP
      if (e.shiftKey) Object.assign(d, { mode: 'resize', end: Math.max(it.start + STEP, it.end + delta) })
      else Object.assign(d, { start: Math.max(0, it.start + delta), end: Math.max(0, it.start + delta) + (it.end - it.start) })
    } else if ((e.key === 'ArrowLeft' && i > 0) || (e.key === 'ArrowRight' && i < days.length - 1)) d.day = days[i + (e.key === 'ArrowLeft' ? -1 : 1)]
    else return
    e.preventDefault()
    void commit(it.task!, d)
  }

  const shown = drag ? items.filter((i) => i.key !== drag.key) : items
  const px = (min: number) => ((min - startHour * 60) / 60) * HOUR
  const cols = `${GUTTER}px repeat(${days.length}, minmax(0, 1fr))`
  const ghostTask = drag ? (items.find((i) => i.key === drag.key)?.task ?? [...byDay.values()].flat().find((x) => x.id === drag.key)) : undefined

  return (
    <div className="glass overflow-hidden rounded-[18px]">
      {/* Días, con su carga */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => (
          <div key={d} className="min-w-0 border-l border-line px-2 pt-2 pb-1.5 text-center">
            <p className="text-[12px] font-semibold text-muted">{capitalize(fmt(d, 'EEE')).replace('.', '')}</p>
            <p className={cx('font-num text-[20px] leading-tight font-bold', d === t ? 'text-blue' : d < t && 'text-muted')}>{fromYmd(d).getDate()}</p>
            <LoadMeter tasks={byDay.get(d) ?? []} events={evByDay.get(d) ?? []} className="mx-auto mt-1 w-10" />
          </div>
        ))}
      </div>

      {/* Todo el día: eventos, cumpleaños y tareas sin hora (se arrastran a un hueco) */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
        <div className="pt-1.5 pr-1.5 text-right text-[10.5px] leading-tight font-semibold text-muted">sin hora</div>
        {days.map((d) => {
          // La que se arrastra se queda (atenuada) para que la rejilla no se mueva bajo el puntero
          const untimed = (byDay.get(d) ?? []).filter((x) => !x.dueTime)
          const over = drag && !drag.inGrid && drag.day === d && drag.mode === 'move'
          return (
            <div key={d} className={cx('min-w-0 space-y-1 border-l border-line p-1', over && 'bg-accent-soft')} style={{ minHeight: 38 }}>
              {birthdays
                .filter((b) => b.date === d)
                .map((b) => (
                  <p key={b.person.id} className="flex items-center gap-1 truncate px-1 text-[11.5px] font-semibold text-pink">
                    <Cake size={11} className="shrink-0" /> {b.person.name}
                  </p>
                ))}
              {(evByDay.get(d) ?? [])
                .filter((e) => e.allDay)
                .map((e) => (
                  <p key={e.id} className="truncate rounded-[6px] border border-line-strong px-1.5 text-[11.5px] leading-[18px] text-muted">
                    {e.title}
                  </p>
                ))}
              {untimed.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onPointerDown={(e) => !x.done && startDrag(e, x, 'move')}
                  onClick={() => ui.openTask(x.id)}
                  title="Arrastra a una hora para reservarle un hueco"
                  className={cx(
                    'block w-full cursor-grab truncate rounded-[6px] bg-accent-soft px-1.5 text-left text-[11.5px] leading-[19px] font-medium text-fg active:cursor-grabbing',
                    x.done && 'bg-transparent text-muted line-through',
                    x.id === drag?.key && 'opacity-40',
                  )}
                  style={{ WebkitTouchCallout: 'none' }}
                >
                  {x.title}
                </button>
              ))}
            </div>
          )
        })}
      </div>

      {/* Horas */}
      <div ref={gridRef} className="relative grid" style={{ gridTemplateColumns: cols, height: (endHour - startHour) * HOUR }}>
        {Array.from({ length: endHour - startHour }, (_, i) => (
          <div key={i} aria-hidden className="pointer-events-none absolute right-0 left-0 border-t border-line" style={{ top: i * HOUR }}>
            <span className="font-num absolute -top-[7px] left-0 w-[42px] text-right text-[10.5px] font-semibold text-muted">
              {i === 0 ? '' : `${String(startHour + i).padStart(2, '0')}:00`}
            </span>
          </div>
        ))}
        <div />
        {days.map((d) => {
          const blocks = layoutColumns(shown.filter((i) => i.day === d))
          return (
            <div
              key={d}
              data-day={d}
              className={cx('relative border-l border-line', d === t && 'bg-accent-soft/30')}
              title="Toca un hueco para añadir una tarea a esa hora"
              onClick={(e) => {
                if (e.target !== e.currentTarget) return
                ui.quickAdd({ dueDate: d, dueTime: toHHMM(minuteAt(e.clientY, box(), 30)) })
              }}
            >
              {blocks.map((it) => (
                <Block key={it.key} it={it} top={px(it.start)} height={Math.max(20, px(it.end) - px(it.start) - 2)} past={it.day < t || (it.day === t && it.end <= now)} onDrag={startDrag} onKey={onKey} />
              ))}
              {drag?.inGrid && drag.day === d && ghostTask && (
                <div
                  className="absolute right-0.5 left-0.5 z-10 overflow-hidden rounded-[8px] border-l-[3px] border-blue bg-accent-soft px-1.5 py-0.5 shadow-[var(--c-shadow-lg)] ring-2 ring-blue"
                  style={{ top: px(drag.start), height: Math.max(20, px(drag.end) - px(drag.start) - 2) }}
                >
                  <p className="truncate text-[12px] leading-tight font-semibold">{ghostTask.title}</p>
                  <p className="font-num truncate text-[11px] font-semibold text-accent">
                    {toHHMM(drag.start)}–{toHHMM(drag.end)}
                  </p>
                </div>
              )}
              {d === t && now >= startHour * 60 && now <= endHour * 60 && (
                <div className="pointer-events-none absolute right-0 left-0 z-[5] flex items-center" style={{ top: px(now) - 4 }}>
                  <span className="-ml-1 h-2 w-2 rounded-full bg-blue" />
                  <span className="h-[1.5px] flex-1 bg-blue" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Block({
  it,
  top,
  height,
  past,
  onDrag,
  onKey,
}: {
  it: Item & { col: number; cols: number }
  top: number
  height: number
  past: boolean
  onDrag: (e: React.PointerEvent, task: Task, mode: 'move' | 'resize', from?: Item) => void
  onKey: (e: React.KeyboardEvent, it: Item) => void
}) {
  const style = { top, height, left: `calc(${(it.col / it.cols) * 100}% + 2px)`, width: `calc(${100 / it.cols}% - 4px)`, WebkitTouchCallout: 'none' as const }
  if (it.kind === 'event')
    return (
      <div className="absolute overflow-hidden rounded-[8px] bg-fill px-1.5 py-0.5 text-muted" style={style} title={it.title}>
        <p className="truncate text-[12px] leading-tight font-semibold">{it.title}</p>
        <p className={cx('font-num truncate text-[11px]', height <= 30 && 'sr-only')}>
          {toHHMM(it.start)}–{toHHMM(it.end)}
        </p>
      </div>
    )
  return (
    <button
      type="button"
      onClick={() => ui.openTask(it.task!.id)}
      onPointerDown={(e) => onDrag(e, it.task!, 'move', it)}
      onKeyDown={(e) => onKey(e, it)}
      title="Arrastra a otra hora u otro día; tira del borde de abajo para cambiar la duración (↑/↓, ←/→, Mayús para la duración)"
      className={cx(
        'group/block absolute flex cursor-grab flex-col overflow-hidden rounded-[8px] border-l-[3px] px-1.5 py-0.5 text-left active:cursor-grabbing',
        past ? 'border-line-strong bg-fill text-muted' : 'border-blue bg-accent-soft text-fg',
        it.task?.done && 'line-through',
      )}
      style={style}
    >
      <span className="block truncate text-[12px] leading-tight font-semibold">{it.title}</span>
      {/* En los cortos la hora no cabe, pero se lee */}
      <span className={cx('font-num block truncate text-[11px] text-muted', height <= 30 && 'sr-only')}>
        {toHHMM(it.start)}–{toHHMM(it.end)}
      </span>
      <span aria-hidden onPointerDown={(e) => onDrag(e, it.task!, 'resize', it)} className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center pb-[2px]">
        <span className="h-[3px] w-5 rounded-full bg-blue/60 opacity-0 transition-opacity group-hover/block:opacity-100" />
      </span>
    </button>
  )
}
