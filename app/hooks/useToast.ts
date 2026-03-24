"use client";

import { useCallback, useRef, useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastState {
  msg: string | null;
  type: ToastType;
}

/**
 * useToast – lightweight ephemeral toast notification hook.
 *
 * Returns the current message/type and a `showToast` function that
 * auto-clears after 6 s.
 */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const [type, setType] = useState<ToastType>("info");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, t: ToastType = "info") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMsg(text);
    setType(t);
    timerRef.current = setTimeout(() => setMsg(null), 6000);
  }, []);

  const clearToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMsg(null);
  }, []);

  return { toastMsg: msg, toastType: type, showToast, clearToast } as const;
}
