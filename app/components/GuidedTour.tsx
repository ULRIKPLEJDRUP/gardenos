"use client";

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";

interface TourStep {
  target: string;
  title: string;
  body: string;
  position?: "top" | "bottom" | "left" | "right";
}

const STEPS: TourStep[] = [
  {
    target: "map-area",
    title: "🌿 Velkommen til GardenOS!",
    body: "Lad os vise dig rundt i appen. Dit interaktive havekort er i centrum — zoom, panorer og klik på elementer.",
    position: "bottom",
  },
  {
    target: "toolbar",
    title: "🛠️ Værktøjslinjen",
    body: "Her finder du Markér, Redigér og Fortryd — dine vigtigste redskaber til at arbejde med kortet.",
    position: "bottom",
  },
  {
    target: "tab-create",
    title: "＋ Opret elementer",
    body: "Tilføj bede, træer, hække, stier, bygninger og meget mere til dit havekort.",
    position: "top",
  },
  {
    target: "tab-content",
    title: "◉ Indhold & detaljer",
    body: "Når du vælger et element på kortet, kan du se og redigere dets egenskaber her.",
    position: "top",
  },
  {
    target: "tab-plants",
    title: "🌱 Plantebibliotek",
    body: "Søg blandt hundredvis af planter med dyrkningsinfo, sæsonkalender og naboskabsdata.",
    position: "top",
  },
  {
    target: "tab-scan",
    title: "📷 Scan & identificér",
    body: "Tag et billede af en plante, og lad AI'en identificere arten og foreslå placering.",
    position: "top",
  },
  {
    target: "tab-tasks",
    title: "📋 Opgaver",
    body: "Hold styr på haveopgaver — vanding, beskæring, såning, gødskning og mere.",
    position: "top",
  },
  {
    target: "tab-calendar",
    title: "📅 Årshjulet",
    body: "Se hvornår du skal så, plante ud og høste — visualiseret måned for måned.",
    position: "top",
  },
  {
    target: "tab-chat",
    title: "💬 AI-rådgiver",
    body: "Stil spørgsmål om din have og få skræddersyede råd fra AI'en baseret på dit kort.",
    position: "top",
  },
  {
    target: "tab-conflicts",
    title: "⚡ Konflikter",
    body: "GardenOS advarer dig automatisk, når planter ikke trives sammen — se dem her.",
    position: "top",
  },
  {
    target: "tab-groups",
    title: "⊞ Grupper",
    body: "Bind elementer sammen i grupper, så du kan flytte og administrere dem samlet.",
    position: "top",
  },
  {
    target: "tab-view",
    title: "👁 Visning",
    body: "Skjul eller vis lag, bogmærker og steder — tilpas kortet til dit behov.",
    position: "top",
  },
  {
    target: "address-search",
    title: "🔍 Adressesøgning",
    body: "Find din adresse og zoom direkte dertil. Du kan også gemme steder som bogmærker.",
    position: "bottom",
  },
  {
    target: "feedback-btn",
    title: "💡 Feedback",
    body: "Har du en idé, et spørgsmål eller fundet en fejl? Send det direkte til os herfra.",
    position: "bottom",
  },
  {
    target: "sidebar-dropdown",
    title: "▾ Alle faner",
    body: "Åbn menuen for at se alle faner, genstart rundvisningen eller logge ud.",
    position: "top",
  },
  {
    target: "sidebar-settings",
    title: "⚙️ Tilpas genveje",
    body: "Vælg hvilke faner der vises i din genvejslinje — og ændr rækkefølgen med træk-og-slip.",
    position: "top",
  },
  {
    target: "mobile-nav",
    title: "📱 Mobilnavigation",
    body: "På mobil finder du dine genveje i bunden af skærmen. Tryk ☰ for at tilpasse dem.",
    position: "top",
  },
];

interface GuidedTourProps {
  storageKey: string;
  forceStart?: boolean;
  onClose?: () => void;
}

const TOOLTIP_W = 320;
const TOOLTIP_H_EST = 200;
const MARGIN = 12;

function clampTooltip(
  rect: DOMRect | null,
  preferredPos: TourStep["position"],
): React.CSSProperties {
  if (!rect) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const GAP = 12;

  const posOrder: Array<"bottom" | "top" | "right" | "left"> = (() => {
    const pref = preferredPos || "bottom";
    const all: Array<"bottom" | "top" | "right" | "left"> = ["bottom", "top", "right", "left"];
    return [pref, ...all.filter((p) => p !== pref)];
  })();

  for (const pos of posOrder) {
    let top = 0;
    let left = 0;

    if (pos === "bottom") {
      top = rect.bottom + GAP;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    } else if (pos === "top") {
      top = rect.top - GAP - TOOLTIP_H_EST;
      left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    } else if (pos === "right") {
      top = rect.top + rect.height / 2 - TOOLTIP_H_EST / 2;
      left = rect.right + GAP;
    } else {
      top = rect.top + rect.height / 2 - TOOLTIP_H_EST / 2;
      left = rect.left - GAP - TOOLTIP_W;
    }

    left = Math.max(MARGIN, Math.min(left, vw - TOOLTIP_W - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - TOOLTIP_H_EST - MARGIN));

    const tRight = left + TOOLTIP_W;
    const tBottom = top + TOOLTIP_H_EST;
    const overlapX = Math.max(0, Math.min(tRight, rect.right) - Math.max(left, rect.left));
    const overlapY = Math.max(0, Math.min(tBottom, rect.bottom) - Math.max(top, rect.top));
    const overlap = overlapX * overlapY;

    if (overlap < rect.width * rect.height * 0.3) {
      return { top, left };
    }
  }

  return {
    top: Math.max(MARGIN, Math.min(rect.bottom + GAP, vh - TOOLTIP_H_EST - MARGIN)),
    left: Math.max(MARGIN, Math.min(rect.left + rect.width / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - MARGIN)),
  };
}

export default function GuidedTour({ storageKey, forceStart, onClose }: GuidedTourProps) {
  const DONE_KEY = `${storageKey}:tour-done`;

  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<React.CSSProperties>({});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [visibleSteps, setVisibleSteps] = useState<TourStep[]>(STEPS);

  const refreshVisibleSteps = useCallback(() => {
    const available = STEPS.filter((s) => document.querySelector(`[data-tour="${s.target}"]`));
    setVisibleSteps(available.length > 0 ? available : STEPS);
  }, []);

  useEffect(() => {
    if (forceStart) {
      refreshVisibleSteps();
      setStep(0);
      setActive(true);
      return;
    }
    try {
      if (!localStorage.getItem(DONE_KEY)) {
        const t = setTimeout(() => {
          refreshVisibleSteps();
          setActive(true);
        }, 1400);
        return () => clearTimeout(t);
      }
    } catch { /* SSR */ }
  }, [DONE_KEY, forceStart, refreshVisibleSteps]);

  const locateTarget = useCallback(() => {
    if (!active) return;
    const s = visibleSteps[step];
    if (!s) return;
    const el = document.querySelector(`[data-tour="${s.target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect(r);
      setTooltipPos(clampTooltip(r, s.position));
    } else {
      setRect(null);
      setTooltipPos(clampTooltip(null, s.position));
    }
  }, [active, step, visibleSteps]);

  useEffect(() => {
    locateTarget();
    const raf = requestAnimationFrame(locateTarget);
    window.addEventListener("resize", locateTarget);
    window.addEventListener("scroll", locateTarget, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", locateTarget);
      window.removeEventListener("scroll", locateTarget, true);
    };
  }, [locateTarget]);

  useLayoutEffect(() => { locateTarget(); }, [step, active, locateTarget]);

  const finish = useCallback(() => {
    setActive(false);
    try { localStorage.setItem(DONE_KEY, "1"); } catch { /* ok */ }
    onClose?.();
  }, [DONE_KEY, onClose]);

  const next = useCallback(() => {
    if (step < visibleSteps.length - 1) setStep((s) => s + 1);
    else finish();
  }, [step, visibleSteps.length, finish]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, next, prev, finish]);

  if (!active || visibleSteps.length === 0) return null;

  const current = visibleSteps[step];
  const PAD = 8;

  return (
    <div className="fixed inset-0 z-[99999]" style={{ pointerEvents: "auto" }}>
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - PAD}
                y={rect.top - PAD}
                width={rect.width + PAD * 2}
                height={rect.height + PAD * 2}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: "auto" }}
          onClick={finish}
        />
      </svg>

      {rect && (
        <div
          className="absolute rounded-xl pointer-events-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 3px rgba(34,197,94,0.6), 0 0 20px 4px rgba(34,197,94,0.25)",
            transition: "all 0.35s cubic-bezier(.4,0,.2,1)",
          }}
        />
      )}

      <div
        ref={tooltipRef}
        className="absolute rounded-2xl bg-white border border-border shadow-2xl p-5"
        style={{
          width: TOOLTIP_W,
          maxHeight: "calc(100dvh - 24px)",
          overflow: "auto",
          ...tooltipPos,
          pointerEvents: "auto",
          transition: "top 0.3s cubic-bezier(.4,0,.2,1), left 0.3s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-0.5 flex-wrap max-w-[220px]">
            {visibleSteps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? "w-4 bg-green-500"
                    : i < step
                    ? "w-1.5 bg-green-300"
                    : "w-1.5 bg-foreground/15"
                }`}
              />
            ))}
          </div>
          <span className="text-[10px] text-foreground/40 font-mono shrink-0 ml-2">
            {step + 1}/{visibleSteps.length}
          </span>
        </div>

        <h3 className="text-sm font-bold text-foreground mb-1.5">{current.title}</h3>
        <p className="text-xs text-foreground/70 leading-relaxed mb-4">{current.body}</p>

        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-[11px] text-foreground/40 hover:text-foreground/60 transition-colors"
            onClick={finish}
          >
            Spring over
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-foreground/60 hover:bg-foreground/5 transition-colors"
                onClick={prev}
              >
                ← Tilbage
              </button>
            )}
            <button
              type="button"
              className="rounded-lg bg-green-500 px-4 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-green-600 transition-colors"
              onClick={next}
            >
              {step < visibleSteps.length - 1 ? "Næste →" : "✓ Færdig!"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
