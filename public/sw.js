// ---------------------------------------------------------------------------
// GardenOS – Service Worker (minimal offline-capable PWA shell)
// ---------------------------------------------------------------------------

// ── Dev-mode self-destruct: on localhost the SW should never run ──
if (
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1"
) {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.clients.claim())
        .then(() => self.registration.unregister())
        .then(() =>
          self.clients.matchAll({ type: "window" }).then((clients) => {
            for (const c of clients) c.postMessage({ type: "SW_REMOVED" });
          })
        )
    );
  });
  // No fetch handlers – everything goes straight to the dev server
  return;
}

const CACHE_NAME = "gardenos-v12";
const PRECACHE_URLS = [
  "/",
  "/login",
  "/manifest.json",
  "/leaflet/marker-icon.png",
  "/leaflet/marker-icon-2x.png",
  "/leaflet/marker-shadow.png",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
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
  if (event.data && event.data.type === "REPLAY_SYNC_QUEUE") {
    replaySyncQueue();
  }
});

// ───────────────────────────────────────────────────────────────────────────
// Offline sync queue – queue failed /api/sync writes and replay when online
// ───────────────────────────────────────────────────────────────────────────
const SYNC_QUEUE_KEY = "gardenos:syncQueue";

async function getSyncQueue() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match("/__sync_queue__");
    if (res) return await res.json();
  } catch { /* ignore */ }
  return [];
}

async function saveSyncQueue(queue) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(
    "/__sync_queue__",
    new Response(JSON.stringify(queue), {
      headers: { "content-type": "application/json" },
    })
  );
}

async function queueSyncRequest(request) {
  try {
    const body = await request.clone().text();
    const queue = await getSyncQueue();
    queue.push({
      url: request.url,
      method: request.method,
      body,
      timestamp: Date.now(),
    });
    // Keep only last 50 queued requests to prevent unbounded growth
    if (queue.length > 50) queue.splice(0, queue.length - 50);
    await saveSyncQueue(queue);
    notifyClients({ type: "SYNC_QUEUED", queueLength: queue.length });
  } catch (err) {
    console.error("[sw] Failed to queue sync request:", err);
  }
}

async function replaySyncQueue() {
  const queue = await getSyncQueue();
  if (queue.length === 0) return;

  const remaining = [];
  for (const entry of queue) {
    try {
      const res = await fetch(entry.url, {
        method: entry.method,
        body: entry.body,
        headers: { "content-type": "application/json" },
      });
      if (!res.ok && res.status >= 500) {
        remaining.push(entry); // server error – retry later
      }
      // 4xx = drop (auth expired, bad data — no point retrying)
    } catch {
      remaining.push(entry); // still offline
    }
  }
  await saveSyncQueue(remaining);
  notifyClients({
    type: "SYNC_REPLAYED",
    sent: queue.length - remaining.length,
    remaining: remaining.length,
  });
}

function notifyClients(message) {
  self.clients.matchAll({ type: "window" }).then((clients) => {
    for (const client of clients) {
      client.postMessage(message);
    }
  });
}

// Replay queued syncs when connectivity returns
self.addEventListener("online", () => {
  replaySyncQueue();
});

// Fetch: ALWAYS network-first for HTML and _next/ assets.
// Only use cache as offline fallback.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET and API / auth requests
  if (request.method !== "GET") {
    // Queue failed /api/sync writes for offline replay
    if (request.url.includes("/api/sync") && (request.method === "PUT" || request.method === "POST")) {
      event.respondWith(
        fetch(request.clone()).catch(async () => {
          await queueSyncRequest(request);
          return new Response(JSON.stringify({ ok: true, queued: true }), {
            status: 202,
            headers: { "content-type": "application/json" },
          });
        })
      );
    }
    return;
  }
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
