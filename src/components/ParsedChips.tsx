import { Calendar, Clock, Flag, Folder, Hash, Repeat } from 'lucide-react'
import type { ParsedTask } from '@/lib/parse'
import { useLookup } from '@/db/hooks'
import { dateLabel } from '@/lib/dates'
import { recurrenceLabel } from '@/lib/recurrence'
import { PRIORITY_COLOR, PRIORITY_LABEL } from '@/lib/tasks'
import { Icon } from './icons'
import { cx } from './ui'

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-medium animate-pop-in"
      style={{
        color: color ?? 'var(--c-accent)',
        background: `color-mix(in srgb, ${color ?? 'var(--c-accent)'} 14%, transparent)`,
      }}
    >
      {children}
    </span>
  )
}

/** Vista previa de lo que el parser ha entendido */
export function ParsedChips({ parsed, className }: { parsed: ParsedTask; className?: string }) {
  const { project, area } = useLookup()
  const p = project(parsed.projectId)
  const a = area(parsed.areaId)
  const has = parsed.dueDate || parsed.dueTime || parsed.priority || parsed.tags.length || p || a || parsed.recurrence
  if (!has) return null
  return (
    <div className={cx('flex flex-wrap gap-1.5', className)}>
      {parsed.dueDate && (
        <Chip>
          <Calendar size={12} />
          {dateLabel(parsed.dueDate)}
        </Chip>
      )}
      {parsed.dueTime && (
        <Chip>
          <Clock size={12} />
          {parsed.dueTime}
        </Chip>
      )}
      {parsed.recurrence && (
        <Chip color="var(--c-lime)">
          <Repeat size={12} />
          {recurrenceLabel(parsed.recurrence)}
        </Chip>
      )}
      {parsed.priority > 0 && (
        <Chip color={PRIORITY_COLOR[parsed.priority]}>
          <Flag size={12} />
          {PRIORITY_LABEL[parsed.priority]}
        </Chip>
      )}
      {(p || a) && (
        <Chip color={a?.color ?? p?.color}>
          {p ? <Folder size={12} /> : <Icon name={a!.icon} size={12} />}
          {p?.name ?? a?.name}
        </Chip>
      )}
      {parsed.tags.map((t) => (
        <Chip key={t} color="var(--c-muted)">
          <Hash size={12} />
          {t}
        </Chip>
      ))}
    </div>
  )
}
