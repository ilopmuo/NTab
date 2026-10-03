import { expect, openApp, test } from './fixtures'
import type { Page } from '@playwright/test'

/** Un área con un proyecto, otro proyecto suelto y tareas; o `many` tareas en la Bandeja */
async function seed(page: Page, many = 0) {
  await page.evaluate(
    (many) =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('ntab')
        req.onsuccess = () => {
          const tx = req.result.transaction(['projects', 'areas', 'tasks'], 'readwrite')
          tx.objectStore('areas').put({ id: 'a1', name: 'Casa', icon: 'home', color: 'gray', order: 1, createdAt: 1 })
          tx.objectStore('projects').put({ id: 'p1', name: 'Mudanza', description: '', status: 'active', color: '#0A84FF', order: 1, createdAt: 1, areaId: 'a1' })
          tx.objectStore('projects').put({ id: 'p2', name: 'Viaje a Lisboa', description: '', status: 'active', color: '#0A84FF', order: 2, createdAt: 1 })
          const task = (id: string, title: string, extra = {}) => ({ id, title, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 1, createdAt: 1, ...extra })
          tx.objectStore('tasks').put(task('m1', 'Comprar cajas', { projectId: 'p1' }))
          tx.objectStore('tasks').put(task('m2', 'Dar de baja la luz', { projectId: 'p1' }))
          tx.objectStore('tasks').put(task('i1', 'Revisar el contrato'))
          for (let i = 0; i < many; i++) tx.objectStore('tasks').put(task(`n${i}`, i === many - 30 ? 'Llamar al fontanero' : `Tarea número ${i}`, { createdAt: i }))
          tx.oncomplete = () => resolve()
        }
      }),
    many,
  )
  await page.reload()
  await expect(page.locator('[data-splash]')).toHaveCount(0)
}

test('⌘K busca entre miles de tareas al momento, resalta lo buscado y dice cuántas hay', async ({ page }) => {
  await openApp(page, '/today')
  await seed(page, 700)
  await page.keyboard.press('Control+k')
  const input = page.locator('[cmdk-input]')
  // La que está más allá de las 500 primeras también sale
  await input.fill('fontan')
  const hit = page.getByRole('option', { name: /Llamar al fontanero/ })
  await expect(hit).toBeVisible()
  await expect(hit.locator('mark')).toHaveText('fontan')
  // Con muchas, las mejores y cuántas hay en total
  await input.fill('tarea')
  await expect(page.getByText(/^12 de 7\d\d$/)).toBeVisible()
  await expect(page.getByRole('group', { name: /^Tareas 12 de/ }).getByRole('option')).toHaveCount(12)
  // Sin acentos y por el principio de cada palabra
  await input.fill('numero 69')
  await expect(page.getByRole('option', { name: 'Tarea número 69', exact: true })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue(/Tarea número 69/)
})

test('«‹ Atrás» vuelve a la pantalla de la que vienes o, si se abrió directamente, a la de arriba', async ({ page }) => {
  await openApp(page, '/projects')
  await seed(page)
  await page.evaluate(() => (location.hash = '/today'))
  await page.evaluate(() => (location.hash = '/projects'))
  await page.locator('#main').getByText('Viaje a Lisboa').click()
  await expect(page.locator('#main h1')).toHaveText('Viaje a Lisboa')
  // Las pantallas de la barra no tienen «atrás»; dentro de algo, sí, con el nombre de la anterior
  await page.getByRole('button', { name: 'Volver a Proyectos' }).click()
  await expect(page.locator('#main h1')).toHaveText('Proyectos')
  await expect(page.getByRole('button', { name: /^Volver a/ })).toHaveCount(0)

  // Abierto directamente (un enlace, un aviso): lleva a lo de arriba, su área
  await page.goto('./#/project/p1')
  await page.reload()
  await expect(page.locator('#main h1')).toHaveText('Mudanza')
  await page.getByRole('button', { name: 'Volver a Casa' }).click()
  await expect(page.locator('#main h1')).toContainText('Casa')
})

test.describe('en el móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('deslizar desde el borde izquierdo vuelve atrás; si no se llega, la pantalla regresa', async ({ page }) => {
    await openApp(page, '/projects')
    await seed(page)
    await page.locator('#main').getByText('Viaje a Lisboa').click()
    await expect(page.locator('#main h1')).toHaveText('Viaje a Lisboa')
    const swipe = (to: number, step: number) =>
      page.evaluate(
        async ([to, step]) => {
          const strip = document.querySelector<HTMLElement>('div.fixed.touch-pan-y')!
          const ev = (type: string, x: number) => (type === 'pointerdown' ? strip : window).dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: 9, clientX: x, clientY: 420, isPrimary: true }))
          ev('pointerdown', 4)
          for (let x = 12; x <= to; x += step) {
            ev('pointermove', x)
            await new Promise((r) => setTimeout(r, 30))
          }
          ev('pointerup', to)
        },
        [to, step],
      )
    // Poco y despacio: vuelve a su sitio
    await swipe(80, 6)
    await page.waitForTimeout(500)
    await expect(page.locator('#main h1')).toHaveText('Viaje a Lisboa')
    await expect(page.locator('#main .screen')).toHaveAttribute('style', /^(?!.*translate3d\((?!0px))/)
    // Pasado un tercio: atrás
    await swipe(260, 24)
    await expect(page.locator('#main h1')).toHaveText('Proyectos')
  })

  test('pulsación larga en una tarea: menú con lo de siempre', async ({ page }) => {
    await openApp(page, '/inbox')
    await seed(page)
    await page.evaluate(() => (location.hash = '/inbox'))
    await expect(page.locator('#main [data-task-id]', { hasText: 'Revisar el contrato' })).toBeVisible()
    await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('#main [data-task-id]')!
      const r = row.getBoundingClientRect()
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 4, clientX: r.left + 150, clientY: r.top + 15, isPrimary: true }))
    })
    const menu = page.getByRole('menu', { name: /Revisar el contrato/ })
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Mañana' }).click()
    await expect(menu).toHaveCount(0)
    // Con fecha, sale de la Bandeja
    await expect(page.locator('#main [data-task-id]', { hasText: 'Revisar el contrato' })).toHaveCount(0)
    await expect(page.locator('span').filter({ hasText: /Revisar el contrato → mañana/ }).first()).toBeVisible()
  })

  test('una hoja se cierra arrastrando hacia abajo desde su contenido, no solo del asa', async ({ page }) => {
    await openApp(page, '/today')
    await page.keyboard.press('Control+k')
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    await sheet.evaluate(async (el) => {
      const target = el.querySelector('[cmdk-list]') ?? el
      const touch = (y: number) => new Touch({ identifier: 1, target, clientX: 200, clientY: y })
      const fire = (type: string, y: number) => target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch(y)], changedTouches: [touch(y)] }))
      fire('touchstart', 300)
      for (let y = 310; y <= 520; y += 30) {
        fire('touchmove', y)
        await new Promise((r) => setTimeout(r, 16))
      }
      fire('touchend', 520)
    })
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test('clic derecho en una tarea: el menú sale donde se hizo clic y se maneja con el teclado', async ({ page }) => {
  await openApp(page, '/inbox')
  await seed(page)
  await page.evaluate(() => (location.hash = '/inbox'))
  const row = page.locator('#main [data-task-id]', { hasText: 'Revisar el contrato' })
  await row.click({ button: 'right', position: { x: 160, y: 12 } })
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Hecha' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Hoy', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  // Duplicar
  await row.click({ button: 'right', position: { x: 160, y: 12 } })
  await page.getByRole('menuitem', { name: 'Duplicar' }).click()
  await expect(page.locator('#main [data-task-id]', { hasText: 'Revisar el contrato (copia)' })).toBeVisible()
})
