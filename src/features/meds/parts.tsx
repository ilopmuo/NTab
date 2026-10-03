import { useEffect, useState } from 'react'
import { Check, SkipForward, Undo2 } from 'lucide-react'
import type { Med, MedLog } from '@/db/types'
import { haptic } from '@/lib/haptics'
import { nowHHMM, shortTime, type Dose } from '@/lib/meds'
import { toast } from '@/app/store'
import { cx } from '@/components/ui'
import { markDose, undoDose } from './actions'

/** «Ahora» que avanza solo: las tomas pasan de «pendiente» a «toca ahora» sin recargar */
export function useNow() {
  const [now, setNow] = useState(nowHHMM)
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** La pastilla: un punto con su color (como en Apple Salud) */
export function PillDot({ color, size = 12 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.18)]" style={{ width: size, height: size, background: color }} />
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })

/** Marcar una toma (con «Deshacer» en el aviso) */
export async function take(med: Med, time?: string, status: MedLog['status'] = 'taken') {
  const { log, undo } = await markDose(med, { time, status })
  haptic(status === 'taken' ? 'success' : 'light')
  const what = status === 'taken' ? `${med.name}: tomada a las ${clock(log.at)}` : `${med.name}${time ? ` de las ${shortTime(time)}` : ''}: saltada`
  toast(what, { label: 'Deshacer', run: () => void undo() })
  return log
}

/**
 * Una toma de hoy: la hora, el medicamento y «Tomada» (o cuándo se tomó).
 * Responde de un vistazo a «¿me la he tomado?».
 */
export function DoseRow({ dose, compact }: { dose: Dose<Med, MedLog>; compact?: boolean }) {
  const { med, time, log, state } = dose
  const done = state === 'taken' || state === 'skipped'
  const label = `${med.name} de las ${shortTime(time)}`
  return (
    <div className={cx('flex items-center gap-3', compact ? 'rounded-xl px-1 py-1.5' : 'px-4 py-3 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none')}>
      <span className={cx('font-num w-11 shrink-0 text-[14px]', state === 'late' ? 'font-bold text-fg' : state === 'due' ? 'font-semibold text-blue' : done ? 'font-semibold text-muted' : 'font-semibold text-fg')}>{shortTime(time)}</span>
      {state === 'taken' ? (
        <span aria-hidden className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-green text-on-green">
          <Check size={9} strokeWidth={4} />
        </span>
      ) : (
        <PillDot color={med.color} />
      )}
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-[15px] font-medium', done && 'text-muted')}>{med.name}</span>
        {/* Lo que importa primero (si no cabe, se corta la dosis) */}
        <span className="block truncate text-[12.5px] text-muted">
          {state === 'upcoming' ? (
            [med.dose, med.note].filter(Boolean).join(' · ') || 'Pendiente'
          ) : (
            <>
              <span className={cx(state === 'taken' ? 'font-semibold text-fg' : state === 'late' ? 'font-bold text-fg' : state === 'due' ? 'font-semibold text-blue' : '')}>
                {state === 'taken' && log ? `Tomada a las ${clock(log.at)}` : state === 'skipped' ? 'Saltada' : state === 'late' ? 'Sin tomar' : 'Toca ahora'}
              </span>
              {med.dose && ` · ${med.dose}`}
            </>
          )}
        </span>
      </span>
      {done && log ? (
        <button type="button" aria-label={`${label}: deshacer`} onClick={() => void undoDose(log, undefined, med.stock !== undefined && state === 'taken' ? med.stock + (med.perDose ?? 1) : med.stock)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-hover hover:text-fg">
          <Undo2 size={15} />
        </button>
      ) : (
        <>
          {!compact && (
            <button type="button" aria-label={`${label}: saltar`} title="Saltar esta toma" onClick={() => void take(med, time, 'skipped')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint hover:bg-hover hover:text-fg">
              <SkipForward size={15} />
            </button>
          )}
          <button
            type="button"
            aria-label={`${label}: tomada`}
            onClick={() => void take(med, time)}
            className={cx(
              'flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold transition-transform active:scale-95',
              state === 'upcoming' ? 'bg-fill text-fg hover:bg-press' : 'bg-accent-fill text-white',
            )}
          >
            <Check size={14} strokeWidth={2.8} /> Tomada
          </button>
        </>
      )}
    </div>
  )
}
