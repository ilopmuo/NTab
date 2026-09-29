import AxeBuilder from '@axe-core/playwright'
import { expect, openApp, quickAdd, test } from './fixtures'

/**
 * Accesibilidad (WCAG 2.1 AA) con axe en las pantallas principales, en los dos
 * temas. Falla con cualquier problema serio o crítico: contraste, controles
 * sin nombre, controles anidados…
 */
const PATHS = ['/today', '/inbox', '/upcoming', '/calendar', '/habits', '/notes', '/shopping', '/plan', '/people', '/projects', '/expenses', '/journal', '/settings']

for (const theme of ['dark', 'light'] as const) {
  test(`sin problemas serios de accesibilidad (tema ${theme === 'dark' ? 'oscuro' : 'claro'})`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.addInitScript((t) => localStorage.setItem('ntab-theme', t), theme)
    await openApp(page)
    await quickAdd(page, 'Llamar al dentista mañana a las 10 #salud')
    await quickAdd(page, 'Revisar el correo')
    const found: string[] = []
    const scan = async (where: string) => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical'))
        for (const n of v.nodes) found.push(`${where} · ${v.id}: ${n.target.join(' ')} → ${n.failureSummary?.split('\n')[1]?.trim() ?? v.help}`)
    }
    for (const path of PATHS) {
      await page.evaluate((p) => (location.hash = p), path)
      await expect(page.locator('#main h1').first()).toBeVisible()
      // Que terminen las animaciones de entrada (el texto a medio aparecer no tiene su color final)
      await page.waitForTimeout(600)
      await scan(path)
    }
    // Paneles: detalle de tarea, paleta y captura rápida
    await page.evaluate(() => (location.hash = '/upcoming'))
    await page.locator('#main [data-task-id]', { hasText: 'Llamar al dentista' }).click({ position: { x: 150, y: 10 } })
    await page.waitForTimeout(600)
    await scan('detalle')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(500)
    await scan('⌘K')
    await page.keyboard.press('Escape')
    expect(found, found.join('\n')).toEqual([])
  })
}
