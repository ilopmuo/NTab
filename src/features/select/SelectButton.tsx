import { Check, ListChecks } from 'lucide-react'
import { cx } from '@/components/ui'
import { selection, useSelecting } from './selection'

/** Botón «Seleccionar» para las cabeceras de las listas */
export function SelectButton({ small }: { small?: boolean }) {
  const active = useSelecting()
  return (
    <button
      type="button"
      aria-label={active ? 'Terminar de seleccionar' : 'Seleccionar tareas'}
      onClick={() => (active ? selection.clear() : selection.start())}
      className={cx(
        'flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold transition-all active:scale-95',
        // En el móvil, solo el icono para no apretar el título
        small ? 'h-8 px-3 text-[13px]' : 'h-9 px-3.5 text-[14px] max-sm:w-9 max-sm:px-0',
        active ? 'bg-accent-fill text-white' : 'bg-fill text-fg hover:bg-press',
      )}
    >
      {!small && (active ? <Check size={17} strokeWidth={2.6} className="sm:hidden" /> : <ListChecks size={17} strokeWidth={2.3} className="sm:hidden" />)}
      <span className={cx(!small && 'max-sm:hidden')}>{active ? 'Listo' : 'Seleccionar'}</span>
    </button>
  )
}
