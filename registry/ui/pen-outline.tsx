"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PenOutlineTrigger = "mount" | "inView" | "hover" | "manual";
export type PenOutlinePhase = "waiting" | "drawing" | "flooding" | "inked";
export type PenOutlineElement = "h1" | "h2" | "h3" | "p" | "span" | "div";

export type PenOutlineProps = {
  /** The words the pen writes. */
  text: string;
  /** The element rendered. @default "p" */
  as?: PenOutlineElement;
  /** How fast the pen writes and the ink floods, 0.5 to 2. @default 1 */
  speed?: number;
  /** Outline width, px. @default 1.25 */
  stroke?: number;
  /** How much ink floods in once the outline closes: 0 leaves a pure outline, 1 is solid ink. @default 1 */
  flood?: number;
  /** Outline colour, any CSS colour. @default "var(--foreground)" */
  ink?: string;
  /** The colour the letters flood with. @default the `ink` colour */
  floodColor?: string;
  /** Opacity of the pencil guide shown before the pen arrives, 0 to 1. @default 0.12 */
  guide?: number;
  /** Height of the flood's wave front, 0 (flat) to 1. @default 0.5 */
  wave?: number;
  /** Show the travelling nib. @default true */
  nib?: boolean;
  /** Keep the inked edge once the flood settles; false dissolves it into the fill. @default true */
  keepOutline?: boolean;
  /** What starts the drawing. @default "inView" */
  trigger?: PenOutlineTrigger;
  /** Draw once; false rewinds when it leaves view or the hover ends. @default true */
  once?: boolean;
  /** Manual trigger: true draws, false rewinds. */
  play?: boolean;
  /** Wait before the pen starts, ms. @default 0 */
  delay?: number;
  /** Time the pen spends on an average letter at speed 1, ms. @default 180 */
  duration?: number;
  /** Gap between the letters' floods, ms. @default 55 */
  stagger?: number;
  /** A press, or Enter or Space while focused, erases and redraws. @default true */
  interactive?: boolean;
  /** The drawing moved on: "waiting", "drawing", "flooding" or "inked". */
  onPhaseChange?: (phase: PenOutlinePhase) => void;
  /** The ink has settled. */
  onComplete?: () => void;
  className?: string;
};

/** The nib coming down onto the first letter, s at speed 1. */
const DESCEND = 0.18;
/** The nib lifting away once the last stroke closes, s at speed 1. */
const RISE = 0.26;
/** The longest a whole headline may take to draw, s at speed 1. */
const MAX_DRAW = 3;
/** The nib's length, em. */
const NIB = 0.42;
/** A clip that shows nothing: a letter not yet flooded. */
const DRY = "inset(0 0 100% 0)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.round(clamp01(v) * 100);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const easeInOut = (u: number) =>
  u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

/** A calibration spring run `f` times slower, with its damping ratio kept. */
const timed = (s: Spring, f: number): Spring => ({
  ...s,
  stiffness: s.stiffness / (f * f),
  damping: s.damping / f,
});

/**
 * A stagger span, ms, kept brief for long texts: linear up to half a second,
 * then easing toward a ceiling so forty letters never take three seconds.
 */
const soften = (ms: number) =>
  ms <= 500 ? ms : 500 + (450 * (ms - 500)) / (ms - 500 + 450);

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/* ------------------------------------------------------------------ */
/* Tracing: the rendered glyph, back to an outline                      */
/* ------------------------------------------------------------------ */

type Outline = {
  /** Points, x y pairs in the root's CSS pixels; the loop closes on itself. */
  pts: Float64Array;
  /** Running length at each point; the last entry is the closed length. */
  cum: Float64Array;
  length: number;
  d: string;
};

type Traced = {
  width: number;
  height: number;
  font: number;
  /** Each grapheme's outlines, larger loops first; empty for spaces. */
  letters: Outline[][];
  signature: string;
};

/**
 * Contours of a glyph's coverage at half alpha, by marching squares with the
 * crossing interpolated along each cell edge, so the outline sits on the
 * antialiased edge with sub-pixel accuracy. Saddles are resolved by the cell's
 * centre. Loops come back as flat x y arrays in raster pixels.
 */
function contours(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  next: Int32Array,
): number[][] {
  const W = w + 2;
  const H = h + 2;
  const T = 127.5;
  next.fill(-1, 0, W * H * 2);
  const at = (X: number, Y: number) => {
    const x = X - 1;
    const y = Y - 1;
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    return data[(y * w + x) * 4 + 3] ?? 0;
  };
  const ids = [0, 0, 0, 0];
  const exits = [false, false, false, false];
  for (let Y = 0; Y < H - 1; Y += 1) {
    for (let X = 0; X < W - 1; X += 1) {
      const tl = at(X, Y);
      const tr = at(X + 1, Y);
      const br = at(X + 1, Y + 1);
      const bl = at(X, Y + 1);
      const a = tl > T;
      const b = tr > T;
      const c = br > T;
      const d = bl > T;
      if (a === b && b === c && c === d) continue;
      // Crossings in clockwise order round the cell; an edge walked from
      // inside to outside is an exit, the other way an entry. A shared edge
      // is walked in opposite directions by its two cells, so every point is
      // one cell's exit and the next cell's entry, and the loops chain.
      let n = 0;
      if (a !== b) {
        ids[n] = (Y * W + X) * 2;
        exits[n] = a;
        n += 1;
      }
      if (b !== c) {
        ids[n] = (Y * W + X + 1) * 2 + 1;
        exits[n] = b;
        n += 1;
      }
      if (c !== d) {
        ids[n] = ((Y + 1) * W + X) * 2;
        exits[n] = c;
        n += 1;
      }
      if (d !== a) {
        ids[n] = (Y * W + X) * 2 + 1;
        exits[n] = d;
        n += 1;
      }
      if (n === 2) {
        const entry = exits[0] ? 1 : 0;
        next[ids[entry] as number] = ids[1 - entry] as number;
        continue;
      }
      const centreIn = (tl + tr + br + bl) / 4 > T;
      for (let k = 0; k < 4; k += 1) {
        if (exits[k]) continue;
        const pair = centreIn ? (k + 3) % 4 : (k + 1) % 4;
        next[ids[k] as number] = ids[pair] as number;
      }
    }
  }
  const point = (id: number, out: number[]) => {
    const cell = id >> 1;
    const X = cell % W;
    const Y = (cell - X) / W;
    if ((id & 1) === 0) {
      const va = at(X, Y);
      const vb = at(X + 1, Y);
      out.push(X - 0.5 + (T - va) / (vb - va), Y - 0.5);
    } else {
      const va = at(X, Y);
      const vb = at(X, Y + 1);
      out.push(X - 0.5, Y - 0.5 + (T - va) / (vb - va));
    }
  };
  const loops: number[][] = [];
  const total = W * H * 2;
  for (let id = 0; id < total; id += 1) {
    if ((next[id] ?? -1) < 0) continue;
    const pts: number[] = [];
    let cur = id;
    while (cur >= 0) {
      const to = next[cur] ?? -1;
      if (to < 0) break;
      point(cur, pts);
      next[cur] = -1;
      cur = to;
    }
    if (pts.length >= 6) loops.push(pts);
  }
  return loops;
}

/** Ramer–Douglas–Peucker on a closed loop, split at its farthest point. */
function simplify(pts: number[], tolerance: number): number[] {
  const n = pts.length / 2;
  if (n < 8) return pts;
  const x = (i: number) => pts[(i % n) * 2] ?? 0;
  const y = (i: number) => pts[(i % n) * 2 + 1] ?? 0;
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i += 1) {
    const d = (x(i) - x(0)) ** 2 + (y(i) - y(0)) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack = [0, far, far, n];
  const tol2 = tolerance * tolerance;
  while (stack.length) {
    const b = stack.pop() as number;
    const a = stack.pop() as number;
    const ax = x(a);
    const ay = y(a);
    const dx = x(b) - ax;
    const dy = y(b) - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const t = clamp01(((x(i) - ax) * dx + (y(i) - ay) * dy) / len2);
      const ex = ax + t * dx - x(i);
      const ey = ay + t * dy - y(i);
      const d = ex * ex + ey * ey;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tol2 && at > 0) {
      keep[at] = 1;
      stack.push(a, at, at, b);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) if (keep[i]) out.push(x(i), y(i));
  return out;
}

/**
 * One loop, finished for the pen: rounded, turned to run anticlockwise on
 * screen (the way a hand writes an o), started at its top-most point.
 */
function outlineOf(raw: number[]): Outline | null {
  const n = raw.length / 2;
  if (n < 3) return null;
  let area = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    area +=
      (raw[i * 2] ?? 0) * (raw[j * 2 + 1] ?? 0) -
      (raw[j * 2] ?? 0) * (raw[i * 2 + 1] ?? 0);
  }
  if (Math.abs(area / 2) < 0.4) return null;
  const order = Array.from({ length: n }, (_, i) => (area > 0 ? n - 1 - i : i));
  let top = 0;
  for (let k = 1; k < n; k += 1) {
    const i = order[k] as number;
    const t = order[top] as number;
    const yi = raw[i * 2 + 1] ?? 0;
    const yt = raw[t * 2 + 1] ?? 0;
    if (
      yi < yt - 0.01 ||
      (Math.abs(yi - yt) <= 0.01 && (raw[i * 2] ?? 0) < (raw[t * 2] ?? 0))
    ) {
      top = k;
    }
  }
  const pts = new Float64Array(n * 2);
  for (let k = 0; k < n; k += 1) {
    const i = order[(top + k) % n] as number;
    pts[k * 2] = r2(raw[i * 2] ?? 0);
    pts[k * 2 + 1] = r2(raw[i * 2 + 1] ?? 0);
  }
  const cum = new Float64Array(n + 1);
  let d = `M${pts[0]} ${pts[1]}`;
  for (let k = 1; k <= n; k += 1) {
    const i = k % n;
    cum[k] =
      (cum[k - 1] ?? 0) +
      Math.hypot(
        (pts[i * 2] ?? 0) - (pts[(k - 1) * 2] ?? 0),
        (pts[i * 2 + 1] ?? 0) - (pts[(k - 1) * 2 + 1] ?? 0),
      );
    if (k < n) d += `L${pts[i * 2]} ${pts[i * 2 + 1]}`;
  }
  return { pts, cum, length: r2(cum[n] ?? 0), d: `${d}Z` };
}

/** Where along a loop the pen is, `s` px from its start. */
function pointOn(o: Outline, s: number): [number, number] {
  const n = o.pts.length / 2;
  const at = clamp(s, 0, o.length);
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((o.cum[mid] ?? 0) <= at) lo = mid;
    else hi = mid;
  }
  const a = o.cum[lo] ?? 0;
  const b = o.cum[lo + 1] ?? a;
  const u = b > a ? (at - a) / (b - a) : 0;
  const j = (lo + 1) % n;
  return [
    (o.pts[lo * 2] ?? 0) + ((o.pts[j * 2] ?? 0) - (o.pts[lo * 2] ?? 0)) * u,
    (o.pts[lo * 2 + 1] ?? 0) +
      ((o.pts[j * 2 + 1] ?? 0) - (o.pts[lo * 2 + 1] ?? 0)) * u,
  ];
}

/* ------------------------------------------------------------------ */
/* The pen's timeline                                                   */
/* ------------------------------------------------------------------ */

type Stroke = {
  key: string;
  outline: Outline;
  /** When the hop to this loop begins, when the pen touches down, lifts. */
  h0: number;
  t0: number;
  t1: number;
};

type Plan = {
  strokes: Stroke[];
  /** When each grapheme's last loop closes, s; -1 for spaces. */
  letterEnd: number[];
  descend: number;
  rise: number;
  drawEnd: number;
  total: number;
};

function planOf(traced: Traced, rate: number, perLetter: number): Plan {
  const flat: { outline: Outline; letter: number; k: number }[] = [];
  traced.letters.forEach((loops, letter) => {
    loops.forEach((outline, k) => flat.push({ outline, letter, k }));
  });
  const inked = traced.letters.filter((l) => l.length > 0).length || 1;
  const length = flat.reduce((sum, f) => sum + f.outline.length, 0);
  const descend = DESCEND / rate;
  const rise = RISE / rate;
  const letterEnd = traced.letters.map(() => -1);
  if (!flat.length || length <= 0) {
    return { strokes: [], letterEnd, descend, rise, drawEnd: 0, total: 0 };
  }
  // A constant hand: the average letter takes `perLetter`, a busy one longer.
  const v = (length / inked / Math.max(40, perLetter)) * 1000 * rate;
  let t = descend;
  let px = flat[0]?.outline.pts[0] ?? 0;
  let py = flat[0]?.outline.pts[1] ?? 0;
  const strokes = flat.map(({ outline, letter, k }, i): Stroke => {
    const sx = outline.pts[0] ?? 0;
    const sy = outline.pts[1] ?? 0;
    const h0 = t;
    if (i > 0) {
      // In the air the hand moves faster than it writes.
      const hop = Math.hypot(sx - px, sy - py) / (v * 3);
      t += clamp(hop, 0.03 / rate, 0.12 / rate);
    }
    const t0 = t;
    t += outline.length / v;
    px = sx;
    py = sy;
    return { key: `${letter}:${k}`, outline, h0, t0, t1: t };
  });
  // A long headline is written faster rather than taking all afternoon: the
  // whole pass, hops included, fits the cap.
  const cap = MAX_DRAW / rate;
  const k = t - descend > cap ? cap / (t - descend) : 1;
  const at = (x: number) => descend + (x - descend) * k;
  for (const s of strokes) {
    s.h0 = at(s.h0);
    s.t0 = at(s.t0);
    s.t1 = at(s.t1);
    const letter = Number(s.key.split(":")[0]);
    letterEnd[letter] = Math.max(letterEnd[letter] ?? -1, s.t1);
  }
  const drawEnd = at(t);
  return { strokes, letterEnd, descend, rise, drawEnd, total: drawEnd + rise };
}

type NibState = { x: number; y: number; lift: number; on: number };

/** The nib at time `t`: on a loop, hopping between loops, or in the air. */
function nibAt(plan: Plan, t: number): NibState {
  const s = plan.strokes;
  const first = s[0];
  const last = s[s.length - 1];
  if (!first || !last) return { x: 0, y: 0, lift: 1, on: 0 };
  if (t <= plan.descend) {
    const u = clamp01(t / plan.descend);
    return {
      x: first.outline.pts[0] ?? 0,
      y: first.outline.pts[1] ?? 0,
      lift: 1 - easeOut(u),
      on: u,
    };
  }
  if (t >= plan.drawEnd) {
    const u = clamp01((t - plan.drawEnd) / plan.rise);
    return {
      x: last.outline.pts[0] ?? 0,
      y: last.outline.pts[1] ?? 0,
      lift: easeOut(u),
      on: 1 - u,
    };
  }
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((s[mid]?.h0 ?? 0) <= t) lo = mid;
    else hi = mid - 1;
  }
  const at = s[lo] as Stroke;
  if (t < at.t0) {
    // In the air between loops: a short arc, eased at both ends.
    const prev = s[lo - 1] ?? at;
    const u = clamp01((t - at.h0) / Math.max(1e-6, at.t0 - at.h0));
    const e = easeInOut(u);
    const ax = prev.outline.pts[0] ?? 0;
    const ay = prev.outline.pts[1] ?? 0;
    return {
      x: ax + ((at.outline.pts[0] ?? 0) - ax) * e,
      y: ay + ((at.outline.pts[1] ?? 0) - ay) * e,
      lift: Math.sin(Math.PI * u) * 0.9,
      on: 1,
    };
  }
  const u = clamp01((t - at.t0) / Math.max(1e-6, at.t1 - at.t0));
  const [x, y] = pointOn(at.outline, u * at.outline.length);
  return { x, y, lift: 0, on: 1 };
}

/** The flood's surface: a polygon whose top edge is a gentle swell. */
function waveClip(level: number, phase: number, height: number): string {
  if (level <= 0.001) return DRY;
  if (level >= 0.999) return "none";
  const amp = height * (0.35 + 0.65 * (1 - level));
  const base = 100 + height - level * (100 + 2 * height);
  const points = ["-30% 130%"];
  for (let j = 0; j <= 8; j += 1) {
    const x = -30 + j * 20;
    const y = base + amp * Math.sin(phase + (j / 8) * Math.PI * 2.4);
    points.push(`${x}% ${r2(y)}%`);
  }
  points.push("130% 130%");
  return `polygon(${points.join(", ")})`;
}

/* ------------------------------------------------------------------ */
/* Parts                                                                */
/* ------------------------------------------------------------------ */

type GlyphProps = {
  char: string;
  level: MotionValue<number>;
  phase: MotionValue<number>;
  clock: MotionValue<number>;
  reveal: MotionValue<number>;
  seed: number;
  end: number;
  wave: number;
  guide: number;
  ink: string;
  fill: string;
  motionSafe: boolean;
  bind: (node: HTMLSpanElement | null) => void;
};

function Glyph({
  char,
  level,
  phase,
  clock,
  reveal,
  seed,
  end,
  wave,
  guide,
  ink,
  fill,
  motionSafe,
  bind,
}: GlyphProps) {
  const clip = useTransform([level, phase], ([l = 0, ph = 0]: number[]) =>
    motionSafe ? waveClip(l, ph + seed, wave * 7) : l > 0.001 ? "none" : DRY,
  );
  const fillOpacity = useTransform(level, (l) => (motionSafe ? 1 : r2(l)));
  // The pencil goes as the pen passes: each letter's guide fades just after
  // its own outline closes.
  const pencil = useTransform([clock, reveal], ([t = 0, rv = 0]: number[]) =>
    r2(guide * (1 - clamp01((t - end) / 0.15) * rv)),
  );
  return (
    <span ref={bind} className="relative inline-block">
      <motion.span
        className="pointer-events-none absolute inset-0 select-none"
        style={{ color: ink, opacity: pencil }}
      >
        {char}
      </motion.span>
      <motion.span
        className="relative inline-block"
        style={{ color: fill, clipPath: clip, opacity: fillOpacity }}
      >
        {char}
      </motion.span>
    </span>
  );
}

function StrokePath({
  stroke,
  clock,
}: {
  stroke: Stroke;
  clock: MotionValue<number>;
}) {
  const { outline, t0, t1 } = stroke;
  const offset = useTransform(clock, (t) =>
    r2(outline.length * (1 - clamp01((t - t0) / Math.max(1e-6, t1 - t0)))),
  );
  // A dash of zero length still paints its round cap: a loop the pen has not
  // reached is hidden outright.
  const shown = useTransform(clock, (t) => (t > t0 ? 1 : 0));
  return (
    <motion.path
      d={outline.d}
      strokeDasharray={`${outline.length} ${r2(outline.length + 8)}`}
      style={{ strokeDashoffset: offset, opacity: shown }}
    />
  );
}

/** A pointed nib seen from above, tip at the origin, length 1. */
const NIB_BODY =
  "M0 0C-0.07 -0.22 -0.3 -0.5 -0.3 -0.78L-0.22 -1L0.22 -1L0.3 -0.78C0.3 -0.5 0.07 -0.22 0 0Z";
const NIB_FACET = "M0 0C-0.07 -0.22 -0.3 -0.5 -0.3 -0.78L-0.22 -1L0 -1Z";
const NIB_SLIT = "M-0.014 -0.07L0.014 -0.07L0.014 -0.52L-0.014 -0.52Z";

function Nib({
  plan,
  clock,
  on,
  size,
}: {
  plan: Plan;
  clock: MotionValue<number>;
  on: MotionValue<number>;
  size: number;
}) {
  const state = useTransform(clock, (t) => nibAt(plan, t));
  const x = useTransform(state, (s) => r2(s.x));
  const y = useTransform(state, (s) => r2(s.y - s.lift * size * 0.3));
  const opacity = useTransform(() => r2(state.get().on * on.get()));
  // The nib's shadow stays on the paper: it widens and pales as it lifts.
  const shadowX = useTransform(state, (s) => r2(s.x + size * 0.1));
  const shadowY = useTransform(state, (s) => r2(s.y + size * 0.06));
  const shadowOpacity = useTransform(() => {
    const s = state.get();
    return r2(0.22 * (1 - 0.7 * s.lift) * s.on * on.get());
  });
  const shadowScale = useTransform(state, (s) => r2(1 + s.lift * 0.6));
  const scale = r2(size);
  return (
    <>
      <motion.ellipse
        cx={0}
        cy={0}
        rx={r2(size * 0.16)}
        ry={r2(size * 0.05)}
        style={{
          x: shadowX,
          y: shadowY,
          opacity: shadowOpacity,
          scale: shadowScale,
          fill: "color-mix(in oklab, black 70%, transparent)",
        }}
      />
      <motion.g style={{ x, y, opacity }}>
        <g transform={`rotate(32) scale(${scale})`}>
          <path
            d={NIB_BODY}
            style={{
              fill: "color-mix(in oklab, var(--foreground) 86%, var(--background))",
            }}
          />
          <path
            d={NIB_FACET}
            style={{
              fill: "color-mix(in oklab, var(--background) 28%, transparent)",
            }}
          />
          <path d={NIB_SLIT} style={{ fill: "var(--background)" }} />
          <circle
            cx={0}
            cy={-0.58}
            r={0.055}
            style={{ fill: "var(--background)" }}
          />
        </g>
      </motion.g>
    </>
  );
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Phase = PenOutlinePhase | "erasing";

type Api = {
  trace: () => void;
  sync: () => void;
  resume: () => void;
  floodIn: () => void;
  finish: () => void;
  erased: () => void;
  press: () => void;
  halt: () => void;
};

/**
 * A headline written by a pen. The outline of every letter is traced from the
 * glyph the browser actually rendered — any font, any size — and a small nib
 * travels each contour while the stroke grows under its tip (the dash offset
 * and the nib read the same point on the same path), letter after letter,
 * lifting and setting down between loops. When the last stroke closes the nib
 * lifts away and ink floods each letter from the bottom up behind a gentle
 * wave, one after another on the drift spring.
 *
 * The flood is the real text, so it is crisp, selectable and copyable; the
 * outline stays on it as an inked edge. A press — or Enter or Space while
 * focused — drains the ink, rewinds the outline and writes it again. Drawing
 * pauses off screen and in a hidden tab, and nothing runs once it settles.
 * Under reduced motion there is no nib and no wave: the outline fades in,
 * then the ink.
 */
export function PenOutline(props: PenOutlineProps) {
  return <Pen key={props.text} {...props} />;
}

function Pen({
  text,
  as = "p",
  speed = 1,
  stroke = 1.25,
  flood = 1,
  ink = "var(--foreground)",
  floodColor,
  guide = 0.12,
  wave = 0.5,
  nib = true,
  keepOutline = true,
  trigger = "inView",
  once = true,
  play,
  delay = 0,
  duration = 180,
  stagger = 55,
  interactive = true,
  onPhaseChange,
  onComplete,
  className,
}: PenOutlineProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rate = clamp(speed, 0.25, 4);
  const amount = clamp01(flood);
  const fill = `color-mix(in oklab, ${floodColor ?? ink} ${pct(amount)}%, transparent)`;

  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const [seen, setSeen] = React.useState(false);
  const [traced, setTraced] = React.useState<Traced | null>(null);
  const running = onScreen && !hidden;
  const target =
    trigger === "manual" ? Boolean(play) : trigger === "mount" ? true : seen;

  const chars = React.useMemo(() => graphemes(text), [text]);
  const words = React.useMemo(() => {
    const out: { key: number; at: number[] }[] = [];
    let current: number[] = [];
    chars.forEach((char, at) => {
      if (char.trim() === "") {
        if (current.length) out.push({ key: at, at: current });
        current = [];
        return;
      }
      current.push(at);
    });
    if (current.length) out.push({ key: chars.length, at: current });
    return out;
  }, [chars]);
  const levels = React.useMemo(() => chars.map(() => motionValue(0)), [chars]);
  const plan = React.useMemo(
    () => (traced ? planOf(traced, rate, duration) : null),
    [traced, rate, duration],
  );

  const clock = useMotionValue(0);
  const reveal = useMotionValue(1);
  const outlineFade = useMotionValue(1);
  const nibOn = useMotionValue(1);
  const phase = useMotionValue(0);
  const outlineOpacity = useTransform(
    [reveal, outlineFade],
    ([a = 0, b = 0]: number[]) => r2(a * b),
  );

  const rootRef = React.useRef<HTMLElement | null>(null);
  const letterNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const markers = React.useRef(new Map<number, HTMLSpanElement>());
  const canvas = React.useRef<HTMLCanvasElement | null>(null);
  const scratch = React.useRef<Int32Array | null>(null);
  const state = React.useRef<Phase>("waiting");
  const reported = React.useRef<PenOutlinePhase | null>(null);
  const clockRun = React.useRef<AnimationPlaybackControls | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const timer = React.useRef<number | null>(null);
  const redraw = React.useRef(false);
  const shownPlan = React.useRef<Plan | null>(null);
  const api = React.useRef<Api | null>(null);
  const latest = React.useRef({ onPhaseChange, onComplete, trigger, once });

  const report = (p: PenOutlinePhase) => {
    if (reported.current === p) return;
    reported.current = p;
    latest.current.onPhaseChange?.(p);
  };

  const halt = () => {
    clockRun.current?.stop();
    clockRun.current = null;
    for (const r of runs.current) r.stop();
    runs.current = [];
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  /** Measures every letter where it sits and traces its rendered glyph. */
  const trace = () => {
    const root = rootRef.current;
    if (!root || !root.isConnected) return;
    const box = root.getBoundingClientRect();
    const k = root.offsetWidth ? box.width / root.offsetWidth : 1;
    if (!k) return;
    const fontSize = parseFloat(getComputedStyle(root).fontSize) || 16;
    const items: {
      at: number;
      char: string;
      left: number;
      top: number;
      width: number;
      height: number;
      base: number;
      font: string;
      transform: string;
    }[] = [];
    words.forEach((word, w) => {
      const marker = markers.current.get(w);
      const base = marker
        ? (marker.getBoundingClientRect().top - box.top) / k
        : 0;
      for (const at of word.at) {
        const node = letterNodes.current.get(at);
        if (!node) continue;
        const r = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        items.push({
          at,
          char: chars[at] ?? "",
          left: (r.left - box.left) / k,
          top: (r.top - box.top) / k,
          width: r.width / k,
          height: r.height / k,
          base,
          font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
          transform: style.textTransform,
        });
      }
    });
    const width = Math.round(root.offsetWidth);
    const height = Math.round(root.offsetHeight);
    const signature = `${width}:${height}:${items
      .map((i) => `${r2(i.left)},${r2(i.top)},${i.font}`)
      .join("|")}`;
    if (traced && traced.signature === signature) return;

    // Enough raster to keep curves smooth, never more than ~128px an em.
    const scale = clamp(128 / fontSize, 0.75, 2);
    const pad = fontSize * 0.4;
    let cw = 1;
    let ch = 1;
    for (const i of items) {
      cw = Math.max(cw, Math.ceil((i.width + pad * 2) * scale));
      ch = Math.max(ch, Math.ceil((i.height + pad * 2) * scale));
    }
    canvas.current ??= document.createElement("canvas");
    const c = canvas.current;
    if (c.width < cw) c.width = cw;
    if (c.height < ch) c.height = ch;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const need = (cw + 2) * (ch + 2) * 2;
    if (!scratch.current || scratch.current.length < need) {
      scratch.current = new Int32Array(need);
    }
    const letters: Outline[][] = chars.map(() => []);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "black";
    for (const i of items) {
      const w = Math.ceil((i.width + pad * 2) * scale);
      const h = Math.ceil((i.height + pad * 2) * scale);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w + 2, h + 2);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.font = i.font;
      const glyph =
        i.transform === "uppercase"
          ? i.char.toUpperCase()
          : i.transform === "lowercase"
            ? i.char.toLowerCase()
            : i.char;
      ctx.fillText(glyph, pad, pad + i.base - i.top);
      const data = ctx.getImageData(0, 0, w, h).data;
      const loops = contours(data, w, h, scratch.current)
        .map((loop) => {
          const css = loop.map((v, j) =>
            j % 2 === 0 ? v / scale - pad + i.left : v / scale - pad + i.top,
          );
          return outlineOf(simplify(css, 0.2));
        })
        .filter((o): o is Outline => o !== null)
        // The body of a letter first, then its counters and dots.
        .sort((a, b) => b.length - a.length);
      letters[i.at] = loops;
    }
    setTraced({ width, height, font: fontSize, letters, signature });
  };

  /** Settles the drawing against what the trigger asks for now. */
  const sync = () => {
    if (!plan) return;
    const p = state.current;
    if (!target) {
      if (p === "drawing" || p === "flooding" || p === "inked") {
        if (!running) {
          // Off screen there is nothing to watch: back to clean paper.
          halt();
          clock.jump(0);
          for (const l of levels) l.jump(0);
          outlineFade.jump(1);
          state.current = "waiting";
          report("waiting");
          return;
        }
        erase(false);
      }
      return;
    }
    if (p === "waiting") start();
    else if (p === "drawing") resume();
    else if (p === "flooding") floodIn();
    else if (p === "erasing") {
      redraw.current = true;
      erase(true);
    } else if (!keepOutline && outlineFade.get() > 0 && !runs.current.length) {
      finish();
    }
  };

  const start = () => {
    if (!plan || !running) return;
    halt();
    state.current = "drawing";
    report("drawing");
    nibOn.jump(1);
    outlineFade.jump(1);
    if (!motionSafe) {
      clock.jump(plan.total);
      reveal.jump(0);
      runs.current = [
        animate(reveal, 1, {
          duration: durations.slow,
          ease: easings.enter,
          delay: delay / 1000,
          onComplete: () => api.current?.floodIn(),
        }),
      ];
      return;
    }
    reveal.jump(1);
    clock.jump(0);
    if (delay > 0) {
      timer.current = window.setTimeout(() => {
        timer.current = null;
        api.current?.resume();
      }, delay);
      return;
    }
    resume();
  };

  /** The pen runs on from wherever it stopped. */
  const resume = () => {
    if (!plan || state.current !== "drawing") return;
    if (!motionSafe) {
      if (!runs.current.length) {
        runs.current = [
          animate(reveal, 1, {
            duration: durations.slow,
            ease: easings.enter,
            onComplete: () => api.current?.floodIn(),
          }),
        ];
      }
      return;
    }
    clockRun.current?.stop();
    clockRun.current = null;
    if (!running || timer.current !== null) return;
    const from = clock.get();
    if (from >= plan.drawEnd - 1e-4) {
      floodIn();
      return;
    }
    // A hand at constant speed: the clock is linear, the plan holds the pace.
    clockRun.current = animate(clock, plan.drawEnd, {
      duration: plan.drawEnd - from,
      ease: "linear",
      onComplete: () => api.current?.floodIn(),
    });
  };

  /** The last stroke has closed: the nib lifts away and the ink rises. */
  const floodIn = () => {
    if (!plan) return;
    halt();
    state.current = "flooding";
    report("flooding");
    if (motionSafe && clock.get() < plan.total) {
      clockRun.current = animate(clock, plan.total, {
        duration: plan.total - clock.get(),
        ease: "linear",
      });
    }
    const order = chars
      .map((ch, i) => (ch.trim() === "" ? -1 : i))
      .filter((i) => i >= 0);
    if (amount <= 0.001 || !order.length) {
      finish();
      return;
    }
    const n = order.length;
    if (!motionSafe) {
      runs.current = order.map((i, k) =>
        animate(levels[i] as MotionValue<number>, 1, {
          duration: durations.slow,
          ease: easings.enter,
          delay: k * 0.03,
          onComplete: k === n - 1 ? () => api.current?.finish() : undefined,
        }),
      );
      return;
    }
    const span = soften(stagger * (n - 1)) / rate / 1000;
    const rise = timed(springs.drift, 1 / rate);
    runs.current = order.map((i, k) =>
      animate(levels[i] as MotionValue<number>, 1, {
        ...rise,
        delay: n > 1 ? (span * k) / (n - 1) : 0,
        onComplete: k === n - 1 ? () => api.current?.finish() : undefined,
      }),
    );
    // The surface keeps moving while it rises, then calms.
    runs.current.push(
      animate(phase, phase.get() + Math.PI * 3, {
        duration: span + 1.1 / rate,
        ease: easings.enter,
      }),
    );
  };

  const finish = () => {
    for (const r of runs.current) r.stop();
    runs.current = [];
    const was = state.current;
    state.current = "inked";
    report("inked");
    if (was !== "inked") latest.current.onComplete?.();
    if (!keepOutline) {
      runs.current = [
        animate(outlineFade, 0, {
          duration: durations.slow,
          ease: easings.enter,
        }),
      ];
    }
  };

  /** Drains the ink and rewinds the outline; exits never spring. */
  const erase = (again: boolean) => {
    if (!plan) return;
    halt();
    redraw.current = again;
    state.current = "erasing";
    report("waiting");
    nibOn.jump(0);
    const drain = { duration: durations.base * 0.6, ease: easings.exit };
    runs.current = levels.map((l) => animate(l, 0, drain));
    if (!motionSafe) {
      runs.current.push(
        animate(reveal, 0, {
          ...drain,
          onComplete: () => api.current?.erased(),
        }),
      );
      return;
    }
    runs.current.push(animate(outlineFade, 1, { duration: durations.fast }));
    clockRun.current = animate(clock, 0, {
      duration: clamp(plan.total * 0.15, 0.25, 0.55),
      ease: easings.exit,
      delay: drain.duration * 0.5,
      onComplete: () => api.current?.erased(),
    });
  };

  const erased = () => {
    halt();
    state.current = "waiting";
    clock.jump(0);
    phase.jump(0);
    nibOn.jump(1);
    reveal.jump(1);
    const again = redraw.current;
    redraw.current = false;
    if (again && target) start();
  };

  const press = () => {
    if (!plan) return;
    const p = state.current;
    if (p === "waiting") {
      if (target) start();
      return;
    }
    if (p === "erasing") {
      redraw.current = true;
      return;
    }
    erase(true);
  };

  React.useLayoutEffect(() => {
    api.current = { trace, sync, resume, floodIn, finish, erased, press, halt };
    latest.current = { onPhaseChange, onComplete, trigger, once };
  });

  // A new pace re-times the pen: it carries on from the same share of the
  // drawing rather than jumping to another letter.
  React.useLayoutEffect(() => {
    const before = shownPlan.current;
    shownPlan.current = plan;
    if (!plan || !before || before === plan) return;
    const p = state.current;
    if (p === "drawing" && before.drawEnd > 0) {
      clock.jump(
        Math.min(plan.drawEnd, (clock.get() / before.drawEnd) * plan.drawEnd),
      );
    } else if (p === "flooding" || p === "inked") {
      clock.jump(plan.total);
    }
  }, [plan, clock]);

  // The phase is state: the host hears it from the first commit.
  React.useEffect(() => {
    latest.current.onPhaseChange?.("waiting");
    reported.current = "waiting";
  }, []);

  React.useEffect(() => {
    api.current?.sync();
  }, [target, plan, running, motionSafe]);

  React.useEffect(() => {
    const c = canvas;
    return () => {
      api.current?.halt();
      if (c.current) {
        c.current.width = 0;
        c.current.height = 0;
      }
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => api.current?.trace());
    };
    const sizer = new ResizeObserver(schedule);
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const visible = Boolean(entry?.isIntersecting);
      setOnScreen(visible);
      if (latest.current.trigger === "inView") {
        setSeen((was) => (visible ? true : latest.current.once ? was : false));
      }
    });
    watcher.observe(node);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindLetter = (at: number) => (node: HTMLSpanElement | null) => {
    if (node) letterNodes.current.set(at, node);
    else letterNodes.current.delete(at);
  };
  const bindMarker = (w: number) => (node: HTMLSpanElement | null) => {
    if (node) markers.current.set(w, node);
    else markers.current.delete(w);
  };

  const hover = (on: boolean) => {
    if (trigger !== "hover") return;
    setSeen((was) => (on ? true : once ? was : false));
  };

  const Tag: React.ElementType = as;

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={interactive ? 0 : undefined}
        aria-describedby={interactive ? hintId : undefined}
        onClick={() => {
          if (!interactive) return;
          // Selecting the words is not a request to write them again.
          const picked = window.getSelection()?.toString() ?? "";
          if (picked.trim()) return;
          api.current?.press();
        }}
        onKeyDown={(event: React.KeyboardEvent) => {
          if (!interactive) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (!event.repeat) api.current?.press();
        }}
        onPointerEnter={() => hover(true)}
        onPointerLeave={() => hover(false)}
        onFocus={() => hover(true)}
        onBlur={() => hover(false)}
        className={cn(
          as === "span" ? "inline-block" : "block",
          // Room for the nib: it leans up and right of its tip, so the box
          // reserves a quarter em there rather than letting it draw outside.
          "relative",
          nib && "pt-[0.25em] pr-[0.25em]",
          interactive &&
            "cursor-pointer rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
      >
        <span className="sr-only select-none">{text}</span>
        <span aria-hidden>
          {words.map((word, w) => (
            <React.Fragment key={word.key}>
              {w > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                <span ref={bindMarker(w)} className="inline-block h-0 w-0" />
                {word.at.map((at) => (
                  <Glyph
                    key={at}
                    char={chars[at] ?? ""}
                    level={levels[at] as MotionValue<number>}
                    phase={phase}
                    clock={clock}
                    reveal={reveal}
                    seed={at * 1.7}
                    end={
                      plan
                        ? (plan.letterEnd[at] ?? -1) >= 0
                          ? (plan.letterEnd[at] as number)
                          : plan.drawEnd
                        : Number.POSITIVE_INFINITY
                    }
                    wave={clamp01(wave)}
                    guide={clamp01(guide)}
                    ink={ink}
                    fill={fill}
                    motionSafe={motionSafe}
                    bind={bindLetter(at)}
                  />
                ))}
              </span>
            </React.Fragment>
          ))}
        </span>
        {traced && plan ? (
          <svg
            aria-hidden
            width={traced.width}
            height={traced.height}
            viewBox={`0 0 ${traced.width} ${traced.height}`}
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
          >
            <motion.g style={{ opacity: outlineOpacity }}>
              <g
                style={{
                  fill: "none",
                  stroke: ink,
                  strokeWidth: clamp(stroke, 0.25, 6),
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                }}
              >
                {plan.strokes.map((s) => (
                  <StrokePath key={s.key} stroke={s} clock={clock} />
                ))}
              </g>
            </motion.g>
            {nib && motionSafe ? (
              <Nib
                plan={plan}
                clock={clock}
                on={nibOn}
                size={traced.font * NIB}
              />
            ) : null}
          </svg>
        ) : null}
      </Tag>
      {interactive ? (
        <span id={hintId} className="sr-only">
          Press Enter to draw it again.
        </span>
      ) : null}
    </>
  );
}
