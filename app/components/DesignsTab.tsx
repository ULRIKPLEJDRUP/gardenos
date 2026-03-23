"use client";
import React, { useState, memo } from "react";
import {
  fetchDesigns,
  createDesign,
  updateDesign,
  deleteDesign,
  fetchVersions,
  restoreVersion,
  type SavedDesign,
  type DesignVersion,
} from "../lib/designStore";

/* ─────────── Props ─────────── */

export interface DesignsTabProps {
  /* Shared design state (kept in parent for toolbar quick-save) */
  savedDesigns: SavedDesign[];
  setSavedDesigns: React.Dispatch<React.SetStateAction<SavedDesign[]>>;
  designsLoading: boolean;
  setDesignsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  designError: string | null;
  setDesignError: React.Dispatch<React.SetStateAction<string | null>>;
  designSaving: boolean;
  setDesignSaving: React.Dispatch<React.SetStateAction<boolean>>;
  designLoadedFlash: string | false;
  setDesignLoadedFlash: React.Dispatch<React.SetStateAction<string | false>>;
  userMaxDesigns: number;
  setUserMaxDesigns: React.Dispatch<React.SetStateAction<number>>;
  activeDesignId: string | null;
  setActiveDesignId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveDesignName: React.Dispatch<React.SetStateAction<string | null>>;

  /** Serialize current map layout + plants. Returns null if featureGroup unavailable. */
  getCurrentLayoutAndPlants: () => { layoutJson: string; plantsJson: string } | null;
  /** Apply a saved design's layout + plants to the map. May throw on failure. */
  applyDesignToMap: (layoutJson: string, plantsJson: string) => void;
}

/* ─────────── Component ─────────── */

function DesignsTabInner({
  savedDesigns,
  setSavedDesigns,
  designsLoading,
  setDesignsLoading,
  designError,
  setDesignError,
  designSaving,
  setDesignSaving,
  designLoadedFlash,
  setDesignLoadedFlash,
  userMaxDesigns,
  setUserMaxDesigns,
  activeDesignId,
  setActiveDesignId,
  setActiveDesignName,
  getCurrentLayoutAndPlants,
  applyDesignToMap,
}: DesignsTabProps) {
  // ── Internal state (moved from GardenMapClient IIFE) ──
  const [designNewName, setDesignNewName] = useState("");
  const [designConfirmDelete, setDesignConfirmDelete] = useState<string | null>(null);
  const [designRenamingId, setDesignRenamingId] = useState<string | null>(null);
  const [designRenameText, setDesignRenameText] = useState("");

  // Version history
  const [versionHistoryId, setVersionHistoryId] = useState<string | null>(null);
  const [versionList, setVersionList] = useState<DesignVersion[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionRestoring, setVersionRestoring] = useState<string | null>(null);

  // ── Actions ──

  const loadDesigns = async () => {
    setDesignsLoading(true);
    setDesignError(null);
    try {
      const resp = await fetchDesigns();
      setSavedDesigns(resp.designs);
      setUserMaxDesigns(resp.maxDesigns);
    } catch (e: unknown) {
      setDesignError(e instanceof Error ? e.message : "Fejl ved hentning");
    } finally {
      setDesignsLoading(false);
    }
  };

  const handleSave = async () => {
    const trimmed = designNewName.trim();
    if (!trimmed) return;
    if (savedDesigns.length >= userMaxDesigns) {
      setDesignError(`Maks ${userMaxDesigns} designs. Slet et først.`);
      return;
    }
    setDesignSaving(true);
    setDesignError(null);
    try {
      const data = getCurrentLayoutAndPlants();
      if (!data) return;
      const d = await createDesign({ name: trimmed, layout: data.layoutJson, plants: data.plantsJson });
      setSavedDesigns((prev) => [d, ...prev]);
      setDesignNewName("");
      setActiveDesignId(d.id);
      setActiveDesignName(d.name);
      setDesignLoadedFlash("Gemt!");
      setTimeout(() => setDesignLoadedFlash(false), 2000);
    } catch (e: unknown) {
      setDesignError(e instanceof Error ? e.message : "Fejl");
    } finally {
      setDesignSaving(false);
    }
  };

  const handleOverwrite = async (id: string) => {
    setDesignSaving(true);
    setDesignError(null);
    try {
      const data = getCurrentLayoutAndPlants();
      if (!data) return;
      const d = await updateDesign(id, { layout: data.layoutJson, plants: data.plantsJson });
      setSavedDesigns((prev) => prev.map((x) => (x.id === id ? d : x)));
      setDesignLoadedFlash("Opdateret!");
      setTimeout(() => setDesignLoadedFlash(false), 2000);
    } catch (e: unknown) {
      setDesignError(e instanceof Error ? e.message : "Fejl");
    } finally {
      setDesignSaving(false);
    }
  };

  const handleLoad = (design: SavedDesign) => {
    try {
      applyDesignToMap(design.layout, design.plants);
      setActiveDesignId(design.id);
      setActiveDesignName(design.name);
      setDesignLoadedFlash(`"${design.name}" indlæst`);
      setTimeout(() => setDesignLoadedFlash(false), 2500);
    } catch {
      setDesignError("Kunne ikke indlæse design");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDesign(id);
      setSavedDesigns((prev) => prev.filter((d) => d.id !== id));
      setDesignConfirmDelete(null);
      if (id === activeDesignId) {
        setActiveDesignId(null);
        setActiveDesignName(null);
      }
    } catch (e: unknown) {
      setDesignError(e instanceof Error ? e.message : "Fejl");
    }
  };

  const handleRename = async (id: string) => {
    const trimmed = designRenameText.trim();
    if (!trimmed) return;
    try {
      const d = await updateDesign(id, { name: trimmed });
      setSavedDesigns((prev) => prev.map((x) => (x.id === id ? d : x)));
      setDesignRenamingId(null);
      if (id === activeDesignId) setActiveDesignName(trimmed);
    } catch (e: unknown) {
      setDesignError(e instanceof Error ? e.message : "Fejl");
    }
  };

  // ── Render ──

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground/80">💾 Gemte Designs</h3>
        <button
          type="button"
          className="text-[10px] text-accent hover:text-accent/80 font-medium"
          onClick={loadDesigns}
          disabled={designsLoading}
        >
          {designsLoading ? "Henter…" : "↻ Opdater"}
        </button>
      </div>

      <p className="text-[11px] text-foreground/50">
        Gem dit nuværende havedesign og eksperimenter frit. Du kan gemme op til {userMaxDesigns} designs.
      </p>

      {/* Flash message */}
      {designLoadedFlash && (
        <div className="rounded-lg bg-green-100 border border-green-200 px-3 py-1.5 text-[11px] text-green-700 font-medium text-center animate-pulse">
          ✓ {designLoadedFlash}
        </div>
      )}

      {/* Error */}
      {designError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-[11px] text-red-600">
          {designError}
          <button type="button" className="ml-2 underline" onClick={() => setDesignError(null)}>Luk</button>
        </div>
      )}

      {/* Save current as new */}
      <div className="rounded-lg border border-border bg-background p-3 space-y-2">
        <label className="block text-[11px] font-semibold text-foreground/60 uppercase tracking-wide">
          Gem nuværende som nyt design
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={`Navngiv design (f.eks. "Forår 2026")`}
            className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs bg-background focus:border-accent focus:outline-none"
            value={designNewName}
            onChange={(e) => setDesignNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            maxLength={40}
          />
          <button
            type="button"
            className="rounded-md bg-accent text-white px-3 py-1.5 text-xs font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            onClick={handleSave}
            disabled={designSaving || !designNewName.trim() || savedDesigns.length >= userMaxDesigns}
          >
            {designSaving ? "…" : "💾 Gem"}
          </button>
        </div>
        <p className="text-[10px] text-foreground/40">
          {savedDesigns.length}/{userMaxDesigns} brugt
        </p>
      </div>

      {/* List of saved designs */}
      {savedDesigns.length === 0 && !designsLoading ? (
        <div className="text-center py-6 text-foreground/40 text-xs">
          <div className="text-2xl mb-2">🗂️</div>
          Ingen gemte designs endnu.
          <br />
          <button type="button" className="text-accent underline mt-1" onClick={loadDesigns}>Hent fra server</button>
        </div>
      ) : (
        <div className="space-y-2">
          {savedDesigns.map((design) => (
            <div
              key={design.id}
              className={`rounded-lg border p-3 transition-colors ${
                design.id === activeDesignId
                  ? "border-accent bg-accent/5 shadow-sm"
                  : "border-border bg-background hover:border-accent/30"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                {designRenamingId === design.id ? (
                  <div className="flex gap-1 flex-1 mr-2">
                    <input
                      type="text"
                      className="flex-1 rounded border border-accent/40 px-1.5 py-0.5 text-xs bg-background focus:outline-none"
                      value={designRenameText}
                      onChange={(e) => setDesignRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(design.id);
                        if (e.key === "Escape") setDesignRenamingId(null);
                      }}
                      autoFocus
                      maxLength={40}
                    />
                    <button type="button" className="text-[10px] text-accent font-medium" onClick={() => handleRename(design.id)} aria-label="Gem designnavn">✓</button>
                    <button type="button" className="text-[10px] text-foreground/40" onClick={() => setDesignRenamingId(null)} aria-label="Annullér omdøbning">✕</button>
                  </div>
                ) : (
                  <span className="text-sm font-semibold text-foreground/80 truncate">{design.name}</span>
                )}
                <div className="text-right ml-2 shrink-0">
                  <div className="text-[10px] text-foreground/35 whitespace-nowrap">
                    {new Date(design.updatedAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}{" "}
                    {new Date(design.updatedAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {design.createdAt !== design.updatedAt && (
                    <div className="text-[9px] text-foreground/25 whitespace-nowrap">
                      oprettet {new Date(design.createdAt).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}{" "}
                      {new Date(design.createdAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-1.5 mt-2">
                <button
                  type="button"
                  className="flex-1 rounded-md bg-accent/10 text-accent px-2 py-1.5 text-[11px] font-medium hover:bg-accent/20 transition-colors"
                  onClick={() => handleLoad(design)}
                >
                  📂 Indlæs
                </button>
                <button
                  type="button"
                  className="rounded-md bg-foreground/5 text-foreground/60 px-2 py-1.5 text-[11px] hover:bg-foreground/10 transition-colors"
                  onClick={() => handleOverwrite(design.id)}
                  title="Overskriv med nuværende kort"
                >
                  ⬆️
                </button>
                <button
                  type="button"
                  className="rounded-md bg-foreground/5 text-foreground/60 px-2 py-1.5 text-[11px] hover:bg-foreground/10 transition-colors"
                  onClick={() => { setDesignRenamingId(design.id); setDesignRenameText(design.name); }}
                  title="Omdøb"
                >
                  ✏️
                </button>
                {designConfirmDelete === design.id ? (
                  <div className="flex gap-1 items-center">
                    <button
                      type="button"
                      className="rounded-md bg-red-500 text-white px-2 py-1 text-[10px] font-medium hover:bg-red-600"
                      onClick={() => handleDelete(design.id)}
                    >
                      Slet!
                    </button>
                    <button
                      type="button"
                      className="text-[10px] text-foreground/40"
                      onClick={() => setDesignConfirmDelete(null)}
                    >
                      Nej
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="rounded-md bg-red-50 text-red-400 px-2 py-1.5 text-[11px] hover:bg-red-100 transition-colors"
                    onClick={() => setDesignConfirmDelete(design.id)}
                    title="Slet design"
                  >
                    🗑
                  </button>
                )}
              </div>

              {/* ── Version History Toggle ── */}
              <div className="mt-2">
                <button
                  type="button"
                  className="text-[10px] text-foreground/40 hover:text-accent transition-colors flex items-center gap-1"
                  onClick={async () => {
                    if (versionHistoryId === design.id) {
                      setVersionHistoryId(null);
                      setVersionList([]);
                      return;
                    }
                    setVersionHistoryId(design.id);
                    setVersionLoading(true);
                    try {
                      const versions = await fetchVersions(design.id);
                      setVersionList(versions);
                    } catch {
                      setVersionList([]);
                    } finally {
                      setVersionLoading(false);
                    }
                  }}
                >
                  <span style={{ display: "inline-block", transform: versionHistoryId === design.id ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}>▶</span>
                  🕓 Historik
                </button>

                {versionHistoryId === design.id && (
                  <div className="mt-1.5 ml-2 border-l-2 border-foreground/10 pl-2 space-y-1">
                    {versionLoading ? (
                      <p className="text-[10px] text-foreground/40 animate-pulse">Henter versioner…</p>
                    ) : versionList.length === 0 ? (
                      <p className="text-[10px] text-foreground/30 italic">Ingen tidligere versioner endnu</p>
                    ) : (
                      versionList.map((ver) => (
                        <div key={ver.id} className="flex items-center justify-between gap-2 rounded border border-foreground/5 bg-foreground/[0.02] px-2 py-1">
                          <span className="text-[10px] text-foreground/50">
                            {new Date(ver.savedAt).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}{" "}
                            {new Date(ver.savedAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                          <button
                            type="button"
                            className="text-[10px] text-accent font-medium hover:text-accent/80 disabled:opacity-40 transition-colors whitespace-nowrap"
                            disabled={versionRestoring === ver.id}
                            onClick={async () => {
                              setVersionRestoring(ver.id);
                              try {
                                const restored = await restoreVersion(ver.id);
                                // Update design in list
                                setSavedDesigns((prev) => prev.map((x) => (x.id === design.id ? { ...x, layout: restored.layout, plants: restored.plants, updatedAt: restored.updatedAt } : x)));
                                // If this is the active design, reload it into the map
                                if (design.id === activeDesignId) {
                                  handleLoad({ ...design, layout: restored.layout, plants: restored.plants, updatedAt: restored.updatedAt });
                                }
                                setDesignLoadedFlash("Version gendannet!");
                                setTimeout(() => setDesignLoadedFlash(false), 2500);
                                // Refresh version list
                                const versions = await fetchVersions(design.id);
                                setVersionList(versions);
                              } catch {
                                setDesignError("Kunne ikke gendanne version");
                              } finally {
                                setVersionRestoring(null);
                              }
                            }}
                          >
                            {versionRestoring === ver.id ? "…" : "↩ Gendan"}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(DesignsTabInner);
