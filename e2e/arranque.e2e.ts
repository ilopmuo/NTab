import { expect, openApp, test } from './fixtures'

// Las de src/app/sections.tsx y alguna más
const PATHS = ['/today', '/upcoming', '/inbox', '/calendar', '/habits', '/routines', '/notes', '/journal', '/menu', '/shopping', '/trackers', '/things', '/people', '/projects', '/templates', '/goals', '/expenses', '/finance', '/review', '/trash', '/logbook', '/settings', '/plan']

test('todas las secciones se abren sin errores', async ({ page }) => {
  await openApp(page)
  for (const path of PATHS) {
    await page.evaluate((p) => (location.hash = p), path)
    await expect(page).toHaveTitle(new RegExp(`· NTab$`))
    await expect(page.locator('#main h1').first()).toBeVisible()
  }
})

test('dispositivo nuevo: pantalla de acceso', async ({ page }) => {
  await page.goto('./#/today')
  await expect(page.getByText('Usar sin cuenta en este dispositivo')).toBeVisible()
  await expect(page.locator('#main')).toHaveCount(0)
})

test('dispositivo que ya tenía cuenta: Hoy al momento y aviso de volver a entrar', async ({ page }) => {
  await openApp(page)
  await page.evaluate(async () => {
    localStorage.removeItem('ntab-local-only')
    // Sesión guardada con el token caducado: Supabase (sin red) no podrá renovarla
    const exp = Math.floor(Date.now() / 1000) - 600
    localStorage.setItem('ntab-auth', JSON.stringify({ access_token: 'x', token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: '00000000-0000-0000-0000-000000000001', email: 'yo@ejemplo.com' } }))
    const req = indexedDB.open('ntab')
    const db = await new Promise<IDBDatabase>((r) => (req.onsuccess = () => r(req.result)))
    await new Promise((r) => {
      const tx = db.transaction('_local', 'readwrite')
      tx.objectStore('_local').put({ key: 'email', value: 'yo@ejemplo.com' })
      tx.oncomplete = r
    })
    db.close()
  })
  // El servidor rechaza la sesión (sin red, en cambio, se conserva y no hay aviso)
  await page.route(/supabase\.co\/auth/, (r) =>
    r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"invalid_grant","error_description":"Invalid Refresh Token"}' }),
  )
  await page.reload()
  await expect(page.locator('#main [data-task-id]').first()).toBeVisible()
  await expect(page.getByText('Vuelve a entrar para sincronizar')).toBeVisible({ timeout: 15_000 })
})
