import { expect, openApp, quickAdd, test } from './fixtures'
import type { Page } from '@playwright/test'

const modal = (page: Page) => page.getByRole('dialog', { name: 'Modo foco' })

/** Adelanta el reloj del foco en marcha: le quedan 3 s (y lleva casi 25 min) */
async function almostDone(page: Page) {
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ntab-focus')!)
    const now = Date.now()
    localStorage.setItem('ntab-focus', JSON.stringify({ ...s, endAt: now + 3000, runStart: now - 25 * 60_000 + 3000, spent: 0, logged: 0 }))
  })
  await page.reload()
  await page.locator('#main').waitFor()
  await expect(page.locator('[data-splash]')).toHaveCount(0)
}

test('foco libre: apuntar algo para luego sin dejarlo, sonido de fondo y salir', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await openApp(page, '/focus')
  await page.getByLabel('¿En qué te vas a concentrar?').fill('Estudiar el tema 3')
  await page.locator('#main').getByRole('button', { name: 'Empezar' }).click()
  await expect(modal(page).getByRole('heading', { name: 'Estudiar el tema 3' })).toBeVisible()
  await expect(modal(page)).toContainText('Concéntrate en esto')
  await expect(modal(page)).toContainText('Pomodoro 1 de 4')

  // Lo que se pasa por la cabeza, a la Bandeja
  await modal(page).getByRole('button', { name: 'Apuntar algo para luego' }).click()
  await modal(page).getByLabel('Apuntar para luego').fill('Llamar al banco')
  await modal(page).getByLabel('Apuntar para luego').press('Enter')
  await expect(page.locator('span').filter({ hasText: 'Para luego: Llamar al banco · en la Bandeja' }).first()).toBeVisible()
  await expect(modal(page).getByRole('button', { name: /Apuntar algo para luego · 1/ })).toBeVisible()

  // Sonido de fondo
  await modal(page).getByRole('button', { name: 'Sonido' }).click()
  await modal(page).getByRole('button', { name: 'Marrón' }).click()
  // (el botón de arriba también se llama así ahora)
  await expect(modal(page).getByRole('button', { name: 'Marrón' }).last()).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ntab-focus-sound')!).kind)).toBe('brown')

  await modal(page).getByRole('button', { name: 'Salir' }).click()
  await expect(modal(page)).toHaveCount(0)
  await page.evaluate(() => (location.hash = '/inbox'))
  await expect(page.locator('#main [data-task-id]', { hasText: 'Llamar al banco' })).toBeVisible()
})

test('pomodoro con una tarea: valorar, descanso, otro pomodoro y el foco en la tarea', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await openApp(page, '/today')
  await quickAdd(page, 'Preparar la charla hoy ~1h')
  await page.evaluate(() => (location.hash = '/focus'))
  await page.locator('#main').getByRole('button', { name: 'Preparar la charla' }).click()
  await expect(modal(page).getByRole('heading', { name: 'Preparar la charla' })).toBeVisible()

  await almostDone(page)
  await expect(modal(page)).toContainText('¡Pomodoro!', { timeout: 8000 })
  await expect(modal(page)).toContainText('Pomodoro 1 de 4')
  await modal(page).getByRole('radio', { name: 'Muy concentrado' }).click()
  await expect(modal(page).getByRole('radio', { name: 'Muy concentrado' })).toHaveAttribute('aria-checked', 'true')

  // Descanso y vuelta
  await modal(page).getByRole('button', { name: 'Descanso · 5 min' }).click()
  await expect(modal(page)).toContainText('Descanso')
  await expect(modal(page)).toContainText('Levántate y estira la espalda')
  await modal(page).getByRole('button', { name: 'Saltar el descanso' }).click()
  await expect(modal(page)).toContainText('Pomodoro 2 de 4')
  await modal(page).getByRole('button', { name: 'Salir' }).click()
  await expect(modal(page)).toHaveCount(0)

  // En Foco: la sesión, la valoración y el objetivo del día
  await expect(page.locator('#main')).toContainText('Hoy, 25 min · 1 pomodoro')
  await expect(page.locator('#main')).toContainText('Preparar la charla')
  await page.locator('#main').getByRole('button', { name: '1 h', exact: true }).click()
  await expect(page.locator('#main')).toContainText('de 1 h')

  // Y en la tarea, frente a lo estimado
  await page.evaluate(() => (location.hash = '/today'))
  await page.locator('#main [data-task-id]', { hasText: 'Preparar la charla' }).click()
  await expect(page.getByText('25 min · 1 pomodoro · estimada en 1 h')).toBeVisible()
})
