/**
 * Colores de módulo (docs/REDISENO.md). Cada uno tiene, en cada tema, un tono
 * sólido (`--m-x`: baldosas, anillos, barras) y uno de tinta (`--m-x-ink`:
 * texto de color con contraste AA). Los valores viven en index.css.
 */
export const HUES = ['blue', 'sky', 'red', 'pink', 'orange', 'yellow', 'green', 'mint', 'teal', 'indigo', 'purple', 'brown', 'gray'] as const
export type Hue = (typeof HUES)[number]

/** Sólidos tan claros que el glifo encima va en negro, no en blanco */
const ON_DARK = new Set<string>(['yellow', 'mint', 'sky'])

const isHue = (c: string): c is Hue => (HUES as readonly string[]).includes(c)

/** Tono sólido de un color de módulo, o el color tal cual si es un hex o una variable */
export const hue = (c: Hue | string) => (isHue(c) ? `var(--m-${c})` : c)

/** Tono para texto: el de tinta del módulo o, para un color libre, mezclado con el texto hasta leerse */
export const ink = (c: Hue | string) => (isHue(c) ? `var(--m-${c}-ink)` : `color-mix(in srgb, ${c} var(--ink-mix), var(--c-text))`)

/** Glifo encima del tono sólido */
export const onHue = (c: Hue | string) => (isHue(c) && ON_DARK.has(c) ? '#0b0b0e' : '#ffffff')

/** Fondo suave del color (chips, pistas de anillos, halos) */
export const softHue = (c: Hue | string, pct = 18) => `color-mix(in srgb, ${hue(c)} ${pct}%, transparent)`

/** Degradado de baldosa (como Atajos): un poco más claro arriba */
export const tileGradient = (c: Hue | string) =>
  `linear-gradient(160deg, color-mix(in srgb, ${hue(c)} 78%, white) 0%, ${hue(c)} 62%, color-mix(in srgb, ${hue(c)} 86%, black) 100%)`
