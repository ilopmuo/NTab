import { describe, expect, it } from 'vitest'
import { formatAmount, isoMinutes, parseRecipeHtml, parseRecipeText, scaleIngredient, stepTimers } from './recipes'

const page = (ld: unknown) => `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>…</body></html>`

describe('leer una receta de una web (schema.org/Recipe)', () => {
  it('lo normal: nombre, ingredientes, pasos, raciones y tiempo', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Tortilla de patatas &amp; cebolla',
      recipeYield: '4 raciones',
      totalTime: 'PT1H10M',
      recipeIngredient: ['6 huevos', '1 kg de patatas', '<b>1</b> cebolla'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Pela y corta las patatas.' },
        { '@type': 'HowToSection', name: 'Freír', itemListElement: [{ '@type': 'HowToStep', text: 'Fríe 20 minutos a fuego lento.' }] },
      ],
    })
    expect(parseRecipeHtml(html, 'https://x.es/tortilla')).toEqual({
      name: 'Tortilla de patatas & cebolla',
      ingredients: ['6 huevos', '1 kg de patatas', '1 cebolla'],
      steps: ['Pela y corta las patatas.', 'Fríe 20 minutos a fuego lento.'],
      servings: 4,
      minutes: 70,
      source: 'https://x.es/tortilla',
    })
  })
  it('dentro de @graph, con @type en lista y tiempos sueltos', () => {
    const html = page({ '@graph': [{ '@type': 'WebPage' }, { '@type': ['Recipe', 'Thing'], name: 'Lentejas', recipeIngredient: ['400 g de lentejas'], recipeInstructions: 'Paso uno.\nPaso dos.', prepTime: 'PT10M', cookTime: 'PT40M', recipeYield: [6] }] })
    const r = parseRecipeHtml(html)!
    expect(r.name).toBe('Lentejas')
    expect(r.steps).toEqual(['Paso uno.', 'Paso dos.'])
    expect(r.minutes).toBe(50)
    expect(r.servings).toBe(6)
  })
  it('sin receta o con JSON roto: nada', () => {
    expect(parseRecipeHtml('<html><script type="application/ld+json">{roto</script></html>')).toBeUndefined()
    expect(parseRecipeHtml(page({ '@type': 'Article', name: 'Noticia' }))).toBeUndefined()
    expect(isoMinutes('PT')).toBeUndefined()
    expect(isoMinutes('P0DT2H')).toBe(120)
  })
})

describe('receta pegada como texto', () => {
  it('nombre, raciones, ingredientes y pasos', () => {
    const r = parseRecipeText('Gazpacho\nPara 4 personas\n\nIngredientes:\n- 1 kg de tomates\n- 1 pepino\n\nPreparación:\n1. Trocea todo.\n2. Tritura y enfría 2 horas.')
    expect(r).toEqual({ name: 'Gazpacho', servings: 4, ingredients: ['1 kg de tomates', '1 pepino'], steps: ['Trocea todo.', 'Tritura y enfría 2 horas.'] })
  })
})

describe('raciones y cantidades', () => {
  it('escala lo que empieza por un número y deja lo demás', () => {
    expect(scaleIngredient('200 g de harina', 1.5)).toBe('300 g de harina')
    expect(scaleIngredient('1 1/2 tazas de leche', 2)).toBe('3 tazas de leche')
    expect(scaleIngredient('½ cebolla', 2)).toBe('1 cebolla')
    expect(scaleIngredient('3 huevos', 0.5)).toBe('1½ huevos')
    expect(scaleIngredient('2-3 dientes de ajo', 2)).toBe('4-6 dientes de ajo')
    expect(scaleIngredient('1,5 kg de patatas', 2)).toBe('3 kg de patatas')
    expect(scaleIngredient('2 a 3 cucharadas', 2)).toBe('4 a 6 cucharadas')
    expect(scaleIngredient('Sal', 3)).toBe('Sal')
    expect(scaleIngredient('100ml de nata', 3)).toBe('300ml de nata')
    expect(scaleIngredient('1 kg de tomates', 1.5)).toBe('1,5 kg de tomates')
    expect(scaleIngredient('1 taza de arroz', 1.5)).toBe('1½ taza de arroz')
    expect(formatAmount(2.333)).toBe('2⅓')
    expect(formatAmount(2.45)).toBe('2,5')
    expect(formatAmount(37.4)).toBe('37')
  })
})

describe('tiempos en los pasos (temporizadores)', () => {
  it('minutos, horas, rangos y en palabras', () => {
    expect(stepTimers('Hornea 20 minutos a 180°')).toEqual([20])
    expect(stepTimers('Cuece 1 hora y 15 min')).toEqual([75])
    expect(stepTimers('Deja reposar media hora y luego 5 min más')).toEqual([30, 5])
    expect(stepTimers('Fríe 10-12 minutos')).toEqual([12])
    expect(stepTimers('Enfría 1,5 h')).toEqual([90])
    expect(stepTimers('Sirve con 2 huevos')).toEqual([])
  })
})

describe('solo páginas públicas', () => {
  it('rechaza la red interna y lo que no es http(s)', async () => {
    const { publicHttpUrl } = await import('../../supabase/functions/_shared/safeUrl')
    expect(publicHttpUrl('https://www.recetasderechupete.com/tortilla/')?.hostname).toBe('www.recetasderechupete.com')
    expect(publicHttpUrl(' http://x.es/receta ')?.href).toBe('http://x.es/receta')
    expect(publicHttpUrl('http://[::ffff:808:808]/')?.hostname).toBe('[::ffff:808:808]')
    for (const bad of ['ftp://x.es', 'https://localhost/a', 'http://127.0.0.1', 'http://10.0.0.5/x', 'http://192.168.1.1', 'http://169.254.169.254/latest', 'http://172.20.0.1', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:a00:1]/', 'http://[fd00::1]/', 'https://user:pw@x.es', 'https://x.es:8080/', 'http://intranet/', 'https://nas.local/', 'no es una url'])
      expect(publicHttpUrl(bad), bad).toBeUndefined()
  })
})
