"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { semitones, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FibreLampProps = {
  /** How many fibres rise from the base, 24 to 200. @default 96 */
  strandCount?: number;
  /** How much the bundle breathes on its own and how far a breeze bends it, 0 to 1. @default 0.4 */
  sway?: number;
  /** How fast the colour wheel turns by itself, in colours a second; 0 holds a colour. @default 0.1 */
  hueSpeed?: number;
  /** The colour wheel, as CSS colours in order round it. Pigment: they read the same in either theme. @default rose, amber, lime, teal, cobalt, violet */
  colors?: readonly string[];
  /** A name for each colour of the wheel, for the lamp's accessible name and announcements. @default "Rose", "Amber", "Lime", "Teal", "Cobalt", "Violet" */
  names?: readonly string[];
  /** How long a new colour takes to climb to the longest tips, in ms. @default 1100 */
  travel?: number;
  /** The fan's angle, in degrees. @default 140 */
  spread?: number;
  /** The fibres' length, 0.4 to 1 of the room above the base. @default 0.92 */
  reach?: number;
  /** How bright the tips are and how far their halo spreads, 0 to 1. @default 0.7 */
  glow?: number;
  /** How hard the pointer's breeze pushes the bundle, 0 to 1. @default 0.6 */
  breeze?: number;
  /** The wheel's colour when the lamp first lights, as an index into `colors`. @default 0 */
  defaultIndex?: number;
  /** The pointer, keys and presses reach the lamp. @default true */
  interactive?: boolean;
  /** Hold the bundle and the wheel still. @default false */
  paused?: boolean;
  /** Names the lamp for assistive technology; the colour is added to it. @default "Fibre lamp" */
  label?: string;
  /** Hum while a new colour climbs the fibres. Off unless asked for. @default false */
  sound?: boolean;
  /** Seeds how the fibres fan and sway, so two lamps never match. @default 5 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a press or a key advances the wheel, with the colour's index. */
  onAdvance?: (index: number) => void;
  /** Shows the lamp but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box; give it a height. @default "h-56 w-full" */
  className?: string;
};

/** Pigments at one lightness round the wheel, so no colour shouts. */
const WHEEL = [
  "oklch(0.78 0.13 12)",
  "oklch(0.82 0.13 70)",
  "oklch(0.85 0.15 128)",
  "oklch(0.8 0.11 190)",
  "oklch(0.72 0.14 262)",
  "oklch(0.74 0.14 318)",
] as const;

const WHEEL_NAMES = ["Rose", "Amber", "Lime", "Teal", "Cobalt", "Violet"];

/** Steps of colour between two wheel colours in the lookup. */
const STEPS = 16;
/** Points along a fibre. */
const SEG = 8;
/** Samples of the wheel's past, for the colour climbing the fibres. */
const TABLE = 24;
/** The springs integrate at 120 Hz. */
const STEP = 1 / 120;
/** A pentatonic climb for the hum, one step per colour. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
/**
 * Each fibre springs back with the recoil spring's damping ratio — two
 * visible bounces — at a frequency set by its own length.
 */
const ZETA =
  springs.recoil.damping /
  (2 * Math.sqrt(springs.recoil.stiffness * springs.recoil.mass));
const SNAP = springs.snap;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const mod = (v: number, m: number) => ((v % m) + m) % m;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A small seeded generator: the same fan for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Lab = [number, number, number];

const lin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const gam = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

/** sRGB bytes to OKLab, so the wheel's in-between colours keep their brightness. */
function toLab(r: number, g: number, b: number): Lab {
  const R = lin(r / 255);
  const G = lin(g / 255);
  const B = lin(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromLab([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const byte = (c: number) => Math.round(clamp01(gam(clamp01(c))) * 255);
  return [byte(R), byte(G), byte(B)];
}

type Rgb = readonly [number, number, number];

type Palette = {
  /** The wheel's colours, n × STEPS of them, as rgb triples. */
  rgb: Rgb[];
  /** The same as CSS strings: the bead at a tip, a fibre's tint. */
  core: string[];
  tint: string[];
  /** Halo and pool sprites, made the first time a colour needs one. */
  halo: (CanvasGradient | null)[];
  pool: (CanvasGradient | null)[];
  /** The unlit fibre, the base's rim and whether the page is dark. */
  fibre: string;
  rim: string;
  dark: boolean;
};

type Strands = {
  n: number;
  /** Rest angle from upright, rad; length as a share of the longest; the bend it holds at rest. */
  angle: Float32Array;
  len: Float32Array;
  bend: Float32Array;
  /** Where it leaves the collar, -1..1 across it. */
  slot: Float32Array;
  phase: Float32Array;
  /** The lean the breeze gives it, rad, and how fast that is changing. */
  lean: Float32Array;
  leanV: Float32Array;
  /** The bloom at its tip as a colour arrives, 0..1. */
  bloom: Float32Array;
  /** Each fibre's points this frame, x and y in turn. */
  pts: Float32Array;
};

type Geometry = {
  w: number;
  h: number;
  dpr: number;
  cx: number;
  yBase: number;
  yCollar: number;
  baseW: number;
  baseH: number;
  collarW: number;
  longest: number;
};

type Wheel = {
  /** Where the wheel is, in colours (unbounded), where it is heading, and how fast. */
  at: number;
  to: number;
  v: number;
  /** The wheel's recent past, so a colour can climb the fibres behind it. */
  times: Float64Array;
  values: Float64Array;
  head: number;
  filled: number;
  /** The past sampled evenly back over the climb, this frame. */
  table: Float64Array;
  /** Reduced motion: a short crossfade from one colour to the next. */
  fadeFrom: number;
  fadeStart: number;
};

type Air = {
  x: number;
  y: number;
  vx: number;
  t: number;
  present: boolean;
  /** How much the hand is felt, eased so it never snaps in or out. */
  felt: number;
  /** A keyboard gust's lean, rad, dying away. */
  gust: number;
};

type Api = {
  resize: () => void;
  readColours: () => void;
  kick: () => void;
  tick: (now: number) => void;
  draw: (now: number) => void;
  rebuild: () => void;
};

function makeStrands(count: number, seed: number, spread: number): Strands {
  const rand = lcg(seed);
  const n = clamp(Math.round(count), 24, 200);
  const angle = new Float32Array(n);
  const len = new Float32Array(n);
  const bend = new Float32Array(n);
  const slot = new Float32Array(n);
  const phase = new Float32Array(n);
  const half = ((clamp(spread, 30, 200) / 2) * Math.PI) / 180;
  for (let i = 0; i < n; i += 1) {
    // Stratified across the fan with a little jitter, denser near upright.
    const r = clamp(((i + 0.5 + (rand() - 0.5) * 0.8) / n) * 2 - 1, -1, 1);
    const ar = Math.abs(r);
    angle[i] = half * Math.sign(r) * Math.pow(ar, 1.2);
    len[i] = (0.6 + 0.4 * (1 - r * r)) * (0.93 + 0.07 * rand());
    // Outer fibres fall away further toward their tips, like a fountain.
    bend[i] = 0.78 * Math.sign(r) * Math.pow(ar, 1.3);
    slot[i] = r;
    phase[i] = rand() * Math.PI * 2;
  }
  return {
    n,
    angle,
    len,
    bend,
    slot,
    phase,
    lean: new Float32Array(n),
    leanV: new Float32Array(n),
    bloom: new Float32Array(n),
    pts: new Float32Array(n * (SEG + 1) * 2),
  };
}

/** The lamp's geometry for a box, in CSS px: the fan never leaves it. */
function geometryFor(
  w: number,
  h: number,
  reach: number,
): Omit<Geometry, "dpr"> {
  const pad = 8;
  const baseW = clamp(Math.min(w * 0.3, h * 0.42), 34, 150);
  const baseH = baseW * 0.46;
  const yBase = h - pad - baseH * 0.08;
  const yCollar = yBase - baseH;
  const up = yCollar - pad - 6;
  const side = w / 2 - pad - 8;
  const longest = Math.max(
    10,
    Math.min(up, side / 0.78) * clamp(reach, 0.4, 1),
  );
  return {
    w,
    h,
    cx: w / 2,
    yBase,
    yCollar,
    baseW,
    baseH,
    collarW: baseW * 0.3,
    longest,
  };
}

/**
 * A fibre-optic lamp on one Canvas 2D layer: a fan of fine fibres rises from
 * the collar of a weighted base, each dark along its length and bright only
 * at its tip. A colour wheel turns inside the base — its rim shows through a
 * lens window — and every new colour climbs the fibres with a delay set by
 * each fibre's length, so the tips always trail the base and bloom one after
 * another as the colour reaches them.
 *
 * Pointer movement is a breeze the bundle leans away from: every fibre's lean
 * is its own oscillator with the recoil spring's damping and a frequency
 * that falls with its length, so the dome ripples back out of a gust. A
 * press or Enter advances the wheel one colour on the snap spring. Arrow keys
 * send a gust from either side. Under reduced motion the fibres are still,
 * the wheel holds, and an advance crossfades the whole bundle to its new
 * colour.
 */
export function FibreLamp({
  strandCount = 96,
  sway = 0.4,
  hueSpeed = 0.1,
  colors = WHEEL,
  names = WHEEL_NAMES,
  travel = 1100,
  spread = 140,
  reach = 0.92,
  glow = 0.7,
  breeze = 0.6,
  defaultIndex = 0,
  interactive = true,
  paused = false,
  label = "Fibre lamp",
  sound = false,
  seed = 5,
  dpr = 2,
  onAdvance,
  disabled = false,
  className,
}: FibreLampProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const wheelColours = colors.length >= 2 ? colors : WHEEL;
  const n = wheelColours.length;
  const start = mod(Math.round(defaultIndex), n);
  const paintKey = wheelColours.join("|");

  const [index, setIndex] = React.useState(start);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const name = names[mod(index, n)] ?? `Colour ${mod(index, n) + 1}`;

  const k = {
    count: clamp(Math.round(strandCount), 24, 200),
    sway: clamp01(sway),
    hueSpeed: clamp(hueSpeed, 0, 2),
    travel: clamp(travel, 100, 6000) / 1000,
    spread: clamp(spread, 30, 200),
    reach: clamp(reach, 0.4, 1),
    glow: clamp01(glow),
    breeze: clamp01(breeze),
    paused,
    seed,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    enabled: interactive && !disabled,
    n,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const shownIndex = React.useRef(start);
  const pressFrom = React.useRef({ x: 0, y: 0, moved: false });
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const geo = React.useRef<Geometry | null>(null);
  const palette = React.useRef<Palette | null>(null);
  const strands = React.useRef<Strands | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const last = React.useRef(0);
  const carry = React.useRef(0);
  const clock = React.useRef(0);
  const shown = React.useRef(false);
  const hum = React.useRef<ReturnType<typeof audio.start> | null>(null);
  const humTimer = React.useRef<number | null>(null);
  const climbUntil = React.useRef(0);
  const wheel = React.useRef<Wheel>({
    at: start,
    to: start,
    v: 0,
    times: new Float64Array(256),
    values: new Float64Array(256),
    head: 0,
    filled: 0,
    table: new Float64Array(TABLE),
    fadeFrom: start,
    fadeStart: -1,
  });
  const air = React.useRef<Air>({
    x: 0,
    y: 0,
    vx: 0,
    t: 0,
    present: false,
    felt: 0,
    gust: 0,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onAdvance });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const readColours = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const read = (
      el: Element | undefined,
    ): [number, number, number, number] => {
      if (!el) return [0, 0, 0, 0];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(el).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 255) / 255];
    };
    const spans = carriers.children;
    const fibre = read(spans[0]);
    const rim = read(spans[1]);
    const page = read(spans[2]);
    const labs: Lab[] = [];
    for (let i = 0; i < k.n; i += 1) {
      const c = read(spans[3 + i]);
      labs.push(toLab(c[0], c[1], c[2]));
    }
    const lum = (0.2126 * page[0] + 0.7152 * page[1] + 0.0722 * page[2]) / 255;
    const dark = lum < 0.45;
    const rgb: Rgb[] = [];
    const core: string[] = [];
    const tint: string[] = [];
    for (let i = 0; i < k.n; i += 1) {
      const a = labs[i] ?? [0.7, 0, 0];
      const b = labs[(i + 1) % k.n] ?? a;
      for (let s = 0; s < STEPS; s += 1) {
        const t = s / STEPS;
        const mixed: Lab = [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t,
        ];
        const c = fromLab(mixed);
        rgb.push(c);
        // On a dark page the bead is the colour run toward white, as a lit
        // bead is; on a light one it is the colour deepened, so it still
        // reads as coloured light rather than a pale smudge.
        const hot = fromLab(
          dark
            ? [Math.min(1, mixed[0] + 0.12), mixed[1] * 0.6, mixed[2] * 0.6]
            : [mixed[0] - 0.14, mixed[1] * 1.15, mixed[2] * 1.15],
        );
        core.push(`rgb(${hot[0]} ${hot[1]} ${hot[2]})`);
        tint.push(`rgb(${c[0]} ${c[1]} ${c[2]})`);
      }
    }
    palette.current = {
      rgb,
      core,
      tint,
      halo: new Array<CanvasGradient | null>(rgb.length).fill(null),
      pool: new Array<CanvasGradient | null>(rgb.length).fill(null),
      fibre: `rgb(${fibre[0]} ${fibre[1]} ${fibre[2]} / ${r1(fibre[3] * 100) / 100})`,
      rim: `rgb(${rim[0]} ${rim[1]} ${rim[2]} / ${r1(rim[3] * 100) / 100})`,
      dark,
    };
  };

  const rebuild = () => {
    strands.current = makeStrands(k.count, k.seed, k.spread);
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const d = Math.min(k.dpr, window.devicePixelRatio || 1);
    const was = geo.current;
    if (!was || was.w !== w || was.h !== h || was.dpr !== d) {
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(h * d);
    }
    geo.current = { ...geometryFor(w, h, k.reach), dpr: d };
  };

  /** The wheel's colour index in the lookup for a wheel position. */
  const lookup = (at: number) => mod(Math.round(at * STEPS), k.n * STEPS);

  /** The wheel where it was `ago` seconds back, from its recorded past. */
  const pastAt = (W: Wheel, now: number, ago: number) => {
    const target = now - ago;
    const size = W.times.length;
    let newer = -1;
    for (let c = 0; c < W.filled; c += 1) {
      const i = mod(W.head - 1 - c, size);
      const t = W.times[i] ?? 0;
      if (t <= target) {
        if (newer < 0) return W.values[i] ?? W.at;
        const t1 = W.times[newer] ?? t;
        const span = t1 - t;
        const f = span > 1e-6 ? (target - t) / span : 0;
        const v0 = W.values[i] ?? 0;
        return v0 + ((W.values[newer] ?? v0) - v0) * f;
      }
      newer = i;
    }
    return W.filled ? (W.values[mod(W.head - W.filled, size)] ?? W.at) : W.at;
  };

  /** The wheel as it was `delay` seconds ago, from this frame's table. */
  const pastFor = (delay: number) => {
    const tbl = wheel.current.table;
    const q = clamp((delay / k.travel) * (TABLE - 1), 0, TABLE - 1);
    const j = Math.floor(q);
    const f = q - j;
    const a = tbl[j] ?? 0;
    return a + ((tbl[Math.min(TABLE - 1, j + 1)] ?? a) - a) * f;
  };

  const halo = (P: Palette, ctx: CanvasRenderingContext2D, i: number) => {
    const cached = P.halo[i];
    if (cached) return cached;
    const c = P.rgb[i] ?? [255, 255, 255];
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgb(${c[0]} ${c[1]} ${c[2]} / 0.9)`);
    g.addColorStop(0.28, `rgb(${c[0]} ${c[1]} ${c[2]} / 0.38)`);
    g.addColorStop(1, `rgb(${c[0]} ${c[1]} ${c[2]} / 0)`);
    P.halo[i] = g;
    return g;
  };

  const pool = (P: Palette, ctx: CanvasRenderingContext2D, i: number) => {
    const cached = P.pool[i];
    if (cached) return cached;
    const c = P.rgb[i] ?? [255, 255, 255];
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgb(${c[0]} ${c[1]} ${c[2]} / 0.34)`);
    g.addColorStop(0.5, `rgb(${c[0]} ${c[1]} ${c[2]} / 0.12)`);
    g.addColorStop(1, `rgb(${c[0]} ${c[1]} ${c[2]} / 0)`);
    P.pool[i] = g;
    return g;
  };

  /** Advances the wheel, the breeze and every fibre's lean; says whether anything moves. */
  const advance = (dt: number, now: number): boolean => {
    const S = strands.current;
    const G = geo.current;
    const W = wheel.current;
    const A = air.current;
    if (!S || !G) return false;
    if (k.paused) return false;
    clock.current += dt;
    W.to += k.hueSpeed * dt;
    const reachR = G.longest * 0.8;
    // `sway` is also how far a breeze can bend the bundle.
    const give = k.breeze * (0.5 + k.sway);
    A.felt += ((A.present ? 1 : 0) - A.felt) * (1 - Math.exp(-dt / 0.15));
    A.vx *= Math.exp(-dt / 0.2);
    carry.current += dt;
    let steps = 0;
    let leaning = false;
    while (carry.current >= STEP && steps < 8) {
      carry.current -= STEP;
      steps += 1;
      const aw =
        (-SNAP.stiffness * (W.at - W.to) - SNAP.damping * W.v) / SNAP.mass;
      W.v += aw * STEP;
      W.at += W.v * STEP;
      A.gust *= Math.exp(-STEP / 0.32);
      for (let i = 0; i < S.n; i += 1) {
        const L = S.len[i] ?? 1;
        // A long fibre is a slow pendulum, a short one quick.
        const w0 = 9 / Math.sqrt(L);
        let target = A.gust * (1 - 0.25 * Math.abs(S.slot[i] ?? 0));
        if (A.felt > 0.001) {
          const a = (S.angle[i] ?? 0) + (S.bend[i] ?? 0) * 0.6;
          const qx = G.cx + Math.sin(a) * G.longest * L * 0.7;
          const qy = G.yCollar - Math.cos(a) * G.longest * L * 0.7;
          const dx = qx - A.x;
          const dy = qy - A.y;
          const f = Math.exp(-(dx * dx + dy * dy) / (reachR * reachR));
          // A still hand pushes the fibres either side of it apart; a moving
          // one blows them the way it goes.
          target +=
            give *
            A.felt *
            f *
            (0.95 * Math.tanh(dx / 24) + clamp(A.vx / 600, -1.6, 1.6));
        }
        target = clamp(target, -1.3, 1.3);
        const lean = S.lean[i] ?? 0;
        const v = S.leanV[i] ?? 0;
        const acc = -w0 * w0 * (lean - target) - 2 * ZETA * w0 * v;
        const nv = v + acc * STEP;
        S.leanV[i] = nv;
        S.lean[i] = lean + nv * STEP;
        if (Math.abs(nv) > 0.002 || Math.abs(lean - target) > 0.002)
          leaning = true;
      }
    }
    if (steps === 8) carry.current = 0;
    // The wheel's past, for the colour climbing behind it.
    const size = W.times.length;
    W.times[W.head] = now / 1000;
    W.values[W.head] = W.at;
    W.head = (W.head + 1) % size;
    W.filled = Math.min(size, W.filled + 1);
    const turning =
      k.hueSpeed > 0 || Math.abs(W.at - W.to) > 1e-4 || Math.abs(W.v) > 1e-3;
    if (!turning) {
      W.at = W.to;
      W.v = 0;
    }
    const swaying = k.sway > 0;
    const blooming = now / 1000 < climbUntil.current;
    let blooms = false;
    for (let i = 0; i < S.n; i += 1) {
      const b = (S.bloom[i] ?? 0) * Math.exp(-dt / 0.32);
      S.bloom[i] = b < 0.004 ? 0 : b;
      if (b >= 0.004) blooms = true;
    }
    return (
      swaying ||
      turning ||
      leaning ||
      blooming ||
      blooms ||
      A.felt > 0.001 ||
      Math.abs(A.gust) > 0.001
    );
  };

  /** Lays every fibre's points for this frame. */
  const layFibres = () => {
    const S = strands.current;
    const G = geo.current;
    if (!S || !G) return;
    const t = clock.current;
    const live = k.motionSafe;
    const swayAmt = live ? k.sway : 0;
    const swell = 0.06 * Math.sin(0.8 * t) + 0.025 * Math.sin(1.7 * t + 1.1);
    for (let i = 0; i < S.n; i += 1) {
      const L = (S.len[i] ?? 1) * G.longest;
      const seg = L / SEG;
      const a0 = S.angle[i] ?? 0;
      const bend = S.bend[i] ?? 0;
      const lean = live ? (S.lean[i] ?? 0) : 0;
      const own =
        swayAmt * (swell + 0.035 * Math.sin(1.9 * t + (S.phase[i] ?? 0)));
      let x = G.cx + (S.slot[i] ?? 0) * G.collarW * 0.38;
      let y = G.yCollar + 1;
      const o = i * (SEG + 1) * 2;
      S.pts[o] = x;
      S.pts[o + 1] = y;
      for (let s = 0; s < SEG; s += 1) {
        const f = (s + 0.5) / SEG;
        const a =
          a0 +
          bend * Math.pow(f, 1.3) +
          lean * Math.pow(f, 1.6) +
          own * f * f * 3;
        x += seg * Math.sin(a);
        y -= seg * Math.cos(a);
        S.pts[o + (s + 1) * 2] = x;
        S.pts[o + (s + 1) * 2 + 1] = y;
      }
    }
  };

  const draw = (now: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const G = geo.current;
    const P = palette.current;
    const S = strands.current;
    const W = wheel.current;
    if (!canvas || !ctx || !G || !P || !S || !visible.current) return;
    layFibres();
    const d = G.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, G.w, G.h);
    const secs = now / 1000;
    const live = k.motionSafe;
    // Under reduced motion one colour fills the bundle, crossfading on change.
    let still = W.at;
    if (!live && W.fadeStart >= 0) {
      const f = clamp01((secs - W.fadeStart) / durations.base);
      still = W.fadeFrom + (W.at - W.fadeFrom) * f;
    }
    const tbl = W.table;
    for (let j = 0; j < TABLE; j += 1) {
      tbl[j] = live ? pastAt(W, secs, (j / (TABLE - 1)) * k.travel) : still;
    }
    const baseAt = tbl[0] ?? W.at;
    const baseIdx = lookup(baseAt);
    const additive = P.dark ? "lighter" : "source-over";

    // The pool of coloured light on the surface round the base.
    ctx.globalCompositeOperation = additive;
    ctx.setTransform(
      G.baseW * 1.5 * d,
      0,
      0,
      G.baseH * 0.55 * d,
      G.cx * d,
      G.yBase * d,
    );
    ctx.fillStyle = pool(P, ctx, baseIdx);
    ctx.globalAlpha = P.dark ? 0.9 : 0.7;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(d, 0, 0, d, 0, 0);

    // The fibres, unlit: one path.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = P.fibre;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const stride = (SEG + 1) * 2;
    for (let i = 0; i < S.n; i += 1) {
      const o = i * stride;
      ctx.moveTo(S.pts[o] ?? 0, S.pts[o + 1] ?? 0);
      for (let s = 1; s <= SEG; s += 1)
        ctx.lineTo(S.pts[o + s * 2] ?? 0, S.pts[o + s * 2 + 1] ?? 0);
    }
    ctx.stroke();

    // Light carried inside the glass: the upper half of each fibre tinted
    // with the colour that has reached it, stronger toward the tip.
    ctx.lineWidth = 0.9;
    for (let i = 0; i < S.n; i += 1) {
      const o = i * stride;
      const delay = (S.len[i] ?? 1) * k.travel;
      for (let s = SEG / 2; s < SEG; s += 1) {
        const f = (s + 1) / SEG;
        ctx.globalAlpha = (P.dark ? 0.16 : 0.22) + 0.42 * (f - 0.5) * 2;
        ctx.strokeStyle = P.tint[lookup(pastFor(delay * f))] ?? P.fibre;
        ctx.beginPath();
        ctx.moveTo(S.pts[o + s * 2] ?? 0, S.pts[o + s * 2 + 1] ?? 0);
        ctx.lineTo(
          S.pts[o + (s + 1) * 2] ?? 0,
          S.pts[o + (s + 1) * 2 + 1] ?? 0,
        );
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // The tips: a halo, then a bead. A colour arriving fast makes it bloom.
    ctx.globalCompositeOperation = additive;
    const haloR = 2.6 + 3.4 * k.glow;
    for (let i = 0; i < S.n; i += 1) {
      const o = i * stride + SEG * 2;
      const x = S.pts[o] ?? 0;
      const y = S.pts[o + 1] ?? 0;
      const delay = (S.len[i] ?? 1) * k.travel;
      const at = pastFor(delay);
      if (live) {
        const rate =
          Math.abs(at - pastFor(Math.min(k.travel, delay + 0.05))) * 20;
        if (rate > 0.35)
          S.bloom[i] = Math.max(S.bloom[i] ?? 0, Math.min(1, rate / 3));
      }
      const b = S.bloom[i] ?? 0;
      const r = haloR * (1 + b * 0.9);
      ctx.globalAlpha = (P.dark ? 0.55 : 0.3) * (0.5 + 0.5 * k.glow) + b * 0.3;
      ctx.setTransform(r * d, 0, 0, r * d, x * d, y * d);
      ctx.fillStyle = halo(P, ctx, lookup(at));
      ctx.fillRect(-1, -1, 2, 2);
    }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    for (let i = 0; i < S.n; i += 1) {
      const o = i * stride + SEG * 2;
      const delay = (S.len[i] ?? 1) * k.travel;
      ctx.fillStyle = P.core[lookup(pastFor(delay))] ?? P.fibre;
      ctx.beginPath();
      ctx.arc(
        S.pts[o] ?? 0,
        S.pts[o + 1] ?? 0,
        (0.9 + 0.5 * k.glow) * (P.dark ? 1 : 1.2),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    drawBase(ctx, G, P, baseAt, additive);
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /**
   * The weighted base: a charcoal dome with a rim of light, a lens window on
   * its front where the wheel's segments slide past, and the collar the
   * fibres leave from, glowing with the colour at the window.
   */
  const drawBase = (
    ctx: CanvasRenderingContext2D,
    G: Geometry,
    P: Palette,
    at: number,
    additive: GlobalCompositeOperation,
  ) => {
    const { cx, yBase, yCollar, baseW, baseH, collarW } = G;
    const half = baseW / 2;
    const top = collarW * 0.75;
    ctx.beginPath();
    ctx.moveTo(cx - half, yBase);
    ctx.bezierCurveTo(
      cx - half,
      yBase - baseH * 0.7,
      cx - top,
      yCollar + baseH * 0.12,
      cx - top * 0.7,
      yCollar + 2,
    );
    ctx.lineTo(cx + top * 0.7, yCollar + 2);
    ctx.bezierCurveTo(
      cx + top,
      yCollar + baseH * 0.12,
      cx + half,
      yBase - baseH * 0.7,
      cx + half,
      yBase,
    );
    ctx.closePath();
    ctx.fillStyle = "oklch(0.26 0.008 265)";
    ctx.fill();
    ctx.strokeStyle = P.rim;
    ctx.lineWidth = 1;
    ctx.stroke();
    // The window: three segments of the wheel's rim, sliding as it turns.
    const ww = baseW * 0.36;
    const wh = baseH * 0.22;
    const wx = cx - ww / 2;
    const wy = yBase - baseH * 0.48;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, wh / 2);
    ctx.clip();
    const segW = ww / 2;
    const frac = at - Math.floor(at);
    for (let s = -2; s <= 2; s += 1) {
      const idx = lookup(Math.floor(at) + s);
      ctx.fillStyle = P.tint[idx] ?? P.fibre;
      ctx.fillRect(cx - segW / 2 + (s - frac) * segW, wy, segW + 0.5, wh);
    }
    ctx.restore();
    ctx.strokeStyle = "oklch(1 0 0 / 0.18)";
    ctx.beginPath();
    ctx.roundRect(wx, wy, ww, wh, wh / 2);
    ctx.stroke();
    // The collar, lit from inside.
    const idx = lookup(at);
    ctx.globalCompositeOperation = additive;
    ctx.setTransform(
      collarW * 1.3 * G.dpr,
      0,
      0,
      collarW * 0.55 * G.dpr,
      cx * G.dpr,
      (yCollar + 2) * G.dpr,
    );
    ctx.fillStyle = halo(P, ctx, idx);
    ctx.globalAlpha = P.dark ? 0.8 : 0.6;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = P.core[idx] ?? P.fibre;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      yCollar + 2,
      collarW * 0.42,
      collarW * 0.13,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  };

  const stopHum = () => {
    if (humTimer.current !== null) window.clearTimeout(humTimer.current);
    humTimer.current = null;
    hum.current?.stop();
    hum.current = null;
  };

  /** Reduced motion: only the short crossfade needs frames. */
  const fading = (now: number) => {
    const W = wheel.current;
    if (W.fadeStart < 0) return false;
    if (now / 1000 - W.fadeStart > durations.base) {
      W.fadeStart = -1;
      return true;
    }
    return true;
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      stopHum();
      return;
    }
    const dt = last.current
      ? Math.min(0.05, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    const moving = k.motionSafe ? advance(dt, now) : fading(now);
    draw(now);
    // The base's colour has moved on by itself: the lamp's name follows.
    const at = mod(Math.round(wheel.current.at), k.n);
    if (at !== shownIndex.current) {
      shownIndex.current = at;
      setIndex(at);
    }
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else last.current = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { resize, readColours, kick, tick, draw, rebuild };
    report.current = { onAdvance };
  });

  React.useEffect(() => {
    api.current?.rebuild();
    api.current?.kick();
  }, [k.count, k.seed, k.spread]);

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.kick();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.kick();
  }, [k.dpr, k.reach]);

  React.useEffect(() => {
    api.current?.kick();
  }, [k.sway, k.hueSpeed, k.glow, k.travel, paused, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    const timer = humTimer;
    const voice = hum;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      voice.current?.stop();
      voice.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (sound) return;
    if (humTimer.current !== null) window.clearTimeout(humTimer.current);
    humTimer.current = null;
    hum.current = null;
  }, [sound]);

  // Size and sighting, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      if (!strands.current) api.current?.rebuild();
      api.current?.kick();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  /** The wheel moves on one colour: the press, the hum, the announcement. */
  const advanceWheel = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!k.enabled) return;
    // A finger that swept through the fibres was a breeze, not a press.
    if (event.detail > 0 && pressFrom.current.moved) return;
    const W = wheel.current;
    const now = performance.now() / 1000;
    if (k.motionSafe) {
      W.to = Math.round(W.to) + 1;
    } else {
      W.fadeFrom = W.at;
      W.to = Math.round(W.at) + 1;
      W.at = W.to;
      W.v = 0;
      W.fadeStart = now;
    }
    climbUntil.current = now + k.travel + 0.4;
    const next = mod(Math.round(W.to), k.n);
    shownIndex.current = next;
    setIndex(next);
    const nextName = names[next] ?? `Colour ${next + 1}`;
    setSaid((s) => ({ n: s.n + 1, text: `${nextName}.` }));
    report.current.onAdvance?.(next);
    if (sound) {
      const pitch = semitones(SCALE[next % SCALE.length] ?? 0) * 0.9;
      if (!hum.current) hum.current = audio.start("hum", { gain: 0, pitch });
      hum.current.set({ gain: 0.55, pitch });
      if (humTimer.current !== null) window.clearTimeout(humTimer.current);
      // The hum lasts while the colour climbs, then lets go.
      humTimer.current = window.setTimeout(
        () => {
          humTimer.current = null;
          hum.current?.stop();
          hum.current = null;
        },
        Math.round((k.motionSafe ? k.travel : durations.base) * 1000 + 250),
      );
    }
    kick();
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!k.enabled || !k.motionSafe) return;
    const A = air.current;
    const at = local(event.clientX, event.clientY);
    const dt = Math.max(0.004, (event.timeStamp - A.t) / 1000);
    const vx = A.present ? (at.x - A.x) / dt : 0;
    A.vx += (vx - A.vx) * Math.min(1, dt / 0.06);
    A.x = at.x;
    A.y = at.y;
    A.t = event.timeStamp;
    A.present = true;
    const from = pressFrom.current;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > 8)
      from.moved = true;
    kick();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    pressFrom.current = { x: event.clientX, y: event.clientY, moved: false };
  };

  const onPointerLeave = () => {
    air.current.present = false;
    kick();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!k.enabled) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    if (!k.motionSafe) return;
    // A gust from the right pushes the fan left, and the other way.
    air.current.gust =
      (event.key === "ArrowLeft" ? -0.75 : 0.75) * (0.4 + k.breeze);
    kick();
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.kick();
  };

  const carriers = [
    "color-mix(in oklab, var(--foreground) 24%, transparent)",
    "color-mix(in oklab, var(--foreground) 22%, transparent)",
    "var(--background)",
    ...wheelColours,
  ];

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/fibre-lamp relative isolate h-56 w-full overflow-clip rounded-3",
        className,
      )}
    >
      <StandIn
        seed={seed}
        count={k.count}
        spread={k.spread}
        colour={wheelColours[start] ?? WHEEL[0]}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {carriers.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <button
        type="button"
        aria-label={`${label}, ${name}`}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={advanceWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerCancel={onPointerLeave}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 size-full cursor-pointer touch-pan-y rounded-[inherit] outline-none select-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed",
        )}
      />
      <p id={hintId} className="sr-only">
        Press to turn the colour wheel. Left and Right send a breeze through the
        fibres.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still for the server render and the first paint: the same fan
 * in a 320 by 208 frame scaled to fit, fibres as one hairline path and the
 * tips as beads of the starting colour.
 */
function StandIn({
  seed,
  count,
  spread,
  colour,
}: {
  seed: number;
  count: number;
  spread: number;
  colour: string;
}) {
  const S = makeStrands(count, seed, spread);
  const G = geometryFor(320, 208, 0.92);
  let fibres = "";
  let tips = "";
  for (let i = 0; i < S.n; i += 1) {
    const L = (S.len[i] ?? 1) * G.longest;
    const a0 = S.angle[i] ?? 0;
    const bend = S.bend[i] ?? 0;
    let x = G.cx + (S.slot[i] ?? 0) * G.collarW * 0.38;
    let y = G.yCollar + 1;
    fibres += `M${r1(x)} ${r1(y)}`;
    for (let s = 0; s < 4; s += 1) {
      const f = (s + 0.5) / 4;
      const a = a0 + bend * Math.pow(f, 1.3);
      x += (L / 4) * Math.sin(a);
      y -= (L / 4) * Math.cos(a);
      fibres += `L${r1(x)} ${r1(y)}`;
    }
    tips += `M${r1(x - 1.4)} ${r1(y)}a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0`;
  }
  const half = G.baseW / 2;
  const base = `M${r1(G.cx - half)} ${r1(G.yBase)}C${r1(G.cx - half)} ${r1(G.yBase - G.baseH * 0.7)} ${r1(G.cx - G.collarW * 0.75)} ${r1(G.yCollar + G.baseH * 0.12)} ${r1(G.cx - G.collarW * 0.52)} ${r1(G.yCollar + 2)}L${r1(G.cx + G.collarW * 0.52)} ${r1(G.yCollar + 2)}C${r1(G.cx + G.collarW * 0.75)} ${r1(G.yCollar + G.baseH * 0.12)} ${r1(G.cx + half)} ${r1(G.yBase - G.baseH * 0.7)} ${r1(G.cx + half)} ${r1(G.yBase)}Z`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 208"
      preserveAspectRatio="xMidYMax meet"
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/fibre-lamp:opacity-0"
    >
      <path
        d={fibres}
        fill="none"
        strokeWidth={0.7}
        style={{
          stroke: "color-mix(in oklab, var(--foreground) 24%, transparent)",
        }}
      />
      <path d={tips} style={{ fill: colour }} />
      <path d={base} style={{ fill: "oklch(0.25 0.008 265)" }} />
    </svg>
  );
}
