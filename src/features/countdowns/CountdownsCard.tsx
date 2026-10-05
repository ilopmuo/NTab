import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { m as motion } from 'motion/react'
import { Hourglass, Plus, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import type { Countdown } from '@/db/types'
import { uid } from '@/lib/id'
import { addDaysYmd, fmt, today } from '@/lib/dates'
import { daysUntil } from '@/lib/things'
import { toast } from '@/app/store'
import { ICONS, Icon } from '@/components/icons'
import { Button, Card, Field, Input, Modal, ModalHeader, ProgressRing, cx, spring } from '@/components/ui'

const COUNT_ICONS = ['plane', 'gift', 'heart', 'star', 'sun', 'music', 'graduation', 'home', 'car', 'rocket', 'sparkles', 'baby'].filter((k) => k in ICONS)

/** Cuentas atrás para lo que esperas: vacaciones, una boda, un examen… */
export function CountdownsCard() {
  const t = today()
  // Se ven hasta el mismo día; después desaparecen solas
  const list = useLiveQuery(() => db.countdowns.where('date').aboveOrEqual(t).sortBy('date'), [t])
  const [editing, setEditing] = useState<Countdown | 'new' | null>(null)
  if (!list) return null
  // Sin ninguna, Hoy no enseña una tarjeta vacía: solo un botón discreto para crearla
  if (!list.length)
    return (
      <>
        <button type="button" onClick={() => setEditing('new')} className="flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-semibold text-muted transition-colors hover:text-fg">
          <Plus size={13} strokeWidth={2.6} /> Cuenta atrás
        </button>
        <CountdownForm value={editing} onClose={() => setEditing(null)} />
      </>
    )
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <Hourglass size={16} className="text-fg" strokeWidth={2.4} />
        <h2 className="text-[15px] font-bold">Cuenta atrás</h2>
        <button type="button" aria-label="Nueva cuenta atrás" onClick={() => setEditing('new')} className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-fill text-fg active:scale-90">
          <Plus size={15} strokeWidth={2.6} />
        </button>
      </div>
      <div className="space-y-1.5">
        {list.slice(0, 4).map((c, i) => {
          const d = daysUntil(c.date, t)
          // Como las tarjetas de Flighty: lejos, tranquila; esta semana, en el acento; hoy, en lima
          const soon = d > 0 && d <= 7
          const passed = elapsed(c, t)
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
              {/* Lo que ya ha pasado desde que empezaste a esperarlo */}
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center" title={d === 0 ? undefined : `Llevas el ${Math.round(passed * 100)} % de la espera`}>
                {d > 0 && (
                  <span className="absolute inset-0">
                    <ProgressRing value={passed} size={36} stroke={3} color={soon ? 'var(--c-blue)' : 'var(--c-muted)'} track="var(--c-fill)" delay={0.1 + i * 0.04} />
                  </span>
                )}
                <Icon name={c.icon} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold">{c.name}</span>
                <span className={cx('block text-[12px]', d === 0 ? 'opacity-80' : 'text-muted')}>
                  {d === 1 ? 'Mañana' : soon ? `El ${fmt(c.date, 'EEEE')}` : fmt(c.date, "EEEE d 'de' MMMM")}
                </span>
              </span>
              <span className="text-right">
                <span className={cx('font-num block leading-none font-bold', d === 0 ? 'text-[19px]' : soon ? 'text-[26px] text-blue' : 'text-[22px]')}>{d === 0 ? '¡Hoy!' : d}</span>
                {d > 0 && <span className="block text-[11px] text-muted">{d === 1 ? 'día' : 'días'}</span>}
              </span>
            </motion.button>
          )
        })}
      </div>
      <CountdownForm value={editing} onClose={() => setEditing(null)} />
    </Card>
  )
}

/** Parte de la espera que ya ha pasado (de 0, al crearla, a 1, el día) */
function elapsed(c: Countdown, t: string) {
  const start = new Date(c.createdAt).setHours(0, 0, 0, 0)
  const end = new Date(`${c.date}T00:00:00`).getTime()
  const now = new Date(`${t}T00:00:00`).getTime()
  return end <= start ? 1 : Math.max(0, Math.min(1, (now - start) / (end - start)))
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
        <Field label="Icono" group>
          <div className="grid grid-cols-6 gap-1">
            {COUNT_ICONS.map((k) => (
              <button key={k} type="button" aria-label={k} onClick={() => setIcon(k)} className={cx('flex h-10 items-center justify-center rounded-full transition-all active:scale-90', icon === k ? 'bg-accent-fill text-white' : 'text-muted hover:bg-hover hover:text-fg')}>
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
