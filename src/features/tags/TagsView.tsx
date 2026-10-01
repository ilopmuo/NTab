import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Hash, MoreHorizontal, Pencil, Pin, Tags, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import { deleteTag, renameTag, restoreTasks } from '@/db/actions'
import { cleanTag, tagStats, type TagStat } from '@/lib/tags'
import { SectionIcon, section } from '@/app/sections'
import { href, vtName } from '@/app/router'
import { toast } from '@/app/store'
import { isPinned, togglePinWithToast, usePins } from '@/app/pins'
import { Menu } from '@/components/Menu'
import { Empty, Group, PageHeader } from '@/components/ui'
import { Page } from '../Page'

/** Todas las etiquetas en uso: cuántas tareas tienen, renombrar (o juntar) y quitar */
export function TagsView() {
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])
  if (!tasks) return null
  const stats = tagStats(tasks)
  const names = stats.map((s) => s.tag)
  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('tags')} size={40} />}
        title="Etiquetas"
        subtitle={stats.length ? `${stats.length} ${stats.length === 1 ? 'etiqueta' : 'etiquetas'}. Se ponen al escribir: «Llamar a Ana #llamadas».` : undefined}
      />
      {stats.length === 0 ? (
        <Group>
          <Empty
            icon={<Tags size={28} strokeWidth={2.2} />}
            title="Aún no hay etiquetas"
            hint="Escribe #algo al capturar una tarea («Comprar pilas #recados») y aparecerá aquí, con todas sus tareas."
          />
        </Group>
      ) : (
        <Group>
          {stats.map((s) => (
            <TagRow key={s.tag} stat={s} names={names} />
          ))}
        </Group>
      )}
    </Page>
  )
}

/** Cambia el nombre (si ya existe otra con ese nombre, se juntan) con opción de deshacer */
export async function renameTagUndoable(from: string, to: string, names: string[]) {
  const clean = cleanTag(to)
  if (!clean || clean === from) return undefined
  const before = await db.tasks.where('tags').equals(from).toArray()
  await renameTag(from, clean)
  const merged = names.includes(clean)
  toast(merged ? `#${from} se ha juntado con #${clean}` : `#${from} ahora es #${clean}`, { label: 'Deshacer', run: () => void restoreTasks(before) })
  return clean
}

export async function deleteTagUndoable(tag: string) {
  const before = await db.tasks.where('tags').equals(tag).toArray()
  await deleteTag(tag)
  toast(`#${tag} quitada de ${before.length} ${before.length === 1 ? 'tarea' : 'tareas'}`, { label: 'Deshacer', run: () => void restoreTasks(before) })
}

/** Menú «…» de una etiqueta (en la lista y en la vista de la etiqueta) */
export function TagMenu({ tag, onRename, total, afterDelete }: { tag: string; onRename: () => void; total: number; afterDelete?: () => void }) {
  const pinned = isPinned(usePins(), 'tag', tag)
  return (
    <Menu
      label={`Opciones de #${tag}`}
      trigger={<MoreHorizontal size={16} strokeWidth={2.4} />}
      items={[
        { label: 'Cambiar el nombre', icon: <Pencil size={14} />, onSelect: onRename },
        { label: pinned ? 'Quitar de Fijados' : 'Fijar en la barra lateral', icon: <Pin size={14} />, onSelect: () => void togglePinWithToast('tag', tag, `#${tag}`) },
        {
          label: 'Quitar la etiqueta',
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => {
            if (total > 1 && !window.confirm(`¿Quitar #${tag} de sus ${total} tareas? Las tareas no se borran.`)) return
            void deleteTagUndoable(tag).then(afterDelete)
          },
        },
      ]}
    />
  )
}

/** Campo para escribir el nombre nuevo de una etiqueta */
export function TagNameInput({ tag, onDone, className }: { tag: string; onDone: (value: string | null) => void; className?: string }) {
  return (
    <input
      autoFocus
      aria-label={`Nuevo nombre para #${tag}`}
      defaultValue={tag}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => onDone(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          onDone(null)
        }
      }}
      className={className ?? 'h-8 min-w-0 flex-1 rounded-lg bg-fill-2 px-2 text-[15px] font-medium'}
    />
  )
}

function TagRow({ stat, names }: { stat: TagStat; names: string[] }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="relative flex min-h-12 items-center gap-3 py-1.5 pr-3 pl-4 after:absolute after:right-0 after:bottom-0 after:left-[56px] after:h-px after:bg-line after:content-[''] last:after:hidden">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fill text-fg" aria-hidden>
        <Hash size={15} strokeWidth={2.6} />
      </span>
      {editing ? (
        <TagNameInput
          tag={stat.tag}
          onDone={(v) => {
            setEditing(false)
            if (v !== null) void renameTagUndoable(stat.tag, v, names)
          }}
        />
      ) : (
        <a href={href(`/tag/${encodeURIComponent(stat.tag)}`)} className="group flex min-w-0 flex-1 items-center gap-2 self-stretch">
          <span className="min-w-0 truncate text-[16px] font-medium" style={{ viewTransitionName: vtName('tag', stat.tag) }}>
            {stat.tag}
          </span>
          <span className="ml-auto shrink-0 text-[14px] text-muted">
            {stat.open ? `${stat.open} ${stat.open === 1 ? 'pendiente' : 'pendientes'}` : 'Todo hecho'}
          </span>
          <ChevronRight size={16} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
        </a>
      )}
      <TagMenu tag={stat.tag} total={stat.total} onRename={() => setEditing(true)} />
    </div>
  )
}
