/**
 * Procedural crows (Requirement 4.4 perched crow, 4.5 circling flock).
 *
 * Detail without cost:
 *  - The body (lathe-turned torso, head, beak, eyes, fanned tail, legs) is ONE
 *    merged geometry with vertex colours, so it is a single draw call.
 *  - Wings are two-segment (inner arm + fingered outer primaries) so the flap
 *    has a lagging wing-tip bend instead of a rigid paddle.
 *  - Every crow shares the same geometries and ONE material. Draw calls per
 *    crow: 5 in flight (body + 4 wing segments), 6 perched (separate head so it
 *    can glance around) — about the same as the old box-and-cone crow.
 *  - Animation is a handful of rotations per frame; no allocation.
 *
 * Local frame: the crow faces +X, up is +Y, the left wing spans +Z.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const FEATHER = 0x14151d; // blue-black plumage
const WING = 0x0f1017;
const BEAK = 0x2c2a2a;
const EYE = 0xc9a24a; // faint amber glint so the face reads on video
const LEG = 0x26241f;

const INNER_SPAN = 0.17;

interface CrowResources {
  perchedBody: THREE.BufferGeometry;
  perchedHead: THREE.BufferGeometry;
  flightBody: THREE.BufferGeometry;
  wingInner: THREE.BufferGeometry;
  wingOuter: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
}

let res: CrowResources | null = null;

/** Give a geometry a uniform vertex colour (so parts can be merged). */
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

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!out) throw new Error('crow: geometry merge failed');
  return out;
}

/** Teardrop torso: a lathe profile turned around the body axis (+X). */
function torso(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.0, -0.2),
    new THREE.Vector2(0.045, -0.15),
    new THREE.Vector2(0.085, -0.06),
    new THREE.Vector2(0.1, 0.02),
    new THREE.Vector2(0.08, 0.09),
    new THREE.Vector2(0.045, 0.13),
    new THREE.Vector2(0.0, 0.145),
  ];
  const g = new THREE.LatheGeometry(profile, 10);
  g.rotateZ(-Math.PI / 2); // lathe axis Y → body axis X (head toward +X)
  g.scale(1, 0.92, 0.85); // slightly deeper than wide, like a bird
  return tint(g, FEATHER);
}

/** Head + beak + eyes, built around a neck pivot at the origin. */
function headParts(): THREE.BufferGeometry[] {
  const skull = new THREE.SphereGeometry(0.06, 10, 8);
  skull.scale(1.2, 1, 0.95);
  skull.translate(0.05, 0.03, 0);
  const beak = new THREE.ConeGeometry(0.026, 0.12, 6);
  beak.rotateZ(-Math.PI / 2 - 0.12); // point forward, hooked slightly down
  beak.translate(0.15, 0.02, 0);
  const eyeL = new THREE.SphereGeometry(0.013, 6, 4);
  eyeL.translate(0.085, 0.045, 0.044);
  const eyeR = eyeL.clone();
  eyeR.translate(0, 0, -0.088);
  return [tint(skull, FEATHER), tint(beak, BEAK), tint(eyeL, EYE), tint(eyeR, EYE)];
}

/** Fanned, notched tail lying flat behind the body. */
function tail(droop: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.15, 0.025);
  s.lineTo(-0.33, 0.07);
  s.lineTo(-0.305, 0.02);
  s.lineTo(-0.335, 0.0);
  s.lineTo(-0.305, -0.02);
  s.lineTo(-0.33, -0.07);
  s.lineTo(-0.15, -0.025);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2); // shape Y → world Z (flat, horizontal)
  g.translate(0.15, 0, 0);
  g.rotateZ(droop); // tilt about the tail root
  g.translate(-0.15, -0.01, 0);
  return tint(g, WING);
}

function legs(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const z of [0.035, -0.035]) {
    const leg = new THREE.CylinderGeometry(0.007, 0.007, 0.11, 4);
    leg.translate(0.01, -0.1, z);
    const foot = new THREE.BoxGeometry(0.06, 0.008, 0.02);
    foot.translate(0.025, -0.155, z);
    out.push(tint(leg, LEG), tint(foot, LEG));
  }
  return out;
}

/** Inner wing (shoulder → elbow): broad, with a scalloped trailing edge. */
function wingInner(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0.06, 0);
  s.lineTo(0.05, INNER_SPAN);
  s.lineTo(-0.07, INNER_SPAN);
  s.lineTo(-0.1, 0.13);
  s.lineTo(-0.085, 0.11);
  s.lineTo(-0.1, 0.07);
  s.lineTo(-0.08, 0.05);
  s.lineTo(-0.085, 0.0);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2); // span along +Z
  return tint(g, WING);
}

/** Outer wing (elbow → tip): splayed "fingered" primaries, crow-style. */
function wingOuter(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0.05, 0);
  s.lineTo(0.03, 0.12);
  s.lineTo(0.0, 0.215); // leading primary tip
  s.lineTo(-0.018, 0.15);
  s.lineTo(-0.035, 0.205);
  s.lineTo(-0.05, 0.14);
  s.lineTo(-0.07, 0.185);
  s.lineTo(-0.08, 0.12);
  s.lineTo(-0.1, 0.15);
  s.lineTo(-0.09, 0.06);
  s.lineTo(-0.07, 0.0);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2);
  return tint(g, WING);
}

function resources(): CrowResources {
  if (res) return res;
  const headForFlight = headParts();
  for (const h of headForFlight) h.translate(0.12, 0.04, 0);
  res = {
    perchedBody: merge([torso(), tail(0.35), ...legs()]),
    perchedHead: merge(headParts()),
    flightBody: merge([torso(), tail(0.05), ...headForFlight]),
    wingInner: wingInner(),
    wingOuter: wingOuter(),
    material: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.2, // a hint of oily sheen catches the moon/rim light
      side: THREE.DoubleSide, // wings and tail are single-sided shapes
    }),
  };
  return res;
}

export function disposeCrowResources(): void {
  if (!res) return;
  const r = res;
  res = null;
  r.perchedBody.dispose();
  r.perchedHead.dispose();
  r.flightBody.dispose();
  r.wingInner.dispose();
  r.wingOuter.dispose();
  r.material.dispose();
}

interface CrowRig {
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  head: THREE.Mesh | null;
  /** per-crow phase so a flock doesn't flap in lockstep. */
  phase: number;
}

function rig(crow: THREE.Group): CrowRig {
  return crow.userData.rig as CrowRig;
}

/** Build a crow. Perched crows have legs, a drooped tail and a turning head. */
export function buildCrow(perched: boolean, phase = Math.random() * Math.PI * 2): THREE.Group {
  const r = resources();
  const crow = new THREE.Group();
  crow.add(new THREE.Mesh(perched ? r.perchedBody : r.flightBody, r.material));

  let head: THREE.Mesh | null = null;
  if (perched) {
    head = new THREE.Mesh(r.perchedHead, r.material);
    head.position.set(0.12, 0.04, 0);
    crow.add(head);
  }

  const wing = (side: 1 | -1) => {
    const shoulder = new THREE.Group();
    // Sweep back (fold) about Y first, then rotate about the body axis: in
    // flight that is the flap; when folded it stands the wing up along the flank.
    shoulder.rotation.order = 'XYZ';
    shoulder.position.set(0.03, 0.05, 0.055 * side);
    const inner = new THREE.Mesh(r.wingInner, r.material);
    inner.scale.z = side;
    const elbow = new THREE.Group();
    elbow.rotation.order = 'XYZ';
    elbow.position.set(0, 0, INNER_SPAN * side);
    const outer = new THREE.Mesh(r.wingOuter, r.material);
    outer.scale.z = side;
    elbow.add(outer);
    shoulder.add(inner, elbow);
    crow.add(shoulder);
    return { shoulder, elbow };
  };
  const L = wing(1);
  const R = wing(-1);

  const data: CrowRig = {
    shoulderL: L.shoulder,
    shoulderR: R.shoulder,
    elbowL: L.elbow,
    elbowR: R.elbow,
    head,
    phase,
  };
  crow.userData.rig = data;
  if (perched) animatePerched(crow, 0, 0);
  return crow;
}

/** Set the wing pose: `lift` raises both wings, `tip` bends the primaries. */
function pose(w: CrowRig, lift: number, tip: number, fold: number): void {
  // Left wing spans +Z: negative X-rotation raises it; the right mirrors.
  w.shoulderL.rotation.x = -lift;
  w.shoulderR.rotation.x = lift;
  w.elbowL.rotation.x = -tip;
  w.elbowR.rotation.x = tip;
  w.shoulderL.rotation.y = -fold;
  w.shoulderR.rotation.y = fold;
  w.elbowL.rotation.y = -fold * 0.2;
  w.elbowR.rotation.y = fold * 0.2;
}

function hash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Perched crow: wings folded along the body, with an occasional ruffle; the
 * head snaps between glances like a real corvid.
 */
export function animatePerched(crow: THREE.Group, time: number, dt: number): void {
  const w = rig(crow);
  // Folded: wings swept back (fold) and stood up along the flanks (lift).
  // A short half-open ruffle once every ~4 s.
  const cycle = (time * 0.25 + w.phase * 0.159) % 1;
  const burst = cycle < 0.12 ? Math.sin((cycle / 0.12) * Math.PI) : 0;
  const lift = 1.25 * (1 - burst) + burst * (0.45 + 0.3 * Math.sin(time * 22));
  pose(w, lift, 0, 1.45 * (1 - burst * 0.7));

  if (w.head) {
    // Hold a glance for ~1.6 s, then snap to a new one.
    const k = Math.floor(time * 0.6 + w.phase);
    const yaw = (hash(k) - 0.5) * 1.7;
    const pitch = (hash(k + 0.37) - 0.6) * 0.5;
    const s = Math.min(1, dt * 14);
    w.head.rotation.y += (yaw - w.head.rotation.y) * s;
    w.head.rotation.z += (pitch - w.head.rotation.z) * s;
  }
}

/**
 * Flying crow: alternates bursts of flapping with short glides; the wing tips
 * lag the arm so the stroke has a whip to it.
 */
export function animateFlight(crow: THREE.Group, time: number): void {
  const w = rig(crow);
  const t = time + w.phase;
  const flapping = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.7));
  const stroke = t * 9;
  const lift = Math.sin(stroke) * 0.75 * flapping + 0.12; // slight dihedral when gliding
  const tip = Math.sin(stroke - 0.9) * 0.55 * flapping;
  pose(w, lift, tip, 0);
}
