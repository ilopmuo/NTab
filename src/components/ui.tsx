import { forwardRef, useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { inViewTransition } from '@/app/router'
import { pageTop } from '@/app/pageTop'
import { AnimatePresence, m as motion } from 'motion/react'
export function cx(...c: (string | false | 0 | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

// ── Movimiento ────────────────────────────────────────────────

export const spring = { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 } as const
export const softSpring = { type: 'spring', stiffness: 300, damping: 30 } as const
export const bouncy = { type: 'spring', stiffness: 600, damping: 22 } as const

export function useMediaQuery(q: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(q)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia(q).matches,
  )
}
export const useIsMobile = () => useMediaQuery('(max-width: 639px)')

/** Número que cuenta desde 0 al aparecer y se anima al cambiar */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(0)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    const el = ref.current
    if (!el) return
    // Sin Motion (que se carga después): un fotograma tras otro, frenando al final
    if (from === value || document.documentElement.dataset.motion === 'reduce') {
      el.textContent = String(value)
      return
    }
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 800)
      el.textContent = String(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <span ref={ref} className={cx('font-num', className)}>
      0
    </span>
  )
}

/**
 * Número que rueda al cambiar (el viejo sale y el nuevo entra, hacia arriba
 * si sube y hacia abajo si baja), como los contadores de iOS.
 */
export function RollingNumber({ value, className, style }: { value: number | string; className?: string; style?: React.CSSProperties }) {
  const num = (v: number | string) => (typeof v === 'number' ? v : parseFloat(v) || 0)
  const prev = useRef(value)
  const dir = num(value) >= num(prev.current) ? 1 : -1
  useEffect(() => {
    prev.current = value
  }, [value])
  return (
    <span className={cx('font-num relative inline-flex overflow-hidden', className)} style={style}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={String(value)}
          custom={dir}
          variants={{
            enter: (d: number) => ({ y: `${d * 70}%`, opacity: 0, filter: 'blur(2px)' }),
            center: { y: '0%', opacity: 1, filter: 'blur(0px)' },
            exit: (d: number) => ({ y: `${d * -70}%`, opacity: 0, filter: 'blur(2px)' }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

// ── Botones ───────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tinted'
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent-fill text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] hover:brightness-110',
  secondary: 'bg-fill text-fg hover:bg-press',
  tinted: 'bg-accent-soft text-accent-on-soft hover:brightness-110',
  ghost: 'text-accent hover:bg-hover',
  danger: 'text-danger hover:bg-danger-soft',
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }
>(function Button({ variant = 'secondary', size = 'md', className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold transition-all select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : size === 'lg' ? 'h-12 px-6 text-[16px]' : 'h-10 px-4 text-[14px]',
        BTN[variant],
        className,
      )}
    />
  )
})

export function IconButton({
  className,
  label,
  filled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; filled?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-30',
        filled ? 'bg-fill text-muted hover:text-fg' : 'text-muted hover:bg-hover hover:text-fg',
        className,
      )}
    />
  )
}

// ── Campos ────────────────────────────────────────────────────

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-fill px-1 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  )
}

// ── Modales y hojas ───────────────────────────────────────────

// ── Contenido ─────────────────────────────────────────────────

export function Empty({
  icon,
  title,
  hint,
  children,
  color = 'var(--c-gray)',
}: {
  icon: ReactNode
  title: string
  hint?: string
  children?: ReactNode
  color?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={softSpring}
      className="flex flex-col items-center justify-center px-6 py-14 text-center"
    >
      {/* El icono en su baldosa, dentro de una órbita tenue (la de LUNO) */}
      <div className="relative mb-5 flex h-24 w-24 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rounded-full border border-line" />
        <span aria-hidden className="absolute top-[11px] right-[11px] h-1.5 w-1.5 rounded-full bg-accent opacity-70" />
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...bouncy, delay: 0.05 }}
          className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-surface shadow-[var(--c-shadow)]"
          style={{ color }}
        >
          {/* Flota suavemente, para que la pantalla vacía no parezca muerta */}
          <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }} className="flex">
            {icon}
          </motion.span>
        </motion.div>
      </div>
      <p className="text-[17px] font-semibold tracking-[-0.015em]">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-[14px] leading-snug text-muted">{hint}</p>}
      {children && <div className="mt-5">{children}</div>}
    </motion.div>
  )
}

/** Títulos de bloque siempre en color de texto (diseño monocromo); solo el azul resalta */
const TONES: Record<string, string> = { blue: 'var(--c-blue)', accent: 'var(--c-blue)' }

/** Bloque con título de color (como las secciones de Recordatorios) */
export function Section({
  title,
  count,
  action,
  children,
  tone,
  className,
  sticky,
}: {
  title: ReactNode
  count?: number
  action?: ReactNode
  children: ReactNode
  tone?: string
  className?: string
  /** la cabecera se queda arriba al bajar por el bloque */
  sticky?: boolean
}) {
  return (
    <section className={cx('mb-8', className)}>
      <div className={cx('mb-2 flex min-h-8 items-center gap-2 px-1', sticky && 'sticky-head -mx-2 px-3 py-1')}>
        <h2 className="text-[19px] font-bold tracking-tight" style={{ color: tone ? TONES[tone] : undefined }}>
          {title}
        </h2>
        {count !== undefined && count > 0 && <RollingNumber value={count} className="text-[15px] font-semibold text-muted" />}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  )
}

/** Lista agrupada: bloque de cristal con filas separadas por líneas finas */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('glass overflow-hidden rounded-[18px]', className)}>{children}</div>
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('glass rounded-[20px]', className)}>
      {children}
    </div>
  )
}

export function ProgressRing({
  value,
  size = 44,
  stroke = 5,
  color = 'var(--c-blue)',
  track,
  delay = 0,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  delay?: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  // Al cerrarse (llegar al 100 % mientras se ve), una onda sale del anillo
  const prev = useRef(v)
  const [closed, setClosed] = useState(0)
  useEffect(() => {
    if (prev.current < 1 && v >= 1) setClosed((n) => n + 1)
    prev.current = v
  }, [v])
  return (
    <svg width={size} height={size} className="-rotate-90 overflow-visible">
      {closed > 0 && (
        <motion.circle
          key={closed}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          stroke={color}
          initial={{ r, opacity: 0.7, strokeWidth: stroke }}
          animate={{ r: r + stroke * 1.4, opacity: 0, strokeWidth: stroke * 0.4 }}
          transition={{ duration: 0.75, ease: [0.2, 0.8, 0.2, 1], delay: 0.35 }}
          aria-hidden
        />
      )}
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track ?? `color-mix(in srgb, ${color} 18%, transparent)`} strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c, opacity: 0 }}
        // Al 0 % el extremo redondeado dejaría un punto suelto: el arco no se pinta
        animate={{ strokeDashoffset: c * (1 - v), opacity: v > 0 ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 60, damping: 16, delay, opacity: { duration: 0.15, delay: v > 0 ? delay : 0 } }}
      />
    </svg>
  )
}

export function ProgressBar({ value, color = 'var(--c-blue)' }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
        transition={{ type: 'spring', stiffness: 80, damping: 20 }}
        style={{ background: color }}
      />
    </div>
  )
}

/**
 * Título grande de iOS. Cuando sale de la vista al hacer scroll, aparece
 * una barra superior de cristal con el título pequeño.
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  tint,
  eyebrow,
  titleName = 'page-title',
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  tint?: string
  eyebrow?: ReactNode
  /** nombre del título en las transiciones entre pantallas (viaja desde el elemento con el mismo nombre) */
  titleName?: string
}) {
  // Dentro de una View Transition el navegador ya anima el cambio: sin entrada propia
  const vt = inViewTransition()
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      {/* Si no caben título y botones, los botones bajan a otra línea (en vez de cortar el título) */}
      <header className="mb-7 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-60">
          {eyebrow && (
            <motion.p
              initial={vt ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={softSpring}
              className="mb-1 text-[13px] font-semibold tracking-wide uppercase"
              style={{ color: tint }}
            >
              {eyebrow}
            </motion.p>
          )}
          <div ref={ref} className="flex items-center gap-3">
            {icon && (
              <motion.span initial={vt ? false : { scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={bouncy} style={{ viewTransitionName: 'page-icon' }}>
                {icon}
              </motion.span>
            )}
            <motion.h1
              initial={vt ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...softSpring, delay: 0.03 }}
              className="min-w-0 truncate text-[34px] leading-[1.1] font-bold tracking-[-0.025em]"
              style={{ viewTransitionName: titleName }}
            >
              {title}
            </motion.h1>
          </div>
          {subtitle && (
            <motion.p
              initial={vt ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mt-1.5 text-[15px] leading-snug text-muted"
            >
              {subtitle}
            </motion.p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <CompactBar target={ref} title={title} actions={actions} />
    </>
  )
}

/**
 * La barra de arriba con el título pequeño (y «‹ Atrás» dentro de algo), que
 * aparece cuando el título grande (`target`) sale por arriba al hacer scroll.
 */
export function CompactBar({ target, title, actions }: { target: React.RefObject<HTMLElement | null>; title: ReactNode; actions?: ReactNode }) {
  const [compact, setCompact] = useState(false)
  const slot = typeof document !== 'undefined' ? document.getElementById('topbar') : null
  const Back = pageTop.Back
  useEffect(() => {
    const el = target.current
    const root = document.getElementById('main')
    if (!el || !root) return
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { root, rootMargin: '-60px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [target])
  if (!slot) return null
  return createPortal(
    <AnimatePresence>
      {compact && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="glass-bar edge-soft pointer-events-auto flex h-13 items-center justify-center px-14"
        >
          {/* Dentro de algo, «‹ Atrás» también aquí, como en la barra de navegación de iOS */}
          {Back && <Back compact className="absolute left-1.5" />}
          <motion.span initial={{ y: 6 }} animate={{ y: 0 }} transition={spring} className="truncate text-[16px] font-semibold">
            {title}
          </motion.span>
          {actions && <div className="absolute right-4 flex items-center gap-1">{actions}</div>}
        </motion.div>
      )}
    </AnimatePresence>,
    slot,
  )
}

/**
 * Quesito de progreso de un proyecto (como en Things): un aro fino y, dentro,
 * la parte hecha rellena. Lleno del todo, en lima.
 */
export function ProgressPie({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value))
  const c = size / 2
  const r = c - 2.4
  const a = v * 2 * Math.PI
  const x = c + r * Math.sin(a)
  const y = c - r * Math.cos(a)
  const wedge = v >= 1 ? '' : `M ${c} ${c} L ${c} ${c - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x} ${y} Z`
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cx('shrink-0', className)} aria-hidden>
      <circle cx={c} cy={c} r={c - 0.8} fill="none" stroke={v >= 1 ? 'var(--c-green)' : 'currentColor'} strokeWidth={1.5} />
      {v >= 1 ? <circle cx={c} cy={c} r={r} fill="var(--c-green)" /> : v > 0 && <path d={wedge} fill="currentColor" />}
    </svg>
  )
}
