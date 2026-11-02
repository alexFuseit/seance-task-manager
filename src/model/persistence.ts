/**
 * localStorage persistence for the app state.
 *
 * Load is defensive: missing, corrupt, or old-schema data never throws — it
 * falls back to an empty state (see validation.parseAppStateJson). Save is
 * wrapped so a full/blocked storage quota never crashes the app.
 */
import { type AppState, STORAGE_KEY } from './types';
import { parseAppStateJson } from './validation';
import { emptyState } from './types';

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    // Accessing localStorage can throw in some privacy modes.
    return false;
  }
}

export function loadState(): AppState {
  if (!hasLocalStorage()) return emptyState();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return emptyState();
  }
  if (raw === null) return emptyState();
  return parseAppStateJson(raw);
}

export function saveState(state: AppState): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage blocked — fail silently; data stays in memory.
  }
}

export function clearStoredState(): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
