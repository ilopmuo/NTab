import { expect, openApp, quickAdd, test } from './fixtures'

const task = (page: import('@playwright/test').Page, text: string) => page.locator('#main [data-task-id]', { hasText: text })

test('«algún día» y fecha límite: fuera de la Bandeja, cada una en su sitio', async ({ page }) => {
  await openApp(page, '/inbox')
  await quickAdd(page, 'Aprender a tocar el piano algún día')
  await quickAdd(page, 'Entregar la memoria antes del 28')
  await quickAdd(page, 'Mirar vuelos')
  await expect(task(page, 'Mirar vuelos')).toBeVisible()
  await expect(task(page, 'Aprender a tocar el piano')).toHaveCount(0)
  await expect(task(page, 'Entregar la memoria')).toHaveCount(0)

  await page.evaluate(() => (location.hash = '/someday'))
  await expect(task(page, 'Aprender a tocar el piano')).toBeVisible()

  // La fecha límite se ve en el detalle
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('combobox', { name: 'Paleta de comandos' }).fill('Entregar la memoria')
  await page.getByRole('option', { name: /Entregar la memoria/ }).click()
  // (en el ordenador, el detalle es un panel lateral)
  await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue('Entregar la memoria')
  await expect(page.getByText('Fecha límite', { exact: true })).toBeVisible()
})

test('listas inteligentes: una idea de inicio, en la barra lateral y al día', async ({ page }) => {
  await openApp(page, '/lists')
  await expect(page.getByText('Aún no tienes listas')).toBeVisible()
  await page.getByRole('button', { name: /^Prioridad alta/ }).click()
  const nav = page.getByRole('navigation', { name: 'Barra lateral' })
  await expect(nav.getByRole('link', { name: 'Prioridad alta' })).toBeVisible()

  await quickAdd(page, 'Renovar el pasaporte !alta')
  await quickAdd(page, 'Regar las plantas')
  await nav.getByRole('link', { name: 'Prioridad alta' }).click()
  await expect(page.locator('#main h1')).toHaveText('Prioridad alta')
  await expect(task(page, 'Renovar el pasaporte')).toBeVisible()
  await expect(task(page, 'Regar las plantas')).toHaveCount(0)

  // Editarla: solo las de 15 minutos o menos
  await page.getByRole('button', { name: 'Opciones de Prioridad alta' }).click()
  await page.getByRole('menuitem', { name: 'Editar la lista' }).click()
  await page.getByRole('button', { name: '≤ 15 min', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Ahora mismo, ninguna tarea')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(task(page, 'Renovar el pasaporte')).toHaveCount(0)
})

test('proyecto en tablero: columnas, arrastrar y mover tarjetas', async ({ page }) => {
  await openApp(page, '/projects')
  await page.getByRole('button', { name: 'Nuevo' }).click()
  await page.getByPlaceholder('Nombre del proyecto').fill('Mudanza')
  await page.getByRole('button', { name: 'Crear proyecto' }).click()
  await expect(page.locator('#main h1')).toHaveText('Mudanza')

  await page.getByRole('button', { name: 'Ver en tablero' }).click()
  const col = (name: string) => page.getByRole('region', { name: new RegExp(`^${name},`) })
  await col('Tareas').getByRole('button', { name: 'Añadir tarea' }).click()
  await page.keyboard.type('Pedir cajas')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(col('Tareas').getByText('Pedir cajas')).toBeVisible()

  for (const name of ['En marcha', 'Hecho']) {
    await page.getByRole('button', { name: 'Nueva columna' }).click()
    await page.getByLabel('Nombre de la nueva columna').fill(name)
    await page.keyboard.press('Enter')
    await expect(col(name)).toBeVisible()
  }
  await expect(col('Sin sección').getByText('Pedir cajas')).toBeVisible()

  // Arrastrando con el ratón a «En marcha» (con el tablero desplazado al principio)
  await page.locator('[data-drag-scroll-x]').evaluate((el) => el.scrollTo({ left: 0 }))
  await page.waitForTimeout(300)
  const card = await col('Sin sección').getByText('Pedir cajas').boundingBox()
  const target = await col('En marcha').boundingBox()
  await page.mouse.move(card!.x + 20, card!.y + card!.height / 2)
  await page.mouse.down()
  await page.mouse.move(card!.x + 40, card!.y + card!.height / 2 + 10, { steps: 4 })
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 30, { steps: 8 })
  await page.mouse.up()
  await expect(col('En marcha').getByText('Pedir cajas')).toBeVisible()

  // Sin ratón: «Mover a…» desde su menú
  await page.getByRole('button', { name: 'Mover «Pedir cajas»' }).click()
  await page.getByRole('menuitem', { name: 'Mover a Hecho' }).click()
  await expect(col('Hecho').getByText('Pedir cajas')).toBeVisible()

  // La vista se recuerda
  await page.reload()
  await expect(col('Hecho').getByText('Pedir cajas')).toBeVisible()
})

test('matriz de Eisenhower: cuadrantes y mover entre ellos', async ({ page }) => {
  await openApp(page, '/matrix')
  await quickAdd(page, 'Pagar la luz hoy !alta')
  await quickAdd(page, 'Ordenar fotos')
  const box = (name: string) => page.getByRole('region', { name })
  await expect(box('Urgente e importante').getByText('Pagar la luz')).toBeVisible()
  await expect(box('Ni urgente ni importante').getByText('Ordenar fotos')).toBeVisible()

  await page.getByRole('button', { name: 'Mover «Ordenar fotos»' }).click()
  await page.getByRole('menuitem', { name: 'Mover a «Importante, no urgente»' }).click()
  await expect(box('Importante, no urgente').getByText('Ordenar fotos')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).last().click()
  await expect(box('Ni urgente ni importante').getByText('Ordenar fotos')).toBeVisible()
})

test('notas enlazadas: [[…]] crea la otra nota y sale «Mencionada en»', async ({ page }) => {
  await openApp(page, '/notes')
  await page.getByRole('button', { name: 'Nueva nota' }).click()
  await page.getByPlaceholder('Título').fill('Recetas')
  await page.getByLabel('Texto de la nota').fill('Para el domingo: ver [[Lista de la compra]] #cocina')
  await page.getByRole('button', { name: 'Crear «Lista de la compra»' }).click()
  await expect(page.getByPlaceholder('Título')).toHaveValue('Lista de la compra')
  await expect(page.getByText('Mencionada en 1')).toBeVisible()
  await page.getByRole('link', { name: /^Recetas/ }).last().click()
  await expect(page.getByPlaceholder('Título')).toHaveValue('Recetas')

  // Al escribir «[[» se sugieren los títulos
  const body = page.getByLabel('Texto de la nota')
  await body.press('End')
  await body.pressSequentially(' y [[lis')
  await expect(page.getByRole('option', { name: 'Lista de la compra' })).toBeVisible()
  await body.press('Enter')
  await expect(body).toHaveValue('Para el domingo: ver [[Lista de la compra]] #cocina y [[Lista de la compra]]')

  // Las #etiquetas filtran la lista de notas
  await page.getByRole('button', { name: '#cocina', exact: true }).click()
  await expect(page.locator('a', { hasText: 'Lista de la compra' }).first()).toBeVisible()
})

test('barra lateral: Matriz y Plantillas, plegadas en «2 más» de Organizar', async ({ page }) => {
  await openApp(page)
  const nav = page.getByRole('navigation', { name: 'Barra lateral' })
  await expect(nav.getByRole('link', { name: 'Proyectos' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Matriz de Eisenhower' })).toHaveCount(0)
  await nav.getByRole('button', { name: 'Ver 2 más de Organizar' }).click()
  await nav.getByRole('link', { name: 'Matriz de Eisenhower' }).click()
  await expect(page.locator('#main h1')).toHaveText('Matriz de Eisenhower')
  // Plegado otra vez, lo que estás viendo sigue a la vista
  await nav.getByRole('button', { name: 'Ocultar las secciones ocultas de Organizar' }).click()
  await expect(nav.getByRole('link', { name: 'Matriz de Eisenhower' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Plantillas' })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: 'Ver 1 más de Organizar' })).toBeVisible()
})

test('renombrar una nota actualiza sus enlaces', async ({ page }) => {
  await openApp(page, '/notes')
  await page.getByRole('button', { name: 'Nueva nota' }).click()
  await page.getByPlaceholder('Título').fill('Recetas')
  await page.getByLabel('Texto de la nota').fill('Ver [[Lista de la compra]]')
  await page.getByRole('button', { name: 'Crear «Lista de la compra»' }).click()
  await expect(page.getByPlaceholder('Título')).toHaveValue('Lista de la compra')
  await page.getByPlaceholder('Título').fill('La compra')
  await page.getByLabel('Texto de la nota').click()
  await expect(page.getByText('Enlaces actualizados en 1 nota', { exact: true })).toBeVisible()
  await expect(page.getByText('Mencionada en 1')).toBeVisible()
  await page.getByRole('link', { name: /^Recetas/ }).last().click()
  await expect(page.getByLabel('Texto de la nota')).toHaveValue('Ver [[La compra]]')
})

test('fecha límite: aviso la víspera a la hora elegida', async ({ page }) => {
  // Jueves 1 de octubre de 2026 a las 9:01 (el aviso es a las 9:00)
  await page.clock.setFixedTime(new Date('2026-10-01T09:01:00+02:00'))
  await openApp(page, '/inbox')
  await quickAdd(page, 'Entregar la memoria antes del 2')
  await expect(page.getByRole('button', { name: 'Entregar la memoria: mañana es la fecha límite. ¿La dejas hecha hoy?' })).toBeVisible({ timeout: 20_000 })

  // Se puede apagar en Ajustes → Avisos
  await page.evaluate(() => (location.hash = '/settings'))
  await page.getByRole('switch', { name: 'Avisar de las fechas límite' }).click()
  await expect(page.getByLabel('Hora del aviso de fecha límite')).toHaveCount(0)
})
