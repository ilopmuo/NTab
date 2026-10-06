import { expect, openApp, test } from './fixtures'

test('hábitos: pausa y «hoy no toca» sin romper la racha; fuerza', async ({ page }) => {
  await openApp(page, '/habits')
  await page.getByRole('button', { name: 'Meditar' }).click()
  const card = page.locator('#main .glass', { hasText: 'Meditar' }).first()
  await expect(card).toContainText('Fuerza 0 %')

  await card.getByRole('button', { name: 'Opciones de Meditar' }).click()
  await page.getByRole('menuitem', { name: 'Hoy no toca' }).click()
  await expect(card).toContainText('Hoy no toca')

  await card.getByRole('button', { name: 'Opciones de Meditar' }).click()
  await page.getByRole('menuitem', { name: /^Pausar/ }).click()
  await expect(card).toContainText('En pausa desde')
  // En pausa no sale en Hoy
  await page.evaluate(() => (location.hash = '/today'))
  await expect(page.locator('#main')).not.toContainText('Meditar')
  await page.evaluate(() => (location.hash = '/habits'))
  await card.getByRole('button', { name: 'Opciones de Meditar' }).click()
  await page.getByRole('menuitem', { name: 'Reanudar' }).click()
  await expect(card).not.toContainText('En pausa')
})

test('«Días sin…»: lo que quieres dejar, con récord y ahorro', async ({ page }) => {
  // Última vez está dentro de Hábitos
  await openApp(page, '/trackers')
  await expect(page.locator('#main h1')).toHaveText('Hábitos')
  await page.getByRole('button', { name: 'Apuntar', exact: true }).click()
  await page.getByRole('button', { name: 'Lo quiero dejar' }).click()
  await page.getByLabel('Nombre').fill('Fumar')
  await page.getByPlaceholder('Ej. 5,50 €').fill('5')
  // Hace 10 días, en la zona horaria del navegador
  const tenDaysAgo = await page.evaluate(() => {
    const d = new Date()
    d.setDate(d.getDate() - 10)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await page.getByLabel('Otra fecha').fill(tenDaysAgo)
  await page.getByRole('button', { name: 'Añadir' }).click()
  await page.getByRole('button', { name: 'Crear' }).click()
  const card = page.locator('#main .glass', { hasText: 'Fumar' }).first()
  await expect(card).toContainText('días sin fumar')
  await expect(card).toContainText('€ ahorrados')
  await expect(card).toContainText('10 días sin fumar')
  await card.getByRole('button', { name: 'He vuelto a caer' }).click()
  await expect(card).toContainText(/(^|[^\d])0 días sin fumar/)
  await expect(card).toContainText('Récord: 10 días')
  await page.getByRole('button', { name: 'Deshacer' }).last().click()
  await expect(card).toContainText('10 días sin fumar')
})

test('rutina con minutos por paso: duración, hora de fin y cuenta atrás', async ({ page }) => {
  await openApp(page, '/routines')
  await page.getByRole('button', { name: 'Nueva', exact: true }).click()
  await page.getByPlaceholder('Ej. Antes de salir de casa').fill('Mañana tranquila')
  await page.getByLabel('Nuevo paso').fill('Ducha')
  await page.getByRole('button', { name: 'Añadir paso' }).click()
  await page.getByLabel('Minutos del paso 1').fill('10')
  await page.getByLabel('Nuevo paso').fill('Desayuno')
  await page.getByRole('button', { name: 'Añadir paso' }).click()
  await page.getByLabel('Minutos del paso 2').fill('15')
  await page.getByRole('button', { name: 'Crear rutina' }).click()
  const card = page.locator('#main .glass', { hasText: 'Mañana tranquila' }).first()
  await expect(card).toContainText('25 min')

  await card.getByRole('button', { name: 'Empezar paso a paso' }).click()
  const runner = page.getByRole('dialog', { name: 'Mañana tranquila' })
  await expect(runner).toContainText('acabas a las')
  await expect(runner).toContainText(/0[89]:5\d|10:00/)
  await runner.getByRole('button', { name: 'Parar la cuenta atrás' }).click()
  await runner.getByRole('button', { name: '1 min' }).click()
  await expect(runner).toContainText(/1[01]:\d\d/)
  await runner.getByRole('button', { name: 'Hecho' }).click()
  await expect(runner).toContainText('Desayuno')
})

test('diario: año en píxeles', async ({ page }) => {
  await openApp(page, '/journal')
  await page.getByRole('radio', { name: 'Bien', exact: true }).click()
  await page.getByRole('button', { name: 'Año en píxeles' }).click()
  const year = new Date().getFullYear()
  await expect(page.getByRole('group', { name: `Ánimo de cada día de ${year}` })).toBeVisible()
  await expect(page.getByRole('group', { name: `Ánimo de cada día de ${year}` }).getByRole('button')).toHaveCount(1)
})

test('personas: fechas importantes (en Hoy) e ideas de regalo', async ({ page }) => {
  await openApp(page, '/people')
  await page.getByRole('button', { name: 'Nueva', exact: true }).click()
  await page.getByPlaceholder('Nombre').first().fill('Ana')
  await page.keyboard.press('Enter')
  // Al crearla se abre su ficha
  await expect(page.getByRole('heading', { name: 'Fechas importantes' })).toBeVisible()
  const tomorrow = new Date(Date.now() + 864e5)
  const ymd = `${tomorrow.getFullYear() - 10}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  await page.getByLabel('Qué se celebra').fill('Aniversario de boda')
  await page.getByLabel('Fecha', { exact: true }).fill(ymd)
  await page.getByRole('button', { name: 'Añadir la fecha' }).click()
  await expect(page.locator('#main')).toContainText('10 años')
  await page.getByLabel('Nueva idea de regalo').fill('Una novela')
  await page.getByRole('button', { name: 'Añadir la idea' }).click()
  await page.getByRole('checkbox', { name: 'Marcar «Una novela» como regalado' }).click()
  await expect(page.locator('#main')).toContainText('Regalado el')

  await page.evaluate(() => (location.hash = '/today'))
  await expect(page.locator('#main')).toContainText('Aniversario de boda · Ana')
})

test('hábitos en el iPad: el nombre se lee entero y se marca con un toque', async ({ page }) => {
  // iPad en horizontal: con la barra lateral, la tarjeta no cabe en una fila
  await page.setViewportSize({ width: 1180, height: 820 })
  await openApp(page, '/habits')
  const name = 'Estirar la espalda diez minutos después de trabajar'
  await page.getByRole('button', { name: 'Nuevo' }).first().click()
  await page.getByPlaceholder('Ej. Beber 2 L de agua').fill(name)
  await page.getByRole('button', { name: 'Crear hábito' }).click()

  const title = page.locator('#main').getByText(name, { exact: true })
  await expect(title).toBeVisible()
  // Sin cortar: ni puntos suspensivos ni texto que no quepa
  expect(await title.evaluate((el) => getComputedStyle(el).textOverflow !== 'ellipsis' && el.scrollWidth <= el.clientWidth)).toBe(true)

  const mark = page.getByRole('button', { name: `${name}: hecho hoy` })
  await expect(mark).toHaveAttribute('aria-pressed', 'false')
  await mark.click()
  await expect(mark).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Hoy llevas 1 de 1.')).toBeVisible()
  await mark.click()
  await expect(mark).toHaveAttribute('aria-pressed', 'false')
})
