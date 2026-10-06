/**
 * Rutinas desde Claude: crearlas, verlas, cambiarlas y borrarlas. Mismo
 * registro que crea la app (createRoutine en src/db/actions.ts) y el mismo
 * borrado (deleteRoutine): a la Papelera, con lo hecho cada día, y fuera de
 * `routines`. Los avisos salen de la rutina misma (due_routine_reminders en el
 * servidor y src/reminders/local.ts en el móvil), así que al borrarla dejan de
 * sonar.
 */
import { ymdIn, weekday } from '../_shared/time.ts'
import { fold, pickByName, type Env, type Row, type WriteResult } from './ntab.ts'
import { ALL_DAYS, daysLabel, parseDays, parseTime } from './days.ts'

type Data = Record<string, unknown>
type Step = { id: string; title: string; minutes?: number }
const str = (v: unknown) => (typeof v === 'string' ? v : '')

const ROUTINE = { none: 'ninguna rutina', many: 'varias rutinas', plural: 'Rutinas', empty: 'ninguna' }
const routineRows = (rows: Row[]) => rows.filter((r) => r.tbl === 'routines')
const active = (r: Row) => !r.data.archived
const stepsOf = (d: Data) => (Array.isArray(d.steps) ? (d.steps as Step[]) : [])
const daysOf = (d: Data) => (Array.isArray(d.days) ? (d.days as number[]) : [])

/** Una lista de textos: lista, la lista como texto («["a","b"]») o una cosa por línea */
function textList(v: unknown): string[] {
  if (typeof v === 'string') {
    const s = v.trim()
    if (/^\[[\s\S]*\]$/.test(s)) {
      try {
        const list: unknown = JSON.parse(s)
        if (Array.isArray(list)) return textList(list)
      } catch {
        // no era JSON: se lee como texto
      }
    }
    return s.split(/\n+/).map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
  }
  return Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : []
}

const stepLabel = (s: Step) => `${s.title}${s.minutes ? ` (${s.minutes} min)` : ''}`

/** «laborables, aviso a las 07:30» */
const whenLabel = (d: Data) => [daysLabel({ days: daysOf(d) }), parseTime(d.time).time ? `aviso a las ${d.time}` : 'sin aviso'].join(', ')

export function createRoutine(rows: Row[], args: { nombre?: string; pasos?: unknown; dias?: unknown; hora?: unknown }, env: Env): WriteResult {
  const name = str(args.nombre).trim()
  const steps = textList(args.pasos)
  if (!name || !steps.length) return { writes: [], report: ['Falta el nombre o los pasos de la rutina.'] }
  const exists = routineRows(rows).find((r) => active(r) && fold(str(r.data.name)) === fold(name))
  if (exists) return { writes: [], report: [`Ya existe la rutina «${str(exists.data.name)}». Para cambiarla, usa actualizar_rutina.`] }
  const days = parseDays(args.dias)
  const time = args.hora === undefined || args.hora === null || args.hora === '' ? {} : parseTime(args.hora)
  const errors = [days.error, time.error].filter((e): e is string => !!e)
  if (errors.length) return { writes: [], report: errors }
  const routine: Data = {
    id: env.newId(),
    name,
    icon: 'list',
    steps: steps.map((title) => ({ id: env.newId(), title })),
    days: days.days ?? ALL_DAYS,
    archived: 0,
    order: env.now,
    createdAt: env.now,
  }
  if (time.time) routine.time = time.time
  return {
    writes: [{ tbl: 'routines', id: String(routine.id), data: routine }],
    report: [`Rutina creada: «${name}» con ${steps.length} pasos, ${whenLabel(routine)}. La tiene en LUNO → Rutinas y en Hoy los días que toca.`],
  }
}

export function listRoutines(rows: Row[], _args: Data, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const all = routineRows(rows).sort((a, b) => Number(a.data.order ?? 0) - Number(b.data.order ?? 0))
  const routines = all.filter(active)
  if (!routines.length) return 'No tiene rutinas. Se crean con crear_rutina.'
  const out = [`RUTINAS (${routines.length}):`]
  for (const r of routines) {
    const steps = stepsOf(r.data)
    const run = rows.find((x) => x.tbl === 'routineRuns' && x.data.routineId === r.id && x.data.date === today)
    const done = new Set((run?.data.done as string[] | undefined) ?? [])
    const doneN = steps.filter((s) => done.has(s.id)).length
    const now = !daysOf(r.data).includes(weekday(today)) ? 'hoy no toca' : doneN === steps.length && steps.length ? 'hoy hecha' : `hoy ${doneN} de ${steps.length}`
    out.push(`- ${str(r.data.name)}: ${whenLabel(r.data)} · ${now}`, `  Pasos: ${steps.map(stepLabel).join(' → ') || 'ninguno'}`)
  }
  const archived = all.filter((r) => !active(r)).map((r) => str(r.data.name))
  if (archived.length) out.push(`\nArchivadas: ${archived.join(', ')}.`)
  return out.join('\n')
}

export function updateRoutine(rows: Row[], args: { rutina?: string; nombre?: unknown; dias?: unknown; hora?: unknown; pasos?: unknown }, env: Env): WriteResult {
  const all = routineRows(rows).filter(active)
  if (!str(args.rutina).trim()) return { writes: [], report: ['Falta el nombre de la rutina (rutina).'] }
  const found = pickByName(all, str(args.rutina), ROUTINE)
  if (!found.row) return { writes: [], report: [found.error!] }
  const row = found.row
  const data: Data = { ...row.data, id: row.id }
  const errors: string[] = []
  const changed: string[] = []

  if (args.nombre !== undefined) {
    const name = str(args.nombre).trim()
    const clash = all.find((r) => r.id !== row.id && fold(str(r.data.name)) === fold(name))
    if (!name) errors.push('El nombre nuevo no puede estar vacío.')
    else if (clash) errors.push(`Ya hay otra rutina «${str(clash.data.name)}».`)
    else if (name !== row.data.name) {
      data.name = name
      changed.push(`ahora se llama «${name}»`)
    }
  }
  if (args.dias !== undefined) {
    const d = parseDays(args.dias)
    if (d.error) errors.push(d.error)
    else if (d.days) {
      data.days = d.days
      changed.push(daysLabel({ days: d.days }))
    }
  }
  if (args.hora !== undefined) {
    if (args.hora === null || args.hora === '') {
      delete data.time
      changed.push('sin aviso')
    } else {
      const t = parseTime(args.hora)
      if (t.error) errors.push(t.error)
      else {
        data.time = t.time
        changed.push(`aviso a las ${t.time}`)
      }
    }
  }
  if (args.pasos !== undefined) {
    const titles = textList(args.pasos)
    if (!titles.length) errors.push('Una rutina necesita al menos un paso: manda la lista completa de pasos.')
    else {
      // Los pasos que siguen igual conservan su id (y sus minutos): lo marcado hoy no se pierde
      const old = [...stepsOf(row.data)]
      data.steps = titles.map((title) => {
        const i = old.findIndex((s) => fold(s.title) === fold(title))
        if (i < 0) return { id: env.newId(), title }
        const [same] = old.splice(i, 1)
        return { ...same, title }
      })
      changed.push(`${titles.length} pasos: ${titles.join(' → ')}`)
    }
  }
  if (errors.length) return { writes: [], report: errors }
  if (!changed.length) return { writes: [], report: [`No has dicho qué cambiar de «${str(data.name)}».`] }
  return { writes: [{ tbl: 'routines', id: row.id, data }], report: [`Rutina actualizada: «${str(data.name)}»: ${changed.join(', ')}.`] }
}

/**
 * Borra rutinas como la app (deleteRoutine): una copia a la Papelera (30 días,
 * con lo hecho cada día) y fuera la rutina y sus días hechos. Si un nombre no
 * existe, lo dice y sigue con los demás.
 */
export function deleteRoutines(rows: Row[], args: { rutinas?: unknown }, env: Env): WriteResult & { deletes: Row[] } {
  const names = textList(args.rutinas)
  if (!names.length) return { writes: [], deletes: [], report: ['Falta qué rutina borrar (rutinas: un nombre o una lista).'] }
  const all = routineRows(rows)
  const writes: Row[] = []
  const deletes: Row[] = []
  const report: string[] = []
  const gone = new Set<string>()
  for (const name of names) {
    const found = pickByName(all, name, ROUTINE)
    if (!found.row) {
      report.push(found.error!)
      continue
    }
    const r = found.row
    if (gone.has(r.id)) continue
    gone.add(r.id)
    const runs = rows.filter((x) => x.tbl === 'routineRuns' && x.data.routineId === r.id)
    const key = `routines:${r.id}`
    const title = str(r.data.name).trim() || 'Sin título'
    writes.push({
      tbl: 'trash',
      id: key,
      data: { id: key, tbl: 'routines', itemId: r.id, title, data: { ...r.data, id: r.id }, deletedAt: env.now, related: runs.map((x) => ({ tbl: 'routineRuns', data: { ...x.data, id: x.id } })) },
    })
    deletes.push(r, ...runs)
    report.push(`Rutina borrada: «${title}». Ya no sale en Hoy ni avisa; está en la Papelera de LUNO 30 días por si la quiere recuperar.`)
  }
  return { writes, deletes, report }
}
