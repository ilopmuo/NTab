/**
 * Personas, proyectos y objetivos desde Claude: lo que la app deja crear o
 * cambiar y el conector aún no. Mismos registros que crea la app
 * (createPerson, createGoal y el estado del proyecto en src/db/actions.ts y
 * ProjectView).
 */
import { ymdIn } from '../_shared/time.ts'
import { Index, findByName, fold, isYmd, logContact, pickByName, type Env, type Row, type WriteResult } from './ntab.ts'

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : 0)
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : typeof v === 'string' && v.trim() ? [v.trim()] : [])

// ── Personas ──────────────────────────────────────────────────

const words = (s: string) => fold(s).replace(/^@/, '').split(/[^\p{L}\d]+/u).filter(Boolean)

/**
 * Una persona por cómo se la nombra: el nombre entero o sus palabras («Ana» →
 * «Ana López», pero no «Mariana»). Si encajan varias, que precise.
 */
export function findPerson(rows: Row[], said: string): { row?: Row; error?: string } {
  const people = rows.filter((r) => r.tbl === 'people')
  const n = fold(said).replace(/^@/, '')
  const exact = people.find((r) => fold(str(r.data.name)) === n)
  if (exact) return { row: exact }
  const w = words(said)
  const near = w.length ? people.filter((r) => { const name = new Set(words(str(r.data.name))); return w.every((x) => name.has(x)) }) : []
  if (near.length === 1) return { row: near[0] }
  if (near.length > 1) return { error: `Hay varias personas que encajan con «${said}»: ${near.map((r) => str(r.data.name)).join(', ')}. ¿Quién?` }
  return {}
}

/** Una persona nueva, como createPerson de la app */
export function newPerson(name: string, env: Env): Row {
  const id = env.newId()
  return { tbl: 'people', id, data: { id, name: name.trim(), email: '', phone: '', company: '', role: '', notes: '', tags: [], createdAt: env.now } }
}

/** «MM-DD» o «YYYY-MM-DD» con un día que existe */
function birthday(v: string): string | undefined {
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return undefined
  const [mo, d] = [Number(m[2]), Number(m[3])]
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]
  return max && d >= 1 && d <= max ? v.trim() : undefined
}

export function savePerson(
  rows: Row[],
  args: { nombre?: string; cumpleanos?: unknown; telefono?: unknown; email?: unknown; empresa?: unknown; cargo?: unknown; notas?: unknown; etiquetas?: unknown; cada_dias?: unknown; idea_regalo?: unknown },
  env: Env,
): WriteResult {
  const name = str(args.nombre).trim()
  if (!name) return { writes: [], report: ['Falta el nombre de la persona.'] }
  // La que ya está (también si dice solo el nombre: «Ana» → «Ana López»); si encajan varias, que precise
  const found = findPerson(rows, name)
  if (found.error) return { writes: [], report: [found.error] }
  const row = found.row ?? newPerson(name, env)
  const isNew = !found.row
  const d: Data = { ...row.data, id: row.id }
  const errors: string[] = []
  const changed: string[] = []
  if (args.cumpleanos !== undefined && args.cumpleanos !== null && args.cumpleanos !== '') {
    const b = birthday(str(args.cumpleanos))
    if (!b) errors.push(`El cumpleaños «${String(args.cumpleanos)}» no vale: usa MM-DD (p. ej. 03-14) o YYYY-MM-DD si sabes el año.`)
    else {
      d.birthday = b
      changed.push(`cumpleaños ${b}`)
    }
  }
  for (const [arg, field, label] of [['telefono', 'phone', 'teléfono'], ['email', 'email', 'email'], ['empresa', 'company', 'empresa'], ['cargo', 'role', 'cargo']] as const) {
    const v = str(args[arg]).trim()
    if (v) {
      d[field] = v
      changed.push(`${label} ${v}`)
    }
  }
  const notes = str(args.notas).trim()
  if (notes) {
    // Se añade a lo que ya hubiera
    d.notes = [str(d.notes).trim(), notes].filter(Boolean).join('\n')
    changed.push('notas')
  }
  const tags = list(args.etiquetas).map((t) => t.replace(/^#/, '').toLowerCase())
  if (tags.length) {
    d.tags = [...new Set([...(Array.isArray(d.tags) ? (d.tags as string[]) : []), ...tags])]
    changed.push(`etiquetas ${tags.map((t) => `#${t}`).join(' ')}`)
  }
  if (args.cada_dias !== undefined && args.cada_dias !== null) {
    const n = Number(args.cada_dias)
    if (!Number.isInteger(n) || n < 1 || n > 365) errors.push(`«cada_dias» tiene que ser un número de días entre 1 y 365 (${String(args.cada_dias)} no vale).`)
    else {
      d.contactEvery = n
      changed.push(`hablar cada ${n} días`)
    }
  }
  const gifts = list(args.idea_regalo)
  if (gifts.length) {
    d.gifts = [...(Array.isArray(d.gifts) ? (d.gifts as Data[]) : []), ...gifts.map((text) => ({ id: env.newId(), text }))]
    changed.push(`${gifts.length === 1 ? 'idea de regalo' : 'ideas de regalo'}: ${gifts.join(', ')}`)
  }
  if (errors.length) return { writes: [], report: errors }
  if (!isNew && !changed.length) return { writes: [], report: [`${str(d.name)} ya está en tus personas; no has dicho qué cambiar.`] }
  return {
    writes: [{ tbl: 'people', id: row.id, data: d }],
    report: [`${isNew ? 'Persona creada' : 'Persona actualizada'}: ${str(d.name)}${changed.length ? ` (${changed.join(', ')})` : ''}.`],
  }
}

/**
 * «He hablado con Ana»: apunta el contacto y, si no está en sus personas, la
 * crea (lo dice) en vez de fallar.
 */
export function logContactTool(rows: Row[], args: { persona?: string; tipo?: string; resumen?: string; fecha?: string }, env: Env): WriteResult {
  const name = str(args.persona).trim()
  if (!name) return { writes: [], report: ['Falta con quién (persona).'] }
  const found = findPerson(rows, name)
  if (found.error) return { writes: [], report: [found.error] }
  const person = found.row ?? newPerson(name.replace(/^@/, ''), env)
  const r = logContact(found.row ? rows : [...rows, person], { ...args, persona: str(person.data.name) }, env)
  if (found.row || !r.writes.length) return r
  // La persona nueva va con su último contacto ya puesto (logContact la devuelve actualizada)
  const updated = r.writes.find((w) => w.tbl === 'people' && w.id === person.id)
  return { writes: [...r.writes.filter((w) => w !== updated), updated ?? person], report: [...r.report, `${str(person.data.name)} no estaba en tus personas: la he añadido.`] }
}

// ── Proyectos ─────────────────────────────────────────────────

const PROJECT = { none: 'ningún proyecto', many: 'varios proyectos', plural: 'Proyectos', empty: 'ninguno' }
const STATUS: Record<string, 'active' | 'paused' | 'done'> = { activo: 'active', 'en marcha': 'active', pausado: 'paused', 'en pausa': 'paused', terminado: 'done', hecho: 'done', acabado: 'done' }
const STATUS_SAID = { active: 'en marcha', paused: 'en pausa', done: 'terminado 🎉' }

export function updateProject(rows: Row[], args: { proyecto?: string; nombre?: unknown; estado?: unknown; limite?: unknown; descripcion?: unknown; area?: unknown }, _env: Env): WriteResult {
  const projects = rows.filter((r) => r.tbl === 'projects')
  if (!str(args.proyecto).trim()) return { writes: [], report: ['Falta el nombre del proyecto (proyecto).'] }
  const found = pickByName(projects, str(args.proyecto), PROJECT)
  if (!found.row) return { writes: [], report: [found.error!] }
  const p = found.row
  const d: Data = { ...p.data, id: p.id }
  const errors: string[] = []
  const changed: string[] = []
  if (args.nombre !== undefined) {
    const name = str(args.nombre).trim()
    if (!name) errors.push('El nombre nuevo no puede estar vacío.')
    else if (projects.some((r) => r.id !== p.id && fold(str(r.data.name)) === fold(name))) errors.push(`Ya hay otro proyecto «${name}».`)
    else if (name !== d.name) {
      d.name = name
      changed.push(`ahora se llama «${name}»`)
    }
  }
  if (args.estado !== undefined) {
    const s = STATUS[fold(str(args.estado))]
    if (!s) errors.push(`Estado «${String(args.estado)}» no válido: usa "activo", "pausado" o "terminado".`)
    else if (s !== d.status) {
      d.status = s
      changed.push(STATUS_SAID[s])
    }
  }
  if (args.limite !== undefined) {
    if (args.limite === null || args.limite === '') {
      if (d.deadline) changed.push('sin fecha límite')
      delete d.deadline
    } else if (!isYmd(args.limite)) errors.push(`La fecha límite «${String(args.limite)}» no vale: usa YYYY-MM-DD.`)
    else {
      d.deadline = args.limite
      changed.push(`límite ${args.limite}`)
    }
  }
  if (typeof args.descripcion === 'string') {
    d.description = args.descripcion.trim()
    changed.push('descripción')
  }
  const notes: string[] = []
  if (args.area !== undefined) {
    const ix = new Index(rows)
    if (args.area === null || args.area === '') {
      if (d.areaId) changed.push('sin área')
      delete d.areaId
    } else {
      const a = findByName(ix.areas, str(args.area))
      if (!a) notes.push(`No encontré el área «${str(args.area)}» (áreas: ${ix.areas.map((x) => str(x.name)).join(', ') || 'ninguna'}).`)
      else {
        d.areaId = a.id
        changed.push(`área ${str(a.name)}`)
      }
    }
  }
  if (errors.length) return { writes: [], report: errors }
  if (!changed.length) return { writes: [], report: notes.length ? notes : [`No has dicho qué cambiar de «${str(d.name)}».`] }
  return { writes: [{ tbl: 'projects', id: p.id, data: d }], report: [`Proyecto actualizado: «${str(d.name)}»: ${changed.join(', ')}.`, ...notes] }
}

// ── Objetivos ─────────────────────────────────────────────────

export function createGoal(
  rows: Row[],
  args: { titulo?: string; por_que?: unknown; cifra?: unknown; unidad?: unknown; etiqueta?: unknown; proyectos?: unknown; limite?: unknown; area?: unknown },
  env: Env,
): WriteResult {
  const title = str(args.titulo).trim()
  if (!title) return { writes: [], report: ['Falta el título del objetivo.'] }
  const existing = rows.find((r) => r.tbl === 'goals' && r.data.status !== 'dropped' && fold(str(r.data.title)) === fold(title))
  if (existing) return { writes: [], report: [`Ya existe el objetivo «${str(existing.data.title)}». Para cambiar su cifra, usa actualizar_objetivo.`] }
  const errors: string[] = []
  const target = args.cifra === undefined || args.cifra === null ? undefined : Number(args.cifra)
  if (target !== undefined && !(Number.isFinite(target) && target > 0)) errors.push(`La cifra tiene que ser un número mayor que 0 (${String(args.cifra)} no vale).`)
  if (args.limite !== undefined && args.limite !== null && args.limite !== '' && !isYmd(args.limite)) errors.push(`La fecha límite «${String(args.limite)}» no vale: usa YYYY-MM-DD.`)
  const tag = str(args.etiqueta).replace(/^#/, '').trim().toLowerCase()
  if (tag && target === undefined) errors.push(`Para contar las tareas #${tag}, di también cuántas (cifra).`)
  const wanted = list(args.proyectos)
  const projects = rows.filter((r) => r.tbl === 'projects')
  const linked: Row[] = []
  for (const name of wanted) {
    const f = pickByName(projects, name, PROJECT)
    if (!f.row) errors.push(f.error!)
    else if (!linked.includes(f.row)) linked.push(f.row)
  }
  if (errors.length) return { writes: [], report: errors }

  const ix = new Index(rows)
  const area = str(args.area).trim() ? findByName(ix.areas, str(args.area)) : undefined
  const id = env.newId()
  // Como en la app: con etiqueta cuenta tareas; con cifra, una cifra a mano; si no, sus proyectos
  const kind = tag ? 'tasks' : target !== undefined && !linked.length ? 'number' : 'projects'
  const goal: Data = { id, title, why: str(args.por_que).trim(), kind, status: 'active', order: env.now, createdAt: env.now }
  if (kind !== 'projects') goal.target = target
  if (kind === 'number') {
    goal.current = 0
    goal.log = [{ date: ymdIn(env.now, env.tz), value: 0 }]
  }
  if (kind === 'tasks') goal.tag = tag
  const unit = str(args.unidad).trim()
  if (unit && kind === 'number') goal.unit = unit
  if (isYmd(args.limite)) goal.deadline = args.limite
  if (area) goal.areaId = area.id
  const writes: Row[] = [{ tbl: 'goals', id, data: goal }]
  for (const p of linked) writes.push({ tbl: 'projects', id: p.id, data: { ...p.data, id: p.id, goalId: id } })
  const how =
    kind === 'number' ? `0 de ${num(goal.target)}${unit ? ` ${unit}` : ''} (súmale con actualizar_objetivo)` : kind === 'tasks' ? `cuenta las tareas #${tag} que haga, hasta ${num(goal.target)}` : linked.length ? `con ${linked.map((p) => `«${str(p.data.name)}»`).join(', ')}` : 'se mide con sus proyectos (vincúlalos en la app o al crearlo con «proyectos»)'
  return {
    writes,
    report: [`Objetivo creado: «${title}»: ${how}${goal.deadline ? `, para ${goal.deadline}` : ''}${area ? `, área ${str(area.name)}` : ''}.${str(args.area).trim() && !area ? ` (No encontré el área «${str(args.area)}».)` : ''}`],
  }
}
