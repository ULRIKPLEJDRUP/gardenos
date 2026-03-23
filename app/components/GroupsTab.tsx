"use client";
import React, { useState, memo } from "react";

/* ─────────── Types ─────────── */

export interface GroupInfo {
  id: string;
  name: string;
  memberCount: number;
  members: { id: string; label: string }[];
}

/* ─────────── Props ─────────── */

export interface GroupsTabProps {
  allGroups: GroupInfo[];
  highlightedGroupId: string | null;
  setHighlightedGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  onFitGroupBounds: (groupId: string) => void;
  selectFeatureById: (id: string) => void;
  dissolveGroupById: (id: string) => void;
  removeFromGroupById: (memberId: string) => void;
  renameGroup: (id: string, newName: string) => void;
}

/* ─────────── Component ─────────── */

function GroupsTabInner({
  allGroups,
  highlightedGroupId,
  setHighlightedGroupId,
  onFitGroupBounds,
  selectFeatureById,
  dissolveGroupById,
  removeFromGroupById,
  renameGroup,
}: GroupsTabProps) {
  // ── Internal state (moved from GardenMapClient) ──
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());

  return (
    <div className="mt-3 space-y-3">
      {allGroups.length === 0 ? (
        <p className="text-sm text-foreground/70">
          Ingen grupper endnu. Vælg flere elementer med Shift+klik og tryk &quot;Gruppér&quot;.
        </p>
      ) : (
        allGroups.map((g) => {
          const isHighlighted = highlightedGroupId === g.id;
          const isCollapsed = collapsedGroupIds.has(g.id);
          const toggleHighlight = () => {
            setHighlightedGroupId(isHighlighted ? null : g.id);
            if (!isHighlighted) {
              onFitGroupBounds(g.id);
            }
          };
          const toggleCollapse = (e: React.MouseEvent) => {
            e.stopPropagation();
            setCollapsedGroupIds((prev) => {
              const next = new Set(prev);
              if (next.has(g.id)) { next.delete(g.id); } else { next.add(g.id); }
              return next;
            });
          };
          return (
            <div
              key={g.id}
              className={`gardenos-group-card rounded-lg text-sm transition-all ${
                isHighlighted
                  ? "gardenos-group-card--active shadow-md"
                  : "border border-border bg-background hover:shadow-sm"
              }`}
              onClick={toggleHighlight}
              style={{ cursor: "pointer" }}
              title="Klik for at markere gruppen på kortet"
            >
              <div className="flex items-start gap-2 p-3 pb-1">
                {/* Collapse chevron */}
                <button
                  type="button"
                  className="mt-0.5 shrink-0 w-5 h-5 flex items-center justify-center rounded text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-all"
                  onClick={toggleCollapse}
                  title={isCollapsed ? "Vis medlemmer" : "Skjul medlemmer"}
                >
                  <span className="text-xs" style={{ transition: "transform 0.2s", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
                </button>
                <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <input
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-foreground hover:border-foreground/20 focus:border-foreground/30 focus:outline-none"
                    value={g.name}
                    onChange={(e) => renameGroup(g.id, e.target.value)}
                    title="Klik for at omdøbe gruppen"
                  />
                  <p className="mt-0.5 px-1 text-xs text-foreground/60">
                    {g.memberCount} {g.memberCount === 1 ? "element" : "elementer"}
                    {isHighlighted ? " · markeret på kort" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-red-300 bg-background px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  onClick={(e) => { e.stopPropagation(); dissolveGroupById(g.id); }}
                  title="Slet gruppen (elementer beholdes)"
                >
                  Slet
                </button>
              </div>
              {/* Collapsible member list */}
              {!isCollapsed && (
                <div className="px-3 pb-2.5 pt-1 space-y-0.5" onClick={(e) => e.stopPropagation()}>
                  {g.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        className="flex-1 cursor-pointer text-left text-xs text-foreground/70 hover:text-foreground hover:underline"
                        onClick={() => selectFeatureById(m.id)}
                        title="Gå til element i Indholdsfanen"
                      >
                        • {m.label}
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded px-1 text-xs text-foreground/40 hover:bg-red-50 hover:text-red-500"
                        onClick={() => removeFromGroupById(m.id)}
                        title="Fjern fra gruppen"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {g.memberCount > 8 ? (
                    <div className="text-xs text-foreground/50">… +{g.memberCount - 8} flere</div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })
      )}
      <p className="text-xs text-foreground/60">
        Tip: Shift+klik for at vælge flere elementer, derefter &quot;Gruppér&quot;.
      </p>
    </div>
  );
}

const GroupsTab = memo(GroupsTabInner);
export default GroupsTab;
