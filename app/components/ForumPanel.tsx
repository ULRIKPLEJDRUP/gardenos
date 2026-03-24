"use client";
// ---------------------------------------------------------------------------
// GardenOS – Forum / Community Panel (E2)
// ---------------------------------------------------------------------------
// Full-featured forum UI: browse threads by category, create threads,
// view thread + replies, reply, like, search. Renders as a full-page
// overlay similar to DesignLab.
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback } from "react";

// ── Types ──
interface ForumUser {
  id: string;
  name: string | null;
  email: string;
}

interface ForumReply {
  id: string;
  threadId: string;
  userId: string;
  body: string;
  imageData?: string | null;
  createdAt: string;
  user: ForumUser;
  likes: { userId: string }[];
}

interface ForumThread {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: string;
  imageData?: string | null;
  pinned: boolean;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  user: ForumUser;
  replies?: ForumReply[];
  likes?: { userId: string }[];
  _count: { replies: number; likes: number };
}

interface ForumListResponse {
  threads: ForumThread[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Constants ──
const CATEGORIES = [
  { id: "all", label: "Alle", icon: "📋" },
  { id: "general", label: "Generelt", icon: "💬" },
  { id: "bed-design", label: "Bed-design", icon: "🌱" },
  { id: "pests", label: "Skadedyr", icon: "🐛" },
  { id: "harvest", label: "Høst", icon: "🥕" },
  { id: "varieties", label: "Sorter", icon: "🌻" },
  { id: "tips", label: "Tips & tricks", icon: "💡" },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "lige nu";
  if (mins < 60) return `${mins} min siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} timer siden`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} dage siden`;
  return new Date(dateStr).toLocaleDateString("da-DK");
}

// ═══════════════════════════════════════════════════════════════════════════
// ForumPanel
// ═══════════════════════════════════════════════════════════════════════════
export default function ForumPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // View state
  const [activeThread, setActiveThread] = useState<ForumThread | null>(null);
  const [showNewThread, setShowNewThread] = useState(false);

  // New thread form
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState("general");

  // Reply form
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);

  // ── Fetch threads ──
  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (search.trim()) params.set("q", search.trim());
      params.set("page", String(page));
      const res = await fetch(`/api/forum?${params}`);
      if (res.ok) {
        const data: ForumListResponse = await res.json();
        setThreads(data.threads);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Forum fetch error:", err);
    }
    setLoading(false);
  }, [category, search, page]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // ── Fetch single thread ──
  const openThread = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/forum?id=${id}`);
      if (res.ok) {
        const thread: ForumThread = await res.json();
        setActiveThread(thread);
      }
    } catch (err) {
      console.error("Forum thread fetch error:", err);
    }
  }, []);

  // ── Create thread ──
  const createThread = useCallback(async () => {
    if (!newTitle.trim() || !newBody.trim()) return;
    try {
      const res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, body: newBody, category: newCategory }),
      });
      if (res.ok) {
        setNewTitle("");
        setNewBody("");
        setShowNewThread(false);
        fetchThreads();
      }
    } catch (err) {
      console.error("Forum create error:", err);
    }
  }, [newTitle, newBody, newCategory, fetchThreads]);

  // ── Reply ──
  const submitReply = useCallback(async () => {
    if (!activeThread || !replyBody.trim()) return;
    setReplying(true);
    try {
      const res = await fetch("/api/forum/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThread.id, body: replyBody }),
      });
      if (res.ok) {
        setReplyBody("");
        openThread(activeThread.id); // refresh
      }
    } catch (err) {
      console.error("Forum reply error:", err);
    }
    setReplying(false);
  }, [activeThread, replyBody, openThread]);

  // ── Like ──
  const toggleLike = useCallback(async (threadId?: string, replyId?: string) => {
    try {
      await fetch("/api/forum/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, replyId }),
      });
      if (activeThread) {
        openThread(activeThread.id);
      } else {
        fetchThreads();
      }
    } catch (err) {
      console.error("Forum like error:", err);
    }
  }, [activeThread, openThread, fetchThreads]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  // ═════════════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-[9000] flex flex-col" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <button onClick={onClose} className="text-lg hover:opacity-70" title="Luk forum">✕</button>
        <h1 className="text-lg font-bold flex items-center gap-2">💬 Haveforum</h1>
        {activeThread && (
          <button
            onClick={() => setActiveThread(null)}
            className="ml-2 text-sm px-3 py-1 rounded-lg border hover:shadow-sm"
            style={{ borderColor: "var(--border)" }}
          >
            ← Tilbage
          </button>
        )}
        <div className="flex-1" />
        {!activeThread && !showNewThread && (
          <button
            onClick={() => setShowNewThread(true)}
            className="px-3 py-1.5 text-sm font-medium rounded-lg"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            ✏️ Nyt indlæg
          </button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar: Categories ── */}
        <nav className="w-48 border-r p-3 space-y-1 overflow-y-auto hidden md:block" style={{ borderColor: "var(--border)" }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setCategory(cat.id); setPage(1); setActiveThread(null); }}
              className={`w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${category === cat.id ? "font-semibold" : "hover:opacity-80"}`}
              style={{
                background: category === cat.id ? "var(--accent)" : "transparent",
                color: category === cat.id ? "#fff" : "var(--foreground)",
              }}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </nav>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto p-4">
          {/* ── New thread form ── */}
          {showNewThread && !activeThread && (
            <div className="max-w-2xl mx-auto space-y-3 mb-6 p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <h2 className="text-base font-bold">✏️ Nyt indlæg</h2>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Titel…"
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
                maxLength={200}
              />
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setNewCategory(cat.id)}
                    className="text-xs px-2 py-1 rounded-lg border"
                    style={{
                      borderColor: newCategory === cat.id ? "var(--accent)" : "var(--border)",
                      background: newCategory === cat.id ? "var(--accent)" : "transparent",
                      color: newCategory === cat.id ? "#fff" : "var(--foreground)",
                    }}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Skriv dit indlæg…"
                rows={5}
                className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
                maxLength={10000}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowNewThread(false)}
                  className="px-3 py-1.5 text-sm rounded-lg border"
                  style={{ borderColor: "var(--border)" }}
                >
                  Annullér
                </button>
                <button
                  onClick={createThread}
                  disabled={!newTitle.trim() || !newBody.trim()}
                  className="px-3 py-1.5 text-sm rounded-lg font-medium disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Opret
                </button>
              </div>
            </div>
          )}

          {/* ── Thread detail view ── */}
          {activeThread && (
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Thread header */}
              <div className="p-4 rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {activeThread.pinned && <span title="Pinned">📌</span>}
                      {activeThread.locked && <span title="Låst">🔒</span>}
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                        {CATEGORY_MAP[activeThread.category]?.icon} {CATEGORY_MAP[activeThread.category]?.label || activeThread.category}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold">{activeThread.title}</h2>
                    <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                      {activeThread.user.name || activeThread.user.email} · {timeAgo(activeThread.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleLike(activeThread.id)}
                    className="text-sm flex items-center gap-1 px-2 py-1 rounded-lg border hover:shadow-sm"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {activeThread.likes?.some((l) => l.userId === userId) ? "❤️" : "🤍"} {activeThread._count.likes}
                  </button>
                </div>
                <p className="mt-3 text-sm whitespace-pre-wrap">{activeThread.body}</p>
                {activeThread.imageData && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeThread.imageData} alt="Billede" className="mt-3 rounded-lg max-h-64 object-contain" />
                )}
              </div>

              {/* Replies */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>
                  {activeThread.replies?.length || 0} svar
                </h3>
                {activeThread.replies?.map((reply) => (
                  <div key={reply.id} className="p-3 rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-medium">
                          {reply.user.name || reply.user.email}
                          <span className="ml-2 font-normal" style={{ color: "var(--muted-foreground)" }}>
                            {timeAgo(reply.createdAt)}
                          </span>
                        </p>
                        <p className="text-sm mt-1 whitespace-pre-wrap">{reply.body}</p>
                        {reply.imageData && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={reply.imageData} alt="Billede" className="mt-2 rounded-lg max-h-48 object-contain" />
                        )}
                      </div>
                      <button
                        onClick={() => toggleLike(undefined, reply.id)}
                        className="text-xs flex items-center gap-1 px-2 py-0.5 rounded border hover:shadow-sm"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {reply.likes.some((l) => l.userId === userId) ? "❤️" : "🤍"} {reply.likes.length}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply form */}
              {!activeThread.locked && (
                <div className="flex gap-2">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Skriv et svar…"
                    rows={2}
                    className="flex-1 px-3 py-2 rounded-lg border text-sm resize-none"
                    style={{ borderColor: "var(--border)", background: "var(--background)" }}
                    maxLength={5000}
                  />
                  <button
                    onClick={submitReply}
                    disabled={!replyBody.trim() || replying}
                    className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {replying ? "…" : "Svar"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Thread list ── */}
          {!activeThread && !showNewThread && (
            <>
              {/* Search */}
              <div className="max-w-2xl mx-auto mb-4">
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Søg i forum…"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                />
              </div>

              {/* Mobile categories */}
              <div className="flex gap-1 flex-wrap mb-4 md:hidden max-w-2xl mx-auto">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setCategory(cat.id); setPage(1); }}
                    className="text-xs px-2 py-1 rounded-lg border"
                    style={{
                      borderColor: category === cat.id ? "var(--accent)" : "var(--border)",
                      background: category === cat.id ? "var(--accent)" : "transparent",
                      color: category === cat.id ? "#fff" : "var(--foreground)",
                    }}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="text-center py-12 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Indlæser…
                </div>
              ) : threads.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-3xl mb-2">🌿</p>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    Ingen indlæg endnu. Vær den første!
                  </p>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto space-y-2">
                  {threads.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => openThread(t.id)}
                      className="w-full text-left p-3 rounded-xl border hover:shadow-sm transition-shadow"
                      style={{ borderColor: "var(--border)", background: "var(--card)" }}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {t.pinned && <span className="text-xs">📌</span>}
                            {t.locked && <span className="text-xs">🔒</span>}
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                              {CATEGORY_MAP[t.category]?.icon || "📋"}
                            </span>
                            <h3 className="text-sm font-semibold truncate">{t.title}</h3>
                          </div>
                          <p className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>
                            {t.user.name || t.user.email} · {timeAgo(t.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>
                          <span title="Svar">💬 {t._count.replies}</span>
                          <span title="Likes">❤️ {t._count.likes}</span>
                        </div>
                      </div>
                    </button>
                  ))}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-4">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="px-3 py-1 text-sm rounded-lg border disabled:opacity-30"
                        style={{ borderColor: "var(--border)" }}
                      >
                        ← Forrige
                      </button>
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        Side {page} af {totalPages}
                      </span>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-3 py-1 text-sm rounded-lg border disabled:opacity-30"
                        style={{ borderColor: "var(--border)" }}
                      >
                        Næste →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
