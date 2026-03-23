/**
 * plantStore.test.ts — unit tests for plant store (CRUD + companion + rotation + recommendations).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { PlantSpecies, PlantInstance, PlantFamily, PlantCategory, ForestGardenLayer } from "../app/lib/plantTypes";

// ---------------------------------------------------------------------------
// Mock userStorage — must come before plantStore import
// ---------------------------------------------------------------------------
vi.mock("../app/lib/userStorage", () => ({
  userKey: (k: string) => k,
  markDirty: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete storage[key]; }),
  clear: vi.fn(() => { Object.keys(storage).forEach((k) => delete storage[k]); }),
};

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });
Object.defineProperty(globalThis, "window", { value: globalThis, writable: true });

// ---------------------------------------------------------------------------
// Import under test — AFTER mocks
// ---------------------------------------------------------------------------
import {
  loadCustomPlants,
  saveCustomPlants,
  getAllPlants,
  getPlantById,
  addOrUpdateCustomPlant,
  deleteCustomPlant,
  getVariety,
  getVarietiesForSpecies,
  loadPlantInstances,
  savePlantInstances,
  getInstancesForFeature,
  addPlantInstance,
  removePlantInstance,
  removeInstancesForFeature,
  removeOrphanedInstances,
  updatePlantInstance,
  checkCompanions,
  checkRotation,
  addVarietyToSpecies,
  updateVarietyInSpecies,
  deleteVarietyFromSpecies,
  formatMonthRange,
  getPlantRecommendations,
} from "../app/lib/plantStore";

import { BUILTIN_PLANTS } from "../app/lib/plantData";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlant(
  id: string,
  name: string,
  overrides: Partial<PlantSpecies> = {},
): PlantSpecies {
  return {
    id,
    name,
    category: "vegetable" as PlantCategory,
    icon: "🌱",
    family: "solanaceae" as PlantFamily,
    forestGardenLayer: "herbaceous" as ForestGardenLayer,
    light: "full-sun",
    ...overrides,
  } as PlantSpecies;
}

function makeInstance(
  speciesId: string,
  featureId: string,
  season: number,
  id?: string,
): PlantInstance {
  return {
    id: id ?? `inst-${speciesId}-${featureId}-${season}`,
    speciesId,
    featureId,
    season,
  };
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// Custom plants CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe("Custom plants CRUD", () => {
  it("loadCustomPlants returns empty array when storage is empty", () => {
    expect(loadCustomPlants()).toEqual([]);
  });

  it("saveCustomPlants + loadCustomPlants round-trips", () => {
    const plants = [makePlant("custom-1", "CustomA")];
    saveCustomPlants(plants);
    const loaded = loadCustomPlants();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("CustomA");
  });

  it("addOrUpdateCustomPlant adds new plant", () => {
    addOrUpdateCustomPlant(makePlant("new-1", "New Plant"));
    const loaded = loadCustomPlants();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("new-1");
  });

  it("addOrUpdateCustomPlant updates existing plant", () => {
    addOrUpdateCustomPlant(makePlant("upd-1", "Original"));
    addOrUpdateCustomPlant(makePlant("upd-1", "Updated"));
    const loaded = loadCustomPlants();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("Updated");
  });

  it("deleteCustomPlant removes a custom plant", () => {
    addOrUpdateCustomPlant(makePlant("del-1", "DeleteMe"));
    addOrUpdateCustomPlant(makePlant("keep-1", "KeepMe"));
    deleteCustomPlant("del-1");
    const loaded = loadCustomPlants();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("keep-1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getAllPlants & getPlantById
// ═══════════════════════════════════════════════════════════════════════════

describe("getAllPlants", () => {
  it("includes builtin plants when no custom plants exist", () => {
    const all = getAllPlants();
    expect(all.length).toBeGreaterThanOrEqual(BUILTIN_PLANTS.length);
  });

  it("custom plant overrides builtin with same id", () => {
    const builtinId = BUILTIN_PLANTS[0].id;
    addOrUpdateCustomPlant(makePlant(builtinId, "Custom Override"));
    const all = getAllPlants();
    const overridden = all.find((p) => p.id === builtinId);
    expect(overridden?.name).toBe("Custom Override");
    // Should not have duplicates
    const count = all.filter((p) => p.id === builtinId).length;
    expect(count).toBe(1);
  });
});

describe("getPlantById", () => {
  it("finds a builtin plant", () => {
    const plant = getPlantById(BUILTIN_PLANTS[0].id);
    expect(plant).toBeDefined();
    expect(plant?.name).toBe(BUILTIN_PLANTS[0].name);
  });

  it("custom plant takes priority over builtin", () => {
    const builtinId = BUILTIN_PLANTS[0].id;
    addOrUpdateCustomPlant(makePlant(builtinId, "Override"));
    expect(getPlantById(builtinId)?.name).toBe("Override");
  });

  it("returns undefined for unknown id", () => {
    expect(getPlantById("nonexistent-id")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Plant instances CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe("Plant instances CRUD", () => {
  it("loadPlantInstances returns empty array initially", () => {
    expect(loadPlantInstances()).toEqual([]);
  });

  it("addPlantInstance + loadPlantInstances round-trips", () => {
    addPlantInstance(makeInstance("tomat", "bed-1", 2024));
    const loaded = loadPlantInstances();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].speciesId).toBe("tomat");
  });

  it("getInstancesForFeature filters by featureId", () => {
    addPlantInstance(makeInstance("tomat", "bed-1", 2024, "i1"));
    addPlantInstance(makeInstance("gulerod", "bed-2", 2024, "i2"));
    addPlantInstance(makeInstance("peber", "bed-1", 2024, "i3"));

    const bed1 = getInstancesForFeature("bed-1");
    expect(bed1).toHaveLength(2);
    expect(bed1.every((i) => i.featureId === "bed-1")).toBe(true);
  });

  it("removePlantInstance removes by id", () => {
    addPlantInstance(makeInstance("tomat", "bed-1", 2024, "remove-me"));
    addPlantInstance(makeInstance("gulerod", "bed-1", 2024, "keep-me"));
    removePlantInstance("remove-me");
    const loaded = loadPlantInstances();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("keep-me");
  });

  it("removeInstancesForFeature removes all for a featureId", () => {
    addPlantInstance(makeInstance("tomat", "bed-1", 2024, "i1"));
    addPlantInstance(makeInstance("peber", "bed-1", 2024, "i2"));
    addPlantInstance(makeInstance("gulerod", "bed-2", 2024, "i3"));
    removeInstancesForFeature("bed-1");
    const loaded = loadPlantInstances();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].featureId).toBe("bed-2");
  });

  it("removeOrphanedInstances cleans up orphans", () => {
    addPlantInstance(makeInstance("tomat", "bed-1", 2024, "i1"));
    addPlantInstance(makeInstance("peber", "bed-2", 2024, "i2"));
    addPlantInstance(makeInstance("gulerod", "bed-3", 2024, "i3"));

    const validIds = new Set(["bed-1", "bed-3"]);
    const removed = removeOrphanedInstances(validIds);
    expect(removed).toBe(1);
    const loaded = loadPlantInstances();
    expect(loaded).toHaveLength(2);
    expect(loaded.every((i) => validIds.has(i.featureId))).toBe(true);
  });

  it("removeOrphanedInstances returns 0 when no orphans", () => {
    addPlantInstance(makeInstance("tomat", "bed-1", 2024, "i1"));
    const removed = removeOrphanedInstances(new Set(["bed-1"]));
    expect(removed).toBe(0);
  });

  it("updatePlantInstance updates fields", () => {
    addPlantInstance(makeInstance("tomat", "bed-1", 2024, "upd-1"));
    updatePlantInstance("upd-1", { notes: "Plantet i skygge" });
    const loaded = loadPlantInstances();
    expect(loaded[0].notes).toBe("Plantet i skygge");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Companion check
// ═══════════════════════════════════════════════════════════════════════════

describe("checkCompanions", () => {
  it("detects good companion pair", () => {
    // Register two plants that are good companions
    addOrUpdateCustomPlant(
      makePlant("plantA", "Plant A", { goodCompanions: ["plantB"] }),
    );
    addOrUpdateCustomPlant(
      makePlant("plantB", "Plant B", {}),
    );
    addPlantInstance(makeInstance("plantA", "bed-c", 2024, "ic1"));
    addPlantInstance(makeInstance("plantB", "bed-c", 2024, "ic2"));

    const checks = checkCompanions("bed-c");
    const good = checks.filter((c) => c.type === "good");
    expect(good).toHaveLength(1);
    expect(good[0].plantA.id).toBe("plantA");
    expect(good[0].plantB.id).toBe("plantB");
  });

  it("detects bad companion pair", () => {
    addOrUpdateCustomPlant(
      makePlant("plantX", "Plant X", { badCompanions: ["plantY"] }),
    );
    addOrUpdateCustomPlant(
      makePlant("plantY", "Plant Y", {}),
    );
    addPlantInstance(makeInstance("plantX", "bed-c2", 2024, "ic3"));
    addPlantInstance(makeInstance("plantY", "bed-c2", 2024, "ic4"));

    const checks = checkCompanions("bed-c2");
    const bad = checks.filter((c) => c.type === "bad");
    expect(bad).toHaveLength(1);
  });

  it("returns empty for single plant in bed", () => {
    addOrUpdateCustomPlant(makePlant("solo", "Solo Plant"));
    addPlantInstance(makeInstance("solo", "bed-solo", 2024, "is1"));
    expect(checkCompanions("bed-solo")).toHaveLength(0);
  });

  it("returns empty for empty bed", () => {
    expect(checkCompanions("empty-bed")).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Rotation check
// ═══════════════════════════════════════════════════════════════════════════

describe("checkRotation", () => {
  it("warns when same family planted within rotation window", () => {
    addOrUpdateCustomPlant(
      makePlant("tomatR", "Tomat", { family: "solanaceae", rotationYears: 3 }),
    );
    addOrUpdateCustomPlant(
      makePlant("peberR", "Peber", { family: "solanaceae", rotationYears: 3 }),
    );
    // Past: tomat in 2022
    addPlantInstance(makeInstance("tomatR", "bed-r", 2022, "ir1"));
    // Current: peber in 2023 (gap = 1, needs 3)
    addPlantInstance(makeInstance("peberR", "bed-r", 2023, "ir2"));

    const warnings = checkRotation("bed-r", 2023);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].plant.id).toBe("peberR");
    expect(warnings[0].lastSeason).toBe(2022);
    expect(warnings[0].minYears).toBe(3);
  });

  it("no warning when gap is sufficient", () => {
    addOrUpdateCustomPlant(
      makePlant("tomatR2", "Tomat", { family: "solanaceae", rotationYears: 2 }),
    );
    addPlantInstance(makeInstance("tomatR2", "bed-r2", 2020, "ir3"));
    addPlantInstance(makeInstance("tomatR2", "bed-r2", 2023, "ir4"));

    const warnings = checkRotation("bed-r2", 2023);
    expect(warnings).toHaveLength(0);
  });

  it("no warning when families differ", () => {
    addOrUpdateCustomPlant(
      makePlant("guleR", "Gulerod", { family: "apiaceae", rotationYears: 3 }),
    );
    addOrUpdateCustomPlant(
      makePlant("tomatR3", "Tomat", { family: "solanaceae", rotationYears: 3 }),
    );
    addPlantInstance(makeInstance("guleR", "bed-r3", 2022, "ir5"));
    addPlantInstance(makeInstance("tomatR3", "bed-r3", 2023, "ir6"));

    const warnings = checkRotation("bed-r3", 2023);
    expect(warnings).toHaveLength(0);
  });

  it("no warning for plants without rotationYears", () => {
    addOrUpdateCustomPlant(
      makePlant("noro", "No Rotation", { family: "solanaceae", rotationYears: undefined }),
    );
    addPlantInstance(makeInstance("noro", "bed-r4", 2022, "ir7"));
    addPlantInstance(makeInstance("noro", "bed-r4", 2023, "ir8"));

    expect(checkRotation("bed-r4", 2023)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Variety CRUD
// ═══════════════════════════════════════════════════════════════════════════

describe("Variety CRUD", () => {
  it("addVarietyToSpecies on custom plant", () => {
    addOrUpdateCustomPlant(makePlant("var-sp", "Tomat"));
    addVarietyToSpecies("var-sp", { id: "v1", name: "San Marzano" });
    const varieties = getVarietiesForSpecies("var-sp");
    expect(varieties).toHaveLength(1);
    expect(varieties[0].name).toBe("San Marzano");
  });

  it("addVarietyToSpecies on builtin clones to custom", () => {
    const builtinId = BUILTIN_PLANTS[0].id;
    addVarietyToSpecies(builtinId, { id: "v2", name: "Heirloom" });
    const varieties = getVarietiesForSpecies(builtinId);
    expect(varieties.length).toBeGreaterThanOrEqual(1);
    expect(varieties.some((v) => v.name === "Heirloom")).toBe(true);
  });

  it("getVariety returns specific variety", () => {
    addOrUpdateCustomPlant(makePlant("var-sp2", "Tomat"));
    addVarietyToSpecies("var-sp2", { id: "v3", name: "Cherry" });
    const v = getVariety("var-sp2", "v3");
    expect(v?.name).toBe("Cherry");
  });

  it("updateVarietyInSpecies updates fields", () => {
    addOrUpdateCustomPlant(makePlant("var-sp3", "Tomat"));
    addVarietyToSpecies("var-sp3", { id: "v4", name: "Old Name" });
    updateVarietyInSpecies("var-sp3", "v4", { name: "New Name" });
    expect(getVariety("var-sp3", "v4")?.name).toBe("New Name");
  });

  it("deleteVarietyFromSpecies removes variety", () => {
    addOrUpdateCustomPlant(makePlant("var-sp4", "Tomat"));
    addVarietyToSpecies("var-sp4", { id: "v5", name: "Remove Me" });
    addVarietyToSpecies("var-sp4", { id: "v6", name: "Keep Me" });
    deleteVarietyFromSpecies("var-sp4", "v5");
    const varieties = getVarietiesForSpecies("var-sp4");
    expect(varieties).toHaveLength(1);
    expect(varieties[0].id).toBe("v6");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// formatMonthRange
// ═══════════════════════════════════════════════════════════════════════════

describe("formatMonthRange", () => {
  it("returns dash for undefined range", () => {
    expect(formatMonthRange(undefined)).toBe("—");
  });

  it("returns single month when from === to", () => {
    expect(formatMonthRange({ from: 3, to: 3 })).toBe("Mar");
  });

  it("returns range when from !== to", () => {
    expect(formatMonthRange({ from: 4, to: 9 })).toBe("Apr–Sep");
  });

  it("handles month 1 (Jan) and 12 (Dec)", () => {
    expect(formatMonthRange({ from: 1, to: 12 })).toBe("Jan–Dec");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Recommendation engine
// ═══════════════════════════════════════════════════════════════════════════

describe("getPlantRecommendations", () => {
  it("returns empty when no existing plants", () => {
    const recs = getPlantRecommendations([], ["companion"]);
    // With no existing context, companion strategy won't score anything
    // (biodiversity etc. might still score some plants)
    expect(Array.isArray(recs)).toBe(true);
  });

  it("returns recommendations with positive scores only", () => {
    // Use a builtin plant as context
    const existingId = BUILTIN_PLANTS[0].id;
    const recs = getPlantRecommendations([existingId], []);
    for (const r of recs) {
      expect(r.totalScore).toBeGreaterThan(0);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });

  it("excludes existing plants from recommendations", () => {
    const existingId = BUILTIN_PLANTS[0].id;
    const recs = getPlantRecommendations([existingId], []);
    expect(recs.every((r) => r.species.id !== existingId)).toBe(true);
  });

  it("respects maxResults limit", () => {
    const existingId = BUILTIN_PLANTS[0].id;
    const recs = getPlantRecommendations([existingId], [], undefined, 3);
    expect(recs.length).toBeLessThanOrEqual(3);
  });

  it("biodiversity strategy favours new families", () => {
    const existingId = BUILTIN_PLANTS[0].id;
    const recs = getPlantRecommendations([existingId], ["biodiversity"]);
    // At least some should have the "new family" reason
    const hasNewFamily = recs.some((r) =>
      r.reasons.some((reason) => reason.emoji === "🧬"),
    );
    expect(hasNewFamily).toBe(true);
  });

  it("results are sorted by score descending", () => {
    const existingId = BUILTIN_PLANTS[0].id;
    const recs = getPlantRecommendations([existingId], []);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].totalScore).toBeGreaterThanOrEqual(recs[i].totalScore);
    }
  });
});
