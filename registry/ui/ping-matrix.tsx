"use client";

import * as React from "react";

import {
  AnimatePresence,
  LayoutGroup,
  motion,
  type Transition,
} from "motion/react";
import { BellOff, Inbox, Moon, RotateCcw, TriangleAlert } from "lucide-react";

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

export type PingChannel = {
  id: string;
  /** The column heading, e.g. "Email". */
  label: string;
  /** The heading below a 40rem container, e.g. "App". @default the label */
  short?: string;
  /** How the preview names it: "a push", "an SMS". @default the label, lowercased */
  phrase?: string;
  /** Silenced during quiet hours: its ticks wear a moon badge. @default false */
  quiet?: boolean;
  /** Collapses into one digest row when the digest is hourly or daily. @default false */
  digest?: boolean;
};

export type PingRow = {
  id: string;
  /** The event kind, e.g. "Job assigned to you". */
  label: string;
  /** A short note beside the label, shown from a 40rem container. */
  hint?: string;
};

export type PingGroup = {
  id: string;
  /** The heading, e.g. "Jobs". */
  label: string;
  rows: PingRow[];
};

/** Row id to the ids of the channels that are on for it. */
export type PingValue = Record<string, string[]>;

/** Hours from 0 to 24 in half-hour steps; a start after the end wraps past midnight. */
export type PingQuietHours = { start: number; end: number };

export type PingDigest = "instant" | "hourly" | "daily";
export type PingTickStyle = "check" | "dot" | "fill";
export type PingDensity = "compact" | "cozy" | "roomy";
export type PingAccent = "cobalt" | "signal" | "ink";
export type PingStatus = "ready" | "loading" | "error";

export type PingChange = {
  /** One cell, a whole row (from its heading) or a whole column (from its heading or the digest row). */
  kind: "cell" | "row" | "column";
  rowId?: string;
  channelId?: string;
  on: boolean;
};

export type PingMatrixProps = {
  /** How a cell shows it is on: a drawn check, a dot, or a solid fill. @default "check" */
  tickStyle?: PingTickStyle;
  /** Row height, type size and column width. @default "cozy" */
  density?: PingDensity;
  /** The colour of ticks, the quiet window and the digest pill. @default "cobalt" */
  accent?: PingAccent;
  /** Event kinds under their headings, in row order. @default defaultPingGroups */
  groups?: PingGroup[];
  /** The channels, in column order. @default defaultPingChannels */
  channels?: PingChannel[];
  /** Controlled: each row's channels that are on. */
  value?: PingValue;
  /** Initial value when uncontrolled. @default defaultPingValue */
  defaultValue?: PingValue;
  /** Fires from the press or key that changed a cell, a row or a column. */
  onChange?: (value: PingValue, change: PingChange) => void;
  /** Controlled quiet-hours window; null is off. */
  quietHours?: PingQuietHours | null;
  /** Initial window when uncontrolled; null starts it off. @default defaultPingQuietHours */
  defaultQuietHours?: PingQuietHours | null;
  /** A handle moved or the switch flipped. */
  onQuietHoursChange?: (quietHours: PingQuietHours | null) => void;
  /** Controlled digest cadence. */
  digest?: PingDigest;
  /** Initial cadence when uncontrolled. @default "instant" */
  defaultDigest?: PingDigest;
  /** The cadence was changed. */
  onDigestChange?: (digest: PingDigest) => void;
  /** Whether the preferences have arrived. @default "ready" */
  status?: PingStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Notifications" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the matrix scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be changed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Fieldline's four channels: the app, email (digestable), push and SMS (both quiet at night). */
export const defaultPingChannels: PingChannel[] = [
  { id: "inapp", label: "In-app", short: "App", phrase: "in-app" },
  { id: "email", label: "Email", phrase: "an email", digest: true },
  { id: "push", label: "Push", phrase: "a push", quiet: true },
  { id: "sms", label: "SMS", phrase: "an SMS", quiet: true },
];

/** Nine Fieldline event kinds under four headings. */
export const defaultPingGroups: PingGroup[] = [
  {
    id: "jobs",
    label: "Jobs",
    rows: [
      {
        id: "job-assigned",
        label: "Job assigned to you",
        hint: "On your board",
      },
      { id: "job-moved", label: "Job rescheduled", hint: "Time or crew" },
      { id: "job-done", label: "Job completed", hint: "Signed off on site" },
    ],
  },
  {
    id: "approvals",
    label: "Approvals",
    rows: [
      {
        id: "approval-asked",
        label: "Approval requested",
        hint: "Waiting on you",
      },
      {
        id: "approval-decided",
        label: "Approval decided",
        hint: "Yours, answered",
      },
    ],
  },
  {
    id: "mentions",
    label: "Mentions",
    rows: [
      { id: "mention", label: "Mentioned in a note" },
      { id: "reply", label: "Reply to your note" },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    rows: [
      { id: "invoice", label: "Invoice issued", hint: "Monthly" },
      { id: "payment-failed", label: "Payment failed", hint: "Needs a card" },
    ],
  },
];

export const defaultPingValue: PingValue = {
  "job-assigned": ["inapp", "email", "push"],
  "job-moved": ["inapp", "push"],
  "job-done": ["inapp"],
  "approval-asked": ["inapp", "email", "push", "sms"],
  "approval-decided": ["inapp", "email"],
  mention: ["inapp", "push"],
  reply: ["inapp"],
  invoice: ["email"],
  "payment-failed": ["inapp", "email", "push", "sms"],
};

/** Ten at night until seven in the morning. */
export const defaultPingQuietHours: PingQuietHours = { start: 22, end: 7 };

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<PingAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

const DENSITY: Record<
  PingDensity,
  {
    row: string;
    head: string;
    group: string;
    text: string;
    tick: number;
    col: string;
  }
> = {
  compact: {
    row: "h-8",
    head: "h-12",
    group: "h-7",
    text: "text-[12px]",
    tick: 16,
    col: "[--pm-col:2.5rem] @min-[40rem]:[--pm-col:4rem]",
  },
  cozy: {
    row: "h-9",
    head: "h-[52px]",
    group: "h-8",
    text: "text-[13px]",
    tick: 18,
    col: "[--pm-col:2.75rem] @min-[40rem]:[--pm-col:4.5rem]",
  },
  roomy: {
    row: "h-10",
    head: "h-14",
    group: "h-9",
    text: "text-sm",
    tick: 20,
    col: "[--pm-col:3rem] @min-[40rem]:[--pm-col:5rem]",
  },
};

const DIGESTS: PingDigest[] = ["instant", "hourly", "daily"];
const DIGEST_WORD: Record<PingDigest, string> = {
  instant: "Instant",
  hourly: "Hourly",
  daily: "Daily",
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const HOUR_STEP = 0.5;
const HOURS = 24;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const isOn = (value: PingValue, rowId: string, channelId: string) =>
  (value[rowId] ?? []).includes(channelId);

/** "a, b and c" */
const joinWords = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** 22 to "22:00", 7.5 to "07:30", 24 to "00:00". */
export const formatHour = (hour: number) => {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const half = hour % 1 !== 0;
  return `${String(h).padStart(2, "0")}:${half ? "30" : "00"}`;
};

/** Counts the cells that are on, for hosts that show a total elsewhere. */
export const countPings = (
  value: PingValue,
  groups: PingGroup[],
  channels: PingChannel[],
) =>
  groups.reduce(
    (sum, g) =>
      sum +
      g.rows.reduce(
        (s, row) =>
          s + channels.filter((ch) => isOn(value, row.id, ch.id)).length,
        0,
      ),
    0,
  );

/** The window's segments on a 0 to 24 bar; a wrapping window has two. */
const segmentsOf = (quiet: PingQuietHours | null): [number, number][] => {
  if (!quiet || quiet.start === quiet.end) return [];
  if (quiet.start < quiet.end) return [[quiet.start, quiet.end]];
  return [
    [quiet.start, HOURS],
    [0, quiet.end],
  ];
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
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

/* ----------------------------------------------------------------------- */
/*                                   Tick                                   */
/* ----------------------------------------------------------------------- */

type TickMotion = { spring: Transition; delay: number };

const PLAIN: TickMotion = { spring: springs.flick, delay: 0 };

function Tick({
  on,
  mixed = false,
  quiet = false,
  tickStyle,
  size,
  tick,
  motionSafe,
}: {
  on: boolean;
  /** Some, not all: a short bar instead of the mark. */
  mixed?: boolean;
  /** Wears the moon badge: silenced during quiet hours. */
  quiet?: boolean;
  tickStyle: PingTickStyle;
  size: number;
  tick: TickMotion;
  motionSafe: boolean;
}) {
  const spring: Transition = motionSafe
    ? { ...tick.spring, delay: tick.delay }
    : { duration: 0 };
  const tween: Transition = motionSafe
    ? { duration: durations.fast, delay: tick.delay, ease: easings.enter }
    : { duration: 0 };
  const lit = on || mixed;
  const fill = tickStyle === "fill";
  const mark = fill ? "var(--bg-0)" : "var(--pm-accent)";
  return (
    <span
      aria-hidden
      className={cn(
        "relative block border transition-colors duration-200",
        tickStyle === "dot" ? "rounded-full" : "rounded-1",
        lit ? "border-(--pm-accent)" : "border-hairline-strong",
        tickStyle === "check" && lit && "bg-(--pm-wash)",
      )}
      style={{ width: size, height: size }}
    >
      {fill ? (
        <motion.span
          className="absolute inset-0 rounded-[inherit] bg-(--pm-accent)"
          initial={false}
          animate={{ scale: lit ? 1 : 0, opacity: lit ? 1 : 0 }}
          transition={{ scale: spring, opacity: tween }}
        />
      ) : null}
      {tickStyle === "dot" ? (
        <motion.span
          className="absolute inset-[24%] rounded-full bg-(--pm-accent)"
          initial={false}
          animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
          transition={{ scale: spring, opacity: tween }}
        />
      ) : (
        <svg viewBox="0 0 20 20" className="absolute inset-0 size-full">
          <motion.path
            d="M5 10.4 8.4 13.8 15 6.4"
            fill="none"
            stroke={mark}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
            transition={{ pathLength: spring, opacity: tween }}
          />
        </svg>
      )}
      <motion.span
        className="absolute inset-x-[24%] top-[calc(50%-1px)] h-0.5 rounded-full"
        style={{ background: mark }}
        initial={false}
        animate={{
          scaleX: mixed && !on ? 1 : 0,
          opacity: mixed && !on ? 1 : 0,
        }}
        transition={{ scaleX: spring, opacity: tween }}
      />
      <AnimatePresence initial={false}>
        {quiet && on ? (
          <motion.span
            key="moon"
            className="absolute -top-1.5 -right-1.5 flex size-3.5 items-center justify-center rounded-full border border-card bg-surface-2 text-ink-2"
            initial={motionSafe ? { scale: 0, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{
              scale: motionSafe ? 0.6 : 1,
              opacity: 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            <Moon aria-hidden className="size-2" />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Quiet bar                                */
/* ----------------------------------------------------------------------- */

type Handle = "start" | "end";

function QuietBar({
  quiet,
  onChange,
  onSettle,
  motionSafe,
  inert,
  uid,
}: {
  quiet: PingQuietHours;
  onChange: (next: PingQuietHours) => void;
  /** A drag ended or a key moved a handle: time to announce. */
  onSettle: (next: PingQuietHours) => void;
  motionSafe: boolean;
  inert: boolean;
  uid: string;
}) {
  const barRef = React.useRef<HTMLDivElement | null>(null);
  const handles = React.useRef(new Map<Handle, HTMLButtonElement>());
  const drag = React.useRef<{ handle: Handle; pointerId: number } | null>(null);
  const [dragging, setDragging] = React.useState<Handle | null>(null);

  const hourAt = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const raw = ((clientX - rect.left) / rect.width) * HOURS;
    return clamp(Math.round(raw / HOUR_STEP) * HOUR_STEP, 0, HOURS);
  };

  const set = (handle: Handle, hour: number): PingQuietHours | null => {
    const other = handle === "start" ? quiet.end : quiet.start;
    // The two handles never meet: an empty window would be no window.
    if (hour === other) return null;
    const next =
      handle === "start" ? { ...quiet, start: hour } : { ...quiet, end: hour };
    onChange(next);
    return next;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (inert || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    const named = target?.closest<HTMLElement>("[data-handle]")?.dataset
      .handle as Handle | undefined;
    const hour = hourAt(event.clientX);
    if (hour === null) return;
    let handle: Handle;
    if (named) handle = named;
    else {
      const dStart = Math.abs(hour - quiet.start);
      const dEnd = Math.abs(hour - quiet.end);
      handle =
        dStart === dEnd
          ? hour < quiet.start
            ? "start"
            : "end"
          : dStart < dEnd
            ? "start"
            : "end";
    }
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // capture is an optimisation; the gesture works without it
    }
    drag.current = { handle, pointerId: event.pointerId };
    setDragging(handle);
    handles.current.get(handle)?.focus({ preventScroll: true });
    if (!named) set(handle, hour);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const hour = hourAt(event.clientX);
    if (hour !== null) set(d.handle, hour);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onSettle(quiet);
  };

  const onKey = (event: React.KeyboardEvent, handle: Handle) => {
    if (inert) return;
    const current = handle === "start" ? quiet.start : quiet.end;
    let to: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      to = current + HOUR_STEP;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      to = current - HOUR_STEP;
    } else if (event.key === "PageUp") to = current + 1;
    else if (event.key === "PageDown") to = current - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = HOURS;
    if (to === null) return;
    event.preventDefault();
    const hour = clamp(to, 0, HOURS);
    // Stepping onto the other handle hops over it instead of stopping.
    const other = handle === "start" ? quiet.end : quiet.start;
    const target =
      hour === other
        ? clamp(hour + (to > current ? HOUR_STEP : -HOUR_STEP), 0, HOURS)
        : hour;
    if (target === other || target === current) return;
    const next = set(handle, target);
    if (next) onSettle(next);
  };

  const segments = segmentsOf(quiet);
  const pct = (h: number) => `${r3((h / HOURS) * 100)}%`;
  const handleTransition = (handle: Handle): Transition =>
    motionSafe && dragging !== handle ? springs.snap : { duration: 0 };
  const bandTransition: Transition =
    motionSafe && dragging === null ? springs.snap : { duration: 0 };

  return (
    <div
      ref={barRef}
      role="group"
      aria-label="Quiet hours window"
      className={cn(
        "relative h-9 touch-none select-none",
        inert ? "cursor-default" : "cursor-pointer",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-[9px] h-1.5 rounded-full bg-surface-2"
      />
      {[0, 1].map((i) => {
        const seg = segments[i];
        return (
          <motion.span
            key={i}
            aria-hidden
            className="absolute top-[9px] h-1.5 rounded-full bg-(--pm-accent)"
            initial={false}
            animate={{
              left: pct(seg ? seg[0] : i === 0 ? quiet.start : 0),
              width: pct(seg ? seg[1] - seg[0] : 0),
              opacity: seg ? 0.55 : 0,
            }}
            transition={{
              left: bandTransition,
              width: bandTransition,
              opacity: { duration: durations.fast },
            }}
          />
        );
      })}
      <span
        aria-hidden
        className="absolute inset-x-0 top-[22px] flex justify-between font-mono text-[9px] tracking-[0.08em] text-ink-3 tabular-nums"
      >
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className="w-0 overflow-visible whitespace-nowrap">
            <span
              className={cn("inline-block", h === 24 && "-translate-x-full")}
            >
              {h === 24 ? "24" : String(h).padStart(2, "0")}
            </span>
          </span>
        ))}
      </span>
      {(["start", "end"] as Handle[]).map((handle) => {
        const hour = handle === "start" ? quiet.start : quiet.end;
        return (
          <motion.button
            key={handle}
            ref={(node) => {
              if (node) handles.current.set(handle, node);
              else handles.current.delete(handle);
            }}
            type="button"
            data-handle={handle}
            role="slider"
            id={`${uid}-${handle}`}
            aria-label={handle === "start" ? "Quiet from" : "Quiet until"}
            aria-valuemin={0}
            aria-valuemax={HOURS}
            aria-valuenow={hour}
            aria-valuetext={formatHour(hour)}
            aria-disabled={inert || undefined}
            onKeyDown={(event) => onKey(event, handle)}
            initial={false}
            animate={{ left: pct(hour) }}
            transition={handleTransition(handle)}
            className={cn(
              "absolute top-0 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full",
              FOCUS_RING,
            )}
          >
            <motion.span
              aria-hidden
              className="block size-3.5 rounded-full border-2 border-(--pm-accent) bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_25%,transparent)]"
              initial={false}
              animate={{ scale: dragging === handle ? 1.25 : 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </motion.button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Ripple = { kind: "row" | "column"; id: string; seq: number };

type Focus =
  | { kind: "row"; rowId: string }
  | { kind: "column"; channelId: string }
  | { kind: "digest"; channelId: string };

type Dir = "left" | "right" | "up" | "down";

/**
 * A notification preferences matrix: event kinds down the side under their
 * headings, channels across the top, a tick in every cell. A press draws the
 * tick on `springs.flick`. The tick in a row's heading sets the whole row,
 * and the cells follow it in a ripple on `cascade(n)`, each landing on
 * `springs.snap`; a column's heading does the same down the column.
 *
 * At the foot, a digest control (instant, hourly, daily) collapses the Email
 * column: its ticks glide out of their rows into one digest row on
 * `springs.glide`, and glide home when the digest is switched off. Beside it
 * the quiet-hours strip is a 24-hour bar with a window between two handles;
 * while it is on, every push and SMS tick wears a moon badge, and the preview
 * line says so. That line, under the grid, says in words what the focused
 * row will do: "Job assigned to you: in-app, a push and a daily email digest."
 *
 * The matrix is one grid: arrows move, Home/End reach a row's ends, Space
 * or Enter toggles, Shift+Space sets the row, Ctrl+Space the column. The
 * digest is a radio group and each quiet-hours handle a slider (arrows step
 * half an hour, PageUp/PageDown an hour). Under reduced motion nothing
 * travels: ticks appear, the digest row cross-fades in, and every change is
 * still announced.
 */
export function PingMatrix({
  tickStyle = "check",
  density = "cozy",
  accent = "cobalt",
  groups = defaultPingGroups,
  channels = defaultPingChannels,
  value,
  defaultValue = defaultPingValue,
  onChange,
  quietHours,
  defaultQuietHours = defaultPingQuietHours,
  onQuietHoursChange,
  digest,
  defaultDigest = "instant",
  onDigestChange,
  status = "ready",
  onRetry,
  title = "Notifications",
  label,
  height = 540,
  disabled = false,
  className,
}: PingMatrixProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const previewId = `${uid}-preview`;
  const quietSwitchId = `${uid}-quiet`;

  const [ownValue, setOwnValue] = React.useState<PingValue>(defaultValue);
  const [ownQuiet, setOwnQuiet] = React.useState<PingQuietHours | null>(
    defaultQuietHours,
  );
  const [ownDigest, setOwnDigest] = React.useState<PingDigest>(defaultDigest);
  const current = value ?? ownValue;
  const quiet = quietHours === undefined ? ownQuiet : quietHours;
  const cadence = digest ?? ownDigest;
  const digestOn = cadence !== "instant";
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [ripple, setRipple] = React.useState<Ripple | null>(null);
  const [active, setActive] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<Focus | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // The window the switch restores when quiet hours are turned back on.
  const [lastWindow, setLastWindow] = React.useState<PingQuietHours>(
    quiet ?? defaultPingQuietHours,
  );
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const digestNodes = React.useRef(new Map<PingDigest, HTMLButtonElement>());

  /* -------------------------------- data ------------------------------- */

  const rows = groups.flatMap((g) => g.rows);
  const rowIndex = new Map(rows.map((r, i) => [r.id, i]));
  const digestChannels = channels.filter((ch) => ch.digest);
  const collapsed = (ch: PingChannel) => digestOn && Boolean(ch.digest);
  const quietChannels = channels.filter((ch) => ch.quiet);
  const quietNames = joinWords(quietChannels.map((ch) => ch.label));

  const onCount = countPings(current, groups, channels);
  const total = rows.length * channels.length;
  const size = DENSITY[density];
  const columnCount = channels.length + 1;
  const template = `minmax(0,1fr) repeat(${channels.length}, var(--pm-col))`;

  const columnOn = (channelId: string) =>
    rows.filter((r) => isOn(current, r.id, channelId)).length;

  /* ------------------------------ sentences ---------------------------- */

  const quietSentence = (names: string[]) =>
    quiet && names.length > 0
      ? ` ${joinWords(names)} ${names.length === 1 ? "waits" : "wait"} until ${formatHour(quiet.end)} during quiet hours.`
      : "";

  const describeRow = (row: PingRow) => {
    const parts: string[] = [];
    const silenced: string[] = [];
    for (const ch of channels) {
      if (!isOn(current, row.id, ch.id)) continue;
      parts.push(
        collapsed(ch)
          ? `a ${cadence} ${ch.label.toLowerCase()} digest`
          : (ch.phrase ?? ch.label.toLowerCase()),
      );
      if (ch.quiet && quiet) silenced.push(ch.label);
    }
    const list =
      parts.length === 0 ? "nothing, it stays silent" : joinWords(parts);
    return `${row.label}: ${list}.${quietSentence(silenced)}`;
  };

  const describeColumn = (ch: PingChannel) => {
    const n = columnOn(ch.id);
    const scope =
      n === rows.length
        ? "every event"
        : n === 0
          ? "no events"
          : `${n} of ${rows.length} events`;
    return `${ch.label}: on for ${scope}.${quietSentence(ch.quiet ? [ch.label] : [])}`;
  };

  const describeDigest = (ch: PingChannel) => {
    const n = columnOn(ch.id);
    const scope =
      n === rows.length
        ? "every event"
        : n === 0
          ? "no events"
          : `${n} of ${rows.length} events`;
    return `${ch.label} digest: one ${cadence} ${ch.label.toLowerCase()} covering ${scope}.`;
  };

  const preview = (() => {
    if (rows.length === 0 || channels.length === 0) return "";
    if (focused?.kind === "column") {
      const ch = channels.find((c) => c.id === focused.channelId);
      if (ch) return collapsed(ch) ? describeDigest(ch) : describeColumn(ch);
    }
    if (focused?.kind === "digest") {
      const ch = channels.find((c) => c.id === focused.channelId);
      if (ch) return describeDigest(ch);
    }
    const row =
      (focused?.kind === "row" && rows.find((r) => r.id === focused.rowId)) ||
      rows[0];
    return row ? describeRow(row) : "";
  })();

  /** The row's sentence against a value that has not rendered yet. */
  const describeRowWith = (next: PingValue, row: PingRow) => {
    const parts: string[] = [];
    for (const ch of channels) {
      if (!isOn(next, row.id, ch.id)) continue;
      parts.push(
        collapsed(ch)
          ? `a ${cadence} ${ch.label.toLowerCase()} digest`
          : (ch.phrase ?? ch.label.toLowerCase()),
      );
    }
    return `${row.label}: ${parts.length === 0 ? "nothing, it stays silent" : joinWords(parts)}.`;
  };

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: PingValue, change: PingChange) => {
    if (value === undefined) setOwnValue(next);
    onChange?.(next, change);
  };

  const setCell = (
    base: PingValue,
    rowId: string,
    channelId: string,
    on: boolean,
  ): PingValue => {
    const list = base[rowId] ?? [];
    const has = list.includes(channelId);
    if (has === on) return base;
    return {
      ...base,
      [rowId]: on
        ? [...list, channelId]
        : list.filter((id) => id !== channelId),
    };
  };

  const toggleCell = (row: PingRow, ch: PingChannel) => {
    if (inert) return;
    const on = !isOn(current, row.id, ch.id);
    const next = setCell(current, row.id, ch.id, on);
    setRipple(null);
    commit(next, { kind: "cell", rowId: row.id, channelId: ch.id, on });
    const after = describeRowWith(next, row);
    setAnnouncement(
      `${ch.label} ${on ? "on" : "off"} for ${row.label}. ${after}`,
    );
  };

  const setRow = (row: PingRow) => {
    if (inert) return;
    const eligible = channels.filter((ch) => !collapsed(ch));
    if (eligible.length === 0) return;
    const on = !eligible.every((ch) => isOn(current, row.id, ch.id));
    let next = current;
    for (const ch of eligible) next = setCell(next, row.id, ch.id, on);
    setRipple((r) => ({ kind: "row", id: row.id, seq: (r?.seq ?? 0) + 1 }));
    commit(next, { kind: "row", rowId: row.id, on });
    setAnnouncement(
      `Every channel ${on ? "on" : "off"} for ${row.label}. ${describeRowWith(next, row)}`,
    );
  };

  const setColumn = (ch: PingChannel, withRipple: boolean) => {
    if (inert || rows.length === 0) return;
    const on = !rows.every((r) => isOn(current, r.id, ch.id));
    let next = current;
    for (const r of rows) next = setCell(next, r.id, ch.id, on);
    setRipple((r) =>
      withRipple ? { kind: "column", id: ch.id, seq: (r?.seq ?? 0) + 1 } : null,
    );
    commit(next, { kind: "column", channelId: ch.id, on });
    setAnnouncement(
      collapsed(ch)
        ? `${ch.label} digest ${on ? "on" : "off"}: one ${cadence} ${ch.label.toLowerCase()} covering ${on ? "every event" : "no events"}.`
        : `${ch.label} ${on ? "on" : "off"} for all ${rows.length} events.`,
    );
  };

  const changeDigest = (next: PingDigest) => {
    if (inert || next === cadence) return;
    if (digest === undefined) setOwnDigest(next);
    onDigestChange?.(next);
    const names = joinWords(digestChannels.map((ch) => ch.label.toLowerCase()));
    setAnnouncement(
      next === "instant"
        ? `Digest off: ${names || "email"} sends as it happens.`
        : `${DIGEST_WORD[next]} digest: ${names || "email"} collapses to one row.`,
    );
    setRipple(null);
  };

  const changeQuiet = (next: PingQuietHours | null) => {
    if (next) setLastWindow(next);
    if (quietHours === undefined) setOwnQuiet(next);
    onQuietHoursChange?.(next);
  };

  const toggleQuiet = () => {
    if (inert) return;
    const next = quiet ? null : lastWindow;
    changeQuiet(next);
    setAnnouncement(
      next
        ? `Quiet hours on, from ${formatHour(next.start)} until ${formatHour(next.end)}. ${quietNames || "Nothing"} waits.`
        : "Quiet hours off.",
    );
  };

  const settleQuiet = (next: PingQuietHours) => {
    setAnnouncement(
      `Quiet hours from ${formatHour(next.start)} until ${formatHour(next.end)}.`,
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  // The grid's focusable cells by row and column; null where a position has
  // nothing to focus (the corner, a collapsed column, a digest row's gaps).
  const navRows: (string | null)[][] = [];
  navRows.push([
    null,
    ...channels.map((ch) => (collapsed(ch) ? null : `h:${ch.id}`)),
  ]);
  if (digestOn && digestChannels.length > 0) {
    navRows.push([
      null,
      ...channels.map((ch) => (ch.digest ? `d:${ch.id}` : null)),
    ]);
  }
  for (const row of rows) {
    navRows.push([
      `r:${row.id}`,
      ...channels.map((ch) => (collapsed(ch) ? null : `c:${row.id}:${ch.id}`)),
    ]);
  }
  const positions = new Map<string, [number, number]>();
  navRows.forEach((cells, r) =>
    cells.forEach((key, c) => {
      if (key) positions.set(key, [r, c]);
    }),
  );
  const firstKey = navRows.flat().find((k): k is string => k !== null) ?? null;
  const activeKey = active && positions.has(active) ? active : firstKey;

  const focusKey = (key: string | null | undefined) => {
    if (key) nodes.current.get(key)?.focus({ preventScroll: false });
  };

  const move = (from: string, dir: Dir | "home" | "end" | "first" | "last") => {
    const pos = positions.get(from);
    if (!pos) return;
    const [r, c] = pos;
    const row = navRows[r] ?? [];
    if (dir === "home") return focusKey(row.find((k) => k !== null));
    if (dir === "end")
      return focusKey([...row].reverse().find((k) => k !== null));
    if (dir === "first") return focusKey(firstKey);
    if (dir === "last") {
      return focusKey(
        [...navRows.flat()].reverse().find((k): k is string => k !== null),
      );
    }
    if (dir === "left" || dir === "right") {
      const step = dir === "left" ? -1 : 1;
      for (let i = c + step; i >= 0 && i < row.length; i += step) {
        const k = row[i];
        if (k) return focusKey(k);
      }
      return;
    }
    const step = dir === "up" ? -1 : 1;
    for (let i = r + step; i >= 0 && i < navRows.length; i += step) {
      const k = navRows[i]?.[c];
      if (k) return focusKey(k);
    }
  };

  const onNav = (event: React.KeyboardEvent, key: string) => {
    const k = event.key;
    if (k === "ArrowRight") move(key, "right");
    else if (k === "ArrowLeft") move(key, "left");
    else if (k === "ArrowDown") move(key, "down");
    else if (k === "ArrowUp") move(key, "up");
    else if (k === "Home")
      move(key, event.ctrlKey || event.metaKey ? "first" : "home");
    else if (k === "End")
      move(key, event.ctrlKey || event.metaKey ? "last" : "end");
    else return;
    event.preventDefault();
  };

  const onDigestNav = (event: React.KeyboardEvent, from: PingDigest) => {
    const i = DIGESTS.indexOf(from);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = DIGESTS.length - 1;
    else return;
    event.preventDefault();
    const target = DIGESTS[clamp(to, 0, DIGESTS.length - 1)];
    if (!target) return;
    digestNodes.current.get(target)?.focus();
    changeDigest(target);
  };

  /* ------------------------------- render ------------------------------ */

  const tickFor = (row: PingRow, ch: PingChannel): TickMotion => {
    if (!ripple) return PLAIN;
    if (ripple.kind === "row" && ripple.id === row.id) {
      const i = channels.findIndex((c) => c.id === ch.id);
      return {
        spring: springs.snap,
        delay: r3(Math.max(0, i) * cascade(channels.length)),
      };
    }
    if (ripple.kind === "column" && ripple.id === ch.id) {
      const i = rowIndex.get(row.id) ?? 0;
      return { spring: springs.snap, delay: r3(i * cascade(rows.length)) };
    }
    return PLAIN;
  };

  const register = (key: string) => (node: HTMLButtonElement | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  };

  const cellButton = (
    key: string,
    opts: {
      ariaLabel: string;
      checked: boolean | "mixed";
      onPress: (event: React.MouseEvent | React.KeyboardEvent) => void;
      onFocus: () => void;
      children: React.ReactNode;
      className?: string;
    },
  ) => (
    <button
      ref={register(key)}
      type="button"
      role="checkbox"
      aria-checked={opts.checked}
      aria-label={opts.ariaLabel}
      aria-describedby={`${hintId} ${previewId}`}
      aria-disabled={inert || undefined}
      tabIndex={activeKey === key ? 0 : -1}
      onFocus={() => {
        setActive(key);
        opts.onFocus();
      }}
      onClick={(event) => opts.onPress(event)}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          opts.onPress(event);
          return;
        }
        onNav(event, key);
      }}
      className={cn(
        "flex items-center justify-center rounded-2",
        inert ? "cursor-default" : "cursor-pointer",
        FOCUS_RING,
        opts.className,
      )}
    >
      {opts.children}
    </button>
  );

  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;
  const ghostTransition: Transition = {
    layout: springs.glide,
    opacity: { duration: durations.fast, delay: 0.4 },
  };

  const headerRow = (
    <div
      role="row"
      className={cn(
        "sticky top-0 z-10 grid items-end border-b border-hairline bg-card px-3",
        size.head,
      )}
      style={{ gridTemplateColumns: template }}
    >
      <div
        role="columnheader"
        className="pb-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        Event
      </div>
      {channels.map((ch) => {
        const n = columnOn(ch.id);
        const checked: boolean | "mixed" =
          n === rows.length && rows.length > 0
            ? true
            : n === 0
              ? false
              : "mixed";
        const off = collapsed(ch);
        return (
          <div
            key={ch.id}
            role="columnheader"
            className="flex flex-col items-center gap-1 pb-1.5"
          >
            <span className="max-w-full truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <span className="@min-[40rem]:hidden">
                {ch.short ?? ch.label}
              </span>
              <span className="hidden @min-[40rem]:inline">{ch.label}</span>
            </span>
            <div className="relative flex h-7 items-center justify-center">
              <AnimatePresence initial={false} mode="popLayout">
                {off ? (
                  <motion.span
                    key="digest"
                    className="font-mono text-[9px] tracking-[0.08em] text-(--pm-accent) uppercase"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  >
                    {cadence}
                  </motion.span>
                ) : (
                  <motion.span
                    key="tick"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  >
                    {cellButton(`h:${ch.id}`, {
                      ariaLabel: `${ch.label} for every event`,
                      checked,
                      onPress: () => setColumn(ch, true),
                      onFocus: () =>
                        setFocused({ kind: "column", channelId: ch.id }),
                      children: (
                        <Tick
                          on={checked === true}
                          mixed={checked === "mixed"}
                          tickStyle={tickStyle}
                          size={size.tick}
                          tick={PLAIN}
                          motionSafe={motionSafe}
                        />
                      ),
                      className: "size-7",
                    })}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );

  const digestRow =
    digestOn && digestChannels.length > 0 ? (
      <motion.div
        key="digest-row"
        role="row"
        layout={motionSafe ? "position" : false}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={{
          layout: springs.glide,
          opacity: { duration: durations.base, ease: easings.enter },
        }}
        className={cn(
          "grid items-center border-b border-hairline bg-(--pm-wash) px-3",
          size.row,
        )}
        style={{ gridTemplateColumns: template }}
      >
        <div
          role="rowheader"
          className={cn("flex min-w-0 items-center gap-2 pl-7", size.text)}
        >
          <span className="truncate text-foreground">
            {joinWords(digestChannels.map((ch) => ch.label))} digest
          </span>
          <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]:inline">
            one {cadence} {digestChannels.length === 1 ? "message" : "bundle"}
          </span>
        </div>
        {channels.map((ch) => {
          if (!ch.digest) return <div key={ch.id} role="gridcell" />;
          const n = columnOn(ch.id);
          const checked: boolean | "mixed" =
            n === rows.length && rows.length > 0
              ? true
              : n === 0
                ? false
                : "mixed";
          return (
            <div
              key={ch.id}
              role="gridcell"
              className="relative flex items-center justify-center"
            >
              {/* The rows' ticks, gliding in to stack under the digest tick. */}
              {motionSafe
                ? rows.map((row) => (
                    <motion.span
                      key={row.id}
                      aria-hidden
                      layoutId={`${uid}-em-${ch.id}-${row.id}`}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={ghostTransition}
                      className="pointer-events-none absolute"
                    >
                      <Tick
                        on={isOn(current, row.id, ch.id)}
                        tickStyle={tickStyle}
                        size={size.tick}
                        tick={PLAIN}
                        motionSafe={false}
                      />
                    </motion.span>
                  ))
                : null}
              <motion.span
                className="relative"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: durations.fast,
                  delay: motionSafe ? 0.3 : 0,
                }}
              >
                {cellButton(`d:${ch.id}`, {
                  ariaLabel: `${ch.label} digest, ${cadence}, for every event`,
                  checked,
                  onPress: () => setColumn(ch, false),
                  onFocus: () =>
                    setFocused({ kind: "digest", channelId: ch.id }),

                  children: (
                    <Tick
                      on={checked === true}
                      mixed={checked === "mixed"}
                      tickStyle={tickStyle}
                      size={size.tick}
                      tick={PLAIN}
                      motionSafe={motionSafe}
                    />
                  ),
                  className: "size-7",
                })}
              </motion.span>
            </div>
          );
        })}
      </motion.div>
    ) : null;

  const eventRow = (row: PingRow, inGroup: number, groupSize: number) => {
    const eligible = channels.filter((ch) => !collapsed(ch));
    const n = eligible.filter((ch) => isOn(current, row.id, ch.id)).length;
    const checked: boolean | "mixed" =
      eligible.length > 0 && n === eligible.length
        ? true
        : n === 0
          ? false
          : "mixed";
    return (
      <motion.div
        key={row.id}
        role="row"
        layout={motionSafe ? "position" : false}
        transition={{ layout: springs.glide }}
        className={cn(
          "grid items-center px-3",
          size.row,
          inGroup < groupSize - 1 && "border-b border-hairline",
        )}
        style={{ gridTemplateColumns: template }}
      >
        <div
          role="rowheader"
          className={cn("flex min-w-0 items-center gap-2", size.text)}
        >
          {cellButton(`r:${row.id}`, {
            ariaLabel: `${row.label}, every channel`,
            checked,
            onPress: () => setRow(row),
            onFocus: () => setFocused({ kind: "row", rowId: row.id }),

            children: (
              <Tick
                on={checked === true}
                mixed={checked === "mixed"}
                tickStyle={tickStyle}
                size={size.tick - 4}
                tick={PLAIN}
                motionSafe={motionSafe}
              />
            ),
            className: "size-5 shrink-0",
          })}
          <span className="truncate text-foreground">{row.label}</span>
          {row.hint ? (
            <span className="hidden min-w-0 truncate text-[11px] text-ink-3 @min-[40rem]:inline">
              {row.hint}
            </span>
          ) : null}
        </div>
        {channels.map((ch) => {
          const on = isOn(current, row.id, ch.id);
          if (collapsed(ch)) {
            return (
              <div
                key={ch.id}
                role="gridcell"
                aria-label={`${ch.label} for ${row.label}: in the digest`}
                className="flex items-center justify-center"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 w-2.5 rounded-full transition-colors duration-200",
                    on ? "bg-(--pm-accent) opacity-60" : "bg-hairline-strong",
                  )}
                />
              </div>
            );
          }
          const silenced = Boolean(ch.quiet && quiet);
          return (
            <div
              key={ch.id}
              role="gridcell"
              className="flex items-center justify-center"
            >
              {cellButton(`c:${row.id}:${ch.id}`, {
                ariaLabel: `${ch.label} for ${row.label}${silenced && on ? ", waits during quiet hours" : ""}`,
                checked: on,
                onPress: (event) => {
                  if (event.shiftKey) setRow(row);
                  else if (event.ctrlKey || event.metaKey) setColumn(ch, true);
                  else toggleCell(row, ch);
                },
                onFocus: () => setFocused({ kind: "row", rowId: row.id }),

                children: (
                  <motion.span
                    layoutId={
                      motionSafe && ch.digest
                        ? `${uid}-em-${ch.id}-${row.id}`
                        : undefined
                    }
                    initial={false}
                    transition={{ layout: springs.glide }}
                    className="block"
                  >
                    <Tick
                      on={on}
                      quiet={silenced}
                      tickStyle={tickStyle}
                      size={size.tick}
                      tick={tickFor(row, ch)}
                      motionSafe={motionSafe}
                    />
                  </motion.span>
                ),
                className: "size-7",
              })}
            </div>
          );
        })}
      </motion.div>
    );
  };

  const groupRow = (group: PingGroup) => {
    const n = group.rows.reduce(
      (s, row) =>
        s + channels.filter((ch) => isOn(current, row.id, ch.id)).length,
      0,
    );
    return (
      <motion.div
        key={`g:${group.id}`}
        role="row"
        layout={motionSafe ? "position" : false}
        transition={{ layout: springs.glide }}
        className={cn(
          "grid items-center border-b border-hairline bg-surface-1 px-3",
          size.group,
        )}
        style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
      >
        <div
          role="rowheader"
          aria-colspan={columnCount}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
        >
          {group.label}
        </div>
        <div
          role="gridcell"
          className="font-mono text-[10px] text-ink-3 tabular-nums"
        >
          {n}/{group.rows.length * channels.length}
        </div>
      </motion.div>
    );
  };

  const skeleton = (
    <div aria-hidden className="flex flex-col">
      <div
        className={cn(
          "grid items-end border-b border-hairline px-3 pb-2",
          size.head,
        )}
        style={{ gridTemplateColumns: template }}
      >
        <span className="h-2.5 w-10 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        {Array.from({ length: Math.max(channels.length, 4) }, (_, i) => (
          <span key={i} className="flex flex-col items-center gap-1.5">
            <span
              className="h-2 w-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 60}ms` }}
            />
            <span
              className="rounded-1 bg-surface-2 motion-safe:animate-pulse"
              style={{
                width: size.tick,
                height: size.tick,
                animationDelay: `${i * 60}ms`,
              }}
            />
          </span>
        ))}
      </div>
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "grid items-center border-b border-hairline px-3",
            size.row,
          )}
          style={{ gridTemplateColumns: template }}
        >
          <span className="flex items-center gap-2">
            <span className="size-3.5 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            <span
              className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{
                width: 72 + ((i * 37) % 60),
                animationDelay: `${i * 80}ms`,
              }}
            />
          </span>
          {Array.from({ length: Math.max(channels.length, 4) }, (_, j) => (
            <span key={j} className="flex items-center justify-center">
              <span
                className="rounded-1 bg-surface-2 motion-safe:animate-pulse"
                style={{
                  width: size.tick,
                  height: size.tick,
                  animationDelay: `${i * 80 + j * 40}ms`,
                }}
              />
            </span>
          ))}
        </div>
      ))}
    </div>
  );

  const empty =
    channels.length === 0 ? (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
        <BellOff aria-hidden className="size-5 text-ink-3" />
        <p className="text-sm text-foreground">No channels configured.</p>
        <p className="max-w-[26ch] text-[12px] text-ink-3">
          Add a channel and every event here can reach you through it.
        </p>
      </div>
    ) : rows.length === 0 ? (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
        <Inbox aria-hidden className="size-5 text-ink-3" />
        <p className="text-sm text-foreground">Nothing to be told about.</p>
        <p className="max-w-[26ch] text-[12px] text-ink-3">
          This account has no event kinds yet.
        </p>
      </div>
    ) : null;

  const quietOn = quiet !== null;
  const quietWindow = quiet ?? lastWindow;

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        size.col,
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--pm-accent" as string]: accentVar,
        ["--pm-wash" as string]: `color-mix(in oklab, ${accentVar} 12%, transparent)`,
      }}
    >
      <p id={hintId} className="sr-only">
        Space toggles. Shift and Space sets the row. Control and Space sets the
        column.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        {ready && rows.length > 0 && channels.length > 0 ? (
          <p className="flex shrink-0 items-baseline gap-1 text-[12px] text-ink-2">
            <span className="sr-only">
              {onCount} of {total} on
            </span>
            <Roll
              value={onCount}
              motionSafe={motionSafe}
              className="font-mono text-[13px] text-foreground"
            />
            <span aria-hidden>of {total}</span>
            <span aria-hidden className="hidden @min-[24rem]:inline">
              on
            </span>
          </p>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-hairline">
        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              Your preferences didn&apos;t load.
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
        ) : status === "loading" ? (
          skeleton
        ) : empty ? (
          empty
        ) : (
          <LayoutGroup id={uid}>
            <div
              role="grid"
              aria-labelledby={titleId}
              aria-rowcount={navRows.length + groups.length}
              aria-colcount={columnCount}
              className="flex min-w-0 flex-col"
            >
              {headerRow}
              <AnimatePresence initial={false}>{digestRow}</AnimatePresence>
              {groups.map((group) => (
                <React.Fragment key={group.id}>
                  {groupRow(group)}
                  {group.rows.map((row, i) =>
                    eventRow(row, i, group.rows.length),
                  )}
                </React.Fragment>
              ))}
            </div>
          </LayoutGroup>
        )}
      </div>

      {ready && !empty ? (
        <div className="relative shrink-0 border-t border-hairline px-4 py-2">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              key={preview}
              id={previewId}
              className="min-h-[1.25rem] text-[12px] leading-5 text-ink-2"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.flick, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <span className="mr-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                You get
              </span>
              {preview}
            </motion.p>
          </AnimatePresence>
        </div>
      ) : null}

      {ready && !empty ? (
        <div className="flex shrink-0 flex-col gap-3 border-t border-hairline bg-surface-1 px-4 py-3 @min-[40rem]:flex-row @min-[40rem]:items-start @min-[40rem]:gap-5">
          <div className="flex shrink-0 flex-col gap-1.5">
            <span
              id={`${uid}-digest-label`}
              className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              {joinWords(digestChannels.map((ch) => ch.label)) || "Email"}{" "}
              digest
            </span>
            <div
              role="radiogroup"
              aria-labelledby={`${uid}-digest-label`}
              className="relative inline-flex h-7 items-center gap-0.5 rounded-2 border border-hairline bg-card p-0.5"
            >
              {DIGESTS.map((d) => {
                const checked = cadence === d;
                return (
                  <button
                    key={d}
                    ref={(node) => {
                      if (node) digestNodes.current.set(d, node);
                      else digestNodes.current.delete(d);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-disabled={inert || undefined}
                    tabIndex={checked ? 0 : -1}
                    onClick={() => changeDigest(d)}
                    onKeyDown={(event) => onDigestNav(event, d)}
                    className={cn(
                      "relative z-10 h-full rounded-[4px] px-2.5 text-[11px] transition-colors",
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
                        layoutId={motionSafe ? `${uid}-digest-pill` : undefined}
                        transition={{ layout: springs.snap }}
                        className="absolute inset-0 -z-10 rounded-[4px] bg-(--pm-wash) shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--pm-accent)_35%,transparent)]"
                      />
                    ) : null}
                    {DIGEST_WORD[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  id={quietSwitchId}
                  aria-checked={quietOn}
                  aria-disabled={inert || undefined}
                  aria-label="Quiet hours"
                  onClick={toggleQuiet}
                  className={cn(
                    "relative h-4 w-7 shrink-0 rounded-full border transition-colors duration-200",
                    quietOn
                      ? "border-(--pm-accent) bg-(--pm-accent)"
                      : "border-hairline-strong bg-surface-2",
                    inert ? "cursor-default" : "cursor-pointer",
                    FOCUS_RING,
                  )}
                >
                  <motion.span
                    aria-hidden
                    className={cn(
                      "absolute top-0.5 left-0.5 block size-2.5 rounded-full",
                      quietOn ? "bg-card" : "bg-ink-3",
                    )}
                    initial={false}
                    animate={{ x: quietOn ? 12 : 0 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                </button>
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Quiet hours
                </span>
              </span>
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={
                    quietOn ? `${quietWindow.start}-${quietWindow.end}` : "off"
                  }
                  aria-hidden
                  className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast }}
                >
                  {quietOn
                    ? `${formatHour(quietWindow.start)} to ${formatHour(quietWindow.end)}`
                    : "Off"}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="relative min-h-9">
              <AnimatePresence initial={false}>
                {quiet ? (
                  <motion.div
                    key="bar"
                    initial={{
                      opacity: 0,
                      y: motionSafe ? -distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                    className="absolute inset-x-0 top-0"
                  >
                    <QuietBar
                      quiet={quiet}
                      onChange={changeQuiet}
                      onSettle={settleQuiet}
                      motionSafe={motionSafe}
                      inert={inert}
                      uid={uid}
                    />
                  </motion.div>
                ) : (
                  <motion.p
                    key="off"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                    className="absolute inset-x-0 top-0 flex h-9 items-center text-[11px] text-ink-3"
                  >
                    {quietNames || "Nothing"} can reach you at any hour.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
