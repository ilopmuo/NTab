import { Suspense, lazy, useMemo, useState } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { Plus } from 'lucide-react'
import type { Task } from '@/db/types'
import { useLookup } from '@/db/hooks'
import { createTask } from '@/db/actions'
import { loadParser, useParser } from '@/lib/useParser'
import { isFresh, sortManual, sortTasks } from '@/lib/tasks'
import { TaskItem } from './TaskItem'
import { useListOrder } from './ManualOrder'
import { Group, cx } from './ui'

// Lo entendido al escribir (fecha, etiquetas…), solo al escribir
const ParsedChips = lazy(() => import('./ParsedChips').then((m) => ({ default: m.ParsedChips })))
// Arrastrar para ordenar necesita el motor completo de animaciones: solo se carga en las listas con orden a mano
const ManualRows = lazy(() => import('./ManualRows').then((m) => ({ default: m.ManualRows })))

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
  hideImportant,
  sort = true,
  add,
  bare,
  empty,
  compact,
  draggable,
  orderKey,
  className,
}: {
  tasks: Task[]
  hideDate?: boolean
  hideProject?: boolean
  hideImportant?: boolean
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
  /** lista que se puede ordenar a mano (ver OrderToggle); p. ej. `inbox` o `project:<id>` */
  orderKey?: string
  className?: string
}) {
  const lookup = useLookup()
  const manual = useListOrder(orderKey)
  const list = useMemo(() => (manual && orderKey ? [...tasks].sort(sortManual(orderKey)) : sort ? [...tasks].sort(sortTasks) : tasks), [tasks, sort, manual, orderKey])
  if (!list.length && !add && !empty) return null

  const rows = (
    <>
      {manual ? (
        <Suspense fallback={list.map((t) => <div key={t.id} className={rowSeparator}><TaskItem task={t} lookup={lookup} hideDate={hideDate} hideProject={hideProject} compact={compact} /></div>)}>
          <ManualRows listKey={orderKey!} tasks={list} lookup={lookup} rowClass={rowSeparator} hideDate={hideDate} hideProject={hideProject} compact={compact} />
        </Suspense>
      ) : (
        <AnimatePresence initial={true}>
          {list.map((t, i) => (
            <motion.div
              key={t.id}
              layout="position"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 32, delay: Math.min(i, 12) * 0.03 } }}
              // Recorta solo al plegarse; si no, las chispas de la casilla saldrían cortadas
              exit={{ opacity: 0, height: 0, overflow: 'hidden', transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
              className={cx(rowSeparator, isFresh(t) && 'just-added')}
            >
              <TaskItem task={t} lookup={lookup} hideDate={hideDate} hideProject={hideProject} hideImportant={hideImportant} compact={compact} draggable={draggable} />
            </motion.div>
          ))}
        </AnimatePresence>
      )}
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
  const parse = useParser(open)
  const parsed = useMemo(() => parse?.(value, { areas, projects, people }), [parse, value, areas, projects, people])

  const submit = async () => {
    const parsed = (parse ?? (await loadParser()))(value, { areas, projects, people })
    if (!parsed.title) return
    const data: Partial<Task> & { title: string } = {
      ...defaults,
      title: parsed.title,
      priority: parsed.priority,
      tags: [...new Set([...(defaults?.tags ?? []), ...parsed.tags])],
    }
    if (parsed.dueDate) data.dueDate = parsed.dueDate
    if (parsed.dueTime) data.dueTime = parsed.dueTime
    if (parsed.deadline) data.deadline = parsed.deadline
    if (parsed.someday) data.someday = true
    if (parsed.recurrence) data.recurrence = parsed.recurrence
    if (parsed.reminder) data.reminder = parsed.reminder
    if (parsed.estimate) data.estimate = parsed.estimate
    if (parsed.nag) data.nag = parsed.nag
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
        {/* El círculo lleva el tono de relleno del acento: el blanco del + siempre se lee */}
        <span
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-white transition-transform group-active:scale-90"
          style={{ background: color === 'var(--c-blue)' ? 'var(--c-accent-fill)' : color }}
        >
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
      {value && parsed && (
        <Suspense fallback={null}>
          <ParsedChips parsed={parsed} className="mt-2 pl-[34px]" />
        </Suspense>
      )}
    </div>
  )
}
