"use client";

import React, { useState, useMemo } from "react";
import type { Feature, Geometry } from "geojson";
import type { PlantSpecies, PlantInstance, PlantCategory, PlacementType } from "../lib/plantTypes";
import {
  PLANT_CATEGORY_LABELS,
  LIGHT_LABELS,
  WATER_LABELS,
  LIFECYCLE_LABELS,
  PLANT_FAMILY_LABELS,
  DIFFICULTY_LABELS,
  PLACEMENT_LABELS,
  PLACEMENT_ICONS,
  getDefaultPlacements,
  canPlaceInCategory,
  isEdiblePlant,
} from "../lib/plantTypes";
import {
  getPlantById,
  addPlantInstance,
  formatMonthRange,
} from "../lib/plantStore";
import {
  loadSoilProfiles,
  getSoilProfileById,
  addOrUpdateSoilProfile,
  deleteSoilProfile,
  createProfileFromType,
  applyPresetDefaults,
  isStandardProfile,
  getLogForProfile,
  addSoilLogEntry,
  deleteSoilLogEntry,
} from "../lib/soilStore";
import type { SoilProfile, SoilLogAction, SoilKnowledgeLevel, SoilBaseType } from "../lib/soilTypes";
import {
  SOIL_BASE_TYPE_LABELS,
  SOIL_BASE_TYPE_DESC,
  SOIL_TYPE_ICONS,
  SOIL_TYPE_PH_RANGE,
  SOIL_COLOR_LABELS,
  SOIL_TEXTURE_LABELS,
  DRAINAGE_LABELS,
  MOISTURE_LABELS,
  EARTHWORM_LABELS,
  SOIL_HEALTH_LABELS,
  ORGANIC_LABELS,
  COMPOST_TYPE_LABELS,
  COMPOST_MATURITY_LABELS,
  COMPOST_AMOUNT_LABELS,
  PH_CATEGORY_LABELS,
  PH_METHOD_LABELS,
  LIME_CONTENT_LABELS,
  LIME_TYPE_LABELS,
  NUTRIENT_LABELS,
  NPK_SOURCE_LABELS,
  COMPRESSION_LABELS,
  SOIL_SECTIONS,
  SOIL_LOG_ACTION_LABELS,
  computeSoilRecommendations,
} from "../lib/soilTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GardenFeatureProperties = {
  gardenosId: string;
  category?: string;
  name?: string;
  [key: string]: unknown;
};

type GardenFeature = Feature<Geometry, GardenFeatureProperties>;

type SelectedFeature = {
  gardenosId: string;
  feature: GardenFeature;
};

const CATEGORY_LABELS: Record<string, string> = {
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

export interface PlantsTabProps {
  /** All plant species in the database */
  allPlants: PlantSpecies[];
  /** Navigation sub-tab (shared with Content tab soil navigation) */
  libSubTab: "plants" | "soil";
  setLibSubTab: (v: "plants" | "soil") => void;
  /** Soil profile being edited (set from Content tab too) */
  libSoilEditId: string | null;
  setLibSoilEditId: (v: string | null) => void;
  /** Whether to return to Content tab when exiting soil edit */
  soilEditReturnToContent: boolean;
  setSoilEditReturnToContent: (v: boolean) => void;
  /** Soil data version counter for reactivity */
  soilDataVersion: number;
  setSoilDataVersion: React.Dispatch<React.SetStateAction<number>>;
  /** Plant instances version counter (quick-add increments this) */
  setPlantInstancesVersion: React.Dispatch<React.SetStateAction<number>>;
  /** Currently selected map feature (for quick-add buttons) */
  selected: SelectedFeature | null;
  selectedCategory: string | undefined;
  /** Open the plant species editor */
  setEditPlantSpeciesId: (id: string | null) => void;
  setShowPlantEditor: (v: boolean) => void;
  /** Open the variety manager */
  setVarietyManagerSpeciesId: (id: string | null) => void;
  setShowVarietyManager: (v: boolean) => void;
  /** Navigation callbacks */
  setSidebarTab: (tab: "climate" | "create" | "content" | "groups" | "plants" | "view" | "scan" | "chat" | "tasks" | "conflicts" | "designs" | "journal") => void;
}

// ---------------------------------------------------------------------------
// Helper: build a PlantInstance with auto-filled id, plantedAt, season
// ---------------------------------------------------------------------------

function makePlantInstance(
  fields: Omit<PlantInstance, "id" | "plantedAt" | "season"> & { count?: number },
): PlantInstance {
  return {
    id: crypto.randomUUID(),
    plantedAt: new Date().toISOString().slice(0, 10),
    season: new Date().getFullYear(),
    ...fields,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function PlantsTabInner({
  allPlants,
  libSubTab,
  setLibSubTab,
  libSoilEditId,
  setLibSoilEditId,
  soilEditReturnToContent,
  setSoilEditReturnToContent,
  soilDataVersion,
  setSoilDataVersion,
  setPlantInstancesVersion,
  selected,
  selectedCategory,
  setEditPlantSpeciesId,
  setShowPlantEditor,
  setVarietyManagerSpeciesId,
  setShowVarietyManager,
  setSidebarTab,
}: PlantsTabProps) {
  // ── Internalized state (was in parent) ──
  const [plantSearch, setPlantSearch] = useState("");
  const [plantCategoryFilter, setPlantCategoryFilter] = useState<PlantCategory | "all">("all");
  const [plantEdibleFilter, setPlantEdibleFilter] = useState(false);
  const [expandedPlantId, setExpandedPlantId] = useState<string | null>(null);
  const [soilLevelFilter, setSoilLevelFilter] = useState<SoilKnowledgeLevel | "all">("all");
  const [soilOpenSections, setSoilOpenSections] = useState<Set<string>>(new Set(["type"]));
  const [soilLogOpen, setSoilLogOpen] = useState(false);
  const [soilLogAction, setSoilLogAction] = useState<SoilLogAction>("compost-added");
  const [soilLogNotes, setSoilLogNotes] = useState("");

  // ── Computed values (moved from parent) ──
  const filteredPlants = useMemo(() => {
    let list = allPlants;
    if (plantEdibleFilter) list = list.filter((p) => isEdiblePlant(p));
    if (plantCategoryFilter !== "all") list = list.filter((p) => p.category === plantCategoryFilter);
    if (plantSearch.trim()) {
      const q = plantSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.latinName?.toLowerCase().includes(q) ?? false) ||
          p.id.includes(q),
      );
    }
    return list;
  }, [allPlants, plantCategoryFilter, plantSearch, plantEdibleFilter]);

  const plantCountByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: allPlants.length };
    let edibleCount = 0;
    for (const p of allPlants) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
      if (isEdiblePlant(p)) edibleCount++;
    }
    counts.edible = edibleCount;
    return counts;
  }, [allPlants]);

  return (
    <div className="mt-3 space-y-3">
      {/* Sub-tab: Planter / Jord */}
      <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm">
        <button
          type="button"
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
            libSubTab === "plants"
              ? "bg-accent text-white shadow-sm"
              : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
          }`}
          onClick={() => setLibSubTab("plants")}
        >
          🌱 Planter
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
            libSubTab === "soil"
              ? "bg-accent text-white shadow-sm"
              : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
          }`}
          onClick={() => setLibSubTab("soil")}
        >
          🪨 Jord
        </button>
      </div>

      {libSubTab === "plants" ? (
      <>
      {/* Search */}
      <input
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm shadow-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
        placeholder="🔍 Søg plante (navn, latinsk, id)…"
        value={plantSearch}
        onChange={(e) => setPlantSearch(e.target.value)}
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-lg border border-green-500/30 bg-green-50/50 px-3 py-2 text-xs font-medium text-green-800 hover:bg-green-100 hover:border-green-500/50 transition-all dark:border-green-500/20 dark:bg-green-900/10 dark:text-green-300 dark:hover:bg-green-900/20"
          onClick={() => { setEditPlantSpeciesId(null); setShowPlantEditor(true); }}
        >
          ➕ Ny plante
        </button>
        <button
          type="button"
          className="flex-1 rounded-lg border border-accent/30 bg-accent-light/40 px-3 py-2 text-xs font-medium text-accent-dark hover:bg-accent-light hover:border-accent/50 transition-all"
          onClick={() => { setVarietyManagerSpeciesId(null); setShowVarietyManager(true); }}
        >
          🏷️ Sorter ({allPlants.reduce((s, p) => s + (p.varieties?.length ?? 0), 0)})
        </button>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
            plantCategoryFilter === "all" && !plantEdibleFilter
              ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
              : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
          }`}
          onClick={() => { setPlantCategoryFilter("all"); setPlantEdibleFilter(false); }}
        >
          Alle ({allPlants.length})
        </button>
        <button
          type="button"
          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
            plantEdibleFilter
              ? "border-green-500/40 bg-green-50 text-green-800 shadow-sm dark:border-green-400/30 dark:bg-green-900/20 dark:text-green-300"
              : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
          }`}
          onClick={() => setPlantEdibleFilter(!plantEdibleFilter)}
          title="Vis kun spiselige planter"
        >
          🍽️ Spiselig ({plantCountByCategory.edible ?? 0})
        </button>
        {(Object.entries(PLANT_CATEGORY_LABELS) as [PlantCategory, string][]).map(([cat, label]) => {
          const count = allPlants.filter((p) => p.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
                plantCategoryFilter === cat
                  ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                  : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
              }`}
              onClick={() => setPlantCategoryFilter(plantCategoryFilter === cat ? "all" : cat)}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Results count */}
      <p className="text-[10px] text-foreground/50">
        {filteredPlants.length} plante{filteredPlants.length !== 1 ? "r" : ""} fundet
      </p>

      {/* Plant list */}
      <div className="max-h-[60vh] space-y-1.5 overflow-y-auto sidebar-scroll">
        {filteredPlants.map((plant, _plantIdx) => {
          const isExpanded = expandedPlantId === plant.id;
          return (
            <div
              key={plant.id}
              {...(_plantIdx === 0 ? { "data-tour": "plant-card" } : {})}
              className={`rounded-lg border transition-all ${
                isExpanded
                  ? "border-accent/30 bg-accent-light/50 shadow-sm"
                  : "border-border bg-background hover:border-border hover:shadow-sm"
              }`}
            >
              {/* Collapsed row */}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                onClick={() => setExpandedPlantId(isExpanded ? null : plant.id)}
              >
                <span className="text-base leading-none">{plant.icon ?? "🌱"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground/90 truncate">{plant.name}</p>
                  {plant.latinName ? (
                    <p className="text-[10px] italic text-foreground/50 truncate">{plant.latinName}</p>
                  ) : null}
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {isEdiblePlant(plant) ? (
                    <span className="text-[10px]" title="Spiselig">🍽️</span>
                  ) : null}
                  {getDefaultPlacements(plant).map((pt) => (
                    <span key={pt} className="text-[10px]" title={PLACEMENT_LABELS[pt]}>{PLACEMENT_ICONS[pt]}</span>
                  ))}
                </div>
                <span className="shrink-0 text-foreground/30 text-xs">{isExpanded ? "▲" : "▼"}</span>
              </button>

              {/* Expanded detail card (progressive disclosure) */}
              {isExpanded ? (
                <div className="border-t border-accent/15 px-2.5 py-2.5 space-y-2.5">
                  {/* Quick info grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {plant.family ? (
                      <>
                        <span className="text-foreground/50">Familie</span>
                        <span>{PLANT_FAMILY_LABELS[plant.family]}</span>
                      </>
                    ) : null}
                    {plant.lifecycle ? (
                      <>
                        <span className="text-foreground/50">Livscyklus</span>
                        <span>{LIFECYCLE_LABELS[plant.lifecycle]}</span>
                      </>
                    ) : null}
                    {plant.difficulty ? (
                      <>
                        <span className="text-foreground/50">Sværhed</span>
                        <span>{DIFFICULTY_LABELS[plant.difficulty]}</span>
                      </>
                    ) : null}
                    {plant.light ? (
                      <>
                        <span className="text-foreground/50">Lys</span>
                        <span>{LIGHT_LABELS[plant.light]}</span>
                      </>
                    ) : null}
                    {plant.water ? (
                      <>
                        <span className="text-foreground/50">Vand</span>
                        <span>{WATER_LABELS[plant.water]}</span>
                      </>
                    ) : null}
                    {plant.spacingCm ? (
                      <>
                        <span className="text-foreground/50">Afstand</span>
                        <span>{plant.spacingCm} cm{plant.rowSpacingCm ? ` (rk. ${plant.rowSpacingCm} cm)` : ""}</span>
                      </>
                    ) : null}
                    {plant.frostHardy !== undefined ? (
                      <>
                        <span className="text-foreground/50">Frosttålig</span>
                        <span>{plant.frostHardy ? "Ja" : "Nej"}</span>
                      </>
                    ) : null}
                    {isEdiblePlant(plant) ? (
                      <>
                        <span className="text-foreground/50">Spiselig</span>
                        <span className="text-green-700 dark:text-green-400">🍽️ Ja</span>
                      </>
                    ) : null}
                  </div>

                  {/* Taste & Culinary */}
                  {plant.taste ? (
                    <div className="text-xs">
                      <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">🍽️ Smag</p>
                      <p className="text-foreground/70">{plant.taste}</p>
                    </div>
                  ) : null}
                  {plant.culinaryUses ? (
                    <div className="text-xs">
                      <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">👨‍🍳 Brug i køkkenet</p>
                      <p className="text-foreground/70">{plant.culinaryUses}</p>
                    </div>
                  ) : null}

                  {/* Sowing / planting / harvest timeline */}
                  {(plant.sowIndoor || plant.sowOutdoor || plant.plantOut || plant.harvest) ? (
                    <div className="space-y-0.5 text-xs">
                      <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">📅 Kalender</p>
                      {plant.sowIndoor ? (
                        <p>🏠 Forspiring: {formatMonthRange(plant.sowIndoor)}</p>
                      ) : null}
                      {plant.sowOutdoor ? (
                        <p>🌿 Direkte såning: {formatMonthRange(plant.sowOutdoor)}</p>
                      ) : null}
                      {plant.plantOut ? (
                        <p>📦 Udplantning: {formatMonthRange(plant.plantOut)}</p>
                      ) : null}
                      {plant.harvest ? (
                        <p>🧺 Høst: {formatMonthRange(plant.harvest)}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Harvest tips */}
                  {plant.harvestTips ? (
                    <div className="text-xs">
                      <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">🧺 Høsttips</p>
                      <p className="text-foreground/70">{plant.harvestTips}</p>
                    </div>
                  ) : null}

                  {/* Soil & Fertilizer */}
                  {(plant.soilAmendments || plant.fertilizerInfo) ? (
                    <div className="space-y-0.5 text-xs">
                      <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">🌍 Jord & gødning</p>
                      {plant.soilAmendments ? <p className="text-foreground/70">{plant.soilAmendments}</p> : null}
                      {plant.fertilizerInfo ? <p className="text-foreground/70">{plant.fertilizerInfo}</p> : null}
                    </div>
                  ) : null}

                  {/* Pests & Diseases */}
                  {(plant.pests?.length || plant.diseases?.length) ? (
                    <div className="space-y-0.5 text-xs">
                      <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">🐛 Skadedyr & sygdomme</p>
                      {plant.pests?.length ? <p className="text-foreground/70">Skadedyr: {plant.pests.join(", ")}</p> : null}
                      {plant.diseases?.length ? <p className="text-foreground/70">Sygdomme: {plant.diseases.join(", ")}</p> : null}
                    </div>
                  ) : null}

                  {/* Storage */}
                  {plant.storageInfo ? (
                    <div className="text-xs">
                      <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">📦 Opbevaring</p>
                      <p className="text-foreground/70">{plant.storageInfo}</p>
                    </div>
                  ) : null}

                  {/* Nutrition */}
                  {plant.nutrition ? (
                    <div className="text-xs">
                      <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">💪 Ernæring (per 100 g)</p>
                      <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                        <div className="rounded-lg bg-accent-light border border-accent/15 px-1.5 py-1.5 text-center">
                          <p className="text-[9px] text-accent-dark/60 font-medium">Kalorier</p>
                          <p className="text-sm font-bold text-accent-dark">{plant.nutrition.kcal}</p>
                          <p className="text-[8px] text-accent-dark/40">kcal</p>
                        </div>
                        <div className="rounded-lg bg-blue-50 border border-blue-200/40 px-1.5 py-1.5 text-center dark:bg-blue-900/20 dark:border-blue-800/30">
                          <p className="text-[9px] text-blue-600/70 font-medium dark:text-blue-400/70">Protein</p>
                          <p className="text-sm font-bold text-blue-700 dark:text-blue-400">{plant.nutrition.proteinG}</p>
                          <p className="text-[8px] text-blue-500/50">g</p>
                        </div>
                        <div className="rounded-lg bg-amber-50 border border-amber-200/40 px-1.5 py-1.5 text-center dark:bg-amber-900/20 dark:border-amber-800/30">
                          <p className="text-[9px] text-amber-600/70 font-medium dark:text-amber-400/70">Kulhydr.</p>
                          <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{plant.nutrition.carbG}</p>
                          <p className="text-[8px] text-amber-500/50">g</p>
                        </div>
                        <div className="rounded-lg bg-rose-50 border border-rose-200/40 px-1.5 py-1.5 text-center dark:bg-rose-900/20 dark:border-rose-800/30">
                          <p className="text-[9px] text-rose-600/70 font-medium dark:text-rose-400/70">Fedt</p>
                          <p className="text-sm font-bold text-rose-700 dark:text-rose-400">{plant.nutrition.fatG}</p>
                          <p className="text-[8px] text-rose-500/50">g</p>
                        </div>
                      </div>
                      {plant.nutrition.fiberG != null ? (
                        <p className="mt-1 text-foreground/50">🌾 Kostfibre: {plant.nutrition.fiberG} g</p>
                      ) : null}
                      {plant.nutrition.highlights ? (
                        <p className="mt-0.5 text-foreground/60 leading-snug">{plant.nutrition.highlights}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Companions */}
                  {(plant.goodCompanions?.length || plant.badCompanions?.length) ? (
                    <div className="space-y-0.5 text-xs">
                      <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">🤝 Samdyrkning</p>
                      {plant.goodCompanions?.length ? (
                        <p className="text-green-700 dark:text-green-400">
                          ✓ {plant.goodCompanions.map((id) => getPlantById(id)?.name ?? id).join(", ")}
                        </p>
                      ) : null}
                      {plant.badCompanions?.length ? (
                        <p className="text-red-600 dark:text-red-400">
                          ✕ {plant.badCompanions.map((id) => getPlantById(id)?.name ?? id).join(", ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Rotation */}
                  {plant.rotationYears ? (
                    <p className="text-xs text-foreground/60">
                      🔄 Sædskifte: {plant.rotationYears} år
                    </p>
                  ) : null}

                  {/* Description */}
                  {plant.description ? (
                    <p className="text-xs text-foreground/60 italic">{plant.description}</p>
                  ) : null}

                  {/* ── PLACEMENT BADGES ── */}
                  <div className="space-y-1">
                    <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">📍 Placering</p>
                    <div className="flex flex-wrap gap-1">
                      {getDefaultPlacements(plant).map((pt) => (
                        <span
                          key={pt}
                          className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground/[0.03] px-2 py-0.5 text-[10px] text-foreground/60"
                        >
                          {PLACEMENT_ICONS[pt]} {PLACEMENT_LABELS[pt]}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* ── EDIT PLANT BUTTON ── */}
                  <button
                    type="button"
                    className="w-full rounded-md border border-foreground/15 px-2 py-1.5 text-xs text-foreground/60 hover:border-foreground/25 hover:bg-foreground/5 transition-all"
                    onClick={(e) => { e.stopPropagation(); setEditPlantSpeciesId(plant.id); setShowPlantEditor(true); }}
                  >
                    ✏️ Redigér {plant.name}
                  </button>

                  {/* ── VARIETIES / SORTER ── */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">
                        🏷️ Sorter ({plant.varieties?.length ?? 0})
                      </p>
                      <button
                        type="button"
                        className="text-[10px] text-accent hover:text-accent-dark font-medium hover:underline"
                        onClick={(e) => { e.stopPropagation(); setVarietyManagerSpeciesId(plant.id); setShowVarietyManager(true); }}
                      >
                        ✏️ Administrer ›
                      </button>
                    </div>
                  </div>
                  {plant.varieties?.length ? (
                    <div className="space-y-1.5">
                      <div className="max-h-48 space-y-1 overflow-y-auto">
                        {plant.varieties.map((v) => (
                          <div
                            key={v.id}
                            className="rounded border border-foreground/10 bg-foreground/[0.02] px-2 py-1.5 space-y-0.5"
                          >
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-medium text-foreground/90">{v.name}</p>
                              {v.color ? <span className="text-[10px] text-foreground/40">({v.color})</span> : null}
                            </div>
                            {v.description ? (
                              <p className="text-[10px] text-foreground/60">{v.description}</p>
                            ) : null}
                            <div className="flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-foreground/50">
                              {v.taste ? <span>🍽️ {v.taste}</span> : null}
                              {v.daysToHarvest ? <span>⏱️ {v.daysToHarvest} dage</span> : null}
                              {v.spacingCm ? <span>↔️ {v.spacingCm} cm</span> : null}
                              {v.storageQuality ? <span>📦 {v.storageQuality === "excellent" ? "Fremragende" : v.storageQuality === "good" ? "God" : v.storageQuality === "fair" ? "OK" : "Kort"}</span> : null}
                              {v.resistances?.length ? <span>🛡️ {v.resistances.join(", ")}</span> : null}
                            </div>

                            {/* Quick-add variety to bed */}
                            {selected && selectedCategory && canPlaceInCategory(plant, selectedCategory) ? (
                              <button
                                type="button"
                                className="mt-1 w-full rounded border border-green-600/20 bg-green-50/50 px-1.5 py-1 text-[10px] font-medium text-green-800 hover:bg-green-100 dark:border-green-500/20 dark:bg-green-900/10 dark:text-green-300 dark:hover:bg-green-900/20"
                                onClick={() => {
                                  const featureId = selected.feature.properties?.gardenosId;
                                  if (!featureId) return;
                                  addPlantInstance(makePlantInstance({
                                    speciesId: plant.id,
                                    varietyId: v.id,
                                    varietyName: v.name,
                                    featureId,
                                    count: 1,
                                  }));
                                  setPlantInstancesVersion((prev) => prev + 1);
                                }}
                              >
                                + {v.name} → {selected.feature.properties?.name || "bed"}
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Quick-add species (no specific variety) to selected bed */}
                  {selected && selectedCategory && canPlaceInCategory(plant, selectedCategory) ? (
                    <button
                      type="button"
                      className="w-full rounded-md border border-green-600/30 bg-green-50 px-2 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100 dark:border-green-500/30 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30"
                      onClick={() => {
                        const featureId = selected.feature.properties?.gardenosId;
                        if (!featureId) return;
                        addPlantInstance(makePlantInstance({
                          speciesId: plant.id,
                          featureId,
                          count: 1,
                        }));
                        setPlantInstancesVersion((v) => v + 1);
                      }}
                    >
                      + Tilføj {plant.name} (uspecificeret sort) til {selected.feature.properties?.name || "valgt bed"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-foreground/40 leading-tight">
        📚 {allPlants.length} plantearter i databasen. Klik på en plante for at se detaljer.
        {selected && selectedCategory && selectedCategory !== "condition"
          ? ` Du kan tilføje planter direkte til det valgte ${CATEGORY_LABELS[selectedCategory] ?? "element"}.`
          : " Vælg et bed, række eller element på kortet for at tilføje planter."}
      </p>
      </>
      ) : null}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── JORD SUB-TAB: Soil Profiles list + editor ──────────  */}
      {/* ══════════════════════════════════════════════════════════ */}
      {libSubTab === "soil" ? (() => {
        const allProfiles = loadSoilProfiles();
        void soilDataVersion;
        const editingProfile = libSoilEditId ? getSoilProfileById(libSoilEditId) : undefined;

        /** Helper: update a field on the editing soil profile */
        const updateSoilField = (patch: Partial<SoilProfile>) => {
          if (!editingProfile) return;
          addOrUpdateSoilProfile({ ...editingProfile, ...patch });
          setSoilDataVersion((v) => v + 1);
        };

        /** Render a select dropdown for a soil field */
        const soilSelect = <T extends string>(
          label: string,
          value: T | undefined,
          options: Record<string, string>,
          onChange: (v: T) => void,
        ) => (
          <div>
            <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">{label}</label>
            <select
              className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value as T)}
            >
              <option value="">—</option>
              {Object.entries(options).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        );

        /** Render a yes/no toggle */
        const soilToggle = (label: string, value: boolean | undefined, onChange: (v: boolean | undefined) => void) => (
          <div>
            <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">{label}</label>
            <div className="mt-0.5 flex gap-1">
              {(["yes", "no", "unknown"] as const).map((opt) => {
                const isActive = opt === "yes" ? value === true : opt === "no" ? value === false : value === undefined;
                return (
                  <button
                    key={opt}
                    type="button"
                    className={`flex-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${
                      isActive
                        ? "border-accent/30 bg-accent-light text-accent-dark"
                        : "border-border bg-background text-foreground/50 hover:bg-foreground/5"
                    }`}
                    onClick={() => onChange(opt === "yes" ? true : opt === "no" ? false : undefined)}
                  >
                    {opt === "yes" ? "Ja" : opt === "no" ? "Nej" : "—"}
                  </button>
                );
              })}
            </div>
          </div>
        );

        const filteredSections = SOIL_SECTIONS.filter((s) =>
          soilLevelFilter === "all" || s.level <= soilLevelFilter
        );

        const logEntries = editingProfile ? getLogForProfile(editingProfile.id) : [];
        const recs = editingProfile ? computeSoilRecommendations(editingProfile) : [];

        return (
          <div className="space-y-3">
            {/* ── Profile list (when NOT editing) ── */}
            {!libSoilEditId ? (
              <>
                {/* Type-picker: create new profile from a soil type */}
                <div>
                  <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide mb-1">➕ Opret ny jordprofil</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(SOIL_BASE_TYPE_LABELS) as SoilBaseType[]).map((bt) => (
                      <button
                        key={bt}
                        type="button"
                        className="flex flex-col items-center gap-0.5 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-2 py-2 text-center hover:bg-accent-light/30 hover:border-accent/40 transition-all"
                        onClick={() => {
                          const bp = createProfileFromType(bt);
                          addOrUpdateSoilProfile(bp);
                          setSoilDataVersion((v) => v + 1);
                          setLibSoilEditId(bp.id);
                        }}
                      >
                        <span className="text-lg leading-none">{SOIL_TYPE_ICONS[bt]}</span>
                        <span className="text-[10px] font-medium text-foreground/70">{SOIL_BASE_TYPE_LABELS[bt]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {allProfiles.length === 0 ? (
                  <p className="text-xs text-foreground/40 italic text-center py-4">
                    🪨 Ingen jordprofiler endnu. Vælg en jordtype ovenfor.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {allProfiles.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5 text-left hover:bg-foreground/[0.05] hover:border-accent/30 transition-all group"
                        onClick={() => setLibSoilEditId(p.id)}
                      >
                        <span className="text-base">🪨</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{p.name}</div>
                          {isStandardProfile(p) ? (
                            <div className="text-[10px] text-foreground/30 italic">Standardprofil</div>
                          ) : p.baseType ? (
                            <div className="text-[10px] text-foreground/50">{SOIL_BASE_TYPE_LABELS[p.baseType]} — tilpasset</div>
                          ) : (
                            <div className="text-[10px] text-foreground/30 italic">Ingen type valgt</div>
                          )}
                        </div>
                        <span className="text-[10px] text-foreground/30 group-hover:text-accent transition-colors">Rediger →</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-foreground/40 leading-tight">
                  🪨 {allProfiles.length} jordprofil{allProfiles.length !== 1 ? "er" : ""} oprettet. Jordprofiler kan tilknyttes beds, beholdere og jord-zoner via Indhold-panelet.
                </p>
              </>
            ) : editingProfile ? (
              <>
                {/* ── Back button ── */}
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-all"
                  onClick={() => {
                    setLibSoilEditId(null);
                    if (soilEditReturnToContent) {
                      setSoilEditReturnToContent(false);
                      setSidebarTab("content");
                    }
                  }}
                >
                  {soilEditReturnToContent ? "← Tilbage til indhold" : "← Tilbage til liste"}
                </button>

                {/* ── Profile name ── */}
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium shadow-sm"
                    value={editingProfile.name}
                    onChange={(e) => updateSoilField({ name: e.target.value })}
                    placeholder="Profilnavn"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded px-2 py-1.5 text-[10px] text-red-500/60 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all"
                    onClick={() => {
                      if (confirm("Slet denne jordprofil permanent?")) {
                        deleteSoilProfile(editingProfile.id);
                        setSoilDataVersion((v) => v + 1);
                        setLibSoilEditId(null);
                      }
                    }}
                    title="Slet profil"
                  >
                    🗑️ Slet
                  </button>
                </div>

                {/* ── Level filter pills ── */}
                <div className="flex gap-1">
                  {([
                    { v: "all" as const, label: "Alle" },
                    { v: 1 as const, label: "👀 Basis" },
                    { v: 2 as const, label: "🧪 Nørdet" },
                    { v: 3 as const, label: "🔬 Lab" },
                  ]).map((opt) => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                        soilLevelFilter === opt.v
                          ? "bg-accent text-white shadow-sm"
                          : "bg-foreground/5 text-foreground/50 hover:bg-foreground/10"
                      }`}
                      onClick={() => setSoilLevelFilter(opt.v)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* ── Recommendations ── */}
                {recs.length > 0 ? (
                  <div className="space-y-1">
                    {recs.map((r, i) => (
                      <div
                        key={i}
                        className={`rounded-md border px-2 py-1.5 text-[11px] ${
                          r.priority === "warning"
                            ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                            : r.priority === "suggestion"
                            ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
                            : "border-foreground/10 bg-foreground/[0.02] text-foreground/60"
                        }`}
                      >
                        <span className="font-medium">{r.icon} {r.label}</span>
                        <p className="text-[10px] opacity-80 mt-0.5">{r.description}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* ── Accordion sections ── */}
                {filteredSections.map((section) => {
                  const isOpen = soilOpenSections.has(section.key);
                  return (
                    <div key={section.key} className="rounded-md border border-foreground/10 overflow-hidden">
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                        onClick={() => {
                          setSoilOpenSections((prev) => {
                            const next = new Set(prev);
                            if (next.has(section.key)) next.delete(section.key);
                            else next.add(section.key);
                            return next;
                          });
                        }}
                      >
                        <span className="text-xs leading-none">{section.icon}</span>
                        <span className="flex-1 text-[10px] font-semibold text-foreground/60 uppercase tracking-wide">{section.label}</span>
                        <span className="rounded-full bg-foreground/5 px-1.5 py-0.5 text-[8px] text-foreground/40">Niv. {section.level}</span>
                        <span className="text-[9px] text-foreground/30">{isOpen ? "▲" : "▼"}</span>
                      </button>

                      {isOpen ? (
                        <div className="px-2.5 pb-2 pt-1 space-y-2">
                          {/* ── 1. Jordtype ── */}
                          {section.key === "type" ? (
                            <div className="grid grid-cols-1 gap-2">
                              {soilSelect("Jordtype", editingProfile.baseType, SOIL_BASE_TYPE_LABELS, (v) => {
                                if (!v) { updateSoilField({ baseType: undefined }); return; }
                                const merged = applyPresetDefaults(editingProfile, v as SoilBaseType);
                                addOrUpdateSoilProfile(merged);
                                setSoilDataVersion((p) => p + 1);
                              })}
                              {editingProfile.baseType && SOIL_BASE_TYPE_DESC[editingProfile.baseType] ? (
                                <p className="text-[10px] text-foreground/40 italic leading-snug">{SOIL_BASE_TYPE_DESC[editingProfile.baseType]}</p>
                              ) : null}
                              <div className="grid grid-cols-2 gap-2">
                                {soilSelect("Farve", editingProfile.color, SOIL_COLOR_LABELS, (v) => updateSoilField({ color: v || undefined }))}
                                {soilSelect("Struktur ved berøring", editingProfile.texture, SOIL_TEXTURE_LABELS, (v) => updateSoilField({ texture: v || undefined }))}
                              </div>
                            </div>
                          ) : null}

                          {/* ── 2. Fugt & dræning ── */}
                          {section.key === "moisture" ? (
                            <div className="grid grid-cols-2 gap-2">
                              {soilSelect("Dræning", editingProfile.drainage, DRAINAGE_LABELS, (v) => updateSoilField({ drainage: v || undefined }))}
                              {soilSelect("Aktuel fugtighed", editingProfile.moisture, MOISTURE_LABELS, (v) => updateSoilField({ moisture: v || undefined }))}
                              <div className="col-span-2">
                                {soilToggle("Tendens til udtørring", editingProfile.droughtProne, (v) => updateSoilField({ droughtProne: v }))}
                              </div>
                            </div>
                          ) : null}

                          {/* ── 3. Liv i jorden ── */}
                          {section.key === "life" ? (
                            <div className="grid grid-cols-2 gap-2">
                              {soilSelect("Regnorme ved gravning", editingProfile.earthworms, EARTHWORM_LABELS, (v) => updateSoilField({ earthworms: v || undefined }))}
                              {soilSelect("Generel vurdering", editingProfile.soilHealth, SOIL_HEALTH_LABELS, (v) => updateSoilField({ soilHealth: v || undefined }))}
                              <div className="col-span-2">
                                {soilToggle("Synligt svampeflor", editingProfile.fungalNetwork, (v) => updateSoilField({ fungalNetwork: v }))}
                              </div>
                            </div>
                          ) : null}

                          {/* ── 4. Organisk indhold ── */}
                          {section.key === "organic" ? (
                            <div className="space-y-2">
                              {soilSelect("Organisk indhold (visuelt)", editingProfile.organicVisual, ORGANIC_LABELS, (v) => updateSoilField({ organicVisual: v || undefined }))}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Organisk % (valgfrit)</label>
                                  <input
                                    type="number" min={0} max={20} step={0.5}
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
                                    value={editingProfile.organicPercent ?? ""}
                                    onChange={(e) => updateSoilField({ organicPercent: e.target.value ? Number(e.target.value) : undefined })}
                                    placeholder="0–20"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Seneste tilsætning</label>
                                  <input
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
                                    value={editingProfile.lastAmendment ?? ""}
                                    onChange={(e) => updateSoilField({ lastAmendment: e.target.value || undefined })}
                                    placeholder="Fx Kompost forår 2024"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {/* ── 5. Kompost ── */}
                          {section.key === "compost" ? (
                            <div className="space-y-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Komposttype (vælg alle relevante)</label>
                                <div className="mt-0.5 flex flex-wrap gap-1">
                                  {(Object.entries(COMPOST_TYPE_LABELS) as [string, string][]).map(([k, v]) => {
                                    const active = editingProfile.compostTypes?.includes(k as never) ?? false;
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                                          active
                                            ? "bg-accent text-white shadow-sm"
                                            : "bg-foreground/5 text-foreground/50 hover:bg-foreground/10"
                                        }`}
                                        onClick={() => {
                                          const current = editingProfile.compostTypes ?? [];
                                          const next = active ? current.filter((c) => c !== k) : [...current, k];
                                          updateSoilField({ compostTypes: next.length ? next as never[] : undefined });
                                        }}
                                      >
                                        {v}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {soilSelect("Modenhed", editingProfile.compostMaturity, COMPOST_MATURITY_LABELS, (v) => updateSoilField({ compostMaturity: v || undefined }))}
                                {soilSelect("Mængde tilsat", editingProfile.compostAmount, COMPOST_AMOUNT_LABELS, (v) => updateSoilField({ compostAmount: v || undefined }))}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Senest tilsat</label>
                                  <input
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
                                    value={editingProfile.compostLastApplied ?? ""}
                                    onChange={(e) => updateSoilField({ compostLastApplied: e.target.value || undefined })}
                                    placeholder="Fx Efterår 2024"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Noter</label>
                                  <input
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
                                    value={editingProfile.compostNotes ?? ""}
                                    onChange={(e) => updateSoilField({ compostNotes: e.target.value || undefined })}
                                    placeholder="Fx kilde, kvalitet"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {/* ── 6. pH ── */}
                          {section.key === "ph" ? (
                            <div className="space-y-2">
                              {editingProfile.baseType ? (
                                <p className="text-[10px] text-foreground/40 italic leading-snug">
                                  💡 Typisk pH-spænd for {SOIL_BASE_TYPE_LABELS[editingProfile.baseType]}: <strong>{SOIL_TYPE_PH_RANGE[editingProfile.baseType]}</strong>
                                </p>
                              ) : null}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">pH (målt)</label>
                                  <input
                                    type="number" min={4} max={8.5} step={0.1}
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
                                    value={editingProfile.phMeasured ?? ""}
                                    onChange={(e) => updateSoilField({ phMeasured: e.target.value ? Number(e.target.value) : undefined })}
                                    placeholder="4.0–8.5"
                                  />
                                </div>
                                {soilSelect("pH (kategori)", editingProfile.phCategory, PH_CATEGORY_LABELS, (v) => updateSoilField({ phCategory: v || undefined }))}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {soilSelect("Målemetode", editingProfile.phMethod, PH_METHOD_LABELS, (v) => updateSoilField({ phMethod: v || undefined }))}
                                <div>
                                  <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Senest målt</label>
                                  <input
                                    type="date"
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
                                    value={editingProfile.phLastMeasured ?? ""}
                                    onChange={(e) => updateSoilField({ phLastMeasured: e.target.value || undefined })}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {/* ── 7. Kalkindhold ── */}
                          {section.key === "lime" ? (
                            <div className="grid grid-cols-2 gap-2">
                              {soilSelect("Kalkindhold", editingProfile.limeContent, LIME_CONTENT_LABELS, (v) => updateSoilField({ limeContent: v || undefined }))}
                              {soilSelect("Kalk tilsat (type)", editingProfile.limeType, LIME_TYPE_LABELS, (v) => updateSoilField({ limeType: v || undefined }))}
                              <div className="col-span-2">
                                {soilToggle("Kalket inden for 3 år", editingProfile.limedRecently, (v) => updateSoilField({ limedRecently: v }))}
                              </div>
                            </div>
                          ) : null}

                          {/* ── 8. NPK ── */}
                          {section.key === "npk" ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                {soilSelect("Kvælstof (N)", editingProfile.nitrogen, NUTRIENT_LABELS, (v) => updateSoilField({ nitrogen: v || undefined }))}
                                {soilSelect("Fosfor (P)", editingProfile.phosphorus, NUTRIENT_LABELS, (v) => updateSoilField({ phosphorus: v || undefined }))}
                                {soilSelect("Kalium (K)", editingProfile.potassium, NUTRIENT_LABELS, (v) => updateSoilField({ potassium: v || undefined }))}
                                {soilSelect("Magnesium (Mg)", editingProfile.magnesium, NUTRIENT_LABELS, (v) => updateSoilField({ magnesium: v || undefined }))}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {soilSelect("Kilde", editingProfile.npkSource, NPK_SOURCE_LABELS, (v) => updateSoilField({ npkSource: v || undefined }))}
                                <div>
                                  <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Analysedato</label>
                                  <input
                                    type="date"
                                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
                                    value={editingProfile.npkDate ?? ""}
                                    onChange={(e) => updateSoilField({ npkDate: e.target.value || undefined })}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {/* ── 9. Kornstørrelse ── */}
                          {section.key === "grain" ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-3 gap-2">
                                {(["clay", "sand", "silt"] as const).map((grain) => {
                                  const key = `${grain}Percent` as "clayPercent" | "sandPercent" | "siltPercent";
                                  const labels = { clay: "Ler %", sand: "Sand %", silt: "Silt %" };
                                  return (
                                    <div key={grain}>
                                      <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">{labels[grain]}</label>
                                      <input
                                        type="number" min={0} max={100} step={1}
                                        className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
                                        value={editingProfile[key] ?? ""}
                                        onChange={(e) => updateSoilField({ [key]: e.target.value ? Number(e.target.value) : undefined })}
                                        placeholder="0–100"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              {soilSelect("Kompression", editingProfile.compression, COMPRESSION_LABELS, (v) => updateSoilField({ compression: v || undefined }))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {/* ── Soil log / change history ── */}
                <div className="rounded-md border border-foreground/10 overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                    onClick={() => setSoilLogOpen(!soilLogOpen)}
                  >
                    <span className="text-xs leading-none">📋</span>
                    <span className="flex-1 text-[10px] font-semibold text-foreground/60 uppercase tracking-wide">
                      Ændringslog ({logEntries.length})
                    </span>
                    <span className="text-[9px] text-foreground/30">{soilLogOpen ? "▲" : "▼"}</span>
                  </button>
                  {soilLogOpen ? (
                    <div className="px-2.5 pb-2 pt-1 space-y-2">
                      {/* Add entry */}
                      <div className="grid grid-cols-[1fr_auto] gap-1.5">
                        <select
                          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] shadow-sm"
                          value={soilLogAction}
                          onChange={(e) => setSoilLogAction(e.target.value as SoilLogAction)}
                        >
                          {Object.entries(SOIL_LOG_ACTION_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground/70 hover:bg-foreground/5 transition-colors shadow-sm"
                          onClick={() => {
                            addSoilLogEntry({
                              id: crypto.randomUUID(),
                              profileId: editingProfile.id,
                              date: new Date().toISOString().slice(0, 10),
                              action: soilLogAction,
                              notes: soilLogNotes || undefined,
                            });
                            setSoilLogNotes("");
                            setSoilDataVersion((v) => v + 1);
                          }}
                        >
                          + Tilføj
                        </button>
                      </div>
                      <input
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] shadow-sm"
                        value={soilLogNotes}
                        onChange={(e) => setSoilLogNotes(e.target.value)}
                        placeholder="Note (valgfrit)"
                      />

                      {/* Existing entries */}
                      {logEntries.length > 0 ? (
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                          {logEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] text-foreground/60 hover:bg-foreground/[0.03]"
                            >
                              <span className="shrink-0 text-foreground/40">{entry.date}</span>
                              <span className="flex-1 truncate">{SOIL_LOG_ACTION_LABELS[entry.action]}{entry.notes ? ` — ${entry.notes}` : ""}</span>
                              <button
                                type="button"
                                className="shrink-0 rounded px-1 text-foreground/30 hover:text-red-500"
                                onClick={() => { deleteSoilLogEntry(entry.id); setSoilDataVersion((v) => v + 1); }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-foreground/40 italic">Ingen registreringer endnu.</p>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* ── Profile notes ── */}
                <div>
                  <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Jordnoter</label>
                  <textarea
                    className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm resize-none"
                    rows={2}
                    value={editingProfile.notes ?? ""}
                    onChange={(e) => updateSoilField({ notes: e.target.value || undefined })}
                    placeholder="Generelle noter om denne jord…"
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-foreground/40 italic">Jordprofilen blev ikke fundet. <button type="button" className="underline" onClick={() => setLibSoilEditId(null)}>Gå tilbage</button></p>
            )}
          </div>
        );
      })() : null}

    </div>
  );
}

const PlantsTab = React.memo(PlantsTabInner);
export default PlantsTab;
