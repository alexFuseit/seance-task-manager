/**
 * Séance data model — the canonical task shape and app state.
 *
 * This module has NO DOM or Three.js imports (per structure steering): it is
 * pure data + validation, which makes it the easiest layer to unit-test.
 */

export type Priority = 'low' | 'medium' | 'high';
export type Status = 'active' | 'completed';
export type Quality = 'high' | 'medium' | 'low';

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
  /** grave position in the yard */
  plot: { x: number; z: number };
}

export interface Settings {
  quality: Quality;
  muted: boolean;
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
    reducedMotion: false,
    showCompleted: true,
  };
}

export function emptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    settings: defaultSettings(),
  };
}
