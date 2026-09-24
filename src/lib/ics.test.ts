import { describe, expect, it } from 'vitest'
import { buildCalendar, escapeText, fold, zonedToUtc } from '../../supabase/functions/calendar/ics'

const now = new Date('2026-09-24T08:00:00Z')

describe('calendario ICS', () => {
  it('hora local → UTC, con horario de verano e invierno', () => {
    expect(new Date(zonedToUtc('2026-09-24', '10:00', 'Europe/Madrid')).toISOString()).toBe('2026-09-24T08:00:00.000Z')
    expect(new Date(zonedToUtc('2026-12-24', '10:00', 'Europe/Madrid')).toISOString()).toBe('2026-12-24T09:00:00.000Z')
    expect(new Date(zonedToUtc('2026-09-24', '10:00', 'America/Mexico_City')).toISOString()).toBe('2026-09-24T16:00:00.000Z')
  })

  it('escapa el texto y parte las líneas largas', () => {
    expect(escapeText('Comprar pan, leche; y huevos\nya')).toBe('Comprar pan\\, leche\\; y huevos\\nya')
    const long = `SUMMARY:${'á'.repeat(80)}`
    const folded = fold(long)
    expect(folded.split('\r\n ').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })

  it('tareas, pagos y cumpleaños', () => {
    const ics = buildCalendar({
      tz: 'Europe/Madrid',
      appUrl: 'https://ntab.vercel.app/#/settings',
      now,
      tasks: [
        { id: 't1', title: 'Llamar al banco', dueDate: '2026-09-24', dueTime: '10:00', priority: 3, projectName: 'Casa' },
        { id: 't2', title: 'Comprar pan', dueDate: '2026-09-25' },
        { id: 't3', title: 'Sin fecha' },
      ],
      payments: [{ id: 's1', name: 'Netflix', amount: 12.99, currency: 'EUR', nextDate: '2026-09-26' }],
      birthdays: [{ id: 'p1', name: 'Ana', birthday: '1990-03-15' }, { id: 'p2', name: 'Luis', birthday: '07-02' }],
    })
    const lines = ics.split('\r\n')
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(ics).toContain('DTSTART:20260924T080000Z')
    expect(ics).toContain('DTEND:20260924T083000Z')
    expect(ics).toContain('PRIORITY:1')
    expect(ics).toContain('DESCRIPTION:Proyecto: Casa')
    expect(ics).toContain('URL:https://ntab.vercel.app/#/task/t1')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260925')
    expect(ics).toContain('DTEND;VALUE=DATE:20260926')
    expect(ics).not.toContain('Sin fecha')
    expect(ics).toContain('SUMMARY:💳 Netflix · 12\\,99')
    expect(ics).toContain('DTSTART;VALUE=DATE:19900315')
    expect(ics).toContain('DTSTART;VALUE=DATE:20000702')
    expect(ics.match(/RRULE:FREQ=YEARLY/g)).toHaveLength(2)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
})
