"use client";

import type { ToastType } from "../hooks/useToast";

interface ToastNotificationProps {
  message: string | null;
  type: ToastType;
  onClose: () => void;
}

const TYPE_STYLES: Record<ToastType, string> = {
  error:   "border-red-400/40 bg-red-50/95 text-red-800 dark:bg-red-950/90 dark:text-red-200 dark:border-red-500/30",
  warning: "border-amber-400/40 bg-amber-50/95 text-amber-800 dark:bg-amber-950/90 dark:text-amber-200 dark:border-amber-500/30",
  success: "border-green-400/40 bg-green-50/95 text-green-800 dark:bg-green-950/90 dark:text-green-200 dark:border-green-500/30",
  info:    "border-blue-400/40 bg-blue-50/95 text-blue-800 dark:bg-blue-950/90 dark:text-blue-200 dark:border-blue-500/30",
};

const TYPE_ICONS: Record<ToastType, string> = {
  error: "🚫",
  warning: "⚠️",
  success: "✅",
  info: "ℹ️",
};

/**
 * ToastNotification – fixed-position ephemeral notification bar.
 * Renders nothing when `message` is null.
 */
export default function ToastNotification({ message, type, onClose }: ToastNotificationProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed bottom-6 left-1/2 z-[10000] -translate-x-1/2 max-w-[90vw] md:max-w-lg rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm transition-all animate-in slide-in-from-bottom-4 duration-300 ${TYPE_STYLES[type]}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5">{TYPE_ICONS[type]}</span>
        <p className="text-xs leading-relaxed whitespace-pre-line flex-1">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-current/50 hover:text-current ml-1 text-sm leading-none"
          aria-label="Luk notifikation"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
