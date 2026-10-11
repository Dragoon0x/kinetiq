"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CardStuntWave = "sweep" | "rise" | "burst" | "diagonal";
export type CardStuntPalette = "home" | "sunset" | "harbor" | "ink";

export type CardStuntFrame = {
  /** Read out when the frame is stepped to, e.g. "Sunrise". */
  label?: string;
  /** How the flips travel across the stand into this frame. @default "sweep" */
  wave?: CardStuntWave;
} & (
  | {
      /** A word or two, set in the stand's 3 × 5 pixel font and centred. */
      text: string;
      /** Palette entry for the letters, 0–3. @default 1 */
      ink?: number;
      /** Palette entry for the field behind them, 0–3. @default 3 */
      field?: number;
    }
  | {
      /** Rows of the characters 0–3 (palette entries; a space is 0), scaled to the stand. */
      picture: readonly string[];
    }
  | {
      /** The palette entry, 0–3, for each seat. */
      draw: (col: number, row: number, cols: number, rows: number) => number;
    }
);

export type CardStuntProps = {
  /** The pictures and words the stand makes, in order. @default a sunrise, "GO", stripes and a target */
  frames?: readonly CardStuntFrame[];
  /** Tiers of seats, 4 to 12; the columns follow the width so seats stay near square. @default 8 */
  rows?: number;
  /** Speed of the flip front across the stand, 0.25 to 3. @default 1 */
  wave?: number;
  /** Four card colours, as palette entries 0 (field), 1 (light), 2 (accent) and 3 (deep). @default "home" */
  palette?: CardStuntPalette;
  /** Four CSS colours for entries 0–3; overrides `palette`. */
  colors?: readonly string[];
  /** Time from one frame to the next while auto-playing, the wave included, ms. @default 3200 */
  interval?: number;
  /** The frame shown, controlled. */
  index?: number;
  /** The first frame when uncontrolled. @default 0 */
  defaultIndex?: number;
  /** Fires from the key, click or timer that moved it, with the new index. */
  onIndexChange?: (index: number) => void;
  /** Step through the frames on its own while in view. @default true */
  autoPlay?: boolean;
  /** Let a stadium ripple roll across the stand between frames. @default true */
  ripple?: boolean;
  /** Seats near the pointer jump the gun and flip to the next frame early. @default true */
  earlyFlip?: boolean;
  /** Clicks, hover and the keys. @default true */
  interactive?: boolean;
  /** Swishes that travel with a step's wave, and a quiet one for an early flip. Silent until a visitor clicks or presses a key. @default false */
  sound?: boolean;
  /** Hold the current frame. @default false */
  paused?: boolean;
  /** Fires when Space pauses or resumes auto-play. */
  onPausedChange?: (paused: boolean) => void;
  /** Seeds faces, hair, shirts and each holder's timing. @default 4 */
  seed?: number;
  /** Accessible name. @default "Card stunt" */
  label?: string;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the stand. @default "h-52 w-full" */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const mod = (n: number, m: number) => ((n % m) + m) % m;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Card pigments: the same on a light page and a dark one. */
const PALETTES: Record<CardStuntPalette, readonly string[]> = {
  home: [
    "oklch(0.55 0.17 262)",
    "oklch(0.96 0.01 260)",
    "oklch(0.8 0.15 162)",
    "oklch(0.28 0.04 262)",
  ],
  sunset: [
    "oklch(0.64 0.16 32)",
    "oklch(0.95 0.04 85)",
    "oklch(0.83 0.15 82)",
    "oklch(0.33 0.09 330)",
  ],
  harbor: [
    "oklch(0.6 0.09 225)",
    "oklch(0.96 0.01 220)",
    "oklch(0.72 0.15 45)",
    "oklch(0.3 0.06 245)",
  ],
  ink: [
    "oklch(0.42 0.01 260)",
    "oklch(0.97 0 0)",
    "oklch(0.62 0.2 25)",
    "oklch(0.2 0.01 260)",
  ],
};

/** A 3 × 5 pixel font: five rows of three cells per glyph. */
const GLYPHS: Record<string, string> = {
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "110101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101110011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  "0": "111101101101111",
  "1": "010110010010111",
  "2": "110001010100111",
  "3": "110001010001110",
  "4": "101101111001001",
  "5": "111100110001110",
  "6": "011100110101010",
  "7": "111001010010010",
  "8": "010101010101010",
  "9": "010101011001110",
  "!": "010010010000010",
  "?": "110001010000010",
  "-": "000000111000000",
  ".": "000000000000010",
  " ": "000000000000000",
};

/** The default routine: a sunrise over water, "GO", stripes and a target. */
export const defaultCardStuntFrames: readonly CardStuntFrame[] = [
  {
    label: "Sunrise",
    wave: "rise",
    draw: (c, r, cols, rows) => {
      const horizon = Math.round(rows * 0.62);
      const cx = (cols - 1) / 2;
      const rad = Math.max(2, rows * 0.42);
      if (r >= horizon) {
        // The sun's path on the water, broken into bands.
        const onPath = Math.abs(c - cx) < rad * 0.55 - (r - horizon) * 0.3;
        return onPath && (r - horizon) % 2 === 0 ? 1 : 3;
      }
      const d = Math.hypot((c - cx) * 0.9, horizon - 0.5 - r);
      return d < rad ? 1 : r === horizon - 1 ? 2 : 0;
    },
  },
  { label: "GO", wave: "sweep", text: "GO", ink: 1, field: 3 },
  {
    label: "Stripes",
    wave: "diagonal",
    draw: (c, r) =>
      Math.floor((c + r) / 3) % 3 === 0
        ? 2
        : Math.floor((c + r) / 3) % 3 === 1
          ? 0
          : 1,
  },
  {
    label: "Target",
    wave: "burst",
    draw: (c, r, cols, rows) => {
      const d = Math.hypot((c - (cols - 1) / 2) * 0.95, r - (rows - 1) / 2);
      const ring = Math.floor(d / Math.max(1.2, rows / 6));
      return ring % 2 === 0 ? (ring === 0 ? 1 : 2) : 3;
    },
  },
];

/** A frame as one palette entry per seat. */
function rasterise(
  frame: CardStuntFrame,
  cols: number,
  rows: number,
): Uint8Array {
  const out = new Uint8Array(cols * rows);
  const pick = (v: number) =>
    clamp(Math.round(Number.isFinite(v) ? v : 0), 0, 3);
  if ("draw" in frame) {
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1)
        out[r * cols + c] = pick(frame.draw(c, r, cols, rows));
    return out;
  }
  if ("picture" in frame) {
    const ph = Math.max(1, frame.picture.length);
    const pw = Math.max(1, ...frame.picture.map((line) => line.length));
    for (let r = 0; r < rows; r += 1) {
      const line =
        frame.picture[Math.min(ph - 1, Math.floor(((r + 0.5) * ph) / rows))] ??
        "";
      for (let c = 0; c < cols; c += 1) {
        const ch =
          line[Math.min(pw - 1, Math.floor(((c + 0.5) * pw) / cols))] ?? "0";
        out[r * cols + c] = ch >= "0" && ch <= "3" ? Number(ch) : 0;
      }
    }
    return out;
  }
  const ink = pick(frame.ink ?? 1);
  const field = pick(frame.field ?? 3);
  out.fill(field);
  const text = frame.text.toUpperCase();
  const glyphs = Array.from(text, (ch) => GLYPHS[ch] ?? GLYPHS[" "] ?? "");
  const width = glyphs.length * 4 - 1;
  const scale = Math.max(
    1,
    Math.floor(Math.min((cols - 1) / Math.max(1, width), rows / 5)),
  );
  const x0 = Math.floor((cols - width * scale) / 2);
  const y0 = Math.floor((rows - 5 * scale) / 2);
  glyphs.forEach((g, k) => {
    for (let gy = 0; gy < 5; gy += 1) {
      for (let gx = 0; gx < 3; gx += 1) {
        if (g[gy * 3 + gx] !== "1") continue;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const c = x0 + (k * 4 + gx) * scale + sx;
            const r = y0 + gy * scale + sy;
            if (c >= 0 && c < cols && r >= 0 && r < rows)
              out[r * cols + c] = ink;
          }
        }
      }
    }
  });
  return out;
}

/** Columns for a stand of this size: seats a little wider than tall. */
const colsFor = (w: number, h: number, rows: number) =>
  clamp(Math.round(w / ((h / rows) * 1.05)), 4, 60);

/** Each holder's seconds of delay for a wave, before their own jitter. */
function delayOf(
  kind: CardStuntWave,
  c: number,
  r: number,
  cols: number,
  rows: number,
  reverse: boolean,
) {
  const fx = cols > 1 ? c / (cols - 1) : 0;
  const fy = rows > 1 ? r / (rows - 1) : 0;
  const x = reverse ? 1 - fx : fx;
  switch (kind) {
    case "rise":
      return reverse ? fy : 1 - fy;
    case "burst": {
      const d = Math.hypot((fx - 0.5) * (cols / Math.max(1, rows)), fy - 0.5);
      const far = Math.hypot(0.5 * (cols / Math.max(1, rows)), 0.5);
      return reverse ? 1 - d / far : d / far;
    }
    case "diagonal":
      return x * 0.7 + (1 - fy) * 0.3;
    default:
      return x;
  }
}

type Config = {
  frames: readonly CardStuntFrame[];
  rows: number;
  wave: number;
  colorKey: string;
  ripple: boolean;
  index: number;
  dir: 1 | -1;
  motionSafe: boolean;
  seed: number;
  dpr: number;
};

type Engine = {
  configure: (cfg: Config) => void;
  hover: (x: number, y: number) => boolean;
  ripple: () => void;
  waveSeconds: () => number;
  resize: () => void;
  readColours: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

/** The crowd: shirts, skins and hair, as pigments. */
const SHIRTS = [
  "oklch(0.5 0.03 260)",
  "oklch(0.58 0.06 200)",
  "oklch(0.45 0.05 30)",
  "oklch(0.62 0.04 120)",
  "oklch(0.38 0.03 300)",
];
const SKINS = [
  "oklch(0.86 0.05 70)",
  "oklch(0.74 0.08 60)",
  "oklch(0.6 0.09 50)",
  "oklch(0.46 0.07 45)",
  "oklch(0.8 0.06 55)",
];
const HAIRS = [
  "oklch(0.25 0.02 50)",
  "oklch(0.4 0.06 50)",
  "oklch(0.7 0.1 80)",
  "oklch(0.32 0.08 30)",
  "oklch(0.85 0.01 90)",
];

/** The flip: half a turn about the card's horizontal axis, landing on snap. */
const FLIP = springs.snap;
const STEP = 1 / 240;

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let clock = 0;
  const size = { w: 0, h: 0, dpr: 1, cols: 0, rows: 0, sw: 0, sh: 0 };
  let grids: Uint8Array[] = [];
  let shown = 0;
  let face = new Uint8Array(0);
  let target = new Uint8Array(0);
  let angle = new Float32Array(0);
  let spin = new Float32Array(0);
  let startAt = new Float32Array(0);
  let jitter = new Float32Array(0);
  let early = new Uint8Array(0);
  let flipping = 0;
  let fade = 1;
  let fadeFrom = new Uint8Array(0);
  let rippleAt = -1;
  let rippleDir = 1;
  const layer = document.createElement("canvas");
  const colours = Array.from({ length: 4 }, () => "rgb(128, 128, 128)");
  /** Per seat: shirt, skin and hair, seeded. */
  let who = new Uint8Array(0);
  const stand = {
    base: "rgb(40, 44, 56)",
    line: "rgba(255, 255, 255, 0.06)",
    light: false,
  };

  const reader = document.createElement("canvas");
  reader.width = 1;
  reader.height = 1;
  const readerCtx = reader.getContext("2d", { willReadFrequently: true });
  const rgbOf = (colour: string): [number, number, number] => {
    if (!readerCtx) return [128, 128, 128];
    readerCtx.clearRect(0, 0, 1, 1);
    readerCtx.fillStyle = "rgb(0, 0, 0)";
    readerCtx.fillStyle = colour;
    readerCtx.fillRect(0, 0, 1, 1);
    const d = readerCtx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 4; i += 1) {
      const el = kids[i];
      if (el) {
        const [r, g, b] = rgbOf(getComputedStyle(el).color);
        colours[i] = `rgb(${r}, ${g}, ${b})`;
      }
    }
    const baseEl = kids[4];
    const inkEl = kids[5];
    if (baseEl && inkEl) {
      const [r, g, b] = rgbOf(getComputedStyle(baseEl).color);
      const [ir, ig, ib] = rgbOf(getComputedStyle(inkEl).color);
      stand.light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
      // On a light page the terraces are concrete grey, so a white card
      // still stands out from them; on a dark one the surface itself does.
      const k = stand.light ? 0.2 : 0;
      const m = (a: number, z: number) => Math.round(a + (z - a) * k);
      stand.base = `rgb(${m(r, ir)}, ${m(g, ig)}, ${m(b, ib)})`;
      stand.line = `rgba(${ir}, ${ig}, ${ib}, ${stand.light ? 0.12 : 0.08})`;
    }
    paintStand();
  };

  /** The stand and its people, drawn once per size: only the cards move. */
  const paintStand = () => {
    const c = cfg;
    const lc = layer.getContext("2d");
    if (!c || !lc || size.w < 1) return;
    layer.width = canvas.width;
    layer.height = canvas.height;
    lc.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    lc.fillStyle = stand.base;
    lc.fillRect(0, 0, size.w, size.h);
    const { cols, rows, sw, sh } = size;
    for (let row = 0; row < rows; row += 1) {
      // The tier's riser under each row of seats.
      lc.fillStyle = stand.line;
      lc.fillRect(0, (row + 1) * sh - 1, size.w, 1);
      for (let col = 0; col < cols; col += 1) {
        const x = col * sw + sw / 2;
        const top = row * sh;
        const head = Math.max(1.6, Math.min(sw, sh) * 0.17);
        const i = row * cols + col;
        lc.fillStyle = SHIRTS[who[i * 3] ?? 0] ?? "gray";
        lc.beginPath();
        lc.roundRect(x - sw * 0.27, top + sh * 0.4, sw * 0.54, sh * 0.6, head);
        lc.fill();
        lc.fillStyle = SKINS[who[i * 3 + 1] ?? 0] ?? "tan";
        lc.beginPath();
        lc.arc(x, top + sh * 0.27, head, 0, Math.PI * 2);
        lc.fill();
        lc.fillStyle = HAIRS[who[i * 3 + 2] ?? 0] ?? "black";
        lc.beginPath();
        lc.arc(x, top + sh * 0.27 - head * 0.25, head, Math.PI, Math.PI * 2);
        lc.fill();
        if (head > 2.6) {
          // Eyes, for the moment a card turns edge-on.
          lc.fillStyle = "rgba(0, 0, 0, 0.55)";
          lc.fillRect(x - head * 0.42, top + sh * 0.27 + head * 0.1, 1, 1);
          lc.fillRect(x + head * 0.3, top + sh * 0.27 + head * 0.1, 1, 1);
        }
      }
    }
  };

  const rebuild = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    const rows = clamp(Math.round(c.rows), 4, 12);
    const cols = colsFor(size.w, size.h, rows);
    size.rows = rows;
    size.cols = cols;
    size.sw = size.w / cols;
    size.sh = size.h / rows;
    grids = (c.frames.length ? c.frames : defaultCardStuntFrames).map((f) =>
      rasterise(f, cols, rows),
    );
    const n = cols * rows;
    shown = mod(c.index, Math.max(1, grids.length));
    face = Uint8Array.from(grids[shown] ?? new Uint8Array(n));
    target = Uint8Array.from(face);
    angle = new Float32Array(n);
    spin = new Float32Array(n);
    startAt = new Float32Array(n).fill(-1);
    early = new Uint8Array(n);
    fadeFrom = Uint8Array.from(face);
    fade = 1;
    flipping = 0;
    const r = lcg(c.seed * 3 + 1);
    // Nobody is perfectly in time: each holder's own few hundredths.
    jitter = Float32Array.from({ length: n }, () => (r() - 0.5) * 0.08);
    const p = lcg(c.seed * 13 + 7);
    who = Uint8Array.from({ length: n * 3 }, (_, k) =>
      Math.floor(
        p() *
          (k % 3 === 0
            ? SHIRTS.length
            : k % 3 === 1
              ? SKINS.length
              : HAIRS.length),
      ),
    );
    paintStand();
  };

  /** The routine moves to a new frame: a wave of flips, or a cross-fade. */
  const goTo = (index: number, dir: 1 | -1) => {
    const c = cfg;
    if (!c || !grids.length) return;
    const next = mod(index, grids.length);
    if (next === shown) return;
    shown = next;
    const grid = grids[next];
    if (!grid) return;
    if (!c.motionSafe) {
      fadeFrom = Uint8Array.from(face);
      face = Uint8Array.from(grid);
      target = Uint8Array.from(grid);
      fade = 0;
      early.fill(0);
      return;
    }
    const frames = c.frames.length ? c.frames : defaultCardStuntFrames;
    const kind = frames[next]?.wave ?? "sweep";
    const span = waveSeconds();
    const { cols, rows } = size;
    flipping = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        target[i] = grid[i] ?? 0;
        if (early[i] && face[i] === target[i] && angle[i] === 0) {
          // It jumped the gun: the wave passes it by.
          startAt[i] = -1;
          continue;
        }
        startAt[i] =
          clock +
          delayOf(kind, col, row, cols, rows, dir < 0) * span +
          (jitter[i] ?? 0) +
          0.04;
        angle[i] = 0;
        spin[i] = 0;
        flipping += 1;
      }
    }
    early.fill(0);
  };

  /** Seconds the flip front takes to cross the stand. */
  const waveSeconds = () => 0.9 / clamp(cfg?.wave ?? 1, 0.25, 3);

  const stepFlips = (dt: number) => {
    if (flipping === 0) return;
    let live = 0;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < face.length; i += 1) {
      const at = startAt[i] ?? -1;
      if (at < 0) continue;
      if (clock < at) {
        live += 1;
        continue;
      }
      let a = angle[i] ?? 0;
      let v = spin[i] ?? 0;
      for (let s = 0; s < steps; s += 1) {
        const acc =
          (FLIP.stiffness * (Math.PI - a) - FLIP.damping * v) / FLIP.mass;
        v += acc * h;
        a += v * h;
      }
      if (a >= Math.PI / 2 && face[i] !== target[i]) face[i] = target[i] ?? 0;
      if (Math.abs(Math.PI - a) < 0.01 && Math.abs(v) < 0.08) {
        // Flat again, showing its other side: the flip is done.
        angle[i] = 0;
        spin[i] = 0;
        startAt[i] = -1;
        face[i] = target[i] ?? 0;
        continue;
      }
      angle[i] = a;
      spin[i] = v;
      live += 1;
    }
    flipping = live;
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || size.w < 1) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    const { cols, rows, sw, sh } = size;
    const cw = sw * 0.84;
    const ch = sh * 0.6;
    const rippleSpan = cols * sw;
    const crest = rippleAt >= 0 ? (clock - rippleAt) * rippleSpan * 0.9 : -1e9;
    const hand = Math.max(1, Math.min(sw, sh) * 0.09);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        const x = col * sw + (sw - cw) / 2;
        let y = row * sh + sh * 0.36;
        const a = angle[i] ?? 0;
        // A ripple: the card lifts as the crest passes, the crowd standing.
        if (rippleAt >= 0) {
          const along = rippleDir > 0 ? col * sw : rippleSpan - col * sw;
          const d = (along - crest) / (sw * 2.2);
          y -= sh * 0.22 * Math.exp(-d * d);
        }
        const k = Math.abs(Math.cos(a));
        const lift = Math.sin(Math.min(Math.PI, a)) * sh * 0.08;
        const hgt = Math.max(0.6, ch * k);
        const cy = y - lift + (ch - hgt) / 2;
        if (fade < 1) {
          ctx.fillStyle = colours[fadeFrom[i] ?? 0] ?? "gray";
          ctx.fillRect(x, cy, cw, hgt);
          ctx.globalAlpha = fade;
        }
        ctx.fillStyle = colours[face[i] ?? 0] ?? "gray";
        ctx.fillRect(x, cy, cw, hgt);
        ctx.globalAlpha = 1;
        if (k < 0.995) {
          // The turning card darkens as it goes edge-on.
          ctx.fillStyle = "rgb(0, 0, 0)";
          ctx.globalAlpha = (1 - k) * 0.42;
          ctx.fillRect(x, cy, cw, hgt);
          ctx.globalAlpha = 1;
        }
        // The card's lower edge in shadow, so a pale card keeps its shape.
        ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
        ctx.fillRect(x, cy + hgt - 1, cw, 1);
        // Hands at the card's edges.
        ctx.fillStyle = SKINS[who[i * 3 + 1] ?? 0] ?? "tan";
        ctx.fillRect(x - hand * 0.4, y - lift + ch * 0.3, hand, hand * 1.4);
        ctx.fillRect(
          x + cw - hand * 0.6,
          y - lift + ch * 0.3,
          hand,
          hand * 1.4,
        );
      }
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const moving = () => flipping > 0 || fade < 1 || rippleAt >= 0;

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible || document.hidden || !c) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    clock += dt;
    stepFlips(dt);
    if (fade < 1) fade = Math.min(1, fade + dt / 0.15);
    if (rippleAt >= 0 && (clock - rippleAt) * 0.9 > 1.4) rippleAt = -1;
    draw();
    if (moving()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const rows = clamp(Math.round(c.rows), 4, 12);
    const same =
      size.cols > 0 && size.rows === rows && colsFor(w, h, rows) === size.cols;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (same) {
      // The same grid at a new size: the routine carries on mid-wave.
      size.sw = w / size.cols;
      size.sh = h / size.rows;
      paintStand();
    } else rebuild();
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
        readColours();
        resize();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      if (
        was.frames !== next.frames ||
        was.rows !== next.rows ||
        was.seed !== next.seed
      ) {
        rebuild();
      } else if (was.index !== next.index) {
        goTo(next.index, next.dir);
      }
      if (was.dpr !== next.dpr) resize();
      if (was.motionSafe !== next.motionSafe && !next.motionSafe) {
        // Reduced motion: any wave in flight lands where it was going.
        rippleAt = -1;
        for (let i = 0; i < face.length; i += 1) {
          if ((startAt[i] ?? -1) >= 0) face[i] = target[i] ?? 0;
          startAt[i] = -1;
          angle[i] = 0;
        }
        flipping = 0;
      }
      draw();
      kick();
    },
    hover(x, y) {
      const c = cfg;
      if (!c || !grids.length || size.sw <= 0) return false;
      const col = Math.floor(x / size.sw);
      const row = Math.floor(y / size.sh);
      const pending = flipping > 0;
      const grid = pending ? target : grids[mod(shown + 1, grids.length)];
      if (!grid) return false;
      let any = false;
      const reach = 1.6;
      for (let rr = row - 2; rr <= row + 2; rr += 1) {
        for (let cc = col - 2; cc <= col + 2; cc += 1) {
          if (rr < 0 || cc < 0 || rr >= size.rows || cc >= size.cols) continue;
          if (Math.hypot(cc - col, (rr - row) * 1.1) > reach) continue;
          const i = rr * size.cols + cc;
          const want = grid[i] ?? 0;
          if (
            early[i] ||
            (pending && (startAt[i] ?? -1) >= 0 && clock >= (startAt[i] ?? 0))
          )
            continue;
          early[i] = 1;
          any = true;
          if (!c.motionSafe) {
            face[i] = want;
            continue;
          }
          // Jumping the gun: this one flips now.
          target[i] = want;
          startAt[i] = clock;
          angle[i] = 0;
          spin[i] = 0;
          flipping += 1;
        }
      }
      if (any) {
        draw();
        kick();
      }
      return any;
    },
    ripple() {
      const c = cfg;
      if (!c || !c.motionSafe || !c.ripple || rippleAt >= 0) return;
      rippleAt = clock;
      rippleDir = lcg(c.seed + Math.round(clock * 10))() < 0.5 ? 1 : -1;
      kick();
    },
    waveSeconds,
    resize,
    readColours() {
      readColours();
      draw();
    },
    setVisible(on) {
      visible = on;
      if (on) {
        draw();
        kick();
      }
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

/** The server's still: the first frame as runs of colour, a row of cards per tier. */
function stillRuns(
  frames: readonly CardStuntFrame[],
  index: number,
  rows: number,
) {
  const cols = colsFor(720, 208, rows);
  const list = frames.length ? frames : defaultCardStuntFrames;
  const frameAt = list[mod(index, list.length)] ?? defaultCardStuntFrames[0];
  if (!frameAt)
    return {
      cols,
      rows,
      runs: [] as { x: number; y: number; w: number; v: number }[],
    };
  const grid = rasterise(frameAt, cols, rows);
  const runs: { x: number; y: number; w: number; v: number }[] = [];
  for (let r = 0; r < rows; r += 1) {
    let start = 0;
    for (let c = 1; c <= cols; c += 1) {
      const a = grid[r * cols + start] ?? 0;
      const b = c < cols ? (grid[r * cols + c] ?? 0) : -1;
      if (b !== a) {
        runs.push({ x: start, y: r, w: c - start, v: a });
        start = c;
      }
    }
  }
  return { cols, rows, runs };
}

/**
 * A grandstand of tiny seated figures, each holding a card at the chest, and
 * together a mosaic. The stand steps through `frames` — pictures and words —
 * and moves between them as a wave of flips: every card turns half over
 * about its horizontal axis as the front reaches its holder, darkening as it
 * goes edge-on (you glimpse the face behind it) and landing on the snap
 * spring showing its other side. Between frames a stadium ripple sometimes
 * rolls across, the cards lifting as the crest passes.
 *
 * Point at a section and it jumps the gun, flipping to the next frame early;
 * the wave passes those seats by when it comes. A click steps to the next
 * frame. The stand is focusable: Right and Left step the routine (back runs
 * the wave the other way), Home and End jump, Space pauses auto-play. Under
 * reduced motion the mosaic cross-fades between frames in 150 ms.
 */
export function CardStunt({
  frames = defaultCardStuntFrames,
  rows = 8,
  wave = 1,
  palette = "home",
  colors,
  interval = 3200,
  index,
  defaultIndex = 0,
  onIndexChange,
  autoPlay = true,
  ripple = true,
  earlyFlip = true,
  interactive = true,
  sound = false,
  paused = false,
  onPausedChange,
  seed = 4,
  label = "Card stunt",
  dpr = 2,
  className,
}: CardStuntProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const timers = React.useRef<number[]>([]);
  const lastSwish = React.useRef(0);
  const list = frames.length ? frames : defaultCardStuntFrames;
  const count = list.length;

  const [own, setOwn] = React.useState(() =>
    mod(Math.round(defaultIndex), Math.max(1, count)),
  );
  const idx = mod(Math.round(index ?? own), Math.max(1, count));
  const [dir, setDir] = React.useState<1 | -1>(1);
  const [held, setHeld] = React.useState(false);
  const [inView, setInView] = React.useState(false);
  const [shownPage, setShownPage] = React.useState(true);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const report = React.useRef({ onIndexChange, onPausedChange });
  React.useEffect(() => {
    report.current = { onIndexChange, onPausedChange };
  });

  const tones =
    colors && colors.length >= 4
      ? colors.slice(0, 4)
      : (PALETTES[palette] ?? PALETTES.home);

  const config: Config = {
    frames: list,
    rows,
    wave,
    colorKey: tones.join("|"),
    ripple,
    index: idx,
    dir,
    motionSafe,
    seed,
    dpr,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers);
    engine.current = e;
    e.configure(latest.current);
    const onVisibility = () => {
      setShownPage(!document.hidden);
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = timers.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
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
      const on = Boolean(entries[entries.length - 1]?.isIntersecting);
      setInView(on);
      engine.current?.setVisible(on);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  /** Swishes timed to the wave's front, panned with it — only for a visitor's step. */
  const swishes = (step: 1 | -1, kind: CardStuntWave) => {
    if (!sound) return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    const span = engine.current?.waveSeconds() ?? 0.9;
    for (let k = 0; k < 5; k += 1) {
      const along = k / 4;
      const pan =
        kind === "sweep" || kind === "diagonal"
          ? r2((step > 0 ? along * 2 - 1 : 1 - along * 2) * 0.6)
          : 0;
      timers.current.push(
        window.setTimeout(
          () =>
            audio.play("swish", { pitch: 0.85 + along * 0.3, gain: 0.32, pan }),
          Math.round((0.04 + along * span) * 1000),
        ),
      );
    }
  };

  const go = (step: 1 | -1, absolute?: number, visitor = false) => {
    if (count < 2) return;
    const next =
      absolute !== undefined ? mod(absolute, count) : mod(idx + step, count);
    if (next === idx) return;
    setDir(step);
    if (index === undefined) setOwn(next);
    report.current.onIndexChange?.(next);
    if (visitor) {
      const f = list[next];
      setSaid((s) => ({
        n: s.n + 1,
        text: `Frame ${next + 1} of ${count}${f?.label ? `: ${f.label}` : ""}.`,
      }));
      swishes(step, f?.wave ?? "sweep");
    }
  };

  const running =
    autoPlay && count > 1 && inView && shownPage && !paused && !held;
  const goNext = React.useRef(go);
  React.useEffect(() => {
    goNext.current = go;
  });

  // The routine's clock: the next frame after `interval`, and a ripple
  // halfway through the hold of every other frame.
  React.useEffect(() => {
    if (!running) return;
    const hold = clamp(interval, 1200, 60000);
    const t = window.setTimeout(() => goNext.current(1), hold);
    const wavePart = 0.9 / clamp(wave, 0.25, 3) + 0.35;
    const rippleTimer =
      ripple && idx % 2 === 1
        ? window.setTimeout(
            () => engine.current?.ripple(),
            Math.round((wavePart * 1000 + hold) / 2),
          )
        : 0;
    return () => {
      window.clearTimeout(t);
      if (rippleTimer) window.clearTimeout(rippleTimer);
    };
  }, [running, idx, interval, wave, ripple]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || event.target !== event.currentTarget) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        go(1, undefined, true);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        go(-1, undefined, true);
        break;
      case "Home":
        event.preventDefault();
        go(-1, 0, true);
        break;
      case "End":
        event.preventDefault();
        go(1, count - 1, true);
        break;
      case " ": {
        event.preventDefault();
        const next = !held;
        setHeld(next);
        setSaid((s) => ({ n: s.n + 1, text: next ? "Paused." : "Playing." }));
        report.current.onPausedChange?.(next);
        break;
      }
      default:
        break;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !earlyFlip || event.pointerType !== "mouse") return;
    const r = event.currentTarget.getBoundingClientRect();
    const flipped = engine.current?.hover(
      event.clientX - r.left,
      event.clientY - r.top,
    );
    if (!flipped || !sound) return;
    // Hover is no activation: an early flip only swishes once the visitor has clicked or typed.
    const active = (
      navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }
    ).userActivation?.hasBeenActive;
    const now = performance.now();
    if (active && now - lastSwish.current > 140) {
      lastSwish.current = now;
      audio.play("swish", {
        pitch: 1.25,
        gain: 0.16,
        pan: r2(((event.clientX - r.left) / Math.max(1, r.width) - 0.5) * 1.2),
      });
    }
  };

  // A small raster (one frame at the nominal grid), cheap enough to redo each render.
  const still = stillRuns(list, idx, clamp(Math.round(rows), 4, 12));

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="card stunt"
      aria-label={label}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (interactive && event.detail > 0) go(1, undefined, true);
      }}
      onPointerMove={onPointerMove}
      className={cn(
        "group/card-stunt relative isolate h-52 w-full overflow-clip rounded-3 bg-secondary",
        interactive ? "cursor-pointer" : "cursor-default",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      {interactive ? (
        <span id={hintId} className="sr-only">
          Right and Left step the routine, Home and End jump, Space pauses it.
          Point at a section to make it flip early.
        </span>
      ) : null}
      <svg
        aria-hidden
        viewBox={`0 0 ${still.cols} ${still.rows}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/card-stunt:opacity-0"
      >
        {still.runs.map((run, i) => (
          <rect
            key={i}
            x={run.x}
            y={r2(run.y + 0.36)}
            width={run.w}
            height={0.6}
            style={{ fill: tones[run.v] ?? tones[0] }}
          />
        ))}
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/card-stunt:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[...tones, "var(--secondary)", "var(--foreground)"].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
