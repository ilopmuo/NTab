import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m as motion } from 'motion/react'
import { CalendarDays, CheckCircle2, Copy, Pencil, RotateCcw, Star, StarOff, Sun, Sunrise, Telescope, Trash2 } from 'lucide-react'
import type { Task } from '@/db/types'
import { db } from '@/db/db'
import { deleteTask, duplicateTask, mutateTasks, restoreTasks, updateTask } from '@/db/actions'
import { addDaysYmd, dateLabel, today, weekStart } from '@/lib/dates'
import { MAX_IMPORTANT } from '@/lib/day'
import { toast, ui } from '@/app/store'
import { useRoute } from '@/app/router'
import { toastTrashed } from '@/features/trash/undo'
import { completeWithFeedback } from './TaskItem'
import { taskMenu, useTaskMenu, type TaskMenuState } from './taskMenu'
import { cx, spring } from './ui'

interface Item {
  label: string
  icon: ReactNode
  run: () => void | Promise<unknown>
  danger?: boolean
}

const ITEM_H = 44
const SEP_H = 8
const WIDTH = 250
const GAP = 8
const EDGE = 12

async function moveTo(task: Task, day: string) {
  const before = await mutateTasks([task.id], (x) => {
    if (x.dueDate !== day) delete x.dueTime
    x.dueDate = day
    delete x.someday
  })
  toast(`${task.title} → ${dateLabel(day).toLowerCase()}`, { label: 'Deshacer', run: () => void restoreTasks(before) })
}

/** Lo que se puede hacer con una tarea sin abrirla, en grupos (como los menús de iOS) */
function groups(task: Task): Item[][] {
  const t = today()
  const monday = addDaysYmd(weekStart(t), 7)
  const important = task.important === t
  return [
    [
      task.done
        ? { label: 'Pendiente otra vez', icon: <RotateCcw size={17} />, run: () => completeWithFeedback(task) }
        : { label: 'Hecha', icon: <CheckCircle2 size={17} />, run: () => completeWithFeedback(task) },
    ],
    task.done
      ? []
      : [
          ...(task.dueDate === t ? [] : [{ label: 'Hoy', icon: <Sun size={17} />, run: () => moveTo(task, t) }]),
          ...(task.dueDate === addDaysYmd(t, 1) ? [] : [{ label: 'Mañana', icon: <Sunrise size={17} />, run: () => moveTo(task, addDaysYmd(t, 1)) }]),
          { label: 'La semana que viene', icon: <CalendarDays size={17} />, run: () => moveTo(task, monday) },
          ...(task.someday && !task.dueDate
            ? []
            : [
                {
                  label: 'Algún día',
                  icon: <Telescope size={17} />,
                  run: async () => {
                    const before = await mutateTasks([task.id], (x) => {
                      x.someday = true
                      delete x.dueDate
                      delete x.dueTime
                    })
                    toast(`${task.title} → algún día`, { label: 'Deshacer', run: () => void restoreTasks(before) })
                  },
                },
              ]),
        ],
    [
      ...(task.done
        ? []
        : [
            important
              ? { label: 'Quitar de lo importante', icon: <StarOff size={17} />, run: () => updateTask(task.id, { important: undefined }) }
              : {
                  label: 'Importante hoy',
                  icon: <Star size={17} />,
                  run: async () => {
                    // Como mucho tres: lo importante deja de serlo si es todo
                    const already = await db.tasks.filter((x) => x.important === t && !x.done && x.id !== task.id).count()
                    if (already >= MAX_IMPORTANT) return void toast(`Ya tienes ${MAX_IMPORTANT} cosas importantes hoy: quita una antes`)
                    await updateTask(task.id, { important: t, ...(!task.dueDate || task.dueDate > t ? { dueDate: t, someday: undefined } : {}) })
                    toast(`${task.title}: importante hoy`)
                  },
                },
          ]),
      {
        label: 'Duplicar',
        icon: <Copy size={17} />,
        run: async () => {
          await duplicateTask(task)
          toast('Tarea duplicada')
        },
      },
      { label: 'Editar', icon: <Pencil size={17} />, run: () => ui.openTask(task.id) },
    ],
    [
      {
        label: 'A la papelera',
        icon: <Trash2 size={17} />,
        danger: true,
        run: async () => {
          await deleteTask(task.id)
          toastTrashed('Tarea a la papelera', 'tasks', task.id)
        },
      },
    ],
  ].filter((g) => g.length)
}

/**
 * Menú contextual de una tarea, como los de iOS: con el dedo, la fila se
 * levanta (un poco más grande, con sombra) sobre el fondo difuminado y el menú
 * sale debajo (o encima, si no cabe); con el ratón, sale donde se hizo clic.
 * Se recorre con ↑/↓ y se cierra con Esc, tocando fuera o al cambiar de pantalla.
 */
export function TaskContextMenu() {
  const state = useTaskMenu()
  const { path } = useRoute()
  // Al cambiar de pantalla se cierra (pero no al montarse: se monta al abrirlo por primera vez)
  const shown = useRef(path)
  useEffect(() => {
    if (shown.current !== path) taskMenu.close()
    shown.current = path
  }, [path])
  return createPortal(<AnimatePresence>{state && <Overlay key={state.task.id + state.rect.top} state={state} />}</AnimatePresence>, document.body)
}

function Overlay({ state }: { state: TaskMenuState }) {
  const { task, rect, at } = state
  const list = useRef<HTMLDivElement>(null)
  const items = groups(task)
  const height = items.reduce((n, g) => n + g.length * ITEM_H, 0) + (items.length - 1) * SEP_H + 8
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Con ratón: en el puntero. Con el dedo (o el teclado): la fila levantada y el menú pegado a ella
  let preview: { top: number } | undefined
  let menuTop: number
  let menuLeft: number
  if (at) {
    menuTop = Math.min(at.y, vh - height - EDGE)
    menuLeft = Math.min(at.x, vw - WIDTH - EDGE)
  } else {
    // Si no cabe debajo, la fila sube lo justo (como hace iOS)
    const top = Math.max(EDGE + 40, Math.min(rect.top, vh - EDGE - height - GAP - rect.height))
    preview = { top }
    menuTop = top + rect.height + GAP
    menuLeft = Math.min(Math.max(EDGE, rect.left + 12), vw - WIDTH - EDGE)
  }

  useEffect(() => {
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true }))
    const close = () => taskMenu.close()
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    const els = [...(list.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.stopPropagation()
      taskMenu.close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      els[e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length]?.focus()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      taskMenu.close()
    }
  }

  return (
    <div className="fixed inset-0 z-[85]" onKeyDown={onKey}>
      <motion.div
        aria-hidden
        className={cx('absolute inset-0', at ? '' : 'bg-[color-mix(in_srgb,var(--c-bg)_35%,transparent)] backdrop-blur-[10px]')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.18 } }}
        transition={{ duration: 0.22 }}
        onPointerDown={() => taskMenu.close()}
        onContextMenu={(e) => {
          e.preventDefault()
          taskMenu.close()
        }}
      />
      {preview && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute flex items-start gap-3 rounded-[16px] px-4 py-[11px]"
          style={{ left: rect.left, width: rect.width, background: 'var(--c-elevated)' }}
          initial={{ top: rect.top, scale: 1, boxShadow: '0 0 0 rgb(0 0 0 / 0)' }}
          animate={{ top: preview.top, scale: 1.03, boxShadow: '0 18px 50px rgb(0 0 0 / 0.35)' }}
          exit={{ top: rect.top, scale: 1, opacity: 0, transition: { duration: 0.18 } }}
          transition={spring}
        >
          <span className={cx('mt-px h-[22px] w-[22px] shrink-0 rounded-full border-[1.8px]', task.done ? 'border-green bg-green' : 'border-muted')} />
          <span className="min-w-0 flex-1">
            <span className={cx('line-clamp-2 text-[15px] leading-[21px]', task.done && 'text-muted line-through')}>{task.title || 'Sin título'}</span>
            {task.dueDate && <span className="mt-0.5 block text-[13px] text-muted">{dateLabel(task.dueDate)}</span>}
          </span>
        </motion.div>
      )}
      <motion.div
        ref={list}
        role="menu"
        aria-label={`Acciones de «${task.title || 'Sin título'}»`}
        data-task-menu
        className="glass-thick absolute overflow-hidden rounded-[16px] py-1 shadow-[var(--c-shadow-lg)]"
        style={{ top: menuTop, left: menuLeft, width: WIDTH, transformOrigin: at ? 'top left' : `${Math.max(16, rect.left + 40 - menuLeft)}px top` }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.14 } }}
        transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      >
        {items.map((g, gi) => (
          <div key={gi} role="group" className={cx(gi > 0 && 'border-t-[8px] border-[color-mix(in_srgb,var(--c-text)_6%,transparent)]')}>
            {g.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  taskMenu.close()
                  void it.run()
                }}
                className={cx(
                  'flex h-11 w-full items-center gap-3 px-4 text-left text-[16px] outline-none hover:bg-hover focus-visible:bg-hover active:bg-press',
                  '[&+&]:shadow-[inset_0_1px_0_var(--c-border)]',
                  it.danger ? 'text-danger' : 'text-fg',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                <span className={cx('flex w-5 shrink-0 justify-center', it.danger ? 'text-danger' : 'text-fg')}>{it.icon}</span>
              </button>
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  )
}
