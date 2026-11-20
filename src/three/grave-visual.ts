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
/** Narrowest row (small yards keep the original 5-wide framing). */
export const PLOTS_PER_ROW = 5;
/** Widest row: 100 graves become a roughly square 10×10 yard. */
export const MAX_PLOTS_PER_ROW = 10;

/** Row width for a yard of `count` graves — grows so big yards stay square-ish. */
export function plotsPerRow(count: number): number {
  return Math.min(MAX_PLOTS_PER_ROW, Math.max(PLOTS_PER_ROW, Math.ceil(Math.sqrt(count))));
}

/**
 * A grave's plot from its index in the *sorted visible* list: a staggered
 * field receding from the camera with a small deterministic jitter so the yard
 * feels natural (not a rigid grid). Index-seeded, so positions are stable
 * between renders; the reconciler eases graves toward new plots on re-sort.
 * `perRow` comes from plotsPerRow(visibleCount).
 */
export function layoutPosition(index: number, perRow = PLOTS_PER_ROW): { x: number; z: number } {
  const row = Math.floor(index / perRow);
  const col = index % perRow;
  const offset = (row % 2) * (PLOT_SPACING / 2); // brick-stagger alternate rows
  const jitterX = (fract(Math.sin(index * 12.9898) * 43758.5453) - 0.5) * 1.2;
  const jitterZ = (fract(Math.sin(index * 78.233) * 12543.4523) - 0.5) * 1.2;
  return {
    x: (col - (perRow - 1) / 2) * PLOT_SPACING + offset + jitterX,
    z: -row * PLOT_SPACING + jitterZ,
  };
}

function fract(v: number): number {
  return v - Math.floor(v);
}

export interface YardBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Ground-plane rectangle that contains every plot for `count` graves, padded
 * by `margin` — the camera target is clamped to it so the user can roam to
 * any grave but can't wander off into the empty void.
 */
export function yardBounds(count: number, margin = 4): YardBounds {
  const perRow = plotsPerRow(count);
  const rows = Math.max(1, Math.ceil(count / perRow));
  const halfW = ((perRow - 1) / 2) * PLOT_SPACING;
  return {
    // + half spacing for the brick stagger; jitter (±0.6) sits inside margin
    minX: -halfW - margin,
    maxX: halfW + (rows > 1 ? PLOT_SPACING / 2 : 0) + margin,
    minZ: -(rows - 1) * PLOT_SPACING - margin,
    maxZ: margin,
  };
}
