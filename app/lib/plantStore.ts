// ---------------------------------------------------------------------------
// GardenOS – Plant Store (localStorage persistence)
// ---------------------------------------------------------------------------
// Manages: custom plant species + plant instances in beds
// ---------------------------------------------------------------------------

import { BUILTIN_PLANTS } from "./plantData";
import type { PlantInstance, PlantSpecies, PlantVariety, PlantCategory, PlantFamily, ForestGardenLayer } from "./plantTypes";
import { canLayersCoexist, FOREST_GARDEN_LAYER_LABELS, PLANT_FAMILY_LABELS, PLANT_CATEGORY_LABELS } from "./plantTypes";
import { userKey, markDirty } from "./userStorage";

const STORAGE_CUSTOM_PLANTS_KEY = "gardenos:plants:custom:v1";
const STORAGE_PLANT_INSTANCES_KEY = "gardenos:plants:instances:v1";

// ---------------------------------------------------------------------------
// Custom plant species
// ---------------------------------------------------------------------------

export function loadCustomPlants(): PlantSpecies[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(userKey(STORAGE_CUSTOM_PLANTS_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPlants(plants: PlantSpecies[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_CUSTOM_PLANTS_KEY), JSON.stringify(plants));
  markDirty(STORAGE_CUSTOM_PLANTS_KEY);
}

/** All plants = builtin + custom. Custom can override builtin by same id. */
export function getAllPlants(): PlantSpecies[] {
  const custom = loadCustomPlants();
  const customIds = new Set(custom.map((p) => p.id));
  const builtin = BUILTIN_PLANTS.filter((p) => !customIds.has(p.id));
  return [...builtin, ...custom];
}

export function getPlantById(id: string): PlantSpecies | undefined {
  // Check custom first (override)
  const custom = loadCustomPlants().find((p) => p.id === id);
  if (custom) return custom;
  return BUILTIN_PLANTS.find((p) => p.id === id);
}

export function addOrUpdateCustomPlant(plant: PlantSpecies): void {
  const existing = loadCustomPlants();
  const idx = existing.findIndex((p) => p.id === plant.id);
  if (idx >= 0) {
    existing[idx] = { ...plant, updatedAt: new Date().toISOString() };
  } else {
    existing.push({ ...plant, updatedAt: new Date().toISOString() });
  }
  saveCustomPlants(existing);
}

export function deleteCustomPlant(id: string): void {
  const existing = loadCustomPlants().filter((p) => p.id !== id);
  saveCustomPlants(existing);
}

/** Get a specific variety of a species */
export function getVariety(speciesId: string, varietyId: string): PlantVariety | undefined {
  const species = getPlantById(speciesId);
  return species?.varieties?.find((v) => v.id === varietyId);
}

/** Get all varieties for a species */
export function getVarietiesForSpecies(speciesId: string): PlantVariety[] {
  const species = getPlantById(speciesId);
  return species?.varieties ?? [];
}

// ---------------------------------------------------------------------------
// Plant instances (what's planted in beds)
// ---------------------------------------------------------------------------

export function loadPlantInstances(): PlantInstance[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(userKey(STORAGE_PLANT_INSTANCES_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlantInstances(instances: PlantInstance[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_PLANT_INSTANCES_KEY), JSON.stringify(instances));
  markDirty(STORAGE_PLANT_INSTANCES_KEY);
}

export function getInstancesForFeature(featureId: string): PlantInstance[] {
  return loadPlantInstances().filter((i) => i.featureId === featureId);
}

export function addPlantInstance(instance: PlantInstance): void {
  const all = loadPlantInstances();
  all.push(instance);
  savePlantInstances(all);
}

export function removePlantInstance(instanceId: string): void {
  const all = loadPlantInstances().filter((i) => i.id !== instanceId);
  savePlantInstances(all);
}

/** Remove all plant instances that reference a given featureId (used when deleting a map feature). */
export function removeInstancesForFeature(featureId: string): void {
  const all = loadPlantInstances().filter((i) => i.featureId !== featureId);
  savePlantInstances(all);
}

/** Remove plant instances whose featureId no longer exists in the given set of valid feature IDs. */
export function removeOrphanedInstances(validFeatureIds: Set<string>): number {
  const all = loadPlantInstances();
  const cleaned = all.filter((i) => validFeatureIds.has(i.featureId));
  const removed = all.length - cleaned.length;
  if (removed > 0) savePlantInstances(cleaned);
  return removed;
}

export function updatePlantInstance(instanceId: string, updates: Partial<PlantInstance>): void {
  const all = loadPlantInstances();
  const idx = all.findIndex((i) => i.id === instanceId);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...updates };
    savePlantInstances(all);
  }
}

// ---------------------------------------------------------------------------
// Companion planting helpers
// ---------------------------------------------------------------------------

export type CompanionCheck = {
  type: "good" | "bad";
  plantA: PlantSpecies;
  plantB: PlantSpecies;
};

/** Check companion planting conflicts/synergies for plants in a feature */
export function checkCompanions(featureId: string): CompanionCheck[] {
  const instances = getInstancesForFeature(featureId);
  const plants = instances
    .map((i) => getPlantById(i.speciesId))
    .filter((p): p is PlantSpecies => !!p);

  const checks: CompanionCheck[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < plants.length; i++) {
    for (let j = i + 1; j < plants.length; j++) {
      const a = plants[i];
      const b = plants[j];
      const key = [a.id, b.id].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);

      if (a.goodCompanions?.includes(b.id) || b.goodCompanions?.includes(a.id)) {
        checks.push({ type: "good", plantA: a, plantB: b });
      }
      if (a.badCompanions?.includes(b.id) || b.badCompanions?.includes(a.id)) {
        checks.push({ type: "bad", plantA: a, plantB: b });
      }
    }
  }

  return checks;
}

/** Check crop rotation warnings for a feature */
export function checkRotation(
  featureId: string,
  currentSeason: number,
): { plant: PlantSpecies; lastSeason: number; minYears: number }[] {
  const instances = loadPlantInstances();
  const current = instances.filter((i) => i.featureId === featureId && i.season === currentSeason);
  const past = instances.filter(
    (i) => i.featureId === featureId && (i.season ?? 0) < currentSeason,
  );

  const warnings: { plant: PlantSpecies; lastSeason: number; minYears: number }[] = [];

  for (const ci of current) {
    const species = getPlantById(ci.speciesId);
    if (!species?.family || !species.rotationYears) continue;

    for (const pi of past) {
      const pastSpecies = getPlantById(pi.speciesId);
      if (!pastSpecies?.family) continue;
      if (pastSpecies.family !== species.family) continue;

      const gap = currentSeason - (pi.season ?? 0);
      if (gap < species.rotationYears) {
        warnings.push({
          plant: species,
          lastSeason: pi.season ?? 0,
          minYears: species.rotationYears,
        });
        break;
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Variety CRUD (add / update / delete varieties on species)
// ---------------------------------------------------------------------------

/** Add a variety to a species. If the species is builtin-only, clones it to custom storage first. */
export function addVarietyToSpecies(speciesId: string, variety: PlantVariety): void {
  const custom = loadCustomPlants();
  const customIdx = custom.findIndex((p) => p.id === speciesId);

  if (customIdx >= 0) {
    const species = custom[customIdx];
    custom[customIdx] = {
      ...species,
      varieties: [...(species.varieties ?? []), variety],
      updatedAt: new Date().toISOString(),
    };
  } else {
    const builtin = BUILTIN_PLANTS.find((p) => p.id === speciesId);
    if (!builtin) return;
    custom.push({
      ...builtin,
      varieties: [...(builtin.varieties ?? []), variety],
      updatedAt: new Date().toISOString(),
    });
  }

  saveCustomPlants(custom);
}

/** Update an existing variety within a species. */
export function updateVarietyInSpecies(
  speciesId: string,
  varietyId: string,
  updates: Partial<PlantVariety>,
): void {
  const custom = loadCustomPlants();
  const customIdx = custom.findIndex((p) => p.id === speciesId);

  if (customIdx >= 0) {
    const species = custom[customIdx];
    custom[customIdx] = {
      ...species,
      varieties: (species.varieties ?? []).map((v) =>
        v.id === varietyId ? { ...v, ...updates } : v,
      ),
      updatedAt: new Date().toISOString(),
    };
  } else {
    const builtin = BUILTIN_PLANTS.find((p) => p.id === speciesId);
    if (!builtin) return;
    custom.push({
      ...builtin,
      varieties: (builtin.varieties ?? []).map((v) =>
        v.id === varietyId ? { ...v, ...updates } : v,
      ),
      updatedAt: new Date().toISOString(),
    });
  }

  saveCustomPlants(custom);
}

/** Delete a variety from a species. */
export function deleteVarietyFromSpecies(speciesId: string, varietyId: string): void {
  const custom = loadCustomPlants();
  const customIdx = custom.findIndex((p) => p.id === speciesId);

  if (customIdx >= 0) {
    const species = custom[customIdx];
    custom[customIdx] = {
      ...species,
      varieties: (species.varieties ?? []).filter((v) => v.id !== varietyId),
      updatedAt: new Date().toISOString(),
    };
  } else {
    const builtin = BUILTIN_PLANTS.find((p) => p.id === speciesId);
    if (!builtin || !builtin.varieties?.some((v) => v.id === varietyId)) return;
    custom.push({
      ...builtin,
      varieties: builtin.varieties.filter((v) => v.id !== varietyId),
      updatedAt: new Date().toISOString(),
    });
  }

  saveCustomPlants(custom);
}

// ---------------------------------------------------------------------------
// Month formatting helper
// ---------------------------------------------------------------------------

const MONTH_NAMES_DA = [
  "Jan", "Feb", "Mar", "Apr", "Maj", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
];

export function formatMonthRange(range: { from: number; to: number } | undefined): string {
  if (!range) return "—";
  const f = MONTH_NAMES_DA[(range.from - 1) % 12];
  const t = MONTH_NAMES_DA[(range.to - 1) % 12];
  return f === t ? f : `${f}–${t}`;
}

// ---------------------------------------------------------------------------
// Plant Recommendation Engine
// ---------------------------------------------------------------------------

/** Strategy modes for recommendations */
export type RecommendationStrategy =
  | "companion"     // Samdyrkning – gode naboer
  | "biodiversity"  // Biodiversitet – familiediversitet & kategorier
  | "nutrition"     // Supplerende næring – kvælstoffikserere, komplementære behov
  | "color"         // Farver & bestøvere – blomster, bestøvervenlige
  | "forest-layer"; // Skovhavelag – kompatible lag

export const RECOMMENDATION_STRATEGY_LABELS: Record<RecommendationStrategy, string> = {
  companion: "🤝 Samdyrkning",
  biodiversity: "🌍 Biodiversitet",
  nutrition: "🧪 Næring",
  color: "🌸 Blomster & bestøvere",
  "forest-layer": "🌳 Skovhavelag",
};

/** A single reason tag explaining why a plant scored well (or badly) */
export type RecommendationReason = {
  emoji: string;
  text: string;
  score: number;
};

/** A scored plant recommendation */
export type ScoredRecommendation = {
  species: PlantSpecies;
  totalScore: number;
  reasons: RecommendationReason[];
};

/**
 * Get plant recommendations based on what is already planted in/near a bed.
 *
 * @param existingSpeciesIds – IDs of plants already present in the bed + neighbours
 * @param strategies – which scoring strategies to use (empty = all)
 * @param placementFilter – "row" | "element" to filter plants that can be placed this way
 * @param maxResults – how many to return (default 12)
 */
export function getPlantRecommendations(
  existingSpeciesIds: string[],
  strategies: RecommendationStrategy[],
  placementFilter?: "row" | "element",
  maxResults = 12,
): ScoredRecommendation[] {
  const allPlants = getAllPlants();
  const existingSet = new Set(existingSpeciesIds);
  const existingPlants = existingSpeciesIds
    .map((id) => allPlants.find((p) => p.id === id))
    .filter((p): p is PlantSpecies => !!p);

  // Pre-compute sets for existing plants
  const existingFamilies = new Set<PlantFamily>(existingPlants.map((p) => p.family).filter((f): f is PlantFamily => !!f));
  const existingCategories = new Set<PlantCategory>(existingPlants.map((p) => p.category).filter((c): c is PlantCategory => !!c));
  const existingLayers = new Set<ForestGardenLayer>(existingPlants.map((p) => p.forestGardenLayer).filter((l): l is ForestGardenLayer => !!l));
  const hasLegume = existingPlants.some((p) => p.family === "fabaceae");
  const existingGoodCompanions = new Set<string>();
  const existingBadCompanions = new Set<string>();
  for (const ep of existingPlants) {
    for (const c of ep.goodCompanions ?? []) existingGoodCompanions.add(c);
    for (const c of ep.badCompanions ?? []) existingBadCompanions.add(c);
  }

  // Use all strategies if none specified
  const activeStrategies = strategies.length > 0 ? strategies : (
    ["companion", "biodiversity", "nutrition", "color", "forest-layer"] as RecommendationStrategy[]
  );

  const scored: ScoredRecommendation[] = [];

  for (const candidate of allPlants) {
    // Skip plants already in the bed
    if (existingSet.has(candidate.id)) continue;

    // Skip candidates missing essential fields
    const cFamily = candidate.family;
    const cCategory = candidate.category;
    const cLayer = candidate.forestGardenLayer;
    if (!cFamily || !cCategory || !cLayer) continue;

    // Skip if placement filter doesn't match
    if (placementFilter === "row") {
      // Row plants: vegetables, some herbs, cover-crops
      const rowCats: PlantCategory[] = ["vegetable", "herb", "flower", "cover-crop", "soil-amendment"];
      if (!rowCats.includes(cCategory)) continue;
    }

    const reasons: RecommendationReason[] = [];

    // --- COMPANION scoring ---
    if (activeStrategies.includes("companion") && existingPlants.length > 0) {
      // How many existing plants list this candidate as good companion?
      let goodCount = 0;
      let badCount = 0;
      const goodNames: string[] = [];

      for (const ep of existingPlants) {
        if (ep.goodCompanions?.includes(candidate.id)) {
          goodCount++;
          goodNames.push(ep.name);
        }
        if (ep.badCompanions?.includes(candidate.id)) {
          badCount++;
        }
      }
      // Also check reverse: does candidate like existing plants?
      for (const ep of existingPlants) {
        if (candidate.goodCompanions?.includes(ep.id)) {
          goodCount++;
          if (!goodNames.includes(ep.name)) goodNames.push(ep.name);
        }
        if (candidate.badCompanions?.includes(ep.id)) {
          badCount++;
        }
      }

      if (goodCount > 0) {
        reasons.push({
          emoji: "🤝",
          text: `God nabo til ${goodNames.slice(0, 3).join(", ")}${goodNames.length > 3 ? " m.fl." : ""}`,
          score: Math.min(goodCount * 2, 8),
        });
      }
      if (badCount > 0) {
        reasons.push({
          emoji: "⚠️",
          text: `Dårlig nabo til ${badCount} eksisterende`,
          score: -badCount * 4,
        });
      }
    }

    // --- BIODIVERSITY scoring ---
    if (activeStrategies.includes("biodiversity") && existingPlants.length > 0) {
      if (!existingFamilies.has(cFamily)) {
        reasons.push({
          emoji: "🧬",
          text: `Ny familie (${PLANT_FAMILY_LABELS[cFamily] ?? cFamily})`,
          score: 3,
        });
      } else {
        reasons.push({
          emoji: "📋",
          text: `Samme familie som eksisterende`,
          score: -1,
        });
      }
      if (!existingCategories.has(cCategory)) {
        reasons.push({
          emoji: "🌈",
          text: `Ny kategori (${PLANT_CATEGORY_LABELS[cCategory] ?? cCategory})`,
          score: 2,
        });
      }
    }

    // --- NUTRITION scoring ---
    if (activeStrategies.includes("nutrition")) {
      // Nitrogen fixers (fabaceae / legumes) are valuable if not already present
      if (cFamily === "fabaceae" && !hasLegume) {
        reasons.push({
          emoji: "🧪",
          text: "Kvælstoffikserer (bælgplante) – forbedrer jorden",
          score: 4,
        });
      }
      // Cover crops and soil amendments are generally beneficial
      if (cCategory === "cover-crop" || cCategory === "soil-amendment") {
        reasons.push({
          emoji: "🌱",
          text: `Jordforbedrer (${PLANT_CATEGORY_LABELS[cCategory]})`,
          score: 3,
        });
      }
      // Complementary light needs: if most existing are full-sun, suggest shade-tolerant and vice versa
      if (existingPlants.length > 0) {
        const sunCount = existingPlants.filter((p) => p.light === "full-sun").length;
        const shadeRatio = 1 - sunCount / existingPlants.length;
        if (candidate.light === "partial-shade" && shadeRatio < 0.3) {
          reasons.push({
            emoji: "☀️",
            text: "Tåler halvskygge – udnytter skyggede pletter",
            score: 2,
          });
        }
      }
    }

    // --- COLOR / POLLINATOR scoring ---
    if (activeStrategies.includes("color")) {
      if (cCategory === "flower") {
        reasons.push({
          emoji: "🌸",
          text: "Blomsterplante – tiltrækker bestøvere",
          score: 4,
        });
      }
      // Herbs with flowers that attract pollinators
      const pollinatorHerbs = ["lavendel", "timian", "oregano", "mynte", "citronmelisse", "salvie"];
      if (cCategory === "herb" && pollinatorHerbs.includes(candidate.id)) {
        reasons.push({
          emoji: "🐝",
          text: "Bestøvervenlig urt",
          score: 3,
        });
      }
      // Bonus if we don't already have flowers
      if (cCategory === "flower" && !existingCategories.has("flower")) {
        reasons.push({
          emoji: "🦋",
          text: "Ingen blomster i bedet endnu – øger bestøvning",
          score: 2,
        });
      }
    }

    // --- FOREST GARDEN LAYER scoring ---
    if (activeStrategies.includes("forest-layer") && existingPlants.length > 0) {
      // Check layer compatibility with existing plants
      let compatCount = 0;
      let conflictCount = 0;
      for (const layer of existingLayers) {
        if (canLayersCoexist(cLayer, layer)) {
          compatCount++;
        } else {
          conflictCount++;
        }
      }
      if (compatCount > 0 && conflictCount === 0) {
        reasons.push({
          emoji: "🏔️",
          text: `Kompatibelt skovhavelag (${FOREST_GARDEN_LAYER_LABELS[cLayer]})`,
          score: 3,
        });
      }
      if (conflictCount > 0) {
        reasons.push({
          emoji: "⛔",
          text: `Konkurrerer i samme lag med ${conflictCount} eksisterende`,
          score: -conflictCount * 2,
        });
      }
      // Bonus for filling a new layer
      if (!existingLayers.has(cLayer)) {
        reasons.push({
          emoji: "📐",
          text: `Udfylder nyt lag: ${FOREST_GARDEN_LAYER_LABELS[cLayer]}`,
          score: 2,
        });
      }
    }

    // Only include candidates that have at least one reason
    if (reasons.length === 0) continue;

    const totalScore = reasons.reduce((sum, r) => sum + r.score, 0);

    // Only include if net-positive score
    if (totalScore > 0) {
      scored.push({ species: candidate, totalScore, reasons });
    }
  }

  // Sort by score descending, then by name for stability
  scored.sort((a, b) => b.totalScore - a.totalScore || a.species.name.localeCompare(b.species.name, "da"));

  return scored.slice(0, maxResults);
}
