/**
 * Casa compartida (piso con compañeros): miembros, tareas de casa con turnos
 * (como Flatastic o Sweepy), la lista de la compra común y las cuentas del
 * piso (como Splitwise). La usan la Edge Function `casa`, la app y el conector
 * de Claude. Sin dependencias.
 *
 * Todo se guarda como elementos sueltos ({ id, kind, data }); los cambios
 * llegan como operaciones que se aplican igual en el servidor y, al momento,
 * en la app (antes de que conteste el servidor).
 */

/** YYYY-MM-DD + n días (aquí, para no depender de nada) */
function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export type HouseKind = 'member' | 'chore' | 'shop' | 'expense'

export interface Member {
  name: string
  order: number
}

/** Una tarea de casa: de una vez o que se repite, por turnos entre quien se diga */
export interface Chore {
  title: string
  /** cada cuántos días se repite (sin: una vez) */
  every?: number
  /** quién la hace, por turnos (ids de miembros); vacío: quien pueda */
  rotation: string[]
  /** a quién le toca: índice en `rotation` */
  turn: number
  /** cuándo toca (YYYY-MM-DD); sin fecha: cuando se pueda */
  due?: string
  /** dónde: cocina, baño… */
  room?: string
  /** las de una vez, al hacerlas */
  done?: boolean
  /** quién la hizo y cuándo (lo último primero) */
  log?: { by: string; at: number }[]
  by?: string
  at: number
}

export interface ShopItem {
  name: string
  qty?: string
  by?: string
  done?: boolean
  doneBy?: string
  /** cuándo se compró */
  doneAt?: number
  at: number
}

/** Un gasto del piso: quién pagó y entre quiénes se reparte (a partes iguales) */
export interface Expense {
  what: string
  amount: number
  paidBy: string
  /** entre quiénes (ids); vacío: todos */
  split: string[]
  /** YYYY-MM-DD */
  day: string
  /** un pago para saldar cuentas («Ana le paga 12 € a Luis») */
  settle?: boolean
  at: number
}

export interface HouseItem<T = unknown> {
  id: string
  kind: HouseKind
  data: T
}

export type HouseOp =
  | { op: 'put'; kind: HouseKind; id: string; data: Record<string, unknown> }
  | { op: 'del'; id: string }
  /** tarea hecha por `by` el día `day`: pasa el turno y, si se repite, la siguiente fecha */
  | { op: 'done'; id: string; by: string; day: string; at: number }
  | { op: 'name'; name: string }

export const KINDS: HouseKind[] = ['member', 'chore', 'shop', 'expense']
export const MAX_ITEMS = 3000
export const MAX_OPS = 60

const YMD = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[A-Za-z0-9_-]{1,64}$/
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined)
const ids = (v: unknown, max = 20) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && ID.test(x)))].slice(0, max) : [])
const time = (v: unknown) => int(v, 0, 9e15) ?? 0
const opt = <T>(v: T | undefined | '' | false) => (v === undefined || v === '' || v === false ? undefined : v)

/** Deja solo lo que cada tipo admite, con límites (lo que llega de fuera no se guarda tal cual) */
export function sanitize(kind: HouseKind, d: Record<string, unknown>): Record<string, unknown> | null {
  const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))
  if (kind === 'member') {
    const name = str(d.name, 40)
    return name ? { name, order: int(d.order, 0, 1000) ?? 0 } : null
  }
  if (kind === 'chore') {
    const title = str(d.title, 120)
    if (!title) return null
    const log = Array.isArray(d.log)
      ? d.log
          .filter((x): x is { by: string; at: number } => !!x && typeof x === 'object' && ID.test(String((x as { by?: unknown }).by)))
          .map((x) => ({ by: x.by, at: time(x.at) }))
          .slice(0, 30)
      : undefined
    return clean({
      title,
      every: int(d.every, 1, 365),
      rotation: ids(d.rotation),
      turn: int(d.turn, 0, 100) ?? 0,
      due: typeof d.due === 'string' && YMD.test(d.due) ? d.due : undefined,
      room: opt(str(d.room, 40)),
      done: opt(d.done === true),
      log: log?.length ? log : undefined,
      by: typeof d.by === 'string' && ID.test(d.by) ? d.by : undefined,
      at: time(d.at),
    })
  }
  if (kind === 'shop') {
    const name = str(d.name, 120)
    if (!name) return null
    return clean({
      name,
      qty: opt(str(d.qty, 30)),
      by: typeof d.by === 'string' && ID.test(d.by) ? d.by : undefined,
      done: opt(d.done === true),
      doneBy: d.done === true && typeof d.doneBy === 'string' && ID.test(d.doneBy) ? d.doneBy : undefined,
      doneAt: d.done === true ? opt(time(d.doneAt)) : undefined,
      at: time(d.at),
    })
  }
  const what = str(d.what, 120)
  const amount = typeof d.amount === 'number' && Number.isFinite(d.amount) ? Math.round(Math.min(100_000, Math.max(0, d.amount)) * 100) / 100 : 0
  if (!what || !amount || typeof d.paidBy !== 'string' || !ID.test(d.paidBy)) return null
  return clean({
    what,
    amount,
    paidBy: d.paidBy,
    split: ids(d.split),
    day: typeof d.day === 'string' && YMD.test(d.day) ? d.day : '1970-01-01',
    settle: opt(d.settle === true),
    at: time(d.at),
  })
}

/** Las tareas que se repiten pasan el turno al siguiente del que la ha hecho y vuelven a los `every` días */
export function completeChore(c: Chore, by: string, day: string, at: number): Chore {
  const log = [{ by, at }, ...(c.log ?? [])].slice(0, 30)
  if (!c.every) return { ...c, done: true, log }
  const n = c.rotation.length
  const from = c.rotation.indexOf(by)
  const turn = n ? ((from >= 0 ? from : c.turn) + 1) % n : 0
  return { ...c, done: undefined, turn, due: addDays(day, c.every), log }
}

/**
 * Aplica operaciones sobre los elementos. Devuelve la lista nueva y los ids
 * cambiados (para guardar solo esos). Lo que no es válido se ignora.
 */
export function applyOps(items: HouseItem[], ops: HouseOp[]): { items: HouseItem[]; changed: Set<string>; deleted: Set<string>; name?: string } {
  const byId = new Map(items.map((i) => [i.id, i]))
  const changed = new Set<string>()
  const deleted = new Set<string>()
  let name: string | undefined
  for (const op of ops.slice(0, MAX_OPS)) {
    if (!op || typeof op !== 'object') continue
    if (op.op === 'name') {
      const n = str(op.name, 60)
      if (n) name = n
    } else if (op.op === 'del') {
      if (byId.delete(op.id)) {
        deleted.add(op.id)
        changed.delete(op.id)
      }
    } else if (op.op === 'put') {
      if (!ID.test(String(op.id)) || !KINDS.includes(op.kind)) continue
      const prev = byId.get(op.id)
      if (prev && prev.kind !== op.kind) continue
      if (!prev && byId.size >= MAX_ITEMS) continue
      const data = sanitize(op.kind, op.data ?? {})
      if (!data) continue
      byId.set(op.id, { id: op.id, kind: op.kind, data })
      changed.add(op.id)
      deleted.delete(op.id)
    } else if (op.op === 'done') {
      const prev = byId.get(op.id)
      if (!prev || prev.kind !== 'chore' || !ID.test(String(op.by)) || !YMD.test(String(op.day))) continue
      const next = completeChore(prev.data as Chore, op.by, op.day, time(op.at))
      byId.set(op.id, { ...prev, data: sanitize('chore', next as unknown as Record<string, unknown>) ?? prev.data })
      changed.add(op.id)
    }
  }
  return { items: [...byId.values()], changed, deleted, name }
}

/** Lo viejo que ya no hace falta: lo comprado hace más de 2 semanas y las tareas de una vez hechas hace más de un mes */
export function stale(items: HouseItem[], now: number): string[] {
  return items
    .filter((i) => {
      if (i.kind === 'shop') {
        const s = i.data as ShopItem
        return !!s.done && (s.doneAt ?? s.at) < now - 14 * 864e5
      }
      if (i.kind === 'chore') {
        const c = i.data as Chore
        return !!c.done && (c.log?.[0]?.at ?? c.at) < now - 30 * 864e5
      }
      return false
    })
    .map((i) => i.id)
}

// ── Lo que se enseña ────────────────────────────────────────

export const members = (items: HouseItem[]) =>
  items
    .filter((i): i is HouseItem<Member> => i.kind === 'member')
    .sort((a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name, 'es'))

export const chores = (items: HouseItem[]) => items.filter((i): i is HouseItem<Chore> => i.kind === 'chore')
export const shopItems = (items: HouseItem[]) => items.filter((i): i is HouseItem<ShopItem> => i.kind === 'shop')
export const expenses = (items: HouseItem[]) => items.filter((i): i is HouseItem<Expense> => i.kind === 'expense')

/** A quién le toca (el turno salta a quien ya no está en el piso); sin turnos: nadie en concreto */
export function whoseTurn(c: Chore, memberIds: string[]): string | undefined {
  const live = c.rotation.filter((id) => memberIds.includes(id))
  if (!live.length) return undefined
  const current = c.rotation[c.turn % c.rotation.length]
  if (memberIds.includes(current)) return current
  // El de su turno se fue: el siguiente que siga
  for (let k = 1; k <= c.rotation.length; k++) {
    const id = c.rotation[(c.turn + k) % c.rotation.length]
    if (memberIds.includes(id)) return id
  }
  return live[0]
}

/** «atrasada», «hoy», «pronto» (en 3 días o menos), «luego» o sin fecha */
export function choreStatus(c: Chore, today: string): 'done' | 'overdue' | 'today' | 'soon' | 'later' | 'anytime' {
  if (c.done) return 'done'
  if (!c.due) return 'anytime'
  if (c.due < today) return 'overdue'
  if (c.due === today) return 'today'
  return c.due <= addDays(today, 3) ? 'soon' : 'later'
}

/** Lo que te toca: las tareas de tu turno para hoy o atrasadas */
export function myChores(items: HouseItem[], me: string, today: string) {
  const ids = members(items).map((m) => m.id)
  return chores(items).filter((c) => {
    const s = choreStatus(c.data, today)
    return (s === 'overdue' || s === 'today') && whoseTurn(c.data, ids) === me
  })
}

/** Cuántas tareas ha hecho cada uno en los últimos `days` días (el reparto, como los puntos de Flatastic) */
export function fairness(items: HouseItem[], now: number, days = 30): Map<string, number> {
  const since = now - days * 864e5
  const out = new Map(members(items).map((m) => [m.id, 0]))
  for (const c of chores(items)) for (const l of c.data.log ?? []) if (l.at >= since && out.has(l.by)) out.set(l.by, out.get(l.by)! + 1)
  return out
}

const cents = (n: number) => Math.round(n * 100)

/** Lo que cada uno ha puesto de más (+) o de menos (−), en euros */
export function balances(items: HouseItem[]): Map<string, number> {
  const all = members(items).map((m) => m.id)
  const out = new Map<string, number>(all.map((id) => [id, 0]))
  for (const e of expenses(items)) {
    const split = e.data.split.length ? e.data.split : all
    if (!split.length) continue
    const amount = cents(e.data.amount)
    out.set(e.data.paidBy, (out.get(e.data.paidBy) ?? 0) + amount)
    // Reparto en céntimos: el resto, a los primeros
    const share = Math.floor(amount / split.length)
    let rest = amount - share * split.length
    for (const id of split) {
      out.set(id, (out.get(id) ?? 0) - share - (rest > 0 ? 1 : 0))
      if (rest > 0) rest--
    }
  }
  return new Map([...out].map(([id, c]) => [id, c / 100]))
}

/** Cómo saldar las cuentas con los menos pagos posibles: quién paga a quién y cuánto */
export function settleUp(bal: Map<string, number>): { from: string; to: string; amount: number }[] {
  const debt = [...bal].filter(([, v]) => cents(v) < 0).map(([id, v]) => ({ id, c: -cents(v) })).sort((a, b) => b.c - a.c)
  const credit = [...bal].filter(([, v]) => cents(v) > 0).map(([id, v]) => ({ id, c: cents(v) })).sort((a, b) => b.c - a.c)
  const out: { from: string; to: string; amount: number }[] = []
  let i = 0
  let j = 0
  while (i < debt.length && j < credit.length) {
    const c = Math.min(debt[i].c, credit[j].c)
    if (c > 0) out.push({ from: debt[i].id, to: credit[j].id, amount: c / 100 })
    debt[i].c -= c
    credit[j].c -= c
    if (!debt[i].c) i++
    if (!credit[j].c) j++
  }
  return out
}

/** Ideas para empezar (como las tareas típicas de Sweepy o Tody): cada cuántos días */
export const CHORE_IDEAS: { title: string; every: number; room?: string }[] = [
  { title: 'Sacar la basura', every: 2, room: 'Cocina' },
  { title: 'Bajar el reciclaje', every: 7, room: 'Cocina' },
  { title: 'Limpiar el baño', every: 7, room: 'Baño' },
  { title: 'Limpiar la cocina', every: 7, room: 'Cocina' },
  { title: 'Pasar la aspiradora', every: 7 },
  { title: 'Fregar el suelo', every: 14 },
  { title: 'Limpiar la nevera', every: 30, room: 'Cocina' },
  { title: 'Regar las plantas', every: 4 },
]
