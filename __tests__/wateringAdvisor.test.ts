/**
 * wateringAdvisor.test.ts — unit tests for smart watering recommendations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  computeWateringAdvice,
  sortByUrgency,
  URGENCY_CONFIG,
  type BedWateringAdvice,
  type WateringUrgency,
} from "../app/lib/wateringAdvisor";

import type { WeatherData, WeatherDay } from "../app/lib/weatherStore";
import type { PlantSpecies } from "../app/lib/plantTypes";
import type { SoilProfile } from "../app/lib/soilTypes";

// ---------------------------------------------------------------------------
// Helper — build weather data
// ---------------------------------------------------------------------------
function makeWeather(opts: {
  temperature?: number;
  windSpeed?: number;
  humidity?: number;
  precipitation?: number;
  recentRain3d?: number;
  recentRain7d?: number;
  forecastRain2d?: number;
} = {}): WeatherData {
  const temp = opts.temperature ?? 20;
  const wind = opts.windSpeed ?? 10;
  const hum = opts.humidity ?? 60;
  const precip = opts.precipitation ?? 0;

  // Build recentDays — last 7 days
  const rain3d = opts.recentRain3d ?? 0;
  const rain7d = opts.recentRain7d ?? rain3d;
  const daily3 = rain3d / 3;
  const daily7extra = (rain7d - rain3d) / 4;

  const recentDays: WeatherDay[] = [];
  for (let i = 0; i < 4; i++) {
    recentDays.push({
      date: `2025-07-0${i + 1}`,
      tempMax: temp + 2,
      tempMin: temp - 5,
      precipitation: daily7extra,
      description: "clear",
    } as WeatherDay);
  }
  for (let i = 0; i < 3; i++) {
    recentDays.push({
      date: `2025-07-0${i + 5}`,
      tempMax: temp + 2,
      tempMin: temp - 5,
      precipitation: daily3,
      description: "clear",
    } as WeatherDay);
  }

  // Build forecast — next 2 days
  const forecastRain = opts.forecastRain2d ?? 0;
  const forecast: WeatherDay[] = [
    {
      date: "2025-07-08",
      tempMax: temp + 2,
      tempMin: temp - 5,
      precipitation: forecastRain / 2,
      description: forecastRain > 0 ? "rain" : "clear",
    } as WeatherDay,
    {
      date: "2025-07-09",
      tempMax: temp + 2,
      tempMin: temp - 5,
      precipitation: forecastRain / 2,
      description: forecastRain > 0 ? "rain" : "clear",
    } as WeatherDay,
  ];

  return {
    current: {
      temperature: temp,
      humidity: hum,
      windSpeed: wind,
      precipitation: precip,
      description: "Klart",
    },
    recentDays,
    forecast,
  } as WeatherData;
}

function makePlant(water: "low" | "medium" | "high" = "medium"): PlantSpecies {
  return {
    id: `plant-${water}`,
    name: `${water}-water plant`,
    category: "vegetable",
    icon: "🌱",
    water,
  } as PlantSpecies;
}

function makeSoilProfile(drainage: "standing" | "retains" | "dries-fast" = "retains"): SoilProfile {
  return {
    id: "soil-1",
    name: "Test jord",
    drainage,
  } as SoilProfile;
}

// ═══════════════════════════════════════════════════════════════════════════
// URGENCY_CONFIG
// ═══════════════════════════════════════════════════════════════════════════

describe("URGENCY_CONFIG", () => {
  it("has entries for all 5 urgency levels", () => {
    const levels: WateringUrgency[] = ["none", "low", "moderate", "high", "critical"];
    for (const l of levels) {
      const cfg = URGENCY_CONFIG[l];
      expect(cfg).toBeDefined();
      expect(cfg.icon).toBeTruthy();
      expect(cfg.label).toBeTruthy();
      expect(cfg.color).toBeTruthy();
      expect(cfg.bg).toBeTruthy();
      expect(cfg.border).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// computeWateringAdvice
// ═══════════════════════════════════════════════════════════════════════════

describe("computeWateringAdvice", () => {
  // Mock Date to July (summer) so winter check doesn't interfere
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 6, 7)); // July 7, 2025
  });

  it("returns basic structure with no weather data", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test Bed",
      weather: null,
      soilProfile: null,
      plantSpecies: [],
    });

    expect(advice.featureId).toBe("bed-1");
    expect(advice.bedName).toBe("Test Bed");
    expect(advice.urgency).toBeDefined();
    expect(advice.adviceText).toBeTruthy();
    expect(advice.reasons.length).toBeGreaterThanOrEqual(1);
    expect(typeof advice.litresPerM2).toBe("number");
  });

  it("no weather data adds warning reason", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: null,
      soilProfile: null,
      plantSpecies: [],
    });

    expect(advice.reasons.some((r) => r.includes("Ingen vejrdata"))).toBe(true);
  });

  it("high water need plants increase urgency", () => {
    const base = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 22, recentRain3d: 3, recentRain7d: 10 }),
      soilProfile: null,
      plantSpecies: [],
    });

    const withHighNeed = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 22, recentRain3d: 3, recentRain7d: 10 }),
      soilProfile: null,
      plantSpecies: [makePlant("high")],
    });

    const urgencyOrder: WateringUrgency[] = ["none", "low", "moderate", "high", "critical"];
    const baseIdx = urgencyOrder.indexOf(base.urgency);
    const highIdx = urgencyOrder.indexOf(withHighNeed.urgency);
    expect(highIdx).toBeGreaterThanOrEqual(baseIdx);
    expect(withHighNeed.reasons.some((r) => r.includes("højt vandbehov"))).toBe(true);
  });

  it("low water need plants decrease urgency", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 20, recentRain3d: 3 }),
      soilProfile: null,
      plantSpecies: [makePlant("low")],
    });

    expect(advice.reasons.some((r) => r.includes("Tørketolerant"))).toBe(true);
  });

  it("heavy recent rain reduces urgency", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 20, recentRain3d: 15, recentRain7d: 25 }),
      soilProfile: null,
      plantSpecies: [makePlant("medium")],
    });

    expect(advice.urgency).toBe("none");
    expect(advice.reasons.some((r) => r.includes("nedbør de sidste 3 dage"))).toBe(true);
  });

  it("no rain increases urgency", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 22, recentRain3d: 0, recentRain7d: 2 }),
      soilProfile: null,
      plantSpecies: [makePlant("high")],
    });

    const urgencyOrder: WateringUrgency[] = ["none", "low", "moderate", "high", "critical"];
    expect(urgencyOrder.indexOf(advice.urgency)).toBeGreaterThanOrEqual(2); // at least moderate
    expect(advice.reasons.some((r) => r.includes("Næsten ingen nedbør") || r.includes("Meget lidt nedbør"))).toBe(true);
  });

  it("very high temperature increases urgency", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 32, recentRain3d: 3, recentRain7d: 10 }),
      soilProfile: null,
      plantSpecies: [makePlant("medium")],
    });

    expect(advice.reasons.some((r) => r.includes("Meget varmt"))).toBe(true);
  });

  it("cold temperature decreases urgency", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 5, recentRain3d: 3, recentRain7d: 10 }),
      soilProfile: null,
      plantSpecies: [makePlant("medium")],
    });

    expect(advice.reasons.some((r) => r.includes("Koldt"))).toBe(true);
  });

  it("strong wind increases urgency", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 22, windSpeed: 30, recentRain3d: 3 }),
      soilProfile: null,
      plantSpecies: [makePlant("medium")],
    });

    expect(advice.reasons.some((r) => r.includes("Kraftig vind"))).toBe(true);
  });

  it("forecast rain reduces urgency", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 22, recentRain3d: 1, forecastRain2d: 15 }),
      soilProfile: null,
      plantSpecies: [makePlant("medium")],
    });

    expect(advice.reasons.some((r) => r.includes("Regn forventet"))).toBe(true);
  });

  it("fast-draining soil increases urgency", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 22, recentRain3d: 3 }),
      soilProfile: makeSoilProfile("dries-fast"),
      plantSpecies: [makePlant("medium")],
    });

    expect(advice.drainageFactor).toBe("fast");
    expect(advice.reasons.some((r) => r.includes("tørrer hurtigt"))).toBe(true);
  });

  it("slow-draining soil decreases urgency", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 22, recentRain3d: 3 }),
      soilProfile: makeSoilProfile("standing"),
      plantSpecies: [makePlant("medium")],
    });

    expect(advice.drainageFactor).toBe("slow");
    expect(advice.reasons.some((r) => r.includes("holder godt på vand"))).toBe(true);
  });

  it("fast-draining soil increases litres recommendation", () => {
    const normalSoil = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 26, recentRain3d: 0, recentRain7d: 0 }),
      soilProfile: makeSoilProfile("retains"),
      plantSpecies: [makePlant("high")],
    });

    const fastSoil = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 26, recentRain3d: 0, recentRain7d: 0 }),
      soilProfile: makeSoilProfile("dries-fast"),
      plantSpecies: [makePlant("high")],
    });

    expect(fastSoil.litresPerM2).toBeGreaterThanOrEqual(normalSoil.litresPerM2);
  });

  it("winter months cap urgency at none", () => {
    vi.setSystemTime(new Date(2025, 0, 15)); // January 15

    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 22, recentRain3d: 0, recentRain7d: 0 }),
      soilProfile: null,
      plantSpecies: [makePlant("high")],
    });

    expect(advice.urgency).toBe("none");
    expect(advice.reasons.some((r) => r.includes("Vintersæson"))).toBe(true);
  });

  it("December is also winter", () => {
    vi.setSystemTime(new Date(2025, 11, 1)); // December 1

    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 20, recentRain3d: 0 }),
      soilProfile: null,
      plantSpecies: [makePlant("high")],
    });

    expect(advice.urgency).toBe("none");
  });

  it("critical conditions produce critical urgency", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({
        temperature: 35,
        windSpeed: 30,
        recentRain3d: 0,
        recentRain7d: 0,
        forecastRain2d: 0,
      }),
      soilProfile: makeSoilProfile("dries-fast"),
      plantSpecies: [makePlant("high")],
    });

    expect(advice.urgency).toBe("critical");
    expect(advice.litresPerM2).toBeGreaterThanOrEqual(8);
    expect(advice.adviceText).toContain("Akut");
  });

  it("adviceText changes based on urgency level", () => {
    // Low urgency
    const low = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: makeWeather({ temperature: 22, recentRain3d: 5, recentRain7d: 15, forecastRain2d: 5 }),
      soilProfile: null,
      plantSpecies: [makePlant("high")],
    });

    // The text should mention "Let vanding" or similar based on urgency
    if (low.urgency === "low") {
      expect(low.adviceText).toContain("Let vanding");
    } else if (low.urgency === "none") {
      expect(low.adviceText).toContain("nok fugt");
    }
  });

  it("returns correct plantWaterNeeds", () => {
    const advice = computeWateringAdvice({
      featureId: "bed-1",
      bedName: "Test",
      weather: null,
      soilProfile: null,
      plantSpecies: [makePlant("high"), makePlant("low"), makePlant("medium")],
    });

    expect(advice.plantWaterNeeds).toContain("high");
    expect(advice.plantWaterNeeds).toContain("low");
    expect(advice.plantWaterNeeds).toContain("medium");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// sortByUrgency
// ═══════════════════════════════════════════════════════════════════════════

describe("sortByUrgency", () => {
  it("sorts critical before high before moderate", () => {
    const advice: BedWateringAdvice[] = [
      { urgency: "low", featureId: "1" } as BedWateringAdvice,
      { urgency: "critical", featureId: "2" } as BedWateringAdvice,
      { urgency: "none", featureId: "3" } as BedWateringAdvice,
      { urgency: "high", featureId: "4" } as BedWateringAdvice,
      { urgency: "moderate", featureId: "5" } as BedWateringAdvice,
    ];

    const sorted = sortByUrgency(advice);
    expect(sorted.map((a) => a.urgency)).toEqual([
      "critical", "high", "moderate", "low", "none",
    ]);
  });

  it("does not mutate original array", () => {
    const advice: BedWateringAdvice[] = [
      { urgency: "none", featureId: "1" } as BedWateringAdvice,
      { urgency: "critical", featureId: "2" } as BedWateringAdvice,
    ];

    const sorted = sortByUrgency(advice);
    expect(sorted).not.toBe(advice);
    expect(advice[0].urgency).toBe("none"); // original unchanged
  });

  it("handles empty array", () => {
    expect(sortByUrgency([])).toEqual([]);
  });

  it("handles single element", () => {
    const advice = [{ urgency: "moderate", featureId: "1" } as BedWateringAdvice];
    expect(sortByUrgency(advice)).toHaveLength(1);
  });
});
