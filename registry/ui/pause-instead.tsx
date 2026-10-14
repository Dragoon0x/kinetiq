"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowLeft,
  BadgePercent,
  CalendarClock,
  CirclePause,
  Inbox,
  Layers,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
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

export type PauseStep = "reason" | "offer" | "summary";
export type PauseOfferKind = "pause" | "discount" | "downgrade";
export type PauseLayout = "steps" | "single";
export type PauseDensity = "compact" | "cozy" | "roomy";
export type PauseTone = "cobalt" | "signal" | "ink";
export type PauseStatus = "ready" | "loading" | "error";

export type PauseReason = {
  id: string;
  /** The reason as the person would say it, e.g. "Work slows down for a season". */
  label: string;
  /** A quieter second line. */
  hint?: string;
  /** Shows a text field under the reason for their own words. @default false */
  freeText?: boolean;
};

export type PausePlan = {
  /** e.g. "Basinworks Pro". */
  name: string;
  /** Monthly price, in whole units. */
  price: number;
  /** Printed before the price. @default "$" */
  currency?: string;
};

export type PauseOffer = {
  id: string;
  kind: PauseOfferKind;
  title: string;
  detail: string;
  /** Reason ids this offer is tailored to; omit to offer it for every reason. */
  reasons?: string[];
  /** Pause offers: the months on the segmented control. @default [1, 2, 3] */
  months?: number[];
  /** Discount offers: percent off. */
  percent?: number;
  /** Discount offers: for how many months. */
  forMonths?: number;
  /** Downgrade offers: the plan moved to. */
  plan?: PausePlan;
};

export type PauseOutcome =
  | { kind: "pause"; months: number; pausesAt: number; resumesAt: number }
  | { kind: "cancel"; endsAt: number }
  | { kind: "discount"; offer: string }
  | { kind: "downgrade"; offer: string };

/** Where the flow is and what has been chosen so far. */
export type PauseState = {
  step: PauseStep;
  /** The chosen reason's id. */
  reason: string | null;
  /** Their own words, for a free-text reason. */
  otherText: string;
  /** The alternative opened on step two. */
  offer: string | null;
  /** Months chosen on the pause offer. */
  months: number;
  /** Set once either path is confirmed. */
  outcome: PauseOutcome | null;
};

export type PauseChange = { field: keyof PauseState; previous: PauseState };

export type PauseResult = {
  reason: string | null;
  reasonLabel: string | null;
  otherText: string;
};

export type PauseInsteadProps = {
  /** The reasons on step one, in order. @default defaultPauseReasons */
  reasons?: PauseReason[];
  /** Every alternative that can be offered; step two shows the ones tailored to the reason. @default defaultPauseOffers */
  offers?: PauseOffer[];
  /** Controlled step state. */
  value?: PauseState;
  /** Initial step state when uncontrolled. @default defaultPauseState */
  defaultValue?: PauseState;
  /** Fires from every press, key or keystroke that moved the flow, with the whole state and which field changed. */
  onChange?: (value: PauseState, change: PauseChange) => void;
  /** Pause was confirmed: the months, when the pause starts and when billing resumes. */
  onPause?: (
    pause: PauseResult & {
      months: number;
      pausesAt: number;
      resumesAt: number;
    },
  ) => void;
  /** Cancel anyway was pressed a second time, with when the plan ends. */
  onCancel?: (cancel: PauseResult & { endsAt: number }) => void;
  /** A discount or downgrade was taken. */
  onAcceptOffer?: (offer: PauseOffer, result: PauseResult) => void;
  /** Done was pressed on the summary. */
  onDone?: (outcome: PauseOutcome) => void;
  /** The plan being left. @default defaultPausePlan */
  plan?: PausePlan;
  /** What a pause keeps, listed under the calendar. @default defaultPauseKept */
  kept?: string[];
  /** The moment the calendar starts from, in ms; never read from the clock. @default defaultPauseNow */
  now?: number;
  /** The next renewal, in ms: a pause starts and a cancellation ends there. @default nine days after now */
  renewsAt?: number;
  /** How long Cancel anyway stays armed for its second press, in seconds. @default 4 */
  armSeconds?: number;
  /** One step at a time with Back, or the reason and the offers on one page. @default "steps" */
  layout?: PauseLayout;
  /** Row heights, card padding and type size. @default "cozy" */
  density?: PauseDensity;
  /** The colour the offers and the resume date are drawn in. @default "cobalt" */
  tone?: PauseTone;
  /** Whether the offers have arrived: a skeleton while loading, a retry when they failed, with cancel still possible. @default "ready" */
  status?: PauseStatus;
  /** Try again was pressed after the offers failed. */
  onRetry?: () => void;
  /** The heading. @default "Cancel your plan" */
  title?: string;
  /** The small line over the heading. @default "Basinworks" */
  subtitle?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; each step scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be chosen or confirmed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** Monday 12 October 2026, 09:00 UTC. */
export const defaultPauseNow = Date.UTC(2026, 9, 12, 9, 0);

export const defaultPausePlan: PausePlan = {
  name: "Basinworks Pro",
  price: 48,
  currency: "$",
};

export const defaultPauseReasons: PauseReason[] = [
  {
    id: "seasonal",
    label: "Work slows down for a season",
    hint: "Fewer sites to read until the spring.",
  },
  {
    id: "cost",
    label: "It costs too much right now",
    hint: "The plan is more than the work needs.",
  },
  {
    id: "hard",
    label: "It is harder to use than it should be",
    hint: "Too much to set up or learn.",
  },
  {
    id: "switching",
    label: "Moving to another tool",
    hint: "Something else fits the crew better.",
  },
  {
    id: "closing",
    label: "The business is closing",
    hint: "No more sites to look after.",
  },
  {
    id: "other",
    label: "Something else",
    freeText: true,
  },
];

export const defaultPauseOffers: PauseOffer[] = [
  {
    id: "pause",
    kind: "pause",
    title: "Pause instead",
    detail:
      "Nothing is billed while paused. Your sites, readings and crew stay exactly as they are.",
    reasons: ["seasonal", "cost", "hard", "switching", "other"],
    months: [1, 2, 3],
  },
  {
    id: "thirty-off",
    kind: "discount",
    title: "30% off for three months",
    detail: "The same plan at a lower price while things pick up.",
    reasons: ["cost", "other"],
    percent: 30,
    forMonths: 3,
  },
  {
    id: "lite",
    kind: "downgrade",
    title: "Move to Basinworks Lite",
    detail:
      "Readings and alerts for up to five sites, without crews or exports.",
    reasons: ["cost", "hard"],
    plan: { name: "Basinworks Lite", price: 19, currency: "$" },
  },
];

export const defaultPauseKept: string[] = [
  "Every site and its readings",
  "Crew, roles and settings",
  "Reports and exports",
  "Connected integrations",
];

export const defaultPauseState: PauseState = {
  step: "reason",
  reason: null,
  otherText: "",
  offer: null,
  months: 2,
  outcome: null,
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const TONES: Record<PauseTone, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

const DENSITY: Record<
  PauseDensity,
  {
    pad: string;
    gap: string;
    text: string;
    row: string;
    card: string;
    head: string;
    cell: string;
  }
> = {
  compact: {
    pad: "px-3 py-3",
    gap: "gap-2",
    text: "text-[12px]",
    row: "min-h-9 px-2.5 py-1.5",
    card: "p-3",
    head: "text-[15px]",
    cell: "h-10",
  },
  cozy: {
    pad: "px-4 py-4",
    gap: "gap-3",
    text: "text-[13px]",
    row: "min-h-11 px-3 py-2",
    card: "p-4",
    head: "text-[17px]",
    cell: "h-12",
  },
  roomy: {
    pad: "px-5 py-5",
    gap: "gap-4",
    text: "text-sm",
    row: "min-h-12 px-3.5 py-2.5",
    card: "p-5",
    head: "text-[19px]",
    cell: "h-14",
  },
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
const MONTHS_LONG = [
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
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const STEP_COUNT = 3;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const daysIn = (y: number, m: number) =>
  new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** The same day `n` months on, clamped to the month's length. */
const addMonths = (ms: number, n: number) => {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return Date.UTC(
    ny,
    nm,
    Math.min(d.getUTCDate(), daysIn(ny, nm)),
    d.getUTCHours(),
    d.getUTCMinutes(),
  );
};

const monthIndex = (ms: number) => {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

/** "21 Dec 2026". */
const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};

/** "21 December 2026", for announcements. */
const sayDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};

const money = (n: number, plan: PausePlan) =>
  `${plan.currency ?? "$"}${Math.round(n)}`;

const noopSubscribe = () => () => {};

/** Lists the offers tailored to a reason, for hosts that count them elsewhere. */
export const offersFor = (offers: PauseOffer[], reason: string | null) =>
  offers.filter(
    (o) => !o.reasons || (reason !== null && o.reasons.includes(reason)),
  );

type StepPage = "reason" | "offer" | "single" | "summary";

/** Arrow keys move and choose inside a radio group; Home and End jump. */
const radioNav = (
  event: React.KeyboardEvent,
  ids: string[],
  current: string | null,
  pick: (id: string) => void,
) => {
  const n = ids.length;
  if (n === 0) return;
  const i = Math.max(0, ids.indexOf(current ?? ""));
  let to = -1;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") to = (i + 1) % n;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
    to = (i - 1 + n) % n;
  else if (event.key === "Home") to = 0;
  else if (event.key === "End") to = n - 1;
  else return;
  event.preventDefault();
  const id = ids[to];
  if (id !== undefined) pick(id);
};

/* ----------------------------------------------------------------------- */
/*                               Small pieces                               */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
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
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
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

function Tick({
  motionSafe,
  delay = 0,
  className,
}: {
  motionSafe: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={cn("size-3.5", className)}>
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
          motionSafe ? { ...springs.flick, delay: r3(delay) } : { duration: 0 }
        }
      />
    </svg>
  );
}

function RadioDot({
  checked,
  motionSafe,
}: {
  checked: boolean;
  motionSafe: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
        checked ? "border-(--pi-accent)" : "border-hairline-strong",
      )}
    >
      <motion.span
        className="size-2 rounded-full bg-(--pi-accent)"
        initial={false}
        animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
        transition={
          motionSafe
            ? { ...springs.snap, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      />
    </span>
  );
}

const OFFER_ICON: Record<
  PauseOfferKind,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  pause: CirclePause,
  discount: BadgePercent,
  downgrade: Layers,
};

/* ----------------------------------------------------------------------- */
/*                             Segmented months                             */
/* ----------------------------------------------------------------------- */

function Segmented({
  id,
  options,
  value,
  onChange,
  motionSafe,
  inert,
}: {
  id: string;
  options: number[];
  value: number;
  onChange: (months: number) => void;
  motionSafe: boolean;
  inert: boolean;
}) {
  const nodes = React.useRef(new Map<number, HTMLButtonElement>());
  const ids = options.map(String);
  const pick = (next: string) => {
    const m = Number(next);
    onChange(m);
    nodes.current.get(m)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="How long to pause"
      className="relative grid h-8 w-full rounded-2 border border-hairline bg-surface-1 p-0.5"
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, options.length)}, minmax(0, 1fr))`,
      }}
    >
      {options.map((m) => {
        const checked = m === value;
        return (
          <button
            key={m}
            ref={(node) => {
              if (node) nodes.current.set(m, node);
              else nodes.current.delete(m);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={inert || undefined}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              if (!inert) onChange(m);
            }}
            onKeyDown={(event) => {
              if (inert) return;
              radioNav(event, ids, String(value), pick);
            }}
            className={cn(
              "relative rounded-[4px] text-[12px] font-medium whitespace-nowrap transition-colors duration-200",
              checked ? "text-foreground" : "text-ink-2",
              inert ? "cursor-default" : "cursor-pointer hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {checked ? (
              motionSafe ? (
                <motion.span
                  layoutId={`${id}-months`}
                  aria-hidden
                  className="absolute inset-0 rounded-[4px] border border-hairline-strong bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_18%,transparent)]"
                  transition={springs.snap}
                />
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-[4px] border border-hairline-strong bg-card"
                />
              )
            ) : null}
            <span className="relative">
              {m} {m === 1 ? "month" : "months"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Calendar strip                              */
/* ----------------------------------------------------------------------- */

function CalendarStrip({
  now,
  pausesAt,
  resumesAt,
  motionSafe,
  density,
}: {
  now: number;
  pausesAt: number;
  resumesAt: number;
  motionSafe: boolean;
  density: PauseDensity;
}) {
  const start = monthIndex(now);
  const from = monthIndex(pausesAt);
  const to = monthIndex(resumesAt);
  const count = clamp(to - start + 2, 7, 9);
  const cells = Array.from({ length: count }, (_, i) => start + i);
  const pausedCount = Math.max(1, to - from);
  const step = cascade(pausedCount);
  const resumeCol = to - start;
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={`Paused from ${sayDate(pausesAt)}, billing resumes ${sayDate(resumesAt)}`}
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((idx) => {
          const paused = idx >= from && idx < to;
          const resume = idx === to;
          const m = ((idx % 12) + 12) % 12;
          const y = Math.floor(idx / 12);
          return (
            <div
              key={idx}
              className={cn(
                "relative flex flex-col items-center justify-center overflow-hidden rounded-2 border bg-surface-1 transition-colors duration-200",
                DENSITY[density].cell,
                resume ? "border-(--pi-accent)" : "border-hairline",
              )}
            >
              <AnimatePresence initial={false}>
                {paused ? (
                  <motion.span
                    key="paused"
                    aria-hidden
                    className="absolute inset-0 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--ink-3)_22%,transparent)_0_3px,transparent_3px_8px)]"
                    style={{ originX: 0 }}
                    initial={
                      motionSafe ? { scaleX: 0, opacity: 1 } : { opacity: 0 }
                    }
                    animate={{ scaleX: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? { ...springs.glide, delay: r3((idx - from) * step) }
                        : { duration: durations.fast }
                    }
                  />
                ) : null}
              </AnimatePresence>
              <span
                className={cn(
                  "relative font-mono text-[10px] tracking-[0.08em] uppercase transition-colors duration-200",
                  paused ? "text-ink-3" : "text-foreground",
                )}
              >
                {MONTHS[m]}
              </span>
              <span
                className={cn(
                  "relative text-[10px] transition-colors duration-200",
                  paused ? "text-ink-3" : "text-ink-2",
                )}
              >
                {paused ? "paused" : m === 0 || idx === start ? y : "billed"}
              </span>
            </div>
          );
        })}
      </div>
      <div
        aria-hidden
        className="relative grid h-6 gap-1"
        style={{
          gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={to}
            className="flex justify-center"
            style={{ gridColumnStart: clamp(resumeCol + 1, 1, count) }}
            initial={
              motionSafe
                ? { opacity: 0, y: -distances.step, scale: 0.6 }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.recoil, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            <span className="flex flex-col items-center">
              <span className="size-0 border-x-[5px] border-b-[6px] border-x-transparent border-b-(--pi-accent)" />
              <span className="mt-px font-mono text-[10px] tracking-[0.04em] whitespace-nowrap text-(--pi-accent)">
                {new Date(resumesAt).getUTCDate()}{" "}
                {MONTHS[new Date(resumesAt).getUTCMonth()]}
              </span>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Cancel anyway                             */
/* ----------------------------------------------------------------------- */

function CancelAnyway({
  armed,
  armSeconds,
  prominent,
  inert,
  onPress,
  nodeRef,
}: {
  armed: boolean;
  armSeconds: number;
  prominent: boolean;
  inert: boolean;
  onPress: () => void;
  nodeRef: (node: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={nodeRef}
      type="button"
      aria-disabled={inert || undefined}
      onClick={() => {
        if (!inert) onPress();
      }}
      className={cn(
        "relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-2 border px-3 text-xs transition-colors duration-200",
        armed
          ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)] bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger"
          : prominent
            ? "border-hairline-strong text-foreground hover:bg-surface-2"
            : "border-transparent text-ink-3 hover:text-ink-2",
        inert ? "cursor-default" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      {armed ? (
        <motion.span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 bg-danger"
          style={{ originX: 0 }}
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          // The bar is the measure of the window, so it drains under
          // reduced motion too; it is one tween, never a frame loop.
          transition={{ duration: armSeconds, ease: easings.linear }}
        />
      ) : null}
      <span className="relative">
        {armed ? "Press again to cancel" : "Cancel anyway"}
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A cancellation sheet that offers a pause before it lets go. Step one asks
 * the reason — a radio group whose dot fills on `springs.snap`, with a text
 * field unfolding under "Something else". Step two slides in on
 * `springs.glide` with the alternatives tailored to that reason in a cascade:
 * a pause whose months sit on a segmented control with an indicator sliding
 * on `springs.snap`, a discount, a downgrade. Opening Pause unfolds a
 * calendar strip: the paused months hatch over on `springs.glide` one after
 * another and the resume date drops onto its month on `springs.recoil`, with
 * what is kept listed beneath. Cancel anyway stays in the foot, quieter, and
 * arms on its first press — red, with a bar draining for `armSeconds` — so
 * only a second press inside that window goes through. Either path ends on
 * a summary card landing on `springs.recoil` with a tick drawn on
 * `springs.flick`.
 *
 * Back at each step slides the previous one in from the left; Escape does
 * the same (and disarms a pending cancel first). The reasons, the offers and
 * the months are radio groups — arrows move and choose, Home and End jump —
 * and every change is announced in words. A reason with no tailored offers
 * skips to a plain confirm; failed offers show a retry with cancel still at
 * hand. Under reduced motion steps cross-fade in place, the months grey at
 * once and the resume date appears where it lands.
 */
export function PauseInstead({
  reasons = defaultPauseReasons,
  offers = defaultPauseOffers,
  value,
  defaultValue = defaultPauseState,
  onChange,
  onPause,
  onCancel,
  onAcceptOffer,
  onDone,
  plan = defaultPausePlan,
  kept = defaultPauseKept,
  now = defaultPauseNow,
  renewsAt,
  armSeconds = 4,
  layout = "steps",
  density = "cozy",
  tone = "cobalt",
  status = "ready",
  onRetry,
  title = "Cancel your plan",
  subtitle = "Basinworks",
  label,
  height = 540,
  disabled = false,
  className,
}: PauseInsteadProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const headingId = `${uid}-heading`;
  const otherId = `${uid}-other`;

  const [own, setOwn] = React.useState<PauseState>(defaultValue);
  const current = value ?? own;
  const ready = status === "ready";
  const inert = disabled || status === "loading";

  const [dir, setDir] = React.useState(1);
  const [armed, setArmed] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusReq, setFocusReq] = React.useState(0);
  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  // False for the server render and hydration, so cards already on the page
  // never cascade in; true for cards that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const reasonNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const offerNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const cancelNode = React.useRef<HTMLButtonElement | null>(null);

  /* -------------------------------- data ------------------------------- */

  const d = DENSITY[density];
  const renewal = renewsAt ?? now + 9 * DAY;
  const reason = reasons.find((r) => r.id === current.reason) ?? null;
  const tailored = offersFor(offers, current.reason);
  const pauseOffer = tailored.find((o) => o.kind === "pause") ?? null;
  const monthOptions =
    pauseOffer?.months && pauseOffer.months.length > 0
      ? pauseOffer.months
      : [1, 2, 3];
  const months = monthOptions.includes(current.months)
    ? current.months
    : (monthOptions[0] ?? 1);
  const resumesAt = addMonths(renewal, months);
  const page: StepPage =
    current.step === "summary"
      ? "summary"
      : layout === "single"
        ? "single"
        : current.step;
  const stepNumber = page === "summary" ? 3 : page === "offer" ? 2 : 1;
  const noOffers = ready && tailored.length === 0;
  const result: PauseResult = {
    reason: current.reason,
    reasonLabel: reason?.label ?? null,
    otherText: current.otherText,
  };

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: PauseState, field: keyof PauseState) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, { field, previous: current });
  };

  const headingFor = (p: StepPage) =>
    p === "reason" || p === "single"
      ? "Why are you leaving?"
      : p === "offer"
        ? "Before you go"
        : "All set";

  const goTo = (
    step: PauseStep,
    direction: 1 | -1,
    extra?: Partial<PauseState>,
  ) => {
    setDir(direction);
    setArmed(false);
    commit({ ...current, ...extra, step }, "step");
    setFocusReq((n) => n + 1);
    const nextPage: StepPage =
      step === "summary" ? "summary" : layout === "single" ? "single" : step;
    const n = nextPage === "summary" ? 3 : nextPage === "offer" ? 2 : 1;
    const offersNote =
      step === "offer"
        ? status === "error"
          ? " The offers did not load."
          : status === "loading"
            ? " Loading offers."
            : tailored.length === 0
              ? " No offers for this reason."
              : ` ${tailored.length} ${tailored.length === 1 ? "offer" : "offers"}.`
        : "";
    setAnnouncement(
      `${direction < 0 ? "Back to step" : "Step"} ${n} of ${STEP_COUNT}, ${headingFor(nextPage)}.${offersNote}`,
    );
  };

  const chooseReason = (id: string) => {
    if (inert) return;
    const r = reasons.find((x) => x.id === id);
    if (!r || current.reason === id) {
      reasonNodes.current.get(id)?.focus();
      return;
    }
    commit({ ...current, reason: id, offer: null }, "reason");
    reasonNodes.current.get(id)?.focus();
    const count = offersFor(offers, id).length;
    setAnnouncement(
      `${r.label}.${r.freeText ? " A text field opened below." : ""}${
        layout === "single" && ready
          ? count === 0
            ? " No offers for this reason."
            : ` ${count} ${count === 1 ? "offer" : "offers"} shown.`
          : ""
      }`,
    );
  };

  const chooseOffer = (id: string) => {
    if (inert) return;
    const o = tailored.find((x) => x.id === id);
    if (!o) return;
    const already = current.offer === id;
    if (!already) commit({ ...current, offer: id }, "offer");
    offerNodes.current.get(id)?.focus();
    if (already) return;
    setAnnouncement(
      o.kind === "pause"
        ? `${o.title}. Pause for ${months} ${months === 1 ? "month" : "months"}, billing resumes ${sayDate(resumesAt)}.`
        : `${o.title}. ${o.detail}`,
    );
  };

  const chooseMonths = (m: number) => {
    if (inert || m === months) return;
    commit({ ...current, months: m }, "months");
    const resume = addMonths(renewal, m);
    setAnnouncement(
      `Pause for ${m} ${m === 1 ? "month" : "months"}. Billing resumes ${sayDate(resume)}, saving ${money(plan.price * m, plan)}.`,
    );
  };

  const confirmPause = () => {
    if (inert) return;
    const outcome: PauseOutcome = {
      kind: "pause",
      months,
      pausesAt: renewal,
      resumesAt,
    };
    goTo("summary", 1, { outcome });
    onPause?.({ ...result, months, pausesAt: renewal, resumesAt });
    setAnnouncement(
      `Plan paused. Nothing is billed from ${sayDate(renewal)} until ${sayDate(resumesAt)}.`,
    );
  };

  const confirmOffer = (o: PauseOffer) => {
    if (inert) return;
    const outcome: PauseOutcome =
      o.kind === "downgrade"
        ? { kind: "downgrade", offer: o.id }
        : { kind: "discount", offer: o.id };
    goTo("summary", 1, { outcome, offer: o.id });
    onAcceptOffer?.(o, result);
    setAnnouncement(
      o.kind === "downgrade"
        ? `Moving to ${o.plan?.name ?? o.title} from ${sayDate(renewal)}.`
        : `${o.title} applied from ${sayDate(renewal)}.`,
    );
  };

  const pressCancel = () => {
    if (inert) return;
    if (!armed) {
      setArmed(true);
      setAnnouncement(
        `Cancel armed. Press again within ${armSeconds} seconds to end the plan on ${sayDate(renewal)}.`,
      );
      return;
    }
    const outcome: PauseOutcome = { kind: "cancel", endsAt: renewal };
    goTo("summary", 1, { outcome });
    onCancel?.({ ...result, endsAt: renewal });
    setAnnouncement(`Plan cancelled. It ends on ${sayDate(renewal)}.`);
  };

  const back = () => {
    if (page === "summary") {
      goTo(layout === "single" ? "reason" : "offer", -1, { outcome: null });
      return;
    }
    if (page === "offer") goTo("reason", -1);
  };

  const canGoBack = page === "summary" || page === "offer";

  /* ------------------------------- arming ------------------------------ */

  React.useEffect(() => {
    if (!armed) return;
    let done = false;
    const disarm = (why: string) => {
      if (done) return;
      done = true;
      setArmed(false);
      setAnnouncement(why);
    };
    const t = window.setTimeout(
      () => disarm("Cancel disarmed. Press Cancel anyway twice to cancel."),
      Math.max(1, armSeconds) * 1000,
    );
    const onVisibility = () => {
      if (document.hidden) disarm("Cancel disarmed.");
    };
    document.addEventListener("visibilitychange", onVisibility);
    let io: IntersectionObserver | null = null;
    if (root && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => !e.isIntersecting)) disarm("Cancel disarmed.");
      });
      io.observe(root);
    }
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, [armed, armSeconds, root]);

  // Focus lands on the new step's heading once it is in the DOM.
  React.useLayoutEffect(() => {
    if (focusReq === 0) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [focusReq, page]);

  /* ------------------------------ keyboard ----------------------------- */

  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    if (armed) {
      event.preventDefault();
      setArmed(false);
      setAnnouncement("Cancel disarmed.");
      cancelNode.current?.focus();
      return;
    }
    if (!canGoBack || inert) return;
    event.preventDefault();
    back();
  };

  /* ------------------------------- render ------------------------------ */

  const accent = TONES[tone] ?? TONES.cobalt;
  const reasonIds = reasons.map((r) => r.id);
  const offerIds = tailored.map((o) => o.id);
  const activeReason = current.reason ?? reasonIds[0] ?? null;
  const activeOffer = current.offer ?? offerIds[0] ?? null;
  const offerStep = cascade(Math.max(1, tailored.length));

  const panelVariants = {
    enter: (direction: number) => ({
      x: motionSafe ? direction * distances.shift : 0,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({
      x: motionSafe ? -direction * distances.step : 0,
      opacity: 0,
      transition: exitFor(durations.base),
    }),
  };

  const heading = (text: string, sub?: string) => (
    <div className="flex flex-col gap-0.5">
      <h3
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className={cn("font-semibold tracking-tight outline-none", d.head)}
      >
        {text}
      </h3>
      {sub ? <p className={cn("text-ink-2", d.text)}>{sub}</p> : null}
    </div>
  );

  const reasonList = (
    <div
      role="radiogroup"
      aria-label="Reason for leaving"
      className="flex flex-col gap-1"
    >
      {reasons.map((r) => {
        const checked = current.reason === r.id;
        return (
          <div key={r.id} className="flex flex-col">
            <button
              ref={(node) => {
                if (node) reasonNodes.current.set(r.id, node);
                else reasonNodes.current.delete(r.id);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-disabled={inert || undefined}
              aria-controls={r.freeText && checked ? otherId : undefined}
              tabIndex={activeReason === r.id ? 0 : -1}
              onClick={() => chooseReason(r.id)}
              onKeyDown={(event) => {
                if (inert) return;
                radioNav(event, reasonIds, current.reason, chooseReason);
              }}
              className={cn(
                "flex w-full items-start gap-3 rounded-3 border text-left transition-colors duration-200",
                d.row,
                checked
                  ? "border-[color-mix(in_oklab,var(--pi-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--pi-accent)_8%,transparent)]"
                  : "border-transparent hover:bg-surface-2",
                inert ? "cursor-default" : "cursor-pointer",
                FOCUS_RING,
              )}
            >
              <RadioDot checked={checked} motionSafe={motionSafe} />
              <span className="flex min-w-0 flex-col">
                <span className={cn("text-foreground", d.text)}>{r.label}</span>
                {r.hint ? (
                  <span className="text-[11px] text-ink-3">{r.hint}</span>
                ) : null}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {r.freeText && checked ? (
                <motion.div
                  key="other"
                  id={otherId}
                  className="overflow-hidden"
                  initial={
                    motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }
                  }
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{
                    height: motionSafe ? 0 : "auto",
                    opacity: 0,
                    transition: exitFor(durations.base),
                  }}
                  transition={
                    motionSafe
                      ? {
                          height: springs.glide,
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                          },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <div className="pt-1 pr-1 pb-2 pl-10">
                    <input
                      type="text"
                      aria-label="In your words"
                      placeholder="Tell us what happened, if you like"
                      value={current.otherText}
                      disabled={inert}
                      onChange={(event) =>
                        commit(
                          { ...current, otherText: event.target.value },
                          "otherText",
                        )
                      }
                      className={cn(
                        "h-9 w-full rounded-2 border border-hairline-strong bg-surface-1 px-3 text-[13px] text-foreground placeholder:text-ink-3",
                        FOCUS_RING,
                      )}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );

  const offerBody = (o: PauseOffer) => {
    if (o.kind === "pause") {
      return (
        <div className="flex flex-col gap-3">
          <Segmented
            id={`${uid}-${o.id}`}
            options={monthOptions}
            value={months}
            onChange={chooseMonths}
            motionSafe={motionSafe}
            inert={inert}
          />
          <CalendarStrip
            now={now}
            pausesAt={renewal}
            resumesAt={resumesAt}
            motionSafe={motionSafe}
            density={density}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-[12px] text-ink-2">
              Billing resumes{" "}
              <span className="font-medium text-foreground">
                {fmtDate(resumesAt)}
              </span>{" "}
              at {money(plan.price, plan)}/mo
            </p>
            <p className="flex items-baseline gap-1 text-[12px] text-ink-2">
              <span className="sr-only">
                Saves {money(plan.price * months, plan)}
              </span>
              <span aria-hidden>saves {plan.currency ?? "$"}</span>
              <Roll
                value={plan.price * months}
                motionSafe={motionSafe}
                className="font-mono text-[13px] text-(--pi-accent)"
              />
            </p>
          </div>
          <ul
            aria-label="Kept while paused"
            className="grid grid-cols-1 gap-x-4 gap-y-1 @min-[30rem]:grid-cols-2"
          >
            {kept.map((k, i) => (
              <li
                key={k}
                className="flex items-center gap-2 text-[12px] text-ink-2"
              >
                <Tick
                  motionSafe={motionSafe}
                  delay={i * cascade(kept.length)}
                  className="size-3 shrink-0 text-(--pi-accent)"
                />
                <span className="min-w-0 truncate">{k}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            aria-disabled={inert || undefined}
            onClick={confirmPause}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
              inert ? "cursor-default opacity-60" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            <CirclePause aria-hidden className="size-4" />
            Pause for {months} {months === 1 ? "month" : "months"}
          </button>
        </div>
      );
    }
    if (o.kind === "discount") {
      const pct = o.percent ?? 0;
      const forMonths = o.forMonths ?? 1;
      const reduced = plan.price * (1 - pct / 100);
      const until = addMonths(renewal, forMonths);
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <p className="flex items-baseline gap-1">
              <span className="font-mono text-[22px] leading-none font-medium text-(--pi-accent)">
                {money(reduced, plan)}
              </span>
              <span className="text-[12px] text-ink-2">/mo</span>
              <span className="ml-1 text-[12px] text-ink-3 line-through">
                {money(plan.price, plan)}
              </span>
            </p>
            <p className="text-[12px] text-ink-2">
              from {fmtDate(renewal)} until {fmtDate(until)}, then{" "}
              {money(plan.price, plan)}/mo
            </p>
          </div>
          <button
            type="button"
            aria-disabled={inert || undefined}
            onClick={() => confirmOffer(o)}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
              inert ? "cursor-default opacity-60" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            <BadgePercent aria-hidden className="size-4" />
            Take {pct}% off
          </button>
        </div>
      );
    }
    const target = o.plan ?? plan;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
          <p className="flex items-baseline gap-1">
            <span className="font-mono text-[22px] leading-none font-medium text-(--pi-accent)">
              {money(target.price, target)}
            </span>
            <span className="text-[12px] text-ink-2">/mo</span>
            <span className="ml-1 text-[12px] text-ink-3 line-through">
              {money(plan.price, plan)}
            </span>
          </p>
          <p className="text-[12px] text-ink-2">
            {target.name} from {fmtDate(renewal)}. Your sites and readings come
            with you.
          </p>
        </div>
        <button
          type="button"
          aria-disabled={inert || undefined}
          onClick={() => confirmOffer(o)}
          className={cn(
            "inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
            inert ? "cursor-default opacity-60" : "cursor-pointer",
            FOCUS_RING,
          )}
        >
          <Layers aria-hidden className="size-4" />
          Move to {target.name}
        </button>
      </div>
    );
  };

  const offerCards = (
    <div
      role="radiogroup"
      aria-label="Alternatives to cancelling"
      className="flex flex-col gap-2"
    >
      <AnimatePresence initial={live} mode="popLayout">
        {tailored.map((o, i) => {
          const open = current.offer === o.id;
          const Icon = OFFER_ICON[o.kind];
          const bodyId = `${uid}-${o.id}-body`;
          return (
            <motion.div
              key={o.id}
              layout={motionSafe ? "position" : false}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                layout: springs.glide,
                y: motionSafe
                  ? { ...springs.glide, delay: r3(i * offerStep) }
                  : { duration: 0 },
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: motionSafe ? r3(i * offerStep) : 0,
                },
              }}
              className={cn(
                "rounded-3 border transition-colors duration-200",
                open
                  ? "border-[color-mix(in_oklab,var(--pi-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--pi-accent)_6%,var(--bg-1))]"
                  : "border-hairline bg-surface-1",
              )}
            >
              <button
                ref={(node) => {
                  if (node) offerNodes.current.set(o.id, node);
                  else offerNodes.current.delete(o.id);
                }}
                type="button"
                role="radio"
                aria-checked={open}
                aria-controls={open ? bodyId : undefined}
                aria-disabled={inert || undefined}
                tabIndex={activeOffer === o.id ? 0 : -1}
                onClick={() => chooseOffer(o.id)}
                onKeyDown={(event) => {
                  if (inert) return;
                  radioNav(event, offerIds, current.offer, chooseOffer);
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-3 text-left",
                  d.card,
                  inert ? "cursor-default" : "cursor-pointer",
                  FOCUS_RING,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-2 border transition-colors duration-200",
                    open
                      ? "border-transparent bg-[color-mix(in_oklab,var(--pi-accent)_16%,transparent)] text-(--pi-accent)"
                      : "border-hairline bg-card text-ink-2",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("font-medium text-foreground", d.text)}>
                    {o.title}
                  </span>
                  <span className="text-[12px] text-ink-2">{o.detail}</span>
                </span>
                <RadioDot checked={open} motionSafe={motionSafe} />
              </button>
              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    key="body"
                    id={bodyId}
                    role="group"
                    aria-label={o.title}
                    className="overflow-hidden"
                    initial={
                      motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }
                    }
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{
                      height: motionSafe ? 0 : "auto",
                      opacity: 0,
                      transition: exitFor(durations.base),
                    }}
                    transition={
                      motionSafe
                        ? {
                            height: springs.glide,
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                            },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <div className={cn("border-t border-hairline", d.card)}>
                      {offerBody(o)}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  const offerArea =
    status === "loading" ? (
      <div aria-hidden className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 rounded-3 border border-hairline",
              d.card,
            )}
          >
            <span
              className="size-8 shrink-0 rounded-2 bg-surface-2 motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 90}ms` }}
            />
            <span className="flex flex-1 flex-col gap-2">
              <span
                className="h-3.5 w-2/5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 90 + 40}ms` }}
              />
              <span
                className="h-3 w-4/5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 90 + 80}ms` }}
              />
            </span>
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div
        className={cn(
          "flex flex-col items-center gap-3 rounded-3 border border-dashed border-hairline-strong text-center",
          d.card,
        )}
      >
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className={cn("text-foreground", d.text)}>
          The offers didn&apos;t load.
        </p>
        <p className="text-[12px] text-ink-2">
          You can still cancel below; the plan ends on {fmtDate(renewal)}.
        </p>
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
    ) : tailored.length === 0 ? (
      <div
        className={cn(
          "flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline-strong text-center",
          d.card,
        )}
      >
        <Inbox aria-hidden className="size-5 text-ink-3" />
        <p className={cn("text-foreground", d.text)}>
          {current.reason
            ? "Nothing to offer for this one"
            : "Pick a reason to see what we can do"}
        </p>
        <p className="max-w-[28rem] text-[12px] text-ink-2">
          {current.reason
            ? `We will not try to talk you round. ${plan.name} ends on ${fmtDate(renewal)} and your data is kept for 90 days in case you come back.`
            : "Some reasons have a pause, a discount or a smaller plan behind them."}
        </p>
      </div>
    ) : (
      offerCards
    );

  const summaryCard = (() => {
    const o = current.outcome;
    if (!o) return null;
    const taken =
      o.kind === "discount" || o.kind === "downgrade"
        ? offers.find((x) => x.id === o.offer)
        : undefined;
    const head =
      o.kind === "pause"
        ? `Paused until ${fmtDate(o.resumesAt)}`
        : o.kind === "cancel"
          ? `Your plan ends ${fmtDate(o.endsAt)}`
          : o.kind === "downgrade"
            ? `Moving to ${taken?.plan?.name ?? "a smaller plan"}`
            : `${taken?.percent ?? 0}% off applied`;
    const body =
      o.kind === "pause"
        ? `${plan.name} pauses on ${fmtDate(o.pausesAt)}. Nothing is billed until ${fmtDate(o.resumesAt)}, when it resumes at ${money(plan.price, plan)}/mo.`
        : o.kind === "cancel"
          ? `You keep ${plan.name} until then. Your data is kept for 90 days after, in case you come back.`
          : o.kind === "downgrade"
            ? `From ${fmtDate(renewal)}, ${money(taken?.plan?.price ?? plan.price, taken?.plan ?? plan)}/mo. Your sites and readings come with you.`
            : `${plan.name} at ${money(plan.price * (1 - (taken?.percent ?? 0) / 100), plan)}/mo from ${fmtDate(renewal)} for ${taken?.forMonths ?? 1} ${(taken?.forMonths ?? 1) === 1 ? "month" : "months"}, then ${money(plan.price, plan)}/mo.`;
    const Icon =
      o.kind === "pause"
        ? CirclePause
        : o.kind === "cancel"
          ? CalendarClock
          : o.kind === "downgrade"
            ? Layers
            : BadgePercent;
    const quiet = o.kind === "cancel";
    return (
      <motion.div
        key={o.kind}
        className={cn(
          "flex flex-col gap-4 rounded-3 border",
          quiet
            ? "border-hairline-strong bg-surface-1"
            : "border-[color-mix(in_oklab,var(--pi-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--pi-accent)_6%,var(--bg-1))]",
          d.card,
        )}
        initial={
          motionSafe
            ? { opacity: 0, scale: 0.96, y: distances.step }
            : { opacity: 0 }
        }
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={
          motionSafe
            ? { ...springs.recoil, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "relative flex size-9 shrink-0 items-center justify-center rounded-full border",
              quiet
                ? "border-hairline-strong text-ink-2"
                : "border-transparent bg-[color-mix(in_oklab,var(--pi-accent)_16%,transparent)] text-(--pi-accent)",
            )}
          >
            <Icon aria-hidden className="size-4" />
            <span
              className={cn(
                "absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border-2 border-card",
                quiet ? "bg-ink-2 text-card" : "bg-(--pi-accent) text-card",
              )}
            >
              <Tick motionSafe={motionSafe} delay={0.12} className="size-2.5" />
            </span>
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            {heading(head)}
            <p className={cn("text-ink-2", d.text)}>{body}</p>
          </div>
        </div>
        {o.kind === "pause" ? (
          <ul
            aria-label="Kept while paused"
            className="grid grid-cols-1 gap-x-4 gap-y-1 @min-[30rem]:grid-cols-2"
          >
            {kept.map((k, i) => (
              <li
                key={k}
                className="flex items-center gap-2 text-[12px] text-ink-2"
              >
                <Tick
                  motionSafe={motionSafe}
                  delay={0.2 + i * cascade(kept.length)}
                  className="size-3 shrink-0 text-(--pi-accent)"
                />
                <span className="min-w-0 truncate">{k}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {reason ? (
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Reason: {reason.label}
            {current.otherText.trim() ? ` - ${current.otherText.trim()}` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) onDone?.(o);
            }}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
              disabled ? "cursor-default opacity-60" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            Done
          </button>
          <button
            type="button"
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) back();
            }}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              disabled ? "cursor-default" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            {o.kind === "cancel" ? "Keep my plan" : "Change my mind"}
          </button>
        </div>
      </motion.div>
    );
  })();

  const reasonSkeleton = (
    <div aria-hidden className="flex flex-col gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={cn("flex items-center gap-3", d.row)}>
          <span
            className="size-4 shrink-0 rounded-full bg-surface-2 motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 80}ms` }}
          />
          <span
            className="h-3.5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
            style={{
              width: `${44 + ((i * 17) % 30)}%`,
              animationDelay: `${i * 80 + 40}ms`,
            }}
          />
        </div>
      ))}
    </div>
  );

  const panel = (p: StepPage) => {
    if (p === "summary") return summaryCard;
    if (p === "reason") {
      return (
        <div className={cn("flex flex-col", d.gap)}>
          {heading(
            headingFor("reason"),
            "One answer helps us offer the right thing.",
          )}
          {status === "loading" ? reasonSkeleton : reasonList}
        </div>
      );
    }
    if (p === "offer") {
      return (
        <div className={cn("flex flex-col", d.gap)}>
          {heading(
            headingFor("offer"),
            reason
              ? `Because: ${reason.label.toLowerCase()}`
              : "A few things we can do instead.",
          )}
          {offerArea}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-5 @min-[40rem]:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] @min-[40rem]:gap-6">
        <div className={cn("flex flex-col", d.gap)}>
          {heading(headingFor("reason"))}
          {status === "loading" ? reasonSkeleton : reasonList}
        </div>
        <div className={cn("flex flex-col", d.gap)}>
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Before you go
          </p>
          {offerArea}
        </div>
      </div>
    );
  };

  const showContinue = page === "reason";
  const showCancel = page !== "summary";
  const continueInert = inert || current.reason === null;

  return (
    <div
      ref={setRoot}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onKeyDown={onRootKeyDown}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--pi-accent" as string]: accent }}
    >
      <header
        className={cn(
          "flex shrink-0 items-start justify-between gap-3 border-b border-hairline",
          d.pad,
          "pb-3",
        )}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {subtitle}
          </p>
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-2">
            {plan.name} at {money(plan.price, plan)}/mo, renews{" "}
            {fmtDate(renewal)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {layout === "steps" ? (
            <div
              className="flex items-center gap-1"
              aria-label={`Step ${stepNumber} of ${STEP_COUNT}`}
              role="img"
            >
              {Array.from({ length: STEP_COUNT }, (_, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  className={cn(
                    "h-1.5 rounded-full",
                    i + 1 <= stepNumber ? "bg-(--pi-accent)" : "bg-surface-2",
                  )}
                  initial={false}
                  animate={{ width: i + 1 === stepNumber ? 18 : 6 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ))}
              <span className="ml-1.5 font-mono text-[10px] text-ink-3 tabular-nums">
                {stepNumber}/{STEP_COUNT}
              </span>
            </div>
          ) : null}
          <AnimatePresence initial={false}>
            {canGoBack ? (
              <motion.button
                key="back"
                type="button"
                aria-disabled={inert || undefined}
                onClick={() => {
                  if (!inert) back();
                }}
                initial={{ opacity: 0, x: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  inert ? "cursor-default" : "cursor-pointer",
                  FOCUS_RING,
                )}
              >
                <ArrowLeft aria-hidden className="size-3.5" />
                Back
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      <LayoutGroup id={uid}>
        <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <AnimatePresence initial={false} mode="popLayout" custom={dir}>
            <motion.div
              key={page}
              custom={dir}
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={
                motionSafe
                  ? {
                      ...springs.glide,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.base }
              }
              className={cn("w-full", d.pad)}
            >
              {panel(page)}
            </motion.div>
          </AnimatePresence>
        </div>
      </LayoutGroup>

      {showContinue || showCancel ? (
        <footer
          className={cn(
            "flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-hairline",
            d.pad,
            "py-3",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-ink-3" />
            <p className="min-w-0 truncate text-[11px] text-ink-3">
              {armed
                ? `Ends ${fmtDate(renewal)}. Data kept 90 days.`
                : "Nothing changes until you confirm."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showCancel ? (
              <CancelAnyway
                armed={armed}
                armSeconds={armSeconds}
                prominent={noOffers || status === "error"}
                inert={inert}
                onPress={pressCancel}
                nodeRef={(node) => {
                  cancelNode.current = node;
                }}
              />
            ) : null}
            {showContinue ? (
              <button
                type="button"
                aria-disabled={continueInert || undefined}
                onClick={() => {
                  if (!continueInert) goTo("offer", 1);
                }}
                className={cn(
                  "inline-flex h-8 items-center justify-center rounded-2 bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-opacity",
                  continueInert
                    ? "cursor-default opacity-50"
                    : "cursor-pointer hover:opacity-90",
                  FOCUS_RING,
                )}
              >
                Continue
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
