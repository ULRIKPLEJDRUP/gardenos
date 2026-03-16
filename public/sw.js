// ---------------------------------------------------------------------------
// GardenOS – Service Worker (minimal offline-capable PWA shell)
// ---------------------------------------------------------------------------
const CACHE_NAME = "gardenos-v8";
const PRECACHE_URLS = [
  "/",
  "/login",
  "/manifest.json",
];

// Install: pre-cache shell — force immediate activation
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: delete ALL old caches, claim clients, then force-reload every open tab
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
    .then(() => self.clients.claim())
    .then(() =>
      // Tell every open tab to hard-reload so they get fresh code
      self.clients.matchAll({ type: "window" }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: "SW_UPDATED", version: CACHE_NAME });
        }
      })
    )
  );
});

// Listen for SKIP_WAITING message from the page so new SW activates immediately
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch: ALWAYS network-first for HTML and _next/ assets.
// Only use cache as offline fallback.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET and API / auth requests
  if (request.method !== "GET") return;
  if (request.url.includes("/api/")) return;

  // For navigation requests – network first, fall back to cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // For _next/ assets – network first, cache fallback
  if (request.url.includes("/_next/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // For other static assets (images, fonts) – network first too (safer)
  if (
    request.url.match(/\.(png|jpg|jpeg|svg|ico|woff2?)(\?.*)?$/)
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
});
