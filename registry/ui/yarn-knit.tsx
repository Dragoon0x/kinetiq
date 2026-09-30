"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type YarnFibre = "wool" | "cotton" | "mohair";
export type YarnColour = "rose" | "sage" | "navy";

export type YarnKnitProps = {
  /** What is being worked on. The loader's accessible name, and shown beside the glyph unless `hideLabel`. @default "Loading" */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The glyph's box in px. Detail simplifies below 40 and below 24. @default 24 */
  size?: number;
  /** How fast it knits, 0.5 to 2. @default 1 */
  speed?: number;
  /** The fibre, which sets how the yarn looks and how it springs. @default "wool" */
  yarn?: YarnFibre;
  /** The yarn's colour, the same in both themes. @default "rose" */
  colour?: YarnColour;
  /** Determinate, 0 to 1: how much of the row is knitted. Without it the row knits and unravels on its own. */
  progress?: number;
  /** A loop was pulled by hand or by key. */
  onTug?: () => void;
  /** Play the needles taking a pulled loop. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep knitting, but refuse the hand: the glyph is a picture, not a button. @default false */
  disabled?: boolean;
  className?: string;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Pt = { x: number; y: number };
const pt = (p: Pt) => `${r2(p.x)} ${r2(p.y)}`;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** The drawing's box: 64 units, scaled to `size`. */
const BOX = 64;
const FLOOR = 62;

type Tier = {
  /** Stitches a full row holds. */
  n: number;
  x0: number;
  /** Stitch width. */
  sw: number;
  /** The holding needle's y. */
  ny: number;
  needleW: number;
  /** How far a stitch hangs below the needle. */
  drop: number;
  yarnW: number;
  ballR: number;
  ballX: number;
  knob: number;
  rows: number;
  strands: number;
  tipLen: number;
  endLen: number;
  loopR: number;
  detail: boolean;
};

// Strokes stay at least a pixel wide at every size: under 24px the glyph
// keeps four big stitches and one wrap; 40px and up it has two rows and the
// fibre's own detail.
const TIERS: Tier[] = [
  {
    n: 4,
    x0: 8,
    sw: 10,
    ny: 15,
    needleW: 4.2,
    drop: 13,
    yarnW: 4.4,
    ballR: 13.5,
    ballX: 47,
    knob: 0,
    rows: 1,
    strands: 1,
    tipLen: 7,
    endLen: 11,
    loopR: 3.6,
    detail: false,
  },
  {
    n: 6,
    x0: 9,
    sw: 6.8,
    ny: 14,
    needleW: 2.8,
    drop: 11,
    yarnW: 3,
    ballR: 12,
    ballX: 47,
    knob: 3.2,
    rows: 1,
    strands: 3,
    tipLen: 7,
    endLen: 12,
    loopR: 3,
    detail: false,
  },
  {
    n: 8,
    x0: 10,
    sw: 5,
    ny: 13,
    needleW: 1.9,
    drop: 8.5,
    yarnW: 2.2,
    ballR: 11.5,
    ballX: 47,
    knob: 2.4,
    rows: 2,
    strands: 6,
    tipLen: 7,
    endLen: 13,
    loopR: 2.4,
    detail: true,
  },
];

type Fibre = {
  /** Strand width as a share of the tier's yarn width. */
  width: number;
  /** How far the yarn hangs between needle and ball, per unit of span. */
  sag: number;
  /** How the yarn springs back: the fibre's feel. */
  spring: Transition;
  pitch: number;
  /** Wraps on the ball: rotation and how open each ellipse is. */
  wraps: [number, number][];
  wrapW: number;
  halo: boolean;
  ply: boolean;
  fuzz: boolean;
};

const FIBRES: Record<YarnFibre, Fibre> = {
  // Springy and even: the snap spring, a ply twist dashed along the strand.
  wool: {
    width: 1,
    sag: 0.16,
    spring: springs.snap,
    pitch: 1,
    wraps: [
      [-28, 0.36],
      [18, 0.62],
      [64, 0.3],
      [-74, 0.56],
    ],
    wrapW: 0.9,
    halo: false,
    ply: true,
    fuzz: false,
  },
  // Taut and smooth: thin, bright, wound tight, back in a flick.
  cotton: {
    width: 0.72,
    sag: 0.1,
    spring: springs.flick,
    pitch: 1.25,
    wraps: [
      [-36, 0.22],
      [-36, 0.5],
      [-36, 0.78],
      [42, 0.3],
      [42, 0.64],
      [86, 0.46],
    ],
    wrapW: 0.5,
    halo: false,
    ply: false,
    fuzz: false,
  },
  // Soft and lazy: a halo drawn as a wide faint stroke (no blur), loose
  // fibres round the ball, more sag, and the slow drift spring.
  mohair: {
    width: 0.85,
    sag: 0.24,
    spring: springs.drift,
    pitch: 0.85,
    wraps: [
      [-30, 0.42],
      [30, 0.6],
      [80, 0.34],
    ],
    wrapW: 0.8,
    halo: true,
    ply: false,
    fuzz: true,
  },
};

// Pigments at fixed lightness: yarn is a dyed object, the same in both
// themes. The needles are theme ink.
const COLOURS: Record<
  YarnColour,
  { body: string; dark: string; light: string }
> = {
  rose: {
    body: "oklch(0.7 0.13 8)",
    dark: "oklch(0.55 0.13 8)",
    light: "oklch(0.85 0.08 12)",
  },
  sage: {
    body: "oklch(0.72 0.075 148)",
    dark: "oklch(0.55 0.07 148)",
    light: "oklch(0.87 0.05 140)",
  },
  navy: {
    body: "oklch(0.5 0.11 262)",
    dark: "oklch(0.37 0.1 262)",
    light: "oklch(0.68 0.08 258)",
  },
};

/** The working needle leans up and to the right. */
const LEAN = {
  x: Number(Math.cos(-0.91).toFixed(6)),
  y: Number(Math.sin(-0.91).toFixed(6)),
};

/** A quadratic from p0 through c to p1, cut at t: the part a growing stitch has drawn. */
function quadPart(p0: Pt, c: Pt, p1: Pt, t: number): string {
  const q0 = { x: lerp(p0.x, c.x, t), y: lerp(p0.y, c.y, t) };
  const q1 = { x: lerp(c.x, p1.x, t), y: lerp(c.y, p1.y, t) };
  const end = { x: lerp(q0.x, q1.x, t), y: lerp(q0.y, q1.y, t) };
  return `M ${pt(p0)} Q ${pt(q0)} ${pt(end)} `;
}

/** The row on the needle: V legs in front, loops behind, a paler row under. */
function rowPaths(T: Tier, k: number) {
  let legs = "";
  let loops = "";
  let lower = "";
  const whole = Math.floor(k);
  for (let i = 0; i < T.n; i += 1) {
    const f = i < whole ? 1 : i === whole ? k - whole : 0;
    if (f < 0.02) break;
    const xi = T.x0 + i * T.sw;
    const inset = T.sw * 0.14;
    const top = T.ny + T.needleW * 0.5 + 0.4;
    const a = { x: xi + inset, y: top };
    const c = { x: xi + T.sw - inset, y: top };
    const bottom = { x: xi + T.sw / 2, y: T.ny + T.drop };
    const bowL = { x: xi + inset * 0.2, y: T.ny + T.drop * 0.62 };
    const bowR = { x: xi + T.sw - inset * 0.2, y: T.ny + T.drop * 0.62 };
    legs += quadPart(a, bowL, bottom, f) + quadPart(c, bowR, bottom, f);
    const lift = T.needleW * 0.5 + 1.8 * Math.min(1, f * 3);
    loops += `M ${pt(a)} C ${r2(a.x)} ${r2(T.ny - lift)} ${r2(c.x)} ${r2(T.ny - lift)} ${pt(c)} `;
    if (T.rows > 1) {
      const dy = T.drop - 1.4;
      lower +=
        quadPart(
          { x: a.x, y: a.y + dy },
          { x: bowL.x, y: bowL.y + dy },
          { x: bottom.x, y: bottom.y + dy },
          f,
        ) +
        quadPart(
          { x: c.x, y: c.y + dy },
          { x: bowR.x, y: bowR.y + dy },
          { x: bottom.x, y: bottom.y + dy },
          f,
        );
    }
  }
  return { legs: legs.trim(), loops: loops.trim(), lower: lower.trim() };
}

/** The point on a ball's surface that faces `toward`. */
function onBall(c: Pt, r: number, toward: Pt): Pt {
  const d = dist(c, toward) || 1;
  return {
    x: c.x + ((toward.x - c.x) / d) * r,
    y: c.y + ((toward.y - c.y) / d) * r,
  };
}

type Scene = {
  needle: string;
  knobX: number;
  knobY: number;
  thread: string;
  loopX: number;
  loopY: number;
  loopR: number;
  ballX: number;
  ballY: number;
  ballScale: number;
  ballTurn: number;
};

/**
 * Everything that moves, from five numbers: stitches knitted, the working
 * needle's stab, the thread's tug on the ball, and the pull on the yarn.
 */
function sceneOf(
  T: Tier,
  F: Fibre,
  k: number,
  stab: number,
  tug: number,
  px: number,
  py: number,
): Scene {
  const frac = clamp(k / T.n, 0, 1);
  const cross = { x: T.x0 + k * T.sw + 1.5, y: T.ny };
  const push = stab * 3;
  const tip = {
    x: cross.x - LEAN.x * (T.tipLen + push),
    y: cross.y - LEAN.y * (T.tipLen + push),
  };
  const end = {
    x: cross.x + LEAN.x * (T.endLen - push),
    y: cross.y + LEAN.y * (T.endLen - push),
  };
  const half = T.needleW / 2;
  // The working needle, tapered to its point.
  const nx = -LEAN.y * half;
  const ny = LEAN.x * half;
  const shoulder = {
    x: tip.x + LEAN.x * 3,
    y: tip.y + LEAN.y * 3,
  };
  const needle = `M ${pt(tip)} L ${pt({ x: shoulder.x + nx, y: shoulder.y + ny })} L ${pt({ x: end.x + nx, y: end.y + ny })} L ${pt({ x: end.x - nx, y: end.y - ny })} L ${pt({ x: shoulder.x - nx, y: shoulder.y - ny })} Z`;

  // The ball shrinks as it pays out, rolls toward the work, and jerks when
  // a stitch pulls on it.
  const R = T.ballR * (1 - 0.2 * frac);
  let cx = T.ballX - 3.5 * frac - tug * 1.4;
  const cy = FLOOR - R;
  const w = { x: tip.x + 0.4, y: tip.y + 0.6 };
  const rest = onBall({ x: cx, y: cy }, R, w);
  const span = dist(w, rest);
  const mid = {
    x: (w.x + rest.x) / 2,
    y: (w.y + rest.y) / 2 + F.sag * span,
  };
  const p = {
    x: clamp(mid.x + px, 2, BOX - 2),
    y: clamp(mid.y + py, 2, BOX - 2),
  };
  // Past its slack the pulled yarn drags the ball along the floor.
  const need =
    dist(w, p) + dist(p, rest) - (dist(w, mid) + dist(mid, rest)) - 3;
  if (need > 0) {
    cx += Math.sign(p.x - cx || 1) * rubberband(need * 0.7, 10);
  }
  cx = clamp(cx, R + 1, BOX - R - 1);
  const b = onBall({ x: cx, y: cy }, R, p);
  // Two curves meeting at the pull, sharing a tangent there, so a resting
  // yarn hangs smooth and a pulled one bends where the finger holds it.
  const chord = dist(w, b) || 1;
  const tx = (b.x - w.x) / chord;
  const ty = (b.y - w.y) / chord;
  const a1 = dist(w, p) * 0.5;
  const a2 = dist(p, b) * 0.5;
  const thread = `M ${pt(w)} Q ${pt({ x: p.x - tx * a1, y: p.y - ty * a1 })} ${pt(p)} Q ${pt({ x: p.x + tx * a2, y: p.y + ty * a2 })} ${pt(b)}`;

  const pulled = Math.hypot(px, py);
  const loopR = pulled > 0.5 ? Math.min(1, pulled / 10) * T.loopR : 0;
  const ux = pulled > 0.5 ? px / pulled : 0;
  const uy = pulled > 0.5 ? py / pulled : 0;

  return {
    needle,
    knobX: r2(end.x),
    knobY: r2(end.y),
    thread,
    loopX: r2(p.x + ux * loopR * 0.8),
    loopY: r2(p.y + uy * loopR * 0.8),
    loopR: r2(loopR),
    ballX: r2(cx),
    ballY: r2(cy),
    ballScale: Number((R / T.ballR).toFixed(4)),
    // Unwinding turns it one way; rolling turns it by distance over radius.
    ballTurn: r2(-k * 38 + ((cx - T.ballX) / R) * (180 / Math.PI)),
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageShown = () => !document.hidden;
const serverShown = () => true;

type Machine = {
  /** Stitches on the needle, free-running. */
  knit: number;
  mode: "d" | "i";
  phase: "knit" | "hold" | "unravel";
  /** Whole stitches the determinate row has shown, for the stab. */
  whole: number;
  dragging: boolean;
  /** A tug the keyboard (or a tap) is playing, not a hand. */
  keyTug: boolean;
  from: Pt;
  loop: number;
  timers: Set<number>;
  running: Map<string, AnimationPlaybackControls>;
};

type Api = {
  pump: () => void;
  halt: () => void;
  start: () => void;
  follow: () => void;
};

/**
 * An inline loader drawn as knitting. A needle holds a row of stitches; the
 * working needle crosses it at the last one and the yarn hangs from there
 * down to a ball on the floor. Each stitch, the working needle stabs in and
 * back, the new V grows down from the needle on the fibre's spring, and the
 * yarn tugs the ball, which jerks toward the work and rolls back, turning as
 * it unwinds and shrinking a little as the row grows. Given `progress`, the
 * row is that share knitted, a partial stitch growing smoothly; without it
 * the row knits to the end, holds, unravels, and starts again.
 *
 * The glyph is a button: drag the yarn and its middle follows the finger
 * 1:1, a loop forming where it is pinched and the ball paying out past the
 * slack; let go of a long pull and the needles take the loop with a click.
 * Free-running, that loop is the next stitch; determinate, it is wound back,
 * since the row is the work's. A tap, Enter or Space pulls one loop. The
 * loop runs only on screen in a visible page. Under reduced motion stitches
 * appear without the stab, the roll or the spring, and the row still grows.
 */
export function YarnKnit({
  label = "Loading",
  hideLabel = false,
  size = 24,
  speed = 1,
  yarn = "wool",
  colour = "rose",
  progress,
  onTug,
  sound = false,
  disabled = false,
  className,
}: YarnKnitProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const clipId = `yarn-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const seed = hash(uid);
  const S = Math.round(clamp(size, 12, 256));
  const tier = S < 24 ? 0 : S < 40 ? 1 : 2;
  const T = TIERS[tier] ?? (TIERS[2] as Tier);
  const F = FIBRES[yarn] ?? FIBRES.wool;
  const C = COLOURS[colour] ?? COLOURS.rose;
  const pace = clamp(speed, 0.5, 2);
  const determinate = progress !== undefined;
  const p = clamp(progress ?? 0, 0, 1);
  const target = r2(p * T.n);
  const strand = r2(T.yarnW * F.width);

  const [onScreen, setOnScreen] = React.useState(true);
  const pageVisible = React.useSyncExternalStore(
    subscribeVisibility,
    pageShown,
    serverShown,
  );
  const live = onScreen && pageVisible;

  // Free-running, the first paint already has a few stitches on the needle.
  const knitted = useMotionValue(determinate ? target : Math.min(3, T.n));
  const stab = useMotionValue(0);
  const tug = useMotionValue(0);
  const pullX = useMotionValue(0);
  const pullY = useMotionValue(0);

  const machine = React.useRef<Machine>({
    knit: Math.min(3, T.n),
    mode: determinate ? "d" : "i",
    phase: "knit",
    whole: Math.floor(target),
    dragging: false,
    keyTug: false,
    from: { x: 0, y: 0 },
    loop: 0,
    timers: new Set(),
    running: new Map(),
  });
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const next = () => api.current?.pump();

  const panNow = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const run = (key: string, controls: AnimationPlaybackControls) => {
    const m = machine.current;
    m.running.get(key)?.stop();
    m.running.set(key, controls);
  };

  const after = (ms: number, fn: () => void) => {
    const m = machine.current;
    const id = window.setTimeout(() => {
      m.timers.delete(id);
      fn();
    }, Math.round(ms));
    m.timers.add(id);
  };

  /** Straight to a value, whatever was animating it. */
  const jump = (key: string, mv: MotionValue<number>, v: number) => {
    const m = machine.current;
    m.running.get(key)?.stop();
    m.running.delete(key);
    mv.set(v);
  };

  const stopTimers = () => {
    const m = machine.current;
    window.clearTimeout(m.loop);
    m.loop = 0;
    for (const id of m.timers) window.clearTimeout(id);
    m.timers.clear();
  };

  /** The working needle stabs into the loop and draws back: two tweens. */
  const stabOnce = () => {
    if (!motionSafe || !live) return;
    const quick = 1 / Math.sqrt(pace);
    run(
      "stab",
      animate(stab, 1, {
        duration: 0.12 * quick,
        ease: easings.enter,
        onComplete: () =>
          run(
            "stab",
            animate(stab, 0, { duration: 0.16 * quick, ease: easings.move }),
          ),
      }),
    );
    run(
      "tug",
      animate(tug, 1, {
        duration: 0.09 * quick,
        ease: easings.enter,
        onComplete: () => run("tug", animate(tug, 0, springs.snap)),
      }),
    );
  };

  const click = (gain: number, delay: number) => {
    const pan = panNow();
    const play = () => audio.play("click", { pitch: r2(F.pitch), gain, pan });
    if (delay <= 0 || !motionSafe) play();
    else after(delay, play);
  };

  /** One stitch onto the row. Returns ms until it has landed. */
  const stitch = (hand: boolean): number => {
    const m = machine.current;
    if (hand) click(0.55, 120 / Math.sqrt(pace));
    if (m.knit >= T.n) return 0;
    m.knit += 1;
    if (!motionSafe || !live) {
      jump("knit", knitted, m.knit);
      return 0;
    }
    stabOnce();
    run("knit", animate(knitted, m.knit, { ...F.spring, delay: 0.06 }));
    return 300;
  };

  /** The row comes off the needle right to left and the ball winds it back. */
  const unravel = (): number => {
    const m = machine.current;
    const from = knitted.get();
    m.knit = 0;
    if (!motionSafe || !live) {
      jump("knit", knitted, 0);
      return 0;
    }
    const duration = (Math.max(1, from) * 0.07) / pace;
    run("knit", animate(knitted, 0, { duration, ease: "linear" }));
    return Math.round(duration * 1000);
  };

  const halt = () => {
    const m = machine.current;
    stopTimers();
    for (const c of m.running.values()) c.stop();
    m.running.clear();
    // Stopped means finished: everything lands where the state says.
    if (m.phase === "unravel") m.knit = 0;
    m.phase = "knit";
    // A key's tug cut short is finished, not lost: its loop is taken now.
    if (m.keyTug) {
      m.keyTug = false;
      m.dragging = false;
      if (m.mode === "i") m.knit += 1;
      audio.play("click", { pitch: r2(F.pitch), gain: 0.55, pan: panNow() });
      onTug?.();
    }
    m.knit = clamp(m.knit, 0, T.n);
    knitted.set(m.mode === "d" ? target : m.knit);
    stab.set(0);
    tug.set(0);
    if (!m.dragging) {
      pullX.set(0);
      pullY.set(0);
    }
  };

  /** The free-running rhythm: knit to the end, hold, unravel, again. */
  const pump = () => {
    const m = machine.current;
    window.clearTimeout(m.loop);
    m.loop = 0;
    if (determinate || !live || m.dragging || m.phase !== "knit") return;
    const cadence = (motionSafe ? 560 : 1100) / pace;
    if (m.knit < T.n) {
      m.loop = window.setTimeout(() => {
        api.current?.follow();
      }, Math.round(cadence));
      return;
    }
    m.phase = "hold";
    m.loop = window.setTimeout(
      () => {
        const held = machine.current;
        held.phase = "unravel";
        const end = unravel();
        held.loop = window.setTimeout(
          () => {
            machine.current.phase = "knit";
            next();
          },
          Math.round(end + 350 / pace),
        );
      },
      Math.round(600 / pace),
    );
  };

  /** The next free-running stitch, then the next beat. */
  const follow = () => {
    stitch(false);
    next();
  };

  const start = () => {
    const m = machine.current;
    const mode = determinate ? "d" : "i";
    if (m.mode !== mode) {
      m.mode = mode;
      m.phase = "knit";
      // Free-running again: it carries on from the stitches it has.
      m.knit = Math.round(knitted.get());
      m.whole = Math.floor(target);
    }
    m.knit = clamp(m.knit, 0, T.n);
    if (determinate) {
      run(
        "knit",
        animate(
          knitted,
          target,
          motionSafe && live ? springs.glide : { duration: 0 },
        ),
      );
    }
    pump();
  };

  /** A pull let go: the yarn springs back; a long one is a loop taken. */
  const release = (vx: number, vy: number, pulled: boolean) => {
    const m = machine.current;
    m.dragging = false;
    m.keyTug = false;
    if (motionSafe) {
      run("pullX", animate(pullX, 0, { ...F.spring, velocity: vx }));
      run("pullY", animate(pullY, 0, { ...F.spring, velocity: vy }));
    } else {
      jump("pullX", pullX, 0);
      jump("pullY", pullY, 0);
    }
    if (pulled) {
      if (determinate) {
        // The row is the work's: the loop is wound back, and the needles
        // knock once as the yarn goes taut.
        stabOnce();
        click(0.35, 90);
      } else {
        stitch(true);
        m.phase = "knit";
      }
      onTug?.();
    }
    next();
  };

  /** The keyboard's (and a tap's) tug: the yarn drawn out and let go. */
  const tugByKey = () => {
    const m = machine.current;
    if (disabled) return;
    stopTimers();
    m.dragging = true;
    m.keyTug = true;
    if (!motionSafe) {
      release(0, 0, true);
      return;
    }
    run("pullX", animate(pullX, -9, { duration: 0.18, ease: easings.enter }));
    run(
      "pullY",
      animate(pullY, 11, {
        duration: 0.18,
        ease: easings.enter,
        onComplete: () => after(70, () => release(0, 0, true)),
      }),
    );
  };

  const units = BOX / S;
  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: () => {
      const m = machine.current;
      stopTimers();
      m.dragging = true;
      m.keyTug = false;
      m.running.get("pullX")?.stop();
      m.running.get("pullY")?.stop();
      m.from = { x: pullX.get(), y: pullY.get() };
    },
    onMove: ({ offset }) => {
      const m = machine.current;
      const x = m.from.x + offset.x * units;
      const y = m.from.y + offset.y * units;
      // The yarn gives freely at first, then stiffens: never a hard stop.
      const len = Math.hypot(x, y);
      const give = len > 16 ? (16 + rubberband(len - 16, 14)) / len : 1;
      pullX.set(r2(x * give));
      pullY.set(r2(y * give));
    },
    onEnd: ({ velocity }) => {
      const x = pullX.get();
      const y = pullY.get();
      const vx = velocity.x * units;
      const vy = velocity.y * units;
      const reach = Math.hypot(project(x, vx, 0.99), project(y, vy, 0.99));
      release(vx, vy, reach > 8);
    },
    onCancel: () => release(0, 0, false),
    onTap: () => tugByKey(),
  });

  React.useEffect(() => {
    api.current = { pump, halt, start, follow };
  });

  // The loop lives while the glyph is on screen in a visible page; stopping
  // lands every part, so a StrictMode re-run or a scroll resumes cleanly.
  React.useEffect(() => {
    const now = api.current;
    now?.start();
    return () => now?.halt();
  }, [live, motionSafe, determinate, T.n]);

  // Determinate: the row goes where the progress says, and the working
  // needle stabs each time a whole stitch completes.
  React.useEffect(() => {
    const m = machine.current;
    if (!determinate) return;
    const whole = Math.floor(target);
    const stabbed = whole > m.whole;
    m.whole = whole;
    if (!motionSafe || !live) {
      jump("knit", knitted, target);
      return;
    }
    run("knit", animate(knitted, target, springs.glide));
    if (stabbed) stabOnce();
    // Only a new target moves the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [determinate, target]);

  const bindRoot = React.useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) return;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        setOnScreen(Boolean(entry?.isIntersecting));
      });
      watcher.observe(node);
      return () => watcher.disconnect();
    },
    [setOnScreen],
  );

  const row = useTransform(knitted, (k) => rowPaths(T, clamp(k, 0, T.n)));
  const legs = useTransform(row, (r) => r.legs);
  const loops = useTransform(row, (r) => r.loops);
  const lower = useTransform(row, (r) => r.lower);
  const scene = useTransform(
    [knitted, stab, tug, pullX, pullY] as MotionValue<number>[],
    ([k = 0, sb = 0, tg = 0, x = 0, y = 0]: number[]) =>
      sceneOf(T, F, clamp(k, 0, T.n), sb, tg, x, y),
  );
  const needle = useTransform(scene, (s) => s.needle);
  const knobX = useTransform(scene, (s) => s.knobX);
  const knobY = useTransform(scene, (s) => s.knobY);
  const thread = useTransform(scene, (s) => s.thread);
  const loopX = useTransform(scene, (s) => s.loopX);
  const loopY = useTransform(scene, (s) => s.loopY);
  const loopR = useTransform(scene, (s) => s.loopR);
  const ballX = useTransform(scene, (s) => s.ballX);
  const ballY = useTransform(scene, (s) => s.ballY);
  const ballScale = useTransform(scene, (s) => s.ballScale);
  const ballTurn = useTransform(scene, (s) => s.ballTurn);

  const pct = Math.round(p * 100);
  const wraps = F.wraps.slice(0, T.strands);
  const fuzz =
    F.fuzz && T.detail
      ? Array.from({ length: 20 }, (_, i) => {
          const jitter =
            ((Math.imul(seed ^ (i + 1), 2654435761) >>> 0) % 1000) / 1000;
          const a = ((i * 18 + jitter * 12) * Math.PI) / 180;
          const r0 = T.ballR - 0.3;
          const r1 = T.ballR + 0.7 + jitter * 0.9;
          return `M ${r2(Math.cos(a) * r0)} ${r2(Math.sin(a) * r0)} L ${r2(Math.cos(a) * r1)} ${r2(Math.sin(a) * r1)}`;
        }).join(" ")
      : "";
  const yarnStroke = (width: number, opacity = 1) => ({
    fill: "none",
    strokeWidth: r2(width),
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    opacity,
    style: { stroke: C.body },
  });
  const halo = F.halo ? r2(strand * 2.6) : 0;
  const needleA =
    T.detail || tier === 1
      ? `M ${4} ${r2(T.ny - T.needleW / 2)} L ${56} ${r2(T.ny - T.needleW / 2)} L ${59} ${T.ny} L ${56} ${r2(T.ny + T.needleW / 2)} L ${4} ${r2(T.ny + T.needleW / 2)} Z`
      : "";

  const glyph = (
    <svg
      aria-hidden
      width={S}
      height={S}
      viewBox={`0 0 ${BOX} ${BOX}`}
      className="block overflow-hidden"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx={0} cy={0} r={T.ballR} />
        </clipPath>
      </defs>
      <motion.ellipse
        cx={ballX}
        cy={FLOOR + 0.6}
        rx={r2(T.ballR * 0.8)}
        ry={1.1}
        className="fill-ink-3/25"
      />

      {halo ? <motion.path d={loops} {...yarnStroke(halo, 0.22)} /> : null}
      <motion.path d={loops} {...yarnStroke(strand)} />
      {needleA ? (
        <path d={needleA} className="fill-ink-2" />
      ) : (
        <line
          x1={3}
          x2={60}
          y1={T.ny}
          y2={T.ny}
          strokeWidth={T.needleW}
          strokeLinecap="round"
          className="stroke-ink-2"
        />
      )}
      {T.knob > 0 ? (
        <circle cx={4} cy={T.ny} r={T.knob} className="fill-ink-2" />
      ) : null}

      {T.rows > 1 ? (
        <motion.path d={lower} {...yarnStroke(strand, 0.5)} />
      ) : null}
      {halo ? <motion.path d={legs} {...yarnStroke(halo, 0.22)} /> : null}
      <motion.path d={legs} {...yarnStroke(strand)} />
      {F.ply && T.detail ? (
        <motion.path
          d={legs}
          {...yarnStroke(strand * 0.4, 0.75)}
          strokeDasharray="1.1 1.5"
          style={{ stroke: C.light }}
        />
      ) : null}

      {halo ? <motion.path d={thread} {...yarnStroke(halo, 0.22)} /> : null}
      <motion.path d={thread} {...yarnStroke(strand)} />
      {F.ply && T.detail ? (
        <motion.path
          d={thread}
          {...yarnStroke(strand * 0.4, 0.75)}
          strokeDasharray="1.1 1.5"
          style={{ stroke: C.light }}
        />
      ) : null}
      <motion.circle
        cx={loopX}
        cy={loopY}
        r={loopR}
        fill="none"
        strokeWidth={strand}
        style={{ stroke: C.body }}
      />

      <motion.g
        style={{
          x: ballX,
          y: ballY,
          scale: ballScale,
          originX: 0.5,
          originY: 0.5,
        }}
      >
        {/* Motion scales and turns about the middle of each group's box:
            an unpainted ring the size of the fuzz keeps that middle on the
            ball's centre. */}
        <circle cx={0} cy={0} r={T.ballR + 1.6} fill="none" />
        <circle cx={0} cy={0} r={T.ballR} style={{ fill: C.body }} />
        <g clipPath={`url(#${clipId})`}>
          <motion.g style={{ rotate: ballTurn, originX: 0.5, originY: 0.5 }}>
            {wraps.map(([turn, open], i) => (
              <ellipse
                key={i}
                cx={0}
                cy={0}
                rx={T.ballR}
                ry={r2(T.ballR * open)}
                transform={`rotate(${turn})`}
                fill="none"
                strokeWidth={
                  tier === 0 ? 2.4 : r2(F.wrapW * (tier === 1 ? 1.6 : 1))
                }
                opacity={F.fuzz ? 0.6 : 0.85}
                style={{ stroke: C.dark }}
              />
            ))}
          </motion.g>
        </g>
        {fuzz ? (
          <motion.g style={{ rotate: ballTurn, originX: 0.5, originY: 0.5 }}>
            <circle cx={0} cy={0} r={T.ballR + 1.6} fill="none" />
            <path
              d={fuzz}
              fill="none"
              strokeWidth={0.45}
              strokeLinecap="round"
              opacity={0.8}
              style={{ stroke: C.light }}
            />
          </motion.g>
        ) : null}
        {T.detail ? (
          <path
            d={`M ${r2(-T.ballR * 0.62)} ${r2(-T.ballR * 0.18)} A ${r2(T.ballR * 0.7)} ${r2(T.ballR * 0.7)} 0 0 1 ${r2(-T.ballR * 0.14)} ${r2(-T.ballR * 0.64)}`}
            fill="none"
            strokeWidth={1}
            strokeLinecap="round"
            opacity={0.7}
            style={{ stroke: C.light }}
          />
        ) : null}
      </motion.g>

      {/* The working needle is the hand's tool: it lights on hover. */}
      <g
        className={cn(
          "fill-ink-2 transition-colors",
          !disabled &&
            "group-hover/yarn-knit:fill-foreground group-focus-visible/yarn-knit:fill-foreground",
        )}
      >
        <motion.path d={needle} />
        {T.knob > 0 ? <motion.circle cx={knobX} cy={knobY} r={T.knob} /> : null}
      </g>
    </svg>
  );

  return (
    <span
      ref={bindRoot}
      className={cn(
        "relative inline-flex max-w-full items-center gap-2 align-middle text-sm",
        className,
      )}
    >
      {disabled ? (
        <span className="inline-flex shrink-0" style={{ width: S, height: S }}>
          {glyph}
        </span>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          aria-label="Pull a loop"
          aria-describedby={hintId}
          onClick={(event) => {
            // Pointer tugs arrive through the drag; a click with no pointer
            // behind it — Enter, Space, assistive technology — tugs too.
            if (event.detail === 0) tugByKey();
          }}
          {...drag}
          className={cn(
            "group/yarn-knit relative inline-flex shrink-0 cursor-grab touch-none rounded-2 outline-none select-none [-webkit-touch-callout:none] active:cursor-grabbing",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
          style={{ width: S, height: S }}
        >
          {glyph}
        </button>
      )}
      <span
        role={determinate ? "progressbar" : "status"}
        aria-labelledby={labelId}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? 100 : undefined}
        aria-valuenow={determinate ? pct : undefined}
        aria-valuetext={determinate ? `${pct}%` : undefined}
        className={hideLabel ? "sr-only" : "min-w-0"}
      >
        <span id={labelId} title={label} className="block truncate text-ink-2">
          {label}
        </span>
      </span>
      {disabled ? null : (
        <span id={hintId} className="sr-only">
          Drag the yarn, or press Enter, to pull a loop.
        </span>
      )}
    </span>
  );
}
