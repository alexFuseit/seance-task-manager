/**
 * Ambient audio (Requirement 5.4) — fully synthesized with the Web Audio API.
 *
 * Why synthesized: no downloaded audio means no licensing risk (asset steering)
 * and nothing to fail to load. The soundscape is wind (filtered noise), the
 * occasional distant crow, and a slow tolling bell.
 *
 * Autoplay-safe: the AudioContext is created/resumed only after a user gesture
 * (the mute toggle itself, or the first click). Defaults to MUTED. All nodes
 * are created lazily on first unmute so a user who never enables sound pays
 * nothing.
 */

export interface AmbientAudio {
  /** true when currently audible. */
  isEnabled: () => boolean;
  /** turn sound on (resumes/creates the context — call from a user gesture). */
  enable: () => Promise<void>;
  /** turn sound off (keeps the graph, just silences the master gain). */
  disable: () => void;
  /** convenience toggle; returns the new enabled state. */
  toggle: () => Promise<boolean>;
  dispose: () => void;
}

type WindowWithWebkit = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as WindowWithWebkit;
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createAmbientAudio(): AmbientAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = false;
  let timers: number[] = [];
  let built = false;

  const Ctor = getAudioContextCtor();
  const supported = Ctor !== null;

  /** One-time build of the persistent ambient graph (wind + master gain). */
  function build(): void {
    if (built || !ctx) return;
    built = true;

    master = ctx.createGain();
    master.gain.value = 0; // start silent; enable() ramps up
    master.connect(ctx.destination);

    // --- wind: looping white noise through a slowly-wobbling low-pass ---
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.7;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.18;

    // slow LFO wobble on the filter cutoff so the wind "breathes"
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(windFilter.frequency);

    noise.connect(windFilter).connect(windGain).connect(master);
    noise.start();
    lfo.start();

    scheduleCrows();
    scheduleBell();
  }

  /** A short distant crow caw (two descending FM-ish chirps). */
  function caw(): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    for (let n = 0; n < 2; n++) {
      const start = t + n * 0.18;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(900 - n * 120, start);
      osc.frequency.exponentialRampToValueAtTime(380, start + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      osc.connect(bp).connect(g).connect(master);
      osc.start(start);
      osc.stop(start + 0.2);
    }
  }

  /** A slow, deep bell toll (a couple of detuned sine partials). */
  function bell(): void {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const partials = [1, 2.01, 2.98, 4.2];
    const base = 150;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    g.connect(master);
    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * p;
      const pg = ctx.createGain();
      pg.gain.value = 1 / (p * 1.5);
      osc.connect(pg).connect(g);
      osc.start(t);
      osc.stop(t + 4.6);
    }
  }

  function scheduleCrows(): void {
    const next = 6000 + Math.random() * 12000; // every 6–18s
    const id = window.setTimeout(() => {
      if (enabled) caw();
      scheduleCrows();
    }, next);
    timers.push(id);
  }

  function scheduleBell(): void {
    const next = 25000 + Math.random() * 25000; // every 25–50s
    const id = window.setTimeout(() => {
      if (enabled) bell();
      scheduleBell();
    }, next);
    timers.push(id);
  }

  async function enable(): Promise<void> {
    if (!supported || !Ctor) return;
    if (!ctx) ctx = new Ctor();
    build();
    try {
      if (ctx.state === 'suspended') await ctx.resume();
    } catch {
      /* resume can reject if not from a gesture; ignore */
    }
    enabled = true;
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.6);
    }
  }

  function disable(): void {
    enabled = false;
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    }
  }

  async function toggle(): Promise<boolean> {
    if (enabled) {
      disable();
      return false;
    }
    await enable();
    return enabled;
  }

  function dispose(): void {
    for (const id of timers) clearTimeout(id);
    timers = [];
    enabled = false;
    if (ctx) {
      void ctx.close().catch(() => {});
      ctx = null;
      master = null;
      built = false;
    }
  }

  return { isEnabled: () => enabled, enable, disable, toggle, dispose };
}
