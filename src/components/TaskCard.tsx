import { m as motion } from 'motion/react'
import { ArrowRight, CalendarClock, ListChecks, MoreHorizontal } from 'lucide-react'
import type { Task } from '@/db/types'
import { useLookup } from '@/db/hooks'
import { dateLabel, today } from '@/lib/dates'
import { dateColor } from '@/lib/tasks'
import { ui } from '@/app/store'
import { Checkbox, completeWithFeedback } from './TaskItem'
import { useDragging } from './dayDrag'
import { Menu } from './Menu'
import { spring } from './ui'

/**
 * Tarjeta de tarea para los tableros (columnas de un proyecto, matriz de
 * Eisenhower): se arrastra con `drag` y, sin ratón, se mueve con «Mover a…».
 */
export function TaskCard({
  task,
  drag,
  moves,
  showProject,
}: {
  task: Task
  drag: { onPointerDown: (e: React.PointerEvent) => void; style: React.CSSProperties }
  /** destinos para el menú «Mover a…» */
  moves: { label: string; run: () => void }[]
  showProject?: boolean
}) {
  const dragging = useDragging(task.id)
  const { project } = useLookup()
  const t = today()
  const subDone = task.subtasks.filter((s) => s.done).length
  const where = showProject ? project(task.projectId)?.name : undefined
  const meta = [
    task.dueDate && (
      <span key="d" className="font-medium" style={{ color: dateColor(task.dueDate, t) }}>
        {dateLabel(task.dueDate)}
        {task.dueTime ? `, ${task.dueTime}` : ''}
      </span>
    ),
    task.deadline && (
      <span key="dl" className="inline-flex items-center gap-1 font-medium" style={{ color: dateColor(task.deadline, t) }}>
        <CalendarClock size={12} strokeWidth={2.4} aria-hidden />
        <span className="sr-only">Fecha límite: </span>
        {dateLabel(task.deadline)}
      </span>
    ),
    task.subtasks.length > 0 && (
      <span key="s" className="inline-flex items-center gap-1">
        <ListChecks size={12} strokeWidth={2.4} aria-hidden />
        {subDone}/{task.subtasks.length}
      </span>
    ),
    where && <span key="p">{where}</span>,
    ...task.tags.slice(0, 2).map((g) => <span key={`#${g}`}>#{g}</span>),
  ].filter(Boolean)
  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: dragging ? 0.4 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={spring}
      onPointerDown={drag.onPointerDown}
      style={drag.style}
      className="flex cursor-grab touch-pan-y items-start gap-2.5 rounded-[14px] bg-[var(--c-material)] py-2.5 pr-1.5 pl-3 shadow-[var(--c-shadow)] active:cursor-grabbing"
    >
      <span className="pt-0.5">
        <Checkbox checked={!!task.done} onChange={() => void completeWithFeedback(task)} priority={task.priority} size={20} label={`Completar «${task.title}»`} />
      </span>
      <button type="button" onClick={() => ui.openTask(task.id)} className="min-w-0 flex-1 text-left">
        <span className="block text-[15px] leading-snug break-words">{task.title}</span>
        {meta.length > 0 && <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[12.5px] text-muted">{meta}</span>}
      </button>
      {moves.length > 0 && (
        <Menu
          label={`Mover «${task.title}»`}
          trigger={<MoreHorizontal size={15} strokeWidth={2.4} />}
          className="shrink-0"
          items={moves.map((m) => ({ label: m.label, icon: <ArrowRight size={14} />, onSelect: m.run }))}
        />
      )}
    </motion.li>
  )
}
