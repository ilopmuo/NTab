import { describe, expect, it } from 'vitest'
import { classify, infinitive, likeness } from './intent'

const names = { habits: ['Meditar', 'Beber agua'], notes: ['Maleta', 'Ideas de regalo'], lists: ['Farmacia'], projects: ['Mudanza', 'Web nueva'] }
const T = '2026-10-05'
const say = (s: string) => classify(s, names, T)

describe('a dónde va lo que se apunta (Siri y la captura de la app)', () => {
  it('la compra, con o sin dos puntos, y otras listas', () => {
    expect(say('Compra: leche, pan')).toEqual({ kind: 'shopping', items: 'leche, pan' })
    expect(say('Compra leche y pan.')).toEqual({ kind: 'shopping', items: 'leche y pan' })
    expect(say('Añade huevos a la lista de la compra')).toEqual({ kind: 'shopping', items: 'huevos' })
    expect(say('Añade ibuprofeno a la lista de la farmacia')).toEqual({ kind: 'shopping', items: 'ibuprofeno', list: 'Farmacia' })
    expect(say('Quita la leche de la compra')).toEqual({ kind: 'bought', items: 'la leche' })
    // «comprar…» y «compra…» con día son tareas
    expect(say('Comprar un regalo para Ana').kind).toBe('task')
    expect(say('Compra entradas para el concierto el viernes').kind).toBe('task')
  })

  it('la lista de un proyecto es una tarea allí', () => {
    expect(say('Añade llamar al seguro a la lista de Mudanza')).toEqual({ kind: 'projectTask', text: 'llamar al seguro', project: 'Mudanza' })
  })

  it('gastos: con importe; «he pagado la luz» sin importe no lo es', () => {
    expect(say('Gasto 12,50 café')).toEqual({ kind: 'expense', text: '12,50 café' })
    expect(say('Me he gastado 20 en la cena')).toEqual({ kind: 'expense', text: '20 en la cena' })
    expect(say('He pagado la luz').kind).toBe('task')
  })

  it('notas: nueva (con su punto final) o añadir a una que ya hay', () => {
    expect(say('Nota: el código del portal es 4512. Cambia en octubre.')).toEqual({ kind: 'note', title: 'El código del portal es 4512', body: 'el código del portal es 4512. Cambia en octubre.' })
    expect(say('A la nota maleta: crema solar')).toEqual({ kind: 'noteAppend', note: 'maleta', text: 'crema solar' })
    expect(say('Añade a la nota ideas de regalo una bici')).toEqual({ kind: 'noteAppend', note: 'Ideas de regalo', text: 'una bici' })
    expect(say('Añade crema solar a la nota maleta')).toEqual({ kind: 'noteAppend', note: 'maleta', text: 'crema solar' })
  })

  it('hábitos, hecho y tus cosas', () => {
    expect(say('+2 agua')).toEqual({ kind: 'habit', name: 'agua', qty: 2 })
    expect(say('Meditar.')).toEqual({ kind: 'habit', name: 'Meditar' })
    expect(say('Hecho: cambiar las sábanas')).toEqual({ kind: 'done', what: 'cambiar las sábanas' })
    expect(say('He dejado las llaves en el cajón de la entrada')).toEqual({ kind: 'thing', name: 'Llaves', where: 'el cajón de la entrada' })
    expect(say('Apunta que el pasaporte está debajo de la cama')).toEqual({ kind: 'thing', name: 'Pasaporte', where: 'debajo de la cama' })
    expect(say('Le he prestado el taladro a Luis')).toEqual({ kind: 'lent', name: 'Taladro', person: 'Luis' })
    expect(say('He puesto la lavadora en marcha').kind).not.toBe('thing')
  })

  it('las preguntas y lo demás, tareas (quien llama decide si responde)', () => {
    expect(say('¿Qué tengo mañana?').kind).toBe('task')
    expect(say('Qué falta en la compra').kind).toBe('task')
    expect(say('Llamar a mamá mañana a las 7').kind).toBe('task')
  })

  it('parecidos por el infinitivo', () => {
    expect(likeness('he llamado al dentista', 'Llamar al dentista')).toBeGreaterThanOrEqual(1)
    expect(likeness('regué las plantas', 'Regar las plantas')).toBeGreaterThanOrEqual(1)
    expect(likeness('he llamado al dentista', 'Pedir cita al dentista')).toBe(0)
    expect(infinitive('he pedido la tarjeta sanitaria')).toBe('Pedir la tarjeta sanitaria')
    expect(infinitive('he bebido agua')).toBe('Beber agua')
  })
})
