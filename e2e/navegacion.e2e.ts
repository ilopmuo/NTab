import { expect, openApp, test } from './fixtures'

test('barra lateral: una lista clara, los filtros al final y ocultar un lugar lo deja en «N más»', async ({ page }) => {
  await openApp(page)
  // Un filtro guardado (como si viniera de otro dispositivo)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('ntab')
        req.onsuccess = () => {
          const tx = req.result.transaction('settings', 'readwrite')
          tx.objectStore('settings').put({ key: 'smartLists', value: [{ id: 'alta', name: 'Prioridad alta', minPriority: 3 }] })
          tx.oncomplete = () => (req.result.close(), resolve())
        }
      }),
  )
  await page.reload()
  const nav = page.getByRole('navigation', { name: 'Barra lateral' })
  // Sin cuadrícula: los lugares en una lista, en su orden, y lo de Hoy con su número
  await expect(nav.locator('.grid a')).toHaveCount(0)
  const places = nav.locator('[data-nav-places] a')
  await expect(places).toHaveCount(10)
  await expect(places.first()).toHaveAccessibleName(/^Hoy( \d+)?$/)
  // Mis filtros, después de los lugares y de tus áreas
  const sections = await nav.locator('section').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  expect(sections.indexOf('Mis filtros')).toBeGreaterThan(sections.indexOf('Mis áreas'))
  await nav.getByRole('link', { name: /^Prioridad alta/ }).click()
  await expect(page.locator('#main h1')).toHaveText('Prioridad alta')

  // Ocultar la Bandeja: sale de la lista y queda plegada al pie, y se llega igual
  await nav.getByRole('button', { name: 'Personalizar la barra lateral' }).click()
  await page.getByRole('dialog').getByRole('switch', { name: 'Mostrar Bandeja de entrada' }).click()
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(places).toHaveCount(9)
  await nav.getByRole('button', { name: 'Ver 1 más de la barra' }).click()
  await nav.getByRole('link', { name: /^Bandeja de entrada/ }).click()
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

test.describe('en la tablet', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true })

  test('barra lateral a la vista, sin pestañas del móvil y con el + a mano', async ({ page }) => {
    await openApp(page, '/today')
    await expect(page.getByRole('navigation', { name: 'Barra lateral' })).toBeInViewport()
    await expect(page.locator('[data-mobile-bar]')).toBeHidden()
    await page.locator('[data-tablet-add]').tap()
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Nueva tarea' })).toBeFocused()
  })
})

test.describe('en el móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('elegir las pestañas de la barra inferior', async ({ page }) => {
    await openApp(page, '/settings/funciones')
    await page.getByRole('button', { name: /^Pestañas del móvil/ }).click()
    await page.getByLabel('Pestaña 2').selectOption('home')
    await page.getByRole('button', { name: 'Listo' }).click()
    // Las cuatro pestañas y «Más»
    const tabs = page.locator('nav.glass-thick a:not([href$="/more"])')
    await expect(tabs).toHaveCount(4)
    await expect(page.locator('nav.glass-thick a[href$="/more"]')).toHaveCount(1)
    // Casa abre en sus tareas
    await expect(tabs.nth(1)).toHaveAttribute('href', /#\/house$/)
  })
})

test('funciones: apagar Menú lo quita de las pestañas de Casa, ⌘K y su página; sin Gastos ni Pagos no hay Dinero', async ({ page }) => {
  await openApp(page, '/today')
  const nav = page.getByRole('navigation', { name: 'Barra lateral' })
  const casa = page.getByRole('navigation', { name: 'Casa' })
  await page.evaluate(() => (location.hash = '/shopping'))
  await expect(casa.getByRole('link', { name: 'Menú' })).toBeVisible()
  await page.evaluate(() => (location.hash = '/today'))
  // Desde el aviso de Hoy
  await page.getByRole('button', { name: 'Elegir funciones' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('switch', { name: 'Menú' }).click()
  await expect(sheet.getByRole('switch', { name: 'Menú' })).toHaveAttribute('aria-checked', 'false')
  await sheet.getByRole('switch', { name: 'Gastos' }).click()
  await sheet.getByRole('switch', { name: 'Pagos' }).click()
  await page.keyboard.press('Escape')
  await expect(nav.getByRole('link', { name: 'Dinero' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Casa' })).toBeVisible()
  await page.evaluate(() => (location.hash = '/shopping'))
  await expect(casa.getByRole('link', { name: 'Cosas' })).toBeVisible()
  await expect(casa.getByRole('link', { name: 'Menú' })).toHaveCount(0)
  // El aviso de Hoy ya no vuelve
  await page.evaluate(() => (location.hash = '/today'))
  await expect(page.getByRole('region', { name: 'Haz LUNO a tu medida' })).toHaveCount(0)

  await page.keyboard.press('Control+k')
  await page.locator('[cmdk-input]').fill('menú')
  await expect(page.locator('[cmdk-item]', { hasText: /^Menú$/ })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Un enlace antiguo: la página lo explica y deja encenderla
  await page.evaluate(() => (location.hash = '/menu'))
  await expect(page.getByText('Menú está apagada')).toBeVisible()
  await page.getByRole('button', { name: 'Encender Menú' }).click()
  await expect(page.locator('#main h1').first()).toHaveText('Menú')
  await expect(casa.getByRole('link', { name: 'Menú' })).toHaveAttribute('aria-current', 'page')
})

test('espacios: pestañas arriba, se recuerda la última y fijados en la barra lateral', async ({ page }) => {
  await openApp(page, '/today')
  const nav = page.getByRole('navigation', { name: 'Barra lateral' })
  // Tareas de casa, Compra, Menú y Cosas no van sueltas: están dentro de Casa
  await expect(nav.getByRole('link', { name: 'Compra' })).toHaveCount(0)
  await nav.getByRole('link', { name: 'Casa' }).click()
  await expect(page.locator('#main h1')).toHaveText('Tareas de casa')
  const casa = page.getByRole('navigation', { name: 'Casa' })
  await expect(casa.getByRole('link', { name: 'Tareas' })).toHaveAttribute('aria-current', 'page')
  await casa.getByRole('link', { name: 'Menú' }).click()
  await expect(page.locator('#main h1')).toHaveText('Menú')
  await expect(nav.getByRole('link', { name: 'Casa' })).toHaveAttribute('aria-current', 'page')
  // Al volver a Casa se abre lo último que viste
  await nav.getByRole('link', { name: 'Hoy' }).first().click()
  await nav.getByRole('link', { name: 'Casa' }).click()
  await expect(page.locator('#main h1')).toHaveText('Menú')

  // Fijar un área
  await nav.getByRole('link', { name: 'Salud' }).click()
  await page.getByRole('button', { name: 'Fijar en la barra lateral' }).click()
  const fijados = nav.getByRole('region', { name: 'Fijados' })
  await expect(fijados.getByRole('link', { name: 'Salud' })).toBeVisible()
  await page.getByRole('button', { name: 'Quitar de Fijados' }).click()
  await expect(nav.getByRole('region', { name: 'Fijados' })).toHaveCount(0)
})
