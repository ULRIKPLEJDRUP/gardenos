"use client";

import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon } from "geojson";
import L from "leaflet";
import "leaflet-draw";
import "leaflet-path-drag";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, WMSTileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  getAllPlants,
  getPlantById,
  getVariety,
  getVarietiesForSpecies,
  getInstancesForFeature,
  addPlantInstance,
  removePlantInstance,
  updatePlantInstance,
  checkCompanions,
  checkRotation,
  formatMonthRange,
  type CompanionCheck,
} from "../lib/plantStore";
import type { PlantSpecies, PlantInstance, PlantCategory, PlantVariety, PlacementType } from "../lib/plantTypes";
import {
  PLANT_CATEGORY_LABELS,
  LIGHT_LABELS,
  WATER_LABELS,
  LIFECYCLE_LABELS,
  PLANT_FAMILY_LABELS,
  DIFFICULTY_LABELS,
  PLACEMENT_LABELS,
  PLACEMENT_ICONS,
  getDefaultPlacements,
  canPlaceInCategory,
} from "../lib/plantTypes";
import VarietyManager from "./VarietyManager";
import PlantEditor from "./PlantEditor";
import IconPicker from "./IconPicker";
import {
  ALL_INFRA_ELEMENTS,
  getInfraElementById,
  getInfraElementsForMode,
  ELEMENT_MODE_LABELS,
  ELEMENT_MODE_ICONS,
  INFRA_CATEGORY_LABELS,
  type InfraElement,
  type ElementModeKey,
} from "../lib/elementData";

// ---------------------------------------------------------------------------
// NOTE: We no longer use Leaflet.draw's L.EditToolbar.Edit for editing.
// Instead we directly enable/disable .editing and .dragging on individual
// layers.  This avoids the fundamental architecture mismatch where
// L.EditToolbar.Edit operates on ALL layers in the featureGroup at once.
// ---------------------------------------------------------------------------

type KnownGardenFeatureKind =
  | "bed" | "row" | "pot" | "raised-bed"
  | "tree" | "bush" | "flower" | "plant"
  | "greenhouse" | "kitchen-garden" | "slope" | "production-garden"
  | "water" | "electric" | "lamp"
  // ── Granular water kinds ──
  | "water-pipe" | "water-hose" | "water-drip" | "water-tap" | "water-sprinkler" | "water-timer" | "water-barrel"
  // ── Granular electric kinds ──
  | "electric-cable" | "electric-lv" | "electric-outlet" | "electric-junction" | "electric-panel" | "electric-solar"
  // ── Granular lamp kinds ──
  | "lamp-garden" | "lamp-spot" | "lamp-led-string" | "lamp-wall" | "lamp-solar" | "lamp-path" | "lamp-battery" | "lamp-flood"
  | "shade" | "moist-soil" | "sandy-soil" | "wind" | "clay-soil";
type GardenFeatureKind = KnownGardenFeatureKind | (string & {});

// Six primary categories matching the user's domain model
type GardenFeatureCategory = "element" | "row" | "seedbed" | "container" | "area" | "condition";

type KindGeometry = "point" | "polygon" | "polyline";

// Sub-groups within each category
type KindSubGroup = "plant" | "infra" | "default";

type KindDef = {
  kind: string;
  label: string;
  category: GardenFeatureCategory;
  geometry: KindGeometry;
  subGroup?: KindSubGroup;
};

const CATEGORY_LABELS: Record<GardenFeatureCategory, string> = {
  element: "Element",
  row: "Række",
  seedbed: "Såbed",
  container: "Container",
  area: "Område",
  condition: "Særligt forhold",
};

const CATEGORY_DESCRIPTIONS: Record<GardenFeatureCategory, string> = {
  element: "Planter, træer, buske, ledninger, lamper",
  row: "Rækker til frø og planter",
  seedbed: "Såbede med rækker af frø",
  container: "Bed, krukker, højbede",
  area: "Drivhus, køkkenhave, skråning",
  condition: "Skygge, fugtig jord, sandjord, vind",
};

type GardenFeatureProperties = {
  gardenosId: string;
  category?: GardenFeatureCategory;
  kind?: GardenFeatureKind;
  name?: string;
  notes?: string;
  groupId?: string;
  groupName?: string;

  // ── Element-specific (plants) ──
  planted?: string;       // what is planted / variety
  plantedAt?: string;     // planting date
  sunNeed?: string;       // sol/halvskygge/skygge
  waterNeed?: string;     // lav/middel/høj

  // ── Linked plant species (from plant archive) ──
  speciesId?: string;     // reference to PlantSpecies.id
  varietyId?: string;     // reference to PlantVariety.id
  varietyName?: string;   // display name of variety

  // ── Linked infrastructure element (from element catalogue) ──
  elementTypeId?: string; // reference to InfraElement.id

  // ── Custom icon (emoji) ──
  customIcon?: string;    // emoji icon for map marker display

  // ── Photo ──
  photoUrl?: string;      // data-URL or external URL of attached photo

  // ── Container-specific ──
  soilType?: string;      // jordtype i containeren
  fertilizer?: string;    // gødningsplan
  bedType?: string;       // kept for backward compat

  // ── Area-specific ──
  shelter?: string;       // læforhold
  heating?: string;       // opvarmning (drivhus)

  // ── Condition-specific ──
  conditionDesc?: string; // beskrivelse af forholdet
  intensity?: string;     // intensitet (svag/middel/stærk)
};

type GardenFeature = Feature<Geometry, GardenFeatureProperties>;

type GardenFeatureCollection = FeatureCollection<Geometry, GardenFeatureProperties>;

type SelectedFeatureState = {
  gardenosId: string;
  feature: GardenFeature;
};

type UndoSnapshot = {
  layout: GardenFeatureCollection;
  selectedId: string | null;
};

const STORAGE_LAYOUT_KEY = "gardenos:layout:v1";
const STORAGE_VIEW_KEY = "gardenos:view:v1";
const STORAGE_KIND_DEFS_KEY = "gardenos:kinds:v1";
const STORAGE_GROUPS_KEY = "gardenos:groups:v1";
const STORAGE_HIDDEN_KINDS_KEY = "gardenos:hiddenKinds:v1";
const STORAGE_HIDDEN_VIS_KINDS_KEY = "gardenos:hiddenVisKinds:v1";
const STORAGE_BOOKMARKS_KEY = "gardenos:bookmarks:v1";

interface MapBookmark {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  emoji?: string;
}

function loadBookmarks(): MapBookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_BOOKMARKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MapBookmark[];
  } catch { return []; }
}

function saveBookmarks(bookmarks: MapBookmark[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

function loadHiddenKinds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_HIDDEN_KINDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.map((s: unknown) => String(s).toLowerCase()));
  } catch { /* ignore */ }
  return new Set();
}

function saveHiddenKinds(hidden: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_HIDDEN_KINDS_KEY, JSON.stringify([...hidden]));
}

function loadHiddenVisKinds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_HIDDEN_VIS_KINDS_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return new Set(arr.map(String)); }
  } catch { /* ignore */ }
  return new Set();
}

function saveHiddenVisKinds(hidden: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_HIDDEN_VIS_KINDS_KEY, JSON.stringify([...hidden]));
}

type GroupMeta = { name: string };
type GroupRegistry = Record<string, GroupMeta>;

function loadGroupRegistry(): GroupRegistry {
  try {
    const raw = localStorage.getItem(STORAGE_GROUPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as GroupRegistry;
  } catch { /* ignore */ }
  return {};
}

function saveGroupRegistry(reg: GroupRegistry) {
  localStorage.setItem(STORAGE_GROUPS_KEY, JSON.stringify(reg));
}

const KNOWN_KIND_DEFS: KindDef[] = [
  // ── Elementer: planter ──
  { kind: "tree", label: "Træ", category: "element", geometry: "point", subGroup: "plant" },
  { kind: "bush", label: "Busk", category: "element", geometry: "point", subGroup: "plant" },
  { kind: "flower", label: "Blomst", category: "element", geometry: "point", subGroup: "plant" },
  { kind: "plant", label: "Plante", category: "element", geometry: "point", subGroup: "plant" },

  // ── Elementer: infrastruktur (legacy / fallback) ──
  { kind: "water", label: "Vandledning", category: "element", geometry: "polyline", subGroup: "infra" },
  { kind: "electric", label: "Ledning / El", category: "element", geometry: "polyline", subGroup: "infra" },
  { kind: "lamp", label: "Lampe", category: "element", geometry: "point", subGroup: "infra" },

  // ── Vand (granulære) ──
  { kind: "water-pipe", label: "Vandrør", category: "element", geometry: "polyline", subGroup: "infra" },
  { kind: "water-hose", label: "Haveslange", category: "element", geometry: "polyline", subGroup: "infra" },
  { kind: "water-drip", label: "Drypslange", category: "element", geometry: "polyline", subGroup: "infra" },
  { kind: "water-tap", label: "Vandhane", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "water-sprinkler", label: "Sprinkler", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "water-timer", label: "Vandtimer", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "water-barrel", label: "Regnvandstønde", category: "element", geometry: "point", subGroup: "infra" },

  // ── El (granulære) ──
  { kind: "electric-cable", label: "El-ledning", category: "element", geometry: "polyline", subGroup: "infra" },
  { kind: "electric-lv", label: "Lavspændingskabel", category: "element", geometry: "polyline", subGroup: "infra" },
  { kind: "electric-outlet", label: "Stikkontakt", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "electric-junction", label: "Samledåse", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "electric-panel", label: "El-tavle", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "electric-solar", label: "Solcellepanel", category: "element", geometry: "point", subGroup: "infra" },

  // ── Lamper (granulære) ──
  { kind: "lamp-garden", label: "Havelampe", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-spot", label: "Spotlampe", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-led-string", label: "LED-lyskæde", category: "element", geometry: "polyline", subGroup: "infra" },
  { kind: "lamp-wall", label: "Væglampe", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-solar", label: "Solcellelampe", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-path", label: "Stibelysning", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-battery", label: "Batterilampe", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-flood", label: "Projektør", category: "element", geometry: "point", subGroup: "infra" },

  // ── Rækker ──
  { kind: "row", label: "Række", category: "row", geometry: "polyline", subGroup: "default" },
  { kind: "double-row", label: "Dobbeltrække", category: "row", geometry: "polyline", subGroup: "default" },

  // ── Såbede ──
  { kind: "seedbed", label: "Såbed", category: "seedbed", geometry: "polygon", subGroup: "default" },
  { kind: "seedbed-raised", label: "Højt såbed", category: "seedbed", geometry: "polygon", subGroup: "default" },

  // ── Containere ──
  { kind: "bed", label: "Bed", category: "container", geometry: "polygon", subGroup: "default" },
  { kind: "pot", label: "Krukke", category: "container", geometry: "polygon", subGroup: "default" },
  { kind: "raised-bed", label: "Højbed", category: "container", geometry: "polygon", subGroup: "default" },

  // ── Områder ──
  { kind: "greenhouse", label: "Drivhus", category: "area", geometry: "polygon", subGroup: "default" },
  { kind: "kitchen-garden", label: "Køkkenhave", category: "area", geometry: "polygon", subGroup: "default" },
  { kind: "slope", label: "Skråning", category: "area", geometry: "polygon", subGroup: "default" },
  { kind: "production-garden", label: "Produktionshave", category: "area", geometry: "polygon", subGroup: "default" },

  // ── Særlige forhold (overlay zones) ──
  { kind: "shade", label: "Skygge", category: "condition", geometry: "polygon", subGroup: "default" },
  { kind: "moist-soil", label: "Fugtig jord", category: "condition", geometry: "polygon", subGroup: "default" },
  { kind: "sandy-soil", label: "Sandjord", category: "condition", geometry: "polygon", subGroup: "default" },
  { kind: "wind", label: "Vindforhold", category: "condition", geometry: "polygon", subGroup: "default" },
  { kind: "clay-soil", label: "Lerjord", category: "condition", geometry: "polygon", subGroup: "default" },
];

const KNOWN_KIND_SET = new Set(KNOWN_KIND_DEFS.map((d) => d.kind.toLowerCase()));

function isKnownKind(kind: string | undefined): kind is KnownGardenFeatureKind {
  return !!kind && KNOWN_KIND_SET.has(kind.toLowerCase());
}

function dedupeKindDefs(defs: KindDef[]): KindDef[] {
  const seen = new Set<string>();
  const out: KindDef[] = [];
  for (const def of defs) {
    const key = def.kind.trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push({
      ...def,
      kind: key,
      label: (def.label ?? key).toString(),
    });
  }
  return out;
}

function loadCustomKindDefsFromStorage(): KindDef[] {
  if (typeof window === "undefined") return [];
  const raw = safeJsonParse<unknown>(localStorage.getItem(STORAGE_KIND_DEFS_KEY));
  if (!Array.isArray(raw)) return [];

  const parsed: KindDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Partial<KindDef>;
    if (typeof v.kind !== "string" || typeof v.label !== "string") continue;
    const validCats: GardenFeatureCategory[] = ["element", "row", "seedbed", "container", "area", "condition"];
    if (!validCats.includes(v.category as GardenFeatureCategory)) continue;
    if (v.geometry !== "point" && v.geometry !== "polygon" && v.geometry !== "polyline") continue;
    const subGroup: KindSubGroup = v.subGroup === "infra" ? "infra" : v.subGroup === "plant" ? "plant" : "default";
    if (isKnownKind(v.kind)) continue;
    parsed.push({ kind: v.kind, label: v.label, category: v.category as GardenFeatureCategory, geometry: v.geometry, subGroup });
  }
  return dedupeKindDefs(parsed);
}

function saveCustomKindDefsToStorage(defs: KindDef[]): void {
  if (typeof window === "undefined") return;
  const customOnly = defs.filter((d) => !isKnownKind(d.kind));
  localStorage.setItem(STORAGE_KIND_DEFS_KEY, JSON.stringify(dedupeKindDefs(customOnly)));
}

function kindDefForKind(kind: string | undefined): KindDef | undefined {
  if (!kind) return undefined;
  const trimmed = kind.trim();
  if (!trimmed) return undefined;

  const known = KNOWN_KIND_DEFS.find((d) => d.kind.toLowerCase() === trimmed.toLowerCase());
  if (known) return known;

  const custom = loadCustomKindDefsFromStorage().find((d) => d.kind.toLowerCase() === trimmed.toLowerCase());
  return custom;
}

function kindLabel(kind: GardenFeatureKind | undefined): string {
  if (!kind) return "";
  const def = kindDefForKind(kind);
  if (def) return def.label;
  return kind.toString().trim();
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isFeatureCollection(value: unknown): value is GardenFeatureCollection {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; features?: unknown };
  return v.type === "FeatureCollection" && Array.isArray(v.features);
}

function serializeLayer(layer: L.Layer): GardenFeature | null {
  const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
  const layerWithToGeoJSON = layerWithFeature as unknown as { toGeoJSON?: () => unknown };
  if (typeof layerWithToGeoJSON.toGeoJSON !== "function") return null;

  // Important: call as a method so Leaflet keeps the correct `this`.
  const geo = layerWithToGeoJSON.toGeoJSON() as GardenFeature;

  const merged: GardenFeature = {
    ...geo,
    properties: {
      ...(geo.properties ?? {}),
      ...(layerWithFeature.feature?.properties ?? {}),
    },
  };

  const normalized = ensureDefaultProperties(merged);
  layerWithFeature.feature = normalized;
  return normalized;
}

function serializeGroup(group: L.FeatureGroup): GardenFeatureCollection {
  const features: GardenFeature[] = [];
  group.eachLayer((layer) => {
    const f = serializeLayer(layer);
    if (f) features.push(f);
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultKindForGeometry(geometry: Geometry): GardenFeatureKind {
  if (geometry.type === "Polygon") return "bed";
  if (geometry.type === "LineString") return "water";
  return "tree";
}

function categoryForKind(kind: GardenFeatureKind, geometry?: Geometry): GardenFeatureCategory {
  const def = kindDefForKind(kind);
  if (def) return def.category;
  if (geometry) return defaultCategoryForGeometry(geometry);
  return "element";
}

function defaultCategoryForGeometry(geometry: Geometry): GardenFeatureCategory {
  return geometry.type === "Polygon" ? "container" : "element";
}

function subGroupForKind(kind: GardenFeatureKind | undefined): KindSubGroup {
  if (!kind) return "default";
  const def = kindDefForKind(kind);
  return def?.subGroup ?? "default";
}

function ensureDefaultProperties(feature: GardenFeature): GardenFeature {
  const kind = feature.properties?.kind ?? defaultKindForGeometry(feature.geometry);
  const def = kindDefForKind(kind);
  const category = def?.category ?? feature.properties?.category ?? defaultCategoryForGeometry(feature.geometry);
  return {
    ...feature,
    properties: {
      ...feature.properties,
      gardenosId: feature.properties?.gardenosId ?? newId(),
      category,
      kind,
      name: feature.properties?.name ?? "",
      notes: feature.properties?.notes ?? "",
      // element (plant)
      planted: feature.properties?.planted ?? "",
      plantedAt: feature.properties?.plantedAt ?? "",
      sunNeed: feature.properties?.sunNeed ?? "",
      waterNeed: feature.properties?.waterNeed ?? "",
      // linked plant species
      speciesId: feature.properties?.speciesId ?? "",
      varietyId: feature.properties?.varietyId ?? "",
      varietyName: feature.properties?.varietyName ?? "",
      // linked infrastructure element
      elementTypeId: feature.properties?.elementTypeId ?? "",
      // custom icon
      customIcon: feature.properties?.customIcon ?? "",
      // photo
      photoUrl: feature.properties?.photoUrl ?? "",
      // container
      soilType: feature.properties?.soilType ?? "",
      fertilizer: feature.properties?.fertilizer ?? "",
      bedType: feature.properties?.bedType ?? "",
      // area
      shelter: feature.properties?.shelter ?? "",
      heating: feature.properties?.heating ?? "",
      // condition
      conditionDesc: feature.properties?.conditionDesc ?? "",
      intensity: feature.properties?.intensity ?? "",
    },
  };
}

function formatAreaSquareMeters(area: number): string {
  if (!Number.isFinite(area) || area < 0) return "";
  if (area < 1) return `${area.toFixed(2)} m²`;
  if (area < 10) return `${area.toFixed(1)} m²`;
  return `${Math.round(area)} m²`;
}

function formatEdgeLength(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1) return `${(meters * 100).toFixed(0)} cm`;
  if (meters < 10) return `${meters.toFixed(2)} m`;
  return `${meters.toFixed(1)} m`;
}

function areaForPolygonFeature(feature: Feature<Polygon, GardenFeatureProperties>): number | null {
  // Prefer Leaflet.draw's GeometryUtil if available.
  const geometryUtil = (L as unknown as { GeometryUtil?: { geodesicArea?: (latlngs: L.LatLng[]) => number } })
    .GeometryUtil;
  const geodesicArea = geometryUtil?.geodesicArea;
  if (typeof geodesicArea !== "function") return null;

  const ring = feature.geometry.coordinates[0];
  if (!ring || ring.length < 3) return null;
  const latlngs = ring.map(([lng, lat]) => L.latLng(lat, lng));
  return geodesicArea(latlngs);
}

function isPolygon(feature: GardenFeature): feature is Feature<Polygon, GardenFeatureProperties> {
  return feature.geometry.type === "Polygon";
}

function isPoint(feature: GardenFeature): feature is Feature<Point, GardenFeatureProperties> {
  return feature.geometry.type === "Point";
}

function isLineString(feature: GardenFeature): feature is Feature<LineString, GardenFeatureProperties> {
  return feature.geometry.type === "LineString";
}

function ringWithoutClosure(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
}

// Ray casting in lng/lat plane (good enough for small garden polygons).
function pointInRing(point: [number, number], ring: [number, number][]): boolean {
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

function polygonOuterRing(feature: Feature<Polygon, GardenFeatureProperties>): [number, number][] {
  const ring = feature.geometry.coordinates?.[0] ?? [];
  return ringWithoutClosure(ring as [number, number][]);
}

function polygonContainsPointFeature(
  container: Feature<Polygon, GardenFeatureProperties>,
  point: Feature<Point, GardenFeatureProperties>
): boolean {
  const ring = polygonOuterRing(container);
  if (ring.length < 3) return false;
  const coords = point.geometry.coordinates as [number, number];
  return pointInRing(coords, ring);
}

function polygonContainsLineStringFeature(
  container: Feature<Polygon, GardenFeatureProperties>,
  line: Feature<LineString, GardenFeatureProperties>
): boolean {
  const ring = polygonOuterRing(container);
  if (ring.length < 3) return false;
  const coords = (line.geometry.coordinates ?? []) as [number, number][];
  for (const c of coords) {
    if (pointInRing(c, ring)) return true;
  }
  return false;
}

function polygonContainsPolygonFeature(
  container: Feature<Polygon, GardenFeatureProperties>,
  candidate: Feature<Polygon, GardenFeatureProperties>
): boolean {
  const ring = polygonOuterRing(container);
  if (ring.length < 3) return false;
  const candidateRing = polygonOuterRing(candidate);
  if (candidateRing.length < 3) return false;
  // Strict containment: all vertices inside.
  return candidateRing.every((c) => pointInRing(c, ring));
}

function polygonAreaApprox(feature: Feature<Polygon, GardenFeatureProperties>): number {
  const ring = polygonOuterRing(feature);
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum) / 2;
}

type ContainmentCounts = {
  elements: number;
  containers: number;
  areas: number;
  conditions: number;
  infra: number;
  total: number;
};

type ContainmentResult = {
  countsByContainerId: Map<string, ContainmentCounts>;
  childIdsByContainerId: Map<string, string[]>;
};

function computeContainment(layout: GardenFeatureCollection | null): ContainmentResult {
  const countsByContainerId = new Map<string, ContainmentCounts>();
  const childIdsByContainerId = new Map<string, string[]>();

  if (!layout?.features?.length) return { countsByContainerId, childIdsByContainerId };

  const normalized = layout.features.map((f) => ensureDefaultProperties(f as GardenFeature));

  // Areas, containers, seedbeds, and rows can all contain children
  const parentPolygons = normalized
    .filter((f) => {
      if (!isPolygon(f)) return false;
      const cat = f.properties?.category ?? "element";
      return cat === "area" || cat === "container" || cat === "seedbed" || cat === "row";
    })
    .map((f) => f as Feature<Polygon, GardenFeatureProperties>);

  const parentMeta = parentPolygons
    .map((c) => ({
      id: c.properties!.gardenosId,
      feature: c,
      category: c.properties!.category!,
      area: polygonAreaApprox(c),
    }))
    .filter((m) => !!m.id);

  const ensureCounts = (id: string): ContainmentCounts => {
    const existing = countsByContainerId.get(id);
    if (existing) return existing;
    const next: ContainmentCounts = { elements: 0, containers: 0, areas: 0, conditions: 0, infra: 0, total: 0 };
    countsByContainerId.set(id, next);
    return next;
  };

  const pushChild = (parentId: string, childId: string) => {
    const list = childIdsByContainerId.get(parentId) ?? [];
    list.push(childId);
    childIdsByContainerId.set(parentId, list);
  };

  for (const feature of normalized) {
    const gardenosId = feature.properties?.gardenosId;
    if (!gardenosId) continue;

    const candidates: { id: string; area: number }[] = [];
    for (const c of parentMeta) {
      if (c.id === gardenosId) continue;
      let inside = false;
      if (isPoint(feature)) inside = polygonContainsPointFeature(c.feature, feature);
      else if (isLineString(feature)) inside = polygonContainsLineStringFeature(c.feature, feature);
      else if (isPolygon(feature)) inside = polygonContainsPolygonFeature(c.feature, feature);
      if (inside) candidates.push({ id: c.id, area: c.area });
    }
    if (candidates.length === 0) continue;

    // Choose the smallest containing polygon => the most specific parent.
    candidates.sort((a, b) => (a.area || Number.POSITIVE_INFINITY) - (b.area || Number.POSITIVE_INFINITY));
    const parentId = candidates[0].id;

    pushChild(parentId, gardenosId);
    const counts = ensureCounts(parentId);
    counts.total += 1;

    const category = feature.properties?.category ?? defaultCategoryForGeometry(feature.geometry);
    const sg = subGroupForKind(feature.properties?.kind);

    if (category === "element" && sg === "infra") counts.infra += 1;
    else if (category === "element") counts.elements += 1;
    else if (category === "row" || category === "seedbed" || category === "container") counts.containers += 1;
    else if (category === "area") counts.areas += 1;
    else if (category === "condition") counts.conditions += 1;
  }

  return { countsByContainerId, childIdsByContainerId };
}

function makeUniqueName(baseName: string, existingNames: Set<string>): string {
  const trimmed = baseName.trim();
  if (!trimmed) return "";

  if (!existingNames.has(trimmed)) return trimmed;

  const match = /^(.*)\s\((\d+)\)$/.exec(trimmed);
  const stem = (match?.[1] ?? trimmed).trim();
  const start = match ? Number(match[2]) + 1 : 2;

  for (let i = start; i < start + 999; i += 1) {
    const candidate = `${stem} (${i})`;
    if (!existingNames.has(candidate)) return candidate;
  }

  // Fallback (should be extremely rare)
  return `${stem} (${Date.now()})`;
}

function offsetLatLng(map: L.Map, latlng: L.LatLngLiteral, dx = 24, dy = 24): L.LatLngLiteral {
  const p = map.latLngToContainerPoint(latlng);
  const p2 = L.point(p.x + dx, p.y + dy);
  const ll = map.containerPointToLatLng(p2);
  return { lat: ll.lat, lng: ll.lng };
}

// ---------------------------------------------------------------------------
// Icon Registry – per-kind default icons stored in localStorage
// ---------------------------------------------------------------------------
const ICON_REGISTRY_KEY = "gardenos:kindIcons:v1";

function loadKindIconRegistry(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(ICON_REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}

function saveKindIconRegistry(registry: Record<string, string>) {
  window.localStorage.setItem(ICON_REGISTRY_KEY, JSON.stringify(registry));
}

function getKindDefaultIcon(kind: string): string {
  return loadKindIconRegistry()[kind] ?? "";
}

function setKindDefaultIcon(kind: string, emoji: string) {
  const reg = loadKindIconRegistry();
  if (emoji) {
    reg[kind] = emoji;
  } else {
    delete reg[kind];
  }
  saveKindIconRegistry(reg);
}

// ---------------------------------------------------------------------------
// Resolve icon for a feature: per-feature customIcon → kind default → ""
// ---------------------------------------------------------------------------
function resolveFeatureIcon(props: GardenFeatureProperties | undefined): string {
  if (!props) return "";
  if (props.customIcon) return props.customIcon;
  if (props.kind) return getKindDefaultIcon(props.kind);
  return "";
}

// ---------------------------------------------------------------------------
// Marker icon – supports optional emoji rendering
// ---------------------------------------------------------------------------
function markerIcon(kind: GardenFeatureKind | undefined, selected: boolean, groupHighlight?: boolean, emoji?: string): L.DivIcon {
  // If there's an emoji, render it as an HTML div icon
  if (emoji) {
    const emojiSize = selected ? 22 : 18;
    const selectedClass = selected ? "gardenos-emoji-marker--selected" : "";
    const groupClass = groupHighlight ? "gardenos-emoji-marker--group" : "";
    return L.divIcon({
      className: `gardenos-emoji-marker ${selectedClass} ${groupClass}`.trim(),
      html: `<span style="font-size:${emojiSize}px;line-height:1;display:flex;align-items:center;justify-content:center;width:100%;height:100%">${emoji}</span>`,
      iconSize: [emojiSize + 8, emojiSize + 8],
      iconAnchor: [Math.round((emojiSize + 8) / 2), Math.round((emojiSize + 8) / 2)],
    });
  }

  const base = "gardenos-marker";
  const kindClass = kind && isKnownKind(kind.toString()) ? `gardenos-marker--${kind}` : "";
  const selectedClass = selected ? "gardenos-marker--selected" : "";
  const groupClass = groupHighlight ? "gardenos-marker--group" : "";
  const className = [base, kindClass, selectedClass, groupClass].filter(Boolean).join(" ");

  const size = selected ? 16 : 14;
  const finalSize = kind === "bush" ? (selected ? 14 : 12)
    : kind === "flower" ? (selected ? 12 : 10)
    : kind === "lamp" ? (selected ? 14 : 12)
    : size;
  const finalAnchor = Math.round(finalSize / 2);

  return L.divIcon({
    className,
    iconSize: [finalSize, finalSize],
    iconAnchor: [finalAnchor, finalAnchor],
  });
}

function ensureMarkerHasDragging(marker: L.Marker) {
  const anyMarker = marker as unknown as {
    dragging?: { enable?: () => void; disable?: () => void };
  };

  // Leaflet.draw expects marker.dragging to exist so it can enable/disable it.
  if (anyMarker.dragging) return;

  const MarkerDragCtor = (L as unknown as { Handler?: { MarkerDrag?: new (m: L.Marker) => unknown } }).Handler
    ?.MarkerDrag;
  if (typeof MarkerDragCtor !== "function") return;

  anyMarker.dragging = new (MarkerDragCtor as unknown as new (m: L.Marker) => {
    enable?: () => void;
    disable?: () => void;
  })(marker);
}

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

L.Marker.prototype.options.icon = markerIcon(undefined, false);

type MapDrawControlsProps = {
  featureGroupRef: React.MutableRefObject<L.FeatureGroup | null>;
  mapRef: React.MutableRefObject<L.Map | null>;
  persistView: () => void;
  loadSavedLayers: () => void;
  attachClickHandler: (layer: L.Layer, feature: GardenFeature) => void;
  rebuildFromGroupAndUpdateSelection: () => void;
  setSelected: React.Dispatch<React.SetStateAction<SelectedFeatureState | null>>;
  pushUndoSnapshot: () => void;
  createKindRef: React.MutableRefObject<GardenFeatureKind>;
  createSpeciesRef: React.MutableRefObject<{ speciesId: string | null; varietyId: string | null; varietyName: string | null }>;
  createElementRef: React.MutableRefObject<string | null>;
  bumpPlantInstances: () => void;
};

function MapDrawControls({
  featureGroupRef,
  mapRef,
  persistView,
  loadSavedLayers,
  attachClickHandler,
  rebuildFromGroupAndUpdateSelection,
  setSelected,
  pushUndoSnapshot,
  createKindRef,
  createSpeciesRef,
  createElementRef,
  bumpPlantInstances,
}: MapDrawControlsProps) {
  const map = useMap();
  const scaleControlRef = useRef<L.Control.Scale | null>(null);

  // -----------------------------------------------------------------------
  // Store all callback props in refs so the main useEffect doesn't re-run
  // when their identity changes.  This prevents the cascade:
  //   containment change → applyLayerVisuals new id → attachClickHandler
  //   new id → loadSavedLayers new id → effect re-runs → loadSavedLayers()
  //   clears all layers → reloads from stale savedLayout → edits lost.
  // -----------------------------------------------------------------------
  const cbRef = useRef({
    persistView,
    loadSavedLayers,
    attachClickHandler,
    rebuildFromGroupAndUpdateSelection,
    setSelected,
    pushUndoSnapshot,
    bumpPlantInstances,
  });
  // eslint-disable-next-line react-hooks/refs -- cbRef mirrors callback props intentionally
  cbRef.current = {
    persistView,
    loadSavedLayers,
    attachClickHandler,
    rebuildFromGroupAndUpdateSelection,
    setSelected,
    pushUndoSnapshot,
    bumpPlantInstances,
  };

  useMapEvents({
    moveend: () => {
      mapRef.current = map;
      cbRef.current.persistView();
    },
  });

  useEffect(() => {
    mapRef.current = map;

    if (!scaleControlRef.current) {
      scaleControlRef.current = L.control.scale({ imperial: false, metric: true });
      scaleControlRef.current.addTo(map);
    }

    if (!featureGroupRef.current) {
      featureGroupRef.current = new L.FeatureGroup();
      map.addLayer(featureGroupRef.current);
    }

    const drawnItems = featureGroupRef.current;

    // We only use L.Control.Draw for creating new shapes (polygon/polyline/marker).
    // Editing & moving is handled directly via per-layer .editing/.dragging.
    const drawControl = new L.Control.Draw({
      edit: false as unknown as L.Control.DrawConstructorOptions["edit"],
      draw: {
        polygon: { repeatMode: true },
        polyline: { repeatMode: true },
        marker: { repeatMode: true },
        rectangle: false,
        circle: false,
        circlemarker: false,
      },
    });

    map.addControl(drawControl);

    const onCreated = (event: L.LeafletEvent) => {
      const e = event as unknown as L.DrawEvents.Created;

      cbRef.current.pushUndoSnapshot();

      drawnItems.addLayer(e.layer);

      // Read pending species/variety link from the ref
      const pendingSpecies = createSpeciesRef.current;
      const speciesProps: Partial<GardenFeatureProperties> = {};
      if (pendingSpecies?.speciesId) {
        const sp = getPlantById(pendingSpecies.speciesId);
        speciesProps.speciesId = pendingSpecies.speciesId;
        speciesProps.varietyId = pendingSpecies.varietyId ?? "";
        speciesProps.varietyName = pendingSpecies.varietyName ?? "";
        // Auto-fill name from species if available
        if (sp) {
          speciesProps.name = pendingSpecies.varietyName
            ? `${sp.name} — ${pendingSpecies.varietyName}`
            : sp.name;
          speciesProps.planted = speciesProps.name;
        }
      }

      // Read pending infra element link from the ref
      const pendingElementId = createElementRef.current;
      const elementProps: Partial<GardenFeatureProperties> = {};
      if (pendingElementId) {
        const el = getInfraElementById(pendingElementId);
        elementProps.elementTypeId = pendingElementId;
        if (el) {
          elementProps.name = el.name;
          // Auto-set customIcon: prefer kind default → catalogue icon
          const kindDefault = el.featureKind ? getKindDefaultIcon(el.featureKind) : "";
          elementProps.customIcon = kindDefault || el.icon;
        }
      }

      // Auto-set customIcon from plant species if no infra element
      if (!pendingElementId && pendingSpecies?.speciesId) {
        const sp = getPlantById(pendingSpecies.speciesId);
        if (sp?.icon) {
          speciesProps.customIcon = sp.icon;
        }
      }

      const geo = e.layer.toGeoJSON() as GardenFeature;
      const normalized = ensureDefaultProperties({
        ...geo,
        properties: {
          ...(geo.properties ?? {}),
          kind: createKindRef.current,
          ...speciesProps,
          ...elementProps,
        },
      });
      cbRef.current.attachClickHandler(e.layer, normalized);

      // Auto-create PlantInstance if species was linked
      if (pendingSpecies?.speciesId && normalized.properties?.gardenosId) {
        addPlantInstance({
          id: crypto.randomUUID(),
          speciesId: pendingSpecies.speciesId,
          varietyId: pendingSpecies.varietyId ?? undefined,
          varietyName: pendingSpecies.varietyName ?? undefined,
          featureId: normalized.properties.gardenosId,
          count: 1,
          plantedAt: new Date().toISOString().slice(0, 10),
          season: new Date().getFullYear(),
        });
        cbRef.current.bumpPlantInstances?.();
      }

      cbRef.current.rebuildFromGroupAndUpdateSelection();
      cbRef.current.setSelected({ gardenosId: normalized.properties!.gardenosId, feature: normalized });
    };

    map.on(L.Draw.Event.CREATED, onCreated);

    cbRef.current.loadSavedLayers();

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.removeControl(drawControl);

      if (scaleControlRef.current) {
        scaleControlRef.current.remove();
        scaleControlRef.current = null;
      }
    };
    // Only re-run when the map instance changes (effectively once).
    // Callbacks are accessed via cbRef so their identity changes don't matter.
  }, [map, featureGroupRef, mapRef, createKindRef]);

  return null;
}

// ---------------------------------------------------------------------------
// Box-select: Shift+drag on map background to multi-select features.
// ---------------------------------------------------------------------------
type BoxSelectProps = {
  featureGroupRef: React.MutableRefObject<L.FeatureGroup | null>;
  setMultiSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
};

function BoxSelectOverlay({ featureGroupRef, setMultiSelectedIds }: BoxSelectProps) {
  const map = useMap();

  useEffect(() => {
    // Disable Leaflet's built-in box-zoom (also shift+drag) so we can repurpose
    // shift+drag for our box-select.
    map.boxZoom.disable();

    const container = map.getContainer();
    let start: L.Point | null = null;
    let boxEl: HTMLDivElement | null = null;

    const onMouseDown = (e: MouseEvent) => {
      if (!e.shiftKey || e.button !== 0) return;
      // Don't start box-select when clicking on a Leaflet interactive element
      const target = e.target as HTMLElement;
      if (target.closest('.leaflet-marker-icon, .leaflet-interactive')) return;

      e.preventDefault();
      e.stopPropagation();
      map.dragging.disable();

      const rect = container.getBoundingClientRect();
      start = L.point(e.clientX - rect.left, e.clientY - rect.top);

      boxEl = document.createElement('div');
      boxEl.style.cssText =
        'position:absolute;border:2px dashed var(--foreground);background:rgba(128,128,128,0.15);z-index:9999;pointer-events:none;';
      boxEl.style.left = start.x + 'px';
      boxEl.style.top = start.y + 'px';
      boxEl.style.width = '0px';
      boxEl.style.height = '0px';
      container.appendChild(boxEl);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!start || !boxEl) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      boxEl.style.left = Math.min(start.x, x) + 'px';
      boxEl.style.top = Math.min(start.y, y) + 'px';
      boxEl.style.width = Math.abs(x - start.x) + 'px';
      boxEl.style.height = Math.abs(y - start.y) + 'px';
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!start) return;
      map.dragging.enable();

      if (boxEl) {
        boxEl.remove();
        boxEl = null;
      }

      const rect = container.getBoundingClientRect();
      const end = L.point(e.clientX - rect.left, e.clientY - rect.top);

      // Only trigger if the drag distance was significant (> 10 px)
      if (start.distanceTo(end) < 10) {
        start = null;
        return;
      }

      const sw = map.containerPointToLatLng(
        L.point(Math.min(start.x, end.x), Math.max(start.y, end.y))
      );
      const ne = map.containerPointToLatLng(
        L.point(Math.max(start.x, end.x), Math.min(start.y, end.y))
      );
      const bounds = L.latLngBounds(sw, ne);
      start = null;

      const group = featureGroupRef.current;
      if (!group) return;

      const ids = new Set<string>();
      group.eachLayer((layer) => {
        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
        const id = f?.properties?.gardenosId;
        if (!id) return;
        if (layer instanceof L.Marker) {
          if (bounds.contains(layer.getLatLng())) ids.add(id);
        } else if (layer instanceof L.Path) {
          const lb = (layer as unknown as { getBounds?: () => L.LatLngBounds }).getBounds?.();
          if (lb && bounds.intersects(lb)) ids.add(id);
        }
      });

      if (ids.size > 0) {
        setMultiSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.add(id);
          return next;
        });
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      map.boxZoom.enable();
      map.dragging.enable();
      if (boxEl) boxEl.remove();
    };
  }, [map, featureGroupRef, setMultiSelectedIds]);

  return null;
}

export function GardenMapClient() {
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const activeDrawHandlerRef = useRef<{ disable: () => void } | null>(null);
  const createKindRef = useRef<GardenFeatureKind>("bed");

  const [isReady, setIsReady] = useState(false);
  const [selected, setSelected] = useState<SelectedFeatureState | null>(null);
  const selectedRef = useRef<SelectedFeatureState | null>(null);
  const [drawMode, setDrawMode] = useState<"select" | "bed" | "plant">("select");
  const [createPalette, setCreatePalette] = useState<GardenFeatureCategory>("element");
  const [createKind, setCreateKind] = useState<GardenFeatureKind>("tree");
  const [customKindDefs, setCustomKindDefs] = useState<KindDef[]>(() => loadCustomKindDefsFromStorage());
  const [hiddenKinds, setHiddenKinds] = useState<Set<string>>(() => loadHiddenKinds());
  const [hiddenVisibilityKinds, setHiddenVisibilityKinds] = useState<Set<string>>(() => loadHiddenVisKinds());
  const [newKindText, setNewKindText] = useState("");
  const [newKindError, setNewKindError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [sidebarTab, setSidebarTab] = useState<"create" | "content" | "groups" | "plants" | "view">("create");

  // ── Plant knowledge system state ──
  const [plantSearch, setPlantSearch] = useState("");
  const [plantCategoryFilter, setPlantCategoryFilter] = useState<PlantCategory | "all">("all");
  const [expandedPlantId, setExpandedPlantId] = useState<string | null>(null);
  const [plantInstancesVersion, setPlantInstancesVersion] = useState(0);
  const [bedPlantSearch, setBedPlantSearch] = useState("");
  const [showBedPlantPicker, setShowBedPlantPicker] = useState(false);
  const [bedPickerSpeciesId, setBedPickerSpeciesId] = useState<string | null>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [showVarietyManager, setShowVarietyManager] = useState(false);
  const [varietyManagerSpeciesId, setVarietyManagerSpeciesId] = useState<string | null>(null);
  const [showPlantEditor, setShowPlantEditor] = useState(false);
  const [editPlantSpeciesId, setEditPlantSpeciesId] = useState<string | null>(null);
  const [plantDataVersion, setPlantDataVersion] = useState(0);
  const [contentPlantDetailsOpen, setContentPlantDetailsOpen] = useState(false);
  const [contentVarietyPickerOpen, setContentVarietyPickerOpen] = useState(false);

  // ── Create-flow plant picker state ──
  type ElementMode = "planter" | "el" | "vand" | "lampe";
  const [elementMode, setElementMode] = useState<ElementMode>("planter");
  const [createPlantSearch, setCreatePlantSearch] = useState("");
  const [createPlantCategoryFilter, setCreatePlantCategoryFilter] = useState<PlantCategory | "all">("all");
  const [createSelectedSpeciesId, setCreateSelectedSpeciesId] = useState<string | null>(null);
  const [createSelectedVarietyId, setCreateSelectedVarietyId] = useState<string | null>(null);
  const [createSelectedVarietyName, setCreateSelectedVarietyName] = useState<string | null>(null);
  const createSpeciesRef = useRef<{ speciesId: string | null; varietyId: string | null; varietyName: string | null }>({
    speciesId: null, varietyId: null, varietyName: null,
  });

  // ── Create-flow infra element picker state ──
  const [createSelectedElementId, setCreateSelectedElementId] = useState<string | null>(null);
  const createElementRef = useRef<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const multiSelectedIdsRef = useRef<Set<string>>(new Set());
  const [hiddenCategories, setHiddenCategories] = useState<Set<GardenFeatureCategory>>(new Set());
  const [showSatellite, setShowSatellite] = useState(false);
  const [showMatrikel, setShowMatrikel] = useState(false);
  const [showJordart, setShowJordart] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);
  const [dfUser, setDfUser] = useState(() => window.localStorage.getItem("gardenos:df:user") ?? "");
  const [dfPass, setDfPass] = useState(() => window.localStorage.getItem("gardenos:df:pass") ?? "");
  const dfReady = dfUser.length > 0 && dfPass.length > 0;
  const [dfTestStatus, setDfTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  // ── Address search + bookmarks ──
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  const [bookmarks, setBookmarks] = useState<MapBookmark[]>(() => loadBookmarks());
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [newBookmarkName, setNewBookmarkName] = useState("");
  const [newBookmarkEmoji, setNewBookmarkEmoji] = useState("📍");

  const searchAddress = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setAddressSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&countrycodes=dk&addressdetails=1`,
        { headers: { "Accept-Language": "da" } }
      );
      const data = await res.json();
      setAddressResults(data);
    } catch { setAddressResults([]); }
    setAddressSearching(false);
  }, []);

  const goToLocation = useCallback((lat: number, lon: number, zoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([lat, lon], zoom ?? 18);
    setShowAddressSearch(false);
    setAddressResults([]);
  }, []);

  const addBookmark = useCallback((name: string, emoji?: string) => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const bm: MapBookmark = {
      id: Date.now().toString(36),
      name,
      center: [c.lat, c.lng],
      zoom: map.getZoom(),
      emoji: emoji || "📍",
    };
    setBookmarks((prev) => { const next = [...prev, bm]; saveBookmarks(next); return next; });
  }, []);

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => { const next = prev.filter((b) => b.id !== id); saveBookmarks(next); return next; });
  }, []);

  const updateBookmark = useCallback((id: string, patch: Partial<MapBookmark>) => {
    setBookmarks((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, ...patch } : b));
      saveBookmarks(next);
      return next;
    });
  }, []);

  const testDfCredentials = async (user: string, pass: string) => {
    setDfTestStatus("testing");
    try {
      const url = `https://services.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWMS/1.0.0/WMS?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&service=WMS&request=GetCapabilities`;
      const res = await fetch(url);
      const text = await res.text();
      if (text.includes("WMS_Capabilities")) {
        setDfTestStatus("ok");
      } else {
        setDfTestStatus("fail");
      }
    } catch {
      setDfTestStatus("fail");
    }
  };
  const [groupRegistry, setGroupRegistry] = useState<GroupRegistry>(() => loadGroupRegistry());
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  const [groupSectionOpen, setGroupSectionOpen] = useState(false);
  const edgeLabelLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const [layoutForContainment, setLayoutForContainment] = useState<GardenFeatureCollection>(() => {
    const parsed = safeJsonParse<unknown>(window.localStorage.getItem(STORAGE_LAYOUT_KEY));
    if (isFeatureCollection(parsed)) return parsed;
    return { type: "FeatureCollection", features: [] } as GardenFeatureCollection;
  });

  const sidebarTabRef = useRef(sidebarTab);
  sidebarTabRef.current = sidebarTab;

  const setSelectedAndFocus = useCallback<React.Dispatch<React.SetStateAction<SelectedFeatureState | null>>>(
    (value) => {
      setSelected((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        // Only auto-switch to "content" if we're on "create" – don't hijack other tabs
        if (next && (sidebarTabRef.current === "create" || sidebarTabRef.current === "content")) {
          setSidebarTab("content");
        }
        return next;
      });
    },
    []
  );

  /** Select a feature by its gardenosId and switch to Content tab */
  const selectFeatureById = useCallback(
    (id: string) => {
      const group = featureGroupRef.current;
      if (!group) return;
      let found = false;
      group.eachLayer((layer) => {
        if (found) return;
        const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
        const f = layerWithFeature.feature;
        if (f?.properties?.gardenosId === id) {
          found = true;
          const typedFeature = ensureDefaultProperties(f);
          setMultiSelectedIds(new Set());
          setSelectedAndFocus({ gardenosId: id, feature: typedFeature });
        }
      });
    },
    [setSelectedAndFocus]
  );

  const allKindDefs = useMemo(() => {
    const all = dedupeKindDefs([...KNOWN_KIND_DEFS, ...customKindDefs]);
    if (hiddenKinds.size === 0) return all;
    return all.filter((d) => !hiddenKinds.has(d.kind.toLowerCase()));
  }, [customKindDefs, hiddenKinds]);

  // Full list including hidden — used for label lookups / existing features
  const allKindDefsIncludingHidden = useMemo(() => {
    return dedupeKindDefs([...KNOWN_KIND_DEFS, ...customKindDefs]);
  }, [customKindDefs]);

  const kindDefByKind = useMemo(() => {
    return new Map(allKindDefs.map((d) => [d.kind.toLowerCase(), d]));
  }, [allKindDefs]);

  const defaultCreateKindForPalette = useMemo(() => {
    const first = (cat: GardenFeatureCategory) =>
      allKindDefs.find((d) => d.category === cat)?.kind ?? "tree";
    return {
      element: first("element"),
      row: first("row"),
      seedbed: first("seedbed"),
      container: first("container"),
      area: first("area"),
      condition: first("condition"),
    } as const;
  }, [allKindDefs]);

  const selectedGeometry = useMemo<KindGeometry | null>(() => {
    if (!selected) return null;
    const t = selected.feature.geometry.type;
    if (t === "Polygon") return "polygon";
    if (t === "Point") return "point";
    if (t === "LineString") return "polyline";
    return null;
  }, [selected]);

  const selectedIsPolygon = selectedGeometry === "polygon";
  const selectedIsPoint = selectedGeometry === "point";
  const selectedIsPolyline = selectedGeometry === "polyline";

  const containment = useMemo(() => computeContainment(layoutForContainment), [layoutForContainment]);

  const selectedContainment = useMemo(() => {
    if (!selected) return null;
    return containment.countsByContainerId.get(selected.gardenosId) ?? null;
  }, [containment, selected]);

  const selectedContainedItemsPreview = useMemo(() => {
    if (!selected) return [] as { id: string; text: string }[];
    const ids = containment.childIdsByContainerId.get(selected.gardenosId) ?? [];
    if (!layoutForContainment?.features?.length || ids.length === 0) return [];

    const byId = new Map(
      layoutForContainment.features
        .map((f) => ensureDefaultProperties(f as GardenFeature))
        .map((f) => [f.properties!.gardenosId, f])
    );

    // Category sort order: larger containers first, then smaller, elements last
    const catOrder: Record<string, number> = { area: 0, container: 1, seedbed: 2, row: 3, element: 4, condition: 5 };

    const out: { id: string; text: string; sortCat: number; sortLabel: string }[] = [];
    for (const id of ids) {
      const f = byId.get(id);
      if (!f) continue;
      const name = (f.properties?.name ?? "").trim();
      const label = kindLabel(f.properties?.kind);
      const cat = (f.properties?.category ?? "element") as string;
      out.push({ id, text: name ? `${label}: ${name}` : label, sortCat: catOrder[cat] ?? 4, sortLabel: label.toLowerCase() });
    }
    out.sort((a, b) => a.sortCat - b.sortCat || a.sortLabel.localeCompare(b.sortLabel, "da") || a.text.localeCompare(b.text, "da"));
    return out;
  }, [containment.childIdsByContainerId, layoutForContainment, selected]);

  const applyLayerVisuals = useCallback(
    (layer: L.Layer, selectedId: string | null) => {
      const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
      const feature = layerWithFeature.feature;
      const kind = feature?.properties?.kind;
      const gardenosId = feature?.properties?.gardenosId;
      const isSelected = !!selectedId && !!gardenosId && gardenosId === selectedId;

      // ── Layer visibility based on hiddenCategories & hiddenVisibilityKinds ──
      const layerCat = (feature?.properties?.category ?? "element") as GardenFeatureCategory;
      const isHiddenCat = hiddenCategories.has(layerCat);
      const isHiddenKind = !!kind && hiddenVisibilityKinds.has((kind as string).toLowerCase());
      const isHidden = isHiddenCat || isHiddenKind;
      const el = (layer as unknown as { getElement?: () => HTMLElement | undefined }).getElement?.();
      if (el) {
        el.style.display = isHidden ? "none" : "";
      } else if (layer instanceof L.Marker) {
        // Marker element may not exist yet; set opacity instead
        layer.setOpacity(isHidden ? 0 : 1);
      }
      if (isHidden) return;

      const shouldShowContainment =
        !!feature &&
        feature.geometry.type === "Polygon" &&
        ["container", "area", "seedbed", "row"].includes(feature.properties?.category ?? "");

      const containmentCounts = shouldShowContainment && gardenosId ? containment.countsByContainerId.get(gardenosId) : undefined;

      const containmentSuffix = containmentCounts && containmentCounts.total > 0
        ? ` • ${containmentCounts.elements} elem. • ${containmentCounts.containers} cont. • ${containmentCounts.areas} omr. • ${containmentCounts.infra} infra`
        : "";

      // Tooltip to reinforce what a thing is.
      const name = (feature?.properties?.name ?? "").trim();
      const label = kindLabel(kind);
      const featureIcon = feature?.properties?.customIcon;
      const tooltipBase = featureIcon
        ? (name ? `${featureIcon} ${label}: ${name}` : `${featureIcon} ${label}`)
        : (name ? `${label}: ${name}` : label);

      // Add planted-species info to bed/row/area/container tooltips
      let plantSuffix = "";
      const featureCat = feature?.properties?.category;
      if (gardenosId && (featureCat === "seedbed" || featureCat === "container" || featureCat === "area" || featureCat === "row")) {
        const instances = getInstancesForFeature(gardenosId);
        if (instances.length > 0) {
          const plantNames = instances.map((inst) => {
            const sp = getPlantById(inst.speciesId);
            const n = sp ? `${sp.icon ?? "🌱"} ${sp.name}` : inst.speciesId;
            return inst.varietyName ? `${n} (${inst.varietyName})` : n;
          });
          plantSuffix = `\n${plantNames.join(", ")}`;
        }
      }

      // Add linked species info to element (plant) tooltips
      if (featureCat === "element" && feature?.properties?.speciesId) {
        const linkedSpecies = getPlantById(feature.properties.speciesId);
        if (linkedSpecies) {
          const vName = feature.properties.varietyName;
          plantSuffix = `\n${linkedSpecies.icon ?? "🌱"} ${linkedSpecies.name}${vName ? ` — ${vName}` : ""}`;
        }
      }

      // Add linked infra element info to tooltip
      if (featureCat === "element" && feature?.properties?.elementTypeId) {
        const linkedEl = getInfraElementById(feature.properties.elementTypeId);
        if (linkedEl) {
          plantSuffix = `\n${linkedEl.icon} ${linkedEl.name}`;
        }
      }

      const tooltipText = `${tooltipBase}${containmentSuffix}${plantSuffix}`;

      const tooltipIsPermanent = false;

      const maybeTooltipLayer = layer as unknown as {
        unbindTooltip?: () => void;
        bindTooltip?: (content: string, options?: unknown) => void;
      };
      if (tooltipText && typeof maybeTooltipLayer.bindTooltip === "function") {
        maybeTooltipLayer.unbindTooltip?.();
        maybeTooltipLayer.bindTooltip(tooltipText, {
          sticky: !tooltipIsPermanent,
          permanent: tooltipIsPermanent,
          opacity: 0.9,
          className: "gardenos-tooltip",
          direction: "top",
        });
      }

      if (layer instanceof L.Marker) {
        const emoji = resolveFeatureIcon(feature?.properties);
        layer.setIcon(markerIcon(kind, isSelected, false, emoji));
        return;
      }

      const maybePath = layer as unknown as {
        setStyle?: (options: L.PathOptions) => void;
      };
      if (typeof maybePath.setStyle !== "function") return;

      // Distinguish containers without introducing new colors.
      if (kind === "greenhouse") {
        maybePath.setStyle({
          color: "var(--foreground)",
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.03,
          dashArray: "6 6",
        });
        return;
      }

      // Area polygons: thin dashed border, very faint fill
      const cat = feature?.properties?.category;
      if (cat === "area") {
        maybePath.setStyle({
          color: "var(--foreground)",
          weight: 2,
          opacity: 0.7,
          fillOpacity: 0.03,
          dashArray: "8 4",
        });
        return;
      }

      // Condition overlays: very translucent, dotted
      if (cat === "condition") {
        maybePath.setStyle({
          color: "var(--foreground)",
          weight: 1,
          opacity: 0.5,
          fillOpacity: 0.06,
          dashArray: "2 4",
        });
        return;
      }

      // Row lines: thicker for easy clicking, short dashes
      if (cat === "row") {
        maybePath.setStyle({
          color: "var(--foreground)",
          weight: 5,
          opacity: 0.8,
          fillOpacity: 0,
          dashArray: "6 4",
        });
        return;
      }

      // Technical/infrastructure lines
      if (kind === "water") {
        maybePath.setStyle({
          color: "var(--foreground)",
          weight: 3,
          opacity: 0.9,
          fillOpacity: 0,
          dashArray: "10 6",
        });
        return;
      }

      if (kind === "electric") {
        maybePath.setStyle({
          color: "var(--foreground)",
          weight: 3,
          opacity: 0.9,
          fillOpacity: 0,
          dashArray: "2 6",
        });
        return;
      }

      // Default polygon style (beds etc.)
      maybePath.setStyle({
        color: "var(--foreground)",
        weight: 2,
        opacity: 0.85,
        fillOpacity: 0.08,
        dashArray: undefined,
      });
    },
    [containment, hiddenCategories, hiddenVisibilityKinds]
  );

  const highlightedGroupIdRef = useRef<string | null>(null);

  const updateSelectionStyles = useCallback(
    (selectedId: string | null) => {
      const group = featureGroupRef.current;
      if (!group) return;

      // --- Z-order: ensure areas/conditions are behind smaller shapes so
      //     rows, containers, seedbeds etc. are clickable even when inside
      //     a large area polygon. ---
      const zPriority: Record<string, number> = {
        condition: 0,
        area: 1,
        seedbed: 2,
        container: 3,
        row: 4,
        element: 5,
      };
      const allLayersForZ: Array<{ layer: L.Layer; pri: number }> = [];
      group.eachLayer((layer) => {
        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
        const cat = f?.properties?.category ?? "element";
        allLayersForZ.push({ layer, pri: zPriority[cat] ?? 3 });
      });
      allLayersForZ.sort((a, b) => a.pri - b.pri);
      for (const { layer: zLayer } of allLayersForZ) {
        (zLayer as unknown as { bringToFront?: () => void }).bringToFront?.();
      }
      // --- end z-order ---

      // Determine groupId of the selected item (if any)
      let selectedGroupId: string | undefined;
      if (selectedId) {
        group.eachLayer((layer) => {
          const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
          if (f?.properties?.gardenosId === selectedId) {
            selectedGroupId = f.properties?.groupId;
          }
        });
      }

      const multiIds = multiSelectedIdsRef.current;
      const hlGroupId = highlightedGroupIdRef.current;

      group.eachLayer((layer) => {
        // First apply the base visuals per kind, then apply selection highlight on top.
        applyLayerVisuals(layer, selectedId);

        const layerWithFeature = layer as L.Layer & {
          feature?: GardenFeature;
          __gardenosOriginalStyle?: L.PathOptions;
        };

        const gardenosId = layerWithFeature.feature?.properties?.gardenosId;
        const layerGroupId = layerWithFeature.feature?.properties?.groupId;
        const isSelected = !!selectedId && gardenosId === selectedId;
        const isMultiSelected = !!gardenosId && multiIds.has(gardenosId);
        const isGroupSibling = !isSelected && !!selectedGroupId && !!layerGroupId && layerGroupId === selectedGroupId;
        const isHighlightedGroup = !isSelected && !!hlGroupId && !!layerGroupId && layerGroupId === hlGroupId;

        // Marker visual for multi-select, group siblings, and highlighted group
        if (layerWithFeature instanceof L.Marker) {
          const emoji = resolveFeatureIcon(layerWithFeature.feature?.properties);
          if (isMultiSelected) {
            layerWithFeature.setIcon(markerIcon(layerWithFeature.feature?.properties?.kind, true, false, emoji));
          } else if (isGroupSibling || isHighlightedGroup) {
            layerWithFeature.setIcon(markerIcon(layerWithFeature.feature?.properties?.kind, false, true, emoji));
          }
          return;
        }

        const maybePath = layerWithFeature as unknown as {
          setStyle?: (options: L.PathOptions) => void;
          bringToFront?: () => void;
          options?: L.PathOptions;
        };

        if (typeof maybePath.setStyle !== "function") return;

        if (!layerWithFeature.__gardenosOriginalStyle) {
          const o = maybePath.options ?? {};
          layerWithFeature.__gardenosOriginalStyle = {
            color: o.color,
            weight: o.weight,
            opacity: o.opacity,
            fillColor: o.fillColor,
            fillOpacity: o.fillOpacity,
            dashArray: o.dashArray,
          };
        }

        if (isSelected) {
          maybePath.setStyle({
            color: "var(--foreground)",
            weight: 4,
            opacity: 1,
            fillOpacity: 0.12,
          });
          maybePath.bringToFront?.();
        } else if (isMultiSelected) {
          maybePath.setStyle({
            color: "var(--foreground)",
            weight: 3,
            opacity: 1,
            fillOpacity: 0.08,
          });
          maybePath.bringToFront?.();
        } else if (isGroupSibling || isHighlightedGroup) {
          maybePath.setStyle({
            color: "#f59e0b",
            weight: 5,
            opacity: 1,
            fillColor: "#f59e0b",
            fillOpacity: 0.18,
            dashArray: "8 4",
          });
          maybePath.bringToFront?.();
        } else {
          // Base visuals already applied above.
        }
      });
    },
    [applyLayerVisuals, featureGroupRef]
  );

  // ---------------------------------------------------------------------------
  // Edge-length labels: show meter measurements on each polygon edge when
  // the polygon is selected (container / area / condition).
  // ---------------------------------------------------------------------------
  const updateEdgeLabels = useCallback(
    (selectedId: string | null) => {
      const map = mapRef.current;

      // Always clear previous labels
      if (edgeLabelLayerGroupRef.current) {
        edgeLabelLayerGroupRef.current.clearLayers();
        if (map && map.hasLayer(edgeLabelLayerGroupRef.current)) {
          map.removeLayer(edgeLabelLayerGroupRef.current);
        }
        edgeLabelLayerGroupRef.current = null;
      }

      if (!map || !selectedId) return;

      // Find the selected layer
      const group = featureGroupRef.current;
      if (!group) return;
      let selectedLayer: L.Layer | null = null;
      group.eachLayer((layer) => {
        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
        if (f?.properties?.gardenosId === selectedId) selectedLayer = layer;
      });
      if (!selectedLayer) return;

      // Only for polygons (container / area / condition)
      const feature = (selectedLayer as L.Layer & { feature?: GardenFeature }).feature;
      const cat = feature?.properties?.category;
      if (!cat || cat === "element") return;
      if (feature?.geometry.type !== "Polygon") return;

      // Get the polygon's latlngs
      const getLatLngs = (selectedLayer as unknown as { getLatLngs?: () => L.LatLng[][] | L.LatLng[] }).getLatLngs;
      if (typeof getLatLngs !== "function") return;
      const raw = getLatLngs.call(selectedLayer);
      const latlngs: L.LatLng[] = Array.isArray(raw[0]) ? (raw as L.LatLng[][])[0] : (raw as L.LatLng[]);
      if (!latlngs || latlngs.length < 2) return;

      const labelGroup = L.layerGroup();
      const n = latlngs.length;

      for (let i = 0; i < n; i++) {
        const a = latlngs[i];
        const b = latlngs[(i + 1) % n];
        const dist = a.distanceTo(b); // meters
        if (dist < 0.01) continue; // skip degenerate edges

        const midLat = (a.lat + b.lat) / 2;
        const midLng = (a.lng + b.lng) / 2;

        const label = formatEdgeLength(dist);
        const icon = L.divIcon({
          className: "gardenos-edge-label",
          html: `<span>${label}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const marker = L.marker([midLat, midLng], {
          icon,
          interactive: false,
          keyboard: false,
        });
        labelGroup.addLayer(marker);
      }

      // Also show area as a center label
      const area = areaForPolygonFeature(feature as Feature<Polygon, GardenFeatureProperties>);
      if (area != null && area > 0) {
        // Compute centroid
        let cLat = 0, cLng = 0;
        for (const p of latlngs) { cLat += p.lat; cLng += p.lng; }
        cLat /= n;
        cLng /= n;

        const areaIcon = L.divIcon({
          className: "gardenos-area-label",
          html: `<span>${formatAreaSquareMeters(area)}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        const areaMarker = L.marker([cLat, cLng], {
          icon: areaIcon,
          interactive: false,
          keyboard: false,
        });
        labelGroup.addLayer(areaMarker);
      }

      labelGroup.addTo(map);
      edgeLabelLayerGroupRef.current = labelGroup;
    },
    [featureGroupRef, mapRef]
  );

  // Re-run visuals when highlightedGroupId changes
  useEffect(() => {
    highlightedGroupIdRef.current = highlightedGroupId;
    updateSelectionStyles(selected?.gardenosId ?? null);
    updateEdgeLabels(selected?.gardenosId ?? null);
  }, [highlightedGroupId, selected?.gardenosId, updateSelectionStyles, updateEdgeLabels]);

  useEffect(() => {
    multiSelectedIdsRef.current = multiSelectedIds;
    updateSelectionStyles(selected?.gardenosId ?? null);
    updateEdgeLabels(selected?.gardenosId ?? null);
  }, [layoutForContainment, multiSelectedIds, selected?.gardenosId, updateSelectionStyles, updateEdgeLabels]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const attachClickHandler = useCallback(
    (layer: L.Layer, feature: GardenFeature) => {
      const typedFeature = ensureDefaultProperties(feature);

      const onClick = (e: L.LeafletMouseEvent) => {
        const id = typedFeature.properties!.gardenosId;
        const origEvt = (e as unknown as { originalEvent?: MouseEvent }).originalEvent;

        if (origEvt?.shiftKey) {
          // Shift+click: toggle in multi-selection
          setMultiSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
          return;
        }

        // Normal click: single-select, clear multi-selection
        setMultiSelectedIds(new Set());
        setSelectedAndFocus({ gardenosId: id, feature: typedFeature });
      };

      layer.on("click", onClick);

      // Keep the feature on the layer so edits preserve properties.
      (layer as L.Layer & { feature?: GardenFeature }).feature = typedFeature;

      // Leaflet.draw edit mode assumes markers have a dragging handler.
      if (layer instanceof L.Marker) {
        ensureMarkerHasDragging(layer);
        // Keep markers non-draggable by default; edit mode/our move mode will enable as needed.
        (layer as unknown as { dragging?: { disable?: () => void } }).dragging?.disable?.();
      }

      // Apply visuals immediately.
      applyLayerVisuals(layer, selectedRef.current?.gardenosId ?? null);
    },
    [applyLayerVisuals, setMultiSelectedIds, setSelectedAndFocus]
  );

  const savedLayout = useMemo(() => {
    const parsed = safeJsonParse<unknown>(window.localStorage.getItem(STORAGE_LAYOUT_KEY));
    if (!isFeatureCollection(parsed)) return null;
    return parsed;
  }, []);

  const savedView = useMemo(() => {
    return safeJsonParse<{ center: [number, number]; zoom: number }>(
      window.localStorage.getItem(STORAGE_VIEW_KEY)
    );
  }, []);

  const persistAll = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    const normalized = serializeGroup(group);
    window.localStorage.setItem(STORAGE_LAYOUT_KEY, JSON.stringify(normalized));
  }, []);

  const pushUndoSnapshot = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    const layout = serializeGroup(group);
    const selectedId = selectedRef.current?.gardenosId ?? null;

    setUndoStack((prev) => {
      const next = [...prev, { layout, selectedId }];
      return next.length > 30 ? next.slice(next.length - 30) : next;
    });
  }, []);

  // Keep a ref to attachClickHandler so loadSnapshot doesn't depend on its
  // identity (which changes whenever containment changes).
  const attachClickHandlerRef = useRef(attachClickHandler);
  useEffect(() => {
    attachClickHandlerRef.current = attachClickHandler;
  }, [attachClickHandler]);

  const loadSnapshot = useCallback(
    (snapshot: UndoSnapshot) => {
      const group = featureGroupRef.current;
      if (!group) return;

      group.clearLayers();

      const geoJsonLayer = L.geoJSON(snapshot.layout as GardenFeatureCollection, {
        onEachFeature: (feature, layer) => {
          attachClickHandlerRef.current(layer, feature as GardenFeature);
        },
      });

      geoJsonLayer.eachLayer((layer) => {
        group.addLayer(layer);
      });

      window.localStorage.setItem(STORAGE_LAYOUT_KEY, JSON.stringify(snapshot.layout));
      setLayoutForContainment(snapshot.layout as GardenFeatureCollection);

      if (snapshot.selectedId) {
        const found = snapshot.layout.features.find(
          (f) => f.properties?.gardenosId === snapshot.selectedId
        );
        setSelectedAndFocus(found ? { gardenosId: snapshot.selectedId, feature: found } : null);
      } else {
        setSelectedAndFocus(null);
      }

      updateSelectionStyles(snapshot.selectedId);
    },
    [setSelectedAndFocus, updateSelectionStyles]
  );

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      queueMicrotask(() => loadSnapshot(snapshot));
      return prev.slice(0, -1);
    });
  }, [loadSnapshot]);

  const rebuildFromGroupAndUpdateSelection = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    const normalized = serializeGroup(group);
    window.localStorage.setItem(STORAGE_LAYOUT_KEY, JSON.stringify(normalized));

    setLayoutForContainment(normalized);

    const prevSelected = selectedRef.current;
    if (prevSelected) {
      const found = normalized.features.find(
        (f) => f.properties?.gardenosId === prevSelected.gardenosId
      );
      setSelectedAndFocus(found ? { gardenosId: prevSelected.gardenosId, feature: found } : null);
    }
  }, [setSelectedAndFocus]);

  // ---------------------------------------------------------------------------
  // Helper: build a gardenosId → L.Layer lookup for the current featureGroup.
  // ---------------------------------------------------------------------------
  const buildLayerById = useCallback(() => {
    const group = featureGroupRef.current;
    const map = new Map<string, L.Layer>();
    if (!group) return map;
    group.eachLayer((layer) => {
      const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
      const id = f?.properties?.gardenosId;
      if (id) map.set(id, layer);
    });
    return map;
  }, []);

  // ---------------------------------------------------------------------------
  // Helper: compute the centroid of a path's latlngs (for tracking drag delta).
  // ---------------------------------------------------------------------------
  const pathCentroid = useCallback((layer: L.Path): L.LatLng => {
    const ll = (layer as unknown as { getLatLngs: () => L.LatLng[] | L.LatLng[][] }).getLatLngs();
    const flat: L.LatLng[] = Array.isArray(ll[0]) ? (ll as L.LatLng[][])[0] : (ll as L.LatLng[]);
    let lat = 0, lng = 0;
    for (const p of flat) { lat += p.lat; lng += p.lng; }
    return L.latLng(lat / flat.length, lng / flat.length);
  }, []);

  // ---------------------------------------------------------------------------
  // Move a child layer by a lat/lng delta.
  // ---------------------------------------------------------------------------
  const translateLayer = useCallback((layer: L.Layer, dLat: number, dLng: number) => {
    if (layer instanceof L.Marker) {
      const ll = layer.getLatLng();
      layer.setLatLng(L.latLng(ll.lat + dLat, ll.lng + dLng));
      return;
    }

    if (layer instanceof L.Path) {
      const raw = (layer as unknown as { getLatLngs: () => L.LatLng[] | L.LatLng[][] }).getLatLngs();

      const shift = (arr: L.LatLng[]): L.LatLng[] =>
        arr.map((ll) => L.latLng(ll.lat + dLat, ll.lng + dLng));

      if (Array.isArray(raw[0]) && raw[0][0] instanceof L.LatLng) {
        // Polygon (array of rings) or multi-ring polyline
        (layer as unknown as { setLatLngs: (l: L.LatLng[][]) => void }).setLatLngs(
          (raw as L.LatLng[][]).map(shift)
        );
      } else {
        // Polyline (flat array)
        (layer as unknown as { setLatLngs: (l: L.LatLng[]) => void }).setLatLngs(
          shift(raw as L.LatLng[])
        );
      }
    }
  }, []);

  const setMoveAndPersistHandlersEnabled = useCallback(
    (enabled: boolean, selectedId: string | null) => {
      const group = featureGroupRef.current;
      if (!group) return;

      group.eachLayer((layer) => {
        const layerWithHandlers = layer as L.Layer & {
          __gardenosOnDragEnd?: () => void;
          __gardenosOnDragStart?: () => void;
          __gardenosOnDrag?: () => void;
          __gardenosPrevCenter?: L.LatLng;
          __gardenosChildLayers?: L.Layer[];
          __gardenosOnGroupDragStart?: () => void;
          __gardenosOnGroupDrag?: () => void;
          __gardenosGroupSiblings?: L.Layer[];
          __gardenosGroupPrevCenter?: L.LatLng;
        };
        const layerFeature = (layer as L.Layer & { feature?: GardenFeature }).feature;
        const gardenosId = layerFeature?.properties?.gardenosId;
        const isSelected = !!selectedId && gardenosId === selectedId;

        if (enabled) {
          if (!layerWithHandlers.__gardenosOnDragEnd) {
            const onDragEnd = () => rebuildFromGroupAndUpdateSelection();
            layerWithHandlers.__gardenosOnDragEnd = onDragEnd;
            layer.on("dragend", onDragEnd);
          }

          // Refresh edge labels during drag
          if (isSelected && layer instanceof L.Path) {
            const layerWithEdgeDrag = layer as L.Layer & { __gardenosOnEdgeDrag?: () => void };
            if (!layerWithEdgeDrag.__gardenosOnEdgeDrag) {
              const onEdgeDrag = () => {
                if (gardenosId) updateEdgeLabelsRef.current(gardenosId);
              };
              layerWithEdgeDrag.__gardenosOnEdgeDrag = onEdgeDrag;
              layer.on("drag", onEdgeDrag);
            }
          }

          // -----------------------------------------------------------------
          // Group-drag: when a container polygon is dragged, move all children
          // (trees, bushes, nested containers, lines, etc.) along with it.
          // -----------------------------------------------------------------
          const isContainerPolygon =
            isSelected &&
            layer instanceof L.Path &&
            layerFeature?.geometry?.type === "Polygon" &&
            ["container", "area", "seedbed", "row"].includes(layerFeature?.properties?.category ?? "");

          if (isContainerPolygon && !layerWithHandlers.__gardenosOnDragStart) {
            const onDragStart = () => {
              // Identify child layers from the containment map
              const childIds = containment.childIdsByContainerId.get(gardenosId!) ?? [];
              if (childIds.length === 0) {
                layerWithHandlers.__gardenosChildLayers = [];
                return;
              }
              const layerById = buildLayerById();
              layerWithHandlers.__gardenosChildLayers = childIds
                .map((id) => layerById.get(id))
                .filter((l): l is L.Layer => !!l);

              // Store initial centroid of the container for computing frame-by-frame delta
              layerWithHandlers.__gardenosPrevCenter = pathCentroid(layer as L.Path);
            };

            const onDrag = () => {
              const children = layerWithHandlers.__gardenosChildLayers;
              const prev = layerWithHandlers.__gardenosPrevCenter;
              if (!children?.length || !prev) return;

              const now = pathCentroid(layer as L.Path);
              const dLat = now.lat - prev.lat;
              const dLng = now.lng - prev.lng;

              if (Math.abs(dLat) < 1e-12 && Math.abs(dLng) < 1e-12) return;

              for (const child of children) {
                translateLayer(child, dLat, dLng);
              }

              layerWithHandlers.__gardenosPrevCenter = now;
            };

            layerWithHandlers.__gardenosOnDragStart = onDragStart;
            layerWithHandlers.__gardenosOnDrag = onDrag;
            layer.on("dragstart", onDragStart);
            layer.on("drag", onDrag);
          }

          // -----------------------------------------------------------------
          // Group-drag: when a user-defined group member is dragged, move
          // all other layers in the same group along with it.
          // -----------------------------------------------------------------
          const layerGroupId = layerFeature?.properties?.groupId;
          const isGroupMember = isSelected && !!layerGroupId;

          if (isGroupMember && !layerWithHandlers.__gardenosOnGroupDragStart) {
            const onGroupDragStart = () => {
              const allLayers = buildLayerById();
              const siblings: L.Layer[] = [];
              for (const [id, l] of allLayers) {
                if (id === gardenosId) continue;
                const f = (l as L.Layer & { feature?: GardenFeature }).feature;
                if (f?.properties?.groupId === layerGroupId) siblings.push(l);
              }
              layerWithHandlers.__gardenosGroupSiblings = siblings;
              if (layer instanceof L.Marker) {
                layerWithHandlers.__gardenosGroupPrevCenter = layer.getLatLng();
              } else if (layer instanceof L.Path) {
                layerWithHandlers.__gardenosGroupPrevCenter = pathCentroid(layer);
              }
            };

            const onGroupDrag = () => {
              const siblings = layerWithHandlers.__gardenosGroupSiblings;
              const prev = layerWithHandlers.__gardenosGroupPrevCenter;
              if (!siblings?.length || !prev) return;

              let now: L.LatLng;
              if (layer instanceof L.Marker) {
                now = layer.getLatLng();
              } else if (layer instanceof L.Path) {
                now = pathCentroid(layer);
              } else return;

              const dLat = now.lat - prev.lat;
              const dLng = now.lng - prev.lng;
              if (Math.abs(dLat) < 1e-12 && Math.abs(dLng) < 1e-12) return;

              for (const sibling of siblings) {
                translateLayer(sibling, dLat, dLng);
              }
              layerWithHandlers.__gardenosGroupPrevCenter = now;
            };

            layerWithHandlers.__gardenosOnGroupDragStart = onGroupDragStart;
            layerWithHandlers.__gardenosOnGroupDrag = onGroupDrag;
            layer.on("dragstart", onGroupDragStart);
            layer.on("drag", onGroupDrag);
          }

          // Enable dragging for paths (polygons) if leaflet-path-drag is available.
          if (layer instanceof L.Path) {
            const anyPath = layer as unknown as {
              options?: { draggable?: boolean };
              dragging?: { enable?: () => void; disable?: () => void };
            };
            if (anyPath.options) anyPath.options.draggable = isSelected;

            // leaflet-path-drag creates `path.dragging` via an addInitHook on L.Path.
            // The handler is always created, but only auto-enabled when options.draggable
            // was true at construction time.  For layers created via L.geoJSON (without
            // draggable:true), `dragging` exists but is not enabled.  If for some reason
            // the init hook didn't fire, we create the handler manually here.
            if (isSelected && !anyPath.dragging) {
              /* eslint-disable @typescript-eslint/no-explicit-any */
              const PathDragCtor =
                (L as any).PathDrag ??                     // leaflet-path-drag ≥ 1.1
                (L as any).Handler?.PathDrag;               // older versions
              /* eslint-enable @typescript-eslint/no-explicit-any */
              if (typeof PathDragCtor === "function") {
                anyPath.dragging = new (PathDragCtor as unknown as new (
                  p: L.Path
                ) => { enable?: () => void; disable?: () => void })(layer);
              }
            }

            if (isSelected) anyPath.dragging?.enable?.();
            else anyPath.dragging?.disable?.();
          }

          // Ensure only the selected marker is draggable.
          if (layer instanceof L.Marker) {
            const anyMarker = layer as unknown as {
              dragging?: { enable?: () => void; disable?: () => void };
            };

            // Leaflet only creates marker.dragging when the marker was constructed with { draggable: true }.
            // Create it manually so we can enable/disable it on demand.
            if (!anyMarker.dragging) {
              const MarkerDragCtor = (L as unknown as { Handler?: { MarkerDrag?: new (m: L.Marker) => unknown } })
                .Handler?.MarkerDrag;
              if (typeof MarkerDragCtor === "function") {
                anyMarker.dragging = new (MarkerDragCtor as unknown as new (
                  m: L.Marker
                ) => { enable?: () => void; disable?: () => void })(layer);
              }
            }

            if (isSelected) {
              anyMarker.dragging?.enable?.();
            } else {
              anyMarker.dragging?.disable?.();
            }
          }

          return;
        }

        // --- Cleanup when disabled ---

        if (layerWithHandlers.__gardenosOnDragEnd) {
          layer.off("dragend", layerWithHandlers.__gardenosOnDragEnd);
          delete layerWithHandlers.__gardenosOnDragEnd;
        }

        if (layerWithHandlers.__gardenosOnDragStart) {
          layer.off("dragstart", layerWithHandlers.__gardenosOnDragStart);
          delete layerWithHandlers.__gardenosOnDragStart;
        }

        if (layerWithHandlers.__gardenosOnDrag) {
          layer.off("drag", layerWithHandlers.__gardenosOnDrag);
          delete layerWithHandlers.__gardenosOnDrag;
        }

        delete layerWithHandlers.__gardenosPrevCenter;
        delete layerWithHandlers.__gardenosChildLayers;

        if (layerWithHandlers.__gardenosOnGroupDragStart) {
          layer.off("dragstart", layerWithHandlers.__gardenosOnGroupDragStart);
          delete layerWithHandlers.__gardenosOnGroupDragStart;
        }

        if (layerWithHandlers.__gardenosOnGroupDrag) {
          layer.off("drag", layerWithHandlers.__gardenosOnGroupDrag);
          delete layerWithHandlers.__gardenosOnGroupDrag;
        }

        delete layerWithHandlers.__gardenosGroupSiblings;
        delete layerWithHandlers.__gardenosGroupPrevCenter;

        if (layer instanceof L.Path) {
          const maybeDragging = layer as unknown as { dragging?: { disable?: () => void } };
          maybeDragging.dragging?.disable?.();
        }

        if (layer instanceof L.Marker) {
          const maybeMarkerDragging = layer as unknown as { dragging?: { disable?: () => void } };
          maybeMarkerDragging.dragging?.disable?.();
        }
      });
    },
    [buildLayerById, containment.childIdsByContainerId, pathCentroid, rebuildFromGroupAndUpdateSelection, translateLayer]
  );

  // ---------------------------------------------------------------------------
  // Direct per-layer editing — replaces the old L.EditToolbar.Edit approach.
  // We enable .editing (vertex handles) and .dragging only on the selected
  // layer, and never touch any other layer.  This avoids the "all figures
  // get selected" visual bug and the crash in _disableLayerEdit.
  // ---------------------------------------------------------------------------

  const updateEdgeLabelsRef = useRef(updateEdgeLabels);
  updateEdgeLabelsRef.current = updateEdgeLabels;

  const enableEditingOnLayer = useCallback((layer: L.Layer) => {
    // Enable vertex editing for paths (polygons, polylines)
    const maybeEditable = layer as unknown as { editing?: { enable?: () => void; disable?: () => void } };
    if (typeof maybeEditable.editing?.enable === "function") {
      try { maybeEditable.editing.enable(); } catch { /* noop */ }
    }

    // Attach events to refresh edge labels when shape changes during editing.
    // 'editdrag' fires every frame while the user drags a vertex handle.
    // 'edit' fires once when the vertex drag finishes.
    const layerWithEdit = layer as L.Layer & { __gardenosEditHandler?: () => void };
    if (!layerWithEdit.__gardenosEditHandler) {
      const onEdit = () => {
        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
        const id = f?.properties?.gardenosId;
        if (id) updateEdgeLabelsRef.current(id);
      };
      layerWithEdit.__gardenosEditHandler = onEdit;
      layer.on("edit", onEdit);
      layer.on("editdrag", onEdit);
    }
  }, []);

  const disableEditingOnLayer = useCallback((layer: L.Layer) => {
    // Disable vertex editing for paths
    const maybeEditable = layer as unknown as { editing?: { enable?: () => void; disable?: () => void } };
    if (typeof maybeEditable.editing?.disable === "function") {
      try { maybeEditable.editing.disable(); } catch { /* noop */ }
    }

    // Clean up the edit event handlers
    const layerWithEdit = layer as L.Layer & { __gardenosEditHandler?: () => void };
    if (layerWithEdit.__gardenosEditHandler) {
      layer.off("edit", layerWithEdit.__gardenosEditHandler);
      layer.off("editdrag", layerWithEdit.__gardenosEditHandler);
      delete layerWithEdit.__gardenosEditHandler;
    }
  }, []);

  const enableEditingForSelected = useCallback((selectedId: string | null) => {
    const group = featureGroupRef.current;
    if (!group || !selectedId) return;

    group.eachLayer((layer) => {
      const layerFeature = (layer as L.Layer & { feature?: GardenFeature }).feature;
      const gardenosId = layerFeature?.properties?.gardenosId;
      const isSelected = gardenosId === selectedId;

      if (isSelected) {
        enableEditingOnLayer(layer);
      } else {
        disableEditingOnLayer(layer);
      }
    });
  }, [enableEditingOnLayer, disableEditingOnLayer]);

  const disableEditingForAll = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    group.eachLayer((layer) => {
      disableEditingOnLayer(layer);
    });
  }, [disableEditingOnLayer]);

  const startEditing = useCallback(() => {
    const selectedId = selectedRef.current?.gardenosId ?? null;
    if (!selectedId) return;

    activeDrawHandlerRef.current?.disable();
    activeDrawHandlerRef.current = null;
    setDrawMode("select");
    setMultiSelectedIds(new Set());

    pushUndoSnapshot();
    setIsEditing(true);

    // Enable vertex editing + dragging only for the selected layer
    enableEditingForSelected(selectedId);
    setMoveAndPersistHandlersEnabled(true, selectedId);
  }, [enableEditingForSelected, pushUndoSnapshot, setMoveAndPersistHandlersEnabled]);

  const stopEditing = useCallback(() => {
    if (!isEditing) return;

    // Disable vertex editing on all layers
    disableEditingForAll();

    // Disable dragging on all layers
    setMoveAndPersistHandlersEnabled(false, null);

    setIsEditing(false);

    // Persist changes and refresh selection
    rebuildFromGroupAndUpdateSelection();
  }, [isEditing, disableEditingForAll, rebuildFromGroupAndUpdateSelection, setMoveAndPersistHandlersEnabled]);

  // When the selected item changes while in edit mode, update which layer is editable.
  useEffect(() => {
    if (!isEditing) return;
    const selectedId = selected?.gardenosId ?? null;
    enableEditingForSelected(selectedId);
    setMoveAndPersistHandlersEnabled(true, selectedId);
  }, [isEditing, selected?.gardenosId, setMoveAndPersistHandlersEnabled, enableEditingForSelected]);

  const beginDraw = useCallback((kind: GardenFeatureKind) => {
    const map = mapRef.current;
    if (!map) return;

    setMultiSelectedIds(new Set());
    stopEditing();

    createKindRef.current = kind;
    activeDrawHandlerRef.current?.disable();

    const kindKey = kind.toString().toLowerCase();
    const def = kindDefByKind.get(kindKey);
    // Elements default to point (markers); everything else defaults to polygon (areas)
    const fallbackGeometry: KindGeometry = def?.category === "element" || (!def && kindKey !== "bed" && kindKey !== "greenhouse") ? "point" : "polygon";
    const geometry: KindGeometry = def?.geometry ?? fallbackGeometry;

    if (geometry === "polygon") {
      // Leaflet.draw handler works even if toolbar icons are missing.
      const handler = new L.Draw.Polygon(map as unknown as L.DrawMap, { repeatMode: true });
      handler.enable();
      activeDrawHandlerRef.current = handler;
      setDrawMode("bed");
      return;
    }

    if (geometry === "polyline") {
      const handler = new L.Draw.Polyline(map as unknown as L.DrawMap, { repeatMode: true });
      handler.enable();
      activeDrawHandlerRef.current = handler;
      setDrawMode("plant");
      return;
    }

    const handler = new L.Draw.Marker(map as unknown as L.DrawMap, { repeatMode: true });
    handler.enable();
    activeDrawHandlerRef.current = handler;
    setDrawMode("plant");
  }, [kindDefByKind, stopEditing]);

  const beginDrawSelectedType = useCallback(() => {
    // For elements: auto-determine kind from elementMode + selected species
    if (createPalette === "element") {
      if (elementMode === "planter") {
        // Determine kind from selected species category, or default to "plant"
        let kind: GardenFeatureKind = "plant";
        if (createSelectedSpeciesId) {
          const sp = getPlantById(createSelectedSpeciesId);
          if (sp) {
            switch (sp.category) {
              case "tree": kind = "tree"; break;
              case "bush": kind = "bush"; break;
              case "flower": kind = "flower"; break;
              default: kind = "plant"; break;
            }
          }
        }
        setCreateKind(kind);
        createKindRef.current = kind;
        beginDraw(kind);
      } else {
        // For el/vand/lampe: use selected element type's featureKind, or fallback
        let kind: GardenFeatureKind;
        if (createSelectedElementId) {
          const el = getInfraElementById(createSelectedElementId);
          kind = (el?.featureKind ?? (
            elementMode === "el" ? "electric" :
            elementMode === "vand" ? "water" :
            "lamp"
          )) as GardenFeatureKind;
        } else {
          kind =
            elementMode === "el" ? "electric" :
            elementMode === "vand" ? "water" :
            "lamp";
        }
        setCreateKind(kind);
        createKindRef.current = kind;
        beginDraw(kind);
      }
      return;
    }
    beginDraw(createKind);
  }, [beginDraw, createKind, createPalette, elementMode, createSelectedSpeciesId, createSelectedElementId]);

  const stopDrawing = useCallback(() => {
    activeDrawHandlerRef.current?.disable();
    activeDrawHandlerRef.current = null;
    setDrawMode("select");
  }, []);

  const enterSelectMode = useCallback(() => {
    stopDrawing();
    // Force-disable any editing mode to avoid being stuck in edit/delete.
    stopEditing();
  }, [stopDrawing, stopEditing]);

  const toggleEditMode = useCallback(() => {
    // Avoid conflicts with active draw handlers.
    stopDrawing();

    if (isEditing) stopEditing();
    else startEditing();
  }, [isEditing, startEditing, stopDrawing, stopEditing]);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;

    const group = featureGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;

    pushUndoSnapshot();

    const currentLayout = serializeGroup(group);
    const existingNames = new Set(
      currentLayout.features
        .map((f) => (f.properties?.name ?? "").trim())
        .filter((name) => name.length > 0)
    );

    const source = selected.feature;

    const nextName = makeUniqueName(source.properties?.name ?? "", existingNames);
    const nextProperties: GardenFeatureProperties = {
      ...(source.properties ?? ({} as GardenFeatureProperties)),
      gardenosId: "__temp__",
      name: nextName,
    };
    // Ensure a new ID gets generated
    delete (nextProperties as Partial<GardenFeatureProperties>).gardenosId;

    let nextGeometry: Geometry = source.geometry;

    if (source.geometry.type === "Point") {
      const [lng, lat] = source.geometry.coordinates;
      const ll = offsetLatLng(map, { lat, lng });
      nextGeometry = { type: "Point", coordinates: [ll.lng, ll.lat] };
    } else if (source.geometry.type === "Polygon") {
      const coords = source.geometry.coordinates;
      const nextCoords = coords.map((ring) =>
        ring.map(([lng, lat]) => {
          const ll = offsetLatLng(map, { lat, lng });
          return [ll.lng, ll.lat] as [number, number];
        })
      );
      nextGeometry = { type: "Polygon", coordinates: nextCoords };
    } else {
      // Unsupported geometry for now
      return;
    }

    const nextFeature = ensureDefaultProperties({
      type: "Feature",
      geometry: nextGeometry,
      properties: nextProperties,
    });

    const layerGroup = L.geoJSON(nextFeature as GardenFeatureCollection | GardenFeature, {
      onEachFeature: (feature, layer) => {
        attachClickHandler(layer, feature as GardenFeature);
      },
    });

    let createdLayer: L.Layer | null = null;
    layerGroup.eachLayer((layer) => {
      if (!createdLayer) createdLayer = layer;
      group.addLayer(layer);
    });

    rebuildFromGroupAndUpdateSelection();
    setSelected({ gardenosId: nextFeature.properties!.gardenosId, feature: nextFeature });
  }, [attachClickHandler, pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, selected]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    const group = featureGroupRef.current;
    if (!group) return;

    pushUndoSnapshot();

    const layersToRemove: L.Layer[] = [];
    group.eachLayer((layer) => {
      const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
      if (layerWithFeature.feature?.properties?.gardenosId === selected.gardenosId) {
        layersToRemove.push(layer);
      }
    });

    for (const layer of layersToRemove) {
      group.removeLayer(layer);
    }

    setSelected(null);
    updateSelectionStyles(null);
    rebuildFromGroupAndUpdateSelection();
  }, [pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, selected, updateSelectionStyles]);

  const deleteMultiSelected = useCallback(() => {
    if (multiSelectedIds.size === 0) return;
    const group = featureGroupRef.current;
    if (!group) return;

    pushUndoSnapshot();

    const layersToRemove: L.Layer[] = [];
    group.eachLayer((layer) => {
      const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
      const id = f?.properties?.gardenosId;
      if (id && multiSelectedIds.has(id)) layersToRemove.push(layer);
    });

    for (const layer of layersToRemove) {
      group.removeLayer(layer);
    }

    setMultiSelectedIds(new Set());
    setSelected(null);
    updateSelectionStyles(null);
    rebuildFromGroupAndUpdateSelection();
  }, [multiSelectedIds, pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, updateSelectionStyles]);

  const deleteAll = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    pushUndoSnapshot();
    group.clearLayers();
    setSelected(null);
    updateSelectionStyles(null);
    persistAll();
    setLayoutForContainment({ type: "FeatureCollection", features: [] } as GardenFeatureCollection);
  }, [persistAll, pushUndoSnapshot, updateSelectionStyles]);

  const groupMultiSelected = useCallback(() => {
    if (multiSelectedIds.size < 2) return;

    pushUndoSnapshot();
    const gid = newId();

    // Auto-name: "Gruppe N" where N is next available number
    const existingNumbers = Object.values(groupRegistry)
      .map((m) => { const match = m.name.match(/^Gruppe (\d+)$/); return match ? parseInt(match[1], 10) : 0; })
      .filter((n) => n > 0);
    const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    const groupName = `Gruppe ${nextNum}`;

    const group = featureGroupRef.current;
    if (!group) return;

    group.eachLayer((layer) => {
      const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
      const f = layerWithFeature.feature;
      if (!f) return;
      const id = f.properties?.gardenosId;
      if (id && multiSelectedIds.has(id)) {
        layerWithFeature.feature = {
          ...f,
          properties: { ...f.properties!, groupId: gid, groupName },
        };
      }
    });

    // Save to registry
    const nextReg = { ...groupRegistry, [gid]: { name: groupName } };
    setGroupRegistry(nextReg);
    saveGroupRegistry(nextReg);

    rebuildFromGroupAndUpdateSelection();
    setMultiSelectedIds(new Set());
  }, [multiSelectedIds, pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, groupRegistry]);

  const ungroupSelected = useCallback(() => {
    if (!selected) return;
    const gid = selected.feature.properties?.groupId;
    if (!gid) return;

    pushUndoSnapshot();
    const group = featureGroupRef.current;
    if (!group) return;

    group.eachLayer((layer) => {
      const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
      const f = layerWithFeature.feature;
      if (f?.properties?.groupId === gid) {
        layerWithFeature.feature = {
          ...f,
          properties: { ...f.properties!, groupId: undefined, groupName: undefined },
        };
      }
    });

    // Remove from registry
    const nextReg = { ...groupRegistry };
    delete nextReg[gid];
    setGroupRegistry(nextReg);
    saveGroupRegistry(nextReg);

    rebuildFromGroupAndUpdateSelection();
  }, [selected, pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, groupRegistry]);

  /** Dissolve a group by its ID (usable from Grupper tab without selecting first) */
  const dissolveGroupById = useCallback(
    (gid: string) => {
      pushUndoSnapshot();
      const group = featureGroupRef.current;
      if (!group) return;

      group.eachLayer((layer) => {
        const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
        const f = layerWithFeature.feature;
        if (f?.properties?.groupId === gid) {
          layerWithFeature.feature = {
            ...f,
            properties: { ...f.properties!, groupId: undefined, groupName: undefined },
          };
        }
      });

      // Remove from registry
      const nextReg = { ...groupRegistry };
      delete nextReg[gid];
      setGroupRegistry(nextReg);
      saveGroupRegistry(nextReg);

      // Clear highlight if this group was highlighted
      setHighlightedGroupId((prev) => (prev === gid ? null : prev));

      rebuildFromGroupAndUpdateSelection();
    },
    [pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, groupRegistry]
  );

  /** Remove a single feature from its group by featureId */
  const removeFromGroupById = useCallback(
    (featureId: string) => {
      pushUndoSnapshot();
      const group = featureGroupRef.current;
      if (!group) return;

      let gid: string | undefined;
      group.eachLayer((layer) => {
        const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
        const f = layerWithFeature.feature;
        if (f?.properties?.gardenosId === featureId) {
          gid = f.properties?.groupId;
          layerWithFeature.feature = {
            ...f,
            properties: { ...f.properties!, groupId: undefined, groupName: undefined },
          };
        }
      });

      // If group now has 0 or 1 members, dissolve it
      if (gid) {
        let remaining = 0;
        group.eachLayer((layer) => {
          const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
          if (f?.properties?.groupId === gid) remaining++;
        });
        if (remaining <= 1) {
          // Clear the last member too
          group.eachLayer((layer) => {
            const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
            const f = layerWithFeature.feature;
            if (f && f.properties?.groupId === gid) {
              layerWithFeature.feature = {
                ...f,
                properties: { ...f.properties, groupId: undefined, groupName: undefined },
              } as GardenFeature;
            }
          });
          const nextReg = { ...groupRegistry };
          delete nextReg[gid];
          setGroupRegistry(nextReg);
          saveGroupRegistry(nextReg);
          setHighlightedGroupId((prev) => (prev === gid ? null : prev));
        }
      }

      rebuildFromGroupAndUpdateSelection();
    },
    [pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, groupRegistry]
  );

  /** Delete a feature by its gardenosId */
  const deleteFeatureById = useCallback(
    (featureId: string) => {
      const group = featureGroupRef.current;
      if (!group) return;

      pushUndoSnapshot();

      const layersToRemove: L.Layer[] = [];
      group.eachLayer((layer) => {
        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
        if (f?.properties?.gardenosId === featureId) {
          layersToRemove.push(layer);
        }
      });
      for (const layer of layersToRemove) {
        group.removeLayer(layer);
      }

      // If deleted feature was selected, clear selection
      if (selected?.gardenosId === featureId) {
        setSelected(null);
        updateSelectionStyles(null);
      }

      rebuildFromGroupAndUpdateSelection();
    },
    [pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, selected, updateSelectionStyles]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingTarget =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;

      if (e.key === "Escape") {
        stopDrawing();
        stopEditing();
        setMultiSelectedIds(new Set());
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (!isTypingTarget) {
          e.preventDefault();
          undo();
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        // While drawing, let Leaflet.draw own Backspace/Delete behavior.
        if (drawMode !== "select") return;
        if (isTypingTarget) return;
        e.preventDefault();
        // Multi-selection takes priority over single-selection
        if (multiSelectedIds.size > 0) {
          deleteMultiSelected();
        } else if (selected) {
          deleteSelected();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, deleteMultiSelected, drawMode, multiSelectedIds, selected, stopDrawing, stopEditing, undo]);

  const loadSavedLayers = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    group.clearLayers();
    setLayoutForContainment({ type: "FeatureCollection", features: [] } as GardenFeatureCollection);

    if (!savedLayout?.features?.length) {
      setIsReady(true);
      return;
    }

    const geoJsonLayer = L.geoJSON(savedLayout as GardenFeatureCollection, {
      onEachFeature: (feature, layer) => {
        attachClickHandlerRef.current(layer, feature as GardenFeature);
      },
    });

    geoJsonLayer.eachLayer((layer) => {
      group.addLayer(layer);
    });

    setLayoutForContainment(savedLayout as GardenFeatureCollection);

    persistAll();
    setIsReady(true);
  }, [persistAll, savedLayout]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!savedView) return;

    const map = mapRef.current;
    map.setView(savedView.center, savedView.zoom);
  }, [savedView]);

  const persistView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const center = map.getCenter();
    window.localStorage.setItem(
      STORAGE_VIEW_KEY,
      JSON.stringify({ center: [center.lat, center.lng] as [number, number], zoom: map.getZoom() })
    );
  }, []);

  const updateSelectedProperty = useCallback(
    (patch: Partial<GardenFeatureProperties>) => {
      if (!selected) return;
      const group = featureGroupRef.current;
      if (!group) return;

      pushUndoSnapshot();

      // Update state
      const updatedFeature: GardenFeature = ensureDefaultProperties({
        ...selected.feature,
        properties: {
          ...selected.feature.properties,
          ...patch,
          gardenosId: selected.gardenosId,
        },
      });

      // Update the matching layer's stored feature properties
      group.eachLayer((layer) => {
        const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
        const layerFeature = layerWithFeature.feature;
        if (layerFeature?.properties?.gardenosId === selected.gardenosId) {
          layerWithFeature.feature = updatedFeature;
          applyLayerVisuals(layer, selected.gardenosId);
        }
      });

      setSelected({ gardenosId: selected.gardenosId, feature: updatedFeature });
      rebuildFromGroupAndUpdateSelection();
    },
    [applyLayerVisuals, pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, selected]
  );

  const initialCenter = useMemo<[number, number]>(() => {
    if (savedView?.center) return savedView.center;
    return [55.6761, 12.5683];
  }, [savedView]);

  const initialZoom = useMemo(() => {
    return savedView?.zoom ?? 16;
  }, [savedView]);

  const selectedKind = selected?.feature.properties?.kind;
  const selectedCategory = selected?.feature.properties?.category;
  const selectedGroupId = selected?.feature.properties?.groupId;

  // ── Plant computed values ──
  const allPlants = useMemo(() => { void plantDataVersion; return getAllPlants(); }, [plantDataVersion]);

  const filteredPlants = useMemo(() => {
    let list = allPlants;
    if (plantCategoryFilter !== "all") {
      list = list.filter((p) => p.category === plantCategoryFilter);
    }
    if (plantSearch.trim()) {
      const q = plantSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.latinName?.toLowerCase().includes(q) ?? false) ||
          p.id.includes(q),
      );
    }
    return list;
  }, [allPlants, plantCategoryFilter, plantSearch]);

  const selectedFeatureId = selected?.feature.properties?.gardenosId ?? "";

  const selectedFeatureInstances = useMemo(() => {
    if (!selected) return [] as (PlantInstance & { species?: PlantSpecies })[];
    const _v = plantInstancesVersion; // reactivity trigger
    return getInstancesForFeature(selectedFeatureId).map((inst) => ({
      ...inst,
      species: getPlantById(inst.speciesId),
    }));
  }, [selected, selectedFeatureId, plantInstancesVersion]);

  const selectedCompanionChecks = useMemo(() => {
    if (!selected) return [] as CompanionCheck[];
    const _v = plantInstancesVersion;
    return checkCompanions(selectedFeatureId);
  }, [selected, selectedFeatureId, plantInstancesVersion]);

  const selectedRotationWarnings = useMemo(() => {
    if (!selected) return [] as { plant: PlantSpecies; lastSeason: number; minYears: number }[];
    const _v = plantInstancesVersion;
    return checkRotation(selectedFeatureId, new Date().getFullYear());
  }, [selected, selectedFeatureId, plantInstancesVersion]);

  const bedPlantResults = useMemo(() => {
    const featureCat = selected?.feature.properties?.category ?? "";
    let list = allPlants;
    // Filter by placement compatibility if we have a selected feature
    if (featureCat) {
      list = list.filter((p) => canPlaceInCategory(p, featureCat));
    }
    if (bedPlantSearch.trim()) {
      const q = bedPlantSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.latinName?.toLowerCase().includes(q) ?? false),
      );
    }
    return list.slice(0, 25);
  }, [allPlants, bedPlantSearch, selected]);

  // ── Create-flow plant picker: driven by elementMode ──

  /** Map plant species category → map feature kind */
  const kindForPlantCategory = useCallback((cat: PlantCategory): GardenFeatureKind => {
    switch (cat) {
      case "tree": return "tree";
      case "bush": return "bush";
      case "flower": return "flower";
      default: return "plant";
    }
  }, []);

  /** Map elementMode → feature kind (for non-planter modes) */
  const kindForElementMode = useCallback((mode: string): GardenFeatureKind => {
    switch (mode) {
      case "el": return "electric";
      case "vand": return "water";
      case "lampe": return "lamp";
      default: return "plant";
    }
  }, []);

  /** Count plants per category for the filter pills */
  const plantCountByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: allPlants.length };
    for (const p of allPlants) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }, [allPlants]);

  const createPlantResults = useMemo(() => {
    let list = allPlants;
    // Apply user's category filter (if not "all")
    if (createPlantCategoryFilter !== "all") {
      list = list.filter((p) => p.category === createPlantCategoryFilter);
    }
    if (createPlantSearch.trim()) {
      const q = createPlantSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.latinName?.toLowerCase().includes(q) ?? false) ||
          p.id.includes(q),
      );
    }
    return list.slice(0, 30);
  }, [allPlants, createPlantCategoryFilter, createPlantSearch]);

  // Keep ref in sync for use in onCreated
  useEffect(() => {
    createSpeciesRef.current = {
      speciesId: createSelectedSpeciesId,
      varietyId: createSelectedVarietyId,
      varietyName: createSelectedVarietyName,
    };
  }, [createSelectedSpeciesId, createSelectedVarietyId, createSelectedVarietyName]);

  // Keep element ref in sync for use in onCreated
  useEffect(() => {
    createElementRef.current = createSelectedElementId;
  }, [createSelectedElementId]);

  const groupMemberCount = useMemo(() => {
    if (!selectedGroupId || !layoutForContainment?.features?.length) return 0;
    return layoutForContainment.features.filter(
      (f) => (f as GardenFeature).properties?.groupId === selectedGroupId
    ).length;
  }, [selectedGroupId, layoutForContainment]);

  // ── All groups derived from layout ──
  const allGroups = useMemo(() => {
    if (!layoutForContainment?.features?.length) return [] as { id: string; name: string; memberCount: number; members: { id: string; label: string }[] }[];
    const catOrder: Record<string, number> = { area: 0, container: 1, seedbed: 2, row: 3, element: 4, condition: 5 };
    const map = new Map<string, { count: number; members: { id: string; label: string; sortCat: number; sortLabel: string }[] }>();
    for (const f of layoutForContainment.features) {
      const gf = f as GardenFeature;
      const gid = gf.properties?.groupId;
      if (!gid) continue;
      const entry = map.get(gid) ?? { count: 0, members: [] };
      entry.count++;
      const name = (gf.properties?.name ?? "").trim();
      const kindLbl = kindLabel(gf.properties?.kind);
      const memberId = gf.properties?.gardenosId ?? "";
      const cat = (gf.properties?.category ?? "element") as string;
      entry.members.push({ id: memberId, label: name ? `${kindLbl}: ${name}` : kindLbl, sortCat: catOrder[cat] ?? 4, sortLabel: kindLbl.toLowerCase() });
      map.set(gid, entry);
    }
    const groups = Array.from(map.entries()).map(([id, { count, members }]) => {
      members.sort((a, b) => a.sortCat - b.sortCat || a.sortLabel.localeCompare(b.sortLabel, "da") || a.label.localeCompare(b.label, "da"));
      return {
        id,
        name: groupRegistry[id]?.name ?? `Gruppe (${id.slice(0, 6)})`,
        memberCount: count,
        members: members.slice(0, 8),
      };
    });
    groups.sort((a, b) => a.name.localeCompare(b.name, "da"));
    return groups;
  }, [layoutForContainment, groupRegistry]);

  // ── Group members for selected group ──
  const selectedGroupMembers = useMemo(() => {
    if (!selectedGroupId || !layoutForContainment?.features?.length) return [] as { id: string; label: string }[];
    const catOrder: Record<string, number> = { area: 0, container: 1, seedbed: 2, row: 3, element: 4, condition: 5 };
    const items = layoutForContainment.features
      .filter((f) => (f as GardenFeature).properties?.groupId === selectedGroupId)
      .map((f) => {
        const gf = f as GardenFeature;
        const name = (gf.properties?.name ?? "").trim();
        const kindLbl = kindLabel(gf.properties?.kind);
        const cat = (gf.properties?.category ?? "element") as string;
        return { id: gf.properties?.gardenosId ?? "", label: name ? `${kindLbl}: ${name}` : kindLbl, sortCat: catOrder[cat] ?? 4, sortLabel: kindLbl.toLowerCase() };
      });
    items.sort((a, b) => a.sortCat - b.sortCat || a.sortLabel.localeCompare(b.sortLabel, "da") || a.label.localeCompare(b.label, "da"));
    return items;
  }, [selectedGroupId, layoutForContainment]);

  const renameGroup = useCallback((gid: string, newName: string) => {
    // Update registry
    const nextReg = { ...groupRegistry, [gid]: { name: newName } };
    setGroupRegistry(nextReg);
    saveGroupRegistry(nextReg);

    // Update groupName on all members
    const group = featureGroupRef.current;
    if (!group) return;
    group.eachLayer((layer) => {
      const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
      const f = layerWithFeature.feature;
      if (f?.properties?.groupId === gid) {
        layerWithFeature.feature = {
          ...f,
          properties: { ...f.properties!, groupName: newName },
        };
      }
    });
    rebuildFromGroupAndUpdateSelection();
  }, [groupRegistry, rebuildFromGroupAndUpdateSelection]);

  const effectiveSelectedKind = useMemo(() => {
    if (!selected) return undefined;
    return selectedKind ?? defaultKindForGeometry(selected.feature.geometry);
  }, [selected, selectedKind]);

  const selectedKindDef = useMemo(() => {
    if (!effectiveSelectedKind) return undefined;
    return kindDefByKind.get(String(effectiveSelectedKind).toLowerCase());
  }, [effectiveSelectedKind, kindDefByKind]);

  const selectedIsInfra = (selectedKindDef?.subGroup ?? "default") === "infra" || selectedIsPolyline;

  const allowedKindDefsForSelected = useMemo(() => {
    if (!selected) return [] as KindDef[];
    const wantedGeometry: KindGeometry =
      selectedGeometry ?? (isPolygon(selected.feature) ? "polygon" : isPoint(selected.feature) ? "point" : "polyline");
    return allKindDefsIncludingHidden.filter((d) => d.geometry === wantedGeometry);
  }, [allKindDefsIncludingHidden, selected, selectedGeometry]);

  const createKindOptions = useMemo(() => {
    return allKindDefs
      .filter((d) => d.category === createPalette)
      .map((d) => ({ value: d.kind as GardenFeatureKind, label: d.label }));
  }, [allKindDefs, createPalette]);

  const addCustomKind = useCallback(() => {
    const label = newKindText.trim();
    if (!label) {
      setNewKindError("Skriv et navn for typen.");
      return;
    }

    const lower = label.toLowerCase();
    if (kindDefByKind.has(lower)) {
      setNewKindError("Typen findes allerede.");
      return;
    }

    const category: GardenFeatureCategory = createPalette;
    const subGroup: KindSubGroup =
      category === "element" ? "plant" : "default";
    // Default geometry based on category
    const geometry: KindGeometry =
      category === "element" ? "point" : "polygon";

    const next: KindDef = { kind: label, label, category, geometry, subGroup };

    const nextCustom = dedupeKindDefs([...customKindDefs, next]).filter((d) => !isKnownKind(d.kind));
    setCustomKindDefs(nextCustom);
    saveCustomKindDefsToStorage(nextCustom);

    setCreateKind(next.kind as GardenFeatureKind);
    createKindRef.current = next.kind as GardenFeatureKind;
    setNewKindText("");
    setNewKindError(null);
  }, [createPalette, customKindDefs, kindDefByKind, newKindText]);

  const removeKind = useCallback((kindToRemove: string) => {
    const lower = kindToRemove.toLowerCase();

    if (isKnownKind(kindToRemove)) {
      // Built-in kind → hide it
      const next = new Set(hiddenKinds);
      next.add(lower);
      setHiddenKinds(next);
      saveHiddenKinds(next);
    } else {
      // Custom kind → remove from custom list
      const nextCustom = customKindDefs.filter((d) => d.kind.toLowerCase() !== lower);
      setCustomKindDefs(nextCustom);
      saveCustomKindDefsToStorage(nextCustom);
    }

    // Reset selected create kind if it was the one we removed
    if (createKind.toLowerCase() === lower) {
      // Compute what remains visible
      const nextHidden = isKnownKind(kindToRemove) ? new Set([...hiddenKinds, lower]) : hiddenKinds;
      const nextCustom = isKnownKind(kindToRemove) ? customKindDefs : customKindDefs.filter((d) => d.kind.toLowerCase() !== lower);
      const remaining = dedupeKindDefs([...KNOWN_KIND_DEFS, ...nextCustom]).filter((d) => !nextHidden.has(d.kind.toLowerCase()));
      const fallback = remaining.find((d) => d.category === createPalette);
      if (fallback) {
        setCreateKind(fallback.kind as GardenFeatureKind);
        createKindRef.current = fallback.kind as GardenFeatureKind;
      }
    }
  }, [createKind, createPalette, customKindDefs, hiddenKinds]);

  // Can only remove if at least 1 other type remains in the same category
  const canRemoveCreateKind = useMemo(() => {
    const sameCategory = allKindDefs.filter((d) => d.category === createPalette);
    return sameCategory.length > 1;
  }, [allKindDefs, createPalette]);

  // Are there any hidden built-in kinds in the current palette?
  const hiddenInCurrentPalette = useMemo(() => {
    return KNOWN_KIND_DEFS.filter((d) => d.category === createPalette && hiddenKinds.has(d.kind.toLowerCase()));
  }, [createPalette, hiddenKinds]);

  const restoreHiddenKinds = useCallback((category: GardenFeatureCategory) => {
    const next = new Set(hiddenKinds);
    for (const d of KNOWN_KIND_DEFS) {
      if (d.category === category) next.delete(d.kind.toLowerCase());
    }
    setHiddenKinds(next);
    saveHiddenKinds(next);
  }, [hiddenKinds]);

  const selectedContainerAreaText = useMemo(() => {
    if (!selected || !selectedIsPolygon) return "";
    if (selectedCategory !== "container" && selectedCategory !== "area" && selectedCategory !== "condition") return "";
    const area = areaForPolygonFeature(selected.feature as Feature<Polygon, GardenFeatureProperties>);
    if (area == null) return "";
    return formatAreaSquareMeters(area);
  }, [selected, selectedCategory, selectedIsPolygon]);

  return (
    <div className="grid h-[calc(100vh-0px)] w-full grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[1fr_340px]">
      <div className="col-span-1 row-start-1 flex items-center justify-between gap-2 border-b border-border bg-toolbar-bg px-3 py-2 md:col-span-2 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 mr-1">
            <span className="text-lg leading-none">🌿</span>
            <span className="text-sm font-bold tracking-tight text-accent">GardenOS</span>
          </div>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                drawMode === "select" && !isEditing
                  ? "bg-accent text-white shadow-sm"
                  : "text-foreground/70 hover:bg-foreground/5"
              }`}
              onClick={enterSelectMode}
              title="Afbryd tegning/redigering (Esc)"
            >
              ◎ Markér
            </button>
            <button
              type="button"
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                isEditing
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-foreground/70 hover:bg-foreground/5"
              }`}
              onClick={toggleEditMode}
              disabled={!selected}
              title={
                isEditing
                  ? "Stop redigering og gem"
                  : "Redigér form og flyt (vælg først en figur på kortet)"
              }
            >
              ✏️ {isEditing ? "Færdig" : "Redigér"}
            </button>
          </div>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-xs text-foreground/60 hover:bg-foreground/5 transition-colors disabled:opacity-40"
              onClick={undo}
              disabled={undoStack.length === 0}
              title="Fortryd (Cmd/Ctrl+Z)"
            >
              ↩ Fortryd
            </button>
            {multiSelectedIds.size >= 2 ? (
              <button
                type="button"
                className="rounded-md bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                onClick={groupMultiSelected}
                title="Bind de valgte elementer sammen i en gruppe"
              >
                ⊞ Gruppér ({multiSelectedIds.size})
              </button>
            ) : null}
            {selectedGroupId ? (
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-xs text-foreground/60 hover:bg-foreground/5 transition-colors"
                onClick={ungroupSelected}
                title="Opløs gruppen for det valgte element"
              >
                ⊟ Opløs
              </button>
            ) : null}
          </div>
        </div>
        <div className="text-[11px] text-muted font-medium">
          {multiSelectedIds.size > 0
            ? `${multiSelectedIds.size} valgt — Shift+klik for flere`
            : drawMode === "select"
            ? "◎ Markér"
            : "✎ Tegner…"}
        </div>
      </div>
      <style>{`
        .leaflet-container { height: 100%; width: 100%; }
        /* We use our own UI controls; hide Leaflet.draw's toolbar to avoid mode confusion. */
        .leaflet-draw { display: none; }
        .gardenos-marker {
          border-radius: 9999px;
          background: var(--foreground);
          border: 2px solid var(--background);
          box-sizing: border-box;
        }

        /* Type differentiation (no new colors). */
        .gardenos-marker--tree {
          border-radius: 9999px;
        }
        .gardenos-marker--bush {
          border-radius: 9999px;
          border-width: 3px;
        }
        .gardenos-marker--flower {
          border-radius: 9999px;
          border-width: 3px;
          background: transparent;
        }
        .gardenos-marker--plant {
          border-radius: 9999px;
        }
        .gardenos-marker--lamp {
          border-radius: 2px;
          background: var(--foreground);
        }
        .gardenos-marker--pot {
          border-radius: 4px;
          background: transparent;
          border-color: var(--foreground);
        }

        .gardenos-marker--selected {
          border-width: 3px;
        }

        .gardenos-marker--group {
          background: #f59e0b;
          border-color: #fff;
          border-width: 4px;
          box-shadow: 0 0 12px 4px rgba(245, 158, 11, 0.7), 0 0 24px 8px rgba(245, 158, 11, 0.3);
          animation: gardenos-group-pulse 1.2s ease-in-out infinite;
          transform: scale(1.25);
          z-index: 1000 !important;
        }

        @keyframes gardenos-group-pulse {
          0%, 100% { box-shadow: 0 0 12px 4px rgba(245, 158, 11, 0.7), 0 0 24px 8px rgba(245, 158, 11, 0.3); transform: scale(1.25); }
          50% { box-shadow: 0 0 18px 6px rgba(245, 158, 11, 0.95), 0 0 32px 12px rgba(245, 158, 11, 0.4); transform: scale(1.35); }
        }

        /* Emoji icon markers */
        .gardenos-emoji-marker {
          background: transparent !important;
          border: none !important;
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
        }
        .gardenos-emoji-marker--selected {
          outline: 2px solid var(--accent, #3b82f6);
          outline-offset: 1px;
          border-radius: 6px;
        }
        .gardenos-emoji-marker--group {
          outline: 4px solid #f59e0b !important;
          outline-offset: 2px;
          border-radius: 6px;
          box-shadow: 0 0 12px 4px rgba(245, 158, 11, 0.6);
          animation: gardenos-emoji-group-pulse 1.2s ease-in-out infinite;
          z-index: 1000 !important;
        }
        @keyframes gardenos-emoji-group-pulse {
          0%, 100% { outline-width: 4px; box-shadow: 0 0 12px 4px rgba(245, 158, 11, 0.6); }
          50% { outline-width: 5px; box-shadow: 0 0 18px 6px rgba(245, 158, 11, 0.9); }
        }

        /* Group card in sidebar */
        .gardenos-group-card {
          transition: all 0.2s ease;
        }
        .gardenos-group-card--active {
          border: 3px solid #f59e0b;
          background: rgba(245, 158, 11, 0.08);
          box-shadow: 0 0 8px 1px rgba(245, 158, 11, 0.25), 0 2px 8px rgba(0,0,0,0.08);
        }
        .gardenos-group-card:not(.gardenos-group-card--active):hover {
          border-color: rgba(245, 158, 11, 0.4);
        }

        .leaflet-tooltip.gardenos-tooltip {
          background: var(--background);
          color: var(--foreground);
          border: 1px solid var(--foreground);
          padding: 4px 6px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.2;
        }

        .leaflet-tooltip.gardenos-tooltip:before {
          border-top-color: var(--foreground);
        }

        .gardenos-edge-label {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .gardenos-edge-label span {
          display: inline-block;
          background: rgba(255, 255, 255, 0.92);
          color: #1e293b;
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
          padding: 2px 5px;
          border-radius: 4px;
          border: 1px solid #94a3b8;
          white-space: nowrap;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .gardenos-area-label {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .gardenos-area-label span {
          display: inline-block;
          background: rgba(255, 255, 255, 0.92);
          color: #1e293b;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          padding: 3px 6px;
          border-radius: 4px;
          border: 1.5px solid #475569;
          white-space: nowrap;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
      `}</style>

      <div className="relative row-start-2">
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          maxZoom={22}
          zoomSnap={0.25}
          zoomDelta={0.25}
          className="absolute inset-0"
          renderer={L.svg({ tolerance: 12 })}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxNativeZoom={19}
            maxZoom={22}
          />
          {showSatellite ? (
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={19}
              maxZoom={22}
              opacity={0.85}
            />
          ) : null}

          {showMatrikel && dfReady ? (
            <WMSTileLayer
              key={`matrikel-${dfUser}`}
              url={`https://services.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWMS/1.0.0/WMS?username=${encodeURIComponent(dfUser)}&password=${encodeURIComponent(dfPass)}&ignoreillegallayers=TRUE`}
              layers="Jordstykke_Gaeldende,MatrikelSkel_Gaeldende,Centroide_Gaeldende"
              styles="Jordstykke_Gaeldende_transparent,Roede_skel,Sorte_centroider"
              transparent={"TRUE" as unknown as boolean}
              format="image/png"
              maxZoom={22}
              opacity={0.75}
              version="1.1.1"
            />
          ) : null}

          {showJordart ? (
            <WMSTileLayer
              key="jordart"
              url="https://data.geus.dk/arcgis/services/Denmark/Jordartskort_25000/MapServer/WMSServer"
              layers="Jordartskort"
              styles="default"
              transparent={true}
              format="image/png"
              maxZoom={22}
              opacity={0.55}
              version="1.1.1"
            />
          ) : null}

          {showTerrain ? (
            <WMSTileLayer
              key="terrain"
              url="https://data.geus.dk/arcgis/services/Denmark/DHM_2007_hillshading/MapServer/WMSServer"
              layers="DHM_hillshading"
              styles="default"
              transparent={true}
              format="image/png"
              maxZoom={22}
              opacity={0.45}
              version="1.1.1"
            />
          ) : null}

          <MapDrawControls
            featureGroupRef={featureGroupRef}
            mapRef={mapRef}
            persistView={persistView}
            loadSavedLayers={loadSavedLayers}
            attachClickHandler={attachClickHandler}
            rebuildFromGroupAndUpdateSelection={rebuildFromGroupAndUpdateSelection}
            setSelected={setSelectedAndFocus}
            pushUndoSnapshot={pushUndoSnapshot}
            createKindRef={createKindRef}
            createSpeciesRef={createSpeciesRef}
            createElementRef={createElementRef}
            bumpPlantInstances={() => setPlantInstancesVersion((v) => v + 1)}
          />

          <BoxSelectOverlay
            featureGroupRef={featureGroupRef}
            setMultiSelectedIds={setMultiSelectedIds}
          />
        </MapContainer>

        {/* ── Address Search Overlay ── */}
        <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1" style={{ maxWidth: "320px" }}>
          {showAddressSearch ? (
            <div className="rounded-xl border border-border bg-white shadow-lg">
              <div className="flex items-center gap-1 px-3 py-2">
                <span className="text-sm">🔍</span>
                <input
                  type="text"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/40"
                  placeholder="Søg adresse..."
                  value={addressQuery}
                  onChange={(e) => setAddressQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") searchAddress(addressQuery); if (e.key === "Escape") { setShowAddressSearch(false); setAddressResults([]); } }}
                  autoFocus
                />
                <button type="button" className="text-foreground/40 hover:text-foreground/70 text-xs px-1" onClick={() => { setShowAddressSearch(false); setAddressResults([]); setAddressQuery(""); }}>✕</button>
              </div>
              {addressSearching ? <div className="px-3 py-2 text-xs text-foreground/50">Søger…</div> : null}
              {addressResults.length > 0 ? (
                <div className="border-t border-border">
                  {addressResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-accent/10 transition-colors border-b border-border/50 last:border-b-0"
                      onClick={() => goToLocation(parseFloat(r.lat), parseFloat(r.lon))}
                    >
                      📍 {r.display_name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="rounded-xl border border-border bg-white shadow-md px-3 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
              onClick={() => setShowAddressSearch(true)}
            >
              🔍 Søg adresse
            </button>
          )}

          {/* Quick bookmark buttons on map */}
          {bookmarks.length > 0 ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {bookmarks.map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  className="rounded-lg border border-border bg-white/95 shadow-sm px-2 py-1 text-xs hover:bg-accent/10 transition-colors"
                  onClick={() => goToLocation(bm.center[0], bm.center[1], bm.zoom)}
                  title={`${bm.name} (zoom ${bm.zoom})`}
                >
                  {bm.emoji || "📍"} {bm.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {!isReady ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-sm text-foreground/80">Indlæser kort…</div>
          </div>
        ) : null}
      </div>

      <aside className="row-start-2 flex flex-col border-t border-border bg-sidebar-bg md:border-l md:border-t-0 overflow-hidden">
        <div className="px-4 pt-3 pb-1">
          <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm">
            <button
              type="button"
              className={`flex-1 rounded-md px-1 py-1.5 text-[11px] font-medium transition-all ${
                sidebarTab === "create"
                  ? "bg-accent text-white shadow-sm"
                  : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
              }`}
              onClick={() => { setSidebarTab("create"); setHighlightedGroupId(null); }}
            >
              ＋ Opret
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-1 py-1.5 text-[11px] font-medium transition-all ${
                sidebarTab === "content"
                  ? "bg-accent text-white shadow-sm"
                  : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
              } ${selected ? "" : "opacity-40"}`}
              onClick={() => { setSidebarTab("content"); setHighlightedGroupId(null); }}
              disabled={!selected}
              title={selected ? "" : "Vælg noget på kortet for at se indhold"}
            >
              ◉ Indhold
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-1 py-1.5 text-[11px] font-medium transition-all ${
                sidebarTab === "groups"
                  ? "bg-accent text-white shadow-sm"
                  : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
              }`}
              onClick={() => setSidebarTab("groups")}
            >
              ⊞ Grupper{allGroups.length > 0 ? ` ${allGroups.length}` : ""}
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-1 py-1.5 text-[11px] font-medium transition-all ${
                sidebarTab === "plants"
                  ? "bg-accent text-white shadow-sm"
                  : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
              }`}
              onClick={() => { setSidebarTab("plants"); setHighlightedGroupId(null); }}
            >
              🌱 Planter
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-1 py-1.5 text-[11px] font-medium transition-all ${
                sidebarTab === "view"
                  ? "bg-accent text-white shadow-sm"
                  : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
              }`}
              onClick={() => { setSidebarTab("view"); setHighlightedGroupId(null); }}
            >
              👁 Visning
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto sidebar-scroll px-4 pb-4">

        {sidebarTab === "create" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Kategori</label>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {(["element", "row", "seedbed", "container", "area", "condition"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`rounded-lg border px-2 py-2 text-xs transition-all ${
                      createPalette === cat
                        ? "border-accent/40 bg-accent-light text-accent-dark font-semibold shadow-sm"
                        : "border-border bg-background hover:bg-foreground/5 text-foreground/70"
                    }`}
                    onClick={() => {
                      setCreatePalette(cat);
                      const next = defaultCreateKindForPalette[cat] as GardenFeatureKind;
                      setCreateKind(next);
                      createKindRef.current = next;
                      setNewKindError(null);
                      // Reset plant picker & element mode
                      setElementMode("planter");
                      setCreateSelectedSpeciesId(null);
                      setCreateSelectedVarietyId(null);
                      setCreateSelectedVarietyName(null);
                      setCreateSelectedElementId(null);
                      setCreatePlantSearch("");
                      setCreatePlantCategoryFilter("all");
                    }}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-foreground/50">{CATEGORY_DESCRIPTIONS[createPalette]}</p>
            </div>

            {/* ════════════════════════════════════════════════════════════════
                ELEMENT: new flow — Type buttons (Planter/El/Vand/Lampe) +
                integrated plant picker
               ════════════════════════════════════════════════════════════════ */}
            {createPalette === "element" ? (
              <>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Type</label>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {([
                      { mode: "planter" as const, label: "🌱 Planter", desc: "Vælg fra plantearkivet" },
                      { mode: "el" as const, label: "⚡ El / Ledning", desc: "Tegn el-ledning" },
                      { mode: "vand" as const, label: "💧 Vand / Rør", desc: "Tegn vandledning" },
                      { mode: "lampe" as const, label: "💡 Lampe", desc: "Placér lampe" },
                    ]).map((opt) => (
                      <button
                        key={opt.mode}
                        type="button"
                        className={`rounded-lg border px-3 py-2 text-xs text-left transition-all ${
                          elementMode === opt.mode
                            ? "border-accent/40 bg-accent-light text-accent-dark font-semibold shadow-sm"
                            : "border-border bg-background hover:bg-foreground/5 text-foreground/70"
                        }`}
                        onClick={() => {
                          setElementMode(opt.mode);
                          // Reset plant selection when switching mode
                          setCreateSelectedSpeciesId(null);
                          setCreateSelectedVarietyId(null);
                          setCreateSelectedVarietyName(null);
                          setCreatePlantSearch("");
                          setCreatePlantCategoryFilter("all");
                          // Reset element selection
                          setCreateSelectedElementId(null);
                          // Set kind immediately for non-plant modes
                          if (opt.mode !== "planter") {
                            const k = kindForElementMode(opt.mode);
                            setCreateKind(k);
                            createKindRef.current = k;
                          } else {
                            setCreateKind("plant" as GardenFeatureKind);
                            createKindRef.current = "plant" as GardenFeatureKind;
                          }
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Planter mode: category pills + search + plant list ── */}
                {elementMode === "planter" ? (
                  <div className="col-span-2 space-y-2">
                    {createSelectedSpeciesId ? (() => {
                      const pickedSpecies = getPlantById(createSelectedSpeciesId);
                      const varieties = getVarietiesForSpecies(createSelectedSpeciesId);
                      return (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent-light/30 px-2.5 py-2">
                            <span className="text-lg leading-none">{pickedSpecies?.icon ?? "🌱"}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{pickedSpecies?.name ?? createSelectedSpeciesId}</p>
                              {pickedSpecies?.latinName ? (
                                <p className="text-[10px] text-foreground/40 italic truncate">{pickedSpecies.latinName}</p>
                              ) : null}
                              {pickedSpecies ? (
                                <p className="text-[10px] text-foreground/50">
                                  {PLANT_CATEGORY_LABELS[pickedSpecies.category]}
                                  {pickedSpecies.light ? ` · ${LIGHT_LABELS[pickedSpecies.light]}` : ""}
                                </p>
                              ) : null}
                              {createSelectedVarietyName ? (
                                <p className="text-[10px] text-accent font-medium">Sort: {createSelectedVarietyName}</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded px-1.5 py-0.5 text-xs text-foreground/40 hover:bg-red-50 hover:text-red-500"
                              onClick={() => {
                                setCreateSelectedSpeciesId(null);
                                setCreateSelectedVarietyId(null);
                                setCreateSelectedVarietyName(null);
                              }}
                              title="Vælg en anden"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Variety picker */}
                          {varieties.length > 0 ? (
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-medium text-foreground/50">Vælg sort:</p>
                              <div className="max-h-36 overflow-y-auto space-y-0.5">
                                <button
                                  type="button"
                                  className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] hover:bg-foreground/5 ${
                                    !createSelectedVarietyId ? "bg-accent/10 font-medium text-accent" : "text-foreground/70"
                                  }`}
                                  onClick={() => {
                                    setCreateSelectedVarietyId(null);
                                    setCreateSelectedVarietyName(null);
                                  }}
                                >
                                  <span className="text-sm leading-none">🌱</span>
                                  <span className="truncate">{pickedSpecies?.name} (uspecificeret sort)</span>
                                  {!createSelectedVarietyId ? <span className="ml-auto text-[9px]">✓</span> : null}
                                </button>
                                {varieties.map((v) => (
                                  <button
                                    key={v.id}
                                    type="button"
                                    className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] hover:bg-foreground/5 ${
                                      createSelectedVarietyId === v.id ? "bg-accent/10 font-medium text-accent" : "text-foreground/70"
                                    }`}
                                    onClick={() => {
                                      setCreateSelectedVarietyId(v.id);
                                      setCreateSelectedVarietyName(v.name);
                                    }}
                                  >
                                    <span className="text-sm leading-none">🏷️</span>
                                    <span className="truncate">{v.name}</span>
                                    {v.taste ? <span className="text-[9px] text-foreground/40 ml-auto mr-1">{v.taste}</span> : null}
                                    {createSelectedVarietyId === v.id ? <span className="text-[9px]">✓</span> : null}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })() : (
                      <div className="space-y-2">
                        {/* Plant category filter pills with counts */}
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                              createPlantCategoryFilter === "all"
                                ? "bg-accent text-white shadow-sm"
                                : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"
                            }`}
                            onClick={() => setCreatePlantCategoryFilter("all")}
                          >
                            Alle ({plantCountByCategory["all"] ?? 0})
                          </button>
                          {(Object.keys(PLANT_CATEGORY_LABELS) as PlantCategory[]).map((cat) => {
                            const count = plantCountByCategory[cat] ?? 0;
                            if (count === 0) return null;
                            return (
                              <button
                                key={cat}
                                type="button"
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                                  createPlantCategoryFilter === cat
                                    ? "bg-accent text-white shadow-sm"
                                    : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"
                                }`}
                                onClick={() => setCreatePlantCategoryFilter(cat)}
                              >
                                {PLANT_CATEGORY_LABELS[cat]} ({count})
                              </button>
                            );
                          })}
                        </div>

                        {/* Search */}
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                          placeholder="Søg plante…"
                          value={createPlantSearch}
                          onChange={(e) => setCreatePlantSearch(e.target.value)}
                        />

                        {/* Plant results */}
                        <div className="max-h-48 space-y-0.5 overflow-y-auto">
                          {createPlantResults.map((plant) => (
                            <button
                              key={plant.id}
                              type="button"
                              className="flex w-full items-center gap-1.5 rounded border border-transparent px-2 py-1.5 text-left text-xs hover:border-foreground/15 hover:bg-foreground/5"
                              onClick={() => {
                                setCreateSelectedSpeciesId(plant.id);
                                setCreateSelectedVarietyId(null);
                                setCreateSelectedVarietyName(null);
                                setCreatePlantSearch("");
                              }}
                            >
                              <span className="text-sm leading-none">{plant.icon ?? "🌱"}</span>
                              <span className="truncate font-medium">{plant.name}</span>
                              <span className="ml-auto flex items-center gap-1 text-[10px] text-foreground/40">
                                {plant.latinName ? <span className="italic truncate max-w-[80px]">{plant.latinName}</span> : null}
                                {plant.varieties?.length ? <span className="whitespace-nowrap">{plant.varieties.length} sorter</span> : null}
                              </span>
                            </button>
                          ))}
                          {createPlantResults.length === 0 ? (
                            <p className="px-2 py-2 text-xs text-foreground/50 italic text-center">Ingen planter fundet.</p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── El / Vand / Lampe mode: element type picker ── */
                  <div className="col-span-2 space-y-2">
                    {createSelectedElementId ? (() => {
                      const pickedEl = getInfraElementById(createSelectedElementId);
                      if (!pickedEl) return null;
                      return (
                        <div className="flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent-light/30 px-2.5 py-2">
                          <span className="text-lg leading-none">{pickedEl.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{pickedEl.name}</p>
                            <p className="text-[10px] text-foreground/50">{pickedEl.description}</p>
                            <p className="text-[10px] text-foreground/40">
                              {pickedEl.geometry === "polyline" ? "✎ Tegnes som streg" : "📍 Placeres som markør"}
                            </p>
                            {pickedEl.tips ? <p className="text-[10px] text-foreground/40 italic">{pickedEl.tips}</p> : null}
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-foreground/40 hover:bg-red-50 hover:text-red-500"
                            onClick={() => setCreateSelectedElementId(null)}
                            title="Vælg en anden"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })() : (
                      <div className="space-y-1">
                        <p className="text-[10px] font-medium text-foreground/50">
                          {ELEMENT_MODE_ICONS[elementMode as ElementModeKey]} Vælg {ELEMENT_MODE_LABELS[elementMode as ElementModeKey]}:
                        </p>
                        <div className="max-h-52 space-y-0.5 overflow-y-auto">
                          {getInfraElementsForMode(elementMode as ElementModeKey).map((el) => (
                            <button
                              key={el.id}
                              type="button"
                              className="flex w-full items-center gap-2 rounded border border-transparent px-2 py-1.5 text-left text-xs hover:border-foreground/15 hover:bg-foreground/5 transition-colors"
                              onClick={() => {
                                setCreateSelectedElementId(el.id);
                                // Auto-set the kind
                                const k = el.featureKind as GardenFeatureKind;
                                setCreateKind(k);
                                createKindRef.current = k;
                              }}
                            >
                              <span className="text-base leading-none">{el.icon}</span>
                              <div className="flex-1 min-w-0">
                                <span className="font-medium block truncate">{el.name}</span>
                                <span className="text-[10px] text-foreground/40 block truncate">{el.description}</span>
                              </div>
                              <span className="shrink-0 text-[9px] text-foreground/30 rounded bg-foreground/5 px-1 py-0.5">
                                {el.geometry === "polyline" ? "✎ streg" : "📍 punkt"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* ════════════════════════════════════════════════════════════════
                 NON-ELEMENT categories: existing TYPE dropdown + Ny type
                 ════════════════════════════════════════════════════════════════ */
              <>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Type</label>
                  <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                    <select
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                      value={createKind}
                      onChange={(e) => {
                        const next = e.target.value as GardenFeatureKind;
                        setCreateKind(next);
                        createKindRef.current = next;
                        setNewKindError(null);
                      }}
                    >
                      {createKindOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {canRemoveCreateKind ? (
                      <button
                        type="button"
                        className="rounded-md border border-foreground/20 bg-background px-2 py-2 text-xs text-foreground/60 hover:border-red-300 hover:text-red-600 hover:bg-red-50"
                        onClick={() => removeKind(createKind)}
                        title="Fjern denne type fra listen"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                  {hiddenInCurrentPalette.length > 0 ? (
                    <button
                      type="button"
                      className="mt-1 text-[10px] text-foreground/40 hover:text-foreground/70 hover:underline"
                      onClick={() => restoreHiddenKinds(createPalette)}
                    >
                      Gendan {hiddenInCurrentPalette.length} skjulte standardtype{hiddenInCurrentPalette.length > 1 ? "r" : ""}
                    </button>
                  ) : null}
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Ny type</label>
                  <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                    <input
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                      value={newKindText}
                      onChange={(e) => setNewKindText(e.target.value)}
                      placeholder={
                        createPalette === "container" ? "Fx Pottebænk"
                        : createPalette === "area" ? "Fx Frugtplantage"
                        : "Fx Halvskygge"
                      }
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 transition-colors shadow-sm"
                      onClick={addCustomKind}
                    >
                      Tilføj
                    </button>
                  </div>
                  {newKindError ? <p className="mt-1 text-xs text-foreground/70">{newKindError}</p> : null}
                </div>
              </>
            )}

            <button
              type="button"
              className="col-span-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-dark transition-colors"
              onClick={beginDrawSelectedType}
            >
              {createPalette === "element"
                ? elementMode === "planter"
                  ? createSelectedSpeciesId
                    ? `✚ Placér ${getPlantById(createSelectedSpeciesId)?.icon ?? "🌱"} ${getPlantById(createSelectedSpeciesId)?.name ?? ""}`
                    : "✚ Placér plante"
                  : (() => {
                      const selEl = createSelectedElementId ? getInfraElementById(createSelectedElementId) : null;
                      if (selEl) {
                        return selEl.geometry === "polyline"
                          ? `✎ Tegn ${selEl.icon} ${selEl.name}`
                          : `✚ Placér ${selEl.icon} ${selEl.name}`;
                      }
                      return elementMode === "el" ? "⚡ Vælg el-type først"
                        : elementMode === "vand" ? "💧 Vælg vandtype først"
                        : "💡 Vælg lampetype først";
                    })()
                : "✎ Tegn område"}
            </button>
            <button
              type="button"
              className="col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground/60 hover:bg-foreground/5 transition-colors disabled:opacity-40"
              onClick={enterSelectMode}
              disabled={drawMode === "select"}
              title="Tryk også Esc"
            >
              ◎ Markér/pege
            </button>
          </div>
        ) : null}

        {sidebarTab === "content" ? (
          !selected ? (
            <p className="mt-4 text-sm text-muted text-center">
              Vælg noget på kortet for at se og redigere indhold.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                {CATEGORY_LABELS[selectedCategory as GardenFeatureCategory] ?? "—"}
              </p>
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Type</label>
              {selectedCategory === "element" ? (
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {([
                    { mode: "planter" as const, label: "🌱 Planter", kinds: ["tree", "bush", "flower", "plant"] },
                    { mode: "el" as const, label: "⚡ El / Ledning", kinds: ["electric", "electric-cable", "electric-lv", "electric-outlet", "electric-junction", "electric-panel", "electric-solar"] },
                    { mode: "vand" as const, label: "💧 Vand / Rør", kinds: ["water", "water-pipe", "water-hose", "water-drip", "water-tap", "water-sprinkler", "water-timer", "water-barrel"] },
                    { mode: "lampe" as const, label: "💡 Lampe", kinds: ["lamp", "lamp-garden", "lamp-spot", "lamp-led-string", "lamp-wall", "lamp-solar", "lamp-path", "lamp-battery", "lamp-flood"] },
                  ]).map((opt) => {
                    const currentKind = String(selectedKind ?? "plant").toLowerCase();
                    const isActive = opt.kinds.includes(currentKind);
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        className={`rounded-lg border px-3 py-2 text-xs text-left transition-all ${
                          isActive
                            ? "border-accent/40 bg-accent-light text-accent-dark font-semibold shadow-sm"
                            : "border-border bg-background hover:bg-foreground/5 text-foreground/70"
                        }`}
                        onClick={() => {
                          const defaultKind = kindForElementMode(opt.mode);
                          updateSelectedProperty({
                            kind: defaultKind,
                            category: "element",
                            // Clear plant link when switching to infra, clear infra link when switching to plant
                            ...(opt.mode === "planter"
                              ? { elementTypeId: "" }
                              : { speciesId: "", varietyId: "", varietyName: "" }),
                          });
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <select
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
                  value={selectedKind ?? defaultKindForGeometry(selected.feature.geometry)}
                  onChange={(e) => {
                    const nextKind = e.target.value as GardenFeatureKind;
                    updateSelectedProperty({ kind: nextKind, category: categoryForKind(nextKind, selected.feature.geometry) });
                  }}
                >
                  {allowedKindDefsForSelected.map((def) => (
                    <option key={def.kind} value={def.kind}>
                      {def.label} ({CATEGORY_LABELS[def.category]})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Navn</label>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
                value={selected.feature.properties?.name ?? ""}
                onChange={(e) => updateSelectedProperty({ name: e.target.value })}
                placeholder="Fx Køkkenbed 1 / Æbletræ"
              />
            </div>

            {/* ── Ikon-vælger (only for point markers) ── */}
            {selectedIsPoint ? (() => {
              // Count how many features of the same kind exist (for "set as default" confirmation)
              const sameKindCount = selectedKind ? (() => {
                let count = 0;
                featureGroupRef.current?.eachLayer((layer) => {
                  const lf = (layer as L.Layer & { feature?: GardenFeature }).feature;
                  if (lf?.properties?.kind === selectedKind && layer instanceof L.Marker) count++;
                });
                return count;
              })() : 0;

              return (
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Kort-ikon</label>
                  <div className="mt-1">
                    <IconPicker
                      value={selected.feature.properties?.customIcon ?? ""}
                      onChange={(emoji) => {
                        updateSelectedProperty({ customIcon: emoji });
                      }}
                      kindLabel={selectedKindDef?.label}
                      kindCount={sameKindCount}
                      onSetKindDefault={selectedKind ? (emoji) => {
                        pushUndoSnapshot();

                        // 1. Save as kind-level default for future elements
                        setKindDefaultIcon(selectedKind!, emoji);

                        // 2. Update ALL existing features of this kind
                        const group = featureGroupRef.current;
                        if (group) {
                          group.eachLayer((layer) => {
                            const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
                            const lf = layerWithFeature.feature;
                            if (lf?.properties?.kind === selectedKind && layer instanceof L.Marker) {
                              lf.properties.customIcon = emoji;
                            }
                          });
                        }

                        // 3. Update the currently selected feature's state
                        if (selected.feature.properties?.kind === selectedKind) {
                          setSelected({
                            gardenosId: selected.gardenosId,
                            feature: ensureDefaultProperties({
                              ...selected.feature,
                              properties: { ...selected.feature.properties, customIcon: emoji },
                            }),
                          });
                        }

                        // 4. Refresh all visuals
                        rebuildFromGroupAndUpdateSelection();
                      } : undefined}
                    />
                  </div>
                </div>
              );
            })() : null}

            {selectedContainerAreaText ? (
              <div>
                <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Areal</label>
                <div className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm">
                  {selectedContainerAreaText}
                </div>
              </div>
            ) : null}

            {selectedIsPolygon && (selectedCategory === "container" || selectedCategory === "area") ? (
              <div>
                <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Indeholder</label>
                <div className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm">
                  {selectedContainment && selectedContainment.total > 0
                    ? `${selectedContainment.elements} elem., ${selectedContainment.containers} cont., ${selectedContainment.areas} omr., ${selectedContainment.infra} infra`
                    : "Ingen (endnu)"}
                </div>

                {selectedContainment && selectedContainment.total > 0 ? (
                  <div className="mt-2 space-y-1">
                    {selectedContainedItemsPreview.slice(0, 12).map((item) => (
                      <div key={item.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          className="flex-1 cursor-pointer text-left text-xs text-foreground/70 hover:text-foreground hover:underline"
                          onClick={() => selectFeatureById(item.id)}
                          title="Gå til element i Indholdsfanen"
                        >
                          • {item.text}
                        </button>
                        <button
                          type="button"
                          className="shrink-0 rounded px-1 text-xs text-foreground/40 hover:bg-red-50 hover:text-red-500"
                          onClick={() => deleteFeatureById(item.id)}
                          title="Slet element"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {selectedContainedItemsPreview.length > 12 ? (
                      <div className="text-xs text-foreground/60">
                        … +{selectedContainedItemsPreview.length - 12} flere
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}



            {/* ── Linked infra element type display ── */}
            {selectedCategory === "element" && selectedIsInfra && selected.feature.properties?.elementTypeId ? (() => {
              const linkedEl = getInfraElementById(selected.feature.properties.elementTypeId);
              return linkedEl ? (
                <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-2.5">
                  <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide mb-1.5">Koblet elementtype</label>
                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">{linkedEl.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{linkedEl.name}</p>
                      <p className="text-[10px] text-foreground/40">{linkedEl.description}</p>
                      <p className="text-[10px] text-foreground/40 mt-0.5">
                        {ELEMENT_MODE_ICONS[linkedEl.mode]} {ELEMENT_MODE_LABELS[linkedEl.mode]}
                        {" · "}
                        {linkedEl.geometry === "polyline" ? "Streg" : "Punkt"}
                      </p>
                      {linkedEl.tips ? <p className="text-[10px] text-foreground/30 italic mt-0.5">{linkedEl.tips}</p> : null}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-foreground/40 hover:bg-red-50 hover:text-red-500"
                      onClick={() => updateSelectedProperty({ elementTypeId: "" })}
                      title="Fjern kobling"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : null;
            })() : null}

            {/* ── Element (plant) fields ── */}
            {selectedCategory === "element" && !selectedIsInfra ? (
              <>
                {/* Linked species display — rich expandable panel */}
                {selected.feature.properties?.speciesId ? (() => {
                  const linkedSpecies = getPlantById(selected.feature.properties.speciesId);
                  if (!linkedSpecies) return null;
                  const varieties = getVarietiesForSpecies(linkedSpecies.id);
                  const currentVarietyId = selected.feature.properties.varietyId ?? "";
                  const currentVariety = currentVarietyId ? varieties.find((v) => v.id === currentVarietyId) : undefined;
                  return (
                    <div className="rounded-lg border border-accent/20 bg-accent-light/20 overflow-hidden">
                      {/* ── Header row ── */}
                      <div className="flex items-center gap-2 p-2.5">
                        <span className="text-xl leading-none">{linkedSpecies.icon ?? "🌱"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{linkedSpecies.name}</p>
                          {linkedSpecies.latinName ? (
                            <p className="text-[10px] text-foreground/40 italic">{linkedSpecies.latinName}</p>
                          ) : null}
                          <p className="text-[10px] text-foreground/40 mt-0.5">
                            {PLANT_CATEGORY_LABELS[linkedSpecies.category]}
                            {linkedSpecies.light ? ` · ${LIGHT_LABELS[linkedSpecies.light]}` : ""}
                            {linkedSpecies.water ? ` · Vand: ${WATER_LABELS[linkedSpecies.water]}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col gap-0.5">
                          <button
                            type="button"
                            className="rounded px-1.5 py-0.5 text-[10px] text-foreground/50 hover:bg-foreground/5 hover:text-foreground"
                            onClick={() => {
                              setEditPlantSpeciesId(linkedSpecies.id);
                              setShowPlantEditor(true);
                            }}
                            title="Redigér plantedata"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="rounded px-1.5 py-0.5 text-[10px] text-foreground/40 hover:bg-red-50 hover:text-red-500"
                            onClick={() => updateSelectedProperty({ speciesId: "", varietyId: "", varietyName: "" })}
                            title="Fjern kobling"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* ── Sort (variety) display + switcher ── */}
                      {varieties.length > 0 ? (
                        <div className="border-t border-accent/10 px-2.5 py-2">
                          <button
                            type="button"
                            className="flex w-full items-center gap-1.5 text-left"
                            onClick={() => setContentVarietyPickerOpen(!contentVarietyPickerOpen)}
                          >
                            <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Sort</span>
                            <span className="flex-1 text-xs font-medium text-accent truncate">
                              {currentVariety ? currentVariety.name : "Uspecificeret"}
                            </span>
                            <span className="text-[10px] text-foreground/30">{contentVarietyPickerOpen ? "▲" : "▼"}</span>
                          </button>

                          {contentVarietyPickerOpen ? (
                            <div className="mt-2 space-y-1 max-h-52 overflow-y-auto">
                              {/* Unspecified option */}
                              <button
                                type="button"
                                className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] transition-colors ${!currentVarietyId ? "bg-accent/10 font-semibold text-accent" : "text-foreground/70 hover:bg-foreground/5"}`}
                                onClick={() => {
                                  updateSelectedProperty({ varietyId: "", varietyName: "", planted: linkedSpecies.name });
                                  setContentVarietyPickerOpen(false);
                                }}
                              >
                                <span className="text-sm leading-none">🌱</span>
                                <span className="flex-1 truncate">{linkedSpecies.name} (uspecificeret sort)</span>
                                {!currentVarietyId ? <span className="text-[9px]">✓</span> : null}
                              </button>

                              {varieties.map((v) => (
                                <div key={v.id} className="rounded border border-transparent hover:border-foreground/10">
                                  <button
                                    type="button"
                                    className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] transition-colors ${currentVarietyId === v.id ? "bg-accent/10 font-semibold text-accent" : "text-foreground/70 hover:bg-foreground/5"}`}
                                    onClick={() => {
                                      updateSelectedProperty({ varietyId: v.id, varietyName: v.name, planted: v.name });
                                      setContentVarietyPickerOpen(false);
                                    }}
                                  >
                                    <span className="text-sm leading-none">🏷️</span>
                                    <div className="flex-1 min-w-0">
                                      <span className="truncate block">{v.name}</span>
                                      {/* Variety quick-info */}
                                      <span className="text-[9px] text-foreground/40 block">
                                        {[v.taste, v.color, v.daysToHarvest ? `${v.daysToHarvest} dage` : "", v.storageQuality ? `Lagring: ${v.storageQuality}` : ""].filter(Boolean).join(" · ") || "Ingen detaljer"}
                                      </span>
                                    </div>
                                    {currentVarietyId === v.id ? <span className="text-[9px] shrink-0">✓</span> : null}
                                  </button>
                                  {/* Expanded detail when this is the active variety */}
                                  {currentVarietyId === v.id && (v.description || v.resistances?.length || v.seedSource || v.notes || v.sowStart || v.harvestStart || v.heightCm || v.yieldInfo) ? (
                                    <div className="px-2 pb-1.5 pt-0.5 text-[10px] text-foreground/50 space-y-0.5">
                                      {v.description ? <p>{v.description}</p> : null}
                                      {v.heightCm ? <p>📏 Højde: {v.heightCm} cm</p> : null}
                                      {v.spacingCm ? <p>↔️ Afstand: {v.spacingCm} cm</p> : null}
                                      {v.daysToHarvest ? <p>📅 Dage til høst: {v.daysToHarvest}</p> : null}
                                      {v.sowStart && v.sowEnd ? <p>🌱 Såning: mnd. {v.sowStart}–{v.sowEnd}</p> : null}
                                      {v.harvestStart && v.harvestEnd ? <p>🥕 Høst: mnd. {v.harvestStart}–{v.harvestEnd}</p> : null}
                                      {v.yieldInfo ? <p>📦 Udbytte: {v.yieldInfo}</p> : null}
                                      {v.resistances?.length ? <p>🛡️ Resistens: {v.resistances.join(", ")}</p> : null}
                                      {v.seedSource ? <p>🏪 Frøkilde: {v.seedSource}</p> : null}
                                      {v.notes ? <p className="italic">💬 {v.notes}</p> : null}
                                    </div>
                                  ) : null}
                                </div>
                              ))}

                              <button
                                type="button"
                                className="flex w-full items-center justify-center gap-1 rounded px-2 py-1.5 text-[10px] text-accent hover:bg-accent/5 transition-colors"
                                onClick={() => {
                                  setVarietyManagerSpeciesId(linkedSpecies.id);
                                  setShowVarietyManager(true);
                                }}
                              >
                                ＋ Administrér sorter
                              </button>
                            </div>
                          ) : currentVariety ? (
                            /* Show selected variety details inline when picker is closed */
                            <div className="mt-1.5 text-[10px] text-foreground/50 space-y-0.5">
                              {currentVariety.description ? <p>{currentVariety.description}</p> : null}
                              {(currentVariety.taste || currentVariety.color || currentVariety.daysToHarvest || currentVariety.storageQuality) ? (
                                <p>
                                  {[currentVariety.taste, currentVariety.color, currentVariety.daysToHarvest ? `${currentVariety.daysToHarvest} dage til høst` : "", currentVariety.storageQuality ? `Lagring: ${currentVariety.storageQuality}` : ""].filter(Boolean).join(" · ")}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {/* ── Collapsible species details ── */}
                      <div className="border-t border-accent/10">
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-[10px] font-semibold text-foreground/50 uppercase tracking-wide hover:bg-accent/5 transition-colors"
                          onClick={() => setContentPlantDetailsOpen(!contentPlantDetailsOpen)}
                        >
                          <span>📋 Plantedata</span>
                          <span className="flex-1" />
                          <span className="text-foreground/30">{contentPlantDetailsOpen ? "▲" : "▼"}</span>
                        </button>
                        {contentPlantDetailsOpen ? (
                          <div className="px-2.5 pb-2.5 space-y-1.5 text-[10px] text-foreground/60">
                            {/* Growing info */}
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                              {linkedSpecies.lifecycle ? (
                                <div><span className="text-foreground/40">Livscyklus:</span> {LIFECYCLE_LABELS[linkedSpecies.lifecycle]}</div>
                              ) : null}
                              {linkedSpecies.family ? (
                                <div><span className="text-foreground/40">Familie:</span> {PLANT_FAMILY_LABELS[linkedSpecies.family]}</div>
                              ) : null}
                              {linkedSpecies.difficulty ? (
                                <div><span className="text-foreground/40">Sværhedsgrad:</span> {DIFFICULTY_LABELS[linkedSpecies.difficulty]}</div>
                              ) : null}
                              {linkedSpecies.spacingCm ? (
                                <div><span className="text-foreground/40">Afstand:</span> {linkedSpecies.spacingCm} cm</div>
                              ) : null}
                              {linkedSpecies.rowSpacingCm ? (
                                <div><span className="text-foreground/40">Rækkeafstand:</span> {linkedSpecies.rowSpacingCm} cm</div>
                              ) : null}
                              {linkedSpecies.rootDepthCm ? (
                                <div><span className="text-foreground/40">Roddybde:</span> {linkedSpecies.rootDepthCm} cm</div>
                              ) : null}
                              {linkedSpecies.frostHardy != null ? (
                                <div><span className="text-foreground/40">Frosttolerant:</span> {linkedSpecies.frostHardy ? "Ja" : "Nej"}</div>
                              ) : null}
                              {linkedSpecies.minTempC != null ? (
                                <div><span className="text-foreground/40">Min. temp:</span> {linkedSpecies.minTempC}°C</div>
                              ) : null}
                            </div>

                            {/* Season windows */}
                            {(linkedSpecies.sowIndoor || linkedSpecies.sowOutdoor || linkedSpecies.plantOut || linkedSpecies.harvest) ? (
                              <div className="rounded border border-foreground/10 bg-foreground/[0.02] p-1.5 space-y-0.5">
                                <p className="font-semibold text-foreground/50 uppercase tracking-wide text-[9px]">Sæsonkalender</p>
                                {linkedSpecies.sowIndoor ? <p>🏠 Så indendørs: {formatMonthRange(linkedSpecies.sowIndoor)}</p> : null}
                                {linkedSpecies.sowOutdoor ? <p>🌱 Så udendørs: {formatMonthRange(linkedSpecies.sowOutdoor)}</p> : null}
                                {linkedSpecies.plantOut ? <p>📤 Plant ud: {formatMonthRange(linkedSpecies.plantOut)}</p> : null}
                                {linkedSpecies.harvest ? <p>🥕 Høst: {formatMonthRange(linkedSpecies.harvest)}</p> : null}
                              </div>
                            ) : null}

                            {/* Taste & culinary */}
                            {linkedSpecies.taste ? <p><span className="text-foreground/40">Smag:</span> {linkedSpecies.taste}</p> : null}
                            {linkedSpecies.culinaryUses ? <p><span className="text-foreground/40">Kulinarisk:</span> {linkedSpecies.culinaryUses}</p> : null}
                            {linkedSpecies.harvestTips ? <p><span className="text-foreground/40">Høsttips:</span> {linkedSpecies.harvestTips}</p> : null}
                            {linkedSpecies.storageInfo ? <p><span className="text-foreground/40">Opbevaring:</span> {linkedSpecies.storageInfo}</p> : null}

                            {/* Pests & diseases */}
                            {linkedSpecies.pests?.length ? <p><span className="text-foreground/40">Skadedyr:</span> {linkedSpecies.pests.join(", ")}</p> : null}
                            {linkedSpecies.diseases?.length ? <p><span className="text-foreground/40">Sygdomme:</span> {linkedSpecies.diseases.join(", ")}</p> : null}

                            {/* Soil & fertilizer */}
                            {linkedSpecies.soilAmendments ? <p><span className="text-foreground/40">Jordforb.:</span> {linkedSpecies.soilAmendments}</p> : null}
                            {linkedSpecies.fertilizerInfo ? <p><span className="text-foreground/40">Gødning:</span> {linkedSpecies.fertilizerInfo}</p> : null}

                            {/* Nutrition */}
                            {linkedSpecies.nutrition ? (
                              <div className="rounded border border-foreground/10 bg-foreground/[0.02] p-1.5 space-y-0.5">
                                <p className="font-semibold text-foreground/50 uppercase tracking-wide text-[9px]">Næringsindhold (pr. 100 g)</p>
                                <p>{linkedSpecies.nutrition.kcal} kcal · {linkedSpecies.nutrition.proteinG}g protein · {linkedSpecies.nutrition.fatG}g fedt · {linkedSpecies.nutrition.carbG}g kulhydrat{linkedSpecies.nutrition.fiberG ? ` · ${linkedSpecies.nutrition.fiberG}g fiber` : ""}</p>
                                {linkedSpecies.nutrition.highlights ? <p className="text-foreground/40">{linkedSpecies.nutrition.highlights}</p> : null}
                              </div>
                            ) : null}

                            {/* Companions */}
                            {(linkedSpecies.goodCompanions?.length || linkedSpecies.badCompanions?.length) ? (
                              <div className="rounded border border-foreground/10 bg-foreground/[0.02] p-1.5 space-y-0.5">
                                <p className="font-semibold text-foreground/50 uppercase tracking-wide text-[9px]">Samdyrkning</p>
                                {linkedSpecies.goodCompanions?.length ? (
                                  <p className="text-green-600">✓ {linkedSpecies.goodCompanions.map((id) => getPlantById(id)?.name ?? id).join(", ")}</p>
                                ) : null}
                                {linkedSpecies.badCompanions?.length ? (
                                  <p className="text-red-500">✗ {linkedSpecies.badCompanions.map((id) => getPlantById(id)?.name ?? id).join(", ")}</p>
                                ) : null}
                              </div>
                            ) : null}

                            {/* Crop rotation */}
                            {linkedSpecies.rotationYears ? (
                              <p><span className="text-foreground/40">Sædskifte:</span> {linkedSpecies.rotationYears} år</p>
                            ) : null}

                            {linkedSpecies.description ? <p className="italic text-foreground/40">{linkedSpecies.description}</p> : null}

                            <button
                              type="button"
                              className="mt-1 flex items-center gap-1 text-[10px] text-accent hover:underline"
                              onClick={() => {
                                setEditPlantSpeciesId(linkedSpecies.id);
                                setShowPlantEditor(true);
                              }}
                            >
                              ✏️ Redigér alle plantedata
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })() : null}

                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Hvad plantes / sort</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.planted ?? ""}
                    onChange={(e) => updateSelectedProperty({ planted: e.target.value })}
                    placeholder="Fx kartofler / gulerødder / sort"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Plantningsdato</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.plantedAt ?? ""}
                    onChange={(e) => updateSelectedProperty({ plantedAt: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Solbehov</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.sunNeed ?? ""}
                    onChange={(e) => updateSelectedProperty({ sunNeed: e.target.value })}
                  >
                    <option value="">Ikke angivet</option>
                    <option value="sol">Sol</option>
                    <option value="halvskygge">Halvskygge</option>
                    <option value="skygge">Skygge</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Vandbehov</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.waterNeed ?? ""}
                    onChange={(e) => updateSelectedProperty({ waterNeed: e.target.value })}
                  >
                    <option value="">Ikke angivet</option>
                    <option value="lav">Lav</option>
                    <option value="middel">Middel</option>
                    <option value="høj">Høj</option>
                  </select>
                </div>
              </>
            ) : null}

            {/* ── Container-specific fields ── */}
            {selectedCategory === "container" ? (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Jordtype</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.soilType ?? ""}
                    onChange={(e) => updateSelectedProperty({ soilType: e.target.value })}
                    placeholder="Fx muld, sandjord, lerjord"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Gødning</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.fertilizer ?? ""}
                    onChange={(e) => updateSelectedProperty({ fertilizer: e.target.value })}
                    placeholder="Fx kompost april, NPK maj"
                  />
                </div>
              </>
            ) : null}

            {/* ── Area-specific fields ── */}
            {selectedCategory === "area" ? (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Læforhold</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.shelter ?? ""}
                    onChange={(e) => updateSelectedProperty({ shelter: e.target.value })}
                    placeholder="Fx læ fra vest, åben"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Opvarmning</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.heating ?? ""}
                    onChange={(e) => updateSelectedProperty({ heating: e.target.value })}
                    placeholder="Fx uopvarmet / gulvvarme"
                  />
                </div>
              </>
            ) : null}

            {/* ── Condition-specific fields ── */}
            {selectedCategory === "condition" ? (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Beskrivelse</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.conditionDesc ?? ""}
                    onChange={(e) => updateSelectedProperty({ conditionDesc: e.target.value })}
                    placeholder="Fx morgen-skygge fra hus"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Intensitet</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.intensity ?? ""}
                    onChange={(e) => updateSelectedProperty({ intensity: e.target.value })}
                  >
                    <option value="">Ikke angivet</option>
                    <option value="svag">Svag</option>
                    <option value="middel">Middel</option>
                    <option value="stærk">Stærk</option>
                  </select>
                </div>
              </>
            ) : null}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* ── PLANTNINGER I DETTE BED ── plant instances section ── */}
            {/* ══════════════════════════════════════════════════════════ */}
            {(selectedCategory === "seedbed" || selectedCategory === "container" || selectedCategory === "area" || selectedCategory === "row" || (selectedCategory === "element" && !selectedIsInfra)) ? (
              <div className="rounded-md border border-foreground/20 p-2.5 space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/50">
                  🌱 Plantninger ({selectedFeatureInstances.length})
                </p>
                {selectedCategory !== "area" ? (
                  <p className="text-[9px] text-foreground/40 leading-snug">
                    {selectedCategory === "element" && "Element: Enkelt plante – træer, buske, store planter"}
                    {selectedCategory === "row" && "Række: Planter i rækker – rodfrugter, løg, bønner, kål"}
                    {selectedCategory === "seedbed" && "Såbed: Bredsåede planter – radiser, salat, urter"}
                    {selectedCategory === "container" && "Container: Krukker, højbede – tomater, urter, salat"}
                  </p>
                ) : null}

                {/* Current plant instances */}
                {selectedFeatureInstances.length > 0 ? (
                  <div className="space-y-1">
                    {selectedFeatureInstances.map((inst) => {
                      const instVarieties = getVarietiesForSpecies(inst.speciesId);
                      const isEditing = editingInstanceId === inst.id;
                      return (
                        <div
                          key={inst.id}
                          className="rounded border border-foreground/10 bg-foreground/[0.02] px-2 py-1 space-y-1"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm leading-none">{inst.species?.icon ?? "🌱"}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                {inst.species?.name ?? inst.speciesId}
                                {inst.varietyName ? <span className="text-foreground/50 font-normal"> ({inst.varietyName})</span> : <span className="text-foreground/30 font-normal italic"> (uspecificeret)</span>}
                              </p>
                              <p className="text-[10px] text-foreground/50">
                                {inst.count ? `${inst.count} stk` : ""}
                                {inst.plantedAt ? ` · plantet ${inst.plantedAt}` : ""}
                                {inst.season ? ` · sæson ${inst.season}` : ""}
                              </p>
                            </div>
                            {instVarieties.length > 0 ? (
                              <button
                                type="button"
                                className="shrink-0 rounded px-1 py-0.5 text-[10px] text-accent hover:bg-accent/10"
                                onClick={() => setEditingInstanceId(isEditing ? null : inst.id)}
                                title="Vælg/skift sort"
                              >
                                🏷️
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="shrink-0 rounded px-1 text-xs text-foreground/40 hover:bg-red-50 hover:text-red-500"
                              onClick={() => {
                                removePlantInstance(inst.id);
                                setPlantInstancesVersion((v) => v + 1);
                                if (isEditing) setEditingInstanceId(null);
                              }}
                              title="Fjern plantning"
                            >
                              ✕
                            </button>
                          </div>
                          {/* Inline variety selector */}
                          {isEditing ? (
                            <div className="ml-5 space-y-0.5 border-l-2 border-accent/30 pl-2">
                              <p className="text-[10px] font-medium text-foreground/50 uppercase tracking-wide">Vælg sort:</p>
                              <button
                                type="button"
                                className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-foreground/5 ${
                                  !inst.varietyId ? "bg-accent/10 font-medium text-accent" : "text-foreground/70"
                                }`}
                                onClick={() => {
                                  updatePlantInstance(inst.id, { varietyId: undefined, varietyName: undefined });
                                  setPlantInstancesVersion((v) => v + 1);
                                  setEditingInstanceId(null);
                                }}
                              >
                                <span className="text-sm leading-none">🌱</span>
                                <span className="truncate">Uspecificeret sort</span>
                                {!inst.varietyId ? <span className="ml-auto text-[9px]">✓</span> : null}
                              </button>
                              {instVarieties.map((v) => (
                                <button
                                  key={v.id}
                                  type="button"
                                  className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-foreground/5 ${
                                    inst.varietyId === v.id ? "bg-accent/10 font-medium text-accent" : "text-foreground/70"
                                  }`}
                                  onClick={() => {
                                    updatePlantInstance(inst.id, { varietyId: v.id, varietyName: v.name });
                                    setPlantInstancesVersion((v2) => v2 + 1);
                                    setEditingInstanceId(null);
                                  }}
                                >
                                  <span className="text-sm leading-none">🏷️</span>
                                  <span className="truncate">{v.name}</span>
                                  {v.taste ? <span className="text-[9px] text-foreground/40">{v.taste}</span> : null}
                                  {inst.varietyId === v.id ? <span className="ml-auto text-[9px]">✓</span> : null}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-foreground/50 italic">Ingen planter tilføjet endnu.</p>
                )}

                {/* Companion planting checks */}
                {selectedCompanionChecks.length > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/50">Samdyrkning</p>
                    {selectedCompanionChecks.map((c, idx) => (
                      <p
                        key={idx}
                        className={`text-xs ${
                          c.type === "good"
                            ? "text-green-700 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {c.type === "good" ? "✓" : "⚠"} {c.plantA.name} + {c.plantB.name}
                        {c.type === "good" ? " — gode naboer" : " — dårlig kombination"}
                      </p>
                    ))}
                  </div>
                ) : null}

                {/* Rotation warnings */}
                {selectedRotationWarnings.length > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/50">Sædskifte</p>
                    {selectedRotationWarnings.map((w, idx) => (
                      <p key={idx} className="text-xs text-amber-600 dark:text-amber-400">
                        🔄 {w.plant.name} — samme familie dyrket i {w.lastSeason} (vent {w.minYears} år)
                      </p>
                    ))}
                  </div>
                ) : null}

                {/* Add plant picker */}
                {!showBedPlantPicker ? (
                  <button
                    type="button"
                    className="w-full rounded-md border border-dashed border-foreground/20 px-2 py-1.5 text-xs text-foreground/60 hover:border-foreground/30 hover:bg-foreground/5"
                    onClick={() => { setShowBedPlantPicker(true); setBedPlantSearch(""); setBedPickerSpeciesId(null); }}
                  >
                    + Tilføj plante
                  </button>
                ) : bedPickerSpeciesId ? (() => {
                  const pickedSpecies = getPlantById(bedPickerSpeciesId);
                  const varieties = getVarietiesForSpecies(bedPickerSpeciesId);
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded px-1.5 py-1 text-xs text-foreground/50 hover:bg-foreground/5"
                          onClick={() => setBedPickerSpeciesId(null)}
                        >
                          ← Tilbage
                        </button>
                        <span className="text-xs font-medium truncate flex-1">
                          {pickedSpecies?.icon ?? "🌱"} {pickedSpecies?.name} — vælg sort
                        </span>
                        <button
                          type="button"
                          className="rounded px-1.5 py-1 text-xs text-foreground/50 hover:bg-foreground/5"
                          onClick={() => { setShowBedPlantPicker(false); setBedPickerSpeciesId(null); }}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="max-h-48 space-y-0.5 overflow-y-auto">
                        {/* Add without specific variety */}
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 rounded border border-transparent px-2 py-1 text-left text-xs hover:border-foreground/15 hover:bg-foreground/5"
                          onClick={() => {
                            const featureId = selected?.feature.properties?.gardenosId;
                            if (!featureId) return;
                            addPlantInstance({
                              id: crypto.randomUUID(),
                              speciesId: bedPickerSpeciesId,
                              featureId,
                              count: 1,
                              plantedAt: new Date().toISOString().slice(0, 10),
                              season: new Date().getFullYear(),
                            });
                            setPlantInstancesVersion((v) => v + 1);
                            setShowBedPlantPicker(false);
                            setBedPickerSpeciesId(null);
                          }}
                        >
                          <span className="text-sm leading-none">🌱</span>
                          <span className="truncate">{pickedSpecies?.name} (uspecificeret sort)</span>
                        </button>
                        {/* Variety options */}
                        {varieties.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className="flex w-full items-center gap-1.5 rounded border border-transparent px-2 py-1 text-left text-xs hover:border-foreground/15 hover:bg-foreground/5"
                            onClick={() => {
                              const featureId = selected?.feature.properties?.gardenosId;
                              if (!featureId) return;
                              addPlantInstance({
                                id: crypto.randomUUID(),
                                speciesId: bedPickerSpeciesId,
                                varietyId: v.id,
                                varietyName: v.name,
                                featureId,
                                count: 1,
                                plantedAt: new Date().toISOString().slice(0, 10),
                                season: new Date().getFullYear(),
                              });
                              setPlantInstancesVersion((vv) => vv + 1);
                              setShowBedPlantPicker(false);
                              setBedPickerSpeciesId(null);
                            }}
                          >
                            <span className="text-sm leading-none">🏷️</span>
                            <span className="truncate">{v.name}</span>
                            {v.taste ? <span className="ml-auto text-[10px] text-foreground/40">{v.taste}</span> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        className="flex-1 rounded-md border border-foreground/20 bg-background px-2 py-1.5 text-xs"
                        placeholder="Søg plante…"
                        value={bedPlantSearch}
                        onChange={(e) => setBedPlantSearch(e.target.value)}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="rounded px-1.5 py-1.5 text-xs text-foreground/50 hover:bg-foreground/5"
                        onClick={() => setShowBedPlantPicker(false)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="max-h-40 space-y-0.5 overflow-y-auto">
                      {bedPlantResults.map((plant) => (
                        <button
                          key={plant.id}
                          type="button"
                          className="flex w-full items-center gap-1.5 rounded border border-transparent px-2 py-1 text-left text-xs hover:border-foreground/15 hover:bg-foreground/5"
                          onClick={() => {
                            const varieties = getVarietiesForSpecies(plant.id);
                            if (varieties.length > 0) {
                              // Has varieties — show variety picker
                              setBedPickerSpeciesId(plant.id);
                            } else {
                              // No varieties — add directly
                              const featureId = selected?.feature.properties?.gardenosId;
                              if (!featureId) return;
                              addPlantInstance({
                                id: crypto.randomUUID(),
                                speciesId: plant.id,
                                featureId,
                                count: 1,
                                plantedAt: new Date().toISOString().slice(0, 10),
                                season: new Date().getFullYear(),
                              });
                              setPlantInstancesVersion((v) => v + 1);
                              setShowBedPlantPicker(false);
                              setBedPlantSearch("");
                            }
                          }}
                        >
                          <span className="text-sm leading-none">{plant.icon ?? "🌱"}</span>
                          <span className="truncate">{plant.name}</span>
                          <span className="ml-auto flex items-center gap-1 text-[10px] text-foreground/40">
                            {plant.varieties?.length ? <span>{plant.varieties.length} sorter</span> : null}
                            {(() => {
                              const placements = getDefaultPlacements(plant);
                              const featureCat = selected?.feature.properties?.category;
                              const primary = featureCat && placements.includes(featureCat as PlacementType)
                                ? featureCat as PlacementType
                                : placements[0];
                              return <span>{PLACEMENT_ICONS[primary]}</span>;
                            })()}
                          </span>
                        </button>
                      ))}
                      {bedPlantResults.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-foreground/50 italic">Ingen planter fundet.</p>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {selectedGroupId ? (
              <div className="rounded-md border border-foreground/20">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-foreground/70 hover:bg-foreground/5"
                  onClick={() => setGroupSectionOpen((o) => !o)}
                >
                  <span>Gruppe: {groupRegistry[selectedGroupId]?.name ?? `(${selectedGroupId.slice(0, 6)})`}</span>
                  <span className="text-foreground/40">{groupSectionOpen ? "▲" : "▼"}</span>
                </button>
                {groupSectionOpen ? (
                  <div className="border-t border-foreground/10 p-2">
                    <input
                      className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm font-medium"
                      value={groupRegistry[selectedGroupId]?.name ?? `Gruppe (${selectedGroupId.slice(0, 6)})`}
                      onChange={(e) => renameGroup(selectedGroupId, e.target.value)}
                      placeholder="Gruppenavn"
                    />
                    <p className="mt-1 px-1 text-xs text-foreground/60">
                      {groupMemberCount} {groupMemberCount === 1 ? "element" : "elementer"} i gruppen
                    </p>
                    <div className="mt-1 max-h-32 space-y-0.5 overflow-y-auto px-1">
                      {selectedGroupMembers.map((m) => (
                        <div key={m.id} className="flex items-center gap-1">
                          <button
                            type="button"
                            className="flex-1 cursor-pointer text-left text-xs text-foreground/70 hover:text-foreground hover:underline"
                            onClick={() => selectFeatureById(m.id)}
                            title="Gå til element i Indholdsfanen"
                          >
                            • {m.label}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 rounded px-1 text-xs text-foreground/40 hover:bg-red-50 hover:text-red-500"
                            onClick={() => removeFromGroupById(m.id)}
                            title="Fjern fra gruppen"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mt-2 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5"
                      onClick={ungroupSelected}
                    >
                      Opløs gruppe
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">
                {selectedIsInfra ? "Tekst" : "Noter"}
              </label>
              <textarea
                className="mt-1 min-h-[80px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                value={selected.feature.properties?.notes ?? ""}
                onChange={(e) => updateSelectedProperty({ notes: e.target.value })}
                placeholder={selectedIsInfra ? "Fx dybde/placering/kommentar" : "Fx gødes i april / skal beskæres"}
              />
            </div>

            {/* ── Foto ── */}
            <div>
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">📷 Foto</label>
              {selected.feature.properties?.photoUrl ? (
                <div className="mt-1 space-y-1.5">
                  <div className="relative rounded-lg overflow-hidden border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.feature.properties.photoUrl}
                      alt="Vedhæftet foto"
                      className="w-full max-h-48 object-cover"
                    />
                    <button
                      type="button"
                      className="absolute top-1 right-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-600 transition-colors"
                      onClick={() => updateSelectedProperty({ photoUrl: "" })}
                      title="Fjern foto"
                    >
                      ✕
                    </button>
                  </div>
                  <label className="block">
                    <span className="inline-block cursor-pointer rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground/60 hover:bg-foreground/5 transition-colors">
                      📷 Skift foto
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { alert("Foto må max være 2 MB"); return; }
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") updateSelectedProperty({ photoUrl: reader.result });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                </div>
              ) : (
                <label className="mt-1 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-foreground/15 bg-foreground/[0.02] px-3 py-4 cursor-pointer hover:border-accent/40 hover:bg-accent-light/10 transition-colors">
                  <span className="text-lg">📷</span>
                  <span className="text-xs text-foreground/50">Tilføj foto (max 2 MB)</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) { alert("Foto må max være 2 MB"); return; }
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === "string") updateSelectedProperty({ photoUrl: reader.result });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              )}
            </div>

            {selectedIsPoint ? (
              <p className="text-xs text-foreground/60">Tip: punkter kan være træ/busk/krukke.</p>
            ) : null}

            {selectedIsPolyline ? (
              <p className="text-xs text-foreground/60">Tip: linjer kan flyttes/redigeres i “Redigér/flyt”.</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border-light mt-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground/70 hover:bg-foreground/5 transition-colors disabled:opacity-40"
                onClick={duplicateSelected}
                disabled={!selected}
                title="Lav en kopi med nyt navn"
              >
                📋 Kopiér
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                onClick={deleteSelected}
                disabled={!selected}
                title="Du kan også bruge Delete/Backspace"
              >
                🗑️ Slet valgt
              </button>
              <button
                type="button"
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground/60 hover:bg-foreground/5 transition-colors disabled:opacity-40"
                onClick={undo}
                disabled={undoStack.length === 0}
                title="Cmd/Ctrl+Z (uden for felter)"
              >
                ↩ Fortryd
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                onClick={deleteAll}
              >
                ⚠️ Slet alt
              </button>
            </div>

            <p className="text-xs text-foreground/60">Layout gemmes automatisk i denne browser.</p>
          </div>
          )
        ) : null}

        {sidebarTab === "groups" ? (
          <div className="mt-3 space-y-3">
            {allGroups.length === 0 ? (
              <p className="text-sm text-foreground/70">
                Ingen grupper endnu. Vælg flere elementer med Shift+klik og tryk &quot;Gruppér&quot;.
              </p>
            ) : (
              allGroups.map((g) => {
                const isHighlighted = highlightedGroupId === g.id;
                const isCollapsed = collapsedGroupIds.has(g.id);
                const toggleHighlight = () => {
                  setHighlightedGroupId(isHighlighted ? null : g.id);
                  // Fit map to group bounds when highlighting
                  if (!isHighlighted) {
                    const fgRef = featureGroupRef.current;
                    if (fgRef) {
                      const bounds = L.latLngBounds([]);
                      fgRef.eachLayer((layer) => {
                        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
                        if (f?.properties?.groupId === g.id) {
                          if (layer instanceof L.Marker) {
                            bounds.extend(layer.getLatLng());
                          } else if (typeof (layer as unknown as { getBounds?: () => L.LatLngBounds }).getBounds === "function") {
                            bounds.extend((layer as unknown as { getBounds: () => L.LatLngBounds }).getBounds());
                          }
                        }
                      });
                      if (bounds.isValid()) {
                        mapRef.current?.fitBounds(bounds.pad(0.3), { animate: true, duration: 0.4 });
                      }
                    }
                  }
                };
                const toggleCollapse = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setCollapsedGroupIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                    return next;
                  });
                };
                return (
                  <div
                    key={g.id}
                    className={`gardenos-group-card rounded-lg text-sm transition-all ${
                      isHighlighted
                        ? "gardenos-group-card--active shadow-md"
                        : "border border-border bg-background hover:shadow-sm"
                    }`}
                    onClick={toggleHighlight}
                    style={{ cursor: "pointer" }}
                    title="Klik for at markere gruppen på kortet"
                  >
                    <div className="flex items-start gap-2 p-3 pb-1">
                      {/* Collapse chevron */}
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 w-5 h-5 flex items-center justify-center rounded text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-all"
                        onClick={toggleCollapse}
                        title={isCollapsed ? "Vis medlemmer" : "Skjul medlemmer"}
                      >
                        <span className="text-xs" style={{ transition: "transform 0.2s", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
                      </button>
                      <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-foreground hover:border-foreground/20 focus:border-foreground/30 focus:outline-none"
                          value={g.name}
                          onChange={(e) => renameGroup(g.id, e.target.value)}
                          title="Klik for at omdøbe gruppen"
                        />
                        <p className="mt-0.5 px-1 text-xs text-foreground/60">
                          {g.memberCount} {g.memberCount === 1 ? "element" : "elementer"}
                          {isHighlighted ? " · markeret på kort" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-red-300 bg-background px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        onClick={(e) => { e.stopPropagation(); dissolveGroupById(g.id); }}
                        title="Slet gruppen (elementer beholdes)"
                      >
                        Slet
                      </button>
                    </div>
                    {/* Collapsible member list */}
                    {!isCollapsed && (
                      <div className="px-3 pb-2.5 pt-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>
                        {g.members.map((m) => (
                          <div key={m.id} className="flex items-center gap-1">
                            <button
                              type="button"
                              className="flex-1 cursor-pointer text-left text-xs text-foreground/70 hover:text-foreground hover:underline"
                              onClick={() => selectFeatureById(m.id)}
                              title="Gå til element i Indholdsfanen"
                            >
                              • {m.label}
                            </button>
                            <button
                              type="button"
                              className="shrink-0 rounded px-1 text-xs text-foreground/40 hover:bg-red-50 hover:text-red-500"
                              onClick={() => removeFromGroupById(m.id)}
                              title="Fjern fra gruppen"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {g.memberCount > 8 ? (
                          <div className="text-xs text-foreground/50">… +{g.memberCount - 8} flere</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <p className="text-xs text-foreground/60">
              Tip: Shift+klik for at vælge flere elementer, derefter &quot;Gruppér&quot;.
            </p>
          </div>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* ── PLANTER TAB ── Browse / search plant species database ─── */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {sidebarTab === "plants" ? (
          <div className="mt-3 space-y-3">
            {/* Search */}
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm shadow-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 transition-all"
              placeholder="🔍 Søg plante (navn, latinsk, id)…"
              value={plantSearch}
              onChange={(e) => setPlantSearch(e.target.value)}
            />

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-green-500/30 bg-green-50/50 px-3 py-2 text-xs font-medium text-green-800 hover:bg-green-100 hover:border-green-500/50 transition-all dark:border-green-500/20 dark:bg-green-900/10 dark:text-green-300 dark:hover:bg-green-900/20"
                onClick={() => { setEditPlantSpeciesId(null); setShowPlantEditor(true); }}
              >
                ➕ Ny plante
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg border border-accent/30 bg-accent-light/40 px-3 py-2 text-xs font-medium text-accent-dark hover:bg-accent-light hover:border-accent/50 transition-all"
                onClick={() => { setVarietyManagerSpeciesId(null); setShowVarietyManager(true); }}
              >
                🏷️ Sorter ({allPlants.reduce((s, p) => s + (p.varieties?.length ?? 0), 0)})
              </button>
            </div>

            {/* Category filter chips */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
                  plantCategoryFilter === "all"
                    ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                    : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
                }`}
                onClick={() => setPlantCategoryFilter("all")}
              >
                Alle ({allPlants.length})
              </button>
              {(Object.entries(PLANT_CATEGORY_LABELS) as [PlantCategory, string][]).map(([cat, label]) => {
                const count = allPlants.filter((p) => p.category === cat).length;
                if (count === 0) return null;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
                      plantCategoryFilter === cat
                        ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                        : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
                    }`}
                    onClick={() => setPlantCategoryFilter(plantCategoryFilter === cat ? "all" : cat)}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Results count */}
            <p className="text-[10px] text-foreground/50">
              {filteredPlants.length} plante{filteredPlants.length !== 1 ? "r" : ""} fundet
            </p>

            {/* Plant list */}
            <div className="max-h-[60vh] space-y-1.5 overflow-y-auto sidebar-scroll">
              {filteredPlants.map((plant) => {
                const isExpanded = expandedPlantId === plant.id;
                return (
                  <div
                    key={plant.id}
                    className={`rounded-lg border transition-all ${
                      isExpanded
                        ? "border-accent/30 bg-accent-light/50 shadow-sm"
                        : "border-border bg-background hover:border-border hover:shadow-sm"
                    }`}
                  >
                    {/* Collapsed row */}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
                      onClick={() => setExpandedPlantId(isExpanded ? null : plant.id)}
                    >
                      <span className="text-base leading-none">{plant.icon ?? "🌱"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground/90 truncate">{plant.name}</p>
                        {plant.latinName ? (
                          <p className="text-[10px] italic text-foreground/50 truncate">{plant.latinName}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        {getDefaultPlacements(plant).map((pt) => (
                          <span key={pt} className="text-[10px]" title={PLACEMENT_LABELS[pt]}>{PLACEMENT_ICONS[pt]}</span>
                        ))}
                      </div>
                      <span className="shrink-0 text-foreground/30 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </button>

                    {/* Expanded detail card (progressive disclosure) */}
                    {isExpanded ? (
                      <div className="border-t border-accent/15 px-2.5 py-2.5 space-y-2.5">
                        {/* Quick info grid */}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          {plant.family ? (
                            <>
                              <span className="text-foreground/50">Familie</span>
                              <span>{PLANT_FAMILY_LABELS[plant.family]}</span>
                            </>
                          ) : null}
                          {plant.lifecycle ? (
                            <>
                              <span className="text-foreground/50">Livscyklus</span>
                              <span>{LIFECYCLE_LABELS[plant.lifecycle]}</span>
                            </>
                          ) : null}
                          {plant.difficulty ? (
                            <>
                              <span className="text-foreground/50">Sværhed</span>
                              <span>{DIFFICULTY_LABELS[plant.difficulty]}</span>
                            </>
                          ) : null}
                          {plant.light ? (
                            <>
                              <span className="text-foreground/50">Lys</span>
                              <span>{LIGHT_LABELS[plant.light]}</span>
                            </>
                          ) : null}
                          {plant.water ? (
                            <>
                              <span className="text-foreground/50">Vand</span>
                              <span>{WATER_LABELS[plant.water]}</span>
                            </>
                          ) : null}
                          {plant.spacingCm ? (
                            <>
                              <span className="text-foreground/50">Afstand</span>
                              <span>{plant.spacingCm} cm{plant.rowSpacingCm ? ` (rk. ${plant.rowSpacingCm} cm)` : ""}</span>
                            </>
                          ) : null}
                          {plant.frostHardy !== undefined ? (
                            <>
                              <span className="text-foreground/50">Frosttålig</span>
                              <span>{plant.frostHardy ? "Ja" : "Nej"}</span>
                            </>
                          ) : null}
                        </div>

                        {/* Taste & Culinary */}
                        {plant.taste ? (
                          <div className="text-xs">
                            <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">🍽️ Smag</p>
                            <p className="text-foreground/70">{plant.taste}</p>
                          </div>
                        ) : null}
                        {plant.culinaryUses ? (
                          <div className="text-xs">
                            <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">👨‍🍳 Brug i køkkenet</p>
                            <p className="text-foreground/70">{plant.culinaryUses}</p>
                          </div>
                        ) : null}

                        {/* Sowing / planting / harvest timeline */}
                        {(plant.sowIndoor || plant.sowOutdoor || plant.plantOut || plant.harvest) ? (
                          <div className="space-y-0.5 text-xs">
                            <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">📅 Kalender</p>
                            {plant.sowIndoor ? (
                              <p>🏠 Forspiring: {formatMonthRange(plant.sowIndoor)}</p>
                            ) : null}
                            {plant.sowOutdoor ? (
                              <p>🌿 Direkte såning: {formatMonthRange(plant.sowOutdoor)}</p>
                            ) : null}
                            {plant.plantOut ? (
                              <p>📦 Udplantning: {formatMonthRange(plant.plantOut)}</p>
                            ) : null}
                            {plant.harvest ? (
                              <p>🧺 Høst: {formatMonthRange(plant.harvest)}</p>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Harvest tips */}
                        {plant.harvestTips ? (
                          <div className="text-xs">
                            <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">🧺 Høsttips</p>
                            <p className="text-foreground/70">{plant.harvestTips}</p>
                          </div>
                        ) : null}

                        {/* Soil & Fertilizer */}
                        {(plant.soilAmendments || plant.fertilizerInfo) ? (
                          <div className="space-y-0.5 text-xs">
                            <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">🌍 Jord & gødning</p>
                            {plant.soilAmendments ? <p className="text-foreground/70">{plant.soilAmendments}</p> : null}
                            {plant.fertilizerInfo ? <p className="text-foreground/70">{plant.fertilizerInfo}</p> : null}
                          </div>
                        ) : null}

                        {/* Pests & Diseases */}
                        {(plant.pests?.length || plant.diseases?.length) ? (
                          <div className="space-y-0.5 text-xs">
                            <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">🐛 Skadedyr & sygdomme</p>
                            {plant.pests?.length ? <p className="text-foreground/70">Skadedyr: {plant.pests.join(", ")}</p> : null}
                            {plant.diseases?.length ? <p className="text-foreground/70">Sygdomme: {plant.diseases.join(", ")}</p> : null}
                          </div>
                        ) : null}

                        {/* Storage */}
                        {plant.storageInfo ? (
                          <div className="text-xs">
                            <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">📦 Opbevaring</p>
                            <p className="text-foreground/70">{plant.storageInfo}</p>
                          </div>
                        ) : null}

                        {/* Nutrition */}
                        {plant.nutrition ? (
                          <div className="text-xs">
                            <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">💪 Ernæring (per 100 g)</p>
                            <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                              <div className="rounded-lg bg-accent-light border border-accent/15 px-1.5 py-1.5 text-center">
                                <p className="text-[9px] text-accent-dark/60 font-medium">Kalorier</p>
                                <p className="text-sm font-bold text-accent-dark">{plant.nutrition.kcal}</p>
                                <p className="text-[8px] text-accent-dark/40">kcal</p>
                              </div>
                              <div className="rounded-lg bg-blue-50 border border-blue-200/40 px-1.5 py-1.5 text-center dark:bg-blue-900/20 dark:border-blue-800/30">
                                <p className="text-[9px] text-blue-600/70 font-medium dark:text-blue-400/70">Protein</p>
                                <p className="text-sm font-bold text-blue-700 dark:text-blue-400">{plant.nutrition.proteinG}</p>
                                <p className="text-[8px] text-blue-500/50">g</p>
                              </div>
                              <div className="rounded-lg bg-amber-50 border border-amber-200/40 px-1.5 py-1.5 text-center dark:bg-amber-900/20 dark:border-amber-800/30">
                                <p className="text-[9px] text-amber-600/70 font-medium dark:text-amber-400/70">Kulhydr.</p>
                                <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{plant.nutrition.carbG}</p>
                                <p className="text-[8px] text-amber-500/50">g</p>
                              </div>
                              <div className="rounded-lg bg-rose-50 border border-rose-200/40 px-1.5 py-1.5 text-center dark:bg-rose-900/20 dark:border-rose-800/30">
                                <p className="text-[9px] text-rose-600/70 font-medium dark:text-rose-400/70">Fedt</p>
                                <p className="text-sm font-bold text-rose-700 dark:text-rose-400">{plant.nutrition.fatG}</p>
                                <p className="text-[8px] text-rose-500/50">g</p>
                              </div>
                            </div>
                            {plant.nutrition.fiberG != null ? (
                              <p className="mt-1 text-foreground/50">🌾 Kostfibre: {plant.nutrition.fiberG} g</p>
                            ) : null}
                            {plant.nutrition.highlights ? (
                              <p className="mt-0.5 text-foreground/60 leading-snug">{plant.nutrition.highlights}</p>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Companions */}
                        {(plant.goodCompanions?.length || plant.badCompanions?.length) ? (
                          <div className="space-y-0.5 text-xs">
                            <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">🤝 Samdyrkning</p>
                            {plant.goodCompanions?.length ? (
                              <p className="text-green-700 dark:text-green-400">
                                ✓ {plant.goodCompanions.map((id) => getPlantById(id)?.name ?? id).join(", ")}
                              </p>
                            ) : null}
                            {plant.badCompanions?.length ? (
                              <p className="text-red-600 dark:text-red-400">
                                ✕ {plant.badCompanions.map((id) => getPlantById(id)?.name ?? id).join(", ")}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Rotation */}
                        {plant.rotationYears ? (
                          <p className="text-xs text-foreground/60">
                            🔄 Sædskifte: {plant.rotationYears} år
                          </p>
                        ) : null}

                        {/* Description */}
                        {plant.description ? (
                          <p className="text-xs text-foreground/60 italic">{plant.description}</p>
                        ) : null}

                        {/* ── PLACEMENT BADGES ── */}
                        <div className="space-y-1">
                          <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">📍 Placering</p>
                          <div className="flex flex-wrap gap-1">
                            {getDefaultPlacements(plant).map((pt) => (
                              <span
                                key={pt}
                                className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground/[0.03] px-2 py-0.5 text-[10px] text-foreground/60"
                              >
                                {PLACEMENT_ICONS[pt]} {PLACEMENT_LABELS[pt]}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* ── EDIT PLANT BUTTON ── */}
                        <button
                          type="button"
                          className="w-full rounded-md border border-foreground/15 px-2 py-1.5 text-xs text-foreground/60 hover:border-foreground/25 hover:bg-foreground/5 transition-all"
                          onClick={(e) => { e.stopPropagation(); setEditPlantSpeciesId(plant.id); setShowPlantEditor(true); }}
                        >
                          ✏️ Redigér {plant.name}
                        </button>

                        {/* ── VARIETIES / SORTER ── */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-foreground/50 font-medium text-[10px] uppercase tracking-wide">
                              🏷️ Sorter ({plant.varieties?.length ?? 0})
                            </p>
                            <button
                              type="button"
                              className="text-[10px] text-accent hover:text-accent-dark font-medium hover:underline"
                              onClick={(e) => { e.stopPropagation(); setVarietyManagerSpeciesId(plant.id); setShowVarietyManager(true); }}
                            >
                              ✏️ Administrer ›
                            </button>
                          </div>
                        </div>
                        {plant.varieties?.length ? (
                          <div className="space-y-1.5">
                            <div className="max-h-48 space-y-1 overflow-y-auto">
                              {plant.varieties.map((v) => (
                                <div
                                  key={v.id}
                                  className="rounded border border-foreground/10 bg-foreground/[0.02] px-2 py-1.5 space-y-0.5"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs font-medium text-foreground/90">{v.name}</p>
                                    {v.color ? <span className="text-[10px] text-foreground/40">({v.color})</span> : null}
                                  </div>
                                  {v.description ? (
                                    <p className="text-[10px] text-foreground/60">{v.description}</p>
                                  ) : null}
                                  <div className="flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-foreground/50">
                                    {v.taste ? <span>🍽️ {v.taste}</span> : null}
                                    {v.daysToHarvest ? <span>⏱️ {v.daysToHarvest} dage</span> : null}
                                    {v.spacingCm ? <span>↔️ {v.spacingCm} cm</span> : null}
                                    {v.storageQuality ? <span>📦 {v.storageQuality === "excellent" ? "Fremragende" : v.storageQuality === "good" ? "God" : v.storageQuality === "fair" ? "OK" : "Kort"}</span> : null}
                                    {v.resistances?.length ? <span>🛡️ {v.resistances.join(", ")}</span> : null}
                                  </div>

                                  {/* Quick-add variety to bed */}
                                  {selected && selectedCategory && canPlaceInCategory(plant, selectedCategory) ? (
                                    <button
                                      type="button"
                                      className="mt-1 w-full rounded border border-green-600/20 bg-green-50/50 px-1.5 py-1 text-[10px] font-medium text-green-800 hover:bg-green-100 dark:border-green-500/20 dark:bg-green-900/10 dark:text-green-300 dark:hover:bg-green-900/20"
                                      onClick={() => {
                                        const featureId = selected.feature.properties?.gardenosId;
                                        if (!featureId) return;
                                        addPlantInstance({
                                          id: crypto.randomUUID(),
                                          speciesId: plant.id,
                                          varietyId: v.id,
                                          varietyName: v.name,
                                          featureId,
                                          count: 1,
                                          plantedAt: new Date().toISOString().slice(0, 10),
                                          season: new Date().getFullYear(),
                                        });
                                        setPlantInstancesVersion((prev) => prev + 1);
                                      }}
                                    >
                                      + {v.name} → {selected.feature.properties?.name || "bed"}
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {/* Quick-add species (no specific variety) to selected bed */}
                        {selected && selectedCategory && canPlaceInCategory(plant, selectedCategory) ? (
                          <button
                            type="button"
                            className="w-full rounded-md border border-green-600/30 bg-green-50 px-2 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100 dark:border-green-500/30 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30"
                            onClick={() => {
                              const featureId = selected.feature.properties?.gardenosId;
                              if (!featureId) return;
                              addPlantInstance({
                                id: crypto.randomUUID(),
                                speciesId: plant.id,
                                featureId,
                                count: 1,
                                plantedAt: new Date().toISOString().slice(0, 10),
                                season: new Date().getFullYear(),
                              });
                              setPlantInstancesVersion((v) => v + 1);
                            }}
                          >
                            + Tilføj {plant.name} (uspecificeret sort) til {selected.feature.properties?.name || "valgt bed"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-foreground/40 leading-tight">
              📚 {allPlants.length} plantearter i databasen. Klik på en plante for at se detaljer.
              {selected && selectedCategory && selectedCategory !== "condition"
                ? ` Du kan tilføje planter direkte til det valgte ${CATEGORY_LABELS[selectedCategory as keyof typeof CATEGORY_LABELS] ?? "element"}.`
                : " Vælg et bed, række eller element på kortet for at tilføje planter."}
            </p>
          </div>
        ) : null}

        {sidebarTab === "view" ? (
          <div className="mt-3 space-y-3">
            {/* ── Bogmærker / Steder ── */}
            <div className="border-b border-border-light pb-3">
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-2">📍 Gemte steder</label>
              <p className="text-[10px] text-foreground/40 mb-2">Gem din nuværende kortvisning som et bogmærke – perfekt til hurtigt at hoppe mellem forskellige områder.</p>
              
              {bookmarks.length > 0 ? (
                <div className="space-y-1 mb-2">
                  {bookmarks.map((bm) => (
                    <div key={bm.id} className="flex items-center gap-1 rounded-lg border border-border bg-background p-1.5">
                      {editingBookmarkId === bm.id ? (
                        <>
                          <input
                            type="text"
                            className="w-8 text-center text-sm border border-border rounded px-0.5"
                            defaultValue={bm.emoji || "📍"}
                            onBlur={(e) => updateBookmark(bm.id, { emoji: e.target.value || "📍" })}
                          />
                          <input
                            type="text"
                            className="flex-1 text-xs border border-border rounded px-1.5 py-0.5"
                            defaultValue={bm.name}
                            onBlur={(e) => { updateBookmark(bm.id, { name: e.target.value || bm.name }); setEditingBookmarkId(null); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { updateBookmark(bm.id, { name: (e.target as HTMLInputElement).value || bm.name }); setEditingBookmarkId(null); } }}
                            autoFocus
                          />
                          <span className="text-[9px] text-foreground/40">z{bm.zoom.toFixed(0)}</span>
                          <button type="button" className="text-[10px] text-accent" onClick={() => setEditingBookmarkId(null)}>✓</button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="flex-1 text-left text-xs hover:text-accent transition-colors truncate"
                            onClick={() => goToLocation(bm.center[0], bm.center[1], bm.zoom)}
                            title={`Zoom ${bm.zoom.toFixed(1)}`}
                          >
                            {bm.emoji || "📍"} {bm.name}
                          </button>
                          <span className="text-[9px] text-foreground/30 shrink-0">z{bm.zoom.toFixed(0)}</span>
                          <button
                            type="button"
                            className="text-[10px] text-foreground/30 hover:text-accent px-0.5"
                            onClick={() => {
                              const map = mapRef.current;
                              if (map) updateBookmark(bm.id, { center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() });
                            }}
                            title="Opdater til nuværende visning"
                          >🔄</button>
                          <button type="button" className="text-[10px] text-foreground/30 hover:text-foreground/60 px-0.5" onClick={() => setEditingBookmarkId(bm.id)} title="Redigér">✏️</button>
                          <button type="button" className="text-[10px] text-foreground/30 hover:text-red-500 px-0.5" onClick={() => removeBookmark(bm.id)} title="Slet">🗑</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-foreground/30 italic mb-2">Ingen gemte steder endnu.</p>
              )}
              
              <div className="flex gap-1">
                <input
                  type="text"
                  className="w-8 shrink-0 text-center text-sm border border-border rounded-lg px-0.5 py-1"
                  value={newBookmarkEmoji}
                  onChange={(e) => setNewBookmarkEmoji(e.target.value)}
                  title="Vælg emoji"
                />
                <input
                  type="text"
                  className="flex-1 rounded-lg border border-border px-2 py-1 text-xs placeholder:text-foreground/30"
                  placeholder="Navn, f.eks. 'Køkkenhaven'…"
                  value={newBookmarkName}
                  onChange={(e) => setNewBookmarkName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newBookmarkName.trim()) {
                      addBookmark(newBookmarkName.trim(), newBookmarkEmoji);
                      setNewBookmarkName("");
                      setNewBookmarkEmoji("📍");
                    }
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent-dark font-medium hover:bg-accent/20 transition-colors disabled:opacity-40"
                  disabled={!newBookmarkName.trim()}
                  onClick={() => {
                    if (newBookmarkName.trim()) {
                      addBookmark(newBookmarkName.trim(), newBookmarkEmoji);
                      setNewBookmarkName("");
                      setNewBookmarkEmoji("📍");
                    }
                  }}
                >
                  + Gem
                </button>
              </div>
            </div>

            <div className="border-b border-border-light pb-3">
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-2">Baggrundskort</label>
              <div className="space-y-1.5">
              <button
                type="button"
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                  showSatellite
                    ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                    : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
                }`}
                onClick={() => setShowSatellite((v) => !v)}
              >
                🛰️ Satellit{showSatellite ? " (aktiv)" : ""}
              </button>
              <button
                type="button"
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                  showMatrikel && dfReady
                    ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                    : showMatrikel && !dfReady
                    ? "border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-900/20"
                    : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
                }`}
                onClick={() => setShowMatrikel((v) => !v)}
              >
                📐 Matrikel{showMatrikel && dfReady ? " (aktiv)" : showMatrikel ? " (mangler login)" : ""}
              </button>
              {showMatrikel ? (
                <div className="mt-1.5 space-y-1">
                  {!dfReady ? (
                    <p className="text-[10px] text-amber-600 leading-tight mb-1">
                      Kræver gratis Datafordeler-login. Opret dig på{" "}
                      <a href="https://selfservice.datafordeler.dk" target="_blank" rel="noopener noreferrer" className="underline">selfservice.datafordeler.dk</a>,
                      opret en <strong>tjenestebruger</strong> og giv den adgang til tjenesten <strong>MatGaeldendeOgForeloebigWMS</strong> under MATRIKLEN2.
                    </p>
                  ) : null}
                  <input
                    type="text"
                    placeholder="Tjenestebruger (brugernavn)"
                    value={dfUser}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDfUser(v);
                      setDfTestStatus("idle");
                      window.localStorage.setItem("gardenos:df:user", v);
                    }}
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-[11px] text-foreground/80 placeholder:text-foreground/30 focus:outline-none focus:border-foreground/40"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={dfPass}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDfPass(v);
                      setDfTestStatus("idle");
                      window.localStorage.setItem("gardenos:df:pass", v);
                    }}
                    className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-[11px] text-foreground/80 placeholder:text-foreground/30 focus:outline-none focus:border-foreground/40"
                  />
                  {dfReady ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={dfTestStatus === "testing"}
                        className="rounded border border-foreground/20 bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-foreground/70 hover:bg-foreground/10 disabled:opacity-50"
                        onClick={() => testDfCredentials(dfUser, dfPass)}
                      >
                        {dfTestStatus === "testing" ? "Tester…" : "Test forbindelse"}
                      </button>
                      {dfTestStatus === "ok" ? (
                        <span className="text-[10px] text-green-600 font-medium">✓ Forbindelse OK</span>
                      ) : dfTestStatus === "fail" ? (
                        <span className="text-[10px] text-red-500 font-medium">✗ Afvist — tjek brugernavn/password</span>
                      ) : null}
                    </div>
                  ) : null}
                  {dfTestStatus === "fail" ? (
                    <div className="rounded border border-amber-400/30 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 mt-0.5">
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight font-medium mb-0.5">Mulige årsager:</p>
                      <ul className="text-[10px] text-amber-600 dark:text-amber-400/80 leading-tight list-disc ml-3 space-y-0.5">
                        <li>Forkert brugernavn eller password</li>
                        <li>Tjenestebrugeren mangler adgang til tjenesten <strong>MatGaeldendeOgForeloebigWMS</strong></li>
                        <li>Gå til <a href="https://selfservice.datafordeler.dk" target="_blank" rel="noopener noreferrer" className="underline">selfservice.datafordeler.dk</a> → Tjenestebrugere → vælg din bruger → Tjenester → tilføj <strong>MatGaeldendeOgForeloebigWMS</strong></li>
                      </ul>
                      <button
                        type="button"
                        className="mt-1.5 rounded border border-foreground/20 bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-foreground/70 hover:bg-foreground/10"
                        onClick={() => {
                          setDfUser("RNIOENOTLD");
                          setDfPass("LaKage!7562Hesten");
                          setDfTestStatus("idle");
                          window.localStorage.setItem("gardenos:df:user", "RNIOENOTLD");
                          window.localStorage.setItem("gardenos:df:pass", "LaKage!7562Hesten");
                        }}
                      >
                        Prøv med demo-credentials i stedet
                      </button>
                    </div>
                  ) : null}
                  {dfReady && dfTestStatus === "ok" ? (
                    <p className="text-[10px] text-green-600">Matrikelskel vises på kortet (zoom ind for detaljer).</p>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                  showJordart
                    ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                    : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
                }`}
                onClick={() => setShowJordart((v) => !v)}
              >
                🌱 Jordart{showJordart ? " (aktiv)" : ""}
              </button>
              {showJordart ? (
                <p className="text-[10px] text-muted leading-tight mt-0.5 ml-1">
                  GEUS Jordartskort 1:25.000 — viser overfladegeologi / jordtyper. Zoom ind for detaljer.
                </p>
              ) : null}
              <button
                type="button"
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                  showTerrain
                    ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                    : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
                }`}
                onClick={() => setShowTerrain((v) => !v)}
              >
                ⛰️ Terrænrelief{showTerrain ? " (aktiv)" : ""}
              </button>
              {showTerrain ? (
                <p className="text-[10px] text-muted leading-tight mt-0.5 ml-1">
                  Danmarks Højdemodel — skyggekort der viser terrænets form og hældning.
                </p>
              ) : null}
              </div>
              <p className="text-[10px] text-muted leading-tight mt-2">
                ℹ️ Ledningsdata (el, vand, gas, kloak) er ikke offentligt tilgængeligt som kort. Brug <a href="https://ler.dk" target="_blank" rel="noopener noreferrer" className="underline">ler.dk</a> til ledningsoplysninger.
              </p>
            </div>
            <div className="border-t border-border-light pt-3">
            <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-2">Synlighed på kort</label>
            {(["element", "row", "seedbed", "container", "area", "condition"] as const).map((cat) => {
              const isCatHidden = hiddenCategories.has(cat);
              const kindsInCat = allKindDefsIncludingHidden.filter((d) => d.category === cat);
              const allKindsHidden = kindsInCat.length > 0 && kindsInCat.every((d) => hiddenVisibilityKinds.has(d.kind.toLowerCase()));
              return (
                <div key={cat}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                      isCatHidden
                        ? "border-border-light bg-background text-foreground/30 line-through"
                        : "border-border bg-accent-light/50 text-foreground/80"
                    }`}
                    onClick={() => {
                      setHiddenCategories((prev) => {
                        const next = new Set(prev);
                        if (next.has(cat)) next.delete(cat);
                        else next.add(cat);
                        return next;
                      });
                    }}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                  {!isCatHidden && kindsInCat.length > 0 ? (
                    <div className="mt-1 ml-2 flex flex-wrap gap-1">
                      {kindsInCat.length > 1 ? (
                        <button
                          type="button"
                          className="rounded border border-foreground/15 px-1.5 py-0.5 text-[10px] text-foreground/50 hover:bg-foreground/5"
                          onClick={() => {
                            setHiddenVisibilityKinds((prev) => {
                              const next = new Set(prev);
                              if (allKindsHidden) {
                                kindsInCat.forEach((d) => next.delete(d.kind.toLowerCase()));
                              } else {
                                kindsInCat.forEach((d) => next.add(d.kind.toLowerCase()));
                              }
                              saveHiddenVisKinds(next);
                              return next;
                            });
                          }}
                        >
                          {allKindsHidden ? "Vis alle" : "Skjul alle"}
                        </button>
                      ) : null}
                      {kindsInCat.map((def) => {
                        const isKindHidden = hiddenVisibilityKinds.has(def.kind.toLowerCase());
                        return (
                          <button
                            key={def.kind}
                            type="button"
                            className={`rounded border px-1.5 py-0.5 text-[10px] ${
                              isKindHidden
                                ? "border-foreground/10 bg-background text-foreground/30 line-through"
                                : "border-foreground/20 bg-foreground/5 text-foreground/70"
                            }`}
                            onClick={() => {
                              setHiddenVisibilityKinds((prev) => {
                                const next = new Set(prev);
                                if (next.has(def.kind.toLowerCase())) next.delete(def.kind.toLowerCase());
                                else next.add(def.kind.toLowerCase());
                                saveHiddenVisKinds(next);
                                return next;
                              });
                            }}
                          >
                            {def.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
            </div>
          </div>
        ) : null}
        </div>
      </aside>

      {/* ── Variety Manager Modal ── */}
      {showVarietyManager ? (
        <VarietyManager
          isOpen={showVarietyManager}
          onClose={() => setShowVarietyManager(false)}
          initialSpeciesId={varietyManagerSpeciesId}
          onDataChanged={() => setPlantDataVersion((v) => v + 1)}
        />
      ) : null}

      {/* ── Plant Editor Modal ── */}
      {showPlantEditor ? (
        <PlantEditor
          isOpen={showPlantEditor}
          onClose={() => setShowPlantEditor(false)}
          editSpeciesId={editPlantSpeciesId}
          onDataChanged={() => setPlantDataVersion((v) => v + 1)}
        />
      ) : null}
    </div>
  );
}
