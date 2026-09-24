import { useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays } from 'lucide-react'
import { mutateTask } from '@/db/actions'
import type { Task } from '@/db/types'
import { dateLabel } from '@/lib/dates'
import { toast } from '@/app/store'

/**
 * Arrastrar una tarea a otro día (Calendario y Próximo). Con ratón empieza al
 * moverla; en pantallas táctiles, con una pulsación larga, para no estorbar al
 * scroll. Los destinos son elementos con data-drop-day="YYYY-MM-DD".
 */
interface DragState {
  task: Task
  x: number
  y: number
  /** día bajo el puntero */
  over: string | null
}

let state: DragState | null = null
const listeners = new Set<() => void>()
function set(next: DragState | null) {
  state = next
  listeners.forEach((l) => l())
}
function useDrag() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

const LONG_PRESS = 350
const dayAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('[data-drop-day]')?.getAttribute('data-drop-day') ?? null

/** Tras soltar, el clic que genera el navegador no debe abrir la tarea */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400)
}

export async function moveTaskToDay(task: Task, day: string) {
  if (task.dueDate === day) return
  const prev = task.dueDate
  await mutateTask(task.id, (t) => {
    t.dueDate = day
  })
  toast(`${task.title} → ${dateLabel(day).toLowerCase()}`, {
    label: 'Deshacer',
    run: () =>
      void mutateTask(task.id, (t) => {
        if (prev) t.dueDate = prev
        else delete t.dueDate
      }),
  })
}

function startDrag(e: React.PointerEvent, task: Task) {
  if (e.button !== 0) return
  // La casilla, los enlaces y los campos funcionan como siempre
  if ((e.target as HTMLElement).closest('[role=checkbox], a, input, textarea, select')) return
  const touch = e.pointerType === 'touch'
  const sx = e.clientX
  const sy = e.clientY
  let x = sx
  let y = sy
  let started = false
  let raf = 0
  const main = document.getElementById('main')

  const begin = () => {
    started = true
    set({ task, x, y, over: dayAt(x, y) })
    if (touch) navigator.vibrate?.(10)
    document.body.style.userSelect = 'none'
    // Desplazarse al acercarse a los bordes
    const edge = () => {
      if (!main) return
      const h = window.innerHeight
      if (y < 90) main.scrollBy(0, -Math.ceil((90 - y) / 6))
      else if (y > h - 110) main.scrollBy(0, Math.ceil((y - (h - 110)) / 6))
      if (state) set({ ...state, over: dayAt(x, y) })
      raf = requestAnimationFrame(edge)
    }
    raf = requestAnimationFrame(edge)
  }
  const timer = touch ? setTimeout(begin, LONG_PRESS) : undefined

  const move = (ev: PointerEvent) => {
    x = ev.clientX
    y = ev.clientY
    if (!started) {
      const dist = Math.hypot(x - sx, y - sy)
      // En táctil, moverse antes de la pulsación larga es hacer scroll
      if (touch) return void (dist > 10 && cleanup())
      if (dist < 6) return
      begin()
    }
    set({ task, x, y, over: dayAt(x, y) })
  }
  const blockScroll = (ev: TouchEvent) => {
    if (started) ev.preventDefault()
  }
  const cleanup = () => {
    clearTimeout(timer)
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    document.removeEventListener('touchmove', blockScroll)
    document.body.style.userSelect = ''
  }
  const up = () => {
    const over = state?.over
    cleanup()
    if (!started) return
    set(null)
    swallowNextClick()
    if (over) void moveTaskToDay(task, over)
  }
  const cancel = () => {
    cleanup()
    if (started) set(null)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  document.addEventListener('touchmove', blockScroll, { passive: false })
}

/** Props para hacer arrastrable algo que representa una tarea */
export function dragToDay(task: Task) {
  return {
    onPointerDown: (e: React.PointerEvent) => startDrag(e, task),
    style: { WebkitTouchCallout: 'none' } as React.CSSProperties,
  }
}

/** ¿Se está arrastrando algo sobre este día? */
export function useDropOver(day: string) {
  const s = useDrag()
  return !!s && s.over === day && s.task.dueDate !== day
}

/** La tarea que sigue al puntero mientras se arrastra */
export function DragGhost() {
  const s = useDrag()
  return (
    <AnimatePresence>
      {s && (
        <motion.div
          key="ghost"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.12 }}
          className="glass-thick pointer-events-none fixed z-[90] flex max-w-[260px] items-center gap-2 rounded-full py-1.5 pr-3.5 pl-2 text-[14px] font-medium"
          style={{ left: s.x + 12, top: s.y + 12 }}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white">
            <CalendarDays size={13} strokeWidth={2.6} />
          </span>
          <span className="min-w-0 truncate">{s.task.title}</span>
          {s.over && s.over !== s.task.dueDate && <span className="shrink-0 font-semibold text-blue">→ {dateLabel(s.over)}</span>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
