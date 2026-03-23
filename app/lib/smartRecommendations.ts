// ---------------------------------------------------------------------------
// GardenOS – Smart Plant Recommendations (Phase 5 · Feature 6)
// ---------------------------------------------------------------------------
// Extends the base recommendation engine with context-aware scoring:
//  • Soil pH + drainage matching
//  • Sun exposure matching (estimated vs required)
//  • Seasonal timing (sow/plant-now windows)
//  • Frost tolerance vs current weather
// ---------------------------------------------------------------------------

import type { PlantSpecies, LightNeed } from "./plantTypes";
import type { SoilProfile } from "./soilTypes";
import type { RecommendationReason, ScoredRecommendation } from "./plantStore";
import { getPlantRecommendations, getAllPlants } from "./plantStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SmartContext = {
  /** Existing species IDs in the bed */
  existingSpeciesIds: string[];
  /** Soil profile assigned to the bed (if any) */
  soil: SoilProfile | null;
  /** Estimated sun-hours at the bed center (from sunAnalysis) */
  sunHours: number | null;
  /** Current month 1-12 */
  currentMonth: number;
  /** Current outdoor temperature °C */
  currentTempC: number | null;
  /** Has frost risk? (temp < 3°C in next 7 days) */
  frostRisk: boolean;
};

export type SmartStrategy =
  | "companion"
  | "biodiversity"
  | "nutrition"
  | "color"
  | "forest-layer"
  | "soil-match"
  | "sun-match"
  | "season-timing"
  | "frost-safe";

export const SMART_STRATEGY_CONFIG: Record<
  SmartStrategy,
  { emoji: string; label: string; description: string }
> = {
  companion:      { emoji: "🤝", label: "Samdyrkning",    description: "Gode og dårlige naboer" },
  biodiversity:   { emoji: "🌍", label: "Biodiversitet",  description: "Nye familier og kategorier" },
  nutrition:      { emoji: "🧪", label: "Næring",         description: "Jordforbedring og kvælstof" },
  color:          { emoji: "🌸", label: "Bestøvere",      description: "Blomster og bestøvervenlige" },
  "forest-layer": { emoji: "🌳", label: "Skovhavelag",    description: "Kompatible vertikale lag" },
  "soil-match":   { emoji: "🪨", label: "Jordmatch",      description: "Passer til din jordprofil" },
  "sun-match":    { emoji: "☀️", label: "Solmatch",       description: "Passer til solforhold" },
  "season-timing":{ emoji: "📅", label: "Sæsontiming",    description: "Kan sås/plantes nu" },
  "frost-safe":   { emoji: "❄️", label: "Frostsikker",    description: "Tåler nuværende temperatur" },
};

// ---------------------------------------------------------------------------
// Light-need → required sun hours mapping
// ---------------------------------------------------------------------------

function lightNeedToHours(light?: LightNeed): { min: number; max: number } | null {
  if (!light) return null;
  switch (light) {
    case "full-sun":      return { min: 6, max: 99 };
    case "partial-shade": return { min: 3, max: 7 };
    case "shade":         return { min: 0, max: 4 };
    default:              return null;
  }
}

// ---------------------------------------------------------------------------
// Smart scoring helpers
// ---------------------------------------------------------------------------

function scoreSoilMatch(species: PlantSpecies, soil: SoilProfile | null): RecommendationReason[] {
  if (!soil) return [];
  const reasons: RecommendationReason[] = [];

  // pH matching
  if (species.phRange && soil.phMeasured != null) {
    const { min, max } = species.phRange;
    const ph = soil.phMeasured;
    if (ph >= min && ph <= max) {
      reasons.push({ emoji: "🪨", text: `pH ${ph.toFixed(1)} passer perfekt (${min}–${max})`, score: 3 });
    } else if (ph >= min - 0.5 && ph <= max + 0.5) {
      reasons.push({ emoji: "🪨", text: `pH ${ph.toFixed(1)} næsten optimalt (${min}–${max})`, score: 1 });
    } else {
      reasons.push({ emoji: "⚠️", text: `pH ${ph.toFixed(1)} udenfor range (${min}–${max})`, score: -3 });
    }
  }

  // Drainage matching
  if (species.water && soil.drainage) {
    const drainMap: Record<string, string[]> = {
      "very-low":  ["heavy-feeder"],
      "low":       ["heavy-feeder", "moderate"],
      "moderate":  ["moderate", "light"],
      "high":      ["light", "drought-tolerant"],
      "very-high": ["drought-tolerant"],
    };
    const goodWaters = drainMap[soil.drainage] ?? [];
    if (goodWaters.includes(species.water)) {
      reasons.push({ emoji: "💧", text: `Vandbehov passer til jordens dræning`, score: 2 });
    }
  }

  // Soil type matching
  if (species.soil && species.soil.length > 0 && soil.baseType) {
    const baseMap: Record<string, string[]> = {
      sand:  ["sandy", "light"],
      clay:  ["clay", "heavy"],
      loam:  ["loam", "rich"],
      peat:  ["peaty", "acidic"],
      chalk: ["chalky", "alkaline"],
      mixed: ["loam", "rich"],
    };
    const matchTypes = baseMap[soil.baseType] ?? [];
    if (species.soil.some((s) => matchTypes.includes(s))) {
      reasons.push({ emoji: "🏔️", text: `Trives i ${soil.baseType}-jord`, score: 2 });
    }
  }

  return reasons;
}

function scoreSunMatch(species: PlantSpecies, sunHours: number | null): RecommendationReason[] {
  if (sunHours == null) return [];
  const range = lightNeedToHours(species.light);
  if (!range) return [];

  if (sunHours >= range.min && sunHours <= range.max) {
    return [{ emoji: "☀️", text: `Solbehov matcher (${sunHours.toFixed(0)}t sol)`, score: 3 }];
  } else if (sunHours < range.min) {
    const deficit = range.min - sunHours;
    return [{ emoji: "☁️", text: `For lidt sol (${sunHours.toFixed(0)}t, behøver ${range.min}t+)`, score: deficit > 2 ? -4 : -2 }];
  } else {
    // Too much sun for a shade plant (mild penalty)
    return [{ emoji: "🔆", text: `Meget sol (${sunHours.toFixed(0)}t) for skyggeelskende`, score: -1 }];
  }
}

function scoreSeasonTiming(species: PlantSpecies, month: number): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];

  // Check if can sow indoors now
  if (species.sowIndoor) {
    const { from, to } = species.sowIndoor;
    if (isInMonthRange(month, from, to)) {
      reasons.push({ emoji: "🏠", text: `Kan sås indendørs nu (måned ${month})`, score: 3 });
    }
  }

  // Check if can sow outdoors now
  if (species.sowOutdoor) {
    const { from, to } = species.sowOutdoor;
    if (isInMonthRange(month, from, to)) {
      reasons.push({ emoji: "🌱", text: `Kan sås udendørs nu`, score: 4 });
    }
  }

  // Check if can plant out now
  if (species.plantOut) {
    const { from, to } = species.plantOut;
    if (isInMonthRange(month, from, to)) {
      reasons.push({ emoji: "🪴", text: `Kan plantes ud nu`, score: 4 });
    }
  }

  // Upcoming harvest (motivating factor)
  if (species.harvest) {
    const { from, to } = species.harvest;
    if (isInMonthRange(month, from, to)) {
      reasons.push({ emoji: "🧺", text: `Høstsæson lige nu`, score: 1 });
    }
  }

  return reasons;
}

function scoreFrostSafe(species: PlantSpecies, tempC: number | null, frostRisk: boolean): RecommendationReason[] {
  if (tempC == null) return [];

  if (frostRisk) {
    if (species.frostHardy) {
      return [{ emoji: "❄️", text: "Frosttolerant – sikkert valg nu", score: 3 }];
    }
    return [{ emoji: "🥶", text: "Frostfølsom – risikabelt at plante nu", score: -3 }];
  }

  // Hot weather
  if (tempC > 28 && species.seasonType === "cool") {
    return [{ emoji: "🌡️", text: "Kuldekrævende – for varmt nu", score: -2 }];
  }

  return [];
}

function isInMonthRange(month: number, start: number, end: number): boolean {
  if (start <= end) return month >= start && month <= end;
  // Wraps around year boundary (e.g. start=10, end=2)
  return month >= start || month <= end;
}

// ---------------------------------------------------------------------------
// Main function: getSmartRecommendations
// ---------------------------------------------------------------------------

/**
 * Enhanced recommendations that merge the base scoring system
 * with context-aware scores for soil, sun, season, and frost.
 */
export function getSmartRecommendations(
  ctx: SmartContext,
  strategies: SmartStrategy[],
  maxResults = 15,
): ScoredRecommendation[] {
  // Separate base strategies from smart strategies
  const baseStrategyNames = ["companion", "biodiversity", "nutrition", "color", "forest-layer"] as const;
  type BaseStrategy = (typeof baseStrategyNames)[number];
  const baseStrategies = strategies.filter((s): s is BaseStrategy =>
    (baseStrategyNames as readonly string[]).includes(s),
  );
  const smartStrategies = strategies.filter(
    (s) => !(baseStrategyNames as readonly string[]).includes(s),
  );

  // Get base recommendations (will include all plants, not just existing)
  const baseResults = baseStrategies.length > 0
    ? getPlantRecommendations(ctx.existingSpeciesIds, baseStrategies, undefined, 200)
    : [];

  // Build a map from species id → base result
  const resultMap = new Map<string, ScoredRecommendation>();
  for (const r of baseResults) {
    resultMap.set(r.species.id, { ...r });
  }

  // If we have smart strategies, score ALL plants (not just base results)
  if (smartStrategies.length > 0) {
    const allPlants = getAllPlants();
    const existingSet = new Set(ctx.existingSpeciesIds);

    for (const candidate of allPlants) {
      if (existingSet.has(candidate.id)) continue;
      if (!candidate.family || !candidate.category) continue;

      let entry = resultMap.get(candidate.id);
      if (!entry) {
        entry = { species: candidate, totalScore: 0, reasons: [] };
        resultMap.set(candidate.id, entry);
      }

      // Apply smart scoring
      if (smartStrategies.includes("soil-match")) {
        for (const r of scoreSoilMatch(candidate, ctx.soil)) {
          entry.reasons.push(r);
          entry.totalScore += r.score;
        }
      }
      if (smartStrategies.includes("sun-match")) {
        for (const r of scoreSunMatch(candidate, ctx.sunHours)) {
          entry.reasons.push(r);
          entry.totalScore += r.score;
        }
      }
      if (smartStrategies.includes("season-timing")) {
        for (const r of scoreSeasonTiming(candidate, ctx.currentMonth)) {
          entry.reasons.push(r);
          entry.totalScore += r.score;
        }
      }
      if (smartStrategies.includes("frost-safe")) {
        for (const r of scoreFrostSafe(candidate, ctx.currentTempC, ctx.frostRisk)) {
          entry.reasons.push(r);
          entry.totalScore += r.score;
        }
      }
    }
  }

  // Sort and return
  return Array.from(resultMap.values())
    .filter((r) => r.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, maxResults);
}

// ---------------------------------------------------------------------------
// Month name helper
// ---------------------------------------------------------------------------

const MONTH_NAMES_DA = [
  "", "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

export function monthNameDa(m: number): string {
  return MONTH_NAMES_DA[m] ?? `M${m}`;
}
