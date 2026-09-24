import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react'
import { CalendarDays, Check, Folder, SkipForward, Sun, Sunrise, Trash2, X } from 'lucide-react'
import type { Task } from '@/db/types'
import { deleteTask, mutateTask, restoreTasks, toggleTask } from '@/db/actions'
import { useLookup } from '@/db/hooks'
import { addDaysYmd, dateLabel, today } from '@/lib/dates'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/store'
import { Confetti } from '@/components/Celebrate'
import { Button, cx, softSpring } from '@/components/ui'
import { toastTrashed } from './trash/undo'

type Act = 'today' | 'tomorrow' | 'skip' | 'done' | 'delete' | { date: string } | { list: string }

const since = (ms: number) => {
  const d = Math.floor((Date.now() - ms) / 864e5)
  return d <= 0 ? 'Apuntada hoy' : d === 1 ? 'Apuntada ayer' : `Apuntada hace ${d} días`
}

/**
 * Procesar la bandeja de una en una, como un mazo de cartas: cada tarea sale
 * con una decisión (hoy, mañana, otro día, a una lista, hecha, borrar o luego).
 * Arrastrar la carta → la deja para hoy; ← la deja para luego.
 */
export function InboxProcess({ tasks, onClose }: { tasks: Task[]; onClose: () => void }) {
  const { areas, projects, area } = useLookup()
  const [skipped, setSkipped] = useState<string[]>([])
  const [done, setDone] = useState(0)
  const [dir, setDir] = useState(1)
  const total = useRef(tasks.length)
  const dateRef = useRef<HTMLInputElement>(null)
  // Lo más antiguo primero: es lo que más tiempo lleva esperando
  const queue = tasks.filter((t) => !skipped.includes(t.id)).sort((a, b) => a.createdAt - b.createdAt)
  const current = queue[0]
  const t = today()

  const act = async (a: Act) => {
    if (!current) return
    const task = current
    const before = structuredClone(task)
    if (a === 'skip') {
      setDir(-1)
      setSkipped((s) => [...s, task.id])
      return
    }
    setDir(a === 'delete' ? -1 : 1)
    setDone((n) => n + 1)
    haptic(a === 'done' ? 'success' : 'light')
    const undo = { label: 'Deshacer', run: () => void restoreTasks([before]).then(() => setDone((n) => Math.max(0, n - 1))) }
    if (a === 'done') {
      await toggleTask(task)
      toast(`Hecho: ${task.title}`, undo)
    } else if (a === 'delete') {
      await deleteTask(task.id)
      toastTrashed(`${task.title}: en la papelera`, 'tasks', task.id)
    } else if (typeof a === 'object' && 'list' in a) {
      const v = a.list
      const p = v.startsWith('p:') ? projects.find((x) => x.id === v.slice(2)) : undefined
      await mutateTask(task.id, (x) => {
        if (p) {
          x.projectId = p.id
          if (p.areaId) x.areaId = p.areaId
        } else x.areaId = v.slice(2)
      })
      toast(`${task.title} → ${p?.name ?? area(v.slice(2))?.name}`, undo)
    } else {
      const day = a === 'today' ? t : a === 'tomorrow' ? addDaysYmd(t, 1) : a.date
      await mutateTask(task.id, (x) => void (x.dueDate = day))
      toast(`${task.title} → ${dateLabel(day).toLowerCase()}`, undo)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return
      const k = e.key.toLowerCase()
      if (k === 'escape') onClose()
      else if (k === 'h') void act('today')
      else if (k === 'm') void act('tomorrow')
      else if (k === 'l' || k === 's') void act('skip')
      else if (k === 'd') void act('done')
      else if (k === 'backspace' || k === 'delete') void act('delete')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const progress = total.current ? Math.min(1, (done + skipped.length) / total.current) : 1

  return (
    <motion.div
      role="dialog"
      aria-label="Procesar la bandeja"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[75] flex flex-col bg-bg"
    >
      <div className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),14px)]">
        <button type="button" aria-label="Cerrar" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-fill text-fg active:scale-90">
          <X size={18} strokeWidth={2.6} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">Procesar la bandeja</p>
          <p className="font-num text-[13px] text-muted">{current ? `Quedan ${queue.length}` : 'Terminado'}</p>
        </div>
      </div>
      <div className="mx-4 mt-3 h-1.5 overflow-hidden rounded-full bg-fill">
        <motion.div className="h-full rounded-full bg-green" animate={{ width: `${progress * 100}%` }} transition={softSpring} />
      </div>

      <div className="relative mx-auto flex w-full max-w-md flex-1 items-center justify-center px-6">
        {current ? (
          <>
            {queue.slice(1, 3).map((x, i) => (
              <motion.div
                key={x.id}
                layout
                animate={{ scale: 0.94 - i * 0.05, y: 18 + i * 16, opacity: 0.6 - i * 0.25 }}
                transition={softSpring}
                className="glass absolute inset-x-6 top-1/2 h-[300px] -translate-y-1/2 rounded-[28px]"
              />
            ))}
            <AnimatePresence mode="popLayout" custom={dir}>
              <Card key={current.id} task={current} dir={dir} onToday={() => void act('today')} onSkip={() => void act('skip')} />
            </AnimatePresence>
          </>
        ) : (
          <Finished count={done} onClose={onClose} />
        )}
      </div>

      {current && (
        <div className="mx-auto w-full max-w-md space-y-2 px-4 pb-[max(env(safe-area-inset-bottom),18px)]">
          <div className="grid grid-cols-4 gap-2">
            <Big icon={<Sun size={20} />} label="Hoy" hint="H" onClick={() => void act('today')} primary />
            <Big icon={<Sunrise size={20} />} label="Mañana" hint="M" onClick={() => void act('tomorrow')} />
            <Big
              icon={<CalendarDays size={20} />}
              label="Otro día"
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
                aria-label="Elegir día"
                tabIndex={-1}
                min={t}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(e) => {
                  const v = e.target.value
                  e.target.value = ''
                  if (v) void act({ date: v })
                }}
              />
            </Big>
            <Big icon={<Folder size={20} />} label="A una lista">
              <select aria-label="Mover a una lista" value="-" onChange={(e) => void act({ list: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
                <option value="-" disabled>
                  Mover a…
                </option>
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
                {projects.some((p) => !p.areaId && p.status !== 'done') && (
                  <optgroup label="Proyectos">
                    {projects
                      .filter((p) => !p.areaId && p.status !== 'done')
                      .map((p) => (
                        <option key={p.id} value={`p:${p.id}`}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </Big>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Big icon={<Check size={20} strokeWidth={2.8} />} label="Ya está hecha" hint="D" onClick={() => void act('done')} lime />
            <Big icon={<Trash2 size={19} />} label="Borrar" onClick={() => void act('delete')} />
            <Big icon={<SkipForward size={19} />} label="Luego" hint="L" onClick={() => void act('skip')} />
          </div>
        </div>
      )}
    </motion.div>
  )
}

function Card({ task, dir, onToday, onSkip }: { task: Task; dir: number; onToday: () => void; onSkip: () => void }) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-220, 220], [-9, 9])
  const today = useTransform(x, [30, 120], [0, 1])
  const later = useTransform(x, [-120, -30], [1, 0])
  return (
    <motion.div
      custom={dir}
      variants={{
        enter: { opacity: 0, scale: 0.9, y: 20 },
        center: { opacity: 1, scale: 1, y: 0 },
        exit: (d: number) => ({ opacity: 0, x: d * 420, rotate: d * 14, transition: { duration: 0.3, ease: [0.3, 0, 0.2, 1] } }),
      }}
      initial="enter"
      animate="center"
      exit="exit"
      transition={softSpring}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={(_, info) => {
        if (info.offset.x > 110 || info.velocity.x > 700) onToday()
        else if (info.offset.x < -110 || info.velocity.x < -700) onSkip()
      }}
      style={{ x, rotate }}
      className="glass-thick absolute inset-x-6 top-1/2 flex h-[300px] -translate-y-1/2 cursor-grab touch-none flex-col rounded-[28px] p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5)] active:cursor-grabbing"
    >
      <motion.span style={{ opacity: today }} className="absolute top-5 right-5 rounded-full bg-accent px-3 py-1 text-[13px] font-bold text-white">
        HOY
      </motion.span>
      <motion.span style={{ opacity: later }} className="absolute top-5 left-5 rounded-full bg-fill px-3 py-1 text-[13px] font-bold text-fg">
        LUEGO
      </motion.span>
      <p className="mt-6 text-[13px] font-medium text-muted">{since(task.createdAt)}</p>
      <p className="mt-2 line-clamp-4 text-[26px] leading-tight font-bold tracking-tight [text-wrap:balance]">{task.title}</p>
      {task.notes.trim() && <p className="mt-3 line-clamp-3 text-[15px] leading-snug text-muted">{task.notes}</p>}
      <p className="mt-auto text-center text-[12.5px] text-faint">Arrastra → para hoy · ← para luego</p>
    </motion.div>
  )
}

function Big({ icon, label, hint, onClick, primary, lime, children }: { icon: React.ReactNode; label: string; hint?: string; onClick?: () => void; primary?: boolean; lime?: boolean; children?: React.ReactNode }) {
  return (
    <div className="relative">
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={onClick}
        tabIndex={children ? -1 : 0}
        aria-hidden={children ? true : undefined}
        title={hint ? `${label} (${hint})` : label}
        className={cx(
          'flex h-[64px] w-full flex-col items-center justify-center gap-1 rounded-[18px] text-[12.5px] font-semibold',
          primary ? 'bg-accent text-white' : lime ? 'bg-green text-on-green' : 'bg-fill text-fg',
        )}
      >
        {icon}
        {label}
      </motion.button>
      {children}
    </div>
  )
}

function Finished({ count, onClose }: { count: number; onClose: () => void }) {
  const [party, setParty] = useState(count > 0)
  useEffect(() => {
    if (count > 0) haptic('success')
  }, [count])
  return (
    <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={softSpring} className="flex flex-col items-center text-center">
      <span className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-green text-on-green">
        <Check size={46} strokeWidth={3} />
      </span>
      <p className="text-[26px] font-bold tracking-tight">Bandeja procesada</p>
      <p className="mt-1.5 text-[15px] text-muted">{count ? `Has decidido ${count} ${count === 1 ? 'cosa' : 'cosas'}. Cabeza despejada.` : 'Lo has dejado todo para luego.'}</p>
      <Button variant="primary" size="lg" className="mt-6" onClick={onClose}>
        Cerrar
      </Button>
      {party && <Confetti onDone={() => setParty(false)} />}
    </motion.div>
  )
}

