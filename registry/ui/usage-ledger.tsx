"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { BellRing, RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type UsageStack = "model" | "kind" | "total";
export type UsageRange = "7d" | "30d" | "90d";
export type UsageStatus = "ready" | "loading" | "error";

export type UsageModel = {
  id: string;
  /** Shown in the legend and the readouts. */
  name: string;
  /** Any CSS colour for its bars — pass a token, never a hex. Defaults to the house series hues. */
  color?: string;
  /** Price per million tokens of each kind, in the ledger's currency. */
  price: { input: number; output: number; cached?: number };
};

export type UsageTokens = { input: number; output: number; cached?: number };

export type UsageDay = {
  /** The day, as YYYY-MM-DD. */
  date: string;
  /** Tokens per model id. */
  usage: Record<string, UsageTokens>;
};

export type UsageLedgerProps = {
  /** Controlled alert threshold: tokens per day. The line you drag; days above it turn warn. */
  threshold?: number;
  /** Initial threshold when uncontrolled. @default 1500000 */
  defaultThreshold?: number;
  /** Fires from the drag or key that moved the line, once per round value it lands on. */
  onThresholdChange?: (threshold: number) => void;
  /** What the bars are split by: each model, each kind of token, or one total. @default "model" */
  stack?: UsageStack;
  /** Controlled period: the last 7, 30 or 90 days up to `now`. */
  range?: UsageRange;
  /** Initial period when uncontrolled. @default "30d" */
  defaultRange?: UsageRange;
  /** Fires from the period control with the new period. */
  onRangeChange?: (range: UsageRange) => void;
  /** The round number the line snaps to. @default a nice step of the axis */
  thresholdStep?: number;
  /** The models being billed. @default defaultUsageModels */
  models?: UsageModel[];
  /** One record per day. @default defaultUsageDays (90 seeded days) */
  days?: UsageDay[];
  /** Today (Date or ms): where the period ends and the month's budget is counted to. @default the last day in `days` */
  now?: number | Date;
  /** The monthly budget, in the ledger's currency. @default 330 */
  budget?: number;
  /** Enter on a day, or a click on its bar. */
  onDaySelect?: (date: string) => void;
  /** Money in the gauge and readouts. @default US dollars in `locale` */
  format?: (amount: number) => string;
  /** Token counts. @default compact: 820k, 1.5M */
  formatTokens?: (tokens: number) => string;
  /** Day labels, from a YYYY-MM-DD date. @default "Sep 14" */
  formatDate?: (date: string) => string;
  /** The locale for the default money format. @default "en-US" */
  locale?: string;
  /** Whether the usage has arrived. @default "ready" */
  status?: UsageStatus;
  /** "Try again" was pressed after the usage failed to load. */
  onRetry?: () => void;
  /** The panel's heading. @default "Usage" */
  title?: string;
  /** The panel's accessible name. @default the title */
  label?: string;
  /** Play the detents and ticks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const DAY_MS = 86_400_000;

/** A small seeded generator: the same ninety days on every machine. */
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const msOf = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const defaultUsageModels: UsageModel[] = [
  {
    id: "fw3",
    name: "Fernworks Model 3",
    price: { input: 6, output: 24, cached: 0.6 },
  },
  {
    id: "gwr",
    name: "Gaugeworks Reasoner",
    price: { input: 15, output: 60, cached: 1.5 },
  },
  { id: "emb", name: "Fieldline Embed", price: { input: 0.2, output: 0 } },
];

/** The last day of the seeded ledger: 28 September 2026. */
export const defaultUsageNow = Date.UTC(2026, 8, 28);

/**
 * Ninety days of a Fieldline workspace: weekdays busy, weekends quiet, a
 * slow climb, and a handful of batch days that spike past the alert.
 */
export const defaultUsageDays: UsageDay[] = (() => {
  const rand = mulberry32(1295);
  const surge: Record<number, number> = {
    25: 1.4,
    40: 1.5,
    61: 1.55,
    66: 1.45,
    72: 1.6,
    79: 1.5,
    84: 1.4,
    86: 1.65,
  };
  return Array.from({ length: 90 }, (_, k) => {
    const t = defaultUsageNow - (89 - k) * DAY_MS;
    const dow = new Date(t).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const base =
      (weekend ? 0.42 : 1) * (0.72 + 0.38 * (k / 89)) * (surge[k] ?? 1);
    const n = () => base * (0.85 + rand() * 0.3);
    return {
      date: isoOf(t),
      usage: {
        fw3: {
          input: Math.round(560_000 * n()),
          output: Math.round(110_000 * n()),
          cached: Math.round(160_000 * n()),
        },
        gwr: {
          input: Math.round(170_000 * n()),
          output: Math.round(52_000 * n()),
          cached: Math.round(24_000 * n()),
        },
        emb: { input: Math.round(230_000 * n()), output: 0 },
      },
    };
  });
})();

const RANGE_DAYS: Record<UsageRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};
const RANGE_NAMES: Record<UsageRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};
const RANGES: UsageRange[] = ["7d", "30d", "90d"];
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const MONTHS_LONG =
  "January February March April May June July August September October November December".split(
    " ",
  );

/**
 * Bars are filled shapes, so they are pigment: each series takes a token's
 * hue at a fixed lightness and reads the same in both themes. Warn days keep
 * their segments' order as three lightness steps of the warn hue.
 */
const PIGMENT = [
  "oklch(from var(--accent-bright) 0.62 0.17 h)",
  "oklch(from var(--signal) 0.74 0.13 h)",
  "oklch(from var(--accent-bright) 0.68 0.15 calc(h + 70))",
];
const KIND_PIGMENT = [
  "oklch(from var(--accent-bright) 0.62 0.17 h)",
  "oklch(from var(--accent-bright) 0.46 0.15 h)",
  "oklch(from var(--accent-bright) 0.8 0.08 h)",
];
const WARN_PIGMENT = [
  "oklch(from var(--warn) 0.84 0.13 h)",
  "oklch(from var(--warn) 0.74 0.15 h)",
  "oklch(from var(--warn) 0.64 0.14 h)",
];

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The next "nice" number at or above v: 1, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (m * p >= v - 1e-9) return Math.round(m * p);
  }
  return Math.round(10 * p);
}

function niceStep(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v - 1e-9) return m * p;
  return 10 * p;
}

function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${Number((n / 1e6).toFixed(a >= 1e7 ? 0 : 1))}M`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}k`;
  return `${Math.round(n)}`;
}

const dayLabel = (iso: string) => {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`;
};

const sumTokens = (u: UsageTokens) => u.input + u.output + (u.cached ?? 0);

type Series = { id: string; name: string; color: string };

type Column = {
  date: string;
  total: number;
  parts: number[];
};

/** Gauge geometry: a 240° arc opening at the bottom. */
const G = { size: 132, c: 66, r: 54, from: 150, sweep: 240 };
const polar = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [r3(G.c + G.r * Math.cos(a)), r3(G.c + G.r * Math.sin(a))] as const;
};
function arc(from: number, to: number): string {
  if (to - from < 0.05) return "";
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to);
  return `M ${x1} ${y1} A ${G.r} ${G.r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

/** One series' days as a sparkline, in a 100 × 28 box. */
function sparkPath(values: number[], max: number) {
  if (values.length === 0) return { line: "", area: "" };
  const n = values.length;
  const pts = values.map((v, i) => [
    r2(n === 1 ? 50 : (i / (n - 1)) * 100),
    r2(26 - (v / Math.max(1, max)) * 23),
  ]);
  const line = `M ${pts.map(([x, y]) => `${x} ${y}`).join(" L ")}`;
  return { line, area: `${line} L 100 28 L 0 28 Z` };
}

/**
 * Where the tokens went, day by day. Each day is a column stacked by model
 * (or by kind, or one total) that grows up from the baseline on glide, the
 * whole period sweeping in inside 360ms. A threshold line marks the daily
 * alert: drag it and it follows the finger with a magnetic pull to round
 * numbers — each one it lands on is a detent — rubber-banding past the
 * plot's edges, and every day above it turns to warn pigment as the line
 * passes; let go and it springs onto its value on snap with the throw's
 * velocity.
 *
 * Pointing at a column (or a sparkline in the legend) reads that day out,
 * and the two stay in step. The budget gauge sweeps the month's spend in on
 * drift and marks where the month is heading. The plot is a slider over the
 * days, the line's grip a slider over the threshold, the period a radio
 * group. Under reduced motion nothing grows, sweeps or springs; the line
 * still follows the finger and snaps, and the days still change colour.
 */
export function UsageLedger({
  threshold,
  defaultThreshold = 1_500_000,
  onThresholdChange,
  stack = "model",
  range,
  defaultRange = "30d",
  onRangeChange,
  thresholdStep,
  models = defaultUsageModels,
  days = defaultUsageDays,
  now,
  budget = 330,
  onDaySelect,
  format,
  formatTokens = compact,
  formatDate = dayLabel,
  locale = "en-US",
  status = "ready",
  onRetry,
  title = "Usage",
  label,
  sound = false,
  disabled = false,
  className,
}: UsageLedgerProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const idBase = `k${uid.replace(/[^a-zA-Z0-9]/g, "")}`;
  const titleId = `${uid}-title`;

  const money = React.useMemo(() => {
    if (format) return format;
    const nf = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    });
    return (v: number) => nf.format(Math.round(v * 100) / 100);
  }, [format, locale]);

  /* ------------------------------- the data ------------------------------- */

  const [ownRange, setOwnRange] = React.useState<UsageRange>(defaultRange);
  const period = range ?? ownRange;
  const count = RANGE_DAYS[period] ?? 30;

  const nowMs =
    (now === undefined
      ? undefined
      : typeof now === "number"
        ? now
        : now.getTime()) ??
    (days.length ? msOf(days[days.length - 1]?.date ?? "1970-01-01") : 0);
  const today = isoOf(nowMs);

  const byDate = React.useMemo(() => {
    const map = new Map<string, UsageDay>();
    for (const d of days) map.set(d.date, d);
    return map;
  }, [days]);

  const series: Series[] = React.useMemo(() => {
    if (stack === "kind") {
      return [
        { id: "input", name: "Input", color: KIND_PIGMENT[0] ?? "" },
        { id: "output", name: "Output", color: KIND_PIGMENT[1] ?? "" },
        { id: "cached", name: "Cached", color: KIND_PIGMENT[2] ?? "" },
      ];
    }
    if (stack === "total") {
      return [{ id: "total", name: "All models", color: PIGMENT[0] ?? "" }];
    }
    return models.map((m, i) => ({
      id: m.id,
      name: m.name,
      color: m.color ?? PIGMENT[i % PIGMENT.length] ?? "",
    }));
  }, [stack, models]);

  const columns: Column[] = React.useMemo(() => {
    const out: Column[] = [];
    const end = msOf(today);
    for (let k = count - 1; k >= 0; k -= 1) {
      const date = isoOf(end - k * DAY_MS);
      const rec = byDate.get(date);
      const usage = rec?.usage ?? {};
      const parts = series.map((s) => {
        if (stack === "model") {
          const u = usage[s.id];
          return u ? sumTokens(u) : 0;
        }
        let sum = 0;
        for (const u of Object.values(usage)) {
          if (s.id === "total") sum += sumTokens(u);
          else if (s.id === "input") sum += u.input;
          else if (s.id === "output") sum += u.output;
          else sum += u.cached ?? 0;
        }
        return sum;
      });
      out.push({ date, total: parts.reduce((a, b) => a + b, 0), parts });
    }
    return out;
  }, [byDate, count, series, stack, today]);

  const hasData = columns.some((c) => c.total > 0);
  const maxDay = columns.reduce((a, c) => Math.max(a, c.total), 0);
  const axisMax = niceCeil(Math.max(maxDay * 1.1, 1));
  const step = thresholdStep ?? niceStep(axisMax / 12);
  const ticks = React.useMemo(() => {
    const tick = niceStep(axisMax / 3.5);
    const out: number[] = [];
    for (let v = 0; v <= axisMax + 1e-6; v += tick) out.push(Math.round(v));
    return out;
  }, [axisMax]);

  // The month's spend, from each model's price, up to today.
  const month = today.slice(0, 7);
  const spend = React.useMemo(() => {
    let sum = 0;
    for (const d of days) {
      if (!d.date.startsWith(month) || d.date > today) continue;
      for (const m of models) {
        const u = d.usage[m.id];
        if (!u) continue;
        sum +=
          (u.input * m.price.input +
            u.output * m.price.output +
            (u.cached ?? 0) * (m.price.cached ?? 0)) /
          1e6;
      }
    }
    return Math.round(sum * 100) / 100;
  }, [days, models, month, today]);
  const dayOfMonth = Number(today.slice(8, 10)) || 1;
  const [yy = 1970, mm = 1] = month.split("-").map(Number);
  const monthDays = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const projected = Math.round((spend / dayOfMonth) * monthDays * 100) / 100;
  const resets = `${MONTHS[mm % 12] ?? ""} 1`;
  const monthName = MONTHS_LONG[mm - 1] ?? "This month";

  /* ----------------------------- the threshold ---------------------------- */

  const [ownThreshold, setOwnThreshold] = React.useState(defaultThreshold);
  const value = threshold ?? ownThreshold;
  const [drag, setDrag] = React.useState<{ base: number; at: number } | null>(
    null,
  );
  const shown = drag ? drag.at : value;
  const over = columns.filter((c) => c.total > shown).length;
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const plotRef = React.useRef<HTMLDivElement | null>(null);
  const [plotH, setPlotH] = React.useState(0);
  /** The line's offset from its rest, in px: only the finger and the release spring move it. */
  const lineY = useMotionValue(0);
  const lineAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const grip = React.useRef<{ base: number; at: number; from: number } | null>(
    null,
  );

  const yOf = (v: number) => plotH * (1 - clamp(v, 0, axisMax) / axisMax);
  const snap = (v: number) =>
    clamp(Math.round(v / step) * step, step, Math.floor(axisMax / step) * step);

  const sentence = (v: number) => {
    const k = columns.filter((c) => c.total > v).length;
    return `Alert at ${formatTokens(v)} tokens a day, ${k} of ${columns.length} ${columns.length === 1 ? "day" : "days"} over.`;
  };

  const report = (v: number) => {
    if (threshold === undefined) setOwnThreshold(v);
    onThresholdChange?.(v);
  };

  const detent = (v: number) =>
    audio.play("detent", {
      pitch: r2(0.8 + 0.6 * (v / axisMax)),
      gain: 0.45,
    });

  const setByKey = (v: number) => {
    const next = snap(v);
    if (next === value) return;
    detent(next);
    report(next);
    setSaid((s) => ({ n: s.n + 1, text: sentence(next) }));
  };

  const gesture = useDrag({
    axis: "y",
    threshold: 3,
    disabled: disabled || status !== "ready" || plotH === 0,
    onStart: () => {
      lineAnim.current?.stop();
      lineAnim.current = null;
      grip.current = { base: value, at: value, from: yOf(value) + lineY.get() };
      setDrag({ base: value, at: value });
    },
    onMove: ({ offset }) => {
      const g = grip.current;
      if (!g || plotH === 0) return;
      const raw = g.from + offset.y;
      const y = motionSafe
        ? rubberClamp(raw, 0, plotH, plotH * 0.25)
        : clamp(raw, 0, plotH);
      const at = snap((1 - clamp(y, 0, plotH) / plotH) * axisMax);
      // A soft detent: near a round value the line leans onto it; halfway
      // between two it is exactly under the finger. Beyond the first and
      // last round values it follows the finger, and past the plot's edges
      // the rubber band rules, so the line never jumps.
      const half = ((step / axisMax) * plotH) / 2;
      const home = yOf(at);
      const t = clamp((y - home) / half, -1, 1);
      const pulled = home + Math.sign(t) * Math.pow(Math.abs(t), 1.8) * half;
      const top = yOf(snap(axisMax));
      const bottom = yOf(snap(0));
      const visual = y < top || y > bottom ? y : pulled;
      lineY.set(r2(visual - yOf(g.base)));
      if (at === g.at) return;
      g.at = at;
      setDrag({ base: g.base, at });
      detent(at);
      report(at);
    },
    onEnd: ({ velocity }) => {
      const g = grip.current;
      grip.current = null;
      setDrag(null);
      if (g) setSaid((s) => ({ n: s.n + 1, text: sentence(g.at) }));
      // The rest glides to the value on snap (below); the offset from the
      // finger springs home on snap too, carrying the throw.
      lineAnim.current = motionSafe
        ? animate(lineY, 0, { ...springs.snap, velocity: velocity.y })
        : null;
      if (!motionSafe) lineY.set(0);
    },
    onCancel: () => {
      grip.current = null;
      setDrag(null);
      lineAnim.current = motionSafe ? animate(lineY, 0, springs.snap) : null;
      if (!motionSafe) lineY.set(0);
    },
  });

  React.useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setPlotH(node.clientHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [status, hasData]);

  React.useEffect(() => () => lineAnim.current?.stop(), []);

  /* -------------------------------- cursor -------------------------------- */

  const [cursor, setCursor] = React.useState<number | null>(null);
  const [plotFocused, setPlotFocused] = React.useState(false);
  const cursorCol = cursor !== null ? columns[cursor] : undefined;

  const indexAt = (clientX: number, el: Element) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return clamp(
      Math.floor(((clientX - rect.left) / rect.width) * columns.length),
      0,
      columns.length - 1,
    );
  };

  const moveCursor = (i: number, viaKey: boolean) => {
    const next = clamp(i, 0, columns.length - 1);
    if (next === cursor) return;
    setCursor(next);
    if (viaKey)
      audio.play("tick", {
        pitch: r2(0.9 + 0.3 * (next / columns.length)),
        gain: 0.35,
      });
  };

  const pickRange = (r: UsageRange) => {
    if (r === period || disabled) return;
    if (range === undefined) setOwnRange(r);
    setCursor(null);
    audio.play("tick", {
      pitch: r === "7d" ? 1.2 : r === "30d" ? 1 : 0.85,
      gain: 0.45,
    });
    onRangeChange?.(r);
  };

  /* ------------------------------ the gauge ------------------------------- */

  const sweep = useMotionValue(0);
  const spendShown = useMotionValue(0);
  const spendFrac = budget > 0 ? Math.min(1, spend / budget) : 0;
  const projFrac = budget > 0 ? Math.min(1, projected / budget) : 0;
  const overBudget = projected > budget;

  React.useEffect(() => {
    if (status !== "ready") return;
    if (!motionSafe) {
      sweep.set(spendFrac);
      spendShown.set(spend);
      return;
    }
    const a = animate(sweep, spendFrac, springs.drift);
    const b = animate(spendShown, spend, {
      duration: durations.page,
      ease: easings.enter,
    });
    return () => {
      a.stop();
      b.stop();
    };
  }, [spendFrac, spend, motionSafe, status, sweep, spendShown]);

  const spendArc = useTransform(sweep, (s) =>
    arc(G.from, G.from + G.sweep * clamp(s, 0, 1)),
  );
  const spendText = useTransform(spendShown, (v) => money(v));
  const projAngle = G.from + G.sweep * projFrac;
  const [tickX1, tickY1] = (() => {
    const a = (projAngle * Math.PI) / 180;
    return [
      r3(G.c + (G.r + 7) * Math.cos(a)),
      r3(G.c + (G.r + 7) * Math.sin(a)),
    ];
  })();
  const [tickX2, tickY2] = (() => {
    const a = (projAngle * Math.PI) / 180;
    return [
      r3(G.c + (G.r + 11.5) * Math.cos(a)),
      r3(G.c + (G.r + 11.5) * Math.sin(a)),
    ];
  })();

  /* ------------------------------- the KPIs ------------------------------- */

  const totalTokens = columns.reduce((a, c) => a + c.total, 0);
  const average = columns.length ? totalTokens / columns.length : 0;
  const totalShown = useMotionValue(0);
  React.useEffect(() => {
    if (status !== "ready") return;
    if (!motionSafe) {
      totalShown.set(totalTokens);
      return;
    }
    // Counts on the same beat the bars land on.
    const a = animate(totalShown, totalTokens, {
      duration: durations.slow + 0.2,
      ease: easings.enter,
    });
    return () => a.stop();
  }, [totalTokens, motionSafe, status, totalShown]);
  const totalText = useTransform(totalShown, (v) =>
    formatTokens(Math.round(v)),
  );

  /* ------------------------------- render --------------------------------- */

  const n = columns.length;
  const gap = n <= 7 ? "gap-2" : n <= 31 ? "gap-[3px]" : "gap-px";
  // cascade() bottoms out at 20ms a column, which is 1.8 s for ninety days;
  // the sweep is held to 360ms whatever the period.
  const stagger = Math.min(0.03, 0.36 / Math.max(1, n - 1));
  const linePct = r3(
    (1 - clamp(drag ? drag.base : value, 0, axisMax) / axisMax) * 100,
  );
  const lineAbove = value > axisMax;

  const seriesTotals = series.map((s, i) => ({
    ...s,
    total: columns.reduce((a, c) => a + (c.parts[i] ?? 0), 0),
    values: columns.map((c) => c.parts[i] ?? 0),
  }));

  const readout = (c: Column) => (
    <>
      <p className="font-mono text-[11px] text-ink-3">
        {formatDate(c.date)}
        {c.date === today ? " · today" : ""}
      </p>
      <p className="font-mono text-sm text-foreground tabular-nums">
        {formatTokens(c.total)}
      </p>
      {series.length > 1 ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {series.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center gap-1.5 text-[11px] text-ink-2"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: s.color }}
              />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="font-mono tabular-nums">
                {formatTokens(c.parts[i] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p
        className={cn(
          "mt-1 text-[11px]",
          c.total > shown ? "text-warn" : "text-ink-3",
        )}
      >
        {c.total > shown
          ? `Over by ${formatTokens(c.total - shown)}`
          : `${formatTokens(shown - c.total)} under`}
      </p>
    </>
  );

  const body = () => {
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className="grid gap-3 p-4 @min-[40rem]:grid-cols-[13.5rem_minmax(0,1fr)]"
        >
          <p className="sr-only">Loading usage.</p>
          <div className="h-56 rounded-3 bg-surface-2" />
          <div className="flex h-56 items-end gap-1 rounded-3 bg-surface-1 p-3">
            {Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                className="flex-1 rounded-t-[2px] bg-surface-2"
                style={{ height: `${30 + ((i * 37) % 60)}%` }}
              />
            ))}
          </div>
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Usage did not load.</p>
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
      <div className="grid gap-3 p-3 @min-[40rem]:grid-cols-[13.5rem_minmax(0,1fr)] @min-[40rem]:gap-4 @min-[40rem]:p-4 @min-[68rem]:grid-cols-[14rem_minmax(0,1fr)_17.5rem]">
        {/* The month's budget */}
        <section
          aria-label={`${monthName} budget`}
          className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-3 border border-hairline bg-surface-1 p-3 @min-[40rem]:grid-cols-1 @min-[40rem]:items-start"
        >
          <div className="flex flex-col items-center">
            <p className="hidden self-start font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]:block">
              {monthName} budget
            </p>
            <div
              role="meter"
              aria-label={`${monthName} spend`}
              aria-valuemin={0}
              aria-valuemax={budget}
              aria-valuenow={spend}
              aria-valuetext={`${money(spend)} of ${money(budget)}, projected ${money(projected)}`}
              className="relative size-[7.5rem] @min-[40rem]:size-[8.25rem]"
            >
              <svg
                aria-hidden
                viewBox={`0 0 ${G.size} ${G.size}`}
                className="size-full"
              >
                <path
                  d={arc(G.from, G.from + G.sweep)}
                  fill="none"
                  strokeWidth={10}
                  strokeLinecap="round"
                  className="stroke-surface-2"
                />
                {projFrac > spendFrac ? (
                  <path
                    d={arc(G.from + G.sweep * spendFrac, projAngle)}
                    fill="none"
                    strokeWidth={10}
                    strokeDasharray="2 3"
                    style={{
                      stroke: overBudget
                        ? "oklch(from var(--warn) 0.78 0.14 h)"
                        : "color-mix(in oklab, var(--accent-bright) 35%, transparent)",
                    }}
                  />
                ) : null}
                <motion.path
                  d={spendArc}
                  fill="none"
                  strokeWidth={10}
                  strokeLinecap="round"
                  style={{ stroke: PIGMENT[0] }}
                />
                <line
                  x1={tickX1}
                  y1={tickY1}
                  x2={tickX2}
                  y2={tickY2}
                  strokeWidth={2}
                  strokeLinecap="round"
                  className={overBudget ? "stroke-warn" : "stroke-ink-2"}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
                <motion.span className="font-mono text-[15px] leading-tight font-medium text-foreground tabular-nums">
                  {spendText}
                </motion.span>
                <span className="text-[11px] text-ink-3">
                  of {money(budget)}
                </span>
              </div>
            </div>
          </div>
          <p
            className={cn(
              "order-3 col-span-2 text-center text-[11px] @min-[40rem]:order-2 @min-[40rem]:col-span-1 @min-[40rem]:-mt-1",
              overBudget ? "text-warn" : "text-ink-3",
            )}
          >
            {overBudget
              ? `On pace for ${money(projected)}, ${money(projected - budget)} over`
              : `On pace for ${money(projected)}`}
            <span className="block text-ink-3">Resets {resets}</span>
          </p>
          <dl className="order-2 grid gap-2 @min-[40rem]:order-3 @min-[40rem]:grid-cols-1 @min-[40rem]:border-t @min-[40rem]:border-hairline @min-[40rem]:pt-2">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[11px] whitespace-nowrap text-ink-3">
                Tokens
              </dt>
              <motion.dd className="font-mono text-[13px] text-foreground tabular-nums">
                {totalText}
              </motion.dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[11px] whitespace-nowrap text-ink-3">
                Per day
              </dt>
              <dd className="font-mono text-[13px] text-foreground tabular-nums">
                {formatTokens(average)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[11px] whitespace-nowrap text-ink-3">
                Days over
              </dt>
              <dd
                className={cn(
                  "font-mono text-[13px] tabular-nums",
                  over > 0 ? "text-warn" : "text-foreground",
                )}
              >
                {over}
              </dd>
            </div>
          </dl>
        </section>

        {/* Tokens per day */}
        <section
          aria-labelledby={`${uid}-chart`}
          className="flex min-w-0 flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p
              id={`${uid}-chart`}
              className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              Tokens per day
            </p>
            <span
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px]",
                over > 0
                  ? "border-[color-mix(in_oklab,var(--warn)_40%,transparent)] text-warn"
                  : "border-hairline text-ink-3",
              )}
            >
              <BellRing aria-hidden className="size-3" />
              {over === 0
                ? "No days over"
                : `${over} ${over === 1 ? "day" : "days"} over`}
            </span>
          </div>

          {hasData ? (
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
              {/* y axis */}
              <div
                aria-hidden
                className="relative h-44 @min-[40rem]:h-52 @min-[68rem]:h-72"
              >
                {ticks.map((t) => (
                  <span
                    key={t}
                    className="absolute right-0 -translate-y-1/2 font-mono text-[10px] leading-none text-ink-3 tabular-nums"
                    style={{ top: `${r3((1 - t / axisMax) * 100)}%` }}
                  >
                    {t === 0 ? "0" : formatTokens(t)}
                  </span>
                ))}
              </div>

              <div className="relative h-44 @min-[40rem]:h-52 @min-[68rem]:h-72">
                {ticks.map((t) => (
                  <span
                    key={t}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 h-px bg-hairline"
                    style={{ top: `${r3((1 - t / axisMax) * 100)}%` }}
                  />
                ))}

                {/* The days: a slider you can also point at */}
                <div
                  ref={plotRef}
                  role="slider"
                  tabIndex={disabled ? -1 : 0}
                  aria-label="Day"
                  aria-orientation="horizontal"
                  aria-valuemin={1}
                  aria-valuemax={n}
                  aria-valuenow={(cursor ?? n - 1) + 1}
                  aria-valuetext={(() => {
                    const c = columns[cursor ?? n - 1];
                    if (!c) return undefined;
                    return `${formatDate(c.date)}: ${formatTokens(c.total)} tokens${c.total > shown ? ", over the alert" : ""}`;
                  })()}
                  aria-disabled={disabled || undefined}
                  onPointerMove={(e) => {
                    if (e.pointerType === "mouse" || e.buttons > 0) {
                      moveCursor(indexAt(e.clientX, e.currentTarget), false);
                    }
                  }}
                  onPointerLeave={() => {
                    if (!plotFocused) setCursor(null);
                  }}
                  onClick={(e) => {
                    const i = indexAt(e.clientX, e.currentTarget);
                    const c = columns[i];
                    setCursor(i);
                    if (c) onDaySelect?.(c.date);
                  }}
                  onFocus={() => {
                    setPlotFocused(true);
                    if (cursor === null) setCursor(n - 1);
                  }}
                  onBlur={() => {
                    setPlotFocused(false);
                    setCursor(null);
                  }}
                  onKeyDown={(e) => {
                    const at = cursor ?? n - 1;
                    const keys: Record<string, number> = {
                      ArrowLeft: at - 1,
                      ArrowRight: at + 1,
                      ArrowDown: at - 1,
                      ArrowUp: at + 1,
                      PageDown: at - 7,
                      PageUp: at + 7,
                      Home: 0,
                      End: n - 1,
                    };
                    const to = keys[e.key];
                    if (to !== undefined) {
                      e.preventDefault();
                      moveCursor(to, true);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const c = columns[at];
                      if (c) onDaySelect?.(c.date);
                    } else if (e.key === "Escape" && cursor !== null) {
                      e.preventDefault();
                      setCursor(null);
                    }
                  }}
                  className={cn(
                    "absolute inset-0 rounded-1 select-none",
                    FOCUS_RING,
                    disabled ? "cursor-not-allowed" : "cursor-crosshair",
                  )}
                >
                  {cursor !== null ? (
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 rounded-[2px] bg-cobalt-wash"
                      initial={false}
                      animate={{
                        left: `${r3((cursor / n) * 100)}%`,
                        width: `${r3(100 / n)}%`,
                      }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <div
                    key={`${period}-${days.length}`}
                    className={cn("absolute inset-0 flex items-end", gap)}
                  >
                    {columns.map((c, i) => {
                      const isOver = c.total > shown;
                      return (
                        <motion.div
                          key={c.date}
                          aria-hidden
                          className="relative flex h-full min-w-0 flex-1 flex-col justify-end"
                          initial={motionSafe ? { scaleY: 0 } : { opacity: 0 }}
                          animate={{ scaleY: 1, opacity: 1 }}
                          transition={
                            motionSafe
                              ? { ...springs.glide, delay: i * stagger }
                              : { duration: durations.fast }
                          }
                          style={{ originY: 1 }}
                        >
                          <motion.div
                            className="flex w-full flex-col-reverse overflow-clip rounded-t-[2px]"
                            initial={false}
                            animate={{
                              height: `${r3((c.total / axisMax) * 100)}%`,
                            }}
                            transition={
                              motionSafe ? springs.glide : { duration: 0 }
                            }
                          >
                            {c.parts.map((p, j) => (
                              <motion.span
                                key={series[j]?.id ?? j}
                                className="block w-full shrink-0 transition-[background-color] duration-150"
                                initial={false}
                                animate={{
                                  height: `${c.total > 0 ? r3((p / c.total) * 100) : 0}%`,
                                }}
                                transition={
                                  motionSafe ? springs.glide : { duration: 0 }
                                }
                                style={{
                                  backgroundColor: isOver
                                    ? WARN_PIGMENT[j % WARN_PIGMENT.length]
                                    : series[j]?.color,
                                }}
                              />
                            ))}
                          </motion.div>
                          {c.date === today ? (
                            <span className="absolute -bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-ink-3" />
                          ) : null}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* The alert line */}
                <motion.div
                  className="pointer-events-none absolute inset-x-0 top-0 z-10"
                  initial={false}
                  animate={{ top: `${lineAbove ? 0 : linePct}%` }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                  style={{ y: lineY }}
                >
                  <div
                    aria-hidden
                    {...gesture}
                    className={cn(
                      "pointer-events-auto absolute inset-x-0 -top-2 h-4 touch-pan-x",
                      disabled ? "cursor-not-allowed" : "cursor-ns-resize",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute inset-x-0 top-1/2 border-t-[1.5px] border-dashed transition-colors",
                        drag
                          ? "border-warn"
                          : "border-[color-mix(in_oklab,var(--warn)_80%,var(--foreground))]",
                      )}
                    />
                  </div>
                  <div
                    role="slider"
                    tabIndex={disabled ? -1 : 0}
                    aria-label="Daily alert"
                    aria-orientation="vertical"
                    aria-valuemin={step}
                    aria-valuemax={Math.floor(axisMax / step) * step}
                    aria-valuenow={shown}
                    aria-valuetext={sentence(shown)}
                    aria-disabled={disabled || undefined}
                    {...gesture}
                    onKeyDown={(e) => {
                      if (disabled) return;
                      const keys: Record<string, number> = {
                        ArrowUp: value + step,
                        ArrowRight: value + step,
                        ArrowDown: value - step,
                        ArrowLeft: value - step,
                        PageUp: value + step * 4,
                        PageDown: value - step * 4,
                        Home: step,
                        End: axisMax,
                      };
                      const to = keys[e.key];
                      if (to === undefined) return;
                      e.preventDefault();
                      setByKey(to);
                    }}
                    className={cn(
                      "pointer-events-auto absolute -top-3 right-1 inline-flex h-6 touch-pan-x items-center gap-1 rounded-full border bg-popover px-2 font-mono text-[11px] whitespace-nowrap tabular-nums shadow-[0_2px_8px_color-mix(in_oklab,black_14%,transparent)] select-none",
                      drag
                        ? "border-warn text-foreground"
                        : "border-[color-mix(in_oklab,var(--warn)_55%,transparent)] text-ink-2",
                      disabled ? "cursor-not-allowed" : "cursor-ns-resize",
                      FOCUS_RING,
                    )}
                  >
                    <BellRing aria-hidden className="size-3 text-warn" />
                    {lineAbove ? "↑ " : ""}
                    {formatTokens(shown)}
                  </div>
                </motion.div>

                {/* The readout */}
                {cursorCol && cursor !== null ? (
                  <motion.div
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute z-20 w-44 rounded-2 border border-hairline-strong bg-popover px-2.5 py-2 shadow-[0_6px_18px_color-mix(in_oklab,black_16%,transparent)]",
                      // Clear of the alert line: below it when it sits high.
                      linePct < 50 && !lineAbove ? "bottom-1" : "top-1",
                    )}
                    initial={false}
                    animate={{
                      left: `${r3(((cursor + 0.5) / n) * 100)}%`,
                      x: cursor > n / 2 ? "-106%" : "6%",
                    }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  >
                    {readout(cursorCol)}
                  </motion.div>
                ) : null}
              </div>

              {/* x axis */}
              <div aria-hidden />
              <div
                aria-hidden
                className="mt-1.5 flex justify-between font-mono text-[10px] text-ink-3"
              >
                <span>{formatDate(columns[0]?.date ?? today)}</span>
                {n > 7 ? (
                  <span>
                    {formatDate(columns[Math.floor(n / 2)]?.date ?? today)}
                  </span>
                ) : null}
                <span>Today</span>
              </div>
            </div>
          ) : (
            <p className="flex h-44 items-center justify-center text-sm text-ink-3 @min-[40rem]:h-52 @min-[68rem]:h-72">
              No usage in the last {RANGE_NAMES[period]}.
            </p>
          )}
        </section>

        {/* By series */}
        <section
          aria-label={
            stack === "kind"
              ? "By kind"
              : stack === "total"
                ? "All models"
                : "By model"
          }
          className="@min-[40rem]:col-span-2 @min-[68rem]:col-span-1"
        >
          <ul
            role="list"
            className={cn(
              "grid gap-2",
              seriesTotals.length > 1 &&
                "@min-[40rem]:grid-cols-3 @min-[68rem]:grid-cols-1",
            )}
          >
            {seriesTotals.map((s, i) => {
              // Each line on its own scale: the shape is the point, the
              // number beside it carries the size.
              const peak = Math.max(1, ...s.values);
              const spark = sparkPath(s.values, peak);
              const at = cursor !== null ? s.values[cursor] : undefined;
              const share =
                totalTokens > 0 ? Math.round((s.total / totalTokens) * 100) : 0;
              const clipId = `${idBase}-spark-${i}`;
              return (
                <li
                  key={s.id}
                  className="flex min-w-0 flex-col gap-1.5 rounded-3 border border-hairline bg-surface-1 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ background: s.color }}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-[13px] text-foreground"
                      title={s.name}
                    >
                      {s.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                      {share}%
                    </span>
                  </div>
                  <div
                    className="relative h-7"
                    onPointerMove={(e) => {
                      if (e.pointerType === "mouse" || e.buttons > 0) {
                        moveCursor(indexAt(e.clientX, e.currentTarget), false);
                      }
                    }}
                    onPointerLeave={() => {
                      if (!plotFocused) setCursor(null);
                    }}
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 100 28"
                      preserveAspectRatio="none"
                      className="absolute inset-0 size-full overflow-visible"
                    >
                      <defs>
                        <clipPath id={clipId}>
                          <motion.rect
                            key={`${period}-${stack}`}
                            x={0}
                            y={-2}
                            height={32}
                            initial={{ width: motionSafe ? 0 : 100 }}
                            animate={{ width: 100 }}
                            transition={
                              motionSafe
                                ? { ...springs.glide, delay: 0.12 + i * 0.06 }
                                : { duration: 0 }
                            }
                          />
                        </clipPath>
                      </defs>
                      <g clipPath={`url(#${clipId})`}>
                        <path
                          d={spark.area}
                          style={{ fill: s.color, opacity: 0.16 }}
                        />
                        <path
                          d={spark.line}
                          fill="none"
                          strokeWidth={1.5}
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          style={{ stroke: s.color }}
                        />
                      </g>
                    </svg>
                    {cursor !== null && at !== undefined ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-1"
                        style={{
                          left: `${r3(n === 1 ? 50 : (cursor / (n - 1)) * 100)}%`,
                          top: `${r3(((26 - (at / peak) * 23) / 28) * 100)}%`,
                          background: s.color,
                        }}
                      />
                    ) : null}
                  </div>
                  <p className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-ink-3 tabular-nums">
                    <span className="truncate">
                      {cursor !== null && cursorCol
                        ? formatDate(cursorCol.date)
                        : RANGE_NAMES[period]}
                    </span>
                    <span className="shrink-0 text-[13px] text-foreground">
                      {formatTokens(at ?? s.total)}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    );
  };

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            Last {RANGE_NAMES[period]} to {formatDate(today)}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Period"
          className="relative inline-flex h-8 shrink-0 items-center gap-0.5 rounded-2 bg-surface-2 p-0.5"
        >
          {RANGES.map((r) => {
            const on = r === period;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={() => pickRange(r)}
                onKeyDown={(e) => {
                  const i = RANGES.indexOf(period);
                  const d =
                    e.key === "ArrowRight" || e.key === "ArrowDown"
                      ? 1
                      : e.key === "ArrowLeft" || e.key === "ArrowUp"
                        ? -1
                        : 0;
                  const to =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? RANGES.length - 1
                        : d
                          ? (i + d + RANGES.length) % RANGES.length
                          : -1;
                  const next = RANGES[to];
                  if (!next) return;
                  e.preventDefault();
                  pickRange(next);
                  const group = e.currentTarget.parentElement;
                  group
                    ?.querySelectorAll<HTMLButtonElement>("[role=radio]")
                    [to]?.focus();
                }}
                className={cn(
                  "relative inline-flex h-7 items-center rounded-[5px] px-2.5 font-mono text-[11px] transition-colors",
                  on ? "text-foreground" : "text-ink-3 hover:text-foreground",
                  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-range`}
                    aria-hidden
                    className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative @max-[26rem]:hidden">
                  {RANGE_NAMES[r]}
                </span>
                <span className="relative hidden @max-[26rem]:inline">{r}</span>
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
