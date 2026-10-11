"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BeachScrawlCharSet = "shore" | "dots" | "hatch";

export type BeachScrawlProps = {
  /** What the unseen hand writes, in single-stroke capitals (A–Z, 0–9, . - ' & +). Empty for none. @default "Low tide" */
  message?: string;
  /** Write the message again once the tide has taken it. @default true */
  loop?: boolean;
  /** How often the tide comes, in waves a minute (1 to 30). @default 7 */
  waveRate?: number;
  /** The glyph vocabulary for sand, water and foam. @default "shore" */
  charSet?: BeachScrawlCharSet;
  /** How far the swash runs up the beach and how long the sand stays dark, 0 to 1. @default 0.5 */
  wetness?: number;
  /** How much each wave takes from the writing, 0 (nothing) to 1 (two waves). @default 0.5 */
  erosion?: number;
  /** How fast the hand writes, in letters a second. @default 2.5 */
  writeSpeed?: number;
  /** Glyph size in px (6 to 18), or "auto": 10 on a wide beach down to 7 on a phone, so a long word still has enough cells to read. @default "auto" */
  cell?: number | "auto";
  /** Width of a pressed stroke in px. @default 7 */
  brush?: number;
  /** Sand ink, any CSS colour. Wet sand mixes it toward the sea. @default "color-mix(in oklab, var(--warn) 45%, var(--ink-3))" */
  sandColor?: string;
  /** Sea ink, any CSS colour. @default "var(--accent-bright)" */
  seaColor?: string;
  /** Foam ink, any CSS colour. @default "color-mix(in oklab, var(--accent-bright) 30%, var(--foreground))" */
  foamColor?: string;
  /** Let the visitor write: drag to draw, type to write. @default true */
  interactive?: boolean;
  /** When the hand starts writing: at mount, or the first time the beach is on screen. @default "inView" */
  trigger?: "mount" | "inView";
  /** Hold the tide and the hand where they are. @default false */
  paused?: boolean;
  /** Seeds the sand, the waves and their reach. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the hand finishes writing, with the text it wrote. */
  onWritten?: (text: string) => void;
  /** Fires when the tide has taken every mark from the sand. */
  onWashed?: () => void;
  /** Fires as each wave starts up the beach, with the count so far. */
  onWave?: (count: number) => void;
  /** The beach's accessible name; what the sand reads is added to it. @default "Beach" */
  label?: string;
  /** Sizes and shapes the box. @default "h-56 w-full" */
  className?: string;
};

type Ink = 0 | 1 | 2 | 3 | 4;
const SAND: Ink = 0;
const WET: Ink = 1;
const GROOVE: Ink = 2;
const SEA: Ink = 3;
const FOAM: Ink = 4;

type Glyphs = {
  dry: readonly string[];
  wet: readonly string[];
  groove: readonly string[];
  rim: string;
  sea: readonly string[];
  foam: readonly string[];
  glint: string;
};

const CHAR_SETS: Record<BeachScrawlCharSet, Glyphs> = {
  shore: {
    dry: [".", "·", ":"],
    wet: [",", ";", ":"],
    groove: [":", "=", "#"],
    rim: "'",
    sea: ["-", "~", "≈"],
    foam: [".", "°", "~", "@"],
    glint: "'",
  },
  dots: {
    dry: ["·", "∙", "·"],
    wet: ["∙", "•", "∙"],
    groove: ["•", "●", "●"],
    rim: "∘",
    sea: ["·", "∙", "•"],
    foam: ["·", "∘", "◦", "○"],
    glint: "∘",
  },
  hatch: {
    dry: ["/", "`", "."],
    wet: ["/", "\\", "/"],
    groove: ["x", "X", "#"],
    rim: "'",
    sea: ["-", "=", "≡"],
    foam: ["`", "~", "*", "&"],
    glint: "`",
  },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

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

// ---------------------------------------------------------------------------
// The hand's alphabet: single-stroke capitals in a 4 × 6 box (y down), the
// way a finger or a stick writes in sand. Curves are sampled arcs, built on
// first use on the client only.

type Pt = readonly [number, number];
type Stroke = readonly Pt[];

/**
 * Strokes are separated by `|`, points are `x,y`, and `a(cx,cy,rx,ry,from,to)`
 * expands in place into an elliptical arc sampled every ~18°, angles in
 * degrees with y down.
 */
const LETTERS: Record<string, string> = {
  A: "0,6 2,0 4,6|0.7,4 3.3,4",
  B: "0,6 0,0 2.5,0 a(2.5,1.5,1.5,1.5,-90,90) 0,3|0,3 2.6,3 a(2.6,4.5,1.4,1.5,-90,90) 0,6",
  C: "a(2,3,2,3,-40,-320)",
  D: "0,0 0,6|0,0 1.6,0 a(1.6,3,2.4,3,-90,90) 0,6",
  E: "4,0 0,0 0,6 4,6|0,3 3,3",
  F: "4,0 0,0 0,6|0,3 3,3",
  G: "a(2,3,2,3,-40,-340) 3.9,3.3 2.2,3.3",
  H: "0,0 0,6|4,0 4,6|0,3 4,3",
  I: "2,0 2,6|1,0 3,0|1,6 3,6",
  J: "4,0 4,4.2 a(2,4.2,2,1.8,0,180)",
  K: "0,0 0,6|4,0 0,3.6|1.3,2.6 4,6",
  L: "0,0 0,6 4,6",
  M: "0,6 0,0 2,3.5 4,0 4,6",
  N: "0,6 0,0 4,6 4,0",
  O: "a(2,3,2,3,-90,270)",
  P: "0,6 0,0 2.5,0 a(2.5,1.6,1.5,1.6,-90,90) 0,3.2",
  Q: "a(2,3,2,3,-90,270)|2.5,4.3 4,6",
  R: "0,6 0,0 2.5,0 a(2.5,1.6,1.5,1.6,-90,90) 0,3.2|1.8,3.2 4,6",
  S: "a(2,1.5,2,1.5,-20,-270) a(2,4.5,2,1.5,-90,160)",
  T: "0,0 4,0|2,0 2,6",
  U: "0,0 0,4 a(2,4,2,2,180,0) 4,0",
  V: "0,0 2,6 4,0",
  W: "0,0 1,6 2,2.4 3,6 4,0",
  X: "0,0 4,6|4,0 0,6",
  Y: "0,0 2,3 4,0|2,3 2,6",
  Z: "0,0 4,0 0,6 4,6",
  "0": "a(2,3,1.9,3,-90,270)|3.1,1 0.9,5",
  "1": "1,1.2 2.2,0 2.2,6|1,6 3.4,6",
  "2": "a(2,1.8,1.9,1.8,-160,35) 0,6 4,6",
  "3": "a(2,1.5,1.9,1.5,-160,90) a(2,4.5,2,1.5,-90,160)",
  "4": "3,6 3,0 0,4.2 4,4.2",
  "5": "3.8,0 0.4,0 0.2,2.7 a(2,4.1,2,1.9,-120,150)",
  "6": "a(2.2,3.4,2.2,3.4,-70,-180) a(2,4.3,2,1.7,180,540)",
  "7": "0,0 4,0 1.4,6",
  "8": "a(2,1.5,1.7,1.5,90,450)|a(2,4.4,2,1.6,-90,270)",
  "9": "a(2,1.8,2,1.8,0,360) 3.4,6",
  ".": "2,5.5 2,6",
  "-": "0.8,3.2 3.2,3.2",
  "'": "2,0 1.8,1.4",
  "+": "2,1.5 2,4.5|0.5,3 3.5,3",
  "&": "4,6 0.9,2.4 a(1.9,1.3,1.1,1.3,160,-110) 2.6,2.6 a(1.7,4.4,1.7,1.6,-40,180) 3.6,3.4",
};

const parsed = new Map<string, Stroke[]>();

function letterStrokes(ch: string): Stroke[] {
  const hit = parsed.get(ch);
  if (hit) return hit;
  const spec = LETTERS[ch];
  if (!spec) return [];
  const strokes = spec.split("|").map((part) => {
    const pts: Pt[] = [];
    for (const token of part.trim().split(/\s+/)) {
      if (token.startsWith("a(")) {
        const [cx = 0, cy = 0, rx = 0, ry = 0, a0 = 0, a1 = 0] = token
          .slice(2, -1)
          .split(",")
          .map(Number);
        const steps = Math.max(4, Math.round(Math.abs(a1 - a0) / 18));
        for (let i = 0; i <= steps; i += 1) {
          const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
          pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
        }
      } else {
        const [x = 0, y = 0] = token.split(",").map(Number);
        pts.push([x, y]);
      }
    }
    return pts;
  });
  parsed.set(ch, strokes);
  return strokes;
}

const ALPHABET = /^[A-Z0-9.\-'+&]$/;
/** Advance of a letter and of a space, in font units. */
const ADVANCE = 5.4;
const SPACE = 3.2;

type Layout = {
  sx: number;
  sy: number;
  lines: string[];
  x: number[];
  y: number[];
};

/** Fits a message to the writing band: condensed to 0.66 before shrinking, wrapping at a space. */
function fitMessage(
  text: string,
  w: number,
  top: number,
  zone: number,
): Layout | null {
  const clean = Array.from(text.toUpperCase())
    .map((c) => (ALPHABET.test(c) ? c : c === " " ? " " : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  const units = (line: string) =>
    Array.from(line).reduce((s, c) => s + (c === " " ? SPACE : ADVANCE), 0) -
    (ADVANCE - 4);
  const pad = Math.max(12, w * 0.06);
  const avail = Math.max(10, w - pad * 2);
  const options: string[][] = [[clean]];
  const spaces = [...clean.matchAll(/ /g)].map((m) => m.index ?? 0);
  if (spaces.length) {
    const mid = clean.length / 2;
    const cut = spaces.reduce((b, s) =>
      Math.abs(s - mid) < Math.abs(b - mid) ? s : b,
    );
    options.push([clean.slice(0, cut), clean.slice(cut + 1)]);
  }
  let best: Layout | null = null;
  let bestScore = -1;
  for (const lines of options) {
    const widest = Math.max(...lines.map(units));
    const maxSy = (zone * (lines.length === 1 ? 0.38 : 0.25)) / 6;
    const sy = Math.min(maxSy, avail / widest / 0.66);
    const sx = Math.min(sy, avail / widest);
    // A second line has to earn its place: clearly bigger letters.
    const score = sy * (lines.length === 1 ? 1.15 : 1);
    if (score <= bestScore) continue;
    bestScore = score;
    const gap = sy * 2.2;
    const block = lines.length * 6 * sy + (lines.length - 1) * gap;
    const y0 = top + zone * 0.37 - block / 2;
    best = {
      sx,
      sy,
      lines,
      x: lines.map((l) => (w - units(l) * sx) / 2),
      y: lines.map((_, i) => y0 + i * (6 * sy + gap)),
    };
  }
  return best;
}

/** One pen task: the strokes in px, and the text they spell. */
/** One pen task: the strokes in px, the text they spell, the stick's half-width. */
type Task = {
  text: string;
  strokes: Float32Array[];
  typed: boolean;
  radius: number;
};

function strokesFor(
  chars: string,
  x: number,
  y: number,
  sx: number,
  sy: number,
): Float32Array[] {
  const out: Float32Array[] = [];
  let cx = x;
  for (const c of Array.from(chars)) {
    if (c === " ") {
      cx += SPACE * sx;
      continue;
    }
    for (const stroke of letterStrokes(c)) {
      const pts = new Float32Array(stroke.length * 2);
      stroke.forEach(([u, v], i) => {
        pts[i * 2] = cx + u * sx;
        pts[i * 2 + 1] = y + v * sy;
      });
      out.push(pts);
    }
    cx += ADVANCE * sx;
  }
  return out;
}

// ---------------------------------------------------------------------------

type Config = {
  message: string;
  loop: boolean;
  waveRate: number;
  charSet: BeachScrawlCharSet;
  wetness: number;
  erosion: number;
  writeSpeed: number;
  cell: number | "auto";
  brush: number;
  interactive: boolean;
  trigger: "mount" | "inView";
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Report = {
  written: (text: string) => void;
  washed: () => void;
  wave: (count: number) => void;
  drawn: () => void;
};

type Grid = {
  /** Glyph size, px. */
  size: number;
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  cwD: number;
  chD: number;
  dpr: number;
  w: number;
  h: number;
  /** Sea line, px from the top, before the swell's wobble. */
  sea: number;
  /** Swash zone height, px. */
  zone: number;
  water: Float32Array;
  wet: Float32Array;
  groove: Float32Array;
  rim: Float32Array;
  foam: Float32Array;
  glint: Float32Array;
  /** Fresh scour where a water front just crossed, 1 fading to 0. */
  scour: Float32Array;
  tmp: Float32Array;
  hash: Float32Array;
  hash2: Float32Array;
  front: Float32Array;
  thin: Float32Array;
  uprush: Uint8Array;
  lace: Float32Array;
  laceWave: Int32Array;
};

type Wave = {
  id: number;
  t0: number;
  up: number;
  down: number;
  reach: Float32Array;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  refont: () => void;
  wake: () => void;
  press: (x: number, y: number) => void;
  draw: (ax: number, ay: number, bx: number, by: number) => void;
  lift: () => void;
  type: (key: string) => void;
  focus: (on: boolean) => void;
  dispose: () => void;
};

const STEP = 1 / 120;
const WASHED = 0.07;

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  visible: React.RefObject<boolean>,
  report: React.RefObject<Report>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let grid: Grid | null = null;
  let atlas: HTMLCanvasElement | null = null;
  let glyphIndex = new Map<string, number>();
  let inks: string[] = [];
  let family = "ui-monospace, monospace";
  let frame = 0;
  let timer = 0;
  let last = 0;
  let disposed = false;
  let t = 0;
  let started = false;
  let focused = false;

  // Waves.
  const waves: Wave[] = [];
  let waveCount = 0;
  let nextWave = 0.6;
  let rand = lcg(1);
  let noise = valueNoise(1);
  let laceNoise = valueNoise(2);

  // The hand.
  let task: Task | null = null;
  let strokeAt = 0;
  let segAt = 0;
  let along = 0;
  let penDown = false;
  const pen = { x: 0, y: 0, vx: 0, vy: 0 };
  let restUntil = 0;
  let layout: Layout | null = null;
  let hasMarks = false;
  let visitorAt = -10;
  // Typing.
  let caretX = 0;
  let typedRects: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const smoothing: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    until: number;
  }[] = [];
  let wroteOnce = false;
  let wavesAtWritten = 0;
  // Reduced motion: the tide takes the writing a step at a time.
  let stillFadeUntil = 0;
  let stillNext = 0;

  const period = () => 60 / clamp(cfg?.waveRate ?? 7, 1, 30);

  const resolveInk = (el: HTMLElement) =>
    getComputedStyle(el).color || "currentColor";

  const buildAtlas = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c || !ctx) return;
    const set = CHAR_SETS[c.charSet] ?? CHAR_SETS.shore;
    const chars = Array.from(
      new Set([
        ...set.dry,
        ...set.wet,
        ...set.groove,
        set.rim,
        ...set.sea,
        ...set.foam,
        set.glint,
        "_",
      ]),
    );
    glyphIndex = new Map(chars.map((ch, i) => [ch, i]));
    const a = atlas ?? document.createElement("canvas");
    a.width = Math.max(1, chars.length * g.cwD);
    a.height = Math.max(1, inks.length * g.chD);
    const actx = a.getContext("2d");
    if (!actx) return;
    actx.clearRect(0, 0, a.width, a.height);
    actx.font = `500 ${Math.round(g.size * g.dpr)}px ${family}`;
    actx.textAlign = "center";
    actx.textBaseline = "middle";
    inks.forEach((ink, row) => {
      actx.fillStyle = ink;
      chars.forEach((ch, i) => {
        actx.fillText(ch, i * g.cwD + g.cwD / 2, row * g.chD + g.chD / 2);
      });
    });
    atlas = a;
  };

  const readColours = () => {
    inks = carriers.map(resolveInk);
    family = getComputedStyle(canvas).fontFamily || family;
    buildAtlas();
  };

  /** Stamps a groove along a segment, with a rim of pushed-aside grains. */
  const stamp = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    depth = 0.95,
    radius = 0,
  ) => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const r =
      (radius || clamp(c.brush, 2, 30) / 2) + Math.min(g.cw, g.ch) * 0.3;
    const rimR = r * 1.85;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - rimR) / g.cw));
    const i1 = Math.min(
      g.cols - 1,
      Math.ceil((Math.max(ax, bx) + rimR) / g.cw),
    );
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - rimR) / g.ch));
    const j1 = Math.min(
      g.rows - 1,
      Math.ceil((Math.max(ay, by) + rimR) / g.ch),
    );
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let j = j0; j <= j1; j += 1) {
      const cy = (j + 0.5) * g.ch;
      if (cy < g.sea - g.ch * 0.2) continue;
      for (let i = i0; i <= i1; i += 1) {
        const cx = (i + 0.5) * g.cw;
        const p =
          len2 > 0 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / len2, 0, 1) : 0;
        const ex = cx - (ax + dx * p);
        const ey = (cy - (ay + dy * p)) * 0.8;
        const d = Math.sqrt(ex * ex + ey * ey);
        const k = j * g.cols + i;
        if (d < r) {
          const v = depth * (1 - smooth(r * 0.4, r, d));
          if (v > (g.groove[k] ?? 0)) g.groove[k] = v;
          g.rim[k] = Math.max(0, (g.rim[k] ?? 0) - v);
        } else if (d < rimR && (g.groove[k] ?? 0) < 0.2) {
          const v = 0.75 * (1 - Math.abs(d - r * 1.4) / (r * 0.45));
          if (v > (g.rim[k] ?? 0)) g.rim[k] = v;
        }
      }
    }
    hasMarks = true;
  };

  /** The stick is as wide as the letters allow: small letters, a finer line. */
  const stickRadius = (sx: number) =>
    Math.min(clamp(cfg?.brush ?? 7, 2, 30) / 2, Math.max(1.4, sx * 0.4));

  const startTask = (next: Task) => {
    task = next;
    strokeAt = 0;
    segAt = 0;
    along = 0;
    penDown = false;
    const first = next.strokes[0];
    if (first && pen.x === 0 && pen.y === 0) {
      pen.x = (first[0] ?? 0) - 40;
      pen.y = (first[1] ?? 0) - 30;
    }
    if (!cfg?.motionSafe) finishInstantly();
  };

  /** Reduced motion, or a resize: the whole task pressed in at once. */
  const finishInstantly = () => {
    const tk = task;
    if (!tk) return;
    for (const s of tk.strokes) {
      for (let p = 0; p + 3 < s.length; p += 2) {
        stamp(
          s[p] ?? 0,
          s[p + 1] ?? 0,
          s[p + 2] ?? 0,
          s[p + 3] ?? 0,
          0.95,
          tk.radius,
        );
      }
      if (s.length === 2)
        stamp(s[0] ?? 0, s[1] ?? 0, s[0] ?? 0, s[1] ?? 0, 0.95, tk.radius);
    }
    completeTask();
  };

  const completeTask = () => {
    const tk = task;
    task = null;
    penDown = false;
    if (!tk) return;
    wavesAtWritten = waveCount;
    // Reduced motion: the first tide step comes a full period after writing.
    if (!cfg?.motionSafe) stillNext = t + period();
    if (!tk.typed) {
      report.current.written(tk.text);
    }
  };

  const messageTask = (): Task | null => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return null;
    layout = fitMessage(c.message, g.w, g.sea, g.zone);
    if (!layout) return null;
    const strokes: Float32Array[] = [];
    const lay = layout;
    lay.lines.forEach((line, i) => {
      strokes.push(
        ...strokesFor(line, lay.x[i] ?? 0, lay.y[i] ?? 0, lay.sx, lay.sy),
      );
    });
    return {
      text: lay.lines.join(" "),
      strokes,
      typed: false,
      radius: stickRadius(lay.sx),
    };
  };

  /** The hand's pen: travels strokes at a writing pace, hops between them on a spring. */
  const stepHand = (dt: number) => {
    const c = cfg;
    const g = grid;
    if (!c || !g) return;
    if (!task) {
      // The hand writes only on smooth sand, and once unless it loops.
      if (
        started &&
        !hasMarks &&
        c.message &&
        t >= restUntil &&
        t - visitorAt > 3 &&
        (c.loop || !wroteOnce)
      ) {
        const next = messageTask();
        if (next) {
          wroteOnce = true;
          startTask(next);
        }
      }
      return;
    }
    // The hand waits while the visitor is writing.
    if (!task.typed && t - visitorAt < 1.5) return;
    const lay = layout;
    const unit = lay ? (lay.sx + lay.sy) / 2 : g.ch / 2;
    const speed = clamp(c.writeSpeed, 0.2, 20) * 15 * unit;
    let budget = speed * dt;
    while (task && budget > 0) {
      const s = task.strokes[strokeAt];
      if (!s) {
        completeTask();
        return;
      }
      if (!penDown) {
        // Pen up: a quick hop to the stroke's start on the flick spring's
        // constants (critically damped, so the stick never overshoots and
        // scratches past where the next stroke begins).
        const tx = s[0] ?? 0;
        const ty = s[1] ?? 0;
        const { stiffness, damping, mass } = springs.flick;
        let left = dt;
        while (left > 0) {
          const h = Math.min(STEP, left);
          left -= h;
          pen.vx += ((-stiffness * (pen.x - tx) - damping * pen.vx) / mass) * h;
          pen.vy += ((-stiffness * (pen.y - ty) - damping * pen.vy) / mass) * h;
          pen.x += pen.vx * h;
          pen.y += pen.vy * h;
        }
        if (Math.hypot(pen.x - tx, pen.y - ty) < 1.2) {
          pen.x = tx;
          pen.y = ty;
          pen.vx = 0;
          pen.vy = 0;
          penDown = true;
          segAt = 0;
          along = 0;
          if (s.length === 2) {
            stamp(tx, ty, tx, ty, 0.95, task.radius);
            strokeAt += 1;
            penDown = false;
          }
        }
        return;
      }
      const ax = s[segAt * 2] ?? 0;
      const ay = s[segAt * 2 + 1] ?? 0;
      const bx = s[segAt * 2 + 2];
      const by = s[segAt * 2 + 3];
      if (bx === undefined || by === undefined) {
        strokeAt += 1;
        penDown = false;
        continue;
      }
      const len = Math.hypot(bx - ax, by - ay);
      // Spend the budget by the step taken, never by a difference of two
      // floats: a tiny budget added to a long run rounds to nothing.
      const from = along;
      const move = Math.min(len - along, budget);
      budget -= move;
      const to = len - from - move < 1e-6 ? len : from + move;
      const f0 = len > 0 ? from / len : 0;
      const f1 = len > 0 ? to / len : 1;
      stamp(
        ax + (bx - ax) * f0,
        ay + (by - ay) * f0,
        ax + (bx - ax) * f1,
        ay + (by - ay) * f1,
        0.95,
        task.radius,
      );
      pen.x = ax + (bx - ax) * f1;
      pen.y = ay + (by - ay) * f1;
      along = to;
      if (to >= len) {
        segAt += 1;
        along = 0;
      }
    }
  };

  const launchWave = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const p = period();
    const id = waveCount;
    waveCount += 1;
    // One wave in five is a bigger one from a set, reaching past the rest.
    const big = rand() < 0.2 ? 1.2 : 1;
    const base = g.zone * (0.42 + 0.36 * clamp(c.wetness, 0, 1)) * big;
    const reach = new Float32Array(g.cols);
    for (let i = 0; i < g.cols; i += 1) {
      const n = noise((i * g.cw) / 95, id * 1.73 + 0.5);
      reach[i] = Math.min(g.zone * 1.02, base * (0.85 + 0.3 * n));
    }
    waves.push({
      id,
      t0: t,
      up: clamp(0.32 * p, 1.1, 3.2),
      down: clamp(0.55 * p, 1.7, 5),
      reach,
    });
    if (waves.length > 3) waves.shift();
    nextWave = t + p * (0.82 + rand() * 0.36);
    report.current.wave(waveCount);
  };

  /** Water fronts per column from every wave still on the sand. */
  const stepWaves = () => {
    const g = grid;
    if (!g) return;
    g.front.fill(0);
    g.thin.fill(0);
    g.uprush.fill(0);
    g.lace.fill(0);
    for (let w = waves.length - 1; w >= 0; w -= 1) {
      const wave = waves[w];
      if (!wave) continue;
      const tau = t - wave.t0;
      if (tau > wave.up + wave.down) {
        waves.splice(w, 1);
        continue;
      }
      const up = tau < wave.up;
      const pu = clamp(tau / wave.up, 0, 1);
      const pd = clamp((tau - wave.up) / wave.down, 0, 1);
      const shape = up ? 1 - (1 - pu) * (1 - pu) : 1 - pd * pd;
      const thin = up ? 1 : Math.pow(1 - pd, 0.6);
      const lace =
        smooth(wave.up * 0.55, wave.up, tau) *
        (1 -
          smooth(wave.up + wave.down * 0.2, wave.up + wave.down * 0.85, tau));
      for (let i = 0; i < g.cols; i += 1) {
        const u = (wave.reach[i] ?? 0) * shape;
        if (u > (g.front[i] ?? 0)) {
          g.front[i] = u;
          g.thin[i] = thin;
          g.uprush[i] = up ? 1 : pd < 0.3 ? 2 : 0;
          g.lace[i] = lace;
          g.laceWave[i] = wave.id;
        }
      }
    }
  };

  const stepSand = (dt: number) => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const dry = 4 + 22 * clamp(c.wetness, 0, 1);
    // Water scours where its front crosses, going up and coming back, so a
    // groove loses the same share to every wave however long it lies under
    // the sheet. Tuned so erosion 0.5 takes about four waves (each keeps
    // ~55%) and erosion 1 about two.
    const kS = clamp(c.erosion, 0, 1) * 1.8;
    const blur = clamp(c.erosion, 0, 1) * 1.6;
    const fb = g.ch * 0.75;
    // Deep only near the sea: the top of the run is a thin sheet the sand
    // shows through.
    const deep = g.zone * 0.32 + 6;
    let maxGroove = 0;
    for (let j = 0; j < g.rows; j += 1) {
      const cy = (j + 0.5) * g.ch;
      for (let i = 0; i < g.cols; i += 1) {
        const k = j * g.cols + i;
        const shore = g.sea + Math.sin((i * g.cw) / 53 + t * 0.6) * g.ch * 0.3;
        const d = cy - shore;
        if (d < 0) {
          g.water[k] = 1;
          continue;
        }
        const u = g.front[i] ?? 0;
        const covered = d < u;
        const was = g.water[k] ?? 0;
        const depth = covered
          ? clamp((u - d) / deep, 0, 1) * (g.thin[i] ?? 0) + 0.04
          : 0;
        g.water[k] = depth;
        let scour = g.scour[k] ?? 0;
        if (depth > 0.02 !== was > 0.02) scour = 1;
        if (scour > 0) {
          const gr = g.groove[k] ?? 0;
          if (gr > 0) g.groove[k] = gr * Math.exp(-kS * scour * dt);
          const rm = g.rim[k] ?? 0;
          if (rm > 0) g.rim[k] = rm * Math.exp(-kS * 2 * scour * dt);
          g.scour[k] = Math.max(0, scour - dt / 0.45);
        }
        let foam = g.foam[k] ?? 0;
        if (depth > 0.02) {
          g.wet[k] = 1;
          // Foam rides the front and laces the water at the top of the run.
          const mode = g.uprush[i] ?? 0;
          if (mode > 0) {
            const near = 1 - Math.abs(d - u) / fb;
            // Broken along its length, so the front reads as surf, not a rule.
            const h = 0.55 + (g.hash2[k] ?? 0) * 0.45;
            if (near > 0)
              foam = Math.max(foam, near * h * (mode === 1 ? 0.78 : 0.45));
          }
          // The lace forms where the sheet spreads thin, near the top of
          // the run, not over the deep water behind the front.
          const lace = d > u * 0.4 ? (g.lace[i] ?? 0) : 0;
          if (lace > 0.02) {
            const n = laceNoise(
              (i * g.cw) / 15 + (g.laceWave[i] ?? 0) * 3.1,
              cy / 8 + (g.laceWave[i] ?? 0) * 1.7 + t * 0.22,
            );
            const ridge = 1 - Math.abs(n - 0.5) / 0.045;
            if (ridge > 0) foam = Math.max(foam, ridge * lace * 0.7);
          }
          foam -= dt * 1.6;
        } else {
          g.wet[k] = Math.max(0, (g.wet[k] ?? 0) - dt / dry);
          // Left on the sand, the lace pops bubble by bubble.
          foam -= dt * (0.5 + (g.hash[k] ?? 0) * 0.8);
          if (was > 0.05 && (g.hash2[k] ?? 0) < 0.07) g.glint[k] = 1;
        }
        g.foam[k] = Math.max(0, foam);
        const gl = g.glint[k] ?? 0;
        if (gl > 0) g.glint[k] = Math.max(0, gl - dt * 0.7);
        const gr = g.groove[k] ?? 0;
        if (gr > maxGroove) maxGroove = gr;
      }
    }
    // Moving water spreads a groove into its neighbours: softer and wider.
    if (blur > 0) {
      g.tmp.set(g.groove);
      for (let j = 1; j < g.rows - 1; j += 1) {
        for (let i = 1; i < g.cols - 1; i += 1) {
          const k = j * g.cols + i;
          const scour = g.scour[k] ?? 0;
          if (scour <= 0) continue;
          const avg =
            ((g.tmp[k - 1] ?? 0) +
              (g.tmp[k + 1] ?? 0) +
              (g.tmp[k - g.cols] ?? 0) +
              (g.tmp[k + g.cols] ?? 0)) /
            4;
          const v = g.tmp[k] ?? 0;
          g.groove[k] = v + (avg - v) * Math.min(1, dt * blur * scour);
        }
      }
    }
    // A hand smoothing the sand (Enter, Backspace).
    for (let s = smoothing.length - 1; s >= 0; s -= 1) {
      const job = smoothing[s];
      if (!job) continue;
      if (t > job.until) {
        smoothing.splice(s, 1);
        continue;
      }
      fadeRect(job, Math.exp(-dt * 9));
    }
    // Marks above the reach of the tide dry out and blow smooth once several
    // waves have passed without taking them.
    if (hasMarks && !task && waveCount - wavesAtWritten >= 6) {
      const keep = Math.exp(-dt * 1.2);
      for (let k = 0; k < g.groove.length; k += 1) {
        g.groove[k] = (g.groove[k] ?? 0) * keep;
        g.rim[k] = (g.rim[k] ?? 0) * keep;
      }
    }
    if (hasMarks && maxGroove < WASHED && !task) {
      hasMarks = false;
      typedRects = [];
      caretX = 0;
      restUntil = t + 1.6;
      report.current.washed();
    }
  };

  const fadeRect = (
    r: { x0: number; y0: number; x1: number; y1: number },
    keep: number,
  ) => {
    const g = grid;
    if (!g) return;
    const i0 = Math.max(0, Math.floor(r.x0 / g.cw));
    const i1 = Math.min(g.cols - 1, Math.ceil(r.x1 / g.cw));
    const j0 = Math.max(0, Math.floor(r.y0 / g.ch));
    const j1 = Math.min(g.rows - 1, Math.ceil(r.y1 / g.ch));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const k = j * g.cols + i;
        g.groove[k] = (g.groove[k] ?? 0) * keep;
        g.rim[k] = (g.rim[k] ?? 0) * keep;
      }
    }
  };

  /** Reduced motion: no water travels; the frame shows one wave's lace at the shore. */
  const stillWater = () => {
    const g = grid;
    if (!g) return;
    // Wetness still reads in the still: how far the lace lies and how wide
    // the dark band of wet sand behind it is.
    const wet = clamp(cfg?.wetness ?? 0.5, 0, 1);
    const band = g.zone * (0.14 + 0.32 * wet);
    g.front.fill(0);
    for (let i = 0; i < g.cols; i += 1) {
      const n = noise((i * g.cw) / 95, 0.5);
      g.front[i] = g.zone * (0.1 + 0.16 * wet + 0.1 * n);
      g.thin[i] = 0.8;
      g.uprush[i] = 0;
      g.lace[i] = 0.9;
      g.laceWave[i] = 0;
    }
    for (let j = 0; j < g.rows; j += 1) {
      const cy = (j + 0.5) * g.ch;
      for (let i = 0; i < g.cols; i += 1) {
        const k = j * g.cols + i;
        const d = cy - g.sea;
        const u = g.front[i] ?? 0;
        if (d < 0) {
          g.water[k] = 1;
          continue;
        }
        const covered = d < u;
        g.water[k] = covered
          ? clamp((u - d) / (g.zone * 0.16 + 6), 0, 1) * 0.8
          : 0;
        g.wet[k] = d < u + band ? 1 - smooth(u, u + band, d) * 0.7 : 0;
        const n = laceNoise((i * g.cw) / 15, cy / 8);
        const ridge = 1 - Math.abs(n - 0.5) / 0.075;
        g.foam[k] =
          covered && ridge > 0
            ? ridge * 0.9
            : Math.abs(d - u) < g.ch * 0.9
              ? 0.7
              : 0;
      }
    }
  };

  const drawFrame = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c || !ctx || !atlas) return;
    const set = CHAR_SETS[c.charSet] ?? CHAR_SETS.shore;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const img = atlas;
    const tile = (ch: string) => glyphIndex.get(ch) ?? 0;
    const put = (gi: number, ink: Ink, i: number, j: number, alpha: number) => {
      if (alpha <= 0.02) return;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(
        img,
        gi * g.cwD,
        ink * g.chD,
        g.cwD,
        g.chD,
        i * g.cwD,
        j * g.chD,
        g.cwD,
        g.chD,
      );
    };
    const seaT = c.motionSafe ? t : 0;
    for (let j = 0; j < g.rows; j += 1) {
      const cy = (j + 0.5) * g.ch;
      for (let i = 0; i < g.cols; i += 1) {
        const k = j * g.cols + i;
        const h1 = g.hash[k] ?? 0;
        const h2 = g.hash2[k] ?? 0;
        const shore =
          g.sea + Math.sin((i * g.cw) / 53 + seaT * 0.6) * g.ch * 0.3;
        if (cy < shore) {
          // Open water: swell bands rolling toward the shore.
          const x = i * g.cw;
          const v =
            0.5 +
            0.5 *
              Math.sin(
                (cy / (g.ch * 2.6)) * Math.PI * 2 -
                  seaT * 1.3 +
                  noise(x / 40, cy / 20 + seaT * 0.08) * 3,
              );
          const edge = 1 - clamp((shore - cy) / g.ch, 0, 1);
          if (edge > 0.35 && h1 < 0.7) {
            put(tile(set.foam[2] ?? "~"), FOAM, i, j, 0.25 + edge * 0.35);
            continue;
          }
          const gi =
            set.sea[
              Math.min(set.sea.length - 1, Math.floor(v * set.sea.length))
            ] ?? "~";
          put(tile(gi), SEA, i, j, 0.22 + v * 0.5);
          continue;
        }
        const foam = g.foam[k] ?? 0;
        const water = g.water[k] ?? 0;
        if (foam > 0.08) {
          // Bubbles, then lace, then the curl of the front, then white water.
          const gi =
            set.foam[foam < 0.3 ? 0 : foam < 0.55 ? 1 : foam < 0.8 ? 2 : 3] ??
            "~";
          put(tile(gi), FOAM, i, j, 0.25 + foam * 0.55);
          continue;
        }
        if (water > 0.42) {
          const gi =
            set.sea[
              Math.min(set.sea.length - 1, Math.floor(h1 * set.sea.length))
            ] ?? "~";
          put(tile(gi), SEA, i, j, 0.2 + water * 0.5);
          continue;
        }
        const groove = g.groove[k] ?? 0;
        const sheet = water > 0.05;
        if (groove > 0.1) {
          const gi =
            set.groove[
              Math.min(
                set.groove.length - 1,
                Math.floor(groove * set.groove.length),
              )
            ] ?? "#";
          put(
            tile(gi),
            sheet ? SEA : GROOVE,
            i,
            j,
            (0.45 + groove * 0.55) * (sheet ? 0.8 : 1),
          );
          continue;
        }
        const rim = g.rim[k] ?? 0;
        if (rim > 0.14) {
          put(tile(set.rim), SAND, i, j, 0.22 + rim * 0.4);
          continue;
        }
        const glint = g.glint[k] ?? 0;
        if (glint > 0.1) {
          put(tile(set.glint), FOAM, i, j, glint * 0.6);
          continue;
        }
        const wet = g.wet[k] ?? 0;
        // Wet sand is denser than dry, not louder: the writing must read.
        if ((wet > 0.08 || sheet) && h1 < 0.8) {
          const gi = set.wet[Math.floor(h2 * set.wet.length)] ?? ";";
          put(
            tile(gi),
            sheet ? SEA : WET,
            i,
            j,
            0.12 + Math.max(wet, water) * 0.36,
          );
          continue;
        }
        if (h1 < 0.5) {
          const gi = set.dry[Math.floor(h2 * set.dry.length)] ?? ".";
          put(tile(gi), SAND, i, j, 0.22 + h2 * 0.26);
        }
      }
    }
    // The caret, while the beach has keyboard focus.
    if (focused && c.interactive && layout) {
      const lay = layout;
      const line = lay.y[0] ?? g.sea + g.zone * 0.3;
      const j = Math.min(g.rows - 1, Math.floor((line + lay.sy * 6.6) / g.ch));
      const i0 = Math.floor((caretX || pad()) / g.cw);
      const blink = c.motionSafe ? 0.55 + 0.35 * Math.cos(t * 5) : 0.8;
      for (let i = i0; i < Math.min(g.cols, i0 + 3); i += 1) {
        put(tile("_"), GROOVE, i, j, blink);
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const pad = () => Math.max(12, (grid?.w ?? 0) * 0.06);

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    t += dt;
    if (c.motionSafe) {
      // The tide waits for the hand to finish the message: the story is
      // written, then taken, never washed out mid-word.
      if (t >= nextWave) {
        if (task && !task.typed) nextWave = t + 0.8;
        else launchWave();
      }
      stepWaves();
      stepSand(dt);
      stepHand(dt);
    } else {
      stepHand(dt);
      // The tide takes the writing a step at a time, by crossfade.
      if (t >= stillNext) {
        stillNext = t + period();
        if (hasMarks && !task) {
          stillFadeUntil = t + 0.4;
          waveCount += 1;
          report.current.wave(waveCount);
        }
      }
      if (stillFadeUntil > t - 0.05) {
        const g = grid;
        if (g) {
          const keep = Math.exp(-dt * (clamp(c.erosion, 0, 1) * 2.2));
          let maxGroove = 0;
          for (let k = 0; k < g.groove.length; k += 1) {
            const v = (g.groove[k] ?? 0) * keep;
            g.groove[k] = v;
            g.rim[k] = (g.rim[k] ?? 0) * keep;
            if (v > maxGroove) maxGroove = v;
          }
          if (hasMarks && maxGroove < WASHED && t > stillFadeUntil) {
            g.groove.fill(0);
            g.rim.fill(0);
            hasMarks = false;
            restUntil = t + 0.4;
            report.current.washed();
          }
        }
      }
    }
  };

  const busy = () => {
    const c = cfg;
    if (!c) return false;
    if (c.motionSafe) return !c.paused;
    // Reduced motion runs only while a crossfade or the hand is at work.
    return !c.paused && (stillFadeUntil > t - 0.05 || task !== null);
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
    if (!c.paused) step(dt);
    drawFrame();
    if (busy()) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    last = 0;
    if (!c.motionSafe && !c.paused) schedule();
  };

  const schedule = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    const c = cfg;
    if (!c || c.motionSafe || c.paused) return;
    const wait = Math.max(
      0.05,
      Math.min(stillNext - t, restUntil > t ? restUntil - t : Infinity),
    );
    timer = window.setTimeout(
      () => {
        timer = 0;
        // Time spent waiting counts on the beach's clock.
        t += wait;
        kick();
      },
      Math.round(wait * 1000),
    );
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !grid)
      return;
    if (cfg?.trigger === "inView") started = true;
    frame = window.requestAnimationFrame(tick);
  };

  const layoutGrid = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const size =
      c.cell === "auto"
        ? Math.round(clamp(7 + ((w - 300) * 3) / 260, 7, 10) * 2) / 2
        : clamp(c.cell, 6, 18);
    let advance = size * 0.62;
    if (ctx) {
      ctx.font = `500 ${size}px ${family}`;
      advance = Math.max(advance, ctx.measureText("M").width);
    }
    const cwD = Math.max(3, Math.round(advance * dpr));
    const chD = Math.max(5, Math.round(size * 1.12 * dpr));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const cw = cwD / dpr;
    const ch = chD / dpr;
    const cols = Math.max(1, Math.ceil(w / cw));
    const rows = Math.max(1, Math.ceil(h / ch));
    const n = cols * rows;
    const sea = Math.max(ch * 2, Math.round(h * 0.22));
    const old = grid;
    const g: Grid = {
      size,
      cols,
      rows,
      cw,
      ch,
      cwD,
      chD,
      dpr,
      w,
      h,
      sea,
      zone: h - sea,
      water: new Float32Array(n),
      wet: new Float32Array(n),
      groove: new Float32Array(n),
      rim: new Float32Array(n),
      foam: new Float32Array(n),
      glint: new Float32Array(n),
      scour: new Float32Array(n),
      tmp: new Float32Array(n),
      hash: new Float32Array(n),
      hash2: new Float32Array(n),
      front: new Float32Array(cols),
      thin: new Float32Array(cols),
      uprush: new Uint8Array(cols),
      lace: new Float32Array(cols),
      laceWave: new Int32Array(cols),
    };
    const r = lcg(c.seed * 977 + 13);
    for (let k = 0; k < n; k += 1) {
      g.hash[k] = r();
      g.hash2[k] = r();
    }
    // Marks already in the sand survive a resize, resampled by position.
    if (old) {
      for (let j = 0; j < rows; j += 1) {
        for (let i = 0; i < cols; i += 1) {
          const oi = Math.floor(((i + 0.5) * cw) / old.cw);
          const oj = Math.floor(((j + 0.5) * ch) / old.ch);
          if (oi >= old.cols || oj >= old.rows) continue;
          const ok = oj * old.cols + oi;
          const k = j * cols + i;
          g.groove[k] = old.groove[ok] ?? 0;
          g.rim[k] = old.rim[ok] ?? 0;
          g.wet[k] = old.wet[ok] ?? 0;
        }
      }
    }
    grid = g;
    waves.length = 0;
    if (task && !task.typed) {
      // The message in progress is laid out again at the new size.
      task = null;
      g.groove.fill(0);
      g.rim.fill(0);
      hasMarks = false;
    }
    layout = c.message ? fitMessage(c.message, w, sea, h - sea) : null;
    buildAtlas();
    if (!c.motionSafe) stillWater();
  };

  const rebuild = () => {
    layoutGrid();
    drawFrame();
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
      if (next.trigger === "mount") started = true;
      if (!was) {
        rand = lcg(next.seed * 31 + 7);
        noise = valueNoise(
          Math.imul(Math.round(next.seed) | 0, 2246822519) | 0,
        );
        laceNoise = valueNoise(Math.imul(Math.round(next.seed) + 5, 40503) | 0);
        readColours();
        rebuild();
        return;
      }
      if (was.seed !== next.seed) {
        rand = lcg(next.seed * 31 + 7);
        noise = valueNoise(
          Math.imul(Math.round(next.seed) | 0, 2246822519) | 0,
        );
        laceNoise = valueNoise(Math.imul(Math.round(next.seed) + 5, 40503) | 0);
      }
      if (
        was.cell !== next.cell ||
        was.dpr !== next.dpr ||
        was.seed !== next.seed
      ) {
        rebuild();
        return;
      }
      if (was.charSet !== next.charSet) buildAtlas();
      if (was.wetness !== next.wetness && !next.motionSafe) stillWater();
      if (was.message !== next.message) {
        const g = grid;
        if (g && task && !task.typed) {
          task = null;
          g.groove.fill(0);
          g.rim.fill(0);
          hasMarks = false;
        }
        if (g)
          layout = next.message
            ? fitMessage(next.message, g.w, g.sea, g.zone)
            : null;
        restUntil = t;
        wroteOnce = false;
      }
      if (was.waveRate !== next.waveRate) {
        nextWave = Math.min(nextWave, t + period());
        stillNext = Math.min(stillNext, t + period());
      }
      if (was.motionSafe !== next.motionSafe) {
        waves.length = 0;
        if (!next.motionSafe) {
          stillWater();
          if (task) finishInstantly();
          stillNext = t + period();
        } else {
          grid?.foam.fill(0);
          nextWave = t + 0.4;
        }
      }
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      drawFrame();
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
      drawFrame();
    },
    refont() {
      if (!cfg || !ctx) return;
      readColours();
      rebuild();
    },
    wake() {
      drawFrame();
      kick();
    },
    press(x, y) {
      if (!cfg?.interactive) return;
      visitorAt = t;
      wavesAtWritten = waveCount;
      stamp(x, y, x, y, 0.9);
      report.current.drawn();
      drawFrame();
      kick();
    },
    draw(ax, ay, bx, by) {
      if (!cfg?.interactive) return;
      visitorAt = t;
      wavesAtWritten = waveCount;
      stamp(ax, ay, bx, by);
      report.current.drawn();
      drawFrame();
      kick();
    },
    lift() {
      visitorAt = t;
      wavesAtWritten = waveCount;
    },
    type(key) {
      const g = grid;
      const c = cfg;
      if (!g || !c || !c.interactive) return;
      visitorAt = t;
      wavesAtWritten = waveCount;
      const lay = layout ?? fitMessage("XXXXXXXX", g.w, g.sea, g.zone);
      if (!lay) return;
      const sy = lay.sy;
      const sx = sy * 0.85;
      const line = lay.y[0] ?? g.sea + g.zone * 0.3;
      const p = pad();
      if (key === "Enter") {
        smoothing.push({ x0: 0, y0: g.sea, x1: g.w, y1: g.h, until: t + 0.45 });
        caretX = p;
        typedRects = [];
        task = null;
        kick();
        return;
      }
      if (key === "Backspace") {
        const r = typedRects.pop();
        if (r) {
          smoothing.push({ ...r, until: t + 0.35 });
          caretX = r.x0 + sx * 0.6;
          if (task?.typed) task = null;
        }
        kick();
        return;
      }
      if (!caretX || (task && !task.typed)) {
        // The visitor takes over: the hand stops, the writing line is smoothed.
        if (task && !task.typed) task = null;
        if (!typedRects.length) {
          smoothing.push({
            x0: 0,
            y0: line - sy * 2,
            x1: g.w,
            y1: line + sy * 8,
            until: t + 0.4,
          });
        }
        caretX = p;
      }
      if (key === " ") {
        caretX += SPACE * sx;
        kick();
        return;
      }
      const ch = key.toUpperCase();
      if (!ALPHABET.test(ch)) return;
      if (caretX + 4 * sx > g.w - p * 0.6) {
        smoothing.push({
          x0: 0,
          y0: line - sy * 2,
          x1: g.w,
          y1: line + sy * 8,
          until: t + 0.4,
        });
        caretX = p;
        typedRects = [];
      }
      const strokes = strokesFor(ch, caretX, line, sx, sy);
      typedRects.push({
        x0: caretX - sx * 0.6,
        y0: line - sy,
        x1: caretX + 4.6 * sx,
        y1: line + 7 * sy,
      });
      caretX += ADVANCE * sx;
      // Letters typed faster than the hand writes queue up behind it.
      const queued = task?.typed ? task : null;
      if (queued) {
        queued.strokes.push(...strokes);
        queued.text += ch;
      } else {
        startTask({ text: ch, strokes, typed: true, radius: stickRadius(sx) });
      }
      hasMarks = true;
      report.current.drawn();
      kick();
    },
    focus(on) {
      focused = on;
      drawFrame();
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

/** Seeded rows of shore glyphs for the server's frame: sea, a wet band, dry sand. */
function standIn(seed: number, set: Glyphs) {
  const rand = lcg(seed * 131 + 3);
  const rows: { text: string; ink: "sea" | "foam" | "wet" | "sand" }[] = [];
  for (let j = 0; j < 22; j += 1) {
    let text = "";
    const ink = j < 4 ? "sea" : j === 4 ? "foam" : j < 10 ? "wet" : "sand";
    for (let i = 0; i < 200; i += 1) {
      const r = rand();
      if (ink === "sea") text += set.sea[Math.floor(r * set.sea.length)] ?? "~";
      else if (ink === "foam") text += r < 0.6 ? (set.foam[2] ?? "~") : " ";
      else if (ink === "wet")
        text += set.wet[Math.floor(r * set.wet.length)] ?? ";";
      else
        text +=
          r < 0.5 ? (set.dry[Math.floor(r * 2 * set.dry.length)] ?? ".") : " ";
    }
    rows.push({ text, ink });
  }
  return rows;
}

/**
 * A strip of shoreline seen from above, drawn in characters: sea along the
 * top, swash below it, dry sand beyond. Waves run up the beach on a
 * decelerating ballistic curve to a reach that varies along the shore, spread
 * a lace of foam at the top of their run and drain away, leaving dark sand
 * that glints and dries. Drag to press grooves into the sand, or focus it and
 * type: an unseen hand writes your letters, and also writes `message` on a
 * loop. Water erodes every groove it passes and spreads it into its
 * neighbours, so each wave leaves the writing softer until the tide has
 * taken it. Under reduced motion the water is still, writing appears at
 * once, and the tide takes it a step at a time by crossfade.
 */
export function BeachScrawl({
  message = "Low tide",
  loop = true,
  waveRate = 7,
  charSet = "shore",
  wetness = 0.5,
  erosion = 0.5,
  writeSpeed = 2.5,
  cell = "auto",
  brush = 7,
  sandColor = "color-mix(in oklab, var(--warn) 45%, var(--ink-3))",
  seaColor = "var(--accent-bright)",
  foamColor = "color-mix(in oklab, var(--accent-bright) 30%, var(--foreground))",
  interactive = true,
  trigger = "inView",
  paused = false,
  seed = 1,
  dpr = 2,
  onWritten,
  onWashed,
  onWave,
  label = "Beach",
  className,
}: BeachScrawlProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const set = CHAR_SETS[charSet] ?? CHAR_SETS.shore;
  const stand = React.useMemo(() => standIn(seed, set), [seed, set]);
  const [reads, setReads] = React.useState<string>("");
  const [drawn, setDrawn] = React.useState(false);
  const [said, setSaid] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const callbacks = React.useRef({ onWritten, onWashed, onWave });
  const report = React.useRef<Report>({
    written: (text) => {
      setReads(text);
      setDrawn(false);
      setSaid(`Written: ${text}`);
      callbacks.current.onWritten?.(text);
    },
    washed: () => {
      setReads("");
      setDrawn(false);
      setSaid("Washed away");
      callbacks.current.onWashed?.();
    },
    wave: (count) => callbacks.current.onWave?.(count),
    drawn: () => setDrawn(true),
  });

  const config: Config = {
    message,
    loop,
    waveRate,
    charSet,
    wetness,
    erosion,
    writeSpeed,
    cell,
    brush,
    interactive,
    trigger,
    paused,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    callbacks.current = { onWritten, onWashed, onWave };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carrierRefs.current.filter((c): c is HTMLSpanElement =>
      Boolean(c),
    );
    if (!root || !canvas || carriers.length < 5) return;
    const e = createEngine(root, canvas, carriers, visible, report);
    engine.current = e;
    e.configure(latest.current);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) engine.current?.refont();
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
  const lastPoint = React.useRef({ x: 0, y: 0 });

  const drag = useDrag({
    threshold: 2,
    disabled: !interactive,
    onStart: ({ point, offset }) => {
      const start = local(point.x - offset.x, point.y - offset.y);
      lastPoint.current = start;
    },
    onMove: ({ point }) => {
      const at = local(point.x, point.y);
      const from = lastPoint.current;
      engine.current?.draw(from.x, from.y, at.x, at.y);
      lastPoint.current = at;
    },
    onEnd: () => engine.current?.lift(),
    onCancel: () => engine.current?.lift(),
    onTap: (event) => {
      const at = local(event.clientX, event.clientY);
      engine.current?.press(at.x, at.y);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;
    if (
      key === "Enter" ||
      key === "Backspace" ||
      key === " " ||
      /^[a-z0-9.\-'+&]$/i.test(key)
    ) {
      event.preventDefault();
      engine.current?.type(key);
    }
  };

  const name = reads
    ? `${label}. The sand reads ${reads}.`
    : drawn
      ? `${label}, with writing in the sand.`
      : `${label}. The sand is smooth.`;
  const inkFor = {
    sea: seaColor,
    foam: foamColor,
    wet: `color-mix(in oklab, ${sandColor} 70%, ${seaColor})`,
    sand: sandColor,
  };

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="beach"
      aria-label={name}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (
          event.target === event.currentTarget &&
          event.currentTarget.matches(":focus-visible")
        ) {
          engine.current?.focus(true);
        }
      }}
      onBlur={() => engine.current?.focus(false)}
      {...(interactive ? drag : {})}
      className={cn(
        "group/beach-scrawl relative isolate h-56 w-full overflow-clip rounded-3 outline-none select-none",
        interactive && "cursor-crosshair touch-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full font-mono"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip font-mono text-[10px] leading-[11px] whitespace-pre select-none group-data-live/beach-scrawl:hidden"
      >
        {stand.map((row, j) => (
          <div
            key={j}
            style={{
              color: `color-mix(in oklab, ${inkFor[row.ink]} ${row.ink === "sand" ? 55 : 60}%, transparent)`,
            }}
          >
            {row.text}
          </div>
        ))}
      </div>
      {[
        sandColor,
        `color-mix(in oklab, ${sandColor} 70%, ${seaColor})`,
        `color-mix(in oklab, ${sandColor} 35%, var(--foreground))`,
        seaColor,
        foamColor,
      ].map((ink, i) => (
        <span
          key={i}
          ref={(node) => {
            carrierRefs.current[i] = node;
          }}
          aria-hidden
          onTransitionEnd={() => engine.current?.readColours()}
          className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
          style={{ color: ink }}
        />
      ))}
      {interactive ? (
        <span id={hintId} className="sr-only">
          Type to write in the sand, or drag to draw. Waves wash it away.
        </span>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
