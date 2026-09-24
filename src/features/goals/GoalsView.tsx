import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { Check, Minus, Plus, Target } from 'lucide-react'
import { db } from '@/db/db'
import { setGoalStatus } from '@/db/actions'
import { useLookup } from '@/db/hooks'
import type { Goal, Project, Task } from '@/db/types'
import { dateLabel } from '@/lib/dates'
import { goalPace, goalProgress } from '@/lib/goals'
import { href } from '@/app/router'
import { setUI, useUI } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Button, Empty, IconButton, PageHeader, ProgressBar, ProgressRing, Section, Segmented, cx } from '@/components/ui'
import { Page } from '../Page'
import { GoalForm } from './GoalForm'

const PACE = { late: 'Fuera de plazo', behind: 'Vas con retraso', ok: 'Vas bien' } as const

export function GoalsView() {
  const goals = useLiveQuery(() => db.goals.orderBy('order').toArray(), []) ?? []
  const tasks = useLiveQuery(() => db.tasks.where('projectId').above('').toArray(), []) ?? []
  const { areas, projects } = useLookup()
  const [status, setStatus] = useState<Goal['status']>('active')
  const creating = useUI((s) => s.creating === 'goal')
  const [editing, setEditing] = useState<Goal | undefined>()
  const list = goals.filter((g) => g.status === status)
  const groups = [
    ...areas.map((a) => ({ key: a.id, title: a.name, items: list.filter((g) => g.areaId === a.id) })),
    { key: 'none', title: areas.length ? 'Sin área' : '', items: list.filter((g) => !g.areaId || !areas.some((a) => a.id === g.areaId)) },
  ].filter((g) => g.items.length)
  const active = goals.filter((g) => g.status === 'active')
  const achieved = goals.filter((g) => g.status === 'done').length

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('goals')} size={40} />}
        title="Objetivos"
        subtitle={
          active.length
            ? `${active.length} en marcha${achieved ? ` · ${achieved} ${achieved === 1 ? 'conseguido' : 'conseguidos'}` : ''}`
            : 'Lo que quieres conseguir y cómo vas.'
        }
        actions={
          <Button variant="primary" onClick={() => setUI({ creating: 'goal' })}>
            <Plus size={15} /> Nuevo
          </Button>
        }
      />
      <Segmented
        className="mb-8"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'active', label: 'En marcha' },
          { value: 'done', label: 'Conseguidos' },
          { value: 'dropped', label: 'Descartados' },
        ]}
      />
      {groups.length === 0 && (
        <Empty
          icon={<Target size={28} strokeWidth={2.2} />}
          color="var(--c-blue)"
          title={status === 'active' ? 'Ningún objetivo en marcha' : status === 'done' ? 'Aún no has conseguido ninguno' : 'Nada descartado'}
          hint={
            status === 'active'
              ? 'Un objetivo es algo grande que quieres lograr: lo mides con una cifra (12 libros este año) o con los proyectos que lo hacen avanzar.'
              : undefined
          }
        >
          {status === 'active' && (
            <Button variant="primary" onClick={() => setUI({ creating: 'goal' })}>
              Crear objetivo
            </Button>
          )}
        </Empty>
      )}
      {groups.map((g) => (
        <Section key={g.key} title={g.title} count={g.title ? g.items.length : undefined}>
          <div className="mt-2 grid gap-3 @[640px]:grid-cols-2 @[1000px]:grid-cols-3">
            {g.items.map((goal, i) => (
              <GoalCard key={goal.id} goal={goal} projects={projects} tasks={tasks} index={i} onEdit={() => setEditing(goal)} />
            ))}
          </div>
        </Section>
      ))}
      <GoalForm open={creating} onClose={() => setUI({ creating: null })} />
      <GoalForm open={!!editing} goal={editing} onClose={() => setEditing(undefined)} />
    </Page>
  )
}

function GoalCard({
  goal,
  projects,
  tasks,
  index,
  onEdit,
}: {
  goal: Goal
  projects: Project[]
  tasks: Task[]
  index: number
  onEdit: () => void
}) {
  const p = goalProgress(goal, projects, tasks)
  const pace = goalPace(goal, p.value)
  const done = goal.status === 'done'
  const step = goal.target && goal.target >= 50 ? Math.round(goal.target / 20) : 1
  const bump = (d: number) => db.goals.update(goal.id, { current: Math.max(0, (goal.current ?? 0) + d) })

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, delay: index * 0.04 }}
      className="glass flex flex-col gap-3.5 rounded-[20px] p-4"
    >
      <button type="button" onClick={onEdit} className="flex items-start gap-3.5 text-left">
        <div className="relative shrink-0">
          <ProgressRing
            value={p.value}
            size={64}
            stroke={7}
            color={done ? 'var(--c-green)' : 'var(--c-blue)'}
            track="var(--c-fill)"
            delay={0.1 + index * 0.04}
          />
          <span className="font-num absolute inset-0 flex items-center justify-center text-[15px] font-bold">
            {done ? <Check size={22} strokeWidth={3} /> : `${Math.round(p.value * 100)}%`}
          </span>
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="line-clamp-2 text-[17px] leading-snug font-semibold">{goal.title}</p>
          <p className="mt-0.5 text-[13px] text-muted">{p.label}</p>
          {(goal.deadline || pace) && (
            <p className="mt-1 text-[12px] font-semibold">
              {goal.deadline && <span className={pace === 'late' ? 'text-fg' : 'text-muted'}>{dateLabel(goal.deadline)}</span>}
              {pace && (
                <span className={cx(pace === 'ok' ? 'text-muted' : 'text-fg')}>
                  {goal.deadline && ' · '}
                  {PACE[pace]}
                </span>
              )}
            </p>
          )}
        </div>
      </button>

      {goal.why && <p className="line-clamp-2 text-[13px] leading-snug text-muted italic">«{goal.why}»</p>}

      {p.projects.length > 0 && (
        <div className="space-y-2.5 rounded-[14px] bg-fill-2 px-3 py-2.5">
          {p.projects.map(({ project, value, open }) => (
            <a key={project.id} href={href(`/project/${project.id}`)} className="block">
              <div className="mb-1 flex items-baseline gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                <span className="font-num text-[12px] text-faint">{value >= 1 ? 'Hecho' : open ? `${open} pend.` : 'Sin tareas'}</span>
              </div>
              <ProgressBar value={value} color={value >= 1 ? 'var(--c-green)' : 'var(--c-blue)'} />
            </a>
          ))}
        </div>
      )}

      {goal.status === 'active' && (
        <div className="flex items-center gap-2">
          {goal.kind === 'number' && (
            <div className="flex items-center rounded-full bg-fill">
              <IconButton label={`Restar ${step}`} onClick={() => bump(-step)} className="h-8 w-8">
                <Minus size={15} strokeWidth={2.6} />
              </IconButton>
              <span className="font-num min-w-8 text-center text-[14px] font-bold">{(goal.current ?? 0).toLocaleString('es-ES')}</span>
              <IconButton label={`Sumar ${step}`} onClick={() => bump(step)} className="h-8 w-8">
                <Plus size={15} strokeWidth={2.6} />
              </IconButton>
            </div>
          )}
          <div className="flex-1" />
          <Button size="sm" variant={p.value >= 1 ? 'primary' : 'secondary'} onClick={() => setGoalStatus(goal.id, 'done')}>
            <Check size={14} strokeWidth={2.8} /> Conseguido
          </Button>
        </div>
      )}
    </motion.div>
  )
}
