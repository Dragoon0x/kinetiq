"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RegionMapLegend = "steps" | "ramp";
export type RegionMapScheme = "cobalt" | "signal" | "heat" | "diverging";
export type RegionMapStatus = "ready" | "loading" | "error";

export type RegionMapRegion = {
  id: string;
  name: string;
  /** The region's outline as an SVG path in the map's `viewBox`. */
  d: string;
  /** [x, y, width, height] in the map's units: what a pick frames. Measured from the path when omitted. */
  box?: [number, number, number, number];
  /** Where the region's name sits. @default the centre of `box` */
  label?: [number, number];
};

export type RegionMapStat = {
  id: string;
  /** "Riders". */
  label: string;
  /** How its numbers read: a count, money in `currency`, a fraction shown as a percentage, or a plain number. @default "count" */
  kind?: "count" | "money" | "percent" | "number";
  /** A word after a count or number: "riders". */
  unit?: string;
  /** Show a + on rises (for changes). @default false */
  signed?: boolean;
};

export type RegionMapDatum = {
  /** A region's id. */
  region: string;
  /** One number per stat id. */
  values: Record<string, number>;
  /** Recent readings per stat id, oldest first: the details panel draws them. */
  trends?: Record<string, number[]>;
};

export type RegionMapProps = {
  /** How far the map leans in on a picked region, 1 (it stays put) to 4. @default 2.5 */
  zoom?: number;
  /** The legend and the fills: stepped classes, or a continuous ramp. Also sets how a scrubbed band snaps. @default "steps" */
  legend?: RegionMapLegend;
  /** The colour scheme: one hue, a warm heat ramp, or a diverging pair around zero. @default "cobalt" */
  scheme?: RegionMapScheme;
  /** The regions, as SVG paths. @default defaultRegionMapRegions (fourteen generated regions) */
  regions?: RegionMapRegion[];
  /** The map's extent, [x, y, width, height]. @default defaultRegionMapViewBox */
  viewBox?: [number, number, number, number];
  /** What is measured. @default defaultRegionMapStats */
  stats?: RegionMapStat[];
  /** The numbers, one datum per region. @default defaultRegionMapData */
  data?: RegionMapDatum[];
  /** Controlled metric: the stat id the map is coloured by. */
  metric?: string;
  /** Initial metric when uncontrolled. @default the first stat */
  defaultMetric?: string;
  /** Fires from the metric switch with the new stat id. */
  onMetricChange?: (metric: string) => void;
  /** Controlled pick: the region the map leans toward, or null for the whole map. */
  value?: string | null;
  /** Initial pick when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the click, key or button that picked a region (or null when it leans out). */
  onValueChange?: (region: string | null) => void;
  /** Controlled band: the [low, high] values the legend highlights, or null. */
  band?: [number, number] | null;
  /** Initial band when uncontrolled. @default null */
  defaultBand?: [number, number] | null;
  /** Fires when a scrub settles, a key moves the band, or it is cleared. */
  onBandChange?: (band: [number, number] | null) => void;
  /** Classes in the stepped legend, 3 to 7. @default 5 */
  steps?: number;
  /** How a value reads in the tooltip, the panel and the spoken text. @default by the stat's kind in `locale` */
  format?: (value: number, stat: RegionMapStat) => string;
  /** The locale for numbers and money. @default "en-US" */
  locale?: string;
  /** The currency for money stats. @default "USD" */
  currency?: string;
  /** Whether the numbers have arrived. @default "ready" */
  status?: RegionMapStatus;
  /** "Try again" was pressed after the numbers failed to load. */
  onRetry?: () => void;
  /** The map's heading. @default "Regions" */
  title?: string;
  /** A quieter line under the heading. */
  subtitle?: string;
  /** The map's accessible name. @default the title */
  label?: string;
  /** The tallest the surface grows, in px; it scrolls inside itself past that. @default 580 */
  maxHeight?: number;
  /** Play the camera's swish and the legend's plips. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                         The generated default map                        */
/* ----------------------------------------------------------------------- */

type Pt = { x: number; y: number };

const MAP_W = 600;
const MAP_H = 400;

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let v = Math.imul(s ^ (s >>> 15), 1 | s);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Box sides as edge labels: top, right, bottom, left. */
const TOP = -1;
const RIGHT = -2;
const BOTTOM = -3;
const LEFT = -4;

type Cell = { verts: Pt[]; labels: number[] };

/**
 * The bisector of two sites as n·x = c, always built from the lower index
 * first: both cells that share it compute it with the same arithmetic.
 */
function bisector(sites: Pt[], i: number, j: number) {
  const a = sites[Math.min(i, j)] as Pt;
  const b = sites[Math.max(i, j)] as Pt;
  return {
    nx: b.x - a.x,
    ny: b.y - a.y,
    c: (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y) / 2,
  };
}

/**
 * A Voronoi cell by clipping the box with every other site's half-plane.
 * Each edge remembers what made it — a neighbouring site or a side of the
 * box — so the vertices can be rebuilt canonically afterwards.
 */
function voronoiCell(sites: Pt[], i: number): Cell {
  let verts: Pt[] = [
    { x: 0, y: 0 },
    { x: MAP_W, y: 0 },
    { x: MAP_W, y: MAP_H },
    { x: 0, y: MAP_H },
  ];
  let labels = [TOP, RIGHT, BOTTOM, LEFT];
  const p = sites[i] as Pt;
  for (let j = 0; j < sites.length; j += 1) {
    if (j === i) continue;
    const q = sites[j] as Pt;
    // Sites far beyond the cell's reach cannot cut it.
    let reach = 0;
    for (const v of verts) {
      reach = Math.max(
        reach,
        (v.x - p.x) * (v.x - p.x) + (v.y - p.y) * (v.y - p.y),
      );
    }
    if ((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y) > 4 * reach)
      continue;
    const line = bisector(sites, i, j);
    const sgn = i < j ? 1 : -1;
    const f = (v: Pt) => sgn * (line.nx * v.x + line.ny * v.y - line.c);
    const nextVerts: Pt[] = [];
    const nextLabels: number[] = [];
    for (let k = 0; k < verts.length; k += 1) {
      const a = verts[k] as Pt;
      const b = verts[(k + 1) % verts.length] as Pt;
      const fa = f(a);
      const fb = f(b);
      const inA = fa <= 0;
      const inB = fb <= 0;
      const label = labels[k] as number;
      const cut = () => {
        const t = fa / (fa - fb);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      };
      if (inA && inB) {
        nextVerts.push(a);
        nextLabels.push(label);
      } else if (inA && !inB) {
        nextVerts.push(a);
        nextLabels.push(label);
        nextVerts.push(cut());
        nextLabels.push(j);
      } else if (!inA && inB) {
        nextVerts.push(cut());
        nextLabels.push(label);
      }
    }
    verts = nextVerts;
    labels = nextLabels;
  }
  return { verts, labels };
}

function circumcentre(sites: Pt[], ids: number[]): Pt {
  const [i, j, k] = [...ids].sort((m, n) => m - n) as [number, number, number];
  const a = sites[i] as Pt;
  const b = sites[j] as Pt;
  const c = sites[k] as Pt;
  const bx = b.x - a.x;
  const by = b.y - a.y;
  const cx = c.x - a.x;
  const cy = c.y - a.y;
  const d = 2 * (bx * cy - by * cx);
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  return { x: a.x + (cy * b2 - by * c2) / d, y: a.y + (bx * c2 - cx * b2) / d };
}

function onSide(sites: Pt[], i: number, j: number, side: number): Pt {
  const { nx, ny, c } = bisector(sites, i, j);
  if (side === TOP) return { x: (c - ny * 0) / nx, y: 0 };
  if (side === BOTTOM) return { x: (c - ny * MAP_H) / nx, y: MAP_H };
  if (side === LEFT) return { x: 0, y: (c - nx * 0) / ny };
  return { x: MAP_W, y: (c - nx * MAP_W) / ny };
}

const CORNERS: Record<string, Pt> = {
  [`${LEFT},${TOP}`]: { x: 0, y: 0 },
  [`${TOP},${RIGHT}`]: { x: MAP_W, y: 0 },
  [`${RIGHT},${BOTTOM}`]: { x: MAP_W, y: MAP_H },
  [`${BOTTOM},${LEFT}`]: { x: 0, y: MAP_H },
};

/**
 * Every vertex rebuilt from the two edges that meet there — the
 * circumcentre of three sites, or a bisector meeting the box — so cells that
 * share a vertex hold bit-identical copies of it, and their borders meet with
 * no seam whatever order they were clipped in.
 */
function canonical(sites: Pt[], i: number, cell: Cell): Cell {
  const n = cell.verts.length;
  const verts: Pt[] = [];
  for (let k = 0; k < n; k += 1) {
    const before = cell.labels[(k - 1 + n) % n] as number;
    const after = cell.labels[k] as number;
    let v: Pt;
    if (before >= 0 && after >= 0) v = circumcentre(sites, [i, before, after]);
    else if (before >= 0) v = onSide(sites, i, before, after);
    else if (after >= 0) v = onSide(sites, i, after, before);
    else v = CORNERS[`${before},${after}`] ?? (cell.verts[k] as Pt);
    verts.push({ x: r3(v.x), y: r3(v.y) });
  }
  // Drop edges a degenerate clip left with no length.
  const outV: Pt[] = [];
  const outL: number[] = [];
  for (let k = 0; k < n; k += 1) {
    const a = verts[k] as Pt;
    const b = verts[(k + 1) % n] as Pt;
    if (a.x === b.x && a.y === b.y) continue;
    outV.push(a);
    outL.push(cell.labels[k] as number);
  }
  return { verts: outV, labels: outL };
}

/** Land is a sum of soft bumps, minus two bays: arithmetic only, so it never differs between machines. */
const BUMPS: [number, number, number, number][] = [
  // x, y, radius, weight
  [230, 190, 120, 1],
  [370, 215, 125, 1],
  [300, 120, 80, 0.55],
  [150, 265, 70, 0.55],
  [470, 135, 70, 0.5],
  [430, 305, 66, 0.5],
  [312, 345, 34, -0.95],
  [118, 140, 44, -0.6],
  [532, 332, 23, 1.4],
  [70, 70, 14, 1.3],
];

function landAt(p: Pt): boolean {
  let sum = 0;
  for (const [x, y, r, w] of BUMPS) {
    const d2 = ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)) / (r * r);
    sum += w / (1 + d2 * d2);
  }
  return sum > 0.62;
}

const REGION_NAMES = [
  "Wren Downs",
  "Ashby Reach",
  "Coldbrook",
  "Merrow Vale",
  "Kestrel Point",
  "Linden Shore",
  "Fernmoor",
  "Tarnside",
  "Gauge Flats",
  "Harrow Fen",
  "Sorrel Heights",
  "Quillbay",
  "Basin Hollow",
  "Halden Coast",
];

type Edge = { from: string; to: string; pts: Pt[] };

const keyOf = (p: Pt) => `${p.x},${p.y}`;

/**
 * A shared border wiggles the same way seen from either side: its two inner
 * points are placed from a hash of its ends in a fixed order.
 */
function wiggle(a: Pt, b: Pt): Pt[] {
  const ka = keyOf(a);
  const kb = keyOf(b);
  const flip = ka > kb;
  const s = flip ? b : a;
  const e = flip ? a : b;
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 6) return [a, b];
  const rand = mulberry32(hash(flip ? `${kb}>${ka}` : `${ka}>${kb}`));
  const amp = Math.min(3.2, len * 0.16);
  const px = -dy / len;
  const py = dx / len;
  const inner = [1 / 3, 2 / 3].map((t) => {
    const o = (rand() - 0.5) * 2 * amp;
    return { x: r3(s.x + dx * t + px * o), y: r3(s.y + dy * t + py * o) };
  });
  const line = [s, ...inner, e];
  return flip ? line.reverse() : line;
}

/** Chains directed border edges into closed loops, as one path. */
function loops(edges: Edge[]): string {
  const byStart = new Map<string, number[]>();
  edges.forEach((e, i) => {
    const list = byStart.get(e.from) ?? [];
    list.push(i);
    byStart.set(e.from, list);
  });
  const used = new Set<number>();
  const parts: string[] = [];
  for (let i = 0; i < edges.length; i += 1) {
    if (used.has(i)) continue;
    const pts: Pt[] = [];
    let at = i;
    const start = edges[i]?.from;
    for (let guard = 0; guard < edges.length + 1; guard += 1) {
      used.add(at);
      const e = edges[at] as Edge;
      pts.push(...e.pts.slice(0, -1));
      if (e.to === start) break;
      const next = (byStart.get(e.to) ?? []).find((n) => !used.has(n));
      if (next === undefined) break;
      at = next;
    }
    parts.push(`M ${pts.map((p) => `${r2(p.x)} ${r2(p.y)}`).join(" L ")} Z`);
  }
  return parts.join(" ");
}

type Generated = {
  regions: {
    id: string;
    name: string;
    d: string;
    box: [number, number, number, number];
    label: [number, number];
  }[];
};

function generateMap(): Generated {
  const rand = mulberry32(1318);
  const cols = 17;
  const rows = 11;
  const cw = MAP_W / cols;
  const ch = MAP_H / rows;
  const sites: Pt[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      sites.push({
        x: r3((i + 0.5 + (rand() - 0.5) * 0.84) * cw),
        y: r3((j + 0.5 + (rand() - 0.5) * 0.84) * ch),
      });
    }
  }
  const cells = sites.map((_, i) => canonical(sites, i, voronoiCell(sites, i)));
  const land = sites.map(
    (p, i) => landAt(p) && (cells[i]?.labels ?? []).every((l) => l >= 0),
  );
  const landIds = sites.map((_, i) => i).filter((i) => land[i]);

  // Region seeds: spread by farthest-point picks, then settled by a few
  // rounds of k-means so the regions come out even.
  const K = REGION_NAMES.length;
  const d2 = (a: Pt, b: Pt) =>
    (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
  const site = (i: number) => sites[i] as Pt;
  let seeds: Pt[] = [];
  const westmost = landIds.reduce((m, i) => (site(i).x < site(m).x ? i : m));
  seeds.push(site(westmost));
  while (seeds.length < K) {
    let best = landIds[0] as number;
    let bestD = -1;
    for (const i of landIds) {
      const d = Math.min(...seeds.map((s) => d2(s, site(i))));
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    seeds.push(site(best));
  }
  const nearest = (p: Pt) => {
    let best = 0;
    let bestD = Infinity;
    seeds.forEach((s, k) => {
      const d = d2(s, p);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    return best;
  };
  for (let round = 0; round < 6; round += 1) {
    const sum = seeds.map(() => ({ x: 0, y: 0, n: 0 }));
    for (const i of landIds) {
      const k = nearest(site(i));
      const acc = sum[k];
      if (!acc) continue;
      acc.x += site(i).x;
      acc.y += site(i).y;
      acc.n += 1;
    }
    seeds = seeds.map((s, k) => {
      const acc = sum[k];
      return acc && acc.n > 0 ? { x: acc.x / acc.n, y: acc.y / acc.n } : s;
    });
  }
  // Grown outward over the cells' adjacency from the cell nearest each seed,
  // nearest first, so every region is one piece; islands join the nearest.
  const region = sites.map(() => -1);
  const cost = sites.map(() => Infinity);
  const frontier: { i: number; k: number; c: number }[] = [];
  seeds.forEach((s, k) => {
    let best = landIds[0] as number;
    for (const i of landIds) if (d2(site(i), s) < d2(site(best), s)) best = i;
    if (region[best] === -1) {
      region[best] = k;
      cost[best] = 0;
      frontier.push({ i: best, k, c: 0 });
    }
  });
  while (frontier.length > 0) {
    let at = 0;
    frontier.forEach((f, n) => {
      const top = frontier[at] as { c: number };
      if (f.c < top.c) at = n;
    });
    const { i, k, c } = frontier.splice(at, 1)[0] as {
      i: number;
      k: number;
      c: number;
    };
    if (c > (cost[i] ?? Infinity)) continue;
    for (const j of cells[i]?.labels ?? []) {
      if (j < 0 || !land[j]) continue;
      const step = c + Math.sqrt(d2(site(i), site(j)));
      if (step < (cost[j] ?? Infinity)) {
        cost[j] = step;
        region[j] = k;
        frontier.push({ i: j, k, c: step });
      }
    }
  }
  for (const i of landIds) if (region[i] === -1) region[i] = nearest(site(i));

  // Named west to east, north to south within a band.
  const order = seeds
    .map((s, k) => ({ k, s }))
    .sort((a, b) => a.s.x + a.s.y * 0.6 - (b.s.x + b.s.y * 0.6))
    .map((o) => o.k);

  const regions = order.map((k, n) => {
    const edges: Edge[] = [];
    const members: number[] = [];
    for (const i of landIds) {
      if (region[i] !== k) continue;
      members.push(i);
      const cell = cells[i] as Cell;
      const m = cell.verts.length;
      for (let e = 0; e < m; e += 1) {
        const l = cell.labels[e] as number;
        const other = l >= 0 && land[l] ? region[l] : -2;
        if (other === k) continue;
        const a = cell.verts[e] as Pt;
        const b = cell.verts[(e + 1) % m] as Pt;
        edges.push({ from: keyOf(a), to: keyOf(b), pts: wiggle(a, b) });
      }
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const e of edges) {
      for (const p of e.pts) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
    }
    const mx = members.reduce((s, i) => s + site(i).x, 0) / members.length;
    const my = members.reduce((s, i) => s + site(i).y, 0) / members.length;
    const centre = members.reduce((best, i) =>
      d2(site(i), { x: mx, y: my }) < d2(site(best), { x: mx, y: my })
        ? i
        : best,
    );
    const name = REGION_NAMES[n] ?? `Region ${n + 1}`;
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      d: loops(edges),
      box: [r2(x0), r2(y0), r2(x1 - x0), r2(y1 - y0)] as [
        number,
        number,
        number,
        number,
      ],
      label: [r2(site(centre).x), r2(site(centre).y)] as [number, number],
    };
  });
  return { regions };
}

const GENERATED = generateMap();

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultRegionMapViewBox: [number, number, number, number] = [
  0,
  0,
  MAP_W,
  MAP_H,
];

/** Fourteen invented regions on an invented coast, generated once. */
export const defaultRegionMapRegions: RegionMapRegion[] = GENERATED.regions;

export const defaultRegionMapStats: RegionMapStat[] = [
  { id: "riders", label: "Riders", kind: "count", unit: "riders" },
  { id: "revenue", label: "Revenue", kind: "money" },
  { id: "growth", label: "Growth", kind: "percent", signed: true },
  { id: "trips", label: "Trips per rider", kind: "number", unit: "trips" },
];

/**
 * A bike-share network's month, per region: riders, revenue, growth on the
 * last quarter and trips per rider, with twelve months of each behind them.
 * Plain arithmetic on a seeded sequence, so every machine builds the same.
 */
export const defaultRegionMapData: RegionMapDatum[] = (() => {
  const rand = mulberry32(4210);
  return GENERATED.regions.map((r, i) => {
    const centre = 1 - Math.abs(i - 6.5) / 9;
    const riders = Math.round(900 + (2600 + 2800 * centre) * rand());
    const growth = Math.round((-0.07 + 0.31 * rand()) * 1000) / 1000;
    const trips = Math.round((2.1 + 4.4 * rand()) * 10) / 10;
    const price = 2.4 + 0.9 * rand();
    const revenue = Math.round(riders * trips * price);
    const ridersTrend: number[] = [];
    const revenueTrend: number[] = [];
    const growthTrend: number[] = [];
    const tripsTrend: number[] = [];
    for (let m = 0; m < 12; m += 1) {
      const back = (11 - m) / 3;
      const wobble = m === 11 ? 1 : 0.94 + 0.12 * rand();
      const rm = Math.max(
        120,
        Math.round((riders / (1 + growth * back)) * wobble),
      );
      const tm =
        m === 11 ? trips : Math.round((trips + (rand() - 0.5) * 0.8) * 10) / 10;
      ridersTrend.push(rm);
      tripsTrend.push(tm);
      revenueTrend.push(m === 11 ? revenue : Math.round(rm * tm * price));
      growthTrend.push(
        m === 11
          ? growth
          : Math.round((growth + (rand() - 0.5) * 0.08) * 1000) / 1000,
      );
    }
    return {
      region: r.id,
      values: { riders, revenue, growth, trips },
      trends: {
        riders: ridersTrend,
        revenue: revenueTrend,
        growth: growthTrend,
        trips: tripsTrend,
      },
    };
  });
})();

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * The smallest round step (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 × 10ⁿ) at or above `raw`, found by
 * repeated ×10 and ÷10 rather than logarithms, so every machine agrees.
 */
function niceAbove(raw: number): number {
  if (!(raw > 0)) return 1;
  let p = 1;
  while (p * 10 <= raw) p *= 10;
  while (p > raw) p /= 10;
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * p >= raw - 1e-12) return r6(m * p);
  }
  return r6(10 * p);
}

/**
 * A compact reading — 51.5K, $1.2M — built from a plain formatter. The
 * platform's own compact notation differs between ICU versions ($20K in one
 * browser, $20.0K on a server), which would not hydrate.
 */
function compactWith(fmt: Intl.NumberFormat, v: number): string {
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  const a = Math.abs(v);
  for (let i = 0; i < units.length; i += 1) {
    const [unit, suffix] = units[i] as [number, string];
    if (a < unit) continue;
    const scaled = Math.round((a / unit) * 10) / 10;
    // 999,960 rounds to 1000K: that is 1M.
    if (scaled >= 1000 && i > 0) {
      const [up, upSuffix] = units[i - 1] as [number, string];
      return `${fmt.format(Math.sign(v) * (Math.round((a / up) * 10) / 10))}${upSuffix}`;
    }
    return `${fmt.format(Math.sign(v) * scaled)}${suffix}`;
  }
  return fmt.format(Math.round(v * 10) / 10);
}

type Scale = {
  lo: number;
  hi: number;
  /** Width of one class. */
  step: number;
  n: number;
  diverging: boolean;
};

/** Classes on round numbers that hold every value. */
function scaleFor(values: number[], n: number, diverging: boolean): Scale {
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  if (diverging) {
    const m = Math.max(Math.abs(min), Math.abs(max), 1e-9);
    let step = niceAbove((2 * m) / n);
    while ((step * n) / 2 < m - 1e-12) step = niceAbove(step * 1.0001);
    return {
      lo: r6((-step * n) / 2),
      hi: r6((step * n) / 2),
      step,
      n,
      diverging,
    };
  }
  let step = niceAbove(Math.max(max - min, 1e-9) / n);
  let lo = r6(Math.floor(min / step) * step);
  while (lo + step * n < max - 1e-12) {
    step = niceAbove(step * 1.0001);
    lo = r6(Math.floor(min / step) * step);
  }
  return { lo, hi: r6(lo + step * n), step, n, diverging };
}

const classOf = (v: number, s: Scale) =>
  clamp(Math.floor((v - s.lo) / s.step + 1e-9), 0, s.n - 1);

/** Where a value sits on the scale, 0–1 (or −1–1 diverging, 0 at zero). */
function toneOf(v: number, s: Scale, legend: RegionMapLegend): number {
  if (legend === "steps") {
    const c = classOf(v, s);
    const mid = (s.n - 1) / 2;
    if (s.diverging) return mid > 0 ? (c - mid) / mid : 0;
    return s.n > 1 ? c / (s.n - 1) : 1;
  }
  if (s.diverging) return clamp(v / s.hi, -1, 1);
  return clamp((v - s.lo) / (s.hi - s.lo), 0, 1);
}

/**
 * Fills are pigment: each scheme takes a token's hue at a fixed lightness
 * and mixes it into the card colour in oklab, from faint to full, so a low
 * value is pale on a light page and dim on a dark one and a high value reads
 * the same in both.
 */
function fillOf(t: number, scheme: RegionMapScheme): string {
  const pct = (k: number) => Math.round(clamp(k, 0, 1) * 100);
  if (scheme === "diverging") {
    const pigment =
      t < 0
        ? "oklch(from var(--danger) 0.62 0.19 h)"
        : "oklch(from var(--success) 0.62 0.15 h)";
    return `color-mix(in oklab, ${pigment} ${pct(0.08 + 0.92 * Math.abs(t))}%, var(--card))`;
  }
  if (scheme === "heat") {
    return `color-mix(in oklab, color-mix(in oklch, oklch(from var(--danger) 0.58 0.21 h) ${pct(t)}%, oklch(from var(--warn) 0.84 0.15 h)) ${pct(0.22 + 0.78 * t)}%, var(--card))`;
  }
  const pigment =
    scheme === "signal"
      ? "oklch(from var(--signal) 0.62 0.14 h)"
      : "oklch(from var(--accent-bright) 0.56 0.19 h)";
  return `color-mix(in oklab, ${pigment} ${pct(0.1 + 0.9 * t)}%, var(--card))`;
}

type Camera = { x: number; y: number; k: number };

function bboxOfPath(d: string): [number, number, number, number] | null {
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/g);
  if (!nums || nums.length < 2) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}

/** Where a value's label goes on the legend, as a share of its width. */
const shareOf = (v: number, s: Scale) =>
  clamp((v - s.lo) / (s.hi - s.lo), 0, 1);

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** A region's name, riding the camera: placed from its motion values, never re-rendered per frame. */
function MapLabel({
  name,
  at,
  cam,
  view,
  frame,
  shown,
  strong,
}: {
  name: string;
  at: [number, number];
  cam: {
    x: MotionValue<number>;
    y: MotionValue<number>;
    k: MotionValue<number>;
  };
  view: [number, number, number, number];
  frame: { w: number; h: number };
  shown: boolean;
  strong: boolean;
}) {
  const place =
    (axis: "x" | "y") =>
    ([cx = 0, cy = 0, k = 1]: number[]) => {
      const vw = view[2] / k;
      const vh = view[3] / k;
      const s = Math.min(frame.w / vw, frame.h / vh);
      if (axis === "x") {
        const ox = (frame.w - s * vw) / 2;
        return r2(ox + (at[0] - (cx - vw / 2)) * s);
      }
      const oy = (frame.h - s * vh) / 2;
      return r2(oy + (at[1] - (cy - vh / 2)) * s);
    };
  const x = useTransform(
    [cam.x, cam.y, cam.k] as MotionValue<number>[],
    place("x"),
  );
  const y = useTransform(
    [cam.x, cam.y, cam.k] as MotionValue<number>[],
    place("y"),
  );
  return (
    <motion.span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none whitespace-nowrap transition-opacity duration-200",
        "[text-shadow:0_0_2px_var(--card),0_0_2px_var(--card),0_0_4px_var(--card)]",
        strong ? "font-semibold text-foreground" : "font-medium text-ink-2",
        shown ? "opacity-100" : "opacity-0",
      )}
      style={{ x, y }}
    >
      {name}
    </motion.span>
  );
}

function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  const w = 120;
  const h = 32;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    r2((i / (values.length - 1)) * (w - 4) + 2),
    r2(h - 3 - ((v - min) / span) * (h - 6)),
  ]);
  const line = `M ${pts.map(([x, y]) => `${x} ${y}`).join(" L ")}`;
  const last = pts[pts.length - 1] ?? [0, 0];
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-8 w-full", className)}
      preserveAspectRatio="none"
    >
      <path
        d={`${line} L ${last[0]} ${h} L ${pts[0]?.[0] ?? 0} ${h} Z`}
        className="fill-cobalt-bright/12"
      />
      <path
        d={line}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-cobalt-bright"
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The map                                 */
/* ----------------------------------------------------------------------- */

type Scrub = { lo: number; hi: number } | null;

type Latest = {
  bandFromShare: (centre: number) => [number, number];
  scrubTo: (centre: number) => void;
};

/**
 * A choropleth of regions with the numbers behind every colour. Pointing at
 * a region shows its reading in a tooltip that follows the pointer 1:1.
 * Picking one leans the map toward it: the camera — centre and scale, three
 * motion values written into the SVG viewBox — glides to frame the region,
 * the region lifts above its neighbours on snap while the rest dim, and the
 * side panel swaps the ranking for the region's numbers, with Previous and
 * Next to travel region to region by rank.
 *
 * The legend is a slider over the value scale: drag along it and a bracket
 * follows the finger 1:1 while the regions inside the band stay lit; let go
 * and, stepped, the bracket springs onto the class under it with the throw's
 * velocity. The fills are pigment mixed into the card colour in oklab, so
 * the map reads in both themes.
 *
 * The map is a listbox — arrows move to the nearest region in that
 * direction, Enter picks, Escape leans out — the ranking is a list of
 * buttons, and the legend a real slider. Under reduced motion the camera
 * cuts, nothing lifts and the bracket jumps; colours, bands and numbers are
 * unchanged.
 */
export function RegionMap({
  zoom = 2.5,
  legend = "steps",
  scheme = "cobalt",
  regions = defaultRegionMapRegions,
  viewBox = defaultRegionMapViewBox,
  stats = defaultRegionMapStats,
  data = defaultRegionMapData,
  metric,
  defaultMetric,
  onMetricChange,
  value,
  defaultValue = null,
  onValueChange,
  band,
  defaultBand = null,
  onBandChange,
  steps = 5,
  format,
  locale = "en-US",
  currency = "USD",
  status = "ready",
  onRetry,
  title = "Regions",
  subtitle,
  label,
  maxHeight = 580,
  sound = false,
  disabled = false,
  className,
}: RegionMapProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const [vx, vy, vw, vh] = viewBox;
  const n = clamp(Math.round(steps), 3, 7);
  const maxZoom = clamp(zoom, 1, 4);

  /* ------------------------------- values -------------------------------- */

  const [ownMetric, setOwnMetric] = React.useState(
    () => defaultMetric ?? stats[0]?.id ?? "",
  );
  const metricId = metric ?? ownMetric;
  const stat = stats.find((s) => s.id === metricId) ?? stats[0];

  const [ownValue, setOwnValue] = React.useState<string | null>(defaultValue);
  const picked = value !== undefined ? value : ownValue;

  const [ownBand, setOwnBand] = React.useState<[number, number] | null>(
    defaultBand,
  );
  const committedBand = band !== undefined ? band : ownBand;

  const numbers = React.useMemo(() => {
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const n1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const money = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    const pct = new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 1,
    });
    const money1 = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    return { nf, n1, money, pct, money1 };
  }, [locale, currency]);

  const full = (v: number, s: RegionMapStat | undefined) => {
    if (!s) return String(v);
    if (format) return format(v, s);
    const kind = s.kind ?? "count";
    const sign = s.signed && v > 0 ? "+" : "";
    if (kind === "money") return `${sign}${numbers.money.format(v)}`;
    if (kind === "percent") return `${sign}${numbers.pct.format(v)}`;
    const body =
      kind === "number" ? numbers.n1.format(v) : numbers.nf.format(v);
    return `${sign}${body}${s.unit ? ` ${s.unit}` : ""}`;
  };
  const short = (v: number, s: RegionMapStat | undefined) => {
    const kind = s?.kind ?? "count";
    const sign = s?.signed && v > 0 ? "+" : "";
    if (kind === "money") return compactWith(numbers.money1, v);
    if (kind === "percent") return `${sign}${numbers.pct.format(v)}`;
    if (kind === "number") return numbers.n1.format(v);
    return compactWith(numbers.n1, v);
  };

  const byRegion = new Map(data.map((d) => [d.region, d]));
  const valueOf = (id: string) => {
    const v = stat ? byRegion.get(id)?.values[stat.id] : undefined;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const known = regions.filter((r) => valueOf(r.id) !== null);
  const ranked = [...known].sort(
    (a, b) =>
      (valueOf(b.id) ?? 0) - (valueOf(a.id) ?? 0) || (a.name < b.name ? -1 : 1),
  );
  const rankOf = (id: string) => ranked.findIndex((r) => r.id === id) + 1;
  const diverging = scheme === "diverging";
  const scale = scaleFor(
    known.map((r) => valueOf(r.id) ?? 0),
    n,
    diverging,
  );
  const topValue = Math.max(
    1e-9,
    ...known.map((r) => Math.abs(valueOf(r.id) ?? 0)),
  );

  /* -------------------------------- boxes -------------------------------- */

  // Regions passed without a box are measured once their paths exist.
  const [measured, setMeasured] = React.useState<
    Record<string, [number, number, number, number]>
  >({});
  const boxOf = (r: RegionMapRegion): [number, number, number, number] =>
    r.box ?? measured[r.id] ?? bboxOfPath(r.d) ?? [vx, vy, vw, vh];
  const centreOf = (r: RegionMapRegion): [number, number] => {
    if (r.label) return r.label;
    const [x, y, w, h] = boxOf(r);
    return [x + w / 2, y + h / 2];
  };
  const pathNodes = React.useRef(new Map<string, SVGPathElement>());
  const needsMeasure = regions.some((r) => !r.box && !measured[r.id]);
  React.useEffect(() => {
    if (!needsMeasure) return;
    const next: Record<string, [number, number, number, number]> = {};
    for (const r of regions) {
      if (r.box) continue;
      const node = pathNodes.current.get(r.id);
      if (!node) continue;
      const b = node.getBBox();
      next[r.id] = [r2(b.x), r2(b.y), r2(b.width), r2(b.height)];
    }
    if (Object.keys(next).length > 0) {
      // Measured from the DOM after paint; one extra render, once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMeasured((m) => ({ ...m, ...next }));
    }
  }, [needsMeasure, regions]);

  /* ------------------------------- camera -------------------------------- */

  const cameraFor = (id: string | null): Camera => {
    const whole = { x: vx + vw / 2, y: vy + vh / 2, k: 1 };
    const r = id ? regions.find((x) => x.id === id) : undefined;
    if (!r || maxZoom <= 1) return whole;
    const [bx, by, bw, bh] = boxOf(r);
    const k = clamp(
      Math.min(vw / Math.max(1, bw * 1.8), vh / Math.max(1, bh * 1.8)),
      1,
      maxZoom,
    );
    const hw = vw / (2 * k);
    const hh = vh / (2 * k);
    return {
      x: r2(clamp(bx + bw / 2, vx + hw, vx + vw - hw)),
      y: r2(clamp(by + bh / 2, vy + hh, vy + vh - hh)),
      k: r6(k),
    };
  };

  const [startCam] = React.useState(() => cameraFor(picked));
  const camX = useMotionValue(startCam.x);
  const camY = useMotionValue(startCam.y);
  const camK = useMotionValue(startCam.k);
  const lift = useMotionValue(picked && motionSafe ? 1 : 0);
  const viewBoxText = useTransform(
    [camX, camY, camK] as MotionValue<number>[],
    ([x = 0, y = 0, k = 1]: number[]) => {
      const w = vw / k;
      const h = vh / k;
      return `${r2(x - w / 2)} ${r2(y - h / 2)} ${r2(w)} ${r2(h)}`;
    },
  );
  const [startViewBox] = React.useState(() => viewBoxText.get());
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  React.useEffect(
    () =>
      viewBoxText.on("change", (v) =>
        svgRef.current?.setAttribute("viewBox", v),
      ),
    [viewBoxText],
  );

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  // The camera goes wherever the pick says, whoever changed it; a re-run
  // (StrictMode, a new zoom) carries it on from where it is.
  const target = cameraFor(picked);
  React.useEffect(() => {
    const go = (key: string, mv: MotionValue<number>, to: number) => {
      if (!motionSafe) {
        anims.current.get(key)?.stop();
        mv.set(to);
        return;
      }
      if (Math.abs(mv.get() - to) < 1e-4) return;
      run(key, animate(mv, to, springs.glide));
    };
    go("x", camX, target.x);
    go("y", camY, target.y);
    go("k", camK, target.k);
    // The pick lifts off the map on snap; under reduced motion it stays flat.
    if (!motionSafe) {
      anims.current.get("lift")?.stop();
      lift.set(0);
    } else if (picked) {
      lift.set(0);
      run("lift", animate(lift, 1, springs.snap));
    } else {
      run("lift", animate(lift, 0, springs.glide));
    }
    // Keyed on the destination, not on the object that describes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, target.x, target.y, target.k, motionSafe]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* --------------------------- frame and tooltip -------------------------- */

  const [frameEl, setFrameEl] = React.useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = React.useState({ w: 480, h: 320 });
  React.useEffect(() => {
    if (!frameEl) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(frameEl.clientWidth);
      const h = Math.round(frameEl.clientHeight);
      setFrame((f) => (f.w === w && f.h === h ? f : { w, h }));
    });
    ro.observe(frameEl);
    return () => ro.disconnect();
  }, [frameEl]);

  const [hover, setHover] = React.useState<string | null>(null);
  const tipX = useMotionValue(0);
  const tipY = useMotionValue(0);
  const tipRef = React.useRef<HTMLDivElement | null>(null);

  const placeTip = (clientX: number, clientY: number) => {
    const rect = frameEl?.getBoundingClientRect();
    if (!rect) return;
    const tw = tipRef.current?.offsetWidth ?? 160;
    const th = tipRef.current?.offsetHeight ?? 56;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const x = px + 14 + tw > rect.width - 4 ? px - 14 - tw : px + 14;
    const y = py + 14 + th > rect.height - 4 ? py - 14 - th : py + 14;
    tipX.set(r2(clamp(x, 4, Math.max(4, rect.width - tw - 4))));
    tipY.set(r2(clamp(y, 4, Math.max(4, rect.height - th - 4))));
  };

  /* -------------------------------- speech ------------------------------- */

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const reading = (id: string) => {
    const v = valueOf(id);
    const r = regions.find((x) => x.id === id);
    if (!r) return "";
    if (v === null) return `${r.name}, no data`;
    return `${r.name}, ${full(v, stat)}, rank ${rankOf(id)} of ${ranked.length}`;
  };

  /* ------------------------------- picking ------------------------------- */

  const panAt = (id: string | null) => {
    const rect = frameEl?.getBoundingClientRect();
    if (!rect) return 0;
    const r = id ? regions.find((x) => x.id === id) : undefined;
    const share = r ? (centreOf(r)[0] - vx) / vw : 0.5;
    return panFrom(rect.left + share * rect.width, null);
  };

  const pick = (id: string | null) => {
    if (disabled || id === picked) return;
    audio.play("swish", {
      pitch: id === null ? 0.85 : picked === null ? 1.1 : 1,
      gain: 0.45,
      pan: panAt(id ?? picked),
    });
    if (value === undefined) setOwnValue(id);
    onValueChange?.(id);
    say(id ? `${reading(id)}.` : "Showing every region.");
  };

  const step = (d: number) => {
    if (ranked.length === 0) return;
    const i = picked ? ranked.findIndex((r) => r.id === picked) : -1;
    const next = ranked[(i + d + ranked.length) % ranked.length];
    if (next) pick(next.id);
  };

  /* -------------------------------- band --------------------------------- */

  const bandWidth = legend === "steps" ? 1 / n : 0.2;
  const [scrub, setScrub] = React.useState<Scrub>(null);
  const liveBand: [number, number] | null = scrub
    ? [scrub.lo, scrub.hi]
    : committedBand;
  const inBand = (v: number | null) => {
    if (!liveBand || v === null) return true;
    const [lo, hi] = liveBand;
    return (
      v >= lo - 1e-9 &&
      (v < hi - 1e-9 || (hi >= scale.hi - 1e-9 && v <= hi + 1e-9))
    );
  };
  const bandCount = liveBand
    ? known.filter((r) => inBand(valueOf(r.id))).length
    : 0;

  const bandFromShare = (centre: number): [number, number] => {
    const span = scale.hi - scale.lo;
    if (legend === "steps") {
      const c = clamp(Math.floor(centre * n), 0, n - 1);
      return [
        r6(scale.lo + c * scale.step),
        r6(scale.lo + (c + 1) * scale.step),
      ];
    }
    const left = clamp(centre - bandWidth / 2, 0, 1 - bandWidth);
    return [
      r6(scale.lo + left * span),
      r6(scale.lo + (left + bandWidth) * span),
    ];
  };

  const bandX = useMotionValue(
    committedBand ? shareOf(committedBand[0], scale) : 0,
  );
  const bandShown = useMotionValue(committedBand ? 1 : 0);
  const bandLeft = useTransform(bandX, (x) => `${r2(x * 100)}%`);

  const bandText = (b: [number, number] | null, count: number) =>
    b
      ? `${short(b[0], stat)} to ${short(b[1], stat)}, ${count} ${count === 1 ? "region" : "regions"}`
      : "No band";

  const setBand = (next: [number, number] | null, speak = true) => {
    if (disabled) return;
    if (band === undefined) setOwnBand(next);
    onBandChange?.(next);
    if (!speak) return;
    if (!next) {
      say("Band cleared.");
      return;
    }
    const count = known.filter((r) => {
      const v = valueOf(r.id);
      return v !== null && v >= next[0] - 1e-9 && v <= next[1] + 1e-9;
    }).length;
    say(`Band ${bandText(next, count)}.`);
  };

  // The bracket goes to the committed band whenever it changes from outside
  // a scrub — a key, a tap, the host — on snap.
  const bandKey = committedBand
    ? `${committedBand[0]}:${committedBand[1]}:${scale.lo}:${scale.hi}`
    : "none";
  const scrubbing = scrub !== null;
  React.useEffect(() => {
    if (scrubbing) return;
    if (!committedBand) {
      run(
        "bandShown",
        animate(bandShown, 0, { duration: durations.fast, ease: easings.exit }),
      );
      return;
    }
    const to = r6(shareOf(committedBand[0], scale));
    run(
      "bandShown",
      animate(bandShown, 1, { duration: durations.fast, ease: easings.enter }),
    );
    if (!motionSafe) {
      anims.current.get("bandX")?.stop();
      bandX.set(to);
    } else if (Math.abs(bandX.get() - to) > 1e-4) {
      run("bandX", animate(bandX, to, springs.snap));
    }
    // Keyed on the band's text form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandKey, scrubbing, motionSafe]);

  const lastPlip = React.useRef("");
  const scrubTo = (centre: number) => {
    const [lo, hi] = bandFromShare(centre);
    const key = `${lo}:${hi}`;
    // Within a class nothing changes; crossing into the next one is heard.
    const tick =
      legend === "steps" ? key : String(Math.floor(clamp(centre, 0, 1) * 10));
    if (tick !== lastPlip.current) {
      lastPlip.current = tick;
      audio.play("plip", {
        pitch: r2(0.8 + 0.6 * clamp(centre, 0, 1)),
        gain: 0.35,
        pan: 0,
      });
    }
    setScrub((s) => (s && s.lo === lo && s.hi === hi ? s : { lo, hi }));
  };

  const latest = React.useRef<Latest | null>(null);
  React.useEffect(() => {
    latest.current = { bandFromShare, scrubTo };
  });

  const barRef = React.useRef<HTMLDivElement | null>(null);
  const grip = React.useRef({ left: 0, width: 1 });
  const shareAt = (clientX: number) =>
    (clientX - grip.current.left) / Math.max(1, grip.current.width);

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || status !== "ready" || known.length === 0,
    onStart: ({ point }) => {
      const rect = barRef.current?.getBoundingClientRect();
      grip.current = { left: rect?.left ?? 0, width: rect?.width ?? 1 };
      anims.current.get("bandX")?.stop();
      run(
        "bandShown",
        animate(bandShown, 1, {
          duration: durations.blink,
          ease: easings.enter,
        }),
      );
      lastPlip.current = "";
      latest.current?.scrubTo(shareAt(point.x));
    },
    onMove: ({ point }) => {
      const centre = shareAt(point.x);
      const half = bandWidth / 2;
      // 1:1 under the finger, rubber-banded past the ends.
      const held = rubberClamp(centre, half, 1 - half, bandWidth);
      bandX.set(r6(held - half));
      latest.current?.scrubTo(clamp(centre, 0, 1));
    },
    onEnd: ({ point, velocity }) => {
      const centre = clamp(shareAt(point.x), 0, 1);
      const v = velocity.x / Math.max(1, grip.current.width);
      const landing =
        legend === "steps"
          ? clamp(project(centre, v, 0.99), 0, 0.9999)
          : centre;
      const next =
        latest.current?.bandFromShare(landing) ?? bandFromShare(landing);
      const to = r6(shareOf(next[0], scale));
      if (motionSafe) {
        run("bandX", animate(bandX, to, { ...springs.snap, velocity: v }));
      } else {
        bandX.set(to);
      }
      setScrub(null);
      setBand(next);
    },
    onCancel: () => setScrub(null),
    onTap: (event) => {
      const rect = barRef.current?.getBoundingClientRect();
      grip.current = { left: rect?.left ?? 0, width: rect?.width ?? 1 };
      const next = bandFromShare(clamp(shareAt(event.clientX), 0, 1));
      const same =
        committedBand &&
        Math.abs(committedBand[0] - next[0]) < 1e-9 &&
        Math.abs(committedBand[1] - next[1]) < 1e-9;
      audio.play("plip", { pitch: same ? 0.8 : 1.15, gain: 0.4 });
      setBand(same ? null : next);
    },
  });

  const onLegendKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || known.length === 0) return;
    const centre = committedBand
      ? shareOf((committedBand[0] + committedBand[1]) / 2, scale)
      : null;
    const moveTo = (c: number) => {
      const next = bandFromShare(clamp(c, 0, 0.9999));
      audio.play("plip", { pitch: r2(0.8 + 0.6 * clamp(c, 0, 1)), gain: 0.35 });
      setBand(next);
    };
    const unit = legend === "steps" ? 1 / n : 0.1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        moveTo(centre === null ? unit / 2 : centre + unit);
        return;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        moveTo(centre === null ? 1 - unit / 2 : centre - unit);
        return;
      case "PageUp":
        event.preventDefault();
        moveTo(centre === null ? 0.5 : centre + 2 * unit);
        return;
      case "PageDown":
        event.preventDefault();
        moveTo(centre === null ? 0.5 : centre - 2 * unit);
        return;
      case "Home":
        event.preventDefault();
        moveTo(bandWidth / 2);
        return;
      case "End":
        event.preventDefault();
        moveTo(1 - bandWidth / 2);
        return;
      case "Escape":
      case "Delete":
      case "Backspace":
        if (!committedBand) return;
        event.preventDefault();
        audio.play("plip", { pitch: 0.8, gain: 0.35 });
        setBand(null);
        return;
    }
  };

  /* ---------------------------- the map's keys ---------------------------- */

  const [active, setActive] = React.useState<string | null>(null);
  const [ringed, setRinged] = React.useState(false);
  const activeId =
    active && regions.some((r) => r.id === active)
      ? active
      : (picked ?? ranked[0]?.id ?? regions[0]?.id ?? null);

  const nearestToward = (dx: number, dy: number) => {
    const from = regions.find((r) => r.id === activeId);
    if (!from) return null;
    const [fx, fy] = centreOf(from);
    let best: string | null = null;
    let bestScore = Infinity;
    for (const r of regions) {
      if (r.id === from.id) continue;
      const [x, y] = centreOf(r);
      const along = (x - fx) * dx + (y - fy) * dy;
      if (along <= 1) continue;
      const across = Math.abs((x - fx) * dy - (y - fy) * dx);
      const score = along + 2 * across;
      if (score < bestScore) {
        bestScore = score;
        best = r.id;
      }
    }
    return best;
  };

  const onMapKey = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (disabled) return;
    const dir: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const d = dir[event.key];
    if (d) {
      event.preventDefault();
      const next = nearestToward(d[0], d[1]);
      if (next) {
        setActive(next);
        setHover(null);
        audio.play("plip", { pitch: 1.3, gain: 0.2, pan: panAt(next) });
      }
      return;
    }
    switch (event.key) {
      case "Home":
      case "End": {
        event.preventDefault();
        const r = event.key === "Home" ? ranked[0] : ranked[ranked.length - 1];
        if (r) setActive(r.id);
        return;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        if (activeId) pick(activeId);
        return;
      case "Escape":
        if (picked) {
          event.preventDefault();
          pick(null);
        } else if (committedBand) {
          event.preventDefault();
          setBand(null);
        }
        return;
    }
  };

  /* ------------------------------- metrics ------------------------------- */

  const chooseMetric = (id: string, el: Element | null) => {
    if (disabled || id === metricId) return;
    const rect = el?.getBoundingClientRect();
    audio.play("plip", {
      pitch: 1.05,
      gain: 0.35,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    if (metric === undefined) setOwnMetric(id);
    onMetricChange?.(id);
    // A band is in the old metric's units: it goes with it.
    if (committedBand) setBand(null, false);
    const s = stats.find((x) => x.id === id);
    say(`Coloured by ${(s?.label ?? id).toLowerCase()}.`);
  };
  const metricNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const onMetricKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const i = stats.findIndex((s) => s.id === metricId);
    const go = (j: number) => {
      const s = stats[(j + stats.length) % stats.length];
      if (!s) return;
      event.preventDefault();
      const node = metricNodes.current.get(s.id) ?? null;
      node?.focus();
      chooseMetric(s.id, node);
    };
    if (event.key === "ArrowRight" || event.key === "ArrowDown") go(i + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") go(i - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(stats.length - 1);
  };

  /* ------------------------------ the ranking ----------------------------- */

  const [showAll, setShowAll] = React.useState(false);
  const [rowFocus, setRowFocus] = React.useState<string | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const rowStop =
    rowFocus && ranked.some((r) => r.id === rowFocus)
      ? rowFocus
      : (ranked[0]?.id ?? null);
  const onRowKey = (event: React.KeyboardEvent<HTMLElement>, id: string) => {
    const list = ranked;
    const i = list.findIndex((r) => r.id === id);
    const go = (j: number) => {
      const r = list[clamp(j, 0, list.length - 1)];
      if (!r) return;
      event.preventDefault();
      setRowFocus(r.id);
      if (!showAll && clamp(j, 0, list.length - 1) >= 5) setShowAll(true);
      requestAnimationFrame(() => rowNodes.current.get(r.id)?.focus());
    };
    if (event.key === "ArrowDown") go(i + 1);
    else if (event.key === "ArrowUp") go(i - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(list.length - 1);
  };

  /* -------------------------------- render ------------------------------- */

  const pickedRegion = picked
    ? regions.find((r) => r.id === picked)
    : undefined;
  const hoverRegion = hover ? regions.find((r) => r.id === hover) : undefined;
  const activeRegion = activeId
    ? regions.find((r) => r.id === activeId)
    : undefined;
  const fillFor = (id: string) => {
    const v = valueOf(id);
    return v === null
      ? "var(--bg-2)"
      : fillOf(toneOf(v, scale, legend), scheme);
  };
  const liftScale = useTransform(lift, (l) => r2(1 + 0.03 * l));
  const shadowY = useTransform(
    [lift, camK] as MotionValue<number>[],
    ([l = 0, k = 1]: number[]) => r2((4 * l) / k),
  );
  const shadowOpacity = useTransform(lift, (l) => r2(0.9 * l));
  const bracketOpacity = useTransform(bandShown, (o) => r2(o));

  /** A name shows where it fits its region and sits wholly inside the frame, judged at the camera's destination. */
  const labelFits = (r: RegionMapRegion) => {
    const [, , bw] = boxOf(r);
    const cw = vw / target.k;
    const chh = vh / target.k;
    const s = Math.min(frame.w / cw, frame.h / chh);
    const text = r.name.length * 6.2;
    if (bw * s < text + 10) return false;
    const [lx, ly] = centreOf(r);
    const sx = (frame.w - s * cw) / 2 + (lx - (target.x - cw / 2)) * s;
    const sy = (frame.h - s * chh) / 2 + (ly - (target.y - chh / 2)) * s;
    return (
      sx - text / 2 >= 4 &&
      sx + text / 2 <= frame.w - 4 &&
      sy >= 10 &&
      sy <= frame.h - 10
    );
  };

  const legendTicks: number[] =
    legend === "steps"
      ? Array.from({ length: n + 1 }, (_, i) => r6(scale.lo + i * scale.step))
      : [scale.lo, r6((scale.lo + scale.hi) / 2), scale.hi];

  const tone = (t: number) => fillOf(t, scheme);
  const gradient = `linear-gradient(to right, ${[0, 0.2, 0.4, 0.6, 0.8, 1]
    .map((u) => tone(diverging ? u * 2 - 1 : u))
    .join(", ")})`;

  const total = known.reduce((s, r) => s + (valueOf(r.id) ?? 0), 0);
  const sorted = known.map((r) => valueOf(r.id) ?? 0).sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2
        ? (sorted[(sorted.length - 1) / 2] ?? 0)
        : ((sorted[sorted.length / 2 - 1] ?? 0) +
            (sorted[sorted.length / 2] ?? 0)) /
          2;
  const additive =
    (stat?.kind ?? "count") === "count" || stat?.kind === "money";

  const metricSwitch = (
    <div
      role="radiogroup"
      aria-label="Colour the map by"
      onKeyDown={onMetricKey}
      className="grid grid-cols-2 gap-1 rounded-2 bg-surface-2 p-0.5 @min-[30rem]:flex"
    >
      {stats.map((s) => {
        const on = s.id === metricId;
        return (
          <button
            key={s.id}
            ref={(node) => {
              if (node) metricNodes.current.set(s.id, node);
              else metricNodes.current.delete(s.id);
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={(event) => chooseMetric(s.id, event.currentTarget)}
            className={cn(
              "relative inline-flex h-7 min-w-0 items-center justify-center rounded-[5px] px-2.5 text-xs whitespace-nowrap transition-colors",
              FOCUS_RING,
              on
                ? "text-foreground"
                : "text-ink-2 enabled:hover:text-foreground",
              "disabled:cursor-not-allowed",
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-metric`}
                className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_14%,transparent)]"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative truncate">{s.label}</span>
          </button>
        );
      })}
    </div>
  );

  const rankingRows = ranked.map((r, i) => {
    const v = valueOf(r.id) ?? 0;
    const lit = inBand(v);
    const hidden = !showAll && i >= 5;
    return (
      <li key={r.id} className={cn(hidden && "hidden @min-[40rem]:block")}>
        <button
          ref={(node) => {
            if (node) rowNodes.current.set(r.id, node);
            else rowNodes.current.delete(r.id);
          }}
          type="button"
          tabIndex={rowStop === r.id ? 0 : -1}
          disabled={disabled}
          aria-label={`${reading(r.id)}${liveBand && lit ? ", in the band" : ""}`}
          onFocus={() => {
            setRowFocus(r.id);
            setHover(r.id);
          }}
          onBlur={() => setHover(null)}
          onPointerEnter={() => setHover(r.id)}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(event) => onRowKey(event, r.id)}
          onClick={() => pick(r.id)}
          className={cn(
            "grid h-8 w-full grid-cols-[1.25rem_0.625rem_minmax(0,1fr)_auto] items-center gap-2 rounded-2 px-1.5 text-left text-[12px] transition-[background-color,opacity]",
            FOCUS_IN,
            hover === r.id ? "bg-surface-2" : "enabled:hover:bg-surface-2",
            liveBand && !lit && "opacity-45",
            "disabled:cursor-not-allowed",
          )}
        >
          <span className="text-right font-mono text-[10px] text-ink-3 tabular-nums">
            {i + 1}
          </span>
          <span
            aria-hidden
            className="size-2.5 rounded-full ring-1 ring-hairline-strong"
            style={{ background: fillFor(r.id) }}
          />
          <span className="min-w-0">
            <span className="block truncate text-foreground">{r.name}</span>
            <span
              aria-hidden
              className="mt-0.5 block h-0.5 rounded-full bg-surface-2"
            >
              <span
                className="block h-full rounded-full bg-cobalt-bright/70 transition-[width] duration-300"
                style={{
                  width: `${Math.round((Math.abs(v) / topValue) * 100)}%`,
                }}
              />
            </span>
          </span>
          <span className="font-mono text-[11px] text-ink-2 tabular-nums">
            {short(v, stat)}
          </span>
        </button>
      </li>
    );
  });

  const pickedDatum = picked ? byRegion.get(picked) : undefined;
  const details = pickedRegion ? (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-label="Previous region"
          disabled={disabled}
          onClick={() => step(-1)}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-foreground">
            {pickedRegion.name}
          </p>
          <p className="font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
            {valueOf(pickedRegion.id) === null
              ? "no data"
              : `rank ${rankOf(pickedRegion.id)} of ${ranked.length}`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Next region"
          disabled={disabled}
          onClick={() => step(1)}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
      {stat && pickedDatum ? (
        <div className="rounded-3 border border-hairline px-3 py-2.5">
          <p className="text-[11px] text-ink-3">{stat.label}</p>
          <p className="font-mono text-xl leading-tight font-semibold text-foreground tabular-nums">
            {valueOf(pickedRegion.id) === null
              ? "—"
              : full(valueOf(pickedRegion.id) ?? 0, stat)}
          </p>
          <Sparkline
            values={pickedDatum.trends?.[stat.id] ?? []}
            className="mt-1.5"
          />
          <p className="mt-0.5 flex justify-between font-mono text-[10px] text-ink-3">
            <span>12 months</span>
            <span>now</span>
          </p>
        </div>
      ) : null}
      <dl className="flex flex-col">
        {stats.map((s) => {
          const v = pickedDatum?.values[s.id];
          const all = regions
            .map((r) => byRegion.get(r.id)?.values[s.id])
            .filter((x): x is number => typeof x === "number");
          const rank =
            typeof v === "number" ? all.filter((x) => x > v).length + 1 : 0;
          const top = Math.max(1e-9, ...all.map((x) => Math.abs(x)));
          return (
            <div
              key={s.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-hairline py-1.5 first:border-t-0"
            >
              <dt className="truncate text-[12px] text-ink-2">{s.label}</dt>
              <dd className="font-mono text-[12px] text-foreground tabular-nums">
                {typeof v === "number" ? full(v, s) : "—"}
              </dd>
              <dd className="col-span-2 mt-1 flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-1 flex-1 rounded-full bg-surface-2"
                >
                  <span
                    className="block h-full rounded-full bg-cobalt-bright/70"
                    style={{
                      width: `${typeof v === "number" ? Math.round((Math.abs(v) / top) * 100) : 0}%`,
                    }}
                  />
                </span>
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  {rank > 0 ? `#${rank}` : ""}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <button
        type="button"
        disabled={disabled}
        onClick={() => pick(null)}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 border border-hairline text-xs text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
          FOCUS_RING,
        )}
      >
        All regions
      </button>
    </div>
  ) : null;

  const summary = (
    <div className="hidden grid-cols-3 gap-1.5 pb-1 @min-[68rem]:grid">
      {[
        {
          k: additive ? "Total" : "Median",
          v: stat ? short(additive ? total : median, stat) : "—",
        },
        { k: "Top", v: ranked[0]?.name ?? "—" },
        { k: "In band", v: liveBand ? String(bandCount) : "—" },
      ].map((tile) => (
        <div
          key={tile.k}
          className="min-w-0 rounded-2 border border-hairline px-2 py-1.5"
        >
          <p className="font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
            {tile.k}
          </p>
          <p className="truncate text-[12px] font-medium text-foreground">
            {tile.v}
          </p>
        </div>
      ))}
    </div>
  );

  const panel = (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={pickedRegion ? `r-${pickedRegion.id}` : "ranking"}
        initial={{ opacity: 0, x: motionSafe ? distances.step : 0 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={{
          opacity: { duration: durations.base, ease: easings.enter },
          x: motionSafe ? springs.glide : { duration: 0 },
        }}
      >
        {pickedRegion ? (
          details
        ) : (
          <div className="flex flex-col gap-1.5">
            {summary}
            <p className="flex items-center justify-between px-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <span>By {stat?.label.toLowerCase() ?? "value"}</span>
              <span>{ranked.length} regions</span>
            </p>
            <ol role="list" className="flex flex-col">
              {rankingRows}
            </ol>
            {ranked.length > 5 ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className={cn(
                  "inline-flex h-7 items-center self-start rounded-2 px-1.5 text-xs text-cobalt-bright transition-colors hover:bg-surface-2 @min-[40rem]:hidden",
                  FOCUS_RING,
                )}
              >
                {showAll ? "Show top 5" : `Show all ${ranked.length}`}
              </button>
            ) : null}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );

  let mapBody: React.ReactNode;
  if (status === "loading") {
    mapBody = (
      <div
        aria-hidden
        className="absolute inset-0 bg-surface-2 motion-safe:animate-pulse"
      />
    );
  } else if (status === "error") {
    mapBody = (
      <div className="absolute inset-0 flex flex-col items-center-safe justify-center-safe gap-2 p-4 text-center">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-warn" />
          The map&apos;s numbers didn&apos;t load.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors enabled:hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    );
  } else {
    mapBody = (
      <>
        <svg
          ref={svgRef}
          role="listbox"
          aria-label={`${label ?? title}: regions coloured by ${stat?.label.toLowerCase() ?? "value"}. Arrow keys move between regions, Enter picks one.`}
          aria-activedescendant={activeId ? `${uid}-r-${activeId}` : undefined}
          tabIndex={disabled ? -1 : 0}
          viewBox={startViewBox}
          preserveAspectRatio="xMidYMid meet"
          onKeyDown={onMapKey}
          onFocus={(event) => {
            setRinged(event.currentTarget.matches(":focus-visible"));
          }}
          onBlur={() => setRinged(false)}
          onPointerMove={(event) => {
            if (event.pointerType !== "mouse") return;
            const id =
              (event.target as Element)
                .closest("[data-region]")
                ?.getAttribute("data-region") ?? null;
            if (id !== hover) setHover(id);
            if (id) placeTip(event.clientX, event.clientY);
          }}
          onPointerLeave={() => setHover(null)}
          onClick={(event) => {
            const id =
              (event.target as Element)
                .closest("[data-region]")
                ?.getAttribute("data-region") ?? null;
            if (id) {
              setActive(id);
              pick(id);
            } else if (picked) {
              pick(null);
            }
          }}
          className={cn(
            "absolute inset-0 block size-full touch-manipulation select-none",
            FOCUS_IN,
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          {/* Shallows: the regions' own outlines, stroked wide under the
              land. As a group, so overlapping strokes do not darken. */}
          <g opacity={0.5} aria-hidden>
            {[30, 16].map((w) => (
              <g
                key={w}
                fill="none"
                strokeWidth={w}
                strokeLinejoin="round"
                style={{
                  stroke: `color-mix(in oklab, var(--accent-bright) ${w === 30 ? 7 : 12}%, var(--bg-2))`,
                }}
              >
                {regions.map((r) => (
                  <path key={r.id} d={r.d} />
                ))}
              </g>
            ))}
          </g>
          <g aria-hidden>
            {regions.map((r) => (
              <path
                key={r.id}
                d={r.d}
                fill="none"
                strokeWidth={2.4}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{
                  stroke:
                    "color-mix(in oklab, var(--foreground) 30%, transparent)",
                }}
              />
            ))}
          </g>
          <g>
            {regions.map((r) => {
              const v = valueOf(r.id);
              const dim = (pickedRegion && picked !== r.id) || !inBand(v);
              return (
                <path
                  key={r.id}
                  ref={(node) => {
                    if (node) pathNodes.current.set(r.id, node);
                    else pathNodes.current.delete(r.id);
                  }}
                  id={`${uid}-r-${r.id}`}
                  role="option"
                  aria-selected={picked === r.id}
                  aria-label={`${reading(r.id)}${liveBand && inBand(v) && v !== null ? ", in the band" : ""}`}
                  data-region={r.id}
                  d={r.d}
                  strokeWidth={1}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  style={{
                    fill: fillFor(r.id),
                    stroke: "var(--card)",
                    opacity: dim ? (liveBand && !inBand(v) ? 0.22 : 0.5) : 1,
                    transition: "fill 240ms linear, opacity 240ms linear",
                  }}
                />
              );
            })}
          </g>
          {pickedRegion ? (
            <g aria-hidden pointerEvents="none">
              <motion.path
                d={pickedRegion.d}
                style={{
                  y: shadowY,
                  opacity: shadowOpacity,
                  fill: "color-mix(in oklab, black 26%, transparent)",
                }}
              />
              <motion.path
                data-region={pickedRegion.id}
                d={pickedRegion.d}
                strokeWidth={1.5}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{
                  scale: liftScale,
                  originX: 0.5,
                  originY: 0.5,
                  fill: fillFor(pickedRegion.id),
                  stroke: "var(--foreground)",
                }}
              />
            </g>
          ) : null}
          {hoverRegion && hoverRegion.id !== picked ? (
            <path
              aria-hidden
              pointerEvents="none"
              d={hoverRegion.d}
              fill="none"
              strokeWidth={1.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ stroke: "var(--foreground)" }}
            />
          ) : null}
          {ringed && activeRegion ? (
            <path
              aria-hidden
              pointerEvents="none"
              d={activeRegion.d}
              fill="none"
              strokeWidth={2.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ stroke: "var(--ring)" }}
            />
          ) : null}
        </svg>

        {regions.map((r) => (
          <MapLabel
            key={r.id}
            name={r.name}
            at={centreOf(r)}
            cam={{ x: camX, y: camY, k: camK }}
            view={viewBox}
            frame={frame}
            shown={labelFits(r) && (!liveBand || inBand(valueOf(r.id)))}
            strong={picked === r.id}
          />
        ))}

        <AnimatePresence>
          {hoverRegion && stat ? (
            <motion.div
              ref={tipRef}
              key="tip"
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 z-10 w-44 rounded-3 border border-hairline-strong bg-popover px-2.5 py-2 shadow-[0_8px_20px_color-mix(in_oklab,black_16%,transparent)]"
              style={{ x: tipX, y: tipY }}
              initial={{ opacity: 0, scale: motionSafe ? 0.96 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                opacity: { duration: durations.fast, ease: easings.enter },
                scale: motionSafe ? springs.flick : { duration: 0 },
              }}
            >
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full ring-1 ring-hairline-strong"
                  style={{ background: fillFor(hoverRegion.id) }}
                />
                <span className="truncate">{hoverRegion.name}</span>
              </p>
              {valueOf(hoverRegion.id) === null ? (
                <p className="mt-0.5 text-[11px] text-ink-3">No data</p>
              ) : (
                <>
                  <p className="mt-0.5 font-mono text-[13px] text-foreground tabular-nums">
                    {full(valueOf(hoverRegion.id) ?? 0, stat)}
                  </p>
                  <p className="mt-1 flex items-center gap-2 font-mono text-[10px] text-ink-3">
                    <span className="h-1 flex-1 rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full bg-cobalt-bright/70"
                        style={{
                          width: `${Math.round((Math.abs(valueOf(hoverRegion.id) ?? 0) / topValue) * 100)}%`,
                        }}
                      />
                    </span>
                    #{rankOf(hoverRegion.id)} of {ranked.length}
                  </p>
                </>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {pickedRegion ? (
          <button
            type="button"
            aria-label="Show every region"
            disabled={disabled}
            onClick={() => pick(null)}
            className={cn(
              "absolute top-2 right-2 z-10 inline-flex h-7 items-center gap-1 rounded-full border border-hairline-strong bg-popover/90 pr-2.5 pl-2 text-xs text-ink-2 backdrop-blur-sm transition-colors enabled:hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
            All
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div
      role="region"
      aria-label={label ?? title}
      className={cn(
        "@container flex w-full [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card p-3 text-foreground @min-[40rem]:p-4",
        disabled && "opacity-70",
        className,
      )}
      style={{ maxHeight }}
    >
      <header className="flex flex-col gap-2.5 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {subtitle ? (
            <p className="truncate text-xs text-ink-3">{subtitle}</p>
          ) : null}
        </div>
        {metricSwitch}
      </header>

      <div className="grid gap-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[68rem]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div
            ref={setFrameEl}
            className="relative aspect-[3/2] w-full overflow-clip rounded-3 border border-hairline bg-[color-mix(in_oklab,var(--accent-bright)_7%,var(--bg-2))] @min-[68rem]:aspect-[2/1]"
          >
            {mapBody}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex h-6 items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-ink-3">
                {stat?.label ?? "Value"}
                {legend === "steps" ? `, ${n} classes` : ""}
              </span>
              {liveBand ? (
                <span className="flex shrink-0 items-center gap-1 text-ink-2">
                  <span className="font-mono tabular-nums">
                    {bandCount} {bandCount === 1 ? "region" : "regions"}
                  </span>
                  <button
                    type="button"
                    aria-label="Clear the band"
                    disabled={disabled}
                    onClick={() => {
                      audio.play("plip", { pitch: 0.8, gain: 0.35 });
                      setBand(null);
                    }}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-2 text-ink-3 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </span>
              ) : (
                <span className="shrink-0 text-ink-3">
                  Drag to highlight a band
                </span>
              )}
            </div>
            <div
              ref={barRef}
              role="slider"
              tabIndex={disabled || status !== "ready" ? -1 : 0}
              aria-label={`Highlight a band of ${stat?.label.toLowerCase() ?? "values"}`}
              aria-valuemin={0}
              aria-valuemax={legend === "steps" ? n : 100}
              aria-valuenow={
                committedBand
                  ? legend === "steps"
                    ? classOf(
                        (committedBand[0] + committedBand[1]) / 2,
                        scale,
                      ) + 1
                    : Math.round(
                        shareOf(
                          (committedBand[0] + committedBand[1]) / 2,
                          scale,
                        ) * 100,
                      )
                  : 0
              }
              aria-valuetext={bandText(
                committedBand,
                committedBand ? bandCount : 0,
              )}
              aria-disabled={disabled || undefined}
              onKeyDown={onLegendKey}
              {...drag}
              className={cn(
                "relative h-4 touch-pan-y rounded-full select-none",
                FOCUS_RING,
                disabled ? "cursor-not-allowed" : "cursor-ew-resize",
              )}
            >
              <div className="absolute inset-0 flex overflow-clip rounded-full ring-1 ring-hairline ring-inset">
                {legend === "steps" ? (
                  Array.from({ length: n }, (_, c) => {
                    const mid = (n - 1) / 2;
                    const t = diverging
                      ? mid > 0
                        ? (c - mid) / mid
                        : 0
                      : n > 1
                        ? c / (n - 1)
                        : 1;
                    return (
                      <span
                        key={c}
                        className="h-full flex-1 border-l border-card first:border-l-0"
                        style={{ background: tone(t) }}
                      />
                    );
                  })
                ) : (
                  <span
                    className="h-full flex-1"
                    style={{ background: gradient }}
                  />
                )}
              </div>
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-y-1 rounded-2 border-2 border-foreground shadow-[0_2px_6px_color-mix(in_oklab,black_20%,transparent)]"
                style={{
                  left: bandLeft,
                  width: `${r2(bandWidth * 100)}%`,
                  opacity: bracketOpacity,
                }}
              />
            </div>
            <div className="relative h-3 font-mono text-[10px] text-ink-3 tabular-nums">
              {legendTicks.map((v, i) => (
                <span
                  key={`${i}-${v}`}
                  className={cn(
                    "absolute top-0 leading-none whitespace-nowrap",
                    i === 0
                      ? "left-0"
                      : i === legendTicks.length - 1
                        ? "right-0"
                        : "-translate-x-1/2",
                    legend === "steps" &&
                      n > 4 &&
                      i % 2 === 1 &&
                      i !== legendTicks.length - 1 &&
                      "hidden @min-[30rem]:inline",
                  )}
                  style={
                    i === 0 || i === legendTicks.length - 1
                      ? undefined
                      : { left: `${r2(shareOf(v, scale) * 100)}%` }
                  }
                >
                  {stat ? short(v, stat) : v}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative @min-[40rem]:min-w-0">
          <div className="@min-[40rem]:absolute @min-[40rem]:inset-0 @min-[40rem]:[scrollbar-width:thin] @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain">
            {status === "ready" ? (
              panel
            ) : (
              <div aria-hidden className="flex flex-col gap-2 py-1">
                {Array.from({ length: 6 }, (_, i) => (
                  <span
                    key={i}
                    className="h-6 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
