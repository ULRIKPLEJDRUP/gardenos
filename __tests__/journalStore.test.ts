/**
 * journalStore.test.ts — unit tests for journal CRUD, grouping, and stats.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock userStorage — must come before journalStore import
// ---------------------------------------------------------------------------
vi.mock("../app/lib/userStorage", () => ({
  userKey: (k: string) => k,
  markDirty: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete storage[key]; }),
  clear: vi.fn(() => { Object.keys(storage).forEach((k) => delete storage[k]); }),
};

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });
Object.defineProperty(globalThis, "window", { value: globalThis, writable: true });

// ---------------------------------------------------------------------------
// Import under test — AFTER mocks
// ---------------------------------------------------------------------------
import {
  getJournalEntries,
  getJournalEntryById,
  getEntriesForFeature,
  getEntriesByCategory,
  addJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  groupByDate,
  getJournalStats,
  JOURNAL_CATEGORIES,
  JOURNAL_CATEGORY_CONFIG,
} from "../app/lib/journalStore";
import type { JournalCategory, JournalEntry } from "../app/lib/journalStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clearStorage() {
  Object.keys(storage).forEach((k) => delete storage[k]);
}

function makeEntry(overrides: Partial<Omit<JournalEntry, "id" | "createdAt" | "updatedAt">> = {}): Omit<JournalEntry, "id" | "createdAt" | "updatedAt"> {
  return {
    date: "2025-06-15",
    title: "Test Entry",
    body: "Test body text",
    category: "observation",
    featureIds: [],
    tags: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("journalStore", () => {
  beforeEach(() => {
    clearStorage();
    vi.clearAllMocks();
  });

  // ── Constants ──

  describe("JOURNAL_CATEGORIES", () => {
    it("has 7 categories", () => {
      expect(JOURNAL_CATEGORIES).toHaveLength(7);
    });

    it("includes all expected categories", () => {
      const expected: JournalCategory[] = ["observation", "harvest", "planting", "maintenance", "weather", "problem", "note"];
      for (const cat of expected) {
        expect(JOURNAL_CATEGORIES).toContain(cat);
      }
    });

    it("each category has icon, label, and color", () => {
      for (const cat of JOURNAL_CATEGORIES) {
        const cfg = JOURNAL_CATEGORY_CONFIG[cat];
        expect(cfg).toBeDefined();
        expect(cfg.icon).toBeTruthy();
        expect(cfg.label).toBeTruthy();
        expect(cfg.color).toBeTruthy();
      }
    });
  });

  // ── CRUD ──

  describe("addJournalEntry", () => {
    it("adds an entry and returns it with id and timestamps", () => {
      const entry = addJournalEntry(makeEntry({ title: "First entry" }));
      expect(entry.id).toMatch(/^journal-/);
      expect(entry.title).toBe("First entry");
      expect(entry.createdAt).toBeTruthy();
      expect(entry.updatedAt).toBeTruthy();
    });

    it("persists to localStorage", () => {
      addJournalEntry(makeEntry());
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const stored = JSON.parse(storage["gardenos:journal:v1"]);
      expect(stored).toHaveLength(1);
    });

    it("preserves all fields", () => {
      const entry = addJournalEntry(makeEntry({
        date: "2025-01-10",
        time: "14:30",
        title: "Planted tomatoes",
        body: "In the greenhouse",
        category: "planting",
        featureIds: ["bed-1", "bed-2"],
        photoUrl: "data:image/png;base64,abc",
        mood: 5,
        tags: ["greenhouse", "tomato"],
      }));
      expect(entry.date).toBe("2025-01-10");
      expect(entry.time).toBe("14:30");
      expect(entry.category).toBe("planting");
      expect(entry.featureIds).toEqual(["bed-1", "bed-2"]);
      expect(entry.photoUrl).toBe("data:image/png;base64,abc");
      expect(entry.mood).toBe(5);
      expect(entry.tags).toEqual(["greenhouse", "tomato"]);
    });

    it("can add multiple entries", () => {
      addJournalEntry(makeEntry({ title: "A" }));
      addJournalEntry(makeEntry({ title: "B" }));
      addJournalEntry(makeEntry({ title: "C" }));
      expect(getJournalEntries()).toHaveLength(3);
    });
  });

  describe("getJournalEntries", () => {
    it("returns empty array when no entries", () => {
      expect(getJournalEntries()).toEqual([]);
    });

    it("returns entries sorted by date descending", () => {
      addJournalEntry(makeEntry({ date: "2025-06-01", title: "Oldest" }));
      addJournalEntry(makeEntry({ date: "2025-06-15", title: "Middle" }));
      addJournalEntry(makeEntry({ date: "2025-06-30", title: "Newest" }));
      const entries = getJournalEntries();
      expect(entries[0].title).toBe("Newest");
      expect(entries[1].title).toBe("Middle");
      expect(entries[2].title).toBe("Oldest");
    });

    it("sorts by time within same date", () => {
      addJournalEntry(makeEntry({ date: "2025-06-15", time: "08:00", title: "Morning" }));
      addJournalEntry(makeEntry({ date: "2025-06-15", time: "18:00", title: "Evening" }));
      addJournalEntry(makeEntry({ date: "2025-06-15", time: "12:00", title: "Noon" }));
      const entries = getJournalEntries();
      expect(entries[0].title).toBe("Evening");
      expect(entries[1].title).toBe("Noon");
      expect(entries[2].title).toBe("Morning");
    });
  });

  describe("getJournalEntryById", () => {
    it("returns entry by id", () => {
      const entry = addJournalEntry(makeEntry({ title: "Find me" }));
      const found = getJournalEntryById(entry.id);
      expect(found).toBeDefined();
      expect(found!.title).toBe("Find me");
    });

    it("returns undefined for non-existent id", () => {
      expect(getJournalEntryById("nonexistent")).toBeUndefined();
    });
  });

  describe("getEntriesForFeature", () => {
    it("returns entries linked to a feature", () => {
      addJournalEntry(makeEntry({ title: "Linked", featureIds: ["bed-1"] }));
      addJournalEntry(makeEntry({ title: "Unlinked", featureIds: [] }));
      addJournalEntry(makeEntry({ title: "Also linked", featureIds: ["bed-1", "bed-2"] }));
      const results = getEntriesForFeature("bed-1");
      expect(results).toHaveLength(2);
      expect(results.map((e) => e.title)).toContain("Linked");
      expect(results.map((e) => e.title)).toContain("Also linked");
    });

    it("returns empty for unlinked feature", () => {
      addJournalEntry(makeEntry({ featureIds: ["bed-1"] }));
      expect(getEntriesForFeature("bed-99")).toEqual([]);
    });
  });

  describe("getEntriesByCategory", () => {
    it("filters by category", () => {
      addJournalEntry(makeEntry({ category: "harvest", title: "Harvest 1" }));
      addJournalEntry(makeEntry({ category: "planting", title: "Plant 1" }));
      addJournalEntry(makeEntry({ category: "harvest", title: "Harvest 2" }));
      const results = getEntriesByCategory("harvest");
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.category === "harvest")).toBe(true);
    });
  });

  describe("updateJournalEntry", () => {
    it("updates title and body", () => {
      const entry = addJournalEntry(makeEntry({ title: "Original", body: "Old text" }));
      const result = updateJournalEntry(entry.id, { title: "Updated", body: "New text" });
      expect(result).toBe(true);
      const updated = getJournalEntryById(entry.id);
      expect(updated!.title).toBe("Updated");
      expect(updated!.body).toBe("New text");
    });

    it("updates the updatedAt timestamp", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-08-01T10:00:00Z"));
      const entry = addJournalEntry(makeEntry());
      const originalUpdatedAt = entry.updatedAt;
      vi.advanceTimersByTime(5000); // advance 5 seconds
      updateJournalEntry(entry.id, { title: "Changed" });
      const updated = getJournalEntryById(entry.id);
      expect(updated!.updatedAt).not.toBe(originalUpdatedAt);
      vi.useRealTimers();
    });

    it("preserves createdAt", () => {
      const entry = addJournalEntry(makeEntry());
      updateJournalEntry(entry.id, { title: "Changed" });
      const updated = getJournalEntryById(entry.id);
      expect(updated!.createdAt).toBe(entry.createdAt);
    });

    it("returns false for non-existent id", () => {
      expect(updateJournalEntry("nonexistent", { title: "Nope" })).toBe(false);
    });

    it("can update category", () => {
      const entry = addJournalEntry(makeEntry({ category: "observation" }));
      updateJournalEntry(entry.id, { category: "harvest" });
      expect(getJournalEntryById(entry.id)!.category).toBe("harvest");
    });
  });

  describe("deleteJournalEntry", () => {
    it("removes entry", () => {
      const entry = addJournalEntry(makeEntry());
      expect(deleteJournalEntry(entry.id)).toBe(true);
      expect(getJournalEntries()).toHaveLength(0);
    });

    it("returns false for non-existent id", () => {
      expect(deleteJournalEntry("nonexistent")).toBe(false);
    });

    it("preserves other entries", () => {
      const a = addJournalEntry(makeEntry({ title: "Keep" }));
      const b = addJournalEntry(makeEntry({ title: "Delete" }));
      deleteJournalEntry(b.id);
      const remaining = getJournalEntries();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(a.id);
    });
  });

  // ── Grouping ──

  describe("groupByDate", () => {
    it("groups entries by date", () => {
      const entries = [
        addJournalEntry(makeEntry({ date: "2025-06-15", title: "A" })),
        addJournalEntry(makeEntry({ date: "2025-06-15", title: "B" })),
        addJournalEntry(makeEntry({ date: "2025-06-16", title: "C" })),
      ];
      const groups = groupByDate(entries);
      expect(groups).toHaveLength(2);
    });

    it("sorts groups by date descending", () => {
      const entries = [
        addJournalEntry(makeEntry({ date: "2025-06-10", title: "Old" })),
        addJournalEntry(makeEntry({ date: "2025-06-20", title: "New" })),
      ];
      const groups = groupByDate(entries);
      expect(groups[0].date).toBe("2025-06-20");
      expect(groups[1].date).toBe("2025-06-10");
    });

    it("provides localized Danish date label", () => {
      const entries = [addJournalEntry(makeEntry({ date: "2025-06-15" }))];
      const groups = groupByDate(entries);
      expect(groups[0].label).toBeTruthy();
      // Should contain "juni" or "15" (Danish locale)
      expect(groups[0].label).toMatch(/15|juni/i);
    });

    it("returns empty array for empty input", () => {
      expect(groupByDate([])).toEqual([]);
    });
  });

  // ── Stats ──

  describe("getJournalStats", () => {
    it("returns zero stats when empty", () => {
      const stats = getJournalStats();
      expect(stats.total).toBe(0);
      expect(stats.thisMonth).toBe(0);
      for (const cat of JOURNAL_CATEGORIES) {
        expect(stats.categories[cat]).toBe(0);
      }
    });

    it("counts total entries", () => {
      addJournalEntry(makeEntry());
      addJournalEntry(makeEntry());
      addJournalEntry(makeEntry());
      expect(getJournalStats().total).toBe(3);
    });

    it("counts entries per category", () => {
      addJournalEntry(makeEntry({ category: "harvest" }));
      addJournalEntry(makeEntry({ category: "harvest" }));
      addJournalEntry(makeEntry({ category: "planting" }));
      const stats = getJournalStats();
      expect(stats.categories.harvest).toBe(2);
      expect(stats.categories.planting).toBe(1);
      expect(stats.categories.observation).toBe(0);
    });

    it("counts thisMonth correctly", () => {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
      const lastYear = `${now.getFullYear() - 1}-01-15`;
      addJournalEntry(makeEntry({ date: thisMonth }));
      addJournalEntry(makeEntry({ date: thisMonth }));
      addJournalEntry(makeEntry({ date: lastYear }));
      const stats = getJournalStats();
      expect(stats.thisMonth).toBe(2);
      expect(stats.total).toBe(3);
    });
  });

  // ── Edge cases ──

  describe("edge cases", () => {
    it("handles corrupted localStorage gracefully", () => {
      storage["gardenos:journal:v1"] = "not-json{{";
      expect(getJournalEntries()).toEqual([]);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const entry = addJournalEntry(makeEntry({ title: `Entry ${i}` }));
        ids.add(entry.id);
      }
      expect(ids.size).toBe(20);
    });
  });
});
