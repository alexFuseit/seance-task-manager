/**
 * Pure (Three.js-free) helpers for the graveyard: how a task maps to its grave
 * visual state, the change signature used to skip redundant updates, and the
 * deterministic plot layout. Kept separate so they are unit-testable in Node.
 */
import { type Priority, type Status, type Task } from '../model/types';
import { type DueState, dueState, matchesSearch } from '../model/query';

export interface GraveVisual {
  priority: Priority;
  status: Status;
  due: DueState;
  /** matches the active search term (false when no search is active). */
  searchMatch: boolean;
  /** a search term is currently active (so non-matches should dim). */
  searchActive: boolean;
}

/** Derive a grave's visual state from its task and the live search term. */
export function visualOf(task: Task, search: string, now: number = Date.now()): GraveVisual {
  const searchActive = search.trim().length > 0;
  return {
    priority: task.priority,
    status: task.status,
    due: dueState(task, now),
    searchActive,
    searchMatch: searchActive ? matchesSearch(task, search) : false,
  };
}

/** Compact signature of a visual state; equal signatures need no update. */
export function signature(v: GraveVisual): string {
  return `${v.priority}|${v.status}|${v.due}|${v.searchActive ? 1 : 0}|${v.searchMatch ? 1 : 0}`;
}

export const PLOT_SPACING = 4.2;
export const PLOTS_PER_ROW = 5;

/**
 * A grave's plot from its index in the *sorted visible* list: a staggered
 * field receding from the camera with a small deterministic jitter so the yard
 * feels natural (not a rigid grid). Index-seeded, so positions are stable
 * between renders; the reconciler eases graves toward new plots on re-sort.
 */
export function layoutPosition(index: number): { x: number; z: number } {
  const row = Math.floor(index / PLOTS_PER_ROW);
  const col = index % PLOTS_PER_ROW;
  const offset = (row % 2) * (PLOT_SPACING / 2); // brick-stagger alternate rows
  const jitterX = (fract(Math.sin(index * 12.9898) * 43758.5453) - 0.5) * 1.2;
  const jitterZ = (fract(Math.sin(index * 78.233) * 12543.4523) - 0.5) * 1.2;
  return {
    x: (col - (PLOTS_PER_ROW - 1) / 2) * PLOT_SPACING + offset + jitterX,
    z: -row * PLOT_SPACING + jitterZ,
  };
}

function fract(v: number): number {
  return v - Math.floor(v);
}
