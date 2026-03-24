"use client";
// ---------------------------------------------------------------------------
// GardenOS – Admin Panel (accordion layout)
// ---------------------------------------------------------------------------
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "../hooks/useToast";
import ToastNotification from "../components/ToastNotification";

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
  feedbackEnabled: boolean;
  maxDesigns: number;
  lastLoginAt: string | null;
};

type ActivityUser = {
  id: string;
  email: string;
  name: string | null;
  lastLoginAt: string | null;
  lastActivity: string | null;
  totalLogins: number;
  createdAt: string;
  actions: Record<string, number>;
};

type ActivityLogEntry = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const { toastMsg, toastType, showToast, clearToast } = useToast();
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

  // Invite user state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    email: string;
    password: string;
    name: string;
    emailSent: boolean;
  } | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");

  const PRODUCTION_URL = "https://gardenos-nu.vercel.app";

  const buildInviteMessage = (name: string, email: string, password: string) => {
    const greeting = name ? `Hej ${name}!` : "Hej!";
    return `${greeting}\n\nDu er blevet inviteret til GardenOS 🌱 – din digitale haveplanlægger, hvor du kan kortlægge din have, holde styr på dine planter og få overblik over sæsonens opgaver.\n\nLog ind med:\n📧 Email: ${email}\n🔑 Adgangskode: ${password}\n\n👉 Log ind her: ${PRODUCTION_URL}/login\n\nVi anbefaler at ændre din adgangskode efter første login.`;
  };

  // Feedback state
  type AdminFeedback = {
    id: string;
    type: string;
    title: string;
    description: string;
    status: string;
    createdAt: string;
    imageData: string | null;
    user: { name: string | null; email: string };
    _count: { replies: number };
  };
  const [feedbackItems, setFeedbackItems] = useState<AdminFeedback[]>([]);
  const [feedbackDetail, setFeedbackDetail] = useState<string | null>(null);
  const [adminReplyText, setAdminReplyText] = useState("");
  const [adminReplying, setAdminReplying] = useState(false);

  // Icon bank state
  type BankIcon = {
    id: string;
    imageData: string;
    prompt: string;
    status: string;
    createdAt: string;
    reviewedAt: string | null;
    user: { email: string; name: string | null };
  };
  const [bankIcons, setBankIcons] = useState<BankIcon[]>([]);
  const [bankBusy, setBankBusy] = useState<string | null>(null);

  // Activity tracking state
  const [activityUsers, setActivityUsers] = useState<ActivityUser[]>([]);
  const [activityDetailId, setActivityDetailId] = useState<string | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);

  // Announcements state (F6)
  const [annList, setAnnList] = useState<{ id: string; message: string; type: string; active: boolean; createdAt: string; expiresAt: string | null }[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [annMessage, setAnnMessage] = useState("");
  const [annType, setAnnType] = useState<"info" | "warning" | "success">("info");
  const [annExpiry, setAnnExpiry] = useState<number | "">(24);
  const [annSending, setAnnSending] = useState(false);

  // Accordion state – which sections are open
  type SectionId = "invite" | "codes" | "users" | "activity" | "feedback" | "icons" | "announcements";
  const [openSections, setOpenSections] = useState<Set<SectionId>>(new Set(["invite"]));
  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const fetchFeedback = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/feedback");
      const data = await res.json();
      if (data.feedback) setFeedbackItems(data.feedback);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchBankIcons = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/icon-bank");
      const data = await res.json();
      if (data.icons) setBankIcons(data.icons);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/activity");
      const data = await res.json();
      if (data.users) setActivityUsers(data.users);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchActivityDetail = useCallback(async (userId: string) => {
    setActivityLogsLoading(true);
    try {
      const res = await fetch(`/api/admin/activity?id=${userId}`);
      const data = await res.json();
      if (data.logs) setActivityLogs(data.logs);
    } catch {
      /* ignore */
    }
    setActivityLogsLoading(false);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [codesRes, usersRes, feedbackRes, bankRes, activityRes] = await Promise.all([
          fetch("/api/admin/invite-codes"),
          fetch("/api/admin/users"),
          fetch("/api/admin/feedback"),
          fetch("/api/admin/icon-bank"),
          fetch("/api/admin/activity"),
        ]);
        const [codesData, usersData, feedbackData, bankData, activityData] = await Promise.all([
          codesRes.json(),
          usersRes.json(),
          feedbackRes.json(),
          bankRes.json(),
          activityRes.json(),
        ]);
        if (!cancelled) {
          if (codesData.codes) setCodes(codesData.codes);
          if (usersData.users) setUsers(usersData.users);
          if (feedbackData.feedback) setFeedbackItems(feedbackData.feedback);
          if (bankData.icons) setBankIcons(bankData.icons);
          if (activityData.users) setActivityUsers(activityData.users);
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

  const inviteUser = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult(null);
    setInviteCopied(false);
    try {
      const res = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const resultName = inviteName.trim();
        setInviteResult({
          email: data.email,
          password: data.password,
          name: resultName,
          emailSent: data.emailSent,
        });
        setInviteMessage(buildInviteMessage(resultName, data.email, data.password));
        setInviteEmail("");
        setInviteName("");
        await fetchUsers();
      } else {
        showToast(data.error || "Kunne ikke oprette brugeren", "error");
      }
    } catch {
      showToast("Netværksfejl – prøv igen", "error");
    }
    setInviting(false);
  };

  const copyInviteDetails = () => {
    if (!inviteMessage) return;
    navigator.clipboard.writeText(inviteMessage);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 3000);
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
        showToast(data.error || "Kunne ikke slette brugeren", "error");
      }
    } catch {
      showToast("Netværksfejl – prøv igen", "error");
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
        showToast(data.error || "Kunne ikke nulstille brugeren", "error");
      }
    } catch {
      showToast("Netværksfejl – prøv igen", "error");
    }
    setBusyUserId(null);
  };

  const changePassword = async (user: AdminUser) => {
    if (!newPassword || newPassword.length < 8) {
      showToast("Adgangskoden skal være mindst 8 tegn.", "warning");
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
        showToast(`Adgangskode ændret for ${user.name || user.email}`, "success");
      } else {
        const data = await res.json();
        showToast(data.error || "Kunne ikke ændre adgangskoden", "error");
      }
    } catch {
      showToast("Netværksfejl – prøv igen", "error");
    }
    setBusyUserId(null);
  };

  const updateMaxDesigns = async (user: AdminUser, newMax: number) => {
    setBusyUserId(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, maxDesigns: newMax }),
      });
      if (res.ok) await fetchUsers();
    } catch { /* ignore */ }
    setBusyUserId(null);
  };

  const toggleFeedback = async (user: AdminUser) => {
    setBusyUserId(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          feedbackEnabled: !user.feedbackEnabled,
        }),
      });
      if (res.ok) await fetchUsers();
    } catch { /* ignore */ }
    setBusyUserId(null);
  };

  const updateFeedbackStatus = async (id: string, newStatus: string) => {
    try {
      await fetch(`/api/admin/feedback?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchFeedback();
    } catch { /* ignore */ }
  };

  const sendAdminReply = async (feedbackId: string) => {
    if (!adminReplyText.trim()) return;
    setAdminReplying(true);
    try {
      const res = await fetch("/api/feedback/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackId,
          message: adminReplyText.trim(),
        }),
      });
      if (res.ok) {
        setAdminReplyText("");
        await fetchFeedback();
      }
    } catch { /* ignore */ }
    setAdminReplying(false);
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
      <div className="mx-auto max-w-2xl space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              🛡️ Admin Panel
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Administrér brugere, invitationer og indhold
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ← Tilbage til kort
          </Link>
        </div>

        {/* Summary dashboard */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl bg-white border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{users.length}</p>
            <p className="text-xs text-gray-500 mt-1">👥 Brugere</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-green-600">{unused.length}</p>
            <p className="text-xs text-gray-500 mt-1">🔑 Ledige koder</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-amber-600">{feedbackItems.filter(f => f.status === "new").length}</p>
            <p className="text-xs text-gray-500 mt-1">💬 Ny feedback</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-purple-600">{bankIcons.filter(i => i.status === "pending").length}</p>
            <p className="text-xs text-gray-500 mt-1">🎨 Afventer ikoner</p>
          </div>
        </div>

        {/* ── Invite user section ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button type="button" onClick={() => toggleSection("invite")} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors">
            <h2 className="text-base font-semibold text-gray-900">📧 Invitér ny bruger</h2>
            <span className={`text-gray-400 text-lg transition-transform ${openSections.has("invite") ? "rotate-90" : ""}`}>›</span>
          </button>
          {openSections.has("invite") && (
          <div className="px-6 pb-6 border-t border-gray-100">
          <p className="pt-4 text-sm text-gray-500">
            Opret en bruger og send login-detaljer direkte via email.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600">
                Email *
              </label>
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                placeholder="bruger@email.dk"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") inviteUser();
                }}
              />
            </div>
            <div className="min-w-[140px]">
              <label className="block text-xs font-medium text-gray-600">
                Navn (valgfrit)
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                placeholder="Fornavn"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") inviteUser();
                }}
              />
            </div>
            <button
              type="button"
              onClick={inviteUser}
              disabled={inviting || !inviteEmail.trim()}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {inviting ? "Opretter…" : "✉️ Invitér"}
            </button>
          </div>

          {/* Invite result card */}
          {inviteResult && (
            <div className="mt-4 rounded-lg border border-green-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{inviteResult.emailSent ? "✅" : "⚠️"}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    Bruger oprettet: {inviteResult.email}
                  </p>
                  {inviteResult.emailSent ? (
                    <p className="text-xs text-green-600 mt-1">
                      📨 Invitation sendt via email!
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 mt-1">
                      Email ikke konfigureret – rediger beskeden nedenfor og kopiér den til SMS, mail el. besked.
                    </p>
                  )}

                  {/* Redigerbar besked */}
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      ✏️ Rediger besked inden du kopierer:
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono leading-relaxed text-gray-700 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400 resize-y"
                      rows={10}
                      value={inviteMessage}
                      onChange={(e) => setInviteMessage(e.target.value)}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                        inviteCopied
                          ? "bg-green-100 text-green-700 border border-green-300"
                          : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                      onClick={copyInviteDetails}
                    >
                      {inviteCopied ? "✓ Kopieret!" : "📋 Kopiér besked"}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                      onClick={() => setInviteMessage(buildInviteMessage(inviteResult.name, inviteResult.email, inviteResult.password))}
                    >
                      ↺ Nulstil tekst
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
                      onClick={() => { setInviteResult(null); setInviteMessage(""); }}
                    >
                      Luk
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
          )}
        </div>

        {/* ── Codes section ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button type="button" onClick={() => toggleSection("codes")} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900">🔑 Invitationskoder</h2>
              {unused.length > 0 && <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{unused.length} ledige</span>}
            </div>
            <span className={`text-gray-400 text-lg transition-transform ${openSections.has("codes") ? "rotate-90" : ""}`}>›</span>
          </button>
          {openSections.has("codes") && (
          <div className="px-6 pb-6 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 pt-4 mb-2">Generér nye koder</h3>
          <p className="text-sm text-gray-500">
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

          <h3 className="text-sm font-semibold text-gray-700 pt-6 mb-2">Ledige koder ({unused.length})</h3>
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
          )}
        </div>

        {/* ── Users section ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button type="button" onClick={() => toggleSection("users")} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900">👥 Brugere</h2>
              <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{users.length}</span>
            </div>
            <span className={`text-gray-400 text-lg transition-transform ${openSections.has("users") ? "rotate-90" : ""}`}>›</span>
          </button>
          {openSections.has("users") && (
          <div className="px-6 pb-6 border-t border-gray-100">
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
                          oprettet {new Date(u.createdAt).toLocaleDateString("da-DK")}
                          {u.lastLoginAt && (
                            <> · login {new Date(u.lastLoginAt).toLocaleDateString("da-DK")}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                            u.feedbackEnabled
                              ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                              : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50"
                          }`}
                          onClick={() => toggleFeedback(u)}
                          title={u.feedbackEnabled ? "Deaktivér feedback" : "Aktivér feedback"}
                        >
                          💬 {u.feedbackEnabled ? "On" : "Off"}
                        </button>
                        <div className="flex items-center gap-0.5 rounded-md border border-purple-200 bg-white px-1.5 py-1 text-xs text-purple-600">
                          <span className="text-[10px] mr-0.5">💾</span>
                          <button
                            type="button"
                            disabled={busy || u.maxDesigns <= 1}
                            className="w-5 h-5 rounded hover:bg-purple-100 disabled:opacity-30 disabled:cursor-not-allowed text-center leading-5 font-bold"
                            onClick={() => updateMaxDesigns(u, u.maxDesigns - 1)}
                            title="Færre designs"
                          >
                            −
                          </button>
                          <span className="w-5 text-center font-semibold text-[11px]">{u.maxDesigns}</span>
                          <button
                            type="button"
                            disabled={busy || u.maxDesigns >= 20}
                            className="w-5 h-5 rounded hover:bg-purple-100 disabled:opacity-30 disabled:cursor-not-allowed text-center leading-5 font-bold"
                            onClick={() => updateMaxDesigns(u, u.maxDesigns + 1)}
                            title="Flere designs"
                          >
                            +
                          </button>
                        </div>
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
          )}
        </div>

        {/* ── User Activity ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button type="button" onClick={() => toggleSection("activity")} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900">📊 Brugeraktivitet</h2>
              <span className="text-xs text-gray-400">Sidste 30 dage</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fetchActivity(); }}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                🔄
              </button>
              <span className={`text-gray-400 text-lg transition-transform ${openSections.has("activity") ? "rotate-90" : ""}`}>›</span>
            </div>
          </button>
          {openSections.has("activity") && (
          <div className="px-6 pb-6 border-t border-gray-100">
          {loading ? (
            <p className="mt-3 text-sm text-gray-400">Indlæser…</p>
          ) : activityUsers.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400 italic">
              Ingen aktivitetsdata endnu.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {activityUsers.map((au) => {
                const isExpanded = activityDetailId === au.id;
                const totalActions = Object.values(au.actions).reduce((s, n) => s + n, 0);

                // Friendly labels for action types
                const ACTION_LABELS: Record<string, { icon: string; label: string }> = {
                  login: { icon: "🔑", label: "Logins" },
                  "chat:message": { icon: "💬", label: "Chat" },
                  "tab:create": { icon: "✏️", label: "Opret" },
                  "tab:content": { icon: "📋", label: "Indhold" },
                  "tab:groups": { icon: "📁", label: "Grupper" },
                  "tab:plants": { icon: "🌱", label: "Bibliotek" },
                  "tab:view": { icon: "🗺️", label: "Visning" },
                  "tab:scan": { icon: "📷", label: "Værktøj" },
                  "tab:chat": { icon: "💬", label: "Rådgiver" },
                  "tab:tasks": { icon: "📝", label: "Opgaver" },
                  "tab:conflicts": { icon: "⚠️", label: "Konflikter" },
                  "tab:designs": { icon: "💾", label: "Designs" },
                  "tab:climate": { icon: "🌡️", label: "Klima" },
                  "scan:plant": { icon: "🌿", label: "Plantescan" },
                  "scan:disease": { icon: "🔬", label: "Sygdomsscan" },
                  "scan:soil": { icon: "🪨", label: "Jordscan" },
                  "scan:weed": { icon: "🌾", label: "Ukrudtsscan" },
                  "advisor:open": { icon: "🧑‍🌾", label: "Rådgiver" },
                  "guide:open": { icon: "❓", label: "Guide" },
                };

                // Time ago helper
                const timeAgo = (isoStr: string | null) => {
                  if (!isoStr) return "Aldrig";
                  const diff = Date.now() - new Date(isoStr).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 1) return "Lige nu";
                  if (mins < 60) return `${mins} min siden`;
                  const hours = Math.floor(mins / 60);
                  if (hours < 24) return `${hours}t siden`;
                  const days = Math.floor(hours / 24);
                  if (days < 7) return `${days}d siden`;
                  return new Date(isoStr).toLocaleDateString("da-DK");
                };

                // Activity status indicator
                const lastAct = au.lastActivity ? new Date(au.lastActivity).getTime() : 0;
                const daysSinceActive = lastAct ? Math.floor((Date.now() - lastAct) / (24 * 60 * 60 * 1000)) : 999;
                const statusColor = daysSinceActive <= 1 ? "bg-green-400" : daysSinceActive <= 7 ? "bg-yellow-400" : daysSinceActive <= 30 ? "bg-orange-400" : "bg-gray-300";

                return (
                  <div key={au.id} className="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors"
                      onClick={() => {
                        if (isExpanded) {
                          setActivityDetailId(null);
                          setActivityLogs([]);
                        } else {
                          setActivityDetailId(au.id);
                          fetchActivityDetail(au.id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor}`} title={`Sidst aktiv: ${timeAgo(au.lastActivity)}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {au.name || au.email}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Sidst login: {timeAgo(au.lastLoginAt)} · {au.totalLogins} logins totalt · {totalActions} handlinger (30d)
                          </p>
                        </div>
                        {/* Top used features as pills */}
                        <div className="flex gap-1 shrink-0">
                          {Object.entries(au.actions)
                            .filter(([k]) => k !== "login")
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 4)
                            .map(([action, count]) => {
                              const info = ACTION_LABELS[action] ?? { icon: "•", label: action };
                              return (
                                <span
                                  key={action}
                                  className="inline-flex items-center gap-0.5 rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600"
                                  title={`${info.label}: ${count}×`}
                                >
                                  {info.icon} {count}
                                </span>
                              );
                            })}
                        </div>
                        <span className="text-gray-300 text-xs shrink-0">
                          {isExpanded ? "▼" : "›"}
                        </span>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-white space-y-3">
                        {/* Action summary grid */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2">Feature-brug (30 dage)</p>
                          {Object.keys(au.actions).length === 0 ? (
                            <p className="text-xs text-gray-400 italic">Ingen aktivitet registreret endnu.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(au.actions)
                                .sort((a, b) => b[1] - a[1])
                                .map(([action, count]) => {
                                  const info = ACTION_LABELS[action] ?? { icon: "•", label: action.replace("tab:", "").replace("scan:", "") };
                                  return (
                                    <span
                                      key={action}
                                      className="inline-flex items-center gap-1 rounded-md bg-gray-100 border border-gray-200 px-2.5 py-1 text-xs text-gray-700"
                                    >
                                      {info.icon} {info.label}: <strong>{count}</strong>
                                    </span>
                                  );
                                })}
                            </div>
                          )}
                        </div>

                        {/* Recent activity log */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 mb-2">Seneste aktivitet</p>
                          {activityLogsLoading ? (
                            <p className="text-xs text-gray-400">Indlæser…</p>
                          ) : activityLogs.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">Ingen logposter.</p>
                          ) : (
                            <div className="max-h-60 overflow-y-auto space-y-1">
                              {activityLogs.slice(0, 50).map((log) => {
                                const info = ACTION_LABELS[log.action] ?? { icon: "•", label: log.action };
                                return (
                                  <div
                                    key={log.id}
                                    className="flex items-center gap-2 text-xs text-gray-600 py-0.5"
                                  >
                                    <span className="text-gray-400 w-28 shrink-0 text-[10px]">
                                      {new Date(log.createdAt).toLocaleString("da-DK", {
                                        day: "numeric",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                    <span>{info.icon}</span>
                                    <span className="font-medium">{info.label}</span>
                                    {log.detail && (
                                      <span className="text-gray-400 truncate">– {log.detail}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Meta info */}
                        <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
                          Konto oprettet: {new Date(au.createdAt).toLocaleDateString("da-DK")} · Sidst aktiv: {timeAgo(au.lastActivity)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
          )}
        </div>

        {/* ── Feedback overview ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button type="button" onClick={() => toggleSection("feedback")} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900">💬 Feedback</h2>
              {feedbackItems.length > 0 && <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{feedbackItems.length}</span>}
              {feedbackItems.filter(f => f.status === "new").length > 0 && <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{feedbackItems.filter(f => f.status === "new").length} nye</span>}
            </div>
            <span className={`text-gray-400 text-lg transition-transform ${openSections.has("feedback") ? "rotate-90" : ""}`}>›</span>
          </button>
          {openSections.has("feedback") && (
          <div className="px-6 pb-6 border-t border-gray-100">
          <p className="pt-4 text-sm text-gray-500">
            Indmeldinger fra brugere – fejl, idéer, spørgsmål m.m.
          </p>
          {loading ? (
            <p className="mt-3 text-sm text-gray-400">Indlæser…</p>
          ) : feedbackItems.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400 italic">
              Ingen feedback modtaget endnu.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {feedbackItems.map((fb) => {
                const typeEmoji: Record<string, string> = {
                  bug: "🐛",
                  idea: "💡",
                  question: "❓",
                  other: "📝",
                };
                const statusOptions = [
                  { value: "new", label: "🆕 Ny" },
                  { value: "read", label: "👀 Læst" },
                  { value: "in-progress", label: "🔧 I gang" },
                  { value: "fixed", label: "✅ Fixet" },
                  { value: "closed", label: "🔒 Lukket" },
                ];
                const isExpanded = feedbackDetail === fb.id;
                return (
                  <div
                    key={fb.id}
                    className="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden"
                  >
                    {/* Summary row */}
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-gray-100 transition-colors"
                      onClick={() =>
                        setFeedbackDetail(isExpanded ? null : fb.id)
                      }
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm shrink-0">
                          {typeEmoji[fb.type] || "📝"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {fb.title}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {fb.user.name || fb.user.email} ·{" "}
                            {new Date(fb.createdAt).toLocaleDateString("da-DK")}{" "}
                            {fb._count.replies > 0 && (
                              <span>· 💬 {fb._count.replies} svar</span>
                            )}
                          </p>
                        </div>
                        <select
                          className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:border-green-400 focus:outline-none"
                          value={fb.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateFeedbackStatus(fb.id, e.target.value);
                          }}
                        >
                          {statusOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <span className="text-gray-300 text-xs">
                          {isExpanded ? "▼" : "›"}
                        </span>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-white">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {fb.description}
                        </p>
                        {fb.imageData && (
                          <div className="rounded-lg border border-gray-200 overflow-hidden">
                            <img
                              src={fb.imageData}
                              alt="Vedhæftet billede"
                              className="w-full max-h-64 object-contain bg-gray-50"
                            />
                          </div>
                        )}

                        {/* Admin reply input */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                            placeholder="Skriv et svar til brugeren…"
                            value={feedbackDetail === fb.id ? adminReplyText : ""}
                            onChange={(e) => setAdminReplyText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                sendAdminReply(fb.id);
                              }
                            }}
                          />
                          <button
                            type="button"
                            disabled={adminReplying || !adminReplyText.trim()}
                            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40 transition-colors"
                            onClick={() => sendAdminReply(fb.id)}
                          >
                            {adminReplying ? "…" : "Svar"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
          )}
        </div>

        {/* ── Icon Bank section ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <button type="button" onClick={() => toggleSection("icons")} className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900">🏛️ Ikon-bank</h2>
              {bankIcons.filter(i => i.status === "pending").length > 0 && <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{bankIcons.filter(i => i.status === "pending").length} afventer</span>}
            </div>
            <span className={`text-gray-400 text-lg transition-transform ${openSections.has("icons") ? "rotate-90" : ""}`}>›</span>
          </button>
          {openSections.has("icons") && (
          <div className="px-6 pb-6 border-t border-gray-100">
          <p className="pt-4 text-sm text-gray-500">
            AI-genererede ikoner indsendt af brugere. Godkend dem for at gøre dem tilgængelige for alle.
          </p>

          {(() => {
            const pending = bankIcons.filter((i) => i.status === "pending");
            const approved = bankIcons.filter((i) => i.status === "approved");
            const rejected = bankIcons.filter((i) => i.status === "rejected");

            const updateStatus = async (id: string, status: string) => {
              setBankBusy(id);
              try {
                await fetch("/api/admin/icon-bank", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id, status }),
                });
                await fetchBankIcons();
              } catch { /* ignore */ }
              setBankBusy(null);
            };

            const deleteIcon = async (id: string) => {
              setBankBusy(id);
              try {
                await fetch(`/api/admin/icon-bank?id=${id}`, { method: "DELETE" });
                await fetchBankIcons();
              } catch { /* ignore */ }
              setBankBusy(null);
            };

            const renderIconCard = (icon: BankIcon) => (
              <div
                key={icon.id}
                className={`rounded-lg border p-3 flex items-start gap-3 ${
                  icon.status === "pending"
                    ? "border-amber-200 bg-amber-50/50"
                    : icon.status === "approved"
                    ? "border-green-200 bg-green-50/50"
                    : "border-red-200 bg-red-50/50"
                }`}
              >
                <img
                  src={icon.imageData}
                  alt={icon.prompt}
                  className="w-14 h-14 rounded-lg border border-gray-200 object-contain bg-white shadow-sm shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{icon.prompt}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    af {icon.user.name || icon.user.email} · {new Date(icon.createdAt).toLocaleDateString("da-DK")}
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    {icon.status === "pending" && (
                      <>
                        <button
                          type="button"
                          disabled={bankBusy === icon.id}
                          className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                          onClick={() => updateStatus(icon.id, "approved")}
                        >
                          ✓ Godkend
                        </button>
                        <button
                          type="button"
                          disabled={bankBusy === icon.id}
                          className="rounded-md bg-red-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                          onClick={() => updateStatus(icon.id, "rejected")}
                        >
                          ✗ Afvis
                        </button>
                      </>
                    )}
                    {icon.status === "approved" && (
                      <button
                        type="button"
                        disabled={bankBusy === icon.id}
                        className="rounded-md border border-red-300 px-2.5 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                        onClick={() => updateStatus(icon.id, "rejected")}
                      >
                        Træk tilbage
                      </button>
                    )}
                    {icon.status === "rejected" && (
                      <button
                        type="button"
                        disabled={bankBusy === icon.id}
                        className="rounded-md border border-green-300 px-2.5 py-1 text-[11px] text-green-600 hover:bg-green-50 disabled:opacity-50 transition-colors"
                        onClick={() => updateStatus(icon.id, "approved")}
                      >
                        Godkend alligevel
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={bankBusy === icon.id}
                      className="rounded-md border border-gray-300 px-2.5 py-1 text-[11px] text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      onClick={() => deleteIcon(icon.id)}
                    >
                      🗑 Slet
                    </button>
                  </div>
                </div>
              </div>
            );

            return (
              <div className="mt-4 space-y-4">
                {/* Pending */}
                {pending.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-amber-700 mb-2">
                      ⏳ Afventer godkendelse ({pending.length})
                    </h3>
                    <div className="space-y-2">
                      {pending.map(renderIconCard)}
                    </div>
                  </div>
                )}

                {/* Approved */}
                {approved.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-green-700 mb-2">
                      ✅ Godkendte ({approved.length})
                    </h3>
                    <div className="space-y-2">
                      {approved.map(renderIconCard)}
                    </div>
                  </div>
                )}

                {/* Rejected */}
                {rejected.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-red-600 mb-2">
                      ❌ Afviste ({rejected.length})
                    </h3>
                    <div className="space-y-2">
                      {rejected.map(renderIconCard)}
                    </div>
                  </div>
                )}

                {bankIcons.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">
                    Ingen ikoner indsendt endnu. Brugere kan generere og indsende ikoner fra ikonvælgeren.
                  </p>
                )}
              </div>
            );
          })()}
          </div>
          )}
        </div>

        {/* ═══════════════════ Announcements (F6) ═══════════════════ */}
        <div className="rounded-lg border border-gray-700 overflow-hidden">
          <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-750 transition-colors text-left" onClick={() => toggleSection("announcements")}>
            <h2 className="text-lg font-semibold text-white">📢 Meddelelser</h2>
            <span className={`text-gray-400 text-lg transition-transform ${openSections.has("announcements") ? "rotate-90" : ""}`}>›</span>
          </button>
          {openSections.has("announcements") && (() => {
            // Load announcements on open
            if (!annLoading && annList.length === 0) {
              setAnnLoading(true);
              fetch("/api/admin/announcements").then((r) => r.json()).then((data) => {
                if (Array.isArray(data)) setAnnList(data);
              }).catch(() => {}).finally(() => setAnnLoading(false));
            }
            const handleSend = async () => {
              if (!annMessage.trim() || annSending) return;
              setAnnSending(true);
              try {
                const res = await fetch("/api/admin/announcements", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ message: annMessage.trim(), type: annType, expiresInHours: annExpiry || undefined }),
                });
                if (res.ok) {
                  const created = await res.json();
                  setAnnList((prev) => [created, ...prev]);
                  setAnnMessage("");
                }
              } catch {} finally { setAnnSending(false); }
            };
            const handleDeactivate = async (id: string) => {
              await fetch(`/api/admin/announcements?id=${id}`, { method: "DELETE" });
              setAnnList((prev) => prev.map((a) => a.id === id ? { ...a, active: false } : a));
            };
            return (
              <div className="p-4 space-y-4">
                {/* Create announcement */}
                <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                  <textarea
                    value={annMessage}
                    onChange={(e) => setAnnMessage(e.target.value)}
                    placeholder="Skriv meddelelse til alle brugere…"
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                  <div className="flex items-center gap-3">
                    <select value={annType} onChange={(e) => setAnnType(e.target.value as typeof annType)} className="rounded-lg border border-gray-600 bg-gray-900 px-2 py-1.5 text-xs text-white">
                      <option value="info">ℹ️ Info</option>
                      <option value="warning">⚠️ Advarsel</option>
                      <option value="success">✅ Succes</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-gray-400">Udløber om</label>
                      <input type="number" min={1} max={720} value={annExpiry} onChange={(e) => setAnnExpiry(e.target.value ? Number(e.target.value) : "")} className="w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white" />
                      <span className="text-xs text-gray-400">timer</span>
                    </div>
                    <button
                      onClick={handleSend}
                      disabled={annSending || !annMessage.trim()}
                      className="ml-auto rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {annSending ? "Sender…" : "📤 Send"}
                    </button>
                  </div>
                </div>

                {/* List */}
                {annList.length === 0 && !annLoading && <p className="text-sm text-gray-400 text-center py-4">Ingen meddelelser endnu.</p>}
                {annList.map((a) => (
                  <div key={a.id} className={`flex items-start justify-between rounded-lg border px-3 py-2 text-sm ${a.active ? "border-gray-600 bg-gray-800/50" : "border-gray-700/50 bg-gray-900/30 opacity-50"}`}>
                    <div>
                      <span className="mr-1">{a.type === "warning" ? "⚠️" : a.type === "success" ? "✅" : "ℹ️"}</span>
                      <span className="text-white">{a.message}</span>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {new Date(a.createdAt).toLocaleString("da-DK")}
                        {a.expiresAt && ` — udløber ${new Date(a.expiresAt).toLocaleString("da-DK")}`}
                        {!a.active && " — deaktiveret"}
                      </div>
                    </div>
                    {a.active && (
                      <button onClick={() => handleDeactivate(a.id)} className="ml-2 text-xs text-red-400 hover:text-red-300 whitespace-nowrap">❌ Deaktivér</button>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
      <ToastNotification message={toastMsg} type={toastType} onClose={clearToast} />
    </div>
  );
}
