"use client";
// ---------------------------------------------------------------------------
// GardenOS – Admin Panel: Invite Codes + User Management
// ---------------------------------------------------------------------------
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type InviteCode = {
  id: string;
  code: string;
  createdAt: string;
  usedAt: string | null;
  expiresAt: string | null;
  usedBy: { email: string; name: string | null } | null;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invite-codes");
      const data = await res.json();
      if (data.codes) setCodes(data.codes);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchCodes();
  }, [status, fetchCodes]);

  const generateCodes = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          expiresInDays: expiresInDays || undefined,
        }),
      });
      if (res.ok) await fetchCodes();
    } catch {
      /* ignore */
    }
    setGenerating(false);
  };

  const revokeCode = async (id: string) => {
    await fetch(`/api/admin/invite-codes?id=${id}`, { method: "DELETE" });
    await fetchCodes();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopyFeedback(code);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  // ── Guard: admin only ──
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8faf6]">
        <p className="text-gray-500">Indlæser…</p>
      </div>
    );
  }

  if (
    !session?.user ||
    (session.user as { role?: string }).role !== "admin"
  ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8faf6] gap-4">
        <p className="text-lg text-gray-600">⛔ Kun for administratorer</p>
        <Link href="/" className="text-green-600 underline hover:text-green-700">
          Tilbage til kortet
        </Link>
      </div>
    );
  }

  const unused = codes.filter((c) => !c.usedBy);
  const used = codes.filter((c) => c.usedBy);

  return (
    <div className="min-h-screen bg-[#f8faf6] px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              🛡️ Admin Panel
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Administrér invitationskoder og brugere
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ← Tilbage til kort
          </Link>
        </div>

        {/* Generate section */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Generér invitationskoder
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Del koden med folk du vil invitere. Hver kode kan kun bruges én gang.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Antal
              </label>
              <input
                type="number"
                min={1}
                max={20}
                className="mt-1 w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Udløber om (dage, valgfrit)
              </label>
              <input
                type="number"
                min={1}
                className="mt-1 w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="∞"
                value={expiresInDays}
                onChange={(e) =>
                  setExpiresInDays(e.target.value ? Number(e.target.value) : "")
                }
              />
            </div>
            <button
              type="button"
              onClick={generateCodes}
              disabled={generating}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {generating ? "Genererer…" : "✨ Generér"}
            </button>
          </div>
        </div>

        {/* Unused codes */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            🔑 Ledige koder ({unused.length})
          </h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-400">Indlæser…</p>
          ) : unused.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400 italic">
              Ingen ledige koder. Generér nogle ovenfor.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {unused.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                >
                  <code className="flex-1 text-lg font-mono font-bold tracking-[0.3em] text-gray-800">
                    {c.code}
                  </code>
                  <span className="text-xs text-gray-400">
                    {c.expiresAt
                      ? `Udløber ${new Date(c.expiresAt).toLocaleDateString("da-DK")}`
                      : "Ingen udløb"}
                  </span>
                  <button
                    type="button"
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
                      copyFeedback === c.code
                        ? "bg-green-100 text-green-700"
                        : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-100"
                    }`}
                    onClick={() => copyCode(c.code)}
                  >
                    {copyFeedback === c.code ? "✓ Kopieret" : "📋 Kopiér"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    onClick={() => revokeCode(c.id)}
                  >
                    Slet
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Used codes / registered users */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            👥 Registrerede brugere ({used.length})
          </h2>
          {used.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400 italic">
              Ingen brugere registreret endnu.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {used.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                >
                  <span className="text-lg">👤</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      {c.usedBy?.name || c.usedBy?.email || "Ukendt"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {c.usedBy?.email} · Registreret{" "}
                      {c.usedAt
                        ? new Date(c.usedAt).toLocaleDateString("da-DK")
                        : "–"}
                    </p>
                  </div>
                  <code className="text-xs font-mono text-gray-400">
                    {c.code}
                  </code>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
