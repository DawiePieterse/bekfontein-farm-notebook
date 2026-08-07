// App-shell cache so the notebook PWA still loads (and can capture new
// entries) with zero signal. Data (entries, tags, photos) always goes over
// the network when available - this only guarantees the UI itself is
// installable/offline. See idb.js/app.js for the actual offline-capture and
// sync logic.
const CACHE = "nb-app-v4";
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./idb.js",
  "./manifest.json",
  "../shared/styles.css",
  "../shared/api.js",
  "../shared/tailwind.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/photos/")) return; // never cache API/photo data
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});
