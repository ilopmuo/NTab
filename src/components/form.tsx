import { forwardRef, useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { m as motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { cx, spring } from './ui'

// Los campos de los formularios, aparte de ui.tsx: no hacen falta para arrancar

const field =
  'w-full rounded-xl bg-fill-2 text-[15px] text-fg placeholder:text-faint transition-shadow focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--c-blue)_35%,transparent)]'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={cx(field, 'h-11 px-3.5', className)} />
})

export function Textarea({
  className,
  autoGrow = true,
  ref: outer,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean; ref?: React.RefObject<HTMLTextAreaElement | null> }) {
  const inner = useRef<HTMLTextAreaElement>(null)
  const ref = outer ?? inner
  useEffect(() => {
    if (!autoGrow || !ref.current) return
    ref.current.style.height = 'auto'
    ref.current.style.height = `${ref.current.scrollHeight}px`
  }, [rest.value, autoGrow])
  return (
    <textarea
      ref={ref}
      {...rest}
      // Sin fondo salvo que se pida uno (sin tailwind-merge, bg-transparent ganaría siempre)
      className={cx('w-full resize-none text-[15px] leading-relaxed text-fg placeholder:text-faint', !/(^|\s)bg-/.test(className ?? '') && 'bg-transparent', className)}
    />
  )
}

/**
 * Campo con su título. Con un solo control (campo, desplegable) es un <label>;
 * con varios botones (segmentado, iconos, días…) pasa `group`: así cada botón
 * conserva su propio nombre y el título nombra el grupo.
 */
export function Field({ label, children, group }: { label: string; children: ReactNode; group?: boolean }) {
  const id = useId()
  const title = (
    <span id={id} className="mb-1.5 block px-1 text-[12px] font-medium tracking-wide text-muted uppercase">
      {label}
    </span>
  )
  return group ? (
    <div role="group" aria-labelledby={id}>
      {title}
      {children}
    </div>
  ) : (
    <label className="block">
      {title}
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
            aria-pressed={on}
            // Si solo hay un icono, el nombre para el lector de pantalla es el título
            aria-label={typeof o.label === 'string' ? undefined : o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative flex h-7 min-w-9 flex-1 items-center justify-center gap-1 rounded-[8px] px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
              on ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                layoutDependency={on}
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

/** Interruptor de iOS: pista lima cuando está activo, bola con muelle */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40', checked ? 'bg-green' : 'bg-fill')}
    >
      <motion.span
        className="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)]"
        animate={{ x: checked ? 20 : 0 }}
        transition={spring}
      />
    </button>
  )
}
