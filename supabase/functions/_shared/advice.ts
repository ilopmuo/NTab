/**
 * Consejos para gastar menos: mira en qué se te va el dinero y propone algo
 * concreto (como los «insights» de Copilot, Monarch o Emma y lo que harías a
 * mano con una hoja de Excel): vas camino de pasarte de un límite, una
 * categoría sube y por qué, lo que compras muchas veces, los pequeños gastos
 * que suman, límites que te vendrían bien, suscripciones que se solapan, cuánto
 * ahorras y en qué días gastas más. Cada consejo dice cuánto ahorrarías y trae
 * algo que hacer en un toque. Sin dependencias: lo usan la app, Claude, Siri y
 * el aviso de los domingos.
 */
import { CATEGORIES, fold, type Budget } from './expenses.ts'
import { NEEDS, shiftMonth } from './money.ts'

export interface Spent {
  amount: number
  date: string
  category: string
  note?: string
  unclassified?: boolean
}

export interface SubLike {
  name: string
  amount: number
  cycle: string
  active: boolean
  currency?: string
}

export type TipAction =
  /** poner (o bajar) el límite al mes de una categoría */
  | { kind: 'limit'; category: string; amount: number }
  /** un reto «Días sin…» en Hábitos → Última vez, con lo que ahorras cada día */
  | { kind: 'challenge'; name: string; costPerDay: number }
  /** ver esos gastos */
  | { kind: 'search'; query: string }
  /** ir a los pagos fijos */
  | { kind: 'subs' }

export interface Tip {
  /** estable mientras siga siendo el mismo consejo (para descartarlo) */
  id: string
  kind: 'pace' | 'rising' | 'frequent' | 'small' | 'limit' | 'overlap' | 'savings' | 'weekend'
  title: string
  body: string
  /** lo que se podría ahorrar al mes, estimado */
  saving?: number
  category?: string
  action?: TipAction
}

const r2 = (n: number) => Math.round(n * 100) / 100
const eur = (n: number) => {
  const v = Math.round(n)
  return `${v.toLocaleString('es-ES')} €`
}
/** «1,25 €» para lo pequeño (lo de cada día), «12 €» para lo demás */
const eurDay = (n: number) => (n < 10 ? `${n.toFixed(2).replace('.', ',')} €` : eur(n))
const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Otros'
const lower = (id: string) => label(id).toLowerCase()
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function daysBefore(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}
const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
const weekday = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay()
const PER_YEAR: Record<string, number> = { week: 52, month: 12, quarter: 4, year: 1 }

/** Lo de cada concepto en una lista (para «sobre todo: Glovo, 6 veces, 95 €») */
function byNote(list: Spent[]) {
  const map = new Map<string, { note: string; count: number; total: number }>()
  for (const e of list) {
    const k = fold(e.note ?? '') || '—'
    const g = map.get(k) ?? { note: e.note || 'Sin concepto', count: 0, total: 0 }
    g.count++
    g.total = r2(g.total + e.amount)
    map.set(k, g)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
}

const times = (n: number) => (n === 1 ? 'una vez' : `${n} veces`)
/** «Glovo (7 veces, 126 €)» o, si fue una vez, «Fiesta (120 €)» */
const driver = (d: { note: string; count: number; total: number }) => `${d.note} (${d.count > 1 ? `${d.count} veces, ` : ''}${eur(d.total)})`
/** La categoría en la que más pesan unos gastos */
function mainCategory(list: Spent[]) {
  const m = new Map<string, number>()
  for (const e of list) m.set(e.category, (m.get(e.category) ?? 0) + e.amount)
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** Cuánto de cada categoría en un mes */
function monthByCategory(list: Spent[], month: string) {
  const out = new Map<string, number>()
  for (const e of list) if (e.date.startsWith(month)) out.set(e.category, r2((out.get(e.category) ?? 0) + e.amount))
  return out
}

/** Media al mes de cada categoría en los meses anteriores con datos (hasta 3) */
function usual(list: Spent[], month: string) {
  const months = [1, 2, 3].map((i) => shiftMonth(month, -i)).filter((m) => list.some((e) => e.date.startsWith(m)))
  const avg = new Map<string, number>()
  if (!months.length) return { months: 0, avg }
  for (const m of months) for (const [c, v] of monthByCategory(list, m)) avg.set(c, (avg.get(c) ?? 0) + v / months.length)
  return { months: months.length, avg }
}

/** Suscripciones que suelen solaparse: varias de vídeo, de música o de nube */
const SUB_GROUPS: { id: string; label: string; words: string[] }[] = [
  { id: 'video', label: 'vídeo', words: ['netflix', 'hbo', 'disney', 'prime video', 'amazon prime', 'filmin', 'movistar', 'dazn', 'apple tv', 'skyshowtime', 'atresplayer', 'rakuten'] },
  { id: 'music', label: 'música', words: ['spotify', 'apple music', 'tidal', 'youtube music', 'deezer', 'amazon music'] },
  { id: 'cloud', label: 'almacenamiento en la nube', words: ['icloud', 'google one', 'dropbox', 'onedrive'] },
]

export interface AdviceInput {
  expenses: Spent[]
  today: string
  budget?: Budget
  subs?: SubLike[]
  /** media de lo que entra y lo que queda al mes (para la tasa de ahorro) */
  flow?: { income: number; saved: number }
}

/** Todos los consejos, del más útil (lo urgente y lo que más ahorra) al que menos */
export function spendingAdvice({ expenses, today, budget, subs = [], flow }: AdviceInput): Tip[] {
  const month = today.slice(0, 7)
  const list = expenses.filter((e) => !e.unclassified && e.date <= today)
  const tips: Tip[] = []
  const day = Number(today.slice(8, 10))
  const dim = daysIn(month)
  const now = monthByCategory(list, month)
  const { months, avg } = usual(list, month)

  // 1. Ritmo frente al límite: vas camino de pasarte
  const paced = new Set<string>()
  for (const [id, limit] of Object.entries(budget?.categories ?? {})) {
    if (!(limit > 0)) continue
    const spent = now.get(id) ?? 0
    const left = dim - day
    // Lo que queda de mes, al ritmo de siempre (una compra grande suelta no dispara el aviso)
    const projected = spent + ((avg.get(id) ?? spent / day * dim) / dim) * left
    if (day >= 5 && spent < limit && projected > limit * 1.05 && left > 0) {
      const perDay = (limit - spent) / left
      paced.add(id)
      tips.push({
        id: `pace-${id}-${month}`,
        kind: 'pace',
        category: id,
        title: `Vas camino de pasarte en ${lower(id)}`,
        body: `Llevas ${eur(spent)} de ${eur(limit)} y quedan ${left} días. Si el resto del mes va como siempre, acabarías en ${eur(projected)}; para no pasarte, ${perDay < 0.5 ? 'casi nada más este mes' : `como mucho ${eurDay(perDay)} al día`}.`,
        saving: r2(projected - limit),
        action: { kind: 'search', query: label(id) },
      })
    }
  }
  if (budget?.monthly && budget.monthly > 0) {
    const spent = [...now.values()].reduce((s, v) => s + v, 0)
    const normal = [...avg.values()].reduce((s, v) => s + v, 0)
    const projected = spent + ((normal || (spent / day) * dim) / dim) * (dim - day)
    if (day >= 5 && spent < budget.monthly && projected > budget.monthly * 1.05 && dim > day) {
      tips.push({
        id: `pace-total-${month}`,
        kind: 'pace',
        title: 'Vas camino de pasarte del presupuesto del mes',
        body: `Llevas ${eur(spent)} de ${eur(budget.monthly)} y quedan ${dim - day} días: para llegar, como mucho ${eurDay((budget.monthly - spent) / (dim - day))} al día.`,
        saving: r2(projected - budget.monthly),
      })
    }
  }

  // 2. Lo que sube este mes, y por qué (qué conceptos tiran)
  const rising = new Set<string>()
  if (months >= 2) {
    for (const [id, spent] of now) {
      const normal = avg.get(id) ?? 0
      if (id === 'otros' || paced.has(id) || spent < normal * 1.4 || spent - normal < 30) continue
      rising.add(id)
      const drivers = byNote(list.filter((e) => e.category === id && e.date.startsWith(month))).slice(0, 2)
      const hasLimit = (budget?.categories?.[id] ?? 0) > 0
      tips.push({
        id: `rising-${id}-${month}`,
        kind: 'rising',
        category: id,
        title: `${label(id)}: más que de costumbre`,
        body: `Llevas ${eur(spent)} este mes y lo normal son ${eur(normal)}. Sobre todo: ${drivers.map(driver).join(' y ')}.`,
        saving: r2(spent - normal),
        action: hasLimit ? { kind: 'search', query: label(id) } : { kind: 'limit', category: id, amount: Math.max(10, Math.round(normal / 10) * 10) },
      })
    }
  }

  // 3. Lo que compras muchas veces (sin contar la compra de casa ni los recibos)
  const since30 = daysBefore(today, 29)
  const last30 = list.filter((e) => e.date >= since30)
  const frequent = new Set<string>()
  for (const g of byNote(last30.filter((e) => !NEEDS.has(e.category)))) {
    if (g.count < 4 || g.total < 30 || g.note === 'Sin concepto') continue
    frequent.add(fold(g.note))
    tips.push({
      id: `frequent-${fold(g.note)}`,
      kind: 'frequent',
      category: mainCategory(last30.filter((e) => fold(e.note ?? '') === fold(g.note))),
      title: `${g.note}: ${g.count} veces en un mes`,
      body: `Son ${eur(g.total)} en 30 días (unos ${eur(g.total * 12)} al año). Con la mitad de veces ahorrarías ~${eur(g.total / 2)} al mes. ¿Un reto de unos días sin?`,
      saving: r2(g.total / 2),
      action: { kind: 'challenge', name: `Sin ${g.note.toLowerCase()}`, costPerDay: r2(g.total / 30) },
    })
  }

  // 4. Los pequeños gastos que suman (el «factor café»)
  const small = last30.filter((e) => e.amount < 6 && !NEEDS.has(e.category))
  const smallTotal = small.reduce((s, e) => s + e.amount, 0)
  const smallNotes = byNote(small)
  // Si casi todo es una sola cosa que ya sale como compra repetida (el café), no se repite
  const others = smallNotes.filter((g) => !frequent.has(fold(g.note))).reduce((s, g) => s + g.total, 0)
  if (small.length >= 12 && smallTotal >= 30 && others >= smallTotal * 0.3) {
    const top = smallNotes.slice(0, 3)
    tips.push({
      id: `small-${month}`,
      kind: 'small',
      title: 'Los pequeños gastos suman',
      body: `${small.length} compras de menos de 6 € en 30 días: ${eur(smallTotal)} (unos ${eur(smallTotal * 12)} al año). Lo que más: ${top.map((t) => `${t.note} (${times(t.count)})`).join(', ')}.`,
      saving: r2(smallTotal / 3),
      category: mainCategory(small),
    })
  }

  // 5. Límites que te vendrían bien: categorías que pesan y no tienen
  if (months >= 2) {
    const candidates = [...avg.entries()]
      .filter(([id, v]) => id !== 'otros' && !NEEDS.has(id) && v >= 60 && !((budget?.categories?.[id] ?? 0) > 0) && !rising.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
    for (const [id, v] of candidates) {
      const limit = Math.max(10, Math.round((v * 0.85) / 10) * 10)
      tips.push({
        id: `limit-${id}`,
        kind: 'limit',
        category: id,
        title: `Ponle un límite a ${lower(id)}`,
        body: `Sueles gastar ${eur(v)} al mes. Con un límite de ${eur(limit)} ahorrarías unos ${eur(v - limit)} al mes, y LUNO te avisa al llegar al 80 %.`,
        saving: r2(v - limit),
        action: { kind: 'limit', category: id, amount: limit },
      })
    }
  }

  // 6. Suscripciones que se solapan
  for (const g of SUB_GROUPS) {
    const hits = subs.filter((s) => s.active && (s.currency ?? 'EUR') === 'EUR' && g.words.some((w) => ` ${fold(s.name)} `.includes(` ${w} `)))
    if (hits.length < 2) continue
    const monthly = hits.map((s) => (s.amount * (PER_YEAR[s.cycle] ?? 12)) / 12)
    const total = monthly.reduce((s, v) => s + v, 0)
    const keep = Math.max(...monthly)
    tips.push({
      id: `overlap-${g.id}-${hits.length}`,
      kind: 'overlap',
      title: `${hits.length} suscripciones de ${g.label}`,
      body: `${hits.map((s) => s.name).join(', ')}: ${eur(total)} al mes. Quedarte con una (o ir turnándolas por meses) ahorra ~${eur(total - keep)} al mes.`,
      saving: r2(total - keep),
      action: { kind: 'subs' },
    })
  }

  // 7. Cuánto ahorras de lo que entra
  if (flow && flow.income > 0) {
    const rate = flow.saved / flow.income
    if (rate < 0.1) {
      const need = flow.income * 0.2 - flow.saved
      const wants = [...avg.entries()].filter(([id]) => !NEEDS.has(id) && id !== 'otros').sort((a, b) => b[1] - a[1]).slice(0, 2)
      const totalWants = wants.reduce((s, [, v]) => s + v, 0)
      tips.push({
        id: `savings-${month}`,
        kind: 'savings',
        title: rate < 0 ? 'Sale más de lo que entra' : `Ahorras el ${Math.round(rate * 100)} % de lo que entra`,
        body: `Para apartar el 20 % (lo que dice la regla 50/30/20) harían falta unos ${eur(need)} más al mes.${
          totalWants > 0 ? ` Por ejemplo: ${wants.map(([id, v]) => `${eur(Math.min(v * 0.5, (need * v) / totalWants))} menos en ${lower(id)}`).join(' y ')}.` : ''
        }`,
        saving: r2(need),
      })
    }
  }

  // 8. En qué días se va: el fin de semana
  const since60 = daysBefore(today, 59)
  const fun = list.filter((e) => e.date >= since60 && !NEEDS.has(e.category) && e.category !== 'otros')
  const funTotal = fun.reduce((s, e) => s + e.amount, 0)
  const weekend = fun.filter((e) => [0, 5, 6].includes(weekday(e.date))).reduce((s, e) => s + e.amount, 0)
  if (funTotal >= 150 && weekend / funTotal >= 0.65) {
    tips.push({
      id: `weekend-${month}`,
      kind: 'weekend',
      title: 'El fin de semana es cuando más gastas',
      body: `El ${Math.round((weekend / funTotal) * 100)} % de lo que no es del día a día se va de viernes a domingo (unos ${eur(weekend / (60 / 7))} cada fin de semana). Ponerte un tope el viernes ayuda.`,
    })
  }

  const order: Record<Tip['kind'], number> = { pace: 0, savings: 1, rising: 2, overlap: 3, frequent: 4, limit: 5, small: 6, weekend: 7 }
  return tips.sort((a, b) => order[a.kind] - order[b.kind] || (b.saving ?? 0) - (a.saving ?? 0))
}

/** Lo que podrías ahorrar al mes con los consejos (sin contar dos veces lo de la misma categoría) */
export function totalSaving(tips: Tip[]) {
  // De cada categoría, el consejo que más ahorra (lo de Glovo ya está dentro de «Comer fuera sube»)
  const best = new Map<string, number>()
  for (const t of tips) {
    if (!t.saving || t.kind === 'pace' || t.kind === 'savings') continue
    const k = t.category ?? t.id
    best.set(k, Math.max(best.get(k) ?? 0, t.saving))
  }
  return Math.round([...best.values()].reduce((s, v) => s + v, 0))
}

// ── Una categoría, a fondo ─────────────────────────────────────

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/**
 * Todo de una categoría: los últimos 6 meses, lo de este mes frente a lo
 * normal, en qué conceptos se va, cuántas compras y de cuánto, y qué días.
 */
export function categoryReport(expenses: Spent[], category: string, today: string) {
  const month = today.slice(0, 7)
  const list = expenses.filter((e) => e.category === category && !e.unclassified && e.date <= today)
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((m) => ({ month: m, total: r2(list.filter((e) => e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0)) }))
  const prev = months.slice(0, 5).filter((m) => m.total > 0)
  const normal = prev.length ? r2(prev.slice(-3).reduce((s, m) => s + m.total, 0) / Math.min(3, prev.length)) : 0
  const since = daysBefore(today, 89)
  const recent = list.filter((e) => e.date >= since)
  const days = WEEKDAYS.map((d, i) => ({ day: d, total: r2(recent.filter((e) => weekday(e.date) === i).reduce((s, e) => s + e.amount, 0)) }))
  // De lunes a domingo
  days.push(days.shift()!)
  return {
    category,
    label: label(category),
    months,
    thisMonth: months[5].total,
    normal,
    count: recent.length,
    ticket: recent.length ? r2(recent.reduce((s, e) => s + e.amount, 0) / recent.length) : 0,
    notes: byNote(recent).slice(0, 6),
    days,
  }
}

/** Para el aviso de los domingos: la semana (lunes a hoy) frente a una semana normal */
export function weekReview(expenses: Spent[], today: string) {
  const dow = (weekday(today) + 6) % 7
  const start = daysBefore(today, dow)
  const list = expenses.filter((e) => !e.unclassified && e.date <= today)
  const week = list.filter((e) => e.date >= start)
  const total = r2(week.reduce((s, e) => s + e.amount, 0))
  // Las 8 semanas anteriores
  const from = daysBefore(start, 56)
  const before = list.filter((e) => e.date >= from && e.date < start)
  // Con menos de 3 semanas de antes con algo apuntado, no hay «semana normal» con la que comparar
  const weeks = new Set(before.map((e) => Math.floor((Date.parse(start) - Date.parse(e.date)) / (7 * 864e5)))).size
  const normal = weeks >= 3 ? r2(before.reduce((s, e) => s + e.amount, 0) / 8) : 0
  const cats = new Map<string, number>()
  for (const e of week) cats.set(e.category, r2((cats.get(e.category) ?? 0) + e.amount))
  const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]
  return { start, total, normal, count: week.length, top: top ? { category: top[0], label: label(top[0]), total: top[1] } : undefined }
}

/** El texto del aviso de los domingos */
export function weekMessage(w: ReturnType<typeof weekReview>, tip?: Tip) {
  const vs = w.normal > 0 ? (w.total > w.normal * 1.15 ? `, más que una semana normal (${eur(w.normal)})` : w.total < w.normal * 0.85 ? `, menos que una semana normal (${eur(w.normal)}) 👏` : ', como una semana normal') : ''
  return {
    title: 'Tu semana en gastos',
    body: `${cap(eur(w.total))} esta semana${vs}.${w.top ? ` Lo que más: ${lower(w.top.category)} (${eur(w.top.total)}).` : ''}${tip ? ` ${tip.title}.` : ''}`,
  }
}
