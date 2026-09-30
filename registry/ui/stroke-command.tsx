"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
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
  semitones,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StrokeShape = "check" | "circle" | "arrow" | "zigzag";

export type StrokeCommandItem = {
  /** The shape that runs this command. Each shape can be bound once. */
  shape: StrokeShape;
  /** What it does, in a word or two: the chip's text and the popped label. */
  label: string;
};

/** How a command was run: a drawn stroke, or its chip by keyboard or pointer. */
export type StrokeCommandVia = "stroke" | "keyboard" | "pointer";

export type StrokeCommandRun = {
  shape: StrokeShape;
  label: string;
  /** How closely the stroke matched its template, 0 to 1. */
  score: number;
  via: StrokeCommandVia;
};

export type StrokeCommandTemplates = "ghost" | "off";

export type StrokeCommandProps = {
  /** The commands, in chip order. Only these shapes are recognised. */
  commands: StrokeCommandItem[];
  /** Fires from the release (or the chip) that ran a command. */
  onCommand?: (run: StrokeCommandRun) => void;
  /**
   * Fires when a stroke matched nothing, with the nearest upright shape (if
   * any) and the score it needed.
   */
  onMiss?: (
    best: { shape: StrokeShape; score: number } | null,
    threshold: number,
  ) => void;
  /** The accessible name of the whole control. */
  label: string;
  /** How forgiving the matcher is, 0 (strict) to 1 (loose). @default 0.5 */
  tolerance?: number;
  /** Show the ink while drawing. Off, only the pen tip moves until release. @default true */
  trail?: boolean;
  /** The ink's weight in px, 2 to 10. @default 4 */
  width?: number;
  /** "ghost" fits the leading template under the stroke while you draw. @default "ghost" */
  templates?: StrokeCommandTemplates;
  /** The pad's height in px. @default 176 */
  height?: number;
  /** Play the pencil, the match chime and the shrug. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Pt = { x: number; y: number };

/*
 * The matcher. A unistroke is compared with each template after both are
 * brought to the same footing: resampled to 64 points evenly spaced along
 * the path (so speed and point count stop mattering), turned about the
 * centroid until the first point sits at angle zero, scaled into a square
 * and centred on the origin. The rotation left over is found by a
 * golden-section search within ±45°, and the mean distance between
 * corresponding points becomes a score from 0 to 1.
 */
const SAMPLES = 64;
const SQUARE = 250;
const HALF_DIAGONAL = 0.5 * Math.hypot(SQUARE, SQUARE);
const SEARCH = (45 * Math.PI) / 180;
const PRECISION = (2 * Math.PI) / 180;
const PHI = 0.5 * (Math.sqrt(5) - 1);
/** Check, arrow and zigzag mean something only one way up. */
const UPRIGHT = (50 * Math.PI) / 180;
/** Shorter strokes are taps or slips, not shapes. */
const MIN_LENGTH = 24;
const ORIGIN: Pt = { x: 0, y: 0 };

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

function pathLength(points: Pt[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) d += dist(a, b);
  }
  return d;
}

function resample(points: Pt[], n = SAMPLES): Pt[] {
  const first = points[0];
  if (!first) return [];
  const interval = pathLength(points) / (n - 1);
  const out: Pt[] = [{ ...first }];
  if (interval <= 0) {
    while (out.length < n) out.push({ ...first });
    return out;
  }
  let prev = first;
  let carried = 0;
  for (let i = 1; i < points.length; i += 1) {
    const next = points[i];
    if (!next) continue;
    let d = dist(prev, next);
    while (carried + d >= interval && d > 0) {
      const t = (interval - carried) / d;
      const q = {
        x: prev.x + t * (next.x - prev.x),
        y: prev.y + t * (next.y - prev.y),
      };
      out.push(q);
      prev = q;
      d = dist(prev, next);
      carried = 0;
    }
    carried += d;
    prev = next;
  }
  const last = points[points.length - 1] ?? first;
  while (out.length < n) out.push({ ...last });
  return out.slice(0, n);
}

function centroid(points: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, points.length);
  return { x: x / n, y: y / n };
}

function rotate(points: Pt[], angle: number, about: Pt): Pt[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map((p) => ({
    x: (p.x - about.x) * cos - (p.y - about.y) * sin + about.x,
    y: (p.x - about.x) * sin + (p.y - about.y) * cos + about.y,
  }));
}

/** Root-mean-square distance from the centre: the stroke's size. */
function spread(points: Pt[], c: Pt): number {
  let s = 0;
  for (const p of points) s += (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
  return Math.sqrt(s / Math.max(1, points.length));
}

/** Minor over major axis of the stroke's spread: 0 is a straight line. */
function thinness(points: Pt[]): number {
  const c = centroid(points);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const p of points) {
    xx += (p.x - c.x) ** 2;
    yy += (p.y - c.y) ** 2;
    xy += (p.x - c.x) * (p.y - c.y);
  }
  const half = (xx + yy) / 2;
  const gap = Math.sqrt(Math.max(0, half * half - (xx * yy - xy * xy)));
  const major = half + gap;
  return major > 0 ? Math.sqrt(Math.max(0, half - gap) / major) : 0;
}

type Normal = {
  points: Pt[];
  resampled: Pt[];
  angle: number;
  centre: Pt;
  size: number;
};

function normalize(raw: Pt[]): Normal {
  const resampled = resample(raw);
  const centre = centroid(resampled);
  const first = resampled[0] ?? centre;
  const angle = Math.atan2(centre.y - first.y, centre.x - first.x);
  const turned = rotate(resampled, -angle, centre);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of turned) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const scaled = turned.map((p) => ({
    x: (p.x * SQUARE) / w,
    y: (p.y * SQUARE) / h,
  }));
  const c = centroid(scaled);
  return {
    points: scaled.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
    resampled,
    angle,
    centre,
    size: spread(resampled, centre),
  };
}

function meanDistance(a: Pt[], b: Pt[]): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i += 1) {
    const p = a[i];
    const q = b[i];
    if (p && q) d += dist(p, q);
  }
  return d / Math.max(1, n);
}

function bestAngle(points: Pt[], template: Pt[]) {
  const at = (angle: number) =>
    meanDistance(rotate(points, angle, ORIGIN), template);
  let a = -SEARCH;
  let b = SEARCH;
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = at(x1);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = at(x2);
  while (Math.abs(b - a) > PRECISION) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = at(x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = at(x2);
    }
  }
  return f1 < f2 ? { distance: f1, angle: x1 } : { distance: f2, angle: x2 };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const ring = (clockwise: boolean): Pt[] =>
  Array.from({ length: 33 }, (_, i) => {
    const a = -Math.PI / 2 + (clockwise ? 1 : -1) * (i / 32) * 2 * Math.PI;
    return { x: 50 + 40 * Math.cos(a), y: 50 + 40 * Math.sin(a) };
  });

const ZIGZAG: Pt[] = [
  { x: 8, y: 32 },
  { x: 29, y: 68 },
  { x: 50, y: 32 },
  { x: 71, y: 68 },
  { x: 92, y: 32 },
];

/**
 * The clean shapes, in a 100-unit box. The first stroke of each is the one
 * the pad traces for a chip; the others are the same shape drawn the other
 * way round, which people do.
 */
const SHAPES: Record<StrokeShape, { strokes: Pt[][]; upright: boolean }> = {
  check: {
    strokes: [
      [
        { x: 12, y: 50 },
        { x: 38, y: 78 },
        { x: 90, y: 18 },
      ],
    ],
    upright: true,
  },
  circle: { strokes: [ring(true), ring(false)], upright: false },
  arrow: {
    strokes: [
      [
        { x: 8, y: 50 },
        { x: 92, y: 50 },
        { x: 72, y: 32 },
        { x: 72, y: 68 },
        { x: 92, y: 50 },
      ],
      [
        { x: 8, y: 50 },
        { x: 92, y: 50 },
        { x: 72, y: 68 },
        { x: 72, y: 32 },
        { x: 92, y: 50 },
      ],
    ],
    upright: true,
  },
  zigzag: { strokes: [ZIGZAG, [...ZIGZAG].reverse()], upright: true },
};

const TEMPLATES = (Object.keys(SHAPES) as StrokeShape[]).flatMap((shape) =>
  SHAPES[shape].strokes.map((stroke) => ({
    shape,
    upright: SHAPES[shape].upright,
    ...normalize(stroke),
  })),
);

type Match = {
  shape: StrokeShape;
  score: number;
  /** The stroke, resampled to 64 points, in pad px. */
  points: Pt[];
  /** The template's clean shape laid over the stroke, point for point. */
  fitted: Pt[];
};

function recognize(raw: Pt[], shapes: ReadonlySet<StrokeShape>): Match | null {
  if (raw.length < 2 || pathLength(raw) < MIN_LENGTH) return null;
  const c = normalize(raw);
  // A straight stroke scaled into a square is all noise; none of the shapes
  // is a line, so it is nothing rather than a guess.
  if (thinness(c.resampled) < 0.12) return null;
  let best: Match | null = null;
  for (const t of TEMPLATES) {
    if (!shapes.has(t.shape)) continue;
    const { distance, angle } = bestAngle(c.points, t.points);
    // The turn that carries the clean shape onto the stroke as drawn.
    const alpha = wrap(c.angle - t.angle - angle);
    if (t.upright && Math.abs(alpha) > UPRIGHT) continue;
    const score = 1 - distance / HALF_DIAGONAL;
    if (best && score <= best.score) continue;
    const k = t.size > 0 ? c.size / t.size : 1;
    const fitted = rotate(
      t.resampled.map((p) => ({
        x: (p.x - t.centre.x) * k,
        y: (p.y - t.centre.y) * k,
      })),
      alpha,
      ORIGIN,
    ).map((p) => ({ x: p.x + c.centre.x, y: p.y + c.centre.y }));
    best = { shape: t.shape, score, points: c.resampled, fitted };
  }
  return best;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function pathOf(points: Pt[]): string {
  let d = "";
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (p) d += `${i === 0 ? "M" : " L"} ${r1(p.x)} ${r1(p.y)}`;
  }
  return d;
}

const lerpPoints = (a: Pt[], b: Pt[], t: number): Pt[] =>
  a.map((p, i) => {
    const q = b[i] ?? p;
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  });

/** Each command's chime is its own step of one chord, so they are told apart. */
const CHIME = [0, 3, 7, 12];
/** How long a matched shape and its label stay before they fade, in ms. */
const HOLD = 1300;
const SHRUG_SECONDS = 0.42;
const TRACE_SECONDS = 0.36;

const SHAPE_NAME: Record<StrokeShape, string> = {
  check: "a check",
  circle: "a circle",
  arrow: "an arrow",
  zigzag: "a zigzag",
};

const listOf = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;

function ShapeGlyph({
  shape,
  className,
}: {
  shape: StrokeShape;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {shape === "check" ? (
        <path d="M2.8 8.4 6.2 11.6 13.2 4.4" />
      ) : shape === "circle" ? (
        <circle cx={8} cy={8} r={5.2} />
      ) : shape === "arrow" ? (
        <path d="M2 8h11.5M13.5 8 10.4 5.4v5.2z" />
      ) : (
        <path d="M1.8 5.8 4.9 10.4 8 5.8 11.1 10.4 14.2 5.8" />
      )}
    </svg>
  );
}

type Result = {
  id: number;
  kind: "match" | "miss";
  shape: StrokeShape | null;
  label: string;
};

type Tone = "ink" | "match" | "miss";

/**
 * A gesture pad that runs commands. Draw a check, a circle, an arrow or a
 * zigzag — whichever the host has bound — and a small unistroke matcher
 * written into this file weighs it against each template. A match morphs
 * the stroke you drew, point for point, into the clean shape laid over it
 * (on `springs.glide`), the command's label pops on `springs.recoil` with a
 * chime pitched for that command, and `onCommand` fires. A stroke that is no
 * shape shrugs — lifts and rocks about its own centre — and fades.
 *
 * While drawing, a pencil scratch follows the pen's speed, and the leading
 * template can be fitted faintly under the stroke (`templates="ghost"`),
 * going solid the moment the stroke would match — so `tolerance` is something
 * you can watch. The chips below are the keyboard path and the legend in one:
 * a real toolbar whose buttons make the pad draw that shape itself, through
 * the same matcher, morph, chime and callback. Under reduced motion nothing
 * is traced, morphed or shrugged; shapes and labels cross-fade and every
 * sound and result is the same.
 */
export function StrokeCommand({
  commands,
  onCommand,
  onMiss,
  label,
  tolerance = 0.5,
  trail = true,
  width = 4,
  templates = "ghost",
  height = 176,
  sound = false,
  disabled = false,
  className,
}: StrokeCommandProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();

  // One command per shape: the first binding wins.
  const items = commands.filter(
    (c, i) =>
      c.shape in SHAPES && commands.findIndex((d) => d.shape === c.shape) === i,
  );
  const threshold = 0.92 - 0.18 * clamp01(tolerance);
  const weight = Math.min(10, Math.max(2, width));

  const [result, setResult] = React.useState<Result | null>(null);
  const [tone, setTone] = React.useState<Tone>("ink");
  const [inked, setInked] = React.useState(false);
  const [leading, setLeading] = React.useState<{
    shape: StrokeShape;
    locked: boolean;
  } | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const focused = Math.min(focusIndex, Math.max(0, items.length - 1));
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const padRef = React.useRef<HTMLDivElement | null>(null);
  const chips = React.useRef(new Map<StrokeShape, HTMLButtonElement>());
  const points = React.useRef<Pt[]>([]);
  const drawing = React.useRef(false);
  const origin = React.useRef<Pt>({ x: 0, y: 0 });
  const scaleToPad = React.useRef(1);
  const lastMove = React.useRef(0);
  const moves = React.useRef(0);
  const scratch = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef<number | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const resultId = React.useRef(0);

  const inkD = useMotionValue("");
  const inkOpacity = useMotionValue(0);
  const tipX = useMotionValue(0);
  const tipY = useMotionValue(0);
  const tipOpacity = useMotionValue(0);
  const ghostD = useMotionValue("");
  const ghostOpacity = useMotionValue(0);
  const shrugRotate = useMotionValue(0);
  const shrugY = useMotionValue(0);

  const latest = React.useRef({ onCommand, onMiss });
  React.useEffect(() => {
    latest.current = { onCommand, onMiss };
  });

  const stopScratch = React.useCallback(() => {
    scratch.current?.stop();
    scratch.current = null;
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = null;
  }, []);

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  React.useEffect(
    () => () => {
      halt();
      stopScratch();
    },
    [halt, stopScratch],
  );

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const active = new Set(items.map((c) => c.shape));

  const clearGhost = () => {
    ghostOpacity.set(0);
    setLeading(null);
  };

  /** Clears the pad: the ink leaves on an exit tween, then its path goes. */
  const fadeInk = () => {
    running.current.push(
      animate(inkOpacity, 0, {
        ...exitFor(durations.base),
        onComplete: () => {
          inkD.set("");
          shrugRotate.set(0);
          shrugY.set(0);
          setTone("ink");
          setInked(false);
        },
      }),
    );
  };

  const begin = () => {
    halt();
    stopScratch();
    clearGhost();
    setResult(null);
    setTone("ink");
    setInked(true);
    shrugRotate.set(0);
    shrugY.set(0);
    inkD.set("");
  };

  const match = (best: Match, via: StrokeCommandVia) => {
    const index = items.findIndex((c) => c.shape === best.shape);
    const item = items[index];
    if (!item) return;
    const from = best.points;
    const to = best.fitted;
    const el = padRef.current;
    const w = el ? el.clientWidth : 0;
    const cx = to.reduce((s, p) => s + p.x, 0) / Math.max(1, to.length);
    const pan = w > 0 ? Number((((cx / w) * 2 - 1) * 0.6).toFixed(3)) : 0;
    resultId.current += 1;
    setResult({
      id: resultId.current,
      kind: "match",
      shape: best.shape,
      label: item.label,
    });
    setTone("match");
    // The chime lands with the label and the start of the morph.
    audio.play("chime", {
      pitch: semitones(CHIME[index % CHIME.length] ?? 0),
      gain: 0.5,
      pan,
    });
    if (motionSafe) {
      inkD.set(pathOf(from));
      running.current.push(
        animate(inkOpacity, 1, {
          duration: durations.fast,
          ease: easings.enter,
        }),
        animate(0, 1, {
          ...springs.glide,
          onUpdate: (t) => inkD.set(pathOf(lerpPoints(from, to, t))),
        }),
      );
    } else {
      inkD.set(pathOf(to));
      inkOpacity.set(0.35);
      running.current.push(
        animate(inkOpacity, 1, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
    }
    const percent = Math.round(best.score * 100);
    const shapeWord = best.shape.charAt(0).toUpperCase() + best.shape.slice(1);
    say(
      `${item.label.replace(/[.!?]+$/, "")}. ${shapeWord} matched, ${percent}%.`,
    );
    latest.current.onCommand?.({
      shape: best.shape,
      label: item.label,
      score: r2(best.score),
      via,
    });
    timers.current.push(
      window.setTimeout(() => {
        fadeInk();
        setResult(null);
      }, HOLD),
    );
  };

  const miss = (best: Match | null, pan: number) => {
    resultId.current += 1;
    setResult({
      id: resultId.current,
      kind: "miss",
      shape: null,
      label: "No match",
    });
    setTone("miss");
    audio.play("shrug", { gain: 0.5, pan });
    // Without a trail the stroke has not been seen yet; show what shrugged.
    inkOpacity.set(1);
    if (motionSafe) {
      running.current.push(
        animate(shrugRotate, [0, -3, 3, -1.5, 0], {
          duration: SHRUG_SECONDS,
          ease: easings.move,
        }),
        animate(shrugY, [0, -3, 0], {
          duration: SHRUG_SECONDS,
          ease: easings.move,
        }),
      );
    }
    say(
      `No command matched. Draw ${listOf(items.map((c) => SHAPE_NAME[c.shape]))}.`,
    );
    latest.current.onMiss?.(
      best ? { shape: best.shape, score: r2(best.score) } : null,
      r2(threshold),
    );
    timers.current.push(
      window.setTimeout(
        () => {
          fadeInk();
          timers.current.push(
            window.setTimeout(
              () => setResult(null),
              Math.round(durations.base * 1000),
            ),
          );
        },
        motionSafe ? Math.round(SHRUG_SECONDS * 1000) + 120 : 360,
      ),
    );
  };

  /** Judges a finished stroke. `forced` is the chip's shape: it must win. */
  const conclude = (
    stroke: Pt[],
    via: StrokeCommandVia,
    pan: number,
    forced?: StrokeShape,
  ) => {
    if (pathLength(stroke) < MIN_LENGTH) {
      fadeInk();
      return;
    }
    const best = recognize(stroke, forced ? new Set([forced]) : active);
    if (best && (forced || best.score >= threshold)) match(best, via);
    else miss(best, pan);
  };

  const toPad = (clientX: number, clientY: number): Pt => ({
    x: (clientX - origin.current.x) * scaleToPad.current,
    y: (clientY - origin.current.y) * scaleToPad.current,
  });

  const drag = useDrag({
    threshold: 2,
    disabled,
    onStart: ({ point, offset, event }) => {
      const el = padRef.current;
      if (!el) return;
      // Pad px per screen px, in case a stage scales the pad; the SVG starts
      // inside the border.
      const rect = el.getBoundingClientRect();
      const k = rect.width > 0 ? el.offsetWidth / rect.width : 1;
      scaleToPad.current = k;
      origin.current = {
        x: rect.left + el.clientLeft / k,
        y: rect.top + el.clientTop / k,
      };
      begin();
      drawing.current = true;
      moves.current = 0;
      lastMove.current = event.timeStamp;
      const start = toPad(point.x - offset.x, point.y - offset.y);
      points.current = [start];
      inkOpacity.set(trail ? 1 : 0);
      tipOpacity.set(trail ? 0 : 1);
      scratch.current = audio.start("scratch", {
        gain: 0,
        pitch: 1,
        pan: panFrom(point.x, el),
      });
    },
    onMove: ({ point, event }) => {
      if (!drawing.current) return;
      const p = toPad(point.x, point.y);
      const list = points.current;
      const last = list[list.length - 1];
      const step = last ? dist(last, p) : 0;
      if (last && step < 1) return;
      list.push(p);
      inkD.set(pathOf(list));
      tipX.set(r1(p.x));
      tipY.set(r1(p.y));
      // The pencil is heard as fast as it moves; a still pen is silent.
      const dt = Math.max(1, event.timeStamp - lastMove.current);
      lastMove.current = event.timeStamp;
      const speed = (step / dt) * 1000;
      scratch.current?.set({
        gain: r2(Math.min(0.6, speed / 1400)),
        pitch: r2(0.7 + Math.min(1, speed / 1600) * 0.9),
        pan: panFrom(point.x, padRef.current),
      });
      if (hush.current !== null) window.clearTimeout(hush.current);
      hush.current = window.setTimeout(
        () => scratch.current?.set({ gain: 0 }),
        70,
      );
      moves.current += 1;
      if (templates === "ghost" && moves.current % 2 === 0) {
        const guess = recognize(list, active);
        if (!guess) {
          clearGhost();
          return;
        }
        const locked = guess.score >= threshold;
        ghostD.set(pathOf(guess.fitted));
        ghostOpacity.set(
          r2(
            clamp01((guess.score - 0.5) / Math.max(0.05, threshold - 0.5)) *
              (locked ? 0.6 : 0.3),
          ),
        );
        setLeading((prev) =>
          prev && prev.shape === guess.shape && prev.locked === locked
            ? prev
            : { shape: guess.shape, locked },
        );
      }
    },
    onEnd: ({ point }) => {
      if (!drawing.current) return;
      drawing.current = false;
      stopScratch();
      tipOpacity.set(0);
      clearGhost();
      conclude(points.current, "stroke", panFrom(point.x, padRef.current));
    },
    onCancel: () => {
      if (!drawing.current) return;
      drawing.current = false;
      stopScratch();
      tipOpacity.set(0);
      clearGhost();
      fadeInk();
    },
  });

  /** A chip makes the pad draw its shape, then judges it like any stroke. */
  const trace = (item: StrokeCommandItem, via: StrokeCommandVia) => {
    if (disabled || drawing.current) return;
    const el = padRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const side = Math.min(w, h) * 0.58;
    const base = SHAPES[item.shape].strokes[0] ?? [];
    const stroke = resample(
      base.map((p) => ({
        x: w / 2 + ((p.x - 50) / 100) * side,
        y: h / 2 + ((p.y - 50) / 100) * side,
      })),
    );
    begin();
    if (!motionSafe) {
      inkD.set(pathOf(stroke));
      inkOpacity.set(0);
      conclude(stroke, via, 0, item.shape);
      return;
    }
    inkOpacity.set(trail ? 1 : 0);
    tipOpacity.set(trail ? 0 : 1);
    scratch.current = audio.start("scratch", { gain: 0.32, pitch: 1.1 });
    running.current.push(
      animate(0, 1, {
        duration: TRACE_SECONDS,
        ease: easings.move,
        onUpdate: (t) => {
          const at = t * (stroke.length - 1);
          const whole = Math.floor(at);
          const done = stroke.slice(0, whole + 1);
          const a = stroke[whole];
          const b = stroke[whole + 1];
          if (a && b) {
            const f = at - whole;
            done.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
          }
          const tip = done[done.length - 1];
          inkD.set(pathOf(done));
          if (tip) {
            tipX.set(r1(tip.x));
            tipY.set(r1(tip.y));
          }
        },
        onComplete: () => {
          stopScratch();
          tipOpacity.set(0);
          conclude(stroke, via, 0, item.shape);
        },
      }),
    );
  };

  const focusChip = (index: number) => {
    const i = Math.min(items.length - 1, Math.max(0, index));
    const item = items[i];
    if (!item) return;
    setFocusIndex(i);
    chips.current.get(item.shape)?.focus();
  };

  const onChipKeyDown = (event: React.KeyboardEvent, index: number) => {
    const targets: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    const to = targets[event.key];
    if (to === undefined) return;
    event.preventDefault();
    focusChip(to);
  };

  const lit =
    result?.kind === "match"
      ? result.shape
      : leading?.locked
        ? leading.shape
        : null;
  const hint = `Draw a shape on the pad, or choose a command below: ${listOf(
    items.map((c) => `${SHAPE_NAME[c.shape]} for ${c.label}`),
  )}.`;

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <div
        ref={padRef}
        aria-hidden
        {...drag}
        className={cn(
          "relative w-full touch-none overflow-clip rounded-3 border border-hairline bg-surface-2 [contain:paint] select-none [-webkit-touch-callout:none]",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-crosshair",
        )}
        style={{ height }}
      >
        <p
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-ink-3 transition-opacity",
            inked ? "opacity-0" : "opacity-100",
          )}
        >
          Draw a shape
        </p>
        <svg className="absolute inset-0 block size-full overflow-hidden">
          {templates === "ghost" ? (
            <motion.path
              d={ghostD}
              fill="none"
              stroke="currentColor"
              strokeWidth={Math.max(2, weight - 1)}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={leading?.locked ? undefined : "2 6"}
              className="text-cobalt-bright"
              style={{ opacity: ghostOpacity }}
            />
          ) : null}
          <motion.g
            className={cn(
              "transition-colors",
              tone === "match"
                ? "text-cobalt-bright"
                : tone === "miss"
                  ? "text-ink-3"
                  : "text-foreground",
            )}
            style={{
              opacity: inkOpacity,
              rotate: shrugRotate,
              y: shrugY,
              originX: 0.5,
              originY: 0.5,
            }}
          >
            <motion.path
              d={inkD}
              fill="none"
              stroke="currentColor"
              strokeWidth={weight}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.g>
          <motion.circle
            cx={tipX}
            cy={tipY}
            r={r1(weight / 2 + 2)}
            className="fill-foreground"
            style={{ opacity: tipOpacity }}
          />
        </svg>
        <AnimatePresence>
          {result ? (
            <motion.div
              key={result.id}
              className="pointer-events-none absolute inset-x-0 top-2.5 flex justify-center"
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.step, scale: 0.9 }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={
                motionSafe
                  ? springs.recoil
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              {/* The label can land on the ink, so it is opaque: a tint
                  would let the stroke read through the word. */}
              <span
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
                  result.kind === "match"
                    ? "border-cobalt-bright/30 bg-[color-mix(in_oklab,var(--accent-bright)_12%,var(--bg-1))] text-cobalt-bright"
                    : "border-hairline bg-surface-1 text-ink-3",
                )}
              >
                {result.shape ? (
                  <ShapeGlyph
                    shape={result.shape}
                    className="size-3.5 shrink-0"
                  />
                ) : null}
                {result.label}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div
        role="toolbar"
        aria-label={`${label} commands`}
        className="flex flex-wrap justify-center gap-1.5"
      >
        {items.map((item, i) => {
          const on = lit === item.shape;
          const warm = !on && leading?.shape === item.shape && result === null;
          return (
            <button
              key={item.shape}
              ref={(node) => {
                if (node) chips.current.set(item.shape, node);
                else chips.current.delete(item.shape);
              }}
              type="button"
              tabIndex={i === focused ? 0 : -1}
              disabled={disabled}
              aria-label={`${item.label}, draw ${SHAPE_NAME[item.shape]}`}
              onFocus={() => setFocusIndex(i)}
              onKeyDown={(event) => onChipKeyDown(event, i)}
              onClick={(event) =>
                trace(item, event.detail === 0 ? "keyboard" : "pointer")
              }
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-2 border px-2.5 text-xs transition-colors outline-none select-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed disabled:opacity-50",
                on
                  ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
                  : warm
                    ? "border-hairline-strong bg-surface-2 text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <ShapeGlyph shape={item.shape} className="size-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </div>

      <p id={hintId} className="sr-only">
        {hint}
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
