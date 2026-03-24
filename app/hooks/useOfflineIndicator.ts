"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useOfflineIndicator – watches navigator.onLine and listens for
 * the service worker's SYNC_QUEUED / SYNC_REPLAYED messages to show
 * a temporary offline-sync banner.
 */
export function useOfflineIndicator() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [pendingSyncs, setPendingSyncs] = useState(0);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    const handleSW = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_QUEUED") {
        setPendingSyncs((n) => n + 1);
      } else if (event.data?.type === "SYNC_REPLAYED") {
        setPendingSyncs(0);
      }
    };

    navigator.serviceWorker?.addEventListener("message", handleSW);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      navigator.serviceWorker?.removeEventListener("message", handleSW);
    };
  }, []);

  const replayQueue = useCallback(async () => {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage({ type: "REPLAY_SYNC_QUEUE" });
  }, []);

  return { isOffline, pendingSyncs, replayQueue } as const;
}
