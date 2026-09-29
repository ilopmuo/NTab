import { expect, openApp, quickAdd, test } from './fixtures'

test('etiquetas: ver, cambiar el nombre (juntando dos) y quitar con deshacer', async ({ page }) => {
  await openApp(page, '/tags')
  await expect(page.getByText('Aún no hay etiquetas')).toBeVisible()

  await quickAdd(page, 'Llamar al dentista #salud')
  await quickAdd(page, 'Pedir cita #medico')
  await quickAdd(page, 'Comprar pilas #recados')

  const row = (tag: string) => page.locator('#main a', { hasText: new RegExp(`^${tag}`) })
  await expect(row('salud')).toContainText('1 pendiente')
  await expect(row('medico')).toBeVisible()

  // «medico» → «salud»: se juntan
  await page.getByRole('button', { name: 'Opciones de #medico' }).click()
  await page.getByRole('menuitem', { name: 'Cambiar el nombre' }).click()
  await page.getByLabel('Nuevo nombre para #medico').fill('Salud')
  await page.keyboard.press('Enter')
  await expect(row('medico')).toHaveCount(0)
  await expect(row('salud')).toContainText('2 pendientes')

  // La vista de la etiqueta tiene las dos tareas
  await row('salud').click()
  await expect(page.locator('#main h1')).toHaveText('salud')
  await expect(page.locator('#main [data-task-id]')).toHaveCount(2)

  // Quitarla desde su vista: vuelve a la lista, y «Deshacer» la recupera
  page.once('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Opciones de #salud' }).click()
  await page.getByRole('menuitem', { name: 'Quitar la etiqueta' }).click()
  await expect(page.locator('#main h1')).toHaveText('Etiquetas')
  await expect(row('salud')).toHaveCount(0)
  // (el aviso anterior puede estar aún desapareciendo)
  await page.getByRole('button', { name: 'Deshacer' }).last().click()
  await expect(row('salud')).toContainText('2 pendientes')
})
