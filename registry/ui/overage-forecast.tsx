"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  ArrowUpRight,
  Bell,
  BellRing,
  Database,
  Gauge,
  Hammer,
  RotateCcw,
  TriangleAlert,
  Zap,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type OverageConeStyle = "fan" | "bands" | "lines";
export type OverageAccentName = "cobalt" | "plum" | "mint" | "ink";
export type OverageStatus = "ready" | "loading" | "empty" | "error";

export type OverageUsage = {
  id: string;
  /** What is metered, as a reader would say it: "API calls". */
  label: string;
  /** The unit, plural and short: "calls", "GB", "min". */
  unit: string;
  /** Used so far this period. */
  used: number;
  /**
   * The reading at the end of each elapsed day; index 0 is the period's
   * start (0 for a counter, the opening level for storage). Omit it and the
   * meter draws a straight line from 0 to `used`.
   */
  history?: number[];
  /** A glyph for the meter. @default by id, else a gauge */
  icon?: React.ComponentType<{ className?: string }>;
};

export type OverageMeterTerms = {
  /** Units the plan includes each period. */
  included: number;
  /** Price of each block of `per` units beyond it. */
  rate: number;
  /** Units the rate is quoted per. @default 1 */
  per?: number;
};

export type OveragePlan = {
  name: string;
  /** The plan's own price for the period. */
  price: number;
  /** Period start and end, ms since the epoch (end exclusive). */
  periodStart: number;
  periodEnd: number;
  /** Allowance and overage rate for each metered id. */
  meters: Record<string, OverageMeterTerms>;
};

export type OverageRange = { low: number; mid: number; high: number };

export type OverageForecastEntry = OverageRange & {
  /** Extra load already planned, added on top when planned load is on. */
  planned?: OverageRange & { note: string };
};

export type OverageForecast = Record<string, OverageForecastEntry>;

export type OverageUpgrade = {
  name: string;
  /** The plan's flat price for a period. */
  price: number;
  /** One line on what it covers. */
  note?: string;
};

export type OverageForecastProps = {
  /** Each metered thing: use so far and its daily history. @default defaultOverageUsage */
  usage?: OverageUsage[];
  /** The period, the base price, and each meter's allowance and rate. @default defaultOveragePlan */
  plan?: OveragePlan;
  /** Where each meter is likely to land by the period's end. @default defaultOverageForecast */
  forecast?: OverageForecast;
  /** The moment the meters are read at, in ms. @default Oct 17 2026, 14:00 UTC */
  now?: number;
  /** The account the usage belongs to. @default "Gaugeworks" */
  account?: string;
  /** Controlled: whether planned load is counted in the forecast. */
  includePlanned?: boolean;
  /** Initial planned-load state when uncontrolled. @default false */
  defaultIncludePlanned?: boolean;
  /** Fires from the switch with the new state. */
  onForecastToggle?: (on: boolean) => void;
  /** Controlled alert thresholds, by meter id. */
  alerts?: Record<string, number>;
  /** Initial alerts when uncontrolled. @default { api: 45000 } */
  defaultAlerts?: Record<string, number>;
  /** Fires when an alert is saved (a number) or removed (null). */
  onSetAlert?: (id: string, value: number | null) => void;
  /** The plan to suggest in the footer; null hides the suggestion. @default Scale, $449 */
  upgrade?: OverageUpgrade | null;
  /** The footer's button was pressed. */
  onUpgrade?: (upgrade: OverageUpgrade) => void;
  /** Whether the readings have arrived; "empty" is a fresh period. @default "ready" */
  status?: OverageStatus;
  /** "Try again" was pressed after the readings failed to load. */
  onRetry?: () => void;
  /** How the forecast cone is drawn. @default "fan" */
  coneStyle?: OverageConeStyle;
  /** Height of each meter's chart, in px. @default 88 */
  meterHeight?: number;
  /** History, cone, cursor and switch: a named pigment or any CSS colour. @default "cobalt" */
  accent?: OverageAccentName | (string & {});
  /** How money is written. @default Intl USD */
  formatMoney?: (amount: number) => string;
  /** Alerts, the switch and the upgrade are unavailable; readings stay readable. @default false */
  disabled?: boolean;
  /** Classes for the panel; it caps at 36rem tall and scrolls inside past that. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

export const defaultOveragePlan: OveragePlan = {
  name: "Team",
  price: 299,
  periodStart: Date.UTC(2026, 9, 1),
  periodEnd: Date.UTC(2026, 10, 1),
  meters: {
    api: { included: 50_000, rate: 2, per: 1000 },
    storage: { included: 400, rate: 0.25, per: 1 },
    builds: { included: 3000, rate: 0.05, per: 1 },
  },
};

export const defaultOverageUsage: OverageUsage[] = [
  {
    id: "api",
    label: "API calls",
    unit: "calls",
    used: 41_200,
    history: [
      0, 3290, 6488, 8005, 9046, 11174, 13612, 16568, 19861, 23052, 24560,
      25594, 27724, 30170, 33136, 36431, 39616,
    ],
  },
  {
    id: "storage",
    label: "Storage",
    unit: "GB",
    used: 312,
    history: [
      268, 272, 275, 276, 277, 279, 282, 286, 290, 293, 294, 294, 297, 300, 304,
      308, 310,
    ],
  },
  {
    id: "builds",
    label: "Build minutes",
    unit: "min",
    used: 1940,
    history: [
      0, 144, 254, 268, 301, 452, 630, 804, 947, 1057, 1071, 1104, 1256, 1434,
      1607, 1750, 1859,
    ],
  },
];

export const defaultOverageForecast: OverageForecast = {
  api: {
    low: 64_000,
    mid: 76_000,
    high: 90_000,
    planned: { low: 4000, mid: 9000, high: 18_000, note: "Load test Oct 24" },
  },
  storage: {
    low: 330,
    mid: 352,
    high: 384,
    planned: { low: 30, mid: 60, high: 110, note: "Archive backfill" },
  },
  builds: {
    low: 3000,
    mid: 3600,
    high: 4400,
    planned: { low: 200, mid: 450, high: 900, note: "Release branch" },
  },
};

const DEFAULT_NOW = Date.UTC(2026, 9, 17, 14);
const DEFAULT_ALERTS: Record<string, number> = { api: 45_000 };
const DEFAULT_UPGRADE: OverageUpgrade = {
  name: "Scale",
  price: 449,
  note: "250k calls, 1 TB and 8,000 build minutes included",
};
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  api: Zap,
  storage: Database,
  builds: Hammer,
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const grouping = new Intl.NumberFormat("en-US");
const whole = (n: number) => grouping.format(Math.round(n));
const defaultMoney = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
const r2 = (v: number) => Math.round(v * 100) / 100;
const cents = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * "41.2k", "76k", "1.2M": by hand, because Intl's compact notation prints
 * differently in Node and in the browser and the markup must match.
 */
const compact = (n: number): string => {
  const a = Math.abs(n);
  const trim = (v: number) => {
    const s = v >= 100 ? String(Math.round(v)) : v.toFixed(1);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  };
  if (a >= 1e6) return `${trim(n / 1e6)}M`;
  if (a >= 1e3) return `${trim(n / 1e3)}k`;
  return String(Math.round(n));
};

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
/** "Oct 17", on a fixed UTC calendar so server and browser agree. */
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};

const endRange = (
  entry: OverageForecastEntry | undefined,
  used: number,
  planned: boolean,
): OverageRange => {
  if (!entry) return { low: used, mid: used, high: used };
  const p = planned ? entry.planned : undefined;
  return {
    low: entry.low + (p?.low ?? 0),
    mid: entry.mid + (p?.mid ?? 0),
    high: entry.high + (p?.high ?? 0),
  };
};

const overage = (amount: number, terms: OverageMeterTerms | undefined) =>
  terms
    ? (Math.max(0, amount - terms.included) / (terms.per ?? 1)) * terms.rate
    : 0;

/**
 * The bill a period is heading for: the plan's price plus each meter's
 * overage at the low, middle and high ends of its forecast, in cents.
 */
export function projectOverageBill(
  usage: OverageUsage[],
  plan: OveragePlan,
  forecast: OverageForecast,
  includePlanned: boolean,
): { low: number; mid: number; high: number; overage: number } {
  let low = 0;
  let mid = 0;
  let high = 0;
  for (const u of usage) {
    const range = endRange(forecast[u.id], u.used, includePlanned);
    const terms = plan.meters[u.id];
    low += overage(Math.max(range.low, u.used), terms);
    mid += overage(Math.max(range.mid, u.used), terms);
    high += overage(Math.max(range.high, u.used), terms);
  }
  return {
    low: cents(plan.price + low),
    mid: cents(plan.price + mid),
    high: cents(plan.price + high),
    overage: cents(mid),
  };
}

/**
 * Accent as custom properties. Text and strokes take the token; the fills
 * are pigment — the token's hue and chroma at a fixed lightness — so a
 * filled cone reads the same on a light page as on a dark one. Overage is
 * always warn, kept apart from the accent so "over the line" never depends
 * on which accent was chosen.
 */
const ACCENTS: Record<OverageAccentName, Record<string, string>> = {
  cobalt: {
    "--of-ink": "var(--accent-bright)",
    "--of-fill": "oklch(from var(--accent-bright) 0.64 c h)",
    "--of-switch": "var(--primary)",
    "--of-knob": "var(--primary-foreground)",
  },
  plum: {
    "--of-ink": "oklch(from var(--accent-bright) l c 320)",
    "--of-fill": "oklch(from var(--accent-bright) 0.62 c 320)",
    "--of-switch": "oklch(from var(--accent-bright) 0.56 c 320)",
    "--of-knob": "var(--primary-foreground)",
  },
  mint: {
    "--of-ink": "var(--success)",
    "--of-fill": "oklch(from var(--success) 0.72 c h)",
    "--of-switch": "oklch(from var(--success) 0.66 c h)",
    "--of-knob": "oklch(from var(--success) 0.22 0.04 h)",
  },
  ink: {
    "--of-ink": "var(--ink-2)",
    "--of-fill": "oklch(from var(--ink-2) 0.6 0.02 h)",
    "--of-switch": "var(--foreground)",
    "--of-knob": "var(--background)",
  },
};

const accentVars = (accent: string): React.CSSProperties => {
  const named = ACCENTS[accent as OverageAccentName];
  const vars = named ?? {
    "--of-ink": accent,
    "--of-fill": accent,
    "--of-switch": accent,
    "--of-knob": "var(--primary-foreground)",
  };
  return {
    ...vars,
    "--of-wash": "color-mix(in oklab, var(--of-ink) 12%, transparent)",
    "--of-over": "oklch(from var(--warn) 0.8 c h)",
    "--of-over-wash": "color-mix(in oklab, var(--warn) 13%, transparent)",
    "--of-ok-wash": "color-mix(in oklab, var(--success) 12%, transparent)",
  } as React.CSSProperties;
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const EYEBROW =
  "font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase";

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/** A figure that rolls: the old one leaves upward, the new one rises in. */
function Roll({ value, motionSafe }: { value: string; motionSafe: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-grid overflow-hidden align-bottom tabular-nums"
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          className="whitespace-nowrap [grid-area:1/1]"
          initial={motionSafe ? { y: "100%", opacity: 0 } : { opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{
            ...(motionSafe ? { y: "-100%" } : {}),
            opacity: 0,
            transition: exitFor(durations.base),
          }}
          transition={
            motionSafe
              ? { y: springs.glide, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A box whose height follows its measured content on glide. */
function Reveal({
  open,
  motionSafe,
  id,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="reveal"
          id={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: exitFor(durations.base) }}
          transition={
            motionSafe
              ? { height: springs.glide, opacity: { duration: durations.base } }
              : { duration: 0 }
          }
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Bar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-2 bg-surface-2 motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                              Cone geometry                               */
/* ----------------------------------------------------------------------- */

type Geometry = {
  w: number;
  h: number;
  /** x of a day boundary (0 = the period's start). */
  x: (day: number) => number;
  /** y of a reading. */
  y: (value: number) => number;
  xNow: number;
  used: number;
  days: number;
  tNow: number;
};

const INSET = 5;

/**
 * The forecast as a fan from today's reading to the period's end. Both
 * edges are quadratic curves sharing one control point on the median, so
 * they leave today tangent to it and part as the days go — the spread grows
 * with the square of the time ahead, which is how uncertainty reads. `open`
 * carries the tip out from today and opens the spread with it; `k` is the
 * share of the full spread drawn (the inner bands of the "bands" style).
 */
const cone = (
  g: Geometry,
  low: number,
  mid: number,
  high: number,
  open: number,
  k: number,
) => {
  const o = clamp(open, 0, 1);
  const x0 = g.xNow;
  const y0 = g.y(g.used);
  const xEnd = g.x(g.days);
  const tipX = x0 + (xEnd - x0) * o;
  const midTip = g.used + (mid - g.used) * o;
  const hiTip = midTip + (high - mid) * o * k;
  const loTip = midTip - (mid - low) * o * k;
  const cx = r2(x0 + (tipX - x0) / 2);
  const cy = r2(g.y(g.used + (midTip - g.used) / 2));
  const p = (x: number, y: number) => `${r2(x)} ${r2(y)}`;
  const start = p(x0, y0);
  const hi = p(tipX, g.y(hiTip));
  const lo = p(tipX, g.y(loTip));
  return {
    body: `M ${start} Q ${cx} ${cy} ${hi} L ${lo} Q ${cx} ${cy} ${start} Z`,
    upper: `M ${start} Q ${cx} ${cy} ${hi}`,
    lower: `M ${start} Q ${cx} ${cy} ${lo}`,
    median: `M ${start} L ${p(tipX, g.y(midTip))}`,
  };
};

/** Forecast at a future day: the median, and the spread at t² of the full. */
const forecastAt = (g: Geometry, range: OverageRange, day: number) => {
  const t = clamp((day - g.tNow) / Math.max(0.0001, g.days - g.tNow), 0, 1);
  const med = g.used + (range.mid - g.used) * t;
  return {
    mid: med,
    low: med - t * t * (range.mid - range.low),
    high: med + t * t * (range.high - range.mid),
  };
};

/* ----------------------------------------------------------------------- */
/*                                 A meter                                  */
/* ----------------------------------------------------------------------- */

type MeterProps = {
  uid: string;
  index: number;
  count: number;
  usage: OverageUsage;
  terms: OverageMeterTerms | undefined;
  range: OverageRange;
  yMax: number;
  days: number;
  tNow: number;
  periodStart: number;
  periodEnd: number;
  alert: number | undefined;
  onAlert: (value: number | null) => void;
  state: "ready" | "loading" | "empty";
  coneStyle: OverageConeStyle;
  height: number;
  motionSafe: boolean;
  disabled: boolean;
  money: (n: number) => string;
};

function Meter({
  uid,
  index,
  count,
  usage,
  terms,
  range,
  yMax,
  days,
  tNow,
  periodStart,
  periodEnd,
  alert,
  onAlert,
  state,
  coneStyle,
  height,
  motionSafe,
  disabled,
  money,
}: MeterProps) {
  const id = `${uid}-${usage.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const Icon = usage.icon ?? ICONS[usage.id] ?? Gauge;
  const ready = state === "ready";
  const included = terms?.included ?? 0;
  const resets = dayLabel(periodEnd);
  const lastDay = dayLabel(periodEnd - DAY);

  /* ------------------------------ geometry ------------------------------- */

  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(cardRef, { once: true, amount: 0.3 });
  const [width, setWidth] = React.useState(280);
  const [plotNode, setPlotNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!plotNode) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setWidth(Math.max(80, Math.round(entry.contentRect.width)));
    });
    ro.observe(plotNode);
    return () => ro.disconnect();
  }, [plotNode]);

  const h = Math.round(clamp(height, 40, 240));
  const top = 6;
  const bottom = h - 2;
  const g: Geometry = {
    w: width,
    h,
    x: (day) => r2(INSET + (clamp(day, 0, days) / days) * (width - 2 * INSET)),
    y: (value) =>
      r2(bottom - (clamp(value, 0, yMax) / Math.max(1, yMax)) * (bottom - top)),
    xNow: 0,
    used: ready ? usage.used : 0,
    days,
    tNow,
  };
  g.xNow = g.x(tNow);

  const history = React.useMemo(() => {
    const list = usage.history;
    const pts: [number, number][] = [];
    const elapsed = Math.floor(tNow);
    if (list && list.length > 0) {
      for (let i = 0; i < list.length && i <= elapsed; i++) {
        pts.push([i, list[i] ?? 0]);
      }
    } else {
      pts.push([0, 0]);
    }
    pts.push([tNow, usage.used]);
    return pts;
  }, [tNow, usage.history, usage.used]);

  const line = history.map(([d, v]) => `${g.x(d)} ${g.y(v)}`);
  const linePath = `M ${line.join(" L ")}`;
  const areaPath = `${linePath} L ${g.xNow} ${bottom} L ${g.x(0)} ${bottom} Z`;
  const yIncluded = g.y(included);
  const yAlert = alert !== undefined ? g.y(alert) : null;

  /* ------------------------------- motion -------------------------------- */

  const reveal = useMotionValue(0);
  const open = useMotionValue(0);
  const low = useMotionValue(range.low);
  const mid = useMotionValue(range.mid);
  const high = useMotionValue(range.high);
  const alertSweep = useMotionValue(1);

  // The entrance: the history draws to today, then the cone grows out of
  // today's reading, one meter a beat after the last. It waits for the meter
  // to be seen, so a meter below the fold has something left to show.
  React.useEffect(() => {
    if (!ready) {
      reveal.jump(0);
      open.jump(0);
      return;
    }
    if (!motionSafe) {
      reveal.jump(1);
      open.jump(1);
      return;
    }
    if (!inView) return;
    const delay = index * cascade(count) * 2;
    const a = animate(reveal, 1, { ...springs.glide, delay });
    const b = animate(open, 1, { ...springs.glide, delay: delay + 0.22 });
    return () => {
      a.stop();
      b.stop();
    };
  }, [count, inView, index, motionSafe, open, ready, reveal]);

  // Planned load moves the cone's ends: the fan widens and lifts on glide.
  React.useEffect(() => {
    const t = motionSafe
      ? springs.glide
      : { duration: durations.fast, ease: easings.enter };
    const list: AnimationPlaybackControls[] = [
      animate(low, range.low, t),
      animate(mid, range.mid, t),
      animate(high, range.high, t),
    ];
    return () => {
      for (const c of list) c.stop();
    };
  }, [high, low, mid, motionSafe, range.high, range.low, range.mid]);

  // A newly set alert sweeps in from the left; one present from the start
  // is simply there, and a re-run for the same alert finishes the sweep
  // rather than leaving it half drawn.
  const shownAlert = React.useRef(alert);
  React.useEffect(() => {
    if (shownAlert.current === alert) {
      alertSweep.jump(1);
      return;
    }
    shownAlert.current = alert;
    if (alert === undefined) return;
    if (!motionSafe) {
      alertSweep.jump(1);
      return;
    }
    alertSweep.jump(0);
    const c = animate(alertSweep, 1, springs.glide);
    return () => c.stop();
  }, [alert, alertSweep, motionSafe]);

  const inputs = [low, mid, high, open] as MotionValue<number>[];
  const at = (v: unknown[], k: number) =>
    cone(g, v[0] as number, v[1] as number, v[2] as number, v[3] as number, k);
  const outer = useTransform(inputs, (v) => at(v, 1).body);
  const band2 = useTransform(inputs, (v) => at(v, 0.62).body);
  const band1 = useTransform(inputs, (v) => at(v, 0.28).body);
  const upper = useTransform(inputs, (v) => at(v, 1).upper);
  const lower = useTransform(inputs, (v) => at(v, 1).lower);
  const median = useTransform(inputs, (v) => at(v, 1).median);
  const revealWidth = useTransform(reveal, (r) =>
    r2(clamp(r, 0, 1) * (g.xNow + 4)),
  );
  const alertWidth = useTransform(alertSweep, (s) => r2(clamp(s, 0, 1) * g.w));
  const coneOpacity = useTransform(open, (o) => r2(clamp(o * 3, 0, 1)));

  /* ------------------------------- cursor -------------------------------- */

  const todayDay = Math.min(days, Math.floor(tNow) + 1);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const shownDay = cursor ?? todayDay;
  const cursorX = (day: number) => (day === todayDay ? g.xNow : g.x(day));
  const valueOn = (day: number) => {
    if (day >= todayDay) return null;
    const v = usage.history?.[day];
    return v ?? (usage.used * day) / Math.max(0.0001, tNow);
  };
  const cursorY = (day: number) => {
    const past = valueOn(day);
    if (day === todayDay) return g.y(usage.used);
    if (past !== null) return g.y(past);
    return g.y(forecastAt(g, range, day).mid);
  };
  const cx = useMotionValue(cursorX(shownDay));
  const cy = useMotionValue(cursorY(shownDay));
  const cursorTargetX = cursorX(shownDay);
  const cursorTargetY = cursorY(shownDay);
  React.useEffect(() => {
    if (cursor === null || !motionSafe) {
      cx.jump(cursorTargetX);
      cy.jump(cursorTargetY);
      return;
    }
    const a = animate(cx, cursorTargetX, springs.flick);
    const b = animate(cy, cursorTargetY, springs.flick);
    return () => {
      a.stop();
      b.stop();
    };
  }, [cursor, cursorTargetX, cursorTargetY, cx, cy, motionSafe]);

  const dateOf = (day: number) => dayLabel(periodStart + (day - 1) * DAY);
  const reading = (day: number) => {
    if (!ready) {
      return state === "empty"
        ? {
            short: `Resets ${resets}`,
            long: `Nothing used yet. Resets ${resets}.`,
          }
        : { short: "Loading", long: "Loading readings." };
    }
    const when = day === todayDay ? "Today" : dateOf(day);
    const past = valueOn(day);
    if (day === todayDay || past !== null) {
      const v = day === todayDay ? usage.used : (past ?? 0);
      return {
        short: `${when} · ${compact(v)} ${usage.unit}`,
        long: `${when}, ${whole(v)} ${usage.unit} used`,
      };
    }
    const f = forecastAt(g, range, day);
    return {
      short: `${when} · ${compact(f.low)}–${compact(f.high)} likely`,
      long: `${when}, forecast ${whole(f.low)} to ${whole(f.high)} ${usage.unit}`,
    };
  };
  const now = reading(shownDay);

  const onKey = (event: React.KeyboardEvent) => {
    if (!ready) return;
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 7,
      PageDown: -7,
    };
    let next: number | null = null;
    if (event.key === "Home") next = 1;
    else if (event.key === "End") next = days;
    else if (step[event.key] !== undefined)
      next = clamp(shownDay + (step[event.key] ?? 0), 1, days);
    else if (event.key === "Escape" && cursor !== null) {
      event.preventDefault();
      setCursor(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    setCursor(next);
  };

  const dayFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    const f =
      (event.clientX - r.left - INSET) / Math.max(1, r.width - 2 * INSET);
    return clamp(Math.round(f * days), 1, days);
  };

  /* -------------------------------- alert -------------------------------- */

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [invalid, setInvalid] = React.useState(false);
  const bellRef = React.useRef<HTMLButtonElement | null>(null);
  const focusInput = React.useRef(false);
  const focusBell = React.useRef(false);
  const bindInput = React.useCallback((node: HTMLInputElement | null) => {
    if (node && focusInput.current) {
      focusInput.current = false;
      node.focus({ preventScroll: true });
      node.select();
    }
  }, []);
  React.useEffect(() => {
    if (editing || !focusBell.current) return;
    focusBell.current = false;
    const bell = bellRef.current;
    if (bell?.isConnected) bell.focus({ preventScroll: true });
  }, [editing]);

  const openEditor = () => {
    if (disabled || !ready) return;
    if (editing) {
      setEditing(false);
      return;
    }
    focusInput.current = true;
    setDraft(String(Math.round(alert ?? included * 0.9)));
    setInvalid(false);
    setEditing(true);
  };
  const closeEditor = () => {
    focusBell.current = true;
    setEditing(false);
  };
  const save = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      setInvalid(true);
      return;
    }
    onAlert(Math.round(n));
    closeEditor();
  };

  // When the median is heading through the alert, say on which day.
  const crossing = (() => {
    if (!ready || alert === undefined) return null;
    if (usage.used >= alert) return "passed";
    if (range.mid <= alert) return null;
    const t = (alert - usage.used) / (range.mid - usage.used);
    const day = Math.ceil(tNow + t * (days - tNow));
    return dateOf(clamp(day, 1, days));
  })();

  /* -------------------------------- verdict ------------------------------ */

  const overMid = overage(range.mid, terms);
  const overHigh = overage(range.high, terms);
  const over = overMid > 0;
  const summary = !ready
    ? `${usage.label}: ${now.long}`
    : `${usage.label}: ${whole(usage.used)} of ${whole(included)} ${usage.unit} used. Forecast ${whole(range.low)} to ${whole(range.high)} by ${lastDay}${
        over
          ? `, about ${money(cents(overMid))} over the plan`
          : overHigh > 0
            ? `, within the plan unless it runs high`
            : ", within the plan"
      }.${alert !== undefined ? ` Alert at ${whole(alert)}.` : ""}`;

  const todayPct = Number(((g.xNow / Math.max(1, width)) * 100).toFixed(3));
  const fillId = `${id}-fill`;
  const overFillId = `${id}-over`;
  const below = `${id}-below`;
  const above = `${id}-above`;
  const revealId = `${id}-reveal`;
  const alertClip = `${id}-alert`;
  const editorId = `${id}-editor`;
  const summaryId = `${id}-summary`;
  const labelId = `${id}-label`;

  const coneLayer = (over: boolean) => {
    const fill = over ? "fill-[var(--of-over)]" : "fill-[var(--of-fill)]";
    const stroke = over ? "stroke-warn" : "stroke-[var(--of-ink)]";
    if (coneStyle === "lines") {
      return (
        <>
          <motion.path
            d={upper}
            fill="none"
            strokeWidth={1.25}
            strokeDasharray="1 3"
            strokeLinecap="round"
            className={stroke}
          />
          <motion.path
            d={lower}
            fill="none"
            strokeWidth={1.25}
            strokeDasharray="1 3"
            strokeLinecap="round"
            className={stroke}
          />
          <motion.path
            d={median}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            className={stroke}
          />
        </>
      );
    }
    if (coneStyle === "bands") {
      return (
        <>
          <motion.path d={outer} className={fill} fillOpacity={0.14} />
          <motion.path d={band2} className={fill} fillOpacity={0.2} />
          <motion.path d={band1} className={fill} fillOpacity={0.3} />
          <motion.path
            d={median}
            fill="none"
            strokeWidth={1.25}
            className={stroke}
          />
        </>
      );
    }
    return (
      <>
        <motion.path d={outer} fill={`url(#${over ? overFillId : fillId})`} />
        <motion.path
          d={median}
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          className={stroke}
        />
      </>
    );
  };

  return (
    <div
      ref={cardRef}
      className="flex min-w-0 flex-col gap-2 rounded-3 border border-hairline bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          id={labelId}
          className="inline-flex min-w-0 items-center gap-2 text-[13px] leading-5 font-medium text-foreground"
        >
          <span
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-2 bg-[var(--of-wash)] text-[var(--of-ink)]"
          >
            <Icon className="size-3.5" />
          </span>
          <span className="truncate" title={usage.label}>
            {usage.label}
          </span>
        </span>
        <button
          ref={bellRef}
          type="button"
          onClick={openEditor}
          aria-expanded={editing}
          aria-controls={editing ? editorId : undefined}
          aria-disabled={disabled || !ready || undefined}
          aria-label={
            alert !== undefined
              ? `Change the alert for ${usage.label}, now at ${whole(alert)} ${usage.unit}`
              : `Set an alert for ${usage.label}`
          }
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-2 transition-colors",
            FOCUS,
            alert !== undefined
              ? "text-foreground hover:bg-surface-2"
              : "text-ink-3 hover:bg-surface-2 hover:text-foreground",
            (disabled || !ready) && "opacity-50",
          )}
        >
          {alert !== undefined ? (
            <BellRing aria-hidden className="size-3.5" />
          ) : (
            <Bell aria-hidden className="size-3.5" />
          )}
        </button>
      </div>

      {state === "loading" ? (
        <div className="flex flex-col gap-1.5">
          <Bar className="h-6 w-28" />
          <Bar className="h-5 w-36" />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-baseline gap-1.5 text-[12px] leading-6 text-ink-3">
            <span className="font-mono text-[20px] leading-6 font-medium text-foreground tabular-nums">
              {compact(ready ? usage.used : 0)}
            </span>
            <span className="truncate">
              of {compact(included)} {usage.unit}
            </span>
          </p>
          <span
            className={cn(
              "inline-flex h-5 max-w-full items-center gap-1.5 self-start rounded-full px-2 font-mono text-[10px] leading-none tracking-[0.04em] uppercase",
              !ready
                ? "bg-surface-2 text-ink-2"
                : over
                  ? "bg-[var(--of-over-wash)] text-warn"
                  : overHigh > 0
                    ? "bg-surface-2 text-ink-2"
                    : "bg-[var(--of-ok-wash)] text-success",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                !ready
                  ? "bg-ink-3"
                  : over
                    ? "bg-warn"
                    : overHigh > 0
                      ? "bg-ink-3"
                      : "bg-success",
              )}
            />
            <span className="truncate">
              {!ready ? (
                "Fresh period"
              ) : over ? (
                <>
                  +
                  <Roll
                    value={money(cents(overMid))}
                    motionSafe={motionSafe}
                  />{" "}
                  overage
                </>
              ) : overHigh > 0 ? (
                <>
                  Within · up to{" "}
                  <Roll
                    value={money(cents(overHigh))}
                    motionSafe={motionSafe}
                  />
                </>
              ) : (
                "Within plan"
              )}
            </span>
          </span>
        </div>
      )}

      <Reveal open={editing} motionSafe={motionSafe} id={editorId}>
        <div
          className="flex flex-col gap-1.5 pt-1"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeEditor();
            }
          }}
        >
          <label
            htmlFor={`${editorId}-input`}
            className="text-[11px] leading-4 text-ink-2"
          >
            Alert me at
          </label>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-8 min-w-0 flex-1 items-center">
              <input
                ref={bindInput}
                id={`${editorId}-input`}
                inputMode="numeric"
                autoComplete="off"
                value={draft}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? `${editorId}-error` : undefined}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setDraft(next);
                  setInvalid(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    save();
                  }
                }}
                className={cn(
                  "h-8 w-full min-w-0 rounded-2 border bg-background pr-12 pl-2.5 font-mono text-[12px] text-foreground tabular-nums",
                  FOCUS,
                  invalid ? "border-danger" : "border-input",
                )}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute right-2.5 font-mono text-[11px] text-ink-3"
              >
                {usage.unit}
              </span>
            </span>
            <button
              type="button"
              onClick={save}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-2 bg-[var(--of-switch)] px-3 text-[12px] font-medium text-[var(--of-knob)] transition-opacity hover:opacity-90",
                FOCUS,
              )}
            >
              Save
            </button>
          </div>
          {invalid ? (
            <p
              id={`${editorId}-error`}
              className="text-[11px] leading-4 text-danger"
            >
              Enter a number above 0.
            </p>
          ) : null}
          <div className="flex items-center gap-3 text-[11px] leading-4">
            {alert !== undefined ? (
              <button
                type="button"
                onClick={() => {
                  onAlert(null);
                  closeEditor();
                }}
                className={cn(
                  "rounded-1 text-ink-2 underline-offset-2 hover:text-foreground hover:underline",
                  FOCUS,
                )}
              >
                Remove alert
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeEditor}
              className={cn(
                "rounded-1 text-ink-3 underline-offset-2 hover:text-foreground hover:underline",
                FOCUS,
              )}
            >
              Cancel
            </button>
          </div>
        </div>
      </Reveal>

      <p id={summaryId} className="sr-only">
        {summary}
      </p>

      <div
        ref={setPlotNode}
        role="slider"
        tabIndex={ready ? 0 : -1}
        aria-labelledby={labelId}
        aria-describedby={summaryId}
        aria-valuemin={1}
        aria-valuemax={days}
        aria-valuenow={shownDay}
        aria-valuetext={now.long}
        aria-disabled={!ready || undefined}
        aria-orientation="horizontal"
        onKeyDown={onKey}
        onBlur={() => setCursor(null)}
        onPointerDown={(event) => {
          if (ready) setCursor(dayFromPointer(event));
        }}
        onPointerMove={(event) => {
          if (!ready) return;
          if (event.pointerType === "mouse" || event.buttons > 0) {
            const day = dayFromPointer(event);
            if (day !== cursor) setCursor(day);
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setCursor(null);
        }}
        className={cn(
          "relative touch-pan-y rounded-2 select-none",
          ready && "cursor-crosshair",
          FOCUS,
        )}
        style={{ height: h }}
      >
        <svg
          aria-hidden
          width="100%"
          height={h}
          viewBox={`0 0 ${width} ${h}`}
          preserveAspectRatio="none"
          className="block"
        >
          <defs>
            <linearGradient
              id={fillId}
              gradientUnits="userSpaceOnUse"
              x1={g.xNow}
              x2={g.x(days)}
              y1={0}
              y2={0}
            >
              <stop
                offset="0"
                stopOpacity={0.4}
                style={{ stopColor: "var(--of-fill)" }}
              />
              <stop
                offset="1"
                stopOpacity={0.1}
                style={{ stopColor: "var(--of-fill)" }}
              />
            </linearGradient>
            <linearGradient
              id={overFillId}
              gradientUnits="userSpaceOnUse"
              x1={g.xNow}
              x2={g.x(days)}
              y1={0}
              y2={0}
            >
              <stop
                offset="0"
                stopOpacity={0.46}
                style={{ stopColor: "var(--of-over)" }}
              />
              <stop
                offset="1"
                stopOpacity={0.14}
                style={{ stopColor: "var(--of-over)" }}
              />
            </linearGradient>
            <clipPath id={below}>
              <rect
                x={0}
                y={yIncluded}
                width={width}
                height={Math.max(0, h - yIncluded)}
              />
            </clipPath>
            <clipPath id={above}>
              <rect x={0} y={0} width={width} height={Math.max(0, yIncluded)} />
            </clipPath>
            <clipPath id={revealId}>
              <motion.rect x={0} y={0} height={h} width={revealWidth} />
            </clipPath>
            <clipPath id={alertClip}>
              <motion.rect x={0} y={0} height={h} width={alertWidth} />
            </clipPath>
          </defs>

          {/* Axes: the floor, the today rule, the allowance. Kept through
              loading so the frame never jumps when the readings land. */}
          <line
            x1={0}
            x2={width}
            y1={bottom + 0.5}
            y2={bottom + 0.5}
            strokeWidth={1}
            className="stroke-hairline-strong"
          />
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={g.x(days * f)}
              x2={g.x(days * f)}
              y1={top}
              y2={bottom}
              strokeWidth={1}
              className="stroke-hairline"
            />
          ))}
          <line
            x1={g.xNow}
            x2={g.xNow}
            y1={0}
            y2={bottom}
            strokeWidth={1}
            strokeDasharray="2 3"
            className="stroke-ink-3"
          />
          {state !== "loading" && included > 0 ? (
            <line
              x1={0}
              x2={width}
              y1={yIncluded}
              y2={yIncluded}
              strokeWidth={1}
              className="stroke-ink-2"
              strokeOpacity={0.55}
            />
          ) : null}

          {state === "loading" ? (
            <rect
              x={INSET}
              y={r2(bottom - (bottom - top) * 0.42)}
              width={r2(Math.max(0, g.xNow - INSET))}
              height={r2((bottom - top) * 0.42)}
              rx={4}
              className="fill-surface-2 motion-safe:animate-pulse"
            />
          ) : null}

          {ready ? (
            <>
              <g clipPath={`url(#${revealId})`}>
                <path
                  d={areaPath}
                  className="fill-[var(--of-fill)]"
                  fillOpacity={0.16}
                />
                <g clipPath={`url(#${below})`}>
                  <path
                    d={linePath}
                    fill="none"
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="stroke-[var(--of-ink)]"
                  />
                </g>
                <g clipPath={`url(#${above})`}>
                  <path
                    d={areaPath}
                    className="fill-[var(--of-over)]"
                    fillOpacity={0.22}
                  />
                  <path
                    d={linePath}
                    fill="none"
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="stroke-warn"
                  />
                </g>
              </g>
              <motion.g style={{ opacity: coneOpacity }}>
                <g clipPath={`url(#${below})`}>{coneLayer(false)}</g>
                <g clipPath={`url(#${above})`}>{coneLayer(true)}</g>
              </motion.g>
              {yAlert !== null ? (
                <g clipPath={`url(#${alertClip})`}>
                  <line
                    x1={0}
                    x2={width}
                    y1={yAlert}
                    y2={yAlert}
                    strokeWidth={1.25}
                    strokeDasharray="5 3"
                    className="stroke-foreground"
                    strokeOpacity={0.7}
                  />
                </g>
              ) : null}
              <motion.g style={{ opacity: coneOpacity }}>
                <circle
                  cx={g.xNow}
                  cy={g.y(usage.used)}
                  r={3.25}
                  strokeWidth={1.75}
                  className={cn(
                    "fill-card",
                    usage.used > included
                      ? "stroke-warn"
                      : "stroke-[var(--of-ink)]",
                  )}
                />
              </motion.g>
              <motion.g
                initial={false}
                animate={{ opacity: cursor === null ? 0 : 1 }}
                transition={{ duration: durations.blink }}
              >
                <motion.line
                  x1={cx}
                  x2={cx}
                  y1={0}
                  y2={bottom}
                  strokeWidth={1}
                  className="stroke-foreground"
                  strokeOpacity={0.5}
                />
                <motion.circle
                  cx={cx}
                  cy={cy}
                  r={3}
                  className="fill-foreground"
                />
              </motion.g>
            </>
          ) : null}
        </svg>

        {state !== "loading" && included > 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1.5 font-mono text-[9px] leading-3 text-ink-3 tabular-nums"
            style={{ top: r2(Math.max(0, yIncluded - 13)) }}
          >
            {compact(included)} incl.
          </span>
        ) : null}
        {ready && yAlert !== null && alert !== undefined ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-1.5 font-mono text-[9px] leading-3 text-foreground tabular-nums"
            // Below its line when it sits under the allowance (the usual
            // early warning), above it otherwise, so the two labels never
            // share a row and neither sits in the cone.
            style={{
              top: r2(
                clamp(alert <= included ? yAlert + 2 : yAlert - 13, 0, h - 12),
              ),
            }}
          >
            alert {compact(alert)}
          </span>
        ) : null}
        {state === "empty" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 text-center text-[11px] leading-4 text-ink-3"
          >
            Nothing used yet · resets {resets}
          </span>
        ) : null}
      </div>

      <div
        aria-hidden
        className="relative h-3.5 font-mono text-[9px] leading-3.5 text-ink-3 tabular-nums"
      >
        <span className="absolute left-0">{dayLabel(periodStart)}</span>
        {todayPct > 16 && todayPct < 84 ? (
          <span
            className="absolute -translate-x-1/2 text-ink-2"
            style={{ left: `${todayPct}%` }}
          >
            Today
          </span>
        ) : null}
        <span className="absolute right-0">{lastDay}</span>
      </div>

      <p
        aria-hidden
        className="flex min-w-0 items-baseline justify-between gap-2 text-[11px] leading-4"
      >
        <span
          className={cn(
            "truncate font-mono tabular-nums",
            cursor === null ? "text-ink-2" : "text-foreground",
          )}
        >
          {now.short}
        </span>
        {ready ? (
          <span className="shrink-0 font-mono text-ink-3 tabular-nums">
            {crossing === "passed"
              ? "alert passed"
              : crossing
                ? `alert ~${crossing}`
                : `→ ${compact(range.mid)}`}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A metered-usage panel that says where each meter will land by the end of
 * the period. Every meter is a small chart: its history up to today, the
 * plan's allowance as a hairline, and a forecast cone fanning from today's
 * reading to the period's end — the part of it above the allowance drawn in
 * warn, so "this is where you go over" needs no legend. The projected bill
 * sums the plan and each meter's likely overage.
 *
 * The signature is the cone. When a meter is first seen its history draws
 * across to today and the cone grows out of today's reading on
 * `springs.glide`, the meters a beat apart; turning on planned load springs
 * every cone's ends to their new values on the same spring, so each fan
 * visibly widens and lifts while the meter's overage and the projected bill
 * roll to their new figures. All geometry is derived from motion values —
 * nothing re-renders per frame, nothing loops, and the entrance waits until
 * the meter is in view.
 *
 * Each chart is a slider over the period's days: hover, a tap or the arrow
 * keys move a cursor (on `springs.flick`) whose reading is the slider's
 * value text — use so far, or the likely range ahead. Bells set alerts in a
 * small editor (Enter saves, Escape cancels); a saved alert sweeps in as a
 * dashed line and the readout names the day the forecast crosses it. Loading
 * keeps the axes, a fresh period shows empty meters and their reset date,
 * and under reduced motion everything is in place at once and the cone's
 * change is a short tween — the widening is information, so it still shows.
 */
export function OverageForecast({
  usage = defaultOverageUsage,
  plan = defaultOveragePlan,
  forecast = defaultOverageForecast,
  now = DEFAULT_NOW,
  account = "Gaugeworks",
  includePlanned: plannedProp,
  defaultIncludePlanned = false,
  onForecastToggle,
  alerts: alertsProp,
  defaultAlerts = DEFAULT_ALERTS,
  onSetAlert,
  upgrade = DEFAULT_UPGRADE,
  onUpgrade,
  status = "ready",
  onRetry,
  coneStyle = "fan",
  meterHeight = 88,
  accent = "cobalt",
  formatMoney = defaultMoney,
  disabled = false,
  className,
}: OverageForecastProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const switchId = `${uid}-switch`;
  const noteId = `${uid}-note`;

  const [ownPlanned, setOwnPlanned] = React.useState(defaultIncludePlanned);
  const planned = plannedProp ?? ownPlanned;
  const [ownAlerts, setOwnAlerts] = React.useState(defaultAlerts);
  const alerts = alertsProp ?? ownAlerts;
  const [announcement, setAnnouncement] = React.useState("");

  const days = Math.max(
    1,
    Math.round((plan.periodEnd - plan.periodStart) / DAY),
  );
  const tNow = clamp((now - plan.periodStart) / DAY, 0, days);
  const dayNumber = Math.min(days, Math.floor(tNow) + 1);
  const resets = dayLabel(plan.periodEnd);
  const fresh = status === "empty";
  const ready = status === "ready";
  const meterState: "ready" | "loading" | "empty" =
    status === "loading" ? "loading" : fresh ? "empty" : "ready";

  // A fresh period has nothing to forecast yet: the bill is the plan.
  const bill = fresh
    ? { low: plan.price, mid: plan.price, high: plan.price, overage: 0 }
    : projectOverageBill(usage, plan, forecast, planned && ready);
  const notes = usage
    .map((u) => forecast[u.id]?.planned?.note)
    .filter((n): n is string => Boolean(n));
  const hasPlanned = notes.length > 0;

  const toggle = () => {
    if (disabled || !ready || !hasPlanned) return;
    const next = !planned;
    if (plannedProp === undefined) setOwnPlanned(next);
    onForecastToggle?.(next);
    const after = projectOverageBill(usage, plan, forecast, next);
    setAnnouncement(
      `Planned load ${next ? "included" : "left out"}. Projected bill ${formatMoney(after.mid)}.`,
    );
  };

  const setAlert = (id: string, value: number | null) => {
    const next = { ...alerts };
    if (value === null) delete next[id];
    else next[id] = value;
    if (alertsProp === undefined) setOwnAlerts(next);
    onSetAlert?.(id, value);
    const label = usage.find((u) => u.id === id);
    setAnnouncement(
      value === null
        ? `Alert for ${label?.label ?? id} removed.`
        : `Alert for ${label?.label ?? id} set at ${whole(value)} ${label?.unit ?? ""}.`.replace(
            / \.$/,
            ".",
          ),
    );
  };

  /* ---------------------------------- body -------------------------------- */

  const meters =
    status === "error" ? (
      <div className="flex flex-col items-center gap-2 rounded-3 border border-hairline px-4 py-6 text-center">
        <TriangleAlert aria-hidden className="size-4 text-danger" />
        <p className="text-[13px] leading-5 text-foreground">
          The usage readings didn&apos;t load.
        </p>
        <p className="text-[12px] leading-4 text-ink-3">
          Your meters keep counting; only this view is behind.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div
        aria-busy={status === "loading" || undefined}
        className="grid grid-cols-1 gap-3 @min-[36rem]:grid-cols-[repeat(var(--of-cols),minmax(0,1fr))]"
        style={
          {
            "--of-cols": Math.max(1, Math.min(3, usage.length)),
          } as React.CSSProperties
        }
      >
        {usage.map((u, i) => {
          const range = endRange(forecast[u.id], u.used, planned);
          const terms = plan.meters[u.id];
          // One scale for both forecasts, so the switch moves the cone and
          // never re-scales the history underneath it.
          const full = endRange(forecast[u.id], u.used, true);
          const peak = Math.max(
            terms?.included ?? 0,
            full.high,
            alerts[u.id] ?? 0,
            u.used,
            ...(u.history ?? [0]),
          );
          return (
            <Meter
              key={u.id}
              uid={uid}
              index={i}
              count={usage.length}
              usage={u}
              terms={terms}
              range={range}
              yMax={peak * 1.06}
              days={days}
              tNow={tNow}
              periodStart={plan.periodStart}
              periodEnd={plan.periodEnd}
              alert={alerts[u.id]}
              onAlert={(value) => setAlert(u.id, value)}
              state={meterState}
              coneStyle={coneStyle}
              height={meterHeight}
              motionSafe={motionSafe}
              disabled={disabled}
              money={formatMoney}
            />
          );
        })}
      </div>
    );

  const coversIt = upgrade !== null && ready && bill.mid > upgrade.price;

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container flex max-h-[36rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-4 p-4 @min-[36rem]:p-5">
          <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className={EYEBROW}>
                Usage · {dayLabel(plan.periodStart)} –{" "}
                {dayLabel(plan.periodEnd - DAY)}
              </p>
              <h2
                id={titleId}
                className="truncate text-[15px] leading-6 font-semibold text-foreground"
              >
                {account} · {plan.name}
              </h2>
              <p className="text-[12px] leading-4 text-ink-3">
                {fresh
                  ? `Day 1 of ${days} · resets ${resets}`
                  : `Day ${dayNumber} of ${days} · resets ${resets}`}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 @min-[36rem]:items-end @min-[36rem]:text-right">
              <p className={EYEBROW}>Projected bill</p>
              {status === "loading" ? (
                <>
                  <Bar className="my-1 h-6 w-28" />
                  <Bar className="h-3.5 w-40" />
                </>
              ) : (
                <>
                  <p className="font-mono text-[24px] leading-8 font-medium text-foreground tabular-nums">
                    <span className="sr-only">{formatMoney(bill.mid)}</span>
                    <Roll
                      value={formatMoney(bill.mid)}
                      motionSafe={motionSafe}
                    />
                  </p>
                  <p className="text-[12px] leading-4 text-ink-3">
                    Plan {formatMoney(plan.price)}
                    {bill.overage > 0 ? (
                      <>
                        {" "}
                        + overage{" "}
                        <span className="text-warn">
                          {formatMoney(bill.overage)}
                        </span>
                      </>
                    ) : null}
                  </p>
                  {bill.high > bill.low ? (
                    <p className="font-mono text-[11px] leading-4 text-ink-3 tabular-nums">
                      likely {formatMoney(bill.low)} – {formatMoney(bill.high)}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </header>

          {hasPlanned ? (
            <div className="flex items-center justify-between gap-3 rounded-3 border border-hairline bg-card px-3 py-2.5">
              <span className="flex min-w-0 flex-col">
                <span
                  id={switchId}
                  className="text-[13px] leading-5 font-medium text-foreground"
                >
                  Include planned load
                </span>
                <span
                  id={noteId}
                  className="truncate text-[11px] leading-4 text-ink-3"
                >
                  {notes.join(" · ")}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={planned}
                aria-labelledby={switchId}
                aria-describedby={noteId}
                aria-disabled={disabled || !ready || undefined}
                onClick={toggle}
                className={cn(
                  "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
                  FOCUS,
                  planned
                    ? "bg-[var(--of-switch)]"
                    : "bg-surface-2 ring-1 ring-hairline-strong ring-inset",
                  (disabled || !ready) && "opacity-50",
                )}
              >
                <motion.span
                  aria-hidden
                  className={cn(
                    "absolute top-1 left-1 size-4 rounded-full shadow-sm transition-colors",
                    planned ? "bg-[var(--of-knob)]" : "bg-ink-3",
                  )}
                  initial={false}
                  animate={{ x: planned ? 16 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </button>
            </div>
          ) : null}

          {meters}

          {upgrade && status !== "error" ? (
            <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hairline pt-3">
              <p className="min-w-0 flex-1 basis-56 text-[12px] leading-5 text-ink-2">
                {coversIt ? (
                  <>
                    <span className="font-medium text-foreground">
                      {upgrade.name} is {formatMoney(upgrade.price)} flat
                    </span>{" "}
                    — less than this period is heading for.
                    {upgrade.note ? (
                      <span className="text-ink-3"> {upgrade.note}.</span>
                    ) : null}
                  </>
                ) : fresh ? (
                  <>
                    A fresh period: nothing to forecast until the meters move.
                  </>
                ) : (
                  <>
                    On track to stay near{" "}
                    <span className="font-medium text-foreground">
                      {formatMoney(bill.mid)}
                    </span>{" "}
                    on {plan.name}.
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!disabled) onUpgrade?.(upgrade);
                }}
                aria-disabled={disabled || undefined}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium whitespace-nowrap transition-[background-color,opacity,translate] active:translate-y-px",
                  FOCUS,
                  coversIt
                    ? "bg-[var(--of-switch)] text-[var(--of-knob)] hover:opacity-90"
                    : "border border-hairline text-foreground hover:bg-surface-2",
                  disabled && "opacity-50",
                )}
              >
                {coversIt ? `Compare ${upgrade.name}` : "See plans"}
                <ArrowUpRight aria-hidden className="size-3.5" />
              </button>
            </footer>
          ) : null}
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
