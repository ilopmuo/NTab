/**
 * Lenguaje natural de la captura rápida («Llamar al dentista mañana a las 10
 * !alta #salud»). Sin dependencias: lo usan la app (src/lib/parse.ts) y el
 * servidor (captura con Siri en el conector). Las fechas son 'YYYY-MM-DD' y se
 * calculan en UTC para que den lo mismo en el navegador y en Deno.
 */
import { addDays, addMonths, weekday } from './time.ts'
import { parseDuration } from './duration.ts'
import { normalize } from './text.ts'

export type Priority = 0 | 1 | 2 | 3
export interface Recurrence {
  freq: 'day' | 'week' | 'month' | 'year'
  interval: number
  weekdays?: number[]
  afterDone?: boolean
}
export type Reminder = { before: number } | { at: number }

export interface ParseTarget {
  id: string
  name: string
}

export interface ParseContext {
  projects: (ParseTarget & { areaId?: string })[]
  areas: ParseTarget[]
  /** para "@Ana" */
  people?: ParseTarget[]
  /** fecha de referencia (por defecto, ahora) */
  now?: Date
  /** «hoy» ya calculado en la zona horaria del usuario (el servidor va en UTC) */
  today?: string
  /** hora local actual 'HH:MM' en la zona del usuario (para «dentro de 2 horas»); por defecto, la de `now` */
  time?: string
}

export interface ParsedTask {
  title: string
  dueDate?: string
  /** fecha límite («antes del viernes»): para cuándo tiene que estar, aparte de cuándo hacerla */
  deadline?: string
  /** «algún día»: sin fecha y fuera de la Bandeja */
  someday?: boolean
  dueTime?: string
  priority: Priority
  tags: string[]
  /** personas mencionadas con @ que existen */
  people?: string[]
  projectId?: string
  areaId?: string
  recurrence?: Recurrence
  reminder?: Reminder
  /** duración estimada en minutos ("~30m", "~1h30") */
  estimate?: number
  /** insistir: repetir el aviso cada N minutos */
  nag?: number
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
  treinta: 30,
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

const pad = (n: number) => String(n).padStart(2, '0')
const utcYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
/** 'YYYY-MM-DD' local de un instante (en el navegador, su zona horaria) */
const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const ymdParts = (s: string) => s.split('-').map(Number) as [number, number, number]

/** Primera fecha (incluida `from`) que cumple la regla */
function firstOccurrence(from: string, r: Recurrence): string {
  if (r.freq === 'week' && r.weekdays?.length) {
    for (let i = 0; i < 7; i++) {
      const cand = addDays(from, i)
      if (r.weekdays.includes(weekday(cand))) return cand
    }
  }
  return from
}

export { normalize }

function toNumber(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) ? n : (NUMBERS[normalize(s)] ?? 1)
}

function weekdayIndex(word: string): number {
  const w = normalize(word)
  return WEEKDAYS[w] ?? WEEKDAYS[w.replace(/s$/, '')]
}

function nextWeekday(base: string, target: number, allowToday: boolean): string {
  const cur = weekday(base)
  let delta = (target - cur + 7) % 7
  if (delta === 0 && !allowToday) delta = 7
  return addDays(base, delta)
}

function unitFreq(u: string): Recurrence['freq'] {
  const n = normalize(u)
  if (n.startsWith('dia')) return 'day'
  if (n.startsWith('semana')) return 'week'
  if (n.startsWith('mes')) return 'month'
  return 'year'
}

function addUnit(base: string, n: number, u: string): string {
  switch (unitFreq(u)) {
    case 'day':
      return addDays(base, n)
    case 'week':
      return addDays(base, 7 * n)
    case 'month':
      return addMonths(base, n)
    case 'year':
      return addMonths(base, 12 * n)
  }
}

/** Fecha día/mes; si ya ha pasado este año, el año siguiente. */
function dayMonth(base: string, day: number, month: number, year?: number): string | undefined {
  let y = year ?? ymdParts(base)[0]
  if (y < 100) y += 2000
  const d = new Date(Date.UTC(y, month, day))
  if (d.getUTCMonth() !== month) return undefined
  if (year === undefined && utcYmd(d) < base) d.setUTCFullYear(y + 1)
  return utcYmd(d)
}

const targetKey = (s: string) => normalize(s).replace(/[\s_-]/g, '')

/** Solo si el nombre coincide entero (sin mayúsculas, tildes ni espacios) */
function exactTarget<T extends ParseTarget>(query: string, list: T[]): T | undefined {
  const q = targetKey(query)
  return q ? list.find((t) => targetKey(t.name) === q) : undefined
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
  const nowDate = ctx.now ?? new Date()
  const base = ctx.today ?? localYmd(nowDate)
  const [nowH, nowM] = (ctx.time ?? `${pad(nowDate.getHours())}:${pad(nowDate.getMinutes())}`).split(':').map(Number)
  const nowMin = nowH * 60 + nowM
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

  // ── Personas ──────────────────────────────────────────────
  // "@Ana": se enlaza a la persona y el nombre se queda en el título
  // ("Llamar a @ana" → "Llamar a Ana"); si no existe, solo se quita la @.
  text = text.replace(new RegExp(`${B}@([\\p{L}\\p{N}_-]+)`, 'gu'), (_, name: string) => {
    const p = ctx.people?.length ? matchTarget(name, ctx.people) : undefined
    if (!p) return name
    out.people = [...new Set([...(out.people ?? []), p.id])]
    const first = p.name.trim().split(/\s+/)[0]
    return normalize(first).startsWith(normalize(name)) ? first : name
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
  // «+Salud», «+web» (basta el principio) y también nombres de varias palabras
  // escritos enteros: «+Web nueva», «+Viaje a Lisboa»
  for (const m of text.matchAll(new RegExp(`${B}\\+([\\p{L}\\p{N}_-]+)`, 'gu'))) {
    if (m.index === undefined) continue
    const end = m.index + m[0].length
    const words = text.slice(end).match(/^(?:\s+[\p{L}\p{N}_-]+){1,5}/u)?.[0].match(/\s+[\p{L}\p{N}_-]+/gu) ?? []
    let found: { projectId?: string; areaId?: string } | undefined
    let extra = 0
    for (let k = words.length; k > 0 && !found; k--) {
      const name = m[1] + words.slice(0, k).join('')
      const p = exactTarget(name, ctx.projects)
      const a = p ? undefined : exactTarget(name, ctx.areas)
      if (p || a) {
        found = p ? { projectId: p.id, areaId: p.areaId } : { areaId: a!.id }
        extra = words.slice(0, k).join('').length
      }
    }
    if (!found) {
      const p = matchTarget(m[1], ctx.projects)
      const a = p ? undefined : matchTarget(m[1], ctx.areas)
      if (p || a) found = p ? { projectId: p.id, areaId: p.areaId } : { areaId: a!.id }
    }
    if (!found) continue
    if (found.projectId) out.projectId = found.projectId
    out.areaId = found.areaId
    text = text.slice(0, m.index) + ' ' + text.slice(end + extra)
    break
  }

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
      // «lunes, miércoles y viernes» (dos o más días, sin «cada»): cada semana esos días
      new RegExp(`${B}(?:los\\s+)?${WEEKDAY_RE}((?:\\s*(?:,|y)\\s*${WEEKDAY_RE})+)${E}`, 'i'),
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
  // "cada 3 días desde que la haga": la siguiente cuenta desde que se completa
  if (out.recurrence) {
    take(
      new RegExp(`${B}(?:desde\\s+que\\s+la\\s+(?:haga|complete|termine|hago|completo|termino)|despu[eé]s\\s+de\\s+(?:hacerla|completarla)|tras\\s+(?:hacerla|completarla))${E}`, 'i'),
      () => void (out.recurrence = { ...out.recurrence!, afterDone: true }),
    )
  }

  // ── Aviso ─────────────────────────────────────────────────
  // "recuérdame", "avísame", "avísame 15 minutos antes", "con aviso 1 día antes"
  take(
    new RegExp(
      `${B}(?:recu[eé]rdamelo|recu[eé]rdame|av[ií]same|con\\s+aviso)(?:\\s+(\\d+|un|una|dos|tres|cinco|diez|quince|treinta)\\s+(minutos?|min|horas?|h|d[ií]as?)\\s+antes)?${E}`,
      'i',
    ),
    (m) => {
      let before = 0
      if (m[1]) {
        const n = toNumber(m[1])
        const u = normalize(m[2])
        before = u.startsWith('d') ? n * 1440 : u.startsWith('h') ? n * 60 : n
      }
      out.reminder = { before }
    },
  )

  // ── Duración ──────────────────────────────────────────────
  // "~30m", "~45 min", "~2h", "~1h30", "~1,5h" (antes que la hora: "2h" no es una hora)
  take(new RegExp(`${B}~\\s*(\\d+(?:[.,]\\d+)?\\s*(?:h|hrs?|horas?|m|min|mins|minutos?)?(?:\\s*\\d{1,2}\\s*(?:m|min)?)?)${E}`, 'i'), (m) => {
    const min = parseDuration(m[1].replace(/\s+/g, ''))
    if (!min) return false
    out.estimate = min
  })

  // ── Insistir ──────────────────────────────────────────────
  // "insísteme", "insiste cada 5 minutos", "hasta que lo haga"
  take(
    new RegExp(`${B}(?:ins[ií]steme|insiste|insistir|y\\s+no\\s+pares|hasta\\s+que\\s+lo\\s+(?:haga|haya\\s+hecho))(?:\\s+cada\\s+(\\d+|cinco|diez|quince|treinta)\\s*(?:minutos?|min))?${E}`, 'i'),
    (m) => {
      out.nag = m[1] ? toNumber(m[1]) : 10
      if (!out.reminder) out.reminder = { before: 0 }
    },
  )

  // ── Hora ──────────────────────────────────────────────────
  // «dentro de 2 horas», «en 30 minutos», «en media hora»: fecha y hora desde ahora
  let relative = false
  take(
    new RegExp(`${B}(?:dentro\\s+de|en)\\s+(\\d+|un|una|dos|tres|cuatro|cinco|diez|quince|veinte|treinta|media)\\s*(horas?|h|minutos?|min)${E}`, 'i'),
    (m) => {
      const word = normalize(m[1])
      const unit = normalize(m[2])
      const n = word === 'media' ? 0.5 : toNumber(m[1])
      const minutes = Math.round(unit.startsWith('h') ? n * 60 : n)
      if (!minutes || minutes > 7 * 1440) return false
      // Redondeado a los 5 minutos siguientes
      const at = Math.ceil((nowMin + minutes) / 5) * 5
      out.dueDate = addDays(base, Math.floor(at / 1440))
      out.dueTime = `${pad(Math.floor((at % 1440) / 60))}:${pad(at % 60)}`
      relative = true
    },
  )
  // Franja del día sin hora concreta: «a primera hora», «por la tarde» (se aplica si hay fecha)
  let slot: string | undefined
  let slotText = ''
  if (!relative) {
    take(new RegExp(`${B}(?:a\\s+)?primera\\s+hora(?:\\s+de\\s+la\\s+ma[nñ]ana)?${E}`, 'i'), (m) => {
      slot = '09:00'
      slotText = m[0]
    })
  }
  if (!relative && !take(new RegExp(`${B}(?:a\\s+)?(?:al\\s+)?mediod[ií]a${E}`, 'i'), () => void (out.dueTime = '12:00'))) {
    take(
      new RegExp(
        `${B}(a\\s+las?\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?(?:\\s+(y\\s+(?:media|cuarto|\\d{1,2})|menos\\s+(?:cuarto|\\d{1,2})))?\\s*(am|pm|a\\.m\\.|p\\.m\\.|h|hrs?|horas)?(?:\\s+(?:de|por)\\s+la\\s+(mañana|manana|tarde|noche|madrugada))?${E}`,
        'i',
      ),
      (m) => {
        const [, prefix, hh, mm, words, suffix, period] = m
        // Un número suelto no es una hora ("comprar 3 manzanas")
        if (!prefix && !mm && !words && !suffix && !period) return false
        const suf = suffix ? normalize(suffix).replace(/\./g, '') : ''
        let h = Number(hh)
        // «2 horas», «3h» sin «a las»: es una duración, no una hora (salvo «17h»)
        if (!prefix && !mm && !words && !period && (suf.startsWith('hora') || (suf.startsWith('h') && h < 7))) return false
        let min = mm ? Number(mm) : 0
        if (words) {
          const w = normalize(words).replace(/\s+/g, ' ')
          const n = (x: string) => (x === 'media' ? 30 : x === 'cuarto' ? 15 : Number(x))
          if (w.startsWith('y ')) min = n(w.slice(2))
          else {
            min = 60 - n(w.slice(6))
            h -= 1
          }
          if (!(min >= 0 && min <= 59)) return false
        }
        if (h > 23 || h < 0 || min > 59) return false
        const per = period ? normalize(period) : ''
        if ((suf === 'pm' || per === 'tarde' || per === 'noche') && h < 12) h += 12
        if ((suf === 'am' || per === 'manana' || per === 'madrugada') && h === 12) h = 0
        // «a las 5» sin más: por la tarde (nadie apunta tareas a las 5 de la madrugada)
        if (!suf && !per && h >= 1 && h <= 6) h += 12
        out.dueTime = `${pad(h)}:${pad(min)}`
      },
    )
  }
  if (!relative && !out.dueTime && !slot) {
    take(new RegExp(`${B}por\\s+la\\s+(ma[nñ]ana|tarde|noche)${E}`, 'i'), (m) => {
      const w = normalize(m[1])
      slot = w === 'manana' ? '09:00' : w === 'tarde' ? '17:00' : '21:00'
      slotText = m[0]
    })
  }

  // ── Fecha ─────────────────────────────────────────────────
  // Las mismas reglas sirven para la fecha («cuándo la hago») y para la fecha
  // límite («antes del viernes»): `target` dice dónde va la que se encuentre.
  let target: 'dueDate' | 'deadline' = 'dueDate'
  const setDate = (d?: string) => {
    if (!d) return false
    out[target] = d
  }
  const dateRules: [RegExp, (m: RegExpMatchArray) => boolean | void][] = [
    [new RegExp(`${B}pasado\\s+ma[nñ]ana${E}`, 'i'), () => setDate(addDays(base, 2))],
    [
      new RegExp(`${B}esta\\s+(tarde|noche|ma[nñ]ana)${E}`, 'i'),
      (m) => {
        const w = normalize(m[1])
        if (!out.dueTime && !slot) slot = w === 'manana' ? '09:00' : w === 'tarde' ? '17:00' : '21:00'
        return setDate(base)
      },
    ],
    [new RegExp(`${B}hoy${E}`, 'i'), () => setDate(base)],
    [
      // «a finales de mes», «a fin de mes», «el último día del mes»
      new RegExp(`${B}(?:a\\s+)?(?:finales|final|fin)\\s+de(?:l)?\\s+mes|(?:el\\s+)?[uú]ltimo\\s+d[ií]a\\s+del\\s+mes${E}`, 'i'),
      () => setDate(addDays(addMonths(`${base.slice(0, 8)}01`, 1), -1)),
    ],
    [new RegExp(`${B}(?<!(?:^|[\\s,;(])la\\s)(?:ma[nñ]ana)${E}`, 'i'), () => setDate(addDays(base, 1))],
    [
      new RegExp(`${B}(?:(?:la\\s+)?(?:pr[oó]xima\\s+semana|semana\\s+que\\s+viene))${E}`, 'i'),
      () => setDate(nextWeekday(base, 1, false)),
    ],
    [
      new RegExp(`${B}(?:el\\s+)?(?:pr[oó]ximo\\s+mes|mes\\s+que\\s+viene)${E}`, 'i'),
      () => setDate(addMonths(`${base.slice(0, 8)}01`, 1)),
    ],
    [
      new RegExp(`${B}(?:este\\s+|el\\s+)?fin\\s+de\\s+semana${E}`, 'i'),
      () => {
        const dow = weekday(base)
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
        const [y, mo] = ymdParts(base)
        for (let i = 0; i < 3; i++) {
          const d = new Date(Date.UTC(y, mo - 1 + i, day))
          if (d.getUTCDate() === day && utcYmd(d) >= base) return setDate(utcYmd(d))
        }
        return false
      },
    ],
  ]
  // Fecha límite: «antes del viernes», «como muy tarde el 15», «a más tardar mañana»,
  // «fecha límite el 3 de marzo». Se busca la fecha justo detrás de esas palabras.
  const deadlineMark = text.match(new RegExp(`${B}(?:antes\\s+del?|como\\s+(?:muy\\s+)?tarde|a\\s+m[aá]s\\s+tardar|fecha\\s+l[ií]mite|vence|plazo\\s+hasta)(?=\\s)`, 'i'))
  if (deadlineMark?.index !== undefined) {
    const before = text.slice(0, deadlineMark.index)
    const after = text.slice(deadlineMark.index + deadlineMark[0].length)
    // «antes del 30» → se busca la fecha en «el 30»
    text = /del$/i.test(deadlineMark[0]) ? ` el${after}` : ` ${after}`
    target = 'deadline'
    for (const [re, fn] of dateRules) {
      if (take(re, fn)) break
    }
    // Sin fecha detrás («hacerlo antes de comer»), las palabras se quedan en el título
    text = out.deadline ? `${before} ${text}` : `${before}${deadlineMark[0]}${after}`
    target = 'dueDate'
  }
  for (const [re, fn] of dateRules) {
    if (take(re, fn)) break
  }

  if (out.recurrence && !out.dueDate) out.dueDate = firstOccurrence(base, out.recurrence)

  // ── Algún día ─────────────────────────────────────────────
  // «Aprender a tocar el piano algún día»: sin fecha y fuera de la Bandeja
  take(new RegExp(`${B}(?:alg[uú]n\\s+d[ií]a|en\\s+alg[uú]n\\s+momento|cuando\\s+pueda)${E}`, 'i'), () => {
    if (out.dueDate) return false
    out.someday = true
  })
  // «mañana por la tarde» → 17:00; sin fecha, «por la tarde» no dice qué día y se deja en el título
  if (slot && !out.dueTime) {
    if (out.dueDate) out.dueTime = slot
    else text = `${text.replace(/\s+$/, '')} ${slotText.trim()} `
  }
  if (out.dueTime && !out.dueDate) out.dueDate = base

  out.title = text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
    .replace(/\s+(a|el|la|de|para|y|en|que)$/i, '')
    .trim()
  // «Enviar informe antes del viernes» → «Enviar informe»
  if (out.dueDate) out.title = out.title.replace(/\s+(?:antes\s+del?|hasta\s+el|para\s+el|como\s+muy\s+tarde\s+el)$/i, '').trim()
  // Primera letra en mayúscula (p. ej. tras quitar "Recuérdame")
  out.title = out.title.charAt(0).toUpperCase() + out.title.slice(1)
  return out
}
