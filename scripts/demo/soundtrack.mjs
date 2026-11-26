// SÃ©ance demo soundtrack â€” synthesised entirely with ffmpeg (lavfi sources and
// filters only; no third-party audio). Reads beds/cues/loudness from
// timeline.mjs so the score stays locked to the picture.
//
//   node scripts/demo/soundtrack.mjs   ->  scripts/demo/out/soundtrack.wav
//
// Approach: render each bed / one-shot as a stem WAV, then place the stems with
// adelay in one filter script (-filter_complex_script), amix, fade out, and
// finish with a two-pass loudnorm.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION, AUDIO, SHOTS } from './timeline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out');
const STEMS = join(OUT, 'stems');
mkdirSync(STEMS, { recursive: true });

const SR = 48000;
const TWO_PI = '2*PI';

function findFfmpeg() {
  const cands = [
    process.env.FFMPEG,
    'ffmpeg',
    'C:\\Users\\muend\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe',
  ].filter(Boolean);
  for (const c of cands) {
    const r = spawnSync(c, ['-version'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  throw new Error('ffmpeg not found (set FFMPEG=path)');
}
const FFMPEG = findFfmpeg();

function ff(args, { capture = false } = {}) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed:\n${args.join(' ')}\n${r.stderr}`);
  }
  return capture ? r.stderr : undefined;
}

const f = (n) => Number(n).toFixed(4);

/** Render a stem from a lavfi filter graph (graph must end in an unlabeled/[out] stream). */
function stem(name, lavfiInputs, graph, dur) {
  const path = join(STEMS, `${name}.wav`);
  const args = [];
  for (const i of lavfiInputs) args.push('-f', 'lavfi', '-i', i);
  const gfile = join(STEMS, `${name}.txt`);
  writeFileSync(gfile, graph + '\n');
  args.push(
    '-/filter_complex', gfile,
    '-map', '[out]', '-t', f(dur),
    '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_f32le', path,
  );
  ff(args);
  return path;
}

/** aevalsrc stem: expressions per channel (L, R). */
function evalStem(name, exprL, exprR, dur, post = 'anull') {
  return stem(
    name,
    [`aevalsrc='${exprL}|${exprR}':s=${SR}:d=${f(dur)}`],
    `[0:a]${post},aformat=channel_layouts=stereo[out]`,
    dur,
  );
}

// ---------------------------------------------------------------- beds

function ledgerRanges() {
  return SHOTS.filter((s) => s.view === 'ledger').map((s) => [s.start, s.end]);
}

function droneBed(bed) {
  const dur = bed.end - bed.start;
  // swell centred under shots E..F (urgency + blood moon)
  const swellShots = SHOTS.filter((s) => s.id === 'E' || s.id === 'F');
  const s0 = Math.min(...swellShots.map((s) => s.start));
  const s1 = Math.max(...swellShots.map((s) => s.end));
  const c = (s0 + s1) / 2;
  const w = (s1 - s0) / 2;
  const T = `(t+${f(bed.start)})`;
  const swell = `(1+0.9*exp(-pow((${T}-${f(c)})/${f(w)},2)))`;
  const mk = (d1, d2, fifth, shim, tr) =>
    `0.20*(sin(${TWO_PI}*${d1}*t)+sin(${TWO_PI}*${d2}*t)+0.28*sin(${TWO_PI}*${fifth}*t)` +
    `+0.07*sin(${TWO_PI}*${shim}*t))*(0.75+0.25*sin(${TWO_PI}*${tr}*t))*${swell}`;
  const L = mk(55, 55.4, 82.4, 58.3, 0.11);
  const R = mk(55.1, 55.5, 82.6, 58.4, 0.13);
  return {
    kind: 'drone',
    start: bed.start,
    path: evalStem(
      'bed-drone', L, R, dur,
      `lowpass=f=320,afade=t=in:d=3,afade=t=out:st=${f(dur - 3)}:d=3`,
    ),
    gain: 0.9,
  };
}

function windBed(bed) {
  const dur = bed.end - bed.start;
  const T = `(t+${f(bed.start)})`;
  const duck = ledgerRanges()
    .map(([a, b]) => `clip((${T}-${f(a)}+0.4)/0.4,0,1)*clip((${f(b)}+0.4-${T})/0.4,0,1)`)
    .join('+');
  const vol = `(1-0.5*min(1,${duck}))*(0.7+0.3*sin(${TWO_PI}*${T}/9))`;
  const chan = (i, seed) =>
    `[${i}:a]asplit=2[a${i}][b${i}];` +
    `[a${i}]bandpass=f=260:width_type=h:w=180,tremolo=f=0.11:d=0.7[x${i}];` +
    `[b${i}]bandpass=f=520:width_type=h:w=280,tremolo=f=0.1:d=0.8[y${i}];` +
    `[x${i}][y${i}]amix=inputs=2:normalize=0[w${i}]`;
  const graph = [
    chan(0), chan(1),
    `[w0][w1]join=inputs=2:channel_layout=stereo,highpass=f=80,` +
      `volume='${vol}':eval=frame:precision=float,volume=7,` +
      `afade=t=in:d=2.5,afade=t=out:st=${f(dur - 2.5)}:d=2.5[out]`,
  ].join(';');
  return {
    kind: 'wind',
    start: bed.start,
    path: stem(
      'bed-wind',
      [
        `anoisesrc=c=pink:r=${SR}:seed=11:d=${f(dur)}:a=0.5`,
        `anoisesrc=c=pink:r=${SR}:seed=29:d=${f(dur)}:a=0.5`,
      ],
      graph, dur,
    ),
    gain: 0.35, // was 0.8 — wind was too prominent
  };
}

function heartbeatBed(bed) {
  const dur = bed.end - bed.start;
  const beat = (x, amp) =>
    `${amp}*sin(${TWO_PI}*50*(${x})*(1-0.15*(${x})))*exp(-(${x})*13)*(1-exp(-(${x})*300))`;
  const x1 = 'mod(t,1)';
  const x2 = 'mod(t+0.72,1)'; // second thump 0.28 s after the first
  const e = `${beat(x1, 0.9)}+${beat(x2, 0.6)}`;
  return {
    kind: 'heartbeat',
    start: bed.start,
    path: evalStem(
      'bed-heart', e, e, dur,
      `lowpass=f=140,afade=t=in:d=1.5,afade=t=out:st=${f(dur - 1.5)}:d=1.5`,
    ),
    gain: 0.9,
  };
}

function padBed(bed) {
  const dur = bed.end - bed.start;
  const chord = (name, freqs, d, delay) => {
    const mk = (det) =>
      '0.07*(' + freqs.map((fr, i) =>
        `sin(${TWO_PI}*${f(fr * (1 + det * (i % 2 ? 1 : -1)))}*t)`).join('+') +
      `)*(0.8+0.2*sin(${TWO_PI}*0.09*t))`;
    return {
      path: evalStem(
        name, mk(0.0015), mk(0.0025), d,
        `lowpass=f=1400,afade=t=in:d=4.5,afade=t=out:st=${f(d - 4.5)}:d=4.5`,
      ),
      delay,
    };
  };
  const first = Math.min(14, dur);
  // A minor (A2 A3 C4 E4 + soft B4 colour) -> C major add9 (C3 G3 C4 E4 D5)
  const am = chord('bed-pad-am', [110, 220, 261.63, 329.63, 493.88], first, 0);
  const cm = chord('bed-pad-c', [130.81, 196, 261.63, 329.63, 587.33], first, dur - first);
  return [
    { kind: 'pad', start: bed.start + am.delay, path: am.path, gain: 0.9 },
    { kind: 'pad', start: bed.start + cm.delay, path: cm.path, gain: 0.9 },
  ];
}

// ------------------------------------------------------------ one-shots

function boom(name, { dur, level, dissonant }) {
  const sub =
    `sin(${TWO_PI}*(40*t+7.5*(1-exp(-8*t))))*exp(-t*1.1)*(1-exp(-t*500))` +
    (dissonant ? `+0.5*sin(${TWO_PI}*(56.5*t+6*(1-exp(-8*t))))*exp(-t*1.4)*(1-exp(-t*500))` : '');
  // sub tone via aevalsrc, noise burst via anoisesrc, then mixed with a long tail.
  return stem(
    name,
    [
      `aevalsrc='${level}*0.8*(${sub})|${level}*0.8*(${sub})':s=${SR}:d=${f(dur)}`,
      `anoisesrc=c=brown:r=${SR}:seed=5:d=${f(dur)}:a=0.8`,
    ],
    `[1:a]lowpass=f=700,afade=t=in:d=0.004,afade=t=out:st=0.05:d=1.4,volume=${f(level * 0.5)}[n];` +
      `[0:a][n]amix=inputs=2:normalize=0,aecho=0.8:0.55:260|520|900:0.45|0.3|0.2,` +
      `aformat=channel_layouts=stereo,afade=t=out:st=${f(dur - 1)}:d=1[out]`,
    dur,
  );
}

function click(name, vol) {
  const e = `${vol}*(sin(${TWO_PI}*1500*t)+0.6*sin(${TWO_PI}*2300*t))*exp(-t*110)*(1-exp(-t*3000))`;
  return evalStem(name, e, e, 0.15, 'lowpass=f=4000');
}
function errorTick(name) {
  const tk = (x) => `sin(${TWO_PI}*170*(${x}))*exp(-(${x})*45)*(1-exp(-(${x})*2000))`;
  const e = `0.55*(${tk('t')}+gt(t,0.14)*0.8*${tk('max(t-0.14,0)')})`;
  return evalStem(name, e, e, 0.5, 'lowpass=f=900');
}
function tick(name) {
  const e = `0.3*sin(${TWO_PI}*880*t)*exp(-t*35)*(1-exp(-t*2000))`;
  return evalStem(name, e, e, 0.35, 'lowpass=f=2500');
}
function rumble(name, dur) {
  const total = dur + 0.8;
  return stem(
    name,
    [
      `anoisesrc=c=brown:r=${SR}:seed=3:d=${f(total)}:a=0.9`,
      `anoisesrc=c=brown:r=${SR}:seed=4:d=${f(total)}:a=0.9`,
    ],
    `[0:a][1:a]join=inputs=2:channel_layout=stereo,lowpass=f=140,volume=5,` +
      `afade=t=in:d=${f(dur * 0.85)}:curve=qsin,afade=t=out:st=${f(dur)}:d=0.8[out]`,
    total,
  );
}
function riser(name, dur) {
  const K = 600 / dur;
  const tone = `0.35*sin(${TWO_PI}*(180*t+${f(K / 2)}*t*t))*pow(t/${f(dur)},2)`;
  return stem(
    name,
    [
      `aevalsrc='${tone}|${tone}':s=${SR}:d=${f(dur)}`,
      `anoisesrc=c=pink:r=${SR}:seed=8:d=${f(dur)}:a=0.5`,
    ],
    `[1:a]highpass=f=500,lowpass=f=3500,volume='pow(t/${f(dur)},2)*1.4':eval=frame:precision=float[n];` +
      `[0:a][n]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo,` +
      `afade=t=out:st=${f(dur - 0.03)}:d=0.03[out]`,
    dur,
  );
}
function chime(name, f0) {
  const partial = (r, a, d) => `${a}*sin(${TWO_PI}*${f(f0 * r)}*t)*exp(-t*${d})`;
  const e =
    `0.28*(${partial(1, 1, 1.3)}+${partial(2.76, 0.5, 2.0)}+${partial(5.4, 0.25, 3.5)}+${partial(8.93, 0.12, 5)})*(1-exp(-t*600))`;
  return evalStem(name, e, e, 5, 'aecho=0.7:0.5:180|360:0.35|0.2');
}

// ---------------------------------------------------------------- build

const layers = []; // { start, path, gain }
const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

console.log(`ffmpeg: ${FFMPEG}`);
console.log('rendering bedsâ€¦');
for (const bed of AUDIO.beds) {
  if (bed.kind === 'drone') layers.push(droneBed(bed));
  else if (bed.kind === 'wind') layers.push(windBed(bed));
  else if (bed.kind === 'heartbeat') layers.push(heartbeatBed(bed));
  else if (bed.kind === 'pad') layers.push(...padBed(bed));
  else console.warn(`unknown bed ${bed.kind}`);
}

console.log('rendering cuesâ€¦');
const chimePitches = [659.25, 523.25, 659.25, 783.99];
let chimeIdx = 0;
for (const c of AUDIO.cues) {
  let path;
  let gain = 1;
  switch (c.kind) {
    case 'boom': {
      const dis = /dissonant/i.test(c.notes || '');
      const long = /long tail/i.test(c.notes || '');
      const dur = long ? Math.max(7, DURATION - c.t) : 6;
      path = once(`boom-${dis}-${dur}`, () => boom(`boom-${dis ? 'dis' : 'std'}-${Math.round(dur)}`, { dur, level: 1, dissonant: dis }));
      break;
    }
    case 'soft-hit':
      path = once('soft', () => boom('soft-hit', { dur: 3.5, level: 0.5, dissonant: false }));
      break;
    case 'click': path = once('click', () => click('click', 0.45)); break;
    case 'error-tick': path = once('err', () => errorTick('error-tick')); break;
    case 'tick': path = once('tick', () => tick('tick')); break;
    case 'rumble': path = once(`rum${c.dur}`, () => rumble('rumble', c.dur ?? 1.8)); break;
    case 'riser': path = once(`ris${c.dur}`, () => riser(`riser-${String(c.dur).replace('.', '_')}`, c.dur ?? 1)); break;
    case 'chime': {
      const p = chimePitches[chimeIdx++ % chimePitches.length];
      path = once(`ch${p}`, () => chime(`chime-${Math.round(p)}`, p));
      break;
    }
    default:
      console.warn(`unknown cue ${c.kind} at ${c.t}`);
      continue;
  }
  layers.push({ kind: c.kind, start: c.t, path, gain });
}

// Beds sit ~12 dB under the hits (hits are ~0.8 peak; bed gain scales below).
const BED_KINDS = new Set(['drone', 'wind', 'heartbeat', 'pad']);
const BED_TRIM = 0.25; // -12 dB

console.log('mixingâ€¦');
const lines = layers.map((l, i) => {
  const ms = Math.round(l.start * 1000);
  const g = (l.gain ?? 1) * (BED_KINDS.has(l.kind) ? BED_TRIM : 1);
  return `[${i}:a]${ms > 0 ? `adelay=${ms}:all=1,` : ''}volume=${f(g)}[s${i}]`;
});
const labels = layers.map((_, i) => `[s${i}]`).join('');
lines.push(
  `${labels}amix=inputs=${layers.length}:normalize=0:duration=longest,` +
    `apad=whole_dur=${DURATION},atrim=0:${DURATION},asetpts=N/SR/TB,` +
    `acompressor=threshold=0.18:ratio=3.5:attack=5:release=150:makeup=1,afade=t=out:st=${f(DURATION - 1.5)}:d=1.5[mix]`,
);
const mixGraph = join(STEMS, 'mix.txt');
writeFileSync(mixGraph, lines.join(';\n') + '\n');

const premix = join(OUT, 'soundtrack-premix.wav');
{
  const args = [];
  for (const l of layers) args.push('-i', l.path);
  args.push(
    '-/filter_complex', mixGraph, '-map', '[mix]',
    '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_f32le', premix,
  );
  ff(args);
}

// ------------------------------------------------------- two-pass loudnorm
const I = AUDIO.loudness.integratedLUFS;
const TP = AUDIO.loudness.truePeak;
const LRA = 11;
console.log('loudnorm pass 1â€¦');
const log = ff(
  ['-i', premix, '-af', `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, '-f', 'null', '-'],
  { capture: true },
);
const m = log.match(/\{[\s\S]*?\}/g);
const meas = JSON.parse(m[m.length - 1]);
console.log('  measured:', meas.input_i, 'LUFS, TP', meas.input_tp, 'LRA', meas.input_lra);

console.log('loudnorm pass 2â€¦');
const final = join(OUT, 'soundtrack.wav');
ff([
  '-i', premix,
  '-af',
  `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${meas.input_i}:measured_TP=${meas.input_tp}` +
    `:measured_LRA=${meas.input_lra}:measured_thresh=${meas.input_thresh}:offset=${meas.target_offset}` +
    `:linear=true:print_format=summary,aresample=${SR},apad=whole_dur=${DURATION},atrim=0:${DURATION}`,
  '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_s16le', final,
]);

rmSync(premix, { force: true });
console.log(`done: ${final}`);
