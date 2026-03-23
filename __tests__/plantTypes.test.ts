// ---------------------------------------------------------------------------
// plantTypes – unit tests
// ---------------------------------------------------------------------------
// Tests for all 10 exported functions in app/lib/plantTypes.ts:
//   canLayersCoexist, isEdiblePlant, getDefaultPlacements, canPlaceInCategory,
//   getPrimaryPlacement, computeShadeImpact, minSunHoursForLight,
//   maxAcceptableShadeHours, couldCastSignificantShade, estimateHeightM
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import {
  canLayersCoexist,
  isEdiblePlant,
  getDefaultPlacements,
  canPlaceInCategory,
  getPrimaryPlacement,
  computeShadeImpact,
  minSunHoursForLight,
  maxAcceptableShadeHours,
  couldCastSignificantShade,
  estimateHeightM,
  FOREST_GARDEN_LAYER_ORDER,
} from "../app/lib/plantTypes";
import type { PlantSpecies, ForestGardenLayer } from "../app/lib/plantTypes";

// ── Helpers ──
function sp(overrides: Partial<PlantSpecies> & { id: string; name: string; category: PlantSpecies["category"] }): PlantSpecies {
  return overrides as unknown as PlantSpecies;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. canLayersCoexist
// ═══════════════════════════════════════════════════════════════════════════
describe("canLayersCoexist", () => {
  it("same layer never coexists", () => {
    const layers: ForestGardenLayer[] = Object.keys(FOREST_GARDEN_LAYER_ORDER) as ForestGardenLayer[];
    for (const l of layers) {
      expect(canLayersCoexist(l, l)).toBe(false);
    }
  });

  it("climber coexists with everything", () => {
    const others: ForestGardenLayer[] = ["canopy", "sub-canopy", "shrub", "herbaceous", "ground-cover", "root"];
    for (const o of others) {
      expect(canLayersCoexist("climber", o)).toBe(true);
      expect(canLayersCoexist(o, "climber")).toBe(true);
    }
  });

  it("canopy coexists with everything below", () => {
    for (const o of ["sub-canopy", "shrub", "herbaceous", "ground-cover", "root"] as ForestGardenLayer[]) {
      expect(canLayersCoexist("canopy", o)).toBe(true);
    }
  });

  it("sub-canopy coexists with shrub, herbaceous, ground-cover, root", () => {
    expect(canLayersCoexist("sub-canopy", "shrub")).toBe(true);
    expect(canLayersCoexist("sub-canopy", "herbaceous")).toBe(true);
    expect(canLayersCoexist("sub-canopy", "ground-cover")).toBe(true);
    expect(canLayersCoexist("sub-canopy", "root")).toBe(true);
  });

  it("shrub + herbaceous compete", () => {
    expect(canLayersCoexist("shrub", "herbaceous")).toBe(false);
  });

  it("shrub + ground-cover/root coexist", () => {
    expect(canLayersCoexist("shrub", "ground-cover")).toBe(true);
    expect(canLayersCoexist("shrub", "root")).toBe(true);
  });

  it("herbaceous + ground-cover/root coexist", () => {
    expect(canLayersCoexist("herbaceous", "ground-cover")).toBe(true);
    expect(canLayersCoexist("herbaceous", "root")).toBe(true);
  });

  it("ground-cover + root coexist", () => {
    expect(canLayersCoexist("ground-cover", "root")).toBe(true);
  });

  it("is symmetric", () => {
    const all: ForestGardenLayer[] = ["canopy", "sub-canopy", "shrub", "herbaceous", "ground-cover", "root", "climber"];
    for (const a of all) {
      for (const b of all) {
        expect(canLayersCoexist(a, b)).toBe(canLayersCoexist(b, a));
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. isEdiblePlant
// ═══════════════════════════════════════════════════════════════════════════
describe("isEdiblePlant", () => {
  it("vegetables are always edible", () => {
    expect(isEdiblePlant(sp({ id: "carrot", name: "Gulerod", category: "vegetable" }))).toBe(true);
  });

  it("fruits are always edible", () => {
    expect(isEdiblePlant(sp({ id: "apple", name: "Æble", category: "fruit" }))).toBe(true);
  });

  it("herbs are always edible", () => {
    expect(isEdiblePlant(sp({ id: "basil", name: "Basilikum", category: "herb" }))).toBe(true);
  });

  it("flowers are NOT edible by default", () => {
    expect(isEdiblePlant(sp({ id: "rose", name: "Rose", category: "flower" }))).toBe(false);
  });

  it("flowers with edible flag ARE edible", () => {
    expect(isEdiblePlant(sp({ id: "nasturtium", name: "Blomsterkarse", category: "flower", edible: true }))).toBe(true);
  });

  it("explicit edible: false overrides category default", () => {
    expect(isEdiblePlant(sp({ id: "poison", name: "Giftig urt", category: "herb", edible: false }))).toBe(false);
  });

  it("trees are not edible by default", () => {
    expect(isEdiblePlant(sp({ id: "oak", name: "Eg", category: "tree" }))).toBe(false);
  });

  it("edible tree returns true", () => {
    expect(isEdiblePlant(sp({ id: "walnut", name: "Valnød", category: "tree", edible: true }))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. getDefaultPlacements
// ═══════════════════════════════════════════════════════════════════════════
describe("getDefaultPlacements", () => {
  it("trees → element only", () => {
    expect(getDefaultPlacements(sp({ id: "oak", name: "Eg", category: "tree" }))).toEqual(["element"]);
  });

  it("bushes → element only", () => {
    expect(getDefaultPlacements(sp({ id: "ribs", name: "Ribs", category: "bush" }))).toEqual(["element"]);
  });

  it("herbs → seedbed, row, container, element", () => {
    expect(getDefaultPlacements(sp({ id: "basil", name: "Basilikum", category: "herb" })))
      .toEqual(["seedbed", "row", "container", "element"]);
  });

  it("root vegetables → row, seedbed", () => {
    expect(getDefaultPlacements(sp({ id: "carrot", name: "Gulerod", category: "vegetable", subCategory: "root" })))
      .toEqual(["row", "seedbed"]);
  });

  it("nightshade vegetables → row, element, container", () => {
    expect(getDefaultPlacements(sp({ id: "tomato", name: "Tomat", category: "vegetable", subCategory: "nightshade" })))
      .toEqual(["row", "element", "container"]);
  });

  it("perennial vegetable → element, container", () => {
    expect(getDefaultPlacements(sp({ id: "artichoke", name: "Artiskok", category: "vegetable", lifecycle: "perennial" })))
      .toEqual(["element", "container"]);
  });

  it("cover crops → seedbed, row", () => {
    expect(getDefaultPlacements(sp({ id: "clover", name: "Kløver", category: "cover-crop" }))).toEqual(["seedbed", "row"]);
  });

  it("fruit → element, container", () => {
    expect(getDefaultPlacements(sp({ id: "strawberry", name: "Jordbær", category: "fruit" }))).toEqual(["element", "container"]);
  });

  it("explicit overrides are respected", () => {
    expect(getDefaultPlacements(sp({
      id: "custom", name: "Custom", category: "vegetable",
      allowedPlacements: ["container"],
    }))).toEqual(["container"]);
  });

  it("climber → fallback all four", () => {
    expect(getDefaultPlacements(sp({ id: "hop", name: "Humle", category: "climber" })))
      .toEqual(["element", "row", "seedbed", "container"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. canPlaceInCategory
// ═══════════════════════════════════════════════════════════════════════════
describe("canPlaceInCategory", () => {
  it("anything can be placed in 'area'", () => {
    expect(canPlaceInCategory(sp({ id: "x", name: "X", category: "tree" }), "area")).toBe(true);
  });

  it("tree can be placed in 'element'", () => {
    expect(canPlaceInCategory(sp({ id: "oak", name: "Eg", category: "tree" }), "element")).toBe(true);
  });

  it("tree cannot be placed in 'seedbed'", () => {
    expect(canPlaceInCategory(sp({ id: "oak", name: "Eg", category: "tree" }), "seedbed")).toBe(false);
  });

  it("herb can be placed in container", () => {
    expect(canPlaceInCategory(sp({ id: "mint", name: "Mynte", category: "herb" }), "container")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. getPrimaryPlacement
// ═══════════════════════════════════════════════════════════════════════════
describe("getPrimaryPlacement", () => {
  it("tree → element", () => {
    expect(getPrimaryPlacement(sp({ id: "oak", name: "Eg", category: "tree" }))).toBe("element");
  });

  it("herb → seedbed", () => {
    expect(getPrimaryPlacement(sp({ id: "basil", name: "Basilikum", category: "herb" }))).toBe("seedbed");
  });

  it("root vegetable → row", () => {
    expect(getPrimaryPlacement(sp({ id: "carrot", name: "Gulerod", category: "vegetable", subCategory: "root" }))).toBe("row");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. computeShadeImpact
// ═══════════════════════════════════════════════════════════════════════════
describe("computeShadeImpact", () => {
  it("returns a ShadeAnalysis with all required fields", () => {
    const result = computeShadeImpact(10, 3, 5, 0, 55.7);
    expect(result).toHaveProperty("avgShadeHoursPerDay");
    expect(result).toHaveProperty("peakShadeHours");
    expect(result).toHaveProperty("shadowLengthMidsummerM");
    expect(result).toHaveProperty("shadowLengthEquinoxM");
    expect(result).toHaveProperty("shadowDirectionNoon");
    expect(result).toHaveProperty("monthlyShadeHours");
    expect(result.monthlyShadeHours).toHaveLength(6); // Apr–Sep
  });

  it("close target to the north receives significant shade", () => {
    // Target 3m north of a 10m tree at 55.7°N — should get lots of shade
    const result = computeShadeImpact(10, 3, 3, 0, 55.7);
    expect(result.avgShadeHoursPerDay).toBeGreaterThan(1);
  });

  it("distant target receives less shade", () => {
    const close = computeShadeImpact(10, 3, 5, 0, 55.7);
    const far = computeShadeImpact(10, 3, 50, 0, 55.7);
    expect(far.avgShadeHoursPerDay).toBeLessThan(close.avgShadeHoursPerDay);
  });

  it("shadow lengths are positive and equinox > midsummer", () => {
    const result = computeShadeImpact(10, 3, 5, 0, 55.7);
    expect(result.shadowLengthMidsummerM).toBeGreaterThan(0);
    expect(result.shadowLengthEquinoxM).toBeGreaterThan(0);
    // At 55°N, equinox sun is lower → longer shadows
    expect(result.shadowLengthEquinoxM).toBeGreaterThan(result.shadowLengthMidsummerM);
  });

  it("taller tree casts more shade", () => {
    const short = computeShadeImpact(5, 2, 8, 0, 55.7);
    const tall = computeShadeImpact(15, 4, 8, 0, 55.7);
    expect(tall.avgShadeHoursPerDay).toBeGreaterThanOrEqual(short.avgShadeHoursPerDay);
  });

  it("peak shade >= average shade", () => {
    const result = computeShadeImpact(10, 3, 5, 180, 55.7);
    expect(result.peakShadeHours).toBeGreaterThanOrEqual(result.avgShadeHoursPerDay);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. minSunHoursForLight
// ═══════════════════════════════════════════════════════════════════════════
describe("minSunHoursForLight", () => {
  it("full-sun → 6", () => expect(minSunHoursForLight("full-sun")).toBe(6));
  it("partial-shade → 3", () => expect(minSunHoursForLight("partial-shade")).toBe(3));
  it("shade → 0", () => expect(minSunHoursForLight("shade")).toBe(0));
  it("undefined → 4", () => expect(minSunHoursForLight(undefined)).toBe(4));
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. maxAcceptableShadeHours
// ═══════════════════════════════════════════════════════════════════════════
describe("maxAcceptableShadeHours", () => {
  it("full-sun → 2", () => expect(maxAcceptableShadeHours("full-sun")).toBe(2));
  it("partial-shade → 4", () => expect(maxAcceptableShadeHours("partial-shade")).toBe(4));
  it("shade → 999", () => expect(maxAcceptableShadeHours("shade")).toBe(999));
  it("undefined → 3", () => expect(maxAcceptableShadeHours(undefined)).toBe(3));
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. couldCastSignificantShade
// ═══════════════════════════════════════════════════════════════════════════
describe("couldCastSignificantShade", () => {
  it("target within 2.5× height → true", () => {
    expect(couldCastSignificantShade(10, 20)).toBe(true);  // 20 < 25
  });

  it("target beyond 2.5× height → false", () => {
    expect(couldCastSignificantShade(10, 30)).toBe(false); // 30 > 25
  });

  it("exact boundary → false (not strictly less)", () => {
    expect(couldCastSignificantShade(10, 25)).toBe(false); // 25 == 25
  });

  it("very close → true", () => {
    expect(couldCastSignificantShade(5, 1)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. estimateHeightM
// ═══════════════════════════════════════════════════════════════════════════
describe("estimateHeightM", () => {
  it("returns explicit matureHeightM if set", () => {
    expect(estimateHeightM(sp({ id: "x", name: "X", category: "tree", matureHeightM: 8 }))).toBe(8);
  });

  it("canopy layer → 15", () => {
    expect(estimateHeightM(sp({ id: "x", name: "X", category: "tree", forestGardenLayer: "canopy" }))).toBe(15);
  });

  it("sub-canopy → 6", () => {
    expect(estimateHeightM(sp({ id: "x", name: "X", category: "tree", forestGardenLayer: "sub-canopy" }))).toBe(6);
  });

  it("shrub layer → 2.5", () => {
    expect(estimateHeightM(sp({ id: "x", name: "X", category: "bush", forestGardenLayer: "shrub" }))).toBe(2.5);
  });

  it("tree category without layer → 10", () => {
    expect(estimateHeightM(sp({ id: "x", name: "X", category: "tree" }))).toBe(10);
  });

  it("bush category without layer → 2", () => {
    expect(estimateHeightM(sp({ id: "x", name: "X", category: "bush" }))).toBe(2);
  });

  it("fruit category → 3", () => {
    expect(estimateHeightM(sp({ id: "x", name: "X", category: "fruit" }))).toBe(3);
  });

  it("vegetable → null (not a shade caster)", () => {
    expect(estimateHeightM(sp({ id: "x", name: "X", category: "vegetable" }))).toBeNull();
  });

  it("herb → null", () => {
    expect(estimateHeightM(sp({ id: "x", name: "X", category: "herb" }))).toBeNull();
  });
});
