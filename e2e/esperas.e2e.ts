import { expect, openApp, test } from './fixtures'
import type { Page } from '@playwright/test'
import { waitKey, type WaitingReply } from '../supabase/functions/_shared/waitReplies'

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

/** Una tarea a la espera con lo que ha visto Hermes en el correo o en Slack */
function waiting(id: string, title: string, who: string, what: string, reply: Partial<WaitingReply>) {
  const wait = { waitingFor: who, waitingSince: inDays(-3), waitingWhat: what }
  const r: WaitingReply = { id: `r-${id}`, source: 'gmail', msg: 'h', from: who, sent: inDays(-1), excerpt: '', kind: 'entregado', why: '', wait: waitKey(wait), via: 'hermes', at: Date.now(), status: 'pendiente', ...reply }
  return { id, title, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: Date.now(), dueDate: inDays(1), ...wait, waitingReplies: [r] }
}

test('una posible respuesta a una espera: se ve, solo se cierra si dices que sí y deshacer respeta lo cambiado después', async ({ page }) => {
  await openApp(page, '/today')
  await seed(page, {
    tasks: [
      waiting('t1', 'Presupuesto del baño', 'Ana', 'el presupuesto', {
        excerpt: 'Te paso el presupuesto adjunto, son 1.200 €.',
        why: 'Ana manda el presupuesto que se esperaba',
        link: 'https://mail.google.com/mail/u/0/#inbox/abc',
      }),
      waiting('t2', 'Factura del taller', 'Luis', 'la factura', { source: 'slack', kind: 'contestado', excerpt: 'Te la mando mañana', why: 'dice que lo hará más adelante' }),
    ],
  })

  // Siguen en A la espera, cada una con su novedad
  await page.evaluate(() => (location.hash = '/waiting'))
  const main = page.locator('#main')
  await expect(main.locator('[data-task-id="t1"]')).toContainText('Esperando a Ana · el presupuesto · 3 días')
  await expect(main.locator('[data-task-id="t1"] [data-wait-news]')).toHaveText('Posible respuesta recibida')
  await expect(main.locator('[data-task-id="t2"] [data-wait-news]')).toHaveText('Ha contestado · aún sin entregar')
  // A Ana (posible entrega sin decidir) no se le insiste; a Luis (solo ha contestado), sí
  await expect(main.getByRole('button', { name: 'Recordárselo' })).toHaveCount(1)

  // En el detalle: de dónde, qué dice y por qué; sin «Recordárselo»
  await main.getByText('Presupuesto del baño').click()
  const detail = page.getByRole('complementary').filter({ hasText: /A la espera|Espera cerrada/ }).last()
  const card = detail.getByRole('group', { name: 'Posible respuesta recibida' })
  await expect(card).toContainText('Gmail, de Ana · Ayer: parece que ha mandado lo que esperabas')
  await expect(card).toContainText('«Te paso el presupuesto adjunto, son 1.200 €.»')
  await expect(card.getByRole('link', { name: 'Abrir el mensaje' })).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#inbox/abc')
  await expect(detail.getByRole('button', { name: 'Recordárselo' })).toHaveCount(0)

  // «Sí, ha llegado»: se cierra y vuelve a hoy
  await card.getByRole('button', { name: 'Sí, ha llegado' }).click()
  await expect(toast(page, 'Ya no esperas a Ana')).toBeVisible()
  await expect(detail).toContainText('Espera cerrada')
  await expect(detail).toContainText('Llegó por Gmail, de Ana · Ayer')
  await expect(detail).toContainText('Hoy ·')
  // Después la pasa al lunes: «Volver a esperar» reabre la espera pero se queda su fecha
  await detail.getByRole('button', { name: 'El lunes' }).click()
  await detail.getByRole('button', { name: 'Volver a esperar' }).click()
  await expect(toast(page, /Vuelves a estar a la espera; se queda tu fecha/)).toBeVisible()
  await expect(detail.getByRole('group', { name: 'Posible respuesta recibida' })).toBeVisible()
  await expect(detail).toContainText('Esperando a Ana')
  await expect(detail.getByRole('button', { name: 'El lunes' })).toHaveAttribute('aria-pressed', 'true')

  // Ciérrala otra vez, escribe una nota y «Deshacer»: vuelve la espera y la nota se queda
  await detail.getByRole('group', { name: 'Posible respuesta recibida' }).getByRole('button', { name: 'Sí, ha llegado' }).click()
  await expect(toast(page, 'Ya no esperas a Ana')).toBeVisible()
  await detail.getByPlaceholder('Notas').fill('Revisar la partida de fontanería')
  await detail.getByPlaceholder('Notas').blur()
  // (el aviso anterior se está yendo: se espera a que quede solo el de cerrarla)
  await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(detail).toContainText('Esperando a Ana')
  await expect(detail.getByPlaceholder('Notas')).toHaveValue('Revisar la partida de fontanería')

  // «Te la mando mañana»: no se da por hecho ni silencia el seguimiento; «No es eso» la descarta
  await page.keyboard.press('Escape')
  await main.getByText('Factura del taller').click()
  const other = page.getByRole('complementary').filter({ hasText: 'Esperando a Luis' }).last()
  const reply = other.getByRole('group', { name: 'Ha contestado · aún sin entregar' })
  await expect(reply).toContainText('Slack, de Luis · Ayer: ha contestado, pero no parece que lo haya mandado')
  await expect(reply.getByRole('button', { name: 'Cerrar la espera' })).toBeVisible()
  await expect(other.getByRole('button', { name: 'Recordárselo' })).toBeVisible()
  await reply.getByRole('button', { name: 'No es eso' }).click()
  await expect(toast(page, 'Descartada: sigues a la espera')).toBeVisible()
  await expect(other.getByRole('group', { name: 'Ha contestado · aún sin entregar' })).toHaveCount(0)
  await expect(main.locator('[data-task-id="t2"] [data-wait-news]')).toHaveCount(0)
})
