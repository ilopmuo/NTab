import type { Task } from '@/db/types'
import { eventMinutes, type CalEvent } from '@/lib/calendarEvents'
import { DAY_CAPACITY, dayLoad, durationLabel } from '@/lib/duration'
import { cx } from '@/components/ui'

/** Cuánto hay ese día: lo estimado de las tareas pendientes y las reuniones (como la capacidad de Motion o Reclaim) */
export function loadOf(tasks: Task[], events: CalEvent[]) {
  return dayLoad(
    tasks.filter((t) => !t.done),
    events.filter((e) => !e.allDay).map(eventMinutes),
  )
}

/**
 * Barra fina con la carga del día frente a una jornada de 6 h: en el acento
 * mientras cabe; en el color del texto si se pasa.
 */
export function LoadMeter({ tasks, events, className }: { tasks: Task[]; events: CalEvent[]; className?: string }) {
  const load = loadOf(tasks, events)
  if (!load.total) return null
  const label = `${durationLabel(load.total)} ocupadas de ${DAY_CAPACITY / 60} h${load.level === 'over' ? ': demasiado' : ''}`
  return (
    <span className={cx('block', className)} title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="block h-[3px] overflow-hidden rounded-full bg-fill">
        <span className={cx('block h-full rounded-full', load.level === 'over' ? 'bg-fg' : 'bg-blue')} style={{ width: `${Math.min(100, (load.total / DAY_CAPACITY) * 100)}%` }} />
      </span>
    </span>
  )
}
