import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, m as motion } from 'motion/react'
import { AlertCircle, Check, CheckCircle2, ChevronRight, ClipboardList, Columns3, FileText, List, MoreHorizontal, Pause, Pencil, Pin, Play, Plus, StickyNote, Sun, Target, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import { createNote, deleteProject, markReviewed, mutateTask } from '@/db/actions'
import { useAreas } from '@/db/hooks'
import type { Project, ProjectStatus, Task } from '@/db/types'
import { dateLabel, relativeDays, today, ymd } from '@/lib/dates'
import { healthLabel, projectHealth } from '@/lib/projectHealth'
import { nextStep } from '@/lib/projects'
import { href, inViewTransition, navigate, vtName } from '@/app/router'
import { toast, ui } from '@/app/store'
import { isPinned, togglePinWithToast, usePins } from '@/app/pins'
import { AreaBadge } from '@/components/icons'
import { TaskList } from '@/components/TaskList'
import { Menu } from '@/components/Menu'
import { ProjectTasks } from './ProjectTasks'
import { ProjectBoard } from './ProjectBoard'
import { Button, CompactBar, Empty, Group, Modal, ModalHeader, ProgressRing, Section, Segmented, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'
import { ProjectForm } from './ProjectForm'
import { toastTrashed } from '../trash/undo'
import { templateFromProject } from '@/lib/templates'
import { SelectButton } from '@/features/select/SelectButton'

/** «hoy», «ayer», «hace 5 días» */
function reviewedLabel(at: number) {
  const days = Math.floor((Date.now() - at) / 864e5)
  return days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`
}

/**
 * Lo que necesita el proyecto, con lo que se puede hacer ya: terminarlo si
 * está todo hecho, añadir el siguiente paso, traerlo a hoy si lleva días
 * parado o pausarlo. Nada si va bien.
 */
function ProjectNudge({ project, tasks, onStatus }: { project: Project; tasks: Task[]; onStatus: (s: ProjectStatus) => void }) {
  const health = projectHealth(project, tasks, today(), (ms) => ymd(new Date(ms)))
  const label = healthLabel(health)
  if (!label) return null
  const next = nextStep(project, tasks)
  const text =
    health.kind === 'finished'
      ? 'Ya está todo hecho. ¿Lo das por terminado?'
      : health.kind === 'noNext'
        ? 'No tiene nada que hacer ahora: ¿cuál es el siguiente paso?'
        : health.kind === 'stalled'
          ? `Lleva ${health.days} días parado.${next ? ` El siguiente paso es «${next.title}».` : ''}`
          : `${label}.`
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-fill-2 px-4 py-3 text-[14px]" role="status" data-project-nudge>
      <AlertCircle size={16} strokeWidth={2.4} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 font-medium">{text}</span>
      {health.kind === 'finished' && (
        <Button size="sm" variant="tinted" onClick={() => onStatus('done')}>
          <CheckCircle2 size={14} strokeWidth={2.4} /> Terminar
        </Button>
      )}
      {health.kind === 'noNext' && (
        <Button size="sm" variant="tinted" onClick={() => ui.quickAdd({ projectId: project.id, areaId: project.areaId })}>
          <Plus size={14} strokeWidth={2.4} /> Siguiente paso
        </Button>
      )}
      {health.kind === 'stalled' && next && next.dueDate !== today() && (
        <Button size="sm" variant="tinted" onClick={() => void mutateTask(next.id, (t) => void ((t.dueDate = today()), delete t.someday)).then(() => toast(`${next.title} → hoy`))}>
          <Sun size={14} strokeWidth={2.4} /> Hacerlo hoy
        </Button>
      )}
      {health.kind === 'stalled' && (
        <Button size="sm" onClick={() => onStatus('paused')}>
          <Pause size={13} strokeWidth={2.4} /> Pausar
        </Button>
      )}
    </div>
  )
}

export function ProjectView({ id }: { id: string }) {
  const project = useLiveQuery(() => db.projects.get(id), [id])
  const tasks = useLiveQuery(() => db.tasks.where('projectId').equals(id).toArray(), [id])
  const notes = useLiveQuery(() => db.notes.where('projectId').equals(id).toArray(), [id]) ?? []
  const areas = useAreas()
  const goal = useLiveQuery(() => (project?.goalId ? db.goals.get(project.goalId) : undefined), [project?.goalId])
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const pins = usePins()
  const titleRef = useRef<HTMLDivElement>(null)

  if (project === undefined || !tasks) return null
  if (project === null) return <Page><Empty icon={<FileText size={28} />} title="Proyecto no encontrado" /></Page>

  const area = areas.find((a) => a.id === project.areaId)
  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const progress = tasks.length ? done.length / tasks.length : 0
  const late = project.deadline && project.deadline < today() && project.status !== 'done'
  const board = project.view === 'board'

  const setStatus = async (status: ProjectStatus) => {
    await db.projects.update(id, { status })
    toast(status === 'done' ? '¡Proyecto terminado! 🎉' : status === 'paused' ? 'Proyecto en pausa' : 'Proyecto reactivado')
  }

  return (
    <Page wide={board}>
      <header className="mb-8">
        {(area || goal) && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {area && (
              <a href={href(`/area/${area.id}`)} className="inline-flex items-center gap-2 text-[14px] font-semibold text-muted transition-colors hover:text-fg">
                <AreaBadge icon={area.icon} size={22} /> {area.name}
              </a>
            )}
            {goal && (
              <a href={href('/goals')} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted transition-colors hover:text-fg">
                <Target size={15} strokeWidth={2.4} /> {goal.title}
              </a>
            )}
          </div>
        )}
        <div ref={titleRef} className="flex items-center gap-4">
          <div className="relative shrink-0" style={{ viewTransitionName: vtName('proj-ring', project.id) }}>
            <ProgressRing value={progress} size={64} stroke={7} color={progress === 1 ? 'var(--c-green)' : 'var(--c-blue)'} track="var(--c-fill)" />
            <span className="font-num absolute inset-0 flex items-center justify-center text-[15px] font-bold">
              {progress === 1 ? <Check size={24} strokeWidth={3} aria-label="Completado" /> : `${Math.round(progress * 100)}%`}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <motion.h1
              initial={inViewTransition() ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={softSpring}
              className="truncate text-[32px] leading-tight font-bold tracking-[-0.025em]"
            >
              {/* Viaja desde el nombre de su tarjeta (transición entre pantallas) */}
              <span className="inline-block max-w-full truncate align-bottom" style={{ viewTransitionName: vtName('proj-title', project.id) }}>
                {project.name}
              </span>
            </motion.h1>
            <p className="mt-0.5 text-[14px] text-muted">
              {done.length} de {tasks.length} completadas
              {project.reviewedAt ? ` · revisado ${reviewedLabel(project.reviewedAt)}` : ''}
              {project.deadline && (
                <span className={cx('ml-2 font-semibold', late ? 'text-fg' : 'text-muted')}>
                  · límite {dateLabel(project.deadline).toLowerCase()} ({relativeDays(project.deadline)})
                </span>
              )}
            </p>
          </div>
        </div>
        <CompactBar target={titleRef} title={project.name} />
        {project.description && <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">{project.description}</p>}
        <ProjectNudge project={project} tasks={tasks} onStatus={setStatus} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {project.status === 'done' || project.status === 'paused' ? (
            <Button size="sm" variant="tinted" onClick={() => setStatus('active')}>
              <Play size={13} strokeWidth={2.4} /> Reactivar
            </Button>
          ) : (
            <Button size="sm" variant="tinted" onClick={() => setStatus('done')}>
              <CheckCircle2 size={14} strokeWidth={2.4} /> Terminar
            </Button>
          )}
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil size={13} strokeWidth={2.4} /> Editar
          </Button>
          <SelectButton small />
          <Segmented
            value={board ? 'board' : 'list'}
            onChange={(v) => void db.projects.update(id, { view: v === 'board' ? 'board' : undefined })}
            options={[
              { value: 'list', label: <List size={15} strokeWidth={2.4} />, title: 'Ver en lista' },
              { value: 'board', label: <Columns3 size={15} strokeWidth={2.4} />, title: 'Ver en tablero' },
            ]}
          />
          <Menu
            label="Más acciones del proyecto"
            align="start"
            trigger={<MoreHorizontal size={16} strokeWidth={2.4} />}
            items={[
              project.status === 'active' && { label: 'Pausar', icon: <Pause size={14} />, onSelect: () => void setStatus('paused') },
              project.status === 'paused' && { label: 'Terminar', icon: <CheckCircle2 size={14} />, onSelect: () => void setStatus('done') },
              {
                label: 'Marcar como revisado',
                icon: <Check size={14} />,
                onSelect: () => void markReviewed(project.id).then(() => toast('Proyecto revisado')),
              },
              {
                label: isPinned(pins, 'project', project.id) ? 'Quitar de Fijados' : 'Fijar en la barra lateral',
                icon: <Pin size={14} />,
                onSelect: () => void togglePinWithToast('project', project.id, project.name),
              },
              {
                label: 'Guardar como plantilla',
                icon: <ClipboardList size={14} />,
                onSelect: async () => {
                  await templateFromProject(project)
                  toast('Guardado como plantilla', { label: 'Ver', run: () => navigate('/templates') })
                },
              },
              { label: 'Eliminar el proyecto', icon: <Trash2 size={14} />, onSelect: () => setConfirmDelete(true), danger: true },
            ]}
          />
        </div>
      </header>

      {board ? <ProjectBoard project={project} open={open} /> : <ProjectTasks project={project} open={open} />}

      {done.length > 0 && (
        <section className="mb-8">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="mb-2 flex items-center gap-1.5 px-1 text-[17px] font-bold">
            <ChevronRight size={18} strokeWidth={2.6} className={cx('transition-transform duration-300', showDone && 'rotate-90')} />
            Completadas <span className="font-num text-[15px] text-muted">{done.length}</span>
          </button>
          <AnimatePresence initial={false}>
            {showDone && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={softSpring} className="overflow-hidden">
                <TaskList tasks={done} hideProject />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      <Section
        title="Notas"
        count={notes.length}
        tone="yellow"
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const n = await createNote({ projectId: id, areaId: project.areaId })
              navigate(`/notes/${n.id}`)
            }}
          >
            <Plus size={14} strokeWidth={2.6} /> Nota
          </Button>
        }
      >
        {notes.length > 0 && (
          <Group>
            {notes.map((n) => (
              <a key={n.id} href={href(`/notes/${n.id}`)} className="relative flex items-center gap-3 px-4 py-3 text-[15px] transition-colors after:absolute after:right-0 after:bottom-0 after:left-[50px] after:h-px after:bg-line last:after:hidden hover:bg-hover">
                <StickyNote size={20} className="text-muted" strokeWidth={2.2} />
                <span className="flex-1 truncate">{n.title || 'Sin título'}</span>
                <ChevronRight size={16} className="text-faint" />
              </a>
            ))}
          </Group>
        )}
      </Section>

      <ProjectForm project={project} open={editing} onClose={() => setEditing(false)} />
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} position="center" className="max-w-sm">
        <ModalHeader title="Eliminar proyecto" onClose={() => setConfirmDelete(false)} />
        <div className="px-5 pb-4 text-center text-[15px] text-muted">¿Qué hacemos con sus {tasks.length} tareas?</div>
        <div className="flex flex-col gap-2 p-4 pt-0">
          <Button
            onClick={async () => {
              await deleteProject(id, false)
              navigate(area ? `/area/${area.id}` : '/projects')
              toastTrashed('Proyecto en la papelera', 'projects', id)
            }}
          >
            Conservarlas (pasan a {area ? area.name : 'la Bandeja'})
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await deleteProject(id, true)
              navigate(area ? `/area/${area.id}` : '/projects')
              toastTrashed('Proyecto y tareas en la papelera', 'projects', id)
            }}
          >
            Eliminar también las tareas
          </Button>
        </div>
      </Modal>
    </Page>
  )
}
