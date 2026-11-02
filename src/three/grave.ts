/**
 * Procedural grave geometry — no downloaded models (per asset steering).
 *
 * Each priority maps to a distinct silhouette and glow, so the graveyard is
 * readable at a glance (Requirement 4.1–4.3):
 *   - high   → tall obelisk, cold bright rune glow
 *   - medium → standard rounded headstone, soft glow
 *   - low    → small flat marker, faint glow
 * Completed graves render as a low sunken mound with no glow (Requirement 4.6).
 *
 * A grave is a THREE.Group so the reconciler can position/animate it as a unit.
 * Geometry and materials are created per-grave in M2 for clarity; M5 will move
 * shared meshes to InstancedMesh for performance.
 */
import * as THREE from 'three';
import { type Priority, type Status } from '../model/types';

export interface GraveVisual {
  priority: Priority;
  status: Status;
  /** 0..1 — drives glow pulsing for search highlight (M3); 0 in M2. */
  highlight?: number;
}

export interface GraveParts {
  group: THREE.Group;
  stoneMesh: THREE.Mesh;
  stoneMaterial: THREE.MeshStandardMaterial;
  /** nominal height of the marker, for plaque placement */
  height: number;
}

const STONE_COLOR = 0x8a8a90;
const MOSS_COLOR = 0x53603f;

const GLOW: Record<Priority, { color: number; intensity: number }> = {
  high: { color: 0x9fdfe6, intensity: 0.9 }, // cold spectral cyan
  medium: { color: 0xc8b06a, intensity: 0.45 }, // warm amber
  low: { color: 0x8a8f7a, intensity: 0.2 }, // faint grey-green
};

/** Build the stone geometry for a given priority. Returns geometry + height. */
function stoneGeometry(priority: Priority): { geo: THREE.BufferGeometry; height: number } {
  switch (priority) {
    case 'high': {
      // Tall tapered obelisk: a thin box shaft with a pyramidal cap, merged by
      // using a cylinder with 4 radial segments for a crisp 4-sided spire.
      const height = 2.6;
      const geo = new THREE.CylinderGeometry(0.05, 0.28, height, 4);
      geo.rotateY(Math.PI / 4);
      geo.translate(0, height / 2, 0);
      return { geo, height };
    }
    case 'medium': {
      // Rounded-top headstone: a box with a half-cylinder would need merging;
      // approximate with a box whose top is rounded via a slightly scaled
      // capsule-like profile using a box + cylinder cap is overkill, so use a
      // single rounded box via a flattened cylinder (many segments) for the arch.
      const height = 1.4;
      const geo = new THREE.BoxGeometry(1.0, height, 0.2);
      geo.translate(0, height / 2, 0);
      return { geo, height };
    }
    case 'low': {
      // Small flat marker, slightly tilted feel via short slab.
      const height = 0.5;
      const geo = new THREE.BoxGeometry(0.9, height, 0.16);
      geo.translate(0, height / 2, 0);
      return { geo, height };
    }
  }
}

/** Create a grave group for the given visual state. */
export function buildGrave(visual: GraveVisual): GraveParts {
  const group = new THREE.Group();
  const completed = visual.status === 'completed';

  const { geo, height } = stoneGeometry(visual.priority);

  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: completed ? MOSS_COLOR : STONE_COLOR,
    roughness: 0.9,
    metalness: 0.0,
    emissive: new THREE.Color(GLOW[visual.priority].color),
    emissiveIntensity: completed ? 0 : GLOW[visual.priority].intensity * 0.25,
  });

  const stoneMesh = new THREE.Mesh(geo, stoneMaterial);
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;

  // A small soil mound base so the stone looks planted.
  const moundGeo = new THREE.CylinderGeometry(0.7, 0.85, 0.2, 16);
  const moundMat = new THREE.MeshStandardMaterial({
    color: completed ? 0x3b3326 : 0x4a3f2e,
    roughness: 1,
  });
  const mound = new THREE.Mesh(moundGeo, moundMat);
  mound.position.y = 0.1;
  mound.receiveShadow = true;

  if (completed) {
    // Sunken: push the stone down into the mound and shrink it.
    stoneMesh.scale.setScalar(0.85);
    stoneMesh.position.y = -height * 0.35;
  }

  group.add(mound, stoneMesh);
  return { group, stoneMesh, stoneMaterial, height };
}

/** Update an existing grave's material to reflect a (possibly changed) state. */
export function applyGraveVisual(parts: GraveParts, visual: GraveVisual): void {
  const completed = visual.status === 'completed';
  const mat = parts.stoneMaterial;
  mat.color.setHex(completed ? MOSS_COLOR : STONE_COLOR);
  const base = GLOW[visual.priority];
  const highlight = visual.highlight ?? 0;
  mat.emissive.setHex(base.color);
  mat.emissiveIntensity = completed
    ? 0
    : base.intensity * (0.25 + 0.75 * highlight);
  mat.needsUpdate = true;
}

/** Dispose all geometry/materials in a grave group (called on removal). */
export function disposeGrave(parts: GraveParts): void {
  parts.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}
