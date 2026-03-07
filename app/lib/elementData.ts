// ---------------------------------------------------------------------------
// GardenOS – Infrastructure Element Catalogue
// ---------------------------------------------------------------------------
// Pre-defined element types for Vand (water), El (electric) and Lamper (lights).
// Each entry specifies its draw geometry so the map can auto-pick between
// polyline (for cables / pipes) and marker (for outlets / fixtures).
// ---------------------------------------------------------------------------

export type ElementGeometry = "point" | "polyline";

export type ElementModeKey = "vand" | "el" | "lampe";

export type InfraCategory = "pipe" | "fixture" | "cable" | "outlet" | "light";

export interface InfraElement {
  /** Unique stable id, e.g. "water-pipe" */
  id: string;
  /** Danish display name */
  name: string;
  /** Short description shown under the name */
  description: string;
  /** Emoji icon */
  icon: string;
  /** Which top-level mode this belongs to */
  mode: ElementModeKey;
  /** Sub-category for grouping inside the mode */
  infraCategory: InfraCategory;
  /** Draw geometry – polyline for cables/pipes, point for fixtures */
  geometry: ElementGeometry;
  /** The map feature kind to assign (used in KNOWN_KIND_DEFS) */
  featureKind: string;
  /** Optional extra tips shown in tooltip */
  tips?: string;
}

// ---------------------------------------------------------------------------
// VAND / RØR
// ---------------------------------------------------------------------------
const WATER_ELEMENTS: InfraElement[] = [
  {
    id: "water-pipe",
    name: "Vandrør",
    description: "Hovedledning / forsyningsrør i haven",
    icon: "🔵",
    mode: "vand",
    infraCategory: "pipe",
    geometry: "polyline",
    featureKind: "water-pipe",
    tips: "Tegn rørforløbet som en streg på kortet",
  },
  {
    id: "water-hose",
    name: "Haveslange",
    description: "Fleksibel slange til vanding",
    icon: "🟢",
    mode: "vand",
    infraCategory: "pipe",
    geometry: "polyline",
    featureKind: "water-hose",
    tips: "Tegn slangeforbindelsen som en streg",
  },
  {
    id: "water-drip-line",
    name: "Drypslange",
    description: "Drypvandingslange langs bede / rækker",
    icon: "💦",
    mode: "vand",
    infraCategory: "pipe",
    geometry: "polyline",
    featureKind: "water-drip",
    tips: "Placér langs bede eller rækker",
  },
  {
    id: "water-tap",
    name: "Vandhane / tappehane",
    description: "Fast udendørs vandhane",
    icon: "🚰",
    mode: "vand",
    infraCategory: "fixture",
    geometry: "point",
    featureKind: "water-tap",
    tips: "Markér hanens placering på kortet",
  },
  {
    id: "water-sprinkler",
    name: "Sprinkler",
    description: "Roterende eller stationær sprinkler",
    icon: "⛲",
    mode: "vand",
    infraCategory: "fixture",
    geometry: "point",
    featureKind: "water-sprinkler",
    tips: "Placér sprinkleren som en markør",
  },
  {
    id: "water-timer",
    name: "Vandtimer / ventil",
    description: "Automatisk vandingsur eller magnetventil",
    icon: "⏱️",
    mode: "vand",
    infraCategory: "fixture",
    geometry: "point",
    featureKind: "water-timer",
    tips: "Placér timer/ventil ved forgreningen",
  },
  {
    id: "water-barrel",
    name: "Regnvandstønde",
    description: "Opsamler regnvand fra taget",
    icon: "🪣",
    mode: "vand",
    infraCategory: "fixture",
    geometry: "point",
    featureKind: "water-barrel",
    tips: "Placér tønden under et nedløb",
  },
];

// ---------------------------------------------------------------------------
// EL / LEDNING
// ---------------------------------------------------------------------------
const ELECTRIC_ELEMENTS: InfraElement[] = [
  {
    id: "electric-cable",
    name: "El-ledning",
    description: "Nedgravet eller ophængt strømkabel",
    icon: "🔌",
    mode: "el",
    infraCategory: "cable",
    geometry: "polyline",
    featureKind: "electric-cable",
    tips: "Tegn kabelforløbet som en streg",
  },
  {
    id: "electric-cable-lv",
    name: "Lavspændingskabel",
    description: "12 V ledning til havebelysning o.l.",
    icon: "〰️",
    mode: "el",
    infraCategory: "cable",
    geometry: "polyline",
    featureKind: "electric-lv",
    tips: "Typisk til LED-belysning og pumper",
  },
  {
    id: "electric-outlet",
    name: "Udendørs stikkontakt",
    description: "230 V havestik / IP44-udtag",
    icon: "🔲",
    mode: "el",
    infraCategory: "outlet",
    geometry: "point",
    featureKind: "electric-outlet",
    tips: "Placér udtaget som en markør",
  },
  {
    id: "electric-junction",
    name: "Samledåse",
    description: "Kabelsamling eller forgreningsdåse",
    icon: "📦",
    mode: "el",
    infraCategory: "outlet",
    geometry: "point",
    featureKind: "electric-junction",
    tips: "Markér forgreningspunkt",
  },
  {
    id: "electric-panel",
    name: "El-tavle / gruppeafbryder",
    description: "Hoved- eller undertavle udendørs",
    icon: "🔳",
    mode: "el",
    infraCategory: "outlet",
    geometry: "point",
    featureKind: "electric-panel",
    tips: "Markér tavlens placering",
  },
  {
    id: "electric-solar",
    name: "Solcellepanel",
    description: "Solcellepanel til lokal strømforsyning",
    icon: "☀️",
    mode: "el",
    infraCategory: "outlet",
    geometry: "point",
    featureKind: "electric-solar",
    tips: "Placér panelet i solrig position",
  },
];

// ---------------------------------------------------------------------------
// LAMPER / BELYSNING
// ---------------------------------------------------------------------------
const LAMP_ELEMENTS: InfraElement[] = [
  {
    id: "lamp-garden",
    name: "Havelampe",
    description: "Klassisk stolpe- eller pullertlampe",
    icon: "🏮",
    mode: "lampe",
    infraCategory: "light",
    geometry: "point",
    featureKind: "lamp-garden",
    tips: "Fast monteret havelampe",
  },
  {
    id: "lamp-spot",
    name: "Spotlampe",
    description: "Retningsbestemt spot til belysning af planter / facader",
    icon: "🔦",
    mode: "lampe",
    infraCategory: "light",
    geometry: "point",
    featureKind: "lamp-spot",
    tips: "Peg mod det du vil belyse",
  },
  {
    id: "lamp-led-string",
    name: "LED-lyskæde",
    description: "Lyskæde ophængt mellem punkter",
    icon: "✨",
    mode: "lampe",
    infraCategory: "light",
    geometry: "polyline",
    featureKind: "lamp-led-string",
    tips: "Tegn lyskædens forløb som en streg",
  },
  {
    id: "lamp-wall",
    name: "Væglampe",
    description: "Udendørs vægmonteret lampe",
    icon: "💡",
    mode: "lampe",
    infraCategory: "light",
    geometry: "point",
    featureKind: "lamp-wall",
    tips: "Placér på muren / hegnet",
  },
  {
    id: "lamp-solar",
    name: "Solcellelampe",
    description: "Lampe med indbygget solcelle – ingen kabel nødvendigt",
    icon: "🌞",
    mode: "lampe",
    infraCategory: "light",
    geometry: "point",
    featureKind: "lamp-solar",
    tips: "Skal stå i sol for at oplade",
  },
  {
    id: "lamp-path",
    name: "Stibelysning",
    description: "Lav markbelysning langs stier og gangarealer",
    icon: "🛤️",
    mode: "lampe",
    infraCategory: "light",
    geometry: "point",
    featureKind: "lamp-path",
    tips: "Placér jævnt langs stien",
  },
  {
    id: "lamp-battery",
    name: "Batterilampe",
    description: "Trådløs lampe med batteri – fleksibel placering",
    icon: "🔋",
    mode: "lampe",
    infraCategory: "light",
    geometry: "point",
    featureKind: "lamp-battery",
    tips: "Kan flyttes rundt efter behov",
  },
  {
    id: "lamp-flood",
    name: "Projektør / flood",
    description: "Kraftig projektør til belysning af større arealer",
    icon: "🌟",
    mode: "lampe",
    infraCategory: "light",
    geometry: "point",
    featureKind: "lamp-flood",
    tips: "Monteres højt for bred dækning",
  },
];

// ---------------------------------------------------------------------------
// Aggregated helpers
// ---------------------------------------------------------------------------

/** All infrastructure elements */
export const ALL_INFRA_ELEMENTS: InfraElement[] = [
  ...WATER_ELEMENTS,
  ...ELECTRIC_ELEMENTS,
  ...LAMP_ELEMENTS,
];

/** Lookup by id */
const ELEMENT_BY_ID = new Map(ALL_INFRA_ELEMENTS.map((e) => [e.id, e]));

export function getInfraElementById(id: string): InfraElement | undefined {
  return ELEMENT_BY_ID.get(id);
}

/** Get all elements for a given mode */
export function getInfraElementsForMode(mode: ElementModeKey): InfraElement[] {
  switch (mode) {
    case "vand": return WATER_ELEMENTS;
    case "el": return ELECTRIC_ELEMENTS;
    case "lampe": return LAMP_ELEMENTS;
    default: return [];
  }
}

/** Labels for each mode */
export const ELEMENT_MODE_LABELS: Record<ElementModeKey, string> = {
  vand: "Vand / Rør",
  el: "El / Ledning",
  lampe: "Lamper",
};

/** Emoji for each mode */
export const ELEMENT_MODE_ICONS: Record<ElementModeKey, string> = {
  vand: "💧",
  el: "⚡",
  lampe: "💡",
};

/** Sub-category labels */
export const INFRA_CATEGORY_LABELS: Record<InfraCategory, string> = {
  pipe: "Rør & slanger",
  fixture: "Armaturer",
  cable: "Kabler",
  outlet: "Udtag & paneler",
  light: "Belysning",
};
