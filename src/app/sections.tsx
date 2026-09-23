import {
  Archive,
  CalendarClock,
  CalendarDays,
  Flame,
  Inbox,
  Layers,
  type LucideIcon,
  RefreshCcw,
  Settings,
  StickyNote,
  Users,
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
  { id: 'upcoming', path: '/upcoming', label: 'Próximo', short: 'Próximo', icon: CalendarClock, tint: 'orange', key: 'U' },
  { id: 'inbox', path: '/inbox', label: 'Bandeja de entrada', short: 'Bandeja', icon: Inbox, tint: 'gray', key: 'I' },
  { id: 'calendar', path: '/calendar', label: 'Calendario', short: 'Calendario', icon: CalendarDays, tint: 'teal', key: 'C' },
  { id: 'habits', path: '/habits', label: 'Hábitos', short: 'Hábitos', icon: Flame, tint: 'green', key: 'B' },
  { id: 'notes', path: '/notes', label: 'Notas', short: 'Notas', icon: StickyNote, tint: 'yellow', key: 'O' },
  { id: 'people', path: '/people', label: 'Personas', short: 'Personas', icon: Users, tint: 'purple', key: 'P' },
  { id: 'projects', path: '/projects', label: 'Proyectos', short: 'Proyectos', icon: Layers, tint: 'indigo', key: 'J' },
  { id: 'review', path: '/review', label: 'Revisión semanal', short: 'Revisión', icon: RefreshCcw, tint: 'indigo', key: 'R' },
  { id: 'logbook', path: '/logbook', label: 'Completadas', short: 'Completadas', icon: Archive, tint: 'gray', key: 'L' },
  { id: 'settings', path: '/settings', label: 'Ajustes', short: 'Ajustes', icon: Settings, tint: 'gray', key: 'S' },
]

export const section = (id: string) => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0]

/** Color de la vista actual (para el halo del fondo y la barra superior) */
export function routeTint(first: string | undefined): Tint {
  if (first === 'project' || first === 'area') return 'indigo'
  if (first === 'tag') return 'blue'
  return SECTIONS.find((s) => s.id === first)?.tint ?? 'blue'
}

/** Icono redondo de color con glifo blanco, como en Recordatorios y Ajustes */
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
  const glyph = Math.round(size * 0.56)
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center text-white', square ? 'rounded-[28%]' : 'rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(180deg, color-mix(in srgb, ${tint(def.tint)} 88%, white), ${tint(def.tint)})`,
        boxShadow: `0 1px 2px color-mix(in srgb, ${tint(def.tint)} 40%, transparent)`,
      }}
    >
      {def.icon === 'today' ? (
        <span className="font-num leading-none font-bold" style={{ fontSize: Math.round(size * 0.46) }}>
          {new Date().getDate()}
        </span>
      ) : (
        <def.icon size={glyph} strokeWidth={2.3} />
      )}
    </span>
  )
}
