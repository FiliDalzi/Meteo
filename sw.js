/* ──────────────────────────────────────────────
   CIELO — Service Worker  |  sw.js
   Strategia: Cache First per assets, Network First per API
────────────────────────────────────────────── */

const CACHE_VERSION = 'cielo-v1.2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE    = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── INSTALL ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('cielo-') && k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: Network First, fallback to cache
  if (url.hostname === 'api.open-meteo.com' || url.hostname === 'nominatim.openstreetmap.org') {
    event.respondWith(networkFirst(request, API_CACHE, 300)); // 5 min TTL
    return;
  }

  // Fonts & external: Cache First
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Static assets: Cache First
  if (request.method === 'GET') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

// ── STRATEGIES ───────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request, cacheName, maxAgeSeconds) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      const responseToCache = response.clone();
      // Tag with timestamp
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-at', Date.now().toString());
      cache.put(request, new Response(await responseToCache.blob(), {
        status: responseToCache.status,
        headers,
      }));
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── BACKGROUND SYNC (refresh ogni 30 min) ────
self.addEventListener('periodicsync', event => {
  if (event.tag === 'weather-refresh') {
    event.waitUntil(
      // Svuota la cache API per forzare refresh
      caches.open(API_CACHE).then(cache => cache.keys().then(keys =>
        Promise.all(keys.map(k => cache.delete(k)))
      ))
    );
  }
});

// ── PUSH NOTIFICATIONS (predisposto) ─────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Cielo Meteo', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    })
  );
});
