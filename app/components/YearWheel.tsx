"use client";

import { useCallback, useMemo, useState } from "react";
import { getPlantById, loadPlantInstances, formatMonthRange, removeOrphanedInstances } from "../lib/plantStore";
import type { PlantSpecies, PlantCategory, PlantInstance } from "../lib/plantTypes";
import { PLANT_CATEGORY_LABELS } from "../lib/plantTypes";
import {
  MONTH_LABELS,
  MONTH_SHORT,
  MONTH_EMOJIS,
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_ICONS,
  TASK_CATEGORY_COLORS,
  generatePlantTasks,
  loadCustomTasks,
  loadCompletedIds,
  saveCompletedIds,
  addCustomTask,
  deleteCustomTask,
  type YearWheelTask,
  type TaskCategory,
} from "../lib/yearWheelStore";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface YearWheelProps {
  plantDataVersion: number;
  plantInstancesVersion: number;
  /** Flash / highlight features on the map by their gardenosIds */
  flashFeatureIds?: (ids: string[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function YearWheel({ plantDataVersion, plantInstancesVersion, flashFeatureIds }: YearWheelProps) {
  // ── State ──
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1); // 1-based
  const [filterCategory, setFilterCategory] = useState<TaskCategory | "all">("all");
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => loadCompletedIds());
  const [customTasks, setCustomTasks] = useState<YearWheelTask[]>(() => loadCustomTasks());
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "year" | "inventory">("month");
  const [expandedInventoryPlant, setExpandedInventoryPlant] = useState<string | null>(null);

  // New task form state
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<TaskCategory>("other");
  const [newDescription, setNewDescription] = useState("");

  // ── Derive plants that are actually planted in this garden ──
  const gardenPlants = useMemo(() => {
    void plantDataVersion;
    void plantInstancesVersion;
    const instances = loadPlantInstances();
    const speciesIds = new Set(instances.map((i) => i.speciesId));
    const plants: PlantSpecies[] = [];
    for (const sid of speciesIds) {
      const sp = getPlantById(sid);
      if (sp) plants.push(sp);
    }
    return plants;
  }, [plantDataVersion, plantInstancesVersion]);

  // ── Feature name lookup (for showing bed/location names) ──
  const featureNameMap = useMemo(() => {
    const map = new Map<string, string>();
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("gardenos:layout:v1") : null;
      if (raw) {
        const layout = JSON.parse(raw);
        if (layout?.features) {
          for (const f of layout.features) {
            const id = f.properties?.gardenosId;
            const name = f.properties?.name || f.properties?.kind || "Ukendt";
            if (id) map.set(id, name);
          }
        }
      }
    } catch {}
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantInstancesVersion]);

  // ── Inventory: plants grouped by category with instance details ──
  const inventory = useMemo(() => {
    // Clean up orphaned instances (feature was deleted but instance lingered)
    const validFeatureIds = new Set(featureNameMap.keys());
    removeOrphanedInstances(validFeatureIds);

    const instances = loadPlantInstances();
    // Group instances by speciesId
    const bySpecies = new Map<string, PlantInstance[]>();
    for (const inst of instances) {
      const arr = bySpecies.get(inst.speciesId) ?? [];
      arr.push(inst);
      bySpecies.set(inst.speciesId, arr);
    }
    // Build grouped structure
    type InventoryEntry = {
      species: PlantSpecies;
      instances: PlantInstance[];
      totalCount: number;
      locations: string[];
    };
    const grouped = new Map<PlantCategory, InventoryEntry[]>();
    for (const [speciesId, insts] of bySpecies) {
      const sp = getPlantById(speciesId);
      if (!sp) continue;
      const cat = sp.category;
      const entry: InventoryEntry = {
        species: sp,
        instances: insts,
        totalCount: insts.reduce((sum, i) => sum + (i.count ?? 1), 0),
        locations: [...new Set(insts.map((i) => featureNameMap.get(i.featureId) ?? "Ukendt sted"))],
      };
      const arr = grouped.get(cat) ?? [];
      arr.push(entry);
      grouped.set(cat, arr);
    }
    // Sort entries within each category
    for (const [, entries] of grouped) {
      entries.sort((a, b) => a.species.name.localeCompare(b.species.name, "da"));
    }
    // Sort categories by predefined order
    const catOrder: PlantCategory[] = [
      "vegetable", "fruit", "herb", "flower", "tree", "bush",
      "perennial", "grass", "climber", "cover-crop", "soil-amendment",
    ];
    const sorted: [PlantCategory, InventoryEntry[]][] = [];
    for (const cat of catOrder) {
      const entries = grouped.get(cat);
      if (entries?.length) sorted.push([cat, entries]);
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gardenPlants, featureNameMap]);

  const inventoryTotalSpecies = useMemo(() => inventory.reduce((s, [, e]) => s + e.length, 0), [inventory]);
  const inventoryTotalCount = useMemo(() => inventory.reduce((s, [, entries]) => s + entries.reduce((ss, e) => ss + e.totalCount, 0), 0), [inventory]);

  // ── All auto-generated plant tasks (for entire year, cached) ──
  const allPlantTasksYear = useMemo(() => {
    return generatePlantTasks(gardenPlants).map((t, i) => ({
      ...t,
      id: `plant-${t.month}-${t.speciesId}-${t.category}-${i}`,
    }));
  }, [gardenPlants]);

  // ── Track which (speciesId, category) combos were completed and when ──
  // If "Plant Æbletræ ud" was completed in Feb, hide it from Mar onward.
  const completedPlantKeys = useMemo(() => {
    const keyMonth = new Map<string, number>(); // "speciesId:category" → earliest month completed
    for (const task of allPlantTasksYear) {
      if (task.speciesId && completedIds.has(task.id)) {
        const key = `${task.speciesId}:${task.category}`;
        const existing = keyMonth.get(key);
        if (existing === undefined || task.month < existing) {
          keyMonth.set(key, task.month);
        }
      }
    }
    return keyMonth;
  }, [allPlantTasksYear, completedIds]);

  /** Returns true if a plant task should be hidden (completed in an earlier month) */
  const isHiddenByEarlierCompletion = useCallback(
    (task: YearWheelTask) => {
      if (!task.speciesId) return false;
      const key = `${task.speciesId}:${task.category}`;
      const doneInMonth = completedPlantKeys.get(key);
      // Hide if it was completed in a strictly earlier month
      return doneInMonth !== undefined && doneInMonth < task.month;
    },
    [completedPlantKeys]
  );

  // ── Build tasks for the selected month ──
  const tasksForMonth = useMemo(() => {
    // Plant-generated tasks for this garden (hide if completed in earlier month)
    const plantTasks = allPlantTasksYear
      .filter((t) => t.month === selectedMonth)
      .filter((t) => !isHiddenByEarlierCompletion(t));

    // Custom tasks
    const customs = customTasks.filter((t) => t.month === selectedMonth);

    const all = [...plantTasks, ...customs];

    // Apply category filter
    if (filterCategory !== "all") {
      return all.filter((t) => t.category === filterCategory);
    }
    return all;
  }, [selectedMonth, allPlantTasksYear, customTasks, filterCategory, isHiddenByEarlierCompletion]);

  // ── Year overview: count tasks per month ──
  const yearOverview = useMemo(() => {
    const counts: { month: number; total: number; completed: number; categories: Record<string, number> }[] = [];
    for (let m = 1; m <= 12; m++) {
      const plantTasks = allPlantTasksYear
        .filter((t) => t.month === m)
        .filter((t) => !isHiddenByEarlierCompletion(t));
      const customs = customTasks.filter((t) => t.month === m);
      const all = [...plantTasks, ...customs];
      const categories: Record<string, number> = {};
      for (const t of all) {
        categories[t.category] = (categories[t.category] || 0) + 1;
      }
      let completedCount = 0;
      for (const t of all) {
        if (completedIds.has(t.id)) completedCount++;
      }
      counts.push({ month: m, total: all.length, completed: completedCount, categories });
    }
    return counts;
  }, [allPlantTasksYear, customTasks, completedIds, isHiddenByEarlierCompletion]);

  // ── Handlers ──
  const toggleComplete = useCallback((id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveCompletedIds(next);
      return next;
    });
  }, []);

  const handleAddTask = useCallback(() => {
    if (!newTitle.trim()) return;
    addCustomTask({
      month: selectedMonth,
      title: newTitle.trim(),
      category: newCategory,
      description: newDescription.trim() || undefined,
    });
    setCustomTasks(loadCustomTasks());
    setNewTitle("");
    setNewCategory("other");
    setNewDescription("");
    setShowAddForm(false);
  }, [newTitle, newCategory, newDescription, selectedMonth]);

  const handleDeleteTask = useCallback((id: string) => {
    deleteCustomTask(id);
    setCustomTasks(loadCustomTasks());
  }, []);

  // ── Group tasks by category ──
  const groupedTasks = useMemo(() => {
    const groups: Record<string, YearWheelTask[]> = {};
    for (const t of tasksForMonth) {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    }
    // Sort categories by predefined order
    const order: TaskCategory[] = [
      "planning", "pre-sprouting", "sowing", "planting", "watering",
      "fertilizing", "pruning", "pest-control", "harvesting",
      "composting", "maintenance", "protection", "other",
    ];
    const sorted: [string, YearWheelTask[]][] = [];
    for (const cat of order) {
      if (groups[cat]) sorted.push([cat, groups[cat]]);
    }
    return sorted;
  }, [tasksForMonth]);

  // Current month highlight
  const currentMonth = new Date().getMonth() + 1;

  // ── Categories present this month (for filter chips) ──
  const categoriesThisMonth = useMemo(() => {
    const cats = new Set<TaskCategory>();
    for (const t of tasksForMonth) cats.add(t.category);
    return cats;
  }, [tasksForMonth]);

  // ── Render ──
  return (
    <div className="mt-2 space-y-3">
      {/* ── View mode toggle ── */}
      <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm">
        <button
          type="button"
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
            viewMode === "month"
              ? "bg-accent text-white shadow-sm"
              : "text-foreground/60 hover:bg-foreground/5"
          }`}
          onClick={() => setViewMode("month")}
        >
          📅 Måned
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
            viewMode === "year"
              ? "bg-accent text-white shadow-sm"
              : "text-foreground/60 hover:bg-foreground/5"
          }`}
          onClick={() => setViewMode("year")}
        >
          🔄 Årsoversigt
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-all ${
            viewMode === "inventory"
              ? "bg-accent text-white shadow-sm"
              : "text-foreground/60 hover:bg-foreground/5"
          }`}
          onClick={() => setViewMode("inventory")}
        >
          🌿 Min have
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── YEAR OVERVIEW ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {viewMode === "year" ? (
        <div className="space-y-2">
          <p className="text-[10px] text-foreground/50 text-center">Tryk på en måned for at se detaljer</p>
          <div className="grid grid-cols-3 gap-2">
            {yearOverview.map((item) => {
              const isCurrentMonth = item.month === currentMonth;
              const progress = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
              return (
                <button
                  key={item.month}
                  type="button"
                  className={`relative rounded-xl border p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    isCurrentMonth
                      ? "border-accent/40 bg-accent-light shadow-md ring-2 ring-accent/20"
                      : "border-border bg-background hover:border-foreground/20 hover:shadow-sm"
                  }`}
                  onClick={() => { setSelectedMonth(item.month); setViewMode("month"); }}
                >
                  {isCurrentMonth && (
                    <span className="absolute -top-1.5 -right-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[8px] text-white font-bold shadow-sm">
                      NU
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-base">{MONTH_EMOJIS[item.month - 1]}</span>
                    <span className={`text-xs font-semibold ${isCurrentMonth ? "text-accent-dark" : "text-foreground/80"}`}>
                      {MONTH_SHORT[item.month - 1]}
                    </span>
                  </div>
                  <div className="text-[10px] text-foreground/50">
                    {item.total} opgave{item.total !== 1 ? "r" : ""}
                  </div>
                  {/* Mini progress bar */}
                  {item.total > 0 && (
                    <div className="mt-1.5 h-1 rounded-full bg-foreground/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500/70 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                  {/* Category dots */}
                  <div className="mt-1.5 flex flex-wrap gap-0.5">
                    {Object.entries(item.categories).slice(0, 5).map(([cat, count]) => (
                      <span
                        key={cat}
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: TASK_CATEGORY_COLORS[cat as TaskCategory] ?? "#9CA3AF" }}
                        title={`${TASK_CATEGORY_LABELS[cat as TaskCategory]}: ${count}`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Legend ── */}
          <div className="mt-3 rounded-lg border border-border bg-background/50 p-3">
            <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wide mb-2">Kategorier</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {(Object.entries(TASK_CATEGORY_LABELS) as [TaskCategory, string][]).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: TASK_CATEGORY_COLORS[key] }} />
                  <span className="text-[10px] text-foreground/60">{TASK_CATEGORY_ICONS[key]} {label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Info about source */}
          {gardenPlants.length > 0 ? (
            <p className="text-[10px] text-foreground/40 text-center">
              Baseret på {gardenPlants.length} plante{gardenPlants.length !== 1 ? "r" : ""} i din have
            </p>
          ) : (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-center">
              <p className="text-xs text-amber-700">🌱 Tilføj planter til dine bede for at se opgaver her</p>
              <p className="text-[10px] text-amber-600/70 mt-1">Gå til et bed → Indhold → tilføj planter</p>
            </div>
          )}
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── MONTH VIEW ── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {viewMode === "month" ? (
        <div className="space-y-3">
          {/* ── Month selector carousel ── */}
          <div className="relative">
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
              {MONTH_LABELS.map((label, i) => {
                const m = i + 1;
                const isSelected = m === selectedMonth;
                const isCurrent = m === currentMonth;
                return (
                  <button
                    key={m}
                    type="button"
                    className={`flex-shrink-0 snap-center rounded-lg px-2.5 py-2 text-center transition-all ${
                      isSelected
                        ? "bg-accent text-white shadow-md scale-105"
                        : isCurrent
                        ? "bg-accent-light text-accent-dark border border-accent/30"
                        : "bg-background border border-border text-foreground/60 hover:bg-foreground/5"
                    }`}
                    onClick={() => setSelectedMonth(m)}
                  >
                    <div className="text-sm leading-none">{MONTH_EMOJIS[i]}</div>
                    <div className="text-[9px] font-semibold mt-0.5">{MONTH_SHORT[i]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Month header ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md p-1 text-foreground/40 hover:bg-foreground/5 hover:text-foreground/70 transition-colors"
                onClick={() => setSelectedMonth((m) => (m <= 1 ? 12 : m - 1))}
              >
                ◀
              </button>
              <h3 className="text-base font-bold text-foreground/90">
                {MONTH_EMOJIS[selectedMonth - 1]} {MONTH_LABELS[selectedMonth - 1]}
              </h3>
              <button
                type="button"
                className="rounded-md p-1 text-foreground/40 hover:bg-foreground/5 hover:text-foreground/70 transition-colors"
                onClick={() => setSelectedMonth((m) => (m >= 12 ? 1 : m + 1))}
              >
                ▶
              </button>
            </div>
            <div className="text-[11px] text-foreground/50">
              {tasksForMonth.length} opgave{tasksForMonth.length !== 1 ? "r" : ""}
            </div>
          </div>

          {/* ── Category filter chips ── */}
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
                filterCategory === "all"
                  ? "bg-accent text-white shadow-sm"
                  : "bg-background border border-border text-foreground/60 hover:bg-foreground/5"
              }`}
              onClick={() => setFilterCategory("all")}
            >
              Alle
            </button>
            {(Object.entries(TASK_CATEGORY_LABELS) as [TaskCategory, string][])
              .filter(([key]) => {
                // Only show categories that have tasks this month (when filter is "all")
                if (filterCategory === "all") return categoriesThisMonth.has(key);
                return true;
              })
              .map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
                  filterCategory === key
                    ? "text-white shadow-sm"
                    : "bg-background border border-border text-foreground/60 hover:bg-foreground/5"
                }`}
                style={filterCategory === key ? { backgroundColor: TASK_CATEGORY_COLORS[key] } : undefined}
                onClick={() => setFilterCategory(filterCategory === key ? "all" : key)}
              >
                {TASK_CATEGORY_ICONS[key]} {label}
              </button>
            ))}
          </div>

          {/* ── Garden plants badge ── */}
          {gardenPlants.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {gardenPlants.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-700 font-medium">
                  {p.icon ?? "🌱"} {p.name}
                </span>
              ))}
            </div>
          ) : null}

          {/* ── Task list grouped by category ── */}
          <div className="space-y-3">
            {groupedTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-foreground/15 p-6 text-center">
                {gardenPlants.length === 0 ? (
                  <>
                    <p className="text-2xl mb-1">🌱</p>
                    <p className="text-xs text-foreground/50">Tilføj planter til dine bede</p>
                    <p className="text-[10px] text-foreground/40 mt-1">Så vil årshjulet automatisk vise opgaver for din have</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl mb-1">✅</p>
                    <p className="text-xs text-foreground/50">Ingen opgaver i {MONTH_LABELS[selectedMonth - 1]}</p>
                  </>
                )}
              </div>
            ) : (
              groupedTasks.map(([category, tasks]) => (
                <div key={category} className="rounded-xl border border-border bg-background/50 overflow-hidden">
                  {/* Category header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 border-b border-border/50"
                    style={{ borderLeftWidth: 3, borderLeftColor: TASK_CATEGORY_COLORS[category as TaskCategory] }}
                  >
                    <span className="text-sm">{TASK_CATEGORY_ICONS[category as TaskCategory]}</span>
                    <span className="text-[11px] font-semibold text-foreground/80">
                      {TASK_CATEGORY_LABELS[category as TaskCategory]}
                    </span>
                    <span className="text-[10px] text-foreground/40 ml-auto">
                      {tasks.filter((t) => completedIds.has(t.id)).length}/{tasks.length}
                    </span>
                  </div>

                  {/* Tasks */}
                  <div className="divide-y divide-border/30">
                    {tasks.map((task) => {
                      const isCompleted = completedIds.has(task.id);
                      const isExpanded = expandedTaskId === task.id;
                      return (
                        <div
                          key={task.id}
                          className={`px-3 py-2 transition-colors ${
                            isCompleted ? "bg-emerald-500/5" : "hover:bg-foreground/[0.02]"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {/* Checkbox */}
                            <button
                              type="button"
                              className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-md border-2 transition-all ${
                                isCompleted
                                  ? "bg-emerald-500 border-emerald-500 text-white"
                                  : "border-foreground/25 hover:border-accent"
                              }`}
                              onClick={() => toggleComplete(task.id)}
                            >
                              {isCompleted && (
                                <svg className="w-3 h-3 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>

                            {/* Title + expand */}
                            <button
                              type="button"
                              className="flex-1 text-left"
                              onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                            >
                              <span className={`text-[11px] leading-tight ${
                                isCompleted ? "line-through text-foreground/40" : "text-foreground/80"
                              }`}>
                                {task.title}
                              </span>
                              {task.speciesId && (
                                <span className="ml-1 inline-block rounded bg-emerald-500/10 px-1 py-0.5 text-[8px] text-emerald-600 font-medium">
                                  plante
                                </span>
                              )}
                              {task.isCustom && (
                                <span className="ml-1 inline-block rounded bg-violet-500/10 px-1 py-0.5 text-[8px] text-violet-600 font-medium">
                                  egen
                                </span>
                              )}
                            </button>

                            {/* Delete custom tasks */}
                            {task.isCustom && (
                              <button
                                type="button"
                                className="flex-shrink-0 text-[10px] text-foreground/30 hover:text-red-500 transition-colors"
                                onClick={() => handleDeleteTask(task.id)}
                                title="Slet opgave"
                              >
                                ✕
                              </button>
                            )}
                          </div>

                          {/* Expanded description */}
                          {isExpanded && task.description && (
                            <div className="mt-1.5 ml-6 text-[10px] text-foreground/50 leading-relaxed bg-foreground/[0.02] rounded-lg p-2">
                              {task.description}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── Add custom task ── */}
          {showAddForm ? (
            <div className="rounded-xl border border-accent/30 bg-accent-light/30 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-foreground/70">✏️ Ny opgave i {MONTH_LABELS[selectedMonth - 1]}</p>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Opgavens titel..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-foreground/30 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(); }}
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TaskCategory)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
              >
                {(Object.entries(TASK_CATEGORY_LABELS) as [TaskCategory, string][]).map(([key, label]) => (
                  <option key={key} value={key}>
                    {TASK_CATEGORY_ICONS[key]} {label}
                  </option>
                ))}
              </select>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Beskrivelse (valgfrit)..."
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-foreground/30 focus:border-accent focus:outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
                  onClick={handleAddTask}
                  disabled={!newTitle.trim()}
                >
                  ＋ Tilføj
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-foreground/60 hover:bg-foreground/5 transition-colors"
                  onClick={() => { setShowAddForm(false); setNewTitle(""); setNewDescription(""); }}
                >
                  Annullér
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="w-full rounded-xl border-2 border-dashed border-foreground/15 py-3 text-[11px] text-foreground/50 hover:border-accent/30 hover:text-accent transition-all hover:bg-accent/5"
              onClick={() => setShowAddForm(true)}
            >
              ＋ Tilføj egen opgave
            </button>
          )}

          {/* ── Monthly summary ── */}
          <div className="rounded-xl border border-border bg-gradient-to-br from-background to-foreground/[0.02] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wide">Fremgang</span>
              <span className="text-[11px] font-bold text-foreground/70">
                {tasksForMonth.filter((t) => completedIds.has(t.id)).length} / {tasksForMonth.length}
              </span>
            </div>
            <div className="h-2 rounded-full bg-foreground/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
                style={{
                  width: `${tasksForMonth.length > 0
                    ? Math.round((tasksForMonth.filter((t) => completedIds.has(t.id)).length / tasksForMonth.length) * 100)
                    : 0}%`,
                }}
              />
            </div>
            {tasksForMonth.length > 0 &&
              tasksForMonth.filter((t) => completedIds.has(t.id)).length === tasksForMonth.length && (
              <p className="mt-2 text-center text-[11px] text-emerald-600 font-medium">
                🎉 Alle opgaver i {MONTH_LABELS[selectedMonth - 1]} er udført!
              </p>
            )}
          </div>
        </div>
      ) : null}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ── INVENTORY / MIN HAVE ── */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {viewMode === "inventory" ? (
        <div className="space-y-3">
          {/* ── Summary header ── */}
          <div className="rounded-xl border border-border bg-gradient-to-br from-emerald-50 to-green-50 p-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground/90">🌿 Min have</h3>
                <p className="text-[10px] text-foreground/50 mt-0.5">Alt hvad du har plantet</p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-accent">{inventoryTotalSpecies}</div>
                <div className="text-[9px] text-foreground/50">
                  {inventoryTotalSpecies === 1 ? "art" : "arter"} · {inventoryTotalCount} {inventoryTotalCount === 1 ? "plante" : "planter"}
                </div>
              </div>
            </div>
          </div>

          {/* ── Empty state ── */}
          {inventory.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/15 p-6 text-center">
              <p className="text-2xl mb-1">🌱</p>
              <p className="text-xs text-foreground/50">Du har ingen planter i haven endnu</p>
              <p className="text-[10px] text-foreground/40 mt-1">Gå til et bed → Indhold → tilføj planter</p>
            </div>
          ) : (
            /* ── Category groups ── */
            inventory.map(([category, entries]) => {
              const CATEGORY_ICONS: Record<string, string> = {
                vegetable: "🥦", fruit: "🍓", herb: "🌿", flower: "🌺",
                tree: "🌳", bush: "🌾", perennial: "🌸", grass: "🌾",
                climber: "🏋️", "cover-crop": "🌱", "soil-amendment": "🪴",
              };
              return (
                <div key={category} className="rounded-xl border border-border bg-background/50 overflow-hidden">
                  {/* Category header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-foreground/[0.02] border-b border-border/50">
                    <span className="text-base">{CATEGORY_ICONS[category] ?? "🌿"}</span>
                    <span className="text-[12px] font-semibold text-foreground/80">
                      {PLANT_CATEGORY_LABELS[category] ?? category}
                    </span>
                    <span className="text-[10px] text-foreground/40 ml-auto">
                      {entries.length} {entries.length === 1 ? "art" : "arter"}
                    </span>
                  </div>

                  {/* Plants in this category */}
                  <div className="divide-y divide-border/30">
                    {entries.map(({ species, instances, totalCount, locations }) => {
                      const isExpanded = expandedInventoryPlant === species.id;
                      return (
                        <div key={species.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2.5 text-left hover:bg-foreground/[0.02] transition-colors"
                            onClick={() => {
                              setExpandedInventoryPlant(isExpanded ? null : species.id);
                              // Flash all feature locations for this plant on the map
                              if (!isExpanded && flashFeatureIds) {
                                flashFeatureIds(instances.map((i) => i.featureId));
                              }
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base flex-shrink-0">{species.icon ?? "🌱"}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[12px] font-medium text-foreground/85 truncate">
                                    {species.name}
                                  </span>
                                  {species.latinName && (
                                    <span className="text-[9px] text-foreground/35 italic truncate">
                                      {species.latinName}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[10px] text-foreground/45">
                                    {totalCount} {totalCount === 1 ? "stk" : "stk"}
                                  </span>
                                  <span className="text-[10px] text-foreground/25">·</span>
                                  <span className="text-[10px] text-foreground/45 truncate">
                                    {locations.join(", ")}
                                  </span>
                                </div>
                              </div>
                              <span className={`text-[10px] text-foreground/30 transition-transform ${
                                isExpanded ? "rotate-90" : ""
                              }`}>▶</span>
                            </div>
                          </button>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-0">
                              <div className="ml-7 space-y-2">
                                {/* Quick info pills */}
                                <div className="flex flex-wrap gap-1">
                                  {species.lifecycle && (
                                    <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[9px] text-foreground/55">
                                      {species.lifecycle === "annual" ? "Étårig" : species.lifecycle === "biennial" ? "Toårig" : "Flerårig"}
                                    </span>
                                  )}
                                  {species.light && (
                                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-700">
                                      {species.light === "full-sun" ? "☀️ Fuld sol" : species.light === "partial-shade" ? "⛅ Halvskygge" : "🌥️ Skygge"}
                                    </span>
                                  )}
                                  {species.water && (
                                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] text-blue-700">
                                      {species.water === "low" ? "💧 Lav" : species.water === "medium" ? "💧💧 Middel" : "💧💧💧 Høj"}
                                    </span>
                                  )}
                                  {species.difficulty && (
                                    <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[9px] text-foreground/55">
                                      {species.difficulty === "easy" ? "🟢 Nem" : species.difficulty === "medium" ? "🟡 Mellem" : "🔴 Svær"}
                                    </span>
                                  )}
                                  {species.frostHardy && (
                                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] text-sky-700">
                                      ❄️ Frosthårdfør
                                    </span>
                                  )}
                                </div>

                                {/* Season timeline */}
                                {(species.sowIndoor || species.sowOutdoor || species.plantOut || species.harvest) && (
                                  <div className="rounded-lg border border-border/50 bg-foreground/[0.02] p-2 space-y-1">
                                    <p className="text-[9px] font-semibold text-foreground/50 uppercase tracking-wide">Årskalender</p>
                                    {species.sowIndoor && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-foreground/40 w-20">🏠 Indendørs</span>
                                        <span className="text-[10px] text-foreground/60">{formatMonthRange(species.sowIndoor)}</span>
                                      </div>
                                    )}
                                    {species.sowOutdoor && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-foreground/40 w-20">🌱 Såning</span>
                                        <span className="text-[10px] text-foreground/60">{formatMonthRange(species.sowOutdoor)}</span>
                                      </div>
                                    )}
                                    {species.plantOut && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-foreground/40 w-20">🌿 Udplant</span>
                                        <span className="text-[10px] text-foreground/60">{formatMonthRange(species.plantOut)}</span>
                                      </div>
                                    )}
                                    {species.harvest && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-foreground/40 w-20">🧲 Høst</span>
                                        <span className="text-[10px] text-foreground/60">{formatMonthRange(species.harvest)}</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Individual instances */}
                                {instances.length > 1 && (
                                  <div className="space-y-1">
                                    <p className="text-[9px] font-semibold text-foreground/50 uppercase tracking-wide">Placeringer</p>
                                    {instances.map((inst) => (
                                      <button
                                        key={inst.id}
                                        type="button"
                                        className="flex items-center gap-2 text-[10px] w-full text-left rounded-md px-1 py-0.5 -mx-1 hover:bg-accent/10 transition-colors group"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          flashFeatureIds?.([inst.featureId]);
                                        }}
                                        title="Vis på kortet"
                                      >
                                        <span className="text-foreground/30 group-hover:text-accent transition-colors">📍</span>
                                        <span className="text-foreground/55 group-hover:text-accent-dark transition-colors">{featureNameMap.get(inst.featureId) ?? "Ukendt"}</span>
                                        {inst.count && inst.count > 1 && (
                                          <span className="text-foreground/35">×{inst.count}</span>
                                        )}
                                        {inst.varietyName && (
                                          <span className="rounded bg-violet-500/10 px-1 py-0.5 text-[8px] text-violet-600">
                                            {inst.varietyName}
                                          </span>
                                        )}
                                        {inst.plantedAt && (
                                          <span className="text-foreground/30 ml-auto">
                                            {new Date(inst.plantedAt).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}
                                          </span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {/* Description */}
                                {species.description && (
                                  <p className="text-[10px] text-foreground/45 leading-relaxed">{species.description}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
