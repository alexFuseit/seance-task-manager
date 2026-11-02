/**
 * Séance entry point.
 *
 * M1: wires the task store to the 2D parchment ledger. The 3D graveyard (M2+)
 * will subscribe to the same store and mount into this same page later.
 */
import './styles/main.css';
import { createSeanceStore } from './store/task-store';
import { mountLedger } from './ui/ledger';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app root element');
}

const store = createSeanceStore();

// Detect reduced-motion preference and record it in settings so later
// (3D) milestones can honour it. Kept here so it runs once at startup.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  store.getState().updateSettings({ reducedMotion: mq.matches });
  mq.addEventListener?.('change', (e) => {
    store.getState().updateSettings({ reducedMotion: e.matches });
  });
}

mountLedger(root, store);
