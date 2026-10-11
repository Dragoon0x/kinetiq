"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type EtchedBricksScene = "dawn" | "peak" | "moon";

export type EtchedBricksProps = {
  /** A picture of your own to lay in the wall (same origin, or served with CORS). Without one, `scene` is drawn. */
  src?: string;
  /** The picture drawn in code when there is no `src`. @default "dawn" */
  scene?: EtchedBricksScene;
  /** What the picture shows; it names the wall for assistive technology. @default the scene's own description */
  alt?: string;
  /** The density ramp, darkest first: one entry per level, its characters the alternates a brick turns between. @default defaultEtchedRamp */
  ramp?: string[];
  /** Brick width in px; rows and columns are fitted to the box. @default 22 */
  brick?: number;
  /** How deep the bevel and the pillowed face read, 0 (flat glass) to 1. @default 0.5 */
  bevel?: number;
  /** How strongly the backlight and the lamp light the glass, 0 to 1. @default 0.6 */
  glow?: number;
  /** The backlight's colour. @default a warm pigment from --warn */
  light?: string;
  /** The glass's own tint where no light comes through. @default a deep pigment from --accent */
  glass?: string;
  /** Send a slow sweep of light through the wall every `sweepEvery` ms. @default true */
  sweep?: boolean;
  /** Time between sweeps, in ms. @default 6500 */
  sweepEvery?: number;
  /** How long one sweep takes to cross the wall, in ms. @default 2600 */
  sweepDuration?: number;
  /** The pointer lamp's radius, in px. @default 76 */
  radius?: number;
  /** Bricks turn over to a new character as light passes them. @default true */
  flip?: boolean;
  /** Hold the wall still: no sweeps, though the lamp still lights it. @default false */
  paused?: boolean;
  /** Fires as a sweep starts, whether from the timer, a click or a key. */
  onSweep?: () => void;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Shows the wall but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the wall; it fills its parent by default. */
  className?: string;
};

/**
 * Darkest first. Every level holds alternates of near-equal ink, so a brick
 * can turn to a new character without the picture changing.
 */
export const defaultEtchedRamp: string[] = [
  " ",
  ".'`",
  ",:-",
  ";~^",
  "=+<",
  "*xc",
  "oz%",
  "&#8",
  "@$B",
];

const SCENE_ALT: Record<EtchedBricksScene, string> = {
  dawn: "A sun rising over the sea",
  peak: "A snow peak under the moon",
  moon: "A crescent moon over dark hills",
};

type Rgb = readonly [number, number, number];

/** Fixed-step physics: every brick's turn is integrated at 120 Hz. */
const STEP = 1 / 120;
/** The flip is springs.snap: one crisp turn with a hair of overshoot. */
const FLIP_K = springs.snap.stiffness / springs.snap.mass;
const FLIP_C = springs.snap.damping / springs.snap.mass;
/** Reduced motion swaps a character on a short cross-fade instead. */
const SWAP_S = 0.15;
const RAMP_STEPS = 64;
/** The sweep's band leans like low light: its crest runs along x + 0.42·y. */
const LEAN = 0.42;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The drawn pictures, as brightness at (u, v): v runs 0–1 down, u 0–aspect across. */
function sceneLuma(
  scene: EtchedBricksScene,
  u: number,
  v: number,
  aspect: number,
): number {
  if (scene === "peak") {
    const mx = aspect * 0.2;
    const md = Math.hypot(u - mx, v - 0.24);
    let sky = 0.14 + 0.2 * (1 - v);
    sky += md < 0.085 ? 0.85 : 0.36 * Math.exp(-(md - 0.085) / 0.09);
    const px = aspect * 0.6;
    const ridge = 0.26 + Math.abs(u - px) * 0.82 + 0.025 * Math.sin(u * 13);
    const foot = 0.74 + 0.05 * Math.sin(u * 3.1 + 1);
    if (v > foot) return 0.03;
    if (v < ridge) return clamp(sky);
    const snow = ridge + 0.16 - Math.abs(u - px) * 0.08;
    if (v < snow && v < 0.6) {
      return Math.sin((u - px) * 34 + v * 10) > 0.25 ? 0.86 : 0.58;
    }
    return 0.08;
  }
  if (scene === "moon") {
    const mx = aspect * 0.5;
    const d1 = Math.hypot(u - mx, v - 0.42);
    const d2 = Math.hypot(u - mx - 0.11, v - 0.37);
    const r = 0.27;
    if (v > 0.82 + 0.05 * Math.sin(u * 3.3) + 0.025 * Math.sin(u * 7.1)) {
      return 0.03;
    }
    let l = 0.05 + 0.1 * v;
    if (d1 < r && d2 > r * 0.9) l = 0.95;
    else if (d1 >= r) l += 0.3 * Math.exp(-(d1 - r) / 0.09);
    for (let i = 0; i < 16; i += 1) {
      const sx = hash(i, 7) * aspect;
      const sy = hash(i, 11) * 0.62;
      if (Math.hypot(sx - mx, sy - 0.42) < r + 0.08) continue;
      const sd = Math.hypot(u - sx, v - sy);
      l += 0.85 * Math.exp(-((sd / 0.03) ** 2)) * (0.5 + 0.5 * hash(i, 13));
    }
    return clamp(l);
  }
  // A sun half risen over the sea: the disc sits on the horizon, which
  // burns as a line of light, and its reflection breaks on the swell below.
  const hz = 0.64;
  const sx = aspect * 0.6;
  const sr = 0.27;
  if (v < hz) {
    const d = Math.hypot(u - sx, v - hz);
    let l = 0.03 + 0.3 * (v / hz) ** 2.4;
    if (d < sr) l = 1;
    else {
      const ray = Math.cos(Math.atan2(v - hz, u - sx) * 14);
      l += 0.55 * Math.exp(-(d - sr) / 0.12);
      l += 0.12 * Math.max(0, ray) * Math.exp(-(d - sr) / 0.35);
    }
    if (hz - v < 0.035) {
      l = Math.max(l, 0.5 + 0.3 * Math.exp(-(((u - sx) / 0.6) ** 2)));
    }
    return clamp(l);
  }
  const depth = (v - hz) / (1 - hz);
  const column = Math.exp(-(((u - sx) / (0.16 + depth * 0.14)) ** 2));
  const ripple = Math.sin(v * 120 + Math.sin(u * 8) * 1.5) > -0.2 ? 1 : 0.4;
  return clamp(
    0.04 + 0.05 * (1 - depth) + column * (0.8 - 0.45 * depth) * ripple,
  );
}

/** Any CSS colour the canvas understands, as sRGB bytes, by painting one pixel. */
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
const toLinear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const toSrgb = (linear: number) => {
  const c = clamp(linear);
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(v * 255);
};

type Palette = {
  /** The glass from unlit to fully lit, in RAMP_STEPS steps. */
  body: string[];
  mortar: string;
  ring: string;
  font: string;
};

type Wall = {
  w: number;
  h: number;
  dpr: number;
  cols: number;
  rows: number;
  bw: number;
  bh: number;
  gap: number;
  x0: number;
  y0: number;
  n: number;
  /** Picture brightness under each brick, 0–1. */
  base: Float32Array;
  level: Uint8Array;
  alt: Uint8Array;
  /** The turn, in half-turns: goal is the whole number it is heading for. */
  turn: Float32Array;
  vel: Float32Array;
  goal: Float32Array;
  /** Reduced motion's cross-fade progress, 0–1 (1 is done). */
  swap: Float32Array;
  latch: Uint8Array;
  cx: Float32Array;
  cy: Float32Array;
  /** Each brick's place along the sweep, 0 at the near corner, 1 at the far. */
  s: Float32Array;
  bevelSprite: HTMLCanvasElement | null;
  glintSprite: HTMLCanvasElement | null;
  atlas: HTMLCanvasElement | null;
  cells: Map<string, number>;
};

type Lamp = {
  tx: number;
  ty: number;
  x: number;
  y: number;
  amp: number;
  present: boolean;
  ring: boolean;
  source: "pointer" | "key" | null;
};

type Run = {
  /** The sweep's crest, from before the wall to past it; null between sweeps. */
  crest: number | null;
  elapsed: number;
  /** Reduced motion's brighten-and-fade answer to a click or key, seconds. */
  pulse: number;
};

/** A soft radial wash of the scene's light, for the server's still frame. */
const STAND_IN_LIGHT: Record<EtchedBricksScene, string> = {
  dawn: "radial-gradient(42% 70% at 62% 50%, color-mix(in oklab, var(--eb-light) 80%, transparent), transparent 70%), radial-gradient(10% 40% at 62% 82%, color-mix(in oklab, var(--eb-light) 50%, transparent), transparent)",
  peak: "radial-gradient(12% 26% at 20% 24%, color-mix(in oklab, var(--eb-light) 80%, transparent), transparent), linear-gradient(to bottom, color-mix(in oklab, var(--eb-light) 26%, transparent), transparent 70%)",
  moon: "radial-gradient(30% 60% at 50% 42%, color-mix(in oklab, var(--eb-light) 70%, transparent), transparent 70%)",
};

/**
 * A wall of glass blocks, each etched with one character, that together read
 * as a picture lit from behind. Each block samples the picture's brightness
 * and takes a character from a density ramp — clear glass where it is dark,
 * dense letters where it is bright — while its glass glows with the
 * backlight in proportion.
 *
 * Every so often a slow diagonal band of light sweeps through the wall, and
 * as its crest passes each block the block turns once on its vertical axis
 * on the springs.snap constants: it thins to a sliver with the mortar showing
 * behind, swaps to another character of the same weight at the halfway point,
 * glints along its bevel while edge-on and seats with a hair of overshoot.
 * The pointer carries a lamp of its own; blocks its core reaches turn once
 * and are latched until it moves off.
 *
 * Canvas 2D from pre-rendered sprites; the loop runs only while light moves or
 * a block turns, on screen, in a visible page. The keyboard's way in is a
 * transparent button: arrow keys move the lamp, Enter or Space sends a sweep.
 * Under reduced motion nothing travels or turns: the wall rests under a still
 * wash, the lamp lights it directly, and a character changes on a cross-fade.
 */
export function EtchedBricks({
  src,
  scene = "dawn",
  alt,
  ramp = defaultEtchedRamp,
  brick = 22,
  bevel = 0.5,
  glow = 0.6,
  light = "oklch(from var(--warn) 0.88 0.11 calc(h - 8))",
  glass = "color-mix(in oklab, oklch(from var(--accent) 0.3 0.04 calc(h - 50)) 78%, var(--background))",
  sweep = true,
  sweepEvery = 6500,
  sweepDuration = 2600,
  radius = 76,
  flip = true,
  paused = false,
  onSweep,
  dpr = 2,
  disabled = false,
  className,
}: EtchedBricksProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const name = alt ?? SCENE_ALT[scene] ?? SCENE_ALT.dawn;
  const levels = ramp.length > 0 ? ramp : defaultEtchedRamp;
  const rampKey = levels.join("\u0000");

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const wall = React.useRef<Wall | null>(null);
  const palette = React.useRef<Palette | null>(null);
  const reader = React.useRef<((colour: string) => Rgb) | null>(null);
  const picture = React.useRef<HTMLImageElement | null>(null);
  const lamp = React.useRef<Lamp>({
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    amp: 0,
    present: false,
    ring: false,
    source: null,
  });
  const run = React.useRef<Run>({ crest: null, elapsed: 0, pulse: 0 });
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const carry = React.useRef(0);
  const visible = React.useRef(false);
  const dirty = React.useRef(true);
  const timer = React.useRef<number | null>(null);
  const firstSweep = React.useRef(true);

  const latest = React.useRef({
    levels,
    brick,
    bevel,
    glow,
    sweep,
    sweepEvery,
    sweepDuration,
    radius,
    flip,
    paused,
    onSweep,
    dpr,
    motionSafe,
    scene,
  });
  React.useEffect(() => {
    latest.current = {
      levels,
      brick,
      bevel,
      glow,
      sweep,
      sweepEvery,
      sweepDuration,
      radius,
      flip,
      paused,
      onSweep,
      dpr,
      motionSafe,
      scene,
    };
  });

  const readPalette = (): Palette | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!reader.current) reader.current = rgbReader();
    const read = reader.current;
    const s = getComputedStyle(canvas);
    const lit = read(s.color);
    const dim = read(s.borderTopColor);
    const body: string[] = [];
    for (let i = 0; i < RAMP_STEPS; i += 1) {
      const t = i / (RAMP_STEPS - 1);
      // Light adds, so the glow is summed in linear light rather than
      // blended: a half-lit pane is the glass plus half the lamp, warm and
      // clear, never the grey-brown a straight blend passes through. The
      // glass stops short of the light's own colour; the etched marks carry
      // the brightest values.
      const k = Math.pow(t, 1.1) * 0.9;
      const add = (a: number, b: number) =>
        toSrgb(toLinear(a) * (1 - 0.35 * k) + toLinear(b) * k);
      body.push(
        css([add(dim[0], lit[0]), add(dim[1], lit[1]), add(dim[2], lit[2])]),
      );
    }
    return {
      body,
      mortar: s.borderRightColor,
      ring: s.borderBottomColor,
      font: s.fontFamily || "ui-monospace, monospace",
    };
  };

  /** The glass's bevel, pillow, glint and every character, drawn once per size. */
  const buildSprites = (wl: Wall) => {
    const p = palette.current;
    if (!p) return;
    const { dpr: d, bw, bh } = wl;
    const W = Math.max(1, Math.round(bw * d));
    const H = Math.max(1, Math.round(bh * d));
    const depth = clamp(latest.current.bevel);

    const bevelCanvas = wl.bevelSprite ?? document.createElement("canvas");
    bevelCanvas.width = W;
    bevelCanvas.height = H;
    const b = bevelCanvas.getContext("2d");
    if (b) {
      b.clearRect(0, 0, W, H);
      const e = Math.max(1, Math.round(Math.min(W, H) * (0.06 + 0.14 * depth)));
      // The pillow: the face swells toward the light at the top left.
      const pillow = b.createRadialGradient(
        W * 0.32,
        H * 0.28,
        0,
        W * 0.5,
        H * 0.5,
        Math.max(W, H) * 0.75,
      );
      pillow.addColorStop(0, `rgba(255, 255, 255, ${r2(0.06 + 0.16 * depth)})`);
      pillow.addColorStop(0.6, "rgba(255, 255, 255, 0)");
      pillow.addColorStop(1, `rgba(0, 0, 0, ${r2(0.1 + 0.22 * depth)})`);
      b.fillStyle = pillow;
      b.fillRect(0, 0, W, H);
      // The bevel: light on the top and left, shade on the bottom and right.
      b.fillStyle = `rgba(255, 255, 255, ${r2(0.1 + 0.3 * depth)})`;
      b.beginPath();
      b.moveTo(0, 0);
      b.lineTo(W, 0);
      b.lineTo(W - e, e);
      b.lineTo(e, e);
      b.lineTo(e, H - e);
      b.lineTo(0, H);
      b.closePath();
      b.fill();
      b.fillStyle = `rgba(0, 0, 0, ${r2(0.14 + 0.36 * depth)})`;
      b.beginPath();
      b.moveTo(W, 0);
      b.lineTo(W, H);
      b.lineTo(0, H);
      b.lineTo(e, H - e);
      b.lineTo(W - e, H - e);
      b.lineTo(W - e, e);
      b.closePath();
      b.fill();
      b.strokeStyle = `rgba(255, 255, 255, ${r2(0.05 + 0.12 * depth)})`;
      b.lineWidth = Math.max(1, d * 0.5);
      b.strokeRect(e + 0.5, e + 0.5, W - 2 * e - 1, H - 2 * e - 1);
    }
    wl.bevelSprite = bevelCanvas;

    const glintCanvas = wl.glintSprite ?? document.createElement("canvas");
    glintCanvas.width = W;
    glintCanvas.height = H;
    const g = glintCanvas.getContext("2d");
    if (g) {
      g.clearRect(0, 0, W, H);
      const lineH = Math.max(1, Math.round(d * 1.4));
      const along = g.createLinearGradient(0, 0, W, 0);
      along.addColorStop(0, "rgba(255, 255, 255, 0.2)");
      along.addColorStop(0.35, "rgba(255, 255, 255, 1)");
      along.addColorStop(1, "rgba(255, 255, 255, 0.15)");
      g.fillStyle = along;
      g.fillRect(0, 0, W, lineH);
      const down = g.createLinearGradient(0, 0, 0, H);
      down.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      down.addColorStop(1, "rgba(255, 255, 255, 0.1)");
      g.fillStyle = down;
      g.fillRect(0, 0, lineH, H);
      const face = g.createLinearGradient(0, 0, W, H);
      face.addColorStop(0, "rgba(255, 255, 255, 0.22)");
      face.addColorStop(0.5, "rgba(255, 255, 255, 0.04)");
      face.addColorStop(1, "rgba(255, 255, 255, 0)");
      g.fillStyle = face;
      g.fillRect(0, 0, W, H);
    }
    wl.glintSprite = glintCanvas;

    const chars = new Map<string, number>();
    for (const level of latest.current.levels) {
      for (const ch of level) {
        if (ch.trim() && !chars.has(ch)) chars.set(ch, chars.size);
      }
    }
    const atlas = wl.atlas ?? document.createElement("canvas");
    atlas.width = Math.max(1, W * chars.size);
    atlas.height = H;
    const a = atlas.getContext("2d");
    if (a) {
      a.clearRect(0, 0, atlas.width, H);
      a.textAlign = "center";
      a.textBaseline = "middle";
      a.font = `500 ${Math.round(H * 0.6)}px ${p.font}`;
      const cut = Math.max(1, d * 0.6);
      for (const [ch, i] of chars) {
        const x = i * W + W / 2;
        const y = H / 2 + H * 0.03;
        // The cut's lower edge in shade, then the frosted mark itself.
        a.fillStyle = "rgba(0, 0, 0, 0.5)";
        a.fillText(ch, x + cut, y + cut);
        a.fillStyle = "rgba(255, 255, 255, 1)";
        a.fillText(ch, x, y);
      }
    }
    wl.atlas = atlas;
    wl.cells = chars;
  };

  /** The picture's brightness under every brick. */
  const samplePicture = (wl: Wall) => {
    const { w, h, cols, rows, bw, bh, gap, x0, y0, n } = wl;
    const levelsNow = latest.current.levels;
    const img = picture.current;
    let read: ((i: number) => number) | null = null;
    if (img && img.naturalWidth > 0) {
      try {
        const sw = cols * 3;
        const sh = rows * 3;
        const c = document.createElement("canvas");
        c.width = sw;
        c.height = sh;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          // Cover: crop the picture to the wall's aspect, centred.
          const ar = w / h;
          const ir = img.naturalWidth / img.naturalHeight;
          const cw = ir > ar ? img.naturalHeight * ar : img.naturalWidth;
          const ch = ir > ar ? img.naturalHeight : img.naturalWidth / ar;
          ctx.drawImage(
            img,
            (img.naturalWidth - cw) / 2,
            (img.naturalHeight - ch) / 2,
            cw,
            ch,
            0,
            0,
            sw,
            sh,
          );
          const data = ctx.getImageData(0, 0, sw, sh).data;
          read = (i: number) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            let sum = 0;
            for (let dy = 0; dy < 3; dy += 1) {
              for (let dx = 0; dx < 3; dx += 1) {
                const k = ((row * 3 + dy) * sw + col * 3 + dx) * 4;
                sum +=
                  (0.2126 * (data[k] ?? 0) +
                    0.7152 * (data[k + 1] ?? 0) +
                    0.0722 * (data[k + 2] ?? 0)) /
                  255;
              }
            }
            return sum / 9;
          };
        }
      } catch {
        // A picture from another origin without CORS cannot be read; the
        // drawn scene stands in for it.
        read = null;
      }
    }
    const aspect = w / h;
    const sc = latest.current.scene;
    for (let i = 0; i < n; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      let l: number;
      if (read) l = read(i);
      else {
        let sum = 0;
        for (let dy = 0; dy < 3; dy += 1) {
          for (let dx = 0; dx < 3; dx += 1) {
            const px = x0 + col * (bw + gap) + ((dx + 0.5) / 3) * bw;
            const py = y0 + row * (bh + gap) + ((dy + 0.5) / 3) * bh;
            sum += sceneLuma(sc, px / h, py / h, aspect);
          }
        }
        l = sum / 9;
      }
      wl.base[i] = l;
      wl.level[i] = Math.min(
        levelsNow.length - 1,
        Math.floor(Math.pow(l, 0.85) * levelsNow.length),
      );
    }
  };

  /** How lit brick i is this frame, 0–1. */
  const lightOf = (wl: Wall, i: number): number => {
    const { glow: gl, radius: rad, motionSafe: ms } = latest.current;
    const g = clamp(gl);
    let v = (wl.base[i] ?? 0) * (0.45 + 0.7 * g);
    const r = run.current;
    const sigma = 70 / (wl.w + LEAN * wl.h);
    const crest = ms ? r.crest : 0.4;
    if (crest !== null) {
      const d = ((wl.s[i] ?? 0) - crest) / sigma;
      v += Math.exp(-d * d) * (ms ? 0.55 : 0.22) * (0.4 + 0.6 * g);
    }
    if (r.pulse > 0) {
      const k =
        r.pulse < 0.24
          ? r.pulse / 0.24
          : Math.max(0, 1 - (r.pulse - 0.24) / 0.24);
      v += 0.3 * k * (0.4 + 0.6 * g);
    }
    const lp = lamp.current;
    if (lp.amp > 0.001) {
      const dx = (wl.cx[i] ?? 0) - lp.x;
      const dy = (wl.cy[i] ?? 0) - lp.y;
      v +=
        lp.amp * Math.exp(-(dx * dx + dy * dy) / (rad * rad)) * (0.3 + 0.7 * g);
    }
    return v > 1 ? 1 : v;
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const wl = wall.current;
    const p = palette.current;
    if (!canvas || !ctx || !wl || !p) return;
    if (!visible.current) {
      dirty.current = true;
      return;
    }
    dirty.current = false;
    const { dpr: d, w, h, cols, bw, bh, gap, x0, y0, n, turn, swap } = wl;
    const levelsNow = latest.current.levels;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.mortar;
    ctx.fillRect(0, 0, w, h);
    const bevelSprite = wl.bevelSprite;
    const glintSprite = wl.glintSprite;
    const atlas = wl.atlas;
    const SW = bevelSprite?.width ?? 1;
    const SH = bevelSprite?.height ?? 1;
    const glyphOf = (i: number, k: number) => {
      const lv = levelsNow[wl.level[i] ?? 0] ?? " ";
      const len = Math.max(1, lv.length);
      const at = ((((wl.alt[i] ?? 0) + k) % len) + len) % len;
      return lv[at] ?? " ";
    };
    for (let i = 0; i < n; i += 1) {
      const col = i % cols;
      const row = (i - col) / cols;
      const x = x0 + col * (bw + gap);
      const y = y0 + row * (bh + gap);
      const t = turn[i] ?? 0;
      const c = Math.cos(Math.PI * t);
      const scale = c < 0 ? -c : c;
      const lit = lightOf(wl, i);
      if (scale < 0.999) {
        // The empty slot behind a turning brick is in its own shadow.
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "rgb(0, 0, 0)";
        ctx.fillRect(x, y, bw, bh);
        ctx.globalAlpha = 1;
      }
      const dw = Math.max(0.75, bw * scale);
      const dx = x + (bw - dw) / 2;
      ctx.fillStyle =
        p.body[Math.round(lit * (RAMP_STEPS - 1))] ??
        p.body[0] ??
        "rgb(0, 0, 0)";
      ctx.fillRect(dx, y, dw, bh);
      if (bevelSprite) ctx.drawImage(bevelSprite, 0, 0, SW, SH, dx, y, dw, bh);
      if (atlas) {
        const k = Math.round(t);
        const fade = swap[i] ?? 1;
        const ink = 0.14 + 0.86 * Math.pow(lit, 0.8);
        const ch = glyphOf(i, k);
        const cell = wl.cells.get(ch);
        if (cell !== undefined) {
          ctx.globalAlpha = ink * (fade < 1 ? fade : 1);
          ctx.drawImage(atlas, cell * SW, 0, SW, SH, dx, y, dw, bh);
        }
        if (fade < 1) {
          const prev = wl.cells.get(glyphOf(i, k - 1));
          if (prev !== undefined) {
            ctx.globalAlpha = ink * (1 - fade);
            ctx.drawImage(atlas, prev * SW, 0, SW, SH, dx, y, dw, bh);
          }
        }
      }
      if (glintSprite && scale < 0.999) {
        // Edge-on, the bevel catches the light behind it: the glint adds
        // light rather than painting over, so it flares on bright glass.
        const s = Math.sin(Math.PI * t);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = s * s * (0.55 + 0.45 * clamp(latest.current.glow));
        ctx.drawImage(glintSprite, 0, 0, SW, SH, dx, y, dw, bh);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
    }
    const lp = lamp.current;
    if (lp.ring && lp.present) {
      ctx.beginPath();
      ctx.arc(
        lp.x,
        lp.y,
        Math.max(12, latest.current.radius * 0.45),
        0,
        Math.PI * 2,
      );
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = p.ring;
      ctx.stroke();
    }
    rootRef.current?.setAttribute("data-painted", "");
  };

  const turnOver = (wl: Wall, i: number) => {
    if (!latest.current.flip) return;
    const g = (wl.goal[i] ?? 0) + 1;
    wl.goal[i] = g;
    if (!latest.current.motionSafe) {
      wl.turn[i] = g;
      wl.vel[i] = 0;
      wl.swap[i] = 0;
    }
  };

  /** One physics step; true while anything still moves. */
  const integrate = (dt: number): boolean => {
    const wl = wall.current;
    if (!wl) return false;
    const { radius: rad, motionSafe: ms, sweepDuration: dur } = latest.current;
    let moving = false;
    const lp = lamp.current;
    const target = lp.present ? 1 : 0;
    if (ms) {
      const follow = 1 - Math.exp(-dt / 0.09);
      lp.x += (lp.tx - lp.x) * follow;
      lp.y += (lp.ty - lp.y) * follow;
      lp.amp +=
        (target - lp.amp) *
        (1 - Math.exp(-dt / (target > lp.amp ? 0.12 : 0.35)));
      if (Math.abs(lp.tx - lp.x) + Math.abs(lp.ty - lp.y) < 0.2) {
        lp.x = lp.tx;
        lp.y = lp.ty;
      } else moving = true;
      if (Math.abs(target - lp.amp) < 0.004) lp.amp = target;
      else moving = true;
    } else {
      lp.x = lp.tx;
      lp.y = lp.ty;
      lp.amp = target;
    }

    const r = run.current;
    if (r.crest !== null && ms) {
      const before = r.crest;
      r.elapsed += dt;
      const k = clamp(r.elapsed / Math.max(0.4, dur / 1000));
      // Ease in and out: the light gathers, crosses, and thins away.
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * k);
      const crest = -0.18 + eased * 1.36;
      for (let i = 0; i < wl.n; i += 1) {
        const s = wl.s[i] ?? 0;
        if (s > before && s <= crest) turnOver(wl, i);
      }
      r.crest = k >= 1 ? null : crest;
      moving = true;
    }
    if (r.pulse > 0) {
      r.pulse += dt;
      if (r.pulse > 0.48) r.pulse = 0;
      moving = true;
    }

    if (lp.amp > 0.6) {
      const inner = (rad * 0.42) ** 2;
      const outer = (rad * 0.85) ** 2;
      for (let i = 0; i < wl.n; i += 1) {
        const dx = (wl.cx[i] ?? 0) - lp.x;
        const dy = (wl.cy[i] ?? 0) - lp.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < inner && !wl.latch[i]) {
          wl.latch[i] = 1;
          turnOver(wl, i);
        } else if (d2 > outer) wl.latch[i] = 0;
      }
    } else if (lp.amp < 0.05) wl.latch.fill(0);

    for (let i = 0; i < wl.n; i += 1) {
      const goal = wl.goal[i] ?? 0;
      const t = wl.turn[i] ?? 0;
      const v = wl.vel[i] ?? 0;
      if (!ms) {
        const f = wl.swap[i] ?? 1;
        if (f < 1) {
          wl.swap[i] = Math.min(1, f + dt / SWAP_S);
          moving = true;
        }
        continue;
      }
      if (t === goal && v === 0) continue;
      const a = FLIP_K * (goal - t) - FLIP_C * v;
      const nv = v + a * dt;
      const nt = t + nv * dt;
      if (Math.abs(goal - nt) < 0.002 && Math.abs(nv) < 0.02) {
        wl.turn[i] = goal;
        wl.vel[i] = 0;
      } else {
        wl.turn[i] = nt;
        wl.vel[i] = nv;
        moving = true;
      }
    }
    return moving;
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    const dt = last.current
      ? Math.min(1 / 30, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    carry.current += dt;
    let moving = false;
    let steps = 0;
    while (carry.current >= STEP && steps < 6) {
      carry.current -= STEP;
      steps += 1;
      if (integrate(STEP)) moving = true;
    }
    if (steps === 0) moving = true;
    draw();
    if (moving) frame.current = window.requestAnimationFrame(tick);
    else {
      last.current = 0;
      carry.current = 0;
      api.current.schedule();
    }
  };

  const kick = () => {
    if (frame.current || !wall.current) return;
    if (!visible.current || document.hidden) {
      dirty.current = true;
      return;
    }
    frame.current = window.requestAnimationFrame(tick);
  };

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const startSweep = () => {
    clearTimer();
    const l = latest.current;
    if (!wall.current) return;
    if (l.motionSafe) {
      run.current.crest = -0.18;
      run.current.elapsed = 0;
    } else {
      run.current.pulse = 0.0001;
    }
    l.onSweep?.();
    kick();
  };

  /** The next sweep waits for a quiet, visible wall. */
  const schedule = () => {
    const l = latest.current;
    if (timer.current !== null || run.current.crest !== null) return;
    if (
      !l.sweep ||
      l.paused ||
      !l.motionSafe ||
      !visible.current ||
      document.hidden ||
      !wall.current
    )
      return;
    const wait = firstSweep.current ? 900 : Math.max(1200, l.sweepEvery);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      firstSweep.current = false;
      startSweep();
    }, wait);
  };

  const paint = () => {
    palette.current = readPalette();
    const wl = wall.current;
    if (wl) buildSprites(wl);
    draw();
  };

  const resize = (force = false) => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const l = latest.current;
    const d = Math.min(2, Math.max(0.5, l.dpr), window.devicePixelRatio || 1);
    const was = wall.current;
    if (!force && was && was.w === w && was.h === h && was.dpr === d) return;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    const target = clamp(Math.round(l.brick), 10, 64);
    const gap = Math.max(2, Math.round(target * 0.09));
    const frameW = clamp(Math.round(Math.min(w, h) * 0.03), 3, 10);
    const tall = Math.round(target * 0.86);
    const cols = Math.max(
      1,
      Math.floor((w - 2 * frameW + gap) / (target + gap)),
    );
    const rows = Math.max(1, Math.floor((h - 2 * frameW + gap) / (tall + gap)));
    const bw = Math.max(
      4,
      Math.floor((w - 2 * frameW - (cols - 1) * gap) / cols),
    );
    const bh = Math.max(
      4,
      Math.floor((h - 2 * frameW - (rows - 1) * gap) / rows),
    );
    const x0 = Math.round((w - (cols * bw + (cols - 1) * gap)) / 2);
    const y0 = Math.round((h - (rows * bh + (rows - 1) * gap)) / 2);
    const n = cols * rows;
    const wl: Wall = {
      w,
      h,
      dpr: d,
      cols,
      rows,
      bw,
      bh,
      gap,
      x0,
      y0,
      n,
      base: new Float32Array(n),
      level: new Uint8Array(n),
      alt: new Uint8Array(n),
      turn: new Float32Array(n),
      vel: new Float32Array(n),
      goal: new Float32Array(n),
      swap: new Float32Array(n).fill(1),
      latch: new Uint8Array(n),
      cx: new Float32Array(n),
      cy: new Float32Array(n),
      s: new Float32Array(n),
      bevelSprite: was?.bevelSprite ?? null,
      glintSprite: was?.glintSprite ?? null,
      atlas: was?.atlas ?? null,
      cells: new Map(),
    };
    for (let i = 0; i < n; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = x0 + col * (bw + gap) + bw / 2;
      const cy = y0 + row * (bh + gap) + bh / 2;
      wl.cx[i] = cx;
      wl.cy[i] = cy;
      wl.s[i] = (cx + LEAN * cy) / (w + LEAN * h);
      wl.alt[i] = Math.floor(hash(col + 31, row + 17) * 3);
    }
    wall.current = wl;
    if (!palette.current) palette.current = readPalette();
    samplePicture(wl);
    buildSprites(wl);
    draw();
    kick();
  };

  const api = React.useRef({
    resize,
    paint,
    kick,
    schedule,
    startSweep,
    clearTimer,
    samplePicture,
    draw,
  });
  React.useEffect(() => {
    api.current = {
      resize,
      paint,
      kick,
      schedule,
      startSweep,
      clearTimer,
      samplePicture,
      draw,
    };
  });

  // Anything that changes the layout or the sprites rebuilds the wall.
  React.useEffect(() => {
    api.current.resize(true);
  }, [brick, bevel, rampKey, dpr, scene]);

  // A picture of your own is decoded once and sampled into the wall.
  React.useEffect(() => {
    if (!src) {
      picture.current = null;
      const wl = wall.current;
      if (wl) {
        api.current.samplePicture(wl);
        api.current.draw();
      }
      return;
    }
    let live = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (!live) return;
      picture.current = img;
      const wl = wall.current;
      if (wl) {
        api.current.samplePicture(wl);
        api.current.draw();
      }
    };
    img.src = src;
    return () => {
      live = false;
      img.onload = null;
    };
  }, [src]);

  // Sweep settings: a wall that may sweep waits for its next one; one that
  // may not lets go of its timer (a sweep already crossing finishes).
  React.useEffect(() => {
    api.current.clearTimer();
    api.current.schedule();
    api.current.kick();
    const t = timer;
    return () => {
      if (t.current !== null) window.clearTimeout(t.current);
      t.current = null;
    };
  }, [sweep, paused, sweepEvery, motionSafe]);

  // Light and lamp settings only change how the wall is lit: one repaint.
  React.useEffect(() => {
    api.current.draw();
  }, [glow, radius, flip]);

  // Reduced motion seats every brick where it is going.
  React.useEffect(() => {
    if (motionSafe) return;
    const wl = wall.current;
    if (!wl) return;
    run.current.crest = null;
    wl.turn.set(wl.goal);
    wl.vel.fill(0);
    wl.swap.fill(1);
    api.current.draw();
  }, [motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        api.current.clearTimer();
        return;
      }
      if (dirty.current) api.current.paint();
      api.current.kick();
      api.current.schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = frame;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        if (dirty.current) api.current.paint();
        api.current.kick();
        api.current.schedule();
      } else api.current.clearTimer();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const repaintSoon = React.useRef(0);
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current.paint();
    });
  };
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const aim = (
    x: number,
    y: number,
    source: "pointer" | "key",
    jump: boolean,
  ) => {
    const lp = lamp.current;
    lp.tx = x;
    lp.ty = y;
    if (jump || !lp.present) {
      lp.x = x;
      lp.y = y;
    }
    lp.present = true;
    lp.source = source;
    lp.ring = source === "key";
    kick();
  };

  const douse = (source: "pointer" | "key") => {
    const lp = lamp.current;
    if (lp.source !== source) return;
    lp.present = false;
    lp.ring = false;
    lp.source = null;
    kick();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const wl = wall.current;
    if (!wl) return;
    const step = (event.shiftKey ? 3 : 1) * (wl.bw + wl.gap);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const lp = lamp.current;
    const fromX = lp.present ? lp.tx : wl.w / 2;
    const fromY = lp.present ? lp.ty : wl.h / 2;
    aim(
      clamp(fromX + move[0], 0, wl.w),
      clamp(fromY + move[1], 0, wl.h),
      "key",
      false,
    );
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (disabled) return;
        if (event.pointerType === "touch" && event.buttons === 0) return;
        const at = local(event.clientX, event.clientY);
        aim(at.x, at.y, "pointer", false);
      }}
      onPointerDown={(event) => {
        if (disabled || event.pointerType !== "touch") return;
        const at = local(event.clientX, event.clientY);
        aim(at.x, at.y, "pointer", true);
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") douse("pointer");
      }}
      onPointerCancel={() => douse("pointer")}
      onPointerLeave={() => douse("pointer")}
      className={cn(
        "group/etched-bricks relative isolate h-full w-full touch-pan-y overflow-clip rounded-3 [contain:paint] select-none",
        disabled && "opacity-70",
        className,
      )}
      style={{ "--eb-light": light } as React.CSSProperties}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColors}
        className="pointer-events-none absolute inset-0 size-full font-mono transition-colors duration-1"
        style={{
          color: light,
          borderTopColor: glass,
          borderRightColor:
            "color-mix(in oklab, var(--ink-3) 32%, var(--background))",
          borderBottomColor: "var(--ring)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-painted/etched-bricks:hidden"
        style={{
          backgroundColor: glass,
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0 ${brick}px, color-mix(in oklab, var(--ink-3) 32%, var(--background)) ${brick}px ${brick + 2}px), repeating-linear-gradient(0deg, transparent 0 ${Math.round(brick * 0.86)}px, color-mix(in oklab, var(--ink-3) 32%, var(--background)) ${Math.round(brick * 0.86)}px ${Math.round(brick * 0.86) + 2}px), ${STAND_IN_LIGHT[scene] ?? STAND_IN_LIGHT.dawn}`,
        }}
      />
      <button
        type="button"
        aria-label={`${name}, laid in etched glass bricks`}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const wl = wall.current;
          if (!wl || disabled || !event.currentTarget.matches(":focus-visible"))
            return;
          const lp = lamp.current;
          aim(
            lp.present ? lp.tx : wl.w / 2,
            lp.present ? lp.ty : wl.h / 2,
            "key",
            true,
          );
        }}
        onBlur={() => douse("key")}
        onClick={(event) => {
          if (disabled) return;
          api.current.startSweep();
          if (event.detail === 0) {
            setSaid((s) => ({
              n: s.n + 1,
              text: "Light passes through the wall.",
            }));
          }
        }}
        className={cn(
          "absolute inset-0 size-full cursor-pointer rounded-[inherit] outline-none disabled:cursor-not-allowed",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <p id={hintId} className="sr-only">
        A picture laid in glass bricks, each etched with one letter. Arrow keys
        move a lamp across the wall; Enter or Space sends a sweep of light
        through it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
