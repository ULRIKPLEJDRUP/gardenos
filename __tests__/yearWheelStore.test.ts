// ---------------------------------------------------------------------------
// yearWheelStore – unit tests
// ---------------------------------------------------------------------------
// Tests for localStorage-backed CRUD, built-in tasks, generatePlantTasks,
// and month-based task retrieval.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Provide a minimal window + localStorage so the store functions don't early-return ──
const store: Record<string, string> = {};
const fakeStorage = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { store[key] = val; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(() => null),
};
// @ts-expect-error — minimal browser-like global
globalThis.window = globalThis;
// @ts-expect-error — attach minimal localStorage
(globalThis as Record<string, unknown>).localStorage = fakeStorage;

// ── Mock userStorage before importing the store ──
vi.mock("../app/lib/userStorage", () => ({
  userKey: (k: string) => `test:${k}`,
  markDirty: vi.fn(),
  pullFromServer: vi.fn(),
}));

// ── Mock plantStore to avoid loading real data ──
vi.mock("../app/lib/plantStore", () => ({
  getAllPlants: vi.fn(() => []),
}));

import {
  BUILTIN_TASKS,
  MONTH_LABELS,
  MONTH_SHORT,
  MONTH_EMOJIS,
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_ICONS,
  TASK_CATEGORY_COLORS,
  loadCustomTasks,
  saveCustomTasks,
  loadCompletedIds,
  saveCompletedIds,
  generatePlantTasks,
  addCustomTask,
  deleteCustomTask,
  updateCustomTask,
  toggleTaskComplete,
  getAllTasksForMonth,
} from "../app/lib/yearWheelStore";
import type { YearWheelTask, TaskCategory } from "../app/lib/yearWheelStore";
import type { PlantSpecies } from "../app/lib/plantTypes";

// ── Reset localStorage store between tests ──
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  fakeStorage.getItem.mockImplementation((key: string) => store[key] ?? null);
  fakeStorage.setItem.mockImplementation((key: string, val: string) => { store[key] = val; });
  fakeStorage.removeItem.mockImplementation((key: string) => { delete store[key]; });
});

function sp(overrides: Partial<PlantSpecies> & { id: string; name: string; category: PlantSpecies["category"] }): PlantSpecies {
  return overrides as unknown as PlantSpecies;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Constants
// ═══════════════════════════════════════════════════════════════════════════
describe("constants", () => {
  it("MONTH_LABELS has 12 entries", () => {
    expect(MONTH_LABELS).toHaveLength(12);
    expect(MONTH_LABELS[0]).toBe("Januar");
    expect(MONTH_LABELS[11]).toBe("December");
  });

  it("MONTH_SHORT has 12 entries", () => {
    expect(MONTH_SHORT).toHaveLength(12);
    expect(MONTH_SHORT[0]).toBe("Jan");
  });

  it("MONTH_EMOJIS has 12 entries", () => {
    expect(MONTH_EMOJIS).toHaveLength(12);
  });

  it("TASK_CATEGORY_LABELS covers all categories", () => {
    const cats: TaskCategory[] = [
      "pruning", "sowing", "planting", "pre-sprouting", "watering",
      "composting", "fertilizing", "pest-control", "harvesting",
      "maintenance", "planning", "protection", "other",
    ];
    for (const c of cats) {
      expect(TASK_CATEGORY_LABELS[c]).toBeTruthy();
      expect(TASK_CATEGORY_ICONS[c]).toBeTruthy();
      expect(TASK_CATEGORY_COLORS[c]).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. BUILTIN_TASKS
// ═══════════════════════════════════════════════════════════════════════════
describe("BUILTIN_TASKS", () => {
  it("has tasks for every month 1–12", () => {
    for (let m = 1; m <= 12; m++) {
      const tasks = BUILTIN_TASKS.filter((t) => t.month === m);
      expect(tasks.length).toBeGreaterThan(0);
    }
  });

  it("all built-in tasks have isCustom: false", () => {
    for (const t of BUILTIN_TASKS) {
      expect(t.isCustom).toBe(false);
    }
  });

  it("all tasks have valid categories", () => {
    for (const t of BUILTIN_TASKS) {
      expect(TASK_CATEGORY_LABELS[t.category]).toBeTruthy();
    }
  });

  it("total count is reasonable (50–80)", () => {
    expect(BUILTIN_TASKS.length).toBeGreaterThanOrEqual(50);
    expect(BUILTIN_TASKS.length).toBeLessThanOrEqual(80);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. localStorage persistence
// ═══════════════════════════════════════════════════════════════════════════
describe("loadCustomTasks / saveCustomTasks", () => {
  it("returns empty array when nothing saved", () => {
    expect(loadCustomTasks()).toEqual([]);
  });

  it("round-trips tasks through localStorage", () => {
    const tasks: YearWheelTask[] = [
      { id: "c1", month: 3, title: "Test", category: "other", isCustom: true },
    ];
    saveCustomTasks(tasks);
    expect(loadCustomTasks()).toEqual(tasks);
  });

  it("handles corrupt data gracefully", () => {
    store["test:gardenos:yearwheel:custom:v1"] = "not-json";
    expect(loadCustomTasks()).toEqual([]);
  });
});

describe("loadCompletedIds / saveCompletedIds", () => {
  it("returns empty set when nothing saved", () => {
    expect(loadCompletedIds().size).toBe(0);
  });

  it("round-trips a set of IDs", () => {
    const ids = new Set(["a", "b", "c"]);
    saveCompletedIds(ids);
    const loaded = loadCompletedIds();
    expect(loaded.size).toBe(3);
    expect(loaded.has("a")).toBe(true);
    expect(loaded.has("b")).toBe(true);
    expect(loaded.has("c")).toBe(true);
  });

  it("handles corrupt data gracefully", () => {
    store["test:gardenos:yearwheel:completed:v1"] = "not-json";
    expect(loadCompletedIds().size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. generatePlantTasks
// ═══════════════════════════════════════════════════════════════════════════
describe("generatePlantTasks", () => {
  it("generates no tasks for a plant with no windows", () => {
    const plant = sp({ id: "x", name: "X", category: "vegetable" });
    expect(generatePlantTasks([plant])).toEqual([]);
  });

  it("generates sowing tasks for sowOutdoor window", () => {
    const plant = sp({
      id: "carrot", name: "Gulerod", category: "vegetable",
      sowOutdoor: { from: 4, to: 6 },
    });
    const tasks = generatePlantTasks([plant]);
    const sowing = tasks.filter((t) => t.category === "sowing");
    expect(sowing).toHaveLength(3); // April, May, June
    expect(sowing.every((t) => t.month >= 4 && t.month <= 6)).toBe(true);
    expect(sowing[0].title).toContain("Gulerod");
    expect(sowing[0].speciesId).toBe("carrot");
  });

  it("generates pre-sprouting tasks for sowIndoor window", () => {
    const plant = sp({
      id: "tomato", name: "Tomat", category: "vegetable",
      sowIndoor: { from: 2, to: 3 },
    });
    const tasks = generatePlantTasks([plant]);
    const indoor = tasks.filter((t) => t.category === "pre-sprouting");
    expect(indoor).toHaveLength(2);
    expect(indoor[0].month).toBe(2);
    expect(indoor[1].month).toBe(3);
  });

  it("generates planting tasks for plantOut window", () => {
    const plant = sp({
      id: "tomato", name: "Tomat", category: "vegetable",
      plantOut: { from: 5, to: 6 },
    });
    const tasks = generatePlantTasks([plant]);
    const planting = tasks.filter((t) => t.category === "planting");
    expect(planting).toHaveLength(2);
  });

  it("generates harvest tasks for harvest window", () => {
    const plant = sp({
      id: "tomato", name: "Tomat", category: "vegetable",
      harvest: { from: 7, to: 9 },
    });
    const tasks = generatePlantTasks([plant]);
    const harvest = tasks.filter((t) => t.category === "harvesting");
    expect(harvest).toHaveLength(3);
    expect(harvest[0].month).toBe(7);
  });

  it("handles wrap-around windows (e.g., Nov–Feb)", () => {
    const plant = sp({
      id: "x", name: "X", category: "vegetable",
      harvest: { from: 11, to: 2 },
    });
    const tasks = generatePlantTasks([plant]);
    const months = tasks.map((t) => t.month).sort((a, b) => a - b);
    expect(months).toEqual([1, 2, 11, 12]);
  });

  it("includes harvestTips in description when present", () => {
    const plant = sp({
      id: "x", name: "X", category: "vegetable",
      harvest: { from: 8, to: 8 },
      harvestTips: "Pluk jævnligt.",
    });
    const tasks = generatePlantTasks([plant]);
    expect(tasks[0].description).toContain("Pluk jævnligt.");
  });

  it("generates tasks for multiple plants", () => {
    const plants = [
      sp({ id: "a", name: "A", category: "vegetable", sowOutdoor: { from: 4, to: 4 } }),
      sp({ id: "b", name: "B", category: "herb", harvest: { from: 7, to: 7 } }),
    ];
    const tasks = generatePlantTasks(plants);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].speciesId).toBe("a");
    expect(tasks[1].speciesId).toBe("b");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CRUD operations
// ═══════════════════════════════════════════════════════════════════════════
describe("addCustomTask", () => {
  it("creates a task with isCustom: true and unique id", () => {
    const task = addCustomTask({ month: 4, title: "Test task", category: "other" });
    expect(task.isCustom).toBe(true);
    expect(task.id).toContain("custom-");
    expect(task.title).toBe("Test task");
    expect(task.month).toBe(4);
  });

  it("persists to localStorage", () => {
    addCustomTask({ month: 5, title: "Saved", category: "sowing" });
    const loaded = loadCustomTasks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe("Saved");
  });
});

describe("deleteCustomTask", () => {
  it("removes task by id", () => {
    const t1 = addCustomTask({ month: 1, title: "A", category: "other" });
    addCustomTask({ month: 2, title: "B", category: "other" });
    deleteCustomTask(t1.id);
    const remaining = loadCustomTasks();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe("B");
  });
});

describe("updateCustomTask", () => {
  it("updates fields of an existing task", () => {
    const t = addCustomTask({ month: 3, title: "Old", category: "other" });
    updateCustomTask(t.id, { title: "New" });
    const loaded = loadCustomTasks();
    expect(loaded[0].title).toBe("New");
    expect(loaded[0].month).toBe(3);
  });

  it("does nothing for non-existent id", () => {
    addCustomTask({ month: 1, title: "X", category: "other" });
    updateCustomTask("nonexistent", { title: "Y" });
    expect(loadCustomTasks()[0].title).toBe("X");
  });
});

describe("toggleTaskComplete", () => {
  it("toggles completion on", () => {
    const result = toggleTaskComplete("task-1");
    expect(result).toBe(true);
    expect(loadCompletedIds().has("task-1")).toBe(true);
  });

  it("toggles completion off", () => {
    toggleTaskComplete("task-1"); // on
    const result = toggleTaskComplete("task-1"); // off
    expect(result).toBe(false);
    expect(loadCompletedIds().has("task-1")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. getAllTasksForMonth
// ═══════════════════════════════════════════════════════════════════════════
describe("getAllTasksForMonth", () => {
  it("returns built-in tasks for a month", () => {
    const tasks = getAllTasksForMonth(1, false);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.id.startsWith("builtin-"))).toBe(true);
  });

  it("includes custom tasks for the month", () => {
    addCustomTask({ month: 6, title: "Custom June task", category: "other" });
    const tasks = getAllTasksForMonth(6, false);
    const custom = tasks.filter((t) => t.isCustom);
    expect(custom).toHaveLength(1);
    expect(custom[0].title).toBe("Custom June task");
  });

  it("marks completed custom tasks correctly", () => {
    const task = addCustomTask({ month: 1, title: "Check me", category: "other" });
    toggleTaskComplete(task.id);
    const tasks = getAllTasksForMonth(1, false);
    const found = tasks.find((t) => t.id === task.id);
    expect(found?.completed).toBe(true);
  });
});
