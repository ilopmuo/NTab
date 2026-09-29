import { test as base, expect, type Page } from '@playwright/test'

export { expect }

/** Supabase no responde: la app trabaja con IndexedDB, como sin conexión */
export async function offline(page: Page) {
  await page.route(/supabase\.co/, (r) => r.abort())
}

/** Deja la app lista en modo «sin cuenta» y en `path` */
export async function openApp(page: Page, path = '/today') {
  await page.goto('./')
  await page.evaluate(() => localStorage.setItem('ntab-local-only', '1'))
  await page.goto(`./#${path}`)
  await page.reload()
  await page.locator('#main').waitFor()
  // El icono de arranque se funde un momento después
  await expect(page.locator('[data-splash]')).toHaveCount(0)
}

/** Captura rápida con N, como lo haría alguien con el teclado */
export async function quickAdd(page: Page, text: string) {
  await page.keyboard.press('n')
  const input = page.getByRole('dialog').locator('input, textarea').first()
  await input.waitFor()
  await input.fill(text)
  await input.press('Enter')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/** Títulos de las tareas que se ven, en orden (sin los !!! de prioridad) */
export async function titles(page: Page) {
  return (await page.locator('#main [data-task-id] p').allInnerTexts()).map((t) => t.replace(/^!+\s*/, '').trim())
}

/**
 * `page` con la app abierta sin cuenta; el test falla si la página lanza algún
 * error de JavaScript.
 */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await offline(page)
      await use(errors)
      expect(errors, 'errores de JavaScript en la página').toEqual([])
    },
    { auto: true },
  ],
})
