import { useLiveQuery } from 'dexie-react-hooks'
import { Telescope } from 'lucide-react'
import { db } from '@/db/db'
import { isSomeday } from '@/lib/tasks'
import { SectionIcon, section } from '@/app/sections'
import { TaskList } from '@/components/TaskList'
import { Empty, Group, PageHeader } from '@/components/ui'
import { SelectButton } from '@/features/select/SelectButton'
import { Page } from '../Page'

/**
 * «Algún día» (como en Things y en GTD): lo que no es para ahora pero no
 * quieres olvidar. No sale en la Bandeja ni en Hoy; se repasa en la revisión
 * semanal y, cuando toca, se le pone fecha.
 */
export function SomedayView() {
  const tasks = useLiveQuery(() => db.tasks.where('done').equals(0).toArray().then((l) => l.filter(isSomeday)), [])
  if (!tasks) return null
  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('someday')} size={40} />}
        title="Algún día"
        subtitle="Ideas y cosas que no son para ahora. Cuando toque, ponles fecha."
        actions={tasks.length ? <SelectButton /> : undefined}
      />
      {tasks.length === 0 ? (
        <Group>
          <Empty
            icon={<Telescope size={28} strokeWidth={2.2} />}
            title="Nada para algún día"
            hint="Escribe «algún día» al capturar («Aprender a tocar el piano algún día») o mándalas aquí desde la Bandeja."
          />
        </Group>
      ) : (
        <TaskList tasks={tasks} orderKey="someday" hideDate add={{ defaults: { someday: true }, placeholder: 'Algo para algún día' }} />
      )}
    </Page>
  )
}
