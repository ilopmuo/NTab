import { useLiveQuery } from 'dexie-react-hooks'
import { Archive } from 'lucide-react'
import { db } from '@/db/db'
import { dateLabel, ymd } from '@/lib/dates'
import { TaskList } from '@/components/TaskList'
import { Empty, PageHeader, Section } from '@/components/ui'
import { Page } from './Page'

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
      <PageHeader icon={<Archive size={26} className="text-lime" />} title="Completadas" subtitle="Todo lo que has hecho. Date una palmadita en la espalda." />
      {groups.size === 0 && <Empty icon={<Archive size={22} />} title="Aún nada completado" />}
      {[...groups].map(([day, list]) => (
        <Section key={day} title={dateLabel(day)} count={list.length}>
          <TaskList tasks={list} sort={false} />
        </Section>
      ))}
    </Page>
  )
}
