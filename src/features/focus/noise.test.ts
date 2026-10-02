import { describe, expect, it } from 'vitest'
import { noiseSamples } from './noise'

/** Cuánto cambia de una muestra a la siguiente: mucho en el ruido blanco (agudos), poco en el marrón (graves) */
const roughness = (x: Float32Array) => {
  let s = 0
  for (let i = 1; i < x.length; i++) s += Math.abs(x[i] - x[i - 1])
  return s / (x.length - 1)
}

describe('sonido de fondo', () => {
  it('nunca se sale de [-1, 1]', () => {
    for (const kind of ['white', 'pink', 'brown'] as const) {
      const x = noiseSamples(kind, 44_100)
      expect(Math.max(...x.map(Math.abs))).toBeLessThanOrEqual(1)
      expect(roughness(x)).toBeGreaterThan(0)
    }
  })

  it('el marrón es más grave que el rosa y el rosa que el blanco', () => {
    const n = 44_100
    const white = roughness(noiseSamples('white', n))
    const pink = roughness(noiseSamples('pink', n))
    const brown = roughness(noiseSamples('brown', n))
    expect(brown).toBeLessThan(pink)
    expect(pink).toBeLessThan(white)
  })
})
