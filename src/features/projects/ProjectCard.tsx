import { motion } from 'motion/react'
import type { Project, Task } from '@/db/types'
import { dateLabel, today } from '@/lib/dates'
import { href } from '@/app/router'
import { ProgressRing, cx } from '@/components/ui'

export function projectStats(tasks: Task[], projectId: string) {
  const list = tasks.filter((t) => t.projectId === projectId)
  const done = list.filter((t) => t.done).length
  return { total: list.length, done, open: list.length - done, progress: list.length ? done / list.length : 0 }
}

export function ProjectCard({ project, tasks, index = 0 }: { project: Project; tasks: Task[]; index?: number }) {
  const s = projectStats(tasks, project.id)
  const late = project.deadline && project.deadline < today() && project.status !== 'done'
  return (
    <motion.a
      href={href(`/project/${project.id}`)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, delay: index * 0.04 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="glass flex flex-col gap-3 rounded-[20px] p-4"
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <ProgressRing value={s.progress} size={44} stroke={5} color="var(--c-blue)" track="var(--c-fill)" delay={0.1 + index * 0.04} />
          <span className="font-num absolute inset-0 flex items-center justify-center text-[11px] font-bold">
            {Math.round(s.progress * 100)}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">{project.name}</p>
          <p className="text-[13px] text-muted">
            {s.open ? `${s.open} ${s.open === 1 ? 'pendiente' : 'pendientes'}` : s.total ? 'Todo hecho' : 'Sin tareas'}
            {project.status !== 'active' && ` · ${project.status === 'done' ? 'Terminado' : 'En pausa'}`}
          </p>
        </div>
      </div>
      {project.description && <p className="line-clamp-2 text-[13px] leading-snug text-muted">{project.description}</p>}
      {project.deadline && (
        <p className={cx('text-[12px] font-semibold', late ? 'text-fg' : 'text-muted')}>Límite: {dateLabel(project.deadline)}</p>
      )}
    </motion.a>
  )
}
