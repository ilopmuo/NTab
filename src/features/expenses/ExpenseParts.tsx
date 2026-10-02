import { useState } from 'react'
import { m as motion } from 'motion/react'
import { Pencil, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import type { Expense } from '@/db/types'
import { setSetting } from '@/db/actions'
import { dateLabel, fmt, today } from '@/lib/dates'
import { CATEGORIES, categoryBudgets, money, normTag, ruleKey, type Budget, type ExpenseRules } from '@/lib/expenses'
import { toast } from '@/app/store'
import { Icon } from '@/components/icons'
import { Button, Card, Field, Input, Modal, ModalHeader, Section, Select, cx, softSpring } from '@/components/ui'

export const cat = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]

/** «roma, #viaje» → ['roma', 'viaje'] */
const readTags = (s: string) => [...new Set(s.split(/[\s,#]+/).map(normTag).filter(Boolean))]

/** Una fila de gasto: icono, concepto, categoría y etiquetas, importe */
export function ExpenseRow({ e, onClick, showDate }: { e: Expense; onClick: () => void; showDate?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left shadow-[inset_0_-1px_0_var(--c-border)] transition-colors last:shadow-none hover:bg-hover">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill">
        <Icon name={cat(e.category).icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{e.note}</span>
        <span className="block truncate text-[12.5px] text-muted">
          {[showDate && dateLabel(e.date), cat(e.category).label, ...(e.tags ?? []).map((t) => `#${t}`)].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="font-num text-[15px] font-semibold">{money(e.amount)}</span>
    </button>
  )
}

/** Los últimos 6 meses en barras (como los informes de Monarch o Spendee); un toque lleva a ese mes */
export function Trend({ months, selected, onPick }: { months: { month: string; total: number }[]; selected: string; onPick: (m: string) => void }) {
  const max = Math.max(...months.map((m) => m.total), 1)
  const withData = months.filter((m) => m.total > 0)
  const avg = withData.length ? withData.reduce((s, m) => s + m.total, 0) / withData.length : 0
  return (
    <Section title="Últimos meses" action={avg > 0 ? <span className="text-[13px] text-muted">Media: <span className="font-num font-semibold text-fg">{money(Math.round(avg))}</span></span> : undefined}>
      <Card className="p-4">
        <div className="relative flex h-32 items-end gap-2">
          {avg > 0 && <span aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `calc(20px + (100% - 20px) * ${avg / max})` }} />}
          {months.map((m, i) => {
            const on = m.month === selected
            return (
              <button
                key={m.month}
                type="button"
                onClick={() => onPick(m.month)}
                aria-pressed={on}
                aria-label={`${fmt(`${m.month}-01`, 'MMMM yyyy')}: ${money(m.total)}`}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              >
                <motion.span
                  className={cx('w-full max-w-10 rounded-[6px] transition-colors', on ? 'bg-blue' : 'bg-fill-2 group-hover:bg-hover')}
                  style={{ minHeight: m.total > 0 ? 4 : 2 }}
                  initial={{ height: 0 }}
                  animate={{ height: `calc((100% - 20px) * ${m.total / max})` }}
                  transition={{ ...softSpring, delay: i * 0.03 }}
                />
                <span className={cx('h-4 text-[11.5px] capitalize', on ? 'font-bold text-fg' : 'text-muted')}>{fmt(`${m.month}-01`, 'MMM').replace('.', '')}</span>
              </button>
            )
          })}
        </div>
      </Card>
    </Section>
  )
}

/** Por categoría, con su límite si lo tiene (como YNAB): lo gastado, lo que queda y la barra */
export function Categories({ byCategory, total, budget, onLimits }: { byCategory: { id: string; amount: number }[]; total: number; budget: Budget; onLimits: () => void }) {
  const limits = categoryBudgets(byCategory, budget)
  const rows = [...limits.map((l) => ({ id: l.id, amount: l.spent, limit: l.limit })), ...byCategory.filter((c) => !limits.some((l) => l.id === c.id)).map((c) => ({ id: c.id, amount: c.amount, limit: 0 }))]
  if (!rows.length) return null
  const top = Math.max(...byCategory.map((c) => c.amount), 1)
  return (
    <Section
      title="Por categoría"
      action={
        <button type="button" onClick={onLimits} className="text-[14px] font-semibold text-blue">
          {limits.length ? 'Límites' : 'Poner límites'}
        </button>
      }
    >
      <Card className="space-y-3.5 p-4">
        {rows.map((c) => {
          const over = c.limit > 0 && c.amount > c.limit
          const pct = c.limit ? c.amount / c.limit : c.amount / top
          return (
            <div key={c.id} title={`${cat(c.id).label}: ${money(c.amount)}`}>
              <div className="mb-1 flex items-center gap-2 text-[14px]">
                <Icon name={cat(c.id).icon} size={14} />
                <span className="flex-1">{cat(c.id).label}</span>
                <span className="font-num font-semibold">{money(c.amount)}</span>
                {c.limit > 0 ? (
                  <span className="font-num text-[12.5px] text-muted">de {money(c.limit)}</span>
                ) : (
                  total > 0 && <span className="font-num w-10 text-right text-[12.5px] text-muted">{Math.round((c.amount / total) * 100)} %</span>
                )}
              </div>
              <div
                className="h-1.5 rounded-full bg-fill"
                {...(c.limit ? { role: 'meter', 'aria-label': `${cat(c.id).label}: ${money(c.amount)} de ${money(c.limit)}`, 'aria-valuemin': 0, 'aria-valuemax': c.limit, 'aria-valuenow': c.amount } : {})}
              >
                <motion.div className={cx('h-full rounded-[4px]', over ? 'bg-fg' : 'bg-blue')} initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct * 100)}%` }} transition={softSpring} />
              </div>
              {c.limit > 0 && (
                <p className={cx('mt-1 text-[12.5px]', over ? 'font-semibold text-fg' : 'text-muted')}>
                  {over ? `Te has pasado ${money(c.amount - c.limit)}` : `Quedan ${money(c.limit - c.amount)}`}
                </p>
              )}
            </div>
          )
        })}
      </Card>
    </Section>
  )
}

/** Presupuesto del mes y límite por categoría */
export function BudgetForm({ open, budget, onClose }: { open: boolean; budget: Budget; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <BudgetFields budget={budget} onClose={onClose} />}
    </Modal>
  )
}

const readEuros = (s: string) => {
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return n > 0 ? Math.round(n) : 0
}

function BudgetFields({ budget, onClose }: { budget: Budget; onClose: () => void }) {
  const [monthly, setMonthly] = useState(budget.monthly ? String(budget.monthly) : '')
  const [limits, setLimits] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(budget.categories ?? {}).filter(([, v]) => v > 0).map(([k, v]) => [k, String(v)])))
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const categories = Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, readEuros(v)]).filter(([, v]) => (v as number) > 0))
        await setSetting('budget', { monthly: readEuros(monthly), categories } satisfies Budget)
        onClose()
      }}
    >
      <ModalHeader title="Presupuesto" onClose={onClose} />
      <div className="max-h-[68vh] space-y-5 overflow-y-auto p-5">
        <div>
          <Field label="Como mucho al mes, en total (€)">
            <Input autoFocus value={monthly} onChange={(e) => setMonthly(e.target.value)} inputMode="decimal" placeholder="Ej. 800" />
          </Field>
          <p className="mt-2 px-1 text-[13px] text-muted">Te aviso al llegar al 80 % y si te pasas. Déjalo vacío para quitarlo.</p>
        </div>
        <fieldset>
          <legend className="mb-2 px-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Por categoría (opcional)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIES.map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 rounded-xl bg-fill-2 py-1 pr-1 pl-3">
                <Icon name={c.icon} size={15} />
                <span className="flex-1 text-[14px]">{c.label}</span>
                <input
                  value={limits[c.id] ?? ''}
                  onChange={(e) => setLimits((l) => ({ ...l, [c.id]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="—"
                  aria-label={`Límite de ${c.label} (€)`}
                  className="font-num h-9 w-20 rounded-lg bg-surface px-2 text-right text-[14px] font-semibold placeholder:text-faint"
                />
              </label>
            ))}
          </div>
        </fieldset>
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
  )
}

/** Editar un gasto. Si cambias la categoría, LUNO lo aprende para la próxima vez (como Copilot) */
export function ExpenseForm({ expense, rules, onClose }: { expense?: Expense; rules: ExpenseRules; onClose: () => void }) {
  return (
    <Modal open={!!expense} onClose={onClose} position="center">
      {expense && <ExpenseFields key={expense.id} expense={expense} rules={rules} onClose={onClose} />}
    </Modal>
  )
}

function ExpenseFields({ expense, rules, onClose }: { expense: Expense; rules: ExpenseRules; onClose: () => void }) {
  const [amount, setAmount] = useState(String(expense.amount).replace('.', ','))
  const [note, setNote] = useState(expense.note)
  const [category, setCategory] = useState(expense.category)
  const [date, setDate] = useState(expense.date)
  const [tags, setTags] = useState((expense.tags ?? []).join(', '))
  const value = parseFloat(amount.replace(/\./g, '').replace(',', '.'))
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!(value > 0)) return
        const name = note.trim() || 'Gasto'
        const t = readTags(tags)
        await db.expenses.update(expense.id, { amount: Math.round(value * 100) / 100, note: name, category, date, tags: t.length ? t : undefined })
        onClose()
        if (category !== expense.category) {
          // Aprende: los próximos con este concepto van a esta categoría
          const key = ruleKey(name)
          if (key) await setSetting('expenseRules', { ...rules, [key]: category })
          const others = (await db.expenses.toArray()).filter((x) => x.id !== expense.id && ruleKey(x.note) === key && x.category !== category)
          toast(
            `Los próximos «${name}» irán a ${cat(category).label}`,
            others.length
              ? {
                  label: `Cambiar ${others.length === 1 ? 'el otro' : `los otros ${others.length}`}`,
                  run: () => void db.expenses.bulkUpdate(others.map((x) => ({ key: x.id, changes: { category } }))),
                }
              : undefined,
            6000,
          )
        }
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
        <Field label="Etiquetas">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Ej. roma, boda de Ana" />
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
