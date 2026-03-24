"use client";
// ---------------------------------------------------------------------------
// GardenOS – Design Lab Component
// ---------------------------------------------------------------------------
// A detailed bed/area editor that opens as a fullscreen overlay.
// Uses the same design tokens as the rest of the app (--accent, --border, etc.)
// ---------------------------------------------------------------------------

import React, { useState, useCallback, useRef, useEffect, useMemo, useId, memo } from "react";
import type { BedLayout, BedElement, BedLocalCoord, LabTool, PlantShapeType, GrowthPhase } from "../lib/bedLayoutTypes";
import { geoPolygonToBedLayout, pointInBedOutline, snapToGrid } from "../lib/bedGeometry";
import { getBedLayout, createBedLayout, saveBedLayout, removeElement, addElement, updateElement } from "../lib/bedLayoutStore";
import {
  MONTH_NAMES_DA, MONTH_ICONS, PHASE_LABELS_DA,
  getPhaseScale, getPhase, getSeasonColors, GROUND_COLORS,
  guessPlantShape, lightenColor, darkenColor,
  type PlantCalendar,
} from "../lib/seasonColors";
import type { PhaseColors } from "../lib/bedLayoutTypes";
import { getAllPlants, getPlantById } from "../lib/plantStore";
import type { PlantSpecies, PlantFamily } from "../lib/plantTypes";
import { PLANT_FAMILY_LABELS, PLANT_CATEGORY_LABELS, estimateHeightM } from "../lib/plantTypes";
import SeasonTimeline from "./designlab/SeasonTimeline";
import SuccessionView from "./designlab/SuccessionView";
import BedGeneratorDialog from "./designlab/BedGeneratorDialog";
import { autoFillBed } from "../lib/smartAutoFill";

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
  const uid = useId().replace(/:/g, "");
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

  // Gradient IDs – unique per PlantShape instance
  const gf = `gf${uid}`;
  const gs = `gs${uid}`;
  const ga = `ga${uid}`;
  const fillFc = `url(#${gf})`;
  const fillSc = `url(#${gs})`;
  const fillAc = ac ? `url(#${ga})` : undefined;

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={{
        cursor: onClick || onPointerDown ? "pointer" : undefined,
        transition: "opacity 0.6s ease, transform 0.4s ease",
      }}
      filter={isSelected ? "url(#glow)" : undefined}
      opacity={opacity}
    >
      {/* Gradient definitions (scoped to this plant) */}
      {viewMode !== "icon" && (
        <defs>
          <radialGradient id={gf} cx="38%" cy="32%" r="65%">
            <stop offset="0%" stopColor={lightenColor(fc, 45)} />
            <stop offset="50%" stopColor={fc} />
            <stop offset="100%" stopColor={darkenColor(fc, 30)} />
          </radialGradient>
          <radialGradient id={gs} cx="42%" cy="38%" r="58%">
            <stop offset="0%" stopColor={lightenColor(sc, 30)} />
            <stop offset="60%" stopColor={sc} />
            <stop offset="100%" stopColor={darkenColor(sc, 20)} />
          </radialGradient>
          {ac && (
            <radialGradient id={ga} cx="35%" cy="28%" r="62%">
              <stop offset="0%" stopColor={lightenColor(ac, 55)} />
              <stop offset="45%" stopColor={ac} />
              <stop offset="100%" stopColor={darkenColor(ac, 25)} />
            </radialGradient>
          )}
        </defs>
      )}

      {/* Color shapes */}
      {viewMode !== "icon" && (
        <>
          {shape === "rosette" && (
            <>
              {(phase === "fruiting" || phase === "harvesting") && fillAc && (
                <circle cx={0} cy={0} r={r * 0.4} fill={fillAc} opacity={0.6} />
              )}
              {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                const lx = Math.cos(rad) * r * 0.4;
                const ly = Math.sin(rad) * r * 0.4;
                return (
                  <g key={i}>
                    <ellipse
                      cx={lx}
                      cy={ly}
                      rx={r * 0.15}
                      ry={r * 0.45}
                      fill={fillFc}
                      opacity={0.8}
                      transform={`rotate(${angle} ${lx} ${ly})`}
                    />
                    {/* Leaf vein (midrib) */}
                    <line
                      x1={lx - Math.cos(rad) * r * 0.02} y1={ly - Math.sin(rad) * r * 0.02}
                      x2={lx + Math.cos(rad) * r * 0.35} y2={ly + Math.sin(rad) * r * 0.35}
                      stroke={darkenColor(fc, 25)} strokeWidth={r * 0.018} opacity={0.3}
                      transform={`rotate(${angle} ${lx} ${ly})`}
                    />
                  </g>
                );
              })}
              <circle cx={0} cy={0} r={r * 0.2} fill={fillSc} opacity={0.9} />
              {/* Flowering — small petal rosette at center */}
              {phase === "flowering" && fillAc && (
                <>
                  {[0, 72, 144, 216, 288].map((a, i) => {
                    const pRad = (a * Math.PI) / 180;
                    return <ellipse key={`rf${i}`} cx={Math.cos(pRad) * r * 0.13} cy={Math.sin(pRad) * r * 0.13}
                      rx={r * 0.06} ry={r * 0.11} fill={fillAc} opacity={0.8}
                      transform={`rotate(${a} ${Math.cos(pRad) * r * 0.13} ${Math.sin(pRad) * r * 0.13})`} />;
                  })}
                  <circle cx={0} cy={0} r={r * 0.06} fill="#FFD700" opacity={0.9} />
                </>
              )}
            </>
          )}

          {shape === "leafy" && (
            <>
              {[0, 72, 144, 216, 288].map((angle, i) => {
                const rad = ((angle + 15) * Math.PI) / 180;
                const cx = Math.cos(rad) * r * 0.35;
                const cy = Math.sin(rad) * r * 0.35;
                return (
                  <g key={`o${i}`}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r * 0.55}
                      fill={fillFc}
                      opacity={0.5}
                    />
                    {/* Leaf veins — 3 radial lines per lobe */}
                    {[0, 35, -35].map((vAngle, vi) => {
                      const vRad = ((angle + 15 + vAngle) * Math.PI) / 180;
                      return <line key={`v${i}-${vi}`}
                        x1={cx} y1={cy}
                        x2={cx + Math.cos(vRad) * r * 0.35} y2={cy + Math.sin(vRad) * r * 0.35}
                        stroke={darkenColor(fc, 20)} strokeWidth={r * 0.012} opacity={0.2} />;
                    })}
                  </g>
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
              {/* Flowering — improved petals */}
              {(phase === "flowering" || phase === "dying") && fillAc ? (
                <>
                  {[0, 72, 144, 216, 288].map((a, i) => {
                    const pRad = (a * Math.PI) / 180;
                    return <ellipse key={`lf${i}`}
                      cx={Math.cos(pRad) * r * 0.18} cy={-r * 0.3 + Math.sin(pRad) * r * 0.12}
                      rx={r * 0.05} ry={r * 0.1} fill={fillAc} opacity={0.85}
                      transform={`rotate(${a} ${Math.cos(pRad) * r * 0.18} ${-r * 0.3 + Math.sin(pRad) * r * 0.12})`} />;
                  })}
                  <circle cx={0} cy={-r * 0.3} r={r * 0.04} fill="#FFD700" opacity={0.9} />
                </>
              ) : (phase === "flowering" || phase === "dying") && (
                <circle cx={0} cy={-r * 0.3} r={r * 0.12} fill="#FEFAE0" opacity={0.9} />
              )}
            </>
          )}

          {shape === "upright" && (
            <>
              {(phase === "fruiting" || phase === "harvesting") && fillAc && (
                <ellipse cx={0} cy={r * 0.15} rx={r * 0.4} ry={r * 0.3} fill={fillAc} opacity={0.7} />
              )}
              {[-2, -1, 0, 1, 2].map((i) => (
                <ellipse
                  key={i}
                  cx={i * r * 0.12}
                  cy={-r * 0.15}
                  rx={r * 0.08}
                  ry={r * 0.55}
                  fill={fillFc}
                  opacity={0.75}
                  transform={`rotate(${i * 8} ${i * r * 0.12} ${-r * 0.15})`}
                />
              ))}
            </>
          )}

          {shape === "bushy" && (
            <>
              <circle cx={0} cy={0} r={r * 0.7} fill={fillFc} opacity={0.5} />
              {[0, 51.4, 102.8, 154.2, 205.6, 257, 308.4].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                const dist = r * (0.3 + (((i * 7 + 3) % 11) / 11) * 0.4);
                const cx = Math.cos(rad) * dist;
                const cy = Math.sin(rad) * dist;
                const lr = r * (0.2 + (((i * 3 + 5) % 7) / 7) * 0.15);
                return (
                  <g key={i}>
                    <circle
                      cx={cx} cy={cy} r={lr}
                      fill={lightenColor(fc, 10 + i * 3)} opacity={0.6}
                    />
                    {/* Fine leaf vein detail */}
                    <line x1={cx} y1={cy} x2={cx + Math.cos(rad) * lr * 0.8} y2={cy + Math.sin(rad) * lr * 0.8}
                      stroke={darkenColor(fc, 20)} strokeWidth={r * 0.01} opacity={0.2} />
                  </g>
                );
              })}
              {phase === "flowering" && fillAc &&
                [0, 90, 180, 270].map((angle, i) => {
                  const rad = ((angle + 20) * Math.PI) / 180;
                  const fx = Math.cos(rad) * r * 0.4;
                  const fy = Math.sin(rad) * r * 0.4;
                  return (
                    <g key={`f${i}`}>
                      {/* 4-petal flower */}
                      {[0, 90, 180, 270].map((pa, pi) => {
                        const pRad = (pa * Math.PI) / 180;
                        return <ellipse key={`bp${pi}`}
                          cx={fx + Math.cos(pRad) * r * 0.04} cy={fy + Math.sin(pRad) * r * 0.04}
                          rx={r * 0.03} ry={r * 0.06} fill={fillAc} opacity={0.85}
                          transform={`rotate(${pa} ${fx + Math.cos(pRad) * r * 0.04} ${fy + Math.sin(pRad) * r * 0.04})`} />;
                      })}
                      <circle cx={fx} cy={fy} r={r * 0.025} fill="#FFD700" opacity={0.9} />
                    </g>
                  );
                })}
              {(phase === "fruiting" || phase === "harvesting") && fillAc &&
                [0, 72, 144, 216, 288].map((angle, i) => {
                  const rad = ((angle + 10) * Math.PI) / 180;
                  const fx = Math.cos(rad) * r * 0.45;
                  const fy = Math.sin(rad) * r * 0.45;
                  return (
                    <g key={`p${i}`}>
                      <ellipse
                        cx={fx} cy={fy}
                        rx={r * 0.06} ry={r * 0.22}
                        fill={fillAc} opacity={0.85}
                        transform={`rotate(${angle + 100} ${fx} ${fy})`}
                      />
                      {/* Fruit highlight */}
                      <ellipse cx={fx - r * 0.015} cy={fy - r * 0.04}
                        rx={r * 0.02} ry={r * 0.06} fill={lightenColor(ac!, 40)} opacity={0.4}
                        transform={`rotate(${angle + 100} ${fx - r * 0.015} ${fy - r * 0.04})`} />
                    </g>
                  );
                })}
            </>
          )}

          {shape === "tree-canopy" && (
            <>
              {/* Trunk */}
              <rect x={-r * 0.08} y={r * 0.15} width={r * 0.16} height={r * 0.55} rx={r * 0.04} fill={fillSc} opacity={0.8} />
              {/* Bark detail lines */}
              <line x1={-r * 0.02} y1={r * 0.2} x2={-r * 0.02} y2={r * 0.6} stroke={darkenColor(sc, 30)} strokeWidth={r * 0.012} opacity={0.3} />
              <line x1={r * 0.03} y1={r * 0.25} x2={r * 0.03} y2={r * 0.55} stroke={darkenColor(sc, 30)} strokeWidth={r * 0.01} opacity={0.25} />
              {/* Crown layers */}
              <ellipse cx={0} cy={-r * 0.15} rx={r * 0.85} ry={r * 0.7} fill={fillFc} opacity={0.4} />
              <ellipse cx={-r * 0.15} cy={-r * 0.1} rx={r * 0.55} ry={r * 0.5} fill={lightenColor(fc, 10)} opacity={0.5} />
              <ellipse cx={r * 0.15} cy={-r * 0.2} rx={r * 0.5} ry={r * 0.45} fill={lightenColor(fc, 20)} opacity={0.5} />
              <ellipse cx={0} cy={-r * 0.25} rx={r * 0.35} ry={r * 0.3} fill={lightenColor(fc, 30)} opacity={0.6} />
              {/* Leaf cluster texture — small bumps along crown edge */}
              {[20, 70, 120, 170, 220, 270, 320].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                const d = r * 0.65;
                return <circle key={`lc${i}`}
                  cx={Math.cos(rad) * d} cy={-r * 0.15 + Math.sin(rad) * d * 0.7}
                  r={r * (0.12 + (i % 3) * 0.03)}
                  fill={i % 2 === 0 ? lightenColor(fc, 5) : darkenColor(fc, 8)}
                  opacity={0.35} />;
              })}
              {phase === "flowering" && fillAc &&
                [30, 90, 150, 250, 320].map((angle, i) => {
                  const rad = (angle * Math.PI) / 180;
                  const d = r * 0.45;
                  return (
                    <g key={`tf${i}`}>
                      {/* 5-petal flower */}
                      {[0, 72, 144, 216, 288].map((pa, pi) => {
                        const pRad = (pa * Math.PI) / 180;
                        const fx = Math.cos(rad) * d;
                        const fy = -r * 0.15 + Math.sin(rad) * d * 0.6;
                        return <ellipse key={`tp${pi}`}
                          cx={fx + Math.cos(pRad) * r * 0.04} cy={fy + Math.sin(pRad) * r * 0.04}
                          rx={r * 0.03} ry={r * 0.055}
                          fill={fillAc} opacity={0.8}
                          transform={`rotate(${pa} ${fx + Math.cos(pRad) * r * 0.04} ${fy + Math.sin(pRad) * r * 0.04})`} />;
                      })}
                    </g>
                  );
                })}
              {(phase === "fruiting" || phase === "harvesting") && fillAc &&
                [45, 135, 225, 315].map((angle, i) => {
                  const rad = (angle * Math.PI) / 180;
                  return <circle key={`tp${i}`} cx={Math.cos(rad) * r * 0.35} cy={-r * 0.1 + Math.sin(rad) * r * 0.25} r={r * 0.08} fill={fillAc} opacity={0.9} />;
                })}
            </>
          )}

          {shape === "ground-cover" && (
            <>
              {/* Flat, spreading rosettes */}
              <ellipse cx={0} cy={0} rx={r * 0.9} ry={r * 0.6} fill={fillFc} opacity={0.35} />
              {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                const d = r * 0.4;
                return (
                  <ellipse key={i} cx={Math.cos(rad) * d} cy={Math.sin(rad) * d * 0.65}
                    rx={r * 0.3} ry={r * 0.22} fill={lightenColor(fc, i * 5)} opacity={0.6}
                    transform={`rotate(${angle * 0.5} ${Math.cos(rad) * d} ${Math.sin(rad) * d * 0.65})`} />
                );
              })}
              {phase === "flowering" && fillAc &&
                [0, 120, 240].map((angle, i) => {
                  const rad = (angle * Math.PI) / 180;
                  return <circle key={`gf${i}`} cx={Math.cos(rad) * r * 0.3} cy={Math.sin(rad) * r * 0.2} r={r * 0.08} fill={fillAc} opacity={0.85} />;
                })}
            </>
          )}

          {shape === "climber" && (
            <>
              {/* Central stem */}
              <line x1={0} y1={r * 0.5} x2={0} y2={-r * 0.6} stroke={sc} strokeWidth={r * 0.06} opacity={0.7} />
              {/* Vine tendrils + leaves */}
              {[-1, 1].map((side) => (
                <g key={side}>
                  <path d={`M0,${r * 0.1} Q${side * r * 0.5},${-r * 0.1} ${side * r * 0.3},${-r * 0.35}`}
                    stroke={fc} strokeWidth={r * 0.04} fill="none" opacity={0.7} />
                  <ellipse cx={side * r * 0.35} cy={r * 0.15} rx={r * 0.2} ry={r * 0.3}
                    fill={fillFc} opacity={0.55} transform={`rotate(${side * 25} ${side * r * 0.35} ${r * 0.15})`} />
                  <ellipse cx={side * r * 0.25} cy={-r * 0.25} rx={r * 0.18} ry={r * 0.25}
                    fill={lightenColor(fc, 15)} opacity={0.6} transform={`rotate(${side * -15} ${side * r * 0.25} ${-r * 0.25})`} />
                </g>
              ))}
              {/* Curl tendrils */}
              <path d={`M${r * 0.3},${-r * 0.35} Q${r * 0.55},${-r * 0.5} ${r * 0.4},${-r * 0.6}`}
                stroke={sc} strokeWidth={r * 0.025} fill="none" opacity={0.5} />
              {phase === "flowering" && fillAc &&
                <circle cx={0} cy={-r * 0.5} r={r * 0.12} fill={fillAc} opacity={0.85} />}
            </>
          )}

          {shape === "bulb" && (
            <>
              {/* Underground bulb hint */}
              <ellipse cx={0} cy={r * 0.35} rx={r * 0.25} ry={r * 0.18} fill={fillSc} opacity={0.3} />
              {/* Pointed leaves emerging from center */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
                const rad = ((angle - 90) * Math.PI) / 180;
                const tipX = Math.cos(rad) * r * 0.15;
                const tipY = Math.sin(rad) * r * 0.15;
                return (
                  <ellipse key={i} cx={tipX} cy={tipY - r * 0.15}
                    rx={r * 0.06} ry={r * 0.45} fill={fillFc} opacity={0.6}
                    transform={`rotate(${angle} ${tipX} ${tipY - r * 0.15})`} />
                );
              })}
              <circle cx={0} cy={0} r={r * 0.12} fill={fillSc} opacity={0.7} />
              {/* Flower on top */}
              {phase === "flowering" && fillAc && (
                <>
                  {[0, 72, 144, 216, 288].map((angle, i) => {
                    const rad = (angle * Math.PI) / 180;
                    return <ellipse key={`bf${i}`} cx={Math.cos(rad) * r * 0.12} cy={-r * 0.4 + Math.sin(rad) * r * 0.12}
                      rx={r * 0.08} ry={r * 0.14} fill={fillAc} opacity={0.85}
                      transform={`rotate(${angle} ${Math.cos(rad) * r * 0.12} ${-r * 0.4 + Math.sin(rad) * r * 0.12})`} />;
                  })}
                  <circle cx={0} cy={-r * 0.4} r={r * 0.06} fill="#FFD700" opacity={0.9} />
                </>
              )}
            </>
          )}

          {shape === "grass" && (
            <>
              {/* Blade-like vertical leaves */}
              {[-3, -2, -1, 0, 1, 2, 3].map((i) => {
                const sway = i * 6 + Math.sin(i * 2.5) * 8;
                return (
                  <ellipse key={i} cx={i * r * 0.1} cy={-r * 0.1}
                    rx={r * 0.04} ry={r * 0.6}
                    fill={i % 2 === 0 ? fillFc : lightenColor(fc, 15)} opacity={0.7}
                    transform={`rotate(${sway} ${i * r * 0.1} ${-r * 0.1})`} />
                );
              })}
              {/* Base tuft */}
              <ellipse cx={0} cy={r * 0.35} rx={r * 0.35} ry={r * 0.12} fill={fillSc} opacity={0.4} />
              {phase === "flowering" && fillAc &&
                [-1, 0, 1].map((i) => (
                  <circle key={`grf${i}`} cx={i * r * 0.15} cy={-r * 0.55} r={r * 0.05} fill={fillAc} opacity={0.8} />
                ))}
            </>
          )}

          {shape === "root-clump" && (
            <>
              {/* Leafy top */}
              {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                const rad = (angle * Math.PI) / 180;
                return (
                  <ellipse key={i} cx={Math.cos(rad) * r * 0.2} cy={Math.sin(rad) * r * 0.2 - r * 0.15}
                    rx={r * 0.12} ry={r * 0.35} fill={fillFc} opacity={0.6}
                    transform={`rotate(${angle * 0.8 - 10} ${Math.cos(rad) * r * 0.2} ${Math.sin(rad) * r * 0.2 - r * 0.15})`} />
                );
              })}
              <circle cx={0} cy={-r * 0.15} r={r * 0.15} fill={lightenColor(fc, 25)} opacity={0.7} />
              {/* Root body visible below */}
              <ellipse cx={0} cy={r * 0.25} rx={r * 0.2} ry={r * 0.35} fill={fillAc ?? fillSc} opacity={0.6} />
              <ellipse cx={0} cy={r * 0.2} rx={r * 0.15} ry={r * 0.25} fill={lightenColor(ac ?? sc, 15)} opacity={0.5} />
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

function DesignLabInner({
  featureId,
  featureName,
  ring,
  plants,
  onClose,
  onLayoutChange,
}: DesignLabProps) {
  // ── Core state ──
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [autoPlay, setAutoPlay] = useState(false);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [viewMode, setViewMode] = useState<"color" | "icon" | "both">("both");
  const [colorBy, setColorBy] = useState<"season" | "family" | "category" | "harvest">("season");
  const [tool, setTool] = useState<LabTool>("select");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<BedElement[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null);
  const [lassoRect, setLassoRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const lassoStartRef = useRef<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // ── Rotation state (compass) ──
  const [rotationDeg, setRotationDeg] = useState(0);

  // ── Placement state ──
  const [placingSpeciesId, setPlacingSpeciesId] = useState<string | null>(null);
  const [placingInfraKind, setPlacingInfraKind] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<BedLocalCoord | null>(null);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [sidebarTab, setSidebarTab] = useState<"palette" | "info" | "timeline" | "rotation" | "ai">("palette");
  const [paletteCategory, setPaletteCategory] = useState<string>("all");

  // ── Selection helpers ──
  const isElementSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);
  const selectSingle = useCallback((id: string) => {
    setSelectedElementId(id);
    setSelectedIds(new Set([id]));
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedElementId(null);
    setSelectedIds(new Set());
  }, []);
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectedElementId(next.size === 1 ? [...next][0] : null);
      return next;
    });
  }, []);

  // ── Drag state ──
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const dragStartRef = useRef<{ elemX: number; elemY: number; pointerX: number; pointerY: number } | null>(null);

  // ── Rotation drag state ──
  const [rotatingElementId, setRotatingElementId] = useState<string | null>(null);
  const rotateStartRef = useRef<{ startAngle: number; elemRotation: number } | null>(null);

  // ── Shortcuts legend dialog ──
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── Companion lines toggle ──
  const [showCompanionLines, setShowCompanionLines] = useState(false);

  // ── Ruler tool state ──
  const [rulerStart, setRulerStart] = useState<BedLocalCoord | null>(null);
  const [rulerEnd, setRulerEnd] = useState<BedLocalCoord | null>(null);

  // ── Snap toggle ──
  const [snapEnabled, setSnapEnabled] = useState(true);

  // ── Row tool state ──
  const [rowStart, setRowStart] = useState<BedLocalCoord | null>(null);

  // ── Undo/redo ──
  const [undoStack, setUndoStack] = useState<BedLayout[]>([]);
  const [redoStack, setRedoStack] = useState<BedLayout[]>([]);

  // ── Snap guides ──
  const [activeGuides, setActiveGuides] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  // ── SVG ref for coordinate conversion ──
  const svgRef = useRef<SVGSVGElement>(null);

  // ── AI Chat state ──
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPersona, setAiPersona] = useState<string>("organic");
  const aiScrollRef = useRef<HTMLDivElement>(null);

  // ── Bed Generator dialog ──
  const [showBedGenerator, setShowBedGenerator] = useState(false);

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
      setUndoStack((prev) => [...prev.slice(-30), layout]); // keep max 30 undo steps
      setRedoStack([]);
      setLayout(updated);
      saveBedLayout(updated);
      onLayoutChange?.(updated);
    },
    [layout, onLayoutChange]
  );

  // ── Undo / Redo handlers ──
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, layout]);
    setUndoStack((s) => s.slice(0, -1));
    setLayout(prev);
    saveBedLayout(prev);
    onLayoutChange?.(prev);
  }, [undoStack, layout, onLayoutChange]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((s) => [...s, layout]);
    setRedoStack((r) => r.slice(0, -1));
    setLayout(next);
    saveBedLayout(next);
    onLayoutChange?.(next);
  }, [redoStack, layout, onLayoutChange]);

  // ── Season auto-play ──
  useEffect(() => {
    if (autoPlay) {
      autoPlayRef.current = setInterval(() => {
        setMonth((m) => (m >= 12 ? 1 : m + 1));
      }, 1200);
    } else if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
    return () => { if (autoPlayRef.current) clearInterval(autoPlayRef.current); };
  }, [autoPlay]);

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
    setPlacingInfraKind(null);
    setTool("place");
    clearSelection();
    setRowStart(null);
  }, [clearSelection]);

  // ── Start placing infrastructure ──
  const startPlacingInfra = useCallback((kind: string) => {
    setPlacingInfraKind(kind);
    setPlacingSpeciesId(null);
    setTool("place");
    clearSelection();
    setRowStart(null);
  }, [clearSelection]);

  // ── Keyboard ──
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === "Z" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); handleRedo(); return; }
      // Select all (⌘A)
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        const allIds = new Set(layout.elements.map((el) => el.id));
        setSelectedIds(allIds);
        setSelectedElementId(allIds.size === 1 ? [...allIds][0] : null);
        return;
      }
      // Copy (⌘C)
      if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C") && !e.shiftKey) {
        e.preventDefault();
        const els = layout.elements.filter((el) => selectedIds.has(el.id));
        if (els.length > 0) setClipboard(els);
        return;
      }
      // Paste (⌘V)
      if ((e.metaKey || e.ctrlKey) && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        if (clipboard.length === 0) return;
        const offset = 8; // cm offset so pasted items don't overlap
        const newElements = clipboard.map((el) => ({
          ...el,
          id: crypto.randomUUID(),
          position: { x: el.position.x + offset, y: el.position.y + offset },
        }));
        const updated = {
          ...layout,
          elements: [...layout.elements, ...newElements],
          version: layout.version + 1,
        };
        persistLayout(updated);
        const newIds = new Set(newElements.map((el) => el.id));
        setSelectedIds(newIds);
        setSelectedElementId(newIds.size === 1 ? [...newIds][0] : null);
        return;
      }
      // Duplicate (⌘D)
      if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        const els = layout.elements.filter((el) => selectedIds.has(el.id));
        if (els.length === 0) return;
        const dupes = els.map((el) => ({
          ...el,
          id: crypto.randomUUID(),
          position: { x: el.position.x + 6, y: el.position.y + 6 },
        }));
        const updated = {
          ...layout,
          elements: [...layout.elements, ...dupes],
          version: layout.version + 1,
        };
        persistLayout(updated);
        const newIds = new Set(dupes.map((el) => el.id));
        setSelectedIds(newIds);
        setSelectedElementId(newIds.size === 1 ? [...newIds][0] : null);
        return;
      }
      switch (e.key) {
        case "Escape":
          if (showShortcuts) { setShowShortcuts(false); break; }
          if (contextMenu) { setContextMenu(null); break; }
          if (placingSpeciesId || placingInfraKind) { setPlacingSpeciesId(null); setPlacingInfraKind(null); setTool("select"); setGhostPos(null); setRowStart(null); }
          else if (rulerStart || rulerEnd) { setRulerStart(null); setRulerEnd(null); if (tool === "ruler") setTool("select"); }
          else if (selectedIds.size > 0) clearSelection();
          else onClose();
          break;
        case "Delete": case "Backspace":
          if (selectedIds.size > 0) {
            let updated = layout;
            for (const id of selectedIds) {
              const next = removeElement(featureId, id);
              if (next) updated = next;
            }
            if (updated !== layout) persistLayout(updated);
            clearSelection();
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
        case "m": case "M": setTool("ruler"); setRulerStart(null); setRulerEnd(null); break;
        case "g": case "G": setSnapEnabled((v) => !v); break;
        case "?": setShowShortcuts((v) => !v); break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedIds, selectedElementId, placingSpeciesId, placingInfraKind, featureId, onClose, persistLayout, handleUndo, handleRedo, layout, clipboard, clearSelection, contextMenu]);

  // ── Zoom ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(5, Math.max(0.3, z * delta)));
  }, []);

  // ── Pan / Lasso ──
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setContextMenu(null);
      if (tool === "pan" || e.button === 1 || (e.button === 0 && e.altKey)) {
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } else if (tool === "select" && e.button === 0 && !e.shiftKey) {
        // Start lasso selection
        const pos = svgPointFromEvent(e);
        if (pos) {
          lassoStartRef.current = { x: pos.x, y: pos.y };
        }
      }
    },
    [tool, pan, svgPointFromEvent]
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
      // Lasso drag
      if (lassoStartRef.current && !draggingElementId && tool === "select") {
        const pos = svgPointFromEvent(e);
        if (pos) {
          setLassoRect({
            x1: Math.min(lassoStartRef.current.x, pos.x),
            y1: Math.min(lassoStartRef.current.y, pos.y),
            x2: Math.max(lassoStartRef.current.x, pos.x),
            y2: Math.max(lassoStartRef.current.y, pos.y),
          });
        }
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
        const snapped = snapEnabled ? snapToGrid({ x: newX, y: newY }, 5, layout.outlineCm) : { snappedPosition: { x: newX, y: newY }, guides: [] };
        setActiveGuides(snapped.guides.map((g) => ({ x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 })));
        setLayout((prev) => ({
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === draggingElementId ? { ...el, position: snapped.snappedPosition } : el
          ),
        }));
        return;
      }
      // Rotation drag
      if (rotatingElementId && rotateStartRef.current) {
        const el = layout.elements.find((e) => e.id === rotatingElementId);
        if (!el) return;
        const pos = svgPointFromEvent(e);
        if (!pos) return;
        const dx = pos.x - el.position.x;
        const dy = pos.y - el.position.y;
        const angle = Math.atan2(dx, -dy) * (180 / Math.PI); // 0=up, CW positive
        const deltaAngle = angle - rotateStartRef.current.startAngle;
        let newRot = rotateStartRef.current.elemRotation + deltaAngle;
        // Snap to 15° increments if not holding Shift
        newRot = Math.round(newRot / 15) * 15;
        newRot = ((newRot % 360) + 360) % 360;
        setLayout((prev) => ({
          ...prev,
          elements: prev.elements.map((el) =>
            el.id === rotatingElementId ? { ...el, rotation: newRot } : el
          ),
        }));
        return;
      }
      // Ghost preview for placement
      if ((tool === "place" || tool === "row" || tool === "ruler") && (placingSpeciesId || placingInfraKind || tool === "ruler")) {
        const pos = svgPointFromEvent(e);
        if (pos) setGhostPos(pos);
      }
    },
    [isPanning, draggingElementId, rotatingElementId, tool, placingSpeciesId, placingInfraKind, svgPointFromEvent, layout.outlineCm, layout.elements, snapEnabled]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
        return;
      }
      // Finalize lasso selection
      if (lassoStartRef.current && lassoRect) {
        const { x1, y1, x2, y2 } = lassoRect;
        // Only count as lasso if rect is big enough (> 3cm in each direction)
        if (Math.abs(x2 - x1) > 3 && Math.abs(y2 - y1) > 3) {
          const hits = new Set<string>();
          for (const el of layout.elements) {
            if (el.position.x >= x1 && el.position.x <= x2 &&
                el.position.y >= y1 && el.position.y <= y2) {
              hits.add(el.id);
            }
          }
          if (hits.size > 0) {
            setSelectedIds(hits);
            setSelectedElementId(hits.size === 1 ? [...hits][0] : null);
          }
        }
        setLassoRect(null);
        lassoStartRef.current = null;
        return;
      }
      lassoStartRef.current = null;
      // Finalize rotation drag
      if (rotatingElementId) {
        const el = layout.elements.find((el) => el.id === rotatingElementId);
        if (el) {
          const updated = updateElement(featureId, rotatingElementId, { rotation: el.rotation });
          if (updated) persistLayout(updated);
        }
        setRotatingElementId(null);
        rotateStartRef.current = null;
        return;
      }
      if (draggingElementId) {
        const el = layout.elements.find((el) => el.id === draggingElementId);
        if (el) {
          const updated = updateElement(featureId, draggingElementId, { position: el.position });
          if (updated) persistLayout(updated);
        }
        setDraggingElementId(null);
        setActiveGuides([]);
        dragStartRef.current = null;
        return;
      }
    },
    [isPanning, draggingElementId, rotatingElementId, layout, featureId, persistLayout, lassoRect]
  );

  // ── SVG click for placement ──
  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    const pos = svgPointFromEvent(e);
    if (!pos) return;
    if (tool === "place" && placingSpecies) {
      const snapped = snapEnabled ? snapToGrid(pos, 5, layout.outlineCm) : { snappedPosition: pos, guides: [] };
      placeElementAt(snapped.snappedPosition, placingSpecies);
      return;
    }
    if (tool === "place" && placingInfraKind) {
      const snapped = snapEnabled ? snapToGrid(pos, 5, layout.outlineCm) : { snappedPosition: pos, guides: [] };
      if (!pointInBedOutline(snapped.snappedPosition, layout.outlineCm)) return;
      const INFRA_DEFS: Record<string, { type: BedElement["type"]; icon: string; label: string; w: number; l: number }> = {
        "drip-line":   { type: "water",    icon: "💧", label: "Drypslange", w: 100, l: 5 },
        "sprinkler":   { type: "water",    icon: "🚿", label: "Sprinkler",  w: 10,  l: 10 },
        "tap":         { type: "water",    icon: "🚰", label: "Vandhane",   w: 8,   l: 8 },
        "cable":       { type: "electric", icon: "⚡", label: "Kabel",      w: 100, l: 3 },
        "socket":      { type: "electric", icon: "🔌", label: "Stikkontakt", w: 8,  l: 8 },
        "stepping":    { type: "path",     icon: "🪨", label: "Trædesten",  w: 30,  l: 30 },
        "walkway":     { type: "path",     icon: "🛤️", label: "Gangsti",    w: 50,  l: 100 },
        "timber-edge": { type: "edge",     icon: "🪵", label: "Trækant",    w: 100, l: 8 },
        "stone-edge":  { type: "edge",     icon: "🧱", label: "Stenkant",   w: 100, l: 8 },
        "label":       { type: "label",    icon: "🏷️", label: "Mærkat",     w: 20,  l: 10 },
      };
      const def = INFRA_DEFS[placingInfraKind] ?? { type: "label" as const, icon: "📍", label: placingInfraKind, w: 20, l: 20 };
      const newEl: BedElement = {
        id: crypto.randomUUID(),
        type: def.type,
        position: snapped.snappedPosition,
        rotation: 0,
        width: def.w,
        length: def.l,
        icon: def.icon,
        label: def.label,
        infrastructureKind: placingInfraKind,
      };
      const updated = addElement(featureId, newEl);
      if (updated) persistLayout(updated);
      return;
    }
    if (tool === "row" && placingSpecies) {
      const snapped = snapEnabled ? snapToGrid(pos, 5, layout.outlineCm) : { snappedPosition: pos, guides: [] };
      if (!rowStart) {
        setRowStart(snapped.snappedPosition);
      } else {
        placeRow(rowStart, snapped.snappedPosition, placingSpecies);
        setRowStart(null);
      }
      return;
    }
    if (tool === "select") {
      clearSelection();
      setContextMenu(null);
    }
    if (tool === "ruler") {
      if (!rulerStart) {
        setRulerStart(pos);
        setRulerEnd(null);
      } else {
        setRulerEnd(pos);
      }
    }
  }, [tool, placingSpecies, placingInfraKind, rowStart, rulerStart, svgPointFromEvent, placeElementAt, placeRow, layout.outlineCm, featureId, persistLayout, snapEnabled]);

  // ── Element pointer down (select or start drag) ──
  const handleElementPointerDown = useCallback((e: React.PointerEvent, el: BedElement) => {
    e.stopPropagation();
    setContextMenu(null);
    if (tool === "select") {
      if (e.shiftKey) {
        // Shift+click → toggle multi-select
        toggleSelection(el.id);
      } else {
        // Regular click → single select + start drag
        selectSingle(el.id);
        setDraggingElementId(el.id);
        dragStartRef.current = {
          elemX: el.position.x, elemY: el.position.y,
          pointerX: e.clientX, pointerY: e.clientY,
        };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }
    } else if (tool === "delete") {
      const updated = removeElement(featureId, el.id);
      if (updated) persistLayout(updated);
    }
  }, [tool, featureId, persistLayout, toggleSelection, selectSingle]);

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
    const map = new Map<string, { cal: PlantCalendar; shape: PlantShapeType; category: string; family?: PlantFamily; harvestStart?: number; harvestEnd?: number; name: string }>();
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
        family: sp?.family,
        harvestStart: sp?.harvest?.from ?? p.harvestStart ?? undefined,
        harvestEnd: sp?.harvest?.to ?? p.harvestEnd ?? undefined,
        name: sp?.name ?? p.name,
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
            family: sp.family,
            harvestStart: sp.harvest?.from,
            harvestEnd: sp.harvest?.to,
            name: sp.name,
          });
        }
      }
    }
    return map;
  }, [plants, layout.elements, calendarFromSpecies]);

  // ── Color-by helper: compute override colors for non-season modes ──
  const FAMILY_HEX: Record<string, string> = {
    solanaceae: "#ef4444", brassicaceae: "#22c55e", fabaceae: "#a855f7",
    cucurbitaceae: "#f59e0b", apiaceae: "#06b6d4", asteraceae: "#ec4899",
    amaryllidaceae: "#8b5cf6", poaceae: "#84cc16", lamiaceae: "#14b8a6",
    rosaceae: "#f43f5e", ranunculaceae: "#60a5fa", saxifragaceae: "#fb923c",
    paeoniaceae: "#e879f9", iridaceae: "#38bdf8", geraniaceae: "#f472b6",
    asparagaceae: "#34d399", boraginaceae: "#818cf8", caprifoliaceae: "#fbbf24",
    vitaceae: "#a78bfa", fagaceae: "#92400e", betulaceae: "#65a30d",
    other: "#94a3b8",
  };
  const CATEGORY_HEX: Record<string, string> = {
    vegetable: "#22c55e", fruit: "#f59e0b", herb: "#14b8a6",
    flower: "#ec4899", tree: "#92400e", bush: "#65a30d",
    perennial: "#8b5cf6", grass: "#84cc16", climber: "#06b6d4",
    "cover-crop": "#a3e635", "soil-amendment": "#78716c",
  };
  const HARVEST_MONTH_HEX: Record<number, string> = {
    1: "#93c5fd", 2: "#93c5fd", 3: "#86efac", 4: "#86efac",
    5: "#4ade80", 6: "#22c55e", 7: "#f59e0b", 8: "#f97316",
    9: "#ef4444", 10: "#dc2626", 11: "#a855f7", 12: "#6366f1",
  };

  function uniformPhaseColors(hex: string): PhaseColors {
    return { foliage: hex, stem: hex, accent: null, ground: hex };
  }

  /** Get PhaseColors for an element, respecting the current colorBy mode. */
  function getElementColors(speciesId: string | undefined, phase: GrowthPhase, category: string): PhaseColors {
    if (colorBy === "season" || !speciesId) {
      return getSeasonColors(phase, undefined, category);
    }
    const calEntry = speciesId ? plantCalendars.get(speciesId) : null;
    if (colorBy === "family") {
      const fam = calEntry?.family ?? "other";
      return uniformPhaseColors(FAMILY_HEX[fam] ?? FAMILY_HEX.other);
    }
    if (colorBy === "category") {
      const cat = calEntry?.category ?? category;
      return uniformPhaseColors(CATEGORY_HEX[cat] ?? "#94a3b8");
    }
    if (colorBy === "harvest") {
      const hStart = calEntry?.harvestStart;
      if (hStart) return uniformPhaseColors(HARVEST_MONTH_HEX[hStart] ?? "#94a3b8");
      return uniformPhaseColors("#d4d4d8");
    }
    return getSeasonColors(phase, undefined, category);
  }

  /** Build legend entries for current colorBy mode. */
  const colorByLegend = useMemo(() => {
    if (colorBy === "season") return null;
    const used = new Map<string, { label: string; hex: string }>();
    for (const el of layout.elements) {
      if (el.type !== "plant" || !el.speciesId) continue;
      const calEntry = plantCalendars.get(el.speciesId);
      if (!calEntry) continue;
      if (colorBy === "family") {
        const fam = calEntry.family ?? "other";
        if (!used.has(fam)) used.set(fam, {
          label: PLANT_FAMILY_LABELS[fam as PlantFamily] ?? fam,
          hex: FAMILY_HEX[fam] ?? FAMILY_HEX.other,
        });
      } else if (colorBy === "category") {
        const cat = calEntry.category;
        if (!used.has(cat)) used.set(cat, {
          label: PLANT_CATEGORY_LABELS[cat as keyof typeof PLANT_CATEGORY_LABELS] ?? cat,
          hex: CATEGORY_HEX[cat] ?? "#94a3b8",
        });
      } else if (colorBy === "harvest") {
        const h = calEntry.harvestStart;
        const key = h ? `month-${h}` : "none";
        if (!used.has(key)) used.set(key, {
          label: h ? MONTH_NAMES_DA[h] : "Ingen høst",
          hex: h ? (HARVEST_MONTH_HEX[h] ?? "#94a3b8") : "#d4d4d8",
        });
      }
    }
    return [...used.values()].sort((a, b) => a.label.localeCompare(b.label, "da"));
  }, [colorBy, layout.elements, plantCalendars]);

  // ── Export SVG → PNG ──
  const handleExportPng = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    // Set explicit size for rendering
    clone.setAttribute("width", String(layout.widthCm * 4));
    clone.setAttribute("height", String(layout.lengthCm * 4));
    // Remove transform (zoom/pan) from the clone
    const mainG = clone.querySelector("g");
    if (mainG) mainG.removeAttribute("transform");
    const svgData = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = layout.widthCm * 4;
      canvas.height = layout.lengthCm * 4;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(pngBlob);
        a.download = `${featureName.replace(/\s+/g, "_")}_${MONTH_NAMES_DA[month]}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    };
    img.src = url;
  }, [layout, month, featureName]);

  /** Export a text plant list */
  const handleExportPlantList = useCallback(() => {
    const lines: string[] = [`Bed-plan: ${featureName}`, `Størrelse: ${(layout.widthCm / 100).toFixed(1)}m × ${(layout.lengthCm / 100).toFixed(1)}m`, ""];
    const counts = new Map<string, { name: string; count: number; category: string }>();
    for (const el of layout.elements) {
      if (el.type !== "plant" || !el.speciesId) continue;
      const existing = counts.get(el.speciesId);
      if (existing) { existing.count++; continue; }
      const calEntry = plantCalendars.get(el.speciesId);
      counts.set(el.speciesId, { name: calEntry?.name ?? el.speciesId, count: 1, category: calEntry?.category ?? "?" });
    }
    lines.push("Planteliste:");
    for (const [, v] of [...counts.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, "da"))) {
      const catLabel = PLANT_CATEGORY_LABELS[v.category as keyof typeof PLANT_CATEGORY_LABELS] ?? v.category;
      lines.push(`  ${v.name} — ${v.count} stk (${catLabel})`);
    }
    lines.push("", `Genereret: ${new Date().toLocaleDateString("da-DK")}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${featureName.replace(/\s+/g, "_")}_planteliste.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [layout, featureName, plantCalendars]);

  // ── Dimension display ──
  const bedWidthM = (layout.widthCm / 100).toFixed(1);
  const bedLengthM = (layout.lengthCm / 100).toFixed(1);

  // ── Count stats ──
  const plantElements = layout.elements.filter((e) => e.type === "plant");
  const uniqueSpecies = new Set(plantElements.map((e) => e.speciesId).filter(Boolean));

  // ── Selected element info ──
  const selectedElement = selectedIds.size === 1 ? layout.elements.find((e) => selectedIds.has(e.id)) ?? null : null;
  const selectedSpecies = selectedElement?.speciesId ? getPlantById(selectedElement.speciesId) : null;

  // ── Cursor ──
  const canvasCursor = isPanning ? "grabbing"
    : draggingElementId ? "grabbing"
    : tool === "pan" ? "grab"
    : tool === "place" || tool === "row" ? "crosshair"
    : tool === "delete" ? "not-allowed"
    : "default";

  // ── Infrastructure elements for rendering ──
  const infraElements = layout.elements.filter((e) => e.type !== "plant" && e.type !== "row");

  // ── Sorted elements for zIndex ──
  const sortedPlantElements = useMemo(() => {
    const elems = layout.elements.filter((e) => e.type === "plant");
    return elems.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }, [layout.elements]);

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

        {/* Color-by mode selector */}
        <div className="flex items-center gap-1.5">
          <select
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as typeof colorBy)}
            className="text-[11px] px-2 py-1 rounded-lg border cursor-pointer"
            style={{
              borderColor: colorBy !== "season" ? "var(--accent)" : "var(--border)",
              background: colorBy !== "season" ? "var(--accent-light)" : "var(--toolbar-bg)",
              color: colorBy !== "season" ? "var(--accent)" : "var(--foreground)",
            }}
            title="Vælg farvning"
          >
            <option value="season">🕐 Sæson</option>
            <option value="family">🧬 Familie</option>
            <option value="category">📂 Kategori</option>
            <option value="harvest">🌾 Høsttid</option>
          </select>
        </div>

        {/* Export buttons */}
        <div className="flex gap-1">
          <button
            onClick={handleExportPng}
            className="px-2 py-1 text-[11px] rounded-lg border transition-colors hover:bg-[var(--accent-light)]"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            title="Download bed-plan som PNG-billede"
          >
            📷 Eksportér
          </button>
          <button
            onClick={handleExportPlantList}
            className="px-2 py-1 text-[11px] rounded-lg border transition-colors hover:bg-[var(--accent-light)]"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            title="Download planteliste som tekstfil"
          >
            📋 Planteliste
          </button>
        </div>

        {/* Compass / Rotation */}
        <div className="flex items-center gap-1.5">
          <div
            className="relative w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer select-none"
            style={{ borderColor: "var(--border)", background: "var(--toolbar-bg)" }}
            title={`Rotation: ${rotationDeg}°`}
            onClick={() => setRotationDeg((r) => (r + 45) % 360)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: `rotate(${rotationDeg}deg)`, transition: "transform 0.3s" }}>
              <polygon points="12,2 14,10 12,8 10,10" fill="#dc2626" opacity="0.9" />
              <polygon points="12,22 14,14 12,16 10,14" fill="var(--foreground)" opacity="0.4" />
              <line x1="12" y1="2" x2="12" y2="22" stroke="var(--foreground)" strokeWidth="0.5" opacity="0.2" />
              <line x1="2" y1="12" x2="22" y2="12" stroke="var(--foreground)" strokeWidth="0.5" opacity="0.2" />
              <text x="12" y="1.5" textAnchor="middle" fontSize="3.5" fill="#dc2626" fontWeight="bold"
                    style={{ transform: `rotate(${-rotationDeg}deg)`, transformOrigin: "12px 1.5px" }}>N</text>
            </svg>
          </div>
          <button
            onClick={() => setRotationDeg(0)}
            className="px-1.5 py-1 text-[9px] rounded border transition-colors hover:bg-[var(--accent-light)]"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            title="Nulstil rotation"
          >
            0°
          </button>
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
            { id: "ruler" as LabTool, label: "📏 Mål", shortcut: "M" },
          ]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTool(t.id);
              if (t.id === "place" || t.id === "row") setSidebarTab("palette");
              if (t.id !== "place" && t.id !== "row") { setPlacingSpeciesId(null); setGhostPos(null); setRowStart(null); }
              if (t.id !== "ruler") { setRulerStart(null); setRulerEnd(null); }
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

        {/* Undo / Redo */}
        <button
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          className="px-2 py-1 text-xs rounded-lg border disabled:opacity-30 transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          title="Fortryd (⌘Z)"
        >
          ↩
        </button>
        <button
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className="px-2 py-1 text-xs rounded-lg border disabled:opacity-30 transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          title="Gentag (⌘⇧Z)"
        >
          ↪
        </button>

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
        {placingInfraKind && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
               style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
            <span>🔧</span>
            <span>Placerer: {placingInfraKind}</span>
            <button onClick={() => { setPlacingInfraKind(null); setTool("select"); setGhostPos(null); }}
              className="ml-1 text-xs opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Season slider with month labels */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAutoPlay((a) => !a)}
            className="text-[11px] px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: autoPlay ? "var(--accent)" : "transparent",
              color: autoPlay ? "#fff" : "var(--muted)",
            }}
            title={autoPlay ? "Stop afspilning" : "Afspil sæsonforløb"}
          >
            {autoPlay ? "⏸" : "▶"}
          </button>
          <div className="flex flex-col items-center gap-0">
            <div className="flex items-center gap-1">
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                {MONTH_ICONS[month]} {MONTH_NAMES_DA[month]}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={12}
              value={month}
              onChange={(e) => { setMonth(Number(e.target.value)); setAutoPlay(false); }}
              className="w-36 accent-[var(--accent)]"
            />
            <div className="flex justify-between w-36 -mt-0.5">
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                <span
                  key={m}
                  className="text-[6px] cursor-pointer select-none"
                  style={{
                    color: m === month ? "var(--accent)" : "var(--muted)",
                    fontWeight: m === month ? 700 : 400,
                    opacity: m === month ? 1 : 0.6,
                  }}
                  onClick={() => { setMonth(m); setAutoPlay(false); }}
                >
                  {MONTH_NAMES_DA[m]?.slice(0, 1)}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />

        {/* Bed generator */}
        <button
          onClick={() => setShowBedGenerator(true)}
          className="px-2.5 py-1 text-[11px] rounded-lg border transition-colors hover:shadow-sm"
          style={{ borderColor: "var(--accent)", background: "var(--accent-light)", color: "var(--accent)" }}
          title="Generér et komplet bed med AI"
        >
          🪄 Generér bed
        </button>

        {/* Smart auto-fill with selected species */}
        <button
          onClick={() => {
            const speciesInBed = [...new Set(layout.elements.filter((e) => e.speciesId).map((e) => e.speciesId!))];
            const species = speciesInBed.map((id) => getPlantById(id)).filter((s): s is PlantSpecies => s != null);
            if (species.length === 0) {
              alert("Tilføj mindst én plante til paletten først.");
              return;
            }
            const result = autoFillBed(species, layout.widthCm, layout.lengthCm, layout.outlineCm, layout.elements);
            if (result.elements.length > 0) {
              const updated: BedLayout = {
                ...layout,
                elements: [...layout.elements, ...result.elements],
                version: layout.version + 1,
              };
              persistLayout(updated);
            }
            if (result.warnings.length > 0) alert(result.warnings.join("\n"));
          }}
          className="px-2.5 py-1 text-[11px] rounded-lg border transition-colors hover:shadow-sm"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          title="Auto-udfyld bed med eksisterende arter"
        >
          📐 Auto-fyld
        </button>

        {/* Companion lines toggle */}
        <button
          onClick={() => setShowCompanionLines((v) => !v)}
          className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors hover:shadow-sm ${showCompanionLines ? "shadow-sm" : ""}`}
          style={{
            borderColor: showCompanionLines ? "var(--accent)" : "var(--border)",
            background: showCompanionLines ? "var(--accent)" : "transparent",
            color: showCompanionLines ? "#fff" : "var(--foreground)",
          }}
          title="Vis companion-linjer (grøn = god, rød = dårlig)"
        >
          🤝 Companion
        </button>

        {/* Snap toggle (B7) */}
        <button
          onClick={() => setSnapEnabled((v) => !v)}
          className={`px-2.5 py-1 text-[11px] rounded-lg border transition-colors hover:shadow-sm ${snapEnabled ? "shadow-sm" : ""}`}
          style={{
            borderColor: snapEnabled ? "var(--accent)" : "var(--border)",
            background: snapEnabled ? "var(--accent)" : "transparent",
            color: snapEnabled ? "#fff" : "var(--foreground)",
          }}
          title="Grid-snap til/fra (G)"
        >
          🧲 Snap
        </button>

        {/* Align & distribute (only when multi-selected) */}
        {selectedIds.size >= 2 && (
          <>
            <div className="mx-1 h-5 w-px" style={{ background: "var(--border)" }} />
            {([
              { icon: "⬅", title: "Justér venstre", action: () => {
                const els = layout.elements.filter((e) => selectedIds.has(e.id));
                const minX = Math.min(...els.map((e) => e.position.x));
                const updated = { ...layout, elements: layout.elements.map((e) => selectedIds.has(e.id) ? { ...e, position: { ...e.position, x: minX } } : e), version: layout.version + 1 };
                persistLayout(updated);
              }},
              { icon: "↔", title: "Centrer horisontalt", action: () => {
                const els = layout.elements.filter((e) => selectedIds.has(e.id));
                const avgX = els.reduce((s, e) => s + e.position.x, 0) / els.length;
                const updated = { ...layout, elements: layout.elements.map((e) => selectedIds.has(e.id) ? { ...e, position: { ...e.position, x: avgX } } : e), version: layout.version + 1 };
                persistLayout(updated);
              }},
              { icon: "➡", title: "Justér højre", action: () => {
                const els = layout.elements.filter((e) => selectedIds.has(e.id));
                const maxX = Math.max(...els.map((e) => e.position.x));
                const updated = { ...layout, elements: layout.elements.map((e) => selectedIds.has(e.id) ? { ...e, position: { ...e.position, x: maxX } } : e), version: layout.version + 1 };
                persistLayout(updated);
              }},
              { icon: "⬆", title: "Justér top", action: () => {
                const els = layout.elements.filter((e) => selectedIds.has(e.id));
                const minY = Math.min(...els.map((e) => e.position.y));
                const updated = { ...layout, elements: layout.elements.map((e) => selectedIds.has(e.id) ? { ...e, position: { ...e.position, y: minY } } : e), version: layout.version + 1 };
                persistLayout(updated);
              }},
              { icon: "↕", title: "Centrer vertikalt", action: () => {
                const els = layout.elements.filter((e) => selectedIds.has(e.id));
                const avgY = els.reduce((s, e) => s + e.position.y, 0) / els.length;
                const updated = { ...layout, elements: layout.elements.map((e) => selectedIds.has(e.id) ? { ...e, position: { ...e.position, y: avgY } } : e), version: layout.version + 1 };
                persistLayout(updated);
              }},
              { icon: "⬇", title: "Justér bund", action: () => {
                const els = layout.elements.filter((e) => selectedIds.has(e.id));
                const maxY = Math.max(...els.map((e) => e.position.y));
                const updated = { ...layout, elements: layout.elements.map((e) => selectedIds.has(e.id) ? { ...e, position: { ...e.position, y: maxY } } : e), version: layout.version + 1 };
                persistLayout(updated);
              }},
            ] as const).map((btn) => (
              <button key={btn.title} onClick={btn.action}
                className="px-1.5 py-1 text-[11px] rounded border transition-colors hover:bg-[var(--accent-light)]"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                title={btn.title}>
                {btn.icon}
              </button>
            ))}
            {/* Distribute evenly */}
            {selectedIds.size >= 3 && (
              <>
                <button onClick={() => {
                  const els = layout.elements.filter((e) => selectedIds.has(e.id)).sort((a, b) => a.position.x - b.position.x);
                  if (els.length < 3) return;
                  const minX = els[0].position.x;
                  const maxX = els[els.length - 1].position.x;
                  const step = (maxX - minX) / (els.length - 1);
                  const idToX = new Map(els.map((e, i) => [e.id, minX + i * step]));
                  const updated = { ...layout, elements: layout.elements.map((e) => idToX.has(e.id) ? { ...e, position: { ...e.position, x: idToX.get(e.id)! } } : e), version: layout.version + 1 };
                  persistLayout(updated);
                }}
                  className="px-1.5 py-1 text-[11px] rounded border transition-colors hover:bg-[var(--accent-light)]"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  title="Fordel jævnt horisontalt">
                  ⇔
                </button>
                <button onClick={() => {
                  const els = layout.elements.filter((e) => selectedIds.has(e.id)).sort((a, b) => a.position.y - b.position.y);
                  if (els.length < 3) return;
                  const minY = els[0].position.y;
                  const maxY = els[els.length - 1].position.y;
                  const step = (maxY - minY) / (els.length - 1);
                  const idToY = new Map(els.map((e, i) => [e.id, minY + i * step]));
                  const updated = { ...layout, elements: layout.elements.map((e) => idToY.has(e.id) ? { ...e, position: { ...e.position, y: idToY.get(e.id)! } } : e), version: layout.version + 1 };
                  persistLayout(updated);
                }}
                  className="px-1.5 py-1 text-[11px] rounded border transition-colors hover:bg-[var(--accent-light)]"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  title="Fordel jævnt vertikalt">
                  ⇕
                </button>
              </>
            )}
          </>
        )}

        {/* Keyboard shortcuts legend */}
        <button
          onClick={() => setShowShortcuts((v) => !v)}
          className="px-2 py-1 text-[11px] rounded-lg border transition-colors hover:bg-[var(--accent-light)]"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          title="Vis tastatur-genveje"
        >
          ⌨ ?
        </button>
      </div>

      {/* ── Main area: Canvas + Sidebar ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          className="flex-1 relative flex items-center justify-center overflow-hidden"
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
            onContextMenu={(e) => e.preventDefault()}
            style={{
              maxWidth: "90%",
              maxHeight: "85%",
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px) rotate(${rotationDeg}deg)`,
              transition: isPanning || draggingElementId ? "none" : "transform 0.2s ease-out",
            }}
          >
            <defs>
              {/* Soil texture – realistic mulch/earth look */}
              <filter id="dlSoilNoise" x="0%" y="0%" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="4" seed="2" result="noise" />
                <feColorMatrix type="saturate" values="0.15" result="desat" />
                <feComponentTransfer result="dimmed">
                  <feFuncA type="linear" slope="0.12" />
                </feComponentTransfer>
                <feBlend in="SourceGraphic" in2="dimmed" mode="multiply" />
              </filter>
              <pattern id="dlSoilPattern" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
                <rect width="16" height="16" fill={GROUND_COLORS[month] ?? "#8B7355"} />
                {/* Organic matter specks */}
                <circle cx="3" cy="5" r="0.7" fill="#7a6545" opacity="0.5" />
                <circle cx="11" cy="3" r="0.5" fill="#9c8565" opacity="0.4" />
                <circle cx="7" cy="11" r="0.6" fill="#6a5535" opacity="0.45" />
                <circle cx="14" cy="9" r="0.4" fill="#8c7555" opacity="0.35" />
                <circle cx="1" cy="14" r="0.3" fill="#7a6545" opacity="0.3" />
                <circle cx="9" cy="7" r="0.35" fill="#a89575" opacity="0.25" />
                {/* Tiny root-like lines */}
                <line x1="5" y1="2" x2="6.5" y2="3" stroke="#6a5535" strokeWidth="0.2" opacity="0.3" />
                <line x1="12" y1="12" x2="14" y2="13.5" stroke="#6a5535" strokeWidth="0.15" opacity="0.25" />
              </pattern>
              {/* Glow filter */}
              <filter id="glow">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Shadow filter for depth */}
              <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
                <feDropShadow dx="0.5" dy="0.8" stdDeviation="1" floodOpacity="0.25" />
              </filter>
            </defs>

            {/* Bed outline */}
            <polygon
              points={layout.outlineCm.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="url(#dlSoilPattern)"
              filter="url(#dlSoilNoise)"
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

            {/* Perspectival shadows (A6) – rendered below plants */}
            <g>
              {sortedPlantElements.map((el) => {
                if (!el.speciesId) return null;
                const sp = getPlantById(el.speciesId);
                if (!sp) return null;
                const heightM = estimateHeightM(sp);
                if (!heightM || heightM < 0.5) return null; // only show shadow for plants ≥ 0.5m
                const cal = plantCalendars.get(el.speciesId);
                const phase = cal ? getPhase(cal.cal, month) : "growing";
                if (phase === "dormant") return null;
                const scale = getPhaseScale(phase);
                const spreadCm = el.width || sp.spreadDiameterCm || sp.spacingCm || 10;
                const r = (spreadCm / 2) * scale;
                // Shadow size proportional to plant height: taller = larger shadow
                const shadowScale = Math.min(heightM / 2, 3); // cap at 3× for very tall trees
                const shadowRx = r * (1 + shadowScale * 0.4);
                const shadowRy = r * (0.3 + shadowScale * 0.15);
                // Shadow offset (light from upper-left → shadow to lower-right)
                const shadowOffX = heightM * 1.5;
                const shadowOffY = heightM * 2;
                return (
                  <ellipse key={`shadow-${el.id}`}
                    cx={el.position.x + shadowOffX}
                    cy={el.position.y + shadowOffY}
                    rx={shadowRx} ry={shadowRy}
                    fill="#1a1a1a" opacity={0.08 + Math.min(heightM * 0.02, 0.07)}
                    transform={el.rotation ? `rotate(${el.rotation} ${el.position.x} ${el.position.y})` : undefined}
                  />
                );
              })}
            </g>

            {/* Plant elements (zIndex sorted) */}
            <g filter="url(#shadow)">
              {sortedPlantElements
                .map((el) => {
                  const cal = el.speciesId ? plantCalendars.get(el.speciesId) : null;
                  const phase = cal ? getPhase(cal.cal, month) : "growing";
                  const scale = getPhaseScale(phase);
                  const colors = getElementColors(el.speciesId, phase, cal?.category ?? "vegetable");
                  const shape = cal?.shape ?? "leafy";

                  return (
                    <g key={el.id} transform={el.rotation ? `rotate(${el.rotation} ${el.position.x} ${el.position.y})` : undefined}
                       onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); selectSingle(el.id); setContextMenu({ x: e.clientX, y: e.clientY, elementId: el.id }); }}>
                      <PlantShape
                        shape={shape}
                        x={el.position.x}
                        y={el.position.y}
                        phase={phase}
                        scale={scale}
                        colors={colors}
                        icon={el.icon ?? "🌱"}
                        viewMode={viewMode}
                        spreadCm={el.width || 10}
                        isSelected={selectedIds.has(el.id)}
                        onPointerDown={(e) => handleElementPointerDown(e, el)}
                        minRadius={minPlantRadius}
                      />
                    </g>
                  );
                })}
            </g>

            {/* Infrastructure elements (improved artwork) */}
            <g>
              {infraElements.map((el) => {
                const isInfraSelected = selectedIds.has(el.id);
                const infraColor = el.type === "water" ? "#3b82f6"
                  : el.type === "electric" ? "#f59e0b"
                  : el.type === "path" ? "#a8a29e"
                  : el.type === "edge" ? "#8B6914"
                  : "var(--foreground)";
                const halfW = (el.width || 20) / 2;
                const halfL = (el.length || 20) / 2;
                const kind = el.infrastructureKind ?? "";

                return (
                  <g key={el.id}
                     transform={`translate(${el.position.x},${el.position.y})${el.rotation ? ` rotate(${el.rotation})` : ""}`}
                     onClick={(e) => { e.stopPropagation(); if (e.shiftKey) toggleSelection(el.id); else selectSingle(el.id); }}
                     onPointerDown={(e) => handleElementPointerDown(e, el)}
                     onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); selectSingle(el.id); setContextMenu({ x: e.clientX, y: e.clientY, elementId: el.id }); }}
                     style={{ cursor: tool === "select" ? "pointer" : tool === "delete" ? "not-allowed" : undefined }}
                  >
                    {/* Water infrastructure */}
                    {el.type === "water" && kind === "drip-line" && (
                      <>
                        <path
                          d={`M${-halfW},0 ${Array.from({length: Math.floor(halfW * 2 / 6)}, (_, i) =>
                            `Q${-halfW + i * 6 + 3},${i % 2 === 0 ? -2.5 : 2.5} ${-halfW + (i + 1) * 6},0`
                          ).join(" ")}`}
                          stroke={infraColor} strokeWidth={1.5} fill="none" opacity={0.7}
                          strokeLinecap="round"
                        />
                        {/* Water drops along the line */}
                        {Array.from({length: Math.floor(halfW * 2 / 12)}, (_, i) => (
                          <circle key={`wd${i}`}
                            cx={-halfW + 6 + i * 12} cy={3}
                            r={1} fill={infraColor} opacity={0.4 + (i % 3) * 0.15}
                          />
                        ))}
                      </>
                    )}
                    {el.type === "water" && kind !== "drip-line" && (
                      <>
                        <circle cx={0} cy={0} r={Math.min(halfW, halfL) * 0.8}
                          fill={infraColor} fillOpacity={0.12}
                          stroke={infraColor} strokeWidth={0.8} />
                        <text x={0} y={0} textAnchor="middle" dominantBaseline="central"
                          fontSize={Math.min(halfW, halfL, 8)}>
                          {el.icon ?? "💧"}
                        </text>
                      </>
                    )}

                    {/* Path / stepping stones */}
                    {el.type === "path" && kind === "stepping" && (
                      <>
                        {[{x: -6, y: -4, r: 5.5}, {x: 3, y: 2, r: 6}, {x: -2, y: 8, r: 5}].map((s, i) => (
                          <ellipse key={`step${i}`}
                            cx={s.x} cy={s.y} rx={s.r} ry={s.r * 0.85}
                            fill="#b8b0a0" stroke="#9a9285" strokeWidth={0.5}
                            opacity={0.7} />
                        ))}
                      </>
                    )}
                    {el.type === "path" && kind !== "stepping" && (
                      <>
                        <rect x={-halfW} y={-halfL} width={el.width || 20} height={el.length || 20}
                          rx={halfL * 0.3} fill="#c8c0b0" fillOpacity={0.25}
                          stroke="#a8a098" strokeWidth={0.8} />
                        {/* Gravel dots */}
                        {Array.from({length: 6}, (_, i) => (
                          <circle key={`grav${i}`}
                            cx={-halfW + 4 + (i % 3) * ((el.width || 20) / 3)}
                            cy={-halfL + 4 + Math.floor(i / 3) * ((el.length || 20) / 2.5)}
                            r={0.8} fill="#908878" opacity={0.3} />
                        ))}
                      </>
                    )}

                    {/* Edge / timber */}
                    {el.type === "edge" && (
                      <>
                        <rect x={-halfW} y={-halfL} width={el.width || 20} height={el.length || 20}
                          rx={1}
                          fill={kind === "stone-edge" ? "#a09888" : "#A0845C"}
                          fillOpacity={0.5} />
                        {/* Wood grain lines for timber */}
                        {kind !== "stone-edge" && Array.from({length: Math.floor((el.width || 20) / 8)}, (_, i) => (
                          <line key={`grain${i}`}
                            x1={-halfW + 4 + i * 8} y1={-halfL + 1}
                            x2={-halfW + 4 + i * 8} y2={halfL - 1}
                            stroke="#8B6914" strokeWidth={0.3} opacity={0.35} />
                        ))}
                        {/* Stone blocks */}
                        {kind === "stone-edge" && Array.from({length: Math.floor((el.width || 20) / 10)}, (_, i) => (
                          <rect key={`stone${i}`}
                            x={-halfW + 1 + i * 10} y={-halfL + 1}
                            width={8} height={(el.length || 8) - 2}
                            rx={1} fill="#b0a898" fillOpacity={0.4}
                            stroke="#908878" strokeWidth={0.3} />
                        ))}
                      </>
                    )}

                    {/* Electric */}
                    {el.type === "electric" && (
                      <>
                        <rect x={-halfW} y={-halfL} width={el.width || 20} height={el.length || 20}
                          rx={2} fill={infraColor} fillOpacity={0.1}
                          stroke={infraColor} strokeWidth={0.8}
                          strokeDasharray="2 3" opacity={0.8} />
                        <text x={0} y={0} textAnchor="middle" dominantBaseline="central"
                          fontSize={Math.min(halfW, halfL, 8)}>
                          {el.icon ?? "⚡"}
                        </text>
                      </>
                    )}

                    {/* Label */}
                    {el.type === "label" && (
                      <>
                        <rect x={-halfW} y={-halfL} width={el.width || 20} height={el.length || 20}
                          rx={2} fill="var(--accent-light, #e8f5e9)" fillOpacity={0.4}
                          stroke="var(--border)" strokeWidth={0.5} />
                        <text x={0} y={0} textAnchor="middle" dominantBaseline="central"
                          fontSize={Math.min(halfW * 0.5, 5)}
                          fill="var(--foreground)" opacity={0.8}>
                          {el.label ?? el.icon ?? "🏷️"}
                        </text>
                      </>
                    )}

                    {/* Label text below */}
                    {el.label && el.type !== "label" && (
                      <text
                        x={0} y={halfL + 4}
                        textAnchor="middle"
                        fontSize="3.5"
                        fill="var(--muted, #8a8578)"
                        opacity={0.7}
                      >
                        {el.label}
                      </text>
                    )}
                    {/* Selection ring */}
                    {isInfraSelected && (
                      <rect
                        x={-halfW - 2} y={-halfL - 2}
                        width={(el.width || 20) + 4} height={(el.length || 20) + 4}
                        rx={3}
                        fill="none"
                        stroke="var(--accent, #2d7a3a)"
                        strokeWidth={0.8}
                        strokeDasharray="2 1"
                        opacity={0.9}
                      />
                    )}
                  </g>
                );
              })}
            </g>

            {/* Rotation handles for selected elements */}
            {selectedIds.size === 1 && tool === "select" && (() => {
              const selEl = layout.elements.find((e) => selectedIds.has(e.id));
              if (!selEl) return null;
              const handleDist = Math.max((selEl.width || 10) * 0.7 + 6, 14);
              const handleR = Math.max(2.5, minPlantRadius * 0.4);
              return (
                <g transform={`translate(${selEl.position.x},${selEl.position.y})${selEl.rotation ? ` rotate(${selEl.rotation})` : ""}`}>
                  {/* Stem line from element center to rotation handle */}
                  <line x1={0} y1={0} x2={0} y2={-handleDist}
                    stroke="var(--accent, #2d7a3a)" strokeWidth={0.6} opacity={0.5}
                    strokeDasharray="2 1" />
                  {/* Rotation handle (circle) */}
                  <circle cx={0} cy={-handleDist} r={handleR}
                    fill="var(--accent, #2d7a3a)" fillOpacity={0.2}
                    stroke="var(--accent, #2d7a3a)" strokeWidth={0.8}
                    style={{ cursor: "grab" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const pos = svgPointFromEvent(e);
                      if (!pos) return;
                      const dx = pos.x - selEl.position.x;
                      const dy = pos.y - selEl.position.y;
                      const startAngle = Math.atan2(dx, -dy) * (180 / Math.PI);
                      setRotatingElementId(selEl.id);
                      rotateStartRef.current = { startAngle, elemRotation: selEl.rotation };
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    }}
                  />
                  {/* Rotation icon */}
                  <text x={0} y={-handleDist + 0.3} textAnchor="middle" dominantBaseline="central"
                    fontSize={handleR * 1.2} style={{ pointerEvents: "none" }}>
                    🔄
                  </text>
                  {/* Rotation degree label */}
                  {selEl.rotation !== 0 && (
                    <text x={handleR + 2} y={-handleDist}
                      fontSize={Math.max(3, handleR * 0.8)} fill="var(--accent, #2d7a3a)"
                      dominantBaseline="central" style={{ pointerEvents: "none" }}>
                      {selEl.rotation}°
                    </text>
                  )}
                </g>
              );
            })()}

            {/* Companion planting lines (D4) */}
            {showCompanionLines && (() => {
              const lines: React.ReactNode[] = [];
              const plantEls = layout.elements.filter((e) => e.type === "plant" && e.speciesId);
              const maxDist = Math.max(layout.widthCm, layout.lengthCm) * 0.4; // only show for nearby plants
              for (let i = 0; i < plantEls.length; i++) {
                const a = plantEls[i];
                const spA = a.speciesId ? getPlantById(a.speciesId) : null;
                if (!spA) continue;
                for (let j = i + 1; j < plantEls.length; j++) {
                  const b = plantEls[j];
                  if (a.speciesId === b.speciesId) continue; // skip same species
                  const dx = b.position.x - a.position.x;
                  const dy = b.position.y - a.position.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist > maxDist) continue;
                  const spB = b.speciesId ? getPlantById(b.speciesId) : null;
                  if (!spB) continue;
                  const isGood = spA.goodCompanions?.includes(spB.id) || spB.goodCompanions?.includes(spA.id);
                  const isBad = spA.badCompanions?.includes(spB.id) || spB.badCompanions?.includes(spA.id);
                  if (!isGood && !isBad) continue;
                  lines.push(
                    <line key={`comp-${a.id}-${b.id}`}
                      x1={a.position.x} y1={a.position.y}
                      x2={b.position.x} y2={b.position.y}
                      stroke={isGood ? "#22c55e" : "#ef4444"}
                      strokeWidth={Math.max(0.8, minPlantRadius * 0.1)}
                      strokeDasharray={isGood ? "4 2" : "3 3"}
                      opacity={0.45}
                    />
                  );
                }
              }
              return lines.length > 0 ? <g>{lines}</g> : null;
            })()}

            {/* Snap guides */}
            {activeGuides.length > 0 && (
              <g>
                {activeGuides.map((g, i) => (
                  <line key={i}
                    x1={g.x1} y1={g.y1}
                    x2={Math.min(g.x2, layout.widthCm)} y2={Math.min(g.y2, layout.lengthCm)}
                    stroke="var(--accent, #2d7a3a)"
                    strokeWidth={0.5}
                    strokeDasharray="3 2"
                    opacity={0.6}
                  />
                ))}
              </g>
            )}

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

            {/* Ruler tool (B4) */}
            {tool === "ruler" && (() => {
              const rEnd = rulerEnd ?? ghostPos;
              if (!rulerStart || !rEnd) return null;
              const dx = rEnd.x - rulerStart.x;
              const dy = rEnd.y - rulerStart.y;
              const distCm = Math.sqrt(dx * dx + dy * dy);
              const distLabel = distCm >= 100 ? `${(distCm / 100).toFixed(2)} m` : `${distCm.toFixed(1)} cm`;
              const mx = (rulerStart.x + rEnd.x) / 2;
              const my = (rulerStart.y + rEnd.y) / 2;
              // Perpendicular offset for label
              const len = Math.max(distCm, 0.01);
              const nx = -dy / len * 4;
              const ny = dx / len * 4;
              // Tick end marks perpendicular to the line
              const tickLen = 3;
              const tx = -dy / len * tickLen;
              const ty = dx / len * tickLen;
              return (
                <g>
                  {/* Measurement line */}
                  <line x1={rulerStart.x} y1={rulerStart.y} x2={rEnd.x} y2={rEnd.y}
                    stroke="#f59e0b" strokeWidth={0.8} strokeDasharray="4 2" opacity={0.9} />
                  {/* Start point */}
                  <circle cx={rulerStart.x} cy={rulerStart.y} r={1.5} fill="#f59e0b" opacity={0.9} />
                  {/* End point */}
                  <circle cx={rEnd.x} cy={rEnd.y} r={1.5} fill="#f59e0b" opacity={0.9} />
                  {/* Start tick */}
                  <line x1={rulerStart.x - tx} y1={rulerStart.y - ty}
                    x2={rulerStart.x + tx} y2={rulerStart.y + ty}
                    stroke="#f59e0b" strokeWidth={0.6} opacity={0.8} />
                  {/* End tick */}
                  <line x1={rEnd.x - tx} y1={rEnd.y - ty}
                    x2={rEnd.x + tx} y2={rEnd.y + ty}
                    stroke="#f59e0b" strokeWidth={0.6} opacity={0.8} />
                  {/* Distance label background */}
                  <rect x={mx + nx - distLabel.length * 1.3} y={my + ny - 3}
                    width={distLabel.length * 2.6} height={6}
                    rx={1.5} fill="rgba(0,0,0,0.7)" />
                  {/* Distance label */}
                  <text x={mx + nx} y={my + ny + 1}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize="3.5" fontWeight="600" fill="#f59e0b">
                    {distLabel}
                  </text>
                </g>
              );
            })()}

            {/* Ghost preview for single placement */}
            {tool === "place" && ghostPos && placingSpecies && pointInBedOutline(ghostPos, layout.outlineCm) && (
              <PlantShape shape={guessPlantShape(placingSpecies)} x={ghostPos.x} y={ghostPos.y}
                phase="growing" scale={0.75}
                colors={getSeasonColors("growing", undefined, placingSpecies.category ?? "vegetable")}
                icon={placingSpecies.icon ?? "🌱"} viewMode={viewMode}
                spreadCm={placingSpecies.spreadDiameterCm ?? placingSpecies.spacingCm ?? 10}
                opacity={0.4} minRadius={minPlantRadius} />
            )}
            {/* Ghost preview for infrastructure placement */}
            {tool === "place" && ghostPos && placingInfraKind && pointInBedOutline(ghostPos, layout.outlineCm) && (
              <g transform={`translate(${ghostPos.x},${ghostPos.y})`} opacity={0.4}>
                <rect x={-10} y={-10} width={20} height={20} rx={3}
                  fill="var(--accent)" fillOpacity={0.2}
                  stroke="var(--accent)" strokeWidth={0.8} strokeDasharray="3 2" />
                <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize="8">🔧</text>
              </g>
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

            {/* Lasso selection rectangle */}
            {lassoRect && (
              <rect
                x={lassoRect.x1}
                y={lassoRect.y1}
                width={lassoRect.x2 - lassoRect.x1}
                height={lassoRect.y2 - lassoRect.y1}
                fill="var(--accent, #2d7a3a)"
                fillOpacity={0.08}
                stroke="var(--accent, #2d7a3a)"
                strokeWidth={0.6}
                strokeDasharray="3 2"
                rx={1}
              />
            )}

            {/* Scale bar */}
            {(() => {
              // Find a nice round cm value for the scale bar
              const barTargetPx = 60; // target width in SVG units
              const niceSteps = [5, 10, 20, 25, 50, 100, 200, 500];
              const barCm = niceSteps.find((s) => s >= barTargetPx * 0.5) ?? 50;
              const barWidth = barCm;
              const bx = layout.widthCm - barCm - 5;
              const by = layout.lengthCm + 10;
              const barLabel = barCm >= 100 ? `${barCm / 100} m` : `${barCm} cm`;
              return (
                <g>
                  <line x1={bx} y1={by} x2={bx + barWidth} y2={by}
                    stroke="var(--foreground, #333)" strokeWidth={0.8} />
                  <line x1={bx} y1={by - 2} x2={bx} y2={by + 2}
                    stroke="var(--foreground, #333)" strokeWidth={0.5} />
                  <line x1={bx + barWidth} y1={by - 2} x2={bx + barWidth} y2={by + 2}
                    stroke="var(--foreground, #333)" strokeWidth={0.5} />
                  <text x={bx + barWidth / 2} y={by + 6}
                    textAnchor="middle" fontSize="3.5"
                    fill="var(--muted, #8a8578)" fontWeight="500">
                    {barLabel}
                  </text>
                </g>
              );
            })()}
          </svg>

          {/* Minimap overview (C2) – shown when zoomed in */}
          {zoom > 1.2 && (() => {
            const mmW = 140;
            const aspect = layout.lengthCm / layout.widthCm;
            const mmH = mmW * aspect;
            // Viewport rectangle in minimap coordinates
            const vbParts = viewBox.split(" ").map(Number);
            const [vbX, vbY, vbW, vbH] = vbParts;
            const scaleX = mmW / layout.widthCm;
            const scaleY = mmH / layout.lengthCm;
            const vpX = (vbX + 15) * scaleX; // offset by margin
            const vpY = (vbY + 15) * scaleY;
            const vpW = vbW * scaleX;
            const vpH = vbH * scaleY;
            return (
              <div className="absolute bottom-3 left-3 rounded-lg shadow-lg border overflow-hidden"
                style={{
                  width: mmW, height: Math.min(mmH, 120),
                  background: "var(--sidebar-bg, #fff)",
                  borderColor: "var(--border)",
                  opacity: 0.85,
                  pointerEvents: "none",
                }}>
                <svg viewBox={`0 0 ${layout.widthCm} ${layout.lengthCm}`}
                  width={mmW} height={Math.min(mmH, 120)}
                  preserveAspectRatio="xMidYMid meet">
                  {/* Bed outline */}
                  <polygon
                    points={layout.outlineCm.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={GROUND_COLORS[month] ?? "#8B7355"}
                    stroke="var(--border)" strokeWidth={2}
                  />
                  {/* Plant dots */}
                  {sortedPlantElements.map((el) => (
                    <circle key={`mm-${el.id}`}
                      cx={el.position.x} cy={el.position.y}
                      r={Math.max(2, (el.width || 10) / 4)}
                      fill="var(--accent, #2d7a3a)" opacity={0.6}
                    />
                  ))}
                  {/* Viewport rectangle */}
                  <rect
                    x={vpX / scaleX} y={vpY / scaleY}
                    width={vpW / scaleX} height={vpH / scaleY}
                    fill="var(--accent)" fillOpacity={0.1}
                    stroke="var(--accent)" strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                </svg>
              </div>
            );
          })()}

          {/* Context menu (floating) */}
          {contextMenu && (
            <div
              className="fixed z-50 min-w-[140px] rounded-lg shadow-lg border py-1"
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
                background: "var(--sidebar-bg, #fff)",
                borderColor: "var(--border)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {[
                { label: "📋 Kopiér", action: () => {
                  const els = layout.elements.filter((el) => selectedIds.has(el.id));
                  if (els.length > 0) setClipboard(els);
                  setContextMenu(null);
                }},
                { label: "📑 Duplikér", action: () => {
                  const els = layout.elements.filter((el) => selectedIds.has(el.id));
                  if (els.length === 0) { setContextMenu(null); return; }
                  const dupes = els.map((el) => ({
                    ...el,
                    id: crypto.randomUUID(),
                    position: { x: el.position.x + 6, y: el.position.y + 6 },
                  }));
                  const updated = {
                    ...layout,
                    elements: [...layout.elements, ...dupes],
                    version: layout.version + 1,
                  };
                  persistLayout(updated);
                  const newIds = new Set(dupes.map((el) => el.id));
                  setSelectedIds(newIds);
                  setSelectedElementId(newIds.size === 1 ? [...newIds][0] : null);
                  setContextMenu(null);
                }},
                { label: "🗑 Slet", action: () => {
                  let updated = layout;
                  for (const id of selectedIds) {
                    const next = removeElement(featureId, id);
                    if (next) updated = next;
                  }
                  if (updated !== layout) persistLayout(updated);
                  clearSelection();
                  setContextMenu(null);
                }},
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-black/5 transition-colors"
                  style={{ color: "var(--foreground)" }}
                >
                  {item.label}
                </button>
              ))}
              {selectedIds.size > 1 && (
                <div className="border-t mx-2 my-1" style={{ borderColor: "var(--border)" }} />
              )}
              {selectedIds.size > 1 && (
                <div className="px-3 py-1 text-[9px]" style={{ color: "var(--muted)" }}>
                  {selectedIds.size} elementer valgt
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div
          className="w-[280px] border-l flex flex-col overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--sidebar-bg)" }}
        >
          {/* Sidebar tabs */}
          <div className="flex border-b overflow-x-auto" style={{ borderColor: "var(--border)" }}>
            {([
              { id: "palette" as const, label: "🌱 Planter" },
              { id: "info" as const, label: "📊 Info" },
              { id: "timeline" as const, label: "📅 Tidslinje" },
              { id: "rotation" as const, label: "🔄 Rotation" },
              { id: "ai" as const, label: "🤖 AI" },
            ]).map((tab) => (
              <button key={tab.id} onClick={() => setSidebarTab(tab.id)}
                className="flex-1 px-1.5 py-2 text-[10px] font-medium transition-colors whitespace-nowrap"
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

              {/* Infrastructure palette */}
              <div className="mt-4">
                <p className="text-[9px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
                  🔧 Infrastruktur
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { kind: "drip-line",   icon: "💧", label: "Drypslange" },
                    { kind: "sprinkler",   icon: "🚿", label: "Sprinkler" },
                    { kind: "tap",         icon: "🚰", label: "Vandhane" },
                    { kind: "cable",       icon: "⚡", label: "Kabel" },
                    { kind: "socket",      icon: "🔌", label: "Stik" },
                    { kind: "stepping",    icon: "🪨", label: "Trædesten" },
                    { kind: "walkway",     icon: "🛤️", label: "Gangsti" },
                    { kind: "timber-edge", icon: "🪵", label: "Trækant" },
                    { kind: "stone-edge",  icon: "🧱", label: "Stenkant" },
                    { kind: "label",       icon: "🏷️", label: "Mærkat" },
                  ].map((item) => (
                    <button key={item.kind}
                      onClick={() => startPlacingInfra(item.kind)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left text-[10px] transition-colors ${
                        placingInfraKind === item.kind ? "shadow-sm" : "hover:bg-[var(--accent-light)]"
                      }`}
                      style={{
                        borderColor: placingInfraKind === item.kind ? "var(--accent)" : "var(--border)",
                        background: placingInfraKind === item.kind ? "var(--accent-light)" : "transparent",
                        color: "var(--foreground)",
                      }}>
                      <span className="text-sm">{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
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

                {/* Re-import from map button */}
                <button
                  onClick={() => {
                    if (!confirm("Genimportér alle rækker fra kortet? Eksisterende placeringer i Design Lab erstattes.")) return;
                    const elements: BedElement[] = [];
                    const rowSpacing = 25;
                    const edgeMargin = 12;
                    plants.forEach((p, rowIdx) => {
                      const rowY = edgeMargin + rowIdx * rowSpacing;
                      if (rowY > layout.lengthCm - edgeMargin) return;
                      const startX = edgeMargin + (p.spacingCm || 10);
                      const availWidth = layout.widthCm - edgeMargin * 2 - (p.spacingCm || 10);
                      const count = Math.min(p.count || 1, Math.max(1, Math.floor(availWidth / Math.max(p.spacingCm || 10, 3))));
                      for (let i = 0; i < count; i++) {
                        const x = startX + i * (availWidth / Math.max(count, 1));
                        elements.push({
                          id: crypto.randomUUID(), type: "plant",
                          position: { x, y: rowY }, rotation: 0,
                          width: p.spreadCm || 10, length: p.spreadCm || 10,
                          speciesId: p.speciesId, instanceId: p.id, count: 1,
                          spacingCm: p.spacingCm, icon: p.icon, label: p.name,
                        });
                      }
                    });
                    if (elements.length > 0) {
                      persistLayout({ ...layout, elements, version: layout.version + 1 });
                    }
                  }}
                  className="w-full px-2.5 py-1.5 text-[10px] rounded-lg border transition-colors hover:bg-[var(--accent-light)]"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  title="Genimportér alle rækker fra kortet"
                >
                  🔄 Genimportér rækker fra kort ({plants.length} rækker)
                </button>
              </div>

              {/* Selected element details */}
              {selectedIds.size > 1 && (
                <div className="mb-3 p-2.5 rounded-lg border" style={{ borderColor: "var(--accent)", background: "var(--accent-light)" }}>
                  <h4 className="text-xs font-semibold mb-1" style={{ color: "var(--accent)" }}>
                    ✏️ {selectedIds.size} elementer valgt
                  </h4>
                  <div className="text-[11px] space-y-1" style={{ color: "var(--foreground)" }}>
                    <p className="text-[10px]" style={{ color: "var(--muted)" }}>
                      Shift+klik for at til-/fravælge. ⌘C kopiér, ⌘V indsæt, ⌘D duplikér, Delete slet.
                    </p>
                  </div>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => {
                      const els = layout.elements.filter((el) => selectedIds.has(el.id));
                      if (els.length > 0) setClipboard(els);
                    }}
                      className="flex-1 px-2 py-1 rounded text-[10px] border transition-colors hover:bg-[var(--accent-light)]"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                      📋 Kopiér
                    </button>
                    <button onClick={() => {
                      const els = layout.elements.filter((el) => selectedIds.has(el.id));
                      const dupes = els.map((el) => ({
                        ...el,
                        id: crypto.randomUUID(),
                        position: { x: el.position.x + 6, y: el.position.y + 6 },
                      }));
                      persistLayout({
                        ...layout,
                        elements: [...layout.elements, ...dupes],
                        version: layout.version + 1,
                      });
                      setSelectedIds(new Set(dupes.map((d) => d.id)));
                    }}
                      className="flex-1 px-2 py-1 rounded text-[10px] border transition-colors hover:bg-[var(--accent-light)]"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                      📑 Duplikér
                    </button>
                    <button onClick={() => {
                      let updated = layout;
                      for (const id of selectedIds) {
                        const next = removeElement(featureId, id);
                        if (next) updated = next;
                      }
                      if (updated !== layout) persistLayout(updated);
                      clearSelection();
                    }}
                      className="px-2 py-1 rounded text-[10px] border transition-colors hover:bg-red-50"
                      style={{ borderColor: "#f87171", color: "#dc2626" }}>
                      🗑
                    </button>
                  </div>
                </div>
              )}
              {selectedElement && selectedIds.size === 1 && (
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
                    clearSelection();
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

          {/* ── Timeline tab ── */}
          {sidebarTab === "timeline" && (
            <div className="flex-1 overflow-y-auto sidebar-scroll p-3">
              <h3 className="text-xs font-semibold mb-2" style={{ color: "var(--accent)" }}>
                📅 Sæsontidslinje
              </h3>
              <p className="text-[9px] mb-3" style={{ color: "var(--muted)" }}>
                Klik på en måned for at ændre sæsonvisningen.
              </p>
              <SeasonTimeline
                elements={layout.elements}
                plants={plants}
                currentMonth={month}
                onMonthChange={setMonth}
                calendarFromSpecies={calendarFromSpecies}
              />
            </div>
          )}

          {/* ── Rotation tab ── */}
          {sidebarTab === "rotation" && (
            <div className="flex-1 overflow-y-auto sidebar-scroll p-3">
              <SuccessionView
                elements={layout.elements}
                featureName={featureName}
              />
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
                ["Infrastruktur", `${infraElements.length}`],
                ["Størrelse", `${bedWidthM}m × ${bedLengthM}m`],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between">
                  <span style={{ color: "var(--muted)" }}>{label}</span>
                  <span style={{ color: "var(--foreground)" }}>{val}</span>
                </div>
              ))}
            </div>
            {/* Color-by legend */}
            {colorByLegend && colorByLegend.length > 0 && (
              <div className="mt-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                <h4 className="text-xs font-semibold mb-1.5" style={{ color: "var(--accent)" }}>
                  {colorBy === "family" ? "🧬 Familier" : colorBy === "category" ? "📂 Kategorier" : "🌾 Høsttid"}
                </h4>
                <div className="space-y-0.5">
                  {colorByLegend.map((entry) => (
                    <div key={entry.label} className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: entry.hex }}
                      />
                      <span style={{ color: "var(--foreground)" }}>{entry.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Keyboard Shortcuts Legend ── */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center"
             style={{ background: "rgba(0,0,0,0.35)" }}
             onClick={() => setShowShortcuts(false)}>
          <div className="rounded-2xl shadow-2xl border p-5 max-w-md w-full mx-4"
               style={{ background: "var(--sidebar-bg, #fff)", borderColor: "var(--border)" }}
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: "var(--foreground)" }}>⌨ Tastatur-genveje</h3>
              <button onClick={() => setShowShortcuts(false)}
                className="text-lg leading-none px-2 py-0.5 rounded hover:bg-black/5"
                style={{ color: "var(--muted)" }}>✕</button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]" style={{ color: "var(--foreground)" }}>
              {([
                ["V", "Vælg-værktøj"],
                ["P", "Placér-værktøj"],
                ["R", "Række-værktøj"],
                ["H", "Panorér (hånd)"],
                ["D", "Slet-værktøj"],
                ["M", "Mål-værktøj (lineal)"],
                ["G", "Grid snap til/fra"],
                ["Esc", "Annullér / Luk"],
                ["⌘A", "Vælg alle"],
                ["⌘C", "Kopiér"],
                ["⌘V", "Indsæt"],
                ["⌘D", "Duplikér"],
                ["⌘Z", "Fortryd"],
                ["⌘⇧Z", "Gentag"],
                ["Delete", "Slet valgte"],
                ["Shift+klik", "Multi-select"],
                ["Alt+klik", "Panorér"],
                ["Scroll", "Zoom ind/ud"],
                ["?", "Denne dialog"],
                ["Lasso-træk", "Område-valg"],
              ] as const).map(([key, desc]) => (
                <div key={key} className="flex items-center gap-2">
                  <kbd className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono border min-w-[28px] text-center"
                    style={{ background: "var(--toolbar-bg)", borderColor: "var(--border)", color: "var(--accent)" }}>
                    {key}
                  </kbd>
                  <span style={{ color: "var(--muted)" }}>{desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10px] text-center" style={{ color: "var(--muted)" }}>
              Tryk <kbd className="px-1 py-0.5 rounded text-[9px] border"
                style={{ background: "var(--toolbar-bg)", borderColor: "var(--border)" }}>Esc</kbd> eller klik udenfor for at lukke
            </p>
          </div>
        </div>
      )}

      {/* ── Bed Generator Dialog ── */}
      {showBedGenerator && (
        <BedGeneratorDialog
          bedWidthCm={layout.widthCm}
          bedLengthCm={layout.lengthCm}
          outlineCm={layout.outlineCm}
          existingElements={layout.elements}
          onApply={(newElements, description) => {
            const updated: BedLayout = {
              ...layout,
              elements: [...layout.elements, ...newElements],
              version: layout.version + 1,
            };
            persistLayout(updated);
            setShowBedGenerator(false);
          }}
          onClose={() => setShowBedGenerator(false)}
        />
      )}
    </div>
  );
}

const DesignLab = memo(DesignLabInner);
export default DesignLab;
