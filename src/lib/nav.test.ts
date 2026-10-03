import { describe, expect, it } from 'vitest'
import { DEFAULT_HIDDEN, DEFAULT_LIST, DEFAULT_TABS, DEFAULT_TILES, resolveNav, setTab } from './nav'

const ALL = [...DEFAULT_TILES, ...DEFAULT_LIST, 'trash', 'settings']

describe('resolveNav', () => {
  it('sin ajustes: la barra de siempre', () => {
    const nav = resolveNav(null, ALL)
    expect(nav.tiles).toEqual(DEFAULT_TILES)
    expect(nav.list).toEqual(DEFAULT_LIST.filter((id) => !DEFAULT_HIDDEN.includes(id)))
    expect(nav.hidden).toEqual(DEFAULT_HIDDEN)
    expect(nav.tabs).toEqual(DEFAULT_TABS)
  })

  it('el pie (papelera y ajustes) no se coloca', () => {
    const nav = resolveNav({ place: { settings: 'hidden', trash: 'tile' } }, ALL)
    expect(nav.order).not.toContain('settings')
    expect(nav.order).not.toContain('trash')
  })

  it('de la navegación de antes se quitan los espacios que ya no existen (Planificar ahora sale de Hoy)', () => {
    const nav = resolveNav({ order: ['plan', 'notes', 'filters'], place: { plan: 'tile' }, tabs: ['today', 'plan', 'inbox', 'habits'] }, ALL)
    expect(nav.order).not.toContain('plan')
    expect(nav.tabs).not.toContain('plan')
    expect(nav.tabs).toHaveLength(4)
  })

  it('respeta el orden, el sitio y las ocultas', () => {
    const nav = resolveNav({ order: ['notes', 'today', 'money'], place: { money: 'tile', inbox: 'hidden', people: 'hidden' } }, ALL)
    expect(nav.tiles.slice(0, 3)).toEqual(['notes', 'today', 'money'])
    expect(nav.hidden.filter((id) => !DEFAULT_HIDDEN.includes(id))).toEqual(['inbox', 'people'])
    expect(nav.list).not.toContain('money')
  })

  it('lo oculto se puede volver a poner en la lista', () => {
    const hidden = resolveNav({ place: { filters: 'hidden' } }, ALL)
    expect(hidden.hidden).toEqual(['filters'])
    const back = resolveNav({ place: { filters: 'list' } }, ALL)
    expect(back.list).toContain('filters')
    expect(back.hidden).toEqual([])
  })

  it('de la navegación de antes (por secciones) se queda lo que sigue existiendo', () => {
    const nav = resolveNav({ order: ['shopping', 'notes', 'upcoming'], place: { notes: 'list', shopping: 'tile' }, tabs: ['today', 'upcoming', 'calendar', 'habits'] }, ALL)
    expect(nav.order).not.toContain('shopping')
    expect(nav.list).toContain('notes')
    expect(nav.tabs).toEqual(['today', 'calendar', 'habits', 'inbox'])
  })

  it('Hoy no se puede ocultar', () => {
    const nav = resolveNav({ place: { today: 'hidden' } }, ALL)
    expect(nav.tiles).toContain('today')
    expect(nav.hidden).not.toContain('today')
  })

  it('las secciones nuevas aparecen en su sitio por defecto', () => {
    const nav = resolveNav({ order: ['habits', 'today'], place: { habits: 'list' } }, [...ALL, 'nueva'])
    expect(nav.order.slice(0, 2)).toEqual(['habits', 'today'])
    expect(nav.list).toContain('nueva')
    expect(nav.order).toHaveLength(new Set(nav.order).size)
  })

  it('ignora ids desconocidos, repetidos y sitios no válidos', () => {
    const nav = resolveNav({ order: ['vieja', 'notes', 'notes'], place: { notes: 'raro' as never }, tabs: ['vieja', 'inbox', 'inbox'] }, ALL)
    expect(nav.order).not.toContain('vieja')
    expect(nav.order.filter((x) => x === 'notes')).toHaveLength(1)
    expect(nav.place.notes).toBe('list')
    expect(nav.tabs).toEqual(['inbox', 'today', 'calendar', 'habits'])
  })

  it('siempre hay cuatro pestañas', () => {
    expect(resolveNav({ tabs: ['home', 'money', 'filters', 'people', 'notes'] }, ALL).tabs).toEqual(['home', 'money', 'filters', 'people'])
    expect(resolveNav({ tabs: [] }, ALL).tabs).toEqual(DEFAULT_TABS)
  })
})

describe('setTab', () => {
  it('pone la sección en su hueco', () => {
    expect(setTab(['today', 'upcoming', 'calendar', 'habits'], 1, 'shopping')).toEqual(['today', 'shopping', 'calendar', 'habits'])
  })
  it('si ya estaba en otra pestaña, se intercambian', () => {
    expect(setTab(['today', 'upcoming', 'calendar', 'habits'], 0, 'habits')).toEqual(['habits', 'upcoming', 'calendar', 'today'])
  })
})
