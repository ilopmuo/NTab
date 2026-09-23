import { memo, useState } from 'react'
import { AlignLeft, Calendar, Clock, ListChecks, Repeat } from 'lucide-react'
import type { Task } from '@/db/types'
import { db } from '@/db/db'
import type { Lookup } from '@/db/hooks'
import { toggleTask } from '@/db/actions'
import { dateLabel, today } from '@/lib/dates'
import { PRIORITY_COLOR } from '@/lib/tasks'
import { recurrenceLabel } from '@/lib/recurrence'
import { toast, ui, useUI } from '@/app/store'
import { Icon } from './icons'
import { cx } from './ui'

export function Checkbox({
  checked,
  onChange,
  priority = 0,
  size = 20,
  label,
}: {
  checked: boolean
  onChange: () => void
  priority?: number
  size?: number
  label?: string
}) {
  const color = checked ? 'var(--c-lime)' : priority ? PRIORITY_COLOR[priority] : 'var(--c-border-strong)'
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? 'Marcar como pendiente' : 'Completar')}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className="group/cb relative flex shrink-0 items-center justify-center rounded-full transition-all"
      style={{
        width: size,
        height: size,
        border: `1.5px solid ${color}`,
        background: checked ? 'var(--c-lime)' : priority ? `color-mix(in srgb, ${color} 10%, transparent)` : 'transparent',
      }}
    >
      <svg
        viewBox="0 0 16 16"
        className={cx('transition-opacity', checked ? 'animate-check opacity-100' : 'opacity-0 group-hover/cb:opacity-40')}
        style={{ width: size * 0.62, height: size * 0.62 }}
      >
        <path
          d="M3.5 8.5l3 3 6-6.5"
          fill="none"
          stroke={checked ? '#000' : color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

export async function completeWithFeedback(task: Task) {
  const wasDone = !!task.done
  const next = await toggleTask(task)
  if (wasDone) return
  const msg = next?.dueDate ? `Completada · próxima ${dateLabel(next.dueDate).toLowerCase()}` : 'Completada'
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

export const TaskItem = memo(function TaskItem({
  task,
  lookup,
  hideDate,
  hideProject,
}: {
  task: Task
  lookup: Lookup
  hideDate?: boolean
  hideProject?: boolean
}) {
  const selected = useUI((s) => s.selectedTaskId === task.id)
  const [completing, setCompleting] = useState(false)
  const checked = !!task.done || completing
  const t = today()
  const overdue = !task.done && task.dueDate && task.dueDate < t
  const project = lookup.project(task.projectId)
  const area = lookup.area(task.areaId ?? project?.areaId)
  const subDone = task.subtasks.filter((s) => s.done).length

  const onToggle = () => {
    if (task.done) return void completeWithFeedback(task)
    setCompleting(true)
    setTimeout(() => {
      void completeWithFeedback(task)
      setCompleting(false)
    }, 380)
  }

  const meta: React.ReactNode[] = []
  if (task.dueDate && !hideDate) {
    meta.push(
      <span key="d" className={cx('inline-flex items-center gap-1', overdue ? 'text-danger' : task.dueDate === t ? 'text-accent' : '')}>
        <Calendar size={12} strokeWidth={2} />
        {dateLabel(task.dueDate, t)}
      </span>,
    )
  }
  if (task.dueTime) {
    meta.push(
      <span key="t" className="inline-flex items-center gap-1">
        <Clock size={12} strokeWidth={2} />
        {task.dueTime}
      </span>,
    )
  }
  if (task.recurrence) {
    meta.push(
      <span key="r" className="inline-flex items-center gap-1" title={recurrenceLabel(task.recurrence)}>
        <Repeat size={12} strokeWidth={2} />
      </span>,
    )
  }
  if (task.subtasks.length) {
    meta.push(
      <span key="s" className="inline-flex items-center gap-1 tabular-nums">
        <ListChecks size={12} strokeWidth={2} />
        {subDone}/{task.subtasks.length}
      </span>,
    )
  }
  if (task.notes.trim()) meta.push(<AlignLeft key="n" size={12} strokeWidth={2} />)
  for (const tag of task.tags) {
    meta.push(
      <a key={`#${tag}`} href={`#/tag/${encodeURIComponent(tag)}`} onClick={(e) => e.stopPropagation()} className="hover:text-fg">
        #{tag}
      </a>,
    )
  }

  const where = !hideProject && (project || area)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => ui.openTask(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ui.openTask(task.id)
        if (e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
      className={cx(
        'group flex cursor-default items-start gap-3 rounded-xl px-3 py-2.5 transition-all outline-none',
        selected ? 'bg-accent-soft' : 'hover:bg-hover focus-visible:bg-hover',
        completing && 'opacity-50',
      )}
    >
      <div className="pt-px">
        <Checkbox checked={checked} onChange={onToggle} priority={task.priority} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            className={cx(
              'min-w-0 flex-1 text-[14px] leading-[20px] transition-colors',
              checked ? 'text-faint line-through decoration-faint' : 'text-fg',
            )}
          >
            {task.title || <span className="text-faint">Sin título</span>}
          </p>
          {where && (
            <span className="hidden shrink-0 items-center gap-1.5 text-[12px] text-muted sm:inline-flex">
              {area && <Icon name={area.icon} size={12} style={{ color: area.color }} />}
              <span className="max-w-40 truncate">{project?.name ?? area?.name}</span>
            </span>
          )}
        </div>
        {meta.length > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">{meta}</div>
        )}
      </div>
    </div>
  )
})
