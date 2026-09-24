import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Minimize2, Pause, Play, Plus, Timer, X } from 'lucide-react'
import { db } from '@/db/db'
import { mutateTask, toggleTask } from '@/db/actions'
import { useTask } from '@/db/hooks'
import { toast } from '@/app/store'
import { chime } from '@/reminders/sound'
import { showSystemNotification } from '@/reminders/local'
import { Checkbox } from '@/components/TaskItem'
import { Button, Segmented, cx, softSpring, spring } from '@/components/ui'
import { DURATIONS, clock, focus, logFocus, remaining, useFocus } from './focus'

/** Se redibuja cada segundo mientras el temporizador corre */
function useTick(active: boolean) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setN((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [active])
}

/** Mantiene la pantalla encendida mientras el foco está a pantalla completa */
function useWakeLock(on: boolean) {
  const lock = useRef<{ release: () => Promise<void> } | null>(null)
  useEffect(() => {
    if (!on) return
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const request = () => void nav.wakeLock?.request('screen').then((l) => (lock.current = l)).catch(() => {})
    request()
    const again = () => document.visibilityState === 'visible' && request()
    document.addEventListener('visibilitychange', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      void lock.current?.release().catch(() => {})
      lock.current = null
    }
  }, [on])
}

function Ring({ value, running, done, size }: { value: number; running: boolean; done: boolean; size: number }) {
  const stroke = Math.round(size * 0.055)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-fill)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={done ? 'var(--c-green)' : 'var(--c-blue)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={false}
        animate={{ strokeDashoffset: c * (1 - value), opacity: running || done ? 1 : 0.55 }}
        transition={{ type: 'tween', ease: 'linear', duration: running ? 1 : 0.3 }}
      />
    </svg>
  )
}

export function FocusMode() {
  const s = useFocus()
  const task = useTask(s?.taskId)
  const running = !!s?.endAt
  useTick(running)
  useWakeLock(!!s && running && !s.minimized)

  const left = s ? remaining(s) : 0
  // Fin del temporizador: sonido, notificación y anillo en verde
  useEffect(() => {
    if (!s?.endAt) return
    const fire = () => {
      focus.finish()
      void logFocus(task?.title ?? '')
      chime()
      void showSystemNotification('ntab-focus', '⏱ Tiempo de foco terminado', task?.title ?? 'NTab', './#/today')
    }
    const wait = s.endAt - Date.now()
    if (wait <= 0) return fire()
    const id = setTimeout(fire, wait)
    return () => clearTimeout(id)
  }, [s?.endAt, task?.title])

  // La tarea ya no existe (borrada en otro dispositivo)
  useEffect(() => {
    if (s && task === null) focus.close()
  }, [s, task])

  if (!s || !task) return null
  const total = s.minutes * 60_000
  const progress = s.finished ? 1 : 1 - left / Math.max(total, left)

  const complete = async () => {
    focus.pause()
    await logFocus(task.title)
    const fresh = await db.tasks.get(task.id)
    if (fresh && !fresh.done) await toggleTask(fresh)
    focus.close()
    toast(`Hecho: ${task.title}`)
  }

  return (
    <AnimatePresence>
      {s.minimized ? (
        <motion.button
          key="pill"
          type="button"
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={spring}
          onClick={() => focus.minimize(false)}
          className="glass-thick fixed right-4 bottom-[calc(max(env(safe-area-inset-bottom),10px)+80px)] z-[55] flex max-w-[70vw] items-center gap-2.5 rounded-full py-2 pr-4 pl-2 text-left lg:right-6 lg:bottom-6"
        >
          <span className={cx('flex h-8 w-8 items-center justify-center rounded-full', s.finished ? 'bg-green text-on-green' : 'bg-accent text-white')}>
            {s.finished ? <Check size={16} strokeWidth={3} /> : <Timer size={16} strokeWidth={2.4} />}
          </span>
          <span className="min-w-0">
            <span className="font-num block text-[15px] leading-tight font-bold">{s.finished ? 'Terminado' : clock(left)}</span>
            <span className="block truncate text-[12px] text-muted">{task.title}</span>
          </span>
        </motion.button>
      ) : (
        <motion.div
          key="full"
          role="dialog"
          aria-label="Modo foco"
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={softSpring}
          className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-bg"
        >
          <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),14px)]">
            <Button variant="ghost" size="sm" onClick={() => focus.minimize()}>
              <Minimize2 size={15} /> Minimizar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (running && !window.confirm('¿Terminar la sesión de foco?')) return
                focus.pause()
                void logFocus(task.title).then(focus.close)
              }}
            >
              <X size={15} /> Salir
            </Button>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-7 px-6 pb-[max(env(safe-area-inset-bottom),24px)]">
            <div className="text-center">
              <p className="mb-2 text-[13px] font-semibold tracking-wide text-blue uppercase">Modo foco</p>
              <h1 className="text-[26px] leading-tight font-bold tracking-tight">{task.title}</h1>
            </div>

            <div className="relative">
              <Ring value={progress} running={running} done={!!s.finished} size={260} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-num text-[56px] leading-none font-bold tracking-tight">{s.finished ? '0:00' : clock(left)}</span>
                <span className="mt-2 text-[14px] text-muted">{s.finished ? '¡Tiempo!' : running ? 'Concéntrate en esto' : 'En pausa'}</span>
              </div>
            </div>

            {!running && !s.finished && left === total && (
              <Segmented value={s.minutes} onChange={(m) => focus.setMinutes(m)} options={DURATIONS.map((m) => ({ value: m, label: `${m} min` }))} />
            )}

            <div className="flex items-center gap-3">
              {s.finished ? (
                <Button size="lg" onClick={() => (focus.addMinutes(5), focus.start())}>
                  <Plus size={17} /> 5 min más
                </Button>
              ) : running ? (
                <Button size="lg" onClick={focus.pause}>
                  <Pause size={17} /> Pausa
                </Button>
              ) : (
                <Button size="lg" variant="primary" onClick={focus.start}>
                  <Play size={17} /> {left === total ? 'Empezar' : 'Seguir'}
                </Button>
              )}
              {running && (
                <Button size="lg" onClick={() => focus.addMinutes(5)}>
                  <Plus size={17} /> 5 min
                </Button>
              )}
              <Button size="lg" variant={s.finished ? 'primary' : 'secondary'} onClick={() => void complete()}>
                <Check size={17} strokeWidth={2.6} /> Hecho
              </Button>
            </div>

            {task.subtasks.length > 0 && (
              <div className="glass w-full overflow-hidden rounded-[18px]">
                {task.subtasks.map((sub) => (
                  <label key={sub.id} className="flex items-center gap-3 px-4 py-2.5 text-[15px] shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                    <Checkbox
                      checked={sub.done}
                      size={20}
                      onChange={() => void mutateTask(task.id, (t) => void t.subtasks.forEach((x) => x.id === sub.id && (x.done = !x.done)))}
                    />
                    <span className={cx('flex-1', sub.done && 'text-muted line-through')}>{sub.title}</span>
                  </label>
                ))}
              </div>
            )}
            {task.notes.trim() && <p className="w-full text-[14px] leading-relaxed whitespace-pre-wrap text-muted">{task.notes.trim()}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
