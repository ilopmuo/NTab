import { describe, expect, it } from 'vitest'
import type { Tracker } from '@/db/types'
import { averageEvery, byRoom, dirtiness, dirtinessLabel, cleanDays, cleanRecord, computeTrackerRemindAt, everyLabel, milestoneLabel, nextMilestone, savedSince, sinceLabel, sortTrackers, trackerState, withDate } from './trackers'

describe('última vez', () => {
  it('historial sin repetir y ordenado', () => {
    expect(withDate(['2026-09-10', '2026-08-01'], '2026-09-20')).toEqual(['2026-09-20', '2026-09-10', '2026-08-01'])
    expect(withDate(['2026-09-10'], '2026-09-10')).toEqual(['2026-09-10'])
    expect(withDate(['2026-09-20'], '2026-09-01')).toEqual(['2026-09-20', '2026-09-01'])
  })
  it('estado: nunca, al día y toca', () => {
    expect(trackerState({ log: [] }, '2026-09-24')).toEqual({ kind: 'never' })
    expect(trackerState({ log: ['2026-09-20'] }, '2026-09-24')).toEqual({ kind: 'ok', since: 4 })
    expect(trackerState({ log: ['2026-09-20'], every: 14 }, '2026-09-24')).toEqual({ kind: 'ok', since: 4, nextIn: 10 })
    expect(trackerState({ log: ['2026-09-01'], every: 14 }, '2026-09-24')).toEqual({ kind: 'due', since: 23, late: 9 })
  })
  it('media y textos', () => {
    expect(averageEvery({ log: ['2026-09-21', '2026-09-07', '2026-08-24'] })).toBe(14)
    expect(averageEvery({ log: ['2026-09-21'] })).toBeUndefined()
    expect(sinceLabel(0)).toBe('Hoy')
    expect(sinceLabel(20)).toBe('Hace 3 semanas')
    expect(sinceLabel(400)).toBe('Hace 1 año')
    expect(everyLabel(14)).toBe('cada 2 semanas')
    expect(everyLabel(90)).toBe('cada 3 meses')
  })
  it('aviso el día que toca a las 10:00', () => {
    const now = new Date(2026, 8, 24, 12).getTime()
    expect(computeTrackerRemindAt({ log: ['2026-09-20'], every: 14, archived: 0 }, now)).toBe(new Date(2026, 9, 4, 10).getTime())
    // Ya toca: mañana a las 10:00
    expect(computeTrackerRemindAt({ log: ['2026-09-01'], every: 14, archived: 0 }, now)).toBe(new Date(2026, 8, 25, 10).getTime())
    expect(computeTrackerRemindAt({ log: ['2026-09-01'], archived: 0 }, now)).toBeUndefined()
  })
})

describe('«Días sin…»', () => {
  const T = '2026-10-01'
  const base = { id: 'f', name: 'Fumar', icon: 'cigarette', avoid: true, archived: 0 as const, order: 0, createdAt: new Date(2026, 8, 1).getTime() }
  it('cuenta desde la última recaída o, sin ninguna, desde que se creó', () => {
    expect(cleanDays({ ...base, log: [] }, T)).toBe(30)
    expect(cleanDays({ ...base, log: ['2026-09-21', '2026-09-01'] }, T)).toBe(10)
    expect(cleanDays({ ...base, log: [T] }, T)).toBe(0)
  })
  it('récord, metas y ahorro', () => {
    expect(cleanRecord({ ...base, log: ['2026-09-21', '2026-08-01'] }, T)).toBe(51)
    expect(cleanRecord({ ...base, log: ['2026-09-21'] }, T)).toBe(10)
    expect(nextMilestone(10)).toEqual({ at: 14, left: 4 })
    expect(nextMilestone(0)).toEqual({ at: 1, left: 1 })
    expect(milestoneLabel(7)).toBe('1 semana')
    expect(milestoneLabel(60)).toBe('2 meses')
    expect(milestoneLabel(365)).toBe('1 año')
    expect(milestoneLabel(3)).toBe('3 días')
    expect(savedSince({ ...base, log: ['2026-09-21'], costPerDay: 4.5 }, T)).toBe(45)
    expect(savedSince({ ...base, log: ['2026-09-21'] }, T)).toBe(0)
  })
  it('no avisa y va al final de la lista', () => {
    expect(computeTrackerRemindAt({ log: ['2026-09-01'], every: 14, archived: 0, avoid: true })).toBeUndefined()
    const sheets = { ...base, id: 's', name: 'Sábanas', avoid: undefined, log: ['2026-09-30'], every: 14 }
    expect(sortTrackers([{ ...base, log: [] }, sheets], T).map((t) => t.id)).toEqual(['s', 'f'])
  })
})

describe('limpieza por estancias', () => {
  const T = '2026-10-01'
  const tr = (id: string, extra: Partial<Tracker>) => ({ id, name: id, icon: 'home', log: [], archived: 0 as const, order: 0, createdAt: 0, ...extra }) as Tracker
  it('la suciedad sube con los días hasta que toca (y algo más si se pasa)', () => {
    expect(dirtiness(tr('a', { every: 10, log: ['2026-09-26'] }), T)).toBe(0.5)
    expect(dirtiness(tr('a', { every: 7, log: ['2026-09-01'] }), T)).toBe(1.5)
    expect(dirtiness(tr('a', { every: 7 }), T)).toBe(1)
    expect(dirtiness(tr('a', { log: ['2026-09-01'] }), T)).toBeUndefined()
    expect(dirtinessLabel(0.2)).toBe('Limpio')
    expect(dirtinessLabel(0.8)).toBe('Toca pronto')
    expect(dirtinessLabel(1.2)).toBe('Toca')
  })
  it('agrupa por estancia, de la más sucia a la más limpia', () => {
    const rooms = byRoom(
      [
        tr('vitro', { room: 'Cocina', every: 2, log: ['2026-09-30'] }),
        tr('suelo', { room: 'Cocina', every: 7, log: ['2026-09-24'] }),
        tr('baño', { room: 'Baño', every: 7, log: ['2026-09-20'] }),
        tr('sin', { every: 7 }),
        tr('fumar', { room: 'Salón', avoid: true }),
      ],
      T,
    )
    expect(rooms.map((r) => [r.room, Math.round(r.level * 100)])).toEqual([
      ['Baño', 150],
      ['Cocina', 75],
    ])
    expect(rooms[1].items.map((t) => t.id)).toEqual(['suelo', 'vitro'])
  })
})
