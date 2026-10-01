import { addDaysYmd, capitalize, fmt, today, ymd } from './dates'

/**
 * Grupo de una nota en la lista, como en Notas de Apple: Hoy, Ayer, 7 días,
 * 30 días y, lo anterior, por mes (con el año si no es el actual).
 */
export function noteGroup(updatedAt: number, ref = today()): string {
  const d = ymd(new Date(updatedAt))
  if (d >= ref) return 'Hoy'
  if (d === addDaysYmd(ref, -1)) return 'Ayer'
  if (d > addDaysYmd(ref, -7)) return 'Últimos 7 días'
  if (d > addDaysYmd(ref, -30)) return 'Últimos 30 días'
  return capitalize(fmt(d, d.slice(0, 4) === ref.slice(0, 4) ? 'MMMM' : 'MMMM yyyy'))
}

/** Agrupa una lista ordenada de más reciente a más antigua (las fijadas, aparte y primero) */
export function groupNotes<T extends { pinned?: number | boolean; updatedAt: number }>(notes: T[], ref = today()): { title: string; items: T[] }[] {
  const pinned = notes.filter((n) => n.pinned)
  const groups = new Map<string, T[]>()
  for (const n of notes.filter((x) => !x.pinned)) {
    const title = noteGroup(n.updatedAt, ref)
    groups.set(title, [...(groups.get(title) ?? []), n])
  }
  return [...(pinned.length ? [{ title: 'Fijadas', items: pinned }] : []), ...[...groups].map(([title, items]) => ({ title, items }))]
}
