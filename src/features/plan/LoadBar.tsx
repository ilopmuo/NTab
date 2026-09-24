import { DAY_CAPACITY, durationLabel, type DayLoad } from '@/lib/duration'
import { cx } from '@/components/ui'

export const LOAD_HINT: Record<DayLoad['level'], string> = {
  free: 'Nada para hoy todavía.',
  ok: 'Un día asumible.',
  busy: 'Un día cargado: ¿seguro que todo es para hoy?',
  over: 'Demasiado para un día. Pasa algo a mañana.',
}

/** Barra de carga del día: tareas (azul) + reuniones (gris) sobre una jornada de 6 h */
export function LoadBar({ load, hint, className }: { load: DayLoad; hint?: string; className?: string }) {
  const scale = Math.max(DAY_CAPACITY, load.total)
  const pct = (m: number) => `${(m / scale) * 100}%`
  const over = load.level === 'over'
  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
        <span className="font-num whitespace-nowrap font-semibold">
          {load.total ? `${durationLabel(load.total)} ocupadas` : 'Sin tiempo estimado'}
          <span className="font-normal text-muted"> de {durationLabel(DAY_CAPACITY)}</span>
        </span>
        <span className={cx('whitespace-nowrap', over ? 'font-semibold text-fg' : 'text-muted')}>
          {[load.events ? `${durationLabel(load.events)} de reuniones` : '', load.unestimated ? `${load.unestimated} sin duración` : ''].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="relative mt-1.5 flex h-2 overflow-hidden rounded-full bg-fill" role="meter" aria-valuemin={0} aria-valuemax={DAY_CAPACITY} aria-valuenow={load.total} aria-label="Carga del día">
        <span className="h-full bg-line-strong" style={{ width: pct(load.events) }} />
        <span className="h-full bg-blue" style={{ width: pct(load.tasks) }} />
        {over && <span className="absolute inset-y-0 w-[2px] bg-fg" style={{ left: pct(DAY_CAPACITY) }} />}
      </div>
      {hint && <p className={cx('mt-1.5 text-[13px]', over ? 'font-semibold text-fg' : 'text-muted')}>{hint}</p>}
    </div>
  )
}
