"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TypeTrailSize = "sm" | "md" | "lg";
export type TypeTrailRest = "center" | "bottom" | "hidden";
export type TypeTrailTrigger = "mount" | "inView" | "manual";
export type TypeTrailState = "rest" | "writing" | "gathered";
export type TypeTrailElement =
  "div" | "section" | "header" | "aside" | "figure";

export type TypeTrailProps = {
  /** The phrase the pointer writes. */
  text: string;
  /** What the container holds; the trail is drawn above it and never takes its clicks. */
  children?: React.ReactNode;
  /** The container's element. @default "div" */
  as?: TypeTrailElement;
  /** Extra space between letters along the path, em. @default 0.06 */
  spacing?: number;
  /** How far the tail fades and shrinks, 0 (not at all) to 1. @default 0.6 */
  tail?: number;
  /** The phrase's type size against the container's: 0.85, 1.1 or 1.5em. @default "md" */
  size?: TypeTrailSize;
  /** How much the pen smooths the pointer, 0 (raw) to 1 (calligraphic). @default 0.35 */
  smoothing?: number;
  /** How long the pointer rests before the phrase gathers under it, ms. @default 160 */
  gatherAfter?: number;
  /** Where the phrase waits when nobody is writing. @default "bottom" */
  rest?: TypeTrailRest;
  /** The type's colour once dry, any CSS colour. @default "var(--foreground)" */
  color?: string;
  /** The ink at the nib: fresh letters, a few em long. @default "var(--accent-bright)" */
  accent?: string;
  /** When a ghost pen writes the phrase once by itself, to show the piece. @default "inView" */
  trigger?: TypeTrailTrigger;
  /** The ghost pen writes once, or every time the container re-enters view. @default true */
  once?: boolean;
  /** Wait before the ghost pen, ms. @default 300 */
  delay?: number;
  /** The ghost pen has finished and the phrase has come to rest. */
  onComplete?: () => void;
  /** Fires as the phrase rests, is being written, or has gathered under the pen. */
  onStateChange?: (state: TypeTrailState) => void;
  /** The container takes keyboard focus, and the arrow keys move a pen. @default true */
  keyboard?: boolean;
  /** No writing: the phrase stays at rest. @default false */
  disabled?: boolean;
  className?: string;
};

const SCALE: Record<TypeTrailSize, number> = { sm: 0.85, md: 1.1, lg: 1.5 };
/** Points kept on the pen's path; the oldest half is dropped when full. */
const CAP = 2048;
/** The gathered line sits this far under the pen, em of the phrase. */
const UNDER = 1.35;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** An angle into (-180, 180]. */
const wrap = (deg: number) => {
  const d = (((deg + 180) % 360) + 360) % 360;
  return d - 180;
};

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

type Pose = { x: number; y: number; r: number; s: number; o: number };

type Letter = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  opacity: MotionValue<number>;
  color: MotionValue<string>;
  /** 1: at its anchor (a line); 0: on the path. */
  g: MotionValue<number>;
};

type Path = {
  xs: Float64Array;
  ys: Float64Array;
  ss: Float64Array;
  n: number;
  /** Arc length where this stroke began. */
  start: number;
};

type Pen = {
  /** The pointer (or the keyboard's pen), px in the container. */
  px: number;
  py: number;
  /** The nib, trailing it by `smoothing`. */
  hx: number;
  hy: number;
  moved: number;
  over: boolean;
  /** Touch: the finger is down. */
  down: boolean;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  tick: (now: number) => void;
  measure: () => void;
  intro: () => void;
  settle: () => void;
  reset: () => void;
};

/**
 * A container whose pointer writes a phrase. The phrase is laid along the
 * pointer's recent path, its letters spaced by arc length — their own advance
 * widths plus `spacing` — and each turned to the path's tangent, measured
 * across its own width so the angle stays smooth. The pen is at the end of
 * the sentence: as the pointer travels, letters leave their line one by one
 * and join the trail at the nib, wet in the accent colour, drying to the type
 * colour a few em back, the tail fading and shrinking by `tail`. The nib
 * follows the pointer through a light critically damped smoothing, and the
 * path is a ring of points pruned to just over the phrase.
 *
 * When the pointer rests, the phrase gathers into a neat line under it: each
 * letter blends from its place on the path to its slot on springs.snap — one
 * crisp overshoot as it rights itself — cascade-staggered from the nib back;
 * moving again releases them onto the path on springs.glide. Leaving sends the
 * phrase to its resting line on springs.glide. On first view a ghost pen
 * writes it once along a seeded S, so the piece reads before anyone touches
 * it. Touch drags write the same trail. The container can take focus: arrows
 * move a visible pen that writes, Enter gathers under it, Escape sends the
 * phrase home. The phrase is read once; the letters are aria-hidden and never
 * take a click. Under reduced motion nothing travels: the gathered line
 * cross-fades to wherever the pointer comes to rest.
 */
export function TypeTrail({
  text,
  children,
  as: Tag = "div",
  spacing = 0.06,
  tail = 0.6,
  size = "md",
  smoothing = 0.35,
  gatherAfter = 160,
  rest = "bottom",
  color = "var(--foreground)",
  accent = "var(--accent-bright)",
  trigger = "inView",
  once = true,
  delay = 300,
  onComplete,
  onStateChange,
  keyboard = true,
  disabled = false,
  className,
}: TypeTrailProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const phraseId = `${uid}-phrase`;
  const hintId = `${uid}-hint`;
  const scale = SCALE[size] ?? 1.1;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const running = onScreen && !hidden;
  const [penShown, setPenShown] = React.useState(false);

  const run = React.useMemo(() => {
    const chars = graphemes(text);
    return {
      chars,
      letters: chars.map((): Letter => ({
        x: motionValue(0),
        y: motionValue(0),
        rotate: motionValue(0),
        scale: motionValue(1),
        opacity: motionValue(0),
        color: motionValue(color),
        g: motionValue(1),
      })),
    };
    // A colour change repaints through the frame loop; the letters are the text's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const veil = useMotionValue(1);
  /** Letters turn about the middle of their baseline, wherever the font puts it. */
  const pivot = useMotionValue("80%");
  const caretX = useMotionValue(0);
  const caretY = useMotionValue(0);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const rowRef = React.useRef<HTMLSpanElement | null>(null);
  const markRef = React.useRef<HTMLSpanElement | null>(null);
  const widths = React.useRef<number[]>([]);
  const starts = React.useRef<number[]>([]);
  const metrics = React.useRef({
    w: 1,
    h: 1,
    em: 16,
    baseline: 12,
    total: 0,
  });
  const path = React.useRef<Path>({
    xs: new Float64Array(CAP),
    ys: new Float64Array(CAP),
    ss: new Float64Array(CAP),
    n: 0,
    start: 0,
  });
  const pen = React.useRef<Pen>({
    px: 0,
    py: 0,
    hx: 0,
    hy: 0,
    moved: 0,
    over: false,
    down: false,
  });
  /** Each letter's anchor (the line it leaves or joins) and its last pose. */
  const anchors = React.useRef<Pose[]>([]);
  const poses = React.useRef<Pose[]>([]);
  const written = React.useRef<boolean[]>([]);
  /** Where each letter starts a gather from; cleared when it rejoins the path. */
  const freeze = React.useRef<(Pose | undefined)[]>([]);
  const timers = React.useRef<number[]>([]);
  /** The keyboard's pen stroke, and where the arrows have sent it: presses add up, however fast. */
  const keyPen = React.useRef<AnimationPlaybackControls | null>(null);
  const keyGoal = React.useRef({ x: 0, y: 0 });
  const state = React.useRef<TypeTrailState>("rest");
  const gathering = React.useRef(false);
  const flights = React.useRef<AnimationPlaybackControls[]>([]);
  const intro = React.useRef<{
    run: AnimationPlaybackControls | null;
    done: boolean;
  }>({ run: null, done: false });
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onComplete, onStateChange });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const setState = (next: TypeTrailState) => {
    if (state.current === next) return;
    state.current = next;
    report.current.onStateChange?.(next);
  };

  const stopFlights = () => {
    for (const f of flights.current) f.stop();
    flights.current = [];
  };

  /* ── the path ── */

  const append = (x: number, y: number) => {
    const p = path.current;
    if (p.n > 0) {
      const lx = p.xs[p.n - 1] ?? x;
      const ly = p.ys[p.n - 1] ?? y;
      const d = Math.hypot(x - lx, y - ly);
      if (d < 1.5) return;
      if (p.n === CAP) {
        // Full: keep the newest half. Arc lengths stay as they were.
        const half = CAP / 2;
        p.xs.copyWithin(0, half);
        p.ys.copyWithin(0, half);
        p.ss.copyWithin(0, half);
        p.n = half;
      }
      p.xs[p.n] = x;
      p.ys[p.n] = y;
      p.ss[p.n] = (p.ss[p.n - 1] ?? 0) + d;
      p.n += 1;
      return;
    }
    p.xs[0] = x;
    p.ys[0] = y;
    p.ss[0] = 0;
    p.n = 1;
    p.start = 0;
  };

  /** Where along the path an arc length falls, written into `out` at `at`. */
  const pointAt = (s: number, out: Float64Array, at: number) => {
    const p = path.current;
    let x = 0;
    let y = 0;
    if (p.n === 1 || (p.n > 1 && s <= (p.ss[0] ?? 0))) {
      x = p.xs[0] ?? 0;
      y = p.ys[0] ?? 0;
    } else if (p.n > 1 && s >= (p.ss[p.n - 1] ?? 0)) {
      x = p.xs[p.n - 1] ?? 0;
      y = p.ys[p.n - 1] ?? 0;
    } else if (p.n > 1) {
      let lo = 0;
      let hi = p.n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if ((p.ss[mid] ?? 0) <= s) lo = mid;
        else hi = mid;
      }
      const s0 = p.ss[lo] ?? 0;
      const s1 = p.ss[hi] ?? s0;
      const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
      x = lerp(p.xs[lo] ?? 0, p.xs[hi] ?? 0, t);
      y = lerp(p.ys[lo] ?? 0, p.ys[hi] ?? 0, t);
    }
    out[at] = x;
    out[at + 1] = y;
  };
  /** Scratch for the three points a letter needs each frame. */
  const scratch = React.useRef(new Float64Array(6));
  const ink = React.useRef<Pose>({ x: 0, y: 0, r: 0, s: 1, o: 1 });

  const head = () => {
    const p = path.current;
    return p.n ? (p.ss[p.n - 1] ?? 0) : 0;
  };

  /* ── layouts ── */

  /** A neat line centred on x with its baseline at y, scaled to fit the box. */
  const lineAt = (cx: number, by: number, show: boolean): Pose[] => {
    const m = metrics.current;
    const pad = m.em * 0.5;
    const fit = Math.min(1, (m.w - pad * 2) / Math.max(1, m.total));
    const width = m.total * fit;
    const x0 = clamp(cx - width / 2, pad, Math.max(pad, m.w - pad - width));
    const base = clamp(by, m.baseline * fit + pad * 0.5, m.h - pad * 0.6);
    return widths.current.map((w, i) => ({
      x: x0 + ((starts.current[i] ?? 0) + w / 2) * fit,
      y: base,
      r: 0,
      s: fit,
      o: show ? 1 : 0,
    }));
  };

  const restLine = (): Pose[] => {
    const m = metrics.current;
    const by =
      rest === "center" ? m.h / 2 + m.baseline * 0.35 : m.h - m.em * 0.75;
    return lineAt(m.w / 2, by, rest !== "hidden");
  };

  /** One letter on the path, from how far behind the nib it rides, into `ink`. */
  const onPath = (i: number, behind: number): Pose => {
    const m = metrics.current;
    const w = widths.current[i] ?? 0;
    const s = head() - behind;
    const q = scratch.current;
    pointAt(s, q, 0);
    pointAt(s - Math.max(2, w / 2), q, 2);
    pointAt(s + Math.max(2, w / 2), q, 4);
    const ex = (q[4] ?? 0) - (q[2] ?? 0);
    const ey = (q[5] ?? 0) - (q[3] ?? 0);
    const prev = poses.current[i]?.r;
    let r =
      Math.abs(ex) + Math.abs(ey) < 0.5
        ? (prev ?? 0)
        : (Math.atan2(ey, ex) * 180) / Math.PI;
    // Unwrapped against the last frame, so a letter never spins the long way.
    if (prev !== undefined) r = prev + wrap(r - prev);
    const k = clamp01(tail);
    const age = m.total > 0 ? clamp01(behind / m.total) : 0;
    const out = ink.current;
    out.x = q[0] ?? 0;
    out.y = q[1] ?? 0;
    out.r = r;
    out.s = 1 - k * 0.45 * Math.pow(age, 1.5);
    out.o = 1 - k * 0.85 * smoothstep(0.35, 1, age);
    return out;
  };

  /* ── the frame ── */

  const paint = () => {
    const m = metrics.current;
    const total = m.total;
    const written0 = Math.min(head() - path.current.start, total);
    const wet = m.em * 3;
    run.letters.forEach((L, i) => {
      const w = widths.current[i] ?? 0;
      const behind = written0 - ((starts.current[i] ?? 0) + w / 2);
      const anchor = anchors.current[i];
      if (!anchor) return;
      const g = L.g.get();
      // A letter blends from a frozen pose (gathering), from its place on the
      // path (written), or sits at its anchor (waiting for the pen).
      const frozen = freeze.current[i];
      const onInk =
        !frozen && behind >= 0 && path.current.n > 0 ? onPath(i, behind) : null;
      const from = frozen ?? onInk ?? anchor;
      // Wrapped before blending, so gathering rights a letter the short way.
      const fromR = onInk ? wrap(from.r) : from.r;
      const pose = (poses.current[i] ??= { x: 0, y: 0, r: 0, s: 1, o: 0 });
      pose.x = lerp(from.x, anchor.x, g);
      pose.y = lerp(from.y, anchor.y, g);
      pose.r = lerp(fromR, anchor.r, g);
      pose.s = lerp(from.s, anchor.s, g);
      pose.o = clamp01(lerp(from.o, anchor.o, g));
      L.x.set(r2(pose.x - w / 2));
      L.y.set(r2(pose.y - m.baseline));
      L.rotate.set(r2(pose.r));
      L.scale.set(r2(pose.s));
      L.opacity.set(r2(pose.o));
      // Kept unwrapped while it rides the path, for the next frame's tangent.
      if (onInk && g < 0.001) pose.r = from.r;
      const fresh = onInk ? clamp01(1 - behind / wet) * (1 - clamp01(g)) : 0;
      L.color.set(
        fresh > 0.01
          ? `color-mix(in oklab, ${accent} ${Math.round(fresh * 100)}%, ${color})`
          : color,
      );
    });
  };

  const animating = () =>
    run.letters.some((L) => L.g.isAnimating()) || veil.isAnimating();

  const tick = (now: number) => {
    frame.current = 0;
    if (!running) {
      last.current = 0;
      return;
    }
    const dt = last.current ? Math.min(0.05, (now - last.current) / 1000) : 0;
    last.current = now;
    const p = pen.current;
    const writing = state.current === "writing";
    if (writing && motionSafe) {
      // The nib trails the pointer on a critically damped follow.
      const tau = clamp01(smoothing) * 0.09;
      const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
      p.hx = lerp(p.hx, p.px, k);
      p.hy = lerp(p.hy, p.py, k);
      append(p.hx, p.hy);
      // Letters reached by the pen leave their line for it.
      const total = metrics.current.total;
      const done = Math.min(head() - path.current.start, total);
      run.letters.forEach((L, i) => {
        if (written.current[i]) return;
        const w = widths.current[i] ?? 0;
        if (done < (starts.current[i] ?? 0) + w / 2) return;
        written.current[i] = true;
        freeze.current[i] = undefined;
        const pose = poses.current[i];
        // A hidden letter is born at the nib, small; a seen one flies over.
        if (pose && pose.o < 0.05) {
          anchors.current[i] = { x: p.hx, y: p.hy, r: 0, s: 0.4, o: 0 };
        }
        flights.current.push(animate(L.g, 0, springs.glide));
      });
    }
    paint();
    // Resting long enough under the pointer: gather.
    if (
      writing &&
      !p.down &&
      now - p.moved > Math.max(0, gatherAfter) &&
      !gathering.current
    ) {
      gatherUnder();
    }
    if ((writing && !gathering.current) || animating()) {
      frame.current = window.requestAnimationFrame(loop);
    } else {
      last.current = 0;
    }
  };

  const kick = () => {
    if (frame.current || !running) return;
    last.current = 0;
    frame.current = window.requestAnimationFrame(loop);
  };

  /**
   * Send every letter to a line, nib first: each blends from a frozen copy of
   * where it is now to its slot, so nothing jumps whatever it was doing.
   */
  const gatherTo = (
    line: Pose[],
    spring: typeof springs.snap | typeof springs.glide,
  ) => {
    stopFlights();
    const n = run.letters.length;
    const gap = cascade(n);
    run.letters.forEach((L, i) => {
      const target = line[i];
      if (!target) return;
      const now = poses.current[i] ?? target;
      freeze.current[i] = { ...now, r: wrap(now.r) };
      anchors.current[i] = target;
      L.g.jump(0);
      flights.current.push(
        animate(L.g, 1, { ...spring, delay: (n - 1 - i) * gap }),
      );
    });
    kick();
  };

  const gatherUnder = () => {
    const p = pen.current;
    gathering.current = true;
    const m = metrics.current;
    if (!motionSafe) {
      fadeTo(lineAt(p.px, p.py + m.em * UNDER, true));
    } else {
      gatherTo(lineAt(p.hx, p.hy + m.em * UNDER, true), springs.snap);
    }
    setState("gathered");
  };

  const goHome = () => {
    gathering.current = true;
    pen.current.over = false;
    if (!motionSafe) {
      fadeTo(restLine());
    } else {
      gatherTo(restLine(), springs.glide);
    }
    setState("rest");
  };

  /** Reduced motion: the line fades out, moves while unseen, fades back. */
  const fadeTo = (line: Pose[]) => {
    stopFlights();
    flights.current.push(
      animate(veil, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          run.letters.forEach((L, i) => {
            const target = line[i];
            if (!target) return;
            anchors.current[i] = target;
            freeze.current[i] = undefined;
            L.g.jump(1);
          });
          path.current.n = 0;
          paint();
          flights.current.push(
            animate(veil, 1, { duration: durations.base, ease: easings.enter }),
          );
        },
      }),
    );
    kick();
  };

  /** A stroke begins: the pen is set down here. */
  const begin = (x: number, y: number) => {
    stopFlights();
    const p = pen.current;
    p.px = x;
    p.py = y;
    p.hx = x;
    p.hy = y;
    p.moved = performance.now();
    gathering.current = false;
    if (!motionSafe) {
      // Nothing travels: the line steps out of sight while the pen moves.
      setState("writing");
      flights.current.push(
        animate(veil, 0, { duration: durations.fast, ease: easings.exit }),
      );
      kick();
      return;
    }
    // Every letter waits where it is — its anchor — until the pen reaches it.
    run.letters.forEach((L, i) => {
      const pose = poses.current[i];
      if (pose) anchors.current[i] = { ...pose, r: wrap(pose.r) };
      freeze.current[i] = undefined;
      L.g.jump(1);
      written.current[i] = false;
    });
    path.current.n = 0;
    append(x, y);
    path.current.start = 0;
    setState("writing");
    kick();
  };

  /** The pen moved: keep writing, or release a gathered phrase back onto the path. */
  const moveTo = (x: number, y: number) => {
    const p = pen.current;
    p.px = x;
    p.py = y;
    p.moved = performance.now();
    if (!motionSafe) {
      if (state.current !== "writing") {
        setState("writing");
        gathering.current = false;
        stopFlights();
        flights.current.push(
          animate(veil, 0, { duration: durations.fast, ease: easings.exit }),
        );
      }
      kick();
      return;
    }
    if (state.current === "rest") {
      begin(x, y);
      return;
    }
    if (gathering.current) {
      // Released: each letter leaves its slot for its place on the path,
      // nib first; any the pen has not reached yet wait in the line.
      gathering.current = false;
      stopFlights();
      const n = run.letters.length;
      const gap = cascade(n);
      const done = Math.min(head() - path.current.start, metrics.current.total);
      run.letters.forEach((L, i) => {
        const now = poses.current[i];
        if (now) anchors.current[i] = { ...now, r: wrap(now.r) };
        freeze.current[i] = undefined;
        L.g.jump(1);
        const w = widths.current[i] ?? 0;
        const reached = done >= (starts.current[i] ?? 0) + w / 2;
        written.current[i] = reached;
        if (!reached) return;
        flights.current.push(
          animate(L.g, 0, { ...springs.glide, delay: (n - 1 - i) * gap }),
        );
      });
      setState("writing");
    }
    kick();
  };

  /* ── the ghost pen ── */

  const playIntro = () => {
    const m = metrics.current;
    if (!motionSafe || disabled || m.total <= 0 || pen.current.over) return;
    intro.current.run?.stop();
    const x0 = m.w * 0.08;
    const x1 = m.w * 0.9;
    const y0 = m.h * 0.5;
    const amp = Math.min(m.h * 0.18, m.em * 2.2);
    const at = (t: number): [number, number] => [
      lerp(x0, x1, t),
      y0 + amp * Math.sin(Math.PI * 2 * t * 0.9 + 0.4),
    ];
    let started = false;
    intro.current.run = animate(0, 1, {
      duration: 1.7,
      ease: easings.move,
      delay: Math.max(0, delay) / 1000,
      onUpdate: (t) => {
        if (pen.current.over) return;
        const [x, y] = at(t);
        // The pen is set down only when it starts to move.
        if (!started) {
          started = true;
          begin(x, y);
          return;
        }
        moveTo(x, y);
      },
      onComplete: () => {
        intro.current.done = true;
        if (pen.current.over) return;
        // A beat under the pen, then home.
        const settle = window.setTimeout(
          () => {
            if (pen.current.over) return;
            goHome();
            report.current.onComplete?.();
          },
          Math.max(0, gatherAfter) + 520,
        );
        timers.current.push(settle);
      },
    });
  };

  /* ── measurement ── */

  const measure = () => {
    const root = rootRef.current;
    const row = rowRef.current;
    const mark = markRef.current;
    if (!root || !row || !mark) return;
    const m = metrics.current;
    m.w = Math.max(1, root.clientWidth);
    m.h = Math.max(1, root.clientHeight);
    m.em = parseFloat(getComputedStyle(row).fontSize) || 16;
    m.baseline = mark.offsetTop;
    pivot.set(`${r2(m.baseline)}px`);
    const gap = spacing * m.em;
    const ws: number[] = [];
    const ss: number[] = [];
    let at = 0;
    Array.from(row.children).forEach((child) => {
      if (child === mark) return;
      const w = (child as HTMLElement).offsetWidth;
      ws.push(w);
      ss.push(at);
      at += w + gap;
    });
    widths.current = ws;
    starts.current = ss;
    m.total = Math.max(0, at - gap);
    if (state.current === "rest") {
      const line = restLine();
      run.letters.forEach((L, i) => {
        const target = line[i];
        if (!target) return;
        anchors.current[i] = target;
        poses.current[i] = { ...target };
        freeze.current[i] = undefined;
        L.g.jump(1);
      });
      path.current.n = 0;
      paint();
    }
  };

  React.useLayoutEffect(() => {
    api.current = {
      tick,
      measure,
      intro: playIntro,
      settle: goHome,
      reset: () => {
        stopFlights();
        keyPen.current?.stop();
        freeze.current = [];
        written.current = run.letters.map(() => false);
        gathering.current = false;
        pen.current.over = false;
        setState("rest");
      },
    };
    report.current = { onComplete, onStateChange };
  });

  // A new phrase or layout starts at rest, and says so.
  React.useLayoutEffect(() => {
    api.current?.reset();
    api.current?.measure();
  }, [run, size, spacing, rest]);

  // Size, font and visibility, bound to the nodes when they arrive.
  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindRow = React.useCallback((node: HTMLSpanElement | null) => {
    rowRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  // The ghost pen: once in view (or on mount), and again on each return
  // unless `once`.
  const due =
    trigger === "mount" ? true : trigger === "inView" ? onScreen : false;
  React.useEffect(() => {
    if (!due) {
      if (!once) intro.current.done = false;
      return;
    }
    if (intro.current.done || intro.current.run) return;
    api.current?.intro();
  }, [due, once]);

  React.useEffect(() => {
    if (running) {
      if (frame.current === 0) {
        last.current = 0;
        frame.current = window.requestAnimationFrame(loop);
      }
    } else if (frame.current) {
      window.cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
  }, [running, loop]);

  React.useEffect(() => {
    const f = flights;
    const t = timers;
    const i = intro;
    const loopFrame = frame;
    return () => {
      for (const a of f.current) a.stop();
      f.current = [];
      for (const id of t.current) window.clearTimeout(id);
      t.current = [];
      i.current.run?.stop();
      i.current.run = null;
      if (loopFrame.current) window.cancelAnimationFrame(loopFrame.current);
      loopFrame.current = 0;
    };
  }, []);

  /* ── input ── */

  const local = (event: React.PointerEvent<HTMLElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - r.left - event.currentTarget.clientLeft,
      y: event.clientY - r.top - event.currentTarget.clientTop,
    };
  };

  const takeOver = () => {
    // The visitor's hand outranks the ghost pen.
    intro.current.run?.stop();
    intro.current.run = null;
    intro.current.done = true;
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  const onPointerEnter = (event: React.PointerEvent<HTMLElement>) => {
    if (disabled || event.pointerType === "touch") return;
    takeOver();
    const p = local(event);
    pen.current.over = true;
    begin(p.x, p.y);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (disabled) return;
    if (event.pointerType === "touch" && !pen.current.down) return;
    if (!pen.current.over) {
      takeOver();
      pen.current.over = true;
      const p = local(event);
      begin(p.x, p.y);
      return;
    }
    const p = local(event);
    moveTo(p.x, p.y);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLElement>) => {
    if (disabled || event.pointerType === "touch") return;
    if (!pen.current.over) return;
    goHome();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (disabled || event.pointerType !== "touch") return;
    takeOver();
    pen.current.down = true;
    pen.current.over = true;
    const p = local(event);
    begin(p.x, p.y);
  };

  const lift = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch" || !pen.current.down) return;
    pen.current.down = false;
    // The finger lifted: gather under where it was.
    if (state.current === "writing") gatherUnder();
  };

  /** The keyboard's pen: a caret the arrows walk, writing as it goes. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled || !keyboard || event.target !== event.currentTarget) return;
    const m = metrics.current;
    const p = pen.current;
    if (event.key === "Escape") {
      if (state.current === "rest") return;
      event.preventDefault();
      keyPen.current?.stop();
      p.over = false;
      goHome();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (state.current === "writing") gatherUnder();
      return;
    }
    const step = m.em * (event.shiftKey ? 4 : 1);
    const dx =
      event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    const dy =
      event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    takeOver();
    const goal = keyGoal.current;
    if (!p.over || state.current === "rest") {
      p.over = true;
      const start = poses.current[0];
      begin(start ? start.x : m.w / 2, start ? start.y - m.em : m.h / 2);
      goal.x = p.px;
      goal.y = p.py;
    }
    goal.x = clamp(goal.x + dx, m.em * 0.5, m.w - m.em * 0.5);
    goal.y = clamp(goal.y + dy, m.em * 0.5, m.h - m.em * 0.5);
    keyPen.current?.stop();
    const to = { x: goal.x, y: goal.y };
    if (!motionSafe) {
      caretX.set(r2(to.x));
      caretY.set(r2(to.y));
      moveTo(to.x, to.y);
      return;
    }
    // The pen travels to the goal, so it draws a stroke, not a jump; the
    // caret rides it.
    const from = { x: p.px, y: p.py };
    keyPen.current = animate(0, 1, {
      duration: durations.base,
      ease: easings.enter,
      onUpdate: (t) => {
        const x = lerp(from.x, to.x, t);
        const y = lerp(from.y, to.y, t);
        caretX.set(r2(x));
        caretY.set(r2(y));
        moveTo(x, y);
      },
    });
  };

  // The pen's caret starts where the phrase rests.
  const onFocus = (event: React.FocusEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    const visible = event.currentTarget.matches(":focus-visible");
    setPenShown(visible);
    if (!visible) return;
    const m = metrics.current;
    const start = poses.current[0];
    const x = state.current === "rest" || !start ? m.w / 2 : pen.current.px;
    const y =
      state.current === "rest" || !start
        ? (start?.y ?? m.h / 2) - m.em
        : pen.current.py;
    pen.current.px = x;
    pen.current.py = y;
    keyGoal.current = { x, y };
    caretX.set(r2(x));
    caretY.set(r2(y));
  };

  const onBlur = (event: React.FocusEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    setPenShown(false);
    keyPen.current?.stop();
  };

  React.useEffect(() => {
    const k = keyPen;
    return () => k.current?.stop();
  }, []);

  return (
    <Tag
      ref={bindRoot as React.Ref<never>}
      tabIndex={keyboard && !disabled ? 0 : undefined}
      role={keyboard ? "group" : undefined}
      aria-labelledby={keyboard ? phraseId : undefined}
      aria-describedby={keyboard && !disabled ? hintId : undefined}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerUp={lift}
      onPointerCancel={lift}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "relative isolate block overflow-clip",
        // Sideways drags write; vertical swipes still scroll the page.
        !disabled && "touch-pan-y",
        keyboard &&
          "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <div className="relative z-0 h-full">{children}</div>
      {keyboard ? (
        <span id={phraseId} hidden>
          {text}
        </span>
      ) : (
        <span className="sr-only">{text}</span>
      )}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 select-none"
        style={{ fontSize: `${scale}em`, opacity: veil }}
      >
        {/* Measured, never seen: each grapheme's advance and the baseline. */}
        <span
          ref={bindRow}
          className="invisible absolute top-0 left-0 whitespace-pre"
        >
          <span ref={markRef} className="inline-block size-0 align-baseline" />
          {run.chars.map((ch, i) => (
            <span key={i} className="inline-block whitespace-pre">
              {ch}
            </span>
          ))}
        </span>
        {run.chars.map((ch, i) => {
          const L = run.letters[i] as Letter;
          return (
            <motion.span
              key={i}
              className="absolute top-0 left-0 inline-block whitespace-pre"
              style={{
                x: L.x,
                y: L.y,
                rotate: L.rotate,
                scale: L.scale,
                opacity: L.opacity,
                color: L.color,
                originX: "50%",
                originY: pivot,
              }}
            >
              {ch}
            </motion.span>
          );
        })}
        {keyboard ? (
          <motion.span
            className={cn(
              "absolute top-0 left-0 h-[1.1em] w-[2px] -translate-x-1/2 -translate-y-full rounded-full transition-opacity duration-150",
              penShown ? "opacity-100" : "opacity-0",
            )}
            style={{ x: caretX, y: caretY, backgroundColor: accent }}
          />
        ) : null}
      </motion.div>
      {keyboard && !disabled ? (
        <span id={hintId} className="sr-only">
          Use the arrow keys to move a pen that writes the phrase; Enter gathers
          it under the pen and Escape sends it back.
        </span>
      ) : null}
    </Tag>
  );
}
