import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useLookup } from '@/db/hooks'
import { cx } from '@/components/ui'
import { goBack, previousPath, useRoute } from './router'
import { parentOf, titleOf } from './titles'
import { HubTabs } from './HubTabs'

/**
 * Volver, como en iOS: lleva el nombre de la pantalla de la que vienes
 * («‹ Hoy») y vuelve a ella con su animación; si llegaste directamente (un
 * enlace, un aviso), lleva a la de arriba («‹ Proyectos»). Solo dentro de
 * algo: las pantallas de la barra no tienen «atrás».
 */
export function useBack(): { label: string; go: () => void } | undefined {
  const { path } = useRoute()
  // Para que el nombre esté al día si se renombra el proyecto o el área
  useLookup()
  const parent = parentOf(path)
  if (!parent) return undefined
  const prev = previousPath()
  return { label: titleOf(prev && prev !== path ? prev : parent), go: () => goBack(parent) }
}

export function BackButton({ compact, className }: { compact?: boolean; className?: string }) {
  const back = useBack()
  if (!back) return null
  return (
    <button
      type="button"
      onClick={back.go}
      aria-label={`Volver a ${back.label}`}
      className={cx(
        'flex min-w-0 items-center text-blue transition-opacity active:opacity-50',
        compact ? 'h-11 max-w-[34vw] pr-2 text-[16px] font-medium lg:max-w-56' : '-ml-1.5 h-9 max-w-[70%] pr-3 text-[17px] font-medium',
        className,
      )}
    >
      <ChevronLeft size={compact ? 24 : 26} strokeWidth={2.4} className="-mr-0.5 shrink-0" />
      <span className="truncate">{back.label}</span>
    </button>
  )
}

/**
 * Encima del título de cada página: dentro de algo, «‹ Atrás» (y, a la
 * derecha, lo que la página ponga ahí); en la portada de un espacio, sus pestañas.
 */
export function PageTop({ anyDepth, trailing }: { anyDepth?: boolean; trailing?: ReactNode }) {
  const back = useBack()
  if (back && !anyDepth)
    return (
      <div className="mb-3 flex min-h-9 items-center">
        <BackButton />
        {trailing && <div className="ml-auto flex shrink-0 items-center gap-1.5">{trailing}</div>}
      </div>
    )
  return (
    <>
      <HubTabs anyDepth={anyDepth} />
      {trailing && <div className="mb-3 flex justify-end">{trailing}</div>}
    </>
  )
}
