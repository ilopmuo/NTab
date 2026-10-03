import { expect, openApp, test } from './fixtures'
import type { Page } from '@playwright/test'
import { applyOps, type HouseItem, type HouseOp } from '../supabase/functions/_shared/house'

const TOKEN = 'a1'.repeat(32)
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }

/** La Edge Function `casa`, en memoria y con la misma lógica */
async function fakeHouse(page: Page, items: HouseItem[]) {
  const state = { name: 'Piso de la calle Mayor', items }
  const ops: HouseOp[] = []
  const pushes: { member: string; open: string }[] = []
  await page.route(/functions\/v1\/casa\//, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as { ops?: HouseOp[]; push?: { member: string; open: string } }
      if (body.push) pushes.push(body.push)
      ops.push(...(body.ops ?? []))
      const r = applyOps(state.items, body.ops ?? [])
      state.items = r.items
      if (r.name) state.name = r.name
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(state) })
  })
  return { state, ops, pushes }
}

const people = (): HouseItem[] => [
  { id: 'yo', kind: 'member', data: { name: 'Ignacio', order: 0 } },
  { id: 'ana', kind: 'member', data: { name: 'Ana', order: 1 } },
  { id: 'luis', kind: 'member', data: { name: 'Luis', order: 2 } },
]

const toast = (page: Page, text: string | RegExp) => page.locator('span').filter({ hasText: text }).first()
const section = (page: Page, title: string) => page.locator('#main section', { has: page.getByRole('heading', { name: title, exact: true }) })

test('Casa → Tareas: turnos, tareas sueltas, cuentas y la compra del piso', async ({ page }) => {
  await openApp(page, '/today')
  const house = await fakeHouse(page, people())
  // Tu piso (lo guarda la app al crearlo con tu cuenta)
  await page.evaluate(
    (token) =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('ntab')
        req.onsuccess = () => {
          const tx = req.result.transaction('settings', 'readwrite')
          tx.objectStore('settings').put({ key: 'household', value: { token, me: 'yo' } })
          tx.oncomplete = () => resolve()
        }
      }),
    TOKEN,
  )
  // Casa abre en Tareas
  await page.getByRole('navigation', { name: 'Barra lateral' }).getByRole('link', { name: 'Casa' }).click()
  await expect(page.locator('#main h1')).toHaveText('Piso de la calle Mayor')
  await expect(page.locator('#main')).toContainText('Tú, Ana y Luis')

  // Una idea para empezar: por turnos entre todos, empezando por ti
  await page.getByRole('button', { name: 'Sacar la basura' }).click()
  const mine = section(page, 'Te toca')
  await expect(mine).toContainText('Sacar la basura')
  await mine.getByRole('button', { name: 'Hecho' }).click()
  await expect(toast(page, /La próxima le toca a Ana/)).toBeVisible()
  await expect(section(page, 'Tareas de casa')).toContainText('Le toca a Ana')
  await expect.poll(() => house.state.items.find((i) => i.kind === 'chore')?.data).toMatchObject({ turn: 1, log: [{ by: 'yo' }] })

  // Una suelta, para quien pueda
  await page.getByLabel('Añadir una tarea de casa').fill('Llamar al casero')
  await page.getByLabel('Añadir una tarea de casa').press('Enter')
  await expect(section(page, 'Tareas de casa')).toContainText('Quien pueda')
  await expect(section(page, 'Reparto, últimos 30 días')).toContainText('Tú')

  // Cuentas: 9 € de papel entre los tres
  await page.getByRole('button', { name: 'Gasto', exact: true }).click()
  const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Gasto del piso' }) })
  await form.getByLabel('Qué').fill('Papel higiénico')
  await form.getByLabel('Cuánto').fill('9')
  await form.getByRole('button', { name: 'Apuntar' }).click()
  const money = section(page, 'Cuentas del piso')
  await expect(money).toContainText('Te deben 6 €')
  await expect(money).toContainText('Ana paga 3 € a ti')
  await money.getByRole('button', { name: 'Hecho' }).first().click()
  await expect(money).toContainText('Te deben 3 €')

  // La compra del piso, dentro de Compra
  await page.locator('#main').getByRole('button', { name: 'Ver', exact: true }).click()
  await expect(page.locator('#main h1')).toHaveText('Compra')
  await expect(page.getByRole('button', { name: /^Piso/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Añadir a la compra del piso').fill('leche y pan')
  await page.getByLabel('Añadir a la compra del piso').press('Enter')
  await page.getByRole('checkbox', { name: 'Leche: comprado' }).click()
  await expect(page.locator('#main')).toContainText('Comprado · 1')
  await expect.poll(() => house.state.items.filter((i) => i.kind === 'shop').map((i) => i.data)).toEqual([
    expect.objectContaining({ name: 'Leche', done: true, doneBy: 'yo' }),
    expect.objectContaining({ name: 'Pan', by: 'yo' }),
  ])

  // Precios y total, como en la tuya; lo comprado pasa a «lo de siempre» con su precio
  await page.getByRole('button', { name: 'Poner precio a Leche' }).click()
  await page.getByLabel('Precio de Leche').fill('1,20')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Poner precio a Pan' }).click()
  await page.getByLabel('Precio de Pan').fill('0,8')
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toContainText('Unos 2,00 € · 1,20 € comprado')
  await page.getByRole('button', { name: 'Quitar lo comprado' }).click()
  await expect(page.getByRole('checkbox', { name: 'Leche: sin comprar' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Leche', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Leche: comprado' })).toBeVisible()
  // Vuelve con el precio de la última vez
  await expect(page.getByRole('button', { name: 'Precio de Leche: 1,20 €. Cambiar' })).toBeVisible()

  // Tu parte de los gastos del piso, en tus Gastos
  await page.goto('./#/expenses')
  await expect(page.locator('#main')).toContainText(/Papel higiénico \(piso\)Casa · #piso3\s€/)
})

test('un compañero entra con el enlace, sin cuenta, y se le recuerda', async ({ page }) => {
  const today = new Date()
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const house = await fakeHouse(page, [
    ...people(),
    { id: 'baño', kind: 'chore', data: { title: 'Limpiar el baño', every: 7, rotation: ['ana', 'luis', 'yo'], turn: 0, due: ymd, at: 0 } },
  ])
  await page.goto(`./#/piso/${TOKEN}`)
  await expect(page.getByRole('heading', { name: 'Piso de la calle Mayor' })).toBeVisible()
  await expect(page.getByText('¿Quién eres?')).toBeVisible()
  await page.getByRole('button', { name: /Ana/ }).click()

  await expect(section(page, 'Te toca')).toContainText('Limpiar el baño')
  await section(page, 'Te toca').getByRole('button', { name: 'Hecho' }).click()
  await expect(toast(page, /La próxima le toca a Luis/)).toBeVisible()

  await page.getByRole('button', { name: 'Compra', exact: true }).click()
  await page.getByLabel('Añadir a la compra del piso').fill('café')
  await page.getByLabel('Añadir a la compra del piso').press('Enter')
  await expect(page.getByRole('checkbox', { name: 'Café: comprado' })).toBeVisible()
  await expect.poll(() => house.ops.filter((o) => o.op === 'put' && o.kind === 'shop').map((o) => (o as unknown as { data: { by: string } }).data.by)).toEqual(['ana'])

  // Al volver, ya sabe quién es
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Piso de la calle Mayor' })).toBeVisible()
  await expect(page.getByText('¿Quién eres?')).toHaveCount(0)
  await expect(page.locator('main, #main').first()).toContainText('Tú, Ignacio y Luis')

  // Desde la pantalla de inicio (la app sin enlace) se abre directamente en su piso
  await page.goto('./')
  await expect(page).toHaveURL(new RegExp(`#/piso/${TOKEN}$`))
  await expect(page.getByRole('heading', { name: 'Piso de la calle Mayor' })).toBeVisible()
})

test('un compañero sin cuenta puede pedir que le avise el móvil', async ({ page }) => {
  const house = await fakeHouse(page, [...people(), { id: 'basura', kind: 'chore', data: { title: 'Sacar la basura', rotation: ['ana', 'yo'], turn: 0, at: 0 } }])
  // Permiso y servicio de avisos de mentira (Chromium sin ventana los niega, y aquí no hay service worker)
  await page.addInitScript(() => {
    let permission: NotificationPermission = 'default'
    Object.defineProperty(Notification, 'permission', { get: () => permission })
    Notification.requestPermission = async () => (permission = 'granted')
    const sub = { endpoint: 'https://push.ejemplo/ana', toJSON: () => ({ endpoint: 'https://push.ejemplo/ana', keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }), unsubscribe: async () => true }
    const reg = { active: {}, pushManager: { getSubscription: async () => sub, subscribe: async () => sub } }
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', { value: async () => reg })
  })
  await page.goto(`./#/piso/${TOKEN}`)
  await page.getByRole('button', { name: /Ana/ }).click()
  await expect(page.getByText('Que te avise el móvil', { exact: true })).toBeVisible()
  await expect(page.getByText('A las 9:00, lo que te toca en casa; a las 20:00, si sigue sin hacer.')).toBeVisible()
  await page.getByRole('button', { name: 'Activar' }).click()
  await expect(toast(page, 'Listo: te avisaremos de lo que te toca en casa')).toBeVisible()
  await expect.poll(() => house.pushes).toEqual([expect.objectContaining({ member: 'ana', open: 'piso' })])
  await expect(page.getByText('Avisos activados')).toBeVisible()
})
