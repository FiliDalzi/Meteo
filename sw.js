/* ──────────────────────────────────────────────
   CIELO — Service Worker  v2.1
   Percorsi relativi: compatibile con GitHub Pages
   sia su root (username.github.io) sia su
   sottocartella (username.github.io/cielo-meteo/)
────────────────────────────────────────────── */

const CACHE_VERSION = 'cielo-v2.1';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const API_CACHE     = `${CACHE_VERSION}-api`;

// Ricava il base path dal service worker location
// Es: /cielo-meteo/sw.js → base = /cielo-meteo/
const SW_SCOPE = self.registration.scope; // es. https://user.github.io/cielo-meteo/

// Asset da precachare — usiamo URL assoluti ricavati dallo scope
const STATIC_ASSETS = [
  SW_SCOPE,                        // es. https://.../cielo-meteo/
  SW_SCOPE + 'index.html',
  SW_SCOPE + 'app.js',
  SW_SCOPE + 'manifest.json',
  SW_SCOPE + 'icons/icon-192.png',
  SW_SCOPE + 'icons/icon-512.png',
];

// ── INSTALL ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // addAll con fallback: se un asset fallisce non blocca tutto
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('Cache miss:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('cielo-') && k !== STATIC_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo richieste GET
  if (request.method !== 'GET') return;

  // API meteo: Network First (dati freschi prioritari)
  if (
    url.hostname === 'api.open-meteo.com' ||
    url.hostname === 'nominatim.openstreetmap.org'
  ) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Font Google: Cache First (cambiano raramente)
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdnjs.cloudflare.com'
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Asset locali: Cache First con fallback network
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});

// ── STRATEGIES ───────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.status < 400) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — risorsa non in cache', { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
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
