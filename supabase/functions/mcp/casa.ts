/**
 * La casa compartida para Claude: qué toca a quién, la compra común y las
 * cuentas del piso, y apuntar o marcar cosas. Funciones puras: el piso llega
 * ya leído (ver index.ts) y devuelven las operaciones a guardar.
 */
import { normalize } from '../_shared/text.ts'
import { parseItems } from '../_shared/shopping.ts'
import { balances, choreStatus, chores, expenses, fairness, members, settleUp, shopItems, usualId, whoseTurn, type Chore, type HouseItem, type HouseOp, type Usual } from '../_shared/house.ts'

export interface HouseCtx {
  name: string
  items: HouseItem[]
  /** quién es el usuario en el piso (id de miembro) */
  me: string
}

type Args = Record<string, unknown>

const euro = (n: number) => `${n.toFixed(2).replace('.', ',').replace(/,00$/, '')} €`
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function namer(h: HouseCtx) {
  const byId = new Map(members(h.items).map((m) => [m.id, m.data.name]))
  return (id: string | undefined, fallback = 'alguien') => (!id ? fallback : id === h.me ? 'tú' : (byId.get(id) ?? fallback))
}

/** Un miembro por su nombre («Ana», «yo») */
function memberByName(h: HouseCtx, name: string): string | undefined {
  const n = normalize(name)
  if (!n) return undefined
  if (['yo', 'mi', 'tu', 'el usuario'].includes(n)) return h.me
  const ms = members(h.items)
  return (ms.find((m) => normalize(m.data.name) === n) ?? ms.find((m) => normalize(m.data.name).startsWith(n) || n.startsWith(normalize(m.data.name))))?.id
}

function choreByTitle(h: HouseCtx, title: string) {
  const n = normalize(title)
  const open = chores(h.items).filter((c) => !c.data.done)
  return open.find((c) => normalize(c.data.title) === n) ?? open.find((c) => normalize(c.data.title).includes(n) || n.includes(normalize(c.data.title)))
}

const everyText = (c: Chore) => (c.every ? (c.every === 1 ? 'cada día' : c.every === 7 ? 'cada semana' : `cada ${c.every} días`) : 'una vez')

/** Quién debe a quién, contado desde el usuario */
function moneyLines(h: HouseCtx) {
  const name = namer(h)
  return settleUp(balances(h.items)).map((p) => (p.from === h.me ? `debes ${euro(p.amount)} a ${name(p.to)}` : p.to === h.me ? `${name(p.from)} te debe ${euro(p.amount)}` : `${name(p.from)} debe ${euro(p.amount)} a ${name(p.to)}`))
}

/** Unas líneas para ver_resumen: lo que te toca, la compra común y las cuentas */
export function houseSummary(h: HouseCtx, today: string): string[] {
  const name = namer(h)
  const ids = members(h.items).map((m) => m.id)
  const open = chores(h.items).filter((c) => !c.data.done)
  const urgent = open.filter((c) => ['overdue', 'today'].includes(choreStatus(c.data, today)))
  const mine = urgent.filter((c) => whoseTurn(c.data, ids) === h.me)
  const others = urgent.filter((c) => whoseTurn(c.data, ids) !== h.me)
  const shop = shopItems(h.items).filter((i) => !i.data.done)
  const when = (c: Chore) => (c.due && c.due < today ? `atrasada desde ${c.due}` : 'hoy')
  const lines = [
    `\nCASA COMPARTIDA «${h.name}» (${members(h.items).map((m) => name(m.id)).join(', ')}) — tareas de casa por turnos, compra común y cuentas del piso; usa ver_casa, hecho_en_casa y anadir_a_casa:`,
    mine.length ? `- Te toca: ${mine.map((c) => `${c.data.title} (${when(c.data)})`).join('; ')}` : '- Hoy no te toca nada en casa.',
  ]
  if (others.length) lines.push(`- A los demás: ${others.map((c) => `${c.data.title} (${name(whoseTurn(c.data, ids), 'quien pueda')}, ${when(c.data)})`).join('; ')}`)
  if (shop.length) lines.push(`- Compra del piso (${shop.length}): ${shop.map((i) => i.data.name).join(', ')}`)
  const money = moneyLines(h)
  if (money.length) lines.push(`- Cuentas: ${money.join('; ')}`)
  return lines
}

/** Para Siri: lo que te toca en casa (y, con `chore`, a quién le toca eso) */
export function houseVoice(h: HouseCtx, today: string, chore?: string): string {
  const name = namer(h)
  const ids = members(h.items).map((m) => m.id)
  const list = (xs: string[]) => (xs.length < 2 ? xs[0] : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)
  const when = (c: Chore) => (c.due && c.due < today ? ' (atrasada)' : '')
  if (chore) {
    const c = choreByTitle(h, chore)
    if (!c) return `No hay ninguna tarea de casa que se parezca a «${chore}».`
    const who = whoseTurn(c.data, ids)
    return who === h.me ? `Te toca a ti${when(c.data)}.` : who ? `Le toca a ${name(who)}${when(c.data)}.` : 'Le toca a quien pueda.'
  }
  const urgent = chores(h.items).filter((c) => !c.data.done && ['overdue', 'today'].includes(choreStatus(c.data, today)))
  const mine = urgent.filter((c) => whoseTurn(c.data, ids) === h.me)
  const shop = shopItems(h.items).filter((i) => !i.data.done).length
  return `${mine.length ? `En casa te toca: ${list(mine.map((c) => `${c.data.title}${when(c.data)}`))}.` : 'Hoy no te toca nada en casa.'}${shop ? ` En la compra del piso hay ${shop === 1 ? 'una cosa' : `${shop} cosas`}.` : ''}`
}

/** Todo el piso para ver_casa */
export function houseView(h: HouseCtx, today: string, now: number): string {
  const name = namer(h)
  const ids = members(h.items).map((m) => m.id)
  const open = chores(h.items)
    .filter((c) => !c.data.done)
    .sort((a, b) => (a.data.due ?? '9999').localeCompare(b.data.due ?? '9999'))
  const shop = shopItems(h.items).filter((i) => !i.data.done)
  const out = [`CASA «${h.name}»: ${members(h.items).map((m) => name(m.id)).join(', ')}. Hoy es ${today}.`, `\nTAREAS DE CASA (${open.length}):`]
  for (const c of open) {
    const who = whoseTurn(c.data, ids)
    const status = choreStatus(c.data, today)
    const due = c.data.due ? (status === 'overdue' ? `atrasada desde ${c.data.due}` : `toca el ${c.data.due}`) : 'sin fecha'
    out.push(`- ${c.data.title}: ${who ? (who === h.me ? 'te toca a ti' : `le toca a ${name(who)}`) : 'quien pueda'} · ${everyText(c.data)} · ${due}${c.data.room ? ` · ${c.data.room}` : ''}`)
  }
  if (!open.length) out.push('(ninguna)')
  out.push(`\nCOMPRA DEL PISO (${shop.length}):`, shop.length ? shop.map((i) => `- ${i.data.qty ? `${i.data.qty} ` : ''}${i.data.name} (apuntó ${name(i.data.by)})`).join('\n') : '(vacía)')
  const money = moneyLines(h)
  const spent = expenses(h.items).filter((e) => !e.data.settle).length
  out.push(`\nCUENTAS: ${money.length ? money.join('; ') : spent ? 'están en paz' : 'sin gastos apuntados'}.`)
  const fair = [...fairness(h.items, now)].map(([id, n]) => `${name(id)} ${n}`)
  if (fair.length > 1) out.push(`REPARTO (tareas hechas en 30 días): ${fair.join(', ')}.`)
  return out.join('\n')
}

/** anadir_a_casa: cosas a la compra común, una tarea de casa (por turnos) o un gasto del piso */
export function houseAdd(h: HouseCtx, args: Args, env: { now: number; today: string; newId: () => string }): { ops: HouseOp[]; report: string } {
  const tipo = str(args.tipo)
  const texto = str(args.texto)
  const name = namer(h)
  if (!texto) return { ops: [], report: 'Falta el texto: qué comprar, qué tarea o qué gasto.' }
  if (tipo === 'compra') {
    const have = new Set(shopItems(h.items).filter((i) => !i.data.done).map((i) => normalize(i.data.name)))
    const fresh = parseItems(texto).filter((p) => !have.has(normalize(p.name)))
    if (!fresh.length) return { ops: [], report: 'Ya estaba todo en la compra del piso.' }
    // Sin precio dicho, el de la última vez
    const lastPrice = (name: string) => (h.items.find((i) => i.id === usualId(name))?.data as Usual | undefined)?.price
    return {
      ops: fresh.map((p) => {
        const price = p.price ?? lastPrice(p.name)
        return { op: 'put', kind: 'shop', id: env.newId(), data: { name: p.name, ...(p.qty ? { qty: p.qty } : {}), ...(price ? { price } : {}), by: h.me, at: env.now } }
      }),
      report: `Apuntado en la compra del piso: ${fresh.map((p) => p.name).join(', ')}. Lo ve todo el piso.`,
    }
  }
  if (tipo === 'tarea') {
    const every = typeof args.cada_dias === 'number' && args.cada_dias >= 1 ? Math.min(365, Math.round(args.cada_dias)) : undefined
    const para = str(args.para)
    const who = para ? memberByName(h, para) : undefined
    if (para && !who) return { ops: [], report: `No hay nadie que se llame «${para}» en el piso (están ${members(h.items).map((m) => name(m.id)).join(', ')}).` }
    const all = members(h.items).map((m) => m.id)
    // Las que se repiten van por turnos entre todos (empezando por quien se diga); las de una vez, para quien se diga o quien pueda
    const rotation = every ? (who ? [who, ...all.filter((id) => id !== who)] : all) : who ? [who] : []
    const fecha = typeof args.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.fecha) ? args.fecha : every ? env.today : undefined
    const data: Chore = { title: texto, rotation, turn: 0, by: h.me, at: env.now, ...(every ? { every } : {}), ...(fecha ? { due: fecha } : {}) }
    const turno = rotation.length > 1 ? `por turnos (empieza ${name(rotation[0])})` : rotation.length ? `para ${name(rotation[0])}` : 'para quien pueda'
    return { ops: [{ op: 'put', kind: 'chore', id: env.newId(), data: data as unknown as Record<string, unknown> }], report: `Tarea de casa: «${texto}», ${everyText(data)}, ${turno}${fecha ? `, desde el ${fecha}` : ''}.` }
  }
  if (tipo === 'gasto') {
    const importe = typeof args.importe === 'number' ? args.importe : Number(String(args.importe ?? '').replace(',', '.'))
    if (!(importe > 0)) return { ops: [], report: 'Falta el importe del gasto.' }
    const pago = str(args.pago) ? memberByName(h, str(args.pago)) : h.me
    if (!pago) return { ops: [], report: `No hay nadie que se llame «${str(args.pago)}» en el piso.` }
    const entre = Array.isArray(args.entre) ? args.entre.map((n) => memberByName(h, String(n))).filter((x): x is string => !!x) : []
    return {
      ops: [{ op: 'put', kind: 'expense', id: env.newId(), data: { what: texto, amount: Math.round(importe * 100) / 100, paidBy: pago, split: entre, day: env.today, at: env.now } }],
      report: `Gasto del piso: ${texto}, ${euro(importe)}, pagó ${name(pago)}, ${entre.length ? `entre ${entre.map((id) => name(id)).join(', ')}` : 'entre todos'}.`,
    }
  }
  return { ops: [], report: 'tipo tiene que ser «compra», «tarea» o «gasto».' }
}

/**
 * Lo dictado a Siri para la compra del piso: «piso: leche y pan», «compra del
 * piso, papel higiénico». Devuelve lo que hay que comprar o null si no va al piso.
 */
export function pisoText(text: string): string | null {
  const m = /^\s*(?:(?:a\s+)?la\s+)?(?:compra\s+(?:del|de\s+el)\s+piso|para\s+el\s+piso|piso)\s*[:,.]?\s+(.+)$/is.exec(text)
  return m ? m[1].trim() : null
}

/** hecho_en_casa: marca una tarea de casa como hecha (por el usuario o por quien se diga) y pasa el turno */
export function houseDone(h: HouseCtx, args: Args, env: { now: number; today: string }): { ops: HouseOp[]; report: string } {
  const c = choreByTitle(h, str(args.tarea))
  if (!c) return { ops: [], report: `No encuentro esa tarea de casa. Hay: ${chores(h.items).filter((x) => !x.data.done).map((x) => x.data.title).join(', ') || 'ninguna'}.` }
  const by = str(args.quien) ? memberByName(h, str(args.quien)) : h.me
  if (!by) return { ops: [], report: `No hay nadie que se llame «${str(args.quien)}» en el piso.` }
  const name = namer(h)
  const ids = members(h.items).map((m) => m.id)
  const n = c.data.rotation.length
  const from = c.data.rotation.indexOf(by)
  const next = c.data.every && n ? c.data.rotation[((from >= 0 ? from : c.data.turn) + 1) % n] : undefined
  const after = next && ids.includes(next) ? `; la próxima le toca a ${name(next)}` : ''
  return { ops: [{ op: 'done', id: c.id, by, day: env.today, at: env.now }], report: `Hecho: «${c.data.title}» (${name(by)})${after}.` }
}
