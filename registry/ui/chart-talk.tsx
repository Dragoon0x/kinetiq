"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";
import {
  ArrowUp,
  Check,
  Download,
  LoaderCircle,
  RotateCcw,
  SearchX,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

/** One record of the dataset: a month (1–12), a region and two measures. */
export type ChartTalkRow = {
  month: number;
  region: string;
  units: number;
  revenue: number;
};

export type ChartTalkMeasure = "units" | "revenue";

/** What one answer draws. Every turn is absolute: it never depends on the turn before. */
export type ChartTalkSpec = {
  measure: ChartTalkMeasure;
  /** One mark per month, or per quarter. */
  by: "month" | "quarter";
  /** Stack (or draw) one series per region. */
  split?: boolean;
  /** First month kept, 1–12. */
  from?: number;
  /** Last month kept, 1–12. */
  to?: number;
  /** Each category as 100%, split by region. */
  share?: boolean;
};

export type ChartTalkTurn = {
  id: string;
  /** The question as the visitor asks it. */
  question: string;
  /** The assistant's one-line answer, shown under the question. */
  reply: string;
  spec: ChartTalkSpec;
  /** Words that ask this turn when typed. @default words from the question */
  match?: string[];
};

export type ChartTalkKind = "bars" | "lines" | "area";
export type ChartTalkThumbSize = "sm" | "md" | "lg";
export type ChartTalkStatus = "ready" | "loading" | "empty" | "error";

/** The table behind the chart on screen, as Export hands it over. */
export type ChartTalkTable = {
  turnId: string;
  columns: string[];
  rows: (string | number)[][];
};

export type ChartTalkProps = {
  /** The dataset. @default defaultChartTalkRows (Gaugeworks sensor sales, Jan–Sep 2026) */
  rows?: ChartTalkRow[];
  /** The questions the assistant can answer, in the order they are offered. @default defaultChartTalkTurns */
  turns?: ChartTalkTurn[];
  /** How many of `turns` are already asked when the surface mounts. @default 3 */
  defaultAsked?: number;
  /** Controlled: the id of the turn the chart shows. */
  value?: string;
  /** Initial turn when uncontrolled. @default the last asked turn */
  defaultValue?: string;
  /** Fires from the click or key that selected a turn. */
  onValueChange?: (turnId: string) => void;
  /** A question was asked: the matching turn, or null when nothing matched. */
  onAsk?: (question: string, turn: ChartTalkTurn | null) => void;
  /** The chart was taken back to an earlier turn. */
  onRestoreTurn?: (turnId: string) => void;
  /** Export was pressed, with the table behind the chart on screen. */
  onExport?: (table: ChartTalkTable) => void;
  /** Stacked bars, a line per series, or stacked areas. @default "bars" */
  chartKind?: ChartTalkKind;
  /** Size of the thumbnails in the thread. @default "md" */
  thumbSize?: ChartTalkThumbSize;
  /** The series ramp starts here — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long a question shows the chart querying before it answers, in ms. @default 520 */
  queryDelay?: number;
  /** Formats a value for the axis and the total. @default grouped units, $k revenue, % share */
  format?: (value: number, measure: ChartTalkMeasure, share: boolean) => string;
  /** The surface's heading. @default "Sensor sales · 2026" */
  title?: string;
  /** Where the rows come from, shown under the title. @default "gaugeworks.sales" */
  source?: string;
  /** The dataset's state, drawn on the chart itself. @default "ready" */
  status?: ChartTalkStatus;
  /** "Try again" was pressed after the dataset failed to load. */
  onRetry?: () => void;
  /** Height of the surface in px. @default 520 */
  height?: number;
  /** Read only: nothing can be asked or exported. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const REGIONS = ["North", "Coast", "Inland"];

/**
 * Gaugeworks sensor sales, January to September 2026. Formulas, not a
 * random source, so every machine draws the same months: North climbs
 * steadily, Coast compounds, Inland drifts down with a summer dip.
 */
export const defaultChartTalkRows: ChartTalkRow[] = Array.from(
  { length: 9 },
  (_, i) => {
    const m = i + 1;
    const north = 610 + 24 * m + (((m * 37) % 23) - 11) * 4;
    const coast = Math.round(
      300 * (1 + 0.085 * (m - 1) + 0.006 * (m - 1) ** 2),
    );
    const inland = 500 - 7 * m + (((m * 53) % 19) - 9) * 5 - (m === 7 ? 60 : 0);
    return [
      { month: m, region: "North", units: north, revenue: north * 46 },
      { month: m, region: "Coast", units: coast, revenue: coast * 54 },
      { month: m, region: "Inland", units: inland, revenue: inland * 41 },
    ];
  },
).flat();

export const defaultChartTalkTurns: ChartTalkTurn[] = [
  {
    id: "totals",
    question: "How many sensors did we sell this year?",
    reply: "Units by month, January to September.",
    spec: { measure: "units", by: "month" },
    match: ["sell", "sold", "units", "how many", "total"],
  },
  {
    id: "regions",
    question: "Split it by region.",
    reply: "Same months, stacked by region.",
    spec: { measure: "units", by: "month", split: true },
    match: ["region", "split", "area"],
  },
  {
    id: "last-quarter",
    question: "Last quarter only.",
    reply: "July to September, by region.",
    spec: { measure: "units", by: "month", split: true, from: 7, to: 9 },
    match: ["last quarter", "q3", "july", "recent"],
  },
  {
    id: "share",
    question: "Show it as a share.",
    reply: "Each month as 100%: Coast keeps gaining.",
    spec: {
      measure: "units",
      by: "month",
      split: true,
      from: 7,
      to: 9,
      share: true,
    },
    match: ["share", "percent", "%", "proportion", "mix"],
  },
  {
    id: "revenue",
    question: "By quarter, in revenue.",
    reply: "Revenue by quarter and region.",
    spec: { measure: "revenue", by: "quarter", split: true },
    match: ["revenue", "quarter", "dollars", "money", "sales value"],
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Geometry                                 */
/* ----------------------------------------------------------------------- */

const W = 1000;
const H = 400;
/** Headroom above the tallest mark, in viewBox units. */
const TOP = 10;
/** Fixed point count for line and area paths, so any two can morph. */
const SLOTS = 12;
const TICKS = [1, 0.75, 0.5, 0.25, 0] as const;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const MONTH_NAMES =
  "January February March April May June July August September October November December".split(
    " ",
  );

const r2 = (v: number) => Math.round(v * 100) / 100;

type Rect = { x: number; y: number; w: number; h: number };
type Cat = { key: string; label: string; name: string; months: number[] };

type Geometry = {
  cats: Cat[];
  series: string[];
  /** value[cat][series], already as shares when the spec asks. */
  values: Map<string, Map<string, number>>;
  yMax: number;
  total: number;
  rects: Map<string, Rect>;
  /** Line points per series (cat centre, value). */
  points: Map<string, { x: number; y: number }[]>;
  /** Stacked tops and bottoms per series (area). */
  bands: Map<string, { top: number[]; bottom: number[] }>;
  empty: boolean;
};

/** A round axis top: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × a power of ten. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  let p = 1;
  while (p * 10 <= v) p *= 10;
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (v <= m * p) return Math.round(m * p);
  }
  return p * 10;
}

const catsOf = (spec: ChartTalkSpec, months: number[]): Cat[] => {
  if (spec.by === "month") {
    return months.map((m) => ({
      key: `m${m}`,
      label: MONTHS[m - 1] ?? String(m),
      name: MONTH_NAMES[m - 1] ?? String(m),
      months: [m],
    }));
  }
  const quarters: Cat[] = [];
  for (const m of months) {
    const q = Math.ceil(m / 3);
    const found = quarters.find((c) => c.key === `q${q}`);
    if (found) found.months.push(m);
    else
      quarters.push({
        key: `q${q}`,
        label: `Q${q}`,
        name: `quarter ${q}`,
        months: [m],
      });
  }
  return quarters;
};

function geometryOf(
  rows: ChartTalkRow[],
  spec: ChartTalkSpec,
  kind: ChartTalkKind,
): Geometry {
  const from = spec.from ?? 1;
  const to = spec.to ?? 12;
  const kept = rows.filter((r) => r.month >= from && r.month <= to);
  const months = [...new Set(kept.map((r) => r.month))].sort((a, b) => a - b);
  const regions = [
    ...REGIONS.filter((r) => kept.some((k) => k.region === r)),
    ...[...new Set(kept.map((r) => r.region))].filter(
      (r) => !REGIONS.includes(r),
    ),
  ];
  const series = spec.split || spec.share ? regions : ["all"];
  const cats = catsOf(spec, months);
  const values = new Map<string, Map<string, number>>();
  let total = 0;
  for (const cat of cats) {
    const byS = new Map<string, number>();
    for (const s of series) byS.set(s, 0);
    for (const r of kept) {
      if (!cat.months.includes(r.month)) continue;
      const s = series.length === 1 && series[0] === "all" ? "all" : r.region;
      byS.set(s, (byS.get(s) ?? 0) + r[spec.measure]);
      total += r[spec.measure];
    }
    if (spec.share) {
      const sum = [...byS.values()].reduce((a, b) => a + b, 0) || 1;
      for (const [k, v] of byS) byS.set(k, r2((v / sum) * 100));
    }
    values.set(cat.key, byS);
  }
  const stacked = kind !== "lines";
  let peak = 0;
  for (const byS of values.values()) {
    const vs = [...byS.values()];
    peak = Math.max(
      peak,
      stacked ? vs.reduce((a, b) => a + b, 0) : Math.max(0, ...vs),
    );
  }
  const yMax = spec.share ? (stacked ? 100 : niceCeil(peak)) : niceCeil(peak);
  const n = Math.max(1, cats.length);
  const band = W / n;
  const bw = band * (n > 6 ? 0.62 : n > 3 ? 0.54 : 0.44);
  const yOf = (v: number) => r2(H - (v / yMax) * (H - TOP));

  const rects = new Map<string, Rect>();
  const points = new Map<string, { x: number; y: number }[]>();
  const bands = new Map<string, { top: number[]; bottom: number[] }>();
  for (const s of series) {
    points.set(s, []);
    bands.set(s, { top: [], bottom: [] });
  }
  cats.forEach((cat, i) => {
    const byS = values.get(cat.key);
    let base = 0;
    const cx = r2(i * band + band / 2);
    for (const s of series) {
      const v = byS?.get(s) ?? 0;
      const yTop = yOf(base + v);
      const yBottom = yOf(base);
      rects.set(`${cat.key}|${s}`, {
        x: r2(i * band + (band - bw) / 2),
        y: yTop,
        w: r2(bw),
        h: r2(Math.max(0, yBottom - yTop)),
      });
      points.get(s)?.push({ x: cx, y: yOf(v) });
      bands.get(s)?.top.push(yTop);
      bands.get(s)?.bottom.push(yBottom);
      base += v;
    }
  });
  return {
    cats,
    series,
    values,
    yMax,
    total: Math.round(total),
    rects,
    points,
    bands,
    empty: cats.length === 0,
  };
}

const union = (list: Rect[]): Rect | null => {
  if (list.length === 0) return null;
  const x = Math.min(...list.map((r) => r.x));
  const y = Math.min(...list.map((r) => r.y));
  const right = Math.max(...list.map((r) => r.x + r.w));
  const bottom = Math.max(...list.map((r) => r.y + r.h));
  return { x: r2(x), y: r2(y), w: r2(right - x), h: r2(bottom - y) };
};

/**
 * Where a mark keyed `cat|series` sits in another chart: itself, the whole
 * bar it splits from, the regions it merges, the months that gather into its
 * quarter, or its share of the quarter it came out of. Null when it has no
 * relative there, so it rises from (or sinks to) the baseline.
 */
function counterpart(key: string, other: Geometry | null): Rect | null {
  if (!other) return null;
  const [cat = "", series = ""] = key.split("|");
  const direct = other.rects.get(key);
  if (direct) return direct;
  const whole = other.rects.get(`${cat}|all`);
  if (whole) return whole;
  const sameCat = [...other.rects.entries()]
    .filter(([k]) => k.startsWith(`${cat}|`))
    .map(([, r]) => r);
  if (series === "all" && sameCat.length) return union(sameCat);
  if (cat.startsWith("q")) {
    const q = Number(cat.slice(1));
    const months = [q * 3 - 2, q * 3 - 1, q * 3];
    const parts = [...other.rects.entries()]
      .filter(([k]) => {
        const [c = "", s = ""] = k.split("|");
        return (
          months.some((m) => c === `m${m}`) &&
          (s === series || s === "all" || series === "all")
        );
      })
      .map(([, r]) => r);
    return union(parts);
  }
  if (cat.startsWith("m")) {
    const m = Number(cat.slice(1));
    const q = Math.ceil(m / 3);
    const parent =
      other.rects.get(`q${q}|${series}`) ??
      other.rects.get(`q${q}|all`) ??
      union(
        [...other.rects.entries()]
          .filter(([k]) => k.startsWith(`q${q}|`))
          .map(([, r]) => r),
      );
    if (!parent) return null;
    const idx = (m - 1) % 3;
    return {
      x: r2(parent.x + (idx * parent.w) / 3),
      y: parent.y,
      w: r2(parent.w / 3),
      h: parent.h,
    };
  }
  return null;
}

const baselineOf = (r: Rect): Rect => ({ x: r.x, y: H, w: r.w, h: 0 });

/** A line through fixed slots: each slot takes the category it falls in. */
function linePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  const out: string[] = [];
  for (let j = 0; j < SLOTS; j++) {
    const p =
      pts[Math.min(pts.length - 1, Math.floor((j * pts.length) / SLOTS))];
    if (p) out.push(`${j === 0 ? "M" : "L"}${p.x} ${p.y}`);
  }
  return out.join(" ");
}

function areaPath(
  xs: number[],
  band: { top: number[]; bottom: number[] },
): string {
  const n = xs.length;
  if (n === 0) return "";
  const pick = (arr: number[], j: number) =>
    arr[Math.min(n - 1, Math.floor((j * n) / SLOTS))] ?? H;
  const xAt = (j: number) =>
    xs[Math.min(n - 1, Math.floor((j * n) / SLOTS))] ?? 0;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let j = 0; j < SLOTS; j++) {
    // The outer slots reach the plot's edges so the area fills its width.
    const x = j === 0 ? 0 : j === SLOTS - 1 ? W : xAt(j);
    top.push(`${j === 0 ? "M" : "L"}${x} ${pick(band.top, j)}`);
    bottom.push(`L${x} ${pick(band.bottom, j)}`);
  }
  return `${top.join(" ")} ${bottom.reverse().join(" ")} Z`;
}

const flatLine = (xs: number[]) =>
  linePath(xs.length ? xs.map((x) => ({ x, y: H })) : [{ x: 0, y: H }]);

const xsOf = (g: Geometry) =>
  g.cats.map((_, i) => r2((i + 0.5) * (W / Math.max(1, g.cats.length))));

/** A series' path in another chart: its own, the whole it splits from, or flat. */
function pathCounterpart(
  series: string,
  kind: "line" | "area",
  other: Geometry | null,
  fallbackXs: number[],
): string {
  if (!other || other.empty) {
    return kind === "line"
      ? flatLine(fallbackXs)
      : areaPath(fallbackXs, {
          top: fallbackXs.map(() => H),
          bottom: fallbackXs.map(() => H),
        });
  }
  const xs = xsOf(other);
  const own = other.series.includes(series) ? series : other.series[0];
  if (kind === "line") {
    return linePath(other.points.get(own ?? "") ?? []);
  }
  const b = other.bands.get(own ?? "");
  return b ? areaPath(xs, b) : flatLine(xs);
}

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

const SERIES_FILL = [
  "fill-(--ct-s0)",
  "fill-(--ct-s1)",
  "fill-(--ct-s2)",
  "fill-(--ct-s3)",
  "fill-(--ct-s4)",
];
const SERIES_STROKE = [
  "stroke-(--ct-s0)",
  "stroke-(--ct-s1)",
  "stroke-(--ct-s2)",
  "stroke-(--ct-s3)",
  "stroke-(--ct-s4)",
];
const SERIES_BG = [
  "bg-(--ct-s0)",
  "bg-(--ct-s1)",
  "bg-(--ct-s2)",
  "bg-(--ct-s3)",
  "bg-(--ct-s4)",
];

const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Hand-rolled compact money: Intl's compact form prints differently on the server. */
const money = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
      : `$${Math.round(n)}`;

export const defaultChartTalkFormat = (
  value: number,
  measure: ChartTalkMeasure,
  share: boolean,
): string =>
  share
    ? `${Math.round(value)}%`
    : measure === "revenue"
      ? money(value)
      : grouped(value);

const THUMB: Record<ChartTalkThumbSize, { w: number; h: number }> = {
  sm: { w: 32, h: 20 },
  md: { w: 44, h: 28 },
  lg: { w: 60, h: 38 },
};

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

/** The script turn a typed question asks, if any. */
function matchTurn(text: string, turns: ChartTalkTurn[]): ChartTalkTurn | null {
  const q = text.toLowerCase();
  let best: ChartTalkTurn | null = null;
  let bestScore = 0;
  for (const t of turns) {
    const keys = t.match ?? wordsOf(t.question);
    const score = keys.filter((k) => q.includes(k.toLowerCase())).length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

type Instance = {
  key: string;
  turnId: string | null;
  question: string;
  reply: string;
  spec: ChartTalkSpec | null;
  pending: boolean;
};

const specKey = (s: ChartTalkSpec | null) =>
  s
    ? `${s.measure}|${s.by}|${s.split ? 1 : 0}|${s.from ?? ""}|${s.to ?? ""}|${s.share ? 1 : 0}`
    : "none";

/**
 * A number drawn from a motion value. It counts by writing its own text node
 * from a subscription — no re-render per frame — and renders the current
 * value, so the server and the first client paint agree.
 */
function Count({
  value,
  format,
}: {
  value: MotionValue<number>;
  format: (v: number) => string;
}) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const latest = React.useRef(format);
  React.useEffect(() => {
    latest.current = format;
  });
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const write = (v: number) => {
      const text = latest.current(v);
      const first = node.firstChild;
      if (first && first.nodeType === 3) first.nodeValue = text;
      else node.textContent = text;
    };
    write(value.get());
    return value.on("change", write);
  }, [value]);
  return <span ref={ref}>{format(value.get())}</span>;
}

/** A still picture of one turn's chart, for the thread. */
function Thumb({
  rows,
  spec,
  kind,
  size,
  pending,
  failed,
}: {
  rows: ChartTalkRow[];
  spec: ChartTalkSpec | null;
  kind: ChartTalkKind;
  size: ChartTalkThumbSize;
  pending: boolean;
  failed: boolean;
}) {
  const box = THUMB[size] ?? THUMB.md;
  const g = React.useMemo(
    () => (spec ? geometryOf(rows, spec, kind) : null),
    [rows, spec, kind],
  );
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-1 border border-hairline bg-surface-0"
      style={{ width: box.w, height: box.h }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin text-ink-3 motion-reduce:animate-none" />
      ) : failed || !g ? (
        <SearchX className="size-3.5 text-ink-3" />
      ) : g.empty ? (
        <span className="h-px w-3/4 border-t border-dashed border-ink-3" />
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)]"
        >
          {kind === "bars"
            ? [...g.rects.entries()].map(([k, r]) => (
                <rect
                  key={k}
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  className={
                    SERIES_FILL[
                      Math.max(0, g.series.indexOf(k.split("|")[1] ?? ""))
                    ]
                  }
                />
              ))
            : kind === "lines"
              ? g.series.map((s, i) => (
                  <path
                    key={s}
                    d={linePath(g.points.get(s) ?? [])}
                    fill="none"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    className={SERIES_STROKE[i]}
                  />
                ))
              : g.series.map((s, i) => {
                  const b = g.bands.get(s);
                  return b ? (
                    <path
                      key={s}
                      d={areaPath(xsOf(g), b)}
                      className={SERIES_FILL[i]}
                    />
                  ) : null;
                })}
        </svg>
      )}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A conversation with a dataset where the answer is one living chart. The
 * thread keeps one short line per question with a thumbnail of the chart at
 * that moment; the chart beside it always shows the selected turn, and every
 * follow-up morphs the same chart on `glide`. Marks are keyed by category and
 * series: splitting by region breaks each bar into stacked segments that start
 * as the whole bar and slide to their slices, months gather into their
 * quarter, a filter widens the bars that stay while the rest sink, and lines
 * and areas morph point by point through fixed-slot paths. The axis labels and
 * the total count to the new range on the same spring.
 *
 * The thread is a listbox: arrow keys step turns and the chart follows,
 * Home and End jump, Enter or a press selects. Questions are asked from the
 * suggestions or the composer; text that matches no turn becomes a query error
 * drawn on the chart. Loading, no-rows and dataset errors are drawn on the
 * chart too. Under reduced motion every change is a short cross-fade; values
 * still change.
 */
export function ChartTalk({
  rows = defaultChartTalkRows,
  turns = defaultChartTalkTurns,
  defaultAsked = 3,
  value,
  defaultValue,
  onValueChange,
  onAsk,
  onRestoreTurn,
  onExport,
  chartKind = "bars",
  thumbSize = "md",
  accent = "var(--accent-bright)",
  queryDelay = 520,
  format = defaultChartTalkFormat,
  title = "Sensor sales · 2026",
  source = "gaugeworks.sales",
  status = "ready",
  onRetry,
  height = 520,
  disabled = false,
  className,
}: ChartTalkProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const listId = `${uid}-turns`;

  const [asked, setAsked] = React.useState<Instance[]>(() =>
    turns.slice(0, Math.max(0, defaultAsked)).map((t) => ({
      key: t.id,
      turnId: t.id,
      question: t.question,
      reply: t.reply,
      spec: t.spec,
      pending: false,
    })),
  );
  const [ownSel, setOwnSel] = React.useState<string | undefined>(
    () => defaultValue ?? asked[asked.length - 1]?.key,
  );
  const selectedKey = value ?? ownSel;
  const selected =
    asked.find((a) => a.key === selectedKey) ?? asked[asked.length - 1];
  const [draft, setDraft] = React.useState("");
  const [exported, setExported] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const counter = React.useRef(0);
  const timers = React.useRef<number[]>([]);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const focusReq = React.useRef<string | null>(null);

  const ready = status === "ready";
  const live = ready && !disabled;

  // The chart keeps drawing the last answered spec while a question runs or
  // fails, and remembers what it drew before, so new marks know where from.
  const wanted =
    selected && selected.spec && !selected.pending ? selected.spec : null;
  const [drawn, setDrawn] = React.useState<{
    key: string;
    spec: ChartTalkSpec | null;
    from: ChartTalkSpec | null;
    kind: ChartTalkKind;
  }>(() => ({
    key: specKey(wanted),
    spec: wanted,
    from: null,
    kind: chartKind,
  }));
  if (wanted && drawn.key !== specKey(wanted)) {
    setDrawn({
      key: specKey(wanted),
      spec: wanted,
      from: drawn.spec,
      kind: chartKind,
    });
  } else if (drawn.kind !== chartKind) {
    // A new chart kind is a new drawing, not a morph from the last answer.
    setDrawn({ ...drawn, from: null, kind: chartKind });
  }
  const spec = drawn.spec;
  const geometry = React.useMemo(
    () => (spec ? geometryOf(rows, spec, chartKind) : null),
    [rows, spec, chartKind],
  );
  const fromGeometry = React.useMemo(
    () => (drawn.from ? geometryOf(rows, drawn.from, chartKind) : null),
    [rows, drawn.from, chartKind],
  );

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------ axis count ----------------------------- */

  const yMax = geometry?.yMax ?? 1;
  const total = geometry?.total ?? 0;
  const unitKind = spec ? (spec.share ? "share" : spec.measure) : "units";
  const axisMax = useMotionValue(yMax);
  const totalValue = useMotionValue(total);
  const kindRef = React.useRef(unitKind);
  React.useEffect(() => {
    // A change of unit is a new axis, not a count: it is set, and the label
    // sets cross-fade. Within one unit the numbers count on glide.
    if (kindRef.current !== unitKind || !motionSafe) {
      kindRef.current = unitKind;
      axisMax.jump(yMax);
      totalValue.jump(total);
      return;
    }
    const a = animate(axisMax, yMax, springs.glide);
    const b = animate(totalValue, total, springs.glide);
    return () => {
      a.stop();
      b.stop();
    };
  }, [yMax, total, unitKind, motionSafe, axisMax, totalValue]);

  const measure = spec?.measure ?? "units";
  const share = !!spec?.share;
  const fmt = (v: number) => format(v, measure, share);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
    };
  }, []);

  // Focus asked for by a key lands once the option it names has rendered.
  React.useEffect(() => {
    const want = focusReq.current;
    if (!want) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-ct-turn="${CSS.escape(want)}"]`,
    );
    if (!node) return;
    focusReq.current = null;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  /* ------------------------------- actions ------------------------------- */

  const select = (key: string, via: "key" | "press") => {
    const inst = asked.find((a) => a.key === key);
    if (!inst) return;
    if (via === "key") focusReq.current = key;
    if (key === selected?.key) return;
    if (value === undefined) setOwnSel(key);
    onValueChange?.(key);
    const index = asked.findIndex((a) => a.key === key);
    say(
      `Turn ${index + 1} of ${asked.length}: ${inst.question} ${inst.pending ? "Running." : inst.reply}`,
    );
    if (index < asked.length - 1) onRestoreTurn?.(key);
  };

  const ask = (text: string, turn: ChartTalkTurn | null) => {
    if (!live || !text.trim()) return;
    counter.current += 1;
    const key =
      turn && !asked.some((a) => a.key === turn.id)
        ? turn.id
        : `${turn?.id ?? "q"}-${counter.current}`;
    const inst: Instance = {
      key,
      turnId: turn?.id ?? null,
      question: text.trim(),
      reply: turn
        ? turn.reply
        : "No column matches that. Try region, quarter, revenue or share.",
      spec: turn?.spec ?? null,
      pending: !!turn,
    };
    setAsked((list) => [...list, inst]);
    if (value === undefined) setOwnSel(key);
    onValueChange?.(key);
    onAsk?.(inst.question, turn);
    if (!turn) {
      say(`Asked: ${inst.question} No column matches that.`);
      return;
    }
    say(`Asked: ${inst.question}`);
    timers.current.push(
      window.setTimeout(
        () => {
          setAsked((list) =>
            list.map((a) => (a.key === key ? { ...a, pending: false } : a)),
          );
          say(turn.reply);
        },
        Math.max(0, queryDelay),
      ),
    );
  };

  const exportTable = () => {
    if (!live || !geometry || !spec || !selected) return;
    const columns = [
      spec.by === "month" ? "Month" : "Quarter",
      ...geometry.series.map((s) =>
        s === "all" ? (measure === "revenue" ? "Revenue" : "Units") : s,
      ),
    ];
    const tableRows = geometry.cats.map((c) => [
      c.label,
      ...geometry.series.map((s) => geometry.values.get(c.key)?.get(s) ?? 0),
    ]);
    onExport?.({ turnId: selected.key, columns, rows: tableRows });
    setExported(true);
    timers.current.push(window.setTimeout(() => setExported(false), 1400));
    say(
      `Exported ${tableRows.length} ${tableRows.length === 1 ? "row" : "rows"}.`,
    );
  };

  const onListKey = (e: React.KeyboardEvent<HTMLElement>, index: number) => {
    const last = asked.length - 1;
    let to: number;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        to = Math.min(last, index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        to = Math.max(0, index - 1);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = last;
        break;
      case "Enter":
      case " ":
        to = index;
        break;
      default:
        return;
    }
    e.preventDefault();
    const inst = asked[to];
    if (inst) select(inst.key, "key");
  };

  /* -------------------------------- chart -------------------------------- */

  // Under reduced motion geometry cuts straight to the answer; only opacity
  // eases, so a new mark fades in where it belongs.
  const glide = motionSafe
    ? springs.glide
    : { default: { duration: 0 }, opacity: { duration: durations.fast } };
  type Dest = (key: string, series: string) => Rect | null;
  const dest: Dest = (key) => counterpart(key, geometry);

  const marks = (() => {
    if (!geometry || geometry.empty) return null;
    const g = geometry;
    const xs = xsOf(g);
    if (chartKind === "bars") {
      return (
        <AnimatePresence initial={false} custom={dest}>
          {[...g.rects.entries()].map(([key, r]) => {
            const s = key.split("|")[1] ?? "";
            const si = Math.max(0, g.series.indexOf(s));
            const o = motionSafe
              ? (counterpart(key, fromGeometry) ?? baselineOf(r))
              : r;
            return (
              <motion.rect
                key={key}
                className={cn(
                  SERIES_FILL[si % SERIES_FILL.length],
                  "stroke-card",
                )}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                initial={{
                  attrX: o.x,
                  attrY: o.y,
                  width: o.w,
                  height: o.h,
                  opacity: motionSafe ? 1 : 0,
                }}
                animate={{
                  attrX: r.x,
                  attrY: r.y,
                  width: r.w,
                  height: r.h,
                  opacity: 1,
                }}
                exit="leave"
                variants={{
                  // `custom` is missing when the whole bar set leaves at
                  // once (the chart kind changed): those bars just fade.
                  leave: (to: Dest | undefined) => {
                    // Reduced motion: a leaving mark fades where it stands.
                    if (!motionSafe) {
                      return {
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      };
                    }
                    const d = typeof to === "function" ? to(key, s) : null;
                    const t = d ?? baselineOf(r);
                    return {
                      attrX: t.x,
                      attrY: t.y,
                      width: t.w,
                      height: t.h,
                      opacity: motionSafe && d ? 1 : 0,
                      // Leaving marks travel to where they went, then go:
                      // exits ease, they never spring.
                      transition: motionSafe
                        ? {
                            duration: durations.slow,
                            ease: d ? easings.move : easings.exit,
                          }
                        : exitFor(durations.fast),
                    };
                  },
                }}
                transition={glide}
              />
            );
          })}
        </AnimatePresence>
      );
    }
    if (chartKind === "area") {
      return (
        <AnimatePresence initial={false}>
          {g.series.map((s, i) => {
            const b = g.bands.get(s);
            if (!b) return null;
            const d = areaPath(xs, b);
            return (
              <motion.path
                key={s}
                className={cn(
                  SERIES_FILL[i % SERIES_FILL.length],
                  "stroke-card",
                )}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                initial={{
                  d: motionSafe
                    ? pathCounterpart(s, "area", fromGeometry, xs)
                    : d,
                  opacity: motionSafe ? 1 : 0,
                }}
                animate={{ d, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.base) }}
                transition={glide}
              />
            );
          })}
        </AnimatePresence>
      );
    }
    return (
      <>
        <AnimatePresence initial={false}>
          {g.series.map((s, i) => (
            <motion.path
              key={s}
              fill="none"
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={SERIES_STROKE[i % SERIES_STROKE.length]}
              initial={{
                d: motionSafe
                  ? pathCounterpart(s, "line", fromGeometry, xs)
                  : linePath(g.points.get(s) ?? []),
                opacity: motionSafe ? 1 : 0,
              }}
              animate={{ d: linePath(g.points.get(s) ?? []), opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={glide}
            />
          ))}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {g.series.flatMap((s, i) =>
            (g.points.get(s) ?? []).map((p, ci) => {
              const cat = g.cats[ci]?.key ?? String(ci);
              const prev =
                fromGeometry?.points.get(s)?.[
                  fromGeometry.cats.findIndex((c) => c.key === cat)
                ];
              const o = motionSafe ? (prev ?? { x: p.x, y: H }) : p;
              return (
                <motion.path
                  key={`${cat}|${s}`}
                  fill="none"
                  strokeWidth={6.5}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className={SERIES_STROKE[i % SERIES_STROKE.length]}
                  initial={{
                    d: `M${o.x} ${o.y}L${o.x} ${o.y}`,
                    opacity: 0,
                  }}
                  animate={{ d: `M${p.x} ${p.y}L${p.x} ${p.y}`, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    d: motionSafe ? springs.glide : { duration: 0 },
                    opacity: { duration: durations.base, ease: easings.enter },
                  }}
                />
              );
            }),
          )}
        </AnimatePresence>
      </>
    );
  })();

  const summary = (() => {
    if (!geometry || !spec || !selected) return "No chart yet.";
    if (geometry.empty) return "No rows match this question.";
    let best = { label: "", v: -1 };
    for (const c of geometry.cats) {
      const vs = [...(geometry.values.get(c.key)?.values() ?? [])];
      const v = share ? Math.max(...vs) : vs.reduce((a, b) => a + b, 0);
      if (v > best.v) best = { label: c.name, v };
    }
    return `${selected.reply} ${geometry.cats.length} ${spec.by === "month" ? (geometry.cats.length === 1 ? "month" : "months") : geometry.cats.length === 1 ? "quarter" : "quarters"}${geometry.series.length > 1 ? " by region" : ""}. Highest ${fmt(best.v)} in ${best.label}.`;
  })();

  const failedTurn = selected && !selected.spec ? selected : null;
  const running = !!selected?.pending;
  const noRows = ready && !!geometry && geometry.empty;
  const overlay =
    status === "loading"
      ? "loading"
      : status === "error"
        ? "error"
        : status === "empty" || noRows
          ? "empty"
          : failedTurn
            ? "query"
            : running
              ? "running"
              : null;

  const suggestions = turns.filter(
    (t) => !asked.some((a) => a.turnId === t.id),
  );

  const chart = (
    <div className="relative flex flex-col gap-2 overflow-hidden px-3 pt-3 pb-2 @min-[40rem]/chart-talk:px-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate text-[13px] font-medium text-foreground">
            {selected?.spec
              ? selected.reply
              : spec
                ? "Last answer"
                : "No chart yet"}
          </p>
          <p className="flex items-baseline gap-1.5 text-[11px] text-ink-3">
            <span className="font-mono text-[15px] font-semibold text-foreground tabular-nums">
              <Count
                key={measure}
                value={totalValue}
                format={(v) => format(v, measure, false)}
              />
            </span>
            <span>{measure === "revenue" ? "revenue" : "units"} in view</span>
          </p>
        </div>
        <AnimatePresence initial={false}>
          {geometry && geometry.series.length > 1 && !geometry.empty ? (
            <motion.ul
              key="legend"
              aria-label="Regions"
              className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5"
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              {geometry.series.map((s, i) => (
                <li
                  key={s}
                  className="inline-flex items-center gap-1.5 text-[11px] text-ink-2"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-[2px]",
                      SERIES_BG[i % SERIES_BG.length],
                    )}
                  />
                  {s}
                </li>
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="relative flex-1">
        <div role="img" aria-label={summary} className="absolute inset-0">
          {/* y labels */}
          <div aria-hidden className="absolute top-2 bottom-6 left-0 w-11">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={unitKind}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base }}
              >
                {TICKS.map((t, i) => (
                  <span
                    key={t}
                    className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] leading-none text-ink-3 tabular-nums"
                    style={{ top: `${(1 - t) * 100}%` }}
                  >
                    {t === 0 ? (
                      fmt(0)
                    ) : (
                      <Count
                        key={`${unitKind}-${i}`}
                        value={axisMax}
                        format={(v) => fmt(v * t)}
                      />
                    )}
                  </span>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
          {/* plot */}
          <div className="absolute top-2 right-1 bottom-6 left-11">
            {TICKS.map((t) => (
              <span
                key={t}
                aria-hidden
                className={cn(
                  "absolute inset-x-0 h-px",
                  t === 0 ? "bg-hairline-strong" : "bg-hairline",
                )}
                style={{ top: `${(1 - t) * 100}%` }}
              />
            ))}
            <motion.svg
              aria-hidden
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
              animate={{
                opacity:
                  overlay && overlay !== "running" ? 0.18 : running ? 0.45 : 1,
              }}
              transition={{ duration: durations.base }}
            >
              {marks}
            </motion.svg>
          </div>
          {/* x labels */}
          <div aria-hidden className="absolute right-1 bottom-0 left-11 h-5">
            <AnimatePresence initial={false}>
              {geometry && !geometry.empty
                ? geometry.cats.map((c, i) => (
                    <motion.span
                      key={c.key}
                      className={cn(
                        "absolute top-1 -translate-x-1/2 font-mono text-[10px] leading-none whitespace-nowrap text-ink-3",
                        // Nine months on a phone plate crowd: keep every other.
                        geometry.cats.length > 6 &&
                          i % 2 === 1 &&
                          "@max-[19rem]/chart-talk:hidden",
                      )}
                      initial={{
                        left: `${r2(((i + 0.5) / geometry.cats.length) * 100)}%`,
                        opacity: 0,
                      }}
                      animate={{
                        left: `${r2(((i + 0.5) / geometry.cats.length) * 100)}%`,
                        opacity: 1,
                      }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        left: motionSafe ? springs.glide : { duration: 0 },
                        opacity: { duration: durations.base },
                      }}
                    >
                      {c.label}
                    </motion.span>
                  ))
                : null}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {overlay ? (
            <motion.div
              key={overlay}
              className="absolute inset-0 flex items-center-safe justify-center-safe p-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base }}
            >
              {overlay === "running" ? (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-popover px-2.5 text-[12px] text-ink-2 shadow-[0_4px_14px_color-mix(in_oklab,black_12%,transparent)]">
                  <LoaderCircle
                    aria-hidden
                    className="size-3.5 animate-spin motion-reduce:animate-none"
                  />
                  Running the query
                </span>
              ) : overlay === "loading" ? (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-popover px-2.5 text-[12px] text-ink-2">
                  <LoaderCircle
                    aria-hidden
                    className="size-3.5 animate-spin motion-reduce:animate-none"
                  />
                  Loading the rows
                </span>
              ) : (
                <div className="flex max-w-xs flex-col items-center gap-2 rounded-3 border border-hairline bg-popover px-4 py-3 text-center shadow-[0_6px_18px_color-mix(in_oklab,black_12%,transparent)]">
                  {overlay === "error" ? (
                    <TriangleAlert aria-hidden className="size-4 text-danger" />
                  ) : overlay === "empty" ? (
                    <span
                      aria-hidden
                      className="h-px w-12 border-t border-dashed border-ink-3"
                    />
                  ) : (
                    <SearchX aria-hidden className="size-4 text-warn" />
                  )}
                  <p className="text-[13px] font-medium text-foreground">
                    {overlay === "error"
                      ? "The rows did not load."
                      : overlay === "empty"
                        ? "No rows match."
                        : "That isn't a question the table can answer."}
                  </p>
                  <p className="text-[11px] leading-4 text-ink-3">
                    {overlay === "error"
                      ? `${source} is unreachable right now.`
                      : overlay === "empty"
                        ? "The filter leaves nothing to draw. Widen the months or ask again."
                        : `“${failedTurn?.question ?? ""}” matches no column. Try region, quarter, revenue or share.`}
                  </p>
                  {overlay === "error" && onRetry ? (
                    <button
                      type="button"
                      onClick={onRetry}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-2 border border-input px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
                        FOCUS,
                      )}
                    >
                      <RotateCcw aria-hidden className="size-3.5" />
                      Try again
                    </button>
                  ) : null}
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {spec && geometry && !geometry.empty ? (
        <div className="sr-only">
          <table>
            <caption>{selected?.reply}</caption>
            <thead>
              <tr>
                <th scope="col">{spec.by === "month" ? "Month" : "Quarter"}</th>
                {geometry.series.map((s) => (
                  <th key={s} scope="col">
                    {s === "all"
                      ? measure === "revenue"
                        ? "Revenue"
                        : "Units"
                      : s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {geometry.cats.map((c) => (
                <tr key={c.key}>
                  <th scope="row">{c.name}</th>
                  {geometry.series.map((s) => (
                    <td key={s}>
                      {fmt(geometry.values.get(c.key)?.get(s) ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );

  const thread = (
    <div className="flex flex-col overflow-hidden border-t border-hairline @min-[40rem]/chart-talk:border-t-0 @min-[40rem]/chart-talk:border-l">
      <p className="hidden px-3 pt-3 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]/chart-talk:block">
        Thread · {asked.length} {asked.length === 1 ? "turn" : "turns"}
      </p>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Turns"
        className="flex [scrollbar-width:thin] gap-1.5 overflow-x-auto overscroll-contain px-3 py-2 @min-[40rem]/chart-talk:flex-1 @min-[40rem]/chart-talk:flex-col @min-[40rem]/chart-talk:gap-1 @min-[40rem]/chart-talk:overflow-x-hidden @min-[40rem]/chart-talk:overflow-y-auto @min-[40rem]/chart-talk:px-2 @min-[40rem]/chart-talk:pt-0"
      >
        {asked.map((a, i) => {
          const on = a.key === selected?.key;
          const later = selected
            ? i > asked.findIndex((x) => x.key === selected.key)
            : false;
          return (
            <li
              key={a.key}
              role="option"
              aria-selected={on}
              data-ct-turn={a.key}
              tabIndex={on ? 0 : -1}
              aria-label={`Turn ${i + 1}: ${a.question} ${a.pending ? "Running." : a.reply}`}
              onClick={() => select(a.key, "press")}
              onKeyDown={(e) => onListKey(e, i)}
              className={cn(
                "relative flex shrink-0 cursor-pointer items-center gap-2 rounded-2 py-1.5 pr-2 pl-2 transition-colors",
                "w-40 @min-[40rem]/chart-talk:w-full",
                on ? "bg-surface-2" : "hover:bg-surface-1",
                later && !on && "opacity-60",
                FOCUS_IN,
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${uid}-selected`}
                  aria-hidden
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-(--ct-s0) @min-[40rem]/chart-talk:inset-x-auto @min-[40rem]/chart-talk:top-2 @min-[40rem]/chart-talk:bottom-2 @min-[40rem]/chart-talk:left-0 @min-[40rem]/chart-talk:h-auto @min-[40rem]/chart-talk:w-0.5"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <Thumb
                rows={rows}
                spec={a.spec}
                kind={chartKind}
                size={thumbSize}
                pending={a.pending}
                failed={!a.spec}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className="truncate text-[12px] leading-4 text-foreground"
                  title={a.question}
                >
                  {a.question}
                </span>
                <span className="truncate text-[11px] leading-4 text-ink-3">
                  {a.pending ? "Running…" : a.spec ? a.reply : "No match"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "@container/chart-talk relative grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          height,
          "--ct-s0": accent,
          "--ct-s1": `color-mix(in oklab, ${accent} 66%, var(--card))`,
          "--ct-s2": `color-mix(in oklab, ${accent} 40%, var(--card))`,
          "--ct-s3": `color-mix(in oklab, ${accent} 50%, var(--ink-3))`,
          "--ct-s4": "var(--ink-3)",
          "--ct-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
          "--ct-solid": `oklch(from ${accent} 0.52 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 @min-[40rem]/chart-talk:px-4">
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-end justify-center gap-[3px] rounded-full bg-(--ct-wash) pb-2"
        >
          <span className="h-2 w-[3px] rounded-full bg-(--ct-s0)" />
          <span className="h-3.5 w-[3px] rounded-full bg-(--ct-s0)" />
          <span className="h-2.5 w-[3px] rounded-full bg-(--ct-s0)" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate font-mono text-[11px] text-ink-3">{source}</p>
        </div>
        <button
          type="button"
          onClick={exportTable}
          aria-disabled={!live || !geometry || !!overlay || undefined}
          aria-label={exported ? "Exported" : "Export the table"}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-input px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2 aria-disabled:opacity-50",
            FOCUS,
          )}
        >
          <span className="relative inline-flex size-3.5 items-center justify-center">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={exported ? "done" : "export"}
                className="inline-flex"
                initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.flick,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                {exported ? (
                  <Check aria-hidden className="size-3.5 text-success" />
                ) : (
                  <Download aria-hidden className="size-3.5" />
                )}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="hidden @min-[22rem]/chart-talk:inline">
            {exported ? "Exported" : "Export"}
          </span>
        </button>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] overflow-hidden @min-[40rem]/chart-talk:grid-cols-[minmax(0,1fr)_15rem] @min-[40rem]/chart-talk:grid-rows-[minmax(0,1fr)]">
        {chart}
        {thread}
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline p-3">
        {suggestions.length ? (
          <div
            role="group"
            aria-label="Suggested questions"
            className="-mx-3 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3"
          >
            {suggestions.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-disabled={!live || undefined}
                onClick={() => ask(t.question, t)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center rounded-full border border-hairline-strong bg-surface-1 px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                {t.question}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text || !live) return;
            setDraft("");
            ask(text, matchTurn(text, turns));
          }}
        >
          <input
            type="text"
            value={draft}
            readOnly={!live}
            aria-disabled={!live || undefined}
            aria-label={`Ask about ${title}`}
            placeholder="Ask the table a question"
            onChange={(e) => {
              const text = e.currentTarget.value;
              setDraft(text);
            }}
            className={cn(
              "h-9 min-w-0 flex-1 rounded-3 border border-hairline-strong bg-surface-1 px-3 text-[13px] text-foreground placeholder:text-ink-3",
              FOCUS_IN,
            )}
          />
          <button
            type="submit"
            aria-label="Ask"
            aria-disabled={!live || !draft.trim() || undefined}
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-3 bg-(--ct-solid) text-primary-foreground transition-opacity aria-disabled:opacity-40",
              FOCUS,
            )}
          >
            <ArrowUp aria-hidden className="size-4" />
          </button>
        </form>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
