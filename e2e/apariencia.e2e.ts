import { expect, openApp, quickAdd, test } from './fixtures'

test('color de acento: se elige en Ajustes y se mantiene al recargar', async ({ page }) => {
  await openApp(page, '/settings/apariencia')
  const group = page.getByRole('radiogroup', { name: 'Color de acento' })
  await expect(group.getByRole('radio', { name: 'Índigo LUNO', exact: true })).toHaveAttribute('aria-checked', 'true')
  await group.getByRole('radio', { name: 'Rosa' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'pink')
  // Con las flechas, al siguiente
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'orange')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'orange')
  await expect(page.getByRole('radio', { name: 'Naranja' })).toHaveAttribute('aria-checked', 'true')
  // El botón principal usa el relleno del acento
  const fill = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-accent-fill').trim())
  expect(fill).toBe('#c2410c')
  await page.getByRole('radio', { name: 'Índigo LUNO', exact: true }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-accent', /.+/)
})

test('selector de fecha propio: atajos y calendario con teclado', async ({ page }) => {
  await openApp(page, '/inbox')
  await quickAdd(page, 'Renovar el pasaporte')
  await page.locator('#main [data-task-id]', { hasText: 'Renovar el pasaporte' }).click({ position: { x: 150, y: 10 } })
  const panel = page.locator('aside')
  await panel.getByRole('button', { name: 'Mañana', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Mañana', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await panel.getByRole('button', { name: 'Otro día' }).click()
  await panel.locator('[aria-current="date"]').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  // Hoy + 8 días, y el calendario se cierra
  const expected = await page.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() + 8)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await expect.poll(() => dueDate(page, 'Renovar el pasaporte')).toBe(expected)
  await expect(panel.locator('[aria-current="date"]')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: /^[A-ZÁÉ][a-záéíóú]+\.? \d+/ })).toHaveAttribute('aria-expanded', 'false')
})

function dueDate(page: import('@playwright/test').Page, title: string) {
  return page.evaluate(async (t) => {
    const req = indexedDB.open('ntab')
    const db = await new Promise<IDBDatabase>((r) => (req.onsuccess = () => r(req.result)))
    const all = await new Promise<{ title: string; dueDate?: string }[]>((r) => {
      const q = db.transaction('tasks').objectStore('tasks').getAll()
      q.onsuccess = () => r(q.result)
    })
    db.close()
    return all.find((x) => x.title === t)?.dueDate
  }, title)
}

for (const reduce of [false, true])
  test(`transición entre pantallas ${reduce ? 'desactivada con «Reducir movimiento»' : 'con View Transitions'}`, async ({ page }) => {
    await page.addInitScript((r) => {
      if (r) localStorage.setItem('ntab-motion', 'on')
      // Cuenta las transiciones que pide la app
      const w = window as unknown as { __vt: number }
      w.__vt = 0
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
      const orig = doc.startViewTransition?.bind(document)
      if (orig) doc.startViewTransition = (cb: () => void) => (w.__vt++, orig(cb))
    }, reduce)
    await openApp(page, '/today')
    const nav = page.getByRole('navigation', { name: 'Barra lateral' })
    await nav.getByRole('link', { name: 'Proyectos' }).click()
    await expect(page.locator('#main h1').first()).toHaveText('Proyectos')
    await expect(page).toHaveURL(/#\/projects$/)
    const count = await page.evaluate(() => (window as unknown as { __vt: number }).__vt)
    if (reduce) expect(count).toBe(0)
    else expect(count).toBeGreaterThan(0)
    // Atrás vuelve a la pantalla anterior
    await page.goBack()
    await expect(page.locator('#main h1').first()).not.toHaveText('Proyectos')
  })
