import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { Bell, Check, Plus, Wallet } from 'lucide-react'
import { db } from '@/db/db'
import { markPaid, rollSubscriptions } from '@/db/actions'
import type { Subscription } from '@/db/types'
import { addDaysYmd, today } from '@/lib/dates'
import { CYCLES, chargeWhen, money, monthly, yearly } from '@/lib/finance'
import { setUI, toast, useUI } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Button, CountUp, Empty, Group, PageHeader, ProgressBar, Section, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'
import { SubscriptionForm } from './SubscriptionForm'

/** Totales por moneda; la principal es la de mayor gasto */
export function totalsByCurrency(subs: Subscription[]) {
  const map = new Map<string, { month: number; year: number }>()
  for (const s of subs) {
    const t = map.get(s.currency) ?? { month: 0, year: 0 }
    t.month += monthly(s)
    t.year += yearly(s)
    map.set(s.currency, t)
  }
  return [...map.entries()].map(([currency, t]) => ({ currency, ...t })).sort((a, b) => b.year - a.year)
}

export function FinanceView() {
  const subs = useLiveQuery(() => db.subscriptions.orderBy('nextDate').toArray(), [])
  const creating = useUI((s) => s.creating === 'subscription')
  const [editing, setEditing] = useState<Subscription | undefined>()
  const t = today()
  useEffect(() => void rollSubscriptions(), [])

  const { active, paused, upcoming, totals, categories } = useMemo(() => {
    const list = subs ?? []
    const active = list.filter((s) => s.active)
    const totals = totalsByCurrency(active)
    const main = totals[0]?.currency ?? 'EUR'
    const cat = new Map<string, number>()
    for (const s of active.filter((s) => s.currency === main)) cat.set(s.category || 'Sin categoría', (cat.get(s.category || 'Sin categoría') ?? 0) + monthly(s))
    return {
      active,
      paused: list.filter((s) => !s.active),
      upcoming: active.filter((s) => s.nextDate <= addDaysYmd(t, 30)),
      totals,
      categories: [...cat.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [subs, t])

  if (!subs) return null
  const main = totals[0]
  const others = totals.slice(1)
  const edit = (s: Subscription) => setEditing(s)

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('finance')} size={40} />}
        title="Pagos"
        subtitle="Suscripciones y recibos que se repiten."
        actions={
          <Button variant="primary" onClick={() => setUI({ creating: 'subscription' })}>
            <Plus size={15} /> Nuevo
          </Button>
        }
      />

      {subs.length === 0 ? (
        <Group>
          <Empty
            icon={<Wallet size={28} strokeWidth={2.2} />}
            color="var(--c-blue)"
            title="Controla lo que pagas cada mes"
            hint="Apunta tus suscripciones y recibos: verás cuánto suman y te avisaré antes de cada cargo."
          >
            <Button variant="primary" onClick={() => setUI({ creating: 'subscription' })}>
              Añadir el primero
            </Button>
          </Empty>
        </Group>
      ) : (
        <div className="grid gap-x-8 gap-y-2 @[1000px]:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 @[1000px]:order-2">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className="glass mb-8 rounded-[22px] p-5">
              <p className="text-[13px] font-semibold text-muted">Al mes</p>
              <p className="font-num mt-0.5 text-[40px] leading-none font-bold tracking-tight">
                {main ? money(main.month, main.currency, 2) : money(0)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                <div>
                  <p className="text-[12px] font-semibold text-muted">Al año</p>
                  <p className="font-num text-[19px] font-bold">{main ? money(main.year, main.currency, 0) : '—'}</p>
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-muted">Activos</p>
                  <p className="font-num text-[19px] font-bold">
                    <CountUp value={active.length} />
                  </p>
                </div>
              </div>
              {others.length > 0 && (
                <p className="mt-3 text-[12px] text-muted">
                  Además {others.map((o) => `${money(o.month, o.currency, 2)}/mes`).join(' · ')}
                </p>
              )}
              {categories.length > 1 && (
                <div className="mt-4 space-y-2.5 border-t border-line pt-4">
                  {categories.map(([name, value]) => (
                    <div key={name}>
                      <div className="mb-1 flex items-baseline justify-between text-[13px]">
                        <span className="truncate font-medium">{name}</span>
                        <span className="font-num text-muted">{money(value, main.currency, 2)}</span>
                      </div>
                      <ProgressBar value={main.month ? value / main.month : 0} />
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          <div className="min-w-0 @[1000px]:order-1">
            <Section title="Próximos 30 días" count={upcoming.length}>
              {upcoming.length ? (
                <Group>
                  {upcoming.map((s) => (
                    <SubRow key={s.id} sub={s} onClick={() => edit(s)} upcoming today={t} />
                  ))}
                </Group>
              ) : (
                <p className="px-1 text-[14px] text-muted">Ningún cargo en los próximos 30 días.</p>
              )}
            </Section>
            <Section title="Todos" count={active.length}>
              <Group>
                {[...active]
                  .sort((a, b) => monthly(b) - monthly(a))
                  .map((s) => (
                    <SubRow key={s.id} sub={s} onClick={() => edit(s)} today={t} />
                  ))}
              </Group>
            </Section>
            {paused.length > 0 && (
              <Section title="En pausa" count={paused.length}>
                <Group className="opacity-70">
                  {paused.map((s) => (
                    <SubRow key={s.id} sub={s} onClick={() => edit(s)} today={t} />
                  ))}
                </Group>
              </Section>
            )}
          </div>
        </div>
      )}
      <SubscriptionForm open={creating} onClose={() => setUI({ creating: null })} />
      <SubscriptionForm open={!!editing} sub={editing} onClose={() => setEditing(undefined)} />
    </Page>
  )
}

function Monogram({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-fill text-[15px] font-bold text-fg">
      {name.trim().charAt(0).toUpperCase() || '·'}
    </span>
  )
}

export function SubRow({ sub, onClick, upcoming, today: t }: { sub: Subscription; onClick: () => void; upcoming?: boolean; today: string }) {
  const due = sub.kind === 'bill' && sub.nextDate <= t
  const cycle = CYCLES.find((c) => c.value === sub.cycle)
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Monogram name={sub.name} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate text-[15px] font-medium">
            {sub.name}
            {sub.notifyDays != null && sub.active && <Bell size={12} className="shrink-0 text-faint" />}
          </span>
          <span className="block truncate text-[13px] text-muted">
            {upcoming
              ? [sub.kind === 'bill' ? 'Recibo' : cycle?.label, sub.category].filter(Boolean).join(' · ')
              : `${chargeWhen(sub.nextDate, t)} · ${[cycle?.label, sub.category].filter(Boolean).join(' · ')}`}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="font-num block text-[15px] font-semibold">{money(sub.amount, sub.currency)}</span>
          <span className={cx('block text-[12px] font-semibold', upcoming && (due || sub.nextDate === t) ? 'text-accent' : 'text-muted')}>
            {upcoming ? (due && sub.nextDate < t ? 'Vencido' : chargeWhen(sub.nextDate, t)) : `/${cycle?.per}`}
          </span>
        </span>
      </button>
      {upcoming && sub.kind === 'bill' && sub.nextDate <= addDaysYmd(t, 3) && (
        <Button
          size="sm"
          variant={due ? 'primary' : 'secondary'}
          onClick={async () => {
            await markPaid(sub)
            toast(`${sub.name}: pagado`)
          }}
        >
          <Check size={14} strokeWidth={2.8} /> Pagado
        </Button>
      )}
    </div>
  )
}
