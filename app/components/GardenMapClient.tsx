"use client";

import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon } from "geojson";
import L from "leaflet";
import "leaflet-draw";
import "leaflet-path-drag";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";

// ---------------------------------------------------------------------------
// NOTE: We no longer use Leaflet.draw's L.EditToolbar.Edit for editing.
// Instead we directly enable/disable .editing and .dragging on individual
// layers.  This avoids the fundamental architecture mismatch where
// L.EditToolbar.Edit operates on ALL layers in the featureGroup at once.
// ---------------------------------------------------------------------------

type KnownGardenFeatureKind = "bed" | "tree" | "bush" | "pot" | "greenhouse";
type GardenFeatureKind = KnownGardenFeatureKind | (string & {});

type GardenFeatureCategory = "container" | "element";

type KindGeometry = "point" | "polygon" | "polyline";

type KindGroup = "default" | "infra";

type KindDef = {
  kind: string;
  label: string;
  category: GardenFeatureCategory;
  geometry: KindGeometry;
  group?: KindGroup;
};

type GardenFeatureProperties = {
  gardenosId: string;
  category?: GardenFeatureCategory;
  kind?: GardenFeatureKind;
  name?: string;
  bedType?: string;
  planted?: string;
  plantedAt?: string;
  notes?: string;
};

type GardenFeature = Feature<Geometry, GardenFeatureProperties>;

type GardenFeatureCollection = FeatureCollection<Geometry, GardenFeatureProperties>;

type SelectedFeatureState = {
  gardenosId: string;
  feature: GardenFeature;
};

type UndoSnapshot = {
  layout: GardenFeatureCollection;
  selectedId: string | null;
};

const STORAGE_LAYOUT_KEY = "gardenos:layout:v1";
const STORAGE_VIEW_KEY = "gardenos:view:v1";
const STORAGE_KIND_DEFS_KEY = "gardenos:kinds:v1";

const KNOWN_KIND_DEFS: KindDef[] = [
  { kind: "bed", label: "Bed", category: "container", geometry: "polygon", group: "default" },
  { kind: "greenhouse", label: "Drivhus", category: "container", geometry: "polygon", group: "default" },
  { kind: "pot", label: "Krukke", category: "container", geometry: "point", group: "default" },
  { kind: "tree", label: "Træ", category: "element", geometry: "point", group: "default" },
  { kind: "bush", label: "Busk", category: "element", geometry: "point", group: "default" },

  // Technical/infrastructure (lines)
  { kind: "water", label: "Vandrør", category: "element", geometry: "polyline", group: "infra" },
  { kind: "electric", label: "El", category: "element", geometry: "polyline", group: "infra" },
];

function isKnownKind(kind: string | undefined): kind is KnownGardenFeatureKind {
  return kind === "bed" || kind === "greenhouse" || kind === "pot" || kind === "tree" || kind === "bush";
}

function dedupeKindDefs(defs: KindDef[]): KindDef[] {
  const seen = new Set<string>();
  const out: KindDef[] = [];
  for (const def of defs) {
    const key = def.kind.trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push({
      ...def,
      kind: key,
      label: (def.label ?? key).toString(),
    });
  }
  return out;
}

function loadCustomKindDefsFromStorage(): KindDef[] {
  if (typeof window === "undefined") return [];
  const raw = safeJsonParse<unknown>(localStorage.getItem(STORAGE_KIND_DEFS_KEY));
  if (!Array.isArray(raw)) return [];

  const parsed: KindDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Partial<KindDef>;
    if (typeof v.kind !== "string" || typeof v.label !== "string") continue;
    if (v.category !== "container" && v.category !== "element") continue;
    if (v.geometry !== "point" && v.geometry !== "polygon" && v.geometry !== "polyline") continue;
    const group: KindGroup = v.group === "infra" ? "infra" : "default";
    if (isKnownKind(v.kind)) continue;
    parsed.push({ kind: v.kind, label: v.label, category: v.category, geometry: v.geometry, group });
  }
  return dedupeKindDefs(parsed);
}

function saveCustomKindDefsToStorage(defs: KindDef[]): void {
  if (typeof window === "undefined") return;
  const customOnly = defs.filter((d) => !isKnownKind(d.kind));
  localStorage.setItem(STORAGE_KIND_DEFS_KEY, JSON.stringify(dedupeKindDefs(customOnly)));
}

function kindDefForKind(kind: string | undefined): KindDef | undefined {
  if (!kind) return undefined;
  const trimmed = kind.trim();
  if (!trimmed) return undefined;

  const known = KNOWN_KIND_DEFS.find((d) => d.kind.toLowerCase() === trimmed.toLowerCase());
  if (known) return known;

  const custom = loadCustomKindDefsFromStorage().find((d) => d.kind.toLowerCase() === trimmed.toLowerCase());
  return custom;
}

function kindLabel(kind: GardenFeatureKind | undefined): string {
  if (!kind) return "";
  const def = kindDefForKind(kind);
  if (def) return def.label;
  return kind.toString().trim();
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isFeatureCollection(value: unknown): value is GardenFeatureCollection {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; features?: unknown };
  return v.type === "FeatureCollection" && Array.isArray(v.features);
}

function serializeLayer(layer: L.Layer): GardenFeature | null {
  const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
  const layerWithToGeoJSON = layerWithFeature as unknown as { toGeoJSON?: () => unknown };
  if (typeof layerWithToGeoJSON.toGeoJSON !== "function") return null;

  // Important: call as a method so Leaflet keeps the correct `this`.
  const geo = layerWithToGeoJSON.toGeoJSON() as GardenFeature;

  const merged: GardenFeature = {
    ...geo,
    properties: {
      ...(geo.properties ?? {}),
      ...(layerWithFeature.feature?.properties ?? {}),
    },
  };

  const normalized = ensureDefaultProperties(merged);
  layerWithFeature.feature = normalized;
  return normalized;
}

function serializeGroup(group: L.FeatureGroup): GardenFeatureCollection {
  const features: GardenFeature[] = [];
  group.eachLayer((layer) => {
    const f = serializeLayer(layer);
    if (f) features.push(f);
  });

  return {
    type: "FeatureCollection",
    features,
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultKindForGeometry(geometry: Geometry): GardenFeatureKind {
  if (geometry.type === "Polygon") return "bed";
  if (geometry.type === "LineString") return "water";
  return "tree";
}

function categoryForKind(kind: GardenFeatureKind, geometry?: Geometry): GardenFeatureCategory {
  const def = kindDefForKind(kind);
  if (def) return def.category;
  if (geometry) return defaultCategoryForGeometry(geometry);
  return "element";
}

function defaultCategoryForGeometry(geometry: Geometry): GardenFeatureCategory {
  return geometry.type === "Polygon" ? "container" : "element";
}

function ensureDefaultProperties(feature: GardenFeature): GardenFeature {
  const kind = feature.properties?.kind ?? defaultKindForGeometry(feature.geometry);
  const def = kindDefForKind(kind);
  const category = def?.category ?? feature.properties?.category ?? defaultCategoryForGeometry(feature.geometry);
  return {
    ...feature,
    properties: {
      ...feature.properties,
      gardenosId: feature.properties?.gardenosId ?? newId(),
      category,
      kind,
      name: feature.properties?.name ?? "",
      bedType: feature.properties?.bedType ?? "",
      planted: feature.properties?.planted ?? "",
      plantedAt: feature.properties?.plantedAt ?? "",
      notes: feature.properties?.notes ?? "",
    },
  };
}

function formatAreaSquareMeters(area: number): string {
  if (!Number.isFinite(area) || area < 0) return "";
  if (area < 1) return `${area.toFixed(2)} m²`;
  if (area < 10) return `${area.toFixed(1)} m²`;
  return `${Math.round(area)} m²`;
}

function areaForPolygonFeature(feature: Feature<Polygon, GardenFeatureProperties>): number | null {
  // Prefer Leaflet.draw's GeometryUtil if available.
  const geometryUtil = (L as unknown as { GeometryUtil?: { geodesicArea?: (latlngs: L.LatLng[]) => number } })
    .GeometryUtil;
  const geodesicArea = geometryUtil?.geodesicArea;
  if (typeof geodesicArea !== "function") return null;

  const ring = feature.geometry.coordinates[0];
  if (!ring || ring.length < 3) return null;
  const latlngs = ring.map(([lng, lat]) => L.latLng(lat, lng));
  return geodesicArea(latlngs);
}

function isPolygon(feature: GardenFeature): feature is Feature<Polygon, GardenFeatureProperties> {
  return feature.geometry.type === "Polygon";
}

function isPoint(feature: GardenFeature): feature is Feature<Point, GardenFeatureProperties> {
  return feature.geometry.type === "Point";
}

function isLineString(feature: GardenFeature): feature is Feature<LineString, GardenFeatureProperties> {
  return feature.geometry.type === "LineString";
}

function ringWithoutClosure(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring.slice(0, -1);
  return ring;
}

// Ray casting in lng/lat plane (good enough for small garden polygons).
function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonOuterRing(feature: Feature<Polygon, GardenFeatureProperties>): [number, number][] {
  const ring = feature.geometry.coordinates?.[0] ?? [];
  return ringWithoutClosure(ring as [number, number][]);
}

function polygonContainsPointFeature(
  container: Feature<Polygon, GardenFeatureProperties>,
  point: Feature<Point, GardenFeatureProperties>
): boolean {
  const ring = polygonOuterRing(container);
  if (ring.length < 3) return false;
  const coords = point.geometry.coordinates as [number, number];
  return pointInRing(coords, ring);
}

function polygonContainsLineStringFeature(
  container: Feature<Polygon, GardenFeatureProperties>,
  line: Feature<LineString, GardenFeatureProperties>
): boolean {
  const ring = polygonOuterRing(container);
  if (ring.length < 3) return false;
  const coords = (line.geometry.coordinates ?? []) as [number, number][];
  for (const c of coords) {
    if (pointInRing(c, ring)) return true;
  }
  return false;
}

function polygonContainsPolygonFeature(
  container: Feature<Polygon, GardenFeatureProperties>,
  candidate: Feature<Polygon, GardenFeatureProperties>
): boolean {
  const ring = polygonOuterRing(container);
  if (ring.length < 3) return false;
  const candidateRing = polygonOuterRing(candidate);
  if (candidateRing.length < 3) return false;
  // Strict containment: all vertices inside.
  return candidateRing.every((c) => pointInRing(c, ring));
}

function polygonAreaApprox(feature: Feature<Polygon, GardenFeatureProperties>): number {
  const ring = polygonOuterRing(feature);
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum) / 2;
}

type ContainmentCounts = {
  plants: number;
  containers: number;
  areas: number;
  infra: number;
  total: number;
};

type ContainmentResult = {
  countsByContainerId: Map<string, ContainmentCounts>;
  childIdsByContainerId: Map<string, string[]>;
};

function computeContainment(layout: GardenFeatureCollection | null): ContainmentResult {
  const countsByContainerId = new Map<string, ContainmentCounts>();
  const childIdsByContainerId = new Map<string, string[]>();

  if (!layout?.features?.length) return { countsByContainerId, childIdsByContainerId };

  const normalized = layout.features.map((f) => ensureDefaultProperties(f as GardenFeature));

  const containers = normalized
    .filter((f) => isPolygon(f) && (f.properties?.category ?? "element") === "container")
    .map((f) => f as Feature<Polygon, GardenFeatureProperties>);

  const containerMeta = containers
    .map((c) => ({
      id: c.properties!.gardenosId,
      feature: c,
      area: polygonAreaApprox(c),
    }))
    .filter((m) => !!m.id);

  const ensureCounts = (id: string): ContainmentCounts => {
    const existing = countsByContainerId.get(id);
    if (existing) return existing;
    const next: ContainmentCounts = { plants: 0, containers: 0, areas: 0, infra: 0, total: 0 };
    countsByContainerId.set(id, next);
    return next;
  };

  const pushChild = (parentId: string, childId: string) => {
    const list = childIdsByContainerId.get(parentId) ?? [];
    list.push(childId);
    childIdsByContainerId.set(parentId, list);
  };

  for (const feature of normalized) {
    const gardenosId = feature.properties?.gardenosId;
    if (!gardenosId) continue;

    // Only items that can be contained by an area.
    const isContainerPolygon = isPolygon(feature) && (feature.properties?.category ?? "element") === "container";
    if (isContainerPolygon) {
      // We'll still allow nested areas (a polygon container inside another polygon container).
      // But never count a container as contained in itself.
    }

    const candidates: { id: string; area: number }[] = [];
    for (const c of containerMeta) {
      if (c.id === gardenosId) continue;
      let inside = false;
      if (isPoint(feature)) inside = polygonContainsPointFeature(c.feature, feature);
      else if (isLineString(feature)) inside = polygonContainsLineStringFeature(c.feature, feature);
      else if (isPolygon(feature)) inside = polygonContainsPolygonFeature(c.feature, feature);
      if (inside) candidates.push({ id: c.id, area: c.area });
    }
    if (candidates.length === 0) continue;

    // Choose the smallest containing area => the most specific container.
    candidates.sort((a, b) => (a.area || Number.POSITIVE_INFINITY) - (b.area || Number.POSITIVE_INFINITY));
    const parentId = candidates[0].id;

    pushChild(parentId, gardenosId);
    const counts = ensureCounts(parentId);
    counts.total += 1;

    const category = feature.properties?.category ?? defaultCategoryForGeometry(feature.geometry);

    if (isPoint(feature)) {
      if (category === "container") counts.containers += 1;
      else counts.plants += 1;
    } else if (isLineString(feature)) {
      counts.infra += 1;
    } else if (isPolygon(feature)) {
      if (category === "container") counts.areas += 1;
    }
  }

  return { countsByContainerId, childIdsByContainerId };
}

function makeUniqueName(baseName: string, existingNames: Set<string>): string {
  const trimmed = baseName.trim();
  if (!trimmed) return "";

  if (!existingNames.has(trimmed)) return trimmed;

  const match = /^(.*)\s\((\d+)\)$/.exec(trimmed);
  const stem = (match?.[1] ?? trimmed).trim();
  const start = match ? Number(match[2]) + 1 : 2;

  for (let i = start; i < start + 999; i += 1) {
    const candidate = `${stem} (${i})`;
    if (!existingNames.has(candidate)) return candidate;
  }

  // Fallback (should be extremely rare)
  return `${stem} (${Date.now()})`;
}

function offsetLatLng(map: L.Map, latlng: L.LatLngLiteral, dx = 24, dy = 24): L.LatLngLiteral {
  const p = map.latLngToContainerPoint(latlng);
  const p2 = L.point(p.x + dx, p.y + dy);
  const ll = map.containerPointToLatLng(p2);
  return { lat: ll.lat, lng: ll.lng };
}

function markerIcon(kind: GardenFeatureKind | undefined, selected: boolean): L.DivIcon {
  const base = "gardenos-marker";
  const kindClass = kind && isKnownKind(kind.toString()) ? `gardenos-marker--${kind}` : "";
  const selectedClass = selected ? "gardenos-marker--selected" : "";
  const className = [base, kindClass, selectedClass].filter(Boolean).join(" ");

  const size = selected ? 16 : 14;

  // Bush is intentionally a bit smaller.
  const finalSize = kind === "bush" ? (selected ? 14 : 12) : size;
  const finalAnchor = Math.round(finalSize / 2);

  return L.divIcon({
    className,
    iconSize: [finalSize, finalSize],
    iconAnchor: [finalAnchor, finalAnchor],
  });
}

function ensureMarkerHasDragging(marker: L.Marker) {
  const anyMarker = marker as unknown as {
    dragging?: { enable?: () => void; disable?: () => void };
  };

  // Leaflet.draw expects marker.dragging to exist so it can enable/disable it.
  if (anyMarker.dragging) return;

  const MarkerDragCtor = (L as unknown as { Handler?: { MarkerDrag?: new (m: L.Marker) => unknown } }).Handler
    ?.MarkerDrag;
  if (typeof MarkerDragCtor !== "function") return;

  anyMarker.dragging = new (MarkerDragCtor as unknown as new (m: L.Marker) => {
    enable?: () => void;
    disable?: () => void;
  })(marker);
}

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

L.Marker.prototype.options.icon = markerIcon(undefined, false);

type MapDrawControlsProps = {
  featureGroupRef: React.MutableRefObject<L.FeatureGroup | null>;
  mapRef: React.MutableRefObject<L.Map | null>;
  persistView: () => void;
  loadSavedLayers: () => void;
  attachClickHandler: (layer: L.Layer, feature: GardenFeature) => void;
  rebuildFromGroupAndUpdateSelection: () => void;
  setSelected: React.Dispatch<React.SetStateAction<SelectedFeatureState | null>>;
  pushUndoSnapshot: () => void;
  createKindRef: React.MutableRefObject<GardenFeatureKind>;
};

function MapDrawControls({
  featureGroupRef,
  mapRef,
  persistView,
  loadSavedLayers,
  attachClickHandler,
  rebuildFromGroupAndUpdateSelection,
  setSelected,
  pushUndoSnapshot,
  createKindRef,
}: MapDrawControlsProps) {
  const map = useMap();
  const scaleControlRef = useRef<L.Control.Scale | null>(null);

  // -----------------------------------------------------------------------
  // Store all callback props in refs so the main useEffect doesn't re-run
  // when their identity changes.  This prevents the cascade:
  //   containment change → applyLayerVisuals new id → attachClickHandler
  //   new id → loadSavedLayers new id → effect re-runs → loadSavedLayers()
  //   clears all layers → reloads from stale savedLayout → edits lost.
  // -----------------------------------------------------------------------
  const cbRef = useRef({
    persistView,
    loadSavedLayers,
    attachClickHandler,
    rebuildFromGroupAndUpdateSelection,
    setSelected,
    pushUndoSnapshot,
  });
  cbRef.current = {
    persistView,
    loadSavedLayers,
    attachClickHandler,
    rebuildFromGroupAndUpdateSelection,
    setSelected,
    pushUndoSnapshot,
  };

  useMapEvents({
    moveend: () => {
      mapRef.current = map;
      cbRef.current.persistView();
    },
  });

  useEffect(() => {
    mapRef.current = map;

    if (!scaleControlRef.current) {
      scaleControlRef.current = L.control.scale({ imperial: false, metric: true });
      scaleControlRef.current.addTo(map);
    }

    if (!featureGroupRef.current) {
      featureGroupRef.current = new L.FeatureGroup();
      map.addLayer(featureGroupRef.current);
    }

    const drawnItems = featureGroupRef.current;

    // We only use L.Control.Draw for creating new shapes (polygon/polyline/marker).
    // Editing & moving is handled directly via per-layer .editing/.dragging.
    const drawControl = new L.Control.Draw({
      edit: false as unknown as L.Control.DrawConstructorOptions["edit"],
      draw: {
        polygon: { repeatMode: true },
        polyline: { repeatMode: true },
        marker: { repeatMode: true },
        rectangle: false,
        circle: false,
        circlemarker: false,
      },
    });

    map.addControl(drawControl);

    const onCreated = (event: L.LeafletEvent) => {
      const e = event as unknown as L.DrawEvents.Created;

      cbRef.current.pushUndoSnapshot();

      drawnItems.addLayer(e.layer);

      const geo = e.layer.toGeoJSON() as GardenFeature;
      const normalized = ensureDefaultProperties({
        ...geo,
        properties: {
          ...(geo.properties ?? {}),
          kind: createKindRef.current,
        },
      });
      cbRef.current.attachClickHandler(e.layer, normalized);

      cbRef.current.rebuildFromGroupAndUpdateSelection();
      cbRef.current.setSelected({ gardenosId: normalized.properties!.gardenosId, feature: normalized });
    };

    map.on(L.Draw.Event.CREATED, onCreated);

    cbRef.current.loadSavedLayers();

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated);
      map.removeControl(drawControl);

      if (scaleControlRef.current) {
        scaleControlRef.current.remove();
        scaleControlRef.current = null;
      }
    };
    // Only re-run when the map instance changes (effectively once).
    // Callbacks are accessed via cbRef so their identity changes don't matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, featureGroupRef, mapRef, createKindRef]);

  return null;
}

export function GardenMapClient() {
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const activeDrawHandlerRef = useRef<{ disable: () => void } | null>(null);
  const createKindRef = useRef<GardenFeatureKind>("bed");

  const [isReady, setIsReady] = useState(false);
  const [selected, setSelected] = useState<SelectedFeatureState | null>(null);
  const selectedRef = useRef<SelectedFeatureState | null>(null);
  const [drawMode, setDrawMode] = useState<"select" | "bed" | "plant">("select");
  const [createPalette, setCreatePalette] = useState<"container" | "plant" | "infra">("container");
  const [createKind, setCreateKind] = useState<GardenFeatureKind>("bed");
  const [customKindDefs, setCustomKindDefs] = useState<KindDef[]>(() => loadCustomKindDefsFromStorage());
  const [newKindText, setNewKindText] = useState("");
  const [newKindError, setNewKindError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [sidebarTab, setSidebarTab] = useState<"create" | "content">("create");
  const [isEditing, setIsEditing] = useState(false);
  const [layoutForContainment, setLayoutForContainment] = useState<GardenFeatureCollection>(() => {
    const parsed = safeJsonParse<unknown>(window.localStorage.getItem(STORAGE_LAYOUT_KEY));
    if (isFeatureCollection(parsed)) return parsed;
    return { type: "FeatureCollection", features: [] } as GardenFeatureCollection;
  });

  const setSelectedAndFocus = useCallback<React.Dispatch<React.SetStateAction<SelectedFeatureState | null>>>(
    (value) => {
      setSelected((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        if (next) setSidebarTab("content");
        return next;
      });
    },
    []
  );

  const allKindDefs = useMemo(() => {
    return dedupeKindDefs([...KNOWN_KIND_DEFS, ...customKindDefs]);
  }, [customKindDefs]);

  const kindDefByKind = useMemo(() => {
    return new Map(allKindDefs.map((d) => [d.kind.toLowerCase(), d]));
  }, [allKindDefs]);

  const defaultCreateKindForPalette = useMemo(() => {
    const firstContainer = allKindDefs.find((d) => d.category === "container")?.kind ?? "bed";
    const firstPlant = allKindDefs.find((d) => d.category === "element" && d.geometry === "point" && d.group !== "infra")?.kind ?? "tree";
    const firstInfra = allKindDefs.find((d) => d.group === "infra" && d.geometry === "polyline")?.kind ?? "water";
    return { container: firstContainer, plant: firstPlant, infra: firstInfra } as const;
  }, [allKindDefs]);

  const selectedGeometry = useMemo<KindGeometry | null>(() => {
    if (!selected) return null;
    const t = selected.feature.geometry.type;
    if (t === "Polygon") return "polygon";
    if (t === "Point") return "point";
    if (t === "LineString") return "polyline";
    return null;
  }, [selected]);

  const selectedIsPolygon = selectedGeometry === "polygon";
  const selectedIsPoint = selectedGeometry === "point";
  const selectedIsPolyline = selectedGeometry === "polyline";

  const containment = useMemo(() => computeContainment(layoutForContainment), [layoutForContainment]);

  const selectedContainment = useMemo(() => {
    if (!selected) return null;
    return containment.countsByContainerId.get(selected.gardenosId) ?? null;
  }, [containment, selected]);

  const selectedContainedItemsPreview = useMemo(() => {
    if (!selected) return [] as { id: string; text: string }[];
    const ids = containment.childIdsByContainerId.get(selected.gardenosId) ?? [];
    if (!layoutForContainment?.features?.length || ids.length === 0) return [];

    const byId = new Map(
      layoutForContainment.features
        .map((f) => ensureDefaultProperties(f as GardenFeature))
        .map((f) => [f.properties!.gardenosId, f])
    );

    const out: { id: string; text: string }[] = [];
    for (const id of ids) {
      const f = byId.get(id);
      if (!f) continue;
      const name = (f.properties?.name ?? "").trim();
      const label = kindLabel(f.properties?.kind);
      out.push({ id, text: name ? `${label}: ${name}` : label });
    }
    return out;
  }, [containment.childIdsByContainerId, layoutForContainment, selected]);

  const applyLayerVisuals = useCallback(
    (layer: L.Layer, selectedId: string | null) => {
      const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
      const feature = layerWithFeature.feature;
      const kind = feature?.properties?.kind;
      const gardenosId = feature?.properties?.gardenosId;
      const isSelected = !!selectedId && !!gardenosId && gardenosId === selectedId;

      const shouldShowContainment =
        !!feature &&
        feature.geometry.type === "Polygon" &&
        (feature.properties?.category ?? defaultCategoryForGeometry(feature.geometry)) === "container";

      const containmentCounts = shouldShowContainment && gardenosId ? containment.countsByContainerId.get(gardenosId) : undefined;

      const containmentSuffix = containmentCounts && containmentCounts.total > 0
        ? ` • ${containmentCounts.plants} planter • ${containmentCounts.containers} beholdere • ${containmentCounts.areas} områder • ${containmentCounts.infra} teknik`
        : "";

      // Tooltip to reinforce what a thing is.
      const name = (feature?.properties?.name ?? "").trim();
      const label = kindLabel(kind);
      const tooltipBase = name ? `${label}: ${name}` : label;
      const tooltipText = `${tooltipBase}${containmentSuffix}`;

      const tooltipIsPermanent = false;

      const maybeTooltipLayer = layer as unknown as {
        unbindTooltip?: () => void;
        bindTooltip?: (content: string, options?: unknown) => void;
      };
      if (tooltipText && typeof maybeTooltipLayer.bindTooltip === "function") {
        maybeTooltipLayer.unbindTooltip?.();
        maybeTooltipLayer.bindTooltip(tooltipText, {
          sticky: !tooltipIsPermanent,
          permanent: tooltipIsPermanent,
          opacity: 0.9,
          className: "gardenos-tooltip",
          direction: "top",
        });
      }

      if (layer instanceof L.Marker) {
        layer.setIcon(markerIcon(kind, isSelected));
        return;
      }

      const maybePath = layer as unknown as {
        setStyle?: (options: L.PathOptions) => void;
      };
      if (typeof maybePath.setStyle !== "function") return;

      // Distinguish containers without introducing new colors.
      if (kind === "greenhouse") {
        maybePath.setStyle({
          color: "var(--foreground)",
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.03,
          dashArray: "6 6",
        });
        return;
      }

      // Technical/infrastructure lines
      if (kind === "water") {
        maybePath.setStyle({
          color: "var(--foreground)",
          weight: 3,
          opacity: 0.9,
          fillOpacity: 0,
          dashArray: "10 6",
        });
        return;
      }

      if (kind === "electric") {
        maybePath.setStyle({
          color: "var(--foreground)",
          weight: 3,
          opacity: 0.9,
          fillOpacity: 0,
          dashArray: "2 6",
        });
        return;
      }

      // Default polygon style (beds etc.)
      maybePath.setStyle({
        color: "var(--foreground)",
        weight: 2,
        opacity: 0.85,
        fillOpacity: 0.08,
        dashArray: undefined,
      });
    },
    [containment]
  );

  const updateSelectionStyles = useCallback(
    (selectedId: string | null) => {
      const group = featureGroupRef.current;
      if (!group) return;

      group.eachLayer((layer) => {
        // First apply the base visuals per kind, then apply selection highlight on top.
        applyLayerVisuals(layer, selectedId);

        const layerWithFeature = layer as L.Layer & {
          feature?: GardenFeature;
          __gardenosOriginalStyle?: L.PathOptions;
        };

        const gardenosId = layerWithFeature.feature?.properties?.gardenosId;
        const isSelected = !!selectedId && gardenosId === selectedId;

        if (layerWithFeature instanceof L.Marker) return;

        const maybePath = layerWithFeature as unknown as {
          setStyle?: (options: L.PathOptions) => void;
          bringToFront?: () => void;
          options?: L.PathOptions;
        };

        if (typeof maybePath.setStyle !== "function") return;

        if (!layerWithFeature.__gardenosOriginalStyle) {
          const o = maybePath.options ?? {};
          layerWithFeature.__gardenosOriginalStyle = {
            color: o.color,
            weight: o.weight,
            opacity: o.opacity,
            fillColor: o.fillColor,
            fillOpacity: o.fillOpacity,
            dashArray: o.dashArray,
          };
        }

        if (isSelected) {
          maybePath.setStyle({
            color: "var(--foreground)",
            weight: 4,
            opacity: 1,
            fillOpacity: 0.12,
          });
          maybePath.bringToFront?.();
        } else {
          // Base visuals already applied above.
        }
      });
    },
    [applyLayerVisuals, featureGroupRef]
  );

  useEffect(() => {
    updateSelectionStyles(selected?.gardenosId ?? null);
  }, [layoutForContainment, selected?.gardenosId, updateSelectionStyles]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const attachClickHandler = useCallback(
    (layer: L.Layer, feature: GardenFeature) => {
      const typedFeature = ensureDefaultProperties(feature);

      const onClick = () => {
        setSelectedAndFocus({ gardenosId: typedFeature.properties!.gardenosId, feature: typedFeature });
      };

      layer.on("click", onClick);

      // Keep the feature on the layer so edits preserve properties.
      (layer as L.Layer & { feature?: GardenFeature }).feature = typedFeature;

      // Leaflet.draw edit mode assumes markers have a dragging handler.
      if (layer instanceof L.Marker) {
        ensureMarkerHasDragging(layer);
        // Keep markers non-draggable by default; edit mode/our move mode will enable as needed.
        (layer as unknown as { dragging?: { disable?: () => void } }).dragging?.disable?.();
      }

      // Apply visuals immediately.
      applyLayerVisuals(layer, selectedRef.current?.gardenosId ?? null);
    },
    [applyLayerVisuals, setSelectedAndFocus]
  );

  const savedLayout = useMemo(() => {
    const parsed = safeJsonParse<unknown>(window.localStorage.getItem(STORAGE_LAYOUT_KEY));
    if (!isFeatureCollection(parsed)) return null;
    return parsed;
  }, []);

  const savedView = useMemo(() => {
    return safeJsonParse<{ center: [number, number]; zoom: number }>(
      window.localStorage.getItem(STORAGE_VIEW_KEY)
    );
  }, []);

  const persistAll = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    const normalized = serializeGroup(group);
    window.localStorage.setItem(STORAGE_LAYOUT_KEY, JSON.stringify(normalized));
  }, []);

  const pushUndoSnapshot = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    const layout = serializeGroup(group);
    const selectedId = selectedRef.current?.gardenosId ?? null;

    setUndoStack((prev) => {
      const next = [...prev, { layout, selectedId }];
      return next.length > 30 ? next.slice(next.length - 30) : next;
    });
  }, []);

  // Keep a ref to attachClickHandler so loadSnapshot doesn't depend on its
  // identity (which changes whenever containment changes).
  const attachClickHandlerRef = useRef(attachClickHandler);
  attachClickHandlerRef.current = attachClickHandler;

  const loadSnapshot = useCallback(
    (snapshot: UndoSnapshot) => {
      const group = featureGroupRef.current;
      if (!group) return;

      group.clearLayers();

      const geoJsonLayer = L.geoJSON(snapshot.layout as GardenFeatureCollection, {
        onEachFeature: (feature, layer) => {
          attachClickHandlerRef.current(layer, feature as GardenFeature);
        },
      });

      geoJsonLayer.eachLayer((layer) => {
        group.addLayer(layer);
      });

      window.localStorage.setItem(STORAGE_LAYOUT_KEY, JSON.stringify(snapshot.layout));
      setLayoutForContainment(snapshot.layout as GardenFeatureCollection);

      if (snapshot.selectedId) {
        const found = snapshot.layout.features.find(
          (f) => f.properties?.gardenosId === snapshot.selectedId
        );
        setSelectedAndFocus(found ? { gardenosId: snapshot.selectedId, feature: found } : null);
      } else {
        setSelectedAndFocus(null);
      }

      updateSelectionStyles(snapshot.selectedId);
    },
    [setSelectedAndFocus, updateSelectionStyles]
  );

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      queueMicrotask(() => loadSnapshot(snapshot));
      return prev.slice(0, -1);
    });
  }, [loadSnapshot]);

  const rebuildFromGroupAndUpdateSelection = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    const normalized = serializeGroup(group);
    window.localStorage.setItem(STORAGE_LAYOUT_KEY, JSON.stringify(normalized));

    setLayoutForContainment(normalized);

    const prevSelected = selectedRef.current;
    if (prevSelected) {
      const found = normalized.features.find(
        (f) => f.properties?.gardenosId === prevSelected.gardenosId
      );
      setSelectedAndFocus(found ? { gardenosId: prevSelected.gardenosId, feature: found } : null);
    }
  }, [setSelectedAndFocus]);

  const setMoveAndPersistHandlersEnabled = useCallback(
    (enabled: boolean, selectedId: string | null) => {
      const group = featureGroupRef.current;
      if (!group) return;

      group.eachLayer((layer) => {
        const layerWithHandlers = layer as L.Layer & { __gardenosOnDragEnd?: () => void };
        const layerFeature = (layer as L.Layer & { feature?: GardenFeature }).feature;
        const gardenosId = layerFeature?.properties?.gardenosId;
        const isSelected = !!selectedId && gardenosId === selectedId;

        if (enabled) {
          if (!layerWithHandlers.__gardenosOnDragEnd) {
            const onDragEnd = () => rebuildFromGroupAndUpdateSelection();
            layerWithHandlers.__gardenosOnDragEnd = onDragEnd;
            layer.on("dragend", onDragEnd);
          }

          // Enable dragging for paths (polygons) if leaflet-path-drag is available.
          if (layer instanceof L.Path) {
            const anyPath = layer as unknown as {
              options?: { draggable?: boolean };
              dragging?: { enable?: () => void; disable?: () => void };
            };
            if (anyPath.options) anyPath.options.draggable = isSelected;

            // leaflet-path-drag creates `path.dragging` via an addInitHook on L.Path.
            // The handler is always created, but only auto-enabled when options.draggable
            // was true at construction time.  For layers created via L.geoJSON (without
            // draggable:true), `dragging` exists but is not enabled.  If for some reason
            // the init hook didn't fire, we create the handler manually here.
            if (isSelected && !anyPath.dragging) {
              /* eslint-disable @typescript-eslint/no-explicit-any */
              const PathDragCtor =
                (L as any).PathDrag ??                     // leaflet-path-drag ≥ 1.1
                (L as any).Handler?.PathDrag;               // older versions
              /* eslint-enable @typescript-eslint/no-explicit-any */
              if (typeof PathDragCtor === "function") {
                anyPath.dragging = new (PathDragCtor as unknown as new (
                  p: L.Path
                ) => { enable?: () => void; disable?: () => void })(layer);
              }
            }

            if (isSelected) anyPath.dragging?.enable?.();
            else anyPath.dragging?.disable?.();
          }

          // Ensure only the selected marker is draggable.
          if (layer instanceof L.Marker) {
            const anyMarker = layer as unknown as {
              dragging?: { enable?: () => void; disable?: () => void };
            };

            // Leaflet only creates marker.dragging when the marker was constructed with { draggable: true }.
            // Create it manually so we can enable/disable it on demand.
            if (!anyMarker.dragging) {
              const MarkerDragCtor = (L as unknown as { Handler?: { MarkerDrag?: new (m: L.Marker) => unknown } })
                .Handler?.MarkerDrag;
              if (typeof MarkerDragCtor === "function") {
                anyMarker.dragging = new (MarkerDragCtor as unknown as new (
                  m: L.Marker
                ) => { enable?: () => void; disable?: () => void })(layer);
              }
            }

            if (isSelected) {
              anyMarker.dragging?.enable?.();
            } else {
              anyMarker.dragging?.disable?.();
            }
          }

          return;
        }

        if (layerWithHandlers.__gardenosOnDragEnd) {
          layer.off("dragend", layerWithHandlers.__gardenosOnDragEnd);
          delete layerWithHandlers.__gardenosOnDragEnd;
        }

        if (layer instanceof L.Path) {
          const maybeDragging = layer as unknown as { dragging?: { disable?: () => void } };
          maybeDragging.dragging?.disable?.();
        }

        if (layer instanceof L.Marker) {
          const maybeMarkerDragging = layer as unknown as { dragging?: { disable?: () => void } };
          maybeMarkerDragging.dragging?.disable?.();
        }
      });
    },
    [rebuildFromGroupAndUpdateSelection]
  );

  // ---------------------------------------------------------------------------
  // Direct per-layer editing — replaces the old L.EditToolbar.Edit approach.
  // We enable .editing (vertex handles) and .dragging only on the selected
  // layer, and never touch any other layer.  This avoids the "all figures
  // get selected" visual bug and the crash in _disableLayerEdit.
  // ---------------------------------------------------------------------------

  const enableEditingOnLayer = useCallback((layer: L.Layer) => {
    // Enable vertex editing for paths (polygons, polylines)
    const maybeEditable = layer as unknown as { editing?: { enable?: () => void; disable?: () => void } };
    if (typeof maybeEditable.editing?.enable === "function") {
      try { maybeEditable.editing.enable(); } catch { /* noop */ }
    }
  }, []);

  const disableEditingOnLayer = useCallback((layer: L.Layer) => {
    // Disable vertex editing for paths
    const maybeEditable = layer as unknown as { editing?: { enable?: () => void; disable?: () => void } };
    if (typeof maybeEditable.editing?.disable === "function") {
      try { maybeEditable.editing.disable(); } catch { /* noop */ }
    }
  }, []);

  const enableEditingForSelected = useCallback((selectedId: string | null) => {
    const group = featureGroupRef.current;
    if (!group || !selectedId) return;

    group.eachLayer((layer) => {
      const layerFeature = (layer as L.Layer & { feature?: GardenFeature }).feature;
      const gardenosId = layerFeature?.properties?.gardenosId;
      const isSelected = gardenosId === selectedId;

      if (isSelected) {
        enableEditingOnLayer(layer);
      } else {
        disableEditingOnLayer(layer);
      }
    });
  }, [enableEditingOnLayer, disableEditingOnLayer]);

  const disableEditingForAll = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    group.eachLayer((layer) => {
      disableEditingOnLayer(layer);
    });
  }, [disableEditingOnLayer]);

  const startEditing = useCallback(() => {
    const selectedId = selectedRef.current?.gardenosId ?? null;
    if (!selectedId) return;

    // Stop any active draw handler
    activeDrawHandlerRef.current?.disable();
    activeDrawHandlerRef.current = null;
    setDrawMode("select");

    pushUndoSnapshot();
    setIsEditing(true);

    // Enable vertex editing + dragging only for the selected layer
    enableEditingForSelected(selectedId);
    setMoveAndPersistHandlersEnabled(true, selectedId);
  }, [enableEditingForSelected, pushUndoSnapshot, setMoveAndPersistHandlersEnabled]);

  const stopEditing = useCallback(() => {
    if (!isEditing) return;

    // Disable vertex editing on all layers
    disableEditingForAll();

    // Disable dragging on all layers
    setMoveAndPersistHandlersEnabled(false, null);

    setIsEditing(false);

    // Persist changes and refresh selection
    rebuildFromGroupAndUpdateSelection();
  }, [isEditing, disableEditingForAll, rebuildFromGroupAndUpdateSelection, setMoveAndPersistHandlersEnabled]);

  // When the selected item changes while in edit mode, update which layer is editable.
  useEffect(() => {
    if (!isEditing) return;
    const selectedId = selected?.gardenosId ?? null;
    enableEditingForSelected(selectedId);
    setMoveAndPersistHandlersEnabled(true, selectedId);
  }, [isEditing, selected?.gardenosId, setMoveAndPersistHandlersEnabled, enableEditingForSelected]);

  const beginDraw = useCallback((kind: GardenFeatureKind) => {
    const map = mapRef.current;
    if (!map) return;

    // Force-disable any editing mode before drawing.
    // This makes drawing reliable even if Leaflet.draw edit mode was enabled outside our UI.
    stopEditing();

    createKindRef.current = kind;
    activeDrawHandlerRef.current?.disable();

    const kindKey = kind.toString().toLowerCase();
    const geometry: KindGeometry =
      kindDefByKind.get(kindKey)?.geometry ?? (kind === "bed" || kind === "greenhouse" ? "polygon" : "point");

    if (geometry === "polygon") {
      // Leaflet.draw handler works even if toolbar icons are missing.
      const handler = new L.Draw.Polygon(map as unknown as L.DrawMap, { repeatMode: true });
      handler.enable();
      activeDrawHandlerRef.current = handler;
      setDrawMode("bed");
      return;
    }

    if (geometry === "polyline") {
      const handler = new L.Draw.Polyline(map as unknown as L.DrawMap, { repeatMode: true });
      handler.enable();
      activeDrawHandlerRef.current = handler;
      setDrawMode("plant");
      return;
    }

    const handler = new L.Draw.Marker(map as unknown as L.DrawMap, { repeatMode: true });
    handler.enable();
    activeDrawHandlerRef.current = handler;
    setDrawMode("plant");
  }, [kindDefByKind, stopEditing]);

  const beginDrawSelectedType = useCallback(() => {
    beginDraw(createKind);
  }, [beginDraw, createKind]);

  const stopDrawing = useCallback(() => {
    activeDrawHandlerRef.current?.disable();
    activeDrawHandlerRef.current = null;
    setDrawMode("select");
  }, []);

  const enterSelectMode = useCallback(() => {
    stopDrawing();
    // Force-disable any editing mode to avoid being stuck in edit/delete.
    stopEditing();
  }, [stopDrawing, stopEditing]);

  const toggleEditMode = useCallback(() => {
    // Avoid conflicts with active draw handlers.
    stopDrawing();

    if (isEditing) stopEditing();
    else startEditing();
  }, [isEditing, startEditing, stopDrawing, stopEditing]);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;

    const group = featureGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;

    pushUndoSnapshot();

    const currentLayout = serializeGroup(group);
    const existingNames = new Set(
      currentLayout.features
        .map((f) => (f.properties?.name ?? "").trim())
        .filter((name) => name.length > 0)
    );

    const source = selected.feature;

    const nextName = makeUniqueName(source.properties?.name ?? "", existingNames);
    const nextProperties: GardenFeatureProperties = {
      ...(source.properties ?? ({} as GardenFeatureProperties)),
      gardenosId: "__temp__",
      name: nextName,
    };
    // Ensure a new ID gets generated
    delete (nextProperties as Partial<GardenFeatureProperties>).gardenosId;

    let nextGeometry: Geometry = source.geometry;

    if (source.geometry.type === "Point") {
      const [lng, lat] = source.geometry.coordinates;
      const ll = offsetLatLng(map, { lat, lng });
      nextGeometry = { type: "Point", coordinates: [ll.lng, ll.lat] };
    } else if (source.geometry.type === "Polygon") {
      const coords = source.geometry.coordinates;
      const nextCoords = coords.map((ring) =>
        ring.map(([lng, lat]) => {
          const ll = offsetLatLng(map, { lat, lng });
          return [ll.lng, ll.lat] as [number, number];
        })
      );
      nextGeometry = { type: "Polygon", coordinates: nextCoords };
    } else {
      // Unsupported geometry for now
      return;
    }

    const nextFeature = ensureDefaultProperties({
      type: "Feature",
      geometry: nextGeometry,
      properties: nextProperties,
    });

    const layerGroup = L.geoJSON(nextFeature as GardenFeatureCollection | GardenFeature, {
      onEachFeature: (feature, layer) => {
        attachClickHandler(layer, feature as GardenFeature);
      },
    });

    let createdLayer: L.Layer | null = null;
    layerGroup.eachLayer((layer) => {
      if (!createdLayer) createdLayer = layer;
      group.addLayer(layer);
    });

    rebuildFromGroupAndUpdateSelection();
    setSelected({ gardenosId: nextFeature.properties!.gardenosId, feature: nextFeature });
  }, [attachClickHandler, pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, selected]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    const group = featureGroupRef.current;
    if (!group) return;

    pushUndoSnapshot();

    const layersToRemove: L.Layer[] = [];
    group.eachLayer((layer) => {
      const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
      if (layerWithFeature.feature?.properties?.gardenosId === selected.gardenosId) {
        layersToRemove.push(layer);
      }
    });

    for (const layer of layersToRemove) {
      group.removeLayer(layer);
    }

    setSelected(null);
    updateSelectionStyles(null);
    rebuildFromGroupAndUpdateSelection();
  }, [pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, selected, updateSelectionStyles]);

  const deleteAll = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    pushUndoSnapshot();
    group.clearLayers();
    setSelected(null);
    updateSelectionStyles(null);
    persistAll();
    setLayoutForContainment({ type: "FeatureCollection", features: [] } as GardenFeatureCollection);
  }, [persistAll, pushUndoSnapshot, updateSelectionStyles]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingTarget =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;

      if (e.key === "Escape") {
        stopDrawing();
        stopEditing();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (!isTypingTarget) {
          e.preventDefault();
          undo();
        }
        return;
      }

      if (!selected) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        // While drawing, let Leaflet.draw own Backspace/Delete behavior.
        if (drawMode !== "select") return;
        if (isTypingTarget) return;
        e.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, drawMode, selected, stopDrawing, stopEditing, undo]);

  const loadSavedLayers = useCallback(() => {
    const group = featureGroupRef.current;
    if (!group) return;

    group.clearLayers();
    setLayoutForContainment({ type: "FeatureCollection", features: [] } as GardenFeatureCollection);

    if (!savedLayout?.features?.length) {
      setIsReady(true);
      return;
    }

    const geoJsonLayer = L.geoJSON(savedLayout as GardenFeatureCollection, {
      onEachFeature: (feature, layer) => {
        attachClickHandlerRef.current(layer, feature as GardenFeature);
      },
    });

    geoJsonLayer.eachLayer((layer) => {
      group.addLayer(layer);
    });

    setLayoutForContainment(savedLayout as GardenFeatureCollection);

    persistAll();
    setIsReady(true);
  }, [persistAll, savedLayout]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!savedView) return;

    const map = mapRef.current;
    map.setView(savedView.center, savedView.zoom);
  }, [savedView]);

  const persistView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const center = map.getCenter();
    window.localStorage.setItem(
      STORAGE_VIEW_KEY,
      JSON.stringify({ center: [center.lat, center.lng] as [number, number], zoom: map.getZoom() })
    );
  }, []);

  const updateSelectedProperty = useCallback(
    (patch: Partial<GardenFeatureProperties>) => {
      if (!selected) return;
      const group = featureGroupRef.current;
      if (!group) return;

      pushUndoSnapshot();

      // Update state
      const updatedFeature: GardenFeature = ensureDefaultProperties({
        ...selected.feature,
        properties: {
          ...selected.feature.properties,
          ...patch,
          gardenosId: selected.gardenosId,
        },
      });

      // Update the matching layer's stored feature properties
      group.eachLayer((layer) => {
        const layerWithFeature = layer as L.Layer & { feature?: GardenFeature };
        const layerFeature = layerWithFeature.feature;
        if (layerFeature?.properties?.gardenosId === selected.gardenosId) {
          layerWithFeature.feature = updatedFeature;
          applyLayerVisuals(layer, selected.gardenosId);
        }
      });

      setSelected({ gardenosId: selected.gardenosId, feature: updatedFeature });
      rebuildFromGroupAndUpdateSelection();
    },
    [applyLayerVisuals, pushUndoSnapshot, rebuildFromGroupAndUpdateSelection, selected]
  );

  const initialCenter = useMemo<[number, number]>(() => {
    if (savedView?.center) return savedView.center;
    return [55.6761, 12.5683];
  }, [savedView]);

  const initialZoom = useMemo(() => {
    return savedView?.zoom ?? 16;
  }, [savedView]);

  const selectedKind = selected?.feature.properties?.kind;
  const selectedCategory = selected?.feature.properties?.category;

  const effectiveSelectedKind = useMemo(() => {
    if (!selected) return undefined;
    return selectedKind ?? defaultKindForGeometry(selected.feature.geometry);
  }, [selected, selectedKind]);

  const selectedKindDef = useMemo(() => {
    if (!effectiveSelectedKind) return undefined;
    return kindDefByKind.get(String(effectiveSelectedKind).toLowerCase());
  }, [effectiveSelectedKind, kindDefByKind]);

  const selectedIsInfra = (selectedKindDef?.group ?? "default") === "infra" || selectedIsPolyline;

  const allowedKindDefsForSelected = useMemo(() => {
    if (!selected) return [] as KindDef[];
    const wantedGeometry: KindGeometry =
      selectedGeometry ?? (isPolygon(selected.feature) ? "polygon" : isPoint(selected.feature) ? "point" : "polyline");
    return allKindDefs.filter((d) => d.geometry === wantedGeometry);
  }, [allKindDefs, selected, selectedGeometry]);

  const createKindOptions = useMemo(() => {
    if (createPalette === "infra") {
      return allKindDefs
        .filter((d) => d.group === "infra" && d.geometry === "polyline")
        .map((d) => ({ value: d.kind as GardenFeatureKind, label: d.label }));
    }

    if (createPalette === "plant") {
      return allKindDefs
        .filter((d) => d.category === "element" && d.geometry === "point" && d.group !== "infra")
        .map((d) => ({ value: d.kind as GardenFeatureKind, label: d.label }));
    }

    return allKindDefs
      .filter((d) => d.category === "container")
      .map((d) => ({ value: d.kind as GardenFeatureKind, label: d.label }));
  }, [allKindDefs, createPalette]);

  const addCustomKind = useCallback(() => {
    const label = newKindText.trim();
    if (!label) {
      setNewKindError("Skriv et navn for typen.");
      return;
    }

    const lower = label.toLowerCase();
    if (kindDefByKind.has(lower)) {
      setNewKindError("Typen findes allerede.");
      return;
    }

    const group: KindGroup = createPalette === "infra" ? "infra" : "default";
    const category: GardenFeatureCategory = createPalette === "container" ? "container" : "element";
    const geometry: KindGeometry =
      createPalette === "container" ? "polygon" : createPalette === "infra" ? "polyline" : "point";

    const next: KindDef = { kind: label, label, category, geometry, group };

    const nextCustom = dedupeKindDefs([...customKindDefs, next]).filter((d) => !isKnownKind(d.kind));
    setCustomKindDefs(nextCustom);
    saveCustomKindDefsToStorage(nextCustom);

    setCreateKind(next.kind as GardenFeatureKind);
    createKindRef.current = next.kind as GardenFeatureKind;
    setNewKindText("");
    setNewKindError(null);
  }, [createPalette, customKindDefs, kindDefByKind, newKindText]);

  const selectedContainerAreaText = useMemo(() => {
    if (!selected || !selectedIsPolygon) return "";
    if (selectedCategory !== "container") return "";
    const area = areaForPolygonFeature(selected.feature as Feature<Polygon, GardenFeatureProperties>);
    if (area == null) return "";
    return formatAreaSquareMeters(area);
  }, [selected, selectedCategory, selectedIsPolygon]);

  return (
    <div className="grid h-[calc(100vh-0px)] w-full grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[1fr_320px]">
      <div className="col-span-1 row-start-1 flex items-center justify-between gap-2 border-b border-foreground/10 bg-background p-2 md:col-span-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5"
            onClick={enterSelectMode}
            title="Afbryd tegning/redigering (Esc)"
          >
            Markér
          </button>
          <button
            type="button"
            className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
            onClick={toggleEditMode}
            disabled={!selected}
            title={
              isEditing
                ? "Stop redigering og gem"
                : "Redigér form og flyt (vælg først en figur på kortet)"
            }
          >
            {isEditing ? "Færdig" : "Redigér/flyt"}
          </button>
          <button
            type="button"
            className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
            onClick={undo}
            disabled={undoStack.length === 0}
            title="Fortryd (Cmd/Ctrl+Z)"
          >
            Fortryd
          </button>
        </div>
        <div className="text-xs text-foreground/60">{drawMode === "select" ? "Markér" : "Tegner…"}</div>
      </div>
      <style>{`
        .leaflet-container { height: 100%; width: 100%; }
        /* We use our own UI controls; hide Leaflet.draw's toolbar to avoid mode confusion. */
        .leaflet-draw { display: none; }
        .gardenos-marker {
          border-radius: 9999px;
          background: var(--foreground);
          border: 2px solid var(--background);
          box-sizing: border-box;
        }

        /* Type differentiation (no new colors). */
        .gardenos-marker--tree {
          border-radius: 9999px;
        }
        .gardenos-marker--bush {
          border-radius: 9999px;
          border-width: 3px;
        }
        .gardenos-marker--pot {
          border-radius: 4px;
          background: transparent;
          border-color: var(--foreground);
        }

        .gardenos-marker--selected {
          border-width: 3px;
        }

        .leaflet-tooltip.gardenos-tooltip {
          background: var(--background);
          color: var(--foreground);
          border: 1px solid var(--foreground);
          padding: 4px 6px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.2;
        }

        .leaflet-tooltip.gardenos-tooltip:before {
          border-top-color: var(--foreground);
        }
      `}</style>

      <div className="relative row-start-2">
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          maxZoom={22}
          zoomSnap={0.25}
          zoomDelta={0.25}
          className="absolute inset-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxNativeZoom={19}
            maxZoom={22}
          />

          <MapDrawControls
            featureGroupRef={featureGroupRef}
            mapRef={mapRef}
            persistView={persistView}
            loadSavedLayers={loadSavedLayers}
            attachClickHandler={attachClickHandler}
            rebuildFromGroupAndUpdateSelection={rebuildFromGroupAndUpdateSelection}
            setSelected={setSelectedAndFocus}
            pushUndoSnapshot={pushUndoSnapshot}
            createKindRef={createKindRef}
          />
        </MapContainer>

        {!isReady ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-sm text-foreground/80">Indlæser kort…</div>
          </div>
        ) : null}
      </div>

      <aside className="row-start-2 border-t border-foreground/10 bg-background p-4 md:border-l md:border-t-0">
        <h2 className="text-base font-semibold">Detaljer</h2>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${
              sidebarTab === "create"
                ? "border-foreground/30 bg-foreground/5"
                : "border-foreground/20 bg-background hover:bg-foreground/5"
            }`}
            onClick={() => setSidebarTab("create")}
          >
            Opret
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${
              sidebarTab === "content"
                ? "border-foreground/30 bg-foreground/5"
                : "border-foreground/20 bg-background hover:bg-foreground/5"
            } ${selected ? "" : "opacity-50"}`}
            onClick={() => setSidebarTab("content")}
            disabled={!selected}
            title={selected ? "" : "Vælg noget på kortet for at se indhold"}
          >
            Indhold
          </button>
        </div>

        {sidebarTab === "create" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground/70">Hvad vil du tegne?</label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5"
                  onClick={() => {
                    setCreatePalette("container");
                    const next = defaultCreateKindForPalette.container as GardenFeatureKind;
                    setCreateKind(next);
                    createKindRef.current = next;
                    setNewKindError(null);
                  }}
                >
                  Beholder/område
                </button>
                <button
                  type="button"
                  className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5"
                  onClick={() => {
                    setCreatePalette("plant");
                    const next = defaultCreateKindForPalette.plant as GardenFeatureKind;
                    setCreateKind(next);
                    createKindRef.current = next;
                    setNewKindError(null);
                  }}
                >
                  Plante
                </button>
                <button
                  type="button"
                  className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5"
                  onClick={() => {
                    setCreatePalette("infra");
                    const next = defaultCreateKindForPalette.infra as GardenFeatureKind;
                    setCreateKind(next);
                    createKindRef.current = next;
                    setNewKindError(null);
                  }}
                >
                  Teknik
                </button>
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground/70">Type</label>
              <select
                className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
                value={createKind}
                onChange={(e) => {
                  const next = e.target.value as GardenFeatureKind;
                  setCreateKind(next);
                  createKindRef.current = next;
                  setNewKindError(null);
                }}
              >
                {createKindOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground/70">Ny type</label>
              <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
                <input
                  className="w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
                  value={newKindText}
                  onChange={(e) => setNewKindText(e.target.value)}
                  placeholder={
                    createPalette === "container" ? "Fx Udehus" : createPalette === "plant" ? "Fx Tomat" : "Fx Nedgravet kabel"
                  }
                />
                <button
                  type="button"
                  className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5"
                  onClick={addCustomKind}
                >
                  Tilføj
                </button>
              </div>
              {newKindError ? <p className="mt-1 text-xs text-foreground/70">{newKindError}</p> : null}
              <p className="mt-1 text-xs text-foreground/60">
                Nye typer gemmes på denne enhed (localStorage).
              </p>
            </div>

            <button
              type="button"
              className="col-span-2 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5"
              onClick={beginDrawSelectedType}
            >
              Tegn
            </button>
            <button
              type="button"
              className="col-span-2 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
              onClick={enterSelectMode}
              disabled={drawMode === "select"}
              title="Tryk også Esc"
            >
              Markér/pege
            </button>

          </div>
        ) : null}

        {sidebarTab === "content" ? (
          !selected ? (
            <p className="mt-3 text-sm text-foreground/70">
              Vælg noget på kortet (område/punkt/linje) for at se og redigere indhold.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-foreground/70">Type</label>
              <select
                className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
                value={selectedKind ?? defaultKindForGeometry(selected.feature.geometry)}
                onChange={(e) => {
                  const nextKind = e.target.value as GardenFeatureKind;
                  updateSelectedProperty({ kind: nextKind, category: categoryForKind(nextKind, selected.feature.geometry) });
                }}
              >
                {allowedKindDefsForSelected.map((def) => (
                  <option key={def.kind} value={def.kind}>
                    {def.label}
                  </option>
                ))}
              </select>
              {selectedIsPolygon ? <p className="mt-1 text-xs text-foreground/60">Polygoner er områder</p> : null}
              {selectedIsPoint ? <p className="mt-1 text-xs text-foreground/60">Punkter er elementer/beholdere</p> : null}
              {selectedIsPolyline ? <p className="mt-1 text-xs text-foreground/60">Linjer er teknik (rør/el/…)</p> : null}
            </div>

            {selectedContainerAreaText ? (
              <div>
                <label className="block text-xs font-medium text-foreground/70">Areal</label>
                <div className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm">
                  {selectedContainerAreaText}
                </div>
              </div>
            ) : null}

            {selectedIsPolygon && selectedCategory === "container" ? (
              <div>
                <label className="block text-xs font-medium text-foreground/70">Indeholder</label>
                <div className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm">
                  {selectedContainment && selectedContainment.total > 0
                    ? `${selectedContainment.plants} planter, ${selectedContainment.containers} beholdere, ${selectedContainment.areas} områder, ${selectedContainment.infra} teknik`
                    : "Ingen (endnu)"}
                </div>

                {selectedContainment && selectedContainment.total > 0 ? (
                  <div className="mt-2 space-y-1">
                    {selectedContainedItemsPreview.slice(0, 12).map((item) => (
                      <div key={item.id} className="text-xs text-foreground/70">
                        {item.text}
                      </div>
                    ))}
                    {selectedContainedItemsPreview.length > 12 ? (
                      <div className="text-xs text-foreground/60">
                        … +{selectedContainedItemsPreview.length - 12} flere
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-foreground/70">Navn</label>
              <input
                className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
                value={selected.feature.properties?.name ?? ""}
                onChange={(e) => updateSelectedProperty({ name: e.target.value })}
                placeholder="Fx Køkkenbed 1 / Æbletræ"
              />
            </div>

            {selectedKind === "bed" ? (
              <div>
                <label className="block text-xs font-medium text-foreground/70">Bed-type</label>
                <input
                  className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
                  value={selected.feature.properties?.bedType ?? ""}
                  onChange={(e) => updateSelectedProperty({ bedType: e.target.value })}
                  placeholder="Fx køkkenbed, blomsterbed"
                />
              </div>
            ) : null}

            {selectedCategory !== "container" && !selectedIsInfra ? (
              <div>
                <label className="block text-xs font-medium text-foreground/70">Hvad plantes</label>
                <input
                  className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
                  value={selected.feature.properties?.planted ?? ""}
                  onChange={(e) => updateSelectedProperty({ planted: e.target.value })}
                  placeholder="Fx kartofler / gulerødder / sort"
                />
              </div>
            ) : null}

            {selectedCategory !== "container" && !selectedIsInfra ? (
              <div>
                <label className="block text-xs font-medium text-foreground/70">Plantningsdato</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
                  value={selected.feature.properties?.plantedAt ?? ""}
                  onChange={(e) => updateSelectedProperty({ plantedAt: e.target.value })}
                />
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-foreground/70">{selectedIsInfra ? "Tekst" : "Noter"}</label>
              <textarea
                className="mt-1 min-h-[120px] w-full resize-y rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
                value={selected.feature.properties?.notes ?? ""}
                onChange={(e) => updateSelectedProperty({ notes: e.target.value })}
                placeholder={selectedIsInfra ? "Fx dybde/placering/kommentar" : "Fx gødes i april / skal beskæres"}
              />
            </div>

            {selectedIsPoint ? (
              <p className="text-xs text-foreground/60">Tip: punkter kan være træ/busk/krukke.</p>
            ) : null}

            {selectedIsPolyline ? (
              <p className="text-xs text-foreground/60">Tip: linjer kan flyttes/redigeres i “Redigér/flyt”.</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
                onClick={duplicateSelected}
                disabled={!selected}
                title="Lav en kopi med nyt navn"
              >
                Kopiér
              </button>
              <button
                type="button"
                className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
                onClick={deleteSelected}
                disabled={!selected}
                title="Du kan også bruge Delete/Backspace"
              >
                Slet valgt
              </button>
              <button
                type="button"
                className="col-span-2 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5 disabled:opacity-50"
                onClick={undo}
                disabled={undoStack.length === 0}
                title="Cmd/Ctrl+Z (uden for felter)"
              >
                Fortryd
              </button>
              <button
                type="button"
                className="col-span-2 rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm hover:bg-foreground/5"
                onClick={deleteAll}
              >
                Slet alt
              </button>
            </div>

            <p className="text-xs text-foreground/60">Layout gemmes automatisk i denne browser.</p>
          </div>
          )
        ) : null}
      </aside>
    </div>
  );
}
