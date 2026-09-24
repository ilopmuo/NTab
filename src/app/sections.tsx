import {
  Archive,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Flame,
  Inbox,
  Layers,
  type LucideIcon,
  RefreshCcw,
  Settings,
  StickyNote,
  Target,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react'
import { cx } from '@/components/ui'

/** Colores de sistema. Cada sección tiene uno fijo: ver docs/DESIGN.md */
export type Tint = 'blue' | 'orange' | 'red' | 'green' | 'teal' | 'indigo' | 'purple' | 'yellow' | 'pink' | 'gray'
export const tint = (t: Tint) => `var(--c-${t})`
export const soft = (t: Tint | string, pct = 18) =>
  `color-mix(in srgb, ${t.startsWith('#') || t.startsWith('var') ? t : tint(t as Tint)} ${pct}%, transparent)`

export interface SectionDef {
  id: string
  path: string
  label: string
  short: string
  icon: LucideIcon | 'today'
  tint: Tint
  /** tecla tras "G" */
  key: string
}

export const SECTIONS: SectionDef[] = [
  { id: 'today', path: '/today', label: 'Hoy', short: 'Hoy', icon: 'today', tint: 'blue', key: 'H' },
  { id: 'upcoming', path: '/upcoming', label: 'Próximo', short: 'Próximo', icon: CalendarClock, tint: 'blue', key: 'U' },
  { id: 'inbox', path: '/inbox', label: 'Bandeja de entrada', short: 'Bandeja', icon: Inbox, tint: 'blue', key: 'I' },
  { id: 'calendar', path: '/calendar', label: 'Calendario', short: 'Calendario', icon: CalendarDays, tint: 'blue', key: 'C' },
  { id: 'habits', path: '/habits', label: 'Hábitos', short: 'Hábitos', icon: Flame, tint: 'blue', key: 'B' },
  { id: 'notes', path: '/notes', label: 'Notas', short: 'Notas', icon: StickyNote, tint: 'blue', key: 'O' },
  { id: 'people', path: '/people', label: 'Personas', short: 'Personas', icon: Users, tint: 'blue', key: 'P' },
  { id: 'projects', path: '/projects', label: 'Proyectos', short: 'Proyectos', icon: Layers, tint: 'blue', key: 'J' },
  { id: 'templates', path: '/templates', label: 'Plantillas', short: 'Plantillas', icon: ClipboardList, tint: 'blue', key: 'M' },
  { id: 'goals', path: '/goals', label: 'Objetivos', short: 'Objetivos', icon: Target, tint: 'blue', key: 'T' },
  { id: 'finance', path: '/finance', label: 'Pagos', short: 'Pagos', icon: Wallet, tint: 'blue', key: 'F' },
  { id: 'review', path: '/review', label: 'Revisión semanal', short: 'Revisión', icon: RefreshCcw, tint: 'blue', key: 'R' },
  { id: 'trash', path: '/trash', label: 'Papelera', short: 'Papelera', icon: Trash2, tint: 'blue', key: 'X' },
  { id: 'logbook', path: '/logbook', label: 'Completadas', short: 'Completadas', icon: Archive, tint: 'blue', key: 'L' },
  { id: 'settings', path: '/settings', label: 'Ajustes', short: 'Ajustes', icon: Settings, tint: 'blue', key: 'S' },
]

export const section = (id: string) => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0]

/** Color de la vista actual (para el halo del fondo y la barra superior) */
export function routeTint(first: string | undefined): Tint {
  if (first === 'project' || first === 'area') return 'indigo'
  if (first === 'tag') return 'blue'
  return SECTIONS.find((s) => s.id === first)?.tint ?? 'blue'
}

/** Icono de sección: glifo sobre círculo gris neutro (monocromo) */
export function SectionIcon({
  def,
  size = 28,
  className,
  square,
}: {
  def: Pick<SectionDef, 'icon' | 'tint'>
  size?: number
  className?: string
  square?: boolean
}) {
  const glyph = Math.round(size * 0.52)
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center bg-fill text-fg', square ? 'rounded-[28%]' : 'rounded-full', className)}
      style={{ width: size, height: size }}
    >
      {def.icon === 'today' ? (
        <span className="font-num leading-none font-bold" style={{ fontSize: Math.round(size * 0.44) }}>
          {new Date().getDate()}
        </span>
      ) : (
        <def.icon size={glyph} strokeWidth={2.1} />
      )}
    </span>
  )
}
