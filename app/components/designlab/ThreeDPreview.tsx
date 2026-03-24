"use client";
// ---------------------------------------------------------------------------
// GardenOS – D5: 3D Isometric Preview (Three.js / React Three Fiber)
// ---------------------------------------------------------------------------
// Renders the current bed layout as a 3D scene. Plants are represented as
// stylised meshes whose height/radius comes from the plant database.
// Infrastructure elements (drip lines, paths, edges) are rendered as simple
// geometries. The scene uses an isometric-style camera with OrbitControls.
// ---------------------------------------------------------------------------

import React, { useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import * as THREE from "three";

// ── Types (duplicated lite versions to avoid circular imports) ──
interface Vec2 { x: number; y: number }
interface LayoutElement {
  id: string;
  type: string;
  position: Vec2;
  rotation: number;
  width: number;
  length: number;
  speciesId?: string;
  label?: string;
  icon?: string;
  color?: string;
  infrastructureKind?: string;
}
interface PlantInfo {
  matureHeightM?: number;
  spreadCm?: number;
  forestGardenLayer?: string;
  category?: string;
  shape?: string;
}

// ── Height estimation (mirrors plantTypes.ts) ──
function estimateHeight(p?: PlantInfo): number {
  if (!p) return 0.15;
  if (p.matureHeightM) return p.matureHeightM;
  switch (p.forestGardenLayer) {
    case "canopy": return 15;
    case "sub-canopy": return 6;
    case "shrub": return 2.5;
  }
  switch (p.category) {
    case "tree": return 10;
    case "bush": return 2;
    case "fruit": return 3;
    default: return 0.3;
  }
}

function inferShape(p?: PlantInfo): string {
  if (!p) return "upright";
  if (p.shape) return p.shape;
  const layer = p.forestGardenLayer;
  if (layer === "canopy" || layer === "sub-canopy") return "tree-canopy";
  if (layer === "ground-cover") return "ground-cover";
  if (layer === "climber") return "climber";
  if (layer === "shrub") return "bushy";
  const h = estimateHeight(p);
  if (h > 1.5) return "bushy";
  if (h > 0.5) return "upright";
  return "rosette";
}

// ── Phase color defaults ──
const DEFAULT_FOLIAGE = "#5daa3a";
const DEFAULT_STEM = "#8b6f3a";
const DEFAULT_SOIL = "#8B7355";
const WATER_COLOR = "#4da6d9";
const PATH_COLOR = "#c4a97d";
const EDGE_COLOR = "#a07848";

// ═══════════════════════════════════════════════════════════════════════════
// Plant 3D mesh – renders a stylised plant based on its shape/height
// ═══════════════════════════════════════════════════════════════════════════
function Plant3D({ el, info, scale }: { el: LayoutElement; info?: PlantInfo; scale: number }) {
  const heightM = estimateHeight(info) * scale;
  const radiusM = ((info?.spreadCm ?? el.width) / 100) * 0.5 * scale;
  const shape = inferShape(info);
  const x = el.position.x / 100;
  const z = el.position.y / 100;

  // Clamp heights for bed plants (we don't want 15m trees in the preview)
  const clampedH = Math.min(heightM, 3);
  const clampedR = Math.max(radiusM, 0.04);

  const foliage = DEFAULT_FOLIAGE;
  const stem = DEFAULT_STEM;

  switch (shape) {
    case "tree-canopy":
    case "bushy":
      return (
        <group position={[x, 0, z]} rotation={[0, (el.rotation * Math.PI) / 180, 0]}>
          {/* Trunk */}
          <mesh position={[0, clampedH * 0.4, 0]}>
            <cylinderGeometry args={[clampedR * 0.15, clampedR * 0.2, clampedH * 0.8, 8]} />
            <meshStandardMaterial color={stem} />
          </mesh>
          {/* Canopy */}
          <mesh position={[0, clampedH * 0.75, 0]}>
            <sphereGeometry args={[clampedR, 12, 10]} />
            <meshStandardMaterial color={foliage} />
          </mesh>
        </group>
      );

    case "upright":
      return (
        <group position={[x, 0, z]} rotation={[0, (el.rotation * Math.PI) / 180, 0]}>
          <mesh position={[0, clampedH * 0.5, 0]}>
            <cylinderGeometry args={[clampedR * 0.6, clampedR, clampedH, 8]} />
            <meshStandardMaterial color={foliage} />
          </mesh>
        </group>
      );

    case "rosette":
    case "ground-cover":
      return (
        <group position={[x, 0, z]} rotation={[0, (el.rotation * Math.PI) / 180, 0]}>
          <mesh position={[0, clampedH * 0.3, 0]}>
            <sphereGeometry args={[clampedR, 10, 6]} />
            <meshStandardMaterial color={foliage} />
          </mesh>
        </group>
      );

    case "climber":
      return (
        <group position={[x, 0, z]} rotation={[0, (el.rotation * Math.PI) / 180, 0]}>
          {/* Pole */}
          <mesh position={[0, clampedH * 0.5, 0]}>
            <cylinderGeometry args={[0.02, 0.02, clampedH, 6]} />
            <meshStandardMaterial color={stem} />
          </mesh>
          {/* Vine wrap */}
          <mesh position={[0, clampedH * 0.5, 0]}>
            <cylinderGeometry args={[clampedR * 0.4, clampedR * 0.3, clampedH * 0.7, 8]} />
            <meshStandardMaterial color={foliage} transparent opacity={0.7} />
          </mesh>
        </group>
      );

    case "bulb":
      return (
        <group position={[x, 0, z]} rotation={[0, (el.rotation * Math.PI) / 180, 0]}>
          <mesh position={[0, clampedH * 0.3, 0]}>
            <sphereGeometry args={[clampedR * 0.7, 8, 6]} />
            <meshStandardMaterial color={foliage} />
          </mesh>
          {/* Stem */}
          <mesh position={[0, clampedH * 0.6, 0]}>
            <cylinderGeometry args={[0.01, 0.01, clampedH * 0.4, 4]} />
            <meshStandardMaterial color={stem} />
          </mesh>
        </group>
      );

    case "grass":
      return (
        <group position={[x, 0, z]} rotation={[0, (el.rotation * Math.PI) / 180, 0]}>
          {/* Multiple thin cones */}
          {[0, 60, 120, 180, 240, 300].map((deg, i) => (
            <mesh
              key={i}
              position={[
                Math.cos((deg * Math.PI) / 180) * clampedR * 0.3,
                clampedH * 0.4,
                Math.sin((deg * Math.PI) / 180) * clampedR * 0.3,
              ]}
              rotation={[
                Math.sin((deg * Math.PI) / 180) * 0.15,
                0,
                Math.cos((deg * Math.PI) / 180) * 0.15,
              ]}
            >
              <coneGeometry args={[0.02, clampedH * 0.8, 4]} />
              <meshStandardMaterial color={foliage} />
            </mesh>
          ))}
        </group>
      );

    default: // leafy or fallback
      return (
        <group position={[x, 0, z]} rotation={[0, (el.rotation * Math.PI) / 180, 0]}>
          <mesh position={[0, clampedH * 0.35, 0]}>
            <sphereGeometry args={[clampedR * 0.9, 10, 8]} />
            <meshStandardMaterial color={foliage} />
          </mesh>
        </group>
      );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Infrastructure 3D mesh
// ═══════════════════════════════════════════════════════════════════════════
function Infra3D({ el }: { el: LayoutElement }) {
  const x = el.position.x / 100;
  const z = el.position.y / 100;
  const w = el.width / 100;
  const l = el.length / 100;

  switch (el.type) {
    case "water":
      return (
        <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, (el.rotation * Math.PI) / 180]}>
          <planeGeometry args={[w, l]} />
          <meshStandardMaterial color={WATER_COLOR} transparent opacity={0.6} />
        </mesh>
      );
    case "path":
      return (
        <mesh position={[x, 0.005, z]} rotation={[-Math.PI / 2, 0, (el.rotation * Math.PI) / 180]}>
          <planeGeometry args={[w, l]} />
          <meshStandardMaterial color={PATH_COLOR} />
        </mesh>
      );
    case "edge":
      return (
        <mesh position={[x, 0.04, z]} rotation={[0, (el.rotation * Math.PI) / 180, 0]}>
          <boxGeometry args={[w, 0.08, l]} />
          <meshStandardMaterial color={EDGE_COLOR} />
        </mesh>
      );
    case "electric":
      return (
        <mesh position={[x, 0.15, z]} rotation={[0, (el.rotation * Math.PI) / 180, 0]}>
          <boxGeometry args={[0.05, 0.3, 0.05]} />
          <meshStandardMaterial color="#555" />
        </mesh>
      );
    case "label":
      return (
        <Text
          position={[x, 0.3, z]}
          fontSize={0.08}
          color="#333"
          anchorX="center"
          anchorY="middle"
          rotation={[-Math.PI / 4, 0, 0]}
        >
          {el.label || ""}
        </Text>
      );
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Ground plane with bed outline
// ═══════════════════════════════════════════════════════════════════════════
function BedGround({ outline, widthCm, lengthCm }: { outline: Vec2[]; widthCm: number; lengthCm: number }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    if (outline.length < 3) {
      // Fallback: rectangle
      s.moveTo(0, 0);
      s.lineTo(widthCm / 100, 0);
      s.lineTo(widthCm / 100, lengthCm / 100);
      s.lineTo(0, lengthCm / 100);
      s.closePath();
    } else {
      // Note: Three.js Shape uses x,y but our bed uses x=x, y=z
      s.moveTo(outline[0].x / 100, outline[0].y / 100);
      for (let i = 1; i < outline.length; i++) {
        s.lineTo(outline[i].x / 100, outline[i].y / 100);
      }
      s.closePath();
    }
    return s;
  }, [outline, widthCm, lengthCm]);

  return (
    <group>
      {/* Soil surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color={DEFAULT_SOIL} side={THREE.DoubleSide} />
      </mesh>
      {/* Raised edge — extrude the shape slightly */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <extrudeGeometry args={[shape, { depth: 0.05, bevelEnabled: false }]} />
        <meshStandardMaterial color={EDGE_COLOR} />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main 3D preview component
// ═══════════════════════════════════════════════════════════════════════════
export interface ThreeDPreviewProps {
  outlineCm: Vec2[];
  widthCm: number;
  lengthCm: number;
  elements: LayoutElement[];
  /** Plant info lookup — key = speciesId */
  plantInfoMap: Record<string, PlantInfo>;
  /** Current growth scale (0.1–1.0 from season) */
  growthScale?: number;
  onClose: () => void;
}

export default function ThreeDPreview({
  outlineCm,
  widthCm,
  lengthCm,
  elements,
  plantInfoMap,
  growthScale = 0.75,
  onClose,
}: ThreeDPreviewProps) {
  // Camera target = center of bed
  const cx = (widthCm / 100) * 0.5;
  const cz = (lengthCm / 100) * 0.5;
  const maxDim = Math.max(widthCm, lengthCm) / 100;
  const camDist = maxDim * 1.2 + 1;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center">
      <div className="relative w-[90vw] h-[80vh] max-w-[1200px] bg-gradient-to-b from-sky-200 to-sky-100 rounded-2xl overflow-hidden shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 bg-white/80 hover:bg-white rounded-full w-9 h-9 flex items-center justify-center text-lg shadow"
          title="Luk 3D-visning"
        >
          ✕
        </button>
        <div className="absolute top-3 left-4 z-10 bg-white/80 rounded-lg px-3 py-1 text-sm font-medium shadow">
          🧊 3D Preview
        </div>
        <Canvas shadows>
          <Suspense fallback={null}>
            <PerspectiveCamera
              makeDefault
              position={[cx + camDist * 0.6, camDist * 0.5, cz + camDist * 0.6]}
              fov={45}
              near={0.01}
              far={200}
            />
            <OrbitControls target={[cx, 0, cz]} enableDamping dampingFactor={0.1} />

            {/* Lighting */}
            <ambientLight intensity={0.5} />
            <directionalLight
              position={[cx - maxDim, maxDim * 2, cz - maxDim * 0.5]}
              intensity={1.2}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
            <hemisphereLight
              color="#b1e1ff"
              groundColor="#8B7355"
              intensity={0.4}
            />

            {/* Ground */}
            <BedGround outline={outlineCm} widthCm={widthCm} lengthCm={lengthCm} />

            {/* Surrounding ground plane */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.06, cz]} receiveShadow>
              <planeGeometry args={[maxDim * 3, maxDim * 3]} />
              <meshStandardMaterial color="#6b8f4a" />
            </mesh>

            {/* Elements */}
            {elements.map((el) => {
              if (el.type === "plant" || el.type === "row") {
                const info = el.speciesId ? plantInfoMap[el.speciesId] : undefined;
                return <Plant3D key={el.id} el={el} info={info} scale={growthScale} />;
              }
              return <Infra3D key={el.id} el={el} />;
            })}
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
}
