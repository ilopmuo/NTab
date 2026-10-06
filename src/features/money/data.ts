import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Account, Expense, Income, Subscription } from '@/db/types'
import type { Budget, ExpenseRules } from '@/lib/expenses'
import { fixedMonthly } from '@/lib/finance'
import type { DebtMethod } from '@/lib/wealth'

/** Ajuste `moneyPrefs`: lo que se elige en Cuentas (plan de deudas e independencia financiera) */
export interface MoneyPrefs {
  debtMethod?: DebtMethod
  /** € de más al mes para las deudas */
  debtExtra?: number
  /** rentabilidad real anual esperada (0,05 = 5 %) */
  fireReturn?: number
}

export interface MoneyData {
  expenses: Expense[]
  incomes: Income[]
  subs: Subscription[]
  accounts: Account[]
  budget: Budget
  rules: ExpenseRules
  prefs: MoneyPrefs
  fixed: ReturnType<typeof fixedMonthly>
}

/** Todo lo del dinero, en vivo (undefined mientras carga) */
export function useMoneyData(): MoneyData | undefined {
  return useLiveQuery(async () => {
    const [expenses, incomes, subs, accounts, budget, rules, prefs] = await Promise.all([
      db.expenses.orderBy('date').reverse().toArray(),
      db.incomes.orderBy('date').reverse().toArray(),
      db.subscriptions.toArray(),
      db.accounts.orderBy('order').toArray(),
      db.settings.get('budget'),
      db.settings.get('expenseRules'),
      db.settings.get('moneyPrefs'),
    ])
    return {
      expenses,
      incomes,
      subs,
      accounts,
      budget: (budget?.value as Budget | undefined) ?? {},
      rules: (rules?.value as ExpenseRules | undefined) ?? {},
      prefs: (prefs?.value as MoneyPrefs | undefined) ?? {},
      fixed: fixedMonthly(subs),
    }
  }, [])
}

/** «1.234,5» → 1234.5 (o NaN) */
export const readEuros = (s: string) => Number(s.replace(/\s|€/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))

/** Descarga un texto como archivo */
export function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
