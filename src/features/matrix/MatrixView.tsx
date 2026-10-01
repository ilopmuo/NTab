import { AnimatePresence } from 'motion/react'
import { Grid2x2 } from 'lucide-react'
import type { Task } from '@/db/types'
import { useOpenTasks } from '@/db/hooks'
import { restoreTasks } from '@/db/actions'
import { db } from '@/db/db'
import { byQuadrant, moveToQuadrant, QUADRANTS, type Quadrant } from '@/lib/matrix'
import { sortTasks } from '@/lib/tasks'
import { SectionIcon, section } from '@/app/sections'
import { toast } from '@/app/store'
import { TaskCard } from '@/components/TaskCard'
import { dragTask, useDropOver, type DropKind } from '@/components/dayDrag'
import { InlineAdd } from '@/components/TaskList'
import { Empty, Group, PageHeader, cx } from '@/components/ui'
import { today } from '@/lib/dates'
import { Page } from '../Page'

async function moveTaskToQuadrant(task: Task, to: Quadrant) {
  const patch = moveToQuadrant(task, to)
  const q = QUADRANTS.find((x) => x.id === to)!
  if (!patch) return toast('Su fecha límite es para ya: sigue siendo urgente')
  const before = structuredClone(task)
  await db.tasks.update(task.id, patch)
  toast(`${task.title} → ${q.title.toLowerCase()}`, { label: 'Deshacer', run: () => void restoreTasks([before]) })
}

const drop: DropKind['drop'] = (task, to) => void moveTaskToQuadrant(task, to as Quadrant)

/** Lo que hereda una tarea creada dentro de un cuadrante */
const DEFAULTS: Record<Quadrant, () => Partial<Task>> = {
  do: () => ({ priority: 2, dueDate: today() }),
  plan: () => ({ priority: 2 }),
  delegate: () => ({ dueDate: today() }),
  drop: () => ({}),
}

/**
 * Matriz de Eisenhower (como en TickTick): lo pendiente en cuatro cuadrantes,
 * según sea importante (prioridad media o alta) y urgente (para hoy o mañana).
 * Arrastrar a otro cuadrante cambia la prioridad o la fecha.
 */
export function MatrixView() {
  const tasks = useOpenTasks()
  if (!tasks) return null
  const t = today()
  const groups = byQuadrant(tasks, t)
  const total = QUADRANTS.reduce((n, q) => n + groups[q.id].length, 0)
  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('matrix')} size={40} />}
        title="Matriz de Eisenhower"
        subtitle="Importante = prioridad media o alta. Urgente = para hoy o mañana. Arrastra una tarea para cambiarla de cuadrante."
      />
      {total === 0 ? (
        <Group>
          <Empty icon={<Grid2x2 size={28} strokeWidth={2.2} />} title="Nada pendiente" hint="Cuando tengas tareas, aquí verás cuáles importan de verdad y cuáles solo hacen ruido." />
        </Group>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {QUADRANTS.map((q, i) => (
            <QuadrantBox key={q.id} q={q} index={i} tasks={[...groups[q.id]].sort(sortTasks)} />
          ))}
        </div>
      )}
    </Page>
  )
}

function QuadrantBox({ q, index, tasks }: { q: (typeof QUADRANTS)[number]; index: number; tasks: Task[] }) {
  const over = useDropOver(q.id, 'quadrant')
  const id = `quadrant-${q.id}`
  return (
    <section
      aria-labelledby={id}
      data-drop-quadrant={q.id}
      data-drop-label={q.title.toLowerCase()}
      className={cx(
        'flex min-h-48 flex-col rounded-[22px] p-2 transition-[background-color,box-shadow] duration-200',
        over ? 'bg-[color-mix(in_srgb,var(--c-blue)_14%,var(--c-fill))] shadow-[inset_0_0_0_2px_var(--c-blue)]' : 'bg-fill-2',
      )}
    >
      <header className="flex items-start gap-2.5 px-2 pt-1.5 pb-2.5">
        <span
          aria-hidden
          className={cx('font-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold', index === 0 ? 'bg-accent-fill text-white' : 'bg-fill text-fg')}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id} className="text-[16px] leading-tight font-bold">
            {q.title}
          </h2>
          <p className="text-[13px] text-muted">{q.action}</p>
        </div>
        <span className="font-num pt-0.5 text-[14px] font-semibold text-muted">{tasks.length}</span>
      </header>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              showProject
              drag={dragTask(t, { kind: 'quadrant', from: q.id, drop })}
              moves={QUADRANTS.filter((x) => x.id !== q.id).map((x) => ({ label: `Mover a «${x.title}»`, run: () => void moveTaskToQuadrant(t, x.id) }))}
            />
          ))}
        </AnimatePresence>
      </ul>
      <div className="mt-auto pt-2">
        <div className="overflow-hidden rounded-[14px] bg-[var(--c-material)]">
          <InlineAdd defaults={DEFAULTS[q.id]()} placeholder="Añadir tarea" />
        </div>
      </div>
    </section>
  )
}
