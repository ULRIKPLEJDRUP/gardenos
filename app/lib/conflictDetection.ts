/**
 * conflictDetection.ts — plant conflict detection helpers.
 *
 * Pure functions that detect spacing, companion, layer-competition,
 * and shade conflicts between point features in the garden map.
 *
 * Extracted from GardenMapClient.tsx to keep the monolith manageable.
 */

import type { Feature, Geometry } from "geojson";
import { getPlantById } from "./plantStore";
import type { PlantSpecies, ForestGardenLayer } from "./plantTypes";
import {
  canLayersCoexist,
  estimateHeightM,
  maxAcceptableShadeHours,
  couldCastSignificantShade,
  computeShadeImpact,
  FOREST_GARDEN_LAYER_LABELS,
  GROWING_SEASON_SUN_HOURS,
} from "./plantTypes";

// ---------------------------------------------------------------------------
// Minimal feature type — callers can pass richer types (structural subtyping)
// ---------------------------------------------------------------------------

export type ConflictFeature = Feature<
  Geometry,
  { gardenosId: string; speciesId?: string }
>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlantConflict = {
  type: "spacing" | "bad-companion" | "layer-competition" | "shade";
  /** Severity 1 = info, 2 = warning, 3 = error */
  severity: 1 | 2 | 3;
  featureIdA: string;
  featureIdB: string;
  speciesA: PlantSpecies;
  speciesB: PlantSpecies;
  distanceM: number;
  requiredM: number;
  message: string;
  suggestion: string;
};

export type SpreadSpec = Pick<PlantSpecies, "spreadDiameterCm" | "spacingCm">;

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------

/**
 * Haversine distance between two [lng, lat] points, in metres.
 */
export function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      sinLng *
      sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Bearing in degrees (0=North, clockwise) from point A to point B.
 * Uses [lng, lat] coordinate format.
 */
export function geoBearing(
  a: [number, number],
  b: [number, number],
): number {
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (Math.atan2(x, y) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

// ---------------------------------------------------------------------------
// Spread / canopy helpers
// ---------------------------------------------------------------------------

/** Full spread diameter in metres (fallback 0.30 m). */
export function spreadDiameterM(sp: SpreadSpec): number {
  return (sp.spreadDiameterCm ?? sp.spacingCm ?? 30) / 100;
}

/** Canopy radius in metres (fallback 0.50 m). */
export function canopyRadiusM(sp: SpreadSpec): number {
  return (sp.spreadDiameterCm ?? sp.spacingCm ?? 100) / 200;
}

/**
 * Estimate trunk-only exclusion radius in meters for a species.
 * Used when two plants occupy compatible forest-garden layers: you can plant
 * ground-cover UNDER a tree canopy, but not literally on top of the trunk.
 */
export function getTrunkExclusionRadiusM(sp: {
  spreadDiameterCm?: number;
  spacingCm?: number;
  forestGardenLayer?: ForestGardenLayer;
  category?: string;
}): number {
  const spreadCm = sp.spreadDiameterCm ?? sp.spacingCm ?? 30;
  const layer = sp.forestGardenLayer;
  const cat = sp.category;

  if (layer === "canopy" || cat === "tree") {
    // Large tree trunk ≈ 5 % of canopy diameter, minimum 25 cm radius
    return Math.max(0.25, (spreadCm * 0.05) / 100);
  }
  if (layer === "sub-canopy") {
    return Math.max(0.2, (spreadCm * 0.06) / 100);
  }
  if (layer === "shrub" || cat === "bush") {
    // Shrub stem zone ≈ 15 % of spread diameter, minimum 10 cm
    return Math.max(0.1, (spreadCm * 0.15) / 100);
  }
  // Default: use full radius (no meaningful trunk/canopy distinction)
  return Math.max(0.15, spreadCm / 200);
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

/**
 * Detect all pairwise plant conflicts among point features.
 * Returns an array of PlantConflict objects.
 */
export function detectPlantConflicts(
  features: ConflictFeature[],
): PlantConflict[] {
  // Collect point features with a species
  const points: {
    id: string;
    coords: [number, number];
    species: PlantSpecies;
  }[] = [];
  for (const f of features) {
    if (f.geometry?.type !== "Point") continue;
    const sid = f.properties?.speciesId;
    if (!sid) continue;
    const sp = getPlantById(sid);
    if (!sp) continue;
    const coords = f.geometry.coordinates as [number, number];
    points.push({ id: f.properties!.gardenosId, coords, species: sp });
  }

  const conflicts: PlantConflict[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const dist = haversineM(a.coords, b.coords);
      const pairKey = [a.id, b.id].sort().join(":");

      // 1. Spacing conflict: check recommended spacing between both species
      const spreadA = spreadDiameterM(a.species);
      const spreadB = spreadDiameterM(b.species);
      // Required distance = half spread A + half spread B (canopy edges shouldn't overlap for competing layers)
      let requiredM: number;
      const layerA = a.species.forestGardenLayer;
      const layerB = b.species.forestGardenLayer;
      const layersCoexist =
        layerA && layerB && canLayersCoexist(layerA, layerB);

      if (layersCoexist) {
        // Compatible layers: only need trunk clearance
        const trunkA = getTrunkExclusionRadiusM(a.species);
        const trunkB = getTrunkExclusionRadiusM(b.species);
        requiredM = trunkA + trunkB;
      } else {
        // Same or competing layers: need full spacing
        requiredM = spreadA / 2 + spreadB / 2;
      }

      if (
        dist < requiredM * 0.95 &&
        !seen.has(pairKey + ":spacing")
      ) {
        seen.add(pairKey + ":spacing");
        const isSameSpecies = a.species.id === b.species.id;
        const ratio = dist / requiredM;
        const severity: 1 | 2 | 3 =
          ratio < 0.4 ? 3 : ratio < 0.7 ? 2 : 1;
        conflicts.push({
          type: "spacing",
          severity,
          featureIdA: a.id,
          featureIdB: b.id,
          speciesA: a.species,
          speciesB: b.species,
          distanceM: dist,
          requiredM,
          message: isSameSpecies
            ? `${a.species.icon ?? "🌱"} To ${a.species.name} står for tæt (${dist.toFixed(1)}m / anbefalet ${requiredM.toFixed(1)}m)`
            : `${a.species.icon ?? "🌱"} ${a.species.name} og ${b.species.icon ?? "🌱"} ${b.species.name} står for tæt (${dist.toFixed(1)}m / ${requiredM.toFixed(1)}m)`,
          suggestion: isSameSpecies
            ? `Anbefalet afstand for ${a.species.name}: ${requiredM.toFixed(1)}m. Flyt den ene, eller planlæg at fælde/flytte den når de vokser sig store.`
            : `Flyt den ene plante mindst ${(requiredM - dist).toFixed(1)}m længere væk.`,
        });
      }

      // 2. Bad companion conflict
      const isBadCompanion =
        a.species.badCompanions?.includes(b.species.id) ||
        b.species.badCompanions?.includes(a.species.id);
      if (isBadCompanion && !seen.has(pairKey + ":companion")) {
        seen.add(pairKey + ":companion");
        // Only flag if they're within a reasonable "influence" distance (e.g. max of both spreads * 1.5)
        const influenceM = Math.max(spreadA, spreadB) * 1.5;
        if (dist < influenceM) {
          conflicts.push({
            type: "bad-companion",
            severity: 2,
            featureIdA: a.id,
            featureIdB: b.id,
            speciesA: a.species,
            speciesB: b.species,
            distanceM: dist,
            requiredM: influenceM,
            message: `⛔ ${a.species.icon ?? "🌱"} ${a.species.name} og ${b.species.icon ?? "🌱"} ${b.species.name} trives ikke sammen`,
            suggestion: `Disse planter hæmmer hinanden. Flyt dem til forskellige bede eller placer dem mindst ${influenceM.toFixed(1)}m fra hinanden.`,
          });
        }
      }

      // 3. Layer competition (same layer, different species, close proximity)
      if (
        layerA &&
        layerB &&
        layerA === layerB &&
        a.species.id !== b.species.id
      ) {
        // They compete at the same vertical layer
        const competitionDist = (spreadA / 2 + spreadB / 2) * 0.8;
        if (
          dist < competitionDist &&
          !seen.has(pairKey + ":layer")
        ) {
          seen.add(pairKey + ":layer");
          conflicts.push({
            type: "layer-competition",
            severity: 1,
            featureIdA: a.id,
            featureIdB: b.id,
            speciesA: a.species,
            speciesB: b.species,
            distanceM: dist,
            requiredM: competitionDist,
            message: `⚠️ ${a.species.icon ?? "🌱"} ${a.species.name} og ${b.species.icon ?? "🌱"} ${b.species.name} konkurrerer i samme lag (${FOREST_GARDEN_LAYER_LABELS[layerA]})`,
            suggestion: `Begge er i ${FOREST_GARDEN_LAYER_LABELS[layerA]}-laget. Den ene vil sandsynligvis dominere. Overvej at flytte den ene eller vælge en art i et andet lag.`,
          });
        }
      }

      // 4. Shade conflict: does a tall tree/bush cast significant shadow
      //    on a sun-loving plant? Check both directions (a shades b, b shades a).
      if (!seen.has(pairKey + ":shade")) {
        const heightA = estimateHeightM(a.species);
        const heightB = estimateHeightM(b.species);
        const latitude = a.coords[1]; // lat from coordinates

        // Check if A casts shade on B (threshold 1m: bushes at 1.2-1.5m can shade low crops)
        if (
          heightA &&
          heightA >= 1 &&
          couldCastSignificantShade(heightA, dist, latitude)
        ) {
          const maxShadeB = maxAcceptableShadeHours(b.species.light);
          if (maxShadeB < 900) {
            // skip shade-tolerant plants
            const canopyRadA = canopyRadiusM(a.species);
            const bearingAtoB = geoBearing(a.coords, b.coords);
            const shade = computeShadeImpact(
              heightA,
              canopyRadA,
              dist,
              bearingAtoB,
              latitude,
            );
            if (shade.avgShadeHoursPerDay > maxShadeB) {
              seen.add(pairKey + ":shade");
              const excess = shade.avgShadeHoursPerDay - maxShadeB;
              const severity: 1 | 2 | 3 =
                excess > 4 ? 3 : excess > 2 ? 2 : 1;
              const lightLabel =
                b.species.light === "full-sun"
                  ? "fuld sol"
                  : b.species.light === "partial-shade"
                    ? "halvskygge"
                    : "sol";
              const effectiveSun =
                GROWING_SEASON_SUN_HOURS - shade.avgShadeHoursPerDay;
              conflicts.push({
                type: "shade",
                severity,
                featureIdA: a.id,
                featureIdB: b.id,
                speciesA: a.species,
                speciesB: b.species,
                distanceM: dist,
                requiredM: heightA * 2.5,
                message: `☀️ ${a.species.icon ?? "🌳"} ${a.species.name} (${heightA}m) skygger for ${b.species.icon ?? "🌱"} ${b.species.name} ~${shade.avgShadeHoursPerDay.toFixed(1)} timer/dag i vækstsæsonen`,
                suggestion: `${b.species.name} kræver ${lightLabel} (maks ${maxShadeB}t skygge/dag). Skyggen fra ${a.species.name} giver ~${shade.avgShadeHoursPerDay.toFixed(1)}t skygge, sol reduceres til ~${effectiveSun.toFixed(0)}t. Flyt planten mod syd/vest eller vælg en skyggetolerant art.`,
              });
            }
          }
        }

        // Check if B casts shade on A
        if (
          !seen.has(pairKey + ":shade") &&
          heightB &&
          heightB >= 1 &&
          couldCastSignificantShade(heightB, dist, latitude)
        ) {
          const maxShadeA = maxAcceptableShadeHours(a.species.light);
          if (maxShadeA < 900) {
            const canopyRadB = canopyRadiusM(b.species);
            const bearingBtoA = geoBearing(b.coords, a.coords);
            const shade = computeShadeImpact(
              heightB,
              canopyRadB,
              dist,
              bearingBtoA,
              latitude,
            );
            if (shade.avgShadeHoursPerDay > maxShadeA) {
              seen.add(pairKey + ":shade");
              const excess = shade.avgShadeHoursPerDay - maxShadeA;
              const severity: 1 | 2 | 3 =
                excess > 4 ? 3 : excess > 2 ? 2 : 1;
              const lightLabel =
                a.species.light === "full-sun"
                  ? "fuld sol"
                  : a.species.light === "partial-shade"
                    ? "halvskygge"
                    : "sol";
              const effectiveSun =
                GROWING_SEASON_SUN_HOURS - shade.avgShadeHoursPerDay;
              conflicts.push({
                type: "shade",
                severity,
                featureIdA: b.id,
                featureIdB: a.id,
                speciesA: b.species,
                speciesB: a.species,
                distanceM: dist,
                requiredM: heightB * 2.5,
                message: `☀️ ${b.species.icon ?? "🌳"} ${b.species.name} (${heightB}m) skygger for ${a.species.icon ?? "🌱"} ${a.species.name} ~${shade.avgShadeHoursPerDay.toFixed(1)} timer/dag i vækstsæsonen`,
                suggestion: `${a.species.name} kræver ${lightLabel} (maks ${maxShadeA}t skygge/dag). Skyggen fra ${b.species.name} giver ~${shade.avgShadeHoursPerDay.toFixed(1)}t skygge, sol reduceres til ~${effectiveSun.toFixed(0)}t. Flyt planten mod syd/vest eller vælg en skyggetolerant art.`,
              });
            }
          }
        }
      }
    }
  }

  return conflicts;
}

/**
 * Check if a PROPOSED placement at [lng, lat] for a species would cause conflicts.
 * Returns conflicts (preview, no featureIdA).
 */
export function checkPlacementConflicts(
  proposedCoords: [number, number],
  proposedSpecies: PlantSpecies,
  existingFeatures: ConflictFeature[],
): PlantConflict[] {
  const conflicts: PlantConflict[] = [];
  const spreadNew = spreadDiameterM(proposedSpecies);
  const layerNew = proposedSpecies.forestGardenLayer;

  for (const f of existingFeatures) {
    if (f.geometry?.type !== "Point") continue;
    const sid = f.properties?.speciesId;
    if (!sid) continue;
    const sp = getPlantById(sid);
    if (!sp) continue;
    const coords = f.geometry.coordinates as [number, number];
    const dist = haversineM(proposedCoords, coords);

    const spreadOther = spreadDiameterM(sp);
    const layerOther = sp.forestGardenLayer;
    const layersCoexist =
      layerNew && layerOther && canLayersCoexist(layerNew, layerOther);

    // Spacing check
    let requiredM: number;
    if (layersCoexist) {
      const trunkNew = getTrunkExclusionRadiusM(proposedSpecies);
      const trunkOther = getTrunkExclusionRadiusM(sp);
      requiredM = trunkNew + trunkOther;
    } else {
      requiredM = spreadNew / 2 + spreadOther / 2;
    }

    if (dist < requiredM * 0.95) {
      const ratio = dist / requiredM;
      conflicts.push({
        type: "spacing",
        severity: ratio < 0.4 ? 3 : ratio < 0.7 ? 2 : 1,
        featureIdA: "__proposed__",
        featureIdB: f.properties!.gardenosId,
        speciesA: proposedSpecies,
        speciesB: sp,
        distanceM: dist,
        requiredM,
        message: `For tæt på ${sp.icon ?? "🌱"} ${sp.name} (${dist.toFixed(1)}m / ${requiredM.toFixed(1)}m)`,
        suggestion: `Anbefalet afstand: ${requiredM.toFixed(1)}m`,
      });
    }

    // Bad companion
    if (
      proposedSpecies.badCompanions?.includes(sp.id) ||
      sp.badCompanions?.includes(proposedSpecies.id)
    ) {
      const influenceM = Math.max(spreadNew, spreadOther) * 1.5;
      if (dist < influenceM) {
        conflicts.push({
          type: "bad-companion",
          severity: 2,
          featureIdA: "__proposed__",
          featureIdB: f.properties!.gardenosId,
          speciesA: proposedSpecies,
          speciesB: sp,
          distanceM: dist,
          requiredM: influenceM,
          message: `⛔ Dårlig nabo: ${sp.icon ?? "🌱"} ${sp.name}`,
          suggestion: `Disse arter hæmmer hinanden.`,
        });
      }
    }

    // Shade: does the existing tree shade the proposed plant, or vice versa?
    const latitude = proposedCoords[1];
    const heightOther = estimateHeightM(sp);
    const heightNew = estimateHeightM(proposedSpecies);

    // Existing tree/bush shading proposed plant
    if (
      heightOther &&
      heightOther >= 1 &&
      couldCastSignificantShade(heightOther, dist, latitude)
    ) {
      const maxShadeNew = maxAcceptableShadeHours(proposedSpecies.light);
      if (maxShadeNew < 900) {
        const canopyRadOther = canopyRadiusM(sp);
        const bearing = geoBearing(coords, proposedCoords);
        const shade = computeShadeImpact(
          heightOther,
          canopyRadOther,
          dist,
          bearing,
          latitude,
        );
        if (shade.avgShadeHoursPerDay > maxShadeNew) {
          const excess = shade.avgShadeHoursPerDay - maxShadeNew;
          conflicts.push({
            type: "shade",
            severity: excess > 4 ? 3 : excess > 2 ? 2 : 1,
            featureIdA: "__proposed__",
            featureIdB: f.properties!.gardenosId,
            speciesA: proposedSpecies,
            speciesB: sp,
            distanceM: dist,
            requiredM: heightOther * 2.5,
            message: `☀️ I skygge fra ${sp.icon ?? "🌳"} ${sp.name} (~${shade.avgShadeHoursPerDay.toFixed(1)}t/dag)`,
            suggestion: `Planten tåler maks ${maxShadeNew}t skygge/dag. Flyt mod syd/vest.`,
          });
        }
      }
    }

    // Proposed tree/bush shading existing plant
    if (
      heightNew &&
      heightNew >= 1 &&
      couldCastSignificantShade(heightNew, dist, latitude)
    ) {
      const maxShadeOther = maxAcceptableShadeHours(sp.light);
      if (maxShadeOther < 900) {
        const canopyRadNew = canopyRadiusM(proposedSpecies);
        const bearing = geoBearing(proposedCoords, coords);
        const shade = computeShadeImpact(
          heightNew,
          canopyRadNew,
          dist,
          bearing,
          latitude,
        );
        if (shade.avgShadeHoursPerDay > maxShadeOther) {
          const excess = shade.avgShadeHoursPerDay - maxShadeOther;
          conflicts.push({
            type: "shade",
            severity: excess > 4 ? 3 : excess > 2 ? 2 : 1,
            featureIdA: "__proposed__",
            featureIdB: f.properties!.gardenosId,
            speciesA: proposedSpecies,
            speciesB: sp,
            distanceM: dist,
            requiredM: heightNew * 2.5,
            message: `☀️ Vil skygge for ${sp.icon ?? "🌱"} ${sp.name} (~${shade.avgShadeHoursPerDay.toFixed(1)}t/dag)`,
            suggestion: `${sp.name} tåler maks ${maxShadeOther}t skygge/dag.`,
          });
        }
      }
    }
  }

  return conflicts;
}
