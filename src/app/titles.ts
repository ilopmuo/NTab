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
  menu: 'Menú',
  notes: 'Notas',
  people: 'Personas',
  projects: 'Proyectos',
  tags: 'Etiquetas',
  more: 'Más',
  someday: 'Algún día',
  lists: 'Listas inteligentes',
  matrix: 'Matriz',
  list: 'Lista inteligente',
  tag: 'Etiqueta',
  goals: 'Objetivos',
  finance: 'Pagos',
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
export function parentOf(path: string): string | undefined {
  const [s, raw] = path.split('/').filter(Boolean)
  if (!raw || depthOf(path) === 1) return undefined
  const id = decodeURIComponent(raw)
  switch (s) {
    case 'project': {
      const { projects, areas } = lookupNow()
      const areaId = projects.find((p) => p.id === id)?.areaId
      return areaId && areas.some((a) => a.id === areaId) ? `/area/${areaId}` : '/projects'
    }
    case 'area':
      return '/projects'
    case 'people':
      return '/people'
    case 'tag':
      return '/tags'
    case 'list':
      return '/lists'
    case 'notes':
      return '/notes'
  }
}

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
  return TITLES[s ?? 'today'] ?? 'Hoy'
}
