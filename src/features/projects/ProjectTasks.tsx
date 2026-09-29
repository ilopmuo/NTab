import { useState } from 'react'
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Project, ProjectSection, Task } from '@/db/types'
import { addSection, deleteSection, moveSection, renameSection } from '@/db/actions'
import { TaskList } from '@/components/TaskList'
import { OrderToggle } from '@/components/ManualOrder'
import { Menu } from '@/components/Menu'
import { Button, Section } from '@/components/ui'

/**
 * Tareas pendientes de un proyecto, repartidas en sus secciones («Diseño»,
 * «Contenido»…). Las que no tienen sección (o cuya sección ya no existe) van
 * primero. Cada bloque tiene su propio orden a mano.
 */
export function ProjectTasks({ project, open }: { project: Project; open: Task[] }) {
  const sections = project.sections ?? []
  const known = new Set(sections.map((s) => s.id))
  const loose = open.filter((t) => !t.sectionId || !known.has(t.sectionId))
  const key = `project:${project.id}`
  const defaults = { projectId: project.id, areaId: project.areaId }

  return (
    <>
      {(loose.length > 0 || sections.length === 0) && (
        <Section title="Tareas" count={loose.length} tone={project.color} action={loose.length > 1 ? <OrderToggle listKey={key} tasks={loose} /> : undefined}>
          <TaskList
            tasks={loose}
            orderKey={key}
            hideProject
            add={{ defaults }}
            empty={sections.length ? undefined : <p className="px-4 pt-3 text-[14px] text-muted">Sin tareas pendientes. ¿Cuál es el siguiente paso?</p>}
          />
        </Section>
      )}
      {sections.map((s, i) => (
        <SectionBlock
          key={s.id}
          project={project}
          section={s}
          first={i === 0}
          last={i === sections.length - 1}
          tasks={open.filter((t) => t.sectionId === s.id)}
        />
      ))}
      <NewSection projectId={project.id} hasSections={sections.length > 0} />
    </>
  )
}

function SectionBlock({ project, section, tasks, first, last }: { project: Project; section: ProjectSection; tasks: Task[]; first: boolean; last: boolean }) {
  const [editing, setEditing] = useState(false)
  const key = `project:${project.id}:${section.id}`
  const remove = () => {
    if (tasks.length && !window.confirm(`¿Borrar la sección «${section.name}»? Sus ${tasks.length} tareas se quedan en el proyecto, sin sección.`)) return
    void deleteSection(project.id, section.id)
  }
  const title = editing ? (
    <input
      autoFocus
      aria-label="Nombre de la sección"
      defaultValue={section.name}
      onBlur={(e) => {
        void renameSection(project.id, section.id, e.target.value)
        setEditing(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          setEditing(false)
        }
      }}
      className="w-full min-w-40 rounded-lg bg-fill-2 px-2 py-0.5 text-[19px] font-bold tracking-tight"
    />
  ) : (
    <button type="button" onClick={() => setEditing(true)} title="Cambiar el nombre" className="text-left">
      {section.name}
    </button>
  )
  return (
    <Section
      title={title}
      count={tasks.length}
      action={
        <div className="flex items-center gap-1">
          {tasks.length > 1 && <OrderToggle listKey={key} tasks={tasks} />}
          <Menu
            label={`Opciones de la sección «${section.name}»`}
            trigger={<MoreHorizontal size={16} strokeWidth={2.4} />}
            items={[
              { label: 'Cambiar el nombre', icon: <Pencil size={14} />, onSelect: () => setEditing(true) },
              !first && { label: 'Subir', icon: <ArrowUp size={14} />, onSelect: () => void moveSection(project.id, section.id, -1) },
              !last && { label: 'Bajar', icon: <ArrowDown size={14} />, onSelect: () => void moveSection(project.id, section.id, 1) },
              { label: 'Borrar la sección', icon: <Trash2 size={14} />, onSelect: remove, danger: true },
            ]}
          />
        </div>
      }
    >
      <TaskList tasks={tasks} orderKey={key} hideProject add={{ defaults: { projectId: project.id, areaId: project.areaId, sectionId: section.id } }} />
    </Section>
  )
}

function NewSection({ projectId, hasSections }: { projectId: string; hasSections: boolean }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  if (!adding) {
    return (
      <div className="-mt-4 mb-8 px-1">
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={2.6} /> {hasSections ? 'Nueva sección' : 'Dividir en secciones'}
        </Button>
      </div>
    )
  }
  const save = async () => {
    if (name.trim()) await addSection(projectId, name)
    setName('')
    setAdding(false)
  }
  return (
    <form
      className="-mt-4 mb-8 flex items-center gap-2 px-1"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <input
        autoFocus
        aria-label="Nombre de la nueva sección"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setAdding(false)
          }
        }}
        onBlur={() => !name.trim() && setAdding(false)}
        placeholder="Ej. Diseño, Contenido, Lanzamiento"
        className="h-9 min-w-0 flex-1 rounded-xl bg-fill-2 px-3 text-[15px] placeholder:text-faint"
      />
      <Button size="sm" variant="primary" type="submit" disabled={!name.trim()}>
        Añadir
      </Button>
    </form>
  )
}
