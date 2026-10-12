"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  AlarmClock,
  Check,
  EyeOff,
  Inbox,
  RotateCcw,
  TrendingUp,
  TriangleAlert,
  Undo2,
  UserPlus,
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

export type TriageFilter = "all" | "unhandled" | "regressed" | "mine";
export type TriageAction = "resolve" | "ignore" | "assign" | "snooze";
export type TriageSparkline = "bars" | "line" | "none";
export type TriageDensity = "compact" | "cozy" | "roomy";
export type TriageAccent = "cobalt" | "signal" | "ink";
export type TriageStatus = "ready" | "loading" | "error";

export type TriagePerson = { id: string; name: string };

/** One error fingerprint and everything the inbox knows about it. */
export type TriageGroup = {
  id: string;
  /** The fingerprint's short hash, e.g. "a3f9c1". */
  fingerprint: string;
  /** The error's class, e.g. "TypeError". */
  kind: string;
  message: string;
  /** The top frame of the stack: function, file and line. */
  frame: { fn: string; file: string; line: number };
  /** Occurrences per hour over the last 24 hours, oldest first. */
  series: number[];
  /** Events and distinct users, all time. */
  events: number;
  users: number;
  /** First and latest occurrence, in ms. */
  firstSeen: number;
  lastSeen: number;
  /** Caught by a handler, or it crashed the request. */
  handled: boolean;
  /** Seen again after it was resolved. @default false */
  regressed?: boolean;
  /** A person's id. */
  assignee?: string;
  /** The release it was last seen in. */
  release?: string;
};

/** What the triager decided about one group. */
export type TriageDecision = {
  groupId: string;
  action: TriageAction;
  /** For assign: the person's id. */
  assignee?: string;
  /** When it was made, in ms, from `now`. */
  at: number;
};

export type ExceptionTriageProps = {
  /** The error groups, in inbox order. @default defaultTriageGroups */
  groups?: TriageGroup[];
  /** Who a group can be assigned to. @default defaultTriagePeople */
  people?: TriagePerson[];
  /** The triager, by person id; "Mine" filters to their groups. @default the first person */
  me?: string;
  /** Controlled decisions; a group with one has left the inbox. */
  value?: TriageDecision[];
  /** Initial decisions when uncontrolled. @default [] */
  defaultValue?: TriageDecision[];
  /** Fires with every decision made or taken back, with the whole set. */
  onChange?: (value: TriageDecision[]) => void;
  /** A card was resolved, ignored, assigned or snoozed. It is already in `value`. */
  onDecide?: (decision: TriageDecision, group: TriageGroup) => void;
  /** Undo was pressed before the toast ran out; the decision is already gone from `value`. */
  onUndo?: (decision: TriageDecision, group: TriageGroup) => void;
  /** Controlled filter. */
  filter?: TriageFilter;
  /** Initial filter when uncontrolled. @default "all" */
  defaultFilter?: TriageFilter;
  /** A filter was chosen, from a press or an arrow key. */
  onFilterChange?: (filter: TriageFilter) => void;
  /** How long the undo toast stays, in seconds. It waits while hovered, focused or the tab is hidden. @default 5 */
  undoSeconds?: number;
  /** How long Snooze hides a group for, in hours; only named in the toast. @default 24 */
  snoozeHours?: number;
  /** The moment ages count from, in ms; never read from the clock. @default defaultTriageNow */
  now?: number;
  /** How the 24h series is drawn on each card: hourly bars, a line, or not at all. @default "bars" */
  sparkline?: TriageSparkline;
  /** Card padding, type size and how much of the detail is shown. @default "cozy" */
  density?: TriageDensity;
  /** The colour of the chosen filter, the latest hour and the undo toast's bar: blue, green or ink. @default "cobalt" */
  accent?: TriageAccent;
  /** Whether the groups have arrived. @default "ready" */
  status?: TriageStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Exceptions" */
  title?: string;
  /** The project named under the heading. @default "Gaugeworks Pay" */
  project?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the inbox in px; the list scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be decided. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultTriageNow = Date.UTC(2026, 9, 12, 9, 30);

export const defaultTriagePeople: TriagePerson[] = [
  { id: "noor", name: "Noor Haddad" },
  { id: "sam", name: "Sam Okafor" },
  { id: "lena", name: "Lena Fischer" },
  { id: "rafael", name: "Rafael Cuesta" },
  { id: "yuki", name: "Yuki Tanaka" },
];

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Shape = "steady" | "spike" | "burst" | "fading" | "fresh";

/** 24 hourly counts with a recognisable shape, seeded so every render agrees. */
const hours = (seed: number, shape: Shape, scale: number): number[] => {
  const rand = mulberry32(seed);
  return Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    const noise = 0.6 + rand() * 0.8;
    let base = 1;
    if (shape === "spike") base = t > 0.8 ? 0.4 + (t - 0.8) * 5 : 0.12;
    else if (shape === "burst")
      base = t > 0.45 && t < 0.65 ? 1 : t >= 0.65 ? 0.25 : 0.08;
    else if (shape === "fading") base = Math.max(0.05, 1 - t * 1.1);
    else if (shape === "fresh") base = t > 0.9 ? 1 : 0;
    return Math.round(base * scale * noise);
  });
};

const N = defaultTriageNow;

/** Fourteen groups from Gaugeworks Pay's production inbox. */
export const defaultTriageGroups: TriageGroup[] = [
  {
    id: "g-a3f9c1",
    fingerprint: "a3f9c1",
    kind: "TypeError",
    message: "Cannot read properties of undefined (reading 'currency')",
    frame: { fn: "formatAmount", file: "checkout/summary.ts", line: 118 },
    series: hours(11, "spike", 70),
    events: 1284,
    users: 412,
    firstSeen: N - 11 * DAY,
    lastSeen: N - 2 * MIN,
    handled: false,
    regressed: true,
    release: "2026.10.11-3",
  },
  {
    id: "g-7be210",
    fingerprint: "7be210",
    kind: "ReferenceError",
    message: "ledgerClient is not defined",
    frame: { fn: "postEntry", file: "ledger/client.ts", line: 12 },
    series: hours(12, "fresh", 9),
    events: 9,
    users: 9,
    firstSeen: N - 22 * MIN,
    lastSeen: N - 4 * MIN,
    handled: false,
    release: "2026.10.12-1",
  },
  {
    id: "g-c41d8e",
    fingerprint: "c41d8e",
    kind: "InvariantViolation",
    message: "Ledger entry debits do not balance credits",
    frame: { fn: "assertBalanced", file: "ledger/post.ts", line: 140 },
    series: hours(13, "fresh", 2),
    events: 2,
    users: 1,
    firstSeen: N - 46 * MIN,
    lastSeen: N - 46 * MIN,
    handled: false,
    assignee: "noor",
    release: "2026.10.12-1",
  },
  {
    id: "g-58f0aa",
    fingerprint: "58f0aa",
    kind: "RangeError",
    message: "Maximum call stack size exceeded",
    frame: { fn: "walkLedger", file: "ledger/replay.ts", line: 74 },
    series: hours(14, "burst", 14),
    events: 48,
    users: 3,
    firstSeen: N - 3 * HOUR,
    lastSeen: N - 9 * MIN,
    handled: false,
    release: "2026.10.11-3",
  },
  {
    id: "g-e2c7b4",
    fingerprint: "e2c7b4",
    kind: "ZodError",
    message: "invalid_type at body.line_items[2].sku: expected string",
    frame: { fn: "parseOrder", file: "api/orders/post.ts", line: 41 },
    series: hours(15, "spike", 22),
    events: 212,
    users: 67,
    firstSeen: N - 2 * DAY,
    lastSeen: N - 31 * MIN,
    handled: true,
    regressed: true,
    release: "2026.10.11-3",
  },
  {
    id: "g-9d13f7",
    fingerprint: "9d13f7",
    kind: "Error",
    message: "Refund exceeds captured amount by 0.01",
    frame: { fn: "refund", file: "pay/refunds.ts", line: 96 },
    series: hours(16, "burst", 5),
    events: 14,
    users: 11,
    firstSeen: N - 5 * HOUR,
    lastSeen: N - 25 * MIN,
    handled: false,
    regressed: true,
    assignee: "lena",
    release: "2026.10.11-2",
  },
  {
    id: "g-f06e32",
    fingerprint: "f06e32",
    kind: "TimeoutError",
    message: "Webhook delivery to merchant exceeded 8000 ms",
    frame: { fn: "deliver", file: "hooks/dispatch.ts", line: 161 },
    series: hours(17, "steady", 26),
    events: 622,
    users: 140,
    firstSeen: N - 29 * DAY,
    lastSeen: N - 6 * MIN,
    handled: true,
    assignee: "noor",
    release: "2026.10.11-3",
  },
  {
    id: "g-2a9c55",
    fingerprint: "2a9c55",
    kind: "ChunkLoadError",
    message: "Loading chunk 412 failed (/_next/static/chunks/412.js)",
    frame: { fn: "loadRoute", file: "app/router.ts", line: 201 },
    series: hours(18, "fading", 30),
    events: 174,
    users: 171,
    firstSeen: N - DAY,
    lastSeen: N - 3 * HOUR,
    handled: true,
    regressed: true,
    release: "2026.10.11-3",
  },
  {
    id: "g-b7d4e9",
    fingerprint: "b7d4e9",
    kind: "SyntaxError",
    message: "Unexpected token < in JSON at position 0",
    frame: { fn: "fetchRates", file: "fx/rates.ts", line: 58 },
    series: hours(19, "fading", 18),
    events: 301,
    users: 88,
    firstSeen: N - 8 * DAY,
    lastSeen: N - 2 * HOUR,
    handled: true,
    assignee: "rafael",
    release: "2026.10.10-1",
  },
  {
    id: "g-6c0f21",
    fingerprint: "6c0f21",
    kind: "PaymentDeclinedError",
    message: "Issuer returned 05 (do not honor)",
    frame: { fn: "authorize", file: "pay/issuer.ts", line: 233 },
    series: hours(20, "steady", 160),
    events: 3917,
    users: 2210,
    firstSeen: N - 62 * DAY,
    lastSeen: N - MIN,
    handled: true,
    release: "2026.10.11-3",
  },
  {
    id: "g-d8e1a0",
    fingerprint: "d8e1a0",
    kind: "NetworkError",
    message: "Failed to fetch /v2/wallet",
    frame: { fn: "getWallet", file: "wallet/api.ts", line: 33 },
    series: hours(21, "steady", 85),
    events: 2048,
    users: 980,
    firstSeen: N - 90 * DAY,
    lastSeen: N - 12 * MIN,
    handled: true,
    release: "2026.10.11-3",
  },
  {
    id: "g-4f7b3c",
    fingerprint: "4f7b3c",
    kind: "TypeError",
    message:
      "Failed to execute 'postMessage' on 'Window': target origin mismatch",
    frame: { fn: "syncFrame", file: "embed/bridge.ts", line: 63 },
    series: hours(22, "steady", 16),
    events: 391,
    users: 230,
    firstSeen: N - 17 * DAY,
    lastSeen: N - 50 * MIN,
    handled: true,
    release: "2026.10.11-3",
  },
  {
    id: "g-15e6d2",
    fingerprint: "15e6d2",
    kind: "QuotaExceededError",
    message: "localStorage write failed: quota exceeded",
    frame: { fn: "persistCart", file: "cart/storage.ts", line: 27 },
    series: hours(23, "steady", 2),
    events: 57,
    users: 51,
    firstSeen: N - 40 * DAY,
    lastSeen: N - DAY,
    handled: true,
    release: "2026.10.09-2",
  },
  {
    id: "g-a0c9b8",
    fingerprint: "a0c9b8",
    kind: "AbortError",
    message: "The user aborted a request",
    frame: { fn: "pollStatus", file: "checkout/poll.ts", line: 88 },
    series: hours(24, "steady", 210),
    events: 5120,
    users: 1800,
    firstSeen: N - 120 * DAY,
    lastSeen: N - MIN,
    handled: true,
    release: "2026.10.11-3",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const FILTERS: TriageFilter[] = ["all", "unhandled", "regressed", "mine"];

const FILTER_NAME: Record<TriageFilter, string> = {
  all: "All",
  unhandled: "Unhandled",
  regressed: "Regressed",
  mine: "Mine",
};

const ACCENTS: Record<TriageAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

const DENSITY: Record<
  TriageDensity,
  { pad: string; gap: string; message: string; spark: number; detail: boolean }
> = {
  compact: {
    pad: "px-3 py-2",
    gap: "gap-1",
    message: "text-[12px]",
    spark: 18,
    detail: false,
  },
  cozy: {
    pad: "px-3.5 py-2.5",
    gap: "gap-1.5",
    message: "text-[13px]",
    spark: 24,
    detail: true,
  },
  roomy: {
    pad: "px-4 py-3.5",
    gap: "gap-2",
    message: "text-[14px]",
    spark: 30,
    detail: true,
  },
};

const ACTION_PAST: Record<TriageAction, string> = {
  resolve: "Resolved",
  ignore: "Ignored",
  assign: "Assigned",
  snooze: "Snoozed",
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const MENU_W = 224;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** "4m" / "4 minutes ago": how long ago `at` was, for a card and for a reader. */
const ago = (at: number, now: number): { short: string; long: string } => {
  const ms = Math.max(0, now - at);
  if (ms < MIN) return { short: "now", long: "just now" };
  const m = Math.round(ms / MIN);
  if (m < 60)
    return { short: `${m}m`, long: `${plural(m, "minute", "minutes")} ago` };
  const h = Math.round(ms / HOUR);
  if (h < 24)
    return { short: `${h}h`, long: `${plural(h, "hour", "hours")} ago` };
  const d = Math.round(ms / DAY);
  if (d < 14)
    return { short: `${d}d`, long: `${plural(d, "day", "days")} ago` };
  const w = Math.round(d / 7);
  return { short: `${w}w`, long: `${plural(w, "week", "weeks")} ago` };
};

const compact = (n: number) =>
  n >= 10_000
    ? `${Math.round(n / 1000)}k`
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : String(n);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

const matches = (group: TriageGroup, filter: TriageFilter, me: string) =>
  filter === "all"
    ? true
    : filter === "unhandled"
      ? !group.handled
      : filter === "regressed"
        ? group.regressed === true
        : group.assignee === me;

/** The groups still waiting on a decision, in inbox order. */
export const pendingTriage = (
  groups: TriageGroup[],
  value: TriageDecision[],
): TriageGroup[] => {
  const done = new Set(value.map((d) => d.groupId));
  return groups.filter((g) => !done.has(g.id));
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
/*                                 Sparkline                                */
/* ----------------------------------------------------------------------- */

function Sparkline({
  series,
  style,
  height,
}: {
  series: number[];
  style: TriageSparkline;
  height: number;
}) {
  const n = Math.max(1, series.length);
  const w = 96;
  const max = Math.max(1, ...series);
  const total = series.reduce((a, b) => a + b, 0);
  if (style === "none") return null;
  const label = `${plural(total, "event", "events")} in the last 24 hours, peaking at ${max} an hour`;
  if (style === "bars") {
    const slot = w / n;
    const bar = Math.max(1, slot - 1);
    return (
      <svg
        role="img"
        aria-label={label}
        width={w}
        height={height}
        viewBox={`0 0 ${w} ${height}`}
        className="shrink-0 overflow-visible"
      >
        {series.map((v, i) => {
          const h = Math.max(1.5, (v / max) * height);
          return (
            <rect
              key={i}
              x={r3(i * slot)}
              y={r3(height - h)}
              width={r3(bar)}
              height={r3(h)}
              rx={0.75}
              fill={
                i === n - 1
                  ? "var(--xt-accent)"
                  : "color-mix(in oklab, var(--ink-3) 48%, transparent)"
              }
            />
          );
        })}
      </svg>
    );
  }
  const pts = series.map((v, i) => ({
    x: r3((i / (n - 1 || 1)) * w),
    y: r3(height - 1.5 - (v / max) * (height - 3)),
  }));
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg
      role="img"
      aria-label={label}
      width={w}
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      className="shrink-0 overflow-visible"
    >
      <path
        d={`${path} L${w} ${height} L0 ${height} Z`}
        fill="color-mix(in oklab, var(--xt-accent) 12%, transparent)"
      />
      <path
        d={path}
        fill="none"
        stroke="color-mix(in oklab, var(--ink-3) 70%, var(--xt-accent))"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last ? (
        <circle cx={last.x} cy={last.y} r={2.25} fill="var(--xt-accent)" />
      ) : null}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Card                                   */
/* ----------------------------------------------------------------------- */

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-4.5 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[8px] font-semibold tracking-[0.02em] text-ink-2",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      aria-hidden
      className="ml-1 hidden rounded-1 border border-hairline px-1 font-mono text-[9px] leading-[14px] text-ink-3 @min-[40rem]:inline-block"
    >
      {children}
    </kbd>
  );
}

type ActionButtonProps = {
  icon: React.ReactNode;
  children: React.ReactNode;
  hint: string;
  primary?: boolean;
  disabled: boolean;
  motionSafe: boolean;
  expanded?: boolean;
  nodeRef?: (node: HTMLButtonElement | null) => void;
  onPress: () => void;
};

function ActionButton({
  icon,
  children,
  hint,
  primary,
  disabled,
  motionSafe,
  expanded,
  nodeRef,
  onPress,
}: ActionButtonProps) {
  return (
    <motion.button
      ref={nodeRef}
      type="button"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      aria-expanded={expanded}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onPress();
      }}
      whileTap={disabled || !motionSafe ? undefined : { scale: 0.96 }}
      transition={springs.flick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 border px-2 text-[11.5px] font-medium whitespace-nowrap transition-colors",
        primary
          ? "border-transparent bg-primary text-primary-foreground hover:brightness-110"
          : "border-hairline bg-transparent text-ink-2 hover:bg-surface-2 hover:text-foreground",
        expanded && "bg-surface-2 text-foreground",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <span className="hidden @min-[30rem]:inline-flex">{icon}</span>
      {children}
      <Kbd>{hint}</Kbd>
    </motion.button>
  );
}

type CardProps = {
  group: TriageGroup;
  people: TriagePerson[];
  me: string;
  now: number;
  density: TriageDensity;
  sparkline: TriageSparkline;
  active: boolean;
  disabled: boolean;
  motionSafe: boolean;
  live: boolean;
  delay: number;
  hintId: string;
  menuOpen: boolean;
  nodeRef: (node: HTMLLIElement | null) => void;
  assignRef: (node: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onAction: (action: TriageAction) => void;
  onAssign: () => void;
};

const cardVariants = {
  show: { opacity: 1, x: 0, y: 0 },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * distances.shift,
    transition: exitFor(durations.base),
  }),
};

function Card({
  group,
  people,
  me,
  now,
  density,
  sparkline,
  active,
  disabled,
  motionSafe,
  live,
  delay,
  hintId,
  menuOpen,
  nodeRef,
  assignRef,
  onFocus,
  onKeyDown,
  onAction,
  onAssign,
}: CardProps) {
  const d = DENSITY[density];
  const owner = people.find((p) => p.id === group.assignee);
  const last = ago(group.lastSeen, now);
  const first = ago(group.firstSeen, now);
  const flags = [
    !group.handled ? "unhandled" : null,
    group.regressed ? "regressed" : null,
    owner ? `assigned to ${owner.id === me ? "you" : owner.name}` : null,
  ].filter(Boolean);

  return (
    <motion.li
      ref={nodeRef}
      role="option"
      aria-selected={active}
      aria-describedby={hintId}
      aria-label={`${group.kind}: ${group.message}. In ${group.frame.fn}, ${group.frame.file} line ${group.frame.line}. ${compact(group.events)} events, ${compact(group.users)} users, last seen ${last.long}${flags.length ? `, ${flags.join(", ")}` : ""}.`}
      tabIndex={active ? 0 : -1}
      data-active={active || undefined}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      layout={motionSafe ? "position" : false}
      variants={cardVariants}
      initial={
        live ? { opacity: 0, y: motionSafe ? distances.step : 0 } : false
      }
      animate="show"
      exit="exit"
      transition={{
        layout: springs.glide,
        y: motionSafe ? { ...springs.glide, delay } : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter, delay },
      }}
      className={cn(
        "relative flex flex-col rounded-3 border border-hairline bg-surface-0 transition-colors",
        d.pad,
        d.gap,
        active && "border-hairline-strong bg-surface-1",
        menuOpen && "z-10",
        FOCUS_RING,
      )}
    >
      <div className="grid gap-x-4 gap-y-2 @min-[40rem]:grid-cols-[minmax(0,1fr)_auto]">
        <div className={cn("flex min-w-0 flex-col", d.gap)}>
          <p className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.02em] text-ink-3">
            <span className="shrink-0">{group.fingerprint}</span>
            {d.detail && group.release ? (
              <>
                <span aria-hidden className="shrink-0">
                  ·
                </span>
                <span className="truncate">{group.release}</span>
              </>
            ) : null}
            <span aria-hidden className="shrink-0">
              ·
            </span>
            <span className="shrink-0" title={last.long}>
              {last.short}
            </span>
          </p>
          <p
            className={cn(
              "line-clamp-2 min-w-0 leading-snug break-words text-foreground",
              d.message,
            )}
          >
            <span className="font-semibold">{group.kind}</span>
            <span className="text-ink-3">: </span>
            <span className="text-ink">{group.message}</span>
          </p>
          <p className="min-w-0 truncate font-mono text-[11px] text-ink-2">
            {group.frame.fn}
            <span className="text-ink-3">
              {" "}
              in {group.frame.file}:{group.frame.line}
            </span>
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {!group.handled ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-1.5 font-mono text-[10px] tracking-[0.04em] text-danger uppercase">
                <span aria-hidden className="size-1.5 rounded-full bg-danger" />
                Unhandled
              </span>
            ) : null}
            {group.regressed ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-1.5 font-mono text-[10px] tracking-[0.04em] text-warn uppercase">
                <TrendingUp aria-hidden className="size-3" />
                Regressed
              </span>
            ) : null}
            {owner ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-full border border-hairline px-1 pr-1.5 text-[10.5px] text-ink-2">
                <Avatar name={owner.name} />
                {owner.id === me ? "You" : owner.name}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 items-end justify-between gap-3 @min-[40rem]:flex-col @min-[40rem]:items-end @min-[40rem]:justify-start">
          <Sparkline series={group.series} style={sparkline} height={d.spark} />
          <dl className="flex shrink-0 items-baseline gap-3 font-mono text-[11px] text-ink-3 tabular-nums">
            <div className="flex items-baseline gap-1">
              <dd className="text-[12px] text-foreground">
                {compact(group.events)}
              </dd>
              <dt>events</dt>
            </div>
            <div className="flex items-baseline gap-1">
              <dd className="text-[12px] text-foreground">
                {compact(group.users)}
              </dd>
              <dt>users</dt>
            </div>
            {d.detail ? (
              <div className="flex items-baseline gap-1" title={first.long}>
                <dt>first</dt>
                <dd className="text-[12px] text-foreground">{first.short}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1.5">
        <ActionButton
          icon={<Check aria-hidden className="size-3.5" />}
          hint="R"
          primary
          disabled={disabled}
          motionSafe={motionSafe}
          onPress={() => onAction("resolve")}
        >
          Resolve
        </ActionButton>
        <ActionButton
          icon={<EyeOff aria-hidden className="size-3.5" />}
          hint="I"
          disabled={disabled}
          motionSafe={motionSafe}
          onPress={() => onAction("ignore")}
        >
          Ignore
        </ActionButton>
        <ActionButton
          icon={<UserPlus aria-hidden className="size-3.5" />}
          hint="A"
          disabled={disabled}
          motionSafe={motionSafe}
          expanded={menuOpen}
          nodeRef={assignRef}
          onPress={onAssign}
        >
          Assign
        </ActionButton>
        <ActionButton
          icon={<AlarmClock aria-hidden className="size-3.5" />}
          hint="S"
          disabled={disabled}
          motionSafe={motionSafe}
          onPress={() => onAction("snooze")}
        >
          Snooze
        </ActionButton>
      </div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Skeleton                                */
/* ----------------------------------------------------------------------- */

function Skeleton({ density }: { density: TriageDensity }) {
  const d = DENSITY[density];
  return (
    <div aria-hidden className="flex flex-col gap-2 px-3 py-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex flex-col gap-2 rounded-3 border border-hairline",
            d.pad,
          )}
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <span className="h-2.5 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
          <span
            className="h-3.5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
            style={{ width: `${62 - ((i * 17) % 25)}%` }}
          />
          <span className="h-2.5 w-40 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
          <div className="mt-1 flex gap-1.5">
            {Array.from({ length: 4 }, (_, j) => (
              <span
                key={j}
                className="h-7 w-16 rounded-2 bg-surface-2 motion-safe:animate-pulse"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Clear state                               */
/* ----------------------------------------------------------------------- */

function ClearState({
  heading,
  detail,
  celebrate,
  motionSafe,
  live,
}: {
  heading: string;
  detail: string;
  celebrate: boolean;
  motionSafe: boolean;
  live: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 py-10 text-center">
      {celebrate ? (
        <motion.span
          aria-hidden
          initial={live ? { opacity: 0, scale: motionSafe ? 0.6 : 1 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            motionSafe
              ? { ...springs.recoil, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
          className="flex size-11 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--xt-accent)_16%,transparent)] text-(--xt-accent)"
        >
          <svg viewBox="0 0 20 20" className="size-5">
            <motion.path
              d="M4.5 10.5 8.3 14.2 15.5 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={live && motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={
                motionSafe
                  ? { ...springs.flick, delay: durations.fast }
                  : { duration: 0 }
              }
            />
          </svg>
        </motion.span>
      ) : (
        <Inbox aria-hidden className="size-5 text-ink-3" />
      )}
      <p className="text-sm font-medium text-foreground">{heading}</p>
      <p className="max-w-[28ch] text-[12px] text-ink-3">{detail}</p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Menu = {
  groupId: string;
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

type Undo = {
  decision: TriageDecision;
  group: TriageGroup;
  seq: number;
};

type FocusReq = { id: string | null; fallback: TriageFilter; seq: number };

type Bar = { frac: number; left: number; held: boolean };

/**
 * An inbox of error groups, worked one card at a time. Each card is a
 * fingerprint: its class and message, the top frame, a 24-hour sparkline,
 * events and users, and when it was first and last seen. Resolve, Ignore,
 * Assign (a small menu of people) or Snooze decides it: the card slides out
 * on the exit ease — right for most decisions, left for Ignore — while the
 * cards below rise into the gap on `springs.glide`, the counters in the
 * header roll on `springs.snap`, and an undo toast lands at the foot on
 * `springs.recoil` with a bar draining for `undoSeconds`. Undo brings the
 * card back to its place on glide. The bar waits while the toast is hovered
 * or focused and while the tab is hidden, so a decision is never lost to a
 * switched window.
 *
 * A filter row narrows the list — all, unhandled, regressed, mine — with a
 * pill that slides between choices on snap. When the last card in a filter
 * is decided the inbox reads clear: a check settles in on recoil and draws
 * on flick.
 *
 * The filters are a radio group (arrows choose) and the cards one listbox
 * with a roving tab stop: Up/Down and Home/End move, R resolves, I ignores,
 * A opens Assign (arrows, Enter, Escape), S snoozes, and U takes the last
 * decision back from anywhere in the surface. Every decision is announced
 * with the number still open. Under reduced motion nothing travels: cards
 * fade out and in place, the pill and the toast cross-fade, and the
 * counters change at once.
 */
export function ExceptionTriage({
  groups = defaultTriageGroups,
  people = defaultTriagePeople,
  me,
  value,
  defaultValue,
  onChange,
  onDecide,
  onUndo,
  filter,
  defaultFilter = "all",
  onFilterChange,
  undoSeconds = 5,
  snoozeHours = 24,
  now = defaultTriageNow,
  sparkline = "bars",
  density = "cozy",
  accent = "cobalt",
  status = "ready",
  onRetry,
  title = "Exceptions",
  project = "Gaugeworks Pay",
  label,
  height = 540,
  disabled = false,
  className,
}: ExceptionTriageProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const menuId = `${uid}-menu`;
  const toastId = `${uid}-toast`;

  const [own, setOwn] = React.useState<TriageDecision[]>(
    () => defaultValue ?? [],
  );
  const current = value ?? own;
  const [ownFilter, setOwnFilter] = React.useState<TriageFilter>(defaultFilter);
  const filterNow = filter ?? ownFilter;
  const self = me ?? people[0]?.id ?? "";
  const ready = status === "ready";
  const inert = disabled || !ready;

  // False for the server render and hydration, so cards already on the page
  // never cascade in; true for anything that mounts later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [exitDir, setExitDir] = React.useState(1);
  const [restoredId, setRestoredId] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<Menu | null>(null);
  const [undo, setUndo] = React.useState<Undo | null>(null);
  // The toast's bar: `left` ms remain; while `held` it stays at `frac`.
  const [bar, setBar] = React.useState<Bar | null>(null);
  const [focusReq, setFocusReq] = React.useState<FocusReq | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLLIElement>());
  const assignNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const radioNodes = React.useRef(new Map<TriageFilter, HTMLButtonElement>());
  const undoTimer = React.useRef<number | null>(null);
  const undoLeft = React.useRef(0);
  const undoStarted = React.useRef(0);
  const holds = React.useRef(new Set<string>());
  const syncHold = React.useRef<(() => void) | null>(null);
  const seq = React.useRef(0);

  /* -------------------------------- data ------------------------------- */

  const pending = pendingTriage(groups, current);
  const visible = pending.filter((g) => matches(g, filterNow, self));
  const counts = Object.fromEntries(
    FILTERS.map((f) => [f, pending.filter((g) => matches(g, f, self)).length]),
  ) as Record<TriageFilter, number>;
  const known = new Set(groups.map((g) => g.id));
  const tally = (action: TriageAction) =>
    current.filter((d) => d.action === action && known.has(d.groupId)).length;
  const tallies: { action: TriageAction; n: number; icon: React.ReactNode }[] =
    [
      {
        action: "resolve",
        n: tally("resolve"),
        icon: <Check aria-hidden className="size-3" />,
      },
      {
        action: "ignore",
        n: tally("ignore"),
        icon: <EyeOff aria-hidden className="size-3" />,
      },
      {
        action: "assign",
        n: tally("assign"),
        icon: <UserPlus aria-hidden className="size-3" />,
      },
      {
        action: "snooze",
        n: tally("snooze"),
        icon: <AlarmClock aria-hidden className="size-3" />,
      },
    ];
  const decided = tallies.reduce((a, t) => a + t.n, 0);
  const active =
    activeId && visible.some((g) => g.id === activeId)
      ? activeId
      : (visible[0]?.id ?? null);
  const step = cascade(Math.min(visible.length, 10));

  /* ---------------------------- undo countdown ------------------------- */

  const undoSeq = undo?.seq ?? null;
  const undoMs = Math.max(1, undoSeconds) * 1000;

  React.useEffect(() => {
    if (undoSeq === null) return;
    holds.current.clear();
    undoLeft.current = undoMs;
    const start = (ms: number) => {
      undoStarted.current = performance.now();
      undoLeft.current = ms;
      undoTimer.current = window.setTimeout(() => {
        undoTimer.current = null;
        setUndo((u) => (u?.seq === undoSeq ? null : u));
        setBar(null);
      }, ms);
    };
    const pause = () => {
      if (undoTimer.current === null) return;
      window.clearTimeout(undoTimer.current);
      undoTimer.current = null;
      const left = Math.max(
        0,
        undoLeft.current - (performance.now() - undoStarted.current),
      );
      undoLeft.current = left;
      setBar({ frac: left / undoMs, left, held: true });
    };
    const resume = () => {
      if (undoTimer.current !== null) return;
      const left = undoLeft.current;
      setBar({ frac: left / undoMs, left, held: false });
      start(left);
    };
    const sync = () => {
      if (holds.current.size > 0 || document.hidden) pause();
      else resume();
    };
    syncHold.current = sync;
    // A tab already hidden holds the clock from the start; the first visible
    // moment starts it.
    if (!document.hidden) start(undoMs);
    document.addEventListener("visibilitychange", sync);
    return () => {
      syncHold.current = null;
      document.removeEventListener("visibilitychange", sync);
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
      undoTimer.current = null;
    };
  }, [undoSeq, undoMs]);

  // Hover and focus on the toast hold the countdown. The effect above owns
  // the timer, so the handlers reach it through the ref it leaves behind.
  const holdToast = (reason: string, on: boolean) => {
    if (on) holds.current.add(reason);
    else holds.current.delete(reason);
    syncHold.current?.();
  };

  /* ------------------------------- focus ------------------------------- */

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node =
      (focusReq.id ? cardNodes.current.get(focusReq.id) : undefined) ??
      radioNodes.current.get(focusReq.fallback);
    node?.focus();
  }, [focusReq]);

  const menuGroup = menu?.groupId ?? null;
  React.useLayoutEffect(() => {
    if (!menuGroup) return;
    const first =
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus({ preventScroll: true });
  }, [menuGroup]);

  React.useEffect(() => {
    if (!menuGroup) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (assignNodes.current.get(menuGroup)?.contains(target)) return;
      setMenu(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [menuGroup]);

  /* ------------------------------- changes ----------------------------- */

  const openAfter = (next: TriageDecision[]) =>
    pendingTriage(groups, next).length;

  const sentence = (decision: TriageDecision, group: TriageGroup) => {
    if (decision.action === "assign") {
      const who = people.find((p) => p.id === decision.assignee);
      return `Assigned ${group.kind} to ${who ? (who.id === self ? "you" : who.name) : "someone"}`;
    }
    if (decision.action === "snooze")
      return `Snoozed ${group.kind} for ${plural(snoozeHours, "hour", "hours")}`;
    return `${ACTION_PAST[decision.action]} ${group.kind}`;
  };

  const hasFocusIn = (node: Element | undefined) =>
    typeof document !== "undefined" &&
    node !== undefined &&
    node.contains(document.activeElement);

  const decide = (
    group: TriageGroup,
    action: TriageAction,
    assignee?: string,
  ) => {
    if (inert) return;
    const decision: TriageDecision = {
      groupId: group.id,
      action,
      ...(assignee ? { assignee } : {}),
      at: now,
    };
    const next = [...current.filter((d) => d.groupId !== group.id), decision];
    const i = visible.findIndex((g) => g.id === group.id);
    const after = visible[i + 1] ?? visible[i - 1];
    const followed =
      hasFocusIn(cardNodes.current.get(group.id)) ||
      (menu?.groupId === group.id && hasFocusIn(menuRef.current ?? undefined));
    setExitDir(action === "ignore" ? -1 : 1);
    if (value === undefined) setOwn(next);
    onChange?.(next);
    onDecide?.(decision, group);
    seq.current += 1;
    setUndo({ decision, group, seq: seq.current });
    setBar({
      frac: 1,
      left: undoMs,
      held: typeof document !== "undefined" && document.hidden,
    });
    setMenu(null);
    setRestoredId(null);
    setAnnouncement(
      `${sentence(decision, group)}. ${openAfter(next)} open. U takes it back.`,
    );
    if (followed) {
      setFocusReq({
        id: after?.id ?? null,
        fallback: filterNow,
        seq: seq.current,
      });
    }
  };

  const takeBack = () => {
    if (!undo || inert) return;
    const { decision, group } = undo;
    const next = current.filter((d) => d.groupId !== decision.groupId);
    if (value === undefined) setOwn(next);
    onChange?.(next);
    onUndo?.(decision, group);
    seq.current += 1;
    setUndo(null);
    setBar(null);
    setRestoredId(group.id);
    setAnnouncement(`${group.kind} is back. ${openAfter(next)} open.`);
    setFocusReq({ id: group.id, fallback: filterNow, seq: seq.current });
  };

  const changeFilter = (to: TriageFilter) => {
    if (to === filterNow) return;
    if (filter === undefined) setOwnFilter(to);
    onFilterChange?.(to);
    setMenu(null);
    setRestoredId(null);
    setAnnouncement(
      `${FILTER_NAME[to]}: ${plural(counts[to], "group", "groups")}.`,
    );
  };

  /* ------------------------------- menu -------------------------------- */

  const openMenu = (group: TriageGroup) => {
    if (inert) return;
    if (menu?.groupId === group.id) {
      setMenu(null);
      return;
    }
    const root = rootRef.current;
    const btn = assignNodes.current.get(group.id);
    if (!root || !btn) return;
    const rr = root.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const width = Math.min(MENU_W, rr.width - 16);
    const left = Math.round(clamp(br.left - rr.left, 8, rr.width - width - 8));
    const below = rr.bottom - br.bottom - 8;
    const above = br.top - rr.top - 8;
    const wanted = 44 * people.length + 12;
    if (below >= Math.min(wanted, 160) || below >= above) {
      setMenu({
        groupId: group.id,
        left,
        top: Math.round(br.bottom - rr.top + 6),
        maxHeight: Math.round(Math.max(80, below - 4)),
      });
    } else {
      setMenu({
        groupId: group.id,
        left,
        bottom: Math.round(rr.bottom - br.top + 6),
        maxHeight: Math.round(Math.max(80, above - 4)),
      });
    }
  };

  const closeMenu = (returnFocus: boolean) => {
    const id = menu?.groupId;
    setMenu(null);
    if (returnFocus && id) cardNodes.current.get(id)?.focus();
  };

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const i = items.findIndex((n) => n === document.activeElement);
    const n = items.length;
    let to = -1;
    if (event.key === "ArrowDown") to = (i + 1) % n;
    else if (event.key === "ArrowUp") to = (i - 1 + n) % n;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    } else if (event.key === "Tab") {
      setMenu(null);
      return;
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      // Type a letter to jump to the next name starting with it.
      const ch = event.key.toLowerCase();
      const names = items.map((it) => (it.dataset.name ?? "").toLowerCase());
      let hit = names.findIndex((nm, j) => j > i && nm.startsWith(ch));
      if (hit < 0) hit = names.findIndex((nm) => nm.startsWith(ch));
      if (hit < 0) return;
      to = hit;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    items[to]?.focus();
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onCardKey = (event: React.KeyboardEvent, group: TriageGroup) => {
    if (event.target !== event.currentTarget) {
      // A pointer user clicked a button inside; keys still belong to the card
      // except the ones the button itself needs.
      if (event.key === " " || event.key === "Enter") return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const i = visible.findIndex((g) => g.id === group.id);
    let to = -1;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = visible.length - 1;
    else {
      const k = event.key.toLowerCase();
      if (k === "r") decide(group, "resolve");
      else if (k === "i") decide(group, "ignore");
      else if (k === "s") decide(group, "snooze");
      else if (k === "a") openMenu(group);
      else return;
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const target = visible[clamp(to, 0, visible.length - 1)];
    if (target) cardNodes.current.get(target.id)?.focus();
  };

  const onRadioKey = (event: React.KeyboardEvent, f: TriageFilter) => {
    const i = FILTERS.indexOf(f);
    const n = FILTERS.length;
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      to = (i + 1) % n;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = (i - 1 + n) % n;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    else return;
    event.preventDefault();
    const target = FILTERS[to];
    if (!target) return;
    changeFilter(target);
    radioNodes.current.get(target)?.focus();
  };

  const onRootKey = (event: React.KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key.toLowerCase() === "u" && undo) {
      event.preventDefault();
      takeBack();
    }
  };

  /* ------------------------------- render ------------------------------ */

  const emptyWhole = groups.length === 0;
  const clearEverywhere = pending.length === 0;
  const menuFor = menu ? visible.find((g) => g.id === menu.groupId) : undefined;
  const undoWho = undo?.decision.assignee
    ? people.find((p) => p.id === undo.decision.assignee)
    : undefined;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onKeyDown={onRootKey}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--xt-accent" as string]: ACCENTS[accent] }}
    >
      <p id={hintId} className="sr-only">
        R resolves, I ignores, A assigns, S snoozes. Up and Down move. U takes
        the last decision back.
      </p>

      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {project}
          </p>
        </div>
        {ready ? (
          <div className="flex shrink-0 items-center gap-3">
            <p className="flex items-baseline gap-1 text-[12px] text-ink-2">
              <span className="sr-only">
                {plural(pending.length, "group", "groups")} open, {decided}{" "}
                decided
              </span>
              <Roll
                value={pending.length}
                motionSafe={motionSafe}
                className="font-mono text-[15px] text-foreground"
              />
              <span aria-hidden>open</span>
            </p>
            <ul
              aria-hidden
              className="hidden items-center gap-2 border-l border-hairline pl-3 @min-[40rem]:flex"
            >
              {tallies.map((t) => (
                <li
                  key={t.action}
                  className={cn(
                    "flex items-center gap-1 font-mono text-[11px] transition-colors",
                    t.n > 0 ? "text-ink-2" : "text-ink-3",
                  )}
                  title={ACTION_PAST[t.action]}
                >
                  {t.icon}
                  <Roll value={t.n} motionSafe={motionSafe} />
                </li>
              ))}
            </ul>
            <p
              aria-hidden
              className="font-mono text-[11px] text-ink-3 @min-[40rem]:hidden"
            >
              <Roll value={decided} motionSafe={motionSafe} /> done
            </p>
          </div>
        ) : null}
      </header>

      <LayoutGroup id={uid}>
        <div
          role="radiogroup"
          aria-label="Filter"
          className="flex shrink-0 flex-wrap items-center gap-1 px-3 pb-2"
        >
          {FILTERS.map((f) => {
            const checked = f === filterNow;
            return (
              <button
                key={f}
                ref={(node) => {
                  if (node) radioNodes.current.set(f, node);
                  else radioNodes.current.delete(f);
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                aria-disabled={!ready || undefined}
                onClick={() => {
                  if (ready) changeFilter(f);
                }}
                onKeyDown={(event) => {
                  if (ready) onRadioKey(event, f);
                }}
                className={cn(
                  "relative inline-flex h-7 items-center gap-1.5 rounded-2 px-2.5 text-[12px] transition-colors",
                  checked
                    ? "text-foreground"
                    : "text-ink-2 hover:text-foreground",
                  !ready && "cursor-default",
                  FOCUS_RING,
                )}
              >
                {checked ? (
                  <motion.span
                    aria-hidden
                    layoutId={`${uid}-pill`}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                    className="absolute inset-0 rounded-2 border border-[color-mix(in_oklab,var(--xt-accent)_30%,transparent)] bg-[color-mix(in_oklab,var(--xt-accent)_12%,transparent)]"
                  />
                ) : null}
                <span className="relative">{FILTER_NAME[f]}</span>
                {ready ? (
                  <span
                    className={cn(
                      "relative font-mono text-[10px] tabular-nums",
                      checked ? "text-(--xt-accent)" : "text-ink-3",
                    )}
                  >
                    {counts[f]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div
          className="relative flex-1 overflow-y-auto overscroll-contain border-t border-hairline"
          onScroll={() => {
            if (menu) setMenu(null);
          }}
        >
          {status === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-foreground">
                The error groups didn&apos;t load.
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
            <Skeleton density={density} />
          ) : visible.length === 0 ? (
            <ClearState
              key={emptyWhole ? "none" : clearEverywhere ? "all" : filterNow}
              heading={
                emptyWhole
                  ? "Nothing to triage"
                  : clearEverywhere
                    ? "Inbox clear"
                    : `${FILTER_NAME[filterNow]} is clear`
              }
              detail={
                emptyWhole
                  ? "No error groups have come in."
                  : clearEverywhere
                    ? `Every group has a decision. ${plural(decided, "card", "cards")} worked.`
                    : `${plural(pending.length, "group", "groups")} still open in All.`
              }
              celebrate={!emptyWhole}
              motionSafe={motionSafe}
              live={live}
            />
          ) : (
            <ul
              role="listbox"
              aria-label={`${title}, ${FILTER_NAME[filterNow].toLowerCase()}`}
              className="relative flex flex-col gap-2 px-3 py-3"
            >
              <AnimatePresence
                initial={live}
                mode="popLayout"
                custom={motionSafe ? exitDir : 0}
              >
                {visible.map((group, i) => (
                  <Card
                    key={group.id}
                    group={group}
                    people={people}
                    me={self}
                    now={now}
                    density={density}
                    sparkline={sparkline}
                    active={group.id === active}
                    disabled={inert}
                    motionSafe={motionSafe}
                    live={live}
                    delay={
                      group.id === restoredId ? 0 : r3(Math.min(i, 10) * step)
                    }
                    hintId={hintId}
                    menuOpen={menu?.groupId === group.id}
                    nodeRef={(node) => {
                      if (node) cardNodes.current.set(group.id, node);
                      else cardNodes.current.delete(group.id);
                    }}
                    assignRef={(node) => {
                      if (node) assignNodes.current.set(group.id, node);
                      else assignNodes.current.delete(group.id);
                    }}
                    onFocus={() => setActiveId(group.id)}
                    onKeyDown={(event) => onCardKey(event, group)}
                    onAction={(action) => decide(group, action)}
                    onAssign={() => openMenu(group)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </LayoutGroup>

      <AnimatePresence>
        {menu && menuFor ? (
          <motion.div
            key={menu.groupId}
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Assign ${menuFor.kind} to`}
            onKeyDown={onMenuKey}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (
                next &&
                !event.currentTarget.contains(next) &&
                next !== assignNodes.current.get(menu.groupId)
              ) {
                setMenu(null);
              }
            }}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            style={{
              left: menu.left,
              top: menu.top,
              bottom: menu.bottom,
              maxHeight: menu.maxHeight,
              width: Math.min(MENU_W, 320),
            }}
            className="absolute z-20 flex flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
          >
            <p className="px-2 pt-1.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Assign to
            </p>
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-name={person.name}
                onClick={() => decide(menuFor, "assign", person.id)}
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-2 px-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-surface-2 focus-visible:bg-surface-2",
                  "outline-none",
                )}
              >
                <Avatar name={person.name} />
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
                {person.id === self ? (
                  <span className="font-mono text-[10px] text-ink-3">you</span>
                ) : null}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {undo ? (
          <motion.div
            key={undo.seq}
            id={toastId}
            role="group"
            aria-label="Last decision"
            onPointerEnter={() => holdToast("hover", true)}
            onPointerLeave={() => holdToast("hover", false)}
            onFocus={() => holdToast("focus", true)}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (!next || !event.currentTarget.contains(next))
                holdToast("focus", false);
            }}
            initial={{
              opacity: 0,
              y: motionSafe ? distances.shift : 0,
              scale: motionSafe ? 0.96 : 1,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: motionSafe ? distances.nudge : 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? { ...springs.recoil, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className="absolute inset-x-3 bottom-3 z-30 overflow-hidden rounded-3 border border-hairline-strong bg-popover shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)] @min-[40rem]:inset-x-auto @min-[40rem]:right-3 @min-[40rem]:w-[22rem]"
          >
            <div className="flex items-center gap-2.5 px-3 py-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--xt-accent)_16%,transparent)] text-(--xt-accent)">
                {undo.decision.action === "resolve" ? (
                  <Check aria-hidden className="size-3.5" />
                ) : undo.decision.action === "ignore" ? (
                  <EyeOff aria-hidden className="size-3.5" />
                ) : undo.decision.action === "assign" ? (
                  <UserPlus aria-hidden className="size-3.5" />
                ) : (
                  <AlarmClock aria-hidden className="size-3.5" />
                )}
              </span>
              <p className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                {undo.decision.action === "assign" ? (
                  <>
                    Assigned{" "}
                    <span className="font-semibold">{undo.group.kind}</span> to{" "}
                    {undoWho
                      ? undoWho.id === self
                        ? "you"
                        : undoWho.name
                      : "someone"}
                  </>
                ) : undo.decision.action === "snooze" ? (
                  <>
                    Snoozed{" "}
                    <span className="font-semibold">{undo.group.kind}</span> for{" "}
                    {snoozeHours}h
                  </>
                ) : (
                  <>
                    {ACTION_PAST[undo.decision.action]}{" "}
                    <span className="font-semibold">{undo.group.kind}</span>
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={takeBack}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 border border-hairline px-2 text-[11.5px] font-medium text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <Undo2 aria-hidden className="size-3.5" />
                Undo
                <Kbd>U</Kbd>
              </button>
            </div>
            {/* Drains over what is left; frozen where it stands while held. */}
            <span aria-hidden className="block h-0.5 w-full bg-surface-2">
              <motion.span
                className="block h-full w-full origin-left bg-(--xt-accent)"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: bar?.held ? bar.frac : 0 }}
                transition={
                  !bar || bar.held
                    ? { duration: 0 }
                    : { duration: bar.left / 1000, ease: easings.linear }
                }
              />
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
