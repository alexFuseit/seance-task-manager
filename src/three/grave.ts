/**
 * Procedural grave geometry + visual state encoding (Requirement 4) — no
 * downloaded models (per asset steering).
 *
 * Priority → silhouette & glow (4.1–4.3):
 *   high → tall obelisk, cold rune glow · medium → headstone, warm glow ·
 *   low → flat marker, faint glow.
 * Due soon (<24h) → moss tint, crack overlay, a landed crow (4.4).
 * Overdue → cracked-open grave, a pacing spirit, circling crows (4.5).
 * Completed → sunken mossy mound, dormant, no glow (4.6).
 * Search → matches pulse brighter, non-matches dim (4.8).
 *
 * Performance (Requirement 6.1): all geometry (stones per priority, mound,
 * cracks, crow parts, spirit) and the stateless materials (crow, beak, crack
 * levels) are built once and SHARED across every grave. Only the materials
 * whose values animate per grave (stone glow/moss, mound tint, spirit opacity)
 * are per-instance. Decorations (crow, flock, spirit) are built lazily the
 * first time a grave's state calls for them, so a calm yard carries none.
 *
 * Material/scale changes are not snapped: tickGrave lerps the live values
 * toward the targets stored on GraveParts each frame, so priority edits,
 * completion and search highlighting transition smoothly.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type Priority } from '../model/types';
import { type GraveVisual } from './grave-visual';

export type { GraveVisual } from './grave-visual';

export interface GraveParts {
  group: THREE.Group;
  stoneMesh: THREE.Mesh;
  stoneMaterial: THREE.MeshStandardMaterial;
  moundMaterial: THREE.MeshStandardMaterial;
  crack: THREE.Mesh;
  /** a single crow that lands when due-soon; null until first needed. */
  crow: THREE.Group | null;
  /** circling crows for overdue; null until first needed. */
  crowFlock: THREE.Group | null;
  /** pacing spirit for overdue; null until first needed. */
  spirit: THREE.Mesh | null;
  /** priority whose silhouette the stone currently uses. */
  priority: Priority;
  /** nominal height of the marker, for label placement. */
  height: number;

  // --- animation targets (lerped each frame by tickGrave) ---
  targetEmissive: number;
  targetMoss: number; // 0..1 blend toward moss colour
  /** 1 = upright; completed graves sink + shrink into their mound. */
  targetSunk: number;
  sunk: number;
  /** phase offset so effects don't all tick in unison. */
  phase: number;
  /** what decorations the current state *wants* (before LOD/quality gating). */
  wantsCrow: boolean;
  wantsFlock: boolean;
  wantsSpirit: boolean;
}

/** Result of a per-frame tick, used to drive the render-loop rate. */
export const Tick = {
  /** nothing changed — the grave is at rest. */
  Settled: 0,
  /** only continuous decorative motion (crows/spirit) is running. */
  Ambient: 1,
  /** a material/scale transition is in progress. */
  Transition: 2,
} as const;
export type Tick = (typeof Tick)[keyof typeof Tick];

const STONE_COLOR = new THREE.Color(0xb4b4bc);
const MOSS_COLOR = new THREE.Color(0x63703f);
const SOIL_COLOR = new THREE.Color(0x5a4d38);
const SOIL_DARK = new THREE.Color(0x45392a);

const GLOW: Record<Priority, { color: number; intensity: number }> = {
  high: { color: 0x9fdfe6, intensity: 0.85 },
  medium: { color: 0xe0b86a, intensity: 0.5 },
  low: { color: 0x9aa07a, intensity: 0.25 },
};

// Scratch colours reused by tickGrave (no per-frame allocation).
const scratchStone = new THREE.Color();
const scratchSoil = new THREE.Color();

// ---------------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------------

interface StoneShape {
  geo: THREE.BufferGeometry;
  height: number;
}

interface SharedResources {
  stones: Record<Priority, StoneShape>;
  cracks: Record<Priority, THREE.PlaneGeometry>;
  crackSoon: THREE.MeshBasicMaterial;
  crackOverdue: THREE.MeshBasicMaterial;
  mound: THREE.BufferGeometry;
  crowBody: THREE.BufferGeometry;
  crowHead: THREE.BufferGeometry;
  crowBeak: THREE.BufferGeometry;
  crowWing: THREE.BufferGeometry;
  crowMat: THREE.MeshStandardMaterial;
  beakMat: THREE.MeshStandardMaterial;
  spirit: THREE.BufferGeometry;
}

let shared: SharedResources | null = null;

function res(): SharedResources {
  if (shared) return shared;
  const stones = {
    high: stoneGeometry('high'),
    medium: stoneGeometry('medium'),
    low: stoneGeometry('low'),
  };
  const crack = (p: Priority) => new THREE.PlaneGeometry(0.06, stones[p].height * 0.6);
  // Low soil dome (scaled hemisphere) so each grave sits on turned earth.
  const mound = new THREE.SphereGeometry(0.78, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  mound.scale(1, 0.32, 1);
  shared = {
    stones,
    cracks: { high: crack('high'), medium: crack('medium'), low: crack('low') },
    crackSoon: new THREE.MeshBasicMaterial({
      color: 0x0d0a06,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
    crackOverdue: new THREE.MeshBasicMaterial({
      color: 0x0d0a06,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
    mound,
    crowBody: new THREE.ConeGeometry(0.12, 0.42, 6),
    crowHead: new THREE.SphereGeometry(0.1, 8, 6),
    crowBeak: new THREE.ConeGeometry(0.03, 0.12, 4),
    crowWing: new THREE.BoxGeometry(0.18, 0.02, 0.12),
    crowMat: new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.6 }),
    beakMat: new THREE.MeshStandardMaterial({ color: 0x8a6a1a }),
    spirit: new THREE.CapsuleGeometry(0.22, 0.7, 4, 8),
  };
  return shared;
}

/** Free the shared grave resources (call when the whole 3D layer is torn down). */
export function disposeSharedGraveResources(): void {
  if (!shared) return;
  const s = shared;
  shared = null;
  for (const p of ['high', 'medium', 'low'] as const) {
    s.stones[p].geo.dispose();
    s.cracks[p].dispose();
  }
  s.mound.dispose();
  s.crowBody.dispose();
  s.crowHead.dispose();
  s.crowBeak.dispose();
  s.crowWing.dispose();
  s.spirit.dispose();
  s.crackSoon.dispose();
  s.crackOverdue.dispose();
  s.crowMat.dispose();
  s.beakMat.dispose();
}

function stoneGeometry(priority: Priority): StoneShape {
  switch (priority) {
    case 'high': {
      // Tall tapered obelisk with a pyramidal cap — a proper monument
      // silhouette rather than a thin spike.
      const shaftH = 2.2;
      const capH = 0.4;
      const height = shaftH + capH;
      // Slight taper: wider at the base (0.34) than under the cap (0.24).
      const shaft = new THREE.BoxGeometry(0.34, shaftH, 0.34);
      shaft.translate(0, shaftH / 2, 0);
      taperBox(shaft, shaftH, 0.24 / 0.34);
      // Four-sided pyramid cap.
      const cap = new THREE.CylinderGeometry(0.001, 0.19, capH, 4);
      cap.rotateY(Math.PI / 4);
      cap.translate(0, shaftH + capH / 2, 0);
      const geo = mergeGeometries([shaft, cap]);
      shaft.dispose();
      cap.dispose();
      return { geo, height };
    }
    case 'medium': {
      // Classic arched (round-top) headstone via an extruded 2D profile.
      const height = 1.5;
      const w = 0.95;
      const half = w / 2;
      const bodyH = height - half; // arch radius == half-width
      const shape = new THREE.Shape();
      shape.moveTo(-half, 0);
      shape.lineTo(-half, bodyH);
      shape.absarc(0, bodyH, half, Math.PI, 0, true); // semicircular top
      shape.lineTo(half, 0);
      shape.lineTo(-half, 0);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.2,
        bevelEnabled: true,
        bevelThickness: 0.03,
        bevelSize: 0.03,
        bevelSegments: 2,
        curveSegments: 16,
      });
      geo.translate(0, 0, -0.1);
      return { geo, height };
    }
    case 'low': {
      // Small flat marker with a gently rounded top edge (bevelled slab).
      const height = 0.55;
      const w = 0.85;
      const half = w / 2;
      const shape = new THREE.Shape();
      const r = 0.1;
      shape.moveTo(-half, 0);
      shape.lineTo(-half, height - r);
      shape.quadraticCurveTo(-half, height, -half + r, height);
      shape.lineTo(half - r, height);
      shape.quadraticCurveTo(half, height, half, height - r);
      shape.lineTo(half, 0);
      shape.lineTo(-half, 0);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.16,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 1,
        curveSegments: 8,
      });
      geo.translate(0, 0, -0.08);
      return { geo, height };
    }
  }
}

/**
 * Taper a vertically-extruded box: scale the X/Z of each vertex toward
 * `topScale` based on its height (y in [0, h]). Gives a subtle obelisk taper.
 */
function taperBox(geo: THREE.BufferGeometry, h: number, topScale: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / h, 0, 1);
    const s = THREE.MathUtils.lerp(1, topScale, t);
    pos.setX(i, pos.getX(i) * s);
    pos.setZ(i, pos.getZ(i) * s);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// ---------------------------------------------------------------------------
// Decorations (lazy)
// ---------------------------------------------------------------------------

/** A tiny low-poly crow (body + head + beak + wings) built from shared parts. */
function buildCrow(): THREE.Group {
  const r = res();
  const g = new THREE.Group();
  const body = new THREE.Mesh(r.crowBody, r.crowMat);
  body.rotation.z = Math.PI / 2;
  const head = new THREE.Mesh(r.crowHead, r.crowMat);
  head.position.set(0.22, 0.05, 0);
  const beak = new THREE.Mesh(r.crowBeak, r.beakMat);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.34, 0.05, 0);
  const wingL = new THREE.Mesh(r.crowWing, r.crowMat);
  wingL.position.set(0, 0.04, 0.1);
  const wingR = new THREE.Mesh(r.crowWing, r.crowMat);
  wingR.position.set(0, 0.04, -0.1);
  g.add(body, head, beak, wingL, wingR);
  g.userData.wings = [wingL, wingR];
  return g;
}

/** A translucent pacing spirit (a tapered wisp). Material is per-grave. */
function buildSpirit(): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xbfe9ef,
    emissive: new THREE.Color(0x6fb9c4),
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(res().spirit, mat);
  mesh.position.y = 0.7;
  return mesh;
}

function ensureCrow(parts: GraveParts): THREE.Group {
  if (!parts.crow) {
    parts.crow = buildCrow();
    parts.crow.scale.setScalar(0.9);
    parts.crow.position.set(0, parts.height + 0.15, 0);
    parts.group.add(parts.crow);
  }
  return parts.crow;
}

function ensureFlock(parts: GraveParts): THREE.Group {
  if (!parts.crowFlock) {
    parts.crowFlock = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const c = buildCrow();
      c.scale.setScalar(0.7);
      parts.crowFlock.add(c);
    }
    parts.group.add(parts.crowFlock);
  }
  return parts.crowFlock;
}

function ensureSpirit(parts: GraveParts): THREE.Mesh {
  if (!parts.spirit) {
    parts.spirit = buildSpirit();
    parts.group.add(parts.spirit);
  }
  return parts.spirit;
}

/**
 * Apply decoration intent subject to LOD/quality eligibility. Decorations are
 * only constructed when actually shown.
 */
export function setDecorationsEnabled(parts: GraveParts, eligible: boolean): void {
  const crow = eligible && parts.wantsCrow;
  const flock = eligible && parts.wantsFlock;
  const spirit = eligible && parts.wantsSpirit;
  if (crow) ensureCrow(parts).visible = true;
  else if (parts.crow) parts.crow.visible = false;
  if (flock) ensureFlock(parts).visible = true;
  else if (parts.crowFlock) parts.crowFlock.visible = false;
  if (spirit) ensureSpirit(parts).visible = true;
  else if (parts.spirit) parts.spirit.visible = false;
}

// ---------------------------------------------------------------------------
// Build / apply / tick / dispose
// ---------------------------------------------------------------------------

function setSilhouette(parts: GraveParts, priority: Priority): void {
  const r = res();
  const { geo, height } = r.stones[priority];
  parts.priority = priority;
  parts.height = height;
  parts.stoneMesh.geometry = geo;
  parts.crack.geometry = r.cracks[priority];
  parts.crack.position.set(0.08, height * 0.5, 0.085);
  if (parts.crow) parts.crow.position.y = height + 0.15;
}

export function buildGrave(visual: GraveVisual): GraveParts {
  const r = res();
  const group = new THREE.Group();

  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: STONE_COLOR.clone(),
    roughness: 0.9,
    metalness: 0.0,
    emissive: new THREE.Color(GLOW[visual.priority].color),
    emissiveIntensity: 0,
  });
  const stoneMesh = new THREE.Mesh(r.stones[visual.priority].geo, stoneMaterial);
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;

  // Crack overlay — a thin dark fissure line hugging the stone face. Uses one
  // of two shared opacity-level materials; hidden when the stone is intact.
  const crack = new THREE.Mesh(r.cracks[visual.priority], r.crackSoon);
  crack.rotation.z = 0.35;
  crack.visible = false;
  stoneMesh.add(crack);

  const moundMaterial = new THREE.MeshStandardMaterial({
    color: SOIL_COLOR.clone(),
    roughness: 1,
  });
  const mound = new THREE.Mesh(r.mound, moundMaterial);
  mound.receiveShadow = true;

  group.add(mound, stoneMesh);

  const parts: GraveParts = {
    group,
    stoneMesh,
    stoneMaterial,
    moundMaterial,
    crack,
    crow: null,
    crowFlock: null,
    spirit: null,
    priority: visual.priority,
    height: r.stones[visual.priority].height,
    targetEmissive: 0,
    targetMoss: 0,
    targetSunk: 0,
    sunk: 0,
    phase: Math.random() * Math.PI * 2,
    wantsCrow: false,
    wantsFlock: false,
    wantsSpirit: false,
  };
  setSilhouette(parts, visual.priority);

  applyGraveVisual(parts, visual);
  // Snap transitionable values on first build so there is no initial lerp flash.
  stoneMaterial.emissiveIntensity = parts.targetEmissive;
  stoneMaterial.color.copy(STONE_COLOR).lerp(MOSS_COLOR, parts.targetMoss);
  moundMaterial.color.copy(SOIL_COLOR).lerp(SOIL_DARK, parts.targetMoss);
  parts.sunk = parts.targetSunk;
  applySunk(parts);
  return parts;
}

/**
 * Recompute animation targets for a visual state (and swap the silhouette if
 * the priority changed). Does NOT snap live values — tickGrave lerps them.
 */
export function applyGraveVisual(parts: GraveParts, visual: GraveVisual): void {
  const completed = visual.status === 'completed';
  const base = GLOW[visual.priority];

  if (visual.priority !== parts.priority) setSilhouette(parts, visual.priority);

  // Glow target: dormant when completed; dimmed when a search excludes it;
  // boosted when it matches an active search.
  let emissive = completed ? 0 : base.intensity * 0.6;
  if (!completed && visual.searchActive) {
    emissive = visual.searchMatch ? base.intensity * 1.2 : base.intensity * 0.05;
  }
  parts.targetEmissive = emissive;
  parts.stoneMaterial.emissive.setHex(base.color);

  // Moss creep: full for completed, partial for due-soon/overdue weathering.
  let moss = 0;
  if (completed) moss = 0.85;
  else if (visual.due === 'overdue') moss = 0.55;
  else if (visual.due === 'soon') moss = 0.35;
  parts.targetMoss = moss;

  // Crack: shared material per weathering level.
  const overdue = !completed && visual.due === 'overdue';
  const dueSoon = !completed && visual.due === 'soon';
  parts.crack.visible = overdue || dueSoon;
  parts.crack.material = overdue ? res().crackOverdue : res().crackSoon;

  // Completed graves sink into their mound (and rise again if reopened).
  parts.targetSunk = completed ? 1 : 0;

  // Decorations — record INTENT; the reconciler applies LOD/quality gating
  // via setDecorationsEnabled to decide final visibility.
  parts.wantsCrow = dueSoon;
  parts.wantsFlock = overdue;
  parts.wantsSpirit = overdue;
}

function applySunk(parts: GraveParts): void {
  parts.stoneMesh.scale.setScalar(1 - 0.15 * parts.sunk);
  parts.stoneMesh.position.y = -parts.height * 0.35 * parts.sunk;
}

/** Per-frame animation: lerp materials toward targets and tick effects. */
export function tickGrave(parts: GraveParts, dt: number, time: number): Tick {
  let state: Tick = Tick.Settled;
  const mat = parts.stoneMaterial;
  const k = Math.min(1, dt * 6);

  // Smoothly approach emissive target.
  const de = parts.targetEmissive - mat.emissiveIntensity;
  if (Math.abs(de) > 0.001) {
    mat.emissiveIntensity += de * k;
    state = Tick.Transition;
  } else {
    mat.emissiveIntensity = parts.targetEmissive;
  }

  // Blend stone/mound colour toward moss.
  scratchStone.copy(STONE_COLOR).lerp(MOSS_COLOR, parts.targetMoss);
  if (!colorsClose(mat.color, scratchStone)) {
    mat.color.lerp(scratchStone, k);
    scratchSoil.copy(SOIL_COLOR).lerp(SOIL_DARK, parts.targetMoss);
    parts.moundMaterial.color.lerp(scratchSoil, k);
    state = Tick.Transition;
  }

  // Sink / un-sink the stone (completion + reopen).
  const ds = parts.targetSunk - parts.sunk;
  if (Math.abs(ds) > 0.001) {
    parts.sunk += ds * Math.min(1, dt * 3);
    applySunk(parts);
    state = Tick.Transition;
  } else if (parts.sunk !== parts.targetSunk) {
    parts.sunk = parts.targetSunk;
    applySunk(parts);
  }

  let ambient = false;

  // Crow bobbing when visible (due soon).
  const crow = parts.crow;
  if (crow && crow.visible) {
    const bob = Math.sin(time * 2 + parts.phase) * 0.04;
    crow.position.y = parts.height + 0.15 + bob;
    const wings = crow.userData.wings as THREE.Mesh[] | undefined;
    if (wings) {
      const flap = Math.sin(time * 3 + parts.phase) * 0.15;
      wings[0]!.rotation.x = flap;
      wings[1]!.rotation.x = -flap;
    }
    ambient = true;
  }

  // Overdue: circling crow flock + pacing glowing spirit.
  const flock = parts.crowFlock;
  if (flock && flock.visible) {
    const r = 1.4;
    const kids = flock.children;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i]!;
      const a = time * 0.9 + (i * Math.PI * 2) / 3 + parts.phase;
      c.position.set(
        Math.cos(a) * r,
        parts.height + 0.8 + Math.sin(time + i) * 0.15,
        Math.sin(a) * r,
      );
      c.rotation.y = -a + Math.PI / 2;
      const wings = c.userData.wings as THREE.Mesh[] | undefined;
      if (wings) {
        const flap = Math.sin(time * 8 + i) * 0.5;
        wings[0]!.rotation.x = flap;
        wings[1]!.rotation.x = -flap;
      }
    }
    ambient = true;
  }
  const spirit = parts.spirit;
  if (spirit && spirit.visible) {
    const sm = spirit.material as THREE.MeshStandardMaterial;
    sm.opacity = 0.35 + Math.sin(time * 1.5 + parts.phase) * 0.12;
    // pace left-right beside the grave
    spirit.position.x = Math.sin(time * 0.8 + parts.phase) * 0.9;
    spirit.position.y = 0.7 + Math.sin(time * 2) * 0.05;
    ambient = true;
  }

  if (state === Tick.Settled && ambient) state = Tick.Ambient;
  return state;
}

function colorsClose(a: THREE.Color, b: THREE.Color): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 0.002;
}

/** Dispose the per-grave materials. Shared geometry/materials are kept. */
export function disposeGrave(parts: GraveParts): void {
  parts.stoneMaterial.dispose();
  parts.moundMaterial.dispose();
  if (parts.spirit) (parts.spirit.material as THREE.Material).dispose();
}
