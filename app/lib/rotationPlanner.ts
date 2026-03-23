/**
 * rotationPlanner.ts – Multi-Year Crop Rotation Planner for GardenOS
 *
 * Builds a per-bed × per-year matrix showing what plant families
 * were grown, highlights rotation conflicts, and suggests
 * ideal crop families for upcoming seasons.
 */

import { getPlantById, getInstancesForFeature } from "./plantStore";
import { loadPlantInstances } from "./plantStore";
import type { PlantSpecies, PlantInstance, PlantFamily } from "./plantTypes";
import { PLANT_FAMILY_LABELS } from "./plantTypes";
import type { FeatureCollection, Geometry, Feature } from "geojson";

/* ─────────── Types ─────────── */

export interface RotationBed {
  featureId: string;
  bedName: string;
}

export interface RotationCell {
  season: number;
  families: PlantFamily[];
  speciesNames: string[];
  /** Rotation warnings: family was planted too recently */
  warnings: string[];
}

export interface RotationRow {
  bed: RotationBed;
  cells: RotationCell[]; // one per season in the range
}

export interface RotationPlan {
  seasons: number[];  // e.g. [2022, 2023, 2024, 2025, 2026]
  rows: RotationRow[];
  /** Per-bed suggestion for next season */
  suggestions: Record<string, { avoid: PlantFamily[]; suggest: PlantFamily[] }>;
}

/* ─────────── Family colours (for display) ─────────── */

const FAMILY_COLORS: Partial<Record<PlantFamily, string>> = {
  solanaceae: "#ef4444",   // red
  cucurbitaceae: "#f59e0b", // amber
  brassicaceae: "#10b981", // green
  fabaceae: "#3b82f6",     // blue
  apiaceae: "#8b5cf6",     // purple
  amaryllidaceae: "#ec4899",    // pink
  asteraceae: "#f97316",   // orange
  poaceae: "#84cc16",      // lime
  amaranthaceae: "#06b6d4", // cyan
  rosaceae: "#e11d48",     // rose
  lamiaceae: "#6366f1",    // indigo
};

export function getFamilyColor(family: PlantFamily): string {
  return FAMILY_COLORS[family] || "#94a3b8"; // slate fallback
}

export function getFamilyLabel(family: PlantFamily): string {
  return PLANT_FAMILY_LABELS[family] || family;
}

/* ─────────── Build rotation plan ─────────── */

export function buildRotationPlan(
  layout: FeatureCollection<Geometry>,
  seasonRange: [number, number], // [startYear, endYear]
): RotationPlan {
  const [startSeason, endSeason] = seasonRange;
  const seasons: number[] = [];
  for (let y = startSeason; y <= endSeason; y++) seasons.push(y);

  const allInstances = loadPlantInstances();

  // Extract beds from layout
  const beds: RotationBed[] = [];
  if (layout?.features) {
    for (const f of layout.features) {
      const props = (f as Feature<Geometry>).properties as Record<string, unknown> | null;
      if (!props?.gardenosId) continue;
      const category = props.category as string | undefined;
      const kind = props.kind as string | undefined;
      // Only include bed-like features
      if (
        category === "element" ||
        category === "row" ||
        category === "seedbed" ||
        category === "container" ||
        kind === "bed" ||
        kind === "raised-bed" ||
        kind === "row"
      ) {
        beds.push({
          featureId: props.gardenosId as string,
          bedName: (props.name as string) || kind || "Bed",
        });
      }
    }
  }

  const suggestions: Record<string, { avoid: PlantFamily[]; suggest: PlantFamily[] }> = {};

  const rows: RotationRow[] = beds.map((bed) => {
    const bedInstances = allInstances.filter((i) => i.featureId === bed.featureId);
    const recentFamilies = new Map<PlantFamily, number>(); // family → most recent season

    const cells: RotationCell[] = seasons.map((season) => {
      const seasonInstances = bedInstances.filter((i) => (i.season ?? 0) === season);
      const families: PlantFamily[] = [];
      const speciesNames: string[] = [];
      const warnings: string[] = [];

      for (const inst of seasonInstances) {
        const sp = getPlantById(inst.speciesId);
        if (!sp) continue;
        speciesNames.push(sp.name);
        if (sp.family && !families.includes(sp.family)) {
          families.push(sp.family);
        }

        // Check rotation
        if (sp.family && sp.rotationYears) {
          const lastSeason = recentFamilies.get(sp.family);
          if (lastSeason !== undefined) {
            const gap = season - lastSeason;
            if (gap > 0 && gap < sp.rotationYears) {
              warnings.push(
                `⚠️ ${getFamilyLabel(sp.family)} dyrket for ${gap} år siden (kræver ${sp.rotationYears} års pause)`,
              );
            }
          }
        }
      }

      // Track most recent season for each family
      for (const fam of families) {
        const prev = recentFamilies.get(fam);
        if (prev === undefined || season > prev) {
          recentFamilies.set(fam, season);
        }
      }

      return { season, families, speciesNames, warnings };
    });

    // Build suggestions for next season
    const nextSeason = endSeason + 1;
    const avoid: PlantFamily[] = [];
    const suggest: PlantFamily[] = [];

    for (const [fam, lastSeason] of recentFamilies) {
      const sp = allInstances
        .filter((i) => i.featureId === bed.featureId)
        .map((i) => getPlantById(i.speciesId))
        .find((s) => s?.family === fam);
      const rotationYears = sp?.rotationYears ?? 3;
      const gap = nextSeason - lastSeason;
      if (gap < rotationYears) {
        avoid.push(fam);
      }
    }

    // Suggest families NOT recently used
    const allFamiliesUsed = new Set(recentFamilies.keys());
    const commonRotationFamilies: PlantFamily[] = [
      "solanaceae", "cucurbitaceae", "brassicaceae", "fabaceae", "apiaceae", "amaryllidaceae",
    ];
    for (const fam of commonRotationFamilies) {
      if (!allFamiliesUsed.has(fam)) {
        suggest.push(fam);
      }
    }

    suggestions[bed.featureId] = { avoid, suggest };

    return { bed, cells };
  });

  return { seasons, rows, suggestions };
}

/* ─────────── Current season helper ─────────── */

export function getCurrentSeason(): number {
  return new Date().getFullYear();
}
