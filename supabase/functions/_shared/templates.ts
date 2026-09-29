/**
 * Plantillas: listas reutilizables (maleta de viaje, cierre de mes…).
 * Sin dependencias: la usan la app y el conector de Claude.
 */
import { addDays } from './time.ts'

export interface TemplateItemLike {
  title: string
  /** días desde el inicio (0 = el día de inicio; negativo = antes); sin valor = sin fecha */
  offset?: number
  time?: string
  priority?: number
  subtasks?: string[]
  /** sección del proyecto (por nombre) */
  section?: string
}

export interface ExpandedTask {
  title: string
  dueDate?: string
  dueTime?: string
  priority: 0 | 1 | 2 | 3
  subtasks: string[]
  section?: string
}

/** Convierte los elementos de una plantilla en tareas con fecha real */
export function expandTemplate(items: TemplateItemLike[], start: string): ExpandedTask[] {
  return items
    .filter((it) => it.title?.trim())
    .map((it) => {
      const hasDate = typeof it.offset === 'number' && Number.isFinite(it.offset)
      const out: ExpandedTask = {
        title: it.title.trim(),
        priority: Math.max(0, Math.min(3, Math.round(it.priority ?? 0))) as ExpandedTask['priority'],
        subtasks: (it.subtasks ?? []).map((s) => s.trim()).filter(Boolean),
      }
      if (it.section?.trim()) out.section = it.section.trim()
      if (hasDate) out.dueDate = addDays(start, Math.round(it.offset!))
      if (hasDate && it.time && /^\d{2}:\d{2}$/.test(it.time)) out.dueTime = it.time
      return out
    })
}

/**
 * Plantilla a partir de tareas existentes: las fechas pasan a ser relativas a
 * la primera fecha (así la plantilla se puede reutilizar cualquier día).
 */
export function itemsFromTasks(
  tasks: { title: string; dueDate?: string; dueTime?: string; priority?: number; subtasks?: { title: string }[]; order?: number; section?: string }[],
): TemplateItemLike[] {
  const dates = tasks.map((t) => t.dueDate).filter((d): d is string => !!d).sort()
  const first = dates[0]
  const days = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 864e5)
  return [...tasks]
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.order ?? 0) - (b.order ?? 0))
    .map((t) => {
      const item: TemplateItemLike = { title: t.title }
      if (t.dueDate && first) item.offset = days(t.dueDate)
      if (t.dueDate && t.dueTime) item.time = t.dueTime
      if (t.priority) item.priority = t.priority
      if (t.subtasks?.length) item.subtasks = t.subtasks.map((s) => s.title)
      if (t.section) item.section = t.section
      return item
    })
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

/**
 * Secciones para las tareas de una plantilla: reutiliza las del proyecto que se
 * llamen igual y añade las que falten, en el orden en que aparecen.
 */
export function planSections<S extends { id: string; name: string }>(existing: S[], names: (string | undefined)[], newId: () => string) {
  const sections: { id: string; name: string }[] = [...existing]
  const ids = new Map(existing.map((s) => [fold(s.name), s.id]))
  for (const n of names) {
    if (!n?.trim() || ids.has(fold(n))) continue
    const s = { id: newId(), name: n.trim() }
    sections.push(s)
    ids.set(fold(n), s.id)
  }
  return { sections, changed: sections.length !== existing.length, idFor: (name?: string) => (name ? ids.get(fold(name)) : undefined) }
}
