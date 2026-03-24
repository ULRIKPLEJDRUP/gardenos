// ---------------------------------------------------------------------------
// GardenOS – Design Lab: Type Definitions
// ---------------------------------------------------------------------------

/** Intra-bed coordinate system: (0,0) = top-left of bounding box, units = cm */
export type BedLocalCoord = { x: number; y: number };

/** Visual shape archetype for SVG rendering */
export type PlantShapeType =
  | "rosette"      // carrot, parsley — feathery radiating leaves
  | "leafy"        // lettuce, spinach — overlapping round leaves
  | "upright"      // onion, leek — tall thin blades
  | "bushy"        // beans, peas, tomato — dense compound foliage
  | "tree-canopy"  // fruit trees — large circular crown
  | "ground-cover" // strawberry, thyme — flat spreading mat
  | "climber"      // pole beans, peas on trellis — vertical narrow
  | "bulb"         // garlic, tulip — low clump of strappy leaves
  | "grass"        // ornamental grass, herbs — fine upright blades
  | "root-clump";  // potato, beetroot — medium mounded foliage

/** Growth phase — determines visual appearance per month */
export type GrowthPhase =
  | "dormant"      // bare soil, plant invisible
  | "sprouting"    // tiny shoots, 20-35% scale
  | "growing"      // full foliage, 60-80% scale
  | "flowering"    // accent color appears
  | "fruiting"     // fruit/pod visible
  | "harvesting"   // golden/ready tones
  | "dying";       // yellowing, browning

/** Season-dependent color set for a single plant */
export type PhaseColors = {
  foliage: string;   // leaf/blade color
  stem: string;      // stalk/stem color
  accent: string | null; // flower/fruit color (null if none)
  ground: string;    // ground tint beneath plant
};

/** Color palette per growth phase */
export type PlantSeasonPalette = Record<GrowthPhase, PhaseColors>;

/** Element type inside the bed editor */
export type BedElementType =
  | "plant"
  | "row"          // auto-generated row stripe
  | "water"        // drip line, sprinkler, tap
  | "electric"     // cable, socket
  | "path"         // stepping stones, walkway
  | "edge"         // border stones, timber edge
  | "label";       // text annotation

/** A single element placed inside the bed */
export type BedElement = {
  id: string;
  type: BedElementType;

  // Position & geometry (bed-local cm coordinates)
  position: BedLocalCoord;      // center point
  rotation: number;             // degrees (0 = up/north)
  width: number;                // cm
  length: number;               // cm

  // Plant-specific
  speciesId?: string;           // → PlantSpecies.id
  varietyId?: string;
  instanceId?: string;          // → PlantInstance.id (for sync)
  count?: number;               // plants in this element (row)
  spacingCm?: number;           // override species default

  // Visual overrides
  color?: string;               // hex color override
  label?: string;               // freeform label
  icon?: string;                // emoji override
  zIndex?: number;              // layer order

  // Infrastructure
  infrastructureKind?: string;  // "drip-line", "sprinkler", etc.
};

/** Complete bed layout document */
export type BedLayout = {
  id: string;
  featureId: string;            // → GardenFeatureProperties.gardenosId
  version: number;              // optimistic concurrency

  // Bed shape in local cm coordinates
  outlineCm: BedLocalCoord[];   // polygon contour
  widthCm: number;              // bounding box width
  lengthCm: number;             // bounding box length
  rotationDeg: number;          // bed rotation relative to north

  // Centroid in geographic coords (for reverse conversion)
  centroidLat: number;
  centroidLng: number;

  // Elements
  elements: BedElement[];

  // Metadata
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Design Lab UI state
// ---------------------------------------------------------------------------

/** Current tool mode in the editor */
export type LabTool =
  | "select"       // click to select, drag to move
  | "pan"          // drag canvas
  | "place"        // placing a new element
  | "row"          // auto-fill a row
  | "delete"       // click to remove
  | "ruler";       // click two points → measure distance

/** Snap guide for visual feedback */
export type SnapGuide = {
  type: "spacing" | "row" | "grid" | "edge";
  x1: number; y1: number;
  x2: number; y2: number;
  label?: string;
};
