"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GoldMendGlaze = "celadon" | "ivory" | "indigo" | "tenmoku";
export type GoldMendElement = "h1" | "h2" | "h3" | "p" | "div";
export type GoldMendTrigger = "inView" | "mount" | "manual";

export type GoldMendProps = {
  /** The headline. @default "Mended in gold" */
  text?: string;
  /** The element rendered. @default "h2" */
  as?: GoldMendElement;
  /** The glaze the letters are fired in. @default "celadon" */
  glaze?: GoldMendGlaze;
  /** The width of a mended seam, px. @default 1.6 */
  goldWidth?: number;
  /** How many cracks run out from each break (2 to 9). @default 5 */
  crackCount?: number;
  /** How many side cracks split off the main ones, 0 to 1. @default 0.5 */
  branching?: number;
  /** How far the broken pieces shift apart before the gold closes them, px. @default 3 */
  part?: number;
  /** How long the gold takes to fill the cracks, ms. @default 900 */
  flowTime?: number;
  /** The gold, any CSS colour. @default a gold pigment from the amber token */
  gold?: string;
  /** A glint runs along the new seams as a mend closes. @default true */
  shimmer?: boolean;
  /** Breaks kept; past this the oldest seams are polished away. @default 12 */
  maxBreaks?: number;
  /** Breaks already mended when it first shows, as [x, y] fractions of the headline's box. @default [] */
  defaultBreaks?: [number, number][];
  /** When the headline breaks once by itself, to show what it does: when first seen, at mount, or never. @default "inView" */
  trigger?: GoldMendTrigger;
  /** Any change clears every break and seam. */
  resetKey?: string | number;
  /** Clicks and keys break the headline. @default true */
  interactive?: boolean;
  /** Nothing breaks. @default false */
  disabled?: boolean;
  /** A snap as each break cracks. Off unless asked for. @default false */
  sound?: boolean;
  /** Seeds the crack patterns. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** A break cracked: how many breaks there have been. */
  onBreak?: (count: number) => void;
  /** A break was mended: how many seams the headline now carries. */
  onMend?: (count: number) => void;
  className?: string;
};

type Glaze = { body: string; deep: string; light: string; rim: string };

/** Glazes as pigment: fired colours that look the same on either theme. */
const GLAZES: Record<GoldMendGlaze, Glaze> = {
  celadon: {
    body: "oklch(from var(--success) 0.79 0.055 calc(h + 12))",
    deep: "oklch(from var(--success) 0.6 0.07 calc(h + 12))",
    light: "oklch(from var(--success) 0.96 0.025 calc(h + 12))",
    rim: "oklch(from var(--success) 0.42 0.05 calc(h + 12))",
  },
  ivory: {
    body: "oklch(from var(--warn) 0.92 0.03 h)",
    deep: "oklch(from var(--warn) 0.78 0.045 calc(h - 10))",
    light: "oklch(from var(--warn) 0.995 0.008 h)",
    rim: "oklch(from var(--warn) 0.55 0.045 calc(h - 15))",
  },
  indigo: {
    body: "oklch(from var(--accent-bright) 0.46 0.13 h)",
    deep: "oklch(from var(--accent-bright) 0.31 0.1 h)",
    light: "oklch(from var(--accent-bright) 0.86 0.06 h)",
    rim: "oklch(from var(--accent-bright) 0.22 0.06 h)",
  },
  tenmoku: {
    body: "oklch(from var(--warn) 0.33 0.05 calc(h - 30))",
    deep: "oklch(from var(--warn) 0.2 0.03 calc(h - 30))",
    light: "oklch(from var(--warn) 0.72 0.11 calc(h - 25))",
    rim: "oklch(from var(--warn) 0.14 0.02 calc(h - 30))",
  },
};

const DEFAULT_GOLD = "oklch(from var(--warn) 0.82 0.13 h)";
const SHADOW = "oklch(from var(--ink-2) 0.22 0.01 h)";

/** The crack runs out, s. */
const RUN = 0.09;
/** Gold starts to flow this long after the crack, s. */
const FLOW_AT = 0.18;
/** Reduced motion's crossfade, s. */
const FADE = 0.24;
/** How long the shimmer takes to travel the seams, s. */
const GLINT = 0.6;
/** Breathing room the canvas keeps around the letters for the shadow and the parted pieces, px. */
const PAD = 8;

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

type SpringSpec = { stiffness: number; damping: number; mass: number };

/** A spring from rest at 0 to 1, in closed form at time t, s. */
function springAt(sp: SpringSpec, t: number): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(sp.stiffness / sp.mass);
  const z = sp.damping / (2 * Math.sqrt(sp.stiffness * sp.mass));
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return (
      1 -
      Math.exp(-z * w0 * t) *
        (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t))
    );
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/** The house enter ease, a cubic Bézier, solved for x by a few Newton steps. */
function ease(x: number, curve: readonly number[] = easings.enter): number {
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = curve;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bx = (t: number) =>
    3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) =>
    3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  let t = x;
  for (let i = 0; i < 6; i += 1) {
    const d =
      3 * (1 - t) * (1 - t) * x1 +
      6 * (1 - t) * t * (x2 - x1) +
      3 * t * t * (1 - x2);
    if (Math.abs(d) < 1e-6) break;
    t = clamp(t - (bx(t) - x) / d, 0, 1);
  }
  return by(t);
}

type Pt = { x: number; y: number };
type Line = { pts: Pt[]; cum: number[]; len: number };

const lineOf = (pts: Pt[]): Line => {
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1] as Pt;
    const b = pts[i] as Pt;
    cum.push((cum[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return { pts, cum, len: cum[cum.length - 1] ?? 0 };
};

type Geometry = {
  ox: number;
  oy: number;
  cracks: Line[];
  branches: { line: Line; from: number }[];
  wedges: Pt[][];
  offsets: Pt[];
};

/**
 * One break's cracks and pieces in a box (px, the canvas's own frame).
 * Radial cracks are seeded random walks that wobble but stay in their own
 * sector, so they never cross and their exits run round the box in order;
 * each wedge is then the break point, one crack, the box's edge round to the
 * next crack, and that crack back. Side cracks only decorate.
 */
function breakGeometry(
  seed: number,
  ox: number,
  oy: number,
  w: number,
  h: number,
  count: number,
  branching: number,
  part: number,
): Geometry {
  const rand = lcg(seed);
  const n = clamp(Math.round(count), 2, 9);
  const sector = (Math.PI * 2) / n;
  const a0 = rand() * Math.PI * 2;
  const angles: number[] = [];
  for (let i = 0; i < n; i += 1) {
    angles.push(a0 + i * sector + (rand() - 0.5) * sector * 0.45);
  }
  const inside = (p: Pt) => p.x > 0 && p.x < w && p.y > 0 && p.y < h;
  const toEdge = (p: Pt, q: Pt): Pt => {
    // Where the segment p→q leaves the box.
    let t = 1;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    if (q.x < 0 && dx !== 0) t = Math.min(t, -p.x / dx);
    if (q.x > w && dx !== 0) t = Math.min(t, (w - p.x) / dx);
    if (q.y < 0 && dy !== 0) t = Math.min(t, -p.y / dy);
    if (q.y > h && dy !== 0) t = Math.min(t, (h - p.y) / dy);
    t = clamp(t, 0, 1);
    return {
      x: clamp(p.x + dx * t, 0, w),
      y: clamp(p.y + dy * t, 0, h),
    };
  };
  const cracks: Line[] = [];
  const branches: { line: Line; from: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const target = angles[i] ?? 0;
    let dir = target;
    let p: Pt = { x: ox, y: oy };
    const pts: Pt[] = [p];
    for (let k = 0; k < 400; k += 1) {
      const step = 5 + rand() * 5;
      dir += (rand() - 0.5) * 0.55;
      // Stay in the sector: steer back toward the crack's own bearing.
      if (k > 0) {
        const bearing = Math.atan2(p.y - oy, p.x - ox);
        let off = bearing - target;
        off = Math.atan2(Math.sin(off), Math.cos(off));
        if (Math.abs(off) > sector * 0.28) dir -= off * 0.6;
      }
      const q = {
        x: p.x + Math.cos(dir) * step,
        y: p.y + Math.sin(dir) * step,
      };
      if (!inside(q)) {
        pts.push(toEdge(p, q));
        break;
      }
      pts.push(q);
      p = q;
    }
    const line = lineOf(pts);
    cracks.push(line);
    // Side cracks split off and die out; they part nothing.
    for (let j = 3; j < pts.length - 2; j += 1) {
      if (rand() > branching * 0.16) continue;
      const at = pts[j] as Pt;
      let bd = dir + (rand() < 0.5 ? -1 : 1) * (0.45 + rand() * 0.5);
      const prev = pts[j - 1] as Pt;
      bd = Math.atan2(at.y - prev.y, at.x - prev.x) + (bd - dir);
      const bpts: Pt[] = [at];
      let bp = at;
      const reach = 10 + rand() * 30 * (0.5 + branching);
      let gone = 0;
      while (gone < reach) {
        const st = 3 + rand() * 3;
        bd += (rand() - 0.5) * 0.6;
        const q = { x: bp.x + Math.cos(bd) * st, y: bp.y + Math.sin(bd) * st };
        if (!inside(q)) break;
        bpts.push(q);
        bp = q;
        gone += st;
      }
      if (bpts.length > 1)
        branches.push({ line: lineOf(bpts), from: line.cum[j] ?? 0 });
    }
  }
  // Perimeter position, clockwise from the top-left corner.
  const per = (p: Pt) => {
    if (p.y <= 0.001) return p.x;
    if (p.x >= w - 0.001) return w + p.y;
    if (p.y >= h - 0.001) return w + h + (w - p.x);
    return 2 * w + h + (h - p.y);
  };
  const corners: [number, Pt][] = [
    [0, { x: 0, y: 0 }],
    [w, { x: w, y: 0 }],
    [w + h, { x: w, y: h }],
    [2 * w + h, { x: 0, y: h }],
  ];
  const total = 2 * (w + h);
  const wedges: Pt[][] = [];
  const offsets: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = cracks[i] as Line;
    const b = cracks[(i + 1) % n] as Line;
    const ea = a.pts[a.pts.length - 1] as Pt;
    const eb = b.pts[b.pts.length - 1] as Pt;
    const pa = per(ea);
    let pb = per(eb);
    if (pb <= pa) pb += total;
    const walk: Pt[] = [];
    for (const lap of [0, total]) {
      for (const [pc, c] of corners) {
        const at = pc + lap;
        if (at > pa && at < pb) walk.push(c);
      }
    }
    wedges.push([...a.pts, ...walk, ...[...b.pts].reverse()]);
    const lo = angles[i] ?? 0;
    const hi = (angles[(i + 1) % n] ?? 0) + (i === n - 1 ? Math.PI * 2 : 0);
    const mid = (lo + hi) / 2;
    const k = part * (0.65 + rand() * 0.35);
    offsets.push({ x: Math.cos(mid) * k, y: Math.sin(mid) * k });
  }
  return { ox, oy, cracks, branches, wedges, offsets };
}

type Word = { text: string; x: number; y: number; w: number; h: number };

type Config = {
  glaze: GoldMendGlaze;
  colorKey: string;
  goldWidth: number;
  crackCount: number;
  branching: number;
  part: number;
  flowTime: number;
  shimmer: boolean;
  maxBreaks: number;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Break = { fx: number; fy: number; seed: number };

type Report = {
  broke: (count: number, x: number) => void;
  mended: (seams: number) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  layout: () => void;
  readColours: () => void;
  strike: (x: number, y: number, byVisitor: boolean) => void;
  strikeCentre: () => void;
  reset: () => void;
  setBreaks: (list: [number, number][]) => void;
  wake: () => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLElement,
  textEl: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  report: { current: Report },
): Engine {
  const ctx = canvas.getContext("2d");
  const plate = document.createElement("canvas");
  const work = document.createElement("canvas");
  const goldLayer = document.createElement("canvas");
  let cfg: Config | null = null;
  const size = { w: 0, h: 0, dpr: 1 };
  let words: Word[] = [];
  let font = "";
  let spacing = "0px";
  let ink: Record<string, string> = {};
  let breaks: Break[] = [];
  let count = 0;
  let keyed = 0;
  let frame = 0;
  let disposed = false;
  let started = false;
  let active: {
    g: Geometry;
    t0: number;
    t: number;
    last: number;
  } | null = null;

  const read = (() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const x = c.getContext("2d", { willReadFrequently: true });
    return (colour: string) => {
      if (!x) return colour;
      x.clearRect(0, 0, 1, 1);
      x.fillStyle = "rgb(128, 128, 128)";
      x.fillStyle = colour;
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return `rgb(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0})`;
    };
  })();

  const readColours = () => {
    const names = [
      "body",
      "deep",
      "light",
      "rim",
      "gold",
      "goldDeep",
      "goldLight",
      "shadow",
    ];
    const kids = carriers.children;
    const next: Record<string, string> = {};
    names.forEach((name, i) => {
      const el = kids[i];
      next[name] = el ? read(getComputedStyle(el).color) : "gray";
    });
    ink = next;
  };

  const geometryOf = (b: Break) => {
    const c = cfg;
    return breakGeometry(
      b.seed,
      PAD + b.fx * (size.w - PAD * 2),
      PAD + b.fy * (size.h - PAD * 2),
      size.w,
      size.h,
      c?.crackCount ?? 5,
      clamp(c?.branching ?? 0.5, 0, 1),
      Math.max(0, c?.part ?? 3),
    );
  };

  /** Measures every word where the real text laid it out, in the canvas's frame. */
  const measure = () => {
    const box = root.getBoundingClientRect();
    const spans = textEl.querySelectorAll<HTMLElement>("[data-word]");
    const next: Word[] = [];
    spans.forEach((span) => {
      const r = span.getBoundingClientRect();
      next.push({
        text: span.textContent ?? "",
        x: r.left - box.left - root.clientLeft,
        y: r.top - box.top - root.clientTop,
        w: r.width,
        h: r.height,
      });
    });
    words = next;
    const cs = getComputedStyle(textEl);
    font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    spacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
  };

  const setFont = (c: CanvasRenderingContext2D) => {
    c.font = font;
    (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      spacing;
    c.textBaseline = "alphabetic";
    c.textAlign = "left";
  };

  /** A word's baseline: inline boxes are their font's ascent plus descent tall. */
  const baselineOf = (c: CanvasRenderingContext2D, word: Word) => {
    const m = c.measureText(word.text);
    const asc = m.fontBoundingBoxAscent || word.h * 0.8;
    const desc = m.fontBoundingBoxDescent || word.h * 0.2;
    return word.y + (word.h - (asc + desc)) / 2 + asc;
  };

  /** The glazed letters, no seams: body pooled deeper toward the foot, a glossy band, an inner rim. */
  const paintLetters = (c: CanvasRenderingContext2D) => {
    const d = size.dpr;
    c.setTransform(d, 0, 0, d, 0, 0);
    setFont(c);
    for (const word of words) {
      const base = baselineOf(c, word);
      const g = c.createLinearGradient(0, word.y, 0, word.y + word.h);
      g.addColorStop(0, ink.light ?? "white");
      g.addColorStop(0.3, ink.body ?? "gray");
      g.addColorStop(0.78, ink.body ?? "gray");
      g.addColorStop(1, ink.deep ?? "gray");
      c.fillStyle = g;
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
      c.fillText(word.text, word.x, base);
    }
    // The gloss: a soft reflected band across the upper letters.
    c.globalCompositeOperation = "source-atop";
    for (const word of words) {
      const g = c.createLinearGradient(
        0,
        word.y + word.h * 0.12,
        0,
        word.y + word.h * 0.5,
      );
      g.addColorStop(0, "rgba(255, 255, 255, 0)");
      g.addColorStop(0.45, "rgba(255, 255, 255, 0.42)");
      g.addColorStop(1, "rgba(255, 255, 255, 0)");
      c.fillStyle = g;
      c.fillRect(word.x - 4, word.y, word.w + 8, word.h);
    }
    // The rim: the glaze thins at every edge, an inner line of the clay's colour.
    c.strokeStyle = ink.rim ?? "black";
    c.lineWidth = 1.1;
    c.globalAlpha = 0.32;
    for (const word of words)
      c.strokeText(word.text, word.x, baselineOf(c, word));
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";
    c.setTransform(1, 0, 0, 1, 0, 0);
  };

  const tracePartial = (
    c: CanvasRenderingContext2D,
    line: Line,
    upTo: number,
  ) => {
    const pts = line.pts;
    const first = pts[0];
    if (!first || upTo <= 0) return;
    c.moveTo(first.x, first.y);
    for (let i = 1; i < pts.length; i += 1) {
      const p = pts[i] as Pt;
      const at = line.cum[i] ?? 0;
      if (at <= upTo) {
        c.lineTo(p.x, p.y);
        continue;
      }
      const q = pts[i - 1] as Pt;
      const prev = line.cum[i - 1] ?? 0;
      const k = (upTo - prev) / Math.max(1e-6, at - prev);
      c.lineTo(q.x + (p.x - q.x) * k, q.y + (p.y - q.y) * k);
      return;
    }
  };

  /** Strokes a break's cracks and side cracks as far as `reach` (px along each run). */
  const strokeBreak = (
    c: CanvasRenderingContext2D,
    g: Geometry,
    reach: number,
    width: number,
  ) => {
    c.lineWidth = width;
    c.beginPath();
    for (const line of g.cracks) tracePartial(c, line, reach);
    c.stroke();
    c.lineWidth = Math.max(0.6, width * 0.7);
    c.beginPath();
    for (const b of g.branches) tracePartial(c, b.line, reach - b.from);
    c.stroke();
  };

  /** Draws a seam's gold (dark crack edge, gold body, lit ridge), clipped to the glaze by `mask`. */
  const paintGold = (
    target: CanvasRenderingContext2D,
    g: Geometry,
    reach: number,
    width: number,
    mask: HTMLCanvasElement,
    glint: number,
  ) => {
    const d = size.dpr;
    const lc = goldLayer.getContext("2d");
    if (!lc) return;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, goldLayer.width, goldLayer.height);
    lc.setTransform(d, 0, 0, d, 0, 0);
    lc.lineCap = "round";
    lc.lineJoin = "round";
    lc.strokeStyle = ink.goldDeep ?? "brown";
    strokeBreak(lc, g, reach, width + 0.9);
    lc.strokeStyle = ink.gold ?? "gold";
    strokeBreak(lc, g, reach, width);
    lc.strokeStyle = ink.goldLight ?? "white";
    lc.globalAlpha = 0.75;
    strokeBreak(lc, g, reach, Math.max(0.4, width * 0.32));
    lc.globalAlpha = 1;
    if (glint > 0 && glint < 1) {
      // The glint: a bright bead travelling out along every seam.
      const longest = Math.max(1, ...g.cracks.map((l) => l.len));
      const at = glint * longest;
      lc.fillStyle = ink.goldLight ?? "white";
      for (const line of g.cracks) {
        if (at > line.len) continue;
        let i = 1;
        while (i < line.pts.length - 1 && (line.cum[i] ?? 0) < at) i += 1;
        const p = line.pts[i] as Pt;
        const r = width * 1.6 + 1.2;
        const gr = lc.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
        gr.addColorStop(0, "rgba(255, 255, 255, 0.9)");
        gr.addColorStop(1, "rgba(255, 255, 255, 0)");
        lc.fillStyle = gr;
        lc.fillRect(p.x - r * 2.4, p.y - r * 2.4, r * 4.8, r * 4.8);
      }
    }
    lc.setTransform(1, 0, 0, 1, 0, 0);
    // Gold only where there is glaze to mend.
    lc.globalCompositeOperation = "destination-in";
    lc.drawImage(mask, 0, 0);
    lc.globalCompositeOperation = "source-over";
    target.drawImage(goldLayer, 0, 0);
  };

  const seamWidth = () => clamp(cfg?.goldWidth ?? 1.6, 0.3, 6);

  /** The plate: glazed letters with every mended seam baked in. */
  const bakePlate = () => {
    const pc = plate.getContext("2d");
    if (!pc) return;
    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.clearRect(0, 0, plate.width, plate.height);
    paintLetters(pc);
    if (breaks.length === 0) return;
    // The letters alone are the mask for every seam.
    const mask = document.createElement("canvas");
    mask.width = plate.width;
    mask.height = plate.height;
    mask.getContext("2d")?.drawImage(plate, 0, 0);
    for (const b of breaks) {
      const g = geometryOf(b);
      paintGold(pc, g, Number.POSITIVE_INFINITY, seamWidth(), mask, -1);
    }
  };

  // The mask for gold during a break: the plate as it was before it broke.
  const before = document.createElement("canvas");

  const present = (source: HTMLCanvasElement, alpha = 1) => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const d = size.dpr;
    ctx.shadowColor = ink.shadow ?? "black";
    ctx.shadowBlur = 7 * d;
    ctx.shadowOffsetY = 3 * d;
    ctx.globalAlpha = 0.3;
    ctx.drawImage(source, 0, 0);
    ctx.shadowColor = "transparent";
    ctx.globalAlpha = alpha;
    ctx.drawImage(source, 0, 0);
    ctx.globalAlpha = 1;
    if (!started) {
      started = true;
      root.setAttribute("data-live", "");
    }
  };

  const drawFrame = () => {
    const a = active;
    const c = cfg;
    const wc = work.getContext("2d");
    if (!a || !c || !wc) {
      present(plate);
      return;
    }
    const d = size.dpr;
    const t = a.t;
    const flow = Math.max(0.2, c.flowTime / 1000);
    const longest = Math.max(1, ...a.g.cracks.map((l) => l.len));
    wc.setTransform(1, 0, 0, 1, 0, 0);
    wc.clearRect(0, 0, work.width, work.height);
    if (!c.motionSafe) {
      // Reduced motion: the old plate, then the mended one fading in over it.
      wc.drawImage(before, 0, 0);
      const k = clamp(t / FADE, 0, 1);
      wc.globalAlpha = k;
      paintGold(wc, a.g, Number.POSITIVE_INFINITY, seamWidth(), before, -1);
      wc.globalAlpha = 1;
      present(work);
      return;
    }
    const closeAt = FLOW_AT + flow * 0.72;
    const opened = springAt(springs.flick, t - 0.03);
    const closed = springAt(springs.glide, t - closeAt);
    const apart = clamp(opened * (1 - closed), -0.2, 1.4);
    // The pieces, each shifted along its wedge's bisector.
    a.g.wedges.forEach((poly, i) => {
      const off = a.g.offsets[i] ?? { x: 0, y: 0 };
      wc.save();
      wc.setTransform(d, 0, 0, d, off.x * apart * d, off.y * apart * d);
      wc.beginPath();
      poly.forEach((p, k) =>
        k === 0 ? wc.moveTo(p.x, p.y) : wc.lineTo(p.x, p.y),
      );
      wc.closePath();
      wc.clip();
      wc.setTransform(1, 0, 0, 1, off.x * apart * d, off.y * apart * d);
      wc.drawImage(before, 0, 0);
      wc.restore();
    });
    // The crack itself, running out from the point, dark in the glaze.
    const run = ease(clamp(t / RUN, 0, 1)) * (longest + 60);
    wc.setTransform(d, 0, 0, d, 0, 0);
    wc.globalCompositeOperation = "source-atop";
    wc.strokeStyle = ink.rim ?? "black";
    wc.globalAlpha = 0.8 * (1 - clamp((t - FLOW_AT) / flow, 0, 1));
    wc.lineCap = "round";
    strokeBreak(wc, a.g, run, 0.9);
    wc.globalAlpha = 1;
    wc.globalCompositeOperation = "source-over";
    wc.setTransform(1, 0, 0, 1, 0, 0);
    // The gold, flowing out from the break point, wide enough to fill the
    // gap, narrowing to the seam as the pieces close on it.
    const f = ease(clamp((t - FLOW_AT) / flow, 0, 1));
    if (f > 0) {
      const gap = Math.max(0, c.part) * 0.9 * Math.max(0, apart);
      const glint = c.shimmer
        ? clamp((t - (closeAt + 0.32)) / GLINT, 0, 1)
        : -1;
      paintGold(wc, a.g, f * (longest + 60), seamWidth() + gap, before, glint);
    }
    present(work);
  };

  const finishActive = () => {
    const a = active;
    if (!a) return;
    active = null;
    bakePlate();
    report.current.mended(breaks.length);
  };

  const duration = () => {
    const c = cfg;
    if (!c) return 0;
    if (!c.motionSafe) return FADE;
    const flow = Math.max(0.2, c.flowTime / 1000);
    return FLOW_AT + flow * 0.72 + 0.32 + (c.shimmer ? GLINT : 0.15);
  };

  const tick = (now: number) => {
    frame = 0;
    const a = active;
    if (disposed || !a) return;
    if (!visible.current || document.hidden) {
      // Off screen there is nothing to watch: finish it.
      finishActive();
      present(plate);
      return;
    }
    a.t += a.last ? Math.min(0.05, (now - a.last) / 1000) : 1 / 60;
    a.last = now;
    if (a.t >= duration()) {
      finishActive();
      present(plate);
      return;
    }
    drawFrame();
    frame = window.requestAnimationFrame(tick);
  };

  const strike = (bx: number, by: number, byVisitor: boolean) => {
    const c = cfg;
    if (!c || size.w < 1) return;
    if (active) finishActive();
    const fx = clamp((bx - PAD) / Math.max(1, size.w - PAD * 2), 0, 1);
    const fy = clamp((by - PAD) / Math.max(1, size.h - PAD * 2), 0, 1);
    const b: Break = { fx, fy, seed: c.seed * 7919 + count * 104729 + 13 };
    count += 1;
    // The mask for this break is the plate as it stands before it.
    before.width = plate.width;
    before.height = plate.height;
    before.getContext("2d")?.drawImage(plate, 0, 0);
    breaks.push(b);
    const cap = Math.max(1, Math.round(c.maxBreaks));
    while (breaks.length > cap) breaks.shift();
    active = { g: geometryOf(b), t0: 0, t: 0, last: 0 };
    report.current.broke(count, byVisitor ? bx : -1);
    if (!visible.current || document.hidden) {
      finishActive();
      present(plate);
      return;
    }
    drawFrame();
    if (!frame) frame = window.requestAnimationFrame(tick);
  };

  const layout = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const d = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    size.w = w;
    size.h = h;
    size.dpr = d;
    const bw = Math.max(1, Math.round(w * d));
    const bh = Math.max(1, Math.round(h * d));
    for (const c of [canvas, plate, work, goldLayer]) {
      if (c.width !== bw || c.height !== bh) {
        c.width = bw;
        c.height = bh;
      }
    }
    measure();
    if (active) finishActive();
    bakePlate();
    present(plate);
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        readColours();
        layout();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      if (was.dpr !== next.dpr) {
        layout();
        return;
      }
      if (
        was.colorKey !== next.colorKey ||
        was.goldWidth !== next.goldWidth ||
        was.crackCount !== next.crackCount ||
        was.branching !== next.branching ||
        was.maxBreaks !== next.maxBreaks
      ) {
        if (active) finishActive();
        while (breaks.length > Math.max(1, Math.round(next.maxBreaks)))
          breaks.shift();
        bakePlate();
        present(plate);
      }
    },
    layout,
    readColours() {
      readColours();
      bakePlate();
      present(plate);
    },
    strike,
    strikeCentre() {
      // Later keyboard breaks spiral round the centre at the golden angle.
      const k = keyed;
      keyed += 1;
      const r = k === 0 ? 0 : Math.min(size.w, size.h) * 0.2 * Math.sqrt(k);
      const a = k * 2.39996;
      strike(
        size.w / 2 + Math.cos(a) * r * 1.6,
        size.h / 2 + Math.sin(a) * r * 0.6,
        true,
      );
    },
    reset() {
      if (active) {
        active = null;
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
      }
      breaks = [];
      keyed = 0;
      bakePlate();
      present(plate);
    },
    setBreaks(list) {
      breaks = list.map(([fx, fy], i) => ({
        fx: clamp(fx, 0, 1),
        fy: clamp(fy, 0, 1),
        seed: (cfg?.seed ?? 1) * 7919 + 500009 + i * 104729,
      }));
      bakePlate();
      present(plate);
    },
    wake() {
      if (active && !frame) frame = window.requestAnimationFrame(tick);
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      active = null;
      root.removeAttribute("data-live");
    },
  };
}

/** Splits text into words for measuring; spaces stay real text between them. */
const wordsOf = (text: string) => text.split(/(\s+)/).filter((p) => p !== "");

/**
 * A headline glazed like a ceramic plate — a glaze pooled deeper toward each
 * letter's foot, a glossy reflection across the top, a thin rim where it
 * thins at the edges, a short soft shadow beneath. Click and it cracks from
 * that point: seeded cracks run out to the edge in 90 ms with a snap, side
 * cracks split off them, and the pieces shift a hair apart on the flick
 * spring. Then gold flows into every crack from the break point outward,
 * wide enough to fill the gap; as it reaches the tips the pieces close on
 * the glide spring and the gold narrows to a bright seam, and a glint runs
 * along it. Every break adds new seams, drawn only on the glaze, so the
 * headline grows richer the more it is broken.
 *
 * The real text stays HTML — selectable, read once, laid out by the page —
 * and a canvas mirrors it word by word. Enter or Space breaks it at the
 * centre. Under reduced motion the crack and its gold arrive together by a
 * short crossfade, and nothing parts.
 */
export function GoldMend({
  text = "Mended in gold",
  as = "h2",
  glaze = "celadon",
  goldWidth = 1.6,
  crackCount = 5,
  branching = 0.5,
  part = 3,
  flowTime = 900,
  gold = DEFAULT_GOLD,
  shimmer = true,
  maxBreaks = 12,
  defaultBreaks,
  trigger = "inView",
  resetKey,
  interactive = true,
  disabled = false,
  sound = false,
  seed = 1,
  dpr = 2,
  onBreak,
  onMend,
  className,
}: GoldMendProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const live = interactive && !disabled;
  const g = GLAZES[glaze] ?? GLAZES.celadon;
  const paints = React.useMemo(
    () => [
      g.body,
      g.deep,
      g.light,
      g.rim,
      gold,
      `oklch(from ${gold} calc(l - 0.24) c calc(h - 10))`,
      `oklch(from ${gold} 0.97 calc(c * 0.5) h)`,
      SHADOW,
    ],
    [g, gold],
  );

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const rootRef = React.useRef<HTMLElement | null>(null);
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const callbacks = React.useRef({ onBreak, onMend, audio });
  const report = React.useRef<Report>({
    broke: (count, x) => {
      if (x >= 0) {
        const root = rootRef.current;
        const pan = root
          ? panFrom(root.getBoundingClientRect().left + x, root)
          : 0;
        callbacks.current.audio.play("snap", {
          pitch: 0.9 + ((count * 37) % 10) / 40,
          gain: 0.6,
          pan,
        });
      }
      callbacks.current.onBreak?.(count);
    },
    mended: (seams) => {
      setSaid((s) => ({
        n: s.n + 1,
        text: `Mended. ${seams} ${seams === 1 ? "seam" : "seams"}.`,
      }));
      callbacks.current.onMend?.(seams);
    },
  });

  const config: Config = {
    glaze,
    colorKey: paints.join("|"),
    goldWidth,
    crackCount,
    branching,
    part,
    flowTime: Math.max(200, flowTime),
    shimmer,
    maxBreaks,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);
  const initial = React.useRef(defaultBreaks ?? []);
  const auto = React.useRef(trigger);
  // A disabled headline does not break itself either.
  const able = React.useRef(live);

  React.useEffect(() => {
    callbacks.current = { onBreak, onMend, audio };
    able.current = live;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const textEl = textRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !textEl || !canvas || !carriers) return;
    const e = createEngine(root, textEl, canvas, carriers, visible, report);
    engine.current = e;
    e.configure(latest.current);
    if (initial.current.length) e.setBreaks(initial.current);
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) engine.current?.layout();
    });
    // The arrival break, once: at mount, or the first time it is seen.
    let timer = 0;
    if (auto.current === "mount" && !shown.current && able.current) {
      timer = window.setTimeout(() => {
        shown.current = true;
        engine.current?.strike(
          root.clientWidth * 0.38,
          root.clientHeight * 0.45,
          false,
        );
      }, 420);
    }
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
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

  const lastReset = React.useRef(resetKey);
  React.useEffect(() => {
    if (lastReset.current === resetKey) return;
    lastReset.current = resetKey;
    engine.current?.reset();
  }, [resetKey]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.layout());
    sizer.observe(node);
    let arrival = 0;
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        if (!visible.current) return;
        engine.current?.wake();
        if (
          auto.current === "inView" &&
          !shown.current &&
          !arrival &&
          able.current
        ) {
          arrival = window.setTimeout(() => {
            arrival = 0;
            if (shown.current || !visible.current) return;
            shown.current = true;
            engine.current?.strike(
              node.clientWidth * 0.38,
              node.clientHeight * 0.45,
              false,
            );
          }, 600);
        }
      },
      { threshold: 0.6 },
    );
    watcher.observe(node);
    return () => {
      if (arrival) window.clearTimeout(arrival);
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const onClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!live || event.detail > 1) return;
    // A drag that selected words is reading, not breaking.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    shown.current = true;
    engine.current?.strike(
      event.clientX - r.left - root.clientLeft,
      event.clientY - r.top - root.clientTop,
      true,
    );
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!live) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (event.repeat) return;
    shown.current = true;
    engine.current?.strikeCentre();
  };

  const Tag = as as React.ElementType;
  const parts = React.useMemo(() => wordsOf(text), [text]);

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={live ? 0 : undefined}
        aria-describedby={live ? hintId : undefined}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={cn(
          "group/gold-mend relative isolate block p-2",
          live &&
            "cursor-crosshair rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
      >
        <span
          ref={textRef}
          // The server's glaze is CSS on the real text; once the canvas
          // is live the class drops it (an inline background would win).
          className="relative z-10 bg-(image:--gold-mend-glaze) box-decoration-clone bg-clip-text text-transparent group-data-live/gold-mend:bg-none"
          style={
            {
              "--gold-mend-glaze": `linear-gradient(to bottom, ${g.light} 0%, ${g.body} 32%, ${g.body} 76%, ${g.deep} 100%)`,
            } as React.CSSProperties
          }
        >
          {parts.map((part, i) =>
            /^\s+$/.test(part) ? (
              part
            ) : (
              <span key={i} data-word="">
                {part}
              </span>
            ),
          )}
        </span>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
        <span
          ref={carriersRef}
          aria-hidden
          onTransitionEnd={() => engine.current?.readColours()}
          className="pointer-events-none absolute size-0 overflow-hidden"
        >
          {paints.map((c, i) => (
            <span
              key={i}
              className="transition-colors duration-1"
              style={{ color: c }}
            />
          ))}
        </span>
      </Tag>
      {live ? (
        <span id={hintId} className="sr-only">
          Click to break the headline, or press Enter to break it at the centre.
          Each break is mended in gold.
        </span>
      ) : null}
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </>
  );
}
