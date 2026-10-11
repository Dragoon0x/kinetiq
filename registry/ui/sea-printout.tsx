"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SeaPrintoutColors = { paper?: string; ink?: string; bar?: string };

export type SeaPrintoutProps = {
  /** Height of the swell, 0 (glassy) to 1 (a heavy roll). @default 0.6 */
  swell?: number;
  /** Lines printed per second (1 to 12). @default 4 */
  feed?: number;
  /** Ribbon density, 0 (pale and sparse) to 1 (heavy, with more overstrikes). @default 0.6 */
  ink?: number;
  /** The wind, -1 (blowing from the west) to 1 (from the east), controlled. */
  wind?: number;
  /** The wind when uncontrolled. @default 0 */
  defaultWind?: number;
  /** Fires from the pointer or the key that changed the wind, in steps of 0.05. */
  onWindChange?: (wind: number) => void;
  /** How choppy the wind makes the sea, 0 to 1: short waves and whitecaps. @default 0.6 */
  chop?: number;
  /** Lines between the paper's fold creases (8 to 66). @default 24 */
  pageLines?: number;
  /** Faint green-bar banding every three lines. @default true */
  bars?: boolean;
  /** Overstruck pairs for the darkest tones. @default true */
  overstrike?: boolean;
  /** Glyph size in px (7 to 13). @default 9 */
  size?: number;
  /** Paper, ribbon and bar colours, any CSS colours. Pigments by default, the same in both themes. */
  colors?: SeaPrintoutColors;
  /** The pointer and the keys set the wind. @default true */
  interactive?: boolean;
  /** The printer stops. @default false */
  paused?: boolean;
  /** The printer whirs while you work the wind. Off unless asked for. @default false */
  sound?: boolean;
  /** Seeds the sea and the hammers' small errors. @default 2 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The slider's accessible name. @default "Wind over the printed sea" */
  label?: string;
  /** The wind holds; the slider says it is disabled. The printer keeps printing. @default false */
  disabled?: boolean;
  /** Sizes and shapes the printer. @default "h-96 w-full" */
  className?: string;
};

const DEFAULT_PAPER =
  "color-mix(in oklab, oklch(from var(--warn) 0.965 0.022 h) 90%, var(--background))";
const DEFAULT_INK = "oklch(from var(--accent) 0.3 0.06 h)";
const DEFAULT_BAR = "oklch(from var(--success) 0.9 0.05 h)";

/** Light to dark; two characters are struck in the same cell. */
const RAMP = [" ", ".", "-", "~", "=", "+", "*", "#", "#=", "M#", "@#"];
const PLAIN_TOP = 7;
/** The newest line of the first page (the server prints lines 0 to START). */
const START = 47;
const HOUSING = 48;
const PAD_X = 10;
const MARGIN = 20;
const SUB = 1 / 240;
const TAU = Math.PI * 2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const step05 = (v: number) => Math.round(clamp(v, -1, 1) * 20) / 20;

/**
 * Sine from basic arithmetic only. The server prints the same sea the
 * browser does, character for character, and `Math.sin` is free to differ in
 * its last digits between the two; +, −, × and ÷ are not.
 */
function dsin(x: number) {
  let t = x % TAU;
  if (t < 0) t += TAU;
  if (t > Math.PI) t -= TAU;
  if (t > Math.PI / 2) t = Math.PI - t;
  else if (t < -Math.PI / 2) t = -Math.PI - t;
  const t2 = t * t;
  return t * (1 - (t2 / 6) * (1 - (t2 / 20) * (1 - (t2 / 42) * (1 - t2 / 72))));
}
const dcos = (x: number) => dsin(x + Math.PI / 2);

function hash(a: number, b: number, seed: number) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Sea = {
  swell: number;
  wind: number;
  chop: number;
  ink: number;
  overstrike: boolean;
  seed: number;
};

/** Long swells and a short chop: [wavelength, heading°, amplitude, wind lean°]. */
const SWELLS: [number, number, number, number][] = [
  [150, 82, 1, 28],
  [96, 58, 0.6, 24],
  [230, 116, 0.45, 12],
];
const CHOP: [number, number, number][] = [
  [26, 60, 1],
  [34, 122, 0.8],
  [20, 96, 0.7],
  [41, 38, 0.6],
];

function phases(seed: number) {
  const out: number[] = [];
  for (let i = 0; i < SWELLS.length + CHOP.length; i += 1) {
    out.push(hash(i + 1, 7, seed) * TAU);
  }
  return out;
}

/** The sea's height at a column and a printed line (sea-time moves with the line). */
function height(col: number, line: number, sea: Sea, phase: number[]) {
  const x = col * 6.2;
  const y = line * 10.5;
  const t = line * 0.12;
  let h = 0;
  for (let i = 0; i < SWELLS.length; i += 1) {
    const s = SWELLS[i];
    if (!s) continue;
    const [lambda, heading, amp, lean] = s;
    const a = ((heading + lean * sea.wind) * Math.PI) / 180;
    const k = TAU / lambda;
    const omega = 2.2 / Math.sqrt(lambda / 100);
    const p = k * (x * dcos(a) + y * dsin(a)) - omega * t + (phase[i] ?? 0);
    // A Stokes crest: sharper on top, flatter in the trough.
    h += amp * sea.swell * (dcos(p) + 0.26 * dcos(2 * p));
  }
  const chop = 0.05 + 0.6 * Math.abs(sea.wind) * sea.chop;
  for (let i = 0; i < CHOP.length; i += 1) {
    const s = CHOP[i];
    if (!s) continue;
    const [lambda, heading, amp] = s;
    const a = ((heading + 40 * sea.wind) * Math.PI) / 180;
    const k = TAU / lambda;
    const p =
      k * (x * dcos(a) + y * dsin(a)) - 4 * t + (phase[SWELLS.length + i] ?? 0);
    h += amp * chop * 0.45 * dcos(p);
  }
  return h / 2.1;
}

/**
 * One printed line: for each column a primary character and, for the
 * darkest tones, one struck over it. Shade comes from the slope facing the
 * light at the top of the paper and from the height (crests are lighter).
 */
function printLine(line: number, cols: number, sea: Sea, phase: number[]) {
  const a: string[] = [];
  const b: string[] = [];
  const top = sea.overstrike && sea.ink >= 0.3 ? RAMP.length - 1 : PLAIN_TOP;
  // The ribbon bends the tone curve: a pale ribbon lifts the mids, a heavy
  // one sinks them. A quadratic bias, not a power, so the server's page and
  // the browser's match exactly.
  const bias = (clamp(sea.ink, 0, 1) - 0.5) * 0.8;
  const chop = Math.abs(sea.wind) * sea.chop;
  for (let c = 0; c < cols; c += 1) {
    const h = height(c, line, sea, phase);
    const before = height(c, line - 1, sea, phase);
    const dh = h - before;
    const grain = hash(c, line, sea.seed) - 0.5;
    // A crest — higher than the slices either side — is printed as the line
    // a hand would draw it with: a run of tildes riding the swell.
    if (
      sea.swell > 0.05 &&
      h > 0.02 &&
      h >= before &&
      h > height(c, line + 1, sea, phase)
    ) {
      const capped = chop > 0.22 && h > 0.36 && grain + 0.5 < chop * 0.8;
      a.push(capped ? "^" : "~");
      b.push(
        !capped && h > 0.42 && sea.overstrike && sea.ink >= 0.3 ? "-" : "",
      );
      continue;
    }
    let d = 0.4 - dh * 3.4 - h * 0.22 + grain * 0.08;
    d = Math.round(clamp(d, 0, 1) * 1000) / 1000;
    // Spray on the shoulders of the swell when the wind is up.
    if (chop > 0.3 && h > 0.3 && grain + 0.5 < (chop - 0.3) * 0.5) {
      a.push("'");
      b.push("");
      continue;
    }
    // Most of the sea is light: the tone curve is d^1.5 (from a square
    // root, which every engine rounds the same way).
    const lit = d * Math.sqrt(d);
    const shade = clamp(lit + bias * lit * (1 - lit), 0, 1);
    const idx = Math.min(top, Math.round(shade * top));
    const glyph = RAMP[idx] ?? " ";
    a.push(glyph.charAt(0));
    b.push(glyph.charAt(1));
  }
  return { a, b };
}

type Config = {
  swell: number;
  feed: number;
  ink: number;
  wind: number;
  chop: number;
  pageLines: number;
  bars: boolean;
  overstrike: boolean;
  size: number;
  paused: boolean;
  seed: number;
  dpr: number;
  colorKey: string;
  motionSafe: boolean;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  visible: React.RefObject<boolean>,
  onStrike: React.RefObject<() => void>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let frame = 0;
  let timer = 0;
  let reprintTimer = 0;
  let last = 0;
  let lastWind = 0;
  let disposed = false;
  let paper = "white";
  let ink = "black";
  let bar = "white";
  let family = "ui-monospace, monospace";
  let phase = phases(2);
  // Geometry.
  let lh = 11;
  let cw = 6;
  let cols = 1;
  let textX = 0;
  let stripW = 0;
  let printTop = 0;
  // The paper: line n sits at paper coordinate n; `pos` is how far it has fed.
  const pos = { v: 0, w: 0 };
  let latest = -1;
  // Each printed line is drawn once into a bitmap and kept in a ring.
  let slots: HTMLCanvasElement[] = [];
  let slotLine: Int32Array = new Int32Array(0);
  // The newest line arrives in a scattered order, as a chain printer's do.
  let order: Int32Array = new Int32Array(0);
  let strikeAge = 1;
  const valley = document.createElement("canvas");
  const mountain = document.createElement("canvas");
  const lip = document.createElement("canvas");
  const fade = document.createElement("canvas");
  let crossfade = 0;
  // The wind as printed: it eases toward the wind the host holds.
  const wind = { v: 0, w: 0 };
  const dash = [1, 3];

  const readColours = () => {
    paper = carriers[0] ? getComputedStyle(carriers[0]).color || paper : paper;
    ink = carriers[1] ? getComputedStyle(carriers[1]).color || ink : ink;
    bar = carriers[2] ? getComputedStyle(carriers[2]).color || bar : bar;
    family = getComputedStyle(canvas).fontFamily || family;
    buildSprites();
    for (let i = 0; i < slotLine.length; i += 1) slotLine[i] = -2147483648;
  };

  const sea = (): Sea => ({
    swell: clamp(cfg?.swell ?? 0.6, 0, 1),
    wind: clamp(wind.v, -1, 1),
    chop: clamp(cfg?.chop ?? 0.6, 0, 1),
    ink: clamp(cfg?.ink ?? 0.6, 0, 1),
    overstrike: cfg?.overstrike ?? true,
    seed: Math.round(cfg?.seed ?? 2),
  });

  /** Fold shading (a valley and a mountain) and the lip where paper enters the printer. */
  const buildSprites = () => {
    if (stripW < 1) return;
    const sw = Math.max(1, Math.round(stripW * dpr));
    const sh = Math.max(1, Math.round(18 * dpr));
    for (const [sprite, dark] of [
      [valley, 1],
      [mountain, -1],
    ] as const) {
      sprite.width = sw;
      sprite.height = sh;
      const g = sprite.getContext("2d");
      if (!g) continue;
      g.clearRect(0, 0, sw, sh);
      const grad = g.createLinearGradient(0, 0, 0, sh);
      // A valley shades below the crease, a mountain above it.
      grad.addColorStop(0, dark > 0 ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.07)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.04)");
      grad.addColorStop(
        0.52,
        dark > 0 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)",
      );
      grad.addColorStop(1, dark > 0 ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, sw, sh);
    }
    lip.width = sw;
    lip.height = Math.max(1, Math.round(12 * dpr));
    const l = lip.getContext("2d");
    if (l) {
      const grad = l.createLinearGradient(0, 0, 0, lip.height);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.22)");
      l.fillStyle = grad;
      l.fillRect(0, 0, sw, lip.height);
    }
  };

  const renderLine = (n: number) => {
    const c = cfg;
    if (!c || slots.length === 0) return;
    const k = ((n % slots.length) + slots.length) % slots.length;
    const slot = slots[k];
    if (!slot) return;
    slotLine[k] = n;
    const g = slot.getContext("2d");
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, slot.width, slot.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = `500 ${clamp(c.size, 7, 13)}px ${family}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = ink;
    const { a, b } = printLine(n, cols, sea(), phase);
    const seed = Math.round(c.seed);
    // A line's registration drifts a hair, each hammer lands a hair high or
    // low, and the ribbon is never perfectly even.
    const shift = (hash(n, 3, seed) - 0.5) * 0.8;
    const wear = 0.86 + 0.14 * dsin(n * 0.07 + seed);
    const strength = (0.55 + 0.45 * clamp(c.ink, 0, 1)) * wear;
    for (let i = 0; i < cols; i += 1) {
      const ch = a[i] ?? " ";
      if (ch === " ") continue;
      const jitter = (hash(i, n, seed + 11) - 0.5) * 0.9;
      const x = (i + 0.5) * cw + shift;
      const y = lh / 2 + jitter;
      g.globalAlpha = strength * (0.78 + 0.22 * hash(i, n, seed + 5));
      g.fillText(ch, x, y);
      const over = b[i] ?? "";
      if (over) {
        g.fillText(over, x + 0.45, y + 0.3);
      }
    }
    g.globalAlpha = 1;
  };

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const nw = root.clientWidth;
    const nh = root.clientHeight - HOUSING;
    if (nw < 1 || nh < 1) return;
    w = nw;
    h = nh;
    dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const size = clamp(c.size, 7, 13);
    ctx.font = `500 ${size}px ${family}`;
    cw = Math.max(size * 0.55, ctx.measureText("M").width);
    lh = Math.round(size * 1.25);
    stripW = w - PAD_X * 2;
    const printable = stripW - MARGIN * 2;
    cols = Math.max(4, Math.floor(printable / cw));
    textX = Math.round(PAD_X + MARGIN + (printable - cols * cw) / 2);
    // The newest line sits one line above the housing, so a paper that is
    // still feeding never strikes under the cover.
    printTop = h - lh * 2.4;
    const count = Math.ceil(h / lh) + 4;
    slots = Array.from({ length: count }, (_, i) => {
      const old = slots[i];
      const s = old ?? document.createElement("canvas");
      s.width = Math.max(1, Math.round(cols * cw * dpr) + 2);
      s.height = Math.max(1, Math.round(lh * dpr));
      return s;
    });
    slotLine = new Int32Array(count).fill(-2147483648);
    // A fixed scatter for the chain printer, rotated per line.
    const perm = Array.from({ length: cols }, (_, i) => i);
    for (let i = cols - 1; i > 0; i -= 1) {
      const j = Math.floor(hash(i, 17, Math.round(c.seed)) * (i + 1));
      const t = perm[i] ?? 0;
      perm[i] = perm[j] ?? 0;
      perm[j] = t;
    }
    order = new Int32Array(cols);
    perm.forEach((col, rank) => {
      order[col] = rank;
    });
    phase = phases(Math.round(c.seed));
    buildSprites();
    fade.width = canvas.width;
    fade.height = canvas.height;
    // The first frame is a page already printed, the same page the server
    // sent: lines up to START, the newest at the print line.
    latest = START;
    pos.v = latest + 1;
    pos.w = 0;
    strikeAge = 1;
    for (let n = latest - (count - 2); n <= latest; n += 1) renderLine(n);
  };

  const yTop = (n: number) => printTop - (pos.v - 1 - n) * lh;

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || w < 1) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    // The strip.
    ctx.fillStyle = paper;
    ctx.fillRect(PAD_X, 0, stripW, h);
    const nTop = Math.floor(pos.v - 1 - printTop / lh) - 2;
    const nBottom = Math.ceil(pos.v + (h - printTop) / lh) + 1;
    if (c.bars) {
      ctx.fillStyle = bar;
      ctx.globalAlpha = 0.55;
      for (let n = nTop; n <= nBottom; n += 1) {
        if (((n % 6) + 6) % 6 >= 3) continue;
        ctx.fillRect(PAD_X + MARGIN - 3, yTop(n), stripW - MARGIN * 2 + 6, lh);
      }
      ctx.globalAlpha = 1;
    }
    // Printed lines.
    const span = Math.max(1, clamp(c.feed, 1, 12));
    const reveal = c.motionSafe
      ? clamp(strikeAge / Math.min(0.1, 0.6 / span), 0, 1)
      : 1;
    for (let n = nTop; n <= latest; n += 1) {
      const k = ((n % slots.length) + slots.length) % slots.length;
      const slot = slots[k];
      if (!slot || slotLine[k] !== n) continue;
      const y = yTop(n);
      if (y > h || y + lh < 0) continue;
      if (n === latest && reveal < 1) {
        const shown = Math.floor(reveal * cols);
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < cols; i += 1) {
          if ((order[i] ?? 0) < shown)
            ctx.rect(textX + i * cw, y - 2, cw, lh + 4);
        }
        ctx.clip();
        ctx.drawImage(slot, textX, y, slot.width / dpr, slot.height / dpr);
        ctx.restore();
      } else {
        ctx.drawImage(slot, textX, y, slot.width / dpr, slot.height / dpr);
      }
    }
    // Fold creases: a perforation across and a fold's shading.
    const pages = clamp(Math.round(c.pageLines), 8, 66);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.6;
    ctx.setLineDash(dash);
    for (let n = nTop; n <= nBottom; n += 1) {
      if (((n % pages) + pages) % pages !== 0) continue;
      const y = yTop(n);
      const sprite = Math.floor(n / pages) % 2 === 0 ? valley : mountain;
      ctx.globalAlpha = 1;
      ctx.drawImage(sprite, PAD_X, y - 9, stripW, 18);
      ctx.globalAlpha = 0.22;
      ctx.lineDashOffset = 0;
      ctx.beginPath();
      ctx.moveTo(PAD_X, y);
      ctx.lineTo(PAD_X + stripW, y);
      ctx.stroke();
    }
    // Tear-off perforations down both margins, scrolling with the paper.
    ctx.globalAlpha = 0.2;
    ctx.lineDashOffset = -((pos.v * lh) % 4);
    ctx.beginPath();
    for (const x of [PAD_X + MARGIN - 6, PAD_X + stripW - MARGIN + 6]) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // The strip's edges.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = ink;
    ctx.fillRect(PAD_X, 0, 0.6, h);
    ctx.fillRect(PAD_X + stripW - 0.6, 0, 0.6, h);
    // Sprocket holes, punched through: whatever is behind the paper shows.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    const r = 2.6;
    for (let n = nTop - (nTop % 2) - 2; n <= nBottom; n += 2) {
      const y = yTop(n) + lh;
      for (const x of [PAD_X + 8, PAD_X + stripW - 8]) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
    }
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // A punched edge catches a little shadow.
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // The paper slides under the printer's cover: a soft shadow at the lip.
    ctx.drawImage(lip, PAD_X, h - 12, stripW, 12);
    // Reduced motion: the old page fades out over the reprint.
    if (crossfade > 0.001) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = crossfade;
      ctx.drawImage(fade, 0, 0);
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const integrateWind = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const target = clamp(c.wind, -1, 1);
    if (!c.motionSafe) {
      wind.v = target;
      wind.w = 0;
      return;
    }
    const k = springs.drift;
    let left = Math.min(1, dt);
    while (left > 0) {
      const step = Math.min(SUB, left);
      left -= step;
      wind.w +=
        ((-k.stiffness * (wind.v - target) - k.damping * wind.w) / k.mass) *
        step;
      wind.v += wind.w * step;
    }
    if (Math.abs(wind.v - target) < 0.002 && Math.abs(wind.w) < 0.01) {
      wind.v = target;
      wind.w = 0;
    }
  };

  const settled = () =>
    strikeAge >= 1 &&
    Math.abs(pos.v - (latest + 1)) < 0.002 &&
    Math.abs(pos.w) < 0.02 &&
    crossfade <= 0.001;

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (c.motionSafe) {
      strikeAge = Math.min(
        1,
        strikeAge + dt / Math.min(0.1, 0.6 / clamp(c.feed, 1, 12)),
      );
      const k = springs.snap;
      let left = dt;
      while (left > 0) {
        const step = Math.min(SUB, left);
        left -= step;
        pos.w +=
          ((-k.stiffness * (pos.v - (latest + 1)) - k.damping * pos.w) /
            k.mass) *
          step;
        pos.v += pos.w * step;
      }
    } else {
      pos.v = latest + 1;
      pos.w = 0;
      strikeAge = 1;
      crossfade = Math.max(0, crossfade - dt / 0.24);
    }
    draw();
    if (settled()) {
      pos.v = latest + 1;
      pos.w = 0;
      last = 0;
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || w < 1)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** One line: struck, then fed. */
  const strike = () => {
    const c = cfg;
    if (!c) return;
    const now = performance.now();
    integrateWind(lastWind ? (now - lastWind) / 1000 : 0);
    lastWind = now;
    latest += 1;
    renderLine(latest);
    strikeAge = 0;
    onStrike.current();
    kick();
  };

  const schedule = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    const c = cfg;
    if (!c || disposed || c.paused || !c.motionSafe) return;
    if (!visible.current || document.hidden) return;
    timer = window.setTimeout(
      () => {
        timer = 0;
        if (!cfg || !visible.current || document.hidden) return;
        strike();
        schedule();
      },
      Math.round(1000 / clamp(c.feed, 1, 12)),
    );
  };

  /** Reduced motion: the page is reprinted for the new wind, crossfading. */
  const reprint = () => {
    const c = cfg;
    if (!c || !ctx || slots.length === 0) return;
    const f = fade.getContext("2d");
    if (f) {
      f.clearRect(0, 0, fade.width, fade.height);
      f.drawImage(canvas, 0, 0);
    }
    wind.v = clamp(c.wind, -1, 1);
    for (let n = latest - (slots.length - 2); n <= latest; n += 1)
      renderLine(n);
    crossfade = 1;
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
        wind.v = clamp(next.wind, -1, 1);
        readColours();
        layout();
        draw();
        schedule();
        return;
      }
      if (
        was.size !== next.size ||
        was.dpr !== next.dpr ||
        was.seed !== next.seed
      ) {
        layout();
      } else if (was.colorKey !== next.colorKey) {
        readColours();
        for (let n = latest - (slots.length - 2); n <= latest; n += 1)
          renderLine(n);
      } else if (
        !next.motionSafe &&
        (was.swell !== next.swell ||
          was.ink !== next.ink ||
          was.chop !== next.chop ||
          was.overstrike !== next.overstrike)
      ) {
        reprint();
      }
      if (was.wind !== next.wind && !next.motionSafe) {
        // Once the input rests, not on every step of it.
        if (reprintTimer) window.clearTimeout(reprintTimer);
        reprintTimer = window.setTimeout(() => {
          reprintTimer = 0;
          reprint();
        }, 300);
      }
      if (
        was.feed !== next.feed ||
        was.paused !== next.paused ||
        was.motionSafe !== next.motionSafe
      ) {
        schedule();
      }
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
      if (
        w === root.clientWidth &&
        h === root.clientHeight - HOUSING &&
        dpr === ratio
      )
        return;
      layout();
      draw();
    },
    readColours() {
      readColours();
      for (let n = latest - (slots.length - 2); n <= latest; n += 1)
        renderLine(n);
      draw();
    },
    wake() {
      draw();
      kick();
      if (!timer) schedule();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (timer) window.clearTimeout(timer);
      timer = 0;
      if (reprintTimer) window.clearTimeout(reprintTimer);
      reprintTimer = 0;
    },
  };
}

/** The server's page: the same sea, printed plain, newest line at the bottom. */
function standIn(sea: Sea) {
  const phase = phases(sea.seed);
  const rows: string[] = [];
  for (let n = 0; n <= START; n += 1) {
    rows.push(printLine(n, 64, sea, phase).a.join(""));
  }
  return rows;
}

const windWords = (wind: number, chop: number) => {
  const v = Math.round(Math.abs(wind) * 100);
  if (v === 0) return "Calm, the swell rolling in";
  const side = wind < 0 ? "west" : "east";
  const sea =
    Math.abs(wind) * chop > 0.45
      ? "choppy"
      : Math.abs(wind) * chop > 0.2
        ? "a light chop"
        : "smooth";
  return `Wind ${v} from the ${side}, ${sea}`;
};

/**
 * A strip of continuous-feed paper rising out of a line printer as it prints
 * a rolling sea in overstruck ASCII, one line per tick. The sea is a height
 * field of three long Stokes swells and a short chop; each line is the next
 * slice of it, shaded by the slope facing the light at the top of the paper,
 * so crests run as slanted bands that drift away up the strip. The darkest
 * tones are two characters struck in one cell a hair out of register, each
 * hammer lands a hair high or low, and the ribbon wears unevenly. The paper
 * has sprocket holes punched down both margins, tear-off perforations,
 * green-bar banding and a fold crease every `pageLines` lines.
 *
 * Each line arrives in a scattered order across ~100 ms, then the paper
 * ratchets up a line on springs.snap — one crisp overshoot per line, running
 * together at high feed. Moving the pointer sideways over the paper sets the
 * wind, which leans the swell and raises a chop with whitecaps, eased on
 * springs.drift. It is a real slider: arrow keys, Page Up/Down, Home and End
 * set the wind. Under reduced motion the page is still and reprints with a
 * crossfade when the wind rests.
 */
export function SeaPrintout({
  swell = 0.6,
  feed = 4,
  ink = 0.6,
  wind,
  defaultWind = 0,
  onWindChange,
  chop = 0.6,
  pageLines = 24,
  bars = true,
  overstrike = true,
  size = 9,
  colors,
  interactive = true,
  paused = false,
  sound = false,
  seed = 2,
  dpr = 2,
  label = "Wind over the printed sea",
  disabled = false,
  className,
}: SeaPrintoutProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const [ownWind, setOwnWind] = React.useState(() => step05(defaultWind));
  const shownWind = wind === undefined ? ownWind : step05(wind);
  const paperColor = colors?.paper ?? DEFAULT_PAPER;
  const inkColor = colors?.ink ?? DEFAULT_INK;
  const barColor = colors?.bar ?? DEFAULT_BAR;
  const colorKey = `${paperColor}|${inkColor}|${barColor}`;
  const lines = React.useMemo(
    () =>
      standIn({
        swell: clamp(swell, 0, 1),
        wind: 0,
        chop: clamp(chop, 0, 1),
        ink: clamp(ink, 0, 1),
        overstrike,
        seed: Math.round(seed),
      }),
    [swell, chop, ink, overstrike, seed],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const whir = React.useRef<LoopHandle | null>(null);
  const whirStop = React.useRef(0);
  const bump = React.useRef(0);
  const feedRef = React.useRef(feed);
  const onStrike = React.useRef(() => {
    // Each line the printer strikes while it whirs is heard as a little lift.
    const loop = whir.current;
    if (!loop) return;
    loop.set({ gain: 0.6 });
    if (bump.current) window.clearTimeout(bump.current);
    bump.current = window.setTimeout(() => {
      bump.current = 0;
      whir.current?.set({ gain: 0.36 });
    }, 70);
  });

  const config: Config = {
    swell,
    feed,
    ink,
    wind: shownWind,
    chop,
    pageLines,
    bars,
    overstrike,
    size,
    paused,
    seed,
    dpr,
    colorKey,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latest.current = config;
    feedRef.current = feed;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carrierRefs.current.filter((c): c is HTMLSpanElement =>
      Boolean(c),
    );
    if (!root || !canvas || carriers.length < 3) return;
    const e = createEngine(root, canvas, carriers, visible, onStrike);
    engine.current = e;
    e.configure(latest.current);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) engine.current?.readColours();
    });
    return () => {
      live = false;
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

  // The whir never outlives the input that started it, or the component.
  React.useEffect(
    () => () => {
      if (whirStop.current) window.clearTimeout(whirStop.current);
      if (bump.current) window.clearTimeout(bump.current);
      whir.current?.stop();
      whir.current = null;
    },
    [],
  );
  React.useEffect(() => {
    if (sound) return;
    whir.current?.stop();
    whir.current = null;
  }, [sound]);

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

  /** The visitor is working the wind: the printer whirs, then stops. */
  const hum = (activated: boolean) => {
    if (!sound) return;
    const ready =
      activated ||
      (typeof navigator !== "undefined" &&
        Boolean(
          (
            navigator as Navigator & {
              userActivation?: { hasBeenActive: boolean };
            }
          ).userActivation?.hasBeenActive,
        ));
    if (!ready || paused) return;
    if (!whir.current) {
      whir.current = audio.start("whir", {
        pitch: 0.8 + clamp(feedRef.current, 1, 12) * 0.05,
        gain: 0.36,
      });
    }
    if (whirStop.current) window.clearTimeout(whirStop.current);
    whirStop.current = window.setTimeout(() => {
      whirStop.current = 0;
      whir.current?.stop();
      whir.current = null;
    }, 600);
  };

  const commit = (next: number, activated: boolean) => {
    const value = step05(next);
    hum(activated);
    if (value === shownWind) return;
    if (wind === undefined) setOwnWind(value);
    onWindChange?.(value);
  };

  const fromPointer = (clientX: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || r.width < 1) return shownWind;
    return clamp((clientX - (r.left + r.width / 2)) / (r.width * 0.4), -1, 1);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 2,
    disabled: inert,
    onMove: ({ point }) => commit(fromPointer(point.x), true),
    onTap: (event) => commit(fromPointer(event.clientX), true),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (inert) return;
    const steps: Record<string, number> = {
      ArrowLeft: -0.1,
      ArrowDown: -0.1,
      ArrowRight: 0.1,
      ArrowUp: 0.1,
      PageDown: -0.25,
      PageUp: 0.25,
    };
    let next: number | null = null;
    const delta = steps[event.key];
    if (delta !== undefined) {
      next =
        shownWind +
        (event.shiftKey && Math.abs(delta) < 0.2 ? delta * 2.5 : delta);
    } else if (event.key === "Home") next = -1;
    else if (event.key === "End") next = 1;
    else if (event.key === "0") next = 0;
    if (next === null) return;
    event.preventDefault();
    commit(next, true);
  };

  const valueText = windWords(shownWind, clamp(chop, 0, 1));
  const lamp = paused ? "off line" : "on line";

  return (
    <div
      ref={bindRoot}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={-100}
      aria-valuemax={100}
      aria-valuenow={Math.round(shownWind * 100)}
      aria-valuetext={valueText}
      aria-orientation="horizontal"
      aria-disabled={inert || undefined}
      onKeyDown={onKeyDown}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (inert || event.pointerType === "touch" || event.buttons) return;
        commit(fromPointer(event.clientX), false);
      }}
      className={cn(
        "group/sea-printout relative isolate block h-96 w-full touch-pan-y overflow-clip rounded-3 border border-hairline bg-[color-mix(in_oklab,var(--ink-3)_26%,var(--bg-2))] [contain:paint] outline-none select-none",
        inert ? "cursor-default" : "cursor-ew-resize",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 bottom-12 [mask-image:linear-gradient(to_bottom,transparent,black_14%)]"
      >
        <div
          className="absolute inset-y-0 right-2.5 left-2.5 overflow-clip group-data-live/sea-printout:hidden"
          style={{
            backgroundColor: paperColor,
            backgroundImage: bars
              ? `repeating-linear-gradient(to top, transparent 0 ${Math.round(size * 1.25) * 3}px, color-mix(in oklab, ${barColor} 55%, transparent) 0 ${Math.round(size * 1.25) * 6}px)`
              : undefined,
          }}
        >
          <div
            className="absolute inset-x-5 flex flex-col overflow-clip font-mono whitespace-pre"
            style={{
              bottom: `${Math.round(Math.round(size * 1.25) * 14) / 10}px`,
              color: inkColor,
              fontSize: `${size}px`,
              lineHeight: `${Math.round(size * 1.25)}px`,
              opacity: 0.85,
            }}
          >
            {lines.map((row, i) => (
              <span key={i} className="block">
                {row}
              </span>
            ))}
          </div>
        </div>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full font-mono"
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-center justify-between gap-3 border-t border-hairline-strong bg-surface-1 px-3"
      >
        <span className="absolute inset-x-6 top-0 h-[3px] rounded-b-1 bg-ink/70" />
        <span className="flex min-w-0 items-center gap-2">
          <span className="size-4 shrink-0 rounded-full border border-hairline-strong bg-surface-2 shadow-[inset_0_-1px_0_var(--hairline-strong)]" />
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              paused ? "bg-ink-3/40" : "bg-signal",
            )}
          />
          <span className="truncate font-mono text-[9px] tracking-[0.1em] text-ink-3 uppercase">
            {lamp}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] text-ink-3">
          <span>W</span>
          <span className="relative h-2.5 w-14 rounded-full border border-hairline-strong">
            <span className="absolute top-1/2 left-1/2 h-1.5 w-px -translate-y-1/2 bg-ink-3/50" />
            <span
              className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground transition-[left] duration-500 ease-out motion-reduce:transition-none"
              style={{ left: `${Math.round(50 + shownWind * 44)}%` }}
            />
          </span>
          <span>E</span>
          <span className="ml-1.5 size-4 shrink-0 rounded-full border border-hairline-strong bg-surface-2 shadow-[inset_0_-1px_0_var(--hairline-strong)]" />
        </span>
      </div>
      {[paperColor, inkColor, barColor].map((color, i) => (
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
    </div>
  );
}
