import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ListFilter, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import { useLookup, type Lookup } from '@/db/hooks'
import type { Task } from '@/db/types'
import { defaultsFor, describe, filterTasks, PRESETS, type SmartList } from '@/lib/smartLists'
import { deleteSmartList, saveSmartList, useSmartLists } from '@/app/smartLists'
import { SectionIcon, section } from '@/app/sections'
import { href, navigate, vtName } from '@/app/router'
import { setUI, useUI } from '@/app/store'
import { Menu } from '@/components/Menu'
import { TaskList } from '@/components/TaskList'
import { Button, Empty, Group, PageHeader } from '@/components/ui'
import { SelectButton } from '@/features/select/SelectButton'
import { Page } from '../Page'
import { SmartListForm } from './SmartListForm'

/** Nombres legibles para describir una lista («Proyecto Mudanza», «Con Ana») */
export const listNames = (lookup: Lookup) => ({
  list: (v: string) => (v.startsWith('p:') ? lookup.project(v.slice(2))?.name : lookup.area(v.slice(2))?.name),
  person: (id: string) => lookup.person(id)?.name,
})

const openTasks = () => db.tasks.where('done').equals(0).toArray()

/**
 * Listas inteligentes: búsquedas guardadas por fecha, prioridad, etiquetas,
 * lista, persona y duración (como los filtros de Todoist o las listas
 * inteligentes de TickTick). Salen en la barra lateral, bajo «Mis listas».
 */
export function SmartListsView() {
  const lists = useSmartLists()
  const tasks = useLiveQuery(openTasks, []) ?? []
  const lookup = useLookup()
  const creating = useUI((s) => s.creating === 'smartList')
  const presets = PRESETS.filter((p) => !lists.some((l) => l.name === p.name))
  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('lists')} size={40} />}
        title="Listas inteligentes"
        subtitle="Búsquedas guardadas que se actualizan solas: «lo urgente de #trabajo», «lo rápido para hoy»…"
        actions={
          <Button variant="primary" onClick={() => setUI({ creating: 'smartList' })}>
            <Plus size={16} strokeWidth={2.6} /> Nueva
          </Button>
        }
      />
      {lists.length === 0 ? (
        <Group>
          <Empty
            icon={<ListFilter size={28} strokeWidth={2.2} />}
            title="Aún no tienes listas"
            hint="Crea una con «Nueva» o empieza con una de estas ideas. Aparecerán en la barra lateral, bajo «Mis listas»."
          />
        </Group>
      ) : (
        <Group>
          {lists.map((l) => (
            <ListRow key={l.id} list={l} tasks={tasks} lookup={lookup} />
          ))}
        </Group>
      )}
      {presets.length > 0 && (
        <section className="mt-8" aria-labelledby="smart-presets">
          <h2 id="smart-presets" className="mb-2 px-1 text-[13px] font-bold text-muted">
            Ideas para empezar
          </h2>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => void saveSmartList(p)}
                className="hit inline-flex h-9 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[14px] font-medium text-fg transition-colors hover:bg-hover"
              >
                <Plus size={14} strokeWidth={2.6} aria-hidden />
                {p.name}
                <span className="text-muted">· {filterTasks({ ...p, id: '' }, tasks).length}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      <SmartListForm open={creating} onClose={() => setUI({ creating: null })} />
    </Page>
  )
}

function ListRow({ list, tasks, lookup }: { list: SmartList; tasks: Task[]; lookup: Lookup }) {
  const n = filterTasks(list, tasks).length
  return (
    <div className="relative flex min-h-14 items-center gap-3 py-2 pr-3 pl-4 after:absolute after:right-0 after:bottom-0 after:left-[56px] after:h-px after:bg-line after:content-[''] last:after:hidden">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fill text-fg" aria-hidden>
        <ListFilter size={15} strokeWidth={2.4} />
      </span>
      <a href={href(`/list/${list.id}`)} className="group flex min-w-0 flex-1 items-center gap-2 self-stretch">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium" style={{ viewTransitionName: vtName('list', list.id) }}>
            {list.name}
          </span>
          <span className="block truncate text-[13px] text-muted">{describe(list, listNames(lookup))}</span>
        </span>
        <span className="shrink-0 text-[14px] text-muted">{n ? `${n} ${n === 1 ? 'tarea' : 'tareas'}` : 'Vacía'}</span>
        <ChevronRight size={16} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
      </a>
    </div>
  )
}

function ListMenu({ list, onEdit }: { list: SmartList; onEdit: () => void }) {
  return (
    <Menu
      label={`Opciones de ${list.name}`}
      trigger={<MoreHorizontal size={16} strokeWidth={2.4} />}
      items={[
        { label: 'Editar la lista', icon: <Pencil size={14} />, onSelect: onEdit },
        {
          label: 'Borrar la lista',
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => {
            navigate('/lists')
            void deleteSmartList(list.id)
          },
        },
      ]}
    />
  )
}

/** Una lista inteligente: sus tareas, al día */
export function SmartListView({ id }: { id: string }) {
  const lists = useSmartLists()
  const tasks = useLiveQuery(openTasks, [])
  const lookup = useLookup()
  const [editing, setEditing] = useState(false)
  const list = lists.find((l) => l.id === id)
  if (!tasks) return null
  if (!list) {
    return (
      <Page>
        <Group>
          <Empty icon={<ListFilter size={28} strokeWidth={2.2} />} title="Esta lista ya no existe" hint="Puede que la hayas borrado en otro dispositivo.">
            <Button onClick={() => navigate('/lists')}>Ver mis listas</Button>
          </Empty>
        </Group>
      </Page>
    )
  }
  const shown = filterTasks(list, tasks)
  return (
    <Page>
      <PageHeader
        eyebrow={<a href={href('/lists')} className="hover:underline">Listas inteligentes</a>}
        icon={
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-fill text-white">
            <ListFilter size={21} strokeWidth={2.4} />
          </span>
        }
        title={list.name}
        titleName={vtName('list', list.id)}
        subtitle={`${describe(list, listNames(lookup))} · ${shown.length} ${shown.length === 1 ? 'tarea' : 'tareas'}`}
        actions={
          <>
            {shown.length > 0 && <SelectButton />}
            <ListMenu list={list} onEdit={() => setEditing(true)} />
          </>
        }
      />
      <TaskList
        tasks={shown}
        add={{ defaults: defaultsFor(list), placeholder: 'Nueva tarea en esta lista' }}
        empty={<p className="px-4 py-6 text-center text-[15px] text-muted">Nada por aquí ahora mismo. Cuando una tarea cumpla la búsqueda, saldrá sola.</p>}
      />
      <SmartListForm list={list} open={editing} onClose={() => setEditing(false)} />
    </Page>
  )
}
