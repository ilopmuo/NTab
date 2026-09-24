import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Plus } from 'lucide-react'
import type { Task } from '@/db/types'
import { useLookup } from '@/db/hooks'
import { createTask } from '@/db/actions'
import { parseQuickAdd } from '@/lib/parse'
import { sortTasks } from '@/lib/tasks'
import { TaskItem } from './TaskItem'
import { ParsedChips } from './ParsedChips'
import { Group, cx } from './ui'

const rowSeparator =
  "relative after:pointer-events-none after:absolute after:right-0 after:bottom-0 after:left-[50px] after:h-px after:bg-line after:content-[''] last:after:hidden"

/**
 * Lista de tareas en bloque agrupado. Las filas entran escalonadas, se
 * reordenan con suavidad y al completarse se pliegan.
 */
export function TaskList({
  tasks,
  hideDate,
  hideProject,
  sort = true,
  add,
  bare,
  empty,
  compact,
  draggable,
  className,
}: {
  tasks: Task[]
  hideDate?: boolean
  hideProject?: boolean
  sort?: boolean
  /** fila "Nueva tarea" al final, heredando estos valores */
  add?: { defaults?: Partial<Task>; placeholder?: string; color?: string }
  /** sin bloque de cristal alrededor */
  bare?: boolean
  /** contenido cuando no hay tareas (dentro del bloque) */
  empty?: React.ReactNode
  compact?: boolean
  /** filas arrastrables a otro día */
  draggable?: boolean
  className?: string
}) {
  const lookup = useLookup()
  const list = useMemo(() => (sort ? [...tasks].sort(sortTasks) : tasks), [tasks, sort])
  if (!list.length && !add && !empty) return null

  const rows = (
    <>
      <AnimatePresence initial={true}>
        {list.map((t, i) => (
          <motion.div
            key={t.id}
            layout="position"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 32, delay: Math.min(i, 12) * 0.03 } }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
            className={cx(rowSeparator, 'overflow-hidden')}
          >
            <TaskItem task={t} lookup={lookup} hideDate={hideDate} hideProject={hideProject} compact={compact} draggable={draggable} />
          </motion.div>
        ))}
      </AnimatePresence>
      {!list.length && empty}
      {add && (
        <div className={cx(list.length > 0 && 'shadow-[inset_0_1px_0_var(--c-border)]')}>
          <InlineAdd {...add} />
        </div>
      )}
    </>
  )
  return bare ? <div className={className}>{rows}</div> : <Group className={className}>{rows}</Group>
}

/** Fila "Nueva tarea" que entiende lenguaje natural y hereda el contexto de la vista. */
export function InlineAdd({
  defaults,
  placeholder = 'Nueva tarea',
  color = 'var(--c-blue)',
}: {
  defaults?: Partial<Task>
  placeholder?: string
  color?: string
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const { areas, projects, people } = useLookup()
  const parsed = useMemo(() => parseQuickAdd(value, { areas, projects, people }), [value, areas, projects, people])

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
    if (parsed.reminder) data.reminder = parsed.reminder
    if (parsed.estimate) data.estimate = parsed.estimate
    if (parsed.people?.length) data.people = [...new Set([...(defaults?.people ?? []), ...parsed.people])]
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
        className="group flex w-full items-center gap-3 px-4 py-[11px] text-[15px] font-medium transition-colors hover:bg-hover"
        style={{ color }}
      >
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-white transition-transform group-active:scale-90" style={{ background: color }}>
          <Plus size={15} strokeWidth={3} />
        </span>
        {placeholder}
      </button>
    )
  }

  return (
    <div className="px-4 py-[11px]">
      <div className="flex items-center gap-3">
        <span className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.6px] border-dashed border-faint" />
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
          className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-faint"
        />
      </div>
      {value && <ParsedChips parsed={parsed} className="mt-2 pl-[34px]" />}
    </div>
  )
}
