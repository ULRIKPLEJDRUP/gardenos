// ---------------------------------------------------------------------------
// GardenOS – Year Wheel Store (Årshjul)
// ---------------------------------------------------------------------------
// Manages: month-by-month garden task templates + custom user tasks
// Uses localStorage for persistence.
// ---------------------------------------------------------------------------

import { getAllPlants } from "./plantStore";
import type { PlantSpecies } from "./plantTypes";
import { userKey, markDirty } from "./userStorage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Task categories shown in the year wheel */
export type TaskCategory =
  | "pruning"       // Beskæring
  | "sowing"        // Såning
  | "planting"      // Udplantning / plantning
  | "pre-sprouting" // Forspiring
  | "watering"      // Vanding
  | "composting"    // Kompost
  | "fertilizing"   // Gødning
  | "pest-control"  // Sprøjtning / skadedyr
  | "harvesting"    // Høst
  | "maintenance"   // Vedligeholdelse
  | "planning"      // Planlægning
  | "protection"    // Beskyttelse / vinterdækning
  | "other";        // Andet

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  pruning: "Beskæring",
  sowing: "Såning",
  planting: "Udplantning",
  "pre-sprouting": "Forspiring",
  watering: "Vanding",
  composting: "Kompost",
  fertilizing: "Gødning",
  "pest-control": "Skadedyr & sygdom",
  harvesting: "Høst",
  maintenance: "Vedligeholdelse",
  planning: "Planlægning",
  protection: "Beskyttelse",
  other: "Andet",
};

export const TASK_CATEGORY_ICONS: Record<TaskCategory, string> = {
  pruning: "✂️",
  sowing: "🌱",
  planting: "🌿",
  "pre-sprouting": "🌾",
  watering: "💧",
  composting: "🍂",
  fertilizing: "🧪",
  "pest-control": "🐛",
  harvesting: "🧺",
  maintenance: "🔧",
  planning: "📋",
  protection: "🛡️",
  other: "📌",
};

export const TASK_CATEGORY_COLORS: Record<TaskCategory, string> = {
  pruning: "#8B5CF6",       // violet
  sowing: "#10B981",        // emerald
  planting: "#059669",      // green
  "pre-sprouting": "#F59E0B", // amber
  watering: "#3B82F6",      // blue
  composting: "#92400E",    // brown
  fertilizing: "#6366F1",   // indigo
  "pest-control": "#EF4444", // red
  harvesting: "#F97316",    // orange
  maintenance: "#6B7280",   // gray
  planning: "#8B5CF6",      // violet
  protection: "#0EA5E9",    // sky
  other: "#9CA3AF",         // gray
};

export type YearWheelTask = {
  id: string;
  /** Month 1–12 */
  month: number;
  /** Task title */
  title: string;
  /** Task category */
  category: TaskCategory;
  /** Optional longer description */
  description?: string;
  /** Linked plant species id (for auto-generated tasks) */
  speciesId?: string;
  /** Whether this is a user-created (custom) task */
  isCustom: boolean;
  /** Whether this task is completed (for the current year) */
  completed?: boolean;
};

// ---------------------------------------------------------------------------
// Month labels
// ---------------------------------------------------------------------------

export const MONTH_LABELS = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Maj", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
];

export const MONTH_EMOJIS = [
  "❄️", "🌨️", "🌸", "🌷", "☀️", "🌞",
  "🌻", "🍎", "🍂", "🎃", "🍁", "🎄",
];

// ---------------------------------------------------------------------------
// Built-in garden task templates (Danish climate zone 7–8)
// ---------------------------------------------------------------------------

export const BUILTIN_TASKS: Omit<YearWheelTask, "id">[] = [
  // ── Januar ──
  { month: 1, title: "Planlæg årets have", category: "planning", description: "Gennemgå frøkataloger, tegn bede og lav en planteplan for sæsonen.", isCustom: false },
  { month: 1, title: "Bestil frø og løg", category: "planning", description: "Bestil frø tidligt for at sikre de bedste sorter.", isCustom: false },
  { month: 1, title: "Tjek opbevaret frugt & grønt", category: "maintenance", description: "Gennemgå lagrede kartofler, løg og æbler. Fjern rådne.", isCustom: false },
  { month: 1, title: "Forspir chili & peber indendørs", category: "pre-sprouting", description: "Chili og peber kræver lang vækstsæson – start i januar.", isCustom: false },

  // ── Februar ──
  { month: 2, title: "Beskær frugttræer", category: "pruning", description: "Fjern dødt træ og form kronen inden knopperne bryder.", isCustom: false },
  { month: 2, title: "Forspir tomater indendørs", category: "pre-sprouting", description: "Så tomater i potter indendørs 6–8 uger før udplantning.", isCustom: false },
  { month: 2, title: "Start kompostbunke", category: "composting", description: "Vend komposten og tilsæt nyt materiale.", isCustom: false },
  { month: 2, title: "Klargør bede under fiberdug", category: "maintenance", description: "Læg fiberdug over bede for at varme jorden op.", isCustom: false },

  // ── Marts ──
  { month: 3, title: "Så ærter & bønner direkte", category: "sowing", description: "Ærter kan sås allerede nu hvis jorden er tøet.", isCustom: false },
  { month: 3, title: "Forspir kål indendørs", category: "pre-sprouting", description: "Blomkål, broccoli og spidskål sås i potter.", isCustom: false },
  { month: 3, title: "Plant tidlige kartofler", category: "planting", description: "Læggekartofler sættes til forspiring i lys.", isCustom: false },
  { month: 3, title: "Beskær roser", category: "pruning", description: "Skær ned til 3–5 knopper over jordniveau.", isCustom: false },
  { month: 3, title: "Gød stauder & buske", category: "fertilizing", description: "Giv stauder og buske en omgang kompost eller gødning.", isCustom: false },

  // ── April ──
  { month: 4, title: "Så gulerødder, radiser, spinat", category: "sowing", description: "Direkte såning i friland når jorden er 8°C+.", isCustom: false },
  { month: 4, title: "Plant ud: kål, salat, løg", category: "planting", description: "Hærdede planter kan nu plantes ud under fiberdug.", isCustom: false },
  { month: 4, title: "Gød græsplæne", category: "fertilizing", description: "Giv plænen forårs-gødning og fjern mos.", isCustom: false },
  { month: 4, title: "Bekæmp snegle tidligt", category: "pest-control", description: "Sæt sneglefælder op inden de bliver et problem.", isCustom: false },
  { month: 4, title: "Så sommerblomster", category: "sowing", description: "Cosmos, solsikker, morgenfrue og ærteblomst.", isCustom: false },

  // ── Maj ──
  { month: 5, title: "Plant tomater & agurker ud", category: "planting", description: "Efter sidste frost (ca. medio maj) kan varmekrævende plantes ud.", isCustom: false },
  { month: 5, title: "Plant squash & græskar", category: "planting", description: "Direkte såning eller udplantning af forspirrede.", isCustom: false },
  { month: 5, title: "Vand regelmæssigt", category: "watering", description: "Nye planter og frø har brug for jævn fugt.", isCustom: false },
  { month: 5, title: "Lug ukrudt", category: "maintenance", description: "Hold bedene rene – ukrudt vokser hurtigt nu.", isCustom: false },
  { month: 5, title: "Opbind og støt tomater", category: "maintenance", description: "Sæt stokke/bur op tidligt for god støtte.", isCustom: false },

  // ── Juni ──
  { month: 6, title: "Høst tidlige afgrøder", category: "harvesting", description: "Radiser, salat, spinat og forårsløg er klar.", isCustom: false },
  { month: 6, title: "Vand dybt i tørre perioder", category: "watering", description: "Giv hellere meget vand sjældent end lidt ofte.", isCustom: false },
  { month: 6, title: "Fjern udløbere fra jordbær", category: "pruning", description: "Klip udløbere for at holde energien i frugten.", isCustom: false },
  { month: 6, title: "Så efterårsafgrøder (grønkål)", category: "sowing", description: "Grønkål, palmekål og rosenkål sås til vintergrønt.", isCustom: false },
  { month: 6, title: "Pinch tomatskud", category: "pruning", description: "Fjern sideskud på tomater for bedre frugt.", isCustom: false },

  // ── Juli ──
  { month: 7, title: "Høst bær (jordbær, ribs, solbær)", category: "harvesting", description: "Pluk jævnligt for at holde produktionen i gang.", isCustom: false },
  { month: 7, title: "Vand intensivt", category: "watering", description: "Sommervarme kræver daglig vanding af potter og nyplantede.", isCustom: false },
  { month: 7, title: "Så vintergulerod & vinterløg", category: "sowing", description: "Gulerødder til vinter/efterår sås nu.", isCustom: false },
  { month: 7, title: "Høst kartofler (tidlige)", category: "harvesting", description: "Grave tidlige kartofler op når toppen visner.", isCustom: false },
  { month: 7, title: "Gødsk tomater & peberfrugter", category: "fertilizing", description: "Kaliumrig gødning fremmer frugtsætning.", isCustom: false },

  // ── August ──
  { month: 8, title: "Høst tomater & agurker", category: "harvesting", description: "Højsæson for mange køkken-afgrøder.", isCustom: false },
  { month: 8, title: "Konservér & frys ned", category: "harvesting", description: "Lav sylt, fryse ned og tør krydderurter.", isCustom: false },
  { month: 8, title: "Så efterårssalat & spinat", category: "sowing", description: "Hurtige afgrøder til sen høst.", isCustom: false },
  { month: 8, title: "Plant jordbær til næste år", category: "planting", description: "August er ideel for nye jordbærplanter.", isCustom: false },
  { month: 8, title: "Beskær sommerbærende hindbær", category: "pruning", description: "Fjern bærende skud efter høst.", isCustom: false },

  // ── September ──
  { month: 9, title: "Høst æbler & pærer", category: "harvesting", description: "Test modenhed – frugten skal let løsne.", isCustom: false },
  { month: 9, title: "Plant hvidløg", category: "planting", description: "Hvidløg plantes nu for høst til næste sommer.", isCustom: false },
  { month: 9, title: "Så grøngødning / dækafgrøder", category: "sowing", description: "Rug, vikke eller kløver beskytter og beriger jorden.", isCustom: false },
  { month: 9, title: "Høst squash & græskar", category: "harvesting", description: "Høst før første frost og lad tørre i solen.", isCustom: false },
  { month: 9, title: "Ryd udtjente planter", category: "maintenance", description: "Fjern afgrøder der er færdige og læg dem i komposten.", isCustom: false },

  // ── Oktober ──
  { month: 10, title: "Plant forårsløg (tulipaner, krokus)", category: "planting", description: "Sæt løg i jorden for forårsblomstring.", isCustom: false },
  { month: 10, title: "Dæk bede med kompost/muld", category: "composting", description: "Vinterdækning beskytter jorden og forbedrer strukturen.", isCustom: false },
  { month: 10, title: "Høst sene kartofler", category: "harvesting", description: "Grav op i tørt vejr og opbevar mørkt og køligt.", isCustom: false },
  { month: 10, title: "Ryd op og klargør til vinter", category: "maintenance", description: "Fjern vissent plantemateriale og rengør bede.", isCustom: false },
  { month: 10, title: "Flyt krukker indendørs", category: "protection", description: "Frostfølsomme planter bringes i læ.", isCustom: false },

  // ── November ──
  { month: 11, title: "Dæk sarte planter med halm/flis", category: "protection", description: "Rosmariner, lavendel og andre halvhårdføre dækkes.", isCustom: false },
  { month: 11, title: "Rengør og olier haveredskaber", category: "maintenance", description: "Vedligehold redskaber så de holder mange år.", isCustom: false },
  { month: 11, title: "Høst grønkål & rosenkål", category: "harvesting", description: "Frost gør dem sødere – lad dem stå og høst løbende.", isCustom: false },
  { month: 11, title: "Vend kompostbunken", category: "composting", description: "Sørg for god iltning inden vinteren.", isCustom: false },

  // ── December ──
  { month: 12, title: "Planlæg næste sæson", category: "planning", description: "Lav sæsonplanen mens erfaringerne er friske.", isCustom: false },
  { month: 12, title: "Tjek vinterbeskyttelse", category: "protection", description: "Kontrollér fiberdug og vinterdækning efter storm.", isCustom: false },
  { month: 12, title: "Gro spirer & mikrogrønt indendørs", category: "sowing", description: "Frisk grønt hele vinteren med spirer i vindueskarmen.", isCustom: false },
  { month: 12, title: "Bestil frøkataloger", category: "planning", description: "Tilmeld dig nyhedsbreve fra frøfirmaer.", isCustom: false },
];

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_CUSTOM_TASKS_KEY = "gardenos:yearwheel:custom:v1";
const STORAGE_COMPLETED_KEY = "gardenos:yearwheel:completed:v1";

export function loadCustomTasks(): YearWheelTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(userKey(STORAGE_CUSTOM_TASKS_KEY));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

export function saveCustomTasks(tasks: YearWheelTask[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_CUSTOM_TASKS_KEY), JSON.stringify(tasks));
  markDirty(STORAGE_CUSTOM_TASKS_KEY);
}

export function loadCompletedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(userKey(STORAGE_COMPLETED_KEY));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}

export function saveCompletedIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_COMPLETED_KEY), JSON.stringify([...ids]));
  markDirty(STORAGE_COMPLETED_KEY);
}

// ---------------------------------------------------------------------------
// Generate tasks from registered plant species
// ---------------------------------------------------------------------------

function monthInRange(month: number, from: number, to: number): boolean {
  if (from <= to) return month >= from && month <= to;
  // Wraps around year-end (e.g. nov–feb)
  return month >= from || month <= to;
}

/** Generate per-month tasks from the plant database based on their sow/plant/harvest windows */
export function generatePlantTasks(plants: PlantSpecies[]): Omit<YearWheelTask, "id">[] {
  const tasks: Omit<YearWheelTask, "id">[] = [];

  for (const plant of plants) {
    // Indoor sowing
    if (plant.sowIndoor) {
      for (let m = 1; m <= 12; m++) {
        if (monthInRange(m, plant.sowIndoor.from, plant.sowIndoor.to)) {
          tasks.push({
            month: m,
            title: `Forspir ${plant.name} indendørs`,
            category: "pre-sprouting",
            description: `${plant.icon ?? "🌱"} Så ${plant.name} i potter indendørs.`,
            speciesId: plant.id,
            isCustom: false,
          });
        }
      }
    }

    // Outdoor sowing
    if (plant.sowOutdoor) {
      for (let m = 1; m <= 12; m++) {
        if (monthInRange(m, plant.sowOutdoor.from, plant.sowOutdoor.to)) {
          tasks.push({
            month: m,
            title: `Så ${plant.name} udendørs`,
            category: "sowing",
            description: `${plant.icon ?? "🌱"} Direkte såning af ${plant.name} i friland.`,
            speciesId: plant.id,
            isCustom: false,
          });
        }
      }
    }

    // Plant out / transplant
    if (plant.plantOut) {
      for (let m = 1; m <= 12; m++) {
        if (monthInRange(m, plant.plantOut.from, plant.plantOut.to)) {
          tasks.push({
            month: m,
            title: `Plant ${plant.name} ud`,
            category: "planting",
            description: `${plant.icon ?? "🌿"} Udplant ${plant.name} i haven.`,
            speciesId: plant.id,
            isCustom: false,
          });
        }
      }
    }

    // Harvest
    if (plant.harvest) {
      for (let m = 1; m <= 12; m++) {
        if (monthInRange(m, plant.harvest.from, plant.harvest.to)) {
          tasks.push({
            month: m,
            title: `Høst ${plant.name}`,
            category: "harvesting",
            description: `${plant.icon ?? "🧺"} ${plant.name} er klar til høst.${plant.harvestTips ? " " + plant.harvestTips : ""}`,
            speciesId: plant.id,
            isCustom: false,
          });
        }
      }
    }
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Merge all tasks for a given month
// ---------------------------------------------------------------------------

let taskIdCounter = 0;
function makeId(prefix: string): string {
  return `${prefix}-${++taskIdCounter}-${Date.now().toString(36)}`;
}

export function getAllTasksForMonth(month: number, showPlantTasks: boolean): YearWheelTask[] {
  // Built-in template tasks
  const builtins: YearWheelTask[] = BUILTIN_TASKS
    .filter((t) => t.month === month)
    .map((t) => ({ ...t, id: makeId("builtin") }));

  // Plant-generated tasks
  let plantTasks: YearWheelTask[] = [];
  if (showPlantTasks) {
    const allPlants = getAllPlants();
    plantTasks = generatePlantTasks(allPlants)
      .filter((t) => t.month === month)
      .map((t) => ({ ...t, id: makeId("plant") }));
  }

  // Custom user tasks
  const customs = loadCustomTasks().filter((t) => t.month === month);

  // Merge completed state
  const completedIds = loadCompletedIds();

  return [...builtins, ...plantTasks, ...customs].map((t) => ({
    ...t,
    completed: completedIds.has(t.id),
  }));
}

/** Create a new custom task */
export function addCustomTask(task: Omit<YearWheelTask, "id" | "isCustom">): YearWheelTask {
  const customs = loadCustomTasks();
  const newTask: YearWheelTask = {
    ...task,
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    isCustom: true,
  };
  customs.push(newTask);
  saveCustomTasks(customs);
  return newTask;
}

/** Delete a custom task */
export function deleteCustomTask(id: string): void {
  const customs = loadCustomTasks().filter((t) => t.id !== id);
  saveCustomTasks(customs);
}

/** Update a custom task */
export function updateCustomTask(id: string, updates: Partial<YearWheelTask>): void {
  const customs = loadCustomTasks();
  const idx = customs.findIndex((t) => t.id === id);
  if (idx >= 0) {
    customs[idx] = { ...customs[idx], ...updates };
    saveCustomTasks(customs);
  }
}

/** Toggle task completion */
export function toggleTaskComplete(id: string): boolean {
  const completed = loadCompletedIds();
  if (completed.has(id)) {
    completed.delete(id);
  } else {
    completed.add(id);
  }
  saveCompletedIds(completed);
  return completed.has(id);
}
