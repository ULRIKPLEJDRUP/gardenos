"use client";

import type { Feature, FeatureCollection, Geometry, Polygon, Point, LineString } from "geojson";
import type L from "leaflet";
import { useMemo, useState } from "react";

// ── Plant types & helpers ──
import type {
  PlantSpecies,
  PlantCategory,
  PlacementType,
  ForestGardenLayer,
  MonthRange,
  PlantInstance,
} from "../lib/plantTypes";
import {
  PLANT_CATEGORY_LABELS,
  PLACEMENT_ICONS,
  getDefaultPlacements,
  canPlaceInCategory,
  canLayersCoexist,
  FOREST_GARDEN_LAYER_LABELS,
  FOREST_GARDEN_LAYER_DESC,
  GROWING_SEASON_SUN_HOURS,
  LIGHT_LABELS,
  WATER_LABELS,
  LIFECYCLE_LABELS,
  PLANT_FAMILY_LABELS,
  DIFFICULTY_LABELS,
} from "../lib/plantTypes";

// ── Plant store ──
import {
  getPlantById,
  getVarietiesForSpecies,
  getAllPlants,
  getInstancesForFeature,
  addPlantInstance,
  removePlantInstance,
  updatePlantInstance,
  checkCompanions,
  checkRotation,
  getPlantRecommendations,
  formatMonthRange,
  RECOMMENDATION_STRATEGY_LABELS,
  type CompanionCheck,
  type RecommendationStrategy,
} from "../lib/plantStore";

// ── Element catalogue ──
import {
  getInfraElementById,
  getInfraElementsForMode,
  ELEMENT_MODE_LABELS,
  ELEMENT_MODE_ICONS,
  type ElementModeKey,
} from "../lib/elementData";

// ── Soil ──
import {
  loadSoilProfiles,
  getSoilProfileById,
  addOrUpdateSoilProfile,
  createProfileFromType,
  isStandardProfile,
} from "../lib/soilStore";
import type { SoilProfile, SoilRecommendation } from "../lib/soilTypes";
import { PH_CATEGORY_LABELS, SOIL_BASE_TYPE_LABELS, computeSoilRecommendations } from "../lib/soilTypes";

// ── Conflict detection ──
import type { PlantConflict } from "../lib/conflictDetection";
import { haversineM } from "../lib/conflictDetection";

// ── Bed layout ──
import { getBedLayout } from "../lib/bedLayoutStore";
import type { BedLayout } from "../lib/bedLayoutTypes";

// ── Smart recommendations ──
import {
  getSmartRecommendations,
  SMART_STRATEGY_CONFIG,
} from "../lib/smartRecommendations";
import IconPicker from "./IconPicker";

// ---------------------------------------------------------------------------
// Types mirrored from GardenMapClient (module-level, not exported)
// ---------------------------------------------------------------------------

type KnownGardenFeatureKind =
  | "bed" | "row" | "pot" | "raised-bed"
  | "planter-box" | "balcony-box" | "grow-bag" | "barrel-planter" | "hanging-basket" | "trough" | "window-box"
  | "tree" | "bush" | "flower" | "plant"
  | "water" | "electric" | "lamp"
  | "water-pipe" | "water-hose" | "water-drip" | "water-tap" | "water-sprinkler" | "water-timer" | "water-barrel"
  | "electric-cable" | "electric-lv" | "electric-outlet" | "electric-junction" | "electric-panel" | "electric-solar"
  | "lamp-garden" | "lamp-spot" | "lamp-led-string" | "lamp-wall" | "lamp-solar" | "lamp-path" | "lamp-battery" | "lamp-flood"
  | "kitchen-garden" | "fruit-grove" | "front-garden" | "flower-garden" | "herb-garden" | "berry-garden"
  | "forest-garden" | "lawn" | "meadow" | "field" | "production-garden" | "playground" | "slope"
  | "house" | "shed" | "garage" | "terrace" | "patio" | "path-area" | "pond" | "stream"
  | "compost" | "woodpile" | "firepit" | "trampoline" | "sandbox" | "wall" | "parking" | "well"
  | "greenhouse" | "polytunnel" | "cold-frame" | "pergola" | "shade-sail" | "row-cover"
  | "cloche" | "netting" | "fence-enclosure" | "espalier" | "windbreak"
  | "clay-soil" | "sandy-soil" | "moist-soil" | "chalky-soil" | "acidic-soil" | "humus-soil"
  | "contaminated" | "rocky-soil" | "peat-soil" | "compacted"
  | "shade" | "partial-shade" | "wind" | "frost-pocket" | "wetland" | "dry-zone"
  | "heat-island" | "salt-exposure" | "erosion" | "deer-area" | "slug-zone" | "bird-damage";

export type GardenFeatureKind = KnownGardenFeatureKind | (string & {});

export type GardenFeatureCategory = "element" | "row" | "seedbed" | "container" | "area" | "condition";

export type KindGeometry = "point" | "polygon" | "polyline";

export type KindSubGroup = "plant" | "infra" | "default" | "zone" | "structure" | "cover" | "soil" | "climate";

export type KindDef = {
  kind: string;
  label: string;
  category: GardenFeatureCategory;
  geometry: KindGeometry;
  subGroup?: KindSubGroup;
};

export type GardenFeatureProperties = {
  gardenosId: string;
  category?: GardenFeatureCategory;
  kind?: GardenFeatureKind;
  name?: string;
  notes?: string;
  groupId?: string;
  groupName?: string;
  planted?: string;
  plantedAt?: string;
  sunNeed?: string;
  waterNeed?: string;
  speciesId?: string;
  varietyId?: string;
  varietyName?: string;
  elementTypeId?: string;
  customIcon?: string;
  soilProfileId?: string;
  parentBedId?: string;
  rowDirection?: "length" | "width";
  photoUrl?: string;
  sowingMethod?: string;
  bedSeason?: string;
  soilType?: string;
  fertilizer?: string;
  bedType?: string;
  wateringNeed?: string;
  drainage?: string;
  volume?: string;
  material?: string;
  placement?: string;
  winterProtection?: string;
  shelter?: string;
  sunlight?: string;
  orientation?: string;
  purpose?: string;
  structureMaterial?: string;
  structureHeight?: string;
  shadowDirection?: string;
  structureUse?: string;
  heating?: string;
  coverMaterial?: string;
  ventilation?: string;
  protectionAgainst?: string;
  minTemperature?: string;
  conditionDesc?: string;
  intensity?: string;
  soilPh?: string;
  soilDrainage?: string;
  soilDepth?: string;
  soilImproved?: string;
  timeOfDay?: string;
  season?: string;
  conditionDirection?: string;
  conditionSource?: string;
};

export type GardenFeature = Feature<Geometry, GardenFeatureProperties>;
export type GardenFeatureCollection = FeatureCollection<Geometry, GardenFeatureProperties>;

export type SelectedFeatureState = {
  gardenosId: string;
  feature: GardenFeature;
};

export type ContainmentCounts = {
  elements: number;
  containers: number;
  seedbeds: number;
  rows: number;
  areas: number;
  conditions: number;
  infra: number;
  total: number;
};

export type ContainmentResult = {
  countsByContainerId: Map<string, ContainmentCounts>;
  childIdsByContainerId: Map<string, string[]>;
};

export type GroupMeta = { name: string };
export type GroupRegistry = Record<string, GroupMeta>;

export type AutoRowResult = {
  rows: { coords: [number, number][]; lengthM: number; midpoint: [number, number] }[];
  bedWidthM: number;
  bedLengthM: number;
  rowSpacingCm: number;
  plantSpacingCm: number;
  edgeMarginCm: number;
  maxRows: number;
  occupiedSlots: number;
  totalSlots: number;
  warning: string | null;
  obstacleWarnings: string[];
};

export type Obstacle2D = {
  center: [number, number];
  radiusM: number;
  trunkRadiusM: number;
  label: string;
  layer?: ForestGardenLayer;
};

// ---------------------------------------------------------------------------
// KNOWN_KIND_DEFS – needed for selectedSubGroup memo
// ---------------------------------------------------------------------------
const KNOWN_KIND_DEFS: KindDef[] = [
  // ── Element (point) – planter ──
  { kind: "plant", label: "Plante", category: "element", geometry: "point", subGroup: "plant" },
  { kind: "tree", label: "Træ", category: "element", geometry: "point", subGroup: "plant" },
  { kind: "bush", label: "Busk", category: "element", geometry: "point", subGroup: "plant" },
  { kind: "flower", label: "Blomst", category: "element", geometry: "point", subGroup: "plant" },
  // ── Element (point) – infra ──
  { kind: "water", label: "Vand (generel)", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "water-pipe", label: "Vandrør", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "water-hose", label: "Haveslange", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "water-drip", label: "Drypvanding", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "water-tap", label: "Vandhane", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "water-sprinkler", label: "Sprinkler", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "water-timer", label: "Vandtimer", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "water-barrel", label: "Vandtønde", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "electric", label: "El (generel)", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "electric-cable", label: "Elkabel (230V)", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "electric-lv", label: "Lavvolt (12V)", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "electric-outlet", label: "Stikkontakt", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "electric-junction", label: "Samledåse", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "electric-panel", label: "Eltavle", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "electric-solar", label: "Solcelle", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp", label: "Lampe (generel)", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-garden", label: "Havelampe", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-spot", label: "Spotlampe", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-led-string", label: "LED lyskæde", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-wall", label: "Væglampe", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-solar", label: "Solcellelampe", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-path", label: "Stibelysning", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-battery", label: "Batterilampe", category: "element", geometry: "point", subGroup: "infra" },
  { kind: "lamp-flood", label: "Projektør", category: "element", geometry: "point", subGroup: "infra" },
  // ── Row (polyline) ──
  { kind: "row", label: "Række", category: "row", geometry: "polyline" },
  // ── Seedbed (polygon) ──
  { kind: "bed", label: "Såbed", category: "seedbed", geometry: "polygon" },
  // ── Container (polygon) ──
  { kind: "pot", label: "Krukke", category: "container", geometry: "polygon" },
  { kind: "raised-bed", label: "Højbed", category: "container", geometry: "polygon" },
  { kind: "planter-box", label: "Plantekasse", category: "container", geometry: "polygon" },
  { kind: "balcony-box", label: "Altankasse", category: "container", geometry: "polygon" },
  { kind: "grow-bag", label: "Gropose", category: "container", geometry: "polygon" },
  { kind: "barrel-planter", label: "Tønde", category: "container", geometry: "polygon" },
  { kind: "hanging-basket", label: "Ampel", category: "container", geometry: "polygon" },
  { kind: "trough", label: "Trug", category: "container", geometry: "polygon" },
  { kind: "window-box", label: "Vindueskarmen", category: "container", geometry: "polygon" },
  // ── Area – zone ──
  { kind: "kitchen-garden", label: "Køkkenhave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "fruit-grove", label: "Frugtlund", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "front-garden", label: "Forhave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "flower-garden", label: "Blomsterhave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "herb-garden", label: "Urtehave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "berry-garden", label: "Bærhave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "forest-garden", label: "Skovhave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "lawn", label: "Græsplæne", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "meadow", label: "Eng", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "field", label: "Mark", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "production-garden", label: "Produktionshave", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "playground", label: "Legeplads", category: "area", geometry: "polygon", subGroup: "zone" },
  { kind: "slope", label: "Skråning", category: "area", geometry: "polygon", subGroup: "zone" },
  // ── Area – structure ──
  { kind: "house", label: "Hus", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "shed", label: "Skur", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "garage", label: "Garage", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "terrace", label: "Terrasse", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "patio", label: "Patio", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "path-area", label: "Sti", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "pond", label: "Dam", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "stream", label: "Vandløb", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "compost", label: "Kompost", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "woodpile", label: "Brændestabel", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "firepit", label: "Bålplads", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "trampoline", label: "Trampolin", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "sandbox", label: "Sandkasse", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "wall", label: "Mur", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "parking", label: "Parkering", category: "area", geometry: "polygon", subGroup: "structure" },
  { kind: "well", label: "Brønd", category: "area", geometry: "polygon", subGroup: "structure" },
  // ── Area – cover ──
  { kind: "greenhouse", label: "Drivhus", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "polytunnel", label: "Polytunnel", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "cold-frame", label: "Koldbænk", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "pergola", label: "Pergola", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "shade-sail", label: "Solsejl", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "row-cover", label: "Fiberdug", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "cloche", label: "Glasklokke", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "netting", label: "Net", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "fence-enclosure", label: "Hegn/indhegning", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "espalier", label: "Espalier", category: "area", geometry: "polygon", subGroup: "cover" },
  { kind: "windbreak", label: "Læhegn", category: "area", geometry: "polygon", subGroup: "cover" },
  // ── Condition – soil ──
  { kind: "clay-soil", label: "Lerjord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "sandy-soil", label: "Sandjord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "moist-soil", label: "Fugtig jord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "chalky-soil", label: "Kalkjord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "acidic-soil", label: "Sur jord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "humus-soil", label: "Humusjord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "contaminated", label: "Forurenet jord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "rocky-soil", label: "Stenet jord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "peat-soil", label: "Tørvejord", category: "condition", geometry: "polygon", subGroup: "soil" },
  { kind: "compacted", label: "Kompakteret", category: "condition", geometry: "polygon", subGroup: "soil" },
  // ── Condition – climate ──
  { kind: "shade", label: "Skygge", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "partial-shade", label: "Halvskygge", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "wind", label: "Vindudsatte", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "frost-pocket", label: "Frostlomme", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "wetland", label: "Vådområde", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "dry-zone", label: "Tørezone", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "heat-island", label: "Varmeø", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "salt-exposure", label: "Saltpåvirkning", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "erosion", label: "Erosion", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "deer-area", label: "Hjorteområde", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "slug-zone", label: "Sneglezone", category: "condition", geometry: "polygon", subGroup: "climate" },
  { kind: "bird-damage", label: "Fugleskade", category: "condition", geometry: "polygon", subGroup: "climate" },
];

const CATEGORY_LABELS: Record<GardenFeatureCategory, string> = {
  element: "Element",
  row: "Række",
  seedbed: "Såbed",
  container: "Container",
  area: "Område",
  condition: "Særligt forhold",
};

const SUB_GROUP_LABELS: Partial<Record<KindSubGroup, string>> = {
  zone: "🌿 Havezoner",
  structure: "🏠 Bygninger & strukturer",
  cover: "🏡 Overdækninger & indhegninger",
  soil: "🪨 Jordforhold",
  climate: "🌤️ Klima & miljø",
};

const M_PER_DEG_LAT = 111_320;

type AutoElementResult = {
  positions: [number, number][];
  bedAreaM2: number;
  spacingCm: number;
  edgeMarginCm: number;
  maxElements: number;
  warning: string | null;
  obstacleWarnings: string[];
};

type RowObstacle2D = {
  coords: [number, number][];
  halfWidthM: number;
  label: string;
};

type OccupiedSlot = { offset: number; halfExclusion: number };

function CompanionChecksBlock({ checks }: { checks: CompanionCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-foreground/50">Samdyrkning</p>
      {checks.map((c, idx) => (
        <p key={idx} className={`text-xs ${c.type === "good" ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {c.type === "good" ? "✓" : "⚠"} {c.plantA.name} + {c.plantB.name}
          {c.type === "good" ? " — gode naboer" : " — dårlig kombination"}
        </p>
      ))}
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// ContentTabHelpers – functions passed from GardenMapClient
// ---------------------------------------------------------------------------

export type ContentTabHelpers = {
  CATEGORY_LABELS: Record<GardenFeatureCategory, string>;
  kindLabel: (kind: GardenFeatureKind | undefined) => string;
  kindForElementMode: (mode: string) => GardenFeatureKind;
  defaultKindForGeometry: (geometry: Geometry) => GardenFeatureKind;
  categoryForKind: (kind: GardenFeatureKind, geometry?: Geometry) => GardenFeatureCategory;
  readImageAsDataURL: (file: File) => Promise<string | null>;
  pointInRing: (point: [number, number], ring: [number, number][]) => boolean;
  polygonOuterRing: (feature: Feature<Polygon, GardenFeatureProperties>) => [number, number][];
  areaForPolygonFeature: (feature: Feature<Polygon, GardenFeatureProperties>) => number | null;
  formatAreaSquareMeters: (area: number) => string;
  haversineM: (a: [number, number], b: [number, number]) => number;
  computeAutoRows: (ring: [number, number][], rowSpacingCm: number, edgeMarginCm: number, requestedRows?: number, occupiedSlots?: OccupiedSlot[], direction?: "length" | "width", obstacles2D?: Obstacle2D[]) => AutoRowResult | null;
  computeAutoElements: (ring: [number, number][], spacingCm: number, edgeMarginCm: number, requestedCount: number, circleObstacles: Obstacle2D[], rowObstacles: RowObstacle2D[], newElementLayer?: ForestGardenLayer) => AutoElementResult | null;
  computeSmartEdgeMarginCm: (sp: { spreadDiameterCm?: number; spacingCm?: number; forestGardenLayer?: ForestGardenLayer; category?: string }) => number;
  detectExistingRowDirection: (ring: [number, number][], existingRows: [number, number][][]) => "length" | "width" | null;
  getExistingRowOffsetsInBed: (ring: [number, number][], existingRows: [number, number][][], direction?: "length" | "width", existingRowSpacingsCm?: number[]) => OccupiedSlot[];
  getFeatureExclusionRadiusM: (speciesId: string | undefined, elementTypeId: string | undefined) => { radiusM: number; trunkRadiusM: number; label: string };
  ensureDefaultProperties: (feature: GardenFeature) => GardenFeature;
  computeSoilRecommendations: (profile: SoilProfile) => SoilRecommendation[];
  makePlantInstance: (fields: Omit<PlantInstance, "id" | "plantedAt" | "season"> & { count?: number }) => PlantInstance;
  isPolygon: (feature: GardenFeature) => feature is Feature<Polygon, GardenFeatureProperties>;
  isPoint: (feature: GardenFeature) => feature is Feature<Point, GardenFeatureProperties>;
};

// ---------------------------------------------------------------------------
// ContentTabProps
// ---------------------------------------------------------------------------

export interface ContentTabProps {
  // ── Selection state ──
  selected: SelectedFeatureState | null;
  selectedCategory: string | undefined;
  selectedKind: GardenFeatureKind | undefined;
  selectedGeometry: KindGeometry | null;
  selectedIsPolygon: boolean;
  selectedIsPolyline: boolean;
  selectedIsPoint: boolean;
  selectedGroupId: string | undefined;

  // ── Data sources ──
  allPlants: PlantSpecies[];
  allKindDefs: KindDef[];
  allKindDefsIncludingHidden: KindDef[];
  allConflicts: PlantConflict[];
  containment: ContainmentResult;
  layoutForContainment: GardenFeatureCollection;
  groupRegistry: GroupRegistry;

  // ── Draft editing state ──
  draftName: string;
  setDraftName: (v: string) => void;
  draftNotes: string;
  setDraftNotes: (v: string) => void;
  plantInstancesVersion: number;
  setPlantInstancesVersion: React.Dispatch<React.SetStateAction<number>>;
  soilDataVersion: number;
  setSoilDataVersion: React.Dispatch<React.SetStateAction<number>>;
  plantDataVersion: number;

  // ── Species picker state (lifted) ──
  contentSpeciesOpen: boolean;
  setContentSpeciesOpen: (v: boolean) => void;
  speciesPickerSearch: string;
  setSpeciesPickerSearch: (v: string) => void;

  // ── Modal/panel openers ──
  setShowPlantEditor: (v: boolean) => void;
  setEditPlantSpeciesId: (v: string | null) => void;
  setShowVarietyManager: (v: boolean) => void;
  setVarietyManagerSpeciesId: (v: string | null) => void;
  setShowDesignLab: (v: boolean) => void;
  setSoilEditReturnToContent: (v: boolean) => void;
  setSidebarTab: (tab: "create" | "content" | "groups" | "plants" | "view" | "scan" | "chat" | "tasks" | "conflicts" | "designs" | "climate" | "journal") => void;
  setSidebarPanelOpen: (v: boolean) => void;
  setLibSubTab: (v: "plants" | "soil") => void;
  setLibSoilEditId: (v: string | null) => void;

  // ── Map ref ──
  featureGroupRef: React.RefObject<L.FeatureGroup | null>;

  // ── Callbacks ──
  selectFeatureById: (id: string) => void;
  deleteFeatureById: (id: string) => void;
  updateSelectedProperty: (patch: Record<string, unknown>) => void;
  commitDraftName: () => void;
  commitDraftNotes: () => void;
  executeAutoRowCreation: (
    speciesId: string,
    varietyId: string | null,
    count: number,
    edgeMarginCm: number,
    overrideSpacing: number | undefined,
    direction: "length" | "width",
  ) => void;
  executeAutoElementPlacement: (
    speciesId: string,
    varietyId: string | null,
    count: number,
    edgeMarginCm: number,
  ) => void;
  deleteAll: () => void;
  renameGroup: (gid: string, name: string) => void;
  removeFromGroupById: (id: string) => void;
  ungroupSelected: () => void;
  pushUndoSnapshot: () => void;
  showToast: (msg: string, type?: "success" | "error" | "warning" | "info") => void;
  setSelected: React.Dispatch<React.SetStateAction<SelectedFeatureState | null>>;
  setKindDefaultIcon: (kind: string, emoji: string) => void;
  rebuildFromGroupAndUpdateSelection: () => void;

  // ── Helper functions from parent ──
  helpers: ContentTabHelpers;
}

// ---------------------------------------------------------------------------
// ContentTab component
// ---------------------------------------------------------------------------

export function ContentTab({
  selected,
  selectedCategory,
  selectedKind,
  selectedGeometry,
  selectedIsPolygon,
  selectedIsPolyline,
  selectedIsPoint,
  selectedGroupId,
  allPlants,
  allKindDefs,
  allKindDefsIncludingHidden,
  allConflicts,
  containment,
  layoutForContainment,
  groupRegistry,
  draftName,
  setDraftName,
  draftNotes,
  setDraftNotes,
  plantInstancesVersion,
  setPlantInstancesVersion,
  soilDataVersion,
  setSoilDataVersion,
  plantDataVersion,
  contentSpeciesOpen,
  setContentSpeciesOpen,
  speciesPickerSearch,
  setSpeciesPickerSearch,
  setShowPlantEditor,
  setEditPlantSpeciesId,
  setShowVarietyManager,
  setVarietyManagerSpeciesId,
  setShowDesignLab,
  setSoilEditReturnToContent,
  setSidebarTab,
  setSidebarPanelOpen,
  setLibSubTab,
  setLibSoilEditId,
  featureGroupRef,
  selectFeatureById,
  deleteFeatureById,
  updateSelectedProperty,
  commitDraftName,
  commitDraftNotes,
  executeAutoRowCreation,
  executeAutoElementPlacement,
  deleteAll,
  renameGroup,
  removeFromGroupById,
  ungroupSelected,
  pushUndoSnapshot,
  showToast,
  setSelected,
  setKindDefaultIcon,
  rebuildFromGroupAndUpdateSelection,
  helpers,
}: ContentTabProps) {
  // =========================================================================
  // INTERNALIZED STATE
  // =========================================================================
  const [contentNameOpen, setContentNameOpen] = useState(false);
  const [contentNotesOpen, setContentNotesOpen] = useState(false);
  const [contentTypeOpen, setContentTypeOpen] = useState(false);
  const [contentContainsOpen, setContentContainsOpen] = useState(true);
  const [contentGrowingOpen, setContentGrowingOpen] = useState(false);
  const [contentPlantDetailsOpen, setContentPlantDetailsOpen] = useState(false);
  const [contentAreaFieldsOpen, setContentAreaFieldsOpen] = useState(false);
  const [contentConditionFieldsOpen, setContentConditionFieldsOpen] = useState(false);
  const [groupSectionOpen, setGroupSectionOpen] = useState(false);
  const [soilPanelOpen, setSoilPanelOpen] = useState(false);
  const [showBedPlantPicker, setShowBedPlantPicker] = useState(false);
  const [bedPlantSearch, setBedPlantSearch] = useState("");
  const [bedPickerSpeciesId, setBedPickerSpeciesId] = useState<string | null>(null);
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);

  // ── Auto-row state ──
  const [autoRowOpen, setAutoRowOpen] = useState(false);
  const [autoRowSpeciesId, setAutoRowSpeciesId] = useState<string | null>(null);
  const [autoRowVarietyId, setAutoRowVarietyId] = useState<string | null>(null);
  const [autoRowSearch, setAutoRowSearch] = useState("");
  const [autoRowCount, setAutoRowCount] = useState(0);
  const [autoRowEdgeMarginCm, setAutoRowEdgeMarginCm] = useState(10);
  const [autoRowDirection, setAutoRowDirection] = useState<"length" | "width">("length");

  // ── Auto-element state ──
  const [autoElementOpen, setAutoElementOpen] = useState(false);
  const [autoElementSpeciesId, setAutoElementSpeciesId] = useState<string | null>(null);
  const [autoElementVarietyId, setAutoElementVarietyId] = useState<string | null>(null);
  const [autoElementSearch, setAutoElementSearch] = useState("");
  const [autoElementCount, setAutoElementCount] = useState(0);
  const [autoElementEdgeMarginCm, setAutoElementEdgeMarginCm] = useState(15);

  // ── Recommendation state ──
  const [recRowOpen, setRecRowOpen] = useState(false);
  const [recRowStrategies, setRecRowStrategies] = useState<RecommendationStrategy[]>([]);
  const [recElemOpen, setRecElemOpen] = useState(false);
  const [recElemStrategies, setRecElemStrategies] = useState<RecommendationStrategy[]>([]);

  // =========================================================================
  // INTERNALIZED MEMOS
  // =========================================================================

  const selectedFeatureId = selected?.feature.properties?.gardenosId ?? "";

  /** Resolve SubGroup of the currently selected feature */
  const selectedSubGroup = useMemo<KindSubGroup>(() => {
    const k = selectedKind as string | undefined;
    if (!k) return "default";
    const def = KNOWN_KIND_DEFS.find((d) => d.kind === k);
    return (def?.subGroup ?? "default") as KindSubGroup;
  }, [selectedKind]);

  /** Plant instances attached to the selected feature, enriched with species data */
  const selectedFeatureInstances = useMemo(() => {
    if (!selected) return [] as (PlantInstance & { species?: PlantSpecies })[];
    void plantInstancesVersion;
    return getInstancesForFeature(selectedFeatureId).map((inst) => ({
      ...inst,
      species: getPlantById(inst.speciesId),
    }));
  }, [selected, selectedFeatureId, plantInstancesVersion]);

  /** Companion planting checks for the selected feature */
  const selectedCompanionChecks = useMemo(() => {
    if (!selected) return [] as CompanionCheck[];
    void plantInstancesVersion;
    return checkCompanions(selectedFeatureId);
  }, [selected, selectedFeatureId, plantInstancesVersion]);

  /** Rotation warnings for the selected feature */
  const selectedRotationWarnings = useMemo(() => {
    if (!selected) return [] as { plant: PlantSpecies; lastSeason: number; minYears: number }[];
    void plantInstancesVersion;
    return checkRotation(selectedFeatureId, new Date().getFullYear());
  }, [selected, selectedFeatureId, plantInstancesVersion]);

  /** Filtered plant list for the bed plant picker */
  const bedPlantResults = useMemo(() => {
    const featureCat = selected?.feature.properties?.category ?? "";
    let list = allPlants;
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

  /** Number of features in the selected group */
  const groupMemberCount = useMemo(() => {
    if (!selectedGroupId || !layoutForContainment?.features?.length) return 0;
    return layoutForContainment.features.filter(
      (f) => (f as GardenFeature).properties?.groupId === selectedGroupId,
    ).length;
  }, [selectedGroupId, layoutForContainment]);

  /** Members of the selected group, sorted by category then label */
  const selectedGroupMembers = useMemo(() => {
    if (!selectedGroupId || !layoutForContainment?.features?.length) return [] as { id: string; label: string }[];
    const catOrder: Record<string, number> = { area: 0, seedbed: 1, row: 2, container: 3, element: 4, condition: 5 };
    const items = layoutForContainment.features
      .filter((f) => (f as GardenFeature).properties?.groupId === selectedGroupId)
      .map((f) => {
        const gf = f as GardenFeature;
        const name = (gf.properties?.name ?? "").trim();
        const kindLbl = helpers.kindLabel(gf.properties?.kind);
        const cat = (gf.properties?.category ?? "element") as string;
        return { id: gf.properties?.gardenosId ?? "", label: name ? `${kindLbl}: ${name}` : kindLbl, sortCat: catOrder[cat] ?? 4, sortLabel: kindLbl.toLowerCase() };
      });
    items.sort((a, b) => a.sortCat - b.sortCat || a.sortLabel.localeCompare(b.sortLabel, "da") || a.label.localeCompare(b.label, "da"));
    return items;
  }, [selectedGroupId, layoutForContainment, groupRegistry, helpers]);

  /** Parent feature that spatially contains the selected feature */
  const selectedParentFeature = useMemo(() => {
    if (!selected) return null;
    const myId = selected.gardenosId;
    const parentBedId = selected.feature.properties?.parentBedId;
    if (parentBedId) {
      const pf = layoutForContainment.features.find((f) => (f as GardenFeature).properties?.gardenosId === parentBedId) as GardenFeature | undefined;
      if (pf) {
        const cat = pf.properties?.category ?? "";
        const catLabel = helpers.CATEGORY_LABELS[cat as GardenFeatureCategory] ?? cat;
        return { id: parentBedId, name: pf.properties?.name ?? catLabel, category: cat };
      }
    }
    for (const [containerId, childIds] of containment.childIdsByContainerId) {
      if (childIds.includes(myId)) {
        const pf = layoutForContainment.features.find((f) => (f as GardenFeature).properties?.gardenosId === containerId) as GardenFeature | undefined;
        if (pf) {
          const cat = pf.properties?.category ?? "";
          const catLabel = helpers.CATEGORY_LABELS[cat as GardenFeatureCategory] ?? cat;
          return { id: containerId, name: pf.properties?.name ?? catLabel, category: cat };
        }
      }
    }
    return null;
  }, [selected, containment, layoutForContainment, helpers]);

  /** Area text for polygon containers/areas/seedbeds */
  const selectedContainerAreaText = useMemo(() => {
    if (!selected || !selectedIsPolygon) return "";
    if (selectedCategory !== "container" && selectedCategory !== "area" && selectedCategory !== "condition" && selectedCategory !== "seedbed") return "";
    const area = helpers.areaForPolygonFeature(selected.feature as Feature<Polygon, GardenFeatureProperties>);
    if (area == null) return "";
    return helpers.formatAreaSquareMeters(area);
  }, [selected, selectedCategory, selectedIsPolygon, helpers]);

  /** Row length in metres (LineString only) */
  const selectedRowLengthM = useMemo(() => {
    if (!selected || selectedCategory !== "row") return 0;
    const geom = selected.feature.geometry;
    if (geom.type !== "LineString") return 0;
    const coords = geom.coordinates as [number, number][];
    let total = 0;
    for (let i = 1; i < coords.length; i++) total += helpers.haversineM(coords[i - 1], coords[i]);
    return total;
  }, [selected, selectedCategory, helpers]);

  /** Containment counts for the selected feature */
  const selectedContainment = useMemo(() => {
    if (!selected) return null;
    return containment.countsByContainerId.get(selected.gardenosId) ?? null;
  }, [containment, selected]);

  /** Preview of items contained within the selected polygon feature */
  const selectedContainedItemsPreview = useMemo(() => {
    if (!selected) return [] as { id: string; text: string }[];
    const ids = containment.childIdsByContainerId.get(selected.gardenosId) ?? [];
    if (!layoutForContainment?.features?.length || ids.length === 0) return [];

    const byId = new Map(
      layoutForContainment.features
        .map((f) => helpers.ensureDefaultProperties(f as GardenFeature))
        .map((f) => [f.properties!.gardenosId, f]),
    );

    const catOrder: Record<string, number> = { area: 0, seedbed: 1, row: 2, container: 3, element: 4, condition: 5 };
    const out: { id: string; text: string; sortCat: number; sortLabel: string }[] = [];
    for (const id of ids) {
      const f = byId.get(id);
      if (!f) continue;
      const name = (f.properties?.name ?? "").trim();
      const label = helpers.kindLabel(f.properties?.kind);
      const cat = (f.properties?.category ?? "element") as string;
      out.push({ id, text: name ? `${label}: ${name}` : label, sortCat: catOrder[cat] ?? 4, sortLabel: label.toLowerCase() });
    }
    out.sort((a, b) => a.sortCat - b.sortCat || a.sortLabel.localeCompare(b.sortLabel, "da") || a.text.localeCompare(b.text, "da"));
    return out;
  }, [containment.childIdsByContainerId, layoutForContainment, selected, helpers]);

  /** Kind defs allowed for the selected feature's geometry */
  const allowedKindDefsForSelected = useMemo(() => {
    if (!selected) return [] as KindDef[];
    const wantedGeometry: KindGeometry =
      selectedGeometry ?? (helpers.isPolygon(selected.feature) ? "polygon" : helpers.isPoint(selected.feature) ? "point" : "polyline");
    return allKindDefsIncludingHidden.filter((d) => d.geometry === wantedGeometry);
  }, [allKindDefsIncludingHidden, selected, selectedGeometry, helpers]);

  /** Effective kind considering default-for-geometry fallback */
  const effectiveSelectedKind = useMemo(() => {
    if (!selected) return undefined;
    return selectedKind ?? helpers.defaultKindForGeometry(selected.feature.geometry);
  }, [selected, selectedKind, helpers]);

  /** KindDef map (kind lowercase → KindDef) derived from allKindDefs */
  const kindDefByKind = useMemo(() => {
    return new Map(allKindDefs.map((d) => [d.kind.toLowerCase(), d]));
  }, [allKindDefs]);

  /** Resolved KindDef for the effective selected kind */
  const selectedKindDef = useMemo(() => {
    if (!effectiveSelectedKind) return undefined;
    return kindDefByKind.get(String(effectiveSelectedKind).toLowerCase());
  }, [effectiveSelectedKind, kindDefByKind]);

  /** Whether the selected element is infrastructure (water/electric/lamp/polyline) */
  const selectedIsInfra = (selectedKindDef?.subGroup ?? "default") === "infra" || selectedIsPolyline;


  // =========================================================================
  // JSX
  // =========================================================================
  if (!selected) {
    return (
      <p className="mt-4 text-sm text-muted text-center">
        Vælg noget på kortet for at se og redigere indhold.
      </p>
    );
  }

  const draftNameDirty = draftName !== (selected.feature.properties?.name ?? "");
  const draftNotesDirty = draftNotes !== (selected.feature.properties?.notes ?? "");

  return (
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
                        const defaultKind = helpers.kindForElementMode(opt.mode);
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
                value={selectedKind ?? helpers.defaultKindForGeometry(selected.feature.geometry)}
                onChange={(e) => {
                  const nextKind = e.target.value as GardenFeatureKind;
                  updateSelectedProperty({ kind: nextKind, category: helpers.categoryForKind(nextKind, selected.feature.geometry) });
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
                        addPlantInstance(helpers.makePlantInstance({
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
                          addPlantInstance(helpers.makePlantInstance({
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
                          addPlantInstance(helpers.makePlantInstance({
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
                        addPlantInstance(helpers.makePlantInstance({
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
                          addPlantInstance(helpers.makePlantInstance({
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
                          addPlantInstance(helpers.makePlantInstance({
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
            ? helpers.polygonOuterRing(selected.feature as Feature<Polygon, GardenFeatureProperties>)
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
                if (helpers.pointInRing(mid, bedRingForCount)) bedRowFeatures.push(f);
                continue;
              }
              // Collect point features (markers / bushes / trees / infra elements)
              if (f.geometry?.type === "Point" && (f.properties?.speciesId || f.properties?.elementTypeId)) {
                const pt = (f.geometry as Point).coordinates as [number, number];
                if (helpers.pointInRing(pt, bedRingForCount)) bedPointFeatures.push(f);
              }
            }
          }
          const existingRowCount = bedRowFeatures.length;

          // ── Detect existing row direction and lock toggle ──
          const existingRowCoords = bedRowFeatures.map((f) => (f.geometry as LineString).coordinates as [number, number][]);
          const detectedDirection = bedRingForCount && bedRingForCount.length >= 3
            ? helpers.detectExistingRowDirection(bedRingForCount, existingRowCoords)
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
            const occupiedSlots = helpers.getExistingRowOffsetsInBed(ring, existingRowCoords, effectiveDirection, existingSpacings);

            // Add point/bush exclusion zones: project each point onto the shortDir axis
            // and create occupied slots with the bush's exclusion radius.
            if (bedPointFeatures.length > 0) {
              const midLat = ring.reduce((s: number, p: [number, number]) => s + p[1], 0) / ring.length;
              const midLng = ring.reduce((s: number, p: [number, number]) => s + p[0], 0) / ring.length;
              const mpLat = M_PER_DEG_LAT;
              const mpLng = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
              const mRing: [number, number][] = ring.map(([lng, lat]: [number, number]) => [(lng - midLng) * mpLng, (lat - midLat) * mpLat]);
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
                  const excl1D = helpers.getFeatureExclusionRadiusM(pf.properties?.speciesId, pf.properties?.elementTypeId);
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
              const excl = helpers.getFeatureExclusionRadiusM(pf.properties?.speciesId, pf.properties?.elementTypeId);
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
                if (!helpers.pointInRing(pt, bedRingForCount)) continue;
                const excl = helpers.getFeatureExclusionRadiusM(undefined, f.properties.elementTypeId);
                if (excl) {
                  obstacles2D.push({ center: pt, radiusM: excl.radiusM, trunkRadiusM: excl.trunkRadiusM, label: excl.label });
                }
              }
            }

            preview = helpers.computeAutoRows(ring, rowSpCm, autoRowEdgeMarginCm, autoRowCount, occupiedSlots, effectiveDirection, obstacles2D);
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
            ? helpers.polygonOuterRing(selected.feature as Feature<Polygon, GardenFeatureProperties>)
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
                if (helpers.pointInRing(mid, bedRingForPreview)) bedRowFeatures.push(f);
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
              const excl = helpers.getFeatureExclusionRadiusM(pf.properties?.speciesId, pf.properties?.elementTypeId);
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

            elementPreview = helpers.computeAutoElements(bedRingForPreview, spacingCm, autoElementEdgeMarginCm, autoElementCount, circleObs, rowObs, selectedSpecies.forestGardenLayer);
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
                                  const smartMargin = helpers.computeSmartEdgeMarginCm(rec.species);
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
                          if (sp) setAutoElementEdgeMarginCm(helpers.computeSmartEdgeMarginCm(sp));
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
                              feature: helpers.ensureDefaultProperties({
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
                const recs = helpers.computeSoilRecommendations(profile);
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
                      const url = await helpers.readImageAsDataURL(file);
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
                    const url = await helpers.readImageAsDataURL(file);
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
  );
}
