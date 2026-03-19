"use client";
// ---------------------------------------------------------------------------
// GardenOS – Feedback Panel
// ---------------------------------------------------------------------------
// Floating panel that lets users submit bugs, ideas, questions.
// Shows their previous submissions and admin replies.
// ---------------------------------------------------------------------------
import { useSession } from "next-auth/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

type FeedbackType = "bug" | "idea" | "question" | "other";

type FeedbackItem = {
  id: string;
  type: FeedbackType;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: { replies: number };
};

type FeedbackDetail = FeedbackItem & {
  description: string;
  imageData: string | null;
  replies: Array<{
    id: string;
    message: string;
    createdAt: string;
    user: { name: string | null; email: string; role: string };
  }>;
};

const TYPE_META: Record<FeedbackType, { emoji: string; label: string }> = {
  bug: { emoji: "🐛", label: "Fejl / Bug" },
  idea: { emoji: "💡", label: "Idé / Ønske" },
  question: { emoji: "❓", label: "Spørgsmål" },
  other: { emoji: "📝", label: "Andet" },
};

const STATUS_META: Record<string, { emoji: string; label: string; color: string }> = {
  new: { emoji: "🆕", label: "Ny", color: "text-blue-600 bg-blue-50" },
  read: { emoji: "👀", label: "Læst", color: "text-gray-600 bg-gray-100" },
  "in-progress": { emoji: "🔧", label: "I gang", color: "text-orange-600 bg-orange-50" },
  fixed: { emoji: "✅", label: "Fixet", color: "text-green-600 bg-green-50" },
  closed: { emoji: "🔒", label: "Lukket", color: "text-gray-500 bg-gray-100" },
};

export default function FeedbackPanel({ triggerClassName, triggerContent }: { triggerClassName?: string; triggerContent?: ReactNode } = {}) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"intro" | "list" | "new" | "detail">("intro");
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
  const [feedbackEnabled, setFeedbackEnabled] = useState<boolean | null>(null);

  // New feedback form state
  const [fbType, setFbType] = useState<FeedbackType>("bug");
  const [fbTitle, setFbTitle] = useState("");
  const [fbDesc, setFbDesc] = useState("");
  const [fbImage, setFbImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reply state
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feedback");
      const data = await res.json();
      if (data.feedback) setItems(data.feedback);
      if (typeof data.feedbackEnabled === "boolean") setFeedbackEnabled(data.feedbackEnabled);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/feedback?id=${id}`);
      const data = await res.json();
      if (data.feedback) setDetail(data.feedback);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && view === "list") fetchItems();
  }, [open, view, fetchItems]);

  // Check intro seen
  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasSeenIntro(!!localStorage.getItem("gardenos:feedback:introSeen"));
    }
  }, []);

  // Check feedbackEnabled on mount (lightweight)
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      try {
        const res = await fetch("/api/feedback");
        const data = await res.json();
        if (typeof data.feedbackEnabled === "boolean") setFeedbackEnabled(data.feedbackEnabled);
      } catch { /* ignore */ }
    })();
  }, [session?.user]);

  const handleOpen = () => {
    setOpen(true);
    if (!hasSeenIntro) {
      setView("intro");
    } else {
      setView("list");
    }
  };

  const dismissIntro = () => {
    localStorage.setItem("gardenos:feedback:introSeen", "1");
    setHasSeenIntro(true);
    setView("list");
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Billedet er for stort – max 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // Resize to max 800px
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 800;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setFbImage(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const submitFeedback = async () => {
    if (!fbTitle.trim() || !fbDesc.trim()) {
      alert("Titel og beskrivelse er påkrævet.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: fbType,
          title: fbTitle.trim(),
          description: fbDesc.trim(),
          imageData: fbImage,
        }),
      });
      if (res.ok) {
        // Reset form
        setFbType("bug");
        setFbTitle("");
        setFbDesc("");
        setFbImage(null);
        setView("list");
        fetchItems();
      } else {
        const data = await res.json();
        alert(data.error || "Kunne ikke oprette feedback");
      }
    } catch {
      alert("Netværksfejl – prøv igen");
    }
    setSubmitting(false);
  };

  const sendReply = async () => {
    if (!detail || !replyText.trim()) return;
    setReplying(true);
    try {
      const res = await fetch("/api/feedback/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackId: detail.id,
          message: replyText.trim(),
        }),
      });
      if (res.ok) {
        setReplyText("");
        fetchDetail(detail.id);
      } else {
        const data = await res.json();
        alert(data.error || "Kunne ikke sende svar");
      }
    } catch {
      alert("Netværksfejl");
    }
    setReplying(false);
  };

  // ── Render ──
  // Admin always sees feedback; regular users only when enabled
  const shouldShow = isAdmin || feedbackEnabled === true;
  if (!shouldShow) return null;

  return (
    <>
      {/* Feedback trigger button */}
      <button
        type="button"
        className={triggerClassName || "rounded-md px-2 md:px-2.5 py-1.5 text-xs text-foreground/60 hover:bg-foreground/5 transition-colors relative"}
        onClick={handleOpen}
        title="Giv feedback"
      >
        {triggerContent || (<>💬 <span className="hidden md:inline">Feedback</span></>)}
        {!triggerContent && items.some((i) => i.status === "fixed") && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
        )}
      </button>

      {/* Panel overlay */}
      {open && (
        <div className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-lg mx-2 mb-2 md:mb-0 max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
              <div className="flex items-center gap-2">
                <span className="text-lg">💬</span>
                <h2 className="text-sm font-semibold text-gray-900">
                  {view === "intro" && "Velkommen til Feedback"}
                  {view === "list" && "Mine indmeldinger"}
                  {view === "new" && "Ny indmelding"}
                  {view === "detail" && (detail?.title || "Detaljer")}
                </h2>
              </div>
              <div className="flex items-center gap-1">
                {(view === "detail" || view === "new") && (
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                    onClick={() => { setView("list"); setDetail(null); }}
                  >
                    ← Tilbage
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* ── INTRO VIEW ── */}
              {view === "intro" && (
                <div className="space-y-4">
                  <div className="text-center space-y-2">
                    <span className="text-4xl">🌱</span>
                    <h3 className="text-lg font-bold text-gray-900">
                      Hjælp os med at forbedre GardenOS!
                    </h3>
                  </div>
                  <div className="space-y-3 text-sm text-gray-600">
                    <p>
                      Tak fordi du vil give feedback! Det hjælper os med at gøre appen bedre for alle.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                        <span className="text-xl">🐛</span>
                        <p className="text-xs mt-1 font-medium">Rapportér fejl</p>
                      </div>
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                        <span className="text-xl">💡</span>
                        <p className="text-xs mt-1 font-medium">Del idéer</p>
                      </div>
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                        <span className="text-xl">📸</span>
                        <p className="text-xs mt-1 font-medium">Tag et billede</p>
                      </div>
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                        <span className="text-xl">💬</span>
                        <p className="text-xs mt-1 font-medium">Følg dialogen</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      Du kan se status på dine indmeldinger og få svar direkte her.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
                    onClick={dismissIntro}
                  >
                    🚀 Kom i gang
                  </button>
                </div>
              )}

              {/* ── LIST VIEW ── */}
              {view === "list" && (
                <div className="space-y-3">
                  <button
                    type="button"
                    className="w-full rounded-lg border-2 border-dashed border-green-300 bg-green-50/50 px-4 py-3 text-sm font-medium text-green-700 hover:bg-green-50 hover:border-green-400 transition-colors"
                    onClick={() => setView("new")}
                  >
                    ➕ Ny indmelding
                  </button>

                  {loading ? (
                    <p className="text-center text-sm text-gray-400 py-4">Indlæser…</p>
                  ) : items.length === 0 ? (
                    <div className="text-center py-6 space-y-2">
                      <span className="text-3xl">📭</span>
                      <p className="text-sm text-gray-400">
                        Ingen indmeldinger endnu. Opret din første!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item) => {
                        const typeMeta = TYPE_META[item.type as FeedbackType] || TYPE_META.other;
                        const statusMeta = STATUS_META[item.status] || STATUS_META.new;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="w-full text-left rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 hover:bg-gray-100 transition-colors"
                            onClick={() => {
                              setView("detail");
                              fetchDetail(item.id);
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-sm shrink-0 mt-0.5">
                                {typeMeta.emoji}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {item.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span
                                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusMeta.color}`}
                                  >
                                    {statusMeta.emoji} {statusMeta.label}
                                  </span>
                                  {item._count.replies > 0 && (
                                    <span className="text-[10px] text-gray-400">
                                      💬 {item._count.replies} svar
                                    </span>
                                  )}
                                  <span className="text-[10px] text-gray-400">
                                    {new Date(item.createdAt).toLocaleDateString("da-DK")}
                                  </span>
                                </div>
                              </div>
                              <span className="text-gray-300 text-xs mt-1">›</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── NEW FEEDBACK VIEW ── */}
              {view === "new" && (
                <div className="space-y-4">
                  {/* Type picker */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(Object.entries(TYPE_META) as [FeedbackType, { emoji: string; label: string }][]).map(
                        ([key, meta]) => (
                          <button
                            key={key}
                            type="button"
                            className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                              fbType === key
                                ? "border-green-400 bg-green-50 text-green-800 font-medium"
                                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                            }`}
                            onClick={() => setFbType(key)}
                          >
                            {meta.emoji} {meta.label}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Titel
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                      placeholder="Kort beskrivelse af dit emne…"
                      value={fbTitle}
                      onChange={(e) => setFbTitle(e.target.value)}
                      maxLength={100}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Beskrivelse
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                      rows={4}
                      placeholder="Fortæl os mere… Hvad skete der? Hvad forventede du?"
                      value={fbDesc}
                      onChange={(e) => setFbDesc(e.target.value)}
                      maxLength={2000}
                    />
                    <p className="text-right text-[10px] text-gray-400 mt-0.5">
                      {fbDesc.length}/2000
                    </p>
                  </div>

                  {/* Image */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Billede (valgfrit)
                    </label>
                    {fbImage ? (
                      <div className="relative rounded-lg border border-gray-200 overflow-hidden">
                        <img
                          src={fbImage}
                          alt="Screenshot"
                          className="w-full max-h-48 object-contain bg-gray-50"
                        />
                        <button
                          type="button"
                          className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-xs text-gray-500 hover:text-red-500 shadow"
                          onClick={() => setFbImage(null)}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="w-full rounded-lg border-2 border-dashed border-gray-200 py-4 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        📸 Tilføj screenshot eller billede
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleImagePick}
                    />
                  </div>

                  {/* Submit */}
                  <button
                    type="button"
                    className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    onClick={submitFeedback}
                    disabled={submitting || !fbTitle.trim() || !fbDesc.trim()}
                  >
                    {submitting ? "Sender…" : "📤 Send indmelding"}
                  </button>
                </div>
              )}

              {/* ── DETAIL VIEW ── */}
              {view === "detail" && (
                loading ? (
                  <p className="text-center text-sm text-gray-400 py-4">Indlæser…</p>
                ) : detail ? (
                  <div className="space-y-4">
                    {/* Header info */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {(TYPE_META[detail.type as FeedbackType] || TYPE_META.other).emoji}
                        </span>
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                            (STATUS_META[detail.status] || STATUS_META.new).color
                          }`}
                        >
                          {(STATUS_META[detail.status] || STATUS_META.new).emoji}{" "}
                          {(STATUS_META[detail.status] || STATUS_META.new).label}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(detail.createdAt).toLocaleDateString("da-DK")}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {detail.description}
                      </p>
                      {detail.imageData && (
                        <div className="rounded-lg border border-gray-200 overflow-hidden">
                          <img
                            src={detail.imageData}
                            alt="Vedhæftet billede"
                            className="w-full max-h-64 object-contain bg-gray-50"
                          />
                        </div>
                      )}
                    </div>

                    {/* Replies */}
                    {detail.replies.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Dialog
                        </h4>
                        {detail.replies.map((reply) => {
                          const isAdminReply = reply.user.role === "admin";
                          return (
                            <div
                              key={reply.id}
                              className={`rounded-lg px-3 py-2 text-sm ${
                                isAdminReply
                                  ? "bg-green-50 border border-green-100 ml-4"
                                  : "bg-gray-50 border border-gray-100 mr-4"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[10px] font-medium text-gray-500">
                                  {isAdminReply ? "🛡️ Admin" : "👤 Dig"}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  {new Date(reply.createdAt).toLocaleDateString("da-DK", {
                                    day: "numeric",
                                    month: "short",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              <p className="text-gray-700 whitespace-pre-wrap">
                                {reply.message}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Reply input */}
                    {detail.status !== "closed" && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400"
                          placeholder="Skriv et svar…"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              sendReply();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                          onClick={sendReply}
                          disabled={replying || !replyText.trim()}
                        >
                          {replying ? "…" : "↑"}
                        </button>
                      </div>
                    )}

                    {detail.status === "fixed" && (
                      <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 text-center">
                        ✅ Denne indmelding er markeret som fixet!
                      </div>
                    )}

                    {detail.status === "closed" && (
                      <div className="rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-500 text-center">
                        🔒 Denne indmelding er lukket.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-sm text-gray-400 py-4">
                    Kunne ikke indlæse detaljer.
                  </p>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
