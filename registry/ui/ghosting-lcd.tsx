"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type GhostingLcdTint = "olive" | "grey" | "teal" | "sepia";

export type GhostingLcdProps = {
  /** How long a pixel takes to clear once released, ms (80 to 2000): the slower it is, the longer the ghosts. @default 600 */
  response?: number;
  /** Pixel pitch in px (3 to 12). @default 6 */
  pixel?: number;
  /** The panel's tint: the classic olive pocket screen, a calculator grey, a pager teal or a warm sepia. @default "olive" */
  tint?: GhostingLcdTint;
  /** Overrides of the tint, as CSS colours: the panel and the lit pixels. */
  colors?: { panel?: string; ink?: string };
  /** Share of the pitch left as a gap between pixels (0 to 0.4). @default 0.16 */
  gap?: number;
  /** How far, px, each lit pixel's shadow sits below and right of it on the reflector; 0 hides the shadows. @default 1.5 */
  depth?: number;
  /** Radius of the drawing brush, in pixels (0.6 to 4). @default 1.4 */
  brush?: number;
  /** Ordered (Bayer) dither at the stroke's soft edges; off, the edge is a hard threshold. @default true */
  dither?: boolean;
  /** How far a press spreads through the crystal, 0 to 1; 0 turns the press bloom off. @default 0.6 */
  bloom?: number;
  /** A line of pixel text the device shows in its top-left corner (A–Z, 0–9, - . : / ! ? ' +). @default "" */
  text?: string;
  /** The pointer, touch and keys draw. @default true */
  interactive?: boolean;
  /** Freezes the screen's response. @default false */
  paused?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The screen was wiped (Delete or Backspace). */
  onClear?: () => void;
  /** The screen's accessible name. @default "Drawing screen" */
  label?: string;
  /** Nothing draws; the screen keeps what it shows and says it is disabled. @default false */
  disabled?: boolean;
  /** Sizes and shapes the screen. @default "h-52 w-full" */
  className?: string;
};

/**
 * Tints are pigments at fixed lightness taken from the theme's hues, so the
 * glass reads the same on a light page and a dark one, as a real screen does.
 */
const TINTS: Record<GhostingLcdTint, { panel: string; ink: string }> = {
  olive: {
    panel: "oklch(from var(--success) 0.8 0.075 calc(h - 42))",
    ink: "oklch(from var(--success) 0.33 0.055 calc(h - 34))",
  },
  grey: {
    panel: "oklch(from var(--ink-3) 0.81 0.012 h)",
    ink: "oklch(from var(--ink-3) 0.3 0.018 h)",
  },
  teal: {
    panel: "oklch(from var(--accent) 0.8 0.045 calc(h - 72))",
    ink: "oklch(from var(--accent) 0.3 0.06 calc(h - 58))",
  },
  sepia: {
    panel: "oklch(from var(--warn) 0.83 0.055 calc(h - 6))",
    ink: "oklch(from var(--warn) 0.32 0.05 calc(h - 28))",
  },
};

/** A 3×5 pixel face, row by row from the top, left pixel first. */
const FONT: Record<string, string> = {
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
  "6": "011100111101111",
  "7": "111001010010010",
  "8": "111101111101111",
  "9": "111101111001110",
  "-": "000000111000000",
  ".": "000000000000010",
  ":": "000010000010000",
  "/": "001001010100100",
  "!": "010010010000010",
  "?": "110001010000010",
  "'": "010010000000000",
  "+": "000010111010000",
  " ": "000000000000000",
};

/** The 4×4 Bayer matrix, as thresholds in (0, 1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (v) => (v + 0.5) / 16,
);

/** Alpha levels a frame batches its pixels into: one fill per level. */
const LEVELS = 16;
/** How fast the brush's drive drains from a pixel, s: the signal, not the crystal. */
const DRIVE_TAU = 0.07;
const SUB = 1 / 240;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Config = {
  response: number;
  pixel: number;
  gap: number;
  depth: number;
  brush: number;
  dither: boolean;
  bloom: number;
  text: string;
  paused: boolean;
  dpr: number;
  colorKey: string;
  motionSafe: boolean;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  stroke: (x: number, y: number, fresh: boolean) => void;
  lift: () => void;
  press: (x: number, y: number) => void;
  pen: (dx: number, dy: number) => void;
  pressPen: () => void;
  focus: (on: boolean) => void;
  wipe: () => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  visible: React.RefObject<boolean>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let frame = 0;
  let blinkTimer = 0;
  let last = 0;
  let disposed = false;
  let panel = "white";
  let ink = "black";
  const still = document.createElement("canvas");
  // The grid.
  let cols = 0;
  let rows = 0;
  let pitch = 6;
  let x0 = 0;
  let y0 = 0;
  let drive = new Float32Array(0);
  let analog = new Float32Array(0);
  let dark = new Float32Array(0);
  let threshold = new Float32Array(0);
  let inList = new Uint8Array(0);
  let active = new Int32Array(0);
  let activeCount = 0;
  let changing = false;
  // Per-frame batches by alpha level, reused.
  let batch = new Int32Array(0);
  const batchCount = new Int32Array(LEVELS + 1);
  const batchStart = new Int32Array(LEVELS + 1);
  const batchFill = new Int32Array(LEVELS + 1);
  // The pointer's last sample.
  let lastX = -1;
  let lastY = -1;
  // The press bloom: a centre, a radius on a spring and a fading strength.
  const bloom = { x: 0, y: 0, r: 0, v: 0, target: 0, age: 0, live: false };
  // The wipe: a scan bar from the top.
  const wipe = { y: 0, live: false, age: 0 };
  // The keyboard pen, in cells.
  let penX = 2;
  let penY = 8;
  let focused = false;
  let penOn = true;

  const readColours = () => {
    panel = carriers[0] ? getComputedStyle(carriers[0]).color || panel : panel;
    ink = carriers[1] ? getComputedStyle(carriers[1]).color || ink : ink;
    buildStill();
  };

  const cellRect = (i: number, out: { x: number; y: number }) => {
    out.x = x0 + (i % cols) * pitch;
    out.y = y0 + Math.floor(i / cols) * pitch;
  };

  const textCells = () => {
    const c = cfg;
    const out: number[] = [];
    if (!c || !c.text || cols < 6 || rows < 8) return out;
    // Whole words only: a word that will not fit is left off rather than
    // cut, the way a device trims its own readout.
    const room = Math.floor((cols - 1) / 4);
    let shown = "";
    for (const word of c.text.toUpperCase().split(/\s+/).filter(Boolean)) {
      const next = shown ? `${shown} ${word}` : word;
      if (Array.from(next).length > room) break;
      shown = next;
    }
    let cx = 1;
    for (const ch of Array.from(shown)) {
      const glyph = FONT[ch] ?? FONT["?"] ?? "";
      for (let k = 0; k < 15; k += 1) {
        if (glyph[k] !== "1") continue;
        const gx = cx + (k % 3);
        const gy = 1 + Math.floor(k / 3);
        out.push(gy * cols + gx);
      }
      cx += 4;
    }
    return out;
  };

  /** The glass: panel, sheen, the faint unlit cells, the device's text, the recess. */
  const buildStill = () => {
    const c = cfg;
    if (!c || !ctx || w < 1 || h < 1) return;
    still.width = Math.max(1, Math.round(w * dpr));
    still.height = Math.max(1, Math.round(h * dpr));
    const g = still.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = panel;
    g.fillRect(0, 0, w, h);
    // The reflective polariser: a soft diagonal sheen, light from top left.
    const sheen = g.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0, "rgba(255,255,255,0.16)");
    sheen.addColorStop(0.42, "rgba(255,255,255,0)");
    sheen.addColorStop(1, "rgba(0,0,0,0.07)");
    g.fillStyle = sheen;
    g.fillRect(0, 0, w, h);
    const size = pitch * (1 - clamp(c.gap, 0, 0.4));
    // Unlit cells: real panels show their grid faintly even when blank.
    g.fillStyle = ink;
    g.globalAlpha = 0.05;
    g.beginPath();
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        g.rect(x0 + i * pitch, y0 + j * pitch, size, size);
      }
    }
    g.fill();
    // The device's own text, lit for good, with its shadows.
    const cells = textCells();
    const at = { x: 0, y: 0 };
    const depth = clamp(c.depth, 0, 6);
    if (depth > 0) {
      g.globalAlpha = 0.2;
      g.beginPath();
      for (const i of cells) {
        cellRect(i, at);
        g.rect(at.x + depth, at.y + depth, size, size);
      }
      g.fill();
    }
    g.globalAlpha = 0.92;
    g.beginPath();
    for (const i of cells) {
      cellRect(i, at);
      g.rect(at.x, at.y, size, size);
    }
    g.fill();
    // The recess: the bezel's shadow falls on the top and left of the glass.
    g.globalAlpha = 1;
    const top = g.createLinearGradient(0, 0, 0, 10);
    top.addColorStop(0, "rgba(0,0,0,0.2)");
    top.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = top;
    g.fillRect(0, 0, w, 10);
    const left = g.createLinearGradient(0, 0, 8, 0);
    left.addColorStop(0, "rgba(0,0,0,0.14)");
    left.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = left;
    g.fillRect(0, 0, 8, h);
  };

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 1 || nh < 1) return;
    w = nw;
    h = nh;
    dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    pitch = clamp(Math.round(c.pixel), 3, 12);
    const margin = Math.max(6, pitch);
    cols = Math.max(4, Math.floor((w - margin * 2) / pitch));
    rows = Math.max(4, Math.floor((h - margin * 2) / pitch));
    x0 = Math.round((w - cols * pitch) / 2);
    y0 = Math.round((h - rows * pitch) / 2);
    const n = cols * rows;
    drive = new Float32Array(n);
    analog = new Float32Array(n);
    dark = new Float32Array(n);
    threshold = new Float32Array(n);
    inList = new Uint8Array(n);
    active = new Int32Array(n);
    batch = new Int32Array(n);
    activeCount = 0;
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        threshold[j * cols + i] = BAYER[(j % 4) * 4 + (i % 4)] ?? 0.5;
      }
    }
    penX = Math.min(cols - 3, Math.max(1, Math.round(cols * 0.18)));
    penY = Math.min(rows - 3, Math.max(1, Math.round(rows * 0.6)));
    buildStill();
  };

  const touch = (i: number) => {
    if (inList[i]) return;
    inList[i] = 1;
    active[activeCount] = i;
    activeCount += 1;
  };

  /** One stamp of the soft brush at a point in px. */
  const stamp = (x: number, y: number, strength: number) => {
    const c = cfg;
    if (!c || cols < 1) return;
    const radius = clamp(c.brush, 0.6, 4) * pitch;
    const ci = (x - x0) / pitch - 0.5;
    const cj = (y - y0) / pitch - 0.5;
    const reach = Math.ceil(radius / pitch) + 1;
    const i0 = Math.max(0, Math.floor(ci - reach));
    const i1 = Math.min(cols - 1, Math.ceil(ci + reach));
    const j0 = Math.max(0, Math.floor(cj - reach));
    const j1 = Math.min(rows - 1, Math.ceil(cj + reach));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const d = (Math.hypot(i - ci, j - cj) * pitch) / radius;
        if (d >= 1) continue;
        // A soft core: full drive in the middle, falling off toward the
        // edge where the dither thins it out.
        const v = strength * 1.12 * Math.pow(1 - d * d, 0.75);
        const k = j * cols + i;
        if (v > (drive[k] ?? 0)) drive[k] = v;
        touch(k);
      }
    }
  };

  /** Lays stamps along a segment, half a pixel apart. */
  const segment = (ax: number, ay: number, bx: number, by: number) => {
    const length = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(length / (pitch * 0.5)));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      stamp(ax + (bx - ax) * t, ay + (by - ay) * t, 1);
    }
  };

  /** One step of the crystal: drive drains, pixels chase their state. */
  const integrate = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const tauOff = clamp(c.response, 80, 2000) / 1000 / 3;
    // The crystal twists on faster than it relaxes.
    const tauOn = tauOff * 0.25;
    const kOn = 1 - Math.exp(-dt / tauOn);
    const kOff = 1 - Math.exp(-dt / tauOff);
    const drain = Math.exp(-dt / DRIVE_TAU);
    const analogDrain = Math.exp(-dt / 0.05);
    // The press bloom adds its analog drive first.
    if (bloom.live) {
      bloom.age += dt;
      if (c.motionSafe) {
        // Recoil: the glass flexes out past the press's reach and back, twice.
        const k = springs.recoil;
        let left = dt;
        while (left > 0) {
          const step = Math.min(SUB, left);
          left -= step;
          bloom.v +=
            ((-k.stiffness * (bloom.r - bloom.target) - k.damping * bloom.v) /
              k.mass) *
            step;
          bloom.r += bloom.v * step;
        }
      } else {
        bloom.r = bloom.target;
      }
      const strength = Math.exp(-bloom.age / 0.42);
      if (strength < 0.03) bloom.live = false;
      else {
        const radius = Math.max(0, bloom.r);
        const ci = (bloom.x - x0) / pitch - 0.5;
        const cj = (bloom.y - y0) / pitch - 0.5;
        const reach = radius / pitch + 2;
        const i0 = Math.max(0, Math.floor(ci - reach));
        const i1 = Math.min(cols - 1, Math.ceil(ci + reach));
        const j0 = Math.max(0, Math.floor(cj - reach));
        const j1 = Math.min(rows - 1, Math.ceil(cj + reach));
        for (let j = j0; j <= j1; j += 1) {
          for (let i = i0; i <= i1; i += 1) {
            const u =
              (Math.hypot(i - ci, j - cj) * pitch) / Math.max(1, radius);
            // Darker at the rim than at the centre — the pressure ring.
            const p =
              u < 1
                ? 0.55 + 0.45 * u * u
                : Math.exp(-Math.pow((u - 1) / 0.18, 2));
            const v = strength * p;
            if (v < 0.02) continue;
            const k = j * cols + i;
            if (v > (analog[k] ?? 0)) analog[k] = v;
            touch(k);
          }
        }
      }
    }
    // The wipe: a dark scan bar; everything behind it lets go.
    if (wipe.live) {
      wipe.age += dt;
      const p = clamp(wipe.age / 0.42, 0, 1);
      const eased = p * p * (3 - 2 * p);
      const barRow = Math.round(eased * (rows + 2)) - 1;
      for (let a = 0; a < activeCount; a += 1) {
        const k = active[a] ?? 0;
        if (Math.floor(k / cols) < barRow) {
          drive[k] = 0;
          analog[k] = 0;
        }
      }
      if (barRow >= 0 && barRow < rows) {
        for (let i = 0; i < cols; i += 1) {
          const k = barRow * cols + i;
          analog[k] = 0.55;
          touch(k);
        }
      }
      if (p >= 1) wipe.live = false;
    }
    // The keyboard pen blinks through the crystal too, so it ghosts.
    if (focused && penOn) {
      for (let dj = 0; dj < 2; dj += 1) {
        for (let di = 0; di < 2; di += 1) {
          const i = penX + di;
          const j = penY + dj;
          if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
          const k = j * cols + i;
          analog[k] = Math.max(analog[k] ?? 0, 0.95);
          touch(k);
        }
      }
    }
    const dither = c.dither;
    let write = 0;
    changing = false;
    for (let a = 0; a < activeCount; a += 1) {
      const k = active[a] ?? 0;
      const e = drive[k] ?? 0;
      const an = analog[k] ?? 0;
      const on = dither ? e > (threshold[k] ?? 0.5) : e > 0.5;
      const target = Math.max(on ? 1 : 0, an);
      const d = dark[k] ?? 0;
      const next = d + (target - d) * (target > d ? kOn : kOff);
      dark[k] = next;
      if (Math.abs(next - d) > 0.0015 || e > 0.01) changing = true;
      drive[k] = e * drain;
      analog[k] = an * analogDrain;
      if (next < 0.004 && e * drain < 0.01 && an * analogDrain < 0.01) {
        dark[k] = 0;
        drive[k] = 0;
        analog[k] = 0;
        inList[k] = 0;
      } else {
        active[write] = k;
        write += 1;
      }
    }
    activeCount = write;
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || w < 1) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(still, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (activeCount === 0) {
      if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
      return;
    }
    // Bucket the lit pixels by how dark they are (a counting sort into one
    // reused array): one fill per level.
    batchCount.fill(0);
    for (let a = 0; a < activeCount; a += 1) {
      const k = active[a] ?? 0;
      const level = Math.round(clamp(dark[k] ?? 0, 0, 1) * LEVELS);
      batchCount[level] = (batchCount[level] ?? 0) + 1;
    }
    let offset = 0;
    for (let level = 0; level <= LEVELS; level += 1) {
      const count = batchCount[level] ?? 0;
      batchStart[level] = offset;
      batchFill[level] = offset;
      offset += count;
    }
    for (let a = 0; a < activeCount; a += 1) {
      const k = active[a] ?? 0;
      const level = Math.round(clamp(dark[k] ?? 0, 0, 1) * LEVELS);
      const at = batchFill[level] ?? 0;
      batch[at] = k;
      batchFill[level] = at + 1;
    }
    const size = pitch * (1 - clamp(c.gap, 0, 0.4));
    const depth = clamp(c.depth, 0, 6);
    ctx.fillStyle = ink;
    for (let pass = depth > 0 ? 0 : 1; pass < 2; pass += 1) {
      const off = pass === 0 ? depth : 0;
      for (let level = 1; level <= LEVELS; level += 1) {
        const count = batchCount[level] ?? 0;
        if (count === 0) continue;
        const alpha = (level / LEVELS) * (pass === 0 ? 0.2 : 0.92);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        const from = batchStart[level] ?? 0;
        for (let b = from; b < from + count; b += 1) {
          const k = batch[b] ?? 0;
          ctx.rect(
            x0 + (k % cols) * pitch + off,
            y0 + Math.floor(k / cols) * pitch + off,
            size,
            size,
          );
        }
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!c.paused) integrate(dt);
    draw();
    // A steady pen keeps its pixels driven but nothing changes: the loop
    // stops, and the next blink or stroke starts it again.
    const busy = !c.paused && (changing || bloom.live || wipe.live);
    if (busy) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || w < 1)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const press = (x: number, y: number) => {
    const c = cfg;
    if (!c || c.paused || c.bloom <= 0) return;
    bloom.x = x;
    bloom.y = y;
    bloom.target = clamp(c.bloom, 0, 1) * 0.3 * Math.min(w, h) + pitch;
    bloom.r = c.motionSafe ? pitch : bloom.target;
    bloom.v = 0;
    bloom.age = 0;
    bloom.live = true;
    kick();
  };

  const blink = () => {
    if (blinkTimer) window.clearTimeout(blinkTimer);
    blinkTimer = 0;
    if (!focused || !cfg) return;
    // Reduced motion: a steady pen. Otherwise it blinks, and ghosts as it
    // does, like any other pixel on the glass.
    if (!cfg.motionSafe) {
      penOn = true;
      kick();
      return;
    }
    penOn = !penOn;
    kick();
    blinkTimer = window.setTimeout(blink, 530);
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
        layout();
        draw();
        return;
      }
      if (was.pixel !== next.pixel || was.dpr !== next.dpr) layout();
      else if (
        was.colorKey !== next.colorKey ||
        was.gap !== next.gap ||
        was.depth !== next.depth ||
        was.text !== next.text
      ) {
        readColours();
      }
      if (was.motionSafe !== next.motionSafe) blink();
      draw();
      kick();
    },
    resize() {
      const c = cfg;
      if (!c) return;
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        clamp(c.dpr, 0.5, 2),
      );
      if (w === root.clientWidth && h === root.clientHeight && dpr === ratio)
        return;
      layout();
      draw();
    },
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    stroke(x, y, fresh) {
      if (!cfg || cfg.paused) return;
      if (fresh || lastX < 0) stamp(x, y, 1);
      else segment(lastX, lastY, x, y);
      lastX = x;
      lastY = y;
      kick();
    },
    lift() {
      lastX = -1;
      lastY = -1;
    },
    press,
    pen(dx, dy) {
      const c = cfg;
      if (!c || c.paused || cols < 1) return;
      const fromX = x0 + (penX + 1) * pitch;
      const fromY = y0 + (penY + 1) * pitch;
      penX = clamp(penX + dx, 0, cols - 2);
      penY = clamp(penY + dy, 0, rows - 2);
      segment(fromX, fromY, x0 + (penX + 1) * pitch, y0 + (penY + 1) * pitch);
      // Keys after a mouse focus: the pen shows from the first key on.
      focused = true;
      penOn = true;
      blink();
      kick();
    },
    pressPen() {
      press(x0 + (penX + 1) * pitch, y0 + (penY + 1) * pitch);
    },
    focus(on) {
      focused = on;
      penOn = true;
      blink();
      kick();
    },
    wipe() {
      const c = cfg;
      if (!c || c.paused) return;
      if (!c.motionSafe) {
        // A fade, not a sweep: everything lets go at once.
        for (let a = 0; a < activeCount; a += 1) {
          const k = active[a] ?? 0;
          drive[k] = 0;
          analog[k] = 0;
        }
      } else {
        wipe.live = true;
        wipe.age = 0;
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (blinkTimer) window.clearTimeout(blinkTimer);
      blinkTimer = 0;
    },
  };
}

/**
 * A reflective monochrome LCD with visible pixel gaps. The pointer draws on
 * it with a soft brush whose edges are dithered through a 4×4 Bayer matrix,
 * and every pixel answers on the slow, smeary response of an old pocket
 * screen: it darkens on a quarter of `response` and clears on all of it, so
 * the ghost behind a quick stroke is longer than behind a slow one, and a very
 * quick stroke never fully darkens. Each lit pixel casts a faint shadow
 * `depth` px down and right onto the reflector behind it.
 *
 * Pressing squeezes the crystal: a dark bloom spreads under the press, its
 * radius on springs.recoil (two visible bounces as the glass flexes) while it
 * fades. Delete or Backspace wipes the screen with a scan bar. The screen is a
 * focusable group: arrow keys draw with a blinking pen (Shift draws four
 * pixels at a time — a quicker stroke, a longer ghost), Enter and Space press.
 * Under reduced motion the bloom and the wipe fade instead of travelling; the
 * pixels still ghost, because what you drew is the feedback.
 */
export function GhostingLcd({
  response = 600,
  pixel = 6,
  tint = "olive",
  colors,
  gap = 0.16,
  depth = 1.5,
  brush = 1.4,
  dither = true,
  bloom = 0.6,
  text = "",
  interactive = true,
  paused = false,
  dpr = 2,
  onClear,
  label = "Drawing screen",
  disabled = false,
  className,
}: GhostingLcdProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [said, setSaid] = React.useState("");
  const base = TINTS[tint] ?? TINTS.olive;
  const panel = colors?.panel ?? base.panel;
  const ink = colors?.ink ?? base.ink;
  const colorKey = `${panel}|${ink}`;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const pressed = React.useRef(false);

  const config: Config = {
    response,
    pixel,
    gap,
    depth,
    brush,
    dither,
    bloom,
    text,
    paused,
    dpr,
    colorKey,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carrierRefs.current.filter((c): c is HTMLSpanElement =>
      Boolean(c),
    );
    if (!root || !canvas || carriers.length < 2) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    if (root.matches(":focus-visible")) e.focus(true);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
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
      visible.current = false;
    };
  }, []);

  const inert = disabled || !interactive;

  const local = (event: { clientX: number; clientY: number }) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r
      ? { x: event.clientX - r.left, y: event.clientY - r.top }
      : { x: 0, y: 0 };
  };

  // A pressed drag (a finger, or a held button) draws through the shared
  // drag; a hovering mouse or pen draws through plain moves below.
  const drag = useDrag({
    threshold: 1,
    disabled: inert,
    onMove: ({ point }) => {
      const p = local({ clientX: point.x, clientY: point.y });
      engine.current?.stroke(p.x, p.y, false);
    },
    onEnd: () => {
      pressed.current = false;
      engine.current?.lift();
    },
    onCancel: () => {
      pressed.current = false;
      engine.current?.lift();
    },
    onTap: () => {
      pressed.current = false;
      engine.current?.lift();
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (inert) return;
    const e = engine.current;
    if (!e) return;
    const stride = event.shiftKey ? 4 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-stride, 0],
      ArrowRight: [stride, 0],
      ArrowUp: [0, -stride],
      ArrowDown: [0, stride],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      e.pen(move[0], move[1]);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      e.pressPen();
      setSaid((s) => (s === "Pressed" ? "Pressed again" : "Pressed"));
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (event.repeat) return;
      e.wipe();
      setSaid((s) => (s === "Screen wiped" ? "Wiped again" : "Screen wiped"));
      onClear?.();
    }
  };

  return (
    <div
      ref={bindRoot}
      role="group"
      tabIndex={disabled ? -1 : 0}
      aria-roledescription="drawing screen"
      aria-label={label}
      aria-describedby={hintId}
      aria-disabled={inert || undefined}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target === event.currentTarget)
          engine.current?.focus(event.currentTarget.matches(":focus-visible"));
      }}
      onBlur={() => engine.current?.focus(false)}
      {...drag}
      onPointerDown={(event) => {
        drag.onPointerDown(event);
        if (inert) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        pressed.current = true;
        const p = local(event);
        engine.current?.press(p.x, p.y);
        engine.current?.stroke(p.x, p.y, true);
      }}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (inert || pressed.current) return;
        // A hovering finger does not exist; touch draws only while down.
        if (event.pointerType === "touch") return;
        const p = local(event);
        engine.current?.stroke(p.x, p.y, false);
      }}
      onPointerLeave={() => {
        if (!pressed.current) engine.current?.lift();
      }}
      className={cn(
        "group/ghosting-lcd relative isolate block h-52 w-full touch-none overflow-clip rounded-3 [contain:paint] outline-none select-none",
        inert ? "cursor-default" : "cursor-crosshair",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{ backgroundColor: panel }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 block group-data-live/ghosting-lcd:hidden"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0) 42%, rgba(0,0,0,0.07))",
          boxShadow: "inset 6px 8px 10px -6px rgba(0,0,0,0.28)",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      {[panel, ink].map((color, i) => (
        <span
          key={i}
          ref={(node) => {
            carrierRefs.current[i] = node;
          }}
          aria-hidden
          onTransitionEnd={() => engine.current?.readColours()}
          className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
          style={{ color }}
        />
      ))}
      <span id={hintId} className="sr-only">
        Arrow keys draw, Shift draws faster, Enter presses, Delete wipes.
      </span>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
