// ---------------------------------------------------------------------------
// GardenOS – Service Worker (minimal offline-capable PWA shell)
// ---------------------------------------------------------------------------
const CACHE_NAME = "gardenos-v3";
const PRECACHE_URLS = [
  "/",
  "/login",
  "/manifest.json",
];

// Install: pre-cache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first with cache fallback for navigation requests
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
  // This ensures code updates (new features, bug fixes) are always loaded
  // when online, while still working offline from cache.
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

  // For other static assets (images, fonts) – cache first, network fallback
  if (
    request.url.match(/\.(png|jpg|jpeg|svg|ico|woff2?)(\?.*)?$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
    return;
  }
});
