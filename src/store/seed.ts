/**
 * First-run sample data. When the store is empty (a brand-new visitor), seed a
 * full graveyard (SEED_COUNT graves): six hand-written showcase graves that
 * exercise every visual state, plus a deterministic generated mix of overdue,
 * due-soon, future, undated and completed tasks — so the graveyard is
 * immediately alive and the demo reads without hand-building tasks first.
 *
 * Only applied when there are zero tasks; a returning user's data is untouched.
 */
import { type SeanceStore } from './task-store';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function seedIfEmpty(store: SeanceStore): void {
  if (store.getState().tasks.length > 0) return;

  const now = Date.now();
  const iso = (ms: number) => new Date(now + ms).toISOString();

  const s = store.getState();

  // High priority, due in a few days — tall glowing obelisk.
  s.addTask({ title: 'Summon the quarterly report', priority: 'high', dueDate: iso(3 * DAY) });

  // Due soon (<24h) — weathering: moss, cracks, a landed crow.
  s.addTask({ title: 'Renew the grimoire license', priority: 'medium', dueDate: iso(6 * HOUR) });

  // Overdue — cracked grave, pacing spirit, circling crows.
  s.addTask({ title: 'Reply to the necromancer', priority: 'high', dueDate: iso(-2 * DAY) });
  s.addTask({ title: 'Feed the ravens', priority: 'low', dueDate: iso(-1 * DAY) });

  // Low priority, no due date — small faint marker.
  s.addTask({ title: 'Dust the cauldron', priority: 'low' });

  // One already laid to rest — sunken mossy mound.
  const done = s.addTask({ title: 'Banish the gremlin', priority: 'medium' });
  s.completeTask(done.id);

  // Fill the yard out to SEED_COUNT with a deterministic, varied mix of states
  // so a first visit shows a full graveyard (and the ~100-grave perf target).
  const rand = mulberry32(0x5ea1ce);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const priorities = ['high', 'medium', 'medium', 'low', 'low'] as const;
  const used = new Set(store.getState().tasks.map((t) => t.title));

  while (store.getState().tasks.length < SEED_COUNT) {
    let title = `${pick(VERBS)} the ${pick(OBJECTS)}`;
    for (let n = 2; used.has(title); n++) title = `${title.replace(/ \(\d+\)$/, '')} (${n})`;
    used.add(title);

    const priority = pick(priorities);
    const roll = rand();
    if (roll < 0.12) {
      // overdue: 1h – 10 days late
      s.addTask({ title, priority, dueDate: iso(-(HOUR + rand() * 10 * DAY)) });
    } else if (roll < 0.27) {
      // due soon: within the next 24h
      s.addTask({ title, priority, dueDate: iso(HOUR + rand() * 22 * HOUR) });
    } else if (roll < 0.72) {
      // comfortably in the future: 2 – 45 days out
      s.addTask({ title, priority, dueDate: iso(2 * DAY + rand() * 43 * DAY) });
    } else if (roll < 0.85) {
      s.addTask({ title, priority });
    } else {
      const t = s.addTask({ title, priority });
      s.completeTask(t.id);
    }
  }
}

/** Total number of sample graves on first run. */
export const SEED_COUNT = 100;

const VERBS = [
  'Exorcise', 'Polish', 'Embalm', 'Unearth', 'Brew', 'Consecrate', 'Inventory',
  'Sharpen', 'Appease', 'Re-shroud', 'Catalogue', 'Mend', 'Bury', 'Haunt',
  'Light', 'Chain', 'Audit', 'Wind', 'Summon', 'Curse',
] as const;

const OBJECTS = [
  'belfry bats', 'crypt ledger', 'cobweb archive', 'lich invoices', 'candle stock',
  'ouija board', 'raven roster', 'coffin hinges', 'moonlight schedule', 'potion shelf',
  'mausoleum gate', 'banshee choir', 'tombstone font', 'vampire dentist', 'skull collection',
  'werewolf calendar', 'phantom inbox', 'crypt keys', 'witching-hour standup', 'scythe',
] as const;

/** Tiny seeded PRNG so the sample yard is the same on every first run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
