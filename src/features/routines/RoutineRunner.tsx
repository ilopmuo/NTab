import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronLeft, Flame, RotateCcw, SkipForward, X } from 'lucide-react'
import { resetRoutineRun, toggleRoutineStep } from '@/db/actions'
import { routineProgress, routineStreak } from '@/lib/routines'
import { haptic } from '@/lib/haptics'
import { Icon } from '@/components/icons'
import { Confetti } from '@/components/Celebrate'
import { Button, bouncy, cx, softSpring } from '@/components/ui'
import { runner, useRoutines, useRunner } from './useRoutines'

/**
 * Rutina paso a paso, a pantalla completa: un paso cada vez, en grande, con un
 * botón enorme de «Hecho». Pensada para hacerla con el móvil en la mano al
 * salir de casa sin pensar.
 */
export function RoutineRunner() {
  const id = useRunner()
  return <AnimatePresence>{id && <Runner key={id} id={id} />}</AnimatePresence>
}

function Runner({ id }: { id: string }) {
  const { routines, byRoutine, completed, today } = useRoutines(60)
  const routine = routines?.find((r) => r.id === id)
  const run = byRoutine.get(id)?.get(today)
  const done = new Set(run?.done ?? [])
  const [skipped, setSkipped] = useState<string[]>([])
  const [dir, setDir] = useState(1)
  const [party, setParty] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && runner.close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!routines) return null
  if (!routine) {
    runner.close()
    return null
  }
  const { done: n, total, complete } = routineProgress(routine, run)
  // El paso actual: el primero sin hacer (los saltados, al final)
  const pending = routine.steps.filter((s) => !done.has(s.id))
  const current = pending.find((s) => !skipped.includes(s.id)) ?? pending[0]
  const index = current ? routine.steps.findIndex((s) => s.id === current.id) : -1
  const streak = routineStreak(routine, completed.get(routine.id) ?? new Set(), today)

  const markDone = async () => {
    if (!current) return
    haptic(pending.length === 1 ? 'success' : 'light')
    setDir(1)
    const finished = await toggleRoutineStep(routine, today, current.id, true)
    if (finished) setParty(true)
  }
  const skip = () => {
    if (!current || pending.length < 2) return
    setDir(1)
    setSkipped((s) => [...s.filter((x) => x !== current.id), current.id])
  }
  const back = async () => {
    // Deshace el último paso marcado
    const last = [...routine.steps].reverse().find((s) => done.has(s.id))
    if (!last) return
    setDir(-1)
    await toggleRoutineStep(routine, today, last.id, false)
  }

  return (
    <motion.div
      role="dialog"
      aria-label={routine.name}
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={softSpring}
      className="fixed inset-0 z-[80] flex flex-col bg-bg"
    >
      <div className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),14px)]">
        <button type="button" aria-label="Cerrar" onClick={runner.close} className="flex h-10 w-10 items-center justify-center rounded-full bg-fill text-fg active:scale-90">
          <X size={18} strokeWidth={2.6} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{routine.name}</p>
          <p className="font-num text-[13px] text-muted">
            {n} de {total}
            {streak > 0 && (
              <span className="ml-2 inline-flex items-center gap-0.5 font-bold text-fg">
                <Flame size={12} strokeWidth={2.6} /> {streak}
              </span>
            )}
          </p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fill text-fg">
          <Icon name={routine.icon} size={18} />
        </span>
      </div>

      {/* Progreso por pasos */}
      <div className="mt-4 flex gap-1.5 px-4">
        {routine.steps.map((s) => (
          <span key={s.id} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
            <motion.span
              className="absolute inset-0 origin-left rounded-full bg-green"
              initial={false}
              animate={{ scaleX: done.has(s.id) ? 1 : 0 }}
              transition={softSpring}
            />
          </span>
        ))}
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-8 text-center">
        <AnimatePresence mode="popLayout" custom={dir} initial={false}>
          {complete ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={softSpring} className="flex flex-col items-center">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...bouncy, delay: 0.1 }}
                className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-green text-on-green"
              >
                <Check size={56} strokeWidth={3} />
              </motion.span>
              <p className="text-[30px] leading-tight font-bold tracking-tight">¡Rutina hecha!</p>
              <p className="mt-2 text-[16px] text-muted">
                {streak > 1 ? `Llevas ${streak} días seguidos.` : 'Todo en orden. Ya puedes irte con la cabeza tranquila.'}
              </p>
            </motion.div>
          ) : current ? (
            <motion.div
              key={current.id}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 80, scale: 0.96 }),
                center: { opacity: 1, x: 0, scale: 1 },
                exit: (d: number) => ({ opacity: 0, x: d * -80, scale: 0.96 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={softSpring}
              className="flex flex-col items-center"
            >
              <p className="font-num mb-3 text-[14px] font-semibold tracking-wide text-blue uppercase">
                Paso {index + 1} de {total}
              </p>
              <p className="max-w-md text-[34px] leading-[1.15] font-bold tracking-tight [text-wrap:balance]">{current.title}</p>
              {pending.length > 1 && <p className="mt-4 text-[14px] text-faint">Luego: {pending.filter((s) => s.id !== current.id)[0]?.title}</p>}
            </motion.div>
          ) : (
            <p className="text-muted">Esta rutina no tiene pasos.</p>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),18px)]">
        {complete ? (
          <div className="flex gap-2">
            <Button size="lg" variant="secondary" className="flex-1 whitespace-nowrap" onClick={() => void resetRoutineRun(routine.id, today)}>
              <RotateCcw size={16} /> Otra vez
            </Button>
            <Button size="lg" variant="primary" className="flex-1" onClick={runner.close}>
              Cerrar
            </Button>
          </div>
        ) : (
          <>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => void markDone()}
              className="flex h-[76px] w-full items-center justify-center gap-3 rounded-[26px] bg-green text-[20px] font-bold text-on-green shadow-[0_14px_40px_-14px_var(--c-green)]"
            >
              <Check size={26} strokeWidth={3} /> Hecho
            </motion.button>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => void back()} disabled={!n}>
                <ChevronLeft size={16} /> Atrás
              </Button>
              <Button variant="ghost" size="sm" onClick={skip} disabled={pending.length < 2} className={cx(pending.length < 2 && 'invisible')}>
                Luego <SkipForward size={15} />
              </Button>
            </div>
          </>
        )}
      </div>
      {party && <Confetti onDone={() => setParty(false)} />}
    </motion.div>
  )
}
