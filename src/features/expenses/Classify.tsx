import { useState } from 'react'
import { m as motion, AnimatePresence } from 'motion/react'
import type { Expense } from '@/db/types'
import { classifyExpense } from '@/db/moreActions'
import { dateLabel } from '@/lib/dates'
import { CATEGORIES, guessCategories, money } from '@/lib/expenses'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/store'
import { Icon } from '@/components/icons'
import { cat } from './ExpenseParts'

/** Clasificar un gasto: lo aprende para los próximos con ese concepto y lo dice */
export async function answer(e: Expense, category: string) {
  const r = await classifyExpense(e.id, category)
  if (!r) return
  haptic()
  const label = cat(category).label
  toast(
    r.others ? `${e.note}: ${label}, y ${r.others === 1 ? 'otro igual' : `${r.others} más iguales`}. Los próximos irán ahí` : `${e.note}: ${label}. Los próximos irán ahí`,
    { label: 'Deshacer', run: () => void r.undo() },
    6000,
  )
}

/**
 * Los gastos que LUNO no sabía clasificar, con las categorías más probables
 * en un toque (y «Otra» para elegir cualquiera).
 */
export function ClassifyList({ items, history, max }: { items: Expense[]; history: Expense[]; max?: number }) {
  const shown = max ? items.slice(0, max) : items
  return (
    <ul className="space-y-3">
      <AnimatePresence initial={false}>
        {shown.map((e) => (
          <motion.li key={e.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <ClassifyRow e={e} history={history} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

function ClassifyRow({ e, history }: { e: Expense; history: Expense[] }) {
  const [more, setMore] = useState(false)
  const guesses = guessCategories(e.note, history, 3)
  return (
    <div>
      <p className="flex items-baseline gap-2 text-[14.5px]">
        <span className="min-w-0 flex-1 truncate font-semibold">{e.note}</span>
        <span className="font-num shrink-0 font-semibold">{money(e.amount)}</span>
      </p>
      <p className="mb-1.5 text-[12.5px] text-muted">{dateLabel(e.date)}</p>
      <div className="-mx-1 flex flex-wrap gap-1.5 px-1" role="group" aria-label={`¿De qué es «${e.note}»?`}>
        {(more ? CATEGORIES.map((c) => c.id) : guesses).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => void answer(e, id)}
            className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold transition-colors hover:bg-hover active:scale-95"
          >
            <Icon name={cat(id).icon} size={13} /> {cat(id).label}
          </button>
        ))}
        {!more && (
          <button type="button" onClick={() => setMore(true)} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-blue">
            Otra…
          </button>
        )}
      </div>
    </div>
  )
}
