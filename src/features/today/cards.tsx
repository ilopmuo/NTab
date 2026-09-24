import { useLiveQuery } from 'dexie-react-hooks'
import { Reorder, useDragControls } from 'motion/react'
import { GripVertical } from 'lucide-react'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import { Modal, ModalHeader, Switch } from '@/components/ui'

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

interface Prefs {
  order: string[]
  hidden: string[]
}

/** Orden (con las tarjetas nuevas al final) y cuáles están ocultas */
export function useTodayCards() {
  const prefs = useLiveQuery(() => db.settings.get('todayCards').then((r) => (r?.value as Prefs | undefined) ?? { order: [], hidden: [] }), [])
  const known = TODAY_CARDS.map((c) => c.id as string)
  const order = [...(prefs?.order ?? []).filter((id) => known.includes(id)), ...known.filter((id) => !(prefs?.order ?? []).includes(id))] as TodayCardId[]
  const hidden = new Set(prefs?.hidden ?? [])
  return { loaded: !!prefs, order, hidden, visible: order.filter((id) => !hidden.has(id)) }
}

export function TodayCardsEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { order, hidden } = useTodayCards()
  const save = (next: Partial<Prefs>) => void setSetting('todayCards', { order, hidden: [...hidden], ...next })
  return (
    <Modal open={open} onClose={onClose} position="center">
      <ModalHeader title="Personalizar Hoy" onClose={onClose} />
      <p className="px-5 pb-3 text-[13.5px] text-muted">Elige qué tarjetas ves en Hoy y arrástralas para ordenarlas.</p>
      <Reorder.Group axis="y" values={order} onReorder={(o) => save({ order: o })} className="max-h-[60vh] space-y-1.5 overflow-y-auto px-5 pb-5">
        {order.map((id) => (
          <Row key={id} id={id} on={!hidden.has(id)} onToggle={(v) => save({ hidden: v ? [...hidden].filter((x) => x !== id) : [...hidden, id] })} />
        ))}
      </Reorder.Group>
    </Modal>
  )
}

function Row({ id, on, onToggle }: { id: TodayCardId; on: boolean; onToggle: (v: boolean) => void }) {
  const controls = useDragControls()
  const label = TODAY_CARDS.find((c) => c.id === id)?.label ?? id
  return (
    <Reorder.Item value={id} dragListener={false} dragControls={controls} className="flex h-12 items-center gap-2 rounded-xl bg-fill-2 pr-3 pl-1.5">
      <button type="button" aria-label={`Mover ${label}`} onPointerDown={(e) => controls.start(e)} className="flex h-10 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-faint active:cursor-grabbing">
        <GripVertical size={16} />
      </button>
      <span className={on ? 'flex-1 text-[15px]' : 'flex-1 text-[15px] text-faint'}>{label}</span>
      <Switch label={label} checked={on} onChange={onToggle} />
    </Reorder.Item>
  )
}
