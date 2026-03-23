// ---------------------------------------------------------------------------
// GardenOS – Design Lab: BedLayout Persistence Store
// ---------------------------------------------------------------------------
// Stores BedLayout documents in localStorage keyed by featureId.
// Uses the same user-scoped key system as the rest of GardenOS.
// ---------------------------------------------------------------------------

import type { BedLayout, BedElement } from "./bedLayoutTypes";
import { userKey, markDirty } from "./userStorage";

const STORAGE_KEY = "gardenos:bed-layouts:v1";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadAll(): Record<string, BedLayout> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(userKey(STORAGE_KEY));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(layouts: Record<string, BedLayout>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_KEY), JSON.stringify(layouts));
  markDirty(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get a single BedLayout by featureId. Returns null if none exists. */
export function getBedLayout(featureId: string): BedLayout | null {
  const all = loadAll();
  return all[featureId] ?? null;
}

/** Get all saved BedLayouts. */
export function getAllBedLayouts(): BedLayout[] {
  return Object.values(loadAll());
}

/** Save / create a BedLayout. Overwrites any existing layout for this featureId. */
export function saveBedLayout(layout: BedLayout): void {
  const all = loadAll();
  all[layout.featureId] = {
    ...layout,
    updatedAt: new Date().toISOString(),
  };
  saveAll(all);
}

/** Create a new BedLayout with default metadata. */
export function createBedLayout(
  partial: Omit<BedLayout, "id" | "version" | "elements" | "createdAt" | "updatedAt">
): BedLayout {
  const now = new Date().toISOString();
  const layout: BedLayout = {
    id: crypto.randomUUID(),
    version: 1,
    elements: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
  saveBedLayout(layout);
  return layout;
}

/** Delete a BedLayout by featureId. */
export function deleteBedLayout(featureId: string): void {
  const all = loadAll();
  delete all[featureId];
  saveAll(all);
}

// ---------------------------------------------------------------------------
// Element CRUD within a layout
// ---------------------------------------------------------------------------

/** Add an element to a layout. Returns the updated layout. */
export function addElement(
  featureId: string,
  element: BedElement
): BedLayout | null {
  const layout = getBedLayout(featureId);
  if (!layout) return null;
  layout.elements.push(element);
  layout.version += 1;
  saveBedLayout(layout);
  return layout;
}

/** Update an element by id. Returns the updated layout. */
export function updateElement(
  featureId: string,
  elementId: string,
  patch: Partial<BedElement>
): BedLayout | null {
  const layout = getBedLayout(featureId);
  if (!layout) return null;
  const idx = layout.elements.findIndex((e) => e.id === elementId);
  if (idx === -1) return null;
  layout.elements[idx] = { ...layout.elements[idx], ...patch };
  layout.version += 1;
  saveBedLayout(layout);
  return layout;
}

/** Remove an element by id. Returns the updated layout. */
export function removeElement(
  featureId: string,
  elementId: string
): BedLayout | null {
  const layout = getBedLayout(featureId);
  if (!layout) return null;
  layout.elements = layout.elements.filter((e) => e.id !== elementId);
  layout.version += 1;
  saveBedLayout(layout);
  return layout;
}

/** Move an element to a new position. Returns the updated layout. */
export function moveElement(
  featureId: string,
  elementId: string,
  newPosition: { x: number; y: number }
): BedLayout | null {
  return updateElement(featureId, elementId, { position: newPosition });
}
