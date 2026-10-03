import { describe, expect, it } from 'vitest'
import { bestStreak, completionRate, doneDays, groupLogs, isDue, isScheduled, onBreak, openBreak, progressLabel, streak, strength, weekDone } from './habits'

// Miércoles, 30 de septiembre de 2026 (la semana empieza el lunes 28)
const T = '2026-09-30'
const created = new Date(2026, 5, 1).getTime()
const daily = { days: [0, 1, 2, 3, 4, 5, 6], createdAt: created, target: 1 }
const water = { ...daily, target: 8, unit: 'vasos' }
const gym = { days: [], perWeek: 3, createdAt: created }

describe('hábitos con cantidad', () => {
  const counts = groupLogs([
    { habitId: 'w', date: '2026-09-29', count: 8 },
    { habitId: 'w', date: '2026-09-30', count: 3 },
    { habitId: 'w', date: '2026-09-28', count: 5 },
    { habitId: 'w', date: '2026-09-28', count: 4 }, // dos registros el mismo día se suman
    { habitId: 'x', date: '2026-09-30' },
  ])
  it('solo cuenta como hecho al llegar al objetivo', () => {
    expect([...doneDays(water, counts.get('w'))].sort()).toEqual(['2026-09-28', '2026-09-29'])
    expect([...doneDays(daily, counts.get('x'))]).toEqual(['2026-09-30'])
  })
  it('progreso', () => {
    const w = counts.get('w')!
    expect(progressLabel(water, w, doneDays(water, w), T)).toBe('3/8 vasos')
    expect(progressLabel(daily, undefined, new Set(), T)).toBe('')
  })
  it('la racha no se rompe por el día en curso', () => {
    expect(streak(water, doneDays(water, counts.get('w')), T)).toBe(2)
  })
})

describe('hábitos por semana', () => {
  it('vale cualquier día', () => {
    expect(isScheduled(gym, '2026-10-04')).toBe(true)
  })
  it('toca mientras no se llegue esta semana', () => {
    const done = new Set(['2026-09-28', '2026-09-29'])
    expect(weekDone(done, T)).toBe(2)
    expect(isDue(gym, done, T)).toBe(true)
    const three = new Set([...done, '2026-09-30'])
    expect(isDue(gym, three, T)).toBe(true) // hecho hoy: se sigue viendo
    expect(isDue(gym, three, '2026-10-01')).toBe(false) // ya cumplida
    expect(isDue(gym, three, '2026-10-05')).toBe(true) // semana nueva
  })
  it('racha en semanas: la actual solo suma si ya se cumplió', () => {
    const done = new Set([
      // semana del 14: 3
      '2026-09-14', '2026-09-16', '2026-09-18',
      // semana del 21: 4
      '2026-09-21', '2026-09-22', '2026-09-24', '2026-09-26',
      // esta semana: 1
      '2026-09-28',
    ])
    expect(streak(gym, done, T)).toBe(2)
    expect(streak(gym, new Set([...done, '2026-09-29', '2026-09-30']), T)).toBe(3)
    // semana del 7 sin cumplir: corta
    expect(streak(gym, new Set([...done, '2026-09-07']), T)).toBe(2)
  })
  it('cumplimiento por semanas, sin castigar la semana en curso', () => {
    const done = new Set(['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21', '2026-09-28'])
    // semanas completas: 7 (0), 14 (3), 21 (1) → 4 de 9; la del 28 aún no cuenta
    expect(completionRate(gym, done, T, 28)).toBeCloseTo(4 / 9)
  })
})

describe('hábitos de días fijos (como siempre)', () => {
  it('días programados', () => {
    const mwf = { days: [1, 3, 5], createdAt: created }
    expect(isScheduled(mwf, T)).toBe(true)
    expect(isScheduled(mwf, '2026-09-29')).toBe(false)
    expect(isDue(mwf, new Set(), '2026-09-29')).toBe(false)
    expect(streak(mwf, new Set(['2026-09-25', '2026-09-28']), T)).toBe(2)
  })
})

describe('pausas y días libres (como en Streaks y Loop)', () => {
  const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(from) + i * 864e5).toISOString().slice(0, 10))
  it('un día libre no toca, no avisa y no rompe la racha', () => {
    const h = { ...daily, breaks: [{ from: '2026-09-28', to: '2026-09-28' }] }
    expect(onBreak(h, '2026-09-28')).toBe(true)
    expect(isScheduled(h, '2026-09-28')).toBe(false)
    expect(isDue(h, new Set(), '2026-09-28')).toBe(false)
    expect(streak(h, new Set(['2026-09-26', '2026-09-27', '2026-09-29', '2026-09-30']), T)).toBe(4)
    expect(streak(daily, new Set(['2026-09-26', '2026-09-27', '2026-09-29', '2026-09-30']), T)).toBe(2)
  })
  it('en pausa (sin fecha de vuelta), hasta que se reanude', () => {
    const h = { ...daily, breaks: [{ from: '2026-09-29' }] }
    expect(openBreak(h)).toEqual({ from: '2026-09-29' })
    expect(isDue(h, new Set(), T)).toBe(false)
    expect(isDue(h, new Set(), '2026-12-01')).toBe(false)
    expect(streak(h, new Set(['2026-09-27', '2026-09-28']), T)).toBe(2)
  })
  it('por semanas: una semana de vacaciones sin llegar no corta', () => {
    const h = { ...gym, breaks: [{ from: '2026-09-21', to: '2026-09-25' }] }
    const done = new Set(['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-28', '2026-09-29', '2026-09-30'])
    expect(streak(h, done, T)).toBe(2)
    expect(streak(gym, done, T)).toBe(1)
    expect(bestStreak(h, done, T)).toBe(2)
  })
  it('fuerza: sube al cumplir, un fallo suelto apenas la baja y hoy sin hacer no resta', () => {
    const fresh = { ...daily, createdAt: new Date(2026, 8, 1).getTime() }
    const all = groupLogs(days('2026-09-01', 30).map((date) => ({ habitId: 'h', date })))
    const s30 = strength(fresh, all.get('h'), T)
    expect(s30).toBeGreaterThan(0.75)
    expect(s30).toBeLessThan(0.85)
    const oneMiss = groupLogs(days('2026-09-01', 30).filter((d) => d !== '2026-09-29').map((date) => ({ habitId: 'h', date })))
    expect(s30 - strength(fresh, oneMiss.get('h'), T)).toBeLessThan(0.06)
    // Hoy aún sin hacer: igual que ayer
    const untilYesterday = groupLogs(days('2026-09-01', 29).map((date) => ({ habitId: 'h', date })))
    expect(strength(fresh, untilYesterday.get('h'), T)).toBeCloseTo(strength(fresh, untilYesterday.get('h'), '2026-09-29'))
    expect(strength(fresh, undefined, T)).toBe(0)
    // Con cantidad, la parte hecha cuenta
    const half = groupLogs(days('2026-09-01', 29).map((date) => ({ habitId: 'h', date, count: 4 })))
    expect(strength({ ...water, createdAt: fresh.createdAt }, half.get('h'), T)).toBeCloseTo(strength(fresh, untilYesterday.get('h'), T) / 2, 2)
  })
  it('mejor racha', () => {
    const done = new Set(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-05', '2026-09-06'])
    expect(bestStreak({ ...daily, createdAt: new Date(2026, 8, 1).getTime() }, done, T)).toBe(3)
  })
})

describe('fuerza y mejor racha empiezan en el primer registro', () => {
  // Lo de antes del primer registro siempre suma 0: contar desde la fecha de
  // creación (que puede quedar años atrás) da lo mismo, pero cuesta mucho más
  const addDays = (ymd: string, n: number) => {
    const d = new Date(`${ymd}T12:00:00`)
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  /** Como antes: día a día desde que se creó */
  function fromCreation(h: { days: number[]; target?: number }, counts: Map<string, number>, ref: string, since: string) {
    const target = Math.max(1, h.target ?? 1)
    const keep = Math.pow(0.5, Math.sqrt(7 / Math.max(1, h.days.length)) / 13)
    let score = 0
    let best = 0
    let run = 0
    for (let d = since; d <= ref; d = addDays(d, 1)) {
      if (!isScheduled(h, d)) continue
      const value = Math.min(1, (counts.get(d) ?? 0) / target)
      if (!(d === ref && value < 1)) score = score * keep + value * (1 - keep)
      if (value >= 1) best = Math.max(best, ++run)
      else if (d !== ref) run = 0
    }
    return { score, best }
  }
  // Pseudoaleatorio con semilla: siempre los mismos casos
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  it('da exactamente lo mismo que contar desde la creación', () => {
    for (let k = 0; k < 40; k++) {
      const days = [0, 1, 2, 3, 4, 5, 6].filter(() => rand() > 0.35)
      const h = { days: days.length ? days : [1], target: rand() > 0.5 ? 3 : 1, createdAt: new Date(2024, 0, 1).getTime() }
      const counts = new Map<string, number>()
      const start = Math.floor(rand() * 500)
      for (let i = start; i < 640; i++) if (rand() > 0.4) counts.set(addDays('2024-06-01', i), 1 + Math.floor(rand() * 3))
      const done = doneDays(h, counts)
      const ref = T
      const old = fromCreation(h, counts, ref, '2024-01-01')
      expect(strength(h, counts, ref)).toBeCloseTo(old.score, 10)
      expect(bestStreak(h, done, ref)).toBe(old.best)
    }
  })
  it('sin ningún registro, 0', () => {
    expect(strength(daily, new Map(), T)).toBe(0)
    expect(bestStreak(daily, new Set(), T)).toBe(0)
  })
})
