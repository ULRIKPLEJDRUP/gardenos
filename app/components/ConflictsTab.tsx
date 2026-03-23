"use client";
import React, { useState, memo } from "react";
import type { PlantConflict } from "../lib/conflictDetection";
import { userKey, markDirty } from "../lib/userStorage";

/* ─────────── Constants ─────────── */

const GROWING_SEASON_SUN_HOURS = 15;

/* ─────────── Props ─────────── */

export interface ConflictsTabProps {
  allConflicts: PlantConflict[];
  selectFeatureById: (id: string) => void;
  flashFeatureIds: (ids: string[]) => void;
  setSidebarTab: (tab: "content") => void;
  setSidebarPanelOpen: (open: boolean) => void;
}

/* ─────────── Component ─────────── */

function ConflictsTabInner({
  allConflicts,
  selectFeatureById,
  flashFeatureIds,
  setSidebarTab,
  setSidebarPanelOpen,
}: ConflictsTabProps) {
  // ── Internal state (moved from GardenMapClient) ──
  const [conflictFilter, setConflictFilter] = useState<"all" | "spacing" | "bad-companion" | "layer-competition" | "shade">("all");
  const [conflictSortBy, setConflictSortBy] = useState<"severity" | "type" | "distance">("severity");
  const [conflictResolvedIds, setConflictResolvedIds] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(userKey("gardenos:conflicts:resolved:v1"));
      return s ? new Set(JSON.parse(s) as string[]) : new Set<string>();
    } catch (_) {
      return new Set<string>();
    }
  });
  const [conflictShowResolved, setConflictShowResolved] = useState(false);

  // ── Derived data ──
  const conflictKey = (c: PlantConflict) => `${c.featureIdA}:${c.featureIdB}:${c.type}`;
  const unresolvedConflicts = allConflicts.filter((c) => !conflictResolvedIds.has(conflictKey(c)));
  const resolvedConflicts = allConflicts.filter((c) => conflictResolvedIds.has(conflictKey(c)));
  let displayConflicts = conflictShowResolved ? allConflicts : unresolvedConflicts;
  if (conflictFilter !== "all") displayConflicts = displayConflicts.filter((c) => c.type === conflictFilter);
  displayConflicts = [...displayConflicts].sort((a, b) => {
    if (conflictSortBy === "severity") return b.severity - a.severity || a.type.localeCompare(b.type);
    if (conflictSortBy === "type") return a.type.localeCompare(b.type) || b.severity - a.severity;
    return a.distanceM - b.distanceM;
  });
  const countByType = { spacing: 0, "bad-companion": 0, "layer-competition": 0, shade: 0 };
  for (const c of unresolvedConflicts) countByType[c.type]++;

  const toggleResolved = (c: PlantConflict) => {
    const key = conflictKey(c);
    setConflictResolvedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      try {
        localStorage.setItem(userKey("gardenos:conflicts:resolved:v1"), JSON.stringify([...next]));
        markDirty("gardenos:conflicts:resolved:v1");
      } catch (_) {
        // ignore storage errors
      }
      return next;
    });
  };

  return (
    <div className="mt-3 space-y-3">
      {/* Summary header */}
      <div className="flex items-center gap-2">
        <span className="text-lg">⚡</span>
        <div>
          <h3 className="text-sm font-bold text-foreground/80">Konfliktløsning</h3>
          <p className="text-[10px] text-foreground/50">
            {unresolvedConflicts.length === 0
              ? "✅ Ingen uløste konflikter — haven ser godt ud!"
              : `${unresolvedConflicts.length} uløst${unresolvedConflicts.length > 1 ? "e" : ""} konflikt${unresolvedConflicts.length > 1 ? "er" : ""}`
            }
            {resolvedConflicts.length > 0 ? ` · ${resolvedConflicts.length} markeret løst` : ""}
          </p>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-1">
        {([
          { val: "all" as const, icon: "🔎", label: "Alle", count: unresolvedConflicts.length },
          { val: "shade" as const, icon: "☀️", label: "Skygge", count: countByType.shade },
          { val: "spacing" as const, icon: "📏", label: "Afstand", count: countByType.spacing },
          { val: "bad-companion" as const, icon: "⛔", label: "Nabo", count: countByType["bad-companion"] },
          { val: "layer-competition" as const, icon: "⚠️", label: "Lag", count: countByType["layer-competition"] },
        ] as const).map((f) => (
          <button
            key={f.val}
            type="button"
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
              conflictFilter === f.val
                ? "bg-accent text-white shadow-sm"
                : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"
            }`}
            onClick={() => setConflictFilter(f.val)}
          >
            <span>{f.icon}</span>
            <span>{f.label}</span>
            {f.count > 0 ? <span className="bg-white/20 rounded-full px-1 text-[8px]">{f.count}</span> : null}
          </button>
        ))}
      </div>

      {/* Sort + show resolved */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-foreground/40">Sortér:</span>
          {([
            { val: "severity" as const, label: "Alvorlighed" },
            { val: "type" as const, label: "Type" },
            { val: "distance" as const, label: "Afstand" },
          ] as const).map((s) => (
            <button
              key={s.val}
              type="button"
              className={`text-[9px] px-1.5 py-0.5 rounded ${conflictSortBy === s.val ? "bg-foreground/10 font-semibold text-foreground/70" : "text-foreground/40 hover:text-foreground/60"}`}
              onClick={() => setConflictSortBy(s.val)}
            >{s.label}</button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-[9px] text-foreground/40 cursor-pointer">
          <input type="checkbox" checked={conflictShowResolved} onChange={(e) => setConflictShowResolved(e.target.checked)} className="w-3 h-3 rounded" />
          Vis løste
        </label>
      </div>

      {/* Conflict cards */}
      {displayConflicts.length === 0 ? (
        <div className="text-center py-8 text-foreground/30">
          <p className="text-2xl mb-1">🌿</p>
          <p className="text-xs">
            {conflictFilter !== "all" ? "Ingen konflikter af denne type" : "Ingen konflikter at vise"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayConflicts.map((c, idx) => {
            const key = conflictKey(c);
            const isResolved = conflictResolvedIds.has(key);
            const borderColor = isResolved ? "border-green-300" : c.severity === 3 ? "border-red-400" : c.severity === 2 ? "border-orange-300" : "border-yellow-300";
            const bgColor = isResolved ? "bg-green-50/40" : c.severity === 3 ? "bg-red-50/50" : c.severity === 2 ? "bg-orange-50/50" : "bg-yellow-50/50";
            const icon = c.type === "spacing" ? "📏" : c.type === "bad-companion" ? "⛔" : c.type === "shade" ? "☀️" : "⚠️";
            const typeLabel = c.type === "spacing" ? "Afstand" : c.type === "bad-companion" ? "Dårlig nabo" : c.type === "shade" ? "Skygge" : "Lag-konkurrence";
            const sevLabel = c.severity === 3 ? "Alvorlig" : c.severity === 2 ? "Moderat" : "Mild";
            const sevColor = c.severity === 3 ? "text-red-600" : c.severity === 2 ? "text-orange-600" : "text-yellow-600";

            return (
              <div key={idx} className={`rounded-lg border ${borderColor} ${bgColor} p-2.5 space-y-1.5 ${isResolved ? "opacity-60" : ""} transition-all`}>
                {/* Header row */}
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{icon}</span>
                  <span className="text-[10px] font-bold text-foreground/70">{typeLabel}</span>
                  <span className={`text-[9px] font-semibold ${sevColor} ml-1`}>{sevLabel}</span>
                  <span className="text-[9px] text-foreground/30 ml-auto">{c.distanceM.toFixed(1)}m</span>
                </div>

                {/* Plants involved */}
                <div className="flex items-center gap-3 text-[10px]">
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:underline text-foreground/70"
                    onClick={() => { selectFeatureById(c.featureIdA); setSidebarTab("content"); setSidebarPanelOpen(true); }}
                  >
                    <span>{c.speciesA.icon ?? "🌱"}</span>
                    <span className="font-medium">{c.speciesA.name}</span>
                  </button>
                  <span className="text-foreground/30">↔</span>
                  <button
                    type="button"
                    className="flex items-center gap-1 hover:underline text-foreground/70"
                    onClick={() => { selectFeatureById(c.featureIdB); setSidebarTab("content"); setSidebarPanelOpen(true); }}
                  >
                    <span>{c.speciesB.icon ?? "🌱"}</span>
                    <span className="font-medium">{c.speciesB.name}</span>
                  </button>
                </div>

                {/* Message + suggestion */}
                <p className="text-[10px] text-foreground/60">{c.message}</p>
                <p className="text-[10px] text-foreground/40 italic">💡 {c.suggestion}</p>

                {/* Progress bars */}
                {c.type === "spacing" ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${c.severity === 3 ? "bg-red-500" : c.severity === 2 ? "bg-orange-400" : "bg-yellow-400"}`}
                        style={{ width: `${Math.min(100, (c.distanceM / c.requiredM) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-foreground/40 shrink-0">{c.distanceM.toFixed(1)}m / {c.requiredM.toFixed(1)}m</span>
                  </div>
                ) : null}
                {c.type === "shade" ? (() => {
                  const shadeMatch = c.message.match(/~(\d+\.?\d*)\s*t(?:imer)?\/dag/);
                  const shadeHrs = shadeMatch ? parseFloat(shadeMatch[1]) : 0;
                  const shadePercent = Math.min(100, (shadeHrs / GROWING_SEASON_SUN_HOURS) * 100);
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-foreground/40">☀️</span>
                      <div className="flex-1 h-2 rounded-full bg-yellow-100 overflow-hidden border border-yellow-200">
                        <div className="h-full rounded-full bg-gray-400" style={{ width: `${shadePercent}%`, marginLeft: `${100 - shadePercent}%` }} />
                      </div>
                      <span className="text-[9px] text-foreground/40">🌑 {shadeHrs.toFixed(1)}t</span>
                    </div>
                  );
                })() : null}

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-foreground/5 hover:bg-foreground/10 text-foreground/50 transition-colors"
                    onClick={() => { flashFeatureIds([c.featureIdA, c.featureIdB]); }}
                  >📍 Vis på kort</button>
                  <button
                    type="button"
                    className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded transition-colors ${
                      isResolved
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-foreground/5 hover:bg-green-50 text-foreground/50 hover:text-green-600"
                    }`}
                    onClick={() => toggleResolved(c)}
                  >{isResolved ? "↩️ Genåbn" : "✅ Markér løst"}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ConflictsTab = memo(ConflictsTabInner);
export default ConflictsTab;
