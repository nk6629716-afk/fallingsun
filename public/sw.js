/**
 * SENTINEL PWA Service Worker (sentinel-shell-v2)
 * Provides reliable offline application shell caching and offline launch capabilities.
 *
 * Rules:
 * - Pre-caches application shell, icons, and dynamically discovered JS/CSS bundles.
 * - Navigation fallback to cached /index.html for offline startup and deep routes.
 * - Strictly Network-Only for /api/* and SSE endpoints (/events): cached data is
 *   NEVER returned as if it were fresh live telemetry.
 * - Safe cache versioning and cleanup of obsolete caches on activate.
 */

const CACHE_NAME = 'sentinel-shell-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  '/assets/terrain-default.png',
  '/assets/terrain-blue.png',
];

// Install: Pre-cache static shell assets and extract referenced bundle URLs from index.html
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // 1. Cache baseline static assets
        await Promise.allSettled(
          STATIC_ASSETS.map((url) =>
            fetch(url)
              .then((res) => {
                if (res.ok) return cache.put(url, res);
              })
              .catch((err) => {
                console.warn('[SW] Pre-caching asset skipped:', url, err.message);
              })
          )
        );

        // 2. Scan /index.html for active script and style bundles
        try {
          const indexRes = await fetch('/index.html');
          if (indexRes.ok) {
            const htmlText = await indexRes.clone().text();
            await cache.put('/index.html', indexRes);

            // Extract script and link hrefs
            const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
            const cssRegex = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;

            const bundleUrls = new Set();
            let match;
            while ((match = scriptRegex.exec(htmlText)) !== null) {
              const src = match[1];
              if (src && !src.startsWith('http') && !src.startsWith('//')) {
                bundleUrls.add(src);
              }
            }
            while ((match = cssRegex.exec(htmlText)) !== null) {
              const href = match[1];
              if (href && (href.endsWith('.css') || href.includes('/assets/')) && !href.startsWith('http')) {
                bundleUrls.add(href);
              }
            }

            // Cache discovered bundles
            await Promise.allSettled(
              Array.from(bundleUrls).map(async (bundleUrl) => {
                try {
                  const bRes = await fetch(bundleUrl);
                  if (bRes.ok) await cache.put(bundleUrl, bRes);
                } catch (bErr) {
                  console.warn('[SW] Could not pre-cache bundle:', bundleUrl, bErr.message);
                }
              })
            );
          }
        } catch (scanErr) {
          console.warn('[SW] Precache scan for index.html bundles encountered warning:', scanErr.message);
        }
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: Clean up old versioned caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              console.log('[SW] Deleting legacy cache:', name);
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: Strategic handling per request type
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. NON-GET REQUESTS: Pass through (Network-Only)
  if (req.method !== 'GET') {
    return;
  }

  // 2. API REQUESTS & SSE TELEMETRY STREAM: Strictly Network-Only
  // Requirement: API requests must never return stale cached responses as if they were fresh live data
  if (url.pathname.startsWith('/api') || url.pathname.includes('/events')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'OFFLINE_MODE',
              message: 'Backend network unreachable. Utilizing local IndexedDB tactical storage.',
            },
            meta: {
              isOffline: true,
              timestamp: new Date().toISOString(),
              isSimulated: true,
            },
          }),
          {
            status: 503,
            statusText: 'Service Unavailable (Offline)',
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
    return;
  }

  // 3. NAVIGATION REQUESTS: Network-First with Fallback to Application Shell (Offline Reload)
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(async () => {
          const directMatch = await caches.match(req);
          if (directMatch) return directMatch;
          const shell = await caches.match('/index.html');
          if (shell) return shell;
          const rootMatch = await caches.match('/');
          return rootMatch || new Response(
            '<!DOCTYPE html><html><head><title>SENTINEL Offline</title></head><body><h2>SENTINEL Tactical OS</h2><p>Application shell is loading from local storage...</p></body></html>',
            {
              status: 200,
              headers: { 'Content-Type': 'text/html' },
            }
          );
        })
    );
    return;
  }

  // 4. STATIC ASSETS & VERSIONED CHUNKS: Cache-First with Network fallback and graceful offline recovery
  const isStatic =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.json') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('fonts.googleapis.com');

  if (isStatic) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        if (cachedResponse) {
          // Stale-while-revalidate for un-hashed external assets (e.g. fonts)
          if (!url.pathname.includes('/assets/index-')) {
            fetch(req)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
                }
              })
              .catch(() => {});
          }
          return cachedResponse;
        }

        // Cache miss: fetch from network and store for future offline sessions
        return fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkResponse;
          })
          .catch(() => {
            // Graceful fallback for offline asset misses to avoid unhandled browser crashes
            if (url.pathname.endsWith('.css')) {
              return new Response('/* Offline fallback stylesheet */', {
                status: 200,
                headers: { 'Content-Type': 'text/css' },
              });
            }
            if (url.pathname.endsWith('.js')) {
              return new Response('// Offline fallback module\n', {
                status: 200,
                headers: { 'Content-Type': 'application/javascript' },
              });
            }
            return new Response('', { status: 404, statusText: 'Offline Asset Unavailable' });
          });
      })
    );
    return;
  }

  // 5. DEFAULT: Network-first with Cache fallback
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(req))
  );
});
