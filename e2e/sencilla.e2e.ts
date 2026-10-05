import { expect, openApp, quickAdd, test } from './fixtures'

test('diez lugares y pocas pestañas: lo de dentro, con «‹ Atrás»', async ({ page }) => {
  await openApp(page, '/today')
  const nav = page.getByRole('navigation', { name: 'Barra lateral' })
  // Lo que antes eran espacios o pestañas aparte ya no está en la barra
  for (const gone of ['Planificar', 'Etiquetas y filtros', 'Próximo', 'Completadas']) await expect(nav.getByRole('link', { name: gone, exact: true })).toHaveCount(0)
  for (const place of ['Hoy', 'Bandeja', 'Calendario', 'Hábitos', 'Notas', 'Casa', 'Proyectos', 'Listas', 'Personas', 'Dinero']) await expect(nav.getByRole('link', { name: new RegExp(`(^|\\s)${place}$`) }).first()).toBeVisible()

  // Calendario lleva Próximo dentro, como su vista «Lista»
  await nav.getByRole('link', { name: /Calendario$/ }).click()
  await page.getByRole('button', { name: 'Lista', exact: true }).click()
  await expect(page.locator('#main h1')).toHaveText('Próximo')
  await expect(page.getByRole('navigation', { name: 'Calendario' })).toHaveCount(0)

  // Listas: Algún día, A la espera, Completadas y la Matriz, y debajo filtros y etiquetas
  await nav.getByRole('link', { name: 'Listas' }).click()
  await expect(page.locator('#main h1')).toHaveText('Listas')
  for (const tile of ['Algún día', 'A la espera', 'Completadas', 'Matriz']) await expect(page.locator('#main').getByRole('link', { name: new RegExp(tile) })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Filtros' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Etiquetas' })).toBeVisible()
  await page.locator('#main').getByRole('link', { name: /Algún día/ }).click()
  await expect(page.locator('#main h1')).toHaveText('Algún día')
  await page.getByRole('button', { name: 'Volver a Listas' }).click()
  await expect(page.locator('#main h1')).toHaveText('Listas')

  // Hábitos lleva Última vez dentro; sus pestañas, solo lo distinto
  await nav.getByRole('link', { name: /Hábitos$/ }).click()
  await expect(page.getByRole('heading', { name: 'Última vez' })).toBeVisible()
  const tabs = page.getByRole('navigation', { name: 'Hábitos' })
  await expect(tabs.getByRole('link')).toHaveText(['Hábitos', 'Rutinas', 'Medicación'])
})

test('Hoy sugiere una sola cosa y lo del día sale de su menú', async ({ page }) => {
  await openApp(page, '/today')
  // La primera vez, elegir funciones; nada más apilado debajo
  await expect(page.getByRole('region', { name: 'Haz LUNO a tu medida' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Planifica tu día/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ahora no' }).click()
  await expect(page.getByRole('link', { name: /Planifica tu día/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Revisión semanal/ })).toHaveCount(0)

  // Planificar, foco, cierre y revisión: desde «Tu día», y vuelven a Hoy
  await page.getByRole('button', { name: 'Tu día' }).click()
  await page.getByRole('menuitem', { name: 'Cerrar el día' }).click()
  await expect(page.getByRole('heading', { name: 'Cierra el día', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Volver a Hoy' }).click()
  await expect(page.locator('#main h1')).toContainText(/Buen|Hola/)
})

test('el detalle de una tarea enseña lo justo; lo demás, con «Añadir»', async ({ page }) => {
  await openApp(page, '/today')
  await quickAdd(page, 'Pedir presupuesto hoy')
  const open = () => page.locator('#main [data-task-id]', { hasText: 'Pedir presupuesto' }).first().click({ position: { x: 150, y: 10 } })
  await open()
  const panel = page.getByRole('complementary').filter({ has: page.getByRole('textbox', { name: 'Título' }) })
  // Arriba, las notas y la fecha; sin hora, aviso ni prioridad no salen sus filas
  await expect(panel.getByRole('textbox', { name: 'Notas' })).toBeVisible()
  await expect(panel.getByLabel('Otra hora')).toHaveCount(0)
  await expect(panel.getByRole('combobox', { name: 'Aviso' })).toHaveCount(0)
  const add = panel.getByRole('group', { name: 'Añadir a la tarea' })
  for (const f of ['hora', 'aviso', 'repetir', 'fecha límite', 'prioridad', 'etiquetas']) await expect(add.getByRole('button', { name: `Añadir ${f}` })).toBeVisible()
  // Un toque y aparece su fila
  await add.getByRole('button', { name: 'Añadir hora' }).click()
  await expect(add.getByRole('button', { name: 'Añadir hora' })).toHaveCount(0)
  await panel.getByLabel('Otra hora').fill('17:30')
  // Con hora llega su aviso, y su fila aparece sola
  await expect(panel.getByRole('combobox', { name: 'Aviso' })).toHaveValue(/.+/)
  await expect(add.getByRole('button', { name: 'Añadir aviso' })).toHaveCount(0)
  await add.getByRole('button', { name: 'Añadir prioridad' }).click()
  await expect(panel.getByRole('button', { name: 'Ninguna', exact: true })).toBeVisible()
  // Al volver a abrirla, la hora sigue a la vista (tiene algo); la prioridad sin elegir, no
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await open()
  await expect(panel.getByLabel('Otra hora')).toHaveValue('17:30')
  await expect(panel.getByRole('button', { name: 'Ninguna', exact: true })).toHaveCount(0)
  await expect(add.getByRole('button', { name: 'Añadir prioridad' })).toBeVisible()
})

test('Ajustes: una portada corta y cada apartado en su página, con «‹ Ajustes»', async ({ page }) => {
  await openApp(page, '/settings')
  const main = page.locator('#main')
  for (const p of ['Avisos', 'Apariencia', 'Funciones y navegación', 'Áreas de vida', 'Calendarios', 'Claude y Siri', 'Tus datos']) await expect(main.getByRole('button', { name: new RegExp(`^${p}`) })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'Color de acento' })).toHaveCount(0)
  await main.getByRole('button', { name: /^Apariencia/ }).click()
  await expect(page.locator('#main h1')).toHaveText('Apariencia')
  await expect(page).toHaveTitle('Apariencia · LUNO')
  await expect(page.getByRole('radiogroup', { name: 'Color de acento' })).toBeVisible()
  await page.getByRole('button', { name: 'Volver a Ajustes' }).click()
  await expect(page.locator('#main h1')).toHaveText('Ajustes')
})

test('Hoy no enseña tarjetas vacías', async ({ page }) => {
  await openApp(page, '/today')
  const main = page.locator('#main')
  for (const h of ['Agenda', 'Próximos días', 'Hábitos', 'Cuenta atrás']) await expect(main.getByRole('heading', { name: h, exact: true })).toHaveCount(0)
  // La primera cuenta atrás, desde un botón pequeño
  await main.getByRole('button', { name: 'Cuenta atrás', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Nueva cuenta atrás')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Con algo a una hora, la agenda aparece
  await quickAdd(page, 'Llamar al banco hoy a las 23:59')
  await expect(main.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible()
})

test.describe('en el móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('el menú «Tu día» cabe en la pantalla aunque el botón quede a la izquierda', async ({ page }) => {
    await openApp(page, '/today')
    await page.getByRole('button', { name: 'Tu día' }).click()
    const menu = page.getByRole('menu', { name: 'Tu día' })
    await expect(menu.getByRole('menuitem', { name: 'Planificar el día' })).toBeVisible()
    const box = (await menu.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  })
})
