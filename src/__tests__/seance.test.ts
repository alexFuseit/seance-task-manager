import { describe, it, expect, beforeEach } from 'vitest';
import { parseTask, parseAppState, parseImport } from '../model/validation';
import {
  dueState,
  isOverdue,
  isDueSoon,
  countOverdue,
  filterTasks,
  sortTasks,
  defaultFilter,
} from '../model/query';
import { createSeanceStore } from '../store/task-store';
import { emptyState, type Task } from '../model/types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function mkTask(partial: Partial<Task> = {}): Task {
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title ?? 'Task',
    priority: partial.priority ?? 'medium',
    status: partial.status ?? 'active',
    createdAt: partial.createdAt ?? new Date().toISOString(),
    plot: partial.plot ?? { x: 0, z: 0 },
    ...(partial.dueDate ? { dueDate: partial.dueDate } : {}),
    ...(partial.notes ? { notes: partial.notes } : {}),
    ...(partial.completedAt ? { completedAt: partial.completedAt } : {}),
  };
}

describe('validation.parseTask', () => {
  it('rejects objects without a title', () => {
    expect(parseTask({ priority: 'high' })).toBeNull();
    expect(parseTask({ title: '   ' })).toBeNull();
    expect(parseTask(null)).toBeNull();
    expect(parseTask(42)).toBeNull();
  });

  it('coerces invalid priority/status to defaults', () => {
    const t = parseTask({ title: 'x', priority: 'urgent', status: 'weird' });
    expect(t?.priority).toBe('medium');
    expect(t?.status).toBe('active');
  });

  it('keeps valid fields and generates an id when missing', () => {
    const t = parseTask({ title: '  Hello  ', priority: 'high' });
    expect(t?.title).toBe('Hello');
    expect(t?.priority).toBe('high');
    expect(typeof t?.id).toBe('string');
    expect(t?.id.length).toBeGreaterThan(0);
  });
});

describe('validation.parseAppState', () => {
  it('returns empty state for garbage input', () => {
    expect(parseAppState(undefined).tasks).toEqual([]);
    expect(parseAppState('nope').tasks).toEqual([]);
  });

  it('drops invalid tasks but keeps valid ones', () => {
    const state = parseAppState({
      tasks: [{ title: 'ok' }, { nope: true }, { title: '' }],
    });
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.title).toBe('ok');
  });
});

describe('validation.parseImport', () => {
  it('accepts a bare array of tasks', () => {
    const state = parseImport(JSON.stringify([{ title: 'a' }, { title: 'b' }]));
    expect(state.tasks).toHaveLength(2);
  });

  it('throws on hard JSON errors', () => {
    expect(() => parseImport('{not json')).toThrow();
  });
});

describe('query due-state', () => {
  const now = Date.now();
  it('classifies overdue / soon / upcoming / none', () => {
    expect(dueState(mkTask({ dueDate: new Date(now - DAY).toISOString() }), now)).toBe('overdue');
    expect(dueState(mkTask({ dueDate: new Date(now + HOUR).toISOString() }), now)).toBe('soon');
    expect(dueState(mkTask({ dueDate: new Date(now + 3 * DAY).toISOString() }), now)).toBe('upcoming');
    expect(dueState(mkTask({}), now)).toBe('none');
  });

  it('isOverdue/isDueSoon ignore completed tasks', () => {
    const overdueDone = mkTask({ dueDate: new Date(now - DAY).toISOString(), status: 'completed' });
    expect(isOverdue(overdueDone, now)).toBe(false);
    const soon = mkTask({ dueDate: new Date(now + HOUR).toISOString() });
    expect(isDueSoon(soon, now)).toBe(true);
  });

  it('countOverdue counts only active overdue tasks', () => {
    const tasks = [
      mkTask({ dueDate: new Date(now - DAY).toISOString() }),
      mkTask({ dueDate: new Date(now - 2 * DAY).toISOString() }),
      mkTask({ dueDate: new Date(now - DAY).toISOString(), status: 'completed' }),
      mkTask({}),
    ];
    expect(countOverdue(tasks, now)).toBe(2);
  });
});

describe('query filter/sort', () => {
  const now = Date.now();
  const tasks = [
    mkTask({ title: 'Alpha', priority: 'low', createdAt: new Date(now - 3 * DAY).toISOString() }),
    mkTask({ title: 'Bravo', priority: 'high', dueDate: new Date(now - DAY).toISOString() }),
    mkTask({ title: 'Charlie', priority: 'medium', status: 'completed' }),
  ];

  it('filters by status overdue', () => {
    const r = filterTasks(tasks, { ...defaultFilter(), status: 'overdue' }, now);
    expect(r.map((t) => t.title)).toEqual(['Bravo']);
  });

  it('filters by search across title', () => {
    const r = filterTasks(tasks, { ...defaultFilter(), search: 'char' }, now);
    expect(r.map((t) => t.title)).toEqual(['Charlie']);
  });

  it('sorts by priority ascending (low first)', () => {
    const r = sortTasks(tasks, 'priority', 'asc');
    expect(r.map((t) => t.priority)).toEqual(['low', 'medium', 'high']);
  });

  it('sorts by title descending', () => {
    const r = sortTasks(tasks, 'title', 'desc');
    expect(r.map((t) => t.title)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });
});

describe('task store', () => {
  let store: ReturnType<typeof createSeanceStore>;
  beforeEach(() => {
    store = createSeanceStore(emptyState());
  });

  it('adds a task and rejects empty titles', () => {
    const t = store.getState().addTask({ title: 'Write spec' });
    expect(store.getState().tasks).toHaveLength(1);
    expect(t.status).toBe('active');
    expect(() => store.getState().addTask({ title: '   ' })).toThrow();
  });

  it('completes and reopens a task', () => {
    const t = store.getState().addTask({ title: 'Bury it' });
    store.getState().completeTask(t.id);
    expect(store.getState().tasks[0]?.status).toBe('completed');
    expect(store.getState().tasks[0]?.completedAt).toBeDefined();
    store.getState().reopenTask(t.id);
    expect(store.getState().tasks[0]?.status).toBe('active');
    expect(store.getState().tasks[0]?.completedAt).toBeUndefined();
  });

  it('updates fields and can clear notes/dueDate', () => {
    const t = store.getState().addTask({ title: 'Edit me', dueDate: '2026-12-31' });
    store.getState().updateTask(t.id, { notes: 'a note', priority: 'high' });
    expect(store.getState().tasks[0]?.notes).toBe('a note');
    expect(store.getState().tasks[0]?.priority).toBe('high');
    store.getState().updateTask(t.id, { notes: '', dueDate: undefined });
    expect(store.getState().tasks[0]?.notes).toBeUndefined();
    expect(store.getState().tasks[0]?.dueDate).toBeUndefined();
  });

  it('deletes a task', () => {
    const t = store.getState().addTask({ title: 'Remove me' });
    store.getState().deleteTask(t.id);
    expect(store.getState().tasks).toHaveLength(0);
  });

  it('round-trips through export/import JSON', () => {
    store.getState().addTask({ title: 'One', priority: 'high' });
    store.getState().addTask({ title: 'Two' });
    const json = store.getState().exportJson();

    const fresh = createSeanceStore(emptyState());
    fresh.getState().importJson(json);
    expect(fresh.getState().tasks).toHaveLength(2);
    expect(fresh.getState().tasks.map((t) => t.title).sort()).toEqual(['One', 'Two']);
  });

  it('visibleTasks hides completed when showCompleted is false', () => {
    const a = store.getState().addTask({ title: 'Active one' });
    const b = store.getState().addTask({ title: 'Done one' });
    store.getState().completeTask(b.id);
    store.getState().updateSettings({ showCompleted: false });
    const visible = store.getState().visibleTasks();
    expect(visible.map((t) => t.id)).toEqual([a.id]);
  });
});
