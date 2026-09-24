import type { MenuSlot, Recipe } from '@/db/types'
import { parseItem, type ParsedItem } from './shopping'

export const MEALS = [
  { id: 'comida', label: 'Comida' },
  { id: 'cena', label: 'Cena' },
] as const

export const slotId = (date: string, meal: MenuSlot['meal']) => `${date}:${meal}`

export const RECIPE_PRESETS: { name: string; ingredients: string[] }[] = [
  { name: 'Tortilla de patatas', ingredients: ['6 huevos', '1 kg de patatas', '1 cebolla', 'Aceite de oliva', 'Sal'] },
  { name: 'Lentejas', ingredients: ['400 g de lentejas', '1 chorizo', '2 zanahorias', '1 patata', '1 cebolla', '1 pimiento'] },
  { name: 'Pasta boloñesa', ingredients: ['500 g de macarrones', '400 g de carne picada', 'Tomate triturado', '1 cebolla', 'Queso rallado'] },
  { name: 'Pollo al horno', ingredients: ['1 pollo', '4 patatas', '1 limón', 'Ajo', 'Romero'] },
  { name: 'Crema de verduras', ingredients: ['2 calabacines', '2 zanahorias', '1 puerro', '2 patatas', 'Quesitos'] },
  { name: 'Ensalada completa', ingredients: ['Lechuga', 'Tomates', 'Atún', 'Huevos', 'Aceitunas'] },
]

/** Ingredientes de las comidas indicadas, ya entendidos para la lista de la compra */
export function ingredientsFor(slots: MenuSlot[], recipes: Recipe[]): ParsedItem[] {
  const byId = new Map(recipes.map((r) => [r.id, r]))
  const out: ParsedItem[] = []
  for (const s of slots) {
    const r = s.recipeId ? byId.get(s.recipeId) : undefined
    for (const line of r?.ingredients ?? []) {
      const it = parseItem(line)
      if (it) out.push(it)
    }
  }
  return out
}
