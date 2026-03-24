// ---------------------------------------------------------------------------
// GardenOS – Season Timeline Component for Design Lab
// ---------------------------------------------------------------------------
// Visual timeline showing 12 months as columns with each plant's growth
// phases displayed as colored bars. Interactive – click a month to change
// the main Design Lab season slider.
// ---------------------------------------------------------------------------

"use client";

import { memo, useMemo } from "react";
import type { PlantSpecies } from "../../lib/plantTypes";
import type { BedElement } from "../../lib/bedLayoutTypes";
import { getPlantById } from "../../lib/plantStore";
import { MONTH_NAMES_DA, getPhase, type PlantCalendar } from "../../lib/seasonColors";
import { getPlantBloomMonths, getPlantFlowerHex } from "../../lib/smartAutoFill";

// Phase → color + Danish label
const PHASE_COLORS: Record<string, { bg: string; label: string }> = {
  dormant:    { bg: "#94a3b8", label: "Hvile" },
  sprouting:  { bg: "#facc15", label: "Spiring" },
  growing:    { bg: "#22c55e", label: "Vækst" },
  flowering:  { bg: "#f472b6", label: "Blomstring" },
  fruiting:   { bg: "#f97316", label: "Frugt" },
  harvesting: { bg: "#ef4444", label: "Høst" },
  dying:      { bg: "#78716c", label: "Visner" },
};

type SeasonTimelineProps = {
  elements: BedElement[];
  plants: {
    speciesId: string;
    name: string;
    icon: string;
    category?: string;
    sowMonth?: number | null;
    growStart?: number;
    flowerMonth?: number | null;
    harvestStart?: number | null;
    harvestEnd?: number | null;
    dieMonth?: number | null;
  }[];
  currentMonth: number;
  onMonthChange: (month: number) => void;
  calendarFromSpecies: (sp: PlantSpecies) => PlantCalendar;
};

function SeasonTimelineInner({
  elements,
  plants,
  currentMonth,
  onMonthChange,
  calendarFromSpecies,
}: SeasonTimelineProps) {
  // Build unique species list from elements + props
  const speciesRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: {
      id: string;
      name: string;
      icon: string;
      cal: PlantCalendar;
      category: string;
      bloomHex: string | null;
    }[] = [];

    // From props (original plants)
    for (const p of plants) {
      if (seen.has(p.speciesId)) continue;
      seen.add(p.speciesId);
      const sp = getPlantById(p.speciesId);
      const cal: PlantCalendar = sp
        ? calendarFromSpecies(sp)
        : {
            sowMonth: p.sowMonth ?? null,
            growStart: p.growStart ?? 4,
            flowerMonth: p.flowerMonth ?? null,
            harvestStart: p.harvestStart ?? null,
            harvestEnd: p.harvestEnd ?? null,
            dieMonth: p.dieMonth ?? null,
          };
      rows.push({
        id: p.speciesId,
        name: p.name,
        icon: p.icon,
        cal,
        category: p.category ?? sp?.category ?? "vegetable",
        bloomHex: sp ? getPlantFlowerHex(sp) : null,
      });
    }

    // From placed elements not in props
    for (const el of elements) {
      if (!el.speciesId || seen.has(el.speciesId)) continue;
      seen.add(el.speciesId);
      const sp = getPlantById(el.speciesId);
      if (!sp) continue;
      rows.push({
        id: sp.id,
        name: sp.name,
        icon: sp.icon ?? "🌱",
        cal: calendarFromSpecies(sp),
        category: sp.category ?? "vegetable",
        bloomHex: getPlantFlowerHex(sp),
      });
    }

    return rows;
  }, [elements, plants, calendarFromSpecies]);

  if (speciesRows.length === 0) {
    return (
      <div className="p-4 text-center text-xs" style={{ color: "var(--muted)" }}>
        Ingen planter i bedet endnu. Tilføj planter for at se sæsontidslinje.
      </div>
    );
  }

  const monthAbbr = ["", "J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  return (
    <div className="w-full overflow-x-auto">
      {/* Header: Month columns */}
      <div className="flex items-end mb-1">
        <div className="w-[110px] flex-shrink-0" />
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <button
            key={m}
            onClick={() => onMonthChange(m)}
            className="flex-1 min-w-[22px] text-center text-[8px] font-medium py-0.5 rounded-t transition-colors"
            style={{
              background: m === currentMonth ? "var(--accent)" : "transparent",
              color: m === currentMonth ? "#fff" : "var(--muted)",
            }}
            title={MONTH_NAMES_DA[m]}
          >
            {monthAbbr[m]}
          </button>
        ))}
      </div>

      {/* Plant rows */}
      {speciesRows.map((row) => (
        <div key={row.id} className="flex items-center h-6 mb-0.5">
          {/* Plant label */}
          <div
            className="w-[110px] flex-shrink-0 flex items-center gap-1 pr-1 truncate"
            title={row.name}
          >
            <span className="text-xs">{row.icon}</span>
            <span className="text-[9px] truncate" style={{ color: "var(--foreground)" }}>
              {row.name}
            </span>
          </div>

          {/* Month cells */}
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const phase = getPhase(row.cal, m);
            const phaseInfo = PHASE_COLORS[phase] ?? PHASE_COLORS.dormant;
            const isCurrentMonth = m === currentMonth;

            // Use bloom color for flowering phase if available
            const cellBg = phase === "flowering" && row.bloomHex
              ? row.bloomHex
              : phase === "dormant"
                ? "transparent"
                : phaseInfo.bg;

            return (
              <div
                key={m}
                className="flex-1 min-w-[22px] h-full flex items-center justify-center relative"
                title={`${row.name} – ${MONTH_NAMES_DA[m]}: ${phaseInfo.label}`}
              >
                <div
                  className="w-full h-4 rounded-sm transition-all"
                  style={{
                    background: cellBg,
                    opacity: phase === "dormant" ? 0.15 : 0.75,
                    border: isCurrentMonth ? "1.5px solid var(--accent)" : "none",
                    boxShadow: isCurrentMonth ? "0 0 0 1px var(--accent)" : "none",
                  }}
                />
                {/* Phase icon overlay */}
                {phase !== "dormant" && (
                  <span className="absolute text-[7px] pointer-events-none select-none" style={{ opacity: 0.9 }}>
                    {phase === "sprouting" ? "🌱" : phase === "flowering" ? "🌸" : phase === "harvesting" ? "🔴" : phase === "fruiting" ? "🍊" : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-2 mt-2 pt-1 border-t flex-wrap" style={{ borderColor: "var(--border)" }}>
        {Object.entries(PHASE_COLORS)
          .filter(([key]) => key !== "dormant")
          .map(([key, { bg, label }]) => (
            <div key={key} className="flex items-center gap-1">
              <div className="w-3 h-2.5 rounded-sm" style={{ background: bg, opacity: 0.75 }} />
              <span className="text-[8px]" style={{ color: "var(--muted)" }}>{label}</span>
            </div>
          ))}
      </div>

      {/* Bloom coverage summary */}
      <div className="mt-1 text-[9px]" style={{ color: "var(--muted)" }}>
        {(() => {
          const bloomMonths = new Set<number>();
          for (const row of speciesRows) {
            const sp = getPlantById(row.id);
            if (sp) {
              const bloom = getPlantBloomMonths(sp);
              if (bloom) {
                if (bloom.from <= bloom.to) {
                  for (let m = bloom.from; m <= bloom.to; m++) bloomMonths.add(m);
                } else {
                  for (let m = bloom.from; m <= 12; m++) bloomMonths.add(m);
                  for (let m = 1; m <= bloom.to; m++) bloomMonths.add(m);
                }
              }
            }
          }
          if (bloomMonths.size === 0) return "Ingen kendt blomstringsdata.";
          if (bloomMonths.size === 12) return "🎉 Blomstring alle 12 måneder!";
          return `🌸 Blomstring i ${bloomMonths.size}/12 måneder.`;
        })()}
      </div>
    </div>
  );
}

const SeasonTimeline = memo(SeasonTimelineInner);
export default SeasonTimeline;
