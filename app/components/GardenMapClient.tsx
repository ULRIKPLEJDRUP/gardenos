"use client";

import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon } from "geojson";
import L from "leaflet";
import "leaflet-draw";
import "leaflet-path-drag";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, WMSTileLayer, useMap, useMapEvents } from "react-leaflet";
import {
  getAllPlants,
  getPlantById,
  getVarietiesForSpecies,
  getInstancesForFeature,
  loadPlantInstances,
  addPlantInstance,
  removePlantInstance,
  removeInstancesForFeature,
  removeOrphanedInstances,
  updatePlantInstance,
  checkCompanions,
  checkRotation,
  formatMonthRange,
  addOrUpdateCustomPlant,
  addVarietyToSpecies,
  getPlantRecommendations,
  RECOMMENDATION_STRATEGY_LABELS,
  type CompanionCheck,
  type RecommendationStrategy,
} from "../lib/plantStore";
import type { PlantSpecies, PlantInstance, PlantCategory, PlantVariety, PlacementType, ForestGardenLayer } from "../lib/plantTypes";
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
  canLayersCoexist,
  FOREST_GARDEN_LAYER_LABELS,
  FOREST_GARDEN_LAYER_DESC,
} from "../lib/plantTypes";
import VarietyManager from "./VarietyManager";
import PlantEditor from "./PlantEditor";
import IconPicker from "./IconPicker";
import YearWheel from "./YearWheel";
import TaskList from "./TaskList";
import { createTask, parseAiResponse } from "../lib/taskStore";
import {
  getInfraElementById,
  getInfraElementsForMode,
  ELEMENT_MODE_LABELS,
  ELEMENT_MODE_ICONS,
  type ElementModeKey,
} from "../lib/elementData";
import {
  fetchWeather,
  loadWeatherCache,
  isWeatherCacheFresh,
  buildWeatherContextString,
  getWeatherEmoji,
  getWeatherLabel,
  computeWeatherStats,
  loadWeatherHistory,
  getHistorySlice,
  type WeatherData,
} from "../lib/weatherStore";

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
  row: "Rækker – indeholder elementer",
  seedbed: "Såbede – indeholder rækker, containere, elementer",
  container: "Bed, krukker, højbede – indeholder elementer",
  area: "Område – indeholder såbede, containere, rækker, elementer",
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

  // ── Auto-row parent tracking ──
  parentBedId?: string;   // gardenosId of the bed this row was created in
  rowDirection?: "length" | "width"; // direction rows run in the parent bed

  // ── Photo ──
  photoUrl?: string;      // data-URL or external URL of attached photo

  // ── Seedbed-specific ──
  sowingMethod?: string;  // såmetode (bredsåning/rækkesåning/priklet)
  bedSeason?: string;     // sæson/år for bedet

  // ── Container-specific (also used by seedbed) ──
  soilType?: string;      // jordtype i containeren / såbedet
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
const STORAGE_ANCHORS_KEY = "gardenos:anchors:v1";
const STORAGE_SCAN_HISTORY_KEY = "gardenos:scanHistory:v1";

// ---------------------------------------------------------------------------
// Scan History – persistent library of all scanned items
// ---------------------------------------------------------------------------
type ScanType = "seed-packet" | "plant-photo" | "product";

interface ScanHistoryItem {
  id: string;
  type: ScanType;
  /** Base64 thumbnail (resized to save storage) */
  thumbnail: string;
  /** Raw AI result data */
  data: Record<string, unknown>;
  /** Display name (species or product name) */
  name: string;
  /** ISO date string */
  scannedAt: string;
  /** Has this been transferred to the plant database? */
  transferred?: boolean;
  /** Which plant category was it transferred as? */
  transferredAs?: string;
}

function loadScanHistory(): ScanHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_SCAN_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ScanHistoryItem[];
  } catch { return []; }
}

function saveScanHistory(items: ScanHistoryItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_SCAN_HISTORY_KEY, JSON.stringify(items));
}

/** Resize a base64 data-URL image to max 200px for thumbnail storage */
function createThumbnail(dataUrl: string, maxSize = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(dataUrl.slice(0, 500)); // fallback
    img.src = dataUrl;
  });
}

interface MapBookmark {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  emoji?: string;
  favorite?: boolean;
}

function loadBookmarks(): MapBookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_BOOKMARKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MapBookmark[];
    // Migrate: old bookmarks without favorite field default to true
    return parsed.map((b) => (b.favorite === undefined ? { ...b, favorite: true } : b));
  } catch { return []; }
}

function saveBookmarks(bookmarks: MapBookmark[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

// ---------------------------------------------------------------------------
// Anchor-point system – fixed reference points for trilateration
// ---------------------------------------------------------------------------
interface AnchorPoint {
  id: string;
  name: string;
  emoji: string;
  lat: number;
  lng: number;
  /** Optional description / physical marker */
  description?: string;
}

function loadAnchors(): AnchorPoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_ANCHORS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AnchorPoint[];
  } catch { return []; }
}

function saveAnchors(anchors: AnchorPoint[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_ANCHORS_KEY, JSON.stringify(anchors));
}

/**
 * Trilateration: given two anchor points and distances (meters) from each,
 * compute the two candidate points and return the one closest to the midpoint
 * of the anchors (typically the "garden-side" solution).
 *
 * Uses a local Cartesian approximation (metres per degree at the anchor latitude).
 */
function trilaterate(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  distA: number,
  distB: number,
): { lat: number; lng: number } | null {
  // metres per degree at the average latitude
  const midLat = (a.lat + b.lat) / 2;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((midLat * Math.PI) / 180);

  // convert to local metres
  const ax = 0;
  const ay = 0;
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;

  const d = Math.sqrt(bx * bx + by * by); // distance between anchors in m
  if (d < 0.01) return null; // anchors on top of each other
  if (distA + distB < d - 0.01) return null; // no intersection — too far apart
  if (Math.abs(distA - distB) > d + 0.01) return null; // one circle inside the other

  const r1 = distA;
  const r2 = distB;

  // Intersection of two circles centred at A=(0,0) and B=(bx,by)
  const a2 = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a2 * a2;
  if (hSq < 0) return null;
  const h = Math.sqrt(Math.max(0, hSq));

  // unit vector A→B and perpendicular
  const ux = bx / d;
  const uy = by / d;

  const px = ax + a2 * ux;
  const py = ay + a2 * uy;

  const candidate1 = { x: px + h * (-uy), y: py + h * ux };
  const candidate2 = { x: px - h * (-uy), y: py - h * ux };

  // Midpoint of A-B in local coords
  const mx = bx / 2;
  const my = by / 2;

  // Pick the candidate closest to the midpoint (most likely inside the garden)
  const d1 = (candidate1.x - mx) ** 2 + (candidate1.y - my) ** 2;
  const d2 = (candidate2.x - mx) ** 2 + (candidate2.y - my) ** 2;
  const chosen = d1 <= d2 ? candidate1 : candidate2;

  return {
    lat: a.lat + chosen.y / mPerDegLat,
    lng: a.lng + chosen.x / mPerDegLng,
  };
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
    const validCats: GardenFeatureCategory[] = ["area", "seedbed", "row", "container", "element", "condition"];
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

// ---------------------------------------------------------------------------
// Geometry helpers for auto-placing rows inside a polygon
// ---------------------------------------------------------------------------

/** Clip a line segment against a polygon ring (any 2D coords), returning clipped segment or null. */
function clipLineToPolygon(
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

type AutoRowResult = {
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

/**
 * Detect the direction of existing rows in a bed.
 * Returns "length" | "width" | null (null = no existing rows).
 * Uses dot product of each row's direction vs bed's longest edge.
 */
function detectExistingRowDirection(
  ring: [number, number][],
  existingRows: [number, number][][],
): "length" | "width" | null {
  if (ring.length < 3 || existingRows.length === 0) return null;

  const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const midLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const M_PER_DEG_LAT = 111_320;
  const M_PER_DEG_LNG = 111_320 * Math.cos((midLat * Math.PI) / 180);

  const mRing: [number, number][] = ring.map(([lng, lat]) => [
    (lng - midLng) * M_PER_DEG_LNG,
    (lat - midLat) * M_PER_DEG_LAT,
  ]);

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
    const rdx = (row[1][0] - row[0][0]) * M_PER_DEG_LNG;
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
type OccupiedSlot = { offset: number; halfExclusion: number };

function getExistingRowOffsetsInBed(
  ring: [number, number][],
  existingRows: [number, number][][],  // each row is [[lng,lat],[lng,lat]]
  direction: "length" | "width" = "length",
  /** rowSpacingCm per existing row (parallel array). If missing, default 30cm. */
  existingRowSpacingsCm?: number[],
): OccupiedSlot[] {
  if (ring.length < 3 || existingRows.length === 0) return [];

  const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const midLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const M_PER_DEG_LAT = 111_320;
  const M_PER_DEG_LNG = 111_320 * Math.cos((midLat * Math.PI) / 180);

  const mRing: [number, number][] = ring.map(([lng, lat]) => [
    (lng - midLng) * M_PER_DEG_LNG,
    (lat - midLat) * M_PER_DEG_LAT,
  ]);

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
      (rowCoords[0][0] - midLng) * M_PER_DEG_LNG,
      (rowCoords[0][1] - midLat) * M_PER_DEG_LAT,
    ];
    const mP1: [number, number] = [
      (rowCoords[1][0] - midLng) * M_PER_DEG_LNG,
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
// Plant conflict detection — scans ALL point features for spacing,
// companion, and layer competition problems.
// ═══════════════════════════════════════════════════════════════════════════

type PlantConflict = {
  type: "spacing" | "bad-companion" | "layer-competition";
  /** Severity 1 = info, 2 = warning, 3 = error */
  severity: 1 | 2 | 3;
  featureIdA: string;
  featureIdB: string;
  speciesA: PlantSpecies;
  speciesB: PlantSpecies;
  distanceM: number;
  requiredM: number;
  message: string;
  suggestion: string;
};

/**
 * Haversine distance between two [lng, lat] points, in metres.
 */
function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Detect all pairwise plant conflicts among point features.
 * Returns an array of PlantConflict objects.
 */
function detectPlantConflicts(features: GardenFeature[]): PlantConflict[] {
  // Collect point features with a species
  const points: { id: string; coords: [number, number]; species: PlantSpecies }[] = [];
  for (const f of features) {
    if (f.geometry?.type !== "Point") continue;
    const sid = f.properties?.speciesId;
    if (!sid) continue;
    const sp = getPlantById(sid);
    if (!sp) continue;
    const coords = f.geometry.coordinates as [number, number];
    points.push({ id: f.properties!.gardenosId, coords, species: sp });
  }

  const conflicts: PlantConflict[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const dist = haversineM(a.coords, b.coords);
      const pairKey = [a.id, b.id].sort().join(":");

      // 1. Spacing conflict: check recommended spacing between both species
      const spreadA = (a.species.spreadDiameterCm ?? a.species.spacingCm ?? 30) / 100;
      const spreadB = (b.species.spreadDiameterCm ?? b.species.spacingCm ?? 30) / 100;
      // Required distance = half spread A + half spread B (canopy edges shouldn't overlap for competing layers)
      let requiredM: number;
      const layerA = a.species.forestGardenLayer;
      const layerB = b.species.forestGardenLayer;
      const layersCoexist = layerA && layerB && canLayersCoexist(layerA, layerB);

      if (layersCoexist) {
        // Compatible layers: only need trunk clearance
        const trunkA = getTrunkExclusionRadiusM(a.species);
        const trunkB = getTrunkExclusionRadiusM(b.species);
        requiredM = trunkA + trunkB;
      } else {
        // Same or competing layers: need full spacing
        requiredM = spreadA / 2 + spreadB / 2;
      }

      if (dist < requiredM * 0.95 && !seen.has(pairKey + ":spacing")) {
        seen.add(pairKey + ":spacing");
        const isSameSpecies = a.species.id === b.species.id;
        const ratio = dist / requiredM;
        const severity: 1 | 2 | 3 = ratio < 0.4 ? 3 : ratio < 0.7 ? 2 : 1;
        conflicts.push({
          type: "spacing",
          severity,
          featureIdA: a.id,
          featureIdB: b.id,
          speciesA: a.species,
          speciesB: b.species,
          distanceM: dist,
          requiredM,
          message: isSameSpecies
            ? `${a.species.icon ?? "🌱"} To ${a.species.name} står for tæt (${dist.toFixed(1)}m / anbefalet ${requiredM.toFixed(1)}m)`
            : `${a.species.icon ?? "🌱"} ${a.species.name} og ${b.species.icon ?? "🌱"} ${b.species.name} står for tæt (${dist.toFixed(1)}m / ${requiredM.toFixed(1)}m)`,
          suggestion: isSameSpecies
            ? `Anbefalet afstand for ${a.species.name}: ${requiredM.toFixed(1)}m. Flyt den ene, eller planlæg at fælde/flytte den når de vokser sig store.`
            : `Flyt den ene plante mindst ${(requiredM - dist).toFixed(1)}m længere væk.`,
        });
      }

      // 2. Bad companion conflict
      const isBadCompanion = a.species.badCompanions?.includes(b.species.id) || b.species.badCompanions?.includes(a.species.id);
      if (isBadCompanion && !seen.has(pairKey + ":companion")) {
        seen.add(pairKey + ":companion");
        // Only flag if they're within a reasonable "influence" distance (e.g. max of both spreads * 1.5)
        const influenceM = Math.max(spreadA, spreadB) * 1.5;
        if (dist < influenceM) {
          conflicts.push({
            type: "bad-companion",
            severity: 2,
            featureIdA: a.id,
            featureIdB: b.id,
            speciesA: a.species,
            speciesB: b.species,
            distanceM: dist,
            requiredM: influenceM,
            message: `⛔ ${a.species.icon ?? "🌱"} ${a.species.name} og ${b.species.icon ?? "🌱"} ${b.species.name} trives ikke sammen`,
            suggestion: `Disse planter hæmmer hinanden. Flyt dem til forskellige bede eller placer dem mindst ${influenceM.toFixed(1)}m fra hinanden.`,
          });
        }
      }

      // 3. Layer competition (same layer, different species, close proximity)
      if (layerA && layerB && layerA === layerB && a.species.id !== b.species.id) {
        // They compete at the same vertical layer
        const competitionDist = (spreadA / 2 + spreadB / 2) * 0.8;
        if (dist < competitionDist && !seen.has(pairKey + ":layer")) {
          seen.add(pairKey + ":layer");
          conflicts.push({
            type: "layer-competition",
            severity: 1,
            featureIdA: a.id,
            featureIdB: b.id,
            speciesA: a.species,
            speciesB: b.species,
            distanceM: dist,
            requiredM: competitionDist,
            message: `⚠️ ${a.species.icon ?? "🌱"} ${a.species.name} og ${b.species.icon ?? "🌱"} ${b.species.name} konkurrerer i samme lag (${FOREST_GARDEN_LAYER_LABELS[layerA]})`,
            suggestion: `Begge er i ${FOREST_GARDEN_LAYER_LABELS[layerA]}-laget. Den ene vil sandsynligvis dominere. Overvej at flytte den ene eller vælge en art i et andet lag.`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Check if a PROPOSED placement at [lng, lat] for a species would cause conflicts.
 * Returns conflicts (preview, no featureIdA).
 */
function checkPlacementConflicts(
  proposedCoords: [number, number],
  proposedSpecies: PlantSpecies,
  existingFeatures: GardenFeature[],
): PlantConflict[] {
  const conflicts: PlantConflict[] = [];
  const spreadNew = (proposedSpecies.spreadDiameterCm ?? proposedSpecies.spacingCm ?? 30) / 100;
  const layerNew = proposedSpecies.forestGardenLayer;

  for (const f of existingFeatures) {
    if (f.geometry?.type !== "Point") continue;
    const sid = f.properties?.speciesId;
    if (!sid) continue;
    const sp = getPlantById(sid);
    if (!sp) continue;
    const coords = f.geometry.coordinates as [number, number];
    const dist = haversineM(proposedCoords, coords);

    const spreadOther = (sp.spreadDiameterCm ?? sp.spacingCm ?? 30) / 100;
    const layerOther = sp.forestGardenLayer;
    const layersCoexist = layerNew && layerOther && canLayersCoexist(layerNew, layerOther);

    // Spacing check
    let requiredM: number;
    if (layersCoexist) {
      const trunkNew = getTrunkExclusionRadiusM(proposedSpecies);
      const trunkOther = getTrunkExclusionRadiusM(sp);
      requiredM = trunkNew + trunkOther;
    } else {
      requiredM = spreadNew / 2 + spreadOther / 2;
    }

    if (dist < requiredM * 0.95) {
      const ratio = dist / requiredM;
      conflicts.push({
        type: "spacing",
        severity: ratio < 0.4 ? 3 : ratio < 0.7 ? 2 : 1,
        featureIdA: "__proposed__",
        featureIdB: f.properties!.gardenosId,
        speciesA: proposedSpecies,
        speciesB: sp,
        distanceM: dist,
        requiredM,
        message: `For tæt på ${sp.icon ?? "🌱"} ${sp.name} (${dist.toFixed(1)}m / ${requiredM.toFixed(1)}m)`,
        suggestion: `Anbefalet afstand: ${requiredM.toFixed(1)}m`,
      });
    }

    // Bad companion
    if (proposedSpecies.badCompanions?.includes(sp.id) || sp.badCompanions?.includes(proposedSpecies.id)) {
      const influenceM = Math.max(spreadNew, spreadOther) * 1.5;
      if (dist < influenceM) {
        conflicts.push({
          type: "bad-companion",
          severity: 2,
          featureIdA: "__proposed__",
          featureIdB: f.properties!.gardenosId,
          speciesA: proposedSpecies,
          speciesB: sp,
          distanceM: dist,
          requiredM: influenceM,
          message: `⛔ Dårlig nabo: ${sp.icon ?? "🌱"} ${sp.name}`,
          suggestion: `Disse arter hæmmer hinanden.`,
        });
      }
    }
  }

  return conflicts;
}

/**
 * 2D obstacle circle in geo-coordinates [lng, lat] + radius in meters.
 * Used for bushes, trees, infrastructure elements placed inside beds.
 * Auto-rows are clipped (shortened/split) around these circles.
 */
type Obstacle2D = {
  center: [number, number];   // [lng, lat]
  radiusM: number;            // full canopy/spread exclusion radius in meters
  trunkRadiusM: number;       // trunk-only exclusion radius (used when layers coexist)
  label: string;              // display name for warnings
  layer?: ForestGardenLayer;  // forest garden layer (for coexistence check)
};

/**
 * Compute a smart edge margin (cm) for auto-element placement.
 *
 * Trees / canopy layers: the canopy extends HIGH above ground and can overhang
 * the bed boundary — only the trunk/root zone needs to be inside the bed.
 * Shrubs: lower canopy, partially extends over boundaries — moderate margin.
 * Other (herbs, ground-cover): full half-spread so the plant stays inside the bed.
 */
function computeSmartEdgeMarginCm(sp: { spreadDiameterCm?: number; spacingCm?: number; forestGardenLayer?: ForestGardenLayer; category?: string }): number {
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
 * Estimate trunk-only exclusion radius in meters for a species.
 * Used when two plants occupy compatible forest-garden layers: you can plant
 * ground-cover UNDER a tree canopy, but not literally on top of the trunk.
 */
function getTrunkExclusionRadiusM(sp: { spreadDiameterCm?: number; spacingCm?: number; forestGardenLayer?: ForestGardenLayer; category?: string }): number {
  const spreadCm = sp.spreadDiameterCm ?? sp.spacingCm ?? 30;
  const layer = sp.forestGardenLayer;
  const cat = sp.category;

  if (layer === "canopy" || cat === "tree") {
    // Large tree trunk ≈ 5 % of canopy diameter, minimum 25 cm radius
    return Math.max(0.25, (spreadCm * 0.05) / 100);
  }
  if (layer === "sub-canopy") {
    return Math.max(0.20, (spreadCm * 0.06) / 100);
  }
  if (layer === "shrub" || cat === "bush") {
    // Shrub stem zone ≈ 15 % of spread diameter, minimum 10 cm
    return Math.max(0.10, (spreadCm * 0.15) / 100);
  }
  // Default: use full radius (no meaningful trunk/canopy distinction)
  return Math.max(0.15, spreadCm / 200);
}

/**
 * Compute the exclusion radius in meters for a feature inside a bed.
 * Returns both the full canopy/spread radius and a trunk-only radius.
 * Uses spreadDiameterCm → spacingCm → rowSpacingCm → category-based default.
 */
function getFeatureExclusionRadiusM(
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

/**
 * Subtract a circle from a line segment, producing 0–2 sub-segments.
 * All coordinates in metric space (meters).
 */
function subtractCircleFromSegment(
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
function subtractObstaclesFromSegment(
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
// Auto-element placement (2D point packing inside a polygon)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of auto-element computation.
 */
type AutoElementResult = {
  positions: [number, number][];  // [lng, lat][] of placed elements
  bedAreaM2: number;
  spacingCm: number;              // inter-element spacing used
  edgeMarginCm: number;
  maxElements: number;            // max that fit in bed
  warning: string | null;
  obstacleWarnings: string[];
};

/**
 * A row obstacle: a line segment with a buffer zone around it.
 * Used so auto-placed elements keep distance from existing rows.
 */
type RowObstacle2D = {
  coords: [number, number][];    // [lng, lat][] — the row polyline
  halfWidthM: number;            // buffer distance from line center
  label: string;
};

/** Distance from a point to a line segment (all in metric space). */
function distPointToSegmentM(
  pt: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.sqrt((pt[0] - a[0]) ** 2 + (pt[1] - a[1]) ** 2);
  let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  return Math.sqrt((pt[0] - px) ** 2 + (pt[1] - py) ** 2);
}

/** Point-in-polygon for metric coordinates (ray casting). */
function pointInMetricRing(pt: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Minimum distance from a point to the nearest polygon edge (metric). */
function distToPolygonEdgeM(pt: [number, number], ring: [number, number][]): number {
  let minDist = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const d = distPointToSegmentM(pt, ring[i], ring[j]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Compute auto-element positions inside a polygon bed.
 * Uses a hexagonal grid for optimal packing, then filters candidates against
 * polygon boundary, edge margin, existing circle obstacles and row obstacles.
 */
function computeAutoElements(
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
  const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const midLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const M_PER_DEG_LAT = 111_320;
  const M_PER_DEG_LNG = 111_320 * Math.cos((midLat * Math.PI) / 180);

  const mRing: [number, number][] = ring.map(([lng, lat]) => [
    (lng - midLng) * M_PER_DEG_LNG,
    (lat - midLat) * M_PER_DEG_LAT,
  ]);

  // Convert circle obstacles to metric
  const mCircles = circleObstacles.map((o) => ({
    center: [
      (o.center[0] - midLng) * M_PER_DEG_LNG,
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
      (lng - midLng) * M_PER_DEG_LNG,
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
    x / M_PER_DEG_LNG + midLng,
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

/**
 * Generate parallel row polylines inside a polygon.
 * All geometry is done in a local metric coordinate system (meters from centroid)
 * so that lat/lng anisotropy never causes rows to stack.
 *
 * When occupiedSlots is provided, those perpendicular positions are treated as
 * already taken — new rows will only be placed in free slots.
 */
function computeAutoRows(
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
  const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const midLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const M_PER_DEG_LAT = 111_320;
  const M_PER_DEG_LNG = 111_320 * Math.cos((midLat * Math.PI) / 180);

  const mRing: [number, number][] = ring.map(([lng, lat]) => [
    (lng - midLng) * M_PER_DEG_LNG,
    (lat - midLat) * M_PER_DEG_LAT,
  ]);

  // Convert 2D obstacles to metric space
  const mObstacles: { center: [number, number]; radiusM: number; label: string }[] =
    obstacles2D.map((o) => ({
      center: [
        (o.center[0] - midLng) * M_PER_DEG_LNG,
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
          seg[0][0] / M_PER_DEG_LNG + midLng,
          seg[0][1] / M_PER_DEG_LAT + midLat,
        ];
        const ll1: [number, number] = [
          seg[1][0] / M_PER_DEG_LNG + midLng,
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

// ── Bed-resize row-adjustment types & helpers ──
type BedResizeRowChange = {
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

type BedResizeProposal = {
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
function computeBedResizeProposal(
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
    const M_PER_DEG_LAT = 111_320;
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

type ContainmentCounts = {
  elements: number;
  containers: number;
  seedbeds: number;
  rows: number;
  areas: number;
  conditions: number;
  infra: number;
  total: number;
};

type ContainmentResult = {
  countsByContainerId: Map<string, ContainmentCounts>;
  childIdsByContainerId: Map<string, string[]>;
};

// ── Containment hierarchy ──
// Område > Såbed > Container ≈ Række > Element
// Each level can only contain levels below it.
const CATEGORY_HIERARCHY: Record<string, number> = {
  area: 0,      // Område — can contain everything below
  seedbed: 1,   // Såbed — can contain container, row, element
  container: 2, // Container — can contain element only
  row: 2,       // Række — can contain element only (same level as container)
  element: 3,   // Element — leaf
  condition: 4, // Særligt forhold — overlay, not a real container
};

function canContainCategory(parentCat: string, childCat: string): boolean {
  const pLevel = CATEGORY_HIERARCHY[parentCat] ?? 99;
  const cLevel = CATEGORY_HIERARCHY[childCat] ?? 99;
  // A parent can only contain children at a strictly lower hierarchy level
  return pLevel < cLevel;
}

function computeContainment(layout: GardenFeatureCollection | null): ContainmentResult {
  const countsByContainerId = new Map<string, ContainmentCounts>();
  const childIdsByContainerId = new Map<string, string[]>();

  if (!layout?.features?.length) return { countsByContainerId, childIdsByContainerId };

  const normalized = layout.features.map((f) => ensureDefaultProperties(f as GardenFeature));

  // Areas, seedbeds, containers, and rows can all contain children
  const parentPolygons = normalized
    .filter((f) => {
      if (!isPolygon(f)) return false;
      const cat = f.properties?.category ?? "element";
      return cat === "area" || cat === "seedbed" || cat === "container" || cat === "row";
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
    const next: ContainmentCounts = { elements: 0, containers: 0, seedbeds: 0, rows: 0, areas: 0, conditions: 0, infra: 0, total: 0 };
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

    const childCat = feature.properties?.category ?? defaultCategoryForGeometry(feature.geometry);

    const candidates: { id: string; area: number; category: string }[] = [];
    for (const c of parentMeta) {
      if (c.id === gardenosId) continue;
      // Enforce hierarchy: parent must be allowed to contain this child’s category
      if (!canContainCategory(c.category, childCat)) continue;
      let inside = false;
      if (isPoint(feature)) inside = polygonContainsPointFeature(c.feature, feature);
      else if (isLineString(feature)) inside = polygonContainsLineStringFeature(c.feature, feature);
      else if (isPolygon(feature)) inside = polygonContainsPolygonFeature(c.feature, feature);
      if (inside) candidates.push({ id: c.id, area: c.area, category: c.category });
    }
    if (candidates.length === 0) continue;

    // Choose the smallest containing polygon => the most specific parent.
    candidates.sort((a, b) => (a.area || Number.POSITIVE_INFINITY) - (b.area || Number.POSITIVE_INFINITY));
    const parentId = candidates[0].id;

    pushChild(parentId, gardenosId);
    const counts = ensureCounts(parentId);
    counts.total += 1;

    const sg = subGroupForKind(feature.properties?.kind);

    if (childCat === "element" && sg === "infra") counts.infra += 1;
    else if (childCat === "element") counts.elements += 1;
    else if (childCat === "container") counts.containers += 1;
    else if (childCat === "seedbed") counts.seedbeds += 1;
    else if (childCat === "row") counts.rows += 1;
    else if (childCat === "area") counts.areas += 1;
    else if (childCat === "condition") counts.conditions += 1;
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
      scaleControlRef.current = L.control.scale({
        imperial: false,
        metric: true,
        maxWidth: 200,         // wider bar = finer resolution at high zoom
        position: "bottomleft",
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [sidebarTab, setSidebarTab] = useState<"create" | "content" | "groups" | "plants" | "view" | "scan" | "chat" | "calendar" | "tasks">("create");
  const [viewSubTab, setViewSubTab] = useState<"steder" | "baggrund" | "synlighed" | "ankre">("steder");

  // ── Draft state for name/notes (commit on blur/Enter, not per-keystroke) ──
  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const draftNameDirty = selected ? draftName !== (selected.feature.properties?.name ?? "") : false;
  const draftNotesDirty = selected ? draftNotes !== (selected.feature.properties?.notes ?? "") : false;

  // ── Task list state ──
  const [taskVersion, setTaskVersion] = useState(0);
  const [taskSavedFlash, setTaskSavedFlash] = useState<string | false>(false);

  // ── Scan / frøpose-genkendelse state ──
  const [scanMode, setScanMode] = useState<"seed-packet" | "identify">("seed-packet");
  const [scanImage, setScanImage] = useState<string | null>(null);
  const [scanAnalyzing, setScanAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<Record<string, unknown> | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSaved, setScanSaved] = useState(false);
  const [scanSaveExpanded, setScanSaveExpanded] = useState(false);
  const [scanSaveCategory, setScanSaveCategory] = useState<PlantCategory>("bush");
  const scanInputRef = useRef<HTMLInputElement>(null);

  // ── Scan history (bibliotek) ──
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>(() => loadScanHistory());
  const [scanSubTab, setScanSubTab] = useState<"scan" | "library">("scan");
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [transferCategory, setTransferCategory] = useState<PlantCategory>("vegetable");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [confirmDeleteHistoryId, setConfirmDeleteHistoryId] = useState<string | null>(null);

  // ── Mobile sidebar state ──
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const openMobileSidebar = useCallback((tab?: typeof sidebarTab) => {
    if (tab) setSidebarTab(tab);
    setMobileSidebarOpen(true);
  }, []);
  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  // ── AI Chat / Rådgiver state ──
  type ChatMsg = { role: "user" | "assistant"; content: string; ts: number };
  const CHAT_STORAGE_KEY = "gardenos:chat:history:v1";
  const CHAT_PERSONA_KEY = "gardenos:chat:persona:v1";

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => {
    if (typeof window === "undefined") return [];
    try { const raw = localStorage.getItem(CHAT_STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatPersona, setChatPersona] = useState<string>(() => {
    if (typeof window === "undefined") return "generalist";
    return localStorage.getItem(CHAT_PERSONA_KEY) ?? "generalist";
  });
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Weather module state ──
  const [weatherData, setWeatherData] = useState<WeatherData | null>(() => loadWeatherCache());
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherExpanded, setWeatherExpanded] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherHistory, setWeatherHistory] = useState(() => loadWeatherHistory());
  const [weatherStatRange, setWeatherStatRange] = useState<number>(30);

  // Fetch weather on mount + every 30 min
  useEffect(() => {
    const doFetch = async () => {
      // Get lat/lng from saved view
      const viewRaw = localStorage.getItem("gardenos:view:v1");
      let lat = 55.676;
      let lng = 12.568; // default: Copenhagen
      if (viewRaw) {
        try {
          const v = JSON.parse(viewRaw) as { center?: [number, number] };
          if (v.center) { lat = v.center[0]; lng = v.center[1]; }
        } catch { /* use default */ }
      }

      const cached = loadWeatherCache();
      if (isWeatherCacheFresh(cached)) {
        setWeatherData(cached);
        return;
      }

      setWeatherLoading(true);
      setWeatherError(null);
      try {
        const data = await fetchWeather(lat, lng);
        setWeatherData(data);
        setWeatherHistory(loadWeatherHistory());
      } catch (err) {
        setWeatherError(err instanceof Error ? err.message : "Vejrdata kunne ikke hentes");
        if (cached) setWeatherData(cached); // use stale cache
      } finally {
        setWeatherLoading(false);
      }
    };

    doFetch();
    const interval = setInterval(doFetch, 30 * 60 * 1000); // 30 min
    return () => clearInterval(interval);
  }, []);

  const weatherStats = useMemo(() => {
    const slice = getHistorySlice(weatherHistory, weatherStatRange);
    if (!slice.length) return null;
    return { stats: computeWeatherStats(slice), count: slice.length };
  }, [weatherHistory, weatherStatRange]);

  // Persist chat messages
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages));
  }, [chatMessages]);

  // Persist persona choice
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CHAT_PERSONA_KEY, chatPersona);
  }, [chatPersona]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatLoading]);

  const estimateDanishClimateZone = useCallback((lat: number, _lng: number) => {
    // Simple USDA-style estimate for Denmark based on latitude.
    // North = slightly colder, South = slightly milder.
    if (lat >= 57.4) return "7a";
    if (lat >= 56.6) return "7b";
    return "8a";
  }, []);

  // Build garden context string for AI
  const buildGardenContext = useCallback(() => {
    const parts: string[] = [];

    // 0. Time + location + climate zone (critical for sowing/planting timing)
    try {
      const now = new Date();
      const nowDate = new Intl.DateTimeFormat("da-DK", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Europe/Copenhagen",
      }).format(now);

      const month = Number(
        new Intl.DateTimeFormat("en-GB", {
          month: "numeric",
          timeZone: "Europe/Copenhagen",
        }).format(now)
      );

      const viewRaw = localStorage.getItem("gardenos:view:v1");
      let locationLine = "Lokation ukendt";

      if (viewRaw) {
        const view = JSON.parse(viewRaw) as { center?: [number, number]; zoom?: number };
        const lat = Number(view?.center?.[0]);
        const lng = Number(view?.center?.[1]);

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const zone = estimateDanishClimateZone(lat, lng);
          locationLine = `Koordinater: ${lat.toFixed(5)}, ${lng.toFixed(5)} (estimeret klimazone: ${zone})`;
        }
      }

      const bookmarkRaw = localStorage.getItem("gardenos:bookmarks:v1");
      let addressHint = "";
      if (bookmarkRaw) {
        const bms = JSON.parse(bookmarkRaw) as Array<{ name?: string; favorite?: boolean }>;
        const primary = bms.find((b) => b.favorite && b.name) ?? bms.find((b) => b.name);
        if (primary?.name) {
          addressHint = `\nSted/adressehint: ${primary.name}`;
        }
      }

      parts.push(
        `Nuværende dato/tid (Danmark): ${nowDate}\nMånedstal: ${month}\n${locationLine}${addressHint}`
      );
    } catch {
      // ignore
    }

    // 1. Garden features (beds, areas, elements)
    try {
      const layoutRaw = localStorage.getItem("gardenos:layout:v1");
      if (layoutRaw) {
        const layout = JSON.parse(layoutRaw);
        if (layout?.features?.length) {
          const featureSummaries = layout.features.map((f: GardenFeature) => {
            const p = f.properties;
            const name = p.name || p.kind || "Unavngivet";
            const cat = p.category || "";
            const planted = p.planted ? `, plantet: ${p.planted}` : "";
            const species = p.speciesId ? `, art-id: ${p.speciesId}` : "";
            return `- ${name} (${cat}${planted}${species})`;
          });
          parts.push(`Haven har ${layout.features.length} elementer:\n${featureSummaries.join("\n")}`);
        }
      }
    } catch { /* ignore */ }

    // 2. Plant instances with FULL species data (harvest, sowing, etc.)
    try {
      const instancesRaw = localStorage.getItem("gardenos:plants:instances:v1");
      if (instancesRaw) {
        const instances = JSON.parse(instancesRaw) as Array<{
          speciesId?: string; varietyId?: string; varietyName?: string;
          featureId?: string; count?: number; plantedAt?: string; notes?: string;
        }>;
        if (instances.length > 0) {
          // Build a lookup: featureId → name
          const featureNames = new Map<string, string>();
          try {
            const lr = localStorage.getItem("gardenos:layout:v1");
            if (lr) {
              const lj = JSON.parse(lr);
              for (const f of lj?.features ?? []) {
                const id = f.properties?.gardenosId;
                const nm = f.properties?.name || f.properties?.kind || "Unavngivet";
                if (id) featureNames.set(id, nm);
              }
            }
          } catch { /* ignore */ }

          // Group instances by species and enrich with full PlantSpecies data
          const bySpecies = new Map<string, typeof instances>();
          for (const inst of instances) {
            const sid = inst.speciesId ?? "unknown";
            const arr = bySpecies.get(sid) ?? [];
            arr.push(inst);
            bySpecies.set(sid, arr);
          }

          const plantLines: string[] = [];
          for (const [speciesId, insts] of bySpecies) {
            const sp = getPlantById(speciesId);
            if (!sp) {
              plantLines.push(`- ${speciesId}: ${insts.length} stk (ukendt art)`);
              continue;
            }
            const totalCount = insts.reduce((s, i) => s + (i.count ?? 1), 0);
            const locations = [...new Set(insts.map(i => featureNames.get(i.featureId ?? "") ?? "ukendt bed"))];
            const varieties = [...new Set(insts.filter(i => i.varietyName).map(i => i.varietyName!))];

            let line = `- ${sp.icon ?? ""} ${sp.name} (${sp.latinName ?? speciesId}): ${totalCount} stk`;
            line += `, placering: ${locations.join(", ")}`;
            if (varieties.length) line += `, sorter: ${varieties.join(", ")}`;
            line += `, kategori: ${PLANT_CATEGORY_LABELS[sp.category] ?? sp.category}`;
            if (sp.lifecycle) line += `, livscyklus: ${sp.lifecycle}`;
            if (sp.sowIndoor) line += `, forspiring indendørs: ${formatMonthRange(sp.sowIndoor)}`;
            if (sp.sowOutdoor) line += `, direkte s\u00e5ning: ${formatMonthRange(sp.sowOutdoor)}`;
            if (sp.plantOut) line += `, udplantning: ${formatMonthRange(sp.plantOut)}`;
            if (sp.harvest) line += `, h\u00f8st: ${formatMonthRange(sp.harvest)}`;
            if (sp.light) line += `, lys: ${sp.light}`;
            if (sp.water) line += `, vand: ${sp.water}`;
            if (sp.frostHardy) line += `, frostfast: ja`;
            if (sp.harvestTips) line += `, h\u00f8sttips: ${sp.harvestTips}`;
            if (sp.pests?.length) line += `, skadedyr: ${sp.pests.join(", ")}`;
            if (sp.diseases?.length) line += `, sygdomme: ${sp.diseases.join(", ")}`;
            const planted = insts.find(i => i.plantedAt);
            if (planted?.plantedAt) line += `, plantet dato: ${planted.plantedAt}`;

            plantLines.push(line);
          }

          parts.push(
            `BRUGERENS PLANTEDE PLANTER I HAVEN (${instances.length} instanser, ${bySpecies.size} arter):\n` +
            `Dette er de faktiske planter brugeren har i sin have RIGHT NOW:\n${plantLines.join("\n")}`
          );
        }
      }
    } catch { /* ignore */ }

    // 3. Species NOT planted but available in database (brief, for suggestions only)
    try {
      const allPlants = getAllPlants();
      const instancesRaw = localStorage.getItem("gardenos:plants:instances:v1");
      const plantedIds = new Set<string>();
      if (instancesRaw) {
        const instances = JSON.parse(instancesRaw) as Array<{ speciesId?: string }>;
        instances.forEach(i => { if (i.speciesId) plantedIds.add(i.speciesId); });
      }
      const unplanted = allPlants.filter(p => !plantedIds.has(p.id));
      if (unplanted.length > 0) {
        const byCategory: Record<string, string[]> = {};
        unplanted.forEach((p) => {
          const cat = PLANT_CATEGORY_LABELS[p.category] || p.category;
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(p.name);
        });
        const catSummary = Object.entries(byCategory).map(([cat, names]) =>
          `- ${cat}: ${names.join(", ")}`
        );
        parts.push(`Plantebibliotek (IKKE plantet endnu, ${unplanted.length} arter tilg\u00e6ngelige til forslag):\n${catSummary.join("\n")}`);
      }
    } catch { /* ignore */ }

    // 4. Weather data (current, forecast, stats)
    try {
      const weatherCtx = buildWeatherContextString(weatherData);
      if (weatherCtx) parts.push(weatherCtx);
    } catch { /* ignore */ }

    return parts.length > 0 ? parts.join("\n\n") : "";
  }, [estimateDanishClimateZone, weatherData]);

  // Send chat message
  const sendChatMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMsg = { role: "user", content: text, ts: Date.now() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    try {
      const gardenContext = buildGardenContext();

      // Build messages array for API (last 20 messages for context)
      const recentMessages = [...chatMessages.slice(-20), userMsg].map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: recentMessages,
          persona: chatPersona,
          gardenContext,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Ukendt fejl" }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      // Read streaming response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Ingen stream modtaget");

      const decoder = new TextDecoder();
      let assistantText = "";
      let buffer = "";

      // Add empty assistant message that we'll update
      setChatMessages((prev) => [...prev, { role: "assistant", content: "", ts: Date.now() }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              assistantText += parsed.content;
              setChatMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantText, ts: Date.now() };
                return updated;
              });
            }
          } catch { /* skip */ }
        }
      }

      if (!assistantText) {
        // Remove empty assistant message if no content was received
        setChatMessages((prev) => prev.slice(0, -1));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Ukendt fejl";
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ Fejl: ${errMsg}`, ts: Date.now() },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, chatPersona, buildGardenContext]);

  const clearChatHistory = useCallback(() => {
    setChatMessages([]);
    localStorage.removeItem(CHAT_STORAGE_KEY);
  }, []);

  const addToScanHistory = useCallback(async (type: ScanType, imageDataUrl: string, data: Record<string, unknown>) => {
    const thumbnail = await createThumbnail(imageDataUrl);
    const name = String(data.speciesName || data.name || "Ukendt");
    const item: ScanHistoryItem = {
      id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      thumbnail,
      data,
      name,
      scannedAt: new Date().toISOString(),
    };
    setScanHistory((prev) => { const next = [item, ...prev]; saveScanHistory(next); return next; });
  }, []);

  const removeScanHistoryItem = useCallback((id: string) => {
    setScanHistory((prev) => { const next = prev.filter((i) => i.id !== id); saveScanHistory(next); return next; });
    setConfirmDeleteHistoryId(null);
  }, []);

  const markScanTransferred = useCallback((id: string, category: string) => {
    setScanHistory((prev) => {
      const next = prev.map((i) => i.id === id ? { ...i, transferred: true, transferredAs: category } : i);
      saveScanHistory(next);
      return next;
    });
    setTransferringId(null);
  }, []);

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

  // ── Auto-row creation state ──
  const [autoRowOpen, setAutoRowOpen] = useState(false);
  const [autoRowSpeciesId, setAutoRowSpeciesId] = useState<string | null>(null);
  const [autoRowVarietyId, setAutoRowVarietyId] = useState<string | null>(null);
  const [autoRowSearch, setAutoRowSearch] = useState("");
  const [autoRowCount, setAutoRowCount] = useState(0); // 0 = auto-max
  const [autoRowEdgeMarginCm, setAutoRowEdgeMarginCm] = useState(10);
  const [autoRowDirection, setAutoRowDirection] = useState<"length" | "width">("length");
  const [_autoRowOverflow, setAutoRowOverflow] = useState(false); // true when requested > max

  // ── Auto-element placement state ──
  const [autoElementOpen, setAutoElementOpen] = useState(false);
  const [autoElementSpeciesId, setAutoElementSpeciesId] = useState<string | null>(null);
  const [autoElementVarietyId, setAutoElementVarietyId] = useState<string | null>(null);
  const [autoElementSearch, setAutoElementSearch] = useState("");
  const [autoElementCount, setAutoElementCount] = useState(0); // 0 = auto-max
  const [autoElementEdgeMarginCm, setAutoElementEdgeMarginCm] = useState(15);

  // ── Plant recommendation state (shared by auto-row + auto-element) ──
  const [recRowOpen, setRecRowOpen] = useState(false);
  const [recRowStrategies, setRecRowStrategies] = useState<RecommendationStrategy[]>([]);
  const [recElemOpen, setRecElemOpen] = useState(false);
  const [recElemStrategies, setRecElemStrategies] = useState<RecommendationStrategy[]>([]);

  // ── Bed-resize row adjustment state ──
  const [bedResizeProposal, setBedResizeProposal] = useState<BedResizeProposal | null>(null);
  // Ref to store child-row IDs that were inside the bed BEFORE editing started
  const preEditChildRowIdsRef = useRef<Set<string>>(new Set());

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

  // ── Anker-punkt system (trilateration) ──
  const [anchors, setAnchors] = useState<AnchorPoint[]>(() => loadAnchors());
  const [editingAnchorId, setEditingAnchorId] = useState<string | null>(null);
  const [newAnchorName, setNewAnchorName] = useState("");
  const [newAnchorDesc, setNewAnchorDesc] = useState("");
  const [placingAnchor, setPlacingAnchor] = useState(false);
  // Trilateration flow
  const [triAnchorA, setTriAnchorA] = useState<string | null>(null);
  const [triAnchorB, setTriAnchorB] = useState<string | null>(null);
  const [triDistA, setTriDistA] = useState("");
  const [triDistB, setTriDistB] = useState("");
  const [triResult, setTriResult] = useState<{ lat: number; lng: number } | null>(null);
  const [triError, setTriError] = useState<string | null>(null);
  const [triPlaced, setTriPlaced] = useState(false);
  const [showAnchorHelp, setShowAnchorHelp] = useState(false);

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

  const addBookmark = useCallback((name: string, emoji?: string, coords?: { lat: number; lon: number; zoom?: number }) => {
    const map = mapRef.current;
    if (!map) return;
    const center: [number, number] = coords ? [coords.lat, coords.lon] : [map.getCenter().lat, map.getCenter().lng];
    const zoom = coords?.zoom ?? map.getZoom();
    const bm: MapBookmark = {
      id: Date.now().toString(36),
      name,
      center,
      zoom,
      emoji: emoji || "📍",
      favorite: false,
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

  // ── Anchor CRUD ──
  const addAnchor = useCallback((name: string, lat: number, lng: number, description?: string) => {
    const anchor: AnchorPoint = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name,
      emoji: "📌",
      lat,
      lng,
      description,
    };
    setAnchors((prev) => { const next = [...prev, anchor]; saveAnchors(next); return next; });
  }, []);

  const removeAnchor = useCallback((id: string) => {
    setAnchors((prev) => { const next = prev.filter((a) => a.id !== id); saveAnchors(next); return next; });
    // Clear trilateration refs if they reference deleted anchor
    setTriAnchorA((prev) => (prev === id ? null : prev));
    setTriAnchorB((prev) => (prev === id ? null : prev));
  }, []);

  const updateAnchor = useCallback((id: string, patch: Partial<AnchorPoint>) => {
    setAnchors((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, ...patch } : a));
      saveAnchors(next);
      return next;
    });
  }, []);

  // ── Trilateration compute ──
  const computeTrilateration = useCallback(() => {
    setTriError(null);
    setTriResult(null);
    setTriPlaced(false);
    const anchorA = anchors.find((a) => a.id === triAnchorA);
    const anchorB = anchors.find((a) => a.id === triAnchorB);
    if (!anchorA || !anchorB) { setTriError("Vælg to forskellige ankerpunkter."); return; }
    if (anchorA.id === anchorB.id) { setTriError("Vælg to FORSKELLIGE ankerpunkter."); return; }
    const dA = parseFloat(triDistA.replace(",", "."));
    const dB = parseFloat(triDistB.replace(",", "."));
    if (isNaN(dA) || dA <= 0) { setTriError("Indtast gyldig afstand fra anker A (i meter)."); return; }
    if (isNaN(dB) || dB <= 0) { setTriError("Indtast gyldig afstand fra anker B (i meter)."); return; }
    const result = trilaterate(anchorA, anchorB, dA, dB);
    if (!result) { setTriError("Afstandene passer ikke — tjek dine målinger. Summen af afstande skal være mindst lige så stor som afstanden mellem ankerpunkterne."); return; }
    setTriResult(result);
  }, [anchors, triAnchorA, triAnchorB, triDistA, triDistB]);

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
  const rowEmojiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const conflictOverlayRef = useRef<L.LayerGroup | null>(null);
  const placementPreviewRef = useRef<L.LayerGroup | null>(null);
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

  /** Flash (pulse-highlight) one or more features on the map and pan to them */
  const flashFeatureIds = useCallback(
    (ids: string[]) => {
      const group = featureGroupRef.current;
      const map = mapRef.current;
      if (!group || !map || ids.length === 0) return;

      const idSet = new Set(ids);
      const matchedLayers: L.Layer[] = [];
      const bounds = L.latLngBounds([]);

      group.eachLayer((layer) => {
        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
        if (f?.properties?.gardenosId && idSet.has(f.properties.gardenosId)) {
          matchedLayers.push(layer);
          if (layer instanceof L.Marker) {
            bounds.extend(layer.getLatLng());
          } else if (typeof (layer as unknown as { getBounds?: () => L.LatLngBounds }).getBounds === "function") {
            bounds.extend((layer as unknown as { getBounds: () => L.LatLngBounds }).getBounds());
          }
        }
      });

      // Pan to features
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.4), { animate: true, duration: 0.5, maxZoom: 20 });
      }

      // Pulse animation: bright highlight → restore
      const FLASH_COLOR = "#f59e0b"; // amber
      const FLASH_WEIGHT = 5;
      const PULSE_CYCLES = 3;
      const PULSE_INTERVAL = 300; // ms per half-cycle

      for (const layer of matchedLayers) {
        const maybePath = layer as unknown as {
          setStyle?: (s: L.PathOptions) => void;
          options?: L.PathOptions;
        };
        const maybeMarker = layer as unknown as {
          getElement?: () => HTMLElement | undefined;
        };

        if (maybePath.setStyle && maybePath.options) {
          // Polygon / polyline / circle
          const origStyle = {
            color: maybePath.options.color,
            weight: maybePath.options.weight,
            fillOpacity: maybePath.options.fillOpacity,
            fillColor: (maybePath.options as L.PathOptions).fillColor,
          };
          let cycle = 0;
          const pulse = () => {
            if (cycle >= PULSE_CYCLES * 2) {
              maybePath.setStyle!(origStyle);
              return;
            }
            const isOn = cycle % 2 === 0;
            maybePath.setStyle!(isOn
              ? { color: FLASH_COLOR, weight: FLASH_WEIGHT, fillOpacity: 0.35, fillColor: FLASH_COLOR }
              : origStyle
            );
            cycle++;
            setTimeout(pulse, PULSE_INTERVAL);
          };
          pulse();
        } else if (maybeMarker.getElement) {
          // Marker (DOM element)
          const el = maybeMarker.getElement();
          if (el) {
            el.style.transition = "filter 0.15s, transform 0.15s";
            let cycle = 0;
            const pulse = () => {
              if (cycle >= PULSE_CYCLES * 2) {
                el.style.filter = "";
                el.style.transform = el.style.transform.replace(/ scale\([^)]+\)/, "");
                return;
              }
              const isOn = cycle % 2 === 0;
              el.style.filter = isOn ? "drop-shadow(0 0 8px #f59e0b) drop-shadow(0 0 16px #f59e0b)" : "";
              if (isOn) {
                if (!el.style.transform.includes("scale(")) {
                  el.style.transform += " scale(1.3)";
                }
              } else {
                el.style.transform = el.style.transform.replace(/ scale\([^)]+\)/, "");
              }
              cycle++;
              setTimeout(pulse, PULSE_INTERVAL);
            };
            pulse();
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected?.gardenosId]
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
    const catOrder: Record<string, number> = { area: 0, seedbed: 1, row: 2, container: 3, element: 4, condition: 5 };

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
      if (isHidden) {
        // Unbind tooltip so permanent emoji labels don't linger when category is hidden
        const ttl = layer as unknown as { unbindTooltip?: () => void };
        ttl.unbindTooltip?.();
        return;
      }

      const shouldShowContainment =
        !!feature &&
        feature.geometry.type === "Polygon" &&
        ["container", "area", "seedbed", "row"].includes(feature.properties?.category ?? "");

      const containmentCounts = shouldShowContainment && gardenosId ? containment.countsByContainerId.get(gardenosId) : undefined;

      const containmentSuffix = containmentCounts && containmentCounts.total > 0
        ? ` • ${[containmentCounts.seedbeds ? `${containmentCounts.seedbeds} såbed` : "", containmentCounts.containers ? `${containmentCounts.containers} cont.` : "", containmentCounts.rows ? `${containmentCounts.rows} række` : "", containmentCounts.elements ? `${containmentCounts.elements} elem.` : "", containmentCounts.infra ? `${containmentCounts.infra} infra` : "", containmentCounts.areas ? `${containmentCounts.areas} omr.` : ""].filter(Boolean).join(" • ")}`
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

      // Add seedbed-specific details to tooltip
      if (featureCat === "seedbed") {
        const details: string[] = [];
        if (feature?.properties?.sowingMethod) details.push(`Såmetode: ${feature.properties.sowingMethod}`);
        if (feature?.properties?.bedSeason) details.push(`Sæson: ${feature.properties.bedSeason}`);
        if (feature?.properties?.soilType) details.push(`Jord: ${feature.properties.soilType}`);
        if (feature?.properties?.fertilizer) details.push(`Gødning: ${feature.properties.fertilizer}`);
        if (details.length > 0) plantSuffix += `\n${details.join(" · ")}`;
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

      // Tooltip (hover) — same for all layer types.
      // Row emoji icons are rendered as separate L.Marker overlays in updateRowEmojiOverlays.
      const maybeTooltipLayer = layer as unknown as {
        unbindTooltip?: () => void;
        bindTooltip?: (content: string, options?: unknown) => void;
      };
      if (tooltipText && typeof maybeTooltipLayer.bindTooltip === "function") {
        maybeTooltipLayer.unbindTooltip?.();
        maybeTooltipLayer.bindTooltip(tooltipText, {
          sticky: true,
          permanent: false,
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
      // (Row emoji icons are rendered via permanent tooltip bound above)
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
      //     a large area/seedbed polygon. ---
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
  // Row emoji overlays: place emoji DivIcon markers along each visible row line.
  // Using real markers in the marker pane ensures they always render on top.
  // ---------------------------------------------------------------------------
  // Row emoji overlays: one emoji per row, rendered as an L.marker with L.divIcon
  // (same proven pattern as edge-length labels which always display correctly).
  const updateRowEmojiOverlays = useCallback(() => {
    const map = mapRef.current;

    // Always clear previous overlays
    if (rowEmojiLayerGroupRef.current) {
      rowEmojiLayerGroupRef.current.clearLayers();
      if (map && map.hasLayer(rowEmojiLayerGroupRef.current)) {
        map.removeLayer(rowEmojiLayerGroupRef.current);
      }
      rowEmojiLayerGroupRef.current = null;
    }

    if (!map) return;
    const group = featureGroupRef.current;
    if (!group) return;

    const emojiGroup = L.layerGroup();

    group.eachLayer((layer) => {
      const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
      if (!f) return;
      if (f.properties?.category !== "row") return;
      if (f.geometry?.type !== "LineString") return;

      // Skip hidden rows
      const layerKind = f.properties?.kind;
      if (hiddenCategories.has("row")) return;
      if (layerKind && hiddenVisibilityKinds.has((layerKind as string).toLowerCase())) return;

      // Read coordinates from GeoJSON feature (format: [lng, lat])
      const coords = (f.geometry as LineString).coordinates as [number, number][];
      if (!coords || coords.length < 2) return;

      // Compute midpoint (swap to [lat, lng] for Leaflet)
      const first = coords[0];
      const last = coords[coords.length - 1];
      const midLat = (first[1] + last[1]) / 2;
      const midLng = (first[0] + last[0]) / 2;

      // Resolve emoji icon
      let rowIcon = f.properties?.customIcon;
      if (!rowIcon && f.properties?.speciesId) {
        const sp = getPlantById(f.properties.speciesId);
        if (sp?.icon) rowIcon = sp.icon;
      }
      if (!rowIcon) rowIcon = "🌱";

      // Create marker — identical pattern to edge labels (iconSize [0,0], anchor [0,0])
      const icon = L.divIcon({
        className: "gardenos-row-emoji-overlay",
        html: `<span>${rowIcon}</span>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([midLat, midLng], {
        icon,
        interactive: false,
        keyboard: false,
      });
      emojiGroup.addLayer(marker);
    });

    emojiGroup.addTo(map);
    rowEmojiLayerGroupRef.current = emojiGroup;
  }, [featureGroupRef, mapRef, hiddenCategories, hiddenVisibilityKinds]);

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

  // ---------------------------------------------------------------------------
  // Conflict overlay: show ⚠️ markers + connecting lines on plants with problems
  // ---------------------------------------------------------------------------
  const updateConflictOverlays = useCallback(() => {
    const map = mapRef.current;

    // Always clear previous overlays
    if (conflictOverlayRef.current) {
      conflictOverlayRef.current.clearLayers();
      if (map && map.hasLayer(conflictOverlayRef.current)) {
        map.removeLayer(conflictOverlayRef.current);
      }
      conflictOverlayRef.current = null;
    }

    if (!map) return;

    const conflicts = detectPlantConflicts(layoutForContainment.features);
    // eslint-disable-next-line no-console
    console.log("[GardenOS] Conflict scan:", layoutForContainment.features.filter((f) => f.geometry?.type === "Point" && f.properties?.speciesId).length, "plants,", conflicts.length, "conflicts");
    if (conflicts.length === 0) return;

    const overlayGroup = L.layerGroup();

    // Collect unique feature IDs that have conflicts
    const featureConflictMap = new Map<string, PlantConflict[]>();
    for (const c of conflicts) {
      if (!featureConflictMap.has(c.featureIdA)) featureConflictMap.set(c.featureIdA, []);
      featureConflictMap.get(c.featureIdA)!.push(c);
      if (!featureConflictMap.has(c.featureIdB)) featureConflictMap.set(c.featureIdB, []);
      featureConflictMap.get(c.featureIdB)!.push(c);
    }

    // For each conflict, draw a dashed line between the two features
    for (const c of conflicts) {
      const fA = layoutForContainment.features.find((f) => f.properties?.gardenosId === c.featureIdA);
      const fB = layoutForContainment.features.find((f) => f.properties?.gardenosId === c.featureIdB);
      if (!fA || !fB || fA.geometry?.type !== "Point" || fB.geometry?.type !== "Point") continue;

      const coordsA = fA.geometry.coordinates as [number, number];
      const coordsB = fB.geometry.coordinates as [number, number];
      const lineColor = c.severity === 3 ? "#dc2626" : c.severity === 2 ? "#ea580c" : "#eab308";

      const line = L.polyline(
        [[coordsA[1], coordsA[0]], [coordsB[1], coordsB[0]]],
        { color: lineColor, weight: 2, opacity: 0.6, dashArray: "6 4", interactive: false },
      );
      overlayGroup.addLayer(line);
    }

    // For each conflicted feature, place a small warning DivIcon
    const processedFeatures = new Set<string>();
    for (const [featureId, fConflicts] of featureConflictMap) {
      if (processedFeatures.has(featureId)) continue;
      processedFeatures.add(featureId);

      const feat = layoutForContainment.features.find((f) => f.properties?.gardenosId === featureId);
      if (!feat || feat.geometry?.type !== "Point") continue;
      const coords = feat.geometry.coordinates as [number, number];

      const worstSeverity = Math.max(...fConflicts.map((c) => c.severity)) as 1 | 2 | 3;
      const emoji = worstSeverity === 3 ? "🔴" : worstSeverity === 2 ? "🟠" : "🟡";
      const badgeSize = 14;

      const badge = L.marker([coords[1], coords[0]], {
        icon: L.divIcon({
          className: "gardenos-conflict-badge",
          html: `<span style="font-size:${badgeSize}px;line-height:1;cursor:pointer">${emoji}</span>`,
          iconSize: [badgeSize, badgeSize],
          iconAnchor: [-4, badgeSize + 4], // offset to top-right of the plant icon
        }),
        interactive: true,
        zIndexOffset: 2000,
      });

      // Build popup content
      const uniqueMessages = [...new Set(fConflicts.map((c) => c.message))];
      const uniqueSuggestions = [...new Set(fConflicts.map((c) => c.suggestion))];
      const popupHtml = `
        <div style="max-width:260px;font-size:12px;line-height:1.4">
          <p style="font-weight:bold;margin:0 0 4px">${worstSeverity === 3 ? "🔴 Alvorlige konflikter" : worstSeverity === 2 ? "🟠 Advarsler" : "🟡 Bemærkninger"}</p>
          ${uniqueMessages.map((m) => `<p style="margin:2px 0">${m}</p>`).join("")}
          <hr style="margin:6px 0;border:0;border-top:1px solid #ddd"/>
          <p style="font-weight:600;margin:0 0 2px">💡 Forslag:</p>
          ${uniqueSuggestions.map((s) => `<p style="margin:2px 0;color:#555">${s}</p>`).join("")}
        </div>
      `;
      badge.bindPopup(popupHtml, { maxWidth: 280, closeButton: true });

      overlayGroup.addLayer(badge);
    }

    overlayGroup.addTo(map);
    conflictOverlayRef.current = overlayGroup;
  }, [layoutForContainment, mapRef]);

  // ---------------------------------------------------------------------------
  // Placement preview: green/red circle following the cursor during draw mode
  // ---------------------------------------------------------------------------
  const updatePlacementPreview = useCallback((latlng: L.LatLng | null) => {
    const map = mapRef.current;

    // Clear previous preview
    if (placementPreviewRef.current) {
      placementPreviewRef.current.clearLayers();
      if (map && map.hasLayer(placementPreviewRef.current)) {
        map.removeLayer(placementPreviewRef.current);
      }
      placementPreviewRef.current = null;
    }

    if (!map || !latlng) return;

    // Only show preview when a species is selected for placement
    const pending = createSpeciesRef.current;
    if (!pending?.speciesId) return;
    const species = getPlantById(pending.speciesId);
    if (!species) return;

    const coords: [number, number] = [latlng.lng, latlng.lat];
    const spreadM = (species.spreadDiameterCm ?? species.spacingCm ?? 30) / 100;
    const radiusM = spreadM / 2;

    // Check conflicts at this position
    const previewConflicts = checkPlacementConflicts(coords, species, layoutForContainment.features);
    const hasConflict = previewConflicts.length > 0;
    const worstSeverity = hasConflict ? Math.max(...previewConflicts.map((c) => c.severity)) : 0;

    const color = worstSeverity >= 2 ? "#dc2626" : worstSeverity === 1 ? "#eab308" : "#22c55e";
    const fillColor = worstSeverity >= 2 ? "#dc2626" : worstSeverity === 1 ? "#eab308" : "#22c55e";

    const previewGroup = L.layerGroup();

    // Spread/canopy circle
    const circle = L.circle(latlng, {
      radius: radiusM,
      color,
      fillColor,
      fillOpacity: 0.15,
      weight: 2,
      opacity: 0.7,
      dashArray: "4 4",
      interactive: false,
    });
    previewGroup.addLayer(circle);

    // Status label
    if (hasConflict) {
      const worstMsg = previewConflicts.reduce((worst, c) => c.severity > worst.severity ? c : worst, previewConflicts[0]);
      const labelIcon = L.divIcon({
        className: "gardenos-placement-label",
        html: `<div style="background:${color};color:white;font-size:10px;padding:2px 6px;border-radius:4px;white-space:nowrap;pointer-events:none;font-weight:600">${worstSeverity >= 2 ? "⚠️" : "💡"} ${worstMsg.message}</div>`,
        iconSize: [200, 20],
        iconAnchor: [100, -10],
      });
      const label = L.marker(latlng, { icon: labelIcon, interactive: false, zIndexOffset: 3000 });
      previewGroup.addLayer(label);
    } else {
      const okIcon = L.divIcon({
        className: "gardenos-placement-label",
        html: `<div style="background:#22c55e;color:white;font-size:10px;padding:2px 6px;border-radius:4px;white-space:nowrap;pointer-events:none;font-weight:600">✅ God placering</div>`,
        iconSize: [120, 20],
        iconAnchor: [60, -10],
      });
      const label = L.marker(latlng, { icon: okIcon, interactive: false, zIndexOffset: 3000 });
      previewGroup.addLayer(label);
    }

    previewGroup.addTo(map);
    placementPreviewRef.current = previewGroup;
  }, [layoutForContainment, mapRef]);

  // Re-run visuals when highlightedGroupId changes
  useEffect(() => {
    highlightedGroupIdRef.current = highlightedGroupId;
    updateSelectionStyles(selected?.gardenosId ?? null);
    updateEdgeLabels(selected?.gardenosId ?? null);
    updateRowEmojiOverlays();
    updateConflictOverlays();
  }, [highlightedGroupId, selected?.gardenosId, updateSelectionStyles, updateEdgeLabels, updateRowEmojiOverlays, updateConflictOverlays]);

  useEffect(() => {
    multiSelectedIdsRef.current = multiSelectedIds;
    updateSelectionStyles(selected?.gardenosId ?? null);
    updateEdgeLabels(selected?.gardenosId ?? null);
    updateRowEmojiOverlays();
    updateConflictOverlays();
  }, [layoutForContainment, multiSelectedIds, selected?.gardenosId, updateSelectionStyles, updateEdgeLabels, updateRowEmojiOverlays, updateConflictOverlays]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Sync draft name/notes whenever a new feature is selected
  useEffect(() => {
    setDraftName(selected?.feature.properties?.name ?? "");
    setDraftNotes(selected?.feature.properties?.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.gardenosId]); // only when selection identity changes, not every render

  // ---------------------------------------------------------------------------
  // Placement preview: mousemove handler while in "plant" draw mode
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (drawMode !== "plant") {
      // Clean up preview when leaving draw mode
      updatePlacementPreview(null);
      return;
    }

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      updatePlacementPreview(e.latlng);
    };

    const onMouseOut = () => {
      updatePlacementPreview(null);
    };

    map.on("mousemove", onMouseMove);
    map.on("mouseout", onMouseOut);

    return () => {
      map.off("mousemove", onMouseMove);
      map.off("mouseout", onMouseOut);
      updatePlacementPreview(null);
    };
  }, [drawMode, mapRef, updatePlacementPreview]);

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

    // ── Snapshot child-row IDs inside this polygon (before resize) ──
    preEditChildRowIdsRef.current = new Set();
    const group = featureGroupRef.current;
    if (group) {
      let editedFeature: GardenFeature | undefined;
      group.eachLayer((layer) => {
        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
        if (f?.properties?.gardenosId === selectedId) editedFeature = f;
      });
      if (editedFeature && editedFeature.geometry?.type === "Polygon") {
        const eCat = editedFeature.properties?.category;
        // Only snapshot rows for bed-like polygons
        if (eCat === "seedbed" || eCat === "area" || eCat === "container") {
        const ring = polygonOuterRing(editedFeature as Feature<Polygon, GardenFeatureProperties>);
        if (ring && ring.length >= 3) {
          group.eachLayer((layer) => {
            const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
            if (!f || f.properties?.gardenosId === selectedId) return;
            if (f.properties?.category !== "row" || f.geometry?.type !== "LineString") return;
            const coords = f.geometry.coordinates as [number, number][];
            if (coords.length < 2) return;
            const mid: [number, number] = [(coords[0][0] + coords[coords.length - 1][0]) / 2, (coords[0][1] + coords[coords.length - 1][1]) / 2];
            if (pointInRing(mid, ring)) {
              preEditChildRowIdsRef.current.add(f.properties?.gardenosId ?? "");
            }
          });
        }
        }
      }
    }

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

    // ── Check if the edited feature is a polygon with child rows ──
    const group = featureGroupRef.current;
    const sel = selectedRef.current;
    if (group && sel) {
      try {
      // Re-read the feature from the group (it may have been updated)
      let editedFeature: GardenFeature | undefined;
      group.eachLayer((layer) => {
        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
        if (f?.properties?.gardenosId === sel.gardenosId) editedFeature = f;
      });
      const ef = editedFeature;
      const efCat = ef?.properties?.category;
      // Only check for row adjustment on bed-like polygons (seedbed, area, container)
      if (ef && ef.geometry?.type === "Polygon" && (efCat === "seedbed" || efCat === "area" || efCat === "container")) {
        const bedName = ef.properties?.name ?? "Unavngivet";
        const ring = polygonOuterRing(ef as Feature<Polygon, GardenFeatureProperties>);
        if (ring && ring.length >= 3) {
          // Gather all rows that WERE inside this bed before editing,
          // OR are inside/intersecting the new ring now
          const childRows: { gardenosId: string; name: string; speciesId: string; coords: [number, number][] }[] = [];
          const seenIds = new Set<string>();
          group.eachLayer((layer) => {
            const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
            if (!f || f.properties?.gardenosId === sel.gardenosId) return;
            if (f.properties?.category !== "row" || f.geometry?.type !== "LineString") return;
            const rowId = f.properties?.gardenosId ?? "";
            const coords = f.geometry.coordinates as [number, number][];
            if (coords.length < 2) return;
            const mid: [number, number] = [(coords[0][0] + coords[coords.length - 1][0]) / 2, (coords[0][1] + coords[coords.length - 1][1]) / 2];
            const insideNow = pointInRing(mid, ring);
            const wasInsideBefore = preEditChildRowIdsRef.current.has(rowId);
            const clipped = clipLineToPolygon(coords[0], coords[1], ring);
            if (insideNow || wasInsideBefore || clipped) {
              if (!seenIds.has(rowId)) {
                seenIds.add(rowId);
                childRows.push({
                  gardenosId: rowId,
                  name: f.properties?.name ?? "Unavngivet",
                  speciesId: f.properties?.speciesId ?? "",
                  coords,
                });
              }
            }
          });
          if (childRows.length > 0) {
            const allInstances = loadPlantInstances().map(i => ({ id: i.id, featureId: i.featureId, count: i.count }));
            const proposal = computeBedResizeProposal(
              sel.gardenosId,
              bedName,
              ring,
              childRows,
              allInstances,
            );
            if (proposal) {
              setBedResizeProposal(proposal);
            }
          }
        }
      }
      } catch (err) {
        // Avoid crashing if bed-resize detection fails
        console.warn("[GardenOS] Bed resize detection error:", err);
      }
    }
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

    // Clean up plant instances linked to the deleted feature
    removeInstancesForFeature(selected.gardenosId);
    setPlantInstancesVersion((v) => v + 1);

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

    // Clean up plant instances linked to deleted features
    for (const fid of multiSelectedIds) {
      removeInstancesForFeature(fid);
    }
    setPlantInstancesVersion((v) => v + 1);

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

    // Clean up all plant instances (no features remain)
    removeOrphanedInstances(new Set());
    setPlantInstancesVersion((v) => v + 1);

    setSelected(null);
    updateSelectionStyles(null);
    persistAll();
    setLayoutForContainment({ type: "FeatureCollection", features: [] } as GardenFeatureCollection);
  }, [persistAll, pushUndoSnapshot, updateSelectionStyles]);

  // ── Auto-create rows inside a polygon (seedbed/area/container) ──
  const executeAutoRowCreation = useCallback((
    speciesId: string,
    varietyId: string | null,
    rowCount: number,
    edgeMarginCm: number,
    overrideRowSpacingCm?: number, // used when "så tættere" is chosen
    rowDirection: "length" | "width" = "length",
  ) => {
    if (!selected) return;
    const group = featureGroupRef.current;
    if (!group) return;
    const geo = selected.feature.geometry;
    if (geo.type !== "Polygon") return;

    const ring = polygonOuterRing(selected.feature as Feature<Polygon, GardenFeatureProperties>);
    if (!ring || ring.length < 3) return;

    const species = getPlantById(speciesId);
    if (!species) return;

    const rowSpacingCm = overrideRowSpacingCm ?? species.rowSpacingCm ?? 30;
    const plantSpacingCm = species.spacingCm ?? 15;
    const varietyObj = varietyId ? getVarietiesForSpecies(speciesId).find((v) => v.id === varietyId) : undefined;
    const effectivePlantSpacing = varietyObj?.spacingCm ?? plantSpacingCm;

    // ── Gather existing rows inside this bed ──
    // Uses parentBedId (direct link, reliable) + pointInRing midpoint (fallback for legacy).
    // Also reads Leaflet getLatLngs() directly for coordinate reliability.
    // Collects per-row rowSpacingCm so exclusion zones respect each species' needs.
    const existingRowCoords: [number, number][][] = [];
    const existingRowSpacingsCm: number[] = [];
    group.eachLayer((layer) => {
      const lf = (layer as L.Layer & { feature?: GardenFeature }).feature;
      if (!lf || lf.properties?.gardenosId === selected.gardenosId) return;
      if (lf.properties?.category !== "row" || lf.geometry?.type !== "LineString") return;
      // Get coordinates from Leaflet layer directly (avoids stale .feature.geometry)
      let coords: [number, number][] | null = null;
      if (typeof (layer as L.Polyline).getLatLngs === "function") {
        const lls = (layer as L.Polyline).getLatLngs() as L.LatLng[];
        if (lls.length >= 2) coords = lls.map((ll) => [ll.lng, ll.lat] as [number, number]);
      }
      if (!coords) {
        const raw = lf.geometry.coordinates as [number, number][];
        if (raw.length >= 2) coords = raw;
      }
      if (!coords || coords.length < 2) return;
      // Resolve this row's species rowSpacingCm
      const rowSpecies = lf.properties?.speciesId ? getPlantById(lf.properties.speciesId) : null;
      const rowSpCm = rowSpecies?.rowSpacingCm ?? 30;
      // Method 1: direct parent link (most reliable for auto-created rows)
      if (lf.properties?.parentBedId === selected.gardenosId) {
        existingRowCoords.push(coords);
        existingRowSpacingsCm.push(rowSpCm);
        return;
      }
      // Method 2: geometric midpoint containment (fallback for legacy rows)
      const mid: [number, number] = [(coords[0][0] + coords[coords.length - 1][0]) / 2, (coords[0][1] + coords[coords.length - 1][1]) / 2];
      if (pointInRing(mid, ring)) {
        existingRowCoords.push(coords);
        existingRowSpacingsCm.push(rowSpCm);
      }
    });

    const occupiedSlots = getExistingRowOffsetsInBed(ring, existingRowCoords, rowDirection, existingRowSpacingsCm);

    // ── Also add point/bush exclusion zones inside the bed ──
    group.eachLayer((layer) => {
      const lf = (layer as L.Layer & { feature?: GardenFeature }).feature;
      if (!lf || lf.properties?.gardenosId === selected.gardenosId) return;
      if (lf.geometry?.type !== "Point") return;
      if (!lf.properties?.speciesId && !lf.properties?.elementTypeId) return;
      // Use getLatLng() for current position (geometry.coordinates may be stale after drag)
      let pt: [number, number];
      if (layer instanceof L.Marker && typeof layer.getLatLng === "function") {
        const ll = layer.getLatLng();
        pt = [ll.lng, ll.lat];
      } else {
        pt = lf.geometry.coordinates as [number, number];
      }
      if (!pointInRing(pt, ring)) return;
      // Project point onto shortDir axis
      const midLat2 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const midLng2 = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      const mpLat2 = 111_320;
      const mpLng2 = 111_320 * Math.cos((midLat2 * Math.PI) / 180);
      const mRing2: [number, number][] = ring.map(([lng, lat]) => [(lng - midLng2) * mpLng2, (lat - midLat2) * mpLat2]);
      let ld = 0, li = 0, sd = Infinity, si = 0;
      for (let i = 0; i < mRing2.length; i++) {
        const j = (i + 1) % mRing2.length;
        const dx = mRing2[j][0] - mRing2[i][0], dy = mRing2[j][1] - mRing2[i][1];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > ld) { ld = d; li = i; }
        if (d > 0.01 && d < sd) { sd = d; si = i; }
      }
      const refI = rowDirection === "width" ? si : li;
      const mA = mRing2[refI], mB = mRing2[(refI + 1) % mRing2.length];
      const edx2 = mB[0] - mA[0], edy2 = mB[1] - mA[1];
      const eLen2 = Math.sqrt(edx2 * edx2 + edy2 * edy2);
      if (eLen2 < 1e-6) return;
      const longD2: [number, number] = [edx2 / eLen2, edy2 / eLen2];
      const shortD2: [number, number] = [-longD2[1], longD2[0]];
      const mx = (pt[0] - midLng2) * mpLng2;
      const my = (pt[1] - midLat2) * mpLat2;
      const sProj = mx * shortD2[0] + my * shortD2[1];
      const excl1D = getFeatureExclusionRadiusM(lf.properties?.speciesId, lf.properties?.elementTypeId);
      // Use 30% of full radius for 1D — just prevents wasting slots on rows
      // that would be entirely inside the obstacle. The 2D circle clipping
      // handles the real geometry (splitting/shortening rows).
      const he = Math.max(excl1D.radiusM * 0.3, 0.10);
      occupiedSlots.push({ offset: sProj, halfExclusion: he });
    });

    // ── Collect 2D obstacles (points, elements, bushes) inside this bed ──
    const obstacles2D: Obstacle2D[] = [];
    group.eachLayer((layer) => {
      const lf = (layer as L.Layer & { feature?: GardenFeature }).feature;
      if (!lf || lf.properties?.gardenosId === selected.gardenosId) return;
      if (lf.geometry?.type !== "Point") return;
      // Use getLatLng() for current position (geometry.coordinates may be stale after drag)
      let pt: [number, number];
      if (layer instanceof L.Marker && typeof layer.getLatLng === "function") {
        const ll = layer.getLatLng();
        pt = [ll.lng, ll.lat];
      } else {
        pt = lf.geometry.coordinates as [number, number];
      }
      if (!pointInRing(pt, ring)) return;
      const excl = getFeatureExclusionRadiusM(lf.properties?.speciesId, lf.properties?.elementTypeId);
      if (excl) {
        obstacles2D.push({ center: pt, radiusM: excl.radiusM, trunkRadiusM: excl.trunkRadiusM, label: excl.label });
      }
    });

    const result = computeAutoRows(ring, rowSpacingCm, edgeMarginCm, rowCount, occupiedSlots, rowDirection, obstacles2D);
    if (!result || result.rows.length === 0) {
      const fullMsg = existingRowCoords.length > 0
        ? `🚫 Bedet er fuldt!\n\nDer er allerede ${existingRowCoords.length} rækker i dette bed. Der er ikke plads til flere med ${rowSpacingCm} cm rækkeafstand.\n\nFjern eksisterende rækker først, eller udvid bedet.`
        : (result?.warning ?? "Kunne ikke beregne rækker – kontrollér bedets geometri.");
      alert(fullMsg);
      return;
    }

    // ── Safety net: verify each new row respects per-row exclusion zones ──
    const newHalfExcl = Math.max(rowSpacingCm / 100 / 2, 0.12);
    const safeRows = result.rows.filter((newRow) => {
      const newOffset = (() => {
        const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
        const midLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
        const mpLat = 111_320;
        const mpLng = 111_320 * Math.cos((midLat * Math.PI) / 180);
        const mRing: [number, number][] = ring.map(([lng, lat]) => [(lng - midLng) * mpLng, (lat - midLat) * mpLat]);
        let longestD = 0, longestI = 0, shortestD = Infinity, shortestI = 0;
        for (let i = 0; i < mRing.length; i++) {
          const j = (i + 1) % mRing.length;
          const dx = mRing[j][0] - mRing[i][0], dy = mRing[j][1] - mRing[i][1];
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > longestD) { longestD = d; longestI = i; }
          if (d > 0.01 && d < shortestD) { shortestD = d; shortestI = i; }
        }
        const refI = rowDirection === "width" ? shortestI : longestI;
        const mA = mRing[refI], mB = mRing[(refI + 1) % mRing.length];
        const edx = mB[0] - mA[0], edy = mB[1] - mA[1];
        const eLen = Math.sqrt(edx * edx + edy * edy);
        if (eLen < 1e-6) return null;
        const longD: [number, number] = [edx / eLen, edy / eLen];
        const shortD: [number, number] = [-longD[1], longD[0]];
        const nm = newRow.midpoint;
        const mx = (nm[0] - midLng) * mpLng;
        const my = (nm[1] - midLat) * mpLat;
        return mx * shortD[0] + my * shortD[1];
      })();
      if (newOffset === null) return true;

      // Check perpendicular distance respecting each existing row's exclusion
      for (const slot of occupiedSlots) {
        const minDist = Math.max(slot.halfExclusion, newHalfExcl);
        if (Math.abs(newOffset - slot.offset) < minDist) return false;
      }
      return true;
    });

    if (safeRows.length === 0) {
      alert(`🚫 Bedet er fuldt!\n\nAlle ${result.rows.length} beregnede positioner er for tæt på eksisterende rækker.\n\nFjern eksisterende rækker først, eller udvid bedet.`);
      return;
    }
    // Replace result.rows with the safe subset
    result.rows.length = 0;
    result.rows.push(...safeRows);

    pushUndoSnapshot();

    const speciesName = species.name;
    const varietyName = varietyObj?.name ?? "";
    const displayName = varietyName ? `${speciesName} — ${varietyName}` : speciesName;

    // Count existing rows of same species inside this bed for numbering
    let existingSameSpeciesCount = 0;
    group.eachLayer((layer) => {
      const lf = (layer as L.Layer & { feature?: GardenFeature }).feature;
      if (!lf || lf.properties?.gardenosId === selected.gardenosId) return;
      if (lf.properties?.category !== "row" || lf.geometry?.type !== "LineString") return;
      if (lf.properties?.speciesId !== speciesId) return;
      // Method 1: direct parent link
      if (lf.properties?.parentBedId === selected.gardenosId) {
        existingSameSpeciesCount++;
        return;
      }
      // Method 2: geometric fallback
      let coords: [number, number][] | null = null;
      if (typeof (layer as L.Polyline).getLatLngs === "function") {
        const lls = (layer as L.Polyline).getLatLngs() as L.LatLng[];
        if (lls.length >= 2) coords = lls.map((ll) => [ll.lng, ll.lat] as [number, number]);
      }
      if (!coords) {
        const raw = lf.geometry.coordinates as [number, number][];
        if (raw.length >= 2) coords = raw;
      }
      if (!coords || coords.length < 2) return;
      const mid: [number, number] = [(coords[0][0] + coords[coords.length - 1][0]) / 2, (coords[0][1] + coords[coords.length - 1][1]) / 2];
      if (pointInRing(mid, ring)) existingSameSpeciesCount++;
    });

    let createdCount = 0;
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      // GeoJSON LineString: coordinates are [lng, lat]
      const coords = row.coords;

      const plantsInRow = Math.max(1, Math.floor((row.lengthM * 100) / effectivePlantSpacing));
      const rowNumber = existingSameSpeciesCount + i + 1;

      const nextFeature = ensureDefaultProperties({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          kind: "row",
          category: "row",
          name: `${displayName} – Række ${rowNumber}`,
          speciesId,
          varietyId: varietyId ?? "",
          varietyName,
          planted: displayName,
          plantedAt: new Date().toISOString().slice(0, 10),
          customIcon: species.icon ?? "",
          parentBedId: selected.gardenosId,
          rowDirection,
        } as GardenFeatureProperties,
      });

      const layerGroup = L.geoJSON(nextFeature as GardenFeatureCollection | GardenFeature, {
        onEachFeature: (feature, layer) => {
          attachClickHandler(layer, feature as GardenFeature);
        },
      });

      layerGroup.eachLayer((layer) => {
        group.addLayer(layer);
      });

      // Auto-create plant instance for the row
      if (nextFeature.properties?.gardenosId) {
        addPlantInstance({
          id: crypto.randomUUID(),
          speciesId,
          varietyId: varietyId ?? undefined,
          varietyName: varietyName || undefined,
          featureId: nextFeature.properties.gardenosId,
          count: plantsInRow,
          plantedAt: new Date().toISOString().slice(0, 10),
          season: new Date().getFullYear(),
        });
      }

      createdCount++;
    }

    setPlantInstancesVersion((v) => v + 1);
    rebuildFromGroupAndUpdateSelection();

    // Show summary
    const totalPlants = result.rows.reduce((sum, r) => sum + Math.max(1, Math.floor((r.lengthM * 100) / effectivePlantSpacing)), 0);
    const msg = [
      `✅ ${createdCount} nye rækker oprettet for ${displayName}`,
      existingRowCoords.length > 0 ? `(${existingRowCoords.length} eksisterende rækker i bedet blev respekteret)` : "",
      `Rækkeafstand: ${rowSpacingCm} cm · Planteafstand: ${effectivePlantSpacing} cm`,
      `Ca. ${totalPlants} planter i alt`,
      result.warning ? `⚠️ ${result.warning}` : "",
    ].filter(Boolean).join("\n");
    alert(msg);
  }, [selected, attachClickHandler, pushUndoSnapshot, rebuildFromGroupAndUpdateSelection]);

  // ── Auto-element placement execution ──
  const executeAutoElementPlacement = useCallback((
    speciesId: string,
    varietyId: string | null,
    elementCount: number,
    edgeMarginCm: number,
  ) => {
    if (!selected) return;
    const group = featureGroupRef.current;
    if (!group) return;
    const geo = selected.feature.geometry;
    if (geo.type !== "Polygon") return;

    const ring = polygonOuterRing(selected.feature as Feature<Polygon, GardenFeatureProperties>);
    if (!ring || ring.length < 3) return;

    const species = getPlantById(speciesId);
    if (!species) return;

    // Spacing: use spreadDiameterCm for bushes/trees, otherwise spacingCm
    const interElementSpacingCm = species.spreadDiameterCm ?? species.spacingCm ?? 30;
    const varietyObj = varietyId ? getVarietiesForSpecies(speciesId).find((v) => v.id === varietyId) : undefined;

    // ── Collect existing circle obstacles (ALL point features, not just in-bed) ──
    // Include nearby features from adjacent beds so exclusion zones are respected.
    const circleObstacles: Obstacle2D[] = [];
    group.eachLayer((layer) => {
      const lf = (layer as L.Layer & { feature?: GardenFeature }).feature;
      if (!lf || lf.properties?.gardenosId === selected.gardenosId) return;
      if (lf.geometry?.type !== "Point") return;
      if (!lf.properties?.speciesId && !lf.properties?.elementTypeId) return;
      let pt: [number, number];
      if (layer instanceof L.Marker && typeof layer.getLatLng === "function") {
        const ll = layer.getLatLng();
        pt = [ll.lng, ll.lat];
      } else {
        pt = lf.geometry.coordinates as [number, number];
      }
      // No pointInRing filter — include obstacles from adjacent beds too.
      // The algorithm naturally ignores obstacles too far from the bed.
      const excl = getFeatureExclusionRadiusM(lf.properties?.speciesId, lf.properties?.elementTypeId);
      if (excl) {
        // Include the obstacle's forest garden layer for coexistence check
        const obstacleSpecies = lf.properties?.speciesId ? getPlantById(lf.properties.speciesId) : null;
        circleObstacles.push({ center: pt, radiusM: excl.radiusM, trunkRadiusM: excl.trunkRadiusM, label: excl.label, layer: obstacleSpecies?.forestGardenLayer });
      }
    });

    // ── Collect existing row obstacles inside this bed ──
    const rowObstacles: RowObstacle2D[] = [];
    group.eachLayer((layer) => {
      const lf = (layer as L.Layer & { feature?: GardenFeature }).feature;
      if (!lf || lf.properties?.gardenosId === selected.gardenosId) return;
      if (lf.properties?.category !== "row" || lf.geometry?.type !== "LineString") return;
      let coords: [number, number][] | null = null;
      if (typeof (layer as L.Polyline).getLatLngs === "function") {
        const lls = (layer as L.Polyline).getLatLngs() as L.LatLng[];
        if (lls.length >= 2) coords = lls.map((ll) => [ll.lng, ll.lat] as [number, number]);
      }
      if (!coords) {
        const raw = lf.geometry.coordinates as [number, number][];
        if (raw.length >= 2) coords = raw;
      }
      if (!coords || coords.length < 2) return;
      // Check if row is inside this bed
      if (lf.properties?.parentBedId !== selected.gardenosId) {
        const mid: [number, number] = [(coords[0][0] + coords[coords.length - 1][0]) / 2, (coords[0][1] + coords[coords.length - 1][1]) / 2];
        if (!pointInRing(mid, ring)) return;
      }
      const rowSpecies = lf.properties?.speciesId ? getPlantById(lf.properties.speciesId) : null;
      const halfWidthM = Math.max((rowSpecies?.rowSpacingCm ?? 30) / 200, 0.10);
      const label = rowSpecies ? `${rowSpecies.icon ?? "🌱"} ${rowSpecies.name} række` : "Række";
      rowObstacles.push({ coords, halfWidthM, label });
    });

    const result = computeAutoElements(ring, interElementSpacingCm, edgeMarginCm, elementCount, circleObstacles, rowObstacles, species.forestGardenLayer);
    if (!result || result.positions.length === 0) {
      const fullMsg = circleObstacles.length > 0 || rowObstacles.length > 0
        ? `🚫 Ingen plads!\n\nDer er ikke plads til ${species.name} i dette bed med ${interElementSpacingCm} cm afstand.\n\n${circleObstacles.length > 0 ? `${circleObstacles.length} eksisterende element(er)` : ""}${rowObstacles.length > 0 ? ` og ${rowObstacles.length} rækker` : ""} blokerer pladsen.`
        : (result?.warning ?? "Kunne ikke beregne positioner – kontrollér bedets geometri.");
      alert(fullMsg);
      return;
    }

    pushUndoSnapshot();

    const speciesName = species.name;
    const varietyName = varietyObj?.name ?? "";
    const displayName = varietyName ? `${speciesName} — ${varietyName}` : speciesName;

    // Determine kind from species category
    const featureKind: GardenFeatureKind = (() => {
      switch (species.category) {
        case "tree": return "tree";
        case "bush": return "bush";
        case "flower": return "flower";
        default: return "plant";
      }
    })();

    // Count existing same species in bed for numbering
    let existingSameSpeciesCount = 0;
    group.eachLayer((layer) => {
      const lf = (layer as L.Layer & { feature?: GardenFeature }).feature;
      if (!lf || lf.properties?.gardenosId === selected.gardenosId) return;
      if (lf.geometry?.type !== "Point") return;
      if (lf.properties?.speciesId !== speciesId) return;
      let pt: [number, number];
      if (layer instanceof L.Marker && typeof layer.getLatLng === "function") {
        const ll = layer.getLatLng();
        pt = [ll.lng, ll.lat];
      } else {
        pt = lf.geometry.coordinates as [number, number];
      }
      if (pointInRing(pt, ring)) existingSameSpeciesCount++;
    });

    let createdCount = 0;
    for (let i = 0; i < result.positions.length; i++) {
      const pos = result.positions[i];
      const elementNumber = existingSameSpeciesCount + i + 1;

      const nextFeature = ensureDefaultProperties({
        type: "Feature",
        geometry: { type: "Point", coordinates: pos },
        properties: {
          kind: featureKind,
          category: "element",
          name: `${displayName} #${elementNumber}`,
          speciesId,
          varietyId: varietyId ?? "",
          varietyName,
          planted: displayName,
          plantedAt: new Date().toISOString().slice(0, 10),
          customIcon: species.icon ?? "",
          parentBedId: selected.gardenosId,
        } as GardenFeatureProperties,
      });

      const layerGroup = L.geoJSON(nextFeature as GardenFeatureCollection | GardenFeature, {
        pointToLayer: (_feature, latlng) =>
          L.marker(latlng, { icon: markerIcon(featureKind, false, false, species.icon ?? "") }),
        onEachFeature: (feature, layer) => {
          attachClickHandler(layer, feature as GardenFeature);
        },
      });

      layerGroup.eachLayer((layer) => {
        group.addLayer(layer);
      });

      // Auto-create plant instance
      if (nextFeature.properties?.gardenosId) {
        addPlantInstance({
          id: crypto.randomUUID(),
          speciesId,
          varietyId: varietyId ?? undefined,
          varietyName: varietyName || undefined,
          featureId: nextFeature.properties.gardenosId,
          count: 1,
          plantedAt: new Date().toISOString().slice(0, 10),
          season: new Date().getFullYear(),
        });
      }

      createdCount++;
    }

    setPlantInstancesVersion((v) => v + 1);
    rebuildFromGroupAndUpdateSelection();

    const msg = [
      `✅ ${createdCount} ${displayName} placeret i bedet`,
      circleObstacles.length > 0 || rowObstacles.length > 0
        ? `(${circleObstacles.length} eksist. elementer + ${rowObstacles.length} rækker respekteret)`
        : "",
      `Afstand: ${interElementSpacingCm} cm · Kantmargin: ${edgeMarginCm} cm`,
      result.obstacleWarnings.length > 0 ? `⚠️ Blokeret af: ${result.obstacleWarnings.join(", ")}` : "",
      result.warning ? `⚠️ ${result.warning}` : "",
    ].filter(Boolean).join("\n");
    alert(msg);
  }, [selected, attachClickHandler, pushUndoSnapshot, rebuildFromGroupAndUpdateSelection]);

  // ── Apply bed-resize proposal (accept changes) ──
  const applyBedResizeProposal = useCallback((proposal: BedResizeProposal) => {
    const group = featureGroupRef.current;
    if (!group) { setBedResizeProposal(null); return; }

    pushUndoSnapshot();

    for (const change of proposal.changes) {
      if (change.action === "remove") {
        // Remove layer from group
        const layersToRemove: L.Layer[] = [];
        group.eachLayer((layer) => {
          const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
          if (f?.properties?.gardenosId === change.gardenosId) layersToRemove.push(layer);
        });
        for (const layer of layersToRemove) group.removeLayer(layer);
        // Remove plant instances
        removeInstancesForFeature(change.gardenosId);
      } else if (change.action === "reclip" && change.newCoords) {
        // Update geometry of existing row
        group.eachLayer((layer) => {
          const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
          if (f?.properties?.gardenosId !== change.gardenosId) return;
          // Update GeoJSON coords
          if (f.geometry?.type === "LineString") {
            (f.geometry as LineString).coordinates = change.newCoords!;
          }
          // Update Leaflet layer
          if ("setLatLngs" in layer && typeof (layer as L.Polyline).setLatLngs === "function") {
            const latlngs = change.newCoords!.map(c => L.latLng(c[1], c[0]));
            (layer as L.Polyline).setLatLngs(latlngs);
          }
          // Update plant instance counts based on new length
          if (change.newLengthM != null) {
            const sp = f.properties?.speciesId ? getPlantById(f.properties.speciesId) : null;
            const spacingCm = sp?.spacingCm ?? 15;
            const newPlantCount = Math.max(1, Math.floor((change.newLengthM * 100) / spacingCm));
            const instances = getInstancesForFeature(change.gardenosId);
            for (const inst of instances) {
              updatePlantInstance(inst.id, { count: newPlantCount });
            }
          }
        });
      }
    }

    setPlantInstancesVersion((v) => v + 1);
    rebuildFromGroupAndUpdateSelection();
    setBedResizeProposal(null);
  }, [pushUndoSnapshot, rebuildFromGroupAndUpdateSelection]);

  // ── Reject bed-resize proposal (undo the geometry change) ──
  const rejectBedResizeProposal = useCallback(() => {
    // Undo returns to the snapshot before stopEditing saved
    // We need to trigger undo to revert
    undo();
    setBedResizeProposal(null);
  }, [undo]);

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

      // Clean up plant instances linked to the deleted feature
      removeInstancesForFeature(featureId);
      setPlantInstancesVersion((v) => v + 1);

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

  // ── Commit helpers for draft name / notes ──
  const commitDraftName = useCallback(() => {
    if (!selected) return;
    const current = selected.feature.properties?.name ?? "";
    if (draftName !== current) {
      updateSelectedProperty({ name: draftName });
    }
  }, [selected, draftName, updateSelectedProperty]);

  const commitDraftNotes = useCallback(() => {
    if (!selected) return;
    const current = selected.feature.properties?.notes ?? "";
    if (draftNotes !== current) {
      updateSelectedProperty({ notes: draftNotes });
    }
  }, [selected, draftNotes, updateSelectedProperty]);

  // Auto-commit drafts before selection changes away
  const prevSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = selected?.gardenosId ?? null;
    if (prevSelectedIdRef.current && prevSelectedIdRef.current !== currentId) {
      // selection just changed — commit any pending drafts for the OLD feature
      // We do this via a micro-task so state is still consistent
      // But since the old `selected` is gone, we commit directly via the group
      const group = featureGroupRef.current;
      if (group) {
        group.eachLayer((layer) => {
          const lf = (layer as L.Layer & { feature?: GardenFeature }).feature;
          if (lf?.properties?.gardenosId === prevSelectedIdRef.current) {
            const props = lf.properties!;
            let changed = false;
            if (draftName !== (props.name ?? "")) { props.name = draftName; changed = true; }
            if (draftNotes !== (props.notes ?? "")) { props.notes = draftNotes; changed = true; }
            if (changed) {
              rebuildFromGroupAndUpdateSelection();
            }
          }
        });
      }
    }
    prevSelectedIdRef.current = currentId;
  });

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
    void plantInstancesVersion; // reactivity trigger
    return getInstancesForFeature(selectedFeatureId).map((inst) => ({
      ...inst,
      species: getPlantById(inst.speciesId),
    }));
  }, [selected, selectedFeatureId, plantInstancesVersion]);

  const selectedCompanionChecks = useMemo(() => {
    if (!selected) return [] as CompanionCheck[];
    void plantInstancesVersion;
    return checkCompanions(selectedFeatureId);
  }, [selected, selectedFeatureId, plantInstancesVersion]);

  const selectedRotationWarnings = useMemo(() => {
    if (!selected) return [] as { plant: PlantSpecies; lastSeason: number; minYears: number }[];
    void plantInstancesVersion;
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    const catOrder: Record<string, number> = { area: 0, seedbed: 1, row: 2, container: 3, element: 4, condition: 5 };
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
    const catOrder: Record<string, number> = { area: 0, seedbed: 1, row: 2, container: 3, element: 4, condition: 5 };
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
    if (selectedCategory !== "container" && selectedCategory !== "area" && selectedCategory !== "condition" && selectedCategory !== "seedbed") return "";
    const area = areaForPolygonFeature(selected.feature as Feature<Polygon, GardenFeatureProperties>);
    if (area == null) return "";
    return formatAreaSquareMeters(area);
  }, [selected, selectedCategory, selectedIsPolygon]);

  return (
    <div className="grid h-[calc(100dvh)] w-full grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[1fr_340px]">
      <div className="gardenos-toolbar col-span-1 row-start-1 flex items-center justify-between gap-1 md:gap-2 border-b border-border bg-toolbar-bg px-2 md:px-3 py-1.5 md:py-2 md:col-span-2 shadow-sm">
        <div className="flex items-center gap-1 md:gap-3">
          <div className="flex items-center gap-1.5 mr-1">
            <span className="text-lg leading-none">🌿</span>
            <span className="text-sm font-bold tracking-tight text-accent hidden md:inline">GardenOS</span>
          </div>
          <div className="h-5 w-px bg-border hidden md:block" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={`rounded-md px-2 md:px-2.5 py-1.5 text-xs font-medium transition-colors ${
                drawMode === "select" && !isEditing
                  ? "bg-accent text-white shadow-sm"
                  : "text-foreground/70 hover:bg-foreground/5"
              }`}
              onClick={enterSelectMode}
              title="Afbryd tegning/redigering (Esc)"
            >
              ◎ <span className="hidden md:inline">Markér</span>
            </button>
            <button
              type="button"
              className={`rounded-md px-2 md:px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
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
              ✏️ <span className="hidden md:inline">{isEditing ? "Færdig" : "Redigér"}</span>
            </button>
          </div>
          <div className="h-5 w-px bg-border hidden md:block" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md px-2 md:px-2.5 py-1.5 text-xs text-foreground/60 hover:bg-foreground/5 transition-colors disabled:opacity-40"
              onClick={undo}
              disabled={undoStack.length === 0}
              title="Fortryd (Cmd/Ctrl+Z)"
            >
              ↩ <span className="hidden md:inline">Fortryd</span>
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
        <div className="hidden md:flex items-center gap-2 overflow-hidden min-w-0">
          {/* ── Favorite bookmark pills ── */}
          {bookmarks.some((b) => b.favorite) ? (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0">
              <span className="text-[10px] text-foreground/40 shrink-0">⭐</span>
              {bookmarks.filter((b) => b.favorite).map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  className="shrink-0 rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-medium hover:bg-accent/10 hover:border-accent/30 transition-all shadow-sm whitespace-nowrap"
                  onClick={() => goToLocation(bm.center[0], bm.center[1], bm.zoom)}
                  title={`${bm.name} — zoom ${bm.zoom.toFixed(0)}`}
                >
                  {bm.emoji || "📍"} {bm.name}
                </button>
              ))}
              <button
                type="button"
                className="shrink-0 rounded-full border border-dashed border-foreground/20 px-1.5 py-0.5 text-[10px] text-foreground/40 hover:border-accent/40 hover:text-accent transition-all"
                onClick={() => { setSidebarTab("view"); setViewSubTab("steder"); }}
                title="Administrer steder"
              >
                ＋
              </button>
            </div>
          ) : null}
          {bookmarks.some((b) => b.favorite) ? <div className="h-5 w-px bg-border shrink-0" /> : null}
          {/* ── Address search ── */}
          <div className="relative shrink-0">
            {showAddressSearch ? (
              <div className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 shadow-sm">
                <span className="text-xs">🔍</span>
                <input
                  type="text"
                  className="w-40 bg-transparent text-xs outline-none placeholder:text-foreground/40"
                  placeholder="Søg adresse..."
                  value={addressQuery}
                  onChange={(e) => setAddressQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") searchAddress(addressQuery); if (e.key === "Escape") { setShowAddressSearch(false); setAddressResults([]); } }}
                  autoFocus
                />
                <button type="button" className="text-foreground/40 hover:text-foreground/70 text-xs px-0.5" onClick={() => { setShowAddressSearch(false); setAddressResults([]); setAddressQuery(""); }}>✕</button>
              </div>
            ) : (
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-xs text-foreground/60 hover:bg-foreground/5 transition-colors flex items-center gap-1"
                onClick={() => setShowAddressSearch(true)}
                title="Søg adresse (Nominatim)"
              >
                🔍 Søg
              </button>
            )}
            {/* Search results dropdown */}
            {showAddressSearch && (addressSearching || addressResults.length > 0) ? (
              <div className="absolute top-full right-0 mt-1 w-72 rounded-xl border border-border bg-white shadow-lg z-[9999]">
                {addressSearching ? <div className="px-3 py-2 text-xs text-foreground/50">Søger…</div> : null}
                {addressResults.map((r, i) => {
                  const shortName = r.display_name.split(",")[0].trim();
                  return (
                    <div key={i} className="flex items-center gap-1 px-3 py-2 border-b border-border/50 last:border-b-0 hover:bg-accent/5 transition-colors">
                      <button
                        type="button"
                        className="flex-1 text-left text-xs truncate hover:text-accent transition-colors"
                        onClick={() => goToLocation(parseFloat(r.lat), parseFloat(r.lon))}
                      >
                        📍 {r.display_name}
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent-dark font-medium hover:bg-accent/20 transition-colors"
                        onClick={() => {
                          const lat = parseFloat(r.lat);
                          const lon = parseFloat(r.lon);
                          goToLocation(lat, lon);
                          addBookmark(shortName, "📍", { lat, lon, zoom: 18 });
                          setAddressResults([]);
                          setShowAddressSearch(false);
                        }}
                        title={`Gem "${shortName}"`}
                      >
                        + Gem
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
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

        /* Conflict badge (warning icon on conflicted plants) */
        .gardenos-conflict-badge {
          background: transparent !important;
          border: none !important;
          z-index: 1500 !important;
          pointer-events: auto;
        }

        /* Placement preview label (floating status while drawing) */
        .gardenos-placement-label {
          background: transparent !important;
          border: none !important;
          pointer-events: none;
          z-index: 2000 !important;
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

        /* ── Scale bar styling ── */
        .leaflet-control-scale {
          margin-bottom: 12px !important;
          margin-left: 12px !important;
        }
        .leaflet-control-scale-line {
          background: rgba(255, 255, 255, 0.85) !important;
          border: 2px solid #333 !important;
          border-top: none !important;
          padding: 2px 8px 3px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          color: #333 !important;
          text-shadow: 0 0 3px rgba(255,255,255,0.9) !important;
          line-height: 1.3 !important;
          white-space: nowrap !important;
        }

        .leaflet-tooltip.gardenos-row-emoji-label {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          margin: 0 !important;
          pointer-events: none;
        }
        .leaflet-tooltip.gardenos-row-emoji-label:before {
          display: none !important;
        }

        /* Row emoji overlay markers — same pattern as edge labels */
        .gardenos-row-emoji-overlay {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
          overflow: visible !important;
          pointer-events: none !important;
        }
        .gardenos-row-emoji-overlay span {
          display: inline-block;
          font-size: 18px;
          line-height: 1;
          transform: translate(-50%, -50%);
          text-shadow: 0 0 4px rgba(255,255,255,0.95), 0 0 2px rgba(255,255,255,1);
          pointer-events: none;
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

      <div className="gardenos-map-area relative row-start-2">
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

          {/* ── Bookmark pin markers ── */}
          {bookmarks.map((bm) => (
            <Marker
              key={`bm-${bm.id}`}
              position={bm.center}
              icon={L.divIcon({
                className: "bookmark-pin",
                html: `<div style="font-size:20px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3));cursor:pointer;text-align:center;line-height:1">${bm.emoji || "📍"}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 28],
              })}
              eventHandlers={{
                click: () => goToLocation(bm.center[0], bm.center[1], bm.zoom),
              }}
            >
              <Popup><span className="text-xs font-medium">{bm.emoji || "📍"} {bm.name}</span></Popup>
            </Marker>
          ))}

          {/* ── Anchor pin markers ── */}
          {anchors.map((anc) => (
            <Marker
              key={`anc-${anc.id}`}
              position={[anc.lat, anc.lng]}
              draggable
              icon={L.divIcon({
                className: "anchor-pin",
                html: `<div style="font-size:18px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4));cursor:grab;text-align:center;line-height:1;position:relative"><span>📌</span><div style="position:absolute;top:22px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:9px;font-weight:600;color:#c2410c;background:rgba(255,255,255,.85);padding:0 3px;border-radius:3px;pointer-events:none">${anc.name}</div></div>`,
                iconSize: [28, 40],
                iconAnchor: [14, 20],
              })}
              eventHandlers={{
                dragend: (e) => {
                  const marker = e.target as L.Marker;
                  const pos = marker.getLatLng();
                  updateAnchor(anc.id, { lat: pos.lat, lng: pos.lng });
                },
              }}
            >
              <Popup>
                <div style={{ fontSize: "11px" }}>
                  <strong>📌 {anc.name}</strong>
                  {anc.description ? <div style={{ color: "#666", marginTop: 2 }}>{anc.description}</div> : null}
                  <div style={{ color: "#999", marginTop: 4, fontFamily: "monospace", fontSize: "9px" }}>
                    {anc.lat.toFixed(7)}, {anc.lng.toFixed(7)}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* ── Trilateration result preview marker ── */}
          {triResult && !triPlaced ? (
            <Marker
              key="tri-preview"
              position={[triResult.lat, triResult.lng]}
              icon={L.divIcon({
                className: "tri-preview-pin",
                html: `<div style="font-size:22px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3));text-align:center;line-height:1;animation:pulse 1.5s infinite">🎯</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
              })}
            >
              <Popup><span style={{ fontSize: "11px", fontWeight: 600 }}>🎯 Beregnet position</span></Popup>
            </Marker>
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



        {/* ── Bookmark pin markers on the map ── */}
        {/* These are rendered inside the MapContainer via a portal-like approach below */}

        {!isReady ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-sm text-foreground/80">Indlæser kort…</div>
          </div>
        ) : null}
      </div>

      {/* ── Mobile Bottom Navigation ── */}
      <div className="mobile-bottom-nav md:hidden">
        <button type="button" className={sidebarTab === "create" && mobileSidebarOpen ? "active" : ""} onClick={() => { openMobileSidebar("create"); }}>
          <span className="nav-icon">＋</span>
          <span className="nav-label">Opret</span>
        </button>
        <button type="button" className={sidebarTab === "scan" && mobileSidebarOpen ? "active" : ""} onClick={() => { openMobileSidebar("scan"); }}>
          <span className="nav-icon">📷</span>
          <span className="nav-label">Scan</span>
        </button>
        <button type="button" className={sidebarTab === "plants" && mobileSidebarOpen ? "active" : ""} onClick={() => { openMobileSidebar("plants"); }}>
          <span className="nav-icon">🌱</span>
          <span className="nav-label">Planter</span>
        </button>
        <button type="button" className={sidebarTab === "content" && mobileSidebarOpen ? "active" : ""} onClick={() => { if (selected) openMobileSidebar("content"); }} style={{ opacity: selected ? 1 : 0.3 }}>
          <span className="nav-icon">◉</span>
          <span className="nav-label">Indhold</span>
        </button>
        <button type="button" onClick={() => { if (mobileSidebarOpen) closeMobileSidebar(); else openMobileSidebar(sidebarTab); }}>
          <span className="nav-icon">{mobileSidebarOpen ? "✕" : "☰"}</span>
          <span className="nav-label">{mobileSidebarOpen ? "Luk" : "Menu"}</span>
        </button>
      </div>

      {/* ── Mobile Bottom Sheet Backdrop ── */}
      {mobileSidebarOpen ? (
        <div
          className="fixed inset-0 z-[9997] bg-black/30 backdrop-blur-[2px] md:hidden"
          onClick={closeMobileSidebar}
        />
      ) : null}

      <aside className={`
        row-start-2 flex flex-col border-t border-border bg-sidebar-bg overflow-hidden
        md:border-l md:border-t-0 md:relative md:translate-y-0 md:rounded-none md:max-h-none md:shadow-none
        max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-[9998]
        max-md:max-h-[75dvh] max-md:rounded-t-2xl max-md:shadow-[0_-4px_20px_rgba(0,0,0,0.15)]
        max-md:transition-transform max-md:duration-300 max-md:ease-out
        ${mobileSidebarOpen ? "max-md:translate-y-0" : "max-md:translate-y-full"}
        max-md:pb-[calc(60px+env(safe-area-inset-bottom,0px))]
      `}>
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        <div className="px-3 pt-2 md:pt-2 max-md:pt-0 pb-0.5">
          <nav className="flex items-stretch gap-px overflow-x-auto scrollbar-hide">
            {[
              { id: "create" as const, icon: "＋", label: "Opret" },
              { id: "content" as const, icon: "◉", label: "Indhold", disabled: !selected },
              { id: "groups" as const, icon: "⊞", label: `Grupper${allGroups.length > 0 ? " " + allGroups.length : ""}` },
              { id: "plants" as const, icon: "🌱", label: "Planter" },
              { id: "scan" as const, icon: "📷", label: "Scan" },
              { id: "view" as const, icon: "👁", label: "Visning" },
              { id: "tasks" as const, icon: "📋", label: "Opgaver" },
              { id: "calendar" as const, icon: "📅", label: "Årshjul" },
              { id: "chat" as const, icon: "💬", label: "Rådgiver" },
            ].map((tab) => {
              const isActive = sidebarTab === tab.id;
              const isDisabled = "disabled" in tab && tab.disabled;
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={!!isDisabled}
                  className={`flex flex-col items-center justify-center rounded-xl px-2 py-1.5 min-w-[46px] transition-all ${
                    isActive
                      ? "bg-accent text-white shadow-md -translate-y-px"
                      : isDisabled
                      ? "text-foreground/20 cursor-not-allowed"
                      : "text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground/70"
                  }`}
                  onClick={() => { setSidebarTab(tab.id); if (tab.id !== "groups") setHighlightedGroupId(null); }}
                  title={isDisabled ? "Vælg noget på kortet først" : tab.label}
                >
                  <span className={`text-[15px] leading-none ${isActive ? "" : ""}`}>{tab.icon}</span>
                  <span className={`text-[8px] font-semibold mt-0.5 leading-tight tracking-tight whitespace-nowrap ${
                    isActive ? "" : "text-foreground/40"
                  }`}>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto sidebar-scroll px-4 pb-4">

        {sidebarTab === "create" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Kategori</label>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {(["area", "seedbed", "row", "container", "element", "condition"] as const).map((cat) => (
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
              <div className="mt-1 flex gap-1.5 items-center">
                <input
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 bg-background ${draftNameDirty ? "border-amber-400" : "border-border"}`}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => commitDraftName()}
                  onKeyDown={(e) => { if (e.key === "Enter") { commitDraftName(); (e.target as HTMLInputElement).blur(); } }}
                  placeholder="Fx Køkkenbed 1 / Æbletræ"
                />
                {draftNameDirty && (
                  <button
                    type="button"
                    className="shrink-0 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-accent/80 transition-colors"
                    onClick={() => commitDraftName()}
                  >
                    Gem
                  </button>
                )}
              </div>
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

            {selectedIsPolygon && (selectedCategory === "container" || selectedCategory === "area" || selectedCategory === "seedbed") ? (
              <div>
                <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Indeholder</label>
                <div className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm">
                  {selectedContainment && selectedContainment.total > 0
                    ? [selectedContainment.seedbeds ? `${selectedContainment.seedbeds} såbed` : "", selectedContainment.containers ? `${selectedContainment.containers} cont.` : "", selectedContainment.rows ? `${selectedContainment.rows} række` : "", selectedContainment.elements ? `${selectedContainment.elements} elem.` : "", selectedContainment.infra ? `${selectedContainment.infra} infra` : ""].filter(Boolean).join(", ") || "Ingen (endnu)"
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


            {/* ── Auto-row + Auto-element panels ── */}
            {selectedIsPolygon && (selectedCategory === "seedbed" || selectedCategory === "area" || selectedCategory === "container") ? (
              <>
              <div className="rounded-lg border border-accent/30 bg-accent-light/10 p-2.5 space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 text-left"
                  onClick={() => { setAutoRowOpen(!autoRowOpen); setAutoRowSearch(""); setAutoRowOverflow(false); }}
                >
                  <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">🌾 Auto-rækker</span>
                  <span className="ml-auto text-[10px] text-foreground/30">{autoRowOpen ? "▲" : "▼"}</span>
                </button>

                {autoRowOpen ? (() => {
                  const allPlants = getAllPlants();
                  const filteredPlants = autoRowSearch.trim()
                    ? allPlants.filter((p) =>
                        p.name.toLowerCase().includes(autoRowSearch.toLowerCase()) ||
                        (p.latinName?.toLowerCase().includes(autoRowSearch.toLowerCase())) ||
                        (p.category?.toLowerCase().includes(autoRowSearch.toLowerCase()))
                      )
                    : allPlants.slice(0, 20);
                  const selectedSpecies = autoRowSpeciesId ? getPlantById(autoRowSpeciesId) : null;
                  const varieties = autoRowSpeciesId ? getVarietiesForSpecies(autoRowSpeciesId) : [];
                  const selectedVariety = autoRowVarietyId ? varieties.find((v) => v.id === autoRowVarietyId) : undefined;

                  // ── Find existing rows + point features inside this bed ──
                  const bedRingForCount = selected.feature.geometry.type === "Polygon"
                    ? polygonOuterRing(selected.feature as Feature<Polygon, GardenFeatureProperties>)
                    : null;
                  const bedRowFeatures: GardenFeature[] = [];
                  const bedPointFeatures: GardenFeature[] = []; // bushes, trees, etc.
                  if (bedRingForCount && bedRingForCount.length >= 3) {
                    for (const f of layoutForContainment.features) {
                      if (f.properties?.gardenosId === selected.gardenosId) continue;
                      // Collect rows
                      if (f.properties?.category === "row" && f.geometry?.type === "LineString") {
                        const coords = (f.geometry as LineString).coordinates as [number, number][];
                        if (coords.length < 2) continue;
                        if (f.properties?.parentBedId === selected.gardenosId) {
                          bedRowFeatures.push(f);
                          continue;
                        }
                        const mid: [number, number] = [(coords[0][0] + coords[coords.length - 1][0]) / 2, (coords[0][1] + coords[coords.length - 1][1]) / 2];
                        if (pointInRing(mid, bedRingForCount)) bedRowFeatures.push(f);
                        continue;
                      }
                      // Collect point features (markers / bushes / trees / infra elements)
                      if (f.geometry?.type === "Point" && (f.properties?.speciesId || f.properties?.elementTypeId)) {
                        const pt = (f.geometry as Point).coordinates as [number, number];
                        if (pointInRing(pt, bedRingForCount)) bedPointFeatures.push(f);
                      }
                    }
                  }
                  const existingRowCount = bedRowFeatures.length;

                  // ── Detect existing row direction and lock toggle ──
                  const existingRowCoords = bedRowFeatures.map((f) => (f.geometry as LineString).coordinates as [number, number][]);
                  const detectedDirection = bedRingForCount && bedRingForCount.length >= 3
                    ? detectExistingRowDirection(bedRingForCount, existingRowCoords)
                    : null;
                  const directionLocked = detectedDirection !== null;
                  // Auto-sync state if existing rows force a direction
                  const effectiveDirection = directionLocked ? detectedDirection : autoRowDirection;
                  // Side-effect: sync React state when detection changes (only if locked)
                  if (directionLocked && autoRowDirection !== detectedDirection) {
                    // We can't call setState in render, but we can use the detected value for computation.
                    // The UI toggle will be disabled and show the detected direction.
                    // Sync on next tick:
                    queueMicrotask(() => setAutoRowDirection(detectedDirection));
                  }

                  // ── Compute occupied slots (existing rows + point/bush exclusion) ──
                  let preview: AutoRowResult | null = null;
                  if (selectedSpecies && bedRingForCount && bedRingForCount.length >= 3) {
                    const ring = bedRingForCount;
                    const existingSpacings = bedRowFeatures.map((f) => {
                      const sid = f.properties?.speciesId;
                      const sp = sid ? getPlantById(sid) : null;
                      return sp?.rowSpacingCm ?? 30;
                    });
                    const occupiedSlots = getExistingRowOffsetsInBed(ring, existingRowCoords, effectiveDirection, existingSpacings);

                    // Add point/bush exclusion zones: project each point onto the shortDir axis
                    // and create occupied slots with the bush's exclusion radius.
                    if (bedPointFeatures.length > 0) {
                      const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
                      const midLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
                      const mpLat = 111_320;
                      const mpLng = 111_320 * Math.cos((midLat * Math.PI) / 180);
                      const mRing: [number, number][] = ring.map(([lng, lat]) => [(lng - midLng) * mpLng, (lat - midLat) * mpLat]);
                      let longestD = 0, longestI = 0, shortestD = Infinity, shortestI = 0;
                      for (let i = 0; i < mRing.length; i++) {
                        const j = (i + 1) % mRing.length;
                        const dx = mRing[j][0] - mRing[i][0], dy = mRing[j][1] - mRing[i][1];
                        const d = Math.sqrt(dx * dx + dy * dy);
                        if (d > longestD) { longestD = d; longestI = i; }
                        if (d > 0.01 && d < shortestD) { shortestD = d; shortestI = i; }
                      }
                      const refI = effectiveDirection === "width" ? shortestI : longestI;
                      const mA = mRing[refI], mB = mRing[(refI + 1) % mRing.length];
                      const edx = mB[0] - mA[0], edy = mB[1] - mA[1];
                      const eLen = Math.sqrt(edx * edx + edy * edy);
                      if (eLen > 1e-6) {
                        const longD: [number, number] = [edx / eLen, edy / eLen];
                        const shortD: [number, number] = [-longD[1], longD[0]];
                        for (const pf of bedPointFeatures) {
                          const pt = (pf.geometry as Point).coordinates as [number, number];
                          const mx = (pt[0] - midLng) * mpLng;
                          const my = (pt[1] - midLat) * mpLat;
                          const sProj = mx * shortD[0] + my * shortD[1];
                          // Use 30% of full radius for 1D — just prevents wasting slots.
                          // The 2D circle clipping handles the real geometry.
                          const excl1D = getFeatureExclusionRadiusM(pf.properties?.speciesId, pf.properties?.elementTypeId);
                          const he = Math.max(excl1D.radiusM * 0.3, 0.10);
                          occupiedSlots.push({ offset: sProj, halfExclusion: he });
                        }
                      }
                    }

                    const rowSpCm = selectedSpecies.rowSpacingCm ?? 30;

                    // ── Collect 2D obstacles for line-circle clipping ──
                    const obstacles2D: Obstacle2D[] = [];
                    for (const pf of bedPointFeatures) {
                      const pt = (pf.geometry as Point).coordinates as [number, number];
                      const excl = getFeatureExclusionRadiusM(pf.properties?.speciesId, pf.properties?.elementTypeId);
                      if (excl) {
                        obstacles2D.push({ center: pt, radiusM: excl.radiusM, trunkRadiusM: excl.trunkRadiusM, label: excl.label });
                      }
                    }
                    // Also check for any point features with elementTypeId (not just speciesId)
                    if (bedRingForCount && bedRingForCount.length >= 3) {
                      for (const f of layoutForContainment.features) {
                        if (f.properties?.gardenosId === selected.gardenosId) continue;
                        if (f.geometry?.type !== "Point") continue;
                        if (f.properties?.speciesId) continue; // already handled above
                        if (!f.properties?.elementTypeId) continue;
                        const pt = (f.geometry as Point).coordinates as [number, number];
                        if (!pointInRing(pt, bedRingForCount)) continue;
                        const excl = getFeatureExclusionRadiusM(undefined, f.properties.elementTypeId);
                        if (excl) {
                          obstacles2D.push({ center: pt, radiusM: excl.radiusM, trunkRadiusM: excl.trunkRadiusM, label: excl.label });
                        }
                      }
                    }

                    preview = computeAutoRows(ring, rowSpCm, autoRowEdgeMarginCm, autoRowCount, occupiedSlots, effectiveDirection, obstacles2D);
                  }

                  const effectivePlantSpacing = selectedVariety?.spacingCm ?? selectedSpecies?.spacingCm ?? 15;
                  const recommendedRowSpacing = selectedSpecies?.rowSpacingCm ?? 30;
                  const totalPlants = preview
                    ? preview.rows.reduce((sum, r) => sum + Math.max(1, Math.floor((r.lengthM * 100) / effectivePlantSpacing)), 0)
                    : 0;
                  const totalRowLength = preview
                    ? preview.rows.reduce((sum, r) => sum + r.lengthM, 0)
                    : 0;

                  // Overflow detection
                  const isOverflow = autoRowCount > 0 && preview != null && autoRowCount > preview.maxRows;
                  const totalRowsNeeded = autoRowCount + existingRowCount;
                  const tighterSpacingCm = isOverflow && preview && totalRowsNeeded > 1
                    ? Math.max(1, Math.floor(((preview.bedWidthM * 100) - 2 * autoRowEdgeMarginCm) / (totalRowsNeeded - 1)))
                    : null;

                  return (
                    <div className="space-y-2">
                      <p className="text-[9px] text-foreground/40 leading-snug">
                        Vælg en plante og opret automatisk rækker i dette {selectedCategory === "seedbed" ? "såbed" : selectedCategory === "area" ? "område" : "bed"}.
                        Rækker placeres parallelt med bedets {effectiveDirection === "width" ? "korteste" : "længste"} side.{existingRowCount > 0 ? ` Eksisterende rækker (${existingRowCount} stk) respekteres — nye rækker placeres i ledige pladser.` : ""}
                        {bedPointFeatures.length > 0 ? ` ${bedPointFeatures.length} busk(e)/plante(r) i bedet blokerer deres omkreds.` : ""}
                      </p>

                      {/* Row direction toggle — locked when existing rows dictate direction */}
                      <div>
                        <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">
                          Rækkeretning{directionLocked ? " 🔒" : ""}
                        </label>
                        {directionLocked ? (
                          <p className="mt-0.5 text-[9px] text-amber-600">
                            ⚠️ Retningen er låst til &ldquo;{detectedDirection === "length" ? "langs længden" : "på tværs"}&rdquo; — der er allerede {existingRowCount} rækker i denne retning.
                          </p>
                        ) : null}
                        <div className="mt-0.5 flex rounded-md border border-border overflow-hidden">
                          <button
                            type="button"
                            disabled={directionLocked}
                            className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
                              effectiveDirection === "length"
                                ? "bg-accent text-white"
                                : "bg-background text-foreground/60 hover:bg-foreground/5"
                            } ${directionLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                            onClick={() => { if (!directionLocked) { setAutoRowDirection("length"); setAutoRowOverflow(false); } }}
                          >
                            ↔ Langs længden
                          </button>
                          <button
                            type="button"
                            disabled={directionLocked}
                            className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors border-l border-border ${
                              effectiveDirection === "width"
                                ? "bg-accent text-white"
                                : "bg-background text-foreground/60 hover:bg-foreground/5"
                            } ${directionLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                            onClick={() => { if (!directionLocked) { setAutoRowDirection("width"); setAutoRowOverflow(false); } }}
                          >
                            ↕ På tværs
                          </button>
                        </div>
                      </div>

                      {/* ── 💡 Anbefalinger (auto-row) ── */}
                      {(() => {
                        // Collect existing species in this bed (rows + point features)
                        const bedSpeciesIds = [
                          ...bedRowFeatures.map((f) => f.properties?.speciesId).filter((id): id is string => !!id),
                          ...bedPointFeatures.map((f) => f.properties?.speciesId).filter((id): id is string => !!id),
                        ];
                        const uniqueBedSpeciesIds = [...new Set(bedSpeciesIds)];
                        const recommendations = recRowOpen
                          ? getPlantRecommendations(uniqueBedSpeciesIds, recRowStrategies, "row")
                          : [];

                        return (
                          <div className="rounded-md border border-amber-300/40 bg-amber-50/30 p-2 space-y-1.5">
                            <button
                              type="button"
                              className="flex w-full items-center gap-1 text-left"
                              onClick={() => setRecRowOpen(!recRowOpen)}
                            >
                              <span className="text-[10px] font-semibold text-amber-700/70 uppercase tracking-wide">💡 Anbefalinger</span>
                              <span className="ml-auto text-[9px] text-foreground/30">{recRowOpen ? "▲" : "▼"}</span>
                            </button>
                            {recRowOpen ? (
                              <div className="space-y-1.5">
                                {uniqueBedSpeciesIds.length === 0 ? (
                                  <p className="text-[9px] text-foreground/40">Tomt bed — anbefalinger baseres på generel diversitet.</p>
                                ) : (
                                  <p className="text-[9px] text-foreground/40">
                                    Baseret på {uniqueBedSpeciesIds.length} eksisterende art{uniqueBedSpeciesIds.length !== 1 ? "er" : ""} i bedet.
                                  </p>
                                )}
                                {/* Strategy chips */}
                                <div className="flex flex-wrap gap-1">
                                  {(Object.entries(RECOMMENDATION_STRATEGY_LABELS) as [RecommendationStrategy, string][]).map(([key, label]) => {
                                    const active = recRowStrategies.includes(key);
                                    return (
                                      <button
                                        key={key}
                                        type="button"
                                        className={`rounded-full px-2 py-0.5 text-[9px] font-medium border transition-colors ${
                                          active
                                            ? "bg-amber-100 border-amber-400 text-amber-800"
                                            : "bg-white/60 border-border text-foreground/50 hover:border-amber-300"
                                        }`}
                                        onClick={() => {
                                          setRecRowStrategies((prev) =>
                                            active ? prev.filter((s) => s !== key) : [...prev, key]
                                          );
                                        }}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                                {/* Recommendation results */}
                                {recommendations.length > 0 ? (
                                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                                    {recommendations.map((rec) => (
                                      <button
                                        key={rec.species.id}
                                        type="button"
                                        className="flex w-full items-start gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-amber-100/40 transition-colors"
                                        onClick={() => {
                                          setAutoRowSpeciesId(rec.species.id);
                                          setAutoRowVarietyId(null);
                                          setAutoRowSearch("");
                                          setAutoRowCount(0);
                                          setAutoRowEdgeMarginCm(Math.round((rec.species.rowSpacingCm ?? 30) / 2));
                                          setAutoRowOverflow(false);
                                          setRecRowOpen(false);
                                        }}
                                        title={rec.reasons.map((r) => `${r.emoji} ${r.text}`).join("\n")}
                                      >
                                        <span className="text-sm leading-none mt-0.5">{rec.species.icon ?? "🌱"}</span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium truncate">{rec.species.name}</p>
                                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                                            {rec.reasons.filter((r) => r.score > 0).slice(0, 3).map((r, i) => (
                                              <span key={i} className="inline-block rounded-full bg-amber-100/60 px-1.5 py-px text-[8px] text-amber-700">
                                                {r.emoji} {r.text}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-px text-[9px] font-bold text-green-700">
                                          +{rec.totalScore}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[9px] text-foreground/30 italic">Vælg en eller flere strategier for at se anbefalinger.</p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {/* Species picker */}
                      {!selectedSpecies ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm"
                            placeholder="Søg plante…"
                            value={autoRowSearch}
                            onChange={(e) => setAutoRowSearch(e.target.value)}
                          />
                          <div className="max-h-40 overflow-y-auto space-y-0.5">
                            {filteredPlants.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-foreground/5"
                                onClick={() => {
                                  setAutoRowSpeciesId(p.id);
                                  setAutoRowVarietyId(null);
                                  setAutoRowSearch("");
                                  setAutoRowCount(0);
                                  setAutoRowEdgeMarginCm(Math.round((p.rowSpacingCm ?? 30) / 2));
                                  setAutoRowOverflow(false);
                                }}
                              >
                                <span className="text-sm leading-none">{p.icon ?? "🌱"}</span>
                                <span className="flex-1 min-w-0 truncate">{p.name}</span>
                                <span className="shrink-0 text-[9px] text-foreground/30">
                                  {p.rowSpacingCm ? `${p.rowSpacingCm} cm` : "—"}
                                </span>
                              </button>
                            ))}
                            {filteredPlants.length === 0 ? (
                              <p className="px-2 py-1 text-[10px] text-foreground/40">Ingen planter fundet</p>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Selected species display */}
                          <div className="flex items-center gap-2 rounded-md bg-foreground/[0.03] px-2 py-1.5">
                            <span className="text-lg leading-none">{selectedSpecies.icon ?? "🌱"}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate">{selectedSpecies.name}</p>
                              {selectedSpecies.latinName ? (
                                <p className="text-[9px] text-foreground/40 italic">{selectedSpecies.latinName}</p>
                              ) : null}
                              <p className="text-[9px] text-foreground/40 mt-0.5">
                                Rækkeafstand: {recommendedRowSpacing} cm
                                · Planteafstand: {effectivePlantSpacing} cm
                                {selectedSpecies.rootDepthCm ? ` · Rod: ${selectedSpecies.rootDepthCm} cm` : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-foreground/40 hover:bg-red-50 hover:text-red-500"
                              onClick={() => { setAutoRowSpeciesId(null); setAutoRowVarietyId(null); setAutoRowOverflow(false); }}
                              title="Vælg en anden plante"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Variety picker */}
                          {varieties.length > 0 ? (
                            <div>
                              <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Sort / Variant</label>
                              <select
                                className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm"
                                value={autoRowVarietyId ?? ""}
                                onChange={(e) => setAutoRowVarietyId(e.target.value || null)}
                              >
                                <option value="">Standard</option>
                                {varieties.map((v) => (
                                  <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                              </select>
                            </div>
                          ) : null}

                          {/* Settings */}
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Antal rækker</label>
                                <input
                                  type="number"
                                  min={0}
                                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm"
                                  value={autoRowCount}
                                  onChange={(e) => { setAutoRowCount(Math.max(0, parseInt(e.target.value) || 0)); setAutoRowOverflow(false); }}
                                  placeholder="0 = max"
                                  title="0 = fyld hele bedet"
                                />
                                <p className="mt-0.5 text-[9px] text-foreground/30">0 = fyld hele bedet</p>
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Kantmargin (cm)</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={200}
                                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm"
                                  value={autoRowEdgeMarginCm}
                                  onChange={(e) => { setAutoRowEdgeMarginCm(Math.max(0, parseInt(e.target.value) || 0)); setAutoRowOverflow(false); }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Preview */}
                          {preview ? (
                            <div className="rounded-md bg-foreground/[0.03] px-2.5 py-2 space-y-1">
                              <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wide">Forhåndsvisning</p>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-foreground/70">
                                <span>Bed-bredde:</span>
                                <span className="font-medium">{(preview.bedWidthM * 100).toFixed(0)} cm</span>
                                <span>Bed-længde:</span>
                                <span className="font-medium">{(preview.bedLengthM * 100).toFixed(0)} cm</span>
                                <span>Rækkeafstand:</span>
                                <span className="font-medium">{preview.rowSpacingCm} cm</span>
                                {existingRowCount > 0 ? (
                                  <>
                                    <span>Eksisterende rækker:</span>
                                    <span className="font-medium text-amber-600">{existingRowCount} (optaget)</span>
                                  </>
                                ) : null}
                                <span>Ledige pladser:</span>
                                <span className="font-medium">{preview.maxRows}</span>
                                <span>Nye rækker:</span>
                                <span className={`font-semibold ${isOverflow ? "text-red-500" : "text-accent"}`}>{preview.rows.length}{isOverflow ? ` (ønsket: ${autoRowCount})` : ""}</span>
                                <span>Samlet rækkelængde:</span>
                                <span className="font-medium">{totalRowLength.toFixed(1)} m</span>
                                <span>Planteafstand:</span>
                                <span className="font-medium">{effectivePlantSpacing} cm</span>
                                <span>Ca. antal planter:</span>
                                <span className="font-semibold text-accent">{totalPlants}</span>
                              </div>

                              {/* Existing rows info */}
                              {existingRowCount > 0 ? (
                                <p className="text-[10px] text-foreground/50 mt-1">
                                  ℹ️ {existingRowCount} eksisterende rækker i bedet — nye rækker placeres i de ledige pladser.
                                </p>
                              ) : null}

                              {/* Warning & overflow message */}
                              {preview.warning ? (
                                <p className="text-[10px] text-amber-600 mt-1">⚠️ {preview.warning}</p>
                              ) : null}

                              {/* Obstacle warnings */}
                              {preview.obstacleWarnings && preview.obstacleWarnings.length > 0 ? (
                                <div className="mt-1 space-y-0.5">
                                  {preview.obstacleWarnings.map((w, i) => (
                                    <p key={i} className="text-[10px] text-orange-600">{w}</p>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {/* ── Overflow resolution panel ── */}
                          {isOverflow && preview ? (
                            <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 space-y-2">
                              <p className="text-[10px] font-semibold text-red-700">
                                ⚠️ Du ønsker {autoRowCount} nye rækker, men der er kun {preview.maxRows} ledige pladser{existingRowCount > 0 ? ` (${existingRowCount} eksisterende rækker optager plads)` : ""} med {recommendedRowSpacing} cm rækkeafstand.
                              </p>
                              <p className="text-[9px] text-red-600/70">Hvad vil du gøre?</p>

                              <div className="space-y-1.5">
                                {/* Option 1: Sow tighter */}
                                {tighterSpacingCm && tighterSpacingCm >= 5 ? (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-left text-xs hover:bg-amber-100 transition-colors"
                                    onClick={() => {
                                      if (autoRowSpeciesId && tighterSpacingCm) {
                                        executeAutoRowCreation(autoRowSpeciesId, autoRowVarietyId, autoRowCount, autoRowEdgeMarginCm, tighterSpacingCm, effectiveDirection);
                                        setAutoRowOpen(false);
                                        setAutoRowSpeciesId(null);
                                        setAutoRowVarietyId(null);
                                        setAutoRowOverflow(false);
                                      }
                                    }}
                                  >
                                    <span className="text-sm">🔄</span>
                                    <div className="flex-1">
                                      <p className="font-semibold text-amber-800">Så tættere ({tighterSpacingCm} cm)</p>
                                      <p className="text-[9px] text-amber-700/70">Reducér rækkeafstand fra {recommendedRowSpacing} til {tighterSpacingCm} cm for at passe {autoRowCount} rækker</p>
                                    </div>
                                  </button>
                                ) : null}

                                {/* Option 2: Fewer rows */}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-md border border-green-300 bg-green-50 px-2 py-1.5 text-left text-xs hover:bg-green-100 transition-colors"
                                  onClick={() => {
                                    if (autoRowSpeciesId) {
                                      // Create with max rows instead
                                      executeAutoRowCreation(autoRowSpeciesId, autoRowVarietyId, preview!.maxRows, autoRowEdgeMarginCm, undefined, effectiveDirection);
                                      setAutoRowOpen(false);
                                      setAutoRowSpeciesId(null);
                                      setAutoRowVarietyId(null);
                                      setAutoRowOverflow(false);
                                    }
                                  }}
                                >
                                  <span className="text-sm">✂️</span>
                                  <div className="flex-1">
                                    <p className="font-semibold text-green-800">Fjern overskydende rækker</p>
                                    <p className="text-[9px] text-green-700/70">Opret kun {preview.maxRows} rækker med anbefalet {recommendedRowSpacing} cm afstand</p>
                                  </div>
                                </button>

                                {/* Option 3: Resize bed hint */}
                                <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs">
                                  <span className="text-sm">📐</span>
                                  <div className="flex-1">
                                    <p className="font-semibold text-blue-800">Udvid bedet manuelt</p>
                                    <p className="text-[9px] text-blue-700/70">Luk dette panel, tryk &ldquo;Redigér geometri&rdquo; og træk bedets kanter bredere. Bedet skal være mindst {((autoRowCount - 1) * recommendedRowSpacing / 100 + 2 * autoRowEdgeMarginCm / 100).toFixed(0)} cm bredt.</p>
                                  </div>
                                </div>

                                {/* Cancel */}
                                <button
                                  type="button"
                                  className="w-full rounded-md border border-foreground/10 px-2 py-1 text-[10px] text-foreground/50 hover:bg-foreground/5"
                                  onClick={() => setAutoRowOverflow(false)}
                                >
                                  Annullér
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {/* Bed full warning — prominent red box when no free slots */}
                          {preview && preview.maxRows === 0 && existingRowCount > 0 ? (
                            <div className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-3 text-center space-y-1">
                              <p className="text-sm font-bold text-red-700">🚫 Bedet er fuldt</p>
                              <p className="text-[10px] text-red-600/80">
                                Der er allerede {existingRowCount} rækker — ingen ledige pladser med {preview.rowSpacingCm} cm afstand.
                              </p>
                              <p className="text-[10px] text-red-600/60">
                                Fjern eksisterende rækker først, eller udvid bedet.
                              </p>
                            </div>
                          ) : null}

                          {/* Create button — when no overflow or overflow dismissed */}
                          {!isOverflow ? (
                            <button
                              type="button"
                              className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
                              disabled={!preview || preview.rows.length === 0}
                              onClick={() => {
                                if (autoRowSpeciesId) {
                                  executeAutoRowCreation(autoRowSpeciesId, autoRowVarietyId, autoRowCount, autoRowEdgeMarginCm, undefined, effectiveDirection);
                                  setAutoRowOpen(false);
                                  setAutoRowSpeciesId(null);
                                  setAutoRowVarietyId(null);
                                  setAutoRowOverflow(false);
                                }
                              }}
                            >
                              🌾 Opret {preview?.rows.length ?? 0} rækker
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })() : null}
              </div>

              {/* ── Auto-element placement panel ── */}
              <div className="rounded-lg border border-green-600/30 bg-green-50/20 p-2.5 space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 text-left"
                  onClick={() => { setAutoElementOpen(!autoElementOpen); setAutoElementSearch(""); }}
                >
                  <span className="text-[10px] font-semibold text-green-800 uppercase tracking-wide">🌿 Auto-elementer</span>
                  <span className="ml-auto text-[10px] text-foreground/30">{autoElementOpen ? "▲" : "▼"}</span>
                </button>

                {autoElementOpen ? (() => {
                  const allPlants = getAllPlants();
                  // Filter to bush/tree/flower/perennial categories — the ones that make sense as elements
                  const elementCategories = new Set(["bush", "tree", "flower", "perennial", "fruit", "climber"]);
                  const relevantPlants = allPlants.filter((p) => elementCategories.has(p.category ?? ""));
                  const filteredPlants = autoElementSearch.trim()
                    ? relevantPlants.filter((p) =>
                        p.name.toLowerCase().includes(autoElementSearch.toLowerCase()) ||
                        (p.latinName?.toLowerCase().includes(autoElementSearch.toLowerCase())) ||
                        (p.category?.toLowerCase().includes(autoElementSearch.toLowerCase()))
                      )
                    : relevantPlants.slice(0, 20);
                  const selectedSpecies = autoElementSpeciesId ? getPlantById(autoElementSpeciesId) : null;
                  const varieties = autoElementSpeciesId ? getVarietiesForSpecies(autoElementSpeciesId) : [];

                  // Compute preview
                  const bedRingForPreview = selected.feature.geometry.type === "Polygon"
                    ? polygonOuterRing(selected.feature as Feature<Polygon, GardenFeatureProperties>)
                    : null;

                  // Gather existing obstacles for preview
                  // Point features: collect ALL (not just in-bed) so cross-bed exclusion is respected
                  // Row features: collect those inside this bed
                  const nearbyPointFeatures: GardenFeature[] = [];
                  const bedRowFeatures: GardenFeature[] = [];
                  if (bedRingForPreview && bedRingForPreview.length >= 3) {
                    for (const f of layoutForContainment.features) {
                      if (f.properties?.gardenosId === selected.gardenosId) continue;
                      if (f.properties?.category === "row" && f.geometry?.type === "LineString") {
                        const coords = (f.geometry as LineString).coordinates as [number, number][];
                        if (coords.length < 2) continue;
                        if (f.properties?.parentBedId === selected.gardenosId) {
                          bedRowFeatures.push(f);
                          continue;
                        }
                        const mid: [number, number] = [(coords[0][0] + coords[coords.length - 1][0]) / 2, (coords[0][1] + coords[coords.length - 1][1]) / 2];
                        if (pointInRing(mid, bedRingForPreview)) bedRowFeatures.push(f);
                        continue;
                      }
                      // Include ALL point features — cross-bed obstacles are handled by distance check in algorithm
                      if (f.geometry?.type === "Point" && (f.properties?.speciesId || f.properties?.elementTypeId)) {
                        nearbyPointFeatures.push(f);
                      }
                    }
                  }

                  let elementPreview: AutoElementResult | null = null;
                  if (selectedSpecies && bedRingForPreview && bedRingForPreview.length >= 3) {
                    const spacingCm = selectedSpecies.spreadDiameterCm ?? selectedSpecies.spacingCm ?? 30;

                    const circleObs: Obstacle2D[] = nearbyPointFeatures.map((pf) => {
                      const pt = (pf.geometry as Point).coordinates as [number, number];
                      const excl = getFeatureExclusionRadiusM(pf.properties?.speciesId, pf.properties?.elementTypeId);
                      const obsSpecies = pf.properties?.speciesId ? getPlantById(pf.properties.speciesId) : null;
                      return { center: pt, radiusM: excl.radiusM, trunkRadiusM: excl.trunkRadiusM, label: excl.label, layer: obsSpecies?.forestGardenLayer };
                    });

                    const rowObs: RowObstacle2D[] = bedRowFeatures.map((rf) => {
                      const coords = (rf.geometry as LineString).coordinates as [number, number][];
                      const rowSpecies = rf.properties?.speciesId ? getPlantById(rf.properties.speciesId) : null;
                      const halfWidthM = Math.max((rowSpecies?.rowSpacingCm ?? 30) / 200, 0.10);
                      const label = rowSpecies ? `${rowSpecies.icon ?? "🌱"} ${rowSpecies.name} række` : "Række";
                      return { coords, halfWidthM, label };
                    });

                    elementPreview = computeAutoElements(bedRingForPreview, spacingCm, autoElementEdgeMarginCm, autoElementCount, circleObs, rowObs, selectedSpecies.forestGardenLayer);
                  }

                  const interElementSpacingCm = selectedSpecies
                    ? (selectedSpecies.spreadDiameterCm ?? selectedSpecies.spacingCm ?? 30)
                    : 30;

                  return (
                    <div className="space-y-2">
                      <p className="text-[9px] text-foreground/40 leading-snug">
                        Vælg en plante og placér automatisk i bedet. Planter holdes mindst {interElementSpacingCm} cm fra hinanden
                        {bedRowFeatures.length > 0 ? ` og respekterer ${bedRowFeatures.length} eksisterende rækker` : ""}.
                        {nearbyPointFeatures.length > 0 ? ` ${nearbyPointFeatures.length} eksist. element(er) i nærheden respekteres (også fra nabobede).` : ""}
                        {" "}Skovhave-lag der kan sameksistere deler plads (f.eks. bunddække under træer).
                      </p>

                      {/* ── 💡 Anbefalinger (auto-element) ── */}
                      {(() => {
                        const bedSpeciesIds = [
                          ...nearbyPointFeatures.map((f) => f.properties?.speciesId).filter((id): id is string => !!id),
                          ...bedRowFeatures.map((f) => f.properties?.speciesId).filter((id): id is string => !!id),
                        ];
                        const uniqueBedSpeciesIds = [...new Set(bedSpeciesIds)];
                        const recommendations = recElemOpen
                          ? getPlantRecommendations(uniqueBedSpeciesIds, recElemStrategies, "element")
                          : [];

                        return (
                          <div className="rounded-md border border-green-300/40 bg-green-50/30 p-2 space-y-1.5">
                            <button
                              type="button"
                              className="flex w-full items-center gap-1 text-left"
                              onClick={() => setRecElemOpen(!recElemOpen)}
                            >
                              <span className="text-[10px] font-semibold text-green-700/70 uppercase tracking-wide">💡 Anbefalinger</span>
                              <span className="ml-auto text-[9px] text-foreground/30">{recElemOpen ? "▲" : "▼"}</span>
                            </button>
                            {recElemOpen ? (
                              <div className="space-y-1.5">
                                {uniqueBedSpeciesIds.length === 0 ? (
                                  <p className="text-[9px] text-foreground/40">Tomt bed — anbefalinger baseres på generel diversitet.</p>
                                ) : (
                                  <p className="text-[9px] text-foreground/40">
                                    Baseret på {uniqueBedSpeciesIds.length} eksisterende art{uniqueBedSpeciesIds.length !== 1 ? "er" : ""} i/nær bedet.
                                  </p>
                                )}
                                {/* Strategy chips */}
                                <div className="flex flex-wrap gap-1">
                                  {(Object.entries(RECOMMENDATION_STRATEGY_LABELS) as [RecommendationStrategy, string][]).map(([key, label]) => {
                                    const active = recElemStrategies.includes(key);
                                    return (
                                      <button
                                        key={key}
                                        type="button"
                                        className={`rounded-full px-2 py-0.5 text-[9px] font-medium border transition-colors ${
                                          active
                                            ? "bg-green-100 border-green-400 text-green-800"
                                            : "bg-white/60 border-border text-foreground/50 hover:border-green-300"
                                        }`}
                                        onClick={() => {
                                          setRecElemStrategies((prev) =>
                                            active ? prev.filter((s) => s !== key) : [...prev, key]
                                          );
                                        }}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                                {/* Recommendation results */}
                                {recommendations.length > 0 ? (
                                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                                    {recommendations.map((rec) => (
                                      <button
                                        key={rec.species.id}
                                        type="button"
                                        className="flex w-full items-start gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-green-100/40 transition-colors"
                                        onClick={() => {
                                          setAutoElementSpeciesId(rec.species.id);
                                          setAutoElementSearch("");
                                          setAutoElementVarietyId(null);
                                          const smartMargin = computeSmartEdgeMarginCm(rec.species);
                                          setAutoElementEdgeMarginCm(smartMargin);
                                          setRecElemOpen(false);
                                        }}
                                        title={rec.reasons.map((r) => `${r.emoji} ${r.text}`).join("\n")}
                                      >
                                        <span className="text-sm leading-none mt-0.5">{rec.species.icon ?? "🌱"}</span>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium truncate">{rec.species.name}</p>
                                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                                            {rec.reasons.filter((r) => r.score > 0).slice(0, 3).map((r, i) => (
                                              <span key={i} className="inline-block rounded-full bg-green-100/60 px-1.5 py-px text-[8px] text-green-700">
                                                {r.emoji} {r.text}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-px text-[9px] font-bold text-green-700">
                                          +{rec.totalScore}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[9px] text-foreground/30 italic">Vælg en eller flere strategier for at se anbefalinger.</p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}

                      {/* Species picker */}
                      {!selectedSpecies ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs shadow-sm"
                            placeholder="Søg plante (buske, træer, blomster…)"
                            value={autoElementSearch}
                            onChange={(e) => setAutoElementSearch(e.target.value)}
                          />
                          <div className="max-h-40 overflow-y-auto space-y-0.5">
                            {filteredPlants.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-foreground/5 text-xs"
                                onClick={() => {
                                  setAutoElementSpeciesId(p.id);
                                  setAutoElementSearch("");
                                  setAutoElementVarietyId(null);
                                  // Smart edge margin: trees/shrubs use trunk zone, not full canopy
                                  const sp = getPlantById(p.id);
                                  if (sp) setAutoElementEdgeMarginCm(computeSmartEdgeMarginCm(sp));
                                }}
                              >
                                <span className="text-sm leading-none">{p.icon ?? "🌱"}</span>
                                <span className="truncate">{p.name}</span>
                                {p.forestGardenLayer ? <span className="text-[8px] text-foreground/25 shrink-0">{FOREST_GARDEN_LAYER_LABELS[p.forestGardenLayer]}</span> : null}
                                {p.latinName ? <span className="ml-auto text-[9px] text-foreground/30 italic truncate">{p.latinName}</span> : null}
                              </button>
                            ))}
                            {filteredPlants.length === 0 ? (
                              <p className="text-[10px] text-foreground/30 text-center py-2">Ingen buske/træer/blomster fundet</p>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Selected species display */}
                          <div className="flex items-center gap-1.5 rounded-md bg-foreground/5 px-2 py-1">
                            <span className="text-sm leading-none">{selectedSpecies.icon ?? "🌱"}</span>
                            <span className="text-xs font-medium truncate flex-1">{selectedSpecies.name}</span>
                            <button
                              type="button"
                              className="text-[10px] text-foreground/40 hover:text-foreground/70"
                              onClick={() => { setAutoElementSpeciesId(null); setAutoElementVarietyId(null); }}
                            >
                              ✕
                            </button>
                          </div>

                          {/* Forest garden layer + companion info */}
                          {(() => {
                            const layer = selectedSpecies.forestGardenLayer;
                            // Gather nearby species from features in/around the bed
                            const nearbySpeciesIds = new Set<string>();
                            for (const pf of nearbyPointFeatures) {
                              if (pf.properties?.speciesId && pf.properties.speciesId !== selectedSpecies.id) {
                                nearbySpeciesIds.add(pf.properties.speciesId);
                              }
                            }
                            for (const rf of bedRowFeatures) {
                              if (rf.properties?.speciesId && rf.properties.speciesId !== selectedSpecies.id) {
                                nearbySpeciesIds.add(rf.properties.speciesId);
                              }
                            }
                            const goodNearby: PlantSpecies[] = [];
                            const badNearby: PlantSpecies[] = [];
                            const coexistNearby: PlantSpecies[] = [];
                            const conflictNearby: PlantSpecies[] = [];
                            for (const nid of nearbySpeciesIds) {
                              const nsp = getPlantById(nid);
                              if (!nsp) continue;
                              if (selectedSpecies.goodCompanions?.includes(nid)) goodNearby.push(nsp);
                              if (selectedSpecies.badCompanions?.includes(nid)) badNearby.push(nsp);
                              if (layer && nsp.forestGardenLayer) {
                                if (canLayersCoexist(layer, nsp.forestGardenLayer)) coexistNearby.push(nsp);
                                else if (layer === nsp.forestGardenLayer) conflictNearby.push(nsp);
                              }
                            }
                            return (
                              <div className="rounded-md bg-foreground/[0.03] border border-foreground/10 p-2 space-y-1.5">
                                {layer ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Skovhave-lag:</span>
                                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
                                      {FOREST_GARDEN_LAYER_LABELS[layer]}
                                    </span>
                                  </div>
                                ) : null}
                                {layer ? (
                                  <p className="text-[9px] text-foreground/35 leading-snug">{FOREST_GARDEN_LAYER_DESC[layer]}</p>
                                ) : null}
                                {goodNearby.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[9px] text-green-700 font-medium">✅ Gode naboer:</span>
                                    {goodNearby.map((g) => (
                                      <span key={g.id} className="inline-flex items-center gap-0.5 rounded bg-green-50 px-1 py-0.5 text-[9px] text-green-700">
                                        {g.icon ?? "🌱"} {g.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {badNearby.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[9px] text-red-600 font-medium">⛔ Dårlige naboer:</span>
                                    {badNearby.map((b) => (
                                      <span key={b.id} className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1 py-0.5 text-[9px] text-red-600">
                                        {b.icon ?? "🌱"} {b.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {coexistNearby.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[9px] text-blue-600 font-medium">🏔️ Sameksisterer (lag):</span>
                                    {coexistNearby.map((c) => (
                                      <span key={c.id} className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1 py-0.5 text-[9px] text-blue-600">
                                        {c.icon ?? "🌱"} {c.name} <span className="text-[8px] opacity-60">({c.forestGardenLayer ? FOREST_GARDEN_LAYER_LABELS[c.forestGardenLayer] : ""})</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {conflictNearby.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[9px] text-amber-600 font-medium">⚠️ Samme lag (konkurrerer):</span>
                                    {conflictNearby.map((c) => (
                                      <span key={c.id} className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 py-0.5 text-[9px] text-amber-600">
                                        {c.icon ?? "🌱"} {c.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {goodNearby.length === 0 && badNearby.length === 0 && coexistNearby.length === 0 && conflictNearby.length === 0 && nearbySpeciesIds.size > 0 ? (
                                  <p className="text-[9px] text-foreground/30">Ingen kendte interaktioner med nærliggende planter.</p>
                                ) : null}
                                {nearbySpeciesIds.size === 0 ? (
                                  <p className="text-[9px] text-foreground/30">Ingen eksisterende planter i nærheden.</p>
                                ) : null}
                              </div>
                            );
                          })()}

                          {/* Variety picker */}
                          {varieties.length > 0 ? (
                            <div>
                              <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide mb-0.5">Sort</label>
                              <select
                                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                                value={autoElementVarietyId ?? ""}
                                onChange={(e) => setAutoElementVarietyId(e.target.value || null)}
                              >
                                <option value="">Ingen bestemt sort</option>
                                {varieties.map((v) => (
                                  <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                              </select>
                            </div>
                          ) : null}

                          {/* Settings */}
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide mb-0.5">
                                Antal {autoElementCount === 0 ? "(auto)" : ""}
                              </label>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                                value={autoElementCount}
                                onChange={(e) => setAutoElementCount(Math.max(0, Number(e.target.value) || 0))}
                              />
                              <p className="text-[8px] text-foreground/30 mt-0.5">0 = fyld bedet</p>
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide mb-0.5">
                                Kantmargin (rod/stamme)
                              </label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  step={5}
                                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                                  value={autoElementEdgeMarginCm}
                                  onChange={(e) => setAutoElementEdgeMarginCm(Math.max(0, Number(e.target.value) || 0))}
                                />
                                <span className="text-[10px] text-foreground/40">cm</span>
                              </div>
                              <p className="text-[8px] text-foreground/30 mt-0.5">
                                {selectedSpecies?.forestGardenLayer === "canopy" || selectedSpecies?.forestGardenLayer === "sub-canopy" || selectedSpecies?.category === "tree"
                                  ? "Træer: kronens skygge rækker ud over bedet — kun stammen skal være inde"
                                  : selectedSpecies?.forestGardenLayer === "shrub" || selectedSpecies?.category === "bush"
                                    ? "Buske: grene kan rage lidt ud over bedkanten"
                                    : "Afstand fra plantens midte til bedkanten"}
                              </p>
                            </div>
                          </div>

                          {/* Preview info */}
                          {elementPreview ? (
                            <div className="rounded-md bg-foreground/[0.03] border border-foreground/10 p-2 space-y-1">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-foreground/50">Bedareal:</span>
                                <span className="font-medium">{elementPreview.bedAreaM2.toFixed(1)} m²</span>
                              </div>
                              <div className="flex justify-between text-[10px]">
                                <span className="text-foreground/50">Afstand:</span>
                                <span className="font-medium">{interElementSpacingCm} cm</span>
                              </div>
                              <div className="flex justify-between text-[10px]">
                                <span className="text-foreground/50">Maks. kapacitet:</span>
                                <span className="font-medium">{elementPreview.maxElements} stk</span>
                              </div>
                              <div className="flex justify-between text-[10px] font-semibold">
                                <span className="text-green-700">Placeres:</span>
                                <span className="text-green-700">{elementPreview.positions.length} stk</span>
                              </div>
                              {bedRowFeatures.length > 0 ? (
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-foreground/50">Rækker respekteret:</span>
                                  <span className="font-medium">{bedRowFeatures.length} stk</span>
                                </div>
                              ) : null}
                              {nearbyPointFeatures.length > 0 ? (
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-foreground/50">Nærliggende elementer:</span>
                                  <span className="font-medium">{nearbyPointFeatures.length} stk</span>
                                </div>
                              ) : null}
                              {elementPreview.obstacleWarnings.length > 0 ? (
                                <p className="text-[9px] text-amber-600">
                                  ⚠️ Blokeret af: {elementPreview.obstacleWarnings.join(", ")}
                                </p>
                              ) : null}
                              {elementPreview.warning ? (
                                <p className="text-[9px] text-amber-600">⚠️ {elementPreview.warning}</p>
                              ) : null}
                            </div>
                          ) : null}

                          {/* "Bed full" warning */}
                          {elementPreview && elementPreview.maxElements === 0 ? (
                            <div className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-3 text-center space-y-1">
                              <p className="text-sm font-bold text-red-700">🚫 Ingen plads</p>
                              <p className="text-[10px] text-red-600/80">
                                Der er ikke plads til {selectedSpecies.name} med {interElementSpacingCm} cm afstand
                                og {autoElementEdgeMarginCm} cm kantmargin.
                              </p>
                              <p className="text-[10px] text-red-600/60">
                                Prøv at sænke kantmargin, fjern eksisterende elementer, eller udvid bedet.
                              </p>
                              {selectedSpecies.forestGardenLayer ? (
                                <p className="text-[10px] text-blue-600/70 mt-1">
                                  💡 Planter i kompatible skovhave-lag kan plantes under kronedækket.
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          {/* Create button */}
                          <button
                            type="button"
                            className="w-full rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={!elementPreview || elementPreview.positions.length === 0}
                            onClick={() => {
                              if (autoElementSpeciesId) {
                                executeAutoElementPlacement(autoElementSpeciesId, autoElementVarietyId, autoElementCount, autoElementEdgeMarginCm);
                                setAutoElementOpen(false);
                                setAutoElementSpeciesId(null);
                                setAutoElementVarietyId(null);
                              }
                            }}
                          >
                            🌿 Placér {elementPreview?.positions.length ?? 0} {selectedSpecies.name}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })() : null}
              </div>
              </>
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

                {/* ── Konflikter for dette element ── */}
                {selected.feature.properties?.speciesId && selected.feature.geometry?.type === "Point" ? (() => {
                  const myId = selected.gardenosId;
                  const allConflicts = detectPlantConflicts(layoutForContainment.features);
                  const myConflicts = allConflicts.filter((c) => c.featureIdA === myId || c.featureIdB === myId);
                  if (myConflicts.length === 0) return null;
                  const worstSeverity = Math.max(...myConflicts.map((c) => c.severity));
                  const borderColor = worstSeverity === 3 ? "border-red-400" : worstSeverity === 2 ? "border-orange-400" : "border-yellow-400";
                  const bgColor = worstSeverity === 3 ? "bg-red-50/60" : worstSeverity === 2 ? "bg-orange-50/60" : "bg-yellow-50/60";
                  return (
                    <div className={`rounded-lg border-2 ${borderColor} ${bgColor} p-2.5 space-y-2`}>
                      <p className="text-[10px] font-bold text-foreground/70">
                        {worstSeverity === 3 ? "🔴" : worstSeverity === 2 ? "🟠" : "🟡"} {myConflicts.length} konflikt{myConflicts.length > 1 ? "er" : ""} fundet
                      </p>
                      {myConflicts.map((c, idx) => {
                        const other = c.featureIdA === myId ? c.speciesB : c.speciesA;
                        const icon = c.type === "spacing" ? "📏" : c.type === "bad-companion" ? "⛔" : "⚠️";
                        const typeLabel = c.type === "spacing" ? "Afstand" : c.type === "bad-companion" ? "Dårlig nabo" : "Lag-konkurrence";
                        return (
                          <div key={idx} className="rounded-md bg-white/60 border border-foreground/10 p-2 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">{icon}</span>
                              <span className="text-[10px] font-semibold text-foreground/70">{typeLabel}</span>
                              <span className="text-[10px] text-foreground/40 ml-auto">{other.icon ?? "🌱"} {other.name}</span>
                            </div>
                            <p className="text-[10px] text-foreground/60">{c.message}</p>
                            <p className="text-[10px] text-foreground/40 italic">💡 {c.suggestion}</p>
                            {c.type === "spacing" ? (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${c.severity === 3 ? "bg-red-500" : c.severity === 2 ? "bg-orange-400" : "bg-yellow-400"}`}
                                    style={{ width: `${Math.min(100, (c.distanceM / c.requiredM) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-foreground/40 shrink-0">{c.distanceM.toFixed(1)}m / {c.requiredM.toFixed(1)}m</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
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

            {/* ── Seedbed-specific fields ── */}
            {selectedCategory === "seedbed" ? (
              <>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Såmetode</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.sowingMethod ?? ""}
                    onChange={(e) => updateSelectedProperty({ sowingMethod: e.target.value })}
                  >
                    <option value="">Ikke angivet</option>
                    <option value="bredsåning">Bredsåning</option>
                    <option value="rækkesåning">Rækkesåning</option>
                    <option value="priklet">Priklet / udplantet</option>
                    <option value="direkte">Direkte såning</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Sæson / år</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                    value={selected.feature.properties?.bedSeason ?? ""}
                    onChange={(e) => updateSelectedProperty({ bedSeason: e.target.value })}
                    placeholder="Fx 2026, Forår 2026"
                  />
                </div>
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
              <div className="mt-1 relative">
                <textarea
                  className={`min-h-[80px] w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm shadow-sm ${draftNotesDirty ? "border-amber-400" : "border-border"}`}
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  onBlur={() => commitDraftNotes()}
                  placeholder={selectedIsInfra ? "Fx dybde/placering/kommentar" : "Fx gødes i april / skal beskæres"}
                />
                {draftNotesDirty && (
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-accent/80 transition-colors"
                    onClick={() => commitDraftNotes()}
                  >
                    Gem
                  </button>
                )}
              </div>
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

        {sidebarTab === "scan" ? (
          <div className="mt-3 space-y-3">
            {/* Sub-tab: Scan / Bibliotek */}
            <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm">
              <button
                type="button"
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
                  scanSubTab === "scan"
                    ? "bg-accent text-white shadow-sm"
                    : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
                }`}
                onClick={() => setScanSubTab("scan")}
              >
                📷 Scan
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
                  scanSubTab === "library"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
                }`}
                onClick={() => setScanSubTab("library")}
              >
                📚 Bibliotek {scanHistory.length > 0 ? `(${scanHistory.length})` : ""}
              </button>
            </div>

            {scanSubTab === "scan" ? (
            <div>
              {/* Mode switcher */}
              <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm mb-3">
                <button
                  type="button"
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
                    scanMode === "seed-packet"
                      ? "bg-accent text-white shadow-sm"
                      : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
                  }`}
                  onClick={() => { setScanMode("seed-packet"); setScanResult(null); setScanError(null); setScanSaved(false); }}
                >
                  🌱 Frøpose
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
                    scanMode === "identify"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
                  }`}
                  onClick={() => { setScanMode("identify"); setScanResult(null); setScanError(null); setScanSaved(false); }}
                >
                  🔍 Identificér
                </button>
              </div>

              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">
                {scanMode === "identify" ? "🌿 Identificér plante" : "📷 Scan frøpose / etiket"}
              </label>
              <p className="text-[10px] text-foreground/40 mb-3">
                {scanMode === "identify"
                  ? "Tag et foto af en plante i haven \u2014 AI\u2019en identificerer arten og fort\u00e6ller om det er ukrudt, spiseligt, giftigt m.m."
                  : "Tag et foto af en fr\u00f8pose, plantelabel eller emballage \u2014 AI\u2019en afl\u00e6ser informationen og opretter planten for dig."}
              </p>

              {/* Hidden file input */}
              <input
                ref={scanInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setScanResult(null);
                  setScanError(null);
                  setScanSaved(false);
                  const reader = new FileReader();
                  reader.onload = () => {
                    setScanImage(reader.result as string);
                  };
                  reader.readAsDataURL(file);
                  // Reset so same file can be re-selected
                  e.target.value = "";
                }}
              />

              {/* Capture buttons */}
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-xs text-accent-dark font-medium hover:bg-accent/20 transition-colors flex items-center justify-center gap-2"
                  onClick={() => scanInputRef.current?.click()}
                >
                  📷 Tag foto / vælg billede
                </button>
                {scanImage ? (
                  <button
                    type="button"
                    className="rounded-lg border border-foreground/20 bg-foreground/5 px-3 py-2.5 text-xs text-foreground/60 hover:bg-foreground/10 transition-colors"
                    onClick={() => { setScanImage(null); setScanResult(null); setScanError(null); setScanSaved(false); }}
                  >
                    ✕ Nulstil
                  </button>
                ) : null}
              </div>

              {/* Image preview */}
              {scanImage ? (
                <div className="mb-3">
                  <div className="rounded-lg border border-border overflow-hidden bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={scanImage} alt="Scannet billede" className="w-full max-h-48 object-contain" />
                  </div>

                  {/* Analyze button */}
                  {!scanResult && !scanAnalyzing ? (
                    <button
                      type="button"
                      className="mt-2 w-full rounded-lg bg-accent px-3 py-2.5 text-xs text-white font-semibold hover:bg-accent/90 transition-colors flex items-center justify-center gap-2 shadow-sm"
                      onClick={async () => {
                        setScanAnalyzing(true);
                        setScanError(null);
                        try {
                          const res = await fetch("/api/analyze-image", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ image: scanImage, type: scanMode === "identify" ? "plant-photo" : "seed-packet" }),
                          });
                          const data = await res.json();
                          if (!res.ok || data.error) {
                            const msg = data.needsConfig
                              ? "OPENAI_API_KEY er ikke konfigureret. Tilføj den som miljøvariabel i Vercel."
                              : data.raw
                                ? `${data.error}\n\nRåt AI-svar: ${String(data.raw).slice(0, 200)}`
                                : data.error || "Ukendt fejl fra AI";
                            setScanError(msg);
                          } else {
                            setScanResult(data);
                            // Auto-save to scan history
                            addToScanHistory(
                              scanMode === "identify" ? "plant-photo" : "seed-packet",
                              scanImage!,
                              data,
                            );
                          }
                        } catch (err) {
                          setScanError(err instanceof Error ? err.message : "Netværksfejl");
                        }
                        setScanAnalyzing(false);
                      }}
                    >
                      {scanMode === "identify" ? "🌿 Identificér plante" : "🧠 Analysér frøpose"}
                    </button>
                  ) : null}

                  {scanAnalyzing ? (
                    <div className="mt-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-3 text-center">
                      <div className="text-sm animate-pulse">🧠</div>
                      <p className="text-[11px] text-accent-dark mt-1">Analyserer billede…</p>
                      <p className="text-[9px] text-foreground/40 mt-0.5">Dette kan tage 5–15 sekunder</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Error */}
              {scanError ? (
                <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 mb-3">
                  <p className="text-[11px] text-red-700">⚠️ {scanError}</p>
                </div>
              ) : null}

              {/* Results — seed packet mode */}
              {scanResult && scanMode === "seed-packet" ? (
                <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-2 mb-3">
                  <p className="text-[11px] font-semibold text-accent-dark">✅ Data fundet fra frøpose</p>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {scanResult.speciesName ? (
                      <div className="col-span-2">
                        <span className="text-[9px] text-foreground/40 uppercase">Planteart</span>
                        <p className="text-xs font-semibold text-foreground/80">{String(scanResult.speciesName)}</p>
                      </div>
                    ) : null}
                    {scanResult.name ? (
                      <div className="col-span-2">
                        <span className="text-[9px] text-foreground/40 uppercase">Sort</span>
                        <p className="text-xs font-medium text-foreground/70">{String(scanResult.name)}</p>
                      </div>
                    ) : null}
                    {scanResult.description ? (
                      <div className="col-span-2">
                        <span className="text-[9px] text-foreground/40 uppercase">Beskrivelse</span>
                        <p className="text-[10px] text-foreground/60">{String(scanResult.description)}</p>
                      </div>
                    ) : null}
                    {scanResult.sowStart || scanResult.sowEnd ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Såperiode</span>
                        <p className="text-xs text-foreground/70">
                          {scanResult.sowStart ? `Mnd ${scanResult.sowStart}` : "?"}–{scanResult.sowEnd ? `${scanResult.sowEnd}` : "?"}
                        </p>
                      </div>
                    ) : null}
                    {scanResult.harvestStart || scanResult.harvestEnd ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Høstperiode</span>
                        <p className="text-xs text-foreground/70">
                          {scanResult.harvestStart ? `Mnd ${scanResult.harvestStart}` : "?"}–{scanResult.harvestEnd ? `${scanResult.harvestEnd}` : "?"}
                        </p>
                      </div>
                    ) : null}
                    {scanResult.daysToHarvest ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Dage til høst</span>
                        <p className="text-xs text-foreground/70">{String(scanResult.daysToHarvest)} dage</p>
                      </div>
                    ) : null}
                    {scanResult.spacingCm ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Afstand</span>
                        <p className="text-xs text-foreground/70">{String(scanResult.spacingCm)} cm</p>
                      </div>
                    ) : null}
                    {scanResult.taste ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Smag</span>
                        <p className="text-xs text-foreground/70">{String(scanResult.taste)}</p>
                      </div>
                    ) : null}
                    {scanResult.color ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Farve</span>
                        <p className="text-xs text-foreground/70">{String(scanResult.color)}</p>
                      </div>
                    ) : null}
                    {scanResult.seedSource ? (
                      <div className="col-span-2">
                        <span className="text-[9px] text-foreground/40 uppercase">Frøleverandør</span>
                        <p className="text-xs text-foreground/70">{String(scanResult.seedSource)}</p>
                      </div>
                    ) : null}
                    {scanResult.notes ? (
                      <div className="col-span-2">
                        <span className="text-[9px] text-foreground/40 uppercase">Bemærkninger</span>
                        <p className="text-[10px] text-foreground/60 italic">{String(scanResult.notes)}</p>
                      </div>
                    ) : null}
                  </div>

                  {/* Save to plant database */}
                  {!scanSaved ? (
                    <button
                      type="button"
                      className="mt-2 w-full rounded-lg bg-accent px-3 py-2.5 text-xs text-white font-semibold hover:bg-accent/90 transition-colors shadow-sm"
                      onClick={() => {
                        const speciesName = String(scanResult.speciesName || scanResult.name || "Ukendt plante");
                        const speciesId = speciesName.toLowerCase().replace(/[^a-zæøåü0-9]+/g, "-").replace(/-+$/, "");
                        const varietyName = String(scanResult.name || "Standard");
                        const varietyId = varietyName.toLowerCase().replace(/[^a-zæøåü0-9]+/g, "-").replace(/-+$/, "");

                        // Check if species already exists
                        const existing = getPlantById(speciesId);

                        if (existing) {
                          // Add as new variety to existing species
                          const variety: PlantVariety = {
                            id: varietyId,
                            name: varietyName,
                            description: scanResult.description ? String(scanResult.description) : undefined,
                            daysToHarvest: scanResult.daysToHarvest ? Number(scanResult.daysToHarvest) : undefined,
                            spacingCm: scanResult.spacingCm ? Number(scanResult.spacingCm) : undefined,
                            taste: scanResult.taste ? String(scanResult.taste) : undefined,
                            color: scanResult.color ? String(scanResult.color) : undefined,
                            seedSource: scanResult.seedSource ? String(scanResult.seedSource) : undefined,
                            notes: scanResult.notes ? String(scanResult.notes) : undefined,
                            sowStart: scanResult.sowStart ? Number(scanResult.sowStart) : undefined,
                            sowEnd: scanResult.sowEnd ? Number(scanResult.sowEnd) : undefined,
                            harvestStart: scanResult.harvestStart ? Number(scanResult.harvestStart) : undefined,
                            harvestEnd: scanResult.harvestEnd ? Number(scanResult.harvestEnd) : undefined,
                            addedVia: "seed-packet",
                          };
                          addVarietyToSpecies(speciesId, variety);
                        } else {
                          // Create new species + variety
                          const newSpecies: PlantSpecies = {
                            id: speciesId,
                            name: speciesName,
                            category: "vegetable",
                            description: scanResult.description ? String(scanResult.description) : undefined,
                            spacingCm: scanResult.spacingCm ? Number(scanResult.spacingCm) : undefined,
                            sowOutdoor: scanResult.sowStart && scanResult.sowEnd ? { from: Number(scanResult.sowStart), to: Number(scanResult.sowEnd) } : undefined,
                            harvest: scanResult.harvestStart && scanResult.harvestEnd ? { from: Number(scanResult.harvestStart), to: Number(scanResult.harvestEnd) } : undefined,
                            source: "ai",
                            icon: "🌱",
                            varieties: [{
                              id: varietyId,
                              name: varietyName,
                              description: scanResult.description ? String(scanResult.description) : undefined,
                              daysToHarvest: scanResult.daysToHarvest ? Number(scanResult.daysToHarvest) : undefined,
                              spacingCm: scanResult.spacingCm ? Number(scanResult.spacingCm) : undefined,
                              taste: scanResult.taste ? String(scanResult.taste) : undefined,
                              color: scanResult.color ? String(scanResult.color) : undefined,
                              seedSource: scanResult.seedSource ? String(scanResult.seedSource) : undefined,
                              notes: scanResult.notes ? String(scanResult.notes) : undefined,
                              sowStart: scanResult.sowStart ? Number(scanResult.sowStart) : undefined,
                              sowEnd: scanResult.sowEnd ? Number(scanResult.sowEnd) : undefined,
                              harvestStart: scanResult.harvestStart ? Number(scanResult.harvestStart) : undefined,
                              harvestEnd: scanResult.harvestEnd ? Number(scanResult.harvestEnd) : undefined,
                              addedVia: "seed-packet",
                            }],
                          };
                          addOrUpdateCustomPlant(newSpecies);
                        }

                        setPlantDataVersion((v) => v + 1);
                        setScanSaved(true);
                      }}
                    >
                      🌱 Gem i plantedatabasen
                    </button>
                  ) : (
                    <div className="mt-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-center">
                      <p className="text-[11px] text-green-700 font-medium">✅ Gemt! Du finder den under 🌱 Planter.</p>
                      <button
                        type="button"
                        className="mt-1 text-[10px] text-accent underline"
                        onClick={() => { setSidebarTab("plants"); }}
                      >
                        Gå til Planter →
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Results — plant identification mode */}
              {scanResult && scanMode === "identify" ? (
                <div className="rounded-lg border border-emerald-300/40 bg-emerald-50/50 p-3 space-y-2 mb-3">
                  <p className="text-[11px] font-semibold text-emerald-700">🌿 Plante identificeret</p>

                  <div className="space-y-1.5">
                    {scanResult.speciesName ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Planteart</span>
                        <p className="text-sm font-bold text-foreground/90">{String(scanResult.speciesName)}</p>
                      </div>
                    ) : null}
                    {scanResult.latinName ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Latinsk navn</span>
                        <p className="text-xs italic text-foreground/60">{String(scanResult.latinName)}</p>
                      </div>
                    ) : null}
                    {scanResult.name && scanResult.name !== scanResult.speciesName ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Sort / variant</span>
                        <p className="text-xs font-medium text-foreground/70">{String(scanResult.name)}</p>
                      </div>
                    ) : null}

                    {/* Classification badges */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {scanResult.isWeed !== undefined ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          scanResult.isWeed ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                        }`}>
                          {scanResult.isWeed ? "🌾 Ukrudt" : "✅ Ikke ukrudt"}
                        </span>
                      ) : null}
                      {scanResult.isEdible !== undefined ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          scanResult.isEdible ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {scanResult.isEdible ? "🍽 Spiselig" : "🚫 Ikke spiselig"}
                        </span>
                      ) : null}
                      {scanResult.isPoisonous !== undefined && scanResult.isPoisonous ? (
                        <span className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-medium">
                          ☠️ Giftig
                        </span>
                      ) : null}
                      {scanResult.isInvasive !== undefined && scanResult.isInvasive ? (
                        <span className="inline-block rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[10px] font-medium">
                          ⚠️ Invasiv
                        </span>
                      ) : null}
                    </div>

                    {scanResult.description ? (
                      <div className="pt-1">
                        <span className="text-[9px] text-foreground/40 uppercase">Beskrivelse</span>
                        <p className="text-[10px] text-foreground/60 leading-relaxed">{String(scanResult.description)}</p>
                      </div>
                    ) : null}
                    {scanResult.habitat ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Vokser typisk</span>
                        <p className="text-[10px] text-foreground/60">{String(scanResult.habitat)}</p>
                      </div>
                    ) : null}
                    {scanResult.color ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Farve</span>
                        <p className="text-xs text-foreground/70">{String(scanResult.color)}</p>
                      </div>
                    ) : null}
                    {scanResult.heightCm ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Estimeret højde</span>
                        <p className="text-xs text-foreground/70">ca. {String(scanResult.heightCm)} cm</p>
                      </div>
                    ) : null}
                    {scanResult.careAdvice ? (
                      <div className="pt-1">
                        <span className="text-[9px] text-foreground/40 uppercase">Plejeråd / anbefaling</span>
                        <p className="text-[10px] text-foreground/60 leading-relaxed">{String(scanResult.careAdvice)}</p>
                      </div>
                    ) : null}
                    {scanResult.notes ? (
                      <div>
                        <span className="text-[9px] text-foreground/40 uppercase">Bemærkninger</span>
                        <p className="text-[10px] text-foreground/60 italic">{String(scanResult.notes)}</p>
                      </div>
                    ) : null}
                    {scanResult.confidence ? (
                      <p className="text-[9px] text-foreground/30 pt-1">Sikkerhed: {String(scanResult.confidence)}</p>
                    ) : null}
                  </div>

                  {/* Save identified plant to database */}
                  {!scanSaved ? (
                    scanSaveExpanded ? (
                      <div className="mt-2 rounded-lg border border-accent/30 bg-accent/5 p-2.5 space-y-2">
                        <p className="text-[10px] font-medium text-accent-dark">Vælg kategori for planten:</p>
                        <div className="grid grid-cols-2 gap-1">
                          {(Object.entries(PLANT_CATEGORY_LABELS) as [PlantCategory, string][]).map(([cat, label]) => (
                            <button
                              key={cat}
                              type="button"
                              className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition-all ${
                                scanSaveCategory === cat
                                  ? "border-accent bg-accent text-white"
                                  : "border-border bg-background text-foreground/60 hover:bg-foreground/5"
                              }`}
                              onClick={() => setScanSaveCategory(cat)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="flex-1 rounded-lg bg-emerald-600 text-white px-2 py-2 text-xs font-semibold hover:bg-emerald-700 transition-colors"
                            onClick={() => {
                              const speciesName = String(scanResult.speciesName || scanResult.name || "Ukendt plante");
                              const speciesId = speciesName.toLowerCase().replace(/[^a-zæøåü0-9]+/g, "-").replace(/-+$/, "");

                              const existing = getPlantById(speciesId);

                              if (existing) {
                                // Add as variety to existing species
                                const variety: PlantVariety = {
                                  id: "identified-" + Date.now().toString(36),
                                  name: speciesName,
                                  description: scanResult.description ? String(scanResult.description) : undefined,
                                  color: scanResult.color ? String(scanResult.color) : undefined,
                                  heightCm: scanResult.heightCm ? Number(scanResult.heightCm) : undefined,
                                  notes: [
                                    scanResult.careAdvice ? `Plejeråd: ${String(scanResult.careAdvice)}` : null,
                                    scanResult.notes ? String(scanResult.notes) : null,
                                  ].filter(Boolean).join(". ") || undefined,
                                  addedVia: "plant-photo",
                                };
                                addVarietyToSpecies(speciesId, variety);
                              } else {
                                const newSpecies: PlantSpecies = {
                                  id: speciesId,
                                  name: speciesName,
                                  latinName: scanResult.latinName ? String(scanResult.latinName) : undefined,
                                  category: scanSaveCategory,
                                  description: [
                                    scanResult.description ? String(scanResult.description) : "",
                                    scanResult.careAdvice ? `Plejeråd: ${String(scanResult.careAdvice)}` : "",
                                    scanResult.habitat ? `Habitat: ${String(scanResult.habitat)}` : "",
                                  ].filter(Boolean).join("\n"),
                                  spacingCm: scanResult.heightCm ? Number(scanResult.heightCm) : undefined,
                                  source: "ai",
                                  icon: scanResult.isWeed ? "🌾" : scanResult.isEdible ? "🥬" : "🌿",
                                  varieties: [{
                                    id: "identified",
                                    name: speciesName,
                                    description: scanResult.description ? String(scanResult.description) : undefined,
                                    color: scanResult.color ? String(scanResult.color) : undefined,
                                    heightCm: scanResult.heightCm ? Number(scanResult.heightCm) : undefined,
                                    notes: [
                                      scanResult.isWeed ? "Ukrudt" : null,
                                      scanResult.isEdible ? "Spiselig" : null,
                                      scanResult.isPoisonous ? "⚠️ Giftig" : null,
                                      scanResult.isInvasive ? "⚠️ Invasiv" : null,
                                      scanResult.careAdvice ? `Plejeråd: ${String(scanResult.careAdvice)}` : null,
                                      scanResult.notes ? String(scanResult.notes) : null,
                                    ].filter(Boolean).join(". "),
                                    addedVia: "plant-photo",
                                  }],
                                };
                                addOrUpdateCustomPlant(newSpecies);
                              }

                              setPlantDataVersion((v) => v + 1);
                              setScanSaved(true);
                              setScanSaveExpanded(false);
                            }}
                          >
                            ✅ Gem som {PLANT_CATEGORY_LABELS[scanSaveCategory]}
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-border px-2 py-2 text-xs text-foreground/50 hover:bg-foreground/5"
                            onClick={() => setScanSaveExpanded(false)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-xs text-white font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
                        onClick={() => setScanSaveExpanded(true)}
                      >
                        🌿 Gem i plantedatabasen…
                      </button>
                    )
                  ) : (
                    <div className="mt-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-center">
                      <p className="text-[11px] text-green-700 font-medium">✅ Gemt som {PLANT_CATEGORY_LABELS[scanSaveCategory]}! Du finder den under 🌱 Planter.</p>
                      <button
                        type="button"
                        className="mt-1 text-[10px] text-accent underline"
                        onClick={() => { setSidebarTab("plants"); }}
                      >
                        Gå til Planter →
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Help text when no image */}
              {!scanImage && !scanResult ? (
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] font-medium text-foreground/60 mb-1.5">S\u00e5dan virker det:</p>
                  {scanMode === "identify" ? (
                    <ol className="text-[10px] text-foreground/50 space-y-1 list-decimal ml-3">
                      <li>Tag et foto af planten i din have</li>
                      <li>AI\u2019en identificerer art, ukrudt/spiselig/giftig</li>
                      <li>F\u00e5 plejer\u00e5d og anbefaling</li>
                    </ol>
                  ) : (
                    <ol className="text-[10px] text-foreground/50 space-y-1 list-decimal ml-3">
                      <li>Tag et foto af fr\u00f8posen eller etiketten</li>
                      <li>AI\u2019en afl\u00e6ser sort, s\u00e5/h\u00f8st-tider, afstand m.m.</li>
                      <li>Gem planten i din database med \u00e9t klik</li>
                      <li>Brug den n\u00e5r du planl\u00e6gger dine bede</li>
                    </ol>
                  )}
                  <p className="text-[9px] text-foreground/30 mt-2 italic">Kræver at OPENAI_API_KEY er konfigureret som miljøvariabel.</p>
                </div>
              ) : null}
            </div>
            ) : null}

            {/* ═══════════════════════════════════════════════════════════ */}
            {/* Sub-tab: Bibliotek – scan history                          */}
            {/* ═══════════════════════════════════════════════════════════ */}
            {scanSubTab === "library" ? (
              <div className="space-y-2">
                <p className="text-[10px] text-foreground/40">
                  Alle dine scannede planter og frøposer gemmes her. Du kan overføre dem til plantedatabasen med den rigtige kategori.
                </p>

                {scanHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-3xl mb-2">📚</p>
                    <p className="text-sm text-foreground/50">Ingen scans endnu.</p>
                    <p className="text-[10px] text-foreground/30 mt-1">Gå til {"\"📷 Scan\""} og tag et billede.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto sidebar-scroll">
                    {scanHistory.map((item) => {
                      const isExpanded = expandedHistoryId === item.id;
                      const isTransferring = transferringId === item.id;
                      const typeLabel = item.type === "seed-packet" ? "🏷️ Frøpose" : item.type === "plant-photo" ? "🌿 Plante" : "📦 Produkt";
                      const dateStr = new Date(item.scannedAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

                      return (
                        <div key={item.id} className={`rounded-lg border ${item.transferred ? "border-green-200 bg-green-50/30" : "border-border"} overflow-hidden`}>
                          {/* Compact row */}
                          <div className="flex items-center gap-2 p-2">
                            <button
                              type="button"
                              className="flex-1 flex items-center gap-2 text-left hover:bg-foreground/5 transition-colors rounded min-w-0"
                              onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.thumbnail} alt="" className="w-10 h-10 rounded object-cover shrink-0 border border-border" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground/80 truncate">{item.name}</p>
                                <p className="text-[9px] text-foreground/40">{typeLabel} · {dateStr}</p>
                              </div>
                              {item.transferred ? (
                                <span className="text-[9px] text-green-600 font-medium shrink-0">✅</span>
                              ) : (
                                <span className="text-[9px] text-amber-500 font-medium shrink-0">⏳</span>
                              )}
                              <span className="text-foreground/30 text-xs shrink-0">{isExpanded ? "▾" : "›"}</span>
                            </button>
                            {/* Quick delete */}
                            {confirmDeleteHistoryId === item.id ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <button type="button" className="text-[9px] px-1.5 py-0.5 rounded bg-red-500 text-white" onClick={(e) => { e.stopPropagation(); removeScanHistoryItem(item.id); }}>Slet</button>
                                <button type="button" className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/60" onClick={(e) => { e.stopPropagation(); setConfirmDeleteHistoryId(null); }}>Nej</button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="text-sm text-foreground/20 hover:text-red-500 transition-colors shrink-0 p-1"
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteHistoryId(item.id); }}
                                title="Slet scan"
                              >
                                🗑
                              </button>
                            )}
                          </div>

                          {/* Expanded detail */}
                          {isExpanded ? (
                            <div className="border-t border-border px-3 py-2 space-y-2 bg-foreground/[0.02]">
                              {/* Image */}
                              <div className="rounded-lg overflow-hidden border border-border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={item.thumbnail} alt="" className="w-full max-h-32 object-contain bg-foreground/5" />
                              </div>

                              {/* Key data */}
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                {item.data.speciesName ? (
                                  <div className="col-span-2">
                                    <span className="text-[9px] text-foreground/40 uppercase">Art</span>
                                    <p className="text-xs font-semibold text-foreground/80">{String(item.data.speciesName)}</p>
                                  </div>
                                ) : null}
                                {item.data.latinName ? (
                                  <div className="col-span-2">
                                    <span className="text-[9px] text-foreground/40 uppercase">Latin</span>
                                    <p className="text-[10px] italic text-foreground/50">{String(item.data.latinName)}</p>
                                  </div>
                                ) : null}
                                {item.data.description ? (
                                  <div className="col-span-2">
                                    <span className="text-[9px] text-foreground/40 uppercase">Beskrivelse</span>
                                    <p className="text-[10px] text-foreground/60">{String(item.data.description)}</p>
                                  </div>
                                ) : null}
                                {item.data.taste ? (<div><span className="text-[9px] text-foreground/40 uppercase">Smag</span><p className="text-[10px] text-foreground/60">{String(item.data.taste)}</p></div>) : null}
                                {item.data.color ? (<div><span className="text-[9px] text-foreground/40 uppercase">Farve</span><p className="text-[10px] text-foreground/60">{String(item.data.color)}</p></div>) : null}
                                {item.data.seedSource ? (<div className="col-span-2"><span className="text-[9px] text-foreground/40 uppercase">Leverandør</span><p className="text-[10px] text-foreground/60">{String(item.data.seedSource)}</p></div>) : null}
                                {item.data.careAdvice ? (<div className="col-span-2"><span className="text-[9px] text-foreground/40 uppercase">Plejeråd</span><p className="text-[10px] text-foreground/60">{String(item.data.careAdvice)}</p></div>) : null}
                                {item.data.confidence ? (<div className="col-span-2"><span className="text-[9px] text-foreground/30">Sikkerhed: {String(item.data.confidence)}</span></div>) : null}
                              </div>

                              {/* Classification badges for plant-photo */}
                              {item.type === "plant-photo" ? (
                                <div className="flex flex-wrap gap-1">
                                  {item.data.isWeed !== undefined ? <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium ${item.data.isWeed ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{item.data.isWeed ? "🌾 Ukrudt" : "✅ Ikke ukrudt"}</span> : null}
                                  {item.data.isEdible !== undefined ? <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium ${item.data.isEdible ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{item.data.isEdible ? "🍽 Spiselig" : "🚫 Ikke spiselig"}</span> : null}
                                  {item.data.isPoisonous ? <span className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[9px] font-medium">☠️ Giftig</span> : null}
                                  {item.data.isInvasive ? <span className="inline-block rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[9px] font-medium">⚠️ Invasiv</span> : null}
                                </div>
                              ) : null}

                              {/* Transfer to plant database */}
                              {!item.transferred ? (
                                isTransferring ? (
                                  <div className="rounded-lg border border-accent/30 bg-accent/5 p-2 space-y-2">
                                    <p className="text-[10px] font-medium text-accent-dark">Vælg kategori:</p>
                                    <div className="grid grid-cols-2 gap-1">
                                      {(Object.entries(PLANT_CATEGORY_LABELS) as [PlantCategory, string][]).map(([cat, label]) => (
                                        <button
                                          key={cat}
                                          type="button"
                                          className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition-all ${
                                            transferCategory === cat
                                              ? "border-accent bg-accent text-white"
                                              : "border-border bg-background text-foreground/60 hover:bg-foreground/5"
                                          }`}
                                          onClick={() => setTransferCategory(cat)}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        className="flex-1 rounded-lg bg-accent text-white px-2 py-2 text-xs font-semibold hover:bg-accent/90 transition-colors"
                                        onClick={() => {
                                          const d = item.data;
                                          const speciesName = String(d.speciesName || d.name || "Ukendt");
                                          const speciesId = speciesName.toLowerCase().replace(/[^a-zæøåü0-9]+/g, "-").replace(/-+$/, "");
                                          const varietyName = String(d.name || speciesName);
                                          const varietyId = varietyName.toLowerCase().replace(/[^a-zæøåü0-9]+/g, "-").replace(/-+$/, "");

                                          const existing = getPlantById(speciesId);

                                          if (existing) {
                                            const variety: PlantVariety = {
                                              id: varietyId + "-" + Date.now().toString(36),
                                              name: varietyName,
                                              description: d.description ? String(d.description) : undefined,
                                              daysToHarvest: d.daysToHarvest ? Number(d.daysToHarvest) : undefined,
                                              spacingCm: d.spacingCm ? Number(d.spacingCm) : undefined,
                                              taste: d.taste ? String(d.taste) : undefined,
                                              color: d.color ? String(d.color) : undefined,
                                              seedSource: d.seedSource ? String(d.seedSource) : undefined,
                                              heightCm: d.heightCm ? Number(d.heightCm) : undefined,
                                              notes: d.notes ? String(d.notes) : undefined,
                                              sowStart: d.sowStart ? Number(d.sowStart) : undefined,
                                              sowEnd: d.sowEnd ? Number(d.sowEnd) : undefined,
                                              harvestStart: d.harvestStart ? Number(d.harvestStart) : undefined,
                                              harvestEnd: d.harvestEnd ? Number(d.harvestEnd) : undefined,
                                              addedVia: item.type === "seed-packet" ? "seed-packet" : "plant-photo",
                                            };
                                            addVarietyToSpecies(speciesId, variety);
                                          } else {
                                            const icon = item.type === "plant-photo"
                                              ? (d.isWeed ? "🌾" : d.isEdible ? "🥬" : "🌿")
                                              : "🌱";
                                            const newSpecies: PlantSpecies = {
                                              id: speciesId,
                                              name: speciesName,
                                              latinName: d.latinName ? String(d.latinName) : undefined,
                                              category: transferCategory,
                                              description: [
                                                d.description ? String(d.description) : "",
                                                d.careAdvice ? `Plejeråd: ${String(d.careAdvice)}` : "",
                                              ].filter(Boolean).join("\n") || undefined,
                                              spacingCm: d.spacingCm ? Number(d.spacingCm) : undefined,
                                              sowOutdoor: d.sowStart && d.sowEnd ? { from: Number(d.sowStart), to: Number(d.sowEnd) } : undefined,
                                              harvest: d.harvestStart && d.harvestEnd ? { from: Number(d.harvestStart), to: Number(d.harvestEnd) } : undefined,
                                              source: "ai",
                                              icon,
                                              varieties: [{
                                                id: varietyId,
                                                name: varietyName,
                                                description: d.description ? String(d.description) : undefined,
                                                daysToHarvest: d.daysToHarvest ? Number(d.daysToHarvest) : undefined,
                                                spacingCm: d.spacingCm ? Number(d.spacingCm) : undefined,
                                                taste: d.taste ? String(d.taste) : undefined,
                                                color: d.color ? String(d.color) : undefined,
                                                seedSource: d.seedSource ? String(d.seedSource) : undefined,
                                                heightCm: d.heightCm ? Number(d.heightCm) : undefined,
                                                notes: d.notes ? String(d.notes) : undefined,
                                                sowStart: d.sowStart ? Number(d.sowStart) : undefined,
                                                sowEnd: d.sowEnd ? Number(d.sowEnd) : undefined,
                                                harvestStart: d.harvestStart ? Number(d.harvestStart) : undefined,
                                                harvestEnd: d.harvestEnd ? Number(d.harvestEnd) : undefined,
                                                addedVia: item.type === "seed-packet" ? "seed-packet" : "plant-photo",
                                              }],
                                            };
                                            console.log("[ScanTransfer] Creating new species:", JSON.stringify(newSpecies, null, 2));
                                            addOrUpdateCustomPlant(newSpecies);
                                          }

                                          // Verify it was saved
                                          const verify = getAllPlants();
                                          const found = verify.find((p) => p.id === speciesId);
                                          console.log("[ScanTransfer] Verify after save:", found ? `✅ Found '${found.name}' in category '${found.category}'` : "❌ NOT FOUND");
                                          console.log("[ScanTransfer] Total plants:", verify.length);

                                          setPlantDataVersion((v) => v + 1);
                                          markScanTransferred(item.id, transferCategory);
                                        }}
                                      >
                                        ✅ Overfør som {PLANT_CATEGORY_LABELS[transferCategory]}
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded-lg border border-border px-2 py-2 text-xs text-foreground/50 hover:bg-foreground/5"
                                        onClick={() => setTransferringId(null)}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="w-full rounded-lg border-2 border-dashed border-accent/30 bg-accent/5 px-3 py-2 text-xs font-medium text-accent-dark hover:bg-accent/10 hover:border-accent/50 transition-all"
                                    onClick={() => { setTransferringId(item.id); setTransferCategory("vegetable"); }}
                                  >
                                    🌱 Overfør til plantedatabasen…
                                  </button>
                                )
                              ) : (
                                <p className="text-[10px] text-green-600 font-medium">
                                  ✅ Overført som {PLANT_CATEGORY_LABELS[item.transferredAs as PlantCategory] ?? item.transferredAs}
                                </p>
                              )}

                              {/* Delete */}
                              <div className="flex justify-end pt-1 border-t border-border/50">
                                {confirmDeleteHistoryId === item.id ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-red-600">Slet permanent?</span>
                                    <button type="button" className="text-[10px] px-2 py-0.5 rounded bg-red-500 text-white" onClick={() => removeScanHistoryItem(item.id)}>Ja</button>
                                    <button type="button" className="text-[10px] px-2 py-0.5 rounded bg-foreground/10 text-foreground/60" onClick={() => setConfirmDeleteHistoryId(null)}>Nej</button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="text-[10px] text-foreground/30 hover:text-red-500 transition-colors"
                                    onClick={() => setConfirmDeleteHistoryId(item.id)}
                                  >
                                    🗑 Slet
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {scanHistory.length > 0 ? (
                  <p className="text-[9px] text-foreground/30 italic">
                    {scanHistory.filter((i) => i.transferred).length} af {scanHistory.length} scans overført til plantedatabasen.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── Year Wheel / Årshjul Tab ── */}
        {sidebarTab === "calendar" ? (
          <YearWheel plantDataVersion={plantDataVersion} plantInstancesVersion={plantInstancesVersion} flashFeatureIds={flashFeatureIds} />
        ) : null}

        {/* ── Task List / Opgaveliste Tab ── */}
        {sidebarTab === "tasks" ? (
          <TaskList
            taskVersion={taskVersion}
            goToYearWheel={(_month: number) => {
              setSidebarTab("calendar");
            }}
          />
        ) : null}

        {/* ── AI Chat / Rådgiver Tab ── */}
        {sidebarTab === "chat" ? (
          <div className="mt-3 flex flex-col" style={{ height: "calc(100vh - 220px)" }}>

            {/* ── Weather card ── */}
            {weatherData ? (
              <div className="mb-2 rounded-lg border border-sky-200/60 bg-gradient-to-r from-sky-50 to-blue-50 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-sky-100/30 transition-colors"
                  onClick={() => setWeatherExpanded(!weatherExpanded)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{getWeatherEmoji(weatherData.current.weatherCode)}</span>
                    <div className="leading-tight">
                      <span className="text-[13px] font-bold text-foreground/80">{Math.round(weatherData.current.temperature)}°C</span>
                      <span className="text-[10px] text-foreground/50 ml-1">{getWeatherLabel(weatherData.current.weatherCode)}</span>
                    </div>
                    {weatherData.forecast.some((d) => d.tempMin <= 0) && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold rounded px-1 py-0.5">❄️ Frost</span>
                    )}
                  </div>
                  <span className="text-[10px] text-foreground/30">{weatherExpanded ? "▲" : "▼"}</span>
                </button>

                {weatherExpanded && (
                  <div className="px-2.5 pb-2 space-y-1.5">
                    {/* Current details */}
                    <div className="flex gap-3 text-[10px] text-foreground/55">
                      <span>💧 {weatherData.current.humidity}%</span>
                      <span>💨 {weatherData.current.windSpeed} km/t</span>
                      <span>🌡️ Føles {Math.round(weatherData.current.apparentTemperature)}°C</span>
                    </div>

                    {/* Frost warning */}
                    {weatherData.forecast.some((d) => d.tempMin <= 0) && (
                      <div className="rounded bg-blue-100/80 border border-blue-200 px-2 py-1 text-[10px] text-blue-800 font-medium">
                        ❄️ Nattefrost forventet: {weatherData.forecast.filter((d) => d.tempMin <= 0).map((d) => {
                          const dt = new Date(d.date + "T12:00:00");
                          return dt.toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" });
                        }).join(", ")}
                      </div>
                    )}

                    {/* 7-day forecast */}
                    <div className="text-[9px] font-semibold text-foreground/40 uppercase tracking-wider mt-1">Prognose</div>
                    <div className="space-y-px">
                      {weatherData.forecast.slice(0, 7).map((d) => {
                        const dt = new Date(d.date + "T12:00:00");
                        const dayName = dt.toLocaleDateString("da-DK", { weekday: "short" });
                        const dayNum = dt.getDate();
                        return (
                          <div key={d.date} className="flex items-center text-[10px] text-foreground/60 gap-1">
                            <span className="w-10 font-medium text-foreground/70">{dayName} {dayNum}</span>
                            <span className="w-5 text-center">{getWeatherEmoji(d.weatherCode)}</span>
                            <span className="w-14 text-right font-mono text-[9px]">{Math.round(d.tempMin)}° / {Math.round(d.tempMax)}°</span>
                            <span className="flex-1 text-right text-blue-500 text-[9px]">{d.precipitation > 0 ? `${d.precipitation}mm` : "–"}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Recent stats with range selector */}
                    {weatherStats && (
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="text-[9px] font-semibold text-foreground/40 uppercase tracking-wider mt-1">Statistik</div>
                          <div className="flex gap-1">
                            {[7, 30, 90, 365].map((d) => (
                              <button
                                key={d}
                                type="button"
                                className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors border ${
                                  weatherStatRange === d
                                    ? "border-sky-400 bg-sky-100 text-sky-800"
                                    : "border-border/60 bg-white hover:bg-foreground/5 text-foreground/60"
                                }`}
                                onClick={() => setWeatherStatRange(d)}
                              >
                                {d}d
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-foreground/55 mt-0.5">
                          <span>📈 Snit maks: {weatherStats.stats.avgTempMax}°C</span>
                          <span>📉 Snit min: {weatherStats.stats.avgTempMin}°C</span>
                          <span>🌧️ Nedbør: {weatherStats.stats.totalPrecipitation}mm</span>
                          <span>❄️ Frostdage: {weatherStats.stats.frostDays}</span>
                          <span>☔ Regndage: {weatherStats.stats.rainDays}</span>
                          <span className="text-foreground/40">dage: {weatherStats.count}</span>
                        </div>
                      </div>
                    )}

                    <div className="text-[8px] text-foreground/25 text-right">Open-Meteo · {new Date(weatherData.fetchedAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                )}
              </div>
            ) : weatherLoading ? (
              <div className="mb-2 rounded-lg border border-sky-200/40 bg-sky-50/50 px-2.5 py-2 text-[10px] text-foreground/40 text-center">
                🌤️ Henter vejrdata…
              </div>
            ) : weatherError ? (
              <div className="mb-2 rounded-lg border border-amber-200/60 bg-amber-50/50 px-2.5 py-1.5 text-[10px] text-amber-700 text-center">
                ⚠️ {weatherError}
              </div>
            ) : null}

            {/* Persona selector */}
            <div className="mb-2">
              <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide mb-1">
                Vælg rådgiver
              </label>
              <div className="flex flex-wrap gap-1">
                {[
                  { id: "generalist", emoji: "🌿", label: "Have-ekspert" },
                  { id: "forest-garden", emoji: "🌳", label: "Skovhave" },
                  { id: "traditional", emoji: "🚜", label: "Traditionel" },
                  { id: "organic", emoji: "🌱", label: "Økologisk" },
                  { id: "kids", emoji: "🧒", label: "Børn" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-all ${
                      chatPersona === p.id
                        ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                        : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
                    }`}
                    onClick={() => setChatPersona(p.id)}
                  >
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat messages area */}
            <div className="flex-1 overflow-y-auto rounded-lg border border-border-light bg-white/60 p-2 space-y-2 mb-2 sidebar-scroll" style={{ minHeight: 120 }}>
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <div className="text-3xl mb-2">💬</div>
                  <p className="text-[12px] font-medium text-foreground/60">Spørg din haverådgiver</p>
                  <p className="text-[10px] text-foreground/40 mt-1 max-w-[200px]">
                    Stil spørgsmål om dine bede, planter, afstande, såtider – AI&apos;en kender din have!
                  </p>
                  <div className="mt-3 space-y-1">
                    {[
                      "Hvornår skal jeg så tomater?",
                      "Hvor tæt kan jeg plante jordbær?",
                      "Hvad passer godt sammen med gulerødder?",
                    ].map((q) => (
                      <button
                        key={q}
                        type="button"
                        className="block w-full text-left text-[10px] text-accent hover:text-accent-dark bg-accent-light/50 hover:bg-accent-light rounded px-2 py-1 transition-colors"
                        onClick={() => { setChatInput(q); chatInputRef.current?.focus(); }}
                      >
                        💡 {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={`${msg.ts}-${i}`}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div className="max-w-[85%]">
                      <div
                        className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                          msg.role === "user"
                            ? "bg-accent text-white rounded-br-sm"
                            : "bg-foreground/5 text-foreground rounded-bl-sm"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <div className="whitespace-pre-wrap break-words">
                            {msg.content || (
                              <span className="inline-flex items-center gap-1 text-foreground/40">
                                <span className="animate-pulse">●</span>
                                <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>●</span>
                                <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                        )}
                      </div>
                      {/* Save assistant message as task */}
                      {msg.role === "assistant" && msg.content && !chatLoading && (
                        <button
                          type="button"
                          className="mt-0.5 text-[9px] text-foreground/30 hover:text-violet-500 transition-colors flex items-center gap-0.5"
                          onClick={() => {
                            // Parse AI response → clean title (first line), stripped description, auto-extracted month
                            const parsed = parseAiResponse(msg.content);
                            createTask({
                              title: parsed.title,
                              description: parsed.description,
                              month: parsed.month,
                              source: "ai-advisor",
                            });
                            setTaskVersion((v) => v + 1);
                            const mNames = ["","jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
                            const flashMsg = parsed.month
                              ? `✅ Gemt! «${parsed.title.slice(0, 40)}» → 📅 ${mNames[parsed.month]}`
                              : `✅ Gemt! «${parsed.title.slice(0, 50)}»`;
                            setTaskSavedFlash(flashMsg);
                            setTimeout(() => setTaskSavedFlash(false), 3000);
                          }}
                          title="Gem dette som en opgave"
                        >
                          📋 Gem som opgave
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
              {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                <div className="flex justify-start">
                  <div className="bg-foreground/5 rounded-xl px-3 py-2 text-[12px] text-foreground/40">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>●</span>
                    <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="flex gap-1 items-end">
              <textarea
                ref={chatInputRef}
                className="flex-1 rounded-lg border border-border-light bg-white px-3 py-2 text-[12px] resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                rows={2}
                placeholder="Skriv dit spørgsmål..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                disabled={chatLoading}
              />
              <button
                type="button"
                className="rounded-lg bg-accent text-white px-3 py-2 text-[12px] font-medium hover:bg-accent-dark transition-colors disabled:opacity-40"
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
                title="Send besked"
              >
                ➤
              </button>
            </div>

            {/* Clear history button */}
            {chatMessages.length > 0 && (
              <div className="mt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="text-[10px] text-foreground/40 hover:text-red-500 transition-colors"
                  onClick={clearChatHistory}
                >
                  🗑 Ryd samtalehistorik
                </button>
              </div>
            )}

            {/* Task saved flash */}
            {taskSavedFlash && (
              <div className="mt-1 rounded-lg bg-violet-100 border border-violet-200 px-3 py-1.5 text-[11px] text-violet-700 font-medium text-center animate-pulse">
                {taskSavedFlash} — Se 📋 Opgaver
              </div>
            )}
          </div>
        ) : null}

        {sidebarTab === "view" ? (
          <div className="mt-3 space-y-3">
            {/* ── Visning sub-tabs ── */}
            <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm">
              {(["steder", "baggrund", "synlighed", "ankre"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
                    viewSubTab === st
                      ? (st === "ankre" ? "bg-orange-500 text-white shadow-sm" : "bg-accent text-white shadow-sm")
                      : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
                  }`}
                  onClick={() => setViewSubTab(st)}
                >
                  {st === "steder" ? "📍 Steder" : st === "baggrund" ? "🗺️ Baggrund" : st === "synlighed" ? "👁 Synlighed" : "📌 Ankre"}
                  {st === "steder" && bookmarks.length > 0 ? ` ${bookmarks.length}` : ""}
                  {st === "ankre" && anchors.length > 0 ? ` ${anchors.length}` : ""}
                </button>
              ))}
            </div>

            {/* ── Sub-tab: Steder ── */}
            {viewSubTab === "steder" ? (
              <div className="space-y-3">
                {/* Address search inline */}
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">🔍 Adressesøgning</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs placeholder:text-foreground/30 focus:border-accent/50 focus:outline-none"
                      placeholder="F.eks. Strandvejen 152, 8410 Rønde"
                      value={addressQuery}
                      onChange={(e) => setAddressQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") searchAddress(addressQuery); }}
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs text-accent-dark font-medium hover:bg-accent/20 transition-colors"
                      onClick={() => searchAddress(addressQuery)}
                    >
                      {addressSearching ? "…" : "Søg"}
                    </button>
                  </div>
                  {addressResults.length > 0 ? (
                    <div className="mt-1.5 rounded-lg border border-border bg-white overflow-hidden">
                      {addressResults.map((r, i) => {
                        const shortName = r.display_name.split(",")[0].trim();
                        return (
                          <div key={i} className="flex items-center gap-1 px-3 py-2 border-b border-border/50 last:border-b-0 hover:bg-accent/5 transition-colors">
                            <button
                              type="button"
                              className="flex-1 text-left text-xs truncate hover:text-accent transition-colors"
                              onClick={() => { goToLocation(parseFloat(r.lat), parseFloat(r.lon)); }}
                            >
                              📍 {r.display_name}
                            </button>
                            <button
                              type="button"
                              className="shrink-0 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent-dark font-medium hover:bg-accent/20 transition-colors"
                              onClick={() => {
                                const lat = parseFloat(r.lat);
                                const lon = parseFloat(r.lon);
                                goToLocation(lat, lon);
                                addBookmark(shortName, "📍", { lat, lon, zoom: 18 });
                                setAddressResults([]);
                              }}
                              title={`Gem "${shortName}" som bogmærke`}
                            >
                              + Gem
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-border-light pt-3">
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">📍 Gemte steder</label>
                  <p className="text-[10px] text-foreground/40 mb-2">Gem din nuværende kortvisning – hop hurtigt mellem områder med forskellige zoom-niveauer.</p>

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
                                className={`text-[10px] px-0.5 transition-colors ${bm.favorite ? "text-amber-400 hover:text-amber-500" : "text-foreground/20 hover:text-amber-400"}`}
                                onClick={() => updateBookmark(bm.id, { favorite: !bm.favorite })}
                                title={bm.favorite ? "Fjern fra top-bar" : "Vis i top-bar"}
                              >⭐</button>
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
              </div>
            ) : null}

            {/* ── Sub-tab: Ankre (trilateration) ── */}
            {viewSubTab === "ankre" ? (
              <div className="space-y-3">
                {/* Instruktioner */}
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 transition-colors"
                    onClick={() => setShowAnchorHelp((v) => !v)}
                  >
                    {showAnchorHelp ? "▾" : "▸"} 📐 Sådan bruger du ankerpunkter
                  </button>
                  {showAnchorHelp ? (
                    <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-2">
                      <p className="text-[11px] font-semibold text-orange-700">🎯 Centimeter-præcis markering med målebånd</p>
                      <p className="text-[10px] text-foreground/60 leading-relaxed">
                        Standard telefon-GPS giver kun 3–5 meters nøjagtighed. Med ankerpunkt-systemet kan du opnå
                        <strong> 1–5 cm præcision</strong> ved at kombinere faste referenceankre med et målebånd.
                      </p>
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-orange-700">Trin-for-trin:</p>
                        <ol className="text-[10px] text-foreground/60 space-y-1.5 list-decimal ml-3">
                          <li>
                            <strong>Sæt 2–4 fysiske pæle/pinde i haven</strong> — fx hjørner af hæk, stolper, eller fliser du kan genkende.
                            Markér dem med farvet tape eller et bånd så de er nemme at finde.
                          </li>
                          <li>
                            <strong>Opret ankerpunkter herunder</strong> — gå hen til hver pæl, stå lige ved den,
                            og tryk {"\"+ Opret anker her\""} (bruger din GPS). Giv dem et navn (fx {"\"Rød pæl ved hæk\""}).
                          </li>
                          <li>
                            <strong>Når du vil markere et præcist punkt:</strong> mål afstanden med målebånd
                            fra punktet til anker A og anker B. Indtast de to afstande herunder.
                          </li>
                          <li>
                            Appen beregner positionen via <em>trilateration</em> — den matematiske metode
                            som GPS-satellitter selv bruger. Resultat: centimeter-præcision!
                          </li>
                        </ol>
                      </div>
                      <div className="border-t border-orange-200 pt-2 mt-2">
                        <p className="text-[10px] font-semibold text-orange-700">💡 Tips til gode resultater:</p>
                        <ul className="text-[10px] text-foreground/60 space-y-1 list-disc ml-3 mt-1">
                          <li>Brug et <strong>5–10 m målebånd</strong> — mål i stram, lige linje langs jorden.</li>
                          <li>Ankre der er <strong>3–15 m fra hinanden</strong> giver bedst resultat.</li>
                          <li>Placér ankre så det punkt du vil markere ligger <strong>mellem dem</strong> (ikke bag ved).</li>
                          <li>GPS-fejlen i ankerpunkterne er OK — den forskyder alt ens, men de relative afstande er præcise.</li>
                          <li>Du kan flytte ankerpunkterne manuelt på kortet for bedre absolut placering.</li>
                        </ul>
                      </div>
                      <div className="border-t border-orange-200 pt-2 mt-2">
                        <p className="text-[10px] text-foreground/50">
                          🎥 Se hvordan trilateration virker:{" "}
                          <a
                            href="https://www.youtube.com/watch?v=JCTl8kqrKEY"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-orange-600 underline hover:text-orange-700"
                          >
                            YouTube: GPS Trilateration Explained
                          </a>
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Existing anchors */}
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">📌 Dine ankerpunkter</label>
                  {anchors.length === 0 ? (
                    <p className="text-[10px] text-foreground/30 italic mb-2">Ingen ankerpunkter endnu. Gå ud i haven, stil dig ved en fast pæl, og opret et anker herunder.</p>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {anchors.map((anc) => (
                        <div key={anc.id} className="flex items-center gap-1 rounded-lg border border-orange-200/60 bg-orange-50/30 p-1.5">
                          {editingAnchorId === anc.id ? (
                            <>
                              <input
                                type="text"
                                className="flex-1 text-xs border border-border rounded px-1.5 py-0.5"
                                defaultValue={anc.name}
                                onBlur={(e) => { updateAnchor(anc.id, { name: e.target.value || anc.name }); setEditingAnchorId(null); }}
                                onKeyDown={(e) => { if (e.key === "Enter") { updateAnchor(anc.id, { name: (e.target as HTMLInputElement).value || anc.name }); setEditingAnchorId(null); } }}
                                autoFocus
                              />
                              <button type="button" className="text-[10px] text-orange-600" onClick={() => setEditingAnchorId(null)}>✓</button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="flex-1 text-left text-xs hover:text-orange-600 transition-colors truncate"
                                onClick={() => {
                                  const map = mapRef.current;
                                  if (map) map.setView([anc.lat, anc.lng], Math.max(map.getZoom(), 19));
                                }}
                                title={`${anc.lat.toFixed(6)}, ${anc.lng.toFixed(6)}${anc.description ? " — " + anc.description : ""}`}
                              >
                                📌 {anc.name}
                              </button>
                              <span className="text-[8px] text-foreground/25 shrink-0 font-mono">{anc.lat.toFixed(5)}</span>
                              <button
                                type="button"
                                className="text-[10px] text-foreground/30 hover:text-orange-600 px-0.5"
                                onClick={() => {
                                  // Opdater anker til nuværende GPS
                                  navigator.geolocation.getCurrentPosition(
                                    (pos) => updateAnchor(anc.id, { lat: pos.coords.latitude, lng: pos.coords.longitude }),
                                    () => {},
                                    { enableHighAccuracy: true, timeout: 10000 },
                                  );
                                }}
                                title="Opdater GPS-position (stå ved ankeret)"
                              >🔄</button>
                              <button type="button" className="text-[10px] text-foreground/30 hover:text-foreground/60 px-0.5" onClick={() => setEditingAnchorId(anc.id)} title="Redigér">✏️</button>
                              <button type="button" className="text-[10px] text-foreground/30 hover:text-red-500 px-0.5" onClick={() => removeAnchor(anc.id)} title="Slet">🗑</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new anchor */}
                  {placingAnchor ? (
                    <div className="rounded-lg border border-orange-300 bg-orange-50 p-2 space-y-2">
                      <p className="text-[10px] text-orange-700 font-medium">📡 Henter GPS-position…  Stå stille ved pinden/pælen.</p>
                      <input
                        type="text"
                        className="w-full text-xs border border-border rounded-lg px-2 py-1 placeholder:text-foreground/30"
                        placeholder="Navn, fx 'Rød pæl ved hæk'…"
                        value={newAnchorName}
                        onChange={(e) => setNewAnchorName(e.target.value)}
                      />
                      <input
                        type="text"
                        className="w-full text-xs border border-border rounded-lg px-2 py-1 placeholder:text-foreground/30"
                        placeholder="Beskrivelse (valgfrit), fx 'Jernpæl i SV-hjørne'"
                        value={newAnchorDesc}
                        onChange={(e) => setNewAnchorDesc(e.target.value)}
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="flex-1 rounded-lg bg-orange-500 text-white px-2 py-1.5 text-xs font-medium hover:bg-orange-600 transition-colors"
                          onClick={() => {
                            navigator.geolocation.getCurrentPosition(
                              (pos) => {
                                addAnchor(
                                  newAnchorName.trim() || `Anker ${anchors.length + 1}`,
                                  pos.coords.latitude,
                                  pos.coords.longitude,
                                  newAnchorDesc.trim() || undefined,
                                );
                                setNewAnchorName("");
                                setNewAnchorDesc("");
                                setPlacingAnchor(false);
                              },
                              (err) => {
                                alert(`GPS-fejl: ${err.message}. Prøv at gå udenfor og tjek at lokationstilladelser er slået til.`);
                              },
                              { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
                            );
                          }}
                        >
                          📡 Registrér GPS nu
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-orange-300 px-2 py-1.5 text-xs text-orange-600 font-medium hover:bg-orange-50 transition-colors"
                          onClick={() => {
                            // Placér ved kortets center i stedet
                            const map = mapRef.current;
                            if (map) {
                              addAnchor(
                                newAnchorName.trim() || `Anker ${anchors.length + 1}`,
                                map.getCenter().lat,
                                map.getCenter().lng,
                                newAnchorDesc.trim() || undefined,
                              );
                            }
                            setNewAnchorName("");
                            setNewAnchorDesc("");
                            setPlacingAnchor(false);
                          }}
                        >
                          🗺️ Brug kortcenter
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-border px-2 py-1.5 text-xs text-foreground/50 hover:bg-foreground/5 transition-colors"
                          onClick={() => { setPlacingAnchor(false); setNewAnchorName(""); setNewAnchorDesc(""); }}
                        >
                          Annullér
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full rounded-lg border border-orange-300/60 bg-orange-50/50 px-3 py-2 text-xs font-medium text-orange-700 hover:bg-orange-100/50 hover:border-orange-400/60 transition-all"
                      onClick={() => setPlacingAnchor(true)}
                    >
                      + Opret ankerpunkt
                    </button>
                  )}
                </div>

                {/* Trilateration – Præcis markering */}
                {anchors.length >= 2 ? (
                  <div className="border-t border-border-light pt-3">
                    <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">📐 Præcis markering (trilateration)</label>
                    <p className="text-[10px] text-foreground/40 mb-2">Mål afstand fra dit punkt til 2 ankerpunkter med målebånd. Appen beregner positionen.</p>

                    <div className="space-y-2">
                      {/* Anchor A */}
                      <div>
                        <label className="text-[9px] text-foreground/40 uppercase">Anker A</label>
                        <select
                          className="w-full rounded-lg border border-border px-2 py-1.5 text-xs bg-background"
                          value={triAnchorA ?? ""}
                          onChange={(e) => { setTriAnchorA(e.target.value || null); setTriResult(null); setTriError(null); setTriPlaced(false); }}
                        >
                          <option value="">Vælg anker…</option>
                          {anchors.map((a) => (
                            <option key={a.id} value={a.id}>📌 {a.name}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-full mt-1 rounded-lg border border-border px-2 py-1.5 text-xs placeholder:text-foreground/30"
                          placeholder="Afstand i meter, fx 4.35"
                          value={triDistA}
                          onChange={(e) => { setTriDistA(e.target.value); setTriResult(null); setTriError(null); setTriPlaced(false); }}
                        />
                      </div>

                      {/* Anchor B */}
                      <div>
                        <label className="text-[9px] text-foreground/40 uppercase">Anker B</label>
                        <select
                          className="w-full rounded-lg border border-border px-2 py-1.5 text-xs bg-background"
                          value={triAnchorB ?? ""}
                          onChange={(e) => { setTriAnchorB(e.target.value || null); setTriResult(null); setTriError(null); setTriPlaced(false); }}
                        >
                          <option value="">Vælg anker…</option>
                          {anchors.map((a) => (
                            <option key={a.id} value={a.id}>📌 {a.name}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-full mt-1 rounded-lg border border-border px-2 py-1.5 text-xs placeholder:text-foreground/30"
                          placeholder="Afstand i meter, fx 6.12"
                          value={triDistB}
                          onChange={(e) => { setTriDistB(e.target.value); setTriResult(null); setTriError(null); setTriPlaced(false); }}
                        />
                      </div>

                      {/* Compute button */}
                      <button
                        type="button"
                        className="w-full rounded-lg bg-orange-500 text-white px-3 py-2 text-xs font-semibold hover:bg-orange-600 transition-colors disabled:opacity-40"
                        disabled={!triAnchorA || !triAnchorB || !triDistA || !triDistB}
                        onClick={computeTrilateration}
                      >
                        📐 Beregn position
                      </button>

                      {triError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                          <p className="text-[10px] text-red-600">⚠️ {triError}</p>
                        </div>
                      ) : null}

                      {triResult ? (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
                          <p className="text-[11px] font-semibold text-green-700">✅ Position beregnet!</p>
                          <p className="text-[10px] text-foreground/60 font-mono">
                            {triResult.lat.toFixed(7)}, {triResult.lng.toFixed(7)}
                          </p>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="flex-1 rounded-lg bg-green-600 text-white px-2 py-1.5 text-xs font-medium hover:bg-green-700 transition-colors"
                              onClick={() => {
                                const map = mapRef.current;
                                if (map) map.setView([triResult.lat, triResult.lng], Math.max(map.getZoom(), 20));
                              }}
                            >
                              🗺️ Vis på kort
                            </button>
                            {!triPlaced ? (
                              <button
                                type="button"
                                className="flex-1 rounded-lg bg-accent text-white px-2 py-1.5 text-xs font-medium hover:bg-accent/90 transition-colors"
                                onClick={() => {
                                  // Place a GeoJSON point feature at the computed position
                                  const fg = featureGroupRef.current;
                                  const map = mapRef.current;
                                  if (!fg || !map) return;
                                  const id = newId();
                                  const feature: GardenFeature = {
                                    type: "Feature",
                                    geometry: { type: "Point", coordinates: [triResult.lng, triResult.lat] },
                                    properties: {
                                      gardenosId: id,
                                      kind: "plant",
                                      category: "element",
                                      name: `Præcis markering`,
                                      notes: `Placeret via trilateration (afstande: ${triDistA}m / ${triDistB}m)`,
                                    },
                                  };
                                  const layer = L.geoJSON(feature, {
                                    pointToLayer: (_f, latlng) => {
                                      const m = L.marker(latlng, { icon: markerIcon("plant", false, false, "📍") });
                                      ensureMarkerHasDragging(m);
                                      return m;
                                    },
                                  }).getLayers()[0];
                                  if (layer) {
                                    (layer as unknown as Record<string, unknown>).feature = feature;
                                    fg.addLayer(layer);
                                    attachClickHandler(layer, feature);
                                    pushUndoSnapshot();
                                    rebuildFromGroupAndUpdateSelection();
                                    setTriPlaced(true);
                                    map.setView([triResult.lat, triResult.lng], Math.max(map.getZoom(), 20));
                                  }
                                }}
                              >
                                📌 Placér element
                              </button>
                            ) : (
                              <span className="flex-1 rounded-lg bg-green-100 text-green-700 px-2 py-1.5 text-xs font-medium text-center">✅ Placeret!</span>
                            )}
                          </div>
                          <p className="text-[9px] text-foreground/30 italic">Du kan bagefter ændre type, navn og ikon i Indhold-panelet.</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : anchors.length > 0 ? (
                  <div className="rounded-lg border border-orange-200 bg-orange-50/30 p-2">
                    <p className="text-[10px] text-orange-600">Du har brug for mindst 2 ankerpunkter for at bruge trilateration. Opret ét mere herover.</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* ── Sub-tab: Baggrund ── */}
            {viewSubTab === "baggrund" ? (
            <div className="space-y-3">
            <div>
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
            </div>
            ) : null}

            {/* ── Sub-tab: Synlighed ── */}
            {viewSubTab === "synlighed" ? (
            <div className="space-y-3">
            <div>
            <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-2">Synlighed på kort</label>
            {(["area", "seedbed", "row", "container", "element", "condition"] as const).map((cat) => {
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

      {/* ── Bed Resize Row Adjustment Confirmation ── */}
      {bedResizeProposal ? (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-white shadow-2xl">
            {/* Header */}
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                📐 Rækker tilpasses
              </h3>
              <p className="mt-1 text-xs text-foreground/60">
                Du har ændret formen på <span className="font-semibold">{bedResizeProposal.bedName}</span>. Følgende rækker påvirkes:
              </p>
            </div>

            {/* Changes list */}
            <div className="max-h-64 overflow-y-auto px-5 py-3 space-y-2">
              {bedResizeProposal.changes.filter(c => c.action === "remove").length > 0 ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-1">
                    🗑 Fjernes ({bedResizeProposal.removedCount} rækker)
                  </p>
                  {bedResizeProposal.changes.filter(c => c.action === "remove").map((c) => {
                    const sp = c.speciesId ? getPlantById(c.speciesId) : null;
                    return (
                      <div key={c.gardenosId} className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs mb-1">
                        <span className="text-sm">{sp?.icon ?? "🌱"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-red-800 truncate">{c.name}</p>
                          <p className="text-[9px] text-red-600/70">
                            {(c.oldLengthM * 100).toFixed(0)} cm · {c.plantInstanceIds.length > 0 ? `${c.plantInstanceIds.length} planteregistrering(er) fjernes` : "Ingen plantedata"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {bedResizeProposal.changes.filter(c => c.action === "reclip").length > 0 ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1">
                    ✂️ Tilpasses ({bedResizeProposal.reclippedCount} rækker)
                  </p>
                  {bedResizeProposal.changes.filter(c => c.action === "reclip").map((c) => {
                    const sp = c.speciesId ? getPlantById(c.speciesId) : null;
                    const pctChange = c.newLengthM && c.oldLengthM > 0 ? ((c.newLengthM - c.oldLengthM) / c.oldLengthM * 100).toFixed(0) : "?";
                    return (
                      <div key={c.gardenosId} className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs mb-1">
                        <span className="text-sm">{sp?.icon ?? "🌱"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-amber-800 truncate">{c.name}</p>
                          <p className="text-[9px] text-amber-600/70">
                            {(c.oldLengthM * 100).toFixed(0)} cm → {((c.newLengthM ?? 0) * 100).toFixed(0)} cm ({Number(pctChange) > 0 ? "+" : ""}{pctChange}%) · Planteantal opdateres
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* Summary */}
            <div className="border-t border-border px-5 py-3">
              <div className="text-[10px] text-foreground/50 space-y-0.5">
                {bedResizeProposal.removedCount > 0 ? (
                  <p>🗑 {bedResizeProposal.removedCount} rækker og {bedResizeProposal.removedPlantInstanceCount} planter fjernes permanent</p>
                ) : null}
                {bedResizeProposal.reclippedCount > 0 ? (
                  <p>✂️ {bedResizeProposal.reclippedCount} rækker tilpasses ny form · planteantal opdateres</p>
                ) : null}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                className="flex-1 rounded-lg border border-foreground/15 bg-white px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 transition-colors"
                onClick={rejectBedResizeProposal}
              >
                ↩ Fortryd ændring
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent/90 transition-colors"
                onClick={() => applyBedResizeProposal(bedResizeProposal)}
              >
                ✅ Acceptér
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
