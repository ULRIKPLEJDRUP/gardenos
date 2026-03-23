"use client";

import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon } from "geojson";
import L from "leaflet";
import "leaflet-draw";
import "leaflet-path-drag";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, WMSTileLayer, useMap, useMapEvents } from "react-leaflet";
import { setCurrentUser, userKey, pullFromServer, markDirty, onSyncStatusChange, getSyncStatus } from "../lib/userStorage";
import type { SyncStatus } from "../lib/userStorage";
import { signOut, useSession } from "next-auth/react";
import {
  getAllPlants,
  getPlantById,
  getVarietiesForSpecies,
  getInstancesForFeature,
  loadPlantInstances,
  savePlantInstances,
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
  computeShadeImpact,
  estimateHeightM,
  maxAcceptableShadeHours,
  couldCastSignificantShade,
  GROWING_SEASON_SUN_HOURS,
  isEdiblePlant,
} from "../lib/plantTypes";
import VarietyManager from "./VarietyManager";
import PlantEditor from "./PlantEditor";
import IconPicker from "./IconPicker";
import YearWheel from "./YearWheel";
import TaskList from "./TaskList";
import FeedbackPanel from "./FeedbackPanel";
import GuidedTour from "./GuidedTour";
import ChatPanel from "./ChatPanel";
import ClimateTab from "./ClimateTab";
import PlanTab from "./PlanTab";
import ScanTab from "./ScanTab";
import DesignLab from "./DesignLab";
import JournalTab from "./JournalTab";
import ConflictsTab from "./ConflictsTab";
import GroupsTab from "./GroupsTab";
import DesignsTab from "./DesignsTab";
import SettingsModal from "./SettingsModal";
import PlantsTab from "./PlantsTab";
import type { BedLayout } from "../lib/bedLayoutTypes";
import { getBedLayout } from "../lib/bedLayoutStore";
import { bedLocalToGeo } from "../lib/bedGeometry";
import { createTask, parseAiResponse, loadTasks, PRIORITY_ICONS } from "../lib/taskStore";
import {
  loadSoilProfiles,
  saveSoilProfiles,
  getSoilProfileById,
  addOrUpdateSoilProfile,
  deleteSoilProfile,
  createBlankSoilProfile,
  createProfileFromType,
  applyPresetDefaults,
  ensureDefaultProfiles,
  isStandardProfile,
  getLogForProfile,
  addSoilLogEntry,
  deleteSoilLogEntry,
} from "../lib/soilStore";
import type { SoilProfile, SoilLogEntry, SoilLogAction, SoilKnowledgeLevel, SoilBaseType } from "../lib/soilTypes";
import {
  SOIL_BASE_TYPE_LABELS,
  SOIL_BASE_TYPE_DESC,
  SOIL_TYPE_ICONS,
  SOIL_TYPE_PH_RANGE,
  SOIL_COLOR_LABELS,
  SOIL_TEXTURE_LABELS,
  DRAINAGE_LABELS,
  MOISTURE_LABELS,
  EARTHWORM_LABELS,
  SOIL_HEALTH_LABELS,
  ORGANIC_LABELS,
  COMPOST_TYPE_LABELS,
  COMPOST_MATURITY_LABELS,
  COMPOST_AMOUNT_LABELS,
  PH_CATEGORY_LABELS,
  PH_METHOD_LABELS,
  LIME_CONTENT_LABELS,
  LIME_TYPE_LABELS,
  NUTRIENT_LABELS,
  NPK_SOURCE_LABELS,
  COMPRESSION_LABELS,
  SOIL_SECTIONS,
  SOIL_LOG_ACTION_LABELS,
  computeSoilRecommendations,
} from "../lib/soilTypes";
import {
  fetchDesigns,
  updateDesign,
  DEFAULT_MAX_DESIGNS,
  type SavedDesign,
} from "../lib/designStore";
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
import {
  detectPlantConflicts,
  checkPlacementConflicts,
  haversineM,
  geoBearing,
  spreadDiameterM,
  canopyRadiusM,
  getTrunkExclusionRadiusM,
  type PlantConflict,
  type SpreadSpec,
} from "../lib/conflictDetection";
import {
  exportGeoJSON,
  exportPlantCSV,
  copyShareLink,
  printGardenSummary,
  type ExportPlantRow,
} from "../lib/exportStore";
import {
  extractShadeCasters,
  estimateShadeAtPoint,
  sunHoursToColor,
  sunLevelLabel,
  type ShadeCaster,
} from "../lib/sunAnalysis";
import {
  computeWateringAdvice,
  sortByUrgency,
  URGENCY_CONFIG,
  type BedWateringAdvice,
} from "../lib/wateringAdvisor";
import {
  buildRotationPlan,
  getCurrentSeason,
  getFamilyColor,
  getFamilyLabel,
} from "../lib/rotationPlanner";
import {
  getSmartRecommendations,
  SMART_STRATEGY_CONFIG,
  monthNameDa,
} from "../lib/smartRecommendations";
import type { SmartStrategy, SmartContext } from "../lib/smartRecommendations";
import {
  buildGardenCalendar,
  getUpcomingActivities,
  ACTIVITY_CONFIG,
  MONTH_NAMES_DA,
  MONTH_SHORT_DA,
  type CalendarMonth,
  type CalendarActivity,
} from "../lib/gardenCalendar";

// ---------------------------------------------------------------------------
// NOTE: We no longer use Leaflet.draw's L.EditToolbar.Edit for editing.
// Instead we directly enable/disable .editing and .dragging on individual
// layers.  This avoids the fundamental architecture mismatch where
// L.EditToolbar.Edit operates on ALL layers in the featureGroup at once.
// ---------------------------------------------------------------------------

type KnownGardenFeatureKind =
  | "bed" | "row" | "pot" | "raised-bed"
  | "planter-box" | "balcony-box" | "grow-bag" | "barrel-planter" | "hanging-basket" | "trough" | "window-box"
  | "tree" | "bush" | "flower" | "plant"
  | "water" | "electric" | "lamp"
  // ── Granular water kinds ──
  | "water-pipe" | "water-hose" | "water-drip" | "water-tap" | "water-sprinkler" | "water-timer" | "water-barrel"
  // ── Granular electric kinds ──
  | "electric-cable" | "electric-lv" | "electric-outlet" | "electric-junction" | "electric-panel" | "electric-solar"
  // ── Granular lamp kinds ──
  | "lamp-garden" | "lamp-spot" | "lamp-led-string" | "lamp-wall" | "lamp-solar" | "lamp-path" | "lamp-battery" | "lamp-flood"
  // ── Havezoner (area/zone) ──
  | "kitchen-garden" | "fruit-grove" | "front-garden" | "flower-garden" | "herb-garden" | "berry-garden"
  | "forest-garden" | "lawn" | "meadow" | "field" | "production-garden" | "playground" | "slope"
  // ── Bygninger & strukturer (area/structure) ──
  | "house" | "shed" | "garage" | "terrace" | "patio" | "path-area" | "pond" | "stream"
  | "compost" | "woodpile" | "firepit" | "trampoline" | "sandbox" | "wall" | "parking" | "well"
  // ── Overdækninger & indhegninger (area/cover) ──
  | "greenhouse" | "polytunnel" | "cold-frame" | "pergola" | "shade-sail" | "row-cover"
  | "cloche" | "netting" | "fence-enclosure" | "espalier" | "windbreak"
  // ── Jordforhold (condition/soil) ──
  | "clay-soil" | "sandy-soil" | "moist-soil" | "chalky-soil" | "acidic-soil" | "humus-soil"
  | "contaminated" | "rocky-soil" | "peat-soil" | "compacted"
  // ── Klima & miljø (condition/climate) ──
  | "shade" | "partial-shade" | "wind" | "frost-pocket" | "wetland" | "dry-zone"
  | "heat-island" | "salt-exposure" | "erosion" | "deer-area" | "slug-zone" | "bird-damage";
type GardenFeatureKind = KnownGardenFeatureKind | (string & {});

// Six primary categories matching the user's domain model
type GardenFeatureCategory = "element" | "row" | "seedbed" | "container" | "area" | "condition";

type KindGeometry = "point" | "polygon" | "polyline";

// Sub-groups within each category
type KindSubGroup = "plant" | "infra" | "default" | "zone" | "structure" | "cover" | "soil" | "climate";

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
  container: "Krukker, kasser, højbede, ampler – indeholder elementer",
  area: "Havezoner, bygninger, overdækninger og indhegninger",
  condition: "Jordforhold, klima og miljøpåvirkninger",
};

/** Z-order priority for categories: higher number = rendered in front. */
const CATEGORY_Z_PRIORITY: Record<string, number> = {
  condition: 0,
  area: 1,
  seedbed: 2,
  container: 3,
  row: 4,
  element: 5,
};

/** Polygon categories that should pass clicks through to child features. */
const POLYGON_CONTAINER_CATS = new Set(["seedbed", "container", "area", "condition"]);

/**
 * Minimum pixel distance from point `p` to the line segment `v→w`.
 * Used for detecting clicks near row polylines inside polygon containers.
 */
function distToSegmentPx(p: L.Point, v: L.Point, w: L.Point): number {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = v.x + t * (w.x - v.x);
  const projY = v.y + t * (w.y - v.y);
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

/** Approximate meters per degree of latitude (constant for all latitudes). */
const M_PER_DEG_LAT = 111_320;

/** Maximum photo file size in bytes (2 MB). */
const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Read an image file as a data-URL string.
 * Returns `null` if the file exceeds `MAX_PHOTO_SIZE_BYTES`.
 */
function readImageAsDataURL(file: File): Promise<string | null> {
  if (file.size > MAX_PHOTO_SIZE_BYTES) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  });
}

/**
 * Build a PlantInstance with auto-filled `id`, `plantedAt` and `season`.
 * Callers only supply the domain-specific fields.
 */
function makePlantInstance(
  fields: Omit<PlantInstance, "id" | "plantedAt" | "season"> & {
    count?: number;
  },
): PlantInstance {
  return {
    id: crypto.randomUUID(),
    plantedAt: new Date().toISOString().slice(0, 10),
    season: new Date().getFullYear(),
    ...fields,
  };
}

/**
 * Read an SSE (Server-Sent Events) stream and accumulate text chunks.
 * Returns the full accumulated text.  Calls `onChunk` with the running
 * total after each chunk so the caller can update UI state.
 */
async function readSSEStream(
  response: Response,
  onChunk: (accumulated: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Ingen stream modtaget");
  const decoder = new TextDecoder();
  let text = "";
  let buffer = "";
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
          text += parsed.content;
          onChunk(text);
        }
      } catch { /* skip non-JSON lines */ }
    }
  }
  return text;
}

/**
 * Convert a GeoJSON coordinate ring ([lng, lat]) to local metric coordinates
 * (meters from centroid).  Returns the centroid, scale factors, and the
 * converted ring so callers don't need to repeat this boilerplate.
 */
function ringToMetric(ring: [number, number][]): {
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

/** Labels for area/condition SubGroups shown as headers in palette */
const SUB_GROUP_LABELS: Partial<Record<KindSubGroup, string>> = {
  zone: "🌿 Havezoner",
  structure: "🏠 Bygninger & strukturer",
  cover: "🏡 Overdækninger & indhegninger",
  soil: "🪨 Jordforhold",
  climate: "🌤️ Klima & miljø",
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

  // ── Soil profile reference ──
  soilProfileId?: string; // links to SoilProfile in soilStore

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
  wateringNeed?: string;  // vandingsbehov (lav/middel/høj/selvvandende)
  drainage?: string;      // drænforhold (ingen/huller/drænlag)
  volume?: string;        // volumen/størrelse (liter)
  material?: string;      // materiale (keramik/plast/træ/metal/stof)
  placement?: string;     // placering (sol/halvskygge/skygge)
  winterProtection?: string; // vinterbeskyttelse (ingen/indendørs/isoleret)

  // ── Area: zone-specific ──
  shelter?: string;       // læforhold
  sunlight?: string;      // lysforhold (fuld sol/halvskygge/skygge)
  orientation?: string;   // orientering (nord/syd/øst/vest)
  purpose?: string;       // formål

  // ── Area: structure-specific ──
  structureMaterial?: string; // materiale
  structureHeight?: string;   // ca. højde
  shadowDirection?: string;   // kaster skygge mod
  structureUse?: string;      // formål/brug

  // ── Area: cover-specific ──
  heating?: string;           // opvarmning (drivhus)
  coverMaterial?: string;     // materiale (glas/polycarbonat/plastik/net)
  ventilation?: string;       // ventilation
  protectionAgainst?: string; // beskyttelse mod (komma-separeret)
  minTemperature?: string;    // min. temperatur

  // ── Condition: soil-specific ──
  conditionDesc?: string;     // beskrivelse
  intensity?: string;         // intensitet (svag/middel/stærk)
  soilPh?: string;            // pH-værdi
  soilDrainage?: string;      // dræning
  soilDepth?: string;         // mulddybde
  soilImproved?: string;      // jordforbedring

  // ── Condition: climate-specific ──
  timeOfDay?: string;         // tidspunkt (morgen/eftermiddag/hele dagen)
  season?: string;            // sæson
  conditionDirection?: string; // retning
  conditionSource?: string;   // kilde
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
    const raw = localStorage.getItem(userKey(STORAGE_BOOKMARKS_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MapBookmark[];
    // Migrate: old bookmarks without favorite field default to true
    return parsed.map((b) => (b.favorite === undefined ? { ...b, favorite: true } : b));
  } catch { return []; }
}

function saveBookmarks(bookmarks: MapBookmark[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_BOOKMARKS_KEY), JSON.stringify(bookmarks));
  markDirty(STORAGE_BOOKMARKS_KEY);
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
    const raw = localStorage.getItem(userKey(STORAGE_ANCHORS_KEY));
    if (!raw) return [];
    return JSON.parse(raw) as AnchorPoint[];
  } catch { return []; }
}

function saveAnchors(anchors: AnchorPoint[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_ANCHORS_KEY), JSON.stringify(anchors));
  markDirty(STORAGE_ANCHORS_KEY);
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
  const mPerDegLat = M_PER_DEG_LAT;
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);

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
    const raw = localStorage.getItem(userKey(STORAGE_HIDDEN_KINDS_KEY));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.map((s: unknown) => String(s).toLowerCase()));
  } catch { /* ignore */ }
  return new Set();
}

function saveHiddenKinds(hidden: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_HIDDEN_KINDS_KEY), JSON.stringify([...hidden]));
  markDirty(STORAGE_HIDDEN_KINDS_KEY);
}

function loadHiddenVisKinds(): Set<string> {
  try {
    const raw = localStorage.getItem(userKey(STORAGE_HIDDEN_VIS_KINDS_KEY));
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return new Set(arr.map(String)); }
  } catch { /* ignore */ }
  return new Set();
}

function saveHiddenVisKinds(hidden: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_HIDDEN_VIS_KINDS_KEY), JSON.stringify([...hidden]));
  markDirty(STORAGE_HIDDEN_VIS_KINDS_KEY);
}

type GroupMeta = { name: string };
type GroupRegistry = Record<string, GroupMeta>;

function loadGroupRegistry(): GroupRegistry {
  try {
    const raw = localStorage.getItem(userKey(STORAGE_GROUPS_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as GroupRegistry;
  } catch { /* ignore */ }
  return {};
}

function saveGroupRegistry(reg: GroupRegistry) {
  localStorage.setItem(userKey(STORAGE_GROUPS_KEY), JSON.stringify(reg));
  markDirty(STORAGE_GROUPS_KEY);
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
  { kind: "bed", label: "Bed", category: "seedbed", geometry: "polygon", subGroup: "default" },

  // ── Containere ──
  { kind: "pot", label: "Krukke", category: "container", geometry: "polygon", subGroup: "default" },
  { kind: "planter-box", label: "Plantekasse", category: "container", geometry: "polygon", subGroup: "default" },
  { kind: "raised-bed", label: "Højbed", category: "container", geometry: "polygon", subGroup: "default" },
  { kind: "balcony-box", label: "Altankasse", category: "container", geometry: "polygon", subGroup: "default" },
  { kind: "grow-bag", label: "Dyrkningspose", category: "container", geometry: "polygon", subGroup: "default" },
  { kind: "barrel-planter", label: "Tønde/Kar", category: "container", geometry: "polygon", subGroup: "default" },
  { kind: "hanging-basket", label: "Ampler/Hængekurv", category: "container", geometry: "polygon", subGroup: "default" },
  { kind: "trough", label: "Trug/Plantebakke", category: "container", geometry: "polygon", subGroup: "default" },
  { kind: "window-box", label: "Vindueskarme-kasse", category: "container", geometry: "polygon", subGroup: "default" },

  // ── Områder: Havezoner ──
  { kind: "kitchen-garden", label: "🥬 Køkkenhave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "fruit-grove", label: "🍎 Frugtlund", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "front-garden", label: "🌷 Forhave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "flower-garden", label: "🌸 Blomsterhave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "herb-garden", label: "🌿 Urtehave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "berry-garden", label: "🫐 Bærhave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "forest-garden", label: "🌳 Skovhave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "lawn", label: "☘️ Græsplæne", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "meadow", label: "🌼 Eng/vildblomst", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "field", label: "🌾 Mark", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "production-garden", label: "🏭 Produktionshave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "playground", label: "🎪 Legeplads", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "slope", label: "⛰️ Skråning", category: "area", geometry: "polygon", subGroup: "zone" },

  // ── Områder: Bygninger & strukturer ──
  { kind: "house", label: "🏠 Hus", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "shed", label: "🏚️ Skur", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "garage", label: "🅿️ Garage/carport", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "terrace", label: "🪑 Terrasse", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "patio", label: "🏡 Gårdhave", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "path-area", label: "🛤️ Sti/gangsti", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "pond", label: "🌊 Dam/sø", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "stream", label: "💧 Bæk/vandløb", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "compost", label: "♻️ Kompost", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "woodpile", label: "🪵 Brændestabel", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "firepit", label: "🔥 Bålplads", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "trampoline", label: "⭕ Trampolin", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "sandbox", label: "🏖️ Sandkasse", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "wall", label: "🧱 Mur/stenmur", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "parking", label: "🚗 Parkering", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "well", label: "🪣 Brønd", category: "area", geometry: "polygon", subGroup: "structure" },

  // ── Områder: Overdækninger & indhegninger ──
  { kind: "greenhouse", label: "🏡 Drivhus", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "polytunnel", label: "🫧 Dækningstunnel", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "cold-frame", label: "📦 Drivbænk", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "pergola", label: "🪟 Pergola", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "shade-sail", label: "⛵ Solsejl", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "row-cover", label: "🧊 Fiberdug", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "cloche", label: "🔔 Klokke/dækglas", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "netting", label: "🕸️ Insektnet", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "fence-enclosure", label: "🔲 Indhegning", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "espalier", label: "🪜 Espalier", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "windbreak", label: "🌲 Læhegn", category: "area", geometry: "polygon", subGroup: "cover" },

  // ── Særlige forhold: Jordforhold ──
  { kind: "clay-soil", label: "🟤 Lerjord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "sandy-soil", label: "🟡 Sandjord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "moist-soil", label: "💧 Fugtig jord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "chalky-soil", label: "⬜ Kalkjord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "acidic-soil", label: "🟠 Surbund", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "humus-soil", label: "🟫 Muldjord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "contaminated", label: "☢️ Forurenet jord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "rocky-soil", label: "🪨 Stenet jord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "peat-soil", label: "🫘 Tørvejord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "compacted", label: "🧱 Kompakt jord", category: "condition", geometry: "polygon", subGroup: "soil" },

  // ── Særlige forhold: Klima & miljø ──
  { kind: "shade", label: "⬛ Skygge", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "partial-shade", label: "🌤️ Halvskygge", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "wind", label: "💨 Stærk vind", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "frost-pocket", label: "🥶 Frostlomme", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "wetland", label: "🌊 Vådområde", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "dry-zone", label: "☀️ Tør zone", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "heat-island", label: "🌡️ Varmeø", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "salt-exposure", label: "🧂 Saltpåvirkning", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "erosion", label: "🏜️ Erosion", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "deer-area", label: "🦌 Vildtområde", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "slug-zone", label: "🐌 Sneglezone", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "bird-damage", label: "🐦 Fugletryk", category: "condition", geometry: "polygon", subGroup: "climate" },
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
  const raw = safeJsonParse<unknown>(localStorage.getItem(userKey(STORAGE_KIND_DEFS_KEY)));
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
    // Strip invalid container kinds (e.g. user-added "skur"/"slot" that belong under area/structure)
    const kindLower = v.kind.toLowerCase();
    if (v.category === "container" && (kindLower === "skur" || kindLower === "slot")) continue;
    parsed.push({ kind: v.kind, label: v.label, category: v.category as GardenFeatureCategory, geometry: v.geometry, subGroup });
  }
  return dedupeKindDefs(parsed);
}

function saveCustomKindDefsToStorage(defs: KindDef[]): void {
  if (typeof window === "undefined") return;
  const customOnly = defs.filter((d) => !isKnownKind(d.kind));
  localStorage.setItem(userKey(STORAGE_KIND_DEFS_KEY), JSON.stringify(dedupeKindDefs(customOnly)));
  markDirty(STORAGE_KIND_DEFS_KEY);
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
      soilProfileId: feature.properties?.soilProfileId ?? "",
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

/** Compute geodesic area (m²) from an array of LatLng using local projection + shoelace. */
function computeGeodesicArea(latlngs: L.LatLng[]): number {
  if (latlngs.length < 3) return 0;
  const cLat = latlngs.reduce((s, p) => s + p.lat, 0) / latlngs.length;
  const cLng = latlngs.reduce((s, p) => s + p.lng, 0) / latlngs.length;
  const origin = L.latLng(cLat, cLng);
  const projected = latlngs.map((ll) => {
    const dx = origin.distanceTo(L.latLng(origin.lat, ll.lng)) * (ll.lng >= origin.lng ? 1 : -1);
    const dy = origin.distanceTo(L.latLng(ll.lat, origin.lng)) * (ll.lat >= origin.lat ? 1 : -1);
    return { x: dx, y: dy };
  });
  let area = 0;
  for (let i = 0; i < projected.length; i++) {
    const j = (i + 1) % projected.length;
    area += projected[i].x * projected[j].y;
    area -= projected[j].x * projected[i].y;
  }
  return Math.abs(area) / 2;
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

  const { midLng, midLat, mpLng, mRing } = ringToMetric(ring);

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
type OccupiedSlot = { offset: number; halfExclusion: number };

function getExistingRowOffsetsInBed(
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
    const raw = window.localStorage.getItem(userKey(ICON_REGISTRY_KEY));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}

function saveKindIconRegistry(registry: Record<string, string>) {
  window.localStorage.setItem(userKey(ICON_REGISTRY_KEY), JSON.stringify(registry));
  markDirty(ICON_REGISTRY_KEY);
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
// Marker icon – supports optional emoji rendering + custom image icons
// ---------------------------------------------------------------------------
function markerIcon(kind: GardenFeatureKind | undefined, selected: boolean, groupHighlight?: boolean, emoji?: string): L.DivIcon {
  // If there's an emoji or custom icon, render it as an HTML div icon
  if (emoji) {
    const isImageIcon = emoji.startsWith("data:image/");
    const emojiSize = selected ? 22 : 18;
    const imgSize = selected ? 28 : 24;
    const size = isImageIcon ? imgSize : emojiSize;
    const selectedClass = selected ? "gardenos-emoji-marker--selected" : "";
    const groupClass = groupHighlight ? "gardenos-emoji-marker--group" : "";
    const html = isImageIcon
      ? `<img src="${emoji}" alt="" style="width:${imgSize}px;height:${imgSize}px;object-fit:contain;border-radius:4px;display:block;" />`
      : `<span style="font-size:${emojiSize}px;line-height:1;display:flex;align-items:center;justify-content:center;width:100%;height:100%">${emoji}</span>`;
    return L.divIcon({
      className: `gardenos-emoji-marker ${selectedClass} ${groupClass}`.trim(),
      html,
      iconSize: [size + 8, size + 8],
      iconAnchor: [Math.round((size + 8) / 2), Math.round((size + 8) / 2)],
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
        addPlantInstance(makePlantInstance({
          speciesId: pendingSpecies.speciesId,
          varietyId: pendingSpecies.varietyId ?? undefined,
          varietyName: pendingSpecies.varietyName ?? undefined,
          featureId: normalized.properties.gardenosId,
          count: 1,
        }));
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
    };
    // Only re-run when the map instance changes (effectively once).
    // Callbacks are accessed via cbRef so their identity changes don't matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, featureGroupRef, mapRef, createKindRef]);

  return null;
}

// ---------------------------------------------------------------------------
// MapToolbar – Horizontal frosted-glass bar: zoom · scale · distance · area
// ---------------------------------------------------------------------------
function MapToolbar() {
  const map = useMap();
  const [scaleLabel, setScaleLabel] = useState("1 m");
  const [scaleBarPx, setScaleBarPx] = useState(60);
  const [measureMode, setMeasureMode] = useState<null | "distance" | "area">(null);
  const [measureTotal, setMeasureTotal] = useState(0);
  const [measureSegments, setMeasureSegments] = useState(0);
  const [measureArea, setMeasureArea] = useState<number | undefined>();

  // Compute a human-readable scale whenever the map moves/zooms
  useEffect(() => {
    const update = () => {
      const size = map.getSize();
      const p1 = map.containerPointToLatLng(L.point(size.x / 2 - 50, size.y / 2));
      const p2 = map.containerPointToLatLng(L.point(size.x / 2 + 50, size.y / 2));
      const dist = p1.distanceTo(p2); // metres across 100 px
      const mPerPx = dist / 100;
      const niceValues = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
      const targetM = mPerPx * 80;
      let best = niceValues[0];
      for (const v of niceValues) { if (v <= targetM * 1.2) best = v; }
      const label = best < 1
        ? `${Math.round(best * 100)} cm`
        : best >= 1000
          ? `${(best / 1000).toFixed(best >= 2000 ? 0 : 1)} km`
          : `${best} m`;
      setScaleLabel(label);
      setScaleBarPx(Math.max(30, Math.min(Math.round(best / mPerPx), 120)));
    };
    update();
    map.on("zoomend moveend resize", update);
    return () => { map.off("zoomend moveend resize", update); };
  }, [map]);

  const handleMeasureUpdate = useCallback(
    (total: number, segments: number, area?: number) => {
      setMeasureTotal(total);
      setMeasureSegments(segments);
      setMeasureArea(area);
    },
    [],
  );

  const closeMeasure = useCallback(() => {
    setMeasureMode(null);
    setMeasureTotal(0);
    setMeasureSegments(0);
    setMeasureArea(undefined);
  }, []);

  const toggleMode = (mode: "distance" | "area") => {
    if (measureMode === mode) { closeMeasure(); return; }
    setMeasureMode(mode);
    setMeasureTotal(0);
    setMeasureSegments(0);
    setMeasureArea(undefined);
  };

  const isActive = measureMode !== null;

  return (
    <>
      <div className="gardenos-map-toolbar" onClick={(e) => e.stopPropagation()}>
        {/* Zoom in */}
        <button type="button" title="Zoom ind" className="toolbar-btn" onClick={() => map.zoomIn()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>
          </svg>
        </button>
        {/* Zoom out */}
        <button type="button" title="Zoom ud" className="toolbar-btn" onClick={() => map.zoomOut()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="8" x2="13" y2="8"/>
          </svg>
        </button>

        <div className="toolbar-sep" />

        {/* Scale ruler */}
        <div className="toolbar-scale" title="Dynamisk skala">
          <div className="scale-ruler" style={{ width: `${scaleBarPx}px` }}>
            <div className="scale-tick" />
            <div className="scale-line" />
            <div className="scale-tick" />
          </div>
          <span className="scale-label">{scaleLabel}</span>
        </div>

        <div className="toolbar-sep" />

        {/* Distance measure */}
        <button
          type="button"
          title={measureMode === "distance" ? "Afslut afstandsm\u00e5ling (Esc)" : "M\u00e5l afstand"}
          className={`toolbar-btn ${measureMode === "distance" ? "toolbar-btn--active" : ""}`}
          onClick={() => toggleMode("distance")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="2" y1="14" x2="14" y2="2" strokeDasharray="2 2"/>
            <line x1="2" y1="14" x2="2" y2="10"/><line x1="2" y1="14" x2="6" y2="14"/>
            <line x1="14" y1="2" x2="14" y2="6"/><line x1="14" y1="2" x2="10" y2="2"/>
          </svg>
        </button>
        {/* Area measure */}
        <button
          type="button"
          title={measureMode === "area" ? "Afslut arealm\u00e5ling (Esc)" : "M\u00e5l areal"}
          className={`toolbar-btn ${measureMode === "area" ? "toolbar-btn--active" : ""}`}
          onClick={() => toggleMode("area")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="3,13 2,5 7,2 14,4 13,12 8,14" fill="none"/>
          </svg>
        </button>

        {/* Inline measurement result */}
        {isActive && (
          <>
            <div className="toolbar-sep" />
            <div className="toolbar-result">
              {measureSegments === 0 ? (
                <span className="result-hint">Klik p\u00e5 kortet</span>
              ) : measureMode === "area" && measureArea != null ? (
                <>
                  <span className="result-value result-value--area">{formatAreaSquareMeters(measureArea)}</span>
                  <span className="result-detail">{formatEdgeLength(measureTotal)} omk.</span>
                </>
              ) : (
                <>
                  <span className="result-value">{formatEdgeLength(measureTotal)}</span>
                  {measureSegments > 1 && <span className="result-detail">{measureSegments} seg</span>}
                </>
              )}
            </div>
            <button type="button" className="toolbar-btn toolbar-btn--close" onClick={closeMeasure} title="Luk (Esc)">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/>
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Keyboard hints (subtle, below toolbar) */}
      {isActive && (
        <div className="gardenos-measure-hint-bar">
          {measureMode === "area"
            ? "Klik = hj\u00f8rne \u00b7 Klik 1. punkt / dblklik = luk polygon \u00b7 \u2318Z = fortryd \u00b7 Esc = luk"
            : "Klik = tilf\u00f8j punkt \u00b7 \u2318Z = fortryd \u00b7 Esc = luk"}
        </div>
      )}

      {/* Measure overlay (Leaflet layers only – no DOM) */}
      {measureMode && (
        <MeasureOverlay
          key={measureMode}
          mode={measureMode}
          onUpdate={handleMeasureUpdate}
          onClose={closeMeasure}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// MeasureOverlay – distance or area measurement via Leaflet layers
// ---------------------------------------------------------------------------
function MeasureOverlay({ mode, onUpdate, onClose }: {
  mode: "distance" | "area";
  onUpdate: (total: number, segments: number, area?: number) => void;
  onClose: () => void;
}) {
  const map = useMap();
  const pointsRef = useRef<L.LatLng[]>([]);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const ghostLineRef = useRef<L.Polyline | null>(null);
  const ghostLabelRef = useRef<L.Marker | null>(null);
  const closedRef = useRef(false);

  useEffect(() => {
    const lg = L.layerGroup().addTo(map);
    layerGroupRef.current = lg;
    map.getContainer().style.cursor = "crosshair";
    map.doubleClickZoom.disable();

    const accent = mode === "area" ? "#1d6fa5" : "#2d7a3a";

    /* ---- full redraw from pointsRef ---- */
    const redraw = () => {
      lg.clearLayers();
      ghostLineRef.current = null;
      ghostLabelRef.current = null;
      const pts = pointsRef.current;
      let total = 0;

      for (let i = 0; i < pts.length; i++) {
        // Vertex dot
        L.circleMarker(pts[i], {
          radius: 4, color: "#fff", fillColor: accent, fillOpacity: 1, weight: 2,
        }).addTo(lg);

        if (i > 0) {
          const segDist = pts[i - 1].distanceTo(pts[i]);
          total += segDist;
          L.polyline([pts[i - 1], pts[i]], {
            color: accent, weight: 2, opacity: 0.85, dashArray: "6,4",
          }).addTo(lg);
          const mid = L.latLng((pts[i - 1].lat + pts[i].lat) / 2, (pts[i - 1].lng + pts[i].lng) / 2);
          L.marker(mid, {
            icon: L.divIcon({
              className: "gardenos-measure-label",
              html: `<span>${formatEdgeLength(segDist)}</span>`,
              iconSize: [80, 22], iconAnchor: [40, 11],
            }),
            interactive: false,
          }).addTo(lg);
        }
      }

      /* Area mode: closed polygon */
      if (mode === "area" && closedRef.current && pts.length >= 3) {
        const closeDist = pts[pts.length - 1].distanceTo(pts[0]);
        total += closeDist;
        // Closing segment
        L.polyline([pts[pts.length - 1], pts[0]], {
          color: accent, weight: 2, opacity: 0.85, dashArray: "6,4",
        }).addTo(lg);
        const closeMid = L.latLng(
          (pts[pts.length - 1].lat + pts[0].lat) / 2,
          (pts[pts.length - 1].lng + pts[0].lng) / 2,
        );
        L.marker(closeMid, {
          icon: L.divIcon({
            className: "gardenos-measure-label",
            html: `<span>${formatEdgeLength(closeDist)}</span>`,
            iconSize: [80, 22], iconAnchor: [40, 11],
          }),
          interactive: false,
        }).addTo(lg);
        // Filled polygon
        L.polygon(pts, {
          color: accent, weight: 2, fillColor: accent, fillOpacity: 0.10, dashArray: "6,4",
        }).addTo(lg);
        // Area label at centroid
        const area = computeGeodesicArea(pts);
        const cLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
        const cLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
        L.marker(L.latLng(cLat, cLng), {
          icon: L.divIcon({
            className: "gardenos-measure-area-label",
            html: `<span>${formatAreaSquareMeters(area)}</span>`,
            iconSize: [100, 28], iconAnchor: [50, 14],
          }),
          interactive: false,
        }).addTo(lg);

        onUpdate(total, pts.length, area);
      } else {
        onUpdate(total, Math.max(0, pts.length - 1));
      }
    };

    /* ---- handlers ---- */
    const onClick = (e: L.LeafletMouseEvent) => {
      if (closedRef.current) return;
      const pts = pointsRef.current;

      // Area: close polygon when clicking near first vertex
      if (mode === "area" && pts.length >= 3) {
        const firstPx = map.latLngToContainerPoint(pts[0]);
        const clickPx = map.latLngToContainerPoint(e.latlng);
        if (firstPx.distanceTo(clickPx) < 15) {
          closedRef.current = true;
          redraw();
          return;
        }
      }
      pts.push(e.latlng);
      redraw();
    };

    const onDblClick = (e: L.LeafletMouseEvent) => {
      if (mode === "area" && pointsRef.current.length >= 3 && !closedRef.current) {
        L.DomEvent.stop(e);
        closedRef.current = true;
        redraw();
      }
    };

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const pts = pointsRef.current;
      if (pts.length === 0 || closedRef.current) return;
      const last = pts[pts.length - 1];

      // Ghost line from last point to cursor
      if (!ghostLineRef.current) {
        ghostLineRef.current = L.polyline([last, e.latlng], {
          color: accent, weight: 1.5, opacity: 0.45, dashArray: "4,6",
        }).addTo(lg);
      } else {
        ghostLineRef.current.setLatLngs([last, e.latlng]);
      }

      // Ghost distance label
      const dist = last.distanceTo(e.latlng);
      const mid = L.latLng((last.lat + e.latlng.lat) / 2, (last.lng + e.latlng.lng) / 2);
      if (!ghostLabelRef.current) {
        ghostLabelRef.current = L.marker(mid, {
          icon: L.divIcon({
            className: "gardenos-measure-ghost-label",
            html: `<span>${formatEdgeLength(dist)}</span>`,
            iconSize: [80, 22], iconAnchor: [40, 11],
          }),
          interactive: false,
        }).addTo(lg);
      } else {
        ghostLabelRef.current.setLatLng(mid);
        const el = (ghostLabelRef.current as unknown as { _icon?: HTMLElement })._icon;
        if (el) el.innerHTML = `<span>${formatEdgeLength(dist)}</span>`;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        const pts = pointsRef.current;
        if (pts.length === 0) return;
        if (closedRef.current) {
          closedRef.current = false; // re-open polygon
        } else {
          pts.pop();
        }
        redraw();
      }
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    map.on("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      map.off("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      lg.remove();
      map.getContainer().style.cursor = "";
      map.doubleClickZoom.enable();
    };
  }, [map, mode, onUpdate, onClose]);

  return null; // All visuals are Leaflet layers; HUD lives in MapToolbar
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

// ── Small presentational components (extracted to reduce duplication) ──

/** Companion planting check summary — used in both row and seedbed/container panels. */
function CompanionChecksBlock({ checks }: { checks: CompanionCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/50">Samdyrkning</p>
      {checks.map((c, idx) => (
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
  );
}

/** Crop rotation warning summary — used in both row and seedbed/container panels. */
function RotationWarningsBlock({ warnings }: { warnings: { plant: PlantSpecies; lastSeason: number; minYears: number }[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/50">Sædskifte</p>
      {warnings.map((w, idx) => (
        <p key={idx} className="text-xs text-amber-600 dark:text-amber-400">
          🔄 {w.plant.name} — samme familie dyrket i {w.lastSeason} (vent {w.minYears} år)
        </p>
      ))}
    </div>
  );
}

export function GardenMapClient({ userId }: { userId: string }) {
  // ── Scope all localStorage keys to the authenticated user ──
  setCurrentUser(userId);

  const { data: sessionData } = useSession();
  const isAdmin = (sessionData?.user as { role?: string })?.role === "admin";

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
  const [sidebarTab, setSidebarTab] = useState<"create" | "content" | "groups" | "plants" | "view" | "scan" | "chat" | "tasks" | "conflicts" | "designs" | "climate" | "journal">("create");
  const [sidebarPanelOpen, setSidebarPanelOpen] = useState(true);

  // ── Lightweight activity tracker (fire-and-forget) ──
  const trackActivity = useCallback((action: string, detail?: string) => {
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, detail }),
    }).catch(() => {/* ignore */});
  }, []);

  const toggleSidebarPanel = useCallback((tabId?: typeof sidebarTab) => {
    if (tabId && tabId !== sidebarTab) {
      setSidebarTab(tabId);
      setSidebarPanelOpen(true);
      trackActivity(`tab:${tabId}`);
    } else if (tabId && tabId === sidebarTab) {
      setSidebarPanelOpen((v) => !v);
    } else {
      setSidebarPanelOpen((v) => !v);
    }
  }, [sidebarTab, trackActivity]);
  // ── Invalidate Leaflet size when sidebar panel opens/closes ──
  useEffect(() => {
    const t1 = setTimeout(() => mapRef.current?.invalidateSize(), 50);
    const t2 = setTimeout(() => mapRef.current?.invalidateSize(), 320);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [sidebarPanelOpen]);

  const [viewSubTab, setViewSubTab] = useState<"steder" | "baggrund" | "synlighed" | "ankre" | "eksport">("steder");
  const [libSubTab, setLibSubTab] = useState<"plants" | "soil">("plants");
  const [libSoilEditId, setLibSoilEditId] = useState<string | null>(null);
  const [soilEditReturnToContent, setSoilEditReturnToContent] = useState(false);

  // ── Draft state for name/notes (commit on blur/Enter, not per-keystroke) ──
  const [draftName, setDraftName] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const draftNameDirty = selected ? draftName !== (selected.feature.properties?.name ?? "") : false;
  const draftNotesDirty = selected ? draftNotes !== (selected.feature.properties?.notes ?? "") : false;

  // ── Task list state ──
  const [taskVersion, setTaskVersion] = useState(0);
  const [taskSavedFlash, setTaskSavedFlash] = useState<string | false>(false);

  // ── Sync status ──
  const [syncStatus, setSyncStatusState] = useState<SyncStatus>(getSyncStatus);
  useEffect(() => {
    return onSyncStatusChange(setSyncStatusState);
  }, []);

  // ── Journal / Dagbog state ──
  const [journalVersion, setJournalVersion] = useState(0);

  // ── User settings modal state ──
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Saved Designs state ──
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>([]);
  const [designsLoading, setDesignsLoading] = useState(false);
  const [designError, setDesignError] = useState<string | null>(null);
  const [designSaving, setDesignSaving] = useState(false);
  const [designLoadedFlash, setDesignLoadedFlash] = useState<string | false>(false);
  const [userMaxDesigns, setUserMaxDesigns] = useState(DEFAULT_MAX_DESIGNS);
  const designsLoadedOnce = useRef(false);
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [activeDesignName, setActiveDesignName] = useState<string | null>(null);
  const [quickSaveFlash, setQuickSaveFlash] = useState(false);

  // Seed default soil profiles on first load (if user has none yet)
  useEffect(() => {
    if (ensureDefaultProfiles()) setSoilDataVersion((v) => v + 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load designs on mount (so toolbar quick-save works immediately)
  useEffect(() => {
    if (designsLoadedOnce.current) return;
    designsLoadedOnce.current = true;
    setDesignsLoading(true);
    fetchDesigns()
      .then((resp) => { setSavedDesigns(resp.designs); setUserMaxDesigns(resp.maxDesigns); })
      .catch(() => setDesignError("Kunne ikke hente designs"))
      .finally(() => setDesignsLoading(false));
  }, []);

  // Quick-save: overwrite active design from toolbar
  const handleQuickSave = useCallback(async () => {
    if (!activeDesignId) return;
    setDesignSaving(true);
    setDesignError(null);
    try {
      const group = featureGroupRef.current;
      if (!group) return;
      const layoutJson = JSON.stringify(serializeGroup(group));
      const plantsJson = JSON.stringify(loadPlantInstances());
      const d = await updateDesign(activeDesignId, { layout: layoutJson, plants: plantsJson });
      setSavedDesigns((prev) => prev.map((x) => (x.id === activeDesignId ? d : x)));
      setDesignLoadedFlash("Gemt!");
      setTimeout(() => setDesignLoadedFlash(false), 2000);
      setQuickSaveFlash(true);
      setTimeout(() => setQuickSaveFlash(false), 2000);
    } catch (e: unknown) {
      setDesignError(e instanceof Error ? e.message : "Fejl");
    } finally {
      setDesignSaving(false);
    }
  }, [activeDesignId]);

  // ── DesignsTab callbacks ──
  const getCurrentLayoutAndPlants = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return null;
    return {
      layoutJson: JSON.stringify(serializeGroup(group)),
      plantsJson: JSON.stringify(loadPlantInstances()),
    };
  }, []);

  const applyDesignToMap = useCallback((layoutJson: string, plantsJson: string) => {
    const layout = JSON.parse(layoutJson);
    const plants: PlantInstance[] = JSON.parse(plantsJson);
    const group = featureGroupRef.current;
    if (!group) throw new Error("featureGroup unavailable");
    group.clearLayers();
    const geoJsonLayer = L.geoJSON(layout, {
      onEachFeature: (feature, layer) => {
        attachClickHandlerRef.current(layer, feature as GardenFeature);
      },
    });
    geoJsonLayer.eachLayer((layer) => group.addLayer(layer));
    window.localStorage.setItem(userKey(STORAGE_LAYOUT_KEY), JSON.stringify(layout));
    markDirty(STORAGE_LAYOUT_KEY);
    setLayoutForContainment(layout);
    savePlantInstances(plants);
    setPlantInstancesVersion((v) => v + 1);
    setSelectedAndFocus(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mobile sidebar state ──
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const openMobileSidebar = useCallback((tab?: typeof sidebarTab) => {
    if (tab) setSidebarTab(tab);
    setMobileSidebarOpen(true);
  }, []);
  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  // ── Mobile bottom-nav: customisable pinned shortcuts ──
  type SidebarTabId = typeof sidebarTab;
  const ALL_SIDEBAR_TABS: { id: SidebarTabId; icon: string; label: string }[] = [
    { id: "create", icon: "＋", label: "Opret" },
    { id: "content", icon: "◉", label: "Indhold" },
    { id: "conflicts", icon: "⚡", label: "Konflikter" },
    { id: "groups", icon: "⊞", label: "Grupper" },
    { id: "plants", icon: "�", label: "Bibliotek" },
    { id: "scan", icon: "�️", label: "Værktøj" },
    { id: "view", icon: "🗺️", label: "Kort" },
    { id: "tasks", icon: "📋", label: "Planlæg" },
    { id: "climate", icon: "🌡️", label: "Klima" },
    { id: "journal", icon: "📓", label: "Dagbog" },
    { id: "designs", icon: "💾", label: "Designs" },
  ];
  const DEFAULT_PINNED: SidebarTabId[] = ["create", "scan", "plants", "content"];
  const PINNED_STORAGE_KEY = "gardenos:mobile:pinnedTabs:v1";
  const [pinnedMobileTabs, setPinnedMobileTabs] = useState<SidebarTabId[]>(() => {
    if (typeof window === "undefined") return DEFAULT_PINNED;
    try {
      const raw = localStorage.getItem(userKey(PINNED_STORAGE_KEY));
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length > 0) return arr; }
    } catch { /* ignore */ }
    return DEFAULT_PINNED;
  });
  const savePinnedTabs = useCallback((tabs: SidebarTabId[]) => {
    setPinnedMobileTabs(tabs);
    try { localStorage.setItem(userKey(PINNED_STORAGE_KEY), JSON.stringify(tabs)); } catch { /* ignore */ }
  }, []);
  const [mobileNavMenuOpen, setMobileNavMenuOpen] = useState(false);
  const togglePinnedTab = useCallback((id: SidebarTabId) => {
    setPinnedMobileTabs((prev) => {
      const next = prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id];
      try { localStorage.setItem(userKey(PINNED_STORAGE_KEY), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // ── Sidebar tab-strip: pinned quick-access tabs (ordered) ──
  const MAX_PINNED_SIDEBAR = 6;
  const DEFAULT_SIDEBAR_PINS: SidebarTabId[] = ["create", "content", "plants", "scan", "conflicts", "chat"];
  const SIDEBAR_PINS_KEY = "gardenos:sidebar:pinnedTabs:v2";
  const [pinnedSidebarTabs, setPinnedSidebarTabs] = useState<SidebarTabId[]>(() => {
    if (typeof window === "undefined") return DEFAULT_SIDEBAR_PINS;
    try {
      const raw = localStorage.getItem(userKey(SIDEBAR_PINS_KEY));
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length > 0) return arr; }
    } catch { /* ignore */ }
    return DEFAULT_SIDEBAR_PINS;
  });
  const saveSidebarPins = useCallback((tabs: SidebarTabId[]) => {
    setPinnedSidebarTabs(tabs);
    try { localStorage.setItem(userKey(SIDEBAR_PINS_KEY), JSON.stringify(tabs)); } catch { /* ignore */ }
  }, []);
  const toggleSidebarPin = useCallback((id: SidebarTabId) => {
    setPinnedSidebarTabs((prev) => {
      const next = prev.includes(id)
        ? prev.filter((t) => t !== id)
        : prev.length < MAX_PINNED_SIDEBAR ? [...prev, id] : prev;
      try { localStorage.setItem(userKey(SIDEBAR_PINS_KEY), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [forceStartTour, setForceStartTour] = useState(false);

  // ── Toast notification state (replaces alert()) ──
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error" | "warning" | "info">("info");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string, type: "success" | "error" | "warning" | "info" = "info") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    setToastType(type);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 6000);
  }, []);

  // ── Guide overlay state (floating ❓ on map) ──
  const [guidePopoverOpen, setGuidePopoverOpen] = useState(false);
  const [guideAiOpen, setGuideAiOpen] = useState(false);
  const [guideAiMessages, setGuideAiMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [guideAiInput, setGuideAiInput] = useState("");
  const [guideAiLoading, setGuideAiLoading] = useState(false);
  const guideAiScrollRef = useRef<HTMLDivElement>(null);
  const guideAiInputRef = useRef<HTMLInputElement>(null);

  const sendGuideAiMessage = useCallback(async () => {
    const text = guideAiInput.trim();
    if (!text || guideAiLoading) return;
    const userMsg = { role: "user" as const, content: text };
    setGuideAiMessages((prev) => [...prev, userMsg]);
    setGuideAiInput("");
    setGuideAiLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...guideAiMessages, userMsg],
          persona: "app-guide",
        }),
      });
      if (!res.ok) throw new Error("API error");
      setGuideAiMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      await readSSEStream(res, (text) => {
        setGuideAiMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: text };
          return copy;
        });
      });
    } catch {
      setGuideAiMessages((prev) => [...prev, { role: "assistant", content: "⚠️ Kunne ikke få svar. Prøv igen." }]);
    } finally {
      setGuideAiLoading(false);
    }
  }, [guideAiInput, guideAiLoading, guideAiMessages]);

  // Auto-scroll guide chat
  useEffect(() => {
    guideAiScrollRef.current?.scrollTo({ top: guideAiScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [guideAiMessages]);

  // Drag-and-drop reorder state for the picker
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const handlePickerDragStart = useCallback((idx: number) => { setDragIdx(idx); }, []);
  const handlePickerDragOver = useCallback((e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); }, []);
  const handlePickerDrop = useCallback((dropIdx: number) => {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    setPinnedSidebarTabs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, moved);
      try { localStorage.setItem(userKey(SIDEBAR_PINS_KEY), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx]);
  const handlePickerDragEnd = useCallback(() => { setDragIdx(null); setDragOverIdx(null); }, []);

  // ── Server sync: pull latest data on mount, then reload state ──
  const [syncReady, setSyncReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    pullFromServer().then(() => {
      if (!cancelled) setSyncReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Keyboard shortcuts: ⌘1-⌘9 for sidebar tabs (all tabs, in order)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        const idx = num - 1;
        if (idx < ALL_SIDEBAR_TABS.length) {
          e.preventDefault();
          const tabId = ALL_SIDEBAR_TABS[idx].id;
          if (tabId === "content" && !selected) return;
          toggleSidebarPanel(tabId);
          if (tabId !== "groups") setHighlightedGroupId(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ALL_SIDEBAR_TABS, selected, toggleSidebarPanel]);

  // ── Weather module state ──
  const [weatherData, setWeatherData] = useState<WeatherData | null>(() => loadWeatherCache());
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherHistory, setWeatherHistory] = useState(() => loadWeatherHistory());
  const [weatherStatRange, setWeatherStatRange] = useState<number>(30);

  // Fetch weather on mount + every 30 min
  useEffect(() => {
    const doFetch = async () => {
      // Get lat/lng from saved view
      const viewRaw = localStorage.getItem(userKey("gardenos:view:v1"));
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

  // ── Plant knowledge system state ──
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
  const [contentTypeOpen, setContentTypeOpen] = useState(false);
  const [contentNameOpen, setContentNameOpen] = useState(false);
  const [contentContainsOpen, setContentContainsOpen] = useState(true);
  const [contentGrowingOpen, setContentGrowingOpen] = useState(false);
  const [contentNotesOpen, setContentNotesOpen] = useState(false);
  const [contentSpeciesOpen, setContentSpeciesOpen] = useState(false);
  const [contentAreaFieldsOpen, setContentAreaFieldsOpen] = useState(false);
  const [contentConditionFieldsOpen, setContentConditionFieldsOpen] = useState(false);
  const [speciesPickerSearch, setSpeciesPickerSearch] = useState("");

  // ── Soil profile edit state ──
  const [soilPanelOpen, setSoilPanelOpen] = useState(false);
  const [soilDataVersion, setSoilDataVersion] = useState(0);

  // ── Auto-row creation state ──
  const [autoRowOpen, setAutoRowOpen] = useState(false);
  const [autoRowSpeciesId, setAutoRowSpeciesId] = useState<string | null>(null);
  const [autoRowVarietyId, setAutoRowVarietyId] = useState<string | null>(null);
  const [autoRowSearch, setAutoRowSearch] = useState("");
  const [autoRowCount, setAutoRowCount] = useState(0); // 0 = auto-max
  const [autoRowEdgeMarginCm, setAutoRowEdgeMarginCm] = useState(10);
  const [autoRowDirection, setAutoRowDirection] = useState<"length" | "width">("length");

  // ── Auto-element placement state ──
  const [autoElementOpen, setAutoElementOpen] = useState(false);
  const [autoElementSpeciesId, setAutoElementSpeciesId] = useState<string | null>(null);
  const [autoElementVarietyId, setAutoElementVarietyId] = useState<string | null>(null);
  const [autoElementSearch, setAutoElementSearch] = useState("");
  const [autoElementCount, setAutoElementCount] = useState(0); // 0 = auto-max
  const [autoElementEdgeMarginCm, setAutoElementEdgeMarginCm] = useState(15);

  // ── Design Lab overlay state ──
  const [showDesignLab, setShowDesignLab] = useState(false);

  // ── Grid overlay state ──
  const [showGrid, setShowGrid] = useState(true);
  const gridLayerRef = useRef<L.Layer | null>(null);

  // ── Sun exposure heatmap overlay state ──
  const [showSunMap, setShowSunMap] = useState(false);
  const sunLayerRef = useRef<L.Layer | null>(null);
  const sunCastersRef = useRef<ShadeCaster[]>([]);

  // ── Design Lab plant overlay markers ──
  const designLabMarkersRef = useRef<L.LayerGroup | null>(null);

  // ── Design Lab layout change handler ref (populated after rebuildFromGroupAndUpdateSelection is defined) ──
  const designLabLayoutChangeRef = useRef<((layout: BedLayout) => void) | null>(null);

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
  /** SubGroup filter tab for area / condition palettes */
  const [createSubGroupFilter, setCreateSubGroupFilter] = useState<KindSubGroup | null>(null);
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
  const [dfUser, setDfUser] = useState(() => window.localStorage.getItem(userKey("gardenos:df:user")) ?? "");
  const [dfPass, setDfPass] = useState(() => window.localStorage.getItem(userKey("gardenos:df:pass")) ?? "");
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

  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchAddress = useCallback(async (q: string) => {
    if (!q.trim()) { setAddressResults([]); return; }
    setAddressSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&countrycodes=dk&addressdetails=1`,
        { headers: { "Accept-Language": "da" } }
      );
      const data = await res.json();
      setAddressResults(data);
    } catch { setAddressResults([]); }
    setAddressSearching(false);
  }, []);

  // Debounced autocomplete – fires 400ms after the user stops typing
  const searchAddressDebounced = useCallback((q: string) => {
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    if (!q.trim() || q.trim().length < 3) { setAddressResults([]); return; }
    addressDebounceRef.current = setTimeout(() => searchAddress(q), 400);
  }, [searchAddress]);

  const goToLocation = useCallback((lat: number, lon: number, zoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([lat, lon], zoom ?? 18);
    setShowAddressSearch(false);
    setAddressResults([]);
  }, []);

  const addBookmark = useCallback((name: string, emoji?: string, coords?: { lat: number; lon: number; zoom?: number }, favorite?: boolean) => {
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
      favorite: favorite ?? false,
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
  const [groupSectionOpen, setGroupSectionOpen] = useState(false);
  const edgeLabelLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const rowEmojiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const conflictOverlayRef = useRef<L.LayerGroup | null>(null);
  const placementPreviewRef = useRef<L.LayerGroup | null>(null);
  const [layoutForContainment, setLayoutForContainment] = useState<GardenFeatureCollection>(() => {
    const parsed = safeJsonParse<unknown>(window.localStorage.getItem(userKey(STORAGE_LAYOUT_KEY)));
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
          setSidebarPanelOpen(true);
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

  /** Find the parent feature that contains the currently selected feature */
  const selectedParentFeature = useMemo(() => {
    if (!selected) return null;
    const myId = selected.gardenosId;
    // Check parentBedId first (auto-rows store this)
    const parentBedId = selected.feature.properties?.parentBedId;
    if (parentBedId) {
      const pf = layoutForContainment.features.find((f) => (f as GardenFeature).properties?.gardenosId === parentBedId) as GardenFeature | undefined;
      if (pf) {
        const cat = pf.properties?.category ?? "";
        const catLabel = CATEGORY_LABELS[cat as GardenFeatureCategory] ?? cat;
        return { id: parentBedId, name: pf.properties?.name ?? catLabel, category: cat };
      }
    }
    // Fallback: scan containment map for who contains this feature
    for (const [containerId, childIds] of containment.childIdsByContainerId) {
      if (childIds.includes(myId)) {
        const pf = layoutForContainment.features.find((f) => (f as GardenFeature).properties?.gardenosId === containerId) as GardenFeature | undefined;
        if (pf) {
          const cat = pf.properties?.category ?? "";
          const catLabel = CATEGORY_LABELS[cat as GardenFeatureCategory] ?? cat;
          return { id: containerId, name: pf.properties?.name ?? catLabel, category: cat };
        }
      }
    }
    return null;
  }, [selected, containment, layoutForContainment]);

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

  // ── Memoized heavy computations for plan sub-tabs ──
  const memoCalendar = useMemo(() => buildGardenCalendar(), [plantInstancesVersion, plantDataVersion]);
  const { rotationPlan: memoRotationPlan, currentYear: memoCurrentYear } = useMemo(() => {
    const currentYear = getCurrentSeason();
    return { rotationPlan: buildRotationPlan(layoutForContainment, [currentYear - 3, currentYear + 1]), currentYear };
  }, [layoutForContainment, plantInstancesVersion]);
  const memoWateringAdvice = useMemo(() => {
    const adviceList: BedWateringAdvice[] = [];
    if (layoutForContainment?.features?.length) {
      for (const f of layoutForContainment.features) {
        const props = (f as GardenFeature).properties;
        const fId = props?.gardenosId;
        if (!fId) continue;
        const instances = getInstancesForFeature(fId);
        if (instances.length === 0) continue;
        const species = instances
          .map((inst) => getPlantById(inst.speciesId))
          .filter(Boolean) as PlantSpecies[];
        if (species.length === 0) continue;
        const soilId = props?.soilProfileId as string | undefined;
        const soilResult = soilId ? getSoilProfileById(soilId) : null;
        const soil: SoilProfile | null = soilResult ?? null;
        const bedName = props?.name || props?.kind || "Ukendt";
        adviceList.push(
          computeWateringAdvice({ featureId: fId, bedName, weather: weatherData, soilProfile: soil, plantSpecies: species }),
        );
      }
    }
    return sortByUrgency(adviceList);
  }, [layoutForContainment, weatherData, plantInstancesVersion, plantDataVersion]);

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
        if (feature?.properties?.soilProfileId) {
          const sp = getSoilProfileById(feature.properties.soilProfileId);
          if (sp?.baseType) details.push(`Jord: ${SOIL_BASE_TYPE_LABELS[sp.baseType]}`);
          else if (sp?.name) details.push(`Jord: ${sp.name}`);
        } else if (feature?.properties?.soilType) {
          details.push(`Jord: ${feature.properties.soilType}`);
        }
        if (feature?.properties?.fertilizer) details.push(`Gødning: ${feature.properties.fertilizer}`);
        if (details.length > 0) plantSuffix += `\n${details.join(" · ")}`;
      }

      // Add container soil profile info to tooltip
      if (featureCat === "container" && feature?.properties?.soilProfileId) {
        const sp = getSoilProfileById(feature.properties.soilProfileId);
        if (sp?.baseType) plantSuffix += `\nJord: ${SOIL_BASE_TYPE_LABELS[sp.baseType]}`;
        else if (sp?.name) plantSuffix += `\nJord: ${sp.name}`;
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
      // Resolve SubGroup for current feature
      const featureSubGroup = (() => {
        const k = (kind ?? "") as string;
        const def = KNOWN_KIND_DEFS.find((d) => d.kind === k);
        return def?.subGroup ?? "default";
      })();

      // Area polygons: style per SubGroup
      const cat = feature?.properties?.category;
      if (cat === "area") {
        if (featureSubGroup === "cover") {
          // Overdækninger – distinct dashes, slight opacity
          maybePath.setStyle({
            color: "var(--foreground)",
            weight: 2,
            opacity: 0.9,
            fillOpacity: 0.03,
            dashArray: "6 6",
          });
        } else if (featureSubGroup === "structure") {
          // Bygninger – solid-ish, more fill to show occupied space
          maybePath.setStyle({
            color: "var(--foreground)",
            weight: 2,
            opacity: 0.6,
            fillOpacity: 0.08,
            dashArray: "4 2",
          });
        } else {
          // Havezoner (default/zone) – light dashed border
          maybePath.setStyle({
            color: "var(--foreground)",
            weight: 2,
            opacity: 0.7,
            fillOpacity: 0.03,
            dashArray: "8 4",
          });
        }
        return;
      }

      // Condition overlays: style per SubGroup
      if (cat === "condition") {
        if (featureSubGroup === "soil") {
          maybePath.setStyle({
            color: "var(--foreground)",
            weight: 1,
            opacity: 0.5,
            fillOpacity: 0.06,
            dashArray: "2 4",
          });
        } else {
          // Climate – slightly different pattern
          maybePath.setStyle({
            color: "var(--foreground)",
            weight: 1,
            opacity: 0.4,
            fillOpacity: 0.08,
            dashArray: "3 5",
          });
        }
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
      const allLayersForZ: Array<{ layer: L.Layer; pri: number }> = [];
      group.eachLayer((layer) => {
        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
        const cat = f?.properties?.category ?? "element";
        allLayersForZ.push({ layer, pri: CATEGORY_Z_PRIORITY[cat] ?? 3 });
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

      // --- Re-establish z-order for categories ABOVE the selected item ---
      // bringToFront() above may have moved a selected seedbed/area on top
      // of rows and elements.  Re-bring higher-priority layers to front so
      // they remain clickable.
      if (selectedId) {
        let selectedPri = 5;
        group.eachLayer((layer) => {
          const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
          if (f?.properties?.gardenosId === selectedId) {
            selectedPri = CATEGORY_Z_PRIORITY[f.properties?.category ?? "element"] ?? 3;
          }
        });
        const higherLayers: Array<{ layer: L.Layer; pri: number }> = [];
        group.eachLayer((layer) => {
          const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
          const cat = f?.properties?.category ?? "element";
          const pri = CATEGORY_Z_PRIORITY[cat] ?? 3;
          if (pri > selectedPri) higherLayers.push({ layer, pri });
        });
        higherLayers.sort((a, b) => a.pri - b.pri);
        for (const { layer: zLayer } of higherLayers) {
          (zLayer as unknown as { bringToFront?: () => void }).bringToFront?.();
        }
      }
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

      // Resolve emoji icon: check feature prop, then PlantInstances
      let rowIcon = f.properties?.customIcon;
      if (!rowIcon && f.properties?.speciesId) {
        const sp = getPlantById(f.properties.speciesId);
        if (sp?.icon) rowIcon = sp.icon;
      }
      if (!rowIcon) {
        const fId = f.properties?.gardenosId;
        if (fId) {
          const instances = getInstancesForFeature(fId);
          if (instances.length > 0) {
            const sp = getPlantById(instances[0].speciesId);
            if (sp?.icon) rowIcon = sp.icon;
          }
        }
      }
      if (!rowIcon) rowIcon = "🌱";

      // Create marker — identical pattern to edge labels (iconSize [0,0], anchor [0,0])
      const isImg = rowIcon.startsWith("data:image/");
      const icon = L.divIcon({
        className: "gardenos-row-emoji-overlay",
        html: isImg
          ? `<img src="${rowIcon}" alt="" style="width:20px;height:20px;object-fit:contain;border-radius:3px;" />`
          : `<span>${rowIcon}</span>`,
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
  }, [featureGroupRef, mapRef, hiddenCategories, hiddenVisibilityKinds, plantInstancesVersion]);

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

  // ── Cached conflict scan — used by conflict tab, content tab, and overlays ──
  const allConflicts = useMemo(() => {
    return detectPlantConflicts(layoutForContainment.features);
  }, [layoutForContainment]);

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

    const conflicts = allConflicts;
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

    // For each conflicted feature, place a small warning badge (NO lines — cleaner)
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
          html: `<span style="font-size:${badgeSize}px;line-height:1;cursor:pointer" title="${fConflicts.length} konflikt${fConflicts.length > 1 ? "er" : ""} — klik for detaljer">${emoji}<sup style="font-size:8px;font-weight:bold">${fConflicts.length}</sup></span>`,
          iconSize: [badgeSize + 8, badgeSize],
          iconAnchor: [-4, badgeSize + 4],
        }),
        interactive: true,
        zIndexOffset: 2000,
      });

      // Click badge → select feature & open content tab (shows conflict details)
      badge.on("click", () => {
        selectFeatureById(featureId);
      });

      overlayGroup.addLayer(badge);
    }

    overlayGroup.addTo(map);
    conflictOverlayRef.current = overlayGroup;
  }, [allConflicts, layoutForContainment, mapRef, selectFeatureById]);

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
    const spreadM = spreadDiameterM(species);
    const radiusM = spreadM / 2;

    // Check conflicts at this position
    const previewConflicts = checkPlacementConflicts(coords, species, layoutForContainment.features);
    const hasConflict = previewConflicts.length > 0;
    const worstSeverity = hasConflict ? Math.max(...previewConflicts.map((c) => c.severity)) : 0;
    const shadeConflicts = previewConflicts.filter((c) => c.type === "shade");

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

    // ── Shade zone visualization ──
    // If placing a TREE: show the shadow footprint (north-facing wedge)
    const heightM = estimateHeightM(species);
    if (heightM && heightM >= 2) {
      // Approximate shadow zone: a semi-ellipse to the north (in northern hemisphere)
      // Shadow reach ≈ height × 1.5 (equinox noon approximation at 56°N)
      const shadowReachM = heightM * 1.5;
      const canopyR = canopyRadiusM(species);
      // Draw a translucent wedge pointing roughly north
      // At 56°N, shadow falls between NW and NE, concentrated around due north at noon
      const centerBearing = 0; // north (shadow direction at noon)
      const halfSpread = 70; // degrees: shadow sweeps ~70° each side of north (morning east, evening west)
      const steps = 20;
      const polyPoints: L.LatLng[] = [latlng]; // start at tree
      for (let i = -steps; i <= steps; i++) {
        const angle = centerBearing + (halfSpread * i) / steps;
        const angleRad = (angle * Math.PI) / 180;
        // Distance varies: longer at edges (morning/evening lower sun), shorter at center (noon)
        const edgeFactor = 1 + 0.3 * Math.abs(i / steps); // edges are ~30% longer
        const dist = shadowReachM * edgeFactor;
        // Convert metres to lat/lng offset
        const dLat = (dist * Math.cos(angleRad)) / M_PER_DEG_LAT;
        const dLng = (dist * Math.sin(angleRad)) / (M_PER_DEG_LAT * Math.cos(latlng.lat * Math.PI / 180));
        polyPoints.push(L.latLng(latlng.lat + dLat, latlng.lng + dLng));
      }
      polyPoints.push(latlng); // close shape

      const shadeZone = L.polygon(polyPoints, {
        color: "#475569",
        fillColor: "#475569",
        fillOpacity: 0.12,
        weight: 1,
        opacity: 0.3,
        dashArray: "3 3",
        interactive: false,
      });
      previewGroup.addLayer(shadeZone);

      // Label for shade zone
      const northPoint = L.latLng(latlng.lat + shadowReachM / M_PER_DEG_LAT, latlng.lng);
      const shadeLabelIcon = L.divIcon({
        className: "gardenos-shade-label",
        html: `<div style="background:rgba(71,85,105,0.8);color:white;font-size:9px;padding:1px 5px;border-radius:3px;white-space:nowrap;pointer-events:none">🌑 Skygge ~${shadowReachM.toFixed(0)}m</div>`,
        iconSize: [100, 16],
        iconAnchor: [50, 8],
      });
      const shadeLabel = L.marker(northPoint, { icon: shadeLabelIcon, interactive: false, zIndexOffset: 2900 });
      previewGroup.addLayer(shadeLabel);
    }

    // If there are shade conflicts, draw a dashed line to each shaded plant
    for (const sc of shadeConflicts) {
      const shadedFeat = layoutForContainment.features.find((f) => f.properties?.gardenosId === sc.featureIdB);
      if (!shadedFeat || shadedFeat.geometry?.type !== "Point") continue;
      const shadedCoords = shadedFeat.geometry.coordinates as [number, number];
      const line = L.polyline(
        [latlng, L.latLng(shadedCoords[1], shadedCoords[0])],
        { color: "#475569", weight: 2, opacity: 0.5, dashArray: "4 6", interactive: false },
      );
      previewGroup.addLayer(line);
    }

    // Status label
    if (hasConflict) {
      const worstMsg = previewConflicts.reduce((worst, c) => c.severity > worst.severity ? c : worst, previewConflicts[0]);
      const summaryParts: string[] = [];
      const conflictTypes = new Set(previewConflicts.map((c) => c.type));
      if (conflictTypes.has("shade")) summaryParts.push(`☀️${shadeConflicts.length} skygge`);
      if (conflictTypes.has("spacing")) summaryParts.push(`📏 afstand`);
      if (conflictTypes.has("bad-companion")) summaryParts.push(`⛔ nabo`);
      if (conflictTypes.has("layer-competition")) summaryParts.push(`⚠️ lag`);
      const labelText = summaryParts.length > 1 ? summaryParts.join(" · ") : worstMsg.message;
      const labelIcon = L.divIcon({
        className: "gardenos-placement-label",
        html: `<div style="background:${color};color:white;font-size:10px;padding:2px 6px;border-radius:4px;white-space:nowrap;pointer-events:none;font-weight:600;max-width:300px;overflow:hidden;text-overflow:ellipsis">${worstSeverity >= 2 ? "⚠️" : "💡"} ${labelText}</div>`,
        iconSize: [300, 20],
        iconAnchor: [150, -10],
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
    // Auto-open species picker for plant elements without a species
    const cat = selected?.feature.properties?.category;
    const kind = selected?.feature.properties?.kind;
    const isPlant = cat === "element" && ["tree", "bush", "flower", "plant"].includes(kind ?? "");
    const hasSpecies = !!selected?.feature.properties?.speciesId;
    setContentSpeciesOpen(isPlant && !hasSpecies);
    if (!isPlant || hasSpecies) setSpeciesPickerSearch("");
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
        // Read the CURRENT feature from the layer — it may have been updated
        // by updateSelectedProperty / serializeLayer since the handler was
        // first attached.  Fall back to the closure-captured typedFeature
        // only if the layer somehow lost its feature reference.
        const currentFeature =
          (layer as L.Layer & { feature?: GardenFeature }).feature ?? typedFeature;
        const id = currentFeature.properties!.gardenosId;
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

        // ── Click-through for polygon containers ──
        // When clicking on a polygon container (seedbed, bed, area, etc.),
        // check if a more specific child feature (row, element) is within
        // 15px of the click point.  If found, select the child instead —
        // this makes rows inside beds clickable even when the polyline is
        // too thin to hit directly.
        const cat = currentFeature.properties?.category;
        if (POLYGON_CONTAINER_CATS.has(cat ?? "")) {
          const map = mapRef.current;
          const group = featureGroupRef.current;
          if (map && group) {
            const clickPx = map.latLngToContainerPoint(e.latlng);
            const TOLERANCE_PX = 15;
            const containerPri = CATEGORY_Z_PRIORITY[cat ?? "element"] ?? 3;
            const bestChild: { id: string; feature: GardenFeature; dist: number }[] = [];

            group.eachLayer((otherLayer) => {
              if (otherLayer === layer) return;
              const of = (otherLayer as L.Layer & { feature?: GardenFeature }).feature;
              if (!of) return;
              const oCat = of.properties?.category;
              const oPri = CATEGORY_Z_PRIORITY[oCat ?? "element"] ?? 3;
              if (oPri <= containerPri) return; // only more-specific features

              // Polylines (rows, infra lines)
              if (otherLayer instanceof L.Polyline && !(otherLayer instanceof L.Polygon)) {
                const lls = otherLayer.getLatLngs();
                const flat = (Array.isArray(lls[0]) && lls[0] instanceof L.LatLng === false)
                  ? (lls as L.LatLng[][]).flat()
                  : (lls as L.LatLng[]);
                const pts = flat.map((ll) => map.latLngToContainerPoint(ll));
                let minDist = Infinity;
                for (let i = 1; i < pts.length; i++) {
                  const d = distToSegmentPx(clickPx, pts[i - 1], pts[i]);
                  if (d < minDist) minDist = d;
                }
                if (minDist < TOLERANCE_PX) {
                  bestChild.push({ id: of.properties!.gardenosId, feature: of, dist: minDist });
                }
              }

              // Markers (elements)
              if (otherLayer instanceof L.Marker) {
                const mPx = map.latLngToContainerPoint(otherLayer.getLatLng());
                const dist = Math.sqrt((clickPx.x - mPx.x) ** 2 + (clickPx.y - mPx.y) ** 2);
                if (dist < TOLERANCE_PX) {
                  bestChild.push({ id: of.properties!.gardenosId, feature: of, dist });
                }
              }
            });

            if (bestChild.length > 0) {
              bestChild.sort((a, b) => a.dist - b.dist);
              const winner = bestChild[0];
              setMultiSelectedIds(new Set());
              setSelectedAndFocus({ gardenosId: winner.id, feature: winner.feature });
              return;
            }
          }
        }

        // Normal click: single-select, clear multi-selection
        setMultiSelectedIds(new Set());
        setSelectedAndFocus({ gardenosId: id, feature: currentFeature });
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
    const parsed = safeJsonParse<unknown>(window.localStorage.getItem(userKey(STORAGE_LAYOUT_KEY)));
    if (!isFeatureCollection(parsed)) return null;
    return parsed;
  }, []);

  const savedView = useMemo(() => {
    return safeJsonParse<{ center: [number, number]; zoom: number }>(
      window.localStorage.getItem(userKey(STORAGE_VIEW_KEY))
    );
  }, []);

  const persistAll = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    const normalized = serializeGroup(group);
    window.localStorage.setItem(userKey(STORAGE_LAYOUT_KEY), JSON.stringify(normalized));
    markDirty(STORAGE_LAYOUT_KEY);
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

      window.localStorage.setItem(userKey(STORAGE_LAYOUT_KEY), JSON.stringify(snapshot.layout));
      markDirty(STORAGE_LAYOUT_KEY);
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
    window.localStorage.setItem(userKey(STORAGE_LAYOUT_KEY), JSON.stringify(normalized));
    markDirty(STORAGE_LAYOUT_KEY);

    setLayoutForContainment(normalized);

    const prevSelected = selectedRef.current;
    if (prevSelected) {
      const found = normalized.features.find(
        (f) => f.properties?.gardenosId === prevSelected.gardenosId
      );
      setSelectedAndFocus(found ? { gardenosId: prevSelected.gardenosId, feature: found } : null);
    }
  }, [setSelectedAndFocus]);

  // ── Design Lab layout change handler (bed resize sync to map) ──
  useEffect(() => {
    designLabLayoutChangeRef.current = (updatedLayout: BedLayout) => {
      const group = featureGroupRef.current;
      if (!group) return;

      const selId = selectedRef.current?.gardenosId;
      if (!selId) return;

      // Find the Leaflet layer for this feature
      let targetLayer: L.Layer | null = null;
      group.eachLayer((layer) => {
        const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
        if (f?.properties?.gardenosId === selId) {
          targetLayer = layer;
        }
      });

      if (!targetLayer) return;
      // Check if it's a polygon-like path with setLatLngs
      const polyLayer = targetLayer as unknown as { setLatLngs?: (latlngs: L.LatLng[][]) => void };
      if (typeof polyLayer.setLatLngs !== "function") return;

      // Recompute geo coords from the new bed layout dimensions
      const M_PER_DEG_LAT = 111_320;
      const midLat = updatedLayout.centroidLat;
      const midLng = updatedLayout.centroidLng;
      const mpLng = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);

      const halfW = (updatedLayout.widthCm / 100) / 2;
      const halfL = (updatedLayout.lengthCm / 100) / 2;

      // Convert outline from bed-local cm to geo [lat, lng]
      const newLatLngs = updatedLayout.outlineCm.map((p) => {
        const mx = (p.x / 100) - halfW;
        const my = halfL - (p.y / 100); // flip Y back
        const lng = midLng + mx / mpLng;
        const lat = midLat + my / M_PER_DEG_LAT;
        return L.latLng(lat, lng);
      });

      // Update the Leaflet polygon
      polyLayer.setLatLngs([newLatLngs]);

      // Update the feature's geometry stored on the layer
      const layerFeature = (targetLayer as L.Layer & { feature?: GardenFeature }).feature;
      if (layerFeature && layerFeature.geometry.type === "Polygon") {
        layerFeature.geometry.coordinates = [
          newLatLngs.map((ll) => [ll.lng, ll.lat]),
        ];
      }

      // Persist the change
      rebuildFromGroupAndUpdateSelection();
    };
  }, [rebuildFromGroupAndUpdateSelection]);

  // ---------------------------------------------------------------------------
  // Grid overlay — shows a 1m grid across the map (always visible, togglable)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up existing
    if (gridLayerRef.current) {
      map.removeLayer(gridLayerRef.current);
      gridLayerRef.current = null;
    }
    if (!showGrid) return;

    const GridOverlay = L.GridLayer.extend({
      createTile(coords: L.Coords) {
        const tile = document.createElement("canvas");
        const tileSize = (this as unknown as L.GridLayer).getTileSize();
        tile.width = tileSize.x;
        tile.height = tileSize.y;
        const ctx = tile.getContext("2d");
        if (!ctx) return tile;

        // Compute meter-scale grid at this zoom
        const zoom = coords.z;
        // Determine grid spacing in meters based on zoom level
        let gridM = 1;
        if (zoom < 16) gridM = 10;
        else if (zoom < 18) gridM = 5;
        else if (zoom < 20) gridM = 2;
        else gridM = 1;

        const nwPoint = L.point(coords.x * tileSize.x, coords.y * tileSize.y);
        const nwLatLng = map.unproject(nwPoint, zoom);
        const sePoint = L.point((coords.x + 1) * tileSize.x, (coords.y + 1) * tileSize.y);
        const seLatLng = map.unproject(sePoint, zoom);

        const M_PER_DEG_LAT = 111_320;
        const mpLng = M_PER_DEG_LAT * Math.cos((nwLatLng.lat * Math.PI) / 180);

        // Compute first grid line positions
        const startLat = Math.floor((seLatLng.lat * M_PER_DEG_LAT) / gridM) * gridM / M_PER_DEG_LAT;
        const endLat = Math.ceil((nwLatLng.lat * M_PER_DEG_LAT) / gridM) * gridM / M_PER_DEG_LAT;
        const startLng = Math.floor((nwLatLng.lng * mpLng) / gridM) * gridM / mpLng;
        const endLng = Math.ceil((seLatLng.lng * mpLng) / gridM) * gridM / mpLng;

        ctx.strokeStyle = "rgba(120, 120, 120, 0.12)";
        ctx.lineWidth = 0.5;

        // Horizontal lines (constant latitude)
        for (let lat = startLat; lat <= endLat; lat += gridM / M_PER_DEG_LAT) {
          const pixelY = ((nwLatLng.lat - lat) / (nwLatLng.lat - seLatLng.lat)) * tileSize.y;
          ctx.beginPath();
          ctx.moveTo(0, pixelY);
          ctx.lineTo(tileSize.x, pixelY);
          ctx.stroke();
        }

        // Vertical lines (constant longitude)
        for (let lng = startLng; lng <= endLng; lng += gridM / mpLng) {
          const pixelX = ((lng - nwLatLng.lng) / (seLatLng.lng - nwLatLng.lng)) * tileSize.x;
          ctx.beginPath();
          ctx.moveTo(pixelX, 0);
          ctx.lineTo(pixelX, tileSize.y);
          ctx.stroke();
        }

        return tile;
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gridLayer = new (GridOverlay as any)({ opacity: 1, zIndex: 250 }) as L.GridLayer;
    gridLayer.addTo(map);
    gridLayerRef.current = gridLayer;

    return () => {
      if (gridLayerRef.current) {
        map.removeLayer(gridLayerRef.current);
        gridLayerRef.current = null;
      }
    };
  }, [showGrid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Sun Exposure Heatmap Overlay — shows shade/sun hours across the map
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up existing
    if (sunLayerRef.current) {
      map.removeLayer(sunLayerRef.current);
      sunLayerRef.current = null;
    }
    if (!showSunMap) return;

    // Extract shade casters from current layout
    const casters = extractShadeCasters(layoutForContainment);
    sunCastersRef.current = casters;

    // Get map center lat for solar calculations
    const mapCenter = map.getCenter();
    const mapLat = mapCenter.lat;

    const SunOverlay = L.GridLayer.extend({
      createTile(coords: L.Coords) {
        const tile = document.createElement("canvas");
        const tileSize = (this as unknown as L.GridLayer).getTileSize();
        tile.width = tileSize.x;
        tile.height = tileSize.y;
        const ctx = tile.getContext("2d");
        if (!ctx) return tile;

        const zoom = coords.z;
        // Resolution: paint cells of ~5m at high zoom, ~20m at low zoom
        let cellM = 5;
        if (zoom < 16) cellM = 20;
        else if (zoom < 18) cellM = 10;
        else if (zoom < 20) cellM = 5;
        else cellM = 2;

        const nwPoint = L.point(coords.x * tileSize.x, coords.y * tileSize.y);
        const nwLatLng = map.unproject(nwPoint, zoom);
        const sePoint = L.point((coords.x + 1) * tileSize.x, (coords.y + 1) * tileSize.y);
        const seLatLng = map.unproject(sePoint, zoom);

        const M_PER_DEG_LAT = 111_320;
        const mpLng = M_PER_DEG_LAT * Math.cos((nwLatLng.lat * Math.PI) / 180);

        const latStep = cellM / M_PER_DEG_LAT;
        const lngStep = cellM / mpLng;

        // If no casters, paint all as full-sun
        if (casters.length === 0) {
          ctx.fillStyle = sunHoursToColor(15, 0.18);
          ctx.fillRect(0, 0, tileSize.x, tileSize.y);
          return tile;
        }

        // For each cell, compute shade and paint
        for (let lat = seLatLng.lat; lat <= nwLatLng.lat; lat += latStep) {
          for (let lng = nwLatLng.lng; lng <= seLatLng.lng; lng += lngStep) {
            const shadeHours = estimateShadeAtPoint(lat, lng, casters, mapLat);
            const sunHours = Math.max(0, 15 - shadeHours);
            const color = sunHoursToColor(sunHours, 0.30);

            // Convert lat/lng to pixel coordinates within tile
            const px = ((lng - nwLatLng.lng) / (seLatLng.lng - nwLatLng.lng)) * tileSize.x;
            const py = ((nwLatLng.lat - lat) / (nwLatLng.lat - seLatLng.lat)) * tileSize.y;
            const cellW = (lngStep / (seLatLng.lng - nwLatLng.lng)) * tileSize.x;
            const cellH = (latStep / (nwLatLng.lat - seLatLng.lat)) * tileSize.y;

            ctx.fillStyle = color;
            ctx.fillRect(px, py, cellW + 1, cellH + 1);
          }
        }

        return tile;
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sunLayer = new (SunOverlay as any)({ opacity: 1, zIndex: 240 }) as L.GridLayer;
    sunLayer.addTo(map);
    sunLayerRef.current = sunLayer;

    return () => {
      if (sunLayerRef.current) {
        map.removeLayer(sunLayerRef.current);
        sunLayerRef.current = null;
      }
    };
  }, [showSunMap, plantInstancesVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Design Lab Plant Overlay — shows plant markers from Design Lab on main map
  // ---------------------------------------------------------------------------
  const renderDesignLabPlantMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing
    if (designLabMarkersRef.current) {
      map.removeLayer(designLabMarkersRef.current);
      designLabMarkersRef.current = null;
    }

    const group = featureGroupRef.current;
    if (!group) return;

    const markerGroup = L.layerGroup();

    // Iterate over all polygon features and check for bed layouts
    group.eachLayer((layer) => {
      const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
      if (!f) return;
      const cat = f.properties?.category;
      if (cat !== "seedbed" && cat !== "container" && cat !== "area") return;
      const featureId = f.properties?.gardenosId;
      if (!featureId) return;

      const bedLayout = getBedLayout(featureId);
      if (!bedLayout || bedLayout.elements.length === 0) return;

      const plantElems = bedLayout.elements.filter((e) => e.type === "plant" && e.speciesId);
      if (plantElems.length === 0) return;

      // Convert each plant position from bed-local to geo coords
      for (const el of plantElems) {
        const [lng, lat] = bedLocalToGeo(el.position, bedLayout);
        const sp = getPlantById(el.speciesId!);
        const icon = sp?.icon ?? el.icon ?? "🌱";
        const name = sp?.name ?? el.label ?? "Plante";
        const spreadCm = sp?.spreadDiameterCm ?? sp?.spacingCm ?? el.width ?? 10;
        // Scale circle radius based on spread (min 0.3m display radius)
        const radiusM = Math.max(0.3, (spreadCm / 100) / 2);

        const marker = L.circleMarker(L.latLng(lat, lng), {
          radius: 5,
          fillColor: "#2d7a3a",
          fillOpacity: 0.6,
          color: "#1a5025",
          weight: 1,
          opacity: 0.8,
        });
        marker.bindTooltip(`${icon} ${name}`, {
          permanent: false,
          direction: "top",
          offset: L.point(0, -6),
          className: "leaflet-tooltip-design-lab",
        });
        markerGroup.addLayer(marker);
      }
    });

    if (markerGroup.getLayers().length > 0) {
      markerGroup.addTo(map);
      designLabMarkersRef.current = markerGroup;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Render plant markers when Design Lab closes or on mount
  useEffect(() => {
    if (!showDesignLab) {
      // Small delay to let layout save complete
      const timer = setTimeout(renderDesignLabPlantMarkers, 300);
      return () => clearTimeout(timer);
    }
  }, [showDesignLab, renderDesignLabPlantMarkers]);

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
      const mpLat2 = M_PER_DEG_LAT;
      const mpLng2 = M_PER_DEG_LAT * Math.cos((midLat2 * Math.PI) / 180);
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
      showToast(fullMsg, "error");
      return;
    }

    // ── Safety net: verify each new row respects per-row exclusion zones ──
    const newHalfExcl = Math.max(rowSpacingCm / 100 / 2, 0.12);
    const safeRows = result.rows.filter((newRow) => {
      const newOffset = (() => {
        const midLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
        const midLng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
        const mpLat = M_PER_DEG_LAT;
        const mpLng = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
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
      showToast(`🚫 Bedet er fuldt!\n\nAlle ${result.rows.length} beregnede positioner er for tæt på eksisterende rækker.\n\nFjern eksisterende rækker først, eller udvid bedet.`, "error");
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
        addPlantInstance(makePlantInstance({
          speciesId,
          varietyId: varietyId ?? undefined,
          varietyName: varietyName || undefined,
          featureId: nextFeature.properties.gardenosId,
          count: plantsInRow,
        }));
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
    showToast(msg, result.warning ? "warning" : "success");
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
      showToast(fullMsg, "error");
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
        addPlantInstance(makePlantInstance({
          speciesId,
          varietyId: varietyId ?? undefined,
          varietyName: varietyName || undefined,
          featureId: nextFeature.properties.gardenosId,
          count: 1,
        }));
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
    showToast(msg, result.warning || result.obstacleWarnings.length > 0 ? "warning" : "success");
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
      userKey(STORAGE_VIEW_KEY),
      JSON.stringify({ center: [center.lat, center.lng] as [number, number], zoom: map.getZoom() })
    );
    markDirty(STORAGE_VIEW_KEY);
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

  /** Resolve SubGroup of the currently selected feature */
  const selectedSubGroup = useMemo<KindSubGroup>(() => {
    const k = selectedKind as string | undefined;
    if (!k) return "default";
    const def = KNOWN_KIND_DEFS.find((d) => d.kind === k);
    return (def?.subGroup ?? "default") as KindSubGroup;
  }, [selectedKind]);

  // ── Plant computed values ──
  const allPlants = useMemo(() => { void plantDataVersion; return getAllPlants(); }, [plantDataVersion]);

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
    let edibleCount = 0;
    for (const p of allPlants) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
      if (isEdiblePlant(p)) edibleCount++;
    }
    counts.edible = edibleCount;
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

  const fitGroupBounds = useCallback((groupId: string) => {
    const fgRef = featureGroupRef.current;
    if (!fgRef) return;
    const bounds = L.latLngBounds([]);
    fgRef.eachLayer((layer) => {
      const f = (layer as L.Layer & { feature?: GardenFeature }).feature;
      if (f?.properties?.groupId === groupId) {
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
  }, []);

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
    const items = allKindDefs
      .filter((d) => d.category === createPalette)
      .map((d) => ({ value: d.kind as GardenFeatureKind, label: d.label, subGroup: d.subGroup ?? "default" }));
    return items;
  }, [allKindDefs, createPalette]);

  /** SubGroups present in current palette (for optgroup rendering) */
  const createKindSubGroups = useMemo(() => {
    const groups: KindSubGroup[] = [];
    for (const opt of createKindOptions) {
      if (!groups.includes(opt.subGroup)) groups.push(opt.subGroup);
    }
    return groups;
  }, [createKindOptions]);

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
      category === "element" ? "plant"
      : category === "area" ? "zone"
      : category === "condition" ? "climate"
      : "default";
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

  /** Row length in metres (LineString only) */
  const selectedRowLengthM = useMemo(() => {
    if (!selected || selectedCategory !== "row") return 0;
    const geom = selected.feature.geometry;
    if (geom.type !== "LineString") return 0;
    const coords = geom.coordinates as [number, number][];
    let total = 0;
    for (let i = 1; i < coords.length; i++) total += haversineM(coords[i - 1], coords[i]);
    return total;
  }, [selected, selectedCategory]);

  return (
    <div id="main-content" className="grid h-[calc(100dvh)] w-full grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[1fr_auto_48px]">
      <div data-tour="toolbar" className="gardenos-toolbar col-span-1 row-start-1 flex items-center justify-between gap-1 md:gap-2 border-b border-border bg-toolbar-bg px-2 md:px-3 py-1.5 md:py-2 md:col-span-3 shadow-sm">
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
        {/* ── Brugernavn ── */}
        <div className="flex items-center text-xs text-foreground/50 truncate max-w-[100px] md:max-w-none">
          👤 {sessionData?.user?.name || sessionData?.user?.email || ""}
        </div>
        <div className="flex items-center gap-2">
          {/* ── Favorite bookmark pills (desktop only) ── */}
          <div className="hidden md:flex items-center gap-2 overflow-hidden min-w-0">
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
                  onClick={() => { setSidebarTab("view"); setViewSubTab("steder"); setSidebarPanelOpen(true); }}
                  title="Administrer steder"
                >
                  ＋
                </button>
              </div>
            ) : null}
            {bookmarks.some((b) => b.favorite) ? <div className="h-5 w-px bg-border shrink-0" /> : null}
          </div>
          {/* ── Address search (visible on ALL devices) ── */}
          <div data-tour="address-search" className="relative shrink-0">
            {showAddressSearch ? (
              <div className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 shadow-sm">
                <span className="text-xs">🔍</span>
                <input
                  type="text"
                  className="w-36 md:w-48 bg-transparent text-xs outline-none placeholder:text-foreground/40"
                  placeholder="Adresse, by, sted…"
                  value={addressQuery}
                  onChange={(e) => { setAddressQuery(e.target.value); searchAddressDebounced(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter") searchAddress(addressQuery); if (e.key === "Escape") { setShowAddressSearch(false); setAddressResults([]); setAddressQuery(""); } }}
                  autoFocus
                />
                {addressSearching && <span className="animate-spin text-[10px]">⏳</span>}
                <button type="button" className="text-foreground/40 hover:text-foreground/70 text-xs px-0.5" onClick={() => { setShowAddressSearch(false); setAddressResults([]); setAddressQuery(""); }} aria-label="Luk adressesøgning">✕</button>
              </div>
            ) : (
              <button
                type="button"
                className="rounded-md px-2 md:px-2.5 py-1.5 text-xs text-foreground/60 hover:bg-foreground/5 transition-colors flex items-center gap-1"
                onClick={() => setShowAddressSearch(true)}
                title="Søg adresse"
              >
                🔍 <span className="hidden md:inline">Søg</span>
              </button>
            )}
            {/* Autocomplete results dropdown */}
            {showAddressSearch && (addressSearching || addressResults.length > 0) ? (
              <div className="absolute top-full right-0 mt-1 w-[85vw] md:w-80 max-w-sm rounded-xl border border-border bg-white shadow-xl z-[9999] overflow-hidden">
                {addressSearching && addressResults.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs text-foreground/50">
                    <span className="animate-spin">⏳</span> Søger adresser…
                  </div>
                ) : null}
                {addressResults.map((r, i) => {
                  const parts = r.display_name.split(",");
                  const mainName = parts[0].trim();
                  const subText = parts.slice(1, 3).map(s => s.trim()).join(", ");
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30 last:border-b-0 hover:bg-accent/5 transition-colors cursor-pointer group"
                    >
                      <button
                        type="button"
                        className="flex-1 text-left min-w-0"
                        onClick={() => {
                          goToLocation(parseFloat(r.lat), parseFloat(r.lon));
                          setAddressQuery(mainName);
                        }}
                      >
                        <div className="text-xs font-medium text-foreground/80 truncate group-hover:text-accent transition-colors">📍 {mainName}</div>
                        {subText && <div className="text-[10px] text-foreground/40 truncate">{subText}</div>}
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] text-accent-dark font-semibold hover:bg-accent/20 transition-colors flex items-center gap-0.5"
                        onClick={() => {
                          const lat = parseFloat(r.lat);
                          const lon = parseFloat(r.lon);
                          goToLocation(lat, lon);
                          addBookmark(mainName, "📍", { lat, lon, zoom: 18 }, true);
                          setAddressResults([]);
                          setShowAddressSearch(false);
                          setAddressQuery("");
                        }}
                        title={`Gem "${mainName}" som favorit i top-baren`}
                      >
                        ⭐ Gem
                      </button>
                    </div>
                  );
                })}
                {addressResults.length > 0 && (
                  <div className="px-3 py-1.5 bg-foreground/[0.02] border-t border-border/30">
                    <p className="text-[9px] text-foreground/30 text-center">Klik adresse → flyt kort · ⭐ Gem → tilføj til top-bar</p>
                  </div>
                )}
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

        /* ── Hide default Leaflet zoom (we use custom toolbar) ── */
        .leaflet-control-zoom { display: none !important; }

        /* ── Map Toolbar (horizontal frosted-glass bar) ── */
        .gardenos-map-toolbar {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 1000;
          display: flex;
          flex-direction: row;
          align-items: center;
          background: rgba(255, 255, 255, 0.78);
          backdrop-filter: blur(14px) saturate(1.5);
          -webkit-backdrop-filter: blur(14px) saturate(1.5);
          border-radius: 14px;
          box-shadow: 0 2px 16px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.06);
          padding: 3px;
          gap: 0;
          pointer-events: auto;
          transition: box-shadow 0.2s ease;
        }
        .toolbar-btn {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: #374151;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .toolbar-btn:hover { background: rgba(0,0,0,0.06); }
        .toolbar-btn:active { background: rgba(0,0,0,0.10); transform: scale(0.95); }
        .toolbar-btn--active {
          background: rgba(45,122,58,0.14) !important;
          color: #2d7a3a !important;
        }
        .toolbar-btn--close { width: 28px; height: 28px; color: #9ca3af; }
        .toolbar-btn--close:hover { color: #ef4444; background: rgba(239,68,68,0.08); }
        .toolbar-sep {
          width: 1px;
          height: 20px;
          background: rgba(0,0,0,0.08);
          margin: 0 3px;
          flex-shrink: 0;
        }

        /* Scale ruler with end-ticks */
        .toolbar-scale {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2px 6px;
          gap: 2px;
        }
        .scale-ruler {
          display: flex;
          align-items: center;
          height: 10px;
          transition: width 0.25s ease;
        }
        .scale-tick {
          width: 1.5px;
          height: 10px;
          background: #6b7280;
          border-radius: 1px;
          flex-shrink: 0;
        }
        .scale-line {
          flex: 1;
          height: 1.5px;
          background: #6b7280;
        }
        .scale-label {
          font-size: 9px;
          font-weight: 600;
          color: #6b7280;
          line-height: 1;
          white-space: nowrap;
          letter-spacing: 0.01em;
        }

        /* Inline measurement result */
        .toolbar-result {
          display: flex;
          align-items: baseline;
          gap: 6px;
          padding: 0 6px;
          white-space: nowrap;
        }
        .result-value {
          font-size: 15px;
          font-weight: 800;
          color: #2d7a3a;
          letter-spacing: -0.02em;
        }
        .result-value--area { color: #1d6fa5; }
        .result-detail {
          font-size: 10px;
          color: #9ca3af;
          font-weight: 500;
        }
        .result-hint {
          font-size: 11px;
          color: #9ca3af;
          font-weight: 500;
        }

        /* Keyboard-hint bar below toolbar */
        .gardenos-measure-hint-bar {
          position: absolute;
          top: 52px;
          left: 12px;
          z-index: 1000;
          font-size: 9.5px;
          color: rgba(107,114,128,0.8);
          background: rgba(255,255,255,0.55);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 3px 10px;
          border-radius: 8px;
          pointer-events: none;
          white-space: nowrap;
        }

        /* ── Measure labels on map ── */
        .gardenos-measure-label {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .gardenos-measure-label span {
          display: inline-block;
          background: rgba(255,255,255,0.88);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          color: #2d7a3a;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 6px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.10);
          white-space: nowrap;
        }
        .gardenos-measure-ghost-label {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .gardenos-measure-ghost-label span {
          display: inline-block;
          background: rgba(255,255,255,0.55);
          color: #6b7280;
          font-size: 10px;
          font-weight: 600;
          padding: 1px 5px;
          border-radius: 5px;
          white-space: nowrap;
        }
        .gardenos-measure-area-label {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }
        .gardenos-measure-area-label span {
          display: inline-block;
          background: rgba(29,111,165,0.12);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          color: #1d6fa5;
          font-size: 13px;
          font-weight: 800;
          padding: 4px 10px;
          border-radius: 8px;
          box-shadow: 0 1px 6px rgba(0,0,0,0.10);
          white-space: nowrap;
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

      <div data-tour="map-area" className="gardenos-map-area relative row-start-2">
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          maxZoom={22}
          zoomSnap={0.25}
          zoomDelta={0.25}
          zoomControl={false}
          className="absolute inset-0"
          renderer={L.svg({ tolerance: 12 })}
        >
          <MapToolbar />
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

        {/* ── Floating Rådgiver Button (top-center on map) ── */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000]">
          <button
            type="button"
            data-tour="tab-chat"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all shadow-md border text-[12px] font-semibold ${
              sidebarTab === "chat" && sidebarPanelOpen
                ? "bg-accent text-white border-accent shadow-accent/20"
                : "bg-white/90 text-foreground/60 border-border/50 hover:bg-white hover:text-foreground/80 hover:shadow-lg backdrop-blur-sm"
            }`}
            onClick={() => {
              toggleSidebarPanel("chat");
            }}
            title="Rådgiver — AI-haverådgiver"
          >
            <span className="text-sm">💬</span>
            <span>Rådgiver</span>
          </button>
        </div>

        {/* ── Floating Guide Button (bottom-center on map) ── */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2">
          {/* Popover menu */}
          {guidePopoverOpen && !guideAiOpen && (
            <div className="mb-1 rounded-xl border border-border bg-white shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200" style={{ width: 220 }}>
              <div className="px-3 pt-3 pb-1.5">
                <h3 className="text-[11px] font-bold text-foreground/80 uppercase tracking-wide">❓ Guide til App</h3>
              </div>
              <div className="px-1.5 pb-2 space-y-0.5">
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground/70 hover:bg-accent/10 hover:text-accent transition-colors"
                  onClick={() => { setGuidePopoverOpen(false); setForceStartTour(true); }}
                >
                  <span className="text-base">🎓</span>
                  <div>
                    <div className="font-semibold text-foreground/80">Guidet rundvisning</div>
                    <div className="text-[10px] text-foreground/40 mt-0.5">25 trin — lær alle funktioner</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground/70 hover:bg-accent/10 hover:text-accent transition-colors"
                  onClick={() => { setGuidePopoverOpen(false); setGuideAiOpen(true); setTimeout(() => guideAiInputRef.current?.focus(), 150); }}
                >
                  <span className="text-base">💡</span>
                  <div>
                    <div className="font-semibold text-foreground/80">Spørg om appen</div>
                    <div className="text-[10px] text-foreground/40 mt-0.5">AI-assistent der kender GardenOS</div>
                  </div>
                </button>
                <div className="w-full h-px bg-border/50 my-0.5" />
                <div onClick={() => setGuidePopoverOpen(false)}>
                  <span data-tour="feedback-btn">
                    <FeedbackPanel
                      triggerClassName="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground/70 hover:bg-accent/10 hover:text-accent transition-colors"
                      triggerContent={<>
                        <span className="text-base">📣</span>
                        <div>
                          <div className="font-semibold text-foreground/80">Giv feedback</div>
                          <div className="text-[10px] text-foreground/40 mt-0.5">Fejl, idéer, spørgsmål</div>
                        </div>
                      </>}
                    />
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* AI Guide Chat Bubble */}
          {guideAiOpen && (
            <div className="mb-1 rounded-2xl border border-border bg-white shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200" style={{ width: 320, height: 420 }}>
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 bg-gradient-to-r from-accent/5 to-transparent">
                <div className="flex items-center gap-2">
                  <span className="text-sm">💡</span>
                  <span className="text-xs font-bold text-foreground/80">Spørg om appen</span>
                </div>
                <button
                  type="button"
                  className="rounded-md p-1 text-foreground/40 hover:bg-foreground/5 hover:text-foreground/70 transition-colors"
                  onClick={() => setGuideAiOpen(false)}
                  aria-label="Luk app-guide"
                >✕</button>
              </div>
              {/* Messages */}
              <div ref={guideAiScrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {guideAiMessages.length === 0 && (
                  <div className="text-center py-6">
                    <div className="text-2xl mb-2">💡</div>
                    <p className="text-[11px] text-foreground/50 leading-relaxed">Spørg mig om hvad som helst i GardenOS!<br/>F.eks. &quot;Hvordan tegner jeg et bed?&quot;</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-1">
                      {["Hvordan opretter jeg et bed?", "Hvad gør Scan?", "Hvordan bruger jeg Årshjulet?"].map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="rounded-full border border-border px-2.5 py-1 text-[10px] text-foreground/50 hover:bg-accent/10 hover:text-accent hover:border-accent/30 transition-colors"
                          onClick={() => { setGuideAiInput(q); setTimeout(() => guideAiInputRef.current?.focus(), 50); }}
                        >{q}</button>
                      ))}
                    </div>
                  </div>
                )}
                {guideAiMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[85%] whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-accent text-white rounded-br-sm"
                        : "bg-foreground/[0.04] text-foreground/80 border border-border/40 rounded-bl-sm"
                    }`}>
                      {msg.content || (guideAiLoading ? <span className="inline-flex gap-1 text-foreground/30"><span className="animate-bounce" style={{animationDelay:"0ms"}}>·</span><span className="animate-bounce" style={{animationDelay:"150ms"}}>·</span><span className="animate-bounce" style={{animationDelay:"300ms"}}>·</span></span> : null)}
                    </div>
                  </div>
                ))}
              </div>
              {/* Input */}
              <div className="border-t border-border/50 p-2">
                <form onSubmit={(e) => { e.preventDefault(); sendGuideAiMessage(); }} className="flex gap-1.5">
                  <input
                    ref={guideAiInputRef}
                    type="text"
                    value={guideAiInput}
                    onChange={(e) => setGuideAiInput(e.target.value)}
                    placeholder="Stil et spørgsmål om appen…"
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20"
                    disabled={guideAiLoading}
                  />
                  <button
                    type="submit"
                    disabled={guideAiLoading || !guideAiInput.trim()}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-accent/90 transition-colors"
                    aria-label="Send besked"
                  >→</button>
                </form>
              </div>
            </div>
          )}

          {/* The floating ❓ button */}
          <button
            type="button"
            data-tour="guide-btn"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-md border ${
              guidePopoverOpen || guideAiOpen
                ? "bg-accent text-white border-accent shadow-accent/20"
                : "bg-white/80 text-foreground/35 border-border/50 hover:bg-white hover:text-foreground/60 hover:shadow-lg backdrop-blur-sm"
            }`}
            onClick={() => {
              if (guideAiOpen) { setGuideAiOpen(false); return; }
              setGuidePopoverOpen((v) => !v);
            }}
            title="Guide til App"
          >
            <span className="text-sm font-bold leading-none">?</span>
          </button>
        </div>

        {/* Click-away for guide popover */}
        {guidePopoverOpen && (
          <div className="absolute inset-0 z-[999]" onClick={() => setGuidePopoverOpen(false)} />
        )}
      </div>

      {/* ── Mobile Bottom Navigation (customisable) ── */}
      <div data-tour="mobile-nav" className="mobile-bottom-nav hidden max-md:flex">
        {pinnedMobileTabs.map((tabId) => {
          const def = ALL_SIDEBAR_TABS.find((t) => t.id === tabId);
          if (!def) return null;
          const isActive = sidebarTab === tabId && mobileSidebarOpen;
          const isContent = tabId === "content";
          const isDisabled = isContent && !selected;
          return (
            <button
              key={tabId}
              type="button"
              className={isActive ? "active" : ""}
              style={isDisabled ? { opacity: 0.3 } : undefined}
              onClick={() => {
                if (isDisabled) return;
                if (isActive) { closeMobileSidebar(); } else { openMobileSidebar(tabId); }
              }}
            >
              <span className="nav-icon">{def.icon}</span>
              <span className="nav-label">{def.label}</span>
            </button>
          );
        })}
        {/* ☰ Menu: åbner genvejs-vælger */}
        <button type="button" className={mobileNavMenuOpen ? "active" : ""} onClick={() => setMobileNavMenuOpen((v) => !v)}>
          <span className="nav-icon">{mobileNavMenuOpen ? "✕" : "☰"}</span>
          <span className="nav-label">{mobileNavMenuOpen ? "Luk" : "Menu"}</span>
        </button>
      </div>

      {/* ── Mobile nav tab picker (popup above bottom bar) ── */}
      {mobileNavMenuOpen && (
        <>
          <div className="fixed inset-0 z-[9997] md:hidden" onClick={() => setMobileNavMenuOpen(false)} />
          <div className="mobile-nav-picker md:hidden">
            <div className="text-[11px] font-bold uppercase tracking-wide text-foreground/50 px-3 pt-3 pb-1">Vælg genveje til bundlinjen</div>
            <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
              {ALL_SIDEBAR_TABS.map((tab) => {
                const isPinned = pinnedMobileTabs.includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-all ${
                      isPinned
                        ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                        : "bg-foreground/[0.04] text-foreground/60 hover:bg-foreground/[0.08]"
                    }`}
                    onClick={() => togglePinnedTab(tab.id)}
                  >
                    <span className="text-base leading-none">{tab.icon}</span>
                    <span className="text-[12px] font-semibold">{tab.label}</span>
                    {isPinned && <span className="ml-auto text-accent text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
            <div className="px-3 pb-3">
              <button
                type="button"
                className="w-full text-center text-[11px] text-foreground/40 hover:text-foreground/60 py-1"
                onClick={() => { savePinnedTabs(DEFAULT_PINNED); }}
              >
                Nulstil til standard
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Mobile Bottom Sheet Backdrop ── */}
      {mobileSidebarOpen ? (
        <div
          className="fixed inset-0 z-[9997] bg-black/30 backdrop-blur-[2px] md:hidden"
          onClick={closeMobileSidebar}
        />
      ) : null}

      {/* ══════════════════════════════════════════════════════════════
           Vertical Icon Bar (desktop, 48px grid column)
         ══════════════════════════════════════════════════════════════ */}
      <nav className="row-start-2 col-start-3 hidden md:flex flex-col w-12 border-l border-border bg-sidebar-bg items-center py-2 gap-0.5 overflow-y-auto scrollbar-hide z-[50]" role="tablist" aria-label="Sidebar navigation" aria-orientation="vertical">
        {(() => {
          const renderTab = (tab: (typeof ALL_SIDEBAR_TABS)[number]) => {
            const isActive = sidebarTab === tab.id && sidebarPanelOpen;
            const isDisabled = tab.id === "content" && !selected;
            const badge = tab.id === "conflicts" && allConflicts.length > 0
              ? allConflicts.length
              : tab.id === "groups" && allGroups.length > 0
              ? allGroups.length
              : null;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                data-tour={`tab-${tab.id}`}
                disabled={!!isDisabled}
                className={`relative flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-all group ${
                  isActive
                    ? "bg-accent text-white shadow-md"
                    : isDisabled
                    ? "text-foreground/20 cursor-not-allowed"
                    : "text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground/70"
                }`}
                onClick={() => {
                  if (isDisabled) return;
                  toggleSidebarPanel(tab.id);
                  if (tab.id !== "groups") setHighlightedGroupId(null);
                }}
                title={isDisabled ? "Vælg noget på kortet først" : tab.label}
                aria-label={tab.label}
              >
                <span className="text-[17px] leading-none">{tab.icon}</span>
                <span className={`text-[7px] font-semibold leading-tight tracking-tight whitespace-nowrap mt-0.5 ${
                  isActive ? "text-white/90" : "text-foreground/35"
                }`}>{tab.label}</span>
                {badge ? (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5 leading-none">
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          };
          const grp = (ids: string[]) =>
            ids.map(id => ALL_SIDEBAR_TABS.find(t => t.id === id)!).filter(Boolean).map(renderTab);
          return (
            <>
              {/* Gruppe 1 — Opret */}
              <span className="text-[6px] font-bold text-foreground/25 uppercase tracking-widest mt-1 mb-0.5">Opret</span>
              {grp(["create", "content", "groups"])}
              {/* Spacer between groups */}
              <div className="w-8 my-2 flex flex-col items-center gap-[3px]"><div className="w-1 h-1 rounded-full bg-border" /><div className="w-1 h-1 rounded-full bg-border" /><div className="w-1 h-1 rounded-full bg-border" /></div>
              {/* Gruppe 2 — Analyse */}
              <span className="text-[6px] font-bold text-foreground/25 uppercase tracking-widest mb-0.5">Analyse</span>
              {grp(["conflicts", "scan", "view", "tasks", "plants", "climate"])}
            </>
          );
        })()}
        {/* ── Spacer — pushes System group to bottom ── */}
        <div className="flex-1" />
        {/* ── Gruppe 3 — System (bottom-anchored) ── */}
        <div className="w-6 h-px bg-border mb-1.5" />
        <span className="text-[6px] font-bold text-foreground/25 uppercase tracking-widest mb-0.5">System</span>
        {(() => {
          const tab = ALL_SIDEBAR_TABS.find(t => t.id === "designs")!;
          const isActive = sidebarTab === "designs" && sidebarPanelOpen;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="tabpanel-designs"
              data-tour="tab-designs"
              className={`relative flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-all group ${
                isActive
                  ? "bg-accent text-white shadow-md"
                  : "text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground/70"
              }`}
              onClick={() => toggleSidebarPanel("designs")}
              title={tab.label}
            >
              <span className="text-[17px] leading-none">{tab.icon}</span>
              <span className={`text-[7px] font-semibold leading-tight tracking-tight whitespace-nowrap mt-0.5 ${
                isActive ? "text-white/90" : "text-foreground/35"
              }`}>{tab.label}</span>
            </button>
          );
        })()}
        {isAdmin && (
          <a
            href="/admin"
            className="flex flex-col items-center justify-center w-10 h-10 rounded-xl text-foreground/35 hover:bg-amber-500/10 hover:text-amber-600 transition-all"
            title="Admin panel"
          >
            <span className="text-[17px] leading-none">🛡️</span>
            <span className="text-[7px] font-semibold mt-0.5 text-amber-600/60">Admin</span>
          </a>
        )}
        {sessionData?.user && (
          <button
            type="button"
            className="flex flex-col items-center justify-center w-10 h-10 rounded-xl text-foreground/30 hover:bg-foreground/5 hover:text-foreground/50 transition-all"
            title="Indstillinger"
            onClick={() => setSettingsOpen(true)}
            aria-label="Brugerindstillinger"
          >
            <span className="text-[15px] leading-none">👤</span>
            <span className="text-[6px] font-medium mt-0.5 truncate max-w-[40px] text-center">
              {(sessionData.user.name || sessionData.user.email || "").split(/[\s@]/)[0]}
            </span>
          </button>
        )}
        {/* Sync status indicator */}
        <div
          role="status"
          aria-live="polite"
          className={`flex flex-col items-center justify-center w-10 h-6 transition-all ${
            syncStatus === "idle" ? "text-green-500/50" :
            syncStatus === "syncing" ? "text-blue-500" :
            syncStatus === "dirty" ? "text-amber-500" :
            syncStatus === "offline" ? "text-orange-500" :
            "text-red-500"
          }`}
          title={
            syncStatus === "idle" ? "Synkroniseret ✓" :
            syncStatus === "syncing" ? "Synkroniserer…" :
            syncStatus === "dirty" ? "Ændringer venter…" :
            syncStatus === "offline" ? "Offline — prøver igen" :
            "Synkfejl"
          }
          aria-label={`Synkstatus: ${syncStatus}`}
        >
          <span className={`text-[13px] leading-none ${syncStatus === "syncing" ? "animate-spin" : ""}`}>
            {syncStatus === "idle" ? "☁️" :
             syncStatus === "syncing" ? "🔄" :
             syncStatus === "dirty" ? "💾" :
             syncStatus === "offline" ? "📡" :
             "⚠️"}
          </span>
          <span className="text-[6px] font-medium mt-0.5">
            {syncStatus === "idle" ? "Synk ✓" :
             syncStatus === "syncing" ? "Synk…" :
             syncStatus === "dirty" ? "Gemmer…" :
             syncStatus === "offline" ? "Offline" :
             "Fejl"}
          </span>
        </div>
        <button
          type="button"
          className="flex flex-col items-center justify-center w-10 h-10 rounded-xl text-foreground/35 hover:bg-red-50 hover:text-red-500 transition-all mb-1"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="Log ud"
          aria-label="Log ud"
        >
          <span className="text-[17px] leading-none">🚪</span>
          <span className="text-[7px] font-semibold mt-0.5 text-foreground/30">Log ud</span>
        </button>
      </nav>

      {/* ══════════════════════════════════════════════════════════════
           Sidebar Panel — Desktop: grid col 2; Mobile: bottom sheet
         ══════════════════════════════════════════════════════════════ */}
      <aside className={`
        flex flex-col border-border bg-sidebar-bg
        md:row-start-2 md:col-start-2 md:h-full md:border-l md:shadow-xl md:min-h-0
        md:transition-[width] md:duration-300 md:ease-in-out md:overflow-hidden
        ${sidebarPanelOpen ? "md:w-[340px]" : "md:w-0 md:border-l-0"}
        max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-[9998]
        max-md:max-h-[75dvh] max-md:rounded-t-2xl max-md:shadow-[0_-4px_20px_rgba(0,0,0,0.15)]
        max-md:transition-transform max-md:duration-300 max-md:ease-out
        max-md:border-t max-md:overflow-hidden
        ${mobileSidebarOpen ? "max-md:translate-y-0" : "max-md:translate-y-full"}
        max-md:pb-[calc(60px+env(safe-area-inset-bottom,0px))]
      `} role="tabpanel" id={`tabpanel-${sidebarTab}`} aria-label={`${ALL_SIDEBAR_TABS.find(t => t.id === sidebarTab)?.label ?? sidebarTab} panel`}>
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        {/* Inner wrapper – keeps content at 340px even while aside width transitions */}
        <div className="md:w-[340px] md:min-w-[340px] flex flex-col h-full min-h-0">

        {/* Panel header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/50 shrink-0">
          <h2 className="text-sm font-bold text-foreground/80 flex items-center gap-1.5">
            <span className="text-base">{sidebarTab === "chat" ? "💬" : ALL_SIDEBAR_TABS.find(t => t.id === sidebarTab)?.icon}</span>
            {sidebarTab === "chat" ? "Rådgiver" : ALL_SIDEBAR_TABS.find(t => t.id === sidebarTab)?.label}
          </h2>
          <button
            type="button"
            className="rounded-md p-1 text-foreground/40 hover:bg-foreground/5 hover:text-foreground/70 transition-colors"
            onClick={() => { setSidebarPanelOpen(false); closeMobileSidebar(); }}
            title="Luk panel"
            aria-label="Luk sidepanel"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto sidebar-scroll px-4 pb-4">

        {sidebarTab === "create" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Kategori</label>
              <div className="mt-1.5 grid grid-cols-3 gap-1" data-tour="create-categories">
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
                      setCreateSubGroupFilter(null);
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
                        data-tour={opt.mode === "planter" ? "create-element-plants" : opt.mode === "el" ? "create-element-infra" : undefined}
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
                 NON-ELEMENT categories: type picker
                 Area & Condition → SubGroup tabs + scrollable type list
                 Other → simple <select> dropdown
                 ════════════════════════════════════════════════════════════════ */
              <>
                {/* ── All non-element categories: SubGroup tabs (when 2+) + scrollable type list ── */}
                <div className="col-span-2 space-y-2">
                    <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Type</label>

                    {/* SubGroup tab buttons — only when 2+ SubGroups */}
                    {createKindSubGroups.length > 1 ? (
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${createKindSubGroups.length}, 1fr)` }}>
                      {createKindSubGroups.map((sg) => {
                        const active = (createSubGroupFilter ?? createKindSubGroups[0]) === sg;
                        const count = createKindOptions.filter((o) => o.subGroup === sg).length;
                        return (
                          <button
                            key={sg}
                            type="button"
                            className={`rounded-lg border px-2 py-2 text-[11px] text-center leading-tight transition-all ${
                              active
                                ? "border-accent/40 bg-accent-light text-accent-dark font-semibold shadow-sm"
                                : "border-border bg-background hover:bg-foreground/5 text-foreground/60"
                            }`}
                            onClick={() => {
                              setCreateSubGroupFilter(sg);
                              const first = createKindOptions.find((o) => o.subGroup === sg);
                              if (first) {
                                setCreateKind(first.value);
                                createKindRef.current = first.value;
                              }
                            }}
                          >
                            <span className="block">{SUB_GROUP_LABELS[sg] ?? sg}</span>
                            <span className="block text-[9px] font-normal opacity-60 mt-0.5">{count} typer</span>
                          </button>
                        );
                      })}
                    </div>
                    ) : null}

                    {/* Scrollable type list */}
                    {(() => {
                      const activeSg = createKindSubGroups.length > 1
                        ? (createSubGroupFilter ?? createKindSubGroups[0])
                        : createKindSubGroups[0];
                      const items = activeSg
                        ? createKindOptions.filter((o) => o.subGroup === activeSg)
                        : createKindOptions;
                      return items.length > 0 ? (
                        <div className="max-h-52 space-y-0.5 overflow-y-auto">
                          {items.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-all ${
                                createKind === opt.value
                                  ? "border-accent/30 bg-accent-light/50 text-accent-dark font-semibold"
                                  : "border-transparent hover:border-foreground/15 hover:bg-foreground/5 text-foreground/70"
                              }`}
                              onClick={() => {
                                setCreateKind(opt.value);
                                createKindRef.current = opt.value;
                                setNewKindError(null);
                              }}
                            >
                              <span className="flex-1 truncate">{opt.label}</span>
                              {createKind === opt.value ? <span className="text-accent text-[10px]">✓</span> : null}
                              {canRemoveCreateKind && createKind === opt.value ? (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="shrink-0 rounded px-1 text-foreground/30 hover:text-red-500 hover:bg-red-50"
                                  onClick={(e) => { e.stopPropagation(); removeKind(opt.value); }}
                                  title="Fjern denne type"
                                >
                                  ✕
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      ) : null;
                    })()}

                    {hiddenInCurrentPalette.length > 0 ? (
                      <button
                        type="button"
                        className="text-[10px] text-foreground/40 hover:text-foreground/70 hover:underline"
                        onClick={() => restoreHiddenKinds(createPalette)}
                      >
                        Gendan {hiddenInCurrentPalette.length} skjulte standardtype{hiddenInCurrentPalette.length > 1 ? "r" : ""}
                      </button>
                    ) : null}

                    {/* Ny type */}
                    <div>
                      <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Ny type</label>
                      <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                        <input
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                          value={newKindText}
                          onChange={(e) => setNewKindText(e.target.value)}
                          placeholder={
                            createPalette === "area" ? "Fx Orangeri, Hegn"
                            : createPalette === "condition" ? "Fx Læside, Muldrig jord"
                            : createPalette === "container" ? "Fx Pottebænk"
                            : createPalette === "row" ? "Fx Dobbeltrække"
                            : "Fx Spirebakke"
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
                </div>
              </>
            )}

            <button
              type="button"
              className="col-span-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-dark transition-colors"
              onClick={beginDrawSelectedType}
              data-tour="create-draw-btn"
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

            {/* ── Parent back-navigation ── */}
            {selectedParentFeature ? (
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded-md border border-foreground/10 bg-foreground/[0.02] px-2.5 py-1.5 text-left text-xs text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-colors"
                onClick={() => selectFeatureById(selectedParentFeature.id)}
              >
                <span>←</span>
                <span className="truncate">Tilbage til {selectedParentFeature.name}</span>
              </button>
            ) : null}

            <div>
              {/* Compact type chip — click to expand and change */}
              {selectedCategory === "element" ? (() => {
                const typeOpts = [
                  { mode: "planter" as const, label: "Planter", icon: "🌱", kinds: ["tree", "bush", "flower", "plant"] },
                  { mode: "el" as const, label: "El / Ledning", icon: "⚡", kinds: ["electric", "electric-cable", "electric-lv", "electric-outlet", "electric-junction", "electric-panel", "electric-solar"] },
                  { mode: "vand" as const, label: "Vand / Rør", icon: "💧", kinds: ["water", "water-pipe", "water-hose", "water-drip", "water-tap", "water-sprinkler", "water-timer", "water-barrel"] },
                  { mode: "lampe" as const, label: "Lampe", icon: "💡", kinds: ["lamp", "lamp-garden", "lamp-spot", "lamp-led-string", "lamp-wall", "lamp-solar", "lamp-path", "lamp-battery", "lamp-flood"] },
                ];
                const currentKind = String(selectedKind ?? "plant").toLowerCase();
                const activeOpt = typeOpts.find((o) => o.kinds.includes(currentKind)) ?? typeOpts[0];
                return (
                  <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                      onClick={() => setContentTypeOpen(!contentTypeOpen)}
                    >
                      <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">{activeOpt.icon} {activeOpt.label}</span>
                      <span className="text-[9px] text-foreground/30">·</span>
                      <span className="text-[10px] text-foreground/40">{CATEGORY_LABELS[selectedCategory as GardenFeatureCategory] ?? "—"}</span>
                      <span className="flex-1" />
                      <span className="text-[9px] text-foreground/30">{contentTypeOpen ? "▲" : "▼"}</span>
                    </button>
                    {contentTypeOpen ? (
                      <div className="px-2.5 pb-2 pt-1 grid grid-cols-2 gap-1.5">
                        {typeOpts.map((opt) => {
                          const isActive = opt.kinds.includes(currentKind);
                          return (
                            <button
                              key={opt.mode}
                              type="button"
                              className={`rounded-md border px-2.5 py-1.5 text-[11px] text-left transition-all ${
                                isActive
                                  ? "border-accent/40 bg-accent-light text-accent-dark font-semibold"
                                  : "border-border bg-background hover:bg-foreground/5 text-foreground/70"
                              }`}
                              onClick={() => {
                                const defaultKind = kindForElementMode(opt.mode);
                                updateSelectedProperty({
                                  kind: defaultKind,
                                  category: "element",
                                  ...(opt.mode === "planter"
                                    ? { elementTypeId: "" }
                                    : { speciesId: "", varietyId: "", varietyName: "" }),
                                });
                                setContentTypeOpen(false);
                              }}
                            >
                              {opt.icon} {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })() : (
                <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                    onClick={() => setContentTypeOpen(!contentTypeOpen)}
                  >
                    <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">{CATEGORY_LABELS[selectedCategory as GardenFeatureCategory] ?? "Type"}</span>
                    <span className="text-[9px] text-foreground/30">·</span>
                    <span className="text-[11px] text-foreground/70 truncate flex-1">{selectedKindDef?.label ?? "(vælg type)"}</span>
                    <span className="text-[9px] text-foreground/30 shrink-0">{contentTypeOpen ? "▲" : "▼"}</span>
                  </button>
                  {contentTypeOpen ? (
                    <div className="px-2.5 pb-2 pt-1">
                      <select
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
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
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* ── Navn (collapsible box) ── */}
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                onClick={() => setContentNameOpen(!contentNameOpen)}
              >
                <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">✏️ Navn</span>
                <span className="text-[9px] text-foreground/30">·</span>
                <span className="text-[11px] text-foreground/70 truncate flex-1">{draftName || "(intet navn)"}{selectedContainerAreaText ? ` · ${selectedContainerAreaText}` : ""}</span>
                {draftNameDirty ? <span className="text-[8px] text-amber-500 font-bold">●</span> : null}
                <span className="text-[9px] text-foreground/30 shrink-0">{contentNameOpen ? "▲" : "▼"}</span>
              </button>
              {contentNameOpen ? (
                <div className="px-2.5 pb-2 pt-1">
                  <div className="flex gap-1.5 items-center">
                    <input
                      className={`flex-1 min-w-0 rounded-md border px-2.5 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50 bg-background ${draftNameDirty ? "border-amber-400" : "border-foreground/15"}`}
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitDraftName()}
                      onKeyDown={(e) => { if (e.key === "Enter") { commitDraftName(); (e.target as HTMLInputElement).blur(); } }}
                      placeholder="Fx Køkkenbed 1 / Æbletræ"
                      autoFocus
                    />
                    {draftNameDirty ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-md bg-accent px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-accent/80 transition-colors"
                        onClick={() => commitDraftName()}
                      >
                        Gem
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* ── AFGRØDE ── specialised single-crop row section       ── */}
            {/* ══════════════════════════════════════════════════════════ */}
            {selectedCategory === "row" ? (() => {
              const rowCrop = selectedFeatureInstances[0] ?? null;
              const rowLengthCm = selectedRowLengthM * 100;
              const spacing = rowCrop?.species?.spacingCm ?? 0;
              const capacity = spacing > 0 ? Math.floor(rowLengthCm / spacing) : 0;
              const parentSoilId = (() => {
                if (!selectedParentFeature) return undefined;
                const pf = layoutForContainment.features.find((f) => (f as GardenFeature).properties?.gardenosId === selectedParentFeature.id) as GardenFeature | undefined;
                return pf?.properties?.soilProfileId;
              })();
              const parentSoil = parentSoilId ? getSoilProfileById(parentSoilId) : undefined;
              return (
              <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                  onClick={() => setContentContainsOpen(!contentContainsOpen)}
                >
                  <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">🌱 Afgrøde</span>
                  <span className="text-[9px] text-foreground/30">·</span>
                  <span className="text-[11px] text-foreground/70 truncate flex-1">
                    {rowCrop ? `${rowCrop.species?.icon ?? "🌱"} ${rowCrop.species?.name ?? rowCrop.speciesId}` : "(ingen afgrøde)"}
                  </span>
                  <span className="text-[9px] text-foreground/30 shrink-0">{contentContainsOpen ? "▲" : "▼"}</span>
                </button>

                {contentContainsOpen ? (
                  <div className="px-2.5 pb-2.5 pt-1 space-y-2">

                    {/* ── Row info block ── */}
                    <div className="rounded border border-foreground/10 bg-foreground/[0.02] px-2 py-1.5 space-y-1">
                      <p className="text-[10px] text-foreground/50">
                        📏 Længde: <span className="font-medium text-foreground/70">{selectedRowLengthM >= 1 ? `${selectedRowLengthM.toFixed(1)} m` : `${Math.round(rowLengthCm)} cm`}</span>
                        {rowCrop && spacing > 0 ? (
                          <span> · 📐 Afstand: <span className="font-medium text-foreground/70">{spacing} cm</span> · Kapacitet: <span className="font-medium text-foreground/70">{capacity} stk</span></span>
                        ) : null}
                      </p>
                      {selectedParentFeature ? (
                        <p className="text-[10px] text-foreground/50">
                          📍 I: <button type="button" className="text-accent hover:underline" onClick={() => selectFeatureById(selectedParentFeature.id)}>{selectedParentFeature.name}</button>
                          {parentSoil ? <span> · 🪴 Jord: {parentSoil.baseType ?? "ukendt"}</span> : null}
                        </p>
                      ) : null}
                    </div>

                    {/* ── Current crop display ── */}
                    {rowCrop ? (
                      <div className="rounded border border-foreground/10 bg-foreground/[0.02] px-2 py-1.5 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm leading-none">{rowCrop.species?.icon ?? "🌱"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">
                              {rowCrop.species?.name ?? rowCrop.speciesId}
                              {rowCrop.varietyName ? <span className="text-foreground/50 font-normal"> ({rowCrop.varietyName})</span> : <span className="text-foreground/30 font-normal italic"> (uspecificeret)</span>}
                            </p>
                            <p className="text-[10px] text-foreground/50">
                              {capacity > 0 ? `${capacity} stk på rækken` : ""}
                              {rowCrop.plantedAt ? ` · plantet ${rowCrop.plantedAt}` : ""}
                              {rowCrop.season ? ` · sæson ${rowCrop.season}` : ""}
                            </p>
                          </div>
                          {(() => {
                            const instVarieties = getVarietiesForSpecies(rowCrop.speciesId);
                            return instVarieties.length > 0 ? (
                              <button
                                type="button"
                                className="shrink-0 rounded px-1 py-0.5 text-[10px] text-accent hover:bg-accent/10"
                                onClick={() => setEditingInstanceId(editingInstanceId === rowCrop.id ? null : rowCrop.id)}
                                title="Vælg/skift sort"
                              >
                                🏷️
                              </button>
                            ) : null;
                          })()}
                          <button
                            type="button"
                            className="shrink-0 rounded px-1 text-xs text-foreground/40 hover:bg-red-50 hover:text-red-500"
                            onClick={() => {
                              removePlantInstance(rowCrop.id);
                              setPlantInstancesVersion((v) => v + 1);
                              setEditingInstanceId(null);
                            }}
                            title="Fjern afgrøde"
                          >
                            ✕
                          </button>
                        </div>
                        {/* Inline variety selector */}
                        {editingInstanceId === rowCrop.id ? (() => {
                          const instVarieties = getVarietiesForSpecies(rowCrop.speciesId);
                          return (
                            <div className="ml-5 space-y-0.5 border-l-2 border-accent/30 pl-2">
                              <p className="text-[10px] font-medium text-foreground/50 uppercase tracking-wide">Vælg sort:</p>
                              <button
                                type="button"
                                className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-foreground/5 ${
                                  !rowCrop.varietyId ? "bg-accent/10 font-medium text-accent" : "text-foreground/70"
                                }`}
                                onClick={() => {
                                  updatePlantInstance(rowCrop.id, { varietyId: undefined, varietyName: undefined });
                                  setPlantInstancesVersion((v) => v + 1);
                                  setEditingInstanceId(null);
                                }}
                              >
                                <span className="text-sm leading-none">🌱</span>
                                <span className="truncate">Uspecificeret sort</span>
                                {!rowCrop.varietyId ? <span className="ml-auto text-[9px]">✓</span> : null}
                              </button>
                              {instVarieties.map((v) => (
                                <button
                                  key={v.id}
                                  type="button"
                                  className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-foreground/5 ${
                                    rowCrop.varietyId === v.id ? "bg-accent/10 font-medium text-accent" : "text-foreground/70"
                                  }`}
                                  onClick={() => {
                                    updatePlantInstance(rowCrop.id, { varietyId: v.id, varietyName: v.name });
                                    setPlantInstancesVersion((v2) => v2 + 1);
                                    setEditingInstanceId(null);
                                  }}
                                >
                                  <span className="text-sm leading-none">🏷️</span>
                                  <span className="truncate">{v.name}</span>
                                  {v.taste ? <span className="text-[9px] text-foreground/40">{v.taste}</span> : null}
                                  {rowCrop.varietyId === v.id ? <span className="ml-auto text-[9px]">✓</span> : null}
                                </button>
                              ))}
                            </div>
                          );
                        })() : null}
                      </div>
                    ) : null}

                    {/* Companion planting checks */}
                    <CompanionChecksBlock checks={selectedCompanionChecks} />

                    {/* Rotation warnings */}
                    <RotationWarningsBlock warnings={selectedRotationWarnings} />

                    {/* ── Pick / change crop ── */}
                    {!showBedPlantPicker ? (
                      <button
                        type="button"
                        className="w-full rounded-md border border-dashed border-foreground/20 px-2 py-1.5 text-xs text-foreground/60 hover:border-foreground/30 hover:bg-foreground/5"
                        onClick={() => { setShowBedPlantPicker(true); setBedPlantSearch(""); setBedPickerSpeciesId(null); }}
                      >
                        {rowCrop ? "↻ Skift afgrøde" : "+ Vælg afgrøde"}
                      </button>
                    ) : bedPickerSpeciesId ? (() => {
                      const pickedSpecies = getPlantById(bedPickerSpeciesId);
                      const varieties = getVarietiesForSpecies(bedPickerSpeciesId);
                      const pickedSpacing = pickedSpecies?.spacingCm ?? 0;
                      const pickedCap = pickedSpacing > 0 ? Math.floor(rowLengthCm / pickedSpacing) : 0;
                      return (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1">
                            <button type="button" className="rounded px-1.5 py-1 text-xs text-foreground/50 hover:bg-foreground/5" onClick={() => setBedPickerSpeciesId(null)}>← Tilbage</button>
                            <span className="text-xs font-medium truncate flex-1">
                              {pickedSpecies?.icon ?? "🌱"} {pickedSpecies?.name} — vælg sort
                              {pickedCap > 0 ? <span className="text-foreground/40 font-normal"> · {pickedCap} stk</span> : null}
                            </span>
                            <button type="button" className="rounded px-1.5 py-1 text-xs text-foreground/50 hover:bg-foreground/5" onClick={() => { setShowBedPlantPicker(false); setBedPickerSpeciesId(null); }} aria-label="Luk plantevælger">✕</button>
                          </div>
                          <div className="max-h-48 space-y-0.5 overflow-y-auto">
                            <button
                              type="button"
                              className="flex w-full items-center gap-1.5 rounded border border-transparent px-2 py-1 text-left text-xs hover:border-foreground/15 hover:bg-foreground/5"
                              onClick={() => {
                                const featureId = selected?.feature.properties?.gardenosId;
                                if (!featureId) return;
                                // Remove existing crop first
                                for (const inst of selectedFeatureInstances) removePlantInstance(inst.id);
                                addPlantInstance(makePlantInstance({
                                  speciesId: bedPickerSpeciesId,
                                  featureId,
                                  count: pickedCap || 1,
                                }));
                                setPlantInstancesVersion((v) => v + 1);
                                setShowBedPlantPicker(false);
                                setBedPickerSpeciesId(null);
                              }}
                            >
                              <span className="text-sm leading-none">🌱</span>
                              <span className="truncate">{pickedSpecies?.name} (uspecificeret sort)</span>
                            </button>
                            {varieties.map((v) => {
                              const vSpacing = v.spacingCm ?? pickedSpacing;
                              const vCap = vSpacing > 0 ? Math.floor(rowLengthCm / vSpacing) : 0;
                              return (
                              <button
                                key={v.id}
                                type="button"
                                className="flex w-full items-center gap-1.5 rounded border border-transparent px-2 py-1 text-left text-xs hover:border-foreground/15 hover:bg-foreground/5"
                                onClick={() => {
                                  const featureId = selected?.feature.properties?.gardenosId;
                                  if (!featureId) return;
                                  for (const inst of selectedFeatureInstances) removePlantInstance(inst.id);
                                  addPlantInstance(makePlantInstance({
                                    speciesId: bedPickerSpeciesId,
                                    varietyId: v.id,
                                    varietyName: v.name,
                                    featureId,
                                    count: vCap || 1,
                                  }));
                                  setPlantInstancesVersion((vv) => vv + 1);
                                  setShowBedPlantPicker(false);
                                  setBedPickerSpeciesId(null);
                                }}
                              >
                                <span className="text-sm leading-none">🏷️</span>
                                <span className="truncate">{v.name}</span>
                                {vCap > 0 ? <span className="ml-auto text-[10px] text-foreground/40">{vCap} stk</span> : null}
                              </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            className="flex-1 rounded-md border border-foreground/20 bg-background px-2 py-1.5 text-xs"
                            placeholder="Søg afgrøde…"
                            value={bedPlantSearch}
                            onChange={(e) => setBedPlantSearch(e.target.value)}
                            autoFocus
                          />
                          <button type="button" className="rounded px-1.5 py-1.5 text-xs text-foreground/50 hover:bg-foreground/5" onClick={() => setShowBedPlantPicker(false)} aria-label="Luk plantevælger">✕</button>
                        </div>
                        <div className="max-h-40 space-y-0.5 overflow-y-auto">
                          {bedPlantResults.map((plant) => {
                            const pSpacing = plant.spacingCm ?? 0;
                            const pCap = pSpacing > 0 ? Math.floor(rowLengthCm / pSpacing) : 0;
                            return (
                            <button
                              key={plant.id}
                              type="button"
                              className="flex w-full items-center gap-1.5 rounded border border-transparent px-2 py-1 text-left text-xs hover:border-foreground/15 hover:bg-foreground/5"
                              onClick={() => {
                                const varieties = getVarietiesForSpecies(plant.id);
                                if (varieties.length > 0) {
                                  setBedPickerSpeciesId(plant.id);
                                } else {
                                  const featureId = selected?.feature.properties?.gardenosId;
                                  if (!featureId) return;
                                  for (const inst of selectedFeatureInstances) removePlantInstance(inst.id);
                                  addPlantInstance(makePlantInstance({
                                    speciesId: plant.id,
                                    featureId,
                                    count: pCap || 1,
                                  }));
                                  setPlantInstancesVersion((v) => v + 1);
                                  setShowBedPlantPicker(false);
                                  setBedPlantSearch("");
                                }
                              }}
                            >
                              <span className="text-sm leading-none">{plant.icon ?? "🌱"}</span>
                              <span className="truncate">{plant.name}</span>
                              <span className="ml-auto text-[10px] text-foreground/40">
                                {pCap > 0 ? `${pCap} stk` : ""}
                                {plant.spacingCm ? ` · ${plant.spacingCm} cm` : ""}
                              </span>
                            </button>
                            );
                          })}
                          {bedPlantResults.length === 0 ? (
                            <p className="px-2 py-1 text-xs text-foreground/50 italic">Ingen planter fundet.</p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              );
            })() : null}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* ── INDEHOLDER ── unified containment + plant instances  ── */}
            {/* ══════════════════════════════════════════════════════════ */}
            {(selectedCategory === "seedbed" || selectedCategory === "container" || selectedCategory === "area") ? (() => {
              const childCount = (selectedContainment?.total ?? 0);
              const plantCount = (selectedCategory !== "area" ? selectedFeatureInstances.length : 0);
              const totalItems = childCount + plantCount;
              return (
              <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                  onClick={() => setContentContainsOpen(!contentContainsOpen)}
                >
                  <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">🌱 Indeholder</span>
                  <span className="text-[9px] text-foreground/30">·</span>
                  <span className="text-[11px] text-foreground/70 truncate flex-1">
                    {totalItems > 0 ? `${totalItems} element${totalItems !== 1 ? "er" : ""}` : "(tomt)"}
                  </span>
                  <span className="text-[9px] text-foreground/30 shrink-0">{contentContainsOpen ? "▲" : "▼"}</span>
                </button>

                {contentContainsOpen ? (
                  <div className="px-2.5 pb-2.5 pt-1 space-y-2">

                {/* ── Child features (polygon containment) ── */}
                {selectedIsPolygon && selectedContainment && selectedContainment.total > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[9px] text-foreground/40 leading-snug">
                      {[selectedContainment.seedbeds ? `${selectedContainment.seedbeds} såbed` : "", selectedContainment.containers ? `${selectedContainment.containers} cont.` : "", selectedContainment.rows ? `${selectedContainment.rows} række` : "", selectedContainment.elements ? `${selectedContainment.elements} elem.` : "", selectedContainment.infra ? `${selectedContainment.infra} infra` : ""].filter(Boolean).join(", ")}
                    </p>
                    {selectedContainedItemsPreview.slice(0, 12).map((item) => (
                      <div key={item.id} className="rounded border border-foreground/10 bg-foreground/[0.02] px-2 py-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="flex-1 cursor-pointer text-left text-xs text-foreground/70 hover:text-foreground truncate"
                            onClick={() => selectFeatureById(item.id)}
                            title="Gå til element"
                          >
                            {item.text}
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
                      </div>
                    ))}
                    {selectedContainedItemsPreview.length > 12 ? (
                      <p className="text-[10px] text-foreground/40 italic">… +{selectedContainedItemsPreview.length - 12} flere</p>
                    ) : null}
                  </div>
                ) : null}

                {/* ── Plant instances (seedbed, container, row — NOT area) ── */}
                {(selectedCategory === "seedbed" || selectedCategory === "container") ? (
                  <>
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
                    ) : null}

                    {/* Companion planting checks */}
                    <CompanionChecksBlock checks={selectedCompanionChecks} />

                    {/* Rotation warnings */}
                    <RotationWarningsBlock warnings={selectedRotationWarnings} />

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
                                addPlantInstance(makePlantInstance({
                                  speciesId: bedPickerSpeciesId,
                                  featureId,
                                  count: 1,
                                }));
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
                                  addPlantInstance(makePlantInstance({
                                    speciesId: bedPickerSpeciesId,
                                    varietyId: v.id,
                                    varietyName: v.name,
                                    featureId,
                                    count: 1,
                                  }));
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
                                  setBedPickerSpeciesId(plant.id);
                                } else {
                                  const featureId = selected?.feature.properties?.gardenosId;
                                  if (!featureId) return;
                                  addPlantInstance(makePlantInstance({
                                    speciesId: plant.id,
                                    featureId,
                                    count: 1,
                                  }));
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
                  </>
                ) : null}

                {/* ── Empty state ── */}
                {totalItems === 0 ? (
                  <p className="text-xs text-foreground/50 italic">
                    {selectedCategory === "area" ? "Tegn såbede, rækker eller containere inden i dette område." : "Tilføj planter herunder."}
                  </p>
                ) : null}

                  </div>
                ) : null}
              </div>
              );
            })() : null}


            {/* ── Design Lab plant summary ── */}
            {selectedIsPolygon && (selectedCategory === "seedbed" || selectedCategory === "area" || selectedCategory === "container") ? (() => {
              const dlLayout = selected ? getBedLayout(selected.gardenosId) : null;
              if (!dlLayout || dlLayout.elements.length === 0) return null;
              const dlPlants = dlLayout.elements.filter((e) => e.type === "plant" && e.speciesId);
              const dlInfra = dlLayout.elements.filter((e) => e.type !== "plant" && e.type !== "row");
              if (dlPlants.length === 0 && dlInfra.length === 0) return null;
              // Group by species
              const speciesMap = new Map<string, { icon: string; name: string; count: number }>();
              for (const el of dlPlants) {
                const key = el.speciesId!;
                if (!speciesMap.has(key)) {
                  const sp = getPlantById(key);
                  speciesMap.set(key, { icon: sp?.icon ?? el.icon ?? "🌱", name: sp?.name ?? el.label ?? key, count: 0 });
                }
                speciesMap.get(key)!.count++;
              }
              return (
                <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                  <div className="px-2.5 py-1.5">
                    <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">🎨 Design Lab planter</span>
                  </div>
                  <div className="px-2.5 pb-2 space-y-0.5">
                    {Array.from(speciesMap.entries()).map(([id, { icon, name, count }]) => (
                      <div key={id} className="flex items-center gap-1.5 text-xs text-foreground/70">
                        <span className="text-sm">{icon}</span>
                        <span className="truncate flex-1">{name}</span>
                        <span className="text-[10px] text-foreground/40">{count} stk</span>
                      </div>
                    ))}
                    {dlInfra.length > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-foreground/50 mt-1">
                        <span className="text-sm">🔧</span>
                        <span>{dlInfra.length} infrastruktur-element{dlInfra.length !== 1 ? "er" : ""}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : null}

            {/* ── Design Lab button ── */}
            {selectedIsPolygon && (selectedCategory === "seedbed" || selectedCategory === "area" || selectedCategory === "container") ? (
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={() => setShowDesignLab(true)}
              >
                🎨 Åbn i Design Lab
              </button>
            ) : null}

            {/* ── Auto-row + Auto-element panels ── */}
            {selectedIsPolygon && (selectedCategory === "seedbed" || selectedCategory === "area" || selectedCategory === "container") ? (
              <>
              <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                  onClick={() => { setAutoRowOpen(!autoRowOpen); setAutoRowSearch(""); }}
                >
                  <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">🌾 Tilføj rækker</span>
                  <span className="text-[9px] text-foreground/30">·</span>
                  <span className="text-[11px] text-foreground/40 italic truncate flex-1">Opret planterækker automatisk</span>
                  <span className="text-[9px] text-foreground/30 shrink-0">{autoRowOpen ? "▲" : "▼"}</span>
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
                      const mpLat = M_PER_DEG_LAT;
                      const mpLng = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
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
                    <div className="px-2.5 pb-2.5 pt-1 space-y-2">
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
                            onClick={() => { if (!directionLocked) { setAutoRowDirection("length"); } }}
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
                            onClick={() => { if (!directionLocked) { setAutoRowDirection("width"); } }}
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
                              onClick={() => { setAutoRowSpeciesId(null); setAutoRowVarietyId(null); }}
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
                                  onChange={(e) => { setAutoRowCount(Math.max(0, parseInt(e.target.value) || 0)); }}
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
                                  onChange={(e) => { setAutoRowEdgeMarginCm(Math.max(0, parseInt(e.target.value) || 0)); }}
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
                                  onClick={() => {}}
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
              <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                  onClick={() => { setAutoElementOpen(!autoElementOpen); setAutoElementSearch(""); }}
                >
                  <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">🌳 Tilføj elementer</span>
                  <span className="text-[9px] text-foreground/30">·</span>
                  <span className="text-[11px] text-foreground/40 italic truncate flex-1">Placér buske, træer og stauder</span>
                  <span className="text-[9px] text-foreground/30 shrink-0">{autoElementOpen ? "▲" : "▼"}</span>
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
                    <div className="px-2.5 pb-2.5 pt-1 space-y-2">
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
                {/* ── Art (species) picker — collapsible chip ── */}
                {(() => {
                  const currentSpeciesId = selected.feature.properties?.speciesId ?? "";
                  const currentSpecies = currentSpeciesId ? getPlantById(currentSpeciesId) : undefined;
                  const speciesLabel = currentSpecies ? `${currentSpecies.icon ?? "🌿"} ${currentSpecies.name}` : "Vælg art";
                  return (
                    <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                      <div
                        role="button"
                        tabIndex={0}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors cursor-pointer"
                        onClick={() => { setContentSpeciesOpen(!contentSpeciesOpen); if (!contentSpeciesOpen) setSpeciesPickerSearch(""); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setContentSpeciesOpen(!contentSpeciesOpen); if (!contentSpeciesOpen) setSpeciesPickerSearch(""); } }}
                      >
                        <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">🌿 Art</span>
                        <span className="text-[9px] text-foreground/30">·</span>
                        <span className={`text-[11px] truncate flex-1 ${currentSpecies ? "text-foreground/70" : "text-foreground/40 italic"}`}>{speciesLabel}</span>
                        {currentSpeciesId ? (
                          <button
                            type="button"
                            className="shrink-0 rounded px-1 py-0.5 text-[9px] text-foreground/30 hover:bg-red-50 hover:text-red-500"
                            onClick={(e) => { e.stopPropagation(); updateSelectedProperty({ speciesId: "", varietyId: "", varietyName: "" }); }}
                            title="Fjern art"
                          >✕</button>
                        ) : null}
                        <span className="text-[9px] text-foreground/30 shrink-0">{contentSpeciesOpen ? "▲" : "▼"}</span>
                      </div>
                      {contentSpeciesOpen ? (
                        <div className="px-2.5 pb-2.5 pt-1 space-y-1.5">
                          <input
                            className="w-full rounded-md border border-foreground/15 bg-background px-2.5 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                            value={speciesPickerSearch}
                            onChange={(e) => setSpeciesPickerSearch(e.target.value)}
                            placeholder="Søg art… (navn eller latin)"
                            autoFocus
                          />
                          <div className="max-h-48 overflow-y-auto space-y-0.5 -mx-0.5 px-0.5">
                            {(() => {
                              const q = speciesPickerSearch.trim().toLowerCase();
                              // Filter by kind → category mapping
                              const kindCategoryMap: Record<string, string[]> = {
                                tree: ["tree", "fruit"],
                                bush: ["fruit", "bush", "perennial"],
                                flower: ["flower", "perennial", "grass", "cover-crop"],
                                plant: ["vegetable", "herb", "soil-amendment"],
                              };
                              const kindStr = String(selectedKind ?? "plant").toLowerCase();
                              const preferredCategories = kindCategoryMap[kindStr] ?? [];
                              let candidates = allPlants;
                              // If no search query, filter by kind-appropriate categories
                              if (!q && preferredCategories.length > 0) {
                                candidates = candidates.filter((p) => preferredCategories.includes(p.category));
                              }
                              if (q) {
                                candidates = candidates.filter((p) =>
                                  p.name.toLowerCase().includes(q) ||
                                  (p.latinName?.toLowerCase().includes(q) ?? false) ||
                                  p.id.includes(q)
                                );
                              }
                              // Sort: current species first, then alphabetically
                              candidates.sort((a, b) => {
                                if (a.id === currentSpeciesId) return -1;
                                if (b.id === currentSpeciesId) return 1;
                                return a.name.localeCompare(b.name, "da");
                              });
                              if (candidates.length === 0) return <p className="text-[10px] text-foreground/40 py-2 text-center">Ingen arter fundet</p>;
                              return candidates.slice(0, 50).map((sp) => (
                                <button
                                  key={sp.id}
                                  type="button"
                                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all ${
                                    sp.id === currentSpeciesId
                                      ? "border border-accent/30 bg-accent-light/30 text-accent-dark font-semibold"
                                      : "border border-transparent hover:bg-foreground/5 text-foreground/70"
                                  }`}
                                  onClick={() => {
                                    const newProps: Partial<GardenFeatureProperties> = {
                                      speciesId: sp.id,
                                      varietyId: "",
                                      varietyName: "",
                                    };
                                    // Auto-fill name if currently empty or was auto-set from a previous species
                                    const currentName = selected.feature.properties?.name ?? "";
                                    const prevSpecies = currentSpeciesId ? getPlantById(currentSpeciesId) : undefined;
                                    if (!currentName || currentName === prevSpecies?.name) {
                                      newProps.name = sp.name;
                                      newProps.planted = sp.name;
                                    }
                                    // Auto-fill icon if species has one
                                    if (sp.icon) {
                                      newProps.customIcon = sp.icon;
                                    }
                                    updateSelectedProperty(newProps);
                                    setContentSpeciesOpen(false);
                                    setSpeciesPickerSearch("");
                                  }}
                                >
                                  <span className="text-base leading-none shrink-0">{sp.icon ?? "🌱"}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] truncate">{sp.name}</p>
                                    {sp.latinName ? <p className="text-[9px] text-foreground/40 italic truncate">{sp.latinName}</p> : null}
                                  </div>
                                  <span className="text-[9px] text-foreground/30 shrink-0">{PLANT_CATEGORY_LABELS[sp.category]}</span>
                                </button>
                              ));
                            })()}
                          </div>
                          {!speciesPickerSearch.trim() ? (
                            <p className="text-[9px] text-foreground/30 text-center pt-0.5">Filtreret til {String(selectedKind ?? "plant")}-relevante arter · Søg for alle</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

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

                      {/* ── Sort (variety) — always visible ── */}
                      <div className="border-t border-accent/10 px-2.5 py-2 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide shrink-0">🏷️ Sort</span>
                          {varieties.length > 0 ? (
                            <select
                              className="flex-1 min-w-0 rounded-md border border-accent/20 bg-background px-2 py-1 text-xs font-medium text-accent focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/50"
                              value={currentVarietyId}
                              onChange={(e) => {
                                const vId = e.target.value;
                                const v = vId ? varieties.find((vv) => vv.id === vId) : undefined;
                                const updates: Record<string, string> = {
                                  varietyId: vId,
                                  varietyName: v?.name ?? "",
                                  planted: v?.name ?? linkedSpecies.name,
                                };
                                // Pre-fill plantedAt from variety's sowStart if currently empty
                                if (v?.sowStart && !selected.feature.properties?.plantedAt) {
                                  const year = new Date().getFullYear();
                                  const month = String(v.sowStart).padStart(2, "0");
                                  updates.plantedAt = `${year}-${month}-01`;
                                }
                                updateSelectedProperty(updates);
                              }}
                            >
                              <option value="">— Uspecificeret —</option>
                              {varieties.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}{v.daysToHarvest ? ` (${v.daysToHarvest}d)` : ""}{v.taste ? ` · ${v.taste}` : ""}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="flex-1 text-[10px] text-foreground/40 italic">Ingen sorter oprettet</span>
                          )}
                          <button
                            type="button"
                            className="shrink-0 rounded-md border border-accent/20 px-1.5 py-1 text-[10px] text-accent hover:bg-accent/5 transition-colors"
                            onClick={() => {
                              setVarietyManagerSpeciesId(linkedSpecies.id);
                              setShowVarietyManager(true);
                            }}
                            title="Administrér sorter"
                          >
                            {varieties.length > 0 ? "⚙️" : "＋ Tilføj"}
                          </button>
                        </div>

                        {/* Variety info card (when a specific variety is selected) */}
                        {currentVariety ? (
                          <div className="rounded-md border border-accent/10 bg-accent-light/10 p-2 space-y-1 text-[10px] text-foreground/60">
                            {currentVariety.description ? <p>{currentVariety.description}</p> : null}
                            {/* Key data chips */}
                            <div className="flex flex-wrap gap-1">
                              {currentVariety.color ? <span className="inline-flex items-center gap-0.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[9px]">🎨 {currentVariety.color}</span> : null}
                              {currentVariety.taste ? <span className="inline-flex items-center gap-0.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[9px]">👅 {currentVariety.taste}</span> : null}
                              {currentVariety.daysToHarvest ? <span className="inline-flex items-center gap-0.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[9px]">📅 {currentVariety.daysToHarvest} dage</span> : null}
                              {currentVariety.spacingCm ? <span className="inline-flex items-center gap-0.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[9px]">↔️ {currentVariety.spacingCm} cm</span> : null}
                              {currentVariety.heightCm ? <span className="inline-flex items-center gap-0.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[9px]">📏 {currentVariety.heightCm} cm</span> : null}
                              {currentVariety.storageQuality ? <span className="inline-flex items-center gap-0.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[9px]">📦 {currentVariety.storageQuality}</span> : null}
                              {currentVariety.resistances?.length ? <span className="inline-flex items-center gap-0.5 rounded-full bg-green-50 text-green-700 px-1.5 py-0.5 text-[9px]">🛡️ {currentVariety.resistances.join(", ")}</span> : null}
                              {currentVariety.seedSource ? <span className="inline-flex items-center gap-0.5 rounded-full bg-foreground/5 px-1.5 py-0.5 text-[9px]">🏪 {currentVariety.seedSource}</span> : null}
                            </div>
                            {/* Season windows */}
                            {(currentVariety.sowStart || currentVariety.harvestStart) ? (
                              <div className="flex gap-3 pt-0.5">
                                {currentVariety.sowStart && currentVariety.sowEnd ? <span className="text-[9px] text-foreground/50">🌱 Så: mnd {currentVariety.sowStart}–{currentVariety.sowEnd}</span> : null}
                                {currentVariety.harvestStart && currentVariety.harvestEnd ? <span className="text-[9px] text-foreground/50">🥕 Høst: mnd {currentVariety.harvestStart}–{currentVariety.harvestEnd}</span> : null}
                              </div>
                            ) : null}
                            {currentVariety.yieldInfo ? <p className="text-[9px] text-foreground/50">📦 {currentVariety.yieldInfo}</p> : null}
                            {currentVariety.notes ? <p className="text-[9px] text-foreground/40 italic">💬 {currentVariety.notes}</p> : null}
                          </div>
                        ) : null}
                      </div>

                      {/* ── Ikon (always visible) ── */}
                      <div className="border-t border-accent/10 px-2.5 py-2">
                        {(() => {
                          const sameKindCount = selectedKind ? (() => {
                            let count = 0;
                            featureGroupRef.current?.eachLayer((layer) => {
                              const lf = (layer as L.Layer & { feature?: GardenFeature }).feature;
                              if (lf?.properties?.kind === selectedKind) count++;
                            });
                            return count;
                          })() : 0;
                          return (
                            <div>
                              <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide mb-1">🎨 Ikon</label>
                              <IconPicker
                                value={selected.feature.properties?.customIcon ?? ""}
                                onChange={(emoji) => {
                                  updateSelectedProperty({ customIcon: emoji });
                                }}
                                kindLabel={selectedKindDef?.label}
                                kindCount={sameKindCount}
                                onSetKindDefault={selectedKind ? (emoji) => {
                                  pushUndoSnapshot();
                                  setKindDefaultIcon(selectedKind!, emoji);
                                  const group = featureGroupRef.current;
                                  if (group) {
                                    group.eachLayer((layer) => {
                                      const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
                                      const lf = layerWithFeature.feature;
                                      if (lf?.properties?.kind === selectedKind) {
                                        lf.properties.customIcon = emoji;
                                      }
                                    });
                                  }
                                  if (selected.feature.properties?.kind === selectedKind) {
                                    setSelected({
                                      gardenosId: selected.gardenosId,
                                      feature: ensureDefaultProperties({
                                        ...selected.feature,
                                        properties: { ...selected.feature.properties, customIcon: emoji },
                                      }),
                                    });
                                  }
                                  rebuildFromGroupAndUpdateSelection();
                                } : undefined}
                              />
                            </div>
                          );
                        })()}
                      </div>

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
                          <div className="px-2.5 pb-2.5 space-y-2 text-[10px] text-foreground/60">
                            {/* ── Plantedato (inside collapsible) ── */}
                            <div>
                              <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">📅 Plantedato</label>
                              {(() => {
                                const sp = selected.feature.properties;
                                const species = sp?.speciesId ? getPlantById(sp.speciesId) : undefined;
                                const variety = sp?.speciesId && sp?.varietyId ? getVarietiesForSpecies(sp.speciesId).find((v) => v.id === sp.varietyId) : undefined;
                                const sowS = variety?.sowStart ?? (species?.sowOutdoor?.from || species?.sowIndoor?.from);
                                const sowE = variety?.sowEnd ?? (species?.sowOutdoor?.to || species?.sowIndoor?.to);
                                const harS = variety?.harvestStart ?? species?.harvest?.from;
                                const harE = variety?.harvestEnd ?? species?.harvest?.to;
                                const hints: string[] = [];
                                if (sowS && sowE) hints.push(`🌱 Så mnd ${sowS}–${sowE}`);
                                if (harS && harE) hints.push(`🥕 Høst mnd ${harS}–${harE}`);
                                if (variety?.daysToHarvest) hints.push(`📅 ${variety.daysToHarvest} dage til høst`);
                                else if (species && 'daysToHarvest' in species && (species as Record<string, unknown>).daysToHarvest) hints.push(`📅 ${(species as Record<string, unknown>).daysToHarvest} dage til høst`);
                                return hints.length > 0 ? (
                                  <p className="text-[9px] text-accent/70 mt-0.5 mb-1">{hints.join(" · ")}</p>
                                ) : (
                                  <p className="text-[9px] text-foreground/35 mt-0.5 mb-1">Hvornår planten blev sat / forventes sat</p>
                                );
                              })()}
                              <input
                                type="date"
                                className="w-full rounded-md border border-foreground/15 bg-background px-2.5 py-1.5 text-xs shadow-sm"
                                value={selected.feature.properties?.plantedAt ?? ""}
                                onChange={(e) => updateSelectedProperty({ plantedAt: e.target.value })}
                              />
                            </div>
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
                              {linkedSpecies.seasonType ? (
                                <div><span className="text-foreground/40">Sæsontype:</span> {linkedSpecies.seasonType === "cool" ? "Kold-sæson" : "Varm-sæson"}</div>
                              ) : null}
                              {linkedSpecies.sowDepthCm != null ? (
                                <div><span className="text-foreground/40">Sådybde:</span> {linkedSpecies.sowDepthCm} cm</div>
                              ) : null}
                              {linkedSpecies.daysToHarvest ? (
                                <div><span className="text-foreground/40">Dage til høst:</span> ~{linkedSpecies.daysToHarvest} dage</div>
                              ) : null}
                              {linkedSpecies.phRange ? (
                                <div><span className="text-foreground/40">Jord-pH:</span> {linkedSpecies.phRange.min}–{linkedSpecies.phRange.max}</div>
                              ) : null}
                              {linkedSpecies.germinationDays ? (
                                <div><span className="text-foreground/40">Spiretid:</span> {linkedSpecies.germinationDays.min}–{linkedSpecies.germinationDays.max} dage</div>
                              ) : null}
                              {linkedSpecies.germinationTempC ? (
                                <div><span className="text-foreground/40">Spiretemperatur:</span> {linkedSpecies.germinationTempC.min}–{linkedSpecies.germinationTempC.max}°C</div>
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

                {/* ── Konflikter for dette element (struktureret hæmmer/hæmmes af) ── */}
                {selected.feature.properties?.speciesId && selected.feature.geometry?.type === "Point" ? (() => {
                  const myId = selected.gardenosId;
                  const mySpecies = getPlantById(selected.feature.properties!.speciesId!);
                  const myConflicts = allConflicts.filter((c) => c.featureIdA === myId || c.featureIdB === myId);
                  if (myConflicts.length === 0) return (
                    <div className="rounded-lg border border-green-200 bg-green-50/50 p-2.5">
                      <p className="text-[10px] text-green-700 font-medium">✅ Ingen konflikter — denne plante er godt placeret</p>
                    </div>
                  );

                  // Split: "denne plante hæmmes af andre" vs "denne plante hæmmer andre"
                  const hæmmesAf: { conflict: PlantConflict; other: PlantSpecies; otherId: string }[] = [];
                  const hæmmerAndre: { conflict: PlantConflict; other: PlantSpecies; otherId: string }[] = [];
                  for (const c of myConflicts) {
                    const iAmA = c.featureIdA === myId;
                    const otherId = iAmA ? c.featureIdB : c.featureIdA;
                    const other = iAmA ? c.speciesB : c.speciesA;
                    // For shade: featureIdA = the shading tree, featureIdB = the shaded plant
                    if (c.type === "shade") {
                      if (c.featureIdB === myId) hæmmesAf.push({ conflict: c, other, otherId });
                      else hæmmerAndre.push({ conflict: c, other, otherId });
                    } else {
                      // Symmetric conflicts (spacing, companion, layer) — show in both
                      hæmmesAf.push({ conflict: c, other, otherId });
                    }
                  }

                  const worstSeverity = Math.max(...myConflicts.map((c) => c.severity));
                  const borderColor = worstSeverity === 3 ? "border-red-400" : worstSeverity === 2 ? "border-orange-300" : "border-yellow-300";
                  const bgColor = worstSeverity === 3 ? "bg-red-50/60" : worstSeverity === 2 ? "bg-orange-50/50" : "bg-yellow-50/50";

                  const renderConflictMini = (item: { conflict: PlantConflict; other: PlantSpecies; otherId: string }, idx: number) => {
                    const c = item.conflict;
                    const icon = c.type === "spacing" ? "📏" : c.type === "bad-companion" ? "⛔" : c.type === "shade" ? "☀️" : "⚠️";
                    const shadeMatch = c.type === "shade" ? c.message.match(/~(\d+\.?\d*)\s*t(?:imer)?\/dag/) : null;
                    const shadeHrs = shadeMatch ? parseFloat(shadeMatch[1]) : 0;
                    return (
                      <div key={idx} className="flex items-start gap-1.5 rounded-md bg-white/60 border border-foreground/8 px-2 py-1.5">
                        <span className="text-xs mt-0.5">{icon}</span>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="text-[10px] font-medium text-foreground/70 hover:underline truncate"
                              onClick={() => selectFeatureById(item.otherId)}
                            >{item.other.icon ?? "🌱"} {item.other.name}</button>
                            <span className={`text-[8px] px-1 rounded-full font-semibold ${c.severity === 3 ? "bg-red-100 text-red-600" : c.severity === 2 ? "bg-orange-100 text-orange-600" : "bg-yellow-100 text-yellow-700"}`}>
                              {c.severity === 3 ? "alvorlig" : c.severity === 2 ? "moderat" : "mild"}
                            </span>
                          </div>
                          <p className="text-[9px] text-foreground/50 leading-tight">{c.suggestion}</p>
                          {c.type === "shade" && shadeHrs > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[8px] text-foreground/35">☀️</span>
                              <div className="flex-1 h-1.5 rounded-full bg-yellow-100 overflow-hidden">
                                <div className="h-full bg-gray-400 rounded-full" style={{ width: `${Math.min(100, (shadeHrs / GROWING_SEASON_SUN_HOURS) * 100)}%`, marginLeft: `${Math.max(0, 100 - (shadeHrs / GROWING_SEASON_SUN_HOURS) * 100)}%` }} />
                              </div>
                              <span className="text-[8px] text-foreground/35">{shadeHrs.toFixed(1)}t</span>
                            </div>
                          ) : null}
                          {c.type === "spacing" ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1 rounded-full bg-foreground/8 overflow-hidden">
                                <div className={`h-full rounded-full ${c.severity === 3 ? "bg-red-400" : c.severity === 2 ? "bg-orange-400" : "bg-yellow-400"}`} style={{ width: `${Math.min(100, (c.distanceM / c.requiredM) * 100)}%` }} />
                              </div>
                              <span className="text-[8px] text-foreground/30">{c.distanceM.toFixed(1)}m/{c.requiredM.toFixed(1)}m</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div className={`rounded-lg border-2 ${borderColor} ${bgColor} p-2.5 space-y-2`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-foreground/70">
                          {worstSeverity === 3 ? "🔴" : worstSeverity === 2 ? "🟠" : "🟡"} {myConflicts.length} konflikt{myConflicts.length > 1 ? "er" : ""}
                        </p>
                        <button
                          type="button"
                          className="text-[9px] text-accent hover:underline"
                          onClick={() => { setSidebarTab("conflicts"); setSidebarPanelOpen(true); }}
                        >Se alle konflikter →</button>
                      </div>

                      {/* Section: Hæmmes af (what's hurting THIS plant) */}
                      {hæmmesAf.length > 0 ? (
                        <div>
                          <p className="text-[9px] font-semibold text-foreground/50 uppercase tracking-wide mb-1">
                            🔽 Hæmmes af ({hæmmesAf.length})
                          </p>
                          <div className="space-y-1">
                            {hæmmesAf.map((item, idx) => renderConflictMini(item, idx))}
                          </div>
                        </div>
                      ) : null}

                      {/* Section: Hæmmer andre (where THIS plant causes problems) */}
                      {hæmmerAndre.length > 0 ? (
                        <div>
                          <p className="text-[9px] font-semibold text-foreground/50 uppercase tracking-wide mb-1">
                            🔼 Hæmmer andre ({hæmmerAndre.length})
                          </p>
                          <div className="space-y-1">
                            {hæmmerAndre.map((item, idx) => renderConflictMini(item, idx))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })() : null}


              </>
            ) : null}

            {/* ── Dyrkningsforhold (seedbed + container) ── */}
            {(selectedCategory === "seedbed" || selectedCategory === "container") ? (() => {
              const props = selected.feature.properties ?? {};
              const spId = props.soilProfileId as string | undefined;
              const sp = spId ? getSoilProfileById(spId) : undefined;
              const soilLabel = sp ? (sp.baseType ? SOIL_BASE_TYPE_LABELS[sp.baseType] : sp.name) : null;
              const summaryParts: string[] = [];
              if (soilLabel) summaryParts.push(soilLabel);
              if (selectedCategory === "seedbed" && props.sowingMethod) summaryParts.push(String(props.sowingMethod));
              if (selectedCategory === "container" && props.material) summaryParts.push(String(props.material));
              if (props.wateringNeed) summaryParts.push(String(props.wateringNeed));
              return (
              <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                  onClick={() => setContentGrowingOpen(!contentGrowingOpen)}
                >
                  <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">🌿 Dyrkningsforhold</span>
                  {summaryParts.length > 0 ? (
                    <>
                      <span className="text-[9px] text-foreground/30">·</span>
                      <span className="text-[11px] text-foreground/70 truncate flex-1">{summaryParts.join(" · ")}</span>
                    </>
                  ) : (
                    <span className="text-[11px] text-foreground/40 italic truncate flex-1">(ikke udfyldt)</span>
                  )}
                  <span className="text-[9px] text-foreground/30 shrink-0">{contentGrowingOpen ? "▲" : "▼"}</span>
                </button>

                {contentGrowingOpen ? (
                  <div className="px-2.5 pb-2.5 pt-1 space-y-2">

                {/* ── Seedbed fields ── */}
                {selectedCategory === "seedbed" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Såmetode</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                          value={String(props.sowingMethod ?? "")}
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
                          value={String(props.bedSeason ?? "")}
                          onChange={(e) => updateSelectedProperty({ bedSeason: e.target.value })}
                          placeholder="Fx 2026"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Jordtype</label>
                      {sp ? (
                        <button
                          type="button"
                          className="mt-1 w-full flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-light/20 px-3 py-2 text-sm text-left hover:bg-accent-light/40 transition-colors"
                          onClick={() => setSoilPanelOpen(true)}
                        >
                          <span>🪨</span>
                          <span className="flex-1 truncate font-medium">{soilLabel}</span>
                          <span className="text-[10px] text-foreground/40">Åbn ▼</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="mt-1 w-full rounded-lg border border-dashed border-foreground/20 px-3 py-2 text-sm text-foreground/50 hover:border-accent/40 hover:bg-accent-light/30 transition-colors"
                          onClick={() => setSoilPanelOpen(true)}
                        >
                          + Tilknyt jordprofil ↓
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Gødning</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                        value={String(props.fertilizer ?? "")}
                        onChange={(e) => updateSelectedProperty({ fertilizer: e.target.value })}
                        placeholder="Fx kompost april, NPK maj"
                      />
                    </div>
                  </>
                ) : null}

                {/* ── Container fields ── */}
                {selectedCategory === "container" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Jordtype / substrat</label>
                        {sp ? (
                          <button
                            type="button"
                            className="mt-1 w-full flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-light/20 px-3 py-2 text-sm text-left hover:bg-accent-light/40 transition-colors"
                            onClick={() => setSoilPanelOpen(true)}
                          >
                            <span>🪨</span>
                            <span className="flex-1 truncate font-medium">{soilLabel}</span>
                            <span className="text-[10px] text-foreground/40">Åbn ▼</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="mt-1 w-full rounded-lg border border-dashed border-foreground/20 px-3 py-2 text-sm text-foreground/50 hover:border-accent/40 hover:bg-accent-light/30 transition-colors"
                            onClick={() => setSoilPanelOpen(true)}
                          >
                            + Tilknyt jordprofil ↓
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Vandingsbehov</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                          value={String(props.wateringNeed ?? "")}
                          onChange={(e) => updateSelectedProperty({ wateringNeed: e.target.value })}
                        >
                          <option value="">Vælg…</option>
                          <option value="lav">Lav (1–2x/uge)</option>
                          <option value="middel">Middel (3–4x/uge)</option>
                          <option value="høj">Høj (dagligt)</option>
                          <option value="selvvandende">Selvvandende</option>
                          <option value="dryp">Drypvanding</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Dræn</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                          value={String(props.drainage ?? "")}
                          onChange={(e) => updateSelectedProperty({ drainage: e.target.value })}
                        >
                          <option value="">Vælg…</option>
                          <option value="huller">Drænhuller i bund</option>
                          <option value="drænlag">Drænlag (ler/sten)</option>
                          <option value="ingen">Ingen dræn</option>
                          <option value="selvdrænende">Selvdrænende</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Materiale</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                          value={String(props.material ?? "")}
                          onChange={(e) => updateSelectedProperty({ material: e.target.value })}
                        >
                          <option value="">Vælg…</option>
                          <option value="keramik">Keramik/ler</option>
                          <option value="plast">Plast</option>
                          <option value="træ">Træ</option>
                          <option value="metal">Metal/zink</option>
                          <option value="beton">Beton/fibercement</option>
                          <option value="stof">Stof/dyrkningspose</option>
                          <option value="flettet">Flettet/rattan</option>
                          <option value="sten">Natursten</option>
                          <option value="anden">Anden</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Volumen (liter)</label>
                        <input
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                          type="number"
                          min="0"
                          value={String(props.volume ?? "")}
                          onChange={(e) => updateSelectedProperty({ volume: e.target.value })}
                          placeholder="Fx 25, 50, 200"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Placering</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                          value={String(props.placement ?? "")}
                          onChange={(e) => updateSelectedProperty({ placement: e.target.value })}
                        >
                          <option value="">Vælg…</option>
                          <option value="fuld-sol">Fuld sol (6+ timer)</option>
                          <option value="halvskygge">Halvskygge (3–6 timer)</option>
                          <option value="skygge">Skygge (&lt;3 timer)</option>
                          <option value="indendørs">Indendørs</option>
                          <option value="overdækket">Overdækket/altan</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Gødning</label>
                        <input
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                          value={String(props.fertilizer ?? "")}
                          onChange={(e) => updateSelectedProperty({ fertilizer: e.target.value })}
                          placeholder="Fx kompost april, NPK maj"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">Vinterbeskyttelse</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm"
                          value={String(props.winterProtection ?? "")}
                          onChange={(e) => updateSelectedProperty({ winterProtection: e.target.value })}
                        >
                          <option value="">Vælg…</option>
                          <option value="ingen">Ingen/hårdfør</option>
                          <option value="indendørs">Flyttes indendørs</option>
                          <option value="isoleret">Isoleres/dækkes</option>
                          <option value="uopvarmet">Uopvarmet rum/garage</option>
                        </select>
                      </div>
                    </div>
                  </>
                ) : null}

                  </div>
                ) : null}
              </div>
              );
            })() : null}

            {/* ── Area-specific fields (per SubGroup) ── */}
            {selectedCategory === "area" && SUB_GROUP_LABELS[selectedSubGroup] ? (() => {
              const props = selected.feature.properties ?? {};
              const summaryParts: string[] = [];
              if (selectedSubGroup === "zone") {
                if (props.shelter) summaryParts.push(props.shelter);
                if (props.sunlight) summaryParts.push(props.sunlight);
                if (props.orientation) summaryParts.push(props.orientation);
              } else if (selectedSubGroup === "structure") {
                if (props.structureMaterial) summaryParts.push(props.structureMaterial);
                if (props.structureHeight) summaryParts.push(props.structureHeight);
              } else if (selectedSubGroup === "cover") {
                if (props.coverMaterial) summaryParts.push(props.coverMaterial);
                if (props.heating) summaryParts.push(props.heating);
              }
              return (
              <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                  onClick={() => setContentAreaFieldsOpen(!contentAreaFieldsOpen)}
                >
                  <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">{SUB_GROUP_LABELS[selectedSubGroup]}</span>
                  <span className="text-[9px] text-foreground/30">·</span>
                  <span className="text-[11px] text-foreground/70 truncate flex-1">
                    {summaryParts.length > 0 ? summaryParts.join(", ") : "(ikke udfyldt)"}
                  </span>
                  <span className="text-[9px] text-foreground/30 shrink-0">{contentAreaFieldsOpen ? "▲" : "▼"}</span>
                </button>

                {contentAreaFieldsOpen ? (
                  <div className="px-2.5 pb-2.5 pt-1 space-y-2">

                {/* ── Zone fields ── */}
                {selectedSubGroup === "zone" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🌬️ Læforhold</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.shelter ?? ""} onChange={(e) => updateSelectedProperty({ shelter: e.target.value })}>
                        <option value="">Vælg…</option>
                        <option value="åben">Åben</option>
                        <option value="delvis-læ">Delvis læ</option>
                        <option value="fuld-læ">Fuld læ</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">☀️ Lysforhold</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.sunlight ?? ""} onChange={(e) => updateSelectedProperty({ sunlight: e.target.value })}>
                        <option value="">Vælg…</option>
                        <option value="fuld-sol">Fuld sol</option>
                        <option value="halvskygge">Halvskygge</option>
                        <option value="skygge">Skygge</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🧭 Orientering</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.orientation ?? ""} onChange={(e) => updateSelectedProperty({ orientation: e.target.value })}>
                        <option value="">Vælg…</option>
                        <option value="nord">Nord</option>
                        <option value="syd">Syd</option>
                        <option value="øst">Øst</option>
                        <option value="vest">Vest</option>
                        <option value="blandet">Blandet</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🎯 Formål</label>
                      <input className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.purpose ?? ""} onChange={(e) => updateSelectedProperty({ purpose: e.target.value })} placeholder="Fx selvforsyning, rekreation" />
                    </div>
                  </div>
                ) : null}

                {/* ── Structure fields ── */}
                {selectedSubGroup === "structure" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🧱 Materiale</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.structureMaterial ?? ""} onChange={(e) => updateSelectedProperty({ structureMaterial: e.target.value })}>
                        <option value="">Vælg…</option>
                        <option value="træ">Træ</option>
                        <option value="mursten">Mursten</option>
                        <option value="beton">Beton</option>
                        <option value="metal">Metal</option>
                        <option value="sten">Sten</option>
                        <option value="fliser">Fliser</option>
                        <option value="andet">Andet</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">📏 Højde (ca.)</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.structureHeight ?? ""} onChange={(e) => updateSelectedProperty({ structureHeight: e.target.value })}>
                        <option value="">Vælg…</option>
                        <option value="lav">Lav (&lt;1 m)</option>
                        <option value="middel">Middel (1–2,5 m)</option>
                        <option value="høj">Høj (&gt;2,5 m)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">⬛ Skyggeretning</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.shadowDirection ?? ""} onChange={(e) => updateSelectedProperty({ shadowDirection: e.target.value })}>
                        <option value="">Vælg…</option>
                        <option value="nord">Mod nord</option>
                        <option value="syd">Mod syd</option>
                        <option value="øst">Mod øst</option>
                        <option value="vest">Mod vest</option>
                        <option value="minimal">Minimal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🎯 Formål</label>
                      <input className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.structureUse ?? ""} onChange={(e) => updateSelectedProperty({ structureUse: e.target.value })} placeholder="Fx opbevaring, ophold" />
                    </div>
                  </div>
                ) : null}

                {/* ── Cover fields ── */}
                {selectedSubGroup === "cover" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🌡️ Opvarmning</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.heating ?? ""} onChange={(e) => updateSelectedProperty({ heating: e.target.value })}>
                        <option value="">Ingen</option>
                        <option value="passiv-sol">Passiv sol</option>
                        <option value="gulvvarme">Gulvvarme</option>
                        <option value="el-varme">El-varme</option>
                        <option value="varmekabel">Varmekabel</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🪟 Materiale</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.coverMaterial ?? ""} onChange={(e) => updateSelectedProperty({ coverMaterial: e.target.value })}>
                        <option value="">Vælg…</option>
                        <option value="glas">Glas</option>
                        <option value="polycarbonat">Polycarbonat</option>
                        <option value="plastik">Plastik</option>
                        <option value="fiberdug">Fiberdug</option>
                        <option value="net">Net</option>
                        <option value="træ">Træ</option>
                        <option value="metal">Metal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">💨 Ventilation</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.ventilation ?? ""} onChange={(e) => updateSelectedProperty({ ventilation: e.target.value })}>
                        <option value="">Vælg…</option>
                        <option value="ingen">Ingen</option>
                        <option value="vinduer">Manuelle vinduer</option>
                        <option value="auto">Auto-åbnere</option>
                        <option value="åben-side">Åben side</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">❄️ Min. temperatur</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.minTemperature ?? ""} onChange={(e) => updateSelectedProperty({ minTemperature: e.target.value })}>
                        <option value="">Vælg…</option>
                        <option value="ubeskyttet">Ubeskyttet</option>
                        <option value="frostfri">Frostfri (&gt;0°)</option>
                        <option value="kølig">Kølig (&gt;5°)</option>
                        <option value="varm">Varm (&gt;10°)</option>
                        <option value="opvarmet">Opvarmet (&gt;15°)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🌬️ Læforhold</label>
                      <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.shelter ?? ""} onChange={(e) => updateSelectedProperty({ shelter: e.target.value })}>
                        <option value="">Vælg…</option>
                        <option value="åben">Åben</option>
                        <option value="delvis-læ">Delvis læ</option>
                        <option value="fuld-læ">Fuld læ</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🛡️ Beskyttelse</label>
                      <input className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.protectionAgainst ?? ""} onChange={(e) => updateSelectedProperty({ protectionAgainst: e.target.value })} placeholder="Fx frost, vind, skadedyr" />
                    </div>
                  </div>
                ) : null}

                  </div>
                ) : null}
              </div>
              );
            })() : null}

            {/* ── Condition-specific fields (per SubGroup) ── */}
            {selectedCategory === "condition" ? (() => {
              const props = selected.feature.properties ?? {};
              const summaryParts: string[] = [];
              if (props.intensity) summaryParts.push(props.intensity);
              if (props.conditionDesc) summaryParts.push(props.conditionDesc);
              if (selectedSubGroup === "climate" && props.timeOfDay) summaryParts.push(props.timeOfDay);
              return (
              <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                  onClick={() => setContentConditionFieldsOpen(!contentConditionFieldsOpen)}
                >
                  <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">{SUB_GROUP_LABELS[selectedSubGroup] ?? "⚡ Dyrkningsforhold"}</span>
                  <span className="text-[9px] text-foreground/30">·</span>
                  <span className="text-[11px] text-foreground/70 truncate flex-1">
                    {summaryParts.length > 0 ? summaryParts.join(", ") : "(ikke udfyldt)"}
                  </span>
                  <span className="text-[9px] text-foreground/30 shrink-0">{contentConditionFieldsOpen ? "▲" : "▼"}</span>
                </button>

                {contentConditionFieldsOpen ? (
                  <div className="px-2.5 pb-2.5 pt-1 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">📝 Beskrivelse</label>
                    <input className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.conditionDesc ?? ""} onChange={(e) => updateSelectedProperty({ conditionDesc: e.target.value })} placeholder="Fx morgen-skygge fra huset" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">📊 Intensitet</label>
                    <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.intensity ?? ""} onChange={(e) => updateSelectedProperty({ intensity: e.target.value })}>
                      <option value="">Ikke angivet</option>
                      <option value="svag">Svag</option>
                      <option value="middel">Middel</option>
                      <option value="stærk">Stærk</option>
                    </select>
                  </div>

                  {/* ── Soil-specific: link to Jordprofil ── */}
                  {selectedSubGroup === "soil" ? (
                    <div className="col-span-2">
                      {(() => {
                        const spId = props.soilProfileId;
                        const sp = spId ? getSoilProfileById(spId) : undefined;
                        return sp ? (
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-light/20 px-3 py-2 text-sm text-left hover:bg-accent-light/40 transition-colors"
                            onClick={() => setSoilPanelOpen(true)}
                          >
                            <span>🪨</span>
                            <span className="flex-1 truncate">
                              <span className="font-medium">{sp.name}</span>
                              {sp.baseType ? <span className="text-foreground/50 ml-1">({SOIL_BASE_TYPE_LABELS[sp.baseType]})</span> : null}
                            </span>
                            <span className="text-[10px] text-foreground/40">Rediger ▼</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="w-full rounded-lg border border-dashed border-foreground/20 px-3 py-2 text-xs text-foreground/50 hover:border-accent/40 hover:bg-accent-light/30 transition-colors"
                            onClick={() => setSoilPanelOpen(true)}
                          >
                            🪨 Tilknyt jordprofil for detaljer (pH, dræning, m.m.) ↓
                          </button>
                        );
                      })()}
                    </div>
                  ) : null}

                  {/* ── Climate-specific extra fields ── */}
                  {selectedSubGroup === "climate" ? (
                    <>
                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🕐 Tidspunkt</label>
                        <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.timeOfDay ?? ""} onChange={(e) => updateSelectedProperty({ timeOfDay: e.target.value })}>
                          <option value="">Vælg…</option>
                          <option value="morgen">Morgen</option>
                          <option value="eftermiddag">Eftermiddag</option>
                          <option value="hele-dagen">Hele dagen</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">📅 Sæson</label>
                        <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.season ?? ""} onChange={(e) => updateSelectedProperty({ season: e.target.value })}>
                          <option value="">Helårs</option>
                          <option value="forår">Forår</option>
                          <option value="sommer">Sommer</option>
                          <option value="efterår">Efterår</option>
                          <option value="vinter">Vinter</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🧭 Retning</label>
                        <select className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.conditionDirection ?? ""} onChange={(e) => updateSelectedProperty({ conditionDirection: e.target.value })}>
                          <option value="">Vælg…</option>
                          <option value="nord">Nord</option>
                          <option value="syd">Syd</option>
                          <option value="øst">Øst</option>
                          <option value="vest">Vest</option>
                          <option value="skiftende">Skiftende</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 uppercase tracking-wide">🔍 Kilde</label>
                        <input className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm" value={props.conditionSource ?? ""} onChange={(e) => updateSelectedProperty({ conditionSource: e.target.value })} placeholder="Fx nabobygning, stort egetræ" />
                      </div>
                    </>
                  ) : null}
                </div>
                  </div>
                ) : null}
              </div>
              );
            })() : null}

            {selectedGroupId ? (
              <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                  onClick={() => setGroupSectionOpen((o) => !o)}
                >
                  <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">👥 Gruppe</span>
                  <span className="text-[9px] text-foreground/30">·</span>
                  <span className="text-[11px] text-foreground/70 truncate flex-1">{groupRegistry[selectedGroupId]?.name ?? `(${selectedGroupId.slice(0, 6)})`} · {groupMemberCount} elem.</span>
                  <span className="text-[9px] text-foreground/30 shrink-0">{groupSectionOpen ? "▲" : "▼"}</span>
                </button>
                {groupSectionOpen ? (
                  <div className="px-2.5 pb-2.5 pt-1 space-y-2">
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

            {/* ══════════════════════════════════════════════════════════ */}
            {/* ── JORDPROFIL ── compact assign + link to Bibliotek     ── */}
            {/* ══════════════════════════════════════════════════════════ */}
            {(selectedCategory === "seedbed" || selectedCategory === "container" || (selectedCategory === "area" && selectedSubGroup !== "structure")) ? (() => {
              const profileId = selected.feature.properties?.soilProfileId;
              const profile = profileId ? getSoilProfileById(profileId) : undefined;
              void soilDataVersion;
              const allProfiles = loadSoilProfiles();

              return (
                <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                    onClick={() => setSoilPanelOpen(!soilPanelOpen)}
                  >
                    <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">🪨 Jordprofil</span>
                    {profile?.baseType ? (
                      <>
                        <span className="text-[9px] text-foreground/30">·</span>
                        <span className="text-[11px] text-foreground/70 truncate flex-1">{isStandardProfile(profile) ? profile.name : `${profile.name} (${SOIL_BASE_TYPE_LABELS[profile.baseType]})`}</span>
                      </>
                    ) : profile ? (
                      <span className="text-[11px] text-foreground/50 truncate flex-1">{profile.name}</span>
                    ) : (
                      <span className="text-[11px] text-foreground/40 italic truncate flex-1">(ingen profil)</span>
                    )}
                    <span className="text-[9px] text-foreground/30 shrink-0">{soilPanelOpen ? "▲" : "▼"}</span>
                  </button>

                  {soilPanelOpen ? (
                    <div className="px-3 pb-3 pt-1 space-y-2">
                      {/* Dropdown: assign soil type or custom profile */}
                      {(() => {
                        const stdProfiles = allProfiles.filter((p) => isStandardProfile(p));
                        const customProfiles = allProfiles.filter((p) => !isStandardProfile(p));
                        return (
                          <div>
                            <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Jordtype</label>
                            <select
                              className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs shadow-sm"
                              value={profileId ?? ""}
                              onChange={(e) => {
                                updateSelectedProperty({ soilProfileId: e.target.value || undefined });
                                setSoilDataVersion((v) => v + 1);
                              }}
                            >
                              <option value="">— Vælg jordtype —</option>
                              <optgroup label="Standard jordtyper">
                                {stdProfiles.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </optgroup>
                              {customProfiles.length > 0 ? (
                                <optgroup label="Tilpassede profiler">
                                  {customProfiles.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}{p.baseType ? ` (${SOIL_BASE_TYPE_LABELS[p.baseType]})` : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null}
                            </select>
                          </div>
                        );
                      })()}

                      {/* Soil recommendations */}
                      {profile ? (() => {
                        const recs = computeSoilRecommendations(profile);
                        return recs.length > 0 ? (
                          <div className="space-y-1">
                            <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Anbefalinger</label>
                            {recs.map((r, i) => (
                              <div
                                key={i}
                                className={`rounded-md px-2.5 py-2 text-xs leading-snug border ${
                                  r.priority === "warning"
                                    ? "border-red-300/40 bg-red-50/60 dark:border-red-500/20 dark:bg-red-900/10"
                                    : r.priority === "suggestion"
                                      ? "border-amber-300/40 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-900/10"
                                      : "border-green-300/40 bg-green-50/60 dark:border-green-500/20 dark:bg-green-900/10"
                                }`}
                              >
                                <span className="font-medium">{r.icon} {r.label}</span>
                                <p className="text-foreground/50 mt-0.5">{r.description}</p>
                              </div>
                            ))}
                          </div>
                        ) : null;
                      })() : null}

                      {/* Explanation */}
                      <p className="text-[10px] text-foreground/40 leading-snug">
                        💡 Jordtypen bestemmer startværdier for pH, dræning, tekstur m.m. Du kan oprette en <strong>tilpasset profil</strong> med egne målinger og eget navn herunder.
                      </p>

                      {/* Create custom profile */}
                      <button
                        type="button"
                        className="w-full rounded-md border border-dashed border-foreground/20 px-2 py-2 text-xs text-foreground/60 hover:border-accent/40 hover:bg-accent-light/30 transition-colors"
                        onClick={() => {
                          const featureName = selected.feature.properties?.name;
                          const baseT = profile?.baseType ?? "loam";
                          const bp = createProfileFromType(baseT, `${SOIL_BASE_TYPE_LABELS[baseT]} — ${featureName ?? "tilpasset"}`);
                          addOrUpdateSoilProfile(bp);
                          updateSelectedProperty({ soilProfileId: bp.id });
                          setSoilDataVersion((v) => v + 1);
                          setSoilEditReturnToContent(true);
                          setSidebarTab("plants");
                          setLibSubTab("soil");
                          setLibSoilEditId(bp.id);
                        }}
                      >
                        ✏️ Opret tilpasset jordprofil
                      </button>

                      {/* Link to edit in Bibliotek → Jord */}
                      {profile ? (
                        <button
                          type="button"
                          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-accent/30 bg-accent-light/20 px-2 py-2 text-xs font-medium text-accent-dark hover:bg-accent-light/40 transition-colors"
                          onClick={() => {
                            setSoilEditReturnToContent(true);
                            setSidebarTab("plants");
                            setLibSubTab("soil");
                            setLibSoilEditId(profile.id);
                          }}
                        >
                          🪨 Redigér &quot;{profile.name}&quot; i Bibliotek →
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })() : null}

            {/* ── Egne noter (collapsible: Tekst-noter + Foto) ── */}
            <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-foreground/[0.03] transition-colors"
                onClick={() => setContentNotesOpen(!contentNotesOpen)}
              >
                <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">📝 Egne noter</span>
                {/* Badge: show indicator if notes or photo exist */}
                {(draftNotes.trim() || selected.feature.properties?.photoUrl) ? (
                  <>
                    <span className="text-[9px] text-foreground/30">·</span>
                    <span className="text-[11px] text-foreground/70 truncate flex-1">Har indhold</span>
                  </>
                ) : (
                  <span className="text-[11px] text-foreground/40 italic truncate flex-1">(ingen noter)</span>
                )}
                <span className="text-[9px] text-foreground/30 shrink-0">{contentNotesOpen ? "▲" : "▼"}</span>
              </button>
              {contentNotesOpen ? (
                <div className="border-t border-foreground/10 px-3 py-2.5 space-y-3">
                  {/* Tekst-noter */}
                  <div>
                    <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">
                      {selectedIsInfra ? "Tekst" : "Tekst-noter"}
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

                  {/* Foto */}
                  <div>
                    <label className="block text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">📷 Foto</label>
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
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const url = await readImageAsDataURL(file);
                              if (url) updateSelectedProperty({ photoUrl: url });
                              else showToast("Foto må max være 2 MB", "error");
                            }}
                          />
                        </label>
                      </div>
                    ) : (
                      <label className="mt-1 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-foreground/15 bg-foreground/[0.02] px-3 py-3 cursor-pointer hover:border-accent/40 hover:bg-accent-light/10 transition-colors">
                        <span className="text-base">📷</span>
                        <span className="text-xs text-foreground/50">Tilføj foto (max 2 MB)</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const url = await readImageAsDataURL(file);
                            if (url) updateSelectedProperty({ photoUrl: url });
                            else showToast("Foto må max være 2 MB", "error");
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {selectedIsPoint ? (
              <p className="text-xs text-foreground/60">Tip: punkter kan være træ/busk/krukke.</p>
            ) : null}

            {selectedIsPolyline ? (
              <p className="text-xs text-foreground/60">Tip: linjer kan flyttes/redigeres i “Redigér/flyt”.</p>
            ) : null}

            <div className="pt-2 border-t border-border-light mt-2">
              <button
                type="button"
                className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
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
          <GroupsTab
            allGroups={allGroups}
            highlightedGroupId={highlightedGroupId}
            setHighlightedGroupId={setHighlightedGroupId}
            onFitGroupBounds={fitGroupBounds}
            selectFeatureById={selectFeatureById}
            dissolveGroupById={dissolveGroupById}
            removeFromGroupById={removeFromGroupById}
            renameGroup={renameGroup}
          />
        ) : null}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* ── PLANTER TAB ── Browse / search plant species database ─── */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {sidebarTab === "plants" ? (
          <PlantsTab
            allPlants={allPlants}
            libSubTab={libSubTab}
            setLibSubTab={setLibSubTab}
            libSoilEditId={libSoilEditId}
            setLibSoilEditId={setLibSoilEditId}
            soilEditReturnToContent={soilEditReturnToContent}
            setSoilEditReturnToContent={setSoilEditReturnToContent}
            soilDataVersion={soilDataVersion}
            setSoilDataVersion={setSoilDataVersion}
            setPlantInstancesVersion={setPlantInstancesVersion}
            selected={selected}
            selectedCategory={selectedCategory}
            setEditPlantSpeciesId={setEditPlantSpeciesId}
            setShowPlantEditor={setShowPlantEditor}
            setVarietyManagerSpeciesId={setVarietyManagerSpeciesId}
            setShowVarietyManager={setShowVarietyManager}
            setSidebarTab={setSidebarTab}
          />
        ) : null}

        {sidebarTab === "scan" ? (
          <ScanTab
            setPlantDataVersion={setPlantDataVersion}
            onNavigateToPlants={() => { setSidebarTab("plants"); setSidebarPanelOpen(true); }}
            trackActivity={trackActivity}
          />
        ) : null}

        {sidebarTab === "conflicts" ? (
          <ConflictsTab
            allConflicts={allConflicts}
            selectFeatureById={selectFeatureById}
            flashFeatureIds={flashFeatureIds}
            setSidebarTab={setSidebarTab}
            setSidebarPanelOpen={setSidebarPanelOpen}
          />
        ) : null}

        {/* ── Planlæg Tab (Opgaver + Årshjul + Noter) ── */}
        {sidebarTab === "tasks" ? (
          <PlanTab
            taskVersion={taskVersion}
            setTaskVersion={setTaskVersion}
            plantDataVersion={plantDataVersion}
            plantInstancesVersion={plantInstancesVersion}
            flashFeatureIds={flashFeatureIds}
            calendarData={memoCalendar}
            wateringAdvice={memoWateringAdvice}
            rotationPlan={memoRotationPlan}
            currentYear={memoCurrentYear}
            layoutForContainment={layoutForContainment}
            soilDataVersion={soilDataVersion}
            weatherData={weatherData}
            mapLat={mapRef.current?.getCenter()?.lat ?? 55.67}
            sunCasters={sunCastersRef.current}
            onNavigateToFeature={(gardenosId, feature) => {
              setSelected({ gardenosId, feature: feature as GardenFeature });
              setSidebarTab("content");
              setSidebarPanelOpen(true);
            }}
            onNavigateToSoilProfile={(soilId) => {
              setSidebarTab("plants");
              setLibSubTab("soil");
              setLibSoilEditId(soilId);
            }}
          />
        ) : null}
        {sidebarTab === "chat" ? (
          <ChatPanel
            weatherData={weatherData}
            weatherStats={weatherStats}
            weatherStatRange={weatherStatRange}
            onTaskCreated={() => setTaskVersion((v) => v + 1)}
          />
        ) : null}

        {/* ── Klima Tab ── */}
        {sidebarTab === "climate" ? (
          <ClimateTab
            weatherData={weatherData}
            weatherLoading={weatherLoading}
            weatherError={weatherError}
            weatherHistory={weatherHistory}
            weatherStatRange={weatherStatRange}
            setWeatherStatRange={setWeatherStatRange}
            weatherStats={weatherStats}
          />
        ) : null}

        {sidebarTab === "view" ? (
          <div className="mt-3 space-y-3">
            {/* ── Visning sub-tabs ── */}
            <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm flex-wrap">
              {(["steder", "baggrund", "synlighed", "ankre", "eksport"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
                    viewSubTab === st
                      ? (st === "ankre" ? "bg-orange-500 text-white shadow-sm" : st === "eksport" ? "bg-emerald-600 text-white shadow-sm" : "bg-accent text-white shadow-sm")
                      : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
                  }`}
                  onClick={() => setViewSubTab(st)}
                >
                  {st === "steder" ? "📍 Steder" : st === "baggrund" ? "🗺️ Baggrund" : st === "synlighed" ? "👁 Synlighed" : st === "ankre" ? "📌 Ankre" : "📤 Eksport"}
                  {st === "steder" && bookmarks.length > 0 ? ` ${bookmarks.length}` : ""}
                  {st === "ankre" && anchors.length > 0 ? ` ${anchors.length}` : ""}
                </button>
              ))}
            </div>

            {/* ── Sub-tab: Steder ── */}
            {viewSubTab === "steder" ? (
              <div className="space-y-3">
                {/* Address search inline with autocomplete */}
                <div>
                  <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">🔍 Adressesøgning</label>
                  <div className="relative">
                    <div className="flex gap-1">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          className="w-full rounded-lg border border-border pl-7 pr-2 py-1.5 text-xs placeholder:text-foreground/30 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10 transition-colors"
                          placeholder="Adresse, by eller sted…"
                          value={addressQuery}
                          onChange={(e) => { setAddressQuery(e.target.value); searchAddressDebounced(e.target.value); }}
                          onKeyDown={(e) => { if (e.key === "Enter") searchAddress(addressQuery); }}
                        />
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-foreground/30">📍</span>
                        {addressSearching && <span className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-[10px]">⏳</span>}
                      </div>
                      <button
                        type="button"
                        className="rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs text-accent-dark font-medium hover:bg-accent/20 transition-colors"
                        onClick={() => searchAddress(addressQuery)}
                      >
                        {addressSearching ? "…" : "Søg"}
                      </button>
                    </div>
                    {addressResults.length > 0 ? (
                      <div className="mt-1.5 rounded-lg border border-border bg-white overflow-hidden shadow-sm">
                        {addressResults.map((r, i) => {
                          const parts = r.display_name.split(",");
                          const mainName = parts[0].trim();
                          const subText = parts.slice(1, 3).map(s => s.trim()).join(", ");
                          return (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-border/30 last:border-b-0 hover:bg-accent/5 transition-colors group">
                              <button
                                type="button"
                                className="flex-1 text-left min-w-0"
                                onClick={() => {
                                  goToLocation(parseFloat(r.lat), parseFloat(r.lon));
                                  setAddressQuery(mainName);
                                }}
                              >
                                <div className="text-xs font-medium text-foreground/80 truncate group-hover:text-accent transition-colors">📍 {mainName}</div>
                                {subText && <div className="text-[10px] text-foreground/40 truncate">{subText}</div>}
                              </button>
                              <div className="shrink-0 flex items-center gap-1">
                                <button
                                  type="button"
                                  className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent-dark font-medium hover:bg-accent/20 transition-colors"
                                  onClick={() => {
                                    const lat = parseFloat(r.lat);
                                    const lon = parseFloat(r.lon);
                                    goToLocation(lat, lon);
                                    addBookmark(mainName, "📍", { lat, lon, zoom: 18 });
                                    setAddressResults([]);
                                  }}
                                  title={`Gem "${mainName}"`}
                                >
                                  + Gem
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 font-medium hover:bg-amber-100 transition-colors"
                                  onClick={() => {
                                    const lat = parseFloat(r.lat);
                                    const lon = parseFloat(r.lon);
                                    goToLocation(lat, lon);
                                    addBookmark(mainName, "📍", { lat, lon, zoom: 18 }, true);
                                    setAddressResults([]);
                                    setAddressQuery("");
                                  }}
                                  title={`Gem "${mainName}" som favorit i top-baren`}
                                >
                                  ⭐ Fastgør
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <div className="px-3 py-1.5 bg-foreground/[0.02] border-t border-border/30">
                          <p className="text-[9px] text-foreground/30 text-center">+ Gem = tilføj til steder · ⭐ Fastgør = vis i top-bar</p>
                        </div>
                      </div>
                    ) : addressQuery.trim().length >= 3 && !addressSearching ? (
                      <p className="mt-1.5 text-[10px] text-foreground/30 text-center">Skriv mere eller tryk Søg…</p>
                    ) : null}
                  </div>
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
                              <button type="button" className="text-[10px] text-accent" onClick={() => setEditingBookmarkId(null)} aria-label="Gem bogmærkenavn">✓</button>
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
                              <button type="button" className="text-[10px] text-orange-600" onClick={() => setEditingAnchorId(null)} aria-label="Gem ankernavn">✓</button>
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
                                showToast(`GPS-fejl: ${err.message}. Prøv at gå udenfor og tjek at lokationstilladelser er slået til.`, "error");
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
              <button
                type="button"
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                  showGrid
                    ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
                    : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
                }`}
                onClick={() => setShowGrid((v) => !v)}
              >
                📏 Gitter{showGrid ? " (aktiv)" : ""}
              </button>
              <button
                type="button"
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                  showSunMap
                    ? "border-amber-400 bg-amber-50 text-amber-800 shadow-sm"
                    : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
                }`}
                onClick={() => setShowSunMap((v) => !v)}
              >
                ☀️ Solkort{showSunMap ? " (aktiv)" : ""}
              </button>
              {showSunMap ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2 space-y-1.5">
                  <p className="text-[10px] font-semibold text-amber-700">Solkort – farveforklaring</p>
                  <div className="flex gap-1 items-center">
                    <div className="w-4 h-3 rounded-sm" style={{ background: sunHoursToColor(15, 0.7) }} />
                    <span className="text-[9px] text-foreground/60">Fuld sol (15t)</span>
                    <div className="w-4 h-3 rounded-sm ml-2" style={{ background: sunHoursToColor(10, 0.7) }} />
                    <span className="text-[9px] text-foreground/60">Delvis sol</span>
                    <div className="w-4 h-3 rounded-sm ml-2" style={{ background: sunHoursToColor(4, 0.7) }} />
                    <span className="text-[9px] text-foreground/60">Skygge</span>
                    <div className="w-4 h-3 rounded-sm ml-2" style={{ background: sunHoursToColor(0, 0.7) }} />
                    <span className="text-[9px] text-foreground/60">Dyb</span>
                  </div>
                  <p className="text-[9px] text-foreground/40 leading-tight">
                    Beregnet ud fra placerede træers og buskenes højde, solvinkel ved 56°N og sæsongennemsnit (april–september).
                  </p>
                </div>
              ) : null}
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
                      window.localStorage.setItem(userKey("gardenos:df:user"), v);
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
                      window.localStorage.setItem(userKey("gardenos:df:pass"), v);
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
                          const demoUser = process.env.NEXT_PUBLIC_DATAFORDELER_DEMO_USER || "";
                          const demoPass = process.env.NEXT_PUBLIC_DATAFORDELER_DEMO_PASS || "";
                          if (!demoUser || !demoPass) {
                            showToast("Demo-credentials er ikke konfigureret. Kontakt admin.", "error");
                            return;
                          }
                          setDfUser(demoUser);
                          setDfPass(demoPass);
                          setDfTestStatus("idle");
                          window.localStorage.setItem(userKey("gardenos:df:user"), demoUser);
                          window.localStorage.setItem(userKey("gardenos:df:pass"), demoPass);
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

            {/* ══════════════════════════════════════════════════════════ */}
            {/* ── EKSPORT SUB-TAB ──                                     */}
            {/* ══════════════════════════════════════════════════════════ */}
            {viewSubTab === "eksport" ? (() => {
              // Build plant rows for CSV / print
              const plantRows: ExportPlantRow[] = [];
              if (layoutForContainment?.features?.length) {
                for (const f of layoutForContainment.features) {
                  const props = (f as GardenFeature).properties;
                  const bedName = props?.name || props?.kind || "Ukendt bed";
                  const fId = props?.gardenosId;
                  if (!fId) continue;
                  const instances = getInstancesForFeature(fId);
                  for (const inst of instances) {
                    const sp = getPlantById(inst.speciesId);
                    const c: number = inst.count != null ? inst.count : 1;
                    const s: string = inst.season != null ? String(inst.season) : "";
                    plantRows.push({
                      bed: bedName,
                      species: sp?.name || inst.speciesId,
                      variety: inst.varietyName || "",
                      count: c,
                      plantedAt: inst.plantedAt || "",
                      season: s,
                      notes: inst.notes || "",
                    });
                  }
                }
              }
              const featureCount = layoutForContainment?.features?.length || 0;
              const uniqueSpecies = new Set(plantRows.map((r) => r.species)).size;

              return (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-foreground/80 mb-1">📤 Eksportér din have</h3>
                    <p className="text-[10px] text-foreground/50 leading-relaxed">
                      Download din haveplan som GeoJSON, CSV-planteoversigt, eller print en PDF-oversigt.
                    </p>
                  </div>

                  {/* Stats summary */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-border bg-foreground/[0.02] p-2 text-center">
                      <div className="text-lg font-bold text-accent">{featureCount}</div>
                      <div className="text-[9px] text-foreground/40 uppercase tracking-wide">Elementer</div>
                    </div>
                    <div className="rounded-lg border border-border bg-foreground/[0.02] p-2 text-center">
                      <div className="text-lg font-bold text-emerald-600">{plantRows.length}</div>
                      <div className="text-[9px] text-foreground/40 uppercase tracking-wide">Plantninger</div>
                    </div>
                    <div className="rounded-lg border border-border bg-foreground/[0.02] p-2 text-center">
                      <div className="text-lg font-bold text-blue-600">{uniqueSpecies}</div>
                      <div className="text-[9px] text-foreground/40 uppercase tracking-wide">Arter</div>
                    </div>
                  </div>

                  {/* Export buttons */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 hover:bg-emerald-100 hover:border-emerald-300 transition-all group"
                      onClick={() => exportGeoJSON(layoutForContainment, "gardenos-have")}
                    >
                      <span className="text-xl">🗺️</span>
                      <div className="flex-1 text-left">
                        <div className="text-xs font-semibold text-emerald-800">GeoJSON</div>
                        <div className="text-[10px] text-emerald-600/70">Komplet haveplan med alle elementer og geometrier</div>
                      </div>
                      <span className="text-emerald-400 group-hover:text-emerald-600 transition-colors text-xs">↓</span>
                    </button>

                    <button
                      type="button"
                      className="w-full flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 hover:bg-blue-100 hover:border-blue-300 transition-all group"
                      onClick={() => exportPlantCSV(plantRows, "gardenos-have")}
                      disabled={plantRows.length === 0}
                    >
                      <span className="text-xl">📊</span>
                      <div className="flex-1 text-left">
                        <div className={`text-xs font-semibold ${plantRows.length > 0 ? "text-blue-800" : "text-foreground/30"}`}>CSV Planteoversigt</div>
                        <div className={`text-[10px] ${plantRows.length > 0 ? "text-blue-600/70" : "text-foreground/25"}`}>
                          {plantRows.length > 0 ? `${plantRows.length} plantninger · åbn i Excel / Google Sheets` : "Ingen planter registreret"}
                        </div>
                      </div>
                      <span className="text-blue-400 group-hover:text-blue-600 transition-colors text-xs">↓</span>
                    </button>

                    <button
                      type="button"
                      className="w-full flex items-center gap-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 hover:bg-purple-100 hover:border-purple-300 transition-all group"
                      onClick={() => {
                        const weatherStr = weatherData
                          ? `Temperatur: ${weatherData.current.temperature}°C, Luftfugtighed: ${weatherData.current.humidity}%, Nedbør: ${weatherData.current.precipitation}mm`
                          : undefined;
                        printGardenSummary({
                          gardenName: "Min Have – GardenOS",
                          featureCount,
                          plantRows,
                          weatherSummary: weatherStr,
                        });
                      }}
                    >
                      <span className="text-xl">🖨️</span>
                      <div className="flex-1 text-left">
                        <div className="text-xs font-semibold text-purple-800">Print / PDF</div>
                        <div className="text-[10px] text-purple-600/70">Haveoversigt klar til print – åbner i nyt vindue</div>
                      </div>
                      <span className="text-purple-400 group-hover:text-purple-600 transition-colors text-xs">→</span>
                    </button>

                    <button
                      type="button"
                      className="w-full flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 hover:bg-amber-100 hover:border-amber-300 transition-all group"
                      onClick={async () => {
                        const ok = await copyShareLink(layoutForContainment);
                        if (ok) {
                          showToast("🔗 Delelink kopieret til udklipsholder!", "success");
                        } else {
                          showToast("❌ Kunne ikke kopiere link", "error");
                        }
                      }}
                    >
                      <span className="text-xl">🔗</span>
                      <div className="flex-1 text-left">
                        <div className="text-xs font-semibold text-amber-800">Del haveplan</div>
                        <div className="text-[10px] text-amber-600/70">Kopiér delelink til udklipsholder</div>
                      </div>
                      <span className="text-amber-400 group-hover:text-amber-600 transition-colors text-xs">📋</span>
                    </button>
                  </div>

                  <p className="text-[9px] text-foreground/30 text-center leading-relaxed">
                    GeoJSON kan importeres i QGIS, Google Earth og andre GIS-værktøjer.<br />
                    CSV-filen bruger semikolon (;) som separator og UTF-8 med BOM.
                  </p>
                </div>
              );
            })() : null}
          </div>
        ) : null}

        {sidebarTab === "journal" ? (
          <JournalTab
            journalVersion={journalVersion}
            setJournalVersion={setJournalVersion}
          />
        ) : null}

        {sidebarTab === "designs" ? (
          <DesignsTab
            savedDesigns={savedDesigns}
            setSavedDesigns={setSavedDesigns}
            designsLoading={designsLoading}
            setDesignsLoading={setDesignsLoading}
            designError={designError}
            setDesignError={setDesignError}
            designSaving={designSaving}
            setDesignSaving={setDesignSaving}
            designLoadedFlash={designLoadedFlash}
            setDesignLoadedFlash={setDesignLoadedFlash}
            userMaxDesigns={userMaxDesigns}
            setUserMaxDesigns={setUserMaxDesigns}
            activeDesignId={activeDesignId}
            setActiveDesignId={setActiveDesignId}
            setActiveDesignName={setActiveDesignName}
            getCurrentLayoutAndPlants={getCurrentLayoutAndPlants}
            applyDesignToMap={applyDesignToMap}
          />
        ) : null}
        </div>
        </div>{/* end inner wrapper */}
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

      {/* ── Toast Notification ── */}
      {toastMsg && (
        <div
          role="alert"
          aria-live="assertive"
          className={`fixed bottom-6 left-1/2 z-[10000] -translate-x-1/2 max-w-[90vw] md:max-w-lg rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm transition-all animate-in slide-in-from-bottom-4 duration-300 ${
            toastType === "error"   ? "border-red-400/40 bg-red-50/95 text-red-800 dark:bg-red-950/90 dark:text-red-200 dark:border-red-500/30"
          : toastType === "warning" ? "border-amber-400/40 bg-amber-50/95 text-amber-800 dark:bg-amber-950/90 dark:text-amber-200 dark:border-amber-500/30"
          : toastType === "success" ? "border-green-400/40 bg-green-50/95 text-green-800 dark:bg-green-950/90 dark:text-green-200 dark:border-green-500/30"
          :                          "border-blue-400/40 bg-blue-50/95 text-blue-800 dark:bg-blue-950/90 dark:text-blue-200 dark:border-blue-500/30"
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">
              {toastType === "error" ? "🚫" : toastType === "warning" ? "⚠️" : toastType === "success" ? "✅" : "ℹ️"}
            </span>
            <p className="text-xs leading-relaxed whitespace-pre-line flex-1">{toastMsg}</p>
            <button type="button" onClick={() => setToastMsg(null)} className="text-current/50 hover:text-current ml-1 text-sm leading-none" aria-label="Luk notifikation">✕</button>
          </div>
        </div>
      )}

      {/* ── Design Lab Overlay ── */}
      {showDesignLab && selected && selected.feature.geometry.type === "Polygon" ? (() => {
        const ring = (selected.feature as Feature<Polygon, GardenFeatureProperties>).geometry.coordinates[0] as [number, number][];
        const featureName = selected.feature.properties?.name ?? "Bed";

        // Gather plant instances linked to this bed
        const instances = getInstancesForFeature(selected.gardenosId);
        const designLabPlants = instances.map((inst) => {
          const sp = getPlantById(inst.speciesId);
          return {
            id: inst.id,
            speciesId: inst.speciesId,
            name: sp?.name ?? inst.speciesId,
            icon: sp?.icon ?? "🌱",
            count: inst.count ?? 1,
            spacingCm: sp?.spacingCm ?? 10,
            spreadCm: sp?.spreadDiameterCm ?? sp?.spacingCm ?? 10,
            rowSpacingCm: sp?.rowSpacingCm ?? 30,
            category: sp?.category,
            matureHeightM: sp?.matureHeightM,
            forestGardenLayer: sp?.forestGardenLayer,
          };
        });

        // Also include species from child rows (parentBedId)
        for (const f of layoutForContainment.features) {
          const props = (f as GardenFeature).properties;
          if (props?.parentBedId === selected.gardenosId && props?.speciesId) {
            // Check if already included
            if (!designLabPlants.some((p) => p.speciesId === props.speciesId)) {
              const sp = getPlantById(props.speciesId);
              const childInst = getInstancesForFeature(props.gardenosId);
              const totalCount = childInst.reduce((s, i) => s + (i.count ?? 1), 0);
              designLabPlants.push({
                id: props.gardenosId,
                speciesId: props.speciesId,
                name: sp?.name ?? props.speciesId,
                icon: sp?.icon ?? "🌱",
                count: totalCount || 1,
                spacingCm: sp?.spacingCm ?? 10,
                spreadCm: sp?.spreadDiameterCm ?? sp?.spacingCm ?? 10,
                rowSpacingCm: sp?.rowSpacingCm ?? 30,
                category: sp?.category,
                matureHeightM: sp?.matureHeightM,
                forestGardenLayer: sp?.forestGardenLayer,
              });
            }
          }
        }

        return (
          <DesignLab
            featureId={selected.gardenosId}
            featureName={featureName}
            ring={ring}
            plants={designLabPlants}
            onClose={() => setShowDesignLab(false)}
            onLayoutChange={(layout) => designLabLayoutChangeRef.current?.(layout)}
          />
        );
      })() : null}

      {/* ── User Settings Modal ── */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userEmail={sessionData?.user?.email}
        initialName={sessionData?.user?.name || ""}
      />

      {/* ── Guided Tour ── */}
      <GuidedTour
        storageKey={userKey("gardenos:tour")}
        forceStart={forceStartTour}
        onClose={() => setForceStartTour(false)}
      />
    </div>
  );
}
