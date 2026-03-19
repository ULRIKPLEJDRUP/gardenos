"use client";

import { Component, useEffect, useState, type ComponentType, type ReactNode } from "react";

// ── Error boundary to surface JS errors visually ──
class MapErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "sans-serif", color: "#c00" }}>
          <h2>⚠️ GardenMapClient fejlede</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#666", marginTop: 8 }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}
          >
            Genindlæs
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Loading & diagnostic states ──
type LoadState =
  | { phase: "idle" }
  | { phase: "importing"; elapsed: number }
  | { phase: "ready"; Comp: ComponentType<{ userId: string }> }
  | { phase: "error"; message: string; detail?: string };

export function GardenMap({ userId }: { userId: string }) {
  const [state, setState] = useState<LoadState>({ phase: "idle" });

  useEffect(() => {
    // Only run on client
    if (typeof window === "undefined") return;

    let cancelled = false;
    const startTime = Date.now();

    // Tick elapsed seconds while importing
    const ticker = setInterval(() => {
      if (!cancelled) {
        setState((s) =>
          s.phase === "importing"
            ? { phase: "importing", elapsed: Math.floor((Date.now() - startTime) / 1000) }
            : s
        );
      }
    }, 1000);

    setState({ phase: "importing", elapsed: 0 });

    // Set up a global error catcher for import-time errors
    const prevOnError = window.onerror;
    const caughtErrors: string[] = [];
    window.onerror = (msg, src, line, col, err) => {
      caughtErrors.push(`${msg} (${src}:${line}:${col})`);
      if (prevOnError) return prevOnError(msg, src, line, col, err);
      return false;
    };

    const prevUnhandled = window.onunhandledrejection;
    window.onunhandledrejection = (e) => {
      caughtErrors.push(`Unhandled rejection: ${e.reason}`);
      if (prevUnhandled) prevUnhandled.call(window, e);
    };

    import("./GardenMapClient")
      .then((mod) => {
        if (cancelled) return;
        clearInterval(ticker);
        window.onerror = prevOnError;
        window.onunhandledrejection = prevUnhandled;
        if (mod.GardenMapClient) {
          setState({ phase: "ready", Comp: mod.GardenMapClient });
        } else {
          setState({
            phase: "error",
            message: "Module loaded but GardenMapClient export not found",
            detail: `Available exports: ${Object.keys(mod).join(", ")}`,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        clearInterval(ticker);
        window.onerror = prevOnError;
        window.onunhandledrejection = prevUnhandled;
        setState({
          phase: "error",
          message: err?.message ?? String(err),
          detail: [
            err?.stack,
            caughtErrors.length > 0 ? `\nGlobal errors caught:\n${caughtErrors.join("\n")}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        });
      });

    return () => {
      cancelled = true;
      clearInterval(ticker);
      window.onerror = prevOnError;
      window.onunhandledrejection = prevUnhandled;
    };
  }, []);

  // ── Render based on state ──
  if (state.phase === "idle" || (state.phase === "importing" && state.elapsed < 1)) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl animate-bounce">🌱</span>
          <p className="text-sm text-muted">Indlæser havekort…</p>
        </div>
      </div>
    );
  }

  if (state.phase === "importing") {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl animate-bounce">🌱</span>
          <p className="text-sm text-muted">Indlæser havekort… ({state.elapsed}s)</p>
          {state.elapsed >= 15 && (
            <div style={{ marginTop: 12, textAlign: "center", maxWidth: 360 }}>
              <p style={{ color: "#c00", fontSize: 14, marginBottom: 8 }}>
                Indlæsning tager længere end forventet.
              </p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "8px 20px",
                  cursor: "pointer",
                  borderRadius: 6,
                  border: "1px solid #999",
                  background: "#fff",
                }}
              >
                Genindlæs siden
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div style={{ padding: 32, fontFamily: "sans-serif", color: "#c00" }}>
        <h2>⚠️ Kunne ikke indlæse havekort</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{state.message}</pre>
        {state.detail && (
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#666", marginTop: 8 }}>
            {state.detail}
          </pre>
        )}
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}
        >
          Genindlæs
        </button>
      </div>
    );
  }

  // phase === "ready"
  const { Comp } = state;
  return (
    <MapErrorBoundary>
      <Comp userId={userId} />
    </MapErrorBoundary>
  );
}
