/**
 * Hábitos desde Claude: crearlos, verlos y cambiarlos (marcarlos es
 * `markHabit` en ntab.ts). Mismo registro que crea la app (createHabit en
 * src/db/actions.ts) y misma lógica de días, cantidad y racha
 * (../_shared/habits.ts), así que salen en Hoy, en el resumen y avisan igual.
 */
import { WEEKDAYS, ymdIn } from '../_shared/time.ts'
import { doneDays, groupLogs, isDue, openBreak, perWeekOf, progressLabel, streak, streakLabel, type HabitLike } from '../_shared/habits.ts'
import { Index, findByName, fold, isHhmm, type Env, type Row, type WriteResult } from './ntab.ts'

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : 0)

const ALL = [0, 1, 2, 3, 4, 5, 6]
const WORKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [0, 6]
const DAY_WORDS: Record<string, number[]> = {
  todos: ALL,
  'todos los dias': ALL,
  'cada dia': ALL,
  diario: ALL,
  laborables: WORKDAYS,
  'entre semana': WORKDAYS,
  'de lunes a viernes': WORKDAYS,
  'fines de semana': WEEKEND,
  'fin de semana': WEEKEND,
}
const DAY_NAMES = WEEKDAYS.map(fold)
/** Lunes primero, como en la app */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const MAX_TARGET = 1000

const DAYS_HELP = 'usa una lista de 0 (domingo) a 6 (sábado), "todos", "laborables" o "fines de semana"'

/** Días en que toca: lista 0–6 o palabras («laborables», «lunes y jueves»). `undefined` si no se dan. */
export function parseDays(v: unknown): { days?: number[]; error?: string } {
  if (v === undefined || v === null) return {}
  if (Array.isArray(v)) {
    const bad = v.filter((x) => !Number.isInteger(typeof x === 'string' && x.trim() ? Number(x) : x) || Number(x) < 0 || Number(x) > 6)
    if (bad.length) return { error: `Los días van del 0 (domingo) al 6 (sábado); no vale ${bad.map((x) => `«${String(x)}»`).join(', ')}.` }
    if (!v.length) return { error: `Indica al menos un día: ${DAYS_HELP}.` }
    return { days: [...new Set(v.map(Number))].sort() }
  }
  if (typeof v === 'string') {
    const s = fold(v)
    if (DAY_WORDS[s]) return { days: DAY_WORDS[s] }
    // «lunes, miércoles y viernes» o «1,3,5»
    const parts = s.split(/\s*(?:,|\by\b|\be\b)\s*/).filter(Boolean)
    const days = parts.map((p) => {
      const word = p.replace(/^(?:los|el)\s+/, '')
      return /^[0-6]$/.test(word) ? Number(word) : DAY_NAMES.includes(word) ? DAY_NAMES.indexOf(word) : DAY_NAMES.indexOf(word.replace(/s$/, ''))
    })
    if (parts.length && days.every((d) => d >= 0)) return { days: [...new Set(days)].sort() }
  }
  return { error: `No entiendo los días «${String(v)}»: ${DAYS_HELP}.` }
}

/** «todos los días», «laborables», «lunes, miércoles y viernes» o «3 veces por semana» */
export function daysLabel(h: Pick<HabitLike, 'days' | 'perWeek'>) {
  const n = perWeekOf(h)
  if (n) return `${n} ${n === 1 ? 'vez' : 'veces'} por semana`
  const key = [...new Set(h.days)].sort().join()
  if (key === ALL.join()) return 'todos los días'
  if (key === WORKDAYS.join()) return 'laborables'
  if (key === WEEKEND.join()) return 'fines de semana'
  const names = WEEK_ORDER.filter((d) => h.days.includes(d)).map((d) => WEEKDAYS[d])
  return names.length < 2 ? (names[0] ?? 'ningún día') : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`
}

function parseTime(v: unknown): { time?: string; error?: string } {
  if (isHhmm(v)) return { time: v.padStart(5, '0') }
  return { error: `La hora «${String(v)}» no vale: usa HH:MM en 24 h (p. ej. 08:30 o 21:00).` }
}

/** Cantidad al día: entero de 1 a 1000 (1 = hecho o no hecho, sin cantidad) */
function parseTarget(v: unknown): { target?: number; error?: string } {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return { error: `La cantidad tiene que ser un número mayor que 0 (p. ej. 8 vasos o 20 min); «${String(v)}» no vale.` }
  if (!Number.isInteger(v)) return { error: `La cantidad tiene que ser un número entero (${v} no vale): para 1,5 L, mejor 3 «medios litros» o 6 «vasos».` }
  if (v > MAX_TARGET) return { error: `La cantidad no puede pasar de ${MAX_TARGET}.` }
  return { target: v }
}

/** Un icono que encaje con el nombre (los mismos que ofrece la app) */
const ICON_WORDS: [RegExp, string][] = [
  [/agua|beber|vaso|hidrat/, 'droplet'],
  [/leer|lectura|libro|pagina/, 'book'],
  [/estudi|idioma|ingles|clase|curso/, 'graduation'],
  [/gimnasio|gym|pesas|flexion|ejercicio|entrenar/, 'dumbbell'],
  [/bici|ciclismo/, 'bike'],
  [/correr|andar|caminar|pasos|paseo/, 'footprints'],
  [/medita|respira|mindful/, 'brain'],
  [/dormir|acostar|sueno|pantallas/, 'moon'],
  [/madrugar|levantar|despertar/, 'sun'],
  [/fruta|verdura|comer|desayun|cocinar/, 'apple'],
  [/pastilla|vitamina|medica/, 'pill'],
  [/diario|escribir/, 'book'],
  [/musica|guitarra|piano|tocar/, 'music'],
]
const iconFor = (name: string) => ICON_WORDS.find(([re]) => re.test(fold(name)))?.[1] ?? 'sparkles'

const habitRows = (rows: Row[]) => rows.filter((r) => r.tbl === 'habits')
const active = (r: Row) => !r.data.archived

const ruleOf = (d: Data): HabitLike => ({
  days: Array.isArray(d.days) ? (d.days as number[]) : [],
  target: num(d.target) || undefined,
  unit: str(d.unit) || undefined,
  perWeek: num(d.perWeek) || undefined,
  breaks: Array.isArray(d.breaks) ? (d.breaks as HabitLike['breaks']) : undefined,
})

/** «objetivo 8 vasos al día» o nada */
const targetLabel = (d: Data) => (num(d.target) > 1 ? `objetivo ${num(d.target)}${str(d.unit) ? ` ${str(d.unit)}` : ''} al día` : '')

/** Lo que define el hábito, en una línea: días, objetivo, aviso y área */
function describe(d: Data, ix: Index) {
  return [daysLabel(ruleOf(d)), targetLabel(d), isHhmm(d.remindTime) ? `aviso a las ${d.remindTime}` : '', ix.areaName(str(d.areaId)) ? `área ${ix.areaName(str(d.areaId))}` : '']
    .filter(Boolean)
    .join(', ')
}

const areaList = (ix: Index) => ix.areas.map((a) => str(a.name)).filter(Boolean).join(', ') || 'no tiene ninguna'

export function createHabit(
  rows: Row[],
  args: { nombre?: string; dias?: unknown; hora?: unknown; cantidad?: unknown; unidad?: unknown; area?: unknown },
  env: Env,
): WriteResult {
  const name = str(args.nombre).trim()
  if (!name) return { writes: [], report: ['Falta el nombre del hábito.'] }
  const same = habitRows(rows).filter((r) => fold(str(r.data.name)) === fold(name))
  const ix = new Index(rows)
  const live = same.find(active)
  if (live) return { writes: [], report: [`Ya existe el hábito «${str(live.data.name)}» (${describe(live.data, ix)}). No lo he duplicado: para cambiarlo, usa actualizar_habito.`] }
  if (same.length) return { writes: [], report: [`Ya hay un hábito «${str(same[0].data.name)}», archivado. No lo he duplicado: para recuperarlo con su historial, usa actualizar_habito con archivado=false.`] }

  const errors: string[] = []
  const days = parseDays(args.dias)
  if (days.error) errors.push(days.error)
  const time = args.hora === undefined || args.hora === null || args.hora === '' ? {} : parseTime(args.hora)
  if (time.error) errors.push(time.error)
  const target = args.cantidad === undefined || args.cantidad === null ? {} : parseTarget(args.cantidad)
  if (target.error) errors.push(target.error)
  const unit = str(args.unidad).trim()
  if (unit && !target.error && (target.target ?? 1) < 2) errors.push(`La unidad («${unit}») va con una cantidad de 2 o más (p. ej. 8 «vasos»).`)
  if (errors.length) return { writes: [], report: errors }

  const notes: string[] = []
  const area = str(args.area).trim() ? findByName(ix.areas, str(args.area)) : undefined
  if (str(args.area).trim() && !area) notes.push(`No encontré el área «${str(args.area)}» (áreas: ${areaList(ix)}); lo he creado sin área.`)

  const id = env.newId()
  const habit: Data = { id, name, icon: iconFor(name), color: '#30D158', days: days.days ?? ALL, archived: 0, order: env.now, createdAt: env.now }
  if (time.time) habit.remindTime = time.time
  if ((target.target ?? 1) > 1) habit.target = target.target
  if (unit) habit.unit = unit
  if (area) habit.areaId = area.id
  const today = ymdIn(env.now, env.tz)
  const due = isDue(ruleOf(habit), new Set(), today)
  return {
    writes: [{ tbl: 'habits', id, data: habit }],
    report: [`Hábito creado: «${name}», ${describe(habit, ix)}. ${due ? 'Ya sale en Hoy' : 'Hoy no toca; saldrá en Hoy los días que toca'} y se marca con marcar_habito.`, ...notes],
  }
}

export function listHabits(rows: Row[], _args: Data, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const ix = new Index(rows)
  const all = habitRows(rows).sort((a, b) => num(a.data.order) - num(b.data.order))
  const habits = all.filter(active)
  const archived = all.filter((r) => !active(r)).map((r) => str(r.data.name))
  const counts = groupLogs(rows.filter((r) => r.tbl === 'habitLogs').map((r) => ({ habitId: str(r.data.habitId), date: str(r.data.date), count: num(r.data.count) || undefined })))
  const out = habits.length ? [`HÁBITOS (${habits.length}):`] : ['No tiene hábitos activos. Se crean con crear_habito.']
  for (const r of habits) {
    const rule = ruleOf(r.data)
    const done = doneDays(rule, counts.get(r.id))
    const n = streak(rule, done, today)
    const progress = progressLabel(rule, counts.get(r.id), done, today)
    const now = openBreak(rule) ? 'en pausa' : isDue(rule, done, today) ? `hoy ${done.has(today) ? 'hecho' : 'pendiente'}${progress ? ` (${progress})` : ''}` : 'hoy no toca'
    out.push(`- ${str(r.data.name)}: ${describe(r.data, ix)} · racha ${streakLabel(rule, n)} · ${now}`)
  }
  if (archived.length) out.push(`\nArchivados (con su historial): ${archived.join(', ')}.`)
  return out.join('\n')
}

/** Por nombre: exacto primero; si no, el único que lo contenga (si hay varios, pide precisar) */
function pickHabit(candidates: Row[], name: string): { habit?: Row; error?: string } {
  const n = fold(name)
  if (!n) return { error: 'Falta el nombre del hábito (habito).' }
  const exact = candidates.find((r) => fold(str(r.data.name)) === n)
  if (exact) return { habit: exact }
  const near = candidates.filter((r) => fold(str(r.data.name)).includes(n) || n.includes(fold(str(r.data.name))))
  if (near.length === 1) return { habit: near[0] }
  if (near.length > 1) return { error: `Hay varios hábitos que encajan con «${name}»: ${near.map((r) => str(r.data.name)).join(', ')}. ¿Cuál?` }
  return { error: `No hay ningún hábito que se llame «${name}». Hábitos: ${candidates.map((r) => str(r.data.name)).join(', ') || 'ninguno'}.` }
}

export function updateHabit(
  rows: Row[],
  args: { habito?: string; nombre?: unknown; dias?: unknown; hora?: unknown; cantidad?: unknown; unidad?: unknown; area?: unknown; archivado?: unknown },
  _env: Env,
): WriteResult {
  const all = habitRows(rows)
  // Para recuperar uno archivado se busca entre los archivados; si no, entre los activos
  const restoring = args.archivado === false
  const found = pickHabit(restoring ? all.filter((r) => !active(r)) : all.filter(active), str(args.habito))
  if (!found.habit && typeof args.archivado === 'boolean') {
    const other = pickHabit(restoring ? all.filter(active) : all.filter((r) => !active(r)), str(args.habito)).habit
    if (other) return { writes: [], report: [`«${str(other.data.name)}» ${restoring ? 'no está archivado' : 'ya estaba archivado'}.`] }
  }
  if (!found.habit) return { writes: [], report: [found.error!] }
  const row = found.habit
  const before = row.data
  const data: Data = { ...before }
  const ix = new Index(rows)
  const errors: string[] = []
  const notes: string[] = []
  const changed: string[] = []

  if (args.nombre !== undefined) {
    const name = str(args.nombre).trim()
    const clash = all.find((r) => r.id !== row.id && active(r) && fold(str(r.data.name)) === fold(name))
    if (!name) errors.push('El nombre nuevo no puede estar vacío.')
    else if (clash) errors.push(`Ya hay otro hábito «${str(clash.data.name)}».`)
    else if (name !== before.name) {
      data.name = name
      changed.push(`ahora se llama «${name}»`)
    }
  }
  if (args.dias !== undefined) {
    const d = parseDays(args.dias)
    if (d.error) errors.push(d.error)
    else if (d.days) {
      // Días fijos: deja de ser «N veces por semana», como al elegir días en la app
      data.days = d.days
      delete data.perWeek
      changed.push(daysLabel({ days: d.days }))
    }
  }
  if (args.hora !== undefined) {
    if (args.hora === null || args.hora === '') {
      delete data.remindTime
      changed.push('sin aviso')
    } else {
      const t = parseTime(args.hora)
      if (t.error) errors.push(t.error)
      else {
        data.remindTime = t.time
        changed.push(`aviso a las ${t.time}`)
      }
    }
  }
  if (args.cantidad !== undefined) {
    if (args.cantidad === null || args.cantidad === 1) {
      delete data.target
      delete data.unit
      changed.push('sin cantidad (hecho o no hecho)')
    } else {
      const t = parseTarget(args.cantidad)
      if (t.error) errors.push(t.error)
      else data.target = t.target
    }
  }
  if (args.unidad !== undefined) {
    const unit = str(args.unidad).trim()
    if (!unit) delete data.unit
    else if (num(data.target) < 2) errors.push(`La unidad («${unit}») va con una cantidad de 2 o más: indica también la cantidad.`)
    else data.unit = unit
  }
  if (num(data.target) > 1 && (data.target !== before.target || data.unit !== before.unit)) changed.push(targetLabel(data))
  if (args.area !== undefined) {
    if (args.area === null || str(args.area).trim() === '') {
      if (data.areaId) changed.push('sin área')
      delete data.areaId
    } else {
      const area = findByName(ix.areas, str(args.area))
      if (!area) notes.push(`No encontré el área «${str(args.area)}» (áreas: ${areaList(ix)}).`)
      else {
        data.areaId = area.id
        changed.push(`área ${str(area.name)}`)
      }
    }
  }
  if (errors.length) return { writes: [], report: errors }

  const name = str(data.name)
  if (args.archivado === true && active(row)) data.archived = 1
  if (restoring) data.archived = 0
  const archiving = !!data.archived && !before.archived
  if (!changed.length && !archiving && !restoring) return { writes: [], report: notes.length ? notes : [`No has dicho qué cambiar de «${name}».`] }

  const report = archiving
    ? [`Hábito archivado: «${name}». Ya no sale en Hoy ni avisa; su historial y su racha se conservan (se recupera con archivado=false).`]
    : restoring
      ? [`Hábito recuperado: «${name}», ${describe(data, ix)}. Vuelve a salir en Hoy con su historial.`]
      : []
  if (changed.length) report.push(`Hábito actualizado: «${name}»: ${changed.join(', ')}.`)
  return { writes: [{ tbl: 'habits', id: row.id, data }], report: [...report, ...notes] }
}
