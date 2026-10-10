"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PigmentFlowPalette = "ink" | "tide" | "ember" | "moss";
export type PigmentFlowElement = "p" | "h1" | "h2" | "h3" | "span" | "div";
export type PigmentFlowTrigger = "mount" | "inView" | "hover" | "manual";

export type PigmentFlowProps = {
  /** The words the pigments drift through. Real text: it wraps, selects and copies. */
  text: string;
  /** The element the text lives in. @default "p" */
  as?: PigmentFlowElement;
  /** The pigments: a named palette of tokens, or 2 to 6 CSS colours of your own. @default "ink" */
  colors?: PigmentFlowPalette | string[];
  /** How fast the pigments drift, 0 (still) to 3. @default 1 */
  speed?: number;
  /** How strongly the pointer stirs the flow, 0 (not at all) to 1. @default 0.6 */
  stir?: number;
  /** Reach of the stir's swirl, em. @default 2.2 */
  radius?: number;
  /** How soft and wide each pigment cloud spreads, 0 (tight) to 1 (diffuse). @default 0.5 */
  diffusion?: number;
  /** Direction of the underlying wash, degrees. @default 100 */
  angle?: number;
  /** Seed for the clouds' paths, so two lines never drift in step. @default 3 */
  seed?: number;
  /** When the drop of pigment blooms into the ink. @default "inView" */
  trigger?: PigmentFlowTrigger;
  /** With `trigger="manual"`, the pigment blooms when this turns true. @default true */
  active?: boolean;
  /** Bloom once, or again whenever the trigger fires anew. @default true */
  once?: boolean;
  /** Wait before the bloom, ms. @default 0 */
  delay?: number;
  /** How long the bloom takes to spread, ms. @default 900 */
  duration?: number;
  /** The bloom has spread and settled. */
  onComplete?: () => void;
  /** Fires when the pointer starts stirring (true) and when the water stills (false). */
  onStirChange?: (stirring: boolean) => void;
  /** Hold the drift. Stirring still works. @default false */
  paused?: boolean;
  /** The pointer, touch and focus stir the flow. @default true */
  interactive?: boolean;
  /** Put the words in the tab order: focused, Left and Right stir the ink. @default false */
  focusable?: boolean;
  className?: string;
};

/** Token pigments, text-tuned on purpose: here the pigment is the type, and it must keep its contrast in both themes. */
const PALETTES: Record<PigmentFlowPalette, string[]> = {
  ink: [
    "var(--accent-bright)",
    "var(--signal)",
    "color-mix(in oklab, var(--danger) 70%, var(--accent-bright))",
    "var(--foreground)",
  ],
  tide: [
    "var(--accent-bright)",
    "color-mix(in oklab, var(--signal) 65%, var(--accent-bright))",
    "var(--signal)",
    "color-mix(in oklab, var(--accent) 55%, var(--foreground))",
  ],
  ember: [
    "var(--danger)",
    "var(--warn)",
    "color-mix(in oklab, var(--danger) 55%, var(--accent-bright))",
    "color-mix(in oklab, var(--warn) 45%, var(--foreground))",
  ],
  moss: [
    "var(--success)",
    "color-mix(in oklab, var(--warn) 60%, var(--success))",
    "var(--signal)",
    "color-mix(in oklab, var(--success) 45%, var(--foreground))",
  ],
};

/** The ink the pigment is let into: what the words are before the bloom. */
const INK = "var(--foreground)";
/** Where the drift starts, s: a composed frame rather than t = 0. */
const T0 = 7.3;
/** Ambient drift is slow; it repaints at most this often, ms. */
const AMBIENT_MS = 33;
/** Pigments a palette may hold. */
const MAX = 6;
/** How much pigment the wash under the clouds holds, against the ink. */
const WASH = 0.62;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

function lcg(seed: number) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x51ed27) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Cloud = {
  /** Resting centre and the reach of its wander, % of the box. */
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  /** Angular frequencies (rad/s) and phases of the wander and the breath. */
  wx: number;
  wy: number;
  ws: number;
  px: number;
  py: number;
  ps: number;
  /** Size, % of the box, before diffusion. */
  rx: number;
  ry: number;
};

type Stop = { w: number; p: number };

/** Seeded paths: incommensurate frequencies, so the drift never visibly repeats. */
function plan(seed: number, n: number) {
  const rand = lcg(seed);
  // Each cloud starts over another pigment's part of the wash, so it reads
  // as colour let into colour rather than more of the same.
  const slots = Array.from({ length: n }, (_, i) => (i + 1 + n / 2) % n);
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = slots[i] ?? 0;
    slots[i] = slots[j] ?? 0;
    slots[j] = a;
  }
  const clouds: Cloud[] = [];
  for (let i = 0; i < n; i += 1) {
    clouds.push({
      cx: lerp(10, 90, ((slots[i] ?? i) + 0.5) / n) + (rand() - 0.5) * 12,
      cy: lerp(30, 70, rand()),
      ax: lerp(12, 26, rand()),
      ay: lerp(14, 32, rand()),
      wx: lerp(0.21, 0.47, rand()),
      wy: lerp(0.17, 0.41, rand()),
      ws: lerp(0.23, 0.53, rand()),
      px: rand() * Math.PI * 2,
      py: rand() * Math.PI * 2,
      ps: rand() * Math.PI * 2,
      rx: lerp(26, 38, rand()),
      ry: lerp(70, 110, rand()),
    });
  }
  const stops: Stop[] = Array.from({ length: n }, () => ({
    w: lerp(0.13, 0.31, rand()),
    p: rand() * Math.PI * 2,
  }));
  return { clouds, stops };
}

type Flow = {
  /** Clock, s. */
  t: number;
  /** 0 (ink) to 1 (pigment): the bloom. */
  bloom: number;
  /** Each cloud's push from the stir, % of the box. */
  dx: Float64Array;
  dy: Float64Array;
};

/** The base layer: one soft cloud per pigment over a drifting wash of them all, mixed in oklab. */
function compose(
  colors: string[],
  shape: ReturnType<typeof plan>,
  f: Flow,
  diffusion: number,
  angle: number,
): string {
  const b = clamp01(f.bloom);
  const n = colors.length;
  // The wash is pigment thinned into the ink; the clouds carry it full.
  const pct = Math.round(b * WASH * 100);
  const tint = (c: string) => `color-mix(in oklab, ${c} ${pct}%, ${INK})`;
  const layers: string[] = [];
  // A clean edge at low diffusion, a long soft one at high.
  const core = Math.round(lerp(28, 4, diffusion));
  const grow = lerp(0.7, 1.45, diffusion);
  shape.clouds.forEach((c, i) => {
    const colour = colors[i % n] ?? INK;
    const breath = 1 + 0.16 * Math.sin(c.ws * f.t + c.ps);
    const x = lerp(50, c.cx + c.ax * Math.sin(c.wx * f.t + c.px), b);
    const y = lerp(55, c.cy + c.ay * Math.sin(c.wy * f.t + c.py), b);
    const rx = c.rx * grow * breath * b;
    const ry = c.ry * grow * breath * b;
    if (rx < 0.5) return;
    layers.push(
      `radial-gradient(${r2(rx)}% ${r2(ry)}% at ${r2(x + (f.dx[i] ?? 0))}% ${r2(y + (f.dy[i] ?? 0))}% in oklab, ${colour} ${core}%, transparent)`,
    );
  });
  // The wash: every pigment in turn, its stops drifting past each other.
  let last = -100;
  const stops = colors.map((c, i) => {
    const s = shape.stops[i];
    const home = n > 1 ? (i / (n - 1)) * 100 : 50;
    const drift = s ? 11 * Math.sin(s.w * f.t + s.p) : 0;
    const at = Math.max(last + 6, home + drift * b);
    last = at;
    return `${tint(c)} ${r2(at)}%`;
  });
  layers.push(
    `linear-gradient(${Math.round(angle)}deg in oklab, ${stops.join(", ")})`,
  );
  return layers.join(", ");
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

/** Gradients interpolated in oklab, or the plain text colour. */
const CLIP =
  "supports-[background-image:linear-gradient(in_oklab,red,red)]:text-transparent";

type Stir = {
  /** The swirl's centre, trailing the pointer on springs.glide, px. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where the hand is, and its velocity, px and px/s. */
  hx: number;
  hy: number;
  hvx: number;
  hvy: number;
  at: number;
  /** The swirl's angle and spin, deg and deg/s; its energy, 0–1. */
  angle: number;
  spin: number;
  energy: number;
  /** Cloud return velocities, %/s. */
  rvx: Float64Array;
  rvy: Float64Array;
  over: boolean;
  stirring: boolean;
};

type Api = {
  kick: () => void;
  bloom: () => void;
  focus: (near: boolean) => void;
  tick: (now: number) => void;
};

/**
 * Gradient text that behaves like pigment let into water. The words are real
 * text clipped to their own background, and the background is a stack of soft
 * radial clouds — one per pigment — over a linear wash of them all, every
 * gradient interpolated in oklab so blue meeting green passes through teal,
 * never grey. One clock drives the stops: each cloud wanders a seeded path of
 * incommensurate frequencies and breathes its size, and the wash's stops drift
 * past each other. No canvas.
 *
 * Arrival: the words start in plain ink and a drop of pigment blooms from
 * their middle — the clouds grow out of the drop to their paths while the
 * wash's colours diffuse up out of the ink — on a critically damped spring
 * sized by `duration` (springs.drift at the default).
 *
 * Stir: a second copy of the words carries a conic swirl of the same pigments
 * around a centre that trails the pointer on springs.glide, masked to `radius`.
 * The pointer's speed feeds the swirl's energy and its turning winds the swirl
 * up, so stirring in circles spins it and it unwinds and fades as the water
 * stills; clouds near the hand are pushed along with it and drift home on a
 * critically damped return. Focus on, in or around the element stirs the
 * middle once. Under reduced motion the composition is still, the bloom is a
 * cross-fade, and the pointer leaves a soft drop of pigment that fades.
 */
export function PigmentFlow({
  text,
  as: Tag = "p",
  colors = "ink",
  speed = 1,
  stir = 0.6,
  radius = 2.2,
  diffusion = 0.5,
  angle = 100,
  seed = 3,
  trigger = "inView",
  active = true,
  once = true,
  delay = 0,
  duration = 900,
  onComplete,
  onStirChange,
  paused = false,
  interactive = true,
  focusable = false,
  className,
}: PigmentFlowProps) {
  const motionSafe = useMotionSafe();
  const hintId = `${React.useId()}-hint`;
  const palette = (
    Array.isArray(colors) ? colors : (PALETTES[colors] ?? PALETTES.ink)
  ).slice(0, MAX);
  const pigments = palette.length >= 2 ? palette : PALETTES.ink;
  const key = pigments.join("|");
  const n = pigments.length;
  const shape = React.useMemo(() => plan(seed, n), [seed, n]);
  const rate = clamp(speed, 0, 3);
  const strength = clamp01(stir);
  const soft = clamp01(diffusion);

  const [onScreen, setOnScreen] = React.useState(false);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const running = onScreen && !hidden;

  // The server and the first client render draw the same frame: plain ink,
  // waiting for the bloom.
  const [first] = React.useState(() =>
    compose(
      pigments,
      shape,
      { t: T0, bloom: 0, dx: new Float64Array(MAX), dy: new Float64Array(MAX) },
      soft,
      angle,
    ),
  );
  const flow = useMotionValue(first);
  const swirl = useMotionValue("none");
  const mask = useMotionValue("none");
  const swirlOpacity = useMotionValue(0);
  const bloom = useMotionValue(0);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const state = React.useRef<Flow>({
    t: T0,
    bloom: 0,
    dx: new Float64Array(MAX),
    dy: new Float64Array(MAX),
  });
  const hand = React.useRef<Stir>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hx: 0,
    hy: 0,
    hvx: 0,
    hvy: 0,
    at: 0,
    angle: 0,
    spin: 0,
    energy: 0,
    rvx: new Float64Array(MAX),
    rvy: new Float64Array(MAX),
    over: false,
    stirring: false,
  });
  /** The element's font size, px: the stir's reach is in em. */
  const em = React.useRef(16);
  const dropRun = React.useRef<AnimationPlaybackControls | null>(null);
  const frame = React.useRef(0);
  const last = React.useRef({ now: 0, painted: 0 });
  const bloomRun = React.useRef<AnimationPlaybackControls | null>(null);
  const bloomed = React.useRef(false);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onComplete, onStirChange });
  /** Every frame goes through the latest render's tick, never a stale one. */
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const paint = () => {
    flow.set(compose(pigments, shape, state.current, soft, angle));
  };

  /**
   * The swirl layer. In motion it is a conic of the pigments spinning round
   * the trailing centre, its opacity the stir's energy; under reduced motion
   * it is a still drop of pigment whose opacity is tweened by the hand.
   */
  const paintSwirl = () => {
    const h = hand.current;
    const show = h.energy * (0.45 + 0.5 * strength);
    // Below the stir's own threshold the swirl is gone, not faint.
    if (motionSafe && (show < 0.01 || h.energy <= 0.02)) {
      swirlOpacity.set(0);
      return;
    }
    const reach = Math.max(8, radius * em.current);
    const b = Math.round(state.current.bloom * 100);
    // Twice round: a tighter spiral that reads as a swirl, not a sector.
    const ring = [...pigments, ...pigments, pigments[0] ?? INK]
      .map((c) => (b >= 100 ? c : `color-mix(in oklab, ${c} ${b}%, ${INK})`))
      .join(", ");
    swirl.set(
      motionSafe
        ? `conic-gradient(from ${r2(h.angle)}deg at ${r2(h.x)}px ${r2(h.y)}px in oklab, ${ring})`
        : `radial-gradient(circle at ${r2(h.x)}px ${r2(h.y)}px in oklab, ${pigments[1] ?? INK}, ${pigments[0] ?? INK})`,
    );
    mask.set(
      `radial-gradient(circle ${r2(reach)}px at ${r2(h.x)}px ${r2(h.y)}px, black, black 28%, transparent)`,
    );
    if (motionSafe) swirlOpacity.set(r2(clamp01(show)));
  };

  /** Reduced motion: the drop fades in where the hand rests, and out. */
  const drop = (on: boolean) => {
    dropRun.current?.stop();
    if (on) paintSwirl();
    dropRun.current = animate(
      swirlOpacity,
      on ? r2(0.3 + 0.45 * strength) : 0,
      on
        ? { duration: durations.slow, ease: easings.enter }
        : { duration: durations.base, ease: easings.exit },
    );
  };

  /** Is anything of the stir still moving. */
  const stirring = () => {
    if (!motionSafe) return false;
    const h = hand.current;
    if (h.energy > 0.02) return true;
    const f = state.current;
    for (let i = 0; i < n; i += 1) {
      if (
        Math.abs(f.dx[i] ?? 0) > 0.05 ||
        Math.abs(f.dy[i] ?? 0) > 0.05 ||
        Math.abs(h.rvx[i] ?? 0) > 0.05 ||
        Math.abs(h.rvy[i] ?? 0) > 0.05
      ) {
        return true;
      }
    }
    return false;
  };

  const drifting = () => motionSafe && !paused && rate > 0;

  /** One step of the water: the swirl's centre, its energy and spin, the pushed clouds. */
  const step = (dt: number) => {
    const h = hand.current;
    const f = state.current;
    const root = rootRef.current;
    if (!root) return;
    const w = Math.max(1, root.clientWidth);
    const hh = Math.max(1, root.clientHeight);
    const unit = em.current;
    // springs.glide, integrated: the water trails the hand.
    const { stiffness, damping, mass } = springs.glide;
    for (let left = dt; left > 1e-6; left -= 1 / 120) {
      const s = Math.min(left, 1 / 120);
      const ax = (stiffness * (h.hx - h.x) - damping * h.vx) / mass;
      const ay = (stiffness * (h.hy - h.y) - damping * h.vy) / mass;
      h.vx += ax * s;
      h.vy += ay * s;
      h.x += h.vx * s;
      h.y += h.vy * s;
    }
    // Speed feeds energy; turning around the centre winds the spin.
    const speedEm = Math.hypot(h.hvx, h.hvy) / unit;
    const rx = h.hx - h.x;
    const ry = h.hy - h.y;
    const torque =
      (rx * h.hvy - ry * h.hvx) / (rx * rx + ry * ry + unit * unit);
    if (h.over) {
      h.energy = Math.min(1, h.energy + speedEm * 0.6 * strength * dt);
      h.spin = clamp(h.spin + torque * 900 * strength * dt, -420, 420);
    }
    // The water stills faster once the hand is out of it.
    h.energy *= Math.exp(-dt / (h.over ? 0.9 : 0.5));
    h.spin *= Math.exp(-dt / (h.over ? 1.1 : 0.7));
    // Spin with nothing left to show it is no stir at all.
    if (h.energy < 0.02 && !h.over) h.spin = 0;
    h.angle = (h.angle + h.spin * dt) % 360;
    h.hvx *= Math.exp(-dt / 0.06);
    h.hvy *= Math.exp(-dt / 0.06);
    // Clouds near the hand are carried with it, then drift home critically
    // damped (ω = 6/s): a push, never a wobble.
    const reach = Math.max(8, radius * unit);
    const omega = 6;
    for (let i = 0; i < n; i += 1) {
      const c = shape.clouds[i];
      if (!c) continue;
      const cx = ((c.cx + (f.dx[i] ?? 0)) / 100) * w;
      const cy = ((c.cy + (f.dy[i] ?? 0)) / 100) * hh;
      const d2 = (cx - h.hx) ** 2 + (cy - h.hy) ** 2;
      const near = h.over ? Math.exp(-d2 / (2 * reach * reach)) : 0;
      const push = near * strength * 0.9;
      let vx = (h.rvx[i] ?? 0) + (h.hvx / w) * 100 * push * dt * 6;
      let vy = (h.rvy[i] ?? 0) + (h.hvy / hh) * 100 * push * dt * 6;
      const px = f.dx[i] ?? 0;
      const py = f.dy[i] ?? 0;
      vx += (-omega * omega * px - 2 * omega * vx) * dt;
      vy += (-omega * omega * py - 2 * omega * vy) * dt;
      h.rvx[i] = vx;
      h.rvy[i] = vy;
      f.dx[i] = clamp(px + vx * dt, -40, 40);
      f.dy[i] = clamp(py + vy * dt, -40, 40);
    }
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!running) return;
    const l = last.current;
    const dt = l.now ? Math.min(0.05, (now - l.now) / 1000) : 1 / 60;
    l.now = now;
    const f = state.current;
    f.bloom = bloom.get();
    const live = motionSafe && (stirring() || hand.current.over);
    if (live) step(dt);
    if (drifting()) f.t += dt * rate;
    const urgent = live || bloom.isAnimating();
    if (urgent || now - l.painted >= AMBIENT_MS) {
      l.painted = now;
      paint();
      paintSwirl();
    }
    const h = hand.current;
    const still = !stirring();
    if (h.stirring && still && !h.over) {
      h.stirring = false;
      report.current.onStirChange?.(false);
    }
    if (drifting() || urgent || !still) {
      frame.current = window.requestAnimationFrame(loop);
    } else {
      l.now = 0;
    }
  };

  const kick = () => {
    if (frame.current || !running) return;
    last.current.now = 0;
    frame.current = window.requestAnimationFrame(loop);
  };

  const runBloom = () => {
    bloomRun.current?.stop();
    bloom.jump(0);
    state.current.bloom = 0;
    const s = Math.max(0.2, duration / 1000);
    const done = () => report.current.onComplete?.();
    // Critically damped and sized by `duration`: drift's stiffness at 900ms.
    const omega = 9.13 / s;
    bloomRun.current = motionSafe
      ? animate(bloom, 1, {
          type: "spring",
          stiffness: r2(omega * omega * 1.2),
          damping: r2(2 * omega * 1.2),
          mass: 1.2,
          delay: Math.max(0, delay) / 1000,
          onComplete: done,
        })
      : animate(bloom, 1, {
          duration: durations.page,
          ease: easings.enter,
          delay: Math.max(0, delay) / 1000,
          onComplete: done,
        });
    kick();
  };

  /** Stir from a point, in the element's px: what the hand and focus share. */
  const stirAt = (x: number, y: number, fresh: boolean) => {
    const h = hand.current;
    if (fresh) {
      h.x = x;
      h.y = y;
      h.vx = 0;
      h.vy = 0;
    }
    h.hx = x;
    h.hy = y;
    if (!h.stirring) {
      h.stirring = true;
      report.current.onStirChange?.(true);
    }
    kick();
  };

  /** The keyboard's spoon: a turn of the ink round the middle, either way. */
  const spoon = (dir: 1 | -1) => {
    const root = rootRef.current;
    if (!root || !interactive) return;
    const h = hand.current;
    if (!motionSafe) {
      h.x = root.clientWidth * (dir > 0 ? 0.62 : 0.38);
      h.y = root.clientHeight / 2;
      drop(true);
      if (!h.stirring) {
        h.stirring = true;
        report.current.onStirChange?.(true);
      }
      return;
    }
    stirAt(root.clientWidth / 2, root.clientHeight / 2, h.energy < 0.05);
    h.energy = Math.min(1, h.energy + 0.35);
    h.spin = clamp(h.spin + dir * 240, -420, 420);
    // The spoon pushes the clouds round with it.
    for (let i = 0; i < n; i += 1) {
      const c = shape.clouds[i];
      if (!c) continue;
      h.rvy[i] = (h.rvy[i] ?? 0) + dir * (c.cx < 50 ? -1 : 1) * 18 * strength;
      h.rvx[i] = (h.rvx[i] ?? 0) + dir * (c.cy < 50 ? 1 : -1) * 18 * strength;
    }
    kick();
  };

  const focus = (near: boolean) => {
    if (!near || !interactive) return;
    const root = rootRef.current;
    if (!root) return;
    const h = hand.current;
    if (!motionSafe) {
      h.x = root.clientWidth / 2;
      h.y = root.clientHeight / 2;
      drop(true);
      return;
    }
    stirAt(root.clientWidth / 2, root.clientHeight / 2, h.energy < 0.05);
    // One slow turn through the middle, as a spoon would.
    h.energy = Math.max(h.energy, 0.75);
    h.spin = 160;
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = { kick, bloom: runBloom, focus, tick };
    report.current = { onComplete, onStirChange };
  });

  // Anything that changes the picture repaints it and lets the loop decide.
  React.useEffect(() => {
    const f = state.current;
    f.bloom = bloom.get();
    flow.set(compose(pigments, shape, f, soft, angle));
    api.current?.kick();
    // `key` stands for the palette's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, shape, soft, angle, running, paused, rate, motionSafe]);

  // The bloom: on its trigger, once (or again when it fires anew).
  const [hoverSeen, setHoverSeen] = React.useState(false);
  const ready =
    trigger === "manual"
      ? active
      : trigger === "mount"
        ? true
        : trigger === "hover"
          ? hoverSeen
          : onScreen;
  React.useEffect(() => {
    if (!ready) {
      if (!once) bloomed.current = false;
      return;
    }
    if (bloomed.current) return;
    bloomed.current = true;
    api.current?.bloom();
  }, [ready, once]);

  // Under "hover" the bloom waits for a first touch; without a pointer it
  // still comes once the words are on screen and focused.
  React.useEffect(() => {
    if (!interactive) return;
    const check = () => {
      const root = rootRef.current;
      const el = document.activeElement;
      const near =
        !!root &&
        !!el &&
        el !== document.body &&
        (root.contains(el) || el.contains(root)) &&
        el.matches(":focus-visible");
      if (near) {
        setHoverSeen(true);
        api.current?.focus(true);
      }
    };
    document.addEventListener("focusin", check);
    return () => document.removeEventListener("focusin", check);
  }, [interactive]);

  React.useEffect(() => {
    const loop = frame;
    const run = bloomRun;
    const fade = dropRun;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      run.current?.stop();
      fade.current?.stop();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      em.current = parseFloat(getComputedStyle(node).fontSize) || 16;
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (event: React.PointerEvent<HTMLElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - r.left - event.currentTarget.clientLeft,
      y: event.clientY - r.top - event.currentTarget.clientTop,
    };
  };

  const enter = (event: React.PointerEvent<HTMLElement>) => {
    if (!interactive) return;
    setHoverSeen(true);
    const p = local(event);
    const h = hand.current;
    h.over = true;
    h.at = event.timeStamp;
    if (!motionSafe) {
      // A soft drop of the next pigment where the hand rests, nothing more.
      h.x = p.x;
      h.y = p.y;
      drop(true);
      if (!h.stirring) {
        h.stirring = true;
        report.current.onStirChange?.(true);
      }
      return;
    }
    stirAt(p.x, p.y, h.energy < 0.05);
  };

  const move = (event: React.PointerEvent<HTMLElement>) => {
    const h = hand.current;
    if (!h.over) return;
    const p = local(event);
    const dt = Math.max(8, event.timeStamp - h.at) / 1000;
    if (motionSafe) {
      // An exponential blend of the hand's velocity, so one jumpy event
      // never reads as a fling.
      h.hvx = lerp(h.hvx, (p.x - h.hx) / dt, 0.5);
      h.hvy = lerp(h.hvy, (p.y - h.hy) / dt, 0.5);
      h.hx = p.x;
      h.hy = p.y;
      h.at = event.timeStamp;
      kick();
    } else {
      h.x = p.x;
      h.y = p.y;
      paintSwirl();
    }
  };

  const leave = () => {
    const h = hand.current;
    if (!h.over) return;
    h.over = false;
    if (!motionSafe) {
      drop(false);
      if (h.stirring) {
        h.stirring = false;
        report.current.onStirChange?.(false);
      }
      return;
    }
    kick();
  };

  return (
    <Tag
      ref={bindRoot as React.Ref<never>}
      onPointerEnter={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "touch") enter(event);
      }}
      onPointerMove={move}
      onPointerLeave={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "touch") leave();
      }}
      onPointerDown={(event: React.PointerEvent<HTMLElement>) => {
        // Touch has no hover: a finger drawn across the words stirs them.
        if (event.pointerType === "touch") enter(event);
      }}
      onPointerUp={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === "touch") leave();
      }}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={focusable && interactive ? hintId : undefined}
      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
        if (!focusable || event.target !== event.currentTarget) return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        spoon(event.key === "ArrowRight" ? 1 : -1);
      }}
      onBlur={() => {
        if (motionSafe || hand.current.over) return;
        drop(false);
        if (hand.current.stirring) {
          hand.current.stirring = false;
          report.current.onStirChange?.(false);
        }
      }}
      onPointerCancel={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === "touch") leave();
      }}
      className={cn(
        "relative",
        Tag === "span" ? "inline-block" : "block",
        interactive && "touch-pan-y",
        focusable &&
          "rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <motion.span
        className={cn(
          "block bg-clip-text [-webkit-background-clip:text]",
          CLIP,
        )}
        style={{ backgroundImage: flow }}
      >
        {text}
      </motion.span>
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 hidden bg-clip-text select-none [-webkit-background-clip:text]",
          "supports-[background-image:linear-gradient(in_oklab,red,red)]:block",
          CLIP,
        )}
        style={{
          backgroundImage: swirl,
          maskImage: mask,
          WebkitMaskImage: mask,
          opacity: swirlOpacity,
        }}
      >
        {text}
      </motion.span>
      {focusable && interactive ? (
        <span id={hintId} className="sr-only">
          Left and Right stir the ink.
        </span>
      ) : null}
    </Tag>
  );
}
