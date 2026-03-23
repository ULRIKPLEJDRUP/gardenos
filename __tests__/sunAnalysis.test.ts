/**
 * sunAnalysis.test.ts — unit tests for sun exposure analysis utilities.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock dependencies — must come before sunAnalysis import
// ---------------------------------------------------------------------------

// Mock plantStore
vi.mock("../app/lib/plantStore", () => ({
  getPlantById: vi.fn(() => null),
  getInstancesForFeature: vi.fn(() => []),
}));

// Mock plantTypes
vi.mock("../app/lib/plantTypes", () => ({
  estimateHeightM: vi.fn((sp: { heightMaxCm?: number }) =>
    sp?.heightMaxCm ? sp.heightMaxCm / 100 : null
  ),
}));

// Mock conflictDetection
vi.mock("../app/lib/conflictDetection", () => ({
  haversineM: vi.fn(
    (a: [number, number], b: [number, number]) => {
      // Simple Euclidean approximation in metres for tests
      const dlat = (b[1] - a[1]) * 111320;
      const dlng = (b[0] - a[0]) * 111320 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
      return Math.sqrt(dlat * dlat + dlng * dlng);
    }
  ),
  geoBearing: vi.fn(
    (from: [number, number], to: [number, number]) => {
      const dlng = to[0] - from[0];
      const dlat = to[1] - from[1];
      let angle = Math.atan2(dlng, dlat) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      return angle;
    }
  ),
  canopyRadiusM: vi.fn(() => 2),
}));

// ---------------------------------------------------------------------------
// Import under test — AFTER mocks
// ---------------------------------------------------------------------------
import {
  extractShadeCasters,
  estimateShadeAtPoint,
  sunHoursToColor,
  sunLevelLabel,
  type ShadeCaster,
} from "../app/lib/sunAnalysis";

import { getPlantById, getInstancesForFeature } from "../app/lib/plantStore";
import type { FeatureCollection, Geometry } from "geojson";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("sunAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── sunHoursToColor ──

  describe("sunHoursToColor", () => {
    it("returns rgba string", () => {
      const result = sunHoursToColor(8);
      expect(result).toMatch(/^rgba\(\d+,\d+,\d+,[\d.]+\)$/);
    });

    it("uses default opacity 0.35", () => {
      const result = sunHoursToColor(10);
      expect(result).toContain(",0.35)");
    });

    it("uses custom opacity", () => {
      const result = sunHoursToColor(10, 0.8);
      expect(result).toContain(",0.8)");
    });

    it("clamps values above 15", () => {
      const at15 = sunHoursToColor(15);
      const at20 = sunHoursToColor(20);
      expect(at15).toBe(at20);
    });

    it("clamps values below 0", () => {
      const at0 = sunHoursToColor(0);
      const atNeg = sunHoursToColor(-5);
      expect(at0).toBe(atNeg);
    });

    it("produces different colours for different sun hours", () => {
      const low = sunHoursToColor(2);
      const mid = sunHoursToColor(8);
      const high = sunHoursToColor(14);
      expect(low).not.toBe(mid);
      expect(mid).not.toBe(high);
      expect(low).not.toBe(high);
    });

    it("full sun is warm (high red)", () => {
      const result = sunHoursToColor(15);
      // Parse rgba
      const match = result.match(/rgba\((\d+),(\d+),(\d+)/);
      expect(match).toBeTruthy();
      const r = parseInt(match![1]);
      // Full sun should have high red component
      expect(r).toBeGreaterThan(200);
    });

    it("full shade is cool (high blue)", () => {
      const result = sunHoursToColor(0);
      const match = result.match(/rgba\((\d+),(\d+),(\d+)/);
      expect(match).toBeTruthy();
      const b = parseInt(match![3]);
      // Full shade should have relatively high blue
      expect(b).toBeGreaterThan(80);
    });
  });

  // ── sunLevelLabel ──

  describe("sunLevelLabel", () => {
    it("returns full sun for >= 12 hours", () => {
      expect(sunLevelLabel(12)).toContain("Fuld sol");
      expect(sunLevelLabel(15)).toContain("Fuld sol");
    });

    it("returns partial sun for 8-11 hours", () => {
      expect(sunLevelLabel(8)).toContain("Delvis sol");
      expect(sunLevelLabel(11)).toContain("Delvis sol");
    });

    it("returns partial shade for 4-7 hours", () => {
      expect(sunLevelLabel(4)).toContain("Delvis skygge");
      expect(sunLevelLabel(7)).toContain("Delvis skygge");
    });

    it("returns shade for < 4 hours", () => {
      expect(sunLevelLabel(0)).toContain("Skygge");
      expect(sunLevelLabel(3)).toContain("Skygge");
    });
  });

  // ── extractShadeCasters ──

  describe("extractShadeCasters", () => {
    it("returns empty array for empty layout", () => {
      const layout: FeatureCollection<Geometry> = { type: "FeatureCollection", features: [] };
      expect(extractShadeCasters(layout)).toEqual([]);
    });

    it("returns empty for null/undefined layout", () => {
      expect(extractShadeCasters(null as unknown as FeatureCollection<Geometry>)).toEqual([]);
    });

    it("extracts casters from structures with structureHeight", () => {
      const layout: FeatureCollection<Geometry> = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [12.5, 55.7] },
            properties: {
              gardenosId: "structure-1",
              kind: "building",
              structureHeight: 5,
              name: "Shed",
            },
          },
        ],
      };
      const casters = extractShadeCasters(layout);
      expect(casters).toHaveLength(1);
      expect(casters[0].heightM).toBe(5);
      expect(casters[0].name).toBe("Shed");
      expect(casters[0].lat).toBeCloseTo(55.7, 1);
      expect(casters[0].lng).toBeCloseTo(12.5, 1);
    });

    it("extracts casters from tall plants", () => {
      const mockPlant = { name: "Æbletræ", heightMaxCm: 500, spacingCm: 300 };
      vi.mocked(getPlantById).mockReturnValue(mockPlant as ReturnType<typeof getPlantById>);
      vi.mocked(getInstancesForFeature).mockReturnValue([
        { speciesId: "apple", featureId: "tree-1", instanceId: "inst-1" } as ReturnType<typeof getInstancesForFeature>[number],
      ]);

      const layout: FeatureCollection<Geometry> = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [12.5, 55.7] },
            properties: { gardenosId: "tree-1" },
          },
        ],
      };
      const casters = extractShadeCasters(layout);
      expect(casters).toHaveLength(1);
      expect(casters[0].heightM).toBe(5);
      expect(casters[0].name).toBe("Æbletræ");
    });

    it("ignores short plants (< 1.5m)", () => {
      const mockPlant = { name: "Tomat", heightMaxCm: 100 };
      vi.mocked(getPlantById).mockReturnValue(mockPlant as ReturnType<typeof getPlantById>);
      vi.mocked(getInstancesForFeature).mockReturnValue([
        { speciesId: "tomato", featureId: "bed-1", instanceId: "inst-1" } as ReturnType<typeof getInstancesForFeature>[number],
      ]);

      const layout: FeatureCollection<Geometry> = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [12.5, 55.7] },
            properties: { gardenosId: "bed-1" },
          },
        ],
      };
      expect(extractShadeCasters(layout)).toEqual([]);
    });

    it("handles polygon centroids", () => {
      const layout: FeatureCollection<Geometry> = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [[[12.0, 55.0], [12.0, 56.0], [13.0, 56.0], [13.0, 55.0], [12.0, 55.0]]],
            },
            properties: { gardenosId: "area-1", structureHeight: 3, name: "Wall" },
          },
        ],
      };
      const casters = extractShadeCasters(layout);
      expect(casters).toHaveLength(1);
      // Centroid should be approximately (12.5, 55.5)
      expect(casters[0].lat).toBeCloseTo(55.5, 0);
      expect(casters[0].lng).toBeCloseTo(12.5, 0);
    });

    it("skips features without gardenosId", () => {
      const layout: FeatureCollection<Geometry> = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [12.5, 55.7] },
            properties: { structureHeight: 10 },
          },
        ],
      };
      expect(extractShadeCasters(layout)).toEqual([]);
    });
  });

  // ── estimateShadeAtPoint ──

  describe("estimateShadeAtPoint", () => {
    it("returns 0 for no casters", () => {
      expect(estimateShadeAtPoint(55.7, 12.5, [], 55.7)).toBe(0);
    });

    it("returns 0 for distant casters (> 80m)", () => {
      const casters: ShadeCaster[] = [
        { lat: 56.0, lng: 13.0, heightM: 10, canopyRadiusM: 3, name: "Far tree" },
      ];
      // 56.0 vs 55.7 = ~33km away — way beyond 80m threshold
      expect(estimateShadeAtPoint(55.7, 12.5, casters, 55.7)).toBe(0);
    });

    it("returns positive shade for nearby tall caster", () => {
      // Place caster very close (< 80m), SOUTH of target.
      // At 55.7°N the sun is in the south, shadows fall north.
      // Caster south → shadow northward → covers the target.
      const baseLat = 55.7;
      const baseLng = 12.5;
      // Offset by ~10m south (roughly −0.00009 degrees)
      const casters: ShadeCaster[] = [
        { lat: baseLat - 0.00009, lng: baseLng, heightM: 10, canopyRadiusM: 3, name: "Big tree" },
      ];
      const shade = estimateShadeAtPoint(baseLat, baseLng, casters, baseLat);
      expect(shade).toBeGreaterThan(0);
    });

    it("returns value between 0 and 15", () => {
      const baseLat = 55.7;
      const baseLng = 12.5;
      const casters: ShadeCaster[] = [
        { lat: baseLat + 0.00005, lng: baseLng, heightM: 15, canopyRadiusM: 5, name: "Massive tree" },
      ];
      const shade = estimateShadeAtPoint(baseLat, baseLng, casters, baseLat);
      expect(shade).toBeGreaterThanOrEqual(0);
      expect(shade).toBeLessThanOrEqual(15);
    });

    it("taller trees cast more shade", () => {
      const baseLat = 55.7;
      const baseLng = 12.5;
      const offset = 0.00009; // ~10m

      const shortTree: ShadeCaster[] = [
        { lat: baseLat + offset, lng: baseLng, heightM: 3, canopyRadiusM: 1, name: "Short" },
      ];
      const tallTree: ShadeCaster[] = [
        { lat: baseLat + offset, lng: baseLng, heightM: 15, canopyRadiusM: 5, name: "Tall" },
      ];

      const shortShade = estimateShadeAtPoint(baseLat, baseLng, shortTree, baseLat);
      const tallShade = estimateShadeAtPoint(baseLat, baseLng, tallTree, baseLat);
      expect(tallShade).toBeGreaterThanOrEqual(shortShade);
    });
  });
});
