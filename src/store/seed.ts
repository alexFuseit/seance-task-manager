/**
 * First-run sample data. When the store is empty (a brand-new visitor), seed a
 * handful of graves that exercise every visual state — so the graveyard is
 * immediately alive (weathering, crows, a pacing spirit) and the demo reads
 * without the user having to hand-build tasks first.
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
}
