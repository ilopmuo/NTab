import { describe, expect, it } from 'vitest'
import { FEATURES, cardOn, featureOn, featureOfSection, reminderAllowed, sectionOn } from './features'
import { SECTIONS } from '@/app/sections'

describe('funciones activables', () => {
  it('todo encendido por defecto; lo apagado se guarda a false', () => {
    expect(featureOn({}, 'menu')).toBe(true)
    expect(featureOn(null, 'menu')).toBe(true)
    expect(featureOn({ menu: false }, 'menu')).toBe(false)
  })

  it('secciones y tarjetas de Hoy siguen a su función; lo esencial no se apaga', () => {
    const flags = { menu: false, habits: false }
    expect(sectionOn(flags, 'menu')).toBe(false)
    expect(sectionOn(flags, 'habits')).toBe(false)
    expect(sectionOn(flags, 'today')).toBe(true)
    expect(sectionOn(flags, 'projects')).toBe(true)
    expect(cardOn(flags, 'meals')).toBe(false)
    expect(cardOn(flags, 'habits')).toBe(false)
    expect(cardOn(flags, 'agenda')).toBe(true)
    expect(featureOfSection('menu')?.label).toBe('Menú')
    expect(featureOfSection('today')).toBeUndefined()
  })

  it('cada función apunta a secciones que existen y tiene grupo en la barra lateral', () => {
    const ids = new Set(SECTIONS.map((s) => s.id))
    for (const f of FEATURES) for (const s of f.sections) expect(ids.has(s), `${f.id} → ${s}`).toBe(true)
    for (const s of SECTIONS.filter((x) => FEATURES.some((f) => f.sections.includes(x.id)))) expect(s.group, s.id).toBeTruthy()
  })

  it('el servidor no avisa de lo apagado', () => {
    expect(reminderAllowed({ habits: false }, 'habits')).toBe(false)
    expect(reminderAllowed({ finance: false }, 'subscriptions')).toBe(false)
    expect(reminderAllowed({ habits: false }, 'tasks')).toBe(true)
    expect(reminderAllowed(undefined, 'habits')).toBe(true)
  })
})
