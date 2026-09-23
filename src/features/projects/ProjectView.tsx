import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, ChevronDown, FileText, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import { createNote, deleteProject } from '@/db/actions'
import { useAreas } from '@/db/hooks'
import type { ProjectStatus } from '@/db/types'
import { dateLabel, relativeDays, today } from '@/lib/dates'
import { href, navigate } from '@/app/router'
import { toast } from '@/app/store'
import { Icon } from '@/components/icons'
import { InlineAdd, TaskList } from '@/components/TaskList'
import { Button, Empty, IconButton, Modal, ModalHeader, ProgressBar, Section, cx } from '@/components/ui'
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
  if (project === null) return <Page><Empty icon={<FileText size={22} />} title="Proyecto no encontrado" /></Page>

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
      <header className="mb-8 animate-fade-in">
        {area && (
          <a href={href(`/area/${area.id}`)} className="mb-2 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
            <Icon name={area.icon} size={13} style={{ color: area.color }} /> {area.name}
          </a>
        )}
        <div className="flex items-start gap-3">
          <span className="mt-3 h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: project.color }} />
          <h1 className="min-w-0 flex-1 text-[30px] leading-tight font-bold tracking-[-0.025em]">{project.name}</h1>
          <div className="flex shrink-0 items-center">
            {project.status !== 'done' && (
              <IconButton label="Marcar como terminado" onClick={() => setStatus('done')}>
                <CheckCircle2 size={17} />
              </IconButton>
            )}
            {project.status === 'active' ? (
              <IconButton label="Pausar" onClick={() => setStatus('paused')}>
                <Pause size={16} />
              </IconButton>
            ) : (
              <IconButton label="Reactivar" onClick={() => setStatus('active')}>
                <Play size={16} />
              </IconButton>
            )}
            <IconButton label="Editar" onClick={() => setEditing(true)}>
              <Pencil size={15} />
            </IconButton>
            <IconButton label="Eliminar" className="hover:text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        </div>
        {project.description && <p className="mt-2 max-w-xl pl-6.5 text-[14px] leading-relaxed text-muted">{project.description}</p>}
        <div className="mt-5 flex items-center gap-4 pl-6.5">
          <div className="max-w-60 flex-1">
            <ProgressBar value={progress} color={project.color} />
          </div>
          <span className="text-[12.5px] text-muted tabular-nums">
            {done.length}/{tasks.length} · {Math.round(progress * 100)}%
          </span>
          {project.deadline && (
            <span className={cx('text-[12.5px]', late ? 'text-danger' : 'text-muted')}>
              Límite: {dateLabel(project.deadline)} ({relativeDays(project.deadline)})
            </span>
          )}
          {project.status !== 'active' && (
            <span className="rounded-md bg-hover px-2 py-0.5 text-[12px] text-muted">{project.status === 'done' ? 'Terminado' : 'En pausa'}</span>
          )}
        </div>
      </header>

      <Section title="Tareas" count={open.length}>
        {open.length === 0 && <p className="px-3 py-2 text-[13px] text-faint">Sin tareas pendientes. ¿Cuál es el siguiente paso?</p>}
        <TaskList tasks={open} hideProject />
        <InlineAdd defaults={{ projectId: id, areaId: project.areaId }} />
      </Section>

      {done.length > 0 && (
        <section className="mb-8">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="mb-1 flex items-center gap-1.5 px-1 text-[12px] font-semibold tracking-wider text-muted uppercase hover:text-fg"
          >
            <ChevronDown size={14} className={cx('transition-transform', !showDone && '-rotate-90')} />
            Completadas <span className="font-normal text-faint">{done.length}</span>
          </button>
          {showDone && <TaskList tasks={done} hideProject />}
        </section>
      )}

      <Section
        title="Notas"
        count={notes.length}
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const n = await createNote({ projectId: id, areaId: project.areaId })
              navigate(`/notes/${n.id}`)
            }}
          >
            <Plus size={14} /> Nota
          </Button>
        }
      >
        {notes.map((n) => (
          <a key={n.id} href={href(`/notes/${n.id}`)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] hover:bg-hover">
            <FileText size={15} className="text-muted" />
            {n.title || 'Sin título'}
          </a>
        ))}
      </Section>

      <ProjectForm project={project} open={editing} onClose={() => setEditing(false)} />
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} position="center" className="max-w-sm">
        <ModalHeader title="Eliminar proyecto" onClose={() => setConfirmDelete(false)} />
        <div className="p-5 text-[13.5px] text-muted">¿Qué hacemos con sus {tasks.length} tareas?</div>
        <div className="flex flex-col gap-2 border-t border-line p-4">
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
