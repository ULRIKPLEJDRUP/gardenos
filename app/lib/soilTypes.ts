// ---------------------------------------------------------------------------
// GardenOS – Soil Profile System – Type Definitions
// ---------------------------------------------------------------------------
// A SoilProfile describes the soil at a specific location (bed, area, etc.).
// Profiles are stored independently and referenced by features via soilProfileId.
//
// Data is organised into categories, each at a "knowledge level":
//   Level 1 — All gardeners (look & touch)
//   Level 2 — Enthusiasts (pH-strips / vinegar test, ~10-50 kr)
//   Level 3 — Soil nerds (lab analysis)
//
// Future: Plants will reference preferred soil types for recommendations.
// ---------------------------------------------------------------------------

// ═══════════════════════════════════════════════════════════════════════════
// 1. Jordtype (Level 1) — basic classification
// ═══════════════════════════════════════════════════════════════════════════

export type SoilBaseType =
  | "sand"    // Sandjord
  | "clay"    // Lerjord
  | "loam"    // Muldjord
  | "peat"    // Tørvejord
  | "chalk"   // Kalkjord
  | "mixed";  // Blandet

export const SOIL_BASE_TYPE_LABELS: Record<SoilBaseType, string> = {
  sand: "Sandjord",
  clay: "Lerjord",
  loam: "Muldjord",
  peat: "Tørvejord",
  chalk: "Kalkjord",
  mixed: "Blandet",
};

export const SOIL_BASE_TYPE_DESC: Record<SoilBaseType, string> = {
  sand: "Let, veldrænet, tørrer hurtigt. Holder dårligt på næring.",
  clay: "Tung, kompakt, holder godt på vand og næring. Svær at bearbejde.",
  loam: "Ideel blanding af sand, ler og humus. God struktur.",
  peat: "Meget organisk, sur, holder godt på fugt. Kræver ofte kalkning.",
  chalk: "Basisk, kalkholdig, godt drænet. Mangler ofte jern og mangan.",
  mixed: "Varierende sammensætning – ikke klart domineret af én type.",
};

export type SoilColor = "light" | "brown" | "dark";
export const SOIL_COLOR_LABELS: Record<SoilColor, string> = {
  light: "Lys / gul",
  brown: "Brun",
  dark: "Mørk / sort",
};

export type SoilTexture = "loose-sandy" | "crumbly" | "sticky" | "compact";
export const SOIL_TEXTURE_LABELS: Record<SoilTexture, string> = {
  "loose-sandy": "Løs og sandig",
  crumbly: "Smuldrende",
  sticky: "Klæbrig / fed",
  compact: "Kompakt",
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. Fugt & dræning (Level 1)
// ═══════════════════════════════════════════════════════════════════════════

export type DrainageLevel = "standing" | "retains" | "dries-fast";
export const DRAINAGE_LABELS: Record<DrainageLevel, string> = {
  standing: "Vand bliver stående",
  retains: "Holder på fugt",
  "dries-fast": "Tørrer hurtigt ud",
};

export type MoistureLevel = "dry" | "adequate" | "wet";
export const MOISTURE_LABELS: Record<MoistureLevel, string> = {
  dry: "Tør",
  adequate: "Passende",
  wet: "Våd",
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. Liv i jorden (Level 1)
// ═══════════════════════════════════════════════════════════════════════════

export type EarthwormLevel = "many" | "few" | "none";
export const EARTHWORM_LABELS: Record<EarthwormLevel, string> = {
  many: "Mange",
  few: "Nogle få",
  none: "Ingen",
};

export type SoilHealthLevel = "healthy" | "medium" | "poor";
export const SOIL_HEALTH_LABELS: Record<SoilHealthLevel, string> = {
  healthy: "Sund og aktiv",
  medium: "Middel",
  poor: "Fattig og livløs",
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. Organisk indhold (Level 1–2)
// ═══════════════════════════════════════════════════════════════════════════

export type OrganicLevel = "rich" | "medium" | "poor";
export const ORGANIC_LABELS: Record<OrganicLevel, string> = {
  rich: "Rigt (mørk, fed)",
  medium: "Middel",
  poor: "Fattigt (lys, sandig)",
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. Kompost (Level 1–2)
// ═══════════════════════════════════════════════════════════════════════════

export type CompostType = "own" | "municipal" | "store" | "none";
export const COMPOST_TYPE_LABELS: Record<CompostType, string> = {
  own: "Egen havekompost",
  municipal: "Kommunal (genbrugsplads)",
  store: "Købskompost (pose)",
  none: "Ingen",
};

export type CompostMaturity = "immature" | "half" | "mature";
export const COMPOST_MATURITY_LABELS: Record<CompostMaturity, string> = {
  immature: "Umoden (grov)",
  half: "Halvmoden",
  mature: "Færdigmoden (fin, muldagtig)",
};

export type CompostAmount = "light" | "medium" | "heavy";
export const COMPOST_AMOUNT_LABELS: Record<CompostAmount, string> = {
  light: "Let dæklag",
  medium: "Middel (5–10 cm)",
  heavy: "Kraftig nedgravning",
};

// ═══════════════════════════════════════════════════════════════════════════
// 6. pH-værdi (Level 2)
// ═══════════════════════════════════════════════════════════════════════════

export type PhCategory = "acidic" | "neutral" | "alkaline";
export const PH_CATEGORY_LABELS: Record<PhCategory, string> = {
  acidic: "Sur (under 6.0)",
  neutral: "Neutral (6.0–7.0)",
  alkaline: "Basisk (over 7.0)",
};

export type PhMethod = "strips" | "digital" | "lab" | "not-measured";
export const PH_METHOD_LABELS: Record<PhMethod, string> = {
  strips: "Teststrips",
  digital: "Digitalt meter",
  lab: "Lab-analyse",
  "not-measured": "Ikke målt",
};

// ═══════════════════════════════════════════════════════════════════════════
// 7. Kalkindhold (Level 2)
// ═══════════════════════════════════════════════════════════════════════════

export type LimeContent = "high" | "medium" | "low";
export const LIME_CONTENT_LABELS: Record<LimeContent, string> = {
  high: "Kalkrig (bobler ved eddike)",
  medium: "Middel",
  low: "Kalkfattig (ingen reaktion)",
};

export type LimeType = "garden" | "dolomite" | "wood-ash" | "none";
export const LIME_TYPE_LABELS: Record<LimeType, string> = {
  garden: "Havebrugskalk",
  dolomite: "Dolomitkalk",
  "wood-ash": "Træaske",
  none: "Ikke kalket",
};

// ═══════════════════════════════════════════════════════════════════════════
// 8. NPK Næringsstoffer (Level 3)
// ═══════════════════════════════════════════════════════════════════════════

export type NutrientLevel = "low" | "medium" | "high";
export const NUTRIENT_LABELS: Record<NutrientLevel, string> = {
  low: "Lavt",
  medium: "Middel",
  high: "Højt",
};

export type NpkSource = "lab" | "estimated" | "not-assessed";
export const NPK_SOURCE_LABELS: Record<NpkSource, string> = {
  lab: "Lab-analyse",
  estimated: "Estimeret",
  "not-assessed": "Ikke vurderet",
};

// ═══════════════════════════════════════════════════════════════════════════
// 9. Struktur & kornstørrelse (Level 3)
// ═══════════════════════════════════════════════════════════════════════════

export type CompressionLevel = "loose" | "normal" | "compact";
export const COMPRESSION_LABELS: Record<CompressionLevel, string> = {
  loose: "Løs",
  normal: "Normal",
  compact: "Kompakt",
};

// ═══════════════════════════════════════════════════════════════════════════
// Soil Profile — master data type
// ═══════════════════════════════════════════════════════════════════════════

export interface SoilProfile {
  id: string;
  name: string;            // user-given name, e.g. "Køkkenhave-jord"
  createdAt: string;       // ISO date
  updatedAt: string;       // ISO date

  // ── 1. Jordtype (Level 1) ──
  baseType?: SoilBaseType;
  color?: SoilColor;
  texture?: SoilTexture;

  // ── 2. Fugt & dræning (Level 1) ──
  drainage?: DrainageLevel;
  moisture?: MoistureLevel;
  droughtProne?: boolean;

  // ── 3. Liv i jorden (Level 1) ──
  earthworms?: EarthwormLevel;
  fungalNetwork?: boolean;
  soilHealth?: SoilHealthLevel;

  // ── 4. Organisk indhold (Level 1–2) ──
  organicVisual?: OrganicLevel;
  organicPercent?: number;          // 0–20 %
  lastAmendment?: string;          // freetext, e.g. "Kompost tilsat forår 2024"

  // ── 5. Kompost (Level 1–2) ──
  compostTypes?: CompostType[];    // multi-select
  compostMaturity?: CompostMaturity;
  compostAmount?: CompostAmount;
  compostLastApplied?: string;     // ISO date or season text
  compostNotes?: string;           // freetext

  // ── 6. pH (Level 2) ──
  phMeasured?: number;             // 4.0 – 8.5
  phCategory?: PhCategory;
  phMethod?: PhMethod;
  phLastMeasured?: string;         // ISO date

  // ── 7. Kalkindhold (Level 2) ──
  limeContent?: LimeContent;
  limedRecently?: boolean;         // within 3 years
  limeType?: LimeType;

  // ── 8. NPK (Level 3) ──
  nitrogen?: NutrientLevel;
  phosphorus?: NutrientLevel;
  potassium?: NutrientLevel;
  magnesium?: NutrientLevel;
  npkSource?: NpkSource;
  npkDate?: string;                // ISO date

  // ── 9. Struktur & kornstørrelse (Level 3) ──
  clayPercent?: number;            // 0–60 %
  sandPercent?: number;            // 0–100 %
  siltPercent?: number;            // 0–60 %
  compression?: CompressionLevel;

  // ── General ──
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Soil Log — track changes over time (compost added, limed, measured pH, etc.)
// ═══════════════════════════════════════════════════════════════════════════

export type SoilLogAction =
  | "compost-added"
  | "limed"
  | "fertilized"
  | "ph-measured"
  | "soil-amended"
  | "mulched"
  | "drained"
  | "lab-analyzed"
  | "other";

export const SOIL_LOG_ACTION_LABELS: Record<SoilLogAction, string> = {
  "compost-added": "🧱 Kompost tilsat",
  limed: "⚪ Kalket",
  fertilized: "🌿 Gødet",
  "ph-measured": "🧪 pH målt",
  "soil-amended": "🔄 Jordforbedring",
  mulched: "🍂 Mulchet",
  drained: "💧 Drænet",
  "lab-analyzed": "🔬 Lab-analyse",
  other: "📝 Andet",
};

export interface SoilLogEntry {
  id: string;
  profileId: string;       // which SoilProfile
  date: string;            // ISO date
  action: SoilLogAction;
  notes?: string;          // freetext
}

// ═══════════════════════════════════════════════════════════════════════════
// Knowledge levels — for progressive disclosure in UI
// ═══════════════════════════════════════════════════════════════════════════

export type SoilKnowledgeLevel = 1 | 2 | 3;

export interface SoilSection {
  key: string;
  label: string;
  icon: string;
  level: SoilKnowledgeLevel;
  levelLabel: string;
}

/** Section definitions for UI accordion rendering */
export const SOIL_SECTIONS: SoilSection[] = [
  { key: "type",     label: "Jordtype",            icon: "🪨", level: 1, levelLabel: "Kig & mærk" },
  { key: "moisture", label: "Fugt & dræning",      icon: "💧", level: 1, levelLabel: "Kig & mærk" },
  { key: "life",     label: "Liv i jorden",        icon: "🐛", level: 1, levelLabel: "Kig & mærk" },
  { key: "organic",  label: "Organisk indhold",    icon: "🍂", level: 1, levelLabel: "Kig & mærk" },
  { key: "compost",  label: "Kompost",             icon: "♻️", level: 1, levelLabel: "Kig & mærk" },
  { key: "ph",       label: "pH-værdi",            icon: "🧪", level: 2, levelLabel: "pH-test" },
  { key: "lime",     label: "Kalkindhold",         icon: "⚪", level: 2, levelLabel: "Eddike-test" },
  { key: "npk",      label: "Næringsstoffer (NPK)",icon: "📊", level: 3, levelLabel: "Lab-analyse" },
  { key: "grain",    label: "Kornstørrelse",        icon: "🔬", level: 3, levelLabel: "Lab-analyse" },
];

// ═══════════════════════════════════════════════════════════════════════════
// Auto-recommendations (computed, not stored)
// ═══════════════════════════════════════════════════════════════════════════

export interface SoilRecommendation {
  icon: string;
  label: string;
  description: string;
  priority: "info" | "suggestion" | "warning";
}

/** Generate recommendations based on a soil profile */
export function computeSoilRecommendations(profile: SoilProfile): SoilRecommendation[] {
  const recs: SoilRecommendation[] = [];

  // pH-based recommendations
  if (profile.phCategory === "acidic" || (profile.phMeasured !== undefined && profile.phMeasured < 6.0)) {
    recs.push({
      icon: "⚪",
      label: "Kalkning anbefales",
      description: "Sur jord (pH < 6.0) begrænser næringsoptagelse. Overvej havebrugskalk.",
      priority: "suggestion",
    });
  }

  // Organic content
  if (profile.organicVisual === "poor") {
    recs.push({
      icon: "♻️",
      label: "Tilsæt organisk materiale",
      description: "Fattigt organisk indhold. Tilsæt kompost, bladmuld eller grøngødning.",
      priority: "suggestion",
    });
  }

  // Drainage
  if (profile.drainage === "standing") {
    recs.push({
      icon: "💧",
      label: "Dræning nødvendig",
      description: "Stående vand kvæler rødder. Overvej dræn, hævede bede eller sand-tilsætning.",
      priority: "warning",
    });
  }

  // Soil health
  if (profile.soilHealth === "poor") {
    recs.push({
      icon: "🐛",
      label: "Jordsundhed lav",
      description: "Livløs jord mangler mikroliv. Tilsæt kompost og undgå overdreven bearbejdning.",
      priority: "warning",
    });
  }

  // Compost age
  if (profile.compostTypes?.includes("municipal")) {
    recs.push({
      icon: "⚠️",
      label: "Kommunal kompost",
      description: "Kvalitet varierer. Kan indeholde ukrudtsfrø. Brug ikke ren til såning. pH typisk 6.5–7.5.",
      priority: "info",
    });
  }

  // Sandy soil
  if (profile.baseType === "sand" && profile.organicVisual !== "rich") {
    recs.push({
      icon: "🪨",
      label: "Sandjord — forbedring mulig",
      description: "Sandjord tørrer hurtigt og holder dårligt næring. Tilsæt kompost eller ler.",
      priority: "suggestion",
    });
  }

  // Clay soil
  if (profile.baseType === "clay" && profile.compression === "compact") {
    recs.push({
      icon: "🪨",
      label: "Kompakt lerjord",
      description: "Tung lerjord bør løsnes med sand, kompost eller gips. Undgå bearbejdning når våd.",
      priority: "suggestion",
    });
  }

  // Drought-prone
  if (profile.droughtProne && profile.organicVisual !== "rich") {
    recs.push({
      icon: "☀️",
      label: "Udtørringstruet",
      description: "Mulch og kompost hjælper jorden med at holde på fugt.",
      priority: "suggestion",
    });
  }

  return recs;
}
