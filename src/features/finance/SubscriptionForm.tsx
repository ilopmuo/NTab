import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { BillingCycle, Subscription } from '@/db/types'
import { db } from '@/db/db'
import { createSubscription, deleteSubscription } from '@/db/moreActions'
import { toastTrashed } from '../trash/undo'
import { CYCLES, NOTIFY_OPTIONS, inTrial, money, rollForward, withNewPrice } from '@/lib/finance'
import { addDaysYmd, fmt, today } from '@/lib/dates'
import { Button } from '@/components/ui'
import { Field, Input, Segmented, Select, Switch, Textarea } from '@/components/form'
import { Modal, ModalHeader } from '@/components/Modal'

export function SubscriptionForm({ sub, open, onClose }: { sub?: Subscription; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Form sub={sub} onClose={onClose} />}
    </Modal>
  )
}

const CURRENCIES = ['EUR', 'USD', 'GBP']

function Form({ sub, onClose }: { sub?: Subscription; onClose: () => void }) {
  const categories = useLiveQuery(async () => {
    const all = await db.subscriptions.toArray()
    return [...new Set(all.map((s) => s.category).filter(Boolean))].sort()
  }, []) ?? []
  const [name, setName] = useState(sub?.name ?? '')
  const [amount, setAmount] = useState(sub ? String(sub.amount).replace('.', ',') : '')
  const [currency, setCurrency] = useState(sub?.currency ?? 'EUR')
  const [cycle, setCycle] = useState<BillingCycle>(sub?.cycle ?? 'month')
  const [kind, setKind] = useState<Subscription['kind']>(sub?.kind ?? 'sub')
  const [nextDate, setNextDate] = useState(sub?.nextDate ?? addDaysYmd(today(), 1))
  const [category, setCategory] = useState(sub?.category ?? '')
  const [notify, setNotify] = useState(sub ? (sub.notifyDays == null ? 'none' : String(sub.notifyDays)) : '1')
  const [active, setActive] = useState(sub?.active ?? true)
  const [notes, setNotes] = useState(sub?.notes ?? '')
  const [trial, setTrial] = useState(sub ? inTrial(sub) : false)
  const [cancelUrl, setCancelUrl] = useState(sub?.cancelUrl ?? '')
  const value = Number(amount.replace(/\s/g, '').replace(',', '.'))
  const valid = name.trim() && Number.isFinite(value) && value > 0 && !!nextDate

  const save = async () => {
    if (!valid) return
    const anchorDay = Number(nextDate.slice(8, 10))
    const amount = Math.round(value * 100) / 100
    const isTrial = trial && kind === 'sub'
    const data = {
      name: name.trim(),
      // Si cambia el precio, el anterior queda en el historial (para ver las subidas)
      ...(sub ? withNewPrice(sub, amount) : { amount }),
      currency,
      cycle,
      kind,
      // Una suscripción con fecha pasada ya se cobró: se apunta el siguiente cargo
      nextDate: kind === 'sub' ? rollForward({ nextDate, cycle, anchorDay }) : nextDate,
      anchorDay,
      category: category.trim(),
      notifyDays: NOTIFY_OPTIONS.find((o) => o.value === notify)?.days ?? null,
      active,
      notes,
      // La prueba gratis acaba el día del primer cargo
      trialEnds: isTrial ? nextDate : sub?.trialEnds && !inTrial(sub) ? sub.trialEnds : undefined,
      cancelUrl: cancelUrl.trim() || undefined,
    }
    if (sub) await db.subscriptions.update(sub.id, data)
    else await createSubscription(data)
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={sub ? 'Editar pago' : 'Nuevo pago'} onClose={onClose} />
      <div className="max-h-[68vh] space-y-4 overflow-y-auto p-5">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Netflix, alquiler, gimnasio…" className="h-11 text-[15px]" />
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Importe">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="12,99" className="font-num text-[17px] font-semibold" />
          </Field>
          <Field label="Moneda">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-auto">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Cada cuánto" group>
          <Segmented className="w-full" value={cycle} onChange={setCycle} options={CYCLES.map((c) => ({ value: c.value, label: c.label }))} />
        </Field>
        <Field label="Cómo se paga" group>
          <Segmented
            className="w-full"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'sub', label: 'Se cobra sola' },
              { value: 'bill', label: 'La pago yo' },
            ]}
          />
        </Field>
        {kind === 'sub' && (
          <div className="flex items-center gap-3 rounded-xl bg-fill-2 px-3.5 py-2.5">
            <span className="flex-1">
              <span className="block text-[15px]">Es una prueba gratis</span>
              <span className="block text-[12.5px] text-muted">Te aviso antes de que empiece a cobrar, para que decidas</span>
            </span>
            <Switch
              checked={trial}
              onChange={(v) => {
                setTrial(v)
                if (v && notify === '1') setNotify('2')
              }}
              label="Es una prueba gratis"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={trial && kind === 'sub' ? 'Acaba la prueba' : 'Próximo cargo'}>
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </Field>
          <Field label="Aviso">
            <Select value={notify} onChange={(e) => setNotify(e.target.value)}>
              {NOTIFY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Categoría">
          <Input list="ntab-sub-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Streaming, casa, software…" />
          <datalist id="ntab-sub-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Para darse de baja">
          <Input type="url" inputMode="url" value={cancelUrl} onChange={(e) => setCancelUrl(e.target.value)} placeholder="https://… (la página de tu cuenta)" />
        </Field>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (cuenta, cómo darse de baja…)" rows={2} className="rounded-xl bg-fill-2 px-3.5 py-2.5" />
        {sub && <History sub={sub} />}
        {sub && (
          <div className="flex items-center gap-3 rounded-xl bg-fill-2 px-3.5 py-2.5">
            <span className="flex-1 text-[15px]">Activo</span>
            <Switch checked={active} onChange={setActive} label="Activo" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        {sub && (
          <Button type="button" variant="danger" onClick={async () => (await deleteSubscription(sub.id), onClose(), toastTrashed('Pago en la papelera', 'subscriptions', sub.id))}>
            Eliminar
          </Button>
        )}
        <div className="flex-1" />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!valid}>
          {sub ? 'Guardar' : 'Añadir'}
        </Button>
      </div>
    </form>
  )
}

/** Lo que costaba antes y los recibos pagados (como el historial de Chronicle) */
function History({ sub }: { sub: Subscription }) {
  const prices = [...(sub.priceHistory ?? [])].reverse().slice(0, 3)
  const paid = (sub.paidLog ?? []).slice(0, 6)
  if (!prices.length && !paid.length) return null
  return (
    <div className="space-y-1.5 rounded-xl bg-fill-2 px-3.5 py-3 text-[13.5px]">
      <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">Historial</p>
      {prices.map((p) => (
        <p key={`p-${p.date}`} className="flex justify-between gap-3">
          <span className="text-muted">Costaba hasta el {fmt(p.date, "d 'de' MMM yyyy")}</span>
          <span className="font-num font-semibold">{money(p.amount, sub.currency)}</span>
        </p>
      ))}
      {paid.map((p, i) => (
        <p key={`${p.date}-${i}`} className="flex justify-between gap-3">
          <span className="text-muted">Pagado el {fmt(p.date, "d 'de' MMM yyyy")}</span>
          <span className="font-num font-semibold">{money(p.amount, sub.currency)}</span>
        </p>
      ))}
    </div>
  )
}
