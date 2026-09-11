/*
 * SetoffIQ service worker.
 *
 * Scope is deliberately small: keep the app shell openable offline, and let
 * every external data request go straight to the network so nothing stale is
 * ever presented as current. The app itself decides what to do when data is
 * missing — the service worker must not quietly answer for it.
 */
const VERSION = 'setoffiq-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Notifications are shown from here (Android Chrome allows no other way), so
// a tap has to be handled here too: bring SetoffIQ forward on that journey.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const journeyId = event.notification.data?.journeyId;
  const target = new URL(journeyId ? `./#/journeys/${journeyId}` : './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url.startsWith(self.registration.scope));
      // navigate() rejects for a window this worker does not control; focusing
      // it without moving is still better than doing nothing.
      if (open) {
        return open
          .navigate(target)
          .then((client) => (client ?? open).focus())
          .catch(() => open.focus());
      }
      return self.clients.openWindow(target);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Anything off-origin is live data. Never serve a cached answer for it.
  if (url.origin !== self.location.origin) return;

  // The flight snapshot is live data too, even though it is same-origin.
  if (url.pathname.includes('/data/flights/')) {
    event.respondWith(fetch(request).catch(() => caches.match(request).then((hit) => hit ?? Response.error())));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('./index.html').then((hit) => hit ?? Response.error()),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});
