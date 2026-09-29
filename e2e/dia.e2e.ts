import { expect, openApp, quickAdd, test } from './fixtures'

async function stored(page: import('@playwright/test').Page, title: string) {
  return page.evaluate(async (t) => {
    const req = indexedDB.open('ntab')
    const db = await new Promise<IDBDatabase>((r) => (req.onsuccess = () => r(req.result)))
    const all = await new Promise<{ title: string; dueTime?: string; estimate?: number }[]>((r) => {
      const q = db.transaction('tasks').objectStore('tasks').getAll()
      q.onsuccess = () => r(q.result)
    })
    db.close()
    const x = all.find((y) => y.title === t)
    return x ? `${x.dueTime} ~${x.estimate}` : 'no'
  }, title)
}

test('«Hora a hora»: arrastrar, estirar y teclado', async ({ page }) => {
  await openApp(page, '/plan')
  await quickAdd(page, 'Llamar a Ana hoy a las 10 ~30m')
  const block = page.locator('button[title^="Arrastra para cambiar la hora"]', { hasText: 'Llamar a Ana' })
  await block.evaluate((el) => el.scrollIntoView({ block: 'center' }))

  // Una hora abajo (52 px por hora)
  let b = (await block.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + 8)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width / 2, b.y + 8 + 5.2 * i)
  await page.mouse.up()
  await expect.poll(() => stored(page, 'Llamar a Ana')).toBe('11:00 ~30')
  // Soltar no abre la tarea
  await expect(page.locator('aside')).toHaveCount(0)

  // Estirar el borde media hora
  await block.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  b = (await block.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width / 2, b.y + b.height - 2 + 2.6 * i)
  await page.mouse.up()
  await expect.poll(() => stored(page, 'Llamar a Ana')).toBe('11:00 ~60')

  // Teclado: ↑ mueve 15 min y Mayús+↓ alarga 15 min
  await block.focus()
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => stored(page, 'Llamar a Ana')).toBe('10:45 ~60')
  await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(() => stored(page, 'Llamar a Ana')).toBe('10:45 ~75')
})

test('hábito con cantidad y hábito semanal', async ({ page }) => {
  await openApp(page, '/habits')
  await page.getByRole('button', { name: 'Nuevo' }).click()
  await page.getByPlaceholder('Ej. Beber 2 L de agua').fill('Beber agua')
  await page.getByRole('button', { name: 'Una cantidad' }).click()
  await page.getByLabel('Cantidad al día').fill('4')
  await page.getByLabel('Unidad').fill('vasos')
  await page.getByRole('button', { name: 'Crear hábito' }).click()
  await expect(page.locator('#main').getByText('0/4 vasos')).toBeVisible()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Sumar uno a Beber agua' }).click()
  await expect(page.locator('#main').getByText('4/4 vasos')).toBeVisible()

  await page.getByRole('button', { name: 'Nuevo' }).click()
  await page.getByPlaceholder('Ej. Beber 2 L de agua').fill('Nadar')
  await page.getByRole('button', { name: 'Veces por semana' }).click()
  await page.getByRole('group', { name: 'Cuándo' }).getByRole('button', { name: '2', exact: true }).click()
  await page.getByRole('button', { name: 'Crear hábito' }).click()
  await expect(page.getByText('0 de 2 esta semana')).toBeVisible()

  // En Hoy: el de cantidad ya está cumplido y el semanal pendiente
  await page.evaluate(() => (location.hash = '/today'))
  await expect(page.locator('#main').getByText('4/4 vasos')).toBeVisible()
  await expect(page.locator('#main').getByText('0 de 2 esta semana')).toBeVisible()
})
