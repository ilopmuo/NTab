import type { Goal, Project, Task } from '@/db/types'
import { diffDays, today, ymd } from './dates'

export interface GoalProgress {
  /** 0…1 */
  value: number
  /** "3 de 12 libros", "2 de 4 proyectos" */
  label: string
  projects: { project: Project; value: number; open: number }[]
}

function projectValue(p: Project, tasks: Task[]) {
  const list = tasks.filter((t) => t.projectId === p.id)
  const done = list.filter((t) => t.done).length
  if (p.status === 'done') return { value: 1, open: 0 }
  return { value: list.length ? done / list.length : 0, open: list.length - done }
}

export function goalProgress(goal: Goal, projects: Project[], tasks: Task[]): GoalProgress {
  const linked = projects
    .filter((p) => p.goalId === goal.id)
    .map((project) => ({ project, ...projectValue(project, tasks) }))
  if (goal.kind === 'number') {
    const target = goal.target || 0
    const current = goal.current ?? 0
    const unit = goal.unit ? ` ${goal.unit}` : ''
    return {
      value: goal.status === 'done' ? 1 : target > 0 ? Math.min(1, current / target) : 0,
      label: `${fmtNum(current)} de ${fmtNum(target)}${unit}`,
      projects: linked,
    }
  }
  const finished = linked.filter((l) => l.value >= 1).length
  const value = goal.status === 'done' ? 1 : linked.length ? linked.reduce((a, l) => a + l.value, 0) / linked.length : 0
  return {
    value,
    label: linked.length ? `${finished} de ${linked.length} ${linked.length === 1 ? 'proyecto' : 'proyectos'}` : 'Sin proyectos',
    projects: linked,
  }
}

const fmtNum = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 })

/**
 * ¿Voy bien de tiempo? Compara el progreso con el tiempo transcurrido
 * desde que se creó hasta la fecha límite.
 */
export function goalPace(goal: Goal, value: number, ref = today()): 'late' | 'behind' | 'ok' | null {
  if (!goal.deadline || goal.status !== 'active') return null
  if (goal.deadline < ref) return 'late'
  const startYmd = ymd(new Date(goal.createdAt))
  const total = Math.max(1, diffDays(goal.deadline, startYmd))
  const elapsed = Math.max(0, diffDays(ref, startYmd)) / total
  return value + 0.15 < elapsed ? 'behind' : 'ok'
}
