import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, Reorder, useDragControls } from 'motion/react'
import { ArrowDownUp, GripVertical } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import type { Task } from '@/db/types'
import type { Lookup } from '@/db/hooks'
import { isFresh, moveItem, orderIn, renumber, reorderUpdates, sortTasks } from '@/lib/tasks'
import { haptic } from '@/lib/haptics'
import { useSelecting } from '@/features/select/selection'
import { TaskItem } from './TaskItem'
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
async function saveOrders(key: string, ups: { id: string; order: number }[]) {
  if (!ups.length) return
  await db.transaction('rw', db.tasks, () =>
    Promise.all(ups.map((u) => db.tasks.where('id').equals(u.id).modify((t) => void (t.orders = { ...t.orders, [key]: u.order })))),
  )
}

async function persist(key: string, list: Task[], movedId: string) {
  await saveOrders(key, reorderUpdates(list.map((t) => ({ id: t.id, order: orderIn(t, key) })), movedId))
}

/** Filas que se ordenan arrastrando el asa (o con ↑/↓ sobre ella) */
export function ManualRows({
  listKey,
  tasks,
  lookup,
  rowClass,
  hideDate,
  hideProject,
  compact,
}: {
  listKey: string
  tasks: Task[]
  lookup: Lookup
  rowClass: string
  hideDate?: boolean
  hideProject?: boolean
  compact?: boolean
}) {
  const picking = useSelecting()
  // Mientras se arrastra, el orden es local; al soltar se guarda y vuelve de la base de datos
  const [items, setItems] = useState(tasks)
  const dragging = useRef(false)
  useEffect(() => {
    if (!dragging.current) setItems(tasks)
  }, [tasks])
  const latest = useRef(items)
  latest.current = items

  const byKeyboard = (id: string, dir: -1 | 1) => {
    // El orden más reciente: dos pulsaciones seguidas pueden llegar antes de volver a pintar
    const cur = latest.current
    const from = cur.findIndex((t) => t.id === id)
    const to = from + dir
    if (from < 0 || to < 0 || to >= cur.length || cur[to].done) return
    const next = moveItem(cur, from, to)
    latest.current = next
    setItems(next)
    void persist(listKey, next, id)
  }

  return (
    <Reorder.Group as="div" axis="y" values={items} onReorder={setItems}>
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <Row
            key={t.id}
            task={t}
            className={rowClass}
            handle={!picking && !t.done}
            onStart={() => {
              dragging.current = true
              haptic()
            }}
            onEnd={() => {
              dragging.current = false
              void persist(listKey, latest.current, t.id)
            }}
            onKey={(dir) => byKeyboard(t.id, dir)}
          >
            <TaskItem task={t} lookup={lookup} hideDate={hideDate} hideProject={hideProject} compact={compact} />
          </Row>
        ))}
      </AnimatePresence>
    </Reorder.Group>
  )
}

function Row({
  task,
  className,
  handle,
  onStart,
  onEnd,
  onKey,
  children,
}: {
  task: Task
  className: string
  handle: boolean
  onStart: () => void
  onEnd: () => void
  onKey: (dir: -1 | 1) => void
  children: React.ReactNode
}) {
  const controls = useDragControls()
  const [lifted, setLifted] = useState(false)
  return (
    <Reorder.Item
      as="div"
      value={task}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => {
        setLifted(true)
        onStart()
      }}
      onDragEnd={() => {
        setLifted(false)
        onEnd()
      }}
      exit={{ opacity: 0, height: 0, overflow: 'hidden', transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
      whileDrag={{ scale: 1.02 }}
      className={cx(className, 'relative flex items-stretch', lifted && 'z-10 rounded-xl bg-surface shadow-[var(--c-shadow-lg)]', isFresh(task) && 'just-added')}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {handle && (
        <button
          type="button"
          aria-label={`Mover «${task.title}» (flechas arriba y abajo)`}
          title="Arrastra para ordenar"
          onPointerDown={(e) => {
            e.stopPropagation()
            controls.start(e)
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              e.stopPropagation()
              onKey(e.key === 'ArrowUp' ? -1 : 1)
            }
          }}
          className="flex w-10 shrink-0 cursor-grab touch-none items-center justify-center text-faint outline-none hover:text-muted focus-visible:text-accent active:cursor-grabbing"
        >
          <GripVertical size={17} />
        </button>
      )}
    </Reorder.Item>
  )
}
