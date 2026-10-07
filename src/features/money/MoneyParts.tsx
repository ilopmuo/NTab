import { useState } from 'react'
import { m as motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import type { Income } from '@/db/types'
import { dateLabel, fmt, today } from '@/lib/dates'
import { money } from '@/lib/expenses'
import { INCOME_CATEGORIES, incomeCat, rule503020 } from '@/lib/money'
import { toast } from '@/app/store'
import { Icon } from '@/components/icons'
import { Button, Card, Section, cx, softSpring } from '@/components/ui'
import { Field, Input, Select } from '@/components/form'
import { Modal, ModalHeader } from '@/components/Modal'
import { readEuros } from './data'

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** ‹ octubre 2026 › */
export function MonthNav({ month, onChange, max }: { month: string; onChange: (m: string) => void; max: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <button type="button" aria-label="Mes anterior" onClick={() => onChange(shiftMonth(month, -1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-fill active:scale-90">
        <ChevronLeft size={18} />
      </button>
      <p className="flex-1 text-center text-[17px] font-bold capitalize">{fmt(`${month}-01`, 'MMMM yyyy')}</p>
      <button type="button" aria-label="Mes siguiente" disabled={month >= max} onClick={() => onChange(shiftMonth(month, 1))} className="flex h-9 w-9 items-center justify-center rounded-full bg-fill active:scale-90 disabled:opacity-30">
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

/** Signo y euros: «+1.850 €», «−120 €» */
export const signed = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${money(Math.abs(Math.round(n * 100) / 100))}`

/** Una fila de ingreso */
export function IncomeRow({ e, onClick }: { e: Income; onClick: () => void }) {
  const c = incomeCat(e.category)
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left shadow-[inset_0_-1px_0_var(--c-border)] transition-colors last:shadow-none hover:bg-hover">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill">
        <Icon name={c.icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{e.note}</span>
        <span className="block truncate text-[12.5px] text-muted">{[dateLabel(e.date), c.label].join(' · ')}</span>
      </span>
      <span className="font-num text-[15px] font-semibold">+{money(e.amount)}</span>
    </button>
  )
}

/** Editar un ingreso */
export function IncomeForm({ income, onClose }: { income?: Income; onClose: () => void }) {
  return (
    <Modal open={!!income} onClose={onClose} position="center">
      {income && <IncomeFields key={income.id} income={income} onClose={onClose} />}
    </Modal>
  )
}

function IncomeFields({ income, onClose }: { income: Income; onClose: () => void }) {
  const [amount, setAmount] = useState(String(income.amount).replace('.', ','))
  const [note, setNote] = useState(income.note)
  const [category, setCategory] = useState(income.category)
  const [date, setDate] = useState(income.date)
  const value = readEuros(amount)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!(value > 0)) return
        await db.incomes.update(income.id, { amount: Math.round(value * 100) / 100, note: note.trim() || 'Ingreso', category, date })
        onClose()
      }}
    >
      <ModalHeader title="Ingreso" onClose={onClose} />
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
        <Field label="Tipo">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {INCOME_CATEGORIES.map((c) => (
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
            await db.incomes.delete(income.id)
            onClose()
            toast('Ingreso borrado', { label: 'Deshacer', run: () => void db.incomes.put(income) })
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

/**
 * La regla 50/30/20 (la de las plantillas de presupuesto): la barra de lo que
 * entra partida en lo necesario, los caprichos y lo que queda, con las marcas
 * del 50 % y del 80 %.
 */
export function Rule503020({ r }: { r: ReturnType<typeof rule503020> }) {
  const parts = [
    { id: 'needs', label: 'Lo necesario', hint: 'casa, súper, recibos, transporte, salud…', value: r.needs, pct: r.pctNeeds, ideal: 0.5, color: 'var(--c-blue)' },
    { id: 'wants', label: 'Caprichos', hint: 'comer fuera, ocio, ropa, suscripciones…', value: r.wants, pct: r.pctWants, ideal: 0.3, color: 'color-mix(in srgb, var(--c-text) 40%, transparent)' },
    { id: 'savings', label: 'Te queda', hint: 'para ahorrar o invertir', value: r.savings, pct: r.pctSavings, ideal: 0.2, color: 'var(--c-green)' },
  ]
  const tip =
    r.pctSavings < 0
      ? 'Este mes sale más de lo que entra.'
      : r.pctNeeds > 0.55
        ? 'Lo necesario se lleva más de la mitad: la vivienda y los recibos son lo que más pesa.'
        : r.pctWants > 0.35
          ? 'Los caprichos pasan del 30 %: ahí es donde más fácil es recortar.'
          : r.pctSavings >= 0.2
            ? 'Vas como dice la regla: al menos el 20 % se queda.'
            : 'Apartar el 20 % de lo que entra es la meta de la regla.'
  return (
    <Section title="50/30/20">
      <Card className="p-4">
        <div className="relative mb-1 flex h-3 overflow-hidden rounded-full bg-fill" role="img" aria-label={`Lo necesario ${Math.round(r.pctNeeds * 100)} %, caprichos ${Math.round(r.pctWants * 100)} %, te queda ${Math.round(r.pctSavings * 100)} %`}>
          {parts.map((p, i) => (
            <motion.span
              key={p.id}
              className="h-full"
              style={{ background: p.color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(1, p.pct)) * 100}%` }}
              transition={{ ...softSpring, delay: i * 0.05 }}
            />
          ))}
          <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-bg/80" />
          <span aria-hidden className="absolute inset-y-0 left-[80%] w-px bg-bg/80" />
        </div>
        <div className="mb-3 flex justify-between text-[11px] text-faint">
          <span>0</span>
          <span className="pl-[30%]">50 %</span>
          <span>80 %</span>
          <span>100 %</span>
        </div>
        <ul className="space-y-2.5">
          {parts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-[14px]">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{p.label}</span> <span className="text-muted">· {p.hint}</span>
              </span>
              <span className="font-num shrink-0 text-right">
                <span className="font-semibold">{Math.round(p.pct * 100)} %</span> <span className="text-[12.5px] text-muted">({Math.round(p.ideal * 100)} %)</span>
                <span className="block text-[12.5px] text-muted">{money(Math.round(p.value))}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">{tip}</p>
      </Card>
    </Section>
  )
}

/** Barra horizontal de una cifra frente a otra (lo que entra y lo que sale) */
export function FlowBar({ label, value, max, strong, detail }: { label: string; value: number; max: number; strong?: boolean; detail?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-semibold">{label}</span>
        <span className="font-num">
          <span className="font-semibold">{money(Math.round(value))}</span>
          {detail && <span className="text-muted"> · {detail}</span>}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-fill">
        <motion.div className={cx('h-full rounded-full', strong ? 'bg-blue' : 'bg-fg/35')} initial={{ width: 0 }} animate={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} transition={softSpring} />
      </div>
    </div>
  )
}
