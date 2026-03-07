// ---------------------------------------------------------------------------
// GardenOS – Plant Store (localStorage persistence)
// ---------------------------------------------------------------------------
// Manages: custom plant species + plant instances in beds
// ---------------------------------------------------------------------------

import { BUILTIN_PLANTS } from "./plantData";
import type { PlantInstance, PlantSpecies, PlantVariety } from "./plantTypes";

const STORAGE_CUSTOM_PLANTS_KEY = "gardenos:plants:custom:v1";
const STORAGE_PLANT_INSTANCES_KEY = "gardenos:plants:instances:v1";

// ---------------------------------------------------------------------------
// Custom plant species
// ---------------------------------------------------------------------------

export function loadCustomPlants(): PlantSpecies[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_PLANTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomPlants(plants: PlantSpecies[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_CUSTOM_PLANTS_KEY, JSON.stringify(plants));
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
    const raw = localStorage.getItem(STORAGE_PLANT_INSTANCES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlantInstances(instances: PlantInstance[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_PLANT_INSTANCES_KEY, JSON.stringify(instances));
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
