/**
 * Séance entry point. Wires the task store to the app shell (2D ledger +
 * lazily-loaded 3D graveyard), seeds sample graves on first run, and tracks the
 * reduced-motion preference.
 */
import './styles/main.css';
import { createSeanceStore } from './store/task-store';
import { seedIfEmpty } from './store/seed';
import { mountApp } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app root element');
}

const store = createSeanceStore();

// Populate a fresh graveyard so first-time visitors immediately see the full
// range of visual states (weathering, crows, spirit). No-op for returning users.
seedIfEmpty(store);

// Detect reduced-motion preference and record it in settings so later
// (3D) milestones can honour it. Kept here so it runs once at startup.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  store.getState().updateSettings({ reducedMotion: mq.matches });
  mq.addEventListener?.('change', (e) => {
    store.getState().updateSettings({ reducedMotion: e.matches });
  });
}

mountApp(root, store);
