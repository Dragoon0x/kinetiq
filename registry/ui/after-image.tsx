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
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type AfterImageTrigger = "mount" | "inView" | "hover" | "manual";
export type AfterImageEnter = "sweep" | "rise" | "scatter";
export type AfterImageElement = "h1" | "h2" | "h3" | "p" | "span" | "div";

export type AfterImageProps = {
  /** The words; each one trails its own echoes. */
  text: string;
  /** The element rendered. @default "p" */
  as?: AfterImageElement;
  /** Copies trailing each word, 1 to 8. @default 5 */
  echoes?: number;
  /** Time between one echo and the next, ms: longer lags draw longer streaks. @default 40 */
  lag?: number;
  /** Hue drift from one echo to the next, degrees: 0 is one colour, 60 a spectrum. @default 20 */
  hue?: number;
  /** The nearest echo's colour, any CSS colour. @default "var(--accent-bright)" */
  color?: string;
  /** Opacity of the nearest echo, 0 to 1; older echoes decay from it. @default 0.55 */
  fade?: number;
  /** A soft halo on the echoes, 0 to 1. @default 0.4 */
  glow?: number;
  /** One faint echo breathes behind the resting text. @default true */
  breathe?: boolean;
  /** The path the words arrive on. @default "sweep" */
  enter?: AfterImageEnter;
  /** How much a dragged word's neighbours follow it, 0 to 1. @default 0.55 */
  pull?: number;
  /** How hard the pointer passing over a word kicks it, 0 (off) to 1. @default 0.4 */
  sweep?: number;
  /** What brings the words in. @default "inView" */
  trigger?: AfterImageTrigger;
  /** Arrive once; false sends the words out when it leaves view or the hover ends. @default true */
  once?: boolean;
  /** Manual trigger: true brings the words in, false sends them out. */
  play?: boolean;
  /** Wait before the first word, ms. @default 0 */
  delay?: number;
  /** Gap between words arriving, ms. @default 80 */
  stagger?: number;
  /** Time scale of the arrival springs, ms; their damping ratios are kept. @default 500 */
  duration?: number;
  /** Drag, hover kicks and keyboard throws. @default true */
  interactive?: boolean;
  /** The words started moving (true), or every echo has caught up (false). */
  onMotionChange?: (moving: boolean) => void;
  /** The arrival has settled. */
  onComplete?: () => void;
  className?: string;
};

/** The duration the calibration springs were tuned at, ms. */
const BASE = 500;
/** Echoes a word can carry. */
const MAX_ECHOES = 8;
/** History samples kept per word: enough for the longest trail at 120 fps. */
const CAP = 128;
/** A dragged word moves freely this far, em, then rubber-bands. */
const REACH = 0.45;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const em = (v: number) => `${r3(v)}em`;
const smooth = (lo: number, hi: number, v: number) => {
  const t = clamp01((v - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};

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

const soften = (ms: number) =>
  ms <= 500 ? ms : 500 + (450 * (ms - 500)) / (ms - 500 + 450);

/** The frame clock (the timeline rAF stamps use), read from events and
 * frames only, never while rendering. */
const nowMs = () => performance.now();

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

type Echo = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** How far the echo is from its word, em. */
  sep: MotionValue<number>;
};

type Cell = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  shown: MotionValue<number>;
  echoes: Echo[];
  /** Timestamped positions, t x y triples in a ring. */
  ring: Float64Array;
  head: number;
  count: number;
};

/** Where a word arrives from, em: seeded, so server and browser agree. */
function originOf(enter: AfterImageEnter, word: string, i: number) {
  if (enter === "rise") return { x: 0, y: 0.5 };
  if (enter === "scatter") {
    const a = ((hash(`${word}:${i}`) % 360) * Math.PI) / 180;
    return { x: r3(Math.cos(a) * 0.5), y: r3(Math.sin(a) * 0.32) };
  }
  return { x: -0.45, y: 0.2 };
}

function record(cell: Cell, t: number, x: number, y: number) {
  cell.head = (cell.head + 1) % CAP;
  cell.ring[cell.head * 3] = t;
  cell.ring[cell.head * 3 + 1] = x;
  cell.ring[cell.head * 3 + 2] = y;
  cell.count = Math.min(CAP, cell.count + 1);
}

/** Where the word was at time `t`, interpolated from its history. */
function recall(cell: Cell, t: number): [number, number] {
  let i = cell.head;
  let newer = -1;
  for (let n = 0; n < cell.count; n += 1) {
    const at = cell.ring[i * 3] ?? 0;
    if (at <= t) {
      const x = cell.ring[i * 3 + 1] ?? 0;
      const y = cell.ring[i * 3 + 2] ?? 0;
      if (newer < 0) return [x, y];
      const t1 = cell.ring[newer * 3] ?? at;
      const u = t1 > at ? (t - at) / (t1 - at) : 0;
      return [
        x + ((cell.ring[newer * 3 + 1] ?? x) - x) * u,
        y + ((cell.ring[newer * 3 + 2] ?? y) - y) * u,
      ];
    }
    newer = i;
    i = (i - 1 + CAP) % CAP;
  }
  const oldest = newer < 0 ? cell.head : newer;
  return [cell.ring[oldest * 3 + 1] ?? 0, cell.ring[oldest * 3 + 2] ?? 0];
}

type EchoProps = {
  word: string;
  k: number;
  total: number;
  echo: Echo;
  shown: MotionValue<number>;
  breath: MotionValue<number>;
  afterglow: MotionValue<number>;
  color: string;
  hue: number;
  fade: number;
  glow: number;
  idle: boolean;
  motionSafe: boolean;
};

function EchoCopy({
  word,
  k,
  total,
  echo,
  shown,
  breath,
  afterglow,
  color,
  hue,
  fade,
  glow,
  idle,
  motionSafe,
}: EchoProps) {
  // Older echoes are fainter: the trail decays toward its tail.
  const strength = fade * Math.pow(1 - (k - 1) / (total + 1), 1.4);
  const resting = idle && k === 1;
  const x = useTransform(() => {
    if (!motionSafe) return em(k * 0.035);
    return em(echo.x.get() + (resting ? breath.get() * 0.035 : 0));
  });
  const y = useTransform(() => {
    if (!motionSafe) return em(k * 0.022);
    return em(echo.y.get() + (resting ? breath.get() * 0.024 : 0));
  });
  const opacity = useTransform(() => {
    const live = motionSafe
      ? smooth(0.004, 0.06, echo.sep.get())
      : afterglow.get();
    const still = resting ? (motionSafe ? 0.06 + 0.09 * breath.get() : 0.1) : 0;
    return r3(Math.max(strength * live, still) * shown.get());
  });
  const tint = `oklch(from ${color} l c calc(h + ${r2(k * hue)}))`;
  const halo =
    glow > 0.01
      ? `0 0 ${r3(0.04 + 0.12 * glow)}em oklch(from ${color} l c calc(h + ${r2(k * hue)}) / ${r2(0.6 * glow)})`
      : "none";
  return (
    <motion.span
      className="pointer-events-none absolute inset-0 select-none"
      style={{ x, y, opacity, color: tint, textShadow: halo }}
    >
      {word}
    </motion.span>
  );
}

function Face({ word, cell }: { word: string; cell: Cell }) {
  const x = useTransform(cell.x, em);
  const y = useTransform(cell.y, em);
  return (
    <motion.span
      className="relative inline-block"
      style={{ x, y, opacity: cell.shown }}
    >
      {word}
    </motion.span>
  );
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  sync: () => void;
  tick: (now: number) => void;
  breathe: () => void;
  halt: () => void;
};

/**
 * A headline whose words leave a fading echo wherever they go. Each word
 * keeps a short timestamped history of where it has been, and its echoes are
 * placed where it was a few `lag` milliseconds ago, one after another — so
 * movement fans out behind the word as a chromatic afterglow, each copy a
 * little fainter and turned a little further round the hue circle, and folds
 * back into it when it stops. Positions come from motion values and a
 * history ring, never a blur filter.
 *
 * The words arrive on curved paths — x on glide, y on snap — drawing their
 * own streaks. Grab a word and drag: it follows 1:1 and its neighbours
 * follow less, and on release every word springs home on recoil with the
 * throw's velocity, its echoes swinging out behind the bounces. Passing the
 * pointer over a word kicks it; Arrow keys throw the words, Enter brings
 * them in again. At rest one faint echo breathes. The frame loop runs only
 * while something moves or an echo is catching up. Under reduced motion the
 * words never travel: they fade in, and a still afterglow fades out.
 */
export function AfterImage(props: AfterImageProps) {
  return <Echoes key={props.text} {...props} />;
}

function Echoes({
  text,
  as = "p",
  echoes = 5,
  lag = 40,
  hue = 20,
  color = "var(--accent-bright)",
  fade = 0.55,
  glow = 0.4,
  breathe = true,
  enter = "sweep",
  pull = 0.55,
  sweep = 0.4,
  trigger = "inView",
  once = true,
  play,
  delay = 0,
  stagger = 80,
  duration = BASE,
  interactive = true,
  onMotionChange,
  onComplete,
  className,
}: AfterImageProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const count = Math.round(clamp(echoes, 0, MAX_ECHOES));
  const gap = clamp(lag, 8, 200);
  const f = clamp(duration, 120, 3000) / BASE;

  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const [seen, setSeen] = React.useState(false);
  const running = onScreen && !hidden;
  const target =
    trigger === "manual" ? Boolean(play) : trigger === "mount" ? true : seen;

  const words = React.useMemo(
    () => text.split(/\s+/).filter((w) => w.length > 0),
    [text],
  );
  const cells = React.useMemo<Cell[]>(
    () =>
      words.map((word, i) => {
        const from = originOf(enter, word, i);
        const cell: Cell = {
          x: motionValue(from.x),
          y: motionValue(from.y),
          shown: motionValue(0),
          echoes: Array.from({ length: MAX_ECHOES }, () => ({
            x: motionValue(from.x),
            y: motionValue(from.y),
            sep: motionValue(0),
          })),
          ring: new Float64Array(CAP * 3),
          head: 0,
          count: 0,
        };
        return cell;
      }),
    // The arrival path is read when the words first appear; a later change
    // applies to the next arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words],
  );
  const breath = useMotionValue(0);
  const afterglow = useMotionValue(0);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const slots = React.useRef(new Map<number, HTMLSpanElement>());
  const moves = React.useRef<AnimationPlaybackControls[]>([]);
  const glowRun = React.useRef<AnimationPlaybackControls | null>(null);
  const breathRun = React.useRef<AnimationPlaybackControls | null>(null);
  const frame = React.useRef(0);
  const lastMove = React.useRef(0);
  const moving = React.useRef(false);
  const dragging = React.useRef(false);
  const state = React.useRef<"out" | "arriving" | "in" | "leaving">("out");
  const grab = React.useRef({ index: 0, font: 16, base: [] as number[] });
  const kicked = React.useRef(new Map<number, number>());
  const pointer = React.useRef({ x: 0, y: 0, t: 0 });
  const api = React.useRef<Api | null>(null);
  const latest = React.useRef({ onMotionChange, onComplete, trigger, once });

  const fontPx = () => {
    const root = rootRef.current;
    return root ? parseFloat(getComputedStyle(root).fontSize) || 16 : 16;
  };

  const stopMoves = () => {
    for (const m of moves.current) m.stop();
    moves.current = [];
  };

  const setMoving = (on: boolean) => {
    if (moving.current === on) return;
    moving.current = on;
    latest.current.onMotionChange?.(on);
  };

  /** One frame of history, and every echo placed from it. */
  const tick = (now: number) => {
    frame.current = 0;
    let still = true;
    for (const cell of cells) {
      const x = cell.x.get();
      const y = cell.y.get();
      const px = cell.ring[cell.head * 3 + 1] ?? x;
      const py = cell.ring[cell.head * 3 + 2] ?? y;
      if (
        cell.count === 0 ||
        Math.abs(x - px) > 1e-4 ||
        Math.abs(y - py) > 1e-4
      ) {
        still = false;
      }
      record(cell, now, x, y);
      for (let k = 1; k <= count; k += 1) {
        const echo = cell.echoes[k - 1];
        if (!echo) continue;
        const [hx, hy] = recall(cell, now - k * gap);
        echo.x.set(r4(hx));
        echo.y.set(r4(hy));
        echo.sep.set(r4(Math.hypot(hx - x, hy - y)));
      }
    }
    if (!still) lastMove.current = now;
    const settled = now - lastMove.current > count * gap + 60;
    if (settled && !dragging.current) {
      for (const cell of cells) {
        for (const echo of cell.echoes) echo.sep.set(0);
      }
      setMoving(false);
      api.current?.breathe();
      return;
    }
    frame.current = requestAnimationFrame((t) => api.current?.tick(t));
  };

  const wake = () => {
    if (!motionSafe) return;
    lastMove.current = nowMs();
    setMoving(true);
    if (!frame.current) {
      frame.current = requestAnimationFrame((t) => api.current?.tick(t));
    }
    breathRun.current?.stop();
    breathRun.current = null;
  };

  /** The still afterglow of reduced motion: echoes at fixed offsets, fading. */
  const flash = () => {
    glowRun.current?.stop();
    afterglow.jump(1);
    glowRun.current = animate(afterglow, 0, {
      duration: durations.page,
      ease: easings.enter,
      delay: 0.1,
    });
  };

  const arrive = () => {
    stopMoves();
    state.current = "arriving";
    const n = cells.length;
    const done = () => {
      state.current = "in";
      latest.current.onComplete?.();
      api.current?.breathe();
    };
    if (!n) return;
    if (!motionSafe) {
      cells.forEach((cell, i) => {
        cell.x.jump(0);
        cell.y.jump(0);
        moves.current.push(
          animate(cell.shown, 1, {
            duration: durations.slow,
            ease: easings.enter,
            delay: delay / 1000 + i * 0.04,
            onComplete: i === n - 1 ? done : undefined,
          }),
        );
      });
      flash();
      return;
    }
    const now = nowMs();
    const span = soften(stagger * (n - 1)) / 1000;
    const across = timed(springs.glide, f);
    const lift = timed(springs.snap, f);
    cells.forEach((cell, i) => {
      const from = originOf(enter, words[i] ?? "", i);
      cell.x.jump(from.x);
      cell.y.jump(from.y);
      cell.shown.jump(0);
      cell.count = 0;
      record(cell, now, from.x, from.y);
      const at = delay / 1000 + (n > 1 ? (span * i) / (n - 1) : 0);
      moves.current.push(
        animate(cell.x, 0, {
          ...across,
          delay: at,
          onComplete: i === n - 1 ? done : undefined,
        }),
        animate(cell.y, 0, { ...lift, delay: at }),
        animate(cell.shown, 1, {
          duration: durations.base,
          ease: easings.enter,
          delay: at,
        }),
      );
    });
    wake();
  };

  /** Out the way they came, last word first; exits never spring. */
  const leave = () => {
    stopMoves();
    state.current = "leaving";
    const n = cells.length;
    const out = { duration: durations.base, ease: easings.exit };
    const span = soften((stagger / 2) * (n - 1)) / 1000;
    cells.forEach((cell, i) => {
      const from = originOf(enter, words[i] ?? "", i);
      const at = n > 1 ? (span * (n - 1 - i)) / (n - 1) : 0;
      const end =
        i === 0
          ? () => {
              state.current = "out";
            }
          : undefined;
      if (!motionSafe) {
        moves.current.push(
          animate(cell.shown, 0, { ...out, delay: at, onComplete: end }),
        );
        return;
      }
      moves.current.push(
        animate(cell.x, from.x, { ...out, delay: at, onComplete: end }),
        animate(cell.y, from.y, { ...out, delay: at }),
        animate(cell.shown, 0, { ...out, delay: at }),
      );
    });
    wake();
  };

  /** Sends every word off with a velocity, em/s, and lets recoil bring it home. */
  const throwAll = (vx: number, vy: number, wave = 0) => {
    if (state.current !== "in") return;
    if (!motionSafe) {
      flash();
      return;
    }
    stopMoves();
    cells.forEach((cell, i) => {
      const at = wave * i;
      moves.current.push(
        animate(cell.x, 0, { ...springs.recoil, velocity: vx, delay: at }),
        animate(cell.y, 0, { ...springs.recoil, velocity: vy, delay: at }),
      );
    });
    state.current = "in";
    wake();
  };

  const breatheIdle = () => {
    breathRun.current?.stop();
    breathRun.current = null;
    if (
      !breathe ||
      !motionSafe ||
      !running ||
      moving.current ||
      state.current !== "in"
    ) {
      return;
    }
    breathRun.current = animate(breath, [breath.get(), 1], {
      duration: 2.6,
      ease: easings.move,
      repeat: Infinity,
      repeatType: "mirror",
    });
  };

  const halt = () => {
    stopMoves();
    glowRun.current?.stop();
    breathRun.current?.stop();
    breathRun.current = null;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
  };

  const sync = () => {
    const st = state.current;
    if (target) {
      if (
        st === "out" ||
        st === "leaving" ||
        (st === "arriving" && !moves.current.length)
      ) {
        arrive();
      }
    } else if (
      st === "in" ||
      st === "arriving" ||
      (st === "leaving" && !moves.current.length)
    ) {
      leave();
    }
    // Back on screen mid-flight: the echoes pick the words up again.
    if (running && moves.current.some((m) => m.state === "running")) wake();
    breatheIdle();
  };

  const nearest = (clientX: number, clientY: number) => {
    let best = 0;
    let bestD = Infinity;
    slots.current.forEach((node, i) => {
      const r = node.getBoundingClientRect();
      const dx = Math.max(r.left - clientX, 0, clientX - r.right);
      const dy = Math.max(r.top - clientY, 0, clientY - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return { index: best, distance: bestD };
  };

  const drag = useDrag({
    threshold: 3,
    disabled: !interactive,
    onStart: () => {
      if (state.current === "out" || state.current === "leaving") return;
      dragging.current = true;
      stopMoves();
      // Caught mid-arrival: the words are in, and the host hears so.
      if (state.current === "arriving") latest.current.onComplete?.();
      state.current = "in";
      grab.current.font = fontPx();
      grab.current.base = cells.flatMap((c) => [c.x.get(), c.y.get()]);
      if (!motionSafe) flash();
      wake();
    },
    onMove: ({ offset }) => {
      if (!dragging.current || !motionSafe) return;
      const g = grab.current;
      const dx = offset.x / g.font;
      const dy = offset.y / g.font;
      cells.forEach((cell, i) => {
        const w = Math.pow(clamp01(pull), Math.abs(i - g.index));
        const bx = g.base[i * 2] ?? 0;
        const by = g.base[i * 2 + 1] ?? 0;
        cell.x.set(r4(rubberClamp(bx + dx * w, -REACH, REACH, 0.6)));
        cell.y.set(
          r4(rubberClamp(by + dy * w, -REACH * 0.6, REACH * 0.6, 0.4)),
        );
      });
      lastMove.current = nowMs();
    },
    onEnd: ({ velocity }) => {
      if (!dragging.current) return;
      dragging.current = false;
      if (!motionSafe) return;
      const g = grab.current;
      stopMoves();
      cells.forEach((cell, i) => {
        const w = Math.pow(clamp01(pull), Math.abs(i - g.index));
        moves.current.push(
          animate(cell.x, 0, {
            ...springs.recoil,
            velocity: clamp((velocity.x / g.font) * w, -12, 12),
          }),
          animate(cell.y, 0, {
            ...springs.recoil,
            velocity: clamp((velocity.y / g.font) * w, -8, 8),
          }),
        );
      });
      wake();
    },
    onCancel: () => {
      dragging.current = false;
      throwAll(0, 0);
    },
    onTap: () => {
      const picked = window.getSelection()?.toString() ?? "";
      if (!picked.trim() && target) arrive();
    },
  });

  /** The pointer passing over a word gives it a small kick along its path. */
  const brush = (event: React.PointerEvent) => {
    if (!interactive || !motionSafe || sweep <= 0) return;
    if (event.pointerType !== "mouse" || event.buttons !== 0) return;
    if (state.current !== "in") return;
    const p = pointer.current;
    const dt = Math.max(8, event.timeStamp - p.t);
    const vx = ((event.clientX - p.x) / dt) * 1000;
    const vy = ((event.clientY - p.y) / dt) * 1000;
    pointer.current = {
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    };
    if (p.t === 0) return;
    const { index, distance } = nearest(event.clientX, event.clientY);
    if (distance > 0) return;
    const now = nowMs();
    if (now - (kicked.current.get(index) ?? -Infinity) < 320) return;
    kicked.current.set(index, now);
    const cell = cells[index];
    if (!cell) return;
    const font = fontPx();
    const k = clamp01(sweep) * 0.25;
    moves.current.push(
      animate(cell.x, 0, {
        ...springs.recoil,
        velocity: clamp((vx / font) * k, -6, 6),
      }),
      animate(cell.y, 0, {
        ...springs.recoil,
        velocity: clamp((vy / font) * k, -4, 4),
      }),
    );
    wake();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!interactive) return;
    const v = 7;
    switch (event.key) {
      case "ArrowLeft":
        throwAll(-v, 0, 0.03);
        break;
      case "ArrowRight":
        throwAll(v, 0, 0.03);
        break;
      case "ArrowUp":
        throwAll(0, -v * 0.6, 0.03);
        break;
      case "ArrowDown":
        throwAll(0, v * 0.6, 0.03);
        break;
      case "Enter":
      case " ":
        if (!event.repeat && target) arrive();
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  React.useLayoutEffect(() => {
    api.current = { sync, tick, breathe: breatheIdle, halt };
    latest.current = { onMotionChange, onComplete, trigger, once };
  });

  React.useEffect(() => {
    api.current?.sync();
  }, [target, motionSafe, running, breathe]);

  // Off screen or in a hidden tab the loop and the breath stop where they are.
  React.useEffect(() => {
    if (running) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    breathRun.current?.stop();
    breathRun.current = null;
  }, [running]);

  React.useEffect(() => () => api.current?.halt(), []);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const visible = Boolean(entry?.isIntersecting);
      setOnScreen(visible);
      if (latest.current.trigger === "inView") {
        setSeen((was) => (visible ? true : latest.current.once ? was : false));
      }
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const bindSlot = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) slots.current.set(i, node);
    else slots.current.delete(i);
  };

  const hover = (on: boolean) => {
    if (trigger !== "hover") return;
    setSeen((was) => (on ? true : once ? was : false));
  };

  const Tag: React.ElementType = as;
  const idle = breathe;

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={interactive ? 0 : undefined}
        aria-describedby={interactive ? hintId : undefined}
        onPointerDown={(event: React.PointerEvent) => {
          grab.current.index = nearest(event.clientX, event.clientY).index;
          drag.onPointerDown(event);
        }}
        onPointerMove={(event: React.PointerEvent) => {
          drag.onPointerMove(event);
          brush(event);
        }}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onLostPointerCapture={drag.onLostPointerCapture}
        onPointerEnter={() => hover(true)}
        onPointerLeave={() => {
          hover(false);
          pointer.current = { x: 0, y: 0, t: 0 };
        }}
        onFocus={() => hover(true)}
        onBlur={() => hover(false)}
        onKeyDown={onKeyDown}
        className={cn(
          as === "span" ? "inline-block" : "block",
          // Echoes may trail a little past the words, never far: the box
          // clips anything beyond a short margin.
          "relative overflow-clip [overflow-clip-margin:0.6em]",
          interactive &&
            "cursor-grab touch-pan-y rounded-2 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid active:cursor-grabbing",
          className,
        )}
      >
        <span className="sr-only select-none">{text}</span>
        <span aria-hidden>
          {words.map((word, i) => {
            const cell = cells[i] as Cell;
            return (
              <React.Fragment key={i}>
                {i > 0 ? " " : null}
                <span
                  ref={bindSlot(i)}
                  className="relative inline-block whitespace-nowrap"
                >
                  {Array.from({ length: count }, (_, j) => {
                    // Oldest first, so the nearest echo paints over the rest.
                    const k = count - j;
                    return (
                      <EchoCopy
                        key={k}
                        word={word}
                        k={k}
                        total={count}
                        echo={cell.echoes[k - 1] as Echo}
                        shown={cell.shown}
                        breath={breath}
                        afterglow={afterglow}
                        color={color}
                        hue={hue}
                        fade={clamp01(fade)}
                        glow={clamp01(glow)}
                        idle={idle}
                        motionSafe={motionSafe}
                      />
                    );
                  })}
                  <Face word={word} cell={cell} />
                </span>
              </React.Fragment>
            );
          })}
        </span>
      </Tag>
      {interactive ? (
        <span id={hintId} className="sr-only">
          Arrow keys throw the words; Enter brings them in again.
        </span>
      ) : null}
    </>
  );
}
