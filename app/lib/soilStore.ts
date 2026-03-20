// ---------------------------------------------------------------------------
// GardenOS – Soil Store (localStorage persistence)
// ---------------------------------------------------------------------------
// Manages: SoilProfile CRUD + SoilLogEntry tracking
// Follows same pattern as plantStore.ts
// ---------------------------------------------------------------------------

import type { SoilProfile, SoilLogEntry, SoilBaseType } from "./soilTypes";
import { SOIL_TYPE_PRESETS, SOIL_BASE_TYPE_LABELS } from "./soilTypes";
import { userKey, markDirty } from "./userStorage";

const STORAGE_PROFILES_KEY = "gardenos:soil:profiles:v1";
const STORAGE_LOG_KEY = "gardenos:soil:log:v1";

// ---------------------------------------------------------------------------
// Soil Profiles
// ---------------------------------------------------------------------------

export function loadSoilProfiles(): SoilProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(userKey(STORAGE_PROFILES_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSoilProfiles(profiles: SoilProfile[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_PROFILES_KEY), JSON.stringify(profiles));
  markDirty(STORAGE_PROFILES_KEY);
}

export function getSoilProfileById(id: string): SoilProfile | undefined {
  return loadSoilProfiles().find((p) => p.id === id);
}

export function addOrUpdateSoilProfile(profile: SoilProfile): void {
  const existing = loadSoilProfiles();
  const idx = existing.findIndex((p) => p.id === profile.id);
  const now = new Date().toISOString();
  if (idx >= 0) {
    existing[idx] = { ...profile, updatedAt: now };
  } else {
    existing.push({ ...profile, createdAt: profile.createdAt || now, updatedAt: now });
  }
  saveSoilProfiles(existing);
}

export function deleteSoilProfile(id: string): void {
  const existing = loadSoilProfiles().filter((p) => p.id !== id);
  saveSoilProfiles(existing);
  // Also remove related log entries
  const log = loadSoilLog().filter((e) => e.profileId !== id);
  saveSoilLog(log);
}

/** Create a new blank profile with a generated ID */
export function createBlankSoilProfile(name: string): SoilProfile {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a new profile pre-filled with typical values for the given soil type.
 * The user can then adjust any field to match their specific plot.
 */
export function createProfileFromType(baseType: SoilBaseType, name?: string): SoilProfile {
  const now = new Date().toISOString();
  const preset = SOIL_TYPE_PRESETS[baseType];
  const label = name ?? SOIL_BASE_TYPE_LABELS[baseType];
  return {
    id: crypto.randomUUID(),
    name: label,
    createdAt: now,
    updatedAt: now,
    ...preset,
  };
}

/**
 * Apply preset defaults for a soil type onto an existing profile.
 * Only fills in fields that are currently undefined/empty — never
 * overwrites values the user has already set.  Always sets baseType.
 */
export function applyPresetDefaults(profile: SoilProfile, baseType: SoilBaseType): SoilProfile {
  const preset = SOIL_TYPE_PRESETS[baseType];
  const merged = { ...profile, baseType };
  for (const [key, value] of Object.entries(preset)) {
    if (key === "baseType") continue; // already set above
    const current = (merged as Record<string, unknown>)[key];
    // Only fill if the current value is undefined, null, or empty string
    if (current === undefined || current === null || current === "") {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

/**
 * Ensure default soil profiles exist.  Called once on first load.
 * If the user already has profiles, nothing happens.
 * Creates one pre-filled profile per soil type (6 total).
 */
export function ensureDefaultProfiles(): boolean {
  if (typeof window === "undefined") return false;
  const existing = loadSoilProfiles();
  if (existing.length > 0) return false; // user already has profiles
  const types: SoilBaseType[] = ["loam", "sand", "clay", "peat", "chalk", "mixed"];
  const seeded = types.map((t) => createProfileFromType(t));
  saveSoilProfiles(seeded);
  return true; // profiles were created
}

// ---------------------------------------------------------------------------
// Soil Log (change history)
// ---------------------------------------------------------------------------

export function loadSoilLog(): SoilLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(userKey(STORAGE_LOG_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSoilLog(entries: SoilLogEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_LOG_KEY), JSON.stringify(entries));
  markDirty(STORAGE_LOG_KEY);
}

export function getLogForProfile(profileId: string): SoilLogEntry[] {
  return loadSoilLog()
    .filter((e) => e.profileId === profileId)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first
}

export function addSoilLogEntry(entry: SoilLogEntry): void {
  const log = loadSoilLog();
  log.push(entry);
  saveSoilLog(log);
}

export function deleteSoilLogEntry(id: string): void {
  const log = loadSoilLog().filter((e) => e.id !== id);
  saveSoilLog(log);
}
