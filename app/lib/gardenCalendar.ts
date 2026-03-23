// ---------------------------------------------------------------------------
// GardenOS – Auto Garden Calendar (Phase 6 · Feature 3)
// ---------------------------------------------------------------------------
// Generates a month-by-month activity calendar from the user's actual
// planted species and their sowing/planting/harvest windows.
// ---------------------------------------------------------------------------

import type { PlantSpecies, PlantInstance, MonthRange } from "./plantTypes";
import { getPlantById, loadPlantInstances } from "./plantStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalendarActivityType =
  | "sow-indoor"
  | "sow-outdoor"
  | "plant-out"
  | "harvest"
  | "maintain";

export type CalendarActivity = {
  /** Which month (1-12) */
  month: number;
  /** Activity type */
  type: CalendarActivityType;
  /** Emoji icon */
  icon: string;
  /** Human-readable label (Danish) */
  label: string;
  /** Plant species name */
  plantName: string;
  /** Plant species ID */
  plantId: string;
  /** Which bed/feature this relates to */
  featureId: string;
  /** Bed name */
  bedName: string;
};

export type CalendarMonth = {
  month: number;
  name: string;
  activities: CalendarActivity[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_NAMES_DA = [
  "", "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

const MONTH_SHORT_DA = [
  "", "Jan", "Feb", "Mar", "Apr", "Maj", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
];

const ACTIVITY_CONFIG: Record<CalendarActivityType, { icon: string; label: string; color: string; bg: string }> = {
  "sow-indoor":  { icon: "🏠", label: "Så indendørs",   color: "text-purple-700", bg: "bg-purple-50" },
  "sow-outdoor": { icon: "🌱", label: "Så udendørs",    color: "text-green-700",  bg: "bg-green-50" },
  "plant-out":   { icon: "🪴", label: "Plant ud",        color: "text-blue-700",   bg: "bg-blue-50" },
  "harvest":     { icon: "🧺", label: "Høst",            color: "text-amber-700",  bg: "bg-amber-50" },
  "maintain":    { icon: "🔧", label: "Vedligehold",     color: "text-gray-700",   bg: "bg-gray-50" },
};

export { ACTIVITY_CONFIG, MONTH_NAMES_DA, MONTH_SHORT_DA };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInMonthRange(month: number, range: MonthRange): boolean {
  const { from, to } = range;
  if (from <= to) return month >= from && month <= to;
  return month >= from || month <= to;
}

function expandMonthRange(range: MonthRange): number[] {
  const months: number[] = [];
  if (range.from <= range.to) {
    for (let m = range.from; m <= range.to; m++) months.push(m);
  } else {
    for (let m = range.from; m <= 12; m++) months.push(m);
    for (let m = 1; m <= range.to; m++) months.push(m);
  }
  return months;
}

// ---------------------------------------------------------------------------
// Core: Generate calendar from planted features
// ---------------------------------------------------------------------------

/**
 * Build a full-year activity calendar from the user's planted species.
 * 
 * @param bedNames — Optional map of featureId → bedName for display purposes
 * @returns 12 CalendarMonth objects, one per month
 */
export function buildGardenCalendar(bedNames?: Map<string, string>): CalendarMonth[] {
  const allActivities: CalendarActivity[] = [];
  const instances = loadPlantInstances();

  // Track unique species per bed to avoid duplicates
  const seen = new Set<string>();

  for (const inst of instances) {
    const key = `${inst.featureId}:${inst.speciesId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const species = getPlantById(inst.speciesId);
    if (!species) continue;

    const bedName = bedNames?.get(inst.featureId) ?? inst.featureId.slice(0, 6);

    // Sow indoor
    if (species.sowIndoor) {
      for (const m of expandMonthRange(species.sowIndoor)) {
        allActivities.push({
          month: m,
          type: "sow-indoor",
          icon: "🏠",
          label: `Så ${species.name} indendørs`,
          plantName: species.name,
          plantId: species.id,
          featureId: inst.featureId,
          bedName,
        });
      }
    }

    // Sow outdoor
    if (species.sowOutdoor) {
      for (const m of expandMonthRange(species.sowOutdoor)) {
        allActivities.push({
          month: m,
          type: "sow-outdoor",
          icon: "🌱",
          label: `Så ${species.name} udendørs`,
          plantName: species.name,
          plantId: species.id,
          featureId: inst.featureId,
          bedName,
        });
      }
    }

    // Plant out
    if (species.plantOut) {
      for (const m of expandMonthRange(species.plantOut)) {
        allActivities.push({
          month: m,
          type: "plant-out",
          icon: "🪴",
          label: `Plant ${species.name} ud`,
          plantName: species.name,
          plantId: species.id,
          featureId: inst.featureId,
          bedName,
        });
      }
    }

    // Harvest
    if (species.harvest) {
      for (const m of expandMonthRange(species.harvest)) {
        allActivities.push({
          month: m,
          type: "harvest",
          icon: "🧺",
          label: `Høst ${species.name}`,
          plantName: species.name,
          plantId: species.id,
          featureId: inst.featureId,
          bedName,
        });
      }
    }
  }

  // Build 12 months
  const calendar: CalendarMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const monthActivities = allActivities
      .filter((a) => a.month === m)
      .sort((a, b) => {
        // Sort by type priority: sow-indoor, sow-outdoor, plant-out, harvest
        const typeOrder: CalendarActivityType[] = ["sow-indoor", "sow-outdoor", "plant-out", "harvest", "maintain"];
        const ai = typeOrder.indexOf(a.type);
        const bi = typeOrder.indexOf(b.type);
        if (ai !== bi) return ai - bi;
        return a.plantName.localeCompare(b.plantName, "da");
      });

    calendar.push({
      month: m,
      name: MONTH_NAMES_DA[m],
      activities: monthActivities,
    });
  }

  return calendar;
}

/**
 * Get activities for the current month + upcoming.
 */
export function getUpcomingActivities(calendar: CalendarMonth[], lookaheadMonths = 2): CalendarActivity[] {
  const currentMonth = new Date().getMonth() + 1;
  const activities: CalendarActivity[] = [];
  for (let offset = 0; offset < lookaheadMonths; offset++) {
    const m = ((currentMonth - 1 + offset) % 12) + 1;
    const monthData = calendar.find((c) => c.month === m);
    if (monthData) {
      activities.push(...monthData.activities);
    }
  }
  return activities;
}

/**
 * Count activities per month for a mini-chart visualization.
 */
export function activityCountsPerMonth(calendar: CalendarMonth[]): number[] {
  return calendar.map((m) => m.activities.length);
}
