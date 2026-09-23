import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Folder, Plus } from 'lucide-react'
import { db } from '@/db/db'
import { useLookup } from '@/db/hooks'
import type { ProjectStatus } from '@/db/types'
import { navigate } from '@/app/router'
import { setUI, useUI } from '@/app/store'
import { Icon } from '@/components/icons'
import { Button, Empty, PageHeader, Section, Segmented } from '@/components/ui'
import { Page } from '../Page'
import { ProjectCard } from './ProjectCard'
import { ProjectForm } from './ProjectForm'

export function ProjectsView() {
  const { areas, projects } = useLookup()
  const tasks = useLiveQuery(() => db.tasks.where('projectId').above('').toArray(), []) ?? []
  const [status, setStatus] = useState<ProjectStatus>('active')
  const creating = useUI((s) => s.creating === 'project')
  const list = projects.filter((p) => p.status === status)
  const groups = [
    ...areas.map((a) => ({ key: a.id, area: a, items: list.filter((p) => p.areaId === a.id) })),
    { key: 'none', area: undefined, items: list.filter((p) => !p.areaId || !areas.some((a) => a.id === p.areaId)) },
  ].filter((g) => g.items.length)

  return (
    <Page wide>
      <PageHeader
        icon={<Folder size={26} className="text-accent" />}
        title="Proyectos"
        subtitle="Todo lo que requiere más de un paso."
        actions={
          <Button variant="primary" onClick={() => setUI({ creating: 'project' })}>
            <Plus size={15} /> Nuevo
          </Button>
        }
      />
      <Segmented
        className="mb-8"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'active', label: 'Activos' },
          { value: 'paused', label: 'En pausa' },
          { value: 'done', label: 'Terminados' },
        ]}
      />
      {groups.length === 0 && (
        <Empty icon={<Folder size={22} />} title="Ningún proyecto aquí" hint="Un proyecto es cualquier objetivo que necesite varias tareas: una mudanza, un viaje, lanzar una web…" />
      )}
      {groups.map((g) => (
        <Section
          key={g.key}
          title={g.area?.name ?? 'Sin área'}
          count={g.items.length}
          action={g.area && <Icon name={g.area.icon} size={14} style={{ color: g.area.color }} />}
        >
          <div className="mt-2 grid gap-3 @[560px]:grid-cols-2 @[860px]:grid-cols-3">
            {g.items.map((p) => (
              <ProjectCard key={p.id} project={p} tasks={tasks} />
            ))}
          </div>
        </Section>
      ))}
      <ProjectForm open={creating} onClose={() => setUI({ creating: null })} onSaved={(p) => navigate(`/project/${p.id}`)} />
    </Page>
  )
}
