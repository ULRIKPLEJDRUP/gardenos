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

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  dataKeys: number;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [passwordEditId, setPasswordEditId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const fetchCodes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/invite-codes");
      const data = await res.json();
      if (data.codes) setCodes(data.codes);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [codesRes, usersRes] = await Promise.all([
          fetch("/api/admin/invite-codes"),
          fetch("/api/admin/users"),
        ]);
        const [codesData, usersData] = await Promise.all([
          codesRes.json(),
          usersRes.json(),
        ]);
        if (!cancelled) {
          if (codesData.codes) setCodes(codesData.codes);
          if (usersData.users) setUsers(usersData.users);
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [status]);

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

  const deleteUser = async (user: AdminUser) => {
    if (
      !confirm(
        `Er du sikker på at du vil slette brugeren "${user.name || user.email}"?\n\nAlt data slettes permanent og kan ikke gendannes.`
      )
    )
      return;
    setBusyUserId(user.id);
    try {
      const res = await fetch(`/api/admin/users?id=${user.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await Promise.all([fetchUsers(), fetchCodes()]);
      } else {
        const data = await res.json();
        alert(data.error || "Kunne ikke slette brugeren");
      }
    } catch {
      alert("Netværksfejl – prøv igen");
    }
    setBusyUserId(null);
  };

  const resetUser = async (user: AdminUser) => {
    if (
      !confirm(
        `Nulstil brugeren "${user.name || user.email}"?\n\nAlt synkroniseret data slettes, men kontoen bevares. Brugeren starter forfra næste gang.`
      )
    )
      return;
    setBusyUserId(user.id);
    try {
      const res = await fetch(`/api/admin/users?id=${user.id}`, {
        method: "PATCH",
      });
      if (res.ok) {
        await fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "Kunne ikke nulstille brugeren");
      }
    } catch {
      alert("Netværksfejl – prøv igen");
    }
    setBusyUserId(null);
  };

  const changePassword = async (user: AdminUser) => {
    if (!newPassword || newPassword.length < 8) {
      alert("Adgangskoden skal være mindst 8 tegn.");
      return;
    }
    setBusyUserId(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, password: newPassword }),
      });
      if (res.ok) {
        setPasswordEditId(null);
        setNewPassword("");
        alert(`Adgangskode ændret for ${user.name || user.email}`);
      } else {
        const data = await res.json();
        alert(data.error || "Kunne ikke ændre adgangskoden");
      }
    } catch {
      alert("Netværksfejl – prøv igen");
    }
    setBusyUserId(null);
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

        {/* Users management */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            👥 Brugere ({users.length})
          </h2>
          {loading ? (
            <p className="mt-3 text-sm text-gray-400">Indlæser…</p>
          ) : users.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400 italic">
              Ingen brugere fundet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {users.map((u) => {
                const isSelf = u.id === (session?.user as { id?: string })?.id;
                const busy = busyUserId === u.id;
                return (
                  <div
                    key={u.id}
                    className={`rounded-lg border px-4 py-3 ${
                      busy
                        ? "border-yellow-200 bg-yellow-50 opacity-60"
                        : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {u.role === "admin" ? "🛡️" : "👤"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {u.name || "Intet navn"}{" "}
                          {isSelf && (
                            <span className="text-xs text-green-600">(dig)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {u.email} · {u.dataKeys} synk-nøgler ·{" "}
                          {new Date(u.createdAt).toLocaleDateString("da-DK")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          onClick={() => {
                            setPasswordEditId(
                              passwordEditId === u.id ? null : u.id
                            );
                            setNewPassword("");
                          }}
                          title="Ændr adgangskode"
                        >
                          🔑 Kode
                        </button>
                        <button
                          type="button"
                          disabled={busy || isSelf}
                          className="rounded-md border border-orange-200 bg-white px-2.5 py-1.5 text-xs text-orange-600 hover:bg-orange-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          onClick={() => resetUser(u)}
                          title="Nulstil alt data – brugeren starter forfra"
                        >
                          🔄 Nulstil
                        </button>
                        <button
                          type="button"
                          disabled={busy || isSelf}
                          className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          onClick={() => deleteUser(u)}
                          title="Slet bruger og alt data permanent"
                        >
                          🗑️ Slet
                        </button>
                      </div>
                    </div>
                    {/* Inline password edit form */}
                    {passwordEditId === u.id && (
                      <div className="mt-2 flex items-center gap-2 pl-8">
                        <input
                          type="text"
                          autoFocus
                          placeholder="Ny adgangskode (min 8 tegn)"
                          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") changePassword(u);
                            if (e.key === "Escape") {
                              setPasswordEditId(null);
                              setNewPassword("");
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy || newPassword.length < 8}
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                          onClick={() => changePassword(u)}
                        >
                          Gem
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                          onClick={() => {
                            setPasswordEditId(null);
                            setNewPassword("");
                          }}
                        >
                          Annullér
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
