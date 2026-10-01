import { describe, expect, it } from 'vitest'
import type { Person } from '@/db/types'
import { nextBirthday, pendingGifts, upcomingBirthdays, upcomingDates } from './people'

const person = (id: string, extra: Partial<Person> = {}) => ({ id, name: id, email: '', phone: '', company: '', role: '', notes: '', tags: [], createdAt: 0, ...extra }) as Person
const T = '2026-10-01'

describe('personas: fechas que vuelven cada año', () => {
  it('cumpleaños (con y sin año)', () => {
    expect(nextBirthday('1990-10-03', T)).toEqual({ date: '2026-10-03', age: 36 })
    expect(nextBirthday('09-15', T)).toEqual({ date: '2027-09-15', age: undefined })
    expect(upcomingBirthdays([person('ana', { birthday: '10-05' }), person('luis', { birthday: '12-01' })], T, 7).map((b) => b.person.id)).toEqual(['ana'])
  })
  it('aniversarios y otras fechas, con los años que se cumplen', () => {
    const ana = person('ana', {
      dates: [
        { id: '1', label: 'Aniversario de boda', date: '2016-10-02' },
        { id: '2', label: 'Su santo', date: '07-26' },
      ],
    })
    const luis = person('luis', { dates: [{ id: '3', label: 'Empezó en la empresa', date: '2020-10-01' }] })
    expect(upcomingDates([ana, luis], T, 7).map((d) => [d.person.id, d.label, d.date, d.years])).toEqual([
      ['luis', 'Empezó en la empresa', '2026-10-01', 6],
      ['ana', 'Aniversario de boda', '2026-10-02', 10],
    ])
  })
  it('ideas de regalo pendientes', () => {
    expect(pendingGifts(person('ana', { gifts: [{ id: '1', text: 'Libro', given: '2026-01-06' }, { id: '2', text: 'Taza' }] })).map((g) => g.text)).toEqual(['Taza'])
    expect(pendingGifts(person('luis'))).toEqual([])
  })
})
