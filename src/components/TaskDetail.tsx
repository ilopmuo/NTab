import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, Reorder, m as motion, useDragControls } from 'motion/react'
import { AtSign, Bell, Calendar, CalendarClock, CalendarDays, Clock, Copy, Flag, Folder, GripVertical, Hash, Hourglass, ListChecks, Plus, Repeat, Repeat2, Rows3, SkipForward, Timer, Trash2, UserRoundCheck, X } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Recurrence, Reminder, Subtask, Task } from '@/db/types'
import { useLookup, useTask } from '@/db/hooks'
import { deleteTask, duplicateTask, mutateTask, skipOccurrence, updateTask } from '@/db/actions'
import { addDaysYmd, capitalize, dateLabel, fmt, fromYmd, longDateLabel, relativeDays, today, weekStart, ymd, WEEK_ORDER, WEEKDAYS_SHORT } from '@/lib/dates'
import { endOfMonth } from 'date-fns'
import { firstOccurrence, recurrenceLabel } from '@/lib/recurrence'
import { PRIORITY_COLOR, PRIORITY_LABEL, dateColor, moveItem, waitingLabel } from '@/lib/tasks'
import { nudge, onDay, startWaiting, stopWaiting, waitMore } from '@/features/waiting/nudge'
import { uid } from '@/lib/id'
import { durationLabel, parseDuration } from '@/lib/duration'
import { NAG_OPTIONS, REMINDER_OPTIONS, nagLabel, reminderLabel, reminderValue } from '@/lib/reminders'
import { toast, ui, useUI } from '@/app/store'
import { db } from '@/db/db'
import { MAX_IMPORTANT, postponedLabel } from '@/lib/day'
import { taskFocus } from '@/lib/focusStats'
import { Checkbox, completeWithFeedback } from './TaskItem'
import { DatePicker } from './DatePicker'
import { Button, Group, IconButton, Modal, ProgressBar, Segmented, Switch, Textarea, cx, spring, useMediaQuery } from './ui'
import { focus } from '@/features/focus/focus'
import { toastTrashed } from '@/features/trash/undo'

type Field = 'time' | 'reminder' | 'repeat' | 'deadline' | 'estimate' | 'priority' | 'tags' | 'people' | 'waiting'
/** Lo que no hace falta ver hasta que se usa, en el orden de «Añadir» */
const FIELDS: { id: Field; label: string; icon: typeof Clock }[] = [
  { id: 'time', label: 'Hora', icon: Clock },
  { id: 'reminder', label: 'Aviso', icon: Bell },
  { id: 'repeat', label: 'Repetir', icon: Repeat },
  { id: 'deadline', label: 'Fecha límite', icon: CalendarClock },
  { id: 'estimate', label: 'Duración', icon: Hourglass },
  { id: 'priority', label: 'Prioridad', icon: Flag },
  { id: 'tags', label: 'Etiquetas', icon: Hash },
  { id: 'people', label: 'Personas', icon: AtSign },
  { id: 'waiting', label: 'A la espera', icon: UserRoundCheck },
]

/**
 * Detalle de tarea. En pantallas anchas es un inspector lateral de cristal;
 * en el resto, una hoja (en móvil se cierra arrastrando hacia abajo).
 */
export function TaskDetailPanel() {
  const id = useUI((s) => s.selectedTaskId)
  const task = useTask(id)
  const wide = useMediaQuery('(min-width: 1280px)')
  const open = !!id && !!task

  if (!wide) {
    return (
      <Modal open={open} onClose={ui.closeTask} position="center" className="max-w-md">
        {task && <TaskDetail key={task.id} task={task} />}
      </Modal>
    )
  }
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="inspector"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0, transition: { duration: 0.18 } }}
          transition={spring}
          className="glass-thick fixed top-3 right-3 bottom-3 z-40 flex w-[404px] flex-col overflow-hidden rounded-[24px]"
        >
          <div className="flex-1 overflow-y-auto">
            <TaskDetail key={task.id} task={task} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/** Guarda `value` con retardo mientras se escribe, y al desmontar si quedó algo pendiente. */
function useDebounced<T>(value: T, onCommit: (v: T) => void, delay = 300) {
  const initial = useRef(value)
  const pending = useRef<{ v: T } | null>(null)
  const commit = useRef(onCommit)
  commit.current = onCommit
  useEffect(() => {
    if (Object.is(value, initial.current) && !pending.current) return
    pending.current = { v: value }
    const t = setTimeout(() => {
      commit.current(value)
      pending.current = null
    }, delay)
    return () => clearTimeout(t)
  }, [value, delay])
  useEffect(
    () => () => {
      if (pending.current) commit.current(pending.current.v)
    },
    [],
  )
}

/** Icono cuadrado de color de las filas de ajustes */
function Glyph({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill text-fg" data-color={color}>
      {children}
    </span>
  )
}

function Row({
  icon,
  color,
  label,
  value,
  children,
  onClear,
  field,
}: {
  icon: React.ReactNode
  color: string
  label: string
  value?: React.ReactNode
  children?: React.ReactNode
  /** botón "quitar" a la derecha de la fila */
  onClear?: () => void
  /** qué dato es (para llevar el foco a la fila al añadirla) */
  field?: string
}) {
  return (
    <div data-field={field} className="relative px-3.5 py-2.5 after:absolute after:right-0 after:bottom-0 after:left-[58px] after:h-px after:bg-line last:after:hidden">
      <div className="flex min-h-[30px] items-center gap-3">
        <Glyph color={color}>{icon}</Glyph>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-tight">{label}</p>
          {value && <p className="mt-0.5 truncate text-[13px] font-medium" style={{ color }}>{value}</p>}
        </div>
        {onClear && (
          <button type="button" onClick={onClear} className="rounded-full px-2 py-1 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg">
            Quitar
          </button>
        )}
      </div>
      {children && <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[42px]">{children}</div>}
    </div>
  )
}

/** A la espera de alguien (GTD): con quién, desde cuándo, «Recordárselo» y «Ya no espero» */
function WaitingRow({ task, names }: { task: Task; names: string[] }) {
  const [who, setWho] = useState('')
  const [busy, setBusy] = useState(false)
  const run = (fn: () => Promise<unknown>) => {
    setBusy(true)
    void fn().finally(() => setBusy(false))
  }
  if (task.waitingFor)
    return (
      <Row field="waiting" icon={<UserRoundCheck size={15} strokeWidth={2.6} />} color="var(--c-text)" label="A la espera" value={waitingLabel(task, today())} onClear={() => run(() => stopWaiting(task))}>
        {!task.done && (
          <>
            <Pill tone="strong" onClick={() => run(() => nudge(task))}>
              Recordárselo
            </Pill>
            <Pill onClick={() => run(async () => toast(`Lo vuelves a mirar ${onDay(await waitMore(task))}`))}>3 días más</Pill>
          </>
        )}
      </Row>
    )
  return (
    <Row field="waiting" icon={<UserRoundCheck size={15} strokeWidth={2.6} />} color="var(--c-gray)" label="A la espera de alguien">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (who.trim()) run(async () => (await startWaiting(task, who), setWho('')))
        }}
      >
        <input list="waiting-people" value={who} disabled={busy} onChange={(e) => setWho(e.target.value)} placeholder="¿De quién?" aria-label="A la espera de" className={fieldCls} />
        <datalist id="waiting-people">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {who.trim() && (
          <Pill tone="strong" onClick={() => run(async () => (await startWaiting(task, who), setWho('')))}>
            Esperar
          </Pill>
        )}
      </form>
    </Row>
  )
}

/**
 * Elegir el día: atajos (hoy, mañana, el sábado, el lunes que viene) y un
 * calendario propio que se despliega debajo.
 */
function DateChoice({ value, onChange, kind = 'when' }: { value?: string; onChange: (day: string) => void; kind?: 'when' | 'deadline' }) {
  const t = today()
  const [open, setOpen] = useState(false)
  const monday = weekStart(t)
  const saturday = addDaysYmd(monday, 5) < t ? addDaysYmd(monday, 12) : addDaysYmd(monday, 5)
  const friday = addDaysYmd(monday, 4) < t ? addDaysYmd(monday, 11) : addDaysYmd(monday, 4)
  const monthEnd = ymd(endOfMonth(fromYmd(t)))
  // Para hacerla: hoy, mañana, el sábado, el lunes. Para la fecha límite: el viernes, fin de mes
  const presets =
    kind === 'deadline'
      ? [
          { day: friday, label: 'El viernes' },
          { day: addDaysYmd(friday, 7), label: 'El otro viernes' },
          ...(monthEnd > addDaysYmd(friday, 7) ? [{ day: monthEnd, label: 'Fin de mes' }] : []),
        ]
      : [
          { day: t, label: 'Hoy' },
          { day: addDaysYmd(t, 1), label: 'Mañana' },
          ...(saturday > addDaysYmd(t, 1) ? [{ day: saturday, label: 'El sábado' }] : []),
          { day: addDaysYmd(monday, 7), label: 'El lunes' },
        ]
  const other = value && !presets.some((p) => p.day === value)
  return (
    <>
      {presets.map((p) => (
        <Pill key={p.label} active={value === p.day} onClick={() => onChange(p.day)}>
          {p.label}
        </Pill>
      ))}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-all active:scale-95',
          other ? 'bg-accent-fill text-white' : 'bg-fill text-fg hover:bg-press',
        )}
      >
        <CalendarDays size={14} strokeWidth={2.4} aria-hidden />
        {other ? capitalize(fmt(value, 'EEE d MMM')) : kind === 'deadline' ? 'Otra fecha' : 'Otro día'}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="picker"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="basis-full overflow-hidden"
          >
            <DatePicker
              className="pt-2 pb-1"
              value={value}
              onChange={(d) => {
                onChange(d)
                setOpen(false)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** Píldora de elección rápida; activa, en azul (acción) o en el color del texto (neutra) */
function Pill({ active, onClick, children, tone = 'accent' }: { active?: boolean; onClick: () => void; children: React.ReactNode; tone?: 'accent' | 'strong' }) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={cx(
        'h-8 rounded-full px-3 text-[13px] font-semibold transition-all active:scale-95',
        !active ? 'bg-fill text-fg hover:bg-press' : tone === 'accent' ? 'bg-accent-fill text-white' : 'bg-fg text-bg',
      )}
    >
      {children}
    </button>
  )
}

const fieldCls = 'h-8 rounded-full bg-fill px-3 text-[13px] font-medium text-fg'

/** Horas a un toque en el detalle (las demás, con el campo de hora) */
const QUICK_TIMES = ['09:00', '13:00', '18:00', '21:00']

type RepeatKind = 'none' | 'day' | 'weekdays' | 'week' | 'month' | 'year' | 'custom'

function repeatKind(r?: Recurrence): RepeatKind {
  if (!r) return 'none'
  if (r.interval > 1) return 'custom'
  if (r.freq === 'week' && r.weekdays?.length) {
    const w = r.weekdays
    if (w.length === 5 && [1, 2, 3, 4, 5].every((d) => w.includes(d))) return 'weekdays'
    return 'custom'
  }
  return r.freq
}

function TaskDetail({ task }: { task: Task }) {
  const { areas, projects, people, area, project, person } = useLookup()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [tagDraft, setTagDraft] = useState('')
  const [subDraft, setSubDraft] = useState('')
  useDebounced(title, (v) => updateTask(task.id, { title: v.trim() }))
  useDebounced(notes, (v) => updateTask(task.id, { notes: v }))

  const set = (changes: Partial<Task>) => updateTask(task.id, changes)
  const t = today()
  const kind = repeatKind(task.recurrence)
  const overdue = !task.done && task.dueDate && task.dueDate < t

  const setRepeat = (k: RepeatKind) => {
    const base = task.dueDate ?? t
    let r: Recurrence | undefined
    if (k === 'day') r = { freq: 'day', interval: 1 }
    if (k === 'week') r = { freq: 'week', interval: 1 }
    if (k === 'month') r = { freq: 'month', interval: 1 }
    if (k === 'year') r = { freq: 'year', interval: 1 }
    if (k === 'weekdays') r = { freq: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5] }
    if (k === 'custom') r = task.recurrence ?? { freq: 'week', interval: 1, weekdays: [fromYmd(base).getDay()] }
    set({ recurrence: r, dueDate: r ? firstOccurrence(base, r) : task.dueDate })
  }

  const addTag = () => {
    const tag = tagDraft.trim().replace(/^#/, '').toLowerCase()
    if (tag) void mutateTask(task.id, (x) => void (!x.tags.includes(tag) && x.tags.push(tag)))
    setTagDraft('')
  }

  const addSub = () => {
    const s = subDraft.trim()
    if (!s) return
    void mutateTask(task.id, (x) => void x.subtasks.push({ id: uid(), title: s, done: false }))
    setSubDraft('')
  }

  // Lo justo a la vista (como Things): la fecha y la lista siempre; lo demás,
  // solo si tiene algo o si se acaba de añadir desde «Añadir»
  const [opened, setOpened] = useState<Set<Field>>(() => new Set())
  const has: Record<Field, boolean> = {
    time: !!task.dueTime,
    reminder: !!task.reminder,
    repeat: !!task.recurrence,
    deadline: !!task.deadline,
    estimate: !!task.estimate,
    priority: task.priority > 0,
    tags: task.tags.length > 0,
    people: (task.people?.length ?? 0) > 0,
    waiting: !!task.waitingFor,
  }
  const shows = (f: Field) => has[f] || opened.has(f)
  const addField = (f: Field) => {
    setOpened((prev) => new Set(prev).add(f))
    // Al aparecer, el foco va a su primer control
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-field="${f}"] :is(select, input, button)`)?.focus())
  }
  const missing = FIELDS.filter((f) => !shows(f.id) && !(f.id === 'waiting' && task.done))

  const assignValue = task.projectId ? `p:${task.projectId}` : task.areaId ? `a:${task.areaId}` : ''
  const where = project(task.projectId)?.name ?? area(task.areaId)?.name
  const subDone = task.subtasks.filter((s) => s.done).length

  return (
    <div className="pb-6">
      {/* Cabecera */}
      <div className="sticky top-0 z-10 flex items-center gap-1 px-3 pt-3 pb-2 backdrop-blur-xl">
        <IconButton
          label="Duplicar"
          filled
          className="h-8 w-8"
          onClick={async () => {
            const c = await duplicateTask(task)
            ui.openTask(c.id)
            toast('Tarea duplicada')
          }}
        >
          <Copy size={14} strokeWidth={2.3} />
        </IconButton>
        <IconButton
          label="Eliminar"
          filled
          className="h-8 w-8 hover:!text-red"
          onClick={async () => {
            ui.closeTask()
            await deleteTask(task.id)
            toastTrashed('Tarea en la papelera', 'tasks', task.id)
          }}
        >
          <Trash2 size={14} strokeWidth={2.3} />
        </IconButton>
        <span className="flex-1" />
        {!task.done && (
          <Button
            size="sm"
            variant="tinted"
            onClick={() => {
              ui.closeTask()
              focus.open(task.id)
            }}
          >
            <Timer size={14} strokeWidth={2.4} /> Enfocarme
          </Button>
        )}
        <IconButton label="Cerrar (Esc)" filled className="h-8 w-8" onClick={ui.closeTask}>
          <X size={15} strokeWidth={2.6} />
        </IconButton>
      </div>

      {/* Título */}
      <div className="flex items-start gap-3 px-5 pt-2 pb-5">
        <div className="pt-1">
          <Checkbox checked={!!task.done} onChange={() => completeWithFeedback(task)} priority={task.priority} size={26} />
        </div>
        <Textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLElement).blur())}
          rows={1}
          placeholder="Título"
          className={cx('text-[22px] leading-snug font-bold tracking-tight', task.done && 'text-muted line-through')}
        />
      </div>

      <div className="space-y-4 px-3">
        {/* Las notas, justo debajo del título (como en Things y Recordatorios) */}
        <Group>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas" aria-label="Notas" rows={2} className="min-h-14 px-4 pt-3 pb-3" />
        </Group>

        <Group>
          <div className="flex items-center gap-3 px-3.5 pt-3 pb-1">
            <Glyph color="var(--c-green)">
              <ListChecks size={16} strokeWidth={2.4} />
            </Glyph>
            <p className="flex-1 text-[15px]">Subtareas</p>
            {task.subtasks.length > 0 && (
              <span className="font-num text-[14px] font-semibold text-muted">
                {subDone}/{task.subtasks.length}
              </span>
            )}
          </div>
          <SubtaskRows task={task} />
          <div className="flex items-center gap-3 py-2 pr-3 pl-[58px]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-fill text-white">
              <Plus size={13} strokeWidth={3} />
            </span>
            <input
              value={subDraft}
              onChange={(e) => setSubDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSub()}
              onBlur={addSub}
              placeholder="Añadir subtarea"
              className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-faint"
            />
          </div>
        </Group>

        <Group>
          <Row
            icon={<Calendar size={16} strokeWidth={2.4} />}
            color={task.done ? 'var(--c-gray)' : dateColor(task.dueDate)}
            label="Fecha"
            value={
              task.dueDate
                ? `${overdue ? `${longDateLabel(task.dueDate)} · atrasada` : `${dateLabel(task.dueDate)} · ${longDateLabel(task.dueDate)}`}${!task.done && task.postponed ? ` · ${postponedLabel(task.postponed).toLowerCase()}` : ''}`
                : task.someday
                  ? 'Algún día'
                  : undefined
            }
            onClear={task.dueDate ? () => set({ dueDate: undefined, dueTime: undefined, recurrence: undefined }) : undefined}
          >
            <DateChoice value={task.dueDate} onChange={(dueDate) => set({ dueDate, someday: undefined })} />
            <Pill
              tone="strong"
              active={!!task.someday && !task.dueDate}
              onClick={() => (task.someday ? set({ someday: undefined }) : set({ someday: true, dueDate: undefined, dueTime: undefined, recurrence: undefined }))}
            >
              Algún día
            </Pill>
            {!task.done && (
              <Pill
                tone="strong"
                active={task.important === t}
                onClick={async () => {
                  if (task.important === t) return void set({ important: undefined })
                  // Como mucho tres: lo importante deja de serlo si es todo
                  const already = await db.tasks.filter((x) => x.important === t && !x.done && x.id !== task.id).count()
                  if (already >= MAX_IMPORTANT) return void toast(`Ya tienes ${MAX_IMPORTANT} cosas importantes hoy: quita una antes`)
                  void set({ important: t, ...(!task.dueDate || task.dueDate > t ? { dueDate: t, someday: undefined } : {}) })
                }}
              >
                ★ Importante hoy
              </Pill>
            )}
          </Row>
          {shows('time') && (
            <Row
              field="time"
              icon={<Clock size={16} strokeWidth={2.4} />}
              color="var(--c-teal)"
              label="Hora"
              value={task.dueTime}
              onClear={task.dueTime ? () => set({ dueTime: undefined }) : undefined}
            >
              {QUICK_TIMES.map((h) => (
                <Pill key={h} active={task.dueTime === h} onClick={() => set({ dueTime: h, dueDate: task.dueDate ?? t })}>
                  <span className="font-num">{h}</span>
                </Pill>
              ))}
              <input
                aria-label="Otra hora"
                type="time"
                value={task.dueTime && !QUICK_TIMES.includes(task.dueTime) ? task.dueTime : ''}
                onChange={(e) => set({ dueTime: e.target.value || undefined, dueDate: task.dueDate ?? t })}
                className={
                  task.dueTime && !QUICK_TIMES.includes(task.dueTime)
                    ? 'h-8 rounded-full bg-accent-fill px-3 text-[13px] font-medium text-white [color-scheme:dark]'
                    : fieldCls
                }
              />
            </Row>
          )}
          {shows('deadline') && (
            <Row
              field="deadline"
              icon={<CalendarClock size={16} strokeWidth={2.4} />}
              color={task.done || !task.deadline ? 'var(--c-gray)' : dateColor(task.deadline)}
              label="Fecha límite"
              value={
                task.deadline
                  ? `${dateLabel(task.deadline)} · ${task.deadline < t ? `venció ${relativeDays(task.deadline)}` : relativeDays(task.deadline)}`
                  : undefined
              }
              onClear={task.deadline ? () => set({ deadline: undefined }) : undefined}
            >
              <DateChoice kind="deadline" value={task.deadline} onChange={(deadline) => set({ deadline })} />
            </Row>
          )}
          {shows('estimate') && <EstimateRow value={task.estimate} onChange={(estimate) => set({ estimate })} />}
          <FocusRow taskId={task.id} estimate={task.estimate} />
          {shows('repeat') && (
            <>
          <Row field="repeat" icon={<Repeat size={16} strokeWidth={2.4} />} color="var(--c-gray)" label="Repetir" value={task.recurrence ? recurrenceLabel(task.recurrence) : undefined}>
            <select aria-label="Repetir" value={kind} onChange={(e) => setRepeat(e.target.value as RepeatKind)} className={cx(fieldCls, 'appearance-none pr-3')}>
              <option value="none">No se repite</option>
              <option value="day">Cada día</option>
              <option value="weekdays">Días laborables</option>
              <option value="week">Cada semana</option>
              <option value="month">Cada mes</option>
              <option value="year">Cada año</option>
              <option value="custom">Personalizado…</option>
            </select>
          </Row>
          {kind === 'custom' && task.recurrence && <RecurrenceEditor value={task.recurrence} onChange={(r) => set({ recurrence: r })} />}
          {task.recurrence && !task.done && (
            <div className="flex flex-wrap items-center gap-3 px-3.5 pt-1 pb-3 pl-[58px]">
              <label className="flex flex-1 items-center gap-2 text-[14px] text-muted">
                <Switch
                  label="Contar desde que la completo"
                  checked={!!task.recurrence.afterDone}
                  onChange={(v) => set({ recurrence: { ...task.recurrence!, afterDone: v || undefined } })}
                />
                Desde que la completo
              </label>
              <Button
                size="sm"
                onClick={async () => {
                  const next = await skipOccurrence(task)
                  if (next) toast(`Saltada: la siguiente es ${dateLabel(next).toLowerCase()}`)
                }}
              >
                <SkipForward size={13} strokeWidth={2.4} /> Saltar esta vez
              </Button>
            </div>
          )}
            </>
          )}
          {shows('reminder') && (
            <>
          <ReminderRow task={task} onChange={(reminder) => set({ reminder, ...(reminder ? {} : { nag: undefined }) })} />
          {task.reminder && (
            <Row
              icon={<Repeat2 size={16} strokeWidth={2.4} />}
              color={task.nag ? 'var(--c-blue)' : 'var(--c-muted)'}
              label="Insistir hasta que lo haga"
              value={task.nag ? `Repite el aviso ${nagLabel(task.nag)} (hasta 12 veces)` : undefined}
            >
              <select aria-label="Insistir" value={task.nag ?? 0} onChange={(e) => set({ nag: Number(e.target.value) || undefined })} className={cx(fieldCls, 'appearance-none pr-3')}>
                <option value={0}>No insistir</option>
                {NAG_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Row>
          )}
            </>
          )}
        </Group>

        <Group>
          <Row icon={<Folder size={15} strokeWidth={2.4} />} color="var(--c-indigo)" label="Lista" value={where ?? 'Bandeja de entrada'}>
            <select aria-label="Lista"
              value={assignValue}
              onChange={(e) => {
                const v = e.target.value
                // Al cambiar de lista, la sección (de otro proyecto) ya no vale
                if (!v) return set({ projectId: undefined, areaId: undefined, sectionId: undefined })
                const [kindKey, id] = [v.slice(0, 1), v.slice(2)]
                if (kindKey === 'a') return set({ areaId: id, projectId: undefined, sectionId: undefined })
                const p = projects.find((x) => x.id === id)
                set({ projectId: id, areaId: p?.areaId, ...(id !== task.projectId ? { sectionId: undefined } : {}) })
              }}
              className={cx(fieldCls, 'max-w-full appearance-none pr-3')}
            >
              <option value="">Bandeja de entrada</option>
              {areas.map((a) => (
                <optgroup key={a.id} label={a.name}>
                  <option value={`a:${a.id}`}>{a.name}</option>
                  {projects
                    .filter((p) => p.areaId === a.id && p.status !== 'done')
                    .map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>
                        ↳ {p.name}
                      </option>
                    ))}
                </optgroup>
              ))}
              {projects.some((p) => !p.areaId || !area(p.areaId)) && (
                <optgroup label="Proyectos sin área">
                  {projects
                    .filter((p) => (!p.areaId || !area(p.areaId)) && p.status !== 'done')
                    .map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </Row>
          {(() => {
            const sections = project(task.projectId)?.sections ?? []
            if (!sections.length) return null
            const current = sections.find((x) => x.id === task.sectionId)
            return (
              <Row icon={<Rows3 size={15} strokeWidth={2.4} />} color="var(--c-indigo)" label="Sección" value={current?.name ?? 'Sin sección'}>
                <select
                  aria-label="Sección"
                  value={current?.id ?? ''}
                  onChange={(e) => set({ sectionId: e.target.value || undefined })}
                  className={cx(fieldCls, 'max-w-full appearance-none pr-3')}
                >
                  <option value="">Sin sección</option>
                  {sections.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Row>
            )
          })()}
          {shows('priority') && (
            <Row
              field="priority"
              icon={<Flag size={15} strokeWidth={2.4} />}
              color={task.priority ? PRIORITY_COLOR[task.priority] : 'var(--c-orange)'}
              label="Prioridad"
              value={task.priority ? PRIORITY_LABEL[task.priority] : undefined}
            >
              <Segmented
                value={task.priority}
                onChange={(v) => set({ priority: v })}
                options={[
                  { value: 0, label: 'Ninguna' },
                  { value: 1, label: '!' },
                  { value: 2, label: '!!' },
                  { value: 3, label: '!!!' },
                ]}
              />
            </Row>
          )}
          {shows('tags') && (
            <Row field="tags" icon={<Hash size={15} strokeWidth={2.6} />} color="var(--c-blue)" label="Etiquetas">
              {task.tags.map((tag) => (
                <span key={tag} className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-soft pr-1.5 pl-3 text-[13px] font-semibold text-blue">
                  #{tag}
                  <button
                    type="button"
                    aria-label={`Quitar ${tag}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent-soft"
                    onClick={() => mutateTask(task.id, (x) => void (x.tags = x.tags.filter((y) => y !== tag)))}
                  >
                    <X size={12} strokeWidth={2.6} />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), addTag())}
                onBlur={addTag}
                placeholder="Añadir…"
                className="h-8 w-24 bg-transparent px-1 text-[13px] placeholder:text-faint"
              />
            </Row>
          )}
          {shows('people') && (
            <Row field="people" icon={<AtSign size={15} strokeWidth={2.6} />} color="var(--c-text)" label="Personas">
              {(task.people ?? []).map((id) => {
                const p = person(id)
                if (!p) return null
                return (
                  <span key={id} className="inline-flex h-8 items-center gap-1 rounded-full bg-fill pr-1.5 pl-3 text-[13px] font-semibold">
                    <a href={`#/people/${id}`} className="hover:underline">
                      {p.name}
                    </a>
                    <button
                      type="button"
                      aria-label={`Quitar a ${p.name}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-hover"
                      onClick={() => mutateTask(task.id, (x) => void (x.people = (x.people ?? []).filter((y) => y !== id)))}
                    >
                      <X size={12} strokeWidth={2.6} />
                    </button>
                  </span>
                )
              })}
              {people.length > 0 ? (
                <select
                  value=""
                  onChange={(e) => e.target.value && void mutateTask(task.id, (x) => void (x.people = [...new Set([...(x.people ?? []), e.target.value])]))}
                  className="h-8 rounded-full bg-transparent px-2 text-[13px] text-muted"
                  aria-label="Añadir persona"
                >
                  <option value="">Añadir…</option>
                  {people
                    .filter((p) => !(task.people ?? []).includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              ) : (
                <a href="#/people" className="px-1 text-[13px] text-muted">
                  Crea personas en Personas
                </a>
              )}
            </Row>
          )}
          {shows('waiting') && <WaitingRow task={task} names={people.map((p) => p.name)} />}
        </Group>

        {/* Lo demás, solo si hace falta: un toque y aparece su fila */}
        {missing.length > 0 && (
          <div className="px-1" role="group" aria-label="Añadir a la tarea">
            <p className="mb-2 px-1 text-[13px] font-semibold text-muted">Añadir</p>
            <div className="flex flex-wrap gap-1.5">
              {missing.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-label={`Añadir ${f.label.toLowerCase()}`}
                  onClick={() => addField(f.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fill px-3 text-[13px] font-medium text-fg transition-colors hover:bg-press active:scale-95"
                >
                  <f.icon size={13} strokeWidth={2.4} aria-hidden /> {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="px-2 text-center text-[12px] text-muted">
          Creada el {format(task.createdAt, "d 'de' MMMM 'de' yyyy", { locale: es })}
          {task.completedAt ? ` · completada el ${format(task.completedAt, "d 'de' MMMM", { locale: es })}` : ''}
        </p>
      </div>
    </div>
  )
}

function RecurrenceEditor({ value, onChange }: { value: Recurrence; onChange: (r: Recurrence) => void }) {
  return (
    <div className="space-y-2.5 px-3.5 pt-1 pb-3 pl-[58px]">
      <div className="flex items-center gap-2 text-[14px] text-muted">
        Cada
        <input
          type="number"
          min={1}
          max={99}
          value={value.interval}
          aria-label="Cada cuántas"
          onChange={(e) => onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })}
          className="font-num h-8 w-14 rounded-full bg-fill text-center text-fg"
        />
        <select aria-label="Unidad de la repetición"
          value={value.freq}
          onChange={(e) => {
            const freq = e.target.value as Recurrence['freq']
            onChange({ freq, interval: value.interval, weekdays: freq === 'week' ? value.weekdays : undefined, afterDone: value.afterDone })
          }}
          className={cx(fieldCls, 'appearance-none')}
        >
          <option value="day">días</option>
          <option value="week">semanas</option>
          <option value="month">meses</option>
          <option value="year">años</option>
        </select>
      </div>
      {value.freq === 'week' && (
        <div className="flex gap-1">
          {WEEK_ORDER.map((d) => {
            const on = value.weekdays?.includes(d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  const cur = value.weekdays ?? []
                  const next = on ? cur.filter((x) => x !== d) : [...cur, d]
                  onChange({ ...value, weekdays: next.length ? next : undefined })
                }}
                className={cx('h-8 w-8 rounded-full text-[13px] font-semibold transition-all active:scale-90', on ? 'bg-accent-fill text-white' : 'bg-fill text-muted hover:text-fg')}
              >
                {WEEKDAYS_SHORT[d]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Fila "Aviso": cuándo te avisa LUNO (notificación en el móvil u ordenador) */
/** Lo enfocado en la tarea frente a lo estimado (como Toggl o Focus To-Do) */
function FocusRow({ taskId, estimate }: { taskId: string; estimate?: number }) {
  const logs = useLiveQuery(() => db.focusLogs.where('taskId').equals(taskId).toArray(), [taskId])
  if (!logs?.length) return null
  const { minutes, pomodoros } = taskFocus(logs, taskId)
  if (!minutes) return null
  const parts = [durationLabel(minutes), pomodoros && (pomodoros === 1 ? '1 pomodoro' : `${pomodoros} pomodoros`), estimate && `estimada en ${durationLabel(estimate)}`]
  return (
    <Row icon={<Timer size={15} strokeWidth={2.4} />} color="var(--c-text)" label="Foco" value={parts.filter(Boolean).join(' · ')}>
      {estimate ? (
        <div className="w-full max-w-[240px]">
          <ProgressBar value={minutes / estimate} />
        </div>
      ) : undefined}
    </Row>
  )
}

function EstimateRow({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  const [custom, setCustom] = useState('')
  const quick = [15, 30, 60, 120]
  const commit = () => {
    const v = parseDuration(custom)
    if (v) onChange(v)
    setCustom('')
  }
  return (
    <Row
      field="estimate"
      icon={<Hourglass size={15} strokeWidth={2.4} />}
      color="var(--c-text)"
      label="Duración"
      value={value ? `${durationLabel(value)} aprox.` : undefined}
      onClear={value ? () => onChange(undefined) : undefined}
    >
      {quick.map((m) => (
        <Pill key={m} active={value === m} onClick={() => onChange(m)} tone="strong">
          {durationLabel(m)}
        </Pill>
      ))}
      <input
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())}
        placeholder="Otra: 1h30"
        aria-label="Otra duración"
        className={cx(fieldCls, 'w-[104px] placeholder:text-faint')}
      />
    </Row>
  )
}

function ReminderRow({ task, onChange }: { task: Task; onChange: (r: Reminder | null) => void }) {
  const value = reminderValue(task.reminder)
  const toLocalInput = (ms: number) => {
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const past = task.remindAt !== undefined && task.remindAt < Date.now() && !task.done
  return (
    <Row
      field="reminder"
      icon={<Bell size={16} strokeWidth={2.4} />}
      color={task.remindAt ? 'var(--c-blue)' : 'var(--c-muted)'}
      label="Aviso"
      value={
        task.remindAt
          ? `${reminderLabel(task.reminder)}${task.reminder && 'before' in task.reminder ? ` · ${new Date(task.remindAt).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}${past ? ' · ya pasó' : ''}`
          : task.reminder && !task.dueDate
            ? 'Pon una fecha para que avise'
            : undefined
      }
    >
      <select aria-label="Aviso"
        value={value}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'custom') {
            const start = task.remindAt ?? Date.now() + 60 * 60_000
            return onChange({ at: start })
          }
          onChange(REMINDER_OPTIONS.find((o) => o.value === v)?.reminder ?? null)
        }}
        className={cx(fieldCls, 'appearance-none pr-3')}
      >
        {REMINDER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {value !== 'none' && !REMINDER_OPTIONS.some((o) => o.value === value) && value !== 'custom' && <option value={value}>{reminderLabel(task.reminder)}</option>}
        <option value="custom">Fecha y hora concretas…</option>
      </select>
      {task.reminder && 'at' in task.reminder && (
        <input
          type="datetime-local"
          value={toLocalInput(task.reminder.at)}
          onChange={(e) => e.target.value && onChange({ at: new Date(e.target.value).getTime() })}
          className={fieldCls}
        />
      )}
    </Row>
  )
}

/** Guarda el nuevo orden de las subtareas (por id, sobre el estado actual de la tarea) */
function saveSubtaskOrder(taskId: string, ids: string[]) {
  return mutateTask(taskId, (x) => {
    const pos = (s: Subtask) => {
      const i = ids.indexOf(s.id)
      return i < 0 ? Infinity : i
    }
    x.subtasks = [...x.subtasks].sort((a, b) => pos(a) - pos(b))
  })
}

/** Subtareas: se reordenan arrastrando el asa (o con ↑/↓ sobre ella) */
function SubtaskRows({ task }: { task: Task }) {
  // Mientras se arrastra, el orden es local; al soltar se guarda
  const [items, setItems] = useState(task.subtasks)
  const dragging = useRef(false)
  useEffect(() => {
    if (!dragging.current) setItems(task.subtasks)
  }, [task.subtasks])
  const latest = useRef(items)
  latest.current = items
  const movable = items.length > 1
  return (
    <Reorder.Group as="div" axis="y" values={items} onReorder={setItems}>
      <AnimatePresence initial={false}>
        {items.map((s) => (
          <SubtaskRow
            key={s.id}
            task={task}
            sub={s}
            movable={movable}
            onStart={() => (dragging.current = true)}
            onEnd={() => {
              dragging.current = false
              void saveSubtaskOrder(task.id, latest.current.map((x) => x.id))
            }}
            onKey={(dir) => {
              // El orden más reciente: dos pulsaciones seguidas pueden llegar antes de volver a pintar
              const cur = latest.current
              const from = cur.findIndex((x) => x.id === s.id)
              const to = from + dir
              if (from < 0 || to < 0 || to >= cur.length) return
              const next = moveItem(cur, from, to)
              latest.current = next
              setItems(next)
              void saveSubtaskOrder(task.id, next.map((x) => x.id))
            }}
          />
        ))}
      </AnimatePresence>
    </Reorder.Group>
  )
}

function SubtaskRow({
  task,
  sub: s,
  movable,
  onStart,
  onEnd,
  onKey,
}: {
  task: Task
  sub: Subtask
  movable: boolean
  onStart: () => void
  onEnd: () => void
  onKey: (dir: -1 | 1) => void
}) {
  const controls = useDragControls()
  const [lifted, setLifted] = useState(false)
  return (
    <Reorder.Item
      as="div"
      value={s}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => (setLifted(true), onStart())}
      onDragEnd={() => (setLifted(false), onEnd())}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={spring}
      whileDrag={{ scale: 1.02, zIndex: 10 }}
      className={cx('group relative flex items-center gap-3 overflow-hidden py-1.5 pr-3 pl-[58px]', lifted && 'rounded-xl bg-surface shadow-[var(--c-shadow-lg)]')}
    >
      {movable && (
        <button
          type="button"
          aria-label={`Mover «${s.title}» (flechas arriba y abajo)`}
          title="Arrastra para ordenar"
          onPointerDown={(e) => controls.start(e)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              onKey(e.key === 'ArrowUp' ? -1 : 1)
            }
          }}
          className="absolute top-0 bottom-0 left-[26px] flex w-7 cursor-grab touch-none items-center justify-center text-faint opacity-60 outline-none group-hover:opacity-100 focus-visible:text-accent focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={15} />
        </button>
      )}
      <Checkbox
        size={20}
        checked={s.done}
        onChange={() => mutateTask(task.id, (x) => void x.subtasks.forEach((y) => y.id === s.id && (y.done = !y.done)))}
      />
      <input
        defaultValue={s.title}
        onBlur={(e) => e.target.value !== s.title && mutateTask(task.id, (x) => void x.subtasks.forEach((y) => y.id === s.id && (y.title = e.target.value)))}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).blur()}
        className={cx('min-w-0 flex-1 bg-transparent text-[15px]', s.done && 'text-muted line-through')}
      />
      <button
        type="button"
        aria-label="Eliminar subtarea"
        onClick={() => mutateTask(task.id, (x) => void (x.subtasks = x.subtasks.filter((y) => y.id !== s.id)))}
        className="text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-red"
      >
        <X size={15} />
      </button>
    </Reorder.Item>
  )
}
