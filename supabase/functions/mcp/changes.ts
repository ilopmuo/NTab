/**
 * ver_novedades: qué ha cambiado en sus tareas desde la última vez que lo
 * preguntó este asistente (tareas nuevas, hechas, borradas, con otra fecha,
 * que ahora esperan a alguien…) y quién lo hizo. Para que Hermes no tenga que
 * leer el resumen entero cada vez ni le avise de algo que ya ha cambiado.
 *
 * LUNO solo guarda cómo están las cosas ahora, así que en cada revisión se
 * apunta una foto mínima de las tareas pendientes de ese asistente (ajuste
 * `agentSeen:<asistente>`: id, título, fecha, hora y a quién espera): con ella
 * se sabe, la vez siguiente, de qué fecha a qué fecha se movió algo. De las
 * hechas del último mes solo se guarda el id: así una tarea que reaparece se
 * sabe si estaba hecha (reabierta) o si no se había visto (llegó sin conexión
 * o volvió de la papelera). No es un cambio de sus cosas: no entra en el
 * historial ni se deshace. Con «desde» o sin_marcar solo se mira.
 */
import { fingerprint, readLog } from './agentLog.ts'
import { noticesSince, whenLabel } from './notices.ts'
import { Index, relDay, type Env, type Row, type Task } from './ntab.ts'
import { addDays, hhmmIn, ymdIn, zonedToUtc } from '../_shared/time.ts'

export const SEEN_PREFIX = 'agentSeen:'
/** Lo que se recuerda de cada tarea pendiente: id, título, fecha, hora, a quién espera */
type Snap = [string, string, string, string, string]
interface Seen {
  at: number
  tasks: Snap[]
  /** ids de las hechas en la revisión (completadas desde `doneFrom`); las revisiones de antes no lo tienen */
  done?: string[]
  doneFrom?: number
}

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : 0)
const MAX_LINES = 25
/** De las hechas se recuerdan las del último mes, como mucho estas */
const DONE_DAYS = 30
const MAX_DONE = 1000

const snap = (t: Task): Snap => [t.id, t.title.slice(0, 80), t.dueDate ?? '', t.dueTime ?? '', t.waitingFor ?? '']
const seenKey = (env: Env) => `${SEEN_PREFIX}${env.via || 'asistente'}`

function readSeen(rows: Row[], env: Env): Seen | undefined {
  const v = rows.find((r) => r.tbl === 'settings' && r.id === seenKey(env))?.data.value as Seen | undefined
  return v && typeof v.at === 'number' && Array.isArray(v.tasks) ? v : undefined
}

/**
 * Qué asistente dejó cada tarea como está ahora: el de su última operación
 * (por hora, sin las deshechas) desde `since`, y solo si la tarea sigue como
 * la dejó (o sigue borrada, si la borró). Si alguien la cambió después, no se
 * sabe quién: no sale aquí.
 */
function changedBy(rows: Row[], since: number): Map<string, string> {
  const last = new Map<string, { at: number; via: string; after: string | null }>()
  for (const e of readLog(rows)) {
    if (e.at < since || e.undone) continue
    for (const c of e.changes) {
      if (c.tbl !== 'tasks') continue
      const prev = last.get(c.id)
      if (!prev || e.at >= prev.at) last.set(c.id, { at: e.at, via: e.via, after: c.after })
    }
  }
  const current = new Map(rows.filter((r) => r.tbl === 'tasks').map((r) => [r.id, r.data]))
  const by = new Map<string, string>()
  for (const [id, l] of last) if (fingerprint(current.get(id) ?? null) === l.after) by.set(id, l.via)
  return by
}

/**
 * Una hora de su zona → instante, comprobando la vuelta: si no existe (al
 * adelantar la hora en primavera, 02:30 en Madrid), undefined; si existe dos
 * veces (al retrasarla en otoño), la primera, para que «desde» no deje nada
 * fuera. Los cambios de hora van en múltiplos de 15 min y de como mucho 2 h.
 */
function localToUtc(day: string, hhmm: string, tz: string): number | undefined {
  const guess = zonedToUtc(day, hhmm, tz)
  const fits: number[] = []
  for (let k = -8; k <= 8; k++) {
    const at = guess + k * 15 * 60_000
    if (ymdIn(at, tz) === day && hhmmIn(at, tz) === hhmm) fits.push(at)
  }
  return fits.length ? Math.min(...fits) : undefined
}

/**
 * «desde»: YYYY-MM-DD (desde la medianoche de ese día en su zona) o fecha y
 * hora ISO (sin zona, la suya; ver localToUtc). Lo que no es una fecha que
 * exista, undefined.
 */
export function parseSince(v: string, tz: string): number | undefined {
  const m = v.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/)
  // 2026-02-30 no existe: no se pasa al 2 de marzo
  if (!m || addDays(m[1], 0) !== m[1]) return undefined
  const [, day, h, min, s, frac, zone] = m
  if (h === undefined) return zonedToUtc(day, '00:00', tz)
  if (+h > 23 || +min > 59 || +(s ?? 0) > 59) return undefined
  // Fracción en milisegundos, como Date.parse: las tres primeras cifras (trunca, no redondea)
  const ms = +(frac ?? '').slice(0, 3).padEnd(3, '0')
  if (!zone) {
    const at = localToUtc(day, `${h}:${min}`, tz)
    return at === undefined ? undefined : at + +(s ?? 0) * 1000 + ms
  }
  const at = Date.parse(v)
  return Number.isFinite(at) ? at : undefined
}

/**
 * Las hechas que se recuerdan: las del último mes, solo su id, como mucho
 * MAX_DONE (las más recientes; a igual hora, por id, para que sean siempre las
 * mismas). Con el tope lleno, `doneFrom` pasa a justo después de la última que
 * cabe: las que se quedan fuera (también las empatadas con ella) ya no salen
 * como hechas en la próxima revisión, a cambio de no ver lo que llegue tarde
 * con esa hora o una anterior.
 */
function doneSnap(tasks: Task[], at: number): Pick<Seen, 'done' | 'doneFrom'> {
  let from = at - DONE_DAYS * 864e5
  let done = tasks.filter((t) => t.done && num(t.completedAt) >= from).sort((a, b) => num(b.completedAt) - num(a.completedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (done.length > MAX_DONE) {
    done = done.slice(0, MAX_DONE)
    from = num(done[MAX_DONE - 1].completedAt) + 1
  }
  return { done: done.map((t) => t.id), doneFrom: from }
}

const ago = (ms: number) => {
  const min = Math.round(ms / 60_000)
  if (min < 60) return `hace ${Math.max(min, 1)} min`
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`
  return `hace ${Math.round(min / 1440)} días`
}

const day = (d: string, today: string) => (d ? `${relDay(d, today)} (${d})` : 'sin fecha')

/** ver_novedades */
export function whatsNew(rows: Row[], args: Data, env: Env): { text: string; writes: Row[]; error?: boolean } {
  const today = ymdIn(env.now, env.tz)
  const ix = new Index(rows)
  const now = new Map(ix.tasks.map((t) => [t.id, t]))
  const seen = readSeen(rows, env)
  const asked = str(args.desde).trim()
  const askedMs = asked ? parseSince(asked, env.tz) : undefined
  if (asked && askedMs === undefined)
    return {
      text: `«desde» no es una fecha válida: «${asked}». Usa YYYY-MM-DD (desde la medianoche de ese día en su zona horaria) o fecha y hora ISO (2026-09-24T08:00, en su zona si no lleva otra). No he mirado nada ni he cambiado tu última revisión.`,
      writes: [],
      error: true,
    }
  // Sin revisión anterior (o con «desde»), solo se sabe lo nuevo y lo hecho, por sus fechas
  const byDates = !seen || askedMs !== undefined
  const since = askedMs ?? seen?.at ?? env.now - 864e5
  const by = changedBy(rows, since)
  const me = env.via || 'asistente'
  const mine = args.incluir_mias === true
  // Solo se calla como «tuyo» lo que el historial prueba; el origen de una tarea nueva se dice, pero no la oculta
  const who = (t: Task) => {
    const proven = by.get(t.id)
    if (proven) return proven
    if (t.createdAt >= since && t.origin?.via) return t.origin.via === me ? `${me} según su origen, sin operación tuya que lo pruebe` : t.origin.via
    return 'tú'
  }
  let skipped = 0
  const groups: Record<string, string[]> = { nuevas: [], hechas: [], fecha: [], espera: [], renombradas: [], reabiertas: [], aparecen: [], borradas: [] }
  const add = (group: string, t: Task | undefined, text: string, author: string) => {
    if (author === me && !mine) return void skipped++
    groups[group].push(`- ${t ? `[${t.id}] ` : ''}${text} (${author === 'tú' ? 'el usuario' : author})`)
  }

  if (byDates) {
    for (const t of ix.tasks) {
      if (t.createdAt >= since) add('nuevas', t, `${t.title} · ${t.done ? 'ya hecha' : day(t.dueDate ?? '', today)}`, who(t))
      else if (t.done && (t.completedAt ?? 0) >= since) add('hechas', t, t.title, who(t))
    }
  } else {
    const before = new Map(seen!.tasks.map((s) => [s[0], s]))
    for (const [id, title, due, time, waiting] of seen!.tasks) {
      const t = now.get(id)
      if (!t) {
        add('borradas', undefined, `«${title}» (borrada o en la papelera)`, by.get(id) ?? 'tú')
        continue
      }
      if (t.done) {
        add('hechas', t, t.title, who(t))
        continue
      }
      if ((t.dueDate ?? '') !== due || (t.dueTime ?? '') !== time)
        add('fecha', t, `${t.title}: de ${day(due, today)}${time ? ` ${time}` : ''} a ${day(t.dueDate ?? '', today)}${t.dueTime ? ` ${t.dueTime}` : ''}`, who(t))
      if ((t.waitingFor ?? '') !== waiting) add('espera', t, t.waitingFor ? `${t.title}: ahora espera a ${t.waitingFor}${waiting ? ` (antes a ${waiting})` : ''}` : `${t.title}: ya no espera a ${waiting}`, who(t))
      if (t.title.slice(0, 80) !== title) add('renombradas', t, `«${title}» → «${t.title}»`, who(t))
    }
    // Las hechas en la revisión (las revisiones de antes no las guardaban: entonces no se sabe)
    const wasDone = seen!.done ? new Set(seen!.done) : undefined
    for (const t of ix.tasks) {
      if (before.has(t.id)) continue
      if (t.createdAt >= since) add('nuevas', t, `${t.title} · ${t.done ? 'ya hecha' : day(t.dueDate ?? '', today)}${t.waitingFor ? ` · espera a ${t.waitingFor}` : ''}`, who(t))
      else if (wasDone?.has(t.id)) {
        if (!t.done) add('reabiertas', t, `${t.title} (estaba hecha)`, who(t))
      } else if (t.done) {
        // Hecha sin que se viera antes (sin conexión, por ejemplo); las de hace tiempo, no
        if (num(t.completedAt) >= (seen!.doneFrom ?? since)) add('hechas', t, t.title, who(t))
      } else add('aparecen', t, `${t.title} · ${day(t.dueDate ?? '', today)} (apuntada sin conexión, recuperada de la papelera o reabierta: no sé cuál)`, who(t))
    }
  }

  const titles: Record<string, string> = {
    nuevas: 'NUEVAS',
    hechas: 'HECHAS',
    fecha: 'CON OTRA FECHA',
    espera: 'ESPERAS QUE CAMBIAN',
    renombradas: 'RENOMBRADAS',
    reabiertas: 'REABIERTAS',
    aparecen: 'NO ESTABAN EN TU ÚLTIMA REVISIÓN',
    borradas: 'BORRADAS',
  }
  const body = Object.entries(groups).flatMap(([k, list]) =>
    list.length ? [`\n${titles[k]} (${list.length}):`, ...list.slice(0, MAX_LINES), ...(list.length > MAX_LINES ? [`(y ${list.length - MAX_LINES} más)`] : [])] : [],
  )
  const notices = noticesSince(rows, env, since, mine ? undefined : me)
  const from = seen && askedMs === undefined ? `tu última revisión (${whenLabel(seen.at, env)}, ${ago(env.now - seen.at)})` : `${whenLabel(since, env)} (${ago(env.now - since)})`
  const head = body.length || notices.length ? `NOVEDADES EN SUS TAREAS desde ${from}:` : `Nada ha cambiado en sus tareas desde ${from}.`
  const foot = [
    ...(skipped ? [`\n(Y ${skipped} ${skipped === 1 ? 'cambio tuyo' : 'cambios tuyos'}, que no repito: incluir_mias=true para verlos.)`] : []),
    ...(askedMs !== undefined
      ? ['\nCon «desde»: solo sé lo nuevo y lo hecho. No cuenta como revisión: la próxima sin «desde» te dirá lo que ha cambiado desde la anterior.']
      : byDates
        ? ['\nEs tu primera revisión: solo sé lo nuevo y lo hecho. A partir de ahora también te diré qué cambia de fecha, se borra o pasa a esperar.']
        : []),
  ]

  // Con «desde» o sin_marcar solo se mira: la revisión anterior sigue siendo la que cuenta
  const writes: Row[] =
    args.sin_marcar === true || askedMs !== undefined
      ? []
      : [{ tbl: 'settings', id: seenKey(env), data: { key: seenKey(env), value: { at: env.now, tasks: ix.tasks.filter((t) => !t.done).map(snap), ...doneSnap(ix.tasks, env.now) } satisfies Seen } }]
  return { text: [head, ...body, ...notices, ...foot].join('\n'), writes }
}
