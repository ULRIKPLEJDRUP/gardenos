/**
 * seasonColors.test.ts — unit tests for the season color system:
 * month helpers, phase computation, phase scaling, color lookups,
 * shape guessing, and color utilities.
 */
import { describe, it, expect } from "vitest";

import {
  MONTH_NAMES_DA,
  MONTH_ICONS,
  PHASE_LABELS_DA,
  getPhaseScale,
  getPhase,
  DEFAULT_PALETTES,
  getSeasonColors,
  GROUND_COLORS,
  guessPlantShape,
  lightenColor,
} from "../app/lib/seasonColors";
import type { PlantCalendar } from "../app/lib/seasonColors";
import type { GrowthPhase } from "../app/lib/bedLayoutTypes";

// ---------------------------------------------------------------------------
// Month helpers
// ---------------------------------------------------------------------------
describe("MONTH_NAMES_DA", () => {
  it("has 13 entries (index 0 is empty)", () => {
    expect(MONTH_NAMES_DA.length).toBe(13);
    expect(MONTH_NAMES_DA[0]).toBe("");
  });

  it("maps 1-12 to Danish month names", () => {
    expect(MONTH_NAMES_DA[1]).toBe("Januar");
    expect(MONTH_NAMES_DA[6]).toBe("Juni");
    expect(MONTH_NAMES_DA[12]).toBe("December");
  });
});

describe("MONTH_ICONS", () => {
  it("has 13 entries (index 0 is empty)", () => {
    expect(MONTH_ICONS.length).toBe(13);
    expect(MONTH_ICONS[0]).toBe("");
  });

  it("uses snowflake for winter months", () => {
    expect(MONTH_ICONS[1]).toBe("❄️");
    expect(MONTH_ICONS[2]).toBe("❄️");
    expect(MONTH_ICONS[12]).toBe("❄️");
  });

  it("uses sun icons for summer months", () => {
    expect(MONTH_ICONS[6]).toBe("☀️");
    expect(MONTH_ICONS[7]).toBe("🌞");
  });
});

// ---------------------------------------------------------------------------
// PHASE_LABELS_DA
// ---------------------------------------------------------------------------
describe("PHASE_LABELS_DA", () => {
  const allPhases: GrowthPhase[] = [
    "dormant", "sprouting", "growing", "flowering", "fruiting", "harvesting", "dying",
  ];

  it("has Danish labels for all growth phases", () => {
    for (const phase of allPhases) {
      expect(PHASE_LABELS_DA[phase].text).toBeTruthy();
      expect(PHASE_LABELS_DA[phase].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// getPhaseScale
// ---------------------------------------------------------------------------
describe("getPhaseScale", () => {
  it("returns smallest scale for dormant", () => {
    expect(getPhaseScale("dormant")).toBe(0.1);
  });

  it("returns 1.0 for fruiting (full size)", () => {
    expect(getPhaseScale("fruiting")).toBe(1.0);
  });

  it("scales increase from dormant through fruiting", () => {
    expect(getPhaseScale("dormant")).toBeLessThan(getPhaseScale("sprouting"));
    expect(getPhaseScale("sprouting")).toBeLessThan(getPhaseScale("growing"));
    expect(getPhaseScale("growing")).toBeLessThan(getPhaseScale("flowering"));
    expect(getPhaseScale("flowering")).toBeLessThan(getPhaseScale("fruiting"));
  });

  it("harvesting is near full size", () => {
    expect(getPhaseScale("harvesting")).toBe(0.95);
  });

  it("dying is between dormant and growing", () => {
    const dying = getPhaseScale("dying");
    expect(dying).toBeGreaterThan(getPhaseScale("dormant"));
    expect(dying).toBeLessThan(getPhaseScale("growing"));
  });

  it("returns 0.5 for unknown phase", () => {
    expect(getPhaseScale("unknown" as GrowthPhase)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// getPhase — phase computation
// ---------------------------------------------------------------------------
describe("getPhase", () => {
  // Typical annual vegetable: sow in March, grow from April, flower June,
  // harvest Aug-Sep, die October
  const tomatoCal: PlantCalendar = {
    sowMonth: 3,
    growStart: 4,
    flowerMonth: 6,
    harvestStart: 8,
    harvestEnd: 9,
    dieMonth: 10,
  };

  it("returns dormant before sow month", () => {
    expect(getPhase(tomatoCal, 1)).toBe("dormant");
    expect(getPhase(tomatoCal, 2)).toBe("dormant");
  });

  it("returns sprouting at sow month", () => {
    expect(getPhase(tomatoCal, 3)).toBe("sprouting");
  });

  it("returns growing after growStart", () => {
    expect(getPhase(tomatoCal, 4)).toBe("growing");
    expect(getPhase(tomatoCal, 5)).toBe("growing");
  });

  it("returns flowering from flowerMonth", () => {
    expect(getPhase(tomatoCal, 6)).toBe("flowering");
    expect(getPhase(tomatoCal, 7)).toBe("flowering");
  });

  it("returns fruiting from harvestStart", () => {
    expect(getPhase(tomatoCal, 8)).toBe("fruiting");
  });

  it("returns harvesting at harvestEnd", () => {
    expect(getPhase(tomatoCal, 9)).toBe("harvesting");
  });

  it("returns dormant at dieMonth (dieMonth takes priority)", () => {
    expect(getPhase(tomatoCal, 10)).toBe("dormant");
  });

  it("returns dormant after dieMonth", () => {
    expect(getPhase(tomatoCal, 11)).toBe("dormant");
    expect(getPhase(tomatoCal, 12)).toBe("dormant");
  });

  // Perennial (no sow, no die)
  const perennialCal: PlantCalendar = {
    sowMonth: null,
    growStart: 3,
    flowerMonth: 5,
    harvestStart: 7,
    harvestEnd: 9,
    dieMonth: null,
  };

  it("perennial: dormant in winter", () => {
    expect(getPhase(perennialCal, 1)).toBe("dormant");
    expect(getPhase(perennialCal, 2)).toBe("dormant");
  });

  it("perennial: growing from growStart", () => {
    expect(getPhase(perennialCal, 3)).toBe("growing");
  });

  it("perennial: flowering from flowerMonth", () => {
    expect(getPhase(perennialCal, 5)).toBe("flowering");
    expect(getPhase(perennialCal, 6)).toBe("flowering");
  });

  it("perennial: fruiting from harvestStart", () => {
    expect(getPhase(perennialCal, 7)).toBe("fruiting");
    expect(getPhase(perennialCal, 8)).toBe("fruiting");
  });

  it("perennial: harvesting at harvestEnd", () => {
    expect(getPhase(perennialCal, 9)).toBe("harvesting");
  });

  it("perennial: dying one month after harvestEnd", () => {
    expect(getPhase(perennialCal, 10)).toBe("dying");
  });

  it("perennial: dormant well after harvestEnd", () => {
    expect(getPhase(perennialCal, 11)).toBe("dormant");
    expect(getPhase(perennialCal, 12)).toBe("dormant");
  });

  // Simple plant with no flowering/harvest
  const simpleCal: PlantCalendar = {
    sowMonth: 4,
    growStart: 5,
    flowerMonth: null,
    harvestStart: null,
    harvestEnd: null,
    dieMonth: 10,
  };

  it("simple plant: sprouting between sow and growStart", () => {
    expect(getPhase(simpleCal, 4)).toBe("sprouting");
  });

  it("simple plant: growing from growStart to dieMonth", () => {
    expect(getPhase(simpleCal, 5)).toBe("growing");
    expect(getPhase(simpleCal, 9)).toBe("growing");
  });

  it("simple plant: dying at dieMonth", () => {
    expect(getPhase(simpleCal, 10)).toBe("dying");
  });

  it("simple plant: dormant after dieMonth", () => {
    expect(getPhase(simpleCal, 11)).toBe("dormant");
  });

  // Edge cases
  it("returns dormant for month 0 (invalid)", () => {
    expect(getPhase(tomatoCal, 0)).toBe("dormant");
  });

  it("returns dormant for month 13 (invalid)", () => {
    expect(getPhase(tomatoCal, 13)).toBe("dormant");
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_PALETTES
// ---------------------------------------------------------------------------
describe("DEFAULT_PALETTES", () => {
  it("has palettes for vegetable, herb, fruit, flower", () => {
    expect(DEFAULT_PALETTES.vegetable).toBeDefined();
    expect(DEFAULT_PALETTES.herb).toBeDefined();
    expect(DEFAULT_PALETTES.fruit).toBeDefined();
    expect(DEFAULT_PALETTES.flower).toBeDefined();
  });

  it("each palette has all 7 growth phases", () => {
    const phases: GrowthPhase[] = [
      "dormant", "sprouting", "growing", "flowering", "fruiting", "harvesting", "dying",
    ];
    for (const [name, palette] of Object.entries(DEFAULT_PALETTES)) {
      for (const phase of phases) {
        expect(palette[phase], `${name}.${phase}`).toBeDefined();
        expect(palette[phase].foliage).toBeTruthy();
        expect(palette[phase].stem).toBeTruthy();
        expect(palette[phase].ground).toBeTruthy();
      }
    }
  });

  it("flowering phase has non-null accent color", () => {
    for (const [name, palette] of Object.entries(DEFAULT_PALETTES)) {
      expect(palette.flowering.accent, `${name}.flowering.accent`).toBeTruthy();
    }
  });

  it("dormant phase has null accent color", () => {
    for (const [name, palette] of Object.entries(DEFAULT_PALETTES)) {
      expect(palette.dormant.accent, `${name}.dormant.accent`).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// getSeasonColors
// ---------------------------------------------------------------------------
describe("getSeasonColors", () => {
  it("returns default vegetable colors when no custom palette", () => {
    const colors = getSeasonColors("growing");
    expect(colors).toEqual(DEFAULT_PALETTES.vegetable.growing);
  });

  it("uses category-specific default palette", () => {
    const colors = getSeasonColors("flowering", undefined, "herb");
    expect(colors).toEqual(DEFAULT_PALETTES.herb.flowering);
  });

  it("falls back to vegetable for unknown category", () => {
    const colors = getSeasonColors("growing", undefined, "unknown-category");
    expect(colors).toEqual(DEFAULT_PALETTES.vegetable.growing);
  });

  it("uses custom palette when provided", () => {
    const custom = {
      growing: { foliage: "#111111", stem: "#222222", accent: null, ground: "#333333" },
    };
    const colors = getSeasonColors("growing", custom);
    expect(colors.foliage).toBe("#111111");
  });

  it("falls back to default for phases not in custom palette", () => {
    const custom = {
      growing: { foliage: "#111111", stem: "#222222", accent: null, ground: "#333333" },
    };
    const colors = getSeasonColors("dormant", custom);
    expect(colors).toEqual(DEFAULT_PALETTES.vegetable.dormant);
  });
});

// ---------------------------------------------------------------------------
// GROUND_COLORS
// ---------------------------------------------------------------------------
describe("GROUND_COLORS", () => {
  it("has entries for months 1-12", () => {
    for (let m = 1; m <= 12; m++) {
      expect(GROUND_COLORS[m]).toBeTruthy();
      expect(GROUND_COLORS[m]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("winter months are darker than summer months", () => {
    // Compare numeric brightness: lower hex = darker
    const dec = parseInt(GROUND_COLORS[12].replace("#", ""), 16);
    const jun = parseInt(GROUND_COLORS[6].replace("#", ""), 16);
    expect(dec).toBeLessThanOrEqual(jun);
  });
});

// ---------------------------------------------------------------------------
// guessPlantShape
// ---------------------------------------------------------------------------
describe("guessPlantShape", () => {
  it("returns tree-canopy for canopy layer", () => {
    expect(guessPlantShape({ forestGardenLayer: "canopy" })).toBe("tree-canopy");
  });

  it("returns tree-canopy for sub-canopy layer", () => {
    expect(guessPlantShape({ forestGardenLayer: "sub-canopy" })).toBe("tree-canopy");
  });

  it("returns tree-canopy for tree category", () => {
    expect(guessPlantShape({ category: "tree" })).toBe("tree-canopy");
  });

  it("returns ground-cover for ground-cover layer", () => {
    expect(guessPlantShape({ forestGardenLayer: "ground-cover" })).toBe("ground-cover");
  });

  it("returns climber for climber layer", () => {
    expect(guessPlantShape({ forestGardenLayer: "climber" })).toBe("climber");
  });

  it("returns bushy for shrub category", () => {
    expect(guessPlantShape({ category: "shrub" })).toBe("bushy");
  });

  it("returns bushy for shrub layer", () => {
    expect(guessPlantShape({ forestGardenLayer: "shrub" })).toBe("bushy");
  });

  it("returns bushy for tall plant (> 1.5m)", () => {
    expect(guessPlantShape({ matureHeightM: 2.0 })).toBe("bushy");
  });

  it("returns upright for medium plant (0.5-1.5m)", () => {
    expect(guessPlantShape({ matureHeightM: 1.0 })).toBe("upright");
  });

  it("returns grass for herb category", () => {
    expect(guessPlantShape({ category: "herb" })).toBe("grass");
    expect(guessPlantShape({ category: "krydderi" })).toBe("grass");
  });

  it("returns bulb for løg/bulb category", () => {
    expect(guessPlantShape({ category: "løg" })).toBe("bulb");
    expect(guessPlantShape({ category: "bulb" })).toBe("bulb");
  });

  it("returns rosette for root/rodveg category", () => {
    expect(guessPlantShape({ category: "root" })).toBe("rosette");
    expect(guessPlantShape({ category: "rodveg" })).toBe("rosette");
  });

  it("returns leafy for salat/leafy/blad category", () => {
    expect(guessPlantShape({ category: "salat" })).toBe("leafy");
    expect(guessPlantShape({ category: "leafy" })).toBe("leafy");
    expect(guessPlantShape({ category: "blad" })).toBe("leafy");
  });

  it("returns leafy as default fallback", () => {
    expect(guessPlantShape({})).toBe("leafy");
    expect(guessPlantShape({ matureHeightM: 0.2 })).toBe("leafy");
  });

  it("prioritises forest garden layer over category", () => {
    // ground-cover layer overrides any category
    expect(guessPlantShape({ category: "herb", forestGardenLayer: "ground-cover" })).toBe("ground-cover");
  });

  it("prioritises category over height", () => {
    // shrub category wins even with low height
    expect(guessPlantShape({ category: "shrub", matureHeightM: 0.3 })).toBe("bushy");
  });
});

// ---------------------------------------------------------------------------
// lightenColor
// ---------------------------------------------------------------------------
describe("lightenColor", () => {
  it("returns rgb string for hex input", () => {
    const result = lightenColor("#000000", 50);
    expect(result).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it("lightens black by adding amount to all channels", () => {
    expect(lightenColor("#000000", 50)).toBe("rgb(50,50,50)");
  });

  it("clamps at 255", () => {
    expect(lightenColor("#ffffff", 50)).toBe("rgb(255,255,255)");
  });

  it("works with colored hex", () => {
    // #804020 → R=128, G=64, B=32 → +30 → R=158, G=94, B=62
    expect(lightenColor("#804020", 30)).toBe("rgb(158,94,62)");
  });

  it("amount 0 returns original values", () => {
    expect(lightenColor("#102030", 0)).toBe("rgb(16,32,48)");
  });
});
