import { useSyncExternalStore } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { CalendarDays, Columns3, Grid2x2 } from 'lucide-react'
import { mutateTask } from '@/db/actions'
import type { Task } from '@/db/types'
import { dateLabel } from '@/lib/dates'
import { toast } from '@/app/store'

/**
 * Arrastrar una tarea a otro día (Calendario y Próximo), a otra columna del
 * tablero de un proyecto o a otro cuadrante de la matriz. Con ratón empieza al
 * moverla; en pantallas táctiles, con una pulsación larga, para no estorbar al
 * scroll. Los destinos son elementos con data-drop-<tipo>="<valor>"
 * (data-drop-day="YYYY-MM-DD", data-drop-section="<id>"…) y data-drop-label
 * con el nombre que enseña la etiqueta que sigue al puntero.
 */
type Kind = 'day' | 'section' | 'quadrant'

/** A dónde se arrastra: el tipo de destino, de dónde sale y qué hacer al soltar */
export interface DropKind {
  kind: Kind
  from?: string
  drop: (task: Task, to: string, label: string) => void
}

const DAY: DropKind['drop'] = (task, to) => void moveTaskToDay(task, to)

interface DragState {
  task: Task
  kind: Kind
  from?: string
  x: number
  y: number
  /** destino bajo el puntero */
  over: string | null
  overLabel?: string
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
function targetAt(kind: Kind, x: number, y: number) {
  const el = document.elementFromPoint(x, y)?.closest(`[data-drop-${kind}]`)
  return { over: el?.getAttribute(`data-drop-${kind}`) ?? null, overLabel: el?.getAttribute('data-drop-label') ?? undefined }
}

/** Tras soltar, el clic que genera el navegador no debe abrir la tarea */
export function swallowNextClick() {
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

export async function moveTaskToSection(task: Task, sectionId: string, name: string) {
  const to = sectionId === '-' ? undefined : sectionId
  if (task.sectionId === to) return
  const prev = task.sectionId
  await mutateTask(task.id, (t) => {
    if (to) t.sectionId = to
    else delete t.sectionId
  })
  toast(`${task.title} → ${name}`, {
    label: 'Deshacer',
    run: () =>
      void mutateTask(task.id, (t) => {
        if (prev) t.sectionId = prev
        else delete t.sectionId
      }),
  })
}

function startDrag(e: React.PointerEvent, task: Task, { kind, from, drop }: DropKind, onHold?: () => void) {
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
  // El tablero se desplaza en horizontal
  const row = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-drag-scroll-x]')

  const begin = () => {
    started = true
    set({ task, kind, from, x, y, ...targetAt(kind, x, y) })
    if (touch) navigator.vibrate?.(10)
    document.body.style.userSelect = 'none'
    // Desplazarse al acercarse a los bordes
    const edge = () => {
      if (!main) return
      const h = window.innerHeight
      if (y < 90) main.scrollBy(0, -Math.ceil((90 - y) / 6))
      else if (y > h - 110) main.scrollBy(0, Math.ceil((y - (h - 110)) / 6))
      if (row) {
        const r = row.getBoundingClientRect()
        if (x < r.left + 60) row.scrollBy(-Math.ceil((r.left + 60 - x) / 5), 0)
        else if (x > r.right - 60) row.scrollBy(Math.ceil((x - (r.right - 60)) / 5), 0)
      }
      if (state) set({ ...state, ...targetAt(kind, x, y) })
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
    set({ task, kind, from, x, y, ...targetAt(kind, x, y) })
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
    const label = state?.overLabel
    cleanup()
    if (!started) return
    set(null)
    swallowNextClick()
    // Con el dedo, mantener pulsado y soltar sin moverla es pedir su menú (como en iOS)
    if (touch && onHold && Math.hypot(x - sx, y - sy) < 12) return onHold()
    if (over && over !== from) drop(task, over, label ?? '')
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
export function dragTask(task: Task, to: DropKind, onHold?: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent) => startDrag(e, task, to, onHold),
    style: { WebkitTouchCallout: 'none' } as React.CSSProperties,
  }
}

export const dragToDay = (task: Task, onHold?: () => void) => dragTask(task, { kind: 'day', from: task.dueDate, drop: DAY }, onHold)

export const dragToSection = (task: Task) =>
  dragTask(task, { kind: 'section', from: task.sectionId ?? '-', drop: (t, to, label) => void moveTaskToSection(t, to, label) })

/** ¿Se está arrastrando algo sobre este día (o esta columna, o este cuadrante)? */
export function useDropOver(target: string, kind: Kind = 'day') {
  const s = useDrag()
  return !!s && s.kind === kind && s.over === target && s.from !== target
}

/** La tarea que se está arrastrando (para atenuar su tarjeta) */
export function useDragging(id: string) {
  const s = useDrag()
  return s?.task.id === id
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
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white">
            {s.kind === 'day' ? <CalendarDays size={13} strokeWidth={2.6} /> : s.kind === 'section' ? <Columns3 size={13} strokeWidth={2.6} /> : <Grid2x2 size={13} strokeWidth={2.6} />}
          </span>
          <span className="min-w-0 truncate">{s.task.title}</span>
          {s.over && s.over !== s.from && (
            <span className="shrink-0 font-semibold text-blue">→ {s.kind === 'day' ? dateLabel(s.over) : s.overLabel}</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
