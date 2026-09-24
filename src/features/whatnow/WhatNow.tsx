import { useMemo, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Play, Shuffle, Sparkles } from 'lucide-react'
import { useOpenTasks } from '@/db/hooks'
import { today } from '@/lib/dates'
import { suggest, type Energy } from '@/lib/suggest'
import { durationLabel } from '@/lib/duration'
import { haptic } from '@/lib/haptics'
import { ui } from '@/app/store'
import { focus } from '@/features/focus/focus'
import { completeWithFeedback } from '@/components/TaskItem'
import { Button, Modal, ModalHeader, Segmented, cx, softSpring } from '@/components/ui'

// ── Abrir/cerrar ──────────────────────────────────────────────
let open = false
const listeners = new Set<() => void>()
export const whatNow = {
  open: () => ((open = true), listeners.forEach((l) => l())),
  close: () => ((open = false), listeners.forEach((l) => l())),
}
const useOpen = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => open,
  )

const TIMES = [15, 30, 60, 120]

/** «¿Qué hago ahora?»: dime cuánto tiempo tienes y te digo qué hacer */
export function WhatNow() {
  const isOpen = useOpen()
  return (
    <Modal open={isOpen} onClose={whatNow.close} position="center">
      {isOpen && <Picker />}
    </Modal>
  )
}

function Picker() {
  const tasks = useOpenTasks()
  const [minutes, setMinutes] = useState(30)
  const [energy, setEnergy] = useState<Energy>('normal')
  const [index, setIndex] = useState(0)
  const now = new Date()
  const list = useMemo(
    () => suggest(tasks ?? [], { minutes, energy, today: today(), nowMin: now.getHours() * 60 + now.getMinutes(), now: now.getTime() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, minutes, energy],
  )
  const pick = list[index % Math.max(1, list.length)]
  const others = list.filter((s) => s !== pick).slice(0, 2)
  const change = (fn: () => void) => {
    setIndex(0)
    fn()
  }

  return (
    <div>
      <ModalHeader title="¿Qué hago ahora?" onClose={whatNow.close} />
      <div className="space-y-4 px-5 pb-5">
        <div>
          <p className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Tengo</p>
          <div className="grid grid-cols-4 gap-2">
            {TIMES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => change(() => setMinutes(m))}
                className={cx('h-10 rounded-full text-[14px] font-semibold transition-colors active:scale-95', minutes === m ? 'bg-accent text-white' : 'bg-fill text-fg hover:bg-press')}
              >
                {durationLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Energía</p>
          <Segmented
            value={energy}
            onChange={(v) => change(() => setEnergy(v))}
            className="flex w-full"
            options={[
              { value: 'low', label: 'Poca' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'Mucha' },
            ]}
          />
        </div>

        <AnimatePresence mode="wait">
          {pick ? (
            <motion.div
              key={pick.task.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={softSpring}
              className="rounded-[20px] bg-accent-soft p-4"
            >
              <p className="flex items-center gap-1.5 text-[12.5px] font-bold tracking-wide text-blue uppercase">
                <Sparkles size={13} strokeWidth={2.6} /> Te propongo
              </p>
              <button type="button" onClick={() => (whatNow.close(), ui.openTask(pick.task.id))} className="mt-1.5 block text-left text-[21px] leading-tight font-bold tracking-tight">
                {pick.task.title}
              </button>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {pick.reasons.map((r) => (
                  <span key={r} className="rounded-full bg-fill px-2.5 py-1 text-[12.5px] font-semibold text-fg">
                    {r}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="primary"
                  className="flex-[2]"
                  onClick={() => {
                    haptic()
                    whatNow.close()
                    focus.open(pick.task.id, Math.min(minutes, Math.max(5, pick.minutes)))
                    focus.start()
                  }}
                >
                  <Play size={15} strokeWidth={2.6} /> Empezar
                </Button>
                <Button onClick={() => void completeWithFeedback(pick.task)} className="flex-1">
                  <Check size={15} strokeWidth={2.6} /> Hecha
                </Button>
                {list.length > 1 && (
                  <Button onClick={() => setIndex((i) => i + 1)} aria-label="Otra" className="flex-1">
                    <Shuffle size={15} /> Otra
                  </Button>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-[20px] bg-fill-2 p-5 text-center">
              <p className="text-[16px] font-semibold">{(tasks ?? []).length ? `Nada que quepa en ${durationLabel(minutes)}` : 'No tienes nada pendiente'}</p>
              <p className="mt-1 text-[14px] text-muted">{(tasks ?? []).length ? 'Prueba con más tiempo, o descansa: también cuenta.' : 'Disfruta del rato libre.'}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {others.length > 0 && (
          <div>
            <p className="mb-1.5 text-[13px] font-semibold tracking-wide text-muted uppercase">También podrías</p>
            {others.map((s) => (
              <button
                key={s.task.id}
                type="button"
                onClick={() => setIndex(list.indexOf(s))}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-hover"
              >
                <span className="min-w-0 flex-1 truncate text-[15px]">{s.task.title}</span>
                <span className="font-num shrink-0 text-[12.5px] text-muted">{durationLabel(s.minutes)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
