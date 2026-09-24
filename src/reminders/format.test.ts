import { describe, expect, it } from 'vitest'
import { buildPayload, dayLabel, type DueReminder } from '../../supabase/functions/send-reminders/format'

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
    })
    expect(buildPayload({ ...base, due_date: '2026-09-25', due_time: null }, 'Europe/Madrid', now).body).toBe('Mañana')
  })

  it('cargos de suscripciones', () => {
    const p = buildPayload({ ...base, tbl: 'subscriptions', item_id: 's1', title: 'Netflix', due_date: '2026-09-26', due_time: null, amount: '12.99', currency: 'EUR' }, 'Europe/Madrid', now)
    expect(p.title).toBe('Netflix')
    expect(p.body.replace(/\s/g, ' ')).toBe('Cargo de 12,99 € el sábado 26')
    expect(p.url).toBe('./#/finance')
  })
})
