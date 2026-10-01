import { getSupabase } from '@/sync/client'
import { parseRecipeText, type RecipeData } from './recipes'

export const looksLikeUrl = (s: string) => /^\s*https?:\/\/\S+\s*$/i.test(s)

/**
 * Trae una receta: de una web (lo lee la Edge Function `recipe`, hace falta
 * cuenta) o del texto pegado. Devuelve la receta o el motivo por el que no.
 */
export async function importRecipe(input: string, signedIn: boolean): Promise<{ recipe: RecipeData } | { error: string }> {
  if (!looksLikeUrl(input)) {
    const recipe = parseRecipeText(input)
    return recipe ? { recipe } : { error: 'Pega el enlace de la receta o su texto.' }
  }
  if (!signedIn) return { error: 'Para traer recetas de una web hace falta iniciar sesión. Mientras, puedes copiar el texto de la receta y pegarlo aquí.' }
  try {
    const { data, error } = await (await getSupabase()).functions.invoke<{ recipe?: RecipeData; error?: string }>('recipe', { body: { url: input.trim() } })
    if (data?.recipe) return { recipe: data.recipe }
    // El cuerpo del error trae el motivo
    const ctx = (error as { context?: Response } | null)?.context
    const body = ctx && typeof ctx.json === 'function' ? ((await ctx.json().catch(() => null)) as { error?: string } | null) : null
    return { error: body?.error ?? data?.error ?? 'No se pudo leer la página. Prueba a copiar el texto y pegarlo.' }
  } catch {
    return { error: 'Sin conexión: prueba a copiar el texto de la receta y pegarlo.' }
  }
}
