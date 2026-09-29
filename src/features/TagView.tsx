import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Hash } from 'lucide-react'
import { db } from '@/db/db'
import { TaskList } from '@/components/TaskList'
import { PageHeader } from '@/components/ui'
import { href, navigate } from '@/app/router'
import { Page } from './Page'
import { SelectButton } from '@/features/select/SelectButton'
import { TagMenu, TagNameInput, renameTagUndoable } from './tags/TagsView'

export function TagView({ tag }: { tag: string }) {
  const tasks = useLiveQuery(() => db.tasks.where('tags').equals(tag).toArray(), [tag])
  const names = useLiveQuery(() => db.tasks.orderBy('tags').uniqueKeys(), []) as string[] | undefined
  const [editing, setEditing] = useState(false)
  if (!tasks) return null
  const open = tasks.filter((t) => !t.done)
  const done = tasks.length - open.length
  return (
    <Page>
      <PageHeader
        eyebrow={<a href={href('/tags')} className="hover:underline">Etiquetas</a>}
        icon={
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-fill text-white">
            <Hash size={22} strokeWidth={2.6} />
          </span>
        }
        title={tag}
        subtitle={`${open.length} ${open.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}${done ? ` · ${done} ${done === 1 ? 'hecha' : 'hechas'}` : ''}`}
        actions={
          <>
            <SelectButton />
            <TagMenu tag={tag} total={tasks.length} onRename={() => setEditing(true)} afterDelete={() => navigate('/tags')} />
          </>
        }
      />
      {editing && (
        <div className="glass mb-6 flex items-center gap-2 rounded-[18px] px-4 py-2.5">
          <Hash size={16} strokeWidth={2.6} className="shrink-0 text-muted" aria-hidden />
          <TagNameInput
            tag={tag}
            onDone={(v) => {
              setEditing(false)
              if (v === null) return
              void renameTagUndoable(tag, v, names ?? []).then((to) => to && navigate(`/tag/${encodeURIComponent(to)}`))
            }}
          />
          <span className="shrink-0 text-[13px] text-muted">Intro para guardar</span>
        </div>
      )}
      <TaskList tasks={open} add={{ defaults: { tags: [tag] } }} />
    </Page>
  )
}
