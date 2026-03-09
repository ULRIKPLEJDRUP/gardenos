"use client";
// ---------------------------------------------------------------------------
// GardenOS – TaskList Component (Opgaveliste)
// ---------------------------------------------------------------------------
// A sortable, filterable task list that can feed into the Year Wheel.
// Tasks can come from: manual entry, AI advisor, etc.
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useState } from "react";
import {
  loadTasks,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskDone,
  pushToYearWheel,
  sortTasks,
  PRIORITY_LABELS,
  PRIORITY_ICONS,
  PRIORITY_COLORS,
  type GardenTask,
  type TaskPriority,
  type TaskSortBy,
} from "../lib/taskStore";
import {
  TASK_CATEGORY_LABELS,
  TASK_CATEGORY_ICONS,
  TASK_CATEGORY_COLORS,
  MONTH_SHORT,
  type TaskCategory,
} from "../lib/yearWheelStore";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TaskListProps {
  /** Bumped externally when tasks are added (e.g. from AI advisor) */
  taskVersion: number;
  /** Navigate to year wheel at a specific month */
  goToYearWheel?: (month: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TaskList({ taskVersion, goToYearWheel }: TaskListProps) {
  // ── State ──
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [sortBy, setSortBy] = useState<TaskSortBy>("priority");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [filterDone, setFilterDone] = useState<"all" | "pending" | "done">("pending");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState<TaskPriority>("medium");
  const [formCategory, setFormCategory] = useState<TaskCategory | "">("other");
  const [formMonth, setFormMonth] = useState<number | undefined>(undefined);

  // Re-read tasks from localStorage whenever taskVersion (external) or refreshCounter (internal) changes
  const tasks = useMemo(() => {
    void taskVersion;
    void refreshCounter;
    return loadTasks();
  }, [taskVersion, refreshCounter]);

  const refresh = useCallback(() => setRefreshCounter((c) => c + 1), []);

  // ── Filtered + sorted ──
  const displayTasks = useMemo(() => {
    let filtered = [...tasks];
    if (filterPriority !== "all") {
      filtered = filtered.filter((t) => t.priority === filterPriority);
    }
    if (filterDone === "pending") {
      filtered = filtered.filter((t) => !t.completedAt);
    } else if (filterDone === "done") {
      filtered = filtered.filter((t) => !!t.completedAt);
    }
    return sortTasks(filtered, sortBy);
  }, [tasks, sortBy, filterPriority, filterDone]);

  // ── Stats ──
  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.completedAt).length;
    const pending = total - done;
    const urgent = tasks.filter((t) => t.priority === "urgent" && !t.completedAt).length;
    return { total, done, pending, urgent };
  }, [tasks]);

  // ── Handlers ──
  const handleAdd = useCallback(() => {
    if (!formTitle.trim()) return;
    createTask({
      title: formTitle.trim(),
      description: formDescription.trim() || undefined,
      priority: formPriority,
      category: (formCategory || "other") as TaskCategory,
      month: formMonth,
      source: "manual",
    });
    setFormTitle("");
    setFormDescription("");
    setFormPriority("medium");
    setFormCategory("other");
    setFormMonth(undefined);
    setShowAddForm(false);
    refresh();
  }, [formTitle, formDescription, formPriority, formCategory, formMonth, refresh]);

  const handleToggleDone = useCallback((id: string) => {
    toggleTaskDone(id);
    refresh();
  }, [refresh]);

  const handleDelete = useCallback((id: string) => {
    deleteTask(id);
    refresh();
  }, [refresh]);

  const handlePushToWheel = useCallback((id: string) => {
    const ok = pushToYearWheel(id);
    if (ok) refresh();
  }, [refresh]);

  const startEdit = useCallback((task: GardenTask) => {
    setEditingId(task.id);
    setFormTitle(task.title);
    setFormDescription(task.description ?? "");
    setFormPriority(task.priority);
    setFormCategory(task.category || "");
    setFormMonth(task.month);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingId || !formTitle.trim()) return;
    updateTask(editingId, {
      title: formTitle.trim(),
      description: formDescription.trim() || undefined,
      priority: formPriority,
      category: (formCategory || "other") as TaskCategory,
      month: formMonth,
    });
    setEditingId(null);
    setFormTitle("");
    setFormDescription("");
    setFormPriority("medium");
    setFormCategory("other");
    setFormMonth(undefined);
    refresh();
  }, [editingId, formTitle, formDescription, formPriority, formCategory, formMonth, refresh]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setFormTitle("");
    setFormDescription("");
    setFormPriority("medium");
    setFormCategory("other");
    setFormMonth(undefined);
  }, []);

  // ── Render ──
  return (
    <div className="mt-2 space-y-3">
      {/* ── Stats header ── */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-violet-50 to-indigo-50 p-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground/90">📋 Opgaveliste</h3>
            <p className="text-[10px] text-foreground/50 mt-0.5">Idéer, planer og to-dos</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-violet-600">{stats.pending}</div>
            <div className="text-[9px] text-foreground/50">
              ventende{stats.urgent > 0 ? ` · ${stats.urgent} akutte` : ""}
            </div>
          </div>
        </div>
        {stats.total > 0 && (
          <div className="mt-2 h-1.5 rounded-full bg-foreground/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-500 transition-all duration-500"
              style={{ width: `${Math.round((stats.done / stats.total) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Sort + Filter bar ── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-semibold text-foreground/40 uppercase tracking-wide shrink-0">Sortér</label>
          <div className="flex gap-0.5 flex-wrap">
            {([
              ["priority", "Prioritet"],
              ["date", "Dato"],
              ["month", "Måned"],
              ["category", "Kategori"],
              ["name", "Navn"],
            ] as [TaskSortBy, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-all ${
                  sortBy === key
                    ? "bg-violet-500 text-white shadow-sm"
                    : "bg-background border border-border/60 text-foreground/50 hover:bg-foreground/5"
                }`}
                onClick={() => setSortBy(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[9px] font-semibold text-foreground/40 uppercase tracking-wide shrink-0">Vis</label>
          <div className="flex gap-0.5">
            {([
              ["pending", "Aktive"],
              ["done", "Udførte"],
              ["all", "Alle"],
            ] as [typeof filterDone, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium transition-all ${
                  filterDone === key
                    ? "bg-violet-500 text-white shadow-sm"
                    : "bg-background border border-border/60 text-foreground/50 hover:bg-foreground/5"
                }`}
                onClick={() => setFilterDone(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 ml-auto">
            {(["all", "urgent", "high", "medium", "low"] as (TaskPriority | "all")[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`rounded-full w-5 h-5 flex items-center justify-center text-[9px] transition-all ${
                  filterPriority === key
                    ? "bg-violet-500 text-white shadow-sm ring-2 ring-violet-300"
                    : "bg-background border border-border/60 text-foreground/50 hover:bg-foreground/5"
                }`}
                onClick={() => setFilterPriority(filterPriority === key ? "all" : key)}
                title={key === "all" ? "Alle prioriteter" : PRIORITY_LABELS[key]}
              >
                {key === "all" ? "•" : PRIORITY_ICONS[key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Task list ── */}
      {displayTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-foreground/15 p-6 text-center">
          <p className="text-2xl mb-1">📋</p>
          <p className="text-xs text-foreground/50">
            {stats.total === 0 ? "Ingen opgaver endnu" : "Ingen opgaver matcher filteret"}
          </p>
          <p className="text-[10px] text-foreground/40 mt-1">
            {stats.total === 0 ? "Tilføj herunder, eller gem forslag fra Rådgiveren 💬" : "Prøv at ændre filter"}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {displayTasks.map((task) => {
            const isDone = !!task.completedAt;
            const isExpanded = expandedId === task.id;
            const isEditing = editingId === task.id;

            /* ── Inline edit form ── */
            if (isEditing) {
              return (
                <div key={task.id} className="rounded-xl border border-violet-300/50 bg-violet-50/30 p-3 space-y-2">
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) saveEdit(); }}
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    <select
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] focus:outline-none"
                    >
                      {(Object.entries(PRIORITY_LABELS) as [TaskPriority, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{PRIORITY_ICONS[k]} {v}</option>
                      ))}
                    </select>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as TaskCategory | "")}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] focus:outline-none flex-1 min-w-0"
                    >
                      <option value="">Ingen kategori</option>
                      {(Object.entries(TASK_CATEGORY_LABELS) as [TaskCategory, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{TASK_CATEGORY_ICONS[k]} {v}</option>
                      ))}
                    </select>
                    <select
                      value={formMonth ?? ""}
                      onChange={(e) => setFormMonth(e.target.value ? Number(e.target.value) : undefined)}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-[10px] focus:outline-none"
                    >
                      <option value="">Ingen md.</option>
                      {MONTH_SHORT.map((m, i) => (
                        <option key={i} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Beskrivelse..."
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 rounded-lg bg-violet-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-600 transition-colors"
                      onClick={saveEdit}
                    >
                      💾 Gem
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-foreground/60 hover:bg-foreground/5 transition-colors"
                      onClick={cancelEdit}
                    >
                      Annullér
                    </button>
                  </div>
                </div>
              );
            }

            /* ── Task card ── */
            return (
              <div
                key={task.id}
                className={`rounded-xl border transition-all ${
                  isDone
                    ? "border-border/50 bg-foreground/[0.02] opacity-60"
                    : "border-border bg-background/80 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start gap-2 px-3 py-2">
                  {/* Checkbox */}
                  <button
                    type="button"
                    className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-md border-2 transition-all ${
                      isDone
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-foreground/25 hover:border-violet-400"
                    }`}
                    onClick={() => handleToggleDone(task.id)}
                  >
                    {isDone && (
                      <svg className="w-3 h-3 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Priority dot */}
                  <span
                    className="mt-1 flex-shrink-0 w-2 h-2 rounded-full"
                    style={{ backgroundColor: PRIORITY_COLORS[task.priority] }}
                    title={PRIORITY_LABELS[task.priority]}
                  />

                  {/* Content */}
                  <button
                    type="button"
                    className="flex-1 text-left min-w-0"
                    onClick={() => setExpandedId(isExpanded ? null : task.id)}
                  >
                    <span className={`text-[11px] leading-tight block ${isDone ? "line-through text-foreground/40" : "text-foreground/80"}`}>
                      {task.title}
                    </span>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <span
                        className="rounded px-1 py-0.5 text-[8px] font-medium"
                        style={{
                          backgroundColor: TASK_CATEGORY_COLORS[task.category] + "18",
                          color: TASK_CATEGORY_COLORS[task.category],
                        }}
                      >
                        {TASK_CATEGORY_ICONS[task.category]} {TASK_CATEGORY_LABELS[task.category]}
                      </span>
                      {task.month && (
                        <span className="rounded bg-foreground/5 px-1 py-0.5 text-[8px] text-foreground/45">
                          📅 {MONTH_SHORT[task.month - 1]}
                        </span>
                      )}
                      {task.source === "ai-advisor" && (
                        <span className="rounded bg-blue-500/10 px-1 py-0.5 text-[8px] text-blue-600">
                          🤖 AI
                        </span>
                      )}
                      {task.yearWheelLinked && (
                        <span className="rounded bg-emerald-500/10 px-1 py-0.5 text-[8px] text-emerald-600">
                          🔄 Årshjul
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Quick actions */}
                  <div className="flex-shrink-0 flex items-center gap-0.5">
                    <button
                      type="button"
                      className="p-1 text-[10px] text-foreground/30 hover:text-violet-500 transition-colors"
                      onClick={() => startEdit(task)}
                      title="Redigér"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="p-1 text-[10px] text-foreground/30 hover:text-red-500 transition-colors"
                      onClick={() => handleDelete(task.id)}
                      title="Slet"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-2.5 pt-0">
                    <div className="ml-8 space-y-2">
                      {task.description && (
                        <p className="text-[10px] text-foreground/50 leading-relaxed bg-foreground/[0.02] rounded-lg p-2">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-[9px] text-foreground/40 flex-wrap">
                        <span>Oprettet: {new Date(task.createdAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" })}</span>
                        {task.completedAt && (
                          <span>· Udført: {new Date(task.completedAt).toLocaleDateString("da-DK", { day: "numeric", month: "short" })}</span>
                        )}
                      </div>
                      {/* Year wheel actions */}
                      <div className="flex gap-1.5 flex-wrap">
                        {task.month && !task.yearWheelLinked && !task.completedAt && (
                          <button
                            type="button"
                            className="rounded-lg border border-emerald-300/60 bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                            onClick={() => handlePushToWheel(task.id)}
                            title="Indsæt som fast opgave i årshjulet"
                          >
                            📅 Tilføj til Årshjul
                          </button>
                        )}
                        {task.month && task.yearWheelLinked && goToYearWheel && (
                          <button
                            type="button"
                            className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-medium text-foreground/50 hover:bg-foreground/5 transition-colors"
                            onClick={() => goToYearWheel(task.month!)}
                          >
                            📅 Se i Årshjul
                          </button>
                        )}
                        {!task.month && !task.completedAt && (
                          <span className="text-[9px] text-foreground/30 italic">Tildel en måned for at kunne indsætte i årshjulet</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add task form ── */}
      {showAddForm ? (
        <div className="rounded-xl border border-violet-300/40 bg-violet-50/30 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-foreground/70">✏️ Ny opgave</p>
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="Hvad skal gøres?"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs placeholder:text-foreground/30 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleAdd(); }}
          />
          <div className="flex gap-1.5 flex-wrap">
            <select
              value={formPriority}
              onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-[10px] focus:outline-none"
            >
              {(Object.entries(PRIORITY_LABELS) as [TaskPriority, string][]).map(([k, v]) => (
                <option key={k} value={k}>{PRIORITY_ICONS[k]} {v}</option>
              ))}
            </select>
            <select
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value as TaskCategory | "")}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-[10px] focus:outline-none flex-1 min-w-0"
            >
              <option value="">Ingen kategori</option>
              {(Object.entries(TASK_CATEGORY_LABELS) as [TaskCategory, string][]).map(([k, v]) => (
                <option key={k} value={k}>{TASK_CATEGORY_ICONS[k]} {v}</option>
              ))}
            </select>
            <select
              value={formMonth ?? ""}
              onChange={(e) => setFormMonth(e.target.value ? Number(e.target.value) : undefined)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-[10px] focus:outline-none"
            >
              <option value="">Ingen måned</option>
              {MONTH_SHORT.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <textarea
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Beskrivelse (valgfrit)..."
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs placeholder:text-foreground/30 focus:outline-none resize-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg bg-violet-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-600 transition-colors disabled:opacity-40"
              onClick={handleAdd}
              disabled={!formTitle.trim()}
            >
              ＋ Tilføj
            </button>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-foreground/60 hover:bg-foreground/5 transition-colors"
              onClick={() => { setShowAddForm(false); setFormTitle(""); setFormDescription(""); }}
            >
              Annullér
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="w-full rounded-xl border-2 border-dashed border-foreground/15 py-3 text-[11px] text-foreground/50 hover:border-violet-300/40 hover:text-violet-500 transition-all hover:bg-violet-50/30"
          onClick={() => { setShowAddForm(true); setEditingId(null); }}
        >
          ＋ Tilføj ny opgave
        </button>
      )}

      {/* ── Tip ── */}
      <p className="text-[9px] text-foreground/30 text-center leading-relaxed">
        💡 Tip: Gem forslag fra 💬 Rådgiveren direkte som opgave
      </p>
    </div>
  );
}
