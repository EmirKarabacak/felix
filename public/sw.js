// Felix's service worker: it only shows phone alerts and opens Felix when one
// is tapped. It caches nothing, so a new version of Felix is never held back.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || 'Felix', {
        body: data.body || '',
        tag: data.tag,
        icon: '/icon-192.png',
        data: { url: data.url || '/' },
      })
      // The number on the app's icon, where the phone shows one.
      if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
        try {
          await self.navigator.setAppBadge(data.badge)
        } catch (e) {}
      }
      // An open Felix refreshes its bell straight away.
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      open.forEach((client) => client.postMessage({ type: 'felix-bildirim' }))
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of open) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        client.postMessage({ type: 'felix-ac', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
