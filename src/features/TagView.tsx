import { useLiveQuery } from 'dexie-react-hooks'
import { Hash } from 'lucide-react'
import { db } from '@/db/db'
import { TaskList } from '@/components/TaskList'
import { PageHeader } from '@/components/ui'
import { Page } from './Page'

export function TagView({ tag }: { tag: string }) {
  const tasks = useLiveQuery(() => db.tasks.where('tags').equals(tag).and((t) => !t.done).toArray(), [tag])
  if (!tasks) return null
  return (
    <Page>
      <PageHeader
        icon={
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue text-white">
            <Hash size={22} strokeWidth={2.6} />
          </span>
        }
        title={tag}
        subtitle={`${tasks.length} ${tasks.length === 1 ? 'tarea pendiente' : 'tareas pendientes'} con esta etiqueta`}
      />
      <TaskList tasks={tasks} add={{ defaults: { tags: [tag] } }} />
    </Page>
  )
}
