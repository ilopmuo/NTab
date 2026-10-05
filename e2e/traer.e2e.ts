import { expect, openApp, test, titles } from './fixtures'
import type { Page } from '@playwright/test'

const toast = (page: Page, text: string | RegExp) => page.locator('span').filter({ hasText: text }).first()
const capture = (page: Page) => page.getByRole('combobox', { name: 'Nueva tarea' })
const paste = (page: Page, text: string) =>
  capture(page).evaluate((el, t) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', t)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, text)

test('captura: pegar una lista crea una tarea por línea; un enlace va a las notas', async ({ page }) => {
  await openApp(page, '/inbox')
  await page.keyboard.press('n')
  await paste(page, '- Llamar al dentista mañana a las 10\n- [ ] Renovar el DNI\n- [x] Ya hecha\n• Comprar sellos')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('3 tareas, una por línea')
  await expect(dialog.getByRole('list', { name: 'Tareas que se van a crear' })).toContainText('Llamar al dentistaMañana 10:00')
  await dialog.getByRole('button', { name: 'Añadir 3 tareas' }).click()
  await expect(toast(page, '3 tareas añadidas')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => titles(page)).toEqual(expect.arrayContaining(['Renovar el DNI', 'Comprar sellos']))

  // Un enlace solo: sin cuenta no se lee la página, así que la dirección legible
  await page.keyboard.press('n')
  await capture(page).fill('https://www.elpais.com/economia/la-vivienda-sube.html')
  await expect(dialog).toContainText('elpais.com· enlace en las notas')
  await capture(page).press('Enter')
  await expect(toast(page, 'Añadido «elpais.com · la vivienda sube»')).toBeVisible()
  const link = page.locator('#main a', { hasText: 'elpais.com' })
  await expect(link).toHaveAttribute('href', 'https://www.elpais.com/economia/la-vivienda-sube.html')
  await expect(link).toHaveAttribute('target', '_blank')
})

test('compartir con LUNO desde otra app: llega a la captura con su título y enlace', async ({ page }) => {
  await openApp(page, '/today')
  await page.goto(`./?title=${encodeURIComponent('Cómo hacer pan')}&text=${encodeURIComponent('Cómo hacer pan https://recetas.ejemplo.com/pan')}&url=${encodeURIComponent('https://recetas.ejemplo.com/pan')}`)
  await expect(page).toHaveURL(/#\/inbox$/)
  await expect(capture(page)).toHaveValue('Cómo hacer pan https://recetas.ejemplo.com/pan')
  await capture(page).press('Enter')
  await expect.poll(() => titles(page)).toContain('Cómo hacer pan')
  await expect(page.locator('#main a', { hasText: 'recetas.ejemplo.com' })).toHaveAttribute('href', 'https://recetas.ejemplo.com/pan')
})

test('traer de otra app: un CSV de Todoist y una lista pegada, con deshacer', async ({ page }) => {
  await openApp(page, '/settings/datos')
  await page.getByRole('button', { name: /Traer de otra app/ }).click()
  const sheet = page.getByRole('dialog')
  const csv = [
    'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE',
    'section,Diseño:,,,,,,,,',
    'task,Hacer el logo @trabajo,,1,1,,,,,',
    'task,Boceto,,4,2,,,,,',
    'task,Revisar textos,,4,1,,,,,',
  ].join('\n')
  await page.getByLabel('Archivos para traer').setInputFiles({ name: 'Web nueva.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(sheet).toContainText('Todoist: 2 tareas en «Web nueva»')
  await sheet.getByLabel('O pega una lista').fill('- Llamar al gestor\n- [x] Ya hecha')
  await expect(sheet).toContainText('Lista: 2 tareas')
  await sheet.getByRole('button', { name: 'Traer 3 tareas' }).click()
  await expect(toast(page, '3 tareas traídas')).toBeVisible()

  await page.goto('./#/projects')
  await page.locator('#main').getByText('Web nueva', { exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Diseño' })).toBeVisible()
  await expect(page.locator('#main')).toContainText('Hacer el logo')
  await expect(page.locator('#main')).toContainText('#trabajo')
  await expect(page.locator('#main')).toContainText('Revisar textos')
  await page.goto('./#/inbox')
  await expect.poll(() => titles(page)).toContain('Llamar al gestor')
})
