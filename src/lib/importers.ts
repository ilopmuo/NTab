/**
 * Traer las tareas de otra app (como hacen Todoist y TickTick entre ellas):
 * Todoist (CSV de cada proyecto), TickTick (copia de seguridad en CSV), Google
 * Tasks (Google Takeout, JSON) o una lista pegada (Notas, Markdown…). Aquí solo
 * se leen; las crea src/features/settings/ImportBlock.tsx.
 */
import type { Priority, Recurrence } from '@/db/types'
import { parseQuickAdd } from './parse'
import { listLines } from './lines'
import { findUrl } from './links'
import { hhmmIn, ymdIn } from '../../supabase/functions/_shared/time.ts'

export interface ImportTask {
  title: string
  notes: string
  dueDate?: string
  dueTime?: string
  recurrence?: Recurrence
  priority: Priority
  tags: string[]
  project?: string
  section?: string
  done: boolean
  subtasks: { title: string; done: boolean }[]
}

export interface ImportResult {
  source: 'Todoist' | 'TickTick' | 'Google Tasks' | 'Lista'
  tasks: ImportTask[]
  /** proyectos con sus secciones, en orden */
  projects: { name: string; sections: string[] }[]
  /** lo que no se trae (notas sueltas de TickTick, filas vacías…) */
  skipped: number
}

// ── CSV ──────────────────────────────────────────────────────

/** CSV con comillas, comillas dobladas y saltos de línea dentro (coma o punto y coma) */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? undefined : src.indexOf('\n'))
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const table = (rows: string[][], header: number) => {
  const keys = rows[header].map((h) => h.trim().toUpperCase())
  return rows.slice(header + 1).map((r) => (k: string) => (r[keys.indexOf(k.toUpperCase())] ?? '').trim())
}

/** «[Título](https://…)» de Markdown: el texto, y el enlace aparte */
function markdownLink(s: string): { text: string; url?: string } {
  const m = s.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/)
  if (m) return { text: s.replace(m[0], m[1]).trim(), url: m[2] }
  const l = findUrl(s)
  return l && l.rest ? { text: l.rest, url: l.url } : { text: s.trim() }
}

const joinNotes = (...parts: (string | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join('\n')

// ── Fechas en inglés (Todoist en inglés) → como se escriben en LUNO ──

const MONTHS_EN: Record<string, string> = {
  jan: 'enero', feb: 'febrero', mar: 'marzo', apr: 'abril', may: 'mayo', jun: 'junio', jul: 'julio', aug: 'agosto', sep: 'septiembre', sept: 'septiembre', oct: 'octubre', nov: 'noviembre', dec: 'diciembre',
}
const WORDS_EN: [RegExp, string][] = [
  [/\bevery other\b/g, 'cada 2'],
  [/\bevery\b/g, 'cada'],
  [/\bdays?\b/g, 'día'],
  [/\bweeks?\b/g, 'semana'],
  [/\bmonths?\b/g, 'mes'],
  [/\byears?\b/g, 'año'],
  [/\btoday\b/g, 'hoy'],
  [/\btomorrow\b/g, 'mañana'],
  [/\bmon(day)?\b/g, 'lunes'],
  [/\btue(s|sday)?\b/g, 'martes'],
  [/\bwed(nesday)?\b/g, 'miércoles'],
  [/\bthu(rs|rsday)?\b/g, 'jueves'],
  [/\bfri(day)?\b/g, 'viernes'],
  [/\bsat(urday)?\b/g, 'sábado'],
  [/\bsun(day)?\b/g, 'domingo'],
  [/\bweekday\b/g, 'día laborable'],
  [/\band\b/g, 'y'],
  [/\bat\b/g, 'a las'],
]
export function englishDate(s: string) {
  let t = ` ${s.toLowerCase().replace(/,/g, ' ')} `
  // «Oct 15 2026», «15 Oct», «October 15»
  t = t.replace(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b/g, (all, mon: string, d: string, y?: string) => {
    const es = MONTHS_EN[mon.slice(0, mon.startsWith('sept') ? 4 : 3)]
    return es ? `${d} de ${es}${y ? ` de ${y}` : ''}` : all
  })
  t = t.replace(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?\b/g, (all, d: string, mon: string, y?: string) => {
    const es = MONTHS_EN[mon.slice(0, mon.startsWith('sept') ? 4 : 3)]
    return es ? `${d} de ${es}${y ? ` de ${y}` : ''}` : all
  })
  for (const [re, es] of WORDS_EN) t = t.replace(re, es)
  return t.replace(/\s+/g, ' ').trim()
}

/** Una fecha escrita (en español o en inglés) → día, hora y repetición */
function readDate(text: string, lang: string, today: string) {
  const raw = text.trim()
  if (!raw) return {}
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/)
  if (iso) return { dueDate: iso[1], dueTime: iso[2] }
  const read = (s: string) => parseQuickAdd(`x ${s}`, { projects: [], areas: [], today })
  let p = read(lang.startsWith('en') ? englishDate(raw) : raw)
  // «15 oct», «Oct 15»: los meses abreviados se escriben igual en los dos idiomas
  if (!p.dueDate && !lang.startsWith('en')) p = read(englishDate(raw))
  return { dueDate: p.dueDate, dueTime: p.dueTime, recurrence: p.recurrence, understood: !!p.dueDate }
}

// ── Todoist ──────────────────────────────────────────────────

/** Prioridad de Todoist en el CSV: 1 es la más alta (p1) y 4 la normal */
const TODOIST_PRIORITY: Record<string, Priority> = { '1': 3, '2': 2, '3': 1, '4': 0 }

/**
 * CSV de un proyecto de Todoist (Proyecto → ⋯ → Exportar como CSV): filas de
 * tarea, sección y comentario; la sangría (INDENT) marca las subtareas.
 */
export function fromTodoist(csv: string, project: string, today: string): ImportResult {
  const rows = parseCsv(csv)
  const out: ImportResult = { source: 'Todoist', tasks: [], projects: [{ name: project, sections: [] }], skipped: 0 }
  if (!rows.length) return out
  let section: string | undefined
  let parent: ImportTask | undefined
  for (const get of table(rows, 0)) {
    const type = get('TYPE').toLowerCase()
    const content = get('CONTENT')
    if (type === 'section') {
      section = content.replace(/:$/, '').trim() || undefined
      if (section && !out.projects[0].sections.includes(section)) out.projects[0].sections.push(section)
      continue
    }
    if (type === 'note' || type === 'comment') {
      if (parent && content) parent.notes = joinNotes(parent.notes, content)
      continue
    }
    if (type !== 'task' || !content) {
      if (type) out.skipped++
      continue
    }
    // Las etiquetas van en el texto con @
    const tags: string[] = []
    const text = content.replace(/(^|\s)@([\p{L}\p{N}_-]+)/gu, (_, sp: string, tag: string) => (tags.push(tag.toLowerCase()), sp)).trim()
    const { text: title, url } = markdownLink(text)
    const indent = Number(get('INDENT')) || 1
    if (indent > 1 && parent) {
      parent.subtasks.push({ title, done: false })
      continue
    }
    const date = readDate(get('DATE'), get('DATE_LANG') || 'es', today)
    const deadline = get('DEADLINE')
    parent = {
      title,
      notes: joinNotes(get('DESCRIPTION'), url, get('DATE') && !date.understood && !date.dueDate ? `Fecha en Todoist: ${get('DATE')}` : undefined, deadline ? `Fecha límite en Todoist: ${deadline}` : undefined),
      dueDate: date.dueDate,
      dueTime: date.dueTime,
      recurrence: date.recurrence,
      priority: TODOIST_PRIORITY[get('PRIORITY')] ?? 0,
      tags,
      project,
      section,
      done: false,
      subtasks: [],
    }
    out.tasks.push(parent)
  }
  return out
}

// ── TickTick ─────────────────────────────────────────────────

const TICK_PRIORITY: Record<string, Priority> = { '0': 0, '1': 1, '3': 2, '5': 3 }
const DAY_CODES: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/** «FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH» → repetición de LUNO */
export function fromRrule(rule: string): Recurrence | undefined {
  const parts = Object.fromEntries(
    rule
      .replace(/^RRULE:/i, '')
      .split(';')
      .map((p) => p.split('=') as [string, string]),
  )
  const FREQS: Record<string, Recurrence['freq']> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }
  const freq = FREQS[String(parts.FREQ).toUpperCase()]
  if (!freq) return undefined
  const weekdays = parts.BYDAY ? String(parts.BYDAY).split(',').map((d) => DAY_CODES[d.slice(-2).toUpperCase()]).filter((d) => d !== undefined) : undefined
  return { freq, interval: Math.max(1, Number(parts.INTERVAL) || 1), ...(freq === 'week' && weekdays?.length ? { weekdays } : {}) }
}

/**
 * Copia de seguridad de TickTick (Ajustes → Cuenta → Generar copia de
 * seguridad): unas líneas de cabecera y luego una fila por tarea, con su lista,
 * etiquetas, fechas (en UTC con su zona horaria), repetición y subtareas.
 */
export function fromTickTick(csv: string, tz: string): ImportResult {
  const rows = parseCsv(csv)
  const out: ImportResult = { source: 'TickTick', tasks: [], projects: [], skipped: 0 }
  const header = rows.findIndex((r) => r.some((c) => c.trim() === 'Title') && r.some((c) => /^(List Name|Folder Name)$/.test(c.trim())))
  if (header < 0) return out
  const byId = new Map<string, ImportTask>()
  const children: { parentId: string; title: string; done: boolean }[] = []
  for (const get of table(rows, header)) {
    const title = get('Title')
    if (!title) continue
    if (get('Kind').toUpperCase() === 'NOTE') {
      out.skipped++
      continue
    }
    const done = get('Status') === '1' || get('Status') === '2'
    if (get('parentId')) {
      children.push({ parentId: get('parentId'), title, done })
      continue
    }
    const project = get('List Name') || undefined
    if (project && !/^(inbox|bandeja de entrada)$/i.test(project) && !out.projects.some((p) => p.name === project)) out.projects.push({ name: project, sections: [] })
    const section = get('Column Name') || undefined
    if (section && project) {
      const p = out.projects.find((x) => x.name === project)
      if (p && !p.sections.includes(section)) p.sections.push(section)
    }
    // Las listas de comprobación vienen en el contenido: ▫ pendiente, ▪ hecha
    const content = get('Content')
    const checklist = get('Is Check list').toUpperCase() === 'Y'
    const items = checklist ? content.split(/\n/).filter((l) => /^[▫▪]/.test(l.trim())) : []
    const due = get('Due Date') || get('Start Date')
    const zone = get('Timezone') || tz
    const allDay = get('Is All Day').toLowerCase() !== 'false'
    const at = due ? Date.parse(due.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN
    const t: ImportTask = {
      title,
      notes: checklist ? content.split(/\n/).filter((l) => !/^[▫▪]/.test(l.trim())).join('\n').trim() : content,
      dueDate: Number.isFinite(at) ? ymdIn(at, zone) : undefined,
      dueTime: Number.isFinite(at) && !allDay ? hhmmIn(at, zone) : undefined,
      recurrence: get('Repeat') ? fromRrule(get('Repeat')) : undefined,
      priority: TICK_PRIORITY[get('Priority')] ?? 0,
      tags: get('Tags')
        .split(/[,，]/)
        .map((x) => x.trim().replace(/^#/, '').toLowerCase())
        .filter(Boolean),
      project: project && !/^(inbox|bandeja de entrada)$/i.test(project) ? project : undefined,
      section: project && section ? section : undefined,
      done,
      subtasks: items.map((l) => ({ title: l.trim().slice(1).trim(), done: l.trim().startsWith('▪') })),
    }
    out.tasks.push(t)
    if (get('taskId')) byId.set(get('taskId'), t)
  }
  for (const c of children) {
    const p = byId.get(c.parentId)
    if (p) p.subtasks.push({ title: c.title, done: c.done })
    else out.skipped++
  }
  return out
}

// ── Google Tasks ─────────────────────────────────────────────

interface GTask {
  id?: string
  title?: string
  notes?: string
  status?: string
  due?: string
  parent?: string
  deleted?: boolean
}

/** Google Takeout → Tasks (Tasks.json): cada lista es un proyecto (la principal, a la Bandeja) */
export function fromGoogleTasks(json: string): ImportResult {
  const out: ImportResult = { source: 'Google Tasks', tasks: [], projects: [], skipped: 0 }
  let data: { items?: { title?: string; items?: GTask[] }[] }
  try {
    data = JSON.parse(json)
  } catch {
    return out
  }
  const lists = Array.isArray(data.items) ? data.items : []
  lists.forEach((list, i) => {
    // La primera lista («Mis tareas») es la de siempre: a la Bandeja
    const project = i === 0 || /^(mis tareas|my tasks)$/i.test(list.title ?? '') ? undefined : list.title?.trim() || undefined
    if (project) out.projects.push({ name: project, sections: [] })
    const items = (list.items ?? []).filter((t) => !t.deleted && t.title?.trim())
    const byId = new Map<string, ImportTask>()
    for (const g of items.filter((t) => !t.parent)) {
      const t: ImportTask = {
        title: g.title!.trim(),
        notes: g.notes ?? '',
        // Google guarda el día a medianoche UTC (sin hora)
        dueDate: g.due?.slice(0, 10),
        priority: 0,
        tags: [],
        project,
        done: g.status === 'completed',
        subtasks: [],
      }
      out.tasks.push(t)
      if (g.id) byId.set(g.id, t)
    }
    for (const g of items.filter((t) => t.parent)) {
      const p = byId.get(g.parent!)
      if (p) p.subtasks.push({ title: g.title!.trim(), done: g.status === 'completed' })
      else out.skipped++
    }
  })
  return out
}

// ── Una lista pegada ─────────────────────────────────────────

/** Una tarea por línea, entendida como en la captura rápida; lo sangrado, subtareas */
export function fromText(text: string, today: string): ImportResult {
  const out: ImportResult = { source: 'Lista', tasks: [], projects: [], skipped: 0 }
  let parent: ImportTask | undefined
  for (const line of listLines(text)) {
    if (line.depth > 0 && parent) {
      parent.subtasks.push({ title: line.text, done: line.done })
      continue
    }
    const link = findUrl(line.text)
    const p = parseQuickAdd(link ? link.rest : line.text, { projects: [], areas: [], today })
    parent = {
      title: p.title || line.text,
      notes: link?.url ?? '',
      dueDate: p.dueDate,
      dueTime: p.dueTime,
      recurrence: p.recurrence,
      priority: p.priority,
      tags: p.tags,
      done: line.done,
      subtasks: [],
    }
    out.tasks.push(parent)
  }
  return out
}

/** Qué es lo que se ha subido o pegado */
export function readImport(text: string, fileName: string, today: string, tz: string): ImportResult {
  const name = fileName.replace(/\.[a-z0-9]+$/i, '').trim()
  if (/^\s*[{[]/.test(text) && /tasks#task/.test(text)) return fromGoogleTasks(text)
  const head = text.slice(0, 3000)
  if (/"?Folder Name"?\s*,\s*"?List Name"?/.test(head) || /"?List Name"?\s*,\s*"?Title"?/.test(head)) return fromTickTick(text, tz)
  if (/^﻿?"?TYPE"?\s*,\s*"?CONTENT"?/i.test(head)) return fromTodoist(text, name || 'Todoist', today)
  return fromText(text, today)
}
