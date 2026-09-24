/**
 * Lee un calendario iCalendar (.ics de Google, iCloud, Outlook…) y devuelve
 * los eventos de un rango de fechas, con las repeticiones ya desplegadas
 * (RRULE, EXDATE y ocurrencias movidas o canceladas).
 *
 * Se usa en las Edge Functions `events` y `mcp`, y en los tests de la app.
 */
import ICAL from 'ical.js'

export interface CalEvent {
  /** único por ocurrencia */
  id: string
  sourceId: string
  title: string
  allDay: boolean
  /** YYYY-MM-DD (todo el día) o ISO en UTC */
  start: string
  /** YYYY-MM-DD exclusivo (todo el día) o ISO en UTC */
  end: string
  location?: string
}

const MAX_OCCURRENCES = 2000

type ICALTime = InstanceType<typeof ICAL.Time>

function toEvent(sourceId: string, uid: string, summary: string, start: ICALTime, end: ICALTime | null, location?: string): CalEvent {
  const allDay = start.isDate
  if (allDay) {
    const s = start.toString().slice(0, 10)
    const e = end ? end.toString().slice(0, 10) : s
    const endDay = e > s ? e : new Date(Date.parse(`${s}T00:00:00Z`) + 864e5).toISOString().slice(0, 10)
    return { id: `${uid}|${s}`, sourceId, title: summary, allDay, start: s, end: endDay, ...(location ? { location } : {}) }
  }
  const s = start.toJSDate().toISOString()
  const e = end ? end.toJSDate().toISOString() : s
  return { id: `${uid}|${s}`, sourceId, title: summary, allDay, start: s, end: e, ...(location ? { location } : {}) }
}

/** ¿El evento [start, end) toca el rango [from, to)? */
function overlaps(ev: CalEvent, from: number, to: number) {
  const s = ev.allDay ? Date.parse(`${ev.start}T00:00:00Z`) : Date.parse(ev.start)
  const e = ev.allDay ? Date.parse(`${ev.end}T00:00:00Z`) : Date.parse(ev.end)
  return s < to && Math.max(e, s + 1) > from
}

export function expandIcs(text: string, sourceId: string, from: number, to: number): CalEvent[] {
  const root = new ICAL.Component(ICAL.parse(text))
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz)
    } catch {
      /* zona horaria que ya estaba o no válida */
    }
  }

  const vevents = root.getAllSubcomponents('vevent')
  const masters = new Map<string, InstanceType<typeof ICAL.Event>>()
  const exceptions: InstanceType<typeof ICAL.Event>[] = []
  for (const comp of vevents) {
    const ev = new ICAL.Event(comp)
    if (comp.hasProperty('recurrence-id')) exceptions.push(ev)
    else masters.set(ev.uid, ev)
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid)
    if (master) master.relateException(ex)
    else masters.set(`${ex.uid}#${ex.recurrenceId}`, ex)
  }

  const out: CalEvent[] = []
  const cancelled = (e: InstanceType<typeof ICAL.Event>) => String(e.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'
  for (const ev of masters.values()) {
    if (cancelled(ev)) continue
    const summary = ev.summary || 'Sin título'
    const location = ev.location || undefined
    if (!ev.isRecurring()) {
      const item = toEvent(sourceId, ev.uid, summary, ev.startDate, ev.endDate, location)
      if (overlaps(item, from, to)) out.push(item)
      continue
    }
    const it = ev.iterator()
    let next: ICALTime | null
    let n = 0
    while ((next = it.next()) && n++ < MAX_OCCURRENCES) {
      if (next.toJSDate().getTime() >= to) break
      const d = ev.getOccurrenceDetails(next)
      if (cancelled(d.item)) continue
      const item = toEvent(sourceId, ev.uid, d.item.summary || summary, d.startDate, d.endDate, d.item.location || location)
      if (overlaps(item, from, to)) out.push(item)
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}

/** webcal:// → https:// */
export function normalizeFeedUrl(url: string) {
  return url.trim().replace(/^webcals?:\/\//i, 'https://')
}
