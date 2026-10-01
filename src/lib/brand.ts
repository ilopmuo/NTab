/**
 * Formas de la marca LUNO. Las usan el logotipo de la app (components/Brand.tsx)
 * y el generador de iconos (scripts/icons.mjs), así que el favicon, el icono de
 * la app y la barra lateral son el mismo dibujo. Detalles en docs/BRAND.md.
 *
 * Símbolo: una órbita y, en ella, su luna, que la abre. El centro de un sistema
 * y lo que gira a su alrededor; también, sin decirlo, la «O» de LUNO.
 */
export const MARK = {
  /** Retícula de 24 × 24 */
  size: 24,
  /** Órbita: radio 7, abierta 62° alrededor de la luna, con cortes rectos */
  ring: 'M18.792 10.307A7 7 0 1 1 13.693 5.208',
  ringWidth: 3,
  /** Luna: sobre la propia órbita, a −45° */
  moon: { cx: 16.95, cy: 7.05, r: 2.6 },
} as const

/**
 * Logotipo «LUNO» (retícula de 83 × 24, letras de 22 de alto): geométrico, de un
 * solo grosor y con cortes rectos, como la órbita del símbolo.
 */
export const WORDMARK = {
  width: 83,
  height: 24,
  stroke: 2.6,
  /** L y N, rellenas */
  fills: ['M1 1H3.6V20.4H13.5V23H1Z', 'M39.5 1H42.1V23H39.5Z', 'M51.4 1H54V23H51.4Z', 'M39.5 1H42.437L54 23H51.063Z'],
  /** U y O, en trazo */
  u: 'M20.3 1V15.7a6.2 6.2 0 0 0 12.4 0V1',
  o: { cx: 71, cy: 12, r: 9.9 },
} as const

/** Colores de la marca (los de la interfaz, en index.css) */
export const BRAND = {
  ink: '#0b0b0e',
  paper: '#f4f4f6',
  indigo: '#5b57e8',
  indigoLight: '#8783ff',
} as const
