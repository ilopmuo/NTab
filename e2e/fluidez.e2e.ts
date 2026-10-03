import { expect, openApp, test } from './fixtures'
import type { Page } from '@playwright/test'

/** Muchas tareas en la Bandeja, directamente en la base de datos */
async function inbox(page: Page, n: number) {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('ntab')
        req.onsuccess = () => {
          const tx = req.result.transaction('tasks', 'readwrite')
          for (let i = 0; i < n; i++) tx.objectStore('tasks').put({ id: `x${i}`, title: `Tarea larga ${i}`, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: i, createdAt: 1000 + i })
          tx.oncomplete = () => resolve()
        }
      }),
    n,
  )
}

test('listas largas: se pintan por tramos sin perder ninguna, y al volver atrás sigues donde estabas', async ({ page }) => {
  await openApp(page, '/today')
  await inbox(page, 150)
  await page.goto('./#/inbox')
  // Escritas por fuera de la app: hay que recargar para que las lea
  await page.reload()
  await expect(page.locator('[data-splash]')).toHaveCount(0)
  await expect(page.locator('#main [data-task-id]').first()).toBeVisible()
  // Al abrir, solo las primeras
  expect(await page.locator('#main [data-task-id]').count()).toBeLessThan(80)
  // Bajando, llegan todas
  await expect(async () => {
    await page.locator('#main').evaluate((m) => m.scrollBy(0, 4000))
    expect(await page.locator('#main [data-task-id]').count()).toBeGreaterThanOrEqual(150)
  }).toPass({ timeout: 15_000 })
  for (const n of [0, 75, 149]) await expect(page.locator('#main').getByText(`Tarea larga ${n}`, { exact: true })).toBeAttached()

  // A media lista, a otra pantalla y atrás: vuelve a donde estaba
  await page.locator('#main').evaluate((m) => m.scrollTo({ top: 2400 }))
  await page.waitForTimeout(300)
  await page.getByRole('navigation', { name: 'Barra lateral' }).getByRole('link', { name: /Hoy/ }).first().click()
  await expect(page).toHaveURL(/#\/today$/)
  await expect.poll(() => page.locator('#main').evaluate((m) => m.scrollTop)).toBe(0)
  await page.goBack()
  await expect(page).toHaveURL(/#\/inbox$/)
  await expect.poll(() => page.locator('#main').evaluate((m) => Math.round(m.scrollTop / 100))).toBe(24)
  // Ir de nuevo (no atrás) la abre arriba
  await page.getByRole('navigation', { name: 'Barra lateral' }).getByRole('link', { name: /Hoy/ }).first().click()
  await page.getByRole('navigation', { name: 'Barra lateral' }).getByRole('link', { name: /Bandeja/ }).first().click()
  await expect.poll(() => page.locator('#main').evaluate((m) => m.scrollTop)).toBe(0)
})
