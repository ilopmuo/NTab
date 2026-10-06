import { expect, openApp, quickAdd, test } from './fixtures'
import type { Page } from '@playwright/test'

const toast = (page: Page, text: string | RegExp) => page.locator('span').filter({ hasText: text }).first()

/** Guarda registros en la base de datos local y recarga (como si vinieran de otro dispositivo) */
async function seed(page: Page, rows: Record<string, unknown[]>) {
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('ntab')
        req.onsuccess = () => {
          const tx = req.result.transaction(Object.keys(data), 'readwrite')
          for (const [store, list] of Object.entries(data)) for (const row of list) tx.objectStore(store).put(row)
          tx.oncomplete = () => (req.result.close(), resolve())
        }
      }),
    rows,
  )
  await page.reload()
  await page.locator('#main').waitFor()
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inDays = (n: number) => ymd(new Date(Date.now() + n * 864e5))

test('las casillas de una nota pasan a tareas, y hacerlas (aquí o allí) las marca', async ({ page }) => {
  await openApp(page, '/notes')
  await page.getByRole('button', { name: 'Nueva nota', exact: true }).click()
  await page.getByPlaceholder('Título').fill('Viaje')
  const body = page.getByLabel('Texto de la nota')
  await body.fill('- [ ] Reservar hotel mañana\n- [ ] Comprar adaptador\nApuntes sueltos')

  await page.getByRole('button', { name: 'Pasar la lista a tareas' }).click()
  await expect(toast(page, '2 tareas creadas')).toBeVisible()
  const linked = page.locator('[data-note-tasks]')
  await expect(linked).toContainText('Tareas de esta nota · 0 de 2 hechas')
  // Con la fecha entendida, y la nota a la vista desde la tarea
  const hotel = linked.locator('[data-task-id]', { hasText: 'Reservar hotel' })
  await expect(hotel).toContainText('Mañana')
  await hotel.click({ position: { x: 150, y: 10 } })
  await expect(page.locator('[data-source-note]')).toHaveText('De la nota «Viaje»')
  await page.keyboard.press('Escape')

  // Hecha desde la lista: su casilla se marca en la nota
  await linked.locator('[data-task-id]', { hasText: 'Comprar adaptador' }).getByRole('checkbox').click()
  await expect(body).toHaveValue('- [ ] Reservar hotel mañana\n- [x] Comprar adaptador\nApuntes sueltos')
  await expect(linked).toContainText('1 de 2 hechas')
  // Otra vez: no se repiten
  await page.getByRole('button', { name: 'Pasar la lista a tareas' }).click()
  await expect(toast(page, 'Todas las casillas ya son tareas')).toBeVisible()

  // Y al revés: marcar la casilla hace la tarea
  await page.getByRole('button', { name: 'Leer con formato' }).click()
  await page.locator('#main').getByRole('checkbox', { name: 'Reservar hotel mañana' }).click()
  await expect(linked).toContainText('2 de 2 hechas')
  await expect(linked).toContainText('Todas hechas.')
})

test('un proyecto avisa de lo que necesita y la última tarea propone terminarlo', async ({ page }) => {
  await openApp(page, '/projects')
  await page.getByRole('button', { name: 'Nuevo' }).click()
  await page.getByPlaceholder('Nombre del proyecto').fill('Mudanza')
  await page.getByRole('button', { name: 'Crear proyecto' }).click()
  await expect(page.locator('#main h1')).toHaveText('Mudanza')

  // Sin nada que hacer: pide el siguiente paso, y se añade ahí mismo
  const nudge = page.locator('[data-project-nudge]')
  await expect(nudge).toContainText('¿cuál es el siguiente paso?')
  await nudge.getByRole('button', { name: 'Siguiente paso' }).click()
  await page.getByRole('dialog').getByRole('combobox', { name: 'Nueva tarea' }).fill('Contratar la furgoneta')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(nudge).toHaveCount(0)

  // Al planificar el día, su siguiente paso sale para que no se quede parado
  await page.evaluate(() => (location.hash = '/plan'))
  const plan = page.locator('section', { has: page.getByRole('heading', { name: /Para que avancen tus proyectos/ }) })
  await expect(plan).toContainText('Contratar la furgoneta')
  await expect(plan).toContainText('Mudanza')
  await page.evaluate(() => history.back())
  await expect(page.locator('#main h1')).toHaveText('Mudanza')

  // Hecha la última: ¿lo terminas?
  await page.locator('#main [data-task-id]', { hasText: 'Contratar la furgoneta' }).getByRole('checkbox').click()
  await expect(toast(page, 'Era la última de «Mudanza»')).toBeVisible()
  await page.getByRole('button', { name: 'Terminarlo' }).click()
  await expect(toast(page, '«Mudanza» terminado')).toBeVisible()
  await page.evaluate(() => (location.hash = '/projects'))
  await expect(page.locator('#main')).not.toContainText('Mudanza')
})

test('hacer una tarea con alguien apunta el contacto, los objetivos cuentan tareas y el calendario lo enseña todo', async ({ page }) => {
  await openApp(page, '/today')
  const now = Date.now()
  await seed(page, {
    people: [{ id: 'ana', name: 'Ana', email: '', phone: '', company: '', role: '', notes: '', tags: [], lastContact: inDays(-40), createdAt: now }],
    subscriptions: [{ id: 'nf', name: 'Netflix', kind: 'sub', amount: 12.99, currency: 'EUR', cycle: 'month', nextDate: inDays(3), active: true, category: 'ocio', notifyDays: null, notes: '', createdAt: now }],
    countdowns: [{ id: 'vac', name: 'Vacaciones', date: inDays(5), icon: '🏖️', createdAt: now }],
    goals: [{ id: 'g', title: 'Leer 3 libros', why: '', kind: 'tasks', tag: 'lectura', target: 3, unit: 'libros', status: 'active', order: 0, createdAt: now - 1000 }],
  })

  // Con @Ana: al hacerla, queda como contacto
  await quickAdd(page, 'Llamar a @Ana hoy')
  await page.locator('#main').getByRole('checkbox', { name: 'Llamar a Ana' }).click()
  await expect(toast(page, 'Hecho')).toBeVisible()
  await page.evaluate(() => (location.hash = '/people/ana'))
  await expect(page.locator('#main')).toContainText('Último contacto hoy')
  await expect(page.locator('#main')).toContainText('Historial')

  // Con la etiqueta del objetivo: cuenta
  await page.evaluate(() => (location.hash = '/today'))
  await quickAdd(page, 'Leer Rayuela #lectura hoy')
  await page.locator('#main').getByRole('checkbox', { name: 'Leer Rayuela' }).click()
  await expect(toast(page, 'Hecho · «Leer 3 libros»: 1 de 3')).toBeVisible()
  await page.evaluate(() => (location.hash = '/goals'))
  await expect(page.locator('#main')).toContainText('1 de 3 libros · #lectura')

  // En el calendario, el cargo y la cuenta atrás en su día
  await page.evaluate(() => (location.hash = '/calendar'))
  await page.locator('header').getByRole('button', { name: 'Lista', exact: true }).click()
  await expect(page.locator('[data-day-mark="payment"]')).toContainText('Netflix · 12,99')
  await expect(page.locator('[data-day-mark="countdown"]')).toContainText('Vacaciones')
})
