import AxeBuilder from '@axe-core/playwright'
import { expect, openApp, quickAdd, test } from './fixtures'

/**
 * Accesibilidad (WCAG 2.1 AA) con axe en las pantallas principales, en los dos
 * temas. Falla con cualquier problema serio o crítico: contraste, controles
 * sin nombre, controles anidados…
 */
// Todas las secciones (las de src/app/sections.tsx), «Más» y Planificar
const PATHS = ['/today', '/upcoming', '/inbox', '/calendar', '/habits', '/routines', '/notes', '/journal', '/menu', '/shopping', '/trackers', '/things', '/people', '/projects', '/tags', '/lists', '/matrix', '/someday', '/waiting', '/meds', '/templates', '/goals', '/expenses', '/finance', '/money', '/accounts', '/insights', '/insights/comer', '/review', '/trash', '/logbook', '/settings', '/settings/avisos', '/settings/apariencia', '/settings/funciones', '/settings/areas', '/settings/calendarios', '/settings/conectar', '/settings/datos', '/plan', '/more']

for (const theme of ['dark', 'light'] as const) {
  test(`sin problemas serios de accesibilidad (tema ${theme === 'dark' ? 'oscuro' : 'claro'})`, async ({ page }) => {
    test.setTimeout(300_000)
    await page.addInitScript((t) => localStorage.setItem('ntab-theme', t), theme)
    await openApp(page)
    await quickAdd(page, 'Llamar al dentista mañana a las 10 #salud')
    await quickAdd(page, 'Revisar el correo')
    // Que se vaya el aviso (a medio desvanecer no tiene su color final)
    await expect(page.locator('.z-\\[60\\] .glass-thick')).toHaveCount(0, { timeout: 8000 })
    const found: string[] = []
    const scan = async (where: string) => {
      // Diálogos ya del todo visibles (con la máquina cargada, las animaciones tardan más)
      await page.waitForFunction(() => Array.from(document.querySelectorAll('[role=dialog]')).every((d) => getComputedStyle(d).opacity === '1'))
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
    await page.keyboard.press('n')
    await page.getByRole('combobox', { name: 'Nueva tarea' }).pressSequentially('Pedir cita #s')
    await expect(page.getByRole('listbox', { name: 'Sugerencias' })).toBeVisible()
    await page.waitForTimeout(500)
    await scan('captura con sugerencias')
    await page.keyboard.press('Escape')
    // Diálogos y menús: funciones, atajos, editor de la barra lateral, un menú abierto
    await page.evaluate(() => (location.hash = '/settings/funciones'))
    await page.getByRole('button', { name: /Elegir funciones/ }).click()
    await page.waitForTimeout(500)
    await scan('funciones')
    await page.keyboard.press('Escape')
    // Los paneles ya están precargados y abren al instante: que se vaya el anterior antes de abrir otro
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog')).toBeVisible()
    // Que termine de aparecer (a medio fundido los textos no tienen su color final)
    await page.waitForTimeout(1000)
    await scan('atajos')
    await page.keyboard.press('Escape')
    await page.evaluate(() => (location.hash = '/tags'))
    await page.getByRole('button', { name: 'Opciones de #salud' }).click()
    await page.waitForTimeout(300)
    await scan('menú de etiqueta')
    await page.keyboard.press('Escape')
    // El menú contextual de una tarea (clic derecho)
    await page.evaluate(() => (location.hash = '/upcoming'))
    await page.locator('#main [data-task-id]', { hasText: 'Llamar al dentista' }).click({ button: 'right', position: { x: 150, y: 10 } })
    await expect(page.getByRole('menu')).toBeVisible()
    await page.waitForTimeout(400)
    await scan('menú de una tarea')
    await page.keyboard.press('Escape')
    expect(found, found.join('\n')).toEqual([])
  })
}

// Otros colores de acento: sus tonos los comprueba accents.test.ts; aquí, cómo quedan en pantalla
for (const [theme, accent, contrast] of [['light', 'pink', ''], ['dark', 'graphite', ''], ['dark', 'blue', 'on']] as const) {
  test(`acento ${accent}${contrast ? ', más contraste,' : ''} en tema ${theme === 'dark' ? 'oscuro' : 'claro'}: sin problemas serios`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.addInitScript(
      ([t, a, c]) => {
        localStorage.setItem('ntab-theme', t)
        localStorage.setItem('ntab-accent', a)
        if (c) localStorage.setItem('ntab-contrast', c)
      },
      [theme, accent, contrast],
    )
    await openApp(page)
    await quickAdd(page, 'Llamar al dentista hoy a las 10 !alta #salud')
    // Que se vaya el aviso (a medio desvanecer no tiene su color final)
    await expect(page.locator('.z-\\[60\\] .glass-thick')).toHaveCount(0, { timeout: 8000 })
    const found: string[] = []
    for (const path of ['/today', '/plan', '/calendar', '/inbox', '/settings', '/settings/apariencia']) {
      await page.evaluate((p) => (location.hash = p), path)
      await expect(page.locator('#main h1').first()).toBeVisible()
      await page.waitForTimeout(600)
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical'))
        for (const n of v.nodes) found.push(`${path} · ${v.id}: ${n.target.join(' ')} → ${n.failureSummary?.split('\n')[1]?.trim() ?? v.help}`)
    }
    expect(found, found.join('\n')).toEqual([])
  })
}
