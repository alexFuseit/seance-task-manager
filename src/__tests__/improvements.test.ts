/**
 * Tests for the improvements pass: persistence diffing, validation errors,
 * motion preference, import merge, legacy-field migration, and the pure
 * graveyard helpers (atmosphere targets, grave visual mapping, layout).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSeanceStore, TaskValidationError } from '../store/task-store';
import { STORAGE_KEY, emptyState, resolveReducedMotion, type Task } from '../model/types';
import { parseAppState, parseTask } from '../model/validation';
import {
  BLOOD_MOON_THRESHOLD,
  FOG_MAX,
  FOG_MIN,
  atmosphereTargets,
  fogDensityFor,
  nightness,
} from '../model/atmosphere';
import { layoutPosition, plotsPerRow, signature, visualOf, yardBounds, PLOTS_PER_ROW } from '../three/grave-visual';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-20T12:00:00Z');

function task(partial: Partial<Task> = {}): Task {
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title ?? 'Task',
    priority: partial.priority ?? 'medium',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? new Date(NOW).toISOString(),
    ...(partial.dueDate ? { dueDate: partial.dueDate } : {}),
    ...(partial.notes ? { notes: partial.notes } : {}),
  };
}

const iso = (ms: number) => new Date(NOW + ms).toISOString();

describe('persistence diffing', () => {
  const setItem = vi.fn();
  beforeEach(() => {
    setItem.mockReset();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem,
      removeItem: () => {},
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does not write on view-only changes (search, filter, sort)', () => {
    const store = createSeanceStore(emptyState());
    store.getState().setFilter({ search: 'g' });
    store.getState().setFilter({ search: 'gh' });
    store.getState().setFilter({ status: 'active' });
    store.getState().setSort('title', 'asc');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('writes on task and settings changes', () => {
    const store = createSeanceStore(emptyState());
    store.getState().addTask({ title: 'Persist me' });
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0]![0]).toBe(STORAGE_KEY);
    store.getState().updateSettings({ quality: 'low' });
    expect(setItem).toHaveBeenCalledTimes(2);
  });

  it('skips no-op settings updates', () => {
    const store = createSeanceStore(emptyState());
    store.getState().updateSettings({ quality: 'high' }); // already high
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('task validation errors', () => {
  it('updateTask rejects an empty title instead of silently ignoring it', () => {
    const store = createSeanceStore(emptyState());
    const t = store.getState().addTask({ title: 'Original' });
    expect(() => store.getState().updateTask(t.id, { title: '   ' })).toThrow(TaskValidationError);
    expect(store.getState().tasks[0]?.title).toBe('Original');
  });

  it('addTask throws a TaskValidationError for empty titles', () => {
    const store = createSeanceStore(emptyState());
    expect(() => store.getState().addTask({ title: '' })).toThrow(TaskValidationError);
  });
});

describe('motion preference', () => {
  it('resolves system / reduce / full', () => {
    expect(resolveReducedMotion('system', true)).toBe(true);
    expect(resolveReducedMotion('system', false)).toBe(false);
    expect(resolveReducedMotion('reduce', false)).toBe(true);
    expect(resolveReducedMotion('full', true)).toBe(false);
  });

  it('an explicit choice survives OS preference changes', () => {
    const store = createSeanceStore(emptyState());
    store.getState().setSystemReducedMotion(true);
    expect(store.getState().settings.reducedMotion).toBe(true);

    store.getState().setMotionPreference('full');
    expect(store.getState().settings.reducedMotion).toBe(false);
    store.getState().setSystemReducedMotion(true);
    expect(store.getState().settings.reducedMotion).toBe(false);

    store.getState().setMotionPreference('system');
    expect(store.getState().settings.reducedMotion).toBe(true);
  });

  it('legacy settings without `motion` default to following the system', () => {
    const s = parseAppState({ tasks: [], settings: { reducedMotion: true } });
    expect(s.settings.motion).toBe('system');
  });
});

describe('import merge', () => {
  it('adds only tasks with new ids', () => {
    const store = createSeanceStore(emptyState());
    const a = store.getState().addTask({ title: 'Keep' });
    const added = store.getState().mergeTasks([
      task({ id: a.id, title: 'Duplicate id' }),
      task({ title: 'Brand new' }),
    ]);
    expect(added).toBe(1);
    const titles = store.getState().tasks.map((t) => t.title).sort();
    expect(titles).toEqual(['Brand new', 'Keep']);
  });
});

describe('legacy payload migration', () => {
  it('drops the obsolete `plot` field', () => {
    const t = parseTask({ title: 'Old grave', plot: { x: 3, z: -2 } });
    expect(t).not.toBeNull();
    expect('plot' in (t as object)).toBe(false);
  });
});

describe('atmosphere (Requirement 5)', () => {
  it('nightness is 0 with no due dates and 1 when something is due/overdue', () => {
    expect(nightness([task()], NOW)).toBe(0);
    expect(nightness([task({ dueDate: iso(-HOUR) })], NOW)).toBe(1);
    expect(nightness([task({ dueDate: iso(14 * DAY) })], NOW)).toBe(0);
    const mid = nightness([task({ dueDate: iso(3.5 * DAY) })], NOW);
    expect(mid).toBeCloseTo(0.5, 5);
  });

  it('ignores completed tasks when computing nightness', () => {
    expect(nightness([task({ status: 'completed', dueDate: iso(-DAY) })], NOW)).toBe(0);
  });

  it('fog scales with overdue count and is clamped', () => {
    expect(fogDensityFor(0)).toBe(FOG_MIN);
    expect(fogDensityFor(2)).toBeGreaterThan(fogDensityFor(1));
    expect(fogDensityFor(100)).toBe(FOG_MAX);
  });

  it('blood moon rises at the overdue threshold', () => {
    const overdue = (n: number) =>
      Array.from({ length: n }, () => task({ dueDate: iso(-DAY) }));
    expect(atmosphereTargets(overdue(BLOOD_MOON_THRESHOLD - 1), NOW).blood).toBe(0);
    expect(atmosphereTargets(overdue(BLOOD_MOON_THRESHOLD), NOW).blood).toBe(1);
  });
});

describe('grave visual mapping (Requirement 4)', () => {
  it('derives due state and search match', () => {
    const t = task({ title: 'Haunted house', dueDate: iso(2 * HOUR) });
    const v = visualOf(t, 'HAUNT', NOW);
    expect(v.due).toBe('soon');
    expect(v.searchActive).toBe(true);
    expect(v.searchMatch).toBe(true);
    expect(visualOf(t, 'lawn', NOW).searchMatch).toBe(false);
    expect(visualOf(t, '  ', NOW).searchActive).toBe(false);
  });

  it('signature changes exactly when the visual changes', () => {
    const t = task({ priority: 'high' });
    const a = signature(visualOf(t, '', NOW));
    expect(signature(visualOf(t, '', NOW))).toBe(a);
    expect(signature(visualOf({ ...t, priority: 'low' }, '', NOW))).not.toBe(a);
    expect(signature(visualOf({ ...t, status: 'completed' }, '', NOW))).not.toBe(a);
    expect(signature(visualOf(t, 'x', NOW))).not.toBe(a);
  });
});

describe('graveyard layout', () => {
  it('is deterministic per index', () => {
    expect(layoutPosition(7)).toEqual(layoutPosition(7));
  });

  it('recedes away from the camera row by row', () => {
    const firstRow = layoutPosition(0).z;
    const secondRow = layoutPosition(PLOTS_PER_ROW).z;
    expect(secondRow).toBeLessThan(firstRow);
  });

  it('keeps graves apart (no two plots within 2 units in the first 100)', () => {
    const pts = Array.from({ length: 100 }, (_, i) => layoutPosition(i));
    let minD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z);
        minD = Math.min(minD, d);
      }
    }
    expect(minD).toBeGreaterThan(2);
  });

  it('yard bounds contain every plot', () => {
    for (const n of [1, 7, 100]) {
      const b = yardBounds(n, 0.7); // just above the ±0.6 jitter
      for (let i = 0; i < n; i++) {
        const p = layoutPosition(i, plotsPerRow(n));
        expect(p.x).toBeGreaterThanOrEqual(b.minX);
        expect(p.x).toBeLessThanOrEqual(b.maxX);
        expect(p.z).toBeGreaterThanOrEqual(b.minZ);
        expect(p.z).toBeLessThanOrEqual(b.maxZ);
      }
    }
  });
});
