"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type GraphHorizonInk = "blue" | "green" | "sepia" | "graphite";

export type GraphHorizonSeries = {
  /** The series' name, printed beside its readings. */
  label: string;
  /** One value per sample, oldest first. */
  values: readonly number[];
  /** Its ink, any CSS colour. Defaults to red pencil, graphite and amber in turn. */
  color?: string;
  /** Appended to its readings by the default format, e.g. "k" or "%". */
  unit?: string;
};

export type GraphHorizonProps = {
  /** The series, each plotted in its own lane of the strip. @default three weekly series */
  series?: readonly GraphHorizonSeries[];
  /** A label per sample, printed at the strip's margin. @default "W1", "W2"… */
  labels?: readonly string[];
  /** How fast the paper rolls toward you, in samples a second. @default 0.6 */
  speed?: number;
  /** How far the camera looks down at the paper, in degrees: low is a grazing view with a high horizon. @default 22 */
  tilt?: number;
  /** The grid's ink: a named ink or any CSS colour. @default "blue" */
  inkColor?: GraphHorizonInk | (string & {});
  /** The paper, any CSS colour. @default the card colour tinted toward the ink */
  paper?: string;
  /** How far a reading lifts off the paper as it passes, in px. @default 18 */
  lift?: number;
  /** Where the reading line sits, as a share of the height from the top, 0.55 to 0.95. @default 0.8 */
  readAt?: number;
  /** Minor cells per major cell, and per sample row. @default 5 */
  majorEvery?: number;
  /** How a reading is printed. @default one decimal and the series' unit */
  format?: (value: number, series: GraphHorizonSeries) => string;
  /** Controlled: whether the paper is rolling. */
  playing?: boolean;
  /** Whether it rolls at first, when uncontrolled. @default true */
  defaultPlaying?: boolean;
  /** Fires from the key or the stepping that started or stopped the roll. */
  onPlayingChange?: (playing: boolean) => void;
  /** Fires when a new sample reaches the reading line, with its index. */
  onSampleChange?: (index: number) => void;
  /** Drag and keys move the paper. @default true */
  interactive?: boolean;
  /** Names the chart for assistive technology. @default "Weekly product metrics" */
  label?: string;
  /** Content above the horizon: a heading, a figure. */
  children?: React.ReactNode;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Shows the paper still and takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const WEEKS = 26;
const wave = (i: number, base: number, amp: number, f: number, p: number) =>
  Math.round((base + amp * Math.sin(i * f + p) + i * base * 0.012) * 10) / 10;

/** Twenty-six weeks of an invented product's numbers. */
export const defaultGraphHorizonSeries: readonly GraphHorizonSeries[] = [
  {
    label: "Sessions",
    unit: "k",
    values: Array.from({ length: WEEKS }, (_, i) =>
      wave(i, 38, 6.5, 0.55, 0.4),
    ),
  },
  {
    label: "Sign-ups",
    unit: "k",
    values: Array.from({ length: WEEKS }, (_, i) =>
      wave(i, 2.4, 0.7, 0.8, 1.9),
    ),
  },
  {
    label: "Churn",
    unit: "%",
    values: Array.from(
      { length: WEEKS },
      (_, i) =>
        Math.round((3.1 - i * 0.03 + 0.5 * Math.sin(i * 0.9 + 2.6)) * 10) / 10,
    ),
  },
];

const INKS: Record<GraphHorizonInk, string> = {
  blue: "var(--accent-bright)",
  green: "color-mix(in oklab, var(--signal) 85%, var(--foreground))",
  sepia: "color-mix(in oklab, oklch(0.6 0.09 55), var(--foreground) 15%)",
  graphite: "var(--ink-2)",
};
const SERIES_INKS = ["var(--danger)", "var(--foreground)", "var(--warn)"];

const DEG = Math.PI / 180;
const MAX_SERIES = 6;
const SUB = 6;
const MAX_POINTS = 600;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mod = (v: number, m: number) => ((v % m) + m) % m;

/**
 * The lift as a reading passes the line, in samples past it: a quick rise
 * before, then the snap spring's settle after — a held peak, a dip of about
 * six per cent, then flat.
 */
function liftAt(u: number): number {
  if (u < -0.6) return 0;
  if (u < 0) {
    const t = (u + 0.6) / 0.6;
    return t * t * (3 - 2 * t);
  }
  return Math.exp(-3 * u) * (Math.cos(3.4 * u) + (3 / 3.4) * Math.sin(3.4 * u));
}

/** Catmull-Rom through four values. */
const cr = (a: number, b: number, c: number, d: number, t: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3)
  );
};

/** Minor cross lines in two passes: [min spacing, max spacing, alpha] each. */
const MINOR_PASSES = [6, 1e9, 0.2, 2.5, 6, 0.1];

type Stats = { lo: number; span: number };

/** Where a sample sits across its lane, in cells. */
const laneX = (
  vals: readonly number[],
  j: number,
  st: Stats,
  lane: number,
  laneW: number,
) =>
  lane -
  laneW * 0.36 +
  (((vals[mod(j, vals.length || 1)] ?? st.lo) - st.lo) / st.span) *
    laneW *
    0.72;

type View = {
  w: number;
  h: number;
  F: number;
  cx: number;
  cy: number;
  sin: number;
  cos: number;
  Hc: number;
  horizon: number;
  halfW: number;
  dNear: number;
  dPen: number;
  dRead: number;
  /** Forward distance where a cell is too small to draw. */
  dFar: number;
};

/**
 * Solves the camera so that the horizon sits where the tilt puts it and the
 * strip's near end spans most of the width. Depths are in cells.
 */
function solveView(
  w: number,
  h: number,
  tiltDeg: number,
  readAt: number,
  majorEvery: number,
): View {
  const tilt = clamp(tiltDeg, 8, 45);
  const theta = tilt * DEG;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const horizon = h * lerp(0.42, 0.2, clamp01((tilt - 10) / 30));
  const F = Math.max(h * 1.15, w * 0.5);
  const cy = horizon + F * Math.tan(theta);
  const majors = w < 420 ? 6 : 8;
  const halfW = (majors * majorEvery) / 2;
  const k = (h - cy) / F;
  const zNear = (F * halfW) / (0.46 * w);
  const Hc = zNear * (sin + k * cos);
  const dAt = (sy: number) => {
    const m = (cy - sy) / F;
    return (Hc * (cos + m * sin)) / Math.max(1e-4, sin - m * cos);
  };
  const dNear = dAt(h);
  return {
    w,
    h,
    F,
    cx: w / 2,
    cy,
    sin,
    cos,
    Hc,
    horizon,
    halfW,
    dNear,
    dPen: dAt(horizon + (h - horizon) * 0.3),
    dRead: dAt(h * clamp(readAt, 0.55, 0.95)),
    dFar: dAt(horizon + 3),
  };
}

/** A point on (or above) the paper to the screen, written into `out`. */
function project(
  v: View,
  x: number,
  y: number,
  d: number,
  out: Float32Array,
  at: number,
) {
  const yr = y - v.Hc;
  const zc = Math.max(0.05, -yr * v.sin + d * v.cos);
  const yc = yr * v.cos + d * v.sin;
  out[at] = v.cx + (v.F * x) / zc;
  out[at + 1] = v.cy - (v.F * yc) / zc;
}

type Paints = {
  font: string;
  fontSmall: string;
  paper: string;
  ink: string;
  sky: string;
  desk: string;
  text: string;
  shade: string;
  series: string[];
  mono: string;
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** The interactive things a press on the paper must leave alone. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[contenteditable='true']";

/**
 * A strip of graph paper running from your feet to a horizon, rolling toward
 * you, plotted as it comes: a pen per series rides a rail halfway out and
 * swings to each value as the paper passes, so the curves are drawn on the
 * paper in perspective. As each sample reaches the reading line near the
 * bottom, the curve there lifts off the paper toward you on the snap
 * spring's settle — a quick rise, a held peak, the faintest dip — with its
 * shadow left on the paper and its value printed beside it, then lays back
 * down.
 *
 * Drag the paper and it follows the pointer 1:1 in depth (the grabbed point
 * stays under the finger); a flick coasts, then the roll picks up again.
 * Arrow keys roll a sample at a time on the glide spring's constants, Space
 * starts and stops the roll, Home and End go to the ends. Under reduced
 * motion the sheet stands still with one reading lifted.
 */
export function GraphHorizon({
  series = defaultGraphHorizonSeries,
  labels,
  speed = 0.6,
  tilt = 22,
  inkColor = "blue",
  paper,
  lift = 18,
  readAt = 0.8,
  majorEvery = 5,
  format,
  playing,
  defaultPlaying = true,
  onPlayingChange,
  onSampleChange,
  interactive = true,
  label = "Weekly product metrics",
  children,
  dpr = 2,
  disabled = false,
  className,
}: GraphHorizonProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [own, setOwn] = React.useState(defaultPlaying);
  const rolling = playing ?? own;
  const [announcement, setAnnouncement] = React.useState("");
  const live = interactive && !disabled;

  const list = React.useMemo(() => series.slice(0, MAX_SERIES), [series]);
  const stats = React.useMemo<Stats[]>(
    () =>
      list.map((s) => {
        const lo = Math.min(...s.values);
        const hi = Math.max(...s.values);
        return Number.isFinite(lo) && Number.isFinite(hi)
          ? { lo, span: hi - lo || 1 }
          : { lo: 0, span: 1 };
      }),
    [list],
  );
  const n = Math.max(1, ...list.map((s) => s.values.length));
  const labelOf = React.useCallback(
    (i: number) => labels?.[mod(i, n)] ?? `W${mod(i, n) + 1}`,
    [labels, n],
  );
  const show = React.useCallback(
    (v: number, s: GraphHorizonSeries) =>
      format ? format(v, s) : `${v.toFixed(1)}${s.unit ?? ""}`,
    [format],
  );
  const inkCss =
    inkColor in INKS ? INKS[inkColor as GraphHorizonInk] : inkColor;
  const paperCss = paper ?? `color-mix(in oklab, var(--card) 95%, ${inkCss})`;
  const carriers = [
    paperCss,
    inkCss,
    `color-mix(in oklab, var(--card) 97%, ${inkCss})`,
    `color-mix(in oklab, var(--background) 90%, ${inkCss})`,
    "var(--foreground)",
    "color-mix(in oklab, var(--foreground) 70%, var(--background))",
    ...list.map(
      (s, i) =>
        s.color ?? SERIES_INKS[i % SERIES_INKS.length] ?? "var(--foreground)",
    ),
  ];
  const carrierKey = carriers.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const paints = React.useRef<Paints | null>(null);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const view = React.useRef<View | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(true);
  const pts = React.useRef(new Float32Array(MAX_SERIES * MAX_POINTS * 3));
  const counts = React.useRef(new Int32Array(MAX_SERIES));
  const sim = React.useRef({
    /** Sample position under the pen; grows as the paper rolls. */
    pos: 0,
    /** Velocity, samples/s. */
    v: 0,
    /** Stepping toward a sample on the glide constants, or null. */
    target: null as number | null,
    dragging: false,
    grab: 0,
    last: 0,
    read: -1,
  });

  // Reading positions from numbers that the server never sees: they live in
  // refs and the canvas, so markup is the same on both sides.
  const names = React.useMemo(
    () => list.map((s) => s.label.toUpperCase()),
    [list],
  );
  const latest = React.useRef({
    list,
    names,
    stats,
    n,
    speed,
    rolling,
    motionSafe,
    lift,
    majorEvery,
    show,
    labelOf,
    onSampleChange,
  });
  React.useLayoutEffect(() => {
    latest.current = {
      list,
      names,
      stats,
      n,
      speed,
      rolling,
      motionSafe,
      lift,
      majorEvery,
      show,
      labelOf,
      onSampleChange,
    };
  });

  const api = React.useRef<{
    draw: () => void;
    kick: () => void;
    resize: () => void;
    readColours: () => void;
    tick: (now: number) => void;
  } | null>(null);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  /** Turns each carrier's resolved colour into an rgb() string the canvas takes. */
  const readColours = () => {
    const holder = carrierRef.current;
    if (!holder) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const probe = reader.current;
    if (!probe) return;
    const rgb = (el: Element | undefined | null) => {
      if (!el) return "rgb(0 0 0)";
      probe.fillStyle = "rgb(0 0 0)";
      probe.fillStyle = getComputedStyle(el).color;
      probe.clearRect(0, 0, 1, 1);
      probe.fillRect(0, 0, 1, 1);
      const d = probe.getImageData(0, 0, 1, 1).data;
      return `rgb(${d[0] ?? 0} ${d[1] ?? 0} ${d[2] ?? 0})`;
    };
    const kids = holder.children;
    const mono = getComputedStyle(holder).fontFamily || "monospace";
    paints.current = {
      paper: rgb(kids[0]),
      ink: rgb(kids[1]),
      sky: rgb(kids[2]),
      desk: rgb(kids[3]),
      text: rgb(kids[4]),
      shade: rgb(kids[5]),
      series: Array.from({ length: kids.length - 6 }, (_, i) =>
        rgb(kids[i + 6]),
      ),
      mono,
      font: `500 11px ${mono}`,
      fontSmall: `10px ${mono}`,
    };
  };

  const resize = () => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const w = Math.max(40, Math.round(root.clientWidth));
    const h = Math.max(40, Math.round(root.clientHeight));
    const ratio = Math.min(
      2,
      Math.max(0.5, dpr),
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
    );
    const bw = Math.round(w * ratio);
    const bh = Math.round(h * ratio);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const S = Math.max(2, Math.round(majorEvery));
    const was = view.current;
    const next = solveView(w, h, tilt, readAt, S);
    view.current = next;
    // The first sheet, and every new geometry, puts a sample exactly on the
    // reading line, so the still sheet always shows one reading fully lifted.
    const s = sim.current;
    if (!was || was.dRead !== next.dRead || was.dPen !== next.dPen) {
      const offset = (next.dPen - next.dRead) / S;
      const reading = was ? Math.round(s.pos - (was.dPen - was.dRead) / S) : 6;
      if (s.target === null && !s.dragging) s.pos = reading + offset;
    }
  };

  const scratch = React.useRef(new Float32Array(16));
  const fogCache = React.useRef<{ key: string; fill: CanvasGradient } | null>(
    null,
  );
  /** The reading's printed labels, rebuilt only when the sample changes. */
  const texts = React.useRef<{ j: number; wide: boolean; list: string[] }>({
    j: Number.NaN,
    wide: false,
    list: [],
  });

  const draw = () => {
    const canvas = canvasRef.current;
    const v = view.current;
    const p = paints.current;
    if (!canvas || !v || !p) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = latest.current;
    const S = Math.max(2, Math.round(k.majorEvery));
    const s = sim.current;
    const tmp = scratch.current;
    const ratio = canvas.width / v.w;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalAlpha = 1;

    // Desk, sky and the strip of paper.
    ctx.fillStyle = p.desk;
    ctx.fillRect(0, 0, v.w, v.h);
    ctx.fillStyle = p.sky;
    ctx.fillRect(0, 0, v.w, v.horizon + 1);
    const dNear = v.dNear - 2;
    project(v, -v.halfW, 0, dNear, tmp, 0);
    project(v, v.halfW, 0, dNear, tmp, 2);
    project(v, v.halfW, 0, v.dFar * 4, tmp, 4);
    project(v, -v.halfW, 0, v.dFar * 4, tmp, 6);
    ctx.fillStyle = p.paper;
    ctx.beginPath();
    ctx.moveTo(tmp[0] ?? 0, tmp[1] ?? 0);
    ctx.lineTo(tmp[2] ?? 0, tmp[3] ?? 0);
    ctx.lineTo(tmp[4] ?? 0, tmp[5] ?? 0);
    ctx.lineTo(tmp[6] ?? 0, tmp[7] ?? 0);
    ctx.closePath();
    ctx.fill();

    // Cross lines, rolling: minor ones fade as they close up and drop out,
    // majors hold on longer.
    const offset = s.pos * S;
    const first = Math.floor(dNear - v.dPen + offset);
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1;
    for (let pass = 0; pass < MINOR_PASSES.length; pass += 3) {
      const lo = MINOR_PASSES[pass] ?? 0;
      const hi = MINOR_PASSES[pass + 1] ?? 0;
      ctx.globalAlpha = MINOR_PASSES[pass + 2] ?? 0;
      ctx.beginPath();
      let prev = Infinity;
      for (let m = first; m < first + 900; m += 1) {
        const d = v.dPen + m - offset;
        if (d < dNear) continue;
        if (d > v.dFar) break;
        project(v, 0, 0, d, tmp, 0);
        const sy = tmp[1] ?? 0;
        const gap = prev - sy;
        prev = sy;
        if (gap < 2.5) break;
        if (gap < lo || gap >= hi || mod(m, S) === 0) continue;
        project(v, -v.halfW, 0, d, tmp, 0);
        project(v, v.halfW, 0, d, tmp, 2);
        ctx.moveTo(tmp[0] ?? 0, tmp[1] ?? 0);
        ctx.lineTo(tmp[2] ?? 0, tmp[3] ?? 0);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    {
      let prev = Infinity;
      const firstMajor = Math.floor((dNear - v.dPen + offset) / S) * S;
      for (let m = firstMajor; m < firstMajor + 900 * S; m += S) {
        const d = v.dPen + m - offset;
        if (d < dNear) continue;
        if (d > v.dFar) break;
        project(v, 0, 0, d, tmp, 0);
        const sy = tmp[1] ?? 0;
        if (prev - sy < 1.6) break;
        prev = sy;
        project(v, -v.halfW, 0, d, tmp, 0);
        project(v, v.halfW, 0, d, tmp, 2);
        ctx.moveTo(tmp[0] ?? 0, tmp[1] ?? 0);
        ctx.lineTo(tmp[2] ?? 0, tmp[3] ?? 0);
      }
    }
    ctx.stroke();

    // Long lines to the vanishing point; minor ones stop where they crowd.
    const lanes = Math.max(1, k.list.length);
    const laneW = (v.halfW * 2) / lanes;
    const minorFar = Math.max(dNear, (v.F / 3 - v.Hc * v.sin) / v.cos);
    for (let pass = 0; pass < 2; pass += 1) {
      ctx.globalAlpha = pass === 0 ? 0.16 : 0.42;
      ctx.beginPath();
      for (let x = -v.halfW; x <= v.halfW + 1e-6; x += 1) {
        const major = mod(Math.round(x + v.halfW), S) === 0;
        if ((pass === 1) !== major) continue;
        project(v, x, 0, dNear, tmp, 0);
        project(v, x, 0, major ? v.dFar * 4 : minorFar, tmp, 2);
        ctx.moveTo(tmp[0] ?? 0, tmp[1] ?? 0);
        ctx.lineTo(tmp[2] ?? 0, tmp[3] ?? 0);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let l = 1; l < lanes; l += 1) {
      const x = -v.halfW + l * laneW;
      project(v, x, 0, dNear, tmp, 0);
      project(v, x, 0, v.dFar * 4, tmp, 2);
      ctx.moveTo(tmp[0] ?? 0, tmp[1] ?? 0);
      ctx.lineTo(tmp[2] ?? 0, tmp[3] ?? 0);
    }
    ctx.stroke();

    // Haze: the far paper dissolves into the sky.
    const fogKey = `${v.horizon}|${v.h}|${p.sky}`;
    let fog = fogCache.current;
    if (!fog || fog.key !== fogKey) {
      const g = ctx.createLinearGradient(
        0,
        v.horizon,
        0,
        v.horizon + (v.h - v.horizon) * 0.4,
      );
      g.addColorStop(0, p.sky);
      g.addColorStop(1, p.sky.replace(")", " / 0)"));
      fog = { key: fogKey, fill: g };
      fogCache.current = fog;
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = fog.fill;
    ctx.fillRect(0, v.horizon - 1, v.w, (v.h - v.horizon) * 0.4 + 2);

    // The ink: each series a curve from below the frame up to its pen.
    const jPen = s.pos;
    const jNear = Math.floor(s.pos - (v.dPen - dNear) / S) - 1;
    const buf = pts.current;
    const liftK = k.lift / (v.F * v.cos);
    for (let si = 0; si < k.list.length; si += 1) {
      const vals = k.list[si]?.values;
      const st = k.stats[si];
      if (!vals || !st) continue;
      const lane = -v.halfW + laneW * (si + 0.5);
      const base = si * MAX_POINTS * 3;
      let count = 0;
      for (
        let j = jNear;
        j <= Math.floor(jPen) && count < MAX_POINTS - SUB - 1;
        j += 1
      ) {
        const a = laneX(vals, j - 1, st, lane, laneW);
        const b = laneX(vals, j, st, lane, laneW);
        const c = laneX(vals, j + 1, st, lane, laneW);
        const e = laneX(vals, j + 2, st, lane, laneW);
        for (let q = 0; q < SUB; q += 1) {
          const jj = j + q / SUB;
          if (jj > jPen) break;
          const x = cr(a, b, c, e, q / SUB);
          const d = v.dPen + (jj - s.pos) * S;
          const zc = v.Hc * v.sin + d * v.cos;
          const y = liftK * zc * liftAt((v.dRead - d) / S);
          project(v, x, y, d, buf, base + count * 3);
          project(v, x, 0, d, tmp, 0);
          buf[base + count * 3 + 2] = tmp[1] ?? 0;
          count += 1;
        }
      }
      // The point under the pen, exactly.
      const j = Math.floor(jPen);
      const x = cr(
        laneX(vals, j - 1, st, lane, laneW),
        laneX(vals, j, st, lane, laneW),
        laneX(vals, j + 1, st, lane, laneW),
        laneX(vals, j + 2, st, lane, laneW),
        jPen - j,
      );
      project(v, x, 0, v.dPen, buf, base + count * 3);
      buf[base + count * 3 + 2] = buf[base + count * 3 + 1] ?? 0;
      counts.current[si] = count + 1;
    }

    // Shadows first: the flat curve, where the lifted one has left it.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = p.shade;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1.6;
    for (let si = 0; si < k.list.length; si += 1) {
      const base = si * MAX_POINTS * 3;
      const count = counts.current[si] ?? 0;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const x = (buf[base + i * 3] ?? 0) + 1;
        const y = (buf[base + i * 3 + 2] ?? 0) + 1;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.8;
    for (let si = 0; si < k.list.length; si += 1) {
      const base = si * MAX_POINTS * 3;
      const count = counts.current[si] ?? 0;
      ctx.strokeStyle = p.series[si] ?? p.text;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const x = buf[base + i * 3] ?? 0;
        const y = buf[base + i * 3 + 1] ?? 0;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // The pen rail and the pens.
    project(v, -v.halfW, 0.4, v.dPen, tmp, 0);
    project(v, v.halfW, 0.4, v.dPen, tmp, 2);
    ctx.strokeStyle = p.ink;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tmp[0] ?? 0, tmp[1] ?? 0);
    ctx.lineTo(tmp[2] ?? 0, tmp[3] ?? 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let si = 0; si < k.list.length; si += 1) {
      const base = si * MAX_POINTS * 3;
      const last = (counts.current[si] ?? 1) - 1;
      const x = buf[base + last * 3] ?? 0;
      const y = buf[base + last * 3 + 1] ?? 0;
      ctx.fillStyle = p.series[si] ?? p.text;
      ctx.beginPath();
      ctx.arc(x, y - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.paper;
      ctx.beginPath();
      ctx.arc(x, y - 3, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // The reading: the sample at the line, lifted, its values beside it.
    const readJ = Math.round(s.pos - (v.dPen - v.dRead) / S);
    const dJ = v.dPen + (readJ - s.pos) * S;
    const L = liftAt((v.dRead - dJ) / S);
    const wide = v.w >= 520;
    if (texts.current.j !== readJ || texts.current.wide !== wide) {
      texts.current = {
        j: readJ,
        wide,
        list: k.list.map((ser) => {
          const value = ser.values[mod(readJ, ser.values.length || 1)] ?? 0;
          return wide
            ? `${ser.label} ${k.show(value, ser)}`
            : k.show(value, ser);
        }),
      };
    }
    ctx.font = wide ? p.font : p.fontSmall;
    ctx.textBaseline = "middle";
    const fontSize = wide ? 11 : 10;
    if (L > 0.04) {
      const y = liftK * (v.Hc * v.sin + dJ * v.cos) * L;
      const a = clamp01(L * 1.4);
      for (let si = 0; si < k.list.length; si += 1) {
        const vals = k.list[si]?.values;
        const st = k.stats[si];
        const text = texts.current.list[si];
        if (!vals || !st || text === undefined) continue;
        const lane = -v.halfW + laneW * (si + 0.5);
        project(v, laneX(vals, readJ, st, lane, laneW), y, dJ, tmp, 0);
        const px = tmp[0] ?? 0;
        const py = tmp[1] ?? 0;
        const colour = p.series[si] ?? p.text;
        ctx.globalAlpha = a;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fill();
        const tw = ctx.measureText(text).width;
        const right = px + 10 + tw < v.w - 4;
        const lx = right ? px + 10 : px - 10 - tw;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(right ? px + 4 : px - 4, py);
        ctx.lineTo(right ? lx - 2 : lx + tw + 2, py);
        ctx.stroke();
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = p.paper;
        ctx.fillRect(lx - 2, py - fontSize * 0.7, tw + 4, fontSize * 1.4);
        ctx.globalAlpha = a;
        ctx.fillStyle = colour;
        ctx.fillText(text, lx, py + 0.5);
      }
    }

    // Each lane's name at its near end, on a scrap of paper so a curve
    // passing under it never hides it.
    ctx.font = p.fontSmall;
    ctx.textBaseline = "middle";
    for (let si = 0; si < k.list.length; si += 1) {
      const name = k.names[si];
      if (!name) continue;
      const lane = -v.halfW + laneW * (si + 0.5);
      project(v, lane, 0, dNear + 2, tmp, 0);
      const tw = ctx.measureText(name).width;
      const x = Math.round((tmp[0] ?? 0) - tw / 2);
      const y = v.h - 9;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = p.paper;
      ctx.fillRect(x - 3, y - 6, tw + 6, 12);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.series[si] ?? p.text;
      ctx.fillText(name, x, y + 0.5);
    }

    // Row labels at the strip's left margin, on the near major lines.
    ctx.font = p.fontSmall;
    ctx.fillStyle = p.ink;
    for (
      let j = Math.floor(s.pos - (v.dPen - dNear) / S);
      j <= Math.floor(s.pos);
      j += 1
    ) {
      const d = v.dPen + (j - s.pos) * S;
      if (d < dNear + 0.5) continue;
      project(v, -v.halfW, 0, d, tmp, 0);
      project(v, -v.halfW, 0, d + S, tmp, 2);
      if ((tmp[1] ?? 0) - (tmp[3] ?? 0) < 16) break;
      ctx.globalAlpha = j === readJ ? 0.95 : 0.55;
      ctx.fillText(k.labelOf(j), (tmp[0] ?? 0) + 5, (tmp[1] ?? 0) - 6);
    }
    ctx.globalAlpha = 1;

    const index = mod(readJ, k.n);
    if (index !== s.read) {
      s.read = index;
      k.onSampleChange?.(index);
    }
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (!visible.current || document.hidden) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const k = latest.current;
    const cruise = k.rolling && k.motionSafe ? Math.max(0, k.speed) : 0;
    let moving = false;
    if (s.dragging) {
      moving = true;
    } else if (s.target !== null) {
      // A step rides the glide spring's constants, in samples.
      let left = dt;
      const { stiffness, damping, mass } = springs.glide;
      while (left > 0) {
        const h = Math.min(1 / 120, left);
        const acc = (stiffness * (s.target - s.pos) - damping * s.v) / mass;
        s.v += acc * h;
        s.pos += s.v * h;
        left -= h;
      }
      if (Math.abs(s.target - s.pos) < 0.001 && Math.abs(s.v) < 0.005) {
        s.pos = s.target;
        s.v = 0;
        s.target = null;
      } else moving = true;
    } else {
      // A flick coasts and settles back into the roll.
      s.v += (cruise - s.v) * (1 - Math.exp(-dt * 2.2));
      s.pos += s.v * dt;
      moving = cruise > 0 || Math.abs(s.v) > 0.002;
      if (!moving) s.v = 0;
    }
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick };
  });

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.draw();
  }, [carrierKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
    api.current?.kick();
  }, [tilt, readAt, majorEvery, dpr]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [rolling, speed, motionSafe, lift, carrierKey, n]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        api.current?.draw();
        api.current?.kick();
      }
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const setRolling = (next: boolean) => {
    if (playing === undefined) setOwn(next);
    if (next !== rolling) onPlayingChange?.(next);
  };

  /** A step from a key: the paper rolls to the sample on glide, and the roll pauses. */
  const step = (to: number) => {
    const s = sim.current;
    const v = view.current;
    const S = Math.max(2, Math.round(majorEvery));
    const offset = v ? (v.dPen - v.dRead) / S : 0;
    const target = Math.round(to) + offset;
    if (rolling) setRolling(false);
    if (motionSafe) {
      s.target = target;
    } else {
      s.pos = target;
      s.v = 0;
      s.target = null;
    }
    const index = mod(Math.round(to), n);
    const reading = list
      .map((ser) => {
        const value = ser.values[mod(index, ser.values.length || 1)];
        return value === undefined ? null : `${ser.label} ${show(value, ser)}`;
      })
      .filter(Boolean)
      .join(", ");
    setAnnouncement(`${labelOf(index)}: ${reading}`);
    draw();
    kick();
  };

  const readingIndex = () => {
    const v = view.current;
    const S = Math.max(2, Math.round(majorEvery));
    const s = sim.current;
    const base = s.target ?? s.pos;
    return Math.round(base - (v ? (v.dPen - v.dRead) / S : 0));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!live) return;
    if ((event.target as HTMLElement) !== event.currentTarget) return;
    const j = readingIndex();
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        step(j + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        step(j - 1);
        break;
      case "Home":
        event.preventDefault();
        step(j - mod(j, n));
        break;
      case "End":
        event.preventDefault();
        step(j - mod(j, n) + n - 1);
        break;
      case " ":
        event.preventDefault();
        sim.current.target = null;
        setRolling(!rolling);
        setAnnouncement(rolling ? "Paused" : "Rolling");
        break;
      default:
        break;
    }
  };

  /** The paper's forward distance under a screen y, in cells. */
  const depthAt = (clientY: number) => {
    const v = view.current;
    const r = rootRef.current?.getBoundingClientRect();
    if (!v || !r) return 0;
    const sy = Math.max(v.horizon + 6, clientY - r.top);
    const m = (v.cy - sy) / v.F;
    return (v.Hc * (v.cos + m * v.sin)) / Math.max(1e-4, v.sin - m * v.cos);
  };

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: !live,
    onStart: ({ event, offset }) => {
      const target = event.target as Element | null;
      if (target?.closest(INTERACTIVE)) return;
      const s = sim.current;
      const S = Math.max(2, Math.round(majorEvery));
      s.dragging = true;
      s.target = null;
      s.v = 0;
      // The paper point under the finger, in paper coordinates: it stays put.
      s.grab = depthAt(event.clientY - offset.y) + s.pos * S;
      kick();
    },
    onMove: ({ event }) => {
      const s = sim.current;
      if (!s.dragging) return;
      const S = Math.max(2, Math.round(majorEvery));
      s.pos = (s.grab - depthAt(event.clientY)) / S;
      if (!frame.current) draw();
    },
    onEnd: ({ event, velocity }) => {
      const s = sim.current;
      if (!s.dragging) return;
      s.dragging = false;
      if (motionSafe) {
        const S = Math.max(2, Math.round(majorEvery));
        const per = (depthAt(event.clientY) - depthAt(event.clientY + 1)) / S;
        s.v = clamp(velocity.y * per, -12, 12);
      }
      kick();
    },
    onCancel: () => {
      sim.current.dragging = false;
      kick();
    },
  });

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="strip chart"
      aria-label={label}
      aria-describedby={live ? hintId : undefined}
      tabIndex={live ? 0 : undefined}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "relative isolate touch-pan-x overflow-clip rounded-3 border border-hairline bg-card select-none",
        live && "cursor-grab active:cursor-grabbing",
        FOCUS_RING,
        className ?? "h-56 w-full",
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 block h-full w-full"
      />
      <span
        ref={carrierRef}
        aria-hidden
        className="invisible absolute size-0 overflow-hidden font-mono"
        onTransitionEnd={() => {
          api.current?.readColours();
          api.current?.draw();
        }}
      >
        {carriers.map((c, i) => (
          <span
            key={i}
            style={{
              color: c,
              transitionProperty: "color",
              transitionDuration: "1ms",
            }}
          />
        ))}
      </span>
      {children ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 px-4 pt-3 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
          {children}
        </div>
      ) : null}
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Sample</th>
              {list.map((s) => (
                <th key={s.label} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => (
              <tr key={i}>
                <th scope="row">{labelOf(i)}</th>
                {list.map((s) => {
                  const value = s.values[i];
                  return (
                    <td key={s.label}>
                      {value === undefined ? "" : show(value, s)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span id={hintId} className="sr-only">
        Arrow keys roll the paper a sample at a time and read it out; Space
        starts and stops the roll; Home and End go to the first and last sample.
      </span>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
