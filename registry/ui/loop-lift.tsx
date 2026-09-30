"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/** A named thing in the picture, as fractions (0–1) of the picture's box. */
export type LoopLiftRegion = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LoopLiftPoint = readonly [number, number];

export type LoopLiftValue = {
  /** The closed, smoothed loop, as fractions of the picture (4dp). */
  points: readonly LoopLiftPoint[];
  /** Ids of the regions the loop encloses. */
  regions: readonly string[];
  /** The enclosed share of the picture, 0 to 1. */
  area: number;
};

export type LoopLiftProps = {
  /** The picture. It is drawn twice: once as itself, once as the lifted copy. */
  children: React.ReactNode;
  /** The picture's accessible name. */
  label: string;
  /** The things in the picture a loop can catch, the caption names and the keyboard walks. */
  regions: readonly LoopLiftRegion[];
  /** Controlled selection: the lifted loop, or null. */
  value?: LoopLiftValue | null;
  /** Initial selection when uncontrolled. @default null */
  defaultValue?: LoopLiftValue | null;
  /** Fires from the loop, tap or key that changed the selection. */
  onValueChange?: (value: LoopLiftValue | null) => void;
  /** How much the loop relaxes when it closes, 0 (every wobble kept) to 1 (an ellipse). @default 0.5 */
  smoothing?: number;
  /** How high the lifted piece rises, in px, 0 to 24. @default 12 */
  lift?: number;
  /** Strength and reach of the halo around the lifted piece, 0 to 1. @default 0.6 */
  glow?: number;
  /** How dark the rest of the picture goes, 0 to 0.8. @default 0.5 */
  dim?: number;
  /** Play the marker and the lift. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Pt = { x: number; y: number };

type Morph = {
  /** Where each point starts: the open stroke, the gap collapsed on its end. */
  from: Pt[];
  /** Where each point lands: the closed loop after the low-pass. */
  to: Pt[];
  w: number;
  h: number;
  next: LoopLiftValue;
  ticked: boolean;
  committed: boolean;
};

/** Points on the closed loop, resampled by arc length. */
const SAMPLES = 96;
/** A loop narrower or shorter than this, in px, is not a selection. */
const SMALLEST = 16;
const SMALLEST_AREA = 0.006;
/** How long the keyboard's loop takes to draw, in seconds. */
const HAND_TIME = 0.45;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const pct = (v: number) => `${r2(v * 100)}%`;

// Shading, not theme: a dim and a shadow read the same way on a light stage
// and a dark one, so both are the stage's own background pushed toward black
// (oklab: a mix with black in oklch loses the hue and tints red).
const SCRIM = "color-mix(in oklab, var(--bg-0) 42%, black)";
const SHADOW = "color-mix(in oklab, var(--bg-0) 18%, black)";

/** A polyline through points in percent space. */
function polyline(points: Pt[]): string {
  if (points.length < 2) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${r2(p.x)} ${r2(p.y)}`)
    .join(" ");
}

/**
 * A Catmull-Rom curve through points in percent space, as cubic Béziers:
 * smooth through every sample, so 96 points read as one continuous line.
 */
function curve(points: Pt[], closed: boolean): string {
  const n = points.length;
  if (n < 2) return "";
  const at = (i: number): Pt =>
    closed
      ? (points[((i % n) + n) % n] as Pt)
      : (points[clamp(i, 0, n - 1)] as Pt);
  const f = (p: Pt) => `${r2(p.x)} ${r2(p.y)}`;
  let d = `M ${f(at(0))}`;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += ` C ${f({ x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 })} ${f({ x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 })} ${f(p2)}`;
  }
  return closed ? `${d} Z` : d;
}

/**
 * A low-pass on a closed loop: its Fourier series cut to harmonics −K..K.
 * Unlike averaging neighbours, it never shrinks the loop; K = 1 is the ellipse
 * that fits it best, and each harmonic added gives back some of the hand.
 */
function lowPass(points: Pt[], keep: number): Pt[] {
  const n = points.length;
  const coefficients: { m: number; re: number; im: number }[] = [];
  for (let m = -keep; m <= keep; m += 1) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < n; k += 1) {
      const p = points[k] as Pt;
      const a = (-2 * Math.PI * m * k) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      re += p.x * c - p.y * s;
      im += p.x * s + p.y * c;
    }
    coefficients.push({ m, re: re / n, im: im / n });
  }
  const out: Pt[] = [];
  for (let k = 0; k < n; k += 1) {
    let x = 0;
    let y = 0;
    for (const { m, re, im } of coefficients) {
      const a = (2 * Math.PI * m * k) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      x += re * c - im * s;
      y += re * s + im * c;
    }
    out.push({ x, y });
  }
  return out;
}

/**
 * Closes the stroke with the straight gap from its end to its start, samples
 * that ring evenly by arc length, and smooths it. `from` is the same samples
 * as they stand at release: every point that falls in the gap sits on the
 * stroke's end, so the morph grows the line across the gap as it relaxes.
 */
function closeLoop(stroke: Pt[], keep: number) {
  const first = stroke[0] as Pt;
  const end = stroke[stroke.length - 1] as Pt;
  const ring = [...stroke, first];
  const along = [0];
  for (let i = 1; i < ring.length; i += 1) {
    along.push(
      (along[i - 1] as number) + dist(ring[i - 1] as Pt, ring[i] as Pt),
    );
  }
  const total = along[along.length - 1] as number;
  const open = along[along.length - 2] as number;
  const samples: Pt[] = [];
  const from: Pt[] = [];
  let j = 1;
  for (let k = 0; k <= SAMPLES; k += 1) {
    const a = (k / SAMPLES) * total;
    while (j < ring.length - 1 && (along[j] as number) < a) j += 1;
    const a0 = along[j - 1] as number;
    const a1 = along[j] as number;
    const t = a1 > a0 ? (a - a0) / (a1 - a0) : 0;
    const p0 = ring[j - 1] as Pt;
    const p1 = ring[j] as Pt;
    const p = { x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) };
    samples.push(p);
    from.push(a <= open + 0.01 ? p : end);
  }
  const smooth = lowPass(samples.slice(0, SAMPLES), keep);
  return { from, to: [...smooth, smooth[0] as Pt] };
}

/** Even-odd ray cast: is the point inside the loop? */
function inside(points: readonly LoopLiftPoint[], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i] as LoopLiftPoint;
    const [xj, yj] = points[j] as LoopLiftPoint;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      hit = !hit;
    }
  }
  return hit;
}

/** A region is caught when most of a 3×3 sample of it is inside the loop. */
function enclosed(
  points: readonly LoopLiftPoint[],
  regions: readonly LoopLiftRegion[],
): string[] {
  const at = [1 / 6, 1 / 2, 5 / 6];
  return regions
    .filter((r) => {
      let count = 0;
      for (const fy of at) {
        for (const fx of at) {
          if (inside(points, r.x + r.width * fx, r.y + r.height * fy)) {
            count += 1;
          }
        }
      }
      return count >= 5;
    })
    .map((r) => r.id);
}

function areaOf(points: readonly LoopLiftPoint[]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i] as LoopLiftPoint;
    const [xj, yj] = points[j] as LoopLiftPoint;
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum) / 2;
}

function boundsOf(points: readonly LoopLiftPoint[]) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    sx += x;
    sy += y;
  }
  const n = Math.max(1, points.length);
  return { minX, minY, maxX, maxY, cx: sx / n, cy: sy / n };
}

/** What the caption calls a selection: the things it caught, or its share. */
function nameOf(
  ids: readonly string[],
  regions: readonly LoopLiftRegion[],
): string {
  const names = regions.filter((r) => ids.includes(r.id)).map((r) => r.label);
  const [a, b] = names;
  if (a === undefined) return "Selection";
  if (b === undefined) return a;
  if (names.length === 2) return `${a} and ${b}`;
  return `${a}, ${b} and ${names.length - 2} more`;
}

/** A stable string for a hash, so a region's hand-drawn wobble never changes. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * The loop a hand would draw around a region: an ellipse a little wider than
 * the thing, a slow wobble, a drift outward as it goes round, and a gap left
 * at the end — so the keyboard's loop closes and smooths exactly as a drawn
 * one does.
 */
function handLoop(region: LoopLiftRegion, w: number, h: number): Pt[] {
  const seed = hash(region.id);
  const phaseA = ((seed & 0xff) / 255) * Math.PI * 2;
  const phaseB = (((seed >>> 8) & 0xff) / 255) * Math.PI * 2;
  const cx = (region.x + region.width / 2) * w;
  const cy = (region.y + region.height / 2) * h;
  const rx = (region.width * w) / 2 + Math.max(8, region.width * w * 0.2);
  const ry = (region.height * h) / 2 + Math.max(8, region.height * h * 0.2);
  const start = -Math.PI * 0.62;
  const sweep = Math.PI * 2 * 0.94;
  const count = 56;
  const out: Pt[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const a = start + sweep * t;
    const wobble =
      1 + 0.045 * Math.sin(3 * a + phaseA) + 0.03 * Math.sin(5 * a + phaseB);
    const drift = 1 + 0.07 * t;
    out.push({
      x: clamp(cx + Math.cos(a) * rx * wobble * drift, 2, w - 2),
      y: clamp(cy + Math.sin(a) * ry * wobble * drift, 2, h - 2),
    });
  }
  return out;
}

const toPercent = (points: Pt[], w: number, h: number): Pt[] =>
  points.map((p) => ({ x: (p.x / w) * 100, y: (p.y / h) * 100 }));

/** Stereo position of a point a fraction `fx` across the element. */
function panAt(element: Element | null, fx: number): number {
  if (!element) return 0;
  const rect = element.getBoundingClientRect();
  return panFrom(rect.left + fx * rect.width, element);
}

/**
 * A picture you select from by circling. Draw a loop around part of it and
 * the loop closes and smooths — the gap between the pen's end and its start
 * grows shut while the wobble relaxes, one glide spring — then exactly that
 * part lifts out: a copy of the picture clipped by the loop rises on a snap
 * spring with a glow and a caption naming what it caught, while everything
 * outside dims. Escape, a tap or a new loop drops it back.
 *
 * The glow and the shadow are geometry (strokes and fills of the loop), not
 * blur filters. The things in the picture are a listbox: the arrow keys walk
 * them, and Enter draws the loop around the chosen one — with the same
 * marker squeak, the same close and the same lift. Under reduced motion the
 * loop snaps to its smoothed shape and the piece is picked out by outline,
 * glow and dim alone, with no rise.
 */
export function LoopLift({
  children,
  label,
  regions,
  value,
  defaultValue = null,
  onValueChange,
  smoothing = 0.5,
  lift = 12,
  glow = 0.6,
  dim = 0.5,
  sound = false,
  disabled = false,
  className,
}: LoopLiftProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();

  const [own, setOwn] = React.useState<LoopLiftValue | null>(defaultValue);
  const current = value === undefined ? own : value;

  // The shape on show outlives its value by a drop: it is kept until another
  // selection replaces it, so the piece settles back in its own shape.
  const [held, setHeld] = React.useState<LoopLiftValue | null>(current);
  if (current && current !== held) setHeld(current);

  const [active, setActive] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, key: current, text: "" });
  if (said.key !== current) {
    setSaid({
      n: said.n + 1,
      key: current,
      text: current
        ? `Lifted ${nameOf(enclosed(current.points, regions), regions)}, ${Math.max(1, Math.round(current.area * 100))}% of the picture. Escape drops it.`
        : "Dropped.",
    });
  }
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const options = React.useRef(new Map<string, HTMLDivElement>());
  const stroke = React.useRef<Pt[]>([]);
  const box = React.useRef({ left: 0, top: 0, w: 1, h: 1 });
  const morphing = React.useRef<Morph | null>(null);
  const drawing = React.useRef(false);
  const asked = React.useRef<LoopLiftValue | null | undefined>(undefined);
  const squeak = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef<number | null>(null);
  const lastMove = React.useRef({ x: 0, y: 0, t: 0 });
  const anims = React.useRef<{
    morph?: AnimationPlaybackControls;
    lift?: AnimationPlaybackControls;
    stroke?: AnimationPlaybackControls;
    hand?: AnimationPlaybackControls;
  }>({});

  const strokeD = useMotionValue("");
  const strokeOpacity = useMotionValue(0);
  const morph = useMotionValue(0);
  const lifted = useMotionValue(current ? 1 : 0);

  const keep = Math.round(lerp(14, 1, clamp01(smoothing)));
  const rise = clamp(lift, 0, 24);
  const halo = clamp01(glow);
  const shade = clamp(dim, 0, 0.8);

  const quiet = React.useCallback(() => {
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = null;
    squeak.current?.stop();
    squeak.current = null;
  }, []);

  const halt = React.useCallback(() => {
    const a = anims.current;
    a.morph?.stop();
    a.stroke?.stop();
    a.hand?.stop();
    anims.current = { lift: a.lift };
    morphing.current = null;
    drawing.current = false;
    quiet();
  }, [quiet]);

  React.useEffect(
    () => () => {
      halt();
      anims.current.lift?.stop();
    },
    [halt],
  );

  const fadeStroke = React.useCallback(() => {
    anims.current.stroke?.stop();
    anims.current.stroke = animate(strokeOpacity, 0, {
      duration: durations.base,
      ease: easings.exit,
    });
  }, [strokeOpacity]);

  const commit = (next: LoopLiftValue | null) => {
    if (next === current) return;
    if (value === undefined) {
      setOwn(next);
    } else {
      // Controlled: ask, and let the value that comes back do the lifting.
      asked.current = next;
      bump();
    }
    onValueChange?.(next);
  };

  // A selection the host refused never lifts: its outline just fades.
  React.useEffect(() => {
    if (asked.current === undefined) return;
    const was = asked.current;
    asked.current = undefined;
    if (was !== null && was !== current) fadeStroke();
  });

  // A value that changes — from a loop, a key or the host — lifts or drops
  // the piece the same way, sound and all.
  const shownRef = React.useRef(current);
  React.useEffect(() => {
    if (shownRef.current === current) return;
    shownRef.current = current;
    anims.current.lift?.stop();
    if (current) {
      fadeStroke();
      anims.current.lift = animate(
        lifted,
        1,
        motionSafe
          ? springs.snap
          : { duration: durations.fast, ease: easings.enter },
      );
      const b = boundsOf(current.points);
      audio.play("shimmer", {
        pitch: r2(lerp(1.3, 0.8, Math.sqrt(clamp01(current.area)))),
        gain: 0.5,
        pan: panAt(rootRef.current, b.cx),
      });
    } else {
      anims.current.lift = animate(
        lifted,
        0,
        motionSafe
          ? { ...springs.glide, velocity: lifted.getVelocity() }
          : { duration: durations.fast, ease: easings.exit },
      );
      audio.play("swish", { pitch: 0.6, gain: 0.3 });
    }
  }, [audio, current, fadeStroke, lifted, motionSafe]);

  const latest = React.useRef({ commit, keep });
  React.useEffect(() => {
    latest.current = { commit, keep };
  });

  // The morph draws itself, sounds the ends meeting, and commits the
  // selection just before it lands, so the lift overlaps its last few percent.
  React.useEffect(
    () =>
      morph.on("change", (t) => {
        const m = morphing.current;
        if (!m) return;
        const points = m.from.map((f, i) => {
          const to = m.to[i] as Pt;
          return { x: lerp(f.x, to.x, t), y: lerp(f.y, to.y, t) };
        });
        const closed = t >= 0.999;
        strokeD.set(
          curve(
            toPercent(closed ? points.slice(0, -1) : points, m.w, m.h),
            closed,
          ),
        );
        if (!m.ticked && t >= 0.8) {
          m.ticked = true;
          audio.play("tick", { pitch: 1.4, gain: 0.35 });
        }
        if (!m.committed && t >= 0.9) {
          m.committed = true;
          latest.current.commit(m.next);
        }
      }),
    [audio, morph, strokeD],
  );

  /** The pen lifted: close, smooth, and hand the loop to the morph. */
  const finish = () => {
    drawing.current = false;
    quiet();
    const { w, h } = box.current;
    const points = stroke.current;
    if (points.length < 3) {
      fadeStroke();
      return;
    }
    const { from, to } = closeLoop(points, latest.current.keep);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of to) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const loop = to
      .slice(0, -1)
      .map(
        (p) => [r4(clamp01(p.x / w)), r4(clamp01(p.y / h))] as LoopLiftPoint,
      );
    const area = areaOf(loop);
    if (
      maxX - minX < SMALLEST ||
      maxY - minY < SMALLEST ||
      area < SMALLEST_AREA
    ) {
      fadeStroke();
      audio.play("shrug", { gain: 0.3 });
      setSaid((s) => ({ ...s, n: s.n + 1, text: "Too small to lift." }));
      return;
    }
    const next: LoopLiftValue = {
      points: loop,
      regions: enclosed(loop, regions),
      area: r3(area),
    };
    if (!motionSafe) {
      strokeD.set(curve(toPercent(to.slice(0, -1), w, h), true));
      audio.play("tick", { pitch: 1.4, gain: 0.35 });
      commit(next);
      return;
    }
    morphing.current = {
      from,
      to,
      w,
      h,
      next,
      ticked: false,
      committed: false,
    };
    morph.set(0);
    anims.current.morph = animate(morph, 1, springs.glide);
  };

  /** Starts a stroke: drops whatever is lifted, and the marker starts to squeak. */
  const begin = (fx: number) => {
    halt();
    if (current) commit(null);
    anims.current.stroke?.stop();
    strokeOpacity.set(1);
    strokeD.set("");
    drawing.current = true;
    squeak.current = audio.start("scratch", {
      pitch: 2.4,
      gain: 0,
      pan: panAt(rootRef.current, fx),
    });
  };

  /** The marker's voice follows its speed, and goes quiet when it stops. */
  const voice = (speed: number, fx: number) => {
    squeak.current?.set({
      pitch: r2(2.2 + Math.min(1.2, speed * 0.6)),
      gain: r2(Math.min(0.55, 0.1 + speed * 0.3)),
      pan: panAt(rootRef.current, fx),
    });
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = window.setTimeout(() => {
      squeak.current?.set({ gain: 0 });
    }, 70);
  };

  const local = (x: number, y: number): Pt => {
    const b = box.current;
    return { x: clamp(x - b.left, 0, b.w), y: clamp(y - b.top, 0, b.h) };
  };

  /** The drawing area is the padding box: the frame's border is not paper. */
  const measure = () => {
    const root = rootRef.current;
    if (!root || root.clientWidth < 1 || root.clientHeight < 1) return false;
    const rect = root.getBoundingClientRect();
    box.current = {
      left: rect.left + root.clientLeft,
      top: rect.top + root.clientTop,
      w: root.clientWidth,
      h: root.clientHeight,
    };
    return true;
  };

  const drag = useDrag({
    disabled,
    onStart: ({ point, offset, event }) => {
      if (!measure()) return;
      begin((point.x - box.current.left) / box.current.w);
      const start = local(point.x - offset.x, point.y - offset.y);
      const now = local(point.x, point.y);
      stroke.current = [start, now];
      lastMove.current = { ...now, t: event.timeStamp };
      strokeD.set(
        polyline(toPercent(stroke.current, box.current.w, box.current.h)),
      );
    },
    onMove: ({ point, event }) => {
      if (!drawing.current) return;
      const p = local(point.x, point.y);
      const last = stroke.current[stroke.current.length - 1];
      if (last && dist(p, last) < 1.5) return;
      const points = stroke.current;
      points.push(p);
      // A very long scribble keeps its shape at half the resolution.
      if (points.length > 900) {
        stroke.current = points.filter(
          (_, i) => i % 2 === 0 || i === points.length - 1,
        );
      }
      strokeD.set(
        polyline(toPercent(stroke.current, box.current.w, box.current.h)),
      );
      const m = lastMove.current;
      const speed = dist(p, m) / Math.max(8, event.timeStamp - m.t);
      lastMove.current = { ...p, t: event.timeStamp };
      voice(speed, p.x / box.current.w);
    },
    onEnd: () => {
      if (drawing.current) finish();
    },
    onCancel: () => {
      halt();
      fadeStroke();
    },
    onTap: () => {
      if (current) commit(null);
    },
  });

  /** Enter on a region: the loop a hand would draw around it, drawn. */
  const drawAround = (region: LoopLiftRegion) => {
    if (disabled || !measure()) return;
    const { w, h } = box.current;
    const loop = handLoop(region, w, h);
    begin(region.x + region.width / 2);
    if (!motionSafe) {
      stroke.current = loop;
      strokeD.set(polyline(toPercent(loop, w, h)));
      squeak.current?.set({ pitch: 2.8, gain: 0.35 });
      hush.current = window.setTimeout(() => finish(), 120);
      return;
    }
    stroke.current = [];
    anims.current.hand = animate(0, 1, {
      duration: HAND_TIME,
      ease: easings.move,
      onUpdate: (t) => {
        const count = Math.max(2, Math.ceil(t * loop.length));
        stroke.current = loop.slice(0, count);
        strokeD.set(polyline(toPercent(stroke.current, w, h)));
        // The ease's own speed: quick in the middle of the loop, slow at
        // either end, as a hand draws it.
        const speed = 6 * t * (1 - t);
        squeak.current?.set({
          pitch: r2(2.3 + speed * 0.6),
          gain: r2(0.12 + speed * 0.28),
        });
      },
      onComplete: () => {
        stroke.current = loop;
        finish();
      },
    });
  };

  const selected = new Set(current ? enclosed(current.points, regions) : []);

  const drop = () => {
    halt();
    fadeStroke();
    if (current) commit(null);
  };

  const onOptionKey = (event: React.KeyboardEvent, index: number) => {
    const region = regions[index];
    if (!region) return;
    const move = (to: number) => {
      event.preventDefault();
      const target = regions[clamp(to, 0, regions.length - 1)];
      if (target) options.current.get(target.id)?.focus();
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(regions.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (event.repeat) break;
        if (selected.has(region.id)) drop();
        else drawAround(region);
        break;
    }
  };

  // Everything the lift moves, from one value.
  const liftY = useTransform(lifted, (l) =>
    motionSafe ? r2(-rise * 0.6 * l) : 0,
  );
  const liftScale = useTransform(lifted, (l) =>
    motionSafe ? r4(1 + (rise / 200) * l) : 1,
  );
  const shadowY = useTransform(lifted, (l) =>
    motionSafe ? r2(rise * 0.35 * clamp01(l)) : 0,
  );
  const shadowOpacity = useTransform(lifted, (l) =>
    motionSafe && rise > 0 ? r3(clamp01(l)) : 0,
  );
  const scrimOpacity = useTransform(lifted, (l) => r3(shade * clamp01(l)));
  const glowOpacity = useTransform(lifted, (l) => r3(clamp01(l)));
  const liftVisibility = useTransform(lifted, (l) =>
    l > 0.002 ? "visible" : "hidden",
  );

  const heldPercent: Pt[] = held
    ? held.points.map(([x, y]) => ({ x: x * 100, y: y * 100 }))
    : [];
  const heldPath = curve(heldPercent, true);
  const heldBounds = held ? boundsOf(held.points) : null;
  const clip = held
    ? `polygon(${held.points.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(", ")})`
    : undefined;

  const caption = current
    ? (() => {
        const b = boundsOf(current.points);
        const above = 8 + rise * 0.6 + halo * 6;
        const below = 8 + rise * 0.35 + halo * 6;
        const place: React.CSSProperties =
          b.minY >= 0.2
            ? { bottom: `calc(${pct(1 - b.minY)} + ${r2(above)}px)` }
            : b.maxY <= 0.8
              ? { top: `calc(${pct(b.maxY)} + ${r2(below)}px)` }
              : { top: 8 };
        return {
          key: `${current.points.length}:${current.points[0]?.join(",") ?? ""}:${current.area}`,
          name: nameOf(enclosed(current.points, regions), regions),
          share: Math.max(1, Math.round(current.area * 100)),
          x: r2(clamp01(b.cx) * 100),
          place,
          up: b.minY >= 0.2,
        };
      })()
    : null;

  const glowLayers = [
    { width: 26 * halo, opacity: 0.1 },
    { width: 2 + 14 * halo, opacity: 0.2 },
    { width: 2 + 6 * halo, opacity: 0.42 },
  ];

  return (
    <div
      ref={rootRef}
      // Focusable by the press that draws (never a tab stop, so never a
      // ring): Escape then reaches the picture from wherever focus is in it.
      tabIndex={disabled ? undefined : -1}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Handled only when there is something to drop; otherwise the key is
        // left for whatever holds this picture.
        if (current || drawing.current || morphing.current) {
          event.preventDefault();
          drop();
        }
      }}
      {...drag}
      className={cn(
        "relative isolate rounded-3 border border-hairline bg-surface-1 transition-colors outline-none select-none [-webkit-touch-callout:none]",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-crosshair touch-none hover:border-hairline-strong",
        className,
      )}
    >
      <div className="overflow-clip rounded-[inherit]">{children}</div>

      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: SCRIM, opacity: scrimOpacity }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip rounded-[inherit]"
      >
        {held ? (
          <>
            <motion.div
              className="absolute inset-0"
              style={{
                y: shadowY,
                opacity: shadowOpacity,
                visibility: liftVisibility,
              }}
            >
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 block size-full overflow-visible"
              >
                <path
                  d={heldPath}
                  fill={SHADOW}
                  fillOpacity={0.34}
                  stroke={SHADOW}
                  strokeOpacity={0.14}
                  strokeWidth={10}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </motion.div>

            <motion.div
              className="absolute inset-0"
              style={{
                y: liftY,
                scale: liftScale,
                originX: r3(clamp01(heldBounds?.cx ?? 0.5)),
                originY: r3(clamp01(heldBounds?.cy ?? 0.5)),
                visibility: liftVisibility,
              }}
            >
              {halo > 0 ? (
                <motion.svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 block size-full overflow-visible text-cobalt-bright"
                  style={{ opacity: glowOpacity }}
                >
                  {glowLayers.map((layer) => (
                    <path
                      key={layer.opacity}
                      d={heldPath}
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity={r3(layer.opacity * (0.4 + 0.6 * halo))}
                      strokeWidth={r2(layer.width)}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </motion.svg>
              ) : null}
              <div
                inert
                className="absolute inset-0"
                style={{ clipPath: clip }}
              >
                {children}
              </div>
              <motion.svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 block size-full overflow-visible text-cobalt-bright"
                style={{ opacity: glowOpacity }}
              >
                <path
                  d={heldPath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </motion.svg>
            </motion.div>
          </>
        ) : null}

        <motion.svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 block size-full overflow-visible text-cobalt-bright"
          style={{ opacity: strokeOpacity }}
        >
          <motion.path
            d={strokeD}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.22}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <motion.path
            d={strokeD}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </motion.svg>
      </div>

      <AnimatePresence>
        {caption ? (
          <div
            key={caption.key}
            aria-hidden
            className="pointer-events-none absolute inset-x-2 z-10"
            style={caption.place}
          >
            <motion.div
              className={cn(
                "absolute left-0 w-max max-w-full",
                caption.up ? "bottom-0" : "top-0",
              )}
              style={{ left: `${caption.x}%`, x: `-${caption.x}%` }}
              initial={
                motionSafe
                  ? {
                      opacity: 0,
                      y: caption.up ? distances.nudge : -distances.nudge,
                    }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              <span
                className="flex h-6 items-center gap-1.5 rounded-2 border border-hairline-strong bg-popover px-2 text-xs text-foreground"
                title={caption.name}
              >
                <span className="size-1.5 shrink-0 rounded-full bg-cobalt-bright" />
                <span className="truncate">{caption.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                  {caption.share}%
                </span>
              </span>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <div
        role="listbox"
        aria-label={label}
        aria-describedby={hintId}
        aria-multiselectable
        aria-disabled={disabled || undefined}
        className="pointer-events-none absolute inset-0"
      >
        {regions.map((region, i) => (
          <div
            key={region.id}
            ref={(node) => {
              if (node) options.current.set(region.id, node);
              else options.current.delete(region.id);
            }}
            role="option"
            aria-label={region.label}
            aria-selected={selected.has(region.id)}
            tabIndex={disabled ? -1 : i === active ? 0 : -1}
            onFocus={() => setActive(i)}
            onKeyDown={(event) => onOptionKey(event, i)}
            onClick={(event) => {
              // No pointer reaches an option; a click here is assistive
              // technology activating it, which is Enter.
              if (event.detail !== 0 || disabled) return;
              if (selected.has(region.id)) drop();
              else drawAround(region);
            }}
            className="group/loop-lift-option absolute rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            style={{
              left: pct(region.x),
              top: pct(region.y),
              width: pct(region.width),
              height: pct(region.height),
            }}
          >
            {/* The lifted caption already names a caught region. */}
            {selected.has(region.id) ? null : (
              <span className="absolute top-1 left-1 max-w-[calc(100%-8px)] truncate rounded-1 bg-popover px-1.5 py-0.5 text-[10px] leading-none text-foreground opacity-0 transition-opacity group-focus-visible/loop-lift-option:opacity-100">
                {region.label}
              </span>
            )}
          </div>
        ))}
      </div>

      <p id={hintId} className="sr-only">
        Draw a loop around part of the picture to lift it out. Arrow keys move
        between the things in it; Enter or Space lifts the chosen one, and
        Escape drops it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
