import { expect, openApp, test } from './fixtures'
import type { Page } from '@playwright/test'

/** Hoy + n días, en la zona horaria del navegador */
const dayFromNow = (page: Page, n: number) =>
  page.evaluate((n) => {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, n)

const nbsp = (s: string) => s.replace(/ /g, ' ')

test('gastos: límites por categoría, frecuentes, categoría aprendida, etiquetas y búsqueda', async ({ page }) => {
  await openApp(page, '/expenses')
  const input = page.getByLabel('Apuntar gasto')
  for (const t of ['12 café', '12 café']) {
    await input.fill(t)
    await input.press('Enter')
  }
  // Lo de siempre, en un toque
  await page.getByRole('button', { name: /^Apuntar Café, 12/ }).click()
  await expect(page.locator('#main')).toContainText('Llevas gastado este mes')
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toContain('36 €')

  // Límite de Comer fuera y aviso al pasarse
  await page.getByRole('button', { name: 'Poner límites' }).click()
  await page.getByLabel('Límite de Comer fuera (€)').fill('40')
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('meter', { name: /^Comer fuera: 36 € de 40 €/ })).toBeVisible()
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toContain('Quedan 4 €')
  await input.fill('10 cena')
  await input.press('Enter')
  await expect(page.locator('span').filter({ hasText: /Te has pasado en comer fuera/ })).toBeVisible()

  // Cambiar la categoría una vez y la próxima ya va bien (como Copilot)
  await input.fill('20 bizum ana')
  await input.press('Enter')
  await page.locator('#main button', { hasText: 'Bizum ana' }).first().click()
  await page.getByRole('dialog').getByLabel('Categoría').selectOption({ label: 'Regalos' })
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  await expect(page.locator('span').filter({ hasText: 'Los próximos «Bizum ana» irán a Regalos' })).toBeVisible()
  await input.fill('15 bizum ana')
  await expect(page.locator('#main').getByText('Regalos', { exact: true }).first()).toBeVisible()
  await input.fill('')

  // #etiquetas y su total
  await input.fill('30 museo #roma')
  await input.press('Enter')
  await page.getByRole('button', { name: /^#roma/ }).click()
  await expect(page.getByLabel('Buscar en tus gastos')).toHaveValue('#roma')
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toMatch(/1 gasto\s+En total 30 €/)
  await page.getByLabel('Buscar en tus gastos').fill('café')
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toMatch(/3 gastos\s+En total 36 €/)
  await page.locator('header').getByRole('button', { name: 'Cerrar la búsqueda' }).click()
  await expect(page.getByLabel('Apuntar gasto')).toBeVisible()
})

test('pagos: prueba gratis, subida de precio, historial y previsión', async ({ page }) => {
  await openApp(page, '/finance')
  const add = async (name: string, amount: string, date: string, opts: { trial?: boolean; bill?: boolean; url?: string } = {}) => {
    await page.getByRole('button', { name: /^(Nuevo|Añadir el primero)$/ }).first().click()
    const d = page.getByRole('dialog')
    await d.getByPlaceholder('Ej. Netflix, alquiler, gimnasio…').fill(name)
    await d.getByLabel('Importe').fill(amount)
    if (opts.bill) await d.getByRole('button', { name: 'La pago yo' }).click()
    if (opts.trial) await d.getByRole('switch', { name: 'Es una prueba gratis' }).click()
    await d.getByLabel(opts.trial ? 'Acaba la prueba' : 'Próximo cargo').fill(date)
    if (opts.url) await d.getByLabel('Para darse de baja').fill(opts.url)
    await d.getByRole('button', { name: 'Añadir' }).click()
    await expect(d).toHaveCount(0)
  }
  await add('Disney+', '9,99', await dayFromNow(page, 5), { trial: true, url: 'https://www.disneyplus.com/account' })
  await expect(page.locator('#main')).toContainText('Prueba gratis · cobra en 5 días')
  await expect(page.getByRole('link', { name: 'Darse de baja de Disney+' })).toHaveAttribute('href', 'https://www.disneyplus.com/account')

  await add('Spotify', '10,99', await dayFromNow(page, 10))
  await page.locator('#main button', { hasText: 'Spotify' }).first().click()
  await page.getByRole('dialog').getByLabel('Importe').fill('11,99')
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toContain('Subió 1 € (+9 %)')
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toContain('Un pago ha subido este año: +12 € al año')

  await add('Luz', '50', await dayFromNow(page, 0), { bill: true })
  await page.getByRole('button', { name: 'Pagado' }).click()
  await page.locator('#main button', { hasText: 'Luz' }).first().click()
  await expect(page.getByRole('dialog')).toContainText('Pagado el')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()

  await expect(page.getByRole('heading', { name: 'Próximos 12 meses' })).toBeVisible()
  const months = page.locator('#main [aria-pressed]').filter({ has: page.locator('span') })
  await expect(months).toHaveCount(12)
})

test('huchas: un objetivo en euros dice cuánto apartar y se llena desde Gastos', async ({ page }) => {
  await openApp(page, '/goals')
  await page.getByRole('button', { name: 'Nuevo' }).click()
  const d = page.getByRole('dialog')
  await d.getByPlaceholder('Ej. Correr una media maratón').fill('Viaje a Japón')
  await d.getByRole('button', { name: 'Con una cifra' }).click()
  await d.getByLabel('Meta').fill('1200')
  await d.getByLabel('Unidad').fill('€')
  // Dentro de unos 2 meses (3 meses contando este): 400 € al mes
  const deadline = await page.evaluate(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + 2)
    d.setDate(15)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await d.getByLabel('Para cuándo').fill(deadline)
  await d.getByRole('button', { name: 'Crear objetivo' }).click()
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toContain('Aparta 400 € al mes')

  await page.goto('./#/expenses')
  await page.getByRole('button', { name: 'Meter dinero en «Viaje a Japón»' }).click()
  const amount = page.getByLabel('Cuánto metes en «Viaje a Japón»')
  await amount.fill('300')
  await amount.press('Enter')
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toContain('300 € de 1200 € · aparta 300 € al mes')
})
