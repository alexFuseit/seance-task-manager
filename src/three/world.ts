/**
 * World atmosphere (Requirement 5): the scene's mood tracks the workload.
 *
 *  - Day/night cycle: the closer the soonest upcoming due date, the deeper into
 *    night the sky goes (dusk → midnight). Drives sky colour + moonlight.
 *  - Fog density scales with the number of overdue tasks.
 *  - Blood moon: once overdue tasks exceed a threshold, a red moon rises and
 *    tints the scene.
 *
 * It mutates a provided scene/lights and exposes update(store, dt) so the
 * values ease over time rather than snapping when the task set changes.
 */
import * as THREE from 'three';
import { type SeanceStore } from '../store/task-store';
import { type Sky } from './scene';
import { countOverdue } from '../model/query';

export interface WorldDeps {
  scene: THREE.Scene;
  fog: THREE.FogExp2;
  moonLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  sky: Sky;
}

export interface World {
  moon: THREE.Mesh;
  update: (store: SeanceStore, dt: number) => void;
  dispose: () => void;
}

const BLOOD_MOON_THRESHOLD = 3; // overdue tasks

// --- Palette (researched graveyard / twilight scheme) ---------------------
// The scene is a complementary split: a cool violet→teal sky with a WARM amber
// horizon glow. Dusk is richer and more saturated; deep night pushes toward
// raven-plum; a backlog tints everything toward blood vermilion.
//
// Sky dome has three bands: zenith (top), horizon glow, and below-horizon
// (bottom). Dusk keeps a strong warm horizon so the frame never reads flat.
const DUSK_TOP = new THREE.Color(0x1f1442); // deeper violet zenith (star contrast)
const NIGHT_TOP = new THREE.Color(0x160f30); // raven-plum midnight
const DUSK_HORIZON = new THREE.Color(0x7c5cc4); // violet dusk glow
const NIGHT_HORIZON = new THREE.Color(0x4a3a7e); // cool violet haze at night
const DUSK_BOTTOM = new THREE.Color(0x3a2b5a); // muted plum ground haze
const NIGHT_BOTTOM = new THREE.Color(0x1a1530);
const BLOOD = new THREE.Color(0xc0392b);
const BLOOD_HORIZON = new THREE.Color(0xe0562e); // molten vermilion band

// Moon tints.
const DUSK_MOON = new THREE.Color(0xffd9a0); // warm harvest moon at dusk
const NIGHT_MOON = new THREE.Color(0xbcd2ff); // cold moon at midnight

// Rim/accent light: warm amber at dusk, cools slightly but stays warm.
const DUSK_RIM = new THREE.Color(0xffa24d);
const NIGHT_RIM = new THREE.Color(0xd98a66);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Map the soonest upcoming due date to a 0..1 "nightness":
 *  - no upcoming due date → 0 (calm dusk)
 *  - due > 7 days away → ~0.1
 *  - due now / overdue → 1 (deep night)
 */
function nightness(store: SeanceStore, now: number): number {
  const tasks = store.getState().tasks.filter((t) => t.status === 'active' && t.dueDate);
  if (tasks.length === 0) return 0;
  let soonest = Infinity;
  for (const t of tasks) {
    const due = Date.parse(t.dueDate!);
    if (!Number.isNaN(due)) soonest = Math.min(soonest, due - now);
  }
  if (!Number.isFinite(soonest)) return 0;
  const days = soonest / DAY_MS;
  if (days <= 0) return 1; // due or overdue → midnight
  // 7 days → ~0.1, 0 days → 1 (smooth)
  return THREE.MathUtils.clamp(1 - days / 7, 0, 1);
}

export function createWorld(deps: WorldDeps): World {
  // The moon mesh — emissive sphere high in the sky.
  const moonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0xeef2ff),
    emissiveIntensity: 2.2,
    fog: false,
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 20), moonMat);
  moon.position.set(-12, 13, -34);
  deps.scene.add(moon);

  // Reusable scratch colours (avoid per-frame allocation).
  const cTop = new THREE.Color();
  const cHorizon = new THREE.Color();
  const cBottom = new THREE.Color();
  const cMoon = new THREE.Color();
  const cRim = new THREE.Color();

  // Eased live values.
  let night = 0;
  let blood = 0; // 0..1 blend toward blood moon
  let fogTarget = deps.fog.density;

  function update(store: SeanceStore, dt: number): void {
    const now = Date.now();
    const targetNight = nightness(store, now);
    const overdue = countOverdue(store.getState().tasks, now);
    const targetBlood = overdue >= BLOOD_MOON_THRESHOLD ? 1 : 0;
    // Fog: base 0.02, +0.008 per overdue task, capped so stones stay visible.
    fogTarget = THREE.MathUtils.clamp(0.02 + overdue * 0.008, 0.02, 0.085);

    const k = Math.min(1, dt * 1.5);
    night += (targetNight - night) * k;
    blood += (targetBlood - blood) * k;
    deps.fog.density += (fogTarget - deps.fog.density) * k;

    // --- sky dome gradient: dusk → night, then tinted toward blood ---
    cTop.copy(DUSK_TOP).lerp(NIGHT_TOP, night).lerp(BLOOD, blood * 0.35);
    cHorizon.copy(DUSK_HORIZON).lerp(NIGHT_HORIZON, night).lerp(BLOOD_HORIZON, blood);
    cBottom.copy(DUSK_BOTTOM).lerp(NIGHT_BOTTOM, night).lerp(BLOOD, blood * 0.25);
    deps.sky.top.copy(cTop);
    deps.sky.horizon.copy(cHorizon);
    deps.sky.bottom.copy(cBottom);
    deps.sky.sync();
    deps.sky.tick(dt);

    // Fog matches the horizon band so distant graves melt into the glow.
    deps.fog.color.copy(cHorizon);

    // Moon colour + glow: warm harvest at dusk → cold at midnight → red backlog.
    cMoon.copy(DUSK_MOON).lerp(NIGHT_MOON, night).lerp(BLOOD, blood);
    (moon.material as THREE.MeshStandardMaterial).emissive.copy(cMoon);
    (moon.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 + blood * 1.0;

    // Moonlight: cool key light, dims a little as night deepens, reddens on blood.
    deps.moonLight.color.copy(cMoon);
    deps.moonLight.intensity = 1.9 - night * 0.35 + blood * 0.2;

    // Warm rim/accent light — the complementary counterpoint. Strengthens a
    // touch toward blood moon so silhouettes stay separated from the red sky.
    cRim.copy(DUSK_RIM).lerp(NIGHT_RIM, night).lerp(BLOOD_HORIZON, blood * 0.6);
    deps.rimLight.color.copy(cRim);
    deps.rimLight.intensity = 1.0 + blood * 0.4;

    deps.hemiLight.intensity = 1.05 - night * 0.2;
  }

  function dispose(): void {
    deps.scene.remove(moon);
    moon.geometry.dispose();
    (moon.material as THREE.Material).dispose();
  }

  return { moon, update, dispose };
}

export { BLOOD_MOON_THRESHOLD };
