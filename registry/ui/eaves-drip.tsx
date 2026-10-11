"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type EavesDripPalette = "auto" | "day" | "dusk" | "night";

export type EavesDripProps = {
  /** Content above the scene, such as a caption. It stays fully interactive. */
  children?: React.ReactNode;
  /** How hard it rains, 0 (a few drops) to 1 (a downpour). @default 0.5 */
  rainRate?: number;
  /** The size of one cell of the pixel art, 2 to 6 px. @default 3 */
  pixel?: number;
  /** How big the puddle may grow, 0 (a few cells) to 1 (wide). @default 0.6 */
  puddle?: number;
  /** The resting wind, -1 (blowing left) to 1 (blowing right). @default 0.25 */
  wind?: number;
  /** Strength of a click's gust, 0 to 1. @default 0.7 */
  gust?: number;
  /** The scene's colours: an overcast day on a light page and a night on a dark one, or fixed. @default "auto" */
  palette?: EavesDripPalette;
  /** Light the cottage window. @default true */
  windowLight?: boolean;
  /** The pointer sets the wind, a click sends a gust, and the keys do both. @default true */
  interactive?: boolean;
  /** Plips as a gust's spray and the next drips land. Silent until a visitor clicks or presses a key. @default false */
  sound?: boolean;
  /** Fires when a gust is sent, with the way it blows. */
  onGust?: (direction: -1 | 1) => void;
  /** Fires when the wind settles to a new value, rounded to one decimal. */
  onWindChange?: (wind: number) => void;
  /** How full the puddle is, 0 to 1, rounded to two decimals, at most twice a second. */
  onPuddleChange?: (fill: number) => void;
  /** Freeze the rain. @default false */
  paused?: boolean;
  /** Seeds the tiles, the hills and the rain. @default 2 */
  seed?: number;
  /** Accessible name. @default "Rain on a roof" */
  label?: string;
  /** Sizes the scene. @default "h-52 w-full" */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** OKLCH to 8-bit sRGB. */
function oklchRgb(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const g = (c: number) => {
    const v = clamp01(c);
    const e = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(clamp01(e) * 255);
  };
  return [g(lin[0] ?? 0), g(lin[1] ?? 0), g(lin[2] ?? 0)];
}

type Tone = [number, number, number];
type Scheme = Record<
  | "skyTop"
  | "skyLow"
  | "hill"
  | "rain"
  | "rainNear"
  | "tile"
  | "tileLight"
  | "tileDark"
  | "ridge"
  | "wet"
  | "gutter"
  | "gutterShine"
  | "water"
  | "wall"
  | "wallDark"
  | "frame"
  | "pane"
  | "paneLight"
  | "glow"
  | "door"
  | "grass"
  | "earth"
  | "bush"
  | "puddle"
  | "puddleLight"
  | "ripple"
  | "splash"
  | "spray",
  Tone
>;

/** Three pixel-art palettes, each a fixed set of pigments (no theme tokens: this is a picture). */
function schemeOf(name: "day" | "dusk" | "night"): Scheme {
  const c = oklchRgb;
  if (name === "day") {
    return {
      skyTop: c(0.8, 0.02, 245),
      skyLow: c(0.88, 0.014, 235),
      hill: c(0.74, 0.03, 200),
      rain: c(0.6, 0.03, 245),
      rainNear: c(0.5, 0.035, 245),
      tile: c(0.56, 0.11, 38),
      tileLight: c(0.64, 0.1, 42),
      tileDark: c(0.46, 0.1, 34),
      ridge: c(0.5, 0.09, 34),
      wet: c(0.72, 0.07, 45),
      gutter: c(0.6, 0.012, 250),
      gutterShine: c(0.78, 0.01, 250),
      water: c(0.7, 0.05, 235),
      wall: c(0.9, 0.025, 85),
      wallDark: c(0.8, 0.03, 80),
      frame: c(0.97, 0.005, 90),
      pane: c(0.5, 0.035, 240),
      paneLight: c(0.62, 0.035, 235),
      glow: c(0.62, 0.09, 135),
      door: c(0.5, 0.07, 150),
      grass: c(0.66, 0.1, 135),
      earth: c(0.56, 0.06, 80),
      bush: c(0.5, 0.08, 145),
      puddle: c(0.66, 0.035, 240),
      puddleLight: c(0.8, 0.025, 235),
      ripple: c(0.92, 0.015, 230),
      splash: c(0.9, 0.02, 235),
      spray: c(0.95, 0.01, 230),
    };
  }
  if (name === "dusk") {
    return {
      skyTop: c(0.36, 0.06, 300),
      skyLow: c(0.62, 0.09, 45),
      hill: c(0.32, 0.05, 310),
      rain: c(0.7, 0.04, 330),
      rainNear: c(0.8, 0.04, 330),
      tile: c(0.38, 0.07, 30),
      tileLight: c(0.48, 0.08, 40),
      tileDark: c(0.29, 0.06, 25),
      ridge: c(0.33, 0.06, 25),
      wet: c(0.62, 0.08, 50),
      gutter: c(0.45, 0.02, 300),
      gutterShine: c(0.66, 0.04, 40),
      water: c(0.7, 0.06, 40),
      wall: c(0.42, 0.04, 320),
      wallDark: c(0.34, 0.04, 315),
      frame: c(0.3, 0.03, 300),
      pane: c(0.86, 0.13, 80),
      paneLight: c(0.94, 0.09, 90),
      glow: c(0.46, 0.08, 60),
      door: c(0.28, 0.04, 20),
      grass: c(0.36, 0.06, 150),
      earth: c(0.27, 0.04, 40),
      bush: c(0.28, 0.05, 160),
      puddle: c(0.42, 0.06, 320),
      puddleLight: c(0.66, 0.08, 45),
      ripple: c(0.8, 0.05, 50),
      splash: c(0.85, 0.04, 40),
      spray: c(0.9, 0.03, 40),
    };
  }
  return {
    skyTop: c(0.17, 0.03, 262),
    skyLow: c(0.26, 0.035, 255),
    hill: c(0.21, 0.03, 250),
    rain: c(0.52, 0.03, 245),
    rainNear: c(0.66, 0.03, 245),
    tile: c(0.31, 0.05, 30),
    tileLight: c(0.38, 0.06, 35),
    tileDark: c(0.24, 0.04, 28),
    ridge: c(0.27, 0.04, 28),
    wet: c(0.5, 0.04, 240),
    gutter: c(0.38, 0.012, 255),
    gutterShine: c(0.56, 0.015, 250),
    water: c(0.6, 0.04, 240),
    wall: c(0.3, 0.02, 60),
    wallDark: c(0.25, 0.02, 55),
    frame: c(0.2, 0.02, 50),
    pane: c(0.86, 0.13, 82),
    paneLight: c(0.94, 0.09, 90),
    glow: c(0.36, 0.06, 75),
    door: c(0.22, 0.03, 40),
    grass: c(0.24, 0.045, 145),
    earth: c(0.19, 0.03, 60),
    bush: c(0.2, 0.04, 155),
    puddle: c(0.28, 0.035, 250),
    puddleLight: c(0.5, 0.05, 245),
    ripple: c(0.7, 0.03, 240),
    splash: c(0.78, 0.02, 240),
    spray: c(0.85, 0.015, 240),
  };
}

/** Bayer 4 × 4 thresholds for the dithered gradients. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (v) => (v + 0.5) / 16,
);
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)] ?? 0.5;

type Geometry = {
  C: number;
  R: number;
  groundY: number;
  x0: number;
  hw: number;
  ov: number;
  eaveY: number;
  ridgeY: number;
  dripX: number;
  dripY: number;
  puddleX: number;
  puddleY: number;
  puddleMax: number;
};

function geometryOf(C: number, R: number, puddle: number): Geometry {
  const gh = clamp(Math.round(R * 0.16), 5, 14);
  const groundY = R - gh;
  const wh = clamp(Math.round(R * 0.27), 8, 24);
  const eaveY = groundY - wh - 1;
  const rh = clamp(Math.round(R * 0.26), 7, 22);
  const ridgeY = Math.max(3, eaveY - rh);
  const wide = C >= 130;
  const x0 = wide ? Math.round(C * 0.14) : Math.max(3, Math.round(C * 0.07));
  const hw = wide ? clamp(Math.round(C * 0.4), 40, 120) : Math.round(C * 0.52);
  const ov = Math.max(2, Math.round(hw * 0.04));
  const dripX = x0 + hw + ov + 1;
  // The puddle spreads both ways from under the lip, on open ground.
  const puddleMax = clamp(
    Math.round(lerp(3, Math.max(4, C * 0.16), clamp01(puddle))),
    3,
    Math.max(3, Math.round(C * 0.2)),
  );
  return {
    C,
    R,
    groundY,
    x0,
    hw,
    ov,
    eaveY,
    ridgeY,
    dripX,
    dripY: eaveY + 1,
    puddleX: dripX,
    puddleY: groundY + 1,
    puddleMax,
  };
}

/** The roof's span on a row, as [left, right] cells, or null above or below it. */
function roofSpan(g: Geometry, y: number): [number, number] | null {
  if (y < g.ridgeY || y >= g.eaveY) return null;
  const t = g.eaveY - 1 - y;
  const inset = Math.round(t * 0.85);
  const l = g.x0 - g.ov + inset;
  const r = g.x0 + g.hw + g.ov - inset;
  return l <= r ? [l, r] : null;
}

type Config = {
  rainRate: number;
  pixel: number;
  puddle: number;
  wind: number;
  gust: number;
  palette: EavesDripPalette;
  windowLight: boolean;
  paused: boolean;
  motionSafe: boolean;
  seed: number;
};

type Hooks = {
  plip: (pitch: number, gain: number, pan: number) => void;
  wind: (w: number) => void;
  fill: (f: number) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  steer: (fx: number | null) => void;
  gust: (direction: -1 | 1) => void;
  windNow: () => number;
  resize: () => void;
  readTheme: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

const MAX_DROPS = 700;
const MAX_BITS = 520;
const MAX_BEADS = 90;
const MAX_RINGS = 24;
const STEP = 1 / 60;
/** Rain falls this many cells a second; wind leans it this many per unit. */
const FALL = 62;
const LEAN = 30;
const GRAVITY = 150;

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carrier: HTMLElement,
  hooks: Hooks,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let clock = 0;
  let lightPage = false;
  let scheme: Scheme = schemeOf("night");
  let g: Geometry = geometryOf(80, 40, 0.6);
  let img: ImageData | null = null;
  let buf = new Uint32Array(0);
  let bg = new Uint32Array(0);
  let rand = lcg(2);
  const col = {} as Record<keyof Scheme, number>;

  // Rain drops.
  const dx = new Float32Array(MAX_DROPS);
  const dy = new Float32Array(MAX_DROPS);
  const dFront = new Uint8Array(MAX_DROPS);
  let drops = 0;
  let spawnDebt = 0;
  // Bits: splashes, spray and the falling drip — ballistic cells.
  const bx = new Float32Array(MAX_BITS);
  const by = new Float32Array(MAX_BITS);
  const bvx = new Float32Array(MAX_BITS);
  const bvy = new Float32Array(MAX_BITS);
  const bLife = new Float32Array(MAX_BITS);
  const bKind = new Uint8Array(MAX_BITS); // 0 splash, 1 spray, 2 drip
  let bits = 0;
  // Beads of water running down the roof (kind 0) and along the gutter (kind 1).
  const ex = new Float32Array(MAX_BEADS);
  const ey = new Float32Array(MAX_BEADS);
  const eKind = new Uint8Array(MAX_BEADS);
  let beads = 0;
  // Ripples on the puddle.
  const rx = new Float32Array(MAX_RINGS);
  const rr = new Float32Array(MAX_RINGS);
  const rMax = new Float32Array(MAX_RINGS);
  let rings = 0;
  // Wet glints on the tiles: cell index and time left.
  const wetAt = new Int32Array(64);
  const wetT = new Float32Array(64);
  let wetNext = 0;

  let wind = 0.25;
  let windTarget = 0.25;
  let steerX: number | null = null;
  let gustV = 0;
  let reservoir = 0;
  let dripGrow = 0;
  let volume = 0;
  let armedUntil = -1;
  let reportIn = 0;
  let reportedWind = NaN;
  let reportedFill = NaN;
  let stillSpray = 0;
  let laidOut = "";

  const pack = (t: Tone) =>
    ((255 << 24) |
      ((t[2] & 255) << 16) |
      ((t[1] & 255) << 8) |
      (t[0] & 255)) >>>
    0;

  const set = (x: number, y: number, c: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= g.C || yi >= g.R) return;
    buf[yi * g.C + xi] = c;
  };

  const reader = document.createElement("canvas");
  reader.width = 1;
  reader.height = 1;
  const readerCtx = reader.getContext("2d", { willReadFrequently: true });
  /** The page's background luminance, by painting one pixel of whatever colour the carrier resolved to. */
  const readTheme = () => {
    let lum = 0;
    if (readerCtx) {
      readerCtx.clearRect(0, 0, 1, 1);
      readerCtx.fillStyle = "rgb(0, 0, 0)";
      readerCtx.fillStyle = getComputedStyle(carrier).color;
      readerCtx.fillRect(0, 0, 1, 1);
      const d = readerCtx.getImageData(0, 0, 1, 1).data;
      lum =
        (0.2126 * (d[0] ?? 0) + 0.7152 * (d[1] ?? 0) + 0.0722 * (d[2] ?? 0)) /
        255;
    }
    lightPage = lum > 0.5;
  };

  const pickScheme = () => {
    const c = cfg;
    const name =
      !c || c.palette === "auto" ? (lightPage ? "day" : "night") : c.palette;
    scheme = schemeOf(name);
    for (const k of Object.keys(scheme) as (keyof Scheme)[])
      col[k] = pack(scheme[k]);
  };

  /** The scene that does not move, rasterised once per size and palette. */
  const paintStatic = () => {
    const c = cfg;
    if (!c) return;
    const { C, R, groundY, x0, hw, eaveY, ridgeY } = g;
    const r = lcg(c.seed * 7 + 1);
    bg = new Uint32Array(C * R);
    const put = (x: number, y: number, v: number) => {
      if (x < 0 || y < 0 || x >= C || y >= R) return;
      bg[y * C + x] = v;
    };
    // Sky: four close tones from the top to the horizon, dithered only
    // where one band meets the next, so it reads as a gradient, not a weave.
    const band = [0, 1, 2, 3].map((k) =>
      pack([
        Math.round(lerp(scheme.skyTop[0], scheme.skyLow[0], k / 3)),
        Math.round(lerp(scheme.skyTop[1], scheme.skyLow[1], k / 3)),
        Math.round(lerp(scheme.skyTop[2], scheme.skyLow[2], k / 3)),
      ]),
    );
    for (let y = 0; y < groundY; y += 1) {
      const level = (y / Math.max(1, groundY - 1)) * 3;
      const lo = Math.min(2, Math.floor(level));
      const frac = level - lo;
      // Only the last quarter of each band dithers into the next.
      const mixAt = clamp01((frac - 0.75) / 0.25);
      for (let x = 0; x < C; x += 1)
        put(
          x,
          y,
          (mixAt > bayer(x, y) ? band[lo + 1] : band[lo]) ?? col.skyTop,
        );
    }
    // Low hills behind, from a seeded sum of waves.
    const p1 = r() * 6.28;
    const p2 = r() * 6.28;
    for (let x = 0; x < C; x += 1) {
      const h = Math.round(
        R * 0.07 +
          R * 0.05 * Math.sin(x * 0.045 + p1) +
          R * 0.03 * Math.sin(x * 0.13 + p2),
      );
      for (let y = groundY - Math.max(1, h); y < groundY; y += 1)
        put(x, y, col.hill);
    }
    // A bush at the far end of the garden, where there is room for one.
    if (C >= 120) {
      const cx = C - Math.round(C * 0.11);
      const rad = clamp(Math.round(R * 0.09), 3, 8);
      for (let y = groundY - rad * 2; y < groundY; y += 1) {
        for (let x = cx - rad * 2; x <= cx + rad * 2; x += 1) {
          const ddx = (x - cx) / 2;
          const ddy = y - (groundY - rad * 0.8);
          if (ddx * ddx + ddy * ddy <= rad * rad)
            put(x, y, (x + y) % 5 === 0 ? col.grass : col.bush);
        }
      }
    }
    // Ground: two rows of grass, a dithered row, then earth.
    for (let y = groundY; y < R; y += 1) {
      const depth = y - groundY;
      for (let x = 0; x < C; x += 1) {
        const earth = depth > 2 || (depth === 2 && bayer(x, y) < 0.5);
        put(x, y, earth ? col.earth : col.grass);
      }
    }
    // The wall, with its shadow under the eave.
    for (let y = eaveY + 1; y < groundY; y += 1) {
      for (let x = x0; x < x0 + hw; x += 1) {
        const edge = x === x0 || x === x0 + hw - 1;
        put(x, y, edge || y <= eaveY + 2 ? col.wallDark : col.wall);
      }
    }
    // A window and a door.
    const wy = eaveY + 4;
    const wh = clamp(Math.round((groundY - eaveY) * 0.38), 4, 10);
    const ww = clamp(Math.round(hw * 0.17), 6, 16);
    const wx = x0 + Math.round(hw * 0.16);
    const lit = c.windowLight && scheme.pane[0] > scheme.wall[0];
    for (let y = wy - 1; y <= wy + wh; y += 1) {
      for (let x = wx - 1; x <= wx + ww; x += 1) {
        const frameCell =
          y === wy - 1 ||
          y === wy + wh ||
          x === wx - 1 ||
          x === wx + ww ||
          x === wx + Math.floor(ww / 2) ||
          y === wy + Math.floor(wh / 2);
        const pane = c.windowLight
          ? y === wy || x === wx
            ? col.paneLight
            : col.pane
          : col.wallDark;
        put(x, y, frameCell ? col.frame : pane);
      }
    }
    const dw = clamp(Math.round(hw * 0.11), 4, 9);
    const dh = clamp(Math.round((groundY - eaveY) * 0.72), 5, 18);
    const dxl = x0 + Math.round(hw * 0.6);
    for (let y = groundY - dh; y < groundY; y += 1) {
      for (let x = dxl - 1; x <= dxl + dw; x += 1) {
        const edge = x === dxl - 1 || x === dxl + dw || y === groundY - dh;
        put(x, y, edge ? col.frame : col.door);
      }
    }
    put(dxl + dw - 2, groundY - Math.round(dh * 0.45), col.gutterShine);
    // The window's light on the ground below it, at night.
    if (lit) {
      const gx = wx + ww / 2;
      for (let y = groundY; y < Math.min(R, groundY + 4); y += 1) {
        for (let x = Math.round(gx - ww); x <= Math.round(gx + ww); x += 1) {
          const k = 1 - Math.abs(x - gx) / ww - (y - groundY) * 0.25;
          // A solid pool of light with a dithered edge.
          if (k > 0.4 || (k > 0.18 && bayer(x, y) < 0.5)) put(x, y, col.glow);
        }
      }
    }
    // The roof: courses of rounded tiles under a ridge cap.
    for (let y = ridgeY; y < eaveY; y += 1) {
      const span = roofSpan(g, y);
      if (!span) continue;
      const t = eaveY - 1 - y;
      const course = Math.floor(t / 3);
      const k = t % 3;
      for (let x = span[0]; x <= span[1]; x += 1) {
        let v = k === 2 ? col.tileLight : k === 0 ? col.tileDark : col.tile;
        const seam = (x + (course % 2) * 2) % 4 === 0;
        if (seam && k !== 2) v = col.tileDark;
        if (x === span[0] || x === span[1]) v = col.tileDark;
        if (y === ridgeY) v = col.ridge;
        put(x, y, v);
      }
    }
    // The gutter along the eave, its end standing proud as the lip.
    for (let x = x0 - g.ov; x <= g.dripX; x += 1) {
      put(x, eaveY, (x + eaveY) % 6 === 0 ? col.gutterShine : col.gutter);
    }
    put(g.dripX, eaveY - 1, col.gutter);
  };

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const px = clamp(Math.round(c.pixel), 2, 6);
    const C = Math.ceil(w / px);
    const R = Math.ceil(h / px);
    const key = `${C}x${R}@${px}:${c.puddle}:${c.seed}`;
    if (key === laidOut && img) {
      // Same grid: only the canvas's place in the box may have moved.
      canvas.style.left = `${Math.floor((w - C * px) / 2)}px`;
      canvas.style.top = `${Math.floor((h - R * px) / 2)}px`;
      return;
    }
    laidOut = key;
    g = geometryOf(C, R, c.puddle);
    canvas.width = C;
    canvas.height = R;
    canvas.style.width = `${C * px}px`;
    canvas.style.height = `${R * px}px`;
    canvas.style.left = `${Math.floor((w - C * px) / 2)}px`;
    canvas.style.top = `${Math.floor((h - R * px) / 2)}px`;
    img = ctx.createImageData(C, R);
    buf = new Uint32Array(img.data.buffer);
    rand = lcg(c.seed);
    drops = 0;
    bits = 0;
    beads = 0;
    rings = 0;
    // The puddle starts a little under half its reach and grows from there.
    const cap = 0.35 * g.puddleMax * g.puddleMax;
    volume =
      volume > 0 ? Math.min(volume, cap) : 0.35 * (g.puddleMax * 0.45) ** 2;
    pickScheme();
    paintStatic();
    if (!c.motionSafe) seedStill();
    else warmStart();
  };

  const rate = () => {
    const c = cfg;
    return 2 + clamp01(c?.rainRate ?? 0.5) * 1.5 * g.C;
  };

  const windNow = () => clamp(wind + gustV, -2.5, 2.5);

  const addBit = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    kind: number,
  ) => {
    if (bits >= MAX_BITS) return;
    bx[bits] = x;
    by[bits] = y;
    bvx[bits] = vx;
    bvy[bits] = vy;
    bLife[bits] = life;
    bKind[bits] = kind;
    bits += 1;
  };

  const addRing = (x: number, max: number) => {
    if (rings >= MAX_RINGS) return;
    rx[rings] = x;
    rr[rings] = 0;
    rMax[rings] = max;
    rings += 1;
  };

  const puddleRx = () =>
    clamp(Math.sqrt(volume / 0.35), 1.5, Math.max(1.5, g.puddleMax));
  const inPuddle = (x: number) => Math.abs(x - g.puddleX) <= puddleRx();

  const splash = (x: number, y: number, n: number, up: number) => {
    for (let i = 0; i < n; i += 1) {
      const s = rand() < 0.5 ? -1 : 1;
      addBit(
        x,
        y - 1,
        s * (6 + rand() * 12) + windNow() * 6,
        -(up + rand() * up),
        0.5,
        0,
      );
    }
  };

  const landed = (x: number, kind: "rain" | "spray" | "drip") => {
    const live = clock < armedUntil;
    if (inPuddle(x)) {
      addRing(x, kind === "drip" ? clamp(puddleRx() * 0.9, 3, 12) : 2.5);
      if (kind === "drip") {
        volume += 1.4;
        splash(x, g.puddleY, 4, 22);
        if (live)
          hooks.plip(0.72 + rand() * 0.12, 0.6, ((x / g.C) * 2 - 1) * 0.6);
      } else {
        volume += 0.08;
        if (kind === "spray" && live)
          hooks.plip(1 + rand() * 0.5, 0.32, ((x / g.C) * 2 - 1) * 0.6);
      }
    } else if (kind !== "spray" || rand() < 0.4) {
      splash(x, g.groundY, kind === "drip" ? 3 : 1, 10);
    }
  };

  const spawnDrop = () => {
    if (drops >= MAX_DROPS) return;
    const w = windNow();
    // Upwind of the frame, so a leaning rain still covers it.
    const lead = (-w * LEAN * g.R) / FALL;
    dx[drops] = rand() * (g.C + Math.abs(lead)) + Math.min(0, lead);
    dy[drops] = -rand() * 6;
    dFront[drops] = rand() < 0.3 ? 1 : 0;
    drops += 1;
  };

  const simulate = (h: number) => {
    const c = cfg;
    if (!c) return;
    // The wind eases toward the hand (or the resting wind); a gust decays.
    wind += (windTarget - wind) * (1 - Math.exp(-h / 0.35));
    gustV *= Math.exp(-h / 0.8);
    const w = windNow();
    spawnDebt += rate() * h;
    while (spawnDebt >= 1) {
      spawnDebt -= 1;
      spawnDrop();
    }
    const vx = w * LEAN;
    for (let i = 0; i < drops;) {
      const ox = dx[i] ?? 0;
      const oy = dy[i] ?? 0;
      const nx = ox + vx * h;
      const ny = oy + FALL * h;
      dx[i] = nx;
      dy[i] = ny;
      let gone = false;
      const row = Math.floor(ny);
      const span = roofSpan(g, row);
      if (span && !dFront[i] && nx >= span[0] && nx <= span[1]) {
        // On the tiles: a burst, a wet glint, and sometimes a bead runs down.
        splash(nx, row, 2, 14);
        wetAt[wetNext] = row * g.C + Math.round(nx);
        wetT[wetNext] = 0.35;
        wetNext = (wetNext + 1) % wetAt.length;
        if (rand() < 0.4 && beads < MAX_BEADS) {
          ex[beads] = nx;
          ey[beads] = row;
          eKind[beads] = 0;
          beads += 1;
        }
        gone = true;
      } else if (ny >= g.groundY) {
        landed(nx, "rain");
        gone = true;
      } else if (nx < -4 || nx > g.C + 4) gone = true;
      if (gone) {
        drops -= 1;
        dx[i] = dx[drops] ?? 0;
        dy[i] = dy[drops] ?? 0;
        dFront[i] = dFront[drops] ?? 0;
      } else i += 1;
    }
    // Beads: down the roof face to the gutter, then along it to the lip.
    for (let i = 0; i < beads;) {
      let done = false;
      if (eKind[i] === 0) {
        ey[i] = (ey[i] ?? 0) + 9 * h;
        if ((ey[i] ?? 0) >= g.eaveY) {
          ey[i] = g.eaveY;
          eKind[i] = 1;
        }
      } else {
        ex[i] = (ex[i] ?? 0) + (11 + Math.max(0, w) * 4) * h;
        if ((ex[i] ?? 0) >= g.dripX) {
          reservoir += 1;
          done = true;
        }
      }
      if (done) {
        beads -= 1;
        ex[i] = ex[beads] ?? 0;
        ey[i] = ey[beads] ?? 0;
        eKind[i] = eKind[beads] ?? 0;
      } else i += 1;
    }
    // The drip at the lip swells with what the gutter brings, then lets go.
    const feed = reservoir > 0 ? Math.min(reservoir, 3 * h * 4) : 0;
    reservoir -= feed;
    dripGrow += feed * 0.08 + (clamp01(c.rainRate) > 0.02 ? h * 0.18 : 0);
    if (dripGrow >= 1) {
      dripGrow = 0;
      addBit(g.dripX + w * 0.3, g.dripY + 1, w * 4, 0, 4, 2);
    }
    // Bits fly, fall and land.
    for (let i = 0; i < bits;) {
      const kind = bKind[i] ?? 0;
      bvy[i] = (bvy[i] ?? 0) + GRAVITY * h * (kind === 1 ? 0.6 : 1);
      if (kind === 1) {
        // Spray rides the wind and is slowed by the air.
        bvx[i] =
          (bvx[i] ?? 0) + (w * LEAN - (bvx[i] ?? 0)) * (1 - Math.exp(-h / 0.5));
      }
      bx[i] = (bx[i] ?? 0) + (bvx[i] ?? 0) * h;
      by[i] = (by[i] ?? 0) + (bvy[i] ?? 0) * h;
      bLife[i] = (bLife[i] ?? 0) - h;
      let gone = (bLife[i] ?? 0) <= 0;
      if (!gone && (by[i] ?? 0) >= g.groundY && (bvy[i] ?? 0) > 0) {
        if (kind === 2) landed(bx[i] ?? 0, "drip");
        else if (kind === 1) landed(bx[i] ?? 0, "spray");
        gone = true;
      }
      if (gone) {
        bits -= 1;
        bx[i] = bx[bits] ?? 0;
        by[i] = by[bits] ?? 0;
        bvx[i] = bvx[bits] ?? 0;
        bvy[i] = bvy[bits] ?? 0;
        bLife[i] = bLife[bits] ?? 0;
        bKind[i] = bKind[bits] ?? 0;
      } else i += 1;
    }
    for (let i = 0; i < rings;) {
      rr[i] = (rr[i] ?? 0) + h * 9;
      if ((rr[i] ?? 0) > (rMax[i] ?? 0)) {
        rings -= 1;
        rx[i] = rx[rings] ?? 0;
        rr[i] = rr[rings] ?? 0;
        rMax[i] = rMax[rings] ?? 0;
      } else i += 1;
    }
    for (let i = 0; i < wetT.length; i += 1)
      wetT[i] = Math.max(0, (wetT[i] ?? 0) - h);
    // A dry spell lets the puddle shrink a little; rain fills it.
    const cap = 0.35 * g.puddleMax * g.puddleMax;
    volume = clamp(volume - h * 0.04 * (1 - clamp01(c.rainRate)), 0.6, cap);
  };

  /** The first frame is already raining: drops are spread through the sky. */
  const warmStart = () => {
    const n = Math.round((rate() * g.groundY) / FALL);
    for (let i = 0; i < n && drops < MAX_DROPS; i += 1) {
      dx[drops] = rand() * g.C;
      dy[drops] = rand() * g.groundY;
      dFront[drops] = rand() < 0.3 ? 1 : 0;
      drops += 1;
    }
  };

  /** Reduced motion's still: rain at the wind's angle, two rings, a drip at the lip. */
  const seedStill = () => {
    const r = lcg((cfg?.seed ?? 2) * 31 + 9);
    drops = 0;
    const n = Math.round(rate() * 0.9);
    for (let i = 0; i < n && drops < MAX_DROPS; i += 1) {
      dx[drops] = r() * g.C;
      dy[drops] = r() * g.groundY;
      dFront[drops] = r() < 0.3 ? 1 : 0;
      drops += 1;
    }
    rings = 0;
    addRing(g.puddleX, 4);
    rr[0] = 2.5;
    addRing(g.puddleX, 9);
    rr[1] = 6;
    dripGrow = 0.7;
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || !img) return;
    buf.set(bg);
    const w = windNow();
    // The puddle: an ellipse with a lit upper rim and its rings.
    const prx = puddleRx();
    const pry = Math.max(1, prx * 0.26);
    for (
      let y = Math.floor(g.puddleY - pry);
      y <= Math.ceil(g.puddleY + pry);
      y += 1
    ) {
      for (
        let x = Math.floor(g.puddleX - prx);
        x <= Math.ceil(g.puddleX + prx);
        x += 1
      ) {
        const ex2 = (x - g.puddleX) / prx;
        const ey2 = (y - g.puddleY) / pry;
        const d = ex2 * ex2 + ey2 * ey2;
        if (d > 1) continue;
        set(x, y, ey2 < -0.35 && d > 0.45 ? col.puddleLight : col.puddle);
      }
    }
    for (let i = 0; i < rings; i += 1) {
      const R0 = rr[i] ?? 0;
      if (R0 < 0.6) continue;
      const cx = rx[i] ?? 0;
      const steps = Math.max(8, Math.round(R0 * 6));
      for (let s = 0; s < steps; s += 1) {
        const a = (s / steps) * Math.PI * 2;
        const x = cx + Math.cos(a) * R0;
        const y = g.puddleY + Math.sin(a) * R0 * 0.3;
        const ex2 = (x - g.puddleX) / prx;
        const ey2 = (y - g.puddleY) / pry;
        if (ex2 * ex2 + ey2 * ey2 <= 1.05) set(x, y, col.ripple);
      }
    }
    // Wet glints where drops just hit the tiles.
    for (let i = 0; i < wetT.length; i += 1) {
      if ((wetT[i] ?? 0) <= 0) continue;
      const at = wetAt[i] ?? 0;
      if (at >= 0 && at < buf.length) buf[at] = col.wet;
    }
    // Water in the gutter and running down the tiles.
    for (let i = 0; i < beads; i += 1) {
      set(ex[i] ?? 0, ey[i] ?? 0, eKind[i] === 1 ? col.water : col.wet);
    }
    // The drop forming at the lip.
    if (dripGrow > 0.3) set(g.dripX, g.dripY, col.water);
    if (dripGrow > 0.75) set(g.dripX, g.dripY + 1, col.water);
    for (let i = 0; i < bits; i += 1) {
      const kind = bKind[i] ?? 0;
      const x = bx[i] ?? 0;
      const y = by[i] ?? 0;
      if (kind === 2) {
        set(x, y, col.water);
        set(x, y - 1, col.water);
      } else set(x, y, kind === 1 ? col.spray : col.splash);
    }
    if (stillSpray > 0) {
      // Reduced motion's gust: a still sheet of spray off the roof.
      const r = lcg(Math.round(stillSpray * 1000));
      const dir = Math.sign(w) || 1;
      for (let i = 0; i < 90; i += 1) {
        const t = r();
        set(
          g.x0 + t * g.hw + dir * r() * 10,
          g.ridgeY - r() * 8 + t * 4,
          col.spray,
        );
      }
    }
    // Rain: short streaks along the wind's angle, near ones brighter.
    const sx = (w * LEAN) / FALL;
    for (let i = 0; i < drops; i += 1) {
      const x = dx[i] ?? 0;
      const y = dy[i] ?? 0;
      const near = dFront[i] === 1;
      const v = near ? col.rainNear : col.rain;
      set(x, y, v);
      set(x - sx, y - 1, v);
      if (near) set(x - sx * 2, y - 2, v);
    }
    ctx.putImageData(img, 0, 0);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const report = (dt: number) => {
    reportIn -= dt;
    if (reportIn > 0) return;
    reportIn = 0.5;
    const ws = Math.round(clamp(wind, -1, 1) * 10) / 10;
    if (ws !== reportedWind) {
      reportedWind = ws;
      hooks.wind(ws);
    }
    const cap = 0.35 * g.puddleMax * g.puddleMax;
    const f = Math.round(clamp01(volume / Math.max(1, cap)) * 100) / 100;
    if (f !== reportedFill) {
      reportedFill = f;
      hooks.fill(f);
    }
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible || document.hidden || !c) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    let busy = false;
    if (c.motionSafe && !c.paused) {
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(STEP, left);
        simulate(h);
        clock += h;
        left -= h;
      }
      busy = true;
    } else {
      clock += dt;
      wind += (windTarget - wind) * (1 - Math.exp(-dt / 0.2));
      gustV *= Math.exp(-dt / 0.3);
      if (stillSpray > 0) stillSpray = Math.max(0, stillSpray - dt);
      busy =
        Math.abs(windTarget - wind) > 0.01 ||
        stillSpray > 0 ||
        Math.abs(gustV) > 0.01;
    }
    report(dt);
    draw();
    if (busy) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const retarget = () => {
    const c = cfg;
    const base = clamp(c?.wind ?? 0.25, -1, 1);
    windTarget = steerX === null ? base : clamp((steerX - 0.5) * 2.2, -1, 1);
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
        readTheme();
        wind = clamp(next.wind, -1, 1);
        retarget();
        layout();
        draw();
        kick();
        return;
      }
      if (
        was.pixel !== next.pixel ||
        was.puddle !== next.puddle ||
        was.seed !== next.seed
      )
        layout();
      else if (
        was.palette !== next.palette ||
        was.windowLight !== next.windowLight
      ) {
        pickScheme();
        paintStatic();
      }
      if (was.wind !== next.wind) retarget();
      if (was.motionSafe !== next.motionSafe && !next.motionSafe) seedStill();
      draw();
      kick();
    },
    steer(fx) {
      steerX = fx;
      retarget();
      kick();
    },
    gust(direction) {
      const c = cfg;
      if (!c) return;
      gustV = direction * (0.6 + 1.6 * clamp01(c.gust));
      armedUntil = clock + 1.8;
      if (!c.motionSafe) {
        stillSpray = 0.4;
        draw();
        kick();
        return;
      }
      // A sheet of spray lifted off the roof, the gutter and the puddle.
      const n = Math.round(40 + 90 * clamp01(c.gust));
      for (let i = 0; i < n; i += 1) {
        const from = rand();
        let x: number;
        let y: number;
        if (from < 0.65) {
          const row =
            g.ridgeY + Math.floor(rand() * Math.max(1, g.eaveY - g.ridgeY));
          const span = roofSpan(g, row);
          if (!span) continue;
          x = span[0] + rand() * (span[1] - span[0]);
          y = row - 1;
        } else if (from < 0.85) {
          x = g.x0 + rand() * (g.dripX - g.x0);
          y = g.eaveY - 1;
        } else {
          x = g.puddleX + (rand() - 0.5) * 2 * puddleRx();
          y = g.puddleY - 1;
        }
        addBit(
          x,
          y,
          direction * (14 + rand() * 30 * (0.5 + clamp01(c.gust))),
          -(18 + rand() * 36 * (0.4 + clamp01(c.gust))),
          2.2,
          1,
        );
      }
      kick();
    },
    windNow: () => wind,
    resize() {
      layout();
      draw();
      kick();
    },
    readTheme() {
      readTheme();
      pickScheme();
      paintStatic();
      draw();
    },
    setVisible(on) {
      visible = on;
      if (on) kick();
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      root.removeAttribute("data-live");
    },
  };
}

const INTERACTIVE =
  "a,button,input,select,textarea,summary,[role=button],[role=link],[tabindex]:not([tabindex='-1'])";

/**
 * A small pixel-art cottage in quiet rain, and the water's whole way down.
 * Drops fall at the wind's angle and burst on the tiles, leaving a wet glint;
 * some of the water runs down the roof, into the gutter and along it to the
 * end, where a drop swells at the lip, lets go and falls into a puddle that
 * slowly grows, each landing opening a ring. The pointer is the wind: lean
 * left or right of the middle and the rain leans with you. A click sends a
 * gust from that side that lifts a sheet of spray off the roof, the gutter
 * and the puddle, which falls back as scattered drops — with `sound`, plips
 * as it lands.
 *
 * One tiny canvas the size of the grid, scaled up crisp by CSS: the still
 * scene is rasterised once and each frame writes only the moving cells. The
 * scene is focusable: Left and Right step the wind, Enter sends a gust.
 * Under reduced motion it is a still frame whose rain still leans with the
 * wind.
 */
export function EavesDrip({
  children,
  rainRate = 0.5,
  pixel = 3,
  puddle = 0.6,
  wind = 0.25,
  gust = 0.7,
  palette = "auto",
  windowLight = true,
  interactive = true,
  sound = false,
  onGust,
  onWindChange,
  onPuddleChange,
  paused = false,
  seed = 2,
  label = "Rain on a roof",
  className,
}: EavesDripProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const keyWind = React.useRef<number | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const handlers = React.useRef({
    onGust,
    onWindChange,
    onPuddleChange,
    audio,
  });
  React.useEffect(() => {
    handlers.current = { onGust, onWindChange, onPuddleChange, audio };
  });

  const config: Config = {
    rainRate,
    pixel,
    puddle,
    wind,
    gust,
    palette,
    windowLight,
    paused,
    motionSafe,
    seed,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carrier = carrierRef.current;
    if (!root || !canvas || !carrier) return;
    const e = createEngine(root, canvas, carrier, {
      plip: (pitch, gain, pan) =>
        handlers.current.audio.play("plip", { pitch, gain, pan }),
      wind: (w) => handlers.current.onWindChange?.(w),
      fill: (f) => handlers.current.onPuddleChange?.(f),
    });
    engine.current = e;
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visibleRef.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visibleRef.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visibleRef.current = false;
    };
  }, []);

  const sendGust = (direction: -1 | 1) => {
    engine.current?.gust(direction);
    setSaid((s) => ({
      n: s.n + 1,
      text: `Gust to the ${direction > 0 ? "right" : "left"}.`,
    }));
    handlers.current.onGust?.(direction);
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || event.detail === 0) return;
    const hit = (event.target as Element | null)?.closest(INTERACTIVE);
    if (hit && hit !== event.currentTarget && event.currentTarget.contains(hit))
      return;
    const r = event.currentTarget.getBoundingClientRect();
    // The gust blows away from the side that was clicked.
    sendGust(event.clientX - r.left < r.width / 2 ? 1 : -1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || event.target !== event.currentTarget) return;
    const e = engine.current;
    if (!e) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const now = keyWind.current ?? clamp(wind, -1, 1);
      const next = r2(
        clamp(now + (event.key === "ArrowRight" ? 0.25 : -0.25), -1, 1),
      );
      keyWind.current = next;
      e.steer(next / 2.2 + 0.5);
      setSaid((s) => ({
        n: s.n + 1,
        text:
          next === 0
            ? "Wind still."
            : `Wind ${Math.abs(next)} to the ${next > 0 ? "right" : "left"}.`,
      }));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const w = keyWind.current ?? e.windNow();
      sendGust(w < 0 ? -1 : 1);
    }
  };

  const sky = palette === "auto" ? null : palette;
  const tones =
    palette === "day"
      ? ["oklch(0.8 0.02 245)", "oklch(0.88 0.014 235)", "oklch(0.66 0.1 135)"]
      : palette === "dusk"
        ? [
            "oklch(0.36 0.06 300)",
            "oklch(0.62 0.09 45)",
            "oklch(0.36 0.06 150)",
          ]
        : palette === "night"
          ? [
              "oklch(0.17 0.03 262)",
              "oklch(0.26 0.035 255)",
              "oklch(0.24 0.045 145)",
            ]
          : [
              "color-mix(in oklab, var(--background) 82%, var(--accent-bright))",
              "color-mix(in oklab, var(--background) 70%, var(--ink-3))",
              "color-mix(in oklab, var(--background) 55%, var(--signal))",
            ];

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="rain scene"
      aria-label={label}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => {
        if (!interactive || event.pointerType !== "mouse") return;
        const r = event.currentTarget.getBoundingClientRect();
        keyWind.current = null;
        engine.current?.steer(
          clamp01((event.clientX - r.left) / Math.max(1, r.width)),
        );
      }}
      onPointerLeave={() => {
        if (keyWind.current === null) engine.current?.steer(null);
      }}
      className={cn(
        "group/eaves-drip relative isolate h-52 w-full overflow-clip rounded-3",
        interactive ? "cursor-pointer" : "cursor-default",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      {interactive ? (
        <span id={hintId} className="sr-only">
          Move across the scene to change the wind; click or press Enter for a
          gust. Left and Right change the wind.
        </span>
      ) : null}
      {/* The still: sky, a cottage and its puddle, the server's frame. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/eaves-drip:opacity-0"
        style={{
          backgroundImage: `linear-gradient(to bottom, ${tones[0]}, ${tones[1]} 84%, ${tones[2]} 84%)`,
        }}
      >
        <div
          className="absolute"
          style={{
            left: "12%",
            width: "44%",
            top: "30%",
            height: "26%",
            clipPath: "polygon(10% 0, 90% 0, 100% 100%, 0 100%)",
            backgroundColor: "oklch(0.5 0.09 36)",
          }}
        />
        <div
          className="absolute"
          style={{
            left: "14%",
            width: "40%",
            top: "56%",
            height: "28%",
            backgroundColor:
              "color-mix(in oklab, oklch(0.5 0.09 36) 30%, oklch(0.7 0.02 80))",
          }}
        />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute opacity-0 transition-opacity duration-300 [image-rendering:pixelated] group-data-live/eaves-drip:opacity-100"
      />
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readTheme()}
        className="pointer-events-none absolute size-0 overflow-hidden text-background transition-colors duration-1"
      />
      {children ? (
        <div
          className={cn(
            "relative z-10 size-full text-foreground",
            sky === "day" ? "light" : sky ? "dark" : null,
          )}
        >
          {children}
        </div>
      ) : null}
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
