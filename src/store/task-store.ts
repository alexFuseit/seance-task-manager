/**
 * Séance task store — the single source of truth (per tech steering).
 *
 * Built on `zustand/vanilla` so both the DOM overlay and the Three.js
 * reconciler can `subscribe` without any framework coupling. Domain state
 * (tasks + settings) is persisted to localStorage whenever it changes;
 * view-only state (filter/sort/search) is never written.
 */
import { createStore } from 'zustand/vanilla';
import {
  type AppState,
  type MotionPref,
  type Priority,
  type Settings,
  type Task,
  resolveReducedMotion,
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

/** Settings the user may change directly (reducedMotion is derived). */
export type SettingsPatch = Partial<Omit<Settings, 'reducedMotion' | 'motion'>>;

/** View state (filter/sort) lives alongside the domain data but is not persisted. */
export interface ViewState {
  filter: FilterOptions;
  sortKey: SortKey;
  sortDir: SortDir;
  /** live OS `prefers-reduced-motion` value (feeds settings.reducedMotion). */
  systemReducedMotion: boolean;
}

export interface SeanceState extends AppState {
  view: ViewState;

  // --- CRUD ---
  addTask: (input: NewTaskInput) => Task;
  /** Throws if `patch.title` is provided but empty after trimming. */
  updateTask: (id: string, patch: TaskPatch) => void;
  completeTask: (id: string) => void;
  reopenTask: (id: string) => void;
  deleteTask: (id: string) => void;

  // --- settings ---
  updateSettings: (patch: SettingsPatch) => void;
  setMotionPreference: (pref: MotionPref) => void;
  setSystemReducedMotion: (reduced: boolean) => void;

  // --- view ---
  setFilter: (patch: Partial<FilterOptions>) => void;
  setSort: (key: SortKey, dir: SortDir) => void;

  // --- bulk / io ---
  replaceState: (next: AppState) => void;
  /** Add tasks whose ids are not already present; returns how many were added. */
  mergeTasks: (incoming: readonly Task[]) => number;
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

/** Validation error raised by store actions; the UI shows `message` to the user. */
export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

function withMotion(settings: Settings, system: boolean): Settings {
  const reducedMotion = resolveReducedMotion(settings.motion, system);
  return reducedMotion === settings.reducedMotion ? settings : { ...settings, reducedMotion };
}

export function createSeanceStore(initial: AppState = loadState()) {
  const store = createStore<SeanceState>((set, get) => ({
    ...initial,
    view: {
      filter: defaultFilter(),
      sortKey: 'created',
      sortDir: 'desc',
      systemReducedMotion: false,
    },

    addTask(input) {
      const title = input.title.trim();
      if (title.length === 0) {
        throw new TaskValidationError('Task title is required');
      }
      const now = new Date().toISOString();
      const task: Task = {
        id: crypto.randomUUID(),
        title,
        priority: input.priority ?? 'medium',
        status: 'active',
        createdAt: now,
      };
      if (input.notes && input.notes.trim().length > 0) task.notes = input.notes.trim();
      if (input.dueDate) task.dueDate = input.dueDate;

      set((s) => ({ tasks: [...s.tasks, task] }));
      return task;
    },

    updateTask(id, patch) {
      if (patch.title !== undefined && patch.title.trim().length === 0) {
        throw new TaskValidationError('Task title is required');
      }
      set((s) => ({
        tasks: s.tasks.map((t) => {
          if (t.id !== id) return t;
          const next: Task = { ...t };
          if (patch.title !== undefined) next.title = patch.title.trim();
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
      const cur = get().settings;
      const changed = (Object.keys(patch) as (keyof SettingsPatch)[]).some(
        (k) => patch[k] !== undefined && patch[k] !== cur[k],
      );
      if (!changed) return; // avoid a no-op persist + re-render
      set((s) => ({ settings: { ...s.settings, ...patch } }));
    },

    setMotionPreference(pref) {
      const s = get();
      if (s.settings.motion === pref) return;
      set({ settings: withMotion({ ...s.settings, motion: pref }, s.view.systemReducedMotion) });
    },

    setSystemReducedMotion(reduced) {
      const s = get();
      const settings = withMotion(s.settings, reduced);
      if (reduced === s.view.systemReducedMotion && settings === s.settings) return;
      set({ view: { ...s.view, systemReducedMotion: reduced }, settings });
    },

    setFilter(patch) {
      set((s) => ({ view: { ...s.view, filter: { ...s.view.filter, ...patch } } }));
    },

    setSort(key, dir) {
      set((s) => ({ view: { ...s.view, sortKey: key, sortDir: dir } }));
    },

    replaceState(next) {
      set((s) => ({
        schemaVersion: next.schemaVersion,
        tasks: next.tasks,
        settings: withMotion(next.settings, s.view.systemReducedMotion),
      }));
    },

    mergeTasks(incoming) {
      const ids = new Set(get().tasks.map((t) => t.id));
      const fresh = incoming.filter((t) => !ids.has(t.id));
      if (fresh.length > 0) set((s) => ({ tasks: [...s.tasks, ...fresh] }));
      return fresh.length;
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

  // Persist only on domain changes. View-only churn (search keystrokes,
  // filter/sort changes) leaves `tasks`/`settings` referentially unchanged
  // because every action replaces only the slices it touches.
  store.subscribe((state, prev) => {
    if (
      state.tasks === prev.tasks &&
      state.settings === prev.settings &&
      state.schemaVersion === prev.schemaVersion
    ) {
      return;
    }
    saveState({
      schemaVersion: state.schemaVersion,
      tasks: state.tasks,
      settings: state.settings,
    });
  });

  return store;
}

export type SeanceStore = ReturnType<typeof createSeanceStore>;
