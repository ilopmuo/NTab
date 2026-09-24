/* Notificaciones push de NTab (lo importa el service worker que genera Workbox). */

const SNOOZE_MINUTES = 15
const TASK_ACTIONS = [
  { action: 'done', title: 'Hecho' },
  { action: 'snooze', title: 'Posponer ' + SNOOZE_MINUTES + ' min' },
]
const HABIT_ACTIONS = [{ action: 'habit-done', title: 'Hecho' }]

/** ¿La app abierta ya dio este aviso en este dispositivo? (ver src/reminders/local.ts) */
async function alertedHere(key) {
  if (!key) return false
  try {
    const cache = await caches.open('ntab-alerted')
    const hit = await cache.match(new URL('./__alerted/' + key, self.registration.scope).href)
    if (!hit) return false
    const at = Number(await hit.text())
    return Date.now() - at < 60 * 60 * 1000
  } catch (e) {
    return false
  }
}

async function showPush(title, options, key) {
  if (!(await alertedHere(key))) return self.registration.showNotification(title, options)
  // La app ya avisó: nada de volver a sonar. Hay que mostrar algo por cada push,
  // así que se muestra en silencio con la misma etiqueta (sustituye a la anterior)
  // y, si el usuario ya la había quitado, se retira al momento.
  const before = await self.registration.getNotifications({ tag: options.tag })
  await self.registration.showNotification(title, { ...options, silent: true, renotify: false })
  if (!before.length) {
    const now = await self.registration.getNotifications({ tag: options.tag })
    now.forEach((n) => n.close())
  }
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'NTab', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'NTab'
  const taskId = data.taskId || (data.tag && data.tag.startsWith('tasks-') ? data.tag.slice(6) : undefined)
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: true,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: data.url || './#/today', taskId, habitId: data.habitId },
    actions: taskId ? TASK_ACTIONS : data.habitId ? HABIT_ACTIONS : [],
  }
  event.waitUntil(showPush(title, options, data.key || data.tag))
})

/** Botón "Hecho" / "Posponer": si la app está abierta lo hace ella; si no, se abre para hacerlo */
async function runAction(action, id, kind) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (windows.length) {
    windows[0].postMessage({ type: 'reminder-action', action, id })
    return
  }
  const url = new URL('./#/' + kind + '/' + encodeURIComponent(id) + '/' + action, self.registration.scope).href
  return self.clients.openWindow(url)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  if ((event.action === 'done' || event.action === 'snooze') && data.taskId) {
    event.waitUntil(runAction(event.action, data.taskId, 'task'))
    return
  }
  if (event.action === 'habit-done' && data.habitId) {
    event.waitUntil(runAction('habit-done', data.habitId, 'habit'))
    return
  }
  const url = new URL(data.url || './#/today', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w) {
          w.navigate ? w.navigate(url) : null
          return w.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
