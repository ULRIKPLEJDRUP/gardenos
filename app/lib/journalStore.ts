/**
 * journalStore.ts – Garden Journal / Diary for GardenOS
 *
 * Supports dated entries with optional photo attachment,
 * linked to specific features on the map. Persisted in localStorage.
 */

import { userKey, markDirty } from "./userStorage";

/* ─────────── Types ─────────── */

export type JournalCategory = "observation" | "harvest" | "planting" | "maintenance" | "weather" | "problem" | "note";

export interface JournalEntry {
  id: string;
  date: string;          // YYYY-MM-DD
  time?: string;         // HH:MM (optional)
  title: string;
  body: string;
  category: JournalCategory;
  /** Feature IDs this entry is linked to */
  featureIds: string[];
  /** Data-URL or external URL for a photo */
  photoUrl?: string;
  /** Mood / rating 1-5 */
  mood?: number;
  /** Tags for filtering */
  tags: string[];
  createdAt: string;     // ISO
  updatedAt: string;     // ISO
}

/* ─────────── Constants ─────────── */

const STORAGE_KEY = "gardenos:journal:v1";

export const JOURNAL_CATEGORY_CONFIG: Record<JournalCategory, { icon: string; label: string; color: string }> = {
  observation:  { icon: "👀", label: "Observation",  color: "text-blue-600" },
  harvest:      { icon: "🧺", label: "Høst",         color: "text-amber-600" },
  planting:     { icon: "🌱", label: "Plantning",    color: "text-green-600" },
  maintenance:  { icon: "🔧", label: "Vedligehold",  color: "text-gray-600" },
  weather:      { icon: "🌤️", label: "Vejr",         color: "text-cyan-600" },
  problem:      { icon: "⚠️", label: "Problem",      color: "text-red-600" },
  note:         { icon: "📝", label: "Note",          color: "text-purple-600" },
};

export const JOURNAL_CATEGORIES = Object.keys(JOURNAL_CATEGORY_CONFIG) as JournalCategory[];

/* ─────────── CRUD ─────────── */

function loadEntries(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(userKey(STORAGE_KEY));
    if (!raw) return [];
    return JSON.parse(raw) as JournalEntry[];
  } catch {
    return [];
  }
}

function saveEntries(entries: JournalEntry[]): void {
  localStorage.setItem(userKey(STORAGE_KEY), JSON.stringify(entries));
  markDirty(STORAGE_KEY);
}

export function getJournalEntries(): JournalEntry[] {
  return loadEntries().sort((a, b) => {
    // Sort by date descending, then by time descending
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return (b.time || "").localeCompare(a.time || "");
  });
}

export function getJournalEntryById(id: string): JournalEntry | undefined {
  return loadEntries().find((e) => e.id === id);
}

export function getEntriesForFeature(featureId: string): JournalEntry[] {
  return loadEntries()
    .filter((e) => e.featureIds.includes(featureId))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getEntriesByCategory(category: JournalCategory): JournalEntry[] {
  return loadEntries()
    .filter((e) => e.category === category)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function addJournalEntry(entry: Omit<JournalEntry, "id" | "createdAt" | "updatedAt">): JournalEntry {
  const entries = loadEntries();
  const now = new Date().toISOString();
  const newEntry: JournalEntry = {
    ...entry,
    id: `journal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  entries.push(newEntry);
  saveEntries(entries);
  return newEntry;
}

export function updateJournalEntry(id: string, updates: Partial<Omit<JournalEntry, "id" | "createdAt">>): boolean {
  const entries = loadEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  entries[idx] = {
    ...entries[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveEntries(entries);
  return true;
}

export function deleteJournalEntry(id: string): boolean {
  const entries = loadEntries();
  const filtered = entries.filter((e) => e.id !== id);
  if (filtered.length === entries.length) return false;
  saveEntries(filtered);
  return true;
}

/* ─────────── Timeline grouping ─────────── */

export interface JournalDayGroup {
  date: string;
  label: string; // e.g. "Mandag 23. juni 2025"
  entries: JournalEntry[];
}

export function groupByDate(entries: JournalEntry[]): JournalDayGroup[] {
  const map = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const group = map.get(e.date) || [];
    group.push(e);
    map.set(e.date, group);
  }
  const groups: JournalDayGroup[] = [];
  for (const [date, group] of map) {
    const d = new Date(date + "T12:00:00");
    const label = d.toLocaleDateString("da-DK", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    groups.push({ date, label, entries: group });
  }
  return groups.sort((a, b) => b.date.localeCompare(a.date));
}

/* ─────────── Stats ─────────── */

export function getJournalStats(): { total: number; thisMonth: number; categories: Record<JournalCategory, number> } {
  const entries = loadEntries();
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const categories = {} as Record<JournalCategory, number>;
  for (const cat of JOURNAL_CATEGORIES) categories[cat] = 0;
  let thisMonth = 0;
  for (const e of entries) {
    categories[e.category] = (categories[e.category] || 0) + 1;
    if (e.date.startsWith(monthPrefix)) thisMonth++;
  }
  return { total: entries.length, thisMonth, categories };
}
