// ---------------------------------------------------------------------------
// GardenOS – Soil Store (localStorage persistence)
// ---------------------------------------------------------------------------
// Manages: SoilProfile CRUD + SoilLogEntry tracking
// Follows same pattern as plantStore.ts
// ---------------------------------------------------------------------------

import type { SoilProfile, SoilLogEntry } from "./soilTypes";
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
