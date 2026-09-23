import { Inbox as InboxIcon } from 'lucide-react'
import { useOpenTasks } from '@/db/hooks'
import { isInbox } from '@/lib/tasks'
import { InlineAdd, TaskList } from '@/components/TaskList'
import { Empty, PageHeader } from '@/components/ui'
import { Page } from './Page'

export function InboxView() {
  const tasks = useOpenTasks()
  if (!tasks) return null
  const inbox = tasks.filter(isInbox)
  return (
    <Page>
      <PageHeader
        icon={<InboxIcon size={26} className="text-accent" />}
        title="Bandeja de entrada"
        subtitle="Todo lo que capturas sin fecha ni proyecto. Vacíala a menudo: dale fecha, muévelo o bórralo."
      />
      {inbox.length === 0 ? (
        <Empty icon={<InboxIcon size={22} />} title="Bandeja vacía" hint="Tu cabeza está despejada. Pulsa N para capturar algo." />
      ) : (
        <TaskList tasks={inbox} />
      )}
      <InlineAdd />
    </Page>
  )
}
