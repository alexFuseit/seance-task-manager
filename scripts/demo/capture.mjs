// Seance demo video - deterministic frame capture.
//
//   node scripts/demo/capture.mjs [--preview] [--from <sec>] [--to <sec>] [--soft|--gpu]
//
// TIME CONTROL: Playwright's page.clock (clock.install before goto, then
// pauseAt + runFor(1000/FPS) per frame). The determinism check at start
// verifies rAF/performance.now are driven by it (see verifyClock()).
// The whole timeline is always *simulated* from t=0 (so state is identical for
// any --from/--to range); only frames inside [from,to) are screenshotted.
//
// Output: scripts/demo/out/frames/f_%05d.png (full) or out/preview/ (--preview:
// 1920x1080 layout rendered at deviceScaleFactor 0.5 => 960x540, 10 fps).
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import {
  FPS as FULL_FPS, DURATION, START_TIME_ISO, INITIAL_TASKS, HERO, SHOTS, CAPTIONS, CARDS,
} from './timeline.mjs';

// ---------------------------------------------------------------- CLI
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const val = (n, d) => (argv.includes(n) ? Number(argv[argv.indexOf(n) + 1]) : d);
const PREVIEW = flag('--preview');
const FPS = PREVIEW ? 10 : FULL_FPS;
const DSF = PREVIEW ? 0.5 : 1;
const FROM = val('--from', 0);
const TO = val('--to', DURATION);
const OUT = path.resolve('scripts/demo/out', PREVIEW ? 'preview' : 'frames');
fs.mkdirSync(OUT, { recursive: true });
const TOTAL = Math.round(DURATION * FULL_FPS) * FPS / FULL_FPS;
const W = 1920, H = 1080, BAR = 138;

// ---------------------------------------------------------------- math
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const lerpV = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
const seg = (t, a, b) => sstep((t - a) / (b - a));
/** fade in over `fi` at start, out over `fo` before end; 0 outside. */
const win = (t, s, e, fi = 0.35, fo = 0.35) =>
  t < s || t > e ? 0 : Math.min(clamp01((t - s) / fi), clamp01((e - t) / fo));

// ---------------------------------------------------------------- camera
// Returns { rel: bool, p:[x,y,z], t:[x,y,z] }; rel => x/z offsets from hero plot.
function cameraAt(t) {
  const shot = SHOTS.find((s) => t >= s.start && t < s.end) ?? SHOTS[SHOTS.length - 1];
  const k = (a, b) => seg(t, a, b);
  switch (shot.id) {
    case 'A': {
      const e = k(0, 7);
      return { p: lerpV([0, 1.2, 14], [0.6, 2.0, 5], e), t: lerpV([0, 1.4, -6], [0, 1.2, -8], e) };
    }
    case 'B': {
      const e = sstep((t - 7) / 7);
      const x = lerp(-8, 8, e);
      return { p: [x, 1.8, 6], t: [x, 1.0, 0] };
    }
    case 'D': {
      const e = (t - 22.4) / 7.6;
      return { rel: true, p: lerpV([2.2, 1.2, 4.2], [1.4, 1.0, 3.0], e), t: [0, 0.9, 0] };
    }
    case 'E': return orbit(lerp(20, 80, sstep((t - 30) / 14)));
    case 'F': {
      const e = k(44, 52);
      const o = orbit(80);
      return {
        rel: e < 0.001, // handled below: blend from hero-relative to world
        blendFrom: o, p: [4, 7, 18], t: [-4, 6, -20], e,
      };
    }
    case 'G2': {
      if (t < 55.2) {
        const e = k(53.3, 55.2);
        return { rel: true, p: lerpV([2.4, 1.4, 4.2], [3.0, 3.0, 6.0], e), t: [0, lerp(0.9, 3.6, e), 0] };
      }
      const e = k(55.2, 58.2);
      return {
        blendFrom: { rel: true, p: [3.0, 3.0, 6.0], t: [0, 3.6, 0] },
        p: [0, 4.2, 16], t: [0, 1.2, -4], e,
      };
    }
    case 'H': {
      const e = (t - 64) / 11;
      return { p: lerpV([-8, 6, 14], [8, 6.5, 14], e), t: [0, 1, -6] };
    }
    case 'I': return { p: [0, 5, 18], t: [0, 1, -6] };
    default: return { p: [0, 1.6, 10], t: [0, 1.2, -6] }; // ledger shots: camera idle
  }
}
function orbit(azDeg) {
  const a = (azDeg * Math.PI) / 180;
  return { rel: true, p: [4.9 * Math.sin(a), 1.5, 4.9 * Math.cos(a)], t: [0, 2.5, 0] };
}

// ---------------------------------------------------------------- overlay (runs in page)
const OVERLAY_INIT = `
(() => {
  const css = document.createElement('style');
  css.textContent = \`
  #demo-ov{position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;font-family:'EB Garamond',serif;color:#efe6d2}
  #demo-ov *{box-sizing:border-box}
  #demo-ov .bar{position:absolute;left:0;right:0;background:#000}
  #demo-ov .dim{position:absolute;inset:0}
  #demo-ov .scrim{position:absolute;left:0;right:0;bottom:0;height:260px;background:linear-gradient(to top,rgba(5,3,8,.82),rgba(5,3,8,0))}
  #demo-ov .cap{position:absolute;left:84px;max-width:1100px}
  #demo-ov .cap .l1{font-family:'Cinzel',serif;font-weight:700;font-size:38px;letter-spacing:.04em;text-shadow:0 0 18px rgba(239,230,210,.35),0 2px 6px #000}
  #demo-ov .cap .l2{font-size:25px;margin-top:6px;font-style:italic;opacity:.92;text-shadow:0 2px 6px #000}
  #demo-ov .center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  #demo-ov .big{font-family:'Cinzel',serif;font-weight:700;font-size:150px;letter-spacing:.22em;padding-left:.22em;text-shadow:0 0 40px rgba(239,230,210,.55),0 0 90px rgba(180,60,60,.35),0 4px 14px #000}
  #demo-ov .sub{font-size:40px;font-style:italic;margin-top:18px;text-shadow:0 0 16px rgba(239,230,210,.4),0 2px 8px #000}
  #demo-ov .meta{font-family:'Cinzel',serif;font-size:26px;letter-spacing:.2em;margin-top:44px;opacity:.85}
  #demo-ov .url{font-size:30px;margin-top:16px;opacity:.95;border-top:1px solid rgba(239,230,210,.35);padding-top:14px}
  #demo-ov .kiro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  #demo-ov .kh{font-family:'Cinzel',serif;font-weight:700;font-size:78px;letter-spacing:.1em;text-shadow:0 0 30px rgba(239,230,210,.5),0 3px 10px #000;margin-bottom:46px}
  #demo-ov .kl{font-size:36px;line-height:1.3;max-width:1400px;text-align:left;margin:13px 0;padding-left:34px;position:relative;text-shadow:0 2px 8px #000}
  #demo-ov .kl:before{content:'\\\\2020';position:absolute;left:0;color:#c9a96a}
  #demo-ov .cur{position:absolute;left:0;top:0;width:28px;height:28px}
  #demo-ov .rip{position:absolute;width:20px;height:20px;border-radius:50%;border:3px solid #efe6d2;margin:-10px 0 0 -10px}
  \`;
  document.head.appendChild(css);
  const ov = document.createElement('div'); ov.id = 'demo-ov';
  ov.innerHTML = \`
   <div class="dim kd"></div>
   <div class="scrim sc"></div>
   <div class="bar bt" style="top:0;height:0"></div><div class="bar bb" style="bottom:0;height:0"></div>
   <div class="center ti" style="opacity:0"><div class="big tt"></div><div class="sub st" style="opacity:0"></div></div>
   <div class="cap cp" style="opacity:0"><div class="l1"></div><div class="l2"></div></div>
   <div class="kiro ki" style="opacity:0"><div class="kh"></div></div>
   <div class="center en" style="opacity:0"><div class="big"></div><div class="sub"></div><div class="meta"></div><div class="url"></div></div>
   <div class="rip rp" style="opacity:0"></div>
   <svg class="cur cu" viewBox="0 0 28 28" style="opacity:0"><path d="M3 2 L3 22 L8.2 17.4 L11.8 25.5 L15.4 24 L11.9 16 L19 15.6 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>
   <div class="dim fb" style="background:#000;opacity:0"></div>\`;
  document.body.appendChild(ov);
  const q = (s) => ov.querySelector(s);
  const E = { kd:q('.kd'), sc:q('.sc'), bt:q('.bt'), bb:q('.bb'), ti:q('.ti'), tt:q('.tt'), st:q('.st'), cp:q('.cp'),
    l1:q('.cp .l1'), l2:q('.cp .l2'), ki:q('.ki'), kh:q('.kh'), en:q('.en'), cu:q('.cu'), rp:q('.rp'), fb:q('.fb') };
  let kiroBuilt = false, endBuilt = false;
  window.__ov = (s) => {
    E.bt.style.height = s.bar + 'px'; E.bb.style.height = s.bar + 'px';
    E.fb.style.opacity = s.black;
    // caption
    if (s.cap) {
      E.l1.textContent = s.cap.l1; E.l2.textContent = s.cap.l2;
      E.cp.style.opacity = s.cap.op;
      E.cp.style.bottom = s.bar > 60 ? '28px' : '44px';
      E.sc.style.opacity = s.bar > 60 ? 0 : s.cap.op;
    } else { E.cp.style.opacity = 0; E.sc.style.opacity = 0; }
    // title
    E.tt.textContent = s.title.text;
    E.ti.style.opacity = s.title.op; E.st.textContent = s.title.sub; E.st.style.opacity = s.title.subOp;
    // dim layer (kiro/end/title backdrop)
    E.kd.style.background = 'rgba(4,2,8,' + s.dim.a + ')';
    E.kd.style.backdropFilter = s.dim.blur > 0 ? 'blur(' + s.dim.blur + 'px)' : 'none';
    // kiro
    if (s.kiro && !kiroBuilt) {
      E.kh.textContent = s.kiro.heading;
      s.kiro.lines.forEach((l) => { const d = document.createElement('div'); d.className = 'kl'; d.textContent = l; E.ki.appendChild(d); });
      kiroBuilt = true;
    }
    if (s.kiro) {
      E.ki.style.opacity = s.kiro.op; E.kh.style.opacity = s.kiro.headOp;
      [...E.ki.querySelectorAll('.kl')].forEach((d, i) => {
        d.style.opacity = s.kiro.lineOps[i]; d.style.transform = 'translateY(' + (1 - s.kiro.lineOps[i]) * 18 + 'px)';
      });
    }
    // end
    if (s.end) {
      if (!endBuilt) {
        const c = E.en.children; c[0].textContent = s.end.title; c[1].textContent = s.end.subtitle;
        c[2].textContent = s.end.meta; c[3].textContent = s.end.url; endBuilt = true;
      }
      E.en.style.opacity = s.end.op;
    } else E.en.style.opacity = 0;
    // cursor
    E.cu.style.opacity = s.cur.vis ? 1 : 0;
    E.cu.style.transform = 'translate(' + s.cur.x + 'px,' + s.cur.y + 'px)';
    if (s.cur.rip >= 0 && s.cur.rip < 1) {
      E.rp.style.opacity = 0.9 * (1 - s.cur.rip);
      E.rp.style.left = s.cur.x + 'px'; E.rp.style.top = s.cur.y + 'px';
      E.rp.style.transform = 'scale(' + (1 + s.cur.rip * 3) + ')';
    } else E.rp.style.opacity = 0;
  };
})();`;

// ---------------------------------------------------------------- helpers
const rel = (n) => (n == null ? n : n);
function localDateParts(ms) {
  const d = new Date(ms);
  return { mm: String(d.getMonth() + 1).padStart(2, '0'), dd: String(d.getDate()).padStart(2, '0'), yyyy: String(d.getFullYear()) };
}
const START_MS = new Date(START_TIME_ISO).getTime();

async function launch(mode) {
  const gpuArgs = ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl'];
  const softArgs = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swrender'];
  const browser = await chromium.launch({ args: mode === 'gpu' ? gpuArgs : softArgs });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: DSF, reducedMotion: 'no-preference', locale: 'en-US',
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return { browser, ctx, page, logs };
}

async function rendererString(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'NO_WEBGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
}

// ---------------------------------------------------------------- main
const server = await createServer({
  server: { port: 4318, strictPort: true },
  logLevel: 'warn',
});
await server.listen();
const URL_ = 'http://localhost:4318/?demo';

// Prime Vite's dep optimiser so it never reloads the page mid-capture.
{
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(URL_, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => !!window.__seance);
  await p.evaluate(() => window.__seance.setView('graveyard'));
  await p.waitForTimeout(1500);
  await b.close();
}

async function boot(mode) {
  const env = await launch(mode);
  const { page } = env;
  await page.clock.install({ time: new Date(START_TIME_ISO) });
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__seance);
  env.renderer = await rendererString(page);
  return env;
}

let mode = flag('--soft') ? 'soft' : 'gpu';
let env;
try {
  env = await boot(mode);
  if (mode === 'gpu' && /swiftshader|NO_WEBGL|llvmpipe/i.test(env.renderer)) throw new Error('GPU not available: ' + env.renderer);
} catch (e) {
  console.log(`[renderer] ${mode} failed (${e.message}); falling back to swiftshader`);
  await env?.browser.close().catch(() => {});
  mode = 'soft';
  env = await boot(mode);
}
const { page, browser } = env;
console.log(`[renderer] mode=${mode} UNMASKED_RENDERER=${env.renderer}`);

// ---- setup (clock running naturally) ----
await page.evaluate(() => window.__seance.store.getState().updateSettings({ quality: 'high', muted: true, showCompleted: true }));
await page.evaluate((specs) => {
  const st = window.__seance.store.getState();
  const now = Date.now();
  window.__roles = {};
  for (const s of specs) {
    const task = st.addTask({
      title: s.title, priority: s.priority,
      dueDate: s.dueH == null ? undefined : new Date(now + s.dueH * 3600e3).toISOString(),
    });
    if (s.role) window.__roles[s.role] = task.id;
    if (s.completed) st.completeTask(task.id);
  }
}, INITIAL_TASKS);
await page.evaluate(() => window.__seance.setView('graveyard'));
await page.evaluate(() => window.__seance.directCamera(true));
await page.evaluate(OVERLAY_INIT);
await page.evaluate(() => document.fonts.ready);
{
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 500);
}
// initial pose before the rise cascade settles
const poseA = cameraAt(0);
await page.evaluate(([p, t]) => window.__seance.setCameraPose(...p, ...t), [poseA.p, poseA.t]);
for (let i = 0; i < 6000 / 100; i++) await page.clock.runFor(100); // 6 s preroll

// ---- verify the fake clock drives rAF / performance.now ----
async function verifyClock() {
  const a = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  const b = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  const same = Buffer.compare(a, b) === 0;
  await page.clock.runFor(200);
  const c = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  const moved = Buffer.compare(b, c) !== 0;
  const pn = await page.evaluate(() => performance.now());
  await page.clock.runFor(1000);
  const pn2 = await page.evaluate(() => performance.now());
  console.log(`[clock] approach=page.clock; frozen-identical=${same}; advances-after-runFor=${moved}; perfNow delta over runFor(1000)=${(pn2 - pn).toFixed(1)}ms`);
  if (!same) console.log('[clock] WARNING: frames differ without time advancing (non-deterministic source)');
}
await verifyClock();

// ---------------------------------------------------------------- timeline engine
const shotAt = (t) => SHOTS.find((s) => t >= s.start && t < s.end) ?? SHOTS[SHOTS.length - 1];
const sIdx = (t) => SHOTS.indexOf(shotAt(t));
function barAt(t) {
  const i = sIdx(t), s = SHOTS[i];
  const cur = s.letterbox ? BAR : 0;
  if (i === 0) return cur;
  const prev = SHOTS[i - 1].letterbox ? BAR : 0;
  if (cur > prev) return cur; // bars snap in at a cut to a cinematic shot (hides the app shell)
  return lerp(prev, cur, sstep((t - s.start) / 0.3));
}

const heroTitle = HERO.title;
const heroDate = localDateParts(START_MS + HERO.dueH * 3600e3);
const state = {
  view: 'graveyard', heroId: null, typed: 0, fired: new Set(),
  cur: { x: 1500, y: 420 }, curVis: false, clickT: -10,
  lastMove: null,
};

// Cursor script: waypoints { t (arrival), dur (travel), sel, dx, dy, click, act }.
const CUR_SCRIPT = [
  { t: 15.3, dur: 0.7, sel: 'button.bury-btn', click: true, start: { x: 1650, y: 560 }, showFrom: 14.6 },
  { t: 17.0, dur: 0.8, sel: '#qa-title', click: true },
  { t: 19.5, dur: 1.0, sel: '#qa-priority', click: true, act: 'priority' },
  { t: 20.5, dur: 0.8, sel: '#qa-due', click: true, dx: -55, act: 'date' },
  { t: 22.0, dur: 0.8, sel: 'button.bury-btn', click: true, act: 'add' },
  { t: 53.2, dur: 1.0, sel: 'HERO_COMPLETE', click: true, act: 'complete', start: { x: 1100, y: 300 }, showFrom: 52.0 },
];
const resolved = new Map(); // idx -> {x,y} resolved when its travel begins

async function centreOf(sel) {
  if (sel === 'HERO_COMPLETE') {
    return page.evaluate((id) => {
      const b = document.querySelector(`tr[data-id="${id}"] button.complete`);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, state.heroId);
  }
  return page.evaluate((s) => {
    const b = document.querySelector(s);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
}

async function doClickAct(w, pos) {
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await page.mouse.up();
  if (w.act === 'priority') {
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => {
      const s = document.querySelector('#qa-priority');
      s.value = 'high';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
  } else if (w.act === 'date') {
    // the native segmented date widget is unreliable to type into headlessly; set its value directly after the real click
    await page.evaluate((v) => { const i = document.querySelector('#qa-due'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, `${heroDate.yyyy}-${heroDate.mm}-${heroDate.dd}`);
  } else if (w.act === 'add') {
    state.heroId = await page.evaluate((title) => {
      const t = window.__seance.store.getState().tasks.find((x) => x.title === title);
      return t ? t.id : null;
    }, heroTitle);
  }
}

// One-shot store/view events.
const EVENTS = [
  { t: 14.0, run: () => setView('ledger') },
  { t: 22.4, run: () => setView('graveyard') },
  { t: 30.0, run: () => dueSet('hero', +6) },
  { t: 37.0, run: () => dueSet('hero', -24) },
  { t: 43.5, run: () => dueSet('backlog-1', -2) },
  { t: 43.8, run: () => dueSet('backlog-2', -20) },
  { t: 44.1, run: () => dueSet('backlog-3', -48) },
  { t: 52.0, run: () => setView('ledger') },
  { t: 53.3, run: () => setView('graveyard') },
  { t: 57.0, run: () => complete('backlog-1') },
  { t: 57.8, run: () => complete('backlog-2') },
  { t: 58.6, run: () => complete('backlog-3') },
];
async function setView(v) { state.view = v; await page.evaluate((x) => window.__seance.setView(x), v); }
async function idOf(role) { return role === 'hero' ? state.heroId : page.evaluate((r) => window.__roles[r], role); }
async function dueSet(role, hours) {
  const id = await idOf(role);
  await page.evaluate(([i, h]) => window.__seance.store.getState().updateTask(i, { dueDate: new Date(Date.now() + h * 3600e3).toISOString() }), [id, hours]);
}
async function complete(role) {
  const id = await idOf(role);
  await page.evaluate((i) => window.__seance.store.getState().completeTask(i), id);
}

function overlayState(t) {
  const cap = CAPTIONS.find((c) => t >= c.start && t <= c.end);
  const ti = CARDS.title, ki = CARDS.kiro, en = CARDS.end;
  const kop = win(t, ki.start, ki.end, 0.8, 0.8);
  const eop = win(t, en.start, en.end + 1, 1.0, 0.0001);
  const black = Math.max(1 - sstep((t - CARDS.fadeFromBlack.start) / (CARDS.fadeFromBlack.end - CARDS.fadeFromBlack.start)),
    sstep((t - CARDS.fadeToBlack.start) / (CARDS.fadeToBlack.end - CARDS.fadeToBlack.start)));
  const tiOp = win(t, ti.start, ti.end, 0.7, 0.7);
  const dimA = Math.max(0.78 * kop, 0.82 * eop, 0.35 * tiOp);
  const blur = Math.max(9 * kop, 4 * eop);
  const lineOps = ki.lines.map((_, i) => clamp01((t - (ki.start + 0.9 + i * ki.lineStagger)) / 0.45) * (kop > 0 ? clamp01((ki.end - t) / 0.8) : 0));
  const curCfg = curAt(t);
  return {
    bar: barAt(t), black,
    cap: cap ? { l1: cap.line1, l2: cap.line2 ?? '', op: win(t, cap.start, cap.end) } : null,
    title: { op: tiOp, text: ti.title, sub: ti.subtitle, subOp: win(t, ti.subtitleStart, ti.end, 0.8, 0.7) },
    dim: { a: dimA.toFixed(3), blur: blur.toFixed(2) },
    kiro: { heading: ki.heading, lines: ki.lines, op: kop, headOp: kop, lineOps },
    end: { title: en.title, subtitle: en.subtitle, meta: en.meta, url: en.url, op: eop },
    cur: curCfg,
  };
}

function curAt(t) {
  let vis = (t >= 14.6 && t < 22.4) || (t >= 52.0 && t < 53.3);
  let rip = -1;
  for (const c of clickLog) if (vis && t >= c && t - c < 0.45) rip = (t - c) / 0.45;
  return { x: state.cur.x, y: state.cur.y, vis, rip };
}
const clickLog = CUR_SCRIPT.map((w) => w.t);

// ---------------------------------------------------------------- frame loop
const fromF = Math.round(FROM * FPS), toF = Math.min(TOTAL, Math.round(TO * FPS));
console.log(`[capture] ${PREVIEW ? 'PREVIEW 960x540@10' : '1920x1080@30'}; frames ${fromF}..${toF - 1} of ${TOTAL}; out=${OUT}`);
const t0 = Date.now();
let shot = 0, lastWp = null;
const evFired = new Set();
const wpState = CUR_SCRIPT.map(() => ({ begun: false, done: false, from: null, to: null }));
let prevPos = { x: 1650, y: 560 };

for (let f = 0; f < toF; f++) {
  const t = f / FPS;
  // one-shot events
  for (const [i, e] of EVENTS.entries()) if (t >= e.t && !evFired.has(i)) { evFired.add(i); await e.run(); }
  // cursor waypoints
  for (const [i, w] of CUR_SCRIPT.entries()) {
    const s = wpState[i];
    const begin = w.t - w.dur;
    if (t >= begin && !s.begun) {
      s.begun = true;
      s.from = i === 0 || w.start ? (w.start ?? prevPos) : { ...state.cur };
      const pos = await centreOf(w.sel);
      s.to = pos ? { x: pos.x + (w.dx ?? 0), y: pos.y + (w.dy ?? 0) } : s.from;
      state.cur = { ...s.from };
    }
    if (s.begun && !s.done) {
      const k = sstep((t - begin) / w.dur);
      state.cur = { x: lerp(s.from.x, s.to.x, k), y: lerp(s.from.y, s.to.y, k) };
      if (t >= w.t) { s.done = true; state.cur = { ...s.to }; await doClickAct(w, s.to); }
    }
  }
  // typing (one char per 2 frames @30fps => 15 chars/s)
  if (t >= 17.3 && state.typed < heroTitle.length) {
    const n = Math.min(heroTitle.length, Math.floor((t - 17.3) * 15) + 1);
    if (n > state.typed) { await page.keyboard.type(heroTitle.slice(state.typed, n)); state.typed = n; }
  }
  // camera
  if (state.view === 'graveyard') {
    const cam = cameraAt(t);
    await page.evaluate(([c, heroId]) => {
      const hxz = heroId ? window.__seance.graveXZ(heroId) : null;
      const off = (v, r) => (r && hxz ? [v[0] + hxz.x, v[1], v[2] + hxz.z] : v);
      let p, tg;
      if (c.blendFrom) {
        const bf = c.blendFrom;
        const a = off(bf.p, bf.rel), at = off(bf.t, bf.rel);
        const e = c.e;
        p = a.map((v, i) => v + (c.p[i] - v) * e); tg = at.map((v, i) => v + (c.t[i] - v) * e);
      } else { p = off(c.p, c.rel); tg = off(c.t, c.rel); }
      window.__seance.setCameraPose(p[0], p[1], p[2], tg[0], tg[1], tg[2]);
    }, [cam, state.heroId]);
  }
  await page.evaluate((s) => window.__ov(s), overlayState(t));
  if (process.env.DBG && t >= 21.9 && t < 22.7 && state.heroId) {
    console.log(t.toFixed(2), await page.evaluate((id) => { const g = window.__seance.scene().graveyard.children.find((c) => c.userData.taskId === id); return `pn=${performance.now().toFixed(0)} y=${g?.position.y.toFixed(2)}`; }, state.heroId));
  }
  // advance fake time
  // Slow-motion app time right after the cut so the headstone's rise reads on camera.
  const slow = t >= 22.4 && t < 23.2 ? 0.25 : t >= 23.2 && t < 24.2 ? lerp(0.25, 1, sstep((t - 23.2) / 1.0)) : 1;
  const ms = Math.max(1, Math.round((Math.round(((f + 1) * 1000) / FPS) - Math.round((f * 1000) / FPS)) * slow));
  // Hold app time still while the hero row is being added in the ledger (22.0-22.4)
  // so the headstone's rise happens on camera after the cut to the graveyard.
  if (!((t >= 22.0 && t < 22.4) || (t >= 53.2 && t < 53.3))) await page.clock.runFor(ms);
  if (f >= fromF) {
    const name = path.join(OUT, `f_${String(f).padStart(5, '0')}.png`);
    await page.screenshot({ path: name, type: 'png' });
    shot++;
    if (shot % 30 === 0 || f === toF - 1) {
      const el = (Date.now() - t0) / 1000, rate = shot / el;
      console.log(`[capture] f=${f} t=${t.toFixed(2)}s  ${shot}/${toF - fromF}  ${rate.toFixed(2)} fps  ETA ${(((toF - fromF) - shot) / rate / 60).toFixed(1)} min`);
    }
  } else if (f % 60 === 0) {
    console.log(`[sim] f=${f} t=${t.toFixed(2)}s (not captured)`);
  }
}
console.log(`[done] ${shot} frames in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min; renderer=${env.renderer}`);
if (env.logs.length) console.log('[page logs]\n' + env.logs.slice(0, 20).join('\n'));
await browser.close();
await server.close();
process.exit(0);
