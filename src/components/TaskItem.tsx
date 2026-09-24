import { memo, useState } from 'react'
import { motion } from 'motion/react'
import { Bell, ChevronRight, Clock, ListChecks, Repeat, StickyNote } from 'lucide-react'
import type { Task } from '@/db/types'
import { db } from '@/db/db'
import type { Lookup } from '@/db/hooks'
import { toggleTask } from '@/db/actions'
import { dateLabel, today } from '@/lib/dates'
import { PRIORITY_COLOR, dateColor } from '@/lib/tasks'
import { recurrenceLabel } from '@/lib/recurrence'
import { toast, ui, useUI } from '@/app/store'
import { bouncy, cx } from './ui'
import { dragToDay } from './dayDrag'

/** Casilla redonda de Recordatorios: se rellena con un muelle y el ✓ se dibuja */
export function Checkbox({
  checked,
  onChange,
  priority = 0,
  size = 22,
  label,
  color = 'var(--c-green)',
}: {
  checked: boolean
  onChange: () => void
  priority?: number
  size?: number
  label?: string
  color?: string
}) {
  const ring = priority ? PRIORITY_COLOR[priority] : 'var(--c-faint)'
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? 'Marcar como pendiente' : 'Completar')}
      whileTap={{ scale: 0.82 }}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className="group/cb relative flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 rounded-full border-[1.6px] transition-colors" style={{ borderColor: checked ? color : ring }} />
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ background: color }}
        initial={false}
        animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
        transition={bouncy}
      />
      {!checked && (
        <span className="absolute inset-[4px] rounded-full opacity-0 transition-opacity group-hover/cb:opacity-100" style={{ background: `color-mix(in srgb, ${ring} 22%, transparent)` }} />
      )}
      <svg viewBox="0 0 16 16" className="relative" style={{ width: size * 0.6, height: size * 0.6 }}>
        <motion.path
          d="M3.5 8.4l3 3 6-6.6"
          fill="none"
          stroke="var(--c-on-green)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.28, delay: checked ? 0.08 : 0, ease: [0.3, 0.8, 0.3, 1] }}
        />
      </svg>
    </motion.button>
  )
}

export async function completeWithFeedback(task: Task) {
  const wasDone = !!task.done
  const next = await toggleTask(task)
  if (wasDone) return
  const msg = next?.dueDate ? `Hecho · se repite ${dateLabel(next.dueDate).toLowerCase()}` : 'Hecho'
  toast(msg, {
    label: 'Deshacer',
    run: async () => {
      await db.transaction('rw', db.tasks, async () => {
        if (next) await db.tasks.delete(next.id)
        await db.tasks.update(task.id, { done: 0, completedAt: undefined, recurrence: task.recurrence })
      })
    },
  })
}

const BANGS = ['', '!', '!!', '!!!']

export const TaskItem = memo(function TaskItem({
  task,
  lookup,
  hideDate,
  hideProject,
  compact,
  draggable,
}: {
  task: Task
  lookup: Lookup
  hideDate?: boolean
  hideProject?: boolean
  compact?: boolean
  /** se puede arrastrar a otro día (Calendario, Próximo) */
  draggable?: boolean
}) {
  const selected = useUI((s) => s.selectedTaskId === task.id)
  const [completing, setCompleting] = useState(false)
  const checked = !!task.done || completing
  const t = today()
  const project = lookup.project(task.projectId)
  const area = lookup.area(task.areaId ?? project?.areaId)
  const subDone = task.subtasks.filter((s) => s.done).length

  const onToggle = () => {
    if (task.done) return void completeWithFeedback(task)
    setCompleting(true)
    setTimeout(() => {
      void completeWithFeedback(task)
      setCompleting(false)
    }, 520)
  }

  const meta: React.ReactNode[] = []
  if (task.dueDate && !hideDate) {
    meta.push(
      <span key="d" className="font-medium" style={{ color: task.done ? undefined : dateColor(task.dueDate, t) }}>
        {dateLabel(task.dueDate, t)}
      </span>,
    )
  }
  if (task.dueTime) {
    meta.push(
      <span key="t" className="inline-flex items-center gap-1">
        <Clock size={11} strokeWidth={2.4} />
        {task.dueTime}
      </span>,
    )
  }
  if (task.remindAt && !task.done && task.remindAt > Date.now()) {
    meta.push(<Bell key="b" size={11} strokeWidth={2.4} aria-label="Con aviso" />)
  }
  if (task.recurrence) {
    meta.push(
      <span key="r" className="inline-flex items-center gap-1" title={recurrenceLabel(task.recurrence)}>
        <Repeat size={11} strokeWidth={2.4} />
        {!compact && recurrenceLabel(task.recurrence)}
      </span>,
    )
  }
  if (task.subtasks.length) {
    meta.push(
      <span key="s" className="font-num inline-flex items-center gap-1">
        <ListChecks size={12} strokeWidth={2.2} />
        {subDone}/{task.subtasks.length}
      </span>,
    )
  }
  if (task.notes.trim()) meta.push(<StickyNote key="n" size={11} strokeWidth={2.4} />)
  if (!hideProject && (project || area)) {
    meta.push(
      <span key="p" className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-faint" />
        {project?.name ?? area?.name}
      </span>,
    )
  }
  for (const tag of task.tags) {
    meta.push(
      <a key={`#${tag}`} href={`#/tag/${encodeURIComponent(tag)}`} onClick={(e) => e.stopPropagation()} className="text-blue hover:underline">
        #{tag}
      </a>,
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      {...(draggable ? dragToDay(task) : {})}
      onClick={() => ui.openTask(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ui.openTask(task.id)
        if (e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
      className={cx(
        'group relative flex cursor-default items-start gap-3 px-4 outline-none transition-colors duration-150',
        draggable && 'select-none',
        compact ? 'py-2' : 'py-[11px]',
        selected ? 'bg-accent-soft' : 'hover:bg-hover focus-visible:bg-hover active:bg-press',
      )}
    >
      <div className="pt-px">
        <Checkbox checked={checked} onChange={onToggle} priority={task.priority} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cx(
            'text-[15px] leading-[21px] transition-colors duration-300',
            checked ? 'text-faint line-through decoration-[1.5px]' : 'text-fg',
          )}
        >
          {task.priority > 0 && !checked && (
            <span className="mr-1 font-bold" style={{ color: PRIORITY_COLOR[task.priority] }}>
              {BANGS[task.priority]}
            </span>
          )}
          {task.title || <span className="text-faint">Sin título</span>}
        </p>
        {meta.length > 0 && (
          <div className={cx('mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-muted', checked && 'opacity-50')}>
            {meta}
          </div>
        )}
      </div>
      <ChevronRight size={16} className="mt-0.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  )
})
