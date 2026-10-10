"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GlowRainColor = "cobalt" | "amber" | "rose" | "mint";

export type GlowRainProps = {
  /** The content on top of the rain: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many streaks, 0 to 1: about 30 to 200 on a wide card, scaled to the box's area. @default 0.55 */
  density?: number;
  /** How fast it falls, 0.1 to 3. @default 1 */
  speed?: number;
  /** The light's colour: a named one, or any CSS colour. @default "cobalt" */
  color?: GlowRainColor | (string & {});
  /** Depth of field, 0 to 1: how much larger and blurrier the near streaks are. @default 0.6 */
  depth?: number;
  /** A far streak's length, px; near ones are longer. @default 70 */
  length?: number;
  /** How long the faint trail behind each streak runs, 0 to 1. @default 0.5 */
  trail?: number;
  /** How often a brighter streak falls, 0 to 1. @default 0.4 */
  flare?: number;
  /** The resting lean of the rain, degrees; positive leans it to the right. @default 6 */
  wind?: number;
  /** The pointer and keyboard focus lean the rain, and a press drops a bright streak. @default true */
  interactive?: boolean;
  /** How far the pointer can lean the rain, 0 to 1 (up to 24°). @default 0.6 */
  pointerStrength?: number;
  /** Stop the fall; the wind still answers the pointer. @default false */
  paused?: boolean;
  /** Seeds where every streak starts and how deep it sits. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) leaning the rain. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Light at fixed lightness: in a dark theme it glows, in a light one it is deepened to read. */
const COLORS: Record<GlowRainColor, string> = {
  cobalt: "oklch(from var(--accent-bright) 0.8 calc(c * 0.7) h)",
  amber: "oklch(0.83 0.12 76)",
  rose: "oklch(0.78 0.12 8)",
  mint: "oklch(0.85 0.11 166)",
};
const SKY = "var(--background)";

const LEVELS = 4;
/** The near streaks lean this much more than the far ones. */
const MAX_LEAN = (24 * Math.PI) / 180;
const REFERENCE_AREA = 760 * 232;
const STEP = 1 / 120;
/** The wind swings in on drift: no bounce, a long settle. */
const DRIFT = springs.drift;
const SPRITE_LENGTH = 160;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const deg = (d: number) => (d * Math.PI) / 180;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
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

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const css = ([r, g, b]: Rgb, a = 1) =>
  a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Field = {
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  v: Float32Array;
  len: Float32Array;
  alpha: Float32Array;
  level: Uint8Array;
  flare: Uint8Array;
};

type Sprite = { canvas: HTMLCanvasElement; width: number };

type Config = {
  density: number;
  speed: number;
  paintKey: string;
  depth: number;
  length: number;
  trail: number;
  flare: number;
  wind: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  drop: (x: number, y: number) => void;
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
  let field: Field | null = null;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let active = false;
  let rand = lcg(1);
  const size = { w: 0, h: 0, dpr: 1 };
  const read = rgbReader();
  const sky = document.createElement("canvas");
  const sprites: Sprite[] = [];
  let flareSprite: Sprite | null = null;
  const paint = {
    sky: [10, 12, 20] as Rgb,
    light: [180, 200, 255] as Rgb,
    lightTheme: false,
  };
  const sim = { lean: 0, leanV: 0, t: 0 };
  const hand = {
    x: 0,
    y: 0,
    lastX: 0,
    at: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };
  const press = { x: 0, y: 0, t: -10 };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const trailScale = () => {
    const c = cfg;
    const t = clamp(c?.trail ?? 0.5, 0, 1) * (c && !c.motionSafe ? 1.8 : 1);
    return 1 + t * 2.2;
  };

  /** One streak's light, laid out as a sprite: a Gaussian across, a head at the bottom, a fading body and trail. */
  const buildSprite = (sigma: number, flare: boolean): Sprite => {
    const { dpr } = size;
    const width = Math.ceil(sigma * 6 + 3);
    const el = document.createElement("canvas");
    el.width = Math.max(1, Math.round(width * dpr));
    el.height = SPRITE_LENGTH;
    const sctx = el.getContext("2d");
    if (!sctx) return { canvas: el, width };
    const img = sctx.createImageData(el.width, el.height);
    const body = 1 / trailScale();
    const typical = clamp(cfg?.length ?? 70, 10, 400) * 1.2 * trailScale();
    const capFrac = clamp((2.4 * sigma) / typical, 0.03, 0.3);
    const tint = paint.lightTheme
      ? mixRgb(paint.light, [0, 0, 0], 0.28)
      : paint.light;
    const white: Rgb = paint.lightTheme
      ? mixRgb(paint.light, [255, 255, 255], 0.2)
      : [255, 255, 255];
    const half = el.width / 2;
    const sx = sigma * dpr;
    for (let j = 0; j < el.height; j += 1) {
      const t = (j + 0.5) / el.height;
      let along: number;
      if (t >= 1 - body) {
        const u = (t - (1 - body)) / body;
        along = Math.pow(u, 1.5);
      } else {
        along = 0.14 * Math.pow(t / (1 - body), 1.4);
      }
      // A rounded head, as soft along the streak as the blur is across it.
      const cap = clamp((1 - t) / capFrac, 0, 1);
      along *= cap * cap * (3 - 2 * cap);
      for (let i = 0; i < el.width; i += 1) {
        const dx = (i + 0.5 - half) / sx;
        const across = Math.exp(-0.5 * dx * dx);
        const core = Math.exp(-0.5 * (dx / 0.45) ** 2) * along;
        let a = across * along;
        let glint = 0;
        if (flare) {
          const hy = (1 - t) * SPRITE_LENGTH;
          glint = Math.exp(-0.5 * ((hy / 5) ** 2 + (dx * 0.8) ** 2)) * 0.9;
          a = Math.min(1, a + glint);
        }
        const whiten = clamp((flare ? 0.85 : 0.5) * core + glint, 0, 1);
        const col = mixRgb(tint, white, whiten);
        const o = (j * el.width + i) * 4;
        img.data[o] = col[0];
        img.data[o + 1] = col[1];
        img.data[o + 2] = col[2];
        img.data[o + 3] = Math.round(clamp(a, 0, 1) * 255);
      }
    }
    sctx.putImageData(img, 0, 0);
    return { canvas: el, width };
  };

  const buildSprites = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    const d = clamp(c.depth, 0, 1);
    sprites.length = 0;
    for (let k = 0; k < LEVELS; k += 1) {
      sprites.push(buildSprite(0.55 + k * (0.45 + 2.2 * d), false));
    }
    flareSprite = buildSprite(1.1 + d * 0.8, true);
  };

  /** The sky: the page with a faint wash of the light's colour pooled low. */
  const buildSky = () => {
    const { w, h, dpr } = size;
    if (w < 1) return;
    sky.width = Math.round(w * dpr);
    sky.height = Math.round(h * dpr);
    const s = sky.getContext("2d");
    if (!s) return;
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    const top = mixRgb(paint.sky, paint.light, paint.lightTheme ? 0.03 : 0.04);
    const low = mixRgb(paint.sky, paint.light, paint.lightTheme ? 0.08 : 0.11);
    const g = s.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(top));
    g.addColorStop(1, css(low));
    s.fillStyle = g;
    s.fillRect(0, 0, w, h);
    const pool = s.createRadialGradient(
      w / 2,
      h * 1.05,
      0,
      w / 2,
      h * 1.05,
      w * 0.6,
    );
    pool.addColorStop(0, css(paint.light, paint.lightTheme ? 0.1 : 0.14));
    pool.addColorStop(1, css(paint.light, 0));
    s.fillStyle = pool;
    s.fillRect(0, 0, w, h);
  };

  const levelOf = (z: number) =>
    z < 0.32 ? 0 : z < 0.58 ? 1 : z < 0.82 ? 2 : 3;

  /** A streak's look from its depth. */
  const shape = (f: Field, i: number, z: number) => {
    const c = cfg;
    if (!c) return;
    f.z[i] = z;
    f.level[i] = levelOf(z);
    f.len[i] =
      clamp(c.length, 10, 400) * (0.55 + 1.35 * z) * (0.8 + 0.4 * rand());
    f.v[i] = (34 + 150 * z) * (0.85 + 0.3 * rand());
    f.alpha[i] = 0.2 + 1.15 * z * (1 - z) + 0.24 * (1 - z);
  };

  const margin = () => size.h * Math.tan(MAX_LEAN) + 24;

  const seedField = () => {
    const c = cfg;
    const { w, h } = size;
    if (!c || w < 1 || h < 1) return;
    rand = lcg(c.seed * 19 + 3);
    const scale = clamp((w * h) / REFERENCE_AREA, 0.25, 2.4);
    const n = Math.max(
      8,
      Math.round(scale * (30 + clamp(c.density, 0, 1) * 170)),
    );
    const f: Field = {
      n,
      x: new Float32Array(n),
      y: new Float32Array(n),
      z: new Float32Array(n),
      v: new Float32Array(n),
      len: new Float32Array(n),
      alpha: new Float32Array(n),
      level: new Uint8Array(n),
      flare: new Uint8Array(n),
    };
    const m = margin();
    for (let i = 0; i < n; i += 1) {
      shape(f, i, Math.pow(rand(), 1.6));
      f.x[i] = -m + rand() * (w + 2 * m);
      f.y[i] = rand() * (h + (f.len[i] ?? 0) * 2);
      f.flare[i] = rand() < clamp(c.flare, 0, 1) * 0.05 ? 1 : 0;
    }
    field = f;
  };

  const respawn = (f: Field, i: number) => {
    const c = cfg;
    if (!c) return;
    shape(f, i, Math.pow(rand(), 1.6));
    const m = margin();
    f.x[i] = -m + rand() * (size.w + 2 * m);
    f.y[i] = -rand() * 40 - 6;
    f.flare[i] = rand() < clamp(c.flare, 0, 1) * 0.05 ? 1 : 0;
  };

  const leanOf = (z: number) => sim.lean * (0.55 + 0.45 * z);

  const draw = () => {
    const f = field;
    const c = cfg;
    if (!ctx || !f || !c || !visible.current || size.w < 1) return;
    const { dpr, h } = size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(sky, 0, 0);
    ctx.globalCompositeOperation = paint.lightTheme ? "source-over" : "lighter";
    const stretch = trailScale();
    const since = sim.t - press.t;
    const swell = since >= 0 && since < 1.2 ? Math.exp(-since / 0.28) : 0;
    for (let i = 0; i < f.n; i += 1) {
      const flare = f.flare[i] === 1;
      const sprite = flare ? flareSprite : sprites[f.level[i] ?? 0];
      if (!sprite) continue;
      const z = f.z[i] ?? 0;
      const a = leanOf(z);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = f.x[i] ?? 0;
      const y = f.y[i] ?? 0;
      const len = (f.len[i] ?? 40) * stretch;
      if (y - len * ca > h + 4 || y < -4) continue;
      let alpha = (f.alpha[i] ?? 0.5) * (flare ? 1.6 : 1);
      if (swell > 0) {
        const dx = x - press.x;
        const dy = y - press.y;
        alpha *= 1 + 1.4 * swell * Math.exp(-(dx * dx + dy * dy) / 26000);
      }
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.setTransform(
        dpr * ca,
        -dpr * sa,
        dpr * sa,
        dpr * ca,
        dpr * x,
        dpr * y,
      );
      ctx.drawImage(sprite.canvas, -sprite.width / 2, -len, sprite.width, len);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** The fall and the wind. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const f = field;
    const c = cfg;
    if (!f || !c) return false;
    let moving = false;
    let to = deg(clamp(c.wind, -30, 30));
    if (hand.present && c.interactive) {
      to +=
        ((hand.x / Math.max(1, size.w)) * 2 - 1) *
        MAX_LEAN *
        clamp(c.pointerStrength, 0, 1);
    }
    to = clamp(to, -MAX_LEAN * 1.2, MAX_LEAN * 1.2);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      sim.leanV +=
        ((DRIFT.stiffness * (to - sim.lean) - DRIFT.damping * sim.leanV) /
          DRIFT.mass) *
        h;
      sim.lean += sim.leanV * h;
    }
    if (Math.abs(to - sim.lean) < 1e-4 && Math.abs(sim.leanV) < 1e-3) {
      sim.lean = to;
      sim.leanV = 0;
    } else moving = true;
    if (!c.paused) {
      moving = true;
      sim.t += dt;
      const sp = clamp(c.speed, 0.1, 3);
      const stretch = trailScale();
      for (let i = 0; i < f.n; i += 1) {
        const z = f.z[i] ?? 0;
        const a = leanOf(z);
        const v = (f.v[i] ?? 60) * sp * (f.flare[i] ? 1.25 : 1);
        const x = (f.x[i] ?? 0) + Math.sin(a) * v * dt;
        const y = (f.y[i] ?? 0) + Math.cos(a) * v * dt;
        f.x[i] = x;
        f.y[i] = y;
        const tail = (f.len[i] ?? 40) * stretch * Math.cos(a);
        const m = margin();
        if (y - tail > size.h + 4 || x < -m - 40 || x > size.w + m + 40) {
          respawn(f, i);
        }
      }
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !field) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = c.motionSafe ? step(dt) : false;
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !field)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const get = (i: number): Rgb | null => {
      const el = kids[i];
      return el ? read(getComputedStyle(el).color) : null;
    };
    paint.sky = get(0) ?? paint.sky;
    paint.light = get(1) ?? paint.light;
    paint.lightTheme =
      0.2126 * paint.sky[0] + 0.7152 * paint.sky[1] + 0.0722 * paint.sky[2] >
      128;
    buildSky();
    buildSprites();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    if (size.w === w && size.h === h && size.dpr === dpr && field) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    seedField();
    buildSky();
    buildSprites();
    draw();
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
        sim.lean = deg(clamp(next.wind, -30, 30));
        readColours();
        resize();
        return;
      }
      if (
        was.density !== next.density ||
        was.seed !== next.seed ||
        was.length !== next.length
      ) {
        seedField();
      }
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (was.paintKey !== next.paintKey) readColours();
      else if (
        was.depth !== next.depth ||
        was.trail !== next.trail ||
        was.motionSafe !== next.motionSafe
      ) {
        buildSprites();
      }
      if (!next.motionSafe) {
        sim.lean = deg(clamp(next.wind, -30, 30));
        sim.leanV = 0;
      }
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
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
      const now = performance.now();
      // A quick sweep is a gust: its speed goes into the wind spring.
      if (hand.present && hand.source === "pointer" && source === "pointer") {
        const dt = Math.max(0.008, (now - hand.at) / 1000);
        const vx = (x - hand.lastX) / dt;
        sim.leanV += clamp(vx / Math.max(200, size.w), -3, 3) * 0.35;
      }
      hand.lastX = x;
      hand.at = now;
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      kick();
    },
    drop(x, y) {
      const f = field;
      const c = cfg;
      // Held still or reduced, a streak could only hang there; it is not sent.
      if (!f || !c || !c.motionSafe || c.paused) return;
      // The bright streak takes the place of the lowest one, and starts
      // above the press on the line it will fall along, so it lands there.
      let pick = 0;
      let lowest = -Infinity;
      for (let i = 0; i < f.n; i += 1) {
        const y0 = f.y[i] ?? 0;
        if (y0 > lowest) {
          lowest = y0;
          pick = i;
        }
      }
      shape(f, pick, 0.42);
      f.flare[pick] = 1;
      const start = -10;
      const a = leanOf(0.42);
      f.x[pick] = x - Math.tan(a) * (y - start);
      f.y[pick] = start;
      press.x = x;
      press.y = y;
      press.t = sim.t;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A background of soft light falling slowly, with the content on top in its
 * own layer. Every streak sits at its own depth: far ones thin, dim and slow,
 * near ones longer, wider and blurred as if out of focus, and quicker. Each
 * is a bright head with a body that fades up into a faint trail, whitened
 * along its core so it reads as light; now and then a brighter one falls.
 * The rain leans with the wind, near streaks more than far: the pointer's
 * place across the box sets the wind and a quick sweep adds a gust, all
 * through one spring with the drift constants, so the rain swings into the
 * hand and settles without a bounce. A press drops a bright streak that
 * lands where you touched, and keyboard focus on a control inside leans the
 * rain toward it and drops one above it.
 *
 * Canvas 2D: one sky and one sprite blit per streak a frame, only on screen
 * in a visible page. In a dark theme the light adds; in a light theme it is
 * drawn as soft pigment of the same hue. Under reduced motion it is a long
 * exposure: the streaks stand still with longer trails and nothing falls.
 */
export function GlowRain({
  children,
  density = 0.55,
  speed = 1,
  color = "cobalt",
  depth = 0.6,
  length = 70,
  trail = 0.5,
  flare = 0.4,
  wind = 6,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: GlowRainProps) {
  const motionSafe = useMotionSafe();
  const light = Object.prototype.hasOwnProperty.call(COLORS, color)
    ? COLORS[color as GlowRainColor]
    : String(color);
  const paints = [SKY, light] as const;
  const paintKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);

  const config: Config = {
    density,
    speed,
    paintKey,
    depth,
    length,
    trail,
    flare,
    wind,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onActiveChange;
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
      engine.current?.drop(at.x, at.y);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside is a hand at that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.drop(at.x, Math.max(8, at.y - r.height));
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
        // A sideways drag leans the rain on touch; an upright one scrolls.
        "group/glow-rain relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/glow-rain:opacity-0"
        style={standIn(light, wind)}
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

/**
 * The designed still frame for the server render and the first paint: the
 * sky with its low glow and fine leaning streaks of the light in CSS.
 */
function standIn(light: string, wind: number): React.CSSProperties {
  const lean = Math.round(180 - clamp(wind, -30, 30));
  const soft = `color-mix(in oklab, ${light} 22%, transparent)`;
  return {
    backgroundColor: SKY,
    backgroundImage: [
      `repeating-linear-gradient(${lean + 90}deg, transparent 0 37px, ${soft} 37px 38px, transparent 38px 61px, ${soft} 61px 62px, transparent 62px 97px)`,
      `linear-gradient(${lean}deg, color-mix(in oklab, ${light} 4%, ${SKY}), color-mix(in oklab, ${light} 12%, ${SKY}))`,
    ].join(", "),
  };
}
