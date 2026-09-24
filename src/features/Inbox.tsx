import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence } from 'motion/react'
import { Inbox as InboxIcon, Layers } from 'lucide-react'
import { useOpenTasks } from '@/db/hooks'
import { isInbox } from '@/lib/tasks'
import { SectionIcon, section } from '@/app/sections'
import { TaskList } from '@/components/TaskList'
import { Button, Empty, PageHeader } from '@/components/ui'
import { Page } from './Page'
import { SelectButton } from '@/features/select/SelectionBar'
import { InboxProcess } from './InboxProcess'

export function InboxView() {
  const tasks = useOpenTasks()
  const [processing, setProcessing] = useState<string[] | null>(null)
  if (!tasks) return null
  const inbox = tasks.filter(isInbox)
  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('inbox')} size={40} />}
        title="Bandeja de entrada"
        subtitle="Lo que capturas sin fecha ni lista. Procésalo a menudo: ponle fecha, muévelo o bórralo."
        actions={
          <>
            {inbox.length > 1 && (
              <Button variant="primary" onClick={() => setProcessing(inbox.map((t) => t.id))}>
                <Layers size={16} strokeWidth={2.4} /> Procesar
              </Button>
            )}
            <SelectButton />
          </>
        }
      />
      <TaskList
        tasks={inbox}
        add={{ color: 'var(--c-gray)' }}
        empty={<Empty icon={<InboxIcon size={28} strokeWidth={2.2} />} title="Bandeja vacía" hint="Tu cabeza está despejada. Pulsa N para capturar cualquier cosa." />}
      />
      {/* En un portal: la pantalla se anima con transform y eso rompería el position: fixed */}
      {createPortal(
        <AnimatePresence>
          {processing && (
            // Las tareas del mazo se fijan al empezar: las que se procesan salen de la bandeja
            <InboxProcess tasks={tasks.filter((t) => processing.includes(t.id) && isInbox(t))} onClose={() => setProcessing(null)} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </Page>
  )
}
