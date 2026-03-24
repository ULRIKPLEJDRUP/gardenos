# 🎨 Design Lab — Feature Specification

> **Branch:** `feature/design-lab`
> **Status:** Arkitektur-fase — klar til feedback før implementation

---

## 1. Vision

**Design Lab** er en dedikeret, visuelt orienteret editor der åbner når brugeren
vil arbejde detaljeret med et enkelt bed, område eller container. Tænk det som
at "zoome ind" i et bed og se det oppefra i perfekt skala — med rækker, planter,
vand, el, stier og farver der ændrer sig med årstiderne.

### Hvad gør det bedre end Gardena?

| Gardena | GardenOS Design Lab |
|---------|---------------------|
| Statisk have-kort | **Tovejs-sync**: ændringer i Lab → kort og omvendt |
| Ingen plantedata | **Rig plantedata**: afstande, højder, companion-checks, sæson |
| Manuel placering | **Smart snap**: auto-spacing, rækkeforslag, kollisionstjek |
| Ingen AI | **AI-assistent** kender bed-kontekst og kan foreslå layouts |
| Én fast visning | **Sæson-slider**: se bedet i forår, sommer, efterår, vinter |
| Generiske ikoner | **Plantespecifikke farver + ikoner** med vækststadier |

---

## 2. Brugerflow

```
┌─────────────────────────────────────────────────┐
│  HOVEDKORT (eksisterende)                       │
│                                                 │
│  Bruger klikker et bed/område → sidebar vises   │
│  → Ny knap: "🎨 Åbn i Design Lab"              │
│                                                 │
│  ELLER: Bruger laver nyt bed → tilbydes Lab     │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  DESIGN LAB (nyt fullscreen overlay / panel)    │
│                                                 │
│  ┌───────────────────────────────────────┐      │
│  │  CANVAS (bed set oppefra)             │      │
│  │                                       │      │
│  │  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐   │      │
│  │  │  🥕  🥕  🥕  🥕  🥕  🥕      │   │      │
│  │  │                                │   │      │
│  │  │  🥬  🥬  🥬  🥬  🥬  🥬      │   │      │
│  │  │                                │   │      │
│  │  │  🌿  🌿  🌿  🌿  🌿  🌿      │   │      │
│  │  │                                │   │      │
│  │  │  🫛  🫛  🫛  🫛  🫛  🫛      │   │      │
│  │  │          💧 (vandpunkt)        │   │      │
│  │  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘   │      │
│  │                                       │      │
│  │  [Sæson-slider: ❄️ Vinter ──●── 🌞 Sommer]  │
│  └───────────────────────────────────────┘      │
│                                                 │
│  ┌─────────┐  ┌─────────────────────────┐       │
│  │ PALETTE │  │ PROPERTIES PANEL        │       │
│  │         │  │                         │       │
│  │ 🌱Plante│  │ Valgt: Gulerod          │       │
│  │ 💧Vand  │  │ Afstand: 5cm            │       │
│  │ ⚡El    │  │ Companion: ✅ Løg       │       │
│  │ 🧱Kant  │  │ Companion: ⚠️ Dild      │       │
│  │ 🚶Sti   │  │ Høst: Aug-Okt          │       │
│  │ 📝Label │  │ [Fjern] [Dupliker]      │       │
│  └─────────┘  └─────────────────────────┘       │
└─────────────────────────────────────────────────┘
```

---

## 3. Arkitektur

### 3.1 Ny datamodel: `BedLayout`

```typescript
/** Intra-bed koordinatsystem: (0,0) = øverste venstre hjørne af bounding box */
type BedLocalCoord = { x: number; y: number };  // i centimeter

/** Et element placeret inde i bedet */
type BedElement = {
  id: string;
  type: "plant" | "row" | "water" | "electric" | "path" | "edge" | "label";

  // Position & geometri (bed-lokale cm-koordinater)
  position: BedLocalCoord;          // center-punkt
  rotation?: number;                // grader (0 = op)
  width?: number;                   // cm
  length?: number;                  // cm

  // Plant-specifik
  speciesId?: string;               // → PlantSpecies.id
  varietyId?: string;
  instanceId?: string;              // → PlantInstance.id (sync med hoveddata)
  count?: number;
  spacingCm?: number;               // override artens default

  // Visuel
  color?: string;                   // hex-farve override
  label?: string;                   // fritekst-label
  icon?: string;                    // emoji override
  zIndex?: number;                  // lag-order

  // Infrastruktur-specifik
  infrastructureKind?: string;      // "drip-line", "sprinkler", "cable", etc.
};

/** Season-afhængig visuel state */
type SeasonVisual = {
  month: number;                    // 1-12
  elements: {
    elementId: string;
    visible: boolean;               // Er planten synlig denne måned?
    phase: "dormant" | "sprouting" | "growing" | "flowering" | "fruiting" | "harvesting" | "dying";
    color: string;                  // Primær farve for denne fase
    opacity: number;                // 0-1
    scale: number;                  // Relativ størrelse (0.2 for spire, 1.0 for moden)
  }[];
};

/** Komplet bed-layout */
type BedLayout = {
  id: string;
  featureId: string;                // → GardenFeatureProperties.gardenosId
  version: number;                  // optimistic locking

  // Bedets form i lokale koordinater
  outlineCm: BedLocalCoord[];       // polygon-kontur i cm (konverteret fra GeoJSON)
  widthCm: number;                  // bounding box bredde
  lengthCm: number;                 // bounding box længde
  rotationDeg: number;              // bedets rotation ift. nord

  // Elementer
  elements: BedElement[];

  // Sæson-visuals (beregnet, ikke bruger-defineret)
  seasonVisuals?: SeasonVisual[];

  // Metadata
  createdAt: string;
  updatedAt: string;
};
```

### 3.2 Tovejs-sync med hovedkortet

```
  ┌──────────────┐          ┌──────────────┐
  │  HOVEDKORT   │          │  DESIGN LAB  │
  │              │  sync    │              │
  │ GeoJSON ◄────┼──────────┼── BedLayout  │
  │ Polygoner    │          │  (cm-coords) │
  │ + Rows       │  sync    │              │
  │ + Instances  ├──────────┼►  Elements   │
  └──────────────┘          └──────────────┘
```

**Koordinat-konvertering:**
- `geoToBedLocal(latlng, bedFeature) → BedLocalCoord`  (geo → cm)
- `bedLocalToGeo(coord, bedFeature) → LatLng`          (cm → geo)
- Bruger bedets polygon-centroid som origo + rotation

**Sync-strategi:**
1. **Åbn Lab** → Konvertér eksisterende rækker + instanser → `BedElement[]`
2. **Ændring i Lab** → Opdatér `BedLayout` → push ændringer til GeoJSON-layout + `PlantInstance[]`
3. **Ændring på kort** → Detect changed features for dette bed → re-konvertér til `BedLayout`
4. **Luk Lab** → Final sync, cleanup

### 3.3 Komponentstruktur

```
app/
  components/
    design-lab/
      DesignLab.tsx          # Hoved-container (overlay/modal)
      DesignLabCanvas.tsx    # SVG/Canvas bed-rendering
      DesignLabPalette.tsx   # Drag-palette (planter, infra, kanter)
      DesignLabProperties.tsx # Egenskaber for valgt element
      DesignLabToolbar.tsx   # Værktøjslinje (select, move, rotate, delete)
      SeasonSlider.tsx       # Måned-slider med farve-preview
      CompanionOverlay.tsx   # Visuel companion-check overlay
      useDesignLabStore.ts   # Zustand/useState store for lab-state
      useBedSync.ts          # Hook: tovejs-sync med hovedkort
      bedGeometry.ts         # Koordinat-konvertering, snap, collision
      seasonColors.ts        # Plantefarver per måned/fase
  lib/
    bedLayoutStore.ts        # Persist BedLayout til localStorage
    bedLayoutTypes.ts        # Types fra sektion 3.1
```

### 3.4 Rendering-teknologi

**SVG** (ikke Canvas/WebGL) — fordi:
- Nemt at style med CSS (hover, selection, transitions)
- Hvert element er en DOM-node → native drag & click events
- Responsive, skalerer rent med viewBox
- Kan bruge CSS-animationer for sæson-transitions
- Emoji-rendering via `<text>` eller `<foreignObject>`
- Performance er fin for <500 elementer (et bed har typisk <100)

```tsx
<svg viewBox={`0 0 ${widthCm} ${lengthCm}`} className="w-full h-full">
  {/* Bed outline */}
  <polygon points={outlinePoints} className="fill-amber-100 stroke-amber-800" />

  {/* Grid lines (10cm spacing) */}
  {gridLines.map(line => <line ... className="stroke-gray-200" />)}

  {/* Rows */}
  {rows.map(row => <rect ... className="fill-green-50 stroke-green-300" />)}

  {/* Plant elements */}
  {plants.map(el => (
    <g transform={`translate(${el.position.x}, ${el.position.y})`}
       className="cursor-grab hover:scale-110 transition-transform">
      <circle r={el.spacingCm/2} className="fill-green-200/50" />
      <text textAnchor="middle" dominantBaseline="central">{el.icon}</text>
    </g>
  ))}

  {/* Infrastructure */}
  {infra.map(el => ...)}

  {/* Companion check overlays */}
  {conflicts.map(c => <circle ... className="stroke-red-500 stroke-2 fill-red-100/30" />)}
</svg>
```

---

## 4. Faseopdelt Udvikling

### Fase 1: Fundament (MVP) ⭐
> Mål: Kan åbne et bed i Lab, se det i skala, tilføje planter, og ændringerne synker

| Feature | Beskrivelse | Værdi |
|---------|-------------|-------|
| **Bed Canvas** | SVG-rendering af bedets polygon i cm-skala med grid | 🟢🟢🟢 Grundlag for alt |
| **Koordinat-sync** | Geo↔lokal konvertering, korrekt rotation | 🟢🟢🟢 Dataintegritet |
| **Drag & drop planter** | Træk plante fra palette, placer i bed med snap-to-grid | 🟢🟢🟢 Core UX |
| **Auto-spacing** | Planter snapper til artens anbefalede afstand | 🟢🟢 Fejlforebyggelse |
| **Række-generering** | Tilføj en art → auto-fyld en hel række med korrekt spacing | 🟢🟢🟢 Produktivitet |
| **Sync til kort** | Ændringer i Lab → opdaterer GeoJSON + PlantInstances | 🟢🟢🟢 Data-konsistens |
| **Companion badges** | Grøn/rød indikator mellem naboer | 🟢🟢 Plantekundskab |

### Fase 2: Visuelt Design
> Mål: Sæson-farver, infrastruktur, mere poleret UX

| Feature | Beskrivelse | Værdi |
|---------|-------------|-------|
| **Sæson-slider** | Slider jan→dec, planter ændrer farve/størrelse/synlighed | 🟢🟢🟢 Wow-faktor |
| **Vand & el** | Træk dryp-slange, vandpunkt, el-kabel ind i bed | 🟢🟢 Komplet planlægning |
| **Kant-elementer** | Bed-kantsten, fliser, sti-elementer | 🟢 Æstetik |
| **Farve-kodning** | Planter farvet efter type, familie, eller høsttidspunkt | 🟢🟢 Overblik |
| **Shade overlay** | Visualisér skygge fra høje planter/træer over tid | 🟢🟢 Avanceret |

### Fase 3: AI & Samarbejde
> Mål: AI-assistent i Lab, design-templates, sammenligning

| Feature | Beskrivelse | Værdi |
|---------|-------------|-------|
| **AI bed-rådgiver** | "Foreslå optimal placering for disse 5 arter i dette bed" | 🟢🟢🟢 Unik værdi |
| **Design-templates** | Gem og del bed-designs ("Companion-bed", "Tre-søstre") | 🟢🟢 Genbrug |
| **Version-sammenligning** | Side-by-side visning af to sæsoner/designs | 🟢🟢 Planlægning |
| **Print/export** | PDF/billede af bed-plan med planteliste | 🟢 Praktisk |

---

## 5. Fase 1 — Detaljeret Implementeringsplan

### 5.1 Nye filer

```
app/lib/bedLayoutTypes.ts      ~120 linjer  — types
app/lib/bedLayoutStore.ts      ~80 linjer   — localStorage CRUD
app/lib/bedGeometry.ts         ~200 linjer  — koordinat-math
app/components/design-lab/
  DesignLab.tsx                ~300 linjer  — container + state
  DesignLabCanvas.tsx          ~400 linjer  — SVG rendering
  DesignLabPalette.tsx         ~150 linjer  — drag palette
  DesignLabProperties.tsx      ~200 linjer  — selected element panel
  DesignLabToolbar.tsx         ~100 linjer  — tools + zoom
```

### 5.2 Ændringer i eksisterende filer

| Fil | Ændring |
|-----|---------|
| `GardenMapClient.tsx` | + "🎨 Åbn i Design Lab" knap i bed-sidebar (~15 linjer) |
| `GardenMapClient.tsx` | + `<DesignLab>` mount + state for åbn/luk (~10 linjer) |
| `plantTypes.ts` | Ingen ændringer (bruger eksisterende typer) |
| `plantStore.ts` | Evt. ny helper: `getInstancesForFeatureDeep()` |

### 5.3 Interaktion med eksisterende systemer

```
┌─────────────────────────────────────────────────────────────┐
│                    Design Lab                               │
│                                                             │
│  Bruger:  ┌──────────────┐                                  │
│  Input    │  bedGeometry  │ ← computeAutoRows()             │
│     ↓     │  .ts          │ ← polygonToMetric()             │
│  Palette  └──────┬───────┘ ← clipLineToPolygon()           │
│     ↓            │                                          │
│  Canvas   ┌──────▼───────┐     ┌─────────────────┐         │
│  (SVG)    │ BedLayout    │────▶│ plantStore.ts    │         │
│           │ (lokal state)│     │ (PlantInstances) │         │
│           └──────┬───────┘     └─────────────────┘         │
│                  │                                          │
│           ┌──────▼───────┐     ┌─────────────────┐         │
│           │ bedLayoutStore│────▶│ layout GeoJSON   │        │
│           │ .ts          │     │ (localStorage)   │        │
│           └──────────────┘     └─────────────────┘         │
│                                                             │
│  AI:  buildGardenContext() ← automatisk inkluderer          │
│        bed-layout data fra Lab                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. UX Skitser

### 6.1 Åbning af Design Lab

```
┌─ Sidebar (eksisterende) ─────────────────┐
│                                          │
│  📍 Grøntsagsbed 1                       │
│  Polygon · 3.2m × 1.2m                  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  🎨  Åbn i Design Lab             │  │
│  │  Detaljeret bed-planlægning        │  │
│  └────────────────────────────────────┘  │
│                                          │
│  🌱 Plantede arter:                      │
│  ...                                     │
└──────────────────────────────────────────┘
```

### 6.2 Design Lab — Hovedvisning

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Tilbage til kort    📍 Grøntsagsbed 1    3.2m × 1.2m       │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Værktøjer: [👆 Vælg] [✋ Flyt] [🔄 Rotér] [🗑️ Slet] [↩ Fortryd]│
│                                                                 │
│  ┌──────────────────────────────────────────────┐  ┌─────────┐ │
│  │  ╔═══════════════════════════════════════╗    │  │PALETTE  │ │
│  │  ║ ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  · ║    │  │         │ │
│  │  ║ 🥕 🥕 🥕 🥕 🥕 🥕 🥕 🥕 🥕 🥕      ║    │  │🌱Planter│ │
│  │  ║ ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  · ║    │  │ Gulerod │ │
│  │  ║ 🥬 🥬 🥬 🥬 🥬 🥬 🥬 🥬 🥬 🥬      ║    │  │ Salat   │ │
│  │  ║ ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  · ║    │  │ Løg     │ │
│  │  ║ 🧅 🧅 🧅 🧅 🧅 🧅 🧅 🧅 🧅 🧅      ║    │  │ Bønner  │ │
│  │  ║ ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  · ║    │  │ ...     │ │
│  │  ║ 🫛 🫛 🫛 🫛 🫛 🫛 🫛 🫛 🫛 🫛      ║    │  │         │ │
│  │  ║ ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  · ║    │  │💧Vand   │ │
│  │  ╚═══════════════════════════════════════╝    │  │⚡El     │ │
│  │                                               │  │🧱Kant   │ │
│  │  [────────────────●─────────] Marts 2026      │  │         │ │
│  │   Jan  Mar  Maj  Jul  Sep  Nov                │  └─────────┘ │
│  └───────────────────────────────────────────────┘              │
│                                                                 │
│  ┌──────────── VALGT ELEMENT ──────────────────────────────┐   │
│  │ 🥕 Gulerod (Daucus carota)           Række 1 · 10 stk  │   │
│  │ Afstand: 5cm · Rækkeafstand: 20cm · Høst: Jul-Okt      │   │
│  │ ✅ God nabo: Løg · ⚠️ Dårlig nabo: Dild                │   │
│  │ [🗑️ Fjern] [📋 Dupliker række] [✏️ Rediger]             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Sæson-slider visuelt

```
Marts (tidlig forår):
  ╔═══════════════════════════╗
  ║  · · · · · · · · · · · · ║  ← Tomt bed, jordfarve
  ║  🟤 🟤 🟤 (spiring)       ║  ← Gulrødder begynder
  ║  · · · · · · · · · · · · ║
  ╚═══════════════════════════╝

Juli (højsommer):
  ╔═══════════════════════════╗
  ║  🥕 🥕 🥕 🥕 🥕 🥕       ║  ← Fuldt grønne
  ║  🥬 🥬 🥬 🥬 🥬 🥬       ║  ← Salat i fuld vækst
  ║  🧅 🧅 🧅 🧅 🧅 🧅       ║  ← Løg modner
  ║  🌸 🌸 🌸 🌸 🌸 🌸       ║  ← Bønner blomstrer
  ╚═══════════════════════════╝

November (efterår):
  ╔═══════════════════════════╗
  ║  · · · · · · · · · · · · ║  ← Gulrødder høstet
  ║  🥬 🥬 🥬 (vinterhårdfør) ║  ← Sidste salat
  ║  · · · · · · · · · · · · ║  ← Løg høstet
  ║  🟫 🟫 🟫 (visnet)        ║  ← Bønner slut
  ╚═══════════════════════════╝
```

---

## 7. Tekniske Detaljer

### 7.1 Koordinat-konvertering

```typescript
// bedGeometry.ts

/** Konvertér GeoJSON polygon → lokale cm-koordinater */
function geoPolygonToBedLocal(
  polygon: Position[],      // GeoJSON ring [[lng, lat], ...]
): { outlineCm: BedLocalCoord[]; widthCm: number; lengthCm: number; rotationDeg: number } {
  // 1. Find centroid
  // 2. Konvertér til meter fra centroid (haversine)
  // 3. Find principal axis (minimum bounding rectangle)
  // 4. Rotér så længste side er horisontal
  // 5. Konvertér til cm, offset så (0,0) = top-left
  // Returnér outline + dimensioner + rotation
}

/** Konvertér bed-lokalt punkt → GeoJSON koordinat */
function bedLocalToGeo(
  point: BedLocalCoord,
  bedCentroid: [number, number],  // [lat, lng]
  rotationDeg: number,
): [number, number] {  // [lat, lng]
  // Inverse af ovenstående
}
```

### 7.2 Smart Snap-system

```typescript
type SnapResult = {
  snappedPosition: BedLocalCoord;
  snapType: "grid" | "row" | "spacing" | "edge" | "none";
  guides: SnapGuide[];  // Visuelle hjælpelinjer
};

function snapElement(
  position: BedLocalCoord,
  element: BedElement,
  allElements: BedElement[],
  bedOutline: BedLocalCoord[],
  gridSizeCm: number,
): SnapResult {
  // 1. Check row-snap (align med eksisterende rækker)
  // 2. Check spacing-snap (artens anbefalede afstand)
  // 3. Check grid-snap (5cm eller 10cm grid)
  // 4. Check edge-margin (minimum afstand til bed-kant)
  // 5. Returnér nærmeste snap + visuelle guides
}
```

### 7.3 Sæson-farve-beregning

```typescript
function computeSeasonVisual(
  element: BedElement,
  species: PlantSpecies,
  month: number,
): ElementSeasonState {
  const isGrowing = isInRange(month, species.plantOut ?? species.sowOutdoor);
  const isHarvesting = isInRange(month, species.harvest);
  const isSowing = isInRange(month, species.sowIndoor ?? species.sowOutdoor);

  if (isHarvesting) return { phase: "harvesting", color: "#F59E0B", scale: 1.0, opacity: 1 };
  if (isGrowing)    return { phase: "growing", color: "#22C55E", scale: 0.8, opacity: 1 };
  if (isSowing)     return { phase: "sprouting", color: "#86EFAC", scale: 0.3, opacity: 0.8 };
  return { phase: "dormant", color: "#A8A29E", scale: 0, opacity: 0.2 };
}
```

### 7.4 Persistence

```typescript
// bedLayoutStore.ts
const STORAGE_KEY = "gardenos:bed-layouts:v1";  // prefixed med userKey()

function saveBedLayout(layout: BedLayout): void;
function loadBedLayout(featureId: string): BedLayout | null;
function deleteBedLayout(featureId: string): void;
function listBedLayouts(): { featureId: string; updatedAt: string }[];
```

---

## 8. Risici & Mitigering

| Risiko | Sandsynlighed | Mitigering |
|--------|---------------|------------|
| Sync-konflikter mellem Lab og kort | Middel | Lab låser feature for redigering på kort mens åben |
| Performance med mange planter | Lav | SVG virtualisering, max ~200 elementer pr. bed |
| Kompleks polygon-geometri | Middel | Genbrug eksisterende `computeAutoRows` + `clipLineToPolygon` |
| Bruger forvirret af to editors | Middel | Tydelig "Åbn/Luk Lab" flow, ingen overlap |

---

## 9. Anbefaling: Start her

**Fase 1, Sprint 1** (den mindste værdifulde slice):

1. ✅ `bedLayoutTypes.ts` — Definer types
2. ✅ `bedGeometry.ts` — Geo↔lokal konvertering
3. ✅ `DesignLab.tsx` — Container med åbn/luk fra sidebar
4. ✅ `DesignLabCanvas.tsx` — SVG der viser bedets omrids + grid
5. ✅ `DesignLabPalette.tsx` — Simpel planteliste med drag
6. ✅ Drag plant → bed med auto-spacing
7. ✅ Sync: Lab-ændringer → PlantInstances

**Forventet tid:** ~2-3 arbejdssessioner

Klar til at starte implementation? 🚀

---

## 10. Feature Roadmap — Kommende forbedringer

> Løbende feature-liste. Status opdateres efterhånden.

### 🎨 A. Mere virkelighedstro illustrationer

| # | Feature | Beskrivelse | Status |
|---|---------|------------|--------|
| A1 | **SVG-gradienter på planter** | `<radialGradient>` i stedet for flade fills → 3D-kugle-effekt | ✅ |
| A2 | **Blad- og kroneblade-detaljer** | SVG-paths for bladårer, kroneblade, bærtextur, græstotter | ✅ |
| A3 | **Sæson-transitions (animerede)** | CSS/SVG transitions når man skifter måned — smooth fade/grow/wilt | ✅ |
| A4 | **Bedre jordtextur** | SVG turbulence-filter for synlig muldjord i stedet for usynlig 8×8 pattern | ✅ |
| A5 | **Infrastruktur-illustrationer** | Drypslange → bølget linje, trædesten → cirkler, trækant → grain-mønster | ✅ |
| A6 | **Perspektivisk skygge** | Høje planter kaster større skygger — giver dybdefornemmelse | ✅ |
| A7 | **Sæsonambience** | Animerede sæson-partikler: ❄ snefnug (dec-feb), 🍂 faldende blade (okt-nov), 🌸 kirsebærblomster (apr-maj), 🦋🐝 insekter (jun-aug). CSS keyframe-animationer i globals.css | ✅ |
| A8 | **SVG plante-ikonbibliotek** | Erstat generiske emoji (🌿×27, 🥬×16, 🔴×10) med unikke inline-SVG ikoner for alle ~196 arter. Hvert ikon er en farverig mini-illustration (radis, rødbede, salat, squash osv.) renderet direkte i SVG-canvas. Emoji-fallback bevares. Ikonerne ligger i `plantIcons.tsx` som React-komponenter. **196/196 arter dækket (100%).** | ✅ |

### ✏️ B. Bedre redigering

| # | Feature | Beskrivelse | Status |
|---|---------|------------|--------|
| B1 | **Multi-select + bulk move** | Lasso-selection eller Shift+klik — flyt/slet/kopiér mange på én gang | ✅ |
| B2 | **Copy/Paste + Duplikér** | ⌘C/⌘V + Alt+drag for hurtig klon | ✅ |
| B3 | **Drag-from-palette** | Træk plante direkte fra sidebar ind på canvas via HTML5 drag-and-drop. Sæt `draggable` + `onDragStart` på palette-knapper, `onDragOver`/`onDrop` på canvas-wrapper med SVG CTM-konvertering | ✅ |
| B4 | **Afstandsmåler** | Ruler-tool: klik to punkter → viser cm-afstand + companion-status | ✅ |
| B5 | **Element-rotation handles** | Visuelle drag-handles til rotation + resize pr. element | ✅ |
| B6 | **Højreklik-kontekstmenu** | Kopiér / Slet / Dupliker række / Vis info | ✅ |
| B7 | **Snap on/off toggle** | Knap til at slå snap-to-grid fra (friplacement) | ✅ |
| B8 | **Align & distribute** | Justér valgte planter: venstre/center/højre/jævn fordeling | ✅ |

### 🖥️ C. UI-forbedringer

| # | Feature | Beskrivelse | Status |
|---|---------|------------|--------|
| C1 | **Måneds-slider med labels** | "Jan Feb Mar…" under slider + auto-play ▶️ | ✅ |
| C2 | **Minimap** | Lille overview-kort i hjørnet ved zoom | ✅ |
| C3 | **Scale bar** | Målestok-bar (10cm/50cm/1m) der opdaterer ved zoom | ✅ |
| C4 | **Floating toolbar** | Toolbar er nu en `absolute top-3 left-1/2` rounded-2xl backdrop-blur pill der svæver over canvas. Giver mere plads til bedet | ✅ |
| C5 | **Keyboard shortcuts legend** | Tooltip eller ?-dialog med alle shortcuts | ✅ |
| C6 | **Mobile/touch support** | Pinch-zoom, two-finger pan, collapsible sidebar, responsive toolbar, touch-action:none | ✅ |

### 🧠 D. Avancerede features

| # | Feature | Beskrivelse | Status |
|---|---------|------------|--------|
| D1 | **Bruger-definerede templates** | "Gem dette bed som skabelon" → genbruges i andre bede. templateStore.ts med CRUD, save/apply/delete, skalering til målbed, gallery-dialog i DesignLab header | ✅ |
| D2 | **Skygge-overlay** | Sun-angle beregning (lat 56°N), sæson-afhængig skyggretning + længde, toggle-knap, shade-zone overlay med radial gradient | ✅ |
| D3 | **Side-by-side sæson-sammenligning** | Split-view med uafhængig månedsvalg, compare-toggle i toolbar, full bed rendering i begge paneler | ✅ |
| D4 | **Companion-linjer** | Grønne/røde forbindelseslinjer mellem naboer | ✅ |
| D5 | **3D-preview** | Three.js isometrisk visning med plant-højder. React Three Fiber + Drei. Styliserede 3D-meshes per planteform (tree-canopy, bushy, upright, rosette, ground-cover, climber, bulb, grass). Infrastruktur (vand, sti, kant, el) som 3D-geometri. Isometrisk kamera med OrbitControls. `ThreeDPreview.tsx` component, lazy-loaded fra DesignLab toolbar via 🧊 3D knap | ✅ |

### 🤝 E. Sociale features

| # | Feature | Beskrivelse | Status |
|---|---------|------------|--------|
| E1 | **Del bedplaner** | Del et bed-design via link, QR-kode eller direkte til andre brugere. Modtager kan importere som skabelon. Base64url-encoded share payload, auto-import via `?bedshare=` URL parameter, kopiér-link dialog med QR-visual, template gallery → del-knap | ✅ |
| E2 | **Brugerforum** | Forum/community-funktion: opret tråde, del erfaringer, stil spørgsmål, upload billeder. Kategorier per emne (general, bed-design, skadedyr, høst, sorter, tips). Prisma-modeller: ForumThread, ForumReply, ForumLike. API-ruter: /api/forum, /api/forum/reply, /api/forum/like. Full UI i ForumPanel.tsx med søgning, paginering, likes, svartekst. Tilgås fra guide-popover 🌱 Haveforum | ✅ |
