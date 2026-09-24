import { Inbox as InboxIcon } from 'lucide-react'
import { useOpenTasks } from '@/db/hooks'
import { isInbox } from '@/lib/tasks'
import { SectionIcon, section } from '@/app/sections'
import { TaskList } from '@/components/TaskList'
import { Empty, PageHeader } from '@/components/ui'
import { Page } from './Page'
import { SelectButton } from '@/features/select/SelectionBar'

export function InboxView() {
  const tasks = useOpenTasks()
  if (!tasks) return null
  const inbox = tasks.filter(isInbox)
  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('inbox')} size={40} />}
        title="Bandeja de entrada"
        subtitle="Lo que capturas sin fecha ni lista. Procésalo a menudo: ponle fecha, muévelo o bórralo."
        actions={<SelectButton />}
      />
      <TaskList
        tasks={inbox}
        add={{ color: 'var(--c-gray)' }}
        empty={<Empty icon={<InboxIcon size={28} strokeWidth={2.2} />} title="Bandeja vacía" hint="Tu cabeza está despejada. Pulsa N para capturar cualquier cosa." />}
      />
    </Page>
  )
}
