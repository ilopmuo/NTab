import { describe, expect, it } from 'vitest'
import { FEATURES, cardOn, featureOn, featureOfSection, reminderAllowed, sectionOn } from './features'
import { HUBS, SECTIONS, hubOf, sectionOfRoute } from '@/app/sections'

/** Pestañas que se ven (un lugar con una sola no lleva fila de pestañas) */
const tabsTotal = () => HUBS.reduce((n, h) => n + (h.tabs.length > 1 ? h.tabs.length : 0), 0)

describe('funciones activables', () => {
  it('todo encendido por defecto; lo apagado se guarda a false', () => {
    expect(featureOn({}, 'menu')).toBe(true)
    expect(featureOn(null, 'menu')).toBe(true)
    expect(featureOn({ menu: false }, 'menu')).toBe(false)
  })

  it('secciones y tarjetas de Hoy siguen a su función; lo esencial no se apaga', () => {
    const flags = { menu: false, habits: false }
    expect(sectionOn(flags, 'menu')).toBe(false)
    // Hábitos lleva también Última vez: se ve mientras quede alguna de las dos
    expect(sectionOn(flags, 'habits')).toBe(true)
    expect(sectionOn({ ...flags, trackers: false }, 'habits')).toBe(false)
    expect(sectionOn(flags, 'today')).toBe(true)
    expect(sectionOn(flags, 'projects')).toBe(true)
    expect(cardOn(flags, 'meals')).toBe(false)
    expect(cardOn(flags, 'habits')).toBe(false)
    expect(cardOn(flags, 'agenda')).toBe(true)
    expect(featureOfSection('menu')?.label).toBe('Menú')
    expect(featureOfSection('today')).toBeUndefined()
  })

  it('cada función apunta a secciones que existen, y cada sección está en un espacio', () => {
    const ids = new Set(SECTIONS.map((s) => s.id))
    for (const f of FEATURES) for (const s of f.sections) expect(ids.has(s), `${f.id} → ${s}`).toBe(true)
    // Todas menos las del pie (Papelera, Ajustes) viven en un lugar: como pestaña o dentro de él
    for (const s of SECTIONS.filter((x) => !['trash', 'settings'].includes(x.id))) expect(hubOf(sectionOfRoute(s.id)), s.id).toBeTruthy()
    // Pocas pestañas: como mucho cuatro en un lugar, y solo donde hay cosas distintas
    expect(tabsTotal()).toBeLessThanOrEqual(11)
    for (const h of HUBS) expect(h.tabs.length, h.id).toBeLessThanOrEqual(4)
    const tabs = HUBS.flatMap((h) => h.tabs.map((t) => t.id))
    expect(tabs).toHaveLength(new Set(tabs).size)
    for (const t of tabs) expect(ids.has(t), t).toBe(true)
  })

  it('el servidor no avisa de lo apagado', () => {
    expect(reminderAllowed({ habits: false }, 'habits')).toBe(false)
    expect(reminderAllowed({ finance: false }, 'subscriptions')).toBe(false)
    expect(reminderAllowed({ habits: false }, 'tasks')).toBe(true)
    expect(reminderAllowed(undefined, 'habits')).toBe(true)
  })
})
