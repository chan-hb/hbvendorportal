/*
 * Service worker for the installable app.
 *
 * It deliberately caches nothing that belongs to a signed-in user: every
 * request goes to the network as normal. The only thing stored is a static
 * offline page, shown when a page navigation fails because the device has no
 * connection. Bump VERSION when offline.html or the icons change.
 */
const VERSION = "hb-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Only page navigations get the offline fallback. Everything else, including
  // API calls, server actions and assets, is left to the browser untouched.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL, { cacheName: VERSION })),
  );
});
