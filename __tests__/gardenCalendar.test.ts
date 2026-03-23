/**
 * gardenCalendar.test.ts — unit tests for the auto garden calendar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  buildGardenCalendar,
  getUpcomingActivities,
  activityCountsPerMonth,
  ACTIVITY_CONFIG,
  MONTH_NAMES_DA,
  MONTH_SHORT_DA,
} from "../app/lib/gardenCalendar";

import type { PlantSpecies, PlantInstance } from "../app/lib/plantTypes";

// ---------------------------------------------------------------------------
// Mock plantStore
// ---------------------------------------------------------------------------
const MOCK_PLANTS: Record<string, PlantSpecies> = {};
let MOCK_INSTANCES: PlantInstance[] = [];

vi.mock("../app/lib/plantStore", () => ({
  getPlantById: (id: string) => MOCK_PLANTS[id] ?? null,
  loadPlantInstances: () => MOCK_INSTANCES,
}));

// ---------------------------------------------------------------------------
// Helper — register a mock plant + instance
// ---------------------------------------------------------------------------
function addMockPlant(
  id: string,
  name: string,
  opts: {
    sowIndoor?: { from: number; to: number };
    sowOutdoor?: { from: number; to: number };
    plantOut?: { from: number; to: number };
    harvest?: { from: number; to: number };
    featureId?: string;
  } = {},
) {
  const featureId = opts.featureId ?? "bed-1";
  MOCK_PLANTS[id] = {
    id,
    name,
    category: "vegetable",
    icon: "🌱",
    sowIndoor: opts.sowIndoor,
    sowOutdoor: opts.sowOutdoor,
    plantOut: opts.plantOut,
    harvest: opts.harvest,
  } as PlantSpecies;
  MOCK_INSTANCES.push({
    id: `inst-${id}`,
    speciesId: id,
    featureId,
  } as PlantInstance);
}

beforeEach(() => {
  Object.keys(MOCK_PLANTS).forEach((k) => delete MOCK_PLANTS[k]);
  MOCK_INSTANCES = [];
});

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

describe("MONTH_NAMES_DA", () => {
  it("has 13 entries (index-0 empty, 1-12 Danish months)", () => {
    expect(MONTH_NAMES_DA).toHaveLength(13);
    expect(MONTH_NAMES_DA[0]).toBe("");
    expect(MONTH_NAMES_DA[1]).toBe("Januar");
    expect(MONTH_NAMES_DA[6]).toBe("Juni");
    expect(MONTH_NAMES_DA[12]).toBe("December");
  });
});

describe("MONTH_SHORT_DA", () => {
  it("has 13 entries with correct abbreviations", () => {
    expect(MONTH_SHORT_DA).toHaveLength(13);
    expect(MONTH_SHORT_DA[0]).toBe("");
    expect(MONTH_SHORT_DA[3]).toBe("Mar");
    expect(MONTH_SHORT_DA[12]).toBe("Dec");
  });
});

describe("ACTIVITY_CONFIG", () => {
  it("has entries for all 5 activity types", () => {
    const types = ["sow-indoor", "sow-outdoor", "plant-out", "harvest", "maintain"] as const;
    for (const t of types) {
      const cfg = ACTIVITY_CONFIG[t];
      expect(cfg).toBeDefined();
      expect(cfg.icon).toBeTruthy();
      expect(cfg.label).toBeTruthy();
      expect(cfg.color).toBeTruthy();
      expect(cfg.bg).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildGardenCalendar
// ═══════════════════════════════════════════════════════════════════════════

describe("buildGardenCalendar", () => {
  it("returns 12 months even with no plants", () => {
    const calendar = buildGardenCalendar();
    expect(calendar).toHaveLength(12);
    expect(calendar[0].month).toBe(1);
    expect(calendar[0].name).toBe("Januar");
    expect(calendar[11].month).toBe(12);
    expect(calendar[11].name).toBe("December");
  });

  it("all months have empty activities when no plants", () => {
    const calendar = buildGardenCalendar();
    for (const m of calendar) {
      expect(m.activities).toEqual([]);
    }
  });

  it("generates sow-outdoor activities for planted species", () => {
    addMockPlant("tomato", "Tomat", {
      sowOutdoor: { from: 4, to: 5 },
    });

    const calendar = buildGardenCalendar();

    // April should have sow-outdoor activity
    const april = calendar.find((m) => m.month === 4)!;
    expect(april.activities.length).toBeGreaterThanOrEqual(1);
    expect(april.activities[0].type).toBe("sow-outdoor");
    expect(april.activities[0].plantName).toBe("Tomat");
    expect(april.activities[0].icon).toBe("🌱");

    // May should also have it
    const may = calendar.find((m) => m.month === 5)!;
    expect(may.activities.length).toBeGreaterThanOrEqual(1);
    expect(may.activities[0].type).toBe("sow-outdoor");

    // March should not
    const march = calendar.find((m) => m.month === 3)!;
    expect(march.activities).toEqual([]);
  });

  it("generates sow-indoor activities", () => {
    addMockPlant("pepper", "Peberfrugt", {
      sowIndoor: { from: 2, to: 3 },
    });

    const calendar = buildGardenCalendar();
    const feb = calendar.find((m) => m.month === 2)!;
    expect(feb.activities[0].type).toBe("sow-indoor");
    expect(feb.activities[0].icon).toBe("🏠");
    expect(feb.activities[0].label).toContain("indendørs");
  });

  it("generates plant-out activities", () => {
    addMockPlant("lettuce", "Salat", {
      plantOut: { from: 5, to: 6 },
    });

    const calendar = buildGardenCalendar();
    const may = calendar.find((m) => m.month === 5)!;
    expect(may.activities.some((a) => a.type === "plant-out")).toBe(true);
  });

  it("generates harvest activities", () => {
    addMockPlant("carrot", "Gulerod", {
      harvest: { from: 8, to: 10 },
    });

    const calendar = buildGardenCalendar();
    const aug = calendar.find((m) => m.month === 8)!;
    expect(aug.activities.some((a) => a.type === "harvest")).toBe(true);
    expect(aug.activities[0].icon).toBe("🧺");

    const oct = calendar.find((m) => m.month === 10)!;
    expect(oct.activities.some((a) => a.type === "harvest")).toBe(true);
  });

  it("generates multiple activity types for same species", () => {
    addMockPlant("tomato", "Tomat", {
      sowIndoor: { from: 3, to: 3 },
      plantOut: { from: 5, to: 6 },
      harvest: { from: 7, to: 9 },
    });

    const calendar = buildGardenCalendar();

    // March: sow-indoor
    expect(calendar[2].activities.some((a) => a.type === "sow-indoor")).toBe(true);
    // May: plant-out
    expect(calendar[4].activities.some((a) => a.type === "plant-out")).toBe(true);
    // August: harvest
    expect(calendar[7].activities.some((a) => a.type === "harvest")).toBe(true);
  });

  it("deduplicates same species in same bed", () => {
    addMockPlant("lettuce", "Salat", {
      sowOutdoor: { from: 4, to: 4 },
    });
    // Add a second instance for same species in same bed
    MOCK_INSTANCES.push({
      id: "inst-lettuce-2",
      speciesId: "lettuce",
      featureId: "bed-1",
    } as PlantInstance);

    const calendar = buildGardenCalendar();
    const april = calendar.find((m) => m.month === 4)!;
    // Should only appear once (deduped by featureId:speciesId)
    const salat = april.activities.filter((a) => a.plantName === "Salat" && a.type === "sow-outdoor");
    expect(salat).toHaveLength(1);
  });

  it("allows same species in different beds", () => {
    addMockPlant("lettuce", "Salat", {
      sowOutdoor: { from: 4, to: 4 },
      featureId: "bed-1",
    });
    // Different bed
    MOCK_INSTANCES.push({
      id: "inst-lettuce-bed2",
      speciesId: "lettuce",
      featureId: "bed-2",
    } as PlantInstance);

    const calendar = buildGardenCalendar();
    const april = calendar.find((m) => m.month === 4)!;
    const salat = april.activities.filter((a) => a.plantName === "Salat" && a.type === "sow-outdoor");
    expect(salat).toHaveLength(2);
  });

  it("uses bedNames map for display", () => {
    addMockPlant("tomato", "Tomat", {
      harvest: { from: 8, to: 8 },
    });
    const bedNames = new Map([["bed-1", "Køkkenhave-bed A"]]);
    const calendar = buildGardenCalendar(bedNames);
    const aug = calendar.find((m) => m.month === 8)!;
    expect(aug.activities[0].bedName).toBe("Køkkenhave-bed A");
  });

  it("handles wrap-around month ranges (e.g. Nov–Feb)", () => {
    addMockPlant("garlic", "Hvidløg", {
      sowOutdoor: { from: 10, to: 2 },
    });

    const calendar = buildGardenCalendar();

    // Oct, Nov, Dec, Jan, Feb should all have activities
    for (const m of [10, 11, 12, 1, 2]) {
      const month = calendar.find((c) => c.month === m)!;
      expect(month.activities.length).toBeGreaterThanOrEqual(1);
    }

    // March should not
    const march = calendar.find((m) => m.month === 3)!;
    const garlic = march.activities.filter((a) => a.plantName === "Hvidløg");
    expect(garlic).toHaveLength(0);
  });

  it("sorts activities by type priority within a month", () => {
    // Add species with sow-indoor and harvest both in same month (March)
    addMockPlant("a-plant", "A-plante", {
      harvest: { from: 3, to: 3 },
      featureId: "bed-a",
    });
    addMockPlant("b-plant", "B-plante", {
      sowIndoor: { from: 3, to: 3 },
      featureId: "bed-b",
    });

    const calendar = buildGardenCalendar();
    const march = calendar.find((m) => m.month === 3)!;
    // sow-indoor should come before harvest
    const types = march.activities.map((a) => a.type);
    const sowIdx = types.indexOf("sow-indoor");
    const harvestIdx = types.indexOf("harvest");
    expect(sowIdx).toBeLessThan(harvestIdx);
  });

  it("skips species not found in plantStore", () => {
    // Add an instance without a matching plant
    MOCK_INSTANCES.push({
      id: "inst-ghost",
      speciesId: "nonexistent-plant",
      featureId: "bed-1",
    } as PlantInstance);

    const calendar = buildGardenCalendar();
    const totalActivities = calendar.reduce((s, m) => s + m.activities.length, 0);
    expect(totalActivities).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getUpcomingActivities
// ═══════════════════════════════════════════════════════════════════════════

describe("getUpcomingActivities", () => {
  it("returns activities for current month and next month by default", () => {
    addMockPlant("year-round", "Årplante", {
      sowOutdoor: { from: 1, to: 12 },
    });

    const calendar = buildGardenCalendar();
    const upcoming = getUpcomingActivities(calendar);

    // Should have activities from 2 months (default lookahead = 2)
    expect(upcoming.length).toBeGreaterThanOrEqual(2);
  });

  it("respects lookaheadMonths parameter", () => {
    // Put activities only in every month
    addMockPlant("lettuce", "Salat", {
      sowOutdoor: { from: 1, to: 12 },
    });

    const calendar = buildGardenCalendar();
    const upcoming1 = getUpcomingActivities(calendar, 1);
    const upcoming3 = getUpcomingActivities(calendar, 3);

    // With 1 month of activities per month, 3 months should have 3x as many
    expect(upcoming3.length).toBe(upcoming1.length * 3);
  });

  it("wraps around December → January", () => {
    addMockPlant("garlic", "Hvidløg", {
      sowOutdoor: { from: 1, to: 1 }, // Only January
    });

    const calendar = buildGardenCalendar();
    // With lookahead = 13 we should catch January
    const upcoming = getUpcomingActivities(calendar, 13);
    expect(upcoming.some((a) => a.plantName === "Hvidløg")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// activityCountsPerMonth
// ═══════════════════════════════════════════════════════════════════════════

describe("activityCountsPerMonth", () => {
  it("returns 12 counts", () => {
    const calendar = buildGardenCalendar();
    const counts = activityCountsPerMonth(calendar);
    expect(counts).toHaveLength(12);
  });

  it("returns all zeros for empty calendar", () => {
    const calendar = buildGardenCalendar();
    const counts = activityCountsPerMonth(calendar);
    expect(counts.every((c) => c === 0)).toBe(true);
  });

  it("counts activities correctly", () => {
    addMockPlant("tomato", "Tomat", {
      sowOutdoor: { from: 4, to: 5 },
      harvest: { from: 8, to: 8 },
    });

    const calendar = buildGardenCalendar();
    const counts = activityCountsPerMonth(calendar);

    // April (index 3), May (index 4): 1 sow activity each
    expect(counts[3]).toBe(1); // April
    expect(counts[4]).toBe(1); // May
    // August (index 7): 1 harvest
    expect(counts[7]).toBe(1);
    // Other months: 0
    expect(counts[0]).toBe(0); // January
    expect(counts[5]).toBe(0); // June
  });
});
