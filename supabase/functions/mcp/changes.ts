/**
 * ver_novedades: qué ha cambiado en sus tareas desde la última vez que lo
 * preguntó este asistente (tareas nuevas, hechas, borradas, con otra fecha,
 * que ahora esperan a alguien…) y quién lo hizo. Para que Hermes no tenga que
 * leer el resumen entero cada vez ni le avise de algo que ya ha cambiado.
 *
 * LUNO solo guarda cómo están las cosas ahora, así que en cada revisión se
 * apunta una foto mínima de las tareas pendientes de ese asistente (ajuste
 * `agentSeen:<asistente>`: id, título, fecha, hora y a quién espera): con ella
 * se sabe, la vez siguiente, de qué fecha a qué fecha se movió algo. No es un
 * cambio de sus cosas: no entra en el historial ni se deshace.
 */
import { readLog } from './agentLog.ts'
import { noticesSince, whenLabel } from './notices.ts'
import { Index, relDay, type Env, type Row, type Task } from './ntab.ts'
import { ymdIn } from '../_shared/time.ts'

export const SEEN_PREFIX = 'agentSeen:'
/** Lo que se recuerda de cada tarea pendiente: id, título, fecha, hora, a quién espera */
type Snap = [string, string, string, string, string]
interface Seen {
  at: number
  tasks: Snap[]
}

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const MAX_LINES = 25

const snap = (t: Task): Snap => [t.id, t.title.slice(0, 80), t.dueDate ?? '', t.dueTime ?? '', t.waitingFor ?? '']
const seenKey = (env: Env) => `${SEEN_PREFIX}${env.via || 'asistente'}`

function readSeen(rows: Row[], env: Env): Seen | undefined {
  const v = rows.find((r) => r.tbl === 'settings' && r.id === seenKey(env))?.data.value as Seen | undefined
  return v && typeof v.at === 'number' && Array.isArray(v.tasks) ? v : undefined
}

/** Quién cambió cada tarea desde `since`, según el historial de los asistentes */
function changedBy(rows: Row[], since: number): Map<string, string> {
  const by = new Map<string, string>()
  for (const e of readLog(rows)) {
    if (e.at < since || e.undone) continue
    for (const c of e.changes) if (c.tbl === 'tasks') by.set(c.id, e.via)
  }
  return by
}

const ago = (ms: number) => {
  const min = Math.round(ms / 60_000)
  if (min < 60) return `hace ${Math.max(min, 1)} min`
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`
  return `hace ${Math.round(min / 1440)} días`
}

const day = (d: string, today: string) => (d ? `${relDay(d, today)} (${d})` : 'sin fecha')

/** ver_novedades */
export function whatsNew(rows: Row[], args: Data, env: Env): { text: string; writes: Row[] } {
  const today = ymdIn(env.now, env.tz)
  const ix = new Index(rows)
  const now = new Map(ix.tasks.map((t) => [t.id, t]))
  const seen = readSeen(rows, env)
  const asked = str(args.desde).trim()
  const askedMs = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? Date.parse(`${asked}T00:00:00Z`) : asked ? Date.parse(asked) : NaN
  // Sin revisión anterior (o con «desde»), solo se sabe lo nuevo y lo hecho, por sus fechas
  const byDates = !seen || Number.isFinite(askedMs)
  const since = Number.isFinite(askedMs) ? askedMs : (seen?.at ?? env.now - 864e5)
  const by = changedBy(rows, since)
  const me = env.via || 'asistente'
  const mine = args.incluir_mias === true
  const who = (t: Task) => by.get(t.id) ?? (t.createdAt >= since && t.origin?.via ? t.origin.via : 'tú')
  let skipped = 0
  const groups: Record<string, string[]> = { nuevas: [], hechas: [], fecha: [], espera: [], renombradas: [], reabiertas: [], borradas: [] }
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
    for (const t of ix.tasks) {
      if (before.has(t.id)) continue
      if (t.createdAt >= since) add('nuevas', t, `${t.title} · ${t.done ? 'ya hecha' : day(t.dueDate ?? '', today)}${t.waitingFor ? ` · espera a ${t.waitingFor}` : ''}`, who(t))
      else if (!t.done) add('reabiertas', t, `${t.title} (estaba hecha)`, who(t))
    }
  }

  const titles: Record<string, string> = {
    nuevas: 'NUEVAS',
    hechas: 'HECHAS',
    fecha: 'CON OTRA FECHA',
    espera: 'ESPERAS QUE CAMBIAN',
    renombradas: 'RENOMBRADAS',
    reabiertas: 'REABIERTAS',
    borradas: 'BORRADAS',
  }
  const body = Object.entries(groups).flatMap(([k, list]) =>
    list.length ? [`\n${titles[k]} (${list.length}):`, ...list.slice(0, MAX_LINES), ...(list.length > MAX_LINES ? [`(y ${list.length - MAX_LINES} más)`] : [])] : [],
  )
  const notices = noticesSince(rows, env, since, mine ? undefined : me)
  const from = seen && !Number.isFinite(askedMs) ? `tu última revisión (${whenLabel(seen.at, env)}, ${ago(env.now - seen.at)})` : `${whenLabel(since, env)} (${ago(env.now - since)})`
  const head = body.length || notices.length ? `NOVEDADES EN SUS TAREAS desde ${from}:` : `Nada ha cambiado en sus tareas desde ${from}.`
  const foot = [
    ...(skipped ? [`\n(Y ${skipped} ${skipped === 1 ? 'cambio tuyo' : 'cambios tuyos'}, que no repito: incluir_mias=true para verlos.)`] : []),
    ...(byDates ? [`\n${seen ? 'Con «desde»' : 'Es tu primera revisión'}: solo sé lo nuevo y lo hecho. A partir de ahora también te diré qué cambia de fecha, se borra o pasa a esperar.`] : []),
  ]

  const writes: Row[] =
    args.sin_marcar === true
      ? []
      : [{ tbl: 'settings', id: seenKey(env), data: { key: seenKey(env), value: { at: env.now, tasks: ix.tasks.filter((t) => !t.done).map(snap) } satisfies Seen } }]
  return { text: [head, ...body, ...notices, ...foot].join('\n'), writes }
}
