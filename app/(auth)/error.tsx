"use client";
// ---------------------------------------------------------------------------
// GardenOS – Auth Route Error Boundary (Phase 7)
// ---------------------------------------------------------------------------
// Catches errors on /login and /register pages.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GardenOS Auth Error]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50 to-white p-6">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center space-y-5">
        <div className="text-5xl">🔐</div>
        <h1 className="text-lg font-bold text-gray-800">Login-fejl</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Der opstod en fejl på login-siden. Prøv igen eller gå til forsiden.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            Prøv igen
          </button>
          <a
            href="/login"
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors inline-block"
          >
            Gå til login
          </a>
        </div>
      </div>
    </div>
  );
}
