import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, FileText, Pencil, Plus, StickyNote } from 'lucide-react'
import { db } from '@/db/db'
import { createNote } from '@/db/actions'
import { useProjects } from '@/db/hooks'
import { href, navigate } from '@/app/router'
import { AreaBadge } from '@/components/icons'
import { TaskList } from '@/components/TaskList'
import { Button, Empty, Group, IconButton, PageHeader, Section } from '@/components/ui'
import { Page } from '../Page'
import { ProjectCard } from '../projects/ProjectCard'
import { ProjectForm } from '../projects/ProjectForm'
import { AreaForm } from './AreaForm'

export function AreaView({ id }: { id: string }) {
  const area = useLiveQuery(() => db.areas.get(id), [id])
  const tasks = useLiveQuery(() => db.tasks.where('areaId').equals(id).toArray(), [id])
  const notes = useLiveQuery(() => db.notes.where('areaId').equals(id).toArray(), [id]) ?? []
  const projects = useProjects().filter((p) => p.areaId === id && p.status !== 'done')
  const [editing, setEditing] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)

  if (area === undefined || !tasks) return null
  if (area === null) return <Page><Empty icon={<FileText size={22} />} title="Área no encontrada" /></Page>

  const loose = tasks.filter((t) => !t.done && !t.projectId)

  return (
    <Page wide>
      <PageHeader
        icon={<AreaBadge icon={area.icon} size={40} />}
        title={area.name}
        subtitle={`${tasks.filter((t) => !t.done).length} tareas pendientes · ${projects.length} ${projects.length === 1 ? 'proyecto' : 'proyectos'}`}
        actions={
          <IconButton label="Editar área" filled onClick={() => setEditing(true)}>
            <Pencil size={15} strokeWidth={2.3} />
          </IconButton>
        }
      />

      <Section
        title="Proyectos"
        count={projects.length}
        tone="indigo"
        action={
          <Button size="sm" variant="ghost" onClick={() => setCreatingProject(true)}>
            <Plus size={14} strokeWidth={2.6} /> Proyecto
          </Button>
        }
      >
        {projects.length === 0 ? (
          <button
            type="button"
            onClick={() => setCreatingProject(true)}
            className="glass flex w-full items-center gap-3 rounded-[18px] px-4 py-4 text-left text-[15px] text-muted transition-colors hover:text-fg"
          >
            <Plus size={18} /> Crea un proyecto para agrupar lo que requiere varios pasos
          </button>
        ) : (
          <div className="grid gap-3 @[560px]:grid-cols-2 @[860px]:grid-cols-3">
            {projects.map((p, i) => (
              <ProjectCard key={p.id} project={p} tasks={tasks} index={i} />
            ))}
          </div>
        )}
      </Section>

      <div className="max-w-3xl">
        <Section title="Tareas sueltas" count={loose.length} tone={area.color}>
          <TaskList tasks={loose} hideProject add={{ defaults: { areaId: id } }} />
        </Section>

        <Section
          title="Notas"
          count={notes.length}
          tone="yellow"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const n = await createNote({ areaId: id })
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
      </div>

      <AreaForm area={area} open={editing} onClose={() => setEditing(false)} />
      <ProjectForm open={creatingProject} onClose={() => setCreatingProject(false)} defaultAreaId={id} onSaved={(p) => navigate(`/project/${p.id}`)} />
    </Page>
  )
}
