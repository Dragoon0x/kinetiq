"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ThinkThreadSize = "sm" | "md" | "lg";
export type ThinkThreadColor = "ink" | "cobalt" | "signal" | "amber";

export type ThinkThreadProps = {
  /** Whether it is thinking. Turning false pulls the line taut and shows `doneLabel`. @default true */
  thinking?: boolean;
  /** The state while thinking, spoken politely when thinking starts. @default "Thinking" */
  label?: string;
  /** The status word that fades in once the line is straight, and is spoken. @default "Done" */
  doneLabel?: string;
  /** How fast the pencil travels, as a multiple of its natural pace. @default 1 */
  pace?: number;
  /** 0 draws gentle waves; 1 curls into loops and doubles back often. @default 0.5 */
  wander?: number;
  /** The line's colour: a named ink or any CSS colour. @default "ink" */
  color?: ThinkThreadColor | (string & {});
  /** How much of the path stays on the page, in px of travel. @default 140 */
  tail?: number;
  /** The line's weight, in px. @default 1.25 */
  strokeWidth?: number;
  /** The box: 96×20, 136×28 or 184×40, and the word's size. @default "md" */
  size?: ThinkThreadSize;
  /** Picks the path; the same seed draws the same thought. @default 7 */
  seed?: number;
  /** Holds the pencil where it is. @default false */
  paused?: boolean;
  /** Caps the canvas's device pixel ratio (never above 2). @default 2 */
  dpr?: number;
  /** Fires when the line has gathered and settled. */
  onSettled?: () => void;
  className?: string;
};

const BOXES: Record<ThinkThreadSize, { w: number; h: number; text: string }> = {
  sm: { w: 96, h: 20, text: "text-xs" },
  md: { w: 136, h: 28, text: "text-sm" },
  lg: { w: 184, h: 40, text: "text-base" },
};
const INKS: Record<ThinkThreadColor, string> = {
  ink: "var(--ink-2)",
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
};
/** Px of travel between kept points: fine enough that curves stay round. */
const SPACING = 1.5;
const MAX = 512;
const STEP = 1 / 120;
/** Seconds of thinking already on the page at the first frame. */
const WARM = 2.4;
const BUCKETS = 16;
/** How far behind the pencil end the tail sets off when the line gathers. */
const SPREAD = 0.6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A 1D hash to [-1, 1]: unsigned shifts throughout, so it is the same everywhere. */
const hash = (n: number, seed: number) => {
  let h = (Math.imul(n | 0, 374761393) + Math.imul(seed | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
};
const noise = (t: number, seed: number) => {
  const i = Math.floor(t);
  const u = smooth(t - i);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
};

type Pencil = {
  x: number;
  y: number;
  heading: number;
  t: number;
  /** Seconds left in the current loop or hairpin. */
  loop: number;
  turn: number;
  next: number;
  rng: number;
  travelled: number;
};

type Ring = { xs: Float32Array; ys: Float32Array; head: number; count: number };

type Shape = {
  w: number;
  h: number;
  pace: number;
  wander: number;
  seed: number;
  pad: number;
  keep: number;
};

const random = (p: Pencil) => {
  p.rng = (Math.imul(p.rng, 1664525) + 1013904223) >>> 0;
  return p.rng / 4294967296;
};

const pencilAt = (s: Shape, x: number, y: number, heading: number): Pencil => ({
  x,
  y,
  heading,
  t: 0,
  loop: 0,
  turn: 0,
  next: 0.4,
  rng: Math.imul(s.seed | 0, 2654435761) >>> 0 || 1,
  travelled: 0,
});

const push = (ring: Ring, x: number, y: number, keep: number) => {
  ring.xs[ring.head] = x;
  ring.ys[ring.head] = y;
  ring.head = (ring.head + 1) % MAX;
  ring.count = Math.min(keep, ring.count + 1);
};

/**
 * One tick of the pencil: constant speed, a heading turned by smooth noise
 * (its strength is `wander`), loops and hairpins in seeded bursts whose
 * radius fits the box, and a soft push back toward the middle near a wall
 * that keeps the line travelling across the box like handwriting.
 */
function advance(p: Pencil, ring: Ring, s: Shape) {
  const speed = s.h * 3 * s.pace;
  const radius = s.h * lerp(0.3, 0.19, s.wander);
  if (p.loop <= 0 && p.t >= p.next) {
    // Half a turn is a hairpin — doubling back; more is a loop.
    const turns = lerp(0.5, 1.15, random(p));
    p.loop = (turns * 2 * Math.PI * radius) / speed;
    p.turn = (random(p) < 0.5 ? -1 : 1) * (speed / radius);
    p.next = p.t + p.loop + lerp(1.6, 0.25, s.wander) * (0.5 + random(p));
  }
  let turn =
    noise(p.t * lerp(0.8, 2.6, s.wander), s.seed) * lerp(1.4, 6, s.wander);
  if (p.loop > 0) {
    turn += p.turn;
    p.loop -= STEP;
  }
  // Walls push the heading inward: one blended direction, so a corner's two
  // walls never pull against each other and pin the pencil.
  const near = (d: number, reach: number) => clamp(1 - d / reach, 0, 1);
  const reachY = s.h * 0.34;
  const reachX = s.h * 0.9;
  const kl = near(p.x - s.pad, reachX);
  const kr = near(s.w - s.pad - p.x, reachX);
  const kt = near(p.y - s.pad, reachY);
  const kb = near(s.h - s.pad - p.y, reachY);
  const ix = kl * kl - kr * kr;
  const iy = kt * kt - kb * kb;
  const inward = Math.max(Math.abs(ix), Math.abs(iy));
  if (inward > 0) {
    const want = Math.atan2(
      Math.sin(p.heading) + iy * 3,
      Math.cos(p.heading) + ix * 3,
    );
    turn += wrap(want - p.heading) * 22 * inward;
  }
  p.heading = wrap(p.heading + turn * STEP);
  const stride = speed * STEP;
  const nx = clamp(p.x + Math.cos(p.heading) * stride, s.pad, s.w - s.pad);
  const ny = clamp(p.y + Math.sin(p.heading) * stride, s.pad, s.h - s.pad);
  // Held by a wall: turn straight back into the box.
  if (Math.hypot(nx - p.x, ny - p.y) < stride * 0.3) {
    p.heading = Math.atan2(s.h / 2 - p.y, s.w / 2 - p.x);
  }
  p.travelled += Math.hypot(nx - p.x, ny - p.y);
  p.x = nx;
  p.y = ny;
  p.t += STEP;
  if (p.travelled >= SPACING) {
    p.travelled = 0;
    push(ring, p.x, p.y, s.keep);
  }
}

const shapeOf = (
  w: number,
  h: number,
  pace: number,
  wander: number,
  seed: number,
  tail: number,
  stroke: number,
): Shape => ({
  w,
  h,
  pace: clamp(pace, 0.1, 4),
  wander: clamp(wander, 0, 1),
  seed: Math.round(seed),
  pad: Math.max(2, stroke + 1.5),
  keep: clamp(Math.ceil(Math.max(8, tail) / SPACING), 4, MAX),
});

/** The thought as it stands after `WARM` seconds: the still frame and the first frame. */
function warm(s: Shape) {
  const ring: Ring = {
    xs: new Float32Array(MAX),
    ys: new Float32Array(MAX),
    head: 0,
    count: 0,
  };
  const p = pencilAt(s, s.w * 0.22, s.h * 0.5, -0.35);
  push(ring, p.x, p.y, s.keep);
  const steps = Math.round(WARM / STEP);
  for (let i = 0; i < steps; i += 1) advance(p, ring, s);
  return { p, ring };
}

const at = (ring: Ring, k: number) =>
  (ring.head - ring.count + k + MAX * 2) % MAX;

/**
 * The still scribble in four pieces that fade toward the tail: what the
 * server sends, what reduced motion keeps, and exactly the canvas's first
 * frame, so the hand-off has no seam.
 */
function stillPaths(s: Shape) {
  const { p, ring } = warm(s);
  const pts: string[] = [];
  for (let k = 0; k < ring.count; k += 1) {
    const i = at(ring, k);
    pts.push(`${r2(ring.xs[i] ?? 0)} ${r2(ring.ys[i] ?? 0)}`);
  }
  pts.push(`${r2(p.x)} ${r2(p.y)}`);
  const pieces: { d: string; opacity: number }[] = [];
  const per = Math.ceil(pts.length / 4);
  for (let q = 0; q < 4; q += 1) {
    const part = pts.slice(Math.max(0, q * per - 1), (q + 1) * per);
    if (part.length > 1) {
      pieces.push({
        d: `M ${part.join(" L ")}`,
        opacity: [0.12, 0.35, 0.65, 1][q] ?? 1,
      });
    }
  }
  return { pieces, tip: { x: r2(p.x), y: r2(p.y) } };
}

type Config = {
  thinking: boolean;
  paused: boolean;
  shape: Shape;
  stroke: number;
  dpr: number;
  onSettled?: () => void;
};

type Engine = {
  setThinking: (thinking: boolean) => void;
  configure: () => void;
  resize: () => void;
  readInk: () => void;
  wake: () => void;
  dispose: () => void;
};

/**
 * The canvas side: the pencil's loop, the gather and the pluck. Runs only
 * while there is something to draw, on screen, on a visible page.
 */
function createEngine(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  line: HTMLElement,
  carrier: HTMLElement,
  cfg: { current: Config },
  visible: { current: boolean },
  onLive: () => void,
  onRest: (resting: boolean) => void,
): Engine {
  const ctx = canvas.getContext("2d");
  let s = cfg.current.shape;
  let { p, ring } = warm(s);
  let mode: "think" | "gather" | "rest" = cfg.current.thinking
    ? "think"
    : "rest";
  let frame = 0;
  let last = 0;
  let acc = 0;
  let ink = "currentColor";
  let disposed = false;
  let live = false;
  let width = s.w;
  let height = s.h;
  let scale = 1;
  // The gather: where every point starts and the line it lands on.
  const gx = new Float32Array(MAX + 1);
  const gy = new Float32Array(MAX + 1);
  let gn = 0;
  let x0 = 0;
  let x1 = 0;
  let ly = 0;
  const progress = motionValue(0);
  const pluck = motionValue(0);
  const anims: AnimationPlaybackControls[] = [];

  const stopAnims = () => {
    for (const a of anims) a.stop();
    anims.length = 0;
  };

  const measureLine = () => {
    const a = root.getBoundingClientRect();
    const b = line.getBoundingClientRect();
    x0 = Math.max(s.pad, b.left - a.left);
    x1 = Math.max(x0 + 4, b.right - a.left);
    ly = b.top - a.top + b.height / 2;
    if (!Number.isFinite(ly) || b.width === 0) {
      x0 = s.pad;
      x1 = width - s.pad;
      ly = height / 2;
    }
  };

  const restLine = () => {
    measureLine();
    gn = 64;
    for (let i = 0; i < gn; i += 1) {
      const u = i / (gn - 1);
      gx[i] = lerp(x0, x1, u);
      gy[i] = ly;
    }
    progress.jump(1);
    pluck.jump(0);
  };

  const prep = () => {
    if (!ctx) return false;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = cfg.current.stroke;
    // Butt ends: the stretches of different ink meet without doubling up.
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    return true;
  };

  /**
   * A stroke that fades toward its tail, with no seams: one continuous path
   * per stretch, each running on to the pencil end, at an alpha solved so
   * the stack composites to the stretch's own ink. Joints never double up
   * and stretches never leave a hairline gap between them.
   */
  const fadedStroke = (
    n: number,
    point: (i: number, out: { x: number; y: number }) => void,
    inkOf: (b: number) => number,
  ) => {
    if (!ctx || n < 2) return;
    const q = { x: 0, y: 0 };
    let below = 0;
    for (let b = 0; b < BUCKETS; b += 1) {
      const want = clamp(inkOf(b), 0, 1);
      if (want <= below + 1e-3) continue;
      ctx.globalAlpha = below >= 0.999 ? 0 : 1 - (1 - want) / (1 - below);
      below = want;
      const from = Math.floor((b * (n - 1)) / BUCKETS);
      ctx.beginPath();
      point(from, q);
      ctx.moveTo(q.x, q.y);
      for (let i = from + 1; i < n; i += 1) {
        point(i, q);
        ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  const drawThink = () => {
    if (!prep() || !ctx) return;
    const n = ring.count;
    // The kept points, tail to pencil, then the pencil itself.
    fadedStroke(
      n + 1,
      (k, out) => {
        if (k >= n) {
          out.x = p.x;
          out.y = p.y;
          return;
        }
        const i = at(ring, k);
        out.x = ring.xs[i] ?? p.x;
        out.y = ring.ys[i] ?? p.y;
      },
      (b) => Math.pow((b + 1) / BUCKETS, 1.5),
    );
    ctx.beginPath();
    ctx.arc(p.x, p.y, cfg.current.stroke * 0.95, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawGather = () => {
    if (!prep() || !ctx) return;
    const g = progress.get();
    const k = pluck.get();
    const ease = (u: number) => smooth(g * (1 + SPREAD) - SPREAD * (1 - u));
    fadedStroke(
      gn,
      (i, out) => {
        const u = gn > 1 ? i / (gn - 1) : 1;
        const e = ease(u);
        const tx = lerp(x0, x1, u);
        out.x = lerp(gx[i] ?? tx, tx, e);
        out.y = lerp(gy[i] ?? ly, ly, e) + k * Math.sin(Math.PI * u) * e;
      },
      (b) => {
        const u = (b + 0.5) / BUCKETS;
        return lerp(
          Math.pow((b + 1) / BUCKETS, 1.5),
          lerp(0.35, 1, u),
          ease(u),
        );
      },
    );
  };

  const draw = () => {
    if (mode === "think") drawThink();
    else drawGather();
    if (!live) {
      live = true;
      onLive();
    }
  };

  const needsLoop = () =>
    visible.current &&
    !document.hidden &&
    (mode === "think" ? !cfg.current.paused : mode === "gather");

  const tick = (now: number) => {
    frame = 0;
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (mode === "think" && !cfg.current.paused) {
      acc += dt;
      while (acc >= STEP) {
        advance(p, ring, s);
        acc -= STEP;
      }
    }
    draw();
    if (needsLoop()) frame = window.requestAnimationFrame(tick);
  };

  const wake = () => {
    if (disposed || frame || !needsLoop()) return;
    last = performance.now();
    acc = 0;
    frame = window.requestAnimationFrame(tick);
  };

  const gather = () => {
    if (mode !== "think") return;
    // Every kept point, tail to pencil, is snapshotted where it stands.
    gn = 0;
    const n = ring.count;
    for (let k = 0; k < n; k += 1) {
      const i = at(ring, k);
      gx[gn] = ring.xs[i] ?? 0;
      gy[gn] = ring.ys[i] ?? 0;
      gn += 1;
    }
    gx[gn] = p.x;
    gy[gn] = p.y;
    gn += 1;
    measureLine();
    mode = "gather";
    stopAnims();
    progress.jump(0);
    pluck.jump(0);
    // At rest once the line is straight AND the pluck has rung out.
    let pending = 2;
    const landed = () => {
      pending -= 1;
      if (pending > 0 || disposed || mode !== "gather") return;
      mode = "rest";
      draw();
      onRest(true);
      cfg.current.onSettled?.();
    };
    anims.push(
      animate(progress, 1, { ...springs.glide, onComplete: landed }),
      // Pulled taut, the line rings once like a plucked string.
      animate(pluck, 0, {
        ...springs.recoil,
        velocity: -height * 4.2,
        delay: 0.2,
        onComplete: landed,
      }),
    );
    wake();
  };

  const resume = () => {
    if (mode === "think") return;
    stopAnims();
    if (mode === "rest") restLine();
    // The pencil sets off from the line's end; the straight tail unspools.
    ring = {
      xs: new Float32Array(MAX),
      ys: new Float32Array(MAX),
      head: 0,
      count: 0,
    };
    const g = progress.get();
    for (let i = 0; i < gn; i += 1) {
      const u = gn > 1 ? i / (gn - 1) : 1;
      const e = smooth(g * (1 + SPREAD) - SPREAD * (1 - u));
      push(
        ring,
        lerp(gx[i] ?? 0, lerp(x0, x1, u), e),
        lerp(gy[i] ?? ly, ly, e),
        s.keep,
      );
    }
    const head = at(ring, ring.count - 1);
    p = pencilAt(s, ring.xs[head] ?? x1, ring.ys[head] ?? ly, Math.PI * 0.8);
    mode = "think";
    onRest(false);
    wake();
  };

  const resize = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg.current.dpr, 0.5, 2),
    );
    width = w;
    height = h;
    scale = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    s = { ...cfg.current.shape, w: Math.max(cfg.current.shape.w, w), h };
    if (mode === "rest") restLine();
    draw();
  };

  const readInk = () => {
    ink = getComputedStyle(carrier).color || "currentColor";
    if (!frame) draw();
  };

  if (mode === "rest") restLine();
  readInk();
  resize();
  if (mode === "rest") onRest(true);

  return {
    setThinking: (thinking) => (thinking ? resume() : gather()),
    configure: () => {
      s = {
        ...cfg.current.shape,
        w: Math.max(cfg.current.shape.w, width),
        h: height,
      };
      if (ring.count > s.keep) ring.count = s.keep;
      if (!frame) draw();
      wake();
    },
    resize,
    readInk,
    wake,
    dispose: () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      stopAnims();
    },
  };
}

/**
 * A thinking indicator drawn as a wandering line. In a small box an
 * invisible pencil keeps moving: it travels, curls into small loops, turns
 * hairpins and doubles back, bounces softly off the walls, and only the last
 * `tail` px of its path stay, fading from full ink at the pencil to nothing.
 *
 * When thinking ends the stroke is pulled taut: every point travels to its
 * place on a straight line, the pencil end first and the tail last on the
 * glide spring, and the line, now straight, rings once like a plucked string
 * on the recoil spring while the status word fades in at its end. Thinking
 * again, the pencil sets off from the line's end and the straight tail
 * unspools behind it.
 *
 * The state is spoken politely: `label` when thinking starts, `doneLabel`
 * when it ends. Under reduced motion a still, seeded scribble stands in the
 * box and crossfades to the line and the word.
 */
export function ThinkThread({
  thinking = true,
  label = "Thinking",
  doneLabel = "Done",
  pace = 1,
  wander = 0.5,
  color = "ink",
  tail = 140,
  strokeWidth = 1.25,
  size = "md",
  seed = 7,
  paused = false,
  dpr = 2,
  onSettled,
  className,
}: ThinkThreadProps) {
  const motionSafe = useMotionSafe();
  const box = BOXES[size] ?? BOXES.md;
  const stroke = clamp(strokeWidth, 0.5, 4);
  const ink = INKS[color as ThinkThreadColor] ?? color;
  const shape = React.useMemo(
    () => shapeOf(box.w, box.h, pace, wander, seed, tail, stroke),
    [box.w, box.h, pace, wander, seed, tail, stroke],
  );
  const still = React.useMemo(() => stillPaths(shape), [shape]);

  // Whether the canvas has drawn (the still frame steps aside), and whether
  // the line has come to rest (the DOM line takes over from the canvas).
  const [live, setLive] = React.useState(false);
  const [resting, setResting] = React.useState(!thinking);

  const rootRef = React.useRef<HTMLSpanElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const lineRef = React.useRef<HTMLSpanElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const cfg = React.useRef<Config>({
    thinking,
    paused,
    shape,
    stroke,
    dpr,
    onSettled,
  });

  React.useEffect(() => {
    cfg.current = { thinking, paused, shape, stroke, dpr, onSettled };
    engine.current?.configure();
  });

  React.useEffect(() => {
    if (!motionSafe) return;
    const canvas = canvasRef.current;
    const root = rootRef.current;
    const line = lineRef.current;
    const carrier = carrierRef.current;
    if (!canvas || !root || !line || !carrier) return;
    const e = createEngine(
      canvas,
      root,
      line,
      carrier,
      cfg,
      visible,
      () => setLive(true),
      setResting,
    );
    engine.current = e;
    e.wake();
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) e.wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [motionSafe]);

  const thinkingShown = React.useRef(thinking);
  React.useEffect(() => {
    if (thinkingShown.current === thinking) return;
    thinkingShown.current = thinking;
    engine.current?.setThinking(thinking);
  }, [thinking]);

  // Reduced motion has no canvas: the line is at rest exactly when thinking
  // is over.
  const settledNow = motionSafe ? resting : !thinking;
  const wordIn = !thinking;
  const fade = (on: boolean, delay = 0) =>
    motionSafe
      ? {
          opacity: {
            duration: on ? durations.base : durations.fast,
            delay: on ? delay : 0,
            ease: on ? easings.enter : easings.exit,
          },
          x: on
            ? { ...springs.snap, delay }
            : { duration: durations.fast, ease: easings.exit },
        }
      : { duration: durations.base, ease: easings.enter };

  return (
    <span
      ref={rootRef}
      className={cn(
        "relative inline-flex shrink-0 items-center align-middle",
        className,
      )}
      style={{ minWidth: box.w, height: box.h }}
    >
      <span role="status" aria-live="polite" className="sr-only">
        {thinking ? label : doneLabel}
      </span>
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readInk()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: ink }}
      />
      {motionSafe ? (
        <canvas
          ref={canvasRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 size-full",
            settledNow && "opacity-0",
          )}
        />
      ) : null}
      <motion.svg
        aria-hidden
        width={box.w}
        height={box.h}
        viewBox={`0 0 ${box.w} ${box.h}`}
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        initial={false}
        animate={{ opacity: (motionSafe && live) || !thinking ? 0 : 1 }}
        transition={
          motionSafe && live
            ? { duration: 0 }
            : { duration: durations.slow, ease: easings.enter }
        }
      >
        <g style={{ color: ink }}>
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {still.pieces.map((piece) => (
              <path key={piece.opacity} d={piece.d} opacity={piece.opacity} />
            ))}
          </g>
          <circle
            cx={still.tip.x}
            cy={still.tip.y}
            r={r2(stroke * 0.95)}
            fill="currentColor"
          />
        </g>
      </motion.svg>
      <span aria-hidden className="relative flex w-full items-center gap-2">
        <span
          ref={lineRef}
          className={cn(
            "min-w-6 flex-1",
            // The canvas hands over to it in place; reduced motion crossfades.
            !motionSafe && "transition-opacity duration-300",
            !settledNow && "opacity-0",
          )}
          style={{
            height: stroke,
            borderRadius: stroke,
            background: `linear-gradient(to right, color-mix(in oklab, ${ink} 35%, transparent), ${ink})`,
          }}
        />
        <motion.span
          className={cn("whitespace-nowrap text-ink-2", box.text)}
          initial={false}
          animate={{
            opacity: wordIn ? 1 : 0,
            x: wordIn || !motionSafe ? 0 : -distances.nudge,
          }}
          transition={fade(wordIn, 0.16)}
        >
          {doneLabel}
        </motion.span>
      </span>
    </span>
  );
}
