import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, m as motion } from 'motion/react'
import { ArrowUp, ChevronLeft, ChevronRight, Receipt, Search, X } from 'lucide-react'
import { db } from '@/db/db'
import type { Expense } from '@/db/types'
import { addExpense } from '@/db/moreActions'
import { addDaysYmd, dateLabel, fmt, today } from '@/lib/dates'
import { budgetAlert, frequentExpenses, money, monthSummary, monthlyTotals, parseExpense, searchExpenses, tagTotals, type Budget, type ExpenseRules, type ParsedExpense } from '@/lib/expenses'
import { monthly } from '@/lib/finance'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/store'
import { useFeatures } from '@/app/features'
import { SectionIcon, section } from '@/app/sections'
import { Card, Empty, Group, IconButton, PageHeader, Section, bouncy, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'
import { BudgetForm, Categories, ExpenseForm, ExpenseRow, Trend, cat } from './ExpenseParts'
import { SavingsJars } from './SavingsJars'

const monthOf = (ymd: string) => ymd.slice(0, 7)
function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** El aviso al apuntar: lo más grave primero (pasarse del total, de la categoría, acercarse…) */
function alertText(expenses: Expense[], p: Pick<ParsedExpense, 'amount' | 'category'>, date: string, t: string, budget: Budget) {
  if (monthOf(date) !== monthOf(t)) return undefined
  const s = monthSummary(expenses, monthOf(date), t)
  const limit = budget.categories?.[p.category]
  const total = budgetAlert(s.total, p.amount, budget.monthly)
  const mine = budgetAlert(s.byCategory.find((c) => c.id === p.category)?.amount ?? 0, p.amount, limit)
  const label = cat(p.category).label
  if (total === 'over') return `Te has pasado del presupuesto del mes (${money(budget.monthly!)})`
  if (mine === 'over') return `Te has pasado en ${label.toLowerCase()} (${money(limit!)} al mes)`
  if (total === 'near') return `Llevas el ${Math.round(((s.total + p.amount) / budget.monthly!) * 100)} % del presupuesto`
  if (mine === 'near') return `${label}: llevas el ${Math.round((((s.byCategory.find((c) => c.id === p.category)?.amount ?? 0) + p.amount) / limit!) * 100)} % de ${money(limit!)}`
  return undefined
}

/** Gastos: apuntar al vuelo y ver cómo va el mes */
export function ExpensesView() {
  const t = today()
  const [month, setMonth] = useState(monthOf(t))
  const [text, setText] = useState('')
  const [query, setQuery] = useState<string | null>(null)
  const [editing, setEditing] = useState<Expense | undefined>()
  const [editBudget, setEditBudget] = useState(false)
  const features = useFeatures()
  const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray(), [])
  const budget = useLiveQuery(() => db.settings.get('budget').then((r) => (r?.value as Budget | undefined) ?? {}), [])
  const rules = useLiveQuery(() => db.settings.get('expenseRules').then((r) => (r?.value as ExpenseRules | undefined) ?? {}), [])
  const fixed = useLiveQuery(() => db.subscriptions.toArray().then((subs) => subs.filter((s) => s.active && s.currency === 'EUR').reduce((sum, s) => sum + monthly(s), 0)), [])
  const parsed = useMemo(() => parseExpense(text, rules), [text, rules])
  const frequent = useMemo(() => (expenses ? frequentExpenses(expenses, t) : []), [expenses, t])
  if (!expenses || !budget || !rules || fixed === undefined) return null

  const sum = monthSummary(expenses, month, t)
  const prev = monthSummary(expenses, shiftMonth(month, -1), t)
  const list = expenses.filter((e) => e.date.startsWith(month))
  const days = [...new Set(list.map((e) => e.date))]
  const current = month === monthOf(t)
  const monthlyBudget = budget.monthly ?? 0
  const pct = monthlyBudget ? sum.total / monthlyBudget : 0
  const trend = monthlyTotals(expenses, monthOf(t), 6)
  const tags = tagTotals(expenses).filter((g) => list.some((e) => e.tags?.includes(g.tag)))
  const showFixed = current && features.on('finance') && fixed > 0

  const save = async (p: Pick<ParsedExpense, 'amount' | 'note' | 'category' | 'tags'>, date: string) => {
    const alert = alertText(expenses, p, date, t, budget)
    await addExpense({ amount: p.amount, note: p.note, category: p.category, date, ...(p.tags?.length ? { tags: p.tags } : {}) })
    haptic()
    setMonth(monthOf(date))
    if (alert) toast(alert, undefined, 6000, { icon: 'bell' })
    else toast(`${money(p.amount)} · ${p.note}`)
  }

  const add = async () => {
    if (!parsed) return
    setText('')
    await save(parsed, addDaysYmd(t, -parsed.daysAgo))
  }

  const search = query !== null ? searchExpenses(expenses, query) : undefined

  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('expenses')} size={40} />}
        title="Gastos"
        subtitle="Apunta cada gasto en un segundo: «12,50 café», «súper 63», «ayer 20 cena #roma»."
        actions={<IconButton filled label={query !== null ? 'Cerrar la búsqueda' : 'Buscar gastos'} onClick={() => setQuery(query !== null ? null : '')}>{query !== null ? <X size={17} /> : <Search size={17} />}</IconButton>}
      />

      {query !== null ? (
        <SearchResults query={query} onQuery={setQuery} result={search!} onEdit={setEditing} />
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void add()
            }}
            className="glass mb-2 flex items-center gap-2 rounded-[18px] py-2 pr-2 pl-4"
          >
            <Receipt size={18} className="shrink-0 text-muted" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="12,50 café" aria-label="Apuntar gasto" inputMode="text" className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" />
            <button type="submit" aria-label="Apuntar" disabled={!parsed} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white disabled:opacity-30">
              <ArrowUp size={18} strokeWidth={2.8} />
            </button>
          </form>
          <div className="mb-6 min-h-8 px-1">
            <AnimatePresence mode="wait" initial={false}>
              {parsed ? (
                <motion.div key="parsed" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <motion.span key={parsed.amount} initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={bouncy} className="font-num rounded-full bg-accent-soft px-2.5 py-1 font-bold text-blue">
                    {money(parsed.amount)}
                  </motion.span>
                  <span className="rounded-full bg-fill px-2.5 py-1 font-semibold">{cat(parsed.category).label}</span>
                  {parsed.daysAgo > 0 && <span className="rounded-full bg-fill px-2.5 py-1 font-semibold">{parsed.daysAgo === 1 ? 'Ayer' : 'Anteayer'}</span>}
                  {parsed.tags?.map((tag) => (
                    <span key={tag} className="rounded-full bg-fill px-2.5 py-1 font-semibold">
                      #{tag}
                    </span>
                  ))}
                </motion.div>
              ) : (
                frequent.length > 0 &&
                !text && (
                  // Lo de siempre, en un toque (como las plantillas de Wallet)
                  <motion.div key="frequent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 text-[13px]" role="group" aria-label="Lo de siempre">
                    {frequent.map((f) => (
                      <button
                        key={`${f.note}-${f.amount}`}
                        type="button"
                        onClick={() => void save(f, t)}
                        aria-label={`Apuntar ${f.note}, ${money(f.amount)}`}
                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 font-semibold transition-colors hover:bg-hover active:scale-95"
                      >
                        <span className="capitalize">{f.note}</span>
                        <span className="font-num text-muted">{money(f.amount)}</span>
                      </button>
                    ))}
                  </motion.div>
                )
              )}
            </AnimatePresence>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <button type="button" aria-label="Mes anterior" onClick={() => setMonth(shiftMonth(month, -1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-fill active:scale-90">
              <ChevronLeft size={18} />
            </button>
            <p className="flex-1 text-center text-[17px] font-bold capitalize">{fmt(`${month}-01`, 'MMMM yyyy')}</p>
            <button type="button" aria-label="Mes siguiente" disabled={current} onClick={() => setMonth(shiftMonth(month, 1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-fill active:scale-90 disabled:opacity-30">
              <ChevronRight size={18} />
            </button>
          </div>

          <Card className="mb-6 p-5">
            <p className="text-[13px] font-semibold text-muted">{current ? 'Llevas gastado este mes' : 'Gastaste'}</p>
            <motion.p key={`${month}-${sum.total}`} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className="font-num mt-1 text-[40px] leading-none font-bold tracking-tight">
              {money(sum.total)}
            </motion.p>
            <p className="mt-2 text-[13px] text-muted">
              {[
                prev.total > 0 && `${sum.total >= prev.total ? '+' : '−'}${Math.abs(Math.round(((sum.total - prev.total) / prev.total) * 100))} % que el mes anterior`,
                // Con una semana de datos la proyección ya dice algo
                current && Number(t.slice(8, 10)) >= 7 && sum.projection > sum.total && `a este ritmo, ${money(sum.projection)} a fin de mes`,
              ]
                .filter(Boolean)
                .join(' · ') || `${sum.count} ${sum.count === 1 ? 'gasto' : 'gastos'}`}
            </p>
            {showFixed && (
              // Lo fijo aparte de lo que se puede ajustar (como el «flex» de Monarch)
              <p className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-[13px]">
                <a href="#/finance" className="text-muted hover:text-fg">
                  Pagos fijos <span className="font-num font-semibold text-fg">{money(Math.round(fixed))}</span>/mes
                </a>
                <span className="text-muted">
                  En total, unos <span className="font-num font-semibold text-fg">{money(Math.round(sum.total + fixed))}</span>
                </span>
              </p>
            )}
            {monthlyBudget > 0 ? (
              <div className="mt-4">
                <div className="h-2.5 overflow-hidden rounded-full bg-fill" role="meter" aria-valuemin={0} aria-valuemax={monthlyBudget} aria-valuenow={sum.total} aria-label="Presupuesto del mes">
                  <motion.div className={cx('h-full rounded-full', pct >= 1 ? 'bg-fg' : 'bg-blue')} initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct * 100)}%` }} transition={softSpring} />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[13px]">
                  <span className={cx(pct >= 1 ? 'font-semibold text-fg' : 'text-muted')}>
                    {pct >= 1 ? `Te has pasado ${money(sum.total - monthlyBudget)}` : `Quedan ${money(monthlyBudget - sum.total)} de ${money(monthlyBudget)}`}
                  </span>
                  <button type="button" onClick={() => setEditBudget(true)} className="font-semibold text-blue">
                    Cambiar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setEditBudget(true)} className="mt-3 text-[14px] font-semibold text-blue">
                Poner un presupuesto mensual
              </button>
            )}
          </Card>

          {trend.filter((m) => m.total > 0).length >= 2 && <Trend months={trend} selected={month} onPick={setMonth} />}

          <Categories byCategory={sum.byCategory} total={sum.total} budget={budget} onLimits={() => setEditBudget(true)} />

          {tags.length > 0 && (
            <Section title="Etiquetas">
              <div className="flex flex-wrap gap-2">
                {tags.map((g) => (
                  <button key={g.tag} type="button" onClick={() => setQuery(`#${g.tag}`)} className="glass flex items-center gap-2 rounded-full px-3.5 py-2 text-[14px] transition-colors hover:bg-hover">
                    <span className="font-semibold">#{g.tag}</span>
                    <span className="font-num text-muted">{money(g.total)}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {features.on('goals') && <SavingsJars />}

          {list.length === 0 ? (
            <Group>
              <Empty icon={<Receipt size={28} strokeWidth={2.2} />} color="var(--c-blue)" title={current ? 'Sin gastos este mes' : 'Sin gastos ese mes'} hint="Escribe el importe y en qué: LUNO pone la categoría. También puedes decírselo a Claude." />
            </Group>
          ) : (
            days.map((d) => {
              const items = list.filter((e) => e.date === d)
              return (
                <Section key={d} title={dateLabel(d, t)} action={<span className="font-num text-[14px] font-semibold text-muted">{money(items.reduce((s, e) => s + e.amount, 0))}</span>}>
                  <Group>
                    {items.map((e) => (
                      <ExpenseRow key={e.id} e={e} onClick={() => setEditing(e)} />
                    ))}
                  </Group>
                </Section>
              )
            })
          )}
        </>
      )}

      <ExpenseForm expense={editing} rules={rules} onClose={() => setEditing(undefined)} />
      <BudgetForm open={editBudget} budget={budget} onClose={() => setEditBudget(false)} />
    </Page>
  )
}

/** Buscar en todos los meses (como en Monarch): por concepto, categoría o #etiqueta, con el total */
function SearchResults({ query, onQuery, result, onEdit }: { query: string; onQuery: (q: string) => void; result: { items: Expense[]; total: number }; onEdit: (e: Expense) => void }) {
  return (
    <>
      <div className="glass mb-6 flex items-center gap-2 rounded-[18px] py-2 pr-2 pl-4">
        <Search size={18} className="shrink-0 text-muted" />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onQuery('')}
          placeholder="Mercadona, comer fuera, #roma…"
          aria-label="Buscar en tus gastos"
          className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
        />
      </div>
      {query.trim() &&
        (result.items.length ? (
          <Section
            title={`${result.items.length} ${result.items.length === 1 ? 'gasto' : 'gastos'}`}
            action={
              <span className="text-[14px] text-muted">
                En total <span className="font-num font-semibold text-fg">{money(result.total)}</span>
              </span>
            }
          >
            <Group>
              {result.items.slice(0, 200).map((e) => (
                <ExpenseRow key={e.id} e={e} onClick={() => onEdit(e)} showDate />
              ))}
            </Group>
          </Section>
        ) : (
          <p className="px-1 text-[14px] text-muted">Nada con «{query.trim()}».</p>
        ))}
    </>
  )
}
