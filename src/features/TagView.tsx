import { useLiveQuery } from 'dexie-react-hooks'
import { Hash } from 'lucide-react'
import { db } from '@/db/db'
import { InlineAdd, TaskList } from '@/components/TaskList'
import { PageHeader } from '@/components/ui'
import { Page } from './Page'

export function TagView({ tag }: { tag: string }) {
  const tasks = useLiveQuery(() => db.tasks.where('tags').equals(tag).and((t) => !t.done).toArray(), [tag])
  if (!tasks) return null
  return (
    <Page>
      <PageHeader icon={<Hash size={26} className="text-accent" />} title={tag} subtitle={`${tasks.length} tareas pendientes con esta etiqueta`} />
      <TaskList tasks={tasks} />
      <InlineAdd defaults={{ tags: [tag] }} />
    </Page>
  )
}
