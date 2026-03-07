// ---------------------------------------------------------------------------
// GardenOS – Tests: Plant data & element data integrity
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import {
  PLANT_CATEGORY_LABELS,
  VEGETABLE_SUB_LABELS,
  LIGHT_LABELS,
  WATER_LABELS,
  LIFECYCLE_LABELS,
  PLANT_FAMILY_LABELS,
  PLACEMENT_LABELS,
  PLACEMENT_ICONS,
  getDefaultPlacements,
} from "../app/lib/plantTypes";
import type { PlantSpecies } from "../app/lib/plantTypes";
import {
  ALL_INFRA_ELEMENTS,
  getInfraElementById,
  getInfraElementsForMode,
  ELEMENT_MODE_LABELS,
} from "../app/lib/elementData";

describe("Plant type labels", () => {
  it("should have labels for all plant categories", () => {
    const categories = Object.keys(PLANT_CATEGORY_LABELS);
    expect(categories.length).toBeGreaterThanOrEqual(8);
    expect(categories).toContain("vegetable");
    expect(categories).toContain("fruit");
    expect(categories).toContain("herb");
  });

  it("should have labels for all vegetable sub-categories", () => {
    expect(Object.keys(VEGETABLE_SUB_LABELS).length).toBeGreaterThanOrEqual(7);
  });

  it("should have labels for light, water, lifecycle, family", () => {
    expect(Object.keys(LIGHT_LABELS).length).toBe(3);
    expect(Object.keys(WATER_LABELS).length).toBe(3);
    expect(Object.keys(LIFECYCLE_LABELS).length).toBe(3);
    expect(Object.keys(PLANT_FAMILY_LABELS).length).toBeGreaterThanOrEqual(10);
  });

  it("should have placement labels and icons for all types", () => {
    const placements = Object.keys(PLACEMENT_LABELS);
    expect(placements).toEqual(["element", "row", "seedbed", "container"]);
    for (const p of placements) {
      expect(PLACEMENT_ICONS[p as keyof typeof PLACEMENT_ICONS]).toBeDefined();
    }
  });
});

describe("getDefaultPlacements", () => {
  it("should return element for trees", () => {
    const species = { category: "tree" } as PlantSpecies;
    expect(getDefaultPlacements(species)).toEqual(["element"]);
  });

  it("should return row, seedbed for root vegetables", () => {
    const species = { category: "vegetable", subCategory: "root" } as PlantSpecies;
    expect(getDefaultPlacements(species)).toEqual(["row", "seedbed"]);
  });

  it("should respect allowedPlacements override", () => {
    const species = {
      category: "tree",
      allowedPlacements: ["element", "container"],
    } as PlantSpecies;
    expect(getDefaultPlacements(species)).toEqual(["element", "container"]);
  });

  it("should return element, container for perennial vegetables", () => {
    const species = {
      category: "vegetable",
      lifecycle: "perennial",
    } as PlantSpecies;
    expect(getDefaultPlacements(species)).toEqual(["element", "container"]);
  });
});

describe("Infrastructure elements", () => {
  it("should have elements for all three modes", () => {
    expect(getInfraElementsForMode("vand").length).toBeGreaterThan(0);
    expect(getInfraElementsForMode("el").length).toBeGreaterThan(0);
    expect(getInfraElementsForMode("lampe").length).toBeGreaterThan(0);
  });

  it("should have mode labels for all modes", () => {
    expect(ELEMENT_MODE_LABELS.vand).toBeDefined();
    expect(ELEMENT_MODE_LABELS.el).toBeDefined();
    expect(ELEMENT_MODE_LABELS.lampe).toBeDefined();
  });

  it("should find elements by id", () => {
    const tap = getInfraElementById("water-tap");
    expect(tap).toBeDefined();
    expect(tap?.name).toBe("Vandhane / tappehane");
    expect(tap?.geometry).toBe("point");
  });

  it("should have unique ids across all elements", () => {
    const ids = ALL_INFRA_ELEMENTS.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("should have valid geometry types", () => {
    for (const el of ALL_INFRA_ELEMENTS) {
      expect(["point", "polyline"]).toContain(el.geometry);
    }
  });
});
