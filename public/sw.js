// DriftGrid service worker — minimal, just enables PWA installability.
// No offline caching (the app requires a live server for API calls).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass all fetches straight through to the network.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
