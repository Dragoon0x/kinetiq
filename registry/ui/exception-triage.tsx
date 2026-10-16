"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  Check,
  CircleCheck,
  EyeOff,
  RotateCcw,
  TriangleAlert,
  UserPlus,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type TriageLevel = "fatal" | "error" | "warning";
export type TriageIssueStatus =
  "unresolved" | "regressed" | "resolved" | "ignored";

export type TriageIssue = {
  id: string;
  /** The grouping key every event in this issue shares, shown short in mono. */
  fingerprint: string;
  /** The exception's type, e.g. "TypeError". */
  type: string;
  message: string;
  /** Where it was thrown: file and function. */
  culprit: string;
  level: TriageLevel;
  /** Events in this group. */
  events: number;
  /** Distinct users affected. */
  users: number;
  firstSeen: number;
  lastSeen: number;
  /** Events per hour over the last 24 hours, oldest first. */
  hourly: number[];
  status: TriageIssueStatus;
  /** A member id, or null when unassigned. */
  assignee?: string | null;
};

export type TriageMember = { id: string; name: string; initials: string };
export type TriageSparkStyle = "line" | "bars" | "area";
export type TriageDensity = "compact" | "cozy" | "roomy";
export type TriagePalette = "cobalt" | "ember" | "mono";
export type TriageStatus = "ready" | "loading" | "error";

export type ExceptionTriageProps = {
  /** How each 24-hour sparkline is drawn: a line ending in a dot, bars, or a filled area. @default "line" */
  sparkStyle?: TriageSparkStyle;
  /** Row height: compact, cozy or roomy. @default "cozy" */
  density?: TriageDensity;
  /** Colours for sparklines and level stripes: cobalt, ember (warm by level) or mono. @default "cobalt" */
  palette?: TriagePalette;
  /** The issue groups. Open ones (unresolved or regressed) are listed. @default defaultTriageIssues */
  issues?: TriageIssue[];
  /** Who an issue can be assigned to. @default defaultTriageMembers */
  members?: TriageMember[];
  /** The time "3m ago" is measured from, ms. Never read from the clock. @default defaultTriageNow */
  now?: number;
  /** Fires from the button or the E key; the row then plays its resolve and folds away. */
  onResolve?: (issue: TriageIssue) => void;
  /** Fires from the button or the I key; the row folds away. */
  onIgnore?: (issue: TriageIssue) => void;
  /** Fires when someone is picked in the assign menu (A opens it), or null to unassign. */
  onAssign?: (issue: TriageIssue, memberId: string | null) => void;
  /** Enter on an issue, or a press on its title. */
  onOpen?: (issue: TriageIssue) => void;
  /** Whether the issues have arrived. @default "ready" */
  status?: TriageStatus;
  /** Retry was pressed after the issues failed to load. */
  onRetry?: () => void;
  /** How long the Resolved label holds before the row folds, ms. @default 520 */
  labelHold?: number;
  /** The heading. @default "Waylight checkout" */
  title?: string;
  /** What an empty inbox says. @default "Inbox zero. Nothing new to triage." */
  emptyLabel?: string;
  /** Height of the surface, px; the list scrolls under its header. @default 520 */
  height?: number;
  /** Nothing can be resolved, ignored or assigned; the surface dims. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Tuesday 13 October 2026, 09:40 UTC. */
export const defaultTriageNow = Date.UTC(2026, 9, 13, 9, 40);

export const defaultTriageMembers: TriageMember[] = [
  { id: "ines", name: "Ines Park", initials: "IP" },
  { id: "tomas", name: "Tomas Reyes", initials: "TR" },
  { id: "ada", name: "Ada Moreau", initials: "AM" },
  { id: "kofi", name: "Kofi Mensah", initials: "KM" },
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

/** A fingerprint from the issue's id: eight hex digits of an FNV-1a hash. */
function fingerprintOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

type Shape = "steady" | "spike" | "rising" | "fading" | "fresh";

/** Twenty-four hourly counts with a shape and a total, seeded. */
function hourly(seed: number, shape: Shape, total: number): number[] {
  const rand = mulberry32(seed);
  const weights = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    const base =
      shape === "spike"
        ? i >= 19
          ? 6 + (i - 19) * 3
          : 0.6
        : shape === "rising"
          ? 0.3 + t * t * 4
          : shape === "fading"
            ? 3.5 - t * 3
            : shape === "fresh"
              ? i >= 21
                ? 5
                : 0
              : 1.6 + ((i * 7) % 5) * 0.2;
    return Math.max(0, base * (0.7 + rand() * 0.6));
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  // A day's share of the total, rounded; at least the raw shape survives.
  const day = Math.max(24, Math.round(total * 0.22));
  return weights.map((w) => Math.round((w / sum) * day));
}

type Seed = {
  id: string;
  type: string;
  message: string;
  culprit: string;
  level: TriageLevel;
  events: number;
  users: number;
  first: number;
  last: number;
  shape: Shape;
  status?: TriageIssueStatus;
  assignee?: string;
};

const SEEDS: Seed[] = [
  {
    id: "coupon-sku",
    type: "TypeError",
    message: "Cannot read properties of null (reading 'sku')",
    culprit: "cart/apply-coupon.ts in applyCoupon",
    level: "error",
    events: 1284,
    users: 412,
    first: 14 * DAY,
    last: 3 * MIN,
    shape: "spike",
    status: "regressed",
    assignee: "tomas",
  },
  {
    id: "issuer-timeout",
    type: "PaymentDeclinedError",
    message: "Issuer timed out after 8,000 ms",
    culprit: "pay/charge.ts in authorize",
    level: "fatal",
    events: 342,
    users: 198,
    first: 2 * DAY,
    last: 9 * MIN,
    shape: "rising",
  },
  {
    id: "slot-time",
    type: "RangeError",
    message: "Invalid time value",
    culprit: "ui/delivery-slot.tsx in formatSlot",
    level: "error",
    events: 96,
    users: 61,
    first: 20 * HOUR,
    last: 26 * MIN,
    shape: "fresh",
  },
  {
    id: "chunk-412",
    type: "ChunkLoadError",
    message: "Loading chunk 412 failed",
    culprit: "app/router.ts in prefetch",
    level: "warning",
    events: 2031,
    users: 1370,
    first: 6 * DAY,
    last: 41 * MIN,
    shape: "fading",
    assignee: "ada",
  },
  {
    id: "json-lt",
    type: "SyntaxError",
    message: "Unexpected token '<' in JSON at position 0",
    culprit: "api/client.ts in parseBody",
    level: "error",
    events: 211,
    users: 87,
    first: 4 * DAY,
    last: 1 * HOUR,
    shape: "steady",
  },
  {
    id: "tax-rate",
    type: "TaxRateMissing",
    message: "No rate for region BW-7",
    culprit: "tax/rates.ts in rateFor",
    level: "error",
    events: 17,
    users: 9,
    first: 9 * HOUR,
    last: 2 * HOUR,
    shape: "fresh",
  },
  {
    id: "quota-cart",
    type: "QuotaExceededError",
    message: "Storage is full; the cart was not saved",
    culprit: "cart/persist.ts in saveCart",
    level: "warning",
    events: 58,
    users: 44,
    first: 11 * DAY,
    last: 3 * HOUR,
    shape: "steady",
  },
  {
    id: "suggest-abort",
    type: "AbortError",
    message: "The operation was aborted",
    culprit: "search/suggest.ts in fetchSuggestions",
    level: "warning",
    events: 4410,
    users: 903,
    first: 21 * DAY,
    last: 5 * HOUR,
    shape: "steady",
    assignee: "kofi",
  },
];

/**
 * Waylight checkout on a Tuesday morning: a coupon bug that came back after
 * last week's fix, a payment timeout getting worse, a fresh delivery-slot
 * crash, and the long tail of noisy warnings.
 */
export const defaultTriageIssues: TriageIssue[] = SEEDS.map((s, i) => ({
  id: s.id,
  fingerprint: fingerprintOf(s.id),
  type: s.type,
  message: s.message,
  culprit: s.culprit,
  level: s.level,
  events: s.events,
  users: s.users,
  firstSeen: defaultTriageNow - s.first,
  lastSeen: defaultTriageNow - s.last,
  hourly: hourly(1651 + i * 31, s.shape, s.events),
  status: s.status ?? "unresolved",
  assignee: s.assignee ?? null,
}));

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hand-rolled compact numbers: Intl's compact form differs between runtimes. */
const compact = (n: number) =>
  n < 1000
    ? String(n)
    : n < 10_000
      ? `${(Math.round(n / 100) / 10).toFixed(1)}k`
      : `${Math.round(n / 1000)}k`;
const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};
const agoWords = (ms: number) => {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${m} ${m === 1 ? "minute" : "minutes"} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
};
const plural = (n: number, one: string, other: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : other}`;

/** A message as the body of a sentence: no stop of its own, so one is never doubled. */
const clause = (text: string) => text.trim().replace(/[.!?]+$/, "");

const isOpen = (s: TriageIssueStatus) =>
  s === "unresolved" || s === "regressed";

type Geometry = { row: number; title: string; meta: string };
const DENSITY: Record<TriageDensity, Geometry> = {
  compact: { row: 54, title: "text-[12.5px]", meta: "text-[10.5px]" },
  cozy: { row: 64, title: "text-[13px]", meta: "text-[11px]" },
  roomy: { row: 74, title: "text-[13.5px]", meta: "text-[11.5px]" },
};

/** Spark and stripe colours per palette and level, from tokens only. */
const PALETTE: Record<TriagePalette, Record<TriageLevel, string>> = {
  cobalt: {
    fatal: "var(--danger)",
    error: "var(--accent-bright)",
    warning: "var(--warn)",
  },
  ember: {
    fatal: "var(--danger)",
    error: "oklch(from var(--danger) l c calc(h + 22))",
    warning: "var(--warn)",
  },
  mono: {
    fatal: "var(--foreground)",
    error: "var(--ink-2)",
    warning: "var(--ink-3)",
  },
};
const SPARK_COLOUR: Record<TriagePalette, (level: TriageLevel) => string> = {
  cobalt: () => "var(--accent-bright)",
  ember: (level) => PALETTE.ember[level],
  mono: () => "var(--ink-2)",
};

/* ----------------------------------------------------------------------- */
/*                                Sparkline                                */
/* ----------------------------------------------------------------------- */

const SW = 96;
const SH = 28;
const FLOOR = 26;

/**
 * Twenty-four hours of events. Resolving flattens it: every point glides to
 * the floor on `springs.glide` (bars shrink into a line) while its colour
 * turns to success; under reduced motion it is simply flat.
 */
function Spark({
  values,
  style,
  colour,
  flat,
  motionSafe,
}: {
  values: number[];
  style: TriageSparkStyle;
  colour: string;
  flat: boolean;
  motionSafe: boolean;
}) {
  const k = useMotionValue(flat ? 1 : 0);
  React.useEffect(() => {
    const to = flat ? 1 : 0;
    if (!motionSafe) {
      k.jump(to);
      return;
    }
    const controls = animate(k, to, springs.glide);
    return () => controls.stop();
  }, [flat, k, motionSafe]);

  const n = Math.max(2, values.length);
  const max = Math.max(1, ...values);
  const ys = values.map((v) => r2(FLOOR - (v / max) * (FLOOR - 3)));
  const xs = values.map((_, i) => r2((i / (n - 1)) * (SW - 4) + 2));

  const line = useTransform(k, (t) =>
    xs
      .map(
        (x, i) =>
          `${i === 0 ? "M" : "L"}${x} ${r2(lerp(ys[i] ?? FLOOR, FLOOR, t))}`,
      )
      .join(""),
  );
  const area = useTransform(
    k,
    (t) =>
      `${xs
        .map(
          (x, i) =>
            `${i === 0 ? "M" : "L"}${x} ${r2(lerp(ys[i] ?? FLOOR, FLOOR, t))}`,
        )
        .join("")}L${xs[xs.length - 1] ?? SW} ${FLOOR}L${xs[0] ?? 0} ${FLOOR}Z`,
  );
  const barW = SW / n;
  const bars = useTransform(k, (t) =>
    values
      .map((v, i) => {
        const h = r2(Math.max(1.5, lerp((v / max) * (FLOOR - 3), 1.5, t)));
        const x0 = r2(i * barW + barW * 0.18);
        const x1 = r2((i + 1) * barW - barW * 0.18);
        return `M${x0} ${FLOOR}V${r2(FLOOR - h)}H${x1}V${FLOOR}Z`;
      })
      .join(""),
  );
  const endY = useTransform(k, (t) =>
    r2(lerp(ys[ys.length - 1] ?? FLOOR, FLOOR, t)),
  );
  const fade = useTransform(k, (t) => r2(1 - t));

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${SW} ${SH}`}
      className="block h-auto w-full overflow-visible"
      style={{ ["--spark" as string]: colour }}
    >
      <line
        x1={0}
        x2={SW}
        y1={FLOOR + 0.5}
        y2={FLOOR + 0.5}
        className="stroke-hairline"
        strokeWidth={1}
      />
      {style === "bars" ? (
        <motion.path
          d={bars}
          shapeRendering="crispEdges"
          className={cn(
            "transition-[fill] duration-300",
            flat ? "fill-success" : "fill-(--spark)",
          )}
        />
      ) : (
        <>
          {style === "area" ? (
            <motion.path
              d={area}
              className={cn(
                "transition-[fill] duration-300",
                flat ? "fill-success/15" : "fill-(--spark)/15",
              )}
            />
          ) : null}
          <motion.path
            d={line}
            fill="none"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            className={cn(
              "transition-[stroke] duration-300",
              flat ? "stroke-success" : "stroke-(--spark)",
            )}
          />
          {style === "line" ? (
            <motion.circle
              cx={xs[xs.length - 1] ?? SW}
              cy={endY}
              r={2.25}
              className="fill-(--spark)"
              style={{ opacity: fade }}
            />
          ) : null}
        </>
      )}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Rows                                   */
/* ----------------------------------------------------------------------- */

type Leaving = { kind: "resolve"; issue: TriageIssue };
const REVEAL = 140;

type RowProps = {
  issue: TriageIssue;
  y: number;
  rowH: number;
  geo: Geometry;
  palette: TriagePalette;
  sparkStyle: TriageSparkStyle;
  members: TriageMember[];
  now: number;
  motionSafe: boolean;
  narrow: boolean;
  resolving: boolean;
  reopened: boolean;
  revealed: boolean;
  active: string | null;
  disabled: boolean;
  fresh: boolean;
  bindCell: (key: string) => (node: HTMLElement | null) => void;
  onFocusCell: (col: string) => void;
  onReveal: (open: boolean) => void;
  onResolve: () => void;
  onIgnore: () => void;
  onAssignOpen: (button: HTMLElement) => void;
  onOpen: () => void;
};

function IssueRow({
  issue,
  y,
  rowH,
  geo,
  palette,
  sparkStyle,
  members,
  now,
  motionSafe,
  narrow,
  resolving,
  reopened,
  revealed,
  active,
  disabled,
  fresh,
  bindCell,
  onFocusCell,
  onReveal,
  onResolve,
  onIgnore,
  onAssignOpen,
  onOpen,
}: RowProps) {
  const id = issue.id;
  const tab = (col: string) => (active === col ? 0 : -1);
  const key = (col: string) => `${id}:${col}`;
  const stripe = PALETTE[palette][issue.level];
  const member = members.find((m) => m.id === issue.assignee) ?? null;
  const name = `${issue.type}: ${clause(issue.message)}`;

  // The face slides aside (narrow widths) to show what lives behind the row.
  const x = useMotionValue(0);
  const dragFrom = React.useRef(0);
  const dragging = React.useRef(false);
  const pendingVelocity = React.useRef(0);
  const [settleTick, setSettleTick] = React.useState(0);
  React.useEffect(() => {
    if (dragging.current) return;
    const to = narrow && revealed && !resolving ? -REVEAL : 0;
    const velocity = pendingVelocity.current;
    pendingVelocity.current = 0;
    if (!motionSafe) {
      x.jump(to);
      return;
    }
    const controls = animate(x, to, { ...springs.snap, velocity });
    return () => controls.stop();
  }, [narrow, revealed, resolving, motionSafe, x, settleTick]);

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: disabled || !narrow || resolving,
    onStart: () => {
      dragging.current = true;
      dragFrom.current = x.get();
      x.stop();
    },
    onMove: ({ offset }) => {
      const raw = dragFrom.current + offset.x;
      const v =
        raw > 0
          ? rubberband(raw, REVEAL)
          : raw < -REVEAL
            ? -REVEAL + rubberband(raw + REVEAL, REVEAL)
            : raw;
      x.set(r2(v));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const landing = project(x.get(), velocity.x, 0.99);
      const open = landing < -REVEAL / 2;
      pendingVelocity.current = velocity.x;
      if (open !== revealed) onReveal(open);
      setSettleTick((t) => t + 1);
    },
    onCancel: () => {
      dragging.current = false;
      setSettleTick((t) => t + 1);
    },
  });

  // The Reopened tag stamps only when a regression arrives while the inbox is
  // on screen; an issue that was already reopened is simply drawn with it.
  const [seenReopened, setSeenReopened] = React.useState(reopened);
  const [stamp, setStamp] = React.useState(fresh && reopened);
  if (seenReopened !== reopened) {
    setSeenReopened(reopened);
    setStamp(reopened);
  }

  const actionButton = cn(
    "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS_RING,
  );

  const actions = (prefix: string) => (
    <>
      <button
        ref={bindCell(key(`${prefix}resolve`))}
        type="button"
        tabIndex={tab(`${prefix}resolve`)}
        onFocus={() => onFocusCell(`${prefix}resolve`)}
        onClick={onResolve}
        aria-label={`Resolve ${issue.type}`}
        aria-disabled={disabled || undefined}
        className={cn(actionButton, "hover:text-success")}
      >
        <Check aria-hidden className="size-3.5" />
      </button>
      <button
        ref={bindCell(key(`${prefix}ignore`))}
        type="button"
        tabIndex={tab(`${prefix}ignore`)}
        onFocus={() => onFocusCell(`${prefix}ignore`)}
        onClick={onIgnore}
        aria-label={`Ignore ${issue.type}`}
        aria-disabled={disabled || undefined}
        className={actionButton}
      >
        <EyeOff aria-hidden className="size-3.5" />
      </button>
      <button
        ref={bindCell(key(`${prefix}assign`))}
        type="button"
        tabIndex={tab(`${prefix}assign`)}
        onFocus={() => onFocusCell(`${prefix}assign`)}
        onClick={(event) => onAssignOpen(event.currentTarget)}
        aria-haspopup="menu"
        aria-label={
          member
            ? `Assigned to ${member.name}. Reassign ${issue.type}`
            : `Assign ${issue.type}`
        }
        aria-disabled={disabled || undefined}
        className={cn(actionButton, "relative")}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {member ? (
            <motion.span
              key={member.id}
              aria-hidden
              className="flex size-6 items-center justify-center rounded-full bg-cobalt-wash text-[9.5px] font-medium text-cobalt-bright ring-1 ring-hairline"
              initial={{ scale: motionSafe ? 0.6 : 1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.blink } }}
              transition={{
                scale: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
            >
              {member.initials}
            </motion.span>
          ) : (
            <motion.span
              key="none"
              className="flex"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.blink } }}
            >
              <UserPlus aria-hidden className="size-3.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </>
  );

  const usersText = `${compact(issue.users)}`;

  return (
    <motion.div
      role="row"
      aria-hidden={resolving || undefined}
      className="absolute inset-x-0 top-0 overflow-hidden border-b border-hairline"
      style={{ height: rowH }}
      initial={fresh ? { y: y - 8, opacity: 0 } : false}
      animate={{ y, opacity: 1 }}
      exit={{
        height: motionSafe ? 0 : rowH,
        opacity: 0,
        transition: { duration: durations.base, ease: easings.exit },
      }}
      transition={{
        y: motionSafe ? springs.glide : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
    >
      {/* Behind the row (narrow widths): the users and the actions. */}
      <div
        role="none"
        className="absolute inset-y-0 right-0 flex items-center gap-1 pr-3 pl-2 @min-[34rem]/exception-triage:hidden"
        style={{ width: REVEAL }}
      >
        <div
          ref={bindCell(key("busers"))}
          role="gridcell"
          tabIndex={tab("busers")}
          onFocus={() => onFocusCell("busers")}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center rounded-2 px-1 leading-tight",
            FOCUS_IN,
          )}
        >
          <span className="font-mono text-[12px] text-foreground tabular-nums">
            {usersText}
          </span>
          <span className="text-[10px] text-ink-3">users</span>
          <span className="sr-only">{`, ${plural(issue.users, "user", "users")} affected`}</span>
        </div>
        <div role="gridcell" className="flex items-center gap-0.5">
          {actions("b")}
        </div>
      </div>

      <motion.div
        role="none"
        {...drag}
        style={{ x, height: rowH }}
        className="relative z-10 grid touch-pan-y grid-cols-[3px_minmax(0,1fr)_3.5rem_2.5rem] items-center gap-x-3 bg-card pr-3 @min-[34rem]/exception-triage:grid-cols-[3px_minmax(0,1fr)_6rem_3.25rem_3.25rem_3rem_5.5rem] @min-[34rem]/exception-triage:pr-4 @min-[60rem]/exception-triage:grid-cols-[3px_minmax(0,1fr)_7rem_3.5rem_3.5rem_3.25rem_3.25rem_5.5rem]"
      >
        <span
          aria-hidden
          className="h-full w-[3px]"
          style={{ backgroundColor: stripe }}
        />
        <div
          ref={bindCell(key("issue"))}
          role="gridcell"
          tabIndex={tab("issue")}
          onFocus={() => onFocusCell("issue")}
          onClick={onOpen}
          aria-label={`${name}. ${issue.level}, ${plural(issue.events, "event", "events")}, ${plural(issue.users, "user", "users")}, last seen ${agoWords(now - issue.lastSeen)}${reopened ? ", reopened" : ""}${member ? `, assigned to ${member.name}` : ""}.`}
          className={cn(
            "flex min-w-0 cursor-pointer flex-col justify-center self-stretch rounded-2 py-1 pl-1 transition-opacity duration-300",
            FOCUS_IN,
            resolving && "opacity-55",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn("truncate font-medium text-foreground", geo.title)}
            >
              {issue.type}
            </span>
            {reopened ? (
              <motion.span
                className="inline-flex h-4 shrink-0 items-center rounded-full bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] px-1.5 text-[9.5px] font-medium tracking-[0.02em] text-warn"
                initial={
                  stamp && motionSafe ? { scale: 1.5, opacity: 0 } : false
                }
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  scale: springs.recoil,
                  opacity: { duration: durations.fast },
                }}
              >
                Reopened
              </motion.span>
            ) : null}
          </span>
          <span className={cn("truncate text-ink-2", geo.meta)}>
            {issue.message}
          </span>
          <span className={cn("truncate font-mono text-ink-3", geo.meta)}>
            {issue.culprit} · {issue.fingerprint.slice(0, 7)}
          </span>
        </div>
        <div
          ref={bindCell(key("spark"))}
          role="gridcell"
          tabIndex={tab("spark")}
          onFocus={() => onFocusCell("spark")}
          aria-label={
            resolving
              ? "Resolved"
              : `Last 24 hours: ${issue.hourly.reduce((a, b) => a + b, 0)} events, peak ${Math.max(0, ...issue.hourly)} an hour`
          }
          className={cn("relative rounded-2 p-0.5", FOCUS_IN)}
        >
          <Spark
            values={issue.hourly}
            style={sparkStyle}
            colour={SPARK_COLOUR[palette](issue.level)}
            flat={resolving}
            motionSafe={motionSafe}
          />
          <AnimatePresence>
            {resolving ? (
              <motion.span
                key="resolved"
                aria-hidden
                className="absolute inset-x-0.5 top-0 bottom-1.5 flex items-center gap-1 text-[11px] font-medium text-success"
                initial={
                  motionSafe
                    ? { clipPath: "inset(0% 100% 0% 0%)", opacity: 1 }
                    : { clipPath: "inset(0% 0% 0% 0%)", opacity: 0 }
                }
                animate={{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }}
                transition={{
                  duration: motionSafe ? 0.32 : durations.fast,
                  delay: motionSafe ? 0.36 : 0,
                  ease: easings.enter,
                }}
              >
                <CircleCheck aria-hidden className="size-3.5 shrink-0" />
                Resolved
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
        <div
          ref={bindCell(key("events"))}
          role="gridcell"
          tabIndex={tab("events")}
          onFocus={() => onFocusCell("events")}
          className={cn(
            "flex flex-col items-end rounded-2 px-0.5 leading-tight",
            FOCUS_IN,
          )}
        >
          <span className="font-mono text-[12px] text-foreground tabular-nums">
            {compact(issue.events)}
          </span>
          <span className="text-[10px] text-ink-3 @min-[34rem]/exception-triage:hidden">
            events
          </span>
          <span className="sr-only">{` ${issue.events === 1 ? "event" : "events"}`}</span>
        </div>
        <div
          ref={bindCell(key("users"))}
          role="gridcell"
          tabIndex={tab("users")}
          onFocus={() => onFocusCell("users")}
          className={cn(
            "hidden justify-end rounded-2 px-0.5 font-mono text-[12px] text-ink-2 tabular-nums @min-[34rem]/exception-triage:flex",
            FOCUS_IN,
          )}
        >
          {usersText}
          <span className="sr-only">{` ${issue.users === 1 ? "user" : "users"}`}</span>
        </div>
        <div
          ref={bindCell(key("seen"))}
          role="gridcell"
          tabIndex={tab("seen")}
          onFocus={() => onFocusCell("seen")}
          className={cn(
            "hidden justify-end rounded-2 px-0.5 font-mono text-[11.5px] text-ink-3 tabular-nums @min-[34rem]/exception-triage:flex",
            FOCUS_IN,
          )}
        >
          {ago(now - issue.lastSeen)}
          <span className="sr-only"> ago, last seen</span>
        </div>
        <div
          ref={bindCell(key("first"))}
          role="gridcell"
          tabIndex={tab("first")}
          onFocus={() => onFocusCell("first")}
          className={cn(
            "hidden justify-end rounded-2 px-0.5 font-mono text-[11.5px] text-ink-3 tabular-nums @min-[60rem]/exception-triage:flex",
            FOCUS_IN,
          )}
        >
          {ago(now - issue.firstSeen)}
          <span className="sr-only"> ago, first seen</span>
        </div>
        <div
          role="gridcell"
          className="hidden items-center gap-0.5 @min-[34rem]/exception-triage:flex"
        >
          {actions("")}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

const WIDE_COLS = [
  "issue",
  "spark",
  "events",
  "users",
  "seen",
  "first",
  "resolve",
  "ignore",
  "assign",
];
const NARROW_COLS = [
  "issue",
  "spark",
  "events",
  "busers",
  "bresolve",
  "bignore",
  "bassign",
];

/**
 * An error inbox where each row is a group of exceptions that share a
 * fingerprint: its level, type and message, where it was thrown, a 24-hour
 * sparkline, events, users, when it was last and first seen, and who owns it.
 *
 * Resolving plays in three beats: the sparkline's points glide flat onto the
 * floor on `springs.glide` while it turns to success; the flat line then
 * writes a Resolved label, uncovered left to right along it on the enter
 * ease; and after `labelHold` the row folds away on the exit ease while the
 * rows below close up on `springs.glide`. An issue that regresses slides to
 * the top on glide and stamps a Reopened tag on `springs.recoil`. Rows are
 * placed by transform in a stable DOM order, so a re-sort never moves a node
 * under the keyboard.
 *
 * It is a `role="grid"`: J and K (or Down and Up) move between issues, Left
 * and Right between cells, E resolves, I ignores, A opens the assign menu and
 * Enter opens the issue. Below a 544px container the users count and the
 * actions live behind each row: the focused row's face slides aside on
 * `springs.snap`, or a swipe follows the finger and a flick commits.
 */
export function ExceptionTriage({
  sparkStyle = "line",
  density = "cozy",
  palette = "cobalt",
  issues = defaultTriageIssues,
  members = defaultTriageMembers,
  now = defaultTriageNow,
  onResolve,
  onIgnore,
  onAssign,
  onOpen,
  status = "ready",
  onRetry,
  labelHold = 520,
  title = "Waylight checkout",
  emptyLabel = "Inbox zero. Nothing new to triage.",
  height = 520,
  disabled = false,
  className,
}: ExceptionTriageProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const menuId = `${uid}-menu`;
  const geo = DENSITY[density] ?? DENSITY.cozy;
  const rowH = geo.row;
  const ready = status === "ready";

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = React.useState(false);
  const roRef = React.useRef<ResizeObserver | null>(null);
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    rootRef.current = node;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < 544);
    });
    ro.observe(node);
    roRef.current = ro;
  }, []);
  React.useEffect(() => () => roRef.current?.disconnect(), []);

  /* --------------------------- local decisions -------------------------- */

  // A decision shows at once; the host's data wins as soon as it changes.
  const [overrides, setOverrides] = React.useState<
    Record<string, TriageIssueStatus>
  >({});
  const [assigned, setAssigned] = React.useState<Record<string, string | null>>(
    {},
  );
  // The host has spoken for an issue the moment its status or assignee in
  // the data changes: a local decision for that field is dropped then, even
  // if the host lands back on the value it had (a fix that regresses).
  const fieldsKey = issues
    .map((i) => `${i.id}\u0000${i.status}\u0000${i.assignee ?? ""}`)
    .join("\u0001");
  const [seenFields, setSeenFields] = React.useState(fieldsKey);
  if (seenFields !== fieldsKey) {
    const before = new Map(
      seenFields.split("\u0001").map((row) => {
        const [id = "", st = "", who = ""] = row.split("\u0000");
        return [id, { st, who }] as const;
      }),
    );
    const keepStatus: Record<string, TriageIssueStatus> = {};
    const keepAssigned: Record<string, string | null> = {};
    for (const issue of issues) {
      const was = before.get(issue.id);
      const o = overrides[issue.id];
      const a = assigned[issue.id];
      if (o !== undefined && was && was.st === issue.status)
        keepStatus[issue.id] = o;
      if (a !== undefined && was && was.who === (issue.assignee ?? "")) {
        keepAssigned[issue.id] = a;
      }
    }
    setSeenFields(fieldsKey);
    setOverrides(keepStatus);
    setAssigned(keepAssigned);
  }
  const [leaving, setLeaving] = React.useState<Record<string, Leaving>>({});
  const timers = React.useRef(new Map<string, number>());
  React.useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) window.clearTimeout(t);
      map.clear();
    };
  }, []);

  const effective = React.useMemo(
    () =>
      issues.map((issue) => {
        const o = overrides[issue.id];
        const a = assigned[issue.id];
        return {
          ...issue,
          status: o ?? issue.status,
          assignee: a !== undefined ? a : issue.assignee,
        };
      }),
    [issues, overrides, assigned],
  );

  // Who is listed, top to bottom: regressions first, then by last seen.
  const sorted = React.useMemo(() => {
    const listed = effective.filter(
      (i) => isOpen(i.status) || leaving[i.id] !== undefined,
    );
    return [...listed].sort((a, b) => {
      const ra = a.status === "regressed" ? 0 : 1;
      const rb = b.status === "regressed" ? 0 : 1;
      return ra - rb || b.lastSeen - a.lastSeen;
    });
  }, [effective, leaving]);
  const yOf = new Map(sorted.map((issue, i) => [issue.id, i * rowH]));
  const openCount = sorted.filter((i) => !leaving[i.id]).length;
  const reopenedCount = sorted.filter(
    (i) => i.status === "regressed" && !leaving[i.id],
  ).length;

  // Rows that join after the first render rise in; the first render is drawn.
  const listedKey = sorted.map((i) => i.id).join(",");
  const [seenRows, setSeenRows] = React.useState(listedKey);
  const [freshRows, setFreshRows] = React.useState<string[]>([]);
  if (seenRows !== listedKey) {
    const before = new Set(seenRows.split(","));
    setFreshRows(sorted.filter((i) => !before.has(i.id)).map((i) => i.id));
    setSeenRows(listedKey);
  }

  /* ------------------------------ focus map ----------------------------- */

  const [activeCell, setActiveCell] = React.useState<{
    row: string;
    col: string;
  } | null>(null);
  const [revealId, setRevealId] = React.useState<string | null>(null);
  const cells = React.useRef(new Map<string, HTMLElement>());
  const bindCell = React.useCallback(
    (k: string) => (node: HTMLElement | null) => {
      if (node) cells.current.set(k, node);
      else cells.current.delete(k);
    },
    [],
  );
  const focusable = sorted.filter((i) => !leaving[i.id]);
  const activeRow =
    activeCell && focusable.some((i) => i.id === activeCell.row)
      ? activeCell.row
      : (focusable[0]?.id ?? null);
  const activeCol = activeCell?.row === activeRow ? activeCell.col : "issue";

  const pendingFocus = React.useRef<string | null>(null);
  React.useEffect(() => {
    const k = pendingFocus.current;
    if (!k) return;
    pendingFocus.current = null;
    cells.current.get(k)?.focus();
  });

  const focusCell = (row: string, col: string) => {
    setActiveCell({ row, col });
    const node = cells.current.get(`${row}:${col}`);
    if (node && node.getClientRects().length > 0) node.focus();
    else pendingFocus.current = `${row}:${col}`;
  };

  /* ------------------------------ decisions ----------------------------- */

  const [announcement, setAnnouncement] = React.useState("");

  const nextAfter = (id: string) => {
    const at = focusable.findIndex((i) => i.id === id);
    return focusable[at + 1] ?? focusable[at - 1] ?? null;
  };

  const resolve = (issue: TriageIssue) => {
    if (disabled || leaving[issue.id] || !isOpen(issue.status)) return;
    const next = nextAfter(issue.id);
    setOverrides((o) => ({ ...o, [issue.id]: "resolved" }));
    setLeaving((l) => ({ ...l, [issue.id]: { kind: "resolve", issue } }));
    onResolve?.(issue);
    setAnnouncement(`Resolved ${issue.type}: ${clause(issue.message)}.`);
    setRevealId(null);
    const hold = motionSafe ? 680 + labelHold : 300 + labelHold;
    const existing = timers.current.get(issue.id);
    if (existing) window.clearTimeout(existing);
    timers.current.set(
      issue.id,
      window.setTimeout(() => {
        timers.current.delete(issue.id);
        setLeaving((l) => {
          const rest = { ...l };
          delete rest[issue.id];
          return rest;
        });
      }, hold),
    );
    if (next) focusCell(next.id, "issue");
  };

  const ignore = (issue: TriageIssue) => {
    if (disabled || leaving[issue.id] || !isOpen(issue.status)) return;
    const next = nextAfter(issue.id);
    setOverrides((o) => ({ ...o, [issue.id]: "ignored" }));
    onIgnore?.(issue);
    setAnnouncement(`Ignored ${issue.type}.`);
    setRevealId(null);
    if (next) focusCell(next.id, "issue");
  };

  const [menu, setMenu] = React.useState<{
    issue: string;
    top: number;
    right: number;
    returnTo: string;
  } | null>(null);
  const menuItems = React.useRef<(HTMLButtonElement | null)[]>([]);

  const openMenu = (
    issue: TriageIssue,
    anchor: HTMLElement | null,
    returnTo: string,
  ) => {
    if (disabled) return;
    const root = rootRef.current;
    if (!root || !anchor) return;
    const r = root.getBoundingClientRect();
    const b = anchor.getBoundingClientRect();
    const menuH = (members.length + 1) * 32 + 12;
    const below = b.bottom - r.top + 4;
    const top =
      below + menuH > r.height ? Math.max(4, b.top - r.top - menuH - 4) : below;
    setMenu({
      issue: issue.id,
      top: Math.round(top),
      right: Math.round(
        clamp(r.right - b.right, 4, Math.max(4, r.width - 196)),
      ),
      returnTo,
    });
  };

  const closeMenu = (refocus = true) => {
    const returnTo = menu?.returnTo;
    setMenu(null);
    if (refocus && returnTo) {
      const node = cells.current.get(returnTo);
      if (node?.isConnected) node.focus();
    }
  };

  const assign = (issue: TriageIssue, memberId: string | null) => {
    setAssigned((a) => ({ ...a, [issue.id]: memberId }));
    onAssign?.(issue, memberId);
    const who = members.find((m) => m.id === memberId);
    setAnnouncement(
      who
        ? `${issue.type} assigned to ${who.name}.`
        : `${issue.type} unassigned.`,
    );
    closeMenu();
  };

  // Focus lands on the menu's current item when the menu arrives.
  const bindMenu = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const checked = node.querySelector<HTMLElement>('[aria-checked="true"]');
    (
      checked ?? node.querySelector<HTMLElement>('[role="menuitemradio"]')
    )?.focus();
  }, []);

  React.useEffect(() => {
    if (!menu) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const node = document.getElementById(menuId);
      if (node && target && node.contains(target)) return;
      setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu, menuId]);

  /* ------------------------------ keyboard ------------------------------ */

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready || !activeRow || menu) return;
    const issue = focusable.find((i) => i.id === activeRow);
    if (!issue) return;
    const mod = event.ctrlKey || event.metaKey || event.altKey;
    const rows = focusable.map((i) => i.id);
    const r = rows.indexOf(activeRow);
    const cols = (narrow ? NARROW_COLS : WIDE_COLS).filter((c) => {
      const node = cells.current.get(`${activeRow}:${c}`);
      if (!node) return false;
      return node.getClientRects().length > 0 || c.startsWith("b");
    });
    const c = Math.max(0, cols.indexOf(activeCol));
    const goRow = (to: number) => {
      const row = rows[clamp(to, 0, rows.length - 1)];
      if (row) focusCell(row, "issue");
    };
    const goCol = (to: number) => {
      const col = cols[clamp(to, 0, cols.length - 1)];
      if (!col) return;
      if (narrow && col.startsWith("b")) setRevealId(activeRow);
      focusCell(activeRow, col);
    };
    switch (event.key) {
      case "j":
      case "J":
      case "ArrowDown":
        if (mod) return;
        event.preventDefault();
        goRow(r + 1);
        return;
      case "k":
      case "K":
      case "ArrowUp":
        if (mod) return;
        event.preventDefault();
        goRow(r - 1);
        return;
      case "ArrowRight":
        event.preventDefault();
        goCol(c + 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        goCol(c - 1);
        return;
      case "Home":
        event.preventDefault();
        goRow(0);
        return;
      case "End":
        event.preventDefault();
        goRow(rows.length - 1);
        return;
      case "e":
      case "E":
        if (mod) return;
        event.preventDefault();
        resolve(issue);
        return;
      case "i":
      case "I":
        if (mod) return;
        event.preventDefault();
        ignore(issue);
        return;
      case "a":
      case "A": {
        if (mod) return;
        event.preventDefault();
        const button =
          cells.current.get(`${issue.id}:assign`) ??
          cells.current.get(`${issue.id}:bassign`) ??
          null;
        const visibleButton =
          button && button.getClientRects().length > 0
            ? button
            : (cells.current.get(`${issue.id}:issue`) ?? null);
        openMenu(issue, visibleButton, `${issue.id}:${activeCol}`);
        return;
      }
      case "Enter":
        if (activeCol === "issue" || activeCol === "spark") {
          event.preventDefault();
          if (!disabled) onOpen?.(issue);
        }
        return;
      case "Escape":
        if (revealId) {
          event.preventDefault();
          setRevealId(null);
          focusCell(activeRow, "issue");
        }
        return;
      default:
        return;
    }
  };

  /* -------------------------------- render ------------------------------ */

  const menuIssue = menu ? effective.find((i) => i.id === menu.issue) : null;

  const list = () => {
    if (status === "loading") {
      return (
        <div aria-busy="true" aria-label="Loading issues">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              aria-hidden
              className="flex items-center gap-3 border-b border-hairline pr-4 pl-4"
              style={{ height: rowH }}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span
                  className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ width: `${30 + ((i * 17) % 30)}%` }}
                />
                <span
                  className="h-2 rounded-full bg-surface-2"
                  style={{ width: `${50 + ((i * 29) % 40)}%` }}
                />
              </div>
              <span className="h-5 w-16 rounded-1 bg-surface-2 @min-[34rem]/exception-triage:w-24" />
              <span className="h-2.5 w-8 rounded-full bg-surface-2" />
            </div>
          ))}
        </div>
      );
    }
    if (status === "error") {
      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 px-6 py-14 text-center"
        >
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-ink-2">The issues did not load.</p>
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
              Retry
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <>
        <motion.div
          role="none"
          className="relative"
          initial={false}
          animate={{ height: sorted.length * rowH }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <AnimatePresence initial={false}>
            {effective
              .filter((i) => sorted.some((s) => s.id === i.id))
              .map((issueNow) => {
                const leave = leaving[issueNow.id];
                const issue = leave ? leave.issue : issueNow;
                const isActive = activeRow === issue.id;
                return (
                  <IssueRow
                    key={issue.id}
                    issue={{ ...issue, assignee: issueNow.assignee }}
                    y={yOf.get(issue.id) ?? 0}
                    rowH={rowH}
                    geo={geo}
                    palette={palette}
                    sparkStyle={sparkStyle}
                    members={members}
                    now={now}
                    motionSafe={motionSafe}
                    narrow={narrow}
                    resolving={Boolean(leave)}
                    reopened={issue.status === "regressed"}
                    revealed={revealId === issue.id}
                    active={isActive && !leave ? activeCol : null}
                    disabled={disabled}
                    fresh={freshRows.includes(issue.id)}
                    bindCell={bindCell}
                    onFocusCell={(col) => {
                      setActiveCell({ row: issue.id, col });
                      if (narrow) {
                        setRevealId(col.startsWith("b") ? issue.id : null);
                      }
                    }}
                    onReveal={(open) => setRevealId(open ? issue.id : null)}
                    onResolve={() => resolve(issueNow)}
                    onIgnore={() => ignore(issueNow)}
                    onAssignOpen={(button) =>
                      openMenu(
                        issueNow,
                        button,
                        `${issue.id}:${narrow ? "bassign" : "assign"}`,
                      )
                    }
                    onOpen={() => {
                      if (!disabled) onOpen?.(issueNow);
                    }}
                  />
                );
              })}
          </AnimatePresence>
        </motion.div>
        {openCount === 0 && Object.keys(leaving).length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <CircleCheck aria-hidden className="size-5 text-success" />
            <p className="text-sm text-ink-2">{emptyLabel}</p>
          </div>
        ) : null}
      </>
    );
  };

  return (
    <div
      ref={bindRoot}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container/exception-triage relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
          <div className="min-w-36 flex-1">
            <p id={titleId} className="truncate text-sm font-semibold">
              {title}
            </p>
            <p className="truncate text-[11px] text-ink-3">
              {ready
                ? `${openCount} open${reopenedCount ? ` · ${reopenedCount} reopened` : ""}`
                : status === "loading"
                  ? "Grouping events"
                  : "Issues unavailable"}
            </p>
          </div>
          <p
            aria-hidden
            className="hidden font-mono text-[10px] tracking-[0.06em] text-ink-3 @min-[34rem]/exception-triage:block"
          >
            J K move · E resolve · I ignore · A assign
          </p>
        </header>
        <p id={hintId} className="sr-only">
          J and K move between issues. E resolves, I ignores, A assigns, Enter
          opens.
        </p>

        <div
          role="grid"
          aria-labelledby={titleId}
          aria-describedby={hintId}
          aria-rowcount={ready ? focusable.length + 1 : -1}
          aria-busy={status === "loading" || undefined}
          aria-disabled={disabled || undefined}
          onKeyDown={onGridKeyDown}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div
            role="row"
            className="hidden grid-cols-[3px_minmax(0,1fr)_6rem_3.25rem_3.25rem_3rem_5.5rem] items-center gap-x-3 border-b border-hairline bg-surface-1 py-1.5 pr-4 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[34rem]/exception-triage:grid @min-[60rem]/exception-triage:grid-cols-[3px_minmax(0,1fr)_7rem_3.5rem_3.5rem_3.25rem_3.25rem_5.5rem]"
          >
            <span aria-hidden />
            <span role="columnheader" className="pl-1">
              Issue
            </span>
            <span role="columnheader">24h</span>
            <span role="columnheader" className="text-right">
              Events
            </span>
            <span role="columnheader" className="text-right">
              Users
            </span>
            <span role="columnheader" className="text-right">
              Last
            </span>
            <span
              role="columnheader"
              className="hidden text-right @min-[60rem]/exception-triage:block"
            >
              First
            </span>
            <span role="columnheader" className="text-right">
              <span className="sr-only">Actions</span>
            </span>
          </div>
          <div
            role="rowgroup"
            className="flex-1 [scrollbar-width:thin] overflow-x-hidden overflow-y-auto overscroll-contain"
            onScroll={() => {
              if (menu) setMenu(null);
            }}
          >
            {list()}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {menu && menuIssue ? (
          <motion.div
            key="menu"
            ref={bindMenu}
            id={menuId}
            role="menu"
            aria-label={`Assign ${menuIssue.type}`}
            className="absolute z-30 flex w-48 flex-col rounded-3 border border-hairline-strong bg-popover p-1.5 shadow-[0_12px_32px_color-mix(in_oklab,black_18%,transparent)]"
            style={{ top: menu.top, right: menu.right }}
            initial={{ opacity: 0, y: motionSafe ? -4 : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              transition: { duration: durations.fast, ease: easings.exit },
            }}
            transition={{
              y: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast },
            }}
            onKeyDown={(event) => {
              const items = menuItems.current.filter(
                (n): n is HTMLButtonElement => n !== null,
              );
              const at = items.findIndex((n) => n === document.activeElement);
              if (event.key === "ArrowDown") {
                event.preventDefault();
                items[(at + 1) % items.length]?.focus();
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                items[(at - 1 + items.length) % items.length]?.focus();
              } else if (event.key === "Home") {
                event.preventDefault();
                items[0]?.focus();
              } else if (event.key === "End") {
                event.preventDefault();
                items[items.length - 1]?.focus();
              } else if (event.key === "Escape" || event.key === "Tab") {
                event.preventDefault();
                event.stopPropagation();
                closeMenu();
              }
            }}
          >
            {[
              ...members.map((m) => ({
                id: m.id as string | null,
                label: m.name,
                initials: m.initials,
              })),
              { id: null, label: "Unassigned", initials: "" },
            ].map((item, i) => {
              const checked = (menuIssue.assignee ?? null) === item.id;
              return (
                <button
                  key={item.id ?? "none"}
                  ref={(node) => {
                    menuItems.current[i] = node;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  tabIndex={-1}
                  onClick={() => assign(menuIssue, item.id)}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-2 px-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-surface-2 focus-visible:bg-surface-2",
                    FOCUS_IN,
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium",
                      item.id
                        ? "bg-cobalt-wash text-cobalt-bright"
                        : "border border-dashed border-hairline-strong",
                    )}
                  >
                    {item.initials}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {checked ? (
                    <Check aria-hidden className="size-3.5 text-ink-2" />
                  ) : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
