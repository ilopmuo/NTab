import { cx } from '@/components/ui'

export function Page({ children, wide, className }: { children: React.ReactNode; wide?: boolean; className?: string }) {
  return (
    <div
      className={cx(
        'mx-auto w-full px-4 pt-[max(env(safe-area-inset-top),20px)] pb-36 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16',
        wide ? 'max-w-6xl' : 'max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
