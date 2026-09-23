import { useEffect, useRef, useState } from 'react'
import { Copy, Flag, Hash, Plus, Trash2, X } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Recurrence, Task } from '@/db/types'
import { db } from '@/db/db'
import { useLookup, useTask } from '@/db/hooks'
import { deleteTask, duplicateTask, mutateTask, updateTask } from '@/db/actions'
import { addDaysYmd, dateLabel, fromYmd, today, WEEK_ORDER, WEEKDAYS_SHORT } from '@/lib/dates'
import { firstOccurrence, recurrenceLabel } from '@/lib/recurrence'
import { PRIORITY_COLOR, PRIORITY_LABEL } from '@/lib/tasks'
import { uid } from '@/lib/id'
import { toast, ui, useUI } from '@/app/store'
import { Checkbox, completeWithFeedback } from './TaskItem'
import { IconButton, Segmented, Select, Textarea, cx } from './ui'

export function TaskDetailPanel() {
  const id = useUI((s) => s.selectedTaskId)
  const task = useTask(id)
  if (!id || !task) return null
  return (
    <>
      <div className="fixed inset-0 z-30 bg-scrim animate-fade-in lg:hidden" onClick={ui.closeTask} />
      <aside
        key={task.id}
        className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface shadow-2xl shadow-black/30 animate-slide-in sm:w-[440px]"
      >
        <TaskDetail task={task} />
      </aside>
    </>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 py-1">
      <span className="w-24 shrink-0 text-[13px] text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

function Pill({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'h-7 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors',
        active ? 'bg-accent text-white' : 'bg-hover text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

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
  const { areas, projects, area } = useLookup()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [tagDraft, setTagDraft] = useState('')
  const [subDraft, setSubDraft] = useState('')
  useDebounced(title, (v) => updateTask(task.id, { title: v.trim() }))
  useDebounced(notes, (v) => updateTask(task.id, { notes: v }))

  const set = (changes: Partial<Task>) => updateTask(task.id, changes)
  const t = today()
  const kind = repeatKind(task.recurrence)

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
    if (tag) void mutateTask(task.id, (t) => void (!t.tags.includes(tag) && t.tags.push(tag)))
    setTagDraft('')
  }

  const addSub = () => {
    const s = subDraft.trim()
    if (!s) return
    void mutateTask(task.id, (t) => void t.subtasks.push({ id: uid(), title: s, done: false }))
    setSubDraft('')
  }

  const assignValue = task.projectId ? `p:${task.projectId}` : task.areaId ? `a:${task.areaId}` : ''

  return (
    <>
      <div className="flex items-center gap-1 border-b border-line px-4 py-2.5">
        <span className="text-[12px] text-faint">
          Creada {format(task.createdAt, "d MMM yyyy", { locale: es })}
          {task.completedAt ? ` · completada ${format(task.completedAt, 'd MMM', { locale: es })}` : ''}
        </span>
        <div className="ml-auto flex items-center">
          <IconButton
            label="Duplicar"
            onClick={async () => {
              const c = await duplicateTask(task)
              ui.openTask(c.id)
            }}
          >
            <Copy size={15} />
          </IconButton>
          <IconButton
            label="Eliminar"
            className="hover:text-danger"
            onClick={async () => {
              ui.closeTask()
              const copy = { ...task }
              await deleteTask(task.id)
              toast('Tarea eliminada', {
                label: 'Deshacer',
                run: async () => {
                  await db.tasks.add(copy)
                },
              })
            }}
          >
            <Trash2 size={15} />
          </IconButton>
          <IconButton label="Cerrar (Esc)" onClick={ui.closeTask}>
            <X size={16} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-10">
        <div className="flex items-start gap-3">
          <div className="pt-1">
            <Checkbox checked={!!task.done} onChange={() => completeWithFeedback(task)} priority={task.priority} size={22} />
          </div>
          <Textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), (e.target as HTMLElement).blur())}
            rows={1}
            placeholder="Título"
            className={cx('text-[19px] leading-snug font-semibold tracking-tight', task.done && 'text-muted line-through')}
          />
        </div>

        <div className="mt-6 divide-y divide-line border-y border-line">
          <Row label="Fecha">
            <Pill active={task.dueDate === t} onClick={() => set({ dueDate: t })}>
              Hoy
            </Pill>
            <Pill active={task.dueDate === addDaysYmd(t, 1)} onClick={() => set({ dueDate: addDaysYmd(t, 1) })}>
              Mañana
            </Pill>
            <input
              type="date"
              value={task.dueDate ?? ''}
              onChange={(e) => set({ dueDate: e.target.value || undefined })}
              className="h-7 rounded-lg bg-hover px-2 text-[12.5px] text-fg"
            />
            {task.dueDate && (
              <IconButton label="Quitar fecha" className="h-7 w-7" onClick={() => set({ dueDate: undefined, dueTime: undefined, recurrence: undefined })}>
                <X size={14} />
              </IconButton>
            )}
          </Row>
          {task.dueDate && task.dueDate !== t && task.dueDate !== addDaysYmd(t, 1) && (
            <p className="py-1.5 pl-27 text-[12px] text-muted">{dateLabel(task.dueDate)}</p>
          )}
          <Row label="Hora">
            <input
              type="time"
              value={task.dueTime ?? ''}
              onChange={(e) => set({ dueTime: e.target.value || undefined, dueDate: task.dueDate ?? t })}
              className="h-7 rounded-lg bg-hover px-2 text-[12.5px] text-fg"
            />
            {task.dueTime && (
              <IconButton label="Quitar hora" className="h-7 w-7" onClick={() => set({ dueTime: undefined })}>
                <X size={14} />
              </IconButton>
            )}
          </Row>
          <Row label="Repetir">
            <Select value={kind} onChange={(e) => setRepeat(e.target.value as RepeatKind)} className="h-7 w-auto pr-8 text-[12.5px]">
              <option value="none">No se repite</option>
              <option value="day">Cada día</option>
              <option value="weekdays">Días laborables</option>
              <option value="week">Cada semana</option>
              <option value="month">Cada mes</option>
              <option value="year">Cada año</option>
              <option value="custom">Personalizado…</option>
            </Select>
          </Row>
          {kind === 'custom' && task.recurrence && (
            <RecurrenceEditor value={task.recurrence} onChange={(r) => set({ recurrence: r })} />
          )}
          <Row label="Prioridad">
            <Segmented
              value={task.priority}
              onChange={(v) => set({ priority: v })}
              options={([0, 1, 2, 3] as const).map((p) => ({
                value: p,
                title: PRIORITY_LABEL[p],
                label: p === 0 ? '—' : <Flag size={13} style={{ color: PRIORITY_COLOR[p] }} fill={PRIORITY_COLOR[p]} />,
              }))}
            />
            <span className="text-[12px] text-muted">{PRIORITY_LABEL[task.priority]}</span>
          </Row>
          <Row label="Dónde">
            <Select
              value={assignValue}
              onChange={(e) => {
                const v = e.target.value
                if (!v) return set({ projectId: undefined, areaId: undefined })
                const [kindKey, id] = [v.slice(0, 1), v.slice(2)]
                if (kindKey === 'a') return set({ areaId: id, projectId: undefined })
                const p = projects.find((x) => x.id === id)
                set({ projectId: id, areaId: p?.areaId })
              }}
              className="h-8 text-[13px]"
            >
              <option value="">Bandeja de entrada</option>
              {areas.map((a) => (
                <optgroup key={a.id} label={a.name}>
                  <option value={`a:${a.id}`}>{a.name}</option>
                  {projects
                    .filter((p) => p.areaId === a.id && p.status !== 'done')
                    .map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>
                        {'  '}↳ {p.name}
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
            </Select>
          </Row>
          <Row label="Etiquetas">
            {task.tags.map((tag) => (
              <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-lg bg-hover pr-1 pl-2 text-[12.5px] text-fg">
                <Hash size={11} className="text-muted" />
                {tag}
                <button
                  type="button"
                  aria-label={`Quitar ${tag}`}
                  className="ml-0.5 rounded p-0.5 text-muted hover:text-fg"
                  onClick={() => mutateTask(task.id, (t) => void (t.tags = t.tags.filter((x) => x !== tag)))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), addTag())}
              onBlur={addTag}
              placeholder="Añadir…"
              className="h-7 w-24 bg-transparent text-[12.5px] placeholder:text-faint"
            />
          </Row>
        </div>

        <div className="mt-6">
          <h4 className="mb-1 text-[12px] font-semibold tracking-wider text-muted uppercase">
            Subtareas
            {task.subtasks.length > 0 && (
              <span className="ml-2 font-normal text-faint tabular-nums">
                {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length}
              </span>
            )}
          </h4>
          {task.subtasks.map((s) => (
            <div key={s.id} className="group flex items-center gap-3 py-1.5">
              <Checkbox
                size={17}
                checked={s.done}
                onChange={() => mutateTask(task.id, (t) => void t.subtasks.forEach((x) => x.id === s.id && (x.done = !x.done)))}
              />
              <input
                defaultValue={s.title}
                onBlur={(e) =>
                  e.target.value !== s.title &&
                  mutateTask(task.id, (t) => void t.subtasks.forEach((x) => x.id === s.id && (x.title = e.target.value)))
                }
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).blur()}
                className={cx('min-w-0 flex-1 bg-transparent text-[13.5px]', s.done && 'text-faint line-through')}
              />
              <button
                type="button"
                aria-label="Eliminar subtarea"
                onClick={() => mutateTask(task.id, (t) => void (t.subtasks = t.subtasks.filter((x) => x.id !== s.id)))}
                className="text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 py-1.5">
            <Plus size={17} className="text-faint" />
            <input
              value={subDraft}
              onChange={(e) => setSubDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSub()}
              onBlur={addSub}
              placeholder="Añadir subtarea"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] placeholder:text-faint"
            />
          </div>
        </div>

        <div className="mt-6">
          <h4 className="mb-2 text-[12px] font-semibold tracking-wider text-muted uppercase">Notas</h4>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detalles, enlaces, ideas…"
            rows={4}
            className="min-h-24 rounded-xl border border-line bg-bg p-3"
          />
        </div>
      </div>
    </>
  )
}

function RecurrenceEditor({ value, onChange }: { value: Recurrence; onChange: (r: Recurrence) => void }) {
  return (
    <div className="space-y-2 py-2.5 pl-27">
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        Cada
        <input
          type="number"
          min={1}
          max={99}
          value={value.interval}
          onChange={(e) => onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })}
          className="h-7 w-14 rounded-lg bg-hover px-2 text-center text-fg"
        />
        <Select
          value={value.freq}
          onChange={(e) => {
            const freq = e.target.value as Recurrence['freq']
            onChange({ freq, interval: value.interval, weekdays: freq === 'week' ? value.weekdays : undefined })
          }}
          className="h-7 w-auto pr-8 text-[12.5px]"
        >
          <option value="day">días</option>
          <option value="week">semanas</option>
          <option value="month">meses</option>
          <option value="year">años</option>
        </Select>
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
                className={cx(
                  'h-7 w-7 rounded-full text-[12px] font-medium transition-colors',
                  on ? 'bg-accent text-white' : 'bg-hover text-muted hover:text-fg',
                )}
              >
                {WEEKDAYS_SHORT[d]}
              </button>
            )
          })}
        </div>
      )}
      <p className="text-[12px] text-faint">{recurrenceLabel(value)}</p>
    </div>
  )
}
