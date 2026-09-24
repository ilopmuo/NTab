import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { Tracker } from '@/db/types'
import { db } from '@/db/db'
import { createTracker, deleteTracker, setTrackerLog } from '@/db/actions'
import { fmt, today } from '@/lib/dates'
import { averageEvery, everyLabel, withDate } from '@/lib/trackers'
import { ICONS, Icon } from '@/components/icons'
import { toastTrashed } from '../trash/undo'
import { Button, Field, Input, Modal, ModalHeader, Select, cx } from '@/components/ui'

const EVERY = [0, 1, 2, 3, 4, 7, 14, 21, 30, 45, 60, 90, 180, 365]
const TRACKER_ICONS = ['bed', 'leaf', 'heart', 'sparkles', 'home', 'droplet', 'car', 'camera', 'dog', 'pill', 'shirt', 'food', 'cart', 'wallet', 'phone', 'circle'].filter((k) => k in ICONS)

export function TrackerForm({ tracker, open, onClose }: { tracker?: Tracker; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Form tracker={tracker} onClose={onClose} />}
    </Modal>
  )
}

function Form({ tracker, onClose }: { tracker?: Tracker; onClose: () => void }) {
  const [name, setName] = useState(tracker?.name ?? '')
  const [icon, setIcon] = useState(tracker?.icon ?? 'circle')
  const [every, setEvery] = useState(tracker?.every ?? 0)
  const [log, setLog] = useState<string[]>(tracker?.log ?? [])
  const [past, setPast] = useState('')
  const avg = averageEvery({ log })

  const save = async () => {
    if (!name.trim()) return
    const data = { name: name.trim(), icon, every: every || undefined }
    if (tracker) {
      await db.trackers.update(tracker.id, data)
      if (log.join() !== tracker.log.join()) await setTrackerLog(tracker.id, log)
    } else await createTracker({ ...data, log })
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={tracker ? 'Editar' : '¿Qué quieres recordar?'} onClose={onClose} />
      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
            <Icon name={icon} size={22} />
          </span>
          <Input autoFocus={!tracker} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cambiar las sábanas" className="h-11 text-[15px]" />
        </div>
        <Field label="¿Cada cuánto debería?">
          <Select value={every} onChange={(e) => setEvery(Number(e.target.value))}>
            {EVERY.map((d) => (
              <option key={d} value={d}>
                {d ? everyLabel(d).replace(/^c/, 'C') : 'Sin fecha fija: solo apuntar cuándo'}
              </option>
            ))}
          </Select>
          {avg && <p className="mt-1.5 px-1 text-[12.5px] text-muted">De media lo haces {everyLabel(avg)}.</p>}
        </Field>
        <Field label="Veces que lo has hecho">
          <div className="space-y-1.5">
            {log.slice(0, 12).map((d) => (
              <div key={d} className="flex h-10 items-center gap-2 rounded-xl bg-fill-2 pr-1 pl-3.5">
                <span className="flex-1 text-[15px]">{fmt(d, "EEEE d 'de' MMMM yyyy")}</span>
                <button type="button" aria-label={`Quitar ${d}`} onClick={() => setLog(log.filter((x) => x !== d))} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg">
                  <X size={14} />
                </button>
              </div>
            ))}
            {log.length > 12 && <p className="px-1 text-[12.5px] text-faint">…y {log.length - 12} más</p>}
            <div className="flex gap-2">
              <Input type="date" value={past} max={today()} onChange={(e) => setPast(e.target.value)} aria-label="Otra fecha" className="flex-1" />
              <Button
                type="button"
                disabled={!past}
                onClick={() => {
                  setLog(withDate(log, past))
                  setPast('')
                }}
              >
                <Plus size={15} /> Añadir
              </Button>
            </div>
          </div>
        </Field>
        <Field label="Icono">
          <div className="grid grid-cols-8 gap-1">
            {TRACKER_ICONS.map((k) => (
              <button
                key={k}
                type="button"
                aria-label={k}
                onClick={() => setIcon(k)}
                className={cx('flex h-9 items-center justify-center rounded-full transition-all active:scale-90', icon === k ? 'bg-accent text-white' : 'text-muted hover:bg-hover hover:text-fg')}
              >
                <Icon name={k} size={16} />
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        {tracker && (
          <Button type="button" variant="danger" onClick={async () => (await deleteTracker(tracker.id), onClose(), toastTrashed('En la papelera', 'trackers', tracker.id))}>
            <Trash2 size={15} /> Eliminar
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          {tracker ? 'Guardar' : 'Crear'}
        </Button>
      </div>
    </form>
  )
}
