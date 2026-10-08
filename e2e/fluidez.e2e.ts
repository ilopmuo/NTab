import { expect, openApp, test } from './fixtures'
import type { Page } from '@playwright/test'

/** Muchas tareas en la Bandeja, directamente en la base de datos */
async function inbox(page: Page, n: number) {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('ntab')
        req.onsuccess = () => {
          const tx = req.result.transaction('tasks', 'readwrite')
          for (let i = 0; i < n; i++) tx.objectStore('tasks').put({ id: `x${i}`, title: `Tarea larga ${i}`, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: i, createdAt: 1000 + i })
          tx.oncomplete = () => resolve()
        }
      }),
    n,
  )
}

test('listas largas: se pintan por tramos sin perder ninguna, y al volver atrás sigues donde estabas', async ({ page }) => {
  await openApp(page, '/today')
  await inbox(page, 150)
  await page.goto('./#/inbox')
  // Escritas por fuera de la app: hay que recargar para que las lea
  await page.reload()
  await expect(page.locator('[data-splash]')).toHaveCount(0)
  await expect(page.locator('#main [data-task-id]').first()).toBeVisible()
  // Al abrir, solo las primeras
  expect(await page.locator('#main [data-task-id]').count()).toBeLessThan(80)
  // Bajando, llegan todas
  await expect(async () => {
    await page.locator('#main').evaluate((m) => m.scrollBy(0, 4000))
    expect(await page.locator('#main [data-task-id]').count()).toBeGreaterThanOrEqual(150)
  }).toPass({ timeout: 15_000 })
  for (const n of [0, 75, 149]) await expect(page.locator('#main').getByText(`Tarea larga ${n}`, { exact: true })).toBeAttached()

  // A media lista, a otra pantalla y atrás: vuelve a donde estaba
  await page.locator('#main').evaluate((m) => m.scrollTo({ top: 2400 }))
  await page.waitForTimeout(300)
  await page.getByRole('navigation', { name: 'Barra lateral' }).getByRole('link', { name: /Hoy/ }).first().click()
  await expect(page).toHaveURL(/#\/today$/)
  await expect.poll(() => page.locator('#main').evaluate((m) => m.scrollTop)).toBe(0)
  await page.goBack()
  await expect(page).toHaveURL(/#\/inbox$/)
  await expect.poll(() => page.locator('#main').evaluate((m) => Math.round(m.scrollTop / 100))).toBe(24)
  // Ir de nuevo (no atrás) la abre arriba
  await page.getByRole('navigation', { name: 'Barra lateral' }).getByRole('link', { name: /Hoy/ }).first().click()
  await page.getByRole('navigation', { name: 'Barra lateral' }).getByRole('link', { name: /Bandeja/ }).first().click()
  await expect.poll(() => page.locator('#main').evaluate((m) => m.scrollTop)).toBe(0)
})

/** Cada fotograma durante `ms`, lo que devuelva `read` (en la página) */
function everyFrame(page: Page, read: string, ms: number) {
  return page.evaluate(
    ([read, ms]) =>
      new Promise<string[]>((resolve) => {
        const fn = new Function(`return (${read})`) as () => string
        const out: string[] = []
        const t0 = performance.now()
        const f = () => {
          out.push(fn())
          if (performance.now() - t0 < ms) requestAnimationFrame(f)
          else resolve(out)
        }
        requestAnimationFrame(f)
      }),
    [read, ms] as const,
  )
}

test('cambiar de tema: los colores cambian de una vez, sin mezclas del tema viejo y el nuevo', async ({ page }) => {
  await openApp(page, '/settings/apariencia')
  const frames = everyFrame(
    page,
    `document.documentElement.dataset.theme + '|' + [...document.querySelectorAll('#main *')].map((e) => { const c = getComputedStyle(e); return c.color + c.backgroundColor + c.borderTopColor }).join(',')`,
    1200,
  )
  await page.waitForTimeout(100)
  await page.getByRole('radio', { name: 'Claro' }).or(page.locator('[title="Claro"]')).first().click()
  const all = await frames
  const flip = all.findIndex((f) => f.startsWith('light'))
  expect(flip).toBeGreaterThan(0)
  // Desde el primer fotograma con el tema claro, nada sigue cambiando de color
  expect(new Set(all.slice(flip)).size).toBe(1)
})

test.describe('en el móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('al completar una tarea, la casilla no se desmarca antes de que la fila se pliegue', async ({ page }) => {
    await openApp(page, '/today')
    // Para hoy: en Hoy es donde más tarda en llegar la tarea hecha
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const req = indexedDB.open('ntab')
          req.onsuccess = () => {
            const d = new Date()
            const t = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            const tx = req.result.transaction('tasks', 'readwrite')
            for (let i = 0; i < 5; i++) tx.objectStore('tasks').put({ id: `x${i}`, title: `Para hoy ${i}`, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: i, createdAt: 1000 + i, dueDate: t })
            tx.oncomplete = () => resolve()
          }
        }),
    )
    await page.reload()
    const box = page.locator('#main [data-task-id="x2"] [role=checkbox]')
    await box.scrollIntoViewIfNeeded()
    await expect(box).toBeVisible()
    const frames = everyFrame(page, `document.querySelector('[data-task-id="x2"] [role=checkbox]')?.getAttribute('aria-checked') ?? 'fuera'`, 3000)
    await box.tap()
    const states = (await frames).filter((s, i, all) => s !== all[i - 1])
    // Sin marcar → marcada → (la fila se va): nunca vuelve a «sin marcar» por el camino
    expect(states).toEqual(['false', 'true', 'fuera'])
  })

  test('cambiar de pestaña: la transición espera a la pantalla nueva y la fila de pestañas se queda quieta', async ({ page }) => {
    await openApp(page, '/shopping')
    await page.evaluate(() => {
      const w = window as unknown as { __vt: string[] }
      w.__vt = []
      const doc = document as Document & { startViewTransition: (cb: () => unknown) => { ready: Promise<void> } }
      const start = doc.startViewTransition.bind(document)
      doc.startViewTransition = (cb) => {
        const vt = start(cb)
        vt.ready.then(() => {
          w.__vt.push(document.querySelector('#main .screen')?.childElementCount ? 'con contenido' : 'vacía')
          w.__vt.push(`pestañas viejas: ${getComputedStyle(document.documentElement, '::view-transition-old(hubtabs)').opacity}`)
        })
        return vt
      }
    })
    await page.locator('#main nav[aria-label="Casa"] a', { hasText: 'Cosas' }).click()
    await expect(page.locator('#main nav[aria-label="Casa"] [aria-current=page]')).toHaveText('Cosas')
    await expect.poll(() => page.evaluate(() => (window as unknown as { __vt: string[] }).__vt)).toEqual(['con contenido', 'pestañas viejas: 0'])
  })
})
