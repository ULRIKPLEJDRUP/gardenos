// ---------------------------------------------------------------------------
// GardenOS – Succession / Rotation View for Design Lab
// ---------------------------------------------------------------------------
// Shows multi-year rotation planning with crop family warnings.
// Helps users plan which plants follow which across growing seasons.
// ---------------------------------------------------------------------------

"use client";

import { memo, useMemo, useState } from "react";
import type { BedElement } from "../../lib/bedLayoutTypes";
import { getPlantById } from "../../lib/plantStore";
import { PLANT_FAMILY_LABELS, type PlantFamily } from "../../lib/plantTypes";

// Family → color mapping for visual distinction
const FAMILY_COLORS: Record<string, string> = {
  solanaceae: "#ef4444",      // Natskyggefamilien → red
  brassicaceae: "#22c55e",    // Korsblomstfamilien → green
  fabaceae: "#a855f7",        // Ærteblomstfamilien → purple
  cucurbitaceae: "#f59e0b",   // Græskarfamilien → amber
  apiaceae: "#06b6d4",        // Skærmplantefamilien → cyan
  asteraceae: "#ec4899",      // Kurvblomstfamilien → pink
  amaryllidaceae: "#8b5cf6",  // Løgfamilien → violet
  poaceae: "#84cc16",         // Græsfamilien → lime
  lamiaceae: "#14b8a6",       // Læbeblomstfamilien → teal
  rosaceae: "#f43f5e",        // Rosenfamilien → rose
};

type SuccessionViewProps = {
  elements: BedElement[];
  featureName: string;
};

type YearPlan = {
  year: number;
  families: { family: PlantFamily; name: string; plants: string[]; color: string }[];
  warnings: string[];
};

function SuccessionViewInner({ elements, featureName }: SuccessionViewProps) {
  const [planYears, setPlanYears] = useState(4);

  // Current species in bed
  const currentSpecies = useMemo(() => {
    const speciesMap = new Map<string, { name: string; icon: string; family: PlantFamily | undefined; rotationYears: number }>();
    for (const el of elements) {
      if (el.type !== "plant" || !el.speciesId || speciesMap.has(el.speciesId)) continue;
      const sp = getPlantById(el.speciesId);
      if (!sp) continue;
      speciesMap.set(el.speciesId, {
        name: sp.name,
        icon: sp.icon ?? "🌱",
        family: sp.family,
        rotationYears: sp.rotationYears ?? 0,
      });
    }
    return speciesMap;
  }, [elements]);

  // Build year plans with rotation warnings
  const yearPlans = useMemo((): YearPlan[] => {
    const plans: YearPlan[] = [];
    const currentYear = new Date().getFullYear();

    // Track which families were planted in which years
    const familyHistory = new Map<string, number[]>();

    for (let yr = 0; yr < planYears; yr++) {
      const warnings: string[] = [];
      const familyGroups = new Map<string, string[]>();

      for (const [, sp] of currentSpecies) {
        const family = sp.family ?? "other";
        if (!familyGroups.has(family)) familyGroups.set(family, []);
        familyGroups.get(family)!.push(`${sp.icon} ${sp.name}`);

        // Check rotation warning for year > 0
        if (yr > 0 && sp.rotationYears > 0) {
          const history = familyHistory.get(family) ?? [];
          const lastPlanted = history.length > 0 ? history[history.length - 1] : -1;
          const yearsSinceLast = yr - lastPlanted;
          if (yearsSinceLast < sp.rotationYears) {
            warnings.push(
              `⚠️ ${sp.icon} ${sp.name} (${PLANT_FAMILY_LABELS[family as PlantFamily] ?? family}): ` +
              `Bør roteres min. ${sp.rotationYears} år. Sidst plantet ${yearsSinceLast === 0 ? "i år" : `for ${yearsSinceLast} år siden`}.`
            );
          }
        }
      }

      // Record this year's families
      for (const family of familyGroups.keys()) {
        if (!familyHistory.has(family)) familyHistory.set(family, []);
        familyHistory.get(family)!.push(yr);
      }

      const families = Array.from(familyGroups.entries()).map(([family, plants]) => ({
        family: family as PlantFamily,
        name: PLANT_FAMILY_LABELS[family as PlantFamily] ?? family,
        plants,
        color: FAMILY_COLORS[family] ?? "#94a3b8",
      }));

      plans.push({
        year: currentYear + yr,
        families,
        warnings,
      });
    }

    return plans;
  }, [currentSpecies, planYears]);

  if (currentSpecies.size === 0) {
    return (
      <div className="p-3 text-center text-xs" style={{ color: "var(--muted)" }}>
        Ingen planter i bedet. Tilføj planter for at se rotationsplan.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
          🔄 Rotationsplan – {featureName}
        </h4>
        <div className="flex items-center gap-1">
          <span className="text-[9px]" style={{ color: "var(--muted)" }}>År:</span>
          {[3, 4, 5, 6].map((y) => (
            <button key={y} onClick={() => setPlanYears(y)}
              className="px-1.5 py-0.5 rounded text-[9px] border transition-colors"
              style={{
                borderColor: planYears === y ? "var(--accent)" : "var(--border)",
                background: planYears === y ? "var(--accent)" : "transparent",
                color: planYears === y ? "#fff" : "var(--foreground)",
              }}
            >{y}</button>
          ))}
        </div>
      </div>

      {/* Year columns */}
      <div className="flex gap-1.5 overflow-x-auto">
        {yearPlans.map((plan, idx) => (
          <div key={plan.year}
            className="flex-1 min-w-[100px] rounded-lg border p-2"
            style={{
              borderColor: idx === 0 ? "var(--accent)" : "var(--border)",
              background: idx === 0 ? "var(--accent-light)" : "var(--toolbar-bg)",
            }}
          >
            <div className="text-[10px] font-bold mb-1.5 text-center" style={{ color: idx === 0 ? "var(--accent)" : "var(--foreground)" }}>
              {idx === 0 ? "📌 " : ""}{plan.year}
            </div>

            {/* Family groups */}
            {plan.families.map(({ family, name, plants, color }) => (
              <div key={family} className="mb-1.5">
                <div className="flex items-center gap-1 mb-0.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[8px] font-medium truncate" style={{ color: "var(--muted)" }}>
                    {name}
                  </span>
                </div>
                {plants.map((p, i) => (
                  <div key={i} className="text-[9px] pl-3 truncate" style={{ color: "var(--foreground)" }}>
                    {p}
                  </div>
                ))}
              </div>
            ))}

            {/* Warnings */}
            {plan.warnings.length > 0 && (
              <div className="mt-1 p-1.5 rounded text-[8px] leading-tight space-y-0.5"
                style={{ background: "#fef2f2", border: "1px solid #fca5a5" }}>
                {plan.warnings.map((w, i) => (
                  <p key={i} style={{ color: "#b91c1c" }}>{w}</p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Rotation rules summary */}
      <div className="p-2 rounded-lg text-[9px] leading-relaxed" style={{ background: "var(--toolbar-bg)", color: "var(--muted)" }}>
        <strong style={{ color: "var(--foreground)" }}>💡 Rotationsregler:</strong>
        <ul className="mt-1 space-y-0.5 list-disc list-inside">
          <li>Natskyggefamilien (tomat, kartoffel, peber): min. 3 år</li>
          <li>Korsblomstfamilien (kål, radise): min. 3 år</li>
          <li>Ærteblomstfamilien (bønner, ærter): min. 2 år</li>
          <li>Græskarfamilien (squash, agurk): min. 3 år</li>
          <li>Løgfamilien (løg, hvidløg, porrer): min. 2 år</li>
        </ul>
        <p className="mt-1">
          Tip: Skift familier mellem sæsoner. Bælgplanter beriger jorden med kvælstof – plant dem før kvælstof-krævende arter.
        </p>
      </div>
    </div>
  );
}

const SuccessionView = memo(SuccessionViewInner);
export default SuccessionView;
