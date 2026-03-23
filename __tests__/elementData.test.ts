/**
 * elementData.test.ts — unit tests for the infrastructure element catalogue:
 * type definitions, lookup helpers, mode-based filtering, label records.
 */
import { describe, it, expect } from "vitest";

import {
  ALL_INFRA_ELEMENTS,
  getInfraElementById,
  getInfraElementsForMode,
  ELEMENT_MODE_LABELS,
  ELEMENT_MODE_ICONS,
  INFRA_CATEGORY_LABELS,
} from "../app/lib/elementData";
import type { InfraElement, ElementModeKey, InfraCategory } from "../app/lib/elementData";

// ---------------------------------------------------------------------------
// ALL_INFRA_ELEMENTS catalogue
// ---------------------------------------------------------------------------
describe("ALL_INFRA_ELEMENTS", () => {
  it("contains elements from all three modes", () => {
    const modes = new Set(ALL_INFRA_ELEMENTS.map((e) => e.mode));
    expect(modes).toContain("vand");
    expect(modes).toContain("el");
    expect(modes).toContain("lampe");
    expect(modes.size).toBe(3);
  });

  it("has a non-trivial number of elements", () => {
    expect(ALL_INFRA_ELEMENTS.length).toBeGreaterThanOrEqual(18);
  });

  it("every element has unique id", () => {
    const ids = ALL_INFRA_ELEMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every element has unique featureKind", () => {
    const kinds = ALL_INFRA_ELEMENTS.map((e) => e.featureKind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("every element has required fields filled", () => {
    for (const el of ALL_INFRA_ELEMENTS) {
      expect(el.id).toBeTruthy();
      expect(el.name).toBeTruthy();
      expect(el.description).toBeTruthy();
      expect(el.icon).toBeTruthy();
      expect(["vand", "el", "lampe"]).toContain(el.mode);
      expect(["pipe", "fixture", "cable", "outlet", "light"]).toContain(el.infraCategory);
      expect(["point", "polyline"]).toContain(el.geometry);
      expect(el.featureKind).toBeTruthy();
    }
  });

  it("exclusionRadiusCm is positive when defined", () => {
    const withRadius = ALL_INFRA_ELEMENTS.filter((e) => e.exclusionRadiusCm != null);
    expect(withRadius.length).toBeGreaterThan(0);
    for (const el of withRadius) {
      expect(el.exclusionRadiusCm).toBeGreaterThan(0);
    }
  });

  it("polyline elements are pipes, cables, or LED strings", () => {
    const polylines = ALL_INFRA_ELEMENTS.filter((e) => e.geometry === "polyline");
    expect(polylines.length).toBeGreaterThan(0);
    for (const el of polylines) {
      expect(["pipe", "cable", "light"]).toContain(el.infraCategory);
    }
  });
});

// ---------------------------------------------------------------------------
// getInfraElementById
// ---------------------------------------------------------------------------
describe("getInfraElementById", () => {
  it("returns correct element for a known id", () => {
    const pipe = getInfraElementById("water-pipe");
    expect(pipe).toBeDefined();
    expect(pipe!.name).toBe("Vandrør");
    expect(pipe!.mode).toBe("vand");
    expect(pipe!.geometry).toBe("polyline");
  });

  it("returns water-tap with correct exclusion radius", () => {
    const tap = getInfraElementById("water-tap");
    expect(tap).toBeDefined();
    expect(tap!.exclusionRadiusCm).toBe(25);
    expect(tap!.geometry).toBe("point");
  });

  it("returns water-sprinkler with correct exclusion radius", () => {
    const sprinkler = getInfraElementById("water-sprinkler");
    expect(sprinkler).toBeDefined();
    expect(sprinkler!.exclusionRadiusCm).toBe(50);
  });

  it("returns electric-solar with correct exclusion radius", () => {
    const solar = getInfraElementById("electric-solar");
    expect(solar).toBeDefined();
    expect(solar!.exclusionRadiusCm).toBe(60);
  });

  it("returns water-barrel with correct exclusion radius", () => {
    const barrel = getInfraElementById("water-barrel");
    expect(barrel).toBeDefined();
    expect(barrel!.exclusionRadiusCm).toBe(40);
  });

  it("returns undefined for unknown id", () => {
    expect(getInfraElementById("does-not-exist")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getInfraElementById("")).toBeUndefined();
  });

  it("returns the same object as in ALL_INFRA_ELEMENTS", () => {
    for (const el of ALL_INFRA_ELEMENTS) {
      expect(getInfraElementById(el.id)).toBe(el);
    }
  });
});

// ---------------------------------------------------------------------------
// getInfraElementsForMode
// ---------------------------------------------------------------------------
describe("getInfraElementsForMode", () => {
  it("returns only vand elements for mode 'vand'", () => {
    const elements = getInfraElementsForMode("vand");
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.mode).toBe("vand");
    }
  });

  it("returns only el elements for mode 'el'", () => {
    const elements = getInfraElementsForMode("el");
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.mode).toBe("el");
    }
  });

  it("returns only lampe elements for mode 'lampe'", () => {
    const elements = getInfraElementsForMode("lampe");
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(el.mode).toBe("lampe");
    }
  });

  it("returns empty array for unknown mode", () => {
    expect(getInfraElementsForMode("unknown" as ElementModeKey)).toEqual([]);
  });

  it("combined lengths equal ALL_INFRA_ELEMENTS length", () => {
    const vand = getInfraElementsForMode("vand");
    const el = getInfraElementsForMode("el");
    const lampe = getInfraElementsForMode("lampe");
    expect(vand.length + el.length + lampe.length).toBe(ALL_INFRA_ELEMENTS.length);
  });

  it("vand elements include pipes and fixtures", () => {
    const vand = getInfraElementsForMode("vand");
    const categories = new Set(vand.map((e) => e.infraCategory));
    expect(categories).toContain("pipe");
    expect(categories).toContain("fixture");
  });

  it("el elements include cables and outlets", () => {
    const el = getInfraElementsForMode("el");
    const categories = new Set(el.map((e) => e.infraCategory));
    expect(categories).toContain("cable");
    expect(categories).toContain("outlet");
  });

  it("lampe elements are all category 'light'", () => {
    const lampe = getInfraElementsForMode("lampe");
    for (const el of lampe) {
      expect(el.infraCategory).toBe("light");
    }
  });
});

// ---------------------------------------------------------------------------
// Label & icon records
// ---------------------------------------------------------------------------
describe("ELEMENT_MODE_LABELS", () => {
  it("has labels for all three modes", () => {
    expect(ELEMENT_MODE_LABELS.vand).toBeTruthy();
    expect(ELEMENT_MODE_LABELS.el).toBeTruthy();
    expect(ELEMENT_MODE_LABELS.lampe).toBeTruthy();
  });

  it("labels are in Danish", () => {
    expect(ELEMENT_MODE_LABELS.vand).toContain("Vand");
    expect(ELEMENT_MODE_LABELS.el).toContain("El");
    expect(ELEMENT_MODE_LABELS.lampe).toContain("Lampe");
  });
});

describe("ELEMENT_MODE_ICONS", () => {
  it("has emoji icons for all three modes", () => {
    expect(ELEMENT_MODE_ICONS.vand).toBeTruthy();
    expect(ELEMENT_MODE_ICONS.el).toBeTruthy();
    expect(ELEMENT_MODE_ICONS.lampe).toBeTruthy();
  });
});

describe("INFRA_CATEGORY_LABELS", () => {
  const allCategories: InfraCategory[] = ["pipe", "fixture", "cable", "outlet", "light"];

  it("has labels for every InfraCategory", () => {
    for (const cat of allCategories) {
      expect(INFRA_CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });

  it("covers all categories used by elements", () => {
    const usedCategories = new Set(ALL_INFRA_ELEMENTS.map((e) => e.infraCategory));
    for (const cat of usedCategories) {
      expect(INFRA_CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Specific element spot checks
// ---------------------------------------------------------------------------
describe("specific element checks", () => {
  it("LED-lyskæde is a polyline lamp", () => {
    const led = getInfraElementById("lamp-led-string");
    expect(led).toBeDefined();
    expect(led!.geometry).toBe("polyline");
    expect(led!.mode).toBe("lampe");
  });

  it("solcellelampe is a point with no exclusion radius", () => {
    const solar = getInfraElementById("lamp-solar");
    expect(solar).toBeDefined();
    expect(solar!.geometry).toBe("point");
    expect(solar!.exclusionRadiusCm).toBeUndefined();
  });

  it("drypslange is a water polyline", () => {
    const drip = getInfraElementById("water-drip-line");
    expect(drip).toBeDefined();
    expect(drip!.geometry).toBe("polyline");
    expect(drip!.infraCategory).toBe("pipe");
  });

  it("solcellepanel has exclusionRadiusCm of 60", () => {
    const panel = getInfraElementById("electric-solar");
    expect(panel).toBeDefined();
    expect(panel!.exclusionRadiusCm).toBe(60);
    expect(panel!.infraCategory).toBe("outlet");
  });
});
