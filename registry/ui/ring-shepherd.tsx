"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RingShepherdProps = {
  /** How thickly the dust lies in the bands, 0.1 (a sparse scatter) to 1 (dense rings). @default 0.6 */
  ringDensity?: number;
  /** Width of the dark gaps between the bands, 0 (bands touching) to 1 (wide divisions). @default 0.4 */
  gapWidth?: number;
  /** How hard the moon pushes and how long its wake rings, 0 (a light touch that heals at once) to 1 (a wide lane with long scallops). @default 0.6 */
  wake?: number;
  /** How many bands of dust cross the frame, 3 to 9. @default 6 */
  bands?: number;
  /** The dust's colour. Drawn as light on a dark page and as ink on a light one. @default pale ice, from the warn token's hue */
  color?: string;
  /** The moon's colour, a pigment that reads on both themes. @default warm stone, from the warn token's hue */
  moonColor?: string;
  /** The moon's radius, px, 3 to 14. @default 6 */
  moonSize?: number;
  /** How fast the rings shear past, 0 (held) to 2. The middle of the frame rides with the moon; dust inside and outside it drifts opposite ways. @default 1 */
  shear?: number;
  /** How far the bands bow, as if the planet sat below the frame, 0 (straight) to 1. @default 0.5 */
  curvature?: number;
  /** With no pointer and no keys, the moon circles the field on its own. @default true */
  autopilot?: boolean;
  /** Pixels per arrow key; Shift moves three times as far. @default 18 */
  step?: number;
  /** The pointer and keys steer the moon. @default true */
  interactive?: boolean;
  /** No steering by pointer or key. @default false */
  disabled?: boolean;
  /** Hold the shear and the moon's own orbit; steering still parts the dust. @default false */
  paused?: boolean;
  /** Seeds the band layout and the dust, so two ring systems never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The accessible name of the moon's control. @default "Steer the moon" */
  label?: string;
  /** The band under the moon (0 is the outermost), or null while it crosses a gap. Fires on change. */
  onBandChange?: (band: number | null) => void;
  /** The visitor took the moon (true) or gave it back to its own orbit (false). */
  onSteerChange?: (steering: boolean) => void;
  /** Sizes the box; it fills its parent by default. */
  className?: string;
};

/** Lattice limits: columns per row, rows, points, glints. */
const MAX_COLS = 260;
const MAX_ROWS = 240;
const MAX_POINTS = MAX_COLS * MAX_ROWS;
const MAX_GLINTS = 2200;
/** Lattice spacing at rest, CSS px: along the track, and across it. */
const COL_PX = 3;
const ROW_PX = 1.35;
/** The area the glint count is calibrated on: the wide card's stage. */
const BASE_AREA = 720 * 208;
const STEP = 1 / 60;
const MOON_SUBSTEPS = 8;
/** Epicyclic period of a displaced point, s: sets the scallops' wavelength for a given relative speed. */
const PERIOD = 0.55;
const KAPPA = (2 * Math.PI) / PERIOD;
/** How quickly a point's guiding centre is moved out of the lane, 1/s. */
const PUSH = 16;
/** The autopilot's lap, s. */
const LAP = 19;
const GLINT = 1.2;
/** The dust fades out over this share of the width at each side, so the wrap never pops. */
const FADE = 0.05;
const DASH = [2, 3];
const NO_DASH: number[] = [];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (t: number) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x2545f491) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = readonly [number, number, number];

let probe: CanvasRenderingContext2D | null = null;
function readRgb(el: Element | undefined): Rgb {
  if (!el) return [0, 0, 0];
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return [0, 0, 0];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "rgb(0, 0, 0)";
  probe.fillStyle = getComputedStyle(el).color;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}

const rgb = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

type Band = {
  /** Radial extent, as a share of the frame's height (the first starts above the frame). */
  start: number;
  end: number;
  density: number;
  light: number;
  /** Thin dark ringlets inside the band, as radial shares. */
  ringlets: number[];
};

/** How far the bands bow at the frame's edges, as a share of its height. */
const bowShare = (curvature: number) => clamp01(curvature) * 0.2;

/**
 * The ring system's radial layout: bands of seeded widths separated by
 * gaps sharing `gapWidth`'s share of the height, the first starting far
 * enough above the frame that the bow never shows an empty corner.
 */
function layoutBands(
  count: number,
  gapWidth: number,
  curvature: number,
  seed: number,
): Band[] {
  const n = clamp(Math.round(count), 3, 9);
  const rand = lcg(seed * 7919 + n * 31);
  const top = -bowShare(curvature) - 0.03;
  const span = 1 - top;
  const gapShare = lerp(0.025, 0.36, clamp01(gapWidth));
  const widths: number[] = [];
  const gaps: number[] = [];
  for (let i = 0; i < n; i += 1) widths.push(0.55 + rand() * 0.9);
  for (let i = 0; i < n - 1; i += 1) gaps.push(0.55 + rand() * 0.9);
  const wSum = widths.reduce((a, b) => a + b, 0);
  const gSum = gaps.reduce((a, b) => a + b, 0) || 1;
  const out: Band[] = [];
  let at = top;
  for (let i = 0; i < n; i += 1) {
    const w = ((widths[i] ?? 1) / wSum) * span * (1 - gapShare);
    const ringlets: number[] = [];
    const count = w > 0.12 ? 1 + Math.floor(rand() * 3) : rand() < 0.5 ? 1 : 0;
    for (let k = 0; k < count; k += 1) {
      ringlets.push(Number((at + w * (0.18 + rand() * 0.64)).toFixed(6)));
    }
    out.push({
      start: Number(at.toFixed(6)),
      end: Number((at + w).toFixed(6)),
      density: Number((0.4 + rand() * 0.6).toFixed(3)),
      light: Number((0.45 + rand() * 0.55).toFixed(3)),
      ringlets,
    });
    at += w;
    if (i < n - 1) at += ((gaps[i] ?? 1) / gSum) * span * gapShare;
  }
  return out;
}

type Place = { band: number | null; gap: number | null };

function placeOf(bands: Band[], u: number): Place {
  const first = bands[0];
  const lastBand = bands[bands.length - 1];
  if (!first || !lastBand) return { band: null, gap: null };
  if (u <= first.end) return { band: 0, gap: null };
  if (u >= lastBand.start) return { band: bands.length - 1, gap: null };
  for (let b = 0; b < bands.length; b += 1) {
    const band = bands[b];
    const next = bands[b + 1];
    if (!band) continue;
    if (u >= band.start && u <= band.end) return { band: b, gap: null };
    if (next && u > band.end && u < next.start) return { band: null, gap: b };
  }
  return { band: null, gap: null };
}

/** Where the moon rests: in the gap nearest the middle, a little right of centre. */
function restOf(bands: Band[]): { x: number; u: number } {
  let best = 0.55;
  let distance = Infinity;
  for (let b = 0; b < bands.length - 1; b += 1) {
    const mid = ((bands[b]?.end ?? 0) + (bands[b + 1]?.start ?? 0)) / 2;
    if (mid < 0.12 || mid > 0.88) continue;
    const d = Math.abs(mid - 0.55);
    if (d < distance) {
      distance = d;
      best = mid;
    }
  }
  return { x: 0.64, u: Number(best.toFixed(6)) };
}

export type RingReading = {
  pct: number;
  band: number | null;
  gap: number | null;
};

type Config = {
  density: number;
  gapWidth: number;
  wake: number;
  bands: number;
  curvature: number;
  shear: number;
  moonSize: number;
  autopilot: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  point: (x: number, y: number) => void;
  release: (delay: number) => void;
  steer: (dx: number, dy: number) => RingReading;
  steerTo: (edge: "start" | "end") => RingReading;
  unsteer: () => boolean;
  focus: (on: boolean) => void;
  dispose: () => void;
};

/**
 * The radial tone of the rings at `u`: the band's own brightness, eased in
 * over a hair at each edge, cut by its ringlets, times a per-row grain so
 * the sheet shows the fine radial striation real rings have.
 */
function toneAt(bands: Band[], u: number, grain: number): number {
  for (const band of bands) {
    if (u < band.start || u > band.end) continue;
    const edge = Math.min(u - band.start, band.end - u);
    let tone = band.density * band.light * smooth(edge / 0.006) * grain;
    for (const r of band.ringlets) {
      const k = (u - r) / 0.0045;
      tone *= 1 - 0.8 * Math.exp(-k * k);
    }
    return tone;
  }
  return 0;
}

/**
 * The ring system outside React. The dust is a lattice of material points,
 * one per texel of a small tone buffer: each row is one orbit, carrying the
 * radial tone of the rings at its radius, so at rest the buffer reproduces
 * the bands exactly — smooth along the track, finely striated across it —
 * and wherever the moon has moved material, the buffer shows it: a lane
 * where the points have left, bright crests where they pile up. A sparse
 * set of glints rides the same points, drawn crisp, for grain.
 */
function createRings(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  report: {
    current: {
      onRead: (r: RingReading) => void;
      onSteer: (steering: boolean) => void;
    };
  },
): Engine {
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let carry = 0;
  let disposed = false;
  let live = false;
  let releaseTimer = 0;
  const size = { w: 0, h: 0, dpr: 1 };
  let bands: Band[] = [];
  let top = 0;
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  let ink: Rgb = [60, 60, 60];
  let moonRgb: Rgb = [200, 190, 170];
  let dark = true;
  let dustStyle = "rgb(220, 220, 220)";
  let ringStyle = "rgb(200, 190, 170)";
  let fades: [CanvasGradient, CanvasGradient] | null = null;
  let sprite: HTMLCanvasElement | null = null;
  let spriteHalf = 0;
  let focused = false;

  /** The tone buffer: one texel per lattice point at rest. */
  const tone = {
    canvas: null as HTMLCanvasElement | null,
    ctx: null as CanvasRenderingContext2D | null,
    image: null as ImageData | null,
    alpha: null as Uint8ClampedArray | null,
    words: null as Uint32Array | null,
    base: 0,
  };
  /** Lattice shape: columns per row, the active rows, texel size, buffer rows. */
  const lat = { cols: 0, rows: 0, sx: 3, th: 1.35, bufRows: 0 };
  const rowR = new Float32Array(MAX_ROWS);
  /** Per point: x, guiding-centre offset, radial offset and velocity, tone. */
  const X = new Float32Array(MAX_POINTS);
  const H = new Float32Array(MAX_POINTS);
  const D = new Float32Array(MAX_POINTS);
  const V = new Float32Array(MAX_POINTS);
  const T = new Float32Array(MAX_POINTS);
  /** Glints: the point each rides, and its fixed offset from it. */
  const GI = new Int32Array(MAX_GLINTS);
  const GX = new Float32Array(MAX_GLINTS);
  const GR = new Float32Array(MAX_GLINTS);
  let glints = 0;

  const moon = { x: 0, y: 0, vx: 0, vy: 0 };
  const hand = { x: 0, y: 0 };
  /** Where the autopilot is aiming this step. */
  const aim = { x: 0, y: 0 };
  const keys = { x: 0, y: 0 };
  const from = { x: 0, y: 0 };
  let mode: "auto" | "hand" | "keys" = "auto";
  /** Autopilot clock, its phase offset, and the blend from where the moon was left. */
  const pilot = { t: 0, phase: 0, blend: 0 };
  let lastPlace: Place = { band: -1, gap: null };

  const bowAt = (x: number) => {
    const half = size.w / 2 || 1;
    const t = clamp((x - half) / half, -1.15, 1.15);
    return bowShare(cfg?.curvature ?? 0.5) * size.h * t * t;
  };

  const moonRadius = () => clamp(cfg?.moonSize ?? 6, 3, 14);

  const laneOf = (wake: number) => moonRadius() * 1.2 + lerp(3, 12, wake);

  const keepInside = (p: { x: number; y: number }) => {
    const m = moonRadius() + 3;
    p.x = clamp(p.x, m, Math.max(m, size.w - m));
    p.y = clamp(p.y, m, Math.max(m, size.h - m));
  };

  const restPoint = () => {
    const rest = restOf(bands);
    const x = rest.x * size.w;
    return { x, y: rest.u * size.h + bowAt(x) };
  };

  const orbitAt = (theta: number) => ({
    x: size.w / 2 + size.w * 0.36 * Math.cos(theta),
    y: size.h * (0.52 + 0.3 * Math.sin(theta)),
  });

  const omega = (2 * Math.PI) / LAP;

  /** Starts the moon's own orbit from wherever it is, at the nearest point of the lap. */
  const resume = () => {
    const was = mode;
    mode = "auto";
    from.x = moon.x;
    from.y = moon.y;
    pilot.blend = 0;
    let best = 0;
    let distance = Infinity;
    for (let k = 0; k < 36; k += 1) {
      const theta = (k / 36) * Math.PI * 2;
      const p = orbitAt(theta);
      const d = Math.hypot(p.x - moon.x, p.y - moon.y);
      if (d < distance) {
        distance = d;
        best = theta;
      }
    }
    pilot.phase = best - pilot.t * omega;
    if (was !== "auto") report.current.onSteer(false);
  };

  const target = (dt: number) => {
    const c = cfg;
    if (mode === "hand") return hand;
    if (mode === "keys") return keys;
    if (!c || !c.motionSafe || !c.autopilot || c.paused) return from;
    pilot.t += dt;
    pilot.blend = Math.min(1, pilot.blend + dt / 1.6);
    const p = orbitAt(pilot.t * omega + pilot.phase);
    const b = smooth(pilot.blend);
    aim.x = lerp(from.x, p.x, b);
    aim.y = lerp(from.y, p.y, b);
    keepInside(aim);
    return aim;
  };

  /** Lays the lattice for the current size and band layout. */
  const buildLattice = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    bands = layoutBands(c.bands, c.gapWidth, c.curvature, c.seed);
    top = bands[0]?.start ?? 0;
    const { w, h } = size;
    const span = w + 4;
    lat.cols = clamp(Math.round(span / COL_PX), 24, MAX_COLS);
    lat.sx = span / lat.cols;
    const reach = 1 - top;
    let th = Math.max(ROW_PX, (reach * h) / MAX_ROWS);
    lat.bufRows = Math.max(8, Math.round(h / th));
    th = h / lat.bufRows;
    lat.th = th;
    const rand = lcg(c.seed * 104729 + 17);
    const cols = lat.cols;
    let rows = 0;
    const total = Math.min(MAX_ROWS, Math.ceil((reach * h) / th));
    for (let j = 0; j < total; j += 1) {
      const u = top + ((j + 0.5) * th) / h;
      const grain = 0.8 + rand() * 0.4;
      const t = toneAt(bands, u, grain);
      if (t < 0.01 || (rows + 1) * cols > MAX_POINTS) continue;
      rowR[rows] = u * h;
      // Clumps along the row, periodic over it so a wrap is seamless: they
      // are what shows the shear moving.
      const k1 = Math.max(1, Math.round(cols / (16 + rand() * 26)));
      const k2 = Math.max(2, Math.round(cols / (5 + rand() * 4)));
      const p1 = rand() * Math.PI * 2;
      const p2 = rand() * Math.PI * 2;
      const base = rows * cols;
      for (let i = 0; i < cols; i += 1) {
        const a = (i / cols) * Math.PI * 2;
        const clump =
          1 +
          0.24 * Math.sin(a * k1 + p1) +
          0.1 * Math.sin(a * k2 + p2) +
          (rand() - 0.5) * 0.16;
        const p = base + i;
        X[p] = -2 + (i + 0.5) * lat.sx;
        H[p] = 0;
        D[p] = 0;
        V[p] = 0;
        T[p] = Math.max(0, t * clump);
      }
      rows += 1;
    }
    lat.rows = rows;
    buildGlints();
    // The tone buffer: one texel per lattice point.
    if (!tone.canvas) tone.canvas = document.createElement("canvas");
    if (
      tone.canvas.width !== cols ||
      tone.canvas.height !== lat.bufRows ||
      !tone.ctx
    ) {
      tone.canvas.width = cols;
      tone.canvas.height = lat.bufRows;
      tone.ctx = tone.canvas.getContext("2d");
      tone.image = tone.ctx
        ? tone.ctx.createImageData(cols, lat.bufRows)
        : null;
      tone.alpha = tone.image ? tone.image.data : null;
      tone.words = tone.alpha ? new Uint32Array(tone.alpha.buffer) : null;
    }
  };

  /** Glints on bright points, more of them in denser rings. */
  const buildGlints = () => {
    const c = cfg;
    const points = lat.rows * lat.cols;
    if (!c || points < 1) {
      glints = 0;
      return;
    }
    const rand = lcg(c.seed * 7727 + 3);
    const want = Math.round(
      lerp(90, 1400, clamp01(c.density)) * ((size.w * size.h) / BASE_AREA),
    );
    glints = 0;
    for (
      let tries = 0;
      tries < want * 4 && glints < Math.min(MAX_GLINTS, want);
      tries += 1
    ) {
      const p = Math.floor(rand() * points);
      if (rand() * 1.3 > (T[p] ?? 0)) continue;
      GI[glints] = p;
      GX[glints] = (rand() - 0.5) * lat.sx;
      GR[glints] = (rand() - 0.5) * lat.th;
      glints += 1;
    }
  };

  const toneBase = (c: Rgb) =>
    (littleEndian
      ? (c[2] << 16) | (c[1] << 8) | c[0]
      : (c[0] << 24) | (c[1] << 16) | (c[2] << 8)) >>> 0;

  const paintColours = () => {
    const kids = carriers.children;
    const pale = readRgb(kids[0]);
    const inked = readRgb(kids[1]);
    moonRgb = readRgb(kids[2]);
    const ground = readRgb(kids[3]);
    dark =
      (0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2]) / 255 <
      0.5;
    ink = inked;
    dustStyle = rgb(dark ? pale : inked);
    ringStyle = rgb(dark ? moonRgb : inked);
    tone.base = toneBase(dark ? pale : inked);
    buildSprite();
  };

  /** The moon, lit from the upper left, rendered once per colour and size. */
  const buildSprite = () => {
    const r = moonRadius();
    const dpr = size.dpr || 1;
    const half = r + 5;
    const px = Math.ceil(half * 2 * dpr);
    const s = sprite ?? document.createElement("canvas");
    s.width = px;
    s.height = px;
    const g = s.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, half * 2, half * 2);
    // A soft shadow ring, so the moon stands off the dust on either theme.
    const shade = dark ? ([0, 0, 0] as Rgb) : mixRgb(ink, [0, 0, 0], 0.4);
    const halo = g.createRadialGradient(half, half, r * 0.9, half, half, half);
    halo.addColorStop(0, `rgba(${shade[0]}, ${shade[1]}, ${shade[2]}, 0.45)`);
    halo.addColorStop(1, `rgba(${shade[0]}, ${shade[1]}, ${shade[2]}, 0)`);
    g.fillStyle = halo;
    g.fillRect(0, 0, half * 2, half * 2);
    const body = g.createRadialGradient(
      half - r * 0.38,
      half - r * 0.42,
      r * 0.05,
      half,
      half,
      r,
    );
    body.addColorStop(0, rgb(mixRgb(moonRgb, [255, 255, 255], 0.5)));
    body.addColorStop(0.55, rgb(moonRgb));
    body.addColorStop(1, rgb(mixRgb(moonRgb, [0, 0, 0], 0.55)));
    g.fillStyle = body;
    g.beginPath();
    g.arc(half, half, r, 0, Math.PI * 2);
    g.fill();
    sprite = s;
    spriteHalf = half;
  };

  const placeAt = (x: number, y: number) =>
    placeOf(bands, (y - bowAt(x)) / (size.h || 1));

  const readingAt = (x: number, y: number): RingReading => {
    const place = placeAt(x, y);
    return {
      pct: Math.round(clamp01(y / (size.h || 1)) * 100),
      band: place.band,
      gap: place.gap,
    };
  };

  const emitPlace = () => {
    const place = placeAt(moon.x, moon.y);
    if (place.band === lastPlace.band && place.gap === lastPlace.gap) return;
    lastPlace = place;
    report.current.onRead(readingAt(moon.x, moon.y));
  };

  /** Reduced motion: the moon where it is put and a clean clearing round it, no history. */
  const still = () => {
    const c = cfg;
    if (!c) return;
    const t = mode === "hand" ? hand : mode === "keys" ? keys : from;
    moon.x = t.x;
    moon.y = t.y;
    moon.vx = 0;
    moon.vy = 0;
    const lane = laneOf(clamp01(c.wake));
    const reach = lane * 1.7 + 6;
    const mr = moon.y - bowAt(moon.x);
    const cols = lat.cols;
    for (let j = 0; j < lat.rows; j += 1) {
      const r0 = rowR[j] ?? 0;
      const near = Math.abs(r0 - mr) < lane;
      const base = j * cols;
      for (let i = 0; i < cols; i += 1) {
        const p = base + i;
        let off = 0;
        if (near) {
          const dx = (X[p] ?? 0) - moon.x;
          if (dx > -reach && dx < reach) {
            const q = dx / reach;
            const clear = lane * Math.sqrt(1 - q * q);
            const rel = r0 - mr;
            if (rel < clear && rel > -clear) {
              const side = rel !== 0 ? Math.sign(rel) : i & 1 ? 1 : -1;
              off = side * clear - rel;
            }
          }
        }
        H[p] = off;
        D[p] = off;
        V[p] = 0;
      }
    }
  };

  /** One fixed step of the moon and every point; says whether anything still moves. */
  const stepOnce = (): boolean => {
    const c = cfg;
    if (!c) return false;
    const { w, h } = size;
    let moving = false;
    const goal = target(STEP);
    const S = springs.snap;
    const sub = STEP / MOON_SUBSTEPS;
    for (let k = 0; k < MOON_SUBSTEPS; k += 1) {
      const ax =
        (S.stiffness * (goal.x - moon.x) - S.damping * moon.vx) / S.mass;
      const ay =
        (S.stiffness * (goal.y - moon.y) - S.damping * moon.vy) / S.mass;
      moon.vx += ax * sub;
      moon.vy += ay * sub;
      moon.x += moon.vx * sub;
      moon.y += moon.vy * sub;
    }
    if (
      Math.abs(goal.x - moon.x) > 0.05 ||
      Math.abs(goal.y - moon.y) > 0.05 ||
      Math.abs(moon.vx) + Math.abs(moon.vy) > 0.5
    ) {
      moving = true;
    } else {
      moon.x = goal.x;
      moon.y = goal.y;
      moon.vx = 0;
      moon.vy = 0;
    }
    if (mode === "auto" && c.autopilot && !c.paused) moving = true;

    const wake = clamp01(c.wake);
    const decay = Math.exp(-STEP / lerp(1.1, 6.5, wake));
    const zeta = lerp(0.34, 0.07, wake);
    const lane = laneOf(wake);
    const reach = lane * 1.7 + 6;
    const shearing = !c.paused && c.shear > 0;
    const rate = clamp(c.shear, 0, 2) * 0.32;
    if (shearing) moving = true;
    const mid = h * 0.5;
    const mr = moon.y - bowAt(moon.x);
    const kk = KAPPA * KAPPA;
    const kz = 2 * zeta * KAPPA;
    const pushK = Math.min(1, PUSH * STEP);
    const span = w + 4;
    const cols = lat.cols;
    let active = false;
    for (let j = 0; j < lat.rows; j += 1) {
      const r0 = rowR[j] ?? 0;
      // Each orbit drifts at its own speed: the frame rides the middle.
      const drift = shearing ? rate * (r0 - mid) * STEP : 0;
      const near = Math.abs(r0 - mr) < lane * 2.2 + 4;
      const base = j * cols;
      for (let i = 0; i < cols; i += 1) {
        const p = base + i;
        let x = (X[p] ?? 0) + drift;
        let hh = H[p] ?? 0;
        let d = D[p] ?? 0;
        let v = V[p] ?? 0;
        let awake = hh !== 0 || d !== 0 || v !== 0;
        // Dust arriving from upstream has not met the moon yet.
        if (x > w + 2) {
          x -= span;
          hh = 0;
          d = 0;
          v = 0;
          awake = false;
        } else if (x < -2) {
          x += span;
          hh = 0;
          d = 0;
          v = 0;
          awake = false;
        }
        if (near) {
          const dx = x - moon.x;
          if (dx > -reach && dx < reach) {
            const q = dx / reach;
            const clear = lane * Math.sqrt(1 - q * q);
            const rel = r0 + hh - mr;
            if (rel < clear && rel > -clear) {
              const side = rel !== 0 ? Math.sign(rel) : i & 1 ? 1 : -1;
              hh += (side * clear - rel) * pushK;
              awake = true;
            }
          }
        }
        if (awake) {
          hh *= decay;
          // The point rings about its guiding centre at the epicyclic
          // frequency; carried along by the shear, that ringing is the scallop.
          v += (-kk * (d - hh) - kz * v) * STEP;
          d += v * STEP;
          if (Math.abs(hh) < 0.05 && Math.abs(d) < 0.05 && Math.abs(v) < 0.05) {
            hh = 0;
            d = 0;
            v = 0;
          } else if (!active && (Math.abs(v) > 0.02 || Math.abs(hh) > 0.3)) {
            active = true;
          }
        }
        X[p] = x;
        H[p] = hh;
        D[p] = d;
        V[p] = v;
      }
    }
    return moving || active;
  };

  const advance = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    if (!c.motionSafe) {
      still();
      return false;
    }
    carry += dt;
    let steps = 0;
    let moving = false;
    while (carry >= STEP && steps < 4) {
      carry -= STEP;
      steps += 1;
      moving = stepOnce() || moving;
    }
    if (steps === 4) carry = 0;
    if (steps === 0) moving = true;
    return moving;
  };

  const draw = () => {
    const c = cfg;
    const ctx = canvas.getContext("2d");
    if (!c || !ctx || !visible.current || size.w < 1) return;
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    const half = w / 2 || 1;
    const bowK = bowShare(c.curvature) * h;
    const cols = lat.cols;
    const { sx, th } = lat;
    const { alpha, words, image } = tone;
    if (alpha && words && image && tone.ctx && tone.canvas) {
      words.fill(tone.base);
      const bh = lat.bufRows;
      const row = cols * 4;
      const unit = 255 * lerp(0.18, 1, clamp01(c.density)) * (dark ? 1 : 0.8);
      for (let j = 0; j < lat.rows; j += 1) {
        const r0 = rowR[j] ?? 0;
        const base = j * cols;
        for (let i = 0; i < cols; i += 1) {
          const p = base + i;
          const t = T[p] ?? 0;
          const x = X[p] ?? 0;
          const k = (x - half) / half;
          const y = r0 + (D[p] ?? 0) + bowK * k * k;
          const fx = (x + 2) / sx - 0.5;
          const fy = y / th - 0.5;
          const ix = Math.floor(fx);
          const iy = Math.floor(fy);
          if (ix < 0 || iy < 0 || ix > cols - 2 || iy > bh - 2) continue;
          const tx = fx - ix;
          const ty = fy - iy;
          const a = unit * t;
          const o = iy * row + ix * 4 + 3;
          alpha[o] = (alpha[o] ?? 0) + a * (1 - tx) * (1 - ty);
          alpha[o + 4] = (alpha[o + 4] ?? 0) + a * tx * (1 - ty);
          alpha[o + row] = (alpha[o + row] ?? 0) + a * (1 - tx) * ty;
          alpha[o + row + 4] = (alpha[o + row + 4] ?? 0) + a * tx * ty;
        }
      }
      tone.ctx.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tone.canvas, -2, 0, cols * sx, bh * th);
    }
    // Glints ride their points, crisp.
    ctx.fillStyle = dustStyle;
    ctx.beginPath();
    const o = GLINT / 2;
    for (let g = 0; g < glints; g += 1) {
      const p = GI[g] ?? 0;
      const j = Math.floor(p / (cols || 1));
      const x = (X[p] ?? 0) + (GX[g] ?? 0);
      const k = (x - half) / half;
      const y = (rowR[j] ?? 0) + (D[p] ?? 0) + (GR[g] ?? 0) + bowK * k * k;
      ctx.rect(x - o, y - o, GLINT, GLINT);
    }
    ctx.globalAlpha = dark ? 0.6 : 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;
    // The dust fades out at the sides, where it wraps; the moon does not.
    if (fades) {
      const fw = Math.ceil(w * FADE);
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = fades[0];
      ctx.fillRect(0, 0, fw, h);
      ctx.fillStyle = fades[1];
      ctx.fillRect(w - fw, 0, fw, h);
      ctx.globalCompositeOperation = "source-over";
    }
    if (sprite) {
      ctx.drawImage(
        sprite,
        moon.x - spriteHalf,
        moon.y - spriteHalf,
        spriteHalf * 2,
        spriteHalf * 2,
      );
    }
    if (focused) {
      ctx.strokeStyle = ringStyle;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      ctx.setLineDash(DASH);
      ctx.beginPath();
      ctx.arc(moon.x, moon.y, moonRadius() * 2.6 + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      ctx.globalAlpha = 1;
    }
    if (!live) {
      live = true;
      root.setAttribute("data-live", "");
    }
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : STEP;
    last = now;
    const moving = advance(dt);
    draw();
    emitPlace();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const clearRelease = () => {
    if (releaseTimer) window.clearTimeout(releaseTimer);
    releaseTimer = 0;
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    const first = size.w === 0 && moon.x === 0 && moon.y === 0;
    const sx = size.w ? w / size.w : 1;
    const sy = size.h ? h / size.h : 1;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const fw = Math.ceil(w * FADE);
      const left = ctx.createLinearGradient(0, 0, fw, 0);
      left.addColorStop(0, "rgba(0, 0, 0, 1)");
      left.addColorStop(1, "rgba(0, 0, 0, 0)");
      const right = ctx.createLinearGradient(w - fw, 0, w, 0);
      right.addColorStop(0, "rgba(0, 0, 0, 0)");
      right.addColorStop(1, "rgba(0, 0, 0, 1)");
      fades = [left, right];
    }
    buildLattice();
    buildSprite();
    if (first) {
      const rest = restPoint();
      moon.x = rest.x;
      moon.y = rest.y;
      resume();
    } else {
      for (const p of [moon, hand, keys, from, aim]) {
        p.x *= sx;
        p.y *= sy;
      }
    }
    if (!c.motionSafe) still();
    draw();
    emitPlace();
    kick();
  };

  const steer = (dx: number, dy: number): RingReading => {
    clearRelease();
    if (mode !== "keys") {
      const was = mode;
      mode = "keys";
      keys.x = was === "hand" ? hand.x : moon.x;
      keys.y = was === "hand" ? hand.y : moon.y;
      if (was === "auto") report.current.onSteer(true);
    }
    keys.x += dx;
    keys.y += dy;
    keepInside(keys);
    if (cfg && !cfg.motionSafe) still();
    draw();
    kick();
    // The reading is where the moon is headed, so a key's answer is final.
    return readingAt(keys.x, keys.y);
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        paintColours();
        resize();
        return;
      }
      if (was.colourKey !== next.colourKey) paintColours();
      if (was.moonSize !== next.moonSize) buildSprite();
      if (
        was.seed !== next.seed ||
        was.gapWidth !== next.gapWidth ||
        was.bands !== next.bands ||
        was.curvature !== next.curvature
      ) {
        buildLattice();
        if (mode === "auto" && !next.motionSafe) {
          const rest = restPoint();
          from.x = rest.x;
          from.y = rest.y;
        }
        lastPlace = { band: -1, gap: null };
      } else if (was.density !== next.density) {
        buildGlints();
      }
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (
        mode === "auto" &&
        (was.paused !== next.paused ||
          was.autopilot !== next.autopilot ||
          was.motionSafe !== next.motionSafe)
      ) {
        resume();
        if (!next.motionSafe) {
          const rest = restPoint();
          from.x = rest.x;
          from.y = rest.y;
        }
      }
      if (!next.motionSafe) still();
      draw();
      emitPlace();
      kick();
    },
    resize,
    readColours() {
      paintColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    point(x, y) {
      clearRelease();
      if (mode !== "hand") {
        const was = mode;
        mode = "hand";
        if (was === "auto") report.current.onSteer(true);
      }
      hand.x = x;
      hand.y = y;
      keepInside(hand);
      if (cfg && !cfg.motionSafe) {
        still();
        draw();
        emitPlace();
        return;
      }
      kick();
    },
    release(delay) {
      if (mode !== "hand") return;
      clearRelease();
      const go = () => {
        releaseTimer = 0;
        if (mode !== "hand") return;
        resume();
        if (cfg && !cfg.motionSafe) {
          still();
          draw();
          emitPlace();
        }
        kick();
      };
      if (delay > 0) releaseTimer = window.setTimeout(go, delay);
      else go();
    },
    steer,
    steerTo(edge) {
      const y = edge === "start" ? 0 : size.h;
      return steer(0, y - (mode === "keys" ? keys.y : moon.y));
    },
    unsteer() {
      if (mode !== "keys") return false;
      resume();
      if (cfg && !cfg.motionSafe) {
        still();
        draw();
        emitPlace();
      }
      kick();
      return true;
    },
    focus(on) {
      focused = on;
      draw();
    },
    dispose() {
      disposed = true;
      clearRelease();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A close look down onto a planetary ring system: bands of fine dust bowed
 * round a planet below the frame, dark gaps between them and thin ringlets
 * inside, shearing past slowly — the dust inside the middle drifting one
 * way and outside it the other, as rings do seen from a moon's orbit.
 *
 * The pointer is a small moon on the snap spring. Every grain it passes is
 * pushed out of its track until it clears a lane, and because each grain
 * then rings about its new orbit at the epicyclic frequency while the shear
 * carries it along, both edges of the lane raise scalloped waves that trail
 * opposite ways and spread and smooth out behind it; the lane itself closes
 * over a few seconds. Without a pointer the moon circles the field on its
 * own. It is a slider for where the moon is: arrows steer it, Escape gives
 * it back its orbit. Under reduced motion the dust lies still and the moon
 * parts a clean clearing wherever it is put.
 */
export function RingShepherd({
  ringDensity = 0.6,
  gapWidth = 0.4,
  wake = 0.6,
  bands = 6,
  color = "oklch(from var(--warn) 0.88 0.03 h)",
  moonColor = "oklch(from var(--warn) 0.8 0.05 h)",
  moonSize = 6,
  shear = 1,
  curvature = 0.5,
  autopilot = true,
  step = 18,
  interactive = true,
  disabled = false,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Steer the moon",
  onBandChange,
  onSteerChange,
  className,
}: RingShepherdProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const live = interactive && !disabled;
  const n = clamp(Math.round(bands), 3, 9);
  const layout = React.useMemo(
    () => layoutBands(n, gapWidth, curvature, seed),
    [n, gapWidth, curvature, seed],
  );
  const rest = React.useMemo(() => restOf(layout), [layout]);
  const [reading, setReading] = React.useState<RingReading>(() => {
    const place = placeOf(layout, rest.u);
    return {
      pct: Math.round(clamp01(rest.u) * 100),
      band: place.band,
      gap: place.gap,
    };
  });
  const paints = React.useMemo(
    () =>
      [
        color,
        `color-mix(in oklab, ${color} 42%, black)`,
        moonColor,
        "var(--background)",
      ] as const,
    [color, moonColor],
  );
  const colourKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const callbacks = React.useRef({ onBandChange, onSteerChange });
  const lastBand = React.useRef<number | null | undefined>(undefined);

  const read = React.useCallback((r: RingReading) => {
    setReading((was) =>
      was.pct === r.pct && was.band === r.band && was.gap === r.gap ? was : r,
    );
    if (lastBand.current !== r.band) {
      lastBand.current = r.band;
      callbacks.current.onBandChange?.(r.band);
    }
  }, []);
  const report = React.useRef({
    onRead: read,
    onSteer: (steering: boolean) => {
      callbacks.current.onSteerChange?.(steering);
    },
  });

  const config: Config = {
    density: ringDensity,
    gapWidth,
    wake,
    bands: n,
    curvature,
    shear,
    moonSize,
    autopilot,
    paused,
    seed,
    dpr,
    motionSafe,
    colourKey,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    callbacks.current = { onBandChange, onSteerChange };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createRings(root, canvas, carriers, visible, report);
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
      visible.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const rect = root.getBoundingClientRect();
    return {
      x: clientX - rect.left - root.clientLeft,
      y: clientY - rect.top - root.clientTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const p = local(event.clientX, event.clientY);
    engine.current?.point(p.x, p.y);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const p = local(event.clientX, event.clientY);
    engine.current?.point(p.x, p.y);
  };

  // A finger leaves the moon where it lifted for a moment before the moon
  // goes back to its orbit; a mouse that leaves hands it back at once.
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.release(1400);
  };
  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.release(1400);
  };
  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.release(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!live) return;
    const e = engine.current;
    if (!e) return;
    const by = clamp(step, 2, 120) * (event.shiftKey ? 3 : 1);
    let next: RingReading | null = null;
    switch (event.key) {
      case "ArrowUp":
        next = e.steer(0, -by);
        break;
      case "ArrowDown":
        next = e.steer(0, by);
        break;
      case "ArrowLeft":
        next = e.steer(-by, 0);
        break;
      case "ArrowRight":
        next = e.steer(by, 0);
        break;
      case "PageUp":
        next = e.steer(0, -by * 4);
        break;
      case "PageDown":
        next = e.steer(0, by * 4);
        break;
      case "Home":
        next = e.steerTo("start");
        break;
      case "End":
        next = e.steerTo("end");
        break;
      case "Escape":
        if (e.unsteer()) event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    read(next);
  };

  const valueText =
    reading.band !== null
      ? `In band ${reading.band + 1} of ${n}`
      : reading.gap !== null
        ? `In the gap between bands ${reading.gap + 1} and ${reading.gap + 2}`
        : "Among the rings";

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      className={cn(
        // A sideways finger steers; an upright swipe still scrolls the page.
        "group/ring-shepherd relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/ring-shepherd:invisible group-data-live/ring-shepherd:opacity-0"
      >
        <StandIn
          bands={layout}
          color={color}
          moonColor={moonColor}
          moonSize={moonSize}
          curvature={curvature}
          rest={rest}
        />
      </div>
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
      <div
        role="slider"
        tabIndex={live ? 0 : -1}
        aria-label={label}
        aria-describedby={hintId}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={reading.pct}
        aria-valuetext={valueText}
        aria-disabled={!live || undefined}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            engine.current?.focus(true);
          }
        }}
        onBlur={() => {
          engine.current?.focus(false);
          engine.current?.unsteer();
        }}
        className={cn(
          "absolute inset-0 rounded-[inherit] outline-none select-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          live ? "cursor-none" : "cursor-default",
        )}
      />
      <p id={hintId} className="sr-only">
        Arrow keys steer the moon through the rings, Shift for bigger steps;
        Escape gives it back its own orbit.
      </p>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * bands as bowed sheets of tone in SVG, and the moon resting in its gap.
 */
function StandIn({
  bands,
  color,
  moonColor,
  moonSize,
  curvature,
  rest,
}: {
  bands: Band[];
  color: string;
  moonColor: string;
  moonSize: number;
  curvature: number;
  rest: { x: number; u: number };
}) {
  const bow = bowShare(curvature);
  const edge = (u: number, reverse: boolean) => {
    const pts: string[] = [];
    for (let s = 0; s <= 12; s += 1) {
      const k = reverse ? 12 - s : s;
      const x = (k / 12) * 100;
      const t = (x - 50) / 50;
      pts.push(`${r3(x)} ${r3((u + bow * t * t) * 100)}`);
    }
    return pts;
  };
  const restT = (rest.x * 100 - 50) / 50;
  const restY = r3((rest.u + bow * restT * restT) * 100);
  const r = clamp(moonSize, 3, 14);
  return (
    <>
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          color: `color-mix(in oklab, ${color} 45%, var(--foreground))`,
        }}
      >
        {bands.map((band, i) => (
          <path
            key={i}
            d={`M ${edge(band.start, false).join(" L ")} L ${edge(band.end, true).join(" L ")} Z`}
            fill="currentColor"
            opacity={r3(0.07 + band.density * band.light * 0.16)}
          />
        ))}
      </svg>
      <span
        className="absolute rounded-full"
        style={{
          left: `${r3(rest.x * 100)}%`,
          top: `${restY}%`,
          width: r * 2,
          height: r * 2,
          marginLeft: -r,
          marginTop: -r,
          background: `radial-gradient(circle at 32% 30%, color-mix(in oklab, ${moonColor} 50%, white), ${moonColor} 55%, color-mix(in oklab, ${moonColor} 45%, black))`,
        }}
      />
    </>
  );
}
