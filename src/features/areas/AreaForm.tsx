import { useState } from 'react'
import type { Area } from '@/db/types'
import { db } from '@/db/db'
import { createArea } from '@/db/actions'
import { COLORS, ICONS, Icon } from '@/components/icons'
import { Button, ColorPicker, Field, Input, Modal, ModalHeader, cx } from '@/components/ui'

export function AreaForm({ area, open, onClose, onSaved }: { area?: Area; open: boolean; onClose: () => void; onSaved?: (a: Area) => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Form area={area} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  )
}

function Form({ area, onClose, onSaved }: { area?: Area; onClose: () => void; onSaved?: (a: Area) => void }) {
  const [name, setName] = useState(area?.name ?? '')
  const [icon, setIcon] = useState(area?.icon ?? 'star')
  const [color, setColor] = useState(area?.color ?? COLORS[0])

  const save = async () => {
    if (!name.trim()) return
    if (area) {
      await db.areas.update(area.id, { name: name.trim(), icon, color })
      onSaved?.({ ...area, name, icon, color })
    } else {
      const a = await createArea({ name: name.trim(), icon, color })
      onSaved?.(a)
    }
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={area ? 'Editar área' : 'Nueva área'} onClose={onClose} />
      <div className="space-y-5 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}22`, color }}>
            <Icon name={icon} size={22} />
          </span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del área (ej. Salud)" className="h-11 text-[15px]" />
        </div>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} colors={COLORS} />
        </Field>
        <Field label="Icono">
          <div className="grid grid-cols-10 gap-1">
            {Object.keys(ICONS).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setIcon(k)}
                className={cx('flex h-8 items-center justify-center rounded-lg transition-colors', icon === k ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-fg')}
              >
                <Icon name={k} size={16} />
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          {area ? 'Guardar' : 'Crear área'}
        </Button>
      </div>
    </form>
  )
}
