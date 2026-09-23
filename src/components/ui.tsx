import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function cx(...c: (string | false | 0 | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent text-white hover:brightness-110 active:brightness-95',
  secondary: 'bg-hover text-fg hover:bg-line border border-line',
  ghost: 'text-muted hover:text-fg hover:bg-hover',
  danger: 'text-danger hover:bg-danger-soft',
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }
>(function Button({ variant = 'secondary', size = 'md', className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all select-none disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13.5px]',
        BTN[variant],
        className,
      )}
    />
  )
})

export function IconButton({
  className,
  label,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg',
        className,
      )}
    />
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={cx(
        'h-9 w-full rounded-lg border border-line bg-bg px-3 text-[13.5px] text-fg placeholder:text-faint transition-colors focus:border-accent',
        className,
      )}
    />
  )
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
      className={cx(
        'w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-fg placeholder:text-faint',
        className,
      )}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11.5px] font-medium tracking-wide text-muted uppercase">{label}</span>
      {children}
    </label>
  )
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cx(
        'h-9 w-full appearance-none rounded-lg border border-line bg-bg px-3 text-[13.5px] text-fg transition-colors focus:border-accent',
        className,
      )}
    />
  )
}

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
  return (
    <div className={cx('inline-flex rounded-lg border border-line bg-bg p-0.5', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex h-7 min-w-8 flex-1 items-center justify-center gap-1 rounded-md px-2.5 text-[12.5px] font-medium transition-all',
            value === o.value ? 'bg-elevated text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-hover px-1 font-sans text-[11px] text-muted">
      {children}
    </kbd>
  )
}

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
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])
  if (!open) return null
  return (
    <div
      className={cx(
        'fixed inset-0 z-50 flex justify-center bg-scrim p-4 animate-fade-in backdrop-blur-[2px]',
        position === 'top' ? 'items-start pt-[12vh]' : 'items-center',
      )}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-elevated shadow-2xl shadow-black/40 animate-pop-in',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <IconButton label="Cerrar" onClick={onClose}>
        <X size={16} />
      </IconButton>
    </div>
  )
}

export function Empty({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center animate-fade-in">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-hover text-muted">{icon}</div>
      <p className="text-[15px] font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-[13px] text-muted">{hint}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function Section({
  title,
  count,
  action,
  children,
  tone,
}: {
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
  tone?: 'danger' | 'accent' | 'lime'
}) {
  return (
    <section className="mb-8">
      <div className="mb-1 flex items-center gap-2 px-1">
        <h3
          className={cx(
            'text-[12px] font-semibold tracking-wider uppercase',
            tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : tone === 'lime' ? 'text-lime' : 'text-muted',
          )}
        >
          {title}
        </h3>
        {count !== undefined && <span className="text-[12px] text-faint tabular-nums">{count}</span>}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  )
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-2xl border border-line bg-surface', className)}>
      {children}
    </div>
  )
}

export function ProgressRing({ value, size = 44, stroke = 4, color = 'var(--c-lime)' }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v)}
        style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(0.2,0.8,0.2,1)' }}
      />
    </svg>
  )
}

export function ProgressBar({ value, color = 'var(--c-accent)' }: { value: number; color?: string }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: color }}
      />
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-8 flex items-end gap-4 animate-fade-in">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          {icon}
          <h1 className="truncate text-[30px] leading-tight font-bold tracking-[-0.025em]">{title}</h1>
        </div>
        {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}

export function ColorPicker({ value, onChange, colors }: { value: string; onChange: (c: string) => void; colors: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={cx('h-6 w-6 rounded-full transition-transform hover:scale-110', value === c && 'ring-2 ring-fg ring-offset-2 ring-offset-elevated')}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}
