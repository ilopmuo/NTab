import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Calendar, Clock, Copy, Flag, Folder, Hash, ListChecks, Plus, Repeat, StickyNote, Trash2, X } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Recurrence, Task } from '@/db/types'
import { db } from '@/db/db'
import { useLookup, useTask } from '@/db/hooks'
import { deleteTask, duplicateTask, mutateTask, updateTask } from '@/db/actions'
import { addDaysYmd, dateLabel, fromYmd, longDateLabel, today, WEEK_ORDER, WEEKDAYS_SHORT } from '@/lib/dates'
import { firstOccurrence, recurrenceLabel } from '@/lib/recurrence'
import { PRIORITY_COLOR, PRIORITY_LABEL, dateColor } from '@/lib/tasks'
import { uid } from '@/lib/id'
import { toast, ui, useUI } from '@/app/store'
import { Checkbox, completeWithFeedback } from './TaskItem'
import { Group, IconButton, Modal, Segmented, Textarea, cx, spring, useMediaQuery } from './ui'

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
}: {
  icon: React.ReactNode
  color: string
  label: string
  value?: React.ReactNode
  children?: React.ReactNode
  /** botón "quitar" a la derecha de la fila */
  onClear?: () => void
}) {
  return (
    <div className="relative px-3.5 py-2.5 after:absolute after:right-0 after:bottom-0 after:left-[58px] after:h-px after:bg-line last:after:hidden">
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

function Pill({ active, onClick, children, color = 'var(--c-blue)' }: { active?: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('h-8 rounded-full px-3 text-[13px] font-semibold transition-all active:scale-95', active ? 'text-white' : 'bg-fill text-fg hover:bg-press')}
      style={active ? { background: color } : undefined}
    >
      {children}
    </button>
  )
}

const fieldCls = 'h-8 rounded-full bg-fill px-3 text-[13px] font-medium text-fg'

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
  const { areas, projects, area, project } = useLookup()
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
            const copy = { ...task }
            await deleteTask(task.id)
            toast('Tarea eliminada', { label: 'Deshacer', run: () => void db.tasks.add(copy) })
          }}
        >
          <Trash2 size={14} strokeWidth={2.3} />
        </IconButton>
        <span className="flex-1" />
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
        <Group>
          <Row
            icon={<Calendar size={16} strokeWidth={2.4} />}
            color={task.done ? 'var(--c-gray)' : dateColor(task.dueDate)}
            label="Fecha"
            value={task.dueDate ? (overdue ? `${longDateLabel(task.dueDate)} · atrasada` : `${dateLabel(task.dueDate)} · ${longDateLabel(task.dueDate)}`) : undefined}
            onClear={task.dueDate ? () => set({ dueDate: undefined, dueTime: undefined, recurrence: undefined }) : undefined}
          >
            <Pill active={task.dueDate === t} onClick={() => set({ dueDate: t })} color="var(--c-blue)">
              Hoy
            </Pill>
            <Pill active={task.dueDate === addDaysYmd(t, 1)} onClick={() => set({ dueDate: addDaysYmd(t, 1) })} color="var(--c-orange)">
              Mañana
            </Pill>
            <input type="date" value={task.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || undefined })} className={fieldCls} />
          </Row>
          <Row
            icon={<Clock size={16} strokeWidth={2.4} />}
            color="var(--c-teal)"
            label="Hora"
            value={task.dueTime}
            onClear={task.dueTime ? () => set({ dueTime: undefined }) : undefined}
          >
            <input
              type="time"
              value={task.dueTime ?? ''}
              onChange={(e) => set({ dueTime: e.target.value || undefined, dueDate: task.dueDate ?? t })}
              className={fieldCls}
            />
          </Row>
          <Row icon={<Repeat size={16} strokeWidth={2.4} />} color="var(--c-gray)" label="Repetir" value={task.recurrence ? recurrenceLabel(task.recurrence) : undefined}>
            <select value={kind} onChange={(e) => setRepeat(e.target.value as RepeatKind)} className={cx(fieldCls, 'appearance-none pr-3')}>
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
        </Group>

        <Group>
          <Row
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
          <Row icon={<Folder size={15} strokeWidth={2.4} />} color="var(--c-indigo)" label="Lista" value={where ?? 'Bandeja de entrada'}>
            <select
              value={assignValue}
              onChange={(e) => {
                const v = e.target.value
                if (!v) return set({ projectId: undefined, areaId: undefined })
                const [kindKey, id] = [v.slice(0, 1), v.slice(2)]
                if (kindKey === 'a') return set({ areaId: id, projectId: undefined })
                const p = projects.find((x) => x.id === id)
                set({ projectId: id, areaId: p?.areaId })
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
          <Row icon={<Hash size={15} strokeWidth={2.6} />} color="var(--c-blue)" label="Etiquetas">
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
          <AnimatePresence initial={false}>
            {task.subtasks.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={spring}
                className="group flex items-center gap-3 overflow-hidden py-1.5 pr-3 pl-[58px]"
              >
                <Checkbox
                  size={20}
                  checked={s.done}
                  onChange={() => mutateTask(task.id, (x) => void x.subtasks.forEach((y) => y.id === s.id && (y.done = !y.done)))}
                />
                <input
                  defaultValue={s.title}
                  onBlur={(e) => e.target.value !== s.title && mutateTask(task.id, (x) => void x.subtasks.forEach((y) => y.id === s.id && (y.title = e.target.value)))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                  className={cx('min-w-0 flex-1 bg-transparent text-[15px]', s.done && 'text-faint line-through')}
                />
                <button
                  type="button"
                  aria-label="Eliminar subtarea"
                  onClick={() => mutateTask(task.id, (x) => void (x.subtasks = x.subtasks.filter((y) => y.id !== s.id)))}
                  className="text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-red"
                >
                  <X size={15} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="flex items-center gap-3 py-2 pr-3 pl-[58px]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
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
          <div className="flex items-center gap-3 px-3.5 pt-3">
            <Glyph color="var(--c-yellow)">
              <StickyNote size={15} strokeWidth={2.4} />
            </Glyph>
            <p className="text-[15px]">Notas</p>
          </div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalles, enlaces, ideas…" rows={3} className="min-h-20 px-4 pt-2 pb-3" />
        </Group>

        <p className="px-2 text-center text-[12px] text-faint">
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
          onChange={(e) => onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })}
          className="font-num h-8 w-14 rounded-full bg-fill text-center text-fg"
        />
        <select
          value={value.freq}
          onChange={(e) => {
            const freq = e.target.value as Recurrence['freq']
            onChange({ freq, interval: value.interval, weekdays: freq === 'week' ? value.weekdays : undefined })
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
                className={cx('h-8 w-8 rounded-full text-[13px] font-semibold transition-all active:scale-90', on ? 'bg-accent text-white' : 'bg-fill text-muted hover:text-fg')}
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
