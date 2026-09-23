import type { Project, Task } from '@/db/types'
import { dateLabel, today } from '@/lib/dates'
import { href } from '@/app/router'
import { ProgressBar, cx } from '@/components/ui'

export function projectStats(tasks: Task[], projectId: string) {
  const list = tasks.filter((t) => t.projectId === projectId)
  const done = list.filter((t) => t.done).length
  return { total: list.length, done, open: list.length - done, progress: list.length ? done / list.length : 0 }
}

export function ProjectCard({ project, tasks }: { project: Project; tasks: Task[] }) {
  const s = projectStats(tasks, project.id)
  const late = project.deadline && project.deadline < today() && project.status !== 'done'
  return (
    <a
      href={href(`/project/${project.id}`)}
      className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-px hover:border-line-strong"
    >
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{project.name}</span>
        {project.status !== 'active' && (
          <span className="rounded-md bg-hover px-1.5 py-0.5 text-[11px] text-muted">{project.status === 'done' ? 'Terminado' : 'En pausa'}</span>
        )}
      </div>
      {project.description && <p className="line-clamp-2 text-[12.5px] text-muted">{project.description}</p>}
      <div className="mt-auto space-y-2">
        <ProgressBar value={s.progress} color={project.color} />
        <div className="flex justify-between text-[12px] text-muted">
          <span className="tabular-nums">
            {s.done}/{s.total} tareas
          </span>
          {project.deadline && <span className={cx(late && 'text-danger')}>{dateLabel(project.deadline)}</span>}
        </div>
      </div>
    </a>
  )
}
