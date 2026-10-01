import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, Reorder, useDragControls } from 'motion/react'
import { GripVertical } from 'lucide-react'
import type { Task } from '@/db/types'
import type { Lookup } from '@/db/hooks'
import { isFresh, moveItem, orderIn, reorderUpdates } from '@/lib/tasks'
import { haptic } from '@/lib/haptics'
import { useSelecting } from '@/features/select/selection'
import { TaskItem } from './TaskItem'
import { saveOrders } from './ManualOrder'
import { cx } from './ui'

// Aparte del resto (y cargado bajo demanda): arrastrar para ordenar necesita el
// motor completo de animaciones, que no hace falta al arrancar
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
