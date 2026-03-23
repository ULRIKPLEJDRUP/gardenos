"use client";
// ---------------------------------------------------------------------------
// GardenOS – Root Layout Error Boundary (Phase 7)
// ---------------------------------------------------------------------------
// This catches errors in the root layout itself.
// Must include its own <html> and <body> tags.
// ---------------------------------------------------------------------------

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GardenOS Root Error]", error);
  }, [error]);

  return (
    <html lang="da">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fafaf8", color: "#333" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontSize: 64 }}>🌿</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 16 }}>GardenOS – kritisk fejl</h1>
            <p style={{ fontSize: 14, color: "#666", marginTop: 8, lineHeight: 1.6 }}>
              Der opstod en alvorlig fejl. Prøv at genindlæse siden.
            </p>
            <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  borderRadius: 12, background: "#2d7a3a", color: "#fff", border: "none",
                  padding: "12px 32px", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Prøv igen
              </button>
              <button
                type="button"
                onClick={() => (window.location.href = "/")}
                style={{
                  borderRadius: 12, background: "transparent", color: "#666", border: "1px solid #ddd",
                  padding: "10px 32px", fontSize: 14, cursor: "pointer",
                }}
              >
                Gå til forsiden
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
