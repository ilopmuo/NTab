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
  House,
  Inbox,
  Layers,
  ListChecks,
  ListFilter,
  type LucideIcon,
  Moon,
  Pill,
  RefreshCcw,
  Settings,
  ShoppingCart,
  SprayCan,
  StickyNote,
  Sun,
  Tags,
  Telescope,
  Target,
  Timer,
  Trash2,
  UserRoundCheck,
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
  /** tecla tras "G" (vacía: sin atajo) */
  key: string
}

export const SECTIONS: SectionDef[] = [
  { id: 'today', path: '/today', label: 'Hoy', short: 'Hoy', icon: 'today', tint: 'blue', key: 'H' },
  { id: 'upcoming', path: '/upcoming', label: 'Próximo', short: 'Próximo', icon: CalendarClock, tint: 'blue', key: 'U' },
  { id: 'inbox', path: '/inbox', label: 'Bandeja de entrada', short: 'Bandeja', icon: Inbox, tint: 'blue', key: 'I' },
  { id: 'calendar', path: '/calendar', label: 'Calendario', short: 'Calendario', icon: CalendarDays, tint: 'blue', key: 'C' },
  { id: 'habits', path: '/habits', label: 'Hábitos', short: 'Hábitos', icon: Flame, tint: 'blue', key: 'B' },
  { id: 'routines', path: '/routines', label: 'Rutinas', short: 'Rutinas', icon: ListChecks, tint: 'blue', key: 'E' },
  { id: 'focus', path: '/focus', label: 'Foco', short: 'Foco', icon: Timer, tint: 'blue', key: 'Q' },
  { id: 'notes', path: '/notes', label: 'Notas', short: 'Notas', icon: StickyNote, tint: 'blue', key: 'O' },
  { id: 'journal', path: '/journal', label: 'Diario', short: 'Diario', icon: BookOpen, tint: 'blue', key: 'D' },
  { id: 'house', path: '/house', label: 'Tareas de casa', short: 'Tareas', icon: SprayCan, tint: 'blue', key: '' },
  { id: 'menu', path: '/menu', label: 'Menú', short: 'Menú', icon: CookingPot, tint: 'blue', key: 'Z' },
  { id: 'shopping', path: '/shopping', label: 'Compra', short: 'Compra', icon: ShoppingCart, tint: 'blue', key: 'A' },
  { id: 'trackers', path: '/trackers', label: 'Última vez', short: 'Última vez', icon: History, tint: 'blue', key: 'V' },
  { id: 'meds', path: '/meds', label: 'Medicación', short: 'Medicación', icon: Pill, tint: 'blue', key: '' },
  { id: 'things', path: '/things', label: 'Cosas', short: 'Cosas', icon: Box, tint: 'blue', key: 'K' },
  { id: 'people', path: '/people', label: 'Personas', short: 'Personas', icon: Users, tint: 'blue', key: 'P' },
  { id: 'projects', path: '/projects', label: 'Proyectos', short: 'Proyectos', icon: Layers, tint: 'blue', key: 'J' },
  { id: 'tags', path: '/tags', label: 'Etiquetas', short: 'Etiquetas', icon: Tags, tint: 'blue', key: 'Y' },
  { id: 'lists', path: '/lists', label: 'Listas inteligentes', short: 'Listas', icon: ListFilter, tint: 'blue', key: '' },
  { id: 'matrix', path: '/matrix', label: 'Matriz de Eisenhower', short: 'Matriz', icon: Grid2x2, tint: 'blue', key: '' },
  { id: 'someday', path: '/someday', label: 'Algún día', short: 'Algún día', icon: Telescope, tint: 'blue', key: '' },
  { id: 'waiting', path: '/waiting', label: 'A la espera', short: 'A la espera', icon: UserRoundCheck, tint: 'blue', key: '' },
  { id: 'templates', path: '/templates', label: 'Plantillas', short: 'Plantillas', icon: ClipboardList, tint: 'blue', key: 'M' },
  { id: 'goals', path: '/goals', label: 'Objetivos', short: 'Objetivos', icon: Target, tint: 'blue', key: 'T' },
  { id: 'expenses', path: '/expenses', label: 'Gastos', short: 'Gastos', icon: Receipt, tint: 'blue', key: 'W' },
  { id: 'finance', path: '/finance', label: 'Pagos', short: 'Pagos', icon: Wallet, tint: 'blue', key: 'F' },
  { id: 'plan', path: '/plan', label: 'Planificar el día', short: 'Planificar', icon: Sun, tint: 'blue', key: '' },
  { id: 'shutdown', path: '/shutdown', label: 'Cerrar el día', short: 'Cerrar el día', icon: Moon, tint: 'blue', key: '' },
  { id: 'review', path: '/review', label: 'Revisión semanal', short: 'Revisión', icon: RefreshCcw, tint: 'blue', key: 'R' },
  { id: 'trash', path: '/trash', label: 'Papelera', short: 'Papelera', icon: Trash2, tint: 'blue', key: 'X' },
  { id: 'logbook', path: '/logbook', label: 'Completadas', short: 'Completadas', icon: Archive, tint: 'blue', key: 'L' },
  { id: 'settings', path: '/settings', label: 'Ajustes', short: 'Ajustes', icon: Settings, tint: 'blue', key: 'S' },
]

export const section = (id: string) => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0]

/**
 * Espacios: lo que sale en la barra lateral, en «Más» y en las pestañas del
 * móvil. Cada uno junta secciones que van juntas (Compra, Menú y Cosas son
 * «Casa»); dentro, se cambia entre ellas con las pestañas de arriba.
 */
export interface HubDef {
  id: string
  label: string
  short: string
  icon: LucideIcon | 'today'
  tint: Tint
  /** secciones del espacio, con el nombre corto de su pestaña */
  tabs: { id: string; label: string }[]
}

const hubDef = (id: string, label: string, short: string, icon: HubDef['icon'], tabs: [string, string][]): HubDef => ({
  id,
  label,
  short,
  icon,
  tint: 'blue',
  tabs: tabs.map(([id, label]) => ({ id, label })),
})

export const HUBS: HubDef[] = [
  hubDef('today', 'Hoy', 'Hoy', 'today', [['today', 'Hoy']]),
  hubDef('inbox', 'Bandeja de entrada', 'Bandeja', Inbox, [['inbox', 'Bandeja'], ['someday', 'Algún día'], ['waiting', 'A la espera']]),
  hubDef('calendar', 'Calendario', 'Calendario', CalendarDays, [['calendar', 'Calendario'], ['upcoming', 'Próximo']]),
  hubDef('plan', 'Planificar', 'Planificar', Sun, [['plan', 'Día'], ['focus', 'Foco'], ['shutdown', 'Cierre'], ['review', 'Semana']]),
  hubDef('projects', 'Proyectos', 'Proyectos', Layers, [['projects', 'Proyectos'], ['goals', 'Objetivos'], ['templates', 'Plantillas']]),
  hubDef('filters', 'Etiquetas y filtros', 'Filtros', Tags, [['tags', 'Etiquetas'], ['lists', 'Filtros'], ['matrix', 'Matriz']]),
  hubDef('notes', 'Notas', 'Notas', StickyNote, [['notes', 'Notas'], ['journal', 'Diario']]),
  hubDef('habits', 'Hábitos', 'Hábitos', Flame, [['habits', 'Hábitos'], ['routines', 'Rutinas'], ['trackers', 'Última vez'], ['meds', 'Medicación']]),
  hubDef('people', 'Personas', 'Personas', Users, [['people', 'Personas']]),
  hubDef('home', 'Casa', 'Casa', House, [['house', 'Tareas'], ['shopping', 'Compra'], ['menu', 'Menú'], ['things', 'Cosas']]),
  hubDef('money', 'Dinero', 'Dinero', Wallet, [['expenses', 'Gastos'], ['finance', 'Pagos']]),
]

export const hub = (id: string) => HUBS.find((h) => h.id === id) ?? HUBS[0]

/** La sección de una ruta: la página de una etiqueta o de una lista inteligente cuenta como la suya */
const OWNER: Record<string, string> = { tag: 'tags', list: 'lists' }
export const sectionOfRoute = (first: string | undefined) => (first ? (OWNER[first] ?? first) : 'today')

/** El espacio de una sección (las del pie, Completadas, Papelera y Ajustes, no tienen) */
export const hubOf = (sectionId: string) => HUBS.find((h) => h.tabs.some((t) => t.id === sectionId))

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
