"use client";

import type { Announcement } from "../hooks/useAnnouncements";

interface AnnouncementBannerProps {
  announcements: Announcement[];
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<string, string> = {
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/80 dark:text-amber-100",
  success: "bg-green-100 text-green-900 dark:bg-green-900/80 dark:text-green-100",
  info:    "bg-blue-100 text-blue-900 dark:bg-blue-900/80 dark:text-blue-100",
};

const TYPE_ICONS: Record<string, string> = {
  warning: "⚠️",
  success: "✅",
  info: "ℹ️",
};

/**
 * AnnouncementBanner – renders active (non-dismissed) server announcements
 * as a stacked banner at the very top of the viewport.
 */
export default function AnnouncementBanner({ announcements, onDismiss }: AnnouncementBannerProps) {
  if (announcements.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9600] flex flex-col">
      {announcements.map((a) => (
        <div
          key={a.id}
          className={`flex items-center justify-between px-4 py-2 text-xs font-medium shadow-sm ${TYPE_STYLES[a.type] ?? TYPE_STYLES.info}`}
        >
          <span>{TYPE_ICONS[a.type] ?? TYPE_ICONS.info} {a.message}</span>
          <button
            type="button"
            className="ml-3 rounded px-1.5 py-0.5 hover:bg-black/10 transition-colors"
            onClick={() => onDismiss(a.id)}
            aria-label="Luk"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
