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
 * Material/scale changes are not snapped: the reconciler lerps the live values
 * toward the targets stored on GraveParts each frame, so priority edits and
 * search highlighting transition smoothly.
 */
import * as THREE from 'three';
import { type Priority, type Status } from '../model/types';
import { type DueState } from '../model/query';

export interface GraveVisual {
  priority: Priority;
  status: Status;
  due: DueState;
  /** matches the active search term (0 when no search is active). */
  searchMatch: boolean;
  /** a search term is currently active (so non-matches should dim). */
  searchActive: boolean;
}

export interface GraveParts {
  group: THREE.Group;
  stoneMesh: THREE.Mesh;
  stoneMaterial: THREE.MeshStandardMaterial;
  moundMaterial: THREE.MeshStandardMaterial;
  crack: THREE.Mesh;
  /** a single crow that lands when due-soon; hidden otherwise. */
  crow: THREE.Group;
  /** circling crows for overdue; hidden otherwise. */
  crowFlock: THREE.Group;
  /** pacing spirit for overdue; hidden otherwise. */
  spirit: THREE.Mesh;
  /** nominal height of the marker, for plaque placement. */
  height: number;

  // --- animation targets (lerped by the reconciler each frame) ---
  targetEmissive: number;
  targetMoss: number; // 0..1 blend toward moss colour
  targetScale: number; // overall marker scale (dim-by-scale avoided; used for completed)
  /** phase offset so effects don't all tick in unison. */
  phase: number;
}

const STONE_COLOR = new THREE.Color(0xb4b4bc);
const MOSS_COLOR = new THREE.Color(0x63703f);
const SOIL_COLOR = new THREE.Color(0x5a4d38);
const SOIL_DARK = new THREE.Color(0x45392a);

const GLOW: Record<Priority, { color: number; intensity: number }> = {
  high: { color: 0x9fdfe6, intensity: 1.6 },
  medium: { color: 0xe0b86a, intensity: 0.8 },
  low: { color: 0x9aa07a, intensity: 0.35 },
};

function stoneGeometry(priority: Priority): { geo: THREE.BufferGeometry; height: number } {
  switch (priority) {
    case 'high': {
      const height = 2.6;
      const geo = new THREE.CylinderGeometry(0.05, 0.28, height, 4);
      geo.rotateY(Math.PI / 4);
      geo.translate(0, height / 2, 0);
      return { geo, height };
    }
    case 'medium': {
      const height = 1.4;
      const geo = new THREE.BoxGeometry(1.0, height, 0.2);
      geo.translate(0, height / 2, 0);
      return { geo, height };
    }
    case 'low': {
      const height = 0.5;
      const geo = new THREE.BoxGeometry(0.9, height, 0.16);
      geo.translate(0, height / 2, 0);
      return { geo, height };
    }
  }
}

/** A tiny low-poly crow (body + head + beak + wings). */
function buildCrow(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 6), mat);
  body.rotation.z = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat);
  head.position.set(0.22, 0.05, 0);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.03, 0.12, 4),
    new THREE.MeshStandardMaterial({ color: 0x8a6a1a }),
  );
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.34, 0.05, 0);
  const wingGeo = new THREE.BoxGeometry(0.18, 0.02, 0.12);
  const wingL = new THREE.Mesh(wingGeo, mat);
  wingL.position.set(0, 0.04, 0.1);
  const wingR = new THREE.Mesh(wingGeo, mat);
  wingR.position.set(0, 0.04, -0.1);
  g.add(body, head, beak, wingL, wingR);
  g.userData.wings = [wingL, wingR];
  return g;
}

/** A translucent pacing spirit (a tapered wisp). */
function buildSpirit(): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(0.22, 0.7, 4, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xbfe9ef,
    emissive: new THREE.Color(0x6fb9c4),
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.7;
  return mesh;
}

export function buildGrave(visual: GraveVisual): GraveParts {
  const group = new THREE.Group();
  const { geo, height } = stoneGeometry(visual.priority);

  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: STONE_COLOR.clone(),
    roughness: 0.9,
    metalness: 0.0,
    emissive: new THREE.Color(GLOW[visual.priority].color),
    emissiveIntensity: 0,
  });
  const stoneMesh = new THREE.Mesh(geo, stoneMaterial);
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;

  // Crack overlay — a thin dark fissure line hugging the stone face.
  const crackMat = new THREE.MeshBasicMaterial({
    color: 0x0d0a06,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.06, height * 0.6), crackMat);
  crack.position.set(0.08, height * 0.5, 0.085);
  crack.rotation.z = 0.35;
  stoneMesh.add(crack);

  const moundMaterial = new THREE.MeshStandardMaterial({
    color: SOIL_COLOR.clone(),
    roughness: 1,
  });
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.2, 16), moundMaterial);
  mound.position.y = 0.1;
  mound.receiveShadow = true;

  const crow = buildCrow();
  crow.visible = false;
  crow.position.set(0, height + 0.15, 0);
  crow.scale.setScalar(0.9);

  const crowFlock = new THREE.Group();
  crowFlock.visible = false;
  for (let i = 0; i < 3; i++) {
    const c = buildCrow();
    c.scale.setScalar(0.7);
    crowFlock.add(c);
  }

  const spirit = buildSpirit();
  spirit.visible = false;

  group.add(mound, stoneMesh, crow, crowFlock, spirit);

  const parts: GraveParts = {
    group,
    stoneMesh,
    stoneMaterial,
    moundMaterial,
    crack,
    crow,
    crowFlock,
    spirit,
    height,
    targetEmissive: 0,
    targetMoss: 0,
    targetScale: 1,
    phase: Math.random() * Math.PI * 2,
  };

  applyGraveVisual(parts, visual);
  // Snap transitionable values on first build so there is no initial lerp flash.
  stoneMaterial.emissiveIntensity = parts.targetEmissive;
  if (visual.status === 'completed') {
    stoneMesh.scale.setScalar(0.85);
    stoneMesh.position.y = -height * 0.35;
  }
  return parts;
}

/**
 * Recompute animation targets + toggle decorative objects for a visual state.
 * Does NOT snap live material values — the reconciler lerps toward the targets.
 */
export function applyGraveVisual(parts: GraveParts, visual: GraveVisual): void {
  const completed = visual.status === 'completed';
  const base = GLOW[visual.priority];

  // Glow target: dormant when completed; dimmed when a search excludes it;
  // boosted when it matches an active search.
  let emissive = completed ? 0 : base.intensity * 0.3;
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

  // Crack intensity (opacity target lives on the crack material directly).
  const crackMat = parts.crack.material as THREE.MeshBasicMaterial;
  crackMat.opacity =
    completed ? 0 : visual.due === 'overdue' ? 0.9 : visual.due === 'soon' ? 0.5 : 0;

  // Decorative objects.
  const dueSoon = !completed && visual.due === 'soon';
  const overdue = !completed && visual.due === 'overdue';
  parts.crow.visible = dueSoon;
  parts.crowFlock.visible = overdue;
  parts.spirit.visible = overdue;

  parts.targetScale = 1;
}

/** Per-frame animation: lerp materials toward targets and tick effects. */
export function tickGrave(parts: GraveParts, dt: number, time: number): boolean {
  let active = false;
  const mat = parts.stoneMaterial;

  // Smoothly approach emissive target.
  const k = Math.min(1, dt * 6);
  if (Math.abs(mat.emissiveIntensity - parts.targetEmissive) > 0.001) {
    mat.emissiveIntensity += (parts.targetEmissive - mat.emissiveIntensity) * k;
    active = true;
  }

  // Blend stone/mound colour toward moss.
  const targetStone = STONE_COLOR.clone().lerp(MOSS_COLOR, parts.targetMoss);
  if (!mat.color.equals(targetStone)) {
    mat.color.lerp(targetStone, k);
    active = true;
  }
  const targetSoil = SOIL_COLOR.clone().lerp(SOIL_DARK, parts.targetMoss);
  parts.moundMaterial.color.lerp(targetSoil, k);

  // Crow bobbing when visible (due soon).
  if (parts.crow.visible) {
    const bob = Math.sin(time * 2 + parts.phase) * 0.04;
    parts.crow.position.y = parts.height + 0.15 + bob;
    const wings = parts.crow.userData.wings as THREE.Mesh[] | undefined;
    if (wings) {
      const flap = Math.sin(time * 3 + parts.phase) * 0.15;
      wings[0]!.rotation.x = flap;
      wings[1]!.rotation.x = -flap;
    }
    active = true;
  }

  // Overdue: circling crow flock + pacing glowing spirit.
  if (parts.crowFlock.visible) {
    const r = 1.4;
    parts.crowFlock.children.forEach((c, i) => {
      const a = time * 0.9 + (i * Math.PI * 2) / 3 + parts.phase;
      c.position.set(Math.cos(a) * r, parts.height + 0.8 + Math.sin(time + i) * 0.15, Math.sin(a) * r);
      c.rotation.y = -a + Math.PI / 2;
      const wings = (c as THREE.Group).userData.wings as THREE.Mesh[] | undefined;
      if (wings) {
        const flap = Math.sin(time * 8 + i) * 0.5;
        wings[0]!.rotation.x = flap;
        wings[1]!.rotation.x = -flap;
      }
    });
    active = true;
  }
  if (parts.spirit.visible) {
    const sm = parts.spirit.material as THREE.MeshStandardMaterial;
    sm.opacity = 0.35 + Math.sin(time * 1.5 + parts.phase) * 0.12;
    // pace left-right beside the grave
    parts.spirit.position.x = Math.sin(time * 0.8 + parts.phase) * 0.9;
    parts.spirit.position.y = 0.7 + Math.sin(time * 2) * 0.05;
    active = true;
  }

  return active;
}

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
