import type { Project, Task } from '@/db/types'
import { sortManual, sortTasks } from './tasks'

type Modes = Record<string, 'manual'>

/**
 * Tareas pendientes de un proyecto en el orden en que se ven en él: primero las
 * que no tienen sección y luego cada sección, cada bloque con su orden
 * (automático o a mano).
 */
export function projectOrder(project: Pick<Project, 'id' | 'sections'>, tasks: Task[], modes: Modes = {}): Task[] {
  const open = tasks.filter((t) => t.projectId === project.id && !t.done)
  const sections = project.sections ?? []
  const known = new Set(sections.map((s) => s.id))
  const sorted = (list: Task[], key: string) => [...list].sort(modes[key] === 'manual' ? sortManual(key) : sortTasks)
  return [
    ...sorted(open.filter((t) => !t.sectionId || !known.has(t.sectionId)), `project:${project.id}`),
    ...sections.flatMap((s) => sorted(open.filter((t) => t.sectionId === s.id), `project:${project.id}:${s.id}`)),
  ]
}

/** El siguiente paso de un proyecto: su primera tarea pendiente */
export const nextStep = (project: Pick<Project, 'id' | 'sections'>, tasks: Task[], modes?: Modes) => projectOrder(project, tasks, modes)[0]
