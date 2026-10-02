import type { Locator, Page } from '@playwright/test'
import { expect, openApp, quickAdd, test } from './fixtures'

const SHOTS = process.env.SHOTS

/** El diálogo cabe entero en la pantalla (lo que no cabe se desplaza dentro) */
async function fitsOnScreen(page: Page, dialog: Locator) {
  const viewport = page.viewportSize()!
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!
      return box.y >= 0 && box.y + box.height <= viewport.height
    })
    .toBe(true)
}

// Una tablet en horizontal: más estrecha que el inspector lateral (1280 px) y baja
test.describe('tablet en horizontal', () => {
  test.use({ viewport: { width: 1024, height: 700 } })

  test('el detalle de una tarea cabe y se llega hasta abajo', async ({ page }) => {
    await openApp(page, '/inbox')
    await quickAdd(page, 'Revisar el contrato')
    await page.locator('#main [data-task-id]', { hasText: 'Revisar el contrato' }).click({ position: { x: 120, y: 10 } })
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('textarea').first()).toHaveValue('Revisar el contrato')
    await fitsOnScreen(page, dialog)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tarea.png` })
    const remove = dialog.getByRole('button', { name: 'Eliminar', exact: true })
    await remove.scrollIntoViewIfNeeded()
    await expect(remove).toBeInViewport()
  })

})

// Un móvil en horizontal ya no es «móvil» (más de 640 px) y, con las barras del
// navegador, apenas tiene alto
test.describe('móvil en horizontal', () => {
  test.use({ viewport: { width: 667, height: 330 } })

  test('un formulario largo deja a la vista la cabecera y el botón de guardar', async ({ page }) => {
    await openApp(page, '/goals')
    await page.getByRole('button', { name: 'Nuevo' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Con una cifra' }).click()
    await fitsOnScreen(page, dialog)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/objetivo.png` })
    await expect(dialog.getByRole('heading', { name: 'Nuevo objetivo' })).toBeInViewport()
    await expect(dialog.getByRole('button', { name: 'Cerrar' })).toBeInViewport()
    await expect(dialog.getByRole('button', { name: /^(Crear|Guardar)/ })).toBeInViewport()
  })
})
