import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Plus } from 'lucide-react'
import type { Project, Task } from '@/db/types'
import { addSection } from '@/db/actions'
import { sortManual, sortTasks } from '@/lib/tasks'
import { InlineAdd } from '@/components/TaskList'
import { TaskCard } from '@/components/TaskCard'
import { useListOrder } from '@/components/ManualOrder'
import { dragToSection, moveTaskToSection, useDropOver } from '@/components/dayDrag'
import { Button, cx } from '@/components/ui'

interface Column {
  /** «-» = sin sección */
  id: string
  name: string
  tasks: Task[]
}

/**
 * El proyecto como tablero (como en Trello, Asana o Todoist): cada sección es
 * una columna y las tareas se arrastran de una a otra. Sin ratón, cada tarjeta
 * tiene «Mover a…» en su menú.
 */
export function ProjectBoard({ project, open }: { project: Project; open: Task[] }) {
  const sections = project.sections ?? []
  const known = new Set(sections.map((s) => s.id))
  const loose = open.filter((t) => !t.sectionId || !known.has(t.sectionId))
  const columns: Column[] = [
    ...(loose.length || !sections.length ? [{ id: '-', name: sections.length ? 'Sin sección' : 'Tareas', tasks: loose }] : []),
    ...sections.map((s) => ({ id: s.id, name: s.name, tasks: open.filter((t) => t.sectionId === s.id) })),
  ]
  return (
    <div
      data-drag-scroll-x
      className="no-scrollbar -mx-4 mb-8 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
    >
      {columns.map((c) => (
        <BoardColumn key={c.id} project={project} column={c} columns={columns} />
      ))}
      <NewColumn projectId={project.id} />
    </div>
  )
}

function BoardColumn({ project, column, columns }: { project: Project; column: Column; columns: Column[] }) {
  const over = useDropOver(column.id, 'section')
  const key = column.id === '-' ? `project:${project.id}` : `project:${project.id}:${column.id}`
  const manual = useListOrder(key)
  const tasks = [...column.tasks].sort(manual ? sortManual(key) : sortTasks)
  return (
    <section
      aria-label={`${column.name}, ${tasks.length} ${tasks.length === 1 ? 'tarea' : 'tareas'}`}
      data-drop-section={column.id}
      data-drop-label={column.name}
      className={cx(
        'flex w-[min(280px,82vw)] shrink-0 snap-start flex-col rounded-[20px] p-2 transition-[background-color,box-shadow] duration-200',
        over ? 'bg-[color-mix(in_srgb,var(--c-blue)_14%,var(--c-fill))] shadow-[inset_0_0_0_2px_var(--c-blue)]' : 'bg-fill-2',
      )}
    >
      <h3 className="flex items-center gap-2 px-2 pt-1 pb-2 text-[15px] font-bold">
        <span className="min-w-0 flex-1 truncate">{column.name}</span>
        <span className="font-num text-[13px] font-semibold text-muted">{tasks.length}</span>
      </h3>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              drag={dragToSection(t)}
              moves={columns.filter((c) => c.id !== column.id).map((c) => ({ label: `Mover a ${c.name}`, run: () => void moveTaskToSection(t, c.id, c.name) }))}
            />
          ))}
        </AnimatePresence>
      </ul>
      <div className="mt-2 overflow-hidden rounded-[14px] bg-[var(--c-material)]">
        <InlineAdd defaults={{ projectId: project.id, areaId: project.areaId, ...(column.id === '-' ? {} : { sectionId: column.id }) }} placeholder="Añadir tarea" />
      </div>
    </section>
  )
}

function NewColumn({ projectId }: { projectId: string }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const save = async () => {
    if (name.trim()) await addSection(projectId, name)
    setName('')
    setAdding(false)
  }
  return (
    <div className="w-[min(280px,82vw)] shrink-0 snap-start">
      {adding ? (
        <form
          className="space-y-2 rounded-[20px] bg-fill-2 p-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <input
            autoFocus
            aria-label="Nombre de la nueva columna"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setAdding(false)
              }
            }}
            onBlur={() => !name.trim() && setAdding(false)}
            placeholder="Ej. Por hacer, En marcha, Hecho"
            className="h-10 w-full rounded-xl bg-[var(--c-material)] px-3 text-[15px] placeholder:text-faint"
          />
          <Button size="sm" variant="primary" type="submit" disabled={!name.trim()} className="w-full">
            Añadir columna
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-12 w-full items-center justify-center gap-1.5 rounded-[20px] border-[1.5px] border-dashed border-line-strong text-[15px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <Plus size={16} strokeWidth={2.6} aria-hidden /> Nueva columna
        </button>
      )}
    </div>
  )
}
