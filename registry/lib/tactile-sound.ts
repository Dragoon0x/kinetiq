"use client";

import * as React from "react";

/**
 * Tactile sound — interface sounds synthesised on the spot with Web Audio.
 * No files, no network, nothing loaded up front: every voice is a few
 * oscillators, a slice of noise, a filter and an envelope, built at the moment
 * it plays and gone when it ends.
 *
 * The rules this module keeps, so a component never has to:
 * - Silence is the default. Nothing plays unless the caller passed `enabled`,
 *   and no AudioContext exists until the first sound is asked for — which
 *   only ever happens inside a press, a drag or a key, so the browser's
 *   autoplay policy is met rather than fought.
 * - A hidden page is silent: one-shots are dropped and running loops stop.
 * - Every voice is throttled, so a fast drag cannot stack a hundred ticks
 *   into a buzz, and the master bus is compressed, so a chord cannot clip.
 * - Loops belong to the component that started them and stop when it
 *   unmounts or when its sound is switched off.
 */

export type TactileTone =
  | "tick"
  | "detent"
  | "click"
  | "clack"
  | "thock"
  | "thud"
  | "snap"
  | "pop"
  | "plip"
  | "blup"
  | "gloop"
  | "whoosh"
  | "swish"
  | "paper"
  | "twang"
  | "chime"
  | "chord"
  | "note"
  | "shimmer"
  | "flare"
  | "whistle"
  | "rise"
  | "shrug"
  | "buzz";

export type TactileLoop =
  "hum" | "pour" | "sizzle" | "scratch" | "whir" | "creak" | "glug" | "slither";

export const TACTILE_TONES: readonly TactileTone[] = [
  "tick",
  "detent",
  "click",
  "clack",
  "thock",
  "thud",
  "snap",
  "pop",
  "plip",
  "blup",
  "gloop",
  "whoosh",
  "swish",
  "paper",
  "twang",
  "chime",
  "chord",
  "note",
  "shimmer",
  "flare",
  "whistle",
  "rise",
  "shrug",
  "buzz",
];

export const TACTILE_LOOPS: readonly TactileLoop[] = [
  "hum",
  "pour",
  "sizzle",
  "scratch",
  "whir",
  "creak",
  "glug",
  "slither",
];

export type ToneOptions = {
  /**
   * Pitch as a ratio of the voice's own register: 1 is native, 2 an octave
   * up. For `note`, it is a ratio of C5, so `semitones(n)` gives a scale.
   */
  pitch?: number;
  /** Loudness, 0 to 1, on top of the voice's own level. @default 1 */
  gain?: number;
  /** Stereo position, -1 (left) to 1 (right). See `panFrom`. @default 0 */
  pan?: number;
};

export type LoopHandle = {
  /** Glides the running loop to new values over a few milliseconds. */
  set: (options: ToneOptions) => void;
  /** Fades the loop out and releases it. Safe to call twice. */
  stop: () => void;
};

export type TactileSound = {
  play: (tone: TactileTone, options?: ToneOptions) => void;
  start: (loop: TactileLoop, options?: ToneOptions) => LoopHandle;
};

/** A frequency ratio for `n` semitones above the voice's register. */
export const semitones = (n: number): number => Math.pow(2, n / 12);

/**
 * A stereo position from a pointer's x: left edge of the element is -0.6,
 * right edge 0.6. Kept short of hard left and right, which reads as a
 * headphone trick rather than as a place on the screen.
 */
export const panFrom = (clientX: number, element?: Element | null): number => {
  if (typeof window === "undefined") return 0;
  const rect = element?.getBoundingClientRect();
  const left = rect ? rect.left : 0;
  const width = rect ? rect.width : window.innerWidth;
  if (width <= 0) return 0;
  const t = Math.min(1, Math.max(0, (clientX - left) / width));
  return Number(((t * 2 - 1) * 0.6).toFixed(3));
};

const MASTER = 0.55;
const SILENT: LoopHandle = { set: () => {}, stop: () => {} };

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let noise: AudioBuffer | null = null;
const lastPlayed = new Map<string, number>();
const running = new Set<LoopHandle>();
let watchingVisibility = false;

const hidden = (): boolean =>
  typeof document !== "undefined" && document.visibilityState === "hidden";

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor({ latencyHint: "interactive" });
    } catch {
      return null;
    }
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.12;
    bus = ctx.createGain();
    bus.gain.value = MASTER;
    bus.connect(compressor);
    compressor.connect(ctx.destination);
  }
  if (!watchingVisibility && typeof document !== "undefined") {
    watchingVisibility = true;
    document.addEventListener("visibilitychange", () => {
      if (hidden()) for (const loop of [...running]) loop.stop();
    });
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/** One second of white noise, made once and sliced by every noisy voice. */
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const length = c.sampleRate;
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  // A small LCG rather than Math.random: the same noise every session, so a
  // voice sounds the same the second time it is heard.
  let seed = 0x2f6b_1c3d;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffff_ffff) * 2 - 1;
  }
  noise = buffer;
  return buffer;
}

/** The end of every voice's chain: its own level, then its place in the field. */
function output(c: AudioContext, pan: number): GainNode {
  const level = c.createGain();
  if (typeof c.createStereoPanner === "function" && pan !== 0) {
    const panner = c.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    level.connect(panner);
    panner.connect(bus as GainNode);
  } else {
    level.connect(bus as GainNode);
  }
  return level;
}

/** An exponential attack and decay: silence, peak, silence. */
function envelope(
  param: AudioParam,
  t: number,
  peak: number,
  attack: number,
  decay: number,
): number {
  const top = Math.max(0.0002, peak);
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(top, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return t + attack + decay;
}

function tone(
  c: AudioContext,
  dest: AudioNode,
  type: OscillatorType,
  freq: number,
  t: number,
  peak: number,
  attack: number,
  decay: number,
  glideTo?: number,
): number {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, glideTo),
      t + attack + decay,
    );
  }
  const end = envelope(amp.gain, t, peak, attack, decay);
  osc.connect(amp);
  amp.connect(dest);
  osc.start(t);
  osc.stop(end + 0.02);
  return end;
}

function hiss(
  c: AudioContext,
  dest: AudioNode,
  t: number,
  peak: number,
  attack: number,
  decay: number,
  filter: {
    type: BiquadFilterType;
    freq: number;
    q?: number;
    sweepTo?: number;
  },
): number {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const band = c.createBiquadFilter();
  band.type = filter.type;
  band.frequency.setValueAtTime(filter.freq, t);
  band.Q.value = filter.q ?? 0.8;
  if (filter.sweepTo !== undefined) {
    band.frequency.exponentialRampToValueAtTime(
      Math.max(40, filter.sweepTo),
      t + attack + decay,
    );
  }
  const amp = c.createGain();
  const end = envelope(amp.gain, t, peak, attack, decay);
  src.connect(band);
  band.connect(amp);
  amp.connect(dest);
  const offset = (t * 7.31) % 0.8;
  src.start(t, offset);
  src.stop(end + 0.02);
  return end;
}

type Voice = (c: AudioContext, dest: AudioNode, t: number, p: number) => void;

const C5 = 523.25;

const VOICES: Record<TactileTone, Voice> = {
  tick: (c, d, t, p) => {
    tone(c, d, "triangle", 2400 * p, t, 0.32, 0.001, 0.028);
  },
  detent: (c, d, t, p) => {
    tone(c, d, "triangle", 1450 * p, t, 0.3, 0.001, 0.024);
    hiss(c, d, t, 0.12, 0.001, 0.01, { type: "highpass", freq: 4200 });
  },
  click: (c, d, t, p) => {
    hiss(c, d, t, 0.5, 0.001, 0.018, {
      type: "bandpass",
      freq: 3200 * p,
      q: 1.2,
    });
    tone(c, d, "sine", 1900 * p, t, 0.14, 0.001, 0.02);
  },
  clack: (c, d, t, p) => {
    hiss(c, d, t, 0.55, 0.001, 0.05, {
      type: "bandpass",
      freq: 1400 * p,
      q: 2,
    });
    tone(c, d, "triangle", 720 * p, t, 0.2, 0.001, 0.04);
  },
  thock: (c, d, t, p) => {
    tone(c, d, "sine", 190 * p, t, 0.7, 0.002, 0.12, 110 * p);
    hiss(c, d, t, 0.22, 0.001, 0.04, { type: "lowpass", freq: 900 });
  },
  thud: (c, d, t, p) => {
    tone(c, d, "sine", 110 * p, t, 0.8, 0.003, 0.2, 52 * p);
    hiss(c, d, t, 0.18, 0.002, 0.06, { type: "lowpass", freq: 400 });
  },
  snap: (c, d, t, p) => {
    hiss(c, d, t, 0.5, 0.001, 0.012, { type: "highpass", freq: 4500 });
    tone(c, d, "sine", 1300 * p, t, 0.2, 0.001, 0.025);
  },
  pop: (c, d, t, p) => {
    tone(c, d, "sine", 380 * p, t, 0.5, 0.002, 0.06, 1100 * p);
  },
  plip: (c, d, t, p) => {
    tone(c, d, "sine", 1000 * p, t, 0.34, 0.002, 0.07, 1700 * p);
  },
  blup: (c, d, t, p) => {
    tone(c, d, "sine", 280 * p, t, 0.55, 0.004, 0.15, 140 * p);
    tone(c, d, "sine", 560 * p, t + 0.012, 0.12, 0.004, 0.08, 300 * p);
  },
  gloop: (c, d, t, p) => {
    tone(c, d, "sine", 170 * p, t, 0.55, 0.01, 0.1, 330 * p);
    tone(c, d, "sine", 330 * p, t + 0.1, 0.45, 0.004, 0.16, 150 * p);
  },
  whoosh: (c, d, t, p) => {
    hiss(c, d, t, 0.42, 0.06, 0.28, {
      type: "bandpass",
      freq: 350 * p,
      q: 0.8,
      sweepTo: 2200 * p,
    });
  },
  swish: (c, d, t, p) => {
    hiss(c, d, t, 0.32, 0.02, 0.14, {
      type: "bandpass",
      freq: 1200 * p,
      q: 0.9,
      sweepTo: 4200 * p,
    });
  },
  paper: (c, d, t, p) => {
    // Paper is a crinkle, not a hiss: four short bursts at uneven spacing.
    const steps = [0, 0.026, 0.061, 0.093];
    steps.forEach((dt, i) => {
      hiss(c, d, t + dt, 0.3 - i * 0.05, 0.002, 0.03, {
        type: "bandpass",
        freq: (2600 - i * 180) * p,
        q: 0.7,
      });
    });
  },
  twang: (c, d, t, p) => {
    const osc = c.createOscillator();
    const lp = c.createBiquadFilter();
    const amp = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(196 * p, t);
    osc.frequency.exponentialRampToValueAtTime(178 * p, t + 0.4);
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(520, t + 0.36);
    const end = envelope(amp.gain, t, 0.3, 0.002, 0.44);
    osc.connect(lp);
    lp.connect(amp);
    amp.connect(d);
    osc.start(t);
    osc.stop(end + 0.02);
  },
  chime: (c, d, t, p) => {
    // Bell partials, not a harmonic stack: 1, 2.76 and 5.4 times the strike.
    tone(c, d, "sine", 880 * p, t, 0.24, 0.003, 1.1);
    tone(c, d, "sine", 880 * 2.76 * p, t, 0.07, 0.003, 0.6);
    tone(c, d, "sine", 880 * 5.4 * p, t, 0.03, 0.002, 0.3);
  },
  chord: (c, d, t, p) => {
    [0, 4, 7].forEach((n, i) => {
      tone(c, d, "sine", C5 * p * semitones(n), t + i * 0.03, 0.18, 0.005, 0.6);
      tone(
        c,
        d,
        "triangle",
        C5 * p * semitones(n),
        t + i * 0.03,
        0.05,
        0.005,
        0.4,
      );
    });
  },
  note: (c, d, t, p) => {
    tone(c, d, "sine", C5 * p, t, 0.26, 0.005, 0.45);
    tone(c, d, "triangle", C5 * p, t, 0.07, 0.005, 0.3);
  },
  shimmer: (c, d, t, p) => {
    [0, 3, 7, 10, 14, 19].forEach((n, i) => {
      tone(
        c,
        d,
        "sine",
        1180 * p * semitones(n),
        t + i * 0.042,
        0.1,
        0.004,
        0.26,
      );
    });
  },
  flare: (c, d, t, p) => {
    hiss(c, d, t, 0.55, 0.004, 0.5, {
      type: "lowpass",
      freq: 6000 * p,
      q: 0.6,
      sweepTo: 480,
    });
    tone(c, d, "sine", 72 * p, t, 0.5, 0.004, 0.3, 44 * p);
  },
  whistle: (c, d, t, p) => {
    tone(c, d, "sine", 1800 * p, t, 0.16, 0.02, 0.46, 520 * p);
  },
  rise: (c, d, t, p) => {
    tone(c, d, "sine", 400 * p, t, 0.26, 0.02, 0.26, 900 * p);
  },
  shrug: (c, d, t, p) => {
    tone(c, d, "sine", 520 * p, t, 0.2, 0.01, 0.12, 470 * p);
    tone(c, d, "sine", 440 * p, t + 0.13, 0.18, 0.01, 0.18, 380 * p);
  },
  buzz: (c, d, t, p) => {
    const osc = c.createOscillator();
    const tremolo = c.createOscillator();
    const depth = c.createGain();
    const lp = c.createBiquadFilter();
    const amp = c.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(98 * p, t);
    tremolo.frequency.setValueAtTime(28, t);
    depth.gain.value = 0.35;
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const end = envelope(amp.gain, t, 0.22, 0.006, 0.2);
    tremolo.connect(depth);
    depth.connect(amp.gain);
    osc.connect(lp);
    lp.connect(amp);
    amp.connect(d);
    osc.start(t);
    tremolo.start(t);
    osc.stop(end + 0.02);
    tremolo.stop(end + 0.02);
  },
};

/** How often each voice may sound, in ms. Short voices can repeat quickly. */
const MIN_GAP: Partial<Record<TactileTone, number>> = {
  tick: 16,
  detent: 16,
  click: 20,
  snap: 20,
  note: 24,
  plip: 30,
};

/** Plays one voice now. Returns quietly when sound is unavailable or hidden. */
export function playTone(name: TactileTone, options: ToneOptions = {}): void {
  if (hidden()) return;
  const c = context();
  if (!c || !bus) return;
  const now = performance.now();
  const gap = MIN_GAP[name] ?? 30;
  const last = lastPlayed.get(name) ?? -Infinity;
  if (now - last < gap) return;
  lastPlayed.set(name, now);
  const level = output(c, options.pan ?? 0);
  level.gain.value = Math.max(0, Math.min(1, options.gain ?? 1));
  const pitch = Math.max(0.25, Math.min(4, options.pitch ?? 1));
  VOICES[name](c, level, c.currentTime + 0.002, pitch);
  // The per-voice nodes stop themselves; the level node is released with them.
  window.setTimeout(() => level.disconnect(), 2000);
}

type LoopBuild = {
  /** Sources to start and stop. */
  sources: AudioScheduledSourceNode[];
  /** Applies pitch to whatever carries it for this loop. */
  tune: (pitch: number, at: number) => void;
  /** The loop's own ceiling, so `gain: 1` is a sensible level. */
  level: number;
};

function buildLoop(
  c: AudioContext,
  name: TactileLoop,
  into: AudioNode,
): LoopBuild {
  const noiseSource = () => {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    return src;
  };
  switch (name) {
    case "hum": {
      const a = c.createOscillator();
      const b = c.createOscillator();
      const lp = c.createBiquadFilter();
      a.type = "sine";
      b.type = "sine";
      lp.type = "lowpass";
      lp.frequency.value = 800;
      a.connect(lp);
      b.connect(lp);
      lp.connect(into);
      return {
        sources: [a, b],
        tune: (p, at) => {
          a.frequency.setTargetAtTime(110 * p, at, 0.03);
          b.frequency.setTargetAtTime(220.6 * p, at, 0.03);
        },
        level: 0.14,
      };
    }
    case "pour": {
      // A bottle filling rises in pitch as the air column above it shortens:
      // the resonant band climbs with `pitch`, which callers tie to the level.
      const src = noiseSource();
      const body = c.createBiquadFilter();
      const ring = c.createBiquadFilter();
      body.type = "bandpass";
      body.Q.value = 5;
      ring.type = "bandpass";
      ring.Q.value = 12;
      src.connect(body);
      src.connect(ring);
      body.connect(into);
      ring.connect(into);
      return {
        sources: [src],
        tune: (p, at) => {
          body.frequency.setTargetAtTime(420 * p, at, 0.05);
          ring.frequency.setTargetAtTime(840 * p, at, 0.05);
        },
        level: 0.5,
      };
    }
    case "sizzle": {
      const src = noiseSource();
      const hp = c.createBiquadFilter();
      const crackle = c.createOscillator();
      const depth = c.createGain();
      const amp = c.createGain();
      hp.type = "highpass";
      hp.frequency.value = 3000;
      crackle.type = "square";
      crackle.frequency.value = 13;
      depth.gain.value = 0.45;
      amp.gain.value = 0.55;
      crackle.connect(depth);
      depth.connect(amp.gain);
      src.connect(hp);
      hp.connect(amp);
      amp.connect(into);
      return {
        sources: [src, crackle],
        tune: (p, at) => {
          hp.frequency.setTargetAtTime(3000 * p, at, 0.05);
          crackle.frequency.setTargetAtTime(13 * p, at, 0.05);
        },
        level: 0.3,
      };
    }
    case "scratch": {
      const src = noiseSource();
      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.Q.value = 3;
      src.connect(band);
      band.connect(into);
      return {
        sources: [src],
        tune: (p, at) => band.frequency.setTargetAtTime(800 * p, at, 0.015),
        level: 0.7,
      };
    }
    case "whir": {
      const osc = c.createOscillator();
      const lp = c.createBiquadFilter();
      osc.type = "sawtooth";
      lp.type = "lowpass";
      osc.connect(lp);
      lp.connect(into);
      return {
        sources: [osc],
        tune: (p, at) => {
          osc.frequency.setTargetAtTime(60 * p, at, 0.04);
          lp.frequency.setTargetAtTime(500 * p, at, 0.04);
        },
        level: 0.16,
      };
    }
    case "creak": {
      const osc = c.createOscillator();
      const jitter = c.createOscillator();
      const jitterDepth = c.createGain();
      const lp = c.createBiquadFilter();
      osc.type = "sawtooth";
      jitter.type = "triangle";
      jitter.frequency.value = 23;
      jitterDepth.gain.value = 9;
      lp.type = "lowpass";
      lp.frequency.value = 1100;
      lp.Q.value = 4;
      jitter.connect(jitterDepth);
      jitterDepth.connect(osc.frequency);
      osc.connect(lp);
      lp.connect(into);
      return {
        sources: [osc, jitter],
        tune: (p, at) => osc.frequency.setTargetAtTime(72 * p, at, 0.03),
        level: 0.12,
      };
    }
    case "glug": {
      const src = noiseSource();
      const lp = c.createBiquadFilter();
      const burble = c.createOscillator();
      const depth = c.createGain();
      const amp = c.createGain();
      lp.type = "lowpass";
      lp.Q.value = 9;
      burble.type = "sine";
      burble.frequency.value = 7;
      depth.gain.value = 0.5;
      amp.gain.value = 0.5;
      burble.connect(depth);
      depth.connect(amp.gain);
      src.connect(lp);
      lp.connect(amp);
      amp.connect(into);
      return {
        sources: [src, burble],
        tune: (p, at) => {
          lp.frequency.setTargetAtTime(380 * p, at, 0.05);
          burble.frequency.setTargetAtTime(7 * p, at, 0.05);
        },
        level: 0.6,
      };
    }
    case "slither": {
      const src = noiseSource();
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      src.connect(lp);
      lp.connect(into);
      return {
        sources: [src],
        tune: (p, at) => lp.frequency.setTargetAtTime(700 * p, at, 0.03),
        level: 0.22,
      };
    }
  }
}

/** Starts a continuous voice. Returns a handle that glides and stops it. */
export function startLoop(
  name: TactileLoop,
  options: ToneOptions = {},
): LoopHandle {
  if (hidden()) return SILENT;
  const c = context();
  if (!c || !bus) return SILENT;
  const level = output(c, options.pan ?? 0);
  const built = buildLoop(c, name, level);
  const at = c.currentTime;
  const target = (gain: number) => built.level * Math.max(0, Math.min(1, gain));
  built.tune(Math.max(0.25, Math.min(4, options.pitch ?? 1)), at);
  level.gain.setValueAtTime(0.0001, at);
  level.gain.setTargetAtTime(target(options.gain ?? 1), at, 0.03);
  for (const source of built.sources) source.start(at);
  let stopped = false;
  const handle: LoopHandle = {
    set: (next) => {
      if (stopped || !ctx) return;
      const now = ctx.currentTime;
      if (next.pitch !== undefined) {
        built.tune(Math.max(0.25, Math.min(4, next.pitch)), now);
      }
      if (next.gain !== undefined) {
        level.gain.setTargetAtTime(target(next.gain), now, 0.03);
      }
    },
    stop: () => {
      if (stopped || !ctx) return;
      stopped = true;
      running.delete(handle);
      const now = ctx.currentTime;
      level.gain.cancelScheduledValues(now);
      level.gain.setTargetAtTime(0.0001, now, 0.025);
      for (const source of built.sources) source.stop(now + 0.15);
      window.setTimeout(() => level.disconnect(), 400);
    },
  };
  running.add(handle);
  return handle;
}

/**
 * The component-facing hook. `enabled` is the component's `sound` prop:
 * false (the default everywhere) makes both functions no-ops that never
 * create an AudioContext. Loops started through the hook stop when the
 * component unmounts or when `enabled` turns off.
 */
export function useTactileSound(enabled = false): TactileSound {
  const [owned] = React.useState(() => new Set<LoopHandle>());

  React.useEffect(() => {
    if (enabled) return;
    for (const loop of owned) loop.stop();
    owned.clear();
  }, [enabled, owned]);

  React.useEffect(
    () => () => {
      for (const loop of owned) loop.stop();
      owned.clear();
    },
    [owned],
  );

  return React.useMemo<TactileSound>(
    () => ({
      play: (name, options) => {
        if (enabled) playTone(name, options);
      },
      start: (name, options) => {
        if (!enabled) return SILENT;
        const loop = startLoop(name, options);
        if (loop === SILENT) return SILENT;
        owned.add(loop);
        return {
          set: loop.set,
          stop: () => {
            owned.delete(loop);
            loop.stop();
          },
        };
      },
    }),
    [enabled, owned],
  );
}
