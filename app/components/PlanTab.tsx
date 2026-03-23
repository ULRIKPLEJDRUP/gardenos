"use client";

import { useState } from "react";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import TaskList from "./TaskList";
import YearWheel from "./YearWheel";
import {
  getUpcomingActivities,
  ACTIVITY_CONFIG,
  MONTH_NAMES_DA,
  MONTH_SHORT_DA,
  type CalendarMonth,
} from "../lib/gardenCalendar";
import { URGENCY_CONFIG, type BedWateringAdvice } from "../lib/wateringAdvisor";
import {
  getFamilyColor,
  getFamilyLabel,
  type RotationPlan,
} from "../lib/rotationPlanner";
import {
  getSmartRecommendations,
  SMART_STRATEGY_CONFIG,
  monthNameDa,
} from "../lib/smartRecommendations";
import type { SmartStrategy, SmartContext } from "../lib/smartRecommendations";
import { loadTasks } from "../lib/taskStore";
import { loadSoilProfiles, getSoilProfileById } from "../lib/soilStore";
import { getInstancesForFeature } from "../lib/plantStore";
import { estimateShadeAtPoint, type ShadeCaster } from "../lib/sunAnalysis";
import type { WeatherData } from "../lib/weatherStore";
import type { SoilProfile } from "../lib/soilTypes";

// ---------------------------------------------------------------------------
// Replicated minimal types from GardenMapClient (only what PlanTab touches)
// ---------------------------------------------------------------------------
type GardenFeatureCategory = "element" | "row" | "seedbed" | "container" | "area" | "condition";

type GardenFeatureProperties = {
  gardenosId?: string;
  name?: string;
  kind?: string;
  category?: string;
  notes?: string;
  soilProfileId?: string;
  [key: string]: unknown;
};

type GardenFeature = Feature<Geometry, GardenFeatureProperties>;
type GardenFeatureCollection = FeatureCollection<Geometry, GardenFeatureProperties>;

const CATEGORY_LABELS: Record<GardenFeatureCategory, string> = {
  element: "Element",
  row: "Række",
  seedbed: "Såbed",
  container: "Container",
  area: "Område",
  condition: "Særligt forhold",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface PlanTabProps {
  /** Bump to re-read tasks from storage */
  taskVersion: number;
  setTaskVersion: React.Dispatch<React.SetStateAction<number>>;

  /** YearWheel dependencies */
  plantDataVersion: number;
  plantInstancesVersion: number;
  flashFeatureIds: (ids: string[]) => void;

  /** Pre-computed calendar data */
  calendarData: CalendarMonth[];

  /** Pre-computed watering advice (sorted) */
  wateringAdvice: BedWateringAdvice[];

  /** Pre-computed rotation plan + current year */
  rotationPlan: RotationPlan;
  currentYear: number;

  /** The features collection (for notes + recommend sub-tabs) */
  layoutForContainment: GardenFeatureCollection | null;

  /** Version counter for soil data */
  soilDataVersion: number;

  /** Weather data for watering + recommend */
  weatherData: WeatherData | null;

  /** Map centre latitude (for sun estimation) */
  mapLat: number;
  /** Shade casters (for sun estimation) */
  sunCasters: ShadeCaster[];

  // ── Navigation callbacks ──
  /** Navigate to a feature in the content tab */
  onNavigateToFeature: (gardenosId: string, feature: Feature<Geometry, GardenFeatureProperties>) => void;
  /** Navigate to a soil profile in the library tab */
  onNavigateToSoilProfile: (soilId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
type PlanSubTab = "tasks" | "calendar" | "notes" | "watering" | "rotation" | "recommend";
type NoteFilter = "all" | "elements" | "soil" | "tasks";

export default function PlanTab({
  taskVersion,
  setTaskVersion,
  plantDataVersion,
  plantInstancesVersion,
  flashFeatureIds,
  calendarData,
  wateringAdvice,
  rotationPlan,
  currentYear: memoCurrentYear,
  layoutForContainment,
  soilDataVersion,
  weatherData,
  mapLat,
  sunCasters,
  onNavigateToFeature,
  onNavigateToSoilProfile,
}: PlanTabProps) {
  // Internal state (moved from GardenMapClient)
  const [planSubTab, setPlanSubTab] = useState<PlanSubTab>("tasks");
  const [noteFilter, setNoteFilter] = useState<NoteFilter>("all");
  const [recStrategies, setRecStrategies] = useState<SmartStrategy[]>(["companion", "season-timing", "soil-match", "sun-match"]);
  const [recSelectedBedId, setRecSelectedBedId] = useState<string | null>(null);
  const [recExpandedId, setRecExpandedId] = useState<string | null>(null);

  return (
    <div className="mt-3 space-y-3">
      {/* Sub-tab picker */}
      <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm flex-wrap">
        {(["tasks", "calendar", "notes", "watering", "rotation", "recommend"] as const).map((st) => (
          <button
            key={st}
            type="button"
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all min-w-0 ${
              planSubTab === st
                ? (st === "watering" ? "bg-blue-500 text-white shadow-sm" : st === "rotation" ? "bg-amber-600 text-white shadow-sm" : st === "recommend" ? "bg-purple-600 text-white shadow-sm" : "bg-accent text-white shadow-sm")
                : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
            }`}
            onClick={() => setPlanSubTab(st)}
          >
            {st === "tasks" ? "📋" : st === "calendar" ? "📅" : st === "notes" ? "📝" : st === "watering" ? "💧" : st === "rotation" ? "🔄" : "💡"}
            <span className="hidden sm:inline"> {st === "tasks" ? "Opgaver" : st === "calendar" ? "Årshjul" : st === "notes" ? "Noter" : st === "watering" ? "Vanding" : st === "rotation" ? "Rotation" : "Anbefal"}</span>
          </button>
        ))}
      </div>

      {/* ── Tasks sub-tab ── */}
      {planSubTab === "tasks" ? (
        <TaskList
          taskVersion={taskVersion}
          goToYearWheel={(_month: number) => {
            setPlanSubTab("calendar");
          }}
        />
      ) : null}

      {/* ── Calendar sub-tab ── */}
      {planSubTab === "calendar" ? (() => {
        const currentMonth = new Date().getMonth() + 1;
        const upcoming = getUpcomingActivities(calendarData, 2);
        const totalActivities = calendarData.reduce((s, m) => s + m.activities.length, 0);

        return (
          <div className="space-y-4">
            {/* YearWheel (existing) */}
            <YearWheel plantDataVersion={plantDataVersion} plantInstancesVersion={plantInstancesVersion} flashFeatureIds={flashFeatureIds} />

            {/* ── Auto-generated activity calendar ── */}
            <div className="rounded-xl border border-border-light bg-card p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">📆 Havekalender</h3>
                {totalActivities > 0 && (
                  <span className="text-xs text-muted bg-background px-2 py-0.5 rounded-full border border-border-light">
                    {totalActivities} aktivitet{totalActivities !== 1 ? "er" : ""}
                  </span>
                )}
              </div>

              {totalActivities === 0 ? (
                <div className="text-center py-6 text-muted text-sm">
                  <p className="text-2xl mb-2">🌿</p>
                  <p>Ingen aktiviteter endnu.</p>
                  <p className="text-xs mt-1">Plant arter i dine bede for at se kalenderen.</p>
                </div>
              ) : (
                <>
                  {/* Upcoming activities highlight */}
                  {upcoming.length > 0 && (
                    <div className="rounded-lg bg-accent/5 border border-accent/20 p-2.5 space-y-1.5">
                      <p className="text-xs font-medium text-accent flex items-center gap-1">
                        ⚡ Kommende aktiviteter ({MONTH_NAMES_DA[currentMonth]})
                      </p>
                      <div className="space-y-1">
                        {upcoming.slice(0, 5).map((act, i) => (
                          <div key={`upcoming-${i}`} className="flex items-center gap-1.5 text-xs">
                            <span>{act.icon}</span>
                            <span className="font-medium">{act.plantName}</span>
                            <span className="text-muted">— {ACTIVITY_CONFIG[act.type].label}</span>
                          </div>
                        ))}
                        {upcoming.length > 5 && (
                          <p className="text-xs text-muted">+{upcoming.length - 5} mere…</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Month-by-month grid */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {calendarData.map((cm) => {
                      const isCurrent = cm.month === currentMonth;
                      const hasActivities = cm.activities.length > 0;
                      return (
                        <div
                          key={cm.month}
                          className={`rounded-lg border p-2 text-xs transition-all ${
                            isCurrent
                              ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                              : hasActivities
                                ? "border-border-light bg-background hover:bg-foreground/5"
                                : "border-border-light/50 bg-background/50 opacity-50"
                          }`}
                        >
                          <p className={`font-semibold mb-1 ${isCurrent ? "text-accent" : ""}`}>
                            {MONTH_SHORT_DA[cm.month]}
                          </p>
                          {cm.activities.length > 0 ? (
                            <div className="space-y-0.5">
                              {cm.activities.slice(0, 3).map((act, j) => (
                                <div key={j} className="flex items-center gap-0.5 text-[10px] leading-tight truncate">
                                  <span>{act.icon}</span>
                                  <span className="truncate">{act.plantName}</span>
                                </div>
                              ))}
                              {cm.activities.length > 3 && (
                                <p className="text-[10px] text-muted">+{cm.activities.length - 3}</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-[10px] text-muted italic">—</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Detailed month view for current month */}
                  {calendarData[currentMonth - 1]?.activities.length > 0 && (
                    <div className="rounded-lg border border-border-light p-3 space-y-2">
                      <p className="text-xs font-semibold">{MONTH_NAMES_DA[currentMonth]} — detaljer</p>
                      <div className="space-y-1.5">
                        {calendarData[currentMonth - 1].activities.map((act, i) => (
                          <div key={i} className={`flex items-start gap-2 text-xs rounded-md px-2 py-1.5 ${ACTIVITY_CONFIG[act.type].bg}`}>
                            <span className="text-base mt-0.5">{act.icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className={`font-medium ${ACTIVITY_CONFIG[act.type].color}`}>{ACTIVITY_CONFIG[act.type].label}</p>
                              <p className="text-foreground/70 truncate">{act.plantName}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })() : null}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── NOTER SUB-TAB ── collect all notes across the system  */}
      {/* ══════════════════════════════════════════════════════════ */}
      {planSubTab === "notes" ? (() => {
        // Collect notes from all sources
        type NoteItem = { id: string; source: "elements" | "soil" | "tasks"; icon: string; title: string; text: string; onClick?: () => void };
        const notes: NoteItem[] = [];

        // 1. Feature notes (elements on the map)
        if (layoutForContainment?.features?.length) {
          for (const f of layoutForContainment.features) {
            const props = (f as GardenFeature).properties;
            if (props?.notes?.trim()) {
              const cat = props.category as GardenFeatureCategory;
              const catIcons: Record<string, string> = { element: "🌱", row: "📏", seedbed: "🌾", container: "🪴", area: "🏡", condition: "🌡️" };
              notes.push({
                id: `feat-${props.gardenosId}`,
                source: "elements",
                icon: catIcons[cat] ?? "📍",
                title: props.name || CATEGORY_LABELS[cat] || "Element",
                text: props.notes,
                onClick: () => {
                  const gf = f as GardenFeature;
                  onNavigateToFeature(props.gardenosId!, gf);
                },
              });
            }
          }
        }

        // 2. Soil profile notes
        void soilDataVersion;
        const soilProfiles = loadSoilProfiles();
        for (const p of soilProfiles) {
          if (p.notes?.trim()) {
            notes.push({
              id: `soil-${p.id}`,
              source: "soil",
              icon: "🪨",
              title: p.name,
              text: p.notes,
              onClick: () => {
                onNavigateToSoilProfile(p.id);
              },
            });
          }
        }

        // 3. Task descriptions
        void taskVersion;
        const tasks = loadTasks();
        for (const t of tasks) {
          if (t.description?.trim()) {
            notes.push({
              id: `task-${t.id}`,
              source: "tasks",
              icon: t.completedAt ? "✅" : "📋",
              title: t.title,
              text: t.description,
              onClick: () => {
                setPlanSubTab("tasks");
              },
            });
          }
        }

        // Filter
        const filtered = noteFilter === "all" ? notes : notes.filter((n) => n.source === noteFilter);

        return (
          <div className="space-y-3">
            {/* Filter chips */}
            <div className="flex flex-wrap gap-1.5">
              {([
                { v: "all" as const, label: "Alle", count: notes.length },
                { v: "elements" as const, label: "🗺️ Elementer", count: notes.filter((n) => n.source === "elements").length },
                { v: "soil" as const, label: "🪨 Jord", count: notes.filter((n) => n.source === "soil").length },
                { v: "tasks" as const, label: "📋 Opgaver", count: notes.filter((n) => n.source === "tasks").length },
              ]).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
                    noteFilter === opt.v
                      ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                      : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
                  }`}
                  onClick={() => setNoteFilter(opt.v)}
                >
                  {opt.label} {opt.count > 0 ? `(${opt.count})` : ""}
                </button>
              ))}
            </div>

            {/* Note cards */}
            {filtered.length === 0 ? (
              <p className="text-xs text-foreground/40 italic text-center py-6">
                📝 Ingen noter fundet{noteFilter !== "all" ? " med dette filter" : ""}. Noter tilføjes via Indhold-panelet, Jordprofiler eller Opgaver.
              </p>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className="w-full text-left rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5 hover:bg-foreground/[0.05] hover:border-accent/30 transition-all group"
                    onClick={note.onClick}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{note.icon}</span>
                      <span className="text-xs font-medium truncate flex-1">{note.title}</span>
                      <span className="text-[9px] text-foreground/30 group-hover:text-accent transition-colors shrink-0">Gå til →</span>
                    </div>
                    <p className="text-[11px] text-foreground/55 leading-relaxed line-clamp-3">{note.text}</p>
                  </button>
                ))}
              </div>
            )}

            <p className="text-[10px] text-foreground/40 leading-tight">
              📝 {notes.length} note{notes.length !== 1 ? "r" : ""} fundet på tværs af systemet. Klik på en note for at gå til kilden.
            </p>
          </div>
        );
      })() : null}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── VANDING SUB-TAB ── smart watering advisor              */}
      {/* ══════════════════════════════════════════════════════════ */}
      {planSubTab === "watering" ? (() => {
        const sorted = wateringAdvice;
        const needsWater = sorted.filter((a) => a.urgency !== "none");

        return (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-foreground/80 mb-1">💧 Vandingsrådgiver</h3>
              <p className="text-[10px] text-foreground/50 leading-relaxed">
                Anbefalinger baseret på vejr, jord og planternes behov.
              </p>
            </div>

            {/* Summary stats */}
            <div className="flex gap-2">
              <div className={`flex-1 rounded-lg border p-2 text-center ${needsWater.length > 0 ? "border-blue-200 bg-blue-50" : "border-green-200 bg-green-50"}`}>
                <div className={`text-lg font-bold ${needsWater.length > 0 ? "text-blue-600" : "text-green-600"}`}>
                  {needsWater.length}
                </div>
                <div className="text-[9px] text-foreground/40 uppercase tracking-wide">Behøver vanding</div>
              </div>
              <div className="flex-1 rounded-lg border border-green-200 bg-green-50 p-2 text-center">
                <div className="text-lg font-bold text-green-600">{sorted.length - needsWater.length}</div>
                <div className="text-[9px] text-foreground/40 uppercase tracking-wide">OK lige nu</div>
              </div>
            </div>

            {/* Weather context */}
            {weatherData ? (
              <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2 flex items-center gap-2">
                <span className="text-sm">🌡️</span>
                <div className="text-[10px] text-foreground/60">
                  {Math.round(weatherData.current.temperature)}°C ·{" "}
                  {weatherData.current.precipitation > 0
                    ? `${weatherData.current.precipitation}mm nedbør nu`
                    : "Ingen nedbør nu"
                  }
                  {weatherData.current.windSpeed > 15 ? ` · 💨 ${Math.round(weatherData.current.windSpeed)} km/t` : ""}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[10px] text-amber-700">⚠️ Ingen vejrdata – åbn Klima-fanen for at hente vejr</p>
              </div>
            )}

            {/* Advice cards */}
            {sorted.length === 0 ? (
              <p className="text-[10px] text-foreground/40 italic text-center py-6">
                💧 Ingen bede med planter fundet. Tilføj planter til dine bede for vandingsanbefalinger.
              </p>
            ) : (
              <div className="space-y-1.5">
                {sorted.map((advice) => {
                  const cfg = URGENCY_CONFIG[advice.urgency];
                  return (
                    <div
                      key={advice.featureId}
                      className={`rounded-lg border ${cfg.border} ${cfg.bg} px-3 py-2.5 space-y-1.5`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cfg.icon}</span>
                        <span className="text-xs font-semibold flex-1 truncate">{advice.bedName}</span>
                        <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <p className="text-[10px] text-foreground/60 leading-relaxed">{advice.adviceText}</p>
                      {advice.litresPerM2 > 0 ? (
                        <div className="text-[9px] text-foreground/40">
                          💧 ca. {advice.litresPerM2} l/m² · {advice.drainageFactor === "fast" ? "🏜️ Hurtig dræning" : advice.drainageFactor === "slow" ? "🪨 Langsom dræning" : "Normal dræning"}
                        </div>
                      ) : null}
                      {advice.reasons.length > 0 ? (
                        <details className="group">
                          <summary className="text-[9px] text-foreground/30 cursor-pointer hover:text-foreground/50">Detaljer ▾</summary>
                          <ul className="mt-1 space-y-0.5">
                            {advice.reasons.map((r, i) => (
                              <li key={i} className="text-[9px] text-foreground/40 leading-tight">{r}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[9px] text-foreground/30 text-center leading-relaxed">
              Anbefalinger er vejledende – tilpas altid efter dine specifikke forhold.
            </p>
          </div>
        );
      })() : null}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── ROTATION SUB-TAB ── multi-year crop rotation planner   */}
      {/* ══════════════════════════════════════════════════════════ */}
      {planSubTab === "rotation" ? (() => {
        const plan = rotationPlan;

        return (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-foreground/80 mb-1">🔄 Vekseldrift</h3>
              <p className="text-[10px] text-foreground/50 leading-relaxed">
                Overblik over plantefamilier pr. bed over tid. Undgå at dyrke samme familie flere år i træk.
              </p>
            </div>

            {plan.rows.length === 0 ? (
              <p className="text-[10px] text-foreground/40 italic text-center py-8">
                🔄 Ingen bede fundet. Opret bede og tilføj planter med sæson-information for at se rotationsplanen.
              </p>
            ) : (
              <div className="space-y-2">
                {/* Year headers */}
                <div className="flex gap-1 items-center">
                  <div className="w-20 shrink-0 text-[9px] font-semibold text-foreground/40 uppercase">Bed</div>
                  {plan.seasons.map((s) => (
                    <div
                      key={s}
                      className={`flex-1 text-center text-[10px] font-semibold ${
                        s === memoCurrentYear ? "text-accent" : s > memoCurrentYear ? "text-foreground/30 italic" : "text-foreground/50"
                      }`}
                    >
                      {s}{s === memoCurrentYear ? " ◀" : ""}
                    </div>
                  ))}
                </div>

                {/* Rotation grid */}
                {plan.rows.map((row) => {
                  const suggestion = plan.suggestions[row.bed.featureId];
                  return (
                    <div key={row.bed.featureId} className="space-y-1">
                      <div className="flex gap-1 items-stretch">
                        <div className="w-20 shrink-0 text-[10px] font-medium text-foreground/70 truncate py-1" title={row.bed.bedName}>
                          {row.bed.bedName}
                        </div>
                        {row.cells.map((cell) => (
                          <div
                            key={cell.season}
                            className={`flex-1 rounded-md border p-1 min-h-[32px] text-center ${
                              cell.warnings.length > 0
                                ? "border-red-300 bg-red-50"
                                : cell.families.length > 0
                                  ? "border-border bg-foreground/[0.02]"
                                  : cell.season > memoCurrentYear
                                    ? "border-dashed border-foreground/10 bg-foreground/[0.01]"
                                    : "border-foreground/5 bg-foreground/[0.01]"
                            }`}
                            title={cell.speciesNames.join(", ") + (cell.warnings.length > 0 ? "\n" + cell.warnings.join("\n") : "")}
                          >
                            {cell.families.length > 0 ? (
                              <div className="flex flex-wrap gap-0.5 justify-center">
                                {cell.families.map((fam) => (
                                  <span
                                    key={fam}
                                    className="inline-block w-3 h-3 rounded-full"
                                    style={{ backgroundColor: getFamilyColor(fam) }}
                                    title={getFamilyLabel(fam)}
                                  />
                                ))}
                              </div>
                            ) : (
                              <span className="text-[9px] text-foreground/20">{cell.season > memoCurrentYear ? "?" : "–"}</span>
                            )}
                            {cell.warnings.length > 0 ? (
                              <span className="text-[8px] text-red-500 block mt-0.5">⚠️</span>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      {/* Per-bed suggestion */}
                      {suggestion && (suggestion.avoid.length > 0 || suggestion.suggest.length > 0) ? (
                        <div className="ml-20 flex gap-2 text-[9px]">
                          {suggestion.avoid.length > 0 ? (
                            <span className="text-red-500">
                              Undgå: {suggestion.avoid.map((f) => getFamilyLabel(f)).join(", ")}
                            </span>
                          ) : null}
                          {suggestion.suggest.length > 0 ? (
                            <span className="text-green-600">
                              Foreslå: {suggestion.suggest.slice(0, 3).map((f) => getFamilyLabel(f)).join(", ")}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {/* Legend */}
                <div className="rounded-lg border border-border bg-foreground/[0.02] p-2 mt-2">
                  <p className="text-[9px] font-semibold text-foreground/40 uppercase tracking-wide mb-1.5">Familiefarver</p>
                  <div className="flex flex-wrap gap-2">
                    {(["solanaceae", "brassicaceae", "fabaceae", "cucurbitaceae", "apiaceae", "amaryllidaceae", "asteraceae"] as const).map((fam) => (
                      <div key={fam} className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getFamilyColor(fam) }} />
                        <span className="text-[9px] text-foreground/50">{getFamilyLabel(fam)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[9px] text-foreground/30 text-center leading-relaxed">
                  Sæt &quot;sæson&quot;-felt på dine plantninger for at spore rotation over år.
                </p>
              </div>
            )}
          </div>
        );
      })() : null}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── RECOMMEND SUB-TAB ── smart plant recommendations      */}
      {/* ══════════════════════════════════════════════════════════ */}
      {planSubTab === "recommend" ? (() => {
        // Collect all beds with their species, soil, and estimated sun
        type BedInfo = {
          featureId: string;
          bedName: string;
          speciesIds: string[];
          soil: SoilProfile | null;
          sunHours: number | null;
        };
        const beds: BedInfo[] = [];
        if (layoutForContainment?.features?.length) {
          for (const f of layoutForContainment.features) {
            const props = (f as GardenFeature).properties;
            const fId = props?.gardenosId;
            if (!fId) continue;
            const instances = getInstancesForFeature(fId);
            const speciesIds = instances.map((inst) => inst.speciesId);
            const soilId = props?.soilProfileId as string | undefined;
            const soilResult = soilId ? getSoilProfileById(soilId) : null;
            const soil: SoilProfile | null = soilResult ?? null;

            // Estimate sun at bed centroid
            let sunHours: number | null = null;
            const geom = f.geometry;
            if (geom && geom.type === "Polygon" && (geom as GeoJSON.Polygon).coordinates?.[0]) {
              const ring = (geom as GeoJSON.Polygon).coordinates[0];
              const cLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
              const cLng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
              if (sunCasters.length > 0) {
                const shade = estimateShadeAtPoint(cLat, cLng, sunCasters, mapLat);
                sunHours = Math.max(0, 15 - shade);
              }
            } else if (geom && geom.type === "Point") {
              const coords = (geom as GeoJSON.Point).coordinates;
              if (sunCasters.length > 0) {
                const shade = estimateShadeAtPoint(coords[1], coords[0], sunCasters, mapLat);
                sunHours = Math.max(0, 15 - shade);
              }
            }

            beds.push({
              featureId: fId,
              bedName: props?.name || props?.kind || "Ukendt",
              speciesIds,
              soil,
              sunHours,
            });
          }
        }
        // Sort: beds with plants first, then by name
        beds.sort((a, b) => {
          if (a.speciesIds.length > 0 && b.speciesIds.length === 0) return -1;
          if (a.speciesIds.length === 0 && b.speciesIds.length > 0) return 1;
          return a.bedName.localeCompare(b.bedName, "da");
        });

        const activeBedId = recSelectedBedId ?? (beds.length > 0 ? beds[0].featureId : null);
        const activeBed = beds.find((b) => b.featureId === activeBedId) ?? null;

        const currentMonth = new Date().getMonth() + 1;
        const currentTempC = weatherData?.current?.temperature ?? null;
        const frostRisk = weatherData?.forecast
          ? weatherData.forecast.some((d) => (d.tempMin ?? 99) < 3)
          : false;

        const ctx: SmartContext | null = activeBed
          ? {
              existingSpeciesIds: activeBed.speciesIds,
              soil: activeBed.soil,
              sunHours: activeBed.sunHours,
              currentMonth,
              currentTempC,
              frostRisk,
            }
          : null;

        const recommendations = ctx
          ? getSmartRecommendations(ctx, recStrategies, 15)
          : [];

        const allStrategies: SmartStrategy[] = [
          "companion", "biodiversity", "nutrition", "color", "forest-layer",
          "soil-match", "sun-match", "season-timing", "frost-safe",
        ];

        return (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-foreground/80 mb-1">💡 Smarte Anbefalinger</h3>
              <p className="text-[10px] text-foreground/50 leading-relaxed">
                Planteanbefalinger baseret på jord, sol, sæson og eksisterende planter.
              </p>
            </div>

            {beds.length === 0 ? (
              <p className="text-[10px] text-foreground/40 italic text-center py-8">
                💡 Opret bede for at få anbefalinger.
              </p>
            ) : (
              <>
                {/* Bed selector */}
                <div>
                  <label className="text-[9px] font-semibold text-foreground/40 uppercase tracking-wide block mb-1">Vælg bed</label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-foreground/80"
                    value={activeBedId ?? ""}
                    onChange={(e) => {
                      setRecSelectedBedId(e.target.value || null);
                      setRecExpandedId(null);
                    }}
                  >
                    {beds.map((b) => (
                      <option key={b.featureId} value={b.featureId}>
                        {b.bedName} ({b.speciesIds.length} planter)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bed context summary */}
                {activeBed ? (
                  <div className="flex gap-2 flex-wrap">
                    {activeBed.soil ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[9px] text-amber-700">
                        🪨 {activeBed.soil.name}{activeBed.soil.phMeasured != null ? ` · pH ${activeBed.soil.phMeasured.toFixed(1)}` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 border border-border px-2 py-0.5 text-[9px] text-foreground/40">
                        🪨 Ingen jordprofil
                      </span>
                    )}
                    {activeBed.sunHours != null ? (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] border ${
                        activeBed.sunHours >= 6 ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
                        activeBed.sunHours >= 3 ? "bg-green-50 border-green-200 text-green-700" :
                        "bg-blue-50 border-blue-200 text-blue-700"
                      }`}>
                        ☀️ ~{activeBed.sunHours.toFixed(0)}t sol
                      </span>
                    ) : null}
                    {frostRisk ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[9px] text-blue-700">
                        ❄️ Frostrisiko
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[9px] text-purple-700">
                      📅 {monthNameDa(currentMonth)}
                    </span>
                  </div>
                ) : null}

                {/* Strategy toggles */}
                <div>
                  <label className="text-[9px] font-semibold text-foreground/40 uppercase tracking-wide block mb-1.5">Strategier</label>
                  <div className="flex flex-wrap gap-1">
                    {allStrategies.map((s) => {
                      const cfg = SMART_STRATEGY_CONFIG[s];
                      const active = recStrategies.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          className={`rounded-full px-2 py-0.5 text-[9px] font-medium border transition-all ${
                            active
                              ? "bg-purple-100 border-purple-300 text-purple-700"
                              : "bg-foreground/5 border-border text-foreground/40 hover:text-foreground/60"
                          }`}
                          onClick={() =>
                            setRecStrategies((prev) =>
                              active ? prev.filter((x) => x !== s) : [...prev, s],
                            )
                          }
                          title={cfg.description}
                        >
                          {cfg.emoji} {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Results */}
                {recommendations.length === 0 ? (
                  <p className="text-[10px] text-foreground/40 italic text-center py-4">
                    Ingen anbefalinger med valgte strategier. Prøv at aktivere flere.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-[9px] text-foreground/40 uppercase tracking-wide font-semibold">
                      {recommendations.length} anbefalinger
                    </p>
                    {recommendations.map((rec) => {
                      const expanded = recExpandedId === rec.species.id;
                      const positiveReasons = rec.reasons.filter((r) => r.score > 0);
                      const negativeReasons = rec.reasons.filter((r) => r.score < 0);
                      return (
                        <div
                          key={rec.species.id}
                          className="rounded-lg border border-border bg-background p-2 hover:border-purple-200 transition-colors cursor-pointer"
                          onClick={() => setRecExpandedId(expanded ? null : rec.species.id)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-foreground/80 truncate">{rec.species.name}</span>
                                {rec.species.latinName ? (
                                  <span className="text-[9px] text-foreground/30 italic truncate">{rec.species.latinName}</span>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-0.5 mt-0.5">
                                {positiveReasons.slice(0, expanded ? 99 : 3).map((r, i) => (
                                  <span key={i} className="inline-flex items-center gap-0.5 rounded bg-green-50 px-1 py-0 text-[8px] text-green-700">
                                    {r.emoji} {r.text}
                                  </span>
                                ))}
                                {!expanded && positiveReasons.length > 3 ? (
                                  <span className="text-[8px] text-foreground/30">+{positiveReasons.length - 3}</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="shrink-0 flex flex-col items-center">
                              <span className={`text-sm font-bold ${rec.totalScore >= 8 ? "text-purple-600" : rec.totalScore >= 4 ? "text-green-600" : "text-foreground/50"}`}>
                                {rec.totalScore}
                              </span>
                              <span className="text-[7px] text-foreground/30 uppercase">Score</span>
                            </div>
                          </div>

                          {expanded ? (
                            <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                              {/* Species details */}
                              <div className="flex flex-wrap gap-2 text-[9px] text-foreground/50">
                                {rec.species.family ? (
                                  <span>🧬 {rec.species.family}</span>
                                ) : null}
                                {rec.species.light ? (
                                  <span>☀️ {rec.species.light === "full-sun" ? "Fuld sol" : rec.species.light === "partial-shade" ? "Halvskygge" : "Skygge"}</span>
                                ) : null}
                                {rec.species.water ? (
                                  <span>💧 {rec.species.water}</span>
                                ) : null}
                                {rec.species.sowOutdoor ? (
                                  <span>🌱 Udså {monthNameDa(rec.species.sowOutdoor.from)}–{monthNameDa(rec.species.sowOutdoor.to)}</span>
                                ) : null}
                                {rec.species.harvest ? (
                                  <span>🧺 Høst {monthNameDa(rec.species.harvest.from)}–{monthNameDa(rec.species.harvest.to)}</span>
                                ) : null}
                              </div>

                              {/* All positive reasons */}
                              {positiveReasons.length > 0 ? (
                                <div>
                                  <p className="text-[8px] text-green-600 font-semibold mb-0.5">✅ Fordele</p>
                                  {positiveReasons.map((r, i) => (
                                    <div key={i} className="flex items-center gap-1 text-[9px] text-green-700">
                                      <span>{r.emoji}</span>
                                      <span>{r.text}</span>
                                      <span className="text-green-400 ml-auto">+{r.score}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {/* Negative reasons */}
                              {negativeReasons.length > 0 ? (
                                <div>
                                  <p className="text-[8px] text-red-500 font-semibold mb-0.5">⚠️ Ulemper</p>
                                  {negativeReasons.map((r, i) => (
                                    <div key={i} className="flex items-center gap-1 text-[9px] text-red-600">
                                      <span>{r.emoji}</span>
                                      <span>{r.text}</span>
                                      <span className="text-red-400 ml-auto">{r.score}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-[9px] text-foreground/30 text-center leading-relaxed">
                  Tilføj jordprofiler og aktiver solkortet for bedre anbefalinger.
                </p>
              </>
            )}
          </div>
        );
      })() : null}
    </div>
  );
}
