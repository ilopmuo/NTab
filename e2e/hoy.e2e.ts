import { expect, openApp, quickAdd, test } from './fixtures'
import type { Page } from '@playwright/test'

/** Otro día: con el reloj ya cambiado, salir de Hoy y volver (la app calcula «hoy» al pintar) */
async function reload(page: Page) {
  await page.evaluate(() => (location.hash = '/inbox'))
  await page.locator('#main').waitFor()
  await page.evaluate(() => (location.hash = '/today'))
  await page.locator('#main').waitFor()
}

const dialog = (page: Page, title: string) => page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: title }) })

test('lo importante de hoy: se elige, va arriba y no se repite', async ({ page }) => {
  await openApp(page, '/today')
  for (const t of ['Llamar al banco hoy', 'Enviar el informe hoy', 'Comprar pan hoy']) await quickAdd(page, t)
  // Hoy sugiere una cosa cada vez: primero elegir funciones, luego planificar el día
  // (que ya incluye lo importante) y, hecho eso, «¿Qué es lo importante hoy?»
  await expect(page.getByRole('button', { name: /¿Qué es lo importante hoy\?/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ahora no' }).click()
  await page.getByRole('link', { name: /Planifica tu día/ }).click()
  await page.getByRole('button', { name: /Listo, a por el día/ }).click()
  await expect(page.locator('#main h1').first()).not.toHaveText('Planifica tu día')
  await page.evaluate(() => (location.hash = '/today'))
  await page.getByRole('button', { name: /¿Qué es lo importante hoy\?/ }).click()
  const picker = dialog(page, 'Lo importante de hoy')
  await picker.getByRole('checkbox', { name: /Enviar el informe/ }).click()
  await expect(picker).toContainText('1 de 3')
  await picker.getByRole('button', { name: 'Guardar' }).click()
  await expect(picker).toHaveCount(0)
  const section = page.locator('#main section', { has: page.getByRole('heading', { name: 'Lo importante' }) })
  await expect(section).toContainText('Enviar el informe')
  // Solo una vez en Hoy
  await expect(page.locator('#main [data-task-id]', { hasText: 'Enviar el informe' })).toHaveCount(1)
  // El aviso para elegir ya no sale
  await expect(page.getByRole('button', { name: /¿Qué es lo importante hoy\?/ })).toHaveCount(0)
})

test('pospuesta: al pasarla a otro día varias veces lo dice y propone algún día', async ({ page }) => {
  const day = (d: number) => new Date(`2026-10-0${d}T10:00:00+02:00`)
  await page.clock.setFixedTime(day(1))
  await openApp(page, '/today')
  await quickAdd(page, 'Renovar el DNI hoy')
  for (let d = 1; d <= 3; d++) {
    if (d > 1) {
      await page.clock.setFixedTime(day(d))
      await reload(page)
    }
    await page.locator('#main [data-task-id]', { hasText: 'Renovar el DNI' }).click({ position: { x: 150, y: 10 } })
    await page.locator('aside').getByRole('button', { name: 'Mañana', exact: true }).click()
    await page.keyboard.press('Escape')
  }
  await page.clock.setFixedTime(day(4))
  await reload(page)
  await expect(page.locator('#main [data-task-id]', { hasText: 'Renovar el DNI' })).toContainText('Pospuesta 3 veces')
  // Al cerrar el día, a la que se arrastra se le propone «Algún día»
  await page.evaluate(() => (location.hash = '/shutdown'))
  await expect(page.locator('#main')).toContainText('pospuesta 3 veces: ¿algún día?')
  await page.getByRole('group', { name: 'Renovar el DNI' }).getByRole('button', { name: 'Algún día', exact: true }).click()
  await expect(page.locator('#main')).not.toContainText('Renovar el DNI')
  await page.evaluate(() => (location.hash = '/someday'))
  await expect(page.locator('#main')).toContainText('Renovar el DNI')
})

test('cierre del día: lo hecho, lo que queda a mañana, lo importante de mañana', async ({ page }) => {
  // Jueves 1 de octubre a las 19:00: Hoy propone cerrar el día
  await page.clock.setFixedTime(new Date('2026-10-01T19:00:00+02:00'))
  await openApp(page, '/today')
  await quickAdd(page, 'Llamar al seguro hoy')
  await quickAdd(page, 'Regar las plantas hoy')
  await page.getByRole('checkbox', { name: 'Regar las plantas' }).click()
  await page.getByRole('link', { name: /Cierra el día/ }).click()

  await expect(page.getByRole('heading', { name: 'Cierra el día', level: 1 })).toBeVisible()
  await expect(page.locator('#main')).toContainText('1 tarea')
  await expect(page.locator('#main')).toContainText('Regar las plantas')
  // Con las tareas de bienvenida también hay más cosas: todo a mañana
  await page.getByRole('button', { name: 'Todo a mañana' }).click()
  await expect(page.locator('#main')).toContainText('Nada pendiente de hoy')

  await page.getByRole('button', { name: 'Elegir lo importante' }).click()
  const picker = dialog(page, 'Lo importante de mañana')
  await picker.getByRole('checkbox', { name: /Llamar al seguro/ }).click()
  await picker.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('button', { name: 'Lo importante (1)' })).toBeVisible()

  await page.getByRole('button', { name: 'Cerrar el día' }).click()
  await expect(page).toHaveURL(/#\/today/)
  await expect(page.getByRole('link', { name: /Cierra el día/ })).toHaveCount(0)

  // Mañana sale arriba, como lo importante
  await page.clock.setFixedTime(new Date('2026-10-02T09:00:00+02:00'))
  await reload(page)
  await expect(page.locator('#main section', { has: page.getByRole('heading', { name: 'Lo importante' }) })).toContainText('Llamar al seguro')
})

test('objetivo diario con racha (como Todoist)', async ({ page }) => {
  await openApp(page, '/today')
  await quickAdd(page, 'Sacar la basura hoy')
  await page.getByRole('button', { name: 'Ponte un objetivo diario' }).click()
  const form = dialog(page, 'Objetivo diario')
  for (let i = 0; i < 4; i++) await form.getByRole('button', { name: 'Una tarea menos' }).click()
  await expect(form).toContainText('1tarea al día')
  await form.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.locator('#main')).toContainText('Objetivo: 0/1')
  await page.getByRole('checkbox', { name: 'Sacar la basura' }).click()
  await expect(page.locator('span').filter({ hasText: '¡Objetivo del día cumplido!' })).toBeVisible()
  await expect(page.locator('#main')).toContainText('Objetivo: 1/1')
  await expect(page.locator('#main')).toContainText(/1\s*día/)
})
