import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, Pencil, Plus } from 'lucide-react'
import { db } from '@/db/db'
import { createNote } from '@/db/actions'
import { useProjects } from '@/db/hooks'
import { href, navigate } from '@/app/router'
import { Icon } from '@/components/icons'
import { InlineAdd, TaskList } from '@/components/TaskList'
import { Button, Empty, IconButton, PageHeader, Section } from '@/components/ui'
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
        icon={
          <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${area.color}22`, color: area.color }}>
            <Icon name={area.icon} size={21} />
          </span>
        }
        title={area.name}
        subtitle={`${tasks.filter((t) => !t.done).length} tareas pendientes · ${projects.length} proyectos`}
        actions={
          <IconButton label="Editar área" onClick={() => setEditing(true)}>
            <Pencil size={15} />
          </IconButton>
        }
      />

      <Section
        title="Proyectos"
        count={projects.length}
        action={
          <Button size="sm" variant="ghost" onClick={() => setCreatingProject(true)}>
            <Plus size={14} /> Proyecto
          </Button>
        }
      >
        {projects.length === 0 ? (
          <p className="px-1 py-2 text-[13px] text-faint">Sin proyectos activos en esta área.</p>
        ) : (
          <div className="mt-2 grid gap-3 @[560px]:grid-cols-2 @[860px]:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} tasks={tasks} />
            ))}
          </div>
        )}
      </Section>

      <div className="max-w-3xl">
        <Section title="Tareas sueltas" count={loose.length}>
          <TaskList tasks={loose} hideProject />
          <InlineAdd defaults={{ areaId: id }} />
        </Section>

        <Section
          title="Notas"
          count={notes.length}
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const n = await createNote({ areaId: id })
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
      </div>

      <AreaForm area={area} open={editing} onClose={() => setEditing(false)} />
      <ProjectForm open={creatingProject} onClose={() => setCreatingProject(false)} defaultAreaId={id} onSaved={(p) => navigate(`/project/${p.id}`)} />
    </Page>
  )
}
