"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";
import {
  Bookmark,
  Check,
  ChevronDown,
  Menu,
  Monitor,
  RotateCcw,
  Smartphone,
  Store,
  Tablet,
  X,
  type LucideIcon,
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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridDensity,
  type DataGridRow,
} from "@/registry/ui/data-grid";
import {
  defaultPulseMetrics,
  defaultPulseNow,
  PulseDashboard,
  type PulseBreakdown,
  type PulseMetric,
  type PulseRange,
  type PulseWindow,
} from "@/registry/ui/pulse-dashboard";

/* --------------------------------- types --------------------------------- */

export type ConsoleRange = PulseRange;
export type ConsoleGrid = "bento" | "even" | "stack";
export type ConsoleDensity = DataGridDensity;
export type ConsoleStatus = "ready" | "loading" | "error";

export type ConsoleSite = {
  id: string;
  name: string;
  /** The store's address, shown under its name: "fernworks.shop". */
  host: string;
};

export type ConsoleOption = {
  id: string;
  label: string;
  /** Its share of visitors, 0 to 1. */
  share: number;
  /** How much better or worse than average it converts: 1 is average. */
  convert?: number;
};

export type ConsoleDimension = {
  /** "device", "channel", "country": the filters' keys. */
  id: string;
  label: string;
  options: ConsoleOption[];
};

/** A dimension's id to the option chosen for it; absent means all. */
export type ConsoleFilters = Record<string, string>;

export type ConsoleView = { id: string; name: string; filters: ConsoleFilters };

export type ConsoleWindow = PulseWindow;

export type ConsoleQuery = {
  site: string;
  /** First and last day of the window, YYYY-MM-DD, both included. */
  from: string;
  to: string;
  filters: ConsoleFilters;
};

export type ConsoleBar = { id: string; label: string; value: number };

export type ConsoleData = {
  /** Whole daily series ending at `now`: the KPI panel windows them itself. */
  metrics: PulseMetric[];
  /** Whole daily series of revenue by segment, for the donut. */
  breakdowns: PulseBreakdown[];
  /** Visitors in the window by channel. */
  sources: ConsoleBar[];
  /** Visitors in the window by device; ids "desktop", "mobile", "tablet" get icons. */
  devices: ConsoleBar[];
  /** Visitors in the window by country, most first. */
  countries: ConsoleBar[];
  /** Visits in the window by weekday (Monday first) and hour: 7 × 24 numbers. */
  hours: number[];
  /** The window's pages: page, views, visitors, time (s), bounce (%), revenue. */
  pages: DataGridRow[];
};

export type AnalyticsConsoleProps = {
  /** The stores in the sidebar. @default defaultConsoleSites */
  sites?: ConsoleSite[];
  /** Controlled store id. */
  site?: string;
  /** Initial store when uncontrolled. @default the first store */
  defaultSite?: string;
  /** Fires from the sidebar row or key that chose a store. */
  onSiteChange?: (id: string) => void;
  /** Saved sets of filters in the sidebar. @default defaultConsoleViews */
  views?: ConsoleView[];
  /** What the filters bar can split by. @default defaultConsoleDimensions */
  dimensions?: ConsoleDimension[];
  /** Controlled filters. */
  filters?: ConsoleFilters;
  /** Initial filters when uncontrolled. @default {} */
  defaultFilters?: ConsoleFilters;
  /** Fires from the chip, view or Clear that changed the filters. */
  onFiltersChange?: (filters: ConsoleFilters) => void;
  /** Controlled period: the last 7, 30 or 90 days, or the last year. */
  range?: ConsoleRange;
  /** Initial period when uncontrolled. @default "30d" */
  defaultRange?: ConsoleRange;
  /** Fires from the period switch with the new period. */
  onRangeChange?: (range: ConsoleRange) => void;
  /** Fires whenever the window changes: a period, a zoom on the chart or its reset. */
  onWindowChange?: (window: ConsoleWindow) => void;
  /** Answers a query: a store, a window of days and filters. @default defaultConsoleData (seeded) */
  data?: (query: ConsoleQuery) => ConsoleData;
  /** The last day of data (Date or ms). @default defaultConsoleNow */
  now?: Date | number;
  /** How the four charts are arranged: one doubled up, evenly, or one under another. @default "bento" */
  grid?: ConsoleGrid;
  /** The table's rows (32, 40 or 48px), the panels' padding, the bars and the gaps. @default "regular" */
  density?: ConsoleDensity;
  /** The locale for numbers and money. @default "en-US" */
  locale?: string;
  /** The currency for money. @default "USD" */
  currency?: string;
  /** Whether the numbers have arrived. @default "ready" */
  status?: ConsoleStatus;
  /** "Try again" was pressed after the numbers failed to load. */
  onRetry?: () => void;
  /** The console's accessible name. @default "Analytics" */
  label?: string;
  /** Play the ticks and swishes. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

/** The last day of September 2026, the last day of data. */
export const defaultConsoleNow = defaultPulseNow;

export const defaultConsoleSites: ConsoleSite[] = [
  { id: "fernworks", name: "Fernworks Supply", host: "fernworks.shop" },
  { id: "basinworks", name: "Basinworks Outfitters", host: "basinworks.store" },
  { id: "coldbrook", name: "Coldbrook Coffee", host: "coldbrook.coffee" },
];

export const defaultConsoleDimensions: ConsoleDimension[] = [
  {
    id: "device",
    label: "Device",
    options: [
      { id: "desktop", label: "Desktop", share: 0.38, convert: 1.3 },
      { id: "mobile", label: "Mobile", share: 0.54, convert: 0.8 },
      { id: "tablet", label: "Tablet", share: 0.08, convert: 1 },
    ],
  },
  {
    id: "channel",
    label: "Channel",
    options: [
      { id: "search", label: "Search", share: 0.34, convert: 1.1 },
      { id: "direct", label: "Direct", share: 0.24, convert: 1.3 },
      { id: "social", label: "Social", share: 0.18, convert: 0.6 },
      { id: "email", label: "Email", share: 0.13, convert: 1.6 },
      { id: "referral", label: "Referral", share: 0.11, convert: 0.9 },
    ],
  },
  {
    id: "country",
    label: "Country",
    options: [
      { id: "us", label: "United States", share: 0.42, convert: 1.05 },
      { id: "uk", label: "United Kingdom", share: 0.17, convert: 1 },
      { id: "de", label: "Germany", share: 0.12, convert: 0.95 },
      { id: "ca", label: "Canada", share: 0.1, convert: 1 },
      { id: "au", label: "Australia", share: 0.08, convert: 0.9 },
      { id: "other", label: "Elsewhere", share: 0.11, convert: 0.8 },
    ],
  },
];

export const defaultConsoleViews: ConsoleView[] = [
  { id: "all", name: "All traffic", filters: {} },
  { id: "mobile", name: "Mobile shoppers", filters: { device: "mobile" } },
  {
    id: "email-us",
    name: "Email, United States",
    filters: { channel: "email", country: "us" },
  },
];

const DAY = 86_400_000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const r6 = (v: number) => Number(v.toFixed(6));
const toMs = (d: Date | number) => (typeof d === "number" ? d : d.getTime());
const isoAt = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const dayOf = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
};

/** A repeatable number in [-1, 1] from integers, the same in Node and the browser. */
function noise(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) h = Math.imul(h ^ (p | 0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

const STORE: Record<string, { seed: number; scale: number; convert: number }> =
  {
    fernworks: { seed: 11, scale: 1, convert: 1 },
    basinworks: { seed: 23, scale: 0.62, convert: 1.12 },
    coldbrook: { seed: 37, scale: 0.38, convert: 0.86 },
  };

const BASE = {
  revenue: defaultPulseMetrics.find((m) => m.id === "revenue")?.series ?? [],
  orders: defaultPulseMetrics.find((m) => m.id === "orders")?.series ?? [],
  conversion:
    defaultPulseMetrics.find((m) => m.id === "conversion")?.series ?? [],
  refunds: defaultPulseMetrics.find((m) => m.id === "refunds")?.series ?? [],
};

/** Path, weight, seconds on page, bounce, share of revenue. */
const PAGES: [string, number, number, number, number][] = [
  ["/", 1, 34, 38, 0.02],
  ["/shop", 0.72, 52, 31, 0.06],
  ["/shop/linen-apron", 0.41, 88, 27, 0.22],
  ["/shop/field-jacket", 0.36, 96, 24, 0.26],
  ["/shop/enamel-mug", 0.29, 61, 33, 0.12],
  ["/journal/waxed-cotton-care", 0.22, 184, 52, 0.02],
  ["/cart", 0.2, 45, 18, 0.2],
  ["/shop/canvas-tote", 0.17, 58, 30, 0.08],
  ["/about", 0.09, 71, 61, 0.01],
  ["/help/returns", 0.08, 66, 44, 0.01],
];

/**
 * The seeded store data: two years of days for three stores. Filters scale
 * the traffic by their shares (with a little day-to-day drift) and the
 * revenue by how well that slice converts.
 */
export function defaultConsoleData(query: ConsoleQuery): ConsoleData {
  const store = STORE[query.site] ?? { seed: 11, scale: 1, convert: 1 };
  const n = BASE.revenue.length;
  const chosen = defaultConsoleDimensions.map((dim, di) => {
    const k = dim.options.findIndex((o) => o.id === query.filters[dim.id]);
    return { dim, di, k, opt: k === -1 ? undefined : dim.options[k] };
  });
  const convert = chosen.reduce(
    (c, x) => c * (x.opt?.convert ?? 1),
    store.convert,
  );

  const revenue: number[] = [];
  const orders: number[] = [];
  const conversion: number[] = [];
  const refunds: number[] = [];
  const visitors: number[] = [];
  const share: number[] = [];
  for (let i = 0; i < n; i += 1) {
    let f = store.scale * (1 + 0.06 * noise(store.seed, i >> 3));
    for (const x of chosen) {
      if (x.opt) f *= x.opt.share * (1 + 0.1 * noise(store.seed, x.di, x.k, i));
    }
    share.push(f);
    const conv = Math.min(0.2, (BASE.conversion[i] ?? 0.03) * convert);
    const o = Math.round(
      (BASE.orders[i] ?? 0) * f * (conv / (BASE.conversion[i] || 0.03)),
    );
    orders.push(o);
    revenue.push(
      r2((BASE.revenue[i] ?? 0) * f * (conv / (BASE.conversion[i] || 0.03))),
    );
    conversion.push(r6(conv));
    refunds.push(r6((BASE.refunds[i] ?? 0.02) * (2 - store.convert)));
    visitors.push(
      Math.round(((BASE.orders[i] ?? 0) / (BASE.conversion[i] || 0.03)) * f),
    );
  }

  const a = indexOf(query.from, n);
  const b = indexOf(query.to, n);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let total = 0;
  let money = 0;
  for (let i = lo; i <= hi; i += 1) {
    total += visitors[i] ?? 0;
    money += revenue[i] ?? 0;
  }

  /** Visitors in the window split over a dimension, drifting a little by month. */
  const split = (di: number): ConsoleBar[] => {
    const dim = defaultConsoleDimensions[di];
    if (!dim) return [];
    const only = query.filters[dim.id];
    return dim.options
      .map((o, k) => {
        if (only && o.id !== only)
          return { id: o.id, label: o.label, value: 0 };
        if (only) return { id: o.id, label: o.label, value: Math.round(total) };
        const drift = 1 + 0.18 * noise(store.seed, di, k, lo >> 5, hi >> 5);
        return { id: o.id, label: o.label, value: o.share * drift };
      })
      .map((b, _, all) => {
        if (only) return b;
        const sum = all.reduce((s, x) => s + x.value, 0) || 1;
        return { ...b, value: Math.round((b.value / sum) * total) };
      })
      .filter((b) => b.value > 0);
  };

  const hours: number[] = [];
  let weight = 0;
  for (let d = 0; d < 7; d += 1) {
    const weekend = d >= 5;
    for (let h = 0; h < 24; h += 1) {
      const bump = (c: number, w: number, s: number) =>
        s * Math.exp(-((h - c) ** 2) / (2 * w * w));
      const v =
        (0.08 +
          bump(weekend ? 10.5 : 8, 1.4, weekend ? 0.35 : 0.3) +
          bump(12.5, 1.5, weekend ? 0.7 : 0.55) +
          bump(weekend ? 19 : 20.5, 2, 1)) *
        (1 + 0.28 * noise(store.seed, d, h, lo >> 3));
      hours.push(v);
      weight += v;
    }
  }
  const visits = total * 1.3;
  const hourly = hours.map((v) => Math.round((v / (weight || 1)) * visits));

  const pages: DataGridRow[] = PAGES.map(([path, w, time, bounce, cut], k) => {
    const views = Math.round(
      total * 2.6 * (w / 3.54) * (1 + 0.16 * noise(store.seed, k, lo >> 2)),
    );
    return {
      id: `page-${k}`,
      page: path,
      views,
      visitors: Math.round(views * (0.64 + 0.1 * noise(store.seed, k, 3))),
      time: Math.max(
        8,
        Math.round(time * (1 + 0.14 * noise(store.seed, k, 5, lo >> 4))),
      ),
      bounce: r2(
        Math.min(
          92,
          Math.max(6, bounce * (1 + 0.18 * noise(store.seed, k, 7, hi >> 4))),
        ),
      ),
      revenue: r2(money * cut),
    };
  }).sort((a, b) => Number(b.views) - Number(a.views));

  /** Each day's revenue split over a dimension; the parts add up to the day. */
  const segments = (di: number) => {
    const dim = defaultConsoleDimensions[di];
    if (!dim) return [];
    const only = query.filters[dim.id];
    const weights = (i: number) =>
      dim.options.map((o, k) =>
        only
          ? o.id === only
            ? 1
            : 0
          : o.share * (1 + 0.15 * noise(store.seed, di, k, i >> 5)),
      );
    const lists = dim.options.map(() => [] as number[]);
    revenue.forEach((r, i) => {
      const w = weights(i);
      const sum = w.reduce((a, x) => a + x, 0) || 1;
      w.forEach((x, k) => lists[k]?.push(r2((r * x) / sum)));
    });
    return dim.options.map((o, k) => ({
      id: o.id,
      label: o.label,
      series: lists[k] ?? [],
    }));
  };

  return {
    metrics: [
      { id: "revenue", label: "Revenue", kind: "money", series: revenue },
      { id: "orders", label: "Orders", kind: "count", series: orders },
      {
        id: "conversion",
        label: "Conversion",
        kind: "percent",
        series: conversion,
      },
      {
        id: "refunds",
        label: "Refund rate",
        kind: "percent",
        goodWhen: "down",
        series: refunds,
      },
    ],
    breakdowns: [
      { id: "channel", label: "Channel", segments: segments(1) },
      { id: "device", label: "Device", segments: segments(0) },
    ],
    sources: split(1),
    devices: split(0),
    // "Elsewhere" is everyone else, not a country to rank.
    countries: split(2)
      .filter((b) => b.id !== "other")
      .sort((a, b) => b.value - a.value),
    hours: hourly,
    pages,
  };
}

/** A date's place in the seeded series, whose last day is `defaultConsoleNow`. */
function indexOf(iso: string, n: number): number {
  const last = Math.floor(defaultConsoleNow / DAY);
  return Math.max(0, Math.min(n - 1, n - 1 - (last - dayOf(iso))));
}

/* -------------------------------- helpers -------------------------------- */

const RANGE_DAYS: Record<ConsoleRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};
const RANGE_NAMES: Record<ConsoleRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "1y": "Last year",
};
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const short = (iso: string) => {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`;
};
const pad2 = (n: number) => String(n).padStart(2, "0");
const keyOf = (f: ConsoleFilters) =>
  Object.keys(f)
    .filter((k) => f[k])
    .sort()
    .map((k) => `${k}=${f[k]}`)
    .join("&");

const DENSITY: Record<
  ConsoleDensity,
  { pad: string; gap: string; bar: number; cell: number; text: string }
> = {
  compact: { pad: "p-3", gap: "gap-2", bar: 6, cell: 9, text: "text-[12px]" },
  regular: { pad: "p-4", gap: "gap-3", bar: 8, cell: 11, text: "text-[13px]" },
  roomy: { pad: "p-5", gap: "gap-4", bar: 10, cell: 13, text: "text-sm" },
};

const DEVICE_ICONS: Record<string, LucideIcon> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** A figure that counts to its new value on glide, digits held to one width. */
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
  const text = useTransform(mv, (v) => format(Math.round(v)));
  React.useEffect(() => {
    const c = animate(mv, value, motionSafe ? springs.glide : { duration: 0 });
    return () => c.stop();
  }, [mv, value, motionSafe]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/* ---------------------------------- panel ---------------------------------- */

function Panel({
  id,
  title,
  note,
  span,
  arrangement,
  motionSafe,
  pad,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  span: { c: number; r: number };
  arrangement: string;
  motionSafe: boolean;
  pad: string;
  children: React.ReactNode;
}) {
  const t: Transition = {
    layout: motionSafe ? springs.glide : { duration: 0 },
  };
  return (
    <motion.section
      layout
      layoutDependency={arrangement}
      transition={t}
      aria-labelledby={id}
      className="min-w-0 overflow-clip border border-hairline bg-card"
      style={{
        gridColumn: `span ${span.c} / span ${span.c}`,
        gridRow: `span ${span.r} / span ${span.r}`,
        borderRadius: 16,
      }}
    >
      <motion.div
        layout="position"
        layoutDependency={arrangement}
        transition={t}
        className={cn("flex flex-col gap-3", pad)}
      >
        <header className="flex items-baseline justify-between gap-3">
          <h3 id={id} className="truncate text-[13px] font-semibold">
            {title}
          </h3>
          {note ? (
            <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
              {note}
            </span>
          ) : null}
        </header>
        {children}
      </motion.div>
    </motion.section>
  );
}

type Said = { n: number; text: string };
type Menu = { dim: string; from: HTMLButtonElement; left: number };

/**
 * A complete store analytics screen. Every panel reads one query — a store,
 * a window of days and a set of filters — and when any part of it changes
 * the whole console moves in one beat: the composed KPI panel rolls its
 * digits and glides its chart, the source bars glide to their new lengths
 * in cascade while their figures count, the device split re-divides, the
 * countries re-rank by gliding to new rows, the hours re-tint on a diagonal
 * wave, and the composed pages table refetches and arrives in its own
 * cascade. A brush on the KPI chart narrows the window, and every panel
 * follows it.
 *
 * The four charts are arranged by `grid` and the container's width, and a
 * change of either moves every panel to its new cell on glide. Filters are
 * chips that open a menu; saved views apply a set at once; the sidebar of
 * stores becomes a drawer that can be dragged away below 900px.
 *
 * The chips' menus are real menus (arrows, Home, End, Enter, Escape back to
 * the chip), stores and views rove with the arrow keys, and each change of
 * query is announced once. Under reduced motion the bars, splits and tints
 * take their new values at once behind a short fade, figures swap, panels
 * reflow in place, and every number still changes.
 */
export function AnalyticsConsole({
  sites = defaultConsoleSites,
  site,
  defaultSite,
  onSiteChange,
  views = defaultConsoleViews,
  dimensions = defaultConsoleDimensions,
  filters,
  defaultFilters = {},
  onFiltersChange,
  range,
  defaultRange = "30d",
  onRangeChange,
  onWindowChange,
  data = defaultConsoleData,
  now = defaultConsoleNow,
  grid = "bento",
  density = "regular",
  locale = "en-US",
  currency = "USD",
  status = "ready",
  onRetry,
  label = "Analytics",
  sound = false,
  disabled = false,
  className,
}: AnalyticsConsoleProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.regular;
  const today = Math.floor(toMs(now) / DAY);

  const count = React.useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const fmt = (v: number) => count.format(v);

  /* ------------------------------ the query ------------------------------ */

  const [ownSite, setOwnSite] = React.useState(
    defaultSite ?? sites[0]?.id ?? "",
  );
  const siteId = site ?? ownSite;
  const store = sites.find((s) => s.id === siteId) ?? sites[0];
  const [ownFilters, setOwnFilters] =
    React.useState<ConsoleFilters>(defaultFilters);
  const active = filters ?? ownFilters;
  const filterKey = keyOf(active);
  const [ownRange, setOwnRange] = React.useState<ConsoleRange>(defaultRange);
  const period = range ?? ownRange;
  const [custom, setCustom] = React.useState<{
    from: string;
    to: string;
  } | null>(null);
  // A period from the host drops a zoom, as the switch itself does.
  const [seenPeriod, setSeenPeriod] = React.useState(period);
  if (seenPeriod !== period) {
    setSeenPeriod(period);
    if (custom) setCustom(null);
  }
  const span = RANGE_DAYS[period] ?? 30;
  const win = custom ?? { from: isoAt(today - span + 1), to: isoAt(today) };
  const days = dayOf(win.to) - dayOf(win.from) + 1;

  const whole = React.useMemo(
    () =>
      data({
        site: store?.id ?? "",
        from: isoAt(today - 729),
        to: isoAt(today),
        filters: active,
      }),
    // The filters are read through their key, so a new object with the same choices is no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, store?.id, today, filterKey],
  );
  const windowed = React.useMemo(
    () =>
      data({
        site: store?.id ?? "",
        from: win.from,
        to: win.to,
        filters: active,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, store?.id, win.from, win.to, filterKey],
  );

  // The pages table refetches for each new query: a short skeleton, then
  // its rows arrive in its own cascade.
  const queryKey = `${store?.id}|${win.from}|${win.to}|${filterKey}`;
  const [shownKey, setShownKey] = React.useState(queryKey);
  const refreshing = shownKey !== queryKey;
  React.useEffect(() => {
    if (shownKey === queryKey) return;
    const t = window.setTimeout(() => setShownKey(queryKey), 280);
    return () => window.clearTimeout(t);
  }, [queryKey, shownKey]);

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const describe = (f: ConsoleFilters) => {
    const parts = dimensions
      .map((dim) => dim.options.find((o) => o.id === f[dim.id])?.label)
      .filter(Boolean);
    return parts.length ? parts.join(", ") : "all traffic";
  };

  const setFilters = (next: ConsoleFilters, sentence?: string) => {
    if (keyOf(next) === filterKey) return;
    if (filters === undefined) setOwnFilters(next);
    onFiltersChange?.(next);
    say(sentence ?? `Showing ${describe(next)}.`);
  };

  const chooseSite = (id: string) => {
    const s = sites.find((x) => x.id === id);
    if (!s || disabled) return;
    if (id !== siteId) {
      if (site === undefined) setOwnSite(id);
      onSiteChange?.(id);
      audio.play("tick", { pitch: 1.1, gain: 0.4 });
      say(`${s.name}.`);
    }
    if (narrow) closeNav();
  };

  /* ------------------------------ the frame ------------------------------ */

  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!rootNode) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setWidth(Math.round(w));
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);
  // Below 900px the stores fold into a drawer, so a tablet's main column
  // is wide enough for the KPI panel's own wide layout.
  const narrow = width !== null && width < 900;
  const mainW = width === null ? 736 : narrow ? width : width - 200;
  const cols = grid === "stack" || mainW < 520 ? 1 : mainW < 900 ? 2 : 4;
  const arrangement = `${grid}|${cols}`;
  const spanOf = (panel: "sources" | "devices" | "countries" | "hours") => {
    if (cols === 1 || grid !== "bento") return { c: 1, r: 1 };
    if (cols === 2)
      return panel === "sources" || panel === "hours"
        ? { c: 2, r: 1 }
        : { c: 1, r: 1 };
    return panel === "sources"
      ? { c: 2, r: 2 }
      : panel === "hours"
        ? { c: 2, r: 1 }
        : { c: 1, r: 1 };
  };

  /* --------------------------------- nav --------------------------------- */

  const [navOpen, setNavOpen] = React.useState(false);
  const [navClosing, setNavClosing] = React.useState(false);
  const refocusMenu = React.useRef(false);
  const navX = useMotionValue(0);
  const navAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const navPanel = React.useRef<HTMLDivElement | null>(null);
  const menuButton = React.useRef<HTMLButtonElement | null>(null);
  const [navNode, setNavNode] = React.useState<HTMLDivElement | null>(null);
  const navW = React.useRef(260);

  const openNav = () => {
    if (disabled) return;
    setNavOpen(true);
    setNavClosing(false);
    audio.play("swish", { pitch: 1.1, gain: 0.35 });
  };
  const closeNav = (velocity?: number) => {
    if (!navOpen || navClosing) return;
    setNavClosing(true);
    refocusMenu.current = true;
    audio.play("swish", { pitch: 0.85, gain: 0.3 });
    const t: Transition = !motionSafe
      ? { duration: durations.fast }
      : velocity !== undefined
        ? { ...springs.glide, velocity }
        : exitFor(durations.slow);
    navAnim.current?.stop();
    navAnim.current = animate(navX, -navW.current, {
      ...t,
      onComplete: () => {
        setNavOpen(false);
        setNavClosing(false);
      },
    });
  };
  // Focus goes back to the menu button once the work is no longer inert.
  React.useEffect(() => {
    if (!refocusMenu.current || (navOpen && !navClosing)) return;
    refocusMenu.current = false;
    menuButton.current?.focus({ preventScroll: true });
  });
  // The drawer arrives from the left edge, measured as it mounts; focus
  // goes to the store on screen.
  React.useEffect(() => {
    if (!navNode) return;
    navW.current = navNode.offsetWidth || 260;
    navX.jump(-navW.current);
    navAnim.current = animate(
      navX,
      0,
      motionSafe ? springs.glide : { duration: durations.base },
    );
    navNode
      .querySelector<HTMLElement>("[aria-current=page]")
      ?.focus({ preventScroll: true });
    return () => navAnim.current?.stop();
  }, [navNode, navX, motionSafe]);
  // Unfolding to a sidebar leaves no drawer behind.
  if (navOpen && width !== null && !narrow) setNavOpen(false);

  const navDrag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: !navOpen,
    onStart: () => navAnim.current?.stop(),
    onMove: ({ offset }) =>
      navX.set(
        r2(offset.x > 0 ? rubberband(offset.x, navW.current) : offset.x),
      ),
    onEnd: ({ velocity }) => {
      if (project(navX.get(), velocity.x, 0.99) < -navW.current * 0.4)
        closeNav(velocity.x);
      else
        navAnim.current = animate(
          navX,
          0,
          motionSafe
            ? { ...springs.glide, velocity: velocity.x }
            : { duration: 0 },
        );
    },
    onCancel: () => {
      navAnim.current = animate(navX, 0, springs.glide);
    },
  });
  const navScrim = useTransform(navX, (x) =>
    r2(0.36 * Math.max(0, 1 + x / navW.current)),
  );
  const navOpacity = useTransform(navX, (x) =>
    motionSafe ? 1 : r2(Math.max(0, 1 + x / navW.current)),
  );
  const navOffset = useTransform(navX, (x) => (motionSafe ? x : 0));

  const navItems = [
    ...sites.map((s) => ({ kind: "site" as const, id: s.id })),
    ...views.map((v) => ({ kind: "view" as const, id: v.id })),
  ];
  const [navFocus, setNavFocus] = React.useState<string | null>(null);
  const navTab =
    navFocus && navItems.some((x) => `${x.kind}:${x.id}` === navFocus)
      ? navFocus
      : `site:${store?.id}`;
  const navKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: string,
  ) => {
    const i = navItems.findIndex((x) => `${x.kind}:${x.id}` === key);
    const to =
      event.key === "ArrowDown"
        ? navItems[i + 1]
        : event.key === "ArrowUp"
          ? navItems[i - 1]
          : event.key === "Home"
            ? navItems[0]
            : event.key === "End"
              ? navItems[navItems.length - 1]
              : undefined;
    if (!to) return;
    event.preventDefault();
    const k = `${to.kind}:${to.id}`;
    setNavFocus(k);
    event.currentTarget
      .closest("nav")
      ?.querySelector<HTMLElement>(`[data-nav="${k}"]`)
      ?.focus();
  };

  const nav = (
    <nav aria-label="Analytics" className="flex flex-col gap-4 px-2 py-3">
      <div>
        <p className="px-2.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Stores
        </p>
        <ul className="flex flex-col gap-0.5">
          {sites.map((s) => {
            const on = s.id === store?.id;
            const k = `site:${s.id}`;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  data-nav={k}
                  aria-current={on ? "page" : undefined}
                  tabIndex={navTab === k ? 0 : -1}
                  disabled={disabled}
                  onFocus={() => setNavFocus(k)}
                  onKeyDown={(event) => navKey(event, k)}
                  onClick={() => chooseSite(s.id)}
                  className={cn(
                    "relative flex h-10 w-full items-center gap-2.5 rounded-2 px-2.5 text-left transition-colors",
                    on
                      ? "text-foreground"
                      : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_IN,
                  )}
                >
                  {on ? (
                    <motion.span
                      layoutId={`${uid}-store`}
                      aria-hidden
                      className="absolute inset-0 rounded-2 bg-cobalt-wash"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <Store
                    aria-hidden
                    className="relative size-4 shrink-0 text-ink-3"
                  />
                  <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {s.name}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-ink-3">
                      {s.host}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <p className="px-2.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Saved views
        </p>
        <ul className="flex flex-col gap-0.5">
          {views.map((v) => {
            const on = keyOf(v.filters) === filterKey;
            const k = `view:${v.id}`;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  data-nav={k}
                  aria-pressed={on}
                  tabIndex={navTab === k ? 0 : -1}
                  disabled={disabled}
                  onFocus={() => setNavFocus(k)}
                  onKeyDown={(event) => navKey(event, k)}
                  onClick={() => {
                    if (!on) {
                      audio.play("tick", { pitch: 1.2, gain: 0.35 });
                      setFilters(
                        { ...v.filters },
                        `${v.name}: ${describe(v.filters)}.`,
                      );
                    }
                    if (narrow) closeNav();
                  }}
                  className={cn(
                    "flex h-8 w-full items-center gap-2.5 rounded-2 px-2.5 text-left text-[13px] transition-colors",
                    on
                      ? "text-foreground"
                      : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_IN,
                  )}
                >
                  <Bookmark
                    aria-hidden
                    className={cn(
                      "size-3.5 shrink-0",
                      on
                        ? "fill-cobalt-bright text-cobalt-bright"
                        : "text-ink-3",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{v.name}</span>
                  {on ? (
                    <Check
                      aria-hidden
                      className="size-3.5 shrink-0 text-cobalt-bright"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );

  /* -------------------------------- menus -------------------------------- */

  const [menu, setMenu] = React.useState<Menu | null>(null);
  const [menuAt, setMenuAt] = React.useState(0);
  const barNode = React.useRef<HTMLDivElement | null>(null);
  const menuNode = React.useRef<HTMLDivElement | null>(null);
  const menuDim = dimensions.find((x) => x.id === menu?.dim);
  const menuChoices = menuDim
    ? [
        { id: "", label: `All ${menuDim.label.toLowerCase()}s` },
        ...menuDim.options,
      ]
    : [];

  const openMenu = (dim: ConsoleDimension, from: HTMLButtonElement) => {
    if (disabled) return;
    if (menu?.dim === dim.id) {
      closeMenu(true);
      return;
    }
    const bar = barNode.current?.getBoundingClientRect();
    const chip = from.getBoundingClientRect();
    const room = (bar?.width ?? 320) - 216;
    setMenu({
      dim: dim.id,
      from,
      left: Math.round(
        Math.max(0, Math.min(room, chip.left - (bar?.left ?? 0))),
      ),
    });
    const current = active[dim.id] ?? "";
    setMenuAt(
      Math.max(
        0,
        [{ id: "" }, ...dim.options].findIndex((o) => o.id === current),
      ),
    );
    audio.play("swish", { pitch: 1.2, gain: 0.25 });
  };
  const closeMenu = (refocus: boolean) => {
    if (!menu) return;
    const from = menu.from;
    setMenu(null);
    audio.play("swish", { pitch: 0.9, gain: 0.2 });
    if (refocus && from.isConnected) from.focus({ preventScroll: true });
  };
  const choose = (dimId: string, optionId: string) => {
    audio.play("tick", { pitch: 1.15, gain: 0.4 });
    const next = { ...active };
    if (optionId) next[dimId] = optionId;
    else delete next[dimId];
    setFilters(next);
    closeMenu(true);
  };
  // The menu's highlighted choice holds focus, once the menu exists.
  React.useEffect(() => {
    if (!menu) return;
    menuNode.current
      ?.querySelectorAll<HTMLElement>("[role=menuitemradio]")
      [menuAt]?.focus({ preventScroll: true });
  }, [menu, menuAt]);
  // A press anywhere else closes it.
  React.useEffect(() => {
    if (!menu) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target as Node;
      if (menuNode.current?.contains(t) || menu.from.contains(t)) return;
      setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu]);

  /* ------------------------------- the KPIs ------------------------------- */

  const onPulseWindow = (w: PulseWindow) => {
    const nextCustom = w.custom ? { from: w.from, to: w.to } : null;
    if (nextCustom?.from !== custom?.from || nextCustom?.to !== custom?.to)
      setCustom(nextCustom);
    onWindowChange?.(w);
    if (w.custom)
      say(`Every panel now reads ${short(w.from)} to ${short(w.to)}.`);
  };
  const onPulseRange = (r: ConsoleRange) => {
    if (range === undefined) setOwnRange(r);
    setCustom(null);
    onRangeChange?.(r);
  };

  /* -------------------------------- panels ------------------------------- */

  const step = cascade(windowed.sources.length);
  const sourcesTotal = windowed.sources.reduce((s, b) => s + b.value, 0);
  const sourcesTop = Math.max(1, ...windowed.sources.map((b) => b.value));
  const devicesTotal = windowed.devices.reduce((s, b) => s + b.value, 0);
  const countries = windowed.countries.slice(0, 5);
  const countriesTop = Math.max(1, ...countries.map((b) => b.value));
  const hours = windowed.hours;
  const hourTop = Math.max(1, ...hours);
  const busiest = hours
    .map((v, i) => ({ v, d: Math.floor(i / 24), h: i % 24 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);
  const pct = (v: number, of: number) =>
    of > 0 ? Math.round((v / of) * 100) : 0;
  const fill = (i: number): Transition =>
    motionSafe
      ? { ...springs.glide, delay: r3(i * step) }
      : { duration: durations.fast };
  const empty = (
    <p className="py-6 text-center text-[11px] text-ink-3">
      No visitors in this window.
    </p>
  );

  const sourcesPanel = (
    <Panel
      id={`${uid}-sources`}
      title="Traffic sources"
      note={`${fmt(sourcesTotal)} visitors`}
      span={spanOf("sources")}
      arrangement={arrangement}
      motionSafe={motionSafe}
      pad={d.pad}
    >
      {windowed.sources.length === 0 ? (
        empty
      ) : (
        <ul className={cn("flex flex-col", d.gap)}>
          {windowed.sources.map((b, i) => (
            <li
              key={b.id}
              aria-label={`${b.label}, ${fmt(b.value)} visitors, ${pct(b.value, sourcesTotal)}%`}
            >
              <div
                aria-hidden
                className={cn(
                  "flex items-baseline justify-between gap-3",
                  d.text,
                )}
              >
                <span className="truncate">{b.label}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <Count value={b.value} format={fmt} motionSafe={motionSafe} />
                  <span className="w-9 text-right font-mono text-[10px] text-ink-3 tabular-nums">
                    {pct(b.value, sourcesTotal)}%
                  </span>
                </span>
              </div>
              <span
                aria-hidden
                className="mt-1.5 block overflow-clip rounded-full bg-surface-2"
                style={{ height: d.bar }}
              >
                <motion.span
                  className="block h-full rounded-full bg-cobalt-bright"
                  style={{ originX: 0 }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: r3(b.value / sourcesTop) }}
                  transition={fill(i)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );

  const devicesPanel = (
    <Panel
      id={`${uid}-devices`}
      title="Devices"
      span={spanOf("devices")}
      arrangement={arrangement}
      motionSafe={motionSafe}
      pad={d.pad}
    >
      {windowed.devices.length === 0 ? (
        empty
      ) : (
        <>
          <div
            aria-hidden
            className="flex w-full gap-0.5 overflow-clip rounded-full"
            style={{ height: d.bar + 4 }}
          >
            {windowed.devices.map((b, i) => (
              <motion.span
                key={b.id}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  background: `oklch(from var(--accent-bright) ${0.56 + i * 0.12} 0.16 calc(h + ${i * 28}))`,
                }}
                initial={{ width: "0%" }}
                animate={{
                  width: `${r2((b.value / Math.max(1, devicesTotal)) * 100)}%`,
                }}
                transition={fill(i)}
              />
            ))}
          </div>
          <ul className="flex flex-col gap-1.5">
            {windowed.devices.map((b, i) => {
              const Icon = DEVICE_ICONS[b.id] ?? Monitor;
              return (
                <li
                  key={b.id}
                  aria-label={`${b.label}, ${pct(b.value, devicesTotal)}% of visitors`}
                  className={cn("flex items-center gap-2", d.text)}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      background: `oklch(from var(--accent-bright) ${0.56 + i * 0.12} 0.16 calc(h + ${i * 28}))`,
                    }}
                  />
                  <Icon aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                  <span aria-hidden className="min-w-0 flex-1 truncate">
                    {b.label}
                  </span>
                  <span
                    aria-hidden
                    className="font-mono text-[11px] text-ink-2"
                  >
                    <Count
                      value={pct(b.value, devicesTotal)}
                      format={(v) => `${v}%`}
                      motionSafe={motionSafe}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );

  const countriesPanel = (
    <Panel
      id={`${uid}-countries`}
      title="Top countries"
      span={spanOf("countries")}
      arrangement={arrangement}
      motionSafe={motionSafe}
      pad={d.pad}
    >
      {countries.length === 0 ? (
        empty
      ) : (
        <motion.ol className={cn("relative flex flex-col", d.gap)}>
          {countries.map((b, i) => (
            <motion.li
              key={b.id}
              layout="position"
              transition={{
                layout: motionSafe ? springs.glide : { duration: 0 },
              }}
              aria-label={`${i + 1}. ${b.label}, ${fmt(b.value)} visitors`}
              className={cn("flex items-center gap-2", d.text)}
            >
              <span
                aria-hidden
                className="w-3 shrink-0 font-mono text-[10px] text-ink-3 tabular-nums"
              >
                {i + 1}
              </span>
              <span aria-hidden className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{b.label}</span>
                  <span className="shrink-0 text-ink-2">
                    <Count
                      value={b.value}
                      format={fmt}
                      motionSafe={motionSafe}
                    />
                  </span>
                </span>
                <span className="mt-1 block h-1 overflow-clip rounded-full bg-surface-2">
                  <motion.span
                    className="block h-full rounded-full bg-cobalt-bright/70"
                    style={{ originX: 0 }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: r3(b.value / countriesTop) }}
                    transition={fill(i)}
                  />
                </span>
              </span>
            </motion.li>
          ))}
        </motion.ol>
      )}
    </Panel>
  );

  const hoursPanel = (
    <Panel
      id={`${uid}-hours`}
      title="Busiest hours"
      note="UTC"
      span={spanOf("hours")}
      arrangement={arrangement}
      motionSafe={motionSafe}
      pad={d.pad}
    >
      {hours.length < 168 ? (
        empty
      ) : (
        <>
          <div className="sr-only">
            <p>
              The busiest hours:{" "}
              {busiest
                .map(
                  (b) =>
                    `${WEEKDAYS[b.d]} ${pad2(b.h)}:00 with ${fmt(b.v)} visits`,
                )
                .join("; ")}
              .
            </p>
          </div>
          <div aria-hidden className="grid grid-cols-[14px_1fr] gap-x-1.5">
            <div className="flex flex-col gap-[2px] font-mono text-[9px] leading-none text-ink-3">
              {"MTWTFSS".split("").map((c, i) => (
                <span
                  key={i}
                  className="flex items-center"
                  style={{ height: d.cell }}
                >
                  {c}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[2px]">
              {hours.map((v, i) => {
                const row = Math.floor(i / 24);
                const col = i % 24;
                return (
                  <span
                    key={i}
                    className="rounded-[2px] bg-cobalt-bright"
                    style={{
                      height: d.cell,
                      opacity: r2(0.08 + 0.92 * (v / hourTop)),
                      transition: `opacity ${motionSafe ? 260 : 150}ms cubic-bezier(0.22,1,0.36,1) ${motionSafe ? (row + col) * 12 : 0}ms`,
                    }}
                  />
                );
              })}
            </div>
            <span />
            <div className="mt-1 flex justify-between font-mono text-[9px] text-ink-3 tabular-nums">
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>
          </div>
        </>
      )}
    </Panel>
  );

  const columns: DataGridColumn[] = React.useMemo(
    () => [
      {
        id: "page",
        header: "Page",
        width: 208,
        minWidth: 140,
        maxWidth: 360,
        mono: true,
      },
      { id: "views", header: "Views", kind: "number", width: 96, minWidth: 72 },
      {
        id: "visitors",
        header: "Visitors",
        kind: "number",
        width: 100,
        minWidth: 80,
      },
      {
        id: "time",
        header: "Avg. time",
        kind: "number",
        width: 100,
        minWidth: 80,
        format: (v) =>
          typeof v !== "number"
            ? "—"
            : v < 60
              ? `${v}s`
              : `${Math.floor(v / 60)}m ${pad2(v % 60)}s`,
      },
      {
        id: "bounce",
        header: "Bounce",
        kind: "number",
        width: 92,
        minWidth: 72,
        format: (v) => (typeof v === "number" ? `${v.toFixed(1)}%` : "—"),
      },
      {
        id: "revenue",
        header: "Revenue",
        kind: "money",
        width: 116,
        minWidth: 96,
      },
    ],
    [],
  );

  /* -------------------------------- render ------------------------------- */

  const t: Transition = {
    layout: motionSafe ? springs.glide : { duration: 0 },
  };
  const windowLabel = custom
    ? `${short(win.from)} – ${short(win.to)}`
    : `${RANGE_NAMES[period]} · ${short(win.from)} – ${short(win.to)}`;

  const content =
    status === "error" ? (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <p className="text-sm font-medium">The numbers didn&rsquo;t load</p>
        <p className="text-xs text-ink-3">
          Nothing is wrong with the store. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-xs font-medium hover:bg-surface-2",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    ) : (
      <div className={cn("flex flex-col", d.gap)}>
        <PulseDashboard
          title="Revenue and orders"
          subtitle={store?.name}
          metrics={whole.metrics}
          breakdowns={whole.breakdowns}
          now={now}
          range={period}
          onRangeChange={onPulseRange}
          onWindowChange={onPulseWindow}
          locale={locale}
          currency={currency}
          status={status}
          onRetry={onRetry}
          sound={sound}
          disabled={disabled}
          className="max-h-none overflow-visible"
        />
        <div
          className={cn("grid grid-flow-row-dense", d.gap)}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {status === "loading" ? (
            [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                aria-hidden
                className="h-40 rounded-4 border border-hairline bg-card"
              />
            ))
          ) : (
            <>
              {sourcesPanel}
              {devicesPanel}
              {countriesPanel}
              {hoursPanel}
            </>
          )}
        </div>
        <motion.div
          layout="position"
          layoutDependency={arrangement}
          transition={t}
        >
          <DataGrid
            title="Top pages"
            label={`Top pages, ${windowLabel}`}
            columns={columns}
            rows={windowed.pages}
            density={density}
            pageSize={6}
            maxHeight={320}
            itemLabel={{ one: "page", other: "pages" }}
            locale={locale}
            currency={currency}
            now={now}
            status={status === "ready" && refreshing ? "loading" : status}
            onRetry={onRetry}
            sound={sound}
            disabled={disabled}
          />
        </motion.div>
      </div>
    );

  return (
    <div
      ref={setRootNode}
      role="region"
      aria-label={label}
      inert={disabled}
      className={cn(
        "@container/console relative isolate flex h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-background text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <aside className="hidden w-[200px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-hairline bg-surface-1 @min-[900px]/console:flex">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-4">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-2 bg-primary text-[11px] font-bold text-primary-foreground"
          >
            F
          </span>
          <span className="truncate text-sm font-semibold">Analytics</span>
        </div>
        {narrow || navOpen ? null : nav}
      </aside>

      <div
        className="relative flex min-w-0 flex-1 flex-col"
        inert={navOpen && !navClosing}
      >
        <div className="relative z-20 shrink-0 border-b border-hairline bg-background/95 backdrop-blur-sm">
          <div className="flex h-12 items-center gap-2 px-3">
            <button
              ref={menuButton}
              type="button"
              aria-label="Stores and views"
              aria-haspopup="dialog"
              aria-expanded={navOpen}
              onClick={openNav}
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 hover:bg-surface-2 hover:text-foreground @min-[900px]/console:hidden",
                FOCUS,
              )}
            >
              <Menu aria-hidden className="size-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">
                {store?.name ?? "Store"}
              </h2>
              <p className="truncate font-mono text-[10px] text-ink-3 tabular-nums">
                {store?.host} · {windowLabel} · {days}{" "}
                {days === 1 ? "day" : "days"}
              </p>
            </div>
          </div>
          <div
            ref={barNode}
            role="toolbar"
            aria-label="Filters"
            className="relative flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] px-3 pb-2.5 @min-[640px]/console:flex-wrap @min-[640px]/console:overflow-visible @min-[640px]/console:[mask-image:none]"
          >
            {dimensions.map((dim) => {
              const value = dim.options.find((o) => o.id === active[dim.id]);
              const open = menu?.dim === dim.id;
              return (
                <span
                  key={dim.id}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center rounded-full border text-[11px] transition-colors",
                    value
                      ? "border-cobalt-bright/40 bg-cobalt-wash text-foreground"
                      : "border-hairline-strong text-ink-2",
                  )}
                >
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-controls={open ? `${uid}-menu` : undefined}
                    disabled={disabled}
                    onClick={(event) => openMenu(dim, event.currentTarget)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        if (!open) openMenu(dim, event.currentTarget);
                      }
                    }}
                    className={cn(
                      "inline-flex h-full items-center gap-1 rounded-full pr-2 pl-2.5 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    <span className="text-ink-3">{dim.label}:</span>
                    <span className="font-medium">{value?.label ?? "All"}</span>
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "size-3 text-ink-3 transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                  {value ? (
                    <button
                      type="button"
                      aria-label={`Clear ${dim.label.toLowerCase()}`}
                      disabled={disabled}
                      onClick={() => {
                        audio.play("tick", { pitch: 0.9, gain: 0.35 });
                        const next = { ...active };
                        delete next[dim.id];
                        setFilters(next);
                      }}
                      className={cn(
                        "mr-0.5 -ml-1 inline-flex size-5 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-foreground",
                        FOCUS,
                      )}
                    >
                      <X aria-hidden className="size-3" />
                    </button>
                  ) : null}
                </span>
              );
            })}
            {filterKey ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  audio.play("tick", { pitch: 0.8, gain: 0.35 });
                  setFilters({}, "Filters cleared. Showing all traffic.");
                }}
                className={cn(
                  "h-7 shrink-0 rounded-full px-2 text-[11px] text-cobalt-bright hover:bg-cobalt-wash",
                  FOCUS,
                )}
              >
                Clear
              </button>
            ) : null}
          </div>
          <AnimatePresence>
            {menu && menuDim ? (
              <motion.div
                key={menu.dim}
                ref={menuNode}
                id={`${uid}-menu`}
                role="menu"
                aria-label={menuDim.label}
                initial={
                  motionSafe
                    ? { opacity: 0, y: -distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  y: springs.snap,
                  opacity: { duration: durations.fast, ease: easings.enter },
                }}
                onKeyDown={(event) => {
                  const n = menuChoices.length;
                  const move = (to: number) => {
                    event.preventDefault();
                    setMenuAt(to);
                    audio.play("tick", { pitch: 1.3 - to * 0.05, gain: 0.2 });
                  };
                  if (event.key === "ArrowDown") move((menuAt + 1) % n);
                  else if (event.key === "ArrowUp") move((menuAt - 1 + n) % n);
                  else if (event.key === "Home") move(0);
                  else if (event.key === "End") move(n - 1);
                  else if (event.key === "Escape") {
                    event.preventDefault();
                    closeMenu(true);
                  } else if (event.key === "Tab") closeMenu(false);
                }}
                className="absolute top-full z-50 mt-1 flex w-52 flex-col rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_12px_32px_color-mix(in_oklab,black_18%,transparent)]"
                style={{ left: menu.left }}
              >
                {menuChoices.map((o, i) => {
                  const on = (active[menuDim.id] ?? "") === o.id;
                  return (
                    <button
                      key={o.id || "all"}
                      type="button"
                      role="menuitemradio"
                      aria-checked={on}
                      tabIndex={i === menuAt ? 0 : -1}
                      onFocus={() => setMenuAt(i)}
                      onClick={() => choose(menuDim.id, o.id)}
                      className={cn(
                        "flex h-8 items-center gap-2 rounded-2 px-2 text-left text-[13px] hover:bg-surface-2",
                        i === menuAt && "bg-surface-2",
                        FOCUS_IN,
                      )}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        {on ? (
                          <Check
                            aria-hidden
                            className="size-3.5 text-cobalt-bright"
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {"share" in o ? (
                        <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                          {Math.round(o.share * 100)}%
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <motion.div
          layoutScroll
          className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain p-3 @min-[640px]/console:p-4"
        >
          {content}
        </motion.div>
      </div>

      {navOpen ? (
        <div className="absolute inset-0 z-40">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-black"
            style={{ opacity: navScrim }}
            onPointerDown={() => closeNav()}
          />
          <motion.div
            ref={(node) => {
              navPanel.current = node;
              setNavNode(node);
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Stores and views"
            {...navDrag}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeNav();
                return;
              }
              if (event.key !== "Tab") return;
              const all = [
                ...(navPanel.current?.querySelectorAll<HTMLElement>(
                  "button:not([disabled])",
                ) ?? []),
              ].filter((n) => n.tabIndex >= 0);
              const first = all[0];
              const last = all[all.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            className="absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] touch-pan-y flex-col overflow-y-auto overscroll-contain border-r border-hairline-strong bg-surface-1 shadow-[16px_0_40px_color-mix(in_oklab,black_18%,transparent)]"
            style={{ x: navOffset, opacity: navOpacity }}
          >
            <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-hairline px-4">
              <span className="truncate text-sm font-semibold">Analytics</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => closeNav()}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-2 text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            {nav}
          </motion.div>
        </div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
