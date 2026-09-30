/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ACCENTS } from './accents'

/**
 * Cada color de acento, en los dos temas, tiene que cumplir el contraste AA
 * (4,5:1) en sus tres usos: como texto sobre los fondos de la app, como relleno
 * con texto blanco y como texto sobre su propio fondo suave (botones tintados).
 */
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

type RGB = [number, number, number]
const hex = (h: string): RGB => {
  const s = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB
}
const lum = (c: RGB) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const mix = (fg: RGB, bg: RGB, p: number) => fg.map((c, i) => Math.round(c * p + bg[i] * (1 - p))) as RGB

/** Variables de un bloque de index.css (por su selector exacto) */
function block(selector: string) {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return {}
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const base = { dark: block(":root,\n[data-theme='dark']"), light: block("[data-theme='light']") }
// Fondo de la app, celdas y hojas de cristal grueso (rgb(36 36 38 / 0.96) sobre negro)
const SURFACES = { dark: [base.dark['--c-bg'], base.dark['--c-surface'], '#232325'], light: [base.light['--c-bg'], base.light['--c-surface']] }
const SOFT = { dark: 0.2, light: 0.14 }
const WHITE: RGB = [255, 255, 255]

describe('colores de acento', () => {
  it('cada acento tiene sus tonos en los dos temas', () => {
    for (const a of ACCENTS.filter((x) => x.id !== 'blue'))
      for (const theme of ['dark', 'light'] as const) {
        const v = block(`[data-theme='${theme}'][data-accent='${a.id}']`)
        expect(Object.keys(v).sort(), `${a.id} ${theme}`).toEqual(['--c-accent-fill', '--c-accent-on-soft', '--c-blue'])
      }
  })

  for (const a of ACCENTS)
    for (const theme of ['dark', 'light'] as const)
      it(`${a.label} en tema ${theme === 'dark' ? 'oscuro' : 'claro'}: contraste AA`, () => {
        const v = { ...base[theme], ...(a.id === 'blue' ? {} : block(`[data-theme='${theme}'][data-accent='${a.id}']`)) }
        const text = hex(v['--c-blue'])
        const fill = hex(v['--c-accent-fill'])
        const onSoft = hex(v['--c-accent-on-soft'])
        for (const s of SURFACES[theme]) {
          const bg = hex(s)
          expect(contrast(text, bg), `texto sobre ${s}`).toBeGreaterThanOrEqual(4.5)
          expect(contrast(onSoft, mix(text, bg, SOFT[theme])), `tintado sobre ${s}`).toBeGreaterThanOrEqual(4.5)
        }
        expect(contrast(fill, WHITE), 'blanco sobre el relleno').toBeGreaterThanOrEqual(4.5)
      })
})
