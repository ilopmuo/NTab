import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardList, Folder, Plus, Target } from 'lucide-react'
import { db } from '@/db/db'
import { useLookup } from '@/db/hooks'
import type { ProjectStatus } from '@/db/types'
import { navigate } from '@/app/router'
import { setUI, useUI, ui } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Button, Empty, PageHeader, Section } from '@/components/ui'
import { Segmented } from '@/components/form'
import { Page } from '../Page'
import { Tile } from '@/components/Tile'
import { useFeatures } from '@/app/features'
import { ProjectCard } from './ProjectCard'
import { ProjectForm } from './ProjectForm'

export function ProjectsView() {
  const { areas, projects } = useLookup()
  const tasks = useLiveQuery(() => db.tasks.where('projectId').above('').toArray(), []) ?? []
  const [status, setStatus] = useState<ProjectStatus>('active')
  const { on } = useFeatures()
  const goals = useLiveQuery(() => db.goals.where('status').equals('active').count(), [])
  const templates = useLiveQuery(() => db.templates.count(), [])
  const creating = useUI((s) => s.creating === 'project')
  const list = projects.filter((p) => p.status === status)
  const groups = [
    ...areas.map((a) => ({ key: a.id, area: a, items: list.filter((p) => p.areaId === a.id) })),
    { key: 'none', area: undefined, items: list.filter((p) => !p.areaId || !areas.some((a) => a.id === p.areaId)) },
  ].filter((g) => g.items.length)

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('projects')} size={40} />}
        title="Proyectos"
        subtitle="Todo lo que requiere más de un paso."
        actions={
          <Button variant="primary" onClick={() => ui.create('project')}>
            <Plus size={15} /> Nuevo
          </Button>
        }
      />
      {/* Objetivos y Plantillas viven aquí dentro (antes eran pestañas aparte) */}
      {(on('goals') || on('templates')) && (
        <div className="mb-6 grid grid-cols-2 gap-3 @[640px]:max-w-md">
          {on('goals') && <Tile to="/goals" icon={Target} label="Objetivos" count={goals} hint="Hacia dónde vas" />}
          {on('templates') && <Tile to="/templates" icon={ClipboardList} label="Plantillas" count={templates} hint="Listas que repites" />}
        </div>
      )}
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
        <Empty icon={<Folder size={28} strokeWidth={2.2} />} color="var(--c-indigo)" title="Ningún proyecto aquí" hint="Un proyecto es cualquier objetivo que necesite varias tareas: una mudanza, un viaje, lanzar una web…" />
      )}
      {groups.map((g) => (
        <Section
          key={g.key}
          title={g.area?.name ?? 'Sin área'}
          count={g.items.length}
          tone={g.area?.color ?? 'gray'}
        >
          <div className="mt-2 grid gap-3 @[560px]:grid-cols-2 @[860px]:grid-cols-3">
            {g.items.map((p, i) => (
              <ProjectCard key={p.id} project={p} tasks={tasks} index={i} />
            ))}
          </div>
        </Section>
      ))}
      <ProjectForm open={creating} onClose={() => setUI({ creating: null })} onSaved={(p) => navigate(`/project/${p.id}`)} />
    </Page>
  )
}
