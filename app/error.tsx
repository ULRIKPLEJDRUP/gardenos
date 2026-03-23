"use client";
// ---------------------------------------------------------------------------
// GardenOS – Global Error Boundary (Phase 7)
// ---------------------------------------------------------------------------
// Catches runtime errors in all pages (except root layout).
// Provides a user-friendly Danish error screen with retry.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error for debugging (production: connect to error tracking)
    console.error("[GardenOS Error Boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl">🌿</div>
        <h1 className="text-xl font-bold text-foreground/80">
          Noget gik galt
        </h1>
        <p className="text-sm text-foreground/60 leading-relaxed">
          Der opstod en uventet fejl. Dine data er gemt lokalt og bør være sikre.
        </p>
        {process.env.NODE_ENV === "development" && (
          <details className="text-left rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <summary className="cursor-pointer font-medium">Fejldetaljer (kun i dev)</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all">{error.message}</pre>
            {error.stack && (
              <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-red-600/70">{error.stack}</pre>
            )}
          </details>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent/90 transition-colors shadow-md"
          >
            Prøv igen
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className="rounded-xl border border-border px-6 py-3 text-sm font-medium text-foreground/60 hover:bg-foreground/5 transition-colors"
          >
            Gå til forsiden
          </button>
        </div>
        <p className="text-[10px] text-foreground/30">
          Fejlkode: {error.digest ?? "ingen"}
        </p>
      </div>
    </div>
  );
}
