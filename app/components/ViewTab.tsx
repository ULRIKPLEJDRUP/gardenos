"use client";

import React, { useState, useCallback } from "react";
import L from "leaflet";
import {
  exportGeoJSON,
  exportPlantCSV,
  copyShareLink,
  printGardenSummary,
  type ExportPlantRow,
} from "../lib/exportStore";
import {
  getPlantById,
  getInstancesForFeature,
} from "../lib/plantStore";
import { sunHoursToColor } from "../lib/sunAnalysis";
import type { WeatherData } from "../lib/weatherStore";

// ── Types re-exported from GardenMapClient (module-level) ──

type GardenFeatureCategory = "element" | "row" | "seedbed" | "container" | "area" | "condition";

interface MapBookmark {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  emoji?: string;
  favorite?: boolean;
}

interface AnchorPoint {
  id: string;
  name: string;
  emoji: string;
  lat: number;
  lng: number;
  description?: string;
}

type KindDef = {
  kind: string;
  label: string;
  category: GardenFeatureCategory;
  geometry: string;
  subGroup?: string;
};

type GardenFeatureProperties = Record<string, unknown> & {
  gardenosId?: string;
  kind?: string;
  category?: string;
  name?: string;
  notes?: string;
};

type GardenFeature = GeoJSON.Feature<GeoJSON.Geometry, GardenFeatureProperties>;
type GardenFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, GardenFeatureProperties>;

type ViewSubTab = "steder" | "baggrund" | "synlighed" | "ankre" | "eksport";

// ── Props ──

export interface ViewTabProps {
  // Sub-tab
  viewSubTab: ViewSubTab;
  setViewSubTab: (tab: ViewSubTab) => void;

  // Address search
  addressQuery: string;
  setAddressQuery: (q: string) => void;
  addressResults: Array<{ display_name: string; lat: string; lon: string }>;
  setAddressResults: (r: Array<{ display_name: string; lat: string; lon: string }>) => void;
  addressSearching: boolean;
  searchAddress: (q: string) => void;
  searchAddressDebounced: (q: string) => void;
  goToLocation: (lat: number, lon: number, zoom?: number) => void;

  // Bookmarks
  bookmarks: MapBookmark[];
  addBookmark: (name: string, emoji?: string, coords?: { lat: number; lon: number; zoom?: number }, favorite?: boolean) => void;
  updateBookmark: (id: string, patch: Partial<MapBookmark>) => void;
  removeBookmark: (id: string) => void;

  // Anchors
  anchors: AnchorPoint[];
  setAnchors: React.Dispatch<React.SetStateAction<AnchorPoint[]>>;
  saveAnchors: (anchors: AnchorPoint[]) => void;

  // Trilateration state (shared with map markers)
  triAnchorA: string | null;
  setTriAnchorA: React.Dispatch<React.SetStateAction<string | null>>;
  triAnchorB: string | null;
  setTriAnchorB: React.Dispatch<React.SetStateAction<string | null>>;
  triDistA: string;
  setTriDistA: React.Dispatch<React.SetStateAction<string>>;
  triDistB: string;
  setTriDistB: React.Dispatch<React.SetStateAction<string>>;
  triResult: { lat: number; lng: number } | null;
  setTriResult: React.Dispatch<React.SetStateAction<{ lat: number; lng: number } | null>>;
  triError: string | null;
  setTriError: React.Dispatch<React.SetStateAction<string | null>>;
  triPlaced: boolean;
  setTriPlaced: React.Dispatch<React.SetStateAction<boolean>>;
  computeTrilateration: () => void;

  // Place element at computed position
  placeTriangulatedElement: () => void;

  // Map layer toggles
  showSatellite: boolean;
  setShowSatellite: React.Dispatch<React.SetStateAction<boolean>>;
  showJordart: boolean;
  setShowJordart: React.Dispatch<React.SetStateAction<boolean>>;
  showGrid: boolean;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  showSunMap: boolean;
  setShowSunMap: React.Dispatch<React.SetStateAction<boolean>>;
  showMatrikel: boolean;
  setShowMatrikel: React.Dispatch<React.SetStateAction<boolean>>;
  showTerrain: boolean;
  setShowTerrain: React.Dispatch<React.SetStateAction<boolean>>;

  // Datafordeler credentials
  dfUser: string;
  setDfUser: React.Dispatch<React.SetStateAction<string>>;
  dfPass: string;
  setDfPass: React.Dispatch<React.SetStateAction<string>>;
  dfTestStatus: "idle" | "testing" | "ok" | "fail";
  setDfTestStatus: React.Dispatch<React.SetStateAction<"idle" | "testing" | "ok" | "fail">>;

  // Visibility
  hiddenCategories: Set<GardenFeatureCategory>;
  setHiddenCategories: React.Dispatch<React.SetStateAction<Set<GardenFeatureCategory>>>;
  hiddenVisibilityKinds: Set<string>;
  setHiddenVisibilityKinds: React.Dispatch<React.SetStateAction<Set<string>>>;
  saveHiddenVisKinds: (hidden: Set<string>) => void;
  allKindDefsIncludingHidden: KindDef[];
  CATEGORY_LABELS: Record<GardenFeatureCategory, string>;

  // Export data
  layoutForContainment: GardenFeatureCollection | null;
  weatherData: WeatherData | null;

  // Map ref (for map view operations)
  mapRef: React.RefObject<L.Map | null>;

  // Utilities
  showToast: (msg: string, type?: "success" | "error" | "warning" | "info") => void;
  userKey: (key: string) => string;

  // GeoJSON import (F4)
  onImportGeoJSON?: (file: File) => void;
}

// ── Component ──

export default function ViewTab(props: ViewTabProps) {
  const {
    viewSubTab,
    setViewSubTab,
    addressQuery,
    setAddressQuery,
    addressResults,
    setAddressResults,
    addressSearching,
    searchAddress,
    searchAddressDebounced,
    goToLocation,
    bookmarks,
    addBookmark,
    updateBookmark,
    removeBookmark,
    anchors,
    setAnchors,
    saveAnchors,
    triAnchorA,
    setTriAnchorA,
    triAnchorB,
    setTriAnchorB,
    triDistA,
    setTriDistA,
    triDistB,
    setTriDistB,
    triResult,
    setTriResult,
    triError,
    setTriError,
    triPlaced,
    setTriPlaced,
    computeTrilateration,
    placeTriangulatedElement,
    showSatellite,
    setShowSatellite,
    showJordart,
    setShowJordart,
    showGrid,
    setShowGrid,
    showSunMap,
    setShowSunMap,
    showMatrikel,
    setShowMatrikel,
    showTerrain,
    setShowTerrain,
    dfUser,
    setDfUser,
    dfPass,
    setDfPass,
    dfTestStatus,
    setDfTestStatus,
    hiddenCategories,
    setHiddenCategories,
    hiddenVisibilityKinds,
    setHiddenVisibilityKinds,
    saveHiddenVisKinds,
    allKindDefsIncludingHidden,
    CATEGORY_LABELS,
    layoutForContainment,
    weatherData,
    mapRef,
    showToast,
    userKey,
  } = props;

  // ── Internalized state ──
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [newBookmarkName, setNewBookmarkName] = useState("");
  const [newBookmarkEmoji, setNewBookmarkEmoji] = useState("📍");
  const [editingAnchorId, setEditingAnchorId] = useState<string | null>(null);
  const [newAnchorName, setNewAnchorName] = useState("");
  const [newAnchorDesc, setNewAnchorDesc] = useState("");
  const [placingAnchor, setPlacingAnchor] = useState(false);
  const [showAnchorHelp, setShowAnchorHelp] = useState(false);

  // ── Internalized anchor CRUD ──
  const addAnchor = useCallback((name: string, lat: number, lng: number, description?: string) => {
    const anchor: AnchorPoint = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name,
      emoji: "📌",
      lat,
      lng,
      description,
    };
    setAnchors((prev) => { const next = [...prev, anchor]; saveAnchors(next); return next; });
  }, [setAnchors, saveAnchors]);

  const removeAnchor = useCallback((id: string) => {
    setAnchors((prev) => { const next = prev.filter((a) => a.id !== id); saveAnchors(next); return next; });
    setTriAnchorA((prev) => (prev === id ? null : prev));
    setTriAnchorB((prev) => (prev === id ? null : prev));
  }, [setAnchors, saveAnchors, setTriAnchorA, setTriAnchorB]);

  const updateAnchor = useCallback((id: string, patch: Partial<AnchorPoint>) => {
    setAnchors((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, ...patch } : a));
      saveAnchors(next);
      return next;
    });
  }, [setAnchors, saveAnchors]);

  // ── Datafordeler test ──
  const testDfCredentials = useCallback(async (user: string, pass: string) => {
    setDfTestStatus("testing");
    try {
      const url = `https://services.datafordeler.dk/MATRIKLEN2/MatGaeldendeOgForeloebigWMS/1.0.0/WMS?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&service=WMS&request=GetCapabilities`;
      const res = await fetch(url);
      const text = await res.text();
      if (text.includes("WMS_Capabilities")) {
        setDfTestStatus("ok");
      } else {
        setDfTestStatus("fail");
      }
    } catch {
      setDfTestStatus("fail");
    }
  }, [setDfTestStatus]);

  const dfReady = dfUser.length > 0 && dfPass.length > 0;

  return (
    <div className="mt-3 space-y-3">
      {/* ── Visning sub-tabs ── */}
      <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm flex-wrap">
        {(["steder", "baggrund", "synlighed", "ankre", "eksport"] as const).map((st) => (
          <button
            key={st}
            type="button"
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
              viewSubTab === st
                ? (st === "ankre" ? "bg-orange-500 text-white shadow-sm" : st === "eksport" ? "bg-emerald-600 text-white shadow-sm" : "bg-accent text-white shadow-sm")
                : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground/80"
            }`}
            onClick={() => setViewSubTab(st)}
          >
            {st === "steder" ? "📍 Steder" : st === "baggrund" ? "🗺️ Baggrund" : st === "synlighed" ? "👁 Synlighed" : st === "ankre" ? "📌 Ankre" : "📤 Eksport"}
            {st === "steder" && bookmarks.length > 0 ? ` ${bookmarks.length}` : ""}
            {st === "ankre" && anchors.length > 0 ? ` ${anchors.length}` : ""}
          </button>
        ))}
      </div>

      {/* ── Sub-tab: Steder ── */}
      {viewSubTab === "steder" ? (
        <div className="space-y-3">
          {/* Address search inline with autocomplete */}
          <div>
            <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">🔍 Adressesøgning</label>
            <div className="relative">
              <div className="flex gap-1">
                <div className="relative flex-1">
                  <input
                    type="text"
                    className="w-full rounded-lg border border-border pl-7 pr-2 py-1.5 text-xs placeholder:text-foreground/30 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/10 transition-colors"
                    placeholder="Adresse, by eller sted…"
                    value={addressQuery}
                    onChange={(e) => { setAddressQuery(e.target.value); searchAddressDebounced(e.target.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter") searchAddress(addressQuery); }}
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-foreground/30">📍</span>
                  {addressSearching && <span className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-[10px]">⏳</span>}
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs text-accent-dark font-medium hover:bg-accent/20 transition-colors"
                  onClick={() => searchAddress(addressQuery)}
                >
                  {addressSearching ? "…" : "Søg"}
                </button>
              </div>
              {addressResults.length > 0 ? (
                <div className="mt-1.5 rounded-lg border border-border bg-white overflow-hidden shadow-sm">
                  {addressResults.map((r, i) => {
                    const parts = r.display_name.split(",");
                    const mainName = parts[0].trim();
                    const subText = parts.slice(1, 3).map(s => s.trim()).join(", ");
                    return (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-border/30 last:border-b-0 hover:bg-accent/5 transition-colors group">
                        <button
                          type="button"
                          className="flex-1 text-left min-w-0"
                          onClick={() => {
                            goToLocation(parseFloat(r.lat), parseFloat(r.lon));
                            setAddressQuery(mainName);
                          }}
                        >
                          <div className="text-xs font-medium text-foreground/80 truncate group-hover:text-accent transition-colors">📍 {mainName}</div>
                          {subText && <div className="text-[10px] text-foreground/40 truncate">{subText}</div>}
                        </button>
                        <div className="shrink-0 flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent-dark font-medium hover:bg-accent/20 transition-colors"
                            onClick={() => {
                              const lat = parseFloat(r.lat);
                              const lon = parseFloat(r.lon);
                              goToLocation(lat, lon);
                              addBookmark(mainName, "📍", { lat, lon, zoom: 18 });
                              setAddressResults([]);
                            }}
                            title={`Gem "${mainName}"`}
                          >
                            + Gem
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 font-medium hover:bg-amber-100 transition-colors"
                            onClick={() => {
                              const lat = parseFloat(r.lat);
                              const lon = parseFloat(r.lon);
                              goToLocation(lat, lon);
                              addBookmark(mainName, "📍", { lat, lon, zoom: 18 }, true);
                              setAddressResults([]);
                              setAddressQuery("");
                            }}
                            title={`Gem "${mainName}" som favorit i top-baren`}
                          >
                            ⭐ Fastgør
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="px-3 py-1.5 bg-foreground/[0.02] border-t border-border/30">
                    <p className="text-[9px] text-foreground/30 text-center">+ Gem = tilføj til steder · ⭐ Fastgør = vis i top-bar</p>
                  </div>
                </div>
              ) : addressQuery.trim().length >= 3 && !addressSearching ? (
                <p className="mt-1.5 text-[10px] text-foreground/30 text-center">Skriv mere eller tryk Søg…</p>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border-light pt-3">
            <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">📍 Gemte steder</label>
            <p className="text-[10px] text-foreground/40 mb-2">Gem din nuværende kortvisning – hop hurtigt mellem områder med forskellige zoom-niveauer.</p>

            {bookmarks.length > 0 ? (
              <div className="space-y-1 mb-2">
                {bookmarks.map((bm) => (
                  <div key={bm.id} className="flex items-center gap-1 rounded-lg border border-border bg-background p-1.5">
                    {editingBookmarkId === bm.id ? (
                      <>
                        <input
                          type="text"
                          className="w-8 text-center text-sm border border-border rounded px-0.5"
                          defaultValue={bm.emoji || "📍"}
                          onBlur={(e) => updateBookmark(bm.id, { emoji: e.target.value || "📍" })}
                        />
                        <input
                          type="text"
                          className="flex-1 text-xs border border-border rounded px-1.5 py-0.5"
                          defaultValue={bm.name}
                          onBlur={(e) => { updateBookmark(bm.id, { name: e.target.value || bm.name }); setEditingBookmarkId(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { updateBookmark(bm.id, { name: (e.target as HTMLInputElement).value || bm.name }); setEditingBookmarkId(null); } }}
                          autoFocus
                        />
                        <span className="text-[9px] text-foreground/40">z{bm.zoom.toFixed(0)}</span>
                        <button type="button" className="text-[10px] text-accent" onClick={() => setEditingBookmarkId(null)} aria-label="Gem bogmærkenavn">✓</button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="flex-1 text-left text-xs hover:text-accent transition-colors truncate"
                          onClick={() => goToLocation(bm.center[0], bm.center[1], bm.zoom)}
                          title={`Zoom ${bm.zoom.toFixed(1)}`}
                        >
                          {bm.emoji || "📍"} {bm.name}
                        </button>
                        <span className="text-[9px] text-foreground/30 shrink-0">z{bm.zoom.toFixed(0)}</span>
                        <button
                          type="button"
                          className={`text-[10px] px-0.5 transition-colors ${bm.favorite ? "text-amber-400 hover:text-amber-500" : "text-foreground/20 hover:text-amber-400"}`}
                          onClick={() => updateBookmark(bm.id, { favorite: !bm.favorite })}
                          title={bm.favorite ? "Fjern fra top-bar" : "Vis i top-bar"}
                        >⭐</button>
                        <button
                          type="button"
                          className="text-[10px] text-foreground/30 hover:text-accent px-0.5"
                          onClick={() => {
                            const map = mapRef.current;
                            if (map) updateBookmark(bm.id, { center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() });
                          }}
                          title="Opdater til nuværende visning"
                        >🔄</button>
                        <button type="button" className="text-[10px] text-foreground/30 hover:text-foreground/60 px-0.5" onClick={() => setEditingBookmarkId(bm.id)} title="Redigér">✏️</button>
                        <button type="button" className="text-[10px] text-foreground/30 hover:text-red-500 px-0.5" onClick={() => removeBookmark(bm.id)} title="Slet">🗑</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-foreground/30 italic mb-2">Ingen gemte steder endnu.</p>
            )}

            <div className="flex gap-1">
              <input
                type="text"
                className="w-8 shrink-0 text-center text-sm border border-border rounded-lg px-0.5 py-1"
                value={newBookmarkEmoji}
                onChange={(e) => setNewBookmarkEmoji(e.target.value)}
                title="Vælg emoji"
              />
              <input
                type="text"
                className="flex-1 rounded-lg border border-border px-2 py-1 text-xs placeholder:text-foreground/30"
                placeholder="Navn, f.eks. 'Køkkenhaven'…"
                value={newBookmarkName}
                onChange={(e) => setNewBookmarkName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newBookmarkName.trim()) {
                    addBookmark(newBookmarkName.trim(), newBookmarkEmoji);
                    setNewBookmarkName("");
                    setNewBookmarkEmoji("📍");
                  }
                }}
              />
              <button
                type="button"
                className="rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent-dark font-medium hover:bg-accent/20 transition-colors disabled:opacity-40"
                disabled={!newBookmarkName.trim()}
                onClick={() => {
                  if (newBookmarkName.trim()) {
                    addBookmark(newBookmarkName.trim(), newBookmarkEmoji);
                    setNewBookmarkName("");
                    setNewBookmarkEmoji("📍");
                  }
                }}
              >
                + Gem
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Sub-tab: Ankre (trilateration) ── */}
      {viewSubTab === "ankre" ? (
        <div className="space-y-3">
          {/* Instruktioner */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 transition-colors"
              onClick={() => setShowAnchorHelp((v) => !v)}
            >
              {showAnchorHelp ? "▾" : "▸"} 📐 Sådan bruger du ankerpunkter
            </button>
            {showAnchorHelp ? (
              <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-orange-700">🎯 Centimeter-præcis markering med målebånd</p>
                <p className="text-[10px] text-foreground/60 leading-relaxed">
                  Standard telefon-GPS giver kun 3–5 meters nøjagtighed. Med ankerpunkt-systemet kan du opnå
                  <strong> 1–5 cm præcision</strong> ved at kombinere faste referenceankre med et målebånd.
                </p>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-orange-700">Trin-for-trin:</p>
                  <ol className="text-[10px] text-foreground/60 space-y-1.5 list-decimal ml-3">
                    <li>
                      <strong>Sæt 2–4 fysiske pæle/pinde i haven</strong> — fx hjørner af hæk, stolper, eller fliser du kan genkende.
                      Markér dem med farvet tape eller et bånd så de er nemme at finde.
                    </li>
                    <li>
                      <strong>Opret ankerpunkter herunder</strong> — gå hen til hver pæl, stå lige ved den,
                      og tryk {"\"+ Opret anker her\""} (bruger din GPS). Giv dem et navn (fx {"\"Rød pæl ved hæk\""}).
                    </li>
                    <li>
                      <strong>Når du vil markere et præcist punkt:</strong> mål afstanden med målebånd
                      fra punktet til anker A og anker B. Indtast de to afstande herunder.
                    </li>
                    <li>
                      Appen beregner positionen via <em>trilateration</em> — den matematiske metode
                      som GPS-satellitter selv bruger. Resultat: centimeter-præcision!
                    </li>
                  </ol>
                </div>
                <div className="border-t border-orange-200 pt-2 mt-2">
                  <p className="text-[10px] font-semibold text-orange-700">💡 Tips til gode resultater:</p>
                  <ul className="text-[10px] text-foreground/60 space-y-1 list-disc ml-3 mt-1">
                    <li>Brug et <strong>5–10 m målebånd</strong> — mål i stram, lige linje langs jorden.</li>
                    <li>Ankre der er <strong>3–15 m fra hinanden</strong> giver bedst resultat.</li>
                    <li>Placér ankre så det punkt du vil markere ligger <strong>mellem dem</strong> (ikke bag ved).</li>
                    <li>GPS-fejlen i ankerpunkterne er OK — den forskyder alt ens, men de relative afstande er præcise.</li>
                    <li>Du kan flytte ankerpunkterne manuelt på kortet for bedre absolut placering.</li>
                  </ul>
                </div>
                <div className="border-t border-orange-200 pt-2 mt-2">
                  <p className="text-[10px] text-foreground/50">
                    🎥 Se hvordan trilateration virker:{" "}
                    <a
                      href="https://www.youtube.com/watch?v=JCTl8kqrKEY"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-600 underline hover:text-orange-700"
                    >
                      YouTube: GPS Trilateration Explained
                    </a>
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Existing anchors */}
          <div>
            <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">📌 Dine ankerpunkter</label>
            {anchors.length === 0 ? (
              <p className="text-[10px] text-foreground/30 italic mb-2">Ingen ankerpunkter endnu. Gå ud i haven, stil dig ved en fast pæl, og opret et anker herunder.</p>
            ) : (
              <div className="space-y-1 mb-2">
                {anchors.map((anc) => (
                  <div key={anc.id} className="flex items-center gap-1 rounded-lg border border-orange-200/60 bg-orange-50/30 p-1.5">
                    {editingAnchorId === anc.id ? (
                      <>
                        <input
                          type="text"
                          className="flex-1 text-xs border border-border rounded px-1.5 py-0.5"
                          defaultValue={anc.name}
                          onBlur={(e) => { updateAnchor(anc.id, { name: e.target.value || anc.name }); setEditingAnchorId(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { updateAnchor(anc.id, { name: (e.target as HTMLInputElement).value || anc.name }); setEditingAnchorId(null); } }}
                          autoFocus
                        />
                        <button type="button" className="text-[10px] text-orange-600" onClick={() => setEditingAnchorId(null)} aria-label="Gem ankernavn">✓</button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="flex-1 text-left text-xs hover:text-orange-600 transition-colors truncate"
                          onClick={() => {
                            const map = mapRef.current;
                            if (map) map.setView([anc.lat, anc.lng], Math.max(map.getZoom(), 19));
                          }}
                          title={`${anc.lat.toFixed(6)}, ${anc.lng.toFixed(6)}${anc.description ? " — " + anc.description : ""}`}
                        >
                          📌 {anc.name}
                        </button>
                        <span className="text-[8px] text-foreground/25 shrink-0 font-mono">{anc.lat.toFixed(5)}</span>
                        <button
                          type="button"
                          className="text-[10px] text-foreground/30 hover:text-orange-600 px-0.5"
                          onClick={() => {
                            navigator.geolocation.getCurrentPosition(
                              (pos) => updateAnchor(anc.id, { lat: pos.coords.latitude, lng: pos.coords.longitude }),
                              () => {},
                              { enableHighAccuracy: true, timeout: 10000 },
                            );
                          }}
                          title="Opdater GPS-position (stå ved ankeret)"
                        >🔄</button>
                        <button type="button" className="text-[10px] text-foreground/30 hover:text-foreground/60 px-0.5" onClick={() => setEditingAnchorId(anc.id)} title="Redigér">✏️</button>
                        <button type="button" className="text-[10px] text-foreground/30 hover:text-red-500 px-0.5" onClick={() => removeAnchor(anc.id)} title="Slet">🗑</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add new anchor */}
            {placingAnchor ? (
              <div className="rounded-lg border border-orange-300 bg-orange-50 p-2 space-y-2">
                <p className="text-[10px] text-orange-700 font-medium">📡 Henter GPS-position…  Stå stille ved pinden/pælen.</p>
                <input
                  type="text"
                  className="w-full text-xs border border-border rounded-lg px-2 py-1 placeholder:text-foreground/30"
                  placeholder="Navn, fx 'Rød pæl ved hæk'…"
                  value={newAnchorName}
                  onChange={(e) => setNewAnchorName(e.target.value)}
                />
                <input
                  type="text"
                  className="w-full text-xs border border-border rounded-lg px-2 py-1 placeholder:text-foreground/30"
                  placeholder="Beskrivelse (valgfrit), fx 'Jernpæl i SV-hjørne'"
                  value={newAnchorDesc}
                  onChange={(e) => setNewAnchorDesc(e.target.value)}
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="flex-1 rounded-lg bg-orange-500 text-white px-2 py-1.5 text-xs font-medium hover:bg-orange-600 transition-colors"
                    onClick={() => {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          addAnchor(
                            newAnchorName.trim() || `Anker ${anchors.length + 1}`,
                            pos.coords.latitude,
                            pos.coords.longitude,
                            newAnchorDesc.trim() || undefined,
                          );
                          setNewAnchorName("");
                          setNewAnchorDesc("");
                          setPlacingAnchor(false);
                        },
                        (err) => {
                          showToast(`GPS-fejl: ${err.message}. Prøv at gå udenfor og tjek at lokationstilladelser er slået til.`, "error");
                        },
                        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
                      );
                    }}
                  >
                    📡 Registrér GPS nu
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-orange-300 px-2 py-1.5 text-xs text-orange-600 font-medium hover:bg-orange-50 transition-colors"
                    onClick={() => {
                      const map = mapRef.current;
                      if (map) {
                        addAnchor(
                          newAnchorName.trim() || `Anker ${anchors.length + 1}`,
                          map.getCenter().lat,
                          map.getCenter().lng,
                          newAnchorDesc.trim() || undefined,
                        );
                      }
                      setNewAnchorName("");
                      setNewAnchorDesc("");
                      setPlacingAnchor(false);
                    }}
                  >
                    🗺️ Brug kortcenter
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-border px-2 py-1.5 text-xs text-foreground/50 hover:bg-foreground/5 transition-colors"
                    onClick={() => { setPlacingAnchor(false); setNewAnchorName(""); setNewAnchorDesc(""); }}
                  >
                    Annullér
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="w-full rounded-lg border border-orange-300/60 bg-orange-50/50 px-3 py-2 text-xs font-medium text-orange-700 hover:bg-orange-100/50 hover:border-orange-400/60 transition-all"
                onClick={() => setPlacingAnchor(true)}
              >
                + Opret ankerpunkt
              </button>
            )}
          </div>

          {/* Trilateration – Præcis markering */}
          {anchors.length >= 2 ? (
            <div className="border-t border-border-light pt-3">
              <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1.5">📐 Præcis markering (trilateration)</label>
              <p className="text-[10px] text-foreground/40 mb-2">Mål afstand fra dit punkt til 2 ankerpunkter med målebånd. Appen beregner positionen.</p>

              <div className="space-y-2">
                {/* Anchor A */}
                <div>
                  <label className="text-[9px] text-foreground/40 uppercase">Anker A</label>
                  <select
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-xs bg-background"
                    value={triAnchorA ?? ""}
                    onChange={(e) => { setTriAnchorA(e.target.value || null); setTriResult(null); setTriError(null); setTriPlaced(false); }}
                  >
                    <option value="">Vælg anker…</option>
                    {anchors.map((a) => (
                      <option key={a.id} value={a.id}>📌 {a.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="w-full mt-1 rounded-lg border border-border px-2 py-1.5 text-xs placeholder:text-foreground/30"
                    placeholder="Afstand i meter, fx 4.35"
                    value={triDistA}
                    onChange={(e) => { setTriDistA(e.target.value); setTriResult(null); setTriError(null); setTriPlaced(false); }}
                  />
                </div>

                {/* Anchor B */}
                <div>
                  <label className="text-[9px] text-foreground/40 uppercase">Anker B</label>
                  <select
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-xs bg-background"
                    value={triAnchorB ?? ""}
                    onChange={(e) => { setTriAnchorB(e.target.value || null); setTriResult(null); setTriError(null); setTriPlaced(false); }}
                  >
                    <option value="">Vælg anker…</option>
                    {anchors.map((a) => (
                      <option key={a.id} value={a.id}>📌 {a.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="w-full mt-1 rounded-lg border border-border px-2 py-1.5 text-xs placeholder:text-foreground/30"
                    placeholder="Afstand i meter, fx 6.12"
                    value={triDistB}
                    onChange={(e) => { setTriDistB(e.target.value); setTriResult(null); setTriError(null); setTriPlaced(false); }}
                  />
                </div>

                {/* Compute button */}
                <button
                  type="button"
                  className="w-full rounded-lg bg-orange-500 text-white px-3 py-2 text-xs font-semibold hover:bg-orange-600 transition-colors disabled:opacity-40"
                  disabled={!triAnchorA || !triAnchorB || !triDistA || !triDistB}
                  onClick={computeTrilateration}
                >
                  📐 Beregn position
                </button>

                {triError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                    <p className="text-[10px] text-red-600">⚠️ {triError}</p>
                  </div>
                ) : null}

                {triResult ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-green-700">✅ Position beregnet!</p>
                    <p className="text-[10px] text-foreground/60 font-mono">
                      {triResult.lat.toFixed(7)}, {triResult.lng.toFixed(7)}
                    </p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="flex-1 rounded-lg bg-green-600 text-white px-2 py-1.5 text-xs font-medium hover:bg-green-700 transition-colors"
                        onClick={() => {
                          const map = mapRef.current;
                          if (map) map.setView([triResult.lat, triResult.lng], Math.max(map.getZoom(), 20));
                        }}
                      >
                        🗺️ Vis på kort
                      </button>
                      {!triPlaced ? (
                        <button
                          type="button"
                          className="flex-1 rounded-lg bg-accent text-white px-2 py-1.5 text-xs font-medium hover:bg-accent/90 transition-colors"
                          onClick={placeTriangulatedElement}
                        >
                          📌 Placér element
                        </button>
                      ) : (
                        <span className="flex-1 rounded-lg bg-green-100 text-green-700 px-2 py-1.5 text-xs font-medium text-center">✅ Placeret!</span>
                      )}
                    </div>
                    <p className="text-[9px] text-foreground/30 italic">Du kan bagefter ændre type, navn og ikon i Indhold-panelet.</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : anchors.length > 0 ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50/30 p-2">
              <p className="text-[10px] text-orange-600">Du har brug for mindst 2 ankerpunkter for at bruge trilateration. Opret ét mere herover.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Sub-tab: Baggrund ── */}
      {viewSubTab === "baggrund" ? (
      <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-2">Baggrundskort</label>
        <div className="space-y-1.5">
        <button
          type="button"
          className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
            showSatellite
              ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
              : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
          }`}
          onClick={() => setShowSatellite((v) => !v)}
        >
          🛰️ Satellit{showSatellite ? " (aktiv)" : ""}
        </button>
        <button
          type="button"
          className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
            showMatrikel && dfReady
              ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
              : showMatrikel && !dfReady
              ? "border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-900/20"
              : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
          }`}
          onClick={() => setShowMatrikel((v) => !v)}
        >
          📐 Matrikel{showMatrikel && dfReady ? " (aktiv)" : showMatrikel ? " (mangler login)" : ""}
        </button>
        <button
          type="button"
          className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
            showGrid
              ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
              : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
          }`}
          onClick={() => setShowGrid((v) => !v)}
        >
          📏 Gitter{showGrid ? " (aktiv)" : ""}
        </button>
        <button
          type="button"
          className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
            showSunMap
              ? "border-amber-400 bg-amber-50 text-amber-800 shadow-sm"
              : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
          }`}
          onClick={() => setShowSunMap((v) => !v)}
        >
          ☀️ Solkort{showSunMap ? " (aktiv)" : ""}
        </button>
        {showSunMap ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-amber-700">Solkort – farveforklaring</p>
            <div className="flex gap-1 items-center">
              <div className="w-4 h-3 rounded-sm" style={{ background: sunHoursToColor(15, 0.7) }} />
              <span className="text-[9px] text-foreground/60">Fuld sol (15t)</span>
              <div className="w-4 h-3 rounded-sm ml-2" style={{ background: sunHoursToColor(10, 0.7) }} />
              <span className="text-[9px] text-foreground/60">Delvis sol</span>
              <div className="w-4 h-3 rounded-sm ml-2" style={{ background: sunHoursToColor(4, 0.7) }} />
              <span className="text-[9px] text-foreground/60">Skygge</span>
              <div className="w-4 h-3 rounded-sm ml-2" style={{ background: sunHoursToColor(0, 0.7) }} />
              <span className="text-[9px] text-foreground/60">Dyb</span>
            </div>
            <p className="text-[9px] text-foreground/40 leading-tight">
              Beregnet ud fra placerede træers og buskenes højde, solvinkel ved 56°N og sæsongennemsnit (april–september).
            </p>
          </div>
        ) : null}
        {showMatrikel ? (
          <div className="mt-1.5 space-y-1">
            {!dfReady ? (
              <p className="text-[10px] text-amber-600 leading-tight mb-1">
                Kræver gratis Datafordeler-login. Opret dig på{" "}
                <a href="https://selfservice.datafordeler.dk" target="_blank" rel="noopener noreferrer" className="underline">selfservice.datafordeler.dk</a>,
                opret en <strong>tjenestebruger</strong> og giv den adgang til tjenesten <strong>MatGaeldendeOgForeloebigWMS</strong> under MATRIKLEN2.
              </p>
            ) : null}
            <input
              type="text"
              placeholder="Tjenestebruger (brugernavn)"
              value={dfUser}
              onChange={(e) => {
                const v = e.target.value;
                setDfUser(v);
                setDfTestStatus("idle");
                window.localStorage.setItem(userKey("gardenos:df:user"), v);
              }}
              className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-[11px] text-foreground/80 placeholder:text-foreground/30 focus:outline-none focus:border-foreground/40"
            />
            <input
              type="password"
              placeholder="Password"
              value={dfPass}
              onChange={(e) => {
                const v = e.target.value;
                setDfPass(v);
                setDfTestStatus("idle");
                window.localStorage.setItem(userKey("gardenos:df:pass"), v);
              }}
              className="w-full rounded border border-foreground/20 bg-background px-2 py-1 text-[11px] text-foreground/80 placeholder:text-foreground/30 focus:outline-none focus:border-foreground/40"
            />
            {dfReady ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={dfTestStatus === "testing"}
                  className="rounded border border-foreground/20 bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-foreground/70 hover:bg-foreground/10 disabled:opacity-50"
                  onClick={() => testDfCredentials(dfUser, dfPass)}
                >
                  {dfTestStatus === "testing" ? "Tester…" : "Test forbindelse"}
                </button>
                {dfTestStatus === "ok" ? (
                  <span className="text-[10px] text-green-600 font-medium">✓ Forbindelse OK</span>
                ) : dfTestStatus === "fail" ? (
                  <span className="text-[10px] text-red-500 font-medium">✗ Afvist — tjek brugernavn/password</span>
                ) : null}
              </div>
            ) : null}
            {dfTestStatus === "fail" ? (
              <div className="rounded border border-amber-400/30 bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 mt-0.5">
                <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight font-medium mb-0.5">Mulige årsager:</p>
                <ul className="text-[10px] text-amber-600 dark:text-amber-400/80 leading-tight list-disc ml-3 space-y-0.5">
                  <li>Forkert brugernavn eller password</li>
                  <li>Tjenestebrugeren mangler adgang til tjenesten <strong>MatGaeldendeOgForeloebigWMS</strong></li>
                  <li>Gå til <a href="https://selfservice.datafordeler.dk" target="_blank" rel="noopener noreferrer" className="underline">selfservice.datafordeler.dk</a> → Tjenestebrugere → vælg din bruger → Tjenester → tilføj <strong>MatGaeldendeOgForeloebigWMS</strong></li>
                </ul>
                <button
                  type="button"
                  className="mt-1.5 rounded border border-foreground/20 bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-foreground/70 hover:bg-foreground/10"
                  onClick={() => {
                    const demoUser = process.env.NEXT_PUBLIC_DATAFORDELER_DEMO_USER || "";
                    const demoPass = process.env.NEXT_PUBLIC_DATAFORDELER_DEMO_PASS || "";
                    if (!demoUser || !demoPass) {
                      showToast("Demo-credentials er ikke konfigureret. Kontakt admin.", "error");
                      return;
                    }
                    setDfUser(demoUser);
                    setDfPass(demoPass);
                    setDfTestStatus("idle");
                    window.localStorage.setItem(userKey("gardenos:df:user"), demoUser);
                    window.localStorage.setItem(userKey("gardenos:df:pass"), demoPass);
                  }}
                >
                  Prøv med demo-credentials i stedet
                </button>
              </div>
            ) : null}
            {dfReady && dfTestStatus === "ok" ? (
              <p className="text-[10px] text-green-600">Matrikelskel vises på kortet (zoom ind for detaljer).</p>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
            showJordart
              ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
              : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
          }`}
          onClick={() => setShowJordart((v) => !v)}
        >
          🌱 Jordart{showJordart ? " (aktiv)" : ""}
        </button>
        {showJordart ? (
          <p className="text-[10px] text-muted leading-tight mt-0.5 ml-1">
            GEUS Jordartskort 1:25.000 — viser overfladegeologi / jordtyper. Zoom ind for detaljer.
          </p>
        ) : null}
        <button
          type="button"
          className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
            showTerrain
              ? "border-accent/40 bg-accent-light text-accent-dark shadow-sm"
              : "border-border bg-background text-foreground/60 hover:bg-foreground/5 hover:shadow-sm"
          }`}
          onClick={() => setShowTerrain((v) => !v)}
        >
          ⛰️ Terrænrelief{showTerrain ? " (aktiv)" : ""}
        </button>
        {showTerrain ? (
          <p className="text-[10px] text-muted leading-tight mt-0.5 ml-1">
            Danmarks Højdemodel — skyggekort der viser terrænets form og hældning.
          </p>
        ) : null}
        </div>
        <p className="text-[10px] text-muted leading-tight mt-2">
          ℹ️ Ledningsdata (el, vand, gas, kloak) er ikke offentligt tilgængeligt som kort. Brug <a href="https://ler.dk" target="_blank" rel="noopener noreferrer" className="underline">ler.dk</a> til ledningsoplysninger.
        </p>
      </div>
      </div>
      ) : null}

      {/* ── Sub-tab: Synlighed ── */}
      {viewSubTab === "synlighed" ? (
      <div className="space-y-3">
      <div>
      <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-2">Synlighed på kort</label>
      {(["area", "seedbed", "row", "container", "element", "condition"] as const).map((cat) => {
        const isCatHidden = hiddenCategories.has(cat);
        const kindsInCat = allKindDefsIncludingHidden.filter((d) => d.category === cat);
        const allKindsHidden = kindsInCat.length > 0 && kindsInCat.every((d) => hiddenVisibilityKinds.has(d.kind.toLowerCase()));
        return (
          <div key={cat}>
            <button
              type="button"
              className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                isCatHidden
                  ? "border-border-light bg-background text-foreground/30 line-through"
                  : "border-border bg-accent-light/50 text-foreground/80"
              }`}
              onClick={() => {
                setHiddenCategories((prev) => {
                  const next = new Set(prev);
                  if (next.has(cat)) next.delete(cat);
                  else next.add(cat);
                  return next;
                });
              }}
            >
              {CATEGORY_LABELS[cat]}
            </button>
            {!isCatHidden && kindsInCat.length > 0 ? (
              <div className="mt-1 ml-2 flex flex-wrap gap-1">
                {kindsInCat.length > 1 ? (
                  <button
                    type="button"
                    className="rounded border border-foreground/15 px-1.5 py-0.5 text-[10px] text-foreground/50 hover:bg-foreground/5"
                    onClick={() => {
                      setHiddenVisibilityKinds((prev) => {
                        const next = new Set(prev);
                        if (allKindsHidden) {
                          kindsInCat.forEach((d) => next.delete(d.kind.toLowerCase()));
                        } else {
                          kindsInCat.forEach((d) => next.add(d.kind.toLowerCase()));
                        }
                        saveHiddenVisKinds(next);
                        return next;
                      });
                    }}
                  >
                    {allKindsHidden ? "Vis alle" : "Skjul alle"}
                  </button>
                ) : null}
                {kindsInCat.map((def) => {
                  const isKindHidden = hiddenVisibilityKinds.has(def.kind.toLowerCase());
                  return (
                    <button
                      key={def.kind}
                      type="button"
                      className={`rounded border px-1.5 py-0.5 text-[10px] ${
                        isKindHidden
                          ? "border-foreground/10 bg-background text-foreground/30 line-through"
                          : "border-foreground/20 bg-foreground/5 text-foreground/70"
                      }`}
                      onClick={() => {
                        setHiddenVisibilityKinds((prev) => {
                          const next = new Set(prev);
                          if (next.has(def.kind.toLowerCase())) next.delete(def.kind.toLowerCase());
                          else next.add(def.kind.toLowerCase());
                          saveHiddenVisKinds(next);
                          return next;
                        });
                      }}
                    >
                      {def.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
      </div>
      </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── EKSPORT SUB-TAB ──                                     */}
      {/* ══════════════════════════════════════════════════════════ */}
      {viewSubTab === "eksport" ? (() => {
        // Build plant rows for CSV / print
        const plantRows: ExportPlantRow[] = [];
        if (layoutForContainment?.features?.length) {
          for (const f of layoutForContainment.features) {
            const props = (f as GardenFeature).properties;
            const bedName = props?.name || props?.kind || "Ukendt bed";
            const fId = props?.gardenosId;
            if (!fId) continue;
            const instances = getInstancesForFeature(fId);
            for (const inst of instances) {
              const sp = getPlantById(inst.speciesId);
              const c: number = inst.count != null ? inst.count : 1;
              const s: string = inst.season != null ? String(inst.season) : "";
              plantRows.push({
                bed: bedName,
                species: sp?.name || inst.speciesId,
                variety: inst.varietyName || "",
                count: c,
                plantedAt: inst.plantedAt || "",
                season: s,
                notes: inst.notes || "",
              });
            }
          }
        }
        const featureCount = layoutForContainment?.features?.length || 0;
        const uniqueSpecies = new Set(plantRows.map((r) => r.species)).size;

        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground/80 mb-1">📤 Eksportér din have</h3>
              <p className="text-[10px] text-foreground/50 leading-relaxed">
                Download din haveplan som GeoJSON, CSV-planteoversigt, eller print en PDF-oversigt.
              </p>
            </div>

            {/* Stats summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border bg-foreground/[0.02] p-2 text-center">
                <div className="text-lg font-bold text-accent">{featureCount}</div>
                <div className="text-[9px] text-foreground/40 uppercase tracking-wide">Elementer</div>
              </div>
              <div className="rounded-lg border border-border bg-foreground/[0.02] p-2 text-center">
                <div className="text-lg font-bold text-emerald-600">{plantRows.length}</div>
                <div className="text-[9px] text-foreground/40 uppercase tracking-wide">Plantninger</div>
              </div>
              <div className="rounded-lg border border-border bg-foreground/[0.02] p-2 text-center">
                <div className="text-lg font-bold text-blue-600">{uniqueSpecies}</div>
                <div className="text-[9px] text-foreground/40 uppercase tracking-wide">Arter</div>
              </div>
            </div>

            {/* Export buttons */}
            <div className="space-y-2">
              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 hover:bg-emerald-100 hover:border-emerald-300 transition-all group"
                onClick={() => { if (layoutForContainment) exportGeoJSON(layoutForContainment, "gardenos-have"); }}
              >
                <span className="text-xl">🗺️</span>
                <div className="flex-1 text-left">
                  <div className="text-xs font-semibold text-emerald-800">GeoJSON</div>
                  <div className="text-[10px] text-emerald-600/70">Komplet haveplan med alle elementer og geometrier</div>
                </div>
                <span className="text-emerald-400 group-hover:text-emerald-600 transition-colors text-xs">↓</span>
              </button>

              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 hover:bg-blue-100 hover:border-blue-300 transition-all group"
                onClick={() => exportPlantCSV(plantRows, "gardenos-have")}
                disabled={plantRows.length === 0}
              >
                <span className="text-xl">📊</span>
                <div className="flex-1 text-left">
                  <div className={`text-xs font-semibold ${plantRows.length > 0 ? "text-blue-800" : "text-foreground/30"}`}>CSV Planteoversigt</div>
                  <div className={`text-[10px] ${plantRows.length > 0 ? "text-blue-600/70" : "text-foreground/25"}`}>
                    {plantRows.length > 0 ? `${plantRows.length} plantninger · åbn i Excel / Google Sheets` : "Ingen planter registreret"}
                  </div>
                </div>
                <span className="text-blue-400 group-hover:text-blue-600 transition-colors text-xs">↓</span>
              </button>

              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 hover:bg-purple-100 hover:border-purple-300 transition-all group"
                onClick={() => {
                  const weatherStr = weatherData
                    ? `Temperatur: ${weatherData.current.temperature}°C, Luftfugtighed: ${weatherData.current.humidity}%, Nedbør: ${weatherData.current.precipitation}mm`
                    : undefined;
                  printGardenSummary({
                    gardenName: "Min Have – GardenOS",
                    featureCount,
                    plantRows,
                    weatherSummary: weatherStr,
                  });
                }}
              >
                <span className="text-xl">🖨️</span>
                <div className="flex-1 text-left">
                  <div className="text-xs font-semibold text-purple-800">Print / PDF</div>
                  <div className="text-[10px] text-purple-600/70">Haveoversigt klar til print – åbner i nyt vindue</div>
                </div>
                <span className="text-purple-400 group-hover:text-purple-600 transition-colors text-xs">→</span>
              </button>

              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 hover:bg-amber-100 hover:border-amber-300 transition-all group"
                onClick={async () => {
                  if (!layoutForContainment) return;
                  const ok = await copyShareLink(layoutForContainment);
                  if (ok) {
                    showToast("🔗 Delelink kopieret til udklipsholder!", "success");
                  } else {
                    showToast("❌ Kunne ikke kopiere link", "error");
                  }
                }}
              >
                <span className="text-xl">🔗</span>
                <div className="flex-1 text-left">
                  <div className="text-xs font-semibold text-amber-800">Del haveplan</div>
                  <div className="text-[10px] text-amber-600/70">Kopiér delelink til udklipsholder</div>
                </div>
                <span className="text-amber-400 group-hover:text-amber-600 transition-colors text-xs">📋</span>
              </button>
            </div>

            <p className="text-[9px] text-foreground/30 text-center leading-relaxed">
              GeoJSON kan importeres i QGIS, Google Earth og andre GIS-værktøjer.<br />
              CSV-filen bruger semikolon (;) som separator og UTF-8 med BOM.
            </p>

            {/* F4: GeoJSON import */}
            {props.onImportGeoJSON && (
              <div className="pt-2 border-t border-border">
                <h3 className="text-sm font-bold text-foreground/80 mb-1">📥 Importér GeoJSON</h3>
                <p className="text-[10px] text-foreground/50 leading-relaxed mb-2">
                  Importér en GeoJSON-fil og flet elementerne ind i din eksisterende have.
                </p>
                <label
                  className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent/40 bg-accent/5 px-3 py-3 cursor-pointer hover:bg-accent/10 hover:border-accent/60 transition-all"
                >
                  <span className="text-lg">📂</span>
                  <span className="text-xs font-medium text-accent">Vælg .geojson fil…</span>
                  <input
                    type="file"
                    accept=".geojson,.json,application/geo+json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) props.onImportGeoJSON!(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        );
      })() : null}
    </div>
  );
}
