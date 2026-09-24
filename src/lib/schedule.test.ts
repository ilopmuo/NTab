import { describe, expect, it } from 'vitest'
import { autoSchedule, freeSlots, mergeBlocks, toHHMM, toMin } from './schedule'

describe('colocar en huecos', () => {
  it('une bloques y encuentra huecos', () => {
    expect(mergeBlocks([{ start: 600, end: 660 }, { start: 650, end: 700 }, { start: 800, end: 830 }])).toEqual([
      { start: 600, end: 700 },
      { start: 800, end: 830 },
    ])
    expect(freeSlots([{ start: 600, end: 700 }], 540, 720)).toEqual([
      { start: 540, end: 600 },
      { start: 700, end: 720 },
    ])
  })
  it('lo importante primero y respetando reuniones', () => {
    const busy = [{ start: toMin('10:00'), end: toMin('11:00') }]
    const { placed, unplaced } = autoSchedule(
      [
        { id: 'correos', priority: 0, estimate: 30 },
        { id: 'informe', priority: 3, estimate: 90 },
        { id: 'llamar', priority: 1 },
      ],
      busy,
      { from: toMin('09:02'), dayEnd: toMin('14:00') },
    )
    // Antes de las 10 no caben 90 min: el informe va tras la reunión. Los
    // correos (30 min) ya no caben entre 09:40 y 10:00, así que van al final.
    expect(placed.map((p) => [p.id, toHHMM(p.start)])).toEqual([
      ['llamar', '09:05'],
      ['informe', '11:00'],
      ['correos', '12:35'],
    ])
    expect(unplaced).toEqual([])
  })
  it('lo que no cabe se queda fuera', () => {
    const { placed, unplaced } = autoSchedule([{ id: 'grande', priority: 0, estimate: 240 }], [], { from: toMin('19:00'), dayEnd: toMin('21:00') })
    expect(placed).toEqual([])
    expect(unplaced).toEqual(['grande'])
  })
})
