import { m as motion } from 'motion/react'
import { AlertCircle, CalendarClock, Check, Circle } from 'lucide-react'
import type { Project, Task } from '@/db/types'
import { dateLabel, relativeDays, today, ymd } from '@/lib/dates'
import { healthLabel, projectHealth } from '@/lib/projectHealth'
import { nextStep } from '@/lib/projects'
import { href, vtName } from '@/app/router'
import { useListModes } from '@/components/ManualOrder'
import { ProgressRing, cx } from '@/components/ui'

export function projectStats(tasks: Task[], projectId: string) {
  const list = tasks.filter((t) => t.projectId === projectId)
  const done = list.filter((t) => t.done).length
  return { total: list.length, done, open: list.length - done, progress: list.length ? done / list.length : 0 }
}

/** «Límite: viernes · en 3 días», «Límite: hoy», «Venció ayer», «Venció 12 sept · hace 5 días» */
export function deadlineText(deadline: string, late: boolean) {
  const label = dateLabel(deadline).toLowerCase()
  const rel = relativeDays(deadline)
  return `${late ? 'Venció' : 'Límite:'} ${label}${label === rel ? '' : ` · ${rel}`}`
}

/**
 * Tarjeta de proyecto: progreso, lo que queda, la fecha límite y, sobre todo,
 * el siguiente paso (la primera tarea tal y como está ordenado el proyecto).
 */
export function ProjectCard({ project, tasks, index = 0 }: { project: Project; tasks: Task[]; index?: number }) {
  const modes = useListModes()
  const s = projectStats(tasks, project.id)
  const next = nextStep(project, tasks, modes)
  const late = !!project.deadline && project.deadline < today() && project.status !== 'done'
  const complete = s.total > 0 && s.open === 0
  const sections = project.sections?.length ?? 0
  // Lo que necesita (parado, con la fecha límite encima…); «sin siguiente paso» y «todo hecho» ya se dicen abajo
  const h = projectHealth(project, tasks.filter((t) => t.projectId === project.id), today(), (ms) => ymd(new Date(ms)))
  const health = h.kind === 'stalled' || h.kind === 'atRisk' || h.kind === 'late' ? healthLabel(h) : undefined
  return (
    <motion.a
      href={href(`/project/${project.id}`)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, delay: index * 0.04 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="glass flex flex-col rounded-[20px] p-4"
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0" style={{ viewTransitionName: vtName('proj-ring', project.id) }}>
          <ProgressRing value={s.progress} size={44} stroke={5} color={complete ? 'var(--c-green)' : 'var(--c-blue)'} track="var(--c-fill)" delay={0.1 + index * 0.04} />
          <span className="font-num absolute inset-0 flex items-center justify-center text-[11px] font-bold">
            {complete ? <Check size={18} strokeWidth={3} aria-label="Completado" /> : `${Math.round(s.progress * 100)}%`}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">
            <span className="inline-block max-w-full truncate align-bottom" style={{ viewTransitionName: vtName('proj-title', project.id) }}>
              {project.name}
            </span>
          </p>
          <p className="truncate text-[13px] text-muted">
            {s.open ? `${s.open} ${s.open === 1 ? 'pendiente' : 'pendientes'}` : complete ? 'Todo hecho' : 'Sin tareas'}
            {sections > 1 && ` · ${sections} secciones`}
            {project.status !== 'active' && ` · ${project.status === 'done' ? 'Terminado' : 'En pausa'}`}
          </p>
        </div>
      </div>
      {project.description && <p className="mt-3 line-clamp-2 text-[13px] leading-snug text-muted">{project.description}</p>}
      {project.status !== 'done' && (
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[14px]">
          {next ? (
            <>
              <Circle size={15} strokeWidth={2} className="shrink-0 text-muted" aria-hidden />
              <span className="sr-only">Siguiente paso: </span>
              <span className="min-w-0 flex-1 truncate">{next.title}</span>
              {next.dueDate && (
                <span className={cx('shrink-0 text-[12px] font-semibold', next.dueDate <= today() ? 'text-accent-on-soft' : 'text-muted')}>{relativeDays(next.dueDate)}</span>
              )}
            </>
          ) : (
            <span className="text-muted">{complete ? '¿Lo das por terminado?' : '¿Cuál es el primer paso?'}</span>
          )}
        </div>
      )}
      {health && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 self-start rounded-full bg-fill px-2.5 py-0.5 text-[12px] font-semibold" data-project-health>
          <AlertCircle size={12} strokeWidth={2.6} aria-hidden /> {health}
        </p>
      )}
      {project.deadline && project.status !== 'done' && !health && (
        <p className={cx('mt-2.5 flex items-center gap-1.5 text-[12px] font-semibold', late ? 'text-fg' : 'text-muted')}>
          <CalendarClock size={13} strokeWidth={2.4} aria-hidden />
          {deadlineText(project.deadline, late)}
        </p>
      )}
    </motion.a>
  )
}
