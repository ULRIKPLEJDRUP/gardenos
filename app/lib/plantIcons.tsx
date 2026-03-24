// ---------------------------------------------------------------------------
// GardenOS – SVG Plant Icon Library (A8)
// ---------------------------------------------------------------------------
// Unique inline-SVG icons for every plant species. Each icon is a simple
// colourful illustration designed to be recognisable at small sizes (≥ 12 px)
// inside the Design Lab SVG canvas.
//
// Usage:
//   import { getPlantSvgIcon } from "./plantIcons";
//   const Icon = getPlantSvgIcon("radise"); // returns SVG JSX or null
//
// All icons render inside a 0 0 32 32 viewBox and use no external deps.
// ---------------------------------------------------------------------------

import React from "react";
import ReactDOMServer from "react-dom/server";

/** Render an SVG plant icon into an SVG <g> at (0,0) in a 32×32 coordinate space */
export type PlantSvgIcon = (props: { size?: number }) => React.ReactElement;

// ═══════════════════════════════════════════════════════════════════════════
// Icon definitions keyed by plant id
// ═══════════════════════════════════════════════════════════════════════════

const icons: Record<string, PlantSvgIcon> = {

  // ─── Rodfrugter ─────────────────────────────────────────────────────────
  gulerod: () => (
    <g>
      <polygon points="16,30 12,12 20,12" fill="#F57C00" />
      <line x1="14" y1="13" x2="13" y2="15" stroke="#E65100" strokeWidth="0.8" />
      <line x1="18" y1="14" x2="17" y2="16" stroke="#E65100" strokeWidth="0.8" />
      <path d="M14 12 Q12 6 10 4" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <path d="M16 11 Q16 5 16 3" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <path d="M18 12 Q20 6 22 4" stroke="#43A047" strokeWidth="1.5" fill="none" />
    </g>
  ),

  pastinak: () => (
    <g>
      <polygon points="16,30 12,12 20,12" fill="#FFF9C4" />
      <line x1="14" y1="14" x2="13" y2="16" stroke="#F9A825" strokeWidth="0.6" />
      <path d="M14 12 Q12 6 10 4" stroke="#66BB6A" strokeWidth="1.5" fill="none" />
      <path d="M16 11 Q16 5 16 3" stroke="#66BB6A" strokeWidth="1.5" fill="none" />
      <path d="M18 12 Q20 6 22 4" stroke="#66BB6A" strokeWidth="1.5" fill="none" />
    </g>
  ),

  roedbed: () => (
    <g>
      <circle cx="16" cy="20" r="9" fill="#880E4F" />
      <circle cx="16" cy="20" r="7" fill="#AD1457" />
      <ellipse cx="16" cy="20" rx="3" ry="6" fill="#C2185B" opacity="0.4" />
      <line x1="16" y1="12" x2="16" y2="5" stroke="#4CAF50" strokeWidth="1.5" />
      <path d="M16 7 Q12 5 10 6" stroke="#4CAF50" strokeWidth="1.2" fill="none" />
      <path d="M16 7 Q20 5 22 6" stroke="#4CAF50" strokeWidth="1.2" fill="none" />
      <path d="M13 22 Q16 15 19 22" fill="none" stroke="#E91E63" strokeWidth="0.5" opacity="0.5" />
    </g>
  ),

  radise: () => (
    <g>
      <ellipse cx="16" cy="20" rx="7" ry="8" fill="#E53935" />
      <ellipse cx="16" cy="24" rx="5" ry="4" fill="#FFCDD2" />
      <path d="M16 28 Q16 31 17 31" stroke="#BDBDBD" strokeWidth="0.8" fill="none" />
      <line x1="16" y1="12" x2="16" y2="6" stroke="#43A047" strokeWidth="1.5" />
      <ellipse cx="13" cy="7" rx="4" ry="3" fill="#66BB6A" />
      <ellipse cx="19" cy="7" rx="4" ry="3" fill="#43A047" />
    </g>
  ),

  kartoffel: () => (
    <g>
      <ellipse cx="16" cy="18" rx="10" ry="8" fill="#8D6E63" />
      <ellipse cx="16" cy="18" rx="8" ry="6" fill="#A1887F" />
      <circle cx="12" cy="16" r="1" fill="#6D4C41" opacity="0.6" />
      <circle cx="19" cy="15" r="0.8" fill="#6D4C41" opacity="0.5" />
      <circle cx="15" cy="20" r="0.7" fill="#6D4C41" opacity="0.5" />
      <circle cx="20" cy="19" r="0.9" fill="#6D4C41" opacity="0.4" />
    </g>
  ),

  majroe: () => (
    <g>
      <circle cx="16" cy="20" r="9" fill="#E8EAF6" />
      <path d="M7 18 Q16 12 25 18" fill="#7B1FA2" />
      <circle cx="16" cy="20" r="6" fill="#E8EAF6" opacity="0.4" />
      <line x1="16" y1="11" x2="16" y2="5" stroke="#4CAF50" strokeWidth="1.5" />
      <path d="M16 7 Q13 4 10 5" stroke="#4CAF50" strokeWidth="1" fill="none" />
      <path d="M16 7 Q19 4 22 5" stroke="#4CAF50" strokeWidth="1" fill="none" />
    </g>
  ),

  knoldselleri: () => (
    <g>
      <circle cx="16" cy="21" r="8" fill="#BCAAA4" />
      <circle cx="16" cy="21" r="6" fill="#D7CCC8" />
      <path d="M12 19 Q16 17 20 19" fill="none" stroke="#8D6E63" strokeWidth="0.5" />
      <line x1="16" y1="13" x2="14" y2="4" stroke="#388E3C" strokeWidth="1.5" />
      <line x1="16" y1="13" x2="18" y2="5" stroke="#43A047" strokeWidth="1.5" />
      <path d="M14 5 Q12 3 11 4" stroke="#388E3C" strokeWidth="1" fill="none" />
      <path d="M18 6 Q20 3 21 5" stroke="#43A047" strokeWidth="1" fill="none" />
    </g>
  ),

  jordskokke: () => (
    <g>
      <ellipse cx="16" cy="22" rx="7" ry="6" fill="#D7CCC8" transform="rotate(-15 16 22)" />
      <ellipse cx="13" cy="24" rx="4" ry="3" fill="#BCAAA4" />
      <ellipse cx="19" cy="20" rx="3" ry="4" fill="#BCAAA4" />
      <line x1="16" y1="16" x2="16" y2="5" stroke="#66BB6A" strokeWidth="1.5" />
      <circle cx="16" cy="4" r="3" fill="#FFD54F" />
      <circle cx="16" cy="4" r="1.5" fill="#F9A825" />
    </g>
  ),

  peberrod: () => (
    <g>
      <polygon points="16,8 13,28 19,28" fill="#FFF9C4" />
      <polygon points="16,8 14,28 12,30" fill="#F5F5DC" />
      <line x1="15" y1="14" x2="14" y2="18" stroke="#FFF176" strokeWidth="0.5" opacity="0.6" />
      <path d="M16 8 Q14 4 12 3" stroke="#4CAF50" strokeWidth="1.2" fill="none" />
      <path d="M16 8 Q18 4 20 3" stroke="#66BB6A" strokeWidth="1.2" fill="none" />
    </g>
  ),

  skorzoner: () => (
    <g>
      <polygon points="16,6 14,30 18,30" fill="#3E2723" />
      <polygon points="16,6 14.5,30 15.5,30" fill="#4E342E" opacity="0.6" />
      <path d="M16 6 Q13 3 11 4" stroke="#66BB6A" strokeWidth="1.2" fill="none" />
      <path d="M16 6 Q19 3 21 4" stroke="#43A047" strokeWidth="1.2" fill="none" />
    </g>
  ),

  // ─── Kålvarianter ───────────────────────────────────────────────────────
  broccoli: () => (
    <g>
      <rect x="14" y="20" width="4" height="10" rx="1" fill="#81C784" />
      <circle cx="16" cy="15" r="8" fill="#2E7D32" />
      <circle cx="13" cy="13" r="4" fill="#388E3C" />
      <circle cx="19" cy="13" r="4" fill="#43A047" />
      <circle cx="16" cy="11" r="3.5" fill="#388E3C" />
      <circle cx="16" cy="16" r="3" fill="#2E7D32" />
    </g>
  ),

  blomkaal: () => (
    <g>
      <rect x="14" y="22" width="4" height="8" rx="1" fill="#A5D6A7" />
      <circle cx="16" cy="16" r="8" fill="#FFF8E1" />
      <circle cx="13" cy="14" r="4" fill="#FFFDE7" />
      <circle cx="19" cy="14" r="4" fill="#FFF9C4" />
      <circle cx="16" cy="12" r="3.5" fill="#FFFDE7" />
      <path d="M8 18 Q6 14 8 12" stroke="#4CAF50" strokeWidth="1.5" fill="none" />
      <path d="M24 18 Q26 14 24 12" stroke="#4CAF50" strokeWidth="1.5" fill="none" />
    </g>
  ),

  hvidkaal: () => (
    <g>
      <circle cx="16" cy="16" r="11" fill="#C8E6C9" />
      <circle cx="16" cy="16" r="8" fill="#A5D6A7" />
      <path d="M10 16 Q16 10 22 16 Q16 22 10 16Z" fill="#81C784" opacity="0.6" />
      <path d="M16 8 Q18 16 16 24" fill="none" stroke="#66BB6A" strokeWidth="0.5" />
    </g>
  ),

  groenkaal: () => (
    <g>
      <rect x="14.5" y="22" width="3" height="8" rx="1" fill="#558B2F" />
      <path d="M8 20 Q6 14 10 8 Q14 12 16 6 Q18 12 22 8 Q26 14 24 20Z" fill="#33691E" />
      <path d="M10 18 Q8 14 11 10" fill="none" stroke="#1B5E20" strokeWidth="0.8" />
      <path d="M22 18 Q24 14 21 10" fill="none" stroke="#1B5E20" strokeWidth="0.8" />
      {/* Curly leaf edges */}
      <path d="M8 19 Q7 17 9 16 Q7 14 9 13" fill="none" stroke="#2E7D32" strokeWidth="0.6" />
      <path d="M24 19 Q25 17 23 16 Q25 14 23 13" fill="none" stroke="#2E7D32" strokeWidth="0.6" />
    </g>
  ),

  kaalrabi: () => (
    <g>
      <circle cx="16" cy="20" r="8" fill="#C5E1A5" />
      <circle cx="16" cy="20" r="6" fill="#AED581" />
      <line x1="16" y1="12" x2="14" y2="5" stroke="#388E3C" strokeWidth="1.5" />
      <line x1="16" y1="12" x2="18" y2="4" stroke="#43A047" strokeWidth="1.5" />
      <line x1="16" y1="12" x2="16" y2="3" stroke="#4CAF50" strokeWidth="1.5" />
      <ellipse cx="14" cy="5" rx="3" ry="2" fill="#66BB6A" />
      <ellipse cx="18" cy="4" rx="3" ry="2" fill="#4CAF50" />
    </g>
  ),

  spidskaal: () => (
    <g>
      <ellipse cx="16" cy="16" rx="7" ry="12" fill="#A5D6A7" />
      <ellipse cx="16" cy="16" rx="5" ry="10" fill="#C8E6C9" />
      <path d="M16 4 Q17 16 16 28" fill="none" stroke="#66BB6A" strokeWidth="0.5" />
      <path d="M12 8 Q16 12 20 8" fill="none" stroke="#81C784" strokeWidth="0.4" />
      <path d="M11 14 Q16 18 21 14" fill="none" stroke="#81C784" strokeWidth="0.4" />
    </g>
  ),

  rosenkaal: () => (
    <g>
      <rect x="15" y="4" width="2" height="24" rx="1" fill="#558B2F" />
      <circle cx="12" cy="24" r="3" fill="#66BB6A" />
      <circle cx="20" cy="22" r="3" fill="#4CAF50" />
      <circle cx="12" cy="18" r="2.5" fill="#66BB6A" />
      <circle cx="20" cy="16" r="2.5" fill="#4CAF50" />
      <circle cx="12" cy="12" r="2" fill="#81C784" />
      <circle cx="20" cy="10" r="2" fill="#66BB6A" />
      <path d="M14 4 Q12 2 10 3" stroke="#43A047" strokeWidth="1" fill="none" />
      <path d="M18 4 Q20 2 22 3" stroke="#66BB6A" strokeWidth="1" fill="none" />
    </g>
  ),

  "pak-choi": () => (
    <g>
      <path d="M12 28 Q10 20 12 14 Q16 10 20 14 Q22 20 20 28Z" fill="#F5F5F5" />
      <ellipse cx="16" cy="10" rx="7" ry="5" fill="#43A047" />
      <ellipse cx="16" cy="10" rx="5" ry="3.5" fill="#66BB6A" />
      <path d="M16 7 Q16 12 16 15" fill="none" stroke="#E8F5E9" strokeWidth="0.5" />
    </g>
  ),

  kinakaal: () => (
    <g>
      <ellipse cx="16" cy="16" rx="7" ry="12" fill="#F1F8E9" />
      <ellipse cx="16" cy="16" rx="5" ry="10" fill="#DCEDC8" />
      <path d="M13 6 Q16 16 13 26" fill="none" stroke="#AED581" strokeWidth="0.6" />
      <path d="M19 6 Q16 16 19 26" fill="none" stroke="#AED581" strokeWidth="0.6" />
      <path d="M16 4 Q16 16 16 28" fill="none" stroke="#C5E1A5" strokeWidth="0.4" />
    </g>
  ),

  // ─── Bladgrøntsager ─────────────────────────────────────────────────────
  salat: () => (
    <g>
      <circle cx="16" cy="16" r="10" fill="#81C784" />
      <circle cx="16" cy="15" r="7" fill="#A5D6A7" />
      <circle cx="16" cy="14" r="4" fill="#C8E6C9" />
      <path d="M10 18 Q14 14 12 10" fill="none" stroke="#66BB6A" strokeWidth="0.6" />
      <path d="M22 18 Q18 14 20 10" fill="none" stroke="#66BB6A" strokeWidth="0.6" />
    </g>
  ),

  spinat: () => (
    <g>
      <ellipse cx="12" cy="18" rx="5" ry="7" fill="#2E7D32" transform="rotate(-15 12 18)" />
      <ellipse cx="20" cy="18" rx="5" ry="7" fill="#388E3C" transform="rotate(15 20 18)" />
      <ellipse cx="16" cy="14" rx="4" ry="6" fill="#43A047" />
      <path d="M12 14 Q12 22 12 25" fill="none" stroke="#1B5E20" strokeWidth="0.5" />
      <path d="M20 14 Q20 22 20 25" fill="none" stroke="#1B5E20" strokeWidth="0.5" />
    </g>
  ),

  mangold: () => (
    <g>
      <ellipse cx="12" cy="14" rx="5" ry="8" fill="#388E3C" transform="rotate(-10 12 14)" />
      <ellipse cx="20" cy="14" rx="5" ry="8" fill="#43A047" transform="rotate(10 20 14)" />
      <line x1="12" y1="14" x2="12" y2="28" stroke="#E53935" strokeWidth="2" />
      <line x1="20" y1="14" x2="20" y2="28" stroke="#E53935" strokeWidth="2" />
      <line x1="16" y1="12" x2="16" y2="28" stroke="#F44336" strokeWidth="2" />
      <path d="M12 12 Q12 18 12 22" fill="none" stroke="#C62828" strokeWidth="0.5" />
    </g>
  ),

  rucola: () => (
    <g>
      <path d="M16 28 L12 18 Q10 14 12 10 L16 6 L20 10 Q22 14 20 18Z" fill="#558B2F" />
      <path d="M16 28 L14 20 Q13 16 14 12 L16 8" fill="none" stroke="#33691E" strokeWidth="0.6" />
      <path d="M14 16 Q12 14 10 15" fill="none" stroke="#558B2F" strokeWidth="0.8" />
      <path d="M18 16 Q20 14 22 15" fill="none" stroke="#558B2F" strokeWidth="0.8" />
    </g>
  ),

  portulak: () => (
    <g>
      <ellipse cx="16" cy="16" rx="3" ry="2" fill="#66BB6A" />
      <ellipse cx="12" cy="14" rx="3" ry="2" fill="#4CAF50" transform="rotate(-30 12 14)" />
      <ellipse cx="20" cy="14" rx="3" ry="2" fill="#43A047" transform="rotate(30 20 14)" />
      <ellipse cx="12" cy="20" rx="3" ry="2" fill="#66BB6A" transform="rotate(-20 12 20)" />
      <ellipse cx="20" cy="20" rx="3" ry="2" fill="#4CAF50" transform="rotate(20 20 20)" />
      <line x1="16" y1="16" x2="16" y2="28" stroke="#795548" strokeWidth="1" />
    </g>
  ),

  feldsalat: () => (
    <g>
      <ellipse cx="13" cy="18" rx="4" ry="2.5" fill="#388E3C" transform="rotate(-25 13 18)" />
      <ellipse cx="19" cy="18" rx="4" ry="2.5" fill="#43A047" transform="rotate(25 19 18)" />
      <ellipse cx="16" cy="15" rx="3.5" ry="2.5" fill="#2E7D32" />
      <ellipse cx="11" cy="22" rx="3.5" ry="2" fill="#4CAF50" transform="rotate(-15 11 22)" />
      <ellipse cx="21" cy="22" rx="3.5" ry="2" fill="#388E3C" transform="rotate(15 21 22)" />
    </g>
  ),

  vinterportulak: () => (
    <g>
      <ellipse cx="16" cy="14" rx="3" ry="2" fill="#4CAF50" />
      <ellipse cx="12" cy="18" rx="3" ry="2" fill="#66BB6A" transform="rotate(-20 12 18)" />
      <ellipse cx="20" cy="18" rx="3" ry="2" fill="#4CAF50" transform="rotate(20 20 18)" />
      <ellipse cx="14" cy="22" rx="3" ry="2" fill="#81C784" />
      <ellipse cx="18" cy="22" rx="3" ry="2" fill="#66BB6A" />
      <circle cx="16" cy="10" r="1.5" fill="#FFFFFF" />
    </g>
  ),

  // ─── Løgfamilien ────────────────────────────────────────────────────────
  loeg: () => (
    <g>
      <ellipse cx="16" cy="20" rx="9" ry="8" fill="#FFE082" />
      <ellipse cx="16" cy="20" rx="7" ry="6" fill="#FFD54F" />
      <path d="M12 18 Q16 14 20 18" fill="none" stroke="#F9A825" strokeWidth="0.5" />
      <line x1="16" y1="12" x2="16" y2="5" stroke="#66BB6A" strokeWidth="1.5" />
      <path d="M16 28 Q16 30 18 30" stroke="#BCAAA4" strokeWidth="0.6" fill="none" />
    </g>
  ),

  hvidloeg: () => (
    <g>
      <ellipse cx="16" cy="20" rx="8" ry="8" fill="#F5F5F5" />
      <path d="M10 20 Q12 14 16 12 Q20 14 22 20 Q20 26 16 28 Q12 26 10 20Z" fill="#EEEEEE" />
      <path d="M16 12 Q16 20 16 28" fill="none" stroke="#E0E0E0" strokeWidth="0.5" />
      <path d="M11 18 Q16 16 21 18" fill="none" stroke="#E0E0E0" strokeWidth="0.5" />
      <line x1="16" y1="12" x2="16" y2="6" stroke="#8D6E63" strokeWidth="1.2" />
      <path d="M14 6 Q16 4 18 6" fill="none" stroke="#8D6E63" strokeWidth="0.8" />
    </g>
  ),

  porre: () => (
    <g>
      <rect x="14" y="14" width="4" height="16" rx="1" fill="#F5F5F5" />
      <rect x="14" y="22" width="4" height="8" rx="1" fill="#E8EAF6" />
      <path d="M12 14 Q10 8 8 4" stroke="#2E7D32" strokeWidth="2" fill="none" />
      <path d="M16 12 Q16 6 16 2" stroke="#388E3C" strokeWidth="2" fill="none" />
      <path d="M20 14 Q22 8 24 4" stroke="#43A047" strokeWidth="2" fill="none" />
    </g>
  ),

  skalotte: () => (
    <g>
      <ellipse cx="12" cy="22" rx="5" ry="5" fill="#CE93D8" />
      <ellipse cx="20" cy="22" rx="5" ry="5" fill="#BA68C8" />
      <line x1="12" y1="17" x2="12" y2="10" stroke="#66BB6A" strokeWidth="1" />
      <line x1="20" y1="17" x2="20" y2="10" stroke="#4CAF50" strokeWidth="1" />
    </g>
  ),

  foraarsloeg: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="4" stroke="#F5F5F5" strokeWidth="3" />
      <line x1="16" y1="14" x2="16" y2="4" stroke="#43A047" strokeWidth="3" />
      <ellipse cx="16" cy="29" rx="4" ry="2" fill="#F5F5F5" />
      <path d="M16 4 Q14 2 12 3" stroke="#388E3C" strokeWidth="1" fill="none" />
      <path d="M16 6 Q18 3 20 4" stroke="#4CAF50" strokeWidth="1" fill="none" />
    </g>
  ),

  pibeloeg: () => (
    <g>
      <line x1="14" y1="30" x2="14" y2="8" stroke="#43A047" strokeWidth="2" />
      <line x1="18" y1="30" x2="18" y2="6" stroke="#388E3C" strokeWidth="2" />
      <circle cx="14" cy="5" r="3" fill="#CE93D8" />
      <circle cx="18" cy="4" r="2.5" fill="#AB47BC" />
    </g>
  ),

  // ─── Natskyggefamilien ──────────────────────────────────────────────────
  tomat: () => (
    <g>
      <circle cx="16" cy="18" r="9" fill="#E53935" />
      <circle cx="16" cy="18" r="7" fill="#EF5350" />
      <path d="M12 16 Q16 14 20 16" fill="none" stroke="#C62828" strokeWidth="0.5" opacity="0.4" />
      <path d="M14 5 Q16 8 18 5" fill="#43A047" stroke="#2E7D32" strokeWidth="0.5" />
      <line x1="16" y1="8" x2="16" y2="10" stroke="#33691E" strokeWidth="1" />
    </g>
  ),

  peber: () => (
    <g>
      <path d="M10 14 Q10 8 16 6 Q22 8 22 14 L20 26 Q16 28 12 26Z" fill="#F44336" />
      <path d="M12 14 Q12 10 16 8 Q20 10 20 14 L18 24 Q16 25 14 24Z" fill="#EF5350" opacity="0.5" />
      <rect x="15" y="3" width="2" height="4" rx="0.5" fill="#388E3C" />
    </g>
  ),

  chili: () => (
    <g>
      <path d="M14 8 Q12 16 10 26 Q10 28 12 28 Q14 28 16 18 Q18 28 20 28 Q22 28 22 26 Q20 16 18 8Z" fill="#D32F2F" />
      <path d="M15 8 Q14 16 13 24" fill="none" stroke="#B71C1C" strokeWidth="0.5" />
      <rect x="14.5" y="4" width="3" height="4" rx="1" fill="#2E7D32" />
    </g>
  ),

  aubergine: () => (
    <g>
      <ellipse cx="16" cy="18" rx="7" ry="10" fill="#4A148C" />
      <ellipse cx="16" cy="18" rx="5" ry="8" fill="#6A1B9A" />
      <ellipse cx="14" cy="16" rx="2" ry="5" fill="#7B1FA2" opacity="0.4" />
      <path d="M12 8 Q16 6 20 8" fill="#2E7D32" />
      <line x1="16" y1="8" x2="16" y2="5" stroke="#33691E" strokeWidth="1.2" />
    </g>
  ),

  // ─── Agurk-familien ─────────────────────────────────────────────────────
  agurk: () => (
    <g>
      <ellipse cx="16" cy="16" rx="5" ry="12" fill="#2E7D32" />
      <ellipse cx="16" cy="16" rx="3.5" ry="10" fill="#388E3C" />
      <circle cx="15" cy="10" r="0.5" fill="#1B5E20" opacity="0.3" />
      <circle cx="17" cy="14" r="0.5" fill="#1B5E20" opacity="0.3" />
      <circle cx="15" cy="18" r="0.5" fill="#1B5E20" opacity="0.3" />
      <circle cx="17" cy="22" r="0.5" fill="#1B5E20" opacity="0.3" />
    </g>
  ),

  squash: () => (
    <g>
      <ellipse cx="16" cy="18" rx="10" ry="7" fill="#F9A825" />
      <ellipse cx="16" cy="18" rx="8" ry="5.5" fill="#FDD835" />
      <path d="M8 18 Q16 14 24 18" fill="none" stroke="#F57F17" strokeWidth="0.6" opacity="0.4" />
      <path d="M16 18 Q16 12 16 10" fill="none" stroke="#F57F17" strokeWidth="0.6" />
      <rect x="15" y="8" width="2" height="3" rx="1" fill="#33691E" />
    </g>
  ),

  graeskar: () => (
    <g>
      <ellipse cx="16" cy="18" rx="11" ry="9" fill="#E65100" />
      <ellipse cx="12" cy="18" rx="5" ry="8" fill="#EF6C00" opacity="0.6" />
      <ellipse cx="20" cy="18" rx="5" ry="8" fill="#F57C00" opacity="0.6" />
      <path d="M16 10 Q16 6 18 4" stroke="#33691E" strokeWidth="1.5" fill="none" />
      <path d="M18 5 Q20 4 22 6" stroke="#43A047" strokeWidth="1" fill="none" />
    </g>
  ),

  vandmelon: () => (
    <g>
      <ellipse cx="16" cy="16" rx="12" ry="10" fill="#2E7D32" />
      <path d="M4 16 Q16 6 28 16" fill="#388E3C" />
      <ellipse cx="16" cy="16" rx="9" ry="7" fill="#E53935" />
      <circle cx="13" cy="15" r="0.8" fill="#1B5E20" />
      <circle cx="18" cy="14" r="0.8" fill="#1B5E20" />
      <circle cx="15" cy="18" r="0.8" fill="#1B5E20" />
      <circle cx="19" cy="17" r="0.8" fill="#1B5E20" />
    </g>
  ),

  // ─── Bælgfrugter ────────────────────────────────────────────────────────
  aert: () => (
    <g>
      <path d="M8 16 Q8 10 16 8 Q24 10 24 16 Q24 22 16 24 Q8 22 8 16Z" fill="#66BB6A" />
      <circle cx="12" cy="16" r="2.5" fill="#81C784" />
      <circle cx="16" cy="16" r="2.5" fill="#A5D6A7" />
      <circle cx="20" cy="16" r="2.5" fill="#81C784" />
    </g>
  ),

  boenner: () => (
    <g>
      <path d="M10 8 Q8 16 10 24 Q12 26 14 24 Q16 16 14 8 Q12 6 10 8Z" fill="#43A047" />
      <path d="M18 6 Q16 14 18 22 Q20 24 22 22 Q24 14 22 6 Q20 4 18 6Z" fill="#388E3C" />
    </g>
  ),

  storboenne: () => (
    <g>
      <ellipse cx="16" cy="16" rx="5" ry="8" fill="#8D6E63" />
      <ellipse cx="16" cy="16" rx="3.5" ry="6" fill="#A1887F" />
      <path d="M16 8 Q17 16 16 24" fill="none" stroke="#6D4C41" strokeWidth="0.6" />
    </g>
  ),

  sukkeraert: () => (
    <g>
      <path d="M10 14 Q8 8 14 6 Q20 6 22 12 Q24 18 20 24 Q14 26 10 20Z" fill="#81C784" />
      <path d="M12 12 Q16 10 20 12" fill="none" stroke="#4CAF50" strokeWidth="0.4" />
      <circle cx="14" cy="16" r="2" fill="#A5D6A7" />
      <circle cx="18" cy="15" r="2" fill="#C8E6C9" />
    </g>
  ),

  // ─── Andre grøntsager ───────────────────────────────────────────────────
  selleri: () => (
    <g>
      <rect x="13" y="16" width="2.5" height="14" rx="0.5" fill="#C8E6C9" />
      <rect x="16.5" y="16" width="2.5" height="14" rx="0.5" fill="#A5D6A7" />
      <path d="M13 16 Q12 10 10 6" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <line x1="16" y1="14" x2="16" y2="4" stroke="#4CAF50" strokeWidth="1.5" />
      <path d="M19 16 Q20 10 22 6" stroke="#388E3C" strokeWidth="1.5" fill="none" />
      <ellipse cx="10" cy="6" rx="2.5" ry="1.5" fill="#66BB6A" />
      <ellipse cx="22" cy="6" rx="2.5" ry="1.5" fill="#4CAF50" />
    </g>
  ),

  fennikel: () => (
    <g>
      <ellipse cx="16" cy="24" rx="8" ry="5" fill="#F5F5F5" />
      <ellipse cx="16" cy="24" rx="6" ry="3.5" fill="#EEEEEE" />
      <path d="M14 20 Q12 12 8 4" stroke="#66BB6A" strokeWidth="1" fill="none" />
      <path d="M16 19 Q16 10 16 2" stroke="#4CAF50" strokeWidth="1" fill="none" />
      <path d="M18 20 Q20 12 24 4" stroke="#43A047" strokeWidth="1" fill="none" />
      {/* Feathery fronds */}
      <path d="M12 12 Q10 11 9 12" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <path d="M20 12 Q22 11 23 12" stroke="#81C784" strokeWidth="0.5" fill="none" />
    </g>
  ),

  rabarber: () => (
    <g>
      <line x1="11" y1="28" x2="11" y2="12" stroke="#C62828" strokeWidth="3" />
      <line x1="16" y1="28" x2="16" y2="10" stroke="#D32F2F" strokeWidth="3" />
      <line x1="21" y1="28" x2="21" y2="12" stroke="#E53935" strokeWidth="3" />
      <ellipse cx="11" cy="10" rx="5" ry="4" fill="#2E7D32" />
      <ellipse cx="16" cy="8" rx="5" ry="4" fill="#388E3C" />
      <ellipse cx="21" cy="10" rx="5" ry="4" fill="#43A047" />
    </g>
  ),

  asparges: () => (
    <g>
      <rect x="14" y="8" width="4" height="22" rx="1.5" fill="#66BB6A" />
      <ellipse cx="16" cy="8" rx="3" ry="2" fill="#4CAF50" />
      <ellipse cx="16" cy="6" rx="2" ry="1.5" fill="#388E3C" />
      <path d="M14 14 Q12 13 11 14" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <path d="M18 16 Q20 15 21 16" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <path d="M14 20 Q12 19 11 20" stroke="#81C784" strokeWidth="0.5" fill="none" />
    </g>
  ),

  majs: () => (
    <g>
      <ellipse cx="16" cy="16" rx="5" ry="10" fill="#FDD835" />
      <ellipse cx="16" cy="16" rx="3.5" ry="8" fill="#FFEE58" />
      {/* Corn kernels pattern */}
      <circle cx="14" cy="12" r="1.2" fill="#FBC02D" />
      <circle cx="18" cy="12" r="1.2" fill="#FBC02D" />
      <circle cx="14" cy="16" r="1.2" fill="#F9A825" />
      <circle cx="18" cy="16" r="1.2" fill="#F9A825" />
      <circle cx="14" cy="20" r="1.2" fill="#FBC02D" />
      <circle cx="18" cy="20" r="1.2" fill="#FBC02D" />
      {/* Husk leaves */}
      <path d="M11 10 Q8 6 6 4" stroke="#66BB6A" strokeWidth="1.5" fill="none" />
      <path d="M21 10 Q24 6 26 4" stroke="#4CAF50" strokeWidth="1.5" fill="none" />
      {/* Silk */}
      <path d="M16 6 Q14 3 12 2" stroke="#8D6E63" strokeWidth="0.6" fill="none" />
      <path d="M16 6 Q18 3 20 2" stroke="#A1887F" strokeWidth="0.6" fill="none" />
    </g>
  ),

  artiskok: () => (
    <g>
      <ellipse cx="16" cy="16" rx="8" ry="10" fill="#558B2F" />
      {/* Overlapping scale-leaves */}
      <path d="M8 20 Q12 18 16 22 Q12 22 8 20Z" fill="#689F38" />
      <path d="M24 20 Q20 18 16 22 Q20 22 24 20Z" fill="#7CB342" />
      <path d="M10 15 Q14 12 16 16 Q12 16 10 15Z" fill="#689F38" />
      <path d="M22 15 Q18 12 16 16 Q20 16 22 15Z" fill="#7CB342" />
      <path d="M12 10 Q16 6 20 10" fill="#8BC34A" />
      <rect x="15" y="22" width="2" height="8" rx="0.5" fill="#33691E" />
    </g>
  ),

  // ─── Urter ──────────────────────────────────────────────────────────────
  purloeg: () => (
    <g>
      <line x1="12" y1="30" x2="12" y2="10" stroke="#388E3C" strokeWidth="1.5" />
      <line x1="15" y1="30" x2="15" y2="8" stroke="#43A047" strokeWidth="1.5" />
      <line x1="18" y1="30" x2="18" y2="9" stroke="#4CAF50" strokeWidth="1.5" />
      <line x1="21" y1="30" x2="21" y2="11" stroke="#66BB6A" strokeWidth="1.5" />
      <circle cx="15" cy="5" r="3" fill="#CE93D8" />
      <circle cx="18" cy="6" r="2.5" fill="#AB47BC" />
    </g>
  ),

  basilikum: () => (
    <g>
      <ellipse cx="12" cy="14" rx="5" ry="4" fill="#2E7D32" transform="rotate(-10 12 14)" />
      <ellipse cx="20" cy="14" rx="5" ry="4" fill="#388E3C" transform="rotate(10 20 14)" />
      <ellipse cx="10" cy="20" rx="4.5" ry="3.5" fill="#43A047" transform="rotate(-15 10 20)" />
      <ellipse cx="22" cy="20" rx="4.5" ry="3.5" fill="#2E7D32" transform="rotate(15 22 20)" />
      <line x1="16" y1="10" x2="16" y2="28" stroke="#33691E" strokeWidth="1.5" />
    </g>
  ),

  persille: () => (
    <g>
      <path d="M16 28 L16 14" stroke="#33691E" strokeWidth="1.5" />
      <path d="M16 14 Q12 10 8 10 Q10 6 14 8 Q14 4 18 4 Q18 8 22 8 Q24 12 20 14" fill="#43A047" />
      <path d="M14 12 Q12 8 10 9" fill="none" stroke="#2E7D32" strokeWidth="0.5" />
      <path d="M18 12 Q20 8 22 9" fill="none" stroke="#2E7D32" strokeWidth="0.5" />
    </g>
  ),

  dild: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="8" stroke="#558B2F" strokeWidth="1.2" />
      {/* Feathery leaves */}
      <path d="M16 18 Q12 14 8 14" stroke="#66BB6A" strokeWidth="0.6" fill="none" />
      <path d="M16 18 Q20 14 24 14" stroke="#66BB6A" strokeWidth="0.6" fill="none" />
      <path d="M16 22 Q13 20 10 20" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <path d="M16 22 Q19 20 22 20" stroke="#81C784" strokeWidth="0.5" fill="none" />
      {/* Flower head */}
      <circle cx="12" cy="6" r="1" fill="#FDD835" />
      <circle cx="16" cy="4" r="1" fill="#FDD835" />
      <circle cx="20" cy="6" r="1" fill="#FDD835" />
      <circle cx="14" cy="8" r="0.8" fill="#FDD835" />
      <circle cx="18" cy="8" r="0.8" fill="#FDD835" />
    </g>
  ),

  rosmarin: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="6" stroke="#5D4037" strokeWidth="1.5" />
      {/* Needle-like leaves */}
      <path d="M16 10 Q12 8 10 10" stroke="#1B5E20" strokeWidth="0.8" fill="none" />
      <path d="M16 10 Q20 8 22 10" stroke="#1B5E20" strokeWidth="0.8" fill="none" />
      <path d="M16 14 Q12 12 10 14" stroke="#2E7D32" strokeWidth="0.8" fill="none" />
      <path d="M16 14 Q20 12 22 14" stroke="#2E7D32" strokeWidth="0.8" fill="none" />
      <path d="M16 18 Q12 16 10 18" stroke="#388E3C" strokeWidth="0.8" fill="none" />
      <path d="M16 18 Q20 16 22 18" stroke="#388E3C" strokeWidth="0.8" fill="none" />
      <path d="M16 22 Q13 20 11 22" stroke="#43A047" strokeWidth="0.8" fill="none" />
      <path d="M16 22 Q19 20 21 22" stroke="#43A047" strokeWidth="0.8" fill="none" />
      <circle cx="14" cy="7" r="1" fill="#7986CB" />
      <circle cx="18" cy="8" r="1" fill="#5C6BC0" />
    </g>
  ),

  timian: () => (
    <g>
      <line x1="16" y1="30" x2="14" y2="10" stroke="#5D4037" strokeWidth="1" />
      <line x1="16" y1="30" x2="18" y2="12" stroke="#5D4037" strokeWidth="1" />
      {/* Tiny leaves */}
      <ellipse cx="12" cy="12" rx="2" ry="1" fill="#558B2F" />
      <ellipse cx="16" cy="10" rx="2" ry="1" fill="#689F38" />
      <ellipse cx="14" cy="16" rx="2" ry="1" fill="#558B2F" />
      <ellipse cx="20" cy="14" rx="2" ry="1" fill="#689F38" />
      <ellipse cx="12" cy="20" rx="2" ry="1" fill="#7CB342" />
      <ellipse cx="18" cy="18" rx="2" ry="1" fill="#558B2F" />
      <circle cx="16" cy="8" r="1.2" fill="#CE93D8" opacity="0.7" />
    </g>
  ),

  salvie: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#5D4037" strokeWidth="1.2" />
      <ellipse cx="11" cy="14" rx="5" ry="3" fill="#78909C" transform="rotate(-10 11 14)" />
      <ellipse cx="21" cy="14" rx="5" ry="3" fill="#607D8B" transform="rotate(10 21 14)" />
      <ellipse cx="12" cy="20" rx="4.5" ry="2.8" fill="#78909C" transform="rotate(-5 12 20)" />
      <ellipse cx="20" cy="20" rx="4.5" ry="2.8" fill="#607D8B" transform="rotate(5 20 20)" />
      <circle cx="14" cy="8" r="1.5" fill="#7E57C2" />
      <circle cx="18" cy="7" r="1.5" fill="#9575CD" />
    </g>
  ),

  mynte: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="6" stroke="#33691E" strokeWidth="1.5" />
      <ellipse cx="10" cy="12" rx="5" ry="3" fill="#43A047" transform="rotate(-20 10 12)" />
      <ellipse cx="22" cy="12" rx="5" ry="3" fill="#388E3C" transform="rotate(20 22 12)" />
      <ellipse cx="10" cy="20" rx="5" ry="3" fill="#2E7D32" transform="rotate(-15 10 20)" />
      <ellipse cx="22" cy="20" rx="5" ry="3" fill="#43A047" transform="rotate(15 22 20)" />
      <path d="M10 12 Q10 12 10 12" fill="none" stroke="#1B5E20" strokeWidth="0.3" />
    </g>
  ),

  oregano: () => (
    <g>
      <line x1="14" y1="30" x2="12" y2="10" stroke="#5D4037" strokeWidth="1" />
      <line x1="18" y1="30" x2="20" y2="10" stroke="#5D4037" strokeWidth="1" />
      <circle cx="10" cy="14" r="2" fill="#388E3C" />
      <circle cx="14" cy="12" r="2" fill="#43A047" />
      <circle cx="18" cy="14" r="2" fill="#388E3C" />
      <circle cx="22" cy="12" r="2" fill="#43A047" />
      <circle cx="12" cy="18" r="2" fill="#4CAF50" />
      <circle cx="20" cy="18" r="2" fill="#388E3C" />
      <circle cx="12" cy="8" r="1.5" fill="#E8F5E9" opacity="0.7" />
      <circle cx="20" cy="7" r="1.5" fill="#E8F5E9" opacity="0.7" />
    </g>
  ),

  koriander: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#558B2F" strokeWidth="1.2" />
      <path d="M16 14 Q10 10 8 12 Q10 14 14 14" fill="#43A047" />
      <path d="M16 14 Q22 10 24 12 Q22 14 18 14" fill="#388E3C" />
      <path d="M16 20 Q11 17 9 19 Q11 21 14 20" fill="#4CAF50" />
      <path d="M16 20 Q21 17 23 19 Q21 21 18 20" fill="#43A047" />
    </g>
  ),

  estragon: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="6" stroke="#5D4037" strokeWidth="1" />
      <path d="M16 10 Q12 8 10 10" stroke="#558B2F" strokeWidth="1.2" fill="none" />
      <path d="M16 10 Q20 8 22 10" stroke="#558B2F" strokeWidth="1.2" fill="none" />
      <path d="M16 14 Q12 12 10 14" stroke="#689F38" strokeWidth="1.2" fill="none" />
      <path d="M16 14 Q20 12 22 14" stroke="#689F38" strokeWidth="1.2" fill="none" />
      <path d="M16 18 Q13 16 11 18" stroke="#7CB342" strokeWidth="1.2" fill="none" />
      <path d="M16 18 Q19 16 21 18" stroke="#7CB342" strokeWidth="1.2" fill="none" />
      <path d="M16 22 Q13 20 11 22" stroke="#8BC34A" strokeWidth="1.2" fill="none" />
      <path d="M16 22 Q19 20 21 22" stroke="#8BC34A" strokeWidth="1.2" fill="none" />
    </g>
  ),

  citronmelisse: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="8" stroke="#33691E" strokeWidth="1.2" />
      <ellipse cx="10" cy="12" rx="5" ry="3.5" fill="#7CB342" transform="rotate(-15 10 12)" />
      <ellipse cx="22" cy="12" rx="5" ry="3.5" fill="#8BC34A" transform="rotate(15 22 12)" />
      <ellipse cx="10" cy="20" rx="5" ry="3.5" fill="#9CCC65" transform="rotate(-10 10 20)" />
      <ellipse cx="22" cy="20" rx="5" ry="3.5" fill="#7CB342" transform="rotate(10 22 20)" />
      <path d="M10 12 Q10 12 8 11" fill="none" stroke="#558B2F" strokeWidth="0.4" />
      <path d="M22 12 Q22 12 24 11" fill="none" stroke="#558B2F" strokeWidth="0.4" />
    </g>
  ),

  loevstikke: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="6" stroke="#33691E" strokeWidth="2" />
      <path d="M16 10 Q10 6 6 8 Q8 12 14 12" fill="#2E7D32" />
      <path d="M16 10 Q22 6 26 8 Q24 12 18 12" fill="#388E3C" />
      <path d="M16 16 Q10 12 8 14 Q10 18 14 17" fill="#43A047" />
      <path d="M16 16 Q22 12 24 14 Q22 18 18 17" fill="#2E7D32" />
    </g>
  ),

  kommen: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="8" stroke="#558B2F" strokeWidth="1" />
      <path d="M16 14 Q12 10 9 12" stroke="#66BB6A" strokeWidth="0.6" fill="none" />
      <path d="M16 14 Q20 10 23 12" stroke="#66BB6A" strokeWidth="0.6" fill="none" />
      <path d="M16 20 Q13 17 10 19" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <path d="M16 20 Q19 17 22 19" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <circle cx="13" cy="6" r="1.5" fill="#FFF9C4" />
      <circle cx="16" cy="5" r="1.5" fill="#FFF9C4" />
      <circle cx="19" cy="6" r="1.5" fill="#FFF9C4" />
    </g>
  ),

  koervel: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="8" stroke="#558B2F" strokeWidth="1" />
      <path d="M16 12 Q10 8 8 10" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <path d="M16 12 Q22 8 24 10" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <path d="M16 18 Q12 14 10 16" stroke="#A5D6A7" strokeWidth="0.5" fill="none" />
      <path d="M16 18 Q20 14 22 16" stroke="#A5D6A7" strokeWidth="0.5" fill="none" />
      <circle cx="14" cy="5" r="1" fill="#FFFFFF" />
      <circle cx="16" cy="4" r="1" fill="#FFFFFF" />
      <circle cx="18" cy="5" r="1" fill="#FFFFFF" />
    </g>
  ),

  // ─── Frugt & Bær ────────────────────────────────────────────────────────
  jordbeer: () => (
    <g>
      <path d="M10 14 Q10 8 16 6 Q22 8 22 14 Q22 22 16 26 Q10 22 10 14Z" fill="#E53935" />
      <circle cx="13" cy="14" r="0.6" fill="#FFCDD2" />
      <circle cx="16" cy="12" r="0.6" fill="#FFCDD2" />
      <circle cx="19" cy="14" r="0.6" fill="#FFCDD2" />
      <circle cx="14" cy="18" r="0.6" fill="#FFCDD2" />
      <circle cx="18" cy="18" r="0.6" fill="#FFCDD2" />
      <path d="M14 6 Q16 4 18 6" fill="#43A047" />
      <path d="M12 7 Q14 5 16 6" fill="#388E3C" />
    </g>
  ),

  hindbeer: () => (
    <g>
      <circle cx="14" cy="14" r="2.5" fill="#E91E63" />
      <circle cx="18" cy="14" r="2.5" fill="#EC407A" />
      <circle cx="12" cy="18" r="2.5" fill="#D81B60" />
      <circle cx="16" cy="18" r="2.5" fill="#E91E63" />
      <circle cx="20" cy="18" r="2.5" fill="#EC407A" />
      <circle cx="14" cy="22" r="2.5" fill="#C2185B" />
      <circle cx="18" cy="22" r="2.5" fill="#D81B60" />
      <path d="M14 10 Q16 8 18 10" fill="#43A047" />
    </g>
  ),

  solbaer: () => (
    <g>
      <circle cx="12" cy="18" r="3.5" fill="#212121" />
      <circle cx="18" cy="16" r="3.5" fill="#424242" />
      <circle cx="22" cy="20" r="3" fill="#212121" />
      <circle cx="15" cy="22" r="3" fill="#424242" />
      <path d="M14 14 Q14 8 12 5" stroke="#388E3C" strokeWidth="1" fill="none" />
      <path d="M18 12 Q18 8 20 5" stroke="#43A047" strokeWidth="1" fill="none" />
      <ellipse cx="12" cy="4" rx="3" ry="2" fill="#43A047" />
    </g>
  ),

  ribs: () => (
    <g>
      <circle cx="12" cy="16" r="3" fill="#EF5350" />
      <circle cx="18" cy="14" r="3" fill="#E53935" />
      <circle cx="14" cy="21" r="2.5" fill="#EF5350" />
      <circle cx="20" cy="19" r="2.5" fill="#F44336" />
      <circle cx="16" cy="24" r="2" fill="#E53935" />
      <path d="M16 12 Q16 6 14 3" stroke="#4CAF50" strokeWidth="1" fill="none" />
    </g>
  ),

  stikkelsbeer: () => (
    <g>
      <circle cx="16" cy="18" r="7" fill="#81C784" />
      <circle cx="16" cy="18" r="5" fill="#A5D6A7" />
      <path d="M12 16 Q16 14 20 16" fill="none" stroke="#66BB6A" strokeWidth="0.4" />
      <path d="M12 20 Q16 18 20 20" fill="none" stroke="#66BB6A" strokeWidth="0.4" />
      <path d="M14 6 Q16 8 18 6" fill="#388E3C" />
      <line x1="16" y1="8" x2="16" y2="12" stroke="#33691E" strokeWidth="0.8" />
    </g>
  ),

  blaabaer: () => (
    <g>
      <circle cx="12" cy="18" r="3.5" fill="#283593" />
      <circle cx="18" cy="16" r="3.5" fill="#3949AB" />
      <circle cx="15" cy="22" r="3" fill="#1A237E" />
      <circle cx="20" cy="21" r="3" fill="#283593" />
      <path d="M14 14 Q14 8 12 5" stroke="#43A047" strokeWidth="1" fill="none" />
      <ellipse cx="12" cy="4" rx="3" ry="2" fill="#66BB6A" />
    </g>
  ),

  brombeer: () => (
    <g>
      <circle cx="14" cy="14" r="2" fill="#311B92" />
      <circle cx="18" cy="14" r="2" fill="#4527A0" />
      <circle cx="12" cy="18" r="2" fill="#311B92" />
      <circle cx="16" cy="18" r="2" fill="#4527A0" />
      <circle cx="20" cy="18" r="2" fill="#311B92" />
      <circle cx="14" cy="22" r="2" fill="#4527A0" />
      <circle cx="18" cy="22" r="2" fill="#311B92" />
      <path d="M14 10 Q16 8 18 10" fill="#388E3C" />
    </g>
  ),

  havtorn: () => (
    <g>
      <path d="M16 30 L16 4" stroke="#5D4037" strokeWidth="2" />
      <circle cx="12" cy="14" r="2" fill="#FF6F00" />
      <circle cx="20" cy="12" r="2" fill="#F57C00" />
      <circle cx="10" cy="18" r="1.8" fill="#FF8F00" />
      <circle cx="22" cy="16" r="1.8" fill="#FF6F00" />
      <circle cx="14" cy="22" r="1.8" fill="#F57C00" />
      <path d="M16 10 Q12 8 10 10" stroke="#558B2F" strokeWidth="0.6" fill="none" />
      <path d="M16 14 Q20 12 22 14" stroke="#558B2F" strokeWidth="0.6" fill="none" />
    </g>
  ),

  hyld: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#5D4037" strokeWidth="2.5" />
      <path d="M16 14 Q10 12 6 14" stroke="#5D4037" strokeWidth="1.5" fill="none" />
      <path d="M16 14 Q22 12 26 14" stroke="#5D4037" strokeWidth="1.5" fill="none" />
      <circle cx="8" cy="10" r="4" fill="#4A148C" />
      <circle cx="24" cy="10" r="4" fill="#6A1B9A" />
      <circle cx="16" cy="8" r="4" fill="#4A148C" />
    </g>
  ),

  vindrue: () => (
    <g>
      <circle cx="14" cy="14" r="3" fill="#7B1FA2" />
      <circle cx="18" cy="12" r="3" fill="#8E24AA" />
      <circle cx="12" cy="18" r="3" fill="#6A1B9A" />
      <circle cx="16" cy="20" r="3" fill="#7B1FA2" />
      <circle cx="20" cy="17" r="3" fill="#8E24AA" />
      <circle cx="14" cy="24" r="2.5" fill="#6A1B9A" />
      <circle cx="18" cy="24" r="2.5" fill="#7B1FA2" />
      <line x1="16" y1="8" x2="16" y2="4" stroke="#5D4037" strokeWidth="1" />
      <path d="M16 4 Q12 2 10 4" stroke="#4CAF50" strokeWidth="0.8" fill="none" />
    </g>
  ),

  // ─── Frugt-træer (simple silhouettes) ─────────────────────────────────
  aeble: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="14" r="10" fill="#43A047" />
      <circle cx="16" cy="12" r="7" fill="#66BB6A" />
      <circle cx="13" cy="16" r="2" fill="#E53935" />
      <circle cx="19" cy="14" r="1.8" fill="#EF5350" />
      <circle cx="16" cy="18" r="1.5" fill="#E53935" />
    </g>
  ),

  paere: () => (
    <g>
      <rect x="15" y="22" width="2" height="8" rx="0.5" fill="#5D4037" />
      <ellipse cx="16" cy="14" rx="9" ry="10" fill="#43A047" />
      <circle cx="16" cy="12" r="6" fill="#66BB6A" />
      <ellipse cx="14" cy="16" rx="1.5" ry="2" fill="#CDDC39" />
      <ellipse cx="19" cy="14" rx="1.5" ry="2" fill="#C0CA33" />
    </g>
  ),

  kirsebeer: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="10" fill="#388E3C" />
      <circle cx="16" cy="10" r="6" fill="#43A047" />
      <circle cx="12" cy="15" r="2" fill="#C62828" />
      <circle cx="18" cy="13" r="2" fill="#D32F2F" />
      <circle cx="20" cy="16" r="1.5" fill="#C62828" />
    </g>
  ),

  blomme: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="10" fill="#388E3C" />
      <circle cx="16" cy="10" r="6" fill="#43A047" />
      <ellipse cx="13" cy="15" rx="2" ry="2.5" fill="#6A1B9A" />
      <ellipse cx="19" cy="13" rx="2" ry="2.5" fill="#7B1FA2" />
    </g>
  ),

  // ─── Blomster ───────────────────────────────────────────────────────────
  morgenfrue: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="14" stroke="#388E3C" strokeWidth="1.5" />
      <circle cx="16" cy="10" r="8" fill="#FF8F00" />
      {/* Petals */}
      <ellipse cx="16" cy="4" rx="2.5" ry="4" fill="#FFA000" />
      <ellipse cx="22" cy="8" rx="4" ry="2.5" fill="#FFB300" transform="rotate(45 22 8)" />
      <ellipse cx="22" cy="14" rx="4" ry="2.5" fill="#FFA000" transform="rotate(-45 22 14)" />
      <ellipse cx="10" cy="8" rx="4" ry="2.5" fill="#FFB300" transform="rotate(-45 10 8)" />
      <ellipse cx="10" cy="14" rx="4" ry="2.5" fill="#FFA000" transform="rotate(45 10 14)" />
      <circle cx="16" cy="10" r="3" fill="#F57F17" />
    </g>
  ),

  solsikke: () => (
    <g>
      <rect x="15" y="18" width="2" height="14" rx="0.5" fill="#33691E" />
      <circle cx="16" cy="12" r="10" fill="#FDD835" />
      <ellipse cx="16" cy="4" rx="3" ry="5" fill="#FFEE58" />
      <ellipse cx="8" cy="12" rx="5" ry="3" fill="#FDD835" />
      <ellipse cx="24" cy="12" rx="5" ry="3" fill="#FFEE58" />
      <ellipse cx="16" cy="20" rx="3" ry="4" fill="#FDD835" />
      <circle cx="16" cy="12" r="5" fill="#5D4037" />
      <circle cx="16" cy="12" r="3.5" fill="#795548" />
    </g>
  ),

  lavendel: () => (
    <g>
      <line x1="12" y1="30" x2="12" y2="12" stroke="#558B2F" strokeWidth="1" />
      <line x1="16" y1="30" x2="16" y2="10" stroke="#558B2F" strokeWidth="1" />
      <line x1="20" y1="30" x2="20" y2="12" stroke="#558B2F" strokeWidth="1" />
      <ellipse cx="12" cy="8" rx="2" ry="4" fill="#7E57C2" />
      <ellipse cx="16" cy="6" rx="2" ry="4" fill="#9575CD" />
      <ellipse cx="20" cy="8" rx="2" ry="4" fill="#7E57C2" />
    </g>
  ),

  dahlia: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="16" stroke="#388E3C" strokeWidth="1.5" />
      <circle cx="16" cy="12" r="10" fill="#EC407A" />
      {/* Layered petals */}
      <ellipse cx="16" cy="5" rx="3" ry="4" fill="#F06292" />
      <ellipse cx="23" cy="10" rx="4" ry="3" fill="#EC407A" />
      <ellipse cx="9" cy="10" rx="4" ry="3" fill="#F06292" />
      <ellipse cx="23" cy="16" rx="4" ry="3" fill="#EC407A" />
      <ellipse cx="9" cy="16" rx="4" ry="3" fill="#F06292" />
      <circle cx="16" cy="12" r="3" fill="#F9A825" />
    </g>
  ),

  // ─── Buske & Klatreplanter ──────────────────────────────────────────────
  "lavendel-staude": () => (
    <g>
      <line x1="12" y1="30" x2="12" y2="12" stroke="#558B2F" strokeWidth="1" />
      <line x1="16" y1="30" x2="16" y2="10" stroke="#558B2F" strokeWidth="1" />
      <line x1="20" y1="30" x2="20" y2="12" stroke="#558B2F" strokeWidth="1" />
      <ellipse cx="12" cy="8" rx="2" ry="4" fill="#7E57C2" />
      <ellipse cx="16" cy="6" rx="2" ry="4" fill="#9575CD" />
      <ellipse cx="20" cy="8" rx="2" ry="4" fill="#7E57C2" />
    </g>
  ),

  // ─── Special / andet ───────────────────────────────────────────────────
  "soed-kartoffel": () => (
    <g>
      <ellipse cx="16" cy="18" rx="10" ry="7" fill="#E65100" />
      <ellipse cx="16" cy="18" rx="8" ry="5" fill="#EF6C00" />
      <circle cx="13" cy="17" r="0.8" fill="#BF360C" opacity="0.5" />
      <circle cx="19" cy="19" r="0.6" fill="#BF360C" opacity="0.4" />
    </g>
  ),

  yacon: () => (
    <g>
      <ellipse cx="12" cy="22" rx="5" ry="6" fill="#BCAAA4" transform="rotate(-15 12 22)" />
      <ellipse cx="20" cy="22" rx="5" ry="6" fill="#A1887F" transform="rotate(15 20 22)" />
      <line x1="16" y1="16" x2="16" y2="6" stroke="#388E3C" strokeWidth="1.5" />
      <ellipse cx="12" cy="8" rx="4" ry="2.5" fill="#43A047" />
      <ellipse cx="20" cy="6" rx="4" ry="2.5" fill="#388E3C" />
    </g>
  ),

  oca: () => (
    <g>
      <ellipse cx="16" cy="20" rx="8" ry="5" fill="#F44336" />
      <ellipse cx="16" cy="20" rx="6" ry="3.5" fill="#EF5350" />
      <path d="M10 18 Q13 16 16 18 Q19 16 22 18" fill="none" stroke="#C62828" strokeWidth="0.4" />
      <path d="M10 22 Q13 20 16 22 Q19 20 22 22" fill="none" stroke="#C62828" strokeWidth="0.4" />
    </g>
  ),

  humle: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="4" stroke="#33691E" strokeWidth="1.5" />
      <path d="M16 8 Q12 6 10 8 Q12 12 16 12" fill="#8BC34A" />
      <path d="M16 8 Q20 6 22 8 Q20 12 16 12" fill="#7CB342" />
      <path d="M16 16 Q12 14 10 16 Q12 20 16 20" fill="#9CCC65" />
      <path d="M16 16 Q20 14 22 16 Q20 20 16 20" fill="#8BC34A" />
      {/* Hop cones */}
      <ellipse cx="10" cy="10" rx="2.5" ry="3.5" fill="#CDDC39" />
      <ellipse cx="22" cy="18" rx="2.5" ry="3.5" fill="#C0CA33" />
    </g>
  ),

  // ─── Grøngødning ───────────────────────────────────────────────────────
  kloever: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="14" stroke="#33691E" strokeWidth="1" />
      <circle cx="13" cy="12" r="4" fill="#43A047" />
      <circle cx="19" cy="12" r="4" fill="#388E3C" />
      <circle cx="16" cy="8" r="4" fill="#4CAF50" />
      <path d="M13 12 Q13 12 13 14" fill="none" stroke="#2E7D32" strokeWidth="0.4" />
      <path d="M19 12 Q19 12 19 14" fill="none" stroke="#2E7D32" strokeWidth="0.4" />
      <path d="M16 8 Q16 8 16 10" fill="none" stroke="#2E7D32" strokeWidth="0.4" />
    </g>
  ),

  phacelia: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#558B2F" strokeWidth="1.2" />
      <path d="M16 10 Q14 4 10 6 Q12 10 16 12" fill="#43A047" />
      <path d="M16 10 Q18 4 22 6 Q20 10 16 12" fill="#388E3C" />
      {/* Curled flower clusters */}
      <path d="M12 6 Q8 4 6 6 Q8 8 12 8" fill="#7986CB" />
      <path d="M20 6 Q24 4 26 6 Q24 8 20 8" fill="#5C6BC0" />
      <circle cx="16" cy="4" r="2" fill="#7C4DFF" />
    </g>
  ),

  // ─── Træer (generisk-stil) ──────────────────────────────────────────────
  eg: () => (
    <g>
      <rect x="14" y="22" width="4" height="10" rx="1" fill="#5D4037" />
      <circle cx="16" cy="14" r="11" fill="#2E7D32" />
      <circle cx="12" cy="12" r="5" fill="#388E3C" />
      <circle cx="20" cy="12" r="5" fill="#43A047" />
      <circle cx="16" cy="8" r="5" fill="#2E7D32" />
    </g>
  ),

  boeg: () => (
    <g>
      <rect x="15" y="22" width="2" height="10" rx="0.5" fill="#6D4C41" />
      <ellipse cx="16" cy="14" rx="11" ry="10" fill="#388E3C" />
      <ellipse cx="16" cy="10" rx="7" ry="6" fill="#43A047" />
    </g>
  ),

  birk: () => (
    <g>
      <rect x="14.5" y="16" width="3" height="14" rx="0.5" fill="#F5F5F5" />
      <line x1="15" y1="18" x2="15" y2="19" stroke="#9E9E9E" strokeWidth="0.5" />
      <line x1="16" y1="22" x2="16" y2="23" stroke="#9E9E9E" strokeWidth="0.5" />
      <line x1="17" y1="26" x2="17" y2="27" stroke="#9E9E9E" strokeWidth="0.5" />
      <ellipse cx="16" cy="10" rx="10" ry="8" fill="#81C784" />
      <ellipse cx="12" cy="8" rx="4" ry="3" fill="#A5D6A7" />
      <ellipse cx="20" cy="8" rx="4" ry="3" fill="#66BB6A" />
    </g>
  ),

  fyr: () => (
    <g>
      <rect x="14.5" y="22" width="3" height="10" rx="0.5" fill="#5D4037" />
      <polygon points="16,2 6,22 26,22" fill="#2E7D32" />
      <polygon points="16,6 8,20 24,20" fill="#388E3C" opacity="0.6" />
    </g>
  ),

  gran: () => (
    <g>
      <rect x="14.5" y="24" width="3" height="8" rx="0.5" fill="#5D4037" />
      <polygon points="16,2 4,26 28,26" fill="#1B5E20" />
      <polygon points="16,6 7,24 25,24" fill="#2E7D32" opacity="0.5" />
      <polygon points="16,10 10,22 22,22" fill="#388E3C" opacity="0.4" />
    </g>
  ),

  // ─── Græsser ────────────────────────────────────────────────────────────
  pampasgras: () => (
    <g>
      <path d="M16 30 Q14 20 12 12 Q10 14 8 20" stroke="#8BC34A" strokeWidth="1.2" fill="none" />
      <path d="M16 30 Q18 20 20 12 Q22 14 24 20" stroke="#7CB342" strokeWidth="1.2" fill="none" />
      <path d="M16 30 Q16 18 16 8" stroke="#9CCC65" strokeWidth="1.2" fill="none" />
      {/* Plumes */}
      <ellipse cx="12" cy="8" rx="2.5" ry="5" fill="#EFEBE9" />
      <ellipse cx="16" cy="5" rx="2" ry="5" fill="#F5F5F5" />
      <ellipse cx="20" cy="8" rx="2.5" ry="5" fill="#EFEBE9" />
    </g>
  ),

  blaasvingel: () => (
    <g>
      <path d="M16 30 Q14 20 10 10" stroke="#78909C" strokeWidth="1" fill="none" />
      <path d="M16 30 Q18 20 22 10" stroke="#607D8B" strokeWidth="1" fill="none" />
      <path d="M16 30 Q15 22 12 14" stroke="#90A4AE" strokeWidth="1" fill="none" />
      <path d="M16 30 Q17 22 20 14" stroke="#78909C" strokeWidth="1" fill="none" />
      <path d="M16 30 Q16 22 16 12" stroke="#546E7A" strokeWidth="1" fill="none" />
    </g>
  ),

  "japansk-blodgraes": () => (
    <g>
      <path d="M16 30 Q14 20 10 10" stroke="#C62828" strokeWidth="1" fill="none" />
      <path d="M16 30 Q18 20 22 10" stroke="#D32F2F" strokeWidth="1" fill="none" />
      <path d="M16 30 Q15 22 12 14" stroke="#B71C1C" strokeWidth="1" fill="none" />
      <path d="M16 30 Q17 22 20 14" stroke="#E53935" strokeWidth="1" fill="none" />
      <path d="M16 30 Q16 22 16 12" stroke="#C62828" strokeWidth="1" fill="none" />
    </g>
  ),

  elefantgraes: () => (
    <g>
      <path d="M16 30 Q14 18 8 6" stroke="#558B2F" strokeWidth="1.5" fill="none" />
      <path d="M16 30 Q18 18 24 6" stroke="#689F38" strokeWidth="1.5" fill="none" />
      <path d="M16 30 Q15 20 10 10" stroke="#7CB342" strokeWidth="1.2" fill="none" />
      <path d="M16 30 Q17 20 22 10" stroke="#558B2F" strokeWidth="1.2" fill="none" />
      <path d="M16 30 Q16 18 16 6" stroke="#689F38" strokeWidth="1.5" fill="none" />
    </g>
  ),

  // ─── Stauder ────────────────────────────────────────────────────────────
  hosta: () => (
    <g>
      <ellipse cx="10" cy="18" rx="6" ry="9" fill="#4CAF50" transform="rotate(-25 10 18)" />
      <ellipse cx="22" cy="18" rx="6" ry="9" fill="#66BB6A" transform="rotate(25 22 18)" />
      <ellipse cx="16" cy="16" rx="5" ry="10" fill="#388E3C" />
      <path d="M10 14 Q10 20 10 24" fill="none" stroke="#2E7D32" strokeWidth="0.5" />
      <path d="M16 10 Q16 18 16 26" fill="none" stroke="#2E7D32" strokeWidth="0.5" />
      <path d="M22 14 Q22 20 22 24" fill="none" stroke="#2E7D32" strokeWidth="0.5" />
    </g>
  ),

  bregne: () => (
    <g>
      <path d="M16 30 Q14 20 10 12 Q8 10 6 12" stroke="#2E7D32" strokeWidth="1.2" fill="none" />
      <path d="M16 30 Q18 20 22 12 Q24 10 26 12" stroke="#388E3C" strokeWidth="1.2" fill="none" />
      <path d="M16 30 Q16 18 16 8" stroke="#43A047" strokeWidth="1.2" fill="none" />
      {/* Fiddlehead top */}
      <path d="M16 8 Q14 4 16 4 Q18 4 16 8" fill="#4CAF50" />
      {/* Small fronds */}
      <path d="M12 16 Q10 14 8 16" stroke="#66BB6A" strokeWidth="0.5" fill="none" />
      <path d="M20 16 Q22 14 24 16" stroke="#66BB6A" strokeWidth="0.5" fill="none" />
      <path d="M14 20 Q12 18 10 20" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <path d="M18 20 Q20 18 22 20" stroke="#81C784" strokeWidth="0.5" fill="none" />
    </g>
  ),

  echinacea: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="14" stroke="#388E3C" strokeWidth="1.5" />
      <circle cx="16" cy="10" r="4" fill="#8D6E63" />
      {/* Drooping petals */}
      <path d="M12 10 Q8 14 6 18" stroke="#EC407A" strokeWidth="2" fill="none" />
      <path d="M20 10 Q24 14 26 18" stroke="#F06292" strokeWidth="2" fill="none" />
      <path d="M14 13 Q12 18 10 22" stroke="#EC407A" strokeWidth="1.5" fill="none" />
      <path d="M18 13 Q20 18 22 22" stroke="#F06292" strokeWidth="1.5" fill="none" />
      <path d="M16 14 Q16 20 16 24" stroke="#EC407A" strokeWidth="1.5" fill="none" />
    </g>
  ),

  iris: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#388E3C" strokeWidth="2" />
      {/* Upright petals */}
      <ellipse cx="14" cy="8" rx="3" ry="6" fill="#5C6BC0" transform="rotate(-10 14 8)" />
      <ellipse cx="18" cy="8" rx="3" ry="6" fill="#3F51B5" transform="rotate(10 18 8)" />
      {/* Falls (drooping petals) */}
      <path d="M12 12 Q8 16 6 20" stroke="#7986CB" strokeWidth="2.5" fill="none" />
      <path d="M20 12 Q24 16 26 20" stroke="#5C6BC0" strokeWidth="2.5" fill="none" />
    </g>
  ),

  daglilje: () => (
    <g>
      <path d="M16 30 Q14 22 10 14" stroke="#388E3C" strokeWidth="1.5" fill="none" />
      <path d="M16 30 Q18 22 22 14" stroke="#43A047" strokeWidth="1.5" fill="none" />
      <path d="M16 30 Q16 20 16 12" stroke="#4CAF50" strokeWidth="1.5" fill="none" />
      {/* Orange lily flower */}
      <ellipse cx="16" cy="8" rx="3" ry="5" fill="#FF6F00" />
      <ellipse cx="12" cy="10" rx="3" ry="4" fill="#F57C00" transform="rotate(-30 12 10)" />
      <ellipse cx="20" cy="10" rx="3" ry="4" fill="#FF8F00" transform="rotate(30 20 10)" />
      <circle cx="16" cy="10" r="2" fill="#FFB300" />
    </g>
  ),

  paeonia: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="16" stroke="#388E3C" strokeWidth="1.5" />
      <circle cx="16" cy="12" r="10" fill="#EC407A" />
      <circle cx="14" cy="10" r="4" fill="#F06292" />
      <circle cx="18" cy="10" r="4" fill="#F48FB1" />
      <circle cx="16" cy="14" r="4" fill="#EC407A" />
      <circle cx="12" cy="14" r="3" fill="#F06292" />
      <circle cx="20" cy="14" r="3" fill="#F48FB1" />
      <circle cx="16" cy="10" r="2.5" fill="#FCE4EC" />
    </g>
  ),

  // ─── Klatreplanter ──────────────────────────────────────────────────────
  klematis: () => (
    <g>
      <path d="M6 30 Q10 20 16 14 Q22 8 26 2" stroke="#5D4037" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="20" r="4" fill="#AB47BC" />
      <circle cx="12" cy="20" r="1.5" fill="#E1BEE7" />
      <circle cx="20" cy="12" r="4" fill="#9C27B0" />
      <circle cx="20" cy="12" r="1.5" fill="#E1BEE7" />
      <circle cx="16" cy="16" r="3.5" fill="#BA68C8" />
      <circle cx="16" cy="16" r="1.2" fill="#E1BEE7" />
    </g>
  ),

  klatrerose: () => (
    <g>
      <path d="M8 30 Q12 20 16 14 Q20 8 24 2" stroke="#33691E" strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="20" r="4" fill="#E53935" />
      <circle cx="12" cy="20" r="2" fill="#C62828" />
      <circle cx="20" cy="10" r="4" fill="#EF5350" />
      <circle cx="20" cy="10" r="2" fill="#E53935" />
      <circle cx="16" cy="14" r="3" fill="#F44336" />
    </g>
  ),

  blaaregn: () => (
    <g>
      <path d="M8 4 Q12 8 16 16 Q20 24 24 30" stroke="#5D4037" strokeWidth="2" fill="none" />
      {/* Hanging wisteria clusters */}
      <ellipse cx="10" cy="10" rx="2" ry="5" fill="#7E57C2" />
      <ellipse cx="14" cy="14" rx="2" ry="5" fill="#9575CD" />
      <ellipse cx="18" cy="18" rx="2" ry="5" fill="#7E57C2" />
      <ellipse cx="22" cy="22" rx="2" ry="5" fill="#9575CD" />
    </g>
  ),

  hortensia: () => (
    <g>
      <rect x="15" y="22" width="2" height="8" rx="0.5" fill="#33691E" />
      <circle cx="16" cy="14" r="10" fill="#42A5F5" />
      <circle cx="12" cy="12" r="3" fill="#64B5F6" />
      <circle cx="16" cy="10" r="3" fill="#90CAF9" />
      <circle cx="20" cy="12" r="3" fill="#42A5F5" />
      <circle cx="14" cy="16" r="3" fill="#64B5F6" />
      <circle cx="18" cy="16" r="3" fill="#42A5F5" />
    </g>
  ),

  rhododendron: () => (
    <g>
      <rect x="15" y="22" width="2" height="8" rx="0.5" fill="#33691E" />
      <circle cx="16" cy="14" r="10" fill="#2E7D32" />
      <circle cx="12" cy="10" r="5" fill="#388E3C" />
      <circle cx="20" cy="10" r="5" fill="#43A047" />
      <circle cx="16" cy="8" r="4" fill="#EC407A" />
      <circle cx="12" cy="12" r="3" fill="#F06292" />
      <circle cx="20" cy="12" r="3" fill="#F48FB1" />
    </g>
  ),

  syren: () => (
    <g>
      <rect x="15" y="22" width="2" height="8" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="16" r="8" fill="#388E3C" />
      <ellipse cx="12" cy="8" rx="3" ry="6" fill="#AB47BC" />
      <ellipse cx="16" cy="6" rx="3" ry="6" fill="#9C27B0" />
      <ellipse cx="20" cy="8" rx="3" ry="6" fill="#BA68C8" />
    </g>
  ),

  kaprifolie: () => (
    <g>
      <path d="M6 30 Q12 18 16 12 Q20 6 26 2" stroke="#33691E" strokeWidth="1.5" fill="none" />
      <ellipse cx="12" cy="18" rx="4" ry="2.5" fill="#43A047" transform="rotate(-30 12 18)" />
      <ellipse cx="20" cy="10" rx="4" ry="2.5" fill="#388E3C" transform="rotate(30 20 10)" />
      <circle cx="10" cy="14" r="2.5" fill="#FDD835" />
      <circle cx="22" cy="8" r="2.5" fill="#FFEE58" />
    </g>
  ),

  // ─── Additional trees ──────────────────────────────────────────────────
  pil: () => (
    <g>
      <rect x="15" y="18" width="2" height="12" rx="0.5" fill="#5D4037" />
      <ellipse cx="16" cy="12" rx="11" ry="8" fill="#81C784" />
      {/* Weeping branches */}
      <path d="M8 12 Q6 20 5 26" stroke="#66BB6A" strokeWidth="0.8" fill="none" />
      <path d="M12 10 Q10 18 9 24" stroke="#81C784" strokeWidth="0.8" fill="none" />
      <path d="M20 10 Q22 18 23 24" stroke="#66BB6A" strokeWidth="0.8" fill="none" />
      <path d="M24 12 Q26 20 27 26" stroke="#81C784" strokeWidth="0.8" fill="none" />
    </g>
  ),

  ahorn: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="10" fill="#E65100" />
      <circle cx="12" cy="10" r="5" fill="#EF6C00" />
      <circle cx="20" cy="10" r="5" fill="#F57C00" />
      <circle cx="16" cy="8" r="4" fill="#FF8F00" />
    </g>
  ),

  ask: () => (
    <g>
      <rect x="14.5" y="18" width="3" height="12" rx="0.5" fill="#6D4C41" />
      <ellipse cx="16" cy="12" rx="10" ry="10" fill="#558B2F" />
      <circle cx="12" cy="10" r="4" fill="#689F38" />
      <circle cx="20" cy="10" r="4" fill="#7CB342" />
      <circle cx="16" cy="7" r="4" fill="#558B2F" />
    </g>
  ),

  lind: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <ellipse cx="16" cy="12" rx="10" ry="10" fill="#43A047" />
      <circle cx="12" cy="10" r="5" fill="#4CAF50" />
      <circle cx="20" cy="10" r="5" fill="#66BB6A" />
      <circle cx="16" cy="7" r="4" fill="#81C784" />
    </g>
  ),

  roennebeer: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="9" fill="#388E3C" />
      <circle cx="12" cy="8" r="4" fill="#43A047" />
      <circle cx="20" cy="8" r="4" fill="#4CAF50" />
      {/* Orange berries */}
      <circle cx="14" cy="16" r="1.5" fill="#E65100" />
      <circle cx="17" cy="15" r="1.5" fill="#EF6C00" />
      <circle cx="20" cy="16" r="1.5" fill="#E65100" />
    </g>
  ),

  elm: () => (
    <g>
      <rect x="14.5" y="20" width="3" height="10" rx="0.5" fill="#5D4037" />
      <ellipse cx="16" cy="12" rx="11" ry="10" fill="#2E7D32" />
      <circle cx="12" cy="10" r="5" fill="#388E3C" />
      <circle cx="20" cy="10" r="5" fill="#43A047" />
    </g>
  ),

  valnoed: () => (
    <g>
      <rect x="14" y="18" width="4" height="12" rx="1" fill="#5D4037" />
      <circle cx="16" cy="12" r="11" fill="#388E3C" />
      <circle cx="12" cy="10" r="5" fill="#43A047" />
      <circle cx="20" cy="10" r="5" fill="#2E7D32" />
      <circle cx="14" cy="16" r="2" fill="#795548" />
      <circle cx="19" cy="15" r="1.8" fill="#6D4C41" />
    </g>
  ),

  hassel: () => (
    <g>
      <line x1="12" y1="28" x2="12" y2="10" stroke="#5D4037" strokeWidth="2" />
      <line x1="16" y1="28" x2="16" y2="8" stroke="#6D4C41" strokeWidth="2" />
      <line x1="20" y1="28" x2="20" y2="10" stroke="#5D4037" strokeWidth="2" />
      <circle cx="12" cy="8" r="4" fill="#43A047" />
      <circle cx="16" cy="6" r="5" fill="#388E3C" />
      <circle cx="20" cy="8" r="4" fill="#4CAF50" />
      <ellipse cx="14" cy="16" rx="1.5" ry="2" fill="#795548" />
      <ellipse cx="19" cy="14" rx="1.5" ry="2" fill="#6D4C41" />
    </g>
  ),

  taks: () => (
    <g>
      <rect x="14.5" y="22" width="3" height="8" rx="0.5" fill="#5D4037" />
      <ellipse cx="16" cy="14" rx="8" ry="12" fill="#1B5E20" />
      <ellipse cx="16" cy="10" rx="5" ry="8" fill="#2E7D32" opacity="0.5" />
      <circle cx="18" cy="18" r="1.5" fill="#E53935" />
      <circle cx="14" cy="16" r="1.2" fill="#C62828" />
    </g>
  ),

  thuja: () => (
    <g>
      <rect x="14.5" y="24" width="3" height="6" rx="0.5" fill="#5D4037" />
      <ellipse cx="16" cy="14" rx="7" ry="13" fill="#2E7D32" />
      <ellipse cx="16" cy="12" rx="5" ry="10" fill="#388E3C" opacity="0.5" />
    </g>
  ),

  laerk: () => (
    <g>
      <rect x="14.5" y="20" width="3" height="10" rx="0.5" fill="#5D4037" />
      <polygon points="16,2 8,20 24,20" fill="#81C784" />
      <polygon points="16,6 10,18 22,18" fill="#A5D6A7" opacity="0.5" />
    </g>
  ),

  // ─── Blomster (ekstra) ──────────────────────────────────────────────────
  tagetes: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="14" stroke="#388E3C" strokeWidth="1.5" />
      <circle cx="16" cy="10" r="7" fill="#FF8F00" />
      <circle cx="16" cy="10" r="4" fill="#F57F17" />
      <ellipse cx="16" cy="5" rx="2" ry="3" fill="#FFB300" />
      <ellipse cx="11" cy="10" rx="3" ry="2" fill="#FFA000" />
      <ellipse cx="21" cy="10" rx="3" ry="2" fill="#FFB300" />
    </g>
  ),

  roser: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="14" stroke="#33691E" strokeWidth="1.5" />
      <circle cx="16" cy="10" r="8" fill="#E53935" />
      <circle cx="16" cy="10" r="5" fill="#C62828" />
      <circle cx="16" cy="10" r="3" fill="#B71C1C" />
      <ellipse cx="12" cy="16" rx="3" ry="2" fill="#388E3C" />
      <ellipse cx="20" cy="16" rx="3" ry="2" fill="#43A047" />
    </g>
  ),

  rudbeckia: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="14" stroke="#388E3C" strokeWidth="1.5" />
      <circle cx="16" cy="10" r="8" fill="#FDD835" />
      <ellipse cx="16" cy="4" rx="2.5" ry="4" fill="#FFEE58" />
      <ellipse cx="10" cy="10" rx="4" ry="2.5" fill="#FDD835" />
      <ellipse cx="22" cy="10" rx="4" ry="2.5" fill="#FFEE58" />
      <circle cx="16" cy="10" r="3.5" fill="#5D4037" />
    </g>
  ),

  astilbe: () => (
    <g>
      <line x1="12" y1="30" x2="12" y2="12" stroke="#388E3C" strokeWidth="1" />
      <line x1="16" y1="30" x2="16" y2="8" stroke="#43A047" strokeWidth="1" />
      <line x1="20" y1="30" x2="20" y2="12" stroke="#388E3C" strokeWidth="1" />
      <ellipse cx="12" cy="8" rx="2.5" ry="5" fill="#EC407A" />
      <ellipse cx="16" cy="5" rx="2.5" ry="6" fill="#F06292" />
      <ellipse cx="20" cy="8" rx="2.5" ry="5" fill="#EC407A" />
    </g>
  ),

  "geranium-staude": () => (
    <g>
      <circle cx="16" cy="18" r="8" fill="#388E3C" />
      <circle cx="16" cy="18" r="5" fill="#43A047" />
      <circle cx="12" cy="12" r="3.5" fill="#AB47BC" />
      <circle cx="12" cy="12" r="1.5" fill="#E1BEE7" />
      <circle cx="20" cy="12" r="3.5" fill="#9C27B0" />
      <circle cx="20" cy="12" r="1.5" fill="#E1BEE7" />
      <circle cx="16" cy="10" r="3" fill="#BA68C8" />
      <circle cx="16" cy="10" r="1.2" fill="#E1BEE7" />
    </g>
  ),

  stipa: () => (
    <g>
      <path d="M16 30 Q14 20 10 10" stroke="#BCAAA4" strokeWidth="1" fill="none" />
      <path d="M16 30 Q18 20 22 10" stroke="#D7CCC8" strokeWidth="1" fill="none" />
      <path d="M16 30 Q15 22 12 14" stroke="#A1887F" strokeWidth="1" fill="none" />
      <path d="M16 30 Q17 22 20 14" stroke="#BCAAA4" strokeWidth="1" fill="none" />
      <path d="M16 30 Q16 22 16 12" stroke="#D7CCC8" strokeWidth="1" fill="none" />
    </g>
  ),

  molinia: () => (
    <g>
      <path d="M16 30 Q14 20 11 12" stroke="#7CB342" strokeWidth="1" fill="none" />
      <path d="M16 30 Q18 20 21 12" stroke="#8BC34A" strokeWidth="1" fill="none" />
      <path d="M16 30 Q15 22 13 16" stroke="#689F38" strokeWidth="1" fill="none" />
      <path d="M16 30 Q17 22 19 16" stroke="#7CB342" strokeWidth="1" fill="none" />
      <path d="M16 30 Q16 22 16 14" stroke="#8BC34A" strokeWidth="1" fill="none" />
    </g>
  ),

  carex: () => (
    <g>
      <path d="M16 30 Q14 18 10 8" stroke="#558B2F" strokeWidth="1.2" fill="none" />
      <path d="M16 30 Q18 18 22 8" stroke="#689F38" strokeWidth="1.2" fill="none" />
      <path d="M16 30 Q16 18 16 8" stroke="#7CB342" strokeWidth="1.2" fill="none" />
      <path d="M16 30 Q13 20 11 14" stroke="#558B2F" strokeWidth="0.8" fill="none" />
      <path d="M16 30 Q19 20 21 14" stroke="#689F38" strokeWidth="0.8" fill="none" />
    </g>
  ),

  vedbend: () => (
    <g>
      <path d="M6 30 Q10 20 16 14 Q22 8 26 2" stroke="#33691E" strokeWidth="1.5" fill="none" />
      <path d="M10 22 L8 18 L10 20 L12 18Z" fill="#2E7D32" />
      <path d="M14 18 L12 14 L14 16 L16 14Z" fill="#388E3C" />
      <path d="M18 14 L16 10 L18 12 L20 10Z" fill="#2E7D32" />
      <path d="M22 10 L20 6 L22 8 L24 6Z" fill="#43A047" />
    </g>
  ),

  pibevin: () => (
    <g>
      <path d="M4 28 Q10 18 16 14 Q22 10 28 4" stroke="#33691E" strokeWidth="1.5" fill="none" />
      <ellipse cx="10" cy="20" rx="4" ry="3" fill="#43A047" transform="rotate(-20 10 20)" />
      <ellipse cx="16" cy="14" rx="4" ry="3" fill="#388E3C" />
      <ellipse cx="22" cy="8" rx="4" ry="3" fill="#43A047" transform="rotate(20 22 8)" />
    </g>
  ),

  vildvin: () => (
    <g>
      <path d="M6 28 Q12 18 16 12 Q20 8 26 2" stroke="#5D4037" strokeWidth="1.5" fill="none" />
      <path d="M10 20 L8 16 L10 18 L12 16 L14 18Z" fill="#C62828" />
      <path d="M16 14 L14 10 L16 12 L18 10 L20 12Z" fill="#D32F2F" />
      <path d="M22 8 L20 4 L22 6 L24 4 L26 6Z" fill="#E53935" />
    </g>
  ),

  // ─── Grøngødning (ekstra) ──────────────────────────────────────────────
  komfrey: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#33691E" strokeWidth="2" />
      <ellipse cx="10" cy="14" rx="6" ry="4" fill="#2E7D32" transform="rotate(-15 10 14)" />
      <ellipse cx="22" cy="14" rx="6" ry="4" fill="#388E3C" transform="rotate(15 22 14)" />
      <ellipse cx="10" cy="22" rx="6" ry="4" fill="#43A047" transform="rotate(-10 10 22)" />
      <ellipse cx="22" cy="22" rx="6" ry="4" fill="#2E7D32" transform="rotate(10 22 22)" />
      <circle cx="14" cy="8" r="2" fill="#7E57C2" />
      <circle cx="18" cy="7" r="2" fill="#9575CD" />
    </g>
  ),

  lucerne: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="8" stroke="#33691E" strokeWidth="1.2" />
      <ellipse cx="12" cy="14" rx="3" ry="2" fill="#43A047" transform="rotate(-20 12 14)" />
      <ellipse cx="20" cy="14" rx="3" ry="2" fill="#388E3C" transform="rotate(20 20 14)" />
      <ellipse cx="12" cy="20" rx="3" ry="2" fill="#4CAF50" transform="rotate(-15 12 20)" />
      <ellipse cx="20" cy="20" rx="3" ry="2" fill="#43A047" transform="rotate(15 20 20)" />
      <ellipse cx="16" cy="6" rx="2" ry="3" fill="#AB47BC" />
    </g>
  ),

  "gul-sennep": () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#558B2F" strokeWidth="1.2" />
      <ellipse cx="12" cy="16" rx="4" ry="2.5" fill="#43A047" transform="rotate(-15 12 16)" />
      <ellipse cx="20" cy="16" rx="4" ry="2.5" fill="#388E3C" transform="rotate(15 20 16)" />
      <circle cx="14" cy="6" r="2" fill="#FDD835" />
      <circle cx="16" cy="4" r="2" fill="#FFEE58" />
      <circle cx="18" cy="6" r="2" fill="#FDD835" />
    </g>
  ),

  "rug-groengoed": () => (
    <g>
      <line x1="12" y1="30" x2="12" y2="8" stroke="#558B2F" strokeWidth="1" />
      <line x1="16" y1="30" x2="16" y2="6" stroke="#689F38" strokeWidth="1" />
      <line x1="20" y1="30" x2="20" y2="8" stroke="#558B2F" strokeWidth="1" />
      <ellipse cx="16" cy="4" rx="2" ry="3" fill="#BCAAA4" />
    </g>
  ),

  oelraeddike: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#558B2F" strokeWidth="1.2" />
      <ellipse cx="12" cy="16" rx="4" ry="2.5" fill="#388E3C" transform="rotate(-15 12 16)" />
      <ellipse cx="20" cy="16" rx="4" ry="2.5" fill="#43A047" transform="rotate(15 20 16)" />
      <circle cx="16" cy="6" r="3" fill="#FFFFFF" />
      <circle cx="16" cy="6" r="1.5" fill="#FFEE58" />
    </g>
  ),

  // ─── Frugt (ekstra) ────────────────────────────────────────────────────
  kvaede: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="9" fill="#388E3C" />
      <circle cx="16" cy="10" r="5" fill="#43A047" />
      <ellipse cx="14" cy="16" rx="2.5" ry="3" fill="#CDDC39" />
      <ellipse cx="19" cy="14" rx="2.5" ry="3" fill="#C0CA33" />
    </g>
  ),

  mirabelle: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="9" fill="#388E3C" />
      <circle cx="16" cy="10" r="5" fill="#43A047" />
      <circle cx="13" cy="15" r="2.5" fill="#FDD835" />
      <circle cx="19" cy="13" r="2.5" fill="#FFEE58" />
    </g>
  ),

  figen: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <path d="M10 14 Q8 8 12 6 Q16 4 20 6 Q24 8 22 14" fill="#388E3C" />
      <path d="M12 10 Q16 6 20 10" fill="none" stroke="#2E7D32" strokeWidth="0.5" />
      <ellipse cx="14" cy="18" rx="2.5" ry="3" fill="#6A1B9A" />
      <ellipse cx="19" cy="17" rx="2.5" ry="3" fill="#7B1FA2" />
    </g>
  ),

  fersken: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="9" fill="#388E3C" />
      <circle cx="16" cy="10" r="5" fill="#43A047" />
      <circle cx="14" cy="16" r="3" fill="#FFAB91" />
      <circle cx="19" cy="14" r="2.5" fill="#FF8A65" />
    </g>
  ),

  abrikos: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="9" fill="#388E3C" />
      <circle cx="16" cy="10" r="5" fill="#43A047" />
      <circle cx="14" cy="16" r="3" fill="#FFB74D" />
      <circle cx="19" cy="14" r="2.5" fill="#FFA726" />
    </g>
  ),

  // ─── Blomster (ekstra) ──────────────────────────────────────────────────
  hyssop: () => (
    <g>
      <line x1="14" y1="30" x2="14" y2="10" stroke="#558B2F" strokeWidth="1" />
      <line x1="18" y1="30" x2="18" y2="12" stroke="#558B2F" strokeWidth="1" />
      <ellipse cx="14" cy="7" rx="2" ry="4" fill="#5C6BC0" />
      <ellipse cx="18" cy="9" rx="2" ry="4" fill="#3F51B5" />
      <ellipse cx="12" cy="18" rx="3" ry="2" fill="#558B2F" />
      <ellipse cx="20" cy="18" rx="3" ry="2" fill="#689F38" />
    </g>
  ),

  krokus: () => (
    <g>
      <line x1="14" y1="30" x2="14" y2="16" stroke="#388E3C" strokeWidth="1" />
      <line x1="16" y1="30" x2="16" y2="14" stroke="#388E3C" strokeWidth="1" />
      <line x1="18" y1="30" x2="18" y2="16" stroke="#388E3C" strokeWidth="1" />
      <ellipse cx="14" cy="12" rx="3" ry="6" fill="#7E57C2" />
      <ellipse cx="16" cy="10" rx="3" ry="6" fill="#9575CD" />
      <ellipse cx="18" cy="12" rx="3" ry="6" fill="#7E57C2" />
      <circle cx="16" cy="10" r="1.5" fill="#FDD835" />
    </g>
  ),

  narcis: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="12" stroke="#388E3C" strokeWidth="1.5" />
      <ellipse cx="12" cy="8" rx="3" ry="5" fill="#FDD835" transform="rotate(-20 12 8)" />
      <ellipse cx="20" cy="8" rx="3" ry="5" fill="#FFEE58" transform="rotate(20 20 8)" />
      <ellipse cx="16" cy="6" rx="2.5" ry="5" fill="#FDD835" />
      <circle cx="16" cy="8" r="3" fill="#FF8F00" />
      <circle cx="16" cy="8" r="1.5" fill="#FFB300" />
    </g>
  ),

  stokrose: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="4" stroke="#388E3C" strokeWidth="2" />
      <circle cx="16" cy="6" r="3" fill="#E91E63" />
      <circle cx="16" cy="12" r="3.5" fill="#EC407A" />
      <circle cx="16" cy="18" r="4" fill="#F06292" />
      <circle cx="16" cy="24" r="3" fill="#81C784" />
    </g>
  ),

  aronia: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="14" r="8" fill="#388E3C" />
      <circle cx="12" cy="12" r="4" fill="#43A047" />
      <circle cx="20" cy="12" r="4" fill="#2E7D32" />
      <circle cx="14" cy="18" r="2" fill="#212121" />
      <circle cx="18" cy="17" r="2" fill="#424242" />
    </g>
  ),

  tyttebeer: () => (
    <g>
      <ellipse cx="16" cy="20" rx="10" ry="6" fill="#2E7D32" />
      <ellipse cx="12" cy="18" rx="4" ry="3" fill="#388E3C" />
      <ellipse cx="20" cy="18" rx="4" ry="3" fill="#43A047" />
      <circle cx="12" cy="22" r="2" fill="#C62828" />
      <circle cx="16" cy="23" r="2" fill="#D32F2F" />
      <circle cx="20" cy="22" r="2" fill="#C62828" />
    </g>
  ),

  buxbom: () => (
    <g>
      <rect x="14" y="22" width="4" height="8" rx="1" fill="#5D4037" />
      <circle cx="16" cy="14" r="10" fill="#1B5E20" />
      <circle cx="12" cy="12" r="4" fill="#2E7D32" />
      <circle cx="20" cy="12" r="4" fill="#388E3C" />
      <circle cx="16" cy="10" r="4" fill="#1B5E20" />
    </g>
  ),

  akeleje: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="14" stroke="#388E3C" strokeWidth="1.2" />
      <circle cx="16" cy="10" r="6" fill="#7E57C2" />
      <circle cx="16" cy="10" r="3" fill="#B39DDB" />
      <path d="M10 8 Q8 4 6 6" stroke="#9575CD" strokeWidth="1.5" fill="none" />
      <path d="M22 8 Q24 4 26 6" stroke="#9575CD" strokeWidth="1.5" fill="none" />
      <path d="M16 4 Q16 0 14 2" stroke="#9575CD" strokeWidth="1.5" fill="none" />
    </g>
  ),

  lilje: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="12" stroke="#388E3C" strokeWidth="1.5" />
      <ellipse cx="13" cy="8" rx="3" ry="6" fill="#F44336" transform="rotate(-15 13 8)" />
      <ellipse cx="19" cy="8" rx="3" ry="6" fill="#EF5350" transform="rotate(15 19 8)" />
      <ellipse cx="16" cy="6" rx="2.5" ry="6" fill="#E53935" />
      <circle cx="16" cy="8" r="2" fill="#FFEB3B" />
    </g>
  ),

  kastanje: () => (
    <g>
      <rect x="14" y="18" width="4" height="12" rx="1" fill="#5D4037" />
      <circle cx="16" cy="12" r="11" fill="#2E7D32" />
      <circle cx="12" cy="10" r="5" fill="#388E3C" />
      <circle cx="20" cy="10" r="5" fill="#43A047" />
      <circle cx="16" cy="18" r="2.5" fill="#795548" />
    </g>
  ),

  magnolia: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#6D4C41" />
      <circle cx="16" cy="14" r="8" fill="#424242" />
      <ellipse cx="12" cy="10" rx="4" ry="6" fill="#F8BBD0" transform="rotate(-15 12 10)" />
      <ellipse cx="20" cy="10" rx="4" ry="6" fill="#FCE4EC" transform="rotate(15 20 10)" />
      <ellipse cx="16" cy="8" rx="3.5" ry="6" fill="#F48FB1" />
      <circle cx="16" cy="10" r="2" fill="#F06292" />
    </g>
  ),

  // ─── Bær (ekstra) ──────────────────────────────────────────────────────
  honningbaer: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#5D4037" strokeWidth="2" />
      <circle cx="16" cy="14" r="6" fill="#388E3C" />
      <ellipse cx="13" cy="20" rx="2" ry="3" fill="#3F51B5" />
      <ellipse cx="19" cy="18" rx="2" ry="3" fill="#283593" />
    </g>
  ),

  jostabaer: () => (
    <g>
      <circle cx="12" cy="18" r="3.5" fill="#311B92" />
      <circle cx="18" cy="16" r="3.5" fill="#4527A0" />
      <circle cx="15" cy="22" r="3" fill="#311B92" />
      <circle cx="20" cy="21" r="3" fill="#4527A0" />
      <path d="M14 14 Q14 8 12 5" stroke="#388E3C" strokeWidth="1" fill="none" />
      <ellipse cx="12" cy="4" rx="3" ry="2" fill="#43A047" />
    </g>
  ),

  gojibaer: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="8" stroke="#5D4037" strokeWidth="1.5" />
      <ellipse cx="12" cy="14" rx="4" ry="2" fill="#43A047" transform="rotate(-15 12 14)" />
      <ellipse cx="20" cy="14" rx="4" ry="2" fill="#388E3C" transform="rotate(15 20 14)" />
      <ellipse cx="11" cy="20" rx="1.5" ry="3" fill="#E53935" />
      <ellipse cx="16" cy="18" rx="1.5" ry="3" fill="#EF5350" />
      <ellipse cx="21" cy="20" rx="1.5" ry="3" fill="#E53935" />
    </g>
  ),

  tranebaer: () => (
    <g>
      <path d="M4 20 Q16 16 28 20" stroke="#33691E" strokeWidth="1" fill="none" />
      <ellipse cx="8" cy="18" rx="3" ry="2" fill="#388E3C" />
      <ellipse cx="16" cy="16" rx="3" ry="2" fill="#43A047" />
      <ellipse cx="24" cy="18" rx="3" ry="2" fill="#388E3C" />
      <circle cx="10" cy="22" r="2.5" fill="#C62828" />
      <circle cx="16" cy="24" r="2.5" fill="#D32F2F" />
      <circle cx="22" cy="22" r="2.5" fill="#C62828" />
    </g>
  ),

  soelvblad: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="8" stroke="#5D4037" strokeWidth="2" />
      <ellipse cx="10" cy="14" rx="5" ry="3" fill="#B0BEC5" transform="rotate(-15 10 14)" />
      <ellipse cx="22" cy="14" rx="5" ry="3" fill="#CFD8DC" transform="rotate(15 22 14)" />
      <ellipse cx="10" cy="22" rx="5" ry="3" fill="#B0BEC5" />
      <ellipse cx="22" cy="22" rx="5" ry="3" fill="#CFD8DC" />
    </g>
  ),

  vinbrombaer: () => (
    <g>
      <circle cx="12" cy="16" r="3" fill="#4A148C" />
      <circle cx="18" cy="14" r="3" fill="#6A1B9A" />
      <circle cx="15" cy="20" r="3" fill="#4A148C" />
      <circle cx="20" cy="19" r="2.5" fill="#6A1B9A" />
      <path d="M15 12 Q15 6 13 3" stroke="#388E3C" strokeWidth="1" fill="none" />
    </g>
  ),

  loganbaer: () => (
    <g>
      <circle cx="12" cy="16" r="3" fill="#C62828" />
      <circle cx="18" cy="14" r="3" fill="#D32F2F" />
      <circle cx="15" cy="20" r="3" fill="#B71C1C" />
      <circle cx="20" cy="19" r="2.5" fill="#C62828" />
      <path d="M15 12 Q15 6 13 3" stroke="#388E3C" strokeWidth="1" fill="none" />
    </g>
  ),

  taybaer: () => (
    <g>
      <circle cx="12" cy="16" r="3" fill="#880E4F" />
      <circle cx="18" cy="14" r="3" fill="#AD1457" />
      <circle cx="15" cy="20" r="3" fill="#880E4F" />
      <circle cx="20" cy="19" r="2.5" fill="#AD1457" />
      <path d="M15 12 Q15 6 13 3" stroke="#388E3C" strokeWidth="1" fill="none" />
    </g>
  ),

  boysenbaer: () => (
    <g>
      <circle cx="12" cy="16" r="3" fill="#4A148C" />
      <circle cx="18" cy="14" r="3" fill="#311B92" />
      <circle cx="15" cy="20" r="3" fill="#4A148C" />
      <circle cx="20" cy="19" r="2.5" fill="#311B92" />
      <path d="M15 12 Q15 6 13 3" stroke="#388E3C" strokeWidth="1" fill="none" />
    </g>
  ),

  boeffelbaer: () => (
    <g>
      <circle cx="16" cy="16" r="6" fill="#388E3C" />
      <circle cx="16" cy="16" r="4" fill="#43A047" />
      <circle cx="14" cy="22" r="2.5" fill="#FFB300" />
      <circle cx="18" cy="22" r="2.5" fill="#FFA000" />
      <line x1="16" y1="10" x2="16" y2="4" stroke="#5D4037" strokeWidth="1.5" />
    </g>
  ),

  minikiwi: () => (
    <g>
      <path d="M6 28 Q12 18 16 12 Q20 8 26 2" stroke="#33691E" strokeWidth="1.5" fill="none" />
      <ellipse cx="10" cy="20" rx="4" ry="3" fill="#43A047" />
      <ellipse cx="18" cy="12" rx="4" ry="3" fill="#388E3C" />
      <ellipse cx="12" cy="24" rx="2" ry="2.5" fill="#689F38" />
      <ellipse cx="20" cy="16" rx="2" ry="2.5" fill="#7CB342" />
    </g>
  ),

  akebia: () => (
    <g>
      <path d="M6 28 Q14 16 16 12 Q18 8 26 2" stroke="#5D4037" strokeWidth="1.5" fill="none" />
      <path d="M10 20 Q8 18 10 16 Q12 18 10 20" fill="#43A047" />
      <path d="M14 16 Q12 14 14 12 Q16 14 14 16" fill="#388E3C" />
      <path d="M20 10 Q18 8 20 6 Q22 8 20 10" fill="#43A047" />
      <ellipse cx="12" cy="22" rx="2" ry="3" fill="#7E57C2" />
      <ellipse cx="22" cy="8" rx="2" ry="3" fill="#9575CD" />
    </g>
  ),

  magnoliavin: () => (
    <g>
      <path d="M6 28 Q14 16 16 12 Q18 8 26 2" stroke="#5D4037" strokeWidth="1.5" fill="none" />
      <ellipse cx="10" cy="20" rx="5" ry="3" fill="#388E3C" />
      <ellipse cx="20" cy="10" rx="5" ry="3" fill="#43A047" />
      <circle cx="12" cy="24" r="2" fill="#E53935" />
      <circle cx="22" cy="14" r="2" fill="#C62828" />
    </g>
  ),

  morbaer: () => (
    <g>
      <rect x="14" y="18" width="4" height="12" rx="1" fill="#5D4037" />
      <circle cx="16" cy="12" r="10" fill="#2E7D32" />
      <circle cx="12" cy="10" r="5" fill="#388E3C" />
      <circle cx="20" cy="10" r="5" fill="#43A047" />
      <circle cx="14" cy="16" r="2" fill="#311B92" />
      <circle cx="18" cy="15" r="2" fill="#4527A0" />
    </g>
  ),

  baermispel: () => (
    <g>
      <rect x="14" y="18" width="4" height="12" rx="1" fill="#5D4037" />
      <circle cx="16" cy="12" r="9" fill="#388E3C" />
      <circle cx="16" cy="10" r="5" fill="#43A047" />
      <circle cx="14" cy="16" r="2.5" fill="#283593" />
      <circle cx="19" cy="15" r="2" fill="#3949AB" />
    </g>
  ),

  pawpaw: () => (
    <g>
      <rect x="15" y="18" width="2" height="12" rx="0.5" fill="#5D4037" />
      <ellipse cx="16" cy="12" rx="9" ry="8" fill="#388E3C" />
      <circle cx="16" cy="10" r="5" fill="#43A047" />
      <ellipse cx="14" cy="16" rx="2.5" ry="3.5" fill="#CDDC39" />
      <ellipse cx="20" cy="15" rx="2.5" ry="3" fill="#C0CA33" />
    </g>
  ),

  kirsebeerkornel: () => (
    <g>
      <rect x="15" y="18" width="2" height="12" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="8" fill="#388E3C" />
      <circle cx="16" cy="10" r="4" fill="#43A047" />
      <circle cx="13" cy="16" r="2" fill="#C62828" />
      <circle cx="18" cy="15" r="2" fill="#D32F2F" />
    </g>
  ),

  paerrekvaede: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="14" r="8" fill="#388E3C" />
      <circle cx="16" cy="12" r="5" fill="#43A047" />
      <ellipse cx="15" cy="18" rx="2.5" ry="3" fill="#CDDC39" />
    </g>
  ),

  mandel: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="9" fill="#F8BBD0" />
      <circle cx="12" cy="10" r="4" fill="#F48FB1" />
      <circle cx="20" cy="10" r="4" fill="#FCE4EC" />
      <circle cx="16" cy="8" r="3.5" fill="#F06292" />
    </g>
  ),

  jujube: () => (
    <g>
      <rect x="15" y="18" width="2" height="12" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="8" fill="#388E3C" />
      <circle cx="16" cy="10" r="4" fill="#43A047" />
      <ellipse cx="14" cy="16" rx="2" ry="3" fill="#8D6E63" />
      <ellipse cx="18" cy="15" rx="2" ry="3" fill="#795548" />
    </g>
  ),

  kaki: () => (
    <g>
      <rect x="15" y="18" width="2" height="12" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="8" fill="#388E3C" />
      <circle cx="16" cy="10" r="4" fill="#43A047" />
      <circle cx="15" cy="16" r="3.5" fill="#E65100" />
      <circle cx="15" cy="16" r="2" fill="#EF6C00" />
    </g>
  ),

  szechuanpeber: () => (
    <g>
      <rect x="15" y="20" width="2" height="10" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="14" r="8" fill="#388E3C" />
      <circle cx="12" cy="12" r="4" fill="#43A047" />
      <circle cx="20" cy="12" r="4" fill="#2E7D32" />
      <circle cx="14" cy="18" r="1.5" fill="#D32F2F" />
      <circle cx="18" cy="17" r="1.5" fill="#C62828" />
    </g>
  ),

  sumak: () => (
    <g>
      <rect x="15" y="18" width="2" height="12" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="8" fill="#E65100" />
      <circle cx="12" cy="10" r="4" fill="#EF6C00" />
      <circle cx="20" cy="10" r="4" fill="#F57C00" />
      <ellipse cx="16" cy="6" rx="3" ry="5" fill="#B71C1C" />
    </g>
  ),

  "sibirisk-aertetrae": () => (
    <g>
      <rect x="15" y="18" width="2" height="12" rx="0.5" fill="#5D4037" />
      <circle cx="16" cy="12" r="8" fill="#81C784" />
      <circle cx="12" cy="10" r="4" fill="#A5D6A7" />
      <circle cx="20" cy="10" r="4" fill="#66BB6A" />
      <circle cx="14" cy="8" r="2" fill="#FDD835" />
      <circle cx="18" cy="6" r="2" fill="#FFEE58" />
    </g>
  ),

  // ─── Specielle grøntsager ──────────────────────────────────────────────
  blaerenoed: () => (
    <g>
      <ellipse cx="16" cy="18" rx="8" ry="6" fill="#F5F5DC" />
      <ellipse cx="16" cy="18" rx="6" ry="4" fill="#FFFDE7" />
      <line x1="16" y1="12" x2="16" y2="6" stroke="#388E3C" strokeWidth="1.5" />
      <ellipse cx="14" cy="6" rx="3" ry="2" fill="#43A047" />
      <ellipse cx="18" cy="5" rx="3" ry="2" fill="#388E3C" />
    </g>
  ),

  "engelsk-spinat": () => (
    <g>
      <ellipse cx="12" cy="16" rx="5" ry="7" fill="#1B5E20" transform="rotate(-10 12 16)" />
      <ellipse cx="20" cy="16" rx="5" ry="7" fill="#2E7D32" transform="rotate(10 20 16)" />
      <ellipse cx="16" cy="14" rx="4" ry="6" fill="#388E3C" />
    </g>
  ),

  stolthenriks: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#33691E" strokeWidth="1.5" />
      <path d="M16 14 Q10 10 8 12 Q10 16 14 16" fill="#2E7D32" />
      <path d="M16 14 Q22 10 24 12 Q22 16 18 16" fill="#388E3C" />
      <circle cx="14" cy="6" r="1.5" fill="#FFFFFF" />
      <circle cx="16" cy="5" r="1.5" fill="#FFFFFF" />
      <circle cx="18" cy="6" r="1.5" fill="#FFFFFF" />
    </g>
  ),

  takkeklap: () => (
    <g>
      <path d="M8 16 Q16 4 24 16 Q16 28 8 16Z" fill="#558B2F" />
      <path d="M10 16 Q16 6 22 16 Q16 26 10 16Z" fill="#689F38" opacity="0.5" />
      <line x1="16" y1="8" x2="16" y2="24" stroke="#33691E" strokeWidth="0.5" />
    </g>
  ),

  strandkaal: () => (
    <g>
      <circle cx="16" cy="16" r="10" fill="#78909C" />
      <circle cx="16" cy="14" r="7" fill="#90A4AE" />
      <circle cx="16" cy="12" r="4" fill="#B0BEC5" />
      <line x1="16" y1="26" x2="16" y2="30" stroke="#5D4037" strokeWidth="1.5" />
    </g>
  ),

  "krybende-laebeloes": () => (
    <g>
      <path d="M4 20 Q16 14 28 20" stroke="#33691E" strokeWidth="1" fill="none" />
      <ellipse cx="8" cy="18" rx="3" ry="2" fill="#43A047" />
      <ellipse cx="16" cy="14" rx="3" ry="2" fill="#388E3C" />
      <ellipse cx="24" cy="18" rx="3" ry="2" fill="#43A047" />
      <circle cx="8" cy="16" r="1.5" fill="#AB47BC" />
      <circle cx="16" cy="12" r="1.5" fill="#9C27B0" />
      <circle cx="24" cy="16" r="1.5" fill="#AB47BC" />
    </g>
  ),

  anisisop: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="8" stroke="#558B2F" strokeWidth="1.2" />
      <ellipse cx="12" cy="18" rx="4" ry="2.5" fill="#43A047" transform="rotate(-15 12 18)" />
      <ellipse cx="20" cy="18" rx="4" ry="2.5" fill="#388E3C" transform="rotate(15 20 18)" />
      <ellipse cx="16" cy="6" rx="2.5" ry="4" fill="#7E57C2" />
    </g>
  ),

  bibernelle: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#558B2F" strokeWidth="1" />
      <path d="M16 14 Q12 10 9 12" stroke="#66BB6A" strokeWidth="0.5" fill="none" />
      <path d="M16 14 Q20 10 23 12" stroke="#66BB6A" strokeWidth="0.5" fill="none" />
      <path d="M16 20 Q13 17 10 19" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <path d="M16 20 Q19 17 22 19" stroke="#81C784" strokeWidth="0.5" fill="none" />
      <circle cx="16" cy="6" r="3" fill="#FFFFFF" />
    </g>
  ),

  blaeresmaelder: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#33691E" strokeWidth="1.5" />
      <ellipse cx="11" cy="14" rx="5" ry="3.5" fill="#43A047" transform="rotate(-10 11 14)" />
      <ellipse cx="21" cy="14" rx="5" ry="3.5" fill="#388E3C" transform="rotate(10 21 14)" />
      <circle cx="14" cy="6" r="2" fill="#FFFFFF" />
      <circle cx="16" cy="5" r="2" fill="#FFFFFF" />
      <circle cx="18" cy="6" r="2" fill="#FFFFFF" />
    </g>
  ),

  braendenaelder: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="8" stroke="#33691E" strokeWidth="1.5" />
      <path d="M16 12 Q10 8 8 10 Q10 14 14 14" fill="#2E7D32" />
      <path d="M16 12 Q22 8 24 10 Q22 14 18 14" fill="#388E3C" />
      <path d="M16 18 Q10 14 8 16 Q10 20 14 19" fill="#43A047" />
      <path d="M16 18 Q22 14 24 16 Q22 20 18 19" fill="#2E7D32" />
      {/* Stinging hairs hint */}
      <line x1="8" y1="12" x2="6" y2="11" stroke="#66BB6A" strokeWidth="0.3" />
      <line x1="24" y1="12" x2="26" y2="11" stroke="#66BB6A" strokeWidth="0.3" />
    </g>
  ),

  bronzefennikel: () => (
    <g>
      <ellipse cx="16" cy="24" rx="6" ry="4" fill="#795548" />
      <path d="M14 20 Q12 12 8 4" stroke="#8D6E63" strokeWidth="1" fill="none" />
      <path d="M16 19 Q16 10 16 2" stroke="#A1887F" strokeWidth="1" fill="none" />
      <path d="M18 20 Q20 12 24 4" stroke="#8D6E63" strokeWidth="1" fill="none" />
      <path d="M12 12 Q10 11 9 12" stroke="#BCAAA4" strokeWidth="0.5" fill="none" />
      <path d="M20 12 Q22 11 23 12" stroke="#BCAAA4" strokeWidth="0.5" fill="none" />
    </g>
  ),

  korsknap: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#558B2F" strokeWidth="1.2" />
      <ellipse cx="12" cy="18" rx="3.5" ry="2" fill="#43A047" />
      <ellipse cx="20" cy="18" rx="3.5" ry="2" fill="#388E3C" />
      <circle cx="16" cy="6" r="4" fill="#5C6BC0" />
      <circle cx="16" cy="6" r="2" fill="#3F51B5" />
    </g>
  ),

  moskuskatost: () => (
    <g>
      <circle cx="16" cy="18" r="8" fill="#388E3C" />
      <circle cx="16" cy="18" r="5" fill="#43A047" />
      <circle cx="14" cy="10" r="3" fill="#EC407A" />
      <circle cx="14" cy="10" r="1.5" fill="#F8BBD0" />
      <circle cx="18" cy="8" r="3" fill="#F06292" />
      <circle cx="18" cy="8" r="1.5" fill="#FCE4EC" />
    </g>
  ),

  sankthansurt: () => (
    <g>
      <ellipse cx="16" cy="20" rx="10" ry="6" fill="#689F38" />
      <circle cx="12" cy="18" r="3" fill="#8BC34A" />
      <circle cx="16" cy="16" r="3" fill="#7CB342" />
      <circle cx="20" cy="18" r="3" fill="#8BC34A" />
      <circle cx="14" cy="22" r="2.5" fill="#9CCC65" />
      <circle cx="18" cy="22" r="2.5" fill="#AED581" />
      <circle cx="16" cy="10" r="2" fill="#FDD835" />
    </g>
  ),

  skvalderkaal: () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#33691E" strokeWidth="1.2" />
      <path d="M16 12 Q10 6 6 8 Q8 14 14 14" fill="#43A047" />
      <path d="M16 12 Q22 6 26 8 Q24 14 18 14" fill="#388E3C" />
      <path d="M16 18 Q11 14 8 16 Q10 20 14 19" fill="#4CAF50" />
      <path d="M16 18 Q21 14 24 16 Q22 20 18 19" fill="#43A047" />
      <circle cx="14" cy="6" r="1" fill="#FFFFFF" />
      <circle cx="16" cy="5" r="1" fill="#FFFFFF" />
      <circle cx="18" cy="6" r="1" fill="#FFFFFF" />
    </g>
  ),

  "smalbladet-klokke": () => (
    <g>
      <line x1="16" y1="30" x2="16" y2="10" stroke="#558B2F" strokeWidth="1" />
      <path d="M12 10 Q10 6 12 4 Q14 6 16 8" fill="#5C6BC0" />
      <path d="M16 8 Q18 4 20 6 Q20 10 18 10" fill="#7986CB" />
      <path d="M16 14 Q12 12 12 14 Q14 16 16 16" fill="#3F51B5" />
      <ellipse cx="12" cy="20" rx="3" ry="1.5" fill="#558B2F" />
      <ellipse cx="20" cy="20" rx="3" ry="1.5" fill="#689F38" />
    </g>
  ),

  spinatranke: () => (
    <g>
      <path d="M4 28 Q12 16 16 12 Q20 8 28 4" stroke="#33691E" strokeWidth="1.5" fill="none" />
      <ellipse cx="8" cy="22" rx="4" ry="3" fill="#388E3C" />
      <ellipse cx="16" cy="14" rx="4" ry="3" fill="#2E7D32" />
      <ellipse cx="24" cy="8" rx="4" ry="3" fill="#43A047" />
      <circle cx="10" cy="26" r="2" fill="#2E7D32" opacity="0.6" />
    </g>
  ),

};

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the SVG icon component for a given plant id.
 * Returns null if no custom icon exists (falls back to emoji).
 */
export function getPlantSvgIcon(plantId: string): PlantSvgIcon | null {
  // Normalise id: replace hyphens with lookup
  return icons[plantId] ?? null;
}

/**
 * Render a plant SVG icon to an HTML string for use in Leaflet DivIcon etc.
 * Returns null if no custom icon exists for the given plant id.
 */
export function getPlantSvgIconHtml(plantId: string, size = 24): string | null {
  const IconFn = icons[plantId];
  if (!IconFn) return null;
  // Use React.createElement + renderToStaticMarkup at runtime
  // Since this is client-side code, we build the SVG string manually
  // by rendering the icon to a temporary container
  try {
    const element = React.createElement(
      "svg",
      { width: size, height: size, viewBox: "0 0 32 32", xmlns: "http://www.w3.org/2000/svg" },
      React.createElement(IconFn)
    );
    return ReactDOMServer.renderToStaticMarkup(element);
  } catch {
    return null;
  }
}

/**
 * Check if a plant id has a custom SVG icon
 */
export function hasPlantSvgIcon(plantId: string): boolean {
  return plantId in icons;
}

/**
 * Get list of all plant ids that have SVG icons
 */
export function getPlantSvgIconIds(): string[] {
  return Object.keys(icons);
}
