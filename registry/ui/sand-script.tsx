"use client";

import * as React from "react";

import { animate, motion, type AnimationPlaybackControls } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SandTone = "dune" | "ash" | "coral";

export type SandScriptProps = {
  /** The status phrases, written in the sand one after another and cycled in order. */
  phrases: string[];
  /** Writing. False sends the wave, writes `doneText` and stops. @default true */
  active?: boolean;
  /** What stays written once inactive. @default the last phrase */
  doneText?: string;
  /** How fast the sand pours, rests and the wave runs, 0.5 to 2. @default 1 */
  speed?: number;
  /** Grain size in px, 1 (fine silt) to 3 (coarse). @default 2 */
  grain?: number;
  /** The beach. @default "dune" */
  tone?: SandTone;
  /** Determinate progress, 0 to 1: the phrases share it, and the settled share of each follows it. */
  progress?: number;
  /** Play the finger's swish. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep writing, but the sand cannot be drawn in. */
  disabled?: boolean;
  /** A phrase began: its index in `phrases`, or -1 for `doneText`. */
  onPhraseChange?: (index: number) => void;
  className?: string;
};

type Lch = readonly [number, number, number];

type Beach = {
  bed: Lch;
  /** Four grain shades, light to dark. */
  grains: readonly [Lch, Lch, Lch, Lch];
  shadow: Lch;
  light: Lch;
  wet: Lch;
  sea: Lch;
  deep: Lch;
  foam: Lch;
  /** Mica: a few grains that catch the light. */
  glint: Lch | null;
};

// Sand and sea are pigments: the same in both themes (a veil of the page
// background keeps a pale tray from glaring on a dark page).
const BEACHES: Record<SandTone, Beach> = {
  dune: {
    bed: [0.86, 0.05, 84],
    grains: [
      [0.78, 0.08, 78],
      [0.7, 0.09, 72],
      [0.62, 0.09, 64],
      [0.54, 0.075, 56],
    ],
    shadow: [0.42, 0.06, 55],
    light: [0.97, 0.035, 92],
    wet: [0.68, 0.07, 72],
    sea: [0.66, 0.09, 200],
    deep: [0.46, 0.08, 226],
    foam: [0.985, 0.012, 200],
    glint: null,
  },
  ash: {
    bed: [0.34, 0.01, 250],
    grains: [
      [0.8, 0.01, 250],
      [0.71, 0.012, 250],
      [0.63, 0.012, 250],
      [0.55, 0.01, 250],
    ],
    shadow: [0.14, 0.01, 250],
    light: [0.9, 0.01, 250],
    wet: [0.25, 0.014, 245],
    sea: [0.52, 0.06, 214],
    deep: [0.32, 0.05, 232],
    foam: [0.95, 0.012, 210],
    glint: [0.97, 0.05, 88],
  },
  coral: {
    bed: [0.91, 0.028, 38],
    grains: [
      [0.8, 0.07, 32],
      [0.72, 0.085, 27],
      [0.64, 0.09, 22],
      [0.57, 0.085, 18],
    ],
    shadow: [0.46, 0.07, 22],
    light: [0.99, 0.015, 45],
    wet: [0.77, 0.05, 30],
    sea: [0.74, 0.1, 188],
    deep: [0.52, 0.1, 210],
    foam: [0.99, 0.01, 190],
    glint: null,
  },
};

/** Seconds at speed 1. */
const FLIGHT = 0.22;
const LETTER = 0.3;
const REST = 1.6;
const WAVE = 1.6;
/** The swash's share of a wave; the rest is the backwash. */
const SWASH = 0.45;
const DRY = 2.4;
/** Real seconds for a trail to refill. */
const REFILL = 2.2;
/** Most grains in a phrase: frame work stays small at any width. */
const MOST = 4200;
const PAD_X = 20;
const TOP = 18;
const BOTTOM = 16;
const BUCKET = 16;
/** The tray's height before it has measured itself: one line at full size. */
const REST_H = TOP + 49 + BOTTOM;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same beach and the same pour every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A pigment as the CSS the page uses. */
const css = ([l, c, h]: Lch) => `oklch(${l} ${c} ${h})`;

/**
 * A pigment in sRGB for the canvas, from its OKLCH numbers: every browser's
 * canvas parses rgb(), and the mixing below stays in numbers.
 */
function rgbOf([l, c, h]: Lch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ];
  const enc = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(clamp01(v) * 255);
  };
  return [enc(lin[0] ?? 0), enc(lin[1] ?? 0), enc(lin[2] ?? 0)];
}

type Paint = {
  bed: string;
  grains: string[];
  shadow: string;
  light: string;
  wall: (a: number) => string;
  lip: (a: number) => string;
  wet: (a: number) => string;
  sea: (a: number) => string;
  deep: (a: number) => string;
  foam: (a: number) => string;
  glint: string | null;
  melt: string;
};

function paintOf(beach: Beach): Paint {
  const rgba = (p: Lch) => {
    const [r, g, b] = rgbOf(p);
    return (a = 1) => `rgba(${r}, ${g}, ${b}, ${r2(a)})`;
  };
  return {
    bed: rgba(beach.bed)(),
    grains: beach.grains.map((g) => rgba(g)()),
    shadow: rgba(beach.shadow)(0.62),
    light: rgba(beach.light)(0.55),
    wall: rgba(beach.shadow),
    lip: rgba(beach.light),
    wet: rgba(beach.wet),
    sea: rgba(beach.sea),
    deep: rgba(beach.deep),
    foam: rgba(beach.foam),
    glint: beach.glint ? rgba(beach.glint)(0.9) : null,
    melt: rgba(beach.wet)(1),
  };
}

type Layout = { w: number; h: number; fs: number; lh: number; lines: number };

type Grains = {
  n: number;
  text: string;
  hx: Float32Array;
  hy: Float32Array;
  /** Where each grain leaves the stream. */
  sx: Float32Array;
  land: Float32Array;
  shade: Uint8Array;
  glint: Uint8Array;
  /** Pushed aside by a finger, and when it starts to trickle back (real s). */
  px: Float32Array;
  py: Float32Array;
  back: Float32Array;
  /** When the wave reached it, s into the wave; -1 while dry. */
  wet: Float32Array;
  writeEnd: number;
  /** Grain indices by home, in BUCKET px cells. */
  buckets: Map<number, number[]>;
  /** The line's middle, for the keyboard's finger. */
  mid: number;
  left: number;
  right: number;
};

const EMPTY: Grains = {
  n: 0,
  text: "",
  hx: new Float32Array(0),
  hy: new Float32Array(0),
  sx: new Float32Array(0),
  land: new Float32Array(0),
  shade: new Uint8Array(0),
  glint: new Uint8Array(0),
  px: new Float32Array(0),
  py: new Float32Array(0),
  back: new Float32Array(0),
  wet: new Float32Array(0),
  writeEnd: 0,
  buckets: new Map(),
  mid: 0,
  left: 0,
  right: 0,
};

function wrapWords(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(tryLine).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = tryLine;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/**
 * The type size and the tray's height for a width: every phrase fits in at
 * most three lines, and the tray is as tall as the longest needs, so its
 * height never changes from one phrase to the next.
 */
function layoutOf(
  ctx: CanvasRenderingContext2D,
  family: string,
  texts: string[],
  w: number,
  size: number,
): Layout {
  const inner = Math.max(40, w - 2 * PAD_X);
  // Big enough that a coarse grain still draws a letter: narrow trays wrap.
  let fs = clamp(Math.round(w * 0.06), 22 + size * 4, 40);
  let lines = 1;
  for (; fs >= 16; fs -= 2) {
    ctx.font = `700 ${fs}px ${family}`;
    const wraps = texts.map((t) => wrapWords(ctx, t, inner));
    lines = Math.max(1, ...wraps.map((l) => l.length));
    const widest = Math.max(
      0,
      ...wraps.flat().map((l) => ctx.measureText(l).width),
    );
    if (lines <= 3 && widest <= inner) break;
  }
  fs = Math.max(16, fs);
  const lh = Math.round(fs * 1.22);
  return { w, h: TOP + lines * lh + BOTTOM, fs, lh, lines };
}

/**
 * The phrase as grains: set in the component's own bold type offscreen,
 * sampled on a jittered grid whose pitch is the grain size, each grain given
 * a shade and the moment it lands — letter by letter along the line, and
 * within a letter from its base up, as a heap builds.
 */
function grainsOf(
  text: string,
  L: Layout,
  family: string,
  size: number,
  motionSafe: boolean,
): Grains {
  if (typeof document === "undefined" || L.w < 1) return EMPTY;
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(L.w));
  off.height = Math.max(1, Math.round(L.h));
  const c = off.getContext("2d", { willReadFrequently: true });
  if (!c) return EMPTY;
  const inner = Math.max(40, L.w - 2 * PAD_X);
  c.font = `700 ${L.fs}px ${family}`;
  c.textBaseline = "alphabetic";
  c.fillStyle = "black";
  const lines = wrapWords(c, text, inner);
  const top = TOP + ((L.lines - lines.length) * L.lh) / 2;
  // Each character's span along its line, numbered through the phrase.
  const spans: { line: number; x0: number; x1: number; space: boolean }[] = [];
  let left = L.w;
  let right = 0;
  lines.forEach((line, k) => {
    const lw = c.measureText(line).width;
    const x = (L.w - lw) / 2;
    const base = top + k * L.lh + (L.lh + L.fs * 0.7) / 2;
    c.fillText(line, x, base);
    left = Math.min(left, x);
    right = Math.max(right, x + lw);
    const chars = Array.from(line);
    let at = 0;
    chars.forEach((ch, i) => {
      const next = c.measureText(chars.slice(0, i + 1).join("")).width;
      spans.push({
        line: k,
        x0: x + at,
        x1: x + next,
        space: ch.trim() === "",
      });
      at = next;
    });
    if (k < lines.length - 1) {
      spans.push({ line: k, x0: x + lw, x1: x + lw, space: true });
    }
  });
  const data = c.getImageData(0, 0, off.width, off.height).data;
  const rand = lcg(hash(text) ^ Math.round(size * 1000));

  const pick = (pitch: number) => {
    const out: number[] = [];
    for (let y = pitch / 2; y < L.h; y += pitch) {
      for (let x = pitch / 2; x < L.w; x += pitch) {
        const jx = x + (rand() - 0.5) * pitch * 0.7;
        const jy = y + (rand() - 0.5) * pitch * 0.7;
        const ix = Math.round(jx);
        const iy = Math.round(jy);
        if (ix < 0 || iy < 0 || ix >= off.width || iy >= off.height) continue;
        if ((data[(iy * off.width + ix) * 4 + 3] ?? 0) > 110) {
          out.push(jx, jy);
        }
      }
    }
    return out;
  };
  let pitch = Math.max(1, size * 0.95);
  let pts = pick(pitch);
  if (pts.length / 2 > MOST) {
    pitch *= Math.sqrt(pts.length / 2 / MOST);
    pts = pick(pitch);
  }

  // The pour's rhythm: a letter every ~75ms, a lift at each space; long
  // phrases pour a little faster so none takes more than ~2s.
  const letters = spans.filter((s) => !s.space).length;
  const step = Math.min(0.075, 1.9 / Math.max(1, letters));
  const starts: number[] = [];
  let t = 0.15;
  for (const s of spans) {
    const jitter = rand();
    if (s.space) {
      starts.push(-1);
      t += step * 1.6;
      continue;
    }
    starts.push(t);
    t += step * (0.8 + jitter * 0.4);
  }

  const n = pts.length / 2;
  const g: Grains = {
    n,
    text,
    hx: new Float32Array(n),
    hy: new Float32Array(n),
    sx: new Float32Array(n),
    land: new Float32Array(n),
    shade: new Uint8Array(n),
    glint: new Uint8Array(n),
    px: new Float32Array(n),
    py: new Float32Array(n),
    back: new Float32Array(n).fill(-1),
    wet: new Float32Array(n).fill(-1),
    writeEnd: 0,
    buckets: new Map(),
    mid: top + (lines.length * L.lh) / 2,
    left,
    right,
  };
  // Which character each grain belongs to, and its height within it.
  const owner = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = pts[i * 2] ?? 0;
    const y = pts[i * 2 + 1] ?? 0;
    g.hx[i] = x;
    g.hy[i] = y;
    g.shade[i] = Math.min(3, Math.floor(rand() * 4));
    g.glint[i] = rand() < 0.045 ? 1 : 0;
    const line = clamp(Math.floor((y - top) / L.lh), 0, lines.length - 1);
    let best = -1;
    let bestD = Infinity;
    spans.forEach((s, k) => {
      if (s.space || s.line !== line) return;
      const d = x < s.x0 ? s.x0 - x : x > s.x1 ? x - s.x1 : 0;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    owner[i] = best;
    const key = (Math.floor(x / BUCKET) << 16) | Math.floor(y / BUCKET);
    const list = g.buckets.get(key);
    if (list) list.push(i);
    else g.buckets.set(key, [i]);
  }
  // Within a letter, the lowest grains land first.
  const byOwner = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const o = owner[i] ?? -1;
    const list = byOwner.get(o);
    if (list) list.push(i);
    else byOwner.set(o, [i]);
  }
  let end = 0;
  for (const [o, list] of byOwner) {
    const s = spans[o];
    const start = starts[o] ?? 0.15;
    list.sort((a, b) => (g.hy[b] ?? 0) - (g.hy[a] ?? 0));
    list.forEach((i, rank) => {
      const land = motionSafe
        ? start + FLIGHT + (rank / Math.max(1, list.length)) * LETTER
        : 0.05;
      g.land[i] = land;
      g.sx[i] = s ? (s.x0 + s.x1) / 2 + (rand() - 0.5) * 3 : (g.hx[i] ?? 0);
      end = Math.max(end, land);
    });
  }
  g.writeEnd = motionSafe ? end + 0.05 : 0.45;
  return g;
}

/** The bed: the tone's sand, seeded speckle and faint ripples, baked once per size. */
function bakeBed(
  L: Layout,
  dpr: number,
  paint: Paint,
  size: number,
): HTMLCanvasElement | null {
  const bed = document.createElement("canvas");
  bed.width = Math.max(1, Math.round(L.w * dpr));
  bed.height = Math.max(1, Math.round(L.h * dpr));
  const c = bed.getContext("2d");
  if (!c) return null;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = paint.bed;
  c.fillRect(0, 0, L.w, L.h);
  const rand = lcg(0x51ed27 ^ Math.round(size * 100));
  // Ripples the last tide left: long, low bands.
  c.globalAlpha = 0.06;
  c.strokeStyle = paint.shadow;
  c.lineWidth = 1.2;
  for (let y = 6; y < L.h; y += 9 + rand() * 5) {
    c.beginPath();
    const phase = rand() * 6;
    for (let x = 0; x <= L.w; x += 12) {
      const yy = y + Math.sin(x * 0.035 + phase) * 2.2;
      if (x === 0) c.moveTo(x, yy);
      else c.lineTo(x, yy);
    }
    c.stroke();
  }
  // Speckle: loose grains of every shade.
  const specks = Math.round((L.w * L.h) / (size * size * 18));
  for (let i = 0; i < specks; i += 1) {
    c.globalAlpha = 0.12 + rand() * 0.24;
    c.fillStyle = paint.grains[Math.floor(rand() * 4)] ?? paint.bed;
    const s = size * (0.6 + rand() * 0.5);
    c.fillRect(rand() * L.w, rand() * L.h, s, s);
  }
  c.globalAlpha = 1;
  return bed;
}

type Point = { x: number; y: number; at: number; w: number; depth: number };

type Scene = {
  L: Layout;
  dpr: number;
  paint: Paint;
  bed: HTMLCanvasElement | null;
  family: string;
  grains: Grains;
  phase: "write" | "rest" | "wave";
  /** Seconds into the phrase, at speed 1. */
  t: number;
  /** Seconds into the wave, at speed 1. */
  wave: number;
  /** How wet the bed still is, 0 to 1, and the swash's furthest reach. */
  wetness: number;
  mark: Float32Array;
  strokes: Point[][];
  /** Rest still owed, s at speed 1, and when the running rest began (real s). */
  restLeft: number;
  restFrom: number;
  restTimer: number;
  frame: number;
  last: number;
};

const MARKS = 33;

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Slot = { n: number; index: number; text: string; final: boolean };

type Latest = {
  list: string[];
  done: string;
  active: boolean;
  determinate: boolean;
  band: number;
  local: number;
  rate: number;
  size: number;
  motionSafe: boolean;
  running: boolean;
  slot: Slot;
};

/**
 * A status line written in sand. A thin stream pours from the top of the
 * tray and travels along the line; grains leave it, fall and land in the
 * shapes of the letters, the lowest first, so each letter builds up like a
 * heap and stands in relief. When the phrase has rested, a wave runs up the
 * beach with a foam lace on its front, loosens every grain it reaches, and
 * drains back leaving the sand smooth and wet; the next phrase is poured as
 * it dries.
 *
 * The pointer draws in the sand: a passing mouse leaves a shallow trail, a
 * press digs a groove that pushes the grains aside, and the trail refills.
 * Enter or Space draws the same finger along the line. The canvas runs only
 * while something moves and it is on screen in a visible page; the phrase
 * itself is in a polite live region, announced once. Under reduced motion a
 * phrase fades in whole and the wave is a colour change.
 */
export function SandScript({
  phrases,
  active = true,
  doneText,
  speed = 1,
  grain = 2,
  tone = "dune",
  progress,
  sound = false,
  disabled = false,
  onPhraseChange,
  className,
}: SandScriptProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const beach = BEACHES[tone] ?? BEACHES.dune;
  const rate = clamp(speed, 0.5, 2);
  const size = clamp(grain, 1, 3);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const list = phrases.length > 0 ? phrases : [doneText ?? ""];
  const done = doneText ?? list[list.length - 1] ?? "";
  const determinate = progress !== undefined;
  const share = clamp01(progress ?? 0);
  const band = Math.min(list.length - 1, Math.floor(share * list.length));
  const local = clamp01(share * list.length - band);

  const [slot, setSlot] = React.useState<Slot>(() => {
    if (!active) return { n: 0, index: -1, text: done, final: true };
    const index = determinate ? band : 0;
    return { n: 0, index, text: list[index] ?? "", final: false };
  });
  const [height, setHeight] = React.useState<number | null>(null);
  const [measured, setMeasured] = React.useState(false);

  const trayRef = React.useRef<HTMLButtonElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const visible = React.useRef(true);
  const scene = React.useRef<Scene>({
    L: { w: 0, h: 0, fs: 40, lh: 49, lines: 1 },
    dpr: 1,
    paint: paintOf(beach),
    bed: null,
    family: "sans-serif",
    grains: EMPTY,
    phase: "write",
    t: 0,
    wave: 0,
    wetness: 0,
    mark: new Float32Array(MARKS),
    strokes: [],
    restLeft: 0,
    restFrom: 0,
    restTimer: 0,
    frame: 0,
    last: 0,
  });
  const latest = React.useRef<Latest>({
    list,
    done,
    active,
    determinate,
    band,
    local,
    rate,
    size,
    motionSafe,
    running,
    slot,
  });
  const finger = React.useRef<{
    x: number;
    y: number;
    t: number;
    swish: number;
  } | null>(null);
  const stroke = React.useRef<AnimationPlaybackControls | null>(null);
  const report = React.useRef(onPhraseChange);
  const api = React.useRef<{
    kick: () => void;
    draw: () => void;
    resize: (force?: boolean) => void;
    settle: () => void;
    pause: () => void;
  } | null>(null);

  const now = () => performance.now() / 1000;

  /** The wave's front at x, `p` of the way through the wave. */
  const frontAt = (x: number, p: number) => {
    const { w, h } = scene.current.L;
    const reach =
      p < SWASH ? easeOut(p / SWASH) : 1 - easeIn((p - SWASH) / (1 - SWASH));
    const base = h + 8 - reach * (h + 8 - TOP * 0.4);
    // Rising, the right side comes in first, so it also sweeps across.
    const lean = (1 - reach) * h * 0.45 * (p < SWASH ? 1 : 0.35);
    return (
      base +
      lean * (1 - x / Math.max(1, w)) +
      3.2 * Math.sin(x * 0.028 + p * 9) +
      1.4 * Math.sin(x * 0.067 - p * 6)
    );
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const s = scene.current;
    if (!canvas || !ctx || s.L.w < 1) return;
    const { w, h } = s.L;
    const P = s.paint;
    const g = s.grains;
    const m = latest.current.motionSafe;
    const size = latest.current.size;
    const clockNow = now();
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.globalAlpha = 1;
    if (s.bed) ctx.drawImage(s.bed, 0, 0, w, h);
    else {
      ctx.fillStyle = P.bed;
      ctx.fillRect(0, 0, w, h);
    }

    const p = s.phase === "wave" ? clamp01(s.wave / (m ? WAVE : 0.6)) : 0;
    // Wet sand where the water has been, drying.
    const wet = s.phase === "wave" ? (m ? (p > SWASH ? 1 : 0) : p) : s.wetness;
    if (wet > 0.01) {
      ctx.fillStyle = P.wet(0.55 * wet);
      if (m) {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let k = 0; k < MARKS; k += 1) {
          ctx.lineTo((k / (MARKS - 1)) * w, s.mark[k] ?? h);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        // The swash mark: a fading lace where the water stopped.
        ctx.strokeStyle = P.foam(0.45 * wet);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < MARKS; k += 1) {
          const x = (k / (MARKS - 1)) * w;
          const y = (s.mark[k] ?? h) + 0.5;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        ctx.fillRect(0, 0, w, h);
      }
    }

    // Trails: a channel pressed into the sand — damp and darker, its upper
    // wall in shadow and its lower lip catching the light — refilling.
    const fade = s.phase === "wave" ? clamp01(1 - p * 2.2) : 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const pass = (
      style: (a: number) => string,
      alpha: number,
      widthOf: (w: number) => number,
      dy: (w: number) => number,
    ) => {
      for (const line of s.strokes) {
        for (let i = 1; i < line.length; i += 1) {
          const a = line[i - 1] as Point;
          const b = line[i] as Point;
          const age = clamp01((clockNow - b.at) / REFILL);
          if (age >= 1) continue;
          const k = (1 - age) * fade * b.depth;
          const width = b.w * (m ? Math.pow(1 - age, 0.6) : 1);
          ctx.strokeStyle = style(alpha * k);
          ctx.lineWidth = widthOf(width);
          const off = dy(width);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y + off);
          ctx.lineTo(b.x, b.y + off);
          ctx.stroke();
        }
      }
    };
    pass(
      P.lip,
      0.7,
      () => 1.4,
      (wd) => wd * 0.5 + 0.4,
    );
    pass(
      P.wet,
      0.75,
      (wd) => wd,
      () => 0,
    );
    pass(
      P.wall,
      0.5,
      (wd) => Math.max(1, wd * 0.38),
      (wd) => -wd * 0.26,
    );
    ctx.globalAlpha = 1;

    // Grains.
    const t = s.t;
    const fadeIn = m ? 1 : clamp01((t - 0.05) / 0.35);
    const shadow = new Path2D();
    const light = new Path2D();
    const shades = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const glints = new Path2D();
    const melting = [new Path2D(), new Path2D(), new Path2D()];
    const gs = size;
    // The heap's relief: shadow down and right, light up and left.
    const lift = Math.max(0.8, gs * 0.55);
    for (let i = 0; i < g.n; i += 1) {
      const land = g.land[i] ?? 0;
      const hx = g.hx[i] ?? 0;
      const hy = g.hy[i] ?? 0;
      if (m && t < land - FLIGHT) continue;
      const wetAt = g.wet[i] ?? -1;
      if (wetAt >= 0) {
        const melt = clamp01((s.wave - wetAt) / 0.5);
        if (melt >= 1) continue;
        const drift = m ? (p < SWASH ? -4 : 5) * melt : 0;
        const bucket = melt < 0.33 ? 0 : melt < 0.66 ? 1 : 2;
        melting[bucket]?.rect(
          hx + (g.px[i] ?? 0),
          hy + (g.py[i] ?? 0) + drift,
          gs,
          gs,
        );
        continue;
      }
      if (m && t < land) {
        // In the air: out of the stream and down onto its place.
        const u = clamp01((t - (land - FLIGHT)) / FLIGHT);
        const x0 = g.sx[i] ?? hx;
        const x = x0 + (hx - x0) * u;
        const y = -3 + (hy + 3) * u * u;
        shades[g.shade[i] ?? 0]?.rect(x, y, gs * 0.9, gs * 0.9);
        continue;
      }
      let x = hx;
      let y = hy;
      const px = g.px[i] ?? 0;
      const py = g.py[i] ?? 0;
      if (px !== 0 || py !== 0) {
        const back = g.back[i] ?? -1;
        const k = back >= 0 ? clamp01((clockNow - back) / 0.7) : 0;
        const e = k * k * (3 - 2 * k);
        x += px * (1 - e);
        y += py * (1 - e);
        if (k >= 1) {
          g.px[i] = 0;
          g.py[i] = 0;
          g.back[i] = -1;
        }
      }
      shadow.rect(x + lift, y + lift * 1.15, gs, gs);
      if (g.glint[i] && P.glint) glints.rect(x, y, gs, gs);
      else shades[g.shade[i] ?? 0]?.rect(x, y, gs, gs);
      if (i % 2 === 0) {
        light.rect(x - lift * 0.5, y - lift * 0.6, gs * 0.75, gs * 0.75);
      }
    }
    ctx.globalAlpha = fadeIn;
    ctx.fillStyle = P.shadow;
    ctx.fill(shadow);
    shades.forEach((path, k) => {
      ctx.fillStyle = P.grains[k] ?? P.bed;
      ctx.fill(path);
    });
    if (P.glint) {
      ctx.fillStyle = P.glint;
      ctx.fill(glints);
    }
    ctx.fillStyle = P.light;
    ctx.fill(light);
    melting.forEach((path, k) => {
      ctx.globalAlpha = fadeIn * [0.8, 0.5, 0.22][k]!;
      ctx.fillStyle = P.melt;
      ctx.fill(path);
    });
    ctx.globalAlpha = 1;

    // The water: a translucent body darker toward the sea, a foam lace on
    // its front and bubbles behind it.
    if (s.phase === "wave" && m && p < 1) {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 64; k += 1) {
        const x = (k / 64) * w;
        pts.push([x, frontAt(x, p)]);
      }
      const shallow = Math.min(...pts.map(([, y]) => y));
      const body = ctx.createLinearGradient(0, shallow, 0, h);
      const drain = p > SWASH ? 1 - (p - SWASH) / (1 - SWASH) : 1;
      body.addColorStop(0, P.sea(0.42 * (0.4 + 0.6 * drain)));
      body.addColorStop(1, P.deep(0.72));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, h + 2);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(w, h + 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = P.foam(0.85 * (0.5 + 0.5 * drain));
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      pts.forEach(([x, y], k) =>
        k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
      );
      ctx.stroke();
      ctx.strokeStyle = P.foam(0.35 * drain);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      pts.forEach(([x, y], k) =>
        k === 0 ? ctx.moveTo(x, y + 4.5) : ctx.lineTo(x, y + 4.5),
      );
      ctx.stroke();
      const rand = lcg(0x9e3779b9 ^ Math.floor(p * 24));
      ctx.fillStyle = P.foam(0.7);
      ctx.beginPath();
      for (let k = 0; k < 40; k += 1) {
        const x = rand() * w;
        const off = rand();
        const y = frontAt(x, p) + 2 + off * 9;
        const r = 0.5 + rand() * 1.1;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  };

  /** Pushes grains out of a finger's groove; they trickle back later. */
  const push = (a: Point, b: Point) => {
    const s = scene.current;
    const g = s.grains;
    if (!latest.current.motionSafe || g.n === 0) return;
    const r = b.w / 2;
    const clockNow = now();
    const rand = lcg(Math.round(clockNow * 1000) ^ 0x2545f491);
    const x0 = Math.floor((Math.min(a.x, b.x) - r - 4) / BUCKET);
    const x1 = Math.floor((Math.max(a.x, b.x) + r + 4) / BUCKET);
    const y0 = Math.floor((Math.min(a.y, b.y) - r - 4) / BUCKET);
    const y1 = Math.floor((Math.max(a.y, b.y) + r + 4) / BUCKET);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    for (let bx = x0; bx <= x1; bx += 1) {
      for (let by = y0; by <= y1; by += 1) {
        const list = g.buckets.get((bx << 16) | by);
        if (!list) continue;
        for (const i of list) {
          if ((g.wet[i] ?? -1) >= 0 || s.t < (g.land[i] ?? 0)) continue;
          // Where the grain is now, part way back from an earlier push.
          const back = g.back[i] ?? -1;
          const k = back >= 0 ? clamp01((clockNow - back) / 0.7) : 0;
          const e = k * k * (3 - 2 * k);
          const gx = (g.hx[i] ?? 0) + (g.px[i] ?? 0) * (1 - e);
          const gy = (g.hy[i] ?? 0) + (g.py[i] ?? 0) * (1 - e);
          const u =
            len2 > 0 ? clamp01(((gx - a.x) * dx + (gy - a.y) * dy) / len2) : 0;
          const cx = a.x + dx * u;
          const cy = a.y + dy * u;
          const d = Math.hypot(gx - cx, gy - cy);
          if (d >= r) continue;
          let nx = gx - cx;
          let ny = gy - cy;
          if (d < 0.01) {
            const l = Math.sqrt(len2) || 1;
            nx = -dy / l;
            ny = dx / l;
          } else {
            nx /= d;
            ny /= d;
          }
          const out = r + 0.4 + rand() * 1.4;
          g.px[i] = cx + nx * out - (g.hx[i] ?? 0);
          g.py[i] = cy + ny * out - (g.hy[i] ?? 0);
          g.back[i] = clockNow + 0.4 + rand() * 1.2;
        }
      }
    }
  };

  const addPoint = (x: number, y: number, deep: boolean, fresh: boolean) => {
    const s = scene.current;
    const size = latest.current.size;
    const point: Point = {
      x: r2(x),
      y: r2(y),
      at: now(),
      w: deep ? 5 + size * 2 : 2.5 + size,
      depth: deep ? 1 : 0.5,
    };
    let line = s.strokes[s.strokes.length - 1];
    if (fresh || !line) {
      line = [];
      s.strokes.push(line);
      if (s.strokes.length > 24) s.strokes.shift();
    }
    const prev = line[line.length - 1];
    line.push(point);
    if (line.length > 400) line.shift();
    push(prev ?? point, point);
    api.current?.kick();
  };

  /** Anything still moving: pour, water, drying, trails, grains trickling back. */
  const moving = () => {
    const s = scene.current;
    const L = latest.current;
    if (s.phase === "wave") return true;
    if (s.phase === "write") {
      const target = targetOf();
      if (s.t < target - 1e-3) return true;
    }
    if (s.wetness > 0.001) return true;
    const clockNow = now();
    if (s.strokes.some((line) => line.some((p) => clockNow - p.at < REFILL))) {
      return true;
    }
    if (L.motionSafe) {
      const g = s.grains;
      for (let i = 0; i < g.n; i += 1) {
        if ((g.back[i] ?? -1) >= 0) return true;
      }
    }
    return false;
  };

  /** How far the phrase's clock may run now. */
  const targetOf = () => {
    const s = scene.current;
    const L = latest.current;
    const end = s.grains.writeEnd;
    if (L.slot.final || !L.active) return end;
    if (L.determinate) return L.band > L.slot.index ? end : L.local * end;
    return end;
  };

  const nextSlot = (): Slot | null => {
    const L = latest.current;
    const cur = L.slot;
    if (!L.active) {
      return cur.final
        ? null
        : { n: cur.n + 1, index: -1, text: L.done, final: true };
    }
    if (L.determinate && !cur.final && L.band > cur.index) {
      return {
        n: cur.n + 1,
        index: L.band,
        text: L.list[L.band] ?? "",
        final: false,
      };
    }
    if (L.determinate && !cur.final) return null;
    const index = cur.final ? 0 : (cur.index + 1) % L.list.length;
    return { n: cur.n + 1, index, text: L.list[index] ?? "", final: false };
  };

  const startWave = () => {
    const s = scene.current;
    s.phase = "wave";
    s.wave = 0;
    s.restLeft = 0;
    s.mark.fill(s.L.h);
    api.current?.kick();
  };

  /** Stops a running rest, keeping what is still owed of it. */
  const holdRest = () => {
    const s = scene.current;
    if (!s.restTimer) return;
    window.clearTimeout(s.restTimer);
    s.restTimer = 0;
    s.restLeft = Math.max(
      0,
      s.restLeft - (now() - s.restFrom) * latest.current.rate,
    );
  };

  /** The written phrase has rested: send the wave, or wait for the host. */
  const settle = () => {
    const s = scene.current;
    const L = latest.current;
    if (s.phase !== "rest" || !L.running) return;
    holdRest();
    const next = nextSlot();
    if (!next) return;
    // Progress that has moved on, a host that has switched off or on, sends
    // the wave now; otherwise the line rests (or waits for progress).
    const promptly =
      L.slot.final || !L.active || (L.determinate && L.band > L.slot.index);
    if (promptly || s.restLeft <= 0) {
      startWave();
      return;
    }
    if (L.determinate) return;
    s.restFrom = now();
    s.restTimer = window.setTimeout(
      () => {
        s.restTimer = 0;
        startWave();
      },
      (s.restLeft / L.rate) * 1000,
    );
  };

  /** The next phrase, on smooth wet sand. */
  const begin = (next: Slot) => {
    const s = scene.current;
    const L = latest.current;
    s.grains = grainsOf(next.text, s.L, s.family, L.size, L.motionSafe);
    s.phase = "write";
    s.t = 0;
    s.wave = 0;
    s.wetness = 1;
    s.strokes = [];
    latest.current = { ...L, slot: next };
    setSlot(next);
    report.current?.(next.index);
  };

  const step = (dt: number) => {
    const s = scene.current;
    const L = latest.current;
    const r =
      L.rate *
      (!L.active || (L.determinate && L.band > L.slot.index) ? 2.5 : 1);
    if (s.phase === "write") {
      const target = targetOf();
      if (s.t < target) s.t = Math.min(target, s.t + dt * r);
      if (s.t >= s.grains.writeEnd - 1e-4 && s.t >= target - 1e-4) {
        // Poured all at once, a phrase keeps the reading time the stream
        // would have given it.
        s.phase = "rest";
        s.restLeft =
          REST +
          (L.motionSafe ? 0 : Math.min(1.8, s.grains.text.length * 0.06));
        api.current?.settle();
      }
    } else if (s.phase === "wave") {
      const len = L.motionSafe ? WAVE : 0.6;
      s.wave = Math.min(len * 1.001, s.wave + dt * L.rate);
      const p = clamp01(s.wave / len);
      const g = s.grains;
      if (L.motionSafe) {
        // Every grain the water reaches is loosened, and the swash's reach
        // is remembered for the wet sand it leaves.
        if (p <= SWASH) {
          for (let k = 0; k < MARKS; k += 1) {
            const x = (k / (MARKS - 1)) * s.L.w;
            s.mark[k] = Math.min(s.mark[k] ?? s.L.h, frontAt(x, p));
          }
        }
        for (let i = 0; i < g.n; i += 1) {
          if ((g.wet[i] ?? -1) >= 0) continue;
          const x = g.hx[i] ?? 0;
          if ((g.hy[i] ?? 0) > frontAt(x, Math.min(p, SWASH)))
            g.wet[i] = s.wave;
        }
      } else {
        for (let i = 0; i < g.n; i += 1) {
          if ((g.wet[i] ?? -1) < 0) g.wet[i] = 0;
        }
        s.mark.fill(0);
      }
      if (p >= 1) {
        const next = nextSlot();
        if (next) begin(next);
        else {
          s.phase = "rest";
          s.wetness = 1;
        }
      }
    }
    if (s.phase !== "wave" && s.wetness > 0) {
      s.wetness = Math.max(0, s.wetness - (dt * L.rate) / DRY);
    }
    // Refilled trail is sand again.
    const clockNow = now();
    for (const line of s.strokes) {
      while (line.length > 1 && clockNow - (line[1]?.at ?? 0) >= REFILL) {
        line.shift();
      }
    }
    s.strokes = s.strokes.filter(
      (line) =>
        line.length > 0 && clockNow - (line[line.length - 1]?.at ?? 0) < REFILL,
    );
  };

  const tick = (time: number) => {
    const s = scene.current;
    s.frame = 0;
    if (!visible.current || document.hidden) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (time - s.last) / 1000) : 0;
    s.last = time;
    step(dt);
    draw();
    // A phase change may already have asked for the next frame.
    if (s.frame) return;
    if (moving()) s.frame = window.requestAnimationFrame(tick);
    else s.last = 0;
  };

  const kick = () => {
    const s = scene.current;
    if (s.frame || !visible.current || document.hidden) return;
    s.frame = window.requestAnimationFrame(tick);
  };

  const pause = () => {
    const s = scene.current;
    if (s.frame) window.cancelAnimationFrame(s.frame);
    s.frame = 0;
    s.last = 0;
    holdRest();
  };

  /** Sizes the canvas to the tray, lays the type out, and pours the phrase again. */
  const resize = (force = false) => {
    const tray = trayRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!tray || !canvas || !ctx) return;
    const w = tray.clientWidth;
    if (w < 1) return;
    const s = scene.current;
    const L = latest.current;
    const family = getComputedStyle(canvas).fontFamily || "sans-serif";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // The tray's own height animates; only its width, the screen's density
    // or the type lay the sand out again.
    if (!force && w === s.L.w && dpr === s.dpr && family === s.family) return;
    const layout = layoutOf(ctx, family, [...L.list, L.done], w, L.size);
    s.L = layout;
    s.dpr = dpr;
    s.family = family;
    canvas.width = Math.round(layout.w * dpr);
    canvas.height = Math.round(layout.h * dpr);
    setHeight(layout.h);
    // The first size arrives in place; later ones glide.
    if (!s.bed) window.requestAnimationFrame(() => setMeasured(true));
    s.bed = bakeBed(layout, dpr, s.paint, L.size);
    const first = s.grains.n === 0;
    s.grains = grainsOf(L.slot.text, layout, family, L.size, L.motionSafe);
    // A line that starts finished is already written.
    if (first && L.slot.final) s.t = s.grains.writeEnd;
    s.mark.fill(layout.h);
    draw();
    kick();
  };

  React.useLayoutEffect(() => {
    latest.current = {
      list,
      done,
      active,
      determinate,
      band,
      local,
      rate,
      size,
      motionSafe,
      running,
      slot,
    };
    report.current = onPhraseChange;
    api.current = { kick, draw, resize, settle, pause };
  });

  // The first phrase is state too: the host hears it from the first commit.
  React.useEffect(() => {
    report.current?.(slot.index);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new beach: new colours and bed, drawn at once.
  React.useEffect(() => {
    const s = scene.current;
    s.paint = paintOf(beach);
    if (s.L.w > 0) s.bed = bakeBed(s.L, s.dpr, s.paint, size);
    api.current?.draw();
  }, [beach, size]);

  // A new grain size sets the type again (coarse grain needs bigger
  // letters) and re-pours the phrase at the same point in its pour.
  const sized = React.useRef(size);
  React.useEffect(() => {
    if (sized.current === size) return;
    sized.current = size;
    api.current?.resize(true);
  }, [size]);

  // New phrases may need another line: the tray is laid out again.
  const listKey = [...list, done].join("\u0000");
  const laidFor = React.useRef(listKey);
  React.useEffect(() => {
    if (laidFor.current === listKey) return;
    laidFor.current = listKey;
    api.current?.resize(true);
  }, [listKey]);

  // Where the clock may go has changed: the host, the progress, a speed,
  // the page or the element coming and going.
  React.useEffect(() => {
    const s = scene.current;
    if (!running) {
      api.current?.pause();
      return;
    }
    if (s.phase === "rest") api.current?.settle();
    api.current?.kick();
  }, [running, active, band, local, rate, determinate]);

  React.useEffect(
    () => () => {
      api.current?.pause();
      stroke.current?.stop();
    },
    [],
  );

  // The tray's size and whether it is on screen, bound to the node when it
  // arrives. Off screen nothing runs.
  const bindTray = React.useCallback((node: HTMLButtonElement | null) => {
    trayRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const on = Boolean(entry?.isIntersecting);
      visible.current = on;
      setOnScreen(on);
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.resize(true));
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local2 = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const swish = (speedPx: number, clientX: number) => {
    const f = finger.current;
    if (!f || speedPx < 480) return;
    const t = now();
    if (t - f.swish < 0.11) return;
    f.swish = t;
    audio.play("swish", {
      pitch: r2(0.8 + Math.min(0.6, speedPx / 3000)),
      gain: r2(Math.min(0.55, 0.15 + speedPx / 4000)),
      pan: panFrom(clientX, trayRef.current),
    });
  };

  const drag = useDrag({
    threshold: 2,
    disabled,
    onStart: ({ point, offset }) => {
      stroke.current?.stop();
      const at = local2(point.x - offset.x, point.y - offset.y);
      finger.current = { ...at, t: now(), swish: 0 };
      addPoint(at.x, at.y, true, true);
    },
    onMove: ({ point }) => {
      const f = finger.current;
      if (!f) return;
      const at = local2(point.x, point.y);
      const t = now();
      const moved = Math.hypot(at.x - f.x, at.y - f.y);
      if (moved < 1.5) return;
      swish(moved / Math.max(0.008, t - f.t), point.x);
      addPoint(at.x, at.y, true, false);
      finger.current = { ...f, ...at, t };
    },
    onEnd: () => {
      finger.current = null;
    },
    onCancel: () => {
      finger.current = null;
    },
    onTap: (event) => {
      // A dab: a short, deep dimple under the finger.
      const at = local2(event.clientX, event.clientY);
      addPoint(at.x - 1.5, at.y, true, true);
      addPoint(at.x + 1.5, at.y + 0.5, true, false);
    },
  });

  /** The keyboard's finger: one wavy line through the words, the same groove a drag digs. */
  const sweep = () => {
    if (disabled) return;
    const s = scene.current;
    const g = s.grains;
    if (s.L.w < 1) return;
    const x0 = Math.max(8, (g.n ? g.left : PAD_X) - 10);
    const x1 = Math.min(s.L.w - 8, (g.n ? g.right : s.L.w - PAD_X) + 10);
    const mid = g.n ? g.mid : s.L.h / 2;
    const yAt = (x: number) => mid + Math.sin((x - x0) * 0.028) * s.L.lh * 0.22;
    audio.play("swish", { pitch: 1.05, gain: 0.4 });
    stroke.current?.stop();
    if (!latest.current.motionSafe) {
      let fresh = true;
      for (let x = x0; x <= x1; x += 6) {
        addPoint(x, yAt(x), true, fresh);
        fresh = false;
      }
      return;
    }
    let fresh = true;
    let last = x0;
    stroke.current = animate(0, 1, {
      duration: 0.7,
      ease: [0.45, 0, 0.55, 1],
      onUpdate: (v) => {
        const x = x0 + (x1 - x0) * v;
        for (let at = last; at < x; at += 5) {
          addPoint(at, yAt(at), true, fresh);
          fresh = false;
        }
        addPoint(x, yAt(x), true, fresh);
        fresh = false;
        last = x;
      },
      onComplete: () => {
        stroke.current = null;
      },
    });
  };

  return (
    <>
      <div
        className={cn("relative w-full", className)}
        aria-busy={active || undefined}
      >
        <button
          ref={bindTray}
          type="button"
          aria-label="Draw in the sand"
          aria-describedby={hintId}
          disabled={disabled}
          onClick={(event) => {
            // Pointer drawing arrives through the drag. A click with no
            // pointer behind it — Space, Enter, assistive technology — runs
            // a finger along the line.
            if (event.detail === 0) sweep();
          }}
          onPointerDown={drag.onPointerDown}
          onPointerMove={(event) => {
            drag.onPointerMove(event);
            // A mouse passing over, not pressed, leaves a shallow trail.
            if (
              disabled ||
              event.pointerType !== "mouse" ||
              event.buttons !== 0
            )
              return;
            const at = local2(event.clientX, event.clientY);
            const s = scene.current;
            const line = s.strokes[s.strokes.length - 1];
            const prev = line?.[line.length - 1];
            const fresh = !prev || now() - prev.at > 0.12 || prev.depth > 0.5;
            if (prev && !fresh && Math.hypot(at.x - prev.x, at.y - prev.y) < 2)
              return;
            addPoint(at.x, at.y, false, fresh);
          }}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
          onLostPointerCapture={drag.onLostPointerCapture}
          className={cn(
            "relative block w-full touch-pan-y overflow-clip rounded-3 border border-hairline-strong text-left outline-none select-none [-webkit-touch-callout:none]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-default" : "cursor-crosshair",
          )}
          style={{ backgroundColor: css(beach.bed) }}
        >
          <motion.div
            initial={false}
            animate={{ height: height ?? REST_H }}
            transition={
              measured && motionSafe ? springs.glide : { duration: 0 }
            }
            className="relative"
          >
            <canvas
              ref={canvasRef}
              aria-hidden
              className="absolute inset-x-0 top-0 block w-full font-sans"
              style={{ height: height ?? REST_H }}
            />
            {/* A veil of the page: a pale beach does not glare on a dark page. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-background opacity-[0.08]"
            />
          </motion.div>
        </button>
        <span id={hintId} className="sr-only">
          Drag across the sand to draw in it, or press Enter to draw a line
          through the words.
        </span>
      </div>
      {/* Outside the busy root: a busy ancestor may hold announcements back. */}
      <p role="status" className="sr-only">
        {slot.text}
      </p>
    </>
  );
}
