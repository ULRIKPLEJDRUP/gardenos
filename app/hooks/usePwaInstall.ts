"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

/**
 * usePwaInstall – listens for the browser `beforeinstallprompt` event
 * and exposes state + a trigger function.
 */
export function usePwaInstall(onInstalled?: () => void) {
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [showBtn, setShowBtn] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setShowBtn(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    const prompt = deferredRef.current;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      setShowBtn(false);
      onInstalled?.();
    }
    deferredRef.current = null;
  }, [onInstalled]);

  return { showInstallBtn: showBtn, install } as const;
}
