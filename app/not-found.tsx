// ---------------------------------------------------------------------------
// GardenOS – Custom 404 Page (Phase 7)
// ---------------------------------------------------------------------------

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-7xl">🌻</div>
        <h1 className="text-2xl font-bold text-foreground/80">
          404 — Siden blev ikke fundet
        </h1>
        <p className="text-sm text-foreground/60 leading-relaxed">
          Den side du leder efter findes ikke. Måske er den flyttet, eller adressen er forkert.
        </p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent/90 transition-colors shadow-md"
        >
          Gå til haven →
        </Link>
      </div>
    </div>
  );
}
