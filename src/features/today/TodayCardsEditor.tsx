import { Reorder, useDragControls } from 'motion/react'
import { GripVertical } from 'lucide-react'
import { setSetting } from '@/db/actions'
import { Modal, ModalHeader, Switch } from '@/components/ui'
import { TODAY_CARDS, useTodayCards, type Prefs, type TodayCardId } from './cards'

/** Elegir y ordenar las tarjetas de Hoy */
export function TodayCardsEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { order, enabled, hidden } = useTodayCards()
  const save = (next: Partial<Prefs>) => void setSetting('todayCards', { order, hidden: [...hidden], ...next })
  // Al reordenar, las de funciones apagadas conservan su sitio al final
  const reorder = (o: string[]) => save({ order: [...o, ...order.filter((id) => !o.includes(id))] })
  return (
    <Modal open={open} onClose={onClose} position="center">
      <ModalHeader title="Personalizar Hoy" onClose={onClose} />
      <p className="px-5 pb-3 text-[13.5px] text-muted">Elige qué tarjetas ves en Hoy y arrástralas para ordenarlas.</p>
      <Reorder.Group axis="y" values={enabled} onReorder={reorder} className="max-h-[60vh] space-y-1.5 overflow-y-auto px-5 pb-5">
        {enabled.map((id) => (
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
      <span className={on ? 'flex-1 text-[15px]' : 'flex-1 text-[15px] text-muted'}>{label}</span>
      <Switch label={label} checked={on} onChange={onToggle} />
    </Reorder.Item>
  )
}
