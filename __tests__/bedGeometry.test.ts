/**
 * bedGeometry.test.ts — unit tests for bed geometry coordinate conversions,
 * point-in-polygon, distance, collision, snapping, and row generation.
 */
import { describe, it, expect } from "vitest";

import {
  geoRingToMetric,
  metricRingToBedLocal,
  geoPolygonToBedLayout,
  bedLocalToGeo,
  pointInBedOutline,
  distanceCm,
  rectsOverlap,
  circlesOverlap,
  snapToGrid,
  generateRowPositions,
} from "../app/lib/bedGeometry";

import type { BedLocalCoord } from "../app/lib/bedLayoutTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple rectangular ring [lng,lat] around a point. */
function rectGeoRing(
  centerLng: number,
  centerLat: number,
  widthDeg: number,
  heightDeg: number
): [number, number][] {
  const hw = widthDeg / 2;
  const hh = heightDeg / 2;
  return [
    [centerLng - hw, centerLat - hh],
    [centerLng + hw, centerLat - hh],
    [centerLng + hw, centerLat + hh],
    [centerLng - hw, centerLat + hh],
    [centerLng - hw, centerLat - hh], // close ring
  ];
}

/** Simple rectangular outline in bed-local cm. */
function rectOutline(w: number, h: number): BedLocalCoord[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
    { x: 0, y: 0 },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("bedGeometry", () => {
  // ── geoRingToMetric ──

  describe("geoRingToMetric", () => {
    it("returns metric context with correct centroid", () => {
      const ring = rectGeoRing(12.5, 55.7, 0.001, 0.001);
      const { ctx } = geoRingToMetric(ring);
      expect(ctx.midLat).toBeCloseTo(55.7, 1);
      expect(ctx.midLng).toBeCloseTo(12.5, 1);
    });

    it("mpLat is always ~111320", () => {
      const { ctx } = geoRingToMetric(rectGeoRing(12.5, 55.7, 0.001, 0.001));
      expect(ctx.mpLat).toBe(111320);
    });

    it("mpLng decreases with latitude (cos effect)", () => {
      const { ctx: equator } = geoRingToMetric(rectGeoRing(0, 0, 0.001, 0.001));
      const { ctx: nordic } = geoRingToMetric(rectGeoRing(12.5, 55.7, 0.001, 0.001));
      expect(nordic.mpLng).toBeLessThan(equator.mpLng);
    });

    it("converts ring points to metric offsets from centroid", () => {
      const ring = rectGeoRing(12.5, 55.7, 0.001, 0.001);
      const { mRing } = geoRingToMetric(ring);
      // Same number of points as input
      expect(mRing.length).toBe(ring.length);
      // Points should span a reasonable width/height in metres
      const xs = mRing.map((p) => p[0]);
      const ys = mRing.map((p) => p[1]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
    });

    it("metric dimensions are approximately correct", () => {
      // 0.001 degrees latitude ≈ 111.32 metres
      const ring = rectGeoRing(12.5, 55.7, 0.001, 0.001);
      const { mRing } = geoRingToMetric(ring);
      const ys = mRing.map((p) => p[1]);
      const heightM = Math.max(...ys) - Math.min(...ys);
      expect(heightM).toBeCloseTo(111.32, 0);
    });
  });

  // ── metricRingToBedLocal ──

  describe("metricRingToBedLocal", () => {
    it("converts to cm with 0,0 at top-left", () => {
      // 2m × 3m rectangle in metric
      const mRing: [number, number][] = [
        [-1, -1.5],
        [1, -1.5],
        [1, 1.5],
        [-1, 1.5],
        [-1, -1.5],
      ];
      const { outline, widthCm, lengthCm } = metricRingToBedLocal(mRing);
      expect(widthCm).toBe(200);
      expect(lengthCm).toBe(300);
      // Top-left should be (0, 0) or close
      const xs = outline.map((p) => p.x);
      const ys = outline.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(0, 0);
      expect(Math.min(...ys)).toBeCloseTo(0, 0);
    });

    it("flips Y axis (top = 0)", () => {
      const mRing: [number, number][] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ];
      const { outline } = metricRingToBedLocal(mRing);
      // Original top (y=1 in metric) should be y=0 in bed-local
      const topPoint = outline.find((p) => p.y === 0);
      expect(topPoint).toBeDefined();
    });
  });

  // ── geoPolygonToBedLayout ──

  describe("geoPolygonToBedLayout", () => {
    it("returns layout with correct featureId", () => {
      const ring = rectGeoRing(12.5, 55.7, 0.001, 0.001);
      const layout = geoPolygonToBedLayout("bed-1", ring);
      expect(layout.featureId).toBe("bed-1");
    });

    it("has positive width and length", () => {
      const ring = rectGeoRing(12.5, 55.7, 0.001, 0.001);
      const layout = geoPolygonToBedLayout("bed-1", ring);
      expect(layout.widthCm).toBeGreaterThan(0);
      expect(layout.lengthCm).toBeGreaterThan(0);
    });

    it("stores centroid coordinates", () => {
      const ring = rectGeoRing(12.5, 55.7, 0.001, 0.001);
      const layout = geoPolygonToBedLayout("bed-1", ring);
      expect(layout.centroidLat).toBeCloseTo(55.7, 1);
      expect(layout.centroidLng).toBeCloseTo(12.5, 1);
    });

    it("has outline points", () => {
      const ring = rectGeoRing(12.5, 55.7, 0.001, 0.001);
      const layout = geoPolygonToBedLayout("bed-1", ring);
      expect(layout.outlineCm.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ── bedLocalToGeo ──

  describe("bedLocalToGeo", () => {
    it("center of bed maps back close to centroid", () => {
      const ring = rectGeoRing(12.5, 55.7, 0.001, 0.001);
      const layout = geoPolygonToBedLayout("bed-1", ring);
      const center: BedLocalCoord = { x: layout.widthCm / 2, y: layout.lengthCm / 2 };
      const [lng, lat] = bedLocalToGeo(center, layout);
      expect(lat).toBeCloseTo(55.7, 2);
      expect(lng).toBeCloseTo(12.5, 2);
    });

    it("is approximately inverse of geoPolygonToBedLayout", () => {
      const ring = rectGeoRing(12.5, 55.7, 0.001, 0.001);
      const layout = geoPolygonToBedLayout("bed-1", ring);
      // Top-left corner (0,0) should map back near top-left of original ring
      const [lng, lat] = bedLocalToGeo({ x: 0, y: 0 }, layout);
      // Should be near top-left of the geo rectangle
      expect(lat).toBeCloseTo(55.7 + 0.0005, 2);
      expect(lng).toBeCloseTo(12.5 - 0.0005, 2);
    });
  });

  // ── pointInBedOutline ──

  describe("pointInBedOutline", () => {
    const outline = rectOutline(200, 300);

    it("detects point inside", () => {
      expect(pointInBedOutline({ x: 100, y: 150 }, outline)).toBe(true);
    });

    it("detects point outside (right)", () => {
      expect(pointInBedOutline({ x: 250, y: 150 }, outline)).toBe(false);
    });

    it("detects point outside (above)", () => {
      expect(pointInBedOutline({ x: 100, y: -10 }, outline)).toBe(false);
    });

    it("detects point outside (below)", () => {
      expect(pointInBedOutline({ x: 100, y: 350 }, outline)).toBe(false);
    });

    it("handles triangle outline", () => {
      const triangle: BedLocalCoord[] = [
        { x: 100, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 },
        { x: 100, y: 0 },
      ];
      expect(pointInBedOutline({ x: 100, y: 100 }, triangle)).toBe(true);
      expect(pointInBedOutline({ x: 10, y: 10 }, triangle)).toBe(false);
    });
  });

  // ── distanceCm ──

  describe("distanceCm", () => {
    it("returns 0 for same point", () => {
      expect(distanceCm({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(0);
    });

    it("calculates Euclidean distance", () => {
      expect(distanceCm({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });

    it("is symmetric", () => {
      const a = { x: 10, y: 20 };
      const b = { x: 30, y: 50 };
      expect(distanceCm(a, b)).toBe(distanceCm(b, a));
    });
  });

  // ── rectsOverlap ──

  describe("rectsOverlap", () => {
    it("detects overlapping rectangles", () => {
      const a = { x: 50, y: 50, w: 40, h: 40 };
      const b = { x: 70, y: 70, w: 40, h: 40 };
      expect(rectsOverlap(a, b)).toBe(true);
    });

    it("detects non-overlapping rectangles", () => {
      const a = { x: 0, y: 0, w: 10, h: 10 };
      const b = { x: 100, y: 100, w: 10, h: 10 };
      expect(rectsOverlap(a, b)).toBe(false);
    });

    it("detects touching edges as non-overlapping", () => {
      const a = { x: 0, y: 0, w: 10, h: 10 };
      const b = { x: 10, y: 0, w: 10, h: 10 };
      expect(rectsOverlap(a, b)).toBe(false);
    });

    it("is symmetric", () => {
      const a = { x: 50, y: 50, w: 40, h: 40 };
      const b = { x: 70, y: 70, w: 30, h: 30 };
      expect(rectsOverlap(a, b)).toBe(rectsOverlap(b, a));
    });
  });

  // ── circlesOverlap ──

  describe("circlesOverlap", () => {
    it("detects overlapping circles", () => {
      expect(circlesOverlap({ x: 0, y: 0 }, 10, { x: 15, y: 0 }, 10)).toBe(true);
    });

    it("detects non-overlapping circles", () => {
      expect(circlesOverlap({ x: 0, y: 0 }, 5, { x: 20, y: 0 }, 5)).toBe(false);
    });

    it("touching circles do not overlap (strict)", () => {
      expect(circlesOverlap({ x: 0, y: 0 }, 10, { x: 20, y: 0 }, 10)).toBe(false);
    });
  });

  // ── snapToGrid ──

  describe("snapToGrid", () => {
    const outline = rectOutline(200, 300);

    it("snaps position to grid", () => {
      const result = snapToGrid({ x: 51, y: 99 }, 50, outline);
      expect(result.snappedPosition.x).toBe(50);
      expect(result.snappedPosition.y).toBe(100);
    });

    it("does not snap when far from grid line", () => {
      const result = snapToGrid({ x: 30, y: 75 }, 50, outline);
      expect(result.snappedPosition.x).toBe(30); // 30 is far from 50
      expect(result.snappedPosition.y).toBe(75); // 75 is far from 50/100
    });

    it("generates grid guides on snap", () => {
      const result = snapToGrid({ x: 51, y: 99 }, 50, outline);
      expect(result.guides.length).toBeGreaterThan(0);
      expect(result.guides.some((g) => g.type === "grid")).toBe(true);
    });

    it("snaps to bed edges", () => {
      // Point near left edge (x ≈ 3, should snap to x=0)
      const result = snapToGrid({ x: 3, y: 150 }, 1000, outline); // large grid so grid snap doesn't interfere
      expect(result.snappedPosition.x).toBe(0);
      expect(result.guides.some((g) => g.type === "edge")).toBe(true);
    });

    it("handles empty outline", () => {
      const result = snapToGrid({ x: 51, y: 99 }, 50, []);
      expect(result.snappedPosition).toBeDefined();
    });
  });

  // ── generateRowPositions ──

  describe("generateRowPositions", () => {
    const outline = rectOutline(200, 300);

    it("generates horizontal rows", () => {
      const rows = generateRowPositions(outline, 50, 10, "horizontal");
      expect(rows.length).toBeGreaterThan(0);
      // Each row should run left→right (same y for start and end)
      for (const row of rows) {
        expect(row.start.y).toBe(row.end.y);
        expect(row.end.x).toBeGreaterThan(row.start.x);
      }
    });

    it("generates vertical rows", () => {
      const rows = generateRowPositions(outline, 50, 10, "vertical");
      expect(rows.length).toBeGreaterThan(0);
      // Each row should run top→bottom (same x for start and end)
      for (const row of rows) {
        expect(row.start.x).toBe(row.end.x);
        expect(row.end.y).toBeGreaterThan(row.start.y);
      }
    });

    it("respects edge margin", () => {
      const margin = 20;
      const rows = generateRowPositions(outline, 50, margin, "horizontal");
      for (const row of rows) {
        expect(row.start.y).toBeGreaterThanOrEqual(margin);
        expect(row.start.y).toBeLessThanOrEqual(300 - margin);
        expect(row.start.x).toBeGreaterThanOrEqual(margin);
      }
    });

    it("returns empty for degenerate outline", () => {
      expect(generateRowPositions([], 50, 10)).toEqual([]);
      expect(generateRowPositions([{ x: 0, y: 0 }], 50, 10)).toEqual([]);
    });

    it("more rows with smaller spacing", () => {
      const rows20 = generateRowPositions(outline, 20, 10, "horizontal");
      const rows80 = generateRowPositions(outline, 80, 10, "horizontal");
      expect(rows20.length).toBeGreaterThan(rows80.length);
    });

    it("no rows if spacing larger than bed", () => {
      const rows = generateRowPositions(outline, 1000, 10, "horizontal");
      expect(rows.length).toBe(0);
    });
  });
});
