import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Task } from '@/db/types'
import { useLookup } from '@/db/hooks'
import { createTask } from '@/db/actions'
import { parseQuickAdd } from '@/lib/parse'
import { sortTasks } from '@/lib/tasks'
import { TaskItem } from './TaskItem'
import { ParsedChips } from './ParsedChips'

export function TaskList({
  tasks,
  hideDate,
  hideProject,
  sort = true,
}: {
  tasks: Task[]
  hideDate?: boolean
  hideProject?: boolean
  sort?: boolean
}) {
  const lookup = useLookup()
  const list = useMemo(() => (sort ? [...tasks].sort(sortTasks) : tasks), [tasks, sort])
  return (
    <div className="flex flex-col">
      {list.map((t) => (
        <TaskItem key={t.id} task={t} lookup={lookup} hideDate={hideDate} hideProject={hideProject} />
      ))}
    </div>
  )
}

/** Fila "Añadir tarea" que entiende lenguaje natural y hereda el contexto de la vista. */
export function InlineAdd({ defaults, placeholder = 'Añadir tarea' }: { defaults?: Partial<Task>; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const { areas, projects } = useLookup()
  const parsed = useMemo(() => parseQuickAdd(value, { areas, projects }), [value, areas, projects])

  const submit = async () => {
    if (!parsed.title) return
    const data: Partial<Task> & { title: string } = {
      ...defaults,
      title: parsed.title,
      priority: parsed.priority,
      tags: [...new Set([...(defaults?.tags ?? []), ...parsed.tags])],
    }
    if (parsed.dueDate) data.dueDate = parsed.dueDate
    if (parsed.dueTime) data.dueTime = parsed.dueTime
    if (parsed.recurrence) data.recurrence = parsed.recurrence
    if (parsed.projectId) {
      data.projectId = parsed.projectId
      data.areaId = parsed.areaId
    } else if (parsed.areaId) {
      data.areaId = parsed.areaId
      data.projectId = undefined
    }
    await createTask(data)
    setValue('')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-faint transition-colors hover:text-accent"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full transition-colors group-hover:bg-accent group-hover:text-white">
          <Plus size={16} strokeWidth={2} />
        </span>
        {placeholder}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 shrink-0 rounded-full border-[1.5px] border-dashed border-line-strong" />
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') {
              e.stopPropagation()
              setOpen(false)
              setValue('')
            }
          }}
          onBlur={() => !value && setOpen(false)}
          placeholder="Ej: Enviar informe el viernes a las 12 !alta"
          className="min-w-0 flex-1 bg-transparent text-[14px] placeholder:text-faint"
        />
      </div>
      {value && <ParsedChips parsed={parsed} className="mt-2 pl-8" />}
    </div>
  )
}
