import {
  Archive,
  Box,
  BookOpen,
  CookingPot,
  Receipt,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Flame,
  Grid2x2,
  History,
  Inbox,
  Layers,
  ListChecks,
  ListFilter,
  type LucideIcon,
  RefreshCcw,
  Settings,
  ShoppingCart,
  StickyNote,
  Tags,
  Telescope,
  Target,
  Timer,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react'
import { cx } from '@/components/ui'
import { hue, ink, onHue, softHue, type Hue } from '@/lib/hues'
import type { FeatureGroup } from '@/lib/features'

/** Color de módulo. Cada sección tiene uno fijo: ver docs/REDISENO.md */
export type Tint = Hue
/** Tono sólido (baldosas, anillos, barras) */
export const tint = (t: Tint) => hue(t)
/** Tono para texto de color (contraste AA) */
export const tintInk = (t: Tint) => ink(t)
export const soft = (t: Tint | string, pct = 18) => softHue(t, pct)

export interface SectionDef {
  id: string
  path: string
  label: string
  short: string
  icon: LucideIcon | 'today'
  tint: Tint
  /** tecla tras "G" (vacía: sin atajo) */
  key: string
  /** grupo en la barra lateral y en «Más»; las esenciales no llevan */
  group?: FeatureGroup
}

export const SECTIONS: SectionDef[] = [
  { id: 'today', path: '/today', label: 'Hoy', short: 'Hoy', icon: 'today', tint: 'blue', key: 'H' },
  { id: 'upcoming', path: '/upcoming', label: 'Próximo', short: 'Próximo', icon: CalendarClock, tint: 'red', key: 'U' },
  { id: 'inbox', path: '/inbox', label: 'Bandeja de entrada', short: 'Bandeja', icon: Inbox, tint: 'sky', key: 'I' },
  { id: 'calendar', path: '/calendar', label: 'Calendario', short: 'Calendario', icon: CalendarDays, tint: 'pink', key: 'C' },
  { id: 'habits', path: '/habits', label: 'Hábitos', short: 'Hábitos', icon: Flame, tint: 'orange', key: 'B', group: 'life' },
  { id: 'routines', path: '/routines', label: 'Rutinas', short: 'Rutinas', icon: ListChecks, tint: 'teal', key: 'E', group: 'life' },
  { id: 'focus', path: '/focus', label: 'Foco', short: 'Foco', icon: Timer, tint: 'indigo', key: 'Q', group: 'organize' },
  { id: 'notes', path: '/notes', label: 'Notas', short: 'Notas', icon: StickyNote, tint: 'yellow', key: 'O', group: 'organize' },
  { id: 'journal', path: '/journal', label: 'Diario', short: 'Diario', icon: BookOpen, tint: 'purple', key: 'D', group: 'life' },
  { id: 'menu', path: '/menu', label: 'Menú', short: 'Menú', icon: CookingPot, tint: 'orange', key: 'Z', group: 'home' },
  { id: 'shopping', path: '/shopping', label: 'Compra', short: 'Compra', icon: ShoppingCart, tint: 'green', key: 'A', group: 'home' },
  { id: 'trackers', path: '/trackers', label: 'Última vez', short: 'Última vez', icon: History, tint: 'brown', key: 'V', group: 'life' },
  { id: 'things', path: '/things', label: 'Cosas', short: 'Cosas', icon: Box, tint: 'teal', key: 'K', group: 'home' },
  { id: 'people', path: '/people', label: 'Personas', short: 'Personas', icon: Users, tint: 'green', key: 'P', group: 'life' },
  { id: 'projects', path: '/projects', label: 'Proyectos', short: 'Proyectos', icon: Layers, tint: 'blue', key: 'J', group: 'organize' },
  { id: 'tags', path: '/tags', label: 'Etiquetas', short: 'Etiquetas', icon: Tags, tint: 'gray', key: 'Y', group: 'organize' },
  { id: 'lists', path: '/lists', label: 'Listas inteligentes', short: 'Listas', icon: ListFilter, tint: 'teal', key: '', group: 'organize' },
  { id: 'matrix', path: '/matrix', label: 'Matriz de Eisenhower', short: 'Matriz', icon: Grid2x2, tint: 'orange', key: '', group: 'organize' },
  { id: 'someday', path: '/someday', label: 'Algún día', short: 'Algún día', icon: Telescope, tint: 'brown', key: '', group: 'organize' },
  { id: 'templates', path: '/templates', label: 'Plantillas', short: 'Plantillas', icon: ClipboardList, tint: 'gray', key: 'M', group: 'organize' },
  { id: 'goals', path: '/goals', label: 'Objetivos', short: 'Objetivos', icon: Target, tint: 'red', key: 'T', group: 'organize' },
  { id: 'expenses', path: '/expenses', label: 'Gastos', short: 'Gastos', icon: Receipt, tint: 'mint', key: 'W', group: 'money' },
  { id: 'finance', path: '/finance', label: 'Pagos', short: 'Pagos', icon: Wallet, tint: 'blue', key: 'F', group: 'money' },
  { id: 'review', path: '/review', label: 'Revisión semanal', short: 'Revisión', icon: RefreshCcw, tint: 'mint', key: 'R', group: 'organize' },
  { id: 'trash', path: '/trash', label: 'Papelera', short: 'Papelera', icon: Trash2, tint: 'gray', key: 'X' },
  { id: 'logbook', path: '/logbook', label: 'Completadas', short: 'Completadas', icon: Archive, tint: 'green', key: 'L' },
  { id: 'settings', path: '/settings', label: 'Ajustes', short: 'Ajustes', icon: Settings, tint: 'gray', key: 'S' },
]

export const section = (id: string) => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0]

/** Color de la vista actual (para el halo del fondo y la barra superior) */
export function routeTint(first: string | undefined): Tint {
  if (first === 'project' || first === 'area') return section('projects').tint
  if (first === 'list') return section('lists').tint
  if (first === 'tag') return 'gray'
  if (first === 'plan') return 'orange'
  if (first === 'shutdown') return 'indigo'
  if (first === 'more') return 'gray'
  return SECTIONS.find((s) => s.id === first)?.tint ?? 'blue'
}

/** Icono de sección: glifo blanco sobre la baldosa del color del módulo (como Ajustes de iOS) */
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
      className={cx('inline-flex shrink-0 items-center justify-center', square ? 'rounded-[28%]' : 'rounded-full', className)}
      style={{
        width: size,
        height: size,
        // Hoy lleva el día escrito: su baldosa es la del acento (texto blanco con contraste AA)
        color: def.icon === 'today' ? '#ffffff' : onHue(def.tint),
        background:
          def.icon === 'today' ? 'var(--c-accent-fill)' : `linear-gradient(180deg, color-mix(in srgb, ${hue(def.tint)} 80%, white), ${hue(def.tint)} 70%)`,
        boxShadow: 'inset 0 0.5px 0 rgb(255 255 255 / 0.3)',
      }}
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
