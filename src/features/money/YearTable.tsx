import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import type { Expense, Income } from '@/db/types'
import { fmt } from '@/lib/dates'
import { CATEGORIES, money } from '@/lib/expenses'
import { incomeCat, toCsv, yearGrid, type YearRow } from '@/lib/money'
import { Button, Card, Section, cx } from '@/components/ui'
import { download } from './data'

const short = (n: number) => (n ? money(Math.round(n)) : '—')
/** Con el mes a medias (sin la nómina) sale −1800 %: más allá de −100 %, sin cifra */
const rate = (r: number) => (r < -1 ? '< −100 %' : `${Math.round(r * 100)} %`)

/**
 * El año como en la hoja de cálculo de siempre: ingresos, cada categoría, los
 * fijos, el total y lo ahorrado, mes a mes, con el total y la media. Se
 * descarga para Excel o Numbers.
 */
export function YearTable({ expenses, incomes, fixed, today }: { expenses: Expense[]; incomes: Income[]; fixed: number; today: string }) {
  const [year, setYear] = useState(today.slice(0, 4))
  const first = [...expenses, ...incomes].reduce((min, e) => (e.date < min ? e.date : min), today).slice(0, 4)
  const g = yearGrid(expenses, incomes, year, fixed, today)
  if (!expenses.length && !incomes.length) return null
  const rows: (YearRow & { strong?: boolean; sub?: boolean })[] = [{ ...g.income, strong: true }, ...g.categories.map((c) => ({ ...c, sub: true })), ...(fixed ? [{ ...g.fixed, sub: true }] : []), { ...g.spent, strong: true }, { ...g.saved, strong: true }]

  const exportYear = () => {
    const head = ['', ...g.months.map((m) => fmt(`${m}-01`, 'MMMM')), 'Total', 'Media']
    const body = rows.map((r) => [r.label, ...r.values, r.total, r.avg])
    const rate = ['Tasa de ahorro', ...g.months.map((_, i) => (g.income.values[i] > 0 ? `${Math.round((g.saved.values[i] / g.income.values[i]) * 100)} %` : '')), g.rate !== undefined ? `${Math.round(g.rate * 100)} %` : '', '']
    download(`LUNO ${year}.csv`, toCsv([head, ...body, rate]))
  }
  const exportAll = () => {
    const cat = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Otros'
    const list = [
      ...expenses.map((e) => [e.date, 'Gasto', e.note, cat(e.category), -e.amount, (e.tags ?? []).map((t) => `#${t}`).join(' ')]),
      ...incomes.map((e) => [e.date, 'Ingreso', e.note, incomeCat(e.category).label, e.amount, (e.tags ?? []).map((t) => `#${t}`).join(' ')]),
    ].sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    download('LUNO movimientos.csv', toCsv([['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Importe', 'Etiquetas'], ...list]))
  }

  return (
    <Section
      title="Tu año"
      action={
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Año anterior" disabled={year <= first} onClick={() => setYear(String(Number(year) - 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-fill active:scale-90 disabled:opacity-30">
            <ChevronLeft size={16} />
          </button>
          <span className="font-num w-12 text-center text-[15px] font-bold">{year}</span>
          <button type="button" aria-label="Año siguiente" disabled={year >= today.slice(0, 4)} onClick={() => setYear(String(Number(year) + 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-fill active:scale-90 disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
        </div>
      }
    >
      <Card className="overflow-hidden">
        <div className="overflow-x-auto overscroll-x-contain" tabIndex={0} role="region" aria-label={`Ingresos y gastos de ${year}, mes a mes`}>
          <table className="font-num w-full min-w-[980px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-muted">
                <th scope="col" className="sticky left-0 z-[1] bg-surface px-3 py-2.5 text-left font-semibold">
                  <span className="sr-only">Concepto</span>
                </th>
                {g.months.map((m, i) => (
                  <th key={m} scope="col" className={cx('px-2 py-2.5 text-right font-semibold capitalize', m === today.slice(0, 7) && 'text-fg', !g.active[i] && 'opacity-60')}>
                    {fmt(`${m}-01`, 'MMM').replace('.', '')}
                  </th>
                ))}
                <th scope="col" className="px-2 py-2.5 text-right font-semibold text-fg">Total</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Media</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cx('border-t border-line', r.strong && 'font-semibold')}>
                  <th scope="row" className={cx('sticky left-0 z-[1] max-w-40 truncate bg-surface px-3 py-2 text-left', r.sub ? 'pl-5 font-normal text-muted' : 'font-semibold')}>
                    {r.label}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={i} className={cx('px-2 py-2 text-right whitespace-nowrap', !v && 'text-faint', r.id === 'saved' && v < 0 && 'text-red')}>
                      {r.id === 'saved' && !g.active[i] ? '—' : short(v)}
                    </td>
                  ))}
                  <td className={cx('px-2 py-2 text-right font-semibold whitespace-nowrap', r.id === 'saved' && r.total < 0 && 'text-red')}>{short(r.total)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap text-muted">{short(r.avg)}</td>
                </tr>
              ))}
              <tr className="border-t border-line text-muted">
                <th scope="row" className="sticky left-0 z-[1] bg-surface px-3 py-2 text-left font-normal">
                  Tasa de ahorro
                </th>
                {g.months.map((m, i) => (
                  <td key={m} className="px-2 py-2 text-right">
                    {g.income.values[i] > 0 ? rate(g.saved.values[i] / g.income.values[i]) : '—'}
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-semibold text-fg">{g.rate !== undefined ? `${Math.round(g.rate * 100)} %` : '—'}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <Button size="sm" variant="secondary" onClick={exportYear}>
            <Download size={14} /> Exportar {year} (Excel)
          </Button>
          <Button size="sm" variant="ghost" onClick={exportAll}>
            Todos los movimientos (CSV)
          </Button>
        </div>
      </Card>
    </Section>
  )
}
