import { describe, expect, it } from 'vitest'
import { suggest } from './suggest'

const T = '2026-09-24'
const base = { today: T, nowMin: 10 * 60 }
const tasks = [
  { id: 'atrasada', title: 'Atrasada', priority: 0, dueDate: '2026-09-21', estimate: 15 },
  { id: 'informe', title: 'Informe', priority: 3, dueDate: T, estimate: 90 },
  { id: 'llamar', title: 'Llamar', priority: 1, dueDate: T, dueTime: '10:05' },
  { id: 'tarde', title: 'Cita tarde', priority: 2, dueDate: T, dueTime: '17:00', estimate: 30 },
  { id: 'manana', title: 'Mañana', priority: 3, dueDate: '2026-09-25', estimate: 10 },
  { id: 'algun', title: 'Algún día', priority: 0 },
]

describe('¿qué hago ahora?', () => {
  it('solo lo que cabe, ni futuro ni lo que tiene hora más tarde', () => {
    const ids = suggest(tasks, { ...base, minutes: 30 }).map((s) => s.task.id)
    expect(ids).not.toContain('informe')
    expect(ids).not.toContain('manana')
    expect(ids).not.toContain('tarde')
    expect(ids[0]).toBe('llamar')
  })
  it('con tiempo y energía, lo gordo e importante', () => {
    const s = suggest(tasks, { ...base, minutes: 120, energy: 'high' })
    expect(s[0].task.id).toBe('informe')
    expect(s[0].reasons).toContain('Prioridad alta')
  })
  it('motivos legibles', () => {
    const atrasada = suggest(tasks, { ...base, minutes: 30 }).find((s) => s.task.id === 'atrasada')!
    expect(atrasada.reasons).toEqual(['Atrasada 3 días', 'Cabe: 15 min'])
  })
})
