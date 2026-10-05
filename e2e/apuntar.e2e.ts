import { expect, openApp, quickAdd, test } from './fixtures'
import type { Page } from '@playwright/test'

const toast = (page: Page, text: string | RegExp) => page.locator('span').filter({ hasText: text }).first()

/** Abre la captura y escribe, sin guardar */
async function type(page: Page, text: string) {
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('n')
  await page.getByRole('dialog').getByRole('combobox', { name: 'Nueva tarea' }).fill(text)
}

test('la captura entiende lo mismo que Siri: a la compra, a gastos, a notas y a tus cosas, viendo antes a dónde va', async ({ page }) => {
  await openApp(page, '/today')
  const plan = page.locator('[data-capture-plan]')

  // A la compra, sin dos puntos; y se deshace
  await type(page, 'Compra leche y pan')
  await expect(plan).toHaveText('A la compra: Leche y Pan')
  await page.keyboard.press('Enter')
  await expect(toast(page, 'A la compra: Leche y Pan')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await type(page, 'Añade huevos a la lista de la compra')
  await expect(plan).toHaveText('A la compra: Huevos')
  await page.keyboard.press('Enter')
  await page.evaluate(() => (location.hash = '/shopping'))
  await expect(page.locator('#main')).toContainText('Huevos')
  await expect(page.locator('#main')).not.toContainText('Leche')
  // Y se tacha
  await type(page, 'Quita los huevos de la compra')
  await expect(plan).toHaveText('Tachar de la compra: Huevos')
  await page.keyboard.press('Enter')
  await expect(toast(page, 'Tachado: Huevos')).toBeVisible()

  // A gastos, con su categoría
  await type(page, 'Gasto 12,50 comida con Ana')
  await expect(plan).toContainText('Gasto: 12,50 € · Comida con Ana')
  await page.keyboard.press('Enter')
  await page.evaluate(() => (location.hash = '/expenses'))
  await expect(page.locator('#main')).toContainText('Comida con Ana')

  // A notas, con el texto tal cual
  await type(page, 'Nota: el código del portal es 4512.')
  await expect(plan).toHaveText('Nota nueva: El código del portal es 4512')
  await page.keyboard.press('Enter')
  await page.evaluate(() => (location.hash = '/notes'))
  await expect(page.locator('#main')).toContainText('El código del portal es 4512')

  // Dónde está algo
  await type(page, 'He dejado las llaves en el cajón de la entrada')
  await expect(plan).toHaveText('Cosas: Llaves, en el cajón de la entrada')
  await page.keyboard.press('Enter')
  await page.evaluate(() => (location.hash = '/things'))
  await expect(page.locator('#main')).toContainText('Llaves')

  // Lo demás, una tarea como siempre (con sus chips de fecha)
  await type(page, 'Llamar a mamá mañana a las 7')
  await expect(plan).toHaveCount(0)
  await expect(page.getByRole('dialog')).toContainText('Mañana')
})

test('«hecho: …» en la captura completa la tarea que encaja (y se deshace)', async ({ page }) => {
  await openApp(page, '/today')
  await quickAdd(page, 'Llamar al dentista hoy')
  // La casilla sin marcar de la tarea, en Hoy
  const pending = page.locator('#main [data-task-id]', { hasText: 'Llamar al dentista' }).getByRole('checkbox', { checked: false })
  await expect(pending).toBeVisible()
  await type(page, 'hecho: llamar al dentista')
  await expect(page.locator('[data-capture-plan]')).toHaveText('Hecha: Llamar al dentista')
  await page.keyboard.press('Enter')
  await expect(toast(page, 'Hecha: Llamar al dentista')).toBeVisible()
  await expect(pending).toHaveCount(0)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(pending).toBeVisible()
})
