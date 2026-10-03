import { describe, expect, it } from 'vitest'
import { findUrl, linkTask, pageTitle, prettyUrl } from '../../supabase/functions/_shared/links'

describe('enlaces', () => {
  it('saca el enlace del texto (sin la puntuación que lo cierra)', () => {
    expect(findUrl('Leer esto mañana https://elpais.com/a/b.html).')).toEqual({ url: 'https://elpais.com/a/b.html', rest: 'Leer esto mañana' })
    expect(findUrl('https://youtu.be/xyz')).toEqual({ url: 'https://youtu.be/xyz', rest: '' })
    expect(findUrl('Mira esto: https://x.com/a')).toEqual({ url: 'https://x.com/a', rest: 'Mira esto' })
    expect(findUrl('sin enlace')).toBeUndefined()
  })
  it('el título de la página: el de compartir o el de la pestaña, con sus acentos', () => {
    expect(pageTitle('<head><title>Pestaña | Diario</title><meta content="La vivienda en Espa&ntilde;a: &quot;todo&quot;" property="og:title"></head>')).toBe('La vivienda en España: "todo"')
    expect(pageTitle("<title>\n  Receta de tortilla &amp; más &#8211; Cocina\n</title>")).toBe('Receta de tortilla & más – Cocina')
    expect(pageTitle('<meta name="og:title" content=\'It"s\'>')).toBe('It"s')
    expect(pageTitle('<p>nada</p>')).toBeUndefined()
  })
  it('lo que se apunta: lo escrito, o el título, o la dirección legible', () => {
    expect(prettyUrl('https://www.elpais.com/economia/2026-10-03/la-vivienda-sube.html')).toBe('elpais.com · la vivienda sube')
    expect(prettyUrl('https://github.com/')).toBe('github.com')
    expect(prettyUrl('https://www.youtube.com/watch?v=abc')).toBe('youtube.com')
    expect(linkTask('', 'https://a.com/x', 'Título')).toEqual({ title: 'Título', notes: 'https://a.com/x' })
    expect(linkTask('Leer', 'https://a.com/x', 'Título')).toEqual({ title: 'Leer', notes: 'https://a.com/x' })
    expect(linkTask('', 'https://a.com/x-y')).toEqual({ title: 'a.com · x y', notes: 'https://a.com/x-y' })
  })
})
