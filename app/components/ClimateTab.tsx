"use client";

import { useState, memo } from "react";
import {
  getWeatherEmoji,
  getWeatherLabel,
  getHistorySlice,
  type WeatherData,
  type WeatherDay,
  type WeatherStats,
} from "../lib/weatherStore";

/* ── Props ── */
export interface ClimateTabProps {
  weatherData: WeatherData | null;
  weatherLoading: boolean;
  weatherError: string | null;
  weatherHistory: WeatherDay[];
  weatherStatRange: number;
  setWeatherStatRange: (v: number) => void;
  weatherStats: { stats: WeatherStats; count: number } | null;
}

/* ── Component ── */
function ClimateTabInner({
  weatherData,
  weatherLoading,
  weatherError,
  weatherHistory,
  weatherStatRange,
  setWeatherStatRange,
  weatherStats,
}: ClimateTabProps) {
  const [climateSubTab, setClimateSubTab] = useState<"now" | "history" | "forecast">("now");

  return (
    <div className="mt-3 space-y-3">
      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-lg bg-background p-1 border border-border-light shadow-sm">
        {(["now", "history", "forecast"] as const).map((st) => (
          <button
            key={st}
            type="button"
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-all ${
              climateSubTab === st
                ? "bg-white shadow-sm text-foreground/90 border border-border/60"
                : "text-foreground/50 hover:text-foreground/70 border border-transparent"
            }`}
            onClick={() => setClimateSubTab(st)}
          >
            {st === "now" ? "☀️ Nu" : st === "history" ? "📊 Historik" : "🔮 Sæson"}
          </button>
        ))}
      </div>

      {/* ── Nu (current weather + 7-day forecast) ── */}
      {climateSubTab === "now" && (
        <div className="space-y-3">
          {weatherData ? (
            <>
              {/* Current conditions card */}
              <div className="rounded-xl border border-sky-200/60 bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 p-3" data-tour="weather-card">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{getWeatherEmoji(weatherData.current.weatherCode)}</span>
                  <div>
                    <div className="text-2xl font-bold text-foreground/85 leading-none">{Math.round(weatherData.current.temperature)}°C</div>
                    <div className="text-[11px] text-foreground/50 mt-0.5">{getWeatherLabel(weatherData.current.weatherCode)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/60 border border-white/80 px-2 py-1.5">
                    <div className="text-[9px] text-foreground/40 uppercase font-semibold">Føles som</div>
                    <div className="text-[13px] font-bold text-foreground/70">{Math.round(weatherData.current.apparentTemperature)}°C</div>
                  </div>
                  <div className="rounded-lg bg-white/60 border border-white/80 px-2 py-1.5">
                    <div className="text-[9px] text-foreground/40 uppercase font-semibold">Fugtighed</div>
                    <div className="text-[13px] font-bold text-foreground/70">{weatherData.current.humidity}%</div>
                  </div>
                  <div className="rounded-lg bg-white/60 border border-white/80 px-2 py-1.5">
                    <div className="text-[9px] text-foreground/40 uppercase font-semibold">Vind</div>
                    <div className="text-[13px] font-bold text-foreground/70">{Math.round(weatherData.current.windSpeed)} km/t</div>
                  </div>
                </div>
                {weatherData.forecast.some((d) => d.tempMin <= 0) && (
                  <div className="mt-2 rounded-lg bg-blue-100/80 border border-blue-200 px-3 py-2 text-[11px] text-blue-800 font-medium flex items-center gap-2">
                    <span className="text-base">❄️</span>
                    <div>
                      <div className="font-semibold">Nattefrost forventet</div>
                      <div className="text-[10px] text-blue-700/70 mt-0.5">{weatherData.forecast.filter((d) => d.tempMin <= 0).map((d) => {
                        const dt = new Date(d.date + "T12:00:00");
                        return dt.toLocaleDateString("da-DK", { weekday: "short", day: "numeric", month: "short" });
                      }).join(", ")}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* 7-day forecast */}
              <div>
                <div className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider mb-2">7-dages prognose</div>
                <div className="rounded-xl border border-border-light bg-white/80 overflow-hidden divide-y divide-border/30">
                  {weatherData.forecast.slice(0, 7).map((d) => {
                    const dt = new Date(d.date + "T12:00:00");
                    const dayName = dt.toLocaleDateString("da-DK", { weekday: "short" });
                    const dayNum = dt.getDate();
                    const month = dt.toLocaleDateString("da-DK", { month: "short" });
                    const range = Math.round(d.tempMax) - Math.round(d.tempMin);
                    const barWidth = Math.max(20, Math.min(100, range * 5));
                    return (
                      <div key={d.date} className="flex items-center px-3 py-2 gap-2 hover:bg-foreground/[0.02] transition-colors">
                        <span className="w-16 text-[11px] font-medium text-foreground/70">{dayName} {dayNum}. {month}</span>
                        <span className="w-6 text-center text-sm">{getWeatherEmoji(d.weatherCode)}</span>
                        <span className="w-10 text-right text-[11px] font-mono text-blue-600">{Math.round(d.tempMin)}°</span>
                        <div className="flex-1 h-[6px] rounded-full bg-foreground/5 relative mx-1">
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-300 to-orange-300" style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="w-10 text-[11px] font-mono text-orange-600">{Math.round(d.tempMax)}°</span>
                        <span className="w-12 text-right text-[10px] text-blue-500">{d.precipitation > 0 ? `💧${d.precipitation}mm` : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="text-[8px] text-foreground/25 text-right">Open-Meteo · opdateret {new Date(weatherData.fetchedAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</div>
            </>
          ) : weatherLoading ? (
            <div className="rounded-xl border border-sky-200/40 bg-sky-50/50 px-4 py-8 text-center">
              <div className="text-2xl mb-2">🌤️</div>
              <div className="text-[11px] text-foreground/50">Henter vejrdata…</div>
            </div>
          ) : weatherError ? (
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-4 text-center">
              <div className="text-xl mb-1">⚠️</div>
              <div className="text-[11px] text-amber-700">{weatherError}</div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-background px-4 py-8 text-center">
              <div className="text-2xl mb-2">🌡️</div>
              <div className="text-[11px] text-foreground/50">Ingen vejrdata tilgængelig</div>
            </div>
          )}
        </div>
      )}

      {/* ── Historik (accumulated climate stats) ── */}
      {climateSubTab === "history" && (
        <div className="space-y-3">
          {/* Range selector */}
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider">Periode</div>
            <div className="flex gap-1">
              {[{ v: 7, l: "7d" }, { v: 30, l: "30d" }, { v: 90, l: "3 mdr" }, { v: 365, l: "1 år" }].map((d) => (
                <button
                  key={d.v}
                  type="button"
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all border ${
                    weatherStatRange === d.v
                      ? "border-sky-400 bg-sky-100 text-sky-800 shadow-sm"
                      : "border-border/60 bg-white hover:bg-foreground/5 text-foreground/60"
                  }`}
                  onClick={() => setWeatherStatRange(d.v)}
                >
                  {d.l}
                </button>
              ))}
            </div>
          </div>

          {weatherStats ? (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-orange-200/50 bg-gradient-to-br from-orange-50 to-amber-50 px-3 py-2.5">
                  <div className="text-[9px] text-foreground/40 uppercase font-semibold">📈 Snit dagmaks</div>
                  <div className="text-lg font-bold text-orange-700 mt-0.5">{weatherStats.stats.avgTempMax}°C</div>
                </div>
                <div className="rounded-xl border border-blue-200/50 bg-gradient-to-br from-blue-50 to-cyan-50 px-3 py-2.5">
                  <div className="text-[9px] text-foreground/40 uppercase font-semibold">📉 Snit natmin</div>
                  <div className="text-lg font-bold text-blue-700 mt-0.5">{weatherStats.stats.avgTempMin}°C</div>
                </div>
                <div className="rounded-xl border border-sky-200/50 bg-gradient-to-br from-sky-50 to-blue-50 px-3 py-2.5">
                  <div className="text-[9px] text-foreground/40 uppercase font-semibold">🌧️ Total nedbør</div>
                  <div className="text-lg font-bold text-sky-700 mt-0.5">{weatherStats.stats.totalPrecipitation} mm</div>
                </div>
                <div className="rounded-xl border border-cyan-200/50 bg-gradient-to-br from-cyan-50 to-sky-50 px-3 py-2.5">
                  <div className="text-[9px] text-foreground/40 uppercase font-semibold">☔ Regndage</div>
                  <div className="text-lg font-bold text-cyan-700 mt-0.5">{weatherStats.stats.rainDays}</div>
                </div>
                <div className="rounded-xl border border-indigo-200/50 bg-gradient-to-br from-indigo-50 to-violet-50 px-3 py-2.5">
                  <div className="text-[9px] text-foreground/40 uppercase font-semibold">❄️ Frostdage</div>
                  <div className="text-lg font-bold text-indigo-700 mt-0.5">{weatherStats.stats.frostDays}</div>
                </div>
                <div className="rounded-xl border border-gray-200/50 bg-gradient-to-br from-gray-50 to-slate-50 px-3 py-2.5">
                  <div className="text-[9px] text-foreground/40 uppercase font-semibold">📅 Datapunkter</div>
                  <div className="text-lg font-bold text-gray-700 mt-0.5">{weatherStats.count}</div>
                </div>
              </div>

              {/* Temperature mini-chart (text-based bar chart) */}
              {(() => {
                const slice = getHistorySlice(weatherHistory, weatherStatRange);
                if (slice.length < 2) return null;
                const maxT = Math.max(...slice.map(d => d.tempMax));
                const minT = Math.min(...slice.map(d => d.tempMin));
                const range = maxT - minT || 1;
                // Show last 14 entries max in the chart
                const shown = slice.slice(-14);
                return (
                  <div>
                    <div className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider mb-2">Temperaturforløb</div>
                    <div className="rounded-xl border border-border-light bg-white/80 p-2 space-y-[2px]">
                      {shown.map((d) => {
                        const dt = new Date(d.date + "T12:00:00");
                        const label = dt.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
                        const lowPct = ((d.tempMin - minT) / range) * 100;
                        const highPct = ((d.tempMax - minT) / range) * 100;
                        return (
                          <div key={d.date} className="flex items-center gap-1">
                            <span className="w-12 text-[9px] text-foreground/50 text-right font-medium shrink-0">{label}</span>
                            <div className="flex-1 h-[8px] rounded-full bg-foreground/[0.04] relative">
                              <div
                                className="absolute h-full rounded-full bg-gradient-to-r from-blue-400 to-orange-400"
                                style={{ left: `${lowPct}%`, width: `${Math.max(4, highPct - lowPct)}%` }}
                              />
                            </div>
                            <span className="w-14 text-[8px] font-mono text-foreground/40 shrink-0">{Math.round(d.tempMin)}°/{Math.round(d.tempMax)}°</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[8px] text-foreground/25 mt-1 px-14">
                      <span>{Math.round(minT)}°C</span>
                      <span>{Math.round(maxT)}°C</span>
                    </div>
                  </div>
                );
              })()}

              {/* Precipitation chart */}
              {(() => {
                const slice = getHistorySlice(weatherHistory, weatherStatRange);
                if (slice.length < 2) return null;
                const maxP = Math.max(...slice.map(d => d.precipitation), 1);
                const shown = slice.slice(-14);
                return (
                  <div>
                    <div className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider mb-2">Nedbør</div>
                    <div className="rounded-xl border border-border-light bg-white/80 p-2">
                      <div className="flex items-end gap-[3px]" style={{ height: 60 }}>
                        {shown.map((d) => {
                          const hPct = (d.precipitation / maxP) * 100;
                          const dt = new Date(d.date + "T12:00:00");
                          return (
                            <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full" title={`${dt.toLocaleDateString("da-DK", { day: "numeric", month: "short" })}: ${d.precipitation}mm`}>
                              <div
                                className="w-full rounded-t bg-gradient-to-t from-sky-500 to-sky-300 min-h-[1px]"
                                style={{ height: `${Math.max(2, hPct)}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[7px] text-foreground/25 mt-1">
                        {shown.filter((_, i) => i === 0 || i === shown.length - 1).map((d) => {
                          const dt = new Date(d.date + "T12:00:00");
                          return <span key={d.date}>{dt.toLocaleDateString("da-DK", { day: "numeric", month: "short" })}</span>;
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="rounded-xl border border-border bg-background px-4 py-8 text-center">
              <div className="text-2xl mb-2">📊</div>
              <div className="text-[11px] text-foreground/50">Ingen historiske data endnu</div>
              <div className="text-[10px] text-foreground/30 mt-1">Data akkumuleres automatisk over tid</div>
            </div>
          )}
        </div>
      )}

      {/* ── Sæsonprognose ── */}
      {climateSubTab === "forecast" && (
        <div className="space-y-3">
          {(() => {
            const now = new Date();
            const month = now.getMonth(); // 0-11
            type SeasonInfo = { name: string; emoji: string; months: string; tips: string[]; params: { label: string; emoji: string; value: string; note: string }[] };
            const seasons: SeasonInfo[] = [
              {
                name: "Forår", emoji: "🌱", months: "Mar – Maj",
                tips: [
                  "Start forharvesting og forspiring indendørs",
                  "Pas på sene nattefrost — dæk ømfindtlige planter",
                  "Jord-temperatur bør nå 8°C+ for direkte såning",
                  "Optimal tid til at plante buske og træer",
                ],
                params: [
                  { label: "Dagslængde", emoji: "☀️", value: "10–16 timer", note: "Stiger hurtigt" },
                  { label: "Jordtemperatur", emoji: "🌡️", value: "5–15°C", note: "Stiger langsomt" },
                  { label: "Nattefrost-risiko", emoji: "❄️", value: "Høj → Lav", note: "Aftager i maj" },
                  { label: "Nedbør", emoji: "🌧️", value: "30–50mm/mdr", note: "Moderat" },
                ],
              },
              {
                name: "Sommer", emoji: "☀️", months: "Jun – Aug",
                tips: [
                  "Vand tidligt morgen eller sen aften",
                  "Mulch'er for at holde på fugtighed",
                  "Høst løbende for at fremme ny vækst",
                  "Hold øje med skadedyr i varme perioder",
                ],
                params: [
                  { label: "Dagslængde", emoji: "☀️", value: "15–17 timer", note: "Længste dage" },
                  { label: "Jordtemperatur", emoji: "🌡️", value: "15–22°C", note: "Optimal vækst" },
                  { label: "Tørkerisiko", emoji: "🏜️", value: "Moderat → Høj", note: "Vand regelmæssigt" },
                  { label: "Nedbør", emoji: "🌧️", value: "50–80mm/mdr", note: "Variabelt" },
                ],
              },
              {
                name: "Efterår", emoji: "🍂", months: "Sep – Nov",
                tips: [
                  "Plant løg til forårsblomstring",
                  "Saml blade til kompost og mulch",
                  "Sidste chance for vinterhårdføre afgrøder",
                  "Beskær frugtbuske efter høst",
                ],
                params: [
                  { label: "Dagslængde", emoji: "☀️", value: "8–12 timer", note: "Falder hurtigt" },
                  { label: "Jordtemperatur", emoji: "🌡️", value: "5–15°C", note: "Faldende" },
                  { label: "Første frost", emoji: "❄️", value: "Okt–Nov", note: "Dæk følsomme planter" },
                  { label: "Nedbør", emoji: "🌧️", value: "60–90mm/mdr", note: "Stigende" },
                ],
              },
              {
                name: "Vinter", emoji: "❄️", months: "Dec – Feb",
                tips: [
                  "Planlæg næste sæson — bestil frø",
                  "Beskyt stauder med halm eller granris",
                  "Vedligehold redskaber og komposter",
                  "Start forspiring i januar-februar",
                ],
                params: [
                  { label: "Dagslængde", emoji: "☀️", value: "7–9 timer", note: "Korteste dage" },
                  { label: "Jordtemperatur", emoji: "🌡️", value: "-2–5°C", note: "Minimal vækst" },
                  { label: "Frostdage", emoji: "❄️", value: "15–25/mdr", note: "Daglig frost mulig" },
                  { label: "Nedbør", emoji: "🌧️", value: "40–60mm/mdr", note: "Sne/slud" },
                ],
              },
            ];
            const seasonIdx = month <= 1 ? 3 : month <= 4 ? 0 : month <= 7 ? 1 : month <= 10 ? 2 : 3;
            const current = seasons[seasonIdx];
            const next = seasons[(seasonIdx + 1) % 4];

            return (
              <>
                {/* Current season */}
                <div className="rounded-xl border border-accent/20 bg-gradient-to-br from-accent-light/50 to-green-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{current.emoji}</span>
                    <div>
                      <div className="text-[13px] font-bold text-foreground/80">{current.name}</div>
                      <div className="text-[10px] text-foreground/45">{current.months} · DK klimazone 7-8</div>
                    </div>
                    <span className="ml-auto rounded-full bg-accent/15 text-accent text-[9px] font-bold px-2 py-0.5">NU</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {current.params.map((p) => (
                      <div key={p.label} className="rounded-lg bg-white/70 border border-white/90 px-2 py-1.5">
                        <div className="text-[8px] text-foreground/35 uppercase font-semibold">{p.emoji} {p.label}</div>
                        <div className="text-[12px] font-bold text-foreground/75 mt-0.5">{p.value}</div>
                        <div className="text-[8px] text-foreground/35">{p.note}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Season tips */}
                <div>
                  <div className="text-[10px] font-bold text-foreground/50 uppercase tracking-wider mb-1.5">💡 Sæsontips — {current.name}</div>
                  <div className="space-y-1">
                    {current.tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg bg-background border border-border-light px-2.5 py-1.5">
                        <span className="text-[10px] text-accent font-bold mt-px">✓</span>
                        <span className="text-[11px] text-foreground/65">{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Next season preview */}
                <div className="rounded-xl border border-border bg-foreground/[0.02] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{next.emoji}</span>
                    <div>
                      <div className="text-[12px] font-bold text-foreground/60">Næste: {next.name}</div>
                      <div className="text-[10px] text-foreground/35">{next.months}</div>
                    </div>
                    <span className="ml-auto text-[9px] text-foreground/30 font-medium">KOMMENDE</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {next.params.map((p) => (
                      <div key={p.label} className="rounded-lg bg-white/50 border border-border/40 px-2 py-1.5">
                        <div className="text-[8px] text-foreground/30 uppercase font-semibold">{p.emoji} {p.label}</div>
                        <div className="text-[11px] font-bold text-foreground/55 mt-0.5">{p.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Integration note */}
                {weatherStats && (
                  <div className="rounded-lg bg-sky-50/50 border border-sky-200/40 px-3 py-2">
                    <div className="text-[10px] font-semibold text-sky-800/70 mb-1">📍 Din haves klima</div>
                    <div className="text-[10px] text-sky-700/60">
                      Baseret på {weatherStats.count} dages data: snit maks {weatherStats.stats.avgTempMax}°C,
                      snit min {weatherStats.stats.avgTempMin}°C, {weatherStats.stats.frostDays} frostdage,
                      {weatherStats.stats.totalPrecipitation}mm nedbør.
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

const ClimateTab = memo(ClimateTabInner);
export default ClimateTab;
