"use client";

import * as React from "react";

import {
  animate,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type CoasterTrackPreset = "classic" | "camel" | "twin";

export type CoasterPoint = {
  /** 0 (left) to 1 (right) of the box. */
  x: number;
  /** 0 (top) to 1 (bottom) of the box. */
  y: number;
  /** The segment leaving this point is chain lift. */
  lift?: boolean;
};

export type CoasterTrackProps = {
  /** The sentence the cars carry. */
  text: string;
  /** The element that carries the sentence for assistive technology. @default "p" */
  as?: "p" | "h1" | "h2" | "h3" | "span" | "div";
  /** A preset ride built to the box, or your own points through which the track is smoothed. @default "classic" */
  track?: CoasterTrackPreset | CoasterPoint[];
  /** How hard the drops pull, 0.4 to 2: more gravity, faster drops, more bunching and stretching. @default 1 */
  gravity?: number;
  /** Car spacing at the station, in em. @default 1.25 */
  spacing?: number;
  /** Station speed in em per second; the chain lift runs a little slower. @default 5 */
  speed?: number;
  /** How many times faster the chain tows while it is held. @default 2.6 */
  towBoost?: number;
  /** Rolling friction, 0 to 1. @default 0.2 */
  friction?: number;
  /** Ridden between one pass of the sentence and the next. @default " · " */
  separator?: string;
  /** Draw the little cars under the letters; off, the letters ride bare. @default true */
  cars?: boolean;
  /** Draw the support struts down to the ground. @default true */
  supports?: boolean;
  /** The track's colour, any CSS colour. @default "var(--ink-3)" */
  trackColor?: string;
  /** The cars' colour, any CSS colour. @default "var(--accent-bright)" */
  carColor?: string;
  /** Ride whenever the track is on screen, or only while it is hovered or focused. @default "inView" */
  trigger?: "inView" | "hover";
  /** Hold every car where it is. @default false */
  paused?: boolean;
  /** Fires each time a whole pass of the sentence has left the track, with the count. */
  onLap?: (laps: number) => void;
  /** Fires when the chain is grabbed and when it is let go. */
  onTowChange?: (towing: boolean) => void;
  /** Size with a height class; letters take the inherited font size. @default "h-48" */
  className?: string;
};

type Sample = {
  x: number;
  y: number;
  /** Tangent angle, radians. */
  a: number;
  chain: boolean;
  brake: boolean;
  loop: boolean;
};

type Track = {
  w: number;
  h: number;
  em: number;
  /** Samples every STEP px of arc length. */
  pts: Sample[];
  length: number;
  ground: number;
  /** Drop height, px: gravity scales with it so any size rides alike. */
  drop: number;
  rail: string;
  ties: string;
  struts: string;
  chain: string;
  /** The lift hill's box, for the chain's button. */
  lift: { left: number; top: number; width: number; height: number };
};

const STEP = 2;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Splits a sentence into graphemes, keeping emoji and combining marks whole. */
function graphemes(text: string): string[] {
  const Seg = (
    Intl as typeof Intl & {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

/* ------------------------------ building a track ------------------------------ */

/**
 * Accumulates a polyline sampled at even arc length from lines, cubics and
 * circles, so the cars can be placed by distance travelled.
 */
function pathBuilder() {
  const raw: {
    x: number;
    y: number;
    chain: boolean;
    brake: boolean;
    loop: boolean;
  }[] = [];
  let cx = 0;
  let cy = 0;
  const push = (
    x: number,
    y: number,
    chain: boolean,
    brake: boolean,
    loop: boolean,
  ) => {
    raw.push({ x, y, chain, brake, loop });
    cx = x;
    cy = y;
  };
  const steps = (len: number) => Math.max(2, Math.ceil(len / 1.5));
  return {
    move(x: number, y: number) {
      push(x, y, false, false, false);
    },
    line(x: number, y: number, chain = false, brake = false) {
      const x0 = cx;
      const y0 = cy;
      const n = steps(Math.hypot(x - x0, y - y0));
      for (let i = 1; i <= n; i += 1) {
        const t = i / n;
        push(x0 + (x - x0) * t, y0 + (y - y0) * t, chain, brake, false);
      }
    },
    cubic(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      x: number,
      y: number,
    ) {
      const x0 = cx;
      const y0 = cy;
      const n = steps(Math.hypot(x - x0, y - y0) * 1.4);
      for (let i = 1; i <= n; i += 1) {
        const t = i / n;
        const u = 1 - t;
        push(
          u * u * u * x0 +
            3 * u * u * t * x1 +
            3 * u * t * t * x2 +
            t * t * t * x,
          u * u * u * y0 +
            3 * u * u * t * y1 +
            3 * u * t * t * y2 +
            t * t * t * y,
          false,
          false,
          false,
        );
      }
    },
    /** A whole vertical loop from its bottom, ridden right, up, back over the top, down. */
    loop(r: number) {
      const ox = cx;
      const oy = cy - r;
      const n = steps(2 * Math.PI * r);
      for (let i = 1; i <= n; i += 1) {
        const a = (i / n) * 2 * Math.PI;
        push(ox + r * Math.sin(a), oy + r * Math.cos(a), false, false, true);
      }
    },
    at: () => ({ x: cx, y: cy }),
    raw,
  };
}

function resample(
  raw: {
    x: number;
    y: number;
    chain: boolean;
    brake: boolean;
    loop: boolean;
  }[],
): Sample[] {
  const out: Sample[] = [];
  if (raw.length < 2) return out;
  let carry = 0;
  for (let i = 1; i < raw.length; i += 1) {
    const p = raw[i - 1];
    const q = raw[i];
    if (!p || !q) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d === 0) continue;
    const a = Math.atan2(q.y - p.y, q.x - p.x);
    let at = carry;
    while (at <= d) {
      const t = at / d;
      out.push({
        x: p.x + (q.x - p.x) * t,
        y: p.y + (q.y - p.y) * t,
        a,
        chain: q.chain,
        brake: q.brake,
        loop: q.loop || p.loop,
      });
      at += STEP;
    }
    carry = at - d;
  }
  return out;
}

function buildTrack(
  preset: CoasterTrackPreset | CoasterPoint[],
  w: number,
  h: number,
  em: number,
): Track {
  const pb = builder(preset, w, h, em);
  const pts = resample(pb.raw);
  const length = Math.max(STEP, (pts.length - 1) * STEP);
  const ground = h - Math.max(4, h * 0.05);
  let rail = "";
  let ties = "";
  let struts = "";
  let chain = "";
  let lx0 = Infinity;
  let lx1 = -Infinity;
  let ly0 = Infinity;
  let ly1 = -Infinity;
  let lastStrut = -Infinity;
  pts.forEach((p, i) => {
    rail += `${i === 0 ? "M" : "L"}${r1(p.x)} ${r1(p.y)}`;
    if (i % 4 === 0) {
      // A sleeper across the rail every 8px.
      const nx = Math.sin(p.a) * em * 0.16;
      const ny = -Math.cos(p.a) * em * 0.16;
      ties += `M${r1(p.x - nx)} ${r1(p.y - ny)}L${r1(p.x + nx)} ${r1(p.y + ny)}`;
    }
    if (
      !p.loop &&
      p.x - lastStrut > em * 2.2 &&
      p.y < ground - 4 &&
      p.x > 0 &&
      p.x < w
    ) {
      struts += `M${r1(p.x)} ${r1(p.y + em * 0.18)}L${r1(p.x)} ${r1(ground)}`;
      lastStrut = p.x;
    }
    if (p.chain) {
      const ox = Math.sin(p.a) * em * 0.1;
      const oy = -Math.cos(p.a) * em * 0.1;
      chain += `${chain ? "L" : "M"}${r1(p.x - ox)} ${r1(p.y - oy)}`;
      lx0 = Math.min(lx0, p.x);
      lx1 = Math.max(lx1, p.x);
      ly0 = Math.min(ly0, p.y);
      ly1 = Math.max(ly1, p.y);
    }
  });
  const pad = em * 1.4;
  const lift =
    lx0 < lx1
      ? {
          left: Math.round(clamp(lx0 - pad * 0.4, 0, w)),
          top: Math.round(clamp(ly0 - pad * 1.2, 0, h)),
          width: Math.round(
            Math.min(w, lx1 + pad * 0.4) - Math.max(0, lx0 - pad * 0.4),
          ),
          height: Math.round(
            clamp(ly1 + pad * 0.5, 0, h) - clamp(ly0 - pad * 1.2, 0, h),
          ),
        }
      : { left: 0, top: 0, width: 0, height: 0 };
  return {
    w,
    h,
    em,
    pts,
    length,
    ground,
    drop: pb.drop,
    rail,
    ties,
    struts,
    chain,
    lift,
  };
}

/** The rides: feature sizes follow the height, and features that do not fit the width are left out. */
function builder(
  preset: CoasterTrackPreset | CoasterPoint[],
  w: number,
  h: number,
  em: number,
) {
  const b = pathBuilder();
  const ground = h - Math.max(4, h * 0.05);
  const top = Math.max(em * 2, h * 0.14);
  const valley = ground - Math.max(em * 0.6, h * 0.07);
  const station = valley - h * 0.06;
  const entry = -em * 3;
  const exit = w + em * 3;

  if (Array.isArray(preset)) {
    // Your own points, smoothed into a curve through each (Catmull-Rom).
    const list =
      preset.length >= 2
        ? preset
        : [
            { x: 0, y: 0.8 },
            { x: 1, y: 0.8 },
          ];
    const P = list.map((p) => ({ x: p.x * w, y: p.y * h, lift: !!p.lift }));
    const first = P[0] ?? { x: 0, y: h * 0.8, lift: false };
    b.move(entry, first.y);
    b.line(first.x, first.y);
    for (let i = 0; i < P.length - 1; i += 1) {
      const p0 = P[i - 1] ?? P[i];
      const p1 = P[i];
      const p2 = P[i + 1];
      const p3 = P[i + 2] ?? p2;
      if (!p0 || !p1 || !p2 || !p3) continue;
      if (p1.lift) {
        b.line(p2.x, p2.y, true);
        continue;
      }
      b.cubic(
        p1.x + (p2.x - p0.x) / 6,
        p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6,
        p2.y - (p3.y - p1.y) / 6,
        p2.x,
        p2.y,
      );
    }
    const last = P[P.length - 1] ?? first;
    b.line(exit, last.y, false, true);
    const ys = P.map((p) => p.y);
    return {
      raw: b.raw,
      drop: Math.max(em * 2, Math.max(...ys) - Math.min(...ys)),
    };
  }

  const kind: CoasterTrackPreset = preset;
  // The mandatory ride must fit across: the drop height shrinks on a narrow
  // track rather than the ride running off its edge.
  const fixed = w * 0.04 + em * 3.4;
  const D = Math.max(em * 2.4, Math.min(valley - top, (w - fixed) / 2.75));
  const crest = valley - D;
  const xs = w * 0.04;
  const liftTop = crest + D * 0.05;
  const liftW = station - liftTop;
  const crestW = em * 1.5;
  const dropW = D * 0.75;

  type Feature = { kind: "hump" | "loop"; f: number };
  const humpW = (f: number) => D * f * 1.6 + em;
  // The circle reaches a radius behind its entry and ahead of its exit, so
  // its straights clear it on both sides.
  const loopW = (f: number) => D * 0.34 * f * 2.2;
  const widthOf = (x: Feature) => (x.kind === "hump" ? humpW(x.f) : loopW(x.f));
  // Each ride in order, and which features to keep first when space is short.
  const plan: { order: Feature[]; keep: number[] } =
    kind === "classic"
      ? {
          order: [
            { kind: "hump", f: 0.45 },
            { kind: "loop", f: 1 },
            { kind: "hump", f: 0.25 },
          ],
          keep: [1, 0, 2],
        }
      : kind === "twin"
        ? {
            order: [
              { kind: "loop", f: 1 },
              { kind: "loop", f: 0.8 },
              { kind: "hump", f: 0.25 },
            ],
            keep: [0, 1, 2],
          }
        : {
            order: [
              { kind: "hump", f: 0.55 },
              { kind: "hump", f: 0.38 },
              { kind: "hump", f: 0.24 },
              { kind: "hump", f: 0.14 },
            ],
            keep: [0, 1, 2, 3],
          };
  const budget = w - em * 2 - (xs + liftW + crestW + dropW);
  const chosen = new Set<number>();
  let used = 0;
  for (const i of plan.keep) {
    const f = plan.order[i];
    if (!f) continue;
    if (used + widthOf(f) <= budget || chosen.size === 0) {
      chosen.add(i);
      used += widthOf(f);
    }
  }
  const feats = plan.order.filter((_, i) => chosen.has(i));
  // What is left of the width: drops and humps stretch into some of it, and
  // short straights between features take the rest, so a wide box is ridden
  // edge to edge instead of ending in a long flat.
  const left = Math.max(0, budget - used);
  const stretchable =
    dropW + feats.reduce((m, f) => m + (f.kind === "hump" ? widthOf(f) : 0), 0);
  const k = Math.min(1.6, 1 + (left * 0.55) / Math.max(1, stretchable));
  const flat = Math.min(
    em * 3,
    Math.max(0, left - (k - 1) * stretchable) / (feats.length + 1),
  );

  b.move(entry, station);
  b.line(xs, station);
  // The chain lift, straight up at about 45°.
  b.line(xs + liftW, liftTop, true);
  let p = b.at();
  // Over the crest.
  b.cubic(
    p.x + em * 0.5,
    p.y - em * 0.25,
    p.x + em * 0.9,
    crest,
    p.x + crestW,
    crest,
  );
  p = b.at();
  // The drop: steep, then flattening into the valley.
  const dw = dropW * k;
  b.cubic(p.x + dw * 0.34, crest, p.x + dw * 0.42, valley, p.x + dw, valley);
  for (const f of feats) {
    const q = b.at();
    if (flat > 1) b.line(q.x + flat, valley);
    const o = b.at();
    if (f.kind === "hump") {
      const hw = humpW(f.f) * k;
      const ht = D * f.f;
      b.cubic(
        o.x + hw * 0.25,
        valley,
        o.x + hw * 0.3,
        valley - ht,
        o.x + hw * 0.5,
        valley - ht,
      );
      b.cubic(
        o.x + hw * 0.7,
        valley - ht,
        o.x + hw * 0.75,
        valley,
        o.x + hw,
        valley,
      );
    } else {
      const r = D * 0.34 * f.f;
      b.line(o.x + r * 1.1, valley);
      b.loop(r);
      const e = b.at();
      b.line(e.x + r * 1.1, valley);
    }
  }
  // The brake run back to the platform.
  b.line(exit, valley, false, true);
  return { raw: b.raw, drop: D };
}

/* -------------------------------- the ride -------------------------------- */

type Car = {
  s: number;
  v: number;
  char: string;
  /** The car carrying the sentence's first letter rides last in its pass. */
  last: boolean;
  active: boolean;
  /** Degrees: back as it is pulled forward, forward as it brakes. */
  lean: number;
};

/** Where a car sits on the track, as an SVG transform, and its lean. */
function placeAt(track: Track, s: number, lean: number): string {
  const i = clamp(Math.round(s / STEP), 0, track.pts.length - 1);
  const p = track.pts[i];
  if (!p) return "translate(-99 -99)";
  const deg = (p.a * 180) / Math.PI + lean;
  return `translate(${r1(p.x)} ${r1(p.y)}) rotate(${r1(deg)})`;
}

const sampleAt = (track: Track, s: number) =>
  track.pts[clamp(Math.round(s / STEP), 0, track.pts.length - 1)];

/**
 * A marquee drawn as a roller coaster in fine line work — station, chain
 * lift, a big drop, humps and a loop, sleepers and struts down to the
 * ground — whose sentence rides it one letter to a car. Each car keeps its
 * own speed: towed up the lift at chain speed, slowed by gravity on every
 * climb and hurried down every drop, eased by rolling friction and stopped
 * on the brake run, so the sentence bunches over the crests and stretches
 * on the drops, and rides upside down through the loop. Letters stand on
 * the track's normal and lean a little with the ride's pull.
 *
 * Hold the lift hill (or its button with Space or Enter) to grab the chain:
 * it runs up to `towBoost` times faster on the snap spring and the cars on
 * it are towed up; a drag along it tows at the finger's pace; letting go
 * eases it back on the drift spring. The sentence is read once from an
 * sr-only copy; the drawing is hidden from assistive technology. Under
 * reduced motion the sentence is parked along the station and lift.
 */
export function CoasterTrack({
  text,
  as: As = "p",
  track = "classic",
  gravity = 1,
  spacing = 1.25,
  speed = 5,
  towBoost = 2.6,
  friction = 0.2,
  separator = " · ",
  cars = true,
  supports = true,
  trackColor = "var(--ink-3)",
  carColor = "var(--accent-bright)",
  trigger = "inView",
  paused = false,
  onLap,
  onTowChange,
  className,
}: CoasterTrackProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const clipId = `ct-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [box, setBox] = React.useState<{
    w: number;
    h: number;
    em: number;
  } | null>(null);
  const [towing, setTowing] = React.useState(false);

  const size = box ?? { w: 640, h: 192, em: 16 };
  // The ride runs once the box is measured and motion is allowed; until then,
  // and under reduced motion, the parked sentence is the picture.
  const showParked = !(motionSafe && box !== null);
  const trackKey = Array.isArray(track) ? JSON.stringify(track) : track;
  const built = React.useMemo(
    () => buildTrack(track, size.w, size.h, size.em),
    // The points are compared by value, not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackKey, size.w, size.h, size.em],
  );

  const stream = React.useMemo(() => {
    const body = graphemes(text);
    const sep = graphemes(separator);
    return { body, sep, all: [...body, ...sep] };
  }, [text, separator]);

  const gap = Math.max(0.5, spacing) * size.em;
  // Enough slots for the track at its tightest free-flowing spacing.
  const pool = Math.min(220, Math.ceil(built.length / (size.em * 0.55)) + 4);

  // The parked ride: one pass of the sentence from the station up the lift.
  const parked = React.useMemo(() => {
    const out: { char: string; transform: string }[] = [];
    const start = size.em * 3 + size.w * 0.02;
    stream.body.forEach((char, i) => {
      const s = start + i * gap;
      if (s > built.length - 2) return;
      out.push({ char, transform: placeAt(built, s, 0) });
    });
    return out;
  }, [stream, built, gap, size.em, size.w]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const groupRef = React.useRef<SVGGElement | null>(null);
  const chainRef = React.useRef<SVGPathElement | null>(null);
  const tow = useMotionValue(1);
  const towRun = React.useRef<AnimationPlaybackControls | null>(null);
  const lastMove = React.useRef(0);
  const tapTimer = React.useRef(0);
  const tapping = React.useRef(false);
  const sim = React.useRef({
    cars: [] as Car[],
    /** Slots in release order, a ring: the leading car first. */
    order: new Int16Array(0),
    head: 0,
    count: 0,
    /** Index into the stream of the next car out, counting down: the train
     * runs left to right, so it is loaded back to front. */
    next: 0,
    laps: 0,
    /** Set while the ride is pre-rolled: nothing it does is reported. */
    quiet: false,
    chainAt: 0,
    last: 0,
    frame: 0,
    visible: false,
    hovered: false,
    fingerTow: 0,
  });
  const latest = React.useRef({
    built,
    stream,
    gap,
    gravity,
    speed,
    friction,
    paused,
    trigger,
    motionSafe,
    cars,
    onLap,
  });

  /* ------------------------------- the loop ------------------------------- */

  const write = () => {
    const g = groupRef.current;
    const l = latest.current;
    if (!g) return;
    const kids = g.children;
    const s = sim.current;
    for (let i = 0; i < kids.length; i += 1) {
      const node = kids[i] as SVGGElement | undefined;
      const car = s.cars[i];
      if (!node) continue;
      if (!car || !car.active) {
        if (node.getAttribute("visibility") !== "hidden") {
          node.setAttribute("visibility", "hidden");
        }
        continue;
      }
      node.setAttribute("visibility", "visible");
      node.setAttribute("transform", placeAt(l.built, car.s, car.lean));
      const label = node.lastElementChild;
      if (label && label.textContent !== car.char) label.textContent = car.char;
    }
    chainRef.current?.setAttribute("stroke-dashoffset", String(r1(-s.chainAt)));
  };

  const step = (dt: number) => {
    const s = sim.current;
    const l = latest.current;
    const t = l.built;
    const em = t.em;
    const n = s.cars.length;
    if (!n) return;
    const station = Math.max(1, l.speed) * em;
    const chainSpeed = station * 0.62 * Math.max(1, tow.get(), s.fingerTow);
    const g = clamp(l.gravity, 0.2, 3) * 1.25 * t.drop;
    const drag = clamp(l.friction, 0, 1) * 0.9;
    // Cars leave at a fixed interval, so their spacing anywhere is that
    // interval times their speed there: a floor above minGap / interval keeps
    // free flow from ever closing up (bunching that touches never undoes).
    const minGap = em * 0.74;
    const floor = Math.max(station * 0.3, ((minGap * 1.15) / l.gap) * station);
    s.chainAt += chainSpeed * dt;
    // Release a car once the last one out has cleared the platform.
    const tailSlot = s.count ? s.order[(s.head + s.count - 1) % n] : -1;
    const tail =
      tailSlot === undefined || tailSlot < 0 ? null : s.cars[tailSlot];
    if ((!tail || tail.s >= l.gap) && s.count < n) {
      const slot = s.order[(s.head + s.count) % n] ?? 0;
      const all = l.stream.all;
      const index = ((s.next % all.length) + all.length) % all.length;
      const car = s.cars[slot];
      if (car && all.length) {
        car.s = 0;
        car.v = station;
        car.char = all[index] ?? " ";
        car.last = index === 0;
        car.active = true;
        car.lean = 0;
        s.count += 1;
        s.next -= 1;
      }
    }
    // Leading car first, so each can be held behind the one ahead.
    let ahead: Car | null = null;
    for (let k = 0; k < s.count; k += 1) {
      const car = s.cars[s.order[(s.head + k) % n] ?? 0];
      if (!car) continue;
      const p = sampleAt(t, car.s);
      let accel = 0;
      if (p?.chain) {
        car.v += (chainSpeed - car.v) * Math.min(1, dt * 12);
      } else if (p?.brake) {
        car.v += (station - car.v) * Math.min(1, dt * 2.4);
      } else if (p) {
        accel = g * Math.sin(p.a) - drag * car.v;
        car.v = Math.max(floor, car.v + accel * dt);
      }
      car.v = Math.min(car.v, station * 9);
      car.s += car.v * dt;
      if (ahead && car.s > ahead.s - minGap) {
        car.s = ahead.s - minGap;
        car.v = Math.min(car.v, ahead.v);
      }
      car.lean +=
        (clamp(-accel * 0.012, -10, 10) - car.lean) * Math.min(1, dt * 8);
      ahead = car;
    }
    // Cars leave from the front of the ring.
    while (s.count) {
      const lead = s.cars[s.order[s.head] ?? 0];
      if (!lead || lead.s <= t.length) break;
      lead.active = false;
      s.head = (s.head + 1) % n;
      s.count -= 1;
      if (lead.last && !s.quiet) {
        s.laps += 1;
        l.onLap?.(s.laps);
      }
    }
  };

  const running = () => {
    const s = sim.current;
    const l = latest.current;
    if (!l.motionSafe || l.paused || !s.visible || document.hidden)
      return false;
    if (l.trigger === "hover" && !s.hovered) return false;
    return true;
  };

  const tick = (now: number) => {
    const s = sim.current;
    s.frame = 0;
    if (!running()) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(1 / 30, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    step(dt / 2);
    step(dt / 2);
    write();
    s.frame = window.requestAnimationFrame((t) => api.current.tick(t));
  };

  const kick = () => {
    const s = sim.current;
    if (s.frame || !running()) return;
    s.frame = window.requestAnimationFrame((t) => api.current.tick(t));
  };

  const api = React.useRef<{
    tick: FrameRequestCallback;
    kick: () => void;
    write: () => void;
    step: (dt: number) => void;
  }>({ tick: () => {}, kick: () => {}, write: () => {}, step: () => {} });
  React.useEffect(() => {
    api.current = { tick, kick, write, step };
    latest.current = {
      built,
      stream,
      gap,
      gravity,
      speed,
      friction,
      paused,
      trigger,
      motionSafe,
      cars,
      onLap,
    };
  });

  // A fresh ride is pre-rolled from an empty track until it flows steadily,
  // so the first frame on screen is already a ride in progress, not a train
  // bunched up at the platform.
  React.useEffect(() => {
    const s = sim.current;
    s.cars = Array.from({ length: pool }, () => ({
      s: 0,
      v: 0,
      char: "",
      last: false,
      active: false,
      lean: 0,
    }));
    s.order = new Int16Array(pool);
    for (let i = 0; i < pool; i += 1) s.order[i] = i;
    s.head = 0;
    s.count = 0;
    // The next car out carries the separator's last character, and so on back.
    s.next = stream.all.length - 1;
    s.quiet = true;
    let exits = 0;
    for (let i = 0; i < 60 * 40 && exits < 1; i += 1) {
      const before = s.head;
      api.current.step(1 / 60);
      if (s.head !== before) exits += 1;
    }
    for (let i = 0; i < 60 * 2; i += 1) api.current.step(1 / 60);
    s.quiet = false;
    api.current.write();
    api.current.kick();
  }, [built, stream, gap, pool, speed]);

  React.useEffect(() => {
    api.current.kick();
  }, [paused, trigger, motionSafe, showParked]);

  React.useEffect(() => {
    const onVisibility = () => api.current.kick();
    document.addEventListener("visibilitychange", onVisibility);
    const s = sim.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (s.frame) window.cancelAnimationFrame(s.frame);
      s.frame = 0;
      towRun.current?.stop();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const measure = () => {
      const em = parseFloat(getComputedStyle(node).fontSize) || 16;
      setBox((b) =>
        b &&
        b.w === node.clientWidth &&
        b.h === node.clientHeight &&
        b.em === em
          ? b
          : { w: node.clientWidth, h: node.clientHeight, em },
      );
    };
    const sizer = new ResizeObserver(measure);
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      sim.current.visible = Boolean(entry?.isIntersecting);
      api.current.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      sim.current.visible = false;
    };
  }, []);

  /* ------------------------------ the chain ------------------------------- */

  const grabChain = (on: boolean) => {
    towRun.current?.stop();
    if (on !== towing) onTowChange?.(on);
    setTowing(on);
    if (!motionSafe) {
      tow.jump(on ? towBoost : 1);
      return;
    }
    towRun.current = animate(
      tow,
      on ? Math.max(1, towBoost) : 1,
      on ? springs.snap : springs.drift,
    );
    if (!on) sim.current.fingerTow = 0;
  };

  const liftDir = React.useMemo(() => {
    const p = built.pts.find((q) => q.chain);
    return p ? { x: Math.cos(p.a), y: Math.sin(p.a) } : { x: 1, y: 0 };
  }, [built]);

  const drag = useDrag({
    threshold: 3,
    onStart: () => {},
    onMove: ({ delta, event }) => {
      // Towing by hand: the finger's speed along the incline, in chain units.
      const dt = Math.max(8, event.timeStamp - lastMove.current) / 1000;
      lastMove.current = event.timeStamp;
      const along = delta.x * liftDir.x + delta.y * liftDir.y;
      const station = Math.max(1, speed) * size.em * 0.62;
      sim.current.fingerTow = clamp(along / dt / station, 0, 8);
    },
    onEnd: () => grabChain(false),
    onCancel: () => grabChain(false),
    // A tap tows for a moment, the way a short tug on a chain would.
    onTap: () => {
      window.clearTimeout(tapTimer.current);
      tapping.current = true;
      tapTimer.current = window.setTimeout(() => {
        tapping.current = false;
        grabChain(false);
      }, 700);
    },
  });
  React.useEffect(() => () => window.clearTimeout(tapTimer.current), []);

  const chars = stream.body.join("");

  return (
    <div
      ref={bindRoot}
      onPointerEnter={() => {
        sim.current.hovered = true;
        api.current.kick();
      }}
      onPointerLeave={() => {
        sim.current.hovered = false;
      }}
      onFocus={() => {
        sim.current.hovered = true;
        api.current.kick();
      }}
      onBlur={() => {
        sim.current.hovered = false;
      }}
      className={cn("relative h-48 w-full select-none", className)}
    >
      <As className="sr-only">{chars}</As>
      <svg
        aria-hidden
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 block size-full overflow-hidden"
      >
        <defs>
          <clipPath id={clipId}>
            <rect width={size.w} height={size.h} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`} style={{ color: trackColor }}>
          <path
            d={`M0 ${r1(built.ground)}H${size.w}`}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeWidth={1}
          />
          {supports ? (
            <path
              d={built.struts}
              stroke="currentColor"
              strokeOpacity={0.28}
              strokeWidth={1}
            />
          ) : null}
          <path
            d={built.ties}
            stroke="currentColor"
            strokeOpacity={0.5}
            strokeWidth={1}
          />
          <path
            d={built.rail}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <path
            ref={chainRef}
            d={built.chain}
            fill="none"
            stroke="currentColor"
            strokeWidth={towing ? 2.2 : 1.6}
            strokeDasharray="2 3"
            strokeOpacity={towing ? 1 : 0.7}
            style={{ color: towing ? carColor : undefined }}
          />
          {/* The parked ride: the server's frame and the reduced-motion one;
              it fades out as the live ride fades in over it. */}
          <g
            fontSize={size.em}
            className="transition-opacity duration-300"
            opacity={showParked ? 1 : 0}
          >
            {parked.map((c, i) => (
              <g key={i} transform={c.transform}>
                {cars ? <CarBody em={size.em} color={carColor} /> : null}
                <text
                  y={r2(-size.em * (cars ? 0.42 : 0.18))}
                  textAnchor="middle"
                  className="fill-foreground"
                >
                  {c.char}
                </text>
              </g>
            ))}
          </g>
          {/* The live ride, mounted on the client: one car per slot, moved by
              the loop without React. */}
          {showParked ? null : (
            <g
              ref={groupRef}
              fontSize={size.em}
              className="transition-opacity duration-300 starting:opacity-0"
            >
              {Array.from({ length: pool }, (_, i) => (
                <g key={i} visibility="hidden">
                  {cars ? <CarBody em={size.em} color={carColor} /> : null}
                  <text
                    y={r2(-size.em * (cars ? 0.42 : 0.18))}
                    textAnchor="middle"
                    className="fill-foreground"
                  />
                </g>
              ))}
            </g>
          )}
        </g>
      </svg>
      {built.lift.width > 0 ? (
        <button
          type="button"
          aria-label="Tow the chain lift"
          aria-pressed={towing}
          {...drag}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            lastMove.current = event.timeStamp;
            window.clearTimeout(tapTimer.current);
            grabChain(true);
            drag.onPointerDown(event);
            // A press that slips off the handle still lets go of the chain.
            const id = event.pointerId;
            const release = (e: PointerEvent) => {
              if (e.pointerId !== id) return;
              window.removeEventListener("pointerup", release);
              window.removeEventListener("pointercancel", release);
              // Released anywhere: let go, unless a tap is towing for a moment.
              window.setTimeout(() => {
                if (!tapping.current) grabChain(false);
              }, 0);
            };
            window.addEventListener("pointerup", release);
            window.addEventListener("pointercancel", release);
          }}
          onKeyDown={(event) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            if (!event.repeat) grabChain(true);
          }}
          onKeyUp={(event) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            grabChain(false);
          }}
          onClick={(event) => {
            // Assistive technology clicks without a key or a pointer:
            // tow for a moment.
            if (event.detail !== 0 || towing) return;
            grabChain(true);
            window.clearTimeout(tapTimer.current);
            tapTimer.current = window.setTimeout(() => grabChain(false), 1200);
          }}
          className={cn(
            "absolute touch-none rounded-2 outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            towing ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{
            left: built.lift.left,
            top: built.lift.top,
            width: built.lift.width,
            height: built.lift.height,
          }}
        />
      ) : null}
    </div>
  );
}

function CarBody({ em, color }: { em: number; color: string }) {
  const w = em * 0.6;
  const h = em * 0.2;
  const r = em * 0.06;
  const y = -h - em * 0.1;
  return (
    <g style={{ fill: color }}>
      <rect
        x={r2(-w / 2)}
        y={r2(y)}
        width={r2(w)}
        height={r2(h)}
        rx={r2(em * 0.06)}
      />
      <circle cx={r2(-w * 0.28)} cy={r2(-em * 0.07)} r={r2(r)} />
      <circle cx={r2(w * 0.28)} cy={r2(-em * 0.07)} r={r2(r)} />
    </g>
  );
}
