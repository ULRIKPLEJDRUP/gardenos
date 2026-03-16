// ---------------------------------------------------------------------------
// GardenOS – Service Worker (minimal offline-capable PWA shell)
// ---------------------------------------------------------------------------
const CACHE_NAME = "gardenos-v5";
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

// Activate: delete ALL old caches, then claim all clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
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
