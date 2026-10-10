"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ThreadDriftPalette = "silk" | "indigo" | "meadow" | "ink";

export type ThreadDriftProps = {
  /** The content on top of the threads: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many threads cross the box, 2 to 60. @default 18 */
  count?: number;
  /** The nearest threads' width, px; farther ones are finer. @default 1.4 */
  thickness?: number;
  /** The threads' colours: a named palette, or up to three CSS colours. @default "silk" */
  colors?: ThreadDriftPalette | (string & {}) | readonly string[];
  /** How fast the threads drift, 0 (still) to 2. @default 0.5 */
  speed?: number;
  /** How far the threads bow and swing, 0 (taut) to 1. @default 0.55 */
  sway?: number;
  /** How far a thread strays from its lane, so neighbours cross and part, 0 to 1. @default 0.5 */
  tangle?: number;
  /** How brightly the bends catch the light, 0 (matte) to 1. @default 0.6 */
  sheen?: number;
  /** The pointer and keyboard focus gather the threads, and a press pinches them. @default true */
  interactive?: boolean;
  /** How hard the hand draws the threads in, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far the hand reaches, px. @default 160 */
  radius?: number;
  /** Stop the drift; the hand still gathers the threads. @default false */
  paused?: boolean;
  /** Seeds the lanes, depths and drift, so two skeins never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) gathering the threads. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press pinches the threads (true) and when they are let go (false). */
  onPinchChange?: (pinched: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const PALETTES: Record<ThreadDriftPalette, readonly string[]> = {
  silk: [
    "oklch(from var(--warn) l calc(c * 0.35) calc(h - 10))",
    "oklch(from var(--danger) l calc(c * 0.3) h)",
    "var(--muted-foreground)",
  ],
  indigo: [
    "var(--accent-bright)",
    "oklch(from var(--accent-bright) l c calc(h + 28))",
    "oklch(from var(--accent-bright) l calc(c * 0.4) calc(h - 30))",
  ],
  meadow: [
    "var(--success)",
    "oklch(from var(--success) l c calc(h - 60))",
    "var(--warn)",
  ],
  ink: ["var(--foreground)", "var(--muted-foreground)", "var(--accent-bright)"],
};

/** Control points per thread, end to end. */
const POINTS = 13;
const STEP = 1 / 120;
/**
 * The gather follows on glide, its strength comes and goes on drift, and a
 * pinch lets go on recoil: the threads swing back past their lanes twice.
 */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
const RECOIL = springs.recoil;
/** How long a release swings on recoil before the gather takes over again, s. */
const RELEASE = 1.4;
/** A keyboard pluck holds the pinch this long, s. */
const PLUCK = 0.22;
/** The composed moment the reduced-motion skein is drawn at. */
const STILL_TIME = 23;
/** Reduced motion's press glint dims over about a second. */
const GLINT_FADE = 0.3;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Smooth value noise in -1..1. Arithmetic only — no trig — so the server
 * and the browser trace the same stand-in to the last digit.
 */
function valueNoise(seed: number) {
  const salt = (Math.imul(Math.round(seed) | 0, 0x9e3779b1) ^ 0x85ebca6b) | 0;
  const hash = (x: number, y: number, z: number) => {
    let h =
      (Math.imul(x, 374761393) +
        Math.imul(y, 668265263) +
        Math.imul(z, 1440670441) +
        salt) |
      0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967295) * 2 - 1;
  };
  const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const plane = (xi: number, yi: number, k: number, u: number, v: number) => {
    const a = hash(xi, yi, k);
    const b = hash(xi + 1, yi, k);
    const c = hash(xi, yi + 1, k);
    const d = hash(xi + 1, yi + 1, k);
    const top = a + (b - a) * u;
    return top + (c + (d - c) * u - top) * v;
  };
  return (x: number, y: number, z: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = ease(x - xi);
    const v = ease(y - yi);
    const w = ease(z - zi);
    const near = plane(xi, yi, zi, u, v);
    return near + (plane(xi, yi, zi + 1, u, v) - near) * w;
  };
}

type Noise = ReturnType<typeof valueNoise>;

type Thread = {
  lane: number;
  depth: number;
  hue: number;
  phase: number;
  key: number;
};

/** The skein: lanes spread over the height, depths and hues seeded, far threads first. */
function skeinOf(seed: number, count: number): Thread[] {
  const rand = lcg(seed * 23 + 5);
  const n = Math.round(clamp(count, 2, 60));
  const threads: Thread[] = [];
  for (let i = 0; i < n; i += 1) {
    threads.push({
      lane: (i + 0.25 + 0.5 * rand()) / n,
      depth: rand(),
      hue: Math.floor(rand() * 3),
      phase: rand() * 40,
      key: i * 7 + 3,
    });
  }
  return threads.sort((a, b) => a.depth - b.depth);
}

type Shape = { sway: number; tangle: number };

/** Where a thread's control point rests at time t: its lane, bowed by two octaves of noise. */
function restAt(
  noise: Noise,
  th: Thread,
  j: number,
  t: number,
  w: number,
  h: number,
  count: number,
  shape: Shape,
  out: { x: number; y: number },
) {
  const pad = w * 0.08;
  const u = j / (POINTS - 1);
  const lane = h / Math.max(1, count);
  const amp = Math.min(
    h * 0.45,
    clamp(shape.sway, 0, 1) *
      (lane * (0.45 + 2.8 * clamp(shape.tangle, 0, 1)) + h * 0.05),
  );
  const z = t * 0.22;
  const bow =
    0.6 * noise(u * 0.9 + th.phase, z * 0.5, th.key) +
    noise(j * 0.32 + th.phase, z, th.key + 11) +
    0.45 * noise(j * 0.7 + th.phase * 1.3, z * 1.9, th.key + 29);
  out.x =
    -pad +
    u * (w + 2 * pad) +
    amp * 0.3 * noise(j * 0.4 + th.phase, z * 0.8, th.key + 47);
  out.y = th.lane * h + amp * bow * 0.7;
}

type Rgb = [number, number, number];

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

const css = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;
const luma = (c: Rgb) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

function paletteOf(colors: ThreadDriftProps["colors"]): string[] {
  const list =
    typeof colors === "string"
      ? Object.prototype.hasOwnProperty.call(PALETTES, colors)
        ? PALETTES[colors as ThreadDriftPalette]
        : [colors]
      : (colors ?? PALETTES.silk);
  const picked = list.slice(0, 3).map(String);
  return picked.length > 0 ? picked : [...PALETTES.silk];
}

type Config = {
  count: number;
  thickness: number;
  paintKey: string;
  hues: number;
  speed: number;
  sway: number;
  tangle: number;
  sheen: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onPinch: (pinched: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  pinch: (x: number, y: number) => void;
  release: () => void;
  pluck: (x: number, y: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let active = false;
  let noise = valueNoise(1);
  let threads: Thread[] = [];
  let pluckTimer = 0;
  const read = rgbReader();
  const size = { w: 0, h: 0, dpr: 1 };
  const sim = { t: 0, releaseLeft: 0, settling: false };
  const paint = {
    gap: "rgb(0, 0, 0)",
    inks: ["rgb(0, 0, 0)"],
    sheens: ["rgb(255, 255, 255)"],
  };
  // Positions are sized for the largest skein once, never per frame.
  const cap = 60 * POINTS;
  const rx = new Float32Array(cap);
  const ry = new Float32Array(cap);
  const gx = new Float32Array(cap);
  const gy = new Float32Array(cap);
  const gvx = new Float32Array(cap);
  const gvy = new Float32Array(cap);
  const bend = new Float32Array(cap);
  const rest = { x: 0, y: 0 };
  const hand = {
    x: 0,
    y: 0,
    amount: 0,
    amountV: 0,
    present: false,
    pinched: false,
    held: false,
    source: null as "pointer" | "focus" | null,
  };
  const glint = { x: 0, y: 0, at: 0 };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const layRest = (c: Config) => {
    const shape = { sway: c.sway, tangle: c.tangle };
    const n = threads.length;
    for (let k = 0; k < n; k += 1) {
      const th = threads[k];
      if (!th) continue;
      for (let j = 0; j < POINTS; j += 1) {
        restAt(noise, th, j, sim.t, size.w, size.h, n, shape, rest);
        rx[k * POINTS + j] = rest.x;
        ry[k * POINTS + j] = rest.y;
      }
    }
  };

  /** Steps the gather amount on drift; true while it is still moving. */
  const settleAmount = (c: Config, dt: number) => {
    const target = hand.present && !hand.held && c.interactive ? 1 : 0;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      hand.amountV +=
        ((DRIFT.stiffness * (target - hand.amount) -
          DRIFT.damping * hand.amountV) /
          DRIFT.mass) *
        h;
      hand.amount = clamp(hand.amount + hand.amountV * h, 0, 1.2);
    }
    const arriving =
      Math.abs(target - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = target;
      hand.amountV = 0;
    }
    return arriving;
  };

  /** Every control point's own spring toward the hand's pull; true while any moves. */
  const settlePoints = (c: Config, dt: number) => {
    const n = threads.length * POINTS;
    const spring = sim.releaseLeft > 0 ? RECOIL : GLIDE;
    const strength = clamp(c.pointerStrength, 0, 1);
    const reach = clamp(c.radius, 20, 800) * (hand.pinched ? 1.5 : 1);
    const pull = strength * (hand.pinched ? 1.6 : 0.9);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    let moving = false;
    for (let i = 0; i < n; i += 1) {
      const x = rx[i] ?? 0;
      const y = ry[i] ?? 0;
      let tx = 0;
      let ty = 0;
      const amount = hand.pinched ? 1 : hand.amount;
      if (amount > 0) {
        const dx = hand.x - x;
        const dy = hand.y - y;
        const d2 = (dx * dx + dy * dy) / (reach * reach);
        // Strongest close in; a pinch cinches the gathered threads into a
        // knot under the finger.
        const f = Math.min(0.92, pull * amount * Math.exp(-d2 * 1.2));
        tx = dx * f;
        ty = dy * f;
      }
      let ox = gx[i] ?? 0;
      let oy = gy[i] ?? 0;
      let vx = gvx[i] ?? 0;
      let vy = gvy[i] ?? 0;
      if (ox === tx && oy === ty && vx === 0 && vy === 0) continue;
      for (let s = 0; s < steps; s += 1) {
        vx +=
          ((spring.stiffness * (tx - ox) - spring.damping * vx) / spring.mass) *
          h;
        vy +=
          ((spring.stiffness * (ty - oy) - spring.damping * vy) / spring.mass) *
          h;
        ox += vx * h;
        oy += vy * h;
      }
      if (
        Math.abs(tx - ox) + Math.abs(ty - oy) < 0.05 &&
        Math.abs(vx) + Math.abs(vy) < 0.5
      ) {
        ox = tx;
        oy = ty;
        vx = 0;
        vy = 0;
      } else moving = true;
      gx[i] = ox;
      gy[i] = oy;
      gvx[i] = vx;
      gvy[i] = vy;
    }
    return moving;
  };

  const px = (i: number) => (rx[i] ?? 0) + (gx[i] ?? 0);
  const py = (i: number) => (ry[i] ?? 0) + (gy[i] ?? 0);

  /** A thread's path: Catmull-Rom through its points, as cubic curves. */
  const trace = (base: number) => {
    if (!ctx) return;
    ctx.moveTo(px(base), py(base));
    for (let j = 0; j < POINTS - 1; j += 1) {
      const a = base + Math.max(0, j - 1);
      const b = base + j;
      const c = base + j + 1;
      const d = base + Math.min(POINTS - 1, j + 2);
      ctx.bezierCurveTo(
        px(b) + (px(c) - px(a)) / 6,
        py(b) + (py(c) - py(a)) / 6,
        px(c) - (px(d) - px(b)) / 6,
        py(c) - (py(d) - py(b)) / 6,
        px(c),
        py(c),
      );
    }
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || !visible.current || size.w < 1) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const thick = clamp(c.thickness, 0.25, 8);
    const sheen = clamp(c.sheen, 0, 1);
    const hues = Math.max(1, Math.min(3, c.hues));
    const glintR2 = Math.pow(clamp(c.radius, 20, 800), 2);
    for (let k = 0; k < threads.length; k += 1) {
      const th = threads[k];
      if (!th) continue;
      const base = k * POINTS;
      const width = thick * (0.45 + 0.75 * th.depth);
      // The page colour under each thread: crossings read over and under.
      ctx.globalAlpha = 1;
      ctx.strokeStyle = paint.gap;
      ctx.lineWidth = width + Math.max(1.2, width * 0.9);
      ctx.beginPath();
      trace(base);
      ctx.stroke();
      ctx.globalAlpha = 0.38 + 0.6 * th.depth;
      ctx.strokeStyle = paint.inks[th.hue % hues] ?? paint.gap;
      ctx.lineWidth = width;
      ctx.beginPath();
      trace(base);
      ctx.stroke();
      if (sheen <= 0 && glint.at <= 0) continue;
      // Bends catch the light: a fine sheen just above the thread along each
      // curved stretch, as bright as the stretch is bent.
      for (let j = 1; j < POINTS - 1; j += 1) {
        const i = base + j;
        const ax = px(i) - px(i - 1);
        const ay = py(i) - py(i - 1);
        const bx = px(i + 1) - px(i);
        const by = py(i + 1) - py(i);
        const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
        let lit = sheen * clamp((turn - 0.06) / 0.4, 0, 1);
        if (glint.at > 0) {
          const dx = px(i) - glint.x;
          const dy = py(i) - glint.y;
          lit = Math.max(
            lit,
            glint.at * Math.exp(-(dx * dx + dy * dy) / glintR2),
          );
        }
        bend[i] = lit;
      }
      ctx.strokeStyle = paint.sheens[th.hue % hues] ?? paint.gap;
      ctx.lineWidth = Math.max(0.5, width * 0.45);
      const lift = width * 0.28;
      for (let j = 1; j < POINTS - 1; j += 1) {
        const i = base + j;
        const lit = bend[i] ?? 0;
        if (lit < 0.04) continue;
        const mx0 = (px(i - 1) + px(i)) / 2;
        const my0 = (py(i - 1) + py(i)) / 2;
        const mx1 = (px(i) + px(i + 1)) / 2;
        const my1 = (py(i) + py(i + 1)) / 2;
        ctx.globalAlpha = lit * (0.5 + 0.5 * th.depth);
        ctx.beginPath();
        ctx.moveTo(mx0, my0 - lift);
        ctx.quadraticCurveTo(px(i), py(i) - lift, mx1, my1 - lift);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const calm = () => !sim.settling && sim.releaseLeft <= 0 && glint.at <= 0;

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c) {
      last = 0;
      return;
    }
    // The drift alone draws thirty frames a second; the hand and a release
    // get every frame.
    if (calm() && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const drifting = c.motionSafe && !c.paused && clamp(c.speed, 0, 2) > 0;
    if (drifting) sim.t += dt * clamp(c.speed, 0, 2);
    let moving = false;
    if (c.motionSafe) {
      layRest(c);
      const arriving = settleAmount(c, dt);
      sim.releaseLeft = Math.max(0, sim.releaseLeft - dt);
      const springing = settlePoints(c, dt);
      sim.settling = arriving || springing;
      moving = sim.settling || sim.releaseLeft > 0;
    }
    if (glint.at > 0) {
      glint.at *= Math.exp(-dt / GLINT_FADE);
      if (glint.at < 0.04) glint.at = 0;
      else moving = true;
    }
    draw();
    if (drifting || moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const colourOf = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "rgb(0, 0, 0)";
    };
    const gap = read(colourOf(0));
    const light = luma(gap) > 0.5;
    paint.gap = css(gap);
    // Pigment, not text colour: each hue at a fixed lightness per theme.
    const inks: string[] = [];
    const sheens: string[] = [];
    for (let k = 0; k < 3; k += 1) {
      const at = 1 + k * 3;
      inks.push(css(read(colourOf(at + (light ? 1 : 0)))));
      sheens.push(css(read(colourOf(at + 2))));
    }
    paint.inks = inks;
    paint.sheens = sheens;
  };

  const resetSprings = () => {
    gx.fill(0);
    gy.fill(0);
    gvx.fill(0);
    gvy.fill(0);
    bend.fill(0);
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    if (size.w === w && size.h === h && size.dpr === dpr) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    layRest(c);
    draw();
    kick();
  };

  const startAt = (c: Config) => {
    sim.t = c.motionSafe ? lcg(c.seed * 37 + 1)() * 40 : STILL_TIME;
  };

  const letGo = (c: Config | null) => {
    if (!hand.pinched) return;
    hand.pinched = false;
    // The gather waits until the hand moves again, so the threads swing
    // free on recoil instead of sliding straight back to the finger.
    hand.held = true;
    hand.amount = 0;
    hand.amountV = 0;
    sim.releaseLeft = RELEASE;
    c?.onPinch(false);
    kick();
  };

  const pinch = (x: number, y: number) => {
    const c = cfg;
    if (!c || !c.interactive) return;
    hand.x = x;
    hand.y = y;
    if (!c.motionSafe) {
      // Nothing gathers: the bends round the press catch the light where
      // they lie and dim again.
      glint.x = x;
      glint.y = y;
      glint.at = 1;
      kick();
      return;
    }
    if (hand.pinched) return;
    hand.pinched = true;
    hand.held = false;
    sim.releaseLeft = 0;
    c.onPinch(true);
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        noise = valueNoise(next.seed);
        threads = skeinOf(next.seed, next.count);
        startAt(next);
        readColours();
        resize();
        return;
      }
      if (was.seed !== next.seed) noise = valueNoise(next.seed);
      if (was.seed !== next.seed || was.count !== next.count) {
        threads = skeinOf(next.seed, next.count);
        resetSprings();
      }
      if (was.seed !== next.seed || was.motionSafe !== next.motionSafe) {
        startAt(next);
        resetSprings();
        if (!next.motionSafe) letGo(next);
      }
      if (was.paintKey !== next.paintKey) readColours();
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (!next.interactive) {
        letGo(next);
        if (hand.present) {
          hand.present = false;
          hand.source = null;
          setActive(false);
        }
      }
      layRest(next);
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    handTo(x, y, source) {
      if (hand.held && Math.hypot(x - hand.x, y - hand.y) > 4)
        hand.held = false;
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (cfg?.motionSafe) kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      letGo(cfg);
      hand.present = false;
      hand.source = null;
      hand.held = false;
      setActive(false);
      kick();
    },
    pinch,
    release() {
      letGo(cfg);
    },
    pluck(x, y) {
      const c = cfg;
      if (!c || !c.interactive) return;
      pinch(x, y);
      if (!c.motionSafe) return;
      window.clearTimeout(pluckTimer);
      pluckTimer = window.setTimeout(() => {
        if (!disposed) letGo(cfg);
      }, PLUCK * 1000);
    },
    dispose() {
      disposed = true;
      window.clearTimeout(pluckTimer);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A background of long smooth threads drifting across the box, with the
 * content on top in its own layer. Each thread runs edge to edge through
 * thirteen points that ride two octaves of noise, so it bows and swings like
 * silk in still air; `tangle` lets the sway outgrow the lanes, so neighbours
 * cross, wrap and part again over seconds. Threads sit at their own depths,
 * finer and fainter far back, each laid over a thin stroke of the page
 * colour so crossings read over and under, and where a thread bends it
 * catches the light.
 *
 * The hand gathers the threads: every point within reach is drawn toward it
 * on its own glide spring, strongest close in, so the threads bunch toward
 * the cursor as if lifted by a finger and slide off it as it moves. A press
 * pinches — the gather tightens and widens into a knot under the finger —
 * and on release the threads let go on recoil, swinging back past their
 * lanes twice before settling into the drift. Keyboard focus on a control
 * inside gathers the threads to it and plucks them once. Canvas 2D, thirty
 * frames a second while only the drift runs; only on screen in a visible
 * page. Under reduced motion the skein is still at a composed moment, and a
 * press lights the bends round it without anything moving.
 */
export function ThreadDrift({
  children,
  count = 18,
  thickness = 1.4,
  colors = "silk",
  speed = 0.5,
  sway = 0.55,
  tangle = 0.5,
  sheen = 0.6,
  interactive = true,
  pointerStrength = 0.6,
  radius = 160,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onPinchChange,
  className,
}: ThreadDriftProps) {
  const motionSafe = useMotionSafe();
  const listKey = typeof colors === "string" ? colors : colors.join("|");
  const palette = React.useMemo(
    () => paletteOf(colors),
    // The list is compared by its contents, not its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listKey],
  );
  const paints = React.useMemo(() => {
    const out = [
      `color-mix(in oklab, var(--background) 97%, ${palette[0] ?? "var(--foreground)"})`,
    ];
    for (let k = 0; k < 3; k += 1) {
      const colour = palette[k % palette.length] ?? "var(--foreground)";
      out.push(`oklch(from ${colour} 0.8 calc(c * 0.9) h)`);
      out.push(`oklch(from ${colour} 0.5 c h)`);
      out.push(`color-mix(in oklab, oklch(from ${colour} 0.9 c h) 45%, white)`);
    }
    return out;
  }, [palette]);
  const paintKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onPinchChange });

  const config: Config = {
    count,
    thickness,
    paintKey,
    hues: palette.length,
    speed,
    sway,
    tangle,
    sheen,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onPinch: (p) => report.current.onPinchChange?.(p),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onPinchChange };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit)) {
      engine.current?.pinch(at.x, at.y);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    engine.current?.release();
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside gathers the threads to it and plucks
  // them once: the same release a press and let-go gives.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.pluck(at.x, at.y);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        // A sideways drag draws the threads along on touch; an upright one
        // scrolls.
        "group/thread-drift relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{ backgroundColor: paints[0] }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <StandIn
        seed={seed}
        count={count}
        sway={sway}
        tangle={tangle}
        thickness={thickness}
        palette={palette}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The designed still for the server render and the first paint: the same
 * skein at the composed moment, traced in a 1000 by 300 box stretched to fit
 * and drawn at a mid lightness that reads on light and dark pages alike.
 */
function StandIn({
  seed,
  count,
  sway,
  tangle,
  thickness,
  palette,
}: {
  seed: number;
  count: number;
  sway: number;
  tangle: number;
  thickness: number;
  palette: readonly string[];
}) {
  const lines = React.useMemo(() => {
    const noise = valueNoise(seed);
    const threads = skeinOf(seed, count);
    const at = { x: 0, y: 0 };
    const xs: number[] = [];
    const ys: number[] = [];
    return threads.map((th) => {
      xs.length = 0;
      ys.length = 0;
      for (let j = 0; j < POINTS; j += 1) {
        restAt(
          noise,
          th,
          j,
          STILL_TIME,
          1000,
          300,
          threads.length,
          { sway, tangle },
          at,
        );
        xs.push(at.x);
        ys.push(at.y);
      }
      const p = (j: number) => [xs[j] ?? 0, ys[j] ?? 0] as const;
      let d = `M${r1(xs[0] ?? 0)} ${r1(ys[0] ?? 0)}`;
      for (let j = 0; j < POINTS - 1; j += 1) {
        const [ax, ay] = p(Math.max(0, j - 1));
        const [bx, by] = p(j);
        const [cx, cy] = p(j + 1);
        const [dx, dy] = p(Math.min(POINTS - 1, j + 2));
        d += `C${r1(bx + (cx - ax) / 6)} ${r1(by + (cy - ay) / 6)} ${r1(cx - (dx - bx) / 6)} ${r1(cy - (dy - by) / 6)} ${r1(cx)} ${r1(cy)}`;
      }
      return {
        d,
        hue: th.hue,
        width:
          Math.round(
            clamp(thickness, 0.25, 8) * (0.45 + 0.75 * th.depth) * 100,
          ) / 100,
        opacity: Math.round((0.38 + 0.6 * th.depth) * 100) / 100,
      };
    });
  }, [seed, count, sway, tangle, thickness]);
  return (
    <svg
      aria-hidden
      viewBox="0 0 1000 300"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/thread-drift:opacity-0"
    >
      {lines.map((line, i) => (
        <path
          key={i}
          d={line.d}
          fill="none"
          stroke={`oklch(from ${palette[line.hue % Math.max(1, palette.length)] ?? "var(--foreground)"} 0.66 c h)`}
          strokeOpacity={line.opacity}
          strokeWidth={line.width}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
