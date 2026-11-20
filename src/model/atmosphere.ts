/**
 * Pure mapping from task state to world atmosphere (Requirement 5). Kept free of
 * Three.js so the "mood tracks the workload" rules are unit-testable; the 3D
 * world module (three/world.ts) eases its lights/fog/sky toward these targets.
 */
import { type Task } from './types';
import { countOverdue } from './query';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Overdue count at which the blood moon rises (Requirement 5.3). */
export const BLOOD_MOON_THRESHOLD = 3;

/** Fog density bounds (Requirement 5.2). Capped so the far side of a full
 *  (~100-grave) yard still reads through the haze instead of vanishing. */
export const FOG_MIN = 0.02;
export const FOG_MAX = 0.045;
export const FOG_PER_OVERDUE = 0.004;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Map the soonest upcoming due date to a 0..1 "nightness":
 *  - no active task with a due date → 0 (calm dusk)
 *  - due 7+ days away → 0
 *  - due now / overdue → 1 (deep night)
 */
export function nightness(tasks: readonly Task[], now: number): number {
  let soonest = Infinity;
  for (const t of tasks) {
    if (t.status !== 'active' || !t.dueDate) continue;
    const due = Date.parse(t.dueDate);
    if (!Number.isNaN(due)) soonest = Math.min(soonest, due - now);
  }
  if (!Number.isFinite(soonest)) return 0;
  const days = soonest / DAY_MS;
  if (days <= 0) return 1;
  return clamp01(1 - days / 7);
}

/** Target fog density for a given overdue count. */
export function fogDensityFor(overdue: number): number {
  return Math.min(FOG_MAX, Math.max(FOG_MIN, FOG_MIN + overdue * FOG_PER_OVERDUE));
}

export interface AtmosphereTargets {
  night: number;
  blood: number;
  fog: number;
  overdue: number;
}

/** All atmosphere targets for the current task set. */
export function atmosphereTargets(tasks: readonly Task[], now: number): AtmosphereTargets {
  const overdue = countOverdue(tasks, now);
  return {
    night: nightness(tasks, now),
    blood: overdue >= BLOOD_MOON_THRESHOLD ? 1 : 0,
    fog: fogDensityFor(overdue),
    overdue,
  };
}
