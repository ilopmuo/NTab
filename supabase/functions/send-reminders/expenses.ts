// Avisos del dinero:
// - «¿De qué es este gasto?»: lo que LUNO no supo clasificar (un pago con Apple
//   Pay en «AMZN Mktp», un Bizum…), con las dos categorías más probables como
//   botones. Una vez por gasto, de 9:00 a 22:00 y no al momento (por si lo
//   arreglas tú antes).
import { CATEGORIES, guessCategories, money, type Budget } from '../_shared/expenses.ts'
import { spendingAdvice, weekMessage, weekReview, type SubLike } from '../_shared/advice.ts'
import { addDays, hhmmIn, ymdIn } from '../_shared/time.ts'

/** Lo que se usa del cliente de Supabase (sin sus tipos, para poder probarlo fuera de Deno) */
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any }

type Log = { user_id: string; tbl: string; item_id: string; remind_at: string }
export interface MoneyJob {
  user_id: string
  payload: () => unknown
  log: Log
  /** más avisos que quedan dados con este envío (varios gastos en uno) */
  more?: Log[]
}

interface Spent {
  id: string
  amount: number
  note?: string
  category: string
  date: string
  createdAt?: number
  unclassified?: boolean
}

/** La zona horaria de cada usuario con avisos: la de su dispositivo usado más recientemente */
export async function userZones(admin: Db): Promise<Map<string, string>> {
  const { data: subs, error } = await admin.from('push_subscriptions').select('user_id,tz,last_used_at,created_at')
  if (error) throw new Error(error.message)
  const zone = new Map<string, { tz: string; at: string }>()
  for (const s of (subs ?? []) as { user_id: string; tz: string | null; last_used_at: string | null; created_at: string }[]) {
    const at = s.last_used_at ?? s.created_at ?? ''
    const prev = zone.get(s.user_id)
    if (!prev || at > prev.at) zone.set(s.user_id, { tz: s.tz || 'Europe/Madrid', at })
  }
  return new Map([...zone].map(([u, z]) => [u, z.tz]))
}

const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Otros'
const when = (date: string, today: string) => (date === today ? 'hoy' : date === addDays(today, -1) ? 'ayer' : `el ${Number(date.slice(8, 10))}`)

/** Los avisos de gastos sin clasificar que tocan ahora */
export async function dueExpenseQuestions(admin: Db, now = Date.now()): Promise<MoneyJob[]> {
  const zones = await userZones(admin)
  if (!zones.size) return []
  const { data, error } = await admin.from('records').select('user_id,id,data').eq('tbl', 'expenses').eq('deleted', false).eq('data->>unclassified', 'true').in('user_id', [...zones.keys()])
  if (error) throw new Error(error.message)
  const pending = ((data ?? []) as { user_id: string; id: string; data: Spent | null }[]).filter((r) => {
    const tz = zones.get(r.user_id)
    if (!r.data || !tz) return false
    // De 9:00 a 22:00 en su zona horaria
    const hm = hhmmIn(now, tz)
    if (hm < '09:00' || hm > '22:00') return false
    // No al momento (por si lo clasifica él) ni lo que ya es viejo
    const created = Number(r.data.createdAt) || 0
    return now - created > 3 * 60_000 && r.data.date >= addDays(ymdIn(now, tz), -7)
  })
  if (!pending.length) return []
  const { data: sent } = await admin.from('push_log').select('user_id,item_id').eq('tbl', 'expense-ask').in('item_id', pending.map((r) => r.id))
  const asked = new Set(((sent ?? []) as { user_id: string; item_id: string }[]).map((l) => `${l.user_id}|${l.item_id}`))
  const byUser = new Map<string, { id: string; data: Spent }[]>()
  for (const r of pending) if (!asked.has(`${r.user_id}|${r.id}`)) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), { id: r.id, data: r.data! }])
  if (!byUser.size) return []

  // Lo que ha gastado antes cada uno, para adivinar las categorías probables
  const users = [...byUser.keys()]
  const since = addDays(ymdIn(now, 'UTC'), -120)
  const { data: past } = await admin.from('records').select('user_id,data').eq('tbl', 'expenses').eq('deleted', false).in('user_id', users).gte('data->>date', since)
  const history = new Map<string, Spent[]>()
  for (const r of (past ?? []) as { user_id: string; data: Spent | null }[]) if (r.data) history.set(r.user_id, [...(history.get(r.user_id) ?? []), r.data])

  const at = new Date(now).toISOString()
  const jobs: MoneyJob[] = []
  for (const [user, list] of byUser) {
    const today = ymdIn(now, zones.get(user)!)
    const logs = list.map((e) => ({ user_id: user, tbl: 'expense-ask', item_id: e.id, remind_at: at }))
    if (list.length === 1) {
      const e = list[0]
      const guesses = guessCategories(e.data.note ?? '', history.get(user) ?? [], 2)
      jobs.push({
        user_id: user,
        payload: () => ({
          title: '¿De qué es este gasto?',
          body: `${money(e.data.amount)} · ${e.data.note || 'Gasto'} (${when(e.data.date, today)}). Toca un botón o abre LUNO para elegir.`,
          url: './#/expenses',
          tag: `expense-ask-${e.id}`,
          key: `expense-ask-${e.id}`,
          expenseId: e.id,
          expenseGuesses: guesses.map((id) => ({ id, label: label(id) })),
        }),
        log: logs[0],
      })
    } else {
      const sorted = [...list].sort((a, b) => b.data.amount - a.data.amount)
      jobs.push({
        user_id: user,
        payload: () => ({
          title: `${list.length} gastos sin clasificar`,
          body: `${sorted
            .slice(0, 3)
            .map((e) => `${money(e.data.amount)} ${e.data.note || 'Gasto'}`)
            .join(' · ')}${list.length > 3 ? ' …' : ''}. Toca para decir de qué son.`,
          url: './#/expenses',
          tag: 'expense-ask',
          key: `expense-ask-${logs.map((l) => l.item_id).join(',')}`,
        }),
        log: logs[0],
        more: logs.slice(1),
      })
    }
  }
  return jobs
}

// - «Tu semana en gastos»: el domingo por la tarde (19:00-21:00), lo de la
//   semana frente a una semana normal, lo que más y el consejo más útil.

const WEEK_DAY = 0 // domingo
export async function dueMoneyWeek(admin: Db, now = Date.now()): Promise<MoneyJob[]> {
  const zones = await userZones(admin)
  // Solo a quien ahora es domingo por la tarde
  const due = [...zones].filter(([, tz]) => {
    const hm = hhmmIn(now, tz)
    return new Date(`${ymdIn(now, tz)}T12:00:00Z`).getUTCDay() === WEEK_DAY && hm >= '19:00' && hm <= '21:00'
  })
  if (!due.length) return []
  const users = due.map(([u]) => u)
  const { data: sent } = await admin.from('push_log').select('user_id,item_id').eq('tbl', 'money-week').in('user_id', users)
  const done = new Set(((sent ?? []) as { user_id: string; item_id: string }[]).map((l) => `${l.user_id}|${l.item_id}`))
  const todo = due.filter(([u, tz]) => !done.has(`${u}|${ymdIn(now, tz)}`))
  if (!todo.length) return []
  const ids = todo.map(([u]) => u)
  const since = addDays(ymdIn(now, 'UTC'), -100)
  const [{ data: rows }, { data: settings }, { data: subs }] = await Promise.all([
    admin.from('records').select('user_id,data').eq('tbl', 'expenses').eq('deleted', false).in('user_id', ids).gte('data->>date', since),
    admin.from('records').select('user_id,data').eq('tbl', 'settings').eq('id', 'budget').eq('deleted', false).in('user_id', ids),
    admin.from('records').select('user_id,data').eq('tbl', 'subscriptions').eq('deleted', false).in('user_id', ids),
  ])
  const of = <T>(list: unknown, user: string) => ((list ?? []) as { user_id: string; data: T | null }[]).filter((r) => r.user_id === user && r.data).map((r) => r.data as T)
  const at = new Date(now).toISOString()
  const jobs: MoneyJob[] = []
  for (const [user, tz] of todo) {
    const today = ymdIn(now, tz)
    const expenses = of<Spent>(rows, user)
    const review = weekReview(expenses, today)
    // Con pocos gastos apuntados la semana no dice nada
    if (review.count < 3) continue
    const budget = of<{ value?: Budget }>(settings, user)[0]?.value
    const tips = spendingAdvice({ expenses, today, budget, subs: of<SubLike>(subs, user) })
    const msg = weekMessage(review, tips[0])
    jobs.push({
      user_id: user,
      payload: () => ({ ...msg, url: tips.length ? './#/insights' : './#/expenses', tag: 'money-week', key: `money-week-${today}` }),
      log: { user_id: user, tbl: 'money-week', item_id: today, remind_at: at },
    })
  }
  return jobs
}
