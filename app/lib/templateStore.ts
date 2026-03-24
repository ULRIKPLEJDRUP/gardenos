// ---------------------------------------------------------------------------
// GardenOS – Bed Template Store
// ---------------------------------------------------------------------------
// Stores user-created bed templates in localStorage.
// A template is a portable bed plan (elements + dimensions) without geo
// references — can be applied to any bed of any size (elements are scaled).
// Also handles import/export for sharing via URL or file.
// ---------------------------------------------------------------------------

import type { BedElement, BedLocalCoord } from "./bedLayoutTypes";
import { userKey, markDirty } from "./userStorage";

const STORAGE_KEY = "gardenos:bed-templates:v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BedTemplate {
  id: string;
  name: string;
  description: string;
  /** The original bed outline in cm */
  outlineCm: BedLocalCoord[];
  widthCm: number;
  lengthCm: number;
  /** Template elements (positions relative to original bed) */
  elements: BedElement[];
  /** Tags for search/filter */
  tags: string[];
  /** Preview thumbnail (tiny base64 PNG, optional) */
  thumbnail?: string;
  /** Who created the template */
  author?: string;
  createdAt: string;
  updatedAt: string;
}

/** Portable share payload — minimal data for URL sharing */
export interface BedSharePayload {
  v: 1; // version
  name: string;
  desc: string;
  w: number;   // widthCm
  h: number;   // lengthCm
  outline: [number, number][]; // compact [x,y] pairs
  elements: ShareElement[];
  tags: string[];
}

/** Compact element for sharing (smaller than full BedElement) */
interface ShareElement {
  t: string;            // type
  x: number; y: number; // position
  r: number;            // rotation
  w: number; h: number; // width, length
  s?: string;           // speciesId
  c?: number;           // count
  sp?: number;          // spacingCm
  l?: string;           // label
  i?: string;           // icon
  ik?: string;          // infrastructureKind
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadAll(): Record<string, BedTemplate> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(userKey(STORAGE_KEY));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllTemplates(templates: Record<string, BedTemplate>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(userKey(STORAGE_KEY), JSON.stringify(templates));
  markDirty(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

/** Get all saved templates */
export function getAllTemplates(): BedTemplate[] {
  return Object.values(loadAll()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Get a single template by id */
export function getTemplate(id: string): BedTemplate | null {
  return loadAll()[id] ?? null;
}

/** Save a new template from current bed elements */
export function saveTemplate(
  name: string,
  description: string,
  outlineCm: BedLocalCoord[],
  widthCm: number,
  lengthCm: number,
  elements: BedElement[],
  tags: string[] = [],
  thumbnail?: string,
): BedTemplate {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // Strip instance/feature-specific IDs from elements
  const cleanElements = elements.map((el) => ({
    ...el,
    id: crypto.randomUUID(), // new IDs
    instanceId: undefined,   // remove instance link
  }));
  const template: BedTemplate = {
    id,
    name,
    description,
    outlineCm: [...outlineCm],
    widthCm,
    lengthCm,
    elements: cleanElements,
    tags,
    thumbnail,
    createdAt: now,
    updatedAt: now,
  };
  const all = loadAll();
  all[id] = template;
  saveAllTemplates(all);
  return template;
}

/** Update an existing template */
export function updateTemplate(
  id: string,
  patch: Partial<Pick<BedTemplate, "name" | "description" | "tags" | "thumbnail">>,
): BedTemplate | null {
  const all = loadAll();
  const t = all[id];
  if (!t) return null;
  all[id] = { ...t, ...patch, updatedAt: new Date().toISOString() };
  saveAllTemplates(all);
  return all[id];
}

/** Delete a template by id */
export function deleteTemplate(id: string): void {
  const all = loadAll();
  delete all[id];
  saveAllTemplates(all);
}

// ---------------------------------------------------------------------------
// Apply template to a bed (scale + adapt elements)
// ---------------------------------------------------------------------------

/** Apply a template's elements to a target bed, scaling positions/sizes */
export function applyTemplateToBed(
  template: BedTemplate,
  targetWidthCm: number,
  targetLengthCm: number,
): BedElement[] {
  const scaleX = targetWidthCm / Math.max(template.widthCm, 1);
  const scaleY = targetLengthCm / Math.max(template.lengthCm, 1);

  return template.elements.map((el) => ({
    ...el,
    id: crypto.randomUUID(), // fresh IDs
    instanceId: undefined,
    position: {
      x: el.position.x * scaleX,
      y: el.position.y * scaleY,
    },
    width: el.width * scaleX,
    length: el.length * scaleY,
    // Keep spacing as-is (plant spacing shouldn't scale)
  }));
}

// ---------------------------------------------------------------------------
// Share payload encoding / decoding
// ---------------------------------------------------------------------------

function elementToShare(el: BedElement): ShareElement {
  const se: ShareElement = {
    t: el.type,
    x: Math.round(el.position.x * 10) / 10,
    y: Math.round(el.position.y * 10) / 10,
    r: Math.round(el.rotation),
    w: Math.round(el.width * 10) / 10,
    h: Math.round(el.length * 10) / 10,
  };
  if (el.speciesId) se.s = el.speciesId;
  if (el.count && el.count > 1) se.c = el.count;
  if (el.spacingCm) se.sp = el.spacingCm;
  if (el.label) se.l = el.label;
  if (el.icon) se.i = el.icon;
  if (el.infrastructureKind) se.ik = el.infrastructureKind;
  return se;
}

function shareToElement(se: ShareElement): BedElement {
  return {
    id: crypto.randomUUID(),
    type: se.t as BedElement["type"],
    position: { x: se.x, y: se.y },
    rotation: se.r,
    width: se.w,
    length: se.h,
    speciesId: se.s,
    count: se.c,
    spacingCm: se.sp,
    label: se.l,
    icon: se.i,
    infrastructureKind: se.ik,
  };
}

/** Encode a template as a shareable URL-safe string */
export function encodeSharePayload(template: BedTemplate): string {
  const payload: BedSharePayload = {
    v: 1,
    name: template.name,
    desc: template.description,
    w: Math.round(template.widthCm),
    h: Math.round(template.lengthCm),
    outline: template.outlineCm.map((p) => [
      Math.round(p.x * 10) / 10,
      Math.round(p.y * 10) / 10,
    ]),
    elements: template.elements.map(elementToShare),
    tags: template.tags,
  };
  const json = JSON.stringify(payload);
  // Base64url encode
  if (typeof window !== "undefined") {
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(json).toString("base64url");
}

/** Decode a share payload string back into a BedTemplate */
export function decodeSharePayload(encoded: string): BedTemplate | null {
  try {
    // Restore standard base64
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";

    let json: string;
    if (typeof window !== "undefined") {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      json = new TextDecoder().decode(bytes);
    } else {
      json = Buffer.from(b64, "base64").toString("utf-8");
    }

    const payload: BedSharePayload = JSON.parse(json);
    if (payload.v !== 1) return null;

    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      name: payload.name,
      description: payload.desc,
      widthCm: payload.w,
      lengthCm: payload.h,
      outlineCm: payload.outline.map(([x, y]) => ({ x, y })),
      elements: payload.elements.map(shareToElement),
      tags: payload.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
  } catch {
    return null;
  }
}

/** Generate a full share URL for a template */
export function generateShareUrl(template: BedTemplate): string {
  const encoded = encodeSharePayload(template);
  if (typeof window !== "undefined") {
    return `${window.location.origin}?bedshare=${encoded}`;
  }
  return `?bedshare=${encoded}`;
}

/** Check current URL for a bedshare parameter and return the template if found */
export function checkUrlForSharedBed(): BedTemplate | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("bedshare");
  if (!encoded) return null;
  return decodeSharePayload(encoded);
}
