/**
 * Séance entry point. Wires the task store to the app shell (2D ledger +
 * lazily-loaded 3D graveyard), seeds sample graves on first run, and tracks the
 * reduced-motion preference.
 */
import './styles/fonts.css';
import './styles/main.css';
import { createSeanceStore } from './store/task-store';
import { seedIfEmpty } from './store/seed';
import { STORAGE_KEY } from './model/types';
import { mountApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app root element');
}

// Dev-only: `?reseed` wipes the saved graveyard so the sample seed is applied
// again; `?demo` starts from an empty store with no seed (the scripted video
// capture builds its own yard). Stripped from production builds.
let skipSeed = false;
if (import.meta.env.DEV) {
  const url = new URL(window.location.href);
  if (url.searchParams.has('reseed')) {
    localStorage.removeItem(STORAGE_KEY);
    url.searchParams.delete('reseed');
    history.replaceState(null, '', url);
  }
  if (url.searchParams.has('demo')) {
    localStorage.removeItem(STORAGE_KEY);
    skipSeed = true;
  }
}

const store = createSeanceStore();

// Populate a fresh graveyard so first-time visitors immediately see the full
// range of visual states (weathering, crows, spirit). No-op for returning users.
if (!skipSeed) seedIfEmpty(store);

// Track the OS reduced-motion preference. The user's explicit choice
// (Settings → Motion) overrides it; 'system' follows it live.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  store.getState().setSystemReducedMotion(mq.matches);
  mq.addEventListener?.('change', (e) => {
    store.getState().setSystemReducedMotion(e.matches);
  });
}

mountApp(root, store);
