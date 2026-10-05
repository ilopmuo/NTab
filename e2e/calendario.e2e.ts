import { expect, openApp, quickAdd, test } from './fixtures'
import type { Locator, Page } from '@playwright/test'

/** Día de hoy y los de su semana (de lunes a domingo), en el navegador */
const week = (page: Page) =>
  page.evaluate(() => {
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const now = new Date()
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
    const days = Array.from({ length: 7 }, (_, i) => ymd(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)))
    return { today: ymd(now), days }
  })

const toast = (page: Page, text: string | RegExp) => page.locator('span').filter({ hasText: text }).first()

/** Arrastra con el ratón, en varios pasos (como una persona) */
async function drag(page: Page, from: Locator, to: { x: number; y: number }) {
  const b = (await from.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(8, b.height / 2))
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 6, b.y + 14, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
}

/** La y de una hora en la rejilla: la de su etiqueta */
async function hourY(page: Page, hour: string) {
  const b = (await page.locator('#main span', { hasText: new RegExp(`^${hour}$`) }).first().boundingBox())!
  return b.y + b.height / 2
}

test('vista Día: hora a hora y tocar un hueco crea una tarea a esa hora', async ({ page }) => {
  await openApp(page, '/calendar')
  // Desde el mes, «Hora a hora» abre ese día
  await page.locator('header').getByRole('button', { name: 'Mes', exact: true }).click()
  await page.getByRole('button', { name: 'Hora a hora' }).click()
  await expect(page.locator('header').getByRole('button', { name: 'Día', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Hora a hora' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Sin hora/ })).toBeVisible()

  // Mañana, a las 10 (sin la hora de ahora por medio)
  await page.locator('header').getByRole('button', { name: 'Siguiente' }).click()
  const slots = page.getByTitle('Toca un hueco para añadir una tarea a esa hora')
  const box = (await slots.boundingBox())!
  await page.mouse.click(box.x + 40, (await hourY(page, '10:00')) + 10)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Mañana a las 10:00')
  await dialog.locator('input, textarea').first().fill('Llamar a Ana')
  await dialog.locator('input, textarea').first().press('Enter')
  await page.keyboard.press('Escape')
  await expect(slots.getByRole('button', { name: /Llamar a Ana/ })).toBeVisible()
})

test('semana por horas: una tarea sin hora a un hueco, luego a otro día y deshacer', async ({ page }) => {
  await openApp(page, '/calendar')
  await quickAdd(page, 'Revisar el contrato hoy')
  await page.locator('header').getByRole('button', { name: 'Semana', exact: true }).click()
  const { today, days } = await week(page)
  const col = (d: string) => page.locator(`[data-day="${d}"]`)
  await expect(col(today)).toBeVisible()

  // De «sin hora» a las 11 de hoy (timeboxing)
  const chip = page.locator('#main button', { hasText: 'Revisar el contrato' })
  const todayBox = (await col(today).boundingBox())!
  await drag(page, chip, { x: todayBox.x + todayBox.width / 2, y: (await hourY(page, '11:00')) + 12 })
  await expect(toast(page, 'Revisar el contrato → 11:00')).toBeVisible()
  const block = (d: string) => col(d).getByRole('button', { name: /Revisar el contrato/ })
  await expect(block(today)).toContainText('11:00–11:30')

  // A otro día de la semana, a la misma hora
  const other = days[days.indexOf(today) === 6 ? 5 : days.indexOf(today) + 1]
  const otherBox = (await col(other).boundingBox())!
  const b = (await block(today).boundingBox())!
  await drag(page, block(today), { x: otherBox.x + otherBox.width / 2, y: b.y + 8 })
  await expect(toast(page, /Revisar el contrato → .+ 11:00/)).toBeVisible()
  await expect(block(other)).toContainText('11:00–11:30')
  await expect(block(today)).toHaveCount(0)

  // Deshacer
  // (el aviso anterior se desvanece a la vez)
  await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(block(today)).toContainText('11:00–11:30')

  // Con el teclado: ↓ un cuarto de hora más tarde; Mayús+↓, un cuarto de hora más larga
  await block(today).focus()
  await page.keyboard.press('ArrowDown')
  await expect(block(today)).toContainText('11:15–11:45')
  await block(today).focus()
  await page.keyboard.press('Shift+ArrowDown')
  await expect(block(today)).toContainText('11:15–12:00')
})

test('«Deshacer» nada más soltar: el clic es tuyo, no del arrastre', async ({ page }) => {
  await openApp(page, '/calendar')
  await quickAdd(page, 'Revisar el contrato hoy a las 11')
  await page.locator('header').getByRole('button', { name: 'Semana', exact: true }).click()
  const { today, days } = await week(page)
  const col = (d: string) => page.locator(`[data-day="${d}"]`)
  const block = (d: string) => col(d).getByRole('button', { name: /Revisar el contrato/ })
  await expect(block(today)).toContainText('11:00')
  await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(0, { timeout: 8000 })
  const other = days[days.indexOf(today) === 6 ? 5 : days.indexOf(today) + 1]
  const otherBox = (await col(other).boundingBox())!
  const b = (await block(today).boundingBox())!
  await drag(page, block(today), { x: otherBox.x + otherBox.width / 2, y: b.y + 8 })
  // En cuanto aparece (antes, el clic de justo después de soltar se perdía)
  const undo = page.getByRole('button', { name: 'Deshacer' })
  await undo.waitFor()
  await undo.click()
  await expect(block(today)).toContainText('11:00', { timeout: 3000 })
})
