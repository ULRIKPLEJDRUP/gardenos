"use client";

import { useCallback, useEffect, useState } from "react";
import { userKey } from "../lib/userStorage";

export interface Announcement {
  id: string;
  message: string;
  type: string;
}

/**
 * useAnnouncements – fetches active announcements from the server and
 * manages per-user dismissals via localStorage.
 */
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(userKey("gardenos:dismissed-announcements:v1"));
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/announcements")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setAnnouncements(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(userKey("gardenos:dismissed-announcements:v1"), JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = announcements.filter((a) => !dismissed.has(a.id));

  return { announcements, visible, dismiss } as const;
}
