const CACHE_NAME = 'kerek-v2.53.53';
const CACHE_URLS = [
  // v2.43.5: minden modul start_url-je cache-elve (PWA install criteria)
  '/kerek-rendeles/index.html',
  '/kerek-rendeles/vevo.html',
  '/kerek-rendeles/admin.html',
  '/kerek-rendeles/receptura.html',
  // Közös assets
  '/kerek-rendeles/kerek-styles.css',
  '/kerek-rendeles/kerek-constants.js',
  '/kerek-rendeles/supabase.js',
  '/kerek-rendeles/fonts.css',
  '/kerek-rendeles/img/icon-192.png',
  '/kerek-rendeles/img/icon-512.png',
  '/kerek-rendeles/img/icon-admin-192.png',
  '/kerek-rendeles/img/icon-admin-512.png',
  '/kerek-rendeles/img/logo_teal_vert.png',
  '/kerek-rendeles/img/logo_white_horiz.png',
  '/kerek-rendeles/img/badge-96.png',
  // Vevő modul JS
  '/kerek-rendeles/js/vevo-data.js',
  '/kerek-rendeles/js/vevo-orders-render.js',
  '/kerek-rendeles/js/vevo-orders-actions.js',
  '/kerek-rendeles/js/vevo-orders-extras.js',
  '/kerek-rendeles/js/vevo-ui.js',
  '/kerek-rendeles/js/vevo-analytics.js',
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
  // Skip non-http(s) schemes (chrome-extension:// stb. — a Cache API nem támogatja)
  if (!event.request.url.startsWith('http')) return;

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

  // v2.38.4: requireInteraction:true desktop-on tartósan látszik (nem 3 mp után eltűnik)
  // Mobil OS-ek általában felülbírálják a saját szabályukkal
  event.waitUntil(self.registration.showNotification(data.title || 'KEREK Pékség', {
    body: data.body || '',
    icon: '/kerek-rendeles/img/icon-192.png?v=25310',
    badge: '/kerek-rendeles/img/badge-96.png?v=25310',
    tag: data.tag || 'kerek-notification',
    data: { url: data.url || '/kerek-rendeles/vevo.html', type: data.type },
    requireInteraction: true,  // v2.38.4: tartós megjelenítés desktop Chrome/Firefox-on
    vibrate: data.type === 'modified' ? [200, 100, 200] : [100],
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const type = event.notification.data?.type;
  let url = event.notification.data?.url || '/kerek-rendeles/vevo.html';
  // Admin értesítések (új rendelés / új regisztráció) az admin appot nyitják
  if (type === 'new_order' || type === 'new_client') url = '/kerek-rendeles/admin.html';
  event.waitUntil(clients.openWindow(url));
});
