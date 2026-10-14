"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Bookmark,
  BookmarkCheck,
  ChartArea,
  ChartColumn,
  ChartLine,
  RotateCcw,
  Sigma,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RecipeAggregate = "sum" | "mean";
export type RecipeFormat = "number" | "currency" | "percent";
export type RecipeGrain = "day" | "week" | "month";
export type RecipeChartType = "bar" | "line" | "area";
export type RecipePalette = "cobalt" | "warm" | "mono";
export type RecipeDensity = "compact" | "cozy" | "roomy";
export type RecipeStatus = "ready" | "loading" | "error";

export type RecipeMetric = {
  id: string;
  /** The metric's name, e.g. "Revenue". */
  label: string;
  /** How a bin's rows combine: added up, or averaged. @default "sum" */
  aggregate?: RecipeAggregate;
  /** How a value prints: plain, with a currency sign, or as a percentage. @default "number" */
  format?: RecipeFormat;
  /** Printed after a plain value, e.g. " km". */
  unit?: string;
};

export type RecipeDimension = {
  id: string;
  /** The dimension's name, e.g. "Region". */
  label: string;
  values: { id: string; label: string }[];
};

/** One day of one combination of dimension values. */
export type RecipeRow = {
  /** UTC midnight of the day, in ms. */
  at: number;
  /** Dimension id to value id. */
  fields: Record<string, string>;
  /** Metric id to that day's figure. */
  values: Record<string, number>;
};

export type RecipeDataset = {
  id: string;
  label: string;
  /** Under the name in the list, e.g. "Gaugeworks Pay, daily". */
  caption?: string;
  metrics: RecipeMetric[];
  dimensions: RecipeDimension[];
  rows: RecipeRow[];
  /** Whether this dataset's rows have arrived; the chart shows a skeleton for one still loading. @default "ready" */
  status?: RecipeStatus;
};

/** A chart, written as the choices that make it. */
export type ChartRecipeValue = {
  dataset: string;
  /** Null until a metric is picked: the chart is empty. */
  metric: string | null;
  /** A dimension id, or null for one series. */
  groupBy: string | null;
  grain: RecipeGrain;
  chart: RecipeChartType;
};

export type ChartRecipeChange = {
  /** The control that changed, or "open" when a saved chart was loaded. */
  field: "dataset" | "metric" | "groupBy" | "grain" | "chart" | "open";
  from: ChartRecipeValue;
  to: ChartRecipeValue;
};

export type SavedRecipe = {
  id: string;
  title: string;
  recipe: ChartRecipeValue;
};

export type SavedRecipeChange = { kind: "save" | "remove"; item: SavedRecipe };

export type ChartRecipeProps = {
  /** The datasets on offer, each with its metrics, dimensions and rows. @default defaultRecipeDatasets */
  datasets?: RecipeDataset[];
  /** Controlled recipe. */
  value?: ChartRecipeValue;
  /** Initial recipe when uncontrolled. @default defaultChartRecipe */
  defaultValue?: ChartRecipeValue;
  /** Fires from the control that changed the recipe, with the whole recipe and the change. */
  onChange?: (value: ChartRecipeValue, change: ChartRecipeChange) => void;
  /** Controlled shelf of saved charts. */
  saved?: SavedRecipe[];
  /** Initial shelf when uncontrolled. @default defaultSavedRecipes */
  defaultSaved?: SavedRecipe[];
  /** Save was pressed; the item is already on the shelf. */
  onSave?: (item: SavedRecipe, saved: SavedRecipe[]) => void;
  /** The shelf changed: a chart was saved or removed. */
  onSavedChange?: (saved: SavedRecipe[], change: SavedRecipeChange) => void;
  /** The series colours: cobalt first, warm tones first, or one ink in steps. @default "cobalt" */
  palette?: RecipePalette;
  /** Whether a change of chart type morphs the marks (bars shrink to points, the line draws) or cross-fades between drawings. @default true */
  morph?: boolean;
  /** Row heights and type size in the recipe column and the shelf. @default "cozy" */
  density?: RecipeDensity;
  /** Whether the datasets have arrived. @default "ready" */
  status?: RecipeStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "New chart" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the recipe column and the shelf scroll inside it. @default 540 */
  height?: number;
  /** Read only: the recipe cannot change and nothing can be saved. The readout still scrubs. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** Monday 5 January 1970: week bins count from a Monday. */
const MONDAY_EPOCH = 4 * DAY;
/** The default datasets run from 1 July to 30 September 2026. */
const START = Date.UTC(2026, 6, 1);
const DAYS = 92;

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Monday is 0, Sunday 6. */
const weekdayOf = (at: number) => (Math.floor(at / DAY) + 3) % 7;

type Gen = (
  rand: () => number,
  combo: Record<string, string>,
  day: number,
  weekday: number,
) => Record<string, number>;

function buildRows(
  seed: number,
  dimensions: RecipeDimension[],
  gen: Gen,
): RecipeRow[] {
  const rand = mulberry32(seed);
  let combos: Record<string, string>[] = [{}];
  for (const dim of dimensions) {
    combos = combos.flatMap((c) =>
      dim.values.map((v) => ({ ...c, [dim.id]: v.id })),
    );
  }
  const rows: RecipeRow[] = [];
  for (let day = 0; day < DAYS; day += 1) {
    const at = START + day * DAY;
    const weekday = weekdayOf(at);
    for (const combo of combos) {
      rows.push({ at, fields: combo, values: gen(rand, combo, day, weekday) });
    }
  }
  return rows;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

const ORDER_DIMS: RecipeDimension[] = [
  {
    id: "region",
    label: "Region",
    values: [
      { id: "north", label: "North" },
      { id: "south", label: "South" },
      { id: "coast", label: "Coast" },
    ],
  },
  {
    id: "channel",
    label: "Channel",
    values: [
      { id: "web", label: "Web" },
      { id: "app", label: "App" },
      { id: "kiosk", label: "Kiosk" },
    ],
  },
];

const TICKET_DIMS: RecipeDimension[] = [
  {
    id: "queue",
    label: "Queue",
    values: [
      { id: "billing", label: "Billing" },
      { id: "shipping", label: "Shipping" },
      { id: "account", label: "Account" },
    ],
  },
  {
    id: "priority",
    label: "Priority",
    values: [
      { id: "urgent", label: "Urgent" },
      { id: "normal", label: "Normal" },
    ],
  },
];

const FLEET_DIMS: RecipeDimension[] = [
  {
    id: "depot",
    label: "Depot",
    values: [
      { id: "coldbrook", label: "Coldbrook" },
      { id: "fernmoor", label: "Fernmoor" },
      { id: "harbour", label: "Harbour" },
    ],
  },
  {
    id: "vehicle",
    label: "Vehicle",
    values: [
      { id: "van", label: "Van" },
      { id: "truck", label: "Truck" },
    ],
  },
];

const weightOf = (table: Record<string, number>, key: string | undefined) =>
  (key !== undefined ? table[key] : undefined) ?? 1;

/**
 * Three Basinworks Analytics datasets, a quarter each, from seeded
 * arithmetic: checkout orders with a weekend dip, a slow climb and one
 * campaign weekend in September; support tickets that spike mid-August;
 * fleet trips that rest at weekends.
 */
export const defaultRecipeDatasets: RecipeDataset[] = [
  {
    id: "orders",
    label: "Checkout orders",
    caption: "Gaugeworks Pay, daily",
    metrics: [
      { id: "orders", label: "Orders" },
      { id: "revenue", label: "Revenue", format: "currency" },
      {
        id: "basket",
        label: "Average basket",
        aggregate: "mean",
        format: "currency",
      },
      {
        id: "refunds",
        label: "Refund rate",
        aggregate: "mean",
        format: "percent",
      },
    ],
    dimensions: ORDER_DIMS,
    rows: buildRows(1726, ORDER_DIMS, (rand, combo, day, weekday) => {
      const weight =
        weightOf({ north: 1, south: 0.8, coast: 0.6 }, combo.region) *
        weightOf({ web: 1, app: 0.9, kiosk: 0.35 }, combo.channel);
      const weekend = weekday >= 5 ? 0.72 : 1;
      const trend = 1 + (day / DAYS) * 0.18;
      const campaign = day >= 66 && day <= 68 ? 1.55 : 1;
      const orders = Math.round(
        34 * weight * weekend * trend * campaign * (0.85 + rand() * 0.3),
      );
      const basket = r2(
        42 +
          (combo.channel === "app" ? 4 : 0) +
          rand() * 10 -
          (weekday >= 5 ? 3 : 0),
      );
      return {
        orders,
        revenue: Math.round(orders * basket),
        basket,
        refunds: r1(2.4 + (combo.region === "coast" ? 0.6 : 0) + rand() * 1.6),
      };
    }),
  },
  {
    id: "tickets",
    label: "Support tickets",
    caption: "Fieldline support, daily",
    metrics: [
      { id: "tickets", label: "Tickets" },
      {
        id: "firstReply",
        label: "First reply",
        aggregate: "mean",
        unit: " min",
      },
      {
        id: "csat",
        label: "Satisfaction",
        aggregate: "mean",
        format: "percent",
      },
    ],
    dimensions: TICKET_DIMS,
    rows: buildRows(2048, TICKET_DIMS, (rand, combo, day, weekday) => {
      const weight =
        weightOf({ billing: 1, shipping: 1.2, account: 0.7 }, combo.queue) *
        weightOf({ urgent: 0.35, normal: 1 }, combo.priority);
      const weekend = weekday >= 5 ? 0.45 : 1;
      const spike = day >= 44 && day <= 50 ? 1.8 : 1;
      const tickets = Math.round(
        18 * weight * weekend * spike * (0.8 + rand() * 0.4),
      );
      return {
        tickets,
        firstReply: r1(
          22 +
            (combo.priority === "urgent" ? -10 : 0) +
            rand() * 14 +
            spike * 2,
        ),
        csat: r1(86 + rand() * 9 - (combo.queue === "shipping" ? 3 : 0)),
      };
    }),
  },
  {
    id: "fleet",
    label: "Fleet telemetry",
    caption: "Coldbrook depots, daily",
    metrics: [
      { id: "trips", label: "Trips" },
      { id: "distance", label: "Distance", unit: " km" },
      { id: "idle", label: "Idle time", aggregate: "mean", format: "percent" },
    ],
    dimensions: FLEET_DIMS,
    rows: buildRows(4096, FLEET_DIMS, (rand, combo, day, weekday) => {
      const weight =
        weightOf({ coldbrook: 1, fernmoor: 0.75, harbour: 0.55 }, combo.depot) *
        weightOf({ van: 1, truck: 0.5 }, combo.vehicle);
      const weekend = weekday >= 5 ? 0.5 : 1;
      const trips = Math.round(12 * weight * weekend * (0.85 + rand() * 0.3));
      return {
        trips,
        distance: Math.round(trips * (18 + rand() * 12)),
        idle: r1(9 + rand() * 7 + (combo.vehicle === "truck" ? 3 : 0)),
      };
    }),
  },
];

export const defaultChartRecipe: ChartRecipeValue = {
  dataset: "orders",
  metric: "orders",
  groupBy: null,
  grain: "week",
  chart: "bar",
};

export const defaultSavedRecipes: SavedRecipe[] = [
  {
    id: "saved-1",
    title: "Revenue per week by region",
    recipe: {
      dataset: "orders",
      metric: "revenue",
      groupBy: "region",
      grain: "week",
      chart: "bar",
    },
  },
  {
    id: "saved-2",
    title: "Average basket per day",
    recipe: {
      dataset: "orders",
      metric: "basket",
      groupBy: null,
      grain: "day",
      chart: "line",
    },
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const GRAINS: { id: RecipeGrain; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const CHARTS: {
  id: RecipeChartType;
  label: string;
  Icon: typeof ChartColumn;
}[] = [
  { id: "bar", label: "Bars", Icon: ChartColumn },
  { id: "line", label: "Line", Icon: ChartLine },
  { id: "area", label: "Area", Icon: ChartArea },
];

const PER: Record<RecipeGrain, string> = {
  day: "per day",
  week: "per week",
  month: "per month",
};

const PALETTES: Record<RecipePalette, string[]> = {
  cobalt: [
    "var(--accent-bright)",
    "var(--signal)",
    "var(--warn)",
    "var(--danger)",
    "var(--ink-3)",
  ],
  warm: [
    "var(--warn)",
    "var(--danger)",
    "var(--accent-bright)",
    "var(--signal)",
    "var(--ink-3)",
  ],
  mono: [
    "var(--ink)",
    "color-mix(in oklab, var(--ink) 58%, var(--bg-1))",
    "color-mix(in oklab, var(--ink) 34%, var(--bg-1))",
    "color-mix(in oklab, var(--ink) 20%, var(--bg-1))",
    "color-mix(in oklab, var(--ink) 12%, var(--bg-1))",
  ],
};

const DENSITY: Record<
  RecipeDensity,
  { row: string; text: string; sections: string; shelf: number }
> = {
  compact: { row: "h-6", text: "text-[11px]", sections: "gap-3", shelf: 64 },
  cozy: { row: "h-7", text: "text-[12px]", sections: "gap-4", shelf: 76 },
  roomy: { row: "h-8", text: "text-[13px]", sections: "gap-5", shelf: 88 },
};

const PAD = { top: 10, right: 10, bottom: 22, left: 40 } as const;
/** Pointer travel before a press becomes a scrub, so taps still register. */
const DRAG_SLOP = 4;
const READOUT_W = 168;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));
const noopSubscribe = () => () => {};

const withCommas = (n: number) => {
  const [whole = "0", frac] = Math.abs(n).toString().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
};

/** Prints a value the way its metric asks: 12,480 · $1,204 · 2.6% · 318 km. */
export function formatRecipeValue(value: number, metric: RecipeMetric) {
  const format = metric.format ?? "number";
  if (format === "currency") return `$${withCommas(Math.round(value))}`;
  if (format === "percent") return `${value.toFixed(1)}%`;
  const rounded = Number.isInteger(value) ? value : Math.round(value * 10) / 10;
  return `${withCommas(rounded)}${metric.unit ?? ""}`;
}

/** An axis reading: 12.5K, 1.2M, $40, 8%. */
const compact = (value: number, metric: RecipeMetric) => {
  const sign = metric.format === "currency" ? "$" : "";
  const suffix = metric.format === "percent" ? "%" : "";
  const abs = Math.abs(value);
  const short =
    abs >= 1e6
      ? `${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`
      : abs >= 1e3
        ? `${(abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`
        : abs >= 10
          ? String(Math.round(abs))
          : String(Math.round(abs * 10) / 10);
  return `${value < 0 ? "-" : ""}${sign}${short}${suffix}`;
};

/** The next 1, 2, 2.5 or 5 times a power of ten at or above v. */
const niceCeil = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * p;
};

const binKey = (at: number, grain: RecipeGrain) => {
  if (grain === "day") return Math.floor(at / DAY);
  if (grain === "week") return Math.floor((at - MONDAY_EPOCH) / WEEK);
  const d = new Date(at);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

const binLabels = (at: number, grain: RecipeGrain) => {
  const d = new Date(at);
  const month = MONTHS[d.getUTCMonth()] ?? "";
  const day = d.getUTCDate();
  if (grain === "day") {
    return {
      label: `${month} ${day}`,
      long: `${WEEKDAYS[weekdayOf(at)] ?? ""} ${month} ${day}`,
    };
  }
  if (grain === "week") {
    return { label: `${month} ${day}`, long: `Week of ${month} ${day}` };
  }
  return {
    label: month,
    long: `${LONG_MONTHS[d.getUTCMonth()] ?? month} ${d.getUTCFullYear()}`,
  };
};

export type RecipeBin = { key: number; label: string; long: string };
export type RecipeSeries = { id: string; label: string; values: number[] };

/** Everything a recipe draws, before any pixels. */
export type RecipePlot = {
  metric: RecipeMetric;
  dimension: RecipeDimension | null;
  bins: RecipeBin[];
  series: RecipeSeries[];
  /** Grouped sums stack; grouped means stand side by side. */
  stacked: boolean;
  /** The tallest bar or point, stacks included. */
  max: number;
  /** The whole window: a sum of everything, or the mean of every row. */
  total: number;
  /** The series with the largest total, when there is more than one. */
  lead: RecipeSeries | null;
  /** The second half of the window against the first, as a fraction. */
  trend: number;
};

/** Bins a dataset by a recipe. Exported for hosts that render the figures elsewhere. */
export function plotRecipe(
  dataset: RecipeDataset | undefined,
  recipe: ChartRecipeValue,
): RecipePlot | null {
  if (!dataset || recipe.metric === null) return null;
  const metric = dataset.metrics.find((m) => m.id === recipe.metric);
  if (!metric || dataset.rows.length === 0) return null;
  const aggregate = metric.aggregate ?? "sum";
  const dimension =
    dataset.dimensions.find((d) => d.id === recipe.groupBy) ?? null;
  const groups = dimension
    ? dimension.values
    : [{ id: "all", label: metric.label }];

  const keys = new Map<number, number>();
  for (const row of dataset.rows) {
    const key = binKey(row.at, recipe.grain);
    const first = keys.get(key);
    if (first === undefined || row.at < first) keys.set(key, row.at);
  }
  const sortedKeys = [...keys.keys()].sort((a, b) => a - b);
  const index = new Map(sortedKeys.map((k, i) => [k, i]));
  const bins: RecipeBin[] = sortedKeys.map((key) => ({
    key,
    ...binLabels(keys.get(key) ?? START, recipe.grain),
  }));

  const sums = groups.map(() => new Array<number>(bins.length).fill(0));
  const counts = groups.map(() => new Array<number>(bins.length).fill(0));
  let grand = 0;
  let grandCount = 0;
  for (const row of dataset.rows) {
    const i = index.get(binKey(row.at, recipe.grain));
    if (i === undefined) continue;
    const g = dimension
      ? groups.findIndex((v) => v.id === row.fields[dimension.id])
      : 0;
    if (g < 0) continue;
    const v = row.values[metric.id] ?? 0;
    const sumRow = sums[g];
    const countRow = counts[g];
    if (sumRow) sumRow[i] = (sumRow[i] ?? 0) + v;
    if (countRow) countRow[i] = (countRow[i] ?? 0) + 1;
    grand += v;
    grandCount += 1;
  }
  const series: RecipeSeries[] = groups.map((g, k) => ({
    id: g.id,
    label: g.label,
    values: bins.map((_, i) => {
      const s = sums[k]?.[i] ?? 0;
      const c = counts[k]?.[i] ?? 0;
      return aggregate === "sum" ? s : c > 0 ? s / c : 0;
    }),
  }));
  const stacked = aggregate === "sum" && series.length > 1;
  const perBin = bins.map((_, i) => {
    const vals = series.map((s) => s.values[i] ?? 0);
    return stacked || series.length === 1
      ? vals.reduce((a, b) => a + b, 0)
      : vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  });
  const max = stacked
    ? Math.max(0, ...perBin)
    : Math.max(0, ...series.flatMap((s) => s.values));
  const totals = series.map((s) =>
    aggregate === "sum"
      ? s.values.reduce((a, b) => a + b, 0)
      : s.values.reduce((a, b) => a + b, 0) / Math.max(1, s.values.length),
  );
  let lead: RecipeSeries | null = null;
  if (series.length > 1) {
    let best = -Infinity;
    totals.forEach((t, k) => {
      if (t > best) {
        best = t;
        lead = series[k] ?? null;
      }
    });
  }
  const half = Math.floor(perBin.length / 2);
  const mean = (list: number[]) =>
    list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
  const first = mean(perBin.slice(0, half));
  const second = mean(perBin.slice(half));
  const trend = first > 0 && half > 0 ? (second - first) / first : 0;
  return {
    metric,
    dimension,
    bins,
    series,
    stacked,
    max,
    total: aggregate === "sum" ? grand : grandCount ? grand / grandCount : 0,
    lead,
    trend,
  };
}

/** The sentence under the chart, and its saved title. */
export function describeRecipe(
  recipe: ChartRecipeValue,
  plot: RecipePlot | null,
): { title: string; sentence: string } {
  if (!plot) return { title: "Empty chart", sentence: "" };
  const grouped = plot.series.length > 1;
  const by = plot.dimension ? ` by ${plot.dimension.label.toLowerCase()}` : "";
  const title = `${plot.metric.label} ${PER[recipe.grain]}${by}`;
  const shape =
    recipe.chart === "bar"
      ? plot.stacked
        ? "stacked bars"
        : grouped
          ? "bars side by side"
          : "bars"
      : recipe.chart === "line"
        ? grouped
          ? "lines"
          : "a line"
        : grouped
          ? "areas"
          : "an area";
  const n = plot.bins.length;
  const span = `${n} ${recipe.grain}${n === 1 ? "" : "s"}`;
  const figure =
    (plot.metric.aggregate ?? "sum") === "sum"
      ? `${formatRecipeValue(plot.total, plot.metric)} in all`
      : `${formatRecipeValue(plot.total, plot.metric)} on average`;
  const pct = Math.round(Math.abs(plot.trend) * 100);
  const movement =
    pct < 2
      ? "level across the window"
      : `${plot.trend > 0 ? "up" : "down"} ${pct}% in the second half`;
  const lead = plot.lead ? `, ${plot.lead.label} leading` : "";
  return {
    title,
    sentence: `${title}, ${span} as ${shape}: ${figure}${lead}, ${movement}.`,
  };
}

const sameRecipe = (a: ChartRecipeValue, b: ChartRecipeValue) =>
  a.dataset === b.dataset &&
  a.metric === b.metric &&
  a.groupBy === b.groupBy &&
  a.grain === b.grain &&
  a.chart === b.chart;

function useBoxSize(node: HTMLElement | null) {
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return size;
}

/**
 * Pointer capture throws when the id is not an active pointer, which is what
 * a synthetic sweep produces. The gesture works without it.
 */
const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointers have no capture target; the gesture continues.
  }
};

const releasePointer = (element: Element, pointerId: number) => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released, or never captured.
  }
};

/** Roving focus for a row or column of options: arrows, Home and End. */
const roveIndex = (key: string, i: number, n: number): number | null => {
  if (key === "ArrowRight" || key === "ArrowDown")
    return clamp(i + 1, 0, n - 1);
  if (key === "ArrowLeft" || key === "ArrowUp") return clamp(i - 1, 0, n - 1);
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return null;
};

/* ----------------------------------------------------------------------- */
/*                             Recipe controls                              */
/* ----------------------------------------------------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
      {children}
    </span>
  );
}

type OptionListProps = {
  layoutKey: string;
  label: string;
  options: { id: string; label: string; hint?: string }[];
  value: string | null;
  onSelect: (id: string) => void;
  inert: boolean;
  density: RecipeDensity;
  motionSafe: boolean;
  listRef?: (node: HTMLUListElement | null) => void;
};

/** A single-select listbox: selection follows focus, one tab stop. */
function OptionList({
  layoutKey,
  label,
  options,
  value,
  onSelect,
  inert,
  density,
  motionSafe,
  listRef,
}: OptionListProps) {
  const [focused, setFocused] = React.useState<string | null>(null);
  const nodes = React.useRef(new Map<string, HTMLLIElement>());
  const has = (id: string | null) =>
    id !== null && options.some((o) => o.id === id);
  const activeId = has(focused)
    ? focused
    : has(value)
      ? value
      : (options[0]?.id ?? null);
  const d = DENSITY[density];
  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-label={label}
      aria-disabled={inert || undefined}
      className="flex flex-col gap-px"
    >
      {options.map((option, i) => {
        const selected = option.id === value;
        return (
          <li
            key={option.id}
            ref={(node) => {
              if (node) nodes.current.set(option.id, node);
              else nodes.current.delete(option.id);
            }}
            role="option"
            aria-selected={selected}
            tabIndex={activeId === option.id ? 0 : -1}
            onFocus={() => setFocused(option.id)}
            onBlur={() => setFocused(null)}
            onClick={() => {
              if (!inert) onSelect(option.id);
            }}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                if (!inert) onSelect(option.id);
                return;
              }
              const to = roveIndex(event.key, i, options.length);
              if (to === null) return;
              event.preventDefault();
              const target = options[to];
              if (!target) return;
              nodes.current.get(target.id)?.focus();
              if (!inert) onSelect(target.id);
            }}
            className={cn(
              "relative flex items-center gap-2 rounded-2 pr-2 pl-2.5 transition-colors",
              d.row,
              d.text,
              selected
                ? "text-cobalt-bright"
                : "text-ink-2 hover:text-foreground",
              inert ? "cursor-not-allowed" : "cursor-pointer",
              !selected && !inert && "hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            {selected ? (
              <motion.span
                aria-hidden
                layoutId={motionSafe ? `${layoutKey}-ind` : undefined}
                transition={springs.snap}
                className="absolute inset-0 rounded-2 bg-cobalt-wash"
              />
            ) : null}
            <span className="relative min-w-0 flex-1 truncate font-medium">
              {option.label}
            </span>
            {option.hint ? (
              <span className="relative hidden shrink-0 truncate font-mono text-[10px] text-ink-3 @min-[40rem]:inline">
                {option.hint}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

type ChipRowProps = {
  label: string;
  chips: { id: string; label: string }[];
  value: string | null;
  onToggle: (id: string) => void;
  inert: boolean;
  density: RecipeDensity;
  motionSafe: boolean;
};

/** Toggle chips: one may be pressed; pressing it again clears. */
function ChipRow({
  label,
  chips,
  value,
  onToggle,
  inert,
  density,
  motionSafe,
}: ChipRowProps) {
  const [focused, setFocused] = React.useState<string | null>(null);
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const has = (id: string | null) =>
    id !== null && chips.some((c) => c.id === id);
  const activeId = has(focused)
    ? focused
    : has(value)
      ? value
      : (chips[0]?.id ?? null);
  const d = DENSITY[density];
  return (
    <div role="toolbar" aria-label={label} className="flex flex-wrap gap-1.5">
      {chips.map((chip, i) => {
        const pressed = chip.id === value;
        return (
          <motion.button
            key={chip.id}
            ref={(node) => {
              if (node) nodes.current.set(chip.id, node);
              else nodes.current.delete(chip.id);
            }}
            type="button"
            aria-pressed={pressed}
            aria-disabled={inert || undefined}
            tabIndex={activeId === chip.id ? 0 : -1}
            whileTap={inert || !motionSafe ? undefined : { scale: 0.96 }}
            transition={springs.flick}
            onFocus={() => setFocused(chip.id)}
            onBlur={() => setFocused(null)}
            onClick={() => {
              if (!inert) onToggle(chip.id);
            }}
            onKeyDown={(event) => {
              const to = roveIndex(event.key, i, chips.length);
              if (to === null) return;
              event.preventDefault();
              const target = chips[to];
              if (target) nodes.current.get(target.id)?.focus();
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 font-medium whitespace-nowrap transition-colors",
              d.row,
              d.text,
              pressed
                ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash text-cobalt-bright"
                : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
              inert ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            {pressed ? (
              <svg aria-hidden viewBox="0 0 14 14" className="size-3">
                <motion.path
                  d="M3 7.4 5.8 10 11 4.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </svg>
            ) : null}
            {chip.label}
          </motion.button>
        );
      })}
    </div>
  );
}

type SegmentedProps<T extends string> = {
  layoutKey: string;
  label: string;
  options: { id: T; label: string; Icon?: typeof ChartColumn }[];
  value: T;
  onSelect: (id: T) => void;
  inert: boolean;
  density: RecipeDensity;
  motionSafe: boolean;
  iconsOnly?: boolean;
};

/** A radio group drawn as a segmented control; its indicator slides on snap. */
function Segmented<T extends string>({
  layoutKey,
  label,
  options,
  value,
  onSelect,
  inert,
  density,
  motionSafe,
  iconsOnly = false,
}: SegmentedProps<T>) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const d = DENSITY[density];
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-2 border border-hairline bg-surface-1 p-0.5"
    >
      {options.map((option, i) => {
        const checked = option.id === value;
        const Icon = option.Icon;
        return (
          <button
            key={option.id}
            ref={(node) => {
              if (node) nodes.current.set(option.id, node);
              else nodes.current.delete(option.id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={iconsOnly ? option.label : undefined}
            title={iconsOnly ? option.label : undefined}
            aria-disabled={inert || undefined}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              if (!inert) onSelect(option.id);
            }}
            onKeyDown={(event) => {
              const to = roveIndex(event.key, i, options.length);
              if (to === null) return;
              event.preventDefault();
              const target = options[to];
              if (!target) return;
              nodes.current.get(target.id)?.focus();
              if (!inert) onSelect(target.id);
            }}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1 rounded-[4px] font-medium whitespace-nowrap transition-colors",
              d.row,
              d.text,
              iconsOnly ? "px-2.5" : "px-2.5",
              checked ? "text-foreground" : "text-ink-3 hover:text-ink-2",
              inert ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            {checked ? (
              <motion.span
                aria-hidden
                layoutId={motionSafe ? `${layoutKey}-ind` : undefined}
                transition={springs.snap}
                className="absolute inset-0 rounded-[4px] border border-hairline-strong bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_12%,transparent)]"
              />
            ) : null}
            {Icon ? <Icon aria-hidden className="relative size-3.5" /> : null}
            {iconsOnly ? null : (
              <span className="relative">{option.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Plot                                   */
/* ----------------------------------------------------------------------- */

type Mark = {
  key: string;
  seriesIndex: number;
  binIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
};

type Geometry = {
  innerW: number;
  innerH: number;
  x0: number;
  y0: number;
  slot: number;
  yMax: number;
  r: number;
  yOf: (v: number) => number;
  cxOf: (i: number) => number;
};

function geometry(
  width: number,
  height: number,
  plot: RecipePlot,
): Geometry | null {
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  if (innerW <= 20 || innerH <= 20 || plot.bins.length === 0) return null;
  const yMax = niceCeil(plot.max);
  const slot = innerW / plot.bins.length;
  const y0 = PAD.top + innerH;
  return {
    innerW,
    innerH,
    x0: PAD.left,
    y0,
    slot,
    yMax,
    r: plot.bins.length > 40 ? 2 : 3.5,
    yOf: (v: number) => y0 - (clamp(v, 0, yMax) / yMax) * innerH,
    cxOf: (i: number) => PAD.left + (i + 0.5) * slot,
  };
}

/** Every mark's target rectangle: a bar, or the point it shrinks to. */
function marksFor(
  plot: RecipePlot,
  g: Geometry,
  chart: RecipeChartType,
  morph: boolean,
): Mark[] {
  const out: Mark[] = [];
  const n = plot.series.length;
  const family = chart === "bar" ? "bar" : "point";
  const prefix = morph ? "m" : family;
  const groupW = Math.max(2, g.slot * 0.72);
  const gap = g.slot > 12 ? 2 : 1;
  const barW =
    plot.stacked || n === 1
      ? groupW
      : Math.max(1.5, (groupW - gap * (n - 1)) / n);
  for (let i = 0; i < plot.bins.length; i += 1) {
    let stack = 0;
    for (let s = 0; s < n; s += 1) {
      const v = plot.series[s]?.values[i] ?? 0;
      const key = `${prefix}-${s}-${i}`;
      if (chart === "bar") {
        if (plot.stacked) {
          const top = g.yOf(stack + v);
          const bottom = g.yOf(stack);
          const h = Math.max(0, bottom - top);
          const inset = h > 3 && s > 0 ? 1 : 0;
          out.push({
            key,
            seriesIndex: s,
            binIndex: i,
            x: g.cxOf(i) - groupW / 2,
            y: top + inset,
            width: groupW,
            height: Math.max(0, h - inset),
            rx: 0,
          });
          stack += v;
        } else {
          const x =
            n === 1
              ? g.cxOf(i) - groupW / 2
              : g.cxOf(i) - groupW / 2 + s * (barW + gap);
          const top = g.yOf(v);
          out.push({
            key,
            seriesIndex: s,
            binIndex: i,
            x,
            y: top,
            width: barW,
            height: Math.max(0, g.y0 - top),
            rx: Math.min(2, barW / 2),
          });
        }
      } else {
        out.push({
          key,
          seriesIndex: s,
          binIndex: i,
          x: g.cxOf(i) - g.r,
          y: g.yOf(v) - g.r,
          width: g.r * 2,
          height: g.r * 2,
          rx: g.r,
        });
      }
    }
  }
  return out;
}

const linePath = (plot: RecipePlot, g: Geometry, s: number) =>
  (plot.series[s]?.values ?? [])
    .map((v, i) => `${i === 0 ? "M" : "L"}${r3(g.cxOf(i))},${r3(g.yOf(v))}`)
    .join(" ");

const areaPath = (plot: RecipePlot, g: Geometry, s: number) => {
  const values = plot.series[s]?.values ?? [];
  if (values.length === 0) return "";
  const last = values.length - 1;
  return `${linePath(plot, g, s)} L${r3(g.cxOf(last))},${r3(g.y0)} L${r3(g.cxOf(0))},${r3(g.y0)} Z`;
};

type PlotProps = {
  plot: RecipePlot;
  chart: RecipeChartType;
  colours: string[];
  morph: boolean;
  motionSafe: boolean;
  live: boolean;
  active: number | null;
  valueText: string;
  label: string;
  onActive: (index: number | null) => void;
};

function Plot({
  plot,
  chart,
  colours,
  morph,
  motionSafe,
  live,
  active,
  valueText,
  label,
  onActive,
}: PlotProps) {
  const [plate, setPlate] = React.useState<HTMLDivElement | null>(null);
  const { width, height } = useBoxSize(plate);
  const dragRef = React.useRef<{ pointerId: number; startX: number } | null>(
    null,
  );
  const g = geometry(width, height, plot);
  const marks = g ? marksFor(plot, g, chart, morph) : [];
  const count = plot.bins.length;
  const shown = active === null ? Math.max(0, count - 1) : active;
  const colourOf = (s: number) =>
    colours[s % colours.length] ?? colours[0] ?? "currentColor";

  const indexFromClientX = (clientX: number): number | null => {
    if (!plate || !g) return null;
    const rect = plate.getBoundingClientRect();
    const x = clientX - rect.left - g.x0;
    return clamp(Math.floor(x / g.slot), 0, count - 1);
  };
  const scrubTo = (clientX: number) => {
    const i = indexFromClientX(clientX);
    if (i !== null) onActive(i);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    let to: number | null = null;
    const from = active ?? count - 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") to = from + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      to = from - 1;
    else if (event.key === "PageUp") to = from + 5;
    else if (event.key === "PageDown") to = from - 5;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = count - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      onActive(null);
      return;
    }
    if (to === null) return;
    event.preventDefault();
    onActive(clamp(to, 0, count - 1));
  };

  const ticks = [0.25, 0.5, 0.75, 1];
  const labelEvery = g
    ? Math.max(1, Math.ceil(count / Math.max(2, Math.floor(g.innerW / 64))))
    : 1;
  const markTransition = motionSafe ? springs.glide : { duration: 0 };
  const cx = g && active !== null ? g.cxOf(active) : null;
  const readoutLeft =
    g && cx !== null
      ? cx + 12 + READOUT_W <= width
        ? cx + 12
        : Math.max(4, cx - 12 - READOUT_W)
      : 0;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={Math.max(count - 1, 0)}
      aria-valuenow={shown}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      onFocus={() => {
        if (active === null) onActive(count - 1);
      }}
      onBlur={() => onActive(null)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX };
        scrubTo(event.clientX);
      }}
      onPointerMove={(event) => {
        const held = dragRef.current;
        // Captured only once the press has become a drag; capturing on
        // pointerdown swallows the click a tap is made of.
        if (
          held &&
          held.pointerId === event.pointerId &&
          Math.abs(event.clientX - held.startX) > DRAG_SLOP
        ) {
          capturePointer(event.currentTarget, event.pointerId);
        }
        scrubTo(event.clientX);
      }}
      onPointerUp={(event) => {
        releasePointer(event.currentTarget, event.pointerId);
        dragRef.current = null;
      }}
      onPointerCancel={(event) => {
        releasePointer(event.currentTarget, event.pointerId);
        dragRef.current = null;
      }}
      onPointerLeave={() => {
        if (!dragRef.current) onActive(null);
      }}
      className={cn(
        "relative min-h-0 flex-1 rounded-3 border border-hairline bg-surface-1",
        FOCUS_RING,
      )}
      // pan-y keeps the page scrollable through the plot; horizontal travel
      // belongs to the readout.
      style={{ touchAction: "pan-y" }}
    >
      <div ref={setPlate} className="absolute inset-0">
        {g ? (
          <svg
            aria-hidden
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block overflow-visible"
          >
            {/* grid */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={g.x0}
                  x2={g.x0 + g.innerW}
                  y1={g.yOf(t * g.yMax)}
                  y2={g.yOf(t * g.yMax)}
                  stroke="var(--hairline)"
                />
                <text
                  x={g.x0 - 6}
                  y={g.yOf(t * g.yMax) + 3}
                  textAnchor="end"
                  className="font-mono text-[10px]"
                  fill="var(--ink-3)"
                >
                  {compact(t * g.yMax, plot.metric)}
                </text>
              </g>
            ))}
            <line
              x1={g.x0}
              x2={g.x0 + g.innerW}
              y1={g.y0}
              y2={g.y0}
              stroke="var(--hairline-strong)"
            />
            {plot.bins.map((bin, i) =>
              i % labelEvery === 0 && i <= count - 1 ? (
                <text
                  key={bin.key}
                  x={g.cxOf(i)}
                  y={g.y0 + 14}
                  textAnchor="middle"
                  className="font-mono text-[10px]"
                  fill="var(--ink-3)"
                >
                  {bin.label}
                </text>
              ) : null,
            )}

            {/* scrub band behind bars */}
            {chart === "bar" && cx !== null ? (
              <motion.rect
                initial={false}
                animate={{ x: cx - g.slot / 2 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
                y={PAD.top}
                width={g.slot}
                height={g.innerH}
                fill="color-mix(in oklab, var(--ink) 7%, transparent)"
              />
            ) : null}

            {/* areas */}
            <AnimatePresence initial={false}>
              {chart === "area"
                ? plot.series.map((s, k) => (
                    <motion.path
                      key={`area-${s.id}-${count}`}
                      initial={{ opacity: 0, d: areaPath(plot, g, k) }}
                      animate={{ opacity: 0.16, d: areaPath(plot, g, k) }}
                      exit={{ opacity: 0, transition: exitFor(durations.base) }}
                      transition={{
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                        d: markTransition,
                      }}
                      fill={colourOf(k)}
                      stroke="none"
                    />
                  ))
                : null}
            </AnimatePresence>

            {/* lines */}
            <AnimatePresence initial={false}>
              {chart !== "bar"
                ? plot.series.map((s, k) => (
                    <motion.path
                      key={`line-${s.id}-${count}`}
                      initial={
                        live
                          ? morph && motionSafe
                            ? {
                                pathLength: 0,
                                opacity: 1,
                                d: linePath(plot, g, k),
                              }
                            : {
                                opacity: 0,
                                pathLength: 1,
                                d: linePath(plot, g, k),
                              }
                          : false
                      }
                      animate={{
                        pathLength: 1,
                        opacity: 1,
                        d: linePath(plot, g, k),
                      }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        pathLength: motionSafe
                          ? springs.glide
                          : { duration: 0 },
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                        d: markTransition,
                      }}
                      fill="none"
                      stroke={colourOf(k)}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))
                : null}
            </AnimatePresence>

            {/* marks: bars, or the points they shrink to */}
            <AnimatePresence initial={false}>
              {marks.map((m) => {
                const enterFromFloor = chart === "bar";
                return (
                  <motion.rect
                    key={m.key}
                    initial={
                      live
                        ? enterFromFloor
                          ? {
                              x: m.x,
                              width: m.width,
                              y: g.y0,
                              height: 0,
                              rx: m.rx,
                              opacity: 1,
                            }
                          : { ...m, opacity: 0 }
                        : false
                    }
                    animate={{
                      x: m.x,
                      y: m.y,
                      width: m.width,
                      height: m.height,
                      rx: m.rx,
                      opacity: 1,
                    }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      ...markTransition,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }}
                    fill={colourOf(m.seriesIndex)}
                    stroke={chart === "bar" ? "none" : "var(--bg-1)"}
                    strokeWidth={chart === "bar" ? 0 : 1}
                  />
                );
              })}
            </AnimatePresence>

            {/* crosshair */}
            {cx !== null ? (
              <motion.g
                initial={false}
                animate={{ x: cx }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              >
                <line
                  x1={0}
                  x2={0}
                  y1={PAD.top}
                  y2={g.y0}
                  stroke="var(--ink-3)"
                  strokeDasharray="2 3"
                />
                {chart !== "bar" && active !== null
                  ? plot.series.map((s, k) => (
                      <circle
                        key={s.id}
                        cx={0}
                        cy={g.yOf(s.values[active] ?? 0)}
                        r={g.r + 2.5}
                        fill="var(--bg-1)"
                        stroke={colourOf(k)}
                        strokeWidth={2}
                      />
                    ))
                  : null}
              </motion.g>
            ) : null}
          </svg>
        ) : null}

        {/* readout */}
        <AnimatePresence>
          {g && active !== null ? (
            <motion.div
              key="readout"
              aria-hidden
              initial={{
                opacity: 0,
                x: readoutLeft,
                y: motionSafe ? -distances.nudge : 0,
              }}
              animate={{ opacity: 1, x: readoutLeft, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                x: motionSafe ? springs.flick : { duration: 0 },
                y: motionSafe ? springs.flick : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
              style={{ width: READOUT_W, top: PAD.top }}
              className="pointer-events-none absolute left-0 flex flex-col gap-1 rounded-2 border border-hairline-strong bg-popover px-2.5 py-2 shadow-[0_10px_24px_-12px_color-mix(in_oklab,black_45%,transparent)]"
            >
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {plot.bins[active]?.long}
              </span>
              {plot.series.map((s, k) => (
                <span
                  key={s.id}
                  className="flex items-center gap-1.5 text-[12px] text-foreground"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: colourOf(k) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink-2">
                    {s.label}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {formatRecipeValue(s.values[active] ?? 0, plot.metric)}
                  </span>
                </span>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Saved shelf                                */
/* ----------------------------------------------------------------------- */

const THUMB_W = 88;
const THUMB_H = 44;

function Thumb({
  plot,
  chart,
  colours,
}: {
  plot: RecipePlot | null;
  chart: RecipeChartType;
  colours: string[];
}) {
  if (!plot || plot.bins.length === 0) {
    return (
      <span className="flex h-full w-full items-center justify-center text-ink-3">
        <Sigma aria-hidden className="size-3.5" />
      </span>
    );
  }
  const yMax = niceCeil(plot.max);
  const pad = 3;
  const w = THUMB_W - pad * 2;
  const h = THUMB_H - pad * 2;
  const n = plot.bins.length;
  const slot = w / n;
  const yOf = (v: number) => pad + h - (clamp(v, 0, yMax) / yMax) * h;
  const cxOf = (i: number) => pad + (i + 0.5) * slot;
  const colourOf = (s: number) => colours[s % colours.length] ?? "currentColor";
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
      className="block h-full w-full"
    >
      {chart === "bar"
        ? plot.bins.map((bin, i) => {
            let stack = 0;
            const groupW = Math.max(1, slot * 0.7);
            const k = plot.series.length;
            const barW =
              plot.stacked || k === 1 ? groupW : Math.max(0.8, groupW / k);
            return plot.series.map((s, j) => {
              const v = s.values[i] ?? 0;
              let x: number;
              let top: number;
              let bottom: number;
              if (plot.stacked) {
                x = cxOf(i) - groupW / 2;
                top = yOf(stack + v);
                bottom = yOf(stack);
                stack += v;
              } else {
                x = cxOf(i) - groupW / 2 + j * barW;
                top = yOf(v);
                bottom = pad + h;
              }
              return (
                <rect
                  key={`${bin.key}-${s.id}`}
                  x={r3(x)}
                  y={r3(top)}
                  width={r3(plot.stacked ? groupW : barW)}
                  height={r3(Math.max(0, bottom - top))}
                  fill={colourOf(j)}
                />
              );
            });
          })
        : plot.series.map((s, j) => {
            const d = s.values
              .map(
                (v, i) => `${i === 0 ? "M" : "L"}${r3(cxOf(i))},${r3(yOf(v))}`,
              )
              .join(" ");
            const last = s.values.length - 1;
            return (
              <g key={s.id}>
                {chart === "area" ? (
                  <path
                    d={`${d} L${r3(cxOf(last))},${pad + h} L${r3(cxOf(0))},${pad + h} Z`}
                    fill={colourOf(j)}
                    opacity={0.2}
                  />
                ) : null}
                <path
                  d={d}
                  fill="none"
                  stroke={colourOf(j)}
                  strokeWidth={1.25}
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A chart builder that writes its recipe as you build it. The recipe column
 * is four native controls — a dataset listbox, a metric listbox, group-by
 * chips, a grain segmented control and a row of chart-type icons — and the
 * chart on the right redraws from them live. Every mark is one rectangle
 * whose target is a bar or the point it stands for, so switching bars to a
 * line morphs on `springs.glide`: the bars shrink to points while the line
 * draws itself along them (pathLength 0 to 1), and the area, when chosen,
 * fills in beneath on a tween. Changing the grain re-bins the rows and the
 * new bars rise from the baseline on `springs.glide` as the old ones fade.
 * Adding a group-by splits the series, assigns each group its colour from
 * the palette in a fixed order, and glides a legend in with `cascade`.
 * Grouped sums stack; grouped means stand side by side.
 *
 * A sentence under the plot says what the chart shows — metric, grain,
 * group, shape, the total or mean, who leads and how the second half moved
 * — and cross-fades as it changes. Save puts the recipe on a shelf of mini
 * thumbnails; the new one lands on `springs.recoil`, and opening one writes
 * its recipe back into the controls, each indicator sliding on `springs.snap`.
 *
 * The plot is a slider: Left/Right step a bin, PageUp/PageDown step five,
 * Home/End reach the ends, Escape clears, and `aria-valuetext` reads every
 * series' figure for the bin while a readout follows the crosshair on
 * `springs.flick`. Every figure is also an SR-only table under the chart.
 * Under reduced motion marks, lines and indicators are placed at once behind
 * short fades, and every sentence, readout and announcement is unchanged.
 */
export function ChartRecipe({
  datasets = defaultRecipeDatasets,
  value,
  defaultValue = defaultChartRecipe,
  onChange,
  saved,
  defaultSaved = defaultSavedRecipes,
  onSave,
  onSavedChange,
  palette = "cobalt",
  morph = true,
  density = "cozy",
  status = "ready",
  onRetry,
  title = "New chart",
  label,
  height = 540,
  disabled = false,
  className,
}: ChartRecipeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const sentenceId = `${uid}-sentence`;

  const [own, setOwn] = React.useState<ChartRecipeValue>(defaultValue);
  const recipe = value ?? own;
  const [ownSaved, setOwnSaved] = React.useState<SavedRecipe[]>(defaultSaved);
  const shelf = saved ?? ownSaved;
  const [active, setActive] = React.useState<number | null>(null);
  const [activeSaved, setActiveSaved] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [landed, setLanded] = React.useState<string | null>(null);
  const metricList = React.useRef<HTMLUListElement | null>(null);
  const savedNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const counter = React.useRef(0);
  // False for the server render and hydration, so marks already on the page
  // never draw in; true for everything that mounts after.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const ready = status === "ready";
  const inert = disabled || !ready;
  const dataset = datasets.find((d) => d.id === recipe.dataset);
  const datasetStatus = dataset?.status ?? "ready";
  const colours = PALETTES[palette] ?? PALETTES.cobalt;
  const d = DENSITY[density];

  const plot = React.useMemo(
    () => (datasetStatus === "ready" ? plotRecipe(dataset, recipe) : null),
    [dataset, recipe, datasetStatus],
  );
  const { title: recipeTitle, sentence } = describeRecipe(recipe, plot);
  const alreadySaved = shelf.some((s) => sameRecipe(s.recipe, recipe));
  const canSave = !inert && plot !== null && !alreadySaved;

  /* ------------------------------- changes ----------------------------- */

  const commit = (
    next: ChartRecipeValue,
    field: ChartRecipeChange["field"],
    said: string,
  ) => {
    if (sameRecipe(next, recipe)) return;
    if (value === undefined) setOwn(next);
    onChange?.(next, { field, from: recipe, to: next });
    const after = describeRecipe(
      next,
      plotRecipe(
        datasets.find((x) => x.id === next.dataset),
        next,
      ),
    );
    setAnnouncement(
      after.sentence
        ? `${said}. Chart redrawn: ${after.sentence}`
        : `${said}. The chart is empty until a metric is chosen.`,
    );
  };

  const pickDataset = (id: string) => {
    const next = datasets.find((x) => x.id === id);
    if (!next) return;
    commit(
      {
        ...recipe,
        dataset: id,
        metric: next.metrics.some((m) => m.id === recipe.metric)
          ? recipe.metric
          : null,
        groupBy: next.dimensions.some((x) => x.id === recipe.groupBy)
          ? recipe.groupBy
          : null,
      },
      "dataset",
      `Dataset: ${next.label}`,
    );
  };

  const pickMetric = (id: string) => {
    const m = dataset?.metrics.find((x) => x.id === id);
    commit({ ...recipe, metric: id }, "metric", `Metric: ${m?.label ?? id}`);
  };

  const toggleGroup = (id: string) => {
    const next = recipe.groupBy === id ? null : id;
    const dim = dataset?.dimensions.find((x) => x.id === id);
    commit(
      { ...recipe, groupBy: next },
      "groupBy",
      next ? `Grouped by ${dim?.label ?? id}` : "Grouping cleared",
    );
  };

  const pickGrain = (grain: RecipeGrain) =>
    commit({ ...recipe, grain }, "grain", `Grain: ${grain}`);

  const pickChart = (chart: RecipeChartType) =>
    commit(
      { ...recipe, chart },
      "chart",
      `Chart type: ${CHARTS.find((c) => c.id === chart)?.label ?? chart}`,
    );

  const save = () => {
    if (!canSave) return;
    counter.current += 1;
    const item: SavedRecipe = {
      id: `${uid}-saved-${counter.current}`,
      title: recipeTitle,
      recipe,
    };
    const next = [...shelf, item];
    if (saved === undefined) setOwnSaved(next);
    setLanded(item.id);
    onSave?.(item, next);
    onSavedChange?.(next, { kind: "save", item });
    setAnnouncement(
      `Saved: ${item.title}. ${next.length} saved chart${next.length === 1 ? "" : "s"}.`,
    );
  };

  const openSaved = (item: SavedRecipe) => {
    if (inert) return;
    if (value === undefined) setOwn(item.recipe);
    onChange?.(item.recipe, { field: "open", from: recipe, to: item.recipe });
    setAnnouncement(`Opened ${item.title}.`);
  };

  const removeSaved = (item: SavedRecipe) => {
    if (inert) return;
    const i = shelf.findIndex((s) => s.id === item.id);
    const next = shelf.filter((s) => s.id !== item.id);
    if (saved === undefined) setOwnSaved(next);
    onSavedChange?.(next, { kind: "remove", item });
    setAnnouncement(
      `Removed ${item.title}. ${next.length} saved chart${next.length === 1 ? "" : "s"}.`,
    );
    const neighbour = next[Math.min(i, next.length - 1)];
    if (neighbour) savedNodes.current.get(neighbour.id)?.focus();
  };

  /* ------------------------------- readout ----------------------------- */

  const activeIndex =
    plot && active !== null ? clamp(active, 0, plot.bins.length - 1) : null;
  const valueText =
    plot && activeIndex !== null
      ? `${plot.bins[activeIndex]?.long ?? ""}: ${plot.series
          .map(
            (s) =>
              `${s.label} ${formatRecipeValue(s.values[activeIndex] ?? 0, plot.metric)}`,
          )
          .join(", ")}`
      : plot
        ? `${plot.bins.length} ${recipe.grain}s; arrows read each one`
        : "Empty chart";

  const activeSavedId =
    activeSaved && shelf.some((s) => s.id === activeSaved)
      ? activeSaved
      : (shelf[0]?.id ?? null);

  /* ------------------------------- render ------------------------------ */

  const metricOptions = (dataset?.metrics ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    hint: (m.aggregate ?? "sum") === "mean" ? "mean" : "sum",
  }));

  const recipeColumn = (
    <div
      className={cn(
        "flex shrink-0 flex-col @min-[40rem]:min-h-0 @min-[40rem]:w-[14.5rem] @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain @min-[40rem]:border-r @min-[40rem]:border-hairline",
        d.sections,
        "px-4 py-3",
      )}
    >
      <div
        className={cn(
          "grid grid-cols-2 gap-x-3 @min-[40rem]:grid-cols-1",
          d.sections,
        )}
      >
        <section className="flex min-w-0 flex-col gap-1.5">
          <SectionLabel>Dataset</SectionLabel>
          <OptionList
            layoutKey={`${uid}-dataset`}
            label="Dataset"
            options={datasets.map((x) => ({ id: x.id, label: x.label }))}
            value={recipe.dataset}
            onSelect={pickDataset}
            inert={inert}
            density={density}
            motionSafe={motionSafe}
          />
          {dataset?.caption ? (
            <span className="truncate pl-2.5 text-[11px] text-ink-3">
              {dataset.caption}
            </span>
          ) : null}
        </section>
        <section className="flex min-w-0 flex-col gap-1.5">
          <SectionLabel>Metric</SectionLabel>
          {metricOptions.length ? (
            <OptionList
              layoutKey={`${uid}-metric`}
              label="Metric"
              options={metricOptions}
              value={recipe.metric}
              onSelect={pickMetric}
              inert={inert}
              density={density}
              motionSafe={motionSafe}
              listRef={(node) => {
                metricList.current = node;
              }}
            />
          ) : (
            <span className="pl-2.5 text-[11px] text-ink-3">No metrics</span>
          )}
        </section>
      </div>
      <section className="flex min-w-0 flex-col gap-1.5">
        <SectionLabel>Group by</SectionLabel>
        {dataset?.dimensions.length ? (
          <ChipRow
            label="Group by"
            chips={dataset.dimensions.map((x) => ({
              id: x.id,
              label: x.label,
            }))}
            value={recipe.groupBy}
            onToggle={toggleGroup}
            inert={inert}
            density={density}
            motionSafe={motionSafe}
          />
        ) : (
          <span className="text-[11px] text-ink-3">Nothing to group by</span>
        )}
      </section>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 @min-[40rem]:flex-col @min-[40rem]:items-stretch">
        <section className="flex min-w-0 flex-col gap-1.5">
          <SectionLabel>Grain</SectionLabel>
          <Segmented
            layoutKey={`${uid}-grain`}
            label="Time grain"
            options={GRAINS}
            value={recipe.grain}
            onSelect={pickGrain}
            inert={inert}
            density={density}
            motionSafe={motionSafe}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-1.5">
          <SectionLabel>Chart</SectionLabel>
          <Segmented
            layoutKey={`${uid}-chart`}
            label="Chart type"
            options={CHARTS}
            value={recipe.chart}
            onSelect={pickChart}
            inert={inert}
            density={density}
            motionSafe={motionSafe}
            iconsOnly
          />
        </section>
      </div>
    </div>
  );

  const recipeSkeleton = (
    <div
      aria-hidden
      className="flex shrink-0 flex-col gap-4 px-4 py-3 @min-[40rem]:w-[14.5rem] @min-[40rem]:border-r @min-[40rem]:border-hairline"
    >
      {[3, 4, 2, 3].map((n, s) => (
        <div key={s} className="flex flex-col gap-1.5">
          <span className="h-2.5 w-12 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
          <div className="flex flex-wrap gap-1.5 @min-[40rem]:flex-col">
            {Array.from({ length: n }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                  d.row,
                )}
                style={{
                  width: 64 + ((s * 7 + i * 23) % 48),
                  animationDelay: `${(s * n + i) * 60}ms`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const plotSkeleton = (
    <div
      aria-hidden
      className="flex min-h-0 flex-1 items-end gap-[3px] rounded-3 border border-hairline bg-surface-1 px-10 pt-6 pb-6"
    >
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="flex-1 rounded-t-[2px] bg-surface-2 motion-safe:animate-pulse"
          style={{
            height: `${30 + ((i * 37) % 55)}%`,
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  );

  const legend =
    plot && plot.series.length > 1 ? (
      <ul
        aria-label={`Series, by ${plot.dimension?.label.toLowerCase() ?? "group"}`}
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
      >
        <AnimatePresence initial={false}>
          {plot.series.map((s, k) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                y: motionSafe
                  ? {
                      ...springs.glide,
                      delay: r3(k * cascade(plot.series.length)),
                    }
                  : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
              className="flex items-center gap-1.5 text-[11px] text-ink-2"
            >
              <span
                aria-hidden
                className="size-2 rounded-[2px]"
                style={{ background: colours[k % colours.length] }}
              />
              {s.label}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    ) : null;

  const chartBody =
    status === "error" ? (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-3 border border-hairline bg-surface-1 px-6 py-8 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">
          The datasets didn&apos;t load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : status === "loading" || datasetStatus === "loading" ? (
      <>
        {plotSkeleton}
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {status === "loading"
            ? "Loading datasets"
            : `Loading ${dataset?.label ?? "dataset"}`}
        </p>
      </>
    ) : datasetStatus === "error" ? (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-3 border border-hairline bg-surface-1 px-6 py-8 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">
          {dataset?.label ?? "This dataset"} didn&apos;t load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : !plot ? (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-3 border border-dashed border-hairline-strong bg-surface-1 px-6 py-8 text-center">
        <Sigma aria-hidden className="size-5 text-ink-3" />
        <p className="text-sm text-ink-2">
          {!dataset
            ? "Pick a dataset to start a chart."
            : dataset.rows.length === 0
              ? `${dataset.label} has no rows yet.`
              : "Pick a metric to draw this chart."}
        </p>
        {dataset && dataset.rows.length > 0 && !inert ? (
          <button
            type="button"
            onClick={() => {
              const first =
                metricList.current?.querySelector<HTMLElement>(
                  '[role="option"]',
                );
              first?.focus();
            }}
            className={cn(
              "mt-1 inline-flex h-7 items-center rounded-2 border border-hairline bg-card px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Choose a metric
          </button>
        ) : null}
      </div>
    ) : (
      <>
        {legend ? (
          <div className="flex shrink-0 items-center">{legend}</div>
        ) : null}
        <Plot
          plot={plot}
          chart={recipe.chart}
          colours={colours}
          morph={morph}
          motionSafe={motionSafe}
          live={live}
          active={activeIndex}
          valueText={valueText}
          label={`${recipeTitle}, by ${recipe.grain}`}
          onActive={setActive}
        />
        <table className="sr-only">
          <caption>{sentence}</caption>
          <thead>
            <tr>
              <th scope="col">{recipe.grain}</th>
              {plot.series.map((s) => (
                <th key={s.id} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plot.bins.map((bin, i) => (
              <tr key={bin.key}>
                <th scope="row">{bin.long}</th>
                {plot.series.map((s) => (
                  <td key={s.id}>
                    {formatRecipeValue(s.values[i] ?? 0, plot.metric)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          <span className="hidden truncate text-[11px] text-ink-3 @min-[30rem]:inline">
            Basinworks Analytics
          </span>
        </div>
        <motion.button
          type="button"
          onClick={save}
          aria-disabled={!canSave || undefined}
          whileTap={canSave && motionSafe ? { scale: 0.96 } : undefined}
          transition={springs.flick}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border px-2.5 text-xs font-medium transition-colors",
            canSave
              ? "border-transparent bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--accent)_88%,var(--ink))]"
              : alreadySaved && plot
                ? "cursor-default border-hairline text-success"
                : "cursor-default border-hairline text-ink-3",
            FOCUS_RING,
          )}
        >
          {alreadySaved && plot ? (
            <BookmarkCheck aria-hidden className="size-3.5" />
          ) : (
            <Bookmark aria-hidden className="size-3.5" />
          )}
          {alreadySaved && plot ? "Saved" : "Save chart"}
        </motion.button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain @min-[40rem]:flex-row @min-[40rem]:overflow-hidden">
        <LayoutGroup id={uid}>
          {status === "loading"
            ? recipeSkeleton
            : status === "error"
              ? null
              : recipeColumn}
        </LayoutGroup>

        <div className="flex min-w-0 flex-1 flex-col border-t border-hairline @min-[40rem]:min-h-0 @min-[40rem]:border-t-0">
          <figure
            aria-labelledby={sentenceId}
            className="flex h-[260px] shrink-0 flex-col gap-2 px-4 pt-3 pb-2 @min-[40rem]:h-auto @min-[40rem]:min-h-0 @min-[40rem]:flex-1"
          >
            {chartBody}
            <figcaption
              id={sentenceId}
              className="relative min-h-[2.5em] text-[12px] leading-snug text-ink-2"
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  key={sentence || "empty"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                  className="block"
                >
                  {sentence || (status === "ready" ? "Nothing drawn yet." : "")}
                </motion.span>
              </AnimatePresence>
            </figcaption>
          </figure>

          {/* shelf */}
          <div
            className="flex shrink-0 items-center gap-3 border-t border-hairline px-4"
            style={{ height: d.shelf }}
          >
            <SectionLabel>Saved</SectionLabel>
            {shelf.length === 0 ? (
              <span className="text-[11px] text-ink-3">
                Saved charts land here
              </span>
            ) : (
              <ul
                role="listbox"
                aria-label="Saved charts"
                aria-orientation="horizontal"
                className="-m-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain p-1"
              >
                <AnimatePresence initial={false}>
                  {shelf.map((item, i) => {
                    const current = sameRecipe(item.recipe, recipe);
                    const itemPlot = plotRecipe(
                      datasets.find((x) => x.id === item.recipe.dataset),
                      item.recipe,
                    );
                    const isLanding = item.id === landed;
                    return (
                      <motion.li
                        key={item.id}
                        role="option"
                        aria-selected={current}
                        layout={motionSafe ? "position" : false}
                        initial={
                          live
                            ? isLanding && motionSafe
                              ? { opacity: 0, scale: 0.7, y: distances.step }
                              : { opacity: 0 }
                            : false
                        }
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          scale: motionSafe ? 0.9 : 1,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{
                          layout: springs.glide,
                          scale: motionSafe ? springs.recoil : { duration: 0 },
                          y: motionSafe ? springs.recoil : { duration: 0 },
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                          },
                        }}
                        className="group relative shrink-0"
                      >
                        <button
                          ref={(node) => {
                            if (node) savedNodes.current.set(item.id, node);
                            else savedNodes.current.delete(item.id);
                          }}
                          type="button"
                          tabIndex={activeSavedId === item.id ? 0 : -1}
                          aria-label={`${item.title}${current ? ", open" : ""}`}
                          title={item.title}
                          aria-disabled={inert || undefined}
                          onFocus={() => setActiveSaved(item.id)}
                          onClick={() => openSaved(item)}
                          onKeyDown={(event) => {
                            if (
                              event.key === "Delete" ||
                              event.key === "Backspace"
                            ) {
                              event.preventDefault();
                              removeSaved(item);
                              return;
                            }
                            const to = roveIndex(event.key, i, shelf.length);
                            if (to === null) return;
                            event.preventDefault();
                            const target = shelf[to];
                            if (target)
                              savedNodes.current.get(target.id)?.focus();
                          }}
                          className={cn(
                            "block overflow-hidden rounded-2 border bg-surface-1 transition-colors",
                            current
                              ? "border-cobalt-bright"
                              : "border-hairline-strong hover:border-ink-3",
                            inert ? "cursor-not-allowed" : "cursor-pointer",
                            FOCUS_RING,
                          )}
                          style={{
                            width: THUMB_W,
                            height: Math.max(36, d.shelf - 28),
                          }}
                        >
                          <Thumb
                            plot={itemPlot}
                            chart={item.recipe.chart}
                            colours={colours}
                          />
                        </button>
                        {!inert ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            aria-label={`Remove ${item.title}`}
                            onClick={() => removeSaved(item)}
                            className={cn(
                              "absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-hairline-strong bg-card text-ink-3 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground",
                              FOCUS_RING,
                            )}
                          >
                            <X aria-hidden className="size-2.5" />
                          </button>
                        ) : null}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
