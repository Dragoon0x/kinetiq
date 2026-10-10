"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LetterFieldWords = "studio" | "garden" | "harbor" | "none";
export type LetterFieldColor = "ink" | "accent" | "signal" | "ember";

export type LetterFieldProps = {
  /** The content on top of the letters: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The field's clock, 0 (held) to 2: how fast the waves of change travel and how often words surface. @default 1 */
  rate?: number;
  /** What surfaces: a named set of words, your own list, or "none" for letters only. @default "studio" */
  words?: LetterFieldWords | readonly string[];
  /** The ink: a named token colour or any CSS colour. Idle letters are this, sunk toward the page; words are it at full strength. @default "ink" */
  color?: LetterFieldColor | (string & {});
  /** Letter size, px (10 to 32). @default 15 */
  size?: number;
  /** The inherited sans or the mono face. @default "sans" */
  font?: "sans" | "mono";
  /** The letters the field draws from. @default "ABCDEFGHIJKLMNOPQRSTUVWXYZ" */
  glyphs?: string;
  /** How far idle letters sink into the page, 0 (as strong as words) to 1 (barely there). @default 0.66 */
  dim?: number;
  /** How long a formed word stays readable, ms of field time. @default 2400 */
  hold?: number;
  /** Words readable at once, 0 to 4. @default 2 */
  maxWords?: number;
  /** Words only surface where nothing opaque or textual in your content covers them. @default true */
  avoidCovered?: boolean;
  /** The pointer and keyboard focus calm the letters near them. @default true */
  interactive?: boolean;
  /** How still the letters under the hand go, 0 to 1. @default 0.85 */
  pointerStrength?: number;
  /** How far the hand's calm reaches, px. @default 120 */
  radius?: number;
  /** Hold the field and its words where they are. @default false */
  paused?: boolean;
  /** Seeds the letters, the waves and where words land. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires with each word once it has fully formed. */
  onWord?: (word: string) => void;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) calming the field. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const WORD_SETS: Record<
  Exclude<LetterFieldWords, "none">,
  readonly string[]
> = {
  studio: [
    "TYPE",
    "GRID",
    "KERN",
    "FORM",
    "SERIF",
    "PROOF",
    "GLYPH",
    "LEAD",
    "SPACE",
    "MARGIN",
    "SCALE",
    "DRAFT",
    "INK",
    "LINE",
  ],
  garden: [
    "FERN",
    "MOSS",
    "SEED",
    "BLOOM",
    "ROOT",
    "LEAF",
    "RAIN",
    "SOIL",
    "PETAL",
    "STEM",
    "THYME",
    "SAGE",
  ],
  harbor: [
    "TIDE",
    "KEEL",
    "MAST",
    "BUOY",
    "SAIL",
    "REEF",
    "PIER",
    "GULL",
    "ROPE",
    "WAKE",
    "HULL",
    "DOCK",
  ],
};

/** Text colours, not pigments: letters need the contrast each theme tunes. */
const COLORS: Record<LetterFieldColor, string> = {
  ink: "var(--foreground)",
  accent: "var(--accent-bright)",
  signal: "var(--signal)",
  ember: "color-mix(in oklab, var(--danger) 55%, var(--warn))",
};

const DEFAULT_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** One letter rolls over in this long, s. */
const ROLL = 0.22;
/** A fresh letter glints this long, s. */
const GLINT = 0.7;
/** A released word letter loses its weight before it rolls away, s. */
const RELEASE = durations.base * 0.6;
/** Reduced motion: a word stays this long before the next fades in, s. */
const STILL_HOLD = 5;
/** Reduced motion: the crossfade, s. */
const STILL_FADE = durations.slow;
/** The reading lamp under the hand, as extra alpha. */
const LAMP = 0.2;
const STEP = 1 / 120;
const LAND = springs.recoil;
const GLIDE = springs.glide;
const DRIFT = springs.drift;
const SLOTS = 4;

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

/** Seeded value noise on a lattice, smooth between points. */
function valueNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

/** The elements a backdrop leaves to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Config = {
  rate: number;
  words: readonly string[];
  size: number;
  font: "sans" | "mono";
  glyphs: string;
  dim: number;
  hold: number;
  maxWords: number;
  avoidCovered: boolean;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  colorKey: string;
  motionSafe: boolean;
  onWord: (word: string) => void;
  onActive: (active: boolean) => void;
};

type Word = {
  text: string;
  cells: number[];
  glyphs: number[];
  /** 0 forming, 1 held, 2 dissolving. */
  phase: 0 | 1 | 2;
  /** Seconds into the phase (field time while held). */
  t: number;
  started: number;
  order: number[];
  released: number;
};

type Grid = {
  cols: number;
  rows: number;
  /** CSS px. */
  cw: number;
  ch: number;
  x0: number;
  y0: number;
  /** Device px, whole numbers, so every glyph lands on the pixel grid. */
  cwD: number;
  chD: number;
  x0D: number;
  y0D: number;
  dpr: number;
  w: number;
  h: number;
  cur: Uint16Array;
  prev: Uint16Array;
  roll: Float32Array;
  glint: Float32Array;
  acc: Float32Array;
  wordOf: Int8Array;
  liftR: Float32Array;
  liftDir: Int8Array;
  drop: Float32Array;
  dropV: Float32Array;
  dropOn: Uint8Array;
  delay: Float32Array;
  lamp: Float32Array;
  p1: Float32Array;
  p2: Float32Array;
  nz: Float32Array;
  dirty: Uint8Array;
};

type Atlas = {
  image: HTMLCanvasElement;
  index: Map<string, number>;
  /** Atlas indices of the field's own letters. */
  field: Uint16Array;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  refont: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carrier: HTMLElement,
  layer: HTMLElement,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let grid: Grid | null = null;
  let atlas: Atlas | null = null;
  let ink = "rgb(0, 0, 0)";
  let family = "sans-serif";
  let frame = 0;
  let timer = 0;
  let last = 0;
  /** Reduced motion: when the loop last went quiet, so a word's hold keeps counting. */
  let idleSince = 0;
  let disposed = false;
  let active = false;
  let full = true;
  let rand = lcg(1);
  /** Field time, s: everything the clock drives. */
  let clock = 0;
  let wordClock = 0.6;
  let lastWord = -1;
  const slots: (Word | null)[] = [null, null, null, null];
  const hand = {
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    want: 0,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const fieldAlpha = () => 0.1 + (1 - clamp(cfg?.dim ?? 0.66, 0, 1)) * 0.82;

  /** The glyphs, drawn once into a strip per weight: regular for the field, semibold for words. */
  const buildAtlas = () => {
    const c = cfg;
    const g = grid;
    if (!c || !g) return;
    const chars = new Set<string>(Array.from(c.glyphs || DEFAULT_GLYPHS));
    for (const word of c.words)
      for (const ch of Array.from(word)) chars.add(ch);
    chars.delete(" ");
    const list = Array.from(chars);
    const image = atlas?.image ?? document.createElement("canvas");
    image.width = Math.max(1, list.length * g.cwD);
    image.height = g.chD * 2;
    const a = image.getContext("2d");
    if (!a) return;
    const px = Math.round(g.dpr * c.size);
    a.clearRect(0, 0, image.width, image.height);
    a.fillStyle = ink;
    a.textAlign = "center";
    a.textBaseline = "alphabetic";
    const index = new Map<string, number>();
    for (let row = 0; row < 2; row += 1) {
      a.font = `${row === 0 ? 400 : 600} ${px}px ${family}`;
      const cap = a.measureText("H").actualBoundingBoxAscent || px * 0.7;
      const base = Math.round((g.chD + cap) / 2);
      list.forEach((ch, i) => {
        if (row === 0) index.set(ch, i);
        a.save();
        a.beginPath();
        a.rect(i * g.cwD, row * g.chD, g.cwD, g.chD);
        a.clip();
        a.fillText(ch, i * g.cwD + g.cwD / 2, row * g.chD + base);
        a.restore();
      });
    }
    const field = Array.from(c.glyphs || DEFAULT_GLYPHS)
      .filter((ch) => ch !== " ")
      .map((ch) => index.get(ch) ?? 0);
    atlas = {
      image,
      index,
      field: Uint16Array.from(field.length ? field : [0]),
    };
    full = true;
  };

  const randomGlyph = () => {
    const f = atlas?.field;
    if (!f || f.length === 0) return 0;
    return f[Math.floor(rand() * f.length)] ?? 0;
  };

  /** A fresh grid for the box, the size and the face. */
  const layout = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const size = clamp(c.size, 10, 32);
    // The cell is as wide as the widest semibold letter, so a W never
    // spills into its neighbour.
    let widest = size * (c.font === "mono" ? 0.62 : 0.84);
    if (ctx) {
      ctx.font = `600 ${size}px ${family}`;
      for (const ch of Array.from(c.glyphs || DEFAULT_GLYPHS)) {
        widest = Math.max(widest, ctx.measureText(ch).width);
      }
    }
    const cwD = Math.max(4, Math.round((widest + size * 0.28) * dpr));
    const chD = Math.max(6, Math.round(size * 1.62 * dpr));
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    canvas.width = W;
    canvas.height = H;
    const cols = Math.max(1, Math.ceil(W / cwD));
    const rows = Math.max(1, Math.ceil(H / chD));
    const x0D = Math.floor((W - cols * cwD) / 2);
    const y0D = Math.floor((H - rows * chD) / 2);
    const n = cols * rows;
    rand = lcg(c.seed * 31 + 7);
    const noise = valueNoise(Math.imul(Math.round(c.seed) | 0, 2246822519) | 0);
    const a1 = (0.3 + rand() * 0.5) * Math.PI;
    const a2 = a1 + Math.PI * (0.45 + rand() * 0.2);
    const k1 = (Math.PI * 2) / 520;
    const k2 = (Math.PI * 2) / 380;
    const g: Grid = {
      cols,
      rows,
      cw: cwD / dpr,
      ch: chD / dpr,
      x0: x0D / dpr,
      y0: y0D / dpr,
      cwD,
      chD,
      x0D,
      y0D,
      dpr,
      w,
      h,
      cur: new Uint16Array(n),
      prev: new Uint16Array(n),
      roll: new Float32Array(n).fill(1),
      glint: new Float32Array(n),
      acc: new Float32Array(n),
      wordOf: new Int8Array(n).fill(-1),
      liftR: new Float32Array(n),
      liftDir: new Int8Array(n),
      drop: new Float32Array(n),
      dropV: new Float32Array(n),
      dropOn: new Uint8Array(n),
      delay: new Float32Array(n).fill(-1),
      lamp: new Float32Array(n),
      p1: new Float32Array(n),
      p2: new Float32Array(n),
      nz: new Float32Array(n),
      dirty: new Uint8Array(n).fill(1),
    };
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = j * cols + i;
        const x = g.x0 + (i + 0.5) * g.cw;
        const y = g.y0 + (j + 0.5) * g.ch;
        g.p1[k] = (x * Math.cos(a1) + y * Math.sin(a1)) * k1;
        g.p2[k] = (x * Math.cos(a2) + y * Math.sin(a2)) * k2;
        g.nz[k] = (noise(x / 170, y / 170) - 0.5) * 4.4;
        g.acc[k] = rand();
      }
    }
    grid = g;
    for (let s = 0; s < SLOTS; s += 1) slots[s] = null;
    buildAtlas();
    for (let k = 0; k < n; k += 1) {
      const glyph = randomGlyph();
      g.cur[k] = glyph;
      g.prev[k] = glyph;
    }
    wordClock = c.motionSafe ? 0.6 : 0;
    full = true;
  };

  const readColours = () => {
    const style = getComputedStyle(carrier);
    ink = style.color || ink;
    family = getComputedStyle(canvas).fontFamily || family;
    buildAtlas();
  };

  /** The rects, relative to the root, that a word must not surface under. */
  const covers = (): DOMRect[] => {
    const out: DOMRect[] = [];
    const base = root.getBoundingClientRect();
    for (const el of layer.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.width >= base.width * 0.98 && r.height >= base.height * 0.98)
        continue;
      const style = getComputedStyle(el);
      let covering =
        style.backdropFilter !== "none" && style.backdropFilter !== "";
      if (!covering) {
        const bg = style.backgroundColor;
        covering =
          bg !== "transparent" &&
          !/rgba\(0, 0, 0, 0\)/.test(bg) &&
          !/\/\s*0(\.0+)?\s*\)/.test(bg);
      }
      if (!covering) {
        for (const node of el.childNodes) {
          if (node.nodeType === 3 && node.textContent?.trim()) {
            covering = true;
            break;
          }
        }
      }
      if (covering) {
        out.push(
          new DOMRect(r.left - base.left, r.top - base.top, r.width, r.height),
        );
      }
    }
    return out;
  };

  const startRoll = (k: number, to: number) => {
    const g = grid;
    if (!g) return;
    g.prev[k] = g.cur[k] ?? 0;
    g.cur[k] = to;
    if (cfg?.motionSafe) {
      g.roll[k] = 0;
      g.glint[k] = 1;
    } else {
      g.roll[k] = 1;
    }
    g.dirty[k] = 1;
  };

  const spawn = (): boolean => {
    const c = cfg;
    const g = grid;
    const at = atlas;
    if (!c || !g || !at) return false;
    const list = c.words.filter((w) => {
      const n = Array.from(w).length;
      return n > 0 && n <= g.cols - 2;
    });
    if (list.length === 0) return false;
    let pick = Math.floor(rand() * list.length);
    if (list.length > 1 && pick === lastWord) pick = (pick + 1) % list.length;
    const text = list[pick] ?? "";
    const letters = Array.from(text);
    const len = letters.length;
    const blocked = c.avoidCovered ? covers() : [];
    // Whole cells only: a word never sits in a clipped edge cell.
    const iMin = g.x0 < 0 ? 1 : 0;
    const iMax = g.cols - len - (g.x0 + g.cols * g.cw > g.w ? 1 : 0);
    const jMin = g.y0 < 0 ? 1 : 0;
    const jMax = g.rows - 1 - (g.y0 + g.rows * g.ch > g.h ? 1 : 0);
    if (iMax < iMin || jMax < jMin) return false;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const i = iMin + Math.floor(rand() * (iMax - iMin + 1));
      const j = jMin + Math.floor(rand() * (jMax - jMin + 1));
      let free = true;
      for (
        let jj = Math.max(0, j - 1);
        jj <= Math.min(g.rows - 1, j + 1);
        jj += 1
      ) {
        for (
          let ii = Math.max(0, i - 1);
          ii <= Math.min(g.cols - 1, i + len);
          ii += 1
        ) {
          if ((g.wordOf[jj * g.cols + ii] ?? -1) >= 0) free = false;
        }
      }
      if (!free) continue;
      const left = g.x0 + i * g.cw - 4;
      const top = g.y0 + j * g.ch - 2;
      const right = left + len * g.cw + 8;
      const bottom = top + g.ch + 4;
      if (
        blocked.some(
          (r) =>
            left < r.right &&
            right > r.left &&
            top < r.bottom &&
            bottom > r.top,
        )
      )
        continue;
      const slot = slots.findIndex((s) => s === null);
      if (slot < 0) return false;
      const cells: number[] = [];
      const glyphs: number[] = [];
      for (let n = 0; n < len; n += 1) {
        const k = j * g.cols + i + n;
        cells.push(k);
        glyphs.push(at.index.get(letters[n] ?? "") ?? 0);
        g.wordOf[k] = slot;
        g.delay[k] = -1;
      }
      const order = cells.map((_, n) => n);
      for (let n = order.length - 1; n > 0; n -= 1) {
        const m = Math.floor(rand() * (n + 1));
        const tmp = order[n] ?? 0;
        order[n] = order[m] ?? 0;
        order[m] = tmp;
      }
      slots[slot] = {
        text,
        cells,
        glyphs,
        phase: 0,
        t: 0,
        started: 0,
        order,
        released: 0,
      };
      lastWord = pick;
      return true;
    }
    return false;
  };

  const liveWords = () => slots.reduce((n, s) => n + (s ? 1 : 0), 0);

  /** Lets go of one word letter: it loses its weight, then rolls away. */
  const release = (k: number) => {
    const g = grid;
    if (!g) return;
    g.wordOf[k] = -1;
    g.liftDir[k] = -1;
    g.dropOn[k] = 0;
    g.drop[k] = 0;
    g.dropV[k] = 0;
    g.delay[k] = cfg?.motionSafe ? RELEASE : STILL_FADE;
    g.acc[k] = rand() * 0.4;
    g.dirty[k] = 1;
  };

  /** Advances the words. Returns whether any is mid-change. */
  const stepWords = (dt: number, fieldDt: number): boolean => {
    const c = cfg;
    const g = grid;
    if (!c || !g) return false;
    const still = !c.motionSafe;
    let busy = false;
    const limit = still ? 1 : clamp(Math.round(c.maxWords), 0, SLOTS);
    for (let s = 0; s < SLOTS; s += 1) {
      const w = slots[s];
      if (!w) continue;
      const len = w.cells.length;
      if (w.phase === 0) {
        busy = true;
        w.t += dt;
        const gap = still ? 0 : cascade(len);
        while (w.started < len && w.t >= w.started * gap) {
          const k = w.cells[w.started] ?? 0;
          const glyph = w.glyphs[w.started] ?? 0;
          if (still) {
            g.prev[k] = glyph;
            g.cur[k] = glyph;
            g.roll[k] = 1;
            g.liftDir[k] = 1;
            g.dirty[k] = 1;
          } else {
            startRoll(k, glyph);
            g.glint[k] = 0.6;
          }
          w.started += 1;
        }
        let formed = w.started === len;
        for (const k of w.cells) if ((g.liftR[k] ?? 0) < 1) formed = false;
        if (formed) {
          w.phase = 1;
          w.t = 0;
          c.onWord(w.text);
        }
      } else if (w.phase === 1) {
        // The hand holds a word it rests on: its timer slows with the calm.
        const mid = w.cells[Math.floor(len / 2)] ?? 0;
        const holdFor = still ? STILL_HOLD : clamp(c.hold, 200, 60000) / 1000;
        w.t += (still ? dt : fieldDt) * calmAt(mid);
        if (w.t >= holdFor || s >= limit) {
          w.phase = 2;
          w.t = 0;
          if (still) {
            for (const k of w.cells) release(k);
            w.released = len;
          }
        }
      }
      if (w.phase === 2) {
        busy = true;
        w.t += dt;
        const gap = cascade(len) * 1.4;
        while (w.released < len && w.t >= w.released * gap) {
          const k = w.cells[w.order[w.released] ?? 0] ?? 0;
          release(k);
          w.released += 1;
        }
        if (w.released === len) slots[s] = null;
      }
    }
    // A new word: on the field's clock, or in still steps under reduced
    // motion, where the next fades in as the last one fades out.
    if (still) {
      if (liveWords() === 0) spawn();
    } else if (limit > 0) {
      wordClock -= fieldDt;
      if (wordClock <= 0) {
        if (liveWords() < limit) spawn();
        wordClock = 2.4 * (0.75 + rand() * 0.5);
      }
    }
    return busy;
  };

  /** How much of the field's clock reaches a cell: less near the hand. */
  const calmAt = (k: number): number => {
    const c = cfg;
    const g = grid;
    if (!c || !g || hand.amount < 0.001) return 1;
    const i = k % g.cols;
    const j = (k - i) / g.cols;
    const dx = g.x0 + (i + 0.5) * g.cw - hand.x;
    const dy = g.y0 + (j + 0.5) * g.ch - hand.y;
    const r = Math.max(20, c.radius);
    return (
      1 -
      clamp(c.pointerStrength, 0, 1) *
        hand.amount *
        Math.exp(-(dx * dx + dy * dy) / (r * r))
    );
  };

  /** Advances everything by dt. Returns whether anything still changes. */
  const step = (dt: number): boolean => {
    const c = cfg;
    const g = grid;
    if (!c || !g) return false;
    const still = !c.motionSafe;
    const running = !still && !c.paused && c.rate > 0;
    const fieldDt = running ? dt * clamp(c.rate, 0, 2) : 0;
    clock += fieldDt;
    let busy = running;

    // The hand: place on glide, presence on drift.
    const want = hand.want * (c.interactive ? 1 : 0);
    if (still) {
      hand.x = hand.tx;
      hand.y = hand.ty;
      hand.amount = want;
      hand.vx = 0;
      hand.vy = 0;
      hand.amountV = 0;
    } else {
      const steps = Math.max(1, Math.ceil(dt / STEP));
      const h = dt / steps;
      for (let s = 0; s < steps; s += 1) {
        hand.vx +=
          ((GLIDE.stiffness * (hand.tx - hand.x) - GLIDE.damping * hand.vx) /
            GLIDE.mass) *
          h;
        hand.vy +=
          ((GLIDE.stiffness * (hand.ty - hand.y) - GLIDE.damping * hand.vy) /
            GLIDE.mass) *
          h;
        hand.x += hand.vx * h;
        hand.y += hand.vy * h;
        hand.amountV +=
          ((DRIFT.stiffness * (want - hand.amount) -
            DRIFT.damping * hand.amountV) /
            DRIFT.mass) *
          h;
        hand.amount += hand.amountV * h;
      }
      const moving =
        Math.abs(hand.tx - hand.x) + Math.abs(hand.ty - hand.y) > 0.1 ||
        Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5;
      if (!moving) {
        hand.x = hand.tx;
        hand.y = hand.ty;
        hand.vx = 0;
        hand.vy = 0;
      }
      const arriving =
        Math.abs(want - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
      if (!arriving) {
        hand.amount = want;
        hand.amountV = 0;
      }
      if ((moving && hand.amount > 0.001) || arriving) busy = true;
    }

    if (stepWords(dt, fieldDt)) busy = true;

    const { cols, rows, x0, y0, cw, ch } = g;
    const strength = clamp(c.pointerStrength, 0, 1) * hand.amount;
    const r = Math.max(20, c.radius);
    const inv = 1 / (r * r);
    const w1 = (Math.PI * 2) / 7.5;
    const w2 = (Math.PI * 2) / 11;
    const t1 = clock * w1;
    const t2 = clock * w2;
    const landSteps = Math.max(1, Math.ceil(dt / STEP));
    const lh = dt / landSteps;
    const liftUp = dt / (still ? STILL_FADE : durations.base);
    const liftDown = dt / (still ? STILL_FADE : RELEASE);
    for (let j = 0; j < rows; j += 1) {
      const dy = y0 + (j + 0.5) * ch - hand.y;
      for (let i = 0; i < cols; i += 1) {
        const k = j * cols + i;
        let g2 = 0;
        if (strength > 0.001) {
          const dx = x0 + (i + 0.5) * cw - hand.x;
          g2 = Math.exp(-(dx * dx + dy * dy) * inv);
        }
        const lamp = LAMP * hand.amount * g2;
        if (Math.abs(lamp - (g.lamp[k] ?? 0)) > 0.004) {
          g.lamp[k] = lamp;
          g.dirty[k] = 1;
        }
        const inWord = (g.wordOf[k] ?? -1) >= 0;
        if (
          running &&
          !inWord &&
          (g.delay[k] ?? -1) < 0 &&
          (g.roll[k] ?? 1) >= 1
        ) {
          const c1 = Math.max(
            0,
            Math.sin((g.p1[k] ?? 0) - t1 + (g.nz[k] ?? 0)),
          );
          const c2 = Math.max(
            0,
            Math.sin((g.p2[k] ?? 0) + t2 - (g.nz[k] ?? 0)),
          );
          const c1s = c1 * c1 * c1 * c1;
          const c2s = c2 * c2 * c2 * c2;
          const crest = c1s * c1s + c2s * c2s;
          const a =
            (g.acc[k] ?? 0) +
            fieldDt * (0.005 + 0.62 * crest) * (1 - strength * g2);
          if (a >= 1) {
            g.acc[k] = a - 1;
            startRoll(k, randomGlyph());
          } else {
            g.acc[k] = a;
          }
        }
        const d = g.delay[k] ?? -1;
        if (d >= 0) {
          busy = true;
          const left = d - dt;
          if (left <= 0) {
            g.delay[k] = -1;
            const to = randomGlyph();
            if (still) {
              g.prev[k] = to;
              g.cur[k] = to;
              g.dirty[k] = 1;
            } else {
              startRoll(k, to);
              g.glint[k] = 0.4;
            }
          } else {
            g.delay[k] = left;
          }
        }
        const roll = g.roll[k] ?? 1;
        if (roll < 1) {
          busy = true;
          const next = Math.min(1, roll + dt / ROLL);
          g.roll[k] = next;
          g.dirty[k] = 1;
          if (next >= 1 && inWord) {
            // The word letter has arrived: it lands, and takes its weight.
            g.liftDir[k] = 1;
            g.drop[k] = -distances.nudge;
            g.dropV[k] = 0;
            g.dropOn[k] = 1;
          }
        }
        const glint = g.glint[k] ?? 0;
        if (glint > 0) {
          busy = true;
          g.glint[k] = Math.max(0, glint - dt / GLINT);
          g.dirty[k] = 1;
        }
        const dir = g.liftDir[k] ?? 0;
        if (dir !== 0) {
          busy = true;
          const lr = (g.liftR[k] ?? 0) + (dir > 0 ? liftUp : -liftDown);
          if (lr >= 1) {
            g.liftR[k] = 1;
            g.liftDir[k] = 0;
          } else if (lr <= 0) {
            g.liftR[k] = 0;
            g.liftDir[k] = 0;
          } else {
            g.liftR[k] = lr;
          }
          g.dirty[k] = 1;
        }
        if (g.dropOn[k]) {
          busy = true;
          let x = g.drop[k] ?? 0;
          let v = g.dropV[k] ?? 0;
          for (let s = 0; s < landSteps; s += 1) {
            v += ((-LAND.stiffness * x - LAND.damping * v) / LAND.mass) * lh;
            x += v * lh;
          }
          if (Math.abs(x) < 0.02 && Math.abs(v) < 0.5) {
            x = 0;
            v = 0;
            g.dropOn[k] = 0;
          }
          g.drop[k] = x;
          g.dropV[k] = v;
          g.dirty[k] = 1;
        }
      }
    }
    return busy;
  };

  const draw = () => {
    const c = cfg;
    const g = grid;
    const at = atlas;
    if (!c || !g || !at || !ctx || !visible.current) return;
    const { cols, rows, cwD, chD, x0D, y0D } = g;
    const base = fieldAlpha();
    const img = at.image;
    if (full) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      g.dirty.fill(1);
      full = false;
    }
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = j * cols + i;
        if (!g.dirty[k]) continue;
        g.dirty[k] = 0;
        const X = x0D + i * cwD;
        const Y = y0D + j * chD;
        ctx.clearRect(X, Y, cwD, chD);
        const lr = g.liftR[k] ?? 0;
        const lift =
          (g.liftDir[k] ?? 0) < 0
            ? 1 - (1 - lr) * (1 - lr)
            : 1 - Math.pow(1 - lr, 3);
        const glint = g.glint[k] ?? 0;
        const a = Math.min(1, base + (g.lamp[k] ?? 0) + glint * glint * 0.28);
        const sx = (g.cur[k] ?? 0) * cwD;
        const roll = g.roll[k] ?? 1;
        if (roll < 1) {
          const cut = Math.round(easeInOut(roll) * chD);
          ctx.globalAlpha = a;
          if (chD - cut > 0) {
            ctx.drawImage(
              img,
              (g.prev[k] ?? 0) * cwD,
              cut,
              cwD,
              chD - cut,
              X,
              Y,
              cwD,
              chD - cut,
            );
          }
          if (cut > 0) {
            ctx.drawImage(img, sx, 0, cwD, cut, X, Y + chD - cut, cwD, cut);
          }
          continue;
        }
        const yOff = Math.round((g.drop[k] ?? 0) * g.dpr * 4) / 4;
        const fa = a * (1 - lift);
        if (fa > 0.003) {
          ctx.globalAlpha = fa;
          ctx.drawImage(img, sx, 0, cwD, chD, X, Y + yOff, cwD, chD);
        }
        if (lift > 0.003) {
          ctx.globalAlpha = lift;
          ctx.drawImage(img, sx, chD, cwD, chD, X, Y + yOff, cwD, chD);
        }
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !grid || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!c.motionSafe && idleSince) {
      // Time spent quiet still counts toward a held word.
      const quiet = Math.max(0, (now - idleSince) / 1000);
      for (const w of slots) if (w && w.phase === 1) w.t += quiet;
    }
    idleSince = 0;
    const busy = step(dt);
    draw();
    if (busy) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    last = 0;
    // Reduced motion: the next crossfade is a timer, not a loop.
    if (!c.motionSafe) {
      idleSince = now;
      schedule();
    }
  };

  const schedule = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    const c = cfg;
    if (!c || c.motionSafe) return;
    const held = slots.find((s) => s && s.phase === 1);
    const wait = held ? Math.max(0.05, STILL_HOLD - held.t) : 0.05;
    timer = window.setTimeout(
      () => {
        timer = 0;
        kick();
      },
      Math.round(wait * 1000),
    );
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !grid)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const rebuild = () => {
    layout();
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
        rebuild();
        return;
      }
      if (
        was.size !== next.size ||
        was.font !== next.font ||
        was.glyphs !== next.glyphs ||
        was.seed !== next.seed ||
        was.dpr !== next.dpr
      ) {
        if (was.font !== next.font) {
          family = getComputedStyle(canvas).fontFamily || family;
        }
        rebuild();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      else if (was.words.join("|") !== next.words.join("|")) buildAtlas();
      if (was.dim !== next.dim) full = true;
      if (!next.interactive && hand.want > 0) {
        hand.want = 0;
        hand.source = null;
        setActive(false);
      }
      if (was.motionSafe !== next.motionSafe) {
        // Switching modes settles everything where it stands.
        const g = grid;
        if (g) {
          g.roll.fill(1);
          g.glint.fill(0);
          g.dropOn.fill(0);
          g.drop.fill(0);
          for (let s = 0; s < SLOTS; s += 1) {
            const w = slots[s];
            if (!w) continue;
            for (const k of w.cells) release(k);
            slots[s] = null;
          }
        }
        full = true;
      }
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      draw();
      kick();
    },
    resize() {
      const g = grid;
      const c = cfg;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
      if (
        g &&
        g.w === root.clientWidth &&
        g.h === root.clientHeight &&
        g.dpr === dpr
      )
        return;
      rebuild();
    },
    readColours() {
      readColours();
      draw();
      kick();
    },
    refont() {
      // A face that arrived late has its own widths: the grid is laid again.
      if (!cfg || !ctx) return;
      readColours();
      rebuild();
    },
    wake() {
      full = true;
      draw();
      kick();
    },
    handTo(x, y, source) {
      const c = cfg;
      if (!c || !c.interactive) return;
      if (hand.amount < 0.01 || !c.motionSafe) {
        hand.x = x;
        hand.y = y;
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.tx = x;
      hand.ty = y;
      hand.want = 1;
      hand.source = source;
      setActive(true);
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.want = 0;
      hand.source = null;
      setActive(false);
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (timer) window.clearTimeout(timer);
      timer = 0;
    },
  };
}

/** Seeded rows of letters for the server's frame, with one word set in them. */
function standInRows(seed: number, glyphs: string, word: string) {
  const rand = lcg(seed * 31 + 7);
  const chars = Array.from(glyphs || DEFAULT_GLYPHS).filter((c) => c !== " ");
  const pick = () => chars[Math.floor(rand() * chars.length)] ?? "A";
  const rows: string[] = [];
  for (let j = 0; j < 34; j += 1) {
    let row = "";
    for (let i = 0; i < 96; i += 1) row += pick();
    rows.push(row);
  }
  return { rows, word, at: 6 + Math.floor(rand() * 8) };
}

/**
 * A background that is a quiet field of capital letters, with the content
 * on top in its own layer. Two slow waves with organic fronts sweep the
 * field; where their narrow crests pass, letters roll over to new ones and
 * glint, so a band of change travels through a page that otherwise stands
 * still. Every few seconds a word surfaces where it fits: its letters roll
 * in left to right on the cascade, land with a small drop on the recoil
 * spring and take a heavier weight at full colour, hold, then break up and
 * roll back into the field.
 *
 * The pointer calms the field: within `radius` the letters slow nearly to a
 * stop and lift a shade, its place following on glide and its presence on
 * drift, and a word under the hand holds for as long as the hand stays.
 * Keyboard focus on a control inside brings the calm there. Canvas 2D, from
 * a glyph atlas, redrawing only the cells that change; on screen in a
 * visible page only. Under reduced motion the field is still and one word at
 * a time crossfades to the next every few seconds.
 */
export function LetterField({
  children,
  rate = 1,
  words = "studio",
  color = "ink",
  size = 15,
  font = "sans",
  glyphs = DEFAULT_GLYPHS,
  dim = 0.66,
  hold = 2400,
  maxWords = 2,
  avoidCovered = true,
  interactive = true,
  pointerStrength = 0.85,
  radius = 120,
  paused = false,
  seed = 1,
  dpr = 2,
  onWord,
  onActiveChange,
  className,
}: LetterFieldProps) {
  const motionSafe = useMotionSafe();
  const list = React.useMemo(
    () =>
      typeof words === "string"
        ? words === "none"
          ? []
          : (WORD_SETS[words as Exclude<LetterFieldWords, "none">] ??
            WORD_SETS.studio)
        : words.map((w) => w.trim()).filter((w) => w && !/\s/.test(w)),
    [words],
  );
  const ink = COLORS[color as LetterFieldColor] ?? color;
  const pxSize = clamp(size, 10, 32);
  const alpha = Math.round((0.1 + (1 - clamp(dim, 0, 1)) * 0.82) * 100);
  const first = list[0] ?? "";
  const stand = React.useMemo(
    () => standInRows(seed, glyphs, first),
    [seed, glyphs, first],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const layerRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const report = React.useRef({ onWord, onActiveChange });

  const config: Config = {
    rate,
    words: list,
    size: pxSize,
    font,
    glyphs,
    dim,
    hold,
    maxWords,
    avoidCovered,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    colorKey: ink,
    motionSafe,
    onWord: (w) => report.current.onWord?.(w),
    onActive: (a) => report.current.onActiveChange?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onWord, onActiveChange };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carrier = carrierRef.current;
    const layer = layerRef.current;
    if (!root || !canvas || !carrier || !layer) return;
    const e = createEngine(root, canvas, carrier, layer, visible);
    engine.current = e;
    e.configure(latest.current);
    // A web font that arrives late redraws the letters in it.
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) engine.current?.refont();
    });
    return () => {
      live = false;
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
      visible.current = false;
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
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(INTERACTIVE) && event.pointerType !== "touch") return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
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
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  const cellPx = Math.round(pxSize * 1.62);

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
        // The hand reads the pointer without holding it: the page scrolls.
        "group/letter-field relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 size-full",
          font === "mono" ? "font-mono" : "font-sans",
        )}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip font-mono whitespace-pre select-none group-data-live/letter-field:hidden"
        style={{
          color: `color-mix(in oklab, ${ink} ${alpha}%, transparent)`,
          fontSize: pxSize,
          lineHeight: `${cellPx}px`,
          letterSpacing: `calc(${Math.round(pxSize * 1.12)}px - 1ch)`,
          paddingLeft: Math.round(pxSize * 0.3),
        }}
      >
        {stand.rows.map((row, j) =>
          j === 3 && stand.word ? (
            <div key={j}>
              {row.slice(0, stand.at)}
              <span className="font-semibold" style={{ color: ink }}>
                {stand.word}
              </span>
              {row.slice(stand.at + Array.from(stand.word).length)}
            </div>
          ) : (
            <div key={j}>{row}</div>
          ),
        )}
      </div>
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: ink }}
      />
      <div ref={layerRef} className="relative z-10 size-full">
        {children}
      </div>
    </div>
  );
}
