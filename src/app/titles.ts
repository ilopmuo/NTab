import { lookupNow } from '@/db/hooks'
import { depthOf } from './router'

/** El nombre de cada pantalla (pestaña del navegador, lector de pantalla y botón de volver) */
export const TITLES: Record<string, string> = {
  today: 'Hoy',
  inbox: 'Bandeja',
  upcoming: 'Próximo',
  calendar: 'Calendario',
  habits: 'Hábitos',
  routines: 'Rutinas',
  focus: 'Foco',
  house: 'Tareas de casa',
  piso: 'Piso',
  things: 'Cosas',
  trackers: 'Última vez',
  meds: 'Medicación',
  waiting: 'A la espera',
  shopping: 'Compra',
  journal: 'Diario',
  expenses: 'Gastos',
  money: 'Dinero',
  insights: 'Análisis',
  accounts: 'Cuentas',
  menu: 'Menú',
  notes: 'Notas',
  people: 'Personas',
  projects: 'Proyectos',
  tags: 'Listas',
  more: 'Más',
  someday: 'Algún día',
  lists: 'Listas',
  matrix: 'Matriz',
  list: 'Filtro',
  tag: 'Etiqueta',
  goals: 'Objetivos',
  finance: 'Pagos fijos',
  review: 'Revisión',
  plan: 'Planificar el día',
  shutdown: 'Cerrar el día',
  logbook: 'Completadas',
  trash: 'Papelera',
  templates: 'Plantillas',
  settings: 'Ajustes',
}

/**
 * De qué pantalla cuelga cada una: un proyecto, de su área (o de Proyectos);
 * una persona, de Personas; una etiqueta, de Etiquetas… Las de la barra no
 * cuelgan de nada.
 */
/** El lugar de cada página sin id que vive dentro de otro */
const HOME_OF: Record<string, string> = {
  someday: '/lists',
  waiting: '/lists',
  logbook: '/lists',
  matrix: '/lists',
  goals: '/projects',
  insights: '/money',
  templates: '/projects',
  plan: '/today',
  focus: '/today',
  shutdown: '/today',
  review: '/today',
}

export function parentOf(path: string): string | undefined {
  const [s, raw] = path.split('/').filter(Boolean)
  if (depthOf(path) === 1) return undefined
  if (!raw) return HOME_OF[s]
  const id = decodeURIComponent(raw)
  switch (s) {
    case 'project': {
      const { projects, areas } = lookupNow()
      const areaId = projects.find((p) => p.id === id)?.areaId
      return areaId && areas.some((a) => a.id === areaId) ? `/area/${areaId}` : '/projects'
    }
    case 'area':
      return '/projects'
    case 'insights':
      return '/insights'
    case 'people':
      return '/people'
    case 'tag':
    case 'list':
      return '/lists'
    case 'notes':
      return '/notes'
    case 'settings':
      return '/settings'
  }
}

/** Los apartados de Ajustes, en el orden de su portada (`/settings/<apartado>`) */
export const SETTINGS_PAGES = {
  avisos: 'Avisos',
  apariencia: 'Apariencia',
  funciones: 'Funciones y navegación',
  areas: 'Áreas de vida',
  calendarios: 'Calendarios',
  conectar: 'Claude y Siri',
  datos: 'Tus datos',
} as const

/** Cómo se llama la pantalla de una ruta: «Hoy», el nombre del proyecto, «#casa»… */
export function titleOf(path: string): string {
  const [s, raw] = path.split('/').filter(Boolean)
  const id = raw && decodeURIComponent(raw)
  const { projects, areas, people } = lookupNow()
  if (s === 'project' && id) return projects.find((p) => p.id === id)?.name ?? 'Proyecto'
  if (s === 'area' && id) return areas.find((a) => a.id === id)?.name ?? 'Área'
  if (s === 'people' && id) return people.find((p) => p.id === id)?.name.split(' ')[0] ?? 'Persona'
  if (s === 'tag' && id) return `#${id}`
  if (s === 'list' && id) return 'Lista'
  if (s === 'settings' && id) return SETTINGS_PAGES[id as keyof typeof SETTINGS_PAGES] ?? 'Ajustes'
  return TITLES[s ?? 'today'] ?? 'Hoy'
}
