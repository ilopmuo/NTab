import { memo, useEffect, useRef, useState } from 'react'
import { motion, useTransform, type MotionValue } from 'motion/react'
import { Bell, Check, ChevronRight, Clock, Hourglass, ListChecks, Repeat, RotateCcw, StickyNote, Sunrise } from 'lucide-react'
import { durationLabel } from '@/lib/duration'
import type { Task } from '@/db/types'
import { db } from '@/db/db'
import type { Lookup } from '@/db/hooks'
import { mutateTask, toggleTask } from '@/db/actions'
import { addDaysYmd, dateLabel, today } from '@/lib/dates'
import { haptic } from '@/lib/haptics'
import { useSwipe } from './swipe'
import { PRIORITY_COLOR, dateColor } from '@/lib/tasks'
import { recurrenceLabel } from '@/lib/recurrence'
import { toast, ui, useUI } from '@/app/store'
import { bouncy, cx } from './ui'
import { dragToDay } from './dayDrag'
import { selection, useIsPicked, useSelecting } from '@/features/select/selection'

/** Casilla redonda de Recordatorios: se rellena con un muelle y el ✓ se dibuja */
export function Checkbox({
  checked,
  onChange,
  priority = 0,
  size = 22,
  label,
  color = 'var(--c-green)',
}: {
  checked: boolean
  onChange: () => void
  priority?: number
  size?: number
  label?: string
  color?: string
}) {
  const ring = priority ? PRIORITY_COLOR[priority] : 'var(--c-faint)'
  // Chispas solo cuando se marca (no al cargar una tarea ya hecha)
  const was = useRef(checked)
  const [burst, setBurst] = useState(0)
  useEffect(() => {
    if (checked && !was.current) setBurst((b) => b + 1)
    was.current = checked
  }, [checked])
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? 'Marcar como pendiente' : 'Completar')}
      whileTap={{ scale: 0.82 }}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className="group/cb relative flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 rounded-full border-[1.6px] transition-colors" style={{ borderColor: checked ? color : ring }} />
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ background: color }}
        initial={false}
        animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
        transition={bouncy}
      />
      {!checked && (
        <span className="absolute inset-[4px] rounded-full opacity-0 transition-opacity group-hover/cb:opacity-100" style={{ background: `color-mix(in srgb, ${ring} 22%, transparent)` }} />
      )}
      {burst > 0 && <Sparks key={burst} size={size} color={color} />}
      <svg viewBox="0 0 16 16" className="relative" style={{ width: size * 0.6, height: size * 0.6 }}>
        <motion.path
          d="M3.5 8.4l3 3 6-6.6"
          fill="none"
          stroke="var(--c-on-green)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.28, delay: checked ? 0.08 : 0, ease: [0.3, 0.8, 0.3, 1] }}
        />
      </svg>
    </motion.button>
  )
}

/** Chispas que salen de la casilla al completar */
function Sparks({ size, color }: { size: number; color: string }) {
  const n = 8
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      <motion.span
        className="absolute inset-0 rounded-full border-2"
        style={{ borderColor: color }}
        initial={{ scale: 1, opacity: 0.7 }}
        animate={{ scale: 2.1, opacity: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
      />
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2
        const d = size * (i % 2 ? 0.95 : 1.25)
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 rounded-full"
            style={{ width: i % 2 ? 3 : 4, height: i % 2 ? 3 : 4, marginLeft: i % 2 ? -1.5 : -2, marginTop: i % 2 ? -1.5 : -2, background: i % 4 === 3 ? 'var(--c-blue)' : color }}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, scale: [0.4, 1.2, 0], opacity: [1, 1, 0] }}
            transition={{ duration: 0.55, ease: [0.15, 0.8, 0.3, 1] }}
          />
        )
      })}
    </span>
  )
}

export async function completeWithFeedback(task: Task) {
  const wasDone = !!task.done
  if (!wasDone) haptic('success')
  const next = await toggleTask(task)
  if (wasDone) return
  const msg = next?.dueDate ? `Hecho · se repite ${dateLabel(next.dueDate).toLowerCase()}` : 'Hecho'
  toast(msg, {
    label: 'Deshacer',
    run: async () => {
      await db.transaction('rw', db.tasks, async () => {
        if (next) await db.tasks.delete(next.id)
        await db.tasks.update(task.id, { done: 0, completedAt: undefined, recurrence: task.recurrence })
      })
    },
  })
}

const BANGS = ['', '!', '!!', '!!!']

/** Lo que aparece detrás de la fila al deslizarla (solo en la franja descubierta) */
function SwipeBackdrop({ x, armed, done, later }: { x: MotionValue<number>; armed: 'left' | 'right' | null; done: boolean; later: string }) {
  const rightW = useTransform(x, (v) => Math.max(0, v))
  const leftW = useTransform(x, (v) => Math.max(0, -v))
  return (
    <>
      <motion.div
        aria-hidden
        style={{ width: rightW }}
        className={cx('absolute inset-y-0 left-0 flex items-center overflow-hidden transition-colors duration-150', armed === 'right' ? (done ? 'bg-fg text-bg' : 'bg-green text-on-green') : 'bg-fill text-muted')}
      >
        <motion.span animate={{ scale: armed === 'right' ? 1.15 : 0.85 }} transition={bouncy} className="ml-5 flex shrink-0 items-center gap-1.5 text-[13px] font-bold">
          {done ? <RotateCcw size={19} strokeWidth={2.6} /> : <Check size={20} strokeWidth={3} />}
          {done ? 'Pendiente' : 'Hecha'}
        </motion.span>
      </motion.div>
      <motion.div
        aria-hidden
        style={{ width: leftW }}
        className={cx('absolute inset-y-0 right-0 flex items-center justify-end overflow-hidden transition-colors duration-150', armed === 'left' ? 'bg-blue text-white' : 'bg-fill text-muted')}
      >
        <motion.span animate={{ scale: armed === 'left' ? 1.15 : 0.85 }} transition={bouncy} className="mr-5 flex shrink-0 items-center gap-1.5 text-[13px] font-bold">
          {later}
          <Sunrise size={19} strokeWidth={2.4} />
        </motion.span>
      </motion.div>
    </>
  )
}

/** Marca de selección (en lugar de la casilla mientras se eligen tareas) */
function PickMark({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={on ? 'Quitar de la selección' : 'Seleccionar'}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cx('flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.6px] transition-colors', on ? 'border-blue bg-blue text-white' : 'border-faint')}
    >
      {on && (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <path d="M3.5 8.4l3 3 6-6.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

export const TaskItem = memo(function TaskItem({
  task,
  lookup,
  hideDate,
  hideProject,
  compact,
  draggable,
}: {
  task: Task
  lookup: Lookup
  hideDate?: boolean
  hideProject?: boolean
  compact?: boolean
  /** se puede arrastrar a otro día (Calendario, Próximo) */
  draggable?: boolean
}) {
  const selected = useUI((s) => s.selectedTaskId === task.id)
  const picking = useSelecting()
  const picked = useIsPicked(task.id)
  const drag = draggable ? dragToDay(task) : ({} as Partial<ReturnType<typeof dragToDay>>)
  // Deslizar: → hecha (o pendiente otra vez), ← a mañana (o un día más tarde)
  const t0 = today()
  const tomorrow = addDaysYmd(t0, 1)
  const laterDay = task.dueDate && task.dueDate >= tomorrow ? addDaysYmd(task.dueDate, 1) : tomorrow
  const laterLabel = laterDay === tomorrow ? 'Mañana' : '+1 día'
  const swipe = useSwipe({
    disabled: picking,
    right: { run: () => completeWithFeedback(task) },
    left: task.done
      ? undefined
      : {
          run: async () => {
            const prev = { dueDate: task.dueDate, dueTime: task.dueTime }
            await mutateTask(task.id, (x) => {
              x.dueDate = laterDay
              delete x.dueTime
            })
            toast(`${task.title} → ${dateLabel(laterDay, t0).toLowerCase()}`, {
              label: 'Deshacer',
              run: () =>
                void mutateTask(task.id, (x) => {
                  if (prev.dueDate) x.dueDate = prev.dueDate
                  else delete x.dueDate
                  if (prev.dueTime) x.dueTime = prev.dueTime
                }),
            })
          },
        },
  })
  const [completing, setCompleting] = useState(false)
  const checked = !!task.done || completing
  const t = today()
  const project = lookup.project(task.projectId)
  const area = lookup.area(task.areaId ?? project?.areaId)
  const subDone = task.subtasks.filter((s) => s.done).length

  const onToggle = () => {
    if (task.done) return void completeWithFeedback(task)
    setCompleting(true)
    setTimeout(() => {
      void completeWithFeedback(task)
      setCompleting(false)
    }, 520)
  }

  const meta: React.ReactNode[] = []
  if (task.dueDate && !hideDate) {
    meta.push(
      <span key="d" className="font-medium" style={{ color: task.done ? undefined : dateColor(task.dueDate, t) }}>
        {dateLabel(task.dueDate, t)}
      </span>,
    )
  }
  if (task.dueTime) {
    meta.push(
      <span key="t" className="inline-flex items-center gap-1">
        <Clock size={11} strokeWidth={2.4} />
        {task.dueTime}
      </span>,
    )
  }
  if (task.estimate) {
    meta.push(
      <span key="e" className="inline-flex items-center gap-1" title="Duración estimada">
        <Hourglass size={11} strokeWidth={2.4} />
        {durationLabel(task.estimate)}
      </span>,
    )
  }
  if (task.remindAt && !task.done && task.remindAt > Date.now()) {
    meta.push(<Bell key="b" size={11} strokeWidth={2.4} aria-label="Con aviso" />)
  }
  if (task.recurrence) {
    meta.push(
      <span key="r" className="inline-flex items-center gap-1" title={recurrenceLabel(task.recurrence)}>
        <Repeat size={11} strokeWidth={2.4} />
        {!compact && recurrenceLabel(task.recurrence)}
      </span>,
    )
  }
  if (task.subtasks.length) {
    meta.push(
      <span key="s" className="font-num inline-flex items-center gap-1">
        <ListChecks size={12} strokeWidth={2.2} />
        {subDone}/{task.subtasks.length}
      </span>,
    )
  }
  if (task.notes.trim()) meta.push(<StickyNote key="n" size={11} strokeWidth={2.4} />)
  if (!hideProject && (project || area)) {
    meta.push(
      <span key="p" className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-faint" />
        {project?.name ?? area?.name}
      </span>,
    )
  }
  for (const id of task.people ?? []) {
    const p = lookup.person(id)
    if (p) meta.push(<span key={`@${id}`} className="font-medium text-fg/80">@{p.name.trim().split(/\s+/)[0]}</span>)
  }
  for (const tag of task.tags) {
    meta.push(
      <a key={`#${tag}`} href={`#/tag/${encodeURIComponent(tag)}`} onClick={(e) => e.stopPropagation()} className="text-blue hover:underline">
        #{tag}
      </a>,
    )
  }

  return (
    <div className="relative touch-pan-y">
      <SwipeBackdrop x={swipe.x} armed={swipe.armed} done={!!task.done} later={laterLabel} />
      <motion.div
        role="button"
        tabIndex={0}
        {...drag}
        onPointerDown={(e) => {
          drag.onPointerDown?.(e)
          swipe.onPointerDown(e)
        }}
        style={{ ...drag.style, x: swipe.x }}
        data-task-id={task.id}
        aria-pressed={picking ? picked : undefined}
        onClick={(e) => {
          if (swipe.swiped.current) return
          // Ctrl/⌘ + clic, o con la selección activa: marcar en vez de abrir
          if (picking || e.metaKey || e.ctrlKey) return selection.toggle(task.id)
          ui.openTask(task.id)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') return picking ? selection.toggle(task.id) : ui.openTask(task.id)
          if (e.key === ' ') {
            e.preventDefault()
            if (picking) selection.toggle(task.id)
            else onToggle()
          }
        }}
        className={cx(
          'group relative flex cursor-default items-start gap-3 px-4 outline-none transition-colors duration-150',
          draggable && 'select-none',
          compact ? 'py-2' : 'py-[11px]',
          picked || (selected && !picking) ? 'bg-accent-soft' : 'hover:bg-hover focus-visible:bg-hover active:bg-press',
        )}
      >
        <div className="pt-px">
          {picking ? <PickMark on={picked} onClick={() => selection.toggle(task.id)} /> : <Checkbox checked={checked} onChange={onToggle} priority={task.priority} />}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cx(
              'text-[15px] leading-[21px] transition-colors duration-300',
              checked ? 'text-faint line-through decoration-[1.5px]' : 'text-fg',
            )}
          >
            {task.priority > 0 && !checked && (
              <span className="mr-1 font-bold" style={{ color: PRIORITY_COLOR[task.priority] }}>
                {BANGS[task.priority]}
              </span>
            )}
            {task.title || <span className="text-faint">Sin título</span>}
          </p>
          {meta.length > 0 && (
            <div className={cx('mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-muted', checked && 'opacity-50')}>
              {meta}
            </div>
          )}
        </div>
        <ChevronRight size={16} className="mt-0.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
      </motion.div>
    </div>
  )
})
