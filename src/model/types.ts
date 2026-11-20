/**
 * Séance data model — the canonical task shape and app state.
 *
 * This module has NO DOM or Three.js imports (per structure steering): it is
 * pure data + validation, which makes it the easiest layer to unit-test.
 */

export type Priority = 'low' | 'medium' | 'high';
export type Status = 'active' | 'completed';
export type Quality = 'high' | 'medium' | 'low';
/** User's motion preference; 'system' follows `prefers-reduced-motion`. */
export type MotionPref = 'system' | 'reduce' | 'full';

/** The current persisted schema version. Bump when the shape changes. */
export const SCHEMA_VERSION = 1;

/** localStorage key for the persisted app state. */
export const STORAGE_KEY = 'seance.state.v1';

export interface Task {
  /** uuid */
  id: string;
  /** epitaph — required, non-empty */
  title: string;
  notes?: string;
  priority: Priority;
  /** ISO date string, optional */
  dueDate?: string;
  status: Status;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp, set when completed */
  completedAt?: string;
}

export interface Settings {
  quality: Quality;
  muted: boolean;
  /** the user's explicit choice (or 'system' to follow the OS). */
  motion: MotionPref;
  /**
   * Effective reduced-motion flag, resolved from `motion` + the OS preference
   * (see resolveReducedMotion). Read this everywhere; never set it directly.
   */
  reducedMotion: boolean;
  showCompleted: boolean;
}

export interface AppState {
  schemaVersion: number;
  tasks: Task[];
  settings: Settings;
}

export const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high'];
export const STATUSES: readonly Status[] = ['active', 'completed'];

/** Numeric weight for sorting by priority (high first). */
export const PRIORITY_RANK: Record<Priority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function defaultSettings(): Settings {
  return {
    quality: 'high',
    muted: true,
    motion: 'system',
    reducedMotion: false,
    showCompleted: true,
  };
}

/** Resolve the effective reduced-motion flag from the preference + OS setting. */
export function resolveReducedMotion(pref: MotionPref, systemPrefersReduced: boolean): boolean {
  if (pref === 'reduce') return true;
  if (pref === 'full') return false;
  return systemPrefersReduced;
}

export function emptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    settings: defaultSettings(),
  };
}
