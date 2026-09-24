/* Notificaciones push de NTab (lo importa el service worker que genera Workbox). */

/** ¿La app abierta ya dio este aviso hace poco en este dispositivo? (ver src/reminders/local.ts) */
async function alertedHere(tag) {
  if (!tag) return false
  try {
    const cache = await caches.open('ntab-alerted')
    const hit = await cache.match(new URL('./__alerted/' + tag, self.registration.scope).href)
    if (!hit) return false
    const at = Number(await hit.text())
    return Date.now() - at < 30 * 60 * 1000
  } catch (e) {
    return false
  }
}

async function showPush(title, options) {
  if (!(await alertedHere(options.tag))) return self.registration.showNotification(title, options)
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
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: true,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: data.url || './#/today' },
  }
  event.waitUntil(showPush(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || './#/today', self.registration.scope).href
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
