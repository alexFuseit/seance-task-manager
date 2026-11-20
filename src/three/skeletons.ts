/**
 * The restless dead — low-poly skeletons that haunt OVERDUE graves.
 *
 * "Spooky = signal" (product steering): skeletons are not ambient decoration.
 * Each one is bound to an overdue task and wanders a ring around that task's
 * grave, so the number of skeletons in the yard IS the overdue backlog (capped
 * at MAX_SKELETONS for readability/perf). When a task stops being overdue
 * (completed, rescheduled, deleted) its skeleton sinks back into the earth;
 * when a task becomes overdue a skeleton claws its way up.
 *
 * Fully procedural (primitives only, per the asset-licensing rule). Geometry
 * and the bone material are shared by every skeleton.
 *
 * Usage: add `.group` to the scene, call `setHaunts()` whenever the overdue
 * set or layout changes, `update(dt)` each frame, and `dispose()` on teardown.
 */
import * as THREE from 'three';

/** Upper bound on simultaneously haunting skeletons. */
export const MAX_SKELETONS = 4;

export interface Haunt {
  /** task id of the overdue grave being haunted. */
  id: string;
  /** world-space centre of that grave. */
  x: number;
  z: number;
}

export interface Skeletons {
  group: THREE.Group;
  /** Bind skeletons to the given overdue graves (first MAX_SKELETONS kept). */
  setHaunts: (haunts: readonly Haunt[]) => void;
  /** Advance; returns true while any skeleton is on screen and moving. */
  update: (dt: number) => boolean;
  setVisible: (visible: boolean) => void;
  /** number of skeletons currently bound (excludes ones sinking away). */
  count: () => number;
  dispose: () => void;
}

interface Walker {
  root: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  center: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  phase: number;
  /** 0 = buried, 1 = fully risen. */
  rise: number;
  leaving: boolean;
}

const BONE_COLOR = new THREE.Color(0xd8d2c2);
const RING_MIN = 1.3;
const RING_MAX = 2.4;
const BURIED_Y = -1.9;

interface SkeletonResources {
  mat: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshBasicMaterial;
  spine: THREE.BufferGeometry;
  ribs: THREE.BufferGeometry;
  pelvis: THREE.BufferGeometry;
  skull: THREE.BufferGeometry;
  jaw: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
}

function buildResources(): SkeletonResources {
  const arm = new THREE.CylinderGeometry(0.045, 0.045 * 0.85, 0.6, 5);
  arm.translate(0, -0.3, 0);
  const leg = new THREE.CylinderGeometry(0.055, 0.055 * 0.85, 0.78, 5);
  leg.translate(0, -0.39, 0);
  return {
    mat: new THREE.MeshStandardMaterial({
      color: BONE_COLOR.clone(),
      roughness: 0.85,
      metalness: 0.0,
      emissive: new THREE.Color(0x3a3a52),
      emissiveIntensity: 0.25,
    }),
    eyeMat: new THREE.MeshBasicMaterial({ color: 0x0b0b12 }),
    spine: new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6),
    ribs: new THREE.CylinderGeometry(0.22, 0.17, 0.5, 8, 1, true),
    pelvis: new THREE.BoxGeometry(0.34, 0.16, 0.18),
    skull: new THREE.SphereGeometry(0.17, 12, 10),
    jaw: new THREE.BoxGeometry(0.18, 0.08, 0.14),
    eye: new THREE.SphereGeometry(0.045, 8, 6),
    arm,
    leg,
  };
}

function limb(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  pivot.add(m);
  return pivot;
}

function buildSkeleton(r: SkeletonResources): Omit<Walker, 'center' | 'target'> {
  const root = new THREE.Group();
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material = r.mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = mat === r.mat;
    return m;
  };

  const spine = mesh(r.spine);
  spine.position.y = 1.15;
  const ribs = mesh(r.ribs);
  ribs.position.y = 1.2;
  const pelvis = mesh(r.pelvis);
  pelvis.position.y = 0.82;
  const skull = mesh(r.skull);
  skull.position.y = 1.62;
  skull.scale.set(1, 1.12, 1.05);
  const jaw = mesh(r.jaw);
  jaw.position.set(0, 1.5, 0.02);
  const eyeL = mesh(r.eye, r.eyeMat);
  const eyeR = mesh(r.eye, r.eyeMat);
  eyeL.position.set(-0.06, 1.64, 0.14);
  eyeR.position.set(0.06, 1.64, 0.14);

  const armL = limb(r.arm, r.mat);
  const armR = limb(r.arm, r.mat);
  armL.position.set(-0.26, 1.42, 0);
  armR.position.set(0.26, 1.42, 0);
  const legL = limb(r.leg, r.mat);
  const legR = limb(r.leg, r.mat);
  legL.position.set(-0.11, 0.8, 0);
  legR.position.set(0.11, 0.8, 0);

  root.add(spine, ribs, pelvis, skull, jaw, eyeL, eyeR, armL, armR, legL, legR);
  return {
    root,
    armL,
    armR,
    legL,
    legR,
    speed: 0.45 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    rise: 0,
    leaving: false,
  };
}

/** Pick a point on the haunting ring around `center` (writes into `out`). */
function ringPoint(center: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const a = Math.random() * Math.PI * 2;
  const d = RING_MIN + Math.random() * (RING_MAX - RING_MIN);
  return out.set(center.x + Math.cos(a) * d, 0, center.z + Math.sin(a) * d);
}

export function createSkeletons(): Skeletons {
  const group = new THREE.Group();
  let resources: SkeletonResources | null = null;
  /** bound walkers by haunted task id. */
  const walkers = new Map<string, Walker>();
  /** walkers sinking back into the ground before removal. */
  const leaving = new Set<Walker>();
  const dir = new THREE.Vector3();
  let elapsed = 0;

  function spawn(h: Haunt): Walker {
    resources ??= buildResources();
    const base = buildSkeleton(resources);
    const center = new THREE.Vector3(h.x, 0, h.z);
    const w: Walker = { ...base, center, target: new THREE.Vector3() };
    ringPoint(center, w.root.position);
    w.root.position.y = BURIED_Y;
    ringPoint(center, w.target);
    group.add(w.root);
    return w;
  }

  function setHaunts(haunts: readonly Haunt[]): void {
    const keep = new Set<string>();
    for (const h of haunts.slice(0, MAX_SKELETONS)) {
      keep.add(h.id);
      const w = walkers.get(h.id);
      if (w) {
        // grave moved (re-sort) → drift to the new ring
        if (Math.abs(w.center.x - h.x) > 0.01 || Math.abs(w.center.z - h.z) > 0.01) {
          w.center.set(h.x, 0, h.z);
          ringPoint(w.center, w.target);
        }
      } else {
        walkers.set(h.id, spawn(h));
      }
    }
    for (const [id, w] of walkers) {
      if (!keep.has(id)) {
        walkers.delete(id);
        w.leaving = true;
        leaving.add(w);
      }
    }
  }

  function step(w: Walker, dt: number): void {
    // Rise from / sink into the earth.
    const riseTarget = w.leaving ? 0 : 1;
    w.rise += (riseTarget - w.rise) * Math.min(1, dt * 1.6);
    if (Math.abs(riseTarget - w.rise) < 0.002) w.rise = riseTarget;

    // Wander only once mostly out of the ground.
    if (w.rise > 0.85 && !w.leaving) {
      dir.copy(w.target).sub(w.root.position);
      dir.y = 0;
      const dist = dir.length();
      if (dist < 0.3) {
        ringPoint(w.center, w.target);
      } else {
        dir.multiplyScalar(1 / dist);
        w.root.position.x += dir.x * w.speed * dt;
        w.root.position.z += dir.z * w.speed * dt;
        let dy = Math.atan2(dir.x, dir.z) - w.root.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        w.root.rotation.y += dy * Math.min(1, dt * 4);
      }
    }

    // Walk cycle: swing limbs in opposition + slight bob.
    const cyc = elapsed * w.speed * 6 + w.phase;
    const swing = Math.sin(cyc) * 0.5;
    w.legL.rotation.x = swing;
    w.legR.rotation.x = -swing;
    w.armL.rotation.x = -swing * 0.8;
    w.armR.rotation.x = swing * 0.8;
    w.root.position.y = BURIED_Y * (1 - w.rise) + Math.abs(Math.sin(cyc)) * 0.04 * w.rise;
  }

  function update(dt: number): boolean {
    if (!group.visible) return false;
    elapsed += dt;
    for (const w of walkers.values()) step(w, dt);
    for (const w of [...leaving]) {
      step(w, dt);
      if (w.rise === 0) {
        group.remove(w.root);
        leaving.delete(w);
      }
    }
    return walkers.size > 0 || leaving.size > 0;
  }

  function setVisible(visible: boolean): void {
    group.visible = visible;
  }

  function dispose(): void {
    walkers.clear();
    leaving.clear();
    group.clear();
    if (resources) {
      const r = resources;
      resources = null;
      r.mat.dispose();
      r.eyeMat.dispose();
      for (const g of [r.spine, r.ribs, r.pelvis, r.skull, r.jaw, r.eye, r.arm, r.leg]) {
        g.dispose();
      }
    }
  }

  return { group, setHaunts, update, setVisible, count: () => walkers.size, dispose };
}
