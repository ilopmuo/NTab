import { devices } from '@playwright/test'
import { expect, openApp, test } from './fixtures'

const iphone = devices['iPhone 13']

test.describe('en el iPhone', () => {
  test.use({ viewport: iphone.viewport, userAgent: iphone.userAgent, hasTouch: true, isMobile: true })

  test('crear sin tropiezos: sin zoom al tocar un campo, el teclado en el primer toque y la barra se aparta al escribir', async ({ page }) => {
    await openApp(page, '/today')
    // Tocar un campo de menos de 16 px no acerca la página
    await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /maximum-scale=1/)
    // El + abre la captura con el cursor ya en el campo
    await page.getByRole('button', { name: 'Nueva tarea' }).last().tap()
    const input = page.getByRole('dialog').getByRole('combobox', { name: 'Nueva tarea' })
    await expect(input).toBeFocused()
    // Con el teclado ocupando la mitad de abajo (lo visible: 420 px), la hoja queda encima, entera
    await page.evaluate(() => document.documentElement.style.setProperty('--vv-height', '420px'))
    await expect.poll(async () => (await page.getByRole('dialog').boundingBox())!.y + (await page.getByRole('dialog').boundingBox())!.height).toBeLessThanOrEqual(421)
    await page.evaluate(() => document.documentElement.style.setProperty('--vv-height', `${innerHeight}px`))
    await page.keyboard.type('Comprar sellos mañana')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // Con el teclado abierto (lo que se ve encoge), la barra de pestañas se aparta
    await page.evaluate(() => document.documentElement.setAttribute('data-keyboard', 'open'))
    await expect(page.locator('[data-mobile-bar]')).toHaveCSS('opacity', '0')
    await page.evaluate(() => document.documentElement.removeAttribute('data-keyboard'))

    // Los formularios de crear también empiezan con el cursor puesto
    await page.evaluate(() => (location.hash = '/habits'))
    await page.getByRole('button', { name: /Nuevo/ }).first().tap()
    await expect(page.getByRole('dialog').locator('input').first()).toBeFocused()
  })

  test('«Más» como la barra lateral: buscar, lugares en lista con lo pendiente y tus filtros', async ({ page }) => {
    await openApp(page, '/more')
    await expect(page.getByRole('button', { name: 'Buscar en LUNO' })).toBeVisible()
    const places = page.getByRole('region', { name: 'Lugares' })
    // Sin las cuatro pestañas (Hoy, Bandeja, Calendario, Hábitos)
    await expect(places.getByRole('link')).toHaveText(['Proyectos', 'Listas', 'Notas', 'Personas', 'Casa', 'Dinero'])
    await places.getByRole('link', { name: 'Proyectos' }).tap()
    await expect(page.locator('#main h1')).toHaveText('Proyectos')
  })
})

test('en el ordenador no se toca el zoom', async ({ page }) => {
  await openApp(page, '/today')
  await expect(page.locator('meta[name=viewport]')).not.toHaveAttribute('content', /maximum-scale/)
})
