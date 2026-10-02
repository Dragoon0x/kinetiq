"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FunnelStage = {
  id: string;
  /** The stage's name: "Signed up". */
  label: string;
};

export type FunnelSegment = {
  id: string;
  /** The segment switch's label: "Mobile". */
  label: string;
  /** People who reached each stage, in stage order. */
  counts: number[];
  /** Median hours from the stage before to each stage (the first is ignored). */
  medianHours?: number[];
  /** Why people left at each stage, in stage order (the last is ignored). */
  reasons?: string[];
};

export type FunnelStatus = "ready" | "loading" | "error";

export type FunnelFlowProps = {
  /** How many particles run the funnel at once, 20 to 200. @default 100 */
  particles?: number;
  /** Controlled segment: which of `segments` the flow is weighted by. */
  segment?: string;
  /** Initial segment when uncontrolled. @default the first segment */
  defaultSegment?: string;
  /** Fires from the segment switch with the new segment's id. */
  onSegmentChange?: (id: string) => void;
  /** How fast the particles run, as a multiple of 64px a second. @default 1 */
  speed?: number;
  /** The stages, in order. @default defaultFunnelStages */
  stages?: FunnelStage[];
  /** The segments the flow can be weighted by. @default defaultFunnelSegments */
  segments?: FunnelSegment[];
  /** Controlled pinned stage: frozen, with its details shown, until unpinned. Null for none. */
  stage?: string | null;
  /** Initial pinned stage when uncontrolled. @default null */
  defaultStage?: string | null;
  /** Fires from the press or key that pinned or unpinned a stage. */
  onStageChange?: (id: string | null) => void;
  /** Seeds the particles' lanes, so a page always draws the same flow. @default 7 */
  seed?: number;
  /** Formats a count of people. @default grouped digits in `locale` */
  format?: (count: number) => string;
  /** The locale for counts. @default "en-US" */
  locale?: string;
  /** Whether the numbers have arrived. @default "ready" */
  status?: FunnelStatus;
  /** "Try again" was pressed after the numbers failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Conversion" */
  title?: string;
  /** A quieter line under the heading. */
  subtitle?: string;
  /** The funnel's accessible name. @default the title */
  label?: string;
  /** Play the swish and plips. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultFunnelStages: FunnelStage[] = [
  { id: "visited", label: "Visited" },
  { id: "signed-up", label: "Signed up" },
  { id: "activated", label: "Activated" },
  { id: "subscribed", label: "Subscribed" },
  { id: "renewed", label: "Renewed" },
];

/**
 * September's trial funnel for Fieldline: the three segments add up to All,
 * and each leaks somewhere different — mobile at activation, partners at
 * sign-up.
 */
export const defaultFunnelSegments: FunnelSegment[] = [
  {
    id: "all",
    label: "All",
    counts: [48200, 12400, 5240, 1980, 1130],
    medianHours: [0, 0.4, 26, 70, 720],
    reasons: [
      "Left from the pricing page",
      "Never connected a project",
      "Trial ran out",
      "Cancelled at renewal",
    ],
  },
  {
    id: "web",
    label: "Web",
    counts: [26100, 7600, 3480, 1290, 760],
    medianHours: [0, 0.3, 19, 64, 720],
    reasons: [
      "Bounced from pricing",
      "Skipped the setup guide",
      "Trial ran out",
      "Cancelled at renewal",
    ],
  },
  {
    id: "mobile",
    label: "Mobile",
    counts: [17400, 3800, 1240, 520, 270],
    medianHours: [0, 0.6, 41, 88, 720],
    reasons: [
      "Closed the store page",
      "Stuck on the email check",
      "Never opened it on a desktop",
      "Payment failed",
    ],
  },
  {
    id: "partner",
    label: "Partner",
    counts: [4700, 1000, 520, 170, 100],
    medianHours: [0, 1.2, 30, 96, 720],
    reasons: [
      "Sent the wrong audience",
      "Waited on an admin",
      "Trial ran out",
      "Moved to a yearly plan elsewhere",
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Geometry                                 */
/* ----------------------------------------------------------------------- */

/**
 * The funnel is drawn in flow space: `s` runs along the flow, `c` across
 * it. The same geometry lies on its side on a wide box and stands up on a
 * phone; only the mapping from (s, c) to (x, y) changes, so particles keep
 * their places when the layout turns.
 */
type Layout = {
  w: number;
  h: number;
  /** Where the first and last stage sit along the flow. */
  s0: number;
  s1: number;
  /** Where the lead-in starts. */
  lead: number;
  /** How far past the last stage the flow runs out. */
  exit: number;
  /** The flow's axis, and the tallest stage. */
  mid: number;
  max: number;
  /** Where the drop-off branches end. */
  drop: number;
  /** A stage bar's thickness along the flow. */
  bar: number;
  /** A particle's radius. */
  dot: number;
  vertical: boolean;
};

const ROW: Layout = {
  w: 720,
  h: 320,
  s0: 44,
  s1: 676,
  lead: 6,
  exit: 30,
  mid: 136,
  max: 168,
  drop: 270,
  bar: 12,
  dot: 1.7,
  vertical: false,
};

/** Standing up, the labels take a column on the left and losses peel right. */
const COL: Layout = {
  w: 320,
  h: 440,
  s0: 30,
  s1: 400,
  lead: 4,
  exit: 30,
  mid: 170,
  max: 120,
  drop: 304,
  bar: 10,
  dot: 1.6,
  vertical: true,
};

type Geo = {
  L: Layout;
  n: number;
  at: number[];
  h: number[];
  top: number[];
  gap: number;
};

function geoFor(L: Layout, counts: number[]): Geo {
  const n = counts.length;
  const first = Math.max(1, counts[0] ?? 1);
  const h = counts.map((v) => Math.max(2.5, (L.max * Math.max(0, v)) / first));
  const top = h.map((x) => L.mid - x / 2);
  const gap = n <= 1 ? L.s1 - L.s0 : (L.s1 - L.s0) / (n - 1);
  const at = counts.map((_, i) => L.s0 + i * gap);
  return { L, n, at, h, top, gap };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (t: number) => t * t * (3 - 2 * t);

const pt = (L: Layout, s: number, c: number) =>
  L.vertical ? `${r2(c)} ${r2(s)}` : `${r2(s)} ${r2(c)}`;

/** The drop branch's centre line and width at t: a curve that peels off and sinks. */
function dropAt(g: Geo, i: number, t: number) {
  const { L } = g;
  const hi = g.h[i] ?? 0;
  const next = g.h[i + 1] ?? 0;
  const d = Math.max(0, hi - next);
  const s0 = (g.at[i] ?? 0) + L.bar / 2;
  const c0 = (g.top[i] ?? 0) + next + d / 2;
  const p1s = s0 + g.gap * 0.3;
  const p2s = s0 + g.gap * 0.44;
  const p2c = c0 + (L.drop - c0) * 0.6;
  const p3s = s0 + g.gap * 0.48;
  const u = 1 - t;
  const s =
    u * u * u * s0 +
    3 * u * u * t * p1s +
    3 * u * t * t * p2s +
    t * t * t * p3s;
  const c =
    u * u * u * c0 +
    3 * u * u * t * c0 +
    3 * u * t * t * p2c +
    t * t * t * L.drop;
  const ds =
    3 * u * u * (p1s - s0) + 6 * u * t * (p2s - p1s) + 3 * t * t * (p3s - p2s);
  const dc = 6 * u * t * (p2c - c0) + 3 * t * t * (L.drop - p2c);
  const len = Math.sqrt(ds * ds + dc * dc) || 1;
  return {
    s,
    c,
    ns: -dc / len,
    nc: ds / len,
    w: Math.max(0.6, d * (1 - 0.65 * t)),
  };
}

/** A rough arc length for a drop branch, for particle speed. */
const dropLength = (g: Geo, i: number) => {
  const c0 = (g.top[i] ?? 0) + (g.h[i + 1] ?? 0);
  return 1.15 * Math.sqrt((g.gap * 0.48) ** 2 + (g.L.drop - c0) ** 2);
};

type Shapes = {
  lead: string;
  exit: string;
  bars: string;
  barOn: string;
  bands: string;
  bandOn: string;
  drops: string;
  dropOn: string;
};

function shapesFor(g: Geo, active: number): Shapes {
  const { L } = g;
  const out: Shapes = {
    lead: "",
    exit: "",
    bars: "",
    barOn: "",
    bands: "",
    bandOn: "",
    drops: "",
    dropOn: "",
  };
  const poly = (edgeA: string[], edgeB: string[]) =>
    `M ${edgeA.join(" L ")} L ${[...edgeB].reverse().join(" L ")} Z `;
  const h0 = g.h[0] ?? 0;
  const t0 = g.top[0] ?? 0;
  const firstIn = (g.at[0] ?? 0) - L.bar / 2;
  out.lead = poly(
    [pt(L, L.lead, t0), pt(L, firstIn, t0)],
    [pt(L, L.lead, t0 + h0), pt(L, firstIn, t0 + h0)],
  );
  const last = g.n - 1;
  const lastOut = (g.at[last] ?? 0) + L.bar / 2;
  const tl = g.top[last] ?? 0;
  const hl = g.h[last] ?? 0;
  out.exit = poly(
    [pt(L, lastOut, tl), pt(L, lastOut + L.exit, tl)],
    [pt(L, lastOut, tl + hl), pt(L, lastOut + L.exit, tl + hl)],
  );
  for (let i = 0; i < g.n; i += 1) {
    const at = g.at[i] ?? 0;
    const top = g.top[i] ?? 0;
    const h = g.h[i] ?? 0;
    const bar = poly(
      [pt(L, at - L.bar / 2, top), pt(L, at + L.bar / 2, top)],
      [pt(L, at - L.bar / 2, top + h), pt(L, at + L.bar / 2, top + h)],
    );
    if (i === active) out.barOn += bar;
    else out.bars += bar;
    if (i >= last) continue;
    const next = g.h[i + 1] ?? 0;
    const nTop = g.top[i + 1] ?? 0;
    const from = at + L.bar / 2;
    const to = (g.at[i + 1] ?? 0) - L.bar / 2;
    const a: string[] = [];
    const b: string[] = [];
    for (let k = 0; k <= 16; k += 1) {
      const t = k / 16;
      const s = lerp(from, to, t);
      const c = lerp(top, nTop, ease(t));
      a.push(pt(L, s, c));
      b.push(pt(L, s, c + next));
    }
    const band = poly(a, b);
    if (i === active) out.bandOn += band;
    else out.bands += band;
    if (h - next < 0.4) continue;
    const da: string[] = [];
    const db: string[] = [];
    for (let k = 0; k <= 16; k += 1) {
      const p = dropAt(g, i, k / 16);
      da.push(pt(L, p.s + (p.ns * p.w) / 2, p.c + (p.nc * p.w) / 2));
      db.push(pt(L, p.s - (p.ns * p.w) / 2, p.c - (p.nc * p.w) / 2));
    }
    const drop = poly(da, db);
    if (i === active) out.dropOn += drop;
    else out.drops += drop;
  }
  return out;
}

/* ----------------------------------------------------------------------- */
/*                                 Particles                                */
/* ----------------------------------------------------------------------- */

const LEAD = 0;
const BAR = 1;
const BAND = 2;
const DROP = 3;
const EXIT = 4;

type Particle = {
  phase: number;
  leg: number;
  t: number;
  /** Across the current bar or band, 0 to 1. */
  lane: number;
  pace: number;
  size: number;
};

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let v = Math.imul(s ^ (s >>> 15), 1 | s);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

const spawn = (rand: () => number): Particle => ({
  phase: LEAD,
  leg: 0,
  t: 0,
  lane: rand(),
  pace: 0.85 + rand() * 0.3,
  size: 0.8 + rand() * 0.4,
});

/** How long the particle's current leg is, in flow units. */
function legLength(g: Geo, p: Particle): number {
  const { L } = g;
  if (p.phase === LEAD) return Math.max(1, (g.at[0] ?? 0) - L.bar / 2 - L.lead);
  if (p.phase === BAR) return L.bar;
  if (p.phase === BAND) return Math.max(1, g.gap - L.bar);
  if (p.phase === DROP) return Math.max(1, dropLength(g, p.leg));
  return L.exit;
}

/**
 * One particle forward by `dist` flow units. At the end of a stage it goes
 * on if its lane falls inside the share that converted — the top `next / h`
 * of the bar — and peels into the drop branch otherwise, so the split of
 * dots is the conversion itself. Its lane is rescaled into whichever it
 * joins, so it keeps its place across.
 */
function advance(g: Geo, p: Particle, dist: number, rand: () => number) {
  p.t += dist / legLength(g, p);
  let guard = 0;
  while (p.t >= 1 && guard < 6) {
    guard += 1;
    const over = (p.t - 1) * legLength(g, p);
    if (p.phase === LEAD) {
      p.phase = BAR;
      p.leg = 0;
    } else if (p.phase === BAR) {
      if (p.leg >= g.n - 1) {
        p.phase = EXIT;
      } else {
        const share = (g.h[p.leg + 1] ?? 0) / Math.max(1e-6, g.h[p.leg] ?? 1);
        if (p.lane < share) {
          p.phase = BAND;
          p.lane = p.lane / Math.max(1e-6, share);
        } else {
          p.phase = DROP;
          p.lane = (p.lane - share) / Math.max(1e-6, 1 - share);
        }
      }
    } else if (p.phase === BAND) {
      p.phase = BAR;
      p.leg += 1;
    } else {
      Object.assign(p, spawn(rand));
    }
    p.t = over / legLength(g, p);
  }
}

/** Where a particle is, in flow space, and how strongly it shows. */
function locate(g: Geo, p: Particle): { s: number; c: number; alpha: number } {
  const { L } = g;
  const i = p.leg;
  const top = g.top[i] ?? 0;
  const h = g.h[i] ?? 0;
  if (p.phase === LEAD) {
    const from = L.lead;
    const to = (g.at[0] ?? 0) - L.bar / 2;
    return {
      s: lerp(from, to, p.t),
      c: (g.top[0] ?? 0) + p.lane * (g.h[0] ?? 0),
      alpha: clamp(p.t * 2.2, 0, 1),
    };
  }
  if (p.phase === BAR) {
    return {
      s: (g.at[i] ?? 0) - L.bar / 2 + p.t * L.bar,
      c: top + p.lane * h,
      alpha: 1,
    };
  }
  if (p.phase === BAND) {
    const next = g.h[i + 1] ?? 0;
    return {
      s: lerp((g.at[i] ?? 0) + L.bar / 2, (g.at[i + 1] ?? 0) - L.bar / 2, p.t),
      c: lerp(top, g.top[i + 1] ?? 0, ease(p.t)) + p.lane * next,
      alpha: 1,
    };
  }
  if (p.phase === DROP) {
    const d = dropAt(g, i, p.t);
    return {
      s: d.s + d.ns * (p.lane - 0.5) * d.w,
      c: d.c + d.nc * (p.lane - 0.5) * d.w,
      alpha: clamp(1.15 - p.t, 0, 1),
    };
  }
  const last = g.n - 1;
  return {
    s: (g.at[last] ?? 0) + L.bar / 2 + p.t * L.exit,
    c: (g.top[last] ?? 0) + p.lane * (g.h[last] ?? 0),
    alpha: clamp(1 - p.t, 0, 1),
  };
}

type Dots = {
  flow: string;
  faint: string;
  frozen: string;
  drop: string;
  dropFaint: string;
};

const circle = (x: number, y: number, r: number) =>
  `M ${r2(x - r)} ${r2(y)} a ${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0 a ${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0 `;

function drawDots(g: Geo, pool: Particle[], frozen: number): Dots {
  const out: Dots = {
    flow: "",
    faint: "",
    frozen: "",
    drop: "",
    dropFaint: "",
  };
  for (const p of pool) {
    const at = locate(g, p);
    if (at.alpha <= 0.05) continue;
    const [x, y] = g.L.vertical ? [at.c, at.s] : [at.s, at.c];
    const held = frozen >= 0 && p.leg === frozen && p.phase !== LEAD;
    const r = g.L.dot * p.size * (p.phase === DROP ? 1 - 0.45 * p.t : 1);
    const dot = circle(x, y, held ? r * 1.15 : r);
    if (held) out.frozen += dot;
    else if (p.phase === DROP) {
      if (at.alpha > 0.5) out.drop += dot;
      else out.dropFaint += dot;
    } else if (at.alpha > 0.6) out.flow += dot;
    else out.faint += dot;
  }
  return out;
}

/** A fresh pool, run forward so the funnel is already full when it shows. */
function warmPool(g: Geo, count: number, seed: number) {
  const rand = mulberry32(seed);
  const pool: Particle[] = [];
  for (let k = 0; k < count; k += 1) {
    const p = spawn(rand);
    // Each particle has been running for its own while: the flow is in
    // its steady state from the first frame.
    const age = rand() * 14;
    for (let t = 0; t < age; t += 1 / 20)
      advance(g, p, (64 * p.pace) / 20, rand);
    pool.push(p);
  }
  return { pool, rand };
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** A number that counts to its new value on the layout spring. */
function Count({
  value,
  format,
  motionSafe,
}: {
  value: number;
  format: (v: number) => string;
  motionSafe: boolean;
}) {
  const mv = useMotionValue(value);
  React.useEffect(() => {
    if (!motionSafe) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, springs.glide);
    return () => c.stop();
  }, [value, motionSafe, mv]);
  const text = useTransform(mv, (v) => format(v));
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                                The funnel                                */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Pigments: filled shapes keep their look in both themes. */
const FLOW = "oklch(from var(--accent-bright) 0.64 0.17 h)";
const LOSS = "oklch(from var(--danger) 0.66 0.19 h)";
const BARS = "oklch(from var(--ink-2) 0.62 0.03 h)";

const hoursText = (h: number) =>
  h < 1
    ? `${Math.max(1, Math.round(h * 60))} min`
    : h < 48
      ? `${Math.round(h)} h`
      : `${Math.round(h / 24)} days`;

type Said = { n: number; text: string };

/**
 * A conversion funnel drawn as a flow. Stages are bars whose length is the
 * people who reached them; between two stages a ribbon carries those who
 * went on, and from each stage a branch peels away and fades — its width is
 * the people lost there. A seeded pool of particles runs it: at each stage a
 * particle goes on only if its lane falls inside the share that converted,
 * so the dots split exactly as the people did.
 *
 * Pointing at a stage freezes it — its particles stop where they are and
 * brighten while the rest keep flowing — and the details under the funnel
 * swap to its count, conversion, losses, timing and the top reason people
 * left; a press pins it. The segment switch re-weights the flow: every
 * stage and branch glides to its new size on glide while particles already
 * in flight follow their lanes onto the new shapes.
 *
 * The particles run only while the funnel is on screen and the page is
 * visible, and not at all under reduced motion, where each ribbon holds a
 * still, seeded scatter of dots in the same proportions. The stages are a
 * list of buttons with full sentences for names: arrows move between them
 * (and freeze each), Enter pins, Escape unpins; the segment is a radio
 * group.
 */
export function FunnelFlow({
  particles = 100,
  segment,
  defaultSegment,
  onSegmentChange,
  speed = 1,
  stages = defaultFunnelStages,
  segments = defaultFunnelSegments,
  stage,
  defaultStage = null,
  onStageChange,
  seed = 7,
  format,
  locale = "en-US",
  status = "ready",
  onRetry,
  title = "Conversion",
  subtitle,
  label,
  sound = false,
  disabled = false,
  className,
}: FunnelFlowProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const detailId = `${uid}-detail`;
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const ready = status === "ready";
  const pool = clamp(Math.round(particles), 0, 400);
  const pace = clamp(speed, 0, 4);
  const S = stages.length;

  const countFmt = React.useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale],
  );
  const fmt = React.useCallback(
    (v: number) =>
      format ? format(Math.round(v)) : countFmt.format(Math.round(v)),
    [format, countFmt],
  );
  const pct = React.useCallback((v: number) => `${(v * 100).toFixed(1)}%`, []);

  /* ------------------------------- state -------------------------------- */

  const [ownSegment, setOwnSegment] = React.useState(
    defaultSegment ?? segments[0]?.id ?? "",
  );
  const segId = segment ?? ownSegment;
  const seg = segments.find((s) => s.id === segId) ?? segments[0];
  const counts = stages.map((_, i) => Math.max(0, seg?.counts[i] ?? 0));
  const countsKey = counts.join(",");

  const [ownStage, setOwnStage] = React.useState<string | null>(defaultStage);
  const pinnedId = stage !== undefined ? stage : ownStage;
  const pinned = stages.findIndex((s) => s.id === pinnedId);
  const [hovered, setHovered] = React.useState(-1);
  const [focused, setFocused] = React.useState(-1);
  const active = hovered >= 0 ? hovered : focused >= 0 ? focused : pinned;
  const [rove, setRove] = React.useState(0);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* -------------------------- the re-weighting -------------------------- */

  // The flow's shape is a blend of where it was and where the segment says
  // it is, by one value on the layout spring.
  const mix = useMotionValue(1);
  const [blend, setBlend] = React.useState({
    from: counts,
    to: counts,
    key: countsKey,
  });
  if (blend.key !== countsKey) {
    const k = clamp(mix.get(), 0, 1);
    setBlend({
      from: blend.to.map((v, i) => lerp(blend.from[i] ?? v, v, k)),
      to: counts,
      key: countsKey,
    });
  }
  const blendAt = (k: number) =>
    blend.to.map((v, i) => lerp(blend.from[i] ?? v, v, clamp(k, 0, 1.2)));

  React.useEffect(() => {
    mix.set(0);
    if (!motionSafe) {
      mix.set(1);
      return;
    }
    const c = animate(mix, 1, springs.glide);
    return () => {
      // Finish rather than freeze a re-weighting a re-run interrupts.
      c.stop();
      mix.set(1);
    };
  }, [blend, motionSafe, mix]);

  const rowShapes = useTransform(mix, (k) =>
    shapesFor(geoFor(ROW, blendAt(k)), active),
  );
  const colShapes = useTransform(mix, (k) =>
    shapesFor(geoFor(COL, blendAt(k)), active),
  );

  /* ------------------------------ particles ----------------------------- */

  const empty = "";
  const rowDots = {
    flow: useMotionValue(empty),
    faint: useMotionValue(empty),
    frozen: useMotionValue(empty),
    drop: useMotionValue(empty),
    dropFaint: useMotionValue(empty),
  };
  const colDots = {
    flow: useMotionValue(empty),
    faint: useMotionValue(empty),
    frozen: useMotionValue(empty),
    drop: useMotionValue(empty),
    dropFaint: useMotionValue(empty),
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const colRef = React.useRef<HTMLDivElement | null>(null);
  const sim = React.useRef<{
    pool: Particle[];
    rand: () => number;
  } | null>(null);
  const latest = React.useRef({
    blendAt,
    active,
    pace,
    rowDots,
    colDots,
  });
  React.useEffect(() => {
    latest.current = { blendAt, active, pace, rowDots, colDots };
  });

  /** Draws the pool into whichever layout is showing. */
  const paint = React.useCallback(() => {
    const s = sim.current;
    if (!s) return;
    const now = latest.current;
    const counts = now.blendAt(mix.get());
    const vertical = (colRef.current?.offsetWidth ?? 0) > 0;
    const g = geoFor(vertical ? COL : ROW, counts);
    const dots = drawDots(g, s.pool, now.active);
    const into = vertical ? now.colDots : now.rowDots;
    const other = vertical ? now.rowDots : now.colDots;
    for (const key of Object.keys(into) as (keyof Dots)[]) {
      into[key].set(dots[key]);
      other[key].set("");
    }
  }, [mix]);

  // A new pool for a new count or seed, warmed up before its first frame.
  React.useEffect(() => {
    if (!ready || pool === 0) {
      sim.current = null;
      for (const mv of [...Object.values(rowDots), ...Object.values(colDots)]) {
        mv.set("");
      }
      return;
    }
    const vertical = (colRef.current?.offsetWidth ?? 0) > 0;
    sim.current = warmPool(
      geoFor(vertical ? COL : ROW, latest.current.blendAt(1)),
      pool,
      seed,
    );
    paint();
    // The motion values are stable; the pool is rebuilt for these alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, seed, ready, paint]);

  // On screen and visible: the loop runs. Off screen, hidden, or under
  // reduced motion: it does not, and the last frame stays.
  const [onScreen, setOnScreen] = React.useState(true);
  const [pageVisible, setPageVisible] = React.useState(true);
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) setOnScreen(e.isIntersecting);
    });
    io.observe(node);
    const onVisibility = () => setPageVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const runs = motionSafe && ready && pool > 0 && onScreen && pageVisible;
  React.useEffect(() => {
    if (!runs) return;
    let raf = 0;
    let last = -1;
    const tick = (now: number) => {
      const s = sim.current;
      if (s) {
        const dt = last < 0 ? 0 : Math.min(0.05, (now - last) / 1000);
        const cur = latest.current;
        const counts = cur.blendAt(mix.get());
        const vertical = (colRef.current?.offsetWidth ?? 0) > 0;
        const g = geoFor(vertical ? COL : ROW, counts);
        for (const p of s.pool) {
          // A frozen stage holds its particles where they are.
          if (cur.active >= 0 && p.leg === cur.active && p.phase !== LEAD)
            continue;
          advance(g, p, 64 * cur.pace * p.pace * dt, s.rand);
        }
        paint();
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runs, mix, paint]);

  // Still: the scatter is redrawn when the shape or the frozen stage moves.
  React.useEffect(() => {
    if (runs) return;
    paint();
    return mix.on("change", () => paint());
  }, [runs, active, mix, paint]);

  // A layout that turns (phone ↔ wide) moves the dots with it.
  React.useEffect(() => {
    const row = rowRef.current;
    const col = colRef.current;
    if (!row || !col) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(row);
    ro.observe(col);
    return () => ro.disconnect();
  }, [paint, ready]);

  /* ------------------------------- actions ------------------------------ */

  const conversionAt = (i: number) =>
    i === 0 ? 1 : (counts[i] ?? 0) / Math.max(1, counts[i - 1] ?? 1);
  const lostAt = (i: number) =>
    i >= S - 1 ? 0 : Math.max(0, (counts[i] ?? 0) - (counts[i + 1] ?? 0));
  const stageName = (i: number) => {
    const st = stages[i];
    if (!st) return "";
    const parts = [`${st.label}, ${fmt(counts[i] ?? 0)} people`];
    if (i > 0)
      parts.push(`${pct(conversionAt(i))} of ${stages[i - 1]?.label ?? ""}`);
    if (i < S - 1)
      parts.push(`${pct(lostAt(i) / Math.max(1, counts[i] ?? 1))} dropped`);
    return parts.join(", ");
  };

  const plip = (i: number, el?: Element | null) => {
    const keep = i >= S - 1 ? 0.5 : 1 - lostAt(i) / Math.max(1, counts[i] ?? 1);
    const rect = el?.getBoundingClientRect();
    audio.play("plip", {
      pitch: r2(0.75 + keep * 0.9),
      gain: 0.5,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  const pin = (i: number, el?: Element | null) => {
    if (disabled) return;
    const id = i === pinned ? null : (stages[i]?.id ?? null);
    if (stage === undefined) setOwnStage(id);
    onStageChange?.(id);
    plip(i, el);
    say(id ? `${stages[i]?.label ?? ""} pinned.` : "Unpinned.");
  };

  const pickSegment = (id: string, el?: Element | null) => {
    if (disabled || id === seg?.id) return;
    if (segment === undefined) setOwnSegment(id);
    onSegmentChange?.(id);
    const rect = el?.getBoundingClientRect();
    audio.play("swish", {
      pitch: 1,
      gain: 0.45,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    const next = segments.find((s) => s.id === id);
    if (next) {
      const c = next.counts;
      const end = (c[S - 1] ?? 0) / Math.max(1, c[0] ?? 1);
      say(`${next.label}: ${pct(end)} end to end.`);
    }
  };

  const stageRefs = React.useRef(new Map<string, HTMLButtonElement>());

  /* ------------------------------- render ------------------------------- */

  const endToEnd = (counts[S - 1] ?? 0) / Math.max(1, counts[0] ?? 1);
  // The first stage's bounce is a funnel's given; the worst leak is looked
  // for after it.
  let worst = S > 2 ? 1 : 0;
  for (let i = worst + 1; i < S - 1; i += 1) {
    const rate = lostAt(i) / Math.max(1, counts[i] ?? 1);
    if (rate > lostAt(worst) / Math.max(1, counts[worst] ?? 1)) worst = i;
  }
  const worstRate = lostAt(worst) / Math.max(1, counts[worst] ?? 1);

  const rowGeo = geoFor(ROW, counts);
  const colGeo = geoFor(COL, counts);

  const focusStage = (i: number) => {
    for (const v of ["r", "c"]) {
      const node = stageRefs.current.get(`${v}${i}`);
      if (node && node.offsetParent !== null) {
        node.focus();
        return node;
      }
    }
    return null;
  };

  const stageItem = (i: number, L: Layout, g: Geo) => {
    const st = stages[i];
    if (!st) return null;
    const on = active === i;
    const v = L.vertical;
    const at = g.at[i] ?? 0;
    const half = g.gap / 2;
    const from = i === 0 ? 0 : at - half;
    const to = i === S - 1 ? (v ? L.h : L.w) : at + half;
    const span = Math.max(1, to - from);
    const box: React.CSSProperties = v
      ? {
          top: `${r2((from / L.h) * 100)}%`,
          height: `${r2((span / L.h) * 100)}%`,
          left: 0,
          right: 0,
        }
      : {
          left: `${r2((from / L.w) * 100)}%`,
          width: `${r2((span / L.w) * 100)}%`,
          top: 0,
          bottom: 0,
        };
    // A label sits over its bar: above it when the funnel stands up, along
    // the top edge, centred on the bar, when it lies down.
    const labelAt: React.CSSProperties = v
      ? { top: `${r2(((at - 21 - from) / span) * 100)}%`, left: "1.5%" }
      : i === 0
        ? { left: `${r2(((at - L.bar / 2 - from) / span) * 100)}%`, top: 4 }
        : i === S - 1
          ? { right: `${r2(((to - at - L.bar / 2) / span) * 100)}%`, top: 4 }
          : {
              left: `${r2(((at - from) / span) * 100)}%`,
              top: 4,
              transform: "translateX(-50%)",
            };
    return (
      <li key={st.id} className="absolute" style={box}>
        <button
          ref={(node) => {
            const key = `${v ? "c" : "r"}${i}`;
            if (node) stageRefs.current.set(key, node);
            else stageRefs.current.delete(key);
          }}
          type="button"
          aria-label={stageName(i)}
          aria-pressed={pinned === i}
          aria-describedby={on ? detailId : undefined}
          tabIndex={i === rove ? 0 : -1}
          disabled={disabled}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setHovered(i);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") {
              setHovered((h) => (h === i ? -1 : h));
            }
          }}
          onFocus={() => {
            setRove(i);
            setFocused(i);
          }}
          onBlur={() => setFocused((f) => (f === i ? -1 : f))}
          onClick={(event) => pin(i, event.currentTarget)}
          onKeyDown={(event) => {
            const d =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : 0;
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? S - 1
                  : d
                    ? clamp(i + d, 0, S - 1)
                    : -1;
            if (next >= 0) {
              event.preventDefault();
              if (next !== i) plip(next, focusStage(next));
              return;
            }
            if (event.key === "Escape" && pinned >= 0) {
              // Ours: the pin lets go, and nothing behind it closes.
              event.preventDefault();
              pin(pinned, event.currentTarget);
            }
          }}
          className={cn(
            "absolute inset-0 rounded-3 transition-colors",
            on
              ? "bg-[color-mix(in_oklab,var(--accent-bright)_5%,transparent)]"
              : "bg-transparent",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
            FOCUS_IN,
          )}
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute flex flex-col rounded-2 px-1.5 py-0.5 leading-tight whitespace-nowrap",
              v || i === 0
                ? "items-start text-left"
                : i === S - 1
                  ? "items-end text-right"
                  : "items-center text-center",
            )}
            style={labelAt}
          >
            <span
              className={cn(
                "text-[12px] font-medium transition-colors",
                on ? "text-cobalt-bright" : "text-foreground",
              )}
            >
              {st.label}
            </span>
            <span
              className={cn(
                "font-mono text-[11px] text-ink-2",
                v && "flex flex-col",
              )}
            >
              <Count
                value={counts[i] ?? 0}
                format={fmt}
                motionSafe={motionSafe}
              />
              {i > 0 ? (
                <span className="text-ink-3">
                  {v ? "" : " · "}
                  <Count
                    value={conversionAt(i)}
                    format={pct}
                    motionSafe={motionSafe}
                  />
                </span>
              ) : null}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const dropLabels = (L: Layout, g: Geo) =>
    stages.slice(0, -1).map((st, i) => {
      const lost = lostAt(i);
      if (lost <= 0) return null;
      const end = dropAt(g, i, 1);
      const pos: React.CSSProperties = L.vertical
        ? { right: "1.5%", top: `${r2(((end.s + 4) / L.h) * 100)}%` }
        : {
            left: `${r2((end.s / L.w) * 100)}%`,
            top: `${r2(((L.drop + 6) / L.h) * 100)}%`,
            transform: "translateX(-50%)",
          };
      return (
        <span
          key={st.id}
          aria-hidden
          className={cn(
            "pointer-events-none absolute flex flex-col font-mono text-[10px] leading-tight whitespace-nowrap tabular-nums transition-opacity duration-150",
            L.vertical ? "items-end" : "items-center",
            active >= 0 && active !== i ? "opacity-40" : "opacity-100",
          )}
          style={pos}
        >
          <span className="text-danger">
            −<Count value={lost} format={fmt} motionSafe={motionSafe} />
          </span>
          <span className="text-ink-3">
            <Count
              value={lost / Math.max(1, counts[i] ?? 1)}
              format={pct}
              motionSafe={motionSafe}
            />
          </span>
        </span>
      );
    });

  const layout = (L: Layout, g: Geo) => {
    const v = L.vertical;
    return (
      <div
        ref={v ? colRef : rowRef}
        className={cn(
          "relative w-full",
          v
            ? "mx-auto block max-w-[24rem] @min-[35rem]:hidden"
            : "mx-auto hidden max-w-[52rem] @min-[35rem]:block",
        )}
        style={{ aspectRatio: `${L.w} / ${L.h}` }}
      >
        <FunnelLayer
          shapes={v ? colShapes : rowShapes}
          dots={v ? colDots : rowDots}
          L={L}
          safeId={`${safeId}-${v ? "c" : "r"}`}
        />
        {dropLabels(L, g)}
        <ul aria-label="Stages" className="absolute inset-0">
          {stages.map((_, i) => stageItem(i, L, g))}
        </ul>
      </div>
    );
  };

  // The details under the funnel keep their measured height and glide
  // between the summary and a stage's facts.
  const [detailBox, setDetailBox] = React.useState<HTMLDivElement | null>(null);
  const [detailH, setDetailH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!detailBox) return;
    const measure = () => setDetailH(Math.ceil(detailBox.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(detailBox);
    return () => ro.disconnect();
  }, [detailBox]);

  const fact = (k: string, v: React.ReactNode, tone?: string) => (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="text-[11px] text-ink-3">{k}</span>
      <span className={cn("font-mono text-[12px] tabular-nums", tone)}>
        {v}
      </span>
    </span>
  );

  const detailBody = (() => {
    if (active < 0) {
      return (
        <motion.div
          key="summary"
          className="flex flex-col gap-1"
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            transition: { duration: durations.fast, ease: easings.exit },
          }}
          transition={{
            opacity: { duration: durations.base, ease: easings.enter },
            y: motionSafe ? springs.snap : { duration: 0 },
          }}
        >
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-[13px] font-medium text-foreground">
              {pct(endToEnd)} end to end
            </span>
            {fact(
              "Reached the end",
              `${fmt(counts[S - 1] ?? 0)} of ${fmt(counts[0] ?? 0)}`,
            )}
            {S > 2
              ? fact(
                  `Most lost at ${stages[worst]?.label ?? ""}`,
                  pct(worstRate),
                  "text-danger",
                )
              : null}
          </p>
          <p className="text-[11px] text-ink-3">
            Point at a stage to freeze it; press to pin.
          </p>
        </motion.div>
      );
    }
    const st = stages[active];
    if (!st) return null;
    const lost = lostAt(active);
    const hours = seg?.medianHours?.[active];
    const reason = seg?.reasons?.[active];
    return (
      <motion.div
        key={`${st.id}-${seg?.id ?? ""}`}
        className="flex flex-col gap-1"
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{
          opacity: 0,
          transition: { duration: durations.fast, ease: easings.exit },
        }}
        transition={{
          opacity: { duration: durations.base, ease: easings.enter },
          y: motionSafe ? springs.snap : { duration: 0 },
        }}
      >
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[13px] font-medium text-cobalt-bright">
            {st.label}
            {pinned === active ? (
              <span className="ml-1.5 text-[11px] font-normal text-ink-3">
                pinned
              </span>
            ) : null}
          </span>
          {fact("People", fmt(counts[active] ?? 0))}
          {active > 0
            ? fact(
                `Of ${stages[active - 1]?.label ?? ""}`,
                pct(conversionAt(active)),
              )
            : null}
          {active < S - 1
            ? fact(
                "Dropped",
                `${fmt(lost)} · ${pct(lost / Math.max(1, counts[active] ?? 1))}`,
                "text-danger",
              )
            : null}
          {active > 0 && hours !== undefined
            ? fact("Median wait", hoursText(hours))
            : null}
        </p>
        <p className="truncate text-[11px] text-ink-3" title={reason}>
          {active < S - 1 && reason
            ? `Most left because: ${reason}`
            : active === S - 1
              ? "The end of the funnel."
              : " "}
        </p>
      </motion.div>
    );
  })();

  const body = () => {
    if (status === "loading") {
      return (
        <div aria-busy="true" className="flex flex-col gap-3 p-4">
          <p className="sr-only">Loading the funnel.</p>
          <div className="flex h-56 items-center justify-between gap-3 px-6">
            {stages.map((st, i) => (
              <span
                key={st.id}
                className="w-3 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ height: `${Math.round(90 - i * 16)}%` }}
              />
            ))}
          </div>
          <div className="h-14 rounded-3 bg-surface-1 motion-safe:animate-pulse" />
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The funnel did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div className="grid gap-3 p-3 @min-[40rem]:p-4 @min-[68rem]:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-3">
          {layout(ROW, rowGeo)}
          {layout(COL, colGeo)}
          <motion.div
            id={detailId}
            className="overflow-clip rounded-3 border border-hairline bg-surface-1"
            initial={false}
            animate={{ height: detailH ?? "auto" }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <div ref={setDetailBox} className="relative px-3 py-2.5">
              <AnimatePresence initial={false} mode="popLayout">
                {detailBody}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
        <div className="hidden @min-[68rem]:block">
          <table className="w-full text-[12px]">
            <caption className="pb-2 text-left text-[11px] text-ink-3">
              {seg?.label ?? ""} by stage
            </caption>
            <thead>
              <tr className="text-[11px] text-ink-3">
                <th scope="col" className="pb-1.5 text-left font-normal">
                  Stage
                </th>
                <th scope="col" className="pb-1.5 text-right font-normal">
                  People
                </th>
                <th scope="col" className="pb-1.5 text-right font-normal">
                  Kept
                </th>
              </tr>
            </thead>
            <tbody>
              {stages.map((st, i) => (
                <tr
                  key={st.id}
                  className={cn(
                    "border-t border-hairline transition-colors",
                    active === i &&
                      "bg-[color-mix(in_oklab,var(--accent-bright)_7%,transparent)]",
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      "py-1.5 pl-1 text-left font-medium",
                      active === i ? "text-cobalt-bright" : "text-foreground",
                    )}
                  >
                    {st.label}
                  </th>
                  <td className="py-1.5 text-right font-mono text-ink-2 tabular-nums">
                    <Count
                      value={counts[i] ?? 0}
                      format={fmt}
                      motionSafe={motionSafe}
                    />
                  </td>
                  <td className="py-1.5 pr-1 text-right font-mono text-ink-3 tabular-nums">
                    {i === 0 ? "—" : pct(conversionAt(i))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container max-h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-col gap-3 border-b border-hairline px-4 py-3 @min-[35rem]:flex-row @min-[35rem]:items-center @min-[35rem]:justify-between">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3 tabular-nums">
            {subtitle ? `${subtitle} · ` : ""}
            {fmt(counts[0] ?? 0)} {stages[0]?.label.toLowerCase() ?? ""}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Segment"
          className="relative flex h-8 w-full shrink-0 items-center gap-0.5 rounded-2 bg-surface-2 p-0.5 @min-[35rem]:inline-flex @min-[35rem]:w-auto"
        >
          {segments.map((sg, i) => {
            const on = sg.id === seg?.id;
            return (
              <button
                key={sg.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={(event) => pickSegment(sg.id, event.currentTarget)}
                onKeyDown={(event) => {
                  const d =
                    event.key === "ArrowRight" || event.key === "ArrowDown"
                      ? 1
                      : event.key === "ArrowLeft" || event.key === "ArrowUp"
                        ? -1
                        : 0;
                  const to =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? segments.length - 1
                        : d
                          ? (i + d + segments.length) % segments.length
                          : -1;
                  const next = segments[to];
                  if (!next) return;
                  event.preventDefault();
                  const node =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      "[role=radio]",
                    )[to];
                  node?.focus();
                  pickSegment(next.id, node);
                }}
                className={cn(
                  "relative inline-flex h-7 min-w-0 flex-1 items-center justify-center rounded-[5px] px-3 text-[12px] whitespace-nowrap transition-colors @min-[35rem]:flex-none",
                  on ? "text-foreground" : "text-ink-3 hover:text-foreground",
                  FOCUS_IN,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-segment`}
                    aria-hidden
                    className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative">{sg.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {body()}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

function FunnelLayer({
  shapes,
  dots,
  L,
  safeId,
}: {
  shapes: MotionValue<Shapes>;
  dots: Record<keyof Dots, MotionValue<string>>;
  L: Layout;
  safeId: string;
}) {
  const lead = useTransform(shapes, (s) => s.lead);
  const exit = useTransform(shapes, (s) => s.exit);
  const bars = useTransform(shapes, (s) => s.bars);
  const barOn = useTransform(shapes, (s) => s.barOn);
  const bands = useTransform(shapes, (s) => s.bands);
  const bandOn = useTransform(shapes, (s) => s.bandOn);
  const drops = useTransform(shapes, (s) => s.drops);
  const dropOn = useTransform(shapes, (s) => s.dropOn);
  const lossId = `funnel-loss-${safeId}`;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${L.w} ${L.h}`}
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient
          id={lossId}
          x1="0"
          y1="0"
          x2={L.vertical ? "1" : "0"}
          y2={L.vertical ? "0" : "1"}
        >
          <stop offset="0" style={{ stopColor: LOSS, stopOpacity: 0.34 }} />
          <stop offset="1" style={{ stopColor: LOSS, stopOpacity: 0.02 }} />
        </linearGradient>
      </defs>
      <motion.path
        d={lead}
        style={{ fill: `color-mix(in oklab, ${FLOW} 8%, transparent)` }}
      />
      <motion.path
        d={exit}
        style={{ fill: `color-mix(in oklab, ${FLOW} 8%, transparent)` }}
      />
      <motion.path
        d={bands}
        style={{ fill: `color-mix(in oklab, ${FLOW} 16%, transparent)` }}
      />
      <motion.path
        d={bandOn}
        style={{ fill: `color-mix(in oklab, ${FLOW} 30%, transparent)` }}
      />
      <motion.path d={drops} fill={`url(#${lossId})`} />
      <motion.path d={dropOn} fill={`url(#${lossId})`} style={{ opacity: 1 }} />
      <motion.path d={bars} style={{ fill: BARS }} />
      <motion.path d={barOn} style={{ fill: FLOW }} />
      <motion.path d={dots.faint} style={{ fill: FLOW, opacity: 0.45 }} />
      <motion.path d={dots.flow} style={{ fill: FLOW }} />
      <motion.path d={dots.dropFaint} style={{ fill: LOSS, opacity: 0.4 }} />
      <motion.path d={dots.drop} style={{ fill: LOSS, opacity: 0.85 }} />
      <motion.path d={dots.frozen} className="fill-foreground" />
    </svg>
  );
}
