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

/** La tarea tal y como está guardada (para comprobar lo que queda, no solo lo que se ve) */
async function stored(page: Page, id: string) {
  return page.evaluate(
    (key) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const req = indexedDB.open('ntab')
        req.onsuccess = () => {
          const get = req.result.transaction('tasks').objectStore('tasks').get(key)
          get.onsuccess = () => (req.result.close(), resolve(get.result))
        }
      }),
    id,
  )
}
const replyOf = (t: Record<string, unknown>) => (t.waitingReplies as WaitingReply[])[0]

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inDays = (n: number) => ymd(new Date(Date.now() + n * 864e5))

/** Una tarea a la espera con lo que ha visto Hermes en el correo o en Slack */
function waiting(id: string, title: string, who: string, what: string, reply: Partial<WaitingReply>) {
  const wait = { waitingFor: who, waitingSince: inDays(-3), waitingWhat: what }
  const r: WaitingReply = { id: `r-${id}`, source: 'gmail', msg: 'h', from: who, sent: inDays(-1), excerpt: '', kind: 'entregado', why: '', wait: waitKey(wait), via: 'hermes', at: Date.now(), status: 'pendiente', ...reply }
  return { id, title, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: Date.now(), dueDate: inDays(1), ...wait, waitingReplies: [r] }
}

test('una posible respuesta a una espera: se ve, solo se cierra la elegida si dices que sí y deshacer respeta lo cambiado después', async ({ page }) => {
  await openApp(page, '/today')
  await seed(page, {
    tasks: [
      waiting('t1', 'Presupuesto del baño', 'Ana', 'el presupuesto', {
        excerpt: 'Te paso el presupuesto adjunto, son 1.200 €.',
        why: 'Ana manda el presupuesto que se esperaba',
        link: 'https://mail.google.com/mail/u/0/#inbox/abc',
      }),
      waiting('t2', 'Factura del taller', 'Luis', 'la factura', { source: 'slack', kind: 'contestado', excerpt: 'Te la mando mañana', why: 'dice que lo hará más adelante' }),
      // Le tocaba preguntar hoy: una posible coincidencia no lo cambia
      { ...waiting('t3', 'Contrato del piso', 'Marta', 'el contrato', { kind: 'dudoso', excerpt: '¿Quedamos el viernes?', why: 'no menciona el contrato' }), dueDate: inDays(0) },
    ],
  })
  const main = page.locator('#main')

  await test.step('entregado pendiente pausa el seguimiento; contestado y dudoso lo mantienen', async () => {
    // Le tocaba hoy: sigue en Hoy aunque haya una posible coincidencia
    await expect(main.locator('[data-task-id="t3"]')).toBeVisible()
    await expect(main.locator('[data-task-id="t3"] [data-wait-news]')).toHaveText('Posible coincidencia')
    await page.evaluate(() => (location.hash = '/waiting'))
    await expect(main.locator('[data-task-id="t1"]')).toContainText('Esperando a Ana · el presupuesto · 3 días')
    await expect(main.locator('[data-task-id="t1"] [data-wait-news]')).toHaveText('Posible respuesta recibida')
    await expect(main.locator('[data-task-id="t2"] [data-wait-news]')).toHaveText('Ha contestado · aún sin entregar')
    // «Recordárselo» para Luis y para Marta, no para Ana
    const nudges = main.getByRole('button', { name: 'Recordárselo' })
    await expect(nudges).toHaveCount(2)
    const group = (who: string) => main.locator('section').filter({ has: page.getByRole('heading', { name: who, exact: true }) })
    await expect(group('Ana').getByRole('button', { name: 'Recordárselo' })).toHaveCount(0)
    await expect(group('Luis').getByRole('button', { name: 'Recordárselo' })).toHaveCount(1)
    await expect(group('Marta').getByRole('button', { name: 'Recordárselo' })).toHaveCount(1)
  })

  const detail = page.getByRole('complementary').filter({ hasText: /A la espera|Espera cerrada/ }).last()
  const card = detail.getByRole('group', { name: 'Posible respuesta recibida' })

  await test.step('el detalle enseña la entrega propuesta, sin «Recordárselo»', async () => {
    await main.getByText('Presupuesto del baño').click()
    await expect(card).toContainText('Gmail, de Ana · Ayer: parece que ha mandado lo que esperabas')
    await expect(card).toContainText('«Te paso el presupuesto adjunto, son 1.200 €.»')
    await expect(card.getByRole('link', { name: 'Abrir el mensaje' })).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#inbox/abc')
    await expect(detail.getByRole('button', { name: 'Recordárselo' })).toHaveCount(0)
  })

  await test.step('confirmar cierra solo la espera elegida', async () => {
    const [luis, marta] = [await stored(page, 't2'), await stored(page, 't3')]
    await card.getByRole('button', { name: 'Sí, ha llegado' }).click()
    await expect(toast(page, 'Ya no esperas a Ana')).toBeVisible()
    await expect(detail).toContainText('Espera cerrada')
    await expect(detail).toContainText('Llegó por Gmail, de Ana · Ayer')
    await expect(detail).toContainText('Hoy ·')
    const ana = await stored(page, 't1')
    expect(ana.waitingFor).toBeUndefined()
    expect(replyOf(ana).status).toBe('confirmada')
    // Las otras dos, tal cual
    expect(await stored(page, 't2')).toEqual(luis)
    expect(await stored(page, 't3')).toEqual(marta)
    await expect(main.locator('[data-task-id="t2"]')).toContainText('Esperando a Luis')
    await expect(main.locator('[data-task-id="t3"]')).toContainText('Esperando a Marta')
  })

  await test.step('«Volver a esperar» conserva la fecha editada después del cierre', async () => {
    await detail.getByRole('button', { name: 'El lunes' }).click()
    await expect.poll(async () => (await stored(page, 't1')).dueDate).not.toBe(inDays(0))
    const monday = (await stored(page, 't1')).dueDate
    await detail.getByRole('button', { name: 'Volver a esperar' }).click()
    await expect(toast(page, /Vuelves a estar a la espera; se queda tu fecha/)).toBeVisible()
    await expect(detail.getByRole('group', { name: 'Posible respuesta recibida' })).toBeVisible()
    await expect(detail).toContainText('Esperando a Ana')
    await expect(detail.getByRole('button', { name: 'El lunes' })).toHaveAttribute('aria-pressed', 'true')
    expect(await stored(page, 't1')).toMatchObject({ waitingFor: 'Ana', dueDate: monday })
  })

  await test.step('«Deshacer» (el botón del aviso) conserva las notas escritas después', async () => {
    await card.getByRole('button', { name: 'Sí, ha llegado' }).click()
    await expect(toast(page, 'Ya no esperas a Ana')).toBeVisible()
    await detail.getByPlaceholder('Notas').fill('Revisar la partida de fontanería')
    await detail.getByPlaceholder('Notas').blur()
    await expect.poll(async () => (await stored(page, 't1')).notes).toBe('Revisar la partida de fontanería')
    // (el aviso anterior se está yendo: se espera a que quede solo el de cerrarla)
    await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(detail).toContainText('Esperando a Ana')
    await expect(detail.getByPlaceholder('Notas')).toHaveValue('Revisar la partida de fontanería')
    expect(await stored(page, 't1')).toMatchObject({ waitingFor: 'Ana', notes: 'Revisar la partida de fontanería' })
  })

  await test.step('«Deshacer» conserva título, notas y fecha cambiados después', async () => {
    await card.getByRole('button', { name: 'Sí, ha llegado' }).click()
    await expect(toast(page, 'Ya no esperas a Ana')).toBeVisible()
    await detail.getByPlaceholder('Título').fill('Revisar el presupuesto del baño')
    await detail.getByPlaceholder('Notas').fill('Pedir una segunda opinión')
    await detail.getByPlaceholder('Notas').blur()
    await detail.getByRole('button', { name: 'Mañana' }).click()
    await expect.poll(async () => {
      const t = await stored(page, 't1')
      return [t.title, t.notes, t.dueDate]
    }).toEqual(['Revisar el presupuesto del baño', 'Pedir una segunda opinión', inDays(1)])
    // El mismo «Deshacer» del aviso, con ⌘Z (dura un minuto: no depende de lo que tarde en guardarse lo escrito)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(toast(page, /Deshecho\. Se queda la fecha que pusiste después/)).toBeVisible()
    await expect(detail).toContainText('Esperando a Ana')
    const t = await stored(page, 't1')
    expect(t).toMatchObject({ title: 'Revisar el presupuesto del baño', notes: 'Pedir una segunda opinión', dueDate: inDays(1), waitingFor: 'Ana', waitingWhat: 'el presupuesto' })
    // La propuesta vuelve a estar pendiente tal y como estaba antes de cerrarla. El extracto ya no
    // está: se borró en el primer cierre (datos mínimos) y «Volver a esperar» no lo recupera
    expect(replyOf(t)).toMatchObject({ status: 'pendiente', kind: 'entregado' })
    expect(replyOf(t).excerpt).toBeUndefined()
    await expect(card).toBeVisible()
  })

  await test.step('«Te la mando mañana»: no se da por hecho ni silencia el seguimiento; «No es eso» la descarta', async () => {
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
    expect(await stored(page, 't2')).toMatchObject({ waitingFor: 'Luis', dueDate: inDays(1) })
  })

  await test.step('la posible coincidencia deja preguntar a Marta desde el detalle', async () => {
    await page.keyboard.press('Escape')
    await main.getByText('Contrato del piso').click()
    const marta = page.getByRole('complementary').filter({ hasText: 'Esperando a Marta' }).last()
    await expect(marta.getByRole('group', { name: 'Posible coincidencia' })).toContainText('puede tener que ver, pero no está claro')
    await expect(marta.getByRole('button', { name: 'Recordárselo' })).toBeVisible()
  })
})
