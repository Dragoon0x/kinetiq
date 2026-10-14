"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Bell,
  Briefcase,
  Check,
  Clock3,
  Hourglass,
  Infinity as InfinityIcon,
  Receipt,
  RotateCcw,
  Sprout,
  TriangleAlert,
  Users,
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

/** The counted things a plan can cap. */
export type TrialMetric = "jobs" | "crews" | "invoices";

/** One day of the trial. Days after `now` are drawn as still to come. */
export type TrialDay = {
  /** Midnight UTC of the day, in ms. */
  date: number;
  /** Jobs created that day. */
  jobs: number;
};

/** A moment worth a line in the letter. */
export type TrialHighlight = {
  id: string;
  /** Short, e.g. "Busiest day". */
  label: string;
  /** The line itself, e.g. "Sunday 11 October: 12 jobs before 9am". */
  detail: string;
};

export type TrialFeature = {
  id: string;
  label: string;
  /** Whether the trial touched it; untried features are ghosted. */
  used: boolean;
  /** For a quiet trial: how to try it, e.g. "drag a job onto a crew's day". */
  hint?: string;
};

export type TrialUsage = {
  jobs: number;
  hoursSaved: number;
  crews: number;
  invoices: number;
  /** One entry per day of the trial, in order. */
  days: TrialDay[];
  highlights: TrialHighlight[];
  features: TrialFeature[];
};

export type TrialPlan = {
  id: string;
  name: string;
  /** The figure, e.g. "$29". */
  price: string;
  /** What the figure is per, e.g. "mo". @default "mo" */
  period?: string;
  /** One line under the name. */
  blurb?: string;
  /** A cap per metric; null is no limit. */
  limits: Record<TrialMetric, number | null>;
  /** Marked as the plan the recap leans toward, and chosen by default. */
  recommended?: boolean;
};

export type TrialTileStyle = "tiles" | "rows";
export type TrialDensity = "compact" | "cozy" | "roomy";
export type TrialAccent = "cobalt" | "signal" | "ink";
export type TrialStatus = "ready" | "loading" | "error";

export type TrialRecapProps = {
  /** How the trial's numbers are laid out: a row of tiles or a ledger of rows. @default "tiles" */
  tileStyle?: TrialTileStyle;
  /** Padding, type size and row heights. @default "cozy" */
  density?: TrialDensity;
  /** The colour the numbers, the used features, the bars and the chosen plan are drawn in. @default "cobalt" */
  accent?: TrialAccent;
  /** What the trial got done. @default defaultTrialUsage */
  usage?: TrialUsage;
  /** The plans compared, in column order. @default defaultTrialPlans */
  plans?: TrialPlan[];
  /** The product's name, in the kicker and the default title. @default "Fieldline" */
  product?: string;
  /** When the trial began, in ms. @default defaultTrialStartedAt */
  startedAt?: number;
  /** When it ends, in ms. @default defaultTrialEndsAt */
  endsAt?: number;
  /** The moment the countdown and the day number are read at, in ms; never read from the clock. @default defaultTrialNow */
  now?: number;
  /** Controlled id of the chosen plan; null when none is. */
  value?: string | null;
  /** Initial choice when uncontrolled. @default the recommended plan, else the first */
  defaultValue?: string | null;
  /** Fires from the press or arrow key that chose a plan. */
  onChange?: (planId: string, previous: string | null) => void;
  /** Keep going was pressed with the chosen plan. */
  onChoose?: (plan: TrialPlan) => void;
  /** Remind me later was pressed. */
  onRemindLater?: () => void;
  /** Fewer jobs than this and the recap reads as a quiet start instead of a tally. @default 5 */
  quietBelow?: number;
  /** Whether the usage has arrived. @default "ready" */
  status?: TrialStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Your 14 days with Fieldline" (from the trial's length and the product) */
  title?: string;
  /** The line under the heading. @default "Here is what your crews got done." */
  intro?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the letter scrolls inside it above the plan choice. @default 560 */
  height?: number;
  /** Read only: no plan can be chosen or kept. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Thursday 1 October 2026, 17:00 UTC: the trial began. */
export const defaultTrialStartedAt = Date.UTC(2026, 9, 1, 17);
/** Fourteen days later. */
export const defaultTrialEndsAt = defaultTrialStartedAt + 14 * DAY;
/** Monday 12 October 2026, 10:00 UTC: three days and seven hours to go. */
export const defaultTrialNow = Date.UTC(2026, 9, 12, 10);

const JOBS_BY_DAY = [2, 4, 6, 3, 8, 1, 0, 5, 9, 7, 12, 3, 0, 0];

const dayAt = (i: number) => Date.UTC(2026, 9, 1 + i);

/** Fieldline's trial at a four-crew paving outfit: 60 jobs in twelve days. */
export const defaultTrialUsage: TrialUsage = {
  jobs: 60,
  hoursSaved: 38,
  crews: 4,
  invoices: 9,
  days: JOBS_BY_DAY.map((jobs, i) => ({ date: dayAt(i), jobs })),
  highlights: [
    {
      id: "busiest",
      label: "Busiest day",
      detail: "Sunday 11 October: 12 jobs scheduled before 9am.",
    },
    {
      id: "invoice",
      label: "First invoice",
      detail: "Sent Monday 5 October to Basinworks Civil, paid in two days.",
    },
    {
      id: "sheets",
      label: "On the road",
      detail: "The Coldbrook crew opened its day sheet 31 times.",
    },
    {
      id: "fastest",
      label: "Fastest turnaround",
      detail: "Quote to invoice in six hours on the Harbour Road job.",
    },
  ],
  features: [
    { id: "jobs", label: "Jobs", used: true },
    { id: "scheduling", label: "Scheduling", used: true },
    { id: "sheets", label: "Day sheets", used: true },
    { id: "invoicing", label: "Invoicing", used: true },
    { id: "quotes", label: "Quotes", used: true },
    { id: "photos", label: "Site photos", used: true },
    {
      id: "time",
      label: "Time tracking",
      used: false,
      hint: "start a timer from any job on a crew's phone",
    },
    {
      id: "portal",
      label: "Customer portal",
      used: false,
      hint: "send a customer a link to watch their job move",
    },
    {
      id: "reports",
      label: "Reports",
      used: false,
      hint: "see hours and margin per crew each week",
    },
    {
      id: "integrations",
      label: "Integrations",
      used: false,
      hint: "push invoices straight into your books",
    },
  ],
};

/** The same trial, barely touched: three jobs and one feature. */
export const defaultTrialQuietUsage: TrialUsage = {
  jobs: 3,
  hoursSaved: 1,
  crews: 1,
  invoices: 0,
  days: JOBS_BY_DAY.map((_, i) => ({
    date: dayAt(i),
    jobs: i === 0 ? 2 : i === 4 ? 1 : 0,
  })),
  highlights: [],
  features: defaultTrialUsage.features.map((f) => ({
    ...f,
    used: f.id === "jobs",
  })),
};

export const defaultTrialPlans: TrialPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$29",
    period: "mo",
    blurb: "One or two crews, a few jobs a day.",
    limits: { jobs: 50, crews: 2, invoices: 20 },
  },
  {
    id: "pro",
    name: "Pro",
    price: "$79",
    period: "mo",
    blurb: "Every crew, every job, no caps.",
    limits: { jobs: null, crews: 10, invoices: null },
    recommended: true,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-2 border border-hairline text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

const ACCENTS: Record<TrialAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

const DENSITY: Record<
  TrialDensity,
  {
    pad: string;
    stack: string;
    tile: string;
    figure: string;
    row: string;
    chip: string;
  }
> = {
  compact: {
    pad: "px-4",
    stack: "gap-4 py-3",
    tile: "p-2.5",
    figure: "text-[22px]",
    row: "h-8",
    chip: "h-6 text-[11px]",
  },
  cozy: {
    pad: "px-5",
    stack: "gap-5 py-4",
    tile: "p-3",
    figure: "text-[26px]",
    row: "h-9",
    chip: "h-7 text-xs",
  },
  roomy: {
    pad: "px-6",
    stack: "gap-6 py-5",
    tile: "p-4",
    figure: "text-[30px]",
    row: "h-10",
    chip: "h-8 text-[13px]",
  },
};

const METRICS: { key: TrialMetric; label: string; one: string }[] = [
  { key: "jobs", label: "Jobs a month", one: "jobs" },
  { key: "crews", label: "Crews", one: "crews" },
  { key: "invoices", label: "Invoices a month", one: "invoices" },
];

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const fmtDay = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

const fmtShort = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

const plural = (n: number, one: string, other = `${one}s`) =>
  n === 1 ? one : other;

const noopSubscribe = () => () => {};

/** The metrics the trial's usage already exceeds on a plan. */
export const trialOverLimits = (
  usage: TrialUsage,
  plan: TrialPlan,
): TrialMetric[] =>
  METRICS.filter(({ key }) => {
    const limit = plan.limits[key];
    return limit !== null && usage[key] > limit;
  }).map((m) => m.key);

/** Days and hours from `now` to `endsAt`; both zero once it has ended. */
export const trialTimeLeft = (now: number, endsAt: number) => {
  const ms = Math.max(0, endsAt - now);
  return {
    days: Math.floor(ms / DAY),
    hours: Math.floor((ms % DAY) / HOUR),
    ended: ms <= 0,
  };
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

/** Digits that roll up from zero when they mount, then roll to each change. */
function Roll({
  value,
  motionSafe,
  delay = 0,
  className,
}: {
  value: number;
  motionSafe: boolean;
  delay?: number;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={motionSafe ? { y: "0em" } : false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={
              motionSafe
                ? { ...springs.snap, delay: r3(delay) }
                : { duration: 0 }
            }
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Tiles                                  */
/* ----------------------------------------------------------------------- */

type Tile = {
  key: "jobs" | "hoursSaved" | "crews" | "invoices";
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

function Tiles({
  tiles,
  style,
  d,
  motionSafe,
}: {
  tiles: Tile[];
  style: TrialTileStyle;
  d: (typeof DENSITY)[TrialDensity];
  motionSafe: boolean;
}) {
  const step = cascade(tiles.length);
  if (style === "rows") {
    return (
      <ul
        role="list"
        aria-label="The trial's numbers"
        className="flex flex-col rounded-3 border border-hairline"
      >
        {tiles.map((t, i) => {
          const Icon = t.icon;
          return (
            <motion.li
              key={t.key}
              initial={{ opacity: 0, x: motionSafe ? -distances.step : 0 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                x: motionSafe
                  ? { ...springs.glide, delay: r3(i * step) }
                  : { duration: 0 },
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: r3(i * step),
                },
              }}
              className={cn(
                "flex items-center gap-3 px-3",
                d.row,
                i > 0 && "border-t border-hairline",
              )}
            >
              <Icon aria-hidden className="size-3.5 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                {t.label}
              </span>
              <span className="sr-only">{t.value}</span>
              <Roll
                value={t.value}
                motionSafe={motionSafe}
                delay={i * step}
                className="font-mono text-[15px] font-medium text-(--tr-accent)"
              />
            </motion.li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul
      role="list"
      aria-label="The trial's numbers"
      className="grid grid-cols-2 gap-2 @min-[40rem]:grid-cols-4"
    >
      {tiles.map((t, i) => {
        const Icon = t.icon;
        return (
          <motion.li
            key={t.key}
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: motionSafe
                ? { ...springs.glide, delay: r3(i * step) }
                : { duration: 0 },
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                delay: r3(i * step),
              },
            }}
            className={cn(
              "flex min-w-0 flex-col gap-1 rounded-3 border border-hairline bg-surface-1",
              d.tile,
            )}
          >
            <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <Icon aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{t.label}</span>
            </span>
            <span className="sr-only">{t.value}</span>
            <Roll
              value={t.value}
              motionSafe={motionSafe}
              delay={i * step}
              className={cn(
                "font-mono font-medium tracking-tight text-(--tr-accent)",
                d.figure,
              )}
            />
          </motion.li>
        );
      })}
    </ul>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Sparkline                                */
/* ----------------------------------------------------------------------- */

function Sparkline({
  days,
  now,
  motionSafe,
}: {
  days: TrialDay[];
  now: number;
  motionSafe: boolean;
}) {
  const max = days.reduce((m, x) => Math.max(m, x.jobs), 0);
  let busiest = -1;
  days.forEach((x, i) => {
    if (x.jobs > 0 && (busiest < 0 || x.jobs > (days[busiest]?.jobs ?? 0))) {
      busiest = i;
    }
  });
  const step = cascade(days.length);
  const first = days[0];
  const last = days[days.length - 1];
  const soFar = days.filter((x) => x.date <= now);
  const total = soFar.reduce((s, x) => s + x.jobs, 0);
  const busy = days[busiest];
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-3 border border-hairline p-3">
      <p className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span>Jobs by day</span>
        <span className="text-ink-2">{total} so far</span>
      </p>
      <div
        role="img"
        aria-label={
          busy
            ? `${total} jobs over ${soFar.length} days; busiest ${fmtDay(busy.date)} with ${busy.jobs}.`
            : `No jobs yet over ${soFar.length} days.`
        }
        className="flex h-14 items-end gap-[3px]"
      >
        {days.map((x, i) => {
          const future = x.date > now;
          const h = max > 0 ? x.jobs / max : 0;
          return (
            <motion.span
              key={x.date}
              title={`${fmtDay(x.date)}: ${future ? "to come" : `${x.jobs} ${plural(x.jobs, "job")}`}`}
              className={cn(
                "min-w-0 flex-1 rounded-t-1",
                future
                  ? "border border-dashed border-hairline-strong"
                  : i === busiest
                    ? "bg-(--tr-accent)"
                    : "bg-[color-mix(in_oklab,var(--tr-accent)_38%,var(--bg-2))]",
              )}
              style={{
                height: future ? "14%" : `${Math.max(6, h * 100)}%`,
                originY: 1,
              }}
              initial={motionSafe ? { scaleY: 0 } : { opacity: 0 }}
              animate={motionSafe ? { scaleY: 1 } : { opacity: 1 }}
              transition={
                motionSafe
                  ? { ...springs.snap, delay: r3(i * step) }
                  : { duration: durations.base }
              }
            />
          );
        })}
      </div>
      <p
        aria-hidden
        className="flex justify-between font-mono text-[10px] text-ink-3 tabular-nums"
      >
        <span>{first ? fmtShort(first.date) : ""}</span>
        {busy ? (
          <span className="text-ink-2">
            peak {busy.jobs} · {fmtShort(busy.date)}
          </span>
        ) : null}
        <span>{last ? fmtShort(last.date) : ""}</span>
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Highlights                                */
/* ----------------------------------------------------------------------- */

function Highlights({
  highlights,
  motionSafe,
}: {
  highlights: TrialHighlight[];
  motionSafe: boolean;
}) {
  const step = cascade(highlights.length);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Highlights
      </p>
      <ul role="list" aria-label="Highlights" className="flex flex-col gap-2">
        {highlights.map((h, i) => (
          <motion.li
            key={h.id}
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: motionSafe
                ? { ...springs.glide, delay: r3(0.12 + i * step) }
                : { duration: 0 },
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                delay: r3(0.12 + i * step),
              },
            }}
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5"
          >
            <span
              aria-hidden
              className="mt-[7px] size-1.5 rounded-full bg-(--tr-accent)"
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-[12px] font-medium text-foreground">
                {h.label}
              </span>
              <span className="text-[12px] leading-snug text-ink-2">
                {h.detail}
              </span>
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Feature shelf                              */
/* ----------------------------------------------------------------------- */

function Shelf({
  features,
  chip,
  motionSafe,
}: {
  features: TrialFeature[];
  chip: string;
  motionSafe: boolean;
}) {
  const used = features.filter((f) => f.used).length;
  const step = cascade(features.length);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span>Features touched</span>
        <span className="text-ink-2">
          {used} of {features.length}
        </span>
      </p>
      <ul
        role="list"
        aria-label="Features touched"
        className="flex flex-wrap gap-1.5"
      >
        {features.map((f, i) => (
          <motion.li
            key={f.id}
            aria-label={`${f.label}, ${f.used ? "used" : "not tried"}`}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: motionSafe
                ? { ...springs.glide, delay: r3(0.2 + i * step) }
                : { duration: 0 },
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                delay: r3(0.2 + i * step),
              },
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border pr-2.5 pl-2 font-medium whitespace-nowrap",
              chip,
              f.used
                ? "border-[color-mix(in_oklab,var(--tr-accent)_35%,transparent)] bg-(--tr-wash) text-(--tr-accent)"
                : "border-dashed border-hairline-strong text-ink-3",
            )}
          >
            {f.used ? (
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
                  transition={
                    motionSafe
                      ? { ...springs.flick, delay: r3(0.32 + i * step) }
                      : { duration: 0 }
                  }
                />
              </svg>
            ) : (
              <span
                aria-hidden
                className="size-1.5 rounded-full border border-current"
              />
            )}
            {f.label}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Plan comparison                             */
/* ----------------------------------------------------------------------- */

function LimitBar({
  metric,
  usage,
  limit,
  delay,
  motionSafe,
}: {
  metric: (typeof METRICS)[number];
  usage: number;
  limit: number | null;
  delay: number;
  motionSafe: boolean;
}) {
  const over = limit !== null && usage > limit;
  const fill =
    limit === null
      ? clamp(usage / (2 * Math.max(usage, 1)), 0.06, 0.5)
      : limit === 0
        ? 1
        : clamp(usage / limit, usage > 0 ? 0.04 : 0, 1);
  const words =
    limit === null
      ? `${usage} ${metric.one}, no limit`
      : over
        ? `${usage} of ${limit} ${metric.one}, over by ${usage - limit}`
        : `${usage} of ${limit} ${metric.one}`;
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate text-ink-2">{metric.label}</span>
        <span className="sr-only">{words}</span>
        <span
          aria-hidden
          className={cn(
            "flex shrink-0 items-center gap-1 font-mono tabular-nums",
            over ? "text-danger" : "text-ink-2",
          )}
        >
          {usage}
          <span className="text-ink-3">/</span>
          {limit === null ? (
            <InfinityIcon aria-hidden className="size-3 text-ink-3" />
          ) : (
            limit
          )}
          <AnimatePresence>
            {over ? (
              <motion.span
                key="over"
                initial={
                  motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        delay: r3(delay + 0.28),
                        opacity: {
                          duration: durations.fast,
                          delay: r3(delay + 0.28),
                        },
                      }
                    : { duration: durations.fast }
                }
                className="ml-0.5 rounded-1 bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-1 text-[9px] tracking-[0.06em] uppercase"
              >
                over
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      </p>
      <span
        aria-hidden
        className="relative block h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <motion.span
          className={cn(
            "absolute inset-y-0 left-0 w-full rounded-full transition-colors duration-200",
            over
              ? "bg-danger"
              : limit === null
                ? "bg-[color-mix(in_oklab,var(--tr-accent)_55%,var(--bg-2))]"
                : "bg-(--tr-accent)",
          )}
          style={{ originX: 0 }}
          initial={motionSafe ? { scaleX: 0 } : { opacity: 0, scaleX: fill }}
          animate={{ scaleX: fill, opacity: 1 }}
          transition={
            motionSafe
              ? {
                  ...springs.glide,
                  delay: r3(delay),
                  opacity: { duration: 0 },
                }
              : { duration: durations.base }
          }
        />
        {limit === null ? (
          <span className="absolute inset-y-0 right-0 w-1/2 bg-[repeating-linear-gradient(90deg,transparent_0_3px,color-mix(in_oklab,var(--ink-3)_35%,transparent)_3px_4px)]" />
        ) : null}
      </span>
    </div>
  );
}

function PlanColumn({
  plan,
  usage,
  chosen,
  index,
  frameId,
  motionSafe,
}: {
  plan: TrialPlan;
  usage: TrialUsage;
  chosen: boolean;
  index: number;
  frameId: string | undefined;
  motionSafe: boolean;
}) {
  const over = trialOverLimits(usage, plan);
  const base = 0.1 + index * 0.08;
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-3 rounded-3 border border-hairline p-3 transition-colors duration-200",
        chosen && "bg-surface-1",
      )}
      aria-current={chosen ? "true" : undefined}
    >
      {chosen ? (
        <motion.span
          aria-hidden
          layoutId={frameId}
          initial={frameId ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            layout: springs.glide,
            opacity: { duration: durations.fast },
          }}
          className="pointer-events-none absolute -inset-px rounded-3 border-2 border-(--tr-accent)"
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            {plan.name}
            {plan.recommended ? (
              <span className="rounded-1 bg-(--tr-wash) px-1 font-mono text-[9px] tracking-[0.06em] text-(--tr-accent) uppercase">
                Suggested
              </span>
            ) : null}
          </p>
          {plan.blurb ? (
            <p className="text-[11px] leading-snug text-ink-3">{plan.blurb}</p>
          ) : null}
        </div>
        <p className="shrink-0 font-mono text-[13px] text-foreground tabular-nums">
          {plan.price}
          <span className="text-ink-3">/{plan.period ?? "mo"}</span>
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        {METRICS.map((m, i) => (
          <LimitBar
            key={m.key}
            metric={m}
            usage={usage[m.key]}
            limit={plan.limits[m.key]}
            delay={base + i * 0.06}
            motionSafe={motionSafe}
          />
        ))}
      </div>
      <p
        className={cn(
          "font-mono text-[10px] tracking-[0.08em] uppercase",
          over.length > 0 ? "text-danger" : "text-success",
        )}
      >
        {over.length > 0
          ? `Over on ${over.map((k) => METRICS.find((m) => m.key === k)?.one ?? k).join(" and ")}`
          : "Fits what you used"}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * The letter a trial ends with: "Your 14 days with Fieldline". Its numbers
 * roll up from zero on `springs.snap` in a cascade as the tiles rise on
 * `springs.glide`, a bar per day of the trial stands up on snap with the
 * busiest day in the accent and the days still to come dashed, the
 * highlights rise in their own cascade, and the features touched sit on a
 * shelf of chips, a check drawing into each used one on `springs.flick`
 * while the untried ones are ghosted. Below, two plans stand side by side
 * with the trial's usage drawn as bars against each column's limits on
 * glide; a bar that would be over turns red and an "over" tag lands on
 * `springs.recoil`.
 *
 * Choose plan is a radio group whose indicator slides on snap, and the frame
 * around the chosen column glides across to it. The countdown reads days and
 * hours from `now` to `endsAt` and rolls, never ticks live. A trial that was
 * hardly used gets a gentler letter: a quiet start, with the untried
 * features as suggestions rather than a tally.
 *
 * Everything is native: Left/Right or Up/Down move and choose a plan, Enter
 * or Space presses Keep going or Remind me later, and every choice is
 * announced. Under reduced motion nothing rolls or travels: numbers, bars
 * and chips appear in place and the frame and indicator cross-fade.
 */
export function TrialRecap({
  tileStyle = "tiles",
  density = "cozy",
  accent = "cobalt",
  usage = defaultTrialUsage,
  plans = defaultTrialPlans,
  product = "Fieldline",
  startedAt = defaultTrialStartedAt,
  endsAt = defaultTrialEndsAt,
  now = defaultTrialNow,
  value,
  defaultValue,
  onChange,
  onChoose,
  onRemindLater,
  quietBelow = 5,
  status = "ready",
  onRetry,
  title,
  intro = "Here is what your crews got done.",
  label,
  height = 560,
  disabled = false,
  className,
}: TrialRecapProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const d = DENSITY[density];

  const fallback = plans.find((p) => p.recommended)?.id ?? plans[0]?.id ?? null;
  const [own, setOwn] = React.useState<string | null>(
    defaultValue === undefined ? fallback : defaultValue,
  );
  const current = value === undefined ? own : value;
  const chosenPlan = plans.find((p) => p.id === current) ?? null;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [kept, setKept] = React.useState<string | null>(null);
  const [reminded, setReminded] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration; the stamp that lands after
  // Keep going only ever mounts later, so it may travel.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const radioNodes = React.useRef(new Map<string, HTMLButtonElement>());

  /* -------------------------------- time ------------------------------- */

  const totalDays = Math.max(1, Math.round((endsAt - startedAt) / DAY));
  const dayNumber = clamp(
    Math.floor((now - startedAt) / DAY) + 1,
    1,
    totalDays,
  );
  const left = trialTimeLeft(now, endsAt);
  const elapsed = clamp(
    (now - startedAt) / Math.max(1, endsAt - startedAt),
    0,
    1,
  );
  const heading = title ?? `Your ${totalDays} days with ${product}`;
  const quiet = usage.days.length === 0 || usage.jobs < quietBelow;

  const tiles: Tile[] = [
    { key: "jobs", label: "Jobs created", value: usage.jobs, icon: Briefcase },
    {
      key: "hoursSaved",
      label: "Hours saved",
      value: usage.hoursSaved,
      icon: Clock3,
    },
    { key: "crews", label: "Crews", value: usage.crews, icon: Users },
    {
      key: "invoices",
      label: "Invoices sent",
      value: usage.invoices,
      icon: Receipt,
    },
  ];

  /* ------------------------------- changes ----------------------------- */

  const choose = (id: string) => {
    if (inert || id === current) return;
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    if (value === undefined) setOwn(id);
    onChange?.(id, current);
    const over = trialOverLimits(usage, plan);
    setAnnouncement(
      over.length > 0
        ? `${plan.name} chosen. Over on ${over.map((k) => METRICS.find((m) => m.key === k)?.one ?? k).join(" and ")}.`
        : `${plan.name} chosen. Everything you used fits.`,
    );
  };

  const keep = () => {
    if (inert || !chosenPlan || kept) return;
    setKept(chosenPlan.id);
    onChoose?.(chosenPlan);
    setAnnouncement(
      `Keeping going on ${chosenPlan.name} from ${fmtDay(endsAt)}.`,
    );
  };

  const remind = () => {
    if (inert || reminded) return;
    setReminded(true);
    onRemindLater?.();
    setAnnouncement(
      left.ended
        ? "Reminder set."
        : `Reminder set for ${fmtDay(endsAt - DAY)}, the day before the trial ends.`,
    );
  };

  const onRadioKey = (event: React.KeyboardEvent, index: number) => {
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = index - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = plans.length - 1;
    else return;
    event.preventDefault();
    const target = plans[(to + plans.length) % plans.length];
    if (!target) return;
    radioNodes.current.get(target.id)?.focus();
    choose(target.id);
  };

  /* ------------------------------- render ------------------------------ */

  const tint = ACCENTS[accent] ?? ACCENTS.cobalt;
  const frameId = motionSafe ? `${uid}-frame` : undefined;
  const segId = motionSafe ? `${uid}-seg` : undefined;
  const untried = usage.features.filter((f) => !f.used);
  const activeRadio = current ?? plans[0]?.id ?? null;

  const countdown = (
    <p
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] whitespace-nowrap",
        left.ended
          ? "border-hairline-strong text-ink-2"
          : left.days < 1
            ? "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] text-warn"
            : "border-hairline bg-surface-1 text-ink-2",
      )}
    >
      <Hourglass aria-hidden className="size-3 shrink-0" />
      {left.ended ? (
        "Trial ended"
      ) : (
        <>
          <span className="sr-only">
            {left.days} {plural(left.days, "day")} {left.hours}{" "}
            {plural(left.hours, "hour")} left
          </span>
          <span aria-hidden className="flex items-baseline gap-1">
            <Roll value={left.days} motionSafe={motionSafe} />
            <span className="text-ink-3">d</span>
            <Roll value={left.hours} motionSafe={motionSafe} delay={0.06} />
            <span className="text-ink-3">h</span>
            <span className="hidden @min-[30rem]:inline">left</span>
          </span>
        </>
      )}
    </p>
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
      style={{
        height,
        ["--tr-accent" as string]: tint,
        ["--tr-wash" as string]: `color-mix(in oklab, ${tint} 12%, transparent)`,
      }}
    >
      <header
        className={cn(
          "flex shrink-0 flex-col gap-2 border-b border-hairline pt-4 pb-3",
          d.pad,
        )}
      >
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Trial recap · {product}
        </p>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2
              id={titleId}
              className="text-[17px] leading-tight font-semibold tracking-tight text-balance @min-[40rem]:text-[19px]"
            >
              {heading}
            </h2>
            {ready ? (
              <p className="text-[12px] text-ink-2">
                {quiet ? "A quiet start, with time left to try it." : intro}
              </p>
            ) : null}
          </div>
          {countdown}
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="relative block h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <motion.span
              className="absolute inset-y-0 left-0 w-full rounded-full bg-(--tr-accent)"
              style={{ originX: 0 }}
              initial={motionSafe ? { scaleX: 0 } : false}
              animate={{ scaleX: elapsed }}
              transition={motionSafe ? springs.drift : { duration: 0 }}
            />
          </span>
          <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
            Day {dayNumber} of {totalDays}
          </span>
        </div>
      </header>

      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain",
          d.pad,
        )}
      >
        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The recap didn&apos;t load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(BUTTON, "h-8 px-3 text-foreground", FOCUS_RING)}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : status === "loading" ? (
          <div aria-hidden className={cn("flex flex-col", d.stack)}>
            <div className="grid grid-cols-2 gap-2 @min-[40rem]:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <span
                  key={i}
                  className="h-[72px] rounded-3 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              ))}
            </div>
            <div className="grid gap-4 @min-[40rem]:grid-cols-2">
              <span className="h-28 rounded-3 bg-surface-2 motion-safe:animate-pulse" />
              <span className="flex flex-col gap-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <span
                    key={i}
                    className="h-5 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{
                      width: `${70 + ((i * 17) % 30)}%`,
                      animationDelay: `${i * 110}ms`,
                    }}
                  />
                ))}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 8 }, (_, i) => (
                <span
                  key={i}
                  className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: 56 + ((i * 23) % 44),
                    animationDelay: `${i * 70}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : quiet ? (
          <div className={cn("flex flex-col", d.stack)}>
            <motion.div
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                y: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
              className="flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline-strong px-4 py-5 text-center"
            >
              <Sprout aria-hidden className="size-5 text-(--tr-accent)" />
              <p className="text-sm font-medium text-foreground">
                {usage.jobs === 0
                  ? "No jobs yet"
                  : `${usage.jobs} ${plural(usage.jobs, "job")} in ${dayNumber} ${plural(dayNumber, "day")}`}
              </p>
              <p className="max-w-[34ch] text-[12px] leading-snug text-ink-2">
                {left.ended
                  ? `The trial has ended, but ${product} is ready when you are.`
                  : `There ${left.days === 1 ? "is" : "are"} ${left.days} ${plural(left.days, "day")} left to give ${product} a proper run. Here is where to start.`}
              </p>
            </motion.div>
            {untried.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Try next
                </p>
                <ul
                  role="list"
                  aria-label="Try next"
                  className="flex flex-col rounded-3 border border-hairline"
                >
                  {untried.map((f, i) => (
                    <motion.li
                      key={f.id}
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.nudge : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        y: motionSafe
                          ? {
                              ...springs.glide,
                              delay: r3(0.1 + i * cascade(untried.length)),
                            }
                          : { duration: 0 },
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: r3(0.1 + i * cascade(untried.length)),
                        },
                      }}
                      className={cn(
                        "flex items-center gap-3 px-3",
                        d.row,
                        i > 0 && "border-t border-hairline",
                      )}
                    >
                      <ArrowRight
                        aria-hidden
                        className="size-3.5 shrink-0 text-(--tr-accent)"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        <span className="font-medium">{f.label}</span>
                        {f.hint ? (
                          <span className="text-ink-2"> · {f.hint}</span>
                        ) : null}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            ) : null}
            {usage.days.length > 0 ? (
              <Sparkline days={usage.days} now={now} motionSafe={motionSafe} />
            ) : null}
          </div>
        ) : (
          <div className={cn("flex flex-col", d.stack)}>
            <Tiles
              tiles={tiles}
              style={tileStyle}
              d={d}
              motionSafe={motionSafe}
            />

            <div className="grid gap-4 @min-[40rem]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <Sparkline days={usage.days} now={now} motionSafe={motionSafe} />
              {usage.highlights.length > 0 ? (
                <Highlights
                  highlights={usage.highlights}
                  motionSafe={motionSafe}
                />
              ) : null}
            </div>

            {usage.features.length > 0 ? (
              <Shelf
                features={usage.features}
                chip={d.chip}
                motionSafe={motionSafe}
              />
            ) : null}

            {plans.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  <span>Your usage against each plan</span>
                </p>
                <div
                  className="grid gap-2 @min-[32rem]:grid-cols-2"
                  style={
                    plans.length > 2
                      ? {
                          gridTemplateColumns: `repeat(auto-fit, minmax(13rem, 1fr))`,
                        }
                      : undefined
                  }
                >
                  {plans.map((p, i) => (
                    <PlanColumn
                      key={p.id}
                      plan={p}
                      usage={usage}
                      chosen={p.id === current}
                      index={i}
                      frameId={frameId}
                      motionSafe={motionSafe}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <footer
        className={cn(
          "flex shrink-0 flex-col gap-2.5 border-t border-hairline py-3 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between",
          d.pad,
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Choose plan
          </span>
          <div
            role="radiogroup"
            aria-label="Choose plan"
            className="relative flex h-8 min-w-0 items-center gap-0.5 rounded-2 border border-hairline bg-surface-1 p-0.5"
          >
            {plans.map((p, i) => {
              const checked = p.id === current;
              const over = trialOverLimits(usage, p).length;
              return (
                <button
                  key={p.id}
                  ref={(node) => {
                    if (node) radioNodes.current.set(p.id, node);
                    else radioNodes.current.delete(p.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-disabled={inert || undefined}
                  tabIndex={p.id === activeRadio ? 0 : -1}
                  onClick={() => choose(p.id)}
                  onKeyDown={(event) => onRadioKey(event, i)}
                  className={cn(
                    "relative z-10 flex h-7 min-w-0 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150",
                    checked
                      ? "text-foreground"
                      : "text-ink-2 hover:text-foreground",
                    inert ? "cursor-default" : "cursor-pointer",
                    FOCUS_RING,
                  )}
                >
                  {checked ? (
                    <motion.span
                      aria-hidden
                      layoutId={segId}
                      initial={segId ? undefined : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        layout: springs.snap,
                        opacity: { duration: durations.fast },
                      }}
                      className="absolute inset-0 -z-10 rounded-[5px] border border-hairline-strong bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_12%,transparent)]"
                    />
                  ) : null}
                  {p.name}
                  {ready && !quiet && over > 0 ? (
                    <span
                      aria-hidden
                      title={`Over on ${over} ${plural(over, "limit")}`}
                      className="size-1.5 shrink-0 rounded-full bg-danger"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 @min-[40rem]:justify-end">
          <button
            type="button"
            onClick={remind}
            aria-disabled={inert || reminded || undefined}
            className={cn(
              BUTTON,
              "h-8 shrink-0 border-transparent px-2.5",
              (inert || reminded) && "cursor-default hover:bg-transparent",
              reminded && "text-ink-3",
              FOCUS_RING,
            )}
          >
            {reminded ? (
              <Check aria-hidden className="size-3.5 text-success" />
            ) : (
              <Bell aria-hidden className="size-3.5" />
            )}
            {reminded ? "Reminder set" : "Remind me later"}
          </button>
          <motion.button
            type="button"
            onClick={keep}
            aria-disabled={inert || !chosenPlan || kept !== null || undefined}
            whileTap={
              motionSafe && !inert && !kept ? { scale: 0.97 } : undefined
            }
            transition={springs.flick}
            className={cn(
              "inline-flex h-8 min-w-0 shrink items-center justify-center gap-1.5 rounded-2 px-3 text-xs font-medium whitespace-nowrap transition-colors",
              kept
                ? "bg-(--tr-wash) text-(--tr-accent)"
                : inert || !chosenPlan
                  ? "cursor-default bg-surface-2 text-ink-3"
                  : "cursor-pointer bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--ink)_88%,var(--bg-0))]",
              FOCUS_RING,
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {kept ? (
                <motion.span
                  key="kept"
                  initial={
                    live && motionSafe
                      ? { scale: 0.7, opacity: 0 }
                      : { opacity: 0 }
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  className="flex items-center gap-1.5"
                >
                  <Check aria-hidden className="size-3.5" />
                  <span className="truncate">
                    {plans.find((p) => p.id === kept)?.name ?? "Plan"} from{" "}
                    {fmtShort(endsAt)}
                  </span>
                </motion.span>
              ) : (
                <motion.span
                  key="keep"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast }}
                  className="flex items-center gap-1.5"
                >
                  <span className="truncate">
                    Keep going
                    {chosenPlan ? (
                      <span className="hidden @min-[30rem]:inline">
                        {" "}
                        on {chosenPlan.name}
                      </span>
                    ) : null}
                  </span>
                  <ArrowRight aria-hidden className="size-3.5" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
