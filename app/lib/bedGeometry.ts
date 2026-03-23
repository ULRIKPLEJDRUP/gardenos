// ---------------------------------------------------------------------------
// GardenOS – Design Lab: Coordinate Geometry Utilities
// ---------------------------------------------------------------------------

import type { BedLocalCoord, BedLayout, SnapGuide } from "./bedLayoutTypes";

// Same constant used in GardenMapClient
const M_PER_DEG_LAT = 111_320;

// ---------------------------------------------------------------------------
// Geo  ↔  Metric  ↔  BedLocal coordinate conversions
// ---------------------------------------------------------------------------

export type MetricContext = {
  midLat: number;
  midLng: number;
  mpLat: number; // always 111 320
  mpLng: number; // depends on latitude
};

/** Compute per-latitude metric scale factors around a centroid. */
function metricCtx(
  midLat: number,
  midLng: number
): MetricContext {
  return {
    midLat,
    midLng,
    mpLat: M_PER_DEG_LAT,
    mpLng: M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180),
  };
}

/** Convert a GeoJSON [lng,lat] polygon ring → metric meters from centroid. */
export function geoRingToMetric(
  ring: [number, number][]
): { ctx: MetricContext; mRing: [number, number][] } {
  const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const midLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const ctx = metricCtx(midLat, midLng);
  const mRing: [number, number][] = ring.map(([lng, lat]) => [
    (lng - ctx.midLng) * ctx.mpLng,
    (lat - ctx.midLat) * ctx.mpLat,
  ]);
  return { ctx, mRing };
}

/** Metric ring → bed-local cm coordinate system (0,0 at top-left of bounding box). */
export function metricRingToBedLocal(
  mRing: [number, number][]
): {
  outline: BedLocalCoord[];
  widthCm: number;
  lengthCm: number;
  rotationDeg: number;
  offsetX: number; // metric offset of bbox origin
  offsetY: number;
} {
  // Find bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const [x, y] of mRing) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const widthM = maxX - minX;
  const heightM = maxY - minY;

  // Convert to cm, origin at top-left
  const outline: BedLocalCoord[] = mRing.map(([x, y]) => ({
    x: (x - minX) * 100,
    y: (maxY - y) * 100, // flip Y so 0 is top
  }));

  return {
    outline,
    widthCm: Math.round(widthM * 100),
    lengthCm: Math.round(heightM * 100),
    rotationDeg: 0, // axis-aligned bounding box for now
    offsetX: minX,
    offsetY: minY,
  };
}

/**
 * Build full BedLayout from a GeoJSON polygon ring.
 * This is the main entry point for converting map data → Design Lab model.
 */
export function geoPolygonToBedLayout(
  featureId: string,
  ring: [number, number][] // GeoJSON outer ring [lng, lat]
): Omit<BedLayout, "id" | "elements" | "createdAt" | "updatedAt" | "version"> {
  const { ctx, mRing } = geoRingToMetric(ring);
  const { outline, widthCm, lengthCm, rotationDeg } = metricRingToBedLocal(mRing);

  return {
    featureId,
    outlineCm: outline,
    widthCm,
    lengthCm,
    rotationDeg,
    centroidLat: ctx.midLat,
    centroidLng: ctx.midLng,
  };
}

/**
 * Convert a bed-local cm point back to geo [lng, lat].
 * Needed when syncing element placements back to the main map.
 */
export function bedLocalToGeo(
  point: BedLocalCoord,
  layout: Pick<BedLayout, "widthCm" | "lengthCm" | "centroidLat" | "centroidLng">
): [number, number] {
  const ctx = metricCtx(layout.centroidLat, layout.centroidLng);

  // Reverse the coordinate transform:
  // bed-local x → metric x, bed-local y → metric y (flip Y)
  const halfW = (layout.widthCm / 100) / 2;
  const halfL = (layout.lengthCm / 100) / 2;

  const mx = (point.x / 100) - halfW;
  const my = halfL - (point.y / 100); // flip Y back

  const lng = ctx.midLng + mx / ctx.mpLng;
  const lat = ctx.midLat + my / ctx.mpLat;
  return [lng, lat];
}

// ---------------------------------------------------------------------------
// Point-in-polygon (bed-local coordinates)
// ---------------------------------------------------------------------------

export function pointInBedOutline(
  p: BedLocalCoord,
  outline: BedLocalCoord[]
): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const xi = outline[i].x, yi = outline[i].y;
    const xj = outline[j].x, yj = outline[j].y;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Distance & collision helpers
// ---------------------------------------------------------------------------

export function distanceCm(a: BedLocalCoord, b: BedLocalCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Check if two axis-aligned rectangles overlap (centers + dimensions). */
export function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2
  );
}

/** Check if two circles overlap. */
export function circlesOverlap(
  a: BedLocalCoord,
  radiusA: number,
  b: BedLocalCoord,
  radiusB: number
): boolean {
  return distanceCm(a, b) < radiusA + radiusB;
}

// ---------------------------------------------------------------------------
// Snap system
// ---------------------------------------------------------------------------

const SNAP_THRESHOLD_CM = 5; // snap within 5cm

export type SnapResult = {
  snappedPosition: BedLocalCoord;
  guides: SnapGuide[];
};

/**
 * Snap a position to a grid, edges, or nearby elements.
 */
export function snapToGrid(
  pos: BedLocalCoord,
  gridCm: number,
  outline: BedLocalCoord[],
  _otherElements?: { position: BedLocalCoord; width: number; length: number }[]
): SnapResult {
  const guides: SnapGuide[] = [];
  let sx = pos.x;
  let sy = pos.y;

  // Grid snap
  const gx = Math.round(pos.x / gridCm) * gridCm;
  const gy = Math.round(pos.y / gridCm) * gridCm;
  if (Math.abs(pos.x - gx) < SNAP_THRESHOLD_CM) {
    sx = gx;
    guides.push({
      type: "grid",
      x1: gx, y1: 0,
      x2: gx, y2: 9999,
    });
  }
  if (Math.abs(pos.y - gy) < SNAP_THRESHOLD_CM) {
    sy = gy;
    guides.push({
      type: "grid",
      x1: 0, y1: gy,
      x2: 9999, y2: gy,
    });
  }

  // Edge snap (bounding box edges)
  if (outline.length > 0) {
    const minX = Math.min(...outline.map((p) => p.x));
    const maxX = Math.max(...outline.map((p) => p.x));
    const minY = Math.min(...outline.map((p) => p.y));
    const maxY = Math.max(...outline.map((p) => p.y));

    for (const edge of [minX, maxX]) {
      if (Math.abs(sx - edge) < SNAP_THRESHOLD_CM) {
        sx = edge;
        guides.push({ type: "edge", x1: edge, y1: minY, x2: edge, y2: maxY });
      }
    }
    for (const edge of [minY, maxY]) {
      if (Math.abs(sy - edge) < SNAP_THRESHOLD_CM) {
        sy = edge;
        guides.push({ type: "edge", x1: minX, y1: edge, x2: maxX, y2: edge });
      }
    }
  }

  return { snappedPosition: { x: sx, y: sy }, guides };
}

// ---------------------------------------------------------------------------
// Row generation inside bed outline
// ---------------------------------------------------------------------------

/**
 * Generate evenly spaced row positions inside a bed outline.
 * Returns center-line coordinates in bed-local cm.
 */
export function generateRowPositions(
  outline: BedLocalCoord[],
  rowSpacingCm: number,
  edgeMarginCm: number,
  direction: "horizontal" | "vertical" = "horizontal"
): { start: BedLocalCoord; end: BedLocalCoord }[] {
  if (outline.length < 3) return [];

  const minX = Math.min(...outline.map((p) => p.x));
  const maxX = Math.max(...outline.map((p) => p.x));
  const minY = Math.min(...outline.map((p) => p.y));
  const maxY = Math.max(...outline.map((p) => p.y));

  const rows: { start: BedLocalCoord; end: BedLocalCoord }[] = [];

  if (direction === "horizontal") {
    // Rows run left→right, spaced top→bottom
    for (
      let y = minY + edgeMarginCm;
      y <= maxY - edgeMarginCm;
      y += rowSpacingCm
    ) {
      // Find leftmost and rightmost intersection with outline at this y
      const intersections: number[] = [];
      for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const yi = outline[i].y, yj = outline[j].y;
        if ((yi <= y && yj > y) || (yj <= y && yi > y)) {
          const xi = outline[i].x, xj = outline[j].x;
          intersections.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
        }
      }
      if (intersections.length < 2) continue;
      intersections.sort((a, b) => a - b);
      const left = Math.max(intersections[0] + edgeMarginCm, minX);
      const right = Math.min(intersections[intersections.length - 1] - edgeMarginCm, maxX);
      if (right - left > rowSpacingCm * 0.5) {
        rows.push({ start: { x: left, y }, end: { x: right, y } });
      }
    }
  } else {
    // Rows run top→bottom, spaced left→right
    for (
      let x = minX + edgeMarginCm;
      x <= maxX - edgeMarginCm;
      x += rowSpacingCm
    ) {
      const intersections: number[] = [];
      for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const xi = outline[i].x, xj = outline[j].x;
        if ((xi <= x && xj > x) || (xj <= x && xi > x)) {
          const yi = outline[i].y, yj = outline[j].y;
          intersections.push(yi + ((x - xi) / (xj - xi)) * (yj - yi));
        }
      }
      if (intersections.length < 2) continue;
      intersections.sort((a, b) => a - b);
      const top = Math.max(intersections[0] + edgeMarginCm, minY);
      const bottom = Math.min(intersections[intersections.length - 1] - edgeMarginCm, maxY);
      if (bottom - top > rowSpacingCm * 0.5) {
        rows.push({ start: { x, y: top }, end: { x, y: bottom } });
      }
    }
  }

  return rows;
}
