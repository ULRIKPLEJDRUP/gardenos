// ---------------------------------------------------------------------------
// GardenOS – Weather Store (Open-Meteo + localStorage persistence)
// ---------------------------------------------------------------------------
// Fetches weather from Open-Meteo (free, no API key, CORS-friendly).
// Stores historical data in localStorage for stats & AI context.
// ---------------------------------------------------------------------------

export type WeatherDay = {
  date: string; // YYYY-MM-DD
  tempMax: number;
  tempMin: number;
  precipitation: number;
  windSpeedMax: number;
  weatherCode: number;
};

export type WeatherCurrent = {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  weatherCode: number;
};

export type WeatherData = {
  current: WeatherCurrent;
  forecast: WeatherDay[]; // today + next 7 days
  recentDays: WeatherDay[]; // past ~30 days
  fetchedAt: string; // ISO
  lat: number;
  lng: number;
};

const WEATHER_CACHE_KEY = "gardenos:weather:cache:v1";
const WEATHER_HISTORY_KEY = "gardenos:weather:history:v1";

// ---------------------------------------------------------------------------
// WMO Weather code → emoji + Danish label
// ---------------------------------------------------------------------------
export const WEATHER_CODE_MAP: Record<number, { emoji: string; label: string }> = {
  0: { emoji: "☀️", label: "Klart" },
  1: { emoji: "🌤️", label: "Næsten klart" },
  2: { emoji: "⛅", label: "Delvist skyet" },
  3: { emoji: "☁️", label: "Overskyet" },
  45: { emoji: "🌫️", label: "Tåge" },
  48: { emoji: "🌫️", label: "Rimtåge" },
  51: { emoji: "🌦️", label: "Let støvregn" },
  53: { emoji: "🌦️", label: "Støvregn" },
  55: { emoji: "🌧️", label: "Kraftig støvregn" },
  56: { emoji: "🌧️❄️", label: "Frysende støvregn" },
  57: { emoji: "🌧️❄️", label: "Kraftig frysende støvregn" },
  61: { emoji: "🌧️", label: "Let regn" },
  63: { emoji: "🌧️", label: "Regn" },
  65: { emoji: "🌧️", label: "Kraftig regn" },
  66: { emoji: "🌧️❄️", label: "Let isregn" },
  67: { emoji: "🌧️❄️", label: "Kraftig isregn" },
  71: { emoji: "🌨️", label: "Let sne" },
  73: { emoji: "🌨️", label: "Sne" },
  75: { emoji: "🌨️", label: "Kraftig sne" },
  77: { emoji: "🌨️", label: "Snekorn" },
  80: { emoji: "🌧️", label: "Lette byger" },
  81: { emoji: "🌧️", label: "Byger" },
  82: { emoji: "🌧️", label: "Kraftige byger" },
  85: { emoji: "🌨️", label: "Lette snebyger" },
  86: { emoji: "🌨️", label: "Kraftige snebyger" },
  95: { emoji: "⛈️", label: "Tordenvejr" },
  96: { emoji: "⛈️", label: "Tordenvejr m. hagl" },
  99: { emoji: "⛈️", label: "Tordenvejr m. kraftig hagl" },
};

export function getWeatherEmoji(code: number): string {
  return WEATHER_CODE_MAP[code]?.emoji ?? "🌡️";
}

export function getWeatherLabel(code: number): string {
  return WEATHER_CODE_MAP[code]?.label ?? "Ukendt";
}

// ---------------------------------------------------------------------------
// Fetch from Open-Meteo (free, no API key needed)
// ---------------------------------------------------------------------------
export async function fetchWeather(lat: number, lng: number): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
    `&timezone=Europe%2FCopenhagen` +
    `&past_days=30&forecast_days=8`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo fejl: ${res.status}`);

  const data = await res.json();

  const current: WeatherCurrent = {
    temperature: data.current.temperature_2m,
    apparentTemperature: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    precipitation: data.current.precipitation,
    windSpeed: data.current.wind_speed_10m,
    weatherCode: data.current.weather_code,
  };

  const allDays: WeatherDay[] = (data.daily.time as string[]).map((date, i) => ({
    date,
    tempMax: data.daily.temperature_2m_max[i],
    tempMin: data.daily.temperature_2m_min[i],
    precipitation: data.daily.precipitation_sum[i],
    windSpeedMax: data.daily.wind_speed_10m_max[i],
    weatherCode: data.daily.weather_code[i],
  }));

  // Split into recent (past) and forecast (today + future)
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" })
    .format(new Date()); // "YYYY-MM-DD"
  const recentDays = allDays.filter((d) => d.date < today);
  const forecast = allDays.filter((d) => d.date >= today);

  const result: WeatherData = {
    current,
    forecast,
    recentDays,
    fetchedAt: new Date().toISOString(),
    lat,
    lng,
  };

  // Persist
  saveWeatherCache(result);
  accumulateHistory(allDays);

  return result;
}

// ---------------------------------------------------------------------------
// localStorage cache
// ---------------------------------------------------------------------------
function saveWeatherCache(data: WeatherData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(data));
  } catch { /* quota */ }
}

export function loadWeatherCache(): WeatherData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WeatherData;
  } catch {
    return null;
  }
}

/** Is cached data still fresh? (default: 30 min) */
export function isWeatherCacheFresh(data: WeatherData | null, maxAgeMin = 30): boolean {
  if (!data?.fetchedAt) return false;
  const age = Date.now() - new Date(data.fetchedAt).getTime();
  return age < maxAgeMin * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Historical accumulator – keeps up to 365 days
// ---------------------------------------------------------------------------
function accumulateHistory(days: WeatherDay[]): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadWeatherHistory();
    const byDate = new Map(existing.map((d) => [d.date, d]));
    for (const d of days) byDate.set(d.date, d);
    const all = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    const trimmed = all.slice(-365);
    localStorage.setItem(WEATHER_HISTORY_KEY, JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

export function loadWeatherHistory(): WeatherDay[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WEATHER_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WeatherDay[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Simple statistics
// ---------------------------------------------------------------------------
export type WeatherStats = {
  avgTempMax: number;
  avgTempMin: number;
  totalPrecipitation: number;
  frostDays: number;
  rainDays: number;
  count: number;
};

export function computeWeatherStats(days: WeatherDay[]): WeatherStats {
  if (days.length === 0)
    return { avgTempMax: 0, avgTempMin: 0, totalPrecipitation: 0, frostDays: 0, rainDays: 0, count: 0 };

  let sumMax = 0;
  let sumMin = 0;
  let totalPrecip = 0;
  let frost = 0;
  let rain = 0;

  for (const d of days) {
    sumMax += d.tempMax;
    sumMin += d.tempMin;
    totalPrecip += d.precipitation;
    if (d.tempMin <= 0) frost++;
    if (d.precipitation > 0.5) rain++;
  }

  return {
    avgTempMax: Math.round((sumMax / days.length) * 10) / 10,
    avgTempMin: Math.round((sumMin / days.length) * 10) / 10,
    totalPrecipitation: Math.round(totalPrecip * 10) / 10,
    frostDays: frost,
    rainDays: rain,
    count: days.length,
  };
}

// ---------------------------------------------------------------------------
// Build a text summary for the AI chat context
// ---------------------------------------------------------------------------
export function buildWeatherContextString(data: WeatherData | null): string {
  if (!data) return "";

  const parts: string[] = [];

  // Current
  const c = data.current;
  parts.push(
    `Aktuelt vejr: ${getWeatherLabel(c.weatherCode)} ${getWeatherEmoji(c.weatherCode)}, ` +
      `${c.temperature}°C (føles som ${c.apparentTemperature}°C), ` +
      `fugtighed ${c.humidity}%, vind ${c.windSpeed} km/t, nedbør ${c.precipitation} mm`,
  );

  // Forecast
  if (data.forecast.length > 0) {
    const forecastLines = data.forecast.map(
      (d) =>
        `  ${d.date}: ${getWeatherEmoji(d.weatherCode)} ${d.tempMin}°–${d.tempMax}°C, ` +
        `nedbør ${d.precipitation}mm, vind ${d.windSpeedMax} km/t`,
    );
    parts.push(`Vejrudsigt (${data.forecast.length} dage):\n${forecastLines.join("\n")}`);

    // Frost warning
    const frostDays = data.forecast.filter((d) => d.tempMin <= 0);
    if (frostDays.length > 0) {
      parts.push(
        `⚠️ FROST-ADVARSEL: Nattefrost forventet ${frostDays.map((d) => d.date).join(", ")} ` +
          `(laveste ${Math.min(...frostDays.map((d) => d.tempMin))}°C). ` +
          `Husk at beskytte ømfindtlige planter og slukke for udendørs vand!`,
      );
    }
  }

  // Recent stats
  if (data.recentDays.length > 0) {
    const stats = computeWeatherStats(data.recentDays);
    parts.push(
      `Vejrstatistik sidste ${stats.count} dage: ` +
        `snit dagmaks ${stats.avgTempMax}°C, snit natmin ${stats.avgTempMin}°C, ` +
        `total nedbør ${stats.totalPrecipitation}mm, ` +
        `${stats.frostDays} frostdage, ${stats.rainDays} regndage`,
    );
  }

  return parts.join("\n\n");
}
