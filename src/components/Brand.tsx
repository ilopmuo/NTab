import { MARK, WORDMARK } from '@/lib/brand'
import { cx } from './ui'

/**
 * Símbolo de LUNO: la órbita en el color del texto y la luna en el acento.
 * `mono` la pinta toda del color actual (sobre fondos de color o en una sola tinta).
 */
export function LunoMark({ size = 24, mono, className }: { size?: number; mono?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${MARK.size} ${MARK.size}`} aria-hidden className={cx('shrink-0', className)}>
      <path d={MARK.ring} fill="none" stroke="currentColor" strokeWidth={MARK.ringWidth} />
      <circle {...MARK.moon} fill={mono ? 'currentColor' : 'var(--c-blue)'} />
    </svg>
  )
}

/** Logotipo «LUNO»; `height` es el alto de las letras en px */
export function LunoWordmark({ height = 14, className, title }: { height?: number; className?: string; title?: string }) {
  const h = (height * WORDMARK.height) / 22
  return (
    <svg
      height={h}
      width={(h * WORDMARK.width) / WORDMARK.height}
      viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cx('shrink-0', className)}
      fill="currentColor"
    >
      {WORDMARK.fills.map((d) => (
        <path key={d} d={d} />
      ))}
      <g fill="none" stroke="currentColor" strokeWidth={WORDMARK.stroke}>
        <path d={WORDMARK.u} />
        <circle {...WORDMARK.o} />
      </g>
    </svg>
  )
}

/** Símbolo + logotipo, como en la barra lateral */
export function LunoLockup({ height = 12, className }: { height?: number; className?: string }) {
  return (
    <span className={cx('inline-flex items-center', className)} style={{ gap: height * 0.62 }}>
      <LunoMark size={Math.round(height * 1.7)} />
      <LunoWordmark height={height} title="LUNO" />
    </span>
  )
}
