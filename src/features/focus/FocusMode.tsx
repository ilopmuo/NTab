import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { Check, Coffee, Frown, Headphones, Meh, Minimize2, NotebookPen, Pause, Play, Plus, Smile, Timer, X } from 'lucide-react'
import { db } from '@/db/db'
import { createTask, mutateTask, toggleTask } from '@/db/actions'
import { useTask } from '@/db/hooks'
import { toast } from '@/app/store'
import { chime } from '@/reminders/sound'
import { showSystemNotification } from '@/reminders/local'
import { parseQuickAdd } from '@/lib/parse'
import { dateLabel } from '@/lib/dates'
import { LONG_EVERY, RATINGS, breakAfter } from '@/lib/focusStats'
import { Checkbox } from '@/components/TaskItem'
import { Button, ProgressRing, Segmented, cx, softSpring, spring } from '@/components/ui'
import { tint } from '@/app/sections'
import { DURATIONS, clock, focus, isBreak, logFocus, rateFocus, remaining, useFocus } from './focus'
import { NOISES, loadNoise, playNoise, saveNoise, stopNoise, unlockAudio, type NoisePrefs } from './noise'

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

/** Qué hacer en el descanso (lejos de la pantalla) */
const TIPS = ['Levántate y estira la espalda', 'Bebe un vaso de agua', 'Mira algo lejano 20 segundos', 'Respira hondo: 4 s dentro, 4 s fuera', 'Camina un poco por casa', 'Aléjate de la pantalla un momento']
const LONG_TIPS = ['Sal a dar una vuelta corta', 'Come algo y bebe agua', 'Túmbate y cierra los ojos un rato']

const FACES = { 1: Frown, 2: Meh, 3: Smile } as const

function Ring({ value, running, done, size }: { value: number; running: boolean; done: boolean; size: number }) {
  const stroke = Math.round(size * 0.055)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="relative -rotate-90 overflow-visible">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-fill)" strokeWidth={stroke} />
      {/* Al acabar, una onda verde sale del anillo */}
      {done && (
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          stroke="var(--c-green)"
          initial={{ r, opacity: 0.8, strokeWidth: stroke }}
          animate={{ r: r + stroke * 2.2, opacity: 0, strokeWidth: stroke * 0.3 }}
          transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1], repeat: 2, repeatDelay: 0.5 }}
          aria-hidden
        />
      )}
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
  const brk = !!s && isBreak(s)
  const title = task?.title ?? s?.intention ?? 'Foco libre'

  // Sonido de fondo mientras corre el foco (no en los descansos)
  const [noise, setNoise] = useState<NoisePrefs>(loadNoise)
  const [soundOpen, setSoundOpen] = useState(false)
  const sounding = !!s && running && !brk
  useEffect(() => {
    if (sounding) playNoise(noise.kind, noise.volume)
    else stopNoise()
  }, [sounding, noise.kind, noise.volume])
  useEffect(() => () => stopNoise(), [])
  const pickNoise = (next: NoisePrefs) => {
    setNoise(next)
    saveNoise(next)
  }

  // Apuntar para luego lo que se te pasa por la cabeza (sin dejar el foco)
  const [note, setNote] = useState<string | null>(null)
  const [rated, setRated] = useState<number | null>(null)
  useEffect(() => setRated(null), [s?.lastLogId])

  const left = s ? remaining(s) : 0
  // Fin del temporizador: sonido, notificación y anillo en verde
  useEffect(() => {
    if (!s?.endAt) return
    const wasBreak = isBreak(s)
    const fire = () => {
      focus.finish()
      if (!wasBreak) void logFocus(title)
      chime()
      void showSystemNotification(
        'ntab-focus',
        wasBreak ? 'Descanso terminado' : '⏱ Pomodoro terminado',
        wasBreak ? `Vuelta a: ${title}` : `${title} · toca descansar`,
        './#/today',
      )
    }
    const wait = s.endAt - Date.now()
    if (wait <= 0) return fire()
    const id = setTimeout(fire, wait)
    return () => clearTimeout(id)
  }, [s?.endAt, title])

  // La tarea ya no existe (borrada en otro dispositivo)
  useEffect(() => {
    if (s?.taskId && task === null) focus.close()
  }, [s, task])

  if (!s || (s.taskId && !task)) return null
  const total = s.minutes * 60_000
  const progress = s.finished ? 1 : 1 - left / Math.max(total, left)
  const rounds = s.rounds ?? 0
  const next = breakAfter(rounds)

  const complete = async () => {
    focus.pause()
    await logFocus(title)
    const fresh = task && (await db.tasks.get(task.id))
    if (fresh && !fresh.done) await toggleTask(fresh)
    focus.close()
    toast(task ? `Hecho: ${task.title}` : 'Foco terminado')
  }

  const saveNote = async () => {
    const text = note?.trim()
    setNote(null)
    if (!text) return
    const parsed = parseQuickAdd(text, { areas: [], projects: [], people: [] })
    await createTask({ ...parsed, title: parsed.title || text })
    focus.distracted()
    toast(`Para luego: ${parsed.title || text} · ${parsed.dueDate ? dateLabel(parsed.dueDate) : 'en la Bandeja'}`)
  }

  const phaseLabel = s.phase === 'long' ? 'Descanso largo' : brk ? 'Descanso' : 'Modo foco'
  const tips = s.phase === 'long' ? LONG_TIPS : TIPS
  const sub = s.finished
    ? brk
      ? '¿Seguimos?'
      : '¡Pomodoro!'
    : brk
      ? tips[Math.max(0, rounds - 1) % tips.length]
      : running
        ? 'Concéntrate en esto'
        : 'En pausa'
  const fresh = !running && !s.finished && left === total

  return (
    <AnimatePresence>
      {s.minimized ? (
        // Accesorio inferior, como el mini reproductor de Música: sobre la barra
        // de pestañas en el móvil y en la esquina en el ordenador
        <motion.div
          key="pill"
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.94 }}
          transition={spring}
          className="glass-thick fixed inset-x-3 bottom-[calc(max(env(safe-area-inset-bottom),10px)+72px)] z-[55] flex h-[54px] items-center gap-1 overflow-hidden rounded-full pr-1.5 pl-1.5 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[340px]"
        >
          <button type="button" onClick={() => focus.minimize(false)} aria-label="Abrir el modo foco" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pr-2 text-left">
            <span className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center">
              <span className="absolute inset-0">
                <ProgressRing value={s.finished ? 1 : 1 - left / total} size={42} stroke={3.5} color={s.finished || brk ? 'var(--c-green)' : tint('indigo')} />
              </span>
              <span
                className="flex h-[30px] w-[30px] items-center justify-center rounded-full"
                style={s.finished || brk ? { background: 'var(--c-green)', color: 'var(--c-on-green)' } : { background: tint('indigo'), color: '#fff' }}
              >
                {s.finished ? <Check size={15} strokeWidth={3} /> : brk ? <Coffee size={15} strokeWidth={2.4} /> : <Timer size={15} strokeWidth={2.4} />}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] leading-tight font-semibold">{brk ? phaseLabel : title}</span>
              <span className="font-num block text-[13px] leading-tight text-muted">
                {s.finished ? (brk ? 'Descanso hecho' : 'Terminado') : `${clock(left)}${running ? '' : ' · en pausa'}`}
              </span>
            </span>
          </button>
          {!s.finished && (
            <button
              type="button"
              onClick={() => (running ? focus.pause() : focus.start())}
              aria-label={running ? 'Pausar' : 'Seguir'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-hover active:scale-90"
            >
              {running ? <Pause size={19} strokeWidth={2.4} fill="currentColor" /> : <Play size={19} strokeWidth={2.4} fill="currentColor" />}
            </button>
          )}
        </motion.div>
      ) : (
        <motion.div
          key="full"
          role="dialog"
          aria-label="Modo foco"
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={softSpring}
          // El sonido solo puede arrancar tras un toque (en el iPhone, dentro del propio toque)
          onPointerDown={unlockAudio}
          className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-bg"
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-[max(env(safe-area-inset-top),14px)]">
            <Button variant="ghost" size="sm" onClick={() => focus.minimize()}>
              <Minimize2 size={15} /> Minimizar
            </Button>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" aria-expanded={soundOpen} onClick={() => setSoundOpen((o) => !o)}>
              <Headphones size={15} /> {noise.kind === 'off' ? 'Sonido' : NOISES.find((n) => n.value === noise.kind)?.label}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (running && !brk && !window.confirm('¿Terminar la sesión de foco?')) return
                focus.pause()
                void logFocus(title).then(focus.close)
              }}
            >
              <X size={15} /> Salir
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {soundOpen && (
              <motion.div
                key="sound"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={softSpring}
                className="overflow-hidden"
              >
                <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 pt-3">
                  <Segmented value={noise.kind} onChange={(kind) => pickNoise({ ...noise, kind })} options={NOISES.map((n) => ({ value: n.value, label: n.value === 'off' ? 'No' : n.label, title: n.hint || n.label }))} />
                  {noise.kind !== 'off' && (
                    <label className="flex w-full items-center gap-3 text-[13px] font-medium text-muted">
                      Volumen
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={noise.volume}
                        onChange={(e) => pickNoise({ ...noise, volume: Number(e.target.value) })}
                        className="flex-1 accent-[var(--c-blue)]"
                      />
                    </label>
                  )}
                  <p className="text-center text-[12.5px] text-muted">{NOISES.find((n) => n.value === noise.kind)?.hint || 'Suena mientras corre el foco, no en los descansos.'}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-7 px-6 pb-[max(env(safe-area-inset-bottom),24px)]">
            <div className="text-center">
              <p className={cx('mb-2 text-[13px] font-semibold tracking-wide uppercase', brk ? 'text-green' : 'text-blue')}>{phaseLabel}</p>
              <h1 className="text-[26px] leading-tight font-bold tracking-tight">{title}</h1>
              {!brk && (rounds > 0 || !fresh) && (
                <p className="mt-1.5 text-[13px] font-medium text-muted">
                  Pomodoro {s.finished ? ((rounds - 1) % LONG_EVERY) + 1 : (rounds % LONG_EVERY) + 1} de {LONG_EVERY}
                </p>
              )}
            </div>

            <div className="relative">
              {/* Halo que respira despacio (4 s dentro, 4 s fuera) mientras corre el tiempo */}
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -inset-6 rounded-full"
                style={{ background: `radial-gradient(circle, color-mix(in srgb, ${s.finished || brk ? 'var(--c-green)' : 'var(--c-blue)'} 45%, transparent) 0%, transparent 68%)` }}
                initial={false}
                animate={running ? { scale: [0.9, 1.06, 0.9], opacity: [0.35, 0.75, 0.35] } : { scale: s.finished ? 1.04 : 0.9, opacity: s.finished ? 0.6 : 0 }}
                transition={running ? { duration: 8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.5 }}
              />
              <Ring value={progress} running={running} done={!!s.finished || brk} size={260} />
              <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                <span className="font-num text-[56px] leading-none font-bold tracking-tight">{s.finished ? '0:00' : clock(left)}</span>
                <span className="mt-2 text-[14px] text-muted">{sub}</span>
              </div>
            </div>

            {fresh && <Segmented value={s.minutes} onChange={(m) => focus.setMinutes(m)} options={DURATIONS.map((m) => ({ value: m, label: `${m} min` }))} />}

            {/* Al acabar un pomodoro: cómo ha ido (como la reflexión de Session) */}
            {s.finished && !brk && s.lastLogId && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-[14px] font-semibold">¿Qué tal ha ido?</p>
                <div className="flex gap-2" role="radiogroup" aria-label="¿Qué tal ha ido?">
                  {RATINGS.map((r) => {
                    const Face = FACES[r.value]
                    const on = rated === r.value
                    return (
                      <button
                        key={r.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => {
                          setRated(r.value)
                          void rateFocus(r.value)
                        }}
                        className={cx(
                          'flex flex-col items-center gap-1 rounded-[14px] px-3 py-2 text-[12px] font-semibold transition-colors',
                          on ? 'bg-accent-fill text-white' : 'bg-fill text-muted hover:text-fg',
                        )}
                      >
                        <Face size={20} strokeWidth={2.2} />
                        {r.label}
                      </button>
                    )
                  })}
                </div>
                {(s.distractions ?? 0) > 0 && (
                  <p className="text-[13px] text-muted">
                    {s.distractions === 1 ? 'Apuntaste 1 cosa para luego' : `Apuntaste ${s.distractions} cosas para luego`}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              {s.finished && !brk ? (
                <>
                  <Button size="lg" variant="primary" onClick={() => focus.startBreak(next.phase, next.minutes)}>
                    <Coffee size={17} /> {next.phase === 'long' ? `Descanso largo · ${next.minutes} min` : `Descanso · ${next.minutes} min`}
                  </Button>
                  <Button size="lg" onClick={() => (focus.addMinutes(5), focus.start())}>
                    <Plus size={17} /> 5 min más
                  </Button>
                </>
              ) : brk ? (
                <>
                  <Button size="lg" variant={s.finished ? 'primary' : 'secondary'} onClick={focus.nextFocus}>
                    <Play size={17} /> {s.finished ? 'Otro pomodoro' : 'Saltar el descanso'}
                  </Button>
                  {running && (
                    <Button size="lg" onClick={() => focus.addMinutes(5)}>
                      <Plus size={17} /> 5 min
                    </Button>
                  )}
                </>
              ) : running ? (
                <>
                  <Button size="lg" onClick={focus.pause}>
                    <Pause size={17} /> Pausa
                  </Button>
                  <Button size="lg" onClick={() => focus.addMinutes(5)}>
                    <Plus size={17} /> 5 min
                  </Button>
                </>
              ) : (
                <Button size="lg" variant="primary" onClick={focus.start}>
                  <Play size={17} /> {left === total ? 'Empezar' : 'Seguir'}
                </Button>
              )}
              {!brk && (
                <Button size="lg" variant="secondary" onClick={() => void complete()}>
                  <Check size={17} strokeWidth={2.6} /> {task ? 'Hecho' : 'Terminar'}
                </Button>
              )}
            </div>

            {/* Lo que se te pasa por la cabeza, a la Bandeja (la lista de «imprevistos» de Cirillo) */}
            {!brk && !s.finished && (
              <div className="w-full">
                {note === null ? (
                  <button type="button" onClick={() => setNote('')} className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg">
                    <NotebookPen size={14} strokeWidth={2.3} /> Apuntar algo para luego
                    {(s.distractions ?? 0) > 0 && <span className="font-num text-faint">· {s.distractions}</span>}
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void saveNote()
                    }}
                    className="glass flex items-center gap-2 rounded-full py-1 pr-1 pl-4"
                  >
                    <input
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setNote(null))}
                      placeholder="Lo que se te ha pasado por la cabeza…"
                      aria-label="Apuntar para luego"
                      className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-faint"
                    />
                    <Button type="submit" size="sm" variant="tinted">
                      Apuntar
                    </Button>
                  </form>
                )}
              </div>
            )}

            {task && task.subtasks.length > 0 && !brk && (
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
            {task && !brk && task.notes.trim() && <p className="w-full text-[14px] leading-relaxed whitespace-pre-wrap text-muted">{task.notes.trim()}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
