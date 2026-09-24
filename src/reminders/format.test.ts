import { describe, expect, it } from 'vitest'
import { buildDigest, buildPayload, dayLabel, type DueReminder } from '../../supabase/functions/send-reminders/format'

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
