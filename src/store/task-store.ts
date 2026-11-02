/**
 * Séance task store — the single source of truth (per tech steering).
 *
 * Built on `zustand/vanilla` so both the DOM overlay and the (future) Three.js
 * reconciler can `subscribe` without any framework coupling. State is persisted
 * to localStorage on every change.
 */
import { createStore } from 'zustand/vanilla';
import {
  type AppState,
  type Priority,
  type Settings,
  type Task,
} from '../model/types';
import {
  type FilterOptions,
  type SortDir,
  type SortKey,
  defaultFilter,
  queryTasks,
} from '../model/query';
import { loadState, saveState } from '../model/persistence';
import { parseImport } from '../model/validation';

/** Fields a user can supply when creating a task. */
export interface NewTaskInput {
  title: string;
  notes?: string;
  priority?: Priority;
  dueDate?: string;
}

/** Fields that can be edited on an existing task. */
export type TaskPatch = Partial<
  Pick<Task, 'title' | 'notes' | 'priority' | 'dueDate'>
>;

/** View state (filter/sort) lives alongside the domain data but is not persisted. */
export interface ViewState {
  filter: FilterOptions;
  sortKey: SortKey;
  sortDir: SortDir;
}

export interface SeanceState extends AppState {
  view: ViewState;

  // --- CRUD ---
  addTask: (input: NewTaskInput) => Task;
  updateTask: (id: string, patch: TaskPatch) => void;
  completeTask: (id: string) => void;
  reopenTask: (id: string) => void;
  deleteTask: (id: string) => void;

  // --- settings ---
  updateSettings: (patch: Partial<Settings>) => void;

  // --- view ---
  setFilter: (patch: Partial<FilterOptions>) => void;
  setSort: (key: SortKey, dir: SortDir) => void;

  // --- bulk / io ---
  replaceState: (next: AppState) => void;
  importJson: (json: string) => void;
  exportJson: () => string;

  // --- derived ---
  visibleTasks: () => Task[];
  /**
   * Like visibleTasks but WITHOUT the search filter applied — the 3D graveyard
   * dims non-matching graves rather than hiding them (Requirement 4.8), so it
   * needs the full filtered-but-not-searched set.
   */
  graveyardTasks: () => Task[];
}

/** Pick an unoccupied-ish plot on a simple spiral so graves don't all stack. */
function nextPlot(tasks: Task[]): { x: number; z: number } {
  const n = tasks.length;
  const ring = Math.floor(Math.sqrt(n));
  const idxInRing = n - ring * ring;
  const spacing = 2.5;
  return {
    x: (idxInRing - ring) * spacing,
    z: -ring * spacing,
  };
}

export function createSeanceStore(initial: AppState = loadState()) {
  const store = createStore<SeanceState>((set, get) => ({
    ...initial,
    view: {
      filter: defaultFilter(),
      sortKey: 'created',
      sortDir: 'desc',
    },

    addTask(input) {
      const title = input.title.trim();
      if (title.length === 0) {
        throw new Error('Task title is required');
      }
      const now = new Date().toISOString();
      const task: Task = {
        id: crypto.randomUUID(),
        title,
        priority: input.priority ?? 'medium',
        status: 'active',
        createdAt: now,
        plot: nextPlot(get().tasks),
      };
      if (input.notes && input.notes.trim().length > 0) task.notes = input.notes.trim();
      if (input.dueDate) task.dueDate = input.dueDate;

      set((s) => ({ tasks: [...s.tasks, task] }));
      return task;
    },

    updateTask(id, patch) {
      set((s) => ({
        tasks: s.tasks.map((t) => {
          if (t.id !== id) return t;
          const next: Task = { ...t };
          if (patch.title !== undefined) {
            const trimmed = patch.title.trim();
            if (trimmed.length > 0) next.title = trimmed;
          }
          if (patch.priority !== undefined) next.priority = patch.priority;
          // notes/dueDate can be cleared by passing '' / undefined
          if ('notes' in patch) {
            const n = patch.notes?.trim();
            if (n) next.notes = n;
            else delete next.notes;
          }
          if ('dueDate' in patch) {
            if (patch.dueDate) next.dueDate = patch.dueDate;
            else delete next.dueDate;
          }
          return next;
        }),
      }));
    },

    completeTask(id) {
      const now = new Date().toISOString();
      set((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, status: 'completed', completedAt: now } : t,
        ),
      }));
    },

    reopenTask(id) {
      set((s) => ({
        tasks: s.tasks.map((t) => {
          if (t.id !== id) return t;
          const next: Task = { ...t, status: 'active' };
          delete next.completedAt;
          return next;
        }),
      }));
    },

    deleteTask(id) {
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    },

    updateSettings(patch) {
      set((s) => ({ settings: { ...s.settings, ...patch } }));
    },

    setFilter(patch) {
      set((s) => ({ view: { ...s.view, filter: { ...s.view.filter, ...patch } } }));
    },

    setSort(key, dir) {
      set((s) => ({ view: { ...s.view, sortKey: key, sortDir: dir } }));
    },

    replaceState(next) {
      set(() => ({
        schemaVersion: next.schemaVersion,
        tasks: next.tasks,
        settings: next.settings,
      }));
    },

    importJson(json) {
      // Throws on hard JSON error — caller surfaces the message.
      const parsed = parseImport(json);
      get().replaceState(parsed);
    },

    exportJson() {
      const s = get();
      const snapshot: AppState = {
        schemaVersion: s.schemaVersion,
        tasks: s.tasks,
        settings: s.settings,
      };
      return JSON.stringify(snapshot, null, 2);
    },

    visibleTasks() {
      const s = get();
      const base = s.settings.showCompleted
        ? s.tasks
        : s.tasks.filter((t) => t.status !== 'completed');
      return queryTasks(base, s.view.filter, s.view.sortKey, s.view.sortDir);
    },

    graveyardTasks() {
      const s = get();
      const base = s.settings.showCompleted
        ? s.tasks
        : s.tasks.filter((t) => t.status !== 'completed');
      // Clear the search term so matches are highlighted (not filtered out).
      const filter = { ...s.view.filter, search: '' };
      return queryTasks(base, filter, s.view.sortKey, s.view.sortDir);
    },
  }));

  // Persist on every domain change (ignores view-only churn by snapshotting
  // the persisted shape only).
  store.subscribe((state) => {
    saveState({
      schemaVersion: state.schemaVersion,
      tasks: state.tasks,
      settings: state.settings,
    });
  });

  return store;
}

export type SeanceStore = ReturnType<typeof createSeanceStore>;
