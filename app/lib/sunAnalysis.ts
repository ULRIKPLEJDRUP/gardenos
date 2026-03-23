/**
 * sunAnalysis.ts – Sun-exposure heatmap data for GardenOS
 *
 * Uses the solar geometry already in plantTypes.ts to compute
 * shade-hours across a spatial grid, then provides a colour
 * lookup for a Leaflet GridLayer canvas overlay.
 */

import { estimateHeightM } from "../lib/plantTypes";
import { haversineM, geoBearing, canopyRadiusM } from "../lib/conflictDetection";
import { getPlantById, getInstancesForFeature } from "../lib/plantStore";
import type { FeatureCollection, Geometry, Feature } from "geojson";

/* ─────────── Types ─────────── */

export interface ShadeCaster {
  lat: number;
  lng: number;
  heightM: number;
  canopyRadiusM: number;
  name: string;
}

export interface SunGridCell {
  lat: number;
  lng: number;
  shadeHours: number; // average growing-season shade hours
  sunHours: number;   // ~15 − shadeHours  (clamped 0-15)
}

/* ─────────── Constants ─────────── */

const GROWING_SUN_HOURS = 15; // reference full-sun hours at ~56°N

/* ─────────── Extract shade casters from map features ─────────── */

export function extractShadeCasters(
  layout: FeatureCollection<Geometry>,
): ShadeCaster[] {
  const casters: ShadeCaster[] = [];
  if (!layout?.features) return casters;

  for (const f of layout.features) {
    const props = (f as Feature<Geometry>).properties as Record<string, unknown> | null;
    if (!props) continue;

    const fId = props.gardenosId as string | undefined;
    if (!fId) continue;

    // Get centroid of feature
    const geom = (f as Feature<Geometry>).geometry;
    const center = featureCentroid(geom);
    if (!center) continue;

    // Check if this feature has plants that cast shade
    const instances = getInstancesForFeature(fId);
    for (const inst of instances) {
      const sp = getPlantById(inst.speciesId);
      if (!sp) continue;
      const h = estimateHeightM(sp);
      if (!h || h < 1.5) continue; // too short to cast meaningful shade

      const cr = canopyRadiusM(sp as { spacingCm?: number; spreadDiameterCm?: number });
      casters.push({
        lat: center[0],
        lng: center[1],
        heightM: h,
        canopyRadiusM: cr,
        name: sp.name,
      });
    }

    // Also check feature-level properties for structures that cast shade
    const kind = props.kind as string | undefined;
    const structureHeight = props.structureHeight as number | undefined;
    if (structureHeight && structureHeight > 2) {
      casters.push({
        lat: center[0],
        lng: center[1],
        heightM: structureHeight,
        canopyRadiusM: 1, // buildings don't have canopy spread
        name: (props.name as string) || kind || "Struktur",
      });
    }
  }

  return casters;
}

/* ─────────── Simple centroid extraction ─────────── */

function featureCentroid(geom: Geometry): [number, number] | null {
  if (!geom) return null;
  if (geom.type === "Point") {
    return [geom.coordinates[1], geom.coordinates[0]];
  }
  if (geom.type === "Polygon" && geom.coordinates[0]?.length) {
    const ring = geom.coordinates[0];
    let latSum = 0, lngSum = 0;
    for (const [lng, lat] of ring) {
      latSum += lat;
      lngSum += lng;
    }
    return [latSum / ring.length, lngSum / ring.length];
  }
  if (geom.type === "LineString" && geom.coordinates.length) {
    const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
    return [mid[1], mid[0]];
  }
  if (geom.type === "MultiPolygon" && geom.coordinates[0]?.[0]?.length) {
    const ring = geom.coordinates[0][0];
    let latSum = 0, lngSum = 0;
    for (const [lng, lat] of ring) {
      latSum += lat;
      lngSum += lng;
    }
    return [latSum / ring.length, lngSum / ring.length];
  }
  return null;
}

/* ─────────── Quick shade estimation for a single point ─────────── */

/**
 * Estimate total shade hours at a point caused by all casters.
 * Uses simplified solar geometry — samples 3 months (Apr, Jun, Aug)
 * at 2-hour intervals for performance.
 */
export function estimateShadeAtPoint(
  lat: number,
  lng: number,
  casters: ShadeCaster[],
  mapLat: number, // latitude of the garden (for solar calc)
): number {
  if (casters.length === 0) return 0;

  // Quick distance-based filter: shade can't reach beyond ~60m even for very tall trees
  const MAX_SHADE_REACH = 80; // metres
  const nearbyCasters = casters.filter((c) => {
    const dist = haversineM([c.lng, c.lat], [lng, lat]);
    return dist < MAX_SHADE_REACH && dist > 0.5; // exclude self
  });
  if (nearbyCasters.length === 0) return 0;

  // Sample months: April (4), June (6), August (8) — quick growing-season estimate
  const sampleMonths = [4, 6, 8];
  // Sample hours: 7, 9, 11, 13, 15, 17, 19 solar time
  const sampleHours = [7, 9, 11, 13, 15, 17, 19];
  let shadedSamples = 0;
  let totalSamples = 0;

  const latRad = mapLat * (Math.PI / 180);

  for (const month of sampleMonths) {
    // Day of year for month mid-point
    const doy = Math.floor(30.4 * month - 15);
    const decl = 23.45 * Math.sin(((360 / 365) * (doy + 284)) * (Math.PI / 180));
    const declRad = decl * (Math.PI / 180);

    for (const hour of sampleHours) {
      totalSamples++;
      const hourAngle = (hour - 12) * 15 * (Math.PI / 180);

      // Sun altitude
      const sinAlt =
        Math.sin(latRad) * Math.sin(declRad) +
        Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngle);
      const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
      if (altitude <= 0) continue; // sun below horizon

      // Sun azimuth
      const cosAz =
        (Math.sin(declRad) - Math.sin(latRad) * sinAlt) /
        (Math.cos(latRad) * Math.cos(altitude));
      let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
      if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;
      const azDeg = azimuth * (180 / Math.PI);

      // Shadow direction (opposite of sun)
      const shadowDir = (azDeg + 180) % 360;

      // Check each caster
      for (const caster of nearbyCasters) {
        const dist = haversineM([caster.lng, caster.lat], [lng, lat]);
        const shadowLen = caster.heightM / Math.tan(altitude);
        const effectiveReach = shadowLen + caster.canopyRadiusM;
        if (dist > effectiveReach) continue;

        // Check if target is in shadow direction
        const bearing = geoBearing([caster.lng, caster.lat], [lng, lat]);
        let angleDiff = Math.abs(bearing - shadowDir);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;

        // Angular width based on canopy radius at distance
        const angularWidth = dist > 0.5
          ? Math.atan2(caster.canopyRadiusM, dist) * (180 / Math.PI) + 15
          : 90;

        if (angleDiff < angularWidth) {
          shadedSamples++;
          break; // one caster is enough for this sample
        }
      }
    }
  }

  // Convert shaded fraction to hours (based on ~15h growing-season day)
  if (totalSamples === 0) return 0;
  return Math.round((shadedSamples / totalSamples) * GROWING_SUN_HOURS * 10) / 10;
}

/* ─────────── Colour mapping ─────────── */

/**
 * Returns an RGBA colour string for a given sun-hours value.
 * Full sun (15h) → bright yellow, partial (8h) → orange, shade (0h) → dark blue.
 */
export function sunHoursToColor(sunHours: number, opacity = 0.35): string {
  const t = Math.max(0, Math.min(1, sunHours / GROWING_SUN_HOURS)); // 0 = full shade, 1 = full sun

  // Colour gradient: deep-blue → teal → green → yellow
  let r: number, g: number, b: number;
  if (t < 0.25) {
    // Deep blue → dark teal
    const s = t / 0.25;
    r = Math.round(30 + s * 20);
    g = Math.round(50 + s * 70);
    b = Math.round(130 - s * 30);
  } else if (t < 0.5) {
    // Dark teal → green
    const s = (t - 0.25) / 0.25;
    r = Math.round(50 - s * 10);
    g = Math.round(120 + s * 60);
    b = Math.round(100 - s * 60);
  } else if (t < 0.75) {
    // Green → light green/yellow
    const s = (t - 0.5) / 0.25;
    r = Math.round(40 + s * 160);
    g = Math.round(180 + s * 40);
    b = Math.round(40 - s * 20);
  } else {
    // Yellow → bright warm
    const s = (t - 0.75) / 0.25;
    r = Math.round(200 + s * 55);
    g = Math.round(220 - s * 20);
    b = Math.round(20 + s * 30);
  }

  return `rgba(${r},${g},${b},${opacity})`;
}

/**
 * Label for sun level
 */
export function sunLevelLabel(sunHours: number): string {
  if (sunHours >= 12) return "☀️ Fuld sol";
  if (sunHours >= 8) return "🌤️ Delvis sol";
  if (sunHours >= 4) return "⛅ Delvis skygge";
  return "🌑 Skygge";
}
