import { describe, expect, it } from 'vitest'
import { expandIcs, normalizeFeedUrl } from '../../supabase/functions/events/expand'

// Calendario de ejemplo como el de Google: zona horaria, evento semanal con
// una fecha excluida y otra movida, un evento de todo el día y uno cancelado.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VTIMEZONE
TZID:Europe/Madrid
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:semanal@google.com
DTSTART;TZID=Europe/Madrid:20260907T100000
DTEND;TZID=Europe/Madrid:20260907T103000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=Europe/Madrid:20260921T100000
SUMMARY:Reunión de equipo
LOCATION:Sala 2
END:VEVENT
BEGIN:VEVENT
UID:semanal@google.com
RECURRENCE-ID;TZID=Europe/Madrid:20260928T100000
DTSTART;TZID=Europe/Madrid:20260929T120000
DTEND;TZID=Europe/Madrid:20260929T130000
SUMMARY:Reunión de equipo (movida)
END:VEVENT
BEGIN:VEVENT
UID:dia@google.com
DTSTART;VALUE=DATE:20260925
DTEND;VALUE=DATE:20260926
SUMMARY:Cumpleaños de Marta
END:VEVENT
BEGIN:VEVENT
UID:cancelado@google.com
DTSTART:20260924T150000Z
DTEND:20260924T160000Z
STATUS:CANCELLED
SUMMARY:Cancelado
END:VEVENT
BEGIN:VEVENT
UID:dentista@google.com
DTSTART:20260924T080000Z
DTEND:20260924T090000Z
SUMMARY:Dentista
END:VEVENT
END:VCALENDAR`

const from = Date.parse('2026-09-14T00:00:00Z')
const to = Date.parse('2026-10-06T00:00:00Z')

describe('calendarios externos (.ics)', () => {
  it('despliega repeticiones, respeta excepciones y zonas horarias', () => {
    const ev = expandIcs(ICS, 'g', from, to)
    const rows = ev.map((e) => [e.title, e.allDay ? e.start : e.start.slice(0, 16)])
    expect(rows).toEqual([
      ['Reunión de equipo', '2026-09-14T08:00'], // 10:00 en Madrid (verano)
      ['Dentista', '2026-09-24T08:00'],
      ['Cumpleaños de Marta', '2026-09-25'],
      ['Reunión de equipo (movida)', '2026-09-29T10:00'], // el lunes 28 se movió al martes 29
      ['Reunión de equipo', '2026-10-05T08:00'],
    ])
    // El 21 estaba excluido y el cancelado no aparece
    expect(ev.find((e) => e.start.startsWith('2026-09-21'))).toBeUndefined()
    expect(ev.find((e) => e.title === 'Cancelado')).toBeUndefined()
    expect(ev[0]).toMatchObject({ location: 'Sala 2', end: '2026-09-14T08:30:00.000Z', sourceId: 'g' })
    expect(ev.find((e) => e.allDay)).toMatchObject({ start: '2026-09-25', end: '2026-09-26' })
  })

  it('ids únicos por ocurrencia', () => {
    const ev = expandIcs(ICS, 'g', from, to)
    expect(new Set(ev.map((e) => e.id)).size).toBe(ev.length)
  })

  it('webcal:// se lee por https', () => {
    expect(normalizeFeedUrl(' webcal://p01-calendars.icloud.com/published/2/abc ')).toBe('https://p01-calendars.icloud.com/published/2/abc')
  })
})
