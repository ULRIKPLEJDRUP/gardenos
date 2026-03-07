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
  | "cover-crop"
  | "soil-amendment";

export const PLANT_CATEGORY_LABELS: Record<PlantCategory, string> = {
  vegetable: "Grøntsager",
  fruit: "Frugt & bær",
  herb: "Urter",
  flower: "Blomster",
  tree: "Træer",
  bush: "Buske",
  "cover-crop": "Dækafgrøder",
  "soil-amendment": "Jordforbedrere",
};

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

  // ── Metadata ──
  /** Data source (manual, import, ai) */
  source?: "manual" | "import" | "ai" | "builtin";
  /** Last update ISO date */
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// Plant Instance – what's actually planted in a bed/row on the map
// ---------------------------------------------------------------------------
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
