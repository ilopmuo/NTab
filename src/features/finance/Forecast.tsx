import { useState } from 'react'
import { m as motion } from 'motion/react'
import type { Subscription } from '@/db/types'
import { fmt, today } from '@/lib/dates'
import { forecast, money } from '@/lib/finance'
import { Card, Section, cx, softSpring } from '@/components/ui'

/**
 * Previsión de los próximos 12 meses (como la de Chronicle): cuánto se va en
 * pagos cada mes, para ver venir los meses con el seguro o el IBI. Un toque en
 * un mes muestra qué se cobra.
 */
export function Forecast({ subs, onOpen }: { subs: Subscription[]; onOpen: (s: Subscription) => void }) {
  const t = today()
  const months = forecast(subs, t)
  const [selected, setSelected] = useState(months[0].month)
  const max = Math.max(...months.map((m) => m.total), 1)
  const avg = months.reduce((s, m) => s + m.total, 0) / months.length
  const pick = months.find((m) => m.month === selected) ?? months[0]
  if (!months.some((m) => m.total > 0)) return null
  return (
    <Section title="Próximos 12 meses" action={<span className="text-[13px] text-muted">Media: <span className="font-num font-semibold text-fg">{money(Math.round(avg))}</span>/mes</span>}>
      <Card className="p-4">
        <div className="flex h-28 items-end gap-1">
          {months.map((m, i) => {
            const on = m.month === selected
            const heavy = m.total > avg * 1.3
            return (
              <button
                key={m.month}
                type="button"
                onClick={() => setSelected(m.month)}
                aria-pressed={on}
                aria-label={`${fmt(`${m.month}-01`, 'MMMM yyyy')}: ${money(m.total)}`}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              >
                <motion.span
                  className={cx('w-full max-w-7 rounded-[5px] transition-colors', on ? 'bg-blue' : heavy ? 'bg-fg/35' : 'bg-fill-2 group-hover:bg-hover')}
                  style={{ minHeight: m.total > 0 ? 3 : 2 }}
                  initial={{ height: 0 }}
                  animate={{ height: `calc((100% - 20px) * ${m.total / max})` }}
                  transition={{ ...softSpring, delay: i * 0.02 }}
                />
                <span className={cx('h-4 text-[10.5px] capitalize', on ? 'font-bold text-fg' : 'text-muted')}>{fmt(`${m.month}-01`, 'MMM').replace('.', '').slice(0, 3)}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 flex items-baseline justify-between text-[14px]">
            <span className="font-semibold capitalize">{fmt(`${pick.month}-01`, 'MMMM yyyy')}</span>
            <span className="font-num font-bold">{money(pick.total)}</span>
          </p>
          {pick.charges.length ? (
            <ul className="space-y-1">
              {pick.charges.map((c, i) => (
                <li key={`${c.sub.id}-${c.date}-${i}`}>
                  <button type="button" onClick={() => onOpen(c.sub)} className="flex w-full items-center gap-3 rounded-lg py-1 text-left text-[13.5px] hover:bg-hover">
                    <span className="font-num w-12 shrink-0 text-muted">{c.date < t ? 'Vencido' : fmt(c.date, 'd MMM').replace('.', '')}</span>
                    <span className="min-w-0 flex-1 truncate">{c.sub.name}</span>
                    <span className="font-num font-semibold">{money(c.amount, c.sub.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13.5px] text-muted">Nada que pagar ese mes.</p>
          )}
        </div>
      </Card>
    </Section>
  )
}
