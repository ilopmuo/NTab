import { ArrowDownUp } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import type { Task } from '@/db/types'
import { orderIn, renumber, sortTasks } from '@/lib/tasks'
import { cx } from './ui'

/**
 * Orden manual por lista (Bandeja, un proyecto, un área, Hoy). Se guarda qué
 * listas van a mano en el ajuste `listOrder`; el orden en sí va en cada tarea
 * (`orders[lista]`, que viaja con la sincronización), así que mover una tarea
 * en Hoy no la mueve en su proyecto.
 */
type Modes = Record<string, 'manual'>

/** Qué listas van a mano (undefined mientras carga) */
export function useListModes() {
  return useLiveQuery(() => db.settings.get('listOrder').then((r) => (r?.value as Modes | undefined) ?? {}), [])
}

export function useListOrder(key: string | undefined) {
  const modes = useListModes()
  return !!key && modes?.[key] === 'manual'
}

async function setListOrder(key: string, manual: boolean, tasks: Task[]) {
  const modes = ((await db.settings.get('listOrder'))?.value as Modes | undefined) ?? {}
  const next = { ...modes }
  if (manual) {
    next[key] = 'manual'
    // Se parte del orden que se ve ahora, para que nada salte
    const open = [...tasks].filter((t) => !t.done).sort(sortTasks)
    await saveOrders(key, renumber(open.map((t) => ({ id: t.id, order: orderIn(t, key) }))))
  } else delete next[key]
  await setSetting('listOrder', next)
}

/** Botón «Orden: automático / manual» para la cabecera de una lista */
export function OrderToggle({ listKey, tasks, iconOnly }: { listKey: string; tasks: Task[]; iconOnly?: boolean }) {
  const manual = useListOrder(listKey)
  const hint = manual ? 'Orden manual: arrastra las tareas. Pulsa para volver al orden automático' : 'Orden automático (fecha, hora y prioridad). Pulsa para ordenar a mano'
  return (
    <button
      type="button"
      onClick={() => void setListOrder(listKey, !manual, tasks)}
      aria-pressed={manual}
      aria-label={iconOnly ? (manual ? 'Orden a mano' : 'Orden automático') : undefined}
      title={hint}
      className={cx(
        'flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold transition-all active:scale-95',
        iconOnly ? 'h-9 w-9' : 'h-8 px-3 text-[13px]',
        manual ? 'bg-accent-soft text-accent-on-soft' : iconOnly ? 'bg-fill text-fg hover:bg-press' : 'text-muted hover:bg-hover hover:text-fg',
      )}
    >
      <ArrowDownUp size={iconOnly ? 16 : 14} strokeWidth={2.4} />
      {!iconOnly && (manual ? 'A mano' : 'Auto')}
    </button>
  )
}

/** Guarda la posición de cada tarea en la lista `key` */
export async function saveOrders(key: string, ups: { id: string; order: number }[]) {
  if (!ups.length) return
  await db.transaction('rw', db.tasks, () =>
    Promise.all(ups.map((u) => db.tasks.where('id').equals(u.id).modify((t) => void (t.orders = { ...t.orders, [key]: u.order })))),
  )
}
