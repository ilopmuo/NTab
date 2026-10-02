import { expect, openApp, test } from './fixtures'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAGklEQVQIW2P8z8Dwn4GBgYGJAQoYGRj+MwAAMgUC/0Ns6qkAAAAASUVORK5CYII=', 'base64')

test('maleta: casillas que se marcan, marcadas al final y desmarcar todo', async ({ page }) => {
  await openApp(page, '/notes')
  await page.getByRole('button', { name: 'Plantillas de notas' }).click()
  await page.getByRole('button', { name: /^Maleta/ }).click()
  await expect(page.getByPlaceholder('Título')).toHaveValue('Maleta')
  await page.getByRole('button', { name: 'Leer con formato' }).click()

  const main = page.locator('#main')
  await main.getByRole('checkbox', { name: 'DNI o pasaporte' }).click()
  await expect(main).toContainText('1 de 8')
  await expect(page.getByLabel('1 de 8 marcadas')).toBeVisible()
  // Marcadas al final (como Notas de Apple)
  await page.getByRole('switch', { name: 'Marcadas al final' }).click()
  await expect(main.getByRole('checkbox').last()).toHaveAccessibleName('DNI o pasaporte')
  await main.getByRole('checkbox', { name: 'Cargador del móvil' }).click()
  await expect(main.getByRole('checkbox').nth(-2)).toHaveAccessibleName('Cargador del móvil')
  await expect(main).toContainText('2 de 8')
  // Para la próxima: desmarcar todo
  await page.getByRole('button', { name: 'Desmarcar todo' }).click()
  await expect(main).toContainText('0 de 8')
  await expect(main.getByRole('checkbox', { checked: true })).toHaveCount(0)
})

test('escribir con formato: casillas, Intro que sigue la lista, títulos y negrita', async ({ page }) => {
  await openApp(page, '/notes')
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click()
  await page.getByPlaceholder('Título').fill('Viaje a Lisboa')
  const body = page.getByLabel('Texto de la nota')
  await body.fill('Hotel reservado')
  // «reservado» seleccionado, en negrita
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 15))
  await page.getByRole('button', { name: 'Negrita' }).click()
  await body.press('End')
  await body.press('Enter')
  await body.pressSequentially('Billetes')
  await page.getByRole('button', { name: 'Casilla' }).click()
  await body.press('Enter')
  await body.pressSequentially('Seguro de viaje')
  await body.press('Enter')
  await body.press('Enter')
  await body.pressSequentially('Ver el fado')
  await expect(body).toHaveValue('Hotel **reservado**\n- [ ] Billetes\n- [ ] Seguro de viaje\nVer el fado')

  await page.getByRole('button', { name: 'Leer con formato' }).click()
  const main = page.locator('#main')
  await expect(main.locator('strong', { hasText: 'reservado' })).toBeVisible()
  await expect(main.getByRole('checkbox', { name: 'Seguro de viaje' })).toBeVisible()
  // Tocar el texto vuelve a escribir
  await main.getByText('Ver el fado').click()
  await expect(page.getByLabel('Texto de la nota')).toBeVisible()
})

test('nota del día (una por día) y fotos', async ({ page }) => {
  await openApp(page, '/notes')
  await page.getByRole('button', { name: 'Plantillas de notas' }).click()
  await page.getByRole('button', { name: /^Nota del día/ }).click()
  const title = await page.getByPlaceholder('Título').inputValue()
  expect(title).toMatch(/^[A-ZÁÉÍÓÚ][a-záéíóú]+, \d{1,2} de [a-z]+$/)
  await expect(page.getByLabel('Texto de la nota')).toHaveValue(/## Lo importante/)

  // Una foto
  await page.locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('button', { name: 'Ver la foto 1' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver la foto 1' }).click()
  await expect(page.getByRole('img', { name: 'Foto 1' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar la foto' }).click()

  // Otra vez «Nota del día»: abre la misma
  await page.getByRole('button', { name: 'Plantillas de notas' }).click()
  await page.getByRole('button', { name: /^Nota del día/ }).click()
  await expect(page.getByPlaceholder('Título')).toHaveValue(title)
  await expect(page.locator('#main a', { hasText: title })).toHaveCount(1)
  await expect(page.locator('#main a', { hasText: title }).getByLabel('Con fotos')).toBeVisible()
})
