// ---------------------------------------------------------------------------
// GardenOS – Bed Generator Dialog for Design Lab
// ---------------------------------------------------------------------------
// AI-powered bed generation from natural language + quick presets.
// "Lav et bed i røde nuancer, hvor der er blomster hele året"
// ---------------------------------------------------------------------------

"use client";

import { memo, useState, useMemo, useCallback } from "react";
import type { PlantSpecies } from "../../lib/plantTypes";
import { COLOR_FAMILY_LABELS, COLOR_FAMILY_HEX, type PlantColorFamily } from "../../lib/plantTypes";
import type { BedElement, BedLocalCoord } from "../../lib/bedLayoutTypes";
import { getAllPlants, getPlantById } from "../../lib/plantStore";
import {
  generateThemedBed,
  autoFillBed,
  findYearRoundBloomSet,
  filterPlantsByColor,
  getPlantColorFamily,
  getPlantBloomMonths,
  getPlantFlowerHex,
  type GeneratedBedPlan,
} from "../../lib/smartAutoFill";
import { MONTH_NAMES_DA } from "../../lib/seasonColors";

type BedGeneratorDialogProps = {
  bedWidthCm: number;
  bedLengthCm: number;
  outlineCm: BedLocalCoord[];
  existingElements: BedElement[];
  onApply: (elements: BedElement[], description: string) => void;
  onClose: () => void;
  /** If available, use AI chat for natural language parsing */
  onAiGenerate?: (prompt: string) => Promise<PlantSpecies[]>;
};

type PresetTheme = {
  id: string;
  icon: string;
  name: string;
  description: string;
  theme: Parameters<typeof generateThemedBed>[0];
};

const PRESETS: PresetTheme[] = [
  { id: "red", icon: "🔴", name: "Rødt bed", description: "Blomster i røde nuancer hele sæsonen", theme: "red" },
  { id: "purple", icon: "🟣", name: "Lilla bed", description: "Lilla og violet blomsterpragt", theme: "purple" },
  { id: "blue", icon: "🔵", name: "Blåt bed", description: "Blå toner med lavendel, kornblomst m.m.", theme: "blue" },
  { id: "pink", icon: "🩷", name: "Pink/rosa bed", description: "Romantiske rosa nuancer", theme: "pink" },
  { id: "yellow", icon: "🟡", name: "Gult bed", description: "Solskinsgule blomster", theme: "yellow" },
  { id: "orange", icon: "🟠", name: "Orange bed", description: "Varme orange toner", theme: "orange" },
  { id: "white", icon: "⚪", name: "Hvidt bed", description: "Elegant hvid have", theme: "white" },
  { id: "pollinator", icon: "🐝", name: "Bivenlig have", description: "Tiltrækker bier og sommerfugle", theme: "pollinator" },
  { id: "kitchen", icon: "🥗", name: "Køkkenhave året rundt", description: "Høst grøntsager & urter hele året", theme: "kitchen-year-round" },
  { id: "cottage", icon: "🏡", name: "Cottage garden", description: "Klassisk romantisk blanding", theme: "cottage" },
  { id: "shade", icon: "🌤️", name: "Skyggebed", description: "Planter til halvskygge og skygge", theme: "shade" },
  { id: "drought", icon: "🏜️", name: "Tørketolerant", description: "Minimal vanding nødvendig", theme: "drought" },
];

function BedGeneratorDialogInner({
  bedWidthCm,
  bedLengthCm,
  outlineCm,
  existingElements,
  onApply,
  onClose,
}: BedGeneratorDialogProps) {
  const [step, setStep] = useState<"choose" | "preview" | "custom">("choose");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [plan, setPlan] = useState<GeneratedBedPlan | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedSpecies, setSelectedSpecies] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);

  // Generate from preset
  const handlePreset = useCallback((preset: PresetTheme) => {
    setSelectedPreset(preset.id);
    setLoading(true);
    try {
      const result = generateThemedBed(preset.theme, bedWidthCm, bedLengthCm);
      setPlan(result);
      setSelectedSpecies(new Set(result.plants.map((p) => p.species.id)));
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }, [bedWidthCm, bedLengthCm]);

  // Parse natural language custom prompt
  const handleCustomGenerate = useCallback(() => {
    if (!customPrompt.trim()) return;
    setLoading(true);
    try {
      const prompt = customPrompt.toLowerCase();
      const allPlants = getAllPlants();

      // Parse color from prompt
      let colorFamily: PlantColorFamily | null = null;
      const colorKeywords: Record<string, PlantColorFamily> = {
        "rød": "red", "rødt": "red", "røde": "red",
        "orange": "orange",
        "gul": "yellow", "gult": "yellow", "gule": "yellow",
        "pink": "pink", "rosa": "pink", "lyserød": "pink",
        "lilla": "purple", "violet": "purple",
        "blå": "blue", "blåt": "blue", "blåe": "blue",
        "hvid": "white", "hvidt": "white", "hvide": "white",
      };
      for (const [keyword, family] of Object.entries(colorKeywords)) {
        if (prompt.includes(keyword)) { colorFamily = family; break; }
      }

      // Parse year-round requirement
      const wantsYearRound = prompt.includes("hele året") || prompt.includes("året rundt") ||
        prompt.includes("12 måneder") || prompt.includes("altid");

      // Parse categories
      const wantsVegetables = prompt.includes("grøntsag") || prompt.includes("køkken") ||
        prompt.includes("spiselig") || prompt.includes("høst");
      const wantsHerbs = prompt.includes("urt") || prompt.includes("krydder");
      const wantsFlowers = prompt.includes("blomst") || prompt.includes("blom");
      const wantsPollinator = prompt.includes("bi") || prompt.includes("bestøv") ||
        prompt.includes("sommerfugl") || prompt.includes("insekt");

      // Determine theme
      let theme: Parameters<typeof generateThemedBed>[0] | null = null;

      // Color families that map directly to themes
      const colorThemeMap: Record<string, Parameters<typeof generateThemedBed>[0]> = {
        red: "red", orange: "orange", yellow: "yellow", pink: "pink",
        purple: "purple", blue: "blue", white: "white",
      };
      if (colorFamily && colorFamily in colorThemeMap) {
        theme = colorThemeMap[colorFamily];
      } else if (wantsPollinator) {
        theme = "pollinator";
      } else if (wantsVegetables && wantsYearRound) {
        theme = "kitchen-year-round";
      } else if (prompt.includes("cottage") || prompt.includes("romantisk")) {
        theme = "cottage";
      } else if (prompt.includes("skygge")) {
        theme = "shade";
      } else if (prompt.includes("tørke") || prompt.includes("tør")) {
        theme = "drought";
      }

      let result: GeneratedBedPlan;

      if (theme) {
        result = generateThemedBed(theme, bedWidthCm, bedLengthCm);
      } else {
        // Generic filter: combine year-round + category preferences
        let candidates = allPlants;
        if (wantsFlowers) candidates = candidates.filter((p) => p.category === "flower" || p.category === "perennial");
        if (wantsVegetables) candidates = candidates.filter((p) => p.category === "vegetable");
        if (wantsHerbs) candidates = candidates.filter((p) => p.category === "herb");

        let selected: PlantSpecies[];
        if (wantsYearRound) {
          selected = findYearRoundBloomSet(candidates, colorFamily ?? undefined);
        } else {
          // Take a balanced selection (max 8)
          selected = candidates.slice(0, 8);
        }

        result = {
          plants: selected.map((p) => ({
            species: p,
            count: Math.max(1, Math.floor((bedWidthCm * bedLengthCm) / ((p.spacingCm ?? 25) * (p.rowSpacingCm ?? 25)) * 0.7)),
          })),
          description: `🪄 Tilpasset bed baseret på: "${customPrompt}". ` +
            `Inkluderer ${selected.map((p) => `${p.icon ?? "🌱"} ${p.name}`).join(", ")}.`,
          coverageMonths: [],
        };
      }

      // If year-round was requested but we used a color theme, enhance the description
      if (wantsYearRound && colorFamily) {
        result.description = `${result.description} Med fokus på blomstring hele året.`;
      }

      setPlan(result);
      setSelectedSpecies(new Set(result.plants.map((p) => p.species.id)));
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }, [customPrompt, bedWidthCm, bedLengthCm]);

  // Toggle species in/out of selection
  const toggleSpecies = useCallback((id: string) => {
    setSelectedSpecies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Apply selected plants to the bed
  const handleApply = useCallback(() => {
    if (!plan) return;
    const selected = plan.plants
      .filter((p) => selectedSpecies.has(p.species.id))
      .map((p) => p.species);

    const result = autoFillBed(
      selected,
      bedWidthCm,
      bedLengthCm,
      outlineCm,
      replaceExisting ? [] : existingElements,
    );

    setWarnings(result.warnings);
    if (result.elements.length > 0) {
      onApply(result.elements, plan.description);
    }
  }, [plan, selectedSpecies, bedWidthCm, bedLengthCm, outlineCm, existingElements, replaceExisting, onApply]);

  // Coverage visualization
  const coverageMap = useMemo(() => {
    if (!plan) return new Map<number, string[]>();
    const map = new Map<number, string[]>();
    for (const { species } of plan.plants) {
      if (!selectedSpecies.has(species.id)) continue;
      const bloom = getPlantBloomMonths(species);
      if (!bloom) continue;
      const months: number[] = [];
      if (bloom.from <= bloom.to) {
        for (let m = bloom.from; m <= bloom.to; m++) months.push(m);
      } else {
        for (let m = bloom.from; m <= 12; m++) months.push(m);
        for (let m = 1; m <= bloom.to; m++) months.push(m);
      }
      for (const m of months) {
        if (!map.has(m)) map.set(m, []);
        map.get(m)!.push(species.icon ?? "🌱");
      }
    }
    return map;
  }, [plan, selectedSpecies]);

  const bedSizeLabel = `${(bedWidthCm / 100).toFixed(1)}m × ${(bedLengthCm / 100).toFixed(1)}m`;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="w-[560px] max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--foreground)" }}>
              🪄 Bed Generator
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
              Generér et komplet bed automatisk — {bedSizeLabel}
            </p>
          </div>
          <button onClick={onClose} className="text-lg px-2 py-1 rounded hover:bg-[var(--accent-light)] transition-colors"
            style={{ color: "var(--muted)" }}>✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto sidebar-scroll p-5">
          {/* Step 1: Choose */}
          {step === "choose" && (
            <div>
              {/* Custom prompt */}
              <div className="mb-5">
                <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--foreground)" }}>
                  ✨ Beskriv dit drømmebed
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCustomGenerate(); }}
                    placeholder="F.eks. 'Lav et bed i røde nuancer med blomster hele året'"
                    className="flex-1 rounded-lg border px-3 py-2 text-xs"
                    style={{ borderColor: "var(--border)", background: "var(--toolbar-bg)", color: "var(--foreground)" }}
                  />
                  <button
                    onClick={handleCustomGenerate}
                    disabled={!customPrompt.trim() || loading}
                    className="px-4 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {loading ? "⏳" : "🪄 Generér"}
                  </button>
                </div>
                <p className="text-[9px] mt-1" style={{ color: "var(--muted)" }}>
                  Tip: Nævn farve, blomstringssæson, plantetype, eller stil.
                </p>
              </div>

              {/* Quick presets */}
              <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--foreground)" }}>
                🎨 Hurtige temaer
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePreset(preset)}
                    className="flex flex-col items-start p-3 rounded-xl border transition-all hover:shadow-md hover:border-[var(--accent)]"
                    style={{
                      borderColor: selectedPreset === preset.id ? "var(--accent)" : "var(--border)",
                      background: selectedPreset === preset.id ? "var(--accent-light)" : "var(--toolbar-bg)",
                    }}
                  >
                    <span className="text-xl mb-1">{preset.icon}</span>
                    <span className="text-[11px] font-semibold" style={{ color: "var(--foreground)" }}>{preset.name}</span>
                    <span className="text-[9px] leading-tight mt-0.5" style={{ color: "var(--muted)" }}>{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && plan && (
            <div>
              <button onClick={() => { setStep("choose"); setPlan(null); }}
                className="text-[11px] mb-3 flex items-center gap-1 transition-colors hover:text-[var(--accent)]"
                style={{ color: "var(--muted)" }}>
                ← Tilbage til temaer
              </button>

              {/* Description */}
              <div className="p-3 rounded-xl mb-4" style={{ background: "var(--accent-light)" }}>
                <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
                  {plan.description}
                </p>
              </div>

              {/* Bloom coverage calendar */}
              <h4 className="text-xs font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>
                📅 Blomstringsdækning
              </h4>
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const blooming = coverageMap.get(m);
                  return (
                    <div key={m} className="flex-1 text-center">
                      <div className="text-[7px] mb-0.5" style={{ color: "var(--muted)" }}>
                        {MONTH_NAMES_DA[m]?.slice(0, 3) ?? m}
                      </div>
                      <div
                        className="h-6 rounded-sm flex items-center justify-center text-[8px]"
                        style={{
                          background: blooming && blooming.length > 0
                            ? "var(--accent)"
                            : "var(--border)",
                          opacity: blooming && blooming.length > 0 ? 0.8 : 0.3,
                        }}
                      >
                        {blooming && blooming.length > 0 ? blooming[0] : ""}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Plant selection */}
              <h4 className="text-xs font-semibold mb-1.5" style={{ color: "var(--foreground)" }}>
                🌱 Planter ({plan.plants.length} arter)
              </h4>
              <div className="space-y-1 mb-4">
                {plan.plants.map(({ species, count }) => {
                  const isSelected = selectedSpecies.has(species.id);
                  const color = getPlantColorFamily(species);
                  const hex = getPlantFlowerHex(species);
                  const bloom = getPlantBloomMonths(species);

                  return (
                    <div
                      key={species.id}
                      className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all"
                      style={{
                        borderColor: isSelected ? "var(--accent)" : "var(--border)",
                        background: isSelected ? "var(--accent-light)" : "transparent",
                        opacity: isSelected ? 1 : 0.5,
                      }}
                      onClick={() => toggleSpecies(species.id)}
                    >
                      <input type="checkbox" checked={isSelected} readOnly
                        className="accent-[var(--accent)] rounded" />
                      {hex && (
                        <div className="w-4 h-4 rounded-full flex-shrink-0 border"
                          style={{ background: hex, borderColor: "var(--border)" }} />
                      )}
                      <span className="text-sm flex-shrink-0">{species.icon ?? "🌱"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium truncate" style={{ color: "var(--foreground)" }}>
                          {species.name}
                        </div>
                        <div className="text-[9px] flex items-center gap-2" style={{ color: "var(--muted)" }}>
                          {bloom && <span>🌸 {MONTH_NAMES_DA[bloom.from]?.slice(0, 3)}–{MONTH_NAMES_DA[bloom.to]?.slice(0, 3)}</span>}
                          <span>📏 {species.spacingCm ?? "?"}cm</span>
                          <span>×{count}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Replace toggle */}
              <label className="flex items-center gap-2 text-[11px] mb-3 cursor-pointer" style={{ color: "var(--foreground)" }}>
                <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="accent-[var(--accent)]" />
                Erstat eksisterende planter (ellers tilføj oveni)
              </label>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="p-2 rounded-lg mb-3" style={{ background: "#fef2f2", border: "1px solid #fca5a5" }}>
                  {warnings.map((w, i) => (
                    <p key={i} className="text-[10px]" style={{ color: "#b91c1c" }}>{w}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: "var(--border)" }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs border transition-colors hover:bg-[var(--accent-light)]"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
            Annullér
          </button>
          {step === "preview" && plan && (
            <button
              onClick={handleApply}
              disabled={selectedSpecies.size === 0}
              className="px-5 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 shadow-sm"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              🪄 Udfyld bed med {selectedSpecies.size} arter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const BedGeneratorDialog = memo(BedGeneratorDialogInner);
export default BedGeneratorDialog;
