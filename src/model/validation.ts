/**
 * Validation + migration for untrusted JSON.
 *
 * Used both when loading persisted state from localStorage (which may be
 * empty, corrupt, or from an older schema) and when importing a user-provided
 * JSON file. Everything coming in is treated as untrusted and coerced into a
 * known-good `AppState`; invalid tasks are dropped rather than crashing.
 */
import {
  type AppState,
  type Priority,
  type Settings,
  type Status,
  type Task,
  type Quality,
  SCHEMA_VERSION,
  defaultSettings,
  emptyState,
} from './types';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPriority(v: unknown): v is Priority {
  return v === 'low' || v === 'medium' || v === 'high';
}

function isStatus(v: unknown): v is Status {
  return v === 'active' || v === 'completed';
}

function isQuality(v: unknown): v is Quality {
  return v === 'high' || v === 'medium' || v === 'low';
}

function isIsoish(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

/** Coerce one untrusted value into a valid Task, or null if unrecoverable. */
export function parseTask(input: unknown): Task | null {
  if (!isObject(input)) return null;

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length === 0) return null; // title is required

  const id =
    typeof input.id === 'string' && input.id.length > 0 ? input.id : crypto.randomUUID();

  const priority: Priority = isPriority(input.priority) ? input.priority : 'medium';
  const status: Status = isStatus(input.status) ? input.status : 'active';
  const createdAt = isIsoish(input.createdAt)
    ? (input.createdAt as string)
    : new Date().toISOString();

  const plotRaw = isObject(input.plot) ? input.plot : undefined;
  const plot = {
    x: plotRaw && typeof plotRaw.x === 'number' ? plotRaw.x : 0,
    z: plotRaw && typeof plotRaw.z === 'number' ? plotRaw.z : 0,
  };

  const task: Task = {
    id,
    title,
    priority,
    status,
    createdAt,
    plot,
  };

  if (typeof input.notes === 'string' && input.notes.trim().length > 0) {
    task.notes = input.notes;
  }
  if (isIsoish(input.dueDate)) {
    task.dueDate = input.dueDate as string;
  }
  if (status === 'completed') {
    task.completedAt = isIsoish(input.completedAt)
      ? (input.completedAt as string)
      : createdAt;
  }

  return task;
}

function parseSettings(input: unknown): Settings {
  const base = defaultSettings();
  if (!isObject(input)) return base;
  return {
    quality: isQuality(input.quality) ? input.quality : base.quality,
    muted: typeof input.muted === 'boolean' ? input.muted : base.muted,
    reducedMotion:
      typeof input.reducedMotion === 'boolean' ? input.reducedMotion : base.reducedMotion,
    showCompleted:
      typeof input.showCompleted === 'boolean' ? input.showCompleted : base.showCompleted,
  };
}

/**
 * Migrate an older-schema payload to the current shape.
 * Currently only v1 exists; future versions add cases here.
 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  // Example future migration:
  // if (raw.schemaVersion === 0) { ...; raw.schemaVersion = 1; }
  return raw;
}

/**
 * Parse an untrusted value (from storage or an imported file) into a valid
 * AppState. Never throws: on any problem it returns a best-effort state,
 * falling back to empty.
 */
export function parseAppState(input: unknown): AppState {
  if (!isObject(input)) return emptyState();

  const migrated = migrate(input);

  const tasksRaw = Array.isArray(migrated.tasks) ? migrated.tasks : [];
  const tasks: Task[] = [];
  for (const t of tasksRaw) {
    const parsed = parseTask(t);
    if (parsed) tasks.push(parsed);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    tasks,
    settings: parseSettings(migrated.settings),
  };
}

/** Parse a JSON string safely. Returns emptyState() on any parse error. */
export function parseAppStateJson(json: string): AppState {
  try {
    return parseAppState(JSON.parse(json));
  } catch {
    return emptyState();
  }
}

/**
 * Parse an imported file. Accepts either a full AppState JSON object or a bare
 * array of tasks (the export format may evolve). Throws on hard JSON errors so
 * the UI can surface an "invalid file" message.
 */
export function parseImport(json: string): AppState {
  const data: unknown = JSON.parse(json); // may throw — caller handles
  if (Array.isArray(data)) {
    return parseAppState({ tasks: data });
  }
  return parseAppState(data);
}
