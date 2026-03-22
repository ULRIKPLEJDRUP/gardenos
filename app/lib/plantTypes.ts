// ---------------------------------------------------------------------------
// GardenOS – Plant Knowledge System – Type Definitions
// ---------------------------------------------------------------------------
// Architecture: "Plant Species" (the database) vs "Plant Instance" (what's
// actually planted in a specific bed/row on the map).
// ---------------------------------------------------------------------------

/** Top-level plant categories */
export type PlantCategory =
  | "vegetable"
  | "fruit"
  | "herb"
  | "flower"
  | "tree"
  | "bush"
  | "perennial"
  | "grass"
  | "climber"
  | "cover-crop"
  | "soil-amendment";

export const PLANT_CATEGORY_LABELS: Record<PlantCategory, string> = {
  vegetable: "Grøntsager",
  fruit: "Frugt & bær",
  herb: "Urter",
  flower: "Blomster",
  tree: "Træer",
  bush: "Buske",
  perennial: "Stauder",
  grass: "Græsser",
  climber: "Klatreplanter",
  "cover-crop": "Dækafgrøder",
  "soil-amendment": "Jordforbedrere",
};

// ---------------------------------------------------------------------------
// Forest Garden Layers (Skovhavens 7 lag)
// ---------------------------------------------------------------------------
/** The 7 classic forest garden layers + "row" for row-planted annuals */
export type ForestGardenLayer =
  | "canopy"       // 1. Kronelag – store træer (valnød, kastanje, store æbler)
  | "sub-canopy"   // 2. Lavt trælag – mindre frugttræer (blomme, kvæde, små pærer)
  | "shrub"        // 3. Busklag – bærbuske (solbær, ribs, hindbær)
  | "herbaceous"   // 4. Urte-/staudelag – flerårige urter og grøntsager (rabarber, purløg)
  | "ground-cover" // 5. Bunddække – lave planter (jordbær, kløver, timian)
  | "root"         // 6. Rodlag – planter med spiselige rødder (jordskokker, løg)
  | "climber";     // 7. Klatrelag – vokser op ad strukturer (vin, humle, kiwi)

export const FOREST_GARDEN_LAYER_LABELS: Record<ForestGardenLayer, string> = {
  canopy: "🌳 Kronelag",
  "sub-canopy": "🌲 Lavt trælag",
  shrub: "🫐 Busklag",
  herbaceous: "🌿 Urte-/staudelag",
  "ground-cover": "☘️ Bunddække",
  root: "🥕 Rodlag",
  climber: "🌱 Klatrelag",
};

/** Short descriptions for each forest garden layer */
export const FOREST_GARDEN_LAYER_DESC: Record<ForestGardenLayer, string> = {
  canopy: "Store træer der danner havens struktur og mikro-klima (valnød, kastanje, store æbler)",
  "sub-canopy": "Mindre frugttræer der udnytter filtreret lys (blomme, kvæde, kirsebær)",
  shrub: "Bærbuske der fylder mellem træerne (solbær, ribs, hindbær, aronia)",
  herbaceous: "Flerårige urter og stauder under buskene (rabarber, purløg, mynte, skovsyre)",
  "ground-cover": "Lave planter der dækker jorden og reducerer ukrudt (jordbær, kløver, timian)",
  root: "Planter med spiselige rødder der udnytter jordens dybde (løg, hvidløg, jordskokker)",
  climber: "Klatreplanter der udnytter vertikal plads (vin, humle, kiwi, bønner)",
};

/**
 * Vertical layer order (0 = highest, 6 = lowest).
 * Used to determine if two layers can coexist in the same horizontal space.
 */
export const FOREST_GARDEN_LAYER_ORDER: Record<ForestGardenLayer, number> = {
  canopy: 0,
  "sub-canopy": 1,
  shrub: 2,
  herbaceous: 3,
  "ground-cover": 4,
  root: 5,
  climber: 6, // climbers use vertical space, special rules
};

/**
 * Can two forest garden layers coexist at the same horizontal location?
 * Returns true if they occupy DIFFERENT vertical spaces and can share ground.
 *
 * Rules:
 * - Canopy + anything below = YES (tree crowns are high above)
 * - Sub-canopy + shrub/herbaceous/ground-cover/root = YES
 * - Shrub + ground-cover/root = YES (bush canopy is above ground layer)
 * - Shrub + herbaceous = NO (compete at same height)
 * - Herbaceous + ground-cover = borderline YES (herbs grow above ground-cover)
 * - Herbaceous + root = YES (different parts of soil column)
 * - Climber + anything = YES (uses vertical structures, not horizontal ground)
 * - Same layer + same layer = NO (compete directly)
 */
export function canLayersCoexist(a: ForestGardenLayer, b: ForestGardenLayer): boolean {
  if (a === b) return false; // same layer always competes

  // Climbers can always coexist (they grow upward)
  if (a === "climber" || b === "climber") return true;

  // Sort so 'upper' is higher (lower order number)
  const [upper, lower] = FOREST_GARDEN_LAYER_ORDER[a] < FOREST_GARDEN_LAYER_ORDER[b] ? [a, b] : [b, a];

  // Canopy above everything
  if (upper === "canopy") return true;

  // Sub-canopy above shrub, herbaceous, ground-cover, root
  if (upper === "sub-canopy") return true;

  // Shrub above ground-cover and root (not herbaceous — they compete)
  if (upper === "shrub" && (lower === "ground-cover" || lower === "root")) return true;

  // Herbaceous above ground-cover or root
  if (upper === "herbaceous" && (lower === "ground-cover" || lower === "root")) return true;

  // Ground-cover above root
  if (upper === "ground-cover" && lower === "root") return true;

  return false;
}

/** Vegetable sub-categories */
export type VegetableSubCategory =
  | "root"
  | "brassica"
  | "legume"
  | "leafy"
  | "nightshade"
  | "cucurbit"
  | "allium"
  | "other";

export const VEGETABLE_SUB_LABELS: Record<VegetableSubCategory, string> = {
  root: "Rodfrugter",
  brassica: "Kål",
  legume: "Bælgfrugter",
  leafy: "Bladgrønt",
  nightshade: "Natskyggefamilien",
  cucurbit: "Græskarfamilien",
  allium: "Løgfamilien",
  other: "Øvrige",
};

/** Light requirements */
export type LightNeed = "full-sun" | "partial-shade" | "shade";

export const LIGHT_LABELS: Record<LightNeed, string> = {
  "full-sun": "Fuld sol",
  "partial-shade": "Halvskygge",
  shade: "Skygge",
};

/** Water requirements */
export type WaterNeed = "low" | "medium" | "high";

export const WATER_LABELS: Record<WaterNeed, string> = {
  low: "Lav",
  medium: "Middel",
  high: "Høj",
};

/** Soil type preferences */
export type SoilType = "sandy" | "loamy" | "clay" | "chalky" | "peaty" | "any";

export const SOIL_LABELS: Record<SoilType, string> = {
  sandy: "Sandjord",
  loamy: "Muld/lerjord",
  clay: "Lerjord",
  chalky: "Kalkjord",
  peaty: "Tørvejord",
  any: "Alle jordtyper",
};

/** Lifecycle */
export type Lifecycle = "annual" | "biennial" | "perennial";

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  annual: "Etårig",
  biennial: "Toårig",
  perennial: "Flerårig",
};

/** Month range (1–12) for sowing / planting / harvesting windows */
export type MonthRange = { from: number; to: number };

/** Plant family – used for crop rotation logic */
export type PlantFamily =
  | "solanaceae"
  | "brassicaceae"
  | "fabaceae"
  | "cucurbitaceae"
  | "apiaceae"
  | "asteraceae"
  | "amaryllidaceae"
  | "poaceae"
  | "lamiaceae"
  | "rosaceae"
  | "ranunculaceae"
  | "saxifragaceae"
  | "paeoniaceae"
  | "iridaceae"
  | "geraniaceae"
  | "asparagaceae"
  | "asphodelaceae"
  | "dryopteridaceae"
  | "boraginaceae"
  | "cyperaceae"
  | "araliaceae"
  | "aristolochiaceae"
  | "cannabaceae"
  | "caprifoliaceae"
  | "vitaceae"
  | "fagaceae"
  | "betulaceae"
  | "salicaceae"
  | "sapindaceae"
  | "oleaceae"
  | "ulmaceae"
  | "pinaceae"
  | "cupressaceae"
  | "taxaceae"
  | "tiliaceae"
  | "juglandaceae"
  | "polygonaceae"
  | "elaeagnaceae"
  | "adoxaceae"
  | "moraceae"
  | "caryophyllaceae"
  | "urticaceae"
  | "malvaceae"
  | "crassulaceae"
  | "campanulaceae"
  | "amaranthaceae"
  | "montiaceae"
  | "other";

export const PLANT_FAMILY_LABELS: Record<PlantFamily, string> = {
  solanaceae: "Natskyggefamilien",
  brassicaceae: "Korsblomstfamilien",
  fabaceae: "Ærteblomstfamilien",
  cucurbitaceae: "Græskarfamilien",
  apiaceae: "Skærmplantefamilien",
  asteraceae: "Kurvblomstfamilien",
  amaryllidaceae: "Løgfamilien",
  poaceae: "Græsfamilien",
  lamiaceae: "Læbeblomstfamilien",
  rosaceae: "Rosenfamilien",
  ranunculaceae: "Ranunkelfamilien",
  saxifragaceae: "Stenbrækfamilien",
  paeoniaceae: "Pæonfamilien",
  iridaceae: "Irisfamilien",
  geraniaceae: "Storkenæbfamilien",
  asparagaceae: "Aspargesfamilien",
  asphodelaceae: "Affodillfamilien",
  dryopteridaceae: "Bregnefamilien",
  boraginaceae: "Rubladfamilien",
  cyperaceae: "Halvgræsfamilien",
  araliaceae: "Vedbendfamilien",
  aristolochiaceae: "Sølvranke-familien",
  cannabaceae: "Hampefamilien",
  caprifoliaceae: "Gedebladfamilien",
  vitaceae: "Vinfamilien",
  fagaceae: "Bøgefamilien",
  betulaceae: "Birkefamilien",
  salicaceae: "Pilefamilien",
  sapindaceae: "Ahornfamilien",
  oleaceae: "Olivenfamilien",
  ulmaceae: "Elmefamilien",
  pinaceae: "Fyrrfamilien",
  cupressaceae: "Cypressfamilien",
  taxaceae: "Taksfamilien",
  tiliaceae: "Lindefamilien",
  juglandaceae: "Valndødfamilien",
  polygonaceae: "Skedeknæfamilien",
  elaeagnaceae: "Sølvbladfamilien",
  adoxaceae: "Desmerfamilien",
  moraceae: "Morbærfamilien",
  caryophyllaceae: "Nellikefamilien",
  urticaceae: "Nældefamilien",
  malvaceae: "Katostfamilien",
  crassulaceae: "Stenurtfamilien",
  campanulaceae: "Klokkefamilien",
  amaranthaceae: "Amarantfamilien",
  montiaceae: "Portulakfamilien",
  other: "Anden",
};

// ---------------------------------------------------------------------------
// Plant Variety / Cultivar – a specific sort of a species
// ---------------------------------------------------------------------------
export type PlantVariety = {
  /** Unique id within the species, e.g. "nantes" */
  id: string;
  /** Display name, e.g. "Nantes 2" */
  name: string;
  /** Optional description of what makes this variety special */
  description?: string;
  /** Days from sowing to harvest (overrides species if set) */
  daysToHarvest?: number;
  /** Override species spacing if different */
  spacingCm?: number;
  /** Sowing depth in cm (overrides species if set) */
  sowDepthCm?: number;
  /** Taste / flavour profile */
  taste?: string;
  /** Colour of fruit/root/flower */
  color?: string;
  /** Resistances (e.g. "meldug", "gulerodsflue") */
  resistances?: string[];
  /** Good for storage? */
  storageQuality?: "poor" | "fair" | "good" | "excellent";
  /** Source / seed supplier */
  seedSource?: string;

  // ── Extended fields (variety management) ──
  /** Image URL of the variety */
  imageUrl?: string;
  /** Source URL (website where info was found) */
  sourceUrl?: string;
  /** How this variety was added to the database */
  addedVia?: "manual" | "scrape" | "seed-packet" | "plant-photo" | "builtin";
  /** Free-form notes */
  notes?: string;
  /** Sowing start month (1-12) */
  sowStart?: number;
  /** Sowing end month (1-12) */
  sowEnd?: number;
  /** Harvest start month (1-12) */
  harvestStart?: number;
  /** Harvest end month (1-12) */
  harvestEnd?: number;
  /** Height in cm */
  heightCm?: number;
  /** Yield description */
  yieldInfo?: string;
};

// ---------------------------------------------------------------------------
// Nutrition info – per 100 g raw edible portion
// ---------------------------------------------------------------------------
export type NutritionInfo = {
  /** Kilocalories per 100 g */
  kcal: number;
  /** Protein in grams per 100 g */
  proteinG: number;
  /** Fat in grams per 100 g */
  fatG: number;
  /** Carbohydrates in grams per 100 g */
  carbG: number;
  /** Dietary fibre in grams per 100 g */
  fiberG?: number;
  /** Free-text highlights (vitamins, minerals, antioxidants) */
  highlights?: string;
};

/** Difficulty level for growing */
export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Nem",
  medium: "Mellem",
  hard: "Svær",
};

// ---------------------------------------------------------------------------
// Plant Species – the "knowledge record"
// ---------------------------------------------------------------------------
export type PlantSpecies = {
  /** Unique slug identifier, e.g. "tomat" */
  id: string;
  /** Danish common name */
  name: string;
  /** Latin / botanical name (optional) */
  latinName?: string;
  /** Primary category */
  category: PlantCategory;
  /** Sub-category (mostly for vegetables) */
  subCategory?: VegetableSubCategory;
  /** Botanical family for crop rotation */
  family?: PlantFamily;

  // ── Growing info ──
  lifecycle?: Lifecycle;
  /** Indoor sowing window */
  sowIndoor?: MonthRange;
  /** Direct sow outdoor window */
  sowOutdoor?: MonthRange;
  /** Transplant / plant-out window */
  plantOut?: MonthRange;
  /** Harvest window */
  harvest?: MonthRange;

  // ── Space requirements ──
  /** Plant spacing in cm */
  spacingCm?: number;
  /** Row spacing in cm */
  rowSpacingCm?: number;
  /** Root depth in cm */
  rootDepthCm?: number;
  /**
   * Mature spread / canopy diameter in cm.
   * Used for 2D obstacle exclusion when placed as point features in beds.
   * Other rows/features must stay outside this circle.
   * If not set, falls back to spacingCm.
   */
  spreadDiameterCm?: number;

  /**
   * Mature height in metres.
   * Used to calculate shadow length and shade impact on neighbouring plants.
   * Trees typically 5–25 m, bushes 1–5 m, perennials < 2 m.
   */
  matureHeightM?: number;

  /**
   * Forest garden layer (skovhave-lag).
   * Determines vertical placement and which layers can coexist.
   * See canLayersCoexist() for interaction rules.
   */
  forestGardenLayer?: ForestGardenLayer;

  // ── Environmental needs ──
  light?: LightNeed;
  water?: WaterNeed;
  soil?: SoilType[];
  /** Preferred pH range */
  phRange?: { min: number; max: number };
  /** Minimum temperature °C for outdoor growth */
  minTempC?: number;
  /** Hardy to frost? */
  frostHardy?: boolean;

  // ── Sowing / germination details ──
  /** Sowing depth in cm */
  sowDepthCm?: number;
  /** Days from sowing to germination */
  germinationDays?: { min: number; max: number };
  /** Soil temperature range for germination (°C) */
  germinationTempC?: { min: number; max: number };
  /** Season preference (cool-season vs warm-season crop) */
  seasonType?: "cool" | "warm";
  /** Days from sowing/planting to harvest (species average) */
  daysToHarvest?: number;

  // ── Companion planting ──
  /** IDs of good companion plants */
  goodCompanions?: string[];
  /** IDs of bad companion plants */
  badCompanions?: string[];

  // ── Crop rotation ──
  /** Years before replanting same family */
  rotationYears?: number;

  // ── Varieties / cultivars ──
  /** Known varieties of this species */
  varieties?: PlantVariety[];

  // ── Extended knowledge (progressive disclosure) ──
  /** Difficulty level */
  difficulty?: Difficulty;
  /** Taste / flavour profile (general for species) */
  taste?: string;
  /** Culinary uses, recipe ideas, pairings */
  culinaryUses?: string;
  /** Detailed harvest tips (how to know when ready, technique) */
  harvestTips?: string;
  /** Soil improvement recommendations */
  soilAmendments?: string;
  /** Fertilizer type and schedule */
  fertilizerInfo?: string;
  /** Common pests */
  pests?: string[];
  /** Common diseases */
  diseases?: string[];
  /** Storage / preservation tips */
  storageInfo?: string;
  /** Structured nutrition data per 100 g raw */
  nutrition?: NutritionInfo;

  // ── Presentation ──
  /** Emoji icon for quick visual identification */
  icon?: string;
  /** Short description / growing tips */
  description?: string;

  // ── Placement logic ──
  /** Override auto-detected placements. If empty/undefined, getDefaultPlacements() is used. */
  allowedPlacements?: PlacementType[];

  // ── Metadata ──
  /** Data source (manual, import, ai) */
  source?: "manual" | "import" | "ai" | "builtin";
  /** Last update ISO date */
  updatedAt?: string;

  // ── Traits ──
  /**
   * Is the plant edible (any part: leaves, roots, flowers, fruit, seeds)?
   * For categories 'vegetable', 'fruit', and 'herb' this is assumed true.
   * Set explicitly for perennials, trees, bushes, flowers, cover-crops etc.
   * that happen to be edible.
   */
  edible?: boolean;
};

/**
 * Returns true if a plant species is edible.
 * Vegetables, fruits, and herbs are always considered edible.
 * Other categories require an explicit `edible: true` flag.
 */
export function isEdiblePlant(species: PlantSpecies): boolean {
  if (species.edible !== undefined) return species.edible;
  return species.category === "vegetable"
    || species.category === "fruit"
    || species.category === "herb";
}

// ---------------------------------------------------------------------------
// Plant Instance – what's actually planted in a bed/row on the map
// ---------------------------------------------------------------------------

/** Where a plant can be placed on the map */
export type PlacementType = "element" | "row" | "seedbed" | "container";

export const PLACEMENT_LABELS: Record<PlacementType, string> = {
  element: "Element (enkelt plante)",
  row: "Række",
  seedbed: "Såbed",
  container: "Container / krukke",
};

export const PLACEMENT_ICONS: Record<PlacementType, string> = {
  element: "📍",
  row: "📏",
  seedbed: "🌱",
  container: "🪴",
};

/**
 * Smart default placements based on plant characteristics.
 * Rules:
 * - Trees → element only (single points on map)
 * - Bushes → element only
 * - Perennial vegetables (artiskok, rabarber) → element, container
 * - Root vegetables → row, seedbed (classic row or broadcast sowing)
 * - Legumes → row, seedbed
 * - Leafy greens → row, seedbed, container
 * - Brassica (kål) → row, element (large plants)
 * - Nightshades (tomat, peber) → row, element, container (often staked individually)
 * - Cucurbits (squash, agurk) → element, row (need space)
 * - Alliums (løg, hvidløg) → row, seedbed
 * - Herbs → seedbed, row, container, element
 * - Flowers → element, row, seedbed
 * - Cover crops → seedbed, row
 * - Fruit → element, container
 */
export function getDefaultPlacements(species: PlantSpecies): PlacementType[] {
  // If the species has explicit overrides, use those
  if (species.allowedPlacements && species.allowedPlacements.length > 0) {
    return species.allowedPlacements;
  }

  const { category, subCategory, lifecycle } = species;

  // Trees are always individual elements
  if (category === "tree") return ["element"];
  // Bushes are always individual elements
  if (category === "bush") return ["element"];

  // Fruit (berry bushes, fruit trees) – mainly element
  if (category === "fruit") return ["element", "container"];

  // Cover crops are broadcast-sown
  if (category === "cover-crop" || category === "soil-amendment") return ["seedbed", "row"];

  // Herbs – flexible
  if (category === "herb") return ["seedbed", "row", "container", "element"];

  // Flowers – flexible
  if (category === "flower") return ["element", "row", "seedbed", "container"];

  // Vegetables: sub-category matters
  if (category === "vegetable") {
    // Perennial vegetables (artiskok, rabarber) are big, individual
    if (lifecycle === "perennial") return ["element", "container"];

    switch (subCategory) {
      case "root":     return ["row", "seedbed"]; // gulerødder, rødbeder, radiser
      case "legume":   return ["row", "seedbed"]; // ærter, bønner
      case "leafy":    return ["row", "seedbed", "container"]; // salat, spinat
      case "allium":   return ["row", "seedbed"]; // løg, hvidløg, porrer
      case "brassica": return ["row", "element"]; // kål – store planter i rækker
      case "nightshade": return ["row", "element", "container"]; // tomat, peber
      case "cucurbit": return ["element", "row"]; // squash, græskar, agurk
      default:         return ["row", "seedbed", "element", "container"];
    }
  }

  // Fallback – allow everything
  return ["element", "row", "seedbed", "container"];
}

/** Check if a plant species can be placed in a given feature category */
export function canPlaceInCategory(
  species: PlantSpecies,
  featureCategory: string,
): boolean {
  // Areas can hold anything (they're containers of beds)
  if (featureCategory === "area") return true;
  const allowed = getDefaultPlacements(species);
  return allowed.includes(featureCategory as PlacementType);
}

/** Get the recommended (primary) placement for a species */
export function getPrimaryPlacement(species: PlantSpecies): PlacementType {
  return getDefaultPlacements(species)[0];
}

export type PlantInstance = {
  /** Unique instance id */
  id: string;
  /** Reference to PlantSpecies.id */
  speciesId: string;
  /** Reference to PlantVariety.id (optional — specific cultivar) */
  varietyId?: string;
  /** Display name of the variety (stored for offline display) */
  varietyName?: string;
  /** The gardenosId of the feature (bed/row/area) it's planted in */
  featureId: string;
  /** How many plants */
  count?: number;
  /** Date planted (ISO) */
  plantedAt?: string;
  /** Date harvested (ISO) */
  harvestedAt?: string;
  /** Growing season year */
  season?: number;
  /** Notes */
  notes?: string;
};

// ---------------------------------------------------------------------------
// Bed history – for crop rotation tracking
// ---------------------------------------------------------------------------
export type BedSeasonRecord = {
  featureId: string;
  season: number;
  plantInstanceIds: string[];
};

// ---------------------------------------------------------------------------
// Shadow / Shade analysis utilities
// ---------------------------------------------------------------------------
// Used by conflict detection to determine whether a tree or tall bush casts
// enough shadow on a neighbouring sun-loving plant to cause problems.
//
// Approach:
//   1. Compute sun altitude (elevation angle) for a given latitude, day-of-year,
//      and hour using standard solar position equations.
//   2. Shadow length = treeHeight / tan(sunAltitude).
//   3. Shadow direction = opposite of sun azimuth.
//   4. Sample multiple hours during the growing season (April–September for DK)
//      and determine how many hours of shade a target point receives.
//   5. Compare to the target plant's light requirement.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

/**
 * Solar declination angle (radians) for a given day of year.
 * Cooper's equation: δ = 23.45° × sin(360/365 × (284 + n))
 */
function solarDeclination(dayOfYear: number): number {
  return 23.45 * DEG * Math.sin(((360 / 365) * (284 + dayOfYear)) * DEG);
}

/**
 * Solar altitude (elevation) angle in radians.
 * @param latRad - latitude in radians
 * @param decl - solar declination in radians
 * @param hourAngle - hour angle in radians (0 = solar noon, 15°/hr)
 */
function solarAltitude(latRad: number, decl: number, hourAngle: number): number {
  const sinAlt =
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt)));
}

/**
 * Solar azimuth angle in radians (0 = North, clockwise).
 * @param latRad - latitude in radians
 * @param decl - solar declination in radians
 * @param hourAngle - hour angle in radians
 * @param altitude - solar altitude in radians
 */
function solarAzimuth(latRad: number, decl: number, hourAngle: number, altitude: number): number {
  const cosAz =
    (Math.sin(decl) - Math.sin(latRad) * Math.sin(altitude)) /
    (Math.cos(latRad) * Math.cos(altitude));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  // If hour angle > 0 (afternoon), azimuth is in the western half
  if (hourAngle > 0) az = 2 * Math.PI - az;
  return az;
}

/**
 * Estimate the number of sun-hours a given point receives per day in the
 * growing season, considering shade cast by a single tree/bush.
 *
 * @returns An object with estimated shade hours during peak growing season
 *   and whether the shade is significant enough to affect a sun-loving plant.
 */
export type ShadeAnalysis = {
  /** Average shade hours per day during growing season (Apr–Sep) */
  avgShadeHoursPerDay: number;
  /** Peak shade hours (worst month, typically June when canopy is full) */
  peakShadeHours: number;
  /** Shadow length in metres at solar noon on midsummer */
  shadowLengthMidsummerM: number;
  /** Shadow length in metres at solar noon on equinox */
  shadowLengthEquinoxM: number;
  /** The direction shadow falls at noon (degrees from North, clockwise) */
  shadowDirectionNoon: number;
  /** Detailed: for each sampled month, hours of shade */
  monthlyShadeHours: number[];
};

/**
 * Compute how much shade a tree at position `treePos` casts on a target
 * point `targetPos`, considering solar geometry for the given latitude.
 *
 * @param treeHeightM - mature height of the tree in metres
 * @param canopyRadiusM - canopy radius in metres
 * @param distanceM - distance between tree trunk and target in metres
 * @param bearingTreeToTarget - bearing from tree to target in degrees (0=N, 90=E)
 * @param latitudeDeg - garden latitude in degrees
 * @returns ShadeAnalysis with shade hours and severity assessment
 */
export function computeShadeImpact(
  treeHeightM: number,
  canopyRadiusM: number,
  distanceM: number,
  bearingTreeToTarget: number,
  latitudeDeg: number,
): ShadeAnalysis {
  const latRad = latitudeDeg * DEG;
  const targetBearingRad = bearingTreeToTarget * DEG;

  // Sample representative days: 15th of each month Apr(4)–Sep(9)
  // Day-of-year for the 15th of month m (1-indexed): ~(m-1)*30.4 + 15
  const sampleMonths = [4, 5, 6, 7, 8, 9]; // growing season
  const monthlyShadeHours: number[] = [];
  let totalShade = 0;

  for (const month of sampleMonths) {
    const doy = Math.round((month - 1) * 30.4 + 15);
    const decl = solarDeclination(doy);

    let shadeHours = 0;

    // Sample each hour from 6:00 to 20:00 solar time (14 hours)
    for (let hour = 6; hour <= 20; hour += 0.5) {
      const hourAngle = (hour - 12) * 15 * DEG; // 15°/hour from noon
      const alt = solarAltitude(latRad, decl, hourAngle);

      // Sun below horizon → no direct sun anyway
      if (alt <= 0) continue;

      const az = solarAzimuth(latRad, decl, hourAngle, alt);

      // Shadow falls opposite to sun direction
      const shadowDir = (az + Math.PI) % (2 * Math.PI); // radians
      const shadowLength = treeHeightM / Math.tan(alt);

      // Effective shadow reach = shadow length + canopy radius
      // (the canopy edge extends the shadow zone)
      const effectiveReach = shadowLength + canopyRadiusM;

      // Check if the target point is within the shadow cone
      // The shadow width at any ground point is approximately the canopy diameter
      // (the sun is essentially a parallel light source for tree-scale objects)
      const shadowWidthAtTarget = canopyRadiusM * 2;

      // Angular difference between shadow direction and tree→target bearing
      let angleDiff = Math.abs(shadowDir - targetBearingRad);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

      // The target is in shadow if:
      // 1. Distance to target < effective shadow reach
      // 2. Angular alignment is close (within the shadow's angular width)
      const angularWidthAtDist = Math.atan2(shadowWidthAtTarget / 2, distanceM);

      if (distanceM <= effectiveReach && angleDiff <= angularWidthAtDist) {
        shadeHours += 0.5; // half-hour step
      }
    }

    monthlyShadeHours.push(shadeHours);
    totalShade += shadeHours;
  }

  const avgShadeHoursPerDay = totalShade / sampleMonths.length;
  const peakShadeHours = Math.max(...monthlyShadeHours);

  // Shadow lengths at key dates
  const midsummerDecl = solarDeclination(172); // ~June 21
  const midsummerNoonAlt = solarAltitude(latRad, midsummerDecl, 0);
  const shadowLengthMidsummerM = midsummerNoonAlt > 0 ? treeHeightM / Math.tan(midsummerNoonAlt) : 999;

  const equinoxDecl = solarDeclination(80); // ~March 21
  const equinoxNoonAlt = solarAltitude(latRad, equinoxDecl, 0);
  const shadowLengthEquinoxM = equinoxNoonAlt > 0 ? treeHeightM / Math.tan(equinoxNoonAlt) : 999;

  // Shadow direction at noon on midsummer (always roughly North in Northern hemisphere)
  const midsummerNoonAz = solarAzimuth(latRad, midsummerDecl, 0, midsummerNoonAlt);
  const shadowDirectionNoon = ((midsummerNoonAz + Math.PI) % (2 * Math.PI)) / DEG;

  return {
    avgShadeHoursPerDay,
    peakShadeHours,
    shadowLengthMidsummerM,
    shadowLengthEquinoxM,
    shadowDirectionNoon,
    monthlyShadeHours,
  };
}

/**
 * Determine the minimum sun hours a plant needs based on its light requirement.
 */
export function minSunHoursForLight(light: LightNeed | undefined): number {
  switch (light) {
    case "full-sun": return 6;       // needs 6+ hours direct sun
    case "partial-shade": return 3;  // 3–6 hours
    case "shade": return 0;          // tolerates full shade
    default: return 4;               // assume moderate if not specified
  }
}

/**
 * Maximum shade hours per day a plant tolerates before it's a problem.
 * This is the direct trigger threshold — if avgShadeHoursPerDay exceeds this,
 * a shade conflict is raised.
 *
 * At ~56°N in growing season (Apr–Sep), there are roughly 10–17 usable sun hours.
 * Full-sun crops (tomatoes, potatoes, peppers) suffer noticeably with even 2–3 h
 * of midday shade; partial-shade plants tolerate up to ~5 h.
 */
export function maxAcceptableShadeHours(light: LightNeed | undefined): number {
  switch (light) {
    case "full-sun": return 2;       // >2 h shade = problematic
    case "partial-shade": return 4;  // >4 h shade = reduced yield for berry bushes etc.
    case "shade": return 999;        // shade-tolerant — never triggers
    default: return 3;               // unknown → moderate threshold
  }
}

/**
 * Danish growing-season day-length at ~56°N: about 17h in June, 12h in Apr/Sep.
 * Average ≈ 15h of potential sun between 6:00–21:00.
 * Returns approximate sun hours available per day in growing season.
 */
export const GROWING_SEASON_SUN_HOURS = 15;

/**
 * Quick heuristic: does a tree/bush of given height at given distance
 * likely cause shade problems for a full-sun plant?
 * Useful for fast filtering before doing full ShadeAnalysis.
 */
export function couldCastSignificantShade(
  treeHeightM: number,
  distanceM: number,
  latitudeDeg: number = 55.7,
): boolean {
  // At equinox noon at 56°N, sun altitude ≈ 34°, shadow = height / tan(34°) ≈ 1.48 × height
  // At midsummer noon at 56°N, sun altitude ≈ 57.5°, shadow ≈ 0.63 × height
  // Morning/evening shadows are MUCH longer (3-10× height)
  // Rule: potential shade zone ≈ 2.5 × height (accounts for morning/evening)
  const maxShadeReach = treeHeightM * 2.5;
  return distanceM < maxShadeReach;
}

/**
 * Estimate a fallback matureHeightM from category/layer when not explicitly set.
 */
export function estimateHeightM(species: PlantSpecies): number | null {
  if (species.matureHeightM) return species.matureHeightM;

  // Derive from forest garden layer
  switch (species.forestGardenLayer) {
    case "canopy": return 15;      // large trees
    case "sub-canopy": return 6;   // smaller fruit trees
    case "shrub": return 2.5;      // bushes
    default: break;
  }

  // Derive from category
  switch (species.category) {
    case "tree": return 10;
    case "bush": return 2;
    case "fruit": return 3;        // berry bushes etc.
    default: return null;           // not a shade-caster
  }
}
