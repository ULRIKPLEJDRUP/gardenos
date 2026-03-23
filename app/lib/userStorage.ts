// ---------------------------------------------------------------------------
// GardenOS – User-scoped localStorage + Server Sync
// ---------------------------------------------------------------------------
// All garden data is stored in localStorage keyed per user, so that multiple
// users on the same browser never collide.
//
// Additionally, data is synced to the server (PostgreSQL via /api/sync) so
// that it is available on any device the user logs into.
//
// Architecture:
//   localStorage = fast cache (read/write instantly)
//   Server DB    = source of truth (synced in background)
//
// Flow:
//   1. On mount, pull all server data and merge into localStorage
//      (server wins for keys with newer updatedAt)
//   2. On every localStorage write, mark the key as dirty
//   3. Debounced push of dirty keys to server (2s after last write)
//   4. On beforeunload, flush any remaining dirty keys
//
// Usage:
//   import { userKey, setCurrentUser, markDirty, pullFromServer } from "./userStorage";
//   const raw = localStorage.getItem(userKey("gardenos:layout:v1"));
//   // after writing:
//   markDirty("layout:v1");
// ---------------------------------------------------------------------------

let _userId = "";

// ---------------------------------------------------------------------------
// Sync status tracking — observable for UI indicator
// ---------------------------------------------------------------------------
export type SyncStatus = "idle" | "syncing" | "dirty" | "offline" | "error";

let _syncStatus: SyncStatus = "idle";
let _lastSyncTime: number | null = null;
const _syncListeners = new Set<(status: SyncStatus) => void>();

function setSyncStatus(status: SyncStatus): void {
  if (_syncStatus === status) return;
  _syncStatus = status;
  if (status === "idle") _lastSyncTime = Date.now();
  for (const cb of _syncListeners) cb(status);
}

/** Subscribe to sync status changes. Returns unsubscribe function. */
export function onSyncStatusChange(cb: (status: SyncStatus) => void): () => void {
  _syncListeners.add(cb);
  return () => { _syncListeners.delete(cb); };
}

/** Get current sync status. */
export function getSyncStatus(): SyncStatus { return _syncStatus; }

/** Get timestamp of last successful sync (epoch ms), or null. */
export function getLastSyncTime(): number | null { return _lastSyncTime; }

/** Set the active user id.  Call once on app mount (before any store reads). */
export function setCurrentUser(userId: string): void {
  if (_userId === userId) return;         // idempotent
  _userId = userId;
  if (typeof window !== "undefined" && userId) {
    migrateAnonymousData(userId);
  }
}

/** Get the active user id. */
export function getCurrentUser(): string {
  return _userId;
}

/**
 * Returns a user-scoped localStorage key.
 *
 * "gardenos:layout:v1"  →  "gardenos:u:<id>:layout:v1"
 *
 * If no user is set yet, falls back to the plain key (safe for SSR / tests).
 */
export function userKey(baseKey: string): string {
  if (!_userId) return baseKey;
  if (baseKey.startsWith("gardenos:")) {
    return `gardenos:u:${_userId}:${baseKey.slice("gardenos:".length)}`;
  }
  return `${_userId}:${baseKey}`;
}

/**
 * Extracts the short sync key from a full gardenos: key.
 * "gardenos:layout:v1" → "layout:v1"
 */
function toSyncKey(fullKey: string): string {
  if (fullKey.startsWith("gardenos:")) return fullKey.slice("gardenos:".length);
  return fullKey;
}

// ---------------------------------------------------------------------------
// Keys that hold per-user data
// ---------------------------------------------------------------------------
const MIGRATABLE_KEYS = [
  "gardenos:layout:v1",
  "gardenos:view:v1",
  "gardenos:kinds:v1",
  "gardenos:groups:v1",
  "gardenos:hiddenKinds:v1",
  "gardenos:hiddenVisKinds:v1",
  "gardenos:bookmarks:v1",
  "gardenos:anchors:v1",
  "gardenos:scanHistory:v1",
  "gardenos:kindIcons:v1",
  "gardenos:conflicts:resolved:v1",
  "gardenos:mobile:pinnedTabs:v1",
  "gardenos:sidebar:pinnedTabs:v2",
  "gardenos:chat:history:v1",
  "gardenos:chat:persona:v1",
  "gardenos:plants:custom:v1",
  "gardenos:plants:instances:v1",
  "gardenos:tasks:v1",
  "gardenos:yearwheel:custom:v1",
  "gardenos:yearwheel:completed:v1",
  "gardenos:weather:cache:v1",
  "gardenos:weather:history:v1",
  "gardenos:soil:profiles:v1",
  "gardenos:soil:log:v1",
  "gardenos:journal:v1",
];

// Keys that are synced to server (subset of MIGRATABLE — excludes ephemeral/device-specific)
const SYNCABLE_BASE_KEYS = [
  "gardenos:layout:v1",
  "gardenos:view:v1",
  "gardenos:kinds:v1",
  "gardenos:groups:v1",
  "gardenos:hiddenKinds:v1",
  "gardenos:hiddenVisKinds:v1",
  "gardenos:bookmarks:v1",
  "gardenos:anchors:v1",
  "gardenos:scanHistory:v1",
  "gardenos:kindIcons:v1",
  "gardenos:conflicts:resolved:v1",
  "gardenos:plants:custom:v1",
  "gardenos:plants:instances:v1",
  "gardenos:tasks:v1",
  "gardenos:yearwheel:custom:v1",
  "gardenos:yearwheel:completed:v1",
  "gardenos:soil:profiles:v1",
  "gardenos:soil:log:v1",
  "gardenos:journal:v1",
];
const SYNCABLE_SHORT_KEYS = new Set(SYNCABLE_BASE_KEYS.map(toSyncKey));

// ---------------------------------------------------------------------------
// Anonymous → user-scoped migration (localStorage only, runs once EVER)
// ---------------------------------------------------------------------------
// Only the FIRST user to log in on this browser claims the old unscoped data.
// After migration, the unscoped keys are deleted so subsequent new users
// start completely fresh (empty map, no addresses, no plants).
// ---------------------------------------------------------------------------
const GLOBAL_MIGRATION_FLAG = "gardenos:_anonymous_claimed";

function migrateAnonymousData(userId: string): void {
  // If anonymous data was already claimed by another user, skip entirely
  if (localStorage.getItem(GLOBAL_MIGRATION_FLAG)) return;

  const userFlag = `gardenos:u:${userId}:_migrated`;
  if (localStorage.getItem(userFlag)) return;

  let migrated = 0;
  for (const base of MIGRATABLE_KEYS) {
    const scoped = userKey(base);
    if (!localStorage.getItem(scoped)) {
      const old = localStorage.getItem(base);
      if (old) {
        localStorage.setItem(scoped, old);
        migrated++;
      }
    }
  }

  // Mark this user as migrated
  localStorage.setItem(userFlag, new Date().toISOString());

  // Mark globally that anonymous data has been claimed — no other user gets it
  localStorage.setItem(GLOBAL_MIGRATION_FLAG, userId);

  // Delete the old unscoped keys so new users start fresh
  for (const base of MIGRATABLE_KEYS) {
    localStorage.removeItem(base);
  }

  if (migrated > 0) {
    // eslint-disable-next-line no-console
    console.log(`[GardenOS] Migrerede ${migrated} data-nøgler til bruger ${userId.slice(0, 8)}…`);
  }
}

// ---------------------------------------------------------------------------
// Server sync — pull
// ---------------------------------------------------------------------------
let _pullDone = false;
let _pullPromise: Promise<void> | null = null;
let _syncDisabled = false;

/**
 * Pull all synced data from the server and merge into localStorage.
 * Server data wins IF localStorage for that key is empty (first visit
 * on this device) or server has data and local doesn't.
 * On conflict (both exist), local wins — push will overwrite server.
 * Returns a promise that resolves when pull is complete.
 */
export function pullFromServer(): Promise<void> {
  if (_pullDone) return Promise.resolve();
  if (_pullPromise) return _pullPromise;

  _pullPromise = (async () => {
    try {
      setSyncStatus("syncing");
      const res = await fetch("/api/sync", { credentials: "include" });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn("[GardenOS] Pull fejlede:", res.status);
        // 401/404 = session is stale (user deleted after DB reset) → skip sync
        if (res.status === 401 || res.status === 404) {
          _syncDisabled = true;
        }
        return;
      }
      const json = await res.json() as {
        data: Record<string, { value: string; updatedAt: string }>;
        _reset?: boolean;
      };

      // Admin reset: server tells us to wipe all local data and start fresh
      if (json._reset) {
        for (const baseKey of SYNCABLE_BASE_KEYS) {
          localStorage.removeItem(userKey(baseKey));
        }
        // Also clear non-syncable user keys that should reset
        for (const baseKey of MIGRATABLE_KEYS) {
          localStorage.removeItem(userKey(baseKey));
        }
        // eslint-disable-next-line no-console
        console.log("[GardenOS] Konto nulstillet af admin – lokal data ryddet");
        // Reload the page so the app starts completely fresh
        window.location.reload();
        return;
      }

      let pulled = 0;
      const localDirtyKeys = new Set<string>();

      for (const [shortKey, { value }] of Object.entries(json.data)) {
        // Find the matching full base key
        const baseKey = SYNCABLE_BASE_KEYS.find((k) => toSyncKey(k) === shortKey);
        if (!baseKey) continue;

        const localKey = userKey(baseKey);
        const localVal = localStorage.getItem(localKey);

        if (!localVal) {
          // No local data → server wins
          localStorage.setItem(localKey, value);
          pulled++;
        } else if (localVal !== value) {
          // Both exist and differ → local wins, mark for push
          localDirtyKeys.add(shortKey);
        }
        // else: identical, nothing to do
      }

      // Also check: local has data that server doesn't have
      for (const baseKey of SYNCABLE_BASE_KEYS) {
        const shortKey = toSyncKey(baseKey);
        const localVal = localStorage.getItem(userKey(baseKey));
        if (localVal && !json.data[shortKey]) {
          localDirtyKeys.add(shortKey);
        }
      }

      // Push local-only / conflicting keys to server
      if (localDirtyKeys.size > 0) {
        for (const sk of localDirtyKeys) _dirtyKeys.add(sk);
        schedulePush();
      }

      if (pulled > 0) {
        // eslint-disable-next-line no-console
        console.log(`[GardenOS] Hentede ${pulled} nøgler fra server`);
      }
      // Mark sync as idle (unless there are local-dirty keys pending push)
      if (_dirtyKeys.size === 0) setSyncStatus("idle");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[GardenOS] Pull fejlede (offline?):", err);
      setSyncStatus("offline");
    } finally {
      _pullDone = true;
      _pullPromise = null;
    }
  })();

  return _pullPromise;
}

// ---------------------------------------------------------------------------
// Server sync — push (debounced)
// ---------------------------------------------------------------------------
const _dirtyKeys = new Set<string>();
let _pushTimer: ReturnType<typeof setTimeout> | null = null;
const PUSH_DEBOUNCE_MS = 2_000;

/**
 * Mark a key as changed.  Call after every localStorage write.
 * Accepts either the full "gardenos:layout:v1" or short "layout:v1".
 */
export function markDirty(key: string): void {
  if (_syncDisabled) return;
  const short = key.startsWith("gardenos:") ? toSyncKey(key) : key;
  if (!SYNCABLE_SHORT_KEYS.has(short)) return; // not a syncable key
  _dirtyKeys.add(short);
  setSyncStatus("dirty");
  schedulePush();
}

function schedulePush(): void {
  if (typeof window === "undefined") return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(flushDirty, PUSH_DEBOUNCE_MS);
}

/** Immediately push all dirty keys to the server. */
export async function flushDirty(): Promise<void> {
  if (_dirtyKeys.size === 0) return;
  if (!_userId) return;
  if (_syncDisabled) { _dirtyKeys.clear(); return; }

  setSyncStatus("syncing");

  const entries: Array<{ key: string; value: string }> = [];
  for (const shortKey of _dirtyKeys) {
    const baseKey = SYNCABLE_BASE_KEYS.find((k) => toSyncKey(k) === shortKey);
    if (!baseKey) continue;
    const val = localStorage.getItem(userKey(baseKey));
    if (val != null) {
      entries.push({ key: shortKey, value: val });
    }
  }
  _dirtyKeys.clear();

  if (entries.length === 0) { setSyncStatus("idle"); return; }

  try {
    const res = await fetch("/api/sync", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn("[GardenOS] Push fejlede:", res.status);
      if (res.status >= 500) {
        // Server error — retry later
        for (const e of entries) _dirtyKeys.add(e.key);
        setSyncStatus("error");
        schedulePush();
      } else {
        // 4xx errors (401, 404) → session is stale, disable sync
        _syncDisabled = true;
        setSyncStatus("error");
      }
    } else {
      setSyncStatus(_dirtyKeys.size > 0 ? "dirty" : "idle");
    }
  } catch {
    // Network error / offline — retry later
    for (const e of entries) _dirtyKeys.add(e.key);
    // eslint-disable-next-line no-console
    console.warn("[GardenOS] Push fejlede (offline?) — prøver igen senere");
    setSyncStatus("offline");
    schedulePush();
  }
}

// Flush on page unload so nothing is lost
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (_dirtyKeys.size > 0 && _userId) {
      // Use sendBeacon for reliability during unload
      const entries: Array<{ key: string; value: string }> = [];
      for (const shortKey of _dirtyKeys) {
        const baseKey = SYNCABLE_BASE_KEYS.find((k) => toSyncKey(k) === shortKey);
        if (!baseKey) continue;
        const val = localStorage.getItem(userKey(baseKey));
        if (val != null) entries.push({ key: shortKey, value: val });
      }
      if (entries.length > 0) {
        navigator.sendBeacon(
          "/api/sync",
          new Blob([JSON.stringify({ entries })], { type: "application/json" })
        );
      }
      _dirtyKeys.clear();
    }
  });

  // Also attempt periodic sync every 30s if there are dirty keys
  setInterval(() => {
    if (_dirtyKeys.size > 0) flushDirty();
  }, 30_000);
}
