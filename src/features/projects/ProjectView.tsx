import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, ChevronRight, FileText, Pause, Pencil, Play, Plus, StickyNote, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import { createNote, deleteProject } from '@/db/actions'
import { useAreas } from '@/db/hooks'
import type { ProjectStatus } from '@/db/types'
import { dateLabel, relativeDays, today } from '@/lib/dates'
import { href, navigate } from '@/app/router'
import { toast } from '@/app/store'
import { AreaBadge } from '@/components/icons'
import { TaskList } from '@/components/TaskList'
import { Button, Empty, Group, Modal, ModalHeader, ProgressRing, Section, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'
import { ProjectForm } from './ProjectForm'

export function ProjectView({ id }: { id: string }) {
  const project = useLiveQuery(() => db.projects.get(id), [id])
  const tasks = useLiveQuery(() => db.tasks.where('projectId').equals(id).toArray(), [id])
  const notes = useLiveQuery(() => db.notes.where('projectId').equals(id).toArray(), [id]) ?? []
  const areas = useAreas()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showDone, setShowDone] = useState(false)

  if (project === undefined || !tasks) return null
  if (project === null) return <Page><Empty icon={<FileText size={28} />} title="Proyecto no encontrado" /></Page>

  const area = areas.find((a) => a.id === project.areaId)
  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const progress = tasks.length ? done.length / tasks.length : 0
  const late = project.deadline && project.deadline < today() && project.status !== 'done'

  const setStatus = async (status: ProjectStatus) => {
    await db.projects.update(id, { status })
    toast(status === 'done' ? '¡Proyecto terminado! 🎉' : status === 'paused' ? 'Proyecto en pausa' : 'Proyecto reactivado')
  }

  return (
    <Page>
      <header className="mb-8">
        {area && (
          <a href={href(`/area/${area.id}`)} className="mb-3 inline-flex items-center gap-2 text-[14px] font-semibold text-muted transition-colors hover:text-fg">
            <AreaBadge icon={area.icon} size={22} /> {area.name}
          </a>
        )}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <ProgressRing value={progress} size={64} stroke={7} color="var(--c-blue)" track="var(--c-fill)" />
            <span className="font-num absolute inset-0 flex items-center justify-center text-[15px] font-bold">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={softSpring}
              className="truncate text-[32px] leading-tight font-bold tracking-[-0.025em]"
            >
              {project.name}
            </motion.h1>
            <p className="mt-0.5 text-[14px] text-muted">
              {done.length} de {tasks.length} completadas
              {project.deadline && (
                <span className={cx('ml-2 font-semibold', late ? 'text-fg' : 'text-muted')}>
                  · límite {dateLabel(project.deadline).toLowerCase()} ({relativeDays(project.deadline)})
                </span>
              )}
            </p>
          </div>
        </div>
        {project.description && <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">{project.description}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {project.status !== 'done' && (
            <Button size="sm" variant="tinted" onClick={() => setStatus('done')} className="">
              <CheckCircle2 size={14} strokeWidth={2.4} /> Terminar
            </Button>
          )}
          {project.status === 'active' ? (
            <Button size="sm" onClick={() => setStatus('paused')}>
              <Pause size={13} strokeWidth={2.4} /> Pausar
            </Button>
          ) : (
            <Button size="sm" variant="tinted" onClick={() => setStatus('active')}>
              <Play size={13} strokeWidth={2.4} /> Reactivar
            </Button>
          )}
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil size={13} strokeWidth={2.4} /> Editar
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} strokeWidth={2.4} /> Eliminar
          </Button>
        </div>
      </header>

      <Section title="Tareas" count={open.length} tone={project.color}>
        <TaskList
          tasks={open}
          hideProject
          add={{ defaults: { projectId: id, areaId: project.areaId } }}
          empty={<p className="px-4 pt-3 text-[14px] text-muted">Sin tareas pendientes. ¿Cuál es el siguiente paso?</p>}
        />
      </Section>

      {done.length > 0 && (
        <section className="mb-8">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="mb-2 flex items-center gap-1.5 px-1 text-[17px] font-bold">
            <ChevronRight size={18} strokeWidth={2.6} className={cx('transition-transform duration-300', showDone && 'rotate-90')} />
            Completadas <span className="font-num text-[15px] text-faint">{done.length}</span>
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
            }}
          >
            Conservarlas (pasan a {area ? area.name : 'la Bandeja'})
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await deleteProject(id, true)
              navigate(area ? `/area/${area.id}` : '/projects')
            }}
          >
            Eliminar también las tareas
          </Button>
        </div>
      </Modal>
    </Page>
  )
}
