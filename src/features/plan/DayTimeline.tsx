import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Wand2 } from 'lucide-react'
import type { Task } from '@/db/types'
import { restoreTasks, setTaskTimes } from '@/db/actions'
import { eventMinutes, eventTime, type CalEvent } from '@/lib/calendarEvents'
import { autoSchedule, toHHMM, toMin, type Block } from '@/lib/schedule'
import { durationLabel } from '@/lib/duration'
import { haptic } from '@/lib/haptics'
import { toast, ui } from '@/app/store'
import { Button, Section, cx, softSpring } from '@/components/ui'

const HOUR = 52
const FALLBACK = 30

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

/** Reparte en columnas lo que se solapa */
function layout(items: Item[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: (Item & { col: number; cols: number })[] = []
  let group: (Item & { col: number; cols: number })[] = []
  let groupEnd = -1
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1))
    for (const g of group) g.cols = cols
    out.push(...group)
    group = []
  }
  for (const it of sorted) {
    if (it.start >= groupEnd && group.length) flush()
    const used = new Set(group.filter((g) => g.end > it.start).map((g) => g.col))
    let col = 0
    while (used.has(col)) col++
    group.push({ ...it, col, cols: 1 })
    groupEnd = Math.max(groupEnd, it.end)
  }
  if (group.length) flush()
  return out
}

/**
 * El día hora a hora: reuniones (gris) y tareas con hora (azul). «Colocar en
 * huecos» da hora a las tareas de hoy que no la tienen, en los huecos libres.
 */
export function DayTimeline({ tasks, events }: { tasks: Task[]; events: CalEvent[] }) {
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
  const startHour = Math.max(0, Math.min(8, ...items.map((i) => Math.floor(i.start / 60)), Math.floor(now / 60)))
  const endHour = Math.min(24, Math.max(21, ...items.map((i) => Math.ceil(i.end / 60))))
  const px = (min: number) => ((min - startHour * 60) / 60) * HOUR

  const place = async () => {
    const busy: Block[] = items.map((i) => ({ start: i.start, end: i.end }))
    const from = Math.max(now, 8 * 60)
    const { placed, unplaced } = autoSchedule(
      untimed.map((t) => ({ id: t.id, priority: t.priority, estimate: t.estimate })),
      busy,
      { from, dayEnd: Math.max(21 * 60, from + 60), fallback: FALLBACK },
    )
    if (!placed.length) return void toast('No quedan huecos hoy para esas tareas. Pasa alguna a mañana.')
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
      title="Hora a hora"
      action={
        untimed.length > 0 && (
          <Button size="sm" variant="tinted" onClick={() => void place()}>
            <Wand2 size={14} strokeWidth={2.4} /> Colocar en huecos
          </Button>
        )
      }
    >
      <div className="glass relative overflow-hidden rounded-[18px] py-2 pr-2" style={{ height: (endHour - startHour) * HOUR + 16 }}>
        {Array.from({ length: endHour - startHour + 1 }, (_, i) => (
          <div key={i} className="absolute right-2 left-0 flex items-center gap-2" style={{ top: 8 + i * HOUR - 7 }}>
            <span className="font-num w-12 shrink-0 text-right text-[11px] font-semibold text-faint">{String(startHour + i).padStart(2, '0')}:00</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        ))}
        <div className="absolute top-2 right-2 bottom-2 left-[60px]">
          <AnimatePresence>
            {layout(items).map((it) => {
              const top = px(it.start)
              const height = Math.max(22, px(it.end) - top - 2)
              const Tag = it.kind === 'task' ? motion.button : motion.div
              return (
                <Tag
                  key={it.key}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={softSpring}
                  {...(it.kind === 'task' ? { type: 'button' as const, onClick: () => ui.openTask(it.task!.id) } : {})}
                  className={cx(
                    'absolute overflow-hidden rounded-[10px] px-2.5 py-1 text-left',
                    it.kind === 'task' ? 'border-l-[3px] border-blue bg-accent-soft text-fg' : 'bg-fill text-muted',
                    it.end <= now && 'opacity-50',
                  )}
                  style={{ top, height, left: `${(it.col / it.cols) * 100}%`, width: `calc(${100 / it.cols}% - 4px)` }}
                >
                  <span className="block truncate text-[13px] leading-tight font-semibold">{it.title}</span>
                  {height > 34 && (
                    <span className="block truncate text-[11.5px] opacity-80">
                      {toHHMM(it.start)}–{toHHMM(it.end)}
                      {it.sub ? ` · ${it.sub}` : ''}
                    </span>
                  )}
                </Tag>
              )
            })}
          </AnimatePresence>
          {now >= startHour * 60 && now <= endHour * 60 && (
            <div className="pointer-events-none absolute right-0 left-[-8px] flex items-center" style={{ top: px(now) - 4 }}>
              <span className="h-2 w-2 rounded-full bg-blue" />
              <span className="h-[1.5px] flex-1 bg-blue" />
            </div>
          )}
        </div>
      </div>
      {untimed.length > 0 && (
        <p className="mt-2 px-1 text-[13px] text-muted">
          {untimed.length} {untimed.length === 1 ? 'tarea' : 'tareas'} de hoy sin hora
          {untimed.some((t) => !t.estimate) ? ` (las que no tienen duración cuentan ${FALLBACK} min)` : ''}. «Colocar en huecos» les da hora entre tus reuniones, lo importante primero.
        </p>
      )}
    </Section>
  )
}
