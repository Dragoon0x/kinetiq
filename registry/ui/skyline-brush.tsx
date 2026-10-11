"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type SkylineBrushDistrict = {
  /** Stable id; the value is a district's id. */
  id: string;
  /** Written on the ground and announced. */
  name: string;
  /** How tall the district builds, 0 to 1. @default seeded, 0.6 to 1 */
  height?: number;
};

export type SkylineBrushProps = {
  /** The districts the plan is divided into, 2 to 8. @default defaultSkylineBrushDistricts */
  districts?: readonly SkylineBrushDistrict[];
  /** The tallest a tower can rise, in floors, 8 to 60. A change replays the preview stroke. @default 36 */
  maxHeight?: number;
  /** How far the brush's raise reaches, 0 (a fine pen: only the blocks under it) to 1 (a broad swell). @default 0.45 */
  falloff?: number;
  /** The share of windows lit, 0 (dark glass) to 1 (every window). @default 0.6 */
  lights?: number;
  /** Controlled: the pinned district's id, or null. A pinned district stays raised. */
  value?: string | null;
  /** The district pinned at first, when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the tap or key that pinned or cleared a district. */
  onValueChange?: (id: string | null) => void;
  /** The brush's reach on screen, px. @default 48 */
  radius?: number;
  /** ms a brushed tower stands before it starts to sink. @default 1100 */
  hold?: number;
  /** ms a tower takes to sink back to its footprint. @default 2600 */
  sinkDuration?: number;
  /** How long the low sun's shadows run, 0 (none) to 2. @default 1.2 */
  shadow?: number;
  /** On first view, one stroke raises a band across the plan and lets it sink. @default true */
  intro?: boolean;
  /** The ground, any CSS colour. @default a paper (light) or night (dark) tint of the accent token */
  groundColor?: string;
  /** The towers' facades, any CSS colour. @default a pale (light) or slate (dark) tint of the accent token */
  buildingColor?: string;
  /** Lit windows, any CSS colour. @default a warm pigment from the warn token */
  windowColor?: string;
  /** Seeds the plan: streets, plots, parks, the river and every window. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The plan's accessible name. @default "City plan" */
  label?: string;
  /** No brushing, taps or keys. @default false */
  disabled?: boolean;
  /** Sizes the plan; it fills its parent by default. */
  className?: string;
};

/** Five districts of an invented city. */
export const defaultSkylineBrushDistricts: readonly SkylineBrushDistrict[] = [
  { id: "waylight", name: "Waylight Quarter" },
  { id: "basin", name: "Basin Docks" },
  { id: "fernworks", name: "Fernworks Yards" },
  { id: "coldbrook", name: "Coldbrook Hill" },
  { id: "gauge", name: "Gauge Market" },
];

/* The view: a plan turned a little and seen from 45° above. */
const YAW = (-22 * Math.PI) / 180;
const PITCH = (45 * Math.PI) / 180;
const CY = Math.cos(YAW);
const SY = Math.sin(YAW);
const SA = Math.sin(PITCH);
const CA = Math.cos(PITCH);
/** Plan units per floor. */
const FLOOR = 3.2;
const BASE = 0.3 * FLOOR;
const STREET = 14;
const AVENUE = 22;
/** The low sun, pointing from the ground toward it (east and toward us). */
const SUN = { x: 0.74, y: 0.67 };
const MAX_PLOTS = 520;

const DEFAULT_GROUND =
  "light-dark(oklch(from var(--accent) 0.955 0.008 h), oklch(from var(--accent) 0.19 0.02 h))";
const DEFAULT_BUILDING =
  "light-dark(oklch(from var(--accent) 0.84 0.02 h), oklch(from var(--accent) 0.36 0.03 h))";
const DEFAULT_WINDOW = "oklch(from var(--warn) 0.87 0.13 calc(h - 4))";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Any CSS colour as an rgba() string the canvas can use, by painting one pixel. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): string => {
    if (!ctx) return "rgba(128, 128, 128, 1)";
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0}, ${Math.round(((d[3] ?? 255) / 255) * 100) / 100})`;
  };
}

type Rect = { x: number; y: number; w: number; d: number };
type Plot = Rect & {
  district: number;
  share: number;
  key: number;
  depth: number;
};
type Park = Rect & { district: number };
type Region = Rect & { name: string; id: string };

type Plan = {
  width: number;
  depth: number;
  blocks: (Rect & { district: number })[];
  parks: Park[];
  plots: Plot[];
  regions: Region[];
  river: [number, number][];
  riverWidth: number;
};

export type SkylineBrushShape = "wide" | "square" | "tall";

const DIMS: Record<SkylineBrushShape, [number, number]> = {
  wide: [1000, 560],
  square: [840, 700],
  tall: [600, 900],
};

/**
 * The seeded city: a street grid of superblocks (an avenue every third
 * street), districts as a guillotine split of that grid, a river cutting one
 * corner, a few parks, and every other block cut into two to four plots.
 */
function planFor(
  shape: SkylineBrushShape,
  seed: number,
  districts: readonly SkylineBrushDistrict[],
): Plan {
  const [W, D] = DIMS[shape];
  const s = Math.round(seed);
  const cols: [number, number][] = [];
  let x = 12;
  for (let i = 0; x < W - 60; i += 1) {
    const w = Math.min(W - 12 - x, 82 + 56 * hash(s, i, 1));
    cols.push([x, w]);
    x += w + (i % 3 === 2 ? AVENUE : STREET);
  }
  const rows: [number, number][] = [];
  let y = 12;
  for (let j = 0; y < D - 50; j += 1) {
    const d = Math.min(D - 12 - y, 70 + 46 * hash(s, j, 2));
    rows.push([y, d]);
    y += d + (j % 3 === 1 ? AVENUE : STREET);
  }
  // Districts: keep splitting the biggest region of cells along its longer side.
  type Cells = { c0: number; c1: number; r0: number; r1: number };
  const n = clamp(districts.length, 1, 8);
  let regions: Cells[] = [{ c0: 0, c1: cols.length, r0: 0, r1: rows.length }];
  for (let k = 0; regions.length < n && k < 20; k += 1) {
    regions.sort(
      (a, b) => (b.c1 - b.c0) * (b.r1 - b.r0) - (a.c1 - a.c0) * (a.r1 - a.r0),
    );
    const big = regions[0];
    if (!big) break;
    const wc = big.c1 - big.c0;
    const hr = big.r1 - big.r0;
    if (wc < 2 && hr < 2) break;
    const cut = 0.38 + 0.24 * hash(s, k, 3);
    if (wc >= hr) {
      const at = big.c0 + clamp(Math.round(wc * cut), 1, wc - 1);
      regions = [{ ...big, c1: at }, { ...big, c0: at }, ...regions.slice(1)];
    } else {
      const at = big.r0 + clamp(Math.round(hr * cut), 1, hr - 1);
      regions = [{ ...big, r1: at }, { ...big, r0: at }, ...regions.slice(1)];
    }
  }
  // A stable order: by the region's first row, then column.
  regions.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
  const districtOf = (ci: number, ri: number) =>
    Math.max(
      0,
      regions.findIndex(
        (g) => ci >= g.c0 && ci < g.c1 && ri >= g.r0 && ri < g.r1,
      ),
    );
  // The river: a soft curve across one corner.
  const river: [number, number][] = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    const a: [number, number] = [-30, D * 0.58];
    const c: [number, number] = [W * 0.34, D * 0.72];
    const b: [number, number] = [W * 0.5, D + 30];
    river.push([
      (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
      (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
    ]);
  }
  const riverWidth = 34;
  const nearRiver = (px: number, py: number, pad: number) => {
    for (let i = 0; i < river.length - 1; i += 1) {
      const p = river[i];
      const q = river[i + 1];
      if (!p || !q) continue;
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const t = clamp(
        ((px - p[0]) * dx + (py - p[1]) * dy) / (dx * dx + dy * dy),
        0,
        1,
      );
      if (
        Math.hypot(px - p[0] - t * dx, py - p[1] - t * dy) <
        riverWidth / 2 + pad
      )
        return true;
    }
    return false;
  };
  const heights = districts.map(
    (dd, i) => dd.height ?? 0.6 + 0.4 * hash(s, i, 4),
  );
  const blocks: Plan["blocks"] = [];
  const parks: Park[] = [];
  const plots: Plot[] = [];
  cols.forEach(([bx, bw], ci) => {
    rows.forEach(([by, bd], ri) => {
      const district = districtOf(ci, ri);
      const cx = bx + bw / 2;
      const cy = by + bd / 2;
      if (nearRiver(cx, cy, Math.min(bw, bd) * 0.25)) return;
      blocks.push({ x: bx, y: by, w: bw, d: bd, district });
      if (hash(s, ci * 31 + ri, 5) < 0.09) {
        parks.push({ x: bx + 3, y: by + 3, w: bw - 6, d: bd - 6, district });
        return;
      }
      // Two to four plots, split along the block's longer side.
      const parts = 2 + Math.floor(hash(s, ci * 31 + ri, 6) * 3);
      const along = bw >= bd;
      const span = along ? bw : bd;
      const cuts: number[] = [0];
      for (let k = 1; k < parts; k += 1) {
        cuts.push(
          (span * (k + (hash(s, ci * 31 + ri, 7 + k) - 0.5) * 0.5)) / parts,
        );
      }
      cuts.push(span);
      for (let k = 0; k < parts; k += 1) {
        const a = (cuts[k] ?? 0) + (k === 0 ? 3 : 2.5);
        const b = (cuts[k + 1] ?? span) - (k === parts - 1 ? 3 : 2.5);
        if (b - a < 8) continue;
        const rect: Rect = along
          ? { x: bx + a, y: by + 3, w: b - a, d: bd - 6 }
          : { x: bx + 3, y: by + a, w: bw - 6, d: b - a };
        if (plots.length >= MAX_PLOTS) continue;
        const key = plots.length;
        const share =
          (0.28 + 0.72 * Math.pow(hash(s, key, 8), 1.6)) *
          (heights[district] ?? 0.8);
        plots.push({
          ...rect,
          district,
          share,
          key,
          // How far toward us the plot stands: drawn far to near.
          depth: SY * (rect.x + rect.w / 2) + CY * (rect.y + rect.d / 2),
        });
      }
    });
  });
  const out: Region[] = regions.map((g, i) => {
    const c0 = cols[g.c0]?.[0] ?? 0;
    const last = cols[g.c1 - 1];
    const c1 = last ? last[0] + last[1] : W;
    const r0 = rows[g.r0]?.[0] ?? 0;
    const lastRow = rows[g.r1 - 1];
    const r1 = lastRow ? lastRow[0] + lastRow[1] : D;
    const dd = districts[i];
    return {
      x: c0,
      y: r0,
      w: c1 - c0,
      d: r1 - r0,
      name: dd?.name ?? `District ${i + 1}`,
      id: dd?.id ?? `d${i + 1}`,
    };
  });
  return {
    width: W,
    depth: D,
    blocks,
    parks,
    plots,
    regions: out,
    river,
    riverWidth,
  };
}

const shapeOf = (w: number, h: number): SkylineBrushShape => {
  const a = w / Math.max(1, h);
  return a >= 1.1 ? "wide" : a >= 0.75 ? "square" : "tall";
};

/** Plan (x, y) to the view's unscaled screen, before fitting. */
const viewX = (x: number, y: number) => CY * x - SY * y;
const viewY = (x: number, y: number) => (SY * x + CY * y) * SA;

type Fit = { s: number; zs: number; ox: number; oy: number };

/** Fits the plan to the box with headroom above it for the towers. */
function fitFor(plan: Plan, w: number, h: number, maxFloors: number): Fit {
  const corners = [
    [0, 0],
    [plan.width, 0],
    [0, plan.depth],
    [plan.width, plan.depth],
  ];
  const xs = corners.map(([x, y]) => viewX(x ?? 0, y ?? 0));
  const ys = corners.map(([x, y]) => viewY(x ?? 0, y ?? 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const m = Math.max(10, Math.min(w, h) * 0.04);
  const s = Math.min(
    (w - 2 * m) / (maxX - minX),
    ((h - 2 * m) * 0.68) / (maxY - minY),
  );
  const planH = (maxY - minY) * s;
  const room = h - 2 * m - planH;
  // Room for most towers: only the very tallest of a broad stroke may touch the top.
  const tallest = maxFloors * FLOOR * CA * 0.82;
  // Towers keep true scale where there is room and are exaggerated up to 3×
  // in narrow boxes, where the plan is small and the sky is tall.
  const zs = clamp(room / Math.max(1, tallest), s * 0.6, s * 3);
  return {
    s,
    zs,
    ox: (w - (maxX - minX) * s) / 2 - minX * s,
    oy: h - m - maxY * s,
  };
}

type Config = {
  plan: Plan;
  maxHeight: number;
  falloff: number;
  lights: number;
  radius: number;
  hold: number;
  sinkDuration: number;
  shadow: number;
  intro: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
  raised: number[];
  outlined: number;
};

type Engine = {
  configure: (cfg: Config) => void;
  brush: (clientX: number, clientY: number) => void;
  lift: () => void;
  /** The district under a client point, or −1. */
  districtAt: (clientX: number, clientY: number) => number;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  dispose: () => void;
};

const COLOURS = 14;

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  const ground = document.createElement("canvas");
  const gctx = ground.getContext("2d");
  const read = colourReader();
  // ground, street, block, park, tree, water, facade, facade shade, roof,
  // window lit, window dark, shadow, accent, label
  const colours: string[] = Array.from({ length: COLOURS }, () => "gray");
  let font = "ui-sans-serif, system-ui, sans-serif";
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let ratio = 1;
  let w = 1;
  let h = 1;
  let fit: Fit = { s: 1, zs: 1, ox: 0, oy: 0 };
  let groundKey = "";
  // Per plot: shown height and its velocity (plan units), the brush's peak and when it last touched.
  const z = new Float32Array(MAX_PLOTS);
  const zv = new Float32Array(MAX_PLOTS);
  const peak = new Float32Array(MAX_PLOTS);
  const touched = new Float64Array(MAX_PLOTS);
  const order: number[] = [];
  let clock = 0;
  let brushAt: { x: number; y: number } | null = null;
  let lastBrush: { x: number; y: number } | null = null;
  let introAt = -1;
  let introDone = false;
  let previewKey = "";

  const sx = (x: number, y: number) => fit.ox + viewX(x, y) * fit.s;
  const sy = (x: number, y: number, up = 0) =>
    fit.oy + viewY(x, y) * fit.s - up * CA * fit.zs;

  /** Maps plan units to the screen for drawing flat on the ground. */
  const groundTransform = (c: CanvasRenderingContext2D) => {
    c.setTransform(
      CY * fit.s * ratio,
      SY * SA * fit.s * ratio,
      -SY * fit.s * ratio,
      CY * SA * fit.s * ratio,
      fit.ox * ratio,
      fit.oy * ratio,
    );
  };

  const toPlan = (clientX: number, clientY: number) => {
    const r = root.getBoundingClientRect();
    const u = (clientX - r.left - fit.ox) / fit.s;
    const q = (clientY - r.top - fit.oy) / fit.s / SA;
    return { x: CY * u + SY * q, y: -SY * u + CY * q };
  };

  const paintGround = () => {
    const c = cfg;
    if (!c || !gctx || ground.width < 2) return;
    const plan = c.plan;
    const [bg, street, block, park, tree, water, , , roof, , , , , labelCol] =
      colours;
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.fillStyle = bg ?? "white";
    gctx.fillRect(0, 0, ground.width, ground.height);
    groundTransform(gctx);
    gctx.fillStyle = street ?? "gray";
    gctx.fillRect(0, 0, plan.width, plan.depth);
    gctx.fillStyle = block ?? "white";
    for (const b of plan.blocks) gctx.fillRect(b.x, b.y, b.w, b.d);
    // The river, with a paler line along each bank.
    gctx.lineJoin = "round";
    gctx.lineCap = "round";
    gctx.beginPath();
    plan.river.forEach(([x, y], i) =>
      i === 0 ? gctx.moveTo(x, y) : gctx.lineTo(x, y),
    );
    gctx.strokeStyle = block ?? "white";
    gctx.lineWidth = plan.riverWidth + 8;
    gctx.stroke();
    gctx.strokeStyle = water ?? "blue";
    gctx.lineWidth = plan.riverWidth;
    gctx.stroke();
    // Parks: lawn and a scatter of trees.
    const s = Math.round(c.seed);
    for (const p of plan.parks) {
      gctx.fillStyle = park ?? "green";
      gctx.fillRect(p.x, p.y, p.w, p.d);
      gctx.fillStyle = tree ?? "green";
      const count = Math.round((p.w * p.d) / 260);
      gctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const tx = p.x + 4 + hash(s, Math.round(p.x) * 7 + i, 21) * (p.w - 8);
        const ty = p.y + 4 + hash(s, Math.round(p.y) * 7 + i, 22) * (p.d - 8);
        const tr = 2.6 + hash(s, i, 23) * 2.2;
        gctx.moveTo(tx + tr, ty);
        gctx.arc(tx, ty, tr, 0, Math.PI * 2);
      }
      gctx.fill();
    }
    // Every plot at rest: a footprint with a thin plinth.
    gctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    for (const p of plan.plots) box(gctx, p, BASE, false, roof ?? "white");
    // District names, lying on the ground in its own perspective, over the plinths.
    groundTransform(gctx);
    const size = 15;
    if (size * fit.s >= 6) {
      gctx.font = `600 ${size}px ${font}`;
      gctx.textAlign = "center";
      gctx.textBaseline = "middle";
      gctx.lineJoin = "round";
      for (const g of plan.regions) {
        const text = g.name
          .toUpperCase()
          .split("")
          .join(String.fromCharCode(8202));
        // A halo of the block's colour keeps the name legible over plinths.
        gctx.lineWidth = 4;
        gctx.strokeStyle = block ?? "white";
        gctx.strokeText(text, g.x + g.w / 2, g.y + g.d / 2, g.w - 12);
        gctx.fillStyle = labelCol ?? "gray";
        gctx.fillText(text, g.x + g.w / 2, g.y + g.d / 2, g.w - 12);
      }
    }
  };

  /** One tower (or plinth): its two faces toward us, windows, and its roof. */
  const box = (
    c: CanvasRenderingContext2D,
    p: Plot,
    height: number,
    windows: boolean,
    roofCol: string,
  ) => {
    const [, , , , , , facade, shade, , lit, dark] = colours;
    const x0 = p.x;
    const x1 = p.x + p.w;
    const y0 = p.y;
    const y1 = p.y + p.d;
    // The south face (toward us) and the west face, each a parallelogram.
    c.fillStyle = facade ?? "white";
    c.beginPath();
    c.moveTo(sx(x0, y1), sy(x0, y1));
    c.lineTo(sx(x1, y1), sy(x1, y1));
    c.lineTo(sx(x1, y1), sy(x1, y1, height));
    c.lineTo(sx(x0, y1), sy(x0, y1, height));
    c.closePath();
    c.fill();
    c.fillStyle = shade ?? "gray";
    c.beginPath();
    c.moveTo(sx(x0, y0), sy(x0, y0));
    c.lineTo(sx(x0, y1), sy(x0, y1));
    c.lineTo(sx(x0, y1), sy(x0, y1, height));
    c.lineTo(sx(x0, y0), sy(x0, y0, height));
    c.closePath();
    c.fill();
    if (windows && height > FLOOR * 1.5 && cfg) {
      const floors = Math.floor(height / FLOOR);
      const share = clamp(cfg.lights, 0, 1);
      const s = Math.round(cfg.seed);
      // Each face is an affine map from (along, up) in plan units to the screen.
      const faces: [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ][] = [
        // south: along +x from (x0, y1)
        [
          CY * fit.s,
          SY * SA * fit.s,
          0,
          -CA * fit.zs,
          sx(x0, y1),
          sy(x0, y1),
          p.w,
          0,
        ],
        // west: along −y from (x0, y1)
        [
          SY * fit.s,
          -CY * SA * fit.s,
          0,
          -CA * fit.zs,
          sx(x0, y1),
          sy(x0, y1),
          p.d,
          1,
        ],
      ];
      for (const [a, b, cc, d, e, f, span, face] of faces) {
        const cols = Math.max(1, Math.floor((span - 2) / 6));
        const pitch = span / cols;
        // A window narrower than a pixel is drawn as the facade's tone instead.
        if (pitch * Math.hypot(a, b) < 2.2) continue;
        c.setTransform(
          a * ratio,
          b * ratio,
          cc * ratio,
          d * ratio,
          e * ratio,
          f * ratio,
        );
        for (let fl = 0; fl < floors; fl += 1) {
          for (let k = 0; k < cols; k += 1) {
            const on =
              hash(s * 977 + p.key, face * 4096 + fl * 64 + k, 31) < share;
            c.fillStyle = (on ? lit : dark) ?? "white";
            c.fillRect(
              k * pitch + pitch * 0.22,
              fl * FLOOR + 0.8,
              pitch * 0.56,
              FLOOR * 0.52,
            );
          }
        }
        c.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
    }
    c.fillStyle = roofCol;
    c.beginPath();
    c.moveTo(sx(x0, y0), sy(x0, y0, height));
    c.lineTo(sx(x1, y0), sy(x1, y0, height));
    c.lineTo(sx(x1, y1), sy(x1, y1, height));
    c.lineTo(sx(x0, y1), sy(x0, y1, height));
    c.closePath();
    c.fill();
    c.strokeStyle = shade ?? "gray";
    c.lineWidth = 0.6;
    c.stroke();
  };

  const maxUnits = () => clamp(cfg?.maxHeight ?? 36, 8, 60) * FLOOR;

  /** The brush's share of a plot now: its peak, held, then easing away. */
  const brushShare = (i: number) => {
    const c = cfg;
    const pk = peak[i] ?? 0;
    if (!c || pk <= 0) return 0;
    const age = clock - (touched[i] ?? 0);
    const hold = Math.max(0, c.hold) / 1000;
    const sink = Math.max(0.2, c.sinkDuration / 1000);
    if (age <= hold) return pk;
    if (age > hold + sink) {
      peak[i] = 0;
      return 0;
    }
    const t = clamp((age - hold) / sink, 0, 1);
    // Reduced motion holds, then drops at once; otherwise a soft ease down.
    return c.motionSafe ? pk * (1 - t * t * (3 - 2 * t)) : pk;
  };

  /** What a plot is asked to be now: a raised district's full height, or the brush's. */
  const targetOf = (i: number, p: Plot) => {
    const c = cfg;
    if (!c) return BASE;
    const share = Math.max(
      c.raised.includes(p.district) ? 1 : 0,
      brushShare(i),
    );
    return BASE + share * p.share * (maxUnits() - BASE);
  };

  const stamp = (x: number, y: number) => {
    const c = cfg;
    if (!c) return;
    const reach = Math.max(8, c.radius / Math.max(0.05, fit.s));
    const sigma = reach * (0.14 + 0.62 * clamp(c.falloff, 0, 1));
    c.plan.plots.forEach((p, i) => {
      const dx = Math.max(p.x - x, 0, x - (p.x + p.w));
      const dy = Math.max(p.y - y, 0, y - (p.y + p.d));
      const d2 = dx * dx + dy * dy;
      if (d2 > reach * reach * 4) return;
      const raise = Math.exp(-d2 / (2 * sigma * sigma));
      if (raise < 0.03) return;
      // A sinking tower caught again climbs from where it stands, never drops.
      peak[i] = Math.max(raise, brushShare(i));
      touched[i] = clock;
    });
  };

  /** A stroke: stamps along the segment from the last point so fast hands leave a ridge. */
  const stroke = (x: number, y: number) => {
    const c = cfg;
    if (!c) return;
    const from = lastBrush;
    const reach = Math.max(8, c.radius / Math.max(0.05, fit.s));
    if (from) {
      const dist = Math.hypot(x - from.x, y - from.y);
      const steps = Math.min(24, Math.ceil(dist / (reach * 0.35)));
      for (let k = 1; k <= steps; k += 1) {
        stamp(
          from.x + ((x - from.x) * k) / steps,
          from.y + ((y - from.y) * k) / steps,
        );
      }
    } else stamp(x, y);
    lastBrush = { x, y };
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !gctx || !c || canvas.width < 2) return;
    const key = `${c.colorKey}|${w}|${h}|${c.maxHeight}|${c.plan.width}|${c.plan.plots.length}|${c.seed}`;
    if (key !== groundKey) {
      groundKey = key;
      paintGround();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(ground, 0, 0);
    const [, , , , , , , , roof, , , shadowCol, accent, labelCol] = colours;
    // Long shadows from the low sun, as one path so overlaps never darken twice.
    const reachSh = clamp(c.shadow, 0, 2) * 1.5;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (reachSh > 0) {
      groundTransform(ctx);
      ctx.beginPath();
      c.plan.plots.forEach((p, i) => {
        const height = z[i] ?? BASE;
        if (height < BASE + 0.5) return;
        const dx = -SUN.x * height * reachSh;
        const dy = -SUN.y * height * reachSh;
        // The hull of the footprint and its copy cast along the shadow.
        ctx.moveTo(p.x + p.w, p.y + p.d);
        ctx.lineTo(p.x, p.y + p.d);
        ctx.lineTo(p.x + dx, p.y + p.d + dy);
        ctx.lineTo(p.x + dx, p.y + dy);
        ctx.lineTo(p.x + p.w + dx, p.y + dy);
        ctx.lineTo(p.x + p.w, p.y);
        ctx.closePath();
      });
      ctx.fillStyle = shadowCol ?? "black";
      ctx.fill("nonzero");
    }
    // The active district traced on the ground.
    const outlined = c.plan.regions[c.outlined];
    if (outlined) {
      groundTransform(ctx);
      ctx.strokeStyle = accent ?? "blue";
      ctx.lineWidth = 2.2 / Math.max(0.1, fit.s);
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(
        outlined.x - 4,
        outlined.y - 4,
        outlined.w + 8,
        outlined.d + 8,
      );
      ctx.setLineDash([]);
    }
    // The brush's footprint under a hovering pointer.
    if (brushAt) {
      groundTransform(ctx);
      ctx.strokeStyle = accent ?? "blue";
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.2 / Math.max(0.1, fit.s);
      ctx.beginPath();
      ctx.arc(
        brushAt.x,
        brushAt.y,
        Math.max(8, c.radius / Math.max(0.05, fit.s)) * 0.6,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Towers far to near.
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    order.length = 0;
    c.plan.plots.forEach((_, i) => {
      if ((z[i] ?? BASE) > BASE + 0.3) order.push(i);
    });
    order.sort(
      (a, b) => (c.plan.plots[a]?.depth ?? 0) - (c.plan.plots[b]?.depth ?? 0),
    );
    for (const i of order) {
      const p = c.plan.plots[i];
      if (p) box(ctx, p, z[i] ?? BASE, true, roof ?? "white");
    }
    // The active district's name rides above its towers.
    if (outlined && 15 * fit.s >= 6) {
      groundTransform(ctx);
      ctx.font = `600 15px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const text = outlined.name
        .toUpperCase()
        .split("")
        .join(String.fromCharCode(8202));
      ctx.lineWidth = 5;
      ctx.strokeStyle = colours[0] ?? "white";
      ctx.lineJoin = "round";
      ctx.strokeText(
        text,
        outlined.x + outlined.w / 2,
        outlined.y + outlined.d + 14,
        outlined.w,
      );
      ctx.fillStyle = labelCol ?? "black";
      ctx.fillText(
        text,
        outlined.x + outlined.w / 2,
        outlined.y + outlined.d + 14,
        outlined.w,
      );
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return false;
    clock += dt;
    let busy = false;
    // Intro: one stroke across the plan, as if a hand brushed it.
    if (introAt >= 0) {
      const t = (clock - introAt) / 1.6;
      if (t >= 1) {
        introAt = -1;
        lastBrush = null;
      } else {
        const x = c.plan.width * (0.06 + 0.88 * t);
        const y = c.plan.depth * (0.5 + 0.2 * Math.sin(Math.PI * 2 * t * 0.9));
        stroke(x, y);
        busy = true;
      }
    }
    const k = springs.snap.stiffness / springs.snap.mass;
    const damp = springs.snap.damping / springs.snap.mass;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const hh = dt / steps;
    c.plan.plots.forEach((p, i) => {
      const target = targetOf(i, p);
      let zz = z[i] ?? BASE;
      let vv = zv[i] ?? 0;
      if (!c.motionSafe) {
        zz = target;
        vv = 0;
      } else {
        // Up on snap's constants: one crisp overshoot as a tower tops out.
        for (let s = 0; s < steps; s += 1) {
          vv += (-k * (zz - target) - damp * vv) * hh;
          zz += vv * hh;
        }
        if (Math.abs(zz - target) < 0.02 && Math.abs(vv) < 0.05) {
          zz = target;
          vv = 0;
        }
      }
      z[i] = zz;
      zv[i] = vv;
      if (zz !== target || vv !== 0 || (peak[i] ?? 0) > 0) busy = true;
    });
    return busy;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !cfg || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const busy = step(dt);
    draw();
    if (busy) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < COLOURS; i += 1) {
      const el = kids[i];
      if (el) colours[i] = read(getComputedStyle(el).color);
    }
    font = getComputedStyle(root).fontFamily || font;
    groundKey = "";
  };

  const resize = () => {
    const c = cfg;
    w = Math.max(1, root.clientWidth);
    h = Math.max(1, root.clientHeight);
    if (!c) return;
    ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    fit = fitFor(c.plan, w, h, clamp(c.maxHeight, 8, 60));
    const cw = Math.max(1, Math.round(w * ratio));
    const ch = Math.max(1, Math.round(h * ratio));
    for (const el of [canvas, ground]) {
      if (el.width !== cw || el.height !== ch) {
        el.width = cw;
        el.height = ch;
      }
    }
    groundKey = "";
    draw();
    kick();
  };

  // A browser short of memory may drop a 2D canvas's pixels; when it hands
  // them back, the cached ground is repainted rather than blitted blank.
  const restored = () => {
    groundKey = "";
    draw();
  };
  canvas.addEventListener("contextrestored", restored);
  ground.addEventListener("contextrestored", restored);

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx || !gctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        readColours();
        for (let i = 0; i < MAX_PLOTS; i += 1) z[i] = BASE;
      }
      if (!was || was.plan !== next.plan) {
        for (let i = 0; i < MAX_PLOTS; i += 1) {
          zv[i] = 0;
          peak[i] = 0;
        }
      }
      if (was && was.colorKey !== next.colorKey) readColours();
      if (
        !was ||
        was.plan !== next.plan ||
        was.maxHeight !== next.maxHeight ||
        was.dpr !== next.dpr
      ) {
        resize();
      }
      // A new height, reach or lighting is shown at once with one preview
      // stroke, rather than waiting for the next brush to reveal it.
      const look = `${next.maxHeight}|${next.falloff}|${next.lights}`;
      if (was && look !== previewKey && next.motionSafe && introAt < 0) {
        introAt = clock;
        lastBrush = null;
      }
      previewKey = look;
      if (!next.motionSafe) step(0);
      draw();
      kick();
    },
    brush(clientX, clientY) {
      const c = cfg;
      if (!c) return;
      const p = toPlan(clientX, clientY);
      const inside =
        p.x > -40 &&
        p.y > -40 &&
        p.x < c.plan.width + 40 &&
        p.y < c.plan.depth + 40;
      brushAt = inside ? p : null;
      if (inside) stroke(p.x, p.y);
      else lastBrush = null;
      if (!c.motionSafe) step(0);
      draw();
      kick();
    },
    lift() {
      brushAt = null;
      lastBrush = null;
      draw();
      kick();
    },
    districtAt(clientX, clientY) {
      const c = cfg;
      if (!c) return -1;
      const p = toPlan(clientX, clientY);
      return c.plan.regions.findIndex(
        (g) => p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.d,
      );
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      const c = cfg;
      // The intro runs once, the first time the plan is seen with motion allowed.
      if (c && c.intro && c.motionSafe && !introDone && visible.current) {
        introDone = true;
        introAt = clock;
      }
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      canvas.removeEventListener("contextrestored", restored);
      ground.removeEventListener("contextrestored", restored);
      root.removeAttribute("data-live");
    },
  };
}

/** The server's still: the plan's blocks and river, flat, in the wide plan's own projection. */
function stillPlan(seed: number, districts: readonly SkylineBrushDistrict[]) {
  const plan = planFor("wide", seed, districts);
  const pt = (x: number, y: number) => `${r1(viewX(x, y))} ${r1(viewY(x, y))}`;
  const quad = (r: Rect) =>
    `M ${pt(r.x, r.y)} L ${pt(r.x + r.w, r.y)} L ${pt(r.x + r.w, r.y + r.d)} L ${pt(r.x, r.y + r.d)} Z`;
  const xs = [0, plan.width].flatMap((x) =>
    [0, plan.depth].map((y) => viewX(x, y)),
  );
  const ys = [0, plan.width].flatMap((x) =>
    [0, plan.depth].map((y) => viewY(x, y)),
  );
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const vw = Math.max(...xs) - minX;
  const vh = Math.max(...ys) - minY;
  const head = vh * 0.45;
  return {
    viewBox: `${r1(minX - 20)} ${r1(minY - head)} ${r1(vw + 40)} ${r1(vh + head + 20)}`,
    ground: quad({ x: 0, y: 0, w: plan.width, d: plan.depth }),
    blocks: plan.blocks.map(quad).join(" "),
    parks: plan.parks.map(quad).join(" "),
    plots: plan.plots.map(quad).join(" "),
    river: `M ${plan.river.map(([x, y]) => pt(x, y)).join(" L ")}`,
    riverWidth: plan.riverWidth,
  };
}

/**
 * A city plan seen from above at an angle: a seeded street grid of blocks cut
 * into plots, parks with trees, a river across one corner, and district names
 * lying on the ground in the plan's own perspective. Brushing the pointer
 * across it raises every block it passes into a tower — each springs up on
 * snap's constants with one crisp overshoot, its floors appearing lit from
 * the bottom up, and casts a long shadow across the streets from a low sun —
 * and after a moment the towers sink back to their footprints, so a stroke
 * leaves a ridge that subsides like a wake.
 *
 * The districts are a listbox: focus raises the active one and traces it on
 * the ground, arrows move between them, Enter pins one (it stays raised; a tap
 * on a district does the same) and Escape clears it. Canvas 2D with a cached
 * ground layer; nothing runs at rest or off screen. Under reduced motion the
 * towers change height at once.
 */
export function SkylineBrush({
  districts = defaultSkylineBrushDistricts,
  maxHeight = 36,
  falloff = 0.45,
  lights = 0.6,
  value,
  defaultValue = null,
  onValueChange,
  radius = 48,
  hold = 1100,
  sinkDuration = 2600,
  shadow = 1.2,
  intro = true,
  groundColor = DEFAULT_GROUND,
  buildingColor = DEFAULT_BUILDING,
  windowColor = DEFAULT_WINDOW,
  seed = 1,
  dpr = 2,
  label = "City plan",
  disabled = false,
  className,
}: SkylineBrushProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const optionId = (i: number) => `${uid}-d${i}`;

  const [shape, setShape] = React.useState<SkylineBrushShape>("wide");
  const districtKey = districts
    .map((d) => `${d.id}:${d.name}:${d.height ?? ""}`)
    .join("|");
  // The plan is rebuilt only when its inputs change, so the engine keeps its heights.
  const plan = React.useMemo(
    () => planFor(shape, seed, districts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shape, seed, districtKey],
  );

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const pinnedId = value === undefined ? own : value;
  const pinned = plan.regions.findIndex((g) => g.id === pinnedId);
  const [active, setActive] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const [spoken, setSpoken] = React.useState("");
  const activeIndex = clamp(active, 0, plan.regions.length - 1);

  const raised: number[] = [];
  if (pinned >= 0) raised.push(pinned);
  if (focused && activeIndex !== pinned) raised.push(activeIndex);
  const outlined = focused ? activeIndex : pinned;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);

  const g = groundColor;
  const b = buildingColor;
  const colours = [
    g,
    `oklch(from ${g} calc(l - 0.045) calc(c * 0.8) h)`,
    `oklch(from ${g} calc(l + 0.025) c h)`,
    "light-dark(oklch(0.86 0.06 140), oklch(0.34 0.05 145))",
    "light-dark(oklch(0.66 0.09 145), oklch(0.46 0.07 145))",
    "light-dark(oklch(from var(--accent) 0.84 0.06 h), oklch(from var(--accent) 0.3 0.06 h))",
    b,
    `oklch(from ${b} calc(l * 0.74) c h)`,
    `oklch(from ${b} calc(l * 1.06 + 0.02) calc(c * 0.8) h)`,
    windowColor,
    `light-dark(oklch(from ${b} calc(l * 0.86) c h), oklch(from ${b} calc(l * 0.62) c h))`,
    "light-dark(oklch(0.3 0.03 258 / 0.18), oklch(0 0 0 / 0.4))",
    "var(--accent-bright)",
    "color-mix(in oklab, var(--ink) 55%, transparent)",
  ];

  const config: Config = {
    plan,
    maxHeight,
    falloff,
    lights,
    radius,
    hold,
    sinkDuration,
    shadow,
    intro,
    seed,
    dpr,
    motionSafe,
    colorKey: colours.join("|"),
    raised,
    outlined,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
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
    const sizer = new ResizeObserver(() => {
      setShape(shapeOf(node.clientWidth, node.clientHeight));
      engine.current?.resize();
    });
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

  const towersIn = (index: number) =>
    plan.plots.filter((p) => p.district === index);
  const sentence = (index: number, verb: string) => {
    const region = plan.regions[index];
    if (!region) return "";
    const plots = towersIn(index);
    const tallest = Math.round(
      Math.max(0, ...plots.map((p) => p.share)) * clamp(maxHeight, 8, 60),
    );
    return `${region.name} ${verb}: ${plots.length} ${plots.length === 1 ? "tower" : "towers"}, the tallest ${tallest} ${tallest === 1 ? "floor" : "floors"}.`;
  };

  /** Pins or clears a district, from the tap or key that asked. */
  const pin = (index: number | null) => {
    if (disabled) return;
    const id = index === null ? null : (plan.regions[index]?.id ?? null);
    const next = id !== null && id === pinnedId ? null : id;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    if (next === null) setSpoken("Plan cleared.");
    else if (index !== null) setSpoken(sentence(index, "pinned"));
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onMove: ({ point }) => engine.current?.brush(point.x, point.y),
    onEnd: () => engine.current?.lift(),
    onCancel: () => engine.current?.lift(),
    onTap: (event) => {
      const at = engine.current?.districtAt(event.clientX, event.clientY) ?? -1;
      if (at >= 0) {
        setActive(at);
        pin(at);
      }
    },
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const n = plan.regions.length;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (activeIndex + 1) % n;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (activeIndex - 1 + n) % n;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pin(activeIndex);
      return;
    } else if (event.key === "Escape") {
      if (pinnedId === null) return;
      event.preventDefault();
      pin(pinned);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    setSpoken(sentence(next, "raised"));
  };

  const still = stillPlan(seed, districts);

  return (
    <div
      ref={bindRoot}
      role="listbox"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-describedby={hintId}
      aria-activedescendant={focused ? optionId(activeIndex) : undefined}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        setFocused(true);
        setSpoken(sentence(activeIndex, "raised"));
      }}
      onBlur={() => setFocused(false)}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (disabled || event.pointerType === "touch") return;
        engine.current?.brush(event.clientX, event.clientY);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") engine.current?.lift();
      }}
      className={cn(
        "group/skyline-brush relative isolate h-full w-full touch-pan-y overflow-clip rounded-3 [contain:paint] select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-not-allowed" : "cursor-crosshair",
        className,
      )}
      style={{ backgroundColor: groundColor }}
    >
      <svg
        aria-hidden
        viewBox={still.viewBox}
        preserveAspectRatio="xMidYMax meet"
        className="pointer-events-none absolute inset-0 size-full group-data-live/skyline-brush:hidden"
      >
        <path d={still.ground} fill={colours[1]} />
        <path d={still.blocks} fill={colours[2]} />
        <path
          d={still.river}
          fill="none"
          stroke={colours[5]}
          strokeWidth={still.riverWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={still.parks} fill={colours[3]} />
        <path
          d={still.plots}
          fill={colours[8]}
          stroke={colours[7]}
          strokeWidth={0.6}
        />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/skyline-brush:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {colours.map((c, i) => (
          <span key={i} style={{ color: c }} />
        ))}
      </span>
      <span
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: groundColor }}
      />
      <div className="sr-only">
        {plan.regions.map((region, i) => (
          <div
            key={region.id}
            id={optionId(i)}
            role="option"
            aria-selected={region.id === pinnedId}
          >
            {region.name}, {towersIn(i).length} blocks
          </div>
        ))}
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys raise one district at a time. Enter pins the district so it
        stays raised; Escape clears it.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {spoken}
      </p>
    </div>
  );
}
