import { expect, openApp, test } from './fixtures'

test('barra lateral: ocultar una sección y pasar otra a la cuadrícula', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Personalizar la barra lateral' }).click()
  const row = (label: string) => page.getByRole('dialog').locator('li', { hasText: label }).first()
  await row('Bandeja de entrada').getByTitle('Oculta').click()
  await row('Menú').getByTitle('En la cuadrícula').click()
  await page.getByRole('button', { name: 'Listo' }).click()
  const grid = page.locator('nav .grid a')
  await expect(grid.filter({ hasText: 'Bandeja' })).toHaveCount(0)
  await expect(grid.filter({ hasText: 'Menú' })).toHaveCount(1)
  // Oculta en la barra, pero se llega igual
  await page.evaluate(() => (location.hash = '/inbox'))
  await expect(page.locator('#main h1')).toHaveText('Bandeja de entrada')
})

test.describe('en el móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('elegir las pestañas de la barra inferior', async ({ page }) => {
    await openApp(page, '/settings')
    await page.getByText('Pestañas del móvil').click()
    await page.getByLabel('Pestaña 2').selectOption('shopping')
    await page.getByRole('button', { name: 'Listo' }).click()
    const tabs = page.locator('nav.glass-thick a')
    await expect(tabs).toHaveCount(4)
    await expect(tabs.nth(1)).toHaveAttribute('href', /#\/shopping$/)
  })
})
