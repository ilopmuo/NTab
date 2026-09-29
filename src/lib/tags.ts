import type { Task } from '@/db/types'

export interface TagStat {
  tag: string
  /** tareas pendientes con la etiqueta */
  open: number
  /** todas (también las hechas) */
  total: number
}

/** Etiquetas en uso, las más usadas primero (a igualdad, por orden alfabético) */
export function tagStats(tasks: Pick<Task, 'tags' | 'done'>[]): TagStat[] {
  const m = new Map<string, TagStat>()
  for (const t of tasks) {
    for (const tag of new Set(t.tags ?? [])) {
      const s = m.get(tag) ?? { tag, open: 0, total: 0 }
      s.total++
      if (!t.done) s.open++
      m.set(tag, s)
    }
  }
  return [...m.values()].sort((a, b) => b.open - a.open || b.total - a.total || a.tag.localeCompare(b.tag, 'es'))
}

/** Nombre de etiqueta válido (lo que reconoce «#…» al escribir): sin espacios (se cambian por guiones), sin signos y en minúsculas */
export function cleanTag(s: string) {
  return s
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .toLowerCase()
}

/** Cambia `from` por `to` en una lista de etiquetas (si ya estaba `to`, se juntan) */
export function replaceTag(tags: string[], from: string, to: string) {
  return [...new Set(tags.map((t) => (t === from ? to : t)).filter(Boolean))]
}
