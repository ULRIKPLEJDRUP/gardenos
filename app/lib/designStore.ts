// ---------------------------------------------------------------------------
// GardenOS – Design Store (saved garden map designs)
// ---------------------------------------------------------------------------
// Each user can save up to MAX_DESIGNS (3) named snapshots of their
// garden layout + plant instances.  Designs are stored on the server
// (PostgreSQL via /api/designs) so they sync across devices.
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_DESIGNS = 3;

export interface SavedDesign {
  id: string;
  name: string;
  /** JSON-encoded GeoJSON FeatureCollection */
  layout: string;
  /** JSON-encoded PlantInstance[] */
  plants: string;
  /** Optional small base64 preview */
  thumbnail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DesignVersion {
  id: string;
  savedAt: string;
}

export interface DesignListResponse {
  designs: SavedDesign[];
  maxDesigns: number;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/** Fetch all saved designs + the user's max limit. */
export async function fetchDesigns(): Promise<DesignListResponse> {
  const res = await fetch("/api/designs");
  if (!res.ok) throw new Error("Kunne ikke hente designs");
  return res.json();
}

/** Save a new design (will fail if already at MAX_DESIGNS). */
export async function createDesign(data: {
  name: string;
  layout: string;
  plants: string;
  thumbnail?: string;
}): Promise<SavedDesign> {
  const res = await fetch("/api/designs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Kunne ikke gemme design");
  }
  return res.json();
}

/** Update an existing design (name, layout, plants, thumbnail). */
export async function updateDesign(
  id: string,
  data: Partial<Pick<SavedDesign, "name" | "layout" | "plants" | "thumbnail">>
): Promise<SavedDesign> {
  const res = await fetch(`/api/designs?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Kunne ikke opdatere design");
  }
  return res.json();
}

/** Delete a saved design by id. */
export async function deleteDesign(id: string): Promise<void> {
  const res = await fetch(`/api/designs?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Kunne ikke slette design");
}

// ---------------------------------------------------------------------------
// Version history helpers
// ---------------------------------------------------------------------------

/** Fetch version snapshots for a design (newest first, max 5). */
export async function fetchVersions(
  designId: string
): Promise<DesignVersion[]> {
  const res = await fetch(
    `/api/designs/versions?designId=${encodeURIComponent(designId)}`
  );
  if (!res.ok) throw new Error("Kunne ikke hente versioner");
  const data = await res.json();
  return data.versions;
}

/** Restore a version snapshot – copies its layout/plants back to the design. */
export async function restoreVersion(versionId: string): Promise<SavedDesign> {
  const res = await fetch(
    `/api/designs/versions?versionId=${encodeURIComponent(versionId)}`,
    { method: "POST" }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Kunne ikke gendanne version");
  }
  return res.json();
}
