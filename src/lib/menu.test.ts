import { describe, expect, it } from 'vitest'
import type { Recipe } from '@/db/types'
import { ingredientsFor } from './menu'

describe('menú', () => {
  it('junta los ingredientes de las recetas del menú', () => {
    const recipes: Recipe[] = [{ id: 'r1', name: 'Tortilla', ingredients: ['6 huevos', '1 kg de patatas', 'Aceite'], createdAt: 0 }]
    const items = ingredientsFor(
      [
        { id: 'a', date: '2026-09-24', meal: 'comida', recipeId: 'r1' },
        { id: 'b', date: '2026-09-24', meal: 'cena', text: 'Sobras' },
      ],
      recipes,
    )
    expect(items).toEqual([{ name: 'Huevos', qty: '6' }, { name: 'Patatas', qty: '1 kg' }, { name: 'Aceite' }])
  })
})
