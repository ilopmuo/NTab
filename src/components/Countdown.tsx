import { useEffect, useRef, useState } from 'react'
import { Pause, Play, Plus } from 'lucide-react'
import { clock } from '@/lib/routines'
import { haptic } from '@/lib/haptics'
import { chime } from '@/reminders/sound'
import { Button, cx } from './ui'

/**
 * Cuenta atrás (pasos de las rutinas, temporizadores del modo cocina): se
 * puede parar y sumar un minuto; al llegar a cero suena y vibra.
 */
export function Countdown({ minutes, className, label }: { minutes: number; className?: string; label?: string }) {
  // En marcha: la hora a la que acaba. Parada: los segundos que quedaban
  const [end, setEnd] = useState<number | null>(() => Date.now() + minutes * 60_000)
  const [frozen, setFrozen] = useState(minutes * 60)
  const [now, setNow] = useState(() => Date.now())
  const rang = useRef(false)
  useEffect(() => {
    if (end === null) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [end])
  const left = end === null ? frozen : Math.max(0, Math.round((end - now) / 1000))
  useEffect(() => {
    if (left > 0 || rang.current) return
    rang.current = true
    setFrozen(0)
    setEnd(null)
    chime()
    haptic('success')
  }, [left])
  const over = left === 0
  const running = end !== null
  const part = 1 - left / (minutes * 60)
  return (
    <div className={cx('flex flex-col items-center gap-3', className)} role="timer" aria-label={label}>
      <div className="relative h-1.5 w-56 overflow-hidden rounded-full bg-fill">
        <span className="absolute inset-y-0 left-0 rounded-full bg-blue transition-[width] duration-300" style={{ width: `${Math.min(100, Math.max(0, part) * 100)}%` }} />
      </div>
      <p className={cx('font-num text-[44px] leading-none font-bold tracking-tight', over && 'text-blue')} aria-hidden>
        {clock(left)}
      </p>
      <p className="sr-only" aria-live="polite">
        {over ? 'Tiempo cumplido' : ''}
      </p>
      {over ? (
        <p className="text-[15px] font-semibold text-blue">¡Tiempo! Marca «Hecho» cuando acabes</p>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            aria-label={running ? 'Parar la cuenta atrás' : 'Seguir la cuenta atrás'}
            onClick={() => {
              if (running) {
                setFrozen(left)
                setEnd(null)
              } else setEnd(Date.now() + frozen * 1000)
            }}
          >
            {running ? <Pause size={14} /> : <Play size={14} />} {running ? 'Parar' : 'Seguir'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => (running ? setEnd((e) => e! + 60_000) : setFrozen((f) => f + 60))}>
            <Plus size={14} /> 1 min
          </Button>
        </div>
      )}
    </div>
  )
}
