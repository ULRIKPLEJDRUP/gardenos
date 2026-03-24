// ---------------------------------------------------------------------------
// GardenOS – Smart Auto-Fill Logic for Design Lab
// ---------------------------------------------------------------------------
// Provides:
// 1. Color-aware plant filtering ("rødt bed", "lilla nuancer")
// 2. Bloom-calendar coverage ("blomster hele året")
// 3. Companion-aware row placement
// 4. Auto-fill bed with optimal spacing
// ---------------------------------------------------------------------------

import type { PlantSpecies, PlantColorFamily, MonthRange } from "./plantTypes";
import type { BedElement, BedLocalCoord } from "./bedLayoutTypes";
import { getAllPlants, getPlantById } from "./plantStore";
import { pointInBedOutline } from "./bedGeometry";

// ---------------------------------------------------------------------------
// Known flower colors – lookup for built-in plants without explicit flowerColor
// ---------------------------------------------------------------------------
const KNOWN_FLOWER_COLORS: Record<string, { hex: string; family: PlantColorFamily; bloomRange?: MonthRange }> = {
  // Blomster
  morgenfrue:   { hex: "#FFA500", family: "orange",  bloomRange: { from: 6, to: 10 } },
  solsikke:     { hex: "#FFD700", family: "yellow",  bloomRange: { from: 7, to: 9 } },
  tagetes:      { hex: "#FF6347", family: "orange",  bloomRange: { from: 6, to: 10 } },
  lavendel:     { hex: "#9370DB", family: "purple",  bloomRange: { from: 6, to: 8 } },
  dahlia:       { hex: "#FF1493", family: "red",     bloomRange: { from: 7, to: 10 } },
  krokus:       { hex: "#7B68EE", family: "purple",  bloomRange: { from: 2, to: 4 } },
  narcis:       { hex: "#FFD700", family: "yellow",  bloomRange: { from: 3, to: 5 } },
  stokrose:     { hex: "#FF69B4", family: "pink",    bloomRange: { from: 6, to: 9 } },
  tulipan:      { hex: "#FF0000", family: "red",     bloomRange: { from: 4, to: 5 } },
  // Urter med blomster
  rosmarin:     { hex: "#9370DB", family: "blue",    bloomRange: { from: 4, to: 6 } },
  timian:       { hex: "#DDA0DD", family: "pink",    bloomRange: { from: 6, to: 8 } },
  oregano:      { hex: "#DDA0DD", family: "pink",    bloomRange: { from: 7, to: 9 } },
  salvie:       { hex: "#6A5ACD", family: "purple",  bloomRange: { from: 6, to: 8 } },
  purloeg:      { hex: "#DA70D6", family: "purple",  bloomRange: { from: 5, to: 7 } },
  mynte:        { hex: "#DDA0DD", family: "purple",  bloomRange: { from: 7, to: 9 } },
  kamille:      { hex: "#FFFACD", family: "white",   bloomRange: { from: 6, to: 9 } },
  hyldeblomst:  { hex: "#FFFAF0", family: "white",   bloomRange: { from: 6, to: 7 } },
  // Frugt (blomstring)
  aeble:        { hex: "#FFB6C1", family: "pink",    bloomRange: { from: 5, to: 5 } },
  kirsbaer:     { hex: "#FFB6C1", family: "pink",    bloomRange: { from: 4, to: 5 } },
  paere:        { hex: "#FFFFFF", family: "white",    bloomRange: { from: 4, to: 5 } },
  blomme:       { hex: "#FFFFFF", family: "white",    bloomRange: { from: 4, to: 5 } },
  // Buske
  roser:        { hex: "#FF0000", family: "red",     bloomRange: { from: 6, to: 9 } },
  hortensie:    { hex: "#87CEEB", family: "blue",    bloomRange: { from: 6, to: 9 } },
  // Grøntsager med blomster
  tomat:        { hex: "#FFD700", family: "yellow",  bloomRange: { from: 6, to: 8 } },
  squash:       { hex: "#FFA500", family: "orange",  bloomRange: { from: 6, to: 8 } },
  aert:         { hex: "#FFFFFF", family: "white",   bloomRange: { from: 5, to: 7 } },
  boenner:      { hex: "#FFFFFF", family: "white",   bloomRange: { from: 6, to: 8 } },
  // Stauder
  echinacea:    { hex: "#FF69B4", family: "pink",    bloomRange: { from: 7, to: 9 } },
  "hortensia":  { hex: "#87CEEB", family: "blue",    bloomRange: { from: 6, to: 9 } },
  "petunia":    { hex: "#FF69B4", family: "pink",    bloomRange: { from: 6, to: 10 } },
  "viol":       { hex: "#8B008B", family: "purple",  bloomRange: { from: 3, to: 5 } },
  "valmue":     { hex: "#FF0000", family: "red",     bloomRange: { from: 6, to: 7 } },
  "kornblomst": { hex: "#6495ED", family: "blue",    bloomRange: { from: 6, to: 8 } },
  "stedmoderblomst": { hex: "#7B68EE", family: "multi", bloomRange: { from: 3, to: 10 } },
  "marguerit":  { hex: "#FFFAF0", family: "white",   bloomRange: { from: 6, to: 9 } },
  "ridderspore":{ hex: "#4169E1", family: "blue",    bloomRange: { from: 6, to: 8 } },
  "lupin":      { hex: "#7B68EE", family: "purple",  bloomRange: { from: 6, to: 7 } },
  "paeonia":    { hex: "#FF69B4", family: "pink",    bloomRange: { from: 5, to: 6 } },
  "rose":       { hex: "#FF0000", family: "red",     bloomRange: { from: 6, to: 10 } },
  "geranium":   { hex: "#FF1493", family: "pink",    bloomRange: { from: 5, to: 9 } },
  "akeleje":    { hex: "#7B68EE", family: "purple",  bloomRange: { from: 5, to: 6 } },
  "bellis":     { hex: "#FF69B4", family: "pink",    bloomRange: { from: 3, to: 6 } },
  "vintergaek": { hex: "#FFFFFF", family: "white",   bloomRange: { from: 2, to: 3 } },
  "scilla":     { hex: "#4169E1", family: "blue",    bloomRange: { from: 3, to: 4 } },
  "lilje":      { hex: "#FFFFFF", family: "white",   bloomRange: { from: 6, to: 8 } },
  "gladiolus":  { hex: "#FF0000", family: "red",     bloomRange: { from: 7, to: 9 } },
  "iris":       { hex: "#4169E1", family: "blue",    bloomRange: { from: 5, to: 6 } },
  "klematis":   { hex: "#9370DB", family: "purple",  bloomRange: { from: 6, to: 9 } },
  "hortensia-stor": { hex: "#87CEEB", family: "blue", bloomRange: { from: 6, to: 9 } },
  "asters":     { hex: "#9370DB", family: "purple",  bloomRange: { from: 8, to: 10 } },
  "chrysanthemum": { hex: "#FFD700", family: "yellow", bloomRange: { from: 9, to: 11 } },
  "julestjerne": { hex: "#FF0000", family: "red",    bloomRange: { from: 11, to: 1 } },
  "isop":       { hex: "#4169E1", family: "blue",    bloomRange: { from: 6, to: 9 } },
};

// ---------------------------------------------------------------------------
// Get a plant's color family (uses explicit field, then lookup, then heuristic)
// ---------------------------------------------------------------------------
export function getPlantColorFamily(plant: PlantSpecies): PlantColorFamily | null {
  // 1. Explicit field
  if (plant.colorFamily) return plant.colorFamily;
  // 2. Lookup table
  const known = KNOWN_FLOWER_COLORS[plant.id];
  if (known) return known.family;
  // 3. From flowerColor hex (if set but no family)
  if (plant.flowerColor) return hexToColorFamily(plant.flowerColor);
  return null;
}

/** Get bloom months for a plant */
export function getPlantBloomMonths(plant: PlantSpecies): MonthRange | null {
  if (plant.bloomMonths) return plant.bloomMonths;
  const known = KNOWN_FLOWER_COLORS[plant.id];
  if (known?.bloomRange) return known.bloomRange;
  // Estimate from harvest for flowers
  if (plant.category === "flower" && plant.harvest) return plant.harvest;
  return null;
}

/** Get flower color hex for a plant */
export function getPlantFlowerHex(plant: PlantSpecies): string | null {
  if (plant.flowerColor) return plant.flowerColor;
  const known = KNOWN_FLOWER_COLORS[plant.id];
  if (known) return known.hex;
  return null;
}

// ---------------------------------------------------------------------------
// Hex → color family conversion
// ---------------------------------------------------------------------------
function hexToColorFamily(hex: string): PlantColorFamily {
  const rgb = hexToRgb(hex);
  if (!rgb) return "multi";
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;

  if (lightness > 0.9) return "white";
  if (lightness < 0.15) return "multi";

  // Hue-based classification
  const hue = rgbToHue(r, g, b);
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 45) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 160) return "green";
  if (hue < 200) return "blue";
  if (hue < 270) return "purple";
  if (hue < 345) return "pink";
  return "red";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

function rgbToHue(r: number, g: number, b: number): number {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return h * 60;
}

// ---------------------------------------------------------------------------
// Does month M fall within a range (handles wrap-around like {from:11, to:2})
// ---------------------------------------------------------------------------
function monthInRange(month: number, range: MonthRange): boolean {
  if (range.from <= range.to) return month >= range.from && month <= range.to;
  return month >= range.from || month <= range.to; // wraps around Dec→Jan
}

// ---------------------------------------------------------------------------
// Filter plants by color family
// ---------------------------------------------------------------------------
export function filterPlantsByColor(
  plants: PlantSpecies[],
  colorFamily: PlantColorFamily
): PlantSpecies[] {
  return plants.filter((p) => {
    const family = getPlantColorFamily(p);
    return family === colorFamily || family === "multi";
  });
}

// ---------------------------------------------------------------------------
// Filter plants that bloom in specific months
// ---------------------------------------------------------------------------
export function filterPlantsByBloomMonth(
  plants: PlantSpecies[],
  month: number
): PlantSpecies[] {
  return plants.filter((p) => {
    const bloom = getPlantBloomMonths(p);
    if (!bloom) return false;
    return monthInRange(month, bloom);
  });
}

// ---------------------------------------------------------------------------
// Find plants that together provide year-round blooms
// ---------------------------------------------------------------------------
export function findYearRoundBloomSet(
  plants: PlantSpecies[],
  colorFamily?: PlantColorFamily
): PlantSpecies[] {
  // Filter by color if specified
  let candidates = colorFamily ? filterPlantsByColor(plants, colorFamily) : plants;
  // Only keep plants with known bloom data
  candidates = candidates.filter((p) => getPlantBloomMonths(p) !== null);

  // Greedy coverage: pick plants that cover uncovered months
  const covered = new Set<number>();
  const selected: PlantSpecies[] = [];

  // Sort by bloom duration (longest first) for better coverage
  const withBloom = candidates.map((p) => {
    const bloom = getPlantBloomMonths(p)!;
    const duration = bloom.from <= bloom.to
      ? bloom.to - bloom.from + 1
      : 12 - bloom.from + bloom.to + 1;
    return { plant: p, bloom, duration };
  }).sort((a, b) => b.duration - a.duration);

  while (covered.size < 12 && withBloom.length > 0) {
    // Find the plant that covers the most uncovered months
    let bestIdx = 0;
    let bestNewCoverage = 0;

    for (let i = 0; i < withBloom.length; i++) {
      const { bloom } = withBloom[i];
      let newCoverage = 0;
      for (let m = 1; m <= 12; m++) {
        if (!covered.has(m) && monthInRange(m, bloom)) newCoverage++;
      }
      if (newCoverage > bestNewCoverage) {
        bestNewCoverage = newCoverage;
        bestIdx = i;
      }
    }

    if (bestNewCoverage === 0) break; // No more coverage possible

    const chosen = withBloom.splice(bestIdx, 1)[0];
    selected.push(chosen.plant);
    for (let m = 1; m <= 12; m++) {
      if (monthInRange(m, chosen.bloom)) covered.add(m);
    }
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Bed generation presets
// ---------------------------------------------------------------------------
export type BedPreset = {
  id: string;
  name: string;
  icon: string;
  description: string;
  generate: (bedWidthCm: number, bedLengthCm: number) => GeneratedBedPlan;
};

export type GeneratedBedPlan = {
  plants: { species: PlantSpecies; count: number }[];
  description: string;
  coverageMonths: number[]; // which months have blooms
};

// ---------------------------------------------------------------------------
// Smart auto-fill: arrange selected plants in a bed with proper spacing
// ---------------------------------------------------------------------------
export type AutoFillResult = {
  elements: BedElement[];
  warnings: string[];
};

export function autoFillBed(
  species: PlantSpecies[],
  bedWidthCm: number,
  bedLengthCm: number,
  outlineCm: BedLocalCoord[],
  existingElements: BedElement[] = [],
): AutoFillResult {
  const elements: BedElement[] = [];
  const warnings: string[] = [];
  const edgeMargin = 10; // cm from bed edge

  if (species.length === 0) {
    warnings.push("Ingen planter valgt.");
    return { elements, warnings };
  }

  // Sort species by row spacing (tallest / widest first for back of bed)
  const sorted = [...species].sort((a, b) => {
    const spA = a.rowSpacingCm ?? a.spacingCm ?? 25;
    const spB = b.rowSpacingCm ?? b.spacingCm ?? 25;
    return spB - spA;
  });

  // Calculate rows
  let currentY = edgeMargin;
  for (const sp of sorted) {
    const rowSpacing = sp.rowSpacingCm ?? sp.spacingCm ?? 25;
    const plantSpacing = sp.spacingCm ?? 15;
    const spread = sp.spreadDiameterCm ?? plantSpacing;

    if (currentY + spread / 2 > bedLengthCm - edgeMargin) {
      warnings.push(`${sp.icon ?? "🌱"} ${sp.name}: ikke plads til flere rækker.`);
      continue;
    }

    // Place plants along this row
    let currentX = edgeMargin + spread / 2;
    let countInRow = 0;
    while (currentX + spread / 2 <= bedWidthCm - edgeMargin) {
      const pos: BedLocalCoord = { x: currentX, y: currentY };
      // Check if within bed outline
      if (pointInBedOutline(pos, outlineCm)) {
        // Check minimum distance from existing elements
        const tooClose = [...existingElements, ...elements].some((el) => {
          const dx = el.position.x - pos.x;
          const dy = el.position.y - pos.y;
          const minDist = ((el.width || 10) + spread) / 2;
          return Math.sqrt(dx * dx + dy * dy) < minDist * 0.8;
        });

        if (!tooClose) {
          elements.push({
            id: crypto.randomUUID(),
            type: "plant",
            position: pos,
            rotation: 0,
            width: spread,
            length: spread,
            speciesId: sp.id,
            count: 1,
            spacingCm: plantSpacing,
            icon: sp.icon ?? "🌱",
            label: sp.name,
          });
          countInRow++;
        }
      }
      currentX += plantSpacing;
    }

    if (countInRow === 0) {
      warnings.push(`${sp.icon ?? "🌱"} ${sp.name}: ingen plads i rækken.`);
    }

    currentY += rowSpacing;
  }

  // Check companion warnings
  const companionWarnings = checkCompanionConflicts(elements);
  warnings.push(...companionWarnings);

  return { elements, warnings };
}

// ---------------------------------------------------------------------------
// Companion conflict checker for placed elements
// ---------------------------------------------------------------------------
function checkCompanionConflicts(elements: BedElement[]): string[] {
  const warnings: string[] = [];
  const speciesCache = new Map<string, PlantSpecies>();

  for (const el of elements) {
    if (!el.speciesId) continue;
    if (!speciesCache.has(el.speciesId)) {
      const sp = getPlantById(el.speciesId);
      if (sp) speciesCache.set(el.speciesId, sp);
    }
  }

  const speciesIds = [...new Set(elements.map((e) => e.speciesId).filter(Boolean))] as string[];
  for (let i = 0; i < speciesIds.length; i++) {
    for (let j = i + 1; j < speciesIds.length; j++) {
      const spA = speciesCache.get(speciesIds[i]);
      const spB = speciesCache.get(speciesIds[j]);
      if (!spA || !spB) continue;
      if (spA.badCompanions?.includes(spB.id) || spB.badCompanions?.includes(spA.id)) {
        warnings.push(`⚠️ ${spA.icon ?? "🌱"} ${spA.name} og ${spB.icon ?? "🌱"} ${spB.name} er dårlige naboer!`);
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Generate a themed bed plan
// ---------------------------------------------------------------------------
export function generateThemedBed(
  theme: "red" | "orange" | "yellow" | "pink" | "purple" | "blue" | "white" | "pollinator" | "kitchen-year-round" | "cottage" | "shade" | "drought",
  bedWidthCm: number,
  bedLengthCm: number,
): GeneratedBedPlan {
  const allPlants = getAllPlants();

  switch (theme) {
    case "red":
    case "orange":
    case "yellow":
    case "pink":
    case "purple":
    case "blue":
    case "white": {
      // Color-themed: find year-round blooms in this color
      const colorPlants = findYearRoundBloomSet(allPlants, theme);
      return {
        plants: colorPlants.map((p) => ({ species: p, count: estimateCount(p, bedWidthCm, bedLengthCm) })),
        description: colorThemeDescription(theme, colorPlants),
        coverageMonths: getCoverageMonths(colorPlants),
      };
    }
    case "pollinator": {
      // Bee-friendly: flowers with long bloom periods
      const pollinatorPlants = allPlants.filter((p) => {
        const bloom = getPlantBloomMonths(p);
        if (!bloom) return false;
        // Prefer native-ish flowers and herbs
        return (p.category === "flower" || p.category === "herb") &&
          p.goodCompanions && p.goodCompanions.length > 0;
      });
      const selected = findYearRoundBloomSet(pollinatorPlants);
      return {
        plants: selected.map((p) => ({ species: p, count: estimateCount(p, bedWidthCm, bedLengthCm) })),
        description: "🐝 Bivenligt bed med blomster der tiltrækker bestøvere hele sæsonen. " +
          `Inkluderer ${selected.map((p) => p.name).join(", ")}.`,
        coverageMonths: getCoverageMonths(selected),
      };
    }
    case "kitchen-year-round": {
      // Kitchen garden with year-round harvest
      const kitchenPlants = allPlants.filter((p) =>
        (p.category === "vegetable" || p.category === "herb") && p.harvest
      );
      // Select for coverage of harvest months
      const selected = findYearRoundHarvestSet(kitchenPlants);
      return {
        plants: selected.map((p) => ({ species: p, count: estimateCount(p, bedWidthCm, bedLengthCm) })),
        description: "🥗 Køkkenhave med høst hele året. " +
          `Inkluderer ${selected.map((p) => `${p.icon ?? "🌱"} ${p.name}`).join(", ")}.`,
        coverageMonths: selected.flatMap((p) => {
          const h = p.harvest;
          if (!h) return [];
          const months: number[] = [];
          if (h.from <= h.to) {
            for (let m = h.from; m <= h.to; m++) months.push(m);
          } else {
            for (let m = h.from; m <= 12; m++) months.push(m);
            for (let m = 1; m <= h.to; m++) months.push(m);
          }
          return months;
        }),
      };
    }
    case "cottage": {
      // Classic cottage garden mix
      const cottageIds = ["roser", "lavendel", "stokrose", "dahlia", "morgenfrue", "salvie", "timian", "kamille"];
      const selected = cottageIds.map((id) => getPlantById(id)).filter((p): p is PlantSpecies => p != null);
      return {
        plants: selected.map((p) => ({ species: p, count: estimateCount(p, bedWidthCm, bedLengthCm) })),
        description: "🏡 Klassisk cottage garden med en blanding af roser, stauder og krydderurter. " +
          "Romantisk, duftende og bivenlig.",
        coverageMonths: getCoverageMonths(selected),
      };
    }
    case "shade": {
      const shadePlants = allPlants.filter((p) => p.light === "shade" || p.light === "partial-shade");
      const selected = shadePlants.slice(0, 8);
      return {
        plants: selected.map((p) => ({ species: p, count: estimateCount(p, bedWidthCm, bedLengthCm) })),
        description: "🌤️ Skyggeplantning med planter der trives i halvskygge til fuld skygge.",
        coverageMonths: getCoverageMonths(selected),
      };
    }
    case "drought": {
      const droughtPlants = allPlants.filter((p) => p.water === "low");
      const selected = droughtPlants.slice(0, 8);
      return {
        plants: selected.map((p) => ({ species: p, count: estimateCount(p, bedWidthCm, bedLengthCm) })),
        description: "🏜️ Tørketolerant bed med planter der klarer sig med minimal vanding.",
        coverageMonths: getCoverageMonths(selected),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateCount(sp: PlantSpecies, widthCm: number, lengthCm: number): number {
  const spacing = sp.spacingCm ?? 25;
  const area = widthCm * lengthCm;
  const plantArea = spacing * (sp.rowSpacingCm ?? spacing);
  return Math.max(1, Math.floor(area / plantArea * 0.7)); // 70% fill factor
}

function getCoverageMonths(plants: PlantSpecies[]): number[] {
  const covered = new Set<number>();
  for (const p of plants) {
    const bloom = getPlantBloomMonths(p);
    if (!bloom) continue;
    if (bloom.from <= bloom.to) {
      for (let m = bloom.from; m <= bloom.to; m++) covered.add(m);
    } else {
      for (let m = bloom.from; m <= 12; m++) covered.add(m);
      for (let m = 1; m <= bloom.to; m++) covered.add(m);
    }
  }
  return [...covered].sort((a, b) => a - b);
}

function findYearRoundHarvestSet(plants: PlantSpecies[]): PlantSpecies[] {
  const covered = new Set<number>();
  const selected: PlantSpecies[] = [];

  const withHarvest = plants
    .filter((p) => p.harvest)
    .map((p) => {
      const h = p.harvest!;
      const duration = h.from <= h.to ? h.to - h.from + 1 : 12 - h.from + h.to + 1;
      return { plant: p, harvest: h, duration };
    })
    .sort((a, b) => b.duration - a.duration);

  while (covered.size < 12 && withHarvest.length > 0) {
    let bestIdx = 0;
    let bestNew = 0;
    for (let i = 0; i < withHarvest.length; i++) {
      let newCov = 0;
      const h = withHarvest[i].harvest;
      for (let m = 1; m <= 12; m++) {
        if (!covered.has(m) && monthInRange(m, h)) newCov++;
      }
      if (newCov > bestNew) { bestNew = newCov; bestIdx = i; }
    }
    if (bestNew === 0) break;
    const chosen = withHarvest.splice(bestIdx, 1)[0];
    selected.push(chosen.plant);
    for (let m = 1; m <= 12; m++) {
      if (monthInRange(m, chosen.harvest)) covered.add(m);
    }
  }
  return selected;
}

function colorThemeDescription(theme: PlantColorFamily, plants: PlantSpecies[]): string {
  const labels: Record<string, string> = {
    red: "🔴 Rødt bed", orange: "🟠 Orange bed", yellow: "🟡 Gult bed",
    pink: "🩷 Pink/rosa bed", purple: "🟣 Lilla bed", blue: "🔵 Blåt bed",
    white: "⚪ Hvidt bed",
  };
  const label = labels[theme] ?? `${theme} bed`;
  const coverage = getCoverageMonths(plants);
  const monthCount = coverage.length;
  return `${label} med blomster i ${monthCount} af årets 12 måneder. ` +
    `Inkluderer ${plants.map((p) => `${p.icon ?? "🌱"} ${p.name}`).join(", ")}.`;
}
