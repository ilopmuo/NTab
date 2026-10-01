import type { Task } from '@/db/types'
import { addDaysYmd, today as todayYmd } from './dates'
import { isSomeday, whenDue } from './tasks'

/**
 * Listas inteligentes (como los filtros de Todoist, las listas inteligentes de
 * TickTick o las perspectivas de OmniFocus): una búsqueda guardada que siempre
 * está al día. Todas las condiciones se cumplen a la vez; las que no se ponen,
 * no filtran. Se guardan en el ajuste `smartLists` (sincronizado).
 */
export type SmartWhen = 'overdue' | 'today' | 'week' | 'nodate' | 'deadline' | 'someday'

export interface SmartList {
  id: string
  name: string
  when?: SmartWhen
  /** prioridad mínima (1 = baja … 3 = alta) */
  minPriority?: number
  /** tiene alguna de estas etiquetas */
  tags?: string[]
  /** 'p:<id>' (proyecto) o 'a:<id>' (área, con sus proyectos) */
  list?: string
  /** relacionada con esta persona */
  person?: string
  /** duración estimada máxima, en minutos */
  maxEstimate?: number
}

export const WHEN_LABEL: Record<SmartWhen, string> = {
  overdue: 'Atrasadas',
  today: 'Hasta hoy',
  week: 'Próximos 7 días',
  nodate: 'Sin fecha',
  deadline: 'Con fecha límite',
  someday: 'Algún día',
}

/** Ideas para empezar */
export const PRESETS: Omit<SmartList, 'id'>[] = [
  { name: 'Prioridad alta', minPriority: 3 },
  { name: 'Rápidas', maxEstimate: 15 },
  { name: 'Sin fecha', when: 'nodate' },
  { name: 'Con fecha límite', when: 'deadline' },
]

export function matches(l: SmartList, t: Task, ref = todayYmd()): boolean {
  if (t.done) return false
  // «Algún día» solo sale si se pide
  if (isSomeday(t) && l.when !== 'someday') return false
  const d = whenDue(t)
  switch (l.when) {
    case 'overdue':
      if (!d || d >= ref) return false
      break
    case 'today':
      if (!d || d > ref) return false
      break
    case 'week':
      if (!d || d > addDaysYmd(ref, 7)) return false
      break
    case 'nodate':
      if (t.dueDate || t.deadline) return false
      break
    case 'deadline':
      if (!t.deadline) return false
      break
    case 'someday':
      if (!isSomeday(t)) return false
      break
  }
  if (l.minPriority && t.priority < l.minPriority) return false
  if (l.tags?.length && !l.tags.some((g) => t.tags.includes(g))) return false
  if (l.list?.startsWith('p:') && t.projectId !== l.list.slice(2)) return false
  if (l.list?.startsWith('a:') && t.areaId !== l.list.slice(2)) return false
  if (l.person && !t.people?.includes(l.person)) return false
  if (l.maxEstimate && (!t.estimate || t.estimate > l.maxEstimate)) return false
  return true
}

export const filterTasks = (l: SmartList, tasks: Task[], ref = todayYmd()) => tasks.filter((t) => matches(l, t, ref))

/** «Prioridad alta · #trabajo · próximos 7 días · 15 min o menos» */
export function describe(l: SmartList, names: { list?: (v: string) => string | undefined; person?: (id: string) => string | undefined } = {}): string {
  const parts: string[] = []
  if (l.when) parts.push(WHEN_LABEL[l.when])
  if (l.minPriority) parts.push(['', 'Prioridad baja o más', 'Prioridad media o alta', 'Prioridad alta'][l.minPriority])
  if (l.tags?.length) parts.push(l.tags.map((g) => `#${g}`).join(' o '))
  if (l.list) parts.push(names.list?.(l.list) ?? 'Una lista')
  if (l.person) parts.push(`Con ${names.person?.(l.person) ?? 'alguien'}`)
  if (l.maxEstimate) parts.push(`${l.maxEstimate} min o menos`)
  return parts.length ? parts.join(' · ') : 'Todas las pendientes'
}

/** Lo que hereda una tarea creada dentro de la lista, para que se quede en ella */
export function defaultsFor(l: SmartList, ref = todayYmd()): Partial<Task> {
  const d: Partial<Task> = {}
  if (l.when === 'today' || l.when === 'week') d.dueDate = ref
  if (l.when === 'someday') d.someday = true
  if (l.when === 'deadline') d.deadline = addDaysYmd(ref, 7)
  if (l.minPriority) d.priority = l.minPriority as Task['priority']
  if (l.tags?.length) d.tags = [l.tags[0]]
  if (l.list?.startsWith('p:')) d.projectId = l.list.slice(2)
  if (l.list?.startsWith('a:')) d.areaId = l.list.slice(2)
  if (l.person) d.people = [l.person]
  if (l.maxEstimate) d.estimate = l.maxEstimate
  return d
}
