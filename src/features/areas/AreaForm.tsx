import { useState } from 'react'
import type { Area } from '@/db/types'
import { db } from '@/db/db'
import { createArea } from '@/db/actions'
import { ICONS, Icon } from '@/components/icons'
import { Button, Field, Input, Modal, ModalHeader, cx } from '@/components/ui'

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
  const save = async () => {
    if (!name.trim()) return
    if (area) {
      await db.areas.update(area.id, { name: name.trim(), icon })
      onSaved?.({ ...area, name, icon })
    } else {
      const a = await createArea({ name: name.trim(), icon })
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
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill text-fg">
            <Icon name={icon} size={22} />
          </span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del área (ej. Salud)" className="h-11 text-[15px]" />
        </div>
        <Field label="Icono">
          <div className="grid grid-cols-10 gap-1">
            {Object.keys(ICONS).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setIcon(k)}
                className={cx('flex h-9 items-center justify-center rounded-full transition-all active:scale-90', icon === k ? 'bg-accent text-white' : 'text-muted hover:bg-hover hover:text-fg')}
              >
                <Icon name={k} size={16} />
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex justify-end gap-2 px-5 pt-1 pb-5">
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
