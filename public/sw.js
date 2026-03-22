const CACHE_NAME = 'kentuos-pwa-v5';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through di base per abilitare i criteri PWA
  event.respondWith(
    fetch(event.request).catch(() => new Response('Offline Mode'))
  );
});
