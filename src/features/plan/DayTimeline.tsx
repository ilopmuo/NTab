import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { Wand2 } from 'lucide-react'
import type { Task } from '@/db/types'
import { mutateTasks, restoreTasks, setTaskTimes } from '@/db/actions'
import { eventMinutes, eventTime, type CalEvent } from '@/lib/calendarEvents'
import { autoSchedule, firstOverlap, layoutColumns, snapMove, snapResize, toHHMM, toMin, type Block } from '@/lib/schedule'
import { swallowNextClick } from '@/components/dayDrag'
import { durationLabel } from '@/lib/duration'
import { haptic } from '@/lib/haptics'
import { today } from '@/lib/dates'
import { toast, ui } from '@/app/store'
import { Button, Section, cx, softSpring } from '@/components/ui'

const HOUR = 52
const FALLBACK = 30
const STEP = 15
const LONG_PRESS = 350

interface Item {
  key: string
  kind: 'event' | 'task'
  title: string
  start: number
  end: number
  task?: Task
  sub?: string
}

const nowMin = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * El día hora a hora: reuniones (gris) y tareas con hora (azul). «Colocar en
 * huecos» da hora a las tareas del día que no la tienen, en los huecos libres.
 * Tocar un hueco vacío crea una tarea a esa hora (como en Google Calendar).
 */
export function DayTimeline({ tasks, events, day = today(), title = 'Hora a hora' }: { tasks: Task[]; events: CalEvent[]; day?: string; title?: string }) {
  const isToday = day === today()
  const past = day < today()
  const [now, setNow] = useState(nowMin)
  useEffect(() => {
    const t = setInterval(() => setNow(nowMin()), 60_000)
    return () => clearInterval(t)
  }, [])

  const items = useMemo<Item[]>(
    () => [
      ...events
        .filter((e) => !e.allDay)
        .map((e) => {
          const start = toMin(eventTime(e))
          return { key: `e:${e.id}`, kind: 'event' as const, title: e.title, start, end: Math.min(24 * 60, start + Math.max(15, eventMinutes(e))), sub: e.location }
        }),
      ...tasks
        .filter((t) => t.dueTime)
        .map((t) => {
          const start = toMin(t.dueTime!)
          return { key: t.id, kind: 'task' as const, title: t.title, start, end: Math.min(24 * 60, start + (t.estimate ?? FALLBACK)), task: t, sub: t.estimate ? durationLabel(t.estimate) : undefined }
        }),
    ],
    [tasks, events],
  )
  const untimed = tasks.filter((t) => !t.dueTime)

  // Mover (arrastrar el bloque) o estirar (arrastrar el borde inferior) una tarea
  // `saving`: ya se soltó; se mantiene en su sitio hasta que llega el cambio de la base de datos
  const [drag, setDrag] = useState<{ key: string; start: number; end: number; saving?: boolean } | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => {
    if (drag?.saving) setDrag(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const commit = async (it: Item, start: number, end: number) => {
    const task = it.task!
    const clash = firstOverlap({ start, end }, itemsRef.current.filter((o) => o.key !== it.key && o.kind === 'event'))
    const warn = clash ? ` · se solapa con «${clash.title}»` : ''
    if (start !== it.start) {
      const before = await setTaskTimes([{ id: task.id, time: toHHMM(start) }])
      haptic()
      toast(`${task.title} → ${toHHMM(start)}${warn}`, { label: 'Deshacer', run: () => void restoreTasks(before) }, clash ? 6000 : 4000)
    } else if (end !== it.end) {
      const before = await mutateTasks([task.id], (t) => void (t.estimate = end - start))
      haptic()
      toast(`${task.title}: ${durationLabel(end - start)}${warn}`, { label: 'Deshacer', run: () => void restoreTasks(before) }, clash ? 6000 : 4000)
    }
  }

  const startDrag = (e: React.PointerEvent, it: Item, mode: 'move' | 'resize') => {
    if (e.button !== 0) return
    e.stopPropagation()
    const touch = e.pointerType === 'touch'
    const main = document.getElementById('main')
    const sy = e.clientY
    const scroll0 = main?.scrollTop ?? 0
    const duration = it.end - it.start
    let y = sy
    let started = false
    let raf = 0
    let cur = { start: it.start, end: it.end }

    const update = () => {
      const delta = ((y - sy + (main?.scrollTop ?? 0) - scroll0) / HOUR) * 60
      if (mode === 'move') {
        const start = snapMove(it.start, duration, delta, STEP)
        cur = { start, end: start + duration }
      } else cur = { start: it.start, end: it.start + snapResize(it.start, duration, delta, STEP) }
      setDrag((d) => (d && d.start === cur.start && d.end === cur.end ? d : { key: it.key, ...cur }))
    }
    const begin = () => {
      started = true
      if (touch) navigator.vibrate?.(10)
      document.body.style.userSelect = 'none'
      setDrag({ key: it.key, ...cur })
      // Desplazarse al acercarse a los bordes de la pantalla
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
      y = ev.clientY
      if (!started) {
        // En táctil, moverse antes de la pulsación larga es hacer scroll
        if (touch) return void (Math.abs(y - sy) > 10 && cleanup())
        if (Math.abs(y - sy) < 4) return
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
    const up = () => {
      cleanup()
      if (!started) return
      swallowNextClick()
      if (cur.start === it.start && cur.end === it.end) return setDrag(null)
      setDrag({ key: it.key, ...cur, saving: true })
      void commit(it, cur.start, cur.end).catch(() => setDrag(null))
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

  /** ↑/↓ mueve 15 min; con Mayús, cambia la duración */
  const onKey = (e: React.KeyboardEvent, it: Item) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const d = e.key === 'ArrowUp' ? -STEP : STEP
    const duration = it.end - it.start
    if (e.shiftKey) void commit(it, it.start, it.start + snapResize(it.start, duration, d, STEP))
    else {
      const start = snapMove(it.start, duration, d, STEP)
      void commit(it, start, start + duration)
    }
  }
  const shown = drag ? items.map((i) => (i.key === drag.key ? { ...i, start: drag.start, end: drag.end } : i)) : items
  const startHour = Math.max(0, Math.min(8, ...shown.map((i) => Math.floor(i.start / 60)), isToday ? Math.floor(now / 60) : 8))
  const endHour = Math.min(24, Math.max(21, ...shown.map((i) => Math.ceil(i.end / 60))))
  const px = (min: number) => ((min - startHour * 60) / 60) * HOUR

  const place = async () => {
    const busy: Block[] = items.map((i) => ({ start: i.start, end: i.end }))
    const from = isToday ? Math.max(now, 8 * 60) : 8 * 60
    const { placed, unplaced } = autoSchedule(
      untimed.map((t) => ({ id: t.id, priority: t.priority, estimate: t.estimate })),
      busy,
      { from, dayEnd: Math.max(21 * 60, from + 60), fallback: FALLBACK },
    )
    if (!placed.length) return void toast(isToday ? 'No quedan huecos hoy para esas tareas. Pasa alguna a mañana.' : 'No quedan huecos ese día para esas tareas.')
    haptic('success')
    const before = await setTaskTimes(placed.map((p) => ({ id: p.id, time: toHHMM(p.start) })))
    toast(
      `${placed.length} ${placed.length === 1 ? 'tarea colocada' : 'tareas colocadas'}${unplaced.length ? ` · ${unplaced.length} no caben` : ''}`,
      { label: 'Deshacer', run: () => void restoreTasks(before) },
      6000,
    )
  }

  return (
    <Section
      title={title}
      action={
        untimed.length > 0 &&
        !past && (
          <Button size="sm" variant="tinted" onClick={() => void place()}>
            <Wand2 size={14} strokeWidth={2.4} /> Colocar en huecos
          </Button>
        )
      }
    >
      <div className="glass relative overflow-hidden rounded-[18px] py-2 pr-2" style={{ height: (endHour - startHour) * HOUR + 16 }}>
        {Array.from({ length: endHour - startHour + 1 }, (_, i) => (
          <div key={i} className="absolute right-2 left-0 flex items-center gap-2" style={{ top: 8 + i * HOUR - 7 }}>
            <span className="font-num w-12 shrink-0 text-right text-[11px] font-semibold text-muted">{String(startHour + i).padStart(2, '0')}:00</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        ))}
        <div
          className="absolute top-2 right-2 bottom-2 left-[60px]"
          title="Toca un hueco para añadir una tarea a esa hora"
          onClick={(e) => {
            // Un hueco vacío (no un bloque): tarea nueva a esa hora, en medias horas
            if (e.target !== e.currentTarget) return
            const y = e.clientY - e.currentTarget.getBoundingClientRect().top
            const min = Math.max(0, Math.min(23 * 60 + 30, startHour * 60 + Math.floor(((y / HOUR) * 60) / 30) * 30))
            ui.quickAdd({ dueDate: day, dueTime: toHHMM(min) })
          }}
        >
          <AnimatePresence>
            {layoutColumns(shown).map((it) => {
              const top = px(it.start)
              const height = Math.max(22, px(it.end) - top - 2)
              const Tag = it.kind === 'task' ? motion.button : motion.div
              const dragging = drag?.key === it.key && !drag.saving
              const held = drag?.key === it.key
              const original = items.find((i) => i.key === it.key)!
              return (
                <Tag
                  key={it.key}
                  // Mientras se arrastra sigue al dedo sin muelle
                  layout={!held}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: dragging ? 1.02 : 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={softSpring}
                  {...(it.kind === 'task'
                    ? {
                        type: 'button' as const,
                        title: 'Arrastra para cambiar la hora; tira del borde de abajo para cambiar la duración (↑/↓, Mayús para la duración)',
                        onClick: () => ui.openTask(it.task!.id),
                        onPointerDown: (e: React.PointerEvent) => startDrag(e, original, 'move'),
                        onKeyDown: (e: React.KeyboardEvent) => onKey(e, original),
                      }
                    : {})}
                  className={cx(
                    // En columna, para que el título vaya arriba (un botón centra lo de dentro)
                    'absolute flex flex-col overflow-hidden rounded-[10px] px-2.5 py-1 text-left',
                    it.kind === 'task'
                      ? cx(
                          'group/block cursor-grab border-l-[3px] active:cursor-grabbing',
                          // Lo que ya pasó, en gris (sin transparencias, para que se siga leyendo)
                          (past || (isToday && it.end <= now)) && !dragging ? 'border-line-strong bg-fill text-muted' : 'border-blue bg-accent-soft text-fg',
                        )
                      : 'bg-fill text-muted',
                    dragging && 'z-10 shadow-[var(--c-shadow-lg)] ring-2 ring-blue',
                  )}
                  style={{ top, height, left: `${(it.col / it.cols) * 100}%`, width: `calc(${100 / it.cols}% - 4px)`, WebkitTouchCallout: 'none' }}
                >
                  <span className="block truncate text-[13px] leading-tight font-semibold">
                    {it.title}
                    {dragging && height <= 34 && (
                      <span className="text-accent">
                        {' '}
                        {toHHMM(it.start)}–{toHHMM(it.end)}
                      </span>
                    )}
                  </span>
                  {height > 34 && (
                    <span className={cx('block truncate text-[11.5px]', dragging ? 'font-semibold text-accent' : 'text-muted')}>
                      {toHHMM(it.start)}–{toHHMM(it.end)}
                      {dragging ? ` · ${durationLabel(it.end - it.start)}` : it.sub ? ` · ${it.sub}` : ''}
                    </span>
                  )}
                  {it.kind === 'task' && (
                    <span
                      aria-hidden
                      onPointerDown={(e) => startDrag(e, original, 'resize')}
                      className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-end justify-center pb-[3px]"
                    >
                      <span className={cx('h-[3px] w-6 rounded-full bg-blue/60 transition-opacity', dragging ? 'opacity-100' : 'opacity-0 group-hover/block:opacity-100')} />
                    </span>
                  )}
                </Tag>
              )
            })}
          </AnimatePresence>
          {isToday && now >= startHour * 60 && now <= endHour * 60 && (
            <div className="pointer-events-none absolute right-0 left-[-8px] flex items-center" style={{ top: px(now) - 4 }}>
              <span className="h-2 w-2 rounded-full bg-blue" />
              <span className="h-[1.5px] flex-1 bg-blue" />
            </div>
          )}
        </div>
      </div>
      {untimed.length > 0 && (
        <p className="mt-2 px-1 text-[13px] text-muted">
          {untimed.length} {untimed.length === 1 ? 'tarea' : 'tareas'} {isToday ? 'de hoy' : 'de ese día'} sin hora
          {untimed.some((t) => !t.estimate) ? ` (las que no tienen duración cuentan ${FALLBACK} min)` : ''}. «Colocar en huecos» les da hora entre tus reuniones, lo importante primero.
        </p>
      )}
    </Section>
  )
}
