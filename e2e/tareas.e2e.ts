import { expect, openApp, quickAdd, test, titles } from './fixtures'

test('captura en lenguaje natural, detalle y paleta', async ({ page }) => {
  await openApp(page, '/upcoming')
  await quickAdd(page, 'Llamar al dentista mañana a las 10 !alta ~30m')
  const row = page.locator('#main [data-task-id]', { hasText: 'Llamar al dentista' })
  await expect(row).toContainText('10:00')
  await expect(row).toContainText('30 min')

  await row.click({ position: { x: 120, y: 10 } })
  await expect(page.locator('aside textarea').first()).toHaveValue('Llamar al dentista')
  await page.keyboard.press('Escape')

  await page.keyboard.press('Control+k')
  await page.locator('[cmdk-input]').fill('dentista')
  await expect(page.locator('[cmdk-item]', { hasText: 'Llamar al dentista' })).toBeVisible()
  await page.keyboard.press('Escape')
})

test('selección múltiple: pasar a mañana', async ({ page }) => {
  await openApp(page, '/inbox')
  await quickAdd(page, 'Tarea uno')
  await quickAdd(page, 'Tarea dos')
  await page.getByRole('button', { name: 'Seleccionar tareas' }).click()
  await page.locator('#main [data-task-id]', { hasText: 'Tarea uno' }).click()
  await page.locator('#main [data-task-id]', { hasText: 'Tarea dos' }).click()
  await expect(page.getByText('2 seleccionadas')).toBeVisible()
  await page.getByRole('button', { name: 'Mañana' }).click()
  // Con fecha, dejan la bandeja
  await expect(page.locator('#main [data-task-id]', { hasText: /Tarea (uno|dos)/ })).toHaveCount(0)
})

test('orden a mano en la bandeja: teclado y se conserva al recargar', async ({ page }) => {
  await openApp(page, '/inbox')
  for (const t of ['Uno', 'Dos', 'Tres']) await quickAdd(page, t)
  await page.getByRole('button', { name: 'Orden automático' }).click()
  await expect(page.getByRole('button', { name: 'Orden a mano' })).toBeVisible()
  const before = await titles(page)
  await page.getByRole('button', { name: /^Mover «Tres»/ }).focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  const expected = [...before]
  expected.splice(expected.indexOf('Tres'), 1)
  expected.splice(expected.indexOf('Uno'), 0, 'Tres')
  await expect.poll(() => titles(page)).toEqual(expected)
  await page.reload()
  await expect.poll(() => titles(page)).toEqual(expected)
})

test('subtareas: se añaden y se reordenan', async ({ page }) => {
  await openApp(page, '/inbox')
  await quickAdd(page, 'Preparar viaje')
  await page.locator('#main [data-task-id]', { hasText: 'Preparar viaje' }).click({ position: { x: 120, y: 10 } })
  const add = page.getByPlaceholder(/subtarea/i).first()
  for (const s of ['Maleta', 'Billetes', 'Pasaporte']) {
    await add.fill(s)
    await add.press('Enter')
  }
  await page.getByRole('button', { name: /^Mover «Pasaporte»/ }).focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  const values = () => page.locator('aside [aria-label^="Mover «"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.match(/«(.+)»/)![1]))
  await expect.poll(values).toEqual(['Pasaporte', 'Maleta', 'Billetes'])
})

test('autocompletar en la captura: #etiqueta y +proyecto de varias palabras', async ({ page }) => {
  await openApp(page, '/projects')
  await page.getByRole('button', { name: 'Nuevo' }).click()
  await page.getByPlaceholder('Nombre del proyecto').fill('Web nueva')
  await page.getByRole('button', { name: 'Crear proyecto' }).click()
  await expect(page.locator('#main h1')).toHaveText('Web nueva')
  await quickAdd(page, 'Llamar al dentista #salud')

  await page.keyboard.press('n')
  const input = page.getByRole('combobox', { name: 'Nueva tarea' })
  await input.pressSequentially('Pedir cita #sa')
  await expect(page.getByRole('option', { name: 'salud' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(input).toHaveValue('Pedir cita #salud ')
  await input.pressSequentially('+we')
  await page.getByRole('option', { name: 'Web nueva' }).click()
  await expect(input).toHaveValue('Pedir cita #salud +Web nueva ')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await input.press('Enter')

  const row = page.locator('#main [data-task-id]', { hasText: 'Pedir cita' })
  await expect(row).toBeVisible()
  await expect(row.locator('p').first()).toHaveText('Pedir cita')
})
