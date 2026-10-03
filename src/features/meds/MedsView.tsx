import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pill, Plus, ShoppingCart } from 'lucide-react'
import type { Med } from '@/db/types'
import { db } from '@/db/db'
import { addDaysYmd, fmt, today } from '@/lib/dates'
import { adherence, asNeeded, daysLeft, dosesOn, extraTaken, lastTaken, needsRefill, perDoseOf, scheduleLabel, treatmentDay } from '@/lib/meds'
import { toast } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Button, Empty, Group, PageHeader, Section, cx } from '@/components/ui'
import { Page } from '../Page'
import { MedForm } from './MedForm'
import { DoseRow, PillDot, take, useNow } from './parts'
import { medToShopping, refillMed } from './actions'

const clock = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })
const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60_000)
  return min < 60 ? `hace ${Math.max(1, min)} min` : `hace ${Math.round(min / 60)} h`
}

/**
 * Medicación (como Medicamentos de Apple Salud o Medisafe): lo de hoy con su
 * hora y «Tomada», lo que se toma cuando hace falta, lo que hay que reponer y
 * tus medicamentos con el cumplimiento de las últimas dos semanas.
 */
export function MedsView() {
  const meds = useLiveQuery(() => db.meds.where('archived').equals(0).sortBy('order'), [])
  const t = today()
  const since = addDaysYmd(t, -13)
  const logs = useLiveQuery(() => db.medLogs.where('date').aboveOrEqual(since).toArray(), [since])
  const now = useNow()
  const [editing, setEditing] = useState<Med | 'new' | undefined>()
  if (!meds || !logs) return null

  const doses = dosesOn(meds, logs, t, t, now)
  const pending = doses.filter((d) => d.state === 'due' || d.state === 'late').length
  const extra = meds.filter(asNeeded)
  const refill = meds.filter((m) => needsRefill(m, t))

  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('meds')} size={40} />}
        title="Medicación"
        subtitle={
          !meds.length
            ? 'Tus pastillas con sus horas: te avisa hasta que las marques y siempre sabrás si ya te las has tomado.'
            : doses.length
              ? `Hoy: ${doses.filter((d) => d.state === 'taken').length} de ${doses.length} tomadas${pending ? ` · ${pending} ${pending === 1 ? 'toca' : 'tocan'} ya` : ''}.`
              : 'Hoy no toca nada a su hora.'
        }
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={16} strokeWidth={2.6} /> Nuevo
          </Button>
        }
      />

      {!meds.length && (
        <Group>
          <Empty icon={<Pill size={26} strokeWidth={2.2} />} title="¿Tomas alguna medicación?" hint="Apúntala con sus horas. A la hora te avisa, y si no la marcas, insiste dos veces más.">
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={16} strokeWidth={2.6} /> Añadir medicamento
            </Button>
          </Empty>
        </Group>
      )}

      {doses.length > 0 && (
        <Section title="Hoy" count={pending || undefined}>
          <Group>
            {doses.map((d) => (
              <DoseRow key={`${d.med.id}:${d.time}`} dose={d} />
            ))}
          </Group>
        </Section>
      )}

      {extra.length > 0 && (
        <Section title="Cuando haga falta">
          <Group>
            {extra.map((m) => {
              const todays = extraTaken(m, logs, t)
              const last = todays[0] ?? lastTaken(m, logs)
              const full = !!m.maxPerDay && todays.length >= m.maxPerDay
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                  <PillDot color={m.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {m.name}
                      {m.dose && <span className="font-normal text-muted"> · {m.dose}</span>}
                    </span>
                    <span className={cx('block text-[12.5px]', full ? 'font-bold text-fg' : 'text-muted')}>
                      {todays.length
                        ? `Hoy ${todays.length}${m.maxPerDay ? ` de ${m.maxPerDay}` : ''} · la última a las ${clock(todays[0].at)} (${ago(todays[0].at)})`
                        : last
                          ? `La última, el ${fmt(last.date, "d 'de' MMMM")}`
                          : (m.note ?? 'Aún no la has tomado')}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`${m.name}: tomar ahora`}
                    onClick={() => {
                      if (full) return toast(`Ya llevas ${todays.length} hoy (máximo ${m.maxPerDay})`, { label: 'Tomar igual', run: () => void take(m) })
                      void take(m)
                    }}
                    className="flex h-9 shrink-0 items-center rounded-full bg-fill px-3.5 text-[13px] font-semibold hover:bg-press active:scale-95"
                  >
                    Tomar ahora
                  </button>
                </div>
              )
            })}
          </Group>
        </Section>
      )}

      {refill.length > 0 && (
        <Section title="Reponer" count={refill.length}>
          <Group>
            {refill.map((m) => {
              const left = daysLeft(m)
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                  <PillDot color={m.color} />
                  {/* En el móvil, los botones bajan a otra línea */}
                  <span className="min-w-[10rem] flex-1">
                    <span className="block truncate text-[15px] font-medium">{m.name}</span>
                    <span className="block text-[12.5px] font-semibold text-fg">
                      {m.stock === 0 ? 'No te queda' : `Quedan ${m.stock}`}
                      {left !== undefined && m.stock ? ` · para ${left === 0 ? 'hoy' : `${left} ${left === 1 ? 'día' : 'días'}`}` : ''}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    onClick={async () => {
                      const r = await medToShopping(m)
                      toast(r.added ? `${m.name}, a la compra${r.list ? ` (${r.list})` : ''}` : `${m.name} ya estaba en la compra`)
                    }}
                  >
                    <ShoppingCart size={13} /> A la compra
                  </Button>
                  <NewBox med={m} />
                </div>
              )
            })}
          </Group>
        </Section>
      )}

      {meds.length > 0 && (
        <Section title="Tus medicamentos">
          <Group>
            {meds.map((m) => {
              const treat = treatmentDay(m, t)
              const left = daysLeft(m)
              const adh = asNeeded(m) ? undefined : adherence([m], logs, t, now, 14)
              return (
                <button key={m.id} type="button" onClick={() => setEditing(m)} className="flex w-full items-center gap-3 px-4 py-3 text-left shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none hover:bg-hover">
                  <PillDot color={m.color} size={14} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {m.name}
                      {m.dose && <span className="font-normal text-muted"> · {m.dose}</span>}
                    </span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {scheduleLabel(m)}
                      {treat && (treat.day > treat.total ? ' · tratamiento acabado' : treat.day >= 1 ? ` · día ${treat.day} de ${treat.total}` : '')}
                      {m.stock !== undefined && ` · quedan ${m.stock}${left !== undefined ? ` (${left} ${left === 1 ? 'día' : 'días'})` : ''}`}
                      {perDoseOf(m) !== 1 && ` · ${perDoseOf(m)} por toma`}
                    </span>
                  </span>
                  {adh?.rate !== undefined && <Adherence med={m} logs={logs} now={now} rate={adh.rate} />}
                </button>
              )
            })}
          </Group>
        </Section>
      )}

      <MedForm med={editing === 'new' ? undefined : editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </Page>
  )
}

/** «Caja nueva»: cuántas trae, y se suman a lo que queda */
function NewBox({ med }: { med: Med }) {
  const [open, setOpen] = useState(false)
  const [units, setUnits] = useState('')
  if (!open)
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={13} /> Caja nueva
      </Button>
    )
  const save = () => {
    const n = Math.round(Number(units))
    setOpen(false)
    setUnits('')
    if (n > 0) void refillMed(med, n).then(() => toast(`${med.name}: quedan ${(med.stock ?? 0) + n}`))
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="flex items-center gap-1.5"
    >
      <input
        autoFocus
        inputMode="numeric"
        value={units}
        onChange={(e) => setUnits(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        aria-label={`Cuántas trae la caja nueva de ${med.name}`}
        placeholder="20"
        className="font-num h-8 w-16 rounded-full bg-fill px-3 text-right text-[13px] font-semibold"
      />
      <Button size="sm" variant="primary" type="submit" disabled={!(Number(units) > 0)}>
        Sumar
      </Button>
    </form>
  )
}

/** Las dos últimas semanas en puntos (tomadas en verde, olvidadas vacías) y el porcentaje */
function Adherence({ med, logs, now, rate }: { med: Med; logs: Parameters<typeof dosesOn>[1]; now: string; rate: number }) {
  const t = today()
  const days = Array.from({ length: 14 }, (_, i) => addDaysYmd(t, i - 13))
  return (
    <span className="flex shrink-0 items-center gap-2" role="img" aria-label={`${med.name}: ${Math.round(rate * 100)} % tomadas en las dos últimas semanas`}>
      <span className="hidden gap-[3px] sm:flex">
        {days.map((d) => {
          const doses = dosesOn([med], logs, d, t, now).filter((x) => x.state !== 'upcoming' && x.state !== 'due')
          const ok = doses.length > 0 && doses.every((x) => x.state === 'taken')
          const some = doses.some((x) => x.state === 'taken')
          return <span key={d} className={cx('h-2 w-2 rounded-full', !doses.length ? 'bg-fill' : ok ? 'bg-green' : some ? 'bg-muted' : 'shadow-[inset_0_0_0_1.5px_var(--c-muted)]')} />
        })}
      </span>
      <span className="font-num w-10 text-right text-[13px] font-semibold text-muted">{Math.round(rate * 100)} %</span>
    </span>
  )
}
