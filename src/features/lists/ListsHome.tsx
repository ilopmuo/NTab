import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, Grid2x2, Telescope, UserRoundCheck } from 'lucide-react'
import { db } from '@/db/db'
import { useOpenTasks } from '@/db/hooks'
import { isSomeday } from '@/lib/tasks'
import { SectionIcon, section } from '@/app/sections'
import { useFeatures } from '@/app/features'
import { PageHeader } from '@/components/ui'
import { Tile } from '@/components/Tile'
import { Page } from '../Page'
import { SmartListsBlock } from './SmartListsView'
import { TagsBlock } from '../tags/TagsView'

/**
 * Listas: todo lo que no es ni de hoy ni de un proyecto, en un solo sitio (como
 * la portada de Recordatorios). Arriba, las listas de siempre (Algún día, A la
 * espera, Completadas y la Matriz); debajo, tus filtros guardados y tus
 * etiquetas. Antes eran seis pestañas repartidas en dos sitios.
 */
export function ListsHome() {
  const open = useOpenTasks()
  const { on } = useFeatures()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const doneToday = useLiveQuery(() => db.tasks.where('completedAt').aboveOrEqual(start.getTime()).count(), [start.toDateString()])
  const someday = (open ?? []).filter(isSomeday).length
  const waiting = (open ?? []).filter((t) => !!t.waitingFor).length
  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('lists')} size={40} />}
        title="Listas"
        subtitle="Lo que no es de hoy ni de un proyecto, tus filtros y tus etiquetas."
      />
      <div className="mb-8 grid grid-cols-2 gap-3 @[640px]:grid-cols-4">
        <Tile to="/someday" icon={Telescope} label="Algún día" count={someday} hint="Sin prisa" />
        <Tile to="/waiting" icon={UserRoundCheck} label="A la espera" count={waiting} hint="Depende de otros" />
        <Tile to="/logbook" icon={Archive} label="Completadas" count={doneToday} hint="Hechas hoy" />
        {on('matrix') && <Tile to="/matrix" icon={Grid2x2} label="Matriz" hint="Urgente e importante" />}
      </div>
      {on('lists') && <SmartListsBlock />}
      <TagsBlock />
    </Page>
  )
}
