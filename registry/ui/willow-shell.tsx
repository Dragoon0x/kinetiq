"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type WillowShellType = "willow" | "peony" | "crossette" | "mixed";

/** One shell of a scripted show. */
export type WillowCue = {
  /** When the shell leaves the mortar, in ms from the start of the show. */
  at: number;
  /** The shell; defaults to the component's `shell` (a "mixed" show cycles). */
  shell?: Exclude<WillowShellType, "mixed">;
  /** Where along the bank it is fired from, 0 (left) to 1 (right). @default 0.5 */
  x?: number;
  /** How high it bursts, 0 (low) to 1 (the top of the sky). @default the component's `height` */
  height?: number;
  /** Its size against `spread`, 0.5 to 1.5. @default 1 */
  size?: number;
};

export type WillowShellProps = {
  /** A headline over the sky. It does not take pointer input; the root sets `--willow-ink` and `--willow-faint` for text on the night. */
  children?: React.ReactNode;
  /** The burst: hanging gold willow, a round peony, crossettes that split in a cross, or each in turn. @default "willow" */
  shell?: WillowShellType;
  /** How wide the burst opens, 0 to 1; wider shells carry more stars. @default 0.55 */
  spread?: number;
  /** How hard stars and strands droop, 0 (they hang) to 1 (they fall). @default 0.5 */
  gravity?: number;
  /** How high a shell bursts, 0 (just over the bank) to 1 (the top of the sky). @default 0.6 */
  height?: number;
  /** Stars per shell, 24 to 140. @default 72 */
  stars?: number;
  /** How long willow strands and star streaks are, 0 to 1. @default 0.6 */
  trail?: number;
  /** The willow's gold, any CSS colour. @default "oklch(from var(--warn) 0.86 0.12 h)" */
  gold?: string;
  /** Star colours for peonies and crossettes, any CSS colours. @default four token pigments */
  colors?: string[];
  /** Wind across the river, -1 (to the left) to 1: carries smoke and strands. @default 0.2 */
  wind?: number;
  /** Mirror the sky in a river under the bank. @default true */
  reflection?: boolean;
  /** The show `playing` runs. @default defaultWillowFinale */
  sequence?: WillowCue[];
  /** Controlled: whether the show is running. Turning it on starts the show from its first cue. */
  playing?: boolean;
  /** Initial show state when uncontrolled. @default false */
  defaultPlaying?: boolean;
  /** Fires with `false` when the show's last shell has faded. */
  onPlayingChange?: (playing: boolean) => void;
  /** What launches a shell by itself: coming into view, mounting, or nothing but the visitor. @default "manual" */
  trigger?: "manual" | "inView" | "mount";
  /** Fires as each shell bursts, with its type and where along the bank it was fired (0 to 1). */
  onBurst?: (shell: Exclude<WillowShellType, "mixed">, x: number) => void;
  /** Hold everything in the air where it is and take no launches. @default false */
  paused?: boolean;
  /** Seeds the stars, the bank and every burst. @default 7 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The frame's accessible name. @default "Fireworks over the river" */
  label?: string;
  /** Play the whistle as a shell leaves and the flare as it bursts, for the visitor's own launches. @default false */
  sound?: boolean;
  /** Shows the sky but takes no launches. @default false */
  disabled?: boolean;
  /** Sizes the frame. @default "h-96 w-full" */
  className?: string;
};

type Kind = 0 | 1 | 2;
const KIND_NAME = ["willow", "peony", "crossette"] as const;
const KIND_OF: Record<Exclude<WillowShellType, "mixed">, Kind> = {
  willow: 0,
  peony: 1,
  crossette: 2,
};

/** A scripted finale: flank crossettes, a peony chorus, then willows that hang gold. */
export const defaultWillowFinale: WillowCue[] = [
  { at: 0, shell: "crossette", x: 0.18, height: 0.42 },
  { at: 380, shell: "crossette", x: 0.82, height: 0.48 },
  { at: 1150, shell: "peony", x: 0.34, height: 0.6 },
  { at: 1450, shell: "peony", x: 0.68, height: 0.56 },
  { at: 1800, shell: "peony", x: 0.5, height: 0.74, size: 1.1 },
  { at: 2650, shell: "crossette", x: 0.28, height: 0.52 },
  { at: 2850, shell: "crossette", x: 0.72, height: 0.5 },
  { at: 3700, shell: "willow", x: 0.24, height: 0.64 },
  { at: 3950, shell: "willow", x: 0.76, height: 0.64 },
  { at: 4300, shell: "willow", x: 0.5, height: 0.82, size: 1.2 },
];

const DEFAULT_COLORS = [
  "oklch(from var(--danger) 0.72 0.19 h)",
  "oklch(from var(--accent-bright) 0.76 0.14 h)",
  "oklch(from var(--success) 0.82 0.15 h)",
  "oklch(from var(--warn) 0.9 0.13 h)",
];
const DEFAULT_GOLD = "oklch(from var(--warn) 0.86 0.12 h)";
// The night is fixed art: dark on a light page and a dark one alike.
const NIGHT = "color-mix(in oklab, var(--accent) 20%, black)";
const HORIZON = "color-mix(in oklab, var(--accent-bright) 30%, black)";
const BANK = "color-mix(in oklab, var(--accent) 9%, black)";
const SMOKE = "oklch(from var(--accent) 0.72 0.025 h)";
const WINDOWS = "oklch(from var(--warn) 0.8 0.11 h)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

const MAX_SHELLS = 8;
const MAX_BURSTS = 12;
const PER_BURST = 160;
const MAX_STARS = MAX_BURSTS * PER_BURST;
const HIST = 24;
const MAX_SPARKS = 900;
const MAX_SMOKE = 48;
/** Alpha steps along a strand, head to tail. */
const NB = 6;

type RGB = [number, number, number];

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A cheap per-frame flicker that needs no state: the same inputs, the same answer. */
const hash01 = (a: number, b: number) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): RGB => {
    if (!ctx) return [1, 0.85, 0.5];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

const rgba = (c: RGB, a = 1) =>
  `rgb(${Math.round(clamp01(c[0]) * 255)} ${Math.round(clamp01(c[1]) * 255)} ${Math.round(clamp01(c[2]) * 255)} / ${Math.round(clamp01(a) * 1000) / 1000})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const WHITE: RGB = [1, 1, 1];

type Config = {
  spread: number;
  gravity: number;
  height: number;
  stars: number;
  trail: number;
  wind: number;
  reflection: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
  trigger: "manual" | "inView" | "mount";
  /** The still the reduced-motion sky starts on. */
  posterKind: Kind;
};

type LaunchOptions = {
  kind: Kind;
  x: number;
  height?: number;
  size?: number;
  colour?: number;
  voiced: boolean;
};

type EngineHooks = {
  /** A shell burst: its kind, where it left the bank, and whether the visitor fired it. */
  burst: (kind: Kind, x: number, voiced: boolean) => void;
  /** The engine wants the opening shell its trigger asked for. */
  opening: () => void;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (v: boolean) => void;
  launch: (o: LaunchOptions) => boolean;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement,
  hooks: React.RefObject<EngineHooks>,
): Engine {
  const ctx = canvas.getContext("2d");
  const read = rgbReader();
  let cfg: Config | null = null;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let frame = 0;
  let last = 0;
  let clock = 0;
  let frameNo = 0;
  let disposed = false;
  let visible = false;
  let triggered = false;

  // Colours, read from the carriers so tokens and theme changes reach the canvas.
  let night: RGB = [0.02, 0.03, 0.08];
  let horizon: RGB = [0.08, 0.1, 0.2];
  let bank: RGB = [0.01, 0.015, 0.04];
  let smokeRGB: RGB = [0.6, 0.62, 0.68];
  let windowRGB: RGB = [0.9, 0.75, 0.45];
  let gold: RGB = [1, 0.8, 0.45];
  let palette: RGB[] = [[1, 0.5, 0.5]];
  let paletteStyle: string[] = [];
  let willowStyle: string[] = [];
  let cometStyle: string[] = [];
  let sparkStyle: string[] = [];
  let glow: HTMLCanvasElement[] = [];
  let smokeSprite: HTMLCanvasElement | null = null;
  let bg: HTMLCanvasElement | null = null;
  let fg: HTMLCanvasElement | null = null;
  let bankY = 0;

  // Shells on the way up.
  const shAlive = new Uint8Array(MAX_SHELLS);
  const shX = new Float32Array(MAX_SHELLS);
  const shY = new Float32Array(MAX_SHELLS);
  const shVx = new Float32Array(MAX_SHELLS);
  const shVy = new Float32Array(MAX_SHELLS);
  const shApex = new Float32Array(MAX_SHELLS);
  const shKind = new Uint8Array(MAX_SHELLS);
  const shColour = new Uint8Array(MAX_SHELLS);
  const shSize = new Float32Array(MAX_SHELLS);
  const shX01 = new Float32Array(MAX_SHELLS);
  const shVoiced = new Uint8Array(MAX_SHELLS);

  // Bursts: each owns PER_BURST star slots, so its stars are contiguous.
  const bAlive = new Uint8Array(MAX_BURSTS);
  const bKind = new Uint8Array(MAX_BURSTS);
  const bX = new Float32Array(MAX_BURSTS);
  const bY = new Float32Array(MAX_BURSTS);
  const bT = new Float32Array(MAX_BURSTS);
  const bR = new Float32Array(MAX_BURSTS);
  const bG = new Float32Array(MAX_BURSTS);
  const bColour = new Uint8Array(MAX_BURSTS);
  const bCount = new Uint16Array(MAX_BURSTS);
  const bFrozen = new Uint8Array(MAX_BURSTS);
  /** A frozen still's envelope: its own clock, and how long it holds (Infinity for the poster). */
  const bStillT = new Float32Array(MAX_BURSTS);
  const bHold = new Float32Array(MAX_BURSTS);
  const bLeaving = new Uint8Array(MAX_BURSTS);
  const bOrder = new Uint32Array(MAX_BURSTS);
  let burstSerial = 0;

  const sState = new Uint8Array(MAX_STARS); // 0 dead, 1 burning, 2 strand only
  const sKind = new Uint8Array(MAX_STARS); // 0 willow, 1 peony, 2 comet, 3 crossette child
  const sX = new Float32Array(MAX_STARS);
  const sY = new Float32Array(MAX_STARS);
  const sVx = new Float32Array(MAX_STARS);
  const sVy = new Float32Array(MAX_STARS);
  const sBorn = new Float32Array(MAX_STARS);
  const sLife = new Float32Array(MAX_STARS);
  const sDrag = new Float32Array(MAX_STARS);
  const sSplit = new Float32Array(MAX_STARS);
  const sColour = new Uint8Array(MAX_STARS);
  const hX = new Float32Array(MAX_STARS * HIST);
  const hY = new Float32Array(MAX_STARS * HIST);
  const hT = new Float32Array(MAX_STARS * HIST);
  const hHead = new Uint8Array(MAX_STARS);
  const hCount = new Uint8Array(MAX_STARS);
  const hLast = new Float32Array(MAX_STARS);
  const hEvery = new Float32Array(MAX_STARS);

  const pX = new Float32Array(MAX_SPARKS);
  const pY = new Float32Array(MAX_SPARKS);
  const pVx = new Float32Array(MAX_SPARKS);
  const pVy = new Float32Array(MAX_SPARKS);
  const pAge = new Float32Array(MAX_SPARKS);
  const pLife = new Float32Array(MAX_SPARKS);
  let pNext = 0;

  const mX = new Float32Array(MAX_SMOKE);
  const mY = new Float32Array(MAX_SMOKE);
  const mR = new Float32Array(MAX_SMOKE);
  const mVx = new Float32Array(MAX_SMOKE);
  const mAge = new Float32Array(MAX_SMOKE);
  const mLife = new Float32Array(MAX_SMOKE);
  let mNext = 0;

  let rand = lcg(7);

  /** The scene's yardstick: bursts and gravity scale with it. */
  const scale = () => Math.max(60, Math.min(W, H * 0.75));
  const starGravity = () =>
    lerp(0.1, 0.62, clamp01(cfg?.gravity ?? 0.5)) * scale();
  const strandSpan = () => lerp(0.5, 2.5, clamp01(cfg?.trail ?? 0.6));

  const makeGlow = (c: RGB) => {
    const s = document.createElement("canvas");
    s.width = 64;
    s.height = 64;
    const g = s.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, rgba(mix(c, WHITE, 0.5), 1));
      grad.addColorStop(0.18, rgba(c, 0.65));
      grad.addColorStop(1, rgba(c, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return s;
  };

  const readColours = () => {
    const kids = carriers.children;
    const at = (i: number, fallback: RGB): RGB => {
      const el = kids[i];
      return el ? read(getComputedStyle(el).color) : fallback;
    };
    night = at(0, night);
    horizon = at(1, horizon);
    bank = at(2, bank);
    smokeRGB = at(3, smokeRGB);
    windowRGB = at(4, windowRGB);
    gold = at(5, gold);
    palette = [];
    for (let i = 6; i < kids.length; i += 1) palette.push(at(i, [1, 1, 1]));
    if (palette.length === 0) palette.push(gold);
    paletteStyle = palette.map((c) => rgba(mix(c, WHITE, 0.12), 1));
    const hot = mix(gold, WHITE, 0.55);
    const ember: RGB = [gold[0] * 0.92, gold[1] * 0.5, gold[2] * 0.2];
    willowStyle = [];
    cometStyle = [];
    for (let k = 0; k < NB; k += 1) {
      const t = k / (NB - 1);
      willowStyle.push(
        rgba(mix(hot, ember, Math.pow(t, 0.7)), lerp(0.85, 0.08, t)),
      );
      cometStyle.push(rgba(mix(hot, gold, t), lerp(0.95, 0.12, t)));
    }
    sparkStyle = [
      rgba(mix(gold, WHITE, 0.6), 0.95),
      rgba(gold, 0.6),
      rgba([gold[0], gold[1] * 0.6, gold[2] * 0.3], 0.3),
    ];
    glow = [...palette, gold, mix(gold, WHITE, 0.7)].map(makeGlow);
    const sm = document.createElement("canvas");
    sm.width = 64;
    sm.height = 64;
    const sg = sm.getContext("2d");
    if (sg) {
      const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, rgba(smokeRGB, 1));
      grad.addColorStop(0.6, rgba(smokeRGB, 0.35));
      grad.addColorStop(1, rgba(smokeRGB, 0));
      sg.fillStyle = grad;
      sg.fillRect(0, 0, 64, 64);
    }
    smokeSprite = sm;
    bg = null;
    fg = null;
    draw();
  };

  /** Sky, stars and water; and on its own layer the far bank, which covers the seam. */
  const buildBackdrop = () => {
    if (W < 1 || H < 1) return;
    const c = cfg;
    const seed = c?.seed ?? 7;
    const r = lcg(seed * 31 + 5);
    const pw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    bg = document.createElement("canvas");
    bg.width = pw;
    bg.height = ph;
    fg = document.createElement("canvas");
    fg.width = pw;
    fg.height = ph;
    const g = bg.getContext("2d");
    const f = fg.getContext("2d");
    if (!g || !f) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    f.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, bankY);
    sky.addColorStop(0, rgba(mix(night, [0, 0, 0], 0.25)));
    sky.addColorStop(0.65, rgba(night));
    sky.addColorStop(1, rgba(horizon));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, bankY + 2);
    const stars = Math.round((W * bankY) / 1500);
    for (let i = 0; i < stars; i += 1) {
      const x = r() * W;
      const y = Math.pow(r(), 1.4) * bankY * 0.92;
      const s = 0.5 + r() * r() * 1.1;
      g.fillStyle = rgba(mix(WHITE, horizon, r() * 0.4), 0.18 + r() * 0.55);
      g.fillRect(x, y, s, s);
    }
    if (bankY < H - 1) {
      const water = g.createLinearGradient(0, bankY, 0, H);
      water.addColorStop(0, rgba(mix(horizon, night, 0.55)));
      water.addColorStop(1, rgba(mix(night, [0, 0, 0], 0.45)));
      g.fillStyle = water;
      g.fillRect(0, bankY, W, H - bankY);
      // A few long, faint sheen lines lying on the water.
      for (let i = 0; i < 14; i += 1) {
        const y = bankY + 6 + r() * (H - bankY - 8);
        const x = r() * W;
        const w = 20 + r() * 90;
        g.fillStyle = rgba(horizon, 0.18 + r() * 0.2);
        g.fillRect(x - w / 2, y, w, 0.7);
      }
    }
    // The far bank: low land, roofs and trees, a few lit windows.
    f.fillStyle = rgba(bank);
    f.beginPath();
    f.moveTo(0, bankY + 2);
    const base = bankY;
    let x = 0;
    f.lineTo(0, base - 3);
    while (x < W) {
      const pick = r();
      if (pick < 0.32) {
        // A clump of trees: two or three round crowns.
        const w = 10 + r() * 18;
        const h = 8 + r() * 13;
        f.quadraticCurveTo(x + w * 0.1, base - h * 1.2, x + w * 0.5, base - h);
        f.quadraticCurveTo(x + w * 0.9, base - h * 1.25, x + w, base - 3);
        x += w;
      } else if (pick < 0.55) {
        // A pitched roof.
        const w = 8 + r() * 14;
        const h = 5 + r() * 8;
        f.lineTo(x, base - h);
        f.lineTo(x + w / 2, base - h - 3 - r() * 4);
        f.lineTo(x + w, base - h);
        f.lineTo(x + w, base - 3);
        x += w;
      } else {
        const w = 6 + r() * 26;
        f.lineTo(x + w, base - 2 - r() * 3);
        x += w;
      }
    }
    f.lineTo(W, base + 2);
    f.closePath();
    f.fill();
    f.fillRect(0, base - 1, W, 4);
    for (let i = 0; i < Math.round(W / 26); i += 1) {
      const wx = r() * W;
      const wy = base - 3 - r() * 7;
      f.fillStyle = rgba(windowRGB, 0.35 + r() * 0.45);
      f.fillRect(wx, wy, 1.2, 1.2);
    }
  };

  const measure = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const next = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    if (
      w === W &&
      h === H &&
      next === dpr &&
      canvas.width === Math.round(w * next) &&
      canvas.height === Math.round(h * next)
    ) {
      return;
    }
    W = w;
    H = h;
    dpr = next;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    bankY = Math.round(H * (cfg?.reflection === false ? 0.93 : 0.8));
    bg = null;
    fg = null;
  };

  const freeBurst = () => {
    let best = -1;
    let oldest = Infinity;
    for (let b = 0; b < MAX_BURSTS; b += 1) {
      if (!bAlive[b]) return b;
      const o = bOrder[b] ?? 0;
      if (o < oldest) {
        oldest = o;
        best = b;
      }
    }
    if (best >= 0) {
      const from = best * PER_BURST;
      sState.fill(0, from, from + PER_BURST);
    }
    return best;
  };

  const pushHistory = (i: number, t: number) => {
    const head = hHead[i] ?? 0;
    const k = i * HIST + head;
    hX[k] = sX[i] ?? 0;
    hY[k] = sY[i] ?? 0;
    hT[k] = t;
    hHead[i] = (head + 1) % HIST;
    hCount[i] = Math.min(HIST, (hCount[i] ?? 0) + 1);
    hLast[i] = t;
  };

  const spawnStar = (
    i: number,
    kind: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    born: number,
    life: number,
    drag: number,
    colour: number,
    every: number,
  ) => {
    sState[i] = 1;
    sKind[i] = kind;
    sX[i] = x;
    sY[i] = y;
    sVx[i] = vx;
    sVy[i] = vy;
    sBorn[i] = born;
    sLife[i] = life;
    sDrag[i] = drag;
    sColour[i] = colour;
    sSplit[i] = Infinity;
    hHead[i] = 0;
    hCount[i] = 0;
    hEvery[i] = every;
    pushHistory(i, born);
  };

  const spark = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
  ) => {
    const i = pNext;
    pNext = (pNext + 1) % MAX_SPARKS;
    pX[i] = x;
    pY[i] = y;
    pVx[i] = vx;
    pVy[i] = vy;
    pAge[i] = 0;
    pLife[i] = life;
  };

  const puff = (x: number, y: number, r: number, life: number) => {
    const i = mNext;
    mNext = (mNext + 1) % MAX_SMOKE;
    mX[i] = x;
    mY[i] = y;
    mR[i] = r;
    mVx[i] = (cfg?.wind ?? 0) * 11 + (rand() - 0.5) * 4;
    mAge[i] = 0;
    mLife[i] = life;
  };

  /** Advances one burst's stars by dt on its own clock. */
  const stepBurst = (b: number, dt: number) => {
    const t = (bT[b] ?? 0) + dt;
    bT[b] = t;
    const g = bG[b] ?? 0;
    const wind = (cfg?.wind ?? 0) * 10;
    const from = b * PER_BURST;
    const to = from + (bCount[b] ?? 0);
    const span = strandSpan();
    let alive = 0;
    for (let i = from; i < to; i += 1) {
      const state = sState[i] ?? 0;
      if (state === 0) continue;
      alive += 1;
      const kind = sKind[i] ?? 0;
      if (state === 1) {
        const k = Math.exp(-(sDrag[i] ?? 1) * dt);
        const vx = (sVx[i] ?? 0) * k + wind * dt;
        let vy = (sVy[i] ?? 0) * k + g * dt;
        if (kind === 0) {
          // Willow stars are heavy and slow: the fall reaches its terminal
          // speed quickly, which is what makes the branches droop rather than
          // drop.
          vy = Math.min(vy, (g / (sDrag[i] ?? 1)) * 1.4);
        }
        sVx[i] = vx;
        sVy[i] = vy;
        sX[i] = (sX[i] ?? 0) + vx * dt;
        sY[i] = (sY[i] ?? 0) + vy * dt;
        if (t - (hLast[i] ?? 0) >= (hEvery[i] ?? 0.05)) pushHistory(i, t);
        if (kind === 2 && t >= (sSplit[i] ?? Infinity)) {
          // A crossette: the comet breaks into four in a cross across its
          // own line of flight, with a little crackle where it breaks.
          sState[i] = 2;
          const sp = Math.hypot(vx, vy) || 1;
          const ux = vx / sp;
          const uy = vy / sp;
          const push = (bR[b] ?? 60) * 0.55 * 2.4;
          let slot = to;
          for (let n = 0; n < 4; n += 1) {
            const a = Math.PI / 4 + (n * Math.PI) / 2;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            const dx = ux * ca - uy * sa;
            const dy = ux * sa + uy * ca;
            while (slot < from + PER_BURST && (sState[slot] ?? 0) !== 0)
              slot += 1;
            if (slot >= from + PER_BURST) break;
            spawnStar(
              slot,
              3,
              sX[i] ?? 0,
              sY[i] ?? 0,
              vx * 0.3 + dx * push,
              vy * 0.3 + dy * push,
              t,
              0.75 + rand() * 0.3,
              2.4,
              (sColour[i] ?? 0) + (n % 2),
              lerp(0.012, 0.03, clamp01(cfg?.trail ?? 0.6)),
            );
            bCount[b] = Math.max(bCount[b] ?? 0, slot - from + 1);
          }
          for (let n = 0; n < 5; n += 1) {
            spark(
              sX[i] ?? 0,
              sY[i] ?? 0,
              (rand() - 0.5) * 90,
              (rand() - 0.6) * 90,
              0.18 + rand() * 0.2,
            );
          }
        } else if (t - (sBorn[i] ?? 0) >= (sLife[i] ?? 1)) {
          sState[i] = 2;
        }
      }
      // Embers cool and go out by age, so a dead star's strand dims as a
      // whole and burns down from its far end.
      const limit = kind === 0 ? span : (hEvery[i] ?? 0.02) * (HIST - 1);
      const head = hHead[i] ?? 0;
      let n = hCount[i] ?? 0;
      while (n > 0) {
        const oldest = i * HIST + ((head - n + HIST) % HIST);
        if (t - (hT[oldest] ?? 0) <= limit) break;
        n -= 1;
      }
      hCount[i] = n;
      if (n === 0 && (sState[i] ?? 0) === 2) sState[i] = 0;
    }
    if (alive === 0) bAlive[b] = 0;
  };

  /** Opens a shell at a point; `freezeAt` fast-forwards it to a still. */
  const openBurst = (
    kind: Kind,
    x: number,
    y: number,
    size: number,
    colour: number,
    freezeAt: number,
  ) => {
    const c = cfg;
    if (!c) return -1;
    const b = freeBurst();
    if (b < 0) return -1;
    burstSerial += 1;
    bOrder[b] = burstSerial;
    bAlive[b] = 1;
    bKind[b] = kind;
    bX[b] = x;
    bY[b] = y;
    bT[b] = 0;
    bColour[b] = colour;
    bFrozen[b] = 0;
    bStillT[b] = 0;
    bHold[b] = 0;
    bLeaving[b] = 0;
    const spread = clamp01(c.spread);
    const R = (0.15 + 0.27 * spread) * scale() * clamp(size, 0.5, 1.5);
    bR[b] = R;
    bG[b] = starGravity();
    const trail = clamp01(c.trail);
    const total = clamp(Math.round(c.stars), 24, 140);
    const from = b * PER_BURST;
    sState.fill(0, from, from + PER_BURST);
    let count = 0;
    if (kind === 0) {
      count = Math.min(PER_BURST, Math.round(total * lerp(0.75, 1.2, spread)));
      const every = strandSpan() / (HIST - 1);
      for (let n = 0; n < count; n += 1) {
        // A sphere of stars seen in projection: denser at the rim.
        const z = rand() * 2 - 1;
        const a = rand() * TAU;
        const rr = Math.sqrt(1 - z * z);
        const v = R * 2.6 * (0.9 + rand() * 0.2);
        spawnStar(
          from + n,
          0,
          x,
          y,
          Math.cos(a) * rr * v,
          Math.sin(a) * rr * v - R * 0.25,
          0,
          2.6 + rand() * 1.1,
          2.6,
          0,
          every,
        );
      }
    } else if (kind === 1) {
      count = Math.min(PER_BURST, total);
      const every = lerp(0.008, 0.032, trail);
      for (let n = 0; n < count; n += 1) {
        const z = rand() * 2 - 1;
        const a = rand() * TAU;
        const rr = Math.sqrt(1 - z * z);
        const v = R * 1.9 * (0.94 + rand() * 0.12);
        // Two colours in one bloom: an inner pistil in the next colour.
        const inner = n % 5 === 0;
        spawnStar(
          from + n,
          1,
          x,
          y,
          Math.cos(a) * rr * v * (inner ? 0.55 : 1),
          Math.sin(a) * rr * v * (inner ? 0.55 : 1),
          0,
          1.25 + rand() * 0.55,
          1.9,
          colour + (inner ? 1 : 0),
          every,
        );
      }
    } else {
      const comets = clamp(Math.round(total / 6), 8, 16);
      count = comets;
      const every = lerp(0.016, 0.04, trail);
      for (let n = 0; n < comets; n += 1) {
        const a = (n / comets) * TAU + rand() * 0.3;
        const v = R * 1.5 * (0.92 + rand() * 0.16);
        spawnStar(
          from + n,
          2,
          x,
          y,
          Math.cos(a) * v,
          Math.sin(a) * v,
          0,
          2,
          1.5,
          colour,
          every,
        );
        sSplit[from + n] = 0.5 + rand() * 0.12;
      }
    }
    bCount[b] = count;
    if (freezeAt > 0) {
      const steps = Math.round(freezeAt * 60);
      for (let s = 0; s < steps && bAlive[b]; s += 1) stepBurst(b, 1 / 60);
      bAlive[b] = 1;
      bFrozen[b] = 1;
    } else {
      for (let n = 0; n < 4; n += 1) {
        const a = rand() * TAU;
        const d = rand() * R * 0.5;
        puff(
          x + Math.cos(a) * d,
          y + Math.sin(a) * d,
          R * (0.32 + rand() * 0.25),
          6 + rand() * 2.5,
        );
      }
    }
    return b;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    const gRise = H * 0.85;
    for (let s = 0; s < MAX_SHELLS; s += 1) {
      if (!shAlive[s]) continue;
      const vy = (shVy[s] ?? 0) + gRise * dt;
      shVy[s] = vy;
      shX[s] = (shX[s] ?? 0) + (shVx[s] ?? 0) * dt;
      shY[s] = (shY[s] ?? 0) + vy * dt;
      // The rising star sheds sparks that fall away behind it.
      const n = 1 + Math.round(dt * 90);
      for (let k = 0; k < n; k += 1) {
        spark(
          (shX[s] ?? 0) + (rand() - 0.5) * 1.5,
          (shY[s] ?? 0) + rand() * 3,
          (rand() - 0.5) * 26,
          20 + rand() * 40 - vy * 0.08,
          0.22 + rand() * 0.38,
        );
      }
      if (vy >= -8 || (shY[s] ?? 0) <= (shApex[s] ?? 0)) {
        shAlive[s] = 0;
        const kind = (shKind[s] ?? 0) as Kind;
        const b = openBurst(
          kind,
          shX[s] ?? 0,
          shY[s] ?? 0,
          shSize[s] ?? 1,
          shColour[s] ?? 0,
          0,
        );
        if (b >= 0)
          hooks.current?.burst(kind, shX01[s] ?? 0.5, Boolean(shVoiced[s]));
      }
    }
    for (let b = 0; b < MAX_BURSTS; b += 1) {
      if (!bAlive[b]) continue;
      if (bFrozen[b]) {
        bStillT[b] = (bStillT[b] ?? 0) + dt;
        if (bLeaving[b] && (bStillT[b] ?? 0) > 0.5) bAlive[b] = 0;
        else if (!bLeaving[b] && (bStillT[b] ?? 0) > (bHold[b] ?? 0) + 1.6)
          bAlive[b] = 0;
        continue;
      }
      stepBurst(b, dt);
    }
    const g = starGravity() * 0.8;
    const sparkDrag = Math.exp(-2.2 * dt);
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      const life = pLife[i] ?? 0;
      if (life <= 0) continue;
      const age = (pAge[i] ?? 0) + dt;
      if (age >= life) {
        pLife[i] = 0;
        continue;
      }
      pAge[i] = age;
      pVx[i] = (pVx[i] ?? 0) * sparkDrag;
      pVy[i] = (pVy[i] ?? 0) * sparkDrag + g * dt;
      pX[i] = (pX[i] ?? 0) + (pVx[i] ?? 0) * dt;
      pY[i] = (pY[i] ?? 0) + (pVy[i] ?? 0) * dt;
    }
    for (let i = 0; i < MAX_SMOKE; i += 1) {
      const life = mLife[i] ?? 0;
      if (life <= 0) continue;
      const age = (mAge[i] ?? 0) + dt;
      if (age >= life) {
        mLife[i] = 0;
        continue;
      }
      mAge[i] = age;
      mX[i] = (mX[i] ?? 0) + (mVx[i] ?? 0) * dt;
      mY[i] = (mY[i] ?? 0) - 2.5 * dt;
      mR[i] = (mR[i] ?? 0) + 5 * dt;
    }
  };

  /** Whether anything still needs frames. */
  const busy = () => {
    for (let s = 0; s < MAX_SHELLS; s += 1) if (shAlive[s]) return true;
    for (let b = 0; b < MAX_BURSTS; b += 1) {
      if (!bAlive[b]) continue;
      if (!bFrozen[b]) return true;
      if (bLeaving[b] || Number.isFinite(bHold[b] ?? 0)) return true;
      if ((bStillT[b] ?? 0) < 0.3) return true;
    }
    for (let i = 0; i < MAX_SPARKS; i += 1)
      if ((pLife[i] ?? 0) > 0) return true;
    for (let i = 0; i < MAX_SMOKE; i += 1) if ((mLife[i] ?? 0) > 0) return true;
    return false;
  };

  /** A burst's opacity: frozen stills fade in, hold and leave; live ones fade as they die. */
  const burstAlpha = (b: number) => {
    if (bFrozen[b]) {
      const t = bStillT[b] ?? 0;
      if (bLeaving[b]) return clamp01(1 - t / 0.5) * 0.999;
      const enter = clamp01(t / 0.24);
      const hold = bHold[b] ?? 0;
      const leave = Number.isFinite(hold) ? clamp01(1 - (t - hold) / 1.6) : 1;
      return enter * leave;
    }
    return 1;
  };

  function draw() {
    const c = cfg;
    if (!ctx || !c || W < 1 || H < 1) return;
    if (!bg || !fg) buildBackdrop();
    frameNo += 1;
    const motion = c.motionSafe;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (bg) ctx.drawImage(bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // How much light is in the sky right now: it lifts the smoke.
    let skyLight = 0;
    for (let b = 0; b < MAX_BURSTS; b += 1) {
      if (!bAlive[b] || bFrozen[b]) continue;
      skyLight += Math.exp(-(bT[b] ?? 0) / 0.32);
    }

    if (smokeSprite) {
      for (let i = 0; i < MAX_SMOKE; i += 1) {
        const life = mLife[i] ?? 0;
        if (life <= 0) continue;
        const t = (mAge[i] ?? 0) / life;
        const env = Math.min(1, t * 6) * (1 - t);
        ctx.globalAlpha = clamp01(env * (0.07 + 0.22 * Math.min(1, skyLight)));
        const r = mR[i] ?? 10;
        ctx.drawImage(
          smokeSprite,
          (mX[i] ?? 0) - r,
          (mY[i] ?? 0) - r,
          r * 2,
          r * 2,
        );
      }
    }

    ctx.globalCompositeOperation = "lighter";
    const goldGlow = glow[palette.length];
    const hotGlow = glow[palette.length + 1];

    // The burst's flash: the sky lifts a touch toward the shell's colour.
    for (let b = 0; b < MAX_BURSTS; b += 1) {
      if (!bAlive[b] || bFrozen[b]) continue;
      const t = bT[b] ?? 0;
      const lift = Math.exp(-t / 0.32);
      if (lift < 0.01) continue;
      const kind = bKind[b] ?? 0;
      const tone =
        kind === 0
          ? gold
          : (palette[(bColour[b] ?? 0) % palette.length] ?? gold);
      ctx.globalAlpha = 0.07 * lift;
      ctx.fillStyle = rgba(tone, 1);
      ctx.fillRect(0, 0, W, bankY);
      const core = Math.exp(-t / 0.12);
      const spr =
        kind === 0 ? hotGlow : glow[(bColour[b] ?? 0) % palette.length];
      if (spr) {
        const R = (bR[b] ?? 40) * (1.1 + t * 2);
        ctx.globalAlpha = 0.55 * core;
        ctx.drawImage(spr, (bX[b] ?? 0) - R, (bY[b] ?? 0) - R, R * 2, R * 2);
      }
    }

    const span = strandSpan();
    ctx.lineCap = "round";
    for (let b = 0; b < MAX_BURSTS; b += 1) {
      if (!bAlive[b]) continue;
      const A = burstAlpha(b);
      if (A <= 0.002) continue;
      const t = bT[b] ?? 0;
      const from = b * PER_BURST;
      const to = from + (bCount[b] ?? 0);
      const gS = (bG[b] ?? 0) * 0.62;
      const windX = (c.wind ?? 0) * 7;
      const kindB = bKind[b] ?? 0;
      // Strands and streaks, one stroke per alpha step. A point's step is its
      // age against the strand's span, so embers cool along the strand and a
      // dead star's whole strand dims together.
      for (let k = 0; k < NB; k += 1) {
        for (let pass = 0; pass < 2; pass += 1) {
          // Pass 0: gold (willow strands, crossette comets); pass 1: colour.
          ctx.beginPath();
          let style = "";
          for (let i = from; i < to; i += 1) {
            const state = sState[i] ?? 0;
            if (state === 0) continue;
            const kind = sKind[i] ?? 0;
            const isGold = kind === 0 || kind === 2;
            if ((pass === 0) !== isGold) continue;
            const n = hCount[i] ?? 0;
            if (n < 1) continue;
            const head = hHead[i] ?? 0;
            const base = i * HIST;
            const starSpan =
              kind === 0 ? span : (hEvery[i] ?? 0.02) * (HIST - 1);
            let prevX = sX[i] ?? 0;
            let prevY = sY[i] ?? 0;
            let prevK = state === 1 ? 0 : -1;
            let drawn = false;
            for (let j = 0; j < n; j += 1) {
              const idx = base + ((head - 1 - j + HIST * 2) % HIST);
              const age = t - (hT[idx] ?? 0);
              const sag =
                kind === 0 ? (0.5 * gS * age * age) / (1 + age * 0.5) : 0;
              const px = (hX[idx] ?? 0) + (kind === 0 ? windX * age : 0);
              const py = (hY[idx] ?? 0) + sag;
              const pk = Math.min(NB - 1, Math.floor((age / starSpan) * NB));
              if (prevK === k) {
                ctx.moveTo(prevX, prevY);
                ctx.lineTo(px, py);
                drawn = true;
              }
              if (pk > k) break;
              prevX = px;
              prevY = py;
              prevK = pk;
            }
            if (drawn && !style) {
              style =
                kind === 0
                  ? (willowStyle[k] ?? "")
                  : kind === 2
                    ? (cometStyle[k] ?? "")
                    : (paletteStyle[(sColour[i] ?? 0) % paletteStyle.length] ??
                      "");
            }
          }
          if (!style) continue;
          ctx.strokeStyle = style;
          ctx.lineWidth = pass === 0 ? (kindB === 0 ? 1.1 : 1.5) : 1.5;
          ctx.globalAlpha = pass === 1 ? A * lerp(1, 0.1, k / (NB - 1)) : A;
          ctx.stroke();
        }
      }
      // Burning heads, and the glitter along a willow's strands.
      for (let i = from; i < to; i += 1) {
        if ((sState[i] ?? 0) !== 1) continue;
        const kind = sKind[i] ?? 0;
        const life = sLife[i] ?? 1;
        const age = t - (sBorn[i] ?? 0);
        let a = A;
        if (kind === 1 || kind === 3) {
          // Peony stars twinkle as they die.
          const end = age / life;
          if (end > 0.7 && motion)
            a *= hash01(i * 7 + 1, frameNo) > 0.42 ? 1 : 0.2;
          a *= clamp01((1 - end) * 4);
        } else if (kind === 0) {
          a *= clamp01((life - age) / 0.6) * 0.85;
        }
        const spr =
          kind === 0 || kind === 2
            ? hotGlow
            : glow[(sColour[i] ?? 0) % palette.length];
        if (!spr || a <= 0.01) continue;
        const s = kind === 0 ? 5 : 7;
        ctx.globalAlpha = a;
        ctx.drawImage(spr, (sX[i] ?? 0) - s / 2, (sY[i] ?? 0) - s / 2, s, s);
      }
      if (kindB === 0 && goldGlow) {
        const glints = Math.round((to - from) * 0.6);
        ctx.fillStyle = sparkStyle[0] ?? "";
        for (let n = 0; n < glints; n += 1) {
          const h1 = hash01(b * 977 + n, motion ? frameNo : 1);
          const i = from + Math.floor(h1 * (to - from));
          const cnt = hCount[i] ?? 0;
          if (cnt < 3) continue;
          const j =
            1 + Math.floor(hash01(n, i + (motion ? frameNo : 3)) * (cnt - 1));
          const idx = i * HIST + (((hHead[i] ?? 0) - 1 - j + HIST * 2) % HIST);
          const age = t - (hT[idx] ?? 0);
          const sag = (0.5 * gS * age * age) / (1 + age * 0.5);
          ctx.globalAlpha = A * clamp01(1 - age / span) * 0.9;
          ctx.fillRect(
            (hX[idx] ?? 0) + windX * age - 0.7,
            (hY[idx] ?? 0) + sag - 0.7,
            1.4,
            1.4,
          );
        }
      }
    }

    // Sparks: rising trails and crossette crackle, three brightness steps.
    for (let k = 0; k < 3; k += 1) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = sparkStyle[k] ?? "";
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        const life = pLife[i] ?? 0;
        if (life <= 0) continue;
        const f = (pAge[i] ?? 0) / life;
        if (Math.min(2, Math.floor(f * 3)) !== k) continue;
        ctx.rect((pX[i] ?? 0) - 0.65, (pY[i] ?? 0) - 0.65, 1.3, 1.3);
        any = true;
      }
      if (any) ctx.fill();
    }
    for (let s = 0; s < MAX_SHELLS; s += 1) {
      if (!shAlive[s] || !hotGlow) continue;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(hotGlow, (shX[s] ?? 0) - 5, (shY[s] ?? 0) - 5, 10, 10);
    }

    // The river: the sky above, mirrored and squeezed into rippling strips.
    if (c.reflection && bankY < H - 4) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const top = bankY + 2;
      const depth = H - top;
      const squeeze = (bankY * 0.85) / depth;
      const strip = 2;
      for (let y = 0; y < depth; y += strip) {
        const f = y / depth;
        const sy = bankY - (y + strip) * squeeze;
        const sh = strip * squeeze;
        if (sy < 0) break;
        const wobble = motion
          ? Math.sin(y * 0.9 + clock * 1.6) * (0.6 + f * 2.2)
          : 0;
        ctx.globalAlpha = 0.34 * (1 - f * 0.7);
        ctx.drawImage(
          canvas,
          0,
          Math.round(sy * dpr),
          canvas.width,
          Math.max(1, Math.round(sh * dpr)),
          Math.round(wobble * dpr),
          Math.round((top + y) * dpr),
          canvas.width,
          Math.round(strip * dpr),
        );
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (fg) ctx.drawImage(fg, 0, 0);
  }

  const tick = (time: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible || document.hidden || c.paused) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60;
    last = time;
    step(dt);
    draw();
    if (busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  function kick() {
    if (disposed || frame || !visible || document.hidden || cfg?.paused) return;
    frame = window.requestAnimationFrame(tick);
  }

  const clearAll = () => {
    shAlive.fill(0);
    bAlive.fill(0);
    sState.fill(0);
    pLife.fill(0);
    mLife.fill(0);
  };

  /**
   * Under reduced motion the sky starts on a poster: the chosen shell, still,
   * hanging over the river. It is rebuilt when the knobs change, until the
   * visitor launches a still of their own.
   */
  let posterKey = "";
  let posterB = -1;
  const ensurePoster = () => {
    const c = cfg;
    if (!c || c.motionSafe || W < 1) return;
    const key = [
      c.posterKind,
      c.spread,
      c.gravity,
      c.trail,
      c.stars,
      c.height,
      c.seed,
      W,
      H,
      bankY,
    ].join("|");
    for (let b = 0; b < MAX_BURSTS; b += 1) {
      if (bAlive[b] && b !== posterB) return;
    }
    if (posterB >= 0 && bAlive[posterB] && key === posterKey) return;
    clearAll();
    posterKey = key;
    rand = lcg(c.seed);
    const y = bankY - (0.3 + 0.55 * clamp01(c.height)) * bankY * 0.92;
    const freeze = c.posterKind === 0 ? 1.7 : c.posterKind === 1 ? 0.75 : 0.95;
    const b = openBurst(c.posterKind, W * 0.5, y, 1, 1, freeze);
    posterB = b;
    if (b >= 0) {
      bHold[b] = Infinity;
      bStillT[b] = 1;
    }
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) return;
      if (!was || was.seed !== next.seed) rand = lcg(next.seed);
      if (!was || was.dpr !== next.dpr || was.reflection !== next.reflection) {
        measure();
        bankY = Math.round(H * (next.reflection ? 0.8 : 0.93));
        bg = null;
        fg = null;
      }
      if (was && was.seed !== next.seed) {
        bg = null;
        fg = null;
      }
      if (was && was.motionSafe !== next.motionSafe) {
        clearAll();
        posterB = -1;
        posterKey = "";
      }
      if (!was || was.colourKey !== next.colourKey) readColours();
      ensurePoster();
      if (!was && next.trigger === "mount" && !triggered) {
        triggered = true;
        hooks.current?.opening();
      }
      draw();
      kick();
    },
    resize() {
      measure();
      ensurePoster();
      draw();
      kick();
    },
    readColours,
    setVisible(v) {
      visible = v;
      if (v) {
        measure();
        ensurePoster();
        draw();
        if (cfg?.trigger === "inView" && !triggered) {
          triggered = true;
          hooks.current?.opening();
        }
        kick();
      }
    },
    launch(o) {
      const c = cfg;
      if (!c || c.paused || W < 1) return false;
      const h01 = clamp01(o.height ?? c.height);
      const x = clamp(o.x, 0.04, 0.96) * W;
      const apex = bankY - (0.3 + 0.55 * h01) * bankY * 0.92;
      const colour = o.colour ?? 0;
      if (!c.motionSafe) {
        // A still burst: the shell is shown fully open, and the stills
        // already in the sky make way for it.
        for (let b = 0; b < MAX_BURSTS; b += 1) {
          if (bAlive[b] && bFrozen[b] && !bLeaving[b]) {
            bLeaving[b] = 1;
            bStillT[b] = 0;
          }
        }
        const freeze = o.kind === 0 ? 1.7 : o.kind === 1 ? 0.75 : 0.95;
        const b = openBurst(o.kind, x, apex, o.size ?? 1, colour, freeze);
        posterB = -1;
        if (b >= 0) {
          // A still holds until the next one replaces it.
          bHold[b] = Infinity;
          hooks.current?.burst(o.kind, o.x, o.voiced);
        }
        draw();
        kick();
        return b >= 0;
      }
      let s = -1;
      for (let k = 0; k < MAX_SHELLS; k += 1) {
        if (!shAlive[k]) {
          s = k;
          break;
        }
      }
      if (s < 0) return false;
      const gRise = H * 0.85;
      const rise = Math.max(20, bankY - apex);
      shAlive[s] = 1;
      shX[s] = x;
      shY[s] = bankY - 2;
      shVx[s] = c.wind * 9 + (rand() - 0.5) * 10;
      shVy[s] = -Math.sqrt(2 * gRise * rise);
      shApex[s] = apex;
      shKind[s] = o.kind;
      shColour[s] = colour;
      shSize[s] = o.size ?? 1;
      shX01[s] = o.x;
      shVoiced[s] = o.voiced ? 1 : 0;
      kick();
      return true;
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      bg = null;
      fg = null;
      glow = [];
      smokeSprite = null;
    },
  };
}

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const where = (x: number) =>
  x < 0.34 ? "the left" : x > 0.66 ? "the right" : "the middle";

/**
 * A firework display in one frame: a night sky over a far riverbank, the
 * river below mirroring it. A click fires a shell from the bank under the
 * pointer; it climbs on a real ballistic arc, shedding sparks, and bursts at
 * its apex with a flash that lifts the whole sky toward its colour. A willow
 * hangs heavy stars whose strands droop with age, white-gold at the head and
 * amber along their length, glinting as they fade; a peony blooms round and
 * twinkles out; crossette comets split in a cross mid-flight. Smoke drifts on
 * the wind and catches later flashes.
 *
 * Canvas 2D, pooled, drawn only while something is in the air and the frame
 * is on screen. The frame is a button: Left and Right move the aim along the
 * bank (on the snap spring), Enter or Space launches there. `sequence` and
 * `playing` run a scripted finale. Under reduced motion every shell is a
 * still burst that fades in fully open, holds and fades away; the frame
 * starts on a still willow.
 */
export function WillowShell({
  children,
  shell = "willow",
  spread = 0.55,
  gravity = 0.5,
  height = 0.6,
  stars = 72,
  trail = 0.6,
  gold = DEFAULT_GOLD,
  colors = DEFAULT_COLORS,
  wind = 0.2,
  reflection = true,
  sequence = defaultWillowFinale,
  playing,
  defaultPlaying = false,
  onPlayingChange,
  trigger = "manual",
  onBurst,
  paused = false,
  seed = 7,
  dpr = 2,
  label = "Fireworks over the river",
  sound = false,
  disabled = false,
  className,
}: WillowShellProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const isPlaying = playing ?? ownPlaying;
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [aimShown, setAimShown] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const turn = React.useRef(0);
  const aim = useMotionValue(0.5);
  const aimLeft = useTransform(aim, (v) => `${(clamp01(v) * 100).toFixed(2)}%`);

  const config: Config = {
    spread,
    gravity,
    height,
    stars,
    trail,
    wind: clamp(wind, -1, 1),
    reflection,
    paused,
    seed,
    dpr,
    motionSafe,
    colourKey: [gold, ...colors].join("|"),
    trigger,
    posterKind: shell === "mixed" ? 0 : KIND_OF[shell],
  };
  const latest = React.useRef(config);

  /** The next shell's kind: the chosen one, or the next in turn for "mixed". */
  const nextKind = React.useCallback((): Kind => {
    if (shell !== "mixed") return KIND_OF[shell];
    const k = (turn.current % 3) as Kind;
    turn.current += 1;
    return k;
  }, [shell]);

  const fire = React.useCallback(
    (x: number, voiced: boolean, cue?: WillowCue) => {
      const e = engine.current;
      if (!e) return false;
      const kind = cue?.shell ? KIND_OF[cue.shell] : nextKind();
      const colour = Math.floor(hashColour(x, cue?.at ?? turn.current) * 8);
      const ok = e.launch({
        kind,
        x,
        height: cue?.height,
        size: cue?.size,
        colour,
        voiced,
      });
      if (ok && voiced) {
        audio.play("whistle", {
          pitch: 0.9 + 0.2 * clamp01(cue?.height ?? height),
          gain: 0.45,
          pan: Number(((x * 2 - 1) * 0.6).toFixed(3)),
        });
      }
      return ok;
    },
    [audio, height, nextKind],
  );

  const hooks = React.useRef<EngineHooks>({
    burst: () => {},
    opening: () => {},
  });
  React.useEffect(() => {
    hooks.current = {
      burst: (kind, x, voiced) => {
        if (voiced) {
          audio.play("flare", {
            pitch: kind === 0 ? 0.72 : kind === 1 ? 1 : 1.15,
            gain: 0.5 + 0.2 * clamp01(spread),
            pan: Number(((x * 2 - 1) * 0.6).toFixed(3)),
          });
        }
        onBurst?.(KIND_NAME[kind], x);
      },
      opening: () => {
        if (!disabled) fire(0.5, false);
      },
    };
  });

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, hooks);
    engine.current = e;
    e.configure(latest.current);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      e.setVisible(Boolean(entry?.isIntersecting));
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) e.resize();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  // The show: each cue on its own timer, from the moment `playing` turns on.
  React.useEffect(() => {
    if (!isPlaying || disabled || paused) return;
    // A show the visitor just started answers with sound; one that started
    // itself stays quiet.
    const voiced =
      typeof navigator !== "undefined" &&
      Boolean(
        (navigator as Navigator & { userActivation?: { isActive: boolean } })
          .userActivation?.isActive,
      );
    const timers: number[] = [];
    let end = 0;
    for (const cue of sequence) {
      const at = Math.max(0, cue.at);
      end = Math.max(end, at);
      timers.push(
        window.setTimeout(() => fire(clamp01(cue.x ?? 0.5), voiced, cue), at),
      );
    }
    timers.push(
      window.setTimeout(() => {
        if (playing === undefined) setOwnPlaying(false);
        onPlayingChange?.(false);
      }, end + 4600),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
    // The show restarts only when it is switched on, or its script changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, sequence, disabled, paused]);

  const moveAim = (to: number) => {
    const next = clamp(to, 0.04, 0.96);
    if (motionSafe) animate(aim, next, springs.snap);
    else aim.jump(next);
  };

  const local = (clientX: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r && r.width > 0 ? clamp01((clientX - r.left) / r.width) : 0.5;
  };

  const launchHere = (x: number) => {
    if (disabled) return;
    const kind =
      shell === "mixed" ? (KIND_NAME[turn.current % 3] ?? "willow") : shell;
    if (fire(x, true)) {
      const text = `${kind.charAt(0).toUpperCase()}${kind.slice(1)} shell launched from ${where(x)} of the bank.`;
      setSaid((s) => ({ n: s.n + 1, text }));
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const by = event.shiftKey ? 0.25 : 0.08;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      moveAim(aim.get() - by);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      moveAim(aim.get() + by);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveAim(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveAim(1);
    }
  };

  const bankTop = reflection ? 80 : 93;
  const name = shell === "mixed" ? "the next" : `a ${shell}`;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate h-96 w-full overflow-clip rounded-3 select-none",
        className,
      )}
      style={
        {
          backgroundColor: NIGHT,
          backgroundImage: `linear-gradient(180deg, color-mix(in oklab, ${NIGHT}, black 25%) 0%, ${NIGHT} 52%, ${HORIZON} ${bankTop}%, ${BANK} ${bankTop}%, ${BANK} 100%)`,
          "--willow-ink": "color-mix(in oklab, var(--accent-bright) 8%, white)",
          "--willow-faint":
            "color-mix(in oklab, var(--accent-bright) 30%, white 62%)",
        } as React.CSSProperties
      }
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <button
        type="button"
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={() => setAimShown(true)}
        onBlur={() => setAimShown(false)}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setAimShown(true);
        }}
        onPointerLeave={(event) => {
          if (document.activeElement !== event.currentTarget) {
            setAimShown(false);
          }
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          aim.jump(clamp(local(event.clientX), 0.04, 0.96));
        }}
        onClick={(event) => {
          if (event.detail === 0) {
            launchHere(aim.get());
            return;
          }
          const x = clamp(local(event.clientX), 0.04, 0.96);
          aim.jump(x);
          launchHere(x);
        }}
        className={cn(
          "absolute inset-0 z-0 size-full cursor-crosshair touch-manipulation rounded-[inherit] disabled:cursor-default",
          FOCUS_RING,
        )}
      />
      {children ? (
        <div className="pointer-events-none relative z-10 w-full">
          {children}
        </div>
      ) : null}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute z-10 -ml-[5px] h-[6px] w-[10px] transition-opacity duration-200"
        style={{
          left: aimLeft,
          top: `calc(${bankTop}% - 9px)`,
          opacity: aimShown && !disabled ? 1 : 0,
        }}
      >
        <svg viewBox="0 0 10 6" className="block size-full">
          <path d="M0 0 L10 0 L5 6 Z" fill="var(--willow-ink)" opacity={0.85} />
        </svg>
      </motion.span>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[NIGHT, HORIZON, BANK, SMOKE, WINDOWS, gold, ...colors].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <span id={hintId} className="sr-only">
        Left and Right aim along the bank; Enter or Space launches {name} shell.
      </span>
      <span aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}

/** A colour index for a shell from where it was fired: the same shell, the same colour. */
function hashColour(x: number, salt: number) {
  return hash01(Math.round(x * 1000), Math.round(salt));
}
