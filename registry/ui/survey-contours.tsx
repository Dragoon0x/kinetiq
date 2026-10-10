"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SurveyContoursProps = {
  /** The content above the sheet: a hero, a heading, a call to action. */
  children?: React.ReactNode;
  /** The height between one contour line and the next, in the sheet's units. @default 20 */
  interval?: number;
  /** How heavy the lines are drawn, 0.5 to 2; every fifth line is heavier still. @default 1 */
  weight?: number;
  /** Print the elevation on the heavy lines (breaking each line under its label), spot heights on the highest summits, and a spot height on the raised hill. @default true */
  labels?: boolean;
  /** How far the land rises from its lowest point to its highest, in the sheet's units. @default 360 */
  relief?: number;
  /** The size of the hills and valleys, 0.5 to 2. @default 1 */
  scale?: number;
  /** How much the land swells and settles as it breathes, 0 to 1. @default 0.5 */
  breathe?: number;
  /** How fast the land breathes, 0 to 2; 0 holds it still. @default 1 */
  speed?: number;
  /** How strongly the high ground is tinted, 0 to 1. @default 0.35 */
  tint?: number;
  /** The contour lines' colour, as a CSS colour. @default the foreground mixed into the page */
  lineColor?: string;
  /** The colour the lines take round the raised hill, as a CSS colour. @default "var(--accent-bright)" */
  hillColor?: string;
  /** The colour the high ground leans toward, as a CSS colour. @default "var(--accent)" */
  tintColor?: string;
  /** The unit printed after the spot height. @default "m" */
  unit?: string;
  /** The hand raises a hill under it and a press heaves it higher. @default true */
  interactive?: boolean;
  /** How high the hand raises the land, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** The width of the raised hill, in CSS px. @default 70 */
  radius?: number;
  /** Picks the landscape: the same seed surveys the same land. @default 1 */
  seed?: number;
  /** Holds the land still; the hand still raises its hill. @default false */
  paused?: boolean;
  /** Ink the higher contours in, lower to higher, the first time the sheet is seen; the lowlands are drawn from the start. @default true */
  intro?: boolean;
  /** The highest device pixel ratio the lines are drawn at, never above 2. @default 2 */
  dpr?: number;
  /** Reports the raised hill's summit once it settles, and null once it has subsided. */
  onSummitChange?: (elevation: number | null) => void;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
  /** Classes for the content layer above the sheet. */
  contentClassName?: string;
};

const DEFAULT_LINE =
  "color-mix(in oklab, var(--foreground) 46%, var(--background))";

/** The lowest contour on the sheet sits this far above datum. */
const DATUM = 120;
/** Most grid cells the sheet is surveyed on; the cell grows with the box. */
const MAX_CELLS = 9000;
/** Fixed sub-step for the springs, so a long frame never destabilises them. */
const STEP = 1 / 240;
/** How far apart label columns stand, in CSS px. */
const LABEL_SPACING = 105;
const LABEL_FADE = 0.12;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The props a background leaves to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Rgb = readonly [number, number, number];
type SpringConfig = { stiffness: number; damping: number; mass: number };
type Axis = { x: number; v: number };

/** One semi-implicit Euler step of a spring toward `to`. */
function stepSpring(a: Axis, to: number, s: SpringConfig, dt: number) {
  const acc = (-s.stiffness * (a.x - to) - s.damping * a.v) / s.mass;
  a.v += acc * dt;
  a.x += a.v * dt;
}

/** Settles a spring that is within `eps` of its target and barely moving. */
function rest(a: Axis, to: number, eps: number): boolean {
  if (Math.abs(a.x - to) < eps && Math.abs(a.v) < eps * 8) {
    a.x = to;
    a.v = 0;
    return true;
  }
  return false;
}

/** Any CSS colour the canvas understands, as sRGB bytes, by painting one pixel. */
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

const css = (c: Rgb, a = 1) =>
  `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.round(a * 1000) / 1000})`;

/** Seeded value noise and fbm over the plane: the same land every time. */
function landNoise(seed: number) {
  const table = new Float32Array(512);
  let s = Math.imul(seed | 0, 2654435761) >>> 0 || 1;
  for (let i = 0; i < 512; i += 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    table[i] = s / 4294967296;
  }
  const at = (ix: number, iy: number) =>
    table[(((ix * 73856093) ^ (iy * 19349663)) >>> 0) & 511] ?? 0;
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy);
    const b = at(ix + 1, iy);
    const c = at(ix, iy + 1);
    const d = at(ix + 1, iy + 1);
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
  };
  return (x: number, y: number) => {
    // Four octaves that fall away a little faster than halves: hills and
    // spurs, not pinholes.
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    let total = 0;
    for (let o = 0; o < 4; o += 1) {
      sum += amp * noise(x * f + o * 17.3, y * f - o * 9.1);
      total += amp;
      f *= 2.03;
      amp *= 0.44;
    }
    return sum / total;
  };
}

type Sheet = {
  w: number;
  h: number;
  dpr: number;
  cell: number;
  gw: number;
  gh: number;
  /** Three surveys of the land, blended as it breathes, each 0..1. */
  fields: [Float32Array, Float32Array, Float32Array];
  /** The land this frame, in the sheet's units. */
  height: Float32Array;
  /** Which label column (or -1) each column of cells holds. */
  colOf: Int16Array;
  columns: Float32Array;
  tint: ImageData;
};

type Label = {
  y: number;
  angle: number;
  alpha: number;
  seen: boolean;
  text: string;
  width: number;
  x: number;
};

/** A spot height on one of the sheet's summits, tracked as the land breathes. */
type Peak = {
  x: number;
  y: number;
  e: number;
  alpha: number;
  seen: boolean;
};

type Look = {
  line: Rgb;
  hill: Rgb;
  tint: Rgb;
  page: Rgb;
  font: string;
};

type Api = {
  refresh: (rebuild: boolean) => void;
  recolor: () => void;
  local: (clientX: number, clientY: number) => { x: number; y: number };
  aim: (x: number, y: number, source: "pointer" | "focus") => void;
  away: (source: "pointer" | "focus" | null) => void;
  press: (down: boolean) => void;
};

/**
 * A background that is a living topographic sheet: contour lines traced
 * from a slowly breathing height field — every fifth an index contour,
 * heavier, with its elevation printed small along it and the line broken
 * under the figures as a cartographer would — with spot heights on the
 * highest summits, over a faint tint that leans toward the high ground.
 *
 * The hand raises a hill: the land under the pointer rises on the drift
 * spring, new rings bloom round it in the hill colour, and a spot height
 * rides the summit with its figure rolling as it climbs; a press heaves the
 * hill higher on the recoil spring, so the rings ripple out and back with
 * each bounce. The lowlands are drawn from the first frame; the first time
 * the sheet is seen the rest of the survey inks in, lower to higher.
 * Keyboard focus on content inside the sheet raises
 * the hill under the focused element.
 *
 * Canvas 2D. Three height fields are surveyed once per size and blended each
 * frame, so the land breathes without any noise per frame; marching squares
 * visit only the levels each cell spans. The loop runs only on screen, in a
 * visible page, and while the land breathes or the hill moves. Under reduced
 * motion the sheet is still and the hill stands at once under the hand.
 */
export function SurveyContours({
  children,
  interval = 20,
  weight = 1,
  labels = true,
  relief = 360,
  scale = 1,
  breathe = 0.5,
  speed = 1,
  tint = 0.35,
  lineColor = DEFAULT_LINE,
  hillColor = "var(--accent-bright)",
  tintColor = "var(--accent)",
  unit = "m",
  interactive = true,
  pointerStrength = 0.7,
  radius = 70,
  seed = 1,
  paused = false,
  intro = true,
  dpr = 2,
  onSummitChange,
  className,
  contentClassName,
}: SurveyContoursProps) {
  const motionSafe = useMotionSafe();

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const tintRef = React.useRef<HTMLCanvasElement | null>(null);
  const linesRef = React.useRef<HTMLCanvasElement | null>(null);
  const lineCarrier = React.useRef<HTMLSpanElement | null>(null);
  const hillCarrier = React.useRef<HTMLSpanElement | null>(null);
  const tintCarrier = React.useRef<HTMLSpanElement | null>(null);
  const pageCarrier = React.useRef<HTMLSpanElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const unlisten = React.useRef<(() => void) | null>(null);

  const latest = React.useRef({
    interval,
    weight,
    labels,
    relief,
    scale,
    breathe,
    speed,
    tint,
    unit,
    interactive,
    pointerStrength,
    radius,
    seed,
    paused,
    intro,
    dpr,
    motionSafe,
    onSummitChange,
  });
  React.useEffect(() => {
    latest.current = {
      interval,
      weight,
      labels,
      relief,
      scale,
      breathe,
      speed,
      tint,
      unit,
      interactive,
      pointerStrength,
      radius,
      seed,
      paused,
      intro,
      dpr,
      motionSafe,
      onSummitChange,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const tintCanvas = tintRef.current;
    const lineCanvas = linesRef.current;
    const tctx = tintCanvas?.getContext("2d") ?? null;
    const ctx = lineCanvas?.getContext("2d") ?? null;
    if (!root || !tintCanvas || !lineCanvas || !tctx || !ctx) return;

    let sheet: Sheet | null = null;
    let look: Look | null = null;
    let raf = 0;
    let last = 0;
    let drawnAt = 0;
    let visible = true;
    let dirty = true;
    let disposed = false;
    const L0 = latest.current;
    let time = ((Math.abs(L0.seed) * 0.6180339) % 1) * 30;
    let introState: "waiting" | "running" | "done" = "waiting";
    let introClock = 0;
    const hill = {
      x: { x: 0, v: 0 },
      y: { x: 0, v: 0 },
      tx: 0,
      ty: 0,
      lift: { x: 0, v: 0 },
      present: false,
      pressed: false,
      heaving: false,
      source: null as "pointer" | "focus" | null,
      /** What was last reported: a summit, or null. */
      told: null as number | null,
      settled: true,
    };
    /** Labels on the sheet, keyed level * 64 + column. */
    const placed = new Map<number, Label>();
    const best = new Map<number, { y: number; angle: number }>();
    const crossings: number[] = [];
    const taken: number[] = [];
    /** Spot heights on the summits, and this frame's candidates: x, y, e. */
    const peaks: Peak[] = [];
    const tops: number[] = [];
    const widths = new Map<string, number>();
    const widthOf = (text: string) => {
      let width = widths.get(text);
      if (width === undefined) {
        width = ctx.measureText(text).width;
        widths.set(text, width);
      }
      return width;
    };
    const read = rgbReader();

    const recolor = () => {
      const get = (node: HTMLSpanElement | null, fallback: Rgb): Rgb =>
        node ? read(getComputedStyle(node).color) : fallback;
      const family = lineCarrier.current
        ? getComputedStyle(lineCarrier.current).fontFamily
        : "monospace";
      look = {
        line: get(lineCarrier.current, [128, 128, 128]),
        hill: get(hillCarrier.current, [80, 110, 240]),
        tint: get(tintCarrier.current, [80, 110, 240]),
        page: get(pageCarrier.current, [255, 255, 255]),
        font: `500 9px ${family}`,
      };
      widths.clear();
    };

    /** Surveys the land for the current size, seed and scale. */
    const build = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 1 || h < 1) return;
      const L = latest.current;
      const scaleDpr = Math.min(
        2,
        Math.max(0.5, L.dpr),
        window.devicePixelRatio || 1,
      );
      lineCanvas.width = Math.round(w * scaleDpr);
      lineCanvas.height = Math.round(h * scaleDpr);
      const cell = Math.max(6, Math.sqrt((w * h) / MAX_CELLS));
      const gw = Math.ceil(w / cell) + 1;
      const gh = Math.ceil(h / cell) + 1;
      tintCanvas.width = gw;
      tintCanvas.height = gh;
      const span = 260 * clamp(L.scale, 0.5, 2);
      const fields: [Float32Array, Float32Array, Float32Array] = [
        new Float32Array(gw * gh),
        new Float32Array(gw * gh),
        new Float32Array(gw * gh),
      ];
      const seedBase = Math.abs(Math.round(L.seed)) * 3 + 1;
      fields.forEach((field, f) => {
        const fbm = landNoise(seedBase + f * 101);
        // Each survey is stretched to fill 0..1 on this sheet, so the
        // whole relief is always in view.
        let lo = Infinity;
        let hi = -Infinity;
        for (let j = 0; j < gh; j += 1) {
          for (let i = 0; i < gw; i += 1) {
            const v = fbm((i * cell) / span + f * 3.7, (j * cell) / span);
            field[j * gw + i] = v;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
        const range = Math.max(1e-6, hi - lo);
        for (let k = 0; k < field.length; k += 1)
          field[k] = ((field[k] ?? 0) - lo) / range;
      });
      const count = Math.max(1, Math.round(w / LABEL_SPACING));
      const columns = new Float32Array(count);
      const colOf = new Int16Array(gw).fill(-1);
      for (let c = 0; c < count; c += 1) {
        const x =
          ((c + 0.5) * w) / count + (((seedBase * 37 + c * 53) % 29) - 14);
        columns[c] = x;
        const i = Math.floor(x / cell);
        if (i >= 0 && i < gw) colOf[i] = c;
      }
      sheet = {
        w,
        h,
        dpr: scaleDpr,
        cell,
        gw,
        gh,
        fields,
        height: new Float32Array(gw * gh),
        colOf,
        columns,
        tint: new ImageData(gw, gh),
      };
      placed.clear();
      peaks.length = 0;
    };

    /** The land this moment, with the breathing and the hill. */
    const survey = () => {
      const sh = sheet;
      if (!sh) return;
      const L = latest.current;
      const b = clamp(L.breathe, 0, 1) * (L.motionSafe ? 1 : 0);
      const w0 = 1 + 0.9 * b * Math.sin(time * 0.31 + 0.4);
      const w1 = 1 + 0.9 * b * Math.sin(time * 0.23 + 2.1);
      const w2 = 1 + 0.9 * b * Math.sin(time * 0.37 + 4.2);
      const sum = w0 + w1 + w2;
      const [f0, f1, f2] = sh.fields;
      const rel = Math.max(10, L.relief);
      const lift = hill.lift.x;
      const sigma = Math.max(8, L.radius) * 0.55;
      const inv = 1 / (2 * sigma * sigma);
      const hx = hill.x.x;
      const hy = hill.y.x;
      const reach = sigma * 3.2;
      const swell = 0.05 * b * Math.sin(time * 0.17);
      for (let j = 0; j < sh.gh; j += 1) {
        const y = j * sh.cell;
        for (let i = 0; i < sh.gw; i += 1) {
          const k = j * sh.gw + i;
          const x = i * sh.cell;
          // Blended surveys are flatter than any one of them; the stretch
          // gives the relief back.
          const v =
            ((f0[k] ?? 0) * w0 + (f1[k] ?? 0) * w1 + (f2[k] ?? 0) * w2) / sum;
          let e = DATUM + rel * clamp((v - 0.5) * 1.55 + 0.5 + swell, 0, 1.2);
          if (
            lift > 0.01 &&
            Math.abs(x - hx) < reach &&
            Math.abs(y - hy) < reach
          ) {
            const dx = x - hx;
            const dy = y - hy;
            e += lift * Math.exp(-(dx * dx + dy * dy) * inv);
          }
          sh.height[k] = e;
        }
      }
    };

    /**
     * The intro's reach, as an elevation: lines below it are inked. Before
     * the survey starts the lowlands are already drawn, so the first frame is
     * a map, not a blank sheet.
     */
    const inkTo = () => {
      const L = latest.current;
      const inking =
        introState === "running" ||
        (introState === "waiting" && L.intro && L.motionSafe);
      if (!inking) return Infinity;
      const rel = Math.max(10, L.relief);
      const levels = Math.max(1, Math.round(rel / Math.max(1, L.interval)));
      const total = cascade(levels) * levels + durations.fast;
      const t = introState === "running" ? introClock / total : 0;
      return DATUM + rel * (0.55 + t * 0.7);
    };

    const draw = () => {
      const sh = sheet;
      const lk = look;
      if (!sh || !lk) return;
      if (!visible) {
        dirty = true;
        return;
      }
      dirty = false;
      survey();
      const L = latest.current;
      const step = Math.max(1, L.interval);
      const { gw, gh, cell, height } = sh;
      const rel = Math.max(10, L.relief);
      const reveal = inkTo();
      const fade = step * 2;

      // The tint: the high ground leans toward the tint colour.
      const data = sh.tint.data;
      const strength = clamp(L.tint, 0, 1) * 0.42;
      for (let k = 0; k < gw * gh; k += 1) {
        const t = clamp(((height[k] ?? DATUM) - DATUM) / rel, 0, 1.4);
        const a = strength * Math.pow(Math.min(1, t), 1.6);
        const o = k * 4;
        data[o] = lk.page[0] + (lk.tint[0] - lk.page[0]) * a;
        data[o + 1] = lk.page[1] + (lk.tint[1] - lk.page[1]) * a;
        data[o + 2] = lk.page[2] + (lk.tint[2] - lk.page[2]) * a;
        data[o + 3] = 255;
      }
      tctx.putImageData(sh.tint, 0, 0);

      // The lines: marching squares, each cell visiting only the levels its
      // corners span. Index contours (every fifth) go in their own path and
      // record where they cross a label column.
      const minor = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      const major = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      crossings.length = 0;
      const emit = (
        path: Path2D,
        cross: number,
        lv: number,
        sx: number,
        sy: number,
        ex: number,
        ey: number,
      ) => {
        path.moveTo(sx, sy);
        path.lineTo(ex, ey);
        if (cross < 0) return;
        const cx = sh.columns[cross] ?? 0;
        if ((sx - cx) * (ex - cx) <= 0 && Math.abs(ex - sx) > 1e-6) {
          const t = (cx - sx) / (ex - sx);
          crossings.push(
            lv,
            cross,
            sy + (ey - sy) * t,
            Math.atan2(ey - sy, ex - sx),
          );
        }
      };
      for (let j = 0; j < gh - 1; j += 1) {
        const y0 = j * cell;
        const y1 = y0 + cell;
        for (let i = 0; i < gw - 1; i += 1) {
          const k = j * gw + i;
          const a = height[k] ?? 0;
          const b = height[k + 1] ?? 0;
          const c = height[k + gw + 1] ?? 0;
          const d = height[k + gw] ?? 0;
          const first = Math.ceil(Math.min(a, b, c, d) / step);
          const lastLevel = Math.floor(Math.max(a, b, c, d) / step);
          if (first > lastLevel) continue;
          const x0 = i * cell;
          const x1 = x0 + cell;
          const col = sh.colOf[i] ?? -1;
          for (let lv = first; lv <= lastLevel; lv += 1) {
            const e = lv * step;
            if (e > reveal) break;
            const ink =
              reveal === Infinity
                ? 3
                : Math.min(3, Math.floor(((reveal - e) / fade) * 4));
            const isMajor = lv % 5 === 0;
            const path = (isMajor ? major : minor)[ink];
            if (!path) continue;
            const cross = isMajor ? col : -1;
            const idx =
              (a > e ? 8 : 0) |
              (b > e ? 4 : 0) |
              (c > e ? 2 : 0) |
              (d > e ? 1 : 0);
            if (idx === 0 || idx === 15) continue;
            const tx = x0 + ((e - a) / (b - a || 1e-6)) * cell;
            const ry = y0 + ((e - b) / (c - b || 1e-6)) * cell;
            const bx = x0 + ((e - d) / (c - d || 1e-6)) * cell;
            const ly = y0 + ((e - a) / (d - a || 1e-6)) * cell;
            if (idx === 1 || idx === 14) emit(path, cross, lv, x0, ly, bx, y1);
            else if (idx === 2 || idx === 13)
              emit(path, cross, lv, bx, y1, x1, ry);
            else if (idx === 3 || idx === 12)
              emit(path, cross, lv, x0, ly, x1, ry);
            else if (idx === 4 || idx === 11)
              emit(path, cross, lv, tx, y0, x1, ry);
            else if (idx === 6 || idx === 9)
              emit(path, cross, lv, tx, y0, bx, y1);
            else if (idx === 7 || idx === 8)
              emit(path, cross, lv, x0, ly, tx, y0);
            else {
              // A saddle: the centre decides which way the lines pass.
              const centre = (a + b + c + d) / 4 > e;
              if ((idx === 5) === centre) {
                emit(path, cross, lv, x0, ly, tx, y0);
                emit(path, cross, lv, bx, y1, x1, ry);
              } else {
                emit(path, cross, lv, x0, ly, bx, y1);
                emit(path, cross, lv, tx, y0, x1, ry);
              }
            }
          }
        }
      }

      // Labels: one per index contour per column, where it crosses; the
      // crossing moves smoothly with the land, so the label slides with it.
      for (const label of placed.values()) label.seen = false;
      const showLabels = L.labels && reveal === Infinity;
      if (showLabels) {
        ctx.font = lk.font;
        best.clear();
        const rank = (y: number, angle: number, prior: Label | undefined) =>
          prior
            ? Math.abs(y - prior.y)
            : Math.abs(angle) * 40 + Math.abs(y - sh.h / 2) * 0.05;
        for (let q = 0; q < crossings.length; q += 4) {
          const lv = crossings[q] ?? 0;
          const col = crossings[q + 1] ?? 0;
          const y = crossings[q + 2] ?? 0;
          let angle = crossings[q + 3] ?? 0;
          if (angle > Math.PI / 2) angle -= Math.PI;
          if (angle < -Math.PI / 2) angle += Math.PI;
          if (Math.abs(angle) > 1.3 || y < 10 || y > sh.h - 10) continue;
          const key = lv * 64 + col;
          const prior = placed.get(key);
          const have = best.get(key);
          if (!have || rank(y, angle, prior) < rank(have.y, have.angle, prior))
            best.set(key, { y, angle });
        }
        taken.length = 0;
        for (const [key, spot] of best) {
          const col = key & 63;
          const lv = (key - col) / 64;
          const x = sh.columns[col] ?? 0;
          if (x < 22 || x > sh.w - 22) continue;
          let clash = false;
          for (let t = 0; t < taken.length; t += 2) {
            if (
              Math.abs((taken[t] ?? 0) - x) < 30 &&
              Math.abs((taken[t + 1] ?? 0) - spot.y) < 13
            )
              clash = true;
          }
          if (clash) continue;
          taken.push(x, spot.y);
          const label = placed.get(key);
          if (label) {
            label.y = spot.y;
            label.angle = spot.angle;
            label.seen = true;
            continue;
          }
          const text = String(lv * step);
          const width = widthOf(text);
          placed.set(key, {
            y: spot.y,
            angle: spot.angle,
            alpha: L.motionSafe ? 0 : 1,
            seen: true,
            text,
            width,
            x,
          });
        }
      }
      // Spot heights: the highest summits on the sheet, apart from each
      // other and from the hand's hill, each followed from frame to frame.
      for (const peak of peaks) peak.seen = false;
      if (showLabels) {
        tops.length = 0;
        const s3 = 3;
        for (let j = s3; j < gh - s3; j += s3) {
          for (let i = s3; i < gw - s3; i += s3) {
            const e = height[j * gw + i] ?? 0;
            let top = true;
            for (let dj = -s3; dj <= s3 && top; dj += s3) {
              for (let di = -s3; di <= s3; di += s3) {
                if ((di || dj) && (height[(j + dj) * gw + i + di] ?? 0) >= e) {
                  top = false;
                  break;
                }
              }
            }
            if (!top) continue;
            // Climb to the true summit within the block.
            let bi = i;
            let bj = j;
            let be = e;
            for (let dj = -s3 + 1; dj < s3; dj += 1) {
              for (let di = -s3 + 1; di < s3; di += 1) {
                const v = height[(j + dj) * gw + i + di] ?? 0;
                if (v > be) {
                  be = v;
                  bi = i + di;
                  bj = j + dj;
                }
              }
            }
            tops.push(bi * cell, bj * cell, be);
          }
        }
        const wanted = Math.max(1, Math.round(sh.w / 260));
        const raised = hill.lift.x > rel * 0.08;
        const keep = Math.max(8, L.radius) * 1.4;
        for (let pick = 0; pick < wanted; pick += 1) {
          let at = -1;
          for (let q = 0; q < tops.length; q += 3) {
            const x = tops[q] ?? 0;
            const y = tops[q + 1] ?? 0;
            const e = tops[q + 2] ?? 0;
            if (x < 18 || x > sh.w - 64 || y < 14 || y > sh.h - 12) continue;
            if (raised && Math.hypot(x - hill.x.x, y - hill.y.x) < keep)
              continue;
            let near = false;
            for (const peak of peaks) {
              if (peak.seen && Math.hypot(peak.x - x, peak.y - y) < 96)
                near = true;
            }
            if (near) continue;
            if (at < 0 || e > (tops[at + 2] ?? 0)) at = q;
          }
          if (at < 0) break;
          const x = tops[at] ?? 0;
          const y = tops[at + 1] ?? 0;
          const e = tops[at + 2] ?? 0;
          tops[at + 2] = -Infinity;
          let match: Peak | undefined;
          for (const peak of peaks) {
            if (!peak.seen && Math.hypot(peak.x - x, peak.y - y) < 30)
              match = peak;
          }
          if (match) {
            match.x = x;
            match.y = y;
            match.e = e;
            match.seen = true;
          } else {
            peaks.push({ x, y, e, alpha: L.motionSafe ? 0 : 1, seen: true });
          }
        }
      }
      // Under reduced motion a label that has gone is gone at once.
      if (!L.motionSafe) {
        for (const [key, label] of placed) if (!label.seen) placed.delete(key);
        for (let q = peaks.length - 1; q >= 0; q -= 1)
          if (!peaks[q]?.seen) peaks.splice(q, 1);
      }

      const wgt = clamp(L.weight, 0.5, 2);
      ctx.setTransform(sh.dpr, 0, 0, sh.dpr, 0, 0);
      ctx.clearRect(0, 0, sh.w, sh.h);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      // Lines break under their labels: the clip is the sheet less a box
      // round each label, by the even-odd rule.
      ctx.save();
      const clip = new Path2D();
      clip.rect(0, 0, sh.w, sh.h);
      let holes = 0;
      for (const label of placed.values()) {
        if (label.alpha < 0.3) continue;
        const cos = Math.cos(label.angle);
        const sin = Math.sin(label.angle);
        const hw = label.width / 2 + 3;
        const hh = 5.5;
        const pts = [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh],
        ] as const;
        pts.forEach(([px, py], n) => {
          const x = label.x + px * cos - py * sin;
          const y = label.y + px * sin + py * cos;
          if (n === 0) clip.moveTo(x, y);
          else clip.lineTo(x, y);
        });
        clip.closePath();
        holes += 1;
      }
      ctx.font = lk.font;
      for (const peak of peaks) {
        if (peak.alpha < 0.3) continue;
        const width = widthOf(String(Math.round(peak.e)));
        clip.rect(peak.x - 5, peak.y - 6, width + 14, 12);
        holes += 1;
      }
      if (holes > 0) ctx.clip(clip, "evenodd");
      for (let b = 0; b < 4; b += 1) {
        const alpha = (b + 1) / 4;
        ctx.lineWidth = 0.7 * wgt;
        ctx.strokeStyle = css(lk.line, 0.55 * alpha);
        const mp = minor[b];
        if (mp) ctx.stroke(mp);
        ctx.lineWidth = 1.35 * wgt;
        ctx.strokeStyle = css(lk.line, 0.95 * alpha);
        const jp = major[b];
        if (jp) ctx.stroke(jp);
      }
      // The raised hill's lines take the hill colour, fading out from it.
      const lift = hill.lift.x;
      if (lift > 0.5) {
        const sigma = Math.max(8, L.radius) * 0.55;
        const glow = ctx.createRadialGradient(
          hill.x.x,
          hill.y.x,
          0,
          hill.x.x,
          hill.y.x,
          sigma * 2.6,
        );
        const a = clamp(lift / (rel * 0.3), 0, 1);
        glow.addColorStop(0, css(lk.hill, a));
        glow.addColorStop(0.6, css(lk.hill, a * 0.6));
        glow.addColorStop(1, css(lk.hill, 0));
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = glow;
        ctx.fillRect(
          hill.x.x - sigma * 2.6,
          hill.y.x - sigma * 2.6,
          sigma * 5.2,
          sigma * 5.2,
        );
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();

      // The figures, upright along their lines.
      ctx.font = lk.font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const label of placed.values()) {
        if (label.alpha <= 0.01) continue;
        ctx.save();
        ctx.translate(label.x, label.y);
        ctx.rotate(label.angle);
        ctx.fillStyle = css(lk.line, label.alpha);
        ctx.fillText(label.text, 0, 0.5);
        ctx.restore();
      }

      // The summits' spot heights: a small triangle and the figure.
      ctx.textAlign = "left";
      for (const peak of peaks) {
        if (peak.alpha <= 0.01) continue;
        ctx.fillStyle = css(lk.line, peak.alpha);
        ctx.beginPath();
        ctx.moveTo(peak.x, peak.y - 3);
        ctx.lineTo(peak.x + 3, peak.y + 2.2);
        ctx.lineTo(peak.x - 3, peak.y + 2.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillText(String(Math.round(peak.e)), peak.x + 6, peak.y + 0.5);
      }

      // The spot height rides the summit, its figure rolling as it climbs.
      if (L.labels && lift > rel * 0.08) {
        const gx = clamp(hill.x.x / cell, 0, gw - 1.001);
        const gy = clamp(hill.y.x / cell, 0, gh - 1.001);
        const i = Math.floor(gx);
        const j = Math.floor(gy);
        const fx = gx - i;
        const fy = gy - j;
        const k = j * gw + i;
        const e = lerp(
          lerp(height[k] ?? 0, height[k + 1] ?? 0, fx),
          lerp(height[k + gw] ?? 0, height[k + gw + 1] ?? 0, fx),
          fy,
        );
        const a = clamp((lift - rel * 0.08) / (rel * 0.08), 0, 1);
        const sx = hill.x.x;
        const sy = hill.y.x;
        ctx.fillStyle = css(lk.hill, a);
        ctx.beginPath();
        ctx.moveTo(sx, sy - 3.5);
        ctx.lineTo(sx + 3.5, sy + 2.5);
        ctx.lineTo(sx - 3.5, sy + 2.5);
        ctx.closePath();
        ctx.fill();
        ctx.textAlign = sx > sh.w - 70 ? "right" : "left";
        ctx.fillText(
          `${Math.round(e)} ${latest.current.unit}`,
          sx + (sx > sh.w - 70 ? -7 : 7),
          sy,
        );
      }
      root.setAttribute("data-painted", "");
    };

    /** Advances the land, the hill and the labels; true while anything moves. */
    const advance = (dt: number): boolean => {
      const L = latest.current;
      let busy = false;
      if (!L.paused && L.speed > 0 && L.breathe > 0) {
        time += dt * clamp(L.speed, 0, 2);
        busy = true;
      }
      if (introState === "running") {
        introClock += dt;
        const rel = Math.max(10, L.relief);
        const levels = Math.max(1, Math.round(rel / Math.max(1, L.interval)));
        if (introClock > cascade(levels) * levels * 1.3 + durations.fast * 2)
          introState = "done";
        busy = true;
      }
      const rel = Math.max(10, L.relief);
      const target = hill.present
        ? clamp(L.pointerStrength, 0, 1) * 0.42 * rel * (hill.pressed ? 1.6 : 1)
        : 0;
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(STEP, left);
        left -= h;
        stepSpring(hill.x, hill.tx, springs.glide, h);
        stepSpring(hill.y, hill.ty, springs.glide, h);
        stepSpring(
          hill.lift,
          target,
          hill.heaving ? springs.recoil : springs.drift,
          h,
        );
      }
      const still =
        rest(hill.x, hill.tx, 0.3) &&
        rest(hill.y, hill.ty, 0.3) &&
        rest(hill.lift, target, Math.max(0.05, rel * 0.0005));
      if (still) {
        hill.heaving = false;
        if (!hill.settled) {
          hill.settled = true;
          report(target);
        }
      } else {
        hill.settled = false;
        busy = true;
      }
      // Spot heights fade too.
      for (let q = peaks.length - 1; q >= 0; q -= 1) {
        const peak = peaks[q];
        if (!peak) continue;
        const goal = peak.seen ? 1 : 0;
        if (peak.alpha !== goal) {
          peak.alpha = clamp(
            peak.alpha + (goal ? 1 : -1) * (dt / LABEL_FADE),
            0,
            1,
          );
          busy = true;
        }
        if (!peak.seen && peak.alpha <= 0) peaks.splice(q, 1);
      }
      // Labels fade in and out rather than pop.
      for (const [key, label] of placed) {
        const goal = label.seen ? 1 : 0;
        if (label.alpha !== goal) {
          label.alpha = clamp(
            label.alpha + (goal ? 1 : -1) * (dt / LABEL_FADE),
            0,
            1,
          );
          busy = true;
        }
        if (!label.seen && label.alpha <= 0) placed.delete(key);
      }
      return busy;
    };

    /** Tells the host where the hill came to rest: a summit, or gone. */
    const report = (target: number) => {
      const L = latest.current;
      let value: number | null = null;
      if (target > 0.5 && sheet) {
        const sh = sheet;
        const i = clamp(Math.round(hill.x.x / sh.cell), 0, sh.gw - 1);
        const j = clamp(Math.round(hill.y.x / sh.cell), 0, sh.gh - 1);
        value = Math.round(sh.height[j * sh.gw + i] ?? 0);
      }
      if (value === hill.told) return;
      hill.told = value;
      L.onSummitChange?.(value);
    };

    /** Reduced motion: everything stands where it is going, at once. */
    const place = () => {
      const L = latest.current;
      const rel = Math.max(10, L.relief);
      hill.x.x = hill.tx;
      hill.y.x = hill.ty;
      hill.x.v = 0;
      hill.y.v = 0;
      hill.lift.x = hill.present
        ? clamp(L.pointerStrength, 0, 1) * 0.42 * rel * (hill.pressed ? 1.6 : 1)
        : 0;
      hill.lift.v = 0;
      introState = "done";
      for (const [key, label] of placed) {
        label.alpha = label.seen ? 1 : 0;
        if (!label.seen) placed.delete(key);
      }
      for (let q = peaks.length - 1; q >= 0; q -= 1) {
        const peak = peaks[q];
        if (peak?.seen) peak.alpha = 1;
        else peaks.splice(q, 1);
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden || !sheet) {
        last = 0;
        return;
      }
      const L = latest.current;
      if (!L.motionSafe) {
        place();
        draw();
        report(hill.lift.x);
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const busy = advance(dt);
      // Breathing alone is slow: half the frames are enough.
      const quick = !hill.settled || introState === "running";
      if (quick || now - drawnAt > 40) {
        drawnAt = now;
        draw();
      }
      if (busy) raf = window.requestAnimationFrame(frame);
      else {
        draw();
        last = 0;
      }
    };

    const kick = () => {
      if (raf || disposed) return;
      if (!visible || document.hidden) {
        dirty = true;
        return;
      }
      raf = window.requestAnimationFrame(frame);
    };

    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    };

    const resize = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 1 || h < 1) return;
      if (sheet && sheet.w === w && sheet.h === h) return;
      build();
      draw();
    };

    recolor();
    resize();
    // Labels are drawn in the sheet's own font once it has arrived.
    void document.fonts?.ready.then(() => {
      if (disposed) return;
      recolor();
      draw();
    });

    const sizer = new ResizeObserver(() => resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible = Boolean(entry?.isIntersecting);
      if (!visible) return;
      if (introState === "waiting") {
        const L = latest.current;
        introState = L.intro && L.motionSafe ? "running" : "done";
        introClock = 0;
      }
      if (dirty) draw();
      kick();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const local = (clientX: number, clientY: number) => {
      const rect = root.getBoundingClientRect();
      return {
        x: clientX - rect.left - root.clientLeft,
        y: clientY - rect.top - root.clientTop,
      };
    };

    api.current = {
      refresh: (rebuild) => {
        if (rebuild) {
          sheet = null;
          resize();
        }
        if (!latest.current.motionSafe) stop();
        draw();
        kick();
      },
      recolor: () => {
        recolor();
        draw();
      },
      local,
      aim: (x, y, source) => {
        // A hill raised from flat ground starts where the hand is.
        if (!hill.present && hill.lift.x < 0.5) {
          hill.x.x = x;
          hill.y.x = y;
          hill.x.v = 0;
          hill.y.v = 0;
        }
        hill.tx = x;
        hill.ty = y;
        hill.present = true;
        hill.source = source;
        hill.settled = false;
        kick();
      },
      away: (source) => {
        if (source && hill.source !== source) return;
        hill.present = false;
        hill.pressed = false;
        hill.source = null;
        hill.settled = false;
        kick();
      },
      press: (down) => {
        if (hill.pressed === down) return;
        hill.pressed = down;
        hill.heaving = true;
        hill.settled = false;
        kick();
      },
    };

    return () => {
      disposed = true;
      stop();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = null;
    };
  }, []);

  // The land is surveyed again for a new seed or scale; the rest is read
  // each frame.
  React.useEffect(() => {
    api.current?.refresh(true);
  }, [seed, scale, dpr]);
  React.useEffect(() => {
    api.current?.refresh(false);
  }, [
    interval,
    weight,
    labels,
    relief,
    breathe,
    speed,
    tint,
    unit,
    pointerStrength,
    radius,
    paused,
    motionSafe,
  ]);

  // A hand that is switched off lets go.
  React.useEffect(() => {
    if (!interactive) api.current?.away(null);
  }, [interactive]);

  React.useEffect(() => {
    const listening = unlisten;
    return () => listening.current?.();
  }, []);

  // A new theme or new colours change the carriers'; their 1 ms colour
  // transition says when, and the sheet is drawn from them again.
  const repaintSoon = React.useRef(0);
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current?.recolor();
    });
  };
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive) return;
    // A finger raises the land only while it is down.
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = a.local(event.clientX, event.clientY);
    a.aim(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = a.local(event.clientX, event.clientY);
    a.aim(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // Pressing a button in the content is the button's business.
    if (hit && rootRef.current?.contains(hit)) return;
    a.press(true);
    unlisten.current?.();
    const id = event.pointerId;
    const touch = event.pointerType === "touch";
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      unlisten.current?.();
      api.current?.press(false);
      if (touch) api.current?.away("pointer");
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    unlisten.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      unlisten.current = null;
    };
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    api.current?.away("pointer");
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const a = api.current;
    const target = event.target;
    if (!a || !interactive || !(target instanceof Element)) return;
    if (!target.matches(":focus-visible")) return;
    const rect = target.getBoundingClientRect();
    const at = a.local(rect.left + rect.width / 2, rect.top + rect.height / 2);
    a.aim(at.x, at.y, "focus");
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    api.current?.away("focus");
  };

  // What stands in before the sheet is drawn: rings round two summits, in
  // the line colour, on the page.
  const standIn = `repeating-radial-gradient(circle at 72% 38%, transparent 0 15px, color-mix(in oklab, ${lineColor} 45%, transparent) 15px 16px), repeating-radial-gradient(circle at 24% 78%, transparent 0 19px, color-mix(in oklab, ${lineColor} 30%, transparent) 19px 20px)`;

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "group/survey-contours relative isolate h-full w-full overflow-clip bg-background",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 transition-opacity duration-300 group-data-painted/survey-contours:opacity-0"
          style={{ backgroundImage: standIn }}
        />
        <canvas
          ref={tintRef}
          className="absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-painted/survey-contours:opacity-100"
        />
        <canvas
          ref={linesRef}
          className="absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-painted/survey-contours:opacity-100"
        />
        <span
          ref={lineCarrier}
          onTransitionEnd={onColors}
          className="absolute size-px font-mono opacity-0 transition-colors duration-1"
          style={{ color: lineColor }}
        />
        <span
          ref={hillCarrier}
          onTransitionEnd={onColors}
          className="absolute size-px opacity-0 transition-colors duration-1"
          style={{ color: hillColor }}
        />
        <span
          ref={tintCarrier}
          onTransitionEnd={onColors}
          className="absolute size-px opacity-0 transition-colors duration-1"
          style={{ color: tintColor }}
        />
        <span
          ref={pageCarrier}
          onTransitionEnd={onColors}
          className="absolute size-px text-background opacity-0 transition-colors duration-1"
        />
      </div>
      <div className={cn("relative z-10 size-full", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
