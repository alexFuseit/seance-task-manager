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
import { BLOOD_MOON_THRESHOLD, atmosphereTargets } from '../model/atmosphere';

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
  /** ease toward the workload; returns true while still transitioning. */
  update: (store: SeanceStore, dt: number) => boolean;
  dispose: () => void;
}

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

  const EPS = 0.0005;
  // True once the colours have been pushed for a settled state, so repeated
  // idle frames skip the (cheap but pointless) colour writes.
  let settled = false;

  /**
   * Ease the atmosphere toward the current workload targets. Returns true
   * while still transitioning (so the caller can keep the loop at full rate),
   * false once settled — letting the render loop drop to its idle rate.
   */
  function update(store: SeanceStore, dt: number): boolean {
    const t = atmosphereTargets(store.getState().tasks, Date.now());

    const k = Math.min(1, dt * 1.5);
    const dNight = t.night - night;
    const dBlood = t.blood - blood;
    const dFog = t.fog - deps.fog.density;
    const easing = Math.abs(dNight) > EPS || Math.abs(dBlood) > EPS || Math.abs(dFog) > EPS * 0.1;
    night = Math.abs(dNight) > EPS ? night + dNight * k : t.night;
    blood = Math.abs(dBlood) > EPS ? blood + dBlood * k : t.blood;
    deps.fog.density = Math.abs(dFog) > EPS * 0.1 ? deps.fog.density + dFog * k : t.fog;

    // The starfield twinkles regardless; it is cheap and fine at idle rate.
    deps.sky.tick(dt);
    if (!easing && settled) return false;
    settled = !easing;

    // --- sky dome gradient: dusk → night, then tinted toward blood ---
    cTop.copy(DUSK_TOP).lerp(NIGHT_TOP, night).lerp(BLOOD, blood * 0.35);
    cHorizon.copy(DUSK_HORIZON).lerp(NIGHT_HORIZON, night).lerp(BLOOD_HORIZON, blood);
    cBottom.copy(DUSK_BOTTOM).lerp(NIGHT_BOTTOM, night).lerp(BLOOD, blood * 0.25);
    deps.sky.top.copy(cTop);
    deps.sky.horizon.copy(cHorizon);
    deps.sky.bottom.copy(cBottom);
    deps.sky.sync();

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
    return easing;
  }

  function dispose(): void {
    deps.scene.remove(moon);
    moon.geometry.dispose();
    (moon.material as THREE.Material).dispose();
  }

  return { moon, update, dispose };
}

export { BLOOD_MOON_THRESHOLD };
