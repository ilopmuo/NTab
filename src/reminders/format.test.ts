import { describe, expect, it } from 'vitest'
import { buildDigest, buildHabitPayload, buildJournalPayload, buildPayload, buildRoutinePayload, dayLabel, type DueReminder } from '../../supabase/functions/send-reminders/format'

// Jueves 24 de septiembre de 2026, 10:00 en Madrid
const now = new Date('2026-09-24T08:00:00Z')
const base: DueReminder = {
  user_id: 'u',
  tbl: 'tasks',
  item_id: 't1',
  title: 'Llamar al dentista',
  remind_at: now.toISOString(),
  due_date: '2026-09-24',
  due_time: '10:00',
  amount: null,
  currency: null,
}

describe('texto de las notificaciones', () => {
  it('días relativos en la zona horaria del usuario', () => {
    expect(dayLabel('2026-09-24', now, 'Europe/Madrid')).toBe('hoy')
    expect(dayLabel('2026-09-25', now, 'Europe/Madrid')).toBe('mañana')
    expect(dayLabel('2026-09-26', now, 'Europe/Madrid')).toBe('el sábado 26')
    // A las 23:30 UTC en Madrid ya es el día siguiente
    expect(dayLabel('2026-09-25', new Date('2026-09-24T23:30:00Z'), 'Europe/Madrid')).toBe('hoy')
  })

  it('tareas', () => {
    expect(buildPayload(base, 'Europe/Madrid', now)).toEqual({
      title: 'Llamar al dentista',
      body: 'Hoy a las 10:00',
      url: './#/task/t1',
      tag: 'tasks-t1',
      key: `tasks-t1-${now.getTime()}`,
      taskId: 't1',
    })
    expect(buildPayload({ ...base, due_date: '2026-09-25', due_time: null }, 'Europe/Madrid', now).body).toBe('Mañana')
  })

  it('repeticiones de un aviso insistente', () => {
    const p = buildPayload({ ...base, repeat: 2 }, 'Europe/Madrid', now)
    expect(p.body).toBe('Sigue pendiente · hoy a las 10:00')
    // Misma etiqueta que el aviso original: lo sustituye en vez de acumularse
    expect(p.tag).toBe('tasks-t1')
  })

  it('cargos de suscripciones', () => {
    const p = buildPayload({ ...base, tbl: 'subscriptions', item_id: 's1', title: 'Netflix', due_date: '2026-09-26', due_time: null, amount: '12.99', currency: 'EUR' }, 'Europe/Madrid', now)
    expect(p.title).toBe('Netflix')
    expect(p.body.replace(/\s/g, ' ')).toBe('Cargo de 12,99 € el sábado 26')
    expect(p.url).toBe('./#/finance')
  })
})

describe('resumen de la mañana', () => {
  const d = { user_id: 'u', local_date: '2026-09-24', tz: 'Europe/Madrid', today_count: 4, overdue_count: 1, titles: ['Llamar al banco', 'Comprar pan', 'Informe'], payments: 1 }
  it('cuenta lo del día y enseña las primeras', () => {
    const p = buildDigest(d, now)
    expect(p.title).toBe('Buenos días ☀️')
    expect(p.body).toBe('4 tareas para hoy · 1 atrasada · 1 pago\nLlamar al banco · Comprar pan · Informe …')
    expect(p.tag).toBe('digest-2026-09-24')
    // Con atrasadas abre "Planificar el día"; si no, Hoy
    expect(p.url).toBe('./#/plan')
    expect(buildDigest({ ...d, overdue_count: 0 }, now).url).toBe('./#/today')
  })
  it('día despejado', () => {
    const p = buildDigest({ ...d, today_count: 0, overdue_count: 0, titles: [], payments: 0 }, now)
    expect(p.body).toMatch(/nada planificado/)
  })
})

describe('recordatorio de hábito', () => {
  it('con botón Hecho y sin repetir en el día', () => {
    expect(buildHabitPayload({ user_id: 'u', habit_id: 'h1', name: 'Beber agua', local_date: '2026-09-24', remind_time: '21:00' })).toEqual({
      title: 'Beber agua',
      body: 'Aún no lo has marcado hoy. ¿Lo haces ahora?',
      url: './#/habits',
      tag: 'habits-h1',
      key: 'habits-h1-2026-09-24',
      habitId: 'h1',
    })
  })
})

describe('rutinas y cosas', () => {
  it('aviso de rutina', () => {
    const p = buildRoutinePayload({ user_id: 'u', routine_id: 'r1', name: 'Antes de salir de casa', steps: 5, local_date: '2026-09-24', remind_time: '08:00' })
    expect(p).toMatchObject({ title: 'Antes de salir de casa', url: './#/routine/r1', tag: 'routines-r1', key: 'routines-r1-2026-09-24' })
    expect(p.body).toContain('5 pasos')
  })
  it('préstamos y caducidades', () => {
    const t = { ...base, tbl: 'things', item_id: 'c1', due_time: 'lent', currency: 'Ana', title: 'Taladro' }
    expect(buildPayload(t, 'Europe/Madrid', now).body).toBe('Se lo prestaste a Ana. ¿Te lo ha devuelto?')
    const d = buildPayload({ ...t, due_time: 'document', due_date: '2026-10-24', title: 'Pasaporte' }, 'Europe/Madrid', now)
    expect(d.body).toBe('Caduca el sábado 24. Toca renovarlo.')
    expect(d.url).toBe('./#/things')
  })
})

describe('última vez y diario', () => {
  it('aviso de «última vez»', () => {
    const p = buildPayload({ ...base, tbl: 'trackers', item_id: 'k1', title: 'Cambiar las sábanas', due_date: '2026-09-08', due_time: 'tracker', currency: '14' }, 'Europe/Madrid', now)
    expect(p.body).toBe('La última vez fue hace 16 días (sueles cada 14). ¿Toca ya?')
    expect(p.url).toBe('./#/trackers')
  })
  it('aviso del diario', () => {
    expect(buildJournalPayload({ user_id: 'u', local_date: '2026-09-24', done_today: 3 })).toMatchObject({ title: '¿Qué tal el día?', url: './#/journal', key: 'journal-2026-09-24' })
  })
})
