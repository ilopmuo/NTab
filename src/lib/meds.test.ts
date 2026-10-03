import { describe, expect, it } from 'vitest'
import { adherence, daysLeft, doseToTake, dosesOn, findMed, medReminder, medsSummary, nagIndex, needsRefill, stockAfter, takeLog, treatmentDay } from './meds'
import type { MedLike, MedLogLike } from '../../supabase/functions/_shared/meds'

const T = '2026-10-03' // sábado
const ibu: MedLike = { id: 'ibu', name: 'Ibuprofeno', dose: '600 mg', times: ['21:00', '09:00'], stock: 10, archived: 0 }
const vit: MedLike = { id: 'vit', name: 'Vitamina D', times: ['09:00'], days: [1, 3, 5], archived: 0 }
const para: MedLike = { id: 'para', name: 'Paracetamol', times: [], stock: 2, maxPerDay: 3, archived: 0 }
const at = (hhmm: string, date = T) => Date.parse(`${date}T${hhmm}:00+02:00`)

describe('medicación', () => {
  it('las tomas del día con su estado, en orden; los días que no toca, nada', () => {
    const logs: MedLogLike[] = [takeLog(ibu, T, '09:00', at('09:12'))]
    const doses = dosesOn([ibu, vit, para], logs, T, T, '21:30')
    expect(doses.map((d) => `${d.time} ${d.med.id} ${d.state}`)).toEqual(['09:00 ibu taken', '21:00 ibu due'])
    expect(dosesOn([ibu], [], T, T, '22:10').map((d) => d.state)).toEqual(['late', 'late'])
    expect(dosesOn([ibu], [], '2026-10-02', T, '08:00').map((d) => d.state)).toEqual(['missed', 'missed'])
    expect(dosesOn([vit], [], '2026-10-05', T, '08:00').map((d) => d.state)).toEqual(['upcoming'])
    // Tratamiento acabado: ya no sale
    expect(dosesOn([{ ...ibu, until: '2026-10-02' }], [], T, T, '08:00')).toEqual([])
  })

  it('«me la he tomado»: la pendiente más cercana; nada si falta mucho', () => {
    expect(doseToTake(ibu, [], T, '08:00')).toEqual({ time: '09:00' })
    expect(doseToTake(ibu, [], T, '20:40')).toEqual({ time: '21:00' })
    expect(doseToTake(ibu, [takeLog(ibu, T, '09:00', at('09:00'))], T, '13:00')).toEqual({})
    // La de la mañana olvidada se puede marcar a mediodía
    expect(doseToTake(ibu, [], T, '13:00')).toEqual({ time: '09:00' })
    expect(doseToTake(para, [], T, '13:00')).toEqual({})
  })

  it('la caja: cuánto queda, para cuántos días y cuándo reponer', () => {
    expect(daysLeft(ibu)).toBe(5)
    expect(needsRefill(ibu, T)).toBe(true)
    expect(needsRefill({ ...ibu, stock: 40 }, T)).toBe(false)
    // Si el tratamiento acaba antes de que se gaste, no hace falta
    expect(needsRefill({ ...ibu, until: '2026-10-05' }, T)).toBe(false)
    expect(needsRefill(para, T)).toBe(true)
    expect(stockAfter({ ...ibu, perDose: 2 }, 'taken')).toBe(8)
    expect(stockAfter(ibu, 'skipped')).toBe(10)
    expect(daysLeft({ ...vit, stock: 30 })).toBe(70)
  })

  it('tratamiento, cumplimiento y lo que se le cuenta a Claude', () => {
    expect(treatmentDay({ ...ibu, from: '2026-10-01', until: '2026-10-07' }, T)).toEqual({ day: 3, total: 7 })
    const logs = [takeLog(ibu, '2026-10-02', '09:00', at('09:05', '2026-10-02')), takeLog(ibu, T, '09:00', at('09:12')), takeLog(para, T, undefined, at('13:40'))]
    expect(adherence([ibu], logs, T, '10:00', 2)).toEqual({ due: 3, taken: 2, rate: 2 / 3 })
    expect(medsSummary([ibu, vit, para], logs, T, '10:00', 'Europe/Madrid')).toEqual([
      'Ibuprofeno 600 mg: 09:00 tomada a las 9:12; 21:00 pendiente · quedan 10, toca reponer',
      'Paracetamol (cuando haga falta): hoy 1 vez, la última a las 13:40 · máximo 3 al día',
    ])
  })

  it('encontrar el medicamento por lo que se dice', () => {
    expect(findMed([ibu, vit, para], 'el ibuprofeno')?.id).toBe('ibu')
    expect(findMed([ibu, vit, para], 'la vitamina')?.id).toBe('vit')
    expect(findMed([ibu, vit], 'la pastilla')).toBeUndefined()
    expect(findMed([ibu], 'la pastilla')?.id).toBe('ibu')
  })

  it('avisos: a la hora y dos veces más, cada 15 minutos', () => {
    expect(['08:59', '09:00', '09:14', '09:15', '09:31', '09:45'].map((n) => nagIndex('09:00', n))).toEqual([undefined, 0, 0, 1, 2, undefined])
    expect(medReminder(ibu, '09:00', 0)).toEqual({ title: 'Hora de tomar: Ibuprofeno', body: '600 mg · 09:00' })
    expect(medReminder(ibu, '09:00', 1).title).toBe('¿Te has tomado Ibuprofeno?')
  })
})

describe('medicación: desde cuándo cuenta', () => {
  it('lo de antes de darla de alta no cuenta como olvidado', () => {
    const nueva: MedLike = { ...ibu, from: T }
    expect(dosesOn([nueva], [], '2026-10-02', T, '10:00')).toEqual([])
    expect(adherence([nueva], [], T, '10:00', 14)).toEqual({ due: 1, taken: 0, rate: 0 })
  })
})
