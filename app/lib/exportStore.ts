/**
 * exportStore.ts – Export & Share utilities for GardenOS
 * Supports GeoJSON, CSV plant inventory, print/PDF, full backup/restore,
 * and iCalendar (.ics) export.
 */

/* ─────────────────────── Types ─────────────────────── */
import type { FeatureCollection, Geometry } from "geojson";
import type { CalendarMonth } from "./gardenCalendar";

export interface ExportPlantRow {
  bed: string;
  species: string;
  variety: string;
  count: number;
  plantedAt: string;
  season: string;
  notes: string;
}

/* ─────────────────────── Helpers ─────────────────────── */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ─────────────────────── GeoJSON Export ─────────────────────── */

export function exportGeoJSON(
  layout: FeatureCollection<Geometry>,
  gardenName?: string,
): void {
  const name = gardenName?.trim() || "garden";
  const blob = new Blob([JSON.stringify(layout, null, 2)], {
    type: "application/geo+json",
  });
  downloadBlob(blob, `${name}-${todayStamp()}.geojson`);
}

/* ─────────────────────── CSV Plant Inventory ─────────────────────── */

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function exportPlantCSV(
  rows: ExportPlantRow[],
  gardenName?: string,
): void {
  const header = "Bed;Art;Sort;Antal;Plantet;Sæson;Noter";
  const lines = rows.map((r) =>
    [
      escapeCsv(r.bed),
      escapeCsv(r.species),
      escapeCsv(r.variety),
      String(r.count),
      escapeCsv(r.plantedAt),
      escapeCsv(r.season),
      escapeCsv(r.notes),
    ].join(";"),
  );
  const csv = [header, ...lines].join("\n");
  // BOM for Excel to auto-detect UTF-8
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const name = gardenName?.trim() || "garden";
  downloadBlob(blob, `${name}-planter-${todayStamp()}.csv`);
}

/* ─────────────────────── Share Link (clipboard) ─────────────────────── */

/**
 * Generates a compact share payload and copies a data-URI link to clipboard.
 * Returns true on success.
 */
export async function copyShareLink(
  layout: FeatureCollection<Geometry>,
): Promise<boolean> {
  try {
    // We compress the layout to a base64-encoded JSON snippet
    const minimal = {
      type: "FeatureCollection",
      features: (layout.features || []).map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          name: (f.properties as Record<string, unknown>)?.name || "",
          kind: (f.properties as Record<string, unknown>)?.kind || "",
          category: (f.properties as Record<string, unknown>)?.category || "",
        },
      })),
    };
    const json = JSON.stringify(minimal);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    const url = `${window.location.origin}/?share=${encoded}`;
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/* ─────────────────────── Print / PDF ─────────────────────── */

/**
 * Opens a print-friendly window with garden summary data rendered as HTML.
 */
export function printGardenSummary(opts: {
  gardenName: string;
  featureCount: number;
  plantRows: ExportPlantRow[];
  weatherSummary?: string;
  soilSummary?: string;
}): void {
  const { gardenName, featureCount, plantRows, weatherSummary, soilSummary } = opts;

  const plantTableRows = plantRows
    .map(
      (r) =>
        `<tr><td>${esc(r.bed)}</td><td>${esc(r.species)}</td><td>${esc(r.variety)}</td><td style="text-align:center">${r.count}</td><td>${esc(r.plantedAt)}</td><td>${esc(r.season)}</td><td>${esc(r.notes)}</td></tr>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="utf-8" />
  <title>${esc(gardenName)} – GardenOS Haveoversigt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; color: #1a1a1a; max-width: 900px; margin: auto; }
    h1 { font-size: 24px; margin-bottom: 4px; color: #2d6a4f; }
    .subtitle { font-size: 13px; color: #666; margin-bottom: 24px; }
    h2 { font-size: 16px; margin: 20px 0 8px; color: #2d6a4f; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
    .stats { display: flex; gap: 24px; margin-bottom: 16px; }
    .stat { background: #f0f7f4; border-radius: 8px; padding: 12px 16px; flex: 1; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value { font-size: 22px; font-weight: 700; color: #2d6a4f; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
    th, td { border: 1px solid #e0e0e0; padding: 6px 10px; text-align: left; }
    th { background: #f0f7f4; font-weight: 600; color: #2d6a4f; }
    tr:nth-child(even) { background: #fafafa; }
    .info-box { background: #f5f5f5; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #555; margin-bottom: 12px; white-space: pre-line; }
    .footer { margin-top: 32px; text-align: center; font-size: 10px; color: #aaa; }
    @media print {
      body { padding: 16px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <h1>🌱 ${esc(gardenName)}</h1>
  <p class="subtitle">Haveoversigt – genereret ${new Date().toLocaleDateString("da-DK", { year: "numeric", month: "long", day: "numeric" })}</p>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Elementer i alt</div>
      <div class="stat-value">${featureCount}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Plantninger</div>
      <div class="stat-value">${plantRows.length}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Unikke arter</div>
      <div class="stat-value">${new Set(plantRows.map((r) => r.species)).size}</div>
    </div>
  </div>

  ${weatherSummary ? `<h2>☀️ Vejr</h2><div class="info-box">${esc(weatherSummary)}</div>` : ""}
  ${soilSummary ? `<h2>🪨 Jordforhold</h2><div class="info-box">${esc(soilSummary)}</div>` : ""}

  ${plantRows.length > 0 ? `
  <h2>🌿 Planteoversigt</h2>
  <table>
    <thead><tr><th>Bed</th><th>Art</th><th>Sort</th><th>Antal</th><th>Plantet</th><th>Sæson</th><th>Noter</th></tr></thead>
    <tbody>${plantTableRows}</tbody>
  </table>` : "<p style='color:#999; font-size:12px;'>Ingen planter registreret endnu.</p>"}

  <p class="footer">GardenOS · gardenos.vercel.app</p>

  <script>window.print();</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

/** Simple HTML-escape helper */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ─────────────────────── Full Backup / Restore ─────────────────────── */

/** All localStorage base-keys that constitute a full user backup. */
const BACKUP_KEYS = [
  "gardenos:layout:v1",
  "gardenos:view:v1",
  "gardenos:kinds:v1",
  "gardenos:groups:v1",
  "gardenos:hiddenKinds:v1",
  "gardenos:hiddenVisKinds:v1",
  "gardenos:bookmarks:v1",
  "gardenos:anchors:v1",
  "gardenos:scanHistory:v1",
  "gardenos:kindIcons:v1",
  "gardenos:conflicts:resolved:v1",
  "gardenos:mobile:pinnedTabs:v1",
  "gardenos:sidebar:pinnedTabs:v2",
  "gardenos:chat:history:v1",
  "gardenos:chat:persona:v1",
  "gardenos:plants:custom:v1",
  "gardenos:plants:instances:v1",
  "gardenos:tasks:v1",
  "gardenos:yearwheel:custom:v1",
  "gardenos:yearwheel:completed:v1",
  "gardenos:weather:cache:v1",
  "gardenos:weather:history:v1",
  "gardenos:soil:profiles:v1",
  "gardenos:soil:log:v1",
  "gardenos:journal:v1",
  "gardenos:dismissed-announcements:v1",
  "gardenos:tour",
];

export interface GardenBackup {
  _format: "gardenos-backup";
  _version: 1;
  _createdAt: string;
  data: Record<string, string>;
}

/**
 * Export a full backup of all user data from localStorage.
 * @param userKeyFn – the `userKey()` function from userStorage to scope keys.
 */
export function exportFullBackup(
  userKeyFn: (base: string) => string,
  gardenName?: string,
): void {
  const data: Record<string, string> = {};
  for (const base of BACKUP_KEYS) {
    const scoped = userKeyFn(base);
    const raw = localStorage.getItem(scoped);
    if (raw !== null) data[base] = raw;
  }

  const backup: GardenBackup = {
    _format: "gardenos-backup",
    _version: 1,
    _createdAt: new Date().toISOString(),
    data,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const name = gardenName?.trim() || "gardenos";
  downloadBlob(blob, `${name}-backup-${todayStamp()}.json`);
}

/**
 * Import a full backup from a JSON file.
 * @returns number of keys restored, or throws on invalid format.
 */
export async function importFullBackup(
  file: File,
  userKeyFn: (base: string) => string,
): Promise<number> {
  const text = await file.text();
  const parsed = JSON.parse(text) as unknown;

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as GardenBackup)._format !== "gardenos-backup"
  ) {
    throw new Error("Ugyldigt backup-format – filen er ikke en GardenOS backup.");
  }

  const backup = parsed as GardenBackup;
  const data = backup.data;
  if (!data || typeof data !== "object") {
    throw new Error("Backup-filen mangler data-sektion.");
  }

  let count = 0;
  for (const [base, value] of Object.entries(data)) {
    if (typeof value === "string") {
      const scoped = userKeyFn(base);
      localStorage.setItem(scoped, value);
      count++;
    }
  }
  return count;
}

/* ─────────────────────── iCalendar (.ics) Export ─────────────────────── */

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function icsDateStr(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}${mm}${dd}`;
}

/**
 * Export the garden calendar as an iCalendar (.ics) file.
 * Each activity becomes an all-day event on the 1st of its month.
 */
export function exportICalendar(
  calendar: CalendarMonth[],
  gardenName?: string,
): void {
  const now = new Date();
  const year = now.getFullYear();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const name = gardenName?.trim() || "GardenOS";

  const events: string[] = [];
  for (const cm of calendar) {
    for (const act of cm.activities) {
      const uid = `${act.plantId}-${act.featureId}-${act.type}-m${act.month}@gardenos`;
      const dtStart = icsDateStr(year, act.month, 1);
      // Last day of month
      const lastDay = new Date(year, act.month, 0).getDate();
      const dtEnd = icsDateStr(year, act.month, lastDay);

      events.push(
        [
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${dtStart}`,
          `DTEND;VALUE=DATE:${dtEnd}`,
          `SUMMARY:${icsEscape(`${act.icon} ${act.label}: ${act.plantName}`)}`,
          `DESCRIPTION:${icsEscape(`Bed: ${act.bedName}\\nAktivitet: ${act.label}\\nPlante: ${act.plantName}`)}`,
          `CATEGORIES:${icsEscape(act.type)}`,
          "STATUS:CONFIRMED",
          "TRANSP:TRANSPARENT",
          "END:VEVENT",
        ].join("\r\n"),
      );
    }
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//GardenOS//HaveKalender//DA`,
    `X-WR-CALNAME:${icsEscape(name)} – Havekalender`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  downloadBlob(blob, `${name.toLowerCase()}-kalender-${year}.ics`);
}
