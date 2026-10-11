"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BulbMarqueeElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type BulbMarqueeTrigger = "mount" | "inView" | "hover" | "manual";

export type BulbMarqueePattern = "chase" | "alternate";

export type BulbMarqueeState = "dark" | "warming" | "lit";

export type BulbMarqueeProps = {
  /** The headline, as a string. Wins over `text`. Set in capitals. */
  children?: string;
  /** The headline, when it is not given as children. */
  text?: string;
  /** The element that carries the headline. @default "p" */
  as?: BulbMarqueeElement;
  /** Bulb diameter, 0.6 to 1.4 times the house bulb; the spacing follows it, so small bulbs make fine letters and big ones chunky letters. @default 1 */
  bulbSize?: number;
  /** The resting frame's chase, steps per second, 0 to 10; 0 holds the frame steady. @default 4 */
  chase?: number;
  /** Filament colour temperature, 0 (clear white) to 1 (deep amber). @default 0.6 */
  warmth?: number;
  /** How far each bulb's halo spills, 0 to 1. @default 0.6 */
  glow?: number;
  /** The frame at rest: a three-step chase, or odd and even bulbs taking turns. @default "chase" */
  pattern?: BulbMarqueePattern;
  /** Draw the border of bulbs round the sign face. @default true */
  frame?: boolean;
  /** The sign face, any CSS colour. A fixed enamel pigment by default, so the sign reads the same in both themes. */
  face?: string;
  /** What lights the sign. @default "inView" */
  trigger?: BulbMarqueeTrigger;
  /** Light once, or go dark again when it leaves view or the hover ends. @default true */
  once?: boolean;
  /** With trigger "manual": true lights the sign, false switches it off. @default false */
  play?: boolean;
  /** Wait before the frame's first lap, ms. @default 0 */
  delay?: number;
  /** Gap between letters starting to fill, ms. @default 70 */
  stagger?: number;
  /** How long one letter takes to fill bulb by bulb, ms. @default 420 */
  duration?: number;
  /** Hover sparkles a letter, a press relights the sign, and the keys do both. @default true */
  interactive?: boolean;
  /** The sign went dark, began warming up, or finished lighting. */
  onStateChange?: (state: BulbMarqueeState) => void;
  /** The reveal has finished: every bulb is lit and settled. */
  onComplete?: () => void;
  className?: string;
};

/* ------------------------------------------------------------------------ */
/* The bulb alphabet                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Centre-line strokes on a grid four units wide and six tall (y down, 6 is
 * the baseline). Bulbs are dropped along each stroke at an even pitch, so a
 * letter's bulbs follow its own pen order — that order is the fill order.
 */
const GLYPHS: Record<string, { w: number; d: string }> = {
  A: { w: 4, d: "M0 6 L2 0 L4 6 M0.8 3.6 L3.2 3.6" },
  B: {
    w: 3.8,
    d: "M0 6 L0 0 L2.4 0 Q3.6 0 3.6 1.5 Q3.6 3 2.4 3 L0 3 M2.4 3 Q3.8 3 3.8 4.5 Q3.8 6 2.4 6 L0 6",
  },
  C: {
    w: 4,
    d: "M3.9 1 Q3.3 0 2.1 0 C0.6 0 0 1.4 0 3 C0 4.6 0.6 6 2.1 6 Q3.3 6 3.9 5",
  },
  D: { w: 4, d: "M0 0 L0 6 L1.8 6 C3.4 6 4 4.6 4 3 C4 1.4 3.4 0 1.8 0 L0 0" },
  E: { w: 3.6, d: "M3.6 0 L0 0 L0 6 L3.6 6 M0 3 L3 3" },
  F: { w: 3.6, d: "M3.6 0 L0 0 L0 6 M0 3 L3 3" },
  G: {
    w: 4,
    d: "M3.9 1 Q3.3 0 2.1 0 C0.6 0 0 1.4 0 3 C0 4.6 0.6 6 2.1 6 C3.4 6 4 5 4 3.6 L2.4 3.6",
  },
  H: { w: 4, d: "M0 0 L0 6 M4 0 L4 6 M0 3 L4 3" },
  I: { w: 0, d: "M0 0 L0 6" },
  J: { w: 3.4, d: "M3.4 0 L3.4 4.3 C3.4 5.4 2.7 6 1.7 6 C0.7 6 0 5.4 0 4.4" },
  K: { w: 3.8, d: "M0 0 L0 6 M3.8 0 L0 3.8 M1.4 2.5 L3.8 6" },
  L: { w: 3.4, d: "M0 0 L0 6 L3.4 6" },
  M: { w: 4.8, d: "M0 6 L0 0 L2.4 3.8 L4.8 0 L4.8 6" },
  N: { w: 4, d: "M0 6 L0 0 L4 6 L4 0" },
  O: {
    w: 4.2,
    d: "M2.1 0 C3.5 0 4.2 1.4 4.2 3 C4.2 4.6 3.5 6 2.1 6 C0.7 6 0 4.6 0 3 C0 1.4 0.7 0 2.1 0",
  },
  P: { w: 3.8, d: "M0 6 L0 0 L2.4 0 Q3.8 0 3.8 1.6 Q3.8 3.2 2.4 3.2 L0 3.2" },
  Q: {
    w: 4.2,
    d: "M2.1 0 C3.5 0 4.2 1.4 4.2 3 C4.2 4.6 3.5 6 2.1 6 C0.7 6 0 4.6 0 3 C0 1.4 0.7 0 2.1 0 M2.7 4.5 L4.2 6",
  },
  R: {
    w: 3.8,
    d: "M0 6 L0 0 L2.4 0 Q3.8 0 3.8 1.6 Q3.8 3.2 2.4 3.2 L0 3.2 M2.2 3.2 L3.8 6",
  },
  S: {
    w: 3.8,
    d: "M3.7 0.9 Q3.1 0 1.9 0 Q0.1 0 0.1 1.5 Q0.1 2.7 1.9 3 Q3.8 3.3 3.8 4.5 Q3.8 6 1.9 6 Q0.6 6 0 5.1",
  },
  T: { w: 4, d: "M0 0 L4 0 M2 0 L2 6" },
  U: { w: 4, d: "M0 0 L0 4.2 C0 5.4 0.8 6 2 6 C3.2 6 4 5.4 4 4.2 L4 0" },
  V: { w: 4, d: "M0 0 L2 6 L4 0" },
  W: { w: 5.2, d: "M0 0 L1.3 6 L2.6 1.8 L3.9 6 L5.2 0" },
  X: { w: 4, d: "M0 0 L4 6 M4 0 L0 6" },
  Y: { w: 4, d: "M0 0 L2 3.2 L4 0 M2 3.2 L2 6" },
  Z: { w: 4, d: "M0 0 L4 0 L0 6 L4 6" },
  "0": {
    w: 3.6,
    d: "M1.8 0 C3 0 3.6 1.4 3.6 3 C3.6 4.6 3 6 1.8 6 C0.6 6 0 4.6 0 3 C0 1.4 0.6 0 1.8 0",
  },
  "1": { w: 1.8, d: "M0 1.2 L1.8 0 L1.8 6" },
  "2": {
    w: 3.8,
    d: "M0.1 1.2 Q0.6 0 1.9 0 Q3.7 0 3.7 1.7 Q3.7 2.9 1.9 4 L0 6 L3.8 6",
  },
  "3": {
    w: 3.7,
    d: "M0 0.8 Q0.7 0 1.8 0 Q3.6 0 3.6 1.5 Q3.6 3 1.7 3 Q3.7 3 3.7 4.5 Q3.7 6 1.8 6 Q0.6 6 0 5.2",
  },
  "4": { w: 3.8, d: "M2.8 6 L2.8 0 L0 4.2 L3.8 4.2" },
  "5": {
    w: 3.7,
    d: "M3.5 0 L0.4 0 L0.1 2.7 Q0.8 2.3 1.8 2.3 Q3.7 2.3 3.7 4.15 Q3.7 6 1.8 6 Q0.6 6 0 5.2",
  },
  "6": {
    w: 3.7,
    d: "M3.3 0.4 Q2.8 0 1.9 0 Q0 0 0 3.4 Q0 6 1.85 6 Q3.7 6 3.7 4.2 Q3.7 2.5 1.85 2.5 Q0.6 2.5 0 3.4",
  },
  "7": { w: 3.8, d: "M0 0 L3.8 0 L1.4 6" },
  "8": {
    w: 3.8,
    d: "M1.9 3 Q0.2 3 0.2 1.5 Q0.2 0 1.9 0 Q3.6 0 3.6 1.5 Q3.6 3 1.9 3 Q0 3 0 4.5 Q0 6 1.9 6 Q3.8 6 3.8 4.5 Q3.8 3 1.9 3",
  },
  "9": {
    w: 3.7,
    d: "M0.4 5.6 Q0.9 6 1.8 6 Q3.7 6 3.7 2.6 Q3.7 0 1.85 0 Q0 0 0 1.8 Q0 3.5 1.85 3.5 Q3.1 3.5 3.7 2.6",
  },
  ".": { w: 0, d: "M0 6 L0 6" },
  ",": { w: 0.3, d: "M0.3 5.4 L0 6.3" },
  "!": { w: 0, d: "M0 0 L0 3.9 M0 6 L0 6" },
  "?": {
    w: 3.6,
    d: "M0 1.1 Q0.5 0 1.8 0 Q3.6 0 3.6 1.6 Q3.6 2.7 1.8 3.4 L1.8 4.1 M1.8 6 L1.8 6",
  },
  "'": { w: 0, d: "M0 0 L0 1.5" },
  "’": { w: 0, d: "M0 0 L0 1.5" },
  "-": { w: 2.4, d: "M0 3 L2.4 3" },
  "–": { w: 3.6, d: "M0 3 L3.6 3" },
  "—": { w: 3.6, d: "M0 3 L3.6 3" },
  ":": { w: 0, d: "M0 2.2 L0 2.2 M0 6 L0 6" },
  "/": { w: 3, d: "M3 0 L0 6" },
  "+": { w: 3.2, d: "M1.6 1.4 L1.6 4.6 M0 3 L3.2 3" },
  "&": {
    w: 4.2,
    d: "M4.2 6 L1.1 2.2 Q0.6 1.6 0.6 1.1 Q0.6 0 1.6 0 Q2.6 0 2.6 1.1 Q2.6 2 1.3 2.9 Q0 3.8 0 4.7 Q0 6 1.7 6 Q3.1 6 4.2 4.2",
  },
  "*": { w: 3, d: "M1.5 0.6 L1.5 3.4 M0.2 1.3 L2.8 2.7 M2.8 1.3 L0.2 2.7" },
};

/** em per grid unit: the cap height (six units) is 0.78em. */
const UNIT = 0.13;
/** The house bulb's diameter, grid units. */
const BULB = 0.78;

type Pt = { x: number; y: number };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A glyph's strokes as polylines: lines exact, curves finely flattened. */
function strokesOf(d: string): Pt[][] {
  const tok = d
    .replace(/([MLQC])/g, " $1 ")
    .trim()
    .split(/[\s,]+/);
  const paths: Pt[][] = [];
  let cur: Pt[] = [];
  let x = 0;
  let y = 0;
  let i = 0;
  const num = () => Number(tok[i++] ?? 0);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === "M") {
      x = num();
      y = num();
      cur = [{ x, y }];
      paths.push(cur);
    } else if (c === "L") {
      x = num();
      y = num();
      cur.push({ x, y });
    } else if (c === "Q") {
      const cx = num();
      const cy = num();
      const ex = num();
      const ey = num();
      for (let k = 1; k <= 14; k += 1) {
        const t = k / 14;
        const m = 1 - t;
        cur.push({
          x: m * m * x + 2 * m * t * cx + t * t * ex,
          y: m * m * y + 2 * m * t * cy + t * t * ey,
        });
      }
      x = ex;
      y = ey;
    } else if (c === "C") {
      const ax = num();
      const ay = num();
      const bx = num();
      const by = num();
      const ex = num();
      const ey = num();
      for (let k = 1; k <= 18; k += 1) {
        const t = k / 18;
        const m = 1 - t;
        cur.push({
          x:
            m * m * m * x +
            3 * m * m * t * ax +
            3 * m * t * t * bx +
            t * t * t * ex,
          y:
            m * m * m * y +
            3 * m * m * t * ay +
            3 * m * t * t * by +
            t * t * t * ey,
        });
      }
      x = ex;
      y = ey;
    }
  }
  return paths;
}

/** Bulbs at an even pitch along every stroke, in pen order, never doubled. */
function bulbsOf(d: string, pitch: number): Pt[] {
  const out: Pt[] = [];
  const near = pitch * 0.6;
  const add = (p: Pt) => {
    for (const q of out) {
      if (Math.hypot(q.x - p.x, q.y - p.y) < near) return;
    }
    out.push({ x: r3(p.x), y: r3(p.y) });
  };
  for (const poly of strokesOf(d)) {
    const first = poly[0];
    if (!first) continue;
    const lens = [0];
    for (let k = 1; k < poly.length; k += 1) {
      const a = poly[k - 1] as Pt;
      const b = poly[k] as Pt;
      lens.push((lens[k - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = lens[lens.length - 1] ?? 0;
    if (total < 1e-6) {
      add(first);
      continue;
    }
    const last = poly[poly.length - 1] as Pt;
    const closed = Math.hypot(last.x - first.x, last.y - first.y) < 1e-3;
    const n = Math.max(1, Math.round(total / pitch));
    const count = closed ? n : n + 1;
    let seg = 1;
    for (let k = 0; k < count; k += 1) {
      const s = (k * total) / n;
      while (seg < poly.length - 1 && (lens[seg] ?? 0) < s) seg += 1;
      const a = poly[seg - 1] as Pt;
      const b = poly[seg] as Pt;
      const l0 = lens[seg - 1] ?? 0;
      const l1 = lens[seg] ?? 0;
      const t = l1 > l0 ? clamp01((s - l0) / (l1 - l0)) : 0;
      add({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

type Letter = { bulbs: Pt[]; x: number };
type Word = { letters: Letter[]; width: number; key: string; first: number };
type Sign = {
  words: Word[];
  /** Total bulbs in the letters, and how many each letter has. */
  count: number;
  letters: number;
  /** Bulb diameter in grid units. */
  d: number;
};

function signOf(text: string, bulbSize: number): Sign {
  const d = BULB * clamp(bulbSize, 0.6, 1.4);
  const pitch = d * 1.5;
  const gap = 1.25 + d;
  const words: Word[] = [];
  let count = 0;
  let letters = 0;
  text
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((raw, w) => {
      const list: Letter[] = [];
      let x = 0;
      for (const ch of Array.from(raw)) {
        const glyph = GLYPHS[ch] ?? GLYPHS["?"];
        if (!glyph) continue;
        const bulbs = bulbsOf(glyph.d, pitch);
        list.push({ bulbs, x: r3(x) });
        count += bulbs.length;
        letters += 1;
        x += glyph.w + gap;
      }
      if (list.length) {
        words.push({
          letters: list,
          width: r3(x - gap),
          key: `${w}:${raw}`,
          first: letters - list.length,
        });
      }
    });
  return { words, count, letters, d: r3(d) };
}

/* ------------------------------------------------------------------------ */
/* Filament colour                                                           */
/* ------------------------------------------------------------------------ */

/** Brightness levels a bulb is drawn at; every frame picks from these. */
const LEVELS = 48;
const MAX_B = 1.4;
const levelOf = (b: number) =>
  Math.round((clamp(b, 0, MAX_B) / MAX_B) * (LEVELS - 1));

type Palette = { glass: string[]; halo: string[]; rest: string };

/**
 * A filament's colour is its temperature: cold smoky glass, then dull red,
 * orange, amber, the rest colour `warmth` asks for, and near white past it —
 * where the inrush flash lives. Built once per warmth, as strings, so the
 * per-frame work is an index.
 */
function paletteOf(warmth: number, glow: number): Palette {
  const w = clamp01(warmth);
  const g = clamp01(glow);
  const stops: [number, number, number, number][] = [
    [0, 0.38, 0.03, 62],
    [0.12, 0.45, 0.11, 36],
    [0.38, 0.64, 0.17, 48],
    [0.7, 0.82, 0.145, 66],
    [1, 0.955 - 0.06 * w, 0.025 + 0.11 * w, 96 - 28 * w],
    [1.25, 0.99, 0.015 + 0.03 * w, 96],
    [MAX_B, 0.995, 0.01, 96],
  ];
  const at = (b: number) => {
    for (let k = 1; k < stops.length; k += 1) {
      const a = stops[k - 1] as [number, number, number, number];
      const z = stops[k] as [number, number, number, number];
      if (b <= z[0] || k === stops.length - 1) {
        const t = clamp01((b - a[0]) / (z[0] - a[0]));
        return [
          a[1] + (z[1] - a[1]) * t,
          a[2] + (z[2] - a[2]) * t,
          a[3] + (z[3] - a[3]) * t,
        ] as const;
      }
    }
    return [0.38, 0.03, 62] as const;
  };
  const glass: string[] = [];
  const halo: string[] = [];
  for (let k = 0; k < LEVELS; k += 1) {
    const b = (k / (LEVELS - 1)) * MAX_B;
    const [l, c, h] = at(b);
    glass.push(`oklch(${r3(l)} ${r3(c)} ${r1(h)})`);
    halo.push(
      String(
        r3(Math.min(1, Math.pow(Math.min(b, 1.25), 1.6) * (0.3 + 0.55 * g))),
      ),
    );
  }
  const [l, c, h] = at(1);
  return { glass, halo, rest: `oklch(${r3(l)} ${r3(c)} ${r1(h)})` };
}

const FACE = "oklch(0.235 0.032 32)";
const SOCKET = "oklch(0.15 0.018 35)";

/* The step response of springs.recoil (ζ ≈ 0.53): a cold tungsten filament
   draws an inrush, so a bulb flashes about 14% past its rest brightness
   before it settles — the overshoot is the physics, not a flourish. */
const RECOIL_W = Math.sqrt(springs.recoil.stiffness / springs.recoil.mass);
const RECOIL_Z =
  springs.recoil.damping /
  (2 * Math.sqrt(springs.recoil.stiffness * springs.recoil.mass));
const RECOIL_WD = RECOIL_W * Math.sqrt(1 - RECOIL_Z * RECOIL_Z);
const warmUp = (ms: number) => {
  if (ms <= 0) return 0;
  const t = ms / 1000;
  const e = Math.exp(-RECOIL_Z * RECOIL_W * t);
  return (
    1 -
    e *
      (Math.cos(RECOIL_WD * t) +
        ((RECOIL_Z * RECOIL_W) / RECOIL_WD) * Math.sin(RECOIL_WD * t))
  );
};
/** Under reduced motion a bulb simply fades up. */
const fadeUp = (ms: number) => {
  const t = clamp01(ms / 240);
  return t * t * (3 - 2 * t);
};
/** A filament cools fast: most of its light is gone in a tenth of a second. */
const COOL_MS = 85;
/** The sparkle a pointer or a key runs through a letter. */
const PULSE_MS = 170;
const PULSE_GAP = 16;
/** A letter that sparkled rests this long before it can again, ms. */
const SPARKLE_COOLDOWN = 650;

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type FrameLayout = { w: number; h: number; r: number; pts: Pt[] };

type Engine = {
  glass: SVGElement[];
  halo: SVGElement[];
  /** First bulb of each letter, and one past its last. */
  from: Int32Array;
  to: Int32Array;
  ignite: Float64Array;
  offAt: Float64Array;
  offFrom: Float32Array;
  pulse: Float64Array;
  level: Int16Array;
  haloLevel: Int16Array;
  frameGlass: SVGElement[];
  frameHalo: SVGElement[];
  frameLevel: Int16Array;
  /** "off" cold, "lap" the reveal's comet, "rest" the resting pattern. */
  frameMode: "off" | "lap" | "rest";
  lapStart: number;
  lapMs: number;
  phase: number;
  completeAt: number;
  rects: Float32Array;
  rectsValid: boolean;
  cooled: Float64Array;
  lit: boolean;
};

const engineOf = (count: number, letters: number): Engine => ({
  glass: [],
  halo: [],
  from: new Int32Array(letters),
  to: new Int32Array(letters),
  ignite: new Float64Array(count).fill(Number.NaN),
  offAt: new Float64Array(count).fill(Number.NaN),
  offFrom: new Float32Array(count),
  pulse: new Float64Array(count).fill(Number.NaN),
  level: new Int16Array(count).fill(-1),
  haloLevel: new Int16Array(count).fill(-1),
  frameGlass: [],
  frameHalo: [],
  frameLevel: new Int16Array(0),
  frameMode: "off",
  lapStart: 0,
  lapMs: 700,
  phase: 0,
  completeAt: Number.NaN,
  rects: new Float32Array(letters * 4),
  rectsValid: false,
  cooled: new Float64Array(letters).fill(-Infinity),
  lit: false,
});

type Api = {
  wake: () => void;
  halt: () => void;
  reveal: (wait: number) => void;
  off: () => void;
  relight: () => void;
  bindLetters: () => void;
  bindFrame: () => void;
  repaint: () => void;
  chaseOn: () => void;
};

/**
 * A theatre sign. The headline is spelled in an alphabet of bulbs — each
 * glyph is a set of centre-line strokes and bulbs sit along them at an even
 * pitch — every bulb in a dark socket on a deep enamel face, with a frame of
 * bulbs round the edge.
 *
 * On its trigger the frame's chase runs one lap of the border, then the
 * letters fill bulb by bulb in pen order, letter after letter. Each filament
 * warms like a real one: brightness follows the step response of the recoil
 * spring — a cold filament's inrush flashes past its rest brightness and
 * settles — and its colour is its temperature, dull red through orange to the
 * warm white `warmth` sets. At rest a slow chase keeps the frame alive.
 *
 * Hover runs a sparkle through the letter under the pointer; a press throws
 * the switch, the filaments cool and the reveal runs again. A transparent
 * button over the sign gives the keyboard the same: Enter relights, Left and
 * Right sparkle letter to letter. The text is read once from an sr-only copy;
 * the bulbs are art. The bulbs are drawn directly by one loop that runs only
 * while something changes; the resting chase is a timer and CSS fades.
 * Under reduced motion every bulb fades up together and the frame holds still.
 */
export function BulbMarquee({
  children,
  text,
  as = "p",
  bulbSize = 1,
  chase = 4,
  warmth = 0.6,
  glow = 0.6,
  pattern = "chase",
  frame = true,
  face = FACE,
  trigger = "inView",
  once = true,
  play = false,
  delay = 0,
  stagger = 70,
  duration = 420,
  interactive = true,
  onStateChange,
  onComplete,
  className,
}: BulbMarqueeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const glowId = `${uid}-glow`;
  const hintId = `${uid}-hint`;
  const line = (typeof children === "string" ? children : text) ?? "";
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);
  const [layout, setLayout] = React.useState<FrameLayout | null>(null);

  const sign = React.useMemo(() => signOf(line, bulbSize), [line, bulbSize]);
  const palette = React.useMemo(() => paletteOf(warmth, glow), [warmth, glow]);
  const d = sign.d;
  const pad = r3(d / 2 + 0.05);
  const steps = clamp(chase, 0, 10);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine>(engineOf(0, 0));
  const raf = React.useRef(0);
  const chaseTimer = React.useRef<number | null>(null);
  const relightTimer = React.useRef<number | null>(null);
  const live = React.useRef(running);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    motionSafe,
    palette,
    frame,
    pattern,
    steps,
    stagger,
    duration,
    onStateChange,
    onComplete,
  });
  const frameRef = React.useRef((now: number) => {
    void now;
  });
  const probe = React.useRef(-1);

  const wake = () => {
    if (raf.current || !live.current) return;
    raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  /** Brightness of one letter bulb at `now`, and whether it is still moving. */
  const brightness = (i: number, now: number, e: Engine): [number, boolean] => {
    const safe = cfg.current.motionSafe;
    let b = 0;
    let moving = false;
    const lit = e.ignite[i] ?? Number.NaN;
    const off = e.offAt[i] ?? Number.NaN;
    if (!Number.isNaN(lit)) {
      const age = now - lit;
      if (age < 0) {
        moving = true;
      } else {
        b = safe ? warmUp(age) : fadeUp(age);
        if (age < (safe ? 700 : 260)) moving = true;
      }
    } else if (!Number.isNaN(off)) {
      const age = now - off;
      const from = e.offFrom[i] ?? 0;
      b = safe
        ? from * Math.exp(-age / COOL_MS)
        : from * (1 - clamp01(age / 150));
      if (b > 0.004) moving = true;
      else e.offAt[i] = Number.NaN;
    }
    const p = e.pulse[i] ?? Number.NaN;
    if (!Number.isNaN(p)) {
      const age = now - p;
      if (age < 0) moving = true;
      else if (age < PULSE_MS) {
        b += 0.38 * Math.sin((Math.PI * age) / PULSE_MS);
        moving = true;
      } else e.pulse[i] = Number.NaN;
    }
    return [b, moving];
  };

  const writeFrame = (j: number, b: number) => {
    const e = engine.current;
    const lvl = levelOf(b);
    const was = e.frameLevel[j] ?? -1;
    if (was === lvl) return;
    e.frameLevel[j] = lvl;
    const pal = cfg.current.palette;
    const glass = e.frameGlass[j];
    const halo = e.frameHalo[j];
    // A filament comes on almost at once and dies away slowly, so the
    // transition is short going up and long coming down: that asymmetry is
    // what draws the chase's comet tail.
    const ms = lvl > was ? "45ms" : "220ms";
    if (glass) {
      glass.style.transitionDuration = ms;
      glass.style.fill = pal.glass[lvl] ?? "";
    }
    if (halo) {
      halo.style.transitionDuration = ms;
      halo.style.opacity = pal.halo[lvl] ?? "0";
    }
  };

  /** The frame's resting pattern for the current chase phase. */
  const restFrame = () => {
    const e = engine.current;
    const c = cfg.current;
    const n = e.frameGlass.length;
    const period = c.pattern === "alternate" ? 2 : 3;
    for (let j = 0; j < n; j += 1) {
      let b: number;
      if (!c.motionSafe) b = j % 3 === 0 ? 1 : 0.6;
      else if (c.steps <= 0) b = 0.92;
      else b = (j + e.phase) % period === 0 ? 1 : 0.12;
      writeFrame(j, b);
    }
  };

  const stopChase = () => {
    if (chaseTimer.current !== null) window.clearTimeout(chaseTimer.current);
    chaseTimer.current = null;
  };

  /** The resting chase: one step per tick, the fades are CSS transitions. */
  const chaseOn = () => {
    stopChase();
    const e = engine.current;
    const c = cfg.current;
    if (e.frameMode !== "rest") return;
    restFrame();
    if (!c.motionSafe || c.steps <= 0 || !live.current) return;
    chaseTimer.current = window.setTimeout(
      () => {
        chaseTimer.current = null;
        const en = engine.current;
        en.phase = (en.phase + 1) % 6;
        api.current?.chaseOn();
      },
      Math.round(1000 / c.steps),
    );
  };

  const step = (now: number) => {
    raf.current = 0;
    const e = engine.current;
    const c = cfg.current;
    const pal = c.palette;
    let busy = false;
    for (let i = 0; i < e.glass.length; i += 1) {
      const [b, moving] = brightness(i, now, e);
      if (moving) busy = true;
      const lvl = levelOf(b);
      if (e.level[i] !== lvl) {
        e.level[i] = lvl;
        const node = e.glass[i];
        if (node) node.style.fill = pal.glass[lvl] ?? "";
      }
      if (e.haloLevel[i] !== lvl) {
        e.haloLevel[i] = lvl;
        const node = e.halo[i];
        if (node) node.style.opacity = pal.halo[lvl] ?? "0";
      }
    }
    if (e.frameMode === "lap") {
      const n = e.frameGlass.length;
      const head = Math.floor(((now - e.lapStart) / e.lapMs) * n);
      if (head < 0) busy = true;
      else if (head > n + 9) {
        e.frameMode = "rest";
        chaseOn();
      } else {
        busy = true;
        for (let j = 0; j < n; j += 1) {
          const behind = head - j;
          writeFrame(
            j,
            behind >= 0 && behind < 3
              ? 1.25
              : behind > 0 && behind < 9
                ? 1
                : 0.05,
          );
        }
      }
    }
    if (!Number.isNaN(e.completeAt) && now >= e.completeAt) {
      e.completeAt = Number.NaN;
      c.onStateChange?.("lit");
      c.onComplete?.();
    }
    if (!Number.isNaN(e.completeAt)) busy = true;
    if (busy && live.current) {
      raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
    }
  };

  /** Lights the sign: the frame's lap, then the letters bulb by bulb. */
  const reveal = (wait: number) => {
    const e = engine.current;
    const c = cfg.current;
    const now = performance.now();
    const t0 = now + Math.max(0, wait);
    e.lit = true;
    e.offAt.fill(Number.NaN);
    e.pulse.fill(Number.NaN);
    let lettersAt = t0;
    if (c.frame && e.frameGlass.length && c.motionSafe) {
      e.frameMode = "lap";
      e.lapStart = t0;
      e.lapMs = clamp(e.frameGlass.length * 9, 520, 900);
      lettersAt = t0 + e.lapMs * 0.7;
      stopChase();
    } else {
      e.frameMode = "rest";
      chaseOn();
    }
    let last = lettersAt;
    for (let li = 0; li < e.from.length; li += 1) {
      const a = e.from[li] ?? 0;
      const z = e.to[li] ?? 0;
      const start = lettersAt + (c.motionSafe ? li * c.stagger : 0);
      const each = c.motionSafe ? c.duration / Math.max(1, z - a - 1) : 0;
      for (let i = a; i < z; i += 1) {
        const at = start + (i - a) * each;
        e.ignite[i] = at;
        last = Math.max(last, at);
      }
    }
    e.completeAt = last + (c.motionSafe ? 380 : 260);
    c.onStateChange?.("warming");
    wake();
  };

  /** Every filament cools; the frame goes dark. */
  const off = () => {
    const e = engine.current;
    const now = performance.now();
    const was = e.lit;
    e.lit = false;
    stopChase();
    if (relightTimer.current !== null)
      window.clearTimeout(relightTimer.current);
    relightTimer.current = null;
    for (let i = 0; i < e.glass.length; i += 1) {
      const [b] = brightness(i, now, e);
      e.ignite[i] = Number.NaN;
      e.pulse[i] = Number.NaN;
      if (b > 0.004) {
        e.offAt[i] = now;
        e.offFrom[i] = b;
      }
    }
    e.completeAt = Number.NaN;
    e.frameMode = "off";
    if (was) cfg.current.onStateChange?.("dark");
    for (let j = 0; j < e.frameGlass.length; j += 1) writeFrame(j, 0);
    wake();
  };

  /** Throws the switch: dark, then the whole reveal again. */
  const relight = () => {
    off();
    relightTimer.current = window.setTimeout(
      () => {
        relightTimer.current = null;
        api.current?.reveal(0);
      },
      cfg.current.motionSafe ? 300 : 170,
    );
  };

  /** Finds the letters' bulbs this render drew; a lit sign stays lit. */
  const bindLetters = () => {
    const root = rootRef.current;
    if (!root) return;
    const prev = engine.current;
    const e = engineOf(sign.count, sign.letters);
    e.glass = Array.from(root.querySelectorAll<SVGElement>("[data-bulb]"));
    e.halo = Array.from(root.querySelectorAll<SVGElement>("[data-halo]"));
    e.frameGlass = prev.frameGlass;
    e.frameHalo = prev.frameHalo;
    e.frameLevel = prev.frameLevel;
    e.frameMode = prev.frameMode;
    e.lapStart = prev.lapStart;
    e.lapMs = prev.lapMs;
    e.phase = prev.phase;
    e.lit = prev.lit;
    let at = 0;
    let li = 0;
    for (const word of sign.words) {
      for (const letter of word.letters) {
        e.from[li] = at;
        at += letter.bulbs.length;
        e.to[li] = at;
        li += 1;
      }
    }
    // New text or a new bulb size on a lit sign arrives lit.
    if (prev.lit) e.ignite.fill(-1e9);
    engine.current = e;
    wake();
  };

  /** Finds the frame's bulbs after a re-layout, keeping the reveal running. */
  const bindFrame = () => {
    const root = rootRef.current;
    if (!root) return;
    const e = engine.current;
    e.frameGlass = Array.from(
      root.querySelectorAll<SVGElement>("[data-frame-bulb]"),
    );
    e.frameHalo = Array.from(
      root.querySelectorAll<SVGElement>("[data-frame-halo]"),
    );
    e.frameLevel = new Int16Array(e.frameGlass.length).fill(-1);
    e.rectsValid = false;
    if (e.frameMode === "rest") chaseOn();
    wake();
  };

  /** A new palette: every bulb is written again from where it stands. */
  const repaint = () => {
    const e = engine.current;
    e.level.fill(-1);
    e.haloLevel.fill(-1);
    e.frameLevel.fill(-1);
    if (e.frameMode === "rest") chaseOn();
    else if (e.frameMode === "off")
      for (let j = 0; j < e.frameGlass.length; j += 1) writeFrame(j, 0);
    wake();
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      motionSafe,
      palette,
      frame,
      pattern,
      steps,
      stagger,
      duration,
      onStateChange,
      onComplete,
    };
    frameRef.current = step;
    live.current = running;
    api.current = {
      wake,
      halt,
      reveal,
      off,
      relight,
      bindLetters,
      bindFrame,
      repaint,
      chaseOn,
    };
  });

  // The bulbs the render drew, found again whenever they change.
  React.useLayoutEffect(() => {
    api.current?.bindLetters();
  }, [sign]);
  React.useLayoutEffect(() => {
    api.current?.bindFrame();
  }, [layout, frame]);

  React.useEffect(() => {
    api.current?.repaint();
  }, [palette, pattern, steps, motionSafe]);

  React.useEffect(() => {
    if (started) api.current?.reveal(delay);
    else api.current?.off();
    // The delay belongs to the trigger, not to a later change of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, entrance.n]);

  React.useEffect(() => {
    if (running) {
      api.current?.wake();
      api.current?.chaseOn();
    } else {
      api.current?.halt();
      if (chaseTimer.current !== null) window.clearTimeout(chaseTimer.current);
      chaseTimer.current = null;
    }
  }, [running]);

  React.useEffect(
    () => () => {
      api.current?.halt();
      if (chaseTimer.current !== null) window.clearTimeout(chaseTimer.current);
      chaseTimer.current = null;
      if (relightTimer.current !== null)
        window.clearTimeout(relightTimer.current);
      relightTimer.current = null;
    },
    [],
  );

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback((restart: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on && !restart ? e : { n: e.n + 1, on: true }));
    }, 0);
  }, []);
  const reset = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin(false);
    if (trigger === "manual") {
      if (play) begin(true);
      else reset();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, begin, reset]);

  const seen = React.useRef({ trigger, once, played: false });
  React.useLayoutEffect(() => {
    seen.current = { ...seen.current, trigger, once };
    if (started) seen.current.played = true;
  });

  // The face's size lays out the frame; whether it is on screen gates every
  // loop and timer.
  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        const t = seen.current;
        if (t.trigger !== "inView") return;
        if (visible) begin(false);
        else if (!t.once && t.played) reset();
      });
      watcher.observe(node);
      return () => watcher.disconnect();
    },
    [begin, reset],
  );

  // Lays the frame out round the face; a new bulb size re-binds (and so
  // re-measures) through a new callback.
  const bindFace = React.useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) return;
      const measure = () => {
        engine.current.rectsValid = false;
        const w = node.offsetWidth;
        const h = node.offsetHeight;
        const em = parseFloat(getComputedStyle(node).fontSize) || 16;
        if (w <= 0 || h <= 0) return;
        const u = UNIT * em;
        const r = (d * u * 0.86) / 2;
        const inset = 0.27 * em;
        const rc = 0.16 * em;
        const iw = Math.max(0, w - 2 * inset - 2 * rc);
        const ih = Math.max(0, h - 2 * inset - 2 * rc);
        const perimeter = 2 * (iw + ih) + 2 * Math.PI * rc;
        const pitch = d * 1.5 * u * 1.12;
        const n = Math.max(12, Math.round(perimeter / pitch / 6) * 6);
        const pts: Pt[] = [];
        const x0 = inset + rc;
        const y0 = inset;
        for (let k = 0; k < n; k += 1) {
          let s = (k / n) * perimeter;
          let p: Pt;
          const arc = (cx: number, cy: number, a0: number, len: number) => {
            const a = a0 + len / rc;
            return { x: cx + rc * Math.cos(a), y: cy + rc * Math.sin(a) };
          };
          const quarter = (Math.PI * rc) / 2;
          if (s < iw) p = { x: x0 + s, y: y0 };
          else if ((s -= iw) < quarter)
            p = arc(x0 + iw, inset + rc, -Math.PI / 2, s);
          else if ((s -= quarter) < ih) p = { x: w - inset, y: inset + rc + s };
          else if ((s -= ih) < quarter) p = arc(x0 + iw, inset + rc + ih, 0, s);
          else if ((s -= quarter) < iw) p = { x: x0 + iw - s, y: h - inset };
          else if ((s -= iw) < quarter)
            p = arc(x0, inset + rc + ih, Math.PI / 2, s);
          else if ((s -= quarter) < ih)
            p = { x: inset, y: inset + rc + ih - s };
          else p = arc(x0, inset + rc, Math.PI, s - ih);
          pts.push({ x: r2(p.x), y: r2(p.y) });
        }
        const next: FrameLayout = { w: r2(w), h: r2(h), r: r2(r), pts };
        setLayout((prev) =>
          prev &&
          prev.w === next.w &&
          prev.h === next.h &&
          prev.r === next.r &&
          prev.pts.length === next.pts.length
            ? prev
            : next,
        );
      };
      const sizer = new ResizeObserver(measure);
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [d],
  );

  /** The letter under a point, from boxes measured on first use. */
  const letterAt = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const e = engine.current;
    if (!root) return -1;
    const rect = root.getBoundingClientRect();
    if (!e.rectsValid) {
      const groups = root.querySelectorAll<SVGGElement>("[data-letter]");
      groups.forEach((g, li) => {
        const r = g.getBoundingClientRect();
        e.rects[li * 4] = r.left - rect.left;
        e.rects[li * 4 + 1] = r.top - rect.top;
        e.rects[li * 4 + 2] = r.right - rect.left;
        e.rects[li * 4 + 3] = r.bottom - rect.top;
      });
      e.rectsValid = true;
    }
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (let li = 0; li < e.from.length; li += 1) {
      const slack = 4;
      if (
        x >= (e.rects[li * 4] ?? 0) - slack &&
        x <= (e.rects[li * 4 + 2] ?? 0) + slack &&
        y >= (e.rects[li * 4 + 1] ?? 0) - slack &&
        y <= (e.rects[li * 4 + 3] ?? 0) + slack
      )
        return li;
    }
    return -1;
  };

  /** A sparkle runs through one letter's bulbs in pen order. */
  const sparkle = (li: number, force = false) => {
    const e = engine.current;
    if (!e.lit || !cfg.current.motionSafe || li < 0) return;
    const now = performance.now();
    if (!force && now - (e.cooled[li] ?? -Infinity) < SPARKLE_COOLDOWN) return;
    e.cooled[li] = now;
    const a = e.from[li] ?? 0;
    const z = e.to[li] ?? 0;
    for (let i = a; i < z; i += 1) {
      const lit = e.ignite[i] ?? Number.NaN;
      // A bulb still warming up is left to finish.
      if (Number.isNaN(lit) || now - lit < 300) continue;
      e.pulse[i] = now + (i - a) * PULSE_GAP;
    }
    wake();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const n = sign.letters;
    if (n === 0) return;
    let to: number;
    switch (event.key) {
      case "ArrowRight":
        to = probe.current < 0 ? 0 : Math.min(n - 1, probe.current + 1);
        break;
      case "ArrowLeft":
        to = probe.current < 0 ? n - 1 : Math.max(0, probe.current - 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = n - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    probe.current = to;
    sparkle(to, true);
  };

  const Tag = as;
  const r = d / 2;

  return (
    <div
      ref={bindRoot}
      className={cn("relative w-full", className)}
      onPointerEnter={() => {
        if (trigger === "hover") begin(!once);
      }}
      onPointerLeave={(event) => {
        if (trigger === "hover" && !once && event.pointerType === "mouse")
          reset();
      }}
      onPointerMove={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        sparkle(letterAt(event.clientX, event.clientY));
      }}
    >
      <Tag className="m-0 block">
        <span className="sr-only">{line}</span>
        <span
          ref={bindFace}
          aria-hidden
          className={cn(
            "relative flex flex-wrap items-center justify-center gap-x-[0.42em] gap-y-[0.3em] rounded-3 select-none",
            frame ? "px-[0.72em] py-[0.62em]" : "px-[0.42em] py-[0.36em]",
          )}
          style={{
            backgroundColor: face,
            backgroundImage:
              "linear-gradient(180deg, oklch(1 0 0 / 0.06), transparent 38%, oklch(0 0 0 / 0.22))",
            boxShadow:
              "inset 0 1px 0 oklch(1 0 0 / 0.08), inset 0 0 0 1px oklch(0 0 0 / 0.35), 0 1px 2px oklch(0 0 0 / 0.25)",
          }}
        >
          <svg width="0" height="0" className="absolute" aria-hidden>
            <defs>
              <radialGradient id={glowId}>
                <stop offset="0%" stopColor={palette.rest} stopOpacity={0.9} />
                <stop
                  offset="34%"
                  stopColor={palette.rest}
                  stopOpacity={0.34}
                />
                <stop offset="100%" stopColor={palette.rest} stopOpacity={0} />
              </radialGradient>
            </defs>
          </svg>
          {frame && layout ? (
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full overflow-visible"
              viewBox={`0 0 ${layout.w} ${layout.h}`}
              preserveAspectRatio="none"
            >
              <g>
                {layout.pts.map((p, j) => (
                  <React.Fragment key={j}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={r2(layout.r * 1.2)}
                      fill={SOCKET}
                    />
                    <circle
                      data-frame-bulb=""
                      cx={p.x}
                      cy={p.y}
                      r={layout.r}
                      fill={palette.glass[0]}
                      style={{
                        transition: "fill 170ms linear, opacity 170ms linear",
                      }}
                    />
                  </React.Fragment>
                ))}
              </g>
              <g>
                {layout.pts.map((p, j) => (
                  <circle
                    key={j}
                    data-frame-halo=""
                    cx={p.x}
                    cy={p.y}
                    r={r2(layout.r * (2 + 1.5 * clamp01(glow)))}
                    fill={`url(#${glowId})`}
                    opacity={0}
                    style={{ transition: "opacity 170ms linear" }}
                  />
                ))}
              </g>
            </svg>
          ) : null}
          {sign.words.map((word) => {
            const width = r3(word.width + 2 * pad);
            const height = r3(6 + 2 * pad);
            return (
              <svg
                key={word.key}
                aria-hidden
                viewBox={`${-pad} ${-pad} ${width} ${height}`}
                className="relative block shrink-0 overflow-visible"
                style={{
                  width: `${r3(width * UNIT)}em`,
                  height: `${r3(height * UNIT)}em`,
                }}
              >
                <g>
                  {word.letters.map((letter, li) => (
                    <g key={li} data-letter={word.first + li}>
                      {letter.bulbs.map((b, k) => {
                        const x = r3(letter.x + b.x);
                        return (
                          <React.Fragment key={k}>
                            <circle
                              cx={x}
                              cy={b.y}
                              r={r3(r * 1.2)}
                              fill={SOCKET}
                            />
                            <circle
                              data-bulb=""
                              cx={x}
                              cy={b.y}
                              r={r3(r * 0.88)}
                              fill={palette.glass[0]}
                            />
                            <circle
                              cx={r3(x - r * 0.24)}
                              cy={r3(b.y - r * 0.28)}
                              r={r3(r * 0.2)}
                              fill="oklch(1 0 0)"
                              opacity={0.32}
                            />
                          </React.Fragment>
                        );
                      })}
                    </g>
                  ))}
                </g>
                <g className="pointer-events-none">
                  {word.letters.map((letter, li) =>
                    letter.bulbs.map((b, k) => (
                      <circle
                        key={`${li}:${k}`}
                        data-halo=""
                        cx={r3(letter.x + b.x)}
                        cy={b.y}
                        r={r3(r * (2 + 1.6 * clamp01(glow)))}
                        fill={`url(#${glowId})`}
                        opacity={0}
                      />
                    )),
                  )}
                </g>
              </svg>
            );
          })}
        </span>
      </Tag>
      {interactive ? (
        <>
          <button
            type="button"
            aria-label="Relight the sign"
            aria-describedby={hintId}
            onClick={() => api.current?.relight()}
            onKeyDown={onKeyDown}
            onBlur={() => {
              probe.current = -1;
            }}
            className="absolute inset-0 cursor-pointer rounded-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Left and Right sparkle the letters one at a time; Enter relights the
            sign.
          </span>
        </>
      ) : null}
    </div>
  );
}
