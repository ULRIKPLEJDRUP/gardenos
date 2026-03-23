/**
 * conflictDetection.test.ts — unit tests for geo helpers + conflict logic.
 */
import { describe, it, expect, vi } from "vitest";

import {
  haversineM,
  geoBearing,
  spreadDiameterM,
  canopyRadiusM,
  getTrunkExclusionRadiusM,
  detectPlantConflicts,
  checkPlacementConflicts,
  type ConflictFeature,
} from "../app/lib/conflictDetection";

// ---------------------------------------------------------------------------
// Mock plantStore — we control which species exist
// ---------------------------------------------------------------------------
vi.mock("../app/lib/plantStore", () => ({
  getPlantById: (id: string) => MOCK_PLANTS[id] ?? null,
}));

// Minimal mock plant species
const MOCK_PLANTS: Record<string, Record<string, unknown>> = {
  tomato: {
    id: "tomato",
    name: "Tomat",
    icon: "🍅",
    category: "vegetable",
    spacingCm: 50,
    spreadDiameterCm: 60,
    light: "full-sun",
    lifecycle: "annual",
  },
  basil: {
    id: "basil",
    name: "Basilikum",
    icon: "🌿",
    category: "herb",
    spacingCm: 25,
    spreadDiameterCm: 30,
    light: "full-sun",
    lifecycle: "annual",
    goodCompanions: ["tomato"],
  },
  fennel: {
    id: "fennel",
    name: "Fennikel",
    icon: "🌾",
    category: "herb",
    spacingCm: 40,
    spreadDiameterCm: 40,
    light: "full-sun",
    lifecycle: "annual",
    badCompanions: ["tomato"],
  },
  apple: {
    id: "apple",
    name: "Æble",
    icon: "🍎",
    category: "tree",
    spacingCm: 400,
    spreadDiameterCm: 500,
    heightCm: 500,
    light: "full-sun",
    forestGardenLayer: "canopy",
  },
  currant: {
    id: "currant",
    name: "Ribs",
    icon: "🫐",
    category: "bush",
    spacingCm: 150,
    spreadDiameterCm: 120,
    heightCm: 150,
    light: "partial-shade",
    forestGardenLayer: "shrub",
  },
  strawberry: {
    id: "strawberry",
    name: "Jordbær",
    icon: "🍓",
    category: "vegetable",
    spacingCm: 30,
    spreadDiameterCm: 40,
    light: "full-sun",
    forestGardenLayer: "ground-cover",
  },
};

// ---------------------------------------------------------------------------
// Helper: create a point feature at a given [lng, lat]
// ---------------------------------------------------------------------------
function pt(id: string, speciesId: string, coords: [number, number]): ConflictFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: coords },
    properties: { gardenosId: id, speciesId },
  };
}

// ====================================================================
// haversineM
// ====================================================================
describe("haversineM", () => {
  it("returns 0 for the same point", () => {
    const p: [number, number] = [12.5, 55.6];
    expect(haversineM(p, p)).toBeCloseTo(0, 5);
  });

  it("computes a known distance (Copenhagen City Hall → The Little Mermaid ≈ 2.8 km)", () => {
    const cityhall: [number, number] = [12.5706, 55.6759]; // lng, lat
    const mermaid: [number, number] = [12.5994, 55.6929]; // lng, lat
    const dist = haversineM(cityhall, mermaid);
    expect(dist).toBeGreaterThan(2500);
    expect(dist).toBeLessThan(3200);
  });

  it("is symmetric", () => {
    const a: [number, number] = [12.0, 55.0];
    const b: [number, number] = [12.01, 55.01];
    expect(haversineM(a, b)).toBeCloseTo(haversineM(b, a), 5);
  });

  it("handles negative coordinates (southern hemisphere)", () => {
    const a: [number, number] = [-43.2, -22.9]; // Rio de Janeiro
    const b: [number, number] = [-43.21, -22.91];
    expect(haversineM(a, b)).toBeGreaterThan(0);
  });
});

// ====================================================================
// geoBearing
// ====================================================================
describe("geoBearing", () => {
  it("returns ≈ 0° for due north", () => {
    const a: [number, number] = [12.0, 55.0];
    const b: [number, number] = [12.0, 55.01];
    expect(geoBearing(a, b)).toBeCloseTo(0, 0);
  });

  it("returns ≈ 90° for due east", () => {
    const a: [number, number] = [12.0, 55.0];
    const b: [number, number] = [12.1, 55.0];
    expect(geoBearing(a, b)).toBeCloseTo(90, 0);
  });

  it("returns ≈ 180° for due south", () => {
    const a: [number, number] = [12.0, 55.0];
    const b: [number, number] = [12.0, 54.99];
    expect(geoBearing(a, b)).toBeCloseTo(180, 0);
  });

  it("returns ≈ 270° for due west", () => {
    const a: [number, number] = [12.0, 55.0];
    const b: [number, number] = [11.9, 55.0];
    expect(geoBearing(a, b)).toBeCloseTo(270, 0);
  });

  it("always returns a value in [0, 360)", () => {
    const results = [
      geoBearing([0, 0], [1, 1]),
      geoBearing([0, 0], [-1, -1]),
      geoBearing([0, 0], [1, -1]),
      geoBearing([0, 0], [-1, 1]),
    ];
    for (const r of results) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(360);
    }
  });
});

// ====================================================================
// Spread / canopy helpers
// ====================================================================
describe("spreadDiameterM", () => {
  it("uses spreadDiameterCm when present", () => {
    expect(spreadDiameterM({ spreadDiameterCm: 100 })).toBeCloseTo(1.0);
  });

  it("falls back to spacingCm", () => {
    expect(spreadDiameterM({ spacingCm: 80 })).toBeCloseTo(0.8);
  });

  it("defaults to 0.30 m when both are missing", () => {
    expect(spreadDiameterM({})).toBeCloseTo(0.3);
  });
});

describe("canopyRadiusM", () => {
  it("uses spreadDiameterCm / 2 (in metres)", () => {
    expect(canopyRadiusM({ spreadDiameterCm: 200 })).toBeCloseTo(1.0);
  });

  it("defaults to 0.50 m", () => {
    expect(canopyRadiusM({})).toBeCloseTo(0.5);
  });
});

describe("getTrunkExclusionRadiusM", () => {
  it("returns a smaller radius for canopy-layer trees", () => {
    const r = getTrunkExclusionRadiusM({ spreadDiameterCm: 500, forestGardenLayer: "canopy", category: "tree" });
    // 5 % of 500 cm = 25 cm = 0.25 m
    expect(r).toBeCloseTo(0.25);
  });

  it("returns a reasonable radius for shrubs", () => {
    const r = getTrunkExclusionRadiusM({ spreadDiameterCm: 120, forestGardenLayer: "shrub", category: "bush" });
    // 15 % of 120 cm = 18 cm → min(0.18, 0.10) → 0.18
    expect(r).toBeCloseTo(0.18);
  });

  it("returns at least the minimum for tiny plants", () => {
    const r = getTrunkExclusionRadiusM({ spreadDiameterCm: 10, forestGardenLayer: "shrub", category: "bush" });
    expect(r).toBeGreaterThanOrEqual(0.10);
  });
});

// ====================================================================
// detectPlantConflicts
// ====================================================================
describe("detectPlantConflicts", () => {
  it("returns empty array for no features", () => {
    expect(detectPlantConflicts([])).toEqual([]);
  });

  it("returns empty array for single feature", () => {
    const features = [pt("a1", "tomato", [12.0, 55.0])];
    expect(detectPlantConflicts(features)).toEqual([]);
  });

  it("detects spacing conflict when two same-species plants are too close", () => {
    // Tomato spreadDiameter=60cm → required = 0.30+0.30 = 0.60m
    // Place them ~0.3m apart (very close)
    const offset = 0.3 / 111320; // ~0.3m in degrees latitude
    const features = [
      pt("t1", "tomato", [12.0, 55.0]),
      pt("t2", "tomato", [12.0, 55.0 + offset]),
    ];
    const conflicts = detectPlantConflicts(features);
    const spacingConflicts = conflicts.filter(c => c.type === "spacing");
    expect(spacingConflicts.length).toBeGreaterThanOrEqual(1);
    expect(spacingConflicts[0].severity).toBeGreaterThanOrEqual(2);
  });

  it("returns no spacing conflict when plants are far apart", () => {
    const features = [
      pt("t1", "tomato", [12.0, 55.0]),
      pt("t2", "tomato", [12.001, 55.001]), // ~130m apart
    ];
    const conflicts = detectPlantConflicts(features);
    const spacingConflicts = conflicts.filter(c => c.type === "spacing");
    expect(spacingConflicts).toEqual([]);
  });

  it("detects bad-companion conflict (fennel + tomato)", () => {
    // Place within influence range
    const offset = 0.3 / 111320;
    const features = [
      pt("f1", "fennel", [12.0, 55.0]),
      pt("t1", "tomato", [12.0, 55.0 + offset]),
    ];
    const conflicts = detectPlantConflicts(features);
    const companionConflicts = conflicts.filter(c => c.type === "bad-companion");
    expect(companionConflicts.length).toBe(1);
    expect(companionConflicts[0].severity).toBe(2);
  });

  it("does not flag bad-companion when plants are far apart", () => {
    const features = [
      pt("f1", "fennel", [12.0, 55.0]),
      pt("t1", "tomato", [12.01, 55.01]), // ~1.3 km apart
    ];
    const conflicts = detectPlantConflicts(features);
    const companionConflicts = conflicts.filter(c => c.type === "bad-companion");
    expect(companionConflicts).toEqual([]);
  });

  it("skips non-Point features", () => {
    const polygon: ConflictFeature = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[12.0, 55.0], [12.001, 55.0], [12.001, 55.001], [12.0, 55.001], [12.0, 55.0]]],
      },
      properties: { gardenosId: "poly1", speciesId: "tomato" },
    };
    const features = [polygon, pt("t1", "tomato", [12.0, 55.0])];
    expect(detectPlantConflicts(features)).toEqual([]);
  });

  it("skips features without speciesId", () => {
    const noSpecies: ConflictFeature = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [12.0, 55.0] },
      properties: { gardenosId: "x1" },
    };
    const features = [noSpecies, pt("t1", "tomato", [12.0, 55.0001])];
    expect(detectPlantConflicts(features)).toEqual([]);
  });
});

// ====================================================================
// checkPlacementConflicts
// ====================================================================
describe("checkPlacementConflicts", () => {
  it("returns empty for no existing features", () => {
    const result = checkPlacementConflicts(
      [12.0, 55.0],
      MOCK_PLANTS.tomato as never,
      [],
    );
    expect(result).toEqual([]);
  });

  it("detects spacing conflict with existing plant", () => {
    const offset = 0.2 / 111320;
    const existing = [pt("t1", "tomato", [12.0, 55.0])];
    const result = checkPlacementConflicts(
      [12.0, 55.0 + offset],
      MOCK_PLANTS.basil as never,
      existing,
    );
    const spacing = result.filter(c => c.type === "spacing");
    expect(spacing.length).toBe(1);
    expect(spacing[0].featureIdA).toBe("__proposed__");
  });

  it("detects bad companion for proposed placement", () => {
    const offset = 0.2 / 111320;
    const existing = [pt("t1", "tomato", [12.0, 55.0])];
    const result = checkPlacementConflicts(
      [12.0, 55.0 + offset],
      MOCK_PLANTS.fennel as never,
      existing,
    );
    const companions = result.filter(c => c.type === "bad-companion");
    expect(companions.length).toBe(1);
  });
});
