"use client";
import React, { useState, memo } from "react";
import {
  getJournalEntries,
  addJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  groupByDate,
  getJournalStats,
  JOURNAL_CATEGORY_CONFIG,
  JOURNAL_CATEGORIES,
  type JournalEntry as JournalEntryType,
  type JournalCategory,
} from "../lib/journalStore";

/* ─────────── Props ─────────── */

export interface JournalTabProps {
  /** Bump to force re-render when journal data changes externally */
  journalVersion: number;
  setJournalVersion: React.Dispatch<React.SetStateAction<number>>;
}

/* ─────────── Component ─────────── */

function JournalTabInner({ journalVersion, setJournalVersion }: JournalTabProps) {
  void journalVersion; // reactivity trigger

  // ── Internal state (moved from GardenMapClient) ──
  const [journalAdding, setJournalAdding] = useState(false);
  const [journalEditId, setJournalEditId] = useState<string | null>(null);
  const [journalFilter, setJournalFilter] = useState<JournalCategory | "all">("all");
  const [journalDraftTitle, setJournalDraftTitle] = useState("");
  const [journalDraftBody, setJournalDraftBody] = useState("");
  const [journalDraftCategory, setJournalDraftCategory] = useState<JournalCategory>("observation");
  const [journalDraftDate, setJournalDraftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [journalConfirmDelete, setJournalConfirmDelete] = useState<string | null>(null);

  // ── Derived data ──
  const entries = getJournalEntries();
  const filtered = journalFilter === "all"
    ? entries
    : entries.filter((e) => e.category === journalFilter);
  const dayGroups = groupByDate(filtered);
  const stats = getJournalStats();

  // ── Helpers ──
  const resetForm = () => {
    setJournalAdding(false);
    setJournalEditId(null);
    setJournalDraftTitle("");
    setJournalDraftBody("");
    setJournalDraftCategory("observation");
    setJournalDraftDate(new Date().toISOString().slice(0, 10));
  };

  const handleSave = () => {
    if (!journalDraftTitle.trim()) return;
    if (journalEditId) {
      updateJournalEntry(journalEditId, {
        title: journalDraftTitle.trim(),
        body: journalDraftBody.trim(),
        category: journalDraftCategory,
        date: journalDraftDate,
      });
    } else {
      addJournalEntry({
        title: journalDraftTitle.trim(),
        body: journalDraftBody.trim(),
        category: journalDraftCategory,
        date: journalDraftDate,
        featureIds: [],
        tags: [],
      });
    }
    setJournalVersion((v) => v + 1);
    resetForm();
  };

  const startEdit = (entry: JournalEntryType) => {
    setJournalEditId(entry.id);
    setJournalAdding(true);
    setJournalDraftTitle(entry.title);
    setJournalDraftBody(entry.body);
    setJournalDraftCategory(entry.category);
    setJournalDraftDate(entry.date);
  };

  return (
    <div className="mt-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground/80">📓 Havedagbog</h3>
          <p className="text-[9px] text-foreground/40">{stats.total} indlæg · {stats.thisMonth} denne måned</p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-accent text-white px-3 py-1.5 text-xs font-medium hover:bg-accent/90 transition-colors"
          onClick={() => { resetForm(); setJournalAdding(true); }}
        >
          + Ny
        </button>
      </div>

      {/* Add / Edit form */}
      {journalAdding ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="date"
              className="rounded-md border border-border px-2 py-1 text-xs"
              value={journalDraftDate}
              onChange={(e) => setJournalDraftDate(e.target.value)}
            />
            <select
              className="flex-1 rounded-md border border-border px-2 py-1 text-xs"
              value={journalDraftCategory}
              onChange={(e) => setJournalDraftCategory(e.target.value as JournalCategory)}
            >
              {JOURNAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {JOURNAL_CATEGORY_CONFIG[cat].icon} {JOURNAL_CATEGORY_CONFIG[cat].label}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs placeholder:text-foreground/30"
            placeholder="Titel…"
            value={journalDraftTitle}
            onChange={(e) => setJournalDraftTitle(e.target.value)}
            autoFocus
          />
          <textarea
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs placeholder:text-foreground/30 resize-none"
            placeholder="Hvad skete der i haven? Observationer, noter…"
            rows={3}
            value={journalDraftBody}
            onChange={(e) => setJournalDraftBody(e.target.value)}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              className="flex-1 rounded-md bg-accent text-white px-2 py-1.5 text-xs font-medium hover:bg-accent/90"
              onClick={handleSave}
              disabled={!journalDraftTitle.trim()}
            >
              {journalEditId ? "Opdatér" : "Gem"}
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1.5 text-xs text-foreground/60 hover:bg-foreground/5"
              onClick={resetForm}
            >
              Annullér
            </button>
          </div>
        </div>
      ) : null}

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all ${
            journalFilter === "all"
              ? "border-accent/40 bg-accent-light text-accent-dark"
              : "border-border bg-background text-foreground/50 hover:bg-foreground/5"
          }`}
          onClick={() => setJournalFilter("all")}
        >
          Alle ({entries.length})
        </button>
        {JOURNAL_CATEGORIES.map((cat) => {
          const cfg = JOURNAL_CATEGORY_CONFIG[cat];
          const count = stats.categories[cat];
          if (count === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all ${
                journalFilter === cat
                  ? "border-accent/40 bg-accent-light text-accent-dark"
                  : "border-border bg-background text-foreground/50 hover:bg-foreground/5"
              }`}
              onClick={() => setJournalFilter(cat)}
            >
              {cfg.icon} {count}
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {dayGroups.length === 0 ? (
        <p className="text-[10px] text-foreground/40 italic text-center py-8">
          📓 Ingen dagbogsindlæg endnu. Tryk &quot;+ Ny&quot; for at starte.
        </p>
      ) : (
        <div className="space-y-3">
          {dayGroups.map((group) => (
            <div key={group.date}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[9px] font-semibold text-foreground/40 uppercase tracking-wide whitespace-nowrap">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-1.5">
                {group.entries.map((entry) => {
                  const cfg = JOURNAL_CATEGORY_CONFIG[entry.category];
                  return (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5 hover:bg-foreground/[0.04] transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{cfg.icon}</span>
                        <span className="text-xs font-semibold flex-1 truncate">{entry.title}</span>
                        <span className={`text-[9px] ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      {entry.body ? (
                        <p className="text-[10px] text-foreground/55 leading-relaxed line-clamp-3 mb-1.5">{entry.body}</p>
                      ) : null}
                      {entry.time ? (
                        <span className="text-[9px] text-foreground/30">🕐 {entry.time}</span>
                      ) : null}
                      <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          className="rounded border border-border px-1.5 py-0.5 text-[9px] text-foreground/40 hover:bg-foreground/5"
                          onClick={() => startEdit(entry)}
                        >
                          ✏️ Redigér
                        </button>
                        {journalConfirmDelete === entry.id ? (
                          <button
                            type="button"
                            className="rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[9px] text-red-600"
                            onClick={() => {
                              deleteJournalEntry(entry.id);
                              setJournalVersion((v) => v + 1);
                              setJournalConfirmDelete(null);
                            }}
                          >
                            Bekræft slet
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rounded border border-border px-1.5 py-0.5 text-[9px] text-foreground/40 hover:text-red-500"
                            onClick={() => setJournalConfirmDelete(entry.id)}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const JournalTab = memo(JournalTabInner);
export default JournalTab;
