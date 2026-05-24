const CACHE_NAME = 'kerek-v2.31.0';
const CACHE_URLS = [
  '/kerek-rendeles/vevo.html',
  '/kerek-rendeles/kerek-styles.css',
  '/kerek-rendeles/kerek-constants.js',
  '/kerek-rendeles/supabase.js',
  '/kerek-rendeles/js/vevo-data.js',
  '/kerek-rendeles/js/vevo-orders.js',
  '/kerek-rendeles/js/vevo-ui.js',
  '/kerek-rendeles/js/vevo-analytics.js',
  '/kerek-rendeles/img/icon-192.png',
  '/kerek-rendeles/img/logo_teal_vert.png',
];

// Install: cache core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fallback to cache (with 5xx safety)
self.addEventListener('fetch', event => {
  // Skip Supabase API calls – always network
  if (event.request.url.includes('supabase.co')) return;
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        // H7 fix: if server returned 5xx, treat as failure and use cache
        if (!res || !res.ok) throw new Error('Network response not ok: ' + (res?.status || 'unknown'));
        // Cache successful GET responses
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request).then(cached => cached || new Response('Offline', { status: 503 })))
  );
});

// Push notifications
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'KEREK', body: event.data.text() }; }

  event.waitUntil(self.registration.showNotification(data.title || 'KEREK Pékség', {
    body: data.body || '',
    icon: '/kerek-rendeles/img/icon-192.png',
    badge: '/kerek-rendeles/img/icon-192.png',
    tag: data.tag || 'kerek-notification',
    data: { url: data.url || '/kerek-rendeles/vevo.html' },
    requireInteraction: data.type === 'modified',
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/kerek-rendeles/vevo.html'));
});
