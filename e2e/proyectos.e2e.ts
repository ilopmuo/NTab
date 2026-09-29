import { expect, openApp, test } from './fixtures'

test('secciones de un proyecto: crear, añadir, mover y ver «Proyecto › Sección»', async ({ page }) => {
  await openApp(page, '/projects')
  await page.getByRole('button', { name: 'Nuevo' }).click()
  await page.getByPlaceholder('Nombre del proyecto').fill('Web nueva')
  await page.getByRole('button', { name: 'Crear proyecto' }).click()
  await expect(page.locator('#main h1')).toHaveText('Web nueva')

  await page.getByRole('button', { name: 'Dividir en secciones' }).click()
  await page.getByLabel('Nombre de la nueva sección').fill('Diseño')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Nueva sección' }).click()
  await page.getByLabel('Nombre de la nueva sección').fill('Lanzamiento')
  await page.keyboard.press('Enter')

  // Una tarea creada dentro de «Diseño»
  const design = page.locator('section', { has: page.getByRole('button', { name: 'Diseño', exact: true }) })
  await design.getByRole('button', { name: 'Nueva tarea' }).click()
  await page.keyboard.type('Maquetas de la portada hoy')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(design.locator('[data-task-id]', { hasText: 'Maquetas de la portada' })).toBeVisible()

  // Moverla a «Lanzamiento» desde el detalle
  await page.locator('#main [data-task-id]', { hasText: 'Maquetas de la portada' }).click({ position: { x: 150, y: 10 } })
  await page.getByLabel('Sección', { exact: true }).selectOption({ label: 'Lanzamiento' })
  await page.keyboard.press('Escape')
  const launch = page.locator('section', { has: page.getByRole('button', { name: 'Lanzamiento', exact: true }) })
  await expect(launch.locator('[data-task-id]', { hasText: 'Maquetas de la portada' })).toBeVisible()

  // En Hoy se ve dónde está
  await page.evaluate(() => (location.hash = '/today'))
  await expect(page.locator('#main [data-task-id]', { hasText: 'Maquetas de la portada' })).toContainText('Web nueva›Lanzamiento')

  // Borrar la sección: la tarea se queda en el proyecto, sin sección
  await page.evaluate(() => history.back())
  page.once('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Opciones de la sección «Lanzamiento»' }).click()
  await page.getByRole('menuitem', { name: 'Borrar la sección' }).click()
  await expect(page.getByRole('button', { name: 'Lanzamiento', exact: true })).toHaveCount(0)
  await expect(page.locator('#main [data-task-id]', { hasText: 'Maquetas de la portada' })).toBeVisible()
})
