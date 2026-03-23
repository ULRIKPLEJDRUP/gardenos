"use client";
// ---------------------------------------------------------------------------
// GardenOS – Design Lab Component
// ---------------------------------------------------------------------------
// A detailed bed/area editor that opens as a fullscreen overlay.
// Uses the same design tokens as the rest of the app (--accent, --border, etc.)
// ---------------------------------------------------------------------------

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { BedLayout, BedElement, BedLocalCoord, LabTool, PlantShapeType, GrowthPhase } from "../lib/bedLayoutTypes";
import { geoPolygonToBedLayout, pointInBedOutline, snapToGrid } from "../lib/bedGeometry";
import { getBedLayout, createBedLayout, saveBedLayout, removeElement, addElement, updateElement } from "../lib/bedLayoutStore";
import {
  MONTH_NAMES_DA, MONTH_ICONS, PHASE_LABELS_DA,
  getPhaseScale, getPhase, getSeasonColors, GROUND_COLORS,
  guessPlantShape, lightenColor,
  type PlantCalendar,
} from "../lib/seasonColors";
import type { PhaseColors } from "../lib/bedLayoutTypes";
import { getAllPlants, getPlantById } from "../lib/plantStore";
import type { PlantSpecies } from "../lib/plantTypes";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type DesignLabProps = {
  featureId: string;
  featureName: string;
  /** GeoJSON outer ring [lng,lat][] */
  ring: [number, number][];
  /** Plant instances in this bed (from main map) */
  plants: {
    id: string;
    speciesId: string;
    name: string;
    icon: string;
    count: number;
    spacingCm: number;
    spreadCm: number;
    rowSpacingCm: number;
    category?: string;
    matureHeightM?: number;
    forestGardenLayer?: string;
    sowMonth?: number;
    growStart?: number;
    flowerMonth?: number;
    harvestStart?: number;
    harvestEnd?: number;
    dieMonth?: number;
  }[];
  onClose: () => void;
  /** Callback when layout changes (for syncing back to map) */
  onLayoutChange?: (layout: BedLayout) => void;
};

// ---------------------------------------------------------------------------
// SVG Plant Shape Renderer
// ---------------------------------------------------------------------------

function PlantShape({
  shape, x, y, phase, scale, colors, icon, viewMode, spreadCm,
  isSelected, onClick, onPointerDown, opacity, minRadius,
}: {
  shape: PlantShapeType;
  x: number; y: number;
  phase: GrowthPhase; scale: number; colors: PhaseColors;
  icon: string; viewMode: "color" | "icon" | "both";
  spreadCm: number; isSelected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  opacity?: number;
  minRadius?: number;
}) {
  const rawR = (spreadCm / 2) * scale;
  const r = Math.max(rawR, minRadius ?? 3);

  if (phase === "dormant") {
    const dormantR = Math.max(r * 0.4, minRadius ? minRadius * 0.5 : 1.5);
    const dormantFontSize = Math.max(dormantR * 2, 4);
    return (
      <g transform={`translate(${x},${y})`} onClick={onClick} onPointerDown={onPointerDown}
         style={{ cursor: onClick || onPointerDown ? "pointer" : undefined }} opacity={opacity}>
        {viewMode !== "icon" && (
          <>
            <circle cx={0} cy={0} r={dormantR} fill="#8B7355" opacity={0.35} />
            <circle cx={0} cy={0} r={dormantR * 0.5} fill="#6B5335" opacity={0.25} />
          </>
        )}
        {viewMode !== "color" && (
          <text x={0} y={0.5} textAnchor="middle" dominantBaseline="central" fontSize={dormantFontSize} opacity={0.45}>
            {icon}
          </text>
        )}
        {isSelected && (
          <circle cx={0} cy={0} r={dormantR + 2} fill="none" stroke="var(--accent, #2d7a3a)"
            strokeWidth={0.8} strokeDasharray="2 1" opacity={0.9} />
        )}
      </g>
    );
  }

  const fc = colors.foliage;
  const sc = colors.stem;
  const ac = colors.accent;

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={{ cursor: onClick || onPointerDown ? "pointer" : undefined }}
      filter={isSelected ? "url(#glow)" : undefined}
      opacity={opacity}
    >
      {/* Color shapes */}
      {viewMode !== "icon" && (
        <>
          {shape === "rosette" && (
            <>
              {(phase === "fruiting" || phase === "harvesting") && ac && (
                <circle cx={0} cy={0} r={r * 0.4} fill={ac} opacity={0.6} />
              )}
              {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                const lx = Math.cos(rad) * r * 0.4;
                const ly = Math.sin(rad) * r * 0.4;
                return (
                  <ellipse
                    key={i}
                    cx={lx}
                    cy={ly}
                    rx={r * 0.15}
                    ry={r * 0.45}
                    fill={fc}
                    opacity={0.8}
                    transform={`rotate(${angle} ${lx} ${ly})`}
                  />
                );
              })}
              <circle cx={0} cy={0} r={r * 0.2} fill={sc} opacity={0.9} />
            </>
          )}

          {shape === "leafy" && (
            <>
              {[0, 72, 144, 216, 288].map((angle, i) => {
                const rad = ((angle + 15) * Math.PI) / 180;
                return (
                  <circle
                    key={`o${i}`}
                    cx={Math.cos(rad) * r * 0.35}
                    cy={Math.sin(rad) * r * 0.35}
                    r={r * 0.55}
                    fill={fc}
                    opacity={0.5}
                  />
                );
              })}
              {[0, 90, 180, 270].map((angle, i) => {
                const rad = ((angle + 30) * Math.PI) / 180;
                return (
                  <circle
                    key={`i${i}`}
                    cx={Math.cos(rad) * r * 0.15}
                    cy={Math.sin(rad) * r * 0.15}
                    r={r * 0.35}
                    fill={lightenColor(fc, 30)}
                    opacity={0.7}
                  />
                );
              })}
              <circle cx={0} cy={0} r={r * 0.2} fill={lightenColor(fc, 50)} opacity={0.8} />
              {(phase === "flowering" || phase === "dying") && (
                <circle cx={0} cy={-r * 0.3} r={r * 0.12} fill="#FEFAE0" opacity={0.9} />
              )}
            </>
          )}

          {shape === "upright" && (
            <>
              {(phase === "fruiting" || phase === "harvesting") && ac && (
                <ellipse cx={0} cy={r * 0.15} rx={r * 0.4} ry={r * 0.3} fill={ac} opacity={0.7} />
              )}
              {[-2, -1, 0, 1, 2].map((i) => (
                <ellipse
                  key={i}
                  cx={i * r * 0.12}
                  cy={-r * 0.15}
                  rx={r * 0.08}
                  ry={r * 0.55}
                  fill={fc}
                  opacity={0.75}
                  transform={`rotate(${i * 8} ${i * r * 0.12} ${-r * 0.15})`}
                />
              ))}
            </>
          )}

          {shape === "bushy" && (
            <>
              <circle cx={0} cy={0} r={r * 0.7} fill={fc} opacity={0.5} />
              {[0, 51.4, 102.8, 154.2, 205.6, 257, 308.4].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                const dist = r * (0.3 + (((i * 7 + 3) % 11) / 11) * 0.4);
                return (
                  <circle
                    key={i}
                    cx={Math.cos(rad) * dist}
                    cy={Math.sin(rad) * dist}
                    r={r * (0.2 + (((i * 3 + 5) % 7) / 7) * 0.15)}
                    fill={lightenColor(fc, 10 + i * 3)}
                    opacity={0.6}
                  />
                );
              })}
              {phase === "flowering" && ac &&
                [0, 90, 180, 270].map((angle, i) => {
                  const rad = ((angle + 20) * Math.PI) / 180;
                  return (
                    <circle
                      key={`f${i}`}
                      cx={Math.cos(rad) * r * 0.4}
                      cy={Math.sin(rad) * r * 0.4}
                      r={r * 0.12}
                      fill={ac}
                      opacity={0.9}
                    />
                  );
                })}
              {(phase === "fruiting" || phase === "harvesting") && ac &&
                [0, 72, 144, 216, 288].map((angle, i) => {
                  const rad = ((angle + 10) * Math.PI) / 180;
                  return (
                    <ellipse
                      key={`p${i}`}
                      cx={Math.cos(rad) * r * 0.45}
                      cy={Math.sin(rad) * r * 0.45}
                      rx={r * 0.06}
                      ry={r * 0.22}
                      fill={ac}
                      opacity={0.85}
                      transform={`rotate(${angle + 100} ${Math.cos(rad) * r * 0.45} ${Math.sin(rad) * r * 0.45})`}
                    />
                  );
                })}
            </>
          )}

          {(shape === "tree-canopy" || shape === "ground-cover" || shape === "climber" ||
            shape === "bulb" || shape === "grass" || shape === "root-clump") && (
            <>
              <circle cx={0} cy={0} r={r * 0.8} fill={fc} opacity={0.45} />
              <circle cx={0} cy={0} r={r * 0.5} fill={lightenColor(fc, 15)} opacity={0.5} />
              <circle cx={0} cy={0} r={r * 0.25} fill={sc} opacity={0.7} />
              {phase === "flowering" && ac && (
                <circle cx={r * 0.3} cy={-r * 0.3} r={r * 0.15} fill={ac} opacity={0.85} />
              )}
            </>
          )}
        </>
      )}

      {/* Icon overlay */}
      {viewMode !== "color" && (
        <text
          x={0}
          y={viewMode === "icon" ? r * 0.05 : r * 0.05}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={viewMode === "icon" ? r * 1.6 : r * 0.8}
          opacity={viewMode === "icon" ? 0.95 : 0.85}
        >
          {icon}
        </text>
      )}

      {/* Selection ring */}
      {isSelected && (
        <circle
          cx={0}
          cy={0}
          r={r * 1.15 + 2}
          fill="none"
          stroke="var(--accent, #2d7a3a)"
          strokeWidth={Math.max(0.8, r * 0.06)}
          strokeDasharray={`${Math.max(2, r * 0.12)} ${Math.max(1, r * 0.06)}`}
          opacity={0.9}
        />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main DesignLab Component
// ---------------------------------------------------------------------------

export default function DesignLab({
  featureId,
  featureName,
  ring,
  plants,
  onClose,
  onLayoutChange,
}: DesignLabProps) {
  // ── Core state ──
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [viewMode, setViewMode] = useState<"color" | "icon" | "both">("both");
  const [tool, setTool] = useState<LabTool>("select");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // ── Placement state ──
  const [placingSpeciesId, setPlacingSpeciesId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<BedLocalCoord | null>(null);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"palette" | "info" | "ai">("palette");
  const [paletteCategory, setPaletteCategory] = useState<string>("all");

  // ── Drag state ──
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const dragStartRef = useRef<{ elemX: number; elemY: number; pointerX: number; pointerY: number } | null>(null);

  // ── Row tool state ──
  const [rowStart, setRowStart] = useState<BedLocalCoord | null>(null);

  // ── SVG ref for coordinate conversion ──
  const svgRef = useRef<SVGSVGElement>(null);

  // ── AI Chat state ──
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPersona, setAiPersona] = useState<string>("organic");
  const aiScrollRef = useRef<HTMLDivElement>(null);

  // ── Layout ──
  const [layout, setLayout] = useState<BedLayout>(() => {
    const existing = getBedLayout(featureId);
    if (existing) return existing;
    const partial = geoPolygonToBedLayout(featureId, ring);
    return createBedLayout(partial);
  });

  // ── SVG sizing ──
  const svgPadding = 20;
  const viewBox = useMemo(
    () =>
      `${-svgPadding} ${-svgPadding} ${layout.widthCm + svgPadding * 2} ${layout.lengthCm + svgPadding * 2}`,
    [layout.widthCm, layout.lengthCm]
  );

  // Minimum visible radius – ensures plants are visible even on very large beds.
  // For a 2800cm bed this gives ~22px SVG units → ~6px on screen.
  const minPlantRadius = Math.max(layout.widthCm, layout.lengthCm) * 0.008;

  // ── Persist ──
  const persistLayout = useCallback(
    (updated: BedLayout) => {
      setLayout(updated);
      saveBedLayout(updated);
      onLayoutChange?.(updated);
    },
    [onLayoutChange]
  );

  // ── Auto-populate plants from main map ──
  useEffect(() => {
    if (layout.elements.length > 0) return; // already populated
    if (plants.length === 0) return;

    const elements: BedElement[] = [];
    const rowSpacing = 25; // cm
    const edgeMargin = 12; // cm

    plants.forEach((p, rowIdx) => {
      const rowY = edgeMargin + rowIdx * rowSpacing;
      if (rowY > layout.lengthCm - edgeMargin) return;

      const startX = edgeMargin + (p.spacingCm || 10);
      const availWidth = layout.widthCm - edgeMargin * 2 - (p.spacingCm || 10);
      const count = Math.min(p.count || 1, Math.max(1, Math.floor(availWidth / Math.max(p.spacingCm || 10, 3))));

      for (let i = 0; i < count; i++) {
        const x = startX + i * (availWidth / Math.max(count, 1));
        elements.push({
          id: crypto.randomUUID(),
          type: "plant",
          position: { x, y: rowY },
          rotation: 0,
          width: p.spreadCm || 10,
          length: p.spreadCm || 10,
          speciesId: p.speciesId,
          instanceId: p.id,
          count: 1,
          spacingCm: p.spacingCm,
          icon: p.icon,
          label: p.name,
        });
      }
    });

    if (elements.length > 0) {
      const updated = { ...layout, elements, version: layout.version + 1 };
      persistLayout(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── All plants for palette ──
  const allPlants = useMemo(() => getAllPlants(), []);
  const filteredPalettePlants = useMemo(() => {
    let list = allPlants;
    // Category filter
    if (paletteCategory !== "all") {
      list = list.filter((p) => p.category === paletteCategory);
    }
    // Search filter
    if (paletteSearch.trim()) {
      const q = paletteSearch.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) ||
          (p.latinName?.toLowerCase().includes(q)) ||
          (p.category?.toLowerCase().includes(q))
      );
    }
    return list.slice(0, 60);
  }, [allPlants, paletteSearch, paletteCategory]);

  // Category counts for palette filter
  const paletteCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of allPlants) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return counts;
  }, [allPlants]);

  // ── Placing species data ──
  const placingSpecies = useMemo(
    () => placingSpeciesId ? getPlantById(placingSpeciesId) ?? null : null,
    [placingSpeciesId]
  );

  // ── SVG coordinate conversion ──
  const svgPointFromEvent = useCallback((e: React.MouseEvent | React.PointerEvent): BedLocalCoord | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  // ── Place a plant at a position ──
  const placeElementAt = useCallback((pos: BedLocalCoord, species: PlantSpecies) => {
    if (!pointInBedOutline(pos, layout.outlineCm)) return;
    const newEl: BedElement = {
      id: crypto.randomUUID(), type: "plant",
      position: pos, rotation: 0,
      width: species.spreadDiameterCm ?? species.spacingCm ?? 10,
      length: species.spreadDiameterCm ?? species.spacingCm ?? 10,
      speciesId: species.id, count: 1,
      spacingCm: species.spacingCm,
      icon: species.icon ?? "🌱", label: species.name,
    };
    const updated = addElement(featureId, newEl);
    if (updated) persistLayout(updated);
  }, [layout.outlineCm, featureId, persistLayout]);

  // ── Place a row of plants between two points ──
  const placeRow = useCallback((start: BedLocalCoord, end: BedLocalCoord, species: PlantSpecies) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const spacing = species.spacingCm ?? 10;
    const count = Math.max(1, Math.floor(len / spacing));
    const newElements: BedElement[] = [];
    for (let i = 0; i <= count; i++) {
      const t = count === 0 ? 0 : i / count;
      const pos = { x: start.x + dx * t, y: start.y + dy * t };
      if (!pointInBedOutline(pos, layout.outlineCm)) continue;
      newElements.push({
        id: crypto.randomUUID(), type: "plant",
        position: pos, rotation: 0,
        width: species.spreadDiameterCm ?? spacing,
        length: species.spreadDiameterCm ?? spacing,
        speciesId: species.id, count: 1,
        spacingCm: spacing, icon: species.icon ?? "🌱", label: species.name,
      });
    }
    if (newElements.length === 0) return;
    const updated = { ...layout, elements: [...layout.elements, ...newElements], version: layout.version + 1 };
    persistLayout(updated);
  }, [layout, persistLayout]);

  // ── Start placing from palette ──
  const startPlacing = useCallback((speciesId: string) => {
    setPlacingSpeciesId(speciesId);
    setTool("place");
    setSelectedElementId(null);
    setRowStart(null);
  }, []);

  // ── Keyboard ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      switch (e.key) {
        case "Escape":
          if (placingSpeciesId) { setPlacingSpeciesId(null); setTool("select"); setGhostPos(null); setRowStart(null); }
          else if (selectedElementId) setSelectedElementId(null);
          else onClose();
          break;
        case "Delete": case "Backspace":
          if (selectedElementId) {
            const updated = removeElement(featureId, selectedElementId);
            if (updated) persistLayout(updated);
            setSelectedElementId(null);
          }
          break;
        case "v": case "V": setTool("select"); break;
        case "h": case "H": setTool("pan"); break;
        case "p": case "P":
          if (!placingSpeciesId) { setTool("place"); setSidebarTab("palette"); }
          break;
        case "r": case "R":
          if (placingSpeciesId) { setTool("row"); setRowStart(null); }
          break;
        case "d": case "D": setTool("delete"); break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedElementId, placingSpeciesId, featureId, onClose, persistLayout]);

  // ── Zoom ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(5, Math.max(0.3, z * delta)));
  }, []);

  // ── Pan ──
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (tool === "pan" || e.button === 1 || (e.button === 0 && e.altKey)) {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }
    },
    [tool, pan]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning && panStartRef.current) {
        setPan({
          x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
          y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
        });
        return;
      }
      // Drag element
      if (draggingElementId && dragStartRef.current) {
        const pos = svgPointFromEvent(e);
        if (!pos) return;
        const svg = svgRef.current;
        if (!svg) return;
        const startPt = svg.createSVGPoint();
        startPt.x = dragStartRef.current.pointerX;
        startPt.y = dragStartRef.current.pointerY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const startSvg = startPt.matrixTransform(ctm.inverse());
        const newX = dragStartRef.current.elemX + (pos.x - startSvg.x);
        const newY = dragStartRef.current.elemY + (pos.y - startSvg.y);
        const snapped = snapToGrid({ x: newX, y: newY }, 5, layout.outlineCm);
        setLayout((prev) => ({
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === draggingElementId ? { ...el, position: snapped.snappedPosition } : el
          ),
        }));
        return;
      }
      // Ghost preview for placement
      if ((tool === "place" || tool === "row") && placingSpeciesId) {
        const pos = svgPointFromEvent(e);
        if (pos) setGhostPos(pos);
      }
    },
    [isPanning, draggingElementId, tool, placingSpeciesId, svgPointFromEvent, layout.outlineCm]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        return;
      }
      if (draggingElementId) {
        const el = layout.elements.find((el) => el.id === draggingElementId);
        if (el) {
          const updated = updateElement(featureId, draggingElementId, { position: el.position });
          if (updated) persistLayout(updated);
        }
        setDraggingElementId(null);
        dragStartRef.current = null;
        return;
      }
    },
    [isPanning, draggingElementId, layout.elements, featureId, persistLayout]
  );

  // ── SVG click for placement ──
  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    const pos = svgPointFromEvent(e);
    if (!pos) return;
    if (tool === "place" && placingSpecies) {
      const snapped = snapToGrid(pos, 5, layout.outlineCm);
      placeElementAt(snapped.snappedPosition, placingSpecies);
      return;
    }
    if (tool === "row" && placingSpecies) {
      const snapped = snapToGrid(pos, 5, layout.outlineCm);
      if (!rowStart) {
        setRowStart(snapped.snappedPosition);
      } else {
        placeRow(rowStart, snapped.snappedPosition, placingSpecies);
        setRowStart(null);
      }
      return;
    }
    if (tool === "select") {
      setSelectedElementId(null);
    }
  }, [tool, placingSpecies, rowStart, svgPointFromEvent, placeElementAt, placeRow, layout.outlineCm]);

  // ── Element pointer down (select or start drag) ──
  const handleElementPointerDown = useCallback((e: React.PointerEvent, el: BedElement) => {
    e.stopPropagation();
    if (tool === "select") {
      setSelectedElementId(el.id);
      setDraggingElementId(el.id);
      dragStartRef.current = {
        elemX: el.position.x, elemY: el.position.y,
        pointerX: e.clientX, pointerY: e.clientY,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } else if (tool === "delete") {
      const updated = removeElement(featureId, el.id);
      if (updated) persistLayout(updated);
    }
  }, [tool, featureId, persistLayout]);

  // ── Build PlantCalendar from PlantSpecies ──
  const calendarFromSpecies = useCallback((sp: PlantSpecies): PlantCalendar => {
    const sowMonth = sp.sowIndoor?.from ?? sp.sowOutdoor?.from ?? sp.plantOut?.from ?? null;
    const growStart = sp.plantOut?.from ?? sp.sowOutdoor?.from ?? (sowMonth ? sowMonth + 1 : 4);
    const harvestStart = sp.harvest?.from ?? null;
    const harvestEnd = sp.harvest?.to ?? null;
    // Annuals die after harvest; perennials don't
    const dieMonth = sp.lifecycle === "annual"
      ? (harvestEnd ? Math.min(harvestEnd + 2, 12) : 11)
      : null;
    // Flowering: estimate ~1 month before harvest, or June for flowers
    const flowerMonth = sp.category === "flower"
      ? (sp.plantOut?.from ? sp.plantOut.from + 2 : 5)
      : (harvestStart ? Math.max(harvestStart - 1, growStart + 1) : null);
    return { sowMonth, growStart, flowerMonth, harvestStart, harvestEnd, dieMonth };
  }, []);

  // ── Bed resize handler ──
  const handleBedResize = useCallback((newWidthCm: number, newLengthCm: number) => {
    if (newWidthCm < 20 || newLengthCm < 20) return; // minimum 20cm
    if (newWidthCm > 10000 || newLengthCm > 10000) return; // max 100m

    // Scale outline proportionally
    const scaleX = newWidthCm / layout.widthCm;
    const scaleY = newLengthCm / layout.lengthCm;

    const newOutline = layout.outlineCm.map((p) => ({
      x: p.x * scaleX,
      y: p.y * scaleY,
    }));

    // Optionally reposition elements that fall outside new bounds
    const newElements = layout.elements.map((el) => {
      const newX = Math.min(el.position.x, newWidthCm - 5);
      const newY = Math.min(el.position.y, newLengthCm - 5);
      return { ...el, position: { x: Math.max(5, newX), y: Math.max(5, newY) } };
    });

    const updated: BedLayout = {
      ...layout,
      widthCm: newWidthCm,
      lengthCm: newLengthCm,
      outlineCm: newOutline,
      elements: newElements,
      version: layout.version + 1,
    };
    persistLayout(updated);
  }, [layout, persistLayout]);

  // ── AI Chat send ──
  const sendAiMessage = useCallback(async () => {
    const text = aiInput.trim();
    if (!text || aiLoading) return;

    const userMsg = { role: "user" as const, content: text };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);

    // Build garden context for this bed
    const bedPlants = layout.elements.filter((e) => e.type === "plant" && e.speciesId);
    const speciesList = bedPlants.map((e) => {
      const sp = e.speciesId ? getPlantById(e.speciesId) : null;
      return sp ? `${sp.icon ?? "🌱"} ${sp.name} (${sp.latinName ?? ""})` : e.label ?? "Ukendt";
    });
    const uniqueList = [...new Set(speciesList)];
    const gardenContext = [
      `Design Lab – Bed: "${featureName}"`,
      `Størrelse: ${(layout.widthCm / 100).toFixed(1)}m × ${(layout.lengthCm / 100).toFixed(1)}m`,
      `Planter i bedet (${bedPlants.length} stk, ${uniqueList.length} arter):`,
      ...uniqueList.map((s) => `  - ${s}`),
    ].join("\n");

    try {
      const allMessages = [...aiMessages, userMsg];
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          persona: aiPersona,
          gardenContext,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ukendt fejl" }));
        setAiMessages((prev) => [...prev, { role: "assistant", content: `❌ Fejl: ${err.error ?? res.statusText}` }]);
        setAiLoading(false);
        return;
      }

      // Stream the SSE response
      const reader = res.body?.getReader();
      if (!reader) {
        setAiMessages((prev) => [...prev, { role: "assistant", content: "❌ Kunne ikke læse svar." }]);
        setAiLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let assistantContent = "";
      setAiMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              assistantContent += parsed.content;
              setAiMessages((prev) => {
                const msgs = [...prev];
                msgs[msgs.length - 1] = { role: "assistant", content: assistantContent };
                return msgs;
              });
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Netværksfejl";
      setAiMessages((prev) => [...prev, { role: "assistant", content: `❌ ${msg}` }]);
    } finally {
      setAiLoading(false);
      // Scroll to bottom
      setTimeout(() => {
        aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: "smooth" });
      }, 100);
    }
  }, [aiInput, aiLoading, aiMessages, aiPersona, featureName, layout]);

  // Auto-scroll AI chat
  useEffect(() => {
    if (aiMessages.length > 0) {
      setTimeout(() => {
        aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    }
  }, [aiMessages.length]);

  // ── Plant calendar data ──
  const plantCalendars = useMemo(() => {
    const map = new Map<string, { cal: PlantCalendar; shape: PlantShapeType; category: string }>();
    for (const p of plants) {
      // Try to get real species data for better calendar
      const sp = getPlantById(p.speciesId);
      const cal = sp
        ? calendarFromSpecies(sp)
        : {
            sowMonth: p.sowMonth ?? null,
            growStart: p.growStart ?? 4,
            flowerMonth: p.flowerMonth ?? null,
            harvestStart: p.harvestStart ?? null,
            harvestEnd: p.harvestEnd ?? null,
            dieMonth: p.dieMonth ?? null,
          };
      map.set(p.speciesId, {
        cal,
        shape: guessPlantShape(sp ?? p),
        category: p.category ?? sp?.category ?? "vegetable",
      });
    }
    // Resolve placed species not already from props
    for (const el of layout.elements) {
      if (el.speciesId && !map.has(el.speciesId)) {
        const sp = getPlantById(el.speciesId);
        if (sp) {
          map.set(el.speciesId, {
            cal: calendarFromSpecies(sp),
            shape: guessPlantShape(sp),
            category: sp.category ?? "vegetable",
          });
        }
      }
    }
    return map;
  }, [plants, layout.elements, calendarFromSpecies]);

  // ── Dimension display ──
  const bedWidthM = (layout.widthCm / 100).toFixed(1);
  const bedLengthM = (layout.lengthCm / 100).toFixed(1);

  // ── Count stats ──
  const plantElements = layout.elements.filter((e) => e.type === "plant");
  const uniqueSpecies = new Set(plantElements.map((e) => e.speciesId).filter(Boolean));

  // ── Selected element info ──
  const selectedElement = selectedElementId ? layout.elements.find((e) => e.id === selectedElementId) : null;
  const selectedSpecies = selectedElement?.speciesId ? getPlantById(selectedElement.speciesId) : null;

  // ── Cursor ──
  const canvasCursor = isPanning ? "grabbing"
    : draggingElementId ? "grabbing"
    : tool === "pan" ? "grab"
    : tool === "place" || tool === "row" ? "crosshair"
    : tool === "delete" ? "not-allowed"
    : "default";

  return (
    <div
      className="fixed inset-0 z-[10000] flex flex-col"
      style={{ background: "var(--background)" }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)", background: "var(--toolbar-bg)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 border transition-colors hover:bg-[var(--accent-light)]"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            ← Tilbage
          </button>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--foreground)" }}>
              🎨 Design Lab
            </h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {featureName} — {bedWidthM}m × {bedLengthM}m
            </p>
          </div>
        </div>

        {/* Month display */}
        <div
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold"
          style={{ background: "var(--accent-light)", color: "var(--accent)" }}
        >
          {MONTH_ICONS[month]} {MONTH_NAMES_DA[month]}
        </div>

        {/* View mode toggles */}
        <div className="flex gap-1">
          {(["color", "icon", "both"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                viewMode === mode
                  ? "text-white shadow-sm"
                  : "hover:bg-[var(--accent-light)]"
              }`}
              style={{
                borderColor: viewMode === mode ? "var(--accent)" : "var(--border)",
                background: viewMode === mode ? "var(--accent)" : "transparent",
                color: viewMode === mode ? "#fff" : "var(--foreground)",
              }}
            >
              {mode === "color" ? "🎨 Farve" : mode === "icon" ? "😀 Ikoner" : "🎨+😀 Begge"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{ borderColor: "var(--border)", background: "var(--sidebar-bg)" }}
      >
        {/* Tool buttons */}
        {(
          [
            { id: "select" as LabTool, label: "↖ Vælg", shortcut: "V" },
            { id: "place" as LabTool, label: "📌 Placér", shortcut: "P" },
            { id: "row" as LabTool, label: "🌾 Række", shortcut: "R" },
            { id: "pan" as LabTool, label: "✋ Panorér", shortcut: "H" },
            { id: "delete" as LabTool, label: "🗑 Slet", shortcut: "D" },
          ]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTool(t.id);
              if (t.id === "place" || t.id === "row") setSidebarTab("palette");
              if (t.id !== "place" && t.id !== "row") { setPlacingSpeciesId(null); setGhostPos(null); setRowStart(null); }
            }}
            className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors ${
              tool === t.id ? "text-white shadow-sm" : ""
            }`}
            style={{
              borderColor: tool === t.id ? "var(--accent)" : "var(--border)",
              background: tool === t.id ? "var(--accent)" : "transparent",
              color: tool === t.id ? "#fff" : "var(--foreground)",
            }}
            title={t.shortcut}
          >
            {t.label}
          </button>
        ))}

        <div className="mx-2 h-5 w-px" style={{ background: "var(--border)" }} />

        {/* Zoom */}
        <button
          onClick={() => setZoom((z) => Math.min(5, z * 1.2))}
          className="px-2 py-1 text-xs rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          🔍+
        </button>
        <span className="text-xs min-w-[40px] text-center" style={{ color: "var(--muted)" }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
          className="px-2 py-1 text-xs rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          🔍−
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="px-2 py-1 text-xs rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          ⟲ Reset
        </button>

        <div className="flex-1" />

        {/* Placing indicator */}
        {placingSpeciesId && placingSpecies && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
               style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
            <span>{placingSpecies.icon ?? "🌱"}</span>
            <span>{tool === "row" ? "Rækkefyld:" : "Placerer:"} {placingSpecies.name}</span>
            <button onClick={() => { setPlacingSpeciesId(null); setTool("select"); setGhostPos(null); setRowStart(null); }}
              className="ml-1 text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Season slider */}
        <label className="text-[10px]" style={{ color: "var(--muted)" }}>
          Sæson:
        </label>
        <input
          type="range"
          min={1}
          max={12}
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="w-40 accent-[var(--accent)]"
        />
      </div>

      {/* ── Main area: Canvas + Sidebar ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          className="flex-1 flex items-center justify-center overflow-hidden"
          style={{ background: "var(--background)", cursor: canvasCursor }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <svg
            ref={svgRef}
            viewBox={viewBox}
            onClick={handleSvgClick}
            style={{
              maxWidth: "90%",
              maxHeight: "85%",
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: isPanning || draggingElementId ? "none" : "transform 0.1s ease-out",
            }}
          >
            <defs>
              {/* Soil texture */}
              <pattern id="dlSoilPattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect width="8" height="8" fill={GROUND_COLORS[month] ?? "#8B7355"} />
                <circle cx="2" cy="3" r="0.5" fill="#7a6545" opacity="0.5" />
                <circle cx="6" cy="7" r="0.4" fill="#9c8565" opacity="0.4" />
                <circle cx="5" cy="1" r="0.3" fill="#7a6545" opacity="0.3" />
              </pattern>
              {/* Glow filter */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Shadow filter */}
              <filter id="shadow">
                <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.8" floodOpacity="0.3" />
              </filter>
            </defs>

            {/* Bed outline */}
            <polygon
              points={layout.outlineCm.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="url(#dlSoilPattern)"
              stroke="var(--border, #e0ddd5)"
              strokeWidth="1.5"
            />
            {/* Wooden edge */}
            <polygon
              points={layout.outlineCm.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#8B6914"
              strokeWidth="2.5"
              opacity="0.5"
            />

            {/* Grid lines (subtle) */}
            <g opacity="0.08" stroke="var(--foreground, #1a1a1a)" strokeWidth="0.3">
              {Array.from({ length: Math.floor(layout.widthCm / 10) + 1 }, (_, i) => (
                <line key={`gv${i}`} x1={i * 10} y1={0} x2={i * 10} y2={layout.lengthCm} />
              ))}
              {Array.from({ length: Math.floor(layout.lengthCm / 10) + 1 }, (_, i) => (
                <line key={`gh${i}`} x1={0} y1={i * 10} x2={layout.widthCm} y2={i * 10} />
              ))}
            </g>

            {/* Row background strips */}
            <g>
              {plants.map((p, idx) => {
                const rowY = 12 + idx * 25;
                if (rowY > layout.lengthCm - 12) return null;
                const cal = plantCalendars.get(p.speciesId);
                if (!cal) return null;
                const phase = getPhase(cal.cal, month);
                if (phase === "dormant") return null;
                const colors = getSeasonColors(phase, undefined, cal.category);
                return (
                  <rect
                    key={`strip-${idx}`}
                    x={10}
                    y={rowY - 12.5 + 2}
                    width={layout.widthCm - 20}
                    height={21}
                    rx={3}
                    fill={colors.ground}
                    opacity={0.12}
                  />
                );
              })}
            </g>

            {/* Plant elements */}
            <g filter="url(#shadow)">
              {layout.elements
                .filter((e) => e.type === "plant")
                .map((el) => {
                  const cal = el.speciesId ? plantCalendars.get(el.speciesId) : null;
                  const phase = cal ? getPhase(cal.cal, month) : "growing";
                  const scale = getPhaseScale(phase);
                  const colors = getSeasonColors(phase, undefined, cal?.category ?? "vegetable");
                  const shape = cal?.shape ?? "leafy";

                  return (
                    <PlantShape
                      key={el.id}
                      shape={shape}
                      x={el.position.x}
                      y={el.position.y}
                      phase={phase}
                      scale={scale}
                      colors={colors}
                      icon={el.icon ?? "🌱"}
                      viewMode={viewMode}
                      spreadCm={el.width || 10}
                      isSelected={selectedElementId === el.id}
                      onPointerDown={(e) => handleElementPointerDown(e, el)}
                      minRadius={minPlantRadius}
                    />
                  );
                })}
            </g>

            {/* Row tool: start marker + preview line */}
            {tool === "row" && rowStart && (
              <g>
                <circle cx={rowStart.x} cy={rowStart.y} r={Math.max(2, minPlantRadius * 0.3)} fill="var(--accent, #2d7a3a)" opacity={0.8} />
                {ghostPos && (
                  <>
                    <line x1={rowStart.x} y1={rowStart.y} x2={ghostPos.x} y2={ghostPos.y}
                      stroke="var(--accent, #2d7a3a)" strokeWidth={Math.max(0.8, minPlantRadius * 0.1)} strokeDasharray={`${Math.max(3, minPlantRadius * 0.4)} ${Math.max(2, minPlantRadius * 0.25)}`} opacity={0.5} />
                    {(() => {
                      const dx = ghostPos.x - rowStart.x;
                      const dy = ghostPos.y - rowStart.y;
                      const len = Math.sqrt(dx * dx + dy * dy);
                      const spacing = placingSpecies?.spacingCm ?? 10;
                      const count = Math.max(1, Math.floor(len / spacing));
                      return Array.from({ length: count + 1 }, (_, i) => {
                        const t = count === 0 ? 0 : i / count;
                        return <circle key={i} cx={rowStart.x + dx * t} cy={rowStart.y + dy * t}
                          r={Math.max(1.5, minPlantRadius * 0.25)} fill="var(--accent, #2d7a3a)" opacity={0.3} />;
                      });
                    })()}
                  </>
                )}
              </g>
            )}

            {/* Ghost preview for single placement */}
            {tool === "place" && ghostPos && placingSpecies && pointInBedOutline(ghostPos, layout.outlineCm) && (
              <PlantShape shape={guessPlantShape(placingSpecies)} x={ghostPos.x} y={ghostPos.y}
                phase="growing" scale={0.75}
                colors={getSeasonColors("growing", undefined, placingSpecies.category ?? "vegetable")}
                icon={placingSpecies.icon ?? "🌱"} viewMode={viewMode}
                spreadCm={placingSpecies.spreadDiameterCm ?? placingSpecies.spacingCm ?? 10}
                opacity={0.4} minRadius={minPlantRadius} />
            )}

            {/* Dimension labels */}
            <text
              x={layout.widthCm / 2}
              y={-6}
              textAnchor="middle"
              fontSize="5"
              fontWeight="500"
              fill="var(--muted, #8a8578)"
            >
              {bedWidthM} m
            </text>
            <text
              x={-6}
              y={layout.lengthCm / 2}
              textAnchor="middle"
              fontSize="5"
              fontWeight="500"
              fill="var(--muted, #8a8578)"
              transform={`rotate(-90 -6 ${layout.lengthCm / 2})`}
            >
              {bedLengthM} m
            </text>
          </svg>
        </div>

        {/* ── Sidebar ── */}
        <div
          className="w-[280px] border-l flex flex-col overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--sidebar-bg)" }}
        >
          {/* Sidebar tabs */}
          <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
            {([
              { id: "palette" as const, label: "🌱 Palette" },
              { id: "info" as const, label: "📊 Info" },
              { id: "ai" as const, label: "🤖 AI" },
            ]).map((tab) => (
              <button key={tab.id} onClick={() => setSidebarTab(tab.id)}
                className="flex-1 px-2 py-2 text-[11px] font-medium transition-colors"
                style={{
                  color: sidebarTab === tab.id ? "var(--accent)" : "var(--muted)",
                  borderBottom: sidebarTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
                  background: sidebarTab === tab.id ? "var(--toolbar-bg)" : "transparent",
                }}>{tab.label}</button>
            ))}
          </div>

          {/* ── Palette tab ── */}
          {sidebarTab === "palette" && (
            <div className="flex-1 overflow-y-auto sidebar-scroll p-3">
              <input type="text" placeholder="Søg planter..."
                value={paletteSearch} onChange={(e) => setPaletteSearch(e.target.value)}
                className="w-full rounded-lg border px-3 py-1.5 text-xs mb-2 shadow-sm"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }} />

              {/* Category filter */}
              <div className="flex flex-wrap gap-1 mb-2">
                {[
                  { id: "all", label: "Alle", icon: "🌍" },
                  { id: "vegetable", label: "Grøntsag", icon: "🥬" },
                  { id: "fruit", label: "Frugt", icon: "🍎" },
                  { id: "herb", label: "Urter", icon: "🌿" },
                  { id: "flower", label: "Blomst", icon: "🌸" },
                  { id: "tree", label: "Træ", icon: "🌳" },
                  { id: "bush", label: "Busk", icon: "🫐" },
                  { id: "perennial", label: "Staude", icon: "🌷" },
                  { id: "grass", label: "Græs", icon: "🌾" },
                  { id: "climber", label: "Klatre", icon: "🧗" },
                  { id: "cover-crop", label: "Dæk", icon: "☘️" },
                  { id: "soil-amendment", label: "Jord", icon: "🪱" },
                ].map((cat) => {
                  const count = cat.id === "all" ? allPlants.length : (paletteCategoryCounts.get(cat.id) ?? 0);
                  if (cat.id !== "all" && count === 0) return null;
                  return (
                    <button key={cat.id}
                      onClick={() => setPaletteCategory(cat.id)}
                      className={`px-1.5 py-0.5 rounded-full text-[9px] border transition-colors ${
                        paletteCategory === cat.id ? "shadow-sm" : ""
                      }`}
                      style={{
                        borderColor: paletteCategory === cat.id ? "var(--accent)" : "var(--border)",
                        background: paletteCategory === cat.id ? "var(--accent)" : "transparent",
                        color: paletteCategory === cat.id ? "#fff" : "var(--foreground)",
                      }}>
                      {cat.icon} {cat.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Quick-access: plants already in bed */}
              {plants.length > 0 && (
                <>
                  <p className="text-[9px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
                    I bedet
                  </p>
                  <div className="grid grid-cols-2 gap-1 mb-3">
                    {plants.map((p) => (
                      <button key={p.speciesId}
                        onClick={() => startPlacing(p.speciesId)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left text-[10px] transition-colors ${
                          placingSpeciesId === p.speciesId ? "shadow-sm" : "hover:bg-[var(--accent-light)]"
                        }`}
                        style={{
                          borderColor: placingSpeciesId === p.speciesId ? "var(--accent)" : "var(--border)",
                          background: placingSpeciesId === p.speciesId ? "var(--accent-light)" : "transparent",
                          color: "var(--foreground)",
                        }}>
                        <span className="text-sm">{p.icon}</span>
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Full plant library */}
              <p className="text-[9px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
                Bibliotek
              </p>
              <div className="space-y-0.5">
                {filteredPalettePlants.map((sp) => (
                  <button key={sp.id}
                    onClick={() => startPlacing(sp.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left text-[10px] transition-colors ${
                      placingSpeciesId === sp.id ? "shadow-sm" : "hover:bg-[var(--accent-light)]"
                    }`}
                    style={{
                      borderColor: placingSpeciesId === sp.id ? "var(--accent)" : "var(--border)",
                      background: placingSpeciesId === sp.id ? "var(--accent-light)" : "transparent",
                      color: "var(--foreground)",
                    }}>
                    <span className="text-sm flex-shrink-0">{sp.icon ?? "🌱"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{sp.name}</div>
                      {sp.latinName && (
                        <div className="text-[9px] truncate" style={{ color: "var(--muted)" }}>{sp.latinName}</div>
                      )}
                    </div>
                    <span className="text-[9px] flex-shrink-0" style={{ color: "var(--muted)" }}>
                      {sp.spacingCm ?? "?"}cm
                    </span>
                  </button>
                ))}
                {filteredPalettePlants.length === 0 && (
                  <p className="text-xs py-2 text-center" style={{ color: "var(--muted)" }}>Ingen planter fundet.</p>
                )}
              </div>

              {/* Usage hint */}
              {placingSpeciesId && (
                <div className="mt-3 p-2 rounded-lg text-[10px] leading-relaxed"
                     style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                  <strong>Tip:</strong> Klik på bedet for at placere.
                  Tryk <kbd className="px-1 py-0.5 rounded text-[9px] bg-white/50">R</kbd> for rækkefyld.
                  <kbd className="px-1 py-0.5 rounded text-[9px] bg-white/50 ml-1">Esc</kbd> for at annullere.
                </div>
              )}
            </div>
          )}

          {/* ── Info tab ── */}
          {sidebarTab === "info" && (
            <div className="flex-1 overflow-y-auto sidebar-scroll p-3">
              {/* ── Bed resize controls ── */}
              <div className="mb-3 p-2.5 rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--toolbar-bg)" }}>
                <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--accent)" }}>
                  📐 Bed-størrelse
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] w-14 flex-shrink-0" style={{ color: "var(--muted)" }}>Bredde:</label>
                    <input
                      type="number"
                      min={20}
                      max={10000}
                      step={10}
                      value={Math.round(layout.widthCm)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v >= 20 && v <= 10000) handleBedResize(v, layout.lengthCm);
                      }}
                      className="flex-1 rounded border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
                    />
                    <span className="text-[10px]" style={{ color: "var(--muted)" }}>cm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] w-14 flex-shrink-0" style={{ color: "var(--muted)" }}>Længde:</label>
                    <input
                      type="number"
                      min={20}
                      max={10000}
                      step={10}
                      value={Math.round(layout.lengthCm)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v >= 20 && v <= 10000) handleBedResize(layout.widthCm, v);
                      }}
                      className="flex-1 rounded border px-2 py-1 text-xs"
                      style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
                    />
                    <span className="text-[10px]" style={{ color: "var(--muted)" }}>cm</span>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {[
                      { label: "1×2m", w: 100, l: 200 },
                      { label: "1.2×3m", w: 120, l: 300 },
                      { label: "1.2×6m", w: 120, l: 600 },
                      { label: "2×4m", w: 200, l: 400 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => handleBedResize(preset.w, preset.l)}
                        className="flex-1 px-1 py-0.5 rounded text-[8px] border transition-colors hover:bg-[var(--accent-light)]"
                        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] mt-1" style={{ color: "var(--muted)" }}>
                    💡 Ændringer synkroniseres til kortet
                  </p>
                </div>
              </div>

              {/* Selected element details */}
              {selectedElement && (
                <div className="mb-3 p-2.5 rounded-lg border" style={{ borderColor: "var(--accent)", background: "var(--accent-light)" }}>
                  <h4 className="text-xs font-semibold mb-1" style={{ color: "var(--accent)" }}>
                    ✏️ Valgt element
                  </h4>
                  <div className="text-[11px] space-y-1" style={{ color: "var(--foreground)" }}>
                    <div className="flex justify-between">
                      <span>Type</span>
                      <span className="font-medium">{selectedElement.icon ?? "🌱"} {selectedElement.label ?? selectedElement.type}</span>
                    </div>
                    {selectedSpecies && (
                      <>
                        <div className="flex justify-between">
                          <span>Afstand</span>
                          <span>{selectedSpecies.spacingCm ?? "?"}cm</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Spredning</span>
                          <span>{selectedSpecies.spreadDiameterCm ?? selectedSpecies.spacingCm ?? "?"}cm</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between">
                      <span>Position</span>
                      <span>{Math.round(selectedElement.position.x)}cm, {Math.round(selectedElement.position.y)}cm</span>
                    </div>
                  </div>
                  <button onClick={() => {
                    const updated = removeElement(featureId, selectedElement.id);
                    if (updated) persistLayout(updated);
                    setSelectedElementId(null);
                  }}
                    className="mt-2 w-full px-2 py-1 rounded text-[10px] border transition-colors hover:bg-red-50"
                    style={{ borderColor: "#f87171", color: "#dc2626" }}>
                    🗑 Fjern element
                  </button>
                </div>
              )}

              {/* Plant legend */}
              <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--accent)" }}>🌱 Planter i bedet</h3>
              {(() => {
                const speciesGroups = new Map<string, { icon: string; name: string; count: number; category: string }>();
                for (const el of plantElements) {
                  const key = el.speciesId ?? "__unknown";
                  if (!speciesGroups.has(key)) {
                    const fromProps = plants.find((p) => p.speciesId === key);
                    const fromLib = !fromProps && el.speciesId ? getPlantById(el.speciesId) : null;
                    speciesGroups.set(key, {
                      icon: fromProps?.icon ?? fromLib?.icon ?? el.icon ?? "🌱",
                      name: fromProps?.name ?? fromLib?.name ?? el.label ?? key,
                      count: 0,
                      category: fromProps?.category ?? fromLib?.category ?? "vegetable",
                    });
                  }
                  speciesGroups.get(key)!.count++;
                }
                return Array.from(speciesGroups.entries()).map(([key, { icon, name, count, category }]) => {
                  const cal = plantCalendars.get(key);
                  const phase = cal ? getPhase(cal.cal, month) : "growing";
                  const colors = getSeasonColors(phase, undefined, category);
                  const phaseInfo = PHASE_LABELS_DA[phase];
                  return (
                    <div key={key} className="flex items-start gap-2 py-2 border-b" style={{ borderColor: "var(--border-light)" }}>
                      <div className="w-6 h-6 rounded-full flex-shrink-0 border"
                        style={{ background: colors.foliage, borderColor: "var(--border)",
                          boxShadow: colors.accent ? `inset 0 -8px 0 ${colors.accent}` : undefined }} />
                      <div className="min-w-0">
                        <div className="text-xs font-medium" style={{ color: "var(--foreground)" }}>
                          {icon} {name}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--muted)" }}>{count} stk</div>
                        <span className="inline-block mt-0.5 px-1.5 py-px rounded text-[9px] font-semibold"
                          style={{ background: `${phaseInfo.color}22`, color: phaseInfo.color, border: `1px solid ${phaseInfo.color}44` }}>
                          {phaseInfo.text}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
              {plantElements.length === 0 && (
                <p className="text-xs py-4 text-center" style={{ color: "var(--muted)" }}>
                  Ingen planter endnu. Brug paletten til at tilføje.
                </p>
              )}
            </div>
          )}

          {/* ── AI tab ── */}
          {sidebarTab === "ai" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Persona selector */}
              <div className="flex gap-1 p-2 border-b" style={{ borderColor: "var(--border)" }}>
                {[
                  { id: "organic", label: "🌱 Økolog" },
                  { id: "regenerative", label: "♻️ Regen." },
                  { id: "conventional", label: "🚜 Konv." },
                  { id: "app-guide", label: "❓ Guide" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setAiPersona(p.id)}
                    className="flex-1 px-1 py-0.5 rounded text-[9px] border transition-colors"
                    style={{
                      borderColor: aiPersona === p.id ? "var(--accent)" : "var(--border)",
                      background: aiPersona === p.id ? "var(--accent)" : "transparent",
                      color: aiPersona === p.id ? "#fff" : "var(--foreground)",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Chat messages */}
              <div
                ref={aiScrollRef}
                className="flex-1 overflow-y-auto sidebar-scroll p-3 space-y-3"
              >
                {aiMessages.length === 0 && (
                  <div className="text-center py-6">
                    <div className="text-2xl mb-2">🤖</div>
                    <p className="text-xs font-medium mb-1" style={{ color: "var(--foreground)" }}>
                      AI Haveassistent
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                      Spørg om planlægning, afstande, companion planting, sygdomme,
                      eller få hjælp til at designe dit bed.
                    </p>
                    <div className="mt-3 space-y-1">
                      {[
                        "Hvad kan jeg plante mellem mine rækker?",
                        "Er afstandene gode nok?",
                        "Hvornår skal jeg høste?",
                      ].map((q) => (
                        <button
                          key={q}
                          onClick={() => { setAiInput(q); }}
                          className="block w-full text-left px-2 py-1.5 rounded-lg border text-[10px] transition-colors hover:bg-[var(--accent-light)]"
                          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                        >
                          💬 {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {aiMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                      msg.role === "user" ? "ml-4" : "mr-2"
                    }`}
                    style={{
                      background: msg.role === "user" ? "var(--accent-light)" : "var(--toolbar-bg)",
                      color: "var(--foreground)",
                      borderLeft: msg.role === "assistant" ? "3px solid var(--accent)" : undefined,
                    }}
                  >
                    <div className="text-[9px] font-semibold mb-0.5" style={{ color: "var(--muted)" }}>
                      {msg.role === "user" ? "👤 Dig" : "🤖 AI"}
                    </div>
                    <div className="whitespace-pre-wrap">{msg.content || (aiLoading && i === aiMessages.length - 1 ? "⏳ Tænker..." : "")}</div>
                  </div>
                ))}
              </div>

              {/* Chat input */}
              <div className="p-2 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                    placeholder="Spørg AI-assistenten..."
                    className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs"
                    style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
                    disabled={aiLoading}
                  />
                  <button
                    onClick={sendAiMessage}
                    disabled={aiLoading || !aiInput.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {aiLoading ? "⏳" : "➤"}
                  </button>
                </div>
                {aiMessages.length > 0 && (
                  <button
                    onClick={() => setAiMessages([])}
                    className="mt-1 text-[9px] transition-colors hover:underline"
                    style={{ color: "var(--muted)" }}
                  >
                    🗑 Ryd samtale
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Stats footer */}
          <div className="p-3 border-t text-[11px]"
               style={{ borderColor: "var(--border)", background: "var(--toolbar-bg)" }}>
            <h4 className="text-xs font-semibold mb-1.5" style={{ color: "var(--accent)" }}>📊 Statistik</h4>
            <div className="space-y-0.5">
              {[
                ["Arter", `${uniqueSpecies.size}`],
                ["Planter", `${plantElements.length}`],
                ["Størrelse", `${bedWidthM}m × ${bedLengthM}m`],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span style={{ color: "var(--muted)" }}>{label}</span>
                  <span style={{ color: "var(--foreground)" }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
