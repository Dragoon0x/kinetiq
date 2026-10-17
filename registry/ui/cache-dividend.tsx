"use client";

import * as React from "react";

import { animate, AnimatePresence, motion } from "motion/react";
import {
  DatabaseZap,
  Download,
  RotateCcw,
  Snowflake,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type CacheDividendAccentName = "cobalt" | "plum" | "mint" | "ink";
export type CacheDividendSplitStyle = "stacked" | "mirror" | "share";
export type CacheDividendCounterStyle = "odometer" | "count" | "gauge";
export type CacheDividendState = "on" | "off" | "warming";
export type CacheDividendStatus = "ready" | "loading" | "error";

/** One prompt template's input on one day. */
export type CachePrompt = {
  id: string;
  /** What the prompt is: "Refund policy answer". */
  name: string;
  /** Input tokens it sent that day. */
  tokens: number;
  /** Share of those tokens served from the cache, 0 to 1. */
  hit: number;
  /** Why it missed, shown when most of it did. */
  reason?: string;
};

export type CacheDay = {
  /** "2026-10-12". */
  date: string;
  /** Input tokens sent that day. */
  input: number;
  /** Of those, the tokens read from the cache. */
  cached: number;
  /** Tokens written into the cache that day (billed at the write price). */
  writes?: number;
  /** The day's prompts, biggest first. */
  prompts?: CachePrompt[];
};

/** Dollars per million tokens. */
export type CachePrices = { input: number; cached: number; write: number };

export type CacheDividendProps = {
  /** The month's days with data, in order from day 1. @default defaultCacheDays */
  days?: CacheDay[];
  /** Days in the month; the rest are drawn as days to come. @default 31 */
  monthDays?: number;
  /** Dollars per million input tokens: uncached, cached and cache writes. @default defaultCachePrices */
  prices?: CachePrices;
  /** Controlled day, as an index into `days`. */
  day?: number;
  /** Initial day when uncontrolled. @default the last day with data */
  defaultDay?: number;
  /** Fires as the scrub, a tap or an arrow key lands on a day. */
  onScrub?: (index: number, day: CacheDay) => void;
  /** A prompt in the day's list was pressed. */
  onOpenPrompt?: (prompt: CachePrompt, day: CacheDay) => void;
  /** Export was pressed, with the days. Omit it and the button is not drawn. */
  onExport?: (days: CacheDay[]) => void;
  /** The cache is on, off (nothing is cached; an estimate is shown), or still warming up. @default "on" */
  cache?: CacheDividendState;
  /** While warming, how many of the first days are drawn as warm-up. @default 3 */
  warmupDays?: number;
  /** The hit rate the off-state estimate assumes, 0 to 1. @default 0.8 */
  estimateHitRate?: number;
  /** Usage arrived, is on its way, or failed. @default "ready" */
  status?: CacheDividendStatus;
  /** "Try again" was pressed after usage failed to load. */
  onRetry?: () => void;
  /** The panel's heading. @default "Coldbrook · support assistant" */
  title?: string;
  /** Under the heading. @default "Prompt cache · October" */
  subtitle?: string;
  /** How money prints. @default "$1,284.60" by hand */
  formatMoney?: (amount: number) => string;
  /** Each bar's form: cached under uncached, cached up and uncached down from a centre line, or every bar full height split by hit rate. @default "stacked" */
  splitStyle?: CacheDividendSplitStyle;
  /** The savings figure: rolling digit columns, a figure that counts, or a figure over a gauge of the best possible. @default "odometer" */
  counterStyle?: CacheDividendCounterStyle;
  /** The cached colour and the selection. @default "cobalt" */
  accent?: CacheDividendAccentName | (string & {});
  /** Read only: the day cannot be scrubbed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultCachePrices: CachePrices = {
  input: 3,
  cached: 0.3,
  write: 3.75,
};

type Template = {
  id: string;
  name: string;
  share: number;
  hit: number;
  reason: string;
};

const TEMPLATES: Template[] = [
  {
    id: "refunds",
    name: "Refund policy answer",
    share: 0.34,
    hit: 0.95,
    reason: "Prefix changed",
  },
  {
    id: "orders",
    name: "Order lookup tools",
    share: 0.22,
    hit: 0.93,
    reason: "Prefix changed",
  },
  {
    id: "tone",
    name: "Tone guide and examples",
    share: 0.18,
    hit: 0.92,
    reason: "Prefix changed",
  },
  {
    id: "history",
    name: "Ticket history",
    share: 0.16,
    hit: 0.08,
    reason: "Unique to each ticket",
  },
  {
    id: "escalation",
    name: "Escalation checklist",
    share: 0.1,
    hit: 0.9,
    reason: "Expired between calls",
  },
];

/** October 1 to 17: Thursday start, a deploy on Friday the 9th. */
const INPUT_M = [
  42.1, 44.6, 21.3, 19.8, 46.2, 48.0, 47.4, 45.9, 49.3, 22.4, 20.6, 50.2, 51.4,
  49.8, 52.6, 47.1, 12.4,
];
const WRITES_M = [
  2.1, 1.8, 0.9, 0.8, 2.0, 1.9, 1.7, 1.8, 6.4, 2.9, 1.0, 1.9, 1.8, 1.7, 1.6,
  1.7, 0.5,
];
const WEEKEND = new Set([2, 3, 9, 10, 16]);
const DEPLOY = 8;

/** A small, stable wobble per day and prompt: the same in Node and every browser. */
const wobble = (day: number, k: number) =>
  ((((day * 73856093) ^ (k * 19349663)) >>> 0) % 61) / 1000 - 0.03;

const makeDay = (i: number): CacheDay => {
  const input = Math.round((INPUT_M[i] ?? 0) * 1e6);
  const prompts: CachePrompt[] = TEMPLATES.map((t, k) => {
    let hit = t.hit + wobble(i, k);
    let reason: string | undefined;
    // The deploy rewrote the system prompt: the shared prefix stopped matching.
    if (i === DEPLOY && k < 3) {
      hit = 0.14 + wobble(i, k);
      reason = "Prefix changed at 10:42";
    } else if (i === DEPLOY + 1 && k < 3) {
      hit = 0.62 + wobble(i, k);
    } else if (t.id === "escalation" && WEEKEND.has(i)) {
      hit = 0.28 + wobble(i, k);
      reason = "Expired between calls";
    } else if (t.id === "history") {
      reason = t.reason;
    }
    const h = Math.round(Math.min(1, Math.max(0, hit)) * 1000) / 1000;
    return {
      id: t.id,
      name: t.name,
      tokens: Math.round(input * t.share),
      hit: h,
      ...(h < 0.5 ? { reason: reason ?? t.reason } : {}),
    };
  });
  return {
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    input: prompts.reduce((s, p) => s + p.tokens, 0),
    cached: prompts.reduce((s, p) => s + Math.round(p.tokens * p.hit), 0),
    writes: Math.round((WRITES_M[i] ?? 0) * 1e6),
    prompts,
  };
};

/**
 * Coldbrook's support assistant in October through the 17th: weekday
 * traffic, quiet weekends where the escalation checklist expires between
 * calls, and the 9th, when a deploy changed the system prompt and the shared
 * prefix stopped matching for a day.
 */
export const defaultCacheDays: CacheDay[] = INPUT_M.map((_, i) => makeDay(i));

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** "$1,284.60" by hand: the same string in Node and every browser. */
const dollars = (amount: number): string => {
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = String(Math.floor(cents / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `${amount < 0 ? "−" : ""}$${whole}.${String(cents % 100).padStart(2, "0")}`;
};

/** "17.1M" tokens, by hand (compact notation differs between Node and browsers). */
const tokens = (n: number): string => {
  const v = Math.abs(n);
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(Math.round(v));
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

const MONTHS = [
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
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 2026, m: (m ?? 1) - 1, d: d ?? 1 };
};
const weekdayOf = (iso: string) => {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m, d)).getUTCDay();
};
const shortDate = (iso: string) => {
  const { m, d } = parts(iso);
  return `${(MONTHS[m] ?? "").slice(0, 3)} ${d}`;
};
const longDate = (iso: string) => {
  const { m, d } = parts(iso);
  return `${MONTHS[m] ?? ""} ${d}`;
};

const ACCENTS: Record<CacheDividendAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--cd-ink": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as CacheDividendAccentName]
      : accent,
    "--cd-wash": "color-mix(in oklab, var(--cd-ink) 12%, transparent)",
    "--cd-soft": "color-mix(in oklab, var(--cd-ink) 34%, transparent)",
    "--cd-miss": "color-mix(in oklab, var(--ink-3) 38%, transparent)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

type Week = { start: number; end: number; label: string; future: boolean };

/** Monday-to-Sunday weeks over the month, each holding its data-day indices. */
const weeksOf = (days: CacheDay[], monthDays: number): Week[] => {
  const first = days[0]?.date ?? "2026-10-01";
  const { y, m } = parts(first);
  const out: Week[] = [];
  let start = 0;
  for (let d = 0; d < monthDays; d++) {
    const dow = new Date(Date.UTC(y, m, d + 1)).getUTCDay();
    const last = d === monthDays - 1 || dow === 0;
    if (last) {
      out.push({
        start,
        end: d,
        label: `${(MONTHS[m] ?? "").slice(0, 3)} ${start + 1}`,
        future: start >= days.length,
      });
      start = d + 1;
    }
  }
  return out;
};

/* ----------------------------------------------------------------------- */
/*                               Counter faces                              */
/* ----------------------------------------------------------------------- */

type Cell = { key: string; digit?: number; ch?: string };

/** Keys each character by its place from the right, so the units column is always the same column. */
const cellsOf = (text: string): Cell[] => {
  const chars = [...text];
  const isDigit = (c: string) => c >= "0" && c <= "9";
  const firstDigit = chars.findIndex(isDigit);
  if (firstDigit < 0) return chars.map((ch, i) => ({ key: `p${i}`, ch }));
  let lastDigit = chars.length - 1;
  while (lastDigit > 0 && !isDigit(chars[lastDigit] ?? "")) lastDigit -= 1;
  const out: Cell[] = [];
  let place = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i] ?? "";
    if (i > lastDigit) out.unshift({ key: `x${chars.length - 1 - i}`, ch });
    else if (i < firstDigit) out.unshift({ key: `p${i}`, ch });
    else if (isDigit(ch)) {
      out.unshift({ key: `d${place}`, digit: Number(ch) });
      place += 1;
    } else out.unshift({ key: `s${place}`, ch });
  }
  return out;
};

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Odometer({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const roll = motionSafe ? springs.snap : { duration: 0 };
  const grow = motionSafe ? springs.glide : { duration: 0 };
  return (
    <span
      aria-hidden
      className="inline-flex items-start tabular-nums"
      style={{ lineHeight: "1.15em", height: "1.15em" }}
    >
      <AnimatePresence initial={false}>
        {cellsOf(text).map((cell) =>
          cell.digit === undefined ? (
            <motion.span
              key={cell.key}
              className="inline-block overflow-hidden whitespace-pre"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={grow}
            >
              {cell.ch}
            </motion.span>
          ) : (
            <motion.span
              key={cell.key}
              className="relative inline-block overflow-hidden"
              style={{ height: "1.15em" }}
              initial={{ opacity: 0, width: "0ch" }}
              animate={{ opacity: 1, width: "1ch" }}
              exit={{ opacity: 0, width: "0ch" }}
              transition={grow}
            >
              <motion.span
                className="absolute inset-x-0 top-0 flex flex-col"
                initial={false}
                animate={{ y: `${-cell.digit * 10}%` }}
                transition={roll}
              >
                {DIGITS.map((d) => (
                  <span
                    key={d}
                    className="block text-center"
                    style={{ height: "1.15em", lineHeight: "1.15em" }}
                  >
                    {d}
                  </span>
                ))}
              </motion.span>
            </motion.span>
          ),
        )}
      </AnimatePresence>
    </span>
  );
}

/** A figure that counts through its values on snap, written straight into the node. */
function Count({
  value,
  format,
  motionSafe,
}: {
  value: number;
  format: (v: number) => string;
  motionSafe: boolean;
}) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const [first] = React.useState(() => format(value));
  const shown = React.useRef(value);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = shown.current;
    if (!motionSafe || from === value) {
      shown.current = value;
      node.textContent = format(value);
      return;
    }
    const ctrl = animate(from, value, {
      ...springs.snap,
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = format(v);
      },
      onComplete: () => {
        shown.current = value;
        node.textContent = format(value);
      },
    });
    // A stopped count finishes on its value, so a StrictMode rehearsal or a
    // quick second scrub never leaves a figure frozen between two days.
    return () => {
      ctrl.stop();
      shown.current = value;
      node.textContent = format(value);
    };
  }, [value, format, motionSafe]);
  return (
    <span ref={ref} aria-hidden className="tabular-nums">
      {first}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

const BAR_H = 78;

/**
 * A month of a prompt cache, one split bar per day: the day's input tokens
 * divided into the part served from the cache and the part paid in full, at
 * one token scale. A savings counter reads what the cache saved from the
 * first of the month through the day you are on.
 *
 * Scrubbing is the moment it is built for. The bars are one slider: drag
 * across them and the day under the finger lifts on `snap` while its two
 * parts open a hairline apart, the days after it dim on a short tween, and
 * the counter ticks to the new total on `snap` for every day passed — rolling
 * digit columns, a figure that counts, or a figure over a gauge of the best
 * the month could have saved. The day's prompts are listed beside the bars in
 * two groups, hit and missed, with why each miss missed; the list cross-fades
 * between days without waiting, its rows arriving in `cascade()` order.
 *
 * Left and Right move a day, Page Up and Page Down a week, Home and End to
 * the ends; the settled day is announced once. Below a 40rem container the
 * bars become a week-by-week strip and the slider steps weeks. Under reduced
 * motion nothing lifts or rolls: the highlight, the dimming and the figure
 * still change, because they are the reading.
 */
export function CacheDividend({
  days = defaultCacheDays,
  monthDays = 31,
  prices = defaultCachePrices,
  day: dayProp,
  defaultDay,
  onScrub,
  onOpenPrompt,
  onExport,
  cache = "on",
  warmupDays = 3,
  estimateHitRate = 0.8,
  status = "ready",
  onRetry,
  title = "Coldbrook · support assistant",
  subtitle = "Prompt cache · October",
  formatMoney = dollars,
  splitStyle = "stacked",
  counterStyle = "odometer",
  accent = "cobalt",
  disabled = false,
  className,
}: CacheDividendProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hatchId = `cd-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-warm`;

  const slots = Math.max(monthDays, days.length);
  const last = Math.max(0, days.length - 1);
  const [ownDay, setOwnDay] = React.useState(defaultDay ?? last);
  const index = clamp(Math.round(dayProp ?? ownDay), 0, last);
  const current = days[index] ?? null;

  const [announcement, setAnnouncement] = React.useState("");

  /* ------------------------------ readings ----------------------------- */

  const off = cache === "off";
  const cachedOf = React.useCallback(
    (d: CacheDay) => (off ? 0 : Math.max(0, Math.min(d.input, d.cached))),
    [off],
  );
  const savedOf = React.useCallback(
    (d: CacheDay) =>
      off
        ? 0
        : (cachedOf(d) * (prices.input - prices.cached) -
            Math.max(0, d.writes ?? 0) * (prices.write - prices.input)) /
          1e6,
    [off, cachedOf, prices],
  );
  const cumulative = React.useMemo(() => {
    const out: number[] = [];
    let run = 0;
    for (const d of days) {
      run += savedOf(d);
      out.push(run);
    }
    return out;
  }, [days, savedOf]);
  const best = React.useMemo(
    () =>
      days.reduce(
        (s, d) => s + (d.input * (prices.input - prices.cached)) / 1e6,
        0,
      ),
    [days, prices],
  );
  const estimate = React.useMemo(
    () =>
      days.reduce(
        (s, d) =>
          s +
          (d.input *
            clamp(estimateHitRate, 0, 1) *
            (prices.input - prices.cached)) /
            1e6,
        0,
      ),
    [days, prices, estimateHitRate],
  );

  const saved = cumulative[index] ?? 0;
  const throughInput = days
    .slice(0, index + 1)
    .reduce((s, d) => s + d.input, 0);
  const throughCached = days
    .slice(0, index + 1)
    .reduce((s, d) => s + cachedOf(d), 0);
  const throughRate = throughInput > 0 ? throughCached / throughInput : 0;

  const weeks = React.useMemo(() => weeksOf(days, slots), [days, slots]);
  const weekOf = (i: number) =>
    Math.max(
      0,
      weeks.findIndex((w) => i >= w.start && i <= w.end),
    );
  const liveWeeks = weeks.filter((w) => !w.future);
  const weekIndex = weekOf(index);

  /* ------------------------------ narrow ------------------------------- */

  // The slider steps days in the bars and weeks in the strip; which one is
  // showing is the container's call, so read it from the container.
  const [narrow, setNarrow] = React.useState(false);
  const [rootNode, setRootNode] = React.useState<HTMLElement | null>(null);
  const [plotW, setPlotW] = React.useState(440);
  const [plotNode, setPlotNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!rootNode) return;
    const ro = new ResizeObserver(() => {
      const w = rootNode.clientWidth;
      if (w > 0) setNarrow(w < 640);
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);
  React.useEffect(() => {
    if (!plotNode) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(plotNode.clientWidth);
      if (w > 0) setPlotW(w);
    });
    ro.observe(plotNode);
    return () => ro.disconnect();
  }, [plotNode]);

  /* ---------------------------- interactions --------------------------- */

  const sentence = (i: number) => {
    const d = days[i];
    if (!d) return "";
    const rate = d.input > 0 ? cachedOf(d) / d.input : 0;
    return off
      ? `${longDate(d.date)}: caching is off, ${tokens(d.input)} tokens paid in full.`
      : `${longDate(d.date)}: ${pct(rate)} cached, saved ${formatMoney(savedOf(d))}; ${formatMoney(cumulative[i] ?? 0)} so far.`;
  };

  const weekSentence = (w: number) => {
    const wk = weeks[w];
    if (!wk) return "";
    const span = days.slice(wk.start, Math.min(wk.end, last) + 1);
    const inp = span.reduce((s, d) => s + d.input, 0);
    const c = span.reduce((s, d) => s + cachedOf(d), 0);
    const got = span.reduce((s, d) => s + savedOf(d), 0);
    const through = cumulative[Math.min(wk.end, last)] ?? 0;
    return off
      ? `Week of ${wk.label}: caching is off.`
      : `Week of ${wk.label}: ${pct(inp > 0 ? c / inp : 0)} cached, saved ${formatMoney(got)}; ${formatMoney(through)} so far.`;
  };

  const select = (i: number, settled: boolean) => {
    const next = clamp(i, 0, last);
    const d = days[next];
    if (disabled || !d) return;
    if (next !== index) {
      if (dayProp === undefined) setOwnDay(next);
      onScrub?.(next, d);
    }
    if (settled) setAnnouncement(sentence(next));
  };

  const selectWeek = (w: number, settled: boolean) => {
    const wk = liveWeeks[clamp(w, 0, liveWeeks.length - 1)];
    if (!wk) return;
    select(Math.min(wk.end, last), false);
    if (settled) setAnnouncement(weekSentence(weeks.indexOf(wk)));
  };

  const slot = (plotW - 4) / slots;
  const gap = slot < 4.5 ? 0 : 2;
  const barW = Math.max(1, slot - gap);
  const dayAt = (clientX: number) => {
    const left = plotNode?.getBoundingClientRect().left ?? 0;
    return clamp(Math.floor((clientX - left - 2) / slot), 0, last);
  };
  const stripNode = React.useRef<HTMLDivElement | null>(null);
  const weekAt = (clientX: number) => {
    const r = stripNode.current?.getBoundingClientRect();
    if (!r) return weekIndex;
    const cell = r.width / Math.max(1, weeks.length);
    return clamp(
      Math.floor((clientX - r.left) / cell),
      0,
      liveWeeks.length - 1,
    );
  };

  // Two sliders, one per layout; each owns its own steps, so neither has to
  // guess which one the container is showing.
  const dayScrub = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    // A day changes only when the finger crosses into the next one, so React
    // hears about it 31 times a month, never once a frame.
    onMove: ({ point }) => select(dayAt(point.x), false),
    onEnd: ({ point, velocity }) =>
      // A flick carries on to where it was heading, a day or two past the finger.
      select(dayAt(project(point.x, velocity.x, 0.985)), true),
    onTap: (event) => select(dayAt(event.clientX), true),
  });
  const weekScrub = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onMove: ({ point }) => selectWeek(weekAt(point.x), false),
    onEnd: ({ point, velocity }) =>
      selectWeek(weekAt(project(point.x, velocity.x, 0.985)), true),
    onTap: (event) => selectWeek(weekAt(event.clientX), true),
  });

  const onDayKey = (event: React.KeyboardEvent) => {
    if (disabled) return;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next += 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= 1;
    else if (event.key === "PageUp") next += 7;
    else if (event.key === "PageDown") next -= 7;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    select(next, true);
  };

  const liveWeek = Math.max(
    0,
    liveWeeks.findIndex((wk) => index >= wk.start && index <= wk.end),
  );
  const onWeekKey = (event: React.KeyboardEvent) => {
    if (disabled) return;
    let w = liveWeek;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") w += 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") w -= 1;
    else if (event.key === "Home") w = 0;
    else if (event.key === "End") w = liveWeeks.length - 1;
    else return;
    event.preventDefault();
    selectWeek(w, true);
  };

  /* ------------------------------- header ------------------------------ */

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span
        aria-hidden
        className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--cd-wash)] text-[var(--cd-ink)] @[30rem]:inline-flex"
      >
        <DatabaseZap className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          id={titleId}
          title={title}
          className="truncate text-[14px] leading-5 font-semibold"
        >
          {title}
        </p>
        <p className="truncate text-[11.5px] leading-4 text-ink-3">
          {subtitle}
        </p>
      </div>
      {onExport ? (
        <motion.button
          type="button"
          aria-label="Export the month"
          disabled={disabled || status !== "ready"}
          whileTap={motionSafe ? { scale: 0.96 } : undefined}
          transition={springs.flick}
          onClick={() => onExport(days)}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            FOCUS,
          )}
        >
          <Download aria-hidden className="size-3.5" />
          <span className="hidden @[30rem]:inline">Export</span>
        </motion.button>
      ) : null}
    </div>
  );

  /* ------------------------------ counter ------------------------------ */

  const figure =
    counterStyle === "odometer" ? (
      <Odometer text={formatMoney(saved)} motionSafe={motionSafe} />
    ) : (
      <Count value={saved} format={formatMoney} motionSafe={motionSafe} />
    );

  const counter = (
    <div className="flex flex-col gap-1">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className="font-mono font-medium tracking-tight text-foreground"
          style={{ fontSize: 24, lineHeight: 1.15 }}
        >
          {figure}
          <span className="sr-only">{formatMoney(saved)}</span>
        </span>
        <span className="text-[12px] text-ink-3">
          {off
            ? "saved · caching is off"
            : current
              ? `saved through ${shortDate(current.date)}`
              : "saved"}
        </span>
      </p>
      {counterStyle === "gauge" ? (
        <div
          aria-hidden
          className="relative h-1.5 w-full max-w-60 overflow-hidden rounded-full bg-surface-2"
        >
          <motion.span
            className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-[var(--cd-ink)]"
            initial={false}
            animate={{
              scaleX: Number(
                clamp(best > 0 ? saved / best : 0, 0, 1).toFixed(3),
              ),
            }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        </div>
      ) : null}
      <p className="text-[11.5px] leading-4 text-ink-3">
        {off
          ? `At ${pct(estimateHitRate)} hits it would have saved ≈ ${formatMoney(estimate)}`
          : counterStyle === "gauge"
            ? `${pct(best > 0 ? saved / best : 0)} of the most it could save · ${pct(throughRate)} cached`
            : `${pct(throughRate)} of ${tokens(throughInput)} input tokens cached`}
      </p>
    </div>
  );

  /* -------------------------------- bars ------------------------------- */

  const maxInput = Math.max(1, ...days.map((d) => d.input));
  const maxCached = Math.max(1, ...days.map((d) => cachedOf(d)));
  const maxMiss = Math.max(1, ...days.map((d) => d.input - cachedOf(d)));
  const warming = cache === "warming";

  const geometryOf = (d: CacheDay) => {
    const c = cachedOf(d);
    const u = Math.max(0, d.input - c);
    const usable = BAR_H - 2;
    if (splitStyle === "share") {
      const share = d.input > 0 ? c / d.input : 0;
      const ch = usable * share;
      return { cy: BAR_H - ch, ch, uy: 0, uh: usable - ch };
    }
    if (splitStyle === "mirror") {
      const mid = BAR_H * 0.62;
      const ch = ((mid - 2) * c) / maxCached;
      const uh = ((BAR_H - mid - 2) * u) / maxMiss;
      return { cy: mid - ch, ch, uy: mid + 2, uh };
    }
    const ch = (usable * c) / maxInput;
    const uh = (usable * u) / maxInput;
    return { cy: BAR_H - ch, ch, uy: BAR_H - ch - uh, uh };
  };

  const bars = (
    <div
      ref={setPlotNode}
      className="relative hidden w-full @[40rem]:block"
      style={{ height: BAR_H + 16 }}
    >
      <svg
        aria-hidden
        width="100%"
        height={BAR_H + 16}
        className="absolute inset-0 block overflow-visible"
      >
        <defs>
          <pattern
            id={hatchId}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="4"
              stroke="var(--cd-ink)"
              strokeWidth="1.5"
            />
          </pattern>
        </defs>
        {splitStyle === "mirror" ? (
          <line
            x1={0}
            x2="100%"
            y1={r2(BAR_H * 0.62 + 1)}
            y2={r2(BAR_H * 0.62 + 1)}
            className="stroke-hairline-strong"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        ) : (
          <line
            x1={0}
            x2="100%"
            y1={BAR_H + 0.5}
            y2={BAR_H + 0.5}
            className="stroke-hairline-strong"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        )}
        {Array.from({ length: slots }, (_, i) => {
          const x = r2(2 + i * slot);
          const d = days[i];
          if (!d) {
            return (
              <rect
                key={i}
                x={x}
                y={splitStyle === "mirror" ? r2(BAR_H * 0.62 - 2) : BAR_H - 3}
                width={r2(barW)}
                height={3}
                rx={1}
                className="fill-hairline"
              />
            );
          }
          const g = geometryOf(d);
          const on = i === index;
          const ahead = i > index;
          const warm = warming && i < warmupDays;
          const lift = on && motionSafe ? -4 : 0;
          const part = on && motionSafe ? 1.5 : 0;
          return (
            <motion.g
              key={d.date}
              initial={false}
              animate={{ y: lift, opacity: ahead ? 0.32 : 1 }}
              transition={{
                y: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.fast, ease: easings.move },
              }}
            >
              <motion.g
                initial={false}
                animate={{ y: splitStyle === "mirror" ? part : -part }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <rect
                  x={x}
                  y={r2(g.uy)}
                  width={r2(barW)}
                  height={r2(Math.max(0, g.uh))}
                  rx={Math.min(1.5, barW / 3)}
                  fill="var(--cd-miss)"
                />
              </motion.g>
              <rect
                x={x}
                y={r2(g.cy)}
                width={r2(barW)}
                height={r2(Math.max(0, g.ch))}
                rx={Math.min(1.5, barW / 3)}
                fill={warm ? `url(#${hatchId})` : "var(--cd-ink)"}
                opacity={on ? 1 : 0.78}
              />
              {warm ? (
                <rect
                  x={x}
                  y={r2(g.cy)}
                  width={r2(barW)}
                  height={r2(Math.max(0, g.ch))}
                  rx={Math.min(1.5, barW / 3)}
                  fill="none"
                  stroke="var(--cd-soft)"
                  strokeWidth={1}
                />
              ) : null}
            </motion.g>
          );
        })}
      </svg>
      {/* Day numbers: the first, the chosen one riding its bar, and the last. */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0.5 font-mono text-[9.5px] leading-3 text-ink-3"
      >
        1
      </span>
      <span
        aria-hidden
        className="absolute right-0.5 bottom-0 font-mono text-[9.5px] leading-3 text-ink-3"
      >
        {slots}
      </span>
      <motion.span
        aria-hidden
        className="absolute bottom-0 left-0"
        initial={false}
        animate={{
          x: r2(clamp(2 + index * slot + barW / 2, 8, Math.max(8, plotW - 12))),
        }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        <span className="block -translate-x-1/2 rounded-1 bg-card px-0.5 font-mono text-[9.5px] leading-3 font-medium text-foreground">
          {index + 1}
        </span>
      </motion.span>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Day"
        aria-valuemin={1}
        aria-valuemax={days.length}
        aria-valuenow={index + 1}
        aria-valuetext={sentence(index)}
        aria-disabled={disabled || undefined}
        onKeyDown={onDayKey}
        {...dayScrub}
        className={cn(
          "absolute inset-x-0 top-[-6px] bottom-0 cursor-col-resize touch-pan-y rounded-2 select-none",
          disabled && "cursor-default",
          FOCUS,
        )}
      />
    </div>
  );

  /* ------------------------------- strip ------------------------------- */

  const strip = (
    <div className="flex flex-col gap-1 @[40rem]:hidden">
      <div ref={stripNode} className="relative flex gap-1.5">
        {weeks.map((w, wi) => {
          const span = days.slice(w.start, w.end + 1);
          const inp = span.reduce((s, d) => s + d.input, 0);
          const c = span.reduce((s, d) => s + cachedOf(d), 0);
          const share = inp > 0 ? c / inp : 0;
          const on = wi === weekIndex && !w.future;
          const ahead = wi > weekIndex;
          return (
            <motion.div
              key={w.start}
              aria-hidden
              className="flex min-w-0 flex-1 flex-col items-stretch gap-1"
              initial={false}
              animate={{
                y: on && motionSafe ? -3 : 0,
                opacity: w.future ? 1 : ahead ? 0.4 : 1,
              }}
              transition={{
                y: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.fast, ease: easings.move },
              }}
            >
              <div
                className={cn(
                  "relative flex h-12 flex-col justify-end overflow-hidden rounded-2 border",
                  w.future
                    ? "border-dashed border-hairline"
                    : on
                      ? "border-[var(--cd-soft)]"
                      : "border-hairline",
                )}
              >
                {w.future ? null : (
                  <>
                    <motion.span
                      className="block w-full bg-[var(--cd-miss)]"
                      style={{ height: `${r2((1 - share) * 100)}%` }}
                      initial={false}
                      animate={{ y: on && motionSafe ? -2 : 0 }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                    <span
                      className="block w-full bg-[var(--cd-ink)]"
                      style={{
                        height: `${r2(share * 100)}%`,
                        opacity: on ? 1 : 0.78,
                      }}
                    />
                  </>
                )}
              </div>
              <span
                className={cn(
                  "truncate text-center font-mono text-[9.5px] leading-3",
                  on ? "font-medium text-foreground" : "text-ink-3",
                )}
              >
                {w.label}
              </span>
            </motion.div>
          );
        })}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Week"
          aria-valuemin={1}
          aria-valuemax={Math.max(1, liveWeeks.length)}
          aria-valuenow={liveWeek + 1}
          aria-valuetext={weekSentence(weekIndex)}
          aria-disabled={disabled || undefined}
          onKeyDown={onWeekKey}
          {...weekScrub}
          className={cn(
            "absolute inset-x-0 -inset-y-1 cursor-col-resize touch-pan-y rounded-2 select-none",
            disabled && "cursor-default",
            FOCUS,
          )}
        />
      </div>
    </div>
  );

  /* -------------------------------- list ------------------------------- */

  /** The day's prompts, or (in the strip) the week's, summed by prompt. */
  const listPrompts = React.useMemo(() => {
    if (!narrow) return current?.prompts ?? [];
    const w = weeks[weekIndex];
    if (!w) return [];
    const map = new Map<string, CachePrompt>();
    for (const d of days.slice(w.start, Math.min(w.end, last) + 1)) {
      for (const p of d.prompts ?? []) {
        const prev = map.get(p.id);
        if (!prev) map.set(p.id, { ...p });
        else {
          const t = prev.tokens + p.tokens;
          const hit =
            t > 0 ? (prev.hit * prev.tokens + p.hit * p.tokens) / t : 0;
          map.set(p.id, {
            ...prev,
            tokens: t,
            hit: Math.round(hit * 1000) / 1000,
            reason: prev.reason ?? p.reason,
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.tokens - a.tokens);
  }, [narrow, current, weeks, weekIndex, days, last]);

  const hits = listPrompts.filter((p) => !off && p.hit >= 0.5);
  const misses = listPrompts.filter((p) => off || p.hit < 0.5);
  const listKey = narrow ? `w${weekIndex}` : `d${index}`;
  const step = cascade(listPrompts.length + 2);

  const row = (p: CachePrompt, i: number, hit: boolean) => {
    const body = (
      <>
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            title={p.name}
            className="truncate text-[12px] leading-4 text-foreground"
          >
            {p.name}
          </span>
          {!hit ? (
            <span className="truncate text-[10.5px] leading-3.5 text-ink-3">
              {off ? "Caching is off" : (p.reason ?? "Missed")}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right font-mono text-[10.5px] leading-4 text-ink-2 tabular-nums">
          {tokens(p.tokens)}
          <span
            className={cn("ml-1", hit ? "text-[var(--cd-ink)]" : "text-ink-3")}
          >
            {off ? "0%" : pct(p.hit)}
          </span>
        </span>
      </>
    );
    const name = `${p.name}, ${tokens(p.tokens)} tokens, ${off ? "not cached" : `${pct(p.hit)} cached`}${!hit && p.reason && !off ? `, ${p.reason}` : ""}`;
    return (
      <motion.li
        key={p.id}
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: {
            opacity: {
              duration: durations.base,
              ease: easings.enter,
              delay: i * step,
            },
            y: motionSafe
              ? { ...springs.glide, delay: i * step }
              : { duration: 0 },
          },
        }}
      >
        {onOpenPrompt && current ? (
          <button
            type="button"
            aria-label={name}
            onClick={() => onOpenPrompt(p, current)}
            className={cn(
              "flex w-full items-center gap-2 rounded-1 px-1.5 py-1 text-left transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            {body}
          </button>
        ) : (
          <div
            aria-label={name}
            role="group"
            className="flex w-full items-center gap-2 px-1.5 py-1"
          >
            {body}
          </div>
        )}
      </motion.li>
    );
  };

  const dayHead = current
    ? narrow
      ? `Week of ${weeks[weekIndex]?.label ?? ""}`
      : `${WEEKDAYS[weekdayOf(current.date)] ?? ""}, ${shortDate(current.date)}`
    : "";
  const dayLine = current
    ? off
      ? `${tokens(current.input)} paid in full`
      : `${pct(current.input > 0 ? cachedOf(current) / current.input : 0)} cached · ${formatMoney(savedOf(current))}`
    : "";

  const list = (
    <div className="grid grid-cols-[minmax(0,1fr)]">
      <AnimatePresence initial={false}>
        <motion.div
          key={listKey}
          className="col-start-1 row-start-1 flex flex-col gap-1.5"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: { duration: durations.fast, ease: easings.enter },
          }}
          exit={{
            opacity: 0,
            transition: { duration: durations.blink, ease: easings.exit },
          }}
        >
          <p className="flex items-baseline justify-between gap-2 px-1.5">
            <span className="truncate text-[12px] leading-4 font-medium">
              {dayHead}
            </span>
            {!narrow ? (
              <span className="shrink-0 font-mono text-[10.5px] leading-4 text-ink-3 tabular-nums">
                {dayLine}
              </span>
            ) : null}
          </p>
          {hits.length > 0 ? (
            <div className="flex flex-col">
              <p className="px-1.5 font-mono text-[9.5px] tracking-[0.06em] text-ink-3 uppercase">
                {`Hit · ${hits.length}`}
              </p>
              <ul
                aria-label="Prompts that hit the cache"
                className="flex flex-col"
              >
                {hits.map((p, i) => row(p, i, true))}
              </ul>
            </div>
          ) : null}
          {misses.length > 0 ? (
            <div className="flex flex-col">
              <p className="px-1.5 font-mono text-[9.5px] tracking-[0.06em] text-ink-3 uppercase">
                {`Missed · ${misses.length}`}
              </p>
              <ul
                aria-label="Prompts that missed the cache"
                className="flex flex-col"
              >
                {misses.map((p, i) => row(p, hits.length + i, false))}
              </ul>
            </div>
          ) : null}
          {listPrompts.length === 0 ? (
            <p className="px-1.5 text-[12px] text-ink-3">
              No prompts recorded for this day.
            </p>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );

  /* ------------------------------- notes ------------------------------- */

  const note =
    cache === "off" ? (
      <p className="flex items-center gap-1.5 text-[11.5px] leading-4 text-ink-3">
        <Snowflake aria-hidden className="size-3.5 shrink-0" />
        Caching is off: every input token is paid in full.
      </p>
    ) : warming ? (
      <p className="flex items-center gap-1.5 text-[11.5px] leading-4 text-ink-3">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-[2px] border border-[var(--cd-soft)] bg-[var(--cd-wash)]"
        />
        {`Warming up · the first ${warmupDays} ${warmupDays === 1 ? "day" : "days"} fill the cache, so hits climb as prompts repeat`}
      </p>
    ) : null;

  /* -------------------------------- body ------------------------------- */

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-hidden className="flex flex-col gap-3">
        <span className="h-7 w-36 rounded-1 bg-surface-2" />
        <div className="flex h-[104px] items-end gap-[2px]">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className="flex-1 rounded-[2px] bg-surface-2"
              style={{ height: `${30 + ((i * 37) % 60)}%` }}
            />
          ))}
        </div>
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-start gap-2 py-4">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-danger">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          Cache usage couldn’t load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry()}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else if (days.length === 0) {
    body = (
      <p className="py-4 text-[13px] text-ink-3">
        No cache usage yet this month.
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3 @[40rem]:flex-row @[40rem]:items-stretch">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {counter}
          {note}
          {bars}
          {strip}
        </div>
        <div className="relative @[40rem]:w-[15.5rem] @[40rem]:shrink-0">
          <div className="@[40rem]:absolute @[40rem]:inset-0 @[40rem]:[scrollbar-width:thin] @[40rem]:overflow-y-auto @[40rem]:overscroll-contain @[40rem]:[mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)] @[40rem]:pb-4">
            {list}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      ref={setRootNode}
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      <div className="flex flex-col gap-2.5 p-3">
        {header}
        {body}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
