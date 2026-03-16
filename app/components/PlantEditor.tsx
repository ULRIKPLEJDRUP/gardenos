"use client";

import { useCallback, useMemo, useState } from "react";
import {
  addOrUpdateCustomPlant,
  deleteCustomPlant,
  getAllPlants,
  getPlantById,
} from "../lib/plantStore";
import type {
  PlantSpecies,
  PlantVariety,
  PlantCategory,
  VegetableSubCategory,
  PlantFamily,
  Lifecycle,
  LightNeed,
  WaterNeed,
  SoilType,
  Difficulty,
  PlacementType,
} from "../lib/plantTypes";
import {
  PLANT_CATEGORY_LABELS,
  LIGHT_LABELS,
  WATER_LABELS,
  SOIL_LABELS,
  LIFECYCLE_LABELS,
  PLANT_FAMILY_LABELS,
  DIFFICULTY_LABELS,
  VEGETABLE_SUB_LABELS,
  PLACEMENT_LABELS,
  PLACEMENT_ICONS,
  getDefaultPlacements,
} from "../lib/plantTypes";

// ---------------------------------------------------------------------------
// PlantEditor – Full modal for creating/editing plant species
// ---------------------------------------------------------------------------

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** If set, edit existing species. Otherwise create new. */
  editSpeciesId?: string | null;
  /** Called whenever data changes so parent can refresh */
  onDataChanged?: () => void;
};

type EditorTab = "basic" | "growing" | "companions" | "varieties" | "placement";

const TABS: { key: EditorTab; label: string; icon: string }[] = [
  { key: "basic", label: "Grunddata", icon: "📋" },
  { key: "growing", label: "Dyrkning", icon: "🌤️" },
  { key: "placement", label: "Placering", icon: "📍" },
  { key: "companions", label: "Samdyrkning", icon: "🤝" },
  { key: "varieties", label: "Sorter", icon: "🏷️" },
];

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const EMPTY_SPECIES: Partial<PlantSpecies> = {
  name: "",
  latinName: "",
  category: "vegetable",
  subCategory: "other",
  family: "other",
  lifecycle: "annual",
  icon: "🌱",
  light: "full-sun",
  water: "medium",
  difficulty: "easy",
  varieties: [],
  source: "manual",
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Maj", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
];

export default function PlantEditor({ isOpen, onClose, editSpeciesId, onDataChanged }: Props) {
  // ── State ──
  const [tab, setTab] = useState<EditorTab>("basic");
  const [form, setForm] = useState<Partial<PlantSpecies>>({ ...EMPTY_SPECIES });
  const [initialized, setInitialized] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [companionSearch, setCompanionSearch] = useState("");

  // Variety editing
  const [editingVarietyIdx, setEditingVarietyIdx] = useState<number | null>(null);
  const [varForm, setVarForm] = useState<Partial<PlantVariety>>({});

  const isEditing = !!editSpeciesId;

  // Initialize from existing species
  if (isOpen && !initialized) {
    if (editSpeciesId) {
      const existing = getPlantById(editSpeciesId);
      if (existing) {
        setForm({ ...existing });
      }
    } else {
      setForm({ ...EMPTY_SPECIES });
    }
    setTab("basic");
    setEditingVarietyIdx(null);
    setConfirmDelete(false);
    setCompanionSearch("");
    setInitialized(true);
  }
  if (!isOpen && initialized) {
    setInitialized(false);
  }

  // All plants for companion picker
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allPlants = useMemo(() => getAllPlants(), [initialized]);

  // Smart placements preview
  const effectivePlacements = useMemo(() => {
    if (form.allowedPlacements && form.allowedPlacements.length > 0) {
      return form.allowedPlacements;
    }
    return getDefaultPlacements(form as PlantSpecies);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.category, form.subCategory, form.lifecycle, form.allowedPlacements]);

  // Companion search results
  const companionResults = useMemo(() => {
    if (!companionSearch.trim()) return allPlants.slice(0, 15);
    const q = companionSearch.trim().toLowerCase();
    return allPlants.filter(
      (p) =>
        p.id !== (editSpeciesId ?? slugify(form.name ?? "")) &&
        (p.name.toLowerCase().includes(q) || p.id.includes(q)),
    );
  }, [companionSearch, allPlants, form.name, editSpeciesId]);

  const updateField = useCallback(<K extends keyof PlantSpecies>(key: K, value: PlantSpecies[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    if (!form.name?.trim()) return;

    const id = editSpeciesId ?? slugify(form.name);
    const species: PlantSpecies = {
      ...(EMPTY_SPECIES as PlantSpecies),
      ...form,
      id,
      updatedAt: new Date().toISOString(),
    };

    addOrUpdateCustomPlant(species);
    onDataChanged?.();
    onClose();
  }, [form, editSpeciesId, onClose, onDataChanged]);

  const handleDelete = useCallback(() => {
    if (!editSpeciesId) return;
    deleteCustomPlant(editSpeciesId);
    onDataChanged?.();
    onClose();
  }, [editSpeciesId, onClose, onDataChanged]);

  // Variety helpers
  const addVariety = useCallback(() => {
    setEditingVarietyIdx(-1); // -1 = new
    setVarForm({ name: "", description: "" });
  }, []);

  const saveVariety = useCallback(() => {
    if (!varForm.name?.trim()) return;
    const varieties = [...(form.varieties ?? [])];
    if (editingVarietyIdx === -1) {
      // New
      varieties.push({
        id: slugify(varForm.name ?? ""),
        name: varForm.name ?? "",
        description: varForm.description,
        daysToHarvest: varForm.daysToHarvest,
        spacingCm: varForm.spacingCm,
        taste: varForm.taste,
        color: varForm.color,
        storageQuality: varForm.storageQuality,
        seedSource: varForm.seedSource,
        notes: varForm.notes,
        addedVia: "manual",
      });
    } else if (editingVarietyIdx !== null && editingVarietyIdx >= 0) {
      varieties[editingVarietyIdx] = {
        ...varieties[editingVarietyIdx],
        ...varForm,
      };
    }
    setForm((prev) => ({ ...prev, varieties }));
    setEditingVarietyIdx(null);
    setVarForm({});
  }, [varForm, editingVarietyIdx, form.varieties]);

  const removeVariety = useCallback((idx: number) => {
    const varieties = [...(form.varieties ?? [])];
    varieties.splice(idx, 1);
    setForm((prev) => ({ ...prev, varieties }));
  }, [form.varieties]);

  if (!isOpen) return null;

  return (
    <div className="vm-overlay" onClick={onClose}>
      <div
        className="vm-modal"
        style={{ maxWidth: 700 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="vm-header">
          <div className="flex items-center gap-2">
            <span className="text-xl">{form.icon || "🌱"}</span>
            <div>
              <h2 className="text-base font-bold">
                {isEditing ? `Redigér: ${form.name}` : "Tilføj ny plante"}
              </h2>
              <p className="text-[10px] text-foreground/50">
                {isEditing ? `ID: ${editSpeciesId}` : "Udfyld detaljer om den nye planteart"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-foreground/50 hover:bg-foreground/10"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-2 border-b border-border-light overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-all whitespace-nowrap ${
                tab === t.key
                  ? "bg-accent-light text-accent-dark border-b-2 border-accent"
                  : "text-foreground/50 hover:text-foreground/80 hover:bg-foreground/5"
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="vm-content" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {/* ═══════════ BASIC TAB ═══════════ */}
          {tab === "basic" ? (
            <div className="space-y-3">
              {/* Name + Icon */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="vm-label">Plantenavn (dansk) *</label>
                  <input
                    className="vm-input"
                    placeholder="f.eks. Gulerod"
                    value={form.name ?? ""}
                    onChange={(e) => updateField("name", e.target.value)}
                    autoFocus
                  />
                </div>
                <div style={{ width: 70 }}>
                  <label className="vm-label">Ikon</label>
                  <input
                    className="vm-input text-center text-lg"
                    value={form.icon ?? ""}
                    onChange={(e) => updateField("icon", e.target.value)}
                  />
                </div>
              </div>

              {/* Latin name */}
              <div>
                <label className="vm-label">Latinsk navn</label>
                <input
                  className="vm-input"
                  placeholder="f.eks. Daucus carota"
                  value={form.latinName ?? ""}
                  onChange={(e) => updateField("latinName", e.target.value)}
                />
              </div>

              {/* Category + SubCategory */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="vm-label">Kategori *</label>
                  <select
                    className="vm-input"
                    value={form.category ?? "vegetable"}
                    onChange={(e) => updateField("category", e.target.value as PlantCategory)}
                  >
                    {(Object.entries(PLANT_CATEGORY_LABELS) as [PlantCategory, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                {form.category === "vegetable" ? (
                  <div>
                    <label className="vm-label">Under-kategori</label>
                    <select
                      className="vm-input"
                      value={form.subCategory ?? "other"}
                      onChange={(e) => updateField("subCategory", e.target.value as VegetableSubCategory)}
                    >
                      {(Object.entries(VEGETABLE_SUB_LABELS) as [VegetableSubCategory, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              {/* Family + Lifecycle + Difficulty */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="vm-label">Familie</label>
                  <select
                    className="vm-input"
                    value={form.family ?? "other"}
                    onChange={(e) => updateField("family", e.target.value as PlantFamily)}
                  >
                    {(Object.entries(PLANT_FAMILY_LABELS) as [PlantFamily, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="vm-label">Livscyklus</label>
                  <select
                    className="vm-input"
                    value={form.lifecycle ?? "annual"}
                    onChange={(e) => updateField("lifecycle", e.target.value as Lifecycle)}
                  >
                    {(Object.entries(LIFECYCLE_LABELS) as [Lifecycle, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="vm-label">Sværhed</label>
                  <select
                    className="vm-input"
                    value={form.difficulty ?? "easy"}
                    onChange={(e) => updateField("difficulty", e.target.value as Difficulty)}
                  >
                    {(Object.entries(DIFFICULTY_LABELS) as [Difficulty, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="vm-label">Beskrivelse</label>
                <textarea
                  className="vm-input"
                  rows={3}
                  placeholder="Korte dyrknings-tips, beskrivelse…"
                  value={form.description ?? ""}
                  onChange={(e) => updateField("description", e.target.value)}
                />
              </div>

              {/* Taste + Culinary */}
              <div>
                <label className="vm-label">Smag</label>
                <input
                  className="vm-input"
                  placeholder="f.eks. Sød og sprød"
                  value={form.taste ?? ""}
                  onChange={(e) => updateField("taste", e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {/* ═══════════ GROWING TAB ═══════════ */}
          {tab === "growing" ? (
            <div className="space-y-3">
              {/* Light + Water */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="vm-label">Lysbehov</label>
                  <select
                    className="vm-input"
                    value={form.light ?? ""}
                    onChange={(e) => updateField("light", (e.target.value || undefined) as LightNeed | undefined)}
                  >
                    <option value="">Ikke angivet</option>
                    {(Object.entries(LIGHT_LABELS) as [LightNeed, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="vm-label">Vandbehov</label>
                  <select
                    className="vm-input"
                    value={form.water ?? ""}
                    onChange={(e) => updateField("water", (e.target.value || undefined) as WaterNeed | undefined)}
                  >
                    <option value="">Ikke angivet</option>
                    {(Object.entries(WATER_LABELS) as [WaterNeed, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Soil */}
              <div>
                <label className="vm-label">Jordtyper</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(Object.entries(SOIL_LABELS) as [SoilType, string][]).map(([k, v]) => {
                    const selected = form.soil?.includes(k) ?? false;
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                          selected
                            ? "border-accent/40 bg-accent-light text-accent-dark"
                            : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
                        }`}
                        onClick={() => {
                          const current = form.soil ?? [];
                          updateField(
                            "soil",
                            selected ? current.filter((s) => s !== k) : [...current, k],
                          );
                        }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Spacing */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="vm-label">Planteafstand (cm)</label>
                  <input
                    type="number"
                    className="vm-input"
                    placeholder="f.eks. 5"
                    value={form.spacingCm ?? ""}
                    onChange={(e) => updateField("spacingCm", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
                <div>
                  <label className="vm-label">Rækkeafstand (cm)</label>
                  <input
                    type="number"
                    className="vm-input"
                    placeholder="f.eks. 25"
                    value={form.rowSpacingCm ?? ""}
                    onChange={(e) => updateField("rowSpacingCm", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
                <div>
                  <label className="vm-label">Roddybde (cm)</label>
                  <input
                    type="number"
                    className="vm-input"
                    placeholder="f.eks. 30"
                    value={form.rootDepthCm ?? ""}
                    onChange={(e) => updateField("rootDepthCm", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
              </div>

              {/* Sow/Harvest windows */}
              <fieldset className="vm-fieldset">
                <legend className="vm-legend">Sæsonkalender</legend>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["sowIndoor", "Så indendørs"],
                    ["sowOutdoor", "Så udendørs"],
                    ["plantOut", "Udplantning"],
                    ["harvest", "Høst"],
                  ] as const).map(([field, label]) => (
                    <div key={field}>
                      <label className="vm-label">{label}</label>
                      <div className="flex gap-1">
                        <select
                          className="vm-input flex-1"
                          value={(form[field] as { from: number; to: number } | undefined)?.from ?? ""}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const current = form[field] as { from: number; to: number } | undefined;
                            if (!val) {
                              updateField(field, undefined);
                            } else {
                              updateField(field, { from: val, to: current?.to ?? val });
                            }
                          }}
                        >
                          <option value="">Fra</option>
                          {MONTH_NAMES.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                          ))}
                        </select>
                        <select
                          className="vm-input flex-1"
                          value={(form[field] as { from: number; to: number } | undefined)?.to ?? ""}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const current = form[field] as { from: number; to: number } | undefined;
                            if (!val) return;
                            updateField(field, { from: current?.from ?? val, to: val });
                          }}
                        >
                          <option value="">Til</option>
                          {MONTH_NAMES.map((m, i) => (
                            <option key={i} value={i + 1}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              {/* Rotation, Temperature, Frost */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="vm-label">Sædskifte (år)</label>
                  <input
                    type="number"
                    className="vm-input"
                    placeholder="f.eks. 3"
                    value={form.rotationYears ?? ""}
                    onChange={(e) => updateField("rotationYears", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
                <div>
                  <label className="vm-label">Min. temp (°C)</label>
                  <input
                    type="number"
                    className="vm-input"
                    placeholder="f.eks. 5"
                    value={form.minTempC ?? ""}
                    onChange={(e) => updateField("minTempC", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
                <div>
                  <label className="vm-label">Frostfast?</label>
                  <select
                    className="vm-input"
                    value={form.frostHardy == null ? "" : form.frostHardy ? "yes" : "no"}
                    onChange={(e) => updateField("frostHardy", e.target.value === "yes" ? true : e.target.value === "no" ? false : undefined)}
                  >
                    <option value="">Ukendt</option>
                    <option value="yes">Ja</option>
                    <option value="no">Nej</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {/* ═══════════ PLACEMENT TAB ═══════════ */}
          {tab === "placement" ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-foreground/70 mb-2">
                  Baseret på plantens kategori ({PLANT_CATEGORY_LABELS[form.category ?? "vegetable"]}
                  {form.subCategory ? ` / ${VEGETABLE_SUB_LABELS[form.subCategory]}` : ""}
                  {form.lifecycle ? `, ${LIFECYCLE_LABELS[form.lifecycle]}` : ""})
                  foreslår systemet følgende placeringer:
                </p>

                <div className="space-y-1.5">
                  {(["element", "row", "seedbed", "container"] as PlacementType[]).map((pt) => {
                    const isDefault = effectivePlacements.includes(pt);
                    const hasOverride = form.allowedPlacements && form.allowedPlacements.length > 0;
                    const isActive = hasOverride
                      ? form.allowedPlacements!.includes(pt)
                      : isDefault;

                    return (
                      <button
                        key={pt}
                        type="button"
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                          isActive
                            ? "border-accent/40 bg-accent-light/50 shadow-sm"
                            : "border-border bg-background hover:bg-foreground/5 opacity-60"
                        }`}
                        onClick={() => {
                          // Toggle override mode
                          let current = form.allowedPlacements && form.allowedPlacements.length > 0
                            ? [...form.allowedPlacements]
                            : [...effectivePlacements];
                          if (current.includes(pt)) {
                            current = current.filter((p) => p !== pt);
                          } else {
                            current.push(pt);
                          }
                          // If matches default, clear overrides
                          const defaultP = getDefaultPlacements(form as PlantSpecies);
                          const sameAsDefault =
                            current.length === defaultP.length &&
                            defaultP.every((p) => current.includes(p));
                          updateField("allowedPlacements", sameAsDefault ? undefined : current);
                        }}
                      >
                        <span className="text-xl">{PLACEMENT_ICONS[pt]}</span>
                        <div className="flex-1">
                          <p className="text-xs font-medium">{PLACEMENT_LABELS[pt]}</p>
                          <p className="text-[10px] text-foreground/50">
                            {pt === "element" && "Enkelt plante som punkt på kortet. Træer, buske, store planter."}
                            {pt === "row" && "Rækker med fast planteafstand. Gulerødder, løg, bønner."}
                            {pt === "seedbed" && "Bredsåede bede. Radiser, salat, urter."}
                            {pt === "container" && "Krukker, højbede, balkon. Tomater, urter, salat."}
                          </p>
                        </div>
                        <span className={`text-xs font-medium ${isActive ? "text-accent" : "text-foreground/30"}`}>
                          {isActive ? "✓" : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {form.allowedPlacements && form.allowedPlacements.length > 0 ? (
                  <button
                    type="button"
                    className="mt-2 text-[10px] text-foreground/40 hover:text-foreground/60 underline"
                    onClick={() => updateField("allowedPlacements", undefined)}
                  >
                    Nulstil til automatiske standardindstillinger
                  </button>
                ) : (
                  <p className="mt-2 text-[10px] text-foreground/40 italic">
                    Automatisk beregnet fra kategori og livscyklus. Klik for at tilpasse.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {/* ═══════════ COMPANIONS TAB ═══════════ */}
          {tab === "companions" ? (
            <div className="space-y-4">
              {/* Good companions */}
              <fieldset className="vm-fieldset">
                <legend className="vm-legend">✓ Gode naboer</legend>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(form.goodCompanions ?? []).map((cid) => {
                    const cp = allPlants.find((p) => p.id === cid);
                    return (
                      <span
                        key={cid}
                        className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] text-green-800 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300"
                      >
                        {cp?.icon ?? "🌱"} {cp?.name ?? cid}
                        <button
                          type="button"
                          className="ml-0.5 text-green-600 hover:text-red-500"
                          onClick={() => updateField("goodCompanions", (form.goodCompanions ?? []).filter((id) => id !== cid))}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                  {(form.goodCompanions ?? []).length === 0 ? (
                    <span className="text-[10px] text-foreground/40 italic">Ingen gode naboer tilføjet</span>
                  ) : null}
                </div>
              </fieldset>

              {/* Bad companions */}
              <fieldset className="vm-fieldset">
                <legend className="vm-legend">⚠ Dårlige naboer</legend>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(form.badCompanions ?? []).map((cid) => {
                    const cp = allPlants.find((p) => p.id === cid);
                    return (
                      <span
                        key={cid}
                        className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300"
                      >
                        {cp?.icon ?? "🌱"} {cp?.name ?? cid}
                        <button
                          type="button"
                          className="ml-0.5 text-red-600 hover:text-red-800"
                          onClick={() => updateField("badCompanions", (form.badCompanions ?? []).filter((id) => id !== cid))}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                  {(form.badCompanions ?? []).length === 0 ? (
                    <span className="text-[10px] text-foreground/40 italic">Ingen dårlige naboer tilføjet</span>
                  ) : null}
                </div>
              </fieldset>

              {/* Search + Add */}
              <div>
                <label className="vm-label">Tilføj samplantning</label>
                <input
                  className="vm-input"
                  placeholder="Søg plante…"
                  value={companionSearch}
                  onChange={(e) => setCompanionSearch(e.target.value)}
                />
                <div className="max-h-32 mt-1 space-y-0.5 overflow-y-auto">
                  {companionResults.slice(0, 10).map((p) => {
                    const isGood = form.goodCompanions?.includes(p.id);
                    const isBad = form.badCompanions?.includes(p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-1.5 px-1.5 py-1 text-xs">
                        <span className="text-sm">{p.icon ?? "🌱"}</span>
                        <span className="flex-1 truncate">{p.name}</span>
                        <button
                          type="button"
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            isGood
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                              : "hover:bg-green-50 text-foreground/40"
                          }`}
                          onClick={() => {
                            if (isGood) {
                              updateField("goodCompanions", (form.goodCompanions ?? []).filter((id) => id !== p.id));
                            } else {
                              // Remove from bad if present
                              if (isBad) updateField("badCompanions", (form.badCompanions ?? []).filter((id) => id !== p.id));
                              updateField("goodCompanions", [...(form.goodCompanions ?? []), p.id]);
                            }
                          }}
                        >
                          ✓ God
                        </button>
                        <button
                          type="button"
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            isBad
                              ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                              : "hover:bg-red-50 text-foreground/40"
                          }`}
                          onClick={() => {
                            if (isBad) {
                              updateField("badCompanions", (form.badCompanions ?? []).filter((id) => id !== p.id));
                            } else {
                              // Remove from good if present
                              if (isGood) updateField("goodCompanions", (form.goodCompanions ?? []).filter((id) => id !== p.id));
                              updateField("badCompanions", [...(form.badCompanions ?? []), p.id]);
                            }
                          }}
                        >
                          ⚠ Dårlig
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* ═══════════ VARIETIES TAB ═══════════ */}
          {tab === "varieties" ? (
            <div className="space-y-3">
              <p className="text-[10px] text-foreground/50">
                Tilføj sorter/varianter af denne plante. Sorter kan vælges når planten placeres på kortet.
              </p>

              {/* Variety list */}
              {(form.varieties ?? []).length > 0 ? (
                <div className="space-y-1.5">
                  {(form.varieties ?? []).map((v, idx) => (
                    <div
                      key={v.id || idx}
                      className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2"
                    >
                      <span className="text-sm">🏷️</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{v.name}</p>
                        {v.description ? <p className="text-[10px] text-foreground/50 truncate">{v.description}</p> : null}
                      </div>
                      {v.daysToHarvest ? <span className="text-[10px] text-foreground/40">⏱️ {v.daysToHarvest}d</span> : null}
                      <button
                        type="button"
                        className="text-[10px] text-accent hover:underline"
                        onClick={() => { setEditingVarietyIdx(idx); setVarForm({ ...v }); }}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="text-[10px] text-foreground/30 hover:text-red-500"
                        onClick={() => removeVariety(idx)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-foreground/50 italic">Ingen sorter tilføjet endnu.</p>
              )}

              {/* Variety form (inline) */}
              {editingVarietyIdx !== null ? (
                <div className="rounded-lg border border-accent/30 bg-accent-light/20 p-3 space-y-2">
                  <p className="text-xs font-medium text-accent-dark">
                    {editingVarietyIdx === -1 ? "Ny sort" : `Redigér: ${varForm.name}`}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="vm-label">Sortsnavn *</label>
                      <input
                        className="vm-input"
                        placeholder="f.eks. Nantes 2"
                        value={varForm.name ?? ""}
                        onChange={(e) => setVarForm((p) => ({ ...p, name: e.target.value }))}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="vm-label">Farve</label>
                      <input
                        className="vm-input"
                        placeholder="f.eks. orange"
                        value={varForm.color ?? ""}
                        onChange={(e) => setVarForm((p) => ({ ...p, color: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="vm-label">Beskrivelse</label>
                    <input
                      className="vm-input"
                      placeholder="Hvad gør denne sort speciel?"
                      value={varForm.description ?? ""}
                      onChange={(e) => setVarForm((p) => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="vm-label">Dage til høst</label>
                      <input
                        type="number"
                        className="vm-input"
                        value={varForm.daysToHarvest ?? ""}
                        onChange={(e) => setVarForm((p) => ({ ...p, daysToHarvest: e.target.value ? Number(e.target.value) : undefined }))}
                      />
                    </div>
                    <div>
                      <label className="vm-label">Afstand (cm)</label>
                      <input
                        type="number"
                        className="vm-input"
                        value={varForm.spacingCm ?? ""}
                        onChange={(e) => setVarForm((p) => ({ ...p, spacingCm: e.target.value ? Number(e.target.value) : undefined }))}
                      />
                    </div>
                    <div>
                      <label className="vm-label">Opbevaring</label>
                      <select
                        className="vm-input"
                        value={varForm.storageQuality ?? ""}
                        onChange={(e) => setVarForm((p) => ({ ...p, storageQuality: (e.target.value || undefined) as PlantVariety["storageQuality"] }))}
                      >
                        <option value="">—</option>
                        <option value="poor">Dårlig</option>
                        <option value="fair">OK</option>
                        <option value="good">God</option>
                        <option value="excellent">Fremragende</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="vm-label">Smag</label>
                    <input
                      className="vm-input"
                      placeholder="f.eks. Meget sød og saftig"
                      value={varForm.taste ?? ""}
                      onChange={(e) => setVarForm((p) => ({ ...p, taste: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="vm-label">Frøleverandør</label>
                    <input
                      className="vm-input"
                      placeholder="f.eks. Floradania, Impecta"
                      value={varForm.seedSource ?? ""}
                      onChange={(e) => setVarForm((p) => ({ ...p, seedSource: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      className="vm-btn vm-btn--primary flex-1"
                      onClick={saveVariety}
                      disabled={!varForm.name?.trim()}
                    >
                      {editingVarietyIdx === -1 ? "Tilføj sort" : "Gem ændringer"}
                    </button>
                    <button
                      type="button"
                      className="vm-btn vm-btn--secondary"
                      onClick={() => { setEditingVarietyIdx(null); setVarForm({}); }}
                    >
                      Annullér
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full rounded-lg border border-dashed border-foreground/20 px-3 py-2 text-xs text-foreground/60 hover:border-foreground/30 hover:bg-foreground/5"
                  onClick={addVariety}
                >
                  + Tilføj ny sort
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border-light">
          {isEditing ? (
            <div className="flex-1">
              {!confirmDelete ? (
                <button
                  type="button"
                  className="vm-btn vm-btn--danger text-[11px]"
                  onClick={() => setConfirmDelete(true)}
                >
                  🗑️ Slet plante
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-red-600">Er du sikker?</span>
                  <button type="button" className="vm-btn vm-btn--danger text-[10px]" onClick={handleDelete}>
                    Ja, slet
                  </button>
                  <button type="button" className="vm-btn vm-btn--secondary text-[10px]" onClick={() => setConfirmDelete(false)}>
                    Nej
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <button type="button" className="vm-btn vm-btn--secondary" onClick={onClose}>
            Annullér
          </button>
          <button
            type="button"
            className="vm-btn vm-btn--primary"
            onClick={handleSave}
            disabled={!form.name?.trim()}
          >
            {isEditing ? "Gem ændringer" : "Opret plante"}
          </button>
        </div>
      </div>
    </div>
  );
}
