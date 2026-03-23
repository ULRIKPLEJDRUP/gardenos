"use client";
// ---------------------------------------------------------------------------
// GardenOS – ChatPanel (AI Rådgiver)
// Extracted from GardenMapClient to reduce monolith size.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState, memo } from "react";
import { userKey } from "../lib/userStorage";
import {
  getAllPlants,
  getPlantById,
  formatMonthRange,
} from "../lib/plantStore";
import {
  PLANT_CATEGORY_LABELS,
  isEdiblePlant,
} from "../lib/plantTypes";
import type { WeatherData } from "../lib/weatherStore";
import { buildWeatherContextString } from "../lib/weatherStore";
import {
  loadSoilProfiles,
} from "../lib/soilStore";
import {
  SOIL_BASE_TYPE_LABELS,
  DRAINAGE_LABELS,
  MOISTURE_LABELS,
  EARTHWORM_LABELS,
  SOIL_HEALTH_LABELS,
  ORGANIC_LABELS,
  COMPOST_TYPE_LABELS,
  COMPOST_MATURITY_LABELS,
  PH_CATEGORY_LABELS,
  LIME_CONTENT_LABELS,
  NUTRIENT_LABELS,
  COMPRESSION_LABELS,
} from "../lib/soilTypes";
import { createTask, parseAiResponse, loadTasks, PRIORITY_ICONS } from "../lib/taskStore";

// ── Types ──────────────────────────────────────────────────────────────────
type ChatMsg = { role: "user" | "assistant"; content: string; ts: number };

interface WeatherStatsData {
  stats: {
    avgTempMax: number;
    avgTempMin: number;
    totalPrecipitation: number;
    frostDays: number;
    rainDays: number;
  };
  count: number;
}

export interface ChatPanelProps {
  /** Current weather data (may be null before fetch completes) */
  weatherData: WeatherData | null;
  /** Computed weather statistics (last N days) */
  weatherStats: WeatherStatsData | null;
  /** Days range for weather stats (e.g. 30) */
  weatherStatRange: number;
  /** Callback when a task is created from chat, so parent can bump taskVersion */
  onTaskCreated?: () => void;
}

// ── Helpers (module-level, no hooks) ───────────────────────────────────────

/** Read SSE stream, call onChunk with accumulated text. */
async function readSSEStream(
  response: Response,
  onChunk: (accumulated: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Ingen stream modtaget");
  const decoder = new TextDecoder();
  let text = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.content) {
          text += parsed.content;
          onChunk(text);
        }
      } catch { /* skip non-JSON lines */ }
    }
  }
  return text;
}

// Type for garden features read from localStorage
interface GardenFeatureProps {
  gardenosId?: string;
  name?: string;
  kind?: string;
  category?: string;
  planted?: string;
  speciesId?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

function ChatPanelInner({
  weatherData,
  weatherStats,
  weatherStatRange,
  onTaskCreated,
}: ChatPanelProps) {
  // ── Chat state (fully internal) ──
  const CHAT_STORAGE_KEY = "gardenos:chat:history:v1";
  const CHAT_PERSONA_KEY = "gardenos:chat:persona:v1";

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(userKey(CHAT_STORAGE_KEY));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatPersona, setChatPersona] = useState<string>(() => {
    if (typeof window === "undefined") return "organic";
    return localStorage.getItem(userKey(CHAT_PERSONA_KEY)) ?? "organic";
  });
  const [taskSavedFlash, setTaskSavedFlash] = useState<string | false>(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Persist chat messages
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(userKey(CHAT_STORAGE_KEY), JSON.stringify(chatMessages));
  }, [chatMessages]);

  // Persist persona choice
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(userKey(CHAT_PERSONA_KEY), chatPersona);
  }, [chatPersona]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  // ── Climate zone estimator ──
  const estimateDanishClimateZone = useCallback((lat: number) => {
    if (lat >= 57.4) return "7a";
    if (lat >= 56.6) return "7b";
    return "8a";
  }, []);

  // ── Build garden context string for AI ──
  const buildGardenContext = useCallback(() => {
    const parts: string[] = [];

    // 0. Time + location + climate zone
    try {
      const now = new Date();
      const nowDate = new Intl.DateTimeFormat("da-DK", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Europe/Copenhagen",
      }).format(now);
      const month = Number(
        new Intl.DateTimeFormat("en-GB", {
          month: "numeric",
          timeZone: "Europe/Copenhagen",
        }).format(now),
      );
      const viewRaw = localStorage.getItem(userKey("gardenos:view:v1"));
      let locationLine = "Lokation ukendt";
      if (viewRaw) {
        const view = JSON.parse(viewRaw) as { center?: [number, number]; zoom?: number };
        const lat = Number(view?.center?.[0]);
        const lng = Number(view?.center?.[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const zone = estimateDanishClimateZone(lat);
          locationLine = `Koordinater: ${lat.toFixed(5)}, ${lng.toFixed(5)} (estimeret klimazone: ${zone})`;
        }
      }
      const bookmarkRaw = localStorage.getItem(userKey("gardenos:bookmarks:v1"));
      let addressHint = "";
      if (bookmarkRaw) {
        const bms = JSON.parse(bookmarkRaw) as Array<{ name?: string; favorite?: boolean }>;
        const primary = bms.find((b) => b.favorite && b.name) ?? bms.find((b) => b.name);
        if (primary?.name) addressHint = `\nSted/adressehint: ${primary.name}`;
      }
      parts.push(`Nuværende dato/tid (Danmark): ${nowDate}\nMånedstal: ${month}\n${locationLine}${addressHint}`);
    } catch { /* ignore */ }

    // 1. Garden features
    try {
      const layoutRaw = localStorage.getItem(userKey("gardenos:layout:v1"));
      if (layoutRaw) {
        const layout = JSON.parse(layoutRaw);
        if (layout?.features?.length) {
          const featureSummaries = layout.features.map((f: { properties: GardenFeatureProps }) => {
            const p = f.properties;
            const name = p.name || p.kind || "Unavngivet";
            const cat = p.category || "";
            const planted = p.planted ? `, plantet: ${p.planted}` : "";
            const species = p.speciesId ? `, art-id: ${p.speciesId}` : "";
            return `- ${name} (${cat}${planted}${species})`;
          });
          parts.push(`Haven har ${layout.features.length} elementer:\n${featureSummaries.join("\n")}`);
        }
      }
    } catch { /* ignore */ }

    // 2. Plant instances with full species data
    try {
      const instancesRaw = localStorage.getItem(userKey("gardenos:plants:instances:v1"));
      if (instancesRaw) {
        const instances = JSON.parse(instancesRaw) as Array<{
          speciesId?: string; varietyId?: string; varietyName?: string;
          featureId?: string; count?: number; plantedAt?: string; notes?: string;
        }>;
        if (instances.length > 0) {
          const featureNames = new Map<string, string>();
          try {
            const lr = localStorage.getItem(userKey("gardenos:layout:v1"));
            if (lr) {
              const lj = JSON.parse(lr);
              for (const f of lj?.features ?? []) {
                const id = f.properties?.gardenosId;
                const nm = f.properties?.name || f.properties?.kind || "Unavngivet";
                if (id) featureNames.set(id, nm);
              }
            }
          } catch { /* ignore */ }

          const bySpecies = new Map<string, typeof instances>();
          for (const inst of instances) {
            const sid = inst.speciesId ?? "unknown";
            const arr = bySpecies.get(sid) ?? [];
            arr.push(inst);
            bySpecies.set(sid, arr);
          }

          const plantLines: string[] = [];
          for (const [speciesId, insts] of bySpecies) {
            const sp = getPlantById(speciesId);
            if (!sp) {
              plantLines.push(`- ${speciesId}: ${insts.length} stk (ukendt art)`);
              continue;
            }
            const totalCount = insts.reduce((s, i) => s + (i.count ?? 1), 0);
            const locations = [...new Set(insts.map((i) => featureNames.get(i.featureId ?? "") ?? "ukendt bed"))];
            const varieties = [...new Set(insts.filter((i) => i.varietyName).map((i) => i.varietyName!))];

            let line = `- ${sp.icon ?? ""} ${sp.name} (${sp.latinName ?? speciesId}): ${totalCount} stk`;
            line += `, placering: ${locations.join(", ")}`;
            if (varieties.length) line += `, sorter: ${varieties.join(", ")}`;
            line += `, kategori: ${PLANT_CATEGORY_LABELS[sp.category] ?? sp.category}`;
            if (sp.lifecycle) line += `, livscyklus: ${sp.lifecycle}`;
            if (sp.sowIndoor) line += `, forspiring indendørs: ${formatMonthRange(sp.sowIndoor)}`;
            if (sp.sowOutdoor) line += `, direkte såning: ${formatMonthRange(sp.sowOutdoor)}`;
            if (sp.plantOut) line += `, udplantning: ${formatMonthRange(sp.plantOut)}`;
            if (sp.harvest) line += `, høst: ${formatMonthRange(sp.harvest)}`;
            if (sp.light) line += `, lys: ${sp.light}`;
            if (sp.water) line += `, vand: ${sp.water}`;
            if (sp.frostHardy) line += `, frostfast: ja`;
            if (isEdiblePlant(sp)) line += `, spiselig: ja`;
            if (sp.harvestTips) line += `, høsttips: ${sp.harvestTips}`;
            if (sp.pests?.length) line += `, skadedyr: ${sp.pests.join(", ")}`;
            if (sp.diseases?.length) line += `, sygdomme: ${sp.diseases.join(", ")}`;
            const planted = insts.find((i) => i.plantedAt);
            if (planted?.plantedAt) line += `, plantet dato: ${planted.plantedAt}`;
            plantLines.push(line);
          }

          parts.push(
            `BRUGERENS PLANTEDE PLANTER I HAVEN (${instances.length} instanser, ${bySpecies.size} arter):\n` +
            `Dette er de faktiske planter brugeren har i sin have RIGHT NOW:\n${plantLines.join("\n")}`,
          );
        }
      }
    } catch { /* ignore */ }

    // 3. Species NOT planted (for suggestions)
    try {
      const allPlants = getAllPlants();
      const instancesRaw = localStorage.getItem(userKey("gardenos:plants:instances:v1"));
      const plantedIds = new Set<string>();
      if (instancesRaw) {
        const instances = JSON.parse(instancesRaw) as Array<{ speciesId?: string }>;
        instances.forEach((i) => { if (i.speciesId) plantedIds.add(i.speciesId); });
      }
      const unplanted = allPlants.filter((p) => !plantedIds.has(p.id));
      if (unplanted.length > 0) {
        const byCategory: Record<string, string[]> = {};
        const edibleUnplanted: string[] = [];
        unplanted.forEach((p) => {
          const cat = PLANT_CATEGORY_LABELS[p.category] || p.category;
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(p.name);
          if (isEdiblePlant(p)) edibleUnplanted.push(p.name);
        });
        const catSummary = Object.entries(byCategory).map(([cat, names]) => `- ${cat}: ${names.join(", ")}`);
        let bibText = `Plantebibliotek (IKKE plantet endnu, ${unplanted.length} arter tilgængelige til forslag):\n${catSummary.join("\n")}`;
        if (edibleUnplanted.length > 0) {
          bibText += `\n\nSpiselige arter i biblioteket (${edibleUnplanted.length} stk): ${edibleUnplanted.join(", ")}`;
        }
        parts.push(bibText);
      }
    } catch { /* ignore */ }

    // 4. Weather data
    try {
      const weatherCtx = buildWeatherContextString(weatherData);
      if (weatherCtx) parts.push(weatherCtx);
    } catch { /* ignore */ }

    // 5. Historical climate stats
    try {
      if (weatherStats) {
        const s = weatherStats.stats;
        const rangeLabel = `${weatherStatRange} dage`;
        parts.push(
          `Historisk klimastatistik (sidste ${rangeLabel}, ${weatherStats.count} datapunkter):\n` +
          `- Gns. dagtemperatur (maks): ${s.avgTempMax}°C\n` +
          `- Gns. nattemperatur (min): ${s.avgTempMin}°C\n` +
          `- Total nedbør: ${s.totalPrecipitation} mm\n` +
          `- Frostdage: ${s.frostDays}\n` +
          `- Regndage: ${s.rainDays}`,
        );
      }
    } catch { /* ignore */ }

    // 6. Soil profiles
    try {
      const profiles = loadSoilProfiles();
      if (profiles.length > 0) {
        const profileLines = profiles.map((p) => {
          const details: string[] = [];
          if (p.baseType) details.push(`type: ${SOIL_BASE_TYPE_LABELS[p.baseType]}`);
          if (p.drainage) details.push(`dræning: ${DRAINAGE_LABELS[p.drainage]}`);
          if (p.moisture) details.push(`fugtighed: ${MOISTURE_LABELS[p.moisture]}`);
          if (p.droughtProne) details.push("udtørringstruet");
          if (p.earthworms) details.push(`regnorme: ${EARTHWORM_LABELS[p.earthworms]}`);
          if (p.soilHealth) details.push(`sundhed: ${SOIL_HEALTH_LABELS[p.soilHealth]}`);
          if (p.organicVisual) details.push(`organisk: ${ORGANIC_LABELS[p.organicVisual]}`);
          if (p.organicPercent != null) details.push(`organisk %: ${p.organicPercent}`);
          if (p.phMeasured != null) details.push(`pH: ${p.phMeasured}`);
          if (p.phCategory) details.push(`pH-kategori: ${PH_CATEGORY_LABELS[p.phCategory]}`);
          if (p.limeContent) details.push(`kalk: ${LIME_CONTENT_LABELS[p.limeContent]}`);
          if (p.limedRecently) details.push("kalket for nylig");
          if (p.compostTypes?.length) details.push(`kompost: ${p.compostTypes.map((c) => COMPOST_TYPE_LABELS[c]).join(", ")}`);
          if (p.compostMaturity) details.push(`kompost-modenhed: ${COMPOST_MATURITY_LABELS[p.compostMaturity]}`);
          if (p.nitrogen) details.push(`N: ${NUTRIENT_LABELS[p.nitrogen]}`);
          if (p.phosphorus) details.push(`P: ${NUTRIENT_LABELS[p.phosphorus]}`);
          if (p.potassium) details.push(`K: ${NUTRIENT_LABELS[p.potassium]}`);
          if (p.compression) details.push(`kompression: ${COMPRESSION_LABELS[p.compression]}`);
          if (p.lastAmendment) details.push(`seneste forbedring: ${p.lastAmendment}`);
          if (p.notes) details.push(`noter: ${p.notes}`);
          return `- ${p.name}: ${details.length > 0 ? details.join(", ") : "ingen data registreret"}`;
        });
        parts.push(`JORDPROFILER I HAVEN (${profiles.length} profiler):\n${profileLines.join("\n")}`);
      }
    } catch { /* ignore */ }

    // 7. Active tasks
    try {
      const allTasks = loadTasks();
      const activeTasks = allTasks.filter((t) => !t.completedAt);
      const completedRecently = allTasks.filter(
        (t) => t.completedAt && Date.now() - t.completedAt < 30 * 24 * 60 * 60 * 1000,
      );
      if (activeTasks.length > 0 || completedRecently.length > 0) {
        const lines: string[] = [];
        if (activeTasks.length > 0) {
          lines.push(`Aktive opgaver (${activeTasks.length}):`);
          for (const t of activeTasks) {
            let line = `  - ${PRIORITY_ICONS[t.priority]} ${t.title}`;
            if (t.month) line += ` (mål-måned: ${t.month})`;
            if (t.description) line += ` – ${t.description.slice(0, 100)}`;
            lines.push(line);
          }
        }
        if (completedRecently.length > 0) {
          lines.push(`Nyligt fuldførte opgaver (${completedRecently.length}):`);
          for (const t of completedRecently) {
            lines.push(`  - ✅ ${t.title}`);
          }
        }
        parts.push(lines.join("\n"));
      }
    } catch { /* ignore */ }

    return parts.length > 0 ? parts.join("\n\n") : "";
  }, [estimateDanishClimateZone, weatherData, weatherStats, weatherStatRange]);

  // ── Send message ──
  const sendChatMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMsg = { role: "user", content: text, ts: Date.now() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    // Fire-and-forget activity tracking
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "chat:message", detail: chatPersona }),
    }).catch(() => {});

    try {
      const gardenContext = buildGardenContext();
      const recentMessages = [...chatMessages.slice(-20), userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: recentMessages,
          persona: chatPersona,
          gardenContext,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Ukendt fejl" }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      setChatMessages((prev) => [...prev, { role: "assistant", content: "", ts: Date.now() }]);
      const assistantText = await readSSEStream(response, (streamText) => {
        setChatMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: streamText, ts: Date.now() };
          return updated;
        });
      });

      if (!assistantText) {
        setChatMessages((prev) => prev.slice(0, -1));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Ukendt fejl";
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Fejl: ${errMsg}`, ts: Date.now() },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, chatPersona, buildGardenContext]);

  const clearChatHistory = useCallback(() => {
    setChatMessages([]);
    localStorage.removeItem(userKey(CHAT_STORAGE_KEY));
  }, []);

  // ── Render ──
  return (
    <div className="mt-3 flex flex-col" style={{ height: "calc(100vh - 220px)" }}>

      {/* Persona selector — 3 dyrkningsfilosofier */}
      <div className="mb-2" data-tour="chat-personas">
        <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide mb-1.5">
          Dyrkningsfilosofi
        </label>
        <div className="space-y-1.5">
          {[
            { id: "conventional", emoji: "🚜", label: "Konventionel", desc: "Fokus på højt udbytte og effektiv drift. Bruger bl.a. kunstgødning (NPK), godkendte sprøjtemidler og klassisk jordbearbejdning. Praktisk og resultat-orienteret." },
            { id: "organic", emoji: "🌱", label: "Økolog", desc: "Dyrkning helt uden syntetisk kemi. Bygger på kompost, grøngødning, nyttedyr og sædskifte. Fokus på jordens mikroliv, biodiversitet og lukkede kredsløb." },
            { id: "regenerative", emoji: "♻️", label: "Regenerativ", desc: "Går ud over bæredygtighed — haven skal aktivt genopbygge økosystemet. No-dig, permanent jorddække, polykultur, skovhavens 7 lag og kulstoflagring i jorden." },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              className={`w-full text-left rounded-lg border px-2.5 py-1.5 transition-all ${
                chatPersona === p.id
                  ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm ring-1 ring-accent/20"
                  : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
              }`}
              onClick={() => setChatPersona(p.id)}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{p.emoji}</span>
                <span className="text-[11px] font-semibold">{p.label}</span>
              </div>
              <div className={`text-[9px] mt-0.5 leading-tight ${
                chatPersona === p.id ? "text-accent-dark/60" : "text-foreground/35"
              }`}>{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-border-light bg-white/60 p-2 space-y-2 mb-2 sidebar-scroll" style={{ minHeight: 120 }}>
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-[12px] font-medium text-foreground/60">Spørg din haverådgiver</p>
            <p className="text-[10px] text-foreground/40 mt-1 max-w-[200px]">
              Stil spørgsmål om dine bede, planter, afstande, såtider – AI&apos;en kender din have!
            </p>
            <div className="mt-3 space-y-1">
              {[
                "Hvornår skal jeg så tomater?",
                "Hvor tæt kan jeg plante jordbær?",
                "Hvad passer godt sammen med gulerødder?",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="block w-full text-left text-[10px] text-accent hover:text-accent-dark bg-accent-light/50 hover:bg-accent-light rounded px-2 py-1 transition-colors"
                  onClick={() => { setChatInput(q); chatInputRef.current?.focus(); }}
                >
                  💡 {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatMessages.map((msg, i) => (
            <div
              key={`${msg.ts}-${i}`}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[85%]">
                <div
                  className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-accent text-white rounded-br-sm"
                      : "bg-foreground/5 text-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="whitespace-pre-wrap break-words">
                      {msg.content || (
                        <span className="inline-flex items-center gap-1 text-foreground/40">
                          <span className="animate-pulse">●</span>
                          <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>●</span>
                          <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</span>
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  )}
                </div>
                {/* Save assistant message as task */}
                {msg.role === "assistant" && msg.content && !chatLoading && (
                  <button
                    type="button"
                    data-tour="chat-save-task"
                    className="mt-1 flex items-center gap-1.5 rounded-lg border border-violet-200/60 bg-violet-50/60 px-2.5 py-1.5 text-[10px] font-medium text-violet-600 hover:bg-violet-100 hover:border-violet-300 transition-all group"
                    onClick={() => {
                      const parsed = parseAiResponse(msg.content);
                      createTask({
                        title: parsed.title,
                        description: parsed.description,
                        month: parsed.month,
                        source: "ai-advisor",
                      });
                      onTaskCreated?.();
                      const mNames = ["","jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
                      const flashMsg = parsed.month
                        ? `✅ Gemt! «${parsed.title.slice(0, 40)}» → 📅 ${mNames[parsed.month]}`
                        : `✅ Gemt! «${parsed.title.slice(0, 50)}»`;
                      setTaskSavedFlash(flashMsg);
                      setTimeout(() => setTaskSavedFlash(false), 3000);
                    }}
                    title="Opret som opgave i Planlæg"
                  >
                    <span className="text-xs group-hover:scale-110 transition-transform">📋</span>
                    <span>Gem som opgave</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-foreground/5 rounded-xl px-3 py-2 text-[12px] text-foreground/40">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>●</span>
              <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-1 items-end">
        <textarea
          ref={chatInputRef}
          className="flex-1 rounded-lg border border-border-light bg-white px-3 py-2 text-[12px] resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          rows={2}
          placeholder="Skriv dit spørgsmål..."
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendChatMessage();
            }
          }}
          disabled={chatLoading}
        />
        <button
          type="button"
          className="rounded-lg bg-accent text-white px-3 py-2 text-[12px] font-medium hover:bg-accent-dark transition-colors disabled:opacity-40"
          onClick={sendChatMessage}
          disabled={chatLoading || !chatInput.trim()}
          title="Send besked"
        >
          ➤
        </button>
      </div>

      {/* Clear history button */}
      {chatMessages.length > 0 && (
        <div className="mt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            className="text-[10px] text-foreground/40 hover:text-red-500 transition-colors"
            onClick={clearChatHistory}
          >
            🗑 Ryd samtalehistorik
          </button>
        </div>
      )}

      {/* Task saved flash */}
      {taskSavedFlash && (
        <div className="mt-1 rounded-lg bg-violet-100 border border-violet-200 px-3 py-1.5 text-[11px] text-violet-700 font-medium text-center animate-pulse">
          {taskSavedFlash} — Se 📋 Opgaver
        </div>
      )}
    </div>
  );
}

const ChatPanel = memo(ChatPanelInner);
export default ChatPanel;
