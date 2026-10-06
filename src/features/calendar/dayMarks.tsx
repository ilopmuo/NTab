import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CreditCard, Flag, Hourglass, Layers } from 'lucide-react'
import { db } from '@/db/db'
import type { Task } from '@/db/types'
import { advanceCharge, money } from '@/lib/finance'
import { ui } from '@/app/store'
import { cx } from '@/components/ui'

/**
 * Lo demás que tiene fecha y no es una tarea de ese día: fechas límite de
 * tareas y proyectos, cargos y fines de prueba de los pagos y las cuentas
 * atrás. Así el Calendario enseña todo lo que pasa cada día.
 */
export interface DayMark {
  id: string
  date: string
  kind: 'deadline' | 'project' | 'payment' | 'countdown'
  label: string
  href?: string
  taskId?: string
}

const ICON = { deadline: Flag, project: Layers, payment: CreditCard, countdown: Hourglass } as const
// Monocromo (ver docs/DESIGN.md): lo que tiene que estar, en texto fuerte; lo demás, en gris
const TONE = { deadline: 'text-fg', project: 'text-fg', payment: 'text-muted', countdown: 'text-muted' } as const

/** `byWhenDue`: las tareas ya salen el día que llegue antes (la vista Lista), y su límite solo se marca si es otro día */
export function useDayMarks(start: string, end: string, open: Task[] | undefined, byWhenDue = false): Map<string, DayMark[]> {
  const data = useLiveQuery(
    () =>
      Promise.all([
        db.projects.filter((p) => p.status === 'active' && !!p.deadline && p.deadline >= start && p.deadline <= end).toArray(),
        db.subscriptions.filter((s) => s.active).toArray(),
        db.countdowns.where('date').between(start, end, true, true).toArray(),
      ]),
    [start, end],
  )
  return useMemo(() => {
    const marks: DayMark[] = []
    // La fecha límite de una tarea, si la tarea sale otro día
    for (const t of open ?? [])
      if (t.deadline && t.deadline >= start && t.deadline <= end && (byWhenDue ? !!t.dueDate && t.dueDate < t.deadline : t.deadline !== t.dueDate)) marks.push({ id: `d:${t.id}`, date: t.deadline, kind: 'deadline', label: `Límite: ${t.title}`, taskId: t.id })
    const [projects = [], subs = [], countdowns = []] = data ?? []
    for (const p of projects) marks.push({ id: `p:${p.id}`, date: p.deadline!, kind: 'project', label: `Límite de «${p.name}»`, href: `#/project/${p.id}` })
    for (const s of subs) {
      if (s.trialEnds && s.trialEnds >= start && s.trialEnds <= end) marks.push({ id: `t:${s.id}`, date: s.trialEnds, kind: 'payment', label: `Acaba la prueba de ${s.name}`, href: '#/finance' })
      let d = s.nextDate
      for (let i = 0; d < start && i < 500; i++) d = advanceCharge(d, s.cycle, s.anchorDay)
      for (let i = 0; d <= end && i < 60; i++, d = advanceCharge(d, s.cycle, s.anchorDay))
        if (d !== s.trialEnds) marks.push({ id: `s:${s.id}:${d}`, date: d, kind: 'payment', label: `${s.name} · ${money(s.amount, s.currency)}`, href: '#/finance' })
    }
    for (const c of countdowns) marks.push({ id: `c:${c.id}`, date: c.date, kind: 'countdown', label: `${c.icon ? `${c.icon} ` : ''}${c.name}` })
    const byDay = new Map<string, DayMark[]>()
    for (const m of marks) byDay.set(m.date, [...(byDay.get(m.date) ?? []), m])
    return byDay
  }, [data, open, start, end, byWhenDue])
}

/** Una marca en una fila (en el panel del día, la semana y la vista Día) */
export function MarkRow({ mark, small }: { mark: DayMark; small?: boolean }) {
  const Icon = ICON[mark.kind]
  const cls = cx('flex w-full items-center gap-1.5 truncate text-left font-semibold', small ? 'px-1 text-[11.5px]' : 'px-1.5 py-1 text-[12.5px]', TONE[mark.kind])
  const body = (
    <>
      <Icon size={small ? 11 : 12} strokeWidth={2.4} className="shrink-0" aria-hidden />
      <span className="truncate">{mark.label}</span>
    </>
  )
  if (mark.taskId)
    return (
      <button type="button" data-day-mark={mark.kind} onClick={() => ui.openTask(mark.taskId!)} className={cls}>
        {body}
      </button>
    )
  return mark.href ? (
    <a href={mark.href} data-day-mark={mark.kind} className={cls}>
      {body}
    </a>
  ) : (
    <p data-day-mark={mark.kind} className={cls}>
      {body}
    </p>
  )
}

/** En la celda del mes, solo los iconos (uno por tipo) */
export function MarkIcons({ marks }: { marks: DayMark[] }) {
  const kinds = [...new Set(marks.map((m) => m.kind))]
  if (!kinds.length) return null
  return (
    <span className="flex items-center gap-0.5" title={marks.map((m) => m.label).join('\n')}>
      {kinds.map((k) => {
        const Icon = ICON[k]
        return <Icon key={k} size={12} strokeWidth={2.4} className={TONE[k]} aria-hidden />
      })}
    </span>
  )
}
