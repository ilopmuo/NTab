import { describe, expect, it } from 'vitest'
import { DEFAULT_HIDDEN, DEFAULT_LIST, DEFAULT_TABS, DEFAULT_TILES, resolveNav, setTab } from './nav'

const ALL = [...DEFAULT_TILES, ...DEFAULT_LIST, 'trash', 'logbook', 'settings']

describe('resolveNav', () => {
  it('sin ajustes: la barra de siempre', () => {
    const nav = resolveNav(null, ALL)
    expect(nav.tiles).toEqual(DEFAULT_TILES)
    expect(nav.list).toEqual(DEFAULT_LIST.filter((id) => !DEFAULT_HIDDEN.includes(id)))
    // Matriz y Plantillas empiezan ocultas, para no saturar la barra
    expect(nav.hidden).toEqual(DEFAULT_HIDDEN)
    expect(nav.tabs).toEqual(DEFAULT_TABS)
  })

  it('el pie (completadas, papelera, ajustes) no se coloca', () => {
    const nav = resolveNav({ place: { settings: 'hidden', trash: 'tile' } }, ALL)
    expect(nav.order).not.toContain('settings')
    expect(nav.order).not.toContain('trash')
    expect(nav.order).not.toContain('logbook')
  })

  it('respeta el orden, el sitio y las ocultas', () => {
    const nav = resolveNav({ order: ['notes', 'today', 'menu'], place: { menu: 'tile', inbox: 'hidden', review: 'hidden' } }, ALL)
    expect(nav.tiles.slice(0, 3)).toEqual(['notes', 'today', 'menu'])
    expect(nav.hidden.filter((id) => !DEFAULT_HIDDEN.includes(id))).toEqual(['inbox', 'review'])
    expect(nav.list).not.toContain('menu')
  })

  it('lo oculto por defecto se puede volver a poner en la lista', () => {
    const nav = resolveNav({ place: { matrix: 'list' } }, ALL)
    expect(nav.list).toContain('matrix')
    expect(nav.hidden).toEqual(['templates'])
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
    expect(nav.tabs).toEqual(['inbox', 'today', 'upcoming', 'calendar'])
  })

  it('siempre hay cuatro pestañas', () => {
    expect(resolveNav({ tabs: ['shopping', 'menu', 'journal', 'people', 'notes'] }, ALL).tabs).toEqual(['shopping', 'menu', 'journal', 'people'])
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
