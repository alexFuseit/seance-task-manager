// Séance demo video — the DIRECTOR'S TIMELINE (single source of truth).
//
// capture.mjs (frames), soundtrack.mjs (audio) and the reviewer all read this
// file, so picture and sound are locked to the same clock. All times are in
// seconds from the first captured frame. Output: 1920x1080 @ 30 fps, 84 s.
//
// Structure (from the research brief): hook in the first seconds, real
// end-to-end function in the first half, every effect labelled with the task
// state it encodes, a "Built with Kiro" beat, and an end card. Under 3 min.

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 84;

/** Fixed in-app wall clock for the whole capture (Halloween night). */
export const START_TIME_ISO = '2026-10-31T21:00:00';

/** End-card link; override with DEMO_URL=... when the Pages URL exists. */
export const END_URL = process.env.DEMO_URL || 'Link in the description';

/**
 * Curated starting yard (created through the dev hook on `?demo`). Due dates
 * are offsets from START_TIME in hours; null = no due date. Nothing starts
 * overdue or due-soon, so the opening is calm and every later change reads.
 * `role` tags tasks the timeline manipulates later.
 */
export const INITIAL_TASKS = [
  { title: 'Summon the quarterly report', priority: 'high', dueH: 72 },
  { title: 'Polish the crypt ledger', priority: 'medium', dueH: 120 },
  { title: 'Inventory the cobweb archive', priority: 'medium', dueH: 200, role: 'backlog-1' },
  { title: 'Renew the grimoire licence', priority: 'low', dueH: 260, role: 'backlog-2' },
  { title: 'Feed the ravens', priority: 'low', dueH: 330, role: 'backlog-3' },
  { title: 'Reply to the necromancer', priority: 'high', dueH: 150 },
  { title: 'Sharpen the scythe', priority: 'medium', dueH: 400 },
  { title: 'Wind the werewolf calendar', priority: 'low', dueH: null },
  { title: 'Light the belfry candles', priority: 'medium', dueH: 90 },
  { title: 'Appease the banshee choir', priority: 'high', dueH: 500 },
  { title: 'Dust the cauldron', priority: 'low', dueH: null },
  { title: 'Mend the mausoleum gate', priority: 'medium', dueH: 600 },
  { title: 'Catalogue the skull collection', priority: 'low', dueH: 700 },
  { title: 'Banish the gremlin', priority: 'medium', dueH: null, completed: true },
  { title: 'Bury the old roadmap', priority: 'low', dueH: null, completed: true },
  { title: 'Exorcise the phantom inbox', priority: 'high', dueH: null, completed: true },
];

/** The task typed in live during shot C (the film's "hero" grave). */
export const HERO = { title: 'Return the cursed amulet', priority: 'high', dueH: 72 };

/**
 * Shots. `letterbox` = 2.39:1 bars (cinematic beats only; UI shots are full
 * frame so the interface stays legible). `view` = app view during the shot.
 * `camera` describes the intended move; capture.mjs implements it with
 * smootherstep easing between the poses (positions/targets in world units;
 * "hero+" means relative to the hero grave's plot, resolved at runtime).
 */
export const SHOTS = [
  {
    id: 'A', name: 'Cold open', start: 0, end: 7, view: 'graveyard', letterbox: true,
    camera: 'Low push-in over the front rows through the fog: from (0,1.2,14)→(0,1.4,-6) to (0.6,2.0,5)→(0,1.2,-8).',
    notes: 'Fade up from black 0–1.2s. Title card "SÉANCE" 2.0–6.6 with subtitle "Your tasks, laid to rest." 3.2–6.6.',
  },
  {
    id: 'B', name: 'Priority = silhouette', start: 7, end: 14, view: 'graveyard', letterbox: true,
    camera: 'Slow lateral truck left→right along the front row at height ~1.8, ~6 units back, target tracking with the camera.',
  },
  {
    id: 'C', name: 'It really works — the ledger', start: 14, end: 22.4, view: 'ledger', letterbox: false,
    camera: 'n/a (DOM). A visible fake cursor drives the real UI.',
    notes: [
      '14.6 cursor enters; 15.3 click Add with an EMPTY title → inline validation error visible 15.5–17.0.',
      '17.0 click title field; type HERO.title one character every 2 frames (17.3–~19.0).',
      '19.5 set priority High; 20.5 set due date (HERO.dueH); 22.0 click Add → row appears.',
    ],
  },
  {
    id: 'D', name: 'A headstone rises', start: 22.4, end: 30, view: 'graveyard', letterbox: true,
    camera: 'Cut in at 22.4 framed low on the hero grave: from hero+(2.2,1.2,4.2) slow push to hero+(1.4,1.0,3.0), target hero+(0,0.9,0). The rise must be on camera.',
  },
  {
    id: 'E', name: 'Urgency is weather', start: 30, end: 44, view: 'graveyard', letterbox: true,
    camera: 'Slow orbit around the hero grave, radius 5.5, height 2.2, azimuth 20°→80°, target hero+(0,1,0).',
    notes: '30.0 hero due → +6h (due soon: moss, crack, crow lands). 37.0 hero due → −24h (overdue: cracked, spirit, circling crows, skeleton).',
  },
  {
    id: 'F', name: 'Blood moon', start: 44, end: 52, view: 'graveyard', letterbox: true,
    camera: 'Pull back and tilt up from the orbit end to a wide, high shot with the moon (world (-12,13,-34)) in the upper frame: end pose ≈ (4,7,18)→(-4,6,-20).',
    notes: '44.0 backlog-1..3 due → −2h/−20h/−48h (staggered 44.0, 44.3, 44.6) → 4 overdue → blood moon rises, fog thickens.',
  },
  {
    id: 'G1', name: 'Laid to rest — the click', start: 52, end: 53.3, view: 'ledger', letterbox: false,
    camera: 'n/a (DOM). Cursor moves to the hero row\'s complete control; click at 53.2.',
  },
  {
    id: 'G2', name: 'Laid to rest — the ghost', start: 53.3, end: 64, view: 'graveyard', letterbox: true,
    camera: 'Cut in close on the hero grave as it sinks; crane up following the ghost (target y rises with it) until ~57.5, then ease back to a mid-wide of the yard for the backlog completions.',
    notes: 'Hero completed at 53.2 (via the UI click). 57.0/57.8/58.6 complete backlog-1..3 through the store → ghosts rise, overdue drops to 0, blood moon sets.',
  },
  {
    id: 'H', name: 'Built with Kiro', start: 64, end: 75, view: 'graveyard', letterbox: false,
    camera: 'Very slow high drift across the yard behind a dark, blurred card overlay.',
  },
  {
    id: 'I', name: 'End card', start: 75, end: 84, view: 'graveyard', letterbox: false,
    camera: 'Static wide, heavily dimmed behind the card.',
    notes: 'Fade to black 82.5–84.0.',
  },
];

/** Lower-third captions (fade 0.35s in/out). Line 2 is optional small text. */
export const CAPTIONS = [
  { start: 7.6, end: 13.4, line1: 'Every task is a grave.', line2: 'Priority shapes the stone — obelisk, headstone, marker.' },
  { start: 14.6, end: 21.6, line1: 'The parchment ledger', line2: 'Real CRUD, inline validation, fully keyboard-accessible.' },
  { start: 23.5, end: 29.4, line1: 'Add a task — a headstone rises.', line2: 'Fresh soil, a new stone, its glow set by priority.' },
  { start: 30.4, end: 36.6, line1: 'Due within a day', line2: 'Moss creeps in, the stone cracks, a crow keeps watch.' },
  { start: 37.4, end: 43.6, line1: 'Overdue', line2: 'The grave cracks open — and something walks the yard.' },
  { start: 45.0, end: 51.4, line1: 'Let the backlog pile up…', line2: '…and the blood moon rises.' },
  { start: 53.8, end: 57.8, line1: 'Mark it done.', line2: 'The grave sinks, and its ghost is laid to rest.' },
  { start: 58.6, end: 63.4, line1: 'Clear the backlog,', line2: 'and the night lifts.' },
];

/** Title / end cards (full overlays, Cinzel + EB Garamond). */
export const CARDS = {
  title: { start: 2.0, end: 6.6, title: 'SÉANCE', subtitle: 'Your tasks, laid to rest.', subtitleStart: 3.2 },
  kiro: {
    start: 64.3, end: 74.4, heading: 'Built with Kiro',
    lines: [
      'Spec-driven — requirements → design → tasks, each task traced to a requirement',
      'Steering — product · tech · structure, loaded into every session',
      'Custom agent + hooks — type-check on every write, asset-licence guard on stop',
      'Vanilla TypeScript · Three.js · no backend — your data never leaves the browser',
    ],
    lineStagger: 0.6,
  },
  end: {
    start: 75.3, end: 84, title: 'SÉANCE',
    subtitle: 'A task manager that haunts you — beautifully.',
    meta: 'Kiroween 2026 · Costume Contest',
    url: END_URL,
  },
  fadeFromBlack: { start: 0, end: 1.2 },
  fadeToBlack: { start: 82.5, end: 84 },
};

/**
 * Audio cues for soundtrack.mjs (all self-synthesised; no third-party audio).
 * `bed` entries span time ranges; the rest are one-shots at `t`.
 */
export const AUDIO = {
  beds: [
    { kind: 'drone', start: 0, end: 82, notes: 'Low detuned drone (~55 Hz) + slow tremolo; swells under E and F.' },
    { kind: 'wind', start: 0, end: 84, notes: 'Filtered noise wind, gusting slowly; ducked under C and G1 (UI shots).' },
    { kind: 'heartbeat', start: 44, end: 52, notes: 'Slow low thumps (~60 bpm) during the blood moon.' },
    { kind: 'pad', start: 58.6, end: 82, notes: 'Warmer, consonant pad — "the night lifts" — carries the Kiro and end cards.' },
  ],
  cues: [
    { t: 2.0, kind: 'boom', notes: 'Title hit.' },
    { t: 7.0, kind: 'soft-hit', notes: 'Cut to B.' },
    { t: 15.3, kind: 'click' },
    { t: 15.5, kind: 'error-tick', notes: 'Validation error appears.' },
    { t: 17.0, kind: 'click' },
    { t: 19.5, kind: 'click' },
    { t: 20.5, kind: 'click' },
    { t: 22.0, kind: 'click' },
    { t: 22.4, kind: 'rumble', dur: 1.8, notes: 'Headstone rising from the soil.' },
    { t: 23.2, kind: 'soft-hit' },
    { t: 30.0, kind: 'tick', notes: 'Becomes due soon.' },
    { t: 36.0, kind: 'riser', dur: 1.0 },
    { t: 37.0, kind: 'boom', notes: 'Becomes overdue — dissonant.' },
    { t: 42.6, kind: 'riser', dur: 1.4 },
    { t: 44.0, kind: 'boom', notes: 'Blood moon.' },
    { t: 53.2, kind: 'click' },
    { t: 53.3, kind: 'chime', notes: 'Laid to rest.' },
    { t: 57.0, kind: 'chime' },
    { t: 57.8, kind: 'chime' },
    { t: 58.6, kind: 'chime' },
    { t: 64.0, kind: 'soft-hit' },
    { t: 75.0, kind: 'boom', notes: 'End card — final low hit, long tail.' },
  ],
  loudness: { integratedLUFS: -14, truePeak: -1.5 },
};
