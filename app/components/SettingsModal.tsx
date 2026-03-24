"use client";
import React, { useState, useEffect, useCallback, memo } from "react";

/* ─────────── Theme helpers ─────────── */
export type ThemeMode = "system" | "light" | "dark";
const THEME_KEY = "gardenos:theme:v1";

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem(THEME_KEY) as ThemeMode) || "system";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "dark") {
    root.setAttribute("data-theme", "dark");
  } else if (mode === "light") {
    root.setAttribute("data-theme", "light");
  } else {
    root.removeAttribute("data-theme");
  }
  localStorage.setItem(THEME_KEY, mode);
}

/* ─────────── User Preferences ─────────── */
const PREFS_KEY = "gardenos:preferences:v1";
export interface UserPreferences {
  temperatureUnit: "C" | "F";
  defaultZoom: number;
  gardenZone: string;
}
const DEFAULT_PREFS: UserPreferences = {
  temperatureUnit: "C",
  defaultZoom: 18,
  gardenZone: "7-8",
};
export function loadPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
}
function savePreferences(prefs: UserPreferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/* ─────────── Props ─────────── */

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  userEmail?: string | null;
  initialName?: string;
}

/* ─────────── Component ─────────── */

function SettingsModalInner({ open, onClose, userEmail, initialName = "" }: SettingsModalProps) {
  // ── Internal form state ──
  const [settingsCurrentPw, setSettingsCurrentPw] = useState("");
  const [settingsNewPw, setSettingsNewPw] = useState("");
  const [settingsNewPw2, setSettingsNewPw2] = useState("");
  const [settingsName, setSettingsName] = useState(initialName);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // ── Theme ──
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");

  // ── Preferences ──
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);

  // ── Settings tab ──
  const [tab, setTab] = useState<"profile" | "appearance" | "preferences">("profile");

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSettingsCurrentPw("");
      setSettingsNewPw("");
      setSettingsNewPw2("");
      setSettingsName(initialName);
      setSettingsError(null);
      setSettingsSuccess(null);
      setThemeMode(getStoredTheme());
      setPrefs(loadPreferences());
      setTab("profile");
    }
  }, [open, initialName]);

  const handleThemeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
    applyTheme(mode);
  }, []);

  const updatePref = useCallback(<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      savePreferences(next);
      return next;
    });
  }, []);

  if (!open) return null;

  const TABS: { id: typeof tab; label: string; icon: string }[] = [
    { id: "profile", label: "Profil", icon: "👤" },
    { id: "appearance", label: "Udseende", icon: "🎨" },
    { id: "preferences", label: "Indstillinger", icon: "⚙️" },
  ];

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[var(--background)] rounded-2xl shadow-2xl border border-border w-[90vw] max-w-md max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Brugerindstillinger"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-border bg-[var(--background)]/95 backdrop-blur rounded-t-2xl">
          <h2 className="text-base font-bold text-foreground/80">⚙️ Indstillinger</h2>
          <button
            type="button"
            className="w-7 h-7 rounded-lg hover:bg-foreground/10 flex items-center justify-center text-foreground/40 text-lg"
            onClick={onClose}
            aria-label="Luk indstillinger"
          >×</button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`flex-1 py-2 text-[11px] font-medium transition ${tab === t.id ? "text-accent border-b-2 border-accent" : "text-foreground/40 hover:text-foreground/60"}`}
              onClick={() => setTab(t.id)}
            >
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {/* ───── Profile tab ───── */}
          {tab === "profile" && (
            <>
              {/* Profile info */}
              <div className="rounded-lg border border-border bg-foreground/[0.02] p-3 space-y-2">
                <p className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wide">Profil</p>
                <div className="text-[11px] text-foreground/60 space-y-1">
                  <p>📧 {userEmail}</p>
                </div>
              </div>

              {/* Change name */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wide block">Skift navn</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded-md border border-border bg-[var(--background)] px-2 py-1.5 text-[11px] text-foreground"
                    placeholder="Dit navn"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-md bg-accent text-white px-3 py-1.5 text-[11px] font-medium hover:bg-accent/90 disabled:opacity-50"
                    disabled={settingsSaving || !settingsName.trim()}
                    onClick={async () => {
                      setSettingsSaving(true);
                      setSettingsError(null);
                      setSettingsSuccess(null);
                      try {
                        const res = await fetch("/api/user/settings", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "change-name", name: settingsName.trim() }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          setSettingsError(data.error || "Fejl");
                        } else {
                          setSettingsSuccess("Navn opdateret ✓");
                        }
                      } catch {
                        setSettingsError("Netværksfejl");
                      }
                      setSettingsSaving(false);
                    }}
                  >
                    Gem
                  </button>
                </div>
              </div>

              {/* Change password */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wide block">Skift kodeord</label>
                <input
                  type="password"
                  className="w-full rounded-md border border-border bg-[var(--background)] px-2 py-1.5 text-[11px] text-foreground"
                  placeholder="Nuværende kodeord"
                  value={settingsCurrentPw}
                  onChange={(e) => setSettingsCurrentPw(e.target.value)}
                  autoComplete="current-password"
                />
                <input
                  type="password"
                  className="w-full rounded-md border border-border bg-[var(--background)] px-2 py-1.5 text-[11px] text-foreground"
                  placeholder="Nyt kodeord (min. 8 tegn)"
                  value={settingsNewPw}
                  onChange={(e) => setSettingsNewPw(e.target.value)}
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  className="w-full rounded-md border border-border bg-[var(--background)] px-2 py-1.5 text-[11px] text-foreground"
                  placeholder="Gentag nyt kodeord"
                  value={settingsNewPw2}
                  onChange={(e) => setSettingsNewPw2(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="w-full rounded-md bg-accent text-white px-3 py-2 text-[11px] font-medium hover:bg-accent/90 disabled:opacity-50"
                  disabled={settingsSaving || !settingsCurrentPw || !settingsNewPw || settingsNewPw.length < 8 || settingsNewPw !== settingsNewPw2}
                  onClick={async () => {
                    if (settingsNewPw !== settingsNewPw2) {
                      setSettingsError("Kodeordene matcher ikke.");
                      return;
                    }
                    setSettingsSaving(true);
                    setSettingsError(null);
                    setSettingsSuccess(null);
                    try {
                      const res = await fetch("/api/user/settings", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "change-password",
                          currentPassword: settingsCurrentPw,
                          newPassword: settingsNewPw,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setSettingsError(data.error || "Fejl");
                      } else {
                        setSettingsSuccess("Kodeord opdateret ✓");
                        setSettingsCurrentPw("");
                        setSettingsNewPw("");
                        setSettingsNewPw2("");
                      }
                    } catch {
                      setSettingsError("Netværksfejl");
                    }
                    setSettingsSaving(false);
                  }}
                >
                  {settingsSaving ? "Gemmer…" : "Opdater kodeord"}
                </button>
                {settingsNewPw && settingsNewPw2 && settingsNewPw !== settingsNewPw2 ? (
                  <p className="text-[10px] text-red-500">Kodeordene matcher ikke.</p>
                ) : null}
              </div>
            </>
          )}

          {/* ───── Appearance tab ───── */}
          {tab === "appearance" && (
            <>
              <div className="space-y-3">
                <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wide block">Tema</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { mode: "system" as ThemeMode, icon: "🖥️", label: "System" },
                    { mode: "light" as ThemeMode, icon: "☀️", label: "Lyst" },
                    { mode: "dark" as ThemeMode, icon: "🌙", label: "Mørkt" },
                  ]).map((opt) => (
                    <button
                      key={opt.mode}
                      type="button"
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition ${
                        themeMode === opt.mode
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-foreground/[0.02] text-foreground/50 hover:border-foreground/20"
                      }`}
                      onClick={() => handleThemeChange(opt.mode)}
                    >
                      <span className="text-xl">{opt.icon}</span>
                      <span className="text-[11px] font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-foreground/40">
                  {themeMode === "system"
                    ? "Følger dit systems indstilling (lyst/mørkt)"
                    : themeMode === "dark"
                    ? "Altid mørkt tema"
                    : "Altid lyst tema"}
                </p>
              </div>
            </>
          )}

          {/* ───── Preferences tab ───── */}
          {tab === "preferences" && (
            <>
              {/* Temperature unit */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wide block">Temperaturenhed</label>
                <div className="flex gap-2">
                  {(["C", "F"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      className={`flex-1 py-2 rounded-lg border text-[12px] font-medium transition ${
                        prefs.temperatureUnit === unit
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-foreground/50 hover:border-foreground/20"
                      }`}
                      onClick={() => updatePref("temperatureUnit", unit)}
                    >
                      °{unit}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default zoom */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wide block">
                  Standard zoom-niveau ({prefs.defaultZoom})
                </label>
                <input
                  type="range"
                  min={14}
                  max={22}
                  step={1}
                  value={prefs.defaultZoom}
                  onChange={(e) => updatePref("defaultZoom", Number(e.target.value))}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-[9px] text-foreground/30">
                  <span>Overblik</span><span>Detalje</span>
                </div>
              </div>

              {/* Garden zone */}
              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wide block">Havezone</label>
                <select
                  className="w-full rounded-md border border-border bg-[var(--background)] px-2 py-1.5 text-[11px] text-foreground"
                  value={prefs.gardenZone}
                  onChange={(e) => updatePref("gardenZone", e.target.value)}
                >
                  <option value="1-3">Zone 1–3 (Nordskandinavien)</option>
                  <option value="4-5">Zone 4–5 (Mellemsverige/Norge)</option>
                  <option value="6">Zone 6 (Sydsverige)</option>
                  <option value="7-8">Zone 7–8 (Danmark)</option>
                  <option value="8-9">Zone 8–9 (Nordtyskland/Holland)</option>
                </select>
              </div>
            </>
          )}

          {/* Feedback messages */}
          {settingsError ? (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-[11px] text-red-700 dark:text-red-300">{settingsError}</div>
          ) : null}
          {settingsSuccess ? (
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2 text-[11px] text-green-700 dark:text-green-300">{settingsSuccess}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default memo(SettingsModalInner);
