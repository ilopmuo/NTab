import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { ChevronDown, X } from 'lucide-react'

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
    const controls = animate(from, value, {
      duration: 0.8,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = String(Math.round(v))
      },
    })
    return () => controls.stop()
  }, [value])
  return (
    <span ref={ref} className={cx('font-num', className)}>
      0
    </span>
  )
}

// ── Botones ───────────────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tinted'
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] hover:brightness-110',
  secondary: 'bg-fill text-fg hover:bg-press',
  tinted: 'bg-accent-soft text-accent hover:brightness-110',
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

const field =
  'w-full rounded-xl bg-fill-2 text-[15px] text-fg placeholder:text-faint transition-shadow focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-blue)_35%,transparent)]'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={cx(field, 'h-11 px-3.5', className)} />
})

export function Textarea({
  className,
  autoGrow = true,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!autoGrow || !ref.current) return
    ref.current.style.height = 'auto'
    ref.current.style.height = `${ref.current.scrollHeight}px`
  }, [rest.value, autoGrow])
  return (
    <textarea
      ref={ref}
      {...rest}
      className={cx('w-full resize-none bg-transparent text-[15px] leading-relaxed text-fg placeholder:text-faint', className)}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-[12px] font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
    </label>
  )
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx('relative inline-flex', className?.includes('w-auto') ? '' : 'w-full')}>
      <select {...rest} className={cx(field, 'h-11 appearance-none pr-9 pl-3.5', className)} />
      <ChevronDown size={15} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
    </span>
  )
}

/** Control segmentado de iOS con el indicador deslizándose */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  className?: string
}) {
  const id = useId()
  return (
    <div className={cx('inline-flex rounded-[10px] bg-fill p-[2px]', className)}>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative flex h-7 min-w-9 flex-1 items-center justify-center gap-1 rounded-[8px] px-3 text-[13px] font-medium transition-colors',
              on ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring}
                className="absolute inset-0 rounded-[8px] bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.16),0_0_0_1px_rgb(0_0_0/0.03)] dark:bg-[#636366]"
              />
            )}
            <span className="relative flex items-center gap-1">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-fill px-1 font-sans text-[11px] font-medium text-muted">
      {children}
    </kbd>
  )
}

// ── Modales y hojas ───────────────────────────────────────────

/**
 * En ordenador: panel flotante con muelle. En móvil: hoja que sube desde abajo
 * y se cierra arrastrándola hacia abajo, como en iOS.
 */
export function Modal({
  open,
  onClose,
  children,
  className,
  position = 'top',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  position?: 'top' | 'center'
}) {
  const mobile = useIsMobile()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Al cerrarse, quitar el foco de sus campos: si no, durante la animación de
  // salida las teclas (y los atajos como N) irían a un campo que ya no se ve.
  useEffect(() => {
    if (open) return
    const el = document.activeElement as HTMLElement | null
    if (el?.closest('[role=dialog]')) el.blur()
  }, [open])
  // Cada apertura monta un contenido nuevo (aunque la anterior aún se esté cerrando)
  const session = useRef(0)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) session.current++
  wasOpen.current = open
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key={`modal-${session.current}`}
          className={cx(
            'fixed inset-0 z-50 flex justify-center',
            mobile ? 'items-end' : position === 'top' ? 'items-start px-4 pt-[14vh]' : 'items-center p-4',
          )}
        >
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onMouseDown={onClose}
          />
          {mobile ? (
            <Sheet onClose={onClose} className={className}>
              {children}
            </Sheet>
          ) : (
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.15 } }}
              transition={spring}
              className={cx('glass-thick relative w-full max-w-lg overflow-hidden rounded-[22px]', className)}
            >
              {children}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function Sheet({ children, onClose, className }: { children: ReactNode; onClose: () => void; className?: string }) {
  const y = useMotionValue(0)
  const opacity = useTransform(y, [0, 300], [1, 0.6])
  const controls = useDragControls()
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%', transition: { duration: 0.25, ease: [0.4, 0, 1, 1] } }}
      transition={{ type: 'spring', stiffness: 420, damping: 40 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.05, bottom: 0.9 }}
      dragControls={controls}
      dragListener={false}
      onDragEnd={onDragEnd}
      style={{ y, opacity, background: 'color-mix(in srgb, var(--c-elevated) 96%, transparent)' }}
      className={cx(
        'glass-thick relative max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] pb-[max(env(safe-area-inset-bottom),12px)]',
        className,
        '!max-w-none',
      )}
    >
      <div
        onPointerDown={(e) => controls.start(e)}
        className="sticky top-0 z-10 flex cursor-grab touch-none justify-center pt-2 pb-2"
      >
        <span className="h-[5px] w-9 rounded-full bg-line-strong" />
      </div>
      {children}
    </motion.div>
  )
}

export function ModalHeader({ title, onClose, left }: { title: string; onClose: () => void; left?: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3">
      <div>{left}</div>
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <div className="flex justify-end">
        <IconButton label="Cerrar" filled onClick={onClose} className="h-8 w-8">
          <X size={15} strokeWidth={2.5} />
        </IconButton>
      </div>
    </div>
  )
}

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
      <motion.div
        initial={{ scale: 0.6, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ ...bouncy, delay: 0.05 }}
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
      >
        {icon}
      </motion.div>
      <p className="text-[17px] font-semibold">{title}</p>
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
}: {
  title: ReactNode
  count?: number
  action?: ReactNode
  children: ReactNode
  tone?: string
  className?: string
}) {
  return (
    <section className={cx('mb-8', className)}>
      <div className="mb-2 flex min-h-8 items-center gap-2 px-1">
        <h3 className="text-[19px] font-bold tracking-tight" style={{ color: tone ? TONES[tone] : undefined }}>
          {title}
        </h3>
        {count !== undefined && count > 0 && <span className="font-num text-[15px] font-semibold text-faint">{count}</span>}
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
  return (
    <svg width={size} height={size} className="-rotate-90">
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
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - v) }}
        transition={{ type: 'spring', stiffness: 60, damping: 16, delay }}
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
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  tint?: string
  eyebrow?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const slot = typeof document !== 'undefined' ? document.getElementById('topbar') : null
  useEffect(() => {
    const el = ref.current
    const root = document.getElementById('main')
    if (!el || !root) return
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { root, rootMargin: '-60px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      <header className="mb-7 flex items-end gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
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
              <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={bouncy}>
                {icon}
              </motion.span>
            )}
            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...softSpring, delay: 0.03 }}
              className="min-w-0 truncate text-[34px] leading-[1.1] font-bold tracking-[-0.025em]"
            >
              {title}
            </motion.h1>
          </div>
          {subtitle && (
            <motion.p
              initial={{ opacity: 0 }}
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
      {slot &&
        createPortal(
          <AnimatePresence>
            {compact && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="glass-bar hairline-b pointer-events-auto flex h-13 items-center justify-center px-14"
              >
                <motion.span
                  initial={{ y: 6 }}
                  animate={{ y: 0 }}
                  transition={spring}
                  className="truncate text-[16px] font-semibold"
                >
                  {title}
                </motion.span>
                {actions && <div className="absolute right-4 flex items-center gap-1">{actions}</div>}
              </motion.div>
            )}
          </AnimatePresence>,
          slot,
        )}
    </>
  )
}

export function ColorPicker({ value, onChange, colors }: { value: string; onChange: (c: string) => void; colors: string[] }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={cx('relative h-8 w-8 rounded-full transition-transform active:scale-90', value === c && 'scale-110')}
          style={{ background: c }}
        >
          {value === c && (
            <motion.span layoutId="color-pick" transition={spring} className="absolute -inset-[4px] rounded-full border-[2.5px]" style={{ borderColor: c }} />
          )}
        </button>
      ))}
    </div>
  )
}
