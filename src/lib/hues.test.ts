/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HUES } from './hues'

/**
 * Colores de módulo: en los dos temas, el tono de tinta de cada uno se lee
 * como texto (AA, 4,5:1) sobre el fondo, las celdas y las hojas; y los colores
 * que elige el usuario, mezclados con el texto (`--ink-mix`), también.
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

function block(selector: string) {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const themes = { dark: block(":root,\n[data-theme='dark']"), light: block("[data-theme='light']") }
const SURFACES = {
  dark: [themes.dark['--c-bg'], themes.dark['--c-surface'], themes.dark['--c-elevated'], '#1f1f24'],
  light: [themes.light['--c-bg'], themes.light['--c-surface']],
}
/** Colores que la app propone para áreas, proyectos y hábitos */
const USER_COLORS = ['#0A84FF', '#BF5AF2', '#FF453A', '#30D158', '#FF9F0A', '#40C8E0', '#FF375F', '#5E5CE6', '#5B57E8', '#FFD60A', '#AC8E68']

describe('colores de módulo', () => {
  for (const theme of ['dark', 'light'] as const) {
    const v = themes[theme]
    const label = theme === 'dark' ? 'oscuro' : 'claro'
    for (const h of HUES)
      it(`${h} en tema ${label}: sólido y tinta con contraste AA`, () => {
        expect(v[`--m-${h}`], `--m-${h}`).toMatch(/^#[0-9a-f]{6}$/)
        const ink = hex(v[`--m-${h}-ink`])
        for (const s of SURFACES[theme]) expect(contrast(ink, hex(s)), `${h} sobre ${s}`).toBeGreaterThanOrEqual(4.5)
      })
    it(`colores libres en tema ${label}: se leen mezclados con el texto`, () => {
      const p = parseFloat(v['--ink-mix']) / 100
      const text = hex(v['--c-text'])
      for (const c of USER_COLORS)
        for (const s of SURFACES[theme]) expect(contrast(mix(hex(c), text, p), hex(s)), `${c} sobre ${s}`).toBeGreaterThanOrEqual(4.5)
    })
  }
})
