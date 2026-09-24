import { Group, cx } from '@/components/ui'

const rowCls = 'flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-[15px] transition-colors hover:bg-hover disabled:opacity-50 [&+&]:shadow-[inset_0_1px_0_var(--c-border)]'

export function LinkSection({ title, footer, children }: { title: string; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 px-4 text-[13px] font-medium tracking-wide text-muted uppercase">{title}</h2>
      <Group>{children}</Group>
      {footer && <div className="mt-2 px-4 text-[13px] leading-snug text-muted">{footer}</div>}
    </section>
  )
}

export function LinkRow({
  icon,
  label,
  detail,
  href,
  onClick,
  disabled,
  primary,
  external,
}: {
  icon: React.ReactNode
  label: string
  detail?: string
  href?: string
  onClick?: () => void
  disabled?: boolean
  primary?: boolean
  external?: boolean
}) {
  const content = (
    <>
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill text-fg">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cx(primary && 'text-blue')}>{label}</span>
        {detail && <span className="block text-[13px] text-muted">{detail}</span>}
      </span>
    </>
  )
  return href ? (
    <a href={href} className={rowCls} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {content}
    </a>
  ) : (
    <button type="button" disabled={disabled} onClick={onClick} className={rowCls}>
      {content}
    </button>
  )
}
