/**
 * wateringAdvisor.ts – Smart watering recommendations for GardenOS
 *
 * Combines weather data (recent precipitation, temperature, forecast)
 * with soil drainage profiles and plant water needs to produce
 * per-bed watering advice.
 */

import type { WeatherData, WeatherDay } from "./weatherStore";
import type { PlantSpecies, WaterNeed } from "./plantTypes";
import type { SoilProfile } from "./soilTypes";

/* ─────────── Types ─────────── */

export type WateringUrgency = "none" | "low" | "moderate" | "high" | "critical";

export interface BedWateringAdvice {
  featureId: string;
  bedName: string;
  urgency: WateringUrgency;
  adviceText: string;
  reasons: string[];
  /** Recommended litres per m² */
  litresPerM2: number;
  /** Plant water needs in this bed */
  plantWaterNeeds: WaterNeed[];
  /** Soil drainage factor */
  drainageFactor: "fast" | "normal" | "slow";
}

/* ─────────── Constants ─────────── */

/** mm of rain in last 3 days that counts as "recently watered" */
const RECENT_RAIN_THRESHOLD = 8;
/** mm of rain in last 7 days for "well-watered" */
const WEEKLY_RAIN_THRESHOLD = 20;
/** Temperature above which evaporation is high */
const HIGH_TEMP_C = 25;
/** Temperature above which evaporation is very high */
const VERY_HIGH_TEMP_C = 30;

/* ─────────── Urgency colours/icons ─────────── */

export const URGENCY_CONFIG: Record<WateringUrgency, { icon: string; label: string; color: string; bg: string; border: string }> = {
  none:     { icon: "✅", label: "Ingen vanding",     color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  low:      { icon: "💧", label: "Let vanding",       color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
  moderate: { icon: "💦", label: "Moderat vanding",   color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200" },
  high:     { icon: "🚿", label: "Vand grundigt",     color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  critical: { icon: "🆘", label: "Akut vanding!",     color: "text-red-700",    bg: "bg-red-50",    border: "border-red-200" },
};

/* ─────────── Analysis ─────────── */

/**
 * Analyse weather + soil + plants to produce watering advice for a single bed.
 */
export function computeWateringAdvice(opts: {
  featureId: string;
  bedName: string;
  weather: WeatherData | null;
  soilProfile: SoilProfile | null;
  plantSpecies: PlantSpecies[];
}): BedWateringAdvice {
  const { featureId, bedName, weather, soilProfile, plantSpecies } = opts;
  const reasons: string[] = [];
  let score = 0; // higher = more urgent

  // 1. Determine plant water needs
  const waterNeeds: WaterNeed[] = plantSpecies
    .map((sp) => sp.water || "medium")
    .filter((v, i, a) => a.indexOf(v) === i) as WaterNeed[];
  const hasHighNeed = waterNeeds.includes("high");
  const hasLowNeed = waterNeeds.includes("low") && !hasHighNeed;

  if (hasHighNeed) {
    score += 2;
    reasons.push("🌱 Planter med højt vandbehov i dette bed");
  }
  if (hasLowNeed) {
    score -= 1;
    reasons.push("🌵 Tørketolerant planter – behøver mindre vand");
  }

  // 2. Recent precipitation
  if (weather) {
    const recentDays3 = (weather.recentDays || []).slice(-3);
    const rain3d = recentDays3.reduce((s, d) => s + d.precipitation, 0);
    const recentDays7 = (weather.recentDays || []).slice(-7);
    const rain7d = recentDays7.reduce((s, d) => s + d.precipitation, 0);

    if (rain3d >= RECENT_RAIN_THRESHOLD) {
      score -= 2;
      reasons.push(`🌧️ ${Math.round(rain3d)}mm nedbør de sidste 3 dage`);
    } else if (rain3d < 2) {
      score += 2;
      reasons.push("☀️ Næsten ingen nedbør de sidste 3 dage");
    }

    if (rain7d >= WEEKLY_RAIN_THRESHOLD) {
      score -= 1;
      reasons.push(`💧 ${Math.round(rain7d)}mm nedbør den seneste uge`);
    } else if (rain7d < 5) {
      score += 2;
      reasons.push("⚠️ Meget lidt nedbør den seneste uge");
    }

    // 3. Temperature effect
    const temp = weather.current.temperature;
    if (temp >= VERY_HIGH_TEMP_C) {
      score += 3;
      reasons.push(`🔥 Meget varmt (${Math.round(temp)}°C) – høj fordampning`);
    } else if (temp >= HIGH_TEMP_C) {
      score += 1;
      reasons.push(`☀️ Varmt (${Math.round(temp)}°C) – øget fordampning`);
    } else if (temp < 10) {
      score -= 2;
      reasons.push(`❄️ Koldt (${Math.round(temp)}°C) – lav fordampning`);
    }

    // 4. Wind effect
    if (weather.current.windSpeed > 25) {
      score += 1;
      reasons.push(`💨 Kraftig vind (${Math.round(weather.current.windSpeed)} km/t) – tørrer jorden`);
    }

    // 5. Forecast – rain coming?
    const forecastRain = (weather.forecast || []).slice(0, 2).reduce((s, d) => s + d.precipitation, 0);
    if (forecastRain >= 8) {
      score -= 2;
      reasons.push(`🌧️ Regn forventet (${Math.round(forecastRain)}mm i de næste 2 dage)`);
    } else if (forecastRain < 1) {
      score += 1;
      reasons.push("☀️ Ingen regn forventet de næste 2 dage");
    }
  } else {
    reasons.push("⚠️ Ingen vejrdata tilgængelig – kan ikke vurdere nedbør");
    score += 1;
  }

  // 6. Soil drainage
  let drainageFactor: "fast" | "normal" | "slow" = "normal";
  if (soilProfile) {
    if (soilProfile.drainage === "dries-fast") {
      drainageFactor = "fast";
      score += 1;
      reasons.push("🏜️ Jorden tørrer hurtigt ud (sand/grus)");
    } else if (soilProfile.drainage === "standing") {
      drainageFactor = "slow";
      score -= 1;
      reasons.push("🪨 Jorden holder godt på vand (ler/tung)");
    }
  }

  // 7. Season check (winter months = no watering)
  const month = new Date().getMonth() + 1;
  if (month <= 2 || month >= 11) {
    score = Math.min(score, 0);
    reasons.push("❄️ Vintersæson – normalt ingen vanding nødvendig");
  }

  // Clamp and map to urgency
  const clampedScore = Math.max(-3, Math.min(8, score));
  let urgency: WateringUrgency;
  if (clampedScore <= 0) urgency = "none";
  else if (clampedScore <= 2) urgency = "low";
  else if (clampedScore <= 4) urgency = "moderate";
  else if (clampedScore <= 6) urgency = "high";
  else urgency = "critical";

  // Litres recommendation (approximate, for open ground beds ~1m²)
  let litres = 0;
  if (urgency === "low") litres = 2;
  else if (urgency === "moderate") litres = 4;
  else if (urgency === "high") litres = 6;
  else if (urgency === "critical") litres = 8;

  // Adjust for drainage
  if (drainageFactor === "fast") litres = Math.round(litres * 1.3);
  if (drainageFactor === "slow") litres = Math.round(litres * 0.7);

  // Build advice text
  let adviceText: string;
  switch (urgency) {
    case "none":
      adviceText = "Jorden har nok fugt. Ingen vanding nødvendig i dag.";
      break;
    case "low":
      adviceText = `Let vanding anbefales (ca. ${litres} l/m²). Vand helst tidligt morgen.`;
      break;
    case "moderate":
      adviceText = `Moderat vanding anbefales (ca. ${litres} l/m²). Vand i de tidlige morgentimer eller sent om aftenen.`;
      break;
    case "high":
      adviceText = `Grundig vanding nødvendig (ca. ${litres} l/m²). Vand dybt ved roden, undgå at vande blade.`;
      break;
    case "critical":
      adviceText = `Akut vanding! Planterne er i fare. Giv mindst ${litres} l/m² hurtigst muligt. Overvej mulching for at reducere fordampning.`;
      break;
  }

  return {
    featureId,
    bedName,
    urgency,
    adviceText,
    reasons,
    litresPerM2: litres,
    plantWaterNeeds: waterNeeds,
    drainageFactor,
  };
}

/**
 * Sort advice entries by urgency (most urgent first)
 */
export function sortByUrgency(advice: BedWateringAdvice[]): BedWateringAdvice[] {
  const order: Record<WateringUrgency, number> = { critical: 0, high: 1, moderate: 2, low: 3, none: 4 };
  return [...advice].sort((a, b) => order[a.urgency] - order[b.urgency]);
}
