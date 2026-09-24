import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { Hourglass, Plus, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import type { Countdown } from '@/db/types'
import { uid } from '@/lib/id'
import { addDaysYmd, fmt, today } from '@/lib/dates'
import { daysUntil } from '@/lib/things'
import { toast } from '@/app/store'
import { ICONS, Icon } from '@/components/icons'
import { Button, Card, Field, Input, Modal, ModalHeader, cx, spring } from '@/components/ui'

const COUNT_ICONS = ['plane', 'gift', 'heart', 'star', 'sun', 'music', 'graduation', 'home', 'car', 'rocket', 'sparkles', 'baby'].filter((k) => k in ICONS)

/** Cuentas atrás para lo que esperas: vacaciones, una boda, un examen… */
export function CountdownsCard() {
  const t = today()
  // Se ven hasta el mismo día; después desaparecen solas
  const list = useLiveQuery(() => db.countdowns.where('date').aboveOrEqual(t).sortBy('date'), [t])
  const [editing, setEditing] = useState<Countdown | 'new' | null>(null)
  if (!list) return null
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Hourglass size={16} className="text-fg" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold">Cuenta atrás</h3>
        <button type="button" aria-label="Nueva cuenta atrás" onClick={() => setEditing('new')} className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-fill text-fg active:scale-90">
          <Plus size={15} strokeWidth={2.6} />
        </button>
      </div>
      {list.length === 0 ? (
        <button type="button" onClick={() => setEditing('new')} className="w-full rounded-xl bg-fill-2 px-3 py-3 text-left text-[14px] text-muted hover:text-fg">
          ¿Esperas algo? Las vacaciones, un viaje, un cumpleaños…
        </button>
      ) : (
        <div className="space-y-1.5">
          {list.slice(0, 4).map((c, i) => {
            const d = daysUntil(c.date, t)
            return (
              <motion.button
                key={c.id}
                type="button"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring, delay: i * 0.04 }}
                onClick={() => setEditing(c)}
                className={cx('flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left', d === 0 ? 'bg-green text-on-green' : 'bg-fill-2')}
              >
                <Icon name={c.icon} size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold">{c.name}</span>
                  <span className={cx('block text-[12px]', d === 0 ? 'opacity-80' : 'text-muted')}>{fmt(c.date, "EEEE d 'de' MMMM")}</span>
                </span>
                <span className="text-right">
                  <span className="font-num block text-[22px] leading-none font-bold">{d === 0 ? '¡Hoy!' : d}</span>
                  {d > 0 && <span className={cx('block text-[11px]', 'text-muted')}>{d === 1 ? 'día' : 'días'}</span>}
                </span>
              </motion.button>
            )
          })}
        </div>
      )}
      <CountdownForm value={editing} onClose={() => setEditing(null)} />
    </Card>
  )
}

function CountdownForm({ value, onClose }: { value: Countdown | 'new' | null; onClose: () => void }) {
  return (
    <Modal open={!!value} onClose={onClose} position="center">
      {value && <Fields key={value === 'new' ? 'new' : value.id} countdown={value === 'new' ? undefined : value} onClose={onClose} />}
    </Modal>
  )
}

function Fields({ countdown, onClose }: { countdown?: Countdown; onClose: () => void }) {
  const [name, setName] = useState(countdown?.name ?? '')
  const [date, setDate] = useState(countdown?.date ?? addDaysYmd(today(), 30))
  const [icon, setIcon] = useState(countdown?.icon ?? 'plane')
  const valid = name.trim() && date >= today()
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid) return
        await db.countdowns.put({ id: countdown?.id ?? uid(), name: name.trim(), date, icon, createdAt: countdown?.createdAt ?? Date.now() })
        onClose()
      }}
    >
      <ModalHeader title={countdown ? 'Cuenta atrás' : 'Nueva cuenta atrás'} onClose={onClose} />
      <div className="space-y-4 p-5">
        <Field label="¿Qué esperas?">
          <Input autoFocus={!countdown} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Vacaciones en Menorca" />
        </Field>
        <Field label="¿Cuándo?">
          <Input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Icono">
          <div className="grid grid-cols-6 gap-1">
            {COUNT_ICONS.map((k) => (
              <button key={k} type="button" aria-label={k} onClick={() => setIcon(k)} className={cx('flex h-10 items-center justify-center rounded-full transition-all active:scale-90', icon === k ? 'bg-accent text-white' : 'text-muted hover:bg-hover hover:text-fg')}>
                <Icon name={k} size={17} />
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        {countdown && (
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              await db.countdowns.delete(countdown.id)
              onClose()
              toast('Cuenta atrás borrada', { label: 'Deshacer', run: () => void db.countdowns.put(countdown) })
            }}
          >
            <Trash2 size={15} /> Borrar
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          Guardar
        </Button>
      </div>
    </form>
  )
}
