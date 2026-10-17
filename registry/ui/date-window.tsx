"use client";

import * as React from "react";

import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type DateWindowPreset = {
  id: string;
  /** Full name, for the dropdown and announcements ("Last 30 days"). */
  label: string;
  /** What the pill says ("30D"). */
  short: string;
  /** A trailing window of this many days, ending today. */
  days?: number;
  /** Calendar-shaped presets; "custom" opens the calendar. */
  kind?: "today" | "qtd" | "ytd" | "custom";
};

export type DateWindowRange = {
  /** The preset this range came from ("custom" for a hand-picked one). */
  preset: string;
  /** First day, ISO "YYYY-MM-DD", in the dashboard's time zone. */
  start: string;
  /** Last day, inclusive, ISO "YYYY-MM-DD". */
  end: string;
};

export type DateWindowCompareMode = "previous" | "year";

export type DateWindowDay = {
  /** ISO "YYYY-MM-DD". */
  date: string;
  /** Revenue that day, dollars. */
  revenue: number;
  orders: number;
};

export type DateWindowTimeZone = {
  /** Shown on the chip ("Pacific"). */
  label: string;
  /** Offset from UTC in minutes (−420 for UTC−7). */
  offsetMinutes: number;
};

export type DateWindowAccentName = "cobalt" | "plum" | "mint" | "ink";
export type DateWindowPillStyle = "solid" | "soft" | "line";
export type DateWindowCalendarLayout = "single" | "double" | "strip";
export type DateWindowStatus = "ready" | "loading" | "error";

export type DateWindowProps = {
  /** The preset pills, in order. @default defaultDateWindowPresets */
  presets?: DateWindowPreset[];
  /** Controlled range. */
  range?: DateWindowRange;
  /** Initial range when uncontrolled. @default the last 30 days */
  defaultRange?: DateWindowRange;
  /** Fires from the pill, key or Apply that changed the range. */
  onRangeChange?: (range: DateWindowRange) => void;
  /** Controlled compare toggle. */
  compare?: boolean;
  /** Initial compare state when uncontrolled. @default false */
  defaultCompare?: boolean;
  /** Controlled comparison mode. */
  compareMode?: DateWindowCompareMode;
  /** Initial comparison mode when uncontrolled. @default "previous" */
  defaultCompareMode?: DateWindowCompareMode;
  /** Fires from the switch, the C key or the mode radios, with both values. */
  onCompareChange?: (compare: boolean, mode: DateWindowCompareMode) => void;
  /** Daily figures the tiles add up. @default defaultDateWindowSeries */
  series?: DateWindowDay[];
  /** The moment "today" is taken from, ms since the epoch. @default defaultDateWindowNow */
  now?: number;
  /** The dashboard's time zone: today, and every day shown, are in it. @default { label: "Pacific", offsetMinutes: -420 } */
  timeZone?: DateWindowTimeZone;
  /** How far behind the figures run, minutes; 0 hides the note. @default 120 */
  dataDelay?: number;
  /** The longest custom range Apply accepts, days. @default 90 */
  maxDays?: number;
  /** First day of the week in the calendar: 0 Sunday, 1 Monday. @default 1 */
  weekStart?: 0 | 1;
  /** The dashboard's name. @default "Sales" */
  title?: string;
  /** Whose dashboard it is. @default "Coldbrook" */
  product?: string;
  /** Formats revenue for the tiles. @default hand-made compact dollars ($48.2K) */
  formatMoney?: (dollars: number) => string;
  /** The selected preset's look: an accent pill, a soft wash, or a sliding underline. @default "soft" */
  pillStyle?: DateWindowPillStyle;
  /** The custom calendar: one month, two side by side, or one scrolling strip of days. @default "single" */
  calendarLayout?: DateWindowCalendarLayout;
  /** Pill, compare switch, range ends: a named accent or any CSS colour. @default "cobalt" */
  accent?: DateWindowAccentName | (string & {});
  /** Figures state: loading shows skeleton tiles, error a retry. @default "ready" */
  status?: DateWindowStatus;
  /** Called by the error state's Retry. */
  onRetry?: () => void;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                  Dates                                   */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;
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
const MONTH_NAMES = [
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
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const parts = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return { y, m, d };
};
const toMs = (iso: string) => {
  const { y, m, d } = parts(iso);
  return Date.UTC(y, m - 1, d);
};
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => toIso(toMs(iso) + n * DAY);
const diffDays = (a: string, b: string) =>
  Math.round((toMs(b) - toMs(a)) / DAY);
const weekday = (iso: string) => new Date(toMs(iso)).getUTCDay();
const shiftMonths = (iso: string, n: number) => {
  const { y, m, d } = parts(iso);
  const first = Date.UTC(y, m - 1 + n, 1);
  const last = new Date(Date.UTC(y, m + n, 0)).getUTCDate();
  return toIso(first + (Math.min(d, last) - 1) * DAY);
};
const monthStart = (iso: string) => {
  const { y, m } = parts(iso);
  return toIso(Date.UTC(y, m - 1, 1));
};
const dayLabel = (iso: string, withYear = false) => {
  const { y, m, d } = parts(iso);
  return `${MONTHS[m - 1] ?? ""} ${d}${withYear ? `, ${y}` : ""}`;
};
const rangeLabel = (start: string, end: string) => {
  if (start === end) return dayLabel(end, true);
  const a = parts(start);
  const b = parts(end);
  return a.y === b.y
    ? `${dayLabel(start)} – ${dayLabel(end, true)}`
    : `${dayLabel(start, true)} – ${dayLabel(end, true)}`;
};
const spoken = (start: string, end: string) =>
  start === end ? dayLabel(start) : `${dayLabel(start)} to ${dayLabel(end)}`;

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultDateWindowPresets: DateWindowPreset[] = [
  { id: "today", label: "Today", short: "Today", kind: "today" },
  { id: "7d", label: "Last 7 days", short: "7D", days: 7 },
  { id: "30d", label: "Last 30 days", short: "30D", days: 30 },
  { id: "qtd", label: "Quarter to date", short: "QTD", kind: "qtd" },
  { id: "12m", label: "Last 12 months", short: "12M", days: 365 },
  { id: "custom", label: "Custom range", short: "Custom", kind: "custom" },
];

/** A fixed moment: 09:20 on Oct 17, 2026 in Pacific time. */
export const defaultDateWindowNow = Date.UTC(2026, 9, 17, 16, 20, 0);

const DEFAULT_ZONE: DateWindowTimeZone = {
  label: "Pacific",
  offsetMinutes: -420,
};

const todayIn = (now: number, zone: DateWindowTimeZone) =>
  toIso(now + zone.offsetMinutes * 60_000);

const DEFAULT_TODAY = todayIn(defaultDateWindowNow, DEFAULT_ZONE);

export const defaultDateWindowRange: DateWindowRange = {
  preset: "30d",
  start: addDays(DEFAULT_TODAY, -29),
  end: DEFAULT_TODAY,
};

/** A small seeded generator: the same series on the server and in the browser. */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Weekday weight (Sunday first) and a month-by-month season, no trig: integers in, integers out. */
const WEEK_SHAPE = [0.72, 0.94, 1.0, 1.03, 1.08, 1.22, 1.01];
const SEASON = [
  0.86, 0.84, 0.92, 0.97, 1.02, 1.05, 1.0, 0.98, 1.04, 1.08, 1.16, 1.3,
];

const buildSeries = (end: string, length: number): DateWindowDay[] => {
  const rand = seeded(2130);
  const out: DateWindowDay[] = [];
  for (let i = 0; i < length; i++) {
    const date = addDays(end, i - length + 1);
    const { m } = parts(date);
    const trend = 1 + (0.32 * i) / length;
    const level =
      1480 *
      (WEEK_SHAPE[weekday(date)] ?? 1) *
      (SEASON[m - 1] ?? 1) *
      trend *
      (0.84 + 0.32 * rand());
    const revenue = Math.round(level);
    const orders = Math.max(1, Math.round(revenue / (33 + 9 * rand())));
    out.push({ date, revenue, orders });
  }
  return out;
};

/** 800 days of Coldbrook sales ending today — enough to compare a year with the one before it. */
export const defaultDateWindowSeries: DateWindowDay[] = buildSeries(
  DEFAULT_TODAY,
  800,
);

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<DateWindowAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--dw-accent": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as DateWindowAccentName]
      : accent,
    "--dw-wash": "color-mix(in oklab, var(--dw-accent) 13%, transparent)",
    "--dw-soft": "color-mix(in oklab, var(--dw-accent) 34%, transparent)",
    // Ink on the accent flips with the accent's own lightness: light text on
    // a deep accent, deep text on a light one (mint in the dark theme).
    "--dw-on":
      "oklch(from var(--dw-accent) clamp(0.2, (0.7 - l) * 100, 0.99) 0.02 h)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const commas = (n: number) =>
  String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Compact dollars by hand: Intl's compact notation prints differently in Node and the browser. */
const compactMoney = (v: number) => {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 100_000) return `${sign}$${Math.round(a / 1000)}K`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${Math.round(a)}`;
};

const percent = (now: number, then: number) => {
  if (!then) return null;
  const p = ((now - then) / then) * 100;
  const r = Math.round(p * 10) / 10;
  return {
    value: r,
    text: `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}%`,
  };
};

const presetRange = (
  preset: DateWindowPreset,
  today: string,
  fallback: DateWindowRange,
): DateWindowRange => {
  if (preset.kind === "today")
    return { preset: preset.id, start: today, end: today };
  if (preset.kind === "qtd") {
    const { y, m } = parts(today);
    const q = Math.floor((m - 1) / 3) * 3;
    return { preset: preset.id, start: toIso(Date.UTC(y, q, 1)), end: today };
  }
  if (preset.kind === "ytd") {
    const { y } = parts(today);
    return { preset: preset.id, start: toIso(Date.UTC(y, 0, 1)), end: today };
  }
  if (preset.kind === "custom") return { ...fallback, preset: preset.id };
  const days = Math.max(1, preset.days ?? 1);
  return { preset: preset.id, start: addDays(today, -(days - 1)), end: today };
};

const comparedRange = (
  start: string,
  end: string,
  mode: DateWindowCompareMode,
) => {
  if (mode === "year")
    return { start: shiftMonths(start, -12), end: shiftMonths(end, -12) };
  const len = diffDays(start, end) + 1;
  const e = addDays(start, -1);
  return { start: addDays(e, -(len - 1)), end: e };
};

type Totals = { revenue: number; orders: number; days: number };

const totalsOf = (
  index: Map<string, DateWindowDay>,
  start: string,
  end: string,
): Totals | null => {
  const len = diffDays(start, end) + 1;
  if (len <= 0) return null;
  let revenue = 0;
  let orders = 0;
  let days = 0;
  for (let i = 0; i < len; i++) {
    const day = index.get(addDays(start, i));
    if (!day) continue;
    revenue += day.revenue;
    orders += day.orders;
    days += 1;
  }
  return days === 0 ? null : { revenue, orders, days };
};

/* ----------------------------------------------------------------------- */
/*                                 Calendar                                 */
/* ----------------------------------------------------------------------- */

type Pending = { start: string | null; end: string | null };

function Calendar({
  layout,
  today,
  weekStart,
  maxDays,
  initial,
  motionSafe,
  onApply,
  onCancel,
}: {
  layout: DateWindowCalendarLayout;
  today: string;
  weekStart: 0 | 1;
  maxDays: number;
  initial: { start: string; end: string };
  motionSafe: boolean;
  onApply: (start: string, end: string) => void;
  onCancel: () => void;
}) {
  const [pending, setPending] = React.useState<Pending>({
    start: initial.start,
    end: initial.end,
  });
  const [hover, setHover] = React.useState<string | null>(null);
  const [focus, setFocus] = React.useState(initial.end);
  const [view, setView] = React.useState(() =>
    monthStart(
      layout === "double" ? shiftMonths(initial.end, -1) : initial.end,
    ),
  );
  const [stripFrom, setStripFrom] = React.useState(() => {
    const w = (weekday(today) - weekStart + 7) % 7;
    return addDays(today, -w - 63);
  });
  const [box, setBox] = React.useState<HTMLDivElement | null>(null);
  const [wide, setWide] = React.useState(false);

  React.useEffect(() => {
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWide(entry.contentRect.width >= 520);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  const months = layout === "double" && wide ? 2 : 1;
  // Keep the focused day on screen: move the view when focus leaves it, and
  // never let a two-month view end on a month that has not happened yet.
  const viewEnd = addDays(shiftMonths(view, months), -1);
  if (layout !== "strip") {
    let next = view;
    if (focus < view || focus > viewEnd)
      next = monthStart(
        months === 2 && focus > viewEnd ? shiftMonths(focus, -1) : focus,
      );
    const latest = shiftMonths(monthStart(today), 1 - months);
    if (next > latest && focus >= latest) next = latest;
    if (next !== view) setView(next);
  }
  const stripTo = addDays(stripFrom, 69);
  if (layout === "strip" && (focus < stripFrom || focus > stripTo)) {
    const w = (weekday(focus) - weekStart + 7) % 7;
    setStripFrom(addDays(focus, -w - (focus < stripFrom ? 0 : 63)));
  }

  const lo = pending.start;
  const hi = pending.end ?? (lo && hover && hover >= lo ? hover : null);
  const span = lo && hi ? diffDays(lo, hi) + 1 : 0;
  const tooLong = span > maxDays;
  const ready = !!(pending.start && pending.end) && !tooLong;

  const pick = (iso: string) => {
    if (iso > today) return;
    setFocus(iso);
    if (!pending.start || pending.end) setPending({ start: iso, end: null });
    else if (iso < pending.start) setPending({ start: iso, end: null });
    else setPending({ start: pending.start, end: iso });
  };

  const grid = React.useRef<HTMLDivElement | null>(null);
  const [moved, setMoved] = React.useState(0);
  React.useEffect(() => {
    if (moved === 0) return;
    const cell = grid.current?.querySelector<HTMLElement>(
      `[data-dw-day="${focus}"]`,
    );
    cell?.focus({ preventScroll: layout !== "strip" });
    if (layout === "strip")
      cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focus, layout, moved]);

  // The strip opens scrolled to today's end of it.
  const [strip, setStrip] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!strip) return;
    const cell = strip.querySelector<HTMLElement>(`[data-dw-day="${focus}"]`);
    if (!cell) return;
    // Measured against the scroller itself: the cell's offsetParent is its
    // own wrapper, so offsetLeft would read as zero.
    const x =
      cell.getBoundingClientRect().left -
      strip.getBoundingClientRect().left +
      strip.scrollLeft;
    strip.scrollTo({
      left: Math.max(0, x - strip.clientWidth + cell.offsetWidth + 64),
    });
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strip]);

  const onGridKey = (event: React.KeyboardEvent) => {
    let to: string | null = null;
    const w = (weekday(focus) - weekStart + 7) % 7;
    switch (event.key) {
      case "ArrowLeft":
        to = addDays(focus, -1);
        break;
      case "ArrowRight":
        to = addDays(focus, 1);
        break;
      case "ArrowUp":
        to = addDays(focus, -7);
        break;
      case "ArrowDown":
        to = addDays(focus, 7);
        break;
      case "PageUp":
        to = shiftMonths(focus, -1);
        break;
      case "PageDown":
        to = shiftMonths(focus, 1);
        break;
      case "Home":
        to = addDays(focus, -w);
        break;
      case "End":
        to = addDays(focus, 6 - w);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(focus);
        return;
      default:
        return;
    }
    event.preventDefault();
    if (to > today) to = today;
    setFocus(to);
    setMoved((n) => n + 1);
  };

  const cell = (iso: string, outside: boolean, compact = false) => {
    const future = iso > today;
    const inRange = !!(lo && hi && iso >= lo && iso <= hi);
    const edge = iso === lo || iso === hi;
    const isToday = iso === today;
    const { d, m, y } = parts(iso);
    return (
      <div
        key={iso}
        role="gridcell"
        aria-selected={inRange || undefined}
        className={cn(
          "relative flex items-center justify-center",
          inRange && !edge && (tooLong ? "" : "bg-[var(--dw-wash)]"),
        )}
        style={
          inRange && tooLong
            ? {
                backgroundImage:
                  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--danger) 22%, transparent) 0 3px, transparent 3px 7px)",
              }
            : undefined
        }
      >
        <button
          type="button"
          data-dw-day={iso}
          tabIndex={iso === focus ? 0 : -1}
          aria-label={`${WEEKDAY_NAMES[weekday(iso)]}, ${MONTH_NAMES[m - 1]} ${d}, ${y}${isToday ? ", today" : ""}`}
          aria-disabled={future || undefined}
          aria-pressed={edge || undefined}
          onClick={() => {
            setFocus(iso);
            pick(iso);
          }}
          onPointerEnter={() => setHover(iso)}
          onPointerLeave={() => setHover((h) => (h === iso ? null : h))}
          className={cn(
            "relative z-[1] flex items-center justify-center rounded-full font-mono text-[11.5px] tabular-nums transition-colors",
            compact ? "h-full w-full rounded-2" : "size-7",
            FOCUS,
            future
              ? "cursor-not-allowed text-ink-3 opacity-40"
              : edge
                ? tooLong
                  ? "bg-danger text-[var(--dw-on)]"
                  : "bg-[var(--dw-accent)] text-[var(--dw-on)]"
                : outside
                  ? "text-ink-3 hover:bg-surface-2"
                  : "text-foreground hover:bg-surface-2",
          )}
        >
          {compact ? (
            <span className="flex flex-col items-center leading-none">
              <span
                className={cn(
                  "mb-1 text-[9.5px] tracking-wide",
                  edge ? "opacity-80" : "text-ink-3",
                )}
              >
                {WEEKDAYS[weekday(iso)]?.charAt(0)}
              </span>
              {d}
            </span>
          ) : (
            d
          )}
          {isToday ? (
            <span
              aria-hidden
              className={cn(
                "absolute size-[3px] rounded-full",
                compact
                  ? "top-1.5 right-1.5"
                  : "bottom-0.5 left-1/2 -translate-x-1/2",
                edge ? "bg-[var(--dw-on)]" : "bg-[var(--dw-accent)]",
              )}
            />
          ) : null}
        </button>
      </div>
    );
  };

  const month = (startOfMonth: string) => {
    const lead = (weekday(startOfMonth) - weekStart + 7) % 7;
    const first = addDays(startOfMonth, -lead);
    const { m, y } = parts(startOfMonth);
    const weeks = Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)),
    );
    const heads = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
    return (
      <div
        key={startOfMonth}
        className="flex w-[14.5rem] max-w-full flex-col gap-1"
      >
        <p
          className="px-1 text-[12.5px] font-semibold"
          id={`dw-${startOfMonth}`}
        >
          {`${MONTH_NAMES[m - 1]} ${y}`}
        </p>
        <div
          role="grid"
          aria-labelledby={`dw-${startOfMonth}`}
          className="grid gap-y-0.5"
        >
          <div role="row" className="grid grid-cols-7">
            {heads.map((h) => (
              <span
                key={h}
                role="columnheader"
                aria-label={WEEKDAY_NAMES[h]}
                className="flex h-5 items-center justify-center text-[10.5px] text-ink-3"
              >
                {WEEKDAYS[h]}
              </span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} role="row" className="grid grid-cols-7">
              {week.map((iso) =>
                // Days of the neighbouring months are left blank, so a range
                // is never drawn twice across a two-month view.
                parts(iso).m !== m ? (
                  <div key={iso} role="gridcell" className="h-7" />
                ) : (
                  cell(iso, false)
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const footer = tooLong
    ? `Ranges can be up to ${maxDays} days — this one is ${span}.`
    : pending.start && pending.end
      ? `${rangeLabel(pending.start, pending.end)} · ${span} ${span === 1 ? "day" : "days"}`
      : pending.start
        ? `From ${dayLabel(pending.start)} — pick the last day`
        : "Pick the first day";

  return (
    <div ref={setBox} className="flex flex-col gap-3 px-3 pt-2 pb-3">
      <div
        ref={grid}
        onKeyDown={onGridKey}
        className="flex flex-col gap-2"
        onPointerLeave={() => setHover(null)}
      >
        {layout === "strip" ? (
          <div className="relative">
            <div
              ref={setStrip}
              role="grid"
              aria-label="Days"
              className="flex snap-x snap-proximity scroll-px-4 [scrollbar-width:thin] gap-0 overflow-x-auto overscroll-x-contain [mask-image:linear-gradient(90deg,transparent,black_16px,black_calc(100%-16px),transparent)] pb-1"
            >
              <div role="row" className="flex px-4">
                {Array.from({ length: 70 }, (_, i) => {
                  const iso = addDays(stripFrom, i);
                  const { d, m } = parts(iso);
                  return (
                    <div
                      key={iso}
                      className="flex w-9 shrink-0 snap-start flex-col gap-0.5"
                    >
                      <span
                        aria-hidden
                        className="h-3.5 pl-1 text-[10px] font-semibold text-ink-3"
                      >
                        {d === 1 || i === 0 ? MONTHS[m - 1] : ""}
                      </span>
                      <div className="h-11">{cell(iso, false, true)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => {
                setView((v) => shiftMonths(v, -1));
                setFocus((f) => shiftMonths(f, -1));
              }}
              className={cn(
                "mt-[-2px] inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <div className="flex min-w-0 flex-1 justify-center gap-6">
              {Array.from({ length: months }, (_, i) =>
                month(shiftMonths(view, i)),
              )}
            </div>
            <button
              type="button"
              aria-label="Next month"
              aria-disabled={viewEnd >= today || undefined}
              onClick={() => {
                if (viewEnd >= today) return;
                setView((v) => shiftMonths(v, 1));
                setFocus((f) => {
                  const n = shiftMonths(f, 1);
                  return n > today ? today : n;
                });
              }}
              className={cn(
                "mt-[-2px] inline-flex size-7 shrink-0 items-center justify-center rounded-2",
                viewEnd >= today
                  ? "cursor-not-allowed text-ink-3 opacity-50"
                  : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline pt-2.5">
        <p
          className={cn(
            "min-w-0 text-[12px]",
            tooLong ? "text-danger" : "text-ink-2",
          )}
          aria-live="polite"
        >
          {footer}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "inline-flex h-7 items-center rounded-2 px-2.5 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            Cancel
          </button>
          <motion.button
            type="button"
            aria-disabled={!ready || undefined}
            title={tooLong ? footer : undefined}
            onClick={() => {
              if (ready && pending.start && pending.end)
                onApply(pending.start, pending.end);
            }}
            whileTap={ready && motionSafe ? { scale: 0.96 } : undefined}
            transition={springs.flick}
            className={cn(
              "inline-flex h-7 items-center rounded-2 px-3 text-[12px] font-medium",
              FOCUS,
              ready
                ? "bg-[var(--dw-accent)] text-[var(--dw-on)]"
                : "cursor-not-allowed bg-surface-2 text-ink-3",
            )}
          >
            Apply
          </motion.button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * The header of a sales dashboard and the figures it governs. The presets are
 * a radiogroup whose selected pill slides to the new choice on snap (one
 * shared, `useId`-prefixed layoutId); the range label cross-slides and the
 * tiles re-settle in a `cascade()` on glide. Turning compare on slides a
 * muted second range label in beside the first on glide, its width growing
 * from nothing so the rest of the row makes room instead of jumping, and the
 * tiles' deltas rise in on snap after it; turning it off reverses on the
 * exit ease. Custom opens a calendar under the bar whose height glides open
 * and pushes the tiles down; a span longer than `maxDays` turns to a danger
 * hatch and Apply says why it is off.
 *
 * Arrow keys move between presets, C toggles compare from anywhere inside,
 * Escape closes the calendar, and below 34rem the presets collapse into one
 * dropdown. Days, "today" and every label come from `now` and the time zone
 * by hand, never from the clock or a locale, so server and browser agree.
 * Under reduced motion the pill and the labels change without travel; the
 * figures and the invalid hatch still show.
 */
export function DateWindow({
  presets = defaultDateWindowPresets,
  range,
  defaultRange = defaultDateWindowRange,
  onRangeChange,
  compare,
  defaultCompare = false,
  compareMode,
  defaultCompareMode = "previous",
  onCompareChange,
  series = defaultDateWindowSeries,
  now = defaultDateWindowNow,
  timeZone = DEFAULT_ZONE,
  dataDelay = 120,
  maxDays = 90,
  weekStart = 1,
  title = "Sales",
  product = "Coldbrook",
  formatMoney = compactMoney,
  pillStyle = "soft",
  calendarLayout = "single",
  accent = "cobalt",
  status = "ready",
  onRetry,
  disabled = false,
  className,
}: DateWindowProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const today = todayIn(now, timeZone);

  const [ownRange, setOwnRange] = React.useState(defaultRange);
  const current = range ?? ownRange;
  const [ownCompare, setOwnCompare] = React.useState(defaultCompare);
  const comparing = compare ?? ownCompare;
  const [ownMode, setOwnMode] = React.useState(defaultCompareMode);
  const mode = compareMode ?? ownMode;

  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [listOpen, setListOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [returnTo, setReturnTo] = React.useState<string | null>(null);

  const valid = current.start <= current.end;
  const span = valid ? diffDays(current.start, current.end) + 1 : 0;
  const against = React.useMemo(
    () => (valid ? comparedRange(current.start, current.end, mode) : null),
    [current.end, current.start, mode, valid],
  );

  const index = React.useMemo(
    () => new Map(series.map((day) => [day.date, day])),
    [series],
  );
  const totals = React.useMemo(
    () => (valid ? totalsOf(index, current.start, current.end) : null),
    [current.end, current.start, index, valid],
  );
  const before = React.useMemo(
    () => (against ? totalsOf(index, against.start, against.end) : null),
    [against, index],
  );

  const shownPreset = calendarOpen ? "custom" : current.preset;
  const active = presets.find((p) => p.id === shownPreset) ?? presets[0];
  const tabStop = active?.id;

  /* ---------------------------- changes -------------------------------- */

  const commitRange = (next: DateWindowRange, label: string) => {
    if (range === undefined) setOwnRange(next);
    onRangeChange?.(next);
    setAnnouncement(`${label}, ${spoken(next.start, next.end)}.`);
  };

  const choose = (preset: DateWindowPreset) => {
    if (disabled) return;
    if (preset.kind === "custom") {
      setReturnTo(current.preset === "custom" ? null : current.preset);
      setCalendarOpen(true);
      setAnnouncement("Custom range. Pick the first day, then the last.");
      return;
    }
    setCalendarOpen(false);
    commitRange(presetRange(preset, today, current), preset.label);
  };

  const setCompare = (on: boolean, nextMode: DateWindowCompareMode = mode) => {
    if (disabled) return;
    if (compare === undefined) setOwnCompare(on);
    if (compareMode === undefined) setOwnMode(nextMode);
    onCompareChange?.(on, nextMode);
    const vs = valid
      ? comparedRange(current.start, current.end, nextMode)
      : null;
    setAnnouncement(
      on && vs
        ? `Comparing with ${spoken(vs.start, vs.end)}${nextMode === "year" ? ", a year earlier" : ""}.`
        : "Comparison off.",
    );
  };

  const closeCalendar = (refocus: boolean) => {
    setCalendarOpen(false);
    if (refocus) {
      const node = root?.querySelector<HTMLElement>(
        '[data-dw-preset="custom"]:not([hidden])',
      );
      if (node && node.offsetParent !== null) node.focus();
      else root?.querySelector<HTMLElement>("[data-dw-list]")?.focus();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']"))
      return;
    if (event.key === "Escape" && calendarOpen) {
      event.preventDefault();
      closeCalendar(true);
      return;
    }
    if (
      event.key.toLowerCase() === "c" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      setCompare(!comparing);
    }
  };

  /* ---------------------------- presets -------------------------------- */

  const onRadioKey = (event: React.KeyboardEvent, i: number) => {
    const n = presets.length;
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      to = (i + 1) % n;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = (i - 1 + n) % n;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to < 0) return;
    event.preventDefault();
    const preset = presets[to];
    if (!preset) return;
    event.currentTarget.parentElement
      ?.querySelector<HTMLElement>(
        `[data-dw-preset="${CSS.escape(preset.id)}"]`,
      )
      ?.focus();
    choose(preset);
  };

  const pill = (on: boolean) => {
    if (!on) return null;
    const transition = motionSafe ? springs.snap : { duration: 0 };
    if (pillStyle === "line")
      return (
        <motion.span
          aria-hidden
          layoutId={`${uid}-pill`}
          transition={transition}
          className="absolute inset-x-2 -bottom-[5px] h-[2px] rounded-full bg-[var(--dw-accent)]"
        />
      );
    return (
      <motion.span
        aria-hidden
        layoutId={`${uid}-pill`}
        transition={transition}
        className={cn(
          "absolute inset-0 rounded-[7px]",
          pillStyle === "solid"
            ? "bg-[var(--dw-accent)] shadow-sm"
            : "bg-[var(--dw-wash)] shadow-[inset_0_0_0_1px_var(--dw-soft)]",
        )}
      />
    );
  };

  /* ----------------------------- tiles --------------------------------- */

  const tiles = [
    {
      id: "revenue",
      label: "Revenue",
      value: totals ? formatMoney(totals.revenue) : "—",
      was: before ? formatMoney(before.revenue) : null,
      delta: totals && before ? percent(totals.revenue, before.revenue) : null,
    },
    {
      id: "orders",
      label: "Orders",
      value: totals ? commas(totals.orders) : "—",
      was: before ? commas(before.orders) : null,
      delta: totals && before ? percent(totals.orders, before.orders) : null,
    },
    {
      id: "aov",
      label: "Avg order",
      value: totals ? `$${(totals.revenue / totals.orders).toFixed(2)}` : "—",
      was: before ? `$${(before.revenue / before.orders).toFixed(2)}` : null,
      delta:
        totals && before
          ? percent(
              totals.revenue / totals.orders,
              before.revenue / before.orders,
            )
          : null,
    },
  ];
  const step = cascade(tiles.length);
  const figureKey = `${current.start}-${current.end}-${valid}`;

  const delay =
    dataDelay >= 60
      ? `~${Math.round(dataDelay / 60)} h`
      : dataDelay > 0
        ? `~${Math.round(dataDelay)} min`
        : null;
  const offsetH = timeZone.offsetMinutes / 60;
  const zoneText = `UTC${offsetH < 0 ? "−" : "+"}${Math.abs(Math.trunc(offsetH))}${
    timeZone.offsetMinutes % 60
      ? `:${String(Math.abs(timeZone.offsetMinutes % 60)).padStart(2, "0")}`
      : ""
  }`;

  const rise: Variants = {
    from: motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 },
    to: (i: unknown) => ({
      opacity: 1,
      y: 0,
      transition: motionSafe
        ? {
            ...springs.glide,
            delay: (typeof i === "number" ? i : 0) * step,
            opacity: {
              duration: durations.base,
              delay: (typeof i === "number" ? i : 0) * step,
            },
          }
        : { duration: durations.fast },
    }),
  };

  return (
    <section
      ref={setRoot}
      aria-label={`${product} ${title}`}
      onKeyDown={onKeyDown}
      className={cn(
        "@container relative flex w-full [scrollbar-width:thin] flex-col overflow-x-hidden overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
      style={accentVars(accent)}
    >
      {/* ------------------------------ row 1 ------------------------------ */}
      <div className="flex h-12 shrink-0 items-center gap-3 px-3">
        <div className="min-w-0 flex-1 @[34rem]:flex-none">
          <h3 className="truncate text-[14px] leading-tight font-semibold">
            {title}
          </h3>
          <p className="truncate text-[11px] leading-tight text-ink-3">
            {product}
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="Date range"
          className={cn(
            "relative hidden items-center @[34rem]:flex",
            pillStyle === "line" ? "gap-1" : "rounded-2 bg-surface-2 p-0.5",
          )}
        >
          {presets.map((preset, i) => {
            const on = preset.id === shownPreset;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                data-dw-preset={preset.id}
                aria-checked={on}
                aria-label={preset.label}
                tabIndex={preset.id === tabStop ? 0 : -1}
                disabled={disabled}
                onClick={() => choose(preset)}
                onKeyDown={(event) => onRadioKey(event, i)}
                className={cn(
                  "relative inline-flex h-7 items-center rounded-[7px] px-2.5 text-[12px] font-medium whitespace-nowrap transition-colors",
                  FOCUS,
                  on
                    ? pillStyle === "solid"
                      ? "text-[var(--dw-on)]"
                      : pillStyle === "soft"
                        ? "text-[var(--dw-accent)]"
                        : "text-foreground"
                    : "text-ink-2 hover:text-foreground",
                )}
                style={{ transitionDuration: `${durations.fast * 1000}ms` }}
              >
                {pill(on)}
                <span className="relative">{preset.short}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          data-dw-list=""
          aria-haspopup="listbox"
          aria-expanded={listOpen}
          aria-label={`Date range: ${active?.label ?? ""}`}
          disabled={disabled}
          onClick={() => setListOpen((o) => !o)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setListOpen(true);
            }
          }}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1 rounded-2 border border-hairline pr-1.5 pl-2.5 text-[12.5px] font-medium @[34rem]:hidden",
            FOCUS,
          )}
        >
          <span className="max-w-[9rem] truncate">{active?.label}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-ink-3" />
        </button>

        <span aria-hidden className="hidden flex-1 @[34rem]:block" />

        <button
          type="button"
          role="switch"
          aria-checked={comparing}
          aria-keyshortcuts="C"
          title="Compare · C"
          disabled={disabled}
          onClick={() => setCompare(!comparing)}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-2 rounded-2 px-1.5 text-[12.5px] font-medium text-ink-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <span
            aria-hidden
            className={cn(
              "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
              comparing ? "bg-[var(--dw-accent)]" : "bg-hairline-strong",
            )}
            style={{ transitionDuration: `${durations.fast * 1000}ms` }}
          >
            <motion.span
              className="absolute top-0.5 left-0.5 size-3 rounded-full bg-card shadow-sm"
              initial={false}
              animate={{ x: comparing ? 12 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
          <span className="@max-[20rem]:sr-only">Compare</span>
        </button>
      </div>

      {/* ------------------------------ row 2 ------------------------------ */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-hairline px-3 py-1.5 text-[12px]">
        <span className="flex h-6 min-w-0 items-center gap-1.5">
          <CalendarDays aria-hidden className="size-3.5 shrink-0 text-ink-3" />
          <span className="grid">
            <AnimatePresence initial={false}>
              <motion.span
                key={`${current.start}-${current.end}`}
                className={cn(
                  "col-start-1 row-start-1 font-medium whitespace-nowrap tabular-nums",
                  !valid && "text-danger",
                )}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? springs.glide : { duration: durations.fast }
                }
              >
                {valid
                  ? rangeLabel(current.start, current.end)
                  : "Pick a valid range"}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>

        <AnimatePresence initial={false}>
          {comparing && against ? (
            <motion.span
              key="vs"
              className="flex max-w-full items-center overflow-hidden"
              initial={motionSafe ? { width: 0, opacity: 0 } : { opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={
                motionSafe
                  ? {
                      width: 0,
                      opacity: 0,
                      transition: exitFor(durations.base),
                    }
                  : { opacity: 0, transition: { duration: durations.fast } }
              }
              transition={
                motionSafe
                  ? {
                      width: springs.glide,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast }
              }
            >
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pr-0.5 text-ink-3">
                <span>vs</span>
                <span className="whitespace-nowrap tabular-nums">
                  {parts(against.end).y === parts(current.end).y &&
                  parts(against.start).y === parts(against.end).y
                    ? against.start === against.end
                      ? dayLabel(against.start)
                      : `${dayLabel(against.start)} – ${dayLabel(against.end)}`
                    : rangeLabel(against.start, against.end)}
                </span>
                <span
                  role="radiogroup"
                  aria-label="Compare with"
                  className="ml-1 inline-flex h-6 items-center rounded-full border border-hairline p-0.5"
                >
                  {(["previous", "year"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      tabIndex={mode === m ? 0 : -1}
                      onClick={() => setCompare(true, m)}
                      onKeyDown={(event) => {
                        if (
                          [
                            "ArrowLeft",
                            "ArrowRight",
                            "ArrowUp",
                            "ArrowDown",
                          ].includes(event.key)
                        ) {
                          event.preventDefault();
                          const other = m === "previous" ? "year" : "previous";
                          setCompare(true, other);
                          event.currentTarget.parentElement
                            ?.querySelector<HTMLElement>(
                              `[data-dw-mode="${other}"]`,
                            )
                            ?.focus();
                        }
                      }}
                      data-dw-mode={m}
                      className={cn(
                        "inline-flex h-5 items-center rounded-full px-2 text-[11px] transition-colors",
                        FOCUS,
                        mode === m
                          ? "bg-surface-2 text-foreground"
                          : "text-ink-3 hover:text-foreground",
                      )}
                    >
                      {m === "previous" ? "Previous" : "Last year"}
                    </button>
                  ))}
                </span>
              </span>
            </motion.span>
          ) : null}
        </AnimatePresence>

        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-ink-3">
          <span
            className="inline-flex h-5 items-center gap-1 rounded-full border border-hairline px-1.5 font-mono text-[10.5px]"
            title={`Days are counted in ${timeZone.label} time`}
          >
            {/* Separate items with a gap: a flex item trims its own edge spaces. */}
            <span className="@max-[30rem]:hidden">{timeZone.label}</span>
            <span aria-hidden className="@max-[30rem]:hidden">
              ·
            </span>
            <span>{zoneText}</span>
          </span>
          {delay ? (
            <span
              className="inline-flex items-center gap-1.5"
              title={`Figures run about ${delay.slice(1)} behind`}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-warn" />
              <span className="@max-[30rem]:hidden">{`Data delayed ${delay}`}</span>
              <span className="@[30rem]:hidden">{delay}</span>
            </span>
          ) : null}
        </span>
      </div>

      {/* ---------------------------- calendar ----------------------------- */}
      <AnimatePresence initial={false}>
        {calendarOpen ? (
          <motion.div
            key="calendar"
            role="group"
            aria-label="Custom range"
            className="shrink-0 overflow-hidden border-t border-hairline"
            initial={motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={
              motionSafe
                ? { height: 0, opacity: 0, transition: exitFor(durations.base) }
                : { opacity: 0, transition: { duration: durations.fast } }
            }
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: durations.fast }
            }
          >
            <Calendar
              layout={calendarLayout}
              today={today}
              weekStart={weekStart}
              maxDays={Math.max(1, maxDays)}
              initial={valid ? current : { start: today, end: today }}
              motionSafe={motionSafe}
              onApply={(start, end) => {
                closeCalendar(true);
                commitRange({ preset: "custom", start, end }, "Custom range");
              }}
              onCancel={() => {
                closeCalendar(true);
                if (returnTo) setAnnouncement("Custom range cancelled.");
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ------------------------------ tiles ------------------------------ */}
      <div className="grid shrink-0 grid-cols-3 border-t border-hairline">
        {status !== "ready" ? (
          <div className="col-span-3 flex items-center gap-3 px-3 py-4">
            {status === "loading" ? (
              <div
                aria-busy="true"
                aria-label="Loading figures"
                className="grid w-full grid-cols-3 gap-3"
              >
                {[0, 1, 2].map((i) => (
                  <span key={i} className="flex flex-col gap-2">
                    <span className="h-2 w-12 rounded-full bg-surface-2" />
                    <span className="h-4 w-20 max-w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
                  </span>
                ))}
              </div>
            ) : (
              <>
                <p className="text-[13px]">Couldn’t load the figures.</p>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className={cn(
                      "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    Retry
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : (
          tiles.map((tile, i) => (
            <div
              key={tile.id}
              className={cn(
                "flex min-w-0 flex-col gap-1 px-3 py-3 @max-[30rem]:px-2.5",
                i > 0 && "border-l border-hairline",
              )}
            >
              <p className="truncate text-[11px] text-ink-3">{tile.label}</p>
              <div className="grid">
                <AnimatePresence initial={false}>
                  <motion.p
                    key={`${figureKey}-${tile.value}`}
                    custom={i}
                    variants={rise}
                    initial="from"
                    animate="to"
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    className="col-start-1 row-start-1 truncate text-[18px] leading-tight font-semibold tabular-nums @max-[30rem]:text-[15px]"
                  >
                    {tile.value}
                  </motion.p>
                </AnimatePresence>
              </div>
              <div className="flex h-5 min-w-0 items-center gap-1.5">
                <AnimatePresence initial={false}>
                  {comparing && tile.delta ? (
                    <motion.span
                      key={`${figureKey}-${mode}-${tile.delta.text}`}
                      className={cn(
                        "inline-flex h-5 shrink-0 items-center rounded-full px-1.5 font-mono text-[10.5px] font-medium tabular-nums",
                        tile.delta.value > 0
                          ? "bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-success"
                          : tile.delta.value < 0
                            ? "bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger"
                            : "bg-surface-2 text-ink-2",
                      )}
                      initial={
                        motionSafe ? { opacity: 0, y: 6 } : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? { ...springs.snap, delay: 0.12 + i * step }
                          : { duration: durations.fast }
                      }
                    >
                      {tile.delta.text}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                {comparing && tile.was ? (
                  <span className="truncate text-[11px] text-ink-3 @max-[40rem]:hidden">{`vs ${tile.was}`}</span>
                ) : null}
                {!comparing ? (
                  <span className="truncate text-[11px] text-ink-3">
                    {totals
                      ? `${totals.days} ${totals.days === 1 ? "day" : "days"}`
                      : valid
                        ? "no data"
                        : ""}
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ---------------------------- dropdown ----------------------------- */}
      <AnimatePresence>
        {listOpen ? (
          <PresetList
            key="list"
            presets={presets}
            selected={shownPreset}
            motionSafe={motionSafe}
            onPick={(preset) => {
              setListOpen(false);
              choose(preset);
              root?.querySelector<HTMLElement>("[data-dw-list]")?.focus();
            }}
            onClose={(refocus) => {
              setListOpen(false);
              if (refocus)
                root?.querySelector<HTMLElement>("[data-dw-list]")?.focus();
            }}
          />
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
      <span className="sr-only">
        {span > 0 ? `${span} days selected.` : ""}
      </span>
    </section>
  );
}

function PresetList({
  presets,
  selected,
  motionSafe,
  onPick,
  onClose,
}: {
  presets: DateWindowPreset[];
  selected: string;
  motionSafe: boolean;
  onPick: (preset: DateWindowPreset) => void;
  onClose: (refocus: boolean) => void;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const start = Math.max(
    0,
    presets.findIndex((p) => p.id === selected),
  );
  const [active, setActive] = React.useState(start);
  const close = React.useRef(onClose);
  React.useEffect(() => {
    close.current = onClose;
  });

  React.useEffect(() => {
    if (!node) return;
    node.focus();
  }, [node]);

  React.useEffect(() => {
    if (!node) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || node.contains(target) || target.closest("[data-dw-list]"))
        return;
      close.current(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [node]);

  const id = React.useId();
  const activePreset = presets[active];

  return (
    <motion.div
      ref={setNode}
      role="listbox"
      tabIndex={-1}
      aria-label="Date range"
      aria-activedescendant={
        activePreset ? `${id}-${activePreset.id}` : undefined
      }
      onKeyDown={(event) => {
        event.stopPropagation();
        const n = presets.length;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActive((a) => (a + 1) % n);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setActive((a) => (a - 1 + n) % n);
        } else if (event.key === "Home") {
          event.preventDefault();
          setActive(0);
        } else if (event.key === "End") {
          event.preventDefault();
          setActive(n - 1);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (activePreset) onPick(activePreset);
        } else if (event.key === "Escape") {
          event.preventDefault();
          close.current(true);
        } else if (event.key === "Tab") {
          close.current(false);
        }
      }}
      initial={
        motionSafe
          ? { opacity: 0, y: -distances.nudge, scale: 0.98 }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        motionSafe
          ? { opacity: 0, y: -distances.nudge, transition: exitFor() }
          : { opacity: 0, transition: { duration: durations.fast } }
      }
      transition={motionSafe ? springs.snap : { duration: durations.fast }}
      className={cn(
        "absolute top-[52px] left-2 z-20 flex w-52 max-w-[calc(100%-1rem)] origin-top-left flex-col gap-0.5 rounded-3 border border-hairline bg-popover p-1 shadow-lg",
        FOCUS,
      )}
    >
      {presets.map((preset, i) => (
        <div
          key={preset.id}
          id={`${id}-${preset.id}`}
          role="option"
          aria-selected={preset.id === selected}
          onPointerEnter={() => setActive(i)}
          onClick={() => onPick(preset)}
          className={cn(
            "flex h-7 cursor-pointer items-center justify-between gap-3 rounded-2 px-2 text-[12.5px]",
            i === active && "bg-surface-2",
            preset.id === selected && "font-medium text-[var(--dw-accent)]",
          )}
        >
          <span>{preset.label}</span>
          <span className="font-mono text-[10.5px] text-ink-3">
            {preset.short}
          </span>
        </div>
      ))}
    </motion.div>
  );
}
