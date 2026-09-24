/* Notificaciones push de NTab (lo importa el service worker que genera Workbox). */

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
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: data.url || './#/today' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
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
