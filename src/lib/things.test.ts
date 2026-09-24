import { describe, expect, it } from 'vitest'
import type { Thing } from '@/db/types'
import { computeThingRemindAt, expiryStatus, needsAttention, searchThings } from './things'

const base: Thing = { id: 't', name: 'x', kind: 'stored', createdAt: 0, updatedAt: 0 }
const now = new Date(2026, 8, 24, 12, 0).getTime()

describe('cosas', () => {
  it('avisos de caducidad y préstamos', () => {
    expect(computeThingRemindAt({ ...base, kind: 'document', expires: '2026-11-30', notifyDays: 30 }, now)).toBe(new Date(2026, 9, 31, 9, 0).getTime())
    // Ya dentro del margen: a las 9:00 siguientes (now son las 12:00 → mañana)
    expect(computeThingRemindAt({ ...base, kind: 'document', expires: '2026-10-10', notifyDays: 30 }, now)).toBe(new Date(2026, 8, 25, 9, 0).getTime())
    // Ya caducado: nada
    expect(computeThingRemindAt({ ...base, kind: 'document', expires: '2026-09-20' }, now)).toBeUndefined()
    expect(computeThingRemindAt({ ...base, kind: 'lent', returnBy: '2026-10-01' }, now)).toBe(new Date(2026, 9, 1, 10, 0).getTime())
    expect(computeThingRemindAt({ ...base, kind: 'lent', returnBy: '2026-10-01', returned: 1 }, now)).toBeUndefined()
    expect(computeThingRemindAt({ ...base, kind: 'borrowed', returnBy: '2026-10-01' }, now)).toBe(new Date(2026, 8, 30, 9, 0).getTime())
    expect(computeThingRemindAt({ ...base, kind: 'stored' }, now)).toBeUndefined()
  })
  it('estado de caducidad y atención', () => {
    expect(expiryStatus({ expires: '2026-09-20' }, '2026-09-24')).toEqual({ level: 'expired', days: -4 })
    expect(expiryStatus({ expires: '2026-10-10', notifyDays: 30 }, '2026-09-24')?.level).toBe('soon')
    expect(expiryStatus({ expires: '2027-10-10' }, '2026-09-24')?.level).toBe('ok')
    expect(needsAttention({ ...base, kind: 'lent', since: '2026-08-01' }, '2026-09-24')).toBe(true)
    expect(needsAttention({ ...base, kind: 'lent', since: '2026-09-20' }, '2026-09-24')).toBe(false)
  })
  it('¿dónde está? sin acentos', () => {
    const list = [
      { ...base, id: 'a', name: 'Pasaporte', location: 'Cajón del escritorio' },
      { ...base, id: 'b', name: 'Taladro', kind: 'lent' as const, personName: 'Ana García' },
    ]
    expect(searchThings(list, 'cajon').map((t) => t.id)).toEqual(['a'])
    expect(searchThings(list, 'garcia').map((t) => t.id)).toEqual(['b'])
    expect(searchThings(list, 'pasaporte escritorio').map((t) => t.id)).toEqual(['a'])
  })
})
