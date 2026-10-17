"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FireflyLettersElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type FireflyLettersTrigger = "mount" | "inView" | "manual";

export type FireflyLettersBackdrop = "dusk" | "none";

export type FireflyLettersProps = {
  /** The headline, as a string. Wins over `text`. */
  children?: string;
  /** The headline, when it is not given as children. */
  text?: string;
  /** The element that carries the headline. @default "p" */
  as?: FireflyLettersElement;
  /** How many fireflies draw the words. @default 450 */
  count?: number;
  /** How often and how brightly they flash, 0 (a steady glow) to 1. @default 0.5 */
  blink?: number;
  /** How near the pointer may come before they scatter, and how long they stay away, 0 to 1. @default 0.5 */
  shyness?: number;
  /** How strongly their flashes fall into step with each other, 0 to 1. @default 0.4 */
  sync?: number;
  /** Their light, any CSS colour. @default a warm yellow-green */
  color?: string;
  /** How far each one's halo spreads, 0 to 1. @default 0.6 */
  glow?: number;
  /** The radius of a firefly's bright core, px. @default 1.6 */
  size?: number;
  /** How much they bob in their spots, 0 to 1. @default 0.3 */
  wander?: number;
  /** A dusk panel behind them, or none (put them on your own dark ground). @default "dusk" */
  backdrop?: FireflyLettersBackdrop;
  /** When they arrive and light the words. @default "inView" */
  trigger?: FireflyLettersTrigger;
  /** Arrive once, or each time the headline comes back into view. @default true */
  once?: boolean;
  /** With trigger "manual": true brings them in. @default false */
  play?: boolean;
  /** Wait before they arrive, ms. @default 0 */
  delay?: number;
  /** The pointer, a touch and the keys startle them. @default true */
  interactive?: boolean;
  /** Hold the scene still. @default false */
  paused?: boolean;
  /** Seeds their spots, rhythms and flights. @default 7 */
  seed?: number;
  /** The most device pixels per CSS pixel the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** How many are away from their spots, whenever that changes. */
  onScatter?: (away: number) => void;
  /** The words are whole again: every firefly is back and lit. */
  onComplete?: () => void;
  className?: string;
};

const DEFAULT_COLOR = "oklch(0.9 0.17 118)";

/** A dusk sky over a meadow: fixed art, the same night in either theme. */
const DUSK =
  "radial-gradient(120% 80% at 50% 120%, oklch(0.3 0.05 150 / 0.55), transparent 62%), radial-gradient(90% 70% at 18% -10%, oklch(0.32 0.05 285 / 0.45), transparent 60%), linear-gradient(to bottom, oklch(0.19 0.035 268), oklch(0.135 0.03 252))";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const TAU = Math.PI * 2;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator, so a headline is drawn by the same swarm every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A lampyrid's flash: a quick swell and a slower fade, then dark. */
function pulse(phase: number): number {
  const u = phase - Math.floor(phase);
  if (u < 0.07) return (u / 0.07) * (u / 0.07);
  if (u < 0.36) return Math.exp(-(u - 0.07) / 0.07);
  return 0;
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

/** Any CSS colour (tokens included) as RGB, resolved on the element it lights. */
function rgbOf(host: HTMLElement, color: string): [number, number, number] {
  const probe = document.createElement("span");
  probe.style.color = color;
  probe.style.display = "none";
  host.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const pixel = document.createElement("canvas");
  pixel.width = 1;
  pixel.height = 1;
  const ctx = pixel.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [222, 240, 140];
  ctx.fillStyle = "rgb(222, 240, 140)";
  ctx.fillStyle = resolved;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 222, d[1] ?? 240, d[2] ?? 140];
}

/** The halo and the core as two small pre-drawn sprites: one `drawImage` each per firefly. */
function spritesOf(rgb: [number, number, number]) {
  const [r, g, b] = rgb;
  const halo = document.createElement("canvas");
  halo.width = 64;
  halo.height = 64;
  const hctx = halo.getContext("2d");
  if (hctx) {
    const grad = hctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`);
    grad.addColorStop(0.25, `rgba(${r}, ${g}, ${b}, 0.22)`);
    grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.06)`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    hctx.fillStyle = grad;
    hctx.fillRect(0, 0, 64, 64);
  }
  const core = document.createElement("canvas");
  core.width = 16;
  core.height = 16;
  const cctx = core.getContext("2d");
  if (cctx) {
    const grad = cctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    // The lantern's heart runs nearly white; its rim is the colour.
    const mix = (c: number) => Math.round(c + (255 - c) * 0.7);
    grad.addColorStop(0, `rgba(${mix(r)}, ${mix(g)}, ${mix(b)}, 1)`);
    grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.9)`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, 16, 16);
  }
  return { halo, core };
}

const HOME = 0;
const FLED = 1;
const BACK = 2;

type Swarm = {
  n: number;
  hx: Float32Array;
  hy: Float32Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** Flash phase, in cycles. */
  ph: Float32Array;
  /** Each one's own flash rate, as a multiple of the shared one. */
  rate: Float32Array;
  /** Resting glow, 0..1. */
  base: Float32Array;
  /** Current brightness, eased. */
  lum: Float32Array;
  /** The startled flash, decaying. */
  spark: Float32Array;
  mode: Uint8Array;
  /** When a fled one starts back, ms. */
  due: Float64Array;
  /** When a startled one went dark, ms (for the blink-out). */
  since: Float64Array;
  seedA: Float32Array;
  seedB: Float32Array;
  /** A relit one's swell, decaying. */
  relight: Float32Array;
};

function swarmOf(n: number, seed: number): Swarm {
  const rand = lcg(seed ^ 0x51f15e);
  const s: Swarm = {
    n,
    hx: new Float32Array(n),
    hy: new Float32Array(n),
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    ph: new Float32Array(n),
    rate: new Float32Array(n),
    base: new Float32Array(n),
    lum: new Float32Array(n),
    spark: new Float32Array(n),
    mode: new Uint8Array(n),
    due: new Float64Array(n),
    since: new Float64Array(n),
    seedA: new Float32Array(n),
    seedB: new Float32Array(n),
    relight: new Float32Array(n),
  };
  for (let i = 0; i < n; i += 1) {
    // Out in the dark until the trigger brings them in.
    s.mode[i] = FLED;
    s.due[i] = Infinity;
    s.ph[i] = rand();
    s.rate[i] = 0.84 + rand() * 0.32;
    s.base[i] = 0.26 + rand() * 0.2;
    s.seedA[i] = rand() * TAU;
    s.seedB[i] = rand() * TAU;
  }
  return s;
}

/**
 * Spots inside the glyphs: the words drawn into an offscreen mask exactly
 * where the DOM laid them out, then a seeded jittered grid kept where it
 * lands on ink — even coverage without clumps, the same every time.
 */
function sampleSpots(
  root: HTMLElement,
  words: HTMLElement[],
  count: number,
  seed: number,
): { xs: Float32Array; ys: Float32Array } | null {
  const rect = root.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const ctx = mask.getContext("2d", { willReadFrequently: true });
  if (!ctx || words.length === 0) return null;
  ctx.fillStyle = "white";
  ctx.textBaseline = "alphabetic";
  for (const word of words) {
    const style = getComputedStyle(word);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spacing = parseFloat(style.letterSpacing);
    (
      ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    ).letterSpacing = Number.isFinite(spacing) ? `${spacing}px` : "0px";
    const r = word.getBoundingClientRect();
    const m = ctx.measureText("Hg");
    const asc = m.fontBoundingBoxAscent || parseFloat(style.fontSize) * 0.8;
    const desc = m.fontBoundingBoxDescent || parseFloat(style.fontSize) * 0.2;
    const baseline = r.top - rect.top + (r.height - (asc + desc)) / 2 + asc;
    ctx.fillText(word.textContent ?? "", r.left - rect.left, baseline);
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  let area = 0;
  for (let p = 3; p < data.length; p += 16) if ((data[p] ?? 0) > 127) area += 4;
  if (area === 0) return null;
  const inside = (x: number, y: number) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= w || py >= h) return false;
    return (data[(py * w + px) * 4 + 3] ?? 0) > 127;
  };
  let cell = Math.max(1.2, Math.sqrt(area / count) * 0.92);
  let picks: number[] = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const rand = lcg(seed ^ Math.imul(attempt + 1, 0x9e3779b1));
    picks = [];
    for (let gy = 0; gy < h; gy += cell) {
      for (let gx = 0; gx < w; gx += cell) {
        const x = gx + rand() * cell;
        const y = gy + rand() * cell;
        if (inside(x, y)) picks.push(x, y);
      }
    }
    if (picks.length / 2 >= count) break;
    cell *= 0.82;
  }
  const total = picks.length / 2;
  const take = Math.min(count, total);
  // A seeded shuffle keeps an even spread when there are more spots than lights.
  const order = Array.from({ length: total }, (_, i) => i);
  const rand = lcg(seed ^ 0x2545f491);
  for (let i = total - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = order[i] as number;
    order[i] = order[j] as number;
    order[j] = t;
  }
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const k = order[i % Math.max(1, take)] ?? 0;
    xs[i] = picks[k * 2] ?? 0;
    ys[i] = picks[k * 2 + 1] ?? 0;
  }
  return { xs, ys };
}

type Api = {
  wake: () => void;
  halt: () => void;
  layout: () => void;
  arrive: () => void;
  startle: (x: number, y: number, wave: boolean) => void;
};

/**
 * A headline drawn by a few hundred fireflies on a dusk panel. The words are
 * laid out for real (selectable, a faint ghost of themselves); their glyphs
 * are sampled into home spots, and a firefly hovers at each, glowing softly
 * and flashing on its own rhythm — a quick swell and a slower fade. Their
 * rhythms are coupled oscillators, so a settled word slowly falls into step
 * and its flashes ripple across it together.
 *
 * Bring the pointer near and the ones within reach flash once, bright, and
 * burst away from it with an upward start, blinking out as they coast into
 * the dark on a wandering flight. After a pause they come back one by one,
 * nearest first — weaving in on a steering force that arrives softly,
 * glowing dimly on the way — and each relights its spot with a swell until
 * the word is whole again. They arrive the same way on the trigger. Keyboard
 * focus startles the whole line in a wave from the left; Enter or Space
 * startles it again; a tap or a sideways drag startles them on touch.
 *
 * One canvas, one loop, two pre-drawn sprites: the loop halts off screen, in a
 * hidden tab and when paused, and stops altogether when nothing flashes or
 * flies. Under reduced motion they sit still in their spots at a steady glow,
 * and a startle blinks the near ones out and relights them in place, in order.
 */
export function FireflyLetters({
  children,
  text,
  as = "p",
  count = 450,
  blink = 0.5,
  shyness = 0.5,
  sync = 0.4,
  color = DEFAULT_COLOR,
  glow = 0.6,
  size = 1.6,
  wander = 0.3,
  backdrop = "dusk",
  trigger = "inView",
  once = true,
  play = false,
  delay = 0,
  interactive = true,
  paused = false,
  seed = 7,
  dpr = 2,
  onScatter,
  onComplete,
  className,
}: FireflyLettersProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const line = ((typeof children === "string" ? children : text) ?? "").trim();
  const words = React.useMemo(() => line.split(/\s+/).filter(Boolean), [line]);
  const n = Math.round(clamp(count, 20, 1500));
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden && !paused;
  // The server's frame is the lit headline itself; once the swarm is on the
  // canvas the words fall back to a ghost the fireflies draw over.
  const [live, setLive] = React.useState(false);
  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const wordNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const swarm = React.useRef<Swarm>(swarmOf(0, seed));
  const sprites = React.useRef<ReturnType<typeof spritesOf> | null>(null);
  const view = React.useRef({ w: 0, h: 0, ratio: 1, em: 16, ready: false });
  const pointer = React.useRef({ x: 0, y: 0, at: -Infinity, inside: false });
  const clock = React.useRef({
    t: 0,
    frame: 0,
    away: -1,
    whole: true,
    started: false,
    calm: false,
    owed: 0,
    told: 0,
  });
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const liveRef = React.useRef(running);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    blink,
    shyness,
    sync,
    glow,
    size,
    wander,
    motionSafe,
    n,
    onScatter,
    onComplete,
  });
  const frameRef = React.useRef((now: number) => {
    void now;
  });

  const wake = () => {
    if (raf.current || !liveRef.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  /** The canvas's size and the swarm's spots, from the real layout. */
  const layout = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const rect = root.getBoundingClientRect();
    const ratio = Math.min(2, Math.max(0.5, dpr), window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const em = parseFloat(getComputedStyle(root).fontSize) || 16;
    view.current = { w, h, ratio, em, ready: true };
    const nodes = words
      .map((_, i) => wordNodes.current.get(i))
      .filter((node): node is HTMLSpanElement => Boolean(node));
    const spots = sampleSpots(
      root,
      nodes,
      cfg.current.n,
      (seed ^ hash(line)) >>> 0,
    );
    let s = swarm.current;
    let fresh = false;
    if (s.n !== cfg.current.n) {
      s = swarmOf(cfg.current.n, seed);
      swarm.current = s;
      fresh = true;
    }
    if (!spots) return;
    for (let i = 0; i < s.n; i += 1) {
      const hx = spots.xs[i] ?? 0;
      const hy = spots.ys[i] ?? 0;
      s.hx[i] = hx;
      s.hy[i] = hy;
      if (s.mode[i] === HOME) {
        s.x[i] = hx;
        s.y[i] = hy;
      }
    }
    const rgb = rgbOf(root, color);
    sprites.current = spritesOf(rgb);
    // A new swarm after the word was lit (a new count) flies in to it.
    if (fresh && clock.current.started) arrive();
    wake();
  };

  /** Everyone out in the dark, to come in one by one in reading order. */
  const arrive = () => {
    const s = swarm.current;
    const { w, h } = view.current;
    const now = performance.now();
    const rand = lcg(seed ^ 0x7f4a7c15);
    const order = Array.from({ length: s.n }, (_, i) => i).sort(
      (a, b) => (s.hx[a] ?? 0) - (s.hx[b] ?? 0),
    );
    const spread = cfg.current.motionSafe ? 2200 : 1200;
    order.forEach((i, rank) => {
      s.mode[i] = FLED;
      s.lum[i] = 0;
      s.spark[i] = 0;
      s.since[i] = now - 1000;
      s.due[i] = now + 120 + (rank / Math.max(1, s.n)) * spread;
      if (cfg.current.motionSafe) {
        // Somewhere out in the dusk, mostly off to the sides and above.
        const side = rand();
        s.x[i] = side < 0.5 ? rand() * w : side < 0.75 ? -20 : w + 20;
        s.y[i] = side < 0.5 ? -24 - rand() * 30 : rand() * h;
        s.vx[i] = (rand() - 0.5) * 40;
        s.vy[i] = (rand() - 0.5) * 40;
      } else {
        s.x[i] = s.hx[i] ?? 0;
        s.y[i] = s.hy[i] ?? 0;
      }
    });
    clock.current.whole = false;
    clock.current.started = true;
    setLive(true);
    wake();
  };

  /** One firefly startled: a bright flash, a burst away from the point, then dark. */
  const scare = (
    i: number,
    px: number,
    py: number,
    now: number,
    lag: number,
    due: number,
    rand: () => number,
    upward: boolean,
  ) => {
    const s = swarm.current;
    const still = !cfg.current.motionSafe;
    s.mode[i] = FLED;
    s.since[i] = now + lag;
    s.due[i] = due;
    s.spark[i] = still ? 0 : 1;
    if (still) return;
    const x = s.x[i] ?? 0;
    const y = s.y[i] ?? 0;
    let dx = upward ? (rand() - 0.5) * 0.6 : x - px;
    let dy = upward ? -1 : y - py;
    const len = Math.hypot(dx, dy) || 1;
    const turn = (rand() - 0.5) * 1.2;
    const ux = dx / len;
    const uy = dy / len;
    dx = ux * Math.cos(turn) - uy * Math.sin(turn);
    dy = ux * Math.sin(turn) + uy * Math.cos(turn) - 0.35;
    const l2 = Math.hypot(dx, dy) || 1;
    const speed = (260 + 360 * rand()) * (upward ? 0.8 : 1);
    s.vx[i] = (dx / l2) * speed;
    s.vy[i] = (dy / l2) * speed;
  };

  /** The ones near a point burst away from it and blink out. */
  const startle = (px: number, py: number, wave: boolean) => {
    const s = swarm.current;
    const c = cfg.current;
    const { w, em } = view.current;
    const now = performance.now();
    const reach = (0.6 + 1.8 * clamp01(c.shyness)) * em;
    const away = 500 + 1800 * clamp01(c.shyness);
    const rand = lcg((Math.round(px * 7 + py * 13) ^ seed) >>> 0);
    const hit: { i: number; d: number }[] = [];
    for (let i = 0; i < s.n; i += 1) {
      if (s.mode[i] === FLED) continue;
      const x = s.x[i] ?? 0;
      const y = s.y[i] ?? 0;
      // The keyboard's wave startles every one of them, from the left.
      const d = wave ? x : Math.hypot(x - px, y - py);
      if (!wave && d > reach) continue;
      hit.push({ i, d });
    }
    if (hit.length === 0) return;
    hit.sort((a, b) => a.d - b.d);
    const back = 900 + 1400 * clamp01(c.shyness);
    hit.forEach(({ i, d }, rank) => {
      const lag = wave ? (d / Math.max(1, w)) * 380 : 0;
      scare(
        i,
        px,
        py,
        now,
        lag,
        now + lag + away + (rank / hit.length) * back + rand() * 120,
        rand,
        wave,
      );
    });
    clock.current.whole = false;
    wake();
  };

  /** Advances the swarm by dt seconds and draws it; returns whether it should keep going. */
  const stepAll = (dt: number, now: number): boolean => {
    const s = swarm.current;
    const c = cfg.current;
    const k = clock.current;
    const { w, h, em } = view.current;
    k.t += dt;
    const t = k.t;
    const still = !c.motionSafe;
    const flashes = c.blink > 0.001 && !still;
    const f0 = 0.14 + 0.5 * clamp01(c.blink);
    const reach = (0.6 + 1.8 * clamp01(c.shyness)) * em;
    const p = pointer.current;
    const threat = p.inside && now - p.at < 1600;
    // The mean field of the flashes, over the ones at home.
    let zr = 0;
    let zi = 0;
    let homes = 0;
    for (let i = 0; i < s.n; i += 1) {
      if (s.mode[i] !== HOME) continue;
      const a = (s.ph[i] ?? 0) * TAU;
      zr += Math.cos(a);
      zi += Math.sin(a);
      homes += 1;
    }
    const R = homes ? Math.hypot(zr, zi) / homes : 0;
    const psi = Math.atan2(zi, zr);
    const K = 0.55 * clamp01(c.sync);
    let away = 0;
    let moving = false;
    const bob = 1.4 * clamp01(c.wander);
    for (let i = 0; i < s.n; i += 1) {
      const mode = s.mode[i] ?? HOME;
      let x = s.x[i] ?? 0;
      let y = s.y[i] ?? 0;
      let vx = s.vx[i] ?? 0;
      let vy = s.vy[i] ?? 0;
      const hx = s.hx[i] ?? 0;
      const hy = s.hy[i] ?? 0;
      let lum = s.lum[i] ?? 0;
      let spark = s.spark[i] ?? 0;
      let relight = s.relight[i] ?? 0;
      const base = s.base[i] ?? 0.3;
      // Coupled rhythm: each one runs at its own rate and is pulled toward
      // the swarm's mean phase in proportion to how coherent the swarm is.
      let ph = s.ph[i] ?? 0;
      if (flashes) {
        ph +=
          dt *
          (f0 * (s.rate[i] ?? 1) +
            (mode === HOME ? (K * R * Math.sin(psi - ph * TAU)) / TAU : 0));
        if (ph > 1e4) ph -= 1e4;
      }
      let goal = base;
      if (mode === HOME) {
        if (!still) {
          x = hx + bob * Math.sin(t * 0.9 + (s.seedA[i] ?? 0));
          y = hy + bob * Math.cos(t * 0.7 + (s.seedB[i] ?? 0));
        }
        goal = base + (flashes ? 0.95 * clamp01(c.blink) * pulse(ph) : 0);
      } else if (mode === FLED) {
        away += 1;
        const dark = now - (s.since[i] ?? now);
        goal = dark < 0 ? lum : 0;
        if (!still && dark >= 0) {
          // Coasting on drag into the dark, steered by a slow wander.
          const drag = Math.exp(-2.4 * dt);
          const wa = t * 1.3 + (s.seedA[i] ?? 0) + y * 0.01;
          vx = vx * drag + Math.cos(wa) * 90 * dt;
          vy = vy * drag + Math.sin(wa * 0.8 + (s.seedB[i] ?? 0)) * 90 * dt;
          // Soft walls a little outside the panel keep them near.
          if (x < -30) vx += 160 * dt;
          if (x > w + 30) vx -= 160 * dt;
          if (y < -30) vy += 160 * dt;
          if (y > h + 30) vy -= 160 * dt;
          x += vx * dt;
          y += vy * dt;
          moving = true;
        }
        if (
          now >= (s.due[i] ?? 0) &&
          !(threat && Math.hypot(hx - p.x, hy - p.y) < reach)
        ) {
          s.mode[i] = BACK;
        }
      } else {
        away += 1;
        goal = 0.1 + 0.08 * Math.sin(t * 9 + (s.seedA[i] ?? 0));
        const dx = hx - x;
        const dy = hy - y;
        const dist = Math.hypot(dx, dy);
        if (still) {
          x = hx;
          y = hy;
        } else {
          // Steering home: a cruise that slows to arrive, with a weave across
          // the line of flight that fades as it nears.
          const cruise = Math.min(150, 26 + dist * 2.2);
          const ux = dist > 0.001 ? dx / dist : 0;
          const uy = dist > 0.001 ? dy / dist : 0;
          const weave =
            Math.sin(t * 2.6 + (s.seedB[i] ?? 0)) *
            0.55 *
            Math.min(1, dist / 40);
          const dvx = (ux - uy * weave) * cruise;
          const dvy = (uy + ux * weave) * cruise;
          vx += (dvx - vx) * Math.min(1, 3.4 * dt);
          vy += (dvy - vy) * Math.min(1, 3.4 * dt);
          x += vx * dt;
          y += vy * dt;
          moving = true;
        }
        if (threat && Math.hypot(x - p.x, y - p.y) < reach * 0.8) {
          // Still shy: the hand is there yet, so off it goes again.
          s.x[i] = x;
          s.y[i] = y;
          scare(
            i,
            p.x,
            p.y,
            now,
            0,
            now + 400 + 1000 * clamp01(c.shyness),
            lcg((i * 2654435761) >>> 0),
            false,
          );
          vx = s.vx[i] ?? 0;
          vy = s.vy[i] ?? 0;
          spark = s.spark[i] ?? 0;
        } else if (still ? true : dist < 1.2) {
          s.mode[i] = HOME;
          relight = still ? 0 : 1;
          vx = 0;
          vy = 0;
        }
      }
      // Brightness eases toward its goal: a fast attack for a flash, a
      // slower fall; reduced motion only ever fades.
      const rate = still ? 1 / durations.base : goal > lum ? 18 : 6;
      lum += (goal - lum) * Math.min(1, rate * dt);
      spark *= Math.exp(-dt / 0.12);
      relight *= Math.exp(-dt / 0.45);
      s.x[i] = x;
      s.y[i] = y;
      s.vx[i] = vx;
      s.vy[i] = vy;
      s.lum[i] = lum;
      s.spark[i] = spark;
      s.relight[i] = relight;
      s.ph[i] = ph;
      if (Math.abs(goal - lum) > 0.01 || spark > 0.01 || relight > 0.01) {
        moving = true;
      }
    }
    draw();
    // Reported as it changes, but no more than about eight times a second
    // (the last report, the whole word, is never held back).
    if (
      k.started &&
      away !== k.away &&
      (away === 0 || k.away <= 0 || now - k.told > 120)
    ) {
      k.away = away;
      k.told = now;
      c.onScatter?.(away);
    }
    if (k.started && away === 0 && !k.whole) {
      k.whole = true;
      c.onComplete?.();
    }
    k.calm = away === 0;
    return (
      (moving && k.started) ||
      (away > 0 && k.started) ||
      flashes ||
      (bob > 0 && !still)
    );
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const art = sprites.current;
    const s = swarm.current;
    const c = cfg.current;
    const { w, h, ratio } = view.current;
    if (!canvas || !ctx || !art) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    // Halos scale with the type, so a caption is not a smear of light and a
    // hero is not a scatter of pins.
    const scale = clamp(view.current.em / 48, 0.45, 1.25);
    const haloR = (3 + 13 * clamp01(c.glow)) * scale;
    const coreR = Math.max(0.6, c.size) * 1.9 * Math.max(0.7, scale);
    for (let i = 0; i < s.n; i += 1) {
      const lum = Math.min(
        1.6,
        (s.lum[i] ?? 0) + 1.1 * (s.spark[i] ?? 0) + 0.7 * (s.relight[i] ?? 0),
      );
      if (lum < 0.01) continue;
      const x = s.x[i] ?? 0;
      const y = s.y[i] ?? 0;
      const hr = haloR * (0.55 + 0.45 * Math.min(1, lum));
      ctx.globalAlpha = Math.min(1, lum * 0.8);
      ctx.drawImage(art.halo, x - hr, y - hr, hr * 2, hr * 2);
      const cr = coreR * (0.7 + 0.3 * Math.min(1, lum));
      ctx.globalAlpha = Math.min(1, lum);
      ctx.drawImage(art.core, x - cr, y - cr, cr * 2, cr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    if (!view.current.ready) return;
    const k = clock.current;
    k.frame += 1;
    k.owed += dt;
    // A whole, resting word only breathes and flashes: half the frames do.
    if (k.calm && k.frame % 2 === 1) {
      raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
      return;
    }
    const keep = stepAll(Math.min(0.08, k.owed), now);
    k.owed = 0;
    if (keep && liveRef.current) {
      raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
    }
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      blink,
      shyness,
      sync,
      glow,
      size,
      wander,
      motionSafe,
      n,
      onScatter,
      onComplete,
    };
    frameRef.current = frame;
    liveRef.current = running;
    api.current = { wake, halt, layout, arrive, startle };
  });

  // The swarm takes the layout once the words are in place, and again
  // whenever the text, the count, the colour or the pixel ratio changes.
  React.useEffect(() => {
    api.current?.layout();
    const ready = window.requestAnimationFrame(() => setLive(true));
    return () => window.cancelAnimationFrame(ready);
  }, [line, n, color, dpr, seed]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
    return () => api.current?.halt();
  }, [running]);

  React.useEffect(() => {
    api.current?.wake();
  }, [blink, sync, glow, size, wander, motionSafe]);

  const arrival = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!started) return;
    arrival.current = window.setTimeout(() => {
      arrival.current = null;
      api.current?.arrive();
    }, delay);
    return () => {
      if (arrival.current !== null) window.clearTimeout(arrival.current);
      arrival.current = null;
    };
    // The delay belongs to the trigger, not to a later change of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, entrance.n]);

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback((restart: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on && !restart ? e : { n: e.n + 1, on: true }));
    }, 0);
  }, []);
  const reset = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin(false);
    if (trigger === "manual") {
      if (play) begin(true);
      else reset();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, begin, reset]);

  const seen = React.useRef({ trigger, once, played: false });
  React.useLayoutEffect(() => {
    seen.current = { ...seen.current, trigger, once };
    if (started) seen.current.played = true;
  });

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const relayout = () => api.current?.layout();
      let first = true;
      const sizer = new ResizeObserver(() => {
        // The first report is the layout the mount effect already took.
        if (first) {
          first = false;
          return;
        }
        relayout();
      });
      sizer.observe(node);
      document.fonts?.addEventListener?.("loadingdone", relayout);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        const t = seen.current;
        if (t.trigger !== "inView") return;
        if (visible) begin(!t.once && t.played);
        else if (!t.once && t.played) reset();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        document.fonts?.removeEventListener?.("loadingdone", relayout);
      };
    },
    [begin, reset],
  );

  const bindWord = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) wordNodes.current.set(i, node);
    else wordNodes.current.delete(i);
  };

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const near = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const at = local(event.clientX, event.clientY);
    pointer.current = { x: at.x, y: at.y, at: performance.now(), inside: true };
    startle(at.x, at.y, false);
  };

  const Tag = as;
  const ghost = `color-mix(in oklab, ${color} 9%, transparent)`;
  const lit = `color-mix(in oklab, ${color} 82%, white)`;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative overflow-clip rounded-3 [contain:paint]",
        interactive && "touch-pan-y",
        className,
      )}
      style={backdrop === "dusk" ? { background: DUSK } : undefined}
      onPointerMove={near}
      onPointerDown={near}
      onPointerLeave={() => {
        pointer.current = { ...pointer.current, inside: false };
      }}
    >
      <Tag className="relative m-0 block px-[0.45em] pt-[0.32em] pb-[0.42em]">
        {words.map((word, i) => (
          <React.Fragment key={i}>
            {i > 0 ? " " : null}
            <span
              ref={bindWord(i)}
              className="inline-block whitespace-nowrap"
              style={{
                color: live ? ghost : lit,
                textShadow: live
                  ? "none"
                  : `0 0 0.18em color-mix(in oklab, ${color} 70%, transparent), 0 0 0.6em color-mix(in oklab, ${color} 35%, transparent)`,
                transition: `color ${durations.page}s cubic-bezier(${easings.enter.join(",")}), text-shadow ${durations.page}s cubic-bezier(${easings.enter.join(",")})`,
              }}
            >
              {word}
            </span>
          </React.Fragment>
        ))}
      </Tag>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 block size-full"
      />
      {interactive ? (
        <>
          <span
            role="button"
            tabIndex={0}
            aria-label="Startle the fireflies"
            aria-describedby={hintId}
            onFocus={(event) => {
              // Keyboard focus startles the whole line, in a wave from the left.
              if (event.currentTarget.matches(":focus-visible")) {
                api.current?.startle(0, 0, true);
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              api.current?.startle(0, 0, true);
            }}
            className="pointer-events-none absolute inset-0 rounded-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Bring the pointer near, or press Enter, and the fireflies scatter;
            they come back one by one.
          </span>
        </>
      ) : null}
    </div>
  );
}
