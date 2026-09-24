import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, Check, CheckSquare, Flag, Folder, Sun, Sunrise, Trash2, X } from 'lucide-react'
import { completeTasks, deleteTask, mutateTasks, restoreTasks } from '@/db/actions'
import { useLookup } from '@/db/hooks'
import type { Priority, Task } from '@/db/types'
import { restoreFromTrash, trashKey } from '@/db/trash'
import { addDaysYmd, dateLabel, today } from '@/lib/dates'
import { useRoute } from '@/app/router'
import { toast } from '@/app/store'
import { cx, softSpring } from '@/components/ui'
import { selection, useSelecting, useSelection, visibleTaskIds } from './selection'

/** Botón «Seleccionar» para las cabeceras de las listas */
export function SelectButton({ small }: { small?: boolean }) {
  const active = useSelecting()
  return (
    <button
      type="button"
      onClick={() => (active ? selection.clear() : selection.start())}
      className={cx(
        'shrink-0 rounded-full font-semibold transition-all active:scale-95',
        small ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-[14px]',
        active ? 'bg-accent text-white' : 'bg-fill text-fg hover:bg-press',
      )}
    >
      {active ? 'Listo' : 'Seleccionar'}
    </button>
  )
}

const plural = (n: number) => `${n} ${n === 1 ? 'tarea' : 'tareas'}`

/** Barra flotante con las acciones para las tareas seleccionadas */
export function SelectionBar() {
  const { active, ids } = useSelection()
  const { areas, projects, area } = useLookup()
  const { path } = useRoute()
  const dateRef = useRef<HTMLInputElement>(null)
  const list = [...ids]
  const n = list.length
  const t = today()

  // Al cambiar de pantalla se sale de la selección
  useEffect(() => void selection.clear(), [path])

  const change = async (fn: (x: Task) => void, message: string) => {
    if (!n) return
    const before = await mutateTasks(list, fn)
    selection.clear()
    toast(message, { label: 'Deshacer', run: () => void restoreTasks(before) })
  }
  const moveTo = (day: string | undefined) =>
    change(
      (x) => {
        const prev = x.dueDate
        if (day) x.dueDate = day
        else delete x.dueDate
        // Al cambiar de día, la hora antigua ya no vale
        if (prev !== day) delete x.dueTime
      },
      `${plural(n)} → ${day ? dateLabel(day).toLowerCase() : 'sin fecha'}`,
    )
  const assign = (v: string) => {
    const [kind, id] = [v.slice(0, 1), v.slice(2)]
    const p = kind === 'p' ? projects.find((x) => x.id === id) : undefined
    const name = p?.name ?? (kind === 'a' ? area(id)?.name : 'Bandeja de entrada')
    return change((x) => {
      if (!v) {
        delete x.projectId
        delete x.areaId
      } else if (kind === 'a') {
        x.areaId = id
        delete x.projectId
      } else {
        x.projectId = id
        if (p?.areaId) x.areaId = p.areaId
        else delete x.areaId
      }
    }, `${plural(n)} → ${name}`)
  }
  const complete = async () => {
    if (!n) return
    const { before, created } = await completeTasks(list)
    selection.clear()
    toast(`${plural(before.length)} hechas`, { label: 'Deshacer', run: () => void restoreTasks(before, created) })
  }
  const remove = async () => {
    if (!n || !window.confirm(`¿Borrar ${plural(n)}? Irán a la papelera 30 días.`)) return
    for (const id of list) await deleteTask(id)
    selection.clear()
    toast(`${plural(n)} en la papelera`, { label: 'Deshacer', run: () => void Promise.all(list.map((id) => restoreFromTrash(trashKey('tasks', id)))) }, 6000)
  }

  const all = visibleTaskIds()
  const allPicked = all.length > 0 && all.every((id) => ids.has(id))

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.96 }}
          transition={softSpring}
          role="toolbar"
          aria-label="Acciones de la selección"
          className="glass-thick fixed inset-x-3 bottom-[calc(max(env(safe-area-inset-bottom),10px)+76px)] z-40 mx-auto max-w-[560px] rounded-[22px] p-2 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] lg:bottom-6"
        >
          <div className="flex items-center gap-2 px-1 pb-1.5">
            <button type="button" aria-label="Cancelar la selección" onClick={selection.clear} className="flex h-8 w-8 items-center justify-center rounded-full bg-fill text-fg active:scale-90">
              <X size={15} strokeWidth={2.6} />
            </button>
            <span className="font-num flex-1 text-[14px] font-semibold">{n ? `${n} ${n === 1 ? 'seleccionada' : 'seleccionadas'}` : 'Toca las tareas para elegirlas'}</span>
            {all.length > 0 && (
              <button type="button" onClick={() => selection.setAll(allPicked ? [] : all)} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-blue hover:bg-hover">
                <CheckSquare size={14} strokeWidth={2.4} /> {allPicked ? 'Ninguna' : 'Todas'}
              </button>
            )}
          </div>
          <div className={cx('grid grid-cols-7 gap-1', !n && 'pointer-events-none opacity-40')}>
            <Action icon={<Sun size={18} strokeWidth={2.3} />} label="Hoy" onClick={() => void moveTo(t)} />
            <Action icon={<Sunrise size={18} strokeWidth={2.3} />} label="Mañana" onClick={() => void moveTo(addDaysYmd(t, 1))} />
            <Action
              icon={<CalendarDays size={18} strokeWidth={2.3} />}
              label="Fecha"
              onClick={() => {
                try {
                  dateRef.current?.showPicker()
                } catch {
                  dateRef.current?.focus()
                }
              }}
            >
              <input
                ref={dateRef}
                type="date"
                aria-label="Mover a una fecha"
                tabIndex={-1}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) => {
                  const v = e.target.value
                  e.target.value = ''
                  if (v) void moveTo(v)
                }}
              />
            </Action>
            <Action icon={<Folder size={18} strokeWidth={2.3} />} label="Lista">
              <select aria-label="Mover a una lista" value="-" onChange={(e) => void assign(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                <option value="-" disabled>
                  Mover a…
                </option>
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
                {projects.some((p) => (!p.areaId || !area(p.areaId)) && p.status !== 'done') && (
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
            </Action>
            <Action icon={<Flag size={18} strokeWidth={2.3} />} label="Prioridad">
              <select
                aria-label="Cambiar la prioridad"
                value="-"
                onChange={(e) => {
                  const pr = Number(e.target.value) as Priority
                  void change((x) => void (x.priority = pr), `${plural(n)} · prioridad ${['ninguna', 'baja', 'media', 'alta'][pr]}`)
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                <option value="-" disabled>
                  Prioridad…
                </option>
                <option value="3">!!! Alta</option>
                <option value="2">!! Media</option>
                <option value="1">! Baja</option>
                <option value="0">Ninguna</option>
              </select>
            </Action>
            <Action icon={<Check size={18} strokeWidth={2.6} />} label="Hecho" onClick={() => void complete()} accent />
            <Action icon={<Trash2 size={18} strokeWidth={2.3} />} label="Borrar" onClick={() => void remove()} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Action({ icon, label, onClick, accent, children }: { icon: React.ReactNode; label: string; onClick?: () => void; accent?: boolean; children?: React.ReactNode }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        tabIndex={children ? -1 : 0}
        aria-hidden={children ? true : undefined}
        className={cx(
          'flex h-[52px] w-full flex-col items-center justify-center gap-1 rounded-[14px] text-[11px] font-semibold transition-all active:scale-95',
          accent ? 'bg-accent text-white' : 'text-fg hover:bg-hover',
        )}
      >
        {icon}
        {label}
      </button>
      {children}
    </div>
  )
}
