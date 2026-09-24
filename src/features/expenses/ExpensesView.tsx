import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUp, ChevronLeft, ChevronRight, Pencil, Receipt, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import type { Expense } from '@/db/types'
import { addExpense, setSetting } from '@/db/actions'
import { addDaysYmd, dateLabel, fmt, today } from '@/lib/dates'
import { CATEGORIES, money, monthSummary, parseExpense } from '@/lib/expenses'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/store'
import { SectionIcon, section } from '@/app/sections'
import { Icon } from '@/components/icons'
import { Button, Card, Empty, Field, Group, Input, Modal, ModalHeader, PageHeader, Section, Select, bouncy, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'

const cat = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
const monthOf = (ymd: string) => ymd.slice(0, 7)
function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Gastos: apuntar al vuelo y ver cómo va el mes */
export function ExpensesView() {
  const t = today()
  const [month, setMonth] = useState(monthOf(t))
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<Expense | undefined>()
  const [editBudget, setEditBudget] = useState(false)
  const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray(), [])
  const budget = useLiveQuery(() => db.settings.get('budget').then((r) => (r?.value as { monthly?: number } | undefined)?.monthly ?? 0), [])
  const parsed = useMemo(() => parseExpense(text), [text])
  if (!expenses || budget === undefined) return null

  const sum = monthSummary(expenses, month, t)
  const prev = monthSummary(expenses, shiftMonth(month, -1), t)
  const list = expenses.filter((e) => e.date.startsWith(month))
  const days = [...new Set(list.map((e) => e.date))]
  const current = month === monthOf(t)
  const pct = budget ? sum.total / budget : 0

  const add = async () => {
    if (!parsed) return
    const date = addDaysYmd(t, -parsed.daysAgo)
    const before = monthSummary(expenses, monthOf(date), t).total
    await addExpense({ amount: parsed.amount, note: parsed.note, category: parsed.category, date })
    haptic()
    setText('')
    setMonth(monthOf(date))
    const after = before + parsed.amount
    // Aviso al pasar del 80 % o del 100 % del presupuesto
    if (budget && monthOf(date) === monthOf(t) && before < budget && after >= budget) toast(`Te has pasado del presupuesto del mes (${money(budget)})`, undefined, 6000, { icon: 'bell' })
    else if (budget && monthOf(date) === monthOf(t) && before < budget * 0.8 && after >= budget * 0.8) toast(`Llevas el ${Math.round((after / budget) * 100)} % del presupuesto`, undefined, 6000, { icon: 'bell' })
    else toast(`${money(parsed.amount)} · ${parsed.note}`)
  }

  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('expenses')} size={40} />}
        title="Gastos"
        subtitle="Apunta cada gasto en un segundo: «12,50 café», «súper 63», «ayer 20 cena»."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
        className="glass mb-2 flex items-center gap-2 rounded-[18px] py-2 pr-2 pl-4"
      >
        <Receipt size={18} className="shrink-0 text-muted" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="12,50 café" aria-label="Apuntar gasto" inputMode="text" className="h-10 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" />
        <button type="submit" aria-label="Apuntar" disabled={!parsed} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-30">
          <ArrowUp size={18} strokeWidth={2.8} />
        </button>
      </form>
      <div className="mb-6 h-8 px-1">
        <AnimatePresence>
          {parsed && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-1.5 text-[13px]">
              <motion.span key={parsed.amount} initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={bouncy} className="font-num rounded-full bg-accent-soft px-2.5 py-1 font-bold text-blue">
                {money(parsed.amount)}
              </motion.span>
              <span className="rounded-full bg-fill px-2.5 py-1 font-semibold">{cat(parsed.category).label}</span>
              {parsed.daysAgo > 0 && <span className="rounded-full bg-fill px-2.5 py-1 font-semibold">{parsed.daysAgo === 1 ? 'Ayer' : 'Anteayer'}</span>}
            </motion.div>
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
            current && sum.projection > sum.total && `a este ritmo, ${money(sum.projection)} a fin de mes`,
          ]
            .filter(Boolean)
            .join(' · ') || `${sum.count} ${sum.count === 1 ? 'gasto' : 'gastos'}`}
        </p>
        {budget > 0 ? (
          <div className="mt-4">
            <div className="h-2.5 overflow-hidden rounded-full bg-fill" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={sum.total} aria-label="Presupuesto del mes">
              <motion.div className={cx('h-full rounded-full', pct >= 1 ? 'bg-fg' : 'bg-blue')} initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct * 100)}%` }} transition={softSpring} />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[13px]">
              <span className={cx(pct >= 1 ? 'font-semibold text-fg' : 'text-muted')}>
                {pct >= 1 ? `Te has pasado ${money(sum.total - budget)}` : `Quedan ${money(budget - sum.total)} de ${money(budget)}`}
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

      {sum.byCategory.length > 0 && (
        <Section title="Por categoría">
          <Card className="space-y-3 p-4">
            {sum.byCategory.map((c) => (
              <div key={c.id} title={`${cat(c.id).label}: ${money(c.amount)}`}>
                <div className="mb-1 flex items-center gap-2 text-[14px]">
                  <Icon name={cat(c.id).icon} size={14} />
                  <span className="flex-1">{cat(c.id).label}</span>
                  <span className="font-num font-semibold">{money(c.amount)}</span>
                  <span className="font-num w-10 text-right text-[12.5px] text-muted">{Math.round((c.amount / sum.total) * 100)} %</span>
                </div>
                <div className="h-1.5 rounded-full bg-fill">
                  <motion.div className="h-full rounded-[4px] bg-blue" initial={{ width: 0 }} animate={{ width: `${(c.amount / sum.byCategory[0].amount) * 100}%` }} transition={softSpring} />
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {list.length === 0 ? (
        <Group>
          <Empty icon={<Receipt size={28} strokeWidth={2.2} />} color="var(--c-blue)" title={current ? 'Sin gastos este mes' : 'Sin gastos ese mes'} hint="Escribe el importe y en qué: NTab pone la categoría. También puedes decírselo a Claude." />
        </Group>
      ) : (
        days.map((d) => {
          const items = list.filter((e) => e.date === d)
          return (
            <Section key={d} title={dateLabel(d, t)} action={<span className="font-num text-[14px] font-semibold text-muted">{money(items.reduce((s, e) => s + e.amount, 0))}</span>}>
              <Group>
                {items.map((e) => (
                  <button key={e.id} type="button" onClick={() => setEditing(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left shadow-[inset_0_-1px_0_var(--c-border)] transition-colors last:shadow-none hover:bg-hover">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill">
                      <Icon name={cat(e.category).icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{e.note}</span>
                      <span className="block text-[12.5px] text-muted">{cat(e.category).label}</span>
                    </span>
                    <span className="font-num text-[15px] font-semibold">{money(e.amount)}</span>
                  </button>
                ))}
              </Group>
            </Section>
          )
        })
      )}

      <ExpenseForm expense={editing} onClose={() => setEditing(undefined)} />
      <BudgetForm open={editBudget} value={budget} onClose={() => setEditBudget(false)} />
    </Page>
  )
}

function ExpenseForm({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  return (
    <Modal open={!!expense} onClose={onClose} position="center">
      {expense && <ExpenseFields key={expense.id} expense={expense} onClose={onClose} />}
    </Modal>
  )
}

function ExpenseFields({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const [amount, setAmount] = useState(String(expense.amount).replace('.', ','))
  const [note, setNote] = useState(expense.note)
  const [category, setCategory] = useState(expense.category)
  const [date, setDate] = useState(expense.date)
  const value = parseFloat(amount.replace(/\./g, '').replace(',', '.'))
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!(value > 0)) return
        await db.expenses.update(expense.id, { amount: Math.round(value * 100) / 100, note: note.trim() || 'Gasto', category, date })
        onClose()
      }}
    >
      <ModalHeader title="Gasto" onClose={onClose} />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Importe (€)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Día">
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Concepto">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Categoría">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex items-center gap-2 px-5 pt-1 pb-5">
        <Button
          type="button"
          variant="danger"
          onClick={async () => {
            await db.expenses.delete(expense.id)
            onClose()
            toast('Gasto borrado', { label: 'Deshacer', run: () => void db.expenses.put(expense) })
          }}
        >
          <Trash2 size={15} /> Borrar
        </Button>
        <div className="flex-1" />
        <Button type="submit" variant="primary" disabled={!(value > 0)}>
          <Pencil size={14} /> Guardar
        </Button>
      </div>
    </form>
  )
}

function BudgetForm({ open, value, onClose }: { open: boolean; value: number; onClose: () => void }) {
  const [v, setV] = useState(value ? String(value) : '')
  return (
    <Modal open={open} onClose={onClose} position="center">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
          await setSetting('budget', { monthly: n > 0 ? Math.round(n) : 0 })
          onClose()
        }}
      >
        <ModalHeader title="Presupuesto mensual" onClose={onClose} />
        <div className="p-5">
          <Field label="¿Cuánto quieres gastar como mucho al mes? (€)">
            <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" placeholder="Ej. 800" />
          </Field>
          <p className="mt-2 px-1 text-[13px] text-muted">Te aviso al llegar al 80 % y si te pasas. Déjalo vacío para quitarlo.</p>
        </div>
        <div className="flex justify-end gap-2 px-5 pb-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary">
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
