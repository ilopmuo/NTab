import { useLiveQuery } from 'dexie-react-hooks'
import { UserRoundCheck } from 'lucide-react'
import type { Task } from '@/db/types'
import { db } from '@/db/db'
import { SectionIcon, section } from '@/app/sections'
import { TaskList } from '@/components/TaskList'
import { Button, Empty, Group, PageHeader, Section } from '@/components/ui'
import { Page } from '../Page'
import { nudgeAll } from './nudge'

/**
 * «A la espera» (GTD, OmniFocus, Things): lo que depende de otra persona, por
 * persona, con la fecha en que volver a preguntar. No se olvida ni ocupa Hoy
 * hasta que toca; entonces, «Recordárselo» le escribe con todo lo pendiente.
 */
export function WaitingView() {
  const tasks = useLiveQuery(() => db.tasks.where('done').equals(0).filter((t) => !!t.waitingFor).toArray(), [])
  if (!tasks) return null
  const byWho = new Map<string, Task[]>()
  for (const t of [...tasks].sort((a, b) => (a.waitingSince ?? '').localeCompare(b.waitingSince ?? ''))) {
    const key = t.waitingFor!.trim()
    byWho.set(key, [...(byWho.get(key) ?? []), t])
  }
  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('waiting')} size={40} />}
        title="A la espera"
        subtitle={tasks.length ? 'Lo que depende de otra persona. Cuando llega el día, vuelve a Hoy para que preguntes.' : undefined}
      />
      {tasks.length === 0 ? (
        <Group>
          <Empty
            icon={<UserRoundCheck size={28} strokeWidth={2.2} />}
            title="No esperas nada de nadie"
            hint="Escribe «esperando a Ana» al capturar («Presupuesto del fontanero esperando a Luis») o, en una tarea, «A la espera de alguien». En 3 días vuelve a Hoy para que preguntes."
          />
        </Group>
      ) : (
        [...byWho].map(([who, list]) => (
          <Section
            key={who}
            title={who}
            count={list.length}
            action={
              <Button size="sm" variant="tinted" onClick={() => void nudgeAll(list)}>
                Recordárselo
              </Button>
            }
          >
            <TaskList tasks={list} orderKey={`waiting:${who}`} />
          </Section>
        ))
      )}
    </Page>
  )
}
