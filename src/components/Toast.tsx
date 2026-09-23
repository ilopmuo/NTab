import { setUI, useUI } from '@/app/store'

export function Toast() {
  const t = useUI((s) => s.toast)
  if (!t) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 lg:bottom-6">
      <div
        key={t.id}
        className="pointer-events-auto flex items-center gap-4 rounded-xl border border-line-strong bg-elevated py-2.5 pr-2.5 pl-4 text-[13.5px] shadow-2xl shadow-black/40 animate-pop-in"
      >
        <span>{t.message}</span>
        {t.action && (
          <button
            type="button"
            onClick={() => {
              t.action!.run()
              setUI({ toast: null })
            }}
            className="rounded-lg px-2.5 py-1 text-[13px] font-semibold text-accent hover:bg-accent-soft"
          >
            {t.action.label}
          </button>
        )}
      </div>
    </div>
  )
}
