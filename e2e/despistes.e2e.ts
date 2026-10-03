import { expect, openApp, test, titles } from './fixtures'

const toast = (page: import('@playwright/test').Page, text: string | RegExp) => page.locator('span').filter({ hasText: text }).first()

test('medicación: a sus horas, «¿me la he tomado?», cuando haga falta y reponer', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-03T09:05:00+02:00'))
  await openApp(page, '/meds')
  await expect(page.getByText('¿Tomas alguna medicación?')).toBeVisible()
  await page.getByRole('button', { name: 'Añadir medicamento' }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('Nombre').fill('Ibuprofeno')
  await form.getByLabel('Dosis').fill('600 mg')
  await form.getByRole('button', { name: /Cena · 21:00/ }).click()
  await form.getByLabel('Quedan en casa').fill('6')
  await form.getByRole('button', { name: 'Crear' }).click()

  // Hoy: la de las 9 toca ya, la de las 21 después
  const main = page.locator('#main')
  await expect(main).toContainText('Hoy: 0 de 2 tomadas · 1 toca ya.')
  await page.getByRole('button', { name: 'Ibuprofeno de las 9:00: tomada' }).click()
  await expect(toast(page, /Ibuprofeno: tomada a las 9:05/)).toBeVisible()
  await expect(main).toContainText('Tomada a las 9:05')
  await expect(main).toContainText('Hoy: 1 de 2 tomadas.')
  // Se descuenta de la caja: quedan 5, para 2 días → toca reponer
  await expect(page.getByRole('heading', { name: 'Reponer' })).toBeVisible()
  await expect(main).toContainText('Quedan 5 · para 2 días')
  await page.getByRole('button', { name: 'Caja nueva' }).click()
  await page.getByLabel('Cuántas trae la caja nueva de Ibuprofeno').fill('20')
  await page.getByRole('button', { name: 'Sumar' }).click()
  await expect(page.getByRole('heading', { name: 'Reponer' })).toHaveCount(0)
  await expect(main).toContainText('quedan 25 (12 días)')

  // Cuando haga falta, con máximo al día
  await page.getByRole('button', { name: 'Nuevo' }).click()
  await form.getByLabel('Nombre').fill('Paracetamol')
  await form.getByRole('button', { name: 'Cuando haga falta' }).click()
  await form.getByLabel('Como mucho, al día (opcional)').fill('1')
  await form.getByRole('button', { name: 'Crear' }).click()
  await page.getByRole('button', { name: 'Paracetamol: tomar ahora' }).click()
  await expect(main).toContainText('Hoy 1 de 1 · la última a las 9:05')
  await page.getByRole('button', { name: 'Paracetamol: tomar ahora' }).click()
  await expect(toast(page, 'Ya llevas 1 hoy (máximo 1)')).toBeVisible()

  // En Hoy, la tarjeta con lo de hoy
  await page.goto('./#/today')
  const card = page.locator('aside').filter({ has: page.getByRole('heading', { name: 'Medicación' }) })
  await expect(card).toContainText('1/2')
  await expect(card).toContainText('Tomada a las 9:05')
  await expect(card.getByRole('button', { name: 'Ibuprofeno de las 21:00: tomada' })).toBeVisible()
})

test('a la espera: «esperando a Luis», fuera de Hoy hasta que toca, y recordárselo', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.clock.setFixedTime(new Date('2026-10-03T10:00:00+02:00'))
  await openApp(page, '/today')
  await page.keyboard.press('n')
  const input = page.getByRole('dialog').locator('input, textarea').first()
  await input.fill('Presupuesto del fontanero esperando a Luis')
  await expect(page.getByRole('dialog')).toContainText('Esperando a Luis')
  await input.press('Enter')
  await page.keyboard.press('Escape')

  // No ocupa Hoy (solo sale el martes en «Próximos días»); mientras, en Bandeja → A la espera, por persona
  await expect(page.locator('#main')).toContainText('Martes')
  expect(await titles(page)).not.toContain('Presupuesto del fontanero')
  await page.goto('./#/waiting')
  await expect(page.getByRole('heading', { name: 'Luis' })).toBeVisible()
  await expect(page.locator('#main')).toContainText('Presupuesto del fontanero')
  await expect(page.locator('#main')).toContainText('Esperando a Luis')

  // Tres días después, en Hoy, con cuánto lleva
  await page.clock.setFixedTime(new Date('2026-10-06T10:00:00+02:00'))
  await page.goto('./#/today')
  await expect(page.locator('#main')).toContainText('Esperando a Luis · 3 días')
  await page.locator('#main').getByText('Presupuesto del fontanero').click()
  // El detalle se abre al lado (en el ordenador)
  const detail = page.getByRole('complementary').filter({ hasText: 'A la espera' }).last()
  await detail.getByRole('button', { name: 'Recordárselo' }).click()
  await expect(toast(page, 'Mensaje copiado: pégalo donde le escribas. Te lo vuelvo a recordar el viernes')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Hola Luis, ¿cómo va lo de «presupuesto del fontanero»?')
  // Y vuelve a mirarse en 3 días, sin contar como pospuesta
  await expect(detail).toContainText('Viernes')
  await expect(detail).not.toContainText('pospuesta')
})
