/**
 * rotationPlanner.test.ts — unit tests for multi-year crop rotation planner.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  buildRotationPlan,
  getCurrentSeason,
  getFamilyColor,
  getFamilyLabel,
} from "../app/lib/rotationPlanner";

import type { PlantSpecies, PlantInstance, PlantFamily } from "../app/lib/plantTypes";
import type { FeatureCollection, Geometry, Feature } from "geojson";

// ---------------------------------------------------------------------------
// Mock plantStore — used by rotationPlanner internally
// ---------------------------------------------------------------------------
const MOCK_PLANTS: Record<string, PlantSpecies> = {};
let MOCK_INSTANCES: PlantInstance[] = [];

vi.mock("../app/lib/plantStore", () => ({
  getPlantById: (id: string) => MOCK_PLANTS[id] ?? undefined,
  getInstancesForFeature: (fid: string) =>
    MOCK_INSTANCES.filter((i) => i.featureId === fid),
  loadPlantInstances: () => MOCK_INSTANCES,
}));

// ---------------------------------------------------------------------------
// Mock userStorage (imported transitively by plantStore)
// ---------------------------------------------------------------------------
vi.mock("../app/lib/userStorage", () => ({
  userKey: (k: string) => k,
  markDirty: () => {},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlant(
  id: string,
  name: string,
  family: PlantFamily,
  rotationYears?: number,
): PlantSpecies {
  const sp: PlantSpecies = {
    id,
    name,
    category: "vegetable",
    icon: "🌱",
    family,
    rotationYears,
    forestGardenLayer: "herbaceous",
    light: "full-sun",
  } as PlantSpecies;
  MOCK_PLANTS[id] = sp;
  return sp;
}

function addInstance(
  speciesId: string,
  featureId: string,
  season: number,
): PlantInstance {
  const inst: PlantInstance = {
    id: `inst-${speciesId}-${featureId}-${season}`,
    speciesId,
    featureId,
    season,
  };
  MOCK_INSTANCES.push(inst);
  return inst;
}

function makeLayout(
  beds: { id: string; name: string; kind?: string; category?: string }[],
): FeatureCollection<Geometry> {
  return {
    type: "FeatureCollection",
    features: beds.map(
      (b) =>
        ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [12, 55] },
          properties: {
            gardenosId: b.id,
            name: b.name,
            kind: b.kind ?? "bed",
            category: b.category ?? "element",
          },
        }) as Feature<Geometry>,
    ),
  };
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
beforeEach(() => {
  Object.keys(MOCK_PLANTS).forEach((k) => delete MOCK_PLANTS[k]);
  MOCK_INSTANCES = [];
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("getFamilyColor", () => {
  it("returns a known colour for solanaceae", () => {
    expect(getFamilyColor("solanaceae")).toBe("#ef4444");
  });

  it("returns slate fallback for unknown family", () => {
    expect(getFamilyColor("unknown-family" as PlantFamily)).toBe("#94a3b8");
  });
});

describe("getFamilyLabel", () => {
  it("returns Danish label for brassicaceae", () => {
    // PLANT_FAMILY_LABELS maps brassicaceae → "Korsblomstfamilien" or similar
    const label = getFamilyLabel("brassicaceae");
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });

  it("returns raw family string for unknown family", () => {
    expect(getFamilyLabel("xyzfamily" as PlantFamily)).toBe("xyzfamily");
  });
});

describe("getCurrentSeason", () => {
  it("returns the current year", () => {
    const year = getCurrentSeason();
    expect(year).toBe(new Date().getFullYear());
  });
});

describe("buildRotationPlan", () => {
  it("returns empty rows for layout with no bed-like features", () => {
    const layout: FeatureCollection<Geometry> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [12, 55] },
          properties: { gardenosId: "tree-1", name: "Æbletræ", kind: "tree", category: "condition" },
        } as Feature<Geometry>,
      ],
    };
    const plan = buildRotationPlan(layout, [2023, 2025]);
    expect(plan.seasons).toEqual([2023, 2024, 2025]);
    expect(plan.rows).toHaveLength(0);
  });

  it("builds seasons array from range", () => {
    const plan = buildRotationPlan(makeLayout([]), [2020, 2024]);
    expect(plan.seasons).toEqual([2020, 2021, 2022, 2023, 2024]);
  });

  it("builds one row per bed-like feature", () => {
    const layout = makeLayout([
      { id: "bed-1", name: "Bed A" },
      { id: "bed-2", name: "Bed B" },
    ]);
    const plan = buildRotationPlan(layout, [2024, 2025]);
    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0].bed.bedName).toBe("Bed A");
    expect(plan.rows[1].bed.bedName).toBe("Bed B");
  });

  it("populates cells with species names and families", () => {
    makePlant("tomat", "Tomat", "solanaceae");
    addInstance("tomat", "bed-1", 2024);

    const layout = makeLayout([{ id: "bed-1", name: "Grønsagsbed" }]);
    const plan = buildRotationPlan(layout, [2024, 2024]);

    const cell = plan.rows[0].cells[0];
    expect(cell.season).toBe(2024);
    expect(cell.speciesNames).toContain("Tomat");
    expect(cell.families).toContain("solanaceae");
    expect(cell.warnings).toHaveLength(0);
  });

  it("detects rotation warning when family planted too recently", () => {
    makePlant("tomat", "Tomat", "solanaceae", 3);
    makePlant("peber", "Peberfrugt", "solanaceae", 3);
    addInstance("tomat", "bed-1", 2022);
    addInstance("peber", "bed-1", 2023); // gap = 1 year, needs 3

    const layout = makeLayout([{ id: "bed-1", name: "Bed" }]);
    const plan = buildRotationPlan(layout, [2022, 2023]);

    // The 2023 cell should have a rotation warning
    const cell2023 = plan.rows[0].cells[1];
    expect(cell2023.warnings.length).toBeGreaterThan(0);
    expect(cell2023.warnings[0]).toContain("⚠️");
  });

  it("no rotation warning when gap is sufficient", () => {
    makePlant("tomat", "Tomat", "solanaceae", 2);
    addInstance("tomat", "bed-1", 2020);
    addInstance("tomat", "bed-1", 2023); // gap = 3, needs 2

    const layout = makeLayout([{ id: "bed-1", name: "Bed" }]);
    const plan = buildRotationPlan(layout, [2020, 2023]);

    const cell2023 = plan.rows[0].cells[3]; // season index 3 = 2023
    expect(cell2023.warnings).toHaveLength(0);
  });

  it("generates avoid suggestions for families planted recently", () => {
    makePlant("tomat", "Tomat", "solanaceae", 3);
    addInstance("tomat", "bed-1", 2024);

    const layout = makeLayout([{ id: "bed-1", name: "Bed" }]);
    const plan = buildRotationPlan(layout, [2024, 2024]);

    const suggestion = plan.suggestions["bed-1"];
    expect(suggestion).toBeDefined();
    expect(suggestion.avoid).toContain("solanaceae");
  });

  it("suggests families not recently used", () => {
    makePlant("tomat", "Tomat", "solanaceae", 3);
    addInstance("tomat", "bed-1", 2024);

    const layout = makeLayout([{ id: "bed-1", name: "Bed" }]);
    const plan = buildRotationPlan(layout, [2024, 2024]);

    const suggestion = plan.suggestions["bed-1"];
    expect(suggestion.suggest.length).toBeGreaterThan(0);
    // Should suggest families NOT used — solanaceae should NOT be in suggest
    expect(suggestion.suggest).not.toContain("solanaceae");
  });

  it("handles empty instances gracefully", () => {
    const layout = makeLayout([{ id: "bed-1", name: "Bed" }]);
    const plan = buildRotationPlan(layout, [2024, 2025]);

    expect(plan.rows).toHaveLength(1);
    const cell = plan.rows[0].cells[0];
    expect(cell.families).toHaveLength(0);
    expect(cell.speciesNames).toHaveLength(0);
    expect(cell.warnings).toHaveLength(0);
  });

  it("includes row and seedbed category features", () => {
    const layout = makeLayout([
      { id: "row-1", name: "Gulerødder", kind: "row", category: "row" },
      { id: "sb-1", name: "Frøbed", kind: "seedbed", category: "seedbed" },
      { id: "c-1", name: "Krukke", kind: "pot", category: "container" },
    ]);
    const plan = buildRotationPlan(layout, [2024, 2024]);
    // All three should be included as bed-like features
    expect(plan.rows).toHaveLength(3);
  });

  it("handles multiple families in same season/bed", () => {
    makePlant("tomat", "Tomat", "solanaceae");
    makePlant("gulerod", "Gulerod", "apiaceae");
    addInstance("tomat", "bed-1", 2024);
    addInstance("gulerod", "bed-1", 2024);

    const layout = makeLayout([{ id: "bed-1", name: "Bed" }]);
    const plan = buildRotationPlan(layout, [2024, 2024]);

    const cell = plan.rows[0].cells[0];
    expect(cell.families).toContain("solanaceae");
    expect(cell.families).toContain("apiaceae");
    expect(cell.speciesNames).toEqual(expect.arrayContaining(["Tomat", "Gulerod"]));
  });

  it("skips features without gardenosId", () => {
    const layout: FeatureCollection<Geometry> = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [12, 55] },
          properties: { name: "No ID", kind: "bed", category: "element" },
        } as Feature<Geometry>,
      ],
    };
    const plan = buildRotationPlan(layout, [2024, 2024]);
    expect(plan.rows).toHaveLength(0);
  });
});
