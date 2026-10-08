import { useMemo, useState } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { AlertCircle, ArrowUp, Banknote, CalendarClock, ChevronRight, Copy, Upload } from 'lucide-react'
import { db } from '@/db/db'
import type { Income } from '@/db/types'
import { addIncome } from '@/db/moreActions'
import { addDaysYmd, fmt, today } from '@/lib/dates'
import { money, monthSummary } from '@/lib/expenses'
import { forecast } from '@/lib/finance'
import { duplicateExpenses, incomeCat, monthFlow, parseIncome, pendingIncomes, rule503020, usualIncomes } from '@/lib/money'
import { haptic } from '@/lib/haptics'
import { setUI, toast, useUI } from '@/app/store'
import { useFeatures } from '@/app/features'
import { SectionIcon, section } from '@/app/sections'
import { Card, Empty, Group, IconButton, PageHeader, Section, bouncy, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'
import { CATEGORIES } from '@/lib/expenses'
import { useMoneyData } from './data'
import { FlowBar, IncomeForm, IncomeRow, MonthNav, Rule503020, signed } from './MoneyParts'
import { YearTable } from './YearTable'
import { TipList, adviceFor, useDismissed } from './Tips'
import { totalSaving } from '@/lib/advice'
import { BankImport } from './BankImport'

/**
 * Resumen del dinero (el panel de Monarch o la hoja «Resumen» de las
 * plantillas de Excel): lo que entra, lo que sale y lo que queda cada mes,
 * los ingresos, la regla 50/30/20, lo que conviene mirar y el año entero.
 */
export function MoneyView() {
  const t = today()
  const [month, setMonth] = useState(t.slice(0, 7))
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<Income | undefined>()
  const importing = useUI((s) => s.creating === 'bankImport')
  const focusIncome = useUI((s) => s.creating === 'income')
  const features = useFeatures()
  const data = useMoneyData()
  const parsed = useMemo(() => parseIncome(text), [text])
  if (!data) return null
  const { expenses, incomes, fixed } = data
  const current = month === t.slice(0, 7)
  const fixedTotal = features.on('finance') ? fixed.total : 0
  const flow = monthFlow(expenses, incomes, month, fixedTotal)
  const list = incomes.filter((e) => e.date.startsWith(month))
  const usual = current ? usualIncomes(incomes, t) : []
  const pending = current ? pendingIncomes(incomes, month) : []
  const byCategory = monthSummary(expenses, month, t).byCategory
  const rule = rule503020(byCategory, flow.income, features.on('finance') ? fixed.needs : 0, features.on('finance') ? fixed.wants : 0)
  const empty = !expenses.length && !incomes.length
  // Con la nómina aún por llegar, lo que quedará cuando llegue
  const expected = pending.length ? flow.saved + pending.reduce((sum, p) => sum + p.amount, 0) : 0

  const save = async (p: { amount: number; note: string; category: string; tags?: string[] }, date: string) => {
    const e = await addIncome({ amount: p.amount, note: p.note, category: p.category, date, ...(p.tags?.length ? { tags: p.tags } : {}) })
    haptic()
    setMonth(date.slice(0, 7))
    toast(`+${money(p.amount)} · ${p.note}`, { label: 'Deshacer', run: () => void db.incomes.delete(e.id) })
  }
  const add = async () => {
    if (!parsed) return
    setText('')
    await save(parsed, addDaysYmd(t, -parsed.daysAgo))
  }

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('money')} size={40} />}
        title="Dinero"
        subtitle="Lo que entra, lo que sale y lo que te queda."
        actions={
          <IconButton filled label="Traer movimientos del banco" onClick={() => setUI({ creating: 'bankImport' })}>
            <Upload size={17} />
          </IconButton>
        }
      />

      <div className="grid gap-x-8 @[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <MonthNav month={month} onChange={setMonth} max={t.slice(0, 7)} />
          <Card className="mb-6 p-5">
            <p className="text-[13px] font-semibold text-muted">{current ? 'Te queda este mes' : 'Te quedó'}</p>
            <motion.p key={`${month}-${flow.saved}`} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className={cx('font-num mt-1 text-[40px] leading-none font-bold tracking-tight', flow.saved < 0 && 'text-red')}>
              {flow.income || flow.out ? signed(Math.round(flow.saved)) : money(0)}
            </motion.p>
            <p className="mt-2 text-[13px] text-muted">
              {expected
                ? `Con lo que falta por llegar, te ${expected > 0 ? `quedarán unos ${money(Math.round(expected))}` : `faltarán unos ${money(Math.round(-expected))}`}`
                : flow.rate !== undefined
                  ? flow.rate >= 0
                    ? `Ahorras el ${Math.round(flow.rate * 100)} % de lo que entra`
                    : 'Sale más de lo que entra'
                  : 'Apunta lo que cobras para ver lo que te queda'}
            </p>
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <FlowBar label="Entra" value={flow.income} max={Math.max(flow.income, flow.out)} strong />
              <FlowBar label="Sale" value={flow.out} max={Math.max(flow.income, flow.out)} detail={flow.fixed ? `${money(Math.round(flow.spent))} en gastos y ${money(Math.round(flow.fixed))} fijos` : undefined} />
            </div>
            {pending.length > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-[13px]">
                <CalendarClock size={14} className="mt-0.5 shrink-0 text-blue" />
                <span>
                  Aún no ha llegado:{' '}
                  {pending.map((p, i) => (
                    <span key={p.note}>
                      {i > 0 && ', '}
                      <span className="font-semibold">{p.note}</span> <span className="font-num text-muted">({money(p.amount)}, suele ser el {p.day})</span>
                    </span>
                  ))}
                </span>
              </p>
            )}
          </Card>

          <Section title="Ingresos" action={list.length > 0 && <span className="font-num text-[14px] font-semibold text-muted">{money(flow.income)}</span>}>
            {current && (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void add()
                  }}
                  className="glass mb-2 flex items-center gap-2 rounded-[18px] py-2 pr-2 pl-4"
                >
                  <Banknote size={18} className="shrink-0 text-muted" />
                  <input
                    autoFocus={focusIncome}
                    onFocus={() => focusIncome && setUI({ creating: null })}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="1.850 nómina"
                    aria-label="Apuntar ingreso"
                    className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
                  />
                  <button type="submit" aria-label="Apuntar el ingreso" disabled={!parsed} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white disabled:opacity-30">
                    <ArrowUp size={18} strokeWidth={2.8} />
                  </button>
                </form>
                <div className="mb-3 min-h-8 px-1">
                  <AnimatePresence mode="wait" initial={false}>
                    {parsed ? (
                      <motion.div key="parsed" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                        <motion.span key={parsed.amount} initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={bouncy} className="font-num rounded-full bg-accent-soft px-2.5 py-1 font-bold text-blue">
                          +{money(parsed.amount)}
                        </motion.span>
                        <span className="rounded-full bg-fill px-2.5 py-1 font-semibold">{incomeCat(parsed.category).label}</span>
                        {parsed.daysAgo > 0 && <span className="rounded-full bg-fill px-2.5 py-1 font-semibold">{parsed.daysAgo === 1 ? 'Ayer' : 'Anteayer'}</span>}
                      </motion.div>
                    ) : (
                      usual.length > 0 &&
                      !text && (
                        <motion.div key="usual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 text-[13px]" role="group" aria-label="Lo de siempre">
                          {usual.map((u) => (
                            <button
                              key={u.note}
                              type="button"
                              onClick={() => void save(u, t)}
                              aria-label={`Apuntar ${u.note}, ${money(u.amount)}`}
                              className="flex shrink-0 items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 font-semibold transition-colors hover:bg-hover active:scale-95"
                            >
                              <span>{u.note}</span>
                              <span className="font-num text-muted">{money(u.amount)}</span>
                            </button>
                          ))}
                        </motion.div>
                      )
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
            {list.length ? (
              <Group>
                {list.map((e) => (
                  <IncomeRow key={e.id} e={e} onClick={() => setEditing(e)} />
                ))}
              </Group>
            ) : (
              !current && <p className="px-1 text-[14px] text-muted">Ningún ingreso apuntado ese mes.</p>
            )}
          </Section>
        </div>

        <div className="min-w-0">
          {current && <Insights data={data} t={t} />}
          {current && <SpendLess data={data} t={t} />}
          {/* Con el mes a medias (sin la nómina) los porcentajes no dicen nada */}
          {flow.income > 0 && !pending.length && <Rule503020 r={rule} />}
        </div>
      </div>

      {empty ? (
        <Group>
          <Empty
            icon={<Banknote size={28} strokeWidth={2.2} />}
            color="var(--c-blue)"
            title="Todo tu dinero, en una página"
            hint="Apunta lo que cobras arriba y tus gastos en Gastos, o trae los movimientos del banco: verás lo que te queda cada mes, la regla 50/30/20 y tu año mes a mes, como en Excel."
          />
        </Group>
      ) : (
        <YearTable expenses={expenses} incomes={incomes} fixed={fixedTotal} today={t} />
      )}

      <IncomeForm income={editing} onClose={() => setEditing(undefined)} />
      <BankImport open={importing} onClose={() => setUI({ creating: null })} expenses={expenses} incomes={incomes} rules={data.rules} />
    </Page>
  )
}

/**
 * Para gastar menos: los consejos más útiles de este mes (lo urgente y lo que
 * más ahorra), con su botón. El análisis completo, en «Ver todo».
 */
function SpendLess({ data, t }: { data: NonNullable<ReturnType<typeof useMoneyData>>; t: string }) {
  const features = useFeatures()
  const dismissed = useDismissed()
  if (!dismissed) return null
  const tips = adviceFor(data, t, features.on('finance')).filter((x) => !dismissed[x.id])
  if (!tips.length) return null
  const save = totalSaving(tips)
  const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Otros'
  return (
    <Section
      title="Para gastar menos"
      action={
        <a href="#/insights" className="inline-flex items-center text-[14px] font-semibold text-blue">
          Ver todo <ChevronRight size={15} />
        </a>
      }
    >
      {save >= 10 && (
        <p className="mb-2 px-1 text-[13.5px] text-muted">
          Podrías ahorrar unos <span className="font-num font-semibold text-fg">{money(save)}</span> al mes ({money(save * 12)} al año).
        </p>
      )}
      <TipList tips={tips.slice(0, 3)} budget={data.budget} dismissed={dismissed} labels={label} />
    </Section>
  )
}

/** Lo que hace pesado un mes: los pagos que no son de cada mes (el seguro, el IBI) y, si no, los más caros */
function heavyNames(charges: { sub: { name: string; cycle: string }; amount: number }[]) {
  const rare = charges.filter((c) => c.sub.cycle === 'quarter' || c.sub.cycle === 'year')
  return [...(rare.length ? rare : charges)]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 2)
    .map((c) => c.sub.name)
    .join(', ')
}

/**
 * Lo que conviene mirar este mes (como los avisos de Copilot, Monarch o
 * Fintonic): categorías por encima de lo normal, algo apuntado dos veces, los
 * pagos de los próximos 30 días y un mes que viene cargado.
 */
function Insights({ data, t }: { data: NonNullable<ReturnType<typeof useMoneyData>>; t: string }) {
  const features = useFeatures()
  const month = t.slice(0, 7)
  const dups = duplicateExpenses(data.expenses, month)
  const active = features.on('finance') ? data.subs.filter((s) => s.active) : []
  const soon = active.filter((s) => s.nextDate >= t && s.nextDate <= addDaysYmd(t, 30) && s.currency === 'EUR')
  const soonTotal = soon.reduce((s, x) => s + x.amount, 0)
  const months = active.length ? forecast(active, t, 4) : []
  const avg = months.length ? months.reduce((s, m) => s + m.total, 0) / months.length : 0
  const heavy = months.slice(1).find((m) => m.total > avg * 1.3 && m.total - avg > 50)
  const items: { key: string; icon: React.ReactNode; text: React.ReactNode; action?: React.ReactNode }[] = []
  for (const [, b] of dups.slice(0, 2))
    items.push({
      key: `d-${b.id}`,
      icon: <Copy size={15} />,
      text: (
        <>
          ¿Apuntado dos veces? <span className="font-semibold">{b.note}</span> <span className="font-num">{money(b.amount)}</span> el {fmt(b.date, 'd MMM').replace('.', '')}
        </>
      ),
      action: (
        <button
          type="button"
          onClick={async () => {
            await db.expenses.delete(b.id)
            toast('Gasto repetido borrado', { label: 'Deshacer', run: () => void db.expenses.put(b) })
          }}
          className="shrink-0 rounded-full bg-fill px-3 py-1 text-[13px] font-semibold hover:bg-hover"
        >
          Borrar uno
        </button>
      ),
    })
  if (soon.length)
    items.push({
      key: 'soon',
      icon: <CalendarClock size={15} />,
      text: (
        <>
          En los próximos 30 días se cobran <span className="font-num font-semibold">{money(Math.round(soonTotal))}</span> en {soon.length === 1 ? 'un pago fijo' : `${soon.length} pagos fijos`}
        </>
      ),
      action: (
        <a href="#/finance" className="shrink-0 text-[13px] font-semibold text-blue">
          Ver
        </a>
      ),
    })
  if (heavy)
    items.push({
      key: 'heavy',
      icon: <AlertCircle size={15} />,
      text: (
        <>
          <span className="font-semibold capitalize">{fmt(`${heavy.month}-01`, 'MMMM')}</span> viene cargado: <span className="font-num font-semibold">{money(Math.round(heavy.total))}</span> en pagos ({heavyNames(heavy.charges)})
        </>
      ),
    })
  if (!items.length) return null
  return (
    <Section title="Para tener en cuenta">
      <Group>
        {items.map((i) => (
          <div key={i.key} className="flex items-center gap-3 px-4 py-3 text-[14px] shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-fg">{i.icon}</span>
            <span className="min-w-0 flex-1">{i.text}</span>
            {i.action}
          </div>
        ))}
      </Group>
    </Section>
  )
}
