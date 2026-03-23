"use client";

import { useState, useRef, useCallback } from "react";
import {
  getPlantById,
  addVarietyToSpecies,
  addOrUpdateCustomPlant,
  getAllPlants,
} from "../lib/plantStore";
import type { PlantSpecies, PlantCategory, PlantVariety } from "../lib/plantTypes";
import { PLANT_CATEGORY_LABELS } from "../lib/plantTypes";
import { userKey, markDirty } from "../lib/userStorage";

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------
const STORAGE_SCAN_HISTORY_KEY = "gardenos:scanHistory:v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ScanType = "seed-packet" | "plant-photo" | "product";

interface ScanHistoryItem {
  id: string;
  type: ScanType;
  thumbnail: string;
  data: Record<string, unknown>;
  name: string;
  scannedAt: string;
  transferred?: boolean;
  transferredAs?: string;
}

// ---------------------------------------------------------------------------
// Helpers (previously module-level in GardenMapClient)
// ---------------------------------------------------------------------------
function loadScanHistory(): ScanHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(userKey(STORAGE_SCAN_HISTORY_KEY));
    if (!raw) return [];
    return JSON.parse(raw) as ScanHistoryItem[];
  } catch {
    return [];
  }
}

function saveScanHistory(items: ScanHistoryItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_SCAN_HISTORY_KEY), JSON.stringify(items));
  markDirty(STORAGE_SCAN_HISTORY_KEY);
}

/** Resize a base64 data-URL image to max 200px for thumbnail storage */
function createThumbnail(dataUrl: string, maxSize = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(dataUrl.slice(0, 500)); // fallback
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface ScanTabProps {
  setPlantDataVersion: React.Dispatch<React.SetStateAction<number>>;
  onNavigateToPlants: () => void;
  trackActivity?: (action: string, detail?: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ScanTab({
  setPlantDataVersion,
  onNavigateToPlants,
  trackActivity,
}: ScanTabProps) {
  // ── Scan / frøpose-genkendelse state ──
  const [scanMode, setScanMode] = useState<"seed-packet" | "identify">("seed-packet");
  const [scanImage, setScanImage] = useState<string | null>(null);
  const [scanAnalyzing, setScanAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<Record<string, unknown> | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSaved, setScanSaved] = useState(false);
  const [scanSaveExpanded, setScanSaveExpanded] = useState(false);
  const [scanSaveCategory, setScanSaveCategory] = useState<PlantCategory>("bush");
  const scanInputRef = useRef<HTMLInputElement>(null);

  // ── Scan history (bibliotek) ──
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>(() => loadScanHistory());
  const [scanSubTab, setScanSubTab] = useState<"scan" | "library">("scan");
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [transferCategory, setTransferCategory] = useState<PlantCategory>("vegetable");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [confirmDeleteHistoryId, setConfirmDeleteHistoryId] = useState<string | null>(null);

  // ── Callbacks ──
  const addToScanHistory = useCallback(async (type: ScanType, imageDataUrl: string, data: Record<string, unknown>) => {
    const thumbnail = await createThumbnail(imageDataUrl);
    const name = String(data.speciesName || data.name || "Ukendt");
    const item: ScanHistoryItem = {
      id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      thumbnail,
      data,
      name,
      scannedAt: new Date().toISOString(),
    };
    setScanHistory((prev) => { const next = [item, ...prev]; saveScanHistory(next); return next; });
    trackActivity?.(`scan:${type}`, name);
  }, [trackActivity]);

  const removeScanHistoryItem = useCallback((id: string) => {
    setScanHistory((prev) => { const next = prev.filter((i) => i.id !== id); saveScanHistory(next); return next; });
    setConfirmDeleteHistoryId(null);
  }, []);

  const markScanTransferred = useCallback((id: string, category: string) => {
    setScanHistory((prev) => {
      const next = prev.map((i) => i.id === id ? { ...i, transferred: true, transferredAs: category } : i);
      saveScanHistory(next);
      return next;
    });
    setTransferringId(null);
  }, []);

  return (
    <div className="mt-3 space-y-3">
      {/* Sub-tab: Scan / Bibliotek */}
      <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm">
        <button
          type="button"
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
            scanSubTab === "scan"
              ? "bg-accent text-white shadow-sm"
              : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
          }`}
          onClick={() => setScanSubTab("scan")}
        >
          📷 Scan
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
            scanSubTab === "library"
              ? "bg-amber-500 text-white shadow-sm"
              : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
          }`}
          onClick={() => setScanSubTab("library")}
        >
          📚 Bibliotek {scanHistory.length > 0 ? `(${scanHistory.length})` : ""}
        </button>
      </div>

      {scanSubTab === "scan" ? (
      <div>
        {/* Mode switcher */}
        <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm mb-3">
          <button
            type="button"
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
              scanMode === "seed-packet"
                ? "bg-accent text-white shadow-sm"
                : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
            }`}
            onClick={() => { setScanMode("seed-packet"); setScanResult(null); setScanError(null); setScanSaved(false); }}
          >
            🌱 Frøpose
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
              scanMode === "identify"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
            }`}
            onClick={() => { setScanMode("identify"); setScanResult(null); setScanError(null); setScanSaved(false); }}
          >
            🔍 Identificér
          </button>
        </div>

        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">
          {scanMode === "identify" ? "🌿 Identificér plante" : "📷 Scan frøpose / etiket"}
        </label>
        <p className="text-[10px] text-foreground/40 mb-3">
          {scanMode === "identify"
            ? "Tag et foto af en plante i haven \u2014 AI\u2019en identificerer arten og fort\u00e6ller om det er ukrudt, spiseligt, giftigt m.m."
            : "Tag et foto af en fr\u00f8pose, plantelabel eller emballage \u2014 AI\u2019en afl\u00e6ser informationen og opretter planten for dig."}
        </p>

        {/* Hidden file input */}
        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setScanResult(null);
            setScanError(null);
            setScanSaved(false);
            const reader = new FileReader();
            reader.onload = () => {
              setScanImage(reader.result as string);
            };
            reader.readAsDataURL(file);
            // Reset so same file can be re-selected
            e.target.value = "";
          }}
        />

        {/* Capture buttons */}
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            className="flex-1 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-xs text-accent-dark font-medium hover:bg-accent/20 transition-colors flex items-center justify-center gap-2"
            onClick={() => scanInputRef.current?.click()}
          >
            📷 Tag foto / vælg billede
          </button>
          {scanImage ? (
            <button
              type="button"
              className="rounded-lg border border-foreground/20 bg-foreground/5 px-3 py-2.5 text-xs text-foreground/60 hover:bg-foreground/10 transition-colors"
              onClick={() => { setScanImage(null); setScanResult(null); setScanError(null); setScanSaved(false); }}
            >
              ✕ Nulstil
            </button>
          ) : null}
        </div>

        {/* Image preview */}
        {scanImage ? (
          <div className="mb-3">
            <div className="rounded-lg border border-border overflow-hidden bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={scanImage} alt="Scannet billede" className="w-full max-h-48 object-contain" />
            </div>

            {/* Analyze button */}
            {!scanResult && !scanAnalyzing ? (
              <button
                type="button"
                className="mt-2 w-full rounded-lg bg-accent px-3 py-2.5 text-xs text-white font-semibold hover:bg-accent/90 transition-colors flex items-center justify-center gap-2 shadow-sm"
                onClick={async () => {
                  setScanAnalyzing(true);
                  setScanError(null);
                  try {
                    const res = await fetch("/api/analyze-image", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ image: scanImage, type: scanMode === "identify" ? "plant-photo" : "seed-packet" }),
                    });
                    const data = await res.json();
                    if (!res.ok || data.error) {
                      const msg = data.needsConfig
                        ? "OPENAI_API_KEY er ikke konfigureret. Tilføj den som miljøvariabel i Vercel."
                        : data.raw
                          ? `${data.error}\n\nRåt AI-svar: ${String(data.raw).slice(0, 200)}`
                          : data.error || "Ukendt fejl fra AI";
                      setScanError(msg);
                    } else {
                      setScanResult(data);
                      // Auto-save to scan history
                      addToScanHistory(
                        scanMode === "identify" ? "plant-photo" : "seed-packet",
                        scanImage!,
                        data,
                      );
                    }
                  } catch (err) {
                    setScanError(err instanceof Error ? err.message : "Netværksfejl");
                  }
                  setScanAnalyzing(false);
                }}
              >
                {scanMode === "identify" ? "🌿 Identificér plante" : "🧠 Analysér frøpose"}
              </button>
            ) : null}

            {scanAnalyzing ? (
              <div className="mt-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-3 text-center">
                <div className="text-sm animate-pulse">🧠</div>
                <p className="text-[11px] text-accent-dark mt-1">Analyserer billede…</p>
                <p className="text-[9px] text-foreground/40 mt-0.5">Dette kan tage 5–15 sekunder</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Error */}
        {scanError ? (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 mb-3">
            <p className="text-[11px] text-red-700">⚠️ {scanError}</p>
          </div>
        ) : null}

        {/* Results — seed packet mode */}
        {scanResult && scanMode === "seed-packet" ? (
          <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-2 mb-3">
            <p className="text-[11px] font-semibold text-accent-dark">✅ Data fundet fra frøpose</p>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {scanResult.speciesName ? (
                <div className="col-span-2">
                  <span className="text-[9px] text-foreground/40 uppercase">Planteart</span>
                  <p className="text-xs font-semibold text-foreground/80">{String(scanResult.speciesName)}</p>
                </div>
              ) : null}
              {scanResult.name ? (
                <div className="col-span-2">
                  <span className="text-[9px] text-foreground/40 uppercase">Sort</span>
                  <p className="text-xs font-medium text-foreground/70">{String(scanResult.name)}</p>
                </div>
              ) : null}
              {scanResult.description ? (
                <div className="col-span-2">
                  <span className="text-[9px] text-foreground/40 uppercase">Beskrivelse</span>
                  <p className="text-[10px] text-foreground/60">{String(scanResult.description)}</p>
                </div>
              ) : null}
              {scanResult.sowStart || scanResult.sowEnd ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Såperiode</span>
                  <p className="text-xs text-foreground/70">
                    {scanResult.sowStart ? `Mnd ${scanResult.sowStart}` : "?"}–{scanResult.sowEnd ? `${scanResult.sowEnd}` : "?"}
                  </p>
                </div>
              ) : null}
              {scanResult.harvestStart || scanResult.harvestEnd ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Høstperiode</span>
                  <p className="text-xs text-foreground/70">
                    {scanResult.harvestStart ? `Mnd ${scanResult.harvestStart}` : "?"}–{scanResult.harvestEnd ? `${scanResult.harvestEnd}` : "?"}
                  </p>
                </div>
              ) : null}
              {scanResult.daysToHarvest ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Dage til høst</span>
                  <p className="text-xs text-foreground/70">{String(scanResult.daysToHarvest)} dage</p>
                </div>
              ) : null}
              {scanResult.spacingCm ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Afstand</span>
                  <p className="text-xs text-foreground/70">{String(scanResult.spacingCm)} cm</p>
                </div>
              ) : null}
              {scanResult.taste ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Smag</span>
                  <p className="text-xs text-foreground/70">{String(scanResult.taste)}</p>
                </div>
              ) : null}
              {scanResult.color ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Farve</span>
                  <p className="text-xs text-foreground/70">{String(scanResult.color)}</p>
                </div>
              ) : null}
              {scanResult.seedSource ? (
                <div className="col-span-2">
                  <span className="text-[9px] text-foreground/40 uppercase">Frøleverandør</span>
                  <p className="text-xs text-foreground/70">{String(scanResult.seedSource)}</p>
                </div>
              ) : null}
              {scanResult.notes ? (
                <div className="col-span-2">
                  <span className="text-[9px] text-foreground/40 uppercase">Bemærkninger</span>
                  <p className="text-[10px] text-foreground/60 italic">{String(scanResult.notes)}</p>
                </div>
              ) : null}
            </div>

            {/* Save to plant database */}
            {!scanSaved ? (
              <button
                type="button"
                className="mt-2 w-full rounded-lg bg-accent px-3 py-2.5 text-xs text-white font-semibold hover:bg-accent/90 transition-colors shadow-sm"
                data-tour="scan-save"
                onClick={() => {
                  const speciesName = String(scanResult.speciesName || scanResult.name || "Ukendt plante");
                  const speciesId = speciesName.toLowerCase().replace(/[^a-zæøåü0-9]+/g, "-").replace(/-+$/, "");
                  const varietyName = String(scanResult.name || "Standard");
                  const varietyId = varietyName.toLowerCase().replace(/[^a-zæøåü0-9]+/g, "-").replace(/-+$/, "");

                  // Check if species already exists
                  const existing = getPlantById(speciesId);

                  if (existing) {
                    // Add as new variety to existing species
                    const variety: PlantVariety = {
                      id: varietyId,
                      name: varietyName,
                      description: scanResult.description ? String(scanResult.description) : undefined,
                      daysToHarvest: scanResult.daysToHarvest ? Number(scanResult.daysToHarvest) : undefined,
                      spacingCm: scanResult.spacingCm ? Number(scanResult.spacingCm) : undefined,
                      taste: scanResult.taste ? String(scanResult.taste) : undefined,
                      color: scanResult.color ? String(scanResult.color) : undefined,
                      seedSource: scanResult.seedSource ? String(scanResult.seedSource) : undefined,
                      notes: scanResult.notes ? String(scanResult.notes) : undefined,
                      sowStart: scanResult.sowStart ? Number(scanResult.sowStart) : undefined,
                      sowEnd: scanResult.sowEnd ? Number(scanResult.sowEnd) : undefined,
                      harvestStart: scanResult.harvestStart ? Number(scanResult.harvestStart) : undefined,
                      harvestEnd: scanResult.harvestEnd ? Number(scanResult.harvestEnd) : undefined,
                      addedVia: "seed-packet",
                    };
                    addVarietyToSpecies(speciesId, variety);
                  } else {
                    // Create new species + variety
                    const newSpecies: PlantSpecies = {
                      id: speciesId,
                      name: speciesName,
                      category: "vegetable",
                      description: scanResult.description ? String(scanResult.description) : undefined,
                      spacingCm: scanResult.spacingCm ? Number(scanResult.spacingCm) : undefined,
                      sowOutdoor: scanResult.sowStart && scanResult.sowEnd ? { from: Number(scanResult.sowStart), to: Number(scanResult.sowEnd) } : undefined,
                      harvest: scanResult.harvestStart && scanResult.harvestEnd ? { from: Number(scanResult.harvestStart), to: Number(scanResult.harvestEnd) } : undefined,
                      source: "ai",
                      icon: "🌱",
                      varieties: [{
                        id: varietyId,
                        name: varietyName,
                        description: scanResult.description ? String(scanResult.description) : undefined,
                        daysToHarvest: scanResult.daysToHarvest ? Number(scanResult.daysToHarvest) : undefined,
                        spacingCm: scanResult.spacingCm ? Number(scanResult.spacingCm) : undefined,
                        taste: scanResult.taste ? String(scanResult.taste) : undefined,
                        color: scanResult.color ? String(scanResult.color) : undefined,
                        seedSource: scanResult.seedSource ? String(scanResult.seedSource) : undefined,
                        notes: scanResult.notes ? String(scanResult.notes) : undefined,
                        sowStart: scanResult.sowStart ? Number(scanResult.sowStart) : undefined,
                        sowEnd: scanResult.sowEnd ? Number(scanResult.sowEnd) : undefined,
                        harvestStart: scanResult.harvestStart ? Number(scanResult.harvestStart) : undefined,
                        harvestEnd: scanResult.harvestEnd ? Number(scanResult.harvestEnd) : undefined,
                        addedVia: "seed-packet",
                      }],
                    };
                    addOrUpdateCustomPlant(newSpecies);
                  }

                  setPlantDataVersion((v) => v + 1);
                  setScanSaved(true);
                }}
              >
                🌱 Gem i plantedatabasen
              </button>
            ) : (
              <div className="mt-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-center">
                <p className="text-[11px] text-green-700 font-medium">✅ Gemt! Du finder den under 🌱 Planter.</p>
                <button
                  type="button"
                  className="mt-1 text-[10px] text-accent underline"
                  onClick={onNavigateToPlants}
                >
                  Gå til Planter →
                </button>
              </div>
            )}
          </div>
        ) : null}

        {/* Results — plant identification mode */}
        {scanResult && scanMode === "identify" ? (
          <div className="rounded-lg border border-emerald-300/40 bg-emerald-50/50 p-3 space-y-2 mb-3">
            <p className="text-[11px] font-semibold text-emerald-700">🌿 Plante identificeret</p>

            <div className="space-y-1.5">
              {scanResult.speciesName ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Planteart</span>
                  <p className="text-sm font-bold text-foreground/90">{String(scanResult.speciesName)}</p>
                </div>
              ) : null}
              {scanResult.latinName ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Latinsk navn</span>
                  <p className="text-xs italic text-foreground/60">{String(scanResult.latinName)}</p>
                </div>
              ) : null}
              {scanResult.name && scanResult.name !== scanResult.speciesName ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Sort / variant</span>
                  <p className="text-xs font-medium text-foreground/70">{String(scanResult.name)}</p>
                </div>
              ) : null}

              {/* Classification badges */}
              <div className="flex flex-wrap gap-1 pt-1">
                {scanResult.isWeed !== undefined ? (
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    scanResult.isWeed ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  }`}>
                    {scanResult.isWeed ? "🌾 Ukrudt" : "✅ Ikke ukrudt"}
                  </span>
                ) : null}
                {scanResult.isEdible !== undefined ? (
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    scanResult.isEdible ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {scanResult.isEdible ? "🍽 Spiselig" : "🚫 Ikke spiselig"}
                  </span>
                ) : null}
                {scanResult.isPoisonous !== undefined && scanResult.isPoisonous ? (
                  <span className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-medium">
                    ☠️ Giftig
                  </span>
                ) : null}
                {scanResult.isInvasive !== undefined && scanResult.isInvasive ? (
                  <span className="inline-block rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[10px] font-medium">
                    ⚠️ Invasiv
                  </span>
                ) : null}
              </div>

              {scanResult.description ? (
                <div className="pt-1">
                  <span className="text-[9px] text-foreground/40 uppercase">Beskrivelse</span>
                  <p className="text-[10px] text-foreground/60 leading-relaxed">{String(scanResult.description)}</p>
                </div>
              ) : null}
              {scanResult.habitat ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Vokser typisk</span>
                  <p className="text-[10px] text-foreground/60">{String(scanResult.habitat)}</p>
                </div>
              ) : null}
              {scanResult.color ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Farve</span>
                  <p className="text-xs text-foreground/70">{String(scanResult.color)}</p>
                </div>
              ) : null}
              {scanResult.heightCm ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Estimeret højde</span>
                  <p className="text-xs text-foreground/70">ca. {String(scanResult.heightCm)} cm</p>
                </div>
              ) : null}
              {scanResult.careAdvice ? (
                <div className="pt-1">
                  <span className="text-[9px] text-foreground/40 uppercase">Plejeråd / anbefaling</span>
                  <p className="text-[10px] text-foreground/60 leading-relaxed">{String(scanResult.careAdvice)}</p>
                </div>
              ) : null}
              {scanResult.notes ? (
                <div>
                  <span className="text-[9px] text-foreground/40 uppercase">Bemærkninger</span>
                  <p className="text-[10px] text-foreground/60 italic">{String(scanResult.notes)}</p>
                </div>
              ) : null}
              {scanResult.confidence ? (
                <p className="text-[9px] text-foreground/30 pt-1">Sikkerhed: {String(scanResult.confidence)}</p>
              ) : null}
            </div>

            {/* Save identified plant to database */}
            {!scanSaved ? (
              scanSaveExpanded ? (
                <div className="mt-2 rounded-lg border border-accent/30 bg-accent/5 p-2.5 space-y-2">
                  <p className="text-[10px] font-medium text-accent-dark">Vælg kategori for planten:</p>
                  <div className="grid grid-cols-2 gap-1">
                    {(Object.entries(PLANT_CATEGORY_LABELS) as [PlantCategory, string][]).map(([cat, label]) => (
                      <button
                        key={cat}
                        type="button"
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition-all ${
                          scanSaveCategory === cat
                            ? "border-accent bg-accent text-white"
                            : "border-border bg-background text-foreground/60 hover:bg-foreground/5"
                        }`}
                        onClick={() => setScanSaveCategory(cat)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="flex-1 rounded-lg bg-emerald-600 text-white px-2 py-2 text-xs font-semibold hover:bg-emerald-700 transition-colors"
                      onClick={() => {
                        const speciesName = String(scanResult.speciesName || scanResult.name || "Ukendt plante");
                        const speciesId = speciesName.toLowerCase().replace(/[^a-zæøåü0-9]+/g, "-").replace(/-+$/, "");

                        const existing = getPlantById(speciesId);

                        if (existing) {
                          // Add as variety to existing species
                          const variety: PlantVariety = {
                            id: "identified-" + Date.now().toString(36),
                            name: speciesName,
                            description: scanResult.description ? String(scanResult.description) : undefined,
                            color: scanResult.color ? String(scanResult.color) : undefined,
                            heightCm: scanResult.heightCm ? Number(scanResult.heightCm) : undefined,
                            notes: [
                              scanResult.careAdvice ? `Plejeråd: ${String(scanResult.careAdvice)}` : null,
                              scanResult.notes ? String(scanResult.notes) : null,
                            ].filter(Boolean).join(". ") || undefined,
                            addedVia: "plant-photo",
                          };
                          addVarietyToSpecies(speciesId, variety);
                        } else {
                          const newSpecies: PlantSpecies = {
                            id: speciesId,
                            name: speciesName,
                            latinName: scanResult.latinName ? String(scanResult.latinName) : undefined,
                            category: scanSaveCategory,
                            description: [
                              scanResult.description ? String(scanResult.description) : "",
                              scanResult.careAdvice ? `Plejeråd: ${String(scanResult.careAdvice)}` : "",
                              scanResult.habitat ? `Habitat: ${String(scanResult.habitat)}` : "",
                            ].filter(Boolean).join("\n"),
                            spacingCm: scanResult.heightCm ? Number(scanResult.heightCm) : undefined,
                            source: "ai",
                            icon: scanResult.isWeed ? "🌾" : scanResult.isEdible ? "🥬" : "🌿",
                            varieties: [{
                              id: "identified",
                              name: speciesName,
                              description: scanResult.description ? String(scanResult.description) : undefined,
                              color: scanResult.color ? String(scanResult.color) : undefined,
                              heightCm: scanResult.heightCm ? Number(scanResult.heightCm) : undefined,
                              notes: [
                                scanResult.isWeed ? "Ukrudt" : null,
                                scanResult.isEdible ? "Spiselig" : null,
                                scanResult.isPoisonous ? "⚠️ Giftig" : null,
                                scanResult.isInvasive ? "⚠️ Invasiv" : null,
                                scanResult.careAdvice ? `Plejeråd: ${String(scanResult.careAdvice)}` : null,
                                scanResult.notes ? String(scanResult.notes) : null,
                              ].filter(Boolean).join(". "),
                              addedVia: "plant-photo",
                            }],
                          };
                          addOrUpdateCustomPlant(newSpecies);
                        }

                        setPlantDataVersion((v) => v + 1);
                        setScanSaved(true);
                        setScanSaveExpanded(false);
                      }}
                    >
                      ✅ Gem som {PLANT_CATEGORY_LABELS[scanSaveCategory]}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-border px-2 py-2 text-xs text-foreground/50 hover:bg-foreground/5"
                      onClick={() => setScanSaveExpanded(false)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs text-white font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
                  onClick={() => setScanSaveExpanded(true)}
                >
                  🌿 Gem i plantedatabasen…
                </button>
              )
            ) : (
              <div className="mt-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-center">
                <p className="text-[11px] text-green-700 font-medium">✅ Gemt som {PLANT_CATEGORY_LABELS[scanSaveCategory]}! Du finder den under 🌱 Planter.</p>
                <button
                  type="button"
                  className="mt-1 text-[10px] text-accent underline"
                  onClick={onNavigateToPlants}
                >
                  Gå til Planter →
                </button>
              </div>
            )}
          </div>
        ) : null}

        {/* Help text when no image */}
        {!scanImage && !scanResult ? (
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] font-medium text-foreground/60 mb-1.5">S\u00e5dan virker det:</p>
            {scanMode === "identify" ? (
              <ol className="text-[10px] text-foreground/50 space-y-1 list-decimal ml-3">
                <li>Tag et foto af planten i din have</li>
                <li>AI&apos;en identificerer art, ukrudt/spiselig/giftig</li>
                <li>F\u00e5 plejer\u00e5d og anbefaling</li>
              </ol>
            ) : (
              <ol className="text-[10px] text-foreground/50 space-y-1 list-decimal ml-3">
                <li>Tag et foto af fr\u00f8posen eller etiketten</li>
                <li>AI&apos;en afl\u00e6ser sort, s\u00e5/h\u00f8st-tider, afstand m.m.</li>
                <li>Gem planten i din database med \u00e9t klik</li>
                <li>Brug den n\u00e5r du planl\u00e6gger dine bede</li>
              </ol>
            )}
            <p className="text-[9px] text-foreground/30 mt-2 italic">Kræver at OPENAI_API_KEY er konfigureret som miljøvariabel.</p>
          </div>
        ) : null}
      </div>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Sub-tab: Bibliotek – scan history                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {scanSubTab === "library" ? (
        <div className="space-y-2">
          <p className="text-[10px] text-foreground/40">
            Alle dine scannede planter og frøposer gemmes her. Du kan overføre dem til plantedatabasen med den rigtige kategori.
          </p>

          {scanHistory.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">📚</p>
              <p className="text-sm text-foreground/50">Ingen scans endnu.</p>
              <p className="text-[10px] text-foreground/30 mt-1">Gå til {'"📷 Scan"'} og tag et billede.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto sidebar-scroll">
              {scanHistory.map((item) => {
                const isExpanded = expandedHistoryId === item.id;
                const isTransferring = transferringId === item.id;
                const typeLabel = item.type === "seed-packet" ? "🏷️ Frøpose" : item.type === "plant-photo" ? "🌿 Plante" : "📦 Produkt";
                const dateStr = new Date(item.scannedAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

                return (
                  <div key={item.id} className={`rounded-lg border ${item.transferred ? "border-green-200 bg-green-50/30" : "border-border"} overflow-hidden`}>
                    {/* Compact row */}
                    <div className="flex items-center gap-2 p-2">
                      <button
                        type="button"
                        className="flex-1 flex items-center gap-2 text-left hover:bg-foreground/5 transition-colors rounded min-w-0"
                        onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.thumbnail} alt="" className="w-10 h-10 rounded object-cover shrink-0 border border-border" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground/80 truncate">{item.name}</p>
                          <p className="text-[9px] text-foreground/40">{typeLabel} · {dateStr}</p>
                        </div>
                        {item.transferred ? (
                          <span className="text-[9px] text-green-600 font-medium shrink-0">✅</span>
                        ) : (
                          <span className="text-[9px] text-amber-500 font-medium shrink-0">⏳</span>
                        )}
                        <span className="text-foreground/30 text-xs shrink-0">{isExpanded ? "▾" : "›"}</span>
                      </button>
                      {/* Quick delete */}
                      {confirmDeleteHistoryId === item.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" className="text-[9px] px-1.5 py-0.5 rounded bg-red-500 text-white" onClick={(e) => { e.stopPropagation(); removeScanHistoryItem(item.id); }}>Slet</button>
                          <button type="button" className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/60" onClick={(e) => { e.stopPropagation(); setConfirmDeleteHistoryId(null); }}>Nej</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="text-sm text-foreground/20 hover:text-red-500 transition-colors shrink-0 p-1"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteHistoryId(item.id); }}
                          title="Slet scan"
                        >
                          🗑
                        </button>
                      )}
                    </div>

                    {/* Expanded detail */}
                    {isExpanded ? (
                      <div className="border-t border-border px-3 py-2 space-y-2 bg-foreground/[0.02]">
                        {/* Image */}
                        <div className="rounded-lg overflow-hidden border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.thumbnail} alt="" className="w-full max-h-32 object-contain bg-foreground/5" />
                        </div>

                        {/* Key data */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          {item.data.speciesName ? (
                            <div className="col-span-2">
                              <span className="text-[9px] text-foreground/40 uppercase">Art</span>
                              <p className="text-xs font-semibold text-foreground/80">{String(item.data.speciesName)}</p>
                            </div>
                          ) : null}
                          {item.data.latinName ? (
                            <div className="col-span-2">
                              <span className="text-[9px] text-foreground/40 uppercase">Latin</span>
                              <p className="text-[10px] italic text-foreground/50">{String(item.data.latinName)}</p>
                            </div>
                          ) : null}
                          {item.data.description ? (
                            <div className="col-span-2">
                              <span className="text-[9px] text-foreground/40 uppercase">Beskrivelse</span>
                              <p className="text-[10px] text-foreground/60">{String(item.data.description)}</p>
                            </div>
                          ) : null}
                          {item.data.taste ? (<div><span className="text-[9px] text-foreground/40 uppercase">Smag</span><p className="text-[10px] text-foreground/60">{String(item.data.taste)}</p></div>) : null}
                          {item.data.color ? (<div><span className="text-[9px] text-foreground/40 uppercase">Farve</span><p className="text-[10px] text-foreground/60">{String(item.data.color)}</p></div>) : null}
                          {item.data.seedSource ? (<div className="col-span-2"><span className="text-[9px] text-foreground/40 uppercase">Leverandør</span><p className="text-[10px] text-foreground/60">{String(item.data.seedSource)}</p></div>) : null}
                          {item.data.careAdvice ? (<div className="col-span-2"><span className="text-[9px] text-foreground/40 uppercase">Plejeråd</span><p className="text-[10px] text-foreground/60">{String(item.data.careAdvice)}</p></div>) : null}
                          {item.data.confidence ? (<div className="col-span-2"><span className="text-[9px] text-foreground/30">Sikkerhed: {String(item.data.confidence)}</span></div>) : null}
                        </div>

                        {/* Classification badges for plant-photo */}
                        {item.type === "plant-photo" ? (
                          <div className="flex flex-wrap gap-1">
                            {item.data.isWeed !== undefined ? <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium ${item.data.isWeed ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{item.data.isWeed ? "🌾 Ukrudt" : "✅ Ikke ukrudt"}</span> : null}
                            {item.data.isEdible !== undefined ? <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium ${item.data.isEdible ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{item.data.isEdible ? "🍽 Spiselig" : "🚫 Ikke spiselig"}</span> : null}
                            {item.data.isPoisonous ? <span className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[9px] font-medium">☠️ Giftig</span> : null}
                            {item.data.isInvasive ? <span className="inline-block rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[9px] font-medium">⚠️ Invasiv</span> : null}
                          </div>
                        ) : null}

                        {/* Transfer to plant database */}
                        {!item.transferred ? (
                          isTransferring ? (
                            <div className="rounded-lg border border-accent/30 bg-accent/5 p-2 space-y-2">
                              <p className="text-[10px] font-medium text-accent-dark">Vælg kategori:</p>
                              <div className="grid grid-cols-2 gap-1">
                                {(Object.entries(PLANT_CATEGORY_LABELS) as [PlantCategory, string][]).map(([cat, label]) => (
                                  <button
                                    key={cat}
                                    type="button"
                                    className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition-all ${
                                      transferCategory === cat
                                        ? "border-accent bg-accent text-white"
                                        : "border-border bg-background text-foreground/60 hover:bg-foreground/5"
                                    }`}
                                    onClick={() => setTransferCategory(cat)}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  className="flex-1 rounded-lg bg-accent text-white px-2 py-2 text-xs font-semibold hover:bg-accent/90 transition-colors"
                                  onClick={() => {
                                    const d = item.data;
                                    const speciesName = String(d.speciesName || d.name || "Ukendt");
                                    const speciesId = speciesName.toLowerCase().replace(/[^a-zæøåü0-9]+/g, "-").replace(/-+$/, "");
                                    const varietyName = String(d.name || speciesName);
                                    const varietyId = varietyName.toLowerCase().replace(/[^a-zæøåü0-9]+/g, "-").replace(/-+$/, "");

                                    const existing = getPlantById(speciesId);

                                    if (existing) {
                                      const variety: PlantVariety = {
                                        id: varietyId + "-" + Date.now().toString(36),
                                        name: varietyName,
                                        description: d.description ? String(d.description) : undefined,
                                        daysToHarvest: d.daysToHarvest ? Number(d.daysToHarvest) : undefined,
                                        spacingCm: d.spacingCm ? Number(d.spacingCm) : undefined,
                                        taste: d.taste ? String(d.taste) : undefined,
                                        color: d.color ? String(d.color) : undefined,
                                        seedSource: d.seedSource ? String(d.seedSource) : undefined,
                                        heightCm: d.heightCm ? Number(d.heightCm) : undefined,
                                        notes: d.notes ? String(d.notes) : undefined,
                                        sowStart: d.sowStart ? Number(d.sowStart) : undefined,
                                        sowEnd: d.sowEnd ? Number(d.sowEnd) : undefined,
                                        harvestStart: d.harvestStart ? Number(d.harvestStart) : undefined,
                                        harvestEnd: d.harvestEnd ? Number(d.harvestEnd) : undefined,
                                        addedVia: item.type === "seed-packet" ? "seed-packet" : "plant-photo",
                                      };
                                      addVarietyToSpecies(speciesId, variety);
                                    } else {
                                      const icon = item.type === "plant-photo"
                                        ? (d.isWeed ? "🌾" : d.isEdible ? "🥬" : "🌿")
                                        : "🌱";
                                      const newSpecies: PlantSpecies = {
                                        id: speciesId,
                                        name: speciesName,
                                        latinName: d.latinName ? String(d.latinName) : undefined,
                                        category: transferCategory,
                                        description: [
                                          d.description ? String(d.description) : "",
                                          d.careAdvice ? `Plejeråd: ${String(d.careAdvice)}` : "",
                                        ].filter(Boolean).join("\n") || undefined,
                                        spacingCm: d.spacingCm ? Number(d.spacingCm) : undefined,
                                        sowOutdoor: d.sowStart && d.sowEnd ? { from: Number(d.sowStart), to: Number(d.sowEnd) } : undefined,
                                        harvest: d.harvestStart && d.harvestEnd ? { from: Number(d.harvestStart), to: Number(d.harvestEnd) } : undefined,
                                        source: "ai",
                                        icon,
                                        varieties: [{
                                          id: varietyId,
                                          name: varietyName,
                                          description: d.description ? String(d.description) : undefined,
                                          daysToHarvest: d.daysToHarvest ? Number(d.daysToHarvest) : undefined,
                                          spacingCm: d.spacingCm ? Number(d.spacingCm) : undefined,
                                          taste: d.taste ? String(d.taste) : undefined,
                                          color: d.color ? String(d.color) : undefined,
                                          seedSource: d.seedSource ? String(d.seedSource) : undefined,
                                          heightCm: d.heightCm ? Number(d.heightCm) : undefined,
                                          notes: d.notes ? String(d.notes) : undefined,
                                          sowStart: d.sowStart ? Number(d.sowStart) : undefined,
                                          sowEnd: d.sowEnd ? Number(d.sowEnd) : undefined,
                                          harvestStart: d.harvestStart ? Number(d.harvestStart) : undefined,
                                          harvestEnd: d.harvestEnd ? Number(d.harvestEnd) : undefined,
                                          addedVia: item.type === "seed-packet" ? "seed-packet" : "plant-photo",
                                        }],
                                      };
                                      addOrUpdateCustomPlant(newSpecies);
                                    }

                                    // Verify it was saved
                                    getAllPlants();

                                    setPlantDataVersion((v) => v + 1);
                                    markScanTransferred(item.id, transferCategory);
                                  }}
                                >
                                  ✅ Overfør som {PLANT_CATEGORY_LABELS[transferCategory]}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-border px-2 py-2 text-xs text-foreground/50 hover:bg-foreground/5"
                                  onClick={() => setTransferringId(null)}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="w-full rounded-lg border-2 border-dashed border-accent/30 bg-accent/5 px-3 py-2 text-xs font-medium text-accent-dark hover:bg-accent/10 hover:border-accent/50 transition-all"
                              onClick={() => { setTransferringId(item.id); setTransferCategory("vegetable"); }}
                            >
                              🌱 Overfør til plantedatabasen…
                            </button>
                          )
                        ) : (
                          <p className="text-[10px] text-green-600 font-medium">
                            ✅ Overført som {PLANT_CATEGORY_LABELS[item.transferredAs as PlantCategory] ?? item.transferredAs}
                          </p>
                        )}

                        {/* Delete */}
                        <div className="flex justify-end pt-1 border-t border-border/50">
                          {confirmDeleteHistoryId === item.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-red-600">Slet permanent?</span>
                              <button type="button" className="text-[10px] px-2 py-0.5 rounded bg-red-500 text-white" onClick={() => removeScanHistoryItem(item.id)}>Ja</button>
                              <button type="button" className="text-[10px] px-2 py-0.5 rounded bg-foreground/10 text-foreground/60" onClick={() => setConfirmDeleteHistoryId(null)}>Nej</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="text-[10px] text-foreground/30 hover:text-red-500 transition-colors"
                              onClick={() => setConfirmDeleteHistoryId(item.id)}
                            >
                              🗑 Slet
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {scanHistory.length > 0 ? (
            <p className="text-[9px] text-foreground/30 italic">
              {scanHistory.filter((i) => i.transferred).length} af {scanHistory.length} scans overført til plantedatabasen.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
