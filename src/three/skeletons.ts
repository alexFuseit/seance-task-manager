/**
 * The restless dead — procedural skeletons that haunt OVERDUE graves.
 *
 * "Spooky = signal" (product steering): skeletons are not ambient decoration.
 * Each one is bound to an overdue task and wanders a ring around that task's
 * grave, so the number of skeletons in the yard IS the overdue backlog (capped
 * at MAX_SKELETONS for readability/perf). When a task stops being overdue
 * (completed, rescheduled, deleted) its skeleton sinks back into the earth;
 * when a task becomes overdue a skeleton claws its way up, arms first.
 *
 * Anatomy (all primitives, per the asset-licensing rule): a cranium with a
 * brow, cheekbones, dark eye sockets and nasal cavity, teeth and a hinged
 * jaw; a vertebral column; six pairs of curved ribs with a sternum; clavicles,
 * shoulder blades and a pelvic girdle; two-bone forearms and shins with hands
 * and feet; jointed elbows and knees.
 *
 * Performance: every rigid segment is ONE merged, vertex-coloured geometry,
 * shared by all skeletons, with one shared material — 11 draw calls per
 * skeleton (torso, skull, jaw, 2× upper arm, 2× forearm, 2× thigh, 2× shin),
 * the same count as the earlier stick-figure version. The walk cycle is a few
 * rotations per frame with no allocation.
 *
 * Usage: add `.group` to the scene, call `setHaunts()` whenever the overdue
 * set or layout changes, `update(dt)` each frame, and `dispose()` on teardown.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

// --- palette ---------------------------------------------------------------
const BONE = 0xd9d1bd;
const BONE_AGED = 0xb8ab8e; // joints, vertebrae, teeth — adds definition
const SOCKET = 0x07060c;

// --- rig pivots (feet at y = 0, facing +Z) ---------------------------------
const HIP_Y = 0.9; // spine/torso pivot
const NECK_Y = 1.56; // skull pivot
const JAW: [number, number, number] = [0, 1.615, -0.01]; // jaw hinge
const SHOULDER: [number, number, number] = [0.205, 1.45, -0.01];
const HIP_JOINT: [number, number, number] = [0.095, 0.875, 0];
const HUMERUS = 0.29;
const FOREARM = 0.25;
const FEMUR = 0.42;
const SHIN = 0.4;

const RING_MIN = 1.3;
const RING_MAX = 2.4;
const BURIED_Y = -1.9;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function tint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Merge parts and shift so `pivot` becomes the local origin. */
function segment(parts: THREE.BufferGeometry[], pivot: [number, number, number]): THREE.BufferGeometry {
  for (const p of parts) p.deleteAttribute('uv');
  const out = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!out) throw new Error('skeleton: geometry merge failed');
  out.translate(-pivot[0], -pivot[1], -pivot[2]);
  return out;
}

function sphere(r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, hex = BONE) {
  const g = new THREE.SphereGeometry(r, 10, 8);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return tint(g, hex);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex = BONE) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return tint(g, hex);
}

/** A cylinder "bone" between two points, with knobbly ends. */
function bone(
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  knob = r * 1.6,
  hex = BONE,
): THREE.BufferGeometry[] {
  const len = a.distanceTo(b);
  const shaft = new THREE.CylinderGeometry(r * 0.85, r, len, 6);
  // align +Y with a→b
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  shaft.applyQuaternion(q);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  shaft.translate(mid.x, mid.y, mid.z);
  const out = [tint(shaft, hex)];
  if (knob > 0) {
    out.push(sphere(knob, a.x, a.y, a.z, 1, 1, 1, BONE_AGED));
    out.push(sphere(knob * 0.9, b.x, b.y, b.z, 1, 1, 1, BONE_AGED));
  }
  return out;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

function buildTorso(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];

  // Vertebral column: stacked vertebrae from the sacrum to the neck.
  for (let y = 0.93; y < NECK_Y + 0.02; y += 0.042) {
    const lumbar = y < 1.12;
    const r = lumbar ? 0.034 : 0.026;
    const vert = new THREE.CylinderGeometry(r, r, 0.03, 6);
    vert.translate(0, y, -0.035);
    p.push(tint(vert, BONE_AGED));
    // spinous process sticking out the back
    p.push(box(0.014, 0.022, 0.035, 0, y - 0.006, -0.065, BONE_AGED));
  }

  // Ribcage: six pairs of curved ribs, widest in the middle, sloping down
  // toward the front, with a gap at the sternum.
  const radii = [0.1, 0.13, 0.15, 0.155, 0.15, 0.135];
  const gap = 0.5; // radians left open at the front (costal cartilage gap)
  for (let i = 0; i < radii.length; i++) {
    const y = 1.43 - i * 0.055;
    const r = radii[i]!;
    const arc = Math.PI * 2 - gap * 2 * (1 + i * 0.25); // lower ribs open wider
    const rib = new THREE.TorusGeometry(r, 0.011, 4, 18, arc);
    rib.rotateZ(-Math.PI / 2 + (Math.PI * 2 - arc) / 2); // centre the gap on +Z
    rib.rotateX(-Math.PI / 2); // lie horizontally
    rib.scale(1, 1, 0.72); // chest is flatter front-to-back
    rib.rotateX(0.22); // slope down toward the front
    rib.translate(0, y, 0.025);
    p.push(tint(rib, BONE));
  }
  // Sternum.
  p.push(box(0.035, 0.2, 0.016, 0, 1.36, 0.135));

  // Clavicles + shoulder blades.
  for (const s of [1, -1]) {
    p.push(...bone(v(0.02 * s, 1.47, 0.11), v(SHOULDER[0] * s, SHOULDER[1] + 0.02, 0), 0.011, 0));
    const scap = new THREE.BoxGeometry(0.1, 0.13, 0.012);
    scap.rotateY(0.35 * s);
    scap.rotateZ(-0.15 * s);
    scap.translate(0.12 * s, 1.37, -0.1);
    p.push(tint(scap, BONE));
  }

  // Pelvic girdle: flared iliac blades, sacrum, and the pelvic ring.
  for (const s of [1, -1]) {
    const ilium = new THREE.SphereGeometry(0.075, 10, 8);
    ilium.scale(1, 1.1, 0.24);
    ilium.rotateY(0.55 * s);
    ilium.rotateZ(-0.3 * s);
    ilium.translate(0.1 * s, 0.97, 0);
    p.push(tint(ilium, BONE));
    // hip sockets
    p.push(sphere(0.03, HIP_JOINT[0] * s, HIP_JOINT[1], HIP_JOINT[2], 1, 1, 1, BONE_AGED));
  }
  p.push(box(0.07, 0.11, 0.04, 0, 0.93, -0.05));
  const ring = new THREE.TorusGeometry(0.09, 0.013, 5, 14);
  ring.rotateX(-Math.PI / 2 + 0.5);
  ring.scale(1, 1, 0.7);
  ring.translate(0, 0.89, 0.02);
  p.push(tint(ring, BONE));

  return segment(p, [0, HIP_Y, 0]);
}

function buildSkull(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // neck vertebrae
  for (let y = NECK_Y; y < 1.62; y += 0.03) {
    const n = new THREE.CylinderGeometry(0.022, 0.022, 0.022, 6);
    n.translate(0, y, -0.03);
    p.push(tint(n, BONE_AGED));
  }
  // cranium, brow ridge, face and cheekbones
  p.push(sphere(0.115, 0, 1.715, -0.015, 0.92, 1.0, 1.1));
  p.push(sphere(0.07, 0, 1.69, 0.085, 1.05, 0.25, 0.45)); // brow ridge
  p.push(sphere(0.07, 0, 1.635, 0.06, 0.95, 0.78, 0.82));
  for (const s of [1, -1]) p.push(sphere(0.02, 0.058 * s, 1.643, 0.075, 1.2, 0.7, 0.9));
  // eye sockets + nasal cavity (dark, set into the face)
  for (const s of [1, -1]) p.push(sphere(0.026, 0.04 * s, 1.663, 0.097, 1, 0.95, 0.5, SOCKET));
  const nose = new THREE.ConeGeometry(0.016, 0.04, 3);
  nose.rotateX(Math.PI); // point down
  nose.translate(0, 1.625, 0.118);
  p.push(tint(nose, SOCKET));
  // upper teeth
  for (let i = 0; i < 6; i++) {
    const a = ((i - 2.5) / 2.5) * 0.9;
    p.push(box(0.011, 0.018, 0.008, Math.sin(a) * 0.045, 1.592, 0.068 + Math.cos(a) * 0.035, BONE_AGED));
  }
  return segment(p, [0, NECK_Y, 0]);
}

function buildJaw(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // U-shaped mandible
  const mand = new THREE.TorusGeometry(0.055, 0.014, 4, 12, Math.PI * 1.15);
  mand.rotateZ(-Math.PI * 0.075 + Math.PI); // open end toward the back
  mand.rotateX(-Math.PI / 2);
  mand.scale(1, 1, 1.15);
  mand.translate(0, 1.565, 0.05);
  p.push(tint(mand, BONE));
  for (const s of [1, -1]) p.push(box(0.014, 0.06, 0.03, 0.058 * s, 1.59, 0.0));
  p.push(box(0.03, 0.02, 0.014, 0, 1.557, 0.11)); // chin
  for (let i = 0; i < 6; i++) {
    const a = ((i - 2.5) / 2.5) * 0.9;
    p.push(box(0.01, 0.016, 0.008, Math.sin(a) * 0.042, 1.578, 0.066 + Math.cos(a) * 0.033, BONE_AGED));
  }
  return segment(p, JAW);
}

function buildUpperArm(): THREE.BufferGeometry {
  return segment(bone(v(0, 0, 0), v(0, -HUMERUS, 0), 0.016, 0.026), [0, 0, 0]);
}

function buildForearm(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // radius + ulna side by side
  p.push(...bone(v(0.012, 0, 0.004), v(0.016, -FOREARM, 0.01), 0.009, 0));
  p.push(...bone(v(-0.012, 0, -0.004), v(-0.008, -FOREARM, -0.006), 0.009, 0));
  // hand: palm + four bony fingers + thumb, slightly curled
  const wrist = -FOREARM - 0.02;
  p.push(box(0.05, 0.06, 0.014, 0, wrist - 0.02, 0));
  for (let i = 0; i < 4; i++) {
    const x = -0.018 + i * 0.012;
    p.push(...bone(v(x, wrist - 0.05, 0), v(x, wrist - 0.1, 0.018), 0.004, 0));
  }
  p.push(...bone(v(0.027, wrist - 0.02, 0.004), v(0.04, wrist - 0.06, 0.02), 0.0045, 0));
  return segment(p, [0, 0, 0]);
}

function buildThigh(): THREE.BufferGeometry {
  return segment(bone(v(0, 0, 0), v(0, -FEMUR, 0.01), 0.021, 0.032), [0, 0, 0]);
}

function buildShin(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  // tibia + fibula
  p.push(...bone(v(0.006, 0, 0.005), v(0.004, -SHIN, 0), 0.016, 0));
  p.push(...bone(v(-0.022, -0.02, -0.004), v(-0.018, -SHIN + 0.02, -0.004), 0.007, 0));
  p.push(sphere(0.026, 0, -0.005, 0.018, 1, 0.6, 1, BONE_AGED)); // kneecap
  // foot: heel, arch and toes pointing forward
  const ankle = -SHIN - 0.025;
  p.push(sphere(0.028, 0, ankle, -0.015, 1, 0.8, 1.2, BONE_AGED));
  const arch = new THREE.BoxGeometry(0.065, 0.025, 0.11);
  arch.rotateX(0.18);
  arch.translate(0, ankle - 0.01, 0.055);
  p.push(tint(arch, BONE));
  for (let i = 0; i < 5; i++) {
    const x = -0.024 + i * 0.012;
    p.push(...bone(v(x, ankle - 0.022, 0.105), v(x, ankle - 0.03, 0.145), 0.005, 0));
  }
  return segment(p, [0, 0, 0]);
}

// ---------------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------------

interface SkeletonResources {
  mat: THREE.MeshStandardMaterial;
  torso: THREE.BufferGeometry;
  skull: THREE.BufferGeometry;
  jaw: THREE.BufferGeometry;
  upperArm: THREE.BufferGeometry;
  forearm: THREE.BufferGeometry;
  thigh: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
}

function buildResources(): SkeletonResources {
  return {
    mat: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.0,
      emissive: new THREE.Color(0x2e2c40),
      emissiveIntensity: 0.3,
    }),
    torso: buildTorso(),
    skull: buildSkull(),
    jaw: buildJaw(),
    upperArm: buildUpperArm(),
    forearm: buildForearm(),
    thigh: buildThigh(),
    shin: buildShin(),
  };
}

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

interface Walker {
  root: THREE.Group;
  spine: THREE.Group;
  skull: THREE.Group;
  jaw: THREE.Group;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  center: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  phase: number;
  /** 0 = buried, 1 = fully risen. */
  rise: number;
  leaving: boolean;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

function limb(
  parent: THREE.Object3D,
  at: [number, number, number],
  upperGeo: THREE.BufferGeometry,
  lowerGeo: THREE.BufferGeometry,
  upperLen: number,
  mat: THREE.Material,
): Limb {
  const upper = new THREE.Group();
  upper.position.set(at[0], at[1], at[2]);
  upper.add(mesh(upperGeo, mat));
  const lower = new THREE.Group();
  lower.position.y = -upperLen;
  lower.add(mesh(lowerGeo, mat));
  upper.add(lower);
  parent.add(upper);
  return { upper, lower };
}

function buildSkeleton(r: SkeletonResources): Omit<Walker, 'center' | 'target'> {
  const root = new THREE.Group();

  const spine = new THREE.Group();
  spine.position.y = HIP_Y;
  spine.add(mesh(r.torso, r.mat));
  root.add(spine);

  // Skull rides on the spine so it follows the lean/sway.
  const skull = new THREE.Group();
  skull.position.y = NECK_Y - HIP_Y;
  skull.add(mesh(r.skull, r.mat));
  spine.add(skull);
  const jaw = new THREE.Group();
  jaw.position.set(JAW[0], JAW[1] - NECK_Y, JAW[2]);
  jaw.add(mesh(r.jaw, r.mat));
  skull.add(jaw);

  const shoulder = (s: number): [number, number, number] => [
    SHOULDER[0] * s,
    SHOULDER[1] - HIP_Y,
    SHOULDER[2],
  ];
  const armL = limb(spine, shoulder(-1), r.upperArm, r.forearm, HUMERUS, r.mat);
  const armR = limb(spine, shoulder(1), r.upperArm, r.forearm, HUMERUS, r.mat);
  const legL = limb(root, [-HIP_JOINT[0], HIP_JOINT[1], HIP_JOINT[2]], r.thigh, r.shin, FEMUR, r.mat);
  const legR = limb(root, [HIP_JOINT[0], HIP_JOINT[1], HIP_JOINT[2]], r.thigh, r.shin, FEMUR, r.mat);

  return {
    root,
    spine,
    skull,
    jaw,
    armL,
    armR,
    legL,
    legR,
    speed: 0.42 + Math.random() * 0.25,
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

/**
 * Pose one skeleton. Rotation conventions (limbs hang along -Y, body faces
 * +Z): negative X-rotation swings a limb forward; positive bends a knee back;
 * negative bends an elbow forward.
 */
function animate(w: Walker, t: number): void {
  const cyc = t * w.speed * 6.5 + w.phase;
  const s = Math.sin(cyc);
  const c = Math.cos(cyc);

  // Legs: thigh swing with a knee that bends during the forward swing.
  w.legL.upper.rotation.x = -s * 0.42;
  w.legR.upper.rotation.x = s * 0.42;
  w.legL.lower.rotation.x = 0.08 + Math.max(0, c) * 0.75;
  w.legR.lower.rotation.x = 0.08 + Math.max(0, -c) * 0.75;

  // Arms swing opposite the legs, elbows loosely bent and dangling.
  const reach = 1 - THREE.MathUtils.smoothstep(w.rise, 0.55, 1); // clawing out of the soil
  w.armL.upper.rotation.x = THREE.MathUtils.lerp(s * 0.38, -2.5, reach);
  w.armR.upper.rotation.x = THREE.MathUtils.lerp(-s * 0.38, -2.3, reach);
  w.armL.upper.rotation.z = -0.1;
  w.armR.upper.rotation.z = 0.1;
  w.armL.lower.rotation.x = -0.35 - Math.max(0, -s) * 0.3 + reach * 0.2;
  w.armR.lower.rotation.x = -0.35 - Math.max(0, s) * 0.3 + reach * 0.2;

  // Hunched, swaying gait; the head lolls and the jaw chatters now and then.
  w.spine.rotation.x = 0.1 + reach * 0.25;
  w.spine.rotation.z = s * 0.04;
  w.spine.rotation.y = s * 0.08;
  w.skull.rotation.x = 0.05 + Math.sin(cyc * 2) * 0.04;
  w.skull.rotation.z = Math.sin(t * 0.7 + w.phase) * 0.12;
  const chatter = Math.max(0, Math.sin(t * 0.9 + w.phase * 3) - 0.85) * 6.6;
  w.jaw.rotation.x = 0.05 + chatter * (0.18 + 0.1 * Math.sin(t * 40));
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

    animate(w, elapsed);
    const bob = Math.abs(Math.sin(elapsed * w.speed * 6.5 + w.phase)) * 0.035;
    w.root.position.y = BURIED_Y * (1 - w.rise) + bob * w.rise;
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
      for (const g of [r.torso, r.skull, r.jaw, r.upperArm, r.forearm, r.thigh, r.shin]) {
        g.dispose();
      }
    }
  }

  return { group, setHaunts, update, setVisible, count: () => walkers.size, dispose };
}

