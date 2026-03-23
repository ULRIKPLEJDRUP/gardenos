// ---------------------------------------------------------------------------
// GardenOS – Design Lab: Season Colors & Plant Shape System
// ---------------------------------------------------------------------------
// Ported from the approved prototype (design-lab-prototype.html)
// ---------------------------------------------------------------------------

import type { GrowthPhase, PhaseColors, PlantShapeType, PlantSeasonPalette } from "./bedLayoutTypes";

// ---------------------------------------------------------------------------
// Month helpers
// ---------------------------------------------------------------------------

export const MONTH_NAMES_DA = [
  "", "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

export const MONTH_ICONS = [
  "", "❄️", "❄️", "🌱", "🌸", "🌿", "☀️",
  "🌞", "🌾", "🍂", "🍁", "🌧️", "❄️",
];

export const PHASE_LABELS_DA: Record<GrowthPhase, { text: string; color: string }> = {
  dormant:    { text: "Hvile",     color: "#666666" },
  sprouting:  { text: "Spiring",   color: "#90BE6D" },
  growing:    { text: "Vækst",     color: "#2D6A4F" },
  flowering:  { text: "Blomstring", color: "#E9C46A" },
  fruiting:   { text: "Frugt",     color: "#E76F51" },
  harvesting: { text: "Høst",      color: "#F4A261" },
  dying:      { text: "Visner",    color: "#BBA87C" },
};

// ---------------------------------------------------------------------------
// Phase scale — controls visual size relative to mature
// ---------------------------------------------------------------------------

export function getPhaseScale(phase: GrowthPhase): number {
  switch (phase) {
    case "dormant":    return 0.1;
    case "sprouting":  return 0.35;
    case "growing":    return 0.75;
    case "flowering":  return 0.9;
    case "fruiting":   return 1.0;
    case "harvesting": return 0.95;
    case "dying":      return 0.5;
    default:           return 0.5;
  }
}

// ---------------------------------------------------------------------------
// Phase computation — which growth phase is a plant in at a given month?
// ---------------------------------------------------------------------------

export type PlantCalendar = {
  sowMonth: number | null;       // null = perennial
  growStart: number;
  flowerMonth: number | null;
  harvestStart: number | null;
  harvestEnd: number | null;
  dieMonth: number | null;       // null = evergreen / perennial
};

export function getPhase(cal: PlantCalendar, month: number): GrowthPhase {
  if (month < 1 || month > 12) return "dormant";

  // Determine the earliest activity month (sow or grow start)
  const seasonStart = cal.sowMonth ?? cal.growStart;

  // Before the season starts → dormant
  if (month < seasonStart) return "dormant";

  // After harvest ends → dying then dormant
  if (cal.harvestEnd) {
    if (cal.dieMonth && month >= cal.dieMonth) return "dormant";
    // One month after harvest = dying, then dormant
    if (month > cal.harvestEnd + 1) return "dormant";
    if (month === cal.harvestEnd + 1) return "dying";
    if (month === cal.harvestEnd) return "harvesting";
  }

  // Explicit die month (no harvest) → dormant after
  if (cal.dieMonth && month > cal.dieMonth) return "dormant";
  if (cal.dieMonth && month === cal.dieMonth) return "dying";

  // Sowing month → sprouting
  if (cal.sowMonth && month === cal.sowMonth) return "sprouting";

  // Harvest window (before harvestEnd which is handled above)
  if (cal.harvestStart && month >= cal.harvestStart) {
    return "fruiting";
  }

  // Flowering
  if (cal.flowerMonth && month >= cal.flowerMonth && (!cal.harvestStart || month < cal.harvestStart)) {
    return "flowering";
  }

  // Growing (between season start and flowering/harvest)
  if (month >= cal.growStart) {
    return "growing";
  }

  // Between sow and growStart → sprouting
  if (cal.sowMonth && month > cal.sowMonth && month < cal.growStart) {
    return "sprouting";
  }

  return "dormant";
}

// ---------------------------------------------------------------------------
// Default color palettes — used when species doesn't define custom colors
// ---------------------------------------------------------------------------

export const DEFAULT_PALETTES: Record<string, PlantSeasonPalette> = {
  vegetable: {
    dormant:    { foliage: "#8B7355", stem: "#8B7355", accent: null, ground: "#8B7355" },
    sprouting:  { foliage: "#90BE6D", stem: "#6a9a4a", accent: null, ground: "#8B7355" },
    growing:    { foliage: "#2D6A4F", stem: "#40916C", accent: null, ground: "#52796F" },
    flowering:  { foliage: "#2D6A4F", stem: "#40916C", accent: "#E9C46A", ground: "#52796F" },
    fruiting:   { foliage: "#2D6A4F", stem: "#40916C", accent: "#E76F51", ground: "#52796F" },
    harvesting: { foliage: "#95D5B2", stem: "#74C69D", accent: "#F4A261", ground: "#8B7355" },
    dying:      { foliage: "#BBA87C", stem: "#A68A5B", accent: null, ground: "#8B7355" },
  },
  herb: {
    dormant:    { foliage: "#8B7355", stem: "#8B7355", accent: null, ground: "#8B7355" },
    sprouting:  { foliage: "#A7C957", stem: "#6a9a4a", accent: null, ground: "#8B7355" },
    growing:    { foliage: "#588157", stem: "#3A5A40", accent: null, ground: "#52796F" },
    flowering:  { foliage: "#588157", stem: "#3A5A40", accent: "#D8B4FE", ground: "#52796F" },
    fruiting:   { foliage: "#588157", stem: "#3A5A40", accent: null, ground: "#52796F" },
    harvesting: { foliage: "#A3B18A", stem: "#588157", accent: null, ground: "#52796F" },
    dying:      { foliage: "#C9B458", stem: "#BBA87C", accent: null, ground: "#8B7355" },
  },
  fruit: {
    dormant:    { foliage: "#6B5B45", stem: "#5a4a35", accent: null, ground: "#6B5B45" },
    sprouting:  { foliage: "#90BE6D", stem: "#6a9a4a", accent: null, ground: "#7B6B55" },
    growing:    { foliage: "#386641", stem: "#2D6A4F", accent: null, ground: "#3A5A40" },
    flowering:  { foliage: "#386641", stem: "#2D6A4F", accent: "#FECDD3", ground: "#3A5A40" },
    fruiting:   { foliage: "#386641", stem: "#2D6A4F", accent: "#DC2626", ground: "#3A5A40" },
    harvesting: { foliage: "#588157", stem: "#3A5A40", accent: "#F4A261", ground: "#52796F" },
    dying:      { foliage: "#C9B458", stem: "#A68A5B", accent: null, ground: "#8B7355" },
  },
  flower: {
    dormant:    { foliage: "#8B7355", stem: "#8B7355", accent: null, ground: "#8B7355" },
    sprouting:  { foliage: "#B7E4C7", stem: "#95D5B2", accent: null, ground: "#8B7355" },
    growing:    { foliage: "#52B788", stem: "#40916C", accent: null, ground: "#52796F" },
    flowering:  { foliage: "#52B788", stem: "#40916C", accent: "#EC4899", ground: "#52796F" },
    fruiting:   { foliage: "#52B788", stem: "#40916C", accent: "#EC4899", ground: "#52796F" },
    harvesting: { foliage: "#74C69D", stem: "#52B788", accent: "#F4A261", ground: "#52796F" },
    dying:      { foliage: "#BBA87C", stem: "#A68A5B", accent: null, ground: "#8B7355" },
  },
};

/** Get season colors for a specific phase, with fallback palette. */
export function getSeasonColors(
  phase: GrowthPhase,
  customPalette?: Partial<PlantSeasonPalette>,
  category: string = "vegetable"
): PhaseColors {
  const palette = DEFAULT_PALETTES[category] ?? DEFAULT_PALETTES.vegetable;
  return customPalette?.[phase] ?? palette[phase];
}

// ---------------------------------------------------------------------------
// Ground / soil colors per month
// ---------------------------------------------------------------------------

export const GROUND_COLORS: Record<number, string> = {
  1: "#6B5B45", 2: "#6B5B45", 3: "#7B6B55", 4: "#8B7B65",
  5: "#8B7355", 6: "#8B7355", 7: "#8B7355", 8: "#8B7355",
  9: "#7B6B55", 10: "#6B5B45", 11: "#5B4B35", 12: "#5B4B35",
};

// ---------------------------------------------------------------------------
// Shape guessing — infer shape from species properties
// ---------------------------------------------------------------------------

export function guessPlantShape(species: {
  category?: string;
  matureHeightM?: number;
  spreadDiameterCm?: number;
  forestGardenLayer?: string;
}): PlantShapeType {
  const layer = species.forestGardenLayer;
  const cat = species.category;
  const h = species.matureHeightM ?? 0;

  if (layer === "canopy" || layer === "sub-canopy" || cat === "tree") return "tree-canopy";
  if (layer === "ground-cover") return "ground-cover";
  if (layer === "climber") return "climber";
  if (cat === "shrub" || layer === "shrub") return "bushy";

  // Height-based heuristics
  if (h > 1.5) return "bushy";
  if (h > 0.5) return "upright";

  // Category heuristics
  if (cat === "herb" || cat === "krydderi") return "grass";
  if (cat === "løg" || cat === "bulb") return "bulb";
  if (cat === "root" || cat === "rodveg") return "rosette";
  if (cat === "salat" || cat === "leafy" || cat === "blad") return "leafy";

  return "leafy"; // safe default
}

// ---------------------------------------------------------------------------
// Color utility
// ---------------------------------------------------------------------------

export function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}
