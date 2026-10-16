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
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type LeaveStripeStyle = "bands" | "hatch" | "dots";
export type LeaveTone = "cobalt" | "moss" | "ember" | "plum";
export type LeaveStatus = "ready" | "loading" | "error";

export type LeavePolicy = {
  id: string;
  label: string;
  /** Days a year. Omit it for leave without a cap (unpaid). */
  allowance?: number;
  /** Calendar days of notice the request needs. @default 0 */
  noticeDays?: number;
};

export type LeaveHoliday = {
  /** The day, as ms at UTC midnight. */
  date: number;
  name: string;
};

export type LeaveAway = {
  /** First day away, ms at UTC midnight. */
  from: number;
  /** Last day away, ms at UTC midnight, inclusive. */
  to: number;
};

export type LeaveTeammate = {
  id: string;
  name: string;
  away: LeaveAway[];
};

export type LeaveRange = {
  /** First day, ms at UTC midnight. */
  from: number;
  /** Last day, ms at UTC midnight, inclusive. */
  to: number;
};

export type LeaveRequest = LeaveRange & {
  id: string;
  /** The policy id. */
  type: string;
  /** Working days the request takes. */
  days: number;
};

export type LeavePlannerProps = {
  /** How teammates' leave is drawn: bands that join across days, diagonal hatching, or stacked dots. @default "bands" */
  stripeStyle?: LeaveStripeStyle;
  /** Months side by side on a wide container, 1 to 3. Narrow containers always show one. @default 2 */
  monthCount?: number;
  /** The colour of your request and balance, as a pigment at fixed lightness. @default "cobalt" */
  tone?: LeaveTone;
  /** The kinds of leave. @default defaultLeavePolicies */
  policies?: LeavePolicy[];
  /** Days left of each kind, by policy id. @default defaultLeaveBalance */
  balance?: Record<string, number>;
  /** Public holidays: never counted as leave. @default defaultLeaveHolidays */
  holidays?: LeaveHoliday[];
  /** Teammates and the days they are already away. @default defaultLeaveTeam */
  team?: LeaveTeammate[];
  /** Controlled requests already made. */
  requests?: LeaveRequest[];
  /** Initial requests when uncontrolled. @default [] */
  defaultRequests?: LeaveRequest[];
  /** Fires from Request and Cancel with every request. */
  onRequestsChange?: (requests: LeaveRequest[]) => void;
  /** Controlled kind of leave, by policy id. */
  type?: string;
  /** Initial kind when uncontrolled. @default the first policy */
  defaultType?: string;
  /** Fires from the press or key that changed the kind of leave. */
  onTypeChange?: (type: string) => void;
  /** Controlled selection. */
  range?: LeaveRange | null;
  /** Initial selection when uncontrolled. @default null */
  defaultRange?: LeaveRange | null;
  /** Fires from the press, drag or key that changed the selection. */
  onRangeChange?: (range: LeaveRange | null) => void;
  /** Request was pressed, with the request. */
  onRequest?: (request: LeaveRequest) => void;
  /** Cancel was pressed on a request. */
  onCancel?: (request: LeaveRequest) => void;
  /** Today, ms. Earlier days cannot be chosen. Never read from the clock. @default defaultLeaveNow */
  now?: number;
  /** The first month shown, any ms inside it. @default the month after `now` */
  defaultMonth?: number;
  /** Whether the calendar has arrived. @default "ready" */
  status?: LeaveStatus;
  /** "Try again" was pressed after the calendar failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Time off" */
  title?: string;
  /** Height of the surface, px; the body scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be chosen or requested. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;
const on = (month: number, day: number) => Date.UTC(2026, month, day);

/** Monday 19 October 2026, 09:00. */
export const defaultLeaveNow = Date.UTC(2026, 9, 19, 9, 0);

export const defaultLeavePolicies: LeavePolicy[] = [
  { id: "annual", label: "Annual", allowance: 25, noticeDays: 10 },
  { id: "sick", label: "Sick", allowance: 10, noticeDays: 0 },
  { id: "unpaid", label: "Unpaid", noticeDays: 14 },
];

/** Nine annual days left of twenty-five; six sick days. */
export const defaultLeaveBalance: Record<string, number> = {
  annual: 9,
  sick: 6,
};

export const defaultLeaveHolidays: LeaveHoliday[] = [
  { date: on(10, 26), name: "Harvest Day" },
  { date: on(11, 25), name: "Christmas Day" },
  { date: on(11, 28), name: "Boxing Day, observed" },
];

/** The Fernworks studio: late November is busy, the last week of the year busier. */
export const defaultLeaveTeam: LeaveTeammate[] = [
  {
    id: "ines",
    name: "Ines Moreau",
    away: [{ from: on(10, 23), to: on(10, 27) }],
  },
  {
    id: "theo",
    name: "Theo Park",
    away: [{ from: on(10, 25), to: on(11, 2) }],
  },
  {
    id: "sam",
    name: "Sam Okoro",
    away: [
      { from: on(10, 9), to: on(10, 10) },
      { from: on(11, 14), to: on(11, 18) },
    ],
  },
  {
    id: "priya",
    name: "Priya Nair",
    away: [{ from: on(11, 21), to: on(11, 31) }],
  },
];

const NO_REQUESTS: LeaveRequest[] = [];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

/** Filled shapes are pigment: each hue at a fixed lightness, so both themes read. */
const TONES: Record<LeaveTone, string> = {
  cobalt: "oklch(from var(--accent-bright) 0.7 0.14 h)",
  moss: "oklch(from var(--success) 0.72 0.13 h)",
  ember: "oklch(from var(--warn) 0.74 0.14 52)",
  plum: "oklch(from var(--accent-bright) 0.68 0.13 318)",
};
/** One soft colour per teammate, deliberately apart from every tone. */
const MATES = [
  "oklch(from var(--success) 0.74 0.1 172)",
  "oklch(from var(--warn) 0.78 0.12 82)",
  "oklch(from var(--danger) 0.72 0.12 18)",
  "oklch(from var(--accent-bright) 0.72 0.1 280)",
  "oklch(from var(--accent-bright) 0.76 0.08 220)",
];
const OVER = "oklch(from var(--danger) 0.66 0.19 h)";
const INK_ON = "oklch(0.22 0.02 258)";

const WEEK_HEAD = ["M", "T", "W", "T", "F", "S", "S"];
const WEEK_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MONTH_SHORT = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(
  " ",
);
const MONTH_LONG = [
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

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** Whole days since the epoch; every date in here is one of these. */
const dayOf = (ms: number) => Math.floor(ms / DAY);
/** Monday is 0. The epoch was a Thursday. */
const weekday = (d: number) => (((d + 3) % 7) + 7) % 7;
const partsOf = (d: number) => {
  const date = new Date(d * DAY);
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
};
/** A month as one number, so "the next month" is plain addition. */
const monthKey = (d: number) => {
  const p = partsOf(d);
  return p.y * 12 + p.m;
};
const firstOfMonth = (key: number) =>
  dayOf(Date.UTC(Math.floor(key / 12), key % 12, 1));
const daysInMonth = (key: number) =>
  new Date(Date.UTC(Math.floor(key / 12), (key % 12) + 1, 0)).getUTCDate();
const monthName = (key: number) =>
  `${MONTH_LONG[key % 12] ?? ""} ${Math.floor(key / 12)}`;

const shortDate = (d: number) => {
  const p = partsOf(d);
  return `${WEEK_SHORT[weekday(d)] ?? ""} ${p.day} ${MONTH_SHORT[p.m] ?? ""}`;
};
const longDate = (d: number) => {
  const p = partsOf(d);
  return `${WEEK_LONG[weekday(d)] ?? ""} ${p.day} ${MONTH_LONG[p.m] ?? ""}`;
};
/** "23–27 Nov", or "25 Nov – 2 Dec" across a month. */
const spanDates = (from: number, to: number) => {
  const a = partsOf(from);
  const b = partsOf(to);
  if (from === to) return `${a.day} ${MONTH_SHORT[a.m] ?? ""}`;
  return a.m === b.m && a.y === b.y
    ? `${a.day}–${b.day} ${MONTH_SHORT[b.m] ?? ""}`
    : `${a.day} ${MONTH_SHORT[a.m] ?? ""} – ${b.day} ${MONTH_SHORT[b.m] ?? ""}`;
};
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;
const listWords = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;

type Span = { from: number; to: number };

/** Working days in a span: weekdays that are not holidays, in date order. */
function workingDays(span: Span | null, holidays: Set<number>): number[] {
  if (!span) return [];
  const out: number[] = [];
  for (let d = span.from; d <= span.to; d += 1) {
    if (weekday(d) < 5 && !holidays.has(d)) out.push(d);
  }
  return out;
}

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/**
 * One cell of the balance meter. Taken days are muted, pending ones
 * dashed; a day left is a pigment fill that empties right to left as the
 * drain passes it, so the balance visibly runs down a day at a time.
 */
function MeterCell({
  kind,
  slot,
  drained,
}: {
  kind: "taken" | "pending" | "left";
  /** For days left: how many drained days reach this cell (0 is the rightmost). */
  slot: number;
  drained: MotionValue<number>;
}) {
  const fill = useTransform(drained, (v) =>
    kind === "left" ? r2(1 - clamp01(v - slot)) : 1,
  );
  return (
    <span
      className={cn(
        "relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-[3px]",
        kind === "taken" &&
          "bg-[color-mix(in_oklab,var(--ink-3)_24%,transparent)]",
        kind === "pending" &&
          "border border-dashed border-(--lp-tone) bg-[color-mix(in_oklab,var(--lp-tone)_18%,transparent)]",
        kind === "left" &&
          "border border-[color-mix(in_oklab,var(--lp-tone)_55%,transparent)]",
      )}
    >
      {kind === "left" ? (
        <motion.span
          className="absolute inset-0 bg-(--lp-tone)"
          style={{ scaleX: fill, originX: 0 }}
        />
      ) : null}
    </span>
  );
}

/** Teammates away on a day, drawn in the chosen style. */
function Stripes({
  style,
  mates,
  before,
  after,
}: {
  style: LeaveStripeStyle;
  mates: number[];
  before: Set<number>;
  after: Set<number>;
}) {
  if (mates.length === 0) return null;
  if (style === "dots") {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 right-1 flex"
      >
        {mates.slice(0, 3).map((m, i) => (
          <span
            key={m}
            className="size-1.5 rounded-full ring-1 ring-card"
            style={{
              backgroundColor: MATES[m % MATES.length],
              marginLeft: i === 0 ? 0 : -2,
            }}
          />
        ))}
      </span>
    );
  }
  if (style === "hatch") {
    const angles = [45, -45, 90, 0, 60];
    return (
      <>
        {mates.map((m, i) => (
          <span
            key={m}
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage: `repeating-linear-gradient(${angles[i % angles.length] ?? 45}deg, ${MATES[m % MATES.length] ?? "currentColor"} 0 1.5px, transparent 1.5px 6px)`,
            }}
          />
        ))}
      </>
    );
  }
  return (
    <>
      {mates.map((m, i) => (
        <span
          key={m}
          aria-hidden
          className={cn(
            "pointer-events-none absolute h-1 opacity-75",
            before.has(m) ? "left-0" : "left-1 rounded-l-full",
            after.has(m) ? "right-0" : "right-1 rounded-r-full",
          )}
          style={{
            bottom: 3 + i * 3,
            backgroundColor: MATES[m % MATES.length],
          }}
        />
      ))}
    </>
  );
}

type CellInfo = {
  d: number;
  inRange: boolean;
  rangeStart: boolean;
  rangeEnd: boolean;
  /** Its turn in the drain, or -1 when it is not a working day of the selection. */
  order: number;
  requested: LeaveRequest | null;
  holiday: string | null;
  past: boolean;
  today: boolean;
  mates: number[];
  before: Set<number>;
  after: Set<number>;
};

/**
 * A day. Its wash lights when the drain reaches it — the same motion value
 * that empties the meter — so a day leaves the balance and lands on the
 * calendar in one beat.
 */
function DayCell({
  info,
  drained,
  stripeStyle,
  focusable,
  label,
  register,
  onPress,
  onPointerDown,
  onPointerEnter,
  onKeyDown,
  onFocus,
}: {
  info: CellInfo;
  drained: MotionValue<number>;
  stripeStyle: LeaveStripeStyle;
  focusable: boolean;
  label: string;
  register: (d: number, node: HTMLDivElement) => () => void;
  onPress: (d: number) => void;
  onPointerDown: (event: React.PointerEvent, d: number) => void;
  onPointerEnter: (d: number) => void;
  onKeyDown: (event: React.KeyboardEvent, d: number) => void;
  onFocus: (d: number) => void;
}) {
  const lit = useTransform(drained, (v) =>
    info.order < 0 ? 0 : r2(clamp01(v - info.order)),
  );
  const wd = weekday(info.d);
  const weekend = wd >= 5;
  const day = partsOf(info.d).day;
  const roundL = info.rangeStart || wd === 0;
  const roundR = info.rangeEnd || wd === 6;
  return (
    <div
      ref={(node) => (node ? register(info.d, node) : undefined)}
      role="gridcell"
      data-lp-day={info.d}
      aria-selected={info.inRange}
      aria-disabled={info.past || undefined}
      aria-label={label}
      tabIndex={focusable ? 0 : -1}
      onClick={() => onPress(info.d)}
      onPointerDown={(event) => onPointerDown(event, info.d)}
      onPointerEnter={() => onPointerEnter(info.d)}
      onKeyDown={(event) => onKeyDown(event, info.d)}
      onFocus={() => onFocus(info.d)}
      title={info.holiday ?? undefined}
      className={cn(
        "relative h-9 touch-manipulation select-none",
        info.past ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_IN,
        "focus-visible:rounded-2",
      )}
    >
      {weekend || info.holiday ? (
        <span
          aria-hidden
          className="absolute inset-0 bg-[color-mix(in_oklab,var(--ink-3)_6%,transparent)]"
        />
      ) : null}
      <Stripes
        style={stripeStyle}
        mates={info.mates}
        before={info.before}
        after={info.after}
      />
      {info.requested ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1 border-y border-dashed border-(--lp-tone) bg-[color-mix(in_oklab,var(--lp-tone)_14%,transparent)]",
            info.d === dayOf(info.requested.from) || wd === 0
              ? "left-0.5 rounded-l-2 border-l"
              : "left-0",
            info.d === dayOf(info.requested.to) || wd === 6
              ? "right-0.5 rounded-r-2 border-r"
              : "right-0",
          )}
        />
      ) : null}
      {info.inRange ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1 overflow-hidden bg-[color-mix(in_oklab,var(--lp-tone)_16%,transparent)]",
            roundL ? "left-0.5 rounded-l-2" : "left-0",
            roundR ? "right-0.5 rounded-r-2" : "right-0",
          )}
        >
          {info.order >= 0 ? (
            <motion.span
              className="absolute inset-0 bg-[color-mix(in_oklab,var(--lp-tone)_62%,transparent)]"
              style={{ opacity: lit }}
            />
          ) : (
            <span
              className="absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--lp-tone) 55%, transparent) 0 1px, transparent 1px 5px)",
              }}
            />
          )}
        </span>
      ) : null}
      <span
        aria-hidden
        className={cn(
          "absolute top-1 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full text-[12.5px] leading-none tabular-nums",
          info.past
            ? "text-ink-3/50"
            : weekend || info.holiday
              ? "text-ink-3"
              : "text-foreground",
          info.today && "ring-1 ring-foreground",
        )}
      >
        {day}
      </span>
      {info.holiday ? (
        <span
          aria-hidden
          className="absolute top-[27px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-ink-3"
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The planner                                */
/* ----------------------------------------------------------------------- */

type Said = { n: number; text: string };

/**
 * Time off, asked for against the calendar it lands on. A balance meter of
 * the leave type's days sits over `monthCount` months; choosing a range —
 * a press and a drag, two presses, or Enter and Shift with the arrows —
 * drains the meter a day at a time as the count of working days rolls,
 * one motion value walking at about 45 ms a day on the linear ease, and
 * each working day in the calendar lights in the same beat while weekends
 * and holidays inside the range stay hatched, because they are skipped.
 * Teammates already away are soft overlapping stripes on their dates.
 *
 * Asking for more than the balance runs the meter dry; it shakes once on a
 * tween (a refusal never bounces) and the request bar says by how much and
 * what to do; a start inside the notice period names the earliest start.
 * Each month is a grid; one date is the tab stop. Under reduced motion the
 * drain is instant and nothing shakes, and every count still changes.
 */
export function LeavePlanner({
  stripeStyle = "bands",
  monthCount = 2,
  tone = "cobalt",
  policies = defaultLeavePolicies,
  balance = defaultLeaveBalance,
  holidays = defaultLeaveHolidays,
  team = defaultLeaveTeam,
  requests,
  defaultRequests = NO_REQUESTS,
  onRequestsChange,
  type,
  defaultType,
  onTypeChange,
  range,
  defaultRange = null,
  onRangeChange,
  onRequest,
  onCancel,
  now = defaultLeaveNow,
  defaultMonth,
  status = "ready",
  onRetry,
  title = "Time off",
  height = 540,
  disabled = false,
  className,
}: LeavePlannerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const today = dayOf(now);

  /* ------------------------------- state --------------------------------- */

  const [ownType, setOwnType] = React.useState(
    () => defaultType ?? policies[0]?.id ?? "",
  );
  const typeId = type ?? ownType;
  const policy = policies.find((p) => p.id === typeId) ?? policies[0];

  const [ownRequests, setOwnRequests] =
    React.useState<LeaveRequest[]>(defaultRequests);
  const reqList = requests ?? ownRequests;

  const [ownRange, setOwnRange] = React.useState<LeaveRange | null>(
    defaultRange,
  );
  const committed = range === undefined ? ownRange : range;
  const committedSpan: Span | null = committed
    ? {
        from: Math.min(dayOf(committed.from), dayOf(committed.to)),
        to: Math.max(dayOf(committed.from), dayOf(committed.to)),
      }
    : null;

  /** The first click of two: the start, waiting for its end. */
  const [pending, setPending] = React.useState<number | null>(null);
  const [hover, setHover] = React.useState<number | null>(null);
  const shownSpan: Span | null =
    pending !== null
      ? {
          from: Math.min(pending, hover ?? pending),
          to: Math.max(pending, hover ?? pending),
        }
      : committedSpan;

  const [viewKey, setViewKey] = React.useState(() =>
    defaultMonth !== undefined
      ? monthKey(dayOf(defaultMonth))
      : monthKey(today) + 1,
  );
  const [narrow, setNarrow] = React.useState(false);
  // Months arrive from the side the view moved toward; the first paint is still.
  const [viewMoved, setViewMoved] = React.useState(false);
  const [viewDir, setViewDir] = React.useState(1);
  const visibleCount = narrow ? 1 : clamp(Math.round(monthCount), 1, 3);
  const months = Array.from({ length: visibleCount }, (_, i) => viewKey + i);

  const [focus, setFocus] = React.useState(() =>
    Math.max(
      dayOf(
        defaultMonth ?? Date.UTC(partsOf(today).y, partsOf(today).m + 1, 1),
      ),
      today,
    ),
  );
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => {
      setNarrow(node.getBoundingClientRect().width < 34 * 16);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------ derived -------------------------------- */

  const holidayMap = React.useMemo(
    () => new Map(holidays.map((h) => [dayOf(h.date), h.name])),
    [holidays],
  );
  const holidaySet = React.useMemo(
    () => new Set(holidayMap.keys()),
    [holidayMap],
  );
  const awayOn = React.useCallback(
    (d: number) => {
      const out: number[] = [];
      team.forEach((mate, i) => {
        if (mate.away.some((a) => dayOf(a.from) <= d && d <= dayOf(a.to)))
          out.push(i);
      });
      return out;
    },
    [team],
  );

  const allowance = policy?.allowance;
  const capped = allowance !== undefined;
  const pendingDays = reqList
    .filter((r) => r.type === policy?.id)
    .reduce((t, r) => t + r.days, 0);
  const left = capped
    ? Math.max(0, (balance[policy?.id ?? ""] ?? allowance) - pendingDays)
    : Infinity;
  const taken = capped
    ? Math.max(
        0,
        (allowance ?? 0) - (balance[policy?.id ?? ""] ?? allowance ?? 0),
      )
    : 0;

  const shownWork = workingDays(shownSpan, holidaySet);
  const count = shownWork.length;
  const order = new Map(shownWork.map((d, i) => [d, i]));
  const over = capped ? Math.max(0, count - left) : 0;
  const earliest = today + (policy?.noticeDays ?? 0);
  const tooSoon = committedSpan !== null && committedSpan.from < earliest;
  const clashReq =
    committedSpan !== null
      ? reqList.find(
          (r) =>
            dayOf(r.from) <= committedSpan.to &&
            committedSpan.from <= dayOf(r.to),
        )
      : undefined;

  /* -------------------------------- drain -------------------------------- */

  // One value walks the working days; meter cells and calendar days both
  // read it, so the drain renders React zero times per frame.
  const drained = useMotionValue(count);
  React.useEffect(() => {
    const from = drained.get();
    if (from === count) return;
    if (!motionSafe) {
      drained.jump(count);
      return;
    }
    const controls = animate(drained, count, {
      duration: Math.min(0.6, 0.045 * Math.abs(count - from)),
      ease: easings.linear,
    });
    // Finished, never frozen: a re-run (StrictMode, a new range) starts
    // from wherever this one left the value.
    return () => controls.stop();
  }, [count, drained, motionSafe]);

  const leftText = useTransform(drained, (v) =>
    capped ? String(Math.max(0, left - Math.round(v))) : String(Math.round(v)),
  );

  const shakeX = useMotionValue(0);
  const wasOver = React.useRef(false);
  React.useEffect(() => {
    const isOver = over > 0;
    if (isOver && !wasOver.current && motionSafe) {
      const controls = animate(shakeX, [0, -4, 4, -2, 0], {
        duration: 0.32,
        ease: easings.move,
      });
      wasOver.current = isOver;
      return () => controls.complete();
    }
    wasOver.current = isOver;
  }, [over, motionSafe, shakeX]);

  /* ------------------------------ commits -------------------------------- */

  const describe = (span: Span) => {
    const work = workingDays(span, holidaySet);
    const skipped = span.to - span.from + 1 - work.length;
    const mates = team
      .filter((m) =>
        m.away.some(
          (a) => dayOf(a.from) <= span.to && span.from <= dayOf(a.to),
        ),
      )
      .map((m) => m.name);
    const after = capped
      ? work.length > left
        ? `${plural(work.length - left, "day", "days")} over your balance.`
        : `${plural(left - work.length, "day", "days")} left.`
      : "Unpaid.";
    return `${shortDate(span.from)} to ${shortDate(span.to)}: ${plural(work.length, "working day", "working days")}${skipped > 0 ? `, ${skipped} skipped` : ""}. ${after}${mates.length > 0 ? ` ${listWords(mates)} ${mates.length === 1 ? "is" : "are"} away then.` : ""}`;
  };

  const commitRange = (span: Span | null) => {
    const next = span ? { from: span.from * DAY, to: span.to * DAY } : null;
    if (range === undefined) setOwnRange(next);
    onRangeChange?.(next);
    say(span ? describe(span) : "Selection cleared.");
  };

  const choose = (d: number) => {
    if (disabled || !ready || d < today) return;
    if (pending === null) {
      setPending(d);
      setHover(d);
      say(`Starts ${longDate(d)}. Choose the last day.`);
      return;
    }
    const span = { from: Math.min(pending, d), to: Math.max(pending, d) };
    setPending(null);
    setHover(null);
    commitRange(span);
  };

  const setTypeTo = (id: string) => {
    if (disabled || !ready || id === typeId) return;
    if (type === undefined) setOwnType(id);
    onTypeChange?.(id);
    const p = policies.find((x) => x.id === id);
    say(
      `${p?.label ?? id} leave${p?.allowance !== undefined ? `: ${plural(Math.max(0, (balance[id] ?? p.allowance) - reqList.filter((r) => r.type === id).reduce((t, r) => t + r.days, 0)), "day", "days")} left` : ", no cap"}.`,
    );
  };

  const request = () => {
    if (
      disabled ||
      !ready ||
      !committedSpan ||
      !policy ||
      count === 0 ||
      over > 0 ||
      tooSoon ||
      clashReq
    )
      return;
    const made: LeaveRequest = {
      id: `${policy.id}-${committedSpan.from}-${committedSpan.to}`,
      type: policy.id,
      from: committedSpan.from * DAY,
      to: committedSpan.to * DAY,
      days: count,
    };
    const next = [...reqList, made];
    if (requests === undefined) setOwnRequests(next);
    onRequestsChange?.(next);
    onRequest?.(made);
    // The balance takes the days now, so the selection is spent: clear it
    // without a second drain.
    drained.jump(0);
    if (range === undefined) setOwnRange(null);
    onRangeChange?.(null);
    say(
      `Requested ${plural(count, "day", "days")} of ${policy.label.toLowerCase()} leave, ${shortDate(committedSpan.from)} to ${shortDate(committedSpan.to)}. Awaiting approval.`,
    );
  };

  const cancel = (r: LeaveRequest) => {
    if (disabled) return;
    const next = reqList.filter((x) => x.id !== r.id);
    if (requests === undefined) setOwnRequests(next);
    onRequestsChange?.(next);
    onCancel?.(r);
    say(
      `Cancelled ${spanDates(dayOf(r.from), dayOf(r.to))}. ${plural(r.days, "day", "days")} back.`,
    );
  };

  /* ------------------------------- pointer ------------------------------- */

  const drag = React.useRef<{ from: number; moved: boolean } | null>(null);
  const hoverRef = React.useRef<number | null>(null);
  const swallowClick = React.useRef(false);
  const finishDrag = React.useRef<(from: number, to: number) => void>(() => {});
  React.useEffect(() => {
    finishDrag.current = (from, to) => {
      setPending(null);
      setHover(null);
      commitRange({ from: Math.min(from, to), to: Math.max(from, to) });
    };
  });

  const onCellPointerDown = (event: React.PointerEvent, d: number) => {
    // Touch keeps two taps: a finger sliding across the month is a scroll.
    if (event.pointerType === "touch" || event.button !== 0) return;
    if (disabled || !ready || d < today) return;
    // With a start already chosen, this press is the end: the click says so.
    if (pending !== null) return;
    drag.current = { from: d, moved: false };
    hoverRef.current = d;
    setPending(d);
    setHover(d);
  };
  const onCellEnter = (d: number) => {
    if (d < today) return;
    const g = drag.current;
    if (g && d !== g.from) g.moved = true;
    if (g || pending !== null) {
      hoverRef.current = d;
      setHover(d);
    }
  };
  React.useEffect(() => {
    const up = (event: PointerEvent) => {
      const g = drag.current;
      drag.current = null;
      if (!g) return;
      // The press already chose the start, so the click that follows this
      // release must not choose again; clicks fire before any timer.
      swallowClick.current = true;
      window.setTimeout(() => {
        swallowClick.current = false;
      }, 0);
      if (!g.moved) return;
      const cell =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-lp-day]")
          : null;
      const to = cell ? Number(cell.dataset.lpDay) : hoverRef.current;
      finishDrag.current(g.from, to ?? g.from);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);
  const onCellPress = (d: number) => {
    if (swallowClick.current) return;
    choose(d);
  };

  /* ------------------------------ keyboard ------------------------------- */

  const cellNodes = React.useRef(new Map<number, HTMLDivElement>());
  // Keyed by day; a node only removes itself, so a month that re-renders
  // never drops the entry a newer node has taken.
  const register = React.useCallback((d: number, node: HTMLDivElement) => {
    const map = cellNodes.current;
    map.set(d, node);
    return () => {
      if (map.get(d) === node) map.delete(d);
    };
  }, []);
  const [focusTick, setFocusTick] = React.useState(0);
  const wantFocus = React.useRef(false);
  React.useEffect(() => {
    if (!wantFocus.current) return;
    const node = cellNodes.current.get(focus);
    if (node?.isConnected) {
      wantFocus.current = false;
      node.focus();
    }
  }, [focus, focusTick, viewKey]);

  const moveFocus = (d: number) => {
    setFocus(d);
    const key = monthKey(d);
    if (key < viewKey) {
      setViewKey(key);
      setViewMoved(true);
      setViewDir(-1);
    } else if (key > viewKey + visibleCount - 1) {
      setViewKey(key - visibleCount + 1);
      setViewMoved(true);
      setViewDir(1);
    }
    wantFocus.current = true;
    setFocusTick((t) => t + 1);
  };

  const onCellKey = (event: React.KeyboardEvent, d: number) => {
    if (!ready) return;
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = step[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      const target = d + delta;
      moveFocus(target);
      if (event.shiftKey && !disabled && target >= today) {
        const anchor =
          pending ??
          (committedSpan
            ? d === committedSpan.from &&
              committedSpan.from !== committedSpan.to
              ? committedSpan.to
              : committedSpan.from
            : d);
        setPending(null);
        setHover(null);
        commitRange({
          from: Math.max(today, Math.min(anchor, target)),
          to: Math.max(anchor, target),
        });
      } else if (pending !== null) {
        setHover(target);
      }
      return;
    }
    switch (event.key) {
      case "Home":
        event.preventDefault();
        moveFocus(d - weekday(d));
        return;
      case "End":
        event.preventDefault();
        moveFocus(d + 6 - weekday(d));
        return;
      case "PageUp":
      case "PageDown": {
        event.preventDefault();
        const p = partsOf(d);
        const key = monthKey(d) + (event.key === "PageUp" ? -1 : 1);
        const day = Math.min(p.day, daysInMonth(key));
        moveFocus(firstOfMonth(key) + day - 1);
        return;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        choose(d);
        return;
      case "Escape":
        if (pending === null && !committedSpan) return;
        event.preventDefault();
        event.stopPropagation();
        setPending(null);
        setHover(null);
        commitRange(null);
        return;
      default:
        return;
    }
  };

  const shiftView = (by: number) => {
    const key = viewKey + by;
    setViewKey(key);
    setViewMoved(true);
    setViewDir(by > 0 ? 1 : -1);
    // The tab stop follows the view, without pulling focus to it.
    const inView =
      monthKey(focus) >= key && monthKey(focus) <= key + visibleCount - 1;
    if (!inView) setFocus(Math.max(today, firstOfMonth(key)));
  };

  /* -------------------------------- parts -------------------------------- */

  const cellLabel = (c: CellInfo) => {
    const parts = [longDate(c.d)];
    if (c.holiday) parts.push(c.holiday);
    else if (weekday(c.d) >= 5) parts.push("weekend");
    if (c.past) parts.push("past");
    if (c.today) parts.push("today");
    if (c.inRange)
      parts.push(
        c.order >= 0 ? "in your selection" : "skipped in your selection",
      );
    if (c.requested) parts.push("requested");
    if (c.mates.length > 0)
      parts.push(`${listWords(c.mates.map((m) => team[m]?.name ?? ""))} away`);
    return parts.join(", ");
  };

  const monthGrid = (key: number, index: number) => {
    const first = firstOfMonth(key);
    const lead = weekday(first);
    const total = daysInMonth(key);
    const rows = Array.from({ length: 6 }, (_, r) =>
      Array.from({ length: 7 }, (_, c) => {
        const n = r * 7 + c - lead;
        return n >= 0 && n < total ? first + n : null;
      }),
    );
    return (
      <div
        key={key}
        className={cn(
          "min-w-0 flex-1",
          index > 0 && "hidden @min-[34rem]:block",
        )}
      >
        <p
          id={`${uid}-m${key}`}
          className="mb-1.5 text-center text-[12px] font-medium text-foreground"
        >
          {monthName(key)}
        </p>
        <div
          role="grid"
          aria-labelledby={`${uid}-m${key}`}
          aria-describedby={hintId}
          aria-readonly
          aria-multiselectable
          className="flex flex-col"
        >
          <div role="row" className="grid grid-cols-7">
            {WEEK_HEAD.map((w, i) => (
              <span
                key={i}
                role="columnheader"
                aria-label={WEEK_LONG[i]}
                className="pb-1 text-center font-mono text-[10px] text-ink-3"
              >
                {w}
              </span>
            ))}
          </div>
          {rows.map((week, r) => (
            <div key={r} role="row" className="grid grid-cols-7">
              {week.map((d, c) => {
                if (d === null)
                  return (
                    <div key={c} role="gridcell" aria-hidden className="h-9" />
                  );
                const mates = awayOn(d);
                const prevMates = new Set(c > 0 ? awayOn(d - 1) : []);
                const nextMates = new Set(c < 6 ? awayOn(d + 1) : []);
                const requested =
                  reqList.find((q) => dayOf(q.from) <= d && d <= dayOf(q.to)) ??
                  null;
                const info: CellInfo = {
                  d,
                  inRange:
                    shownSpan !== null &&
                    d >= shownSpan.from &&
                    d <= shownSpan.to,
                  rangeStart: shownSpan?.from === d,
                  rangeEnd: shownSpan?.to === d,
                  order: order.get(d) ?? -1,
                  requested,
                  holiday: holidayMap.get(d) ?? null,
                  past: d < today,
                  today: d === today,
                  mates,
                  before: prevMates,
                  after: nextMates,
                };
                return (
                  <DayCell
                    key={d}
                    info={info}
                    drained={drained}
                    stripeStyle={stripeStyle}
                    focusable={d === focus}
                    label={cellLabel(info)}
                    register={register}
                    onPress={onCellPress}
                    onPointerDown={onCellPointerDown}
                    onPointerEnter={onCellEnter}
                    onKeyDown={onCellKey}
                    onFocus={setFocus}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const meter = (
    <div className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 px-3.5 py-3">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
        <p className="flex items-baseline gap-1.5">
          <motion.span className="font-mono text-[26px] leading-none font-medium tabular-nums">
            {leftText}
          </motion.span>
          <span className="text-[12px] text-ink-2">
            {capped ? `days left of ${allowance}` : "unpaid days · no cap"}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {count > 0 ? (
            <span className="inline-flex h-6 items-center rounded-full border border-[color-mix(in_oklab,var(--lp-tone)_55%,transparent)] px-2 font-mono text-[11px] text-foreground tabular-nums">
              {plural(count, "day", "days")} selected
            </span>
          ) : null}
          <AnimatePresence initial={false}>
            {over > 0 ? (
              <motion.span
                key="over"
                className="inline-flex h-6 items-center gap-1 rounded-full px-2 font-mono text-[11px] tabular-nums"
                style={{ backgroundColor: OVER, color: INK_ON }}
                initial={{ opacity: 0, scale: motionSafe ? 0.9 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: durations.fast } }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.flick,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                {over} over
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      {capped && allowance !== undefined ? (
        <motion.div
          role="meter"
          aria-label={`${policy?.label ?? ""} balance`}
          aria-valuemin={0}
          aria-valuemax={allowance}
          aria-valuenow={Math.max(0, left - count)}
          aria-valuetext={`${Math.max(0, left - count)} of ${allowance} days left${count > 0 ? " after this request" : ""}`}
          className="flex gap-[3px]"
          style={{ x: shakeX }}
        >
          {Array.from({ length: allowance }, (_, i) => {
            const kind =
              i < taken
                ? "taken"
                : i < taken + pendingDays
                  ? "pending"
                  : "left";
            const leftIndex = i - taken - pendingDays;
            return (
              <MeterCell
                key={i}
                kind={kind}
                slot={left - 1 - leftIndex}
                drained={drained}
              />
            );
          })}
        </motion.div>
      ) : (
        <div
          aria-hidden
          className="h-3.5 rounded-[3px] border border-dashed border-hairline-strong"
        />
      )}
      {capped ? (
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-[2px] bg-[color-mix(in_oklab,var(--ink-3)_24%,transparent)]"
            />
            {taken} taken
          </span>
          {pendingDays > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 rounded-[2px] border border-dashed border-(--lp-tone)"
              />
              {pendingDays} awaiting approval
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-[2px] bg-(--lp-tone)" />
            {left} left
          </span>
        </p>
      ) : null}
    </div>
  );

  const awaySpan = shownSpan;
  const awayList = awaySpan
    ? team
        .map((m, i) => ({
          m,
          i,
          spans: m.away.filter(
            (a) => dayOf(a.from) <= awaySpan.to && awaySpan.from <= dayOf(a.to),
          ),
        }))
        .filter((x) => x.spans.length > 0)
    : [];

  const away = (
    <div className="flex flex-col gap-1.5">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Also away
      </p>
      {!awaySpan ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {team.map((m, i) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-1.5 text-[12px] text-ink-2"
            >
              <span
                aria-hidden
                className="h-1 w-3 rounded-full"
                style={{ backgroundColor: MATES[i % MATES.length] }}
              />
              {m.name}
            </li>
          ))}
        </ul>
      ) : awayList.length === 0 ? (
        <p className="text-[12px] text-ink-2">No one else is away then.</p>
      ) : (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {awayList.map(({ m, i, spans }) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-1.5 text-[12px] text-foreground"
            >
              <span
                aria-hidden
                className="h-1 w-3 rounded-full"
                style={{ backgroundColor: MATES[i % MATES.length] }}
              />
              {m.name}
              <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                {spans
                  .map((a) => spanDates(dayOf(a.from), dayOf(a.to)))
                  .join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {reqList.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1">
          {reqList.map((r) => {
            const p = policies.find((x) => x.id === r.type);
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2 border border-dashed border-[color-mix(in_oklab,var(--lp-tone)_60%,transparent)] px-2.5 py-1.5 text-[12px]"
              >
                <span className="min-w-0">
                  <span className="font-medium">{p?.label ?? r.type}</span>{" "}
                  <span className="text-ink-2 tabular-nums">
                    · {spanDates(dayOf(r.from), dayOf(r.to))} ·{" "}
                    {plural(r.days, "day", "days")}
                  </span>{" "}
                  <span className="text-ink-3">· awaiting approval</span>
                </span>
                <button
                  type="button"
                  onClick={() => cancel(r)}
                  aria-disabled={disabled || undefined}
                  aria-label={`Cancel ${p?.label ?? ""} leave ${spanDates(dayOf(r.from), dayOf(r.to))}`}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                  Cancel
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );

  const problem = !committedSpan
    ? null
    : committedSpan.from < today
      ? "Days before today can't be requested."
      : tooSoon
        ? `${policy?.label ?? ""} leave needs ${plural(policy?.noticeDays ?? 0, "day's", "days'")} notice — the earliest start is ${shortDate(earliest)}.`
        : over > 0
          ? `Needs ${plural(count, "working day", "working days")}; ${left} left. Shorten it, or switch the extra days to Unpaid.`
          : clashReq
            ? `You have already asked for ${spanDates(dayOf(clashReq.from), dayOf(clashReq.to))}.`
            : count === 0
              ? "Only weekends and holidays — nothing to take."
              : null;

  const loading = (
    <div aria-busy="true" className="flex flex-col gap-4 p-4">
      <p className="sr-only">Loading the calendar.</p>
      <span className="h-20 rounded-3 bg-surface-2 motion-safe:animate-pulse" />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }, (_, i) => (
          <span
            key={i}
            className="h-8 rounded-2 bg-surface-2 motion-safe:animate-pulse"
            style={{ opacity: i % 7 >= 5 ? 0.5 : 1 }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--lp-tone" as string]: TONES[tone] }}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 basis-32">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[12px] text-ink-3">
            Fernworks studio · {plural(team.length, "teammate", "teammates")}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Kind of leave"
          className="flex shrink-0 rounded-full border border-hairline bg-surface-1 p-0.5"
        >
          {policies.map((p, i) => {
            const isOn = p.id === policy?.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={isOn}
                aria-disabled={disabled || undefined}
                tabIndex={isOn ? 0 : -1}
                onClick={() => setTypeTo(p.id)}
                onKeyDown={(event) => {
                  const dir =
                    event.key === "ArrowRight" || event.key === "ArrowDown"
                      ? 1
                      : event.key === "ArrowLeft" || event.key === "ArrowUp"
                        ? -1
                        : 0;
                  if (!dir) return;
                  event.preventDefault();
                  const next =
                    policies[(i + dir + policies.length) % policies.length];
                  if (!next) return;
                  setTypeTo(next.id);
                  const group = event.currentTarget.parentElement;
                  group
                    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                    [(i + dir + policies.length) % policies.length]?.focus();
                }}
                className={cn(
                  "relative inline-flex h-7 items-center rounded-full px-3 text-[12px] transition-colors",
                  isOn ? "text-foreground" : "text-ink-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                {isOn ? (
                  <motion.span
                    layoutId={`${uid}-type`}
                    aria-hidden
                    className="absolute inset-0 z-0 rounded-full border border-hairline-strong bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_14%,transparent)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative z-10">{p.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Arrow keys move between days, Page Up and Page Down between months.
        Enter sets the first day and then the last; Shift with an arrow extends
        the selection; Escape clears it.
      </p>

      {status === "error" ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The calendar did not load.</p>
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
      ) : status === "loading" ? (
        <div className="overflow-y-auto">{loading}</div>
      ) : (
        <div className="flex [scrollbar-width:thin] flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-3">
          {meter}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => shiftView(-1)}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <p className="min-w-0 truncate text-center text-[11px] text-ink-3 tabular-nums">
                {pending !== null
                  ? `From ${shortDate(pending)} — choose the last day`
                  : shownSpan
                    ? `${shortDate(shownSpan.from)} – ${shortDate(shownSpan.to)}`
                    : "Choose the first day off"}
              </p>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => shiftView(1)}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>
            <motion.div
              key={viewKey}
              className="flex gap-6"
              initial={
                viewMoved
                  ? { opacity: 0, x: motionSafe ? distances.step * viewDir : 0 }
                  : false
              }
              animate={{ opacity: 1, x: 0 }}
              transition={
                motionSafe
                  ? { x: springs.glide, opacity: { duration: durations.base } }
                  : { duration: durations.fast }
              }
            >
              {months.map((key, i) => monthGrid(key, i))}
            </motion.div>
          </div>
          {away}
        </div>
      )}

      <footer className="flex flex-col gap-2 border-t border-hairline bg-surface-1 px-4 py-2.5">
        <AnimatePresence initial={false}>
          {ready && problem ? (
            <motion.p
              key={problem}
              role="note"
              className="flex items-start gap-1.5 text-[12px] leading-snug text-foreground"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: durations.blink } }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <TriangleAlert
                aria-hidden
                className="mt-px size-3.5 shrink-0 text-warn"
              />
              {problem}
            </motion.p>
          ) : null}
        </AnimatePresence>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1 basis-48 text-[12px] leading-snug text-ink-2 tabular-nums">
            {committedSpan && pending === null ? (
              <>
                <span className="font-medium text-foreground">
                  {policy?.label}
                </span>{" "}
                · {shortDate(committedSpan.from)} –{" "}
                {shortDate(committedSpan.to)} ·{" "}
                {plural(count, "working day", "working days")}
              </>
            ) : (
              "Choose days on the calendar to request them."
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (disabled || (!committedSpan && pending === null)) return;
                setPending(null);
                setHover(null);
                commitRange(null);
              }}
              aria-disabled={
                disabled || (!committedSpan && pending === null) || undefined
              }
              className={cn(
                "inline-flex h-8 items-center rounded-2 px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-45",
                FOCUS_RING,
              )}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={request}
              aria-disabled={
                disabled ||
                !committedSpan ||
                pending !== null ||
                problem !== null ||
                undefined
              }
              className={cn(
                "inline-flex h-8 items-center rounded-2 bg-(--lp-tone) px-3.5 text-xs font-medium text-[oklch(0.22_0.02_258)] transition-opacity hover:opacity-90 aria-disabled:pointer-events-none aria-disabled:opacity-45",
                FOCUS_RING,
              )}
            >
              Request
            </button>
          </div>
        </div>
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
