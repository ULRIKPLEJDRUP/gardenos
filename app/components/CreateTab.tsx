"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import type { PlantSpecies, PlantCategory } from "../lib/plantTypes";
import { PLANT_CATEGORY_LABELS } from "../lib/plantTypes";
import {
  getPlantById,
  getVarietiesForSpecies,
} from "../lib/plantStore";
import {
  getInfraElementById,
  getInfraElementsForMode,
  ELEMENT_MODE_LABELS,
  ELEMENT_MODE_ICONS,
} from "../lib/elementData";
import type { ElementModeKey } from "../lib/elementData";

// ---------------------------------------------------------------------------
// Types (mirrored from GardenMapClient — lightweight copies)
// ---------------------------------------------------------------------------

type GardenFeatureCategory = "element" | "row" | "seedbed" | "container" | "area" | "condition";
type GardenFeatureKind = string;
type KindGeometry = "point" | "polygon" | "polyline";
type KindSubGroup = "plant" | "infra" | "default" | "zone" | "structure" | "cover" | "soil" | "climate";

type KindDef = {
  kind: string;
  label: string;
  category: GardenFeatureCategory;
  geometry: KindGeometry;
  subGroup?: KindSubGroup;
};

type ElementMode = "planter" | "el" | "vand" | "lampe";

const CATEGORY_LABELS: Record<GardenFeatureCategory, string> = {
  element: "Element",
  row: "Række",
  seedbed: "Såbed",
  container: "Container",
  area: "Område",
  condition: "Særligt forhold",
};

const CATEGORY_DESCRIPTIONS: Record<GardenFeatureCategory, string> = {
  element: "Planter, træer, buske, ledninger, lamper",
  row: "Rækker – indeholder elementer",
  seedbed: "Såbede – indeholder rækker, containere, elementer",
  container: "Krukker, kasser, højbede, ampler – indeholder elementer",
  area: "Havezoner, bygninger, overdækninger og indhegninger",
  condition: "Jordforhold, klima og miljøpåvirkninger",
};

const SUB_GROUP_LABELS: Partial<Record<KindSubGroup, string>> = {
  zone: "🌿 Havezoner",
  structure: "🏠 Bygninger & strukturer",
  cover: "🏡 Overdækninger & indhegninger",
  soil: "🪨 Jordforhold",
  climate: "🌤️ Klima & miljø",
};

// ---------------------------------------------------------------------------
// Selection info reported to parent (for ref-sync in onCreated)
// ---------------------------------------------------------------------------

export type CreateSelectionInfo = {
  speciesId: string | null;
  varietyId: string | null;
  varietyName: string | null;
  elementId: string | null;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CreateTabProps {
  /** All plant species in the database */
  allPlants: PlantSpecies[];
  /** Plant count by category (computed in parent, shared with other tabs) */
  plantCountByCategory: Record<string, number>;
  /** Current draw mode from parent */
  drawMode: string;
  /** Trigger map drawing for a given kind */
  beginDraw: (kind: string) => void;
  /** Enter select/pointer mode */
  enterSelectMode: () => void;
  /** Ref for current create kind (shared with DrawHandler) */
  createKindRef: React.MutableRefObject<string>;
  /** All visible kind definitions */
  allKindDefs: KindDef[];
  /** KNOWN_KIND_DEFS constant (for restoreHiddenKinds) */
  knownKindDefs: KindDef[];
  /** Add a custom kind to the catalogue */
  onAddCustomKind: (label: string, category: GardenFeatureCategory, subGroup: KindSubGroup) => string | null;
  /** Remove/hide a kind */
  onRemoveKind: (kind: string) => void;
  /** Restore all hidden built-in kinds for a category */
  onRestoreHiddenKinds: (category: GardenFeatureCategory) => void;
  /** Can the currently selected kind be removed? */
  canRemoveKind: (category: GardenFeatureCategory) => boolean;
  /** Hidden built-in kinds in a given category */
  hiddenInCategory: (category: GardenFeatureCategory) => KindDef[];
  /** Report selection changes (species/variety/element) so parent can sync refs */
  onSelectionChange: (info: CreateSelectionInfo) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CreateTab = React.memo(function CreateTab({
  allPlants,
  plantCountByCategory,
  drawMode,
  beginDraw,
  enterSelectMode,
  createKindRef,
  allKindDefs,
  knownKindDefs,
  onAddCustomKind,
  onRemoveKind,
  onRestoreHiddenKinds,
  canRemoveKind,
  hiddenInCategory,
  onSelectionChange,
}: CreateTabProps) {
  // ── Internal state ──
  const [createPalette, setCreatePalette] = useState<GardenFeatureCategory>("element");
  const [createKind, setCreateKind] = useState<GardenFeatureKind>("tree");
  const [newKindText, setNewKindText] = useState("");
  const [newKindError, setNewKindError] = useState<string | null>(null);
  const [elementMode, setElementMode] = useState<ElementMode>("planter");
  const [createSubGroupFilter, setCreateSubGroupFilter] = useState<KindSubGroup | null>(null);
  const [createPlantSearch, setCreatePlantSearch] = useState("");
  const [createPlantCategoryFilter, setCreatePlantCategoryFilter] = useState<PlantCategory | "all">("all");
  const [createSelectedSpeciesId, setCreateSelectedSpeciesId] = useState<string | null>(null);
  const [createSelectedVarietyId, setCreateSelectedVarietyId] = useState<string | null>(null);
  const [createSelectedVarietyName, setCreateSelectedVarietyName] = useState<string | null>(null);
  const [createSelectedElementId, setCreateSelectedElementId] = useState<string | null>(null);

  // ── Sync selection changes to parent (replaces the ref-sync effects) ──
  useEffect(() => {
    onSelectionChange({
      speciesId: createSelectedSpeciesId,
      varietyId: createSelectedVarietyId,
      varietyName: createSelectedVarietyName,
      elementId: createSelectedElementId,
    });
  }, [createSelectedSpeciesId, createSelectedVarietyId, createSelectedVarietyName, createSelectedElementId, onSelectionChange]);

  // ── Computed values (formerly useMemos in parent) ──
  const defaultCreateKindForPalette = useMemo(() => {
    const first = (cat: GardenFeatureCategory) =>
      allKindDefs.find((d) => d.category === cat)?.kind ?? "tree";
    return {
      element: first("element"),
      row: first("row"),
      seedbed: first("seedbed"),
      container: first("container"),
      area: first("area"),
      condition: first("condition"),
    } as const;
  }, [allKindDefs]);

  const createPlantResults = useMemo(() => {
    let list = allPlants;
    if (createPlantCategoryFilter !== "all") {
      list = list.filter((p) => p.category === createPlantCategoryFilter);
    }
    if (createPlantSearch.trim()) {
      const q = createPlantSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.latinName?.toLowerCase().includes(q) ?? false) ||
          p.id.includes(q),
      );
    }
    return list.slice(0, 30);
  }, [allPlants, createPlantCategoryFilter, createPlantSearch]);

  const createKindOptions = useMemo(() => {
    return allKindDefs
      .filter((d) => d.category === createPalette)
      .map((d) => ({ value: d.kind as GardenFeatureKind, label: d.label, subGroup: d.subGroup ?? "default" as KindSubGroup }));
  }, [allKindDefs, createPalette]);

  const createKindSubGroups = useMemo(() => {
    const groups: KindSubGroup[] = [];
    for (const opt of createKindOptions) {
      if (!groups.includes(opt.subGroup)) groups.push(opt.subGroup);
    }
    return groups;
  }, [createKindOptions]);

  // ── Callbacks ──
  const kindForElementMode = useCallback((mode: string): GardenFeatureKind => {
    switch (mode) {
      case "el": return "electric";
      case "vand": return "water";
      case "lampe": return "lamp";
      default: return "plant";
    }
  }, []);

  const handleAddCustomKind = useCallback(() => {
    const label = newKindText.trim();
    if (!label) {
      setNewKindError("Skriv et navn for typen.");
      return;
    }

    const subGroup: KindSubGroup =
      createPalette === "element" ? "plant"
      : createPalette === "area" ? "zone"
      : createPalette === "condition" ? "climate"
      : "default";

    const error = onAddCustomKind(label, createPalette, subGroup);
    if (error) {
      setNewKindError(error);
      return;
    }

    // Select the newly created kind
    setCreateKind(label);
    createKindRef.current = label;
    setNewKindText("");
    setNewKindError(null);
  }, [createPalette, newKindText, onAddCustomKind, createKindRef]);

  const handleRemoveKind = useCallback((kindToRemove: string) => {
    onRemoveKind(kindToRemove);

    // If we just removed the selected kind, pick fallback
    if (createKind.toLowerCase() === kindToRemove.toLowerCase()) {
      const remaining = allKindDefs.filter(
        (d) => d.category === createPalette && d.kind.toLowerCase() !== kindToRemove.toLowerCase(),
      );
      const fallback = remaining[0];
      if (fallback) {
        setCreateKind(fallback.kind);
        createKindRef.current = fallback.kind;
      }
    }
  }, [allKindDefs, createKind, createPalette, createKindRef, onRemoveKind]);

  const beginDrawSelectedType = useCallback(() => {
    if (createPalette === "element") {
      if (elementMode === "planter") {
        let kind: GardenFeatureKind = "plant";
        if (createSelectedSpeciesId) {
          const sp = getPlantById(createSelectedSpeciesId);
          if (sp) {
            switch (sp.category) {
              case "tree": kind = "tree"; break;
              case "bush": kind = "bush"; break;
              case "flower": kind = "flower"; break;
              default: kind = "plant"; break;
            }
          }
        }
        setCreateKind(kind);
        createKindRef.current = kind;
        beginDraw(kind);
      } else {
        let kind: GardenFeatureKind;
        if (createSelectedElementId) {
          const el = getInfraElementById(createSelectedElementId);
          kind = el?.featureKind ?? kindForElementMode(elementMode);
        } else {
          kind = kindForElementMode(elementMode);
        }
        setCreateKind(kind);
        createKindRef.current = kind;
        beginDraw(kind);
      }
      return;
    }
    beginDraw(createKind);
  }, [beginDraw, createKind, createKindRef, createPalette, elementMode, createSelectedSpeciesId, createSelectedElementId, kindForElementMode]);

  // ── Render ──
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="col-span-2">
        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Kategori</label>
        <div className="mt-1.5 grid grid-cols-3 gap-1" data-tour="create-categories">
          {(["area", "seedbed", "row", "container", "element", "condition"] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              className={`rounded-lg border px-2 py-2 text-xs transition-all ${
                createPalette === cat
                  ? "border-accent/40 bg-accent-light text-accent-dark font-semibold shadow-sm"
                  : "border-border bg-background hover:bg-foreground/5 text-foreground/70"
              }`}
              onClick={() => {
                setCreatePalette(cat);
                const next = defaultCreateKindForPalette[cat] as GardenFeatureKind;
                setCreateKind(next);
                createKindRef.current = next;
                setNewKindError(null);
                setElementMode("planter");
                setCreateSubGroupFilter(null);
                setCreateSelectedSpeciesId(null);
                setCreateSelectedVarietyId(null);
                setCreateSelectedVarietyName(null);
                setCreateSelectedElementId(null);
                setCreatePlantSearch("");
                setCreatePlantCategoryFilter("all");
              }}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-foreground/50">{CATEGORY_DESCRIPTIONS[createPalette]}</p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ELEMENT: Type buttons (Planter/El/Vand/Lampe) + plant picker
         ══════════════════════════════════════════════════════════════════ */}
      {createPalette === "element" ? (
        <>
          <div className="col-span-2">
            <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Type</label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {([
                { mode: "planter" as const, label: "🌱 Planter", desc: "Vælg fra plantearkivet" },
                { mode: "el" as const, label: "⚡ El / Ledning", desc: "Tegn el-ledning" },
                { mode: "vand" as const, label: "💧 Vand / Rør", desc: "Tegn vandledning" },
                { mode: "lampe" as const, label: "💡 Lampe", desc: "Placér lampe" },
              ]).map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  data-tour={opt.mode === "planter" ? "create-element-plants" : opt.mode === "el" ? "create-element-infra" : undefined}
                  className={`rounded-lg border px-3 py-2 text-xs text-left transition-all ${
                    elementMode === opt.mode
                      ? "border-accent/40 bg-accent-light text-accent-dark font-semibold shadow-sm"
                      : "border-border bg-background hover:bg-foreground/5 text-foreground/70"
                  }`}
                  onClick={() => {
                    setElementMode(opt.mode);
                    setCreateSelectedSpeciesId(null);
                    setCreateSelectedVarietyId(null);
                    setCreateSelectedVarietyName(null);
                    setCreatePlantSearch("");
                    setCreatePlantCategoryFilter("all");
                    setCreateSelectedElementId(null);
                    if (opt.mode !== "planter") {
                      const k = kindForElementMode(opt.mode);
                      setCreateKind(k);
                      createKindRef.current = k;
                    } else {
                      setCreateKind("plant");
                      createKindRef.current = "plant";
                    }
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Planter mode: category pills + search + plant list ── */}
          {elementMode === "planter" ? (
            <div className="col-span-2 space-y-2">
              {createSelectedSpeciesId ? (() => {
                const pickedSpecies = getPlantById(createSelectedSpeciesId);
                const varieties = getVarietiesForSpecies(createSelectedSpeciesId);
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent-light/30 px-2.5 py-2">
                      <span className="text-lg leading-none">{pickedSpecies?.icon ?? "🌱"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{pickedSpecies?.name ?? createSelectedSpeciesId}</p>
                        {pickedSpecies?.latinName ? (
                          <p className="text-[10px] text-foreground/40 italic truncate">{pickedSpecies.latinName}</p>
                        ) : null}
                        {pickedSpecies ? (
                          <p className="text-[10px] text-foreground/50">
                            {PLANT_CATEGORY_LABELS[pickedSpecies.category]}
                            {pickedSpecies.light ? ` · ${({
                              "full-sun": "Fuld sol",
                              "partial-shade": "Halvskygge",
                              "shade": "Skygge",
                            } as Record<string, string>)[pickedSpecies.light] ?? ""}` : ""}
                          </p>
                        ) : null}
                        {createSelectedVarietyName ? (
                          <p className="text-[10px] text-accent font-medium">Sort: {createSelectedVarietyName}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-foreground/40 hover:bg-red-50 hover:text-red-500"
                        onClick={() => {
                          setCreateSelectedSpeciesId(null);
                          setCreateSelectedVarietyId(null);
                          setCreateSelectedVarietyName(null);
                        }}
                        title="Vælg en anden"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Variety picker */}
                    {varieties.length > 0 ? (
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-medium text-foreground/50">Vælg sort:</p>
                        <div className="max-h-36 overflow-y-auto space-y-0.5">
                          <button
                            type="button"
                            className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] hover:bg-foreground/5 ${
                              !createSelectedVarietyId ? "bg-accent/10 font-medium text-accent" : "text-foreground/70"
                            }`}
                            onClick={() => {
                              setCreateSelectedVarietyId(null);
                              setCreateSelectedVarietyName(null);
                            }}
                          >
                            <span className="text-sm leading-none">🌱</span>
                            <span className="truncate">{pickedSpecies?.name} (uspecificeret sort)</span>
                            {!createSelectedVarietyId ? <span className="ml-auto text-[9px]">✓</span> : null}
                          </button>
                          {varieties.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] hover:bg-foreground/5 ${
                                createSelectedVarietyId === v.id ? "bg-accent/10 font-medium text-accent" : "text-foreground/70"
                              }`}
                              onClick={() => {
                                setCreateSelectedVarietyId(v.id);
                                setCreateSelectedVarietyName(v.name);
                              }}
                            >
                              <span className="text-sm leading-none">🏷️</span>
                              <span className="truncate">{v.name}</span>
                              {v.taste ? <span className="text-[9px] text-foreground/40 ml-auto mr-1">{v.taste}</span> : null}
                              {createSelectedVarietyId === v.id ? <span className="text-[9px]">✓</span> : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })() : (
                <div className="space-y-2">
                  {/* Plant category filter pills with counts */}
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                        createPlantCategoryFilter === "all"
                          ? "bg-accent text-white shadow-sm"
                          : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"
                      }`}
                      onClick={() => setCreatePlantCategoryFilter("all")}
                    >
                      Alle ({plantCountByCategory["all"] ?? 0})
                    </button>
                    {(Object.keys(PLANT_CATEGORY_LABELS) as PlantCategory[]).map((cat) => {
                      const count = plantCountByCategory[cat] ?? 0;
                      if (count === 0) return null;
                      return (
                        <button
                          key={cat}
                          type="button"
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                            createPlantCategoryFilter === cat
                              ? "bg-accent text-white shadow-sm"
                              : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"
                          }`}
                          onClick={() => setCreatePlantCategoryFilter(cat)}
                        >
                          {PLANT_CATEGORY_LABELS[cat]} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Search */}
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    placeholder="Søg plante…"
                    value={createPlantSearch}
                    onChange={(e) => setCreatePlantSearch(e.target.value)}
                  />

                  {/* Plant results */}
                  <div className="max-h-48 space-y-0.5 overflow-y-auto">
                    {createPlantResults.map((plant) => (
                      <button
                        key={plant.id}
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded border border-transparent px-2 py-1.5 text-left text-xs hover:border-foreground/15 hover:bg-foreground/5"
                        onClick={() => {
                          setCreateSelectedSpeciesId(plant.id);
                          setCreateSelectedVarietyId(null);
                          setCreateSelectedVarietyName(null);
                          setCreatePlantSearch("");
                        }}
                      >
                        <span className="text-sm leading-none">{plant.icon ?? "🌱"}</span>
                        <span className="truncate font-medium">{plant.name}</span>
                        <span className="ml-auto flex items-center gap-1 text-[10px] text-foreground/40">
                          {plant.latinName ? <span className="italic truncate max-w-[80px]">{plant.latinName}</span> : null}
                          {plant.varieties?.length ? <span className="whitespace-nowrap">{plant.varieties.length} sorter</span> : null}
                        </span>
                      </button>
                    ))}
                    {createPlantResults.length === 0 ? (
                      <p className="px-2 py-2 text-xs text-foreground/50 italic text-center">Ingen planter fundet.</p>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── El / Vand / Lampe mode: element type picker ── */
            <div className="col-span-2 space-y-2">
              {createSelectedElementId ? (() => {
                const pickedEl = getInfraElementById(createSelectedElementId);
                if (!pickedEl) return null;
                return (
                  <div className="flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent-light/30 px-2.5 py-2">
                    <span className="text-lg leading-none">{pickedEl.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{pickedEl.name}</p>
                      <p className="text-[10px] text-foreground/50">{pickedEl.description}</p>
                      <p className="text-[10px] text-foreground/40">
                        {pickedEl.geometry === "polyline" ? "✎ Tegnes som streg" : "📍 Placeres som markør"}
                      </p>
                      {pickedEl.tips ? <p className="text-[10px] text-foreground/40 italic">{pickedEl.tips}</p> : null}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs text-foreground/40 hover:bg-red-50 hover:text-red-500"
                      onClick={() => setCreateSelectedElementId(null)}
                      title="Vælg en anden"
                    >
                      ✕
                    </button>
                  </div>
                );
              })() : (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-foreground/50">
                    {ELEMENT_MODE_ICONS[elementMode as ElementModeKey]} Vælg {ELEMENT_MODE_LABELS[elementMode as ElementModeKey]}:
                  </p>
                  <div className="max-h-52 space-y-0.5 overflow-y-auto">
                    {getInfraElementsForMode(elementMode as ElementModeKey).map((el) => (
                      <button
                        key={el.id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded border border-transparent px-2 py-1.5 text-left text-xs hover:border-foreground/15 hover:bg-foreground/5 transition-colors"
                        onClick={() => {
                          setCreateSelectedElementId(el.id);
                          const k = el.featureKind;
                          setCreateKind(k);
                          createKindRef.current = k;
                        }}
                      >
                        <span className="text-base leading-none">{el.icon}</span>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block truncate">{el.name}</span>
                          <span className="text-[10px] text-foreground/40 block truncate">{el.description}</span>
                        </div>
                        <span className="shrink-0 text-[9px] text-foreground/30 rounded bg-foreground/5 px-1 py-0.5">
                          {el.geometry === "polyline" ? "✎ streg" : "📍 punkt"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* ══════════════════════════════════════════════════════════════════
           NON-ELEMENT categories: type picker
           ══════════════════════════════════════════════════════════════════ */
        <>
          <div className="col-span-2 space-y-2">
            <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Type</label>

            {/* SubGroup tab buttons — only when 2+ SubGroups */}
            {createKindSubGroups.length > 1 ? (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${createKindSubGroups.length}, 1fr)` }}>
                {createKindSubGroups.map((sg) => {
                  const active = (createSubGroupFilter ?? createKindSubGroups[0]) === sg;
                  const count = createKindOptions.filter((o) => o.subGroup === sg).length;
                  return (
                    <button
                      key={sg}
                      type="button"
                      className={`rounded-lg border px-2 py-2 text-[11px] text-center leading-tight transition-all ${
                        active
                          ? "border-accent/40 bg-accent-light text-accent-dark font-semibold shadow-sm"
                          : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
                      }`}
                      onClick={() => {
                        setCreateSubGroupFilter(sg);
                        const first = createKindOptions.find((o) => o.subGroup === sg);
                        if (first) {
                          setCreateKind(first.value);
                          createKindRef.current = first.value;
                        }
                      }}
                    >
                      <span className="block">{SUB_GROUP_LABELS[sg] ?? sg}</span>
                      <span className="block text-[9px] font-normal opacity-60 mt-0.5">{count} typer</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Scrollable type list */}
            {(() => {
              const activeSg = createKindSubGroups.length > 1
                ? (createSubGroupFilter ?? createKindSubGroups[0])
                : createKindSubGroups[0];
              const items = activeSg
                ? createKindOptions.filter((o) => o.subGroup === activeSg)
                : createKindOptions;
              return items.length > 0 ? (
                <div className="max-h-52 space-y-0.5 overflow-y-auto">
                  {items.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-all ${
                        createKind === opt.value
                          ? "border-accent/30 bg-accent-light/50 text-accent-dark font-semibold"
                          : "border-transparent hover:border-foreground/15 hover:bg-foreground/5 text-foreground/70"
                      }`}
                      onClick={() => {
                        setCreateKind(opt.value);
                        createKindRef.current = opt.value;
                        setNewKindError(null);
                      }}
                    >
                      <span className="flex-1 truncate">{opt.label}</span>
                      {createKind === opt.value ? <span className="text-accent text-[10px]">✓</span> : null}
                      {canRemoveKind(createPalette) && createKind === opt.value ? (
                        <span
                          role="button"
                          tabIndex={0}
                          className="shrink-0 rounded px-1 text-foreground/30 hover:text-red-500 hover:bg-red-50"
                          onClick={(e) => { e.stopPropagation(); handleRemoveKind(opt.value); }}
                          title="Fjern denne type"
                        >
                          ✕
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}

            {hiddenInCategory(createPalette).length > 0 ? (
              <button
                type="button"
                className="text-[10px] text-foreground/40 hover:text-foreground/70 hover:underline"
                onClick={() => onRestoreHiddenKinds(createPalette)}
              >
                Gendan {hiddenInCategory(createPalette).length} skjulte standardtype{hiddenInCategory(createPalette).length > 1 ? "r" : ""}
              </button>
            ) : null}

            {/* Ny type */}
            <div>
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Ny type</label>
              <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                  value={newKindText}
                  onChange={(e) => setNewKindText(e.target.value)}
                  placeholder={
                    createPalette === "area" ? "Fx Orangeri, Hegn"
                    : createPalette === "condition" ? "Fx Læside, Muldrig jord"
                    : createPalette === "container" ? "Fx Pottebænk"
                    : createPalette === "row" ? "Fx Dobbeltrække"
                    : "Fx Spirebakke"
                  }
                />
                <button
                  type="button"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 transition-colors shadow-sm"
                  onClick={handleAddCustomKind}
                >
                  Tilføj
                </button>
              </div>
              {newKindError ? <p className="mt-1 text-xs text-foreground/70">{newKindError}</p> : null}
            </div>
          </div>
        </>
      )}

      <button
        type="button"
        className="col-span-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-dark transition-colors"
        onClick={beginDrawSelectedType}
        data-tour="create-draw-btn"
      >
        {createPalette === "element"
          ? elementMode === "planter"
            ? createSelectedSpeciesId
              ? `✚ Placér ${getPlantById(createSelectedSpeciesId)?.icon ?? "🌱"} ${getPlantById(createSelectedSpeciesId)?.name ?? ""}`
              : "✚ Placér plante"
            : (() => {
                const selEl = createSelectedElementId ? getInfraElementById(createSelectedElementId) : null;
                if (selEl) {
                  return selEl.geometry === "polyline"
                    ? `✎ Tegn ${selEl.icon} ${selEl.name}`
                    : `✚ Placér ${selEl.icon} ${selEl.name}`;
                }
                return elementMode === "el" ? "⚡ Vælg el-type først"
                  : elementMode === "vand" ? "💧 Vælg vandtype først"
                  : "💡 Vælg lampetype først";
              })()
          : "✎ Tegn område"}
      </button>
      <button
        type="button"
        className="col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground/60 hover:bg-foreground/5 transition-colors disabled:opacity-40"
        onClick={enterSelectMode}
        disabled={drawMode === "select"}
        title="Tryk også Esc"
      >
        ◎ Markér/pege
      </button>
    </div>
  );
});

export default CreateTab;
