import { db } from '@/db/db'
import type { Task } from '@/db/types'

/**
 * Las tareas que mueven los objetivos: las de proyectos (para los que se miden
 * con proyectos) y las de las #etiquetas de los que se miden con tareas.
 */
export async function goalTasks(): Promise<Task[]> {
  const tags = (await db.goals.toArray()).flatMap((g) => (g.kind === 'tasks' && g.tag ? [g.tag] : []))
  const [inProjects, tagged] = await Promise.all([db.tasks.where('projectId').above('').toArray(), tags.length ? db.tasks.where('tags').anyOf(tags).toArray() : []])
  return [...new Map([...inProjects, ...tagged].map((t) => [t.id, t])).values()]
}
