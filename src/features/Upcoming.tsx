import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { ui } from '@/app/store'
import { useOpenTasks } from '@/db/hooks'
import { addDaysYmd, capitalize, fmt, fromYmd, today } from '@/lib/dates'
import { TaskList } from '@/components/TaskList'
import { whenDue } from '@/lib/tasks'
import { Section, cx } from '@/components/ui'
import { useDropOver } from '@/components/dayDrag'
import type { Task } from '@/db/types'
import { Progressive } from '@/components/Progressive'
import { MarkRow, useDayMarks, type DayMark } from './calendar/dayMarks'

/** Cuántas tareas hay programadas a partir de hoy */
export const scheduledFrom = (tasks: Task[], t = today()) => tasks.filter((x) => (whenDue(x) ?? '') >= t).length

/**
 * Lo que viene, día a día (como Próximo de Things): lo atrasado, los próximos
 * 14 días y lo de más adelante. Es la vista «Lista» del Calendario.
 */
export function UpcomingList() {
  const tasks = useOpenTasks()
  const t = today()
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysYmd(t, i)), [t])
  // Fechas límite, pagos y cuentas atrás, cada uno en su día
  const marks = useDayMarks(t, days[days.length - 1], tasks, true)
  if (!tasks) return null
  // Cada tarea, en el día que manda (el de hacerla o el de su fecha límite, el que llegue antes)
  const overdue = tasks.filter((x) => (whenDue(x) ?? '9') < t)
  const later = tasks.filter((x) => (whenDue(x) ?? '') > days[days.length - 1])

  return (
    <>
      {overdue.length > 0 && (
        <Section title="Atrasadas" count={overdue.length} tone="red" sticky>
          <TaskList tasks={overdue} draggable />
        </Section>
      )}
      {/* Los días, por tramos: con muchas tareas, los primeros salen ya */}
      <Progressive
        items={days.map((d, i) => ({ d, i, list: tasks.filter((x) => whenDue(x) === d) }))}
        weight={(x) => x.list.length}
        first={Math.max(40, 80 - overdue.length)}
        render={({ d, i, list }) => {
          // El mes, como separador, solo cuando cambia (y no antes del primer día)
          const newMonth = i > 0 && d.slice(0, 7) !== days[i - 1].slice(0, 7)
          return (
            <div key={d}>
              {newMonth && <h2 className="mt-6 mb-3 px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">{fmt(d, 'MMMM')}</h2>}
              {list.length ? <DaySection day={d} index={i} tasks={list} marks={marks.get(d) ?? []} /> : <FreeDay day={d} index={i} marks={marks.get(d) ?? []} />}
            </div>
          )
        }}
      />
      {later.length > 0 && (
        <Section title="Más adelante" count={later.length} tone="orange" sticky>
          <TaskList tasks={later} draggable />
        </Section>
      )}
    </>
  )
}

const dayLabel = (day: string, index: number) => (index === 0 ? 'Hoy' : index === 1 ? 'Mañana' : capitalize(fmt(day, 'EEEE')))

function DaySection({ day, index, tasks, marks }: { day: string; index: number; tasks: Task[]; marks: DayMark[] }) {
  const over = useDropOver(day)
  const weekend = [0, 6].includes(fromYmd(day).getDay())
  return (
    <section data-drop-day={day} className={cx('-mx-2 mb-4 rounded-[20px] px-2 pt-1 pb-2 transition-colors', over && 'bg-accent-soft ring-2 ring-blue')}>
      {/* El día se queda arriba mientras se ven sus tareas (como en Recordatorios) */}
      <div className="sticky-head -mx-2 mb-2 flex items-baseline gap-2 rounded-t-[20px] px-3 py-1.5">
        <span className={cx('font-num text-[28px] leading-none font-bold', index === 0 ? 'text-blue' : weekend ? 'text-muted' : 'text-fg')}>{fromYmd(day).getDate()}</span>
        <span className="text-[17px] font-bold">{dayLabel(day, index)}</span>
        {index === 0 && <span className="text-[14px] text-muted">{capitalize(fmt(day, 'MMMM'))}</span>}
      </div>
      {marks.length > 0 && (
        <div className="mb-2 space-y-0.5 px-1">
          {marks.map((m) => (
            <MarkRow key={m.id} mark={m} />
          ))}
        </div>
      )}
      <TaskList tasks={tasks} hideDate draggable add={{ defaults: { dueDate: day }, placeholder: 'Nueva tarea', color: 'var(--c-blue)' }} />
    </section>
  )
}

/** Un día sin nada: una línea (se puede soltar una tarea encima o añadir con +) */
function FreeDay({ day, index, marks }: { day: string; index: number; marks: DayMark[] }) {
  const over = useDropOver(day)
  const weekend = [0, 6].includes(fromYmd(day).getDay())
  return (
    <section
      data-drop-day={day}
      className={cx(
        '-mx-2 mb-1.5 flex items-center gap-2 rounded-[14px] px-3 py-1.5 transition-colors',
        over ? 'bg-accent-soft ring-2 ring-blue' : 'hover:bg-hover',
      )}
    >
      <span className={cx('font-num w-8 text-[20px] leading-none font-bold', index === 0 ? 'text-blue' : 'text-muted')}>{fromYmd(day).getDate()}</span>
      <span className={cx('text-[15px] font-semibold', weekend && 'text-muted')}>{dayLabel(day, index)}</span>
      {index === 0 && <span className="text-[14px] text-muted">{capitalize(fmt(day, 'MMMM'))}</span>}
      {marks.length ? (
        <span className="flex min-w-0 flex-1 flex-col">
          {marks.map((m) => (
            <MarkRow key={m.id} mark={m} small />
          ))}
        </span>
      ) : (
        <span className="text-[13px] text-muted">· libre</span>
      )}
      <button
        type="button"
        onClick={() => ui.quickAdd({ dueDate: day })}
        aria-label={`Añadir el ${fmt(day, "EEEE d 'de' MMMM")}`}
        title="Añadir"
        className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-blue transition-colors hover:bg-press"
      >
        <Plus size={17} strokeWidth={2.6} />
      </button>
    </section>
  )
}
