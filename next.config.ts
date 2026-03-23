import type { NextConfig } from "next";

// ── CRITICAL: Build output MUST live outside OneDrive in dev ──
// The workspace is inside a OneDrive-synced shared folder. Turbopack uses
// an LMDB key-value store for persistent caching inside .next/. OneDrive's
// background sync continuously locks these binary files, causing:
//   "Persisting failed: Another write batch or compaction is already active"
// and eventually crashing the dev server → ERR_CONNECTION_REFUSED.
// By placing distDir on /tmp we avoid ALL sync conflicts.
// In CI/production (Vercel) we keep the default .next/ folder.
const isLocal = !process.env.CI && !process.env.VERCEL;

const nextConfig: NextConfig = {
  ...(isLocal && { distDir: "/tmp/gardenos-next" }),

  async headers() {
    return [
      {
        // Allow service worker scope to be root
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
