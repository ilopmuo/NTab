import { useLiveQuery } from 'dexie-react-hooks'
import { Wallet } from 'lucide-react'
import { db } from '@/db/db'
import { addDaysYmd, today } from '@/lib/dates'
import { chargeWhen, money } from '@/lib/finance'
import { href } from '@/app/router'
import { Card } from '@/components/ui'

/** Cargos de los próximos 7 días */
export function PaymentsCard() {
  const t = today()
  const soon = useLiveQuery(
    () =>
      db.subscriptions
        .where('nextDate')
        .belowOrEqual(addDaysYmd(t, 7))
        .filter((s) => s.active)
        .sortBy('nextDate'),
    [t],
  )
  if (!soon?.length) return null
  const total = soon.filter((s) => s.currency === soon[0].currency).reduce((a, s) => a + s.amount, 0)
  return (
    <Card className="p-4">
      <a href={href('/finance')} className="mb-2 flex items-center gap-2">
        <Wallet size={16} className="text-fg" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold">Pagos esta semana</h3>
        <span className="font-num ml-auto text-[13px] font-semibold text-muted">{money(total, soon[0].currency)}</span>
      </a>
      <div className="space-y-0.5">
        {soon.slice(0, 5).map((s) => (
          <a key={s.id} href={href('/finance')} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-hover">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-fill text-[13px] font-bold">
              {s.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px]">{s.name}</span>
            <span className="font-num text-[13px] font-semibold">{money(s.amount, s.currency)}</span>
            <span className={s.nextDate <= t ? 'shrink-0 text-right text-[12px] font-semibold whitespace-nowrap text-accent' : 'shrink-0 text-right text-[12px] font-medium whitespace-nowrap text-muted'}>
              {s.kind === 'bill' && s.nextDate < t ? 'Vencido' : chargeWhen(s.nextDate, t)}
            </span>
          </a>
        ))}
      </div>
    </Card>
  )
}
