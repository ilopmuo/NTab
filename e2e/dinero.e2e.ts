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

test('resumen del dinero: ingresos, lo que queda, traer movimientos del banco y la tabla del año', async ({ page }) => {
  await openApp(page, '/money')
  await expect(page.locator('#main h1')).toHaveText('Dinero')
  const tabs = page.getByRole('navigation', { name: 'Dinero' })
  await expect(tabs.getByRole('link')).toHaveText(['Resumen', 'Gastos', 'Fijos', 'Cuentas'])

  const input = page.getByLabel('Apuntar ingreso')
  await input.fill('1.850 nómina')
  await expect(page.locator('#main')).toContainText('Nómina')
  await input.press('Enter')
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toContain('+1850 €')
  await expect(page.getByText('Ahorras el 100 % de lo que entra')).toBeVisible()

  // Movimientos pegados de Excel: un gasto, un traspaso (no se trae) y otro ingreso
  const day = await dayFromNow(page, 0)
  const [y, m, d] = day.split('-')
  await page.getByRole('button', { name: 'Traer movimientos del banco' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Movimientos pegados').fill(
    [`${d}/${m}/${y}\tCOMPRA TARJ. 5540XXXXXXXX1234 MERCADONA\t-45,30`, `${d}/${m}/${y}\tTRASPASO A CUENTA DE AHORRO\t-200,00`, `${d}/${m}/${y}\tWALLAPOP BICI\t80,00`].join('\n'),
  )
  await dialog.getByRole('button', { name: 'Ver los movimientos' }).click()
  await expect(dialog).toContainText('Mercadona')
  await expect(dialog).toContainText('1 traspaso entre tus cuentas')
  await dialog.getByRole('button', { name: 'Traer 2 movimientos' }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toContain('+80 €')
  // 1930 entran, 45,30 salen
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toContain('+1885 €')
  await expect(page.getByRole('heading', { name: '50/30/20' })).toBeVisible()
  await expect(page.getByRole('region', { name: /Ingresos y gastos de \d{4}, mes a mes/ })).toContainText('Supermercado')

  // El gasto traído está en Gastos, con su categoría
  await tabs.getByRole('link', { name: 'Gastos' }).click()
  await expect(page.locator('#main')).toContainText('Mercadona')
  await expect(page.locator('#main')).toContainText('Supermercado')

  // La captura rápida entiende los ingresos
  await page.keyboard.press('n')
  await page.getByRole('dialog').locator('input, textarea').first().fill('he cobrado 200 de una factura')
  await expect(page.getByRole('dialog')).toContainText('Ingreso: +200 € · Factura')
})

test('cuentas y patrimonio: patrimonio neto, saldos de hoy y plan para salir de deudas', async ({ page }) => {
  await openApp(page, '/accounts')
  const add = async (kind: string, name: string, balance: string, debt?: { rate: string; payment: string }) => {
    await page.getByRole('button', { name: /^(Nueva|Añadir la primera)$/ }).first().click()
    const d = page.getByRole('dialog')
    await d.getByLabel('Qué es').selectOption({ label: kind })
    await d.getByLabel('Nombre').fill(name)
    await d.getByLabel(/^Lo que (hay|debes) ahora/).fill(balance)
    if (debt) {
      await d.getByLabel('Interés anual (TIN %)').fill(debt.rate)
      await d.getByLabel('Cuota al mes (€)').fill(debt.payment)
    }
    await d.getByRole('button', { name: 'Añadir' }).click()
    await expect(d).toHaveCount(0)
  }
  await add('Cuenta corriente', 'BBVA', '3000')
  await add('Inversiones (fondos, acciones…)', 'Indexa', '10000')
  await add('Préstamo', 'Coche', '6000', { rate: '6', payment: '250' })
  await add('Tarjeta de crédito', 'Visa', '900', { rate: '20', payment: '50' })
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toMatch(/Patrimonio neto\s+6100 €/)

  // Bola de nieve: primero la más pequeña
  await expect(page.getByRole('heading', { name: 'Salir de deudas' })).toBeVisible()
  const plan = page.locator('section', { has: page.getByRole('heading', { name: 'Salir de deudas' }) })
  await expect(plan.locator('ol li').first()).toContainText('Visa')
  await expect(plan).toContainText('Sin deudas en')
  await plan.getByRole('button', { name: 'Avalancha' }).click()
  await expect(plan.locator('ol li').first()).toContainText('Visa')

  // Saldos de hoy de todas a la vez
  await page.getByRole('button', { name: 'Saldos de hoy' }).click()
  await page.getByLabel('Saldo de BBVA (€)').fill('3500')
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click()
  await expect.poll(async () => nbsp(await page.locator('#main').innerText())).toMatch(/Patrimonio neto\s+6600 €/)
  await expect(page.getByRole('heading', { name: 'Independencia financiera' })).toBeVisible()
})

test('gastos sin clasificar: se pregunta, se responde en un toque y se aprende', async ({ page }) => {
  await openApp(page, '/expenses')
  const input = page.getByLabel('Apuntar gasto')
  await input.fill('23,40 amzn mktp')
  // LUNO no sabe de qué es: deja elegir aquí, o guardarlo y preguntar luego
  await expect(page.getByRole('group', { name: '¿De qué es?' })).toBeVisible()
  await input.press('Enter')
  const ask = page.getByRole('group', { name: '¿De qué es «Amzn mktp»?' })
  await expect(ask).toBeVisible()
  await expect(page.locator('#main')).toContainText('Sin clasificar')

  // También en Hoy
  await input.fill('5 tpv 3321')
  await input.press('Enter')
  await page.goto('./#/today')
  await expect(page.getByRole('heading', { name: '¿De qué son estos gastos?' })).toBeVisible()

  // Responder en un toque: se aprende para la próxima
  await page.goto('./#/expenses')
  await ask.getByRole('button', { name: 'Otra…' }).click()
  await ask.getByRole('button', { name: 'Ocio' }).click()
  await expect(page.locator('span').filter({ hasText: 'Amzn mktp: Ocio. Los próximos irán ahí' })).toBeVisible()
  await expect(ask).toHaveCount(0)
  await input.fill('9 amzn mktp')
  await expect(page.getByRole('group', { name: '¿De qué es?' })).toHaveCount(0)
  await expect(page.locator('#main').getByRole('button', { name: 'Ocio', exact: true }).first()).toBeVisible()
})

test('análisis de gastos: consejos con su botón (límite y reto) y una categoría a fondo', async ({ page }) => {
  await openApp(page, '/expenses')
  await page.evaluate(async () => {
    const req = indexedDB.open('ntab')
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)))
    const tx = db.transaction(['expenses'], 'readwrite')
    const now = new Date()
    const at = (m: number, day: number) => {
      const x = new Date(now.getFullYear(), now.getMonth() - m, day)
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    }
    let i = 0
    const ex = (date: string, amount: number, category: string, note: string) => tx.objectStore('expenses').put({ id: `e${i++}`, amount, note, category, date, createdAt: 1 })
    for (const m of [1, 2, 3]) {
      ex(at(m, 3), 250, 'super', 'Mercadona')
      ex(at(m, 20), 90, 'ocio', 'Concierto')
      ex(at(m, 25), 80, 'ropa', 'Zara')
    }
    // Glovo cada pocos días en los últimos 30
    for (let d = 1; d <= 28; d += 5) {
      const x = new Date(now)
      x.setDate(x.getDate() - d)
      ex(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`, 18, 'comer', 'Glovo')
    }
    await new Promise((r) => (tx.oncomplete = r))
  })
  await page.reload()
  await page.goto('./#/insights')
  await expect(page.locator('#main h1')).toHaveText('Análisis de gastos')
  await expect(page.locator('#main')).toContainText('Ponle un límite a ropa')
  await page.getByRole('button', { name: 'Poner límite de 70 €' }).click()
  await expect(page.locator('span').filter({ hasText: /Límite de ropa: 70/ })).toBeVisible()
  await expect(page.locator('#main')).not.toContainText('Ponle un límite a ropa')

  await expect(page.locator('#main')).toContainText('Glovo: 6 veces en un mes')
  await page.getByRole('button', { name: 'Empezar el reto' }).first().click()
  await expect(page.locator('span').filter({ hasText: /Reto empezado: Sin glovo/ })).toBeVisible()

  // Descartar un consejo
  const tip = page.getByRole('button', { name: /^No me interesa: Glovo/ })
  await tip.click()
  await expect(tip).toHaveCount(0)

  // Una categoría a fondo
  await page.locator('#main button', { hasText: 'Supermercado' }).first().click()
  await expect(page.locator('#main h1')).toHaveText('Supermercado')
  await expect(page.locator('#main')).toContainText('En qué se va')
  await expect(page.locator('#main')).toContainText('Mercadona')

  // El reto está en Hábitos → Última vez
  await page.goto('./#/trackers')
  await expect(page.locator('#main')).toContainText('Sin glovo')
})
