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
import { countOverdue } from '../model/query';

export interface WorldDeps {
  scene: THREE.Scene;
  fog: THREE.FogExp2;
  moonLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
}

export interface World {
  moon: THREE.Mesh;
  update: (store: SeanceStore, dt: number) => void;
  dispose: () => void;
}

const BLOOD_MOON_THRESHOLD = 3; // overdue tasks

// Sky colours: dusk (calm) → midnight (tense).
const DUSK_SKY = new THREE.Color(0x2a2740);
const NIGHT_SKY = new THREE.Color(0x070910);
const DUSK_MOON = new THREE.Color(0xaecbe6);
const NIGHT_MOON = new THREE.Color(0x8fa8d8);
const BLOOD = new THREE.Color(0xc0392b);

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
    emissive: new THREE.Color(0xdfe8ff),
    emissiveIntensity: 1.2,
  });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 16), moonMat);
  moon.position.set(-14, 12, -38);
  deps.scene.add(moon);

  // Eased live values.
  let night = 0;
  let blood = 0; // 0..1 blend toward blood moon
  let fogTarget = deps.fog.density;

  function update(store: SeanceStore, dt: number): void {
    const now = Date.now();
    const targetNight = nightness(store, now);
    const overdue = countOverdue(store.getState().tasks, now);
    const targetBlood = overdue >= BLOOD_MOON_THRESHOLD ? 1 : 0;
    // Fog: base 0.03, +0.012 per overdue task, capped.
    fogTarget = THREE.MathUtils.clamp(0.03 + overdue * 0.012, 0.03, 0.14);

    const k = Math.min(1, dt * 1.5);
    night += (targetNight - night) * k;
    blood += (targetBlood - blood) * k;
    deps.fog.density += (fogTarget - deps.fog.density) * k;

    // Sky colour: dusk→night, then tinted toward blood.
    const sky = DUSK_SKY.clone().lerp(NIGHT_SKY, night).lerp(BLOOD, blood * 0.5);
    deps.scene.background = sky;
    deps.fog.color.copy(sky);

    // Moon colour + glow: cool normally, red for blood moon.
    const moonColor = DUSK_MOON.clone().lerp(NIGHT_MOON, night).lerp(BLOOD, blood);
    (moon.material as THREE.MeshStandardMaterial).emissive.copy(moonColor);
    (moon.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.0 + blood * 0.8;

    // Moonlight dims as night deepens, reddens on blood moon.
    deps.moonLight.color.copy(moonColor);
    deps.moonLight.intensity = 0.8 - night * 0.35 + blood * 0.15;
    deps.hemiLight.intensity = 0.5 - night * 0.25;
  }

  function dispose(): void {
    deps.scene.remove(moon);
    moon.geometry.dispose();
    (moon.material as THREE.Material).dispose();
  }

  return { moon, update, dispose };
}

export { BLOOD_MOON_THRESHOLD };
