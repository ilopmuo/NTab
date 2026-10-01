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

test('barra lateral plegable: botón, ⌘\\ y se recuerda', async ({ page }) => {
  await openApp(page)
  const nav = page.getByRole('navigation', { name: 'Barra lateral' })
  await page.getByRole('button', { name: 'Ocultar la barra lateral' }).click()
  await expect(page.getByRole('button', { name: 'Mostrar la barra lateral' })).toBeVisible()
  await expect(nav).not.toBeInViewport()
  // El contenido ocupa todo el ancho
  await expect.poll(() => page.locator('#main').evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('0px')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mostrar la barra lateral' })).toBeVisible()
  await page.keyboard.press('Control+Backslash')
  await expect(nav).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Mostrar la barra lateral' })).toHaveCount(0)
})

test.describe('en el móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('elegir las pestañas de la barra inferior', async ({ page }) => {
    await openApp(page, '/settings')
    await page.getByText('Pestañas del móvil').click()
    await page.getByLabel('Pestaña 2').selectOption('shopping')
    await page.getByRole('button', { name: 'Listo' }).click()
    // Las cuatro pestañas y «Más»
    const tabs = page.locator('nav.glass-thick a:not([href$="/more"])')
    await expect(tabs).toHaveCount(4)
    await expect(page.locator('nav.glass-thick a[href$="/more"]')).toHaveCount(1)
    await expect(tabs.nth(1)).toHaveAttribute('href', /#\/shopping$/)
  })
})

test('funciones: apagar Menú lo quita de la barra lateral, ⌘K y su página; encenderla lo devuelve', async ({ page }) => {
  await openApp(page, '/today')
  const nav = page.getByRole('navigation', { name: 'Barra lateral' })
  await expect(nav.getByRole('link', { name: 'Menú' })).toBeVisible()
  // Desde el aviso de Hoy
  await page.getByRole('button', { name: 'Elegir funciones' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('switch', { name: 'Menú' }).click()
  await expect(sheet.getByRole('switch', { name: 'Menú' })).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Escape')
  await expect(nav.getByRole('link', { name: 'Menú' })).toHaveCount(0)
  // El aviso de Hoy ya no vuelve
  await expect(page.getByRole('region', { name: 'Haz NTab a tu medida' })).toHaveCount(0)

  await page.keyboard.press('Control+k')
  await page.locator('[cmdk-input]').fill('menú')
  await expect(page.locator('[cmdk-item]', { hasText: /^Menú$/ })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Un enlace antiguo: la página lo explica y deja encenderla
  await page.evaluate(() => (location.hash = '/menu'))
  await expect(page.getByText('Menú está apagada')).toBeVisible()
  await page.getByRole('button', { name: 'Encender Menú' }).click()
  await expect(page.locator('#main h1').first()).toHaveText('Menú')
  await expect(nav.getByRole('link', { name: 'Menú' })).toBeVisible()
})

test('grupos plegables y fijados en la barra lateral', async ({ page }) => {
  await openApp(page, '/today')
  const nav = page.getByRole('navigation', { name: 'Barra lateral' })
  const casa = nav.getByRole('button', { name: 'Casa' })
  await expect(casa).toHaveAttribute('aria-expanded', 'true')
  await casa.click()
  await expect(casa).toHaveAttribute('aria-expanded', 'false')
  await expect(nav.getByRole('link', { name: 'Compra' })).toHaveCount(0)
  // Plegado se recuerda; si estás dentro, se ve tu sección
  await page.reload()
  await expect(nav.getByRole('button', { name: 'Casa' })).toHaveAttribute('aria-expanded', 'false')
  await page.evaluate(() => (location.hash = '/shopping'))
  await expect(nav.getByRole('link', { name: 'Compra' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Menú' })).toHaveCount(0)

  // Fijar un área
  await nav.getByRole('link', { name: 'Salud' }).click()
  await page.getByRole('button', { name: 'Fijar en la barra lateral' }).click()
  const fijados = nav.getByRole('region', { name: 'Fijados' })
  await expect(fijados.getByRole('link', { name: 'Salud' })).toBeVisible()
  await page.getByRole('button', { name: 'Quitar de Fijados' }).click()
  await expect(nav.getByRole('region', { name: 'Fijados' })).toHaveCount(0)
})
