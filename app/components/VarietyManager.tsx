// ---------------------------------------------------------------------------
// GardenOS – Variety Manager Component
// ---------------------------------------------------------------------------
// Full-screen modal for browsing, adding, editing, and deleting plant
// varieties (sorter). Supports 4 add methods:
//   1. Manual input
//   2. Web scraping
//   3. Seed packet / label image analysis
//   4. Plant photo analysis
// ---------------------------------------------------------------------------
"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import type { PlantSpecies, PlantVariety, PlantCategory } from "../lib/plantTypes";
import { PLANT_CATEGORY_LABELS } from "../lib/plantTypes";
import {
  getAllPlants,
  getPlantById,
  getVarietiesForSpecies,
  addVarietyToSpecies,
  updateVarietyInSpecies,
  deleteVarietyFromSpecies,
} from "../lib/plantStore";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialSpeciesId?: string | null;
  onDataChanged?: () => void;
};

type Mode = "browse" | "species" | "edit" | "add";
type AddMethod = "manual" | "scrape" | "seed-packet" | "plant-photo";

const ADD_METHODS: { key: AddMethod; label: string; icon: string; desc: string }[] = [
  { key: "manual", label: "Manuel", icon: "✍️", desc: "Indtast info manuelt" },
  { key: "scrape", label: "Fra web", icon: "🌐", desc: "Hent fra en webside" },
  { key: "seed-packet", label: "Frøpose", icon: "🏷️", desc: "Billede af frøpose/label" },
  { key: "plant-photo", label: "Plante", icon: "📸", desc: "Billede af en plante" },
];

const MONTH_NAMES = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

const STORAGE_Q_LABELS: Record<string, string> = {
  poor: "Kort holdbarhed",
  fair: "OK",
  good: "God",
  excellent: "Fremragende",
};

function newVarId(): string {
  return `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyForm(): Partial<PlantVariety> {
  return {
    id: newVarId(),
    name: "",
    description: "",
    taste: "",
    color: "",
    seedSource: "",
    imageUrl: "",
    sourceUrl: "",
    notes: "",
    yieldInfo: "",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VarietyManager({
  isOpen,
  onClose,
  initialSpeciesId,
  onDataChanged,
}: Props) {
  // ── Navigation ──
  const [mode, setMode] = useState<Mode>(initialSpeciesId ? "species" : "browse");
  const [speciesId, setSpeciesId] = useState<string | null>(initialSpeciesId ?? null);
  const [editVarId, setEditVarId] = useState<string | null>(null);
  const [addMethod, setAddMethod] = useState<AddMethod>("manual");

  // ── Browse ──
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<PlantCategory | "all">("all");

  // ── Form ──
  const [form, setForm] = useState<Partial<PlantVariety>>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Scrape ──
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeSuccess, setScrapeSuccess] = useState(false);

  // ── Image ──
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSuccess, setImageSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data ──
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onDataChanged?.();
  }, [onDataChanged]);

  // ── Derived data ──
  const allPlants = useMemo(() => {
    void refreshKey;
    return getAllPlants();
  }, [refreshKey]);

  const filteredPlants = useMemo(() => {
    let list = allPlants;
    if (catFilter !== "all") list = list.filter((p) => p.category === catFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.latinName?.toLowerCase().includes(q) ?? false) ||
          p.id.includes(q) ||
          (p.varieties ?? []).some((v) => v.name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [allPlants, catFilter, search]);

  const species = useMemo(() => {
    void refreshKey;
    return speciesId ? getPlantById(speciesId) ?? null : null;
  }, [speciesId, refreshKey]);

  const varieties = useMemo(() => {
    void refreshKey;
    return speciesId ? getVarietiesForSpecies(speciesId) : [];
  }, [speciesId, refreshKey]);

  const totalVarCount = useMemo(
    () => allPlants.reduce((s, p) => s + (p.varieties?.length ?? 0), 0),
    [allPlants],
  );

  // ── Navigation callbacks ──
  const goToBrowse = useCallback(() => {
    setMode("browse");
    setSpeciesId(null);
    setEditVarId(null);
    setConfirmDelete(false);
    setFormError(null);
  }, []);

  const goToSpecies = useCallback((id: string) => {
    setMode("species");
    setSpeciesId(id);
    setEditVarId(null);
    setConfirmDelete(false);
    setFormError(null);
  }, []);

  const goToEdit = useCallback(
    (varId: string) => {
      const v = varieties.find((x) => x.id === varId);
      if (!v) return;
      setForm({ ...v });
      setEditVarId(varId);
      setMode("edit");
      setConfirmDelete(false);
      setFormError(null);
    },
    [varieties],
  );

  const goToAdd = useCallback(() => {
    setForm(emptyForm());
    setAddMethod("manual");
    setScrapeUrl("");
    setScrapeError(null);
    setScrapeSuccess(false);
    setImagePreview(null);
    setImageError(null);
    setImageSuccess(false);
    setMode("add");
    setConfirmDelete(false);
    setFormError(null);
  }, []);

  // ── Form helpers ──
  const upd = useCallback((patch: Partial<PlantVariety>) => {
    setForm((f) => ({ ...f, ...patch }));
    setFormError(null);
  }, []);

  // ── CRUD ──
  const handleSave = useCallback(() => {
    if (!speciesId) return;
    if (!form.name?.trim()) {
      setFormError("Navn er påkrævet");
      return;
    }

    const data: PlantVariety = {
      id: form.id || newVarId(),
      name: form.name.trim(),
      description: form.description?.trim() || undefined,
      daysToHarvest: form.daysToHarvest || undefined,
      spacingCm: form.spacingCm || undefined,
      taste: form.taste?.trim() || undefined,
      color: form.color?.trim() || undefined,
      resistances: form.resistances?.filter(Boolean).length ? form.resistances : undefined,
      storageQuality: form.storageQuality || undefined,
      seedSource: form.seedSource?.trim() || undefined,
      imageUrl: form.imageUrl?.trim() || undefined,
      sourceUrl: form.sourceUrl?.trim() || undefined,
      addedVia: form.addedVia || (mode === "add" ? addMethod : undefined),
      notes: form.notes?.trim() || undefined,
      sowStart: form.sowStart || undefined,
      sowEnd: form.sowEnd || undefined,
      harvestStart: form.harvestStart || undefined,
      harvestEnd: form.harvestEnd || undefined,
      heightCm: form.heightCm || undefined,
      yieldInfo: form.yieldInfo?.trim() || undefined,
    };

    if (mode === "edit" && editVarId) {
      updateVarietyInSpecies(speciesId, editVarId, data);
    } else {
      addVarietyToSpecies(speciesId, data);
    }

    refresh();
    setMode("species");
    setEditVarId(null);
    setFormError(null);
  }, [speciesId, form, mode, editVarId, addMethod, refresh]);

  const handleDelete = useCallback(() => {
    if (!speciesId || !editVarId) return;
    deleteVarietyFromSpecies(speciesId, editVarId);
    refresh();
    setMode("species");
    setEditVarId(null);
    setConfirmDelete(false);
  }, [speciesId, editVarId, refresh]);

  // ── Scraping ──
  const handleScrape = useCallback(async () => {
    if (!scrapeUrl.trim()) return;
    setScrapeLoading(true);
    setScrapeError(null);
    setScrapeSuccess(false);
    try {
      const res = await fetch("/api/scrape-variety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScrapeError(data.error || "Ukendt fejl");
        return;
      }
      setForm((f) => ({
        ...f,
        name: data.name || f.name,
        description: data.description || f.description,
        imageUrl: data.imageUrl || f.imageUrl,
        sourceUrl: data.sourceUrl || scrapeUrl.trim(),
        daysToHarvest: data.daysToHarvest ?? f.daysToHarvest,
        taste: data.taste || f.taste,
        color: data.color || f.color,
        seedSource: data.seedSource || f.seedSource,
        spacingCm: data.spacingCm ?? f.spacingCm,
        sowStart: data.sowStart ?? f.sowStart,
        sowEnd: data.sowEnd ?? f.sowEnd,
        harvestStart: data.harvestStart ?? f.harvestStart,
        harvestEnd: data.harvestEnd ?? f.harvestEnd,
        addedVia: "scrape",
      }));
      setScrapeSuccess(true);
    } catch {
      setScrapeError("Netværksfejl — tjek URL og prøv igen");
    } finally {
      setScrapeLoading(false);
    }
  }, [scrapeUrl]);

  // ── Image ──
  const handleImageFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    setImageSuccess(false);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!imagePreview) return;
    setImageLoading(true);
    setImageError(null);
    setImageSuccess(false);
    try {
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imagePreview, type: addMethod }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImageError(
          data.needsConfig
            ? "⚙️ Billedgenkendelse kræver en OpenAI API-nøgle.\nTilføj OPENAI_API_KEY i .env.local filen og genstart serveren."
            : data.error || "Ukendt fejl",
        );
        return;
      }
      setForm((f) => ({
        ...f,
        name: data.name || f.name,
        description: data.description || f.description,
        daysToHarvest: data.daysToHarvest ?? f.daysToHarvest,
        taste: data.taste || f.taste,
        color: data.color || f.color,
        seedSource: data.seedSource || f.seedSource,
        spacingCm: data.spacingCm ?? f.spacingCm,
        sowStart: data.sowStart ?? f.sowStart,
        sowEnd: data.sowEnd ?? f.sowEnd,
        harvestStart: data.harvestStart ?? f.harvestStart,
        harvestEnd: data.harvestEnd ?? f.harvestEnd,
        heightCm: data.heightCm ?? f.heightCm,
        notes: data.notes || f.notes,
        addedVia: addMethod as "seed-packet" | "plant-photo",
      }));
      setImageSuccess(true);
    } catch {
      setImageError("Netværksfejl");
    } finally {
      setImageLoading(false);
    }
  }, [imagePreview, addMethod]);

  // ── Early return ──
  if (!isOpen) return null;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Browse mode
  // ═══════════════════════════════════════════════════════════════════════════
  const renderBrowse = () => (
    <div className="space-y-3">
      {/* Search */}
      <input
        className="vm-input"
        placeholder="🔍 Søg plante eller sort…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={`vm-chip ${catFilter === "all" ? "vm-chip--active" : ""}`}
          onClick={() => setCatFilter("all")}
        >
          Alle ({allPlants.length})
        </button>
        {(Object.entries(PLANT_CATEGORY_LABELS) as [PlantCategory, string][]).map(([cat, label]) => {
          const count = allPlants.filter((p) => p.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              className={`vm-chip ${catFilter === cat ? "vm-chip--active" : ""}`}
              onClick={() => setCatFilter(catFilter === cat ? "all" : cat)}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <p className="text-[10px] text-foreground/50">
        {totalVarCount} sorter på tværs af {allPlants.filter((p) => (p.varieties?.length ?? 0) > 0).length} arter
      </p>

      {/* Plant list */}
      <div className="space-y-1.5 max-h-[55vh] overflow-y-auto sidebar-scroll">
        {filteredPlants.map((plant) => {
          const varCount = plant.varieties?.length ?? 0;
          return (
            <button
              key={plant.id}
              type="button"
              className="vm-card flex w-full items-center gap-2.5 text-left"
              onClick={() => goToSpecies(plant.id)}
            >
              <span className="text-xl leading-none">{plant.icon ?? "🌱"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground/90 truncate">{plant.name}</p>
                {plant.latinName ? (
                  <p className="text-[10px] italic text-foreground/50 truncate">{plant.latinName}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  varCount > 0
                    ? "bg-accent-light text-accent-dark"
                    : "bg-foreground/5 text-foreground/30"
                }`}>
                  {varCount} {varCount === 1 ? "sort" : "sorter"}
                </span>
                <p className="text-[10px] text-foreground/40 mt-0.5">
                  {PLANT_CATEGORY_LABELS[plant.category]}
                </p>
              </div>
              <span className="text-foreground/30 text-xs">›</span>
            </button>
          );
        })}
        {filteredPlants.length === 0 ? (
          <p className="text-center text-sm text-foreground/50 py-8">Ingen planter fundet.</p>
        ) : null}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Species detail (list varieties)
  // ═══════════════════════════════════════════════════════════════════════════
  const renderSpecies = () => {
    if (!species) return <p className="text-foreground/50">Art ikke fundet.</p>;

    return (
      <div className="space-y-3">
        {/* Species header */}
        <div className="flex items-center gap-3">
          <span className="text-3xl">{species.icon ?? "🌱"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-foreground truncate">{species.name}</p>
            {species.latinName ? (
              <p className="text-xs italic text-foreground/50">{species.latinName}</p>
            ) : null}
            <p className="text-[10px] text-foreground/40">{PLANT_CATEGORY_LABELS[species.category]}</p>
          </div>
        </div>

        {/* Actions */}
        <button
          type="button"
          className="w-full rounded-lg border-2 border-dashed border-accent/40 bg-accent-light/30 px-3 py-2.5 text-sm font-medium text-accent-dark hover:bg-accent-light hover:border-accent/60 transition-all"
          onClick={goToAdd}
        >
          ＋ Tilføj ny sort
        </button>

        {/* Variety list */}
        {varieties.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-2">🏷️</p>
            <p className="text-sm text-foreground/60">Ingen sorter registreret endnu.</p>
            <p className="text-[10px] text-foreground/40 mt-1">Klik &quot;Tilføj ny sort&quot; for at komme i gang.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto sidebar-scroll">
            {varieties.map((v) => (
              <button
                key={v.id}
                type="button"
                className="vm-card w-full text-left space-y-1"
                onClick={() => goToEdit(v.id)}
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground/90 flex-1 truncate">{v.name}</p>
                  {v.color ? <span className="text-[10px] text-foreground/40 shrink-0">({v.color})</span> : null}
                  {v.addedVia ? (
                    <span className="text-[10px] text-foreground/30 shrink-0">
                      {v.addedVia === "manual" ? "✍️" : v.addedVia === "scrape" ? "🌐" : v.addedVia === "seed-packet" ? "🏷️" : v.addedVia === "plant-photo" ? "📸" : "📦"}
                    </span>
                  ) : null}
                  <span className="text-foreground/30 text-xs shrink-0">✏️</span>
                </div>
                {v.description ? (
                  <p className="text-[10px] text-foreground/60 line-clamp-2">{v.description}</p>
                ) : null}
                <div className="flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-foreground/50">
                  {v.taste ? <span>🍽️ {v.taste}</span> : null}
                  {v.daysToHarvest ? <span>⏱️ {v.daysToHarvest} dage</span> : null}
                  {v.spacingCm ? <span>↔️ {v.spacingCm} cm</span> : null}
                  {v.storageQuality ? <span>📦 {STORAGE_Q_LABELS[v.storageQuality] ?? v.storageQuality}</span> : null}
                  {v.resistances?.length ? <span>🛡️ {v.resistances.join(", ")}</span> : null}
                  {v.seedSource ? <span>🏪 {v.seedSource}</span> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Add method-specific UI (shown above the form in add mode)
  // ═══════════════════════════════════════════════════════════════════════════
  const renderAddMethodUI = () => {
    if (mode !== "add") return null;

    return (
      <div className="space-y-3 border-b border-border pb-4 mb-4">
        {/* Method tabs */}
        <div className="grid grid-cols-4 gap-1">
          {ADD_METHODS.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`rounded-lg border px-2 py-2 text-center transition-all ${
                addMethod === m.key
                  ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                  : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
              }`}
              onClick={() => {
                setAddMethod(m.key);
                setScrapeError(null);
                setScrapeSuccess(false);
                setImageError(null);
                setImageSuccess(false);
              }}
            >
              <span className="text-lg block">{m.icon}</span>
              <span className="text-[10px] font-medium block mt-0.5">{m.label}</span>
            </button>
          ))}
        </div>

        {/* Method-specific content */}
        {addMethod === "manual" ? (
          <p className="text-xs text-foreground/50 italic">
            Udfyld felterne nedenfor manuelt.
          </p>
        ) : null}

        {addMethod === "scrape" ? (
          <div className="space-y-2">
            <p className="text-xs text-foreground/50">
              Indtast URL til en frøside (fx fra nkfroe.dk, floradania.dk, plantorama.dk):
            </p>
            <div className="flex gap-2">
              <input
                className="vm-input flex-1"
                placeholder="https://www.nkfroe.dk/produkt/..."
                value={scrapeUrl}
                onChange={(e) => { setScrapeUrl(e.target.value); setScrapeError(null); setScrapeSuccess(false); }}
              />
              <button
                type="button"
                className="vm-btn vm-btn--primary shrink-0"
                onClick={handleScrape}
                disabled={scrapeLoading || !scrapeUrl.trim()}
              >
                {scrapeLoading ? "Henter…" : "Hent"}
              </button>
            </div>
            {scrapeError ? <p className="text-xs text-red-600">{scrapeError}</p> : null}
            {scrapeSuccess ? (
              <p className="text-xs text-green-600">✓ Data hentet! Gennemse og ret felterne nedenfor, og tryk Gem.</p>
            ) : null}
          </div>
        ) : null}

        {addMethod === "seed-packet" || addMethod === "plant-photo" ? (
          <div className="space-y-2">
            <p className="text-xs text-foreground/50">
              {addMethod === "seed-packet"
                ? "Upload et billede af frøposen, etiketten eller emballagen:"
                : "Upload et billede af planten du vil identificere:"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageFile}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="vm-btn vm-btn--secondary flex-1"
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? "Skift billede" : addMethod === "seed-packet" ? "📷 Vælg billede af frøpose" : "📷 Vælg billede af plante"}
              </button>
              {imagePreview ? (
                <button
                  type="button"
                  className="vm-btn vm-btn--primary shrink-0"
                  onClick={handleAnalyze}
                  disabled={imageLoading}
                >
                  {imageLoading ? "Analyserer…" : "🔍 Analysér"}
                </button>
              ) : null}
            </div>
            {imagePreview ? (
              <div className="rounded-lg border border-border overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-contain bg-foreground/5" />
              </div>
            ) : null}
            {imageError ? (
              <p className="text-xs text-red-600 whitespace-pre-line">{imageError}</p>
            ) : null}
            {imageSuccess ? (
              <p className="text-xs text-green-600">✓ Billede analyseret! Gennemse og ret felterne nedenfor, og tryk Gem.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Form (used for both edit and add modes)
  // ═══════════════════════════════════════════════════════════════════════════
  const renderForm = () => (
    <div className="space-y-3">
      {renderAddMethodUI()}

      {formError ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {formError}
        </div>
      ) : null}

      {/* ── Basic info ── */}
      <fieldset className="vm-fieldset">
        <legend className="vm-legend">Grundinfo</legend>
        <div className="space-y-2">
          <div>
            <label className="vm-label">Sortnavn *</label>
            <input
              className="vm-input"
              value={form.name ?? ""}
              onChange={(e) => upd({ name: e.target.value })}
              placeholder="Fx Nantes 2, Bintje, Cherry Belle"
            />
          </div>
          <div>
            <label className="vm-label">Beskrivelse</label>
            <textarea
              className="vm-input min-h-[60px] resize-y"
              value={form.description ?? ""}
              onChange={(e) => upd({ description: e.target.value })}
              placeholder="Hvad gør denne sort speciel?"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="vm-label">Farve</label>
              <input
                className="vm-input"
                value={form.color ?? ""}
                onChange={(e) => upd({ color: e.target.value })}
                placeholder="Fx rød, orange, lilla"
              />
            </div>
            <div>
              <label className="vm-label">Smag</label>
              <input
                className="vm-input"
                value={form.taste ?? ""}
                onChange={(e) => upd({ taste: e.target.value })}
                placeholder="Fx sød, mild, skarp"
              />
            </div>
          </div>
        </div>
      </fieldset>

      {/* ── Growing info ── */}
      <fieldset className="vm-fieldset">
        <legend className="vm-legend">Dyrkning</legend>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="vm-label">Dage til høst</label>
              <input
                type="number"
                className="vm-input"
                value={form.daysToHarvest ?? ""}
                onChange={(e) => upd({ daysToHarvest: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                placeholder="Fx 100"
              />
            </div>
            <div>
              <label className="vm-label">Planteafstand (cm)</label>
              <input
                type="number"
                className="vm-input"
                value={form.spacingCm ?? ""}
                onChange={(e) => upd({ spacingCm: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                placeholder="Fx 30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="vm-label">Højde (cm)</label>
              <input
                type="number"
                className="vm-input"
                value={form.heightCm ?? ""}
                onChange={(e) => upd({ heightCm: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                placeholder="Fx 60"
              />
            </div>
            <div>
              <label className="vm-label">Udbytte</label>
              <input
                className="vm-input"
                value={form.yieldInfo ?? ""}
                onChange={(e) => upd({ yieldInfo: e.target.value })}
                placeholder="Fx 3 kg/m²"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="vm-label">Så-start</label>
              <select
                className="vm-input"
                value={form.sowStart ?? ""}
                onChange={(e) => upd({ sowStart: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              >
                <option value="">—</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="vm-label">Så-slut</label>
              <select
                className="vm-input"
                value={form.sowEnd ?? ""}
                onChange={(e) => upd({ sowEnd: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              >
                <option value="">—</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="vm-label">Høst-start</label>
              <select
                className="vm-input"
                value={form.harvestStart ?? ""}
                onChange={(e) => upd({ harvestStart: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              >
                <option value="">—</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="vm-label">Høst-slut</label>
              <select
                className="vm-input"
                value={form.harvestEnd ?? ""}
                onChange={(e) => upd({ harvestEnd: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              >
                <option value="">—</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </fieldset>

      {/* ── Storage & Resistances ── */}
      <fieldset className="vm-fieldset">
        <legend className="vm-legend">Opbevaring & modstand</legend>
        <div className="space-y-2">
          <div>
            <label className="vm-label">Lagerkvalitet</label>
            <select
              className="vm-input"
              value={form.storageQuality ?? ""}
              onChange={(e) =>
                upd({
                  storageQuality: (e.target.value || undefined) as PlantVariety["storageQuality"],
                })
              }
            >
              <option value="">Ikke angivet</option>
              <option value="poor">Kort holdbarhed</option>
              <option value="fair">OK</option>
              <option value="good">God</option>
              <option value="excellent">Fremragende</option>
            </select>
          </div>
          <div>
            <label className="vm-label">Resistenser (kommasepareret)</label>
            <input
              className="vm-input"
              value={(form.resistances ?? []).join(", ")}
              onChange={(e) =>
                upd({
                  resistances: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Fx meldug, gulerodsflue"
            />
          </div>
        </div>
      </fieldset>

      {/* ── Source info ── */}
      <fieldset className="vm-fieldset">
        <legend className="vm-legend">Kilde</legend>
        <div className="space-y-2">
          <div>
            <label className="vm-label">Frøleverandør</label>
            <input
              className="vm-input"
              value={form.seedSource ?? ""}
              onChange={(e) => upd({ seedSource: e.target.value })}
              placeholder="Fx NK Frø, Impecta, Runåbergs"
            />
          </div>
          <div>
            <label className="vm-label">Kilde-URL</label>
            <input
              className="vm-input"
              value={form.sourceUrl ?? ""}
              onChange={(e) => upd({ sourceUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="vm-label">Billede-URL</label>
            <input
              className="vm-input"
              value={form.imageUrl ?? ""}
              onChange={(e) => upd({ imageUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>
      </fieldset>

      {/* ── Notes ── */}
      <div>
        <label className="vm-label">Noter</label>
        <textarea
          className="vm-input min-h-[60px] resize-y"
          value={form.notes ?? ""}
          onChange={(e) => upd({ notes: e.target.value })}
          placeholder="Egne noter om sorten…"
        />
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <button
          type="button"
          className="vm-btn vm-btn--primary flex-1"
          onClick={handleSave}
        >
          💾 {mode === "edit" ? "Gem ændringer" : "Gem sort"}
        </button>
        <button
          type="button"
          className="vm-btn vm-btn--secondary"
          onClick={() => {
            setMode("species");
            setEditVarId(null);
            setConfirmDelete(false);
            setFormError(null);
          }}
        >
          Annullér
        </button>
        {mode === "edit" ? (
          confirmDelete ? (
            <div className="flex items-center gap-1">
              <button type="button" className="vm-btn vm-btn--danger text-[10px]" onClick={handleDelete}>
                Ja, slet
              </button>
              <button
                type="button"
                className="vm-btn vm-btn--secondary text-[10px]"
                onClick={() => setConfirmDelete(false)}
              >
                Nej
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="vm-btn vm-btn--danger"
              onClick={() => setConfirmDelete(true)}
            >
              🗑️ Slet
            </button>
          )
        ) : null}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER: Main modal
  // ═══════════════════════════════════════════════════════════════════════════
  const breadcrumb = () => {
    const parts: { label: string; onClick?: () => void }[] = [];
    parts.push({ label: "Alle arter", onClick: mode !== "browse" ? goToBrowse : undefined });
    if (species && (mode === "species" || mode === "edit" || mode === "add")) {
      parts.push({
        label: `${species.icon ?? "🌱"} ${species.name}`,
        onClick: mode !== "species" ? () => goToSpecies(species!.id) : undefined,
      });
    }
    if (mode === "edit") parts.push({ label: `✏️ ${form.name || "Redigér sort"}` });
    if (mode === "add") parts.push({ label: "＋ Ny sort" });

    return (
      <div className="flex items-center gap-1 text-sm text-foreground/60 min-w-0">
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 ? <span className="text-foreground/30">›</span> : null}
            {p.onClick ? (
              <button
                type="button"
                className="hover:text-foreground hover:underline truncate max-w-[140px]"
                onClick={p.onClick}
              >
                {p.label}
              </button>
            ) : (
              <span className="font-medium text-foreground truncate max-w-[180px]">{p.label}</span>
            )}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div
      className="vm-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="vm-header">
          {breadcrumb()}
          <button
            type="button"
            className="shrink-0 rounded-lg p-1.5 text-foreground/50 hover:bg-foreground/10 hover:text-foreground transition-colors"
            onClick={onClose}
            title="Luk"
          >
            ✕
          </button>
        </div>

        {/* ── Content ── */}
        <div className="vm-content sidebar-scroll">
          {mode === "browse" ? renderBrowse() : null}
          {mode === "species" ? renderSpecies() : null}
          {mode === "edit" || mode === "add" ? renderForm() : null}
        </div>
      </div>
    </div>
  );
}
