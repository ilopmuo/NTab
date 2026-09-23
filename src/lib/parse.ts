import { addMonths, addWeeks, addYears } from 'date-fns'
import type { Priority, Recurrence } from '@/db/types'
import { addDaysYmd, fromYmd, ymd } from './dates'
import { firstOccurrence } from './recurrence'

export interface ParseTarget {
  id: string
  name: string
}

export interface ParseContext {
  projects: (ParseTarget & { areaId?: string })[]
  areas: ParseTarget[]
  /** fecha de referencia (por defecto, ahora) */
  now?: Date
}

export interface ParsedTask {
  title: string
  dueDate?: string
  dueTime?: string
  priority: Priority
  tags: string[]
  projectId?: string
  areaId?: string
  recurrence?: Recurrence
}

// Límites de palabra que funcionan con acentos y ñ (\b no los entiende).
const B = '(?<=^|[\\s,;(])'
const E = '(?=$|[\\s,.;:!?)])'

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
}
const WEEKDAY_RE = '(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)'

const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
}
const MONTH_RE = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)'

const NUMBERS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  quince: 15,
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function toNumber(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) ? n : (NUMBERS[normalize(s)] ?? 1)
}

function weekdayIndex(word: string): number {
  const w = normalize(word)
  return WEEKDAYS[w] ?? WEEKDAYS[w.replace(/s$/, '')]
}

function nextWeekday(base: string, target: number, allowToday: boolean): string {
  const cur = fromYmd(base).getDay()
  let delta = (target - cur + 7) % 7
  if (delta === 0 && !allowToday) delta = 7
  return addDaysYmd(base, delta)
}

function unitFreq(u: string): Recurrence['freq'] {
  const n = normalize(u)
  if (n.startsWith('dia')) return 'day'
  if (n.startsWith('semana')) return 'week'
  if (n.startsWith('mes')) return 'month'
  return 'year'
}

function addUnit(base: string, n: number, u: string): string {
  const d = fromYmd(base)
  switch (unitFreq(u)) {
    case 'day':
      return addDaysYmd(base, n)
    case 'week':
      return ymd(addWeeks(d, n))
    case 'month':
      return ymd(addMonths(d, n))
    case 'year':
      return ymd(addYears(d, n))
  }
}

/** Fecha día/mes; si ya ha pasado este año, el año siguiente. */
function dayMonth(base: string, day: number, month: number, year?: number): string | undefined {
  const ref = fromYmd(base)
  let y = year ?? ref.getFullYear()
  if (y < 100) y += 2000
  const d = new Date(y, month, day)
  if (d.getMonth() !== month) return undefined
  if (year === undefined && ymd(d) < base) d.setFullYear(y + 1)
  return ymd(d)
}

export function matchTarget<T extends ParseTarget>(query: string, list: T[]): T | undefined {
  const q = normalize(query).replace(/[\s_-]/g, '')
  if (!q) return undefined
  const key = (t: T) => normalize(t.name).replace(/[\s_-]/g, '')
  return (
    list.find((t) => key(t) === q) ??
    list.find((t) => key(t).startsWith(q)) ??
    list.find((t) => key(t).includes(q))
  )
}

/**
 * Convierte texto libre en una tarea estructurada.
 * "Llamar al dentista mañana a las 10 !alta #salud +Personal"
 */
export function parseQuickAdd(input: string, ctx: ParseContext): ParsedTask {
  const base = ymd(ctx.now ?? new Date())
  let text = ` ${input} `
  const out: ParsedTask = { title: '', priority: 0, tags: [] }

  /** Aplica `fn` a la primera coincidencia que acepte y la elimina del texto. */
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    for (const m of text.matchAll(global)) {
      if (m.index === undefined || fn(m) === false) continue
      text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)
      return true
    }
    return false
  }

  // ── Etiquetas ─────────────────────────────────────────────
  text = text.replace(new RegExp(`${B}#([\\p{L}\\p{N}_-]+)`, 'gu'), (_, tag: string) => {
    const t = tag.toLowerCase()
    if (!out.tags.includes(t)) out.tags.push(t)
    return ' '
  })

  // ── Prioridad ─────────────────────────────────────────────
  take(new RegExp(`${B}(!{1,3}|!(alta|media|baja|[123]))${E}`, 'i'), (m) => {
    const raw = normalize(m[1])
    const map: Record<string, Priority> = {
      '!': 1,
      '!!': 2,
      '!!!': 3,
      '!alta': 3,
      '!media': 2,
      '!baja': 1,
      '!1': 3,
      '!2': 2,
      '!3': 1,
    }
    out.priority = map[raw] ?? 0
  })

  // ── Proyecto / área ───────────────────────────────────────
  take(new RegExp(`${B}\\+([\\p{L}\\p{N}_-]+)`, 'u'), (m) => {
    const p = matchTarget(m[1], ctx.projects)
    if (p) {
      out.projectId = p.id
      out.areaId = p.areaId
      return
    }
    const a = matchTarget(m[1], ctx.areas)
    if (a) {
      out.areaId = a.id
      return
    }
    return false
  })

  // ── Repetición ────────────────────────────────────────────
  const pre = `${B}(?:de\\s+|y\\s+)?`
  const recurrenceRules: [RegExp, (m: RegExpMatchArray) => Recurrence][] = [
    [
      new RegExp(`${pre}(?:cada\\s+d[ií]a\\s+laborable|d[ií]as\\s+laborables|entre\\s+semana|de\\s+lunes\\s+a\\s+viernes)${E}`, 'i'),
      () => ({ freq: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5] }),
    ],
    [
      new RegExp(`${pre}(?:cada\\s+fin\\s+de\\s+semana|los\\s+fines\\s+de\\s+semana)${E}`, 'i'),
      () => ({ freq: 'week', interval: 1, weekdays: [6, 0] }),
    ],
    [
      new RegExp(`${pre}(?:cada|todos\\s+los|todas\\s+las)\\s+${WEEKDAY_RE}((?:\\s*(?:,|y)\\s*${WEEKDAY_RE})*)${E}`, 'i'),
      (m) => {
        const words = [m[1], ...(m[2].match(new RegExp(WEEKDAY_RE, 'gi')) ?? [])]
        return { freq: 'week', interval: 1, weekdays: [...new Set(words.map(weekdayIndex))] }
      },
    ],
    [
      new RegExp(`${pre}cada\\s+(\\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince)\\s+(d[ií]as|semanas|meses|a[nñ]os)${E}`, 'i'),
      (m) => ({ freq: unitFreq(m[2]), interval: toNumber(m[1]) }),
    ],
    [
      new RegExp(`${pre}(?:cada|todos\\s+los|todas\\s+las)\\s+(d[ií]as?|semanas?|mes(?:es)?|a[nñ]os?)${E}`, 'i'),
      (m) => ({ freq: unitFreq(m[1]), interval: 1 }),
    ],
    [
      new RegExp(`${B}(diari[oa](?:mente)?|semanal(?:mente)?|mensual(?:mente)?|anual(?:mente)?)${E}`, 'i'),
      (m) => {
        const w = normalize(m[1])
        const freq: Recurrence['freq'] = w.startsWith('diari')
          ? 'day'
          : w.startsWith('semanal')
            ? 'week'
            : w.startsWith('mensual')
              ? 'month'
              : 'year'
        return { freq, interval: 1 }
      },
    ],
  ]
  for (const [re, build] of recurrenceRules) {
    if (take(re, (m) => void (out.recurrence = build(m)))) break
  }

  // ── Hora ──────────────────────────────────────────────────
  if (!take(new RegExp(`${B}(?:a\\s+)?(?:al\\s+)?mediod[ií]a${E}`, 'i'), () => void (out.dueTime = '12:00'))) {
    take(
      new RegExp(
        `${B}(a\\s+las?\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.|h|hrs?|horas)?(?:\\s+(?:de|por)\\s+la\\s+(mañana|manana|tarde|noche|madrugada))?${E}`,
        'i',
      ),
      (m) => {
        const [, prefix, hh, mm, suffix, period] = m
        // Un número suelto no es una hora ("comprar 3 manzanas")
        if (!prefix && !mm && !suffix && !period) return false
        let h = Number(hh)
        const min = mm ? Number(mm) : 0
        if (h > 23 || min > 59) return false
        const suf = suffix ? normalize(suffix).replace(/\./g, '') : ''
        const per = period ? normalize(period) : ''
        if ((suf === 'pm' || per === 'tarde' || per === 'noche') && h < 12) h += 12
        if ((suf === 'am' || per === 'manana' || per === 'madrugada') && h === 12) h = 0
        out.dueTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
      },
    )
  }

  // ── Fecha ─────────────────────────────────────────────────
  const setDate = (d?: string) => {
    if (!d) return false
    out.dueDate = d
  }
  const dateRules: [RegExp, (m: RegExpMatchArray) => boolean | void][] = [
    [new RegExp(`${B}pasado\\s+ma[nñ]ana${E}`, 'i'), () => setDate(addDaysYmd(base, 2))],
    [new RegExp(`${B}(?:hoy|esta\\s+(?:tarde|noche|ma[nñ]ana))${E}`, 'i'), () => setDate(base)],
    [new RegExp(`${B}(?<!la\\s)(?:ma[nñ]ana)${E}`, 'i'), () => setDate(addDaysYmd(base, 1))],
    [
      new RegExp(`${B}(?:(?:la\\s+)?(?:pr[oó]xima\\s+semana|semana\\s+que\\s+viene))${E}`, 'i'),
      () => setDate(nextWeekday(base, 1, false)),
    ],
    [
      new RegExp(`${B}(?:el\\s+)?(?:pr[oó]ximo\\s+mes|mes\\s+que\\s+viene)${E}`, 'i'),
      () => {
        const d = fromYmd(base)
        return setDate(ymd(new Date(d.getFullYear(), d.getMonth() + 1, 1)))
      },
    ],
    [
      new RegExp(`${B}(?:este\\s+|el\\s+)?fin\\s+de\\s+semana${E}`, 'i'),
      () => {
        const dow = fromYmd(base).getDay()
        return setDate(dow === 6 || dow === 0 ? base : nextWeekday(base, 6, true))
      },
    ],
    [
      new RegExp(`${B}(?:dentro\\s+de|en)\\s+(\\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince)\\s+(d[ií]as?|semanas?|mes(?:es)?|a[nñ]os?)${E}`, 'i'),
      (m) => setDate(addUnit(base, toNumber(m[1]), m[2])),
    ],
    [
      new RegExp(`${B}(?:el\\s+)?(?:d[ií]a\\s+)?(\\d{1,2})\\s+de\\s+${MONTH_RE}(?:\\s+(?:de|del)\\s+(\\d{4}))?${E}`, 'i'),
      (m) => setDate(dayMonth(base, Number(m[1]), MONTHS[normalize(m[2])], m[3] ? Number(m[3]) : undefined)),
    ],
    [
      new RegExp(`${B}(?:el\\s+)?(\\d{1,2})[/-](\\d{1,2})(?:[/-](\\d{2,4}))?${E}`, 'i'),
      (m) => setDate(dayMonth(base, Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : undefined)),
    ],
    [
      new RegExp(`${B}(este\\s+|el\\s+|pr[oó]ximo\\s+|el\\s+pr[oó]ximo\\s+)?${WEEKDAY_RE}(\\s+que\\s+viene)?${E}`, 'i'),
      (m) => {
        const mod = m[1] ? normalize(m[1].trim()) : ''
        return setDate(nextWeekday(base, weekdayIndex(m[2]), mod === 'este'))
      },
    ],
    [
      new RegExp(`${B}el\\s+(?:d[ií]a\\s+)?(\\d{1,2})${E}`, 'i'),
      (m) => {
        const day = Number(m[1])
        if (day < 1 || day > 31) return false
        const ref = fromYmd(base)
        for (let i = 0; i < 3; i++) {
          const d = new Date(ref.getFullYear(), ref.getMonth() + i, day)
          if (d.getDate() === day && ymd(d) >= base) return setDate(ymd(d))
        }
        return false
      },
    ],
  ]
  for (const [re, fn] of dateRules) {
    if (take(re, fn)) break
  }

  if (out.recurrence && !out.dueDate) out.dueDate = firstOccurrence(base, out.recurrence)
  if (out.dueTime && !out.dueDate) out.dueDate = base

  out.title = text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .replace(/\s+(a|el|la|de|para|y|en)$/i, '')
    .trim()
  return out
}
