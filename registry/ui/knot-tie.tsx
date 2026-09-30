"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type KnotTieKnot = "overhand" | "bow" | "figure";
export type KnotTieRope = "jute" | "nylon" | "silk";

export type KnotTieProps = {
  /** Visible text beside the glyph, and the loader's accessible name. */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The glyph's box in px, 16 to 64. Detail is chosen by size. @default 32 */
  size?: number;
  /** How fast it ties, cinches and lets go, 0.5 to 2. @default 1 */
  speed?: number;
  /** Which knot it ties. @default "overhand" */
  knot?: KnotTieKnot;
  /** What the rope is made of: its thickness, colour, lay and spring. @default "jute" */
  rope?: KnotTieRope;
  /** Determinate share done, 0 to 1: the knot is tied that far, snug at 1. */
  progress?: number;
  /** Creak while the visitor pulls the rope. Off unless asked for. @default false */
  sound?: boolean;
  /** Keeps tying itself, but cannot be tugged. @default false */
  disabled?: boolean;
  className?: string;
};

type Pt = readonly [number, number];

const BOX = 32;
const CX = 16;
/** A knot's stages: slack, first loop, loosely tied, snug. */
const SNUG = 3;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ------------------------------------------------------------------ *
 * Knot shapes. Each knot is four stages of 25 control points, the same
 * count in every stage so a stage value can blend neighbours point by point.
 * ------------------------------------------------------------------ */

/** Points on a quadratic from a to b (both excluded) bent through c. */
function bend(a: Pt, c: Pt, b: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= n; i += 1) {
    const t = i / (n + 1);
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
    ]);
  }
  return out;
}

type Curve = (t: number) => Pt;

const slope = (f: Curve, t: number): Pt => {
  const e = 1e-4;
  const a = f(t - e);
  const b = f(t + e);
  return [(b[0] - a[0]) / (2 * e), (b[1] - a[1]) / (2 * e)];
};

const CORE = 17;
const TAIL = 3;

/**
 * An open knot: the core curve over [t0, t1], scaled by k about (CX, cy),
 * with a tail laid in to each end from a point on the table at `tailY`.
 */
function openKnot(
  f: Curve,
  t0: number,
  t1: number,
  k: number,
  cy: number,
  tailY: number,
  xL: number,
  xR: number,
): Pt[] {
  const core: Pt[] = [];
  for (let i = 0; i < CORE; i += 1) {
    const [x, y] = f(t0 + ((t1 - t0) * i) / (CORE - 1));
    core.push([CX + k * x, cy + k * y]);
  }
  const a = core[0] ?? [CX, cy];
  const b = core[core.length - 1] ?? [CX, cy];
  const da = slope(f, t0);
  const db = slope(f, t1);
  // Each tail's bend sits where the table meets the core's own tangent, so
  // the rope runs into the knot without a kink.
  const ca: Pt = [
    Math.min(a[0] + 8, Math.max(xL, a[0] - ((a[1] - tailY) / da[1]) * da[0])),
    tailY,
  ];
  const cb: Pt = [
    Math.min(xR, Math.max(b[0] - 8, b[0] + ((tailY - b[1]) / db[1]) * db[0])),
    tailY,
  ];
  return [
    [xL, tailY],
    ...bend([xL, tailY], ca, a, TAIL),
    ...core,
    ...bend(b, cb, [xR, tailY], TAIL),
    [xR, tailY],
  ];
}

/** The trefoil: an overhand knot is one cut open at its lowest lobe. */
const trefoil: Curve = (t) => [
  Math.sin(t) + 2 * Math.sin(2 * t),
  -Math.cos(t) + 2 * Math.cos(2 * t),
];

/** A lemniscate traced about one and a half times, spiralling out so its passes stay apart. */
const eight =
  (stretch: number): Curve =>
  (t) => {
    const g = 1 + 0.16 * (t - 3.9);
    return [
      2.2 * Math.cos(t) * g * stretch,
      1.9 * Math.sin(t) * Math.cos(t) * g * 1.05 + 0.25 * Math.sin(t),
    ];
  };

/** Two teardrop loops through a centre, and the tails crossed beneath it. */
const BOW_CORE: Pt[] = [
  [-0.4, -0.4],
  [-1.6, -1.9],
  [-3.2, -2.9],
  [-4.6, -2.9],
  [-5.3, -2],
  [-4.8, -0.9],
  [-3.3, -0.4],
  [-1.6, -0.1],
  [0, 0.15],
  [1.6, -0.1],
  [3.3, -0.4],
  [4.8, -0.9],
  [5.3, -2],
  [4.6, -2.9],
  [3.2, -2.9],
  [1.6, -1.9],
  [0.4, -0.4],
];

function bow(k: number, cy: number, pinch: number, tail: number): Pt[] {
  const place = ([x, y]: Pt): Pt => {
    const s = 1 - pinch * Math.exp(-(x * x + y * y) / 3);
    return [CX + k * x * s, cy + k * y * s];
  };
  const leg = (sign: number, ts: number[]): Pt[] =>
    ts.map((t): Pt => [CX + sign * tail * t * 0.85, cy + tail * t]);
  return [
    ...leg(1, [1, 0.64, 0.33, 0.1]),
    ...BOW_CORE.map(place),
    ...leg(-1, [0.1, 0.33, 0.64, 1]),
  ];
}

/** Slack rope lying in a lazy S, from x0 to x1. */
function slack(x0: number, x1: number): Pt[] {
  const n = TAIL * 2 + CORE + 2;
  return Array.from({ length: n }, (_, i): Pt => {
    const u = i / (n - 1);
    return [
      x0 + (x1 - x0) * u,
      18.2 + 2.2 * Math.sin(u * Math.PI * 2 + 0.4) * (0.6 + 0.4 * u),
    ];
  });
}

const mix = (a: Pt[], b: Pt[], t: number): Pt[] =>
  a.map((p, i): Pt => {
    const q = b[i] ?? p;
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  });

/** The first loop: halfway there, with the working end lifted over. */
function lifted(from: Pt[], to: Pt[]): Pt[] {
  const half = mix(from, to, 0.5);
  const n = half.length;
  const start = Math.floor(n * 0.45);
  return half.map(([x, y], i): Pt => {
    if (i < start) return [x, y];
    const u = (i - start) / (n - 1 - start);
    return [x, y - 3.2 * Math.sin(Math.PI * u)];
  });
}

function stagesOf(slackRope: Pt[], loose: Pt[], snug: Pt[]): Pt[][] {
  return [slackRope, lifted(slackRope, loose), loose, snug];
}

/* Catmull-Rom through the control points: the rope is one smooth path. */

const pointAt = (P: Pt[], i: number): Pt =>
  P[Math.max(0, Math.min(P.length - 1, i))] ?? [CX, 16];

function splinePath(P: Pt[]): string {
  const first = pointAt(P, 0);
  let d = `M ${r3(first[0])} ${r3(first[1])}`;
  for (let i = 0; i < P.length - 1; i += 1) {
    const p0 = pointAt(P, i - 1);
    const p1 = pointAt(P, i);
    const p2 = pointAt(P, i + 1);
    const p3 = pointAt(P, i + 2);
    d += ` C ${r3(p1[0] + (p2[0] - p0[0]) / 6)} ${r3(p1[1] + (p2[1] - p0[1]) / 6)} ${r3(p2[0] - (p3[0] - p1[0]) / 6)} ${r3(p2[1] - (p3[1] - p1[1]) / 6)} ${r3(p2[0])} ${r3(p2[1])}`;
  }
  return d;
}

type Sample = { x: number; y: number; at: number; len: number };

/** The spline sampled finely, with each sample's parameter and arc length. */
function sampleRope(P: Pt[], per: number): Sample[] {
  const out: Sample[] = [];
  let len = 0;
  let prev: Pt | null = null;
  for (let i = 0; i < P.length - 1; i += 1) {
    const p0 = pointAt(P, i - 1);
    const p1 = pointAt(P, i);
    const p2 = pointAt(P, i + 1);
    const p3 = pointAt(P, i + 2);
    for (let j = 0; j < per; j += 1) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, e: number, f: number) =>
        0.5 *
        (2 * b +
          (-a + e) * t +
          (2 * a - 5 * b + 4 * e - f) * t2 +
          (-a + 3 * b - 3 * e + f) * t3);
      const x = c(p0[0], p1[0], p2[0], p3[0]);
      const y = c(p0[1], p1[1], p2[1], p3[1]);
      if (prev) len += Math.hypot(x - prev[0], y - prev[1]);
      out.push({ x, y, at: i + t, len });
      prev = [x, y];
    }
  }
  const last = pointAt(P, P.length - 1);
  if (prev) len += Math.hypot(last[0] - prev[0], last[1] - prev[1]);
  out.push({ x: last[0], y: last[1], at: P.length - 1, len });
  return out;
}

type Crossing = { a: number; b: number; x: number; y: number };

/** Where the rope passes over itself, as pairs of path parameters. */
function crossingsOf(S: Sample[]): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 0; i < S.length - 1; i += 1) {
    const p = S[i];
    const q = S[i + 1];
    if (!p || !q) continue;
    const minX = Math.min(p.x, q.x);
    const maxX = Math.max(p.x, q.x);
    const minY = Math.min(p.y, q.y);
    const maxY = Math.max(p.y, q.y);
    for (let j = i + 2; j < S.length - 1; j += 1) {
      const r = S[j];
      const s = S[j + 1];
      if (!r || !s) continue;
      if (
        Math.max(r.x, s.x) < minX ||
        Math.min(r.x, s.x) > maxX ||
        Math.max(r.y, s.y) < minY ||
        Math.min(r.y, s.y) > maxY
      ) {
        continue;
      }
      const den = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / den;
      const u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / den;
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
      out.push({
        a: p.at + (q.at - p.at) * t,
        b: r.at + (s.at - r.at) * u,
        x: p.x + (q.x - p.x) * t,
        y: p.y + (q.y - p.y) * t,
      });
    }
  }
  return out;
}

type Over = { a: number; b: number; over: "a" | "b" };

/**
 * Over and under, alternating along the rope, measured once on the snug
 * knot. The crossings that exist at any moment borrow their order from the
 * nearest one here, so a strand never flips from over to under mid-tie.
 */
function weave(P: Pt[]): Over[] {
  const found = crossingsOf(sampleRope(P, 10));
  const passes = found
    .flatMap((c, k) => [
      { at: c.a, k, side: "a" as const },
      { at: c.b, k, side: "b" as const },
    ])
    .sort((p, q) => p.at - q.at);
  const over = new Map<number, "a" | "b">();
  passes.forEach((p, i) => {
    if (i % 2 === 0) over.set(p.k, p.side);
  });
  return found.map((c, k) => ({ a: c.a, b: c.b, over: over.get(k) ?? "b" }));
}

type KnotDef = { stages: Pt[][]; weave: Over[] };

function define(stages: Pt[][]): KnotDef {
  return { stages, weave: weave(stages[SNUG] ?? []) };
}

const KNOTS: Record<KnotTieKnot, KnotDef> = {
  overhand: (() => {
    const d = 0.62;
    const t0 = -Math.PI + d;
    const t1 = Math.PI - d;
    const knot = (k: number, cy: number, x0: number, x1: number) =>
      openKnot(
        trefoil,
        t0,
        t1,
        k,
        cy,
        cy + k * trefoil(t0)[1] + 1.6 + k * 0.5,
        x0,
        x1,
      );
    return define(
      stagesOf(
        slack(5, 27),
        knot(2.2, 12.6, 5, 27),
        knot(1.15, 14.2, 3.6, 28.4),
      ),
    );
  })(),
  figure: (() => {
    const t0 = 3.9;
    const t1 = 3.9 + 2 * Math.PI + 1.1;
    const knot = (
      k: number,
      cy: number,
      x0: number,
      x1: number,
      stretch: number,
    ) => openKnot(eight(stretch), t0, t1, k, cy, cy + k * 1.2 + 1.2, x0, x1);
    return define(
      stagesOf(
        slack(5, 27),
        knot(1.9, 13.4, 5, 27, 1),
        knot(1.05, 14.6, 3.6, 28.4, 1.35),
      ),
    );
  })(),
  bow: define(
    stagesOf(slack(27, 5), bow(2.2, 14.2, -0.35, 6.4), bow(2, 14.2, 0.4, 8.8)),
  ),
};

/** The rope at stage `s`: blended between neighbouring stages, and past snug, tighter still. */
function ropeAt(def: KnotDef, s: number): Pt[] {
  const st = def.stages;
  if (s > SNUG) {
    const loose = st[2] ?? [];
    const snug = st[SNUG] ?? [];
    const extra = Math.min(0.5, s - SNUG) * 0.5;
    return snug.map((p, i): Pt => {
      const q = loose[i] ?? p;
      return [p[0] + (p[0] - q[0]) * extra, p[1] + (p[1] - q[1]) * extra];
    });
  }
  const c = Math.max(0, s);
  const i = Math.min(2, Math.floor(c));
  return mix(st[i] ?? [], st[i + 1] ?? [], c - i);
}

/* ------------------------------------------------------------------ *
 * Ropes.
 * ------------------------------------------------------------------ */

type RopeSpec = {
  width: number;
  core: string;
  edge: string;
  lay: string;
  /** The lay's lean from square across the rope, in radians. */
  lean: number;
  /** The lay's spacing along the rope. */
  pitch: number;
  sheen: string | null;
  finish: "fray" | "seal" | "none";
  snug: (typeof springs)[keyof typeof springs];
  /** How quickly it slides loose, as a share of the untie time. */
  slip: number;
  voice: number;
};

// Pigments at fixed lightness, the same in both themes; the edge and lay
// are mixed toward black in oklab so they keep the rope's hue.
const ROPES: Record<KnotTieRope, RopeSpec> = {
  jute: {
    width: 3.3,
    core: "oklch(from var(--warn) 0.75 0.075 h)",
    edge: "color-mix(in oklab, oklch(from var(--warn) 0.75 0.075 h) 52%, black)",
    lay: "color-mix(in oklab, oklch(from var(--warn) 0.75 0.075 h) 70%, black)",
    lean: 0.62,
    pitch: 1.25,
    sheen: null,
    finish: "fray",
    snug: springs.glide,
    slip: 1,
    voice: 0.72,
  },
  nylon: {
    width: 2.9,
    core: "oklch(from var(--accent) 0.6 0.16 h)",
    edge: "color-mix(in oklab, oklch(from var(--accent) 0.6 0.16 h) 55%, black)",
    lay: "color-mix(in oklab, oklch(from var(--accent) 0.6 0.16 h) 38%, white)",
    lean: 0.35,
    pitch: 1.6,
    sheen: null,
    finish: "seal",
    snug: springs.snap,
    slip: 0.9,
    voice: 1,
  },
  silk: {
    width: 2.1,
    core: "oklch(from var(--danger) 0.54 0.17 h)",
    edge: "color-mix(in oklab, oklch(from var(--danger) 0.54 0.17 h) 55%, black)",
    lay: "color-mix(in oklab, oklch(from var(--danger) 0.54 0.17 h) 78%, black)",
    lean: 0.8,
    pitch: 0.9,
    sheen:
      "color-mix(in oklab, oklch(from var(--danger) 0.54 0.17 h) 45%, white)",
    finish: "none",
    snug: springs.flick,
    slip: 0.7,
    voice: 1.35,
  },
};

type Drawn = {
  rope: string;
  lay: string;
  patches: string;
  patchLay: string;
  ends: string;
};

type Detail = { crossings: boolean; lay: boolean; ends: boolean };

/**
 * Everything the rope paints at stage `s`, shifted `dx` toward the hand:
 * the spline, its lay (short slanted strokes at fixed arc spacing), the
 * over-patches at each crossing (the upper strand again, butt-ended, with
 * its own lay at the same arc positions so the texture runs on unbroken)
 * and the finish at its ends.
 */
function drawRope(
  def: KnotDef,
  spec: RopeSpec,
  detail: Detail,
  s: number,
  dx: number,
): Drawn {
  const P = ropeAt(def, s).map(([x, y]): Pt => [x + dx, y]);
  const rope = splinePath(P);
  if (!detail.crossings && !detail.lay && !detail.ends) {
    return { rope, lay: "", patches: "", patchLay: "", ends: "" };
  }
  const S = sampleRope(P, 7);
  const total = S[S.length - 1]?.len ?? 0;
  const at = (len: number) => {
    let lo = 0;
    let hi = S.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((S[mid]?.len ?? 0) < len) lo = mid;
      else hi = mid;
    }
    const a = S[lo] ?? { x: 0, y: 0, at: 0, len: 0 };
    const b = S[hi] ?? a;
    const f = b.len > a.len ? (len - a.len) / (b.len - a.len) : 0;
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const n = Math.hypot(tx, ty) || 1;
    return {
      x: a.x + tx * f,
      y: a.y + ty * f,
      tx: tx / n,
      ty: ty / n,
      at: a.at + (b.at - a.at) * f,
    };
  };
  const lenOf = (param: number) => {
    let i = 0;
    while (i < S.length - 1 && (S[i + 1]?.at ?? Infinity) <= param) i += 1;
    const a = S[i] ?? { x: 0, y: 0, at: 0, len: 0 };
    const b = S[i + 1] ?? a;
    const f = b.at > a.at ? (param - a.at) / (b.at - a.at) : 0;
    return a.len + (b.len - a.len) * f;
  };
  const w = spec.width * 0.42;
  const cos = Math.cos(spec.lean);
  const sin = Math.sin(spec.lean);
  const tick = (len: number) => {
    const p = at(len);
    // Across the rope, leaned toward its run: the lay of a twisted rope.
    const nx = -p.ty * cos + p.tx * sin;
    const ny = p.tx * cos + p.ty * sin;
    return `M ${r3(p.x - nx * w)} ${r3(p.y - ny * w)} L ${r3(p.x + nx * w)} ${r3(p.y + ny * w)}`;
  };
  const ticks = (from: number, to: number) => {
    const out: string[] = [];
    const first = Math.ceil(from / spec.pitch) * spec.pitch;
    for (let l = first; l <= to; l += spec.pitch) out.push(tick(l));
    return out.join(" ");
  };
  const lay = detail.lay
    ? ticks(spec.pitch * 0.5, total - spec.pitch * 0.5)
    : "";

  const patches: string[] = [];
  const patchLay: string[] = [];
  if (detail.crossings) {
    const reach = spec.width * 0.95 + 0.8;
    for (const c of crossingsOf(S)) {
      let best: Over | null = null;
      let gap = 3;
      for (const o of def.weave) {
        const g = Math.abs(o.a - c.a) + Math.abs(o.b - c.b);
        if (g < gap) {
          gap = g;
          best = o;
        }
      }
      // A crossing the snug knot does not have passes in drawing order.
      const param = best ? (best.over === "a" ? c.a : c.b) : Math.max(c.a, c.b);
      const mid = lenOf(param);
      const from = Math.max(0, mid - reach);
      const to = Math.min(total, mid + reach);
      const pts: string[] = [];
      for (let i = 0; i <= 8; i += 1) {
        const p = at(from + ((to - from) * i) / 8);
        pts.push(`${r3(p.x)} ${r3(p.y)}`);
      }
      patches.push(`M ${pts.join(" L ")}`);
      if (detail.lay) patchLay.push(ticks(from, to));
    }
  }

  let ends = "";
  if (detail.ends && spec.finish !== "none") {
    const end = (len: number, out: number) => {
      const p = at(len);
      const ox = p.tx * out;
      const oy = p.ty * out;
      if (spec.finish === "seal") {
        // A heat-sealed end: the last length of rope, darker.
        const q = at(len - out * 0.9);
        return `M ${r3(q.x)} ${r3(q.y)} L ${r3(p.x)} ${r3(p.y)}`;
      }
      // A frayed end: three fibres fanning out past the rope.
      return [-0.45, 0, 0.45]
        .map((spread) => {
          const cs = Math.cos(spread);
          const sn = Math.sin(spread);
          const fx = ox * cs - oy * sn;
          const fy = ox * sn + oy * cs;
          const bx = p.x - p.ty * spread * 1.2;
          const by = p.y + p.tx * spread * 1.2;
          return `M ${r3(bx)} ${r3(by)} L ${r3(bx + fx * 1.5)} ${r3(by + fy * 1.5)}`;
        })
        .join(" ");
    };
    ends = `${end(0.001, -1)} ${end(total - 0.001, 1)}`;
  }

  return {
    rope,
    lay,
    patches: patches.join(" "),
    patchLay: patchLay.join(" "),
    ends,
  };
}

type Phase = "tie" | "cinch" | "hold" | "loosen" | "untie" | "rest" | "hand";

type Api = {
  step: () => void;
  pause: () => void;
  after: (phase: Phase) => void;
  endCreak: () => void;
};

/**
 * An inline loader drawn as a short rope that ties itself: one Catmull-Rom
 * path through a fixed set of points, blended every frame through a knot's
 * four stages — slack, the first loop lifted over, loosely tied, snug — so it
 * curls, threads and cinches, holds, then loosens and lets go. Where the rope
 * passes over itself the upper strand is drawn again on top, so every
 * crossing reads and the knot alternates over and under like a real one.
 *
 * Tug the rope sideways to tighten it early: the stage follows the pull,
 * rubber-bands past snug, and a release cinches it on the rope's own spring
 * with the release velocity (jute glides, nylon snaps past and back, silk
 * flicks) — Enter or Space tugs it the same way. With `progress` the knot is
 * tied that far and is snug at 1. While the visitor pulls it creaks, pitched
 * by the tension; it never creaks by itself.
 *
 * The loader's semantics sit on its label: `role="status"`, or
 * `role="progressbar"` with a value when `progress` is given. Under reduced
 * motion the rope does not morph: it cross-fades between held stages.
 */
export function KnotTie({
  label,
  hideLabel = false,
  size = 32,
  speed = 1,
  knot = "overhand",
  rope = "jute",
  progress,
  sound = false,
  disabled = false,
  className,
}: KnotTieProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `knot-hint-${uid}`;

  const px = Math.min(64, Math.max(16, Math.round(size)));
  const unit = BOX / px;
  const pace = Math.min(2, Math.max(0.5, speed));
  const def = KNOTS[knot] ?? KNOTS.overhand;
  const spec = ROPES[rope] ?? ROPES.jute;
  const determinate = progress !== undefined;
  const share = clamp01(progress ?? 0);
  const target = motionSafe
    ? SNUG * share
    : Math.min(SNUG, Math.floor(SNUG * share + 0.001));
  const name = label ?? "Loading";

  const stage = useMotionValue(determinate ? SNUG * share : 2.4);
  const shift = useMotionValue(0);
  const dim = useMotionValue(1);

  const [onScreen, setOnScreen] = React.useState(true);
  const [pageShown, setPageShown] = React.useState(true);
  const live = onScreen && pageShown;

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timer = React.useRef<number | null>(null);
  const phase = React.useRef<Phase>("tie");
  const grip = React.useRef({ from: 0, t: 0, last: 0 });
  const creak = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef<number | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const tugging = React.useRef<{ timer: number; off: () => void } | null>(null);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const wait = (seconds: number, then: Phase) => {
    clearTimer();
    timer.current = window.setTimeout(
      () => {
        timer.current = null;
        api.current?.after(then);
      },
      Math.round(seconds * 1000),
    );
  };

  const endCreak = () => {
    if (tugging.current) {
      window.clearTimeout(tugging.current.timer);
      tugging.current.off();
      tugging.current = null;
    }
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = null;
    creak.current?.stop();
    creak.current = null;
  };

  /** The creak follows the tension and how fast the rope is moving. */
  const voice = (s: number, rate: number) => {
    creak.current?.set({
      pitch: r3(spec.voice * (0.8 + 0.45 * clamp01(s / SNUG))),
      gain: r3(Math.min(0.7, 0.12 + Math.abs(rate) * 0.22)),
    });
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = window.setTimeout(() => {
      creak.current?.set({ gain: 0 });
    }, 80);
  };

  const startCreak = () => {
    endCreak();
    const rect = buttonRef.current?.getBoundingClientRect();
    creak.current = audio.start("creak", {
      pitch: r3(spec.voice * 0.8),
      gain: 0,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  /** Moves the rope to stage `to`; under reduced motion, a cross-fade to it. */
  const swapTo = (to: number, done?: () => void) => {
    halt("stage");
    run(
      "dim",
      animate(dim, 0.2, {
        duration: durations.blink,
        onComplete: () => {
          stage.set(to);
          run(
            "dim",
            animate(dim, 1, { duration: durations.fast, onComplete: done }),
          );
        },
      }),
    );
  };

  const tween = (
    to: number,
    seconds: number,
    ease: (typeof easings)[keyof typeof easings],
    then: Phase,
  ) => {
    if (!motionSafe) {
      swapTo(Math.round(to), () => wait(0.8 / pace, then));
      return;
    }
    run(
      "stage",
      animate(stage, to, {
        duration: Math.max(0.05, seconds),
        ease,
        onComplete: () => api.current?.after(then),
      }),
    );
  };

  /** Pulled snug on the rope's own spring. */
  const cinch = (velocity = 0, then: Phase = "hold") => {
    phase.current = "cinch";
    if (!motionSafe) {
      swapTo(SNUG, () => api.current?.after(then));
      return;
    }
    run(
      "stage",
      animate(stage, SNUG, {
        ...spec.snug,
        velocity,
        onComplete: () => api.current?.after(then),
      }),
    );
  };

  /** The cycle's next beat. */
  const after = (next: Phase) => {
    if (!live) return;
    const s = stage.get();
    phase.current = next;
    switch (next) {
      case "tie":
        if (s >= 2 - 1e-3) {
          after("cinch");
          return;
        }
        tween(2, ((2 - s) / 2) * (1.1 / pace), easings.move, "cinch");
        return;
      case "cinch":
        cinch(0, "hold");
        return;
      case "hold":
        wait(0.7 / pace, "loosen");
        return;
      case "loosen":
        tween(2, (0.45 * spec.slip) / pace, easings.enter, "untie");
        return;
      case "untie":
        tween(0, (0.9 * spec.slip) / pace, easings.move, "rest");
        return;
      case "rest":
        wait(0.35 / pace, "tie");
        return;
      case "hand":
        return;
    }
  };

  const step = () => {
    if (!live || phase.current === "hand") return;
    clearTimer();
    if (determinate) {
      const s = stage.get();
      if (Math.abs(s - target) < 1e-3) return;
      if (!motionSafe) {
        swapTo(target);
        return;
      }
      run(
        "stage",
        animate(stage, target, target >= SNUG ? spec.snug : springs.glide),
      );
      return;
    }
    // Picks up the beat it was on when it was paused.
    after(phase.current);
  };

  const pause = () => {
    clearTimer();
    halt("stage");
  };

  React.useEffect(() => {
    api.current = { step, pause, after, endCreak };
  });

  React.useEffect(() => {
    if (!live) return;
    api.current?.step();
    return () => api.current?.pause();
  }, [live, determinate, target, pace, motionSafe, knot, rope]);

  React.useEffect(() => {
    const onVisibility = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!sound || disabled) api.current?.endCreak();
  }, [sound, disabled]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      api.current?.endCreak();
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const bindButton = React.useCallback((node: HTMLButtonElement | null) => {
    buttonRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  /** A full tie per this many px of pull. */
  const travel = Math.min(80, Math.max(32, px * 1.25));

  /** What the knot does once the hand lets go of it. */
  const letGo = (velocity: number) => {
    run("shift", animate(shift, 0, motionSafe ? spec.snug : { duration: 0 }));
    const s = stage.get();
    const rest = project(s, velocity, 0.99);
    if (determinate) {
      // It cinches for a moment, then eases back to what the progress holds.
      phase.current = "cinch";
      const back = () => {
        phase.current = "tie";
        api.current?.step();
      };
      if (s >= 1.8 || rest >= 2.2) {
        cinch(velocity, "hand");
        timer.current = window.setTimeout(() => {
          timer.current = null;
          back();
        }, 700);
      } else {
        back();
      }
      return;
    }
    if (s >= 1.8 || rest >= 2.2) {
      cinch(velocity, "hold");
      return;
    }
    phase.current = "tie";
    after("tie");
  };

  /** A tap or a key: tugged snug in one pull, and heard doing it. */
  const tug = () => {
    if (disabled || phase.current === "hand") return;
    clearTimer();
    halt("stage");
    startCreak();
    const from = stage.get();
    // The creak lasts as long as the pull: it follows the stage while the
    // rope cinches, and ends with it.
    tugging.current = {
      off: stage.on("change", (s) => voice(s, (s - from) * 6)),
      timer: window.setTimeout(() => api.current?.endCreak(), 420),
    };
    if (determinate) {
      phase.current = "cinch";
      cinch(0, "hand");
      timer.current = window.setTimeout(() => {
        timer.current = null;
        phase.current = "tie";
        api.current?.step();
      }, 900);
      return;
    }
    cinch(0, "hold");
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: ({ event }) => {
      pause();
      halt("dim");
      dim.set(1);
      phase.current = "hand";
      grip.current = {
        from: stage.get(),
        t: event.timeStamp,
        last: stage.get(),
      };
      startCreak();
    },
    onMove: ({ offset, event }) => {
      const g = grip.current;
      const raw = g.from + (Math.abs(offset.x) / travel) * SNUG;
      const s = raw <= SNUG ? raw : SNUG + rubberband(raw - SNUG, 0.45, 1);
      if (motionSafe) {
        stage.set(r3(s));
        shift.set(r3(rubberband(offset.x * 0.12, 0.7)));
      } else if (s >= SNUG - 0.4 && stage.get() < SNUG) {
        swapTo(SNUG);
      }
      const dt = Math.max(8, event.timeStamp - g.t) / 1000;
      voice(s, (s - g.last) / dt);
      g.t = event.timeStamp;
      g.last = s;
    },
    onEnd: ({ velocity, offset }) => {
      endCreak();
      const pull =
        Math.sign(velocity.x) === Math.sign(offset.x)
          ? (Math.abs(velocity.x) / travel) * SNUG
          : 0;
      letGo(pull);
    },
    onCancel: () => {
      endCreak();
      letGo(0);
    },
    onTap: () => tug(),
  });

  const detail: Detail = {
    crossings: px >= 20,
    lay: px >= 28,
    ends: px >= 40,
  };
  const drawn = useTransform(
    [stage, shift] as MotionValue<number>[],
    ([s = 0, dx = 0]: number[]) => drawRope(def, spec, detail, s, dx),
  );
  const ropePath = useTransform(drawn, (d) => d.rope);
  const layPath = useTransform(drawn, (d) => d.lay);
  const patchPath = useTransform(drawn, (d) => d.patches);
  const patchLayPath = useTransform(drawn, (d) => d.patchLay);
  const endsPath = useTransform(drawn, (d) => d.ends);

  const edge = r3(spec.width + Math.max(0.5, unit * 0.95));
  const layWidth = r3(Math.max(0.32, unit * 0.45));

  const role = determinate
    ? {
        role: "progressbar" as const,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.round(share * 100),
      }
    : { role: "status" as const };

  const strand = (d: MotionValue<string>, butt: boolean) => (
    <>
      <motion.path
        d={d}
        fill="none"
        strokeWidth={edge}
        strokeLinecap={butt ? "butt" : "round"}
        strokeLinejoin="round"
        style={{ stroke: spec.edge }}
      />
      <motion.path
        d={d}
        fill="none"
        strokeWidth={spec.width}
        strokeLinecap={butt ? "butt" : "round"}
        strokeLinejoin="round"
        style={{ stroke: spec.core }}
      />
    </>
  );

  return (
    <span
      className={cn(
        "group/knot-tie inline-flex items-center align-middle",
        className,
      )}
      style={{ gap: Math.round(Math.max(6, px * 0.28)) }}
    >
      <button
        ref={bindButton}
        type="button"
        aria-label="Tug the rope"
        aria-describedby={hintId}
        disabled={disabled}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap. A click with no
          // pointer behind it — Space, Enter, assistive technology — tugs.
          if (event.detail === 0) tug();
        }}
        {...drag}
        className={cn(
          "relative inline-flex shrink-0 touch-pan-y items-center justify-center rounded-2 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        )}
        style={{ width: px, height: px }}
      >
        <motion.svg
          aria-hidden
          width={px}
          height={px}
          viewBox={`0 0 ${BOX} ${BOX}`}
          className="block overflow-hidden"
          style={{ opacity: dim }}
        >
          {detail.ends ? (
            <g transform="translate(0 0.9)">
              <motion.path
                d={ropePath}
                fill="none"
                strokeWidth={edge}
                strokeLinecap="round"
                strokeLinejoin="round"
                stroke="black"
                strokeOpacity={0.14}
              />
            </g>
          ) : null}
          {strand(ropePath, false)}
          {detail.lay ? (
            <motion.path
              d={layPath}
              fill="none"
              strokeWidth={layWidth}
              style={{ stroke: spec.lay }}
            />
          ) : null}
          {spec.sheen && px >= 28 ? (
            <motion.path
              d={ropePath}
              fill="none"
              strokeWidth={r3(spec.width * 0.28)}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.7}
              style={{ stroke: spec.sheen }}
            />
          ) : null}
          {detail.crossings ? (
            <>
              {strand(patchPath, true)}
              {detail.lay ? (
                <motion.path
                  d={patchLayPath}
                  fill="none"
                  strokeWidth={layWidth}
                  style={{ stroke: spec.lay }}
                />
              ) : null}
              {spec.sheen && px >= 28 ? (
                <motion.path
                  d={patchPath}
                  fill="none"
                  strokeWidth={r3(spec.width * 0.28)}
                  strokeLinecap="butt"
                  strokeLinejoin="round"
                  strokeOpacity={0.7}
                  style={{ stroke: spec.sheen }}
                />
              ) : null}
            </>
          ) : null}
          {detail.ends ? (
            <motion.path
              d={endsPath}
              fill="none"
              strokeWidth={
                spec.finish === "seal"
                  ? spec.width
                  : r3(Math.max(0.35, unit * 0.5))
              }
              strokeLinecap="round"
              style={{ stroke: spec.finish === "seal" ? spec.edge : spec.core }}
            />
          ) : null}
        </motion.svg>
      </button>
      <span
        {...role}
        aria-label={name}
        className={cn(
          "min-w-0",
          hideLabel || label === undefined ? "sr-only" : "truncate",
        )}
        title={hideLabel ? undefined : label}
      >
        {label}
      </span>
      <span id={hintId} className="sr-only">
        Drag it sideways to pull the knot snug, or press Enter.
      </span>
    </span>
  );
}
