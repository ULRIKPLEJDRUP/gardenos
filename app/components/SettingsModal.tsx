"use client";
import React, { useState, useEffect, memo } from "react";

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

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSettingsCurrentPw("");
      setSettingsNewPw("");
      setSettingsNewPw2("");
      setSettingsName(initialName);
      setSettingsError(null);
      setSettingsSuccess(null);
    }
  }, [open, initialName]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-2xl border border-border w-[90vw] max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Brugerindstillinger"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground/80">⚙️ Indstillinger</h2>
          <button
            type="button"
            className="w-7 h-7 rounded-lg hover:bg-foreground/10 flex items-center justify-center text-foreground/40 text-lg"
            onClick={onClose}
            aria-label="Luk indstillinger"
          >×</button>
        </div>

        {/* Profile info */}
        <div className="rounded-lg border border-border bg-foreground/[0.02] p-3 space-y-2">
          <p className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wide">Profil</p>
          <div className="text-[11px] text-foreground/60 space-y-1">
            <p>📧 {userEmail}</p>
            <p>📅 Oprettet: –</p>
          </div>
        </div>

        {/* Change name */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wide block">Skift navn</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
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
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
            placeholder="Nuværende kodeord"
            value={settingsCurrentPw}
            onChange={(e) => setSettingsCurrentPw(e.target.value)}
            autoComplete="current-password"
          />
          <input
            type="password"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
            placeholder="Nyt kodeord (min. 8 tegn)"
            value={settingsNewPw}
            onChange={(e) => setSettingsNewPw(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px]"
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

        {/* Feedback messages */}
        {settingsError ? (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700">{settingsError}</div>
        ) : null}
        {settingsSuccess ? (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-[11px] text-green-700">{settingsSuccess}</div>
        ) : null}
      </div>
    </div>
  );
}

export default memo(SettingsModalInner);
