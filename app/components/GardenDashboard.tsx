"use client";
import React, { useMemo, memo } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

/* ─────────────────────────────────────────────────────────────────────────── */
/*  F1 — "Min Have" Stats Dashboard                                          */
/*  Shows an overview of the user's garden: beds, plants, area, families,    */
/*  upcoming harvests, garden health score, and diversity metrics.            */
/* ─────────────────────────────────────────────────────────────────────────── */

// We receive pre-computed data from the parent to avoid importing stores here.
export interface DashboardData {
  /** Total number of bed/seedbed/area features */
  bedCount: number;
  /** Total number of element (plant/infra) features */
  elementCount: number;
  /** Total number of planted species (unique) */
  uniqueSpecies: number;
  /** Total number of plant instances across all beds */
  plantInstanceCount: number;
  /** Approx total planted area in m² */
  totalAreaM2: number;
  /** Unique plant families represented */
  families: string[];
  /** Active conflicts count */
  conflictCount: number;
  /** Upcoming harvests (species name + month range) */
  upcomingHarvests: { name: string; from: number; to: number }[];
  /** Rotation warnings count */
  rotationWarnings: number;
  /** Container count */
  containerCount: number;
  /** Row count */
  rowCount: number;
}

interface Props {
  data: DashboardData;
  onClose: () => void;
}

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

function healthScore(d: DashboardData): { score: number; label: string; color: string; emoji: string } {
  let score = 50; // base
  // Diversity bonus
  if (d.uniqueSpecies >= 10) score += 15;
  else if (d.uniqueSpecies >= 5) score += 10;
  else if (d.uniqueSpecies >= 2) score += 5;
  // Family diversity
  if (d.families.length >= 6) score += 10;
  else if (d.families.length >= 3) score += 5;
  // Conflict penalty
  score -= Math.min(20, d.conflictCount * 3);
  // Rotation penalty
  score -= Math.min(10, d.rotationWarnings * 5);
  // Activity bonus
  if (d.plantInstanceCount >= 20) score += 10;
  else if (d.plantInstanceCount >= 10) score += 5;
  // Upcoming harvest bonus
  if (d.upcomingHarvests.length >= 3) score += 5;

  score = Math.max(0, Math.min(100, score));
  if (score >= 80) return { score, label: "Fremragende", color: "text-green-600", emoji: "🌟" };
  if (score >= 60) return { score, label: "God", color: "text-lime-600", emoji: "🌿" };
  if (score >= 40) return { score, label: "OK", color: "text-amber-600", emoji: "🌱" };
  return { score, label: "Behøver opmærksomhed", color: "text-red-600", emoji: "⚠️" };
}

function GardenDashboardInner({ data, onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const health = useMemo(() => healthScore(data), [data]);
  const currentMonth = new Date().getMonth() + 1;
  const thisMonthHarvests = useMemo(
    () => data.upcomingHarvests.filter((h) => currentMonth >= h.from && currentMonth <= h.to),
    [data.upcomingHarvests, currentMonth]
  );
  const nextMonthHarvests = useMemo(
    () =>
      data.upcomingHarvests.filter((h) => {
        const nm = currentMonth === 12 ? 1 : currentMonth + 1;
        return nm >= h.from && nm <= h.to;
      }),
    [data.upcomingHarvests, currentMonth]
  );

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div ref={trapRef} className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-[var(--background)] shadow-2xl mx-3" role="dialog" aria-modal="true" aria-label="Min Have dashboard">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-border bg-[var(--background)]/95 backdrop-blur rounded-t-2xl">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">🏡 Min Have</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/10 text-foreground/50 hover:text-foreground transition"
            aria-label="Luk"
          >✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Health score */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-accent/5 border border-accent/20">
            <div className="text-4xl">{health.emoji}</div>
            <div className="flex-1">
              <div className="text-xs font-medium text-foreground/50 uppercase tracking-wider">Havesundhed</div>
              <div className={`text-2xl font-bold ${health.color}`}>{health.score}/100</div>
              <div className="text-sm text-foreground/60">{health.label}</div>
            </div>
            <div className="w-16 h-16 relative">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/10" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke="currentColor" strokeWidth="3"
                  strokeDasharray={`${health.score * 0.94} 100`}
                  strokeLinecap="round"
                  className={health.color}
                />
              </svg>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon="🌾" label="Bede" value={data.bedCount} />
            <StatCard icon="🌱" label="Planter" value={data.plantInstanceCount} />
            <StatCard icon="📐" label="Areal" value={`${data.totalAreaM2.toFixed(1)} m²`} />
            <StatCard icon="🧬" label="Arter" value={data.uniqueSpecies} />
            <StatCard icon="👨‍👩‍👧‍👦" label="Familier" value={data.families.length} />
            <StatCard icon="📦" label="Containere" value={data.containerCount} />
          </div>

          {/* Conflicts & rotation */}
          {(data.conflictCount > 0 || data.rotationWarnings > 0) && (
            <div className="flex gap-3">
              {data.conflictCount > 0 && (
                <div className="flex-1 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <div className="text-xs font-medium text-red-600 dark:text-red-400">⚡ Konflikter</div>
                  <div className="text-xl font-bold text-red-700 dark:text-red-300">{data.conflictCount}</div>
                </div>
              )}
              {data.rotationWarnings > 0 && (
                <div className="flex-1 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="text-xs font-medium text-amber-600 dark:text-amber-400">🔄 Sædskifteadv.</div>
                  <div className="text-xl font-bold text-amber-700 dark:text-amber-300">{data.rotationWarnings}</div>
                </div>
              )}
            </div>
          )}

          {/* Families */}
          {data.families.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-2">Plantefamilier</h3>
              <div className="flex flex-wrap gap-1.5">
                {data.families.map((f) => (
                  <span key={f} className="px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming harvests */}
          {data.upcomingHarvests.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-2">🌽 Kommende høst</h3>
              {thisMonthHarvests.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] font-bold text-foreground/40 mb-1">Denne måned ({MONTH_NAMES[currentMonth]})</div>
                  <div className="flex flex-wrap gap-1.5">
                    {thisMonthHarvests.map((h) => (
                      <span key={h.name} className="px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        {h.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {nextMonthHarvests.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold text-foreground/40 mb-1">Næste måned ({MONTH_NAMES[currentMonth === 12 ? 1 : currentMonth + 1]})</div>
                  <div className="flex flex-wrap gap-1.5">
                    {nextMonthHarvests.map((h) => (
                      <span key={h.name} className="px-2 py-0.5 text-xs rounded-full bg-lime-100 dark:bg-lime-900/30 text-lime-800 dark:text-lime-300 border border-lime-200 dark:border-lime-800">
                        {h.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick stats row */}
          <div className="flex gap-3 text-center">
            <div className="flex-1 p-3 rounded-lg bg-foreground/5">
              <div className="text-xl font-bold text-foreground">{data.rowCount}</div>
              <div className="text-[10px] text-foreground/50 font-medium">Rækker</div>
            </div>
            <div className="flex-1 p-3 rounded-lg bg-foreground/5">
              <div className="text-xl font-bold text-foreground">{data.elementCount}</div>
              <div className="text-[10px] text-foreground/50 font-medium">Elementer</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center p-3 rounded-xl bg-foreground/5 border border-border/50">
      <span className="text-lg">{icon}</span>
      <span className="text-lg font-bold text-foreground mt-1">{typeof value === "number" ? value : value}</span>
      <span className="text-[10px] text-foreground/50 font-medium">{label}</span>
    </div>
  );
}

const GardenDashboard = memo(GardenDashboardInner);
export default GardenDashboard;
