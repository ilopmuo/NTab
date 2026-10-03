import type { LucideIcon } from 'lucide-react'
import { href } from '@/app/router'
import { cx } from './ui'

/**
 * Baldosa de una lista o de una página que vive dentro de un lugar (como las
 * de la portada de Recordatorios): el icono arriba, el recuento a su derecha y
 * el nombre abajo. Lleva a su página.
 */
export function Tile({ to, icon: Icon, label, count, hint, className }: { to: string; icon: LucideIcon; label: string; count?: number; hint?: string; className?: string }) {
  return (
    <a href={href(to)} className={cx('glass flex min-h-[88px] flex-col justify-between gap-2 rounded-[18px] p-3.5 transition-transform active:scale-[0.97]', className)}>
      <span className="flex items-start justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-fill text-fg">
          <Icon size={18} strokeWidth={2.2} aria-hidden />
        </span>
        {count !== undefined && <span className="font-num text-[24px] leading-none font-bold">{count}</span>}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold">{label}</span>
        {hint && <span className="block truncate text-[12.5px] text-muted">{hint}</span>}
      </span>
    </a>
  )
}
