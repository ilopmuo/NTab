import { describe, expect, it } from 'vitest'
import { googleScript } from '@/features/settings/googleScript'
import { buildEvents, type IcsInput } from '../../supabase/functions/calendar/ics'

/** Google Calendar falso: lo justo de la API de Apps Script que usa el script */
function fakeGoogle() {
  let seq = 0
  type Ev = { id: number; title: string; allDay: boolean; start: Date; end: Date; description: string; tags: Record<string, string>; deleted: boolean }
  const events: Ev[] = []
  const wrap = (e: Ev) => ({
    getTag: (k: string) => e.tags[k] ?? null,
    setTag: (k: string, v: string) => void (e.tags[k] = v),
    deleteEvent: () => void (e.deleted = true),
    isAllDayEvent: () => e.allDay,
    setTitle: (t: string) => void (e.title = t),
    setDescription: (d: string) => void (e.description = d),
    setAllDayDate: (d: Date) => void ((e.start = d), (e.end = d)),
    setTime: (s: Date, f: Date) => void ((e.start = s), (e.end = f)),
  })
  const calendar = {
    getId: () => 'cal-1',
    getEvents: (a: Date, b: Date) => events.filter((e) => !e.deleted && e.start >= a && e.start <= b).map(wrap),
    createEvent: (title: string, start: Date, end: Date, o: { description: string }) => {
      const e = { id: ++seq, title, allDay: false, start, end, description: o.description, tags: {}, deleted: false }
      events.push(e)
      return wrap(e)
    },
    createAllDayEvent: (title: string, day: Date, o: { description: string }) => {
      const e = { id: ++seq, title, allDay: true, start: day, end: day, description: o.description, tags: {}, deleted: false }
      events.push(e)
      return wrap(e)
    },
  }
  let created = 0
  let triggers = 0
  const props: Record<string, string> = {}
  let body = ''
  const globals = {
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => body }) },
    CalendarApp: {
      Color: { BLUE: 'blue' },
      getCalendarById: (id: string) => (id === 'cal-1' && created ? calendar : null),
      getOwnedCalendarsByName: () => (created ? [calendar] : []),
      createCalendar: () => (created++, calendar),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => void (props[k] = v) }) },
    ScriptApp: {
      getProjectTriggers: () => Array.from({ length: triggers }, () => ({})),
      deleteTrigger: () => void triggers--,
      newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => void triggers++ }) }) }),
    },
    console: { log: () => {} },
  }
  return {
    events: () => events.filter((e) => !e.deleted),
    calendarsCreated: () => created,
    triggers: () => triggers,
    serve: (json: unknown) => void (body = JSON.stringify(json)),
    load: (src: string) => new Function(...Object.keys(globals), `${src}\nreturn { instalar, sincronizar };`)(...Object.values(globals)) as { instalar: () => void; sincronizar: () => void },
  }
}

const today = new Date()
const ymd = (d: number) => new Date(today.getTime() + d * 864e5).toISOString().slice(0, 10)

describe('script de Google Calendar', () => {
  it('crea, actualiza y borra los eventos de NTab', () => {
    const g = fakeGoogle()
    const input: IcsInput = {
      tz: 'Europe/Madrid',
      now: today,
      tasks: [
        { id: 't1', title: 'Llamar al banco', dueDate: ymd(1), dueTime: '10:00' },
        { id: 't2', title: 'Comprar pan', dueDate: ymd(2) },
        { id: 'viejo', title: 'Muy antigua', dueDate: ymd(-200) },
      ],
      payments: [],
      birthdays: [],
    }
    const script = g.load(googleScript('https://x/functions/v1/calendar?token=abc&format=json'))

    g.serve({ events: buildEvents(input) })
    script.instalar()
    expect(g.triggers()).toBe(1)
    expect(g.calendarsCreated()).toBe(1)
    expect(g.events().map((e) => e.title).sort()).toEqual(['Comprar pan', 'Llamar al banco'])

    // Sin cambios: no se toca nada ni se duplica
    script.sincronizar()
    expect(g.events()).toHaveLength(2)
    expect(g.calendarsCreated()).toBe(1)

    // Cambia el título de una, se borra la otra y aparece una nueva
    input.tasks = [
      { id: 't1', title: 'Llamar al banco (urgente)', dueDate: ymd(1), dueTime: '11:00' },
      { id: 't3', title: 'Pagar la luz', dueDate: ymd(3) },
    ]
    g.serve({ events: buildEvents(input) })
    script.sincronizar()
    const now = g.events()
    expect(now.map((e) => e.title).sort()).toEqual(['Llamar al banco (urgente)', 'Pagar la luz'])
    // La tarea con hora se actualizó en su sitio (mismo evento)
    expect(now.find((e) => e.title.startsWith('Llamar'))!.id).toBe(1)

    // Reinstalar no duplica el aviso periódico
    script.instalar()
    expect(g.triggers()).toBe(1)
  })
})
