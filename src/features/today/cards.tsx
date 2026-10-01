import { Suspense, lazy, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { useFeatures } from '@/app/features'

/** Tarjetas de la columna de Hoy, en su orden por defecto */
export const TODAY_CARDS = [
  { id: 'rings', label: 'Anillos del día' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'journal', label: '¿Qué tal el día? (por la tarde)' },
  { id: 'meals', label: 'Hoy se come' },
  { id: 'countdowns', label: 'Cuenta atrás' },
  { id: 'routines', label: 'Rutinas' },
  { id: 'trackers', label: 'Toca hacer (última vez)' },
  { id: 'things', label: 'Cosas (caducidades y préstamos)' },
  { id: 'habits', label: 'Hábitos' },
  { id: 'week', label: 'Próximos días' },
  { id: 'payments', label: 'Pagos' },
  { id: 'people', label: 'Personas' },
] as const
export type TodayCardId = (typeof TODAY_CARDS)[number]['id']

export interface Prefs {
  order: string[]
  hidden: string[]
}

/** Orden (con las tarjetas nuevas al final) y cuáles están ocultas */
export function useTodayCards() {
  const prefs = useLiveQuery(() => db.settings.get('todayCards').then((r) => (r?.value as Prefs | undefined) ?? { order: [], hidden: [] }), [])
  const known = TODAY_CARDS.map((c) => c.id as string)
  const order = [...(prefs?.order ?? []).filter((id) => known.includes(id)), ...known.filter((id) => !(prefs?.order ?? []).includes(id))] as TodayCardId[]
  const hidden = new Set(prefs?.hidden ?? [])
  // Las tarjetas de funciones apagadas no salen (ni en Hoy ni en el editor)
  const features = useFeatures()
  const enabled = order.filter((id) => features.card(id))
  return { loaded: !!prefs, order, enabled, hidden, visible: enabled.filter((id) => !hidden.has(id)) }
}

// El editor se carga al abrirlo: arrastrar para ordenar necesita el motor completo de animaciones
const Editor = lazy(() => import('./TodayCardsEditor').then((m) => ({ default: m.TodayCardsEditor })))

export function TodayCardsEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Una vez cargado se queda, para que la hoja se cierre con su animación
  const [used, setUsed] = useState(open)
  if (open && !used) setUsed(true)
  if (!used) return null
  return (
    <Suspense fallback={null}>
      <Editor open={open} onClose={onClose} />
    </Suspense>
  )
}
