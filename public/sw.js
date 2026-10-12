const CACHE = 'doneday-shell-v1'
const OFFLINE = '/offline.html'
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', OFFLINE, '/manifest.webmanifest']))))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting() })
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response }).catch(() => caches.match(event.request).then(hit => hit || caches.match(OFFLINE))))
})
self.addEventListener('push', event => {
  const payload = event.data ? event.data.json() : {}
  const title = payload.title || 'DoneDay Reminder'
  const body = payload.body || 'You have a scheduled reminder.'
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/icons/doneday-icon.svg', badge: '/icons/doneday-icon.svg', data: { url: payload.url || '/' }, tag: payload.id || 'doneday-reminder', renotify: false }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close(); const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => { const existing = clients.find(client => client.url.startsWith(self.location.origin)); return existing ? existing.focus() : self.clients.openWindow(url) }))
})
