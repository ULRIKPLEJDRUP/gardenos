/**
 * smartRecommendations.test.ts — unit tests for context-aware plant
 * recommendation scoring: soil matching, sun matching, season timing,
 * frost safety, and the main getSmartRecommendations function.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock plantStore BEFORE importing smartRecommendations
vi.mock("../app/lib/plantStore", () => ({
  getPlantRecommendations: vi.fn(() => []),
  getAllPlants: vi.fn(() => []),
}));

import {
  getSmartRecommendations,
  SMART_STRATEGY_CONFIG,
  monthNameDa,
} from "../app/lib/smartRecommendations";
import type { SmartContext, SmartStrategy } from "../app/lib/smartRecommendations";
import { getPlantRecommendations, getAllPlants } from "../app/lib/plantStore";
import type { PlantSpecies } from "../app/lib/plantTypes";
import type { SoilProfile } from "../app/lib/soilTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlant(overrides: Record<string, unknown> & { id: string }): PlantSpecies {
  return {
    name: overrides.id,
    ...overrides,
  } as unknown as PlantSpecies;
}

function makeContext(overrides: Partial<SmartContext> = {}): SmartContext {
  return {
    existingSpeciesIds: [],
    soil: null,
    sunHours: null,
    currentMonth: 6,
    currentTempC: null,
    frostRisk: false,
    ...overrides,
  };
}

function makeSoil(overrides: Partial<SoilProfile> = {}): SoilProfile {
  return {
    id: "soil-1",
    name: "Test Soil",
    baseType: "loam",
    knowledgeLevel: "some",
    ...overrides,
  } as SoilProfile;
}

// ---------------------------------------------------------------------------
// SMART_STRATEGY_CONFIG
// ---------------------------------------------------------------------------
describe("SMART_STRATEGY_CONFIG", () => {
  const allStrategies: SmartStrategy[] = [
    "companion", "biodiversity", "nutrition", "color", "forest-layer",
    "soil-match", "sun-match", "season-timing", "frost-safe",
  ];

  it("has config for all smart strategies", () => {
    for (const s of allStrategies) {
      expect(SMART_STRATEGY_CONFIG[s]).toBeDefined();
      expect(SMART_STRATEGY_CONFIG[s].emoji).toBeTruthy();
      expect(SMART_STRATEGY_CONFIG[s].label).toBeTruthy();
      expect(SMART_STRATEGY_CONFIG[s].description).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// monthNameDa
// ---------------------------------------------------------------------------
describe("monthNameDa", () => {
  it("returns Danish month name for valid months", () => {
    expect(monthNameDa(1)).toBe("Januar");
    expect(monthNameDa(6)).toBe("Juni");
    expect(monthNameDa(12)).toBe("December");
  });

  it("returns empty string for month 0 (index exists but empty)", () => {
    expect(monthNameDa(0)).toBe("");
  });

  it("returns fallback for out-of-range month", () => {
    expect(monthNameDa(13)).toBe("M13");
    expect(monthNameDa(99)).toBe("M99");
  });
});

// ---------------------------------------------------------------------------
// getSmartRecommendations – soil-match
// ---------------------------------------------------------------------------
describe("getSmartRecommendations – soil-match", () => {
  beforeEach(() => {
    vi.mocked(getPlantRecommendations).mockReturnValue([]);
  });

  it("boosts plant when pH is within species range", () => {
    const plant = makePlant({
      id: "tomato", family: "Solanaceae", category: "vegetable",
      phRange: { min: 6.0, max: 7.0 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ soil: makeSoil({ phMeasured: 6.5 }) });
    const results = getSmartRecommendations(ctx, ["soil-match"]);
    expect(results.length).toBe(1);
    expect(results[0].totalScore).toBeGreaterThan(0);
    expect(results[0].reasons.some((r) => r.text.includes("pH"))).toBe(true);
  });

  it("gives slight boost when pH is just outside range (within 0.5)", () => {
    const plant = makePlant({
      id: "tomato", family: "Solanaceae", category: "vegetable",
      phRange: { min: 6.0, max: 7.0 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ soil: makeSoil({ phMeasured: 5.6 }) });
    const results = getSmartRecommendations(ctx, ["soil-match"]);
    expect(results.length).toBe(1);
    expect(results[0].totalScore).toBeGreaterThan(0);
    expect(results[0].reasons.some((r) => r.text.includes("næsten"))).toBe(true);
  });

  it("penalises plant when pH is far outside range", () => {
    const plant = makePlant({
      id: "blueberry", family: "Ericaceae", category: "fruit",
      phRange: { min: 4.0, max: 5.5 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ soil: makeSoil({ phMeasured: 7.5 }) });
    const results = getSmartRecommendations(ctx, ["soil-match"]);
    // Score is negative, so filtered out (totalScore > 0 required)
    expect(results.length).toBe(0);
  });

  it("boosts when drainage matches water need", () => {
    const plant = makePlant({
      id: "cactus", family: "Cactaceae", category: "succulent",
      water: "drought-tolerant" as PlantSpecies["water"],
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ soil: makeSoil({ drainage: "high" as SoilProfile["drainage"] }) });
    const results = getSmartRecommendations(ctx, ["soil-match"]);
    expect(results.length).toBe(1);
    expect(results[0].totalScore).toBeGreaterThan(0);
  });

  it("returns empty when no soil profile provided", () => {
    const plant = makePlant({
      id: "tomato", family: "Solanaceae", category: "vegetable",
      phRange: { min: 6.0, max: 7.0 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ soil: null });
    const results = getSmartRecommendations(ctx, ["soil-match"]);
    expect(results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSmartRecommendations – sun-match
// ---------------------------------------------------------------------------
describe("getSmartRecommendations – sun-match", () => {
  beforeEach(() => {
    vi.mocked(getPlantRecommendations).mockReturnValue([]);
  });

  it("boosts full-sun plant when sun hours >= 6", () => {
    const plant = makePlant({
      id: "tomato", family: "Solanaceae", category: "vegetable",
      light: "full-sun",
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ sunHours: 8 });
    const results = getSmartRecommendations(ctx, ["sun-match"]);
    expect(results.length).toBe(1);
    expect(results[0].totalScore).toBeGreaterThan(0);
  });

  it("penalises full-sun plant when sun hours < 6", () => {
    const plant = makePlant({
      id: "tomato", family: "Solanaceae", category: "vegetable",
      light: "full-sun",
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ sunHours: 3 });
    const results = getSmartRecommendations(ctx, ["sun-match"]);
    // Large deficit → negative score → filtered out
    expect(results.length).toBe(0);
  });

  it("boosts shade plant when sun hours are low", () => {
    const plant = makePlant({
      id: "hosta", family: "Asparagaceae", category: "perennial",
      light: "shade",
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ sunHours: 2 });
    const results = getSmartRecommendations(ctx, ["sun-match"]);
    expect(results.length).toBe(1);
    expect(results[0].totalScore).toBeGreaterThan(0);
  });

  it("slightly penalises shade plant in too much sun", () => {
    const plant = makePlant({
      id: "hosta", family: "Asparagaceae", category: "perennial",
      light: "shade",
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ sunHours: 10 });
    const results = getSmartRecommendations(ctx, ["sun-match"]);
    // Mild penalty -1, so filtered out (needs > 0)
    expect(results.length).toBe(0);
  });

  it("returns empty when sunHours is null", () => {
    const plant = makePlant({
      id: "tomato", family: "Solanaceae", category: "vegetable",
      light: "full-sun",
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ sunHours: null });
    const results = getSmartRecommendations(ctx, ["sun-match"]);
    expect(results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSmartRecommendations – season-timing
// ---------------------------------------------------------------------------
describe("getSmartRecommendations – season-timing", () => {
  beforeEach(() => {
    vi.mocked(getPlantRecommendations).mockReturnValue([]);
  });

  it("boosts plant that can be sown outdoors in current month", () => {
    const plant = makePlant({
      id: "carrot", family: "Apiaceae", category: "vegetable",
      sowOutdoor: { from: 4, to: 6 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ currentMonth: 5 });
    const results = getSmartRecommendations(ctx, ["season-timing"]);
    expect(results.length).toBe(1);
    expect(results[0].totalScore).toBeGreaterThan(0);
    expect(results[0].reasons.some((r) => r.text.includes("udendørs"))).toBe(true);
  });

  it("boosts plant that can be sown indoors in current month", () => {
    const plant = makePlant({
      id: "tomato", family: "Solanaceae", category: "vegetable",
      sowIndoor: { from: 2, to: 4 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ currentMonth: 3 });
    const results = getSmartRecommendations(ctx, ["season-timing"]);
    expect(results.length).toBe(1);
    expect(results[0].reasons.some((r) => r.text.includes("indendørs"))).toBe(true);
  });

  it("boosts plant that can be planted out now", () => {
    const plant = makePlant({
      id: "squash", family: "Cucurbitaceae", category: "vegetable",
      plantOut: { from: 5, to: 6 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ currentMonth: 5 });
    const results = getSmartRecommendations(ctx, ["season-timing"]);
    expect(results.length).toBe(1);
    expect(results[0].reasons.some((r) => r.text.includes("plantes ud"))).toBe(true);
  });

  it("gives small boost for plants in harvest season", () => {
    const plant = makePlant({
      id: "apple", family: "Rosaceae", category: "fruit",
      harvest: { from: 8, to: 10 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ currentMonth: 9 });
    const results = getSmartRecommendations(ctx, ["season-timing"]);
    expect(results.length).toBe(1);
    expect(results[0].reasons.some((r) => r.text.includes("Høst"))).toBe(true);
  });

  it("returns empty when plant is out of season", () => {
    const plant = makePlant({
      id: "carrot", family: "Apiaceae", category: "vegetable",
      sowOutdoor: { from: 4, to: 6 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ currentMonth: 11 });
    const results = getSmartRecommendations(ctx, ["season-timing"]);
    expect(results.length).toBe(0);
  });

  it("handles wrap-around month ranges (e.g. Oct-Feb)", () => {
    const plant = makePlant({
      id: "garlic", family: "Amaryllidaceae", category: "vegetable",
      sowOutdoor: { from: 10, to: 2 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    // November is in range (10-2 wraps)
    const ctx = makeContext({ currentMonth: 11 });
    const results = getSmartRecommendations(ctx, ["season-timing"]);
    expect(results.length).toBe(1);

    // June is NOT in range
    const ctx2 = makeContext({ currentMonth: 6 });
    const results2 = getSmartRecommendations(ctx2, ["season-timing"]);
    expect(results2.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSmartRecommendations – frost-safe
// ---------------------------------------------------------------------------
describe("getSmartRecommendations – frost-safe", () => {
  beforeEach(() => {
    vi.mocked(getPlantRecommendations).mockReturnValue([]);
  });

  it("boosts frost-hardy plant when frost risk is present", () => {
    const plant = makePlant({
      id: "kale", family: "Brassicaceae", category: "vegetable",
      frostHardy: true,
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ currentTempC: 1, frostRisk: true });
    const results = getSmartRecommendations(ctx, ["frost-safe"]);
    expect(results.length).toBe(1);
    expect(results[0].totalScore).toBeGreaterThan(0);
    expect(results[0].reasons.some((r) => r.text.includes("Frosttolerant"))).toBe(true);
  });

  it("penalises frost-sensitive plant when frost risk is present", () => {
    const plant = makePlant({
      id: "basil", family: "Lamiaceae", category: "herb",
      frostHardy: false,
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ currentTempC: 1, frostRisk: true });
    const results = getSmartRecommendations(ctx, ["frost-safe"]);
    expect(results.length).toBe(0);
  });

  it("penalises cool-season plant in hot weather", () => {
    const plant = makePlant({
      id: "spinach", family: "Amaranthaceae", category: "vegetable",
      seasonType: "cool" as PlantSpecies["seasonType"],
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ currentTempC: 32, frostRisk: false });
    const results = getSmartRecommendations(ctx, ["frost-safe"]);
    expect(results.length).toBe(0);
  });

  it("returns empty when temperature is null", () => {
    const plant = makePlant({
      id: "kale", family: "Brassicaceae", category: "vegetable",
      frostHardy: true,
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({ currentTempC: null, frostRisk: true });
    const results = getSmartRecommendations(ctx, ["frost-safe"]);
    expect(results.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getSmartRecommendations – mixed strategies
// ---------------------------------------------------------------------------
describe("getSmartRecommendations – combined scoring", () => {
  beforeEach(() => {
    vi.mocked(getPlantRecommendations).mockReturnValue([]);
  });

  it("combines scores from multiple smart strategies", () => {
    const plant = makePlant({
      id: "tomato", family: "Solanaceae", category: "vegetable",
      light: "full-sun",
      phRange: { min: 6.0, max: 7.0 },
      sowOutdoor: { from: 5, to: 6 },
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({
      sunHours: 7,
      soil: makeSoil({ phMeasured: 6.5 }),
      currentMonth: 5,
    });
    const results = getSmartRecommendations(ctx, ["sun-match", "soil-match", "season-timing"]);
    expect(results.length).toBe(1);
    // Should have reasons from all three strategies
    expect(results[0].reasons.length).toBeGreaterThanOrEqual(3);
    // High combined score
    expect(results[0].totalScore).toBeGreaterThanOrEqual(6);
  });

  it("excludes existing species from results", () => {
    const plant = makePlant({
      id: "tomato", family: "Solanaceae", category: "vegetable",
      light: "full-sun",
    });
    vi.mocked(getAllPlants).mockReturnValue([plant]);

    const ctx = makeContext({
      existingSpeciesIds: ["tomato"],
      sunHours: 8,
    });
    const results = getSmartRecommendations(ctx, ["sun-match"]);
    expect(results.length).toBe(0);
  });

  it("skips plants without family or category", () => {
    const incomplete = { id: "nofam", name: "No Family" } as unknown as PlantSpecies;
    vi.mocked(getAllPlants).mockReturnValue([incomplete]);

    const ctx = makeContext({ sunHours: 8 });
    const results = getSmartRecommendations(ctx, ["sun-match"]);
    expect(results.length).toBe(0);
  });

  it("merges base and smart strategy results", () => {
    const plant1 = makePlant({ id: "p1", family: "F1", category: "vegetable", light: "full-sun" });
    const plant2 = makePlant({ id: "p2", family: "F2", category: "vegetable" });

    // Base strategies return p2 with score 5
    vi.mocked(getPlantRecommendations).mockReturnValue([
      { species: plant2, totalScore: 5, reasons: [{ emoji: "🤝", text: "Good companion", score: 5 }] },
    ]);
    vi.mocked(getAllPlants).mockReturnValue([plant1, plant2]);

    const ctx = makeContext({ sunHours: 8 });
    const results = getSmartRecommendations(ctx, ["companion", "sun-match"]);

    // Both should appear: p2 from base + sun, p1 from sun only
    expect(results.length).toBe(2);
    // p2 should have higher score (base 5 + sun 3 = 8 vs p1 sun 3)
    expect(results[0].species.id).toBe("p2");
    expect(results[0].totalScore).toBeGreaterThan(results[1].totalScore);
  });

  it("respects maxResults parameter", () => {
    const plants = Array.from({ length: 20 }, (_, i) =>
      makePlant({
        id: `plant-${i}`,
        family: `Family${i}`,
        category: "vegetable",
        light: "full-sun",
      }),
    );
    vi.mocked(getAllPlants).mockReturnValue(plants);

    const ctx = makeContext({ sunHours: 8 });
    const results = getSmartRecommendations(ctx, ["sun-match"], 5);
    expect(results.length).toBe(5);
  });

  it("returns sorted by totalScore descending", () => {
    const plants = [
      makePlant({
        id: "low", family: "F1", category: "vegetable",
        light: "shade",
      }),
      makePlant({
        id: "high", family: "F2", category: "vegetable",
        light: "full-sun",
        phRange: { min: 6.0, max: 7.0 },
      }),
    ];
    vi.mocked(getAllPlants).mockReturnValue(plants);

    const ctx = makeContext({
      sunHours: 2,
      soil: makeSoil({ phMeasured: 6.5 }),
    });
    const results = getSmartRecommendations(ctx, ["sun-match", "soil-match"]);

    if (results.length > 1) {
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].totalScore).toBeGreaterThanOrEqual(results[i].totalScore);
      }
    }
  });
});
