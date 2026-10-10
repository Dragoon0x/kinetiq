"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RelayTerminalGlyphs = "hex" | "binary" | "ascii" | "blocks";
export type RelayTerminalColor = "green" | "amber" | "ice" | "mono";

export type RelayTerminalProps = {
  /** The content on top of the screen: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many bursts of output arrive a second, 0 (none) to 4. @default 1.25 */
  rate?: number;
  /** The glyph set the output is written in: a named set, or a string of your own characters. @default "hex" */
  glyphs?: RelayTerminalGlyphs | (string & {});
  /** The phosphor: a named colour, or any CSS colour. @default "green" */
  color?: RelayTerminalColor | (string & {});
  /** The glyph size, px; the grid follows it. @default 12 */
  fontSize?: number;
  /** How full the lines run, 0 (short, sparse output) to 1 (lines to the edge). @default 0.6 */
  density?: number;
  /** How long a written glyph glows before it settles, seconds: the phosphor's persistence. @default 1.4 */
  decay?: number;
  /** How often a line tears sideways and springs back, 0 (never) to 1. @default 0.4 */
  glitch?: number;
  /** The fine line screen and the slow rolling band, 0 (none) to 1. @default 0.5 */
  scanlines?: number;
  /** The halo round lit glyphs, 0 (none) to 1. @default 0.5 */
  glow?: number;
  /** A block cursor blinks at the end of the newest line. @default true */
  cursor?: boolean;
  /** The pointer and keyboard focus light the glyphs near them, and a press pings the screen. @default true */
  interactive?: boolean;
  /** How brightly the hand lights the glyphs, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** How far the hand's light reaches, px. @default 90 */
  radius?: number;
  /** Stop the output; the screen settles and the hand still lights it. @default false */
  paused?: boolean;
  /** Seeds the output, the bursts and the glitches, so two screens never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) lighting the screen. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press or keyboard focus pings the screen. */
  onPing?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Phosphors, at the hue and chroma that matter; each theme sets its own lightness. */
const PHOSPHORS: Record<RelayTerminalColor, string> = {
  green: "oklch(0.8 0.17 150)",
  amber: "oklch(0.8 0.15 72)",
  ice: "var(--accent-bright)",
  mono: "var(--foreground)",
};

const HEX = "0123456789ABCDEF";
const SYSTEM_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const SETS: Record<RelayTerminalGlyphs, string> = {
  hex: HEX,
  binary: "01",
  ascii: `${LOWER}ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`,
  blocks: "░▒▓█▌▐▀▄",
};
/** What every set may also print: spacing, punctuation, digits for values. */
const STRUCTURE = " .:-›·|%[]/0123456789";
const WORDS = [
  "relay",
  "node",
  "sync",
  "ack",
  "link",
  "hold",
  "pass",
  "route",
  "queue",
  "ping",
  "seq",
  "hop",
  "drop",
  "ok",
  "wait",
  "tx",
  "rx",
  "gate",
  "bus",
] as const;
const TAGS = ["[ok]", "[up]", "--", "::", "..."] as const;

const STEP = 1 / 120;
/** The lamp's place follows on glide, its presence on drift; a torn line springs back on snap; the screen scrolls on glide. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
const SNAP = springs.snap;
/** A ping's ring travels this fast, px/s. */
const PING_SPEED = 900;
/** A written glyph's resting brightness, as alpha on the screen. */
const REST_DARK = 0.4;
const REST_LIGHT = 0.52;

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

type Rand = () => number;
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

/** The characters a glyph set writes with: its own, plus spacing and values. */
function charsOf(glyphs: string): { set: string[]; all: string[] } {
  const named = Object.prototype.hasOwnProperty.call(SETS, glyphs)
    ? SETS[glyphs as RelayTerminalGlyphs]
    : null;
  const own = Array.from(named ?? glyphs)
    .filter((c) => c.trim().length > 0)
    .slice(0, 64);
  const set = own.length > 0 ? own : Array.from(HEX);
  const extra = glyphs === "ascii" ? Array.from(LOWER) : [];
  const all = Array.from(new Set([" ", ...STRUCTURE, ...set, ...extra]));
  return { set, all };
}

const pick = <T,>(rand: Rand, list: readonly T[], fallback: T): T =>
  list[Math.floor(rand() * list.length)] ?? fallback;

/**
 * One line of console output in the given set: an address and grouped
 * bytes for hex, octets for binary, words and values for text, meters for
 * blocks — ragged at the right, now and then blank.
 */
function composeLine(
  rand: Rand,
  glyphs: string,
  set: readonly string[],
  cols: number,
  density: number,
): string[] {
  const d = clamp(density, 0, 1);
  if (rand() < 0.1 - 0.07 * d) return [];
  const target = Math.max(
    4,
    Math.round(cols * (0.3 + 0.7 * d * (0.55 + 0.45 * rand()))),
  );
  const out: string[] = [];
  const push = (s: string) => {
    for (const ch of Array.from(s)) out.push(ch);
  };
  const ch = () => pick(rand, set, " ");
  const num = () => {
    const n = Math.floor(rand() * 240);
    const v = rand();
    return v < 0.4
      ? String(n).padStart(2, "0")
      : v < 0.75
        ? `${n % 60}.${Math.floor(rand() * 10)}`
        : `${n}%`;
  };
  if (glyphs === "hex") {
    push(`${ch()}${ch()}${ch()}${ch()}:  `);
    let g = 0;
    while (out.length < target) {
      push(`${ch()}${ch()}`);
      g += 1;
      push(g % 8 === 0 ? "  " : " ");
    }
  } else if (glyphs === "binary") {
    if (rand() < 0.4) push("› ");
    while (out.length < target) {
      for (let i = 0; i < 8; i += 1) push(ch());
      push(rand() < 0.2 ? "  " : " ");
    }
  } else if (glyphs === "ascii") {
    push(rand() < 0.5 ? "› " : "  ");
    while (out.length < target) {
      const w = rand();
      push(
        w < 0.6
          ? pick(rand, WORDS, "ok")
          : w < 0.86
            ? num()
            : pick(rand, TAGS, "--"),
      );
      push(" ");
    }
  } else if (glyphs === "blocks") {
    while (out.length < target) {
      const span = 8 + Math.floor(rand() * 14);
      const fill = Math.floor(rand() * span);
      push("▐");
      for (let i = 0; i < span; i += 1) {
        push(
          i < fill
            ? "█"
            : i === fill
              ? "▓"
              : i === fill + 1
                ? "▒"
                : i === fill + 2
                  ? "░"
                  : " ",
        );
      }
      push(`▌ ${String(Math.round((fill / span) * 100)).padStart(2, "0")}%   `);
    }
  } else {
    while (out.length < target) {
      const len = 2 + Math.floor(rand() * 5);
      for (let i = 0; i < len; i += 1) push(ch());
      push(" ");
    }
  }
  while (out.length > 0 && out[out.length - 1] === " ") out.pop();
  return out.slice(0, cols);
}

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Config = {
  rate: number;
  glyphs: string;
  paintKey: string;
  fontSize: number;
  density: number;
  decay: number;
  glitch: number;
  scanlines: number;
  glow: number;
  cursor: boolean;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onPing: () => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  ping: (x: number, y: number) => void;
  dispose: () => void;
};

type Grid = {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  padX: number;
  padY: number;
  /** Per cell: the glyph shown, the glyph it settles on, its energy, the ghost it replaced. */
  glyph: Uint16Array;
  final: Uint16Array;
  energy: Float32Array;
  ghost: Uint16Array;
  ghostE: Float32Array;
  /** 0 idle, 1 rolling through random glyphs, 2 waiting to be typed. */
  mode: Uint8Array;
  until: Float32Array;
  next: Float32Array;
  /** Reduced motion: a still lift on the newest rows. */
  lift: Float32Array;
};

const MODE_IDLE = 0;
const MODE_ROLL = 1;
const MODE_TYPE = 2;

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let grid: Grid | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let active = false;
  let rand: Rand = lcg(1);
  let chars = charsOf("hex");
  let setIdx: number[] = [];
  const read = rgbReader();
  const size = { w: 0, h: 0, dpr: 1 };
  const paint = {
    screen: [12, 16, 14] as Rgb,
    ink: "rgb(120, 220, 160)",
    hot: "rgb(220, 255, 230)",
    shade: "rgb(0, 0, 0)",
    light: false,
    family: SYSTEM_MONO,
  };
  const atlas = document.createElement("canvas");
  let atlasW = 0;
  let atlasH = 0;
  const backdrop = document.createElement("canvas");
  const band = document.createElement("canvas");
  const halo = document.createElement("canvas");
  let lines: CanvasPattern | null = null;
  const sim = {
    t: 0,
    nextBurst: 0,
    nextGlitch: 0,
    scroll: 0,
    scrollV: 0,
    cursorRow: 0,
    cursorCol: 0,
  };
  const tear = { row: -1, offset: 0, vel: 0, hold: 0 };
  const rings: { x: number; y: number; reach: number; live: boolean }[] = [
    { x: 0, y: 0, reach: 0, live: false },
    { x: 0, y: 0, reach: 0, live: false },
    { x: 0, y: 0, reach: 0, live: false },
  ];
  const hand = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const indexOf = new Map<string, number>();
  const toIndex = (ch: string) => indexOf.get(ch) ?? 0;
  const randomGlyph = () => setIdx[Math.floor(rand() * setIdx.length)] ?? 0;

  const layAlphabet = () => {
    chars = charsOf(cfg?.glyphs ?? "hex");
    indexOf.clear();
    chars.all.forEach((ch, i) => indexOf.set(ch, i));
    setIdx = chars.set.map(toIndex);
  };

  /** Every glyph once, normal and hot, at the device size: one blit per cell after this. */
  const buildAtlas = () => {
    const c = cfg;
    const g = grid;
    if (!c || !g) return;
    const { dpr } = size;
    atlasW = Math.ceil(g.cellW * dpr) + 2;
    atlasH = Math.ceil(g.cellH * dpr);
    atlas.width = atlasW * chars.all.length;
    atlas.height = atlasH * 2;
    const a = atlas.getContext("2d");
    if (!a) return;
    a.clearRect(0, 0, atlas.width, atlas.height);
    a.font = `${Math.round(clamp(c.fontSize, 8, 32) * dpr)}px ${paint.family}`;
    a.textBaseline = "middle";
    a.textAlign = "left";
    // Block elements are drawn, not set in type: fonts disagree about their
    // height and leave seams, and a meter must read as one solid bar.
    const blockW = Math.round(g.cellW * dpr);
    const bandH = atlasH * 0.8;
    const blocks: Record<string, [number, number, number, number, number]> = {
      "█": [0, 0, 1, 1, 1],
      "▓": [0, 0, 1, 1, 0.72],
      "▒": [0, 0, 1, 1, 0.48],
      "░": [0, 0, 1, 1, 0.26],
      "▌": [0, 0, 0.5, 1, 1],
      "▐": [0.5, 0, 0.5, 1, 1],
      "▀": [0, 0, 1, 0.5, 1],
      "▄": [0, 0.5, 1, 0.5, 1],
    };
    chars.all.forEach((ch, i) => {
      if (ch === " ") return;
      const block = blocks[ch];
      for (let row = 0; row < 2; row += 1) {
        a.fillStyle = row === 0 ? paint.ink : paint.hot;
        if (block) {
          const [bx, by, bw, bh, alpha] = block;
          a.globalAlpha = alpha;
          a.fillRect(
            Math.round(i * atlasW + 1 + bx * blockW),
            Math.round(row * atlasH + (atlasH - bandH) / 2 + by * bandH),
            Math.ceil(bw * blockW),
            Math.ceil(bh * bandH),
          );
          a.globalAlpha = 1;
        } else {
          a.fillText(ch, i * atlasW + 1, row * atlasH + atlasH / 2);
        }
      }
    });
  };

  /** The tube: the screen colour, a vignette, the rolling band and the line screen. */
  const buildBackdrop = () => {
    const { w, h, dpr } = size;
    if (w < 1) return;
    backdrop.width = Math.round(w * dpr);
    backdrop.height = Math.round(h * dpr);
    const b = backdrop.getContext("2d");
    if (!b) return;
    const [r, g, bl] = paint.screen;
    b.fillStyle = css(paint.screen);
    b.fillRect(0, 0, backdrop.width, backdrop.height);
    const v = b.createRadialGradient(
      backdrop.width / 2,
      backdrop.height / 2,
      Math.min(backdrop.width, backdrop.height) * 0.2,
      backdrop.width / 2,
      backdrop.height / 2,
      Math.hypot(backdrop.width, backdrop.height) * 0.62,
    );
    const edge = paint.light ? 0.06 : 0.38;
    v.addColorStop(0, `rgba(${r}, ${g}, ${bl}, 0)`);
    v.addColorStop(1, `rgba(0, 0, 0, ${edge})`);
    b.fillStyle = v;
    b.fillRect(0, 0, backdrop.width, backdrop.height);
    band.width = 2;
    band.height = Math.max(8, Math.round(48 * dpr));
    const bc = band.getContext("2d");
    if (bc) {
      const grad = bc.createLinearGradient(0, 0, 0, band.height);
      grad.addColorStop(0, "rgba(255, 255, 255, 0)");
      grad.addColorStop(0.5, paint.light ? paint.ink : paint.hot);
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      bc.clearRect(0, 0, 2, band.height);
      bc.fillStyle = grad;
      bc.fillRect(0, 0, 2, band.height);
    }
    const tile = document.createElement("canvas");
    tile.width = 1;
    tile.height = 3;
    const tc = tile.getContext("2d");
    if (tc && ctx) {
      tc.fillStyle = paint.shade;
      tc.fillRect(0, 0, 1, 1);
      lines = ctx.createPattern(tile, "repeat");
    }
    halo.width = Math.max(1, Math.round(backdrop.width / 4));
    halo.height = Math.max(1, Math.round(backdrop.height / 4));
  };

  /** Writes a fresh line into row r, settled (no animation). */
  const fill = (g: Grid, r: number, glyphs: readonly string[]) => {
    for (let c = 0; c < g.cols; c += 1) {
      const k = r * g.cols + c;
      const gl = toIndex(glyphs[c] ?? " ");
      g.glyph[k] = gl;
      g.final[k] = gl;
      g.mode[k] = MODE_IDLE;
    }
  };

  const compose = (g: Grid) =>
    composeLine(
      rand,
      cfg?.glyphs ?? "hex",
      chars.set,
      g.cols,
      cfg?.density ?? 0.6,
    );

  const lay = () => {
    const c = cfg;
    const { w, h } = size;
    if (!c || !ctx || w < 1) return;
    const fs = clamp(c.fontSize, 8, 32);
    ctx.font = `${fs}px ${paint.family}`;
    // The pitch is a whole number of device pixels, so neighbouring cells
    // meet exactly and a meter's blocks join without seams.
    const cellW =
      Math.max(4, Math.round(ctx.measureText("0").width * size.dpr)) / size.dpr;
    const cellH = Math.round(fs * 1.5);
    const cols = Math.max(4, Math.floor((w - cellW) / cellW));
    const rows = Math.max(2, Math.ceil(h / cellH) + 1);
    const n = cols * rows;
    rand = lcg(c.seed * 31 + 7);
    const g: Grid = {
      cols,
      rows,
      cellW,
      cellH,
      padX: cellW,
      padY: Math.round(cellH * 0.4),
      glyph: new Uint16Array(n),
      final: new Uint16Array(n),
      energy: new Float32Array(n),
      ghost: new Uint16Array(n),
      ghostE: new Float32Array(n),
      mode: new Uint8Array(n),
      until: new Float32Array(n),
      next: new Float32Array(n),
      lift: new Float32Array(rows),
    };
    grid = g;
    // The cursor sits on the last row that shows whole; below it the
    // screen is empty, as a console's is.
    const cursorRow = clamp(Math.floor((h - g.padY) / cellH) - 1, 0, rows - 1);
    for (let r = 0; r < rows; r += 1) {
      if (r > cursorRow) {
        fill(g, r, []);
        continue;
      }
      let line = compose(g);
      for (
        let tries = 0;
        r === cursorRow && line.length === 0 && tries < 8;
        tries += 1
      )
        line = compose(g);
      fill(g, r, line);
    }
    sim.cursorRow = cursorRow;
    sim.cursorCol = 0;
    for (let c2 = g.cols - 1; c2 >= 0; c2 -= 1) {
      if ((g.glyph[cursorRow * g.cols + c2] ?? 0) !== 0) {
        sim.cursorCol = c2 + 1;
        break;
      }
    }
    // In a still screen the newest output reads a little brighter, as if
    // just written.
    g.lift[cursorRow] = 0.45;
    if (cursorRow > 0) g.lift[cursorRow - 1] = 0.25;
    sim.scroll = 0;
    sim.scrollV = 0;
    tear.row = -1;
    sim.nextBurst = sim.t + 0.4;
    sim.nextGlitch = sim.t + 2 + rand() * 3;
    buildAtlas();
  };

  const roll = (g: Grid, k: number, until: number, to: number) => {
    g.final[k] = to;
    g.mode[k] = MODE_ROLL;
    g.until[k] = until;
    g.next[k] = sim.t;
  };

  /** One burst of output: a rewrite, a field tick or a line feed. */
  const burst = (g: Grid) => {
    const kind = rand();
    const visibleRows = Math.max(1, Math.floor((size.h - g.padY) / g.cellH));
    if (kind < 0.42) {
      const band2 = 1 + Math.floor(rand() * 4);
      const top = Math.floor(rand() * Math.max(1, visibleRows - band2 + 1));
      for (let r = top; r < Math.min(g.rows, top + band2); r += 1) {
        const line = compose(g);
        const at = sim.t + (r - top) * 0.04;
        for (let c = 0; c < g.cols; c += 1) {
          const k = r * g.cols + c;
          const to = toIndex(line[c] ?? " ");
          if (to === 0 && (g.glyph[k] ?? 0) === 0) continue;
          roll(g, k, at + 0.06 + c * 0.0032 + rand() * 0.1, to);
        }
      }
    } else if (kind < 0.72) {
      const n = 6 + Math.floor(rand() * 16);
      for (let i = 0; i < n; i += 1) {
        const r = Math.floor(rand() * visibleRows);
        const c = Math.floor(rand() * g.cols);
        const k = r * g.cols + c;
        if ((g.glyph[k] ?? 0) === 0) continue;
        roll(g, k, sim.t + 0.1 + rand() * 0.16, randomGlyph());
      }
    } else {
      // Line feed: the screen moves up a row on glide and the new line is
      // typed at the cursor.
      const { cols, rows } = g;
      const shift = (a: Uint16Array | Float32Array | Uint8Array) =>
        a.copyWithin(0, cols);
      shift(g.glyph);
      shift(g.final);
      shift(g.energy);
      shift(g.ghost);
      shift(g.ghostE);
      shift(g.mode);
      shift(g.until);
      shift(g.next);
      const row = Math.min(rows - 1, sim.cursorRow);
      const below = (rows - 1) * cols;
      for (let c = 0; c < cols; c += 1) {
        g.glyph[below + c] = 0;
        g.final[below + c] = 0;
        g.energy[below + c] = 0;
        g.ghostE[below + c] = 0;
        g.mode[below + c] = MODE_IDLE;
      }
      const line = compose(g);
      for (let c = 0; c < cols; c += 1) {
        const k = row * cols + c;
        const to = toIndex(line[c] ?? " ");
        g.ghost[k] = g.glyph[k] ?? 0;
        g.ghostE[k] = (g.energy[k] ?? 0) * 0.5;
        g.glyph[k] = 0;
        g.final[k] = to;
        g.mode[k] = to === 0 ? MODE_IDLE : MODE_TYPE;
        g.until[k] = sim.t + 0.08 + c * 0.0045;
      }
      sim.cursorCol = 0;
      sim.scroll += g.cellH;
    }
  };

  const startTear = (g: Grid) => {
    const visibleRows = Math.max(1, Math.floor((size.h - g.padY) / g.cellH));
    for (let tries = 0; tries < 6; tries += 1) {
      const r = Math.floor(rand() * visibleRows);
      let any = false;
      for (let c = 0; c < g.cols && !any; c += 1)
        any = (g.glyph[r * g.cols + c] ?? 0) !== 0;
      if (!any) continue;
      tear.row = r;
      tear.offset =
        (rand() < 0.5 ? -1 : 1) * (2 + Math.floor(rand() * 6)) * g.cellW;
      tear.vel = 0;
      tear.hold = 0.09 + rand() * 0.09;
      return;
    }
  };

  /** Advances the output, the phosphor, the springs and the pings. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    const g = grid;
    if (!c || !g) return false;
    let moving = false;
    sim.t += dt;
    const running = !c.paused;
    if (running) {
      moving = true;
      const rate = clamp(c.rate, 0, 4);
      if (rate > 0 && sim.t >= sim.nextBurst) {
        burst(g);
        sim.nextBurst = sim.t + -Math.log(1 - rand() * 0.98) / rate;
      }
      const gl = clamp(c.glitch, 0, 1);
      if (gl > 0 && tear.row < 0 && sim.t >= sim.nextGlitch) {
        startTear(g);
        sim.nextGlitch = sim.t + 1.2 + (-Math.log(1 - rand() * 0.98) * 5) / gl;
      }
    }
    // Phosphor: every lit glyph decays toward rest; ghosts twice as fast.
    const decay = Math.exp(-dt / clamp(c.decay, 0.1, 8));
    const ghostDecay = Math.exp(-dt / clamp(c.decay * 0.5, 0.05, 4));
    let glowing = false;
    const n = g.cols * g.rows;
    for (let k = 0; k < n; k += 1) {
      const mode = g.mode[k] ?? MODE_IDLE;
      if (mode !== MODE_IDLE) {
        moving = true;
        if (sim.t >= (g.until[k] ?? 0)) {
          const was = g.glyph[k] ?? 0;
          const to = g.final[k] ?? 0;
          if (was !== to && mode === MODE_ROLL && was !== 0) {
            g.ghost[k] = was;
            g.ghostE[k] = 0.35;
          }
          g.glyph[k] = to;
          g.energy[k] = to === 0 ? 0 : 1;
          g.mode[k] = MODE_IDLE;
          if (mode === MODE_TYPE) {
            const col = k % g.cols;
            sim.cursorCol = Math.max(sim.cursorCol, col + 1);
          }
        } else if (mode === MODE_ROLL && sim.t >= (g.next[k] ?? 0)) {
          g.glyph[k] = randomGlyph();
          g.energy[k] = 1;
          g.next[k] = sim.t + 0.04 + rand() * 0.04;
        }
      }
      const e = g.energy[k] ?? 0;
      if (e > 0.004) {
        g.energy[k] = e * decay;
        glowing = true;
      } else if (e !== 0) g.energy[k] = 0;
      const ge = g.ghostE[k] ?? 0;
      if (ge > 0.004) {
        g.ghostE[k] = ge * ghostDecay;
        glowing = true;
      } else if (ge !== 0) g.ghostE[k] = 0;
    }
    if (glowing) moving = true;

    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const want =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
    for (let s = 0; s < steps; s += 1) {
      hand.vx +=
        ((GLIDE.stiffness * (hand.x - hand.px) - GLIDE.damping * hand.vx) /
          GLIDE.mass) *
        h;
      hand.vy +=
        ((GLIDE.stiffness * (hand.y - hand.py) - GLIDE.damping * hand.vy) /
          GLIDE.mass) *
        h;
      hand.px += hand.vx * h;
      hand.py += hand.vy * h;
      hand.amountV +=
        ((DRIFT.stiffness * (want - hand.amount) -
          DRIFT.damping * hand.amountV) /
          DRIFT.mass) *
        h;
      hand.amount += hand.amountV * h;
      sim.scrollV +=
        ((-GLIDE.stiffness * sim.scroll - GLIDE.damping * sim.scrollV) /
          GLIDE.mass) *
        h;
      sim.scroll += sim.scrollV * h;
      if (tear.row >= 0 && tear.hold <= 0) {
        tear.vel +=
          ((-SNAP.stiffness * tear.offset - SNAP.damping * tear.vel) /
            SNAP.mass) *
          h;
        tear.offset += tear.vel * h;
      }
    }
    if (tear.row >= 0) {
      moving = true;
      if (tear.hold > 0) tear.hold -= dt;
      else if (Math.abs(tear.offset) < 0.3 && Math.abs(tear.vel) < 6) {
        tear.row = -1;
        tear.offset = 0;
        tear.vel = 0;
      }
    }
    if (Math.abs(sim.scroll) > 0.05 || Math.abs(sim.scrollV) > 0.5)
      moving = true;
    else {
      sim.scroll = 0;
      sim.scrollV = 0;
    }
    const handMoving =
      Math.abs(hand.x - hand.px) + Math.abs(hand.y - hand.py) > 0.1 ||
      Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5;
    if (!handMoving) {
      hand.px = hand.x;
      hand.py = hand.y;
      hand.vx = 0;
      hand.vy = 0;
    }
    const arriving =
      Math.abs(want - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = want;
      hand.amountV = 0;
    }
    if ((handMoving && hand.amount > 0.001) || arriving) moving = true;

    // Pings: every cell the ring crosses this frame flares and re-rolls for
    // a beat before settling on its own glyph; blanks flicker and clear.
    const reachMax = Math.hypot(size.w, size.h) + 40;
    for (const ring of rings) {
      if (!ring.live) continue;
      moving = true;
      const from = ring.reach;
      const to = from + PING_SPEED * dt;
      ring.reach = to;
      const r0 = Math.max(0, Math.floor((ring.y - to - g.padY) / g.cellH));
      const r1 = Math.min(
        g.rows - 1,
        Math.ceil((ring.y + to - g.padY) / g.cellH),
      );
      for (let r = r0; r <= r1; r += 1) {
        const cy = g.padY + (r + 0.5) * g.cellH - ring.y;
        for (let col = 0; col < g.cols; col += 1) {
          const cx = g.padX + (col + 0.5) * g.cellW - ring.x;
          const d = Math.hypot(cx, cy);
          if (d < from || d >= to) continue;
          const k = r * g.cols + col;
          if ((g.mode[k] ?? 0) === MODE_TYPE) continue;
          const settled =
            g.mode[k] === MODE_ROLL ? (g.final[k] ?? 0) : (g.glyph[k] ?? 0);
          if (settled === 0 && rand() < 0.55) continue;
          // Blanks flicker only briefly, so the ring reads as a ring.
          roll(
            g,
            k,
            sim.t +
              (settled === 0 ? 0.04 + rand() * 0.05 : 0.07 + rand() * 0.1),
            settled,
          );
        }
      }
      if (to > reachMax) ring.live = false;
    }
    return moving;
  };

  /** Reduced motion: only the phosphor fades; nothing is written, nothing travels. */
  const fade = (dt: number): boolean => {
    const c = cfg;
    const g = grid;
    if (!c || !g) return false;
    const decay = Math.exp(-dt / clamp(c.decay, 0.1, 8));
    let glowing = false;
    for (let k = 0; k < g.energy.length; k += 1) {
      const e = g.energy[k] ?? 0;
      if (e > 0.004) {
        g.energy[k] = e * decay;
        glowing = true;
      } else g.energy[k] = 0;
    }
    return glowing;
  };

  const draw = () => {
    const c = cfg;
    const g = grid;
    if (!ctx || !c || !g || !visible.current || size.w < 1) return;
    const { dpr } = size;
    const still = !c.motionSafe;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(backdrop, 0, 0);
    const lines2 = clamp(c.scanlines, 0, 1);
    // The rolling band: a soft brighter stripe drifting down the tube.
    if (lines2 > 0 && !still) {
      const period = size.h + 120;
      const y = (((sim.t * 34) % period) - 60) * dpr;
      ctx.globalAlpha = lines2 * (paint.light ? 0.05 : 0.07);
      ctx.drawImage(
        band,
        0,
        0,
        2,
        band.height,
        0,
        y,
        canvas.width,
        band.height,
      );
    }
    const rest = paint.light ? REST_LIGHT : REST_DARK;
    const reach = clamp(c.radius, 12, 600);
    const inv = 1 / (reach * reach);
    const lamp = still
      ? hand.present && c.interactive
        ? clamp(c.pointerStrength, 0, 1)
        : 0
      : hand.amount;
    const hx = still ? hand.x : hand.px;
    const hy = still ? hand.y : hand.py;
    const blink =
      c.cursor && (still || c.paused || Math.floor(sim.t / 0.53) % 2 === 0);
    const sw = atlasW;
    const sh = atlasH;
    for (let r = 0; r < g.rows; r += 1) {
      const torn = r === tear.row;
      const baseY = g.padY + r * g.cellH + sim.scroll;
      if (baseY > size.h || baseY + g.cellH < 0) continue;
      const dy = Math.round(baseY * dpr);
      const shift = torn ? tear.offset : 0;
      const lift = still ? (g.lift[r] ?? 0) : 0;
      const ry = baseY + g.cellH / 2 - hy;
      for (let col = 0; col < g.cols; col += 1) {
        const k = r * g.cols + col;
        const gl = g.glyph[k] ?? 0;
        const ge = g.ghostE[k] ?? 0;
        if (gl === 0 && ge < 0.01) continue;
        const x = g.padX + col * g.cellW;
        const dx = Math.round((x + shift) * dpr);
        let boost = 0;
        if (lamp > 0.001) {
          const rx = x + g.cellW / 2 - hx;
          boost = lamp * Math.exp(-(rx * rx + ry * ry) * inv);
        }
        if (ge >= 0.01) {
          const gg = g.ghost[k] ?? 0;
          if (gg !== 0) {
            ctx.globalAlpha = ge * 0.5;
            ctx.drawImage(atlas, gg * sw, 0, sw, sh, dx, dy, sw, sh);
          }
        }
        if (gl === 0) continue;
        const e = g.energy[k] ?? 0;
        const flash = torn && tear.hold > 0 ? 0.25 : 0;
        ctx.globalAlpha = clamp(
          rest + (1 - rest) * e * 0.8 + boost * 0.9 + lift + flash,
          0,
          1,
        );
        ctx.drawImage(atlas, gl * sw, 0, sw, sh, dx, dy, sw, sh);
        const hot = e * 0.9 + boost * 1.5 + flash - 0.3;
        if (hot > 0.02) {
          ctx.globalAlpha = clamp(hot, 0, 1);
          ctx.drawImage(atlas, gl * sw, sh, sw, sh, dx, dy, sw, sh);
        }
      }
      if (torn && tear.hold > 0) {
        // The line's true place keeps a faint ghost while it is torn away.
        for (let col = 0; col < g.cols; col += 1) {
          const gl = g.glyph[r * g.cols + col] ?? 0;
          if (gl === 0) continue;
          ctx.globalAlpha = 0.16;
          ctx.drawImage(
            atlas,
            gl * sw,
            0,
            sw,
            sh,
            Math.round((g.padX + col * g.cellW) * dpr),
            dy,
            sw,
            sh,
          );
        }
      }
    }
    if (blink) {
      const cy = g.padY + sim.cursorRow * g.cellH + sim.scroll;
      const cx = g.padX + Math.min(g.cols - 1, sim.cursorCol) * g.cellW;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = paint.ink;
      ctx.fillRect(
        Math.round(cx * dpr),
        Math.round((cy + g.cellH * 0.18) * dpr),
        Math.round(g.cellW * 0.86 * dpr),
        Math.round(g.cellH * 0.64 * dpr),
      );
    }
    ctx.globalAlpha = 1;
    // The halo: the frame at a quarter size, added back soft.
    const glow = clamp(c.glow, 0, 1);
    const hc = halo.getContext("2d");
    if (glow > 0 && hc) {
      hc.globalCompositeOperation = "copy";
      hc.imageSmoothingEnabled = true;
      hc.drawImage(canvas, 0, 0, halo.width, halo.height);
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = paint.light ? "multiply" : "lighter";
      ctx.globalAlpha = glow * (paint.light ? 0.35 : 0.5);
      ctx.drawImage(halo, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
    }
    if (lines2 > 0 && lines) {
      ctx.globalAlpha = lines2 * (paint.light ? 0.07 : 0.22);
      ctx.fillStyle = lines;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const calmNow = () =>
    tear.row < 0 &&
    !rings.some((r) => r.live) &&
    sim.scroll === 0 &&
    hand.px === hand.x &&
    hand.py === hand.y &&
    (hand.amount === 0 ||
      hand.amount ===
        (hand.present ? clamp(cfg?.pointerStrength ?? 0, 0, 1) : 0));

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !grid) {
      last = 0;
      return;
    }
    // Output and phosphor alone run at thirty frames a second; a tear, a
    // ping, a scroll or the hand get every frame.
    if (calmNow() && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : fade(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !grid)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const colourOf = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "rgb(0, 0, 0)";
    };
    paint.screen = read(colourOf(0));
    paint.light = luma(paint.screen) > 0.5;
    paint.ink = css(read(colourOf(paint.light ? 2 : 1)));
    paint.hot = css(read(colourOf(paint.light ? 4 : 3)));
    paint.shade = paint.light ? css(read(colourOf(2))) : "rgb(0, 0, 0)";
    const mono = kids[5];
    if (mono && ctx) {
      // The grid assumes every glyph is one cell wide. A host whose mono
      // face did not load, or is not monospaced, gets the system's.
      const family = getComputedStyle(mono).fontFamily || SYSTEM_MONO;
      ctx.font = `20px ${family}`;
      const narrow = ctx.measureText("i").width;
      const wide = ctx.measureText("W").width;
      paint.family = Math.abs(wide - narrow) < 0.5 ? family : SYSTEM_MONO;
    }
    buildBackdrop();
    buildAtlas();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    if (size.w === w && size.h === h && size.dpr === dpr && grid) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    buildBackdrop();
    lay();
    draw();
    kick();
  };

  // The mono face may arrive after the first paint; the atlas is redrawn
  // with it once it has.
  void document.fonts?.ready.then(() => {
    if (disposed || !grid) return;
    readColours();
    lay();
    draw();
  });

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        layAlphabet();
        readColours();
        resize();
        return;
      }
      if (was.glyphs !== next.glyphs) {
        layAlphabet();
        lay();
      } else if (
        was.seed !== next.seed ||
        was.fontSize !== next.fontSize ||
        was.density !== next.density
      ) {
        lay();
      }
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (was.paintKey !== next.paintKey) readColours();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) {
        hand.px = hand.x;
        hand.py = hand.y;
        hand.amount = 0;
        tear.row = -1;
        sim.scroll = 0;
        for (const r of rings) r.live = false;
        const g = grid;
        if (g) {
          for (let k = 0; k < g.mode.length; k += 1) {
            if ((g.mode[k] ?? 0) !== MODE_IDLE) {
              g.glyph[k] = g.final[k] ?? 0;
              g.mode[k] = MODE_IDLE;
            }
          }
          g.energy.fill(0);
          g.ghostE.fill(0);
        }
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
      const c = cfg;
      if (!hand.present || hand.amount < 0.01) {
        hand.px = x;
        hand.py = y;
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (c && !c.motionSafe) {
        // Reduced motion: the light lands exactly where the hand is.
        hand.px = x;
        hand.py = y;
        draw();
        return;
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) {
        draw();
        return;
      }
      kick();
    },
    ping(x, y) {
      const c = cfg;
      const g = grid;
      if (!c || !g || !c.interactive) return;
      c.onPing();
      if (!c.motionSafe) {
        // Nothing travels: the glyphs round the press light up where they
        // are and fade back.
        const reach = clamp(c.radius, 12, 600) * 1.4;
        for (let r = 0; r < g.rows; r += 1) {
          for (let col = 0; col < g.cols; col += 1) {
            const d = Math.hypot(
              g.padX + (col + 0.5) * g.cellW - x,
              g.padY + (r + 0.5) * g.cellH - y,
            );
            if (d < reach) g.energy[r * g.cols + col] = 1 - d / reach;
          }
        }
        draw();
        kick();
        return;
      }
      const ring = rings.find((r) => !r.live) ?? rings[0];
      if (!ring) return;
      ring.x = x;
      ring.y = y;
      ring.reach = 0;
      ring.live = true;
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
 * A background that is a terminal screen humming with glyphs, with the
 * content on top in its own layer. The screen holds real-looking console
 * output — addresses and grouped bytes, octets, words and values, or meters,
 * in the chosen glyph set, ragged at the right — and it updates in bursts:
 * lines re-roll and settle left to right on new output, value fields tick,
 * and now and then the screen feeds a line, scrolling up a row on glide while
 * the new line types in behind a blinking cursor. Every written glyph flares
 * and decays back through the phosphor, the glyph it replaced lingering as a
 * fading ghost; a fine line screen and a slow rolling band sit over the
 * tube, and once in a while a line tears sideways and springs back on snap.
 *
 * The pointer is a lamp: glyphs near it light toward a whitened core, its
 * place following on glide and its presence on drift. A press pings the
 * screen — a ring runs out from it and every glyph it crosses flares and
 * re-rolls for a beat before settling on its own. Keyboard focus on a control
 * inside lights the glyphs round it and pings from it. Canvas 2D through a
 * glyph atlas, one blit per glyph, thirty frames a second while only the
 * output runs; only on screen in a visible page. Under reduced motion the
 * screen is still, the lamp lands where the hand is and a press lights the
 * glyphs round it without anything travelling.
 */
export function RelayTerminal({
  children,
  rate = 1.25,
  glyphs = "hex",
  color = "green",
  fontSize = 12,
  density = 0.6,
  decay = 1.4,
  glitch = 0.4,
  scanlines = 0.5,
  glow = 0.5,
  cursor = true,
  interactive = true,
  pointerStrength = 0.7,
  radius = 90,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onPing,
  className,
}: RelayTerminalProps) {
  const motionSafe = useMotionSafe();
  const phosphor = Object.prototype.hasOwnProperty.call(PHOSPHORS, color)
    ? PHOSPHORS[color as RelayTerminalColor]
    : String(color);
  const paints = React.useMemo(
    () => [
      `color-mix(in oklab, var(--background) 92%, ${phosphor})`,
      `oklch(from ${phosphor} 0.84 c h)`,
      `oklch(from ${phosphor} 0.44 calc(c * 1.1) h)`,
      `color-mix(in oklab, oklch(from ${phosphor} 0.9 c h) 55%, white)`,
      `oklch(from ${phosphor} 0.3 calc(c * 1.2) h)`,
    ],
    [phosphor],
  );
  const paintKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onPing });

  const config: Config = {
    rate,
    glyphs,
    paintKey,
    fontSize,
    density,
    decay,
    glitch,
    scanlines,
    glow,
    cursor,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onPing: () => report.current.onPing?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onPing };
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
      engine.current?.ping(at.x, at.y);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside is the lamp held over that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.ping(at.x, at.y);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  const fs = clamp(fontSize, 8, 32);
  const lineHeight = Math.round(fs * 1.5);

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
        // A sideways drag carries the lamp on touch; an upright one scrolls.
        "group/relay-terminal relative isolate h-full w-full touch-pan-y overflow-clip",
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
        glyphs={glyphs}
        density={density}
        seed={seed}
        fontSize={fs}
        lineHeight={lineHeight}
        ink={`color-mix(in oklab, ${paints[2]} 55%, ${paints[1]})`}
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
        <span className="font-mono" />
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still screen for the server render and the first paint: the
 * same seeded output as text in the mono face, dimmed to the phosphor's rest,
 * under a faint line screen.
 */
function StandIn({
  glyphs,
  density,
  seed,
  fontSize,
  lineHeight,
  ink,
}: {
  glyphs: string;
  density: number;
  seed: number;
  fontSize: number;
  lineHeight: number;
  ink: string;
}) {
  const text = React.useMemo(() => {
    const rand = lcg(seed * 31 + 7);
    const { set } = charsOf(glyphs);
    const rows: string[] = [];
    for (let r = 0; r < 32; r += 1) {
      rows.push(composeLine(rand, glyphs, set, 150, density).join(""));
    }
    return rows.join("\n");
  }, [glyphs, density, seed]);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-opacity duration-400 select-none group-data-live/relay-terminal:opacity-0"
      style={{
        backgroundImage:
          "repeating-linear-gradient(180deg, transparent 0 2px, color-mix(in oklab, var(--background) 90%, black) 2px 3px)",
      }}
    >
      <pre
        className="m-0 overflow-hidden font-mono whitespace-pre opacity-60"
        style={{
          color: ink,
          fontSize,
          lineHeight: `${lineHeight}px`,
          padding: `${Math.round(lineHeight * 0.4)}px ${Math.round(fontSize * 0.75)}px`,
        }}
      >
        {text}
      </pre>
    </div>
  );
}
