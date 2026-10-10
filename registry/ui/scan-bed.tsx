"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ScanBedSubject = "stone" | "dunes" | "crater";

export type ScanBedProps = {
  /** The content on top of the bed: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How fast the beam reads, 0.1 to 3: a pass takes 3.6 s at 1. @default 1 */
  speed?: number;
  /** How closely the surface is sampled, 0 to 1: about 700 to 3,200 points. @default 0.6 */
  density?: number;
  /** How brightly the beam blooms and the read points burn, 0 to 1. @default 0.6 */
  glow?: number;
  /** What lies on the bed: a faceted pebble, wind ridges, or a ring-walled crater. @default "stone" */
  subject?: ScanBedSubject;
  /** How long a read point lingers after the beam has passed, ms. @default 1400 */
  afterglow?: number;
  /** How far the pointer tilts the bed, in degrees. @default 14 */
  tilt?: number;
  /** Draw the bed's perspective grid. @default true */
  grid?: boolean;
  /** The beam's colour. @default an accent-bright pigment */
  beamColor?: string;
  /** The colour read points cool to. @default a softer accent pigment */
  pointColor?: string;
  /** The bed itself, kept dark in either theme. @default the page mixed toward black with a breath of accent */
  bedColor?: string;
  /** The pointer and keyboard focus tilt the bed, and a press restarts the pass from there. @default true */
  interactive?: boolean;
  /** Hold the beam and the afterglow where they are; the tilt still answers. @default false */
  paused?: boolean;
  /** Seeds the subject's shape and the sampling jitter. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires with the number of completed passes: 0 when the beam starts, then after every pass. */
  onPass?: (passes: number) => void;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) tilting the bed. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const BED =
  "color-mix(in oklab, var(--accent) 9%, color-mix(in oklab, var(--background) 14%, black))";
const BEAM = "oklch(from var(--accent-bright) 0.82 calc(c * 0.75) h)";
const POINT =
  "oklch(from var(--accent-bright) 0.76 calc(c * 0.55) calc(h - 24))";

/** The resting view: a low look across the bed, so height reads. */
const REST_PITCH = (56 * Math.PI) / 180;
/** Seconds a pass takes at speed 1, and the dark rest before the next. */
const PASS = 3.6;
const REST_GAP = 0.6;
/** A read point is white-hot this long before it cools to the point colour. */
const HOT = 0.07;
const LEVELS = 6;
const BEAM_PAD = 24;
const GRID_CELL = 22;
/** The room's light, from the upper left and a little behind, in view coordinates. */
const LIGHT_X = -0.52;
const LIGHT_Y = -0.3;
const LIGHT_Z = 0.8;
const STEP = 1 / 120;
/** The tilt follows the hand on glide; a restarted beam flares on flick. */
const GLIDE = springs.glide;
const FLICK = springs.flick;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const deg = (d: number) => (d * Math.PI) / 180;

/** A small seeded generator: the same subject for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = [number, number, number];

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

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const css = ([r, g, b]: Rgb, a = 1) =>
  a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/**
 * The subject's height at bed point (u, v), both in units of its radius, and
 * whether the point belongs to it. Shapes are seeded so two beds differ.
 */
function shapeOf(subject: ScanBedSubject, seed: number) {
  const rand = lcg(seed * 7 + 3);
  const waves = Array.from({ length: 4 }, () => ({
    kx: (rand() - 0.5) * 7,
    ky: (rand() - 0.5) * 7,
    p: rand() * Math.PI * 2,
  }));
  const lean = (rand() - 0.5) * 0.5;
  const stretch = 1.15 + rand() * 0.35;
  const swirl = 0.35 + rand() * 0.4;
  return (u: number, v: number): number => {
    let rough = 0;
    for (const w of waves) rough += Math.sin(u * w.kx + v * w.ky + w.p);
    if (subject === "stone") {
      // A pebble: an elongated dome with soft facets.
      const ru = u * Math.cos(lean) + v * Math.sin(lean);
      const rv = -u * Math.sin(lean) + v * Math.cos(lean);
      const r2 = (ru * ru) / (stretch * stretch * 0.62) + rv * rv * 1.1;
      if (r2 >= 1) return Number.NaN;
      return Math.pow(1 - r2, 0.55) * (1 + rough * 0.045);
    }
    if (subject === "crater") {
      const r = Math.hypot(u, v * 1.05);
      if (r >= 1.05) return Number.NaN;
      const wall = Math.exp(-(((r - 0.6) / 0.17) ** 2));
      const bowl = -0.22 * Math.exp(-((r / 0.48) ** 2));
      const peak = 0.5 * Math.exp(-((r / 0.12) ** 2));
      const edge = 1 - clamp((r - 0.85) / 0.2, 0, 1);
      return (
        Math.max(0, (wall * 0.8 + bowl + peak + 0.24) * edge) + rough * 0.012
      );
    }
    // Dunes: steep lee faces, gentle windward ones, crests that wander.
    const phase = u * 3.4 + Math.sin(v * 1.7 + rough * 0.1) * swirl;
    const s = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2 * 0.5);
    return Math.pow(s, 2.4) + rough * 0.012;
  };
}

type Cloud = {
  n: number;
  X: Float32Array;
  Y: Float32Array;
  Z: Float32Array;
  /** The surface normal at each point, in bed coordinates. */
  NX: Float32Array;
  NY: Float32Array;
  NZ: Float32Array;
  /** This frame: how lit each point is by the room's light, 0 when it faces away. */
  shade: Float32Array;
  lit: Float32Array;
  px: Float32Array;
  py: Float32Array;
  ps: Float32Array;
  /** Each point's distance across the bed in the view's frame: the light sheet's coordinate. */
  vy: Float32Array;
  /** One index list per brightness level, then two for the white-hot. */
  lists: Int32Array[];
  counts: Int32Array;
  dot: number;
};

type Config = {
  speed: number;
  density: number;
  glow: number;
  subject: ScanBedSubject;
  afterglow: number;
  tilt: number;
  grid: boolean;
  paintKey: string;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onPass: (passes: number) => void;
  onActive: (active: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  readFrom: (y: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let cloud: Cloud | null = null;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let active = false;
  const size = { w: 0, h: 0, dpr: 1, R: 100, F: 1000 };
  const read = rgbReader();
  const paint = {
    bed: [0, 0, 0] as Rgb,
    beam: [255, 255, 255] as Rgb,
    point: [200, 200, 255] as Rgb,
    pointCss: "rgb(200, 200, 255)",
    hotCss: "rgb(255, 255, 255)",
    gridCss: "rgba(200, 200, 255, 0.1)",
    glintCss: "rgba(200, 200, 255, 0.5)",
  };
  const bedLayer = document.createElement("canvas");
  const beamSprite = document.createElement("canvas");
  let beamAbove = 0;
  const sim = {
    t: 0,
    phase: 0,
    beam: -BEAM_PAD,
    passes: 0,
    flare: 0,
    flareV: 0,
    yaw: 0,
    yawV: 0,
    pitch: REST_PITCH,
    pitchV: 0,
    sway: 0,
  };
  const hand = {
    x: 0,
    y: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  /** The subject sampled as a hex lattice; its normals give each point a shade. */
  const sample = () => {
    const c = cfg;
    const { w, h } = size;
    if (!c || w < 1 || h < 1) return;
    const cp = Math.cos(REST_PITCH);
    const sp = Math.sin(REST_PITCH);
    const rel =
      c.subject === "dunes" ? 0.3 : c.subject === "crater" ? 0.42 : 0.6;
    // The radius that lets the subject, standing at its height, fit the box
    // in the resting view with room for the pointer's tilt.
    const R = Math.max(
      24,
      Math.min(w * 0.36, 280, (h * 0.9) / (2 * cp + rel * sp)),
    );
    size.R = R;
    const heightOf = shapeOf(c.subject, c.seed);
    const H = R * rel;
    const rand = lcg(c.seed * 13 + 5);
    let x0 = -R;
    let x1 = R;
    let y0 = -R;
    let y1 = R;
    if (c.subject === "dunes") {
      // Dunes run under the whole visible bed.
      x1 = w * 0.62;
      x0 = -x1;
      y1 = (h * 0.62) / cp;
      y0 = -y1 * 1.25;
    }
    const target = 700 + clamp(c.density, 0, 1) * 2500;
    const area =
      c.subject === "dunes" ? (x1 - x0) * (y1 - y0) : Math.PI * R * R * 0.82;
    const spacing = Math.max(3, Math.sqrt(area / target / 0.866));
    // Rows are sampled finer across than down, so the line the beam reads
    // along a row is continuous — the way a scanner's own profiles are.
    const across = spacing * 0.62;
    const down = (spacing / 0.62) * 0.866;
    const yShift = c.subject === "dunes" ? 0 : (H * sp * 0.5) / cp;
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    const nxs: number[] = [];
    const nys: number[] = [];
    const nzs: number[] = [];
    const add = (jx: number, jy: number) => {
      const u = jx / R;
      const v = jy / R;
      const z = heightOf(u, v);
      if (Number.isNaN(z)) return;
      const e = 0.5 / R;
      const zx = (heightOf(u + e, v) - heightOf(u - e, v)) / (2 * e);
      const zy = (heightOf(u, v + e) - heightOf(u, v - e)) / (2 * e);
      const gx = Number.isNaN(zx) ? 0 : zx * rel;
      const gy = Number.isNaN(zy) ? 0 : zy * rel;
      const len = Math.hypot(gx, gy, 1);
      xs.push(jx);
      ys.push(jy + yShift);
      zs.push(z * H);
      nxs.push(-gx / len);
      nys.push(-gy / len);
      nzs.push(1 / len);
    };
    if (c.subject === "dunes") {
      // A field this wide cannot be sampled finely everywhere, so it is read
      // as a few fine profiles spaced evenly on screen, the way a line
      // scanner builds one: far rows bunch on the bed, near ones spread.
      const F = size.F;
      const rows = Math.round(8 + clamp(c.density, 0, 1) * 14);
      const per = Math.max(8, Math.round(target / rows));
      const step = (x1 - x0) / per;
      for (let k = 0; k < rows; k += 1) {
        const yy = -10 + ((h + 20) * (k + 0.5)) / rows - h / 2;
        const bedY = (yy * F) / (cp * F + yy * sp);
        const off = k % 2 ? step / 2 : 0;
        for (let x = x0 + off; x <= x1; x += step) {
          add(x + (rand() - 0.5) * step * 0.5, bedY + (rand() - 0.5) * 1.5);
        }
      }
    } else {
      let row = 0;
      for (let y = y0; y <= y1; y += down) {
        const off = row % 2 ? across / 2 : 0;
        row += 1;
        for (let x = x0 + off; x <= x1; x += across) {
          add(
            x + (rand() - 0.5) * across * 0.4,
            y + (rand() - 0.5) * down * 0.22,
          );
        }
      }
    }
    const n = xs.length;
    const lists: Int32Array[] = [];
    for (let b = 0; b < LEVELS + 2; b += 1) lists.push(new Int32Array(n));
    const lit = new Float32Array(n);
    lit.fill(-1e9);
    cloud = {
      n,
      X: Float32Array.from(xs),
      Y: Float32Array.from(ys),
      Z: Float32Array.from(zs),
      NX: Float32Array.from(nxs),
      NY: Float32Array.from(nys),
      NZ: Float32Array.from(nzs),
      shade: new Float32Array(n),
      lit,
      px: new Float32Array(n),
      py: new Float32Array(n),
      ps: new Float32Array(n),
      vy: new Float32Array(n),
      lists,
      counts: new Int32Array(LEVELS + 2),
      dot: clamp(across * 0.36, 1.1, 2),
    };
  };

  /** The dark bed with its vignette and the beam's light profile, built once per size and look. */
  const layers = () => {
    const c = cfg;
    const { w, h, dpr } = size;
    if (!c || w < 1) return;
    bedLayer.width = Math.round(w * dpr);
    bedLayer.height = Math.round(h * dpr);
    const bctx = bedLayer.getContext("2d");
    if (bctx) {
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.fillStyle = css(paint.bed);
      bctx.fillRect(0, 0, w, h);
      const lift = mixRgb(paint.bed, paint.beam, 0.07);
      const pool = bctx.createRadialGradient(
        w * 0.5,
        h * 0.62,
        0,
        w * 0.5,
        h * 0.62,
        Math.max(w, h) * 0.62,
      );
      pool.addColorStop(0, css(lift, 0.9));
      pool.addColorStop(1, css(lift, 0));
      bctx.fillStyle = pool;
      bctx.fillRect(0, 0, w, h);
      const far = bctx.createLinearGradient(0, 0, 0, h);
      far.addColorStop(0, "rgba(0, 0, 0, 0.32)");
      far.addColorStop(0.45, "rgba(0, 0, 0, 0)");
      bctx.fillStyle = far;
      bctx.fillRect(0, 0, w, h);
    }
    // The beam's profile down the screen: a faint read-wash above, a crisp
    // core, a bloom below. One column wide; drawn stretched across.
    const g = clamp(c.glow, 0, 1);
    const wash = Math.round(18 + 46 * g);
    const bloom = Math.round(5 + 22 * g);
    beamAbove = wash;
    const tall = wash + bloom + 2;
    beamSprite.width = 1;
    beamSprite.height = Math.round(tall * dpr);
    const sctx = beamSprite.getContext("2d");
    if (sctx) {
      const img = sctx.createImageData(1, beamSprite.height);
      const core = mixRgb(paint.beam, [255, 255, 255], 0.45);
      for (let i = 0; i < beamSprite.height; i += 1) {
        const y = i / dpr - wash;
        let a: number;
        let rgb: Rgb = paint.beam;
        if (y < -0.75) {
          const t = (y + wash) / wash;
          a =
            (0.04 + 0.12 * g) * t * t +
            0.5 * Math.exp(-((y / (2 + 3 * g)) ** 2));
        } else if (y <= 0.75) {
          a = 1;
          rgb = core;
        } else {
          a = (0.25 + 0.45 * g) * Math.exp(-((y / (bloom * 0.45)) ** 2));
        }
        const o = i * 4;
        img.data[o] = rgb[0];
        img.data[o + 1] = rgb[1];
        img.data[o + 2] = rgb[2];
        img.data[o + 3] = Math.round(clamp(a, 0, 1) * 255);
      }
      sctx.putImageData(img, 0, 0);
    }
  };

  const view = {
    cy: 1,
    sy: 0,
    cp: Math.cos(REST_PITCH),
    sp: Math.sin(REST_PITCH),
  };

  const setView = () => {
    view.cy = Math.cos(sim.yaw + sim.sway);
    view.sy = Math.sin(sim.yaw + sim.sway);
    view.cp = Math.cos(sim.pitch);
    view.sp = Math.sin(sim.pitch);
  };

  /**
   * Every point through the current view. The light is the room's, fixed
   * while the bed turns under it, so the shading changes with the tilt; a
   * point on a slope facing away from the eye is hidden (shade 0).
   */
  const project = () => {
    const cl = cloud;
    if (!cl) return;
    const { w, h, F } = size;
    const { cy, sy, cp, sp } = view;
    const cx0 = w / 2;
    const cy0 = h / 2;
    for (let i = 0; i < cl.n; i += 1) {
      const X = cl.X[i] ?? 0;
      const Y = cl.Y[i] ?? 0;
      const Z = cl.Z[i] ?? 0;
      const x1 = X * cy - Y * sy;
      const y1 = X * sy + Y * cy;
      const depth = y1 * sp + Z * cp;
      const s = F / (F - depth);
      cl.px[i] = cx0 + x1 * s;
      cl.py[i] = cy0 + (y1 * cp - Z * sp) * s;
      cl.ps[i] = s;
      cl.vy[i] = y1;
      const nx = cl.NX[i] ?? 0;
      const ny = cl.NY[i] ?? 0;
      const nz = cl.NZ[i] ?? 1;
      const n1x = nx * cy - ny * sy;
      const n1y = nx * sy + ny * cy;
      const facing = n1y * sp + nz * cp;
      const lambert = n1x * LIGHT_X + n1y * LIGHT_Y + nz * LIGHT_Z;
      cl.shade[i] = facing > 0.03 ? 0.34 + 0.66 * clamp(lambert, 0, 1) : 0;
    }
  };

  /**
   * Where the light sheet stands across the bed when it meets the bed on
   * screen row y: the inverse of the projection at height 0.
   */
  const sheetAt = (y: number) => {
    const { h, F } = size;
    const yy = y - h / 2;
    return (yy * F) / (view.cp * F + yy * view.sp);
  };

  /** A point of the bed plane, projected, as a move or a line. */
  const plane = (X: number, Y: number, move: boolean) => {
    if (!ctx) return;
    const { w, h, F } = size;
    const { cy, sy, cp, sp } = view;
    const x1 = X * cy - Y * sy;
    const y1 = X * sy + Y * cy;
    const s = F / (F - y1 * sp);
    const x = w / 2 + x1 * s;
    const y = h / 2 + y1 * cp * s;
    if (move) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  };

  const gridLines = (alphaCss: string) => {
    if (!ctx) return;
    const cell = GRID_CELL;
    const E = Math.ceil(Math.hypot(size.w, size.h) / cell) * cell;
    ctx.beginPath();
    for (let k = -E; k <= E; k += cell) {
      plane(k, -E, true);
      plane(k, E, false);
      plane(-E, k, true);
      plane(E, k, false);
    }
    ctx.strokeStyle = alphaCss;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  const draw = () => {
    const c = cfg;
    const cl = cloud;
    if (!ctx || !c || !cl || !visible.current || size.w < 1) return;
    const { w, h, dpr } = size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(bedLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduced = !c.motionSafe;
    const beamY = reduced ? h * 0.62 : sim.beam;
    const g = clamp(c.glow, 0, 1);
    const pass = PASS / clamp(c.speed, 0.1, 3);
    const beamOn = reduced
      ? 1
      : clamp(Math.min(sim.phase / 0.15, (pass - sim.phase) / 0.25), 0, 1);

    if (c.grid) {
      gridLines(paint.gridCss);
      if (beamOn > 0.02) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, beamY - 2, w, 4 + 6 * g);
        ctx.clip();
        ctx.globalAlpha = beamOn;
        gridLines(paint.glintCss);
        ctx.restore();
      }
    }

    // Read points, bucketed by brightness so each level is one fill colour.
    const sheet = sheetAt(beamY);
    const counts = cl.counts;
    counts.fill(0);
    const tau = Math.max(0.1, c.afterglow / 1000 / 1.6);
    for (let i = 0; i < cl.n; i += 1) {
      const y = cl.py[i] ?? 0;
      const shade = cl.shade[i] ?? 0;
      if (shade <= 0 || y < -4 || y > h + 4) continue;
      const s = cl.ps[i] ?? 1;
      const near = clamp(0.55 + (s - 0.9) * 1.6, 0.4, 1);
      let bucket = -1;
      if (reduced) {
        if (Math.abs((cl.vy[i] ?? 0) - sheet) < cl.dot * 0.9) {
          bucket = LEVELS + 1;
        } else {
          const level = 0.5 * shade * near;
          bucket = Math.min(LEVELS - 1, Math.floor(level * LEVELS));
        }
      } else {
        const age = sim.t - (cl.lit[i] ?? -1e9);
        if (age < 0 || age > tau * 5) continue;
        if (age < HOT * 0.5) bucket = LEVELS + 1;
        else if (age < HOT) bucket = LEVELS;
        else {
          const level = Math.exp(-(age - HOT) / tau) * shade * near;
          if (level < 0.03) continue;
          bucket = Math.min(LEVELS - 1, Math.floor(level * LEVELS));
        }
      }
      const list = cl.lists[bucket];
      if (!list) continue;
      const at = counts[bucket] ?? 0;
      list[at] = i;
      counts[bucket] = at + 1;
    }
    ctx.globalCompositeOperation = "lighter";
    for (let b = 0; b < LEVELS + 2; b += 1) {
      const count = counts[b] ?? 0;
      const list = cl.lists[b];
      if (!count || !list) continue;
      const hot = b >= LEVELS;
      ctx.fillStyle = hot ? paint.hotCss : paint.pointCss;
      ctx.globalAlpha = hot
        ? b === LEVELS + 1
          ? 1
          : 0.8
        : (0.45 + 0.55 * g) * ((b + 1) / LEVELS);
      const grow = hot ? 1.35 : 1;
      for (let k = 0; k < count; k += 1) {
        const i = list[k] ?? 0;
        const d = cl.dot * (cl.ps[i] ?? 1) * grow;
        ctx.fillRect((cl.px[i] ?? 0) - d / 2, (cl.py[i] ?? 0) - d / 2, d, d);
      }
    }

    // The beam itself, flaring on a restart.
    if (beamOn > 0.01) {
      ctx.globalAlpha = clamp(
        beamOn * (0.75 + 0.25 * g + sim.flare * 0.5),
        0,
        1,
      );
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        beamSprite,
        0,
        0,
        1,
        beamSprite.height,
        0,
        beamY - beamAbove,
        w,
        beamSprite.height / dpr,
      );
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances the beam, the afterglow clock and the tilt. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    const cl = cloud;
    if (!c || !cl) return false;
    const { w, h } = size;
    let moving = false;
    // The tilt: toward the hand, or home with a slow idle turn.
    const range = clamp(c.tilt, 0, 45);
    let yawTo = 0;
    let pitchTo = REST_PITCH;
    if (hand.present && c.interactive) {
      yawTo = deg(((hand.x / Math.max(1, w)) * 2 - 1) * range * 1.2);
      pitchTo =
        REST_PITCH - deg(((hand.y / Math.max(1, h)) * 2 - 1) * range * 0.6);
    }
    const running = !c.paused;
    if (running) {
      sim.sway = deg(3) * Math.sin(sim.t * ((Math.PI * 2) / 18));
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const sub = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      sim.yawV +=
        ((GLIDE.stiffness * (yawTo - sim.yaw) - GLIDE.damping * sim.yawV) /
          GLIDE.mass) *
        sub;
      sim.yaw += sim.yawV * sub;
      sim.pitchV +=
        ((GLIDE.stiffness * (pitchTo - sim.pitch) -
          GLIDE.damping * sim.pitchV) /
          GLIDE.mass) *
        sub;
      sim.pitch += sim.pitchV * sub;
      sim.flareV +=
        ((-FLICK.stiffness * sim.flare - FLICK.damping * sim.flareV) /
          FLICK.mass) *
        sub;
      sim.flare += sim.flareV * sub;
    }
    const tilting =
      Math.abs(yawTo - sim.yaw) + Math.abs(pitchTo - sim.pitch) > 1e-4 ||
      Math.abs(sim.yawV) + Math.abs(sim.pitchV) > 1e-3;
    if (!tilting) {
      sim.yaw = yawTo;
      sim.pitch = pitchTo;
      sim.yawV = 0;
      sim.pitchV = 0;
    } else moving = true;
    if (Math.abs(sim.flare) + Math.abs(sim.flareV) > 1e-3) moving = true;
    else {
      sim.flare = 0;
      sim.flareV = 0;
    }
    setView();
    project();
    if (running) {
      moving = true;
      sim.t += dt;
      const pass = PASS / clamp(c.speed, 0.1, 3);
      const gap = REST_GAP / clamp(c.speed, 0.1, 3);
      const from = sim.beam;
      sim.phase += dt;
      if (sim.phase >= pass + gap) {
        sim.phase = 0;
        sim.beam = -BEAM_PAD;
        return moving;
      }
      if (sim.phase <= pass) {
        sim.beam = -BEAM_PAD + (sim.phase / pass) * (h + BEAM_PAD * 2);
        // The light is a sheet standing on the bed, swept toward the eye:
        // every point the sheet passed this frame is read now. A raised
        // point is met further forward than the bed behind it, so on screen
        // the read line bows up over every rise.
        const a = sheetAt(from);
        const b = sheetAt(sim.beam);
        for (let i = 0; i < cl.n; i += 1) {
          const v = cl.vy[i] ?? 0;
          if (v > a && v <= b && (cl.shade[i] ?? 0) > 0) cl.lit[i] = sim.t;
        }
      } else if (from <= h + BEAM_PAD && sim.phase - dt <= pass) {
        sim.beam = h + BEAM_PAD * 2;
        sim.passes += 1;
        c.onPass(sim.passes);
      }
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    if (cfg.motionSafe) moving = step(dt);
    else {
      setView();
      project();
    }
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !cloud)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const get = (i: number): Rgb | null => {
      const el = kids[i];
      return el ? read(getComputedStyle(el).color) : null;
    };
    paint.bed = get(0) ?? paint.bed;
    paint.beam = get(1) ?? paint.beam;
    paint.point = get(2) ?? paint.point;
    paint.pointCss = css(paint.point);
    paint.hotCss = css(mixRgb(paint.beam, [255, 255, 255], 0.55));
    paint.gridCss = css(paint.beam, 0.09);
    paint.glintCss = css(mixRgb(paint.beam, [255, 255, 255], 0.3), 0.75);
    layers();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    if (size.w === w && size.h === h && size.dpr === dpr && cloud) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    size.F = 2.4 * Math.max(w, h);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    sample();
    layers();
    setView();
    project();
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
        resize();
        next.onPass(sim.passes);
        return;
      }
      if (
        was.subject !== next.subject ||
        was.density !== next.density ||
        was.seed !== next.seed
      ) {
        sample();
      }
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (was.paintKey !== next.paintKey) readColours();
      else if (was.glow !== next.glow) layers();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) {
        // The still reconstruction sits square to the view, or exactly where
        // the hand holds it.
        sim.sway = 0;
        if (!hand.present) {
          sim.yaw = 0;
          sim.pitch = REST_PITCH;
        }
        sim.yawV = 0;
        sim.pitchV = 0;
      }
      setView();
      project();
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
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (cfg && !cfg.motionSafe) {
        // Reduced motion: the tilt is applied exactly, with no easing.
        const range = clamp(cfg.tilt, 0, 45);
        sim.yaw = deg(((x / Math.max(1, size.w)) * 2 - 1) * range * 1.2);
        sim.pitch =
          REST_PITCH - deg(((y / Math.max(1, size.h)) * 2 - 1) * range * 0.6);
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) {
        sim.yaw = 0;
        sim.pitch = REST_PITCH;
      }
      kick();
    },
    readFrom(y) {
      const c = cfg;
      if (!c || !c.motionSafe || c.paused) return;
      const pass = PASS / clamp(c.speed, 0.1, 3);
      const span = size.h + BEAM_PAD * 2;
      sim.phase = clamp(((y + BEAM_PAD) / Math.max(1, span)) * pass, 0, pass);
      sim.beam = y;
      sim.flareV += 100;
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
 * A background that is a scanner bed seen at a low angle: a dark surface
 * ruled with a perspective grid, an object resting on it, and the content on
 * top in its own layer. The object — a pebble, wind ridges or a crater — is a
 * point cloud you cannot see until it is read. A bright beam sweeps down the
 * box line by line; every point it crosses flares white-hot, cools to the
 * point colour and fades over the afterglow, so the beam draws the classic
 * structured-light contour bowing up over every rise, and behind it the
 * relief hangs for a moment before going dark again.
 *
 * The pointer tilts the bed — across turns it, up and down changes the view —
 * on the glide spring, so the relief swings under the hand and the contour
 * bends with it; a press restarts the pass from the pressed row with a flare
 * on the flick spring. Keyboard focus on a control inside does the same from
 * that control. Canvas 2D, a few batched fills a frame, only on screen in a
 * visible page. Under reduced motion the whole reconstruction stands still
 * with the beam parked, and the tilt follows the pointer exactly.
 */
export function ScanBed({
  children,
  speed = 1,
  density = 0.6,
  glow = 0.6,
  subject = "stone",
  afterglow = 1400,
  tilt = 14,
  grid = true,
  beamColor = BEAM,
  pointColor = POINT,
  bedColor = BED,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onPass,
  onActiveChange,
  className,
}: ScanBedProps) {
  const motionSafe = useMotionSafe();
  const paints = [bedColor, beamColor, pointColor] as const;
  const paintKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reports = React.useRef({ onPass, onActiveChange });

  const config: Config = {
    speed,
    density,
    glow,
    subject,
    afterglow,
    tilt,
    grid,
    paintKey,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onPass: (n) => reports.current.onPass?.(n),
    onActive: (a) => reports.current.onActiveChange?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reports.current = { onPass, onActiveChange };
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
    if (!hit || !rootRef.current?.contains(hit)) engine.current?.readFrom(at.y);
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
    engine.current?.readFrom(at.y);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

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
        // A horizontal drag tilts the bed on touch; a vertical one scrolls.
        "group/scan-bed relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/scan-bed:opacity-0"
        style={standIn(bedColor, beamColor)}
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
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * dark bed, a faint ruled grid receding upward, and the beam parked across it.
 */
function standIn(bed: string, beam: string): React.CSSProperties {
  const line = `color-mix(in oklab, ${beam} 10%, transparent)`;
  return {
    backgroundColor: bed,
    backgroundImage: [
      `linear-gradient(180deg, transparent 61%, color-mix(in oklab, ${beam} 85%, white) 61.5%, color-mix(in oklab, ${beam} 30%, transparent) 63%, transparent 70%)`,
      `linear-gradient(180deg, color-mix(in oklab, black 30%, transparent), transparent 45%)`,
      `repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px 22px)`,
      `repeating-linear-gradient(180deg, ${line} 0 1px, transparent 1px 13px)`,
    ].join(", "),
  };
}
