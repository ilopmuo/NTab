import { useLiveQuery } from 'dexie-react-hooks'
import { Archive } from 'lucide-react'
import { db } from '@/db/db'
import { dateLabel, ymd } from '@/lib/dates'
import { SectionIcon, section } from '@/app/sections'
import { TaskList } from '@/components/TaskList'
import { Empty, Group, PageHeader, Section } from '@/components/ui'
import { Page } from './Page'
import { WeekStatsCard } from './WeekStatsCard'

export function LogbookView() {
  const done = useLiveQuery(() => db.tasks.where('completedAt').above(0).reverse().limit(300).toArray(), [])
  if (!done) return null
  const groups = new Map<string, typeof done>()
  for (const t of done) {
    if (!t.done || !t.completedAt) continue
    const k = ymd(new Date(t.completedAt))
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  return (
    <Page>
      <PageHeader icon={<SectionIcon def={section('logbook')} size={40} />} title="Completadas" subtitle="Todo lo que has hecho. Date una palmadita en la espalda." />
      <WeekStatsCard />
      {groups.size === 0 && (
        <Group>
          <Empty icon={<Archive size={28} strokeWidth={2.2} />} title="Aún nada completado" hint="Cuando completes tareas, aparecerán aquí." />
        </Group>
      )}
      {[...groups].map(([day, list]) => (
        <Section key={day} title={dateLabel(day)} count={list.length} tone="green">
          <TaskList tasks={list} sort={false} />
        </Section>
      ))}
    </Page>
  )
}
