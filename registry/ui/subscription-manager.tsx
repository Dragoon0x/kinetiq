"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowLeftRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type SubscriptionCalendar = "strip" | "month";
export type SubscriptionFrequency = "chips" | "slider";
export type SubscriptionSwap = "shelf" | "menu";
export type SubscriptionStatus = "ready" | "loading" | "error";
export type SubscriptionProductKind = "beans" | "tin" | "tea";

export type SubscriptionProduct = {
  id: string;
  name: string;
  /** "Whole bean · 250 g". */
  detail: string;
  price: number;
  /** The drawing: a coffee bag, a biscuit tin or a tea box. @default "beans" */
  kind?: SubscriptionProductKind;
  /** The packaging's colour, any CSS colour — pass a token, never a hex. */
  tint?: string;
};

export type SubscriptionPlan = {
  id: string;
  /** The shop. */
  merchant: string;
  /** The plan's name. */
  name: string;
  /** The next scheduled delivery, ms since the epoch. A cadence change keeps it and moves the rest. */
  anchor: number;
  /** Per box, waived over `freeShippingOver`. */
  shipping: number;
  /** "Waylight Pay ···· 4417". */
  payment: string;
  /** Days before a delivery that it is charged. @default 2 */
  chargeDaysBefore?: number;
};

export type SubscriptionValue = {
  /** Weeks between deliveries. */
  cadence: number;
  /** Skipped deliveries, as YYYY-MM-DD. */
  skipped: string[];
  /** Deliveries before this day (YYYY-MM-DD) are paused; null when running. */
  pausedUntil: string | null;
  /** Product ids in the next box, in slot order. */
  box: string[];
};

export type SubscriptionDelivery = {
  /** Its place in the schedule: the dot's identity. */
  k: number;
  /** Days since the epoch. */
  day: number;
  /** YYYY-MM-DD. */
  date: string;
  skipped: boolean;
  paused: boolean;
};

export type SubscriptionSchedule = {
  today: number;
  /** The last day shown. */
  end: number;
  deliveries: SubscriptionDelivery[];
  /** The next delivery that will ship, or null. */
  next: SubscriptionDelivery | null;
};

export type SubscriptionManagerProps = {
  /** How the schedule is drawn: a strip of days you drag, or month pages. @default "strip" */
  calendar?: SubscriptionCalendar;
  /** How the cadence is chosen: chips for the common cadences, or a detent slider that reshapes the dots live. @default "chips" */
  frequency?: SubscriptionFrequency;
  /** How the next box is changed: drag from a shelf of alternatives, or a Swap menu on each slot. @default "shelf" */
  swap?: SubscriptionSwap;
  /** The plan. @default defaultSubscriptionPlan */
  plan?: SubscriptionPlan;
  /** Everything that can go in a box. @default defaultSubscriptionProducts */
  products?: SubscriptionProduct[];
  /** Controlled cadence, skips, pause and box. */
  value?: SubscriptionValue;
  /** Initial value when uncontrolled. @default defaultSubscriptionValue */
  defaultValue?: SubscriptionValue;
  /** Fires from the press, drag or key that changed the plan. */
  onValueChange?: (value: SubscriptionValue) => void;
  /** A delivery was skipped (true) or brought back (false). */
  onSkip?: (date: string, skipped: boolean) => void;
  /** A slot's product was swapped. */
  onSwap?: (slot: number, fromId: string, toId: string) => void;
  /** Paused until a date (YYYY-MM-DD), or resumed (null). */
  onPause?: (until: string | null) => void;
  /** The cadence changed, in weeks. */
  onCadenceChange?: (weeks: number) => void;
  /** The chips' cadences, in weeks. @default [1, 2, 4] */
  cadences?: number[];
  /** The slider's longest cadence, in weeks. @default 8 */
  maxCadence?: number;
  /** Weeks of schedule shown. @default 10 */
  horizon?: number;
  /** Boxes at or over this ship free. @default 40 */
  freeShippingOver?: number;
  /** The manager's moment (Date or ms): today on the calendar, never the wall clock. @default defaultSubscriptionNow */
  now?: number | Date;
  /** Amounts to text. @default US dollars */
  formatPrice?: (amount: number) => string;
  /** The heading. @default "Subscription" */
  title?: string;
  /** Whether the plan has arrived. @default "ready" */
  status?: SubscriptionStatus;
  /** "Try again" was pressed after the plan failed to load. */
  onRetry?: () => void;
  /** The region's accessible name. @default the title */
  label?: string;
  /** Clicks for skips, detents and pauses, a swish when a swap lands or the dots travel. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only. @default false */
  disabled?: boolean;
  /** Classes for the root. It is at most 560px tall and scrolls inside itself. */
  className?: string;
};

/* -------------------------------- defaults ------------------------------- */

const DAY_MS = 86_400_000;

/** 2 October 2026, 09:00 UTC. */
export const defaultSubscriptionNow = Date.UTC(2026, 9, 2, 9, 0);

export const defaultSubscriptionPlan: SubscriptionPlan = {
  id: "fw-roasters-box",
  merchant: "Fernworks Coffee",
  name: "The Roaster's Box",
  anchor: Date.UTC(2026, 9, 8),
  shipping: 3.95,
  payment: "Waylight Pay ···· 4417",
  chargeDaysBefore: 2,
};

export const defaultSubscriptionProducts: SubscriptionProduct[] = [
  {
    id: "kiln",
    name: "Kiln Road Espresso",
    detail: "Whole bean · 250 g",
    price: 12.5,
    kind: "beans",
    tint: "var(--warn)",
  },
  {
    id: "harrow",
    name: "Harrow Valley Filter",
    detail: "Ground · 250 g",
    price: 11.5,
    kind: "beans",
    tint: "var(--accent-bright)",
  },
  {
    id: "shortbread",
    name: "Oat Shortbread",
    detail: "Tin of 12",
    price: 6.5,
    kind: "tin",
    tint: "var(--success)",
  },
  {
    id: "moorland",
    name: "Moorland Decaf",
    detail: "Whole bean · 250 g",
    price: 12,
    kind: "beans",
    tint: "var(--signal)",
  },
  {
    id: "ember",
    name: "Ember Dark Roast",
    detail: "Whole bean · 500 g",
    price: 21,
    kind: "beans",
    tint: "var(--danger)",
  },
  {
    id: "calder",
    name: "Calder Single Origin",
    detail: "Whole bean · 250 g",
    price: 14.5,
    kind: "beans",
    tint: "var(--ink-2)",
  },
  {
    id: "breakfast",
    name: "Breakfast Tea",
    detail: "40 bags",
    price: 7,
    kind: "tea",
    tint: "var(--warn)",
  },
];

export const defaultSubscriptionValue: SubscriptionValue = {
  cadence: 2,
  skipped: [],
  pausedUntil: null,
  box: ["kiln", "harrow", "shortbread"],
};

/* -------------------------------- helpers -------------------------------- */

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const MONTHS_LONG =
  "January February March April May June July August September October November December".split(
    " ",
  );
const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
/** Strip day column, px. */
const CELL = 30;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());
const dayOf = (ms: number) => Math.floor(ms / DAY_MS);
const isoOf = (day: number) =>
  new Date(day * DAY_MS).toISOString().slice(0, 10);
const dayOfIso = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? dayOf(t) : null;
};
const dayText = (day: number) => {
  const d = new Date(day * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""}, ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const shortText = (day: number) => {
  const d = new Date(day * DAY_MS);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const cadenceText = (weeks: number) =>
  weeks === 1 ? "Every week" : `Every ${weeks} weeks`;

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const usd = (v: number) => USD.format(v);

/**
 * The schedule a value gives: every `cadence` weeks from the plan's anchor
 * (rolled forward to today), each delivery keyed by its place `k`, with its
 * skip and pause marked, out to `horizon` weeks — and the next one that will
 * ship, looked for a year ahead.
 */
export function scheduleOf(
  plan: SubscriptionPlan,
  value: SubscriptionValue,
  now: number | Date,
  horizon = 10,
): SubscriptionSchedule {
  const today = dayOf(toMs(now));
  const step = Math.max(1, Math.round(value.cadence)) * 7;
  let anchor = dayOf(plan.anchor);
  while (anchor < today) anchor += step;
  const end = today + Math.max(2, Math.round(horizon)) * 7;
  const skipped = new Set(value.skipped);
  const pausedDay = value.pausedUntil ? dayOfIso(value.pausedUntil) : null;
  const deliveries: SubscriptionDelivery[] = [];
  let next: SubscriptionDelivery | null = null;
  for (let k = 0; k < 60; k += 1) {
    const day = anchor + k * step;
    if (day > today + 366) break;
    const date = isoOf(day);
    const d: SubscriptionDelivery = {
      k,
      day,
      date,
      skipped: skipped.has(date),
      paused: pausedDay !== null && day < pausedDay,
    };
    if (day <= end) deliveries.push(d);
    if (!next && !d.skipped && !d.paused) next = d;
    if (day > end && next) break;
  }
  return { today, end, deliveries, next };
}

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const PAPER = "oklch(from var(--ink) 0.97 0.01 h)";

/* ----------------------------- small pieces ------------------------------ */

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function RollDigit({
  digit,
  motionSafe,
}: {
  digit: number;
  motionSafe: boolean;
}) {
  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ height: "1em", lineHeight: 1 }}
    >
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-digit}em` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {DIGITS.map((n) => (
          <span key={n} style={{ height: "1em", lineHeight: 1 }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** A figure whose digits roll on snap, keyed from the right. */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = Array.from(text);
  return (
    <span className={cn("relative inline-flex tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span
        aria-hidden
        className="inline-flex"
        style={{ height: "1em", lineHeight: 1 }}
      >
        {chars.map((ch, i) => {
          const key = chars.length - i;
          return /\d/.test(ch) ? (
            <RollDigit
              key={`d${key}`}
              digit={Number(ch)}
              motionSafe={motionSafe}
            />
          ) : (
            <span key={`c${key}${ch}`} style={{ height: "1em", lineHeight: 1 }}>
              {ch}
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** Packaging drawn at a fixed lightness, so it reads the same in both themes. */
function ProductArt({
  product,
  className,
}: {
  product: SubscriptionProduct;
  className?: string;
}) {
  const tint = product.tint ?? "var(--accent-bright)";
  const body = `oklch(from ${tint} 0.7 0.11 h)`;
  const deep = `oklch(from ${tint} 0.5 0.1 h)`;
  const kind = product.kind ?? "beans";
  return (
    <svg aria-hidden viewBox="0 0 40 48" className={cn("shrink-0", className)}>
      {kind === "tin" ? (
        <>
          <rect
            x="6"
            y="14"
            width="28"
            height="28"
            rx="3"
            style={{ fill: body }}
          />
          <ellipse cx="20" cy="14" rx="14" ry="4.5" style={{ fill: deep }} />
          <rect
            x="10"
            y="24"
            width="20"
            height="9"
            rx="1.5"
            style={{ fill: PAPER }}
          />
          <circle cx="15" cy="28.5" r="2" style={{ fill: deep }} />
          <circle cx="20" cy="28.5" r="2" style={{ fill: deep }} />
          <circle cx="25" cy="28.5" r="2" style={{ fill: deep }} />
        </>
      ) : kind === "tea" ? (
        <>
          <rect
            x="7"
            y="12"
            width="26"
            height="31"
            rx="2"
            style={{ fill: body }}
          />
          <path d="M7 12 12 6h16l5 6Z" style={{ fill: deep }} />
          <rect
            x="11"
            y="20"
            width="18"
            height="12"
            rx="1.5"
            style={{ fill: PAPER }}
          />
          <path d="M20 22.5v5.5" stroke={deep} strokeWidth="1.2" />
          <rect
            x="17.5"
            y="27.5"
            width="5"
            height="3.5"
            rx="0.8"
            style={{ fill: deep }}
          />
        </>
      ) : (
        <>
          <path
            d="M9.5 10h21l2.6 32.4a2.4 2.4 0 0 1-2.4 2.6H9.3a2.4 2.4 0 0 1-2.4-2.6Z"
            style={{ fill: body }}
          />
          <path
            d="M9.5 10h21V6.2a1.2 1.2 0 0 0-1.2-1.2H10.7a1.2 1.2 0 0 0-1.2 1.2Z"
            style={{ fill: deep }}
          />
          <rect
            x="12.5"
            y="19"
            width="15"
            height="14"
            rx="1.5"
            style={{ fill: PAPER }}
          />
          <ellipse cx="20" cy="26" rx="3" ry="4.2" style={{ fill: deep }} />
          <path
            d="M20 22.2c-1.4 2.4-1.4 5.2 0 7.6"
            fill="none"
            stroke={PAPER}
            strokeWidth="0.9"
          />
        </>
      )}
    </svg>
  );
}

/** Arrow keys, Home and End over a radiogroup: selection follows focus. */
function radioKeys(
  event: React.KeyboardEvent,
  index: number,
  count: number,
  choose: (i: number) => void,
) {
  let to = -1;
  if (event.key === "ArrowRight" || event.key === "ArrowDown")
    to = (index + 1) % count;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
    to = (index - 1 + count) % count;
  else if (event.key === "Home") to = 0;
  else if (event.key === "End") to = count - 1;
  if (to === -1) return;
  event.preventDefault();
  choose(to);
  const group = (event.currentTarget as HTMLElement).closest(
    "[role='radiogroup']",
  );
  group?.querySelectorAll<HTMLElement>("[role='radio']")[to]?.focus();
}

/* ------------------------------- calendars ------------------------------- */

type CalendarProps = {
  uid: string;
  schedule: SubscriptionSchedule;
  /** The day deliveries resume, while paused. */
  pausedDay: number | null;
  /** Picking a resume day: the days become a radiogroup. */
  picking: boolean;
  /** The resume day being considered. */
  draftDay: number | null;
  onDraft: (day: number) => void;
  onPicked: (day: number) => void;
  onToggle: (d: SubscriptionDelivery, el: HTMLElement) => void;
  itemCount: number;
  motionSafe: boolean;
  disabled: boolean;
};

const deliveryName = (d: SubscriptionDelivery, items: number, next: boolean) =>
  `${dayText(d.day)}${next ? ", next box" : ""}, ${items} ${items === 1 ? "item" : "items"}, ${
    d.paused
      ? "paused"
      : d.skipped
        ? "skipped. Press to bring it back."
        : "Press to skip."
  }`;

function Dot({
  d,
  next,
  className,
}: {
  d: SubscriptionDelivery;
  next: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-3 items-center justify-center rounded-full transition-colors",
        d.paused
          ? "bg-ink-3/35"
          : d.skipped
            ? "border-[1.5px] border-ink-3 bg-transparent"
            : "bg-cobalt-bright",
        next && "ring-2 ring-cobalt-bright/35 ring-offset-1 ring-offset-card",
        className,
      )}
    >
      {d.skipped && !d.paused ? (
        <span className="absolute h-[1.5px] w-3.5 rotate-[-45deg] rounded-full bg-ink-3" />
      ) : null}
    </span>
  );
}

/** Roving focus over the dots: Left and Right walk deliveries, Home and End jump. */
function dotKeys(
  event: React.KeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key) || !container) return;
  const dots = [
    ...container.querySelectorAll<HTMLElement>("[data-sub-dot]"),
  ].filter((n) => n.offsetParent !== null);
  const i = dots.indexOf(event.currentTarget);
  if (i === -1) return;
  event.preventDefault();
  const to =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? dots.length - 1
        : clamp(i + (event.key === "ArrowRight" ? 1 : -1), 0, dots.length - 1);
  dots[to]?.focus();
}

/** Days in pick mode: Left and Right a day, Up and Down a week. */
function dayKeys(
  event: React.KeyboardEvent<HTMLElement>,
  day: number,
  first: number,
  last: number,
  onDraft: (day: number) => void,
  onPicked: (day: number) => void,
  focusDay: (day: number) => void,
) {
  let to: number | null = null;
  if (event.key === "ArrowRight") to = day + 1;
  else if (event.key === "ArrowLeft") to = day - 1;
  else if (event.key === "ArrowDown") to = day + 7;
  else if (event.key === "ArrowUp") to = day - 7;
  else if (event.key === "Home") to = first;
  else if (event.key === "End") to = last;
  else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onPicked(day);
    return;
  }
  if (to === null) return;
  event.preventDefault();
  const next = clamp(to, first, last);
  onDraft(next);
  focusDay(next);
}

function CalendarStrip({
  uid,
  schedule,
  pausedDay,
  picking,
  draftDay,
  onDraft,
  onPicked,
  onToggle,
  itemCount,
  motionSafe,
  disabled,
}: CalendarProps) {
  const { today, end, deliveries, next } = schedule;
  const days = end - today + 1;
  const stopK =
    next && deliveries.some((d) => d.k === next.k) ? next.k : deliveries[0]?.k;
  const contentW = days * CELL;
  const x = useMotionValue(0);
  const [viewport, setViewport] = React.useState<HTMLDivElement | null>(null);
  const [vw, setVw] = React.useState(0);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const start = React.useRef(0);
  const minX = Math.min(0, r2(vw - contentW));
  const bounds = React.useRef({ minX, vw });
  const floor = useMotionValue(minX);
  React.useEffect(() => {
    bounds.current = { minX, vw };
    floor.set(minX);
  });

  React.useEffect(() => {
    if (!viewport) return;
    const ro = new ResizeObserver(() => setVw(r2(viewport.clientWidth)));
    ro.observe(viewport);
    const onWheel = (event: WheelEvent) => {
      const across =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
      if (!across) return;
      event.preventDefault();
      anim.current?.stop();
      const delta = event.deltaX || event.deltaY;
      x.set(r2(clamp(x.get() - delta, bounds.current.minX, 0)));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      viewport.removeEventListener("wheel", onWheel);
      anim.current?.stop();
    };
  }, [viewport, x]);

  // A narrower strip (or a shorter horizon) keeps the strip in bounds.
  React.useEffect(() => {
    const v = x.get();
    if (v < minX || v > 0) x.jump(clamp(v, minX, 0));
  }, [minX, x]);

  const reveal = (day: number) => {
    const { minX: lo, vw: width } = bounds.current;
    if (!width) return;
    const left = (day - today) * CELL + x.get();
    let target: number | null = null;
    // Clear of the edge fades, so a revealed day reads whole.
    const edge = 28;
    if (left < edge) target = -(day - today) * CELL + edge;
    else if (left + CELL > width - edge)
      target = width - edge - (day - today + 1) * CELL;
    if (target === null) return;
    const to = r2(clamp(target, lo, 0));
    anim.current?.stop();
    if (!motionSafe) x.jump(to);
    else anim.current = animate(x, to, springs.glide);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    onStart: () => {
      anim.current?.stop();
      start.current = x.get();
    },
    onMove: ({ offset }) => {
      const { minX: lo, vw: width } = bounds.current;
      x.set(r2(rubberClamp(start.current + offset.x, lo, 0, width || 300)));
    },
    onEnd: ({ velocity }) => {
      const { minX: lo } = bounds.current;
      const to = r2(
        clamp(project(x.get(), motionSafe ? velocity.x : 0, 0.998), lo, 0),
      );
      anim.current?.stop();
      anim.current = motionSafe
        ? animate(x, to, { ...springs.glide, velocity: velocity.x })
        : animate(x, to, { duration: 0 });
    },
    onCancel: () => {
      const { minX: lo } = bounds.current;
      anim.current = animate(x, clamp(x.get(), lo, 0), springs.glide);
    },
  });

  // When the next box moves (a skip, a pause), the strip glides to show it.
  const nextDay = next?.day ?? null;
  const shownNext = React.useRef(nextDay);
  React.useEffect(() => {
    if (shownNext.current === nextDay) return;
    shownNext.current = nextDay;
    if (nextDay !== null && nextDay <= end) reveal(nextDay);
    // reveal reads the strip's bounds from a ref; only the day matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextDay, end]);

  const leftFade = useTransform(x, (v) => (v < -2 ? 1 : 0));
  const rightFade = useTransform([x, floor], ([v = 0, lo = 0]: number[]) =>
    v > lo + 2 ? 1 : 0,
  );

  const months: { day: number; label: string }[] = [];
  for (let d = today; d <= end; d += 1) {
    const date = new Date(d * DAY_MS);
    if (d === today || date.getUTCDate() === 1) {
      months.push({ day: d, label: MONTHS[date.getUTCMonth()] ?? "" });
    }
  }

  const bandEnd = picking && draftDay !== null ? draftDay : pausedDay;
  const bandW = bandEnd !== null ? Math.max(0, (bandEnd - today) * CELL) : 0;
  const offset = (day: number) => (day - today) * CELL;
  const first = today + 1;
  const focusDay = (day: number) => {
    reveal(day);
    viewport
      ?.querySelector<HTMLElement>(`[data-sub-day="${day}"]`)
      ?.focus({ preventScroll: true });
  };
  const draft = draftDay ?? null;

  return (
    <div className="relative">
      <div
        ref={setViewport}
        {...drag}
        // Clipped, not hidden: a hidden box is still a scroll container,
        // and focusing a day off to the side would scroll it under the
        // strip's own offset.
        className="relative touch-pan-y overflow-clip select-none"
      >
        <motion.div className="relative" style={{ x, width: contentW }}>
          <div aria-hidden className="relative h-4">
            {months.map((m) => (
              <span
                key={m.day}
                className="absolute top-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
                style={{ left: offset(m.day) + 4 }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div
            role={picking ? "radiogroup" : undefined}
            aria-label={picking ? "Resume deliveries on" : undefined}
            aria-hidden={picking ? undefined : true}
            className="flex h-11"
          >
            {Array.from({ length: days }, (_, i) => {
              const day = today + i;
              const date = new Date(day * DAY_MS);
              const isToday = day === today;
              const weekday = (WEEKDAYS[date.getUTCDay()] ?? "").charAt(0);
              const inner = (
                <>
                  <span className="text-[10px] leading-none text-ink-3">
                    {weekday}
                  </span>
                  <span
                    className={cn(
                      "mt-1 font-mono text-[12px] leading-none tabular-nums",
                      isToday ? "text-cobalt-bright" : "text-ink-2",
                    )}
                  >
                    {date.getUTCDate()}
                  </span>
                </>
              );
              if (picking && day >= first) {
                const on = draft === day;
                return (
                  <button
                    key={day}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={dayText(day)}
                    data-sub-day={day}
                    tabIndex={on || (draft === null && day === first) ? 0 : -1}
                    onClick={() => onPicked(day)}
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") onDraft(day);
                    }}
                    onFocus={() => reveal(day)}
                    onKeyDown={(event) =>
                      dayKeys(
                        event,
                        day,
                        first,
                        end,
                        onDraft,
                        onPicked,
                        focusDay,
                      )
                    }
                    className={cn(
                      "flex h-full shrink-0 flex-col items-center justify-center rounded-2 transition-colors",
                      on ? "bg-warn/15" : "hover:bg-surface-2",
                      RING_IN,
                    )}
                    style={{ width: CELL }}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <span
                  key={day}
                  className={cn(
                    "flex h-full shrink-0 flex-col items-center justify-center rounded-2",
                    isToday && "bg-cobalt-wash",
                    picking && "opacity-50",
                  )}
                  style={{ width: CELL }}
                >
                  {inner}
                </span>
              );
            })}
          </div>
          <div className="relative h-8">
            <AnimatePresence initial={false}>
              {bandEnd !== null && bandW > 0 ? (
                <motion.span
                  key="band"
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 bottom-1.5 left-0 rounded-full border",
                    picking ? "border-dashed border-warn/70" : "border-warn/40",
                  )}
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(135deg, color-mix(in oklab, var(--warn) 24%, transparent) 0 4px, transparent 4px 8px)",
                  }}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: bandW, opacity: 1 }}
                  exit={{
                    width: 0,
                    opacity: 0,
                    transition: exitFor(durations.slow),
                  }}
                  transition={
                    motionSafe
                      ? {
                          width: springs.glide,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: 0 }
                  }
                />
              ) : null}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {deliveries.map((d) => {
                const isNext = next?.k === d.k;
                return (
                  <motion.button
                    key={d.k}
                    type="button"
                    data-sub-dot=""
                    aria-label={deliveryName(d, itemCount, isNext)}
                    aria-pressed={d.skipped}
                    aria-disabled={d.paused || disabled || picking || undefined}
                    tabIndex={d.k === stopK ? 0 : -1}
                    onClick={(event) => {
                      if (d.paused || disabled || picking) return;
                      onToggle(d, event.currentTarget);
                    }}
                    onFocus={() => reveal(d.day)}
                    onKeyDown={(event) => dotKeys(event, viewport)}
                    className={cn(
                      "absolute top-0 left-0 flex size-8 items-center justify-center rounded-full",
                      !d.paused && !picking && "hover:bg-surface-2",
                      RING_IN,
                    )}
                    initial={{
                      opacity: 0,
                      scale: 0.6,
                      x: offset(d.day) + CELL / 2 - 16,
                    }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      x: offset(d.day) + CELL / 2 - 16,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.6,
                      transition: exitFor(durations.base),
                    }}
                    transition={
                      motionSafe
                        ? {
                            x: springs.glide,
                            scale: springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: 0 }
                    }
                  >
                    <Dot d={d} next={isNext} />
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
          <div aria-hidden className="relative h-4">
            {next && next.day <= end ? (
              <motion.span
                className="pointer-events-none absolute top-0 left-0 inline-flex h-4 w-[30px] items-center justify-center rounded-full bg-cobalt-bright font-mono text-[9px] leading-none tracking-[0.06em] text-primary-foreground uppercase"
                initial={false}
                animate={{ x: offset(next.day) + CELL / 2 - 15 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                Next
              </motion.span>
            ) : null}
          </div>
        </motion.div>
      </div>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-card to-transparent"
        style={{ opacity: leftFade }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-card to-transparent"
        style={{ opacity: rightFade }}
      />
      <span id={`${uid}-strip-hint`} className="sr-only">
        Drag the strip or use Left and Right to move between deliveries.
      </span>
    </div>
  );
}

function MonthGrid({
  year,
  month,
  uid,
  schedule,
  pausedDay,
  picking,
  draftDay,
  onDraft,
  onPicked,
  onToggle,
  itemCount,
  motionSafe,
  disabled,
  container,
}: CalendarProps & {
  year: number;
  month: number;
  container: HTMLElement | null;
}) {
  const { today, end, next } = schedule;
  const firstDay = dayOf(Date.UTC(year, month, 1));
  const lastDay = dayOf(Date.UTC(year, month + 1, 1)) - 1;
  // Weeks start on Monday.
  const lead = (new Date(firstDay * DAY_MS).getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: lastDay - firstDay + 1 }, (_, i) => firstDay + i),
  ];
  while (cells.length % 7) cells.push(null);
  const byDay = new Map(schedule.deliveries.map((d) => [d.day, d]));
  const here = schedule.deliveries.filter(
    (d) => d.day >= firstDay && d.day <= lastDay,
  );
  const stopK = next && here.some((d) => d.k === next.k) ? next.k : here[0]?.k;
  const bandEnd = picking && draftDay !== null ? draftDay : pausedDay;
  const pick0 = today + 1;
  const focusDay = (day: number) =>
    container
      ?.querySelector<HTMLElement>(`[data-sub-day="${day}"]`)
      ?.focus({ preventScroll: true });

  return (
    <div className="min-w-0">
      <p className="mb-1.5 flex h-7 items-center text-[12px] font-medium text-foreground">
        {MONTHS_LONG[month]} {year}
      </p>
      <div aria-hidden className="grid grid-cols-7 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
          <span key={i} className="pb-1 text-[10px] text-ink-3">
            {w}
          </span>
        ))}
      </div>
      <div
        role={picking ? "radiogroup" : "group"}
        aria-label={
          picking
            ? `Resume deliveries on, ${MONTHS_LONG[month]}`
            : `${MONTHS_LONG[month]} ${year} deliveries`
        }
        className="grid grid-cols-7"
      >
        {cells.map((day, i) => {
          if (day === null)
            return <span key={`b${i}`} aria-hidden className="h-10" />;
          const d = byDay.get(day);
          const past = day < today;
          const inBand = bandEnd !== null && day >= today && day < bandEnd;
          const isNext = !!d && next?.k === d.k;
          const date = new Date(day * DAY_MS).getUTCDate();
          const face = (
            <>
              <span
                className={cn(
                  "font-mono text-[12px] leading-none tabular-nums",
                  day === today
                    ? "font-semibold text-cobalt-bright"
                    : past || day > end
                      ? "text-ink-3/60"
                      : "text-ink-2",
                )}
              >
                {date}
              </span>
              <span className="flex h-3 items-center justify-center">
                {d ? (
                  <motion.span
                    layoutId={motionSafe ? `${uid}-dot-${d.k}` : undefined}
                    transition={springs.glide}
                    className="flex"
                  >
                    <Dot d={d} next={isNext} className="size-2.5" />
                  </motion.span>
                ) : null}
              </span>
            </>
          );
          const band = inBand ? (
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 inset-y-1",
                picking ? "bg-warn/10" : "bg-warn/15",
              )}
            />
          ) : null;
          if (picking && day >= pick0 && day <= end) {
            const on = draftDay === day;
            return (
              <button
                key={day}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={dayText(day)}
                data-sub-day={day}
                tabIndex={on || (draftDay === null && day === pick0) ? 0 : -1}
                onClick={() => onPicked(day)}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") onDraft(day);
                }}
                onKeyDown={(event) =>
                  dayKeys(event, day, pick0, end, onDraft, onPicked, focusDay)
                }
                className={cn(
                  "relative flex h-10 flex-col items-center justify-center gap-1 rounded-2",
                  on ? "bg-warn/20" : "hover:bg-surface-2",
                  RING_IN,
                )}
              >
                {band}
                <span className="relative flex flex-col items-center gap-1">
                  {face}
                </span>
              </button>
            );
          }
          if (d && !picking) {
            return (
              <button
                key={day}
                type="button"
                data-sub-dot=""
                aria-label={deliveryName(d, itemCount, isNext)}
                aria-pressed={d.skipped}
                aria-disabled={d.paused || disabled || undefined}
                tabIndex={d.k === stopK ? 0 : -1}
                onClick={(event) => {
                  if (d.paused || disabled) return;
                  onToggle(d, event.currentTarget);
                }}
                onKeyDown={(event) => dotKeys(event, container)}
                className={cn(
                  "relative flex h-10 flex-col items-center justify-center gap-1 rounded-2",
                  !d.paused && "hover:bg-surface-2",
                  RING_IN,
                )}
              >
                {band}
                <span className="relative flex flex-col items-center gap-1">
                  {face}
                </span>
              </button>
            );
          }
          return (
            <span
              key={day}
              className={cn(
                "relative flex h-10 flex-col items-center justify-center gap-1",
                picking && "opacity-50",
              )}
            >
              {band}
              <span className="relative flex flex-col items-center gap-1">
                {face}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CalendarMonth(props: CalendarProps) {
  const { schedule, motionSafe } = props;
  const [box, setBox] = React.useState<HTMLDivElement | null>(null);
  const t0 = new Date(schedule.today * DAY_MS);
  const y0 = t0.getUTCFullYear();
  const m0 = t0.getUTCMonth();
  const tEnd = new Date(schedule.end * DAY_MS);
  const span = (tEnd.getUTCFullYear() - y0) * 12 + tEnd.getUTCMonth() - m0;
  const [page, setPage] = React.useState({ at: 0, dir: 1 });
  const at = clamp(page.at, 0, Math.max(0, span));
  const monthAt = (n: number) => {
    const m = m0 + n;
    return { year: y0 + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
  };
  const a = monthAt(at);
  const b = monthAt(at + 1);
  const turn = (d: number) =>
    setPage({ at: clamp(at + d, 0, Math.max(0, span)), dir: d });

  return (
    <div ref={setBox} className="relative">
      <div className="absolute top-0 right-0 z-10 flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous month"
          aria-disabled={at <= 0 || undefined}
          onClick={() => {
            if (at > 0) turn(-1);
          }}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40",
            RING,
          )}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Next month"
          aria-disabled={at >= span || undefined}
          onClick={() => {
            if (at < span) turn(1);
          }}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40",
            RING,
          )}
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
      <div className="relative overflow-clip">
        <AnimatePresence initial={false} mode="popLayout" custom={page.dir}>
          <motion.div
            key={at}
            custom={page.dir}
            variants={{
              enter: (d: number) => ({
                opacity: 0,
                x: motionSafe ? distances.shift * d : 0,
              }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({
                opacity: 0,
                x: motionSafe ? -distances.shift * d : 0,
                transition: exitFor(durations.base),
              }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={
              motionSafe
                ? { x: springs.glide, opacity: { duration: durations.base } }
                : { duration: durations.fast }
            }
            className="grid gap-5 @min-[40rem]:grid-cols-2"
          >
            <MonthGrid
              {...props}
              year={a.year}
              month={a.month}
              container={box}
            />
            <div className="hidden @min-[40rem]:block">
              <MonthGrid
                {...props}
                year={b.year}
                month={b.month}
                container={box}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------- frequency ------------------------------- */

function CadenceChips({
  uid,
  cadences,
  value,
  onChoose,
  labelledBy,
  motionSafe,
  disabled,
}: {
  uid: string;
  cadences: number[];
  value: number;
  onChoose: (weeks: number, el: HTMLElement) => void;
  labelledBy: string;
  motionSafe: boolean;
  disabled: boolean;
}) {
  const chosen = cadences.indexOf(value);
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="relative grid auto-cols-fr grid-flow-col rounded-full border border-hairline bg-surface-1 p-0.5"
    >
      {cadences.map((w, i) => {
        const on = w === value;
        return (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={disabled || undefined}
            tabIndex={on || (chosen === -1 && i === 0) ? 0 : -1}
            onClick={(event) => {
              if (!disabled) onChoose(w, event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (disabled) return;
              radioKeys(event, i, cadences.length, (to) => {
                const next = cadences[to];
                if (next !== undefined) onChoose(next, event.currentTarget);
              });
            }}
            className={cn(
              "relative h-8 rounded-full px-2 text-[12px] whitespace-nowrap transition-colors",
              on
                ? "text-primary-foreground"
                : "text-ink-2 hover:text-foreground",
              RING,
            )}
          >
            {on ? (
              <motion.span
                aria-hidden
                layoutId={motionSafe ? `${uid}-cadence` : undefined}
                transition={springs.snap}
                className="absolute inset-0 rounded-full bg-cobalt-bright"
              />
            ) : null}
            <span className="relative">
              {w === 1 ? "Weekly" : `${w} weeks`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CadenceSlider({
  value,
  max,
  onChange,
  onDetent,
  labelledBy,
  motionSafe,
  disabled,
}: {
  value: number;
  max: number;
  onChange: (weeks: number) => void;
  onDetent: (weeks: number) => void;
  labelledBy: string;
  motionSafe: boolean;
  disabled: boolean;
}) {
  const min = 1;
  const top = Math.max(min + 1, Math.round(max));
  const [track, setTrack] = React.useState<HTMLDivElement | null>(null);
  const [w, setW] = React.useState(0);
  const thumb = useMotionValue(0);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef<{ start: number; last: number } | null>(null);
  const widthRef = React.useRef(0);
  const pos = React.useCallback(
    (v: number, width: number) => r2(((v - min) / (top - min)) * width),
    [top],
  );

  React.useEffect(() => {
    if (!track) return;
    const ro = new ResizeObserver(() => {
      const width = r2(track.clientWidth);
      widthRef.current = width;
      setW(width);
    });
    ro.observe(track);
    return () => ro.disconnect();
  }, [track]);

  // The thumb goes where the value is, unless a hand is holding it.
  React.useEffect(() => {
    if (dragging.current || !w) return;
    anim.current?.stop();
    const to = pos(value, w);
    if (!motionSafe || thumb.get() === 0) thumb.jump(to);
    else anim.current = animate(thumb, to, springs.snap);
    return () => anim.current?.stop();
  }, [value, w, motionSafe, pos, thumb]);

  const valueAt = (px: number, width: number) =>
    clamp(Math.round(min + (px / Math.max(1, width)) * (top - min)), min, top);

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      anim.current?.stop();
      dragging.current = { start: thumb.get(), last: value };
    },
    onMove: ({ offset }) => {
      const g = dragging.current;
      const width = widthRef.current;
      if (!g || !width) return;
      const raw = g.start + offset.x;
      thumb.set(r2(rubberClamp(raw, 0, width, 40)));
      const v = valueAt(raw, width);
      if (v !== g.last) {
        g.last = v;
        onDetent(v);
        onChange(v);
      }
    },
    onEnd: ({ velocity }) => {
      const g = dragging.current;
      dragging.current = null;
      const width = widthRef.current;
      if (!g || !width) return;
      const v = valueAt(project(thumb.get(), velocity.x, 0.99), width);
      if (v !== g.last) {
        onDetent(v);
        onChange(v);
      }
      anim.current = motionSafe
        ? animate(thumb, pos(v, width), {
            ...springs.snap,
            velocity: velocity.x,
          })
        : animate(thumb, pos(v, width), { duration: 0 });
    },
    onCancel: () => {
      dragging.current = null;
      anim.current = animate(thumb, pos(value, widthRef.current), springs.snap);
    },
    onTap: (event) => {
      const width = widthRef.current;
      if (!track || !width) return;
      const rect = track.getBoundingClientRect();
      const v = valueAt(event.clientX - rect.left, width);
      if (v === value) return;
      onDetent(v);
      onChange(v);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let v = value;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") v += 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") v -= 1;
    else if (event.key === "PageUp") v += 2;
    else if (event.key === "PageDown") v -= 2;
    else if (event.key === "Home") v = min;
    else if (event.key === "End") v = top;
    else return;
    event.preventDefault();
    v = clamp(v, min, top);
    if (v === value) return;
    onDetent(v);
    onChange(v);
  };

  const fill = useTransform(thumb, (t) => Math.max(0, r2(t)));
  const ticks = Array.from({ length: top - min + 1 }, (_, i) => min + i);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        {...drag}
        className={cn(
          "relative h-8 touch-pan-y select-none",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <div
          ref={setTrack}
          className="absolute inset-x-2.5 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-2"
        >
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
            style={{ width: fill }}
          />
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-ink-3/40"
              style={{ left: `${r2(((t - min) / (top - min)) * 100)}%` }}
            />
          ))}
          <motion.div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-labelledby={labelledBy}
            aria-valuemin={min}
            aria-valuemax={top}
            aria-valuenow={value}
            aria-valuetext={cadenceText(value)}
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown}
            className={cn(
              "absolute top-1/2 left-0 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cobalt-bright bg-card shadow-[0_1px_4px_color-mix(in_oklab,black_18%,transparent)]",
              RING,
            )}
            style={{ x: thumb }}
          />
        </div>
      </div>
      <div aria-hidden className="relative mx-2.5 h-3">
        {ticks.map((t) => (
          <span
            key={t}
            className={cn(
              "absolute -translate-x-1/2 font-mono text-[10px] leading-none tabular-nums",
              t === value ? "text-cobalt-bright" : "text-ink-3",
            )}
            style={{ left: `${r2(((t - min) / (top - min)) * 100)}%` }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- swaps --------------------------------- */

type Flights = React.RefObject<Map<string, DOMRect>>;

/**
 * Flies a product in from where it was before the swap: measured on arrival,
 * offset back to its old box and released on glide. A StrictMode re-run
 * starts the flight again rather than leaving the tile stranded part-way.
 */
function useFlight(
  id: string,
  node: HTMLElement | null,
  flights: Flights,
  motionSafe: boolean,
) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  React.useLayoutEffect(() => {
    if (!node) return;
    const from = flights.current.get(id);
    if (!from) return;
    if (!motionSafe) {
      flights.current.delete(id);
      return;
    }
    const to = node.getBoundingClientRect();
    x.jump(r2(from.left - to.left));
    y.jump(r2(from.top - to.top));
    const ax = animate(x, 0, springs.glide);
    const ay = animate(y, 0, {
      ...springs.glide,
      onComplete: () => flights.current.delete(id),
    });
    return () => {
      ax.stop();
      ay.stop();
      x.jump(0);
      y.jump(0);
    };
  }, [id, node, flights, motionSafe, x, y]);
  return { x, y };
}

function BoxTile({
  product,
  flights,
  motionSafe,
}: {
  product: SubscriptionProduct;
  flights: Flights;
  motionSafe: boolean;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const { x, y } = useFlight(product.id, node, flights, motionSafe);
  return (
    <motion.div
      ref={setNode}
      className="flex min-w-0 flex-1 items-center gap-2.5"
      style={{ x, y }}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2 bg-surface-2">
        <ProductArt product={product} className="h-9 w-8" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          title={product.name}
          className="block truncate text-[13px] font-medium text-foreground"
        >
          {product.name}
        </span>
        <span
          title={product.detail}
          className="block truncate text-[11px] text-ink-3"
        >
          {product.detail}
        </span>
      </span>
    </motion.div>
  );
}

function ShelfItem({
  product,
  held,
  flights,
  motionSafe,
  disabled,
  onPress,
  onDragMove,
  onDrop,
  bind,
}: {
  product: SubscriptionProduct;
  held: boolean;
  flights: Flights;
  motionSafe: boolean;
  disabled: boolean;
  onPress: (el: HTMLElement, via: "pointer" | "key") => void;
  onDragMove: (x: number, y: number) => void;
  /** Returns whether the drop landed on a slot. */
  onDrop: (x: number, y: number, el: HTMLElement) => boolean;
  bind: (node: HTMLButtonElement | null) => void;
}) {
  const [node, setNode] = React.useState<HTMLButtonElement | null>(null);
  // A motion element binds its ref once: one stable callback, which reads
  // the latest `bind` when it runs.
  const binder = React.useRef(bind);
  React.useEffect(() => {
    binder.current = bind;
  });
  const attach = React.useCallback((n: HTMLButtonElement | null) => {
    setNode(n);
    binder.current(n);
  }, []);
  const flight = useFlight(product.id, node, flights, motionSafe);
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const lift = useMotionValue(0);
  const [dragging, setDragging] = React.useState(false);
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const x = useTransform([flight.x, dx], ([a = 0, b = 0]: number[]) => a + b);
  const y = useTransform([flight.y, dy], ([a = 0, b = 0]: number[]) => a + b);
  const scale = useTransform(lift, (l) => r2(1 + 0.05 * l));
  const shadow = useTransform(lift, (l) =>
    l < 0.02
      ? "none"
      : `0 ${r2(10 * l)}px ${r2(24 * l)}px color-mix(in oklab, black ${Math.round(20 * l)}%, transparent)`,
  );

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const a of running) a.stop();
    };
  }, []);

  const drag = useDrag({
    threshold: 5,
    disabled,
    onStart: () => {
      for (const a of anims.current) a.stop();
      setDragging(true);
      if (motionSafe) anims.current = [animate(lift, 1, springs.flick)];
      else lift.jump(1);
    },
    onMove: ({ offset, point }) => {
      dx.set(r2(offset.x));
      dy.set(r2(offset.y));
      onDragMove(point.x, point.y);
    },
    onEnd: ({ point, velocity, event }) => {
      setDragging(false);
      const el = event.currentTarget as HTMLElement | null;
      const landed = el ? onDrop(point.x, point.y, el) : false;
      if (landed) return;
      const back = motionSafe ? springs.glide : { duration: 0 };
      anims.current = [
        animate(dx, 0, { ...back, velocity: velocity.x }),
        animate(dy, 0, { ...back, velocity: velocity.y }),
        animate(lift, 0, back),
      ];
    },
    onCancel: () => {
      setDragging(false);
      onDragMove(-1, -1);
      dx.jump(0);
      dy.jump(0);
      lift.jump(0);
    },
    onTap: (event) => onPress(event.currentTarget as HTMLElement, "pointer"),
  });

  return (
    <motion.button
      ref={attach}
      type="button"
      aria-pressed={held}
      aria-disabled={disabled || undefined}
      {...drag}
      onClick={(event) => {
        // Pointer presses arrive through the drag's tap; a click with no
        // pointer behind it is Space or Enter.
        if (event.detail === 0) onPress(event.currentTarget, "key");
      }}
      className={cn(
        "relative flex w-full touch-none items-center gap-2.5 rounded-3 border p-2 text-left transition-colors select-none",
        held
          ? "border-cobalt-bright bg-cobalt-wash"
          : "border-hairline bg-card hover:bg-surface-2",
        dragging ? "z-30 cursor-grabbing" : "cursor-grab",
        RING,
      )}
      style={{ x, y, scale, boxShadow: shadow }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-2 bg-surface-2">
        <ProductArt product={product} className="h-8 w-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[12px] leading-tight font-medium text-foreground">
          {product.name}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-3 tabular-nums">
          {usd(product.price)}
        </span>
      </span>
    </motion.button>
  );
}

/* ------------------------------- the manager ----------------------------- */

type Said = { n: number; text: string };
type Held = { id: string; via: "pointer" | "key" };
type Menu = { slot: number; active: number };

/**
 * A subscription you can push around. Every upcoming delivery is a dot keyed
 * by its place in the schedule, so skipping, pausing and changing the cadence
 * all move the same dots: a skipped dot hollows and the Next flag slides on
 * snap to the delivery that will ship; a new cadence keeps the next box where
 * it is and sends every later dot to its new day on glide; a pause draws a
 * hatched band across the days it covers. The strip drags 1:1, rubber-bands
 * and coasts on glide; the month view turns its pages by direction.
 *
 * The next box swaps by hand: drag a coffee off the shelf onto a slot and the
 * two trade places, each flying from where it was on glide — or pick one up
 * with Enter, choose a slot with the arrows and drop it with Enter. Every dot
 * is a toggle button, the cadence a radiogroup or a slider, and every change
 * is announced. Under reduced motion dots jump to their days, the band
 * appears whole and swaps happen in place, and every state still shows.
 */
export function SubscriptionManager({
  calendar = "strip",
  frequency = "chips",
  swap = "shelf",
  plan = defaultSubscriptionPlan,
  products = defaultSubscriptionProducts,
  value,
  defaultValue = defaultSubscriptionValue,
  onValueChange,
  onSkip,
  onSwap,
  onPause,
  onCadenceChange,
  cadences = [1, 2, 4],
  maxCadence = 8,
  horizon = 10,
  freeShippingOver = 40,
  now = defaultSubscriptionNow,
  formatPrice = usd,
  title = "Subscription",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: SubscriptionManagerProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const [own, setOwn] = React.useState<SubscriptionValue>(defaultValue);
  const current = value ?? own;
  const schedule = scheduleOf(plan, current, now, horizon);
  const { today, next } = schedule;
  const byId = new Map(products.map((p) => [p.id, p]));
  const box = current.box
    .map((id) => byId.get(id))
    .filter((p): p is SubscriptionProduct => !!p);
  const shelf = products.filter((p) => !current.box.includes(p.id));
  const subtotal = box.reduce((s, p) => s + p.price, 0);
  const shipping =
    subtotal >= freeShippingOver || box.length === 0 ? 0 : plan.shipping;
  const total = Math.round((subtotal + shipping) * 100) / 100;
  const pausedDay = current.pausedUntil ? dayOfIso(current.pausedUntil) : null;
  const paused = pausedDay !== null && pausedDay > today;
  const chargeDay = next ? next.day - (plan.chargeDaysBefore ?? 2) : null;

  const [pauseOpen, setPauseOpen] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [draftDay, setDraftDay] = React.useState<number | null>(null);
  const [held, setHeld] = React.useState<Held | null>(null);
  const [target, setTarget] = React.useState<number | null>(null);
  const [menu, setMenu] = React.useState<Menu | null>(null);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const calendarRef = React.useRef<HTMLDivElement | null>(null);
  const slots = React.useRef(new Map<string, HTMLElement>());
  const shelfNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const swapButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const flights = React.useRef(new Map<string, DOMRect>());
  const focusAfter = React.useRef<string | null>(null);

  const click = (pitch: number, el?: Element | null, gain = 0.45) => {
    const rect = el?.getBoundingClientRect();
    audio.play("click", {
      pitch,
      gain,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };
  const swish = (el?: Element | null, pitch = 1) => {
    const rect = el?.getBoundingClientRect();
    audio.play("swish", {
      pitch,
      gain: 0.45,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  const update = (next: SubscriptionValue) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /* -------------------------------- skips -------------------------------- */

  const toggleSkip = (d: SubscriptionDelivery, el: HTMLElement | null) => {
    if (disabled || d.paused) return;
    const skipping = !d.skipped;
    const skipped = skipping
      ? [...current.skipped, d.date]
      : current.skipped.filter((s) => s !== d.date);
    const after: SubscriptionValue = { ...current, skipped };
    const upcoming = scheduleOf(plan, after, now, horizon).next;
    click(skipping ? 0.9 : 1.15, el);
    update(after);
    onSkip?.(d.date, skipping);
    say(
      `${dayText(d.day)} ${skipping ? "skipped" : "back on"}. ${
        upcoming ? `Next box ${dayText(upcoming.day)}.` : "No box is scheduled."
      }`,
    );
  };

  /* ------------------------------- cadence ------------------------------- */

  const setCadence = (weeks: number, el: HTMLElement | null, quiet = false) => {
    const w = clamp(Math.round(weeks), 1, Math.max(1, Math.round(maxCadence)));
    if (disabled || w === current.cadence) return;
    const trial: SubscriptionValue = { ...current, cadence: w };
    const onSchedule = new Set(
      scheduleOf(plan, { ...trial, skipped: [] }, now, 52).deliveries.map(
        (d) => d.date,
      ),
    );
    const after: SubscriptionValue = {
      ...trial,
      skipped: current.skipped.filter((s) => onSchedule.has(s)),
    };
    if (!quiet) swish(el, w > current.cadence ? 0.9 : 1.1);
    update(after);
    onCadenceChange?.(w);
    const s = scheduleOf(plan, after, now, horizon);
    const second = s.deliveries.find(
      (d) => s.next && d.day > s.next.day && !d.skipped && !d.paused,
    );
    say(
      `${cadenceText(w)}. ${
        s.next ? `Next box stays ${dayText(s.next.day)}` : "No box is scheduled"
      }${second ? `, then ${shortText(second.day)}.` : "."}`,
    );
  };

  /* -------------------------------- pause -------------------------------- */

  const quick = [
    { id: "2w", label: "2 weeks", day: today + 14 },
    { id: "1m", label: "1 month", day: today + 28 },
    { id: "2m", label: "2 months", day: today + 56 },
  ];

  const openPause = (el: HTMLElement) => {
    if (disabled) return;
    click(1, el);
    setPauseOpen(true);
    setPicking(false);
    setDraftDay(quick[1]?.day ?? today + 28);
  };

  const closePause = () => {
    setPauseOpen(false);
    setPicking(false);
    setDraftDay(null);
  };

  const confirmPause = (day: number, el: HTMLElement | null) => {
    if (disabled) return;
    const iso = isoOf(day);
    const after: SubscriptionValue = { ...current, pausedUntil: iso };
    const upcoming = scheduleOf(plan, after, now, horizon).next;
    click(0.8, el, 0.55);
    update(after);
    onPause?.(iso);
    closePause();
    focusAfter.current = "resume";
    say(
      `Paused until ${dayText(day)}. ${upcoming ? `Next box ${dayText(upcoming.day)}.` : ""}`,
    );
  };

  const resume = (el: HTMLElement | null) => {
    if (disabled) return;
    const after: SubscriptionValue = { ...current, pausedUntil: null };
    const upcoming = scheduleOf(plan, after, now, horizon).next;
    click(1.2, el, 0.55);
    update(after);
    onPause?.(null);
    focusAfter.current = "pause";
    say(`Resumed. ${upcoming ? `Next box ${dayText(upcoming.day)}.` : ""}`);
  };

  /* -------------------------------- swaps -------------------------------- */

  const doSwap = (
    slot: number,
    toId: string,
    fromEl: HTMLElement | null,
    via: "pointer" | "key" | "menu",
  ) => {
    const fromId = current.box[slot];
    const incoming = byId.get(toId);
    const outgoing = fromId ? byId.get(fromId) : undefined;
    if (!fromId || !incoming || !outgoing || disabled) return;
    // Both flights start where the products are now.
    const slotNode = slots.current.get(`slot-${slot}`);
    const fromRect = fromEl?.getBoundingClientRect();
    const outRect = slotNode
      ?.querySelector("[data-sub-tile]")
      ?.getBoundingClientRect();
    if (fromRect) flights.current.set(toId, fromRect);
    if (outRect && swap === "shelf") flights.current.set(fromId, outRect);
    const boxNext = current.box.map((id, i) => (i === slot ? toId : id));
    const after: SubscriptionValue = { ...current, box: boxNext };
    const sub = boxNext.reduce((s, id) => s + (byId.get(id)?.price ?? 0), 0);
    const ship = sub >= freeShippingOver ? 0 : plan.shipping;
    swish(slotNode, 1);
    update(after);
    onSwap?.(slot, fromId, toId);
    setHeld(null);
    setTarget(null);
    setMenu(null);
    if (via === "key") focusAfter.current = `shelf-${fromId}`;
    if (via === "menu") focusAfter.current = `swap-${slot}`;
    say(
      `${incoming.name} in, ${outgoing.name} out. Box ${formatPrice(
        Math.round((sub + ship) * 100) / 100,
      )}${ship ? "" : ", free delivery"}.`,
    );
  };

  const slotAt = (px: number, py: number) => {
    for (let i = 0; i < current.box.length; i += 1) {
      const r = slots.current.get(`slot-${i}`)?.getBoundingClientRect();
      if (r && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom)
        return i;
    }
    return null;
  };

  const pickUp = (id: string, el: HTMLElement, via: "pointer" | "key") => {
    if (disabled) return;
    if (held?.id === id) {
      click(0.8, el, 0.35);
      setHeld(null);
      setTarget(null);
      say("Put back.");
      return;
    }
    const p = byId.get(id);
    click(1.2, el, 0.4);
    setHeld({ id, via });
    setTarget(via === "key" ? 0 : null);
    if (via === "key") focusAfter.current = "slot-0";
    say(
      `${p?.name ?? "Item"} picked up. ${
        via === "key"
          ? "Left and Right choose a slot, Enter puts it there, Escape puts it back."
          : "Choose a slot in the box."
      }`,
    );
  };

  const cancelHold = () => {
    if (!held) return;
    const id = held.id;
    setHeld(null);
    setTarget(null);
    say("Put back.");
    shelfNodes.current.get(id)?.focus();
  };

  // Focus that follows a swap, a pause or a pick-up lands on the node once it
  // exists: a slot's drop target, the new tile's Swap button, Resume or Pause.
  React.useEffect(() => {
    const key = focusAfter.current;
    if (!key) return;
    const root = rootRef.current;
    let node: HTMLElement | null | undefined = null;
    if (key.startsWith("slot-"))
      node = slots.current
        .get(key)
        ?.querySelector<HTMLElement>("[data-sub-drop]");
    else if (key.startsWith("swap-")) node = swapButtons.current.get(key);
    else if (key.startsWith("shelf-"))
      node = shelfNodes.current.get(key.slice(6));
    else node = root?.querySelector<HTMLElement>(`[data-sub-focus="${key}"]`);
    if (!node) return;
    focusAfter.current = null;
    node.focus({ preventScroll: false });
  });

  // A press outside the menu closes it.
  React.useEffect(() => {
    if (!menu) return;
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const inMenu =
        event.target instanceof Element &&
        event.target.closest("[data-sub-menu]");
      if (!inMenu || !root?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu]);

  // Escape is handled where focus is; this catches it on the calendar and
  // the box while something is held or being picked.
  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (held) {
      event.preventDefault();
      cancelHold();
    } else if (picking) {
      event.preventDefault();
      setPicking(false);
      say("Back to the quick choices.");
      rootRef.current
        ?.querySelector<HTMLElement>("[data-sub-focus='pick']")
        ?.focus();
    } else if (menu) {
      event.preventDefault();
      const m = menu;
      setMenu(null);
      swapButtons.current.get(`swap-${m.slot}`)?.focus();
    }
  };

  /* -------------------------------- pieces ------------------------------- */

  const calendarProps: CalendarProps = {
    uid,
    schedule,
    pausedDay: paused ? pausedDay : null,
    picking,
    draftDay: pauseOpen ? draftDay : null,
    onDraft: (day) => setDraftDay(day),
    onPicked: (day) => {
      setDraftDay(day);
      setPicking(false);
      click(1.1, null, 0.35);
      say(`Resume on ${dayText(day)}. Confirm to pause.`);
      focusAfter.current = "confirm";
    },
    onToggle: (d, el) => toggleSkip(d, el),
    itemCount: box.length,
    motionSafe,
    disabled,
  };

  const nextCard = (
    <section
      aria-labelledby={`${uid}-h-next`}
      className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id={`${uid}-h-next`}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {paused ? "Paused" : "Next box"}
          </h3>
          <div className="relative mt-1 grid overflow-hidden">
            <AnimatePresence initial={false}>
              <motion.p
                key={next ? `${next.date}-${paused ? 1 : 0}` : "none"}
                className="col-start-1 row-start-1 truncate text-xl leading-tight font-semibold text-foreground"
                initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? -distances.step : 0,
                  transition: exitFor(durations.base),
                }}
                transition={
                  motionSafe
                    ? { y: springs.snap, opacity: { duration: durations.base } }
                    : { duration: durations.fast }
                }
              >
                {paused && pausedDay !== null
                  ? `Until ${dayText(pausedDay)}`
                  : next
                    ? dayText(next.day)
                    : "Nothing scheduled"}
              </motion.p>
            </AnimatePresence>
          </div>
          <p className="mt-1 text-[12px] text-ink-3">
            {paused && next ? (
              `Resumes with the box on ${shortText(next.day)}`
            ) : chargeDay !== null ? (
              <>
                Charged {shortText(chargeDay)} to{" "}
                <span className="whitespace-nowrap">{plan.payment}</span>
              </>
            ) : (
              "Skipped every box in view"
            )}
          </p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <Roll
            text={formatPrice(total)}
            motionSafe={motionSafe}
            className="font-mono text-base font-semibold text-foreground"
          />
          <span className="text-[11px] text-ink-3">
            {shipping
              ? `incl. ${formatPrice(shipping)} delivery`
              : "Free delivery"}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {paused ? (
          <button
            type="button"
            data-sub-focus="resume"
            aria-disabled={disabled || undefined}
            onClick={(event) => resume(event.currentTarget)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
              RING,
            )}
          >
            <Play aria-hidden className="size-3.5 shrink-0" />
            Resume now
          </button>
        ) : (
          <>
            <button
              type="button"
              aria-disabled={disabled || !next || undefined}
              onClick={(event) => {
                if (next) toggleSkip(next, event.currentTarget);
              }}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                RING,
              )}
            >
              <SkipForward aria-hidden className="size-3.5 shrink-0" />
              Skip this box
            </button>
            <button
              type="button"
              data-sub-focus="pause"
              aria-expanded={pauseOpen}
              aria-controls={`${uid}-pause`}
              aria-disabled={disabled || undefined}
              onClick={(event) => {
                if (pauseOpen) closePause();
                else openPause(event.currentTarget);
              }}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                pauseOpen && "border-warn/50 bg-warn/10",
                RING,
              )}
            >
              <Pause aria-hidden className="size-3.5 shrink-0" />
              Pause
            </button>
          </>
        )}
      </div>
      <AnimatePresence initial={false}>
        {pauseOpen && !paused ? (
          <motion.div
            key="pause"
            id={`${uid}-pause`}
            className="-m-1 overflow-hidden p-1"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: 0 }
            }
          >
            <div className="flex flex-col gap-2.5 border-t border-hairline pt-3">
              <p id={`${uid}-h-resume`} className="text-[12px] text-ink-2">
                Resume deliveries in
              </p>
              <div
                role="radiogroup"
                aria-labelledby={`${uid}-h-resume`}
                className="flex flex-wrap gap-1.5"
              >
                {quick.map((q, i) => {
                  const on = !picking && draftDay === q.day;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={
                        on ||
                        (i === 0 && !quick.some((o) => o.day === draftDay))
                          ? 0
                          : -1
                      }
                      onClick={(event) => {
                        setPicking(false);
                        setDraftDay(q.day);
                        click(1 + i * 0.08, event.currentTarget, 0.35);
                      }}
                      onKeyDown={(event) =>
                        radioKeys(event, i, quick.length, (to) => {
                          const o = quick[to];
                          if (o) {
                            setPicking(false);
                            setDraftDay(o.day);
                          }
                        })
                      }
                      className={cn(
                        "inline-flex h-8 items-center rounded-full border px-3 text-[12px] transition-colors",
                        on
                          ? "border-warn/60 bg-warn/15 text-foreground"
                          : "border-hairline-strong bg-card text-ink-2 hover:bg-surface-2",
                        RING,
                      )}
                    >
                      {q.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                data-sub-focus="pick"
                aria-pressed={picking}
                onClick={() => {
                  const on = !picking;
                  setPicking(on);
                  if (on) {
                    say("Pick the day deliveries resume on the calendar.");
                    focusAfter.current = "day";
                  }
                }}
                className={cn(
                  "inline-flex h-8 w-fit items-center gap-1.5 rounded-2 px-2 text-[12px] text-cobalt-bright transition-colors hover:bg-cobalt-wash",
                  RING,
                )}
              >
                <CalendarClock aria-hidden className="size-3.5 shrink-0" />
                {picking ? "Picking on the calendar…" : "Pick a date"}
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-sub-focus="confirm"
                  aria-disabled={draftDay === null || undefined}
                  onClick={(event) => {
                    if (draftDay !== null)
                      confirmPause(draftDay, event.currentTarget);
                  }}
                  className={cn(
                    "inline-flex h-8 items-center rounded-2 bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 aria-disabled:opacity-50",
                    RING,
                  )}
                >
                  {draftDay !== null
                    ? `Pause until ${shortText(draftDay)}`
                    : "Pause"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closePause();
                    focusAfter.current = "pause";
                  }}
                  className={cn(
                    "inline-flex h-8 items-center rounded-2 px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    RING,
                  )}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );

  const calendarSection = (
    <section
      aria-labelledby={`${uid}-h-cal`}
      className="flex min-w-0 flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id={`${uid}-h-cal`}
          className="text-[13px] font-medium text-foreground"
        >
          {picking ? "Pick the resume day" : "Upcoming"}
        </h3>
        <span
          aria-hidden
          className="flex items-center gap-3 text-[10px] text-ink-3"
        >
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-cobalt-bright" /> Box
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full border-[1.5px] border-ink-3" />{" "}
            Skipped
          </span>
        </span>
      </div>
      <div
        ref={calendarRef}
        role="group"
        aria-labelledby={`${uid}-h-cal`}
        aria-describedby={
          calendar === "strip" ? `${uid}-strip-hint` : undefined
        }
      >
        {calendar === "month" ? (
          <CalendarMonth {...calendarProps} />
        ) : (
          <CalendarStrip {...calendarProps} />
        )}
      </div>
      <p className="text-[11px] text-ink-3">
        {picking
          ? "Deliveries before the day you pick are paused."
          : "Press a box to skip it; press again to bring it back."}
      </p>
    </section>
  );

  const frequencySection = (
    <section
      aria-labelledby={`${uid}-h-freq`}
      className="flex flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3
          id={`${uid}-h-freq`}
          className="text-[13px] font-medium text-foreground"
        >
          Deliver every
        </h3>
        <span className="text-[12px] text-ink-3">
          {cadenceText(current.cadence)}
        </span>
      </div>
      {frequency === "slider" ? (
        <CadenceSlider
          value={current.cadence}
          max={maxCadence}
          labelledBy={`${uid}-h-freq`}
          onDetent={(w) => click(r2(0.8 + w * 0.06), null, 0.3)}
          onChange={(w) => setCadence(w, null, true)}
          motionSafe={motionSafe}
          disabled={disabled}
        />
      ) : (
        <CadenceChips
          uid={uid}
          cadences={cadences}
          value={current.cadence}
          onChoose={(w, el) => setCadence(w, el)}
          labelledBy={`${uid}-h-freq`}
          motionSafe={motionSafe}
          disabled={disabled}
        />
      )}
      <p className="text-[11px] text-ink-3">
        {next
          ? `The next box stays on ${shortText(next.day)}; the rest move.`
          : "Changes apply from the next box."}
      </p>
    </section>
  );

  const heldProduct = held ? byId.get(held.id) : undefined;

  const boxSection = (
    <section
      aria-labelledby={`${uid}-h-box`}
      className="flex min-w-0 flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3
          id={`${uid}-h-box`}
          className="text-[13px] font-medium text-foreground"
        >
          In the next box
        </h3>
        <span className="font-mono text-[12px] text-ink-3 tabular-nums">
          {formatPrice(subtotal)}
        </span>
      </div>
      <ol role="list" className="flex flex-col gap-2">
        {box.map((p, i) => {
          const isTarget = held !== null && target === i;
          const menuOpen = menu?.slot === i;
          const alternatives = shelf;
          return (
            <li
              key={`slot-${i}`}
              ref={(node) => {
                if (node) slots.current.set(`slot-${i}`, node);
                else slots.current.delete(`slot-${i}`);
              }}
              className={cn(
                "relative flex items-center gap-2 rounded-3 border p-2 transition-colors duration-150",
                isTarget
                  ? "border-cobalt-bright bg-cobalt-wash"
                  : held
                    ? "border-dashed border-cobalt-bright/50 bg-card"
                    : "border-hairline bg-card",
              )}
            >
              <div
                data-sub-tile=""
                key={`${i}-${p.id}`}
                className="flex min-w-0 flex-1"
              >
                <BoxTile
                  product={p}
                  flights={flights}
                  motionSafe={motionSafe}
                />
              </div>
              <span className="shrink-0 font-mono text-[12px] text-ink-2 tabular-nums">
                {formatPrice(p.price)}
              </span>
              {held && heldProduct ? (
                <button
                  type="button"
                  data-sub-drop=""
                  aria-label={`Put ${heldProduct.name} here, replacing ${p.name}`}
                  onClick={(event) => {
                    doSwap(
                      i,
                      held.id,
                      shelfNodes.current.get(held.id) ?? null,
                      held.via === "key" ? "key" : "pointer",
                    );
                    event.currentTarget.blur();
                  }}
                  onFocus={() => setTarget(i)}
                  onPointerEnter={() => setTarget(i)}
                  onKeyDown={(event) => {
                    const n = box.length;
                    if (
                      event.key === "ArrowRight" ||
                      event.key === "ArrowDown"
                    ) {
                      event.preventDefault();
                      setTarget((i + 1) % n);
                      slots.current
                        .get(`slot-${(i + 1) % n}`)
                        ?.querySelector<HTMLElement>("[data-sub-drop]")
                        ?.focus();
                    } else if (
                      event.key === "ArrowLeft" ||
                      event.key === "ArrowUp"
                    ) {
                      event.preventDefault();
                      setTarget((i - 1 + n) % n);
                      slots.current
                        .get(`slot-${(i - 1 + n) % n}`)
                        ?.querySelector<HTMLElement>("[data-sub-drop]")
                        ?.focus();
                    }
                  }}
                  className={cn("absolute inset-0 rounded-3", RING_IN)}
                />
              ) : null}
              {swap === "menu" ? (
                <button
                  type="button"
                  ref={(node) => {
                    if (node) swapButtons.current.set(`swap-${i}`, node);
                    else swapButtons.current.delete(`swap-${i}`);
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={menuOpen}
                  aria-controls={menuOpen ? `${uid}-menu-${i}` : undefined}
                  aria-label={`Swap ${p.name}`}
                  aria-disabled={
                    disabled || alternatives.length === 0 || undefined
                  }
                  onClick={(event) => {
                    if (disabled || alternatives.length === 0) return;
                    click(menuOpen ? 0.85 : 1.1, event.currentTarget, 0.35);
                    setMenu(menuOpen ? null : { slot: i, active: 0 });
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "ArrowDown" &&
                      !menuOpen &&
                      alternatives.length
                    ) {
                      event.preventDefault();
                      setMenu({ slot: i, active: 0 });
                    }
                  }}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1 rounded-2 border border-hairline-strong px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    menuOpen && "bg-surface-2 text-foreground",
                    RING,
                  )}
                >
                  <ArrowLeftRight aria-hidden className="size-3.5 shrink-0" />
                  <span className="hidden @min-[30rem]:inline">Swap</span>
                </button>
              ) : null}
              <AnimatePresence>
                {menuOpen ? (
                  <motion.div
                    key="menu"
                    data-sub-menu=""
                    className="absolute top-full right-0 z-30 mt-1 w-[min(17rem,100%)]"
                    initial={{
                      opacity: 0,
                      y: motionSafe ? -distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            y: springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <ul
                      role="listbox"
                      id={`${uid}-menu-${i}`}
                      aria-label={`Swap ${p.name} for`}
                      className="flex max-h-56 flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_8px_24px_color-mix(in_oklab,black_16%,transparent)]"
                    >
                      {alternatives.map((alt, j) => {
                        const delta = alt.price - p.price;
                        return (
                          <li
                            key={alt.id}
                            role="option"
                            aria-selected={menu?.active === j}
                            tabIndex={menu?.active === j ? 0 : -1}
                            ref={(node) => {
                              if (node && menu?.active === j && menu.slot === i)
                                node.focus({ preventScroll: true });
                            }}
                            onClick={(event) =>
                              doSwap(i, alt.id, event.currentTarget, "menu")
                            }
                            onPointerMove={() => {
                              if (menu?.active !== j)
                                setMenu({ slot: i, active: j });
                            }}
                            onKeyDown={(event) => {
                              const n = alternatives.length;
                              if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setMenu({ slot: i, active: (j + 1) % n });
                              } else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setMenu({ slot: i, active: (j - 1 + n) % n });
                              } else if (event.key === "Home") {
                                event.preventDefault();
                                setMenu({ slot: i, active: 0 });
                              } else if (event.key === "End") {
                                event.preventDefault();
                                setMenu({ slot: i, active: n - 1 });
                              } else if (
                                event.key === "Enter" ||
                                event.key === " "
                              ) {
                                event.preventDefault();
                                doSwap(i, alt.id, event.currentTarget, "menu");
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                setMenu(null);
                                swapButtons.current.get(`swap-${i}`)?.focus();
                              } else if (event.key === "Tab") {
                                setMenu(null);
                              }
                            }}
                            className={cn(
                              "flex cursor-pointer items-center gap-2.5 rounded-2 px-2 py-1.5",
                              menu?.active === j ? "bg-cobalt-wash" : "",
                              RING_IN,
                            )}
                          >
                            <ProductArt product={alt} className="h-7 w-6" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] text-foreground">
                                {alt.name}
                              </span>
                              <span className="block truncate text-[11px] text-ink-3">
                                {alt.detail}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "shrink-0 font-mono text-[11px] tabular-nums",
                                delta > 0 ? "text-ink-2" : "text-success",
                              )}
                            >
                              {delta === 0
                                ? "same"
                                : `${delta > 0 ? "+" : "−"}${formatPrice(Math.abs(delta))}`}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
      {swap === "shelf" && shelf.length ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <p
              id={`${uid}-h-shelf`}
              className="shrink-0 text-[12px] whitespace-nowrap text-ink-2"
            >
              Swap in
            </p>
            <p className="truncate text-[11px] text-ink-3">
              {held && heldProduct ? (
                <span className="inline-flex items-center gap-1">
                  Choose a slot for {heldProduct.name}
                  <button
                    type="button"
                    aria-label="Put it back"
                    onClick={cancelHold}
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-1 text-ink-3 hover:bg-surface-2 hover:text-foreground",
                      RING,
                    )}
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              ) : (
                "Drag onto a slot, or press to pick up"
              )}
            </p>
          </div>
          <ul
            role="list"
            aria-labelledby={`${uid}-h-shelf`}
            className="grid gap-2 @min-[18rem]:grid-cols-2 @min-[68rem]:grid-cols-1"
          >
            {shelf.map((p) => (
              <motion.li
                key={p.id}
                layout={motionSafe ? "position" : false}
                transition={springs.glide}
                className="min-w-0"
              >
                <ShelfItem
                  product={p}
                  held={held?.id === p.id}
                  flights={flights}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  bind={(node) => {
                    if (node) shelfNodes.current.set(p.id, node);
                    else shelfNodes.current.delete(p.id);
                  }}
                  onPress={(el, via) => pickUp(p.id, el, via)}
                  onDragMove={(px, py) => {
                    const at = px < 0 ? null : slotAt(px, py);
                    setTarget((t) => (t === at ? t : at));
                    if (!held || held.id !== p.id)
                      setHeld({ id: p.id, via: "pointer" });
                  }}
                  onDrop={(px, py, el) => {
                    const at = slotAt(px, py);
                    if (at === null) {
                      setHeld(null);
                      setTarget(null);
                      return false;
                    }
                    doSwap(at, p.id, el, "pointer");
                    return true;
                  }}
                />
              </motion.li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );

  // Focus asked for on the calendar's days lands on the first pickable one.
  React.useEffect(() => {
    if (focusAfter.current !== "day" || !picking) return;
    const day = calendarRef.current?.querySelector<HTMLElement>(
      "[data-sub-day][tabindex='0']",
    );
    if (!day) return;
    focusAfter.current = null;
    day.focus();
  });

  const body = () => {
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className="grid gap-3 p-3 @min-[40rem]:grid-cols-2 @min-[40rem]:p-4"
        >
          <p className="sr-only">Loading the subscription.</p>
          <div className="h-32 rounded-3 border border-hairline bg-surface-1" />
          <div className="h-32 rounded-3 border border-hairline bg-surface-1" />
          <div className="h-24 rounded-3 border border-hairline bg-surface-1" />
          <div className="h-24 rounded-3 border border-hairline bg-surface-1" />
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The subscription did not load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                RING,
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
      <div
        inert={disabled}
        className="grid gap-3 p-3 @min-[40rem]:grid-cols-2 @min-[40rem]:p-4 @min-[68rem]:grid-cols-[16rem_minmax(0,1fr)_18rem]"
      >
        {/* Phone: the next box, the schedule, the cadence, the box. Tablet:
            the schedule across the top. Desktop: three columns. */}
        <div className="contents @min-[40rem]:col-start-1 @min-[40rem]:row-start-2 @min-[40rem]:flex @min-[40rem]:min-w-0 @min-[40rem]:flex-col @min-[40rem]:gap-3 @min-[68rem]:row-start-1">
          <div className="order-1 min-w-0">{nextCard}</div>
          <div className="order-3 min-w-0">{frequencySection}</div>
        </div>
        <div className="order-2 min-w-0 @min-[40rem]:col-span-2 @min-[40rem]:row-start-1 @min-[68rem]:col-span-1 @min-[68rem]:col-start-2">
          {calendarSection}
        </div>
        <div className="order-4 min-w-0 @min-[40rem]:col-start-2 @min-[40rem]:row-start-2 @min-[68rem]:col-start-3 @min-[68rem]:row-start-1">
          {boxSection}
        </div>
      </div>
    );
  };

  return (
    // layoutScroll: the root scrolls, and layout animations inside it must
    // measure against its scroll position.
    <motion.div
      layoutScroll
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onKeyDown={onRootKeyDown}
      className={cn(
        "@container relative max-h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            {plan.merchant} · {plan.name}
          </p>
        </div>
        {status === "ready" ? (
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2 text-[11px]",
              paused ? "text-warn" : "text-ink-2",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                paused ? "bg-warn" : "bg-success",
              )}
            />
            {paused && pausedDay !== null
              ? `Paused until ${shortText(pausedDay)}`
              : `Active · ${cadenceText(current.cadence).toLowerCase()}`}
          </span>
        ) : null}
      </header>
      {body()}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </motion.div>
  );
}
