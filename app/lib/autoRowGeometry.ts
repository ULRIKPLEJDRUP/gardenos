// ---------------------------------------------------------------------------
// Auto-row & auto-element geometry — extracted from GardenMapClient.tsx
// Pure utility functions for computing row placement, polygon clipping,
// and bed-resize proposals inside garden beds.
// ---------------------------------------------------------------------------

import { getPlantById } from "./plantStore";
import { getInfraElementById } from "./elementData";
import { getTrunkExclusionRadiusM } from "./conflictDetection";
import { canLayersCoexist, type ForestGardenLayer } from "./plantTypes";

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Approximate meters per degree of latitude (constant for all latitudes). */
export const M_PER_DEG_LAT = 111_320;

// ═══════════════════════════════════════════════════════════════════════════
// Basic geometry helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Ray casting in lng/lat plane (good enough for small garden polygons). */
export function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Convert a GeoJSON coordinate ring ([lng, lat]) to local metric coordinates
 * (meters from centroid).  Returns the centroid, scale factors, and the
 * converted ring so callers don't need to repeat this boilerplate.
 */
export function ringToMetric(ring: [number, number][]): {
  midLat: number;
  midLng: number;
  mpLat: number;
  mpLng: number;
  mRing: [number, number][];
} {
  const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const midLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const mpLng = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  const mRing: [number, number][] = ring.map(([lng, lat]) => [
    (lng - midLng) * mpLng,
    (lat - midLat) * M_PER_DEG_LAT,
  ]);
  return { midLat, midLng, mpLat: M_PER_DEG_LAT, mpLng, mRing };
}

/** Clip a line segment against a polygon ring (any 2D coords), returning clipped segment or null. */
export function clipLineToPolygon(
  p1: [number, number], p2: [number, number], ring: [number, number][]
): [number, number][] | null {
  const pts: { t: number; pt: [number, number] }[] = [];
  if (pointInRing(p1, ring)) pts.push({ t: 0, pt: p1 });
  if (pointInRing(p2, ring)) pts.push({ t: 1, pt: p2 });
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i++) {
    const ex = ring[i][0] - ring[j][0];
    const ey = ring[i][1] - ring[j][1];
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-15) continue;
    const t = ((ring[j][0] - p1[0]) * ey - (ring[j][1] - p1[1]) * ex) / denom;
    const u = ((ring[j][0] - p1[0]) * dy - (ring[j][1] - p1[1]) * dx) / denom;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
      pts.push({ t: Math.max(0, Math.min(1, t)), pt: [p1[0] + t * dx, p1[1] + t * dy] });
    }
  }
  if (pts.length < 2) return null;
  pts.sort((a, b) => a.t - b.t);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.abs(first.t - last.t) < 1e-12) return null;
  return [first.pt, last.pt];
}

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type AutoRowResult = {
  rows: { coords: [number, number][]; lengthM: number; midpoint: [number, number] }[];
  bedWidthM: number;
  bedLengthM: number;
  rowSpacingCm: number;
  plantSpacingCm: number;
  edgeMarginCm: number;
  maxRows: number;         // max NEW rows that fit in free slots
  occupiedSlots: number;   // how many existing rows are already in the bed
  totalSlots: number;      // total slots (occupied + max free)
  warning: string | null;
  /** Names/descriptions of obstacles that blocked space */
  obstacleWarnings: string[];
};

export type OccupiedSlot = { offset: number; halfExclusion: number };

/**
 * 2D obstacle circle in geo-coordinates [lng, lat] + radius in meters.
 * Used for bushes, trees, infrastructure elements placed inside beds.
 * Auto-rows are clipped (shortened/split) around these circles.
 */
export type Obstacle2D = {
  center: [number, number];   // [lng, lat]
  radiusM: number;            // full canopy/spread exclusion radius in meters
  trunkRadiusM: number;       // trunk-only exclusion radius (used when layers coexist)
  label: string;              // display name for warnings
  layer?: ForestGardenLayer;  // forest garden layer (for coexistence check)
};

/**
 * Result of auto-element computation.
 */
export type AutoElementResult = {
  positions: [number, number][];  // [lng, lat][] of placed elements
  bedAreaM2: number;
  spacingCm: number;              // inter-element spacing used
  edgeMarginCm: number;
  maxElements: number;            // max that fit in bed
  warning: string | null;
  obstacleWarnings: string[];
};

/** Row obstacle: a polyline with a half-width buffer (for row crops). */
export type RowObstacle2D = {
  coords: [number, number][];
  halfWidthM: number;
  label: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// Direction detection & occupied-slot computation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect the direction of existing rows in a bed.
 * Returns "length" | "width" | null (null = no existing rows).
 * Uses dot product of each row's direction vs bed's longest edge.
 */
export function detectExistingRowDirection(
  ring: [number, number][],
  existingRows: [number, number][][],
): "length" | "width" | null {
  if (ring.length < 3 || existingRows.length === 0) return null;

  const { midLng: _midLng, midLat: _midLat, mpLng, mRing } = ringToMetric(ring);

  // Find longest edge
  let longestDist = 0, longestIdx = 0;
  for (let i = 0; i < mRing.length; i++) {
    const j = (i + 1) % mRing.length;
    const dx = mRing[j][0] - mRing[i][0];
    const dy = mRing[j][1] - mRing[i][1];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > longestDist) { longestDist = d; longestIdx = i; }
  }

  const mA = mRing[longestIdx];
  const mB = mRing[(longestIdx + 1) % mRing.length];
  const edx = mB[0] - mA[0], edy = mB[1] - mA[1];
  const eLen = Math.sqrt(edx * edx + edy * edy);
  if (eLen < 1e-6) return null;
  const longDir: [number, number] = [edx / eLen, edy / eLen]; // unit vector along longest edge

  // Average: check if rows are parallel to longest edge (→ "length") or perpendicular (→ "width")
  let parallelVotes = 0;
  let perpVotes = 0;
  for (const row of existingRows) {
    if (row.length < 2) continue;
    const rdx = (row[1][0] - row[0][0]) * mpLng;
    const rdy = (row[1][1] - row[0][1]) * M_PER_DEG_LAT;
    const rLen = Math.sqrt(rdx * rdx + rdy * rdy);
    if (rLen < 1e-6) continue;
    // |dot product| = cos(angle). If close to 1 → parallel; close to 0 → perpendicular
    const absDot = Math.abs((rdx / rLen) * longDir[0] + (rdy / rLen) * longDir[1]);
    if (absDot > 0.5) parallelVotes++; // within ~60° of longest edge
    else perpVotes++;
  }

  if (parallelVotes === 0 && perpVotes === 0) return null;
  return parallelVotes >= perpVotes ? "length" : "width";
}

/**
 * Compute the perpendicular (shortDir) offset for existing rows inside a bed.
 * Returns offsets in meters in the bed's local coordinate system.
 * Uses the same axis system as computeAutoRows (longest edge → longDir).
 */
export function getExistingRowOffsetsInBed(
  ring: [number, number][],
  existingRows: [number, number][][],  // each row is [[lng,lat],[lng,lat]]
  direction: "length" | "width" = "length",
  /** rowSpacingCm per existing row (parallel array). If missing, default 30cm. */
  existingRowSpacingsCm?: number[],
): OccupiedSlot[] {
  if (ring.length < 3 || existingRows.length === 0) return [];

  const { midLng, midLat, mpLng, mRing } = ringToMetric(ring);

  // Find principal axes — same logic as computeAutoRows (min-perpendicular-span)
  let minPerpSpan = Infinity;
  let minPerpUx = 1, minPerpUy = 0;
  let maxPerpSpan = 0;
  let maxPerpUx = 0, maxPerpUy = 1;

  const testedDirs = new Set<string>();
  for (let i = 0; i < mRing.length; i++) {
    const j = (i + 1) % mRing.length;
    const dx = mRing[j][0] - mRing[i][0];
    const dy = mRing[j][1] - mRing[i][1];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.01) continue;
    const ux = dx / d, uy = dy / d;
    const dirKey = `${(ux >= 0 ? ux : -ux).toFixed(6)},${(ux >= 0 ? uy : -uy).toFixed(6)}`;
    if (testedDirs.has(dirKey)) continue;
    testedDirs.add(dirKey);
    let minPerp = Infinity, maxPerp = -Infinity;
    for (const pt of mRing) {
      const perp = -pt[0] * uy + pt[1] * ux;
      if (perp < minPerp) minPerp = perp;
      if (perp > maxPerp) maxPerp = perp;
    }
    const perpSpan = maxPerp - minPerp;
    if (perpSpan < minPerpSpan) { minPerpSpan = perpSpan; minPerpUx = ux; minPerpUy = uy; }
    if (perpSpan > maxPerpSpan) { maxPerpSpan = perpSpan; maxPerpUx = ux; maxPerpUy = uy; }
  }
  if (minPerpSpan === Infinity) return [];

  const chosenUx = direction === "width" ? maxPerpUx : minPerpUx;
  const chosenUy = direction === "width" ? maxPerpUy : minPerpUy;
  const longDir: [number, number] = [chosenUx, chosenUy];
  const shortDir: [number, number] = [-longDir[1], longDir[0]];

  const slots: OccupiedSlot[] = [];
  for (let idx = 0; idx < existingRows.length; idx++) {
    const rowCoords = existingRows[idx];
    if (rowCoords.length < 2) continue;
    // Project midpoint of each existing row onto shortDir
    const mP0: [number, number] = [
      (rowCoords[0][0] - midLng) * mpLng,
      (rowCoords[0][1] - midLat) * M_PER_DEG_LAT,
    ];
    const mP1: [number, number] = [
      (rowCoords[1][0] - midLng) * mpLng,
      (rowCoords[1][1] - midLat) * M_PER_DEG_LAT,
    ];
    const mid: [number, number] = [(mP0[0] + mP1[0]) / 2, (mP0[1] + mP1[1]) / 2];
    const sProj = mid[0] * shortDir[0] + mid[1] * shortDir[1];
    // Half-exclusion for THIS existing row: half of its own species' row spacing
    const spacingCm = existingRowSpacingsCm?.[idx] ?? 30;
    const he = Math.max(spacingCm / 100 / 2, 0.12);
    slots.push({ offset: sProj, halfExclusion: he });
  }
  return slots;
}

// ═══════════════════════════════════════════════════════════════════════════
// Smart edge margin & feature exclusion
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute a smart edge margin (cm) for auto-element placement.
 *
 * Trees / canopy layers: the canopy extends HIGH above ground and can overhang
 * the bed boundary — only the trunk/root zone needs to be inside the bed.
 * Shrubs: lower canopy, partially extends over boundaries — moderate margin.
 * Other (herbs, ground-cover): full half-spread so the plant stays inside the bed.
 */
export function computeSmartEdgeMarginCm(sp: { spreadDiameterCm?: number; spacingCm?: number; forestGardenLayer?: ForestGardenLayer; category?: string }): number {
  const spreadCm = sp.spreadDiameterCm ?? sp.spacingCm ?? 30;
  const layer = sp.forestGardenLayer;
  const cat = sp.category;

  // Trees: canopy is 3-20 m up — only trunk needs to be in bed
  if (layer === "canopy" || layer === "sub-canopy" || cat === "tree") {
    // Trunk zone ≈ 5 % of canopy spread, minimum 30 cm
    return Math.max(30, Math.ceil(spreadCm * 0.05));
  }

  // Shrubs: lower canopy can extend a bit beyond bed boundaries
  if (layer === "shrub" || cat === "shrub") {
    // Stem zone ≈ 20 % of spread, minimum 15 cm
    return Math.max(15, Math.ceil(spreadCm * 0.20));
  }

  // Herbaceous, ground-cover, climbers etc.: half-spread keeps plant inside bed
  return Math.max(10, Math.ceil(spreadCm / 2));
}

/**
 * Compute the exclusion radius in meters for a feature inside a bed.
 * Returns both the full canopy/spread radius and a trunk-only radius.
 * Uses spreadDiameterCm → spacingCm → rowSpacingCm → category-based default.
 */
export function getFeatureExclusionRadiusM(
  speciesId: string | undefined,
  elementTypeId: string | undefined,
): { radiusM: number; trunkRadiusM: number; label: string } {
  if (speciesId) {
    const sp = getPlantById(speciesId);
    if (sp) {
      const diamCm = sp.spreadDiameterCm ?? sp.spacingCm ?? sp.rowSpacingCm;
      const radiusCm = diamCm ? diamCm / 2 : 30;
      const label = `${sp.icon ?? "🌱"} ${sp.name} (${Math.round(radiusCm * 2)} cm Ø)`;
      return {
        radiusM: Math.max(radiusCm / 100, 0.15),
        trunkRadiusM: getTrunkExclusionRadiusM(sp),
        label,
      };
    }
  }
  if (elementTypeId) {
    const el = getInfraElementById(elementTypeId);
    if (el) {
      const radiusCm = el.exclusionRadiusCm ?? 15;
      const label = `${el.icon} ${el.name} (${radiusCm} cm radius)`;
      return { radiusM: Math.max(radiusCm / 100, 0.10), trunkRadiusM: Math.max(radiusCm / 100, 0.10), label };
    }
  }
  return { radiusM: 0.15, trunkRadiusM: 0.15, label: "Ukendt element (15 cm)" };
}

// ═══════════════════════════════════════════════════════════════════════════
// Segment clipping around obstacles
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Subtract a circle from a line segment, producing 0–2 sub-segments.
 * All coordinates in metric space (meters).
 */
export function subtractCircleFromSegment(
  p1: [number, number], p2: [number, number],
  center: [number, number], radius: number,
): [number, number][][] {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-8) return [];

  const ux = dx / len, uy = dy / len;
  const fx = center[0] - p1[0], fy = center[1] - p1[1];
  const tCenter = fx * ux + fy * uy;
  const perpDist = Math.abs(fx * (-uy) + fy * ux);

  if (perpDist >= radius) return [[p1, p2]]; // no intersection

  const halfChord = Math.sqrt(radius * radius - perpDist * perpDist);
  const tEnter = tCenter - halfChord;
  const tExit = tCenter + halfChord;

  const result: [number, number][][] = [];
  if (tEnter > 0.01) {
    const end = Math.min(tEnter, len);
    if (end > 0.05) result.push([p1, [p1[0] + ux * end, p1[1] + uy * end]]);
  }
  if (tExit < len - 0.01) {
    const start = Math.max(tExit, 0);
    if (len - start > 0.05) result.push([[p1[0] + ux * start, p1[1] + uy * start], p2]);
  }
  return result;
}

/** Subtract multiple obstacle circles from a line segment (iterative). */
export function subtractObstaclesFromSegment(
  p1: [number, number], p2: [number, number],
  obstacles: { center: [number, number]; radiusM: number }[],
): [number, number][][] {
  let segments: [number, number][][] = [[p1, p2]];
  for (const obs of obstacles) {
    const next: [number, number][][] = [];
    for (const seg of segments) {
      next.push(...subtractCircleFromSegment(seg[0], seg[1], obs.center, obs.radiusM));
    }
    segments = next;
    if (segments.length === 0) break;
  }
  return segments;
}

// ═══════════════════════════════════════════════════════════════════════════
// Point-to-segment & point-in-polygon (metric space)
// ═══════════════════════════════════════════════════════════════════════════

/** Distance from point to line segment (all metric coords). */
export function distPointToSegmentM(pt: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return Math.sqrt((pt[0] - a[0]) ** 2 + (pt[1] - a[1]) ** 2);
  const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / l2));
  const px = a[0] + t * dx, py = a[1] + t * dy;
  return Math.sqrt((pt[0] - px) ** 2 + (pt[1] - py) ** 2);
}

/** Uses ray-casting like pointInRing but in metric space. */
export function pointInMetricRing(pt: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Minimum distance from a point to the nearest polygon edge (metric). */
export function distToPolygonEdgeM(pt: [number, number], ring: [number, number][]): number {
  let minDist = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const d = distPointToSegmentM(pt, ring[i], ring[j]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-element placement (2D point packing inside a polygon)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute auto-element positions inside a polygon bed.
 * Uses a hexagonal grid for optimal packing, then filters candidates against
 * polygon boundary, edge margin, existing circle obstacles and row obstacles.
 */
export function computeAutoElements(
  ring: [number, number][],            // [lng, lat][] — bed polygon
  spacingCm: number,                   // min distance between new elements (center-to-center)
  edgeMarginCm: number,                // min distance from polygon edge
  requestedCount: number,              // 0 = auto-max
  circleObstacles: Obstacle2D[],       // existing point features in bed
  rowObstacles: RowObstacle2D[],       // existing row features in bed
  newElementLayer?: ForestGardenLayer, // forest garden layer of new element (for coexistence)
): AutoElementResult | null {
  if (ring.length < 3) return null;

  // ── 1. Convert ring to local metric coords ──
  const { midLng, midLat, mpLng, mRing } = ringToMetric(ring);

  // Convert circle obstacles to metric
  const mCircles = circleObstacles.map((o) => ({
    center: [
      (o.center[0] - midLng) * mpLng,
      (o.center[1] - midLat) * M_PER_DEG_LAT,
    ] as [number, number],
    radiusM: o.radiusM,
    trunkRadiusM: o.trunkRadiusM,
    label: o.label,
    layer: o.layer,
  }));

  // Convert row obstacles to metric
  const mRows = rowObstacles.map((r) => ({
    coords: r.coords.map(([lng, lat]) => [
      (lng - midLng) * mpLng,
      (lat - midLat) * M_PER_DEG_LAT,
    ] as [number, number]),
    halfWidthM: r.halfWidthM,
    label: r.label,
  }));

  // ── 2. Bounding box ──
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of mRing) {
    if (pt[0] < minX) minX = pt[0];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  }

  const edgeMarginM = edgeMarginCm / 100;
  const spacingM = Math.max(spacingCm / 100, 0.10);
  const halfSpacingM = spacingM / 2;

  // ── 3. Generate hex grid candidates ──
  const rowStep = spacingM * Math.sqrt(3) / 2; // vertical distance between hex rows
  const colStep = spacingM;                      // horizontal distance between columns

  const candidates: [number, number][] = [];
  let rowIdx = 0;
  for (let y = minY; y <= maxY; y += rowStep) {
    const xOffset = (rowIdx % 2 === 1) ? colStep / 2 : 0;
    for (let x = minX + xOffset; x <= maxX; x += colStep) {
      candidates.push([x, y]);
    }
    rowIdx++;
  }

  // ── 4. Filter candidates ──
  const validCandidates: [number, number][] = [];
  const hitObstacles = new Set<string>();

  for (const pt of candidates) {
    // a) Must be inside the polygon
    if (!pointInMetricRing(pt, mRing)) continue;

    // b) Must be at least edgeMarginM from nearest polygon edge
    if (distToPolygonEdgeM(pt, mRing) < edgeMarginM) continue;

    // c) Check distance to circle obstacles
    let blocked = false;
    for (const obs of mCircles) {
      const dx = pt[0] - obs.center[0];
      const dy = pt[1] - obs.center[1];
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Forest garden layer coexistence: compatible layers can share horizontal
      // space, but still exclude the trunk/stem zone of the obstacle.
      if (newElementLayer && obs.layer && canLayersCoexist(newElementLayer, obs.layer)) {
        // Only block if literally overlapping the trunk/stem
        if (dist < obs.trunkRadiusM + 0.05) {
          blocked = true;
          hitObstacles.add(obs.label);
          break;
        }
        continue; // canopy zone is fine — layers coexist vertically
      }

      // Incompatible layers: full canopy/spread exclusion
      if (dist < halfSpacingM + obs.radiusM) {
        blocked = true;
        hitObstacles.add(obs.label);
        break;
      }
    }
    if (blocked) continue;

    // d) Check distance to row obstacles (line segments + buffer)
    for (const row of mRows) {
      for (let i = 0; i < row.coords.length - 1; i++) {
        const d = distPointToSegmentM(pt, row.coords[i], row.coords[i + 1]);
        if (d < halfSpacingM + row.halfWidthM) {
          blocked = true;
          hitObstacles.add(row.label);
          break;
        }
      }
      if (blocked) break;
    }
    if (blocked) continue;

    validCandidates.push(pt);
  }

  // ── 5. Compute bed area ──
  let area = 0;
  for (let i = 0; i < mRing.length; i++) {
    const j = (i + 1) % mRing.length;
    area += mRing[i][0] * mRing[j][1];
    area -= mRing[j][0] * mRing[i][1];
  }
  const bedAreaM2 = Math.abs(area) / 2;

  // ── 6. Select positions ──
  const maxElements = validCandidates.length;
  const count = requestedCount > 0 ? Math.min(requestedCount, maxElements) : maxElements;
  const positions = validCandidates.slice(0, count);

  // ── 7. Convert back to [lng, lat] ──
  const geoPositions: [number, number][] = positions.map(([x, y]) => [
    x / mpLng + midLng,
    y / M_PER_DEG_LAT + midLat,
  ]);

  const obstacleWarnings: string[] = [];
  for (const label of hitObstacles) obstacleWarnings.push(label);

  return {
    positions: geoPositions,
    bedAreaM2,
    spacingCm,
    edgeMarginCm,
    maxElements,
    warning: requestedCount > 0 && count < requestedCount
      ? `Kun plads til ${maxElements} elementer (ønsket: ${requestedCount})`
      : null,
    obstacleWarnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Auto-row placement (parallel polylines inside a polygon)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate parallel row polylines inside a polygon.
 * All geometry is done in a local metric coordinate system (meters from centroid)
 * so that lat/lng anisotropy never causes rows to stack.
 *
 * When occupiedSlots is provided, those perpendicular positions are treated as
 * already taken — new rows will only be placed in free slots.
 */
export function computeAutoRows(
  ring: [number, number][],   // [lng, lat][]
  rowSpacingCm: number,
  edgeMarginCm: number,
  requestedRows: number = 0,
  occupiedSlots: OccupiedSlot[] = [],
  direction: "length" | "width" = "length",
  obstacles2D: Obstacle2D[] = [],
): AutoRowResult | null {
  if (ring.length < 3) return null;

  // ── 1. Convert ring to local metric coords (meters from centroid) ──
  const { midLng, midLat, mpLng, mRing } = ringToMetric(ring);

  // Convert 2D obstacles to metric space
  const mObstacles: { center: [number, number]; radiusM: number; label: string }[] =
    obstacles2D.map((o) => ({
      center: [
        (o.center[0] - midLng) * mpLng,
        (o.center[1] - midLat) * M_PER_DEG_LAT,
      ] as [number, number],
      radiusM: o.radiusM,
      label: o.label,
    }));

  // ── 2. Find principal axes — minimum-width bounding rectangle approach ──
  // For each unique edge direction, project ALL vertices onto that direction
  // and measure the PERPENDICULAR span. The direction with the SMALLEST
  // perpendicular span is the long axis (rows run this way); the direction
  // with the LARGEST perpendicular span is the short axis.
  // This avoids the diagonal-is-longest trap that max-parallel-span causes.
  let minPerpSpan = Infinity;
  let minPerpUx = 1, minPerpUy = 0;   // "length" direction (long axis)
  let maxPerpSpan = 0;
  let maxPerpUx = 0, maxPerpUy = 1;   // "width" direction (short axis)

  const testedDirs = new Set<string>();
  for (let i = 0; i < mRing.length; i++) {
    const j = (i + 1) % mRing.length;
    const dx = mRing[j][0] - mRing[i][0];
    const dy = mRing[j][1] - mRing[i][1];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.01) continue;
    const ux = dx / d, uy = dy / d;
    // Normalize direction so we don't test the same axis twice (opposite direction)
    const dirKey = `${(ux >= 0 ? ux : -ux).toFixed(6)},${(ux >= 0 ? uy : -uy).toFixed(6)}`;
    if (testedDirs.has(dirKey)) continue;
    testedDirs.add(dirKey);

    // Project all vertices onto the perpendicular direction
    let minPerp = Infinity, maxPerp = -Infinity;
    for (const pt of mRing) {
      const perp = -pt[0] * uy + pt[1] * ux;
      if (perp < minPerp) minPerp = perp;
      if (perp > maxPerp) maxPerp = perp;
    }
    const perpSpan = maxPerp - minPerp;

    if (perpSpan < minPerpSpan) {
      minPerpSpan = perpSpan;
      minPerpUx = ux; minPerpUy = uy;
    }
    if (perpSpan > maxPerpSpan) {
      maxPerpSpan = perpSpan;
      maxPerpUx = ux; maxPerpUy = uy;
    }
  }
  if (minPerpSpan === Infinity) return null;

  // "length" → rows along long axis (min perpendicular span)
  // "width"  → rows along short axis (max perpendicular span)
  const chosenUx = direction === "width" ? maxPerpUx : minPerpUx;
  const chosenUy = direction === "width" ? maxPerpUy : minPerpUy;

  // Unit vectors in metric space
  const longDir: [number, number] = [chosenUx, chosenUy]; // parallel to rows
  const shortDir: [number, number] = [-longDir[1], longDir[0]]; // perpendicular (across rows)

  // ── 3. Project metric ring onto both axes ──
  let minL = Infinity, maxL = -Infinity, minS = Infinity, maxS = -Infinity;
  for (const pt of mRing) {
    const projL = pt[0] * longDir[0] + pt[1] * longDir[1];
    const projS = pt[0] * shortDir[0] + pt[1] * shortDir[1];
    minL = Math.min(minL, projL); maxL = Math.max(maxL, projL);
    minS = Math.min(minS, projS); maxS = Math.max(maxS, projS);
  }

  const bedLengthM = maxL - minL; // parallel to rows
  const bedWidthM = maxS - minS;  // perpendicular (across rows)

  const rowSpacingM = rowSpacingCm / 100;
  const edgeMarginM = edgeMarginCm / 100;
  const usableWidthM = bedWidthM - 2 * edgeMarginM;

  if (usableWidthM <= 0) {
    return {
      rows: [], bedWidthM, bedLengthM, rowSpacingCm, plantSpacingCm: 0,
      edgeMarginCm, maxRows: 0, occupiedSlots: occupiedSlots.length, totalSlots: 0,
      warning: `Bedet er kun ${(bedWidthM * 100).toFixed(0)} cm bredt — for smalt til rækker med ${edgeMarginCm} cm kantmargin.`,
      obstacleWarnings: [],
    };
  }

  // ── 4. Find free positions for new rows using gap-based approach ──
  // Sort existing occupied slots along the short axis.
  const sortedSlots = [...occupiedSlots].sort((a, b) => a.offset - b.offset);
  const newHalfExcl = Math.max(rowSpacingM * 0.5, 0.12); // half the NEW species' spacing

  // Build "exclusion zones" — each existing row blocks a zone based on
  // max(its own half-exclusion, new species' half-exclusion).
  // This prevents planting small crops between wide-spaced crop rows.
  // Usable band for row placement: [bandStart, bandEnd]
  const bandStart = minS + edgeMarginM;
  const bandEnd = maxS - edgeMarginM;

  type Interval = { lo: number; hi: number };
  const freeIntervals: Interval[] = [];
  {
    // Each existing row's exclusion = max(its own species needs, new species needs)
    const exclusions: Interval[] = sortedSlots.map((s) => {
      const he = Math.max(s.halfExclusion, newHalfExcl);
      return { lo: s.offset - he, hi: s.offset + he };
    });
    // Walk through the band and collect free segments
    let cursor = bandStart;
    for (const ex of exclusions) {
      if (ex.lo > cursor) {
        freeIntervals.push({ lo: cursor, hi: ex.lo });
      }
      cursor = Math.max(cursor, ex.hi);
    }
    if (cursor < bandEnd) {
      freeIntervals.push({ lo: cursor, hi: bandEnd });
    }
  }

  // Generate candidate slot positions within each free interval
  const freeSlots: number[] = [];
  for (const interval of freeIntervals) {
    const width = interval.hi - interval.lo;
    if (width < 0.01) continue; // too narrow
    const slotsInGap = Math.floor(width / rowSpacingM) + 1;
    const totalSpan = (slotsInGap - 1) * rowSpacingM;
    const start = interval.lo + (width - totalSpan) / 2; // center slots in gap
    for (let i = 0; i < slotsInGap; i++) {
      const pos = start + i * rowSpacingM;
      // Final safety: must respect EACH existing row's exclusion zone
      const safe = sortedSlots.every((s) => {
        const minDist = Math.max(s.halfExclusion, newHalfExcl);
        return Math.abs(pos - s.offset) >= minDist;
      });
      if (safe) freeSlots.push(pos);
    }
  }

  // Also compute "total theoretical slots" for reporting (ignoring existing rows)
  const totalSlotsInBed = Math.floor(usableWidthM / rowSpacingM) + 1;

  const maxRows = freeSlots.length; // max NEW rows that fit
  const numRows = requestedRows > 0 ? Math.min(requestedRows, maxRows) : maxRows;

  let warning: string | null = null;
  if (requestedRows > 0 && requestedRows > maxRows) {
    const occupiedCount = occupiedSlots.length;
    warning = occupiedCount > 0
      ? `Der er ${occupiedCount} eksisterende rækker — kun plads til ${maxRows} nye (${(bedWidthM * 100).toFixed(0)} cm bredt bed). Du ønskede ${requestedRows}.`
      : `Der er kun plads til ${maxRows} rækker (${(bedWidthM * 100).toFixed(0)} cm bredt bed). Du ønskede ${requestedRows}.`;
  }

  // ── 5. Place rows in the first N free slots, clip around obstacles ──
  const rows: { coords: [number, number][]; lengthM: number; midpoint: [number, number] }[] = [];
  const obstacleWarnings: string[] = [];
  const hitObstacles = new Set<string>(); // track which obstacles clipped something

  for (let i = 0; i < numRows; i++) {
    const sOffset = freeSlots[i];

    // Row endpoints extending beyond polygon along longDir (will be clipped)
    const mP1: [number, number] = [
      (minL - 1) * longDir[0] + sOffset * shortDir[0],
      (minL - 1) * longDir[1] + sOffset * shortDir[1],
    ];
    const mP2: [number, number] = [
      (maxL + 1) * longDir[0] + sOffset * shortDir[0],
      (maxL + 1) * longDir[1] + sOffset * shortDir[1],
    ];

    // Clip to metric polygon
    const clipped = clipLineToPolygon(mP1, mP2, mRing);
    if (!clipped || clipped.length !== 2) continue;

    // 2D obstacle clipping: split segment around obstacle circles
    let segments: [number, number][][] = [clipped as [number, number][]];
    if (mObstacles.length > 0) {
      const newSegments: [number, number][][] = [];
      for (const seg of segments) {
        const clippedSegs = subtractObstaclesFromSegment(
          seg[0], seg[1],
          mObstacles.map((o) => ({ center: o.center, radiusM: o.radiusM })),
        );
        newSegments.push(...clippedSegs);
      }
      segments = newSegments;

      // Check which obstacles were hit (for warning messages)
      if (segments.length === 0 || segments.length > 1 || (clipped && segments.length < 1)) {
        // Row was split or removed — figure out which obstacles
        for (const ob of mObstacles) {
          const _dx1 = clipped[0][0] - ob.center[0];
          const _dy1 = clipped[0][1] - ob.center[1];
          const _dx2 = clipped[1][0] - ob.center[0];
          const _dy2 = clipped[1][1] - ob.center[1];
          // Check if the line segment passes near the obstacle
          const segDx = clipped[1][0] - clipped[0][0];
          const segDy = clipped[1][1] - clipped[0][1];
          const segLen2 = segDx * segDx + segDy * segDy;
          if (segLen2 > 0) {
            const t = Math.max(0, Math.min(1,
              ((ob.center[0] - clipped[0][0]) * segDx + (ob.center[1] - clipped[0][1]) * segDy) / segLen2
            ));
            const closestX = clipped[0][0] + t * segDx;
            const closestY = clipped[0][1] + t * segDy;
            const dist = Math.sqrt((closestX - ob.center[0]) ** 2 + (closestY - ob.center[1]) ** 2);
            if (dist <= ob.radiusM) {
              hitObstacles.add(ob.label);
            }
          }
        }
      }
    }

    // Convert each surviving sub-segment to [lng, lat]
    for (const seg of segments) {
      const dx = seg[1][0] - seg[0][0];
      const dy = seg[1][1] - seg[0][1];
      const lengthM = Math.sqrt(dx * dx + dy * dy);
      if (lengthM > 0.05) {
        const ll0: [number, number] = [
          seg[0][0] / mpLng + midLng,
          seg[0][1] / M_PER_DEG_LAT + midLat,
        ];
        const ll1: [number, number] = [
          seg[1][0] / mpLng + midLng,
          seg[1][1] / M_PER_DEG_LAT + midLat,
        ];
        const mid: [number, number] = [
          (ll0[0] + ll1[0]) / 2,
          (ll0[1] + ll1[1]) / 2,
        ];
        rows.push({ coords: [ll0, ll1], lengthM, midpoint: mid });
      }
    }
  }

  // Build obstacle warnings
  for (const label of hitObstacles) {
    obstacleWarnings.push(`🌳 Rækker tilpasset omkring ${label}`);
  }

  return {
    rows, bedWidthM, bedLengthM, rowSpacingCm, plantSpacingCm: 0,
    edgeMarginCm, maxRows, occupiedSlots: occupiedSlots.length, totalSlots: totalSlotsInBed, warning,
    obstacleWarnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Bed-resize row-adjustment types & helpers
// ═══════════════════════════════════════════════════════════════════════════

export type BedResizeRowChange = {
  gardenosId: string;
  name: string;
  speciesId: string;
  action: "reclip" | "remove";
  oldCoords: [number, number][];
  newCoords?: [number, number][];   // only for reclip
  oldLengthM: number;
  newLengthM?: number;              // only for reclip
  plantInstanceIds: string[];       // linked plant instance IDs
};

export type BedResizeProposal = {
  bedId: string;
  bedName: string;
  changes: BedResizeRowChange[];
  removedCount: number;
  reclippedCount: number;
  removedPlantInstanceCount: number;
  updatedPlantInstanceCount: number;
};

/**
 * Given a new polygon ring and the child rows that were inside the bed *before*
 * the resize, compute which rows need re-clipping and which must be removed.
 */
export function computeBedResizeProposal(
  bedId: string,
  bedName: string,
  newRing: [number, number][],
  childRows: { gardenosId: string; name: string; speciesId: string; coords: [number, number][] }[],
  allPlantInstances: { id: string; featureId: string; count?: number }[],
): BedResizeProposal | null {
  if (childRows.length === 0) return null;

  const changes: BedResizeRowChange[] = [];
  let removedCount = 0;
  let reclippedCount = 0;
  let removedPlantInstanceCount = 0;
  let updatedPlantInstanceCount = 0;

  for (const row of childRows) {
    const instanceIds = allPlantInstances.filter(i => i.featureId === row.gardenosId).map(i => i.id);
    const instanceCount = allPlantInstances.filter(i => i.featureId === row.gardenosId).reduce((s, i) => s + (i.count ?? 1), 0);

    // Compute old length
    const dx0 = row.coords[1][0] - row.coords[0][0];
    const dy0 = row.coords[1][1] - row.coords[0][1];
    const midLat = (row.coords[0][1] + row.coords[1][1]) / 2;
    const M_PER_DEG_LNG = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
    const oldLengthM = Math.sqrt((dx0 * M_PER_DEG_LNG) ** 2 + (dy0 * M_PER_DEG_LAT) ** 2);

    // Check if midpoint is inside the new polygon
    const mid: [number, number] = [
      (row.coords[0][0] + row.coords[1][0]) / 2,
      (row.coords[0][1] + row.coords[1][1]) / 2,
    ];
    const midInside = pointInRing(mid, newRing);

    // Try to re-clip the row to the new polygon
    const clipped = clipLineToPolygon(row.coords[0], row.coords[1], newRing);

    if (!clipped || clipped.length < 2 || !midInside) {
      // Row completely outside or midpoint outside → remove
      changes.push({
        gardenosId: row.gardenosId,
        name: row.name,
        speciesId: row.speciesId,
        action: "remove",
        oldCoords: row.coords,
        oldLengthM,
        plantInstanceIds: instanceIds,
      });
      removedCount++;
      removedPlantInstanceCount += instanceCount;
    } else {
      // Row can be re-clipped — check if geometry actually changed
      const dx1 = clipped[1][0] - clipped[0][0];
      const dy1 = clipped[1][1] - clipped[0][1];
      const newLengthM = Math.sqrt((dx1 * M_PER_DEG_LNG) ** 2 + (dy1 * M_PER_DEG_LAT) ** 2);

      // Only count as a change if length differs by more than 1cm
      if (Math.abs(newLengthM - oldLengthM) > 0.01) {
        changes.push({
          gardenosId: row.gardenosId,
          name: row.name,
          speciesId: row.speciesId,
          action: "reclip",
          oldCoords: row.coords,
          newCoords: clipped as [number, number][],
          oldLengthM,
          newLengthM,
          plantInstanceIds: instanceIds,
        });
        reclippedCount++;
        updatedPlantInstanceCount += instanceCount;
      }
    }
  }

  if (changes.length === 0) return null;

  return {
    bedId,
    bedName,
    changes,
    removedCount,
    reclippedCount,
    removedPlantInstanceCount,
    updatedPlantInstanceCount,
  };
}
