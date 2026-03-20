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
// Soil type presets — typical Danish values for each base type.
// Used to pre-fill a new profile so users have a sensible starting point
// and can then adjust to match their specific plot.
// ═══════════════════════════════════════════════════════════════════════════

/** Preset values for a soil type. Omit id/name/dates — those are set at creation. */
export type SoilPreset = Omit<SoilProfile, "id" | "name" | "createdAt" | "updatedAt">;

export const SOIL_TYPE_PRESETS: Record<SoilBaseType, SoilPreset> = {
  sand: {
    baseType: "sand",
    color: "light",
    texture: "loose-sandy",
    drainage: "dries-fast",
    moisture: "dry",
    droughtProne: true,
    earthworms: "few",
    soilHealth: "medium",
    organicVisual: "poor",
    organicPercent: 2,
    phCategory: "acidic",
    phMeasured: 6.0,
    limeContent: "low",
    nitrogen: "low",
    phosphorus: "low",
    potassium: "low",
    npkSource: "estimated",
    clayPercent: 5,
    sandPercent: 85,
    siltPercent: 10,
    compression: "loose",
  },
  clay: {
    baseType: "clay",
    color: "brown",
    texture: "sticky",
    drainage: "retains",
    moisture: "wet",
    droughtProne: false,
    earthworms: "few",
    soilHealth: "medium",
    organicVisual: "medium",
    organicPercent: 4,
    phCategory: "neutral",
    phMeasured: 7.0,
    limeContent: "medium",
    nitrogen: "medium",
    phosphorus: "medium",
    potassium: "medium",
    npkSource: "estimated",
    clayPercent: 45,
    sandPercent: 25,
    siltPercent: 30,
    compression: "compact",
  },
  loam: {
    baseType: "loam",
    color: "dark",
    texture: "crumbly",
    drainage: "retains",
    moisture: "adequate",
    droughtProne: false,
    earthworms: "many",
    soilHealth: "healthy",
    organicVisual: "rich",
    organicPercent: 6,
    phCategory: "neutral",
    phMeasured: 6.5,
    limeContent: "medium",
    nitrogen: "medium",
    phosphorus: "medium",
    potassium: "medium",
    npkSource: "estimated",
    clayPercent: 20,
    sandPercent: 40,
    siltPercent: 40,
    compression: "normal",
  },
  peat: {
    baseType: "peat",
    color: "dark",
    texture: "compact",
    drainage: "retains",
    moisture: "wet",
    droughtProne: false,
    earthworms: "few",
    soilHealth: "medium",
    organicVisual: "rich",
    organicPercent: 15,
    phCategory: "acidic",
    phMeasured: 4.5,
    limeContent: "low",
    nitrogen: "high",
    phosphorus: "low",
    potassium: "low",
    npkSource: "estimated",
    clayPercent: 10,
    sandPercent: 15,
    siltPercent: 20,
    compression: "compact",
  },
  chalk: {
    baseType: "chalk",
    color: "light",
    texture: "crumbly",
    drainage: "dries-fast",
    moisture: "dry",
    droughtProne: true,
    earthworms: "few",
    soilHealth: "medium",
    organicVisual: "medium",
    organicPercent: 3,
    phCategory: "alkaline",
    phMeasured: 7.5,
    limeContent: "high",
    nitrogen: "low",
    phosphorus: "low",
    potassium: "medium",
    npkSource: "estimated",
    clayPercent: 15,
    sandPercent: 35,
    siltPercent: 30,
    compression: "normal",
  },
  mixed: {
    baseType: "mixed",
    color: "brown",
    texture: "crumbly",
    drainage: "retains",
    moisture: "adequate",
    droughtProne: false,
    earthworms: "few",
    soilHealth: "medium",
    organicVisual: "medium",
    organicPercent: 4,
    phCategory: "neutral",
    phMeasured: 6.5,
    limeContent: "medium",
    nitrogen: "medium",
    phosphorus: "medium",
    potassium: "medium",
    npkSource: "estimated",
    clayPercent: 20,
    sandPercent: 40,
    siltPercent: 25,
    compression: "normal",
  },
};

/** Typical pH range for each soil type (for display as hint text) */
export const SOIL_TYPE_PH_RANGE: Record<SoilBaseType, string> = {
  sand:  "5.5 – 6.5",
  clay:  "6.5 – 7.5",
  loam:  "6.0 – 7.0",
  peat:  "4.0 – 5.5",
  chalk: "7.0 – 8.0",
  mixed: "6.0 – 7.0",
};

/** Icon for each soil base type */
export const SOIL_TYPE_ICONS: Record<SoilBaseType, string> = {
  sand:  "🟡",
  clay:  "🟤",
  loam:  "🟫",
  peat:  "🟠",
  chalk: "⬜",
  mixed: "🔘",
};

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

  // ── pH-based recommendations ──
  if (profile.phCategory === "acidic" || (profile.phMeasured !== undefined && profile.phMeasured < 6.0)) {
    recs.push({
      icon: "⚪",
      label: "Kalkning anbefales",
      description: "Sur jord (pH < 6.0) begrænser næringsoptagelse. Overvej havebrugskalk.",
      priority: "suggestion",
    });
  }
  if (profile.phCategory === "alkaline" || (profile.phMeasured !== undefined && profile.phMeasured > 7.5)) {
    recs.push({
      icon: "🧪",
      label: "Høj pH — basisk jord",
      description: "pH over 7.5 kan låse jern, mangan og fosfor. Sænk pH med svovl, tørvejord eller sur kompost.",
      priority: "suggestion",
    });
  }
  if (profile.phMeasured !== undefined && profile.phMeasured >= 6.0 && profile.phMeasured <= 7.0) {
    recs.push({
      icon: "✅",
      label: "Optimal pH",
      description: `pH ${profile.phMeasured} er i det optimale interval (6.0–7.0) for de fleste afgrøder.`,
      priority: "info",
    });
  }

  // ── Organic content ──
  if (profile.organicVisual === "poor") {
    recs.push({
      icon: "♻️",
      label: "Tilsæt organisk materiale",
      description: "Fattigt organisk indhold. Tilsæt kompost, bladmuld eller grøngødning.",
      priority: "suggestion",
    });
  }
  if (profile.organicVisual === "rich") {
    recs.push({
      icon: "🌱",
      label: "Godt organisk indhold",
      description: "Rigt organisk indhold giver god struktur og næringstilgængelighed.",
      priority: "info",
    });
  }

  // ── Drainage ──
  if (profile.drainage === "standing") {
    recs.push({
      icon: "💧",
      label: "Dræning nødvendig",
      description: "Stående vand kvæler rødder. Overvej dræn, hævede bede eller sand-tilsætning.",
      priority: "warning",
    });
  }
  if (profile.drainage === "dries-fast") {
    recs.push({
      icon: "💨",
      label: "Tørrer hurtigt ud",
      description: "Jorden tørrer hurtigt. Brug mulch, og vand dybt frem for ofte.",
      priority: "suggestion",
    });
  }

  // ── Moisture ──
  if (profile.moisture === "wet") {
    recs.push({
      icon: "🌊",
      label: "Vedvarende fugtig jord",
      description: "Fugtig jord kan give rodråd. Vælg planter der tåler fugt, eller forbedre dræning.",
      priority: "suggestion",
    });
  }

  // ── Soil health ──
  if (profile.soilHealth === "poor") {
    recs.push({
      icon: "🐛",
      label: "Jordsundhed lav",
      description: "Livløs jord mangler mikroliv. Tilsæt kompost og undgå overdreven bearbejdning.",
      priority: "warning",
    });
  }
  if (profile.soilHealth === "healthy") {
    recs.push({
      icon: "💚",
      label: "Sund og aktiv jord",
      description: "Jorden har godt mikroliv. Bevar med årlig kompost og minimal bearbejdning.",
      priority: "info",
    });
  }

  // ── Earthworms ──
  if (profile.earthworms === "none") {
    recs.push({
      icon: "🪱",
      label: "Ingen regnorme",
      description: "Regnorme forbedrer struktur og næringscirkulation. Tilsæt kompost for at tiltrække dem.",
      priority: "suggestion",
    });
  }
  if (profile.earthworms === "many") {
    recs.push({
      icon: "🪱",
      label: "Mange regnorme — godt tegn",
      description: "Regnorme indikerer sund jord med god struktur og biologisk aktivitet.",
      priority: "info",
    });
  }

  // ── NPK nutrients ──
  if (profile.nitrogen === "low") {
    recs.push({
      icon: "🟢",
      label: "Lavt kvælstof (N)",
      description: "Tilsæt grøngødning, kompost eller blodmel for at øge kvælstof.",
      priority: "suggestion",
    });
  }
  if (profile.phosphorus === "low") {
    recs.push({
      icon: "🟠",
      label: "Lavt fosfor (P)",
      description: "Benmel eller kompost kan øge fosforindholdet. Tjek pH — fosfor låses ved lav pH.",
      priority: "suggestion",
    });
  }
  if (profile.potassium === "low") {
    recs.push({
      icon: "🔵",
      label: "Lavt kalium (K)",
      description: "Træaske, kompost eller tang tilsættes for at øge kalium.",
      priority: "suggestion",
    });
  }
  if (profile.nitrogen === "high" && profile.phosphorus === "high" && profile.potassium === "high") {
    recs.push({
      icon: "✅",
      label: "God næringsstofbalance",
      description: "NPK-niveauerne er alle høje. Undgå overgødskning — det kan forurene grundvand.",
      priority: "info",
    });
  }

  // ── Lime ──
  if (profile.limeContent === "high" && profile.phCategory !== "alkaline") {
    recs.push({
      icon: "⚪",
      label: "Kalkrig jord",
      description: "Kalkrig jord kan begrænse surhedstolerante planter som rhododendron og blåbær.",
      priority: "info",
    });
  }

  // ── Compost ──
  if (profile.compostTypes?.includes("municipal")) {
    recs.push({
      icon: "⚠️",
      label: "Kommunal kompost",
      description: "Kvalitet varierer. Kan indeholde ukrudtsfrø. Brug ikke ren til såning. pH typisk 6.5–7.5.",
      priority: "info",
    });
  }

  // ── Sandy soil ──
  if (profile.baseType === "sand" && profile.organicVisual !== "rich") {
    recs.push({
      icon: "🟡",
      label: "Sandjord — forbedring mulig",
      description: "Sandjord tørrer hurtigt og holder dårligt næring. Tilsæt kompost eller ler.",
      priority: "suggestion",
    });
  }

  // ── Clay soil ──
  if (profile.baseType === "clay" && profile.compression === "compact") {
    recs.push({
      icon: "🟤",
      label: "Kompakt lerjord",
      description: "Tung lerjord bør løsnes med sand, kompost eller gips. Undgå bearbejdning når våd.",
      priority: "suggestion",
    });
  }

  // ── Peat soil ──
  if (profile.baseType === "peat") {
    recs.push({
      icon: "🟠",
      label: "Tørvejord — bemærk pH",
      description: "Tørvejord er naturligt sur (pH 4–5.5). De fleste grøntsager trives bedst ved pH 6+. Overvej kalkning.",
      priority: "suggestion",
    });
  }

  // ── Chalk soil ──
  if (profile.baseType === "chalk" && (profile.phMeasured === undefined || profile.phMeasured > 7.0)) {
    recs.push({
      icon: "⬜",
      label: "Kalkjord — basisk",
      description: "Kalkjord er typisk basisk. Vælg kalktolerante planter eller sænk pH med svovl.",
      priority: "suggestion",
    });
  }

  // ── Drought-prone ──
  if (profile.droughtProne && profile.organicVisual !== "rich") {
    recs.push({
      icon: "☀️",
      label: "Udtørringstruet",
      description: "Mulch og kompost hjælper jorden med at holde på fugt.",
      priority: "suggestion",
    });
  }

  // ── Compression ──
  if (profile.compression === "compact" && profile.baseType !== "clay") {
    recs.push({
      icon: "🔨",
      label: "Kompakt jord",
      description: "Kompakt jord hæmmer rodvækst. Løsn med greb og tilsæt kompost.",
      priority: "suggestion",
    });
  }

  return recs;
}
