// ---------------------------------------------------------------------------
// GardenOS – Task Store (Opgaveliste / Backlog)
// ---------------------------------------------------------------------------
// A personal task/idea list that can optionally be pushed to the Year Wheel.
// Tasks can originate from: manual entry, AI advisor suggestions, etc.
// Uses localStorage for persistence.
// ---------------------------------------------------------------------------

import type { TaskCategory } from "./yearWheelStore";
import { addCustomTask } from "./yearWheelStore";
import { userKey, markDirty } from "./userStorage";

// ---------------------------------------------------------------------------
// Text helpers – strip markdown & extract months from AI text
// ---------------------------------------------------------------------------

const DA_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, marts: 3, april: 4, maj: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, december: 12,
};

/** Remove markdown formatting so text is clean for task cards */
export function stripMarkdown(text: string): string {
  return text
    // Remove heading markers
    .replace(/^#{1,6}\s+/gm, "")
    // Bold/italic → keep inner text
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    // Bullet list dashes/asterisks → bullet char
    .replace(/^\s*[-*]\s+/gm, "• ")
    // Remove links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, "$1")
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract the first meaningful Danish month from AI text, returns 1-12 or undefined */
export function extractMonthFromText(text: string): number | undefined {
  const lower = text.toLowerCase();
  let earliest: { month: number; index: number } | undefined;
  for (const [name, num] of Object.entries(DA_MONTHS)) {
    const idx = lower.indexOf(name);
    if (idx >= 0 && (!earliest || idx < earliest.index)) {
      earliest = { month: num, index: idx };
    }
  }
  return earliest?.month;
}

/** Extract ALL month numbers mentioned in text, in order of appearance */
export function extractAllMonthsFromText(text: string): number[] {
  const lower = text.toLowerCase();
  const found: { month: number; index: number }[] = [];
  for (const [name, num] of Object.entries(DA_MONTHS)) {
    let idx = lower.indexOf(name);
    while (idx >= 0) {
      found.push({ month: num, index: idx });
      idx = lower.indexOf(name, idx + name.length);
    }
  }
  found.sort((a, b) => a.index - b.index);
  const seen = new Set<number>();
  return found.filter((f) => { if (seen.has(f.month)) return false; seen.add(f.month); return true; }).map((f) => f.month);
}

/** Parse an AI response: first line = summary title, rest = description (cleaned) */
export function parseAiResponse(text: string): { title: string; description: string; month?: number } {
  const lines = text.split("\n");
  // AI is instructed to put a summary title on the first line (no markdown)
  const firstLine = (lines[0] ?? "").replace(/^#{1,6}\s+/, "").replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1").trim();
  // Rest of text as description (skip leading blank lines after title)
  let restStart = 1;
  while (restStart < lines.length && !lines[restStart].trim()) restStart++;
  const rest = lines.slice(restStart).join("\n");
  const description = stripMarkdown(rest).slice(0, 800);
  const month = extractMonthFromText(text);

  let title = firstLine;
  if (title.length > 80) title = title.slice(0, 77) + "…";
  if (!title) title = "AI-forslag";

  return { title, description, month };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskPriority = "urgent" | "high" | "medium" | "low";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "Akut",
  high: "Høj",
  medium: "Middel",
  low: "Lav",
};

export const PRIORITY_ICONS: Record<TaskPriority, string> = {
  urgent: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  medium: "#EAB308",
  low: "#22C55E",
};

export type TaskSource = "manual" | "ai-advisor";

export type GardenTask = {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  category: TaskCategory;
  /** Target month (1–12), undefined = unscheduled */
  month?: number;
  /** Timestamp of creation */
  createdAt: number;
  /** Timestamp of completion, undefined = not done */
  completedAt?: number;
  /** Where the task originated */
  source: TaskSource;
  /** Whether this task has been pushed to the Year Wheel */
  yearWheelLinked?: boolean;
};

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "gardenos:tasks:v1";

export function loadTasks(): GardenTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(userKey(STORAGE_KEY));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

export function saveTasks(tasks: GardenTask[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_KEY), JSON.stringify(tasks));
  markDirty(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export function createTask(input: {
  title: string;
  description?: string;
  priority?: TaskPriority;
  category?: TaskCategory;
  month?: number;
  source?: TaskSource;
}): GardenTask {
  const tasks = loadTasks();
  const task: GardenTask = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    description: input.description,
    priority: input.priority ?? "medium",
    category: input.category ?? "other",
    month: input.month,
    createdAt: Date.now(),
    source: input.source ?? "manual",
  };
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

export function updateTask(id: string, updates: Partial<GardenTask>): void {
  const tasks = loadTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx >= 0) {
    tasks[idx] = { ...tasks[idx], ...updates };
    saveTasks(tasks);
  }
}

export function deleteTask(id: string): void {
  const tasks = loadTasks().filter((t) => t.id !== id);
  saveTasks(tasks);
}

export function toggleTaskDone(id: string): boolean {
  const tasks = loadTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx >= 0) {
    tasks[idx].completedAt = tasks[idx].completedAt ? undefined : Date.now();
    saveTasks(tasks);
    return !!tasks[idx].completedAt;
  }
  return false;
}

/** Push a task to the Year Wheel as a custom task in the given month */
export function pushToYearWheel(id: string): boolean {
  const tasks = loadTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task || !task.month) return false;

  addCustomTask({
    month: task.month,
    title: task.title,
    category: task.category,
    description: task.description,
  });

  // Mark as linked
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx >= 0) {
    tasks[idx].yearWheelLinked = true;
    saveTasks(tasks);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sorting helpers
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export type TaskSortBy = "priority" | "date" | "month" | "category" | "name";

export function sortTasks(tasks: GardenTask[], by: TaskSortBy): GardenTask[] {
  const copy = [...tasks];
  switch (by) {
    case "priority":
      return copy.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    case "date":
      return copy.sort((a, b) => b.createdAt - a.createdAt);
    case "month":
      return copy.sort((a, b) => (a.month ?? 13) - (b.month ?? 13));
    case "category":
      return copy.sort((a, b) => a.category.localeCompare(b.category));
    case "name":
      return copy.sort((a, b) => a.title.localeCompare(b.title, "da"));
    default:
      return copy;
  }
}
