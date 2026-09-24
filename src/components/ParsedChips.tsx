import { Bell, Calendar, Clock, Flag, Folder, Hash, Repeat } from 'lucide-react'
import type { ParsedTask } from '@/lib/parse'
import { useLookup } from '@/db/hooks'
import { dateLabel } from '@/lib/dates'
import { recurrenceLabel } from '@/lib/recurrence'
import { reminderLabel } from '@/lib/reminders'
import { PRIORITY_COLOR, PRIORITY_LABEL, dateColor } from '@/lib/tasks'
import { Icon } from './icons'
import { motion } from 'motion/react'
import { bouncy, cx } from './ui'

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  const c = color ?? 'var(--c-blue)'
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={bouncy}
      className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold"
      style={{ color: c, background: `color-mix(in srgb, ${c} 16%, transparent)` }}
    >
      {children}
    </motion.span>
  )
}

/** Vista previa de lo que el parser ha entendido */
export function ParsedChips({ parsed, className }: { parsed: ParsedTask; className?: string }) {
  const { project, area } = useLookup()
  const p = project(parsed.projectId)
  const a = area(parsed.areaId)
  const has = parsed.dueDate || parsed.dueTime || parsed.priority || parsed.tags.length || p || a || parsed.recurrence || parsed.reminder
  if (!has) return null
  return (
    <div className={cx('flex flex-wrap gap-1.5', className)}>
      {parsed.dueDate && (
        <Chip color={dateColor(parsed.dueDate)}>
          <Calendar size={13} strokeWidth={2.4} />
          {dateLabel(parsed.dueDate)}
        </Chip>
      )}
      {parsed.dueTime && (
        <Chip color="var(--c-teal)">
          <Clock size={13} strokeWidth={2.4} />
          {parsed.dueTime}
        </Chip>
      )}
      {parsed.reminder && (
        <Chip color="var(--c-blue)">
          <Bell size={13} strokeWidth={2.4} />
          {reminderLabel(parsed.reminder)}
        </Chip>
      )}
      {parsed.recurrence && (
        <Chip color="var(--c-gray)">
          <Repeat size={13} strokeWidth={2.4} />
          {recurrenceLabel(parsed.recurrence)}
        </Chip>
      )}
      {parsed.priority > 0 && (
        <Chip color={PRIORITY_COLOR[parsed.priority]}>
          <Flag size={13} strokeWidth={2.4} />
          {PRIORITY_LABEL[parsed.priority]}
        </Chip>
      )}
      {(p || a) && (
        <Chip color="var(--c-muted)">
          {p ? <Folder size={13} strokeWidth={2.4} /> : <Icon name={a!.icon} size={13} strokeWidth={2.4} />}
          {p?.name ?? a?.name}
        </Chip>
      )}
      {parsed.tags.map((t) => (
        <Chip key={t} color="var(--c-blue)">
          <Hash size={13} strokeWidth={2.6} />
          {t}
        </Chip>
      ))}
    </div>
  )
}
