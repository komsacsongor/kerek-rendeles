// KEREK Service Worker – Web Push handler
self.addEventListener('push', function(event) {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'KEREK', body: event.data.text() }; }

  const title = data.title || 'KEREK Pékség';
  const options = {
    body: data.body || '',
    icon: '/kerek-rendeles/img/logo_teal_vert.png',
    badge: '/kerek-rendeles/img/logo_teal_vert.png',
    tag: data.tag || 'kerek-notification',
    data: { url: data.url || '/kerek-rendeles/vevo.html' },
    requireInteraction: data.type === 'modified',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/kerek-rendeles/vevo.html';
  event.waitUntil(clients.openWindow(url));
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
