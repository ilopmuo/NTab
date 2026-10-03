import { cx } from '@/components/ui'
import { pageTop } from '@/app/pageTop'

export function Page({ children, wide, className, trailing }: { children: React.ReactNode; wide?: boolean; className?: string; /** a la derecha del «‹ Atrás» (p. ej. eliminar) */ trailing?: React.ReactNode }) {
  const Top = pageTop.Component
  return (
    <div
      className={cx(
        'mx-auto w-full px-4 pt-[max(env(safe-area-inset-top),20px)] pb-36 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16',
        wide ? 'max-w-6xl' : 'max-w-3xl',
        className,
      )}
    >
      {Top && <Top trailing={trailing} />}
      {children}
    </div>
  )
}
