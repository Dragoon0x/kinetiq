"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  ArrowRight,
  BellRing,
  Check,
  OctagonX,
  Plus,
  RotateCcw,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type SpendMarkerStyle = "pin" | "flag" | "tick";
export type SpendPalette = "cobalt" | "ember" | "moss" | "mono";
export type SpendStatus = "ready" | "loading" | "empty" | "error";

export type SpendRecipient = {
  id: string;
  name: string;
  /** Shown in the add menu under the name. */
  role?: string;
  /** Avatar hue, 0–360. Derived from the id when absent. */
  hue?: number;
};

export type SpendThreshold = {
  id: string;
  /** Percent of the monthly budget at which the alert fires. */
  percent: number;
  /** Recipient ids who hear about it. */
  recipients: string[];
};

export type SpendConfig = {
  thresholds: SpendThreshold[];
  /** The amount at which spending stops, or null for no hard limit. */
  hardLimit: number | null;
};

export type SpendGuardProps = {
  /** How a threshold marker is drawn: a round head carrying the avatars, a flag off the stem, or a hairline tick. @default "pin" */
  markerStyle?: SpendMarkerStyle;
  /** Thickness of the spend bar, px; markers and the month strip scale with it. @default 20 */
  barHeight?: number;
  /** The tone of the spend fill, forecast and markers; the hard limit keeps its danger tone. @default "cobalt" */
  palette?: SpendPalette;
  /** The monthly budget, in the currency `format` prints. @default 5000 */
  budget?: number;
  /** Controlled thresholds. */
  thresholds?: SpendThreshold[];
  /** Initial thresholds when uncontrolled. @default defaultSpendThresholds */
  defaultThresholds?: SpendThreshold[];
  /** Fires from the drag, key, add, remove or recipient change that changed the thresholds, with all of them and the id that changed. */
  onThresholdChange?: (thresholds: SpendThreshold[], id: string) => void;
  /** Everyone who can be alerted. @default defaultSpendRecipients */
  recipients?: SpendRecipient[];
  /** A threshold's recipients changed, with the new ids. */
  onRecipientsChange?: (thresholdId: string, recipientIds: string[]) => void;
  /** Controlled hard limit amount; null for none. */
  hardLimit?: number | null;
  /** Initial hard limit when uncontrolled. @default null */
  defaultHardLimit?: number | null;
  /** The hard limit was switched on, moved or switched off. */
  onHardLimitChange?: (amount: number | null) => void;
  /** One plain sentence: what stops at the hard limit and what keeps running. */
  hardLimitEffect?: string;
  /** Spend per day of the current month so far, day 1 first. @default defaultSpendDaily */
  daily?: number[];
  /** The current time, ms. Dates are read in UTC; never read from the clock. @default 17 Oct 2026 */
  now?: number;
  /** Formats an amount. @default US dollars, no cents */
  format?: (amount: number) => string;
  /** Save was pressed; return a promise to show Saving… and its outcome. */
  onSave?: (config: SpendConfig) => void | Promise<void>;
  /** Whether the spend data has arrived. The bar stays in every state. @default "ready" */
  status?: SpendStatus;
  /** "Try again" was pressed after the spend failed to load. */
  onRetry?: () => void;
  /** The project, in the heading. @default "Waylight" */
  project?: string;
  /** Height of the surface, px; its body scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be moved, added or saved. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultSpendRecipients: SpendRecipient[] = [
  { id: "joel", name: "Joel Brandt", role: "Platform lead", hue: 252 },
  { id: "mara", name: "Mara Ilves", role: "Finance", hue: 28 },
  { id: "ruth", name: "Ruth Achebe", role: "CTO", hue: 78 },
  { id: "priya", name: "Priya Shah", role: "Engineering manager", hue: 158 },
  { id: "kenji", name: "Kenji Mori", role: "On call this week", hue: 304 },
];

export const defaultSpendThresholds: SpendThreshold[] = [
  { id: "t50", percent: 50, recipients: ["joel"] },
  { id: "t80", percent: 80, recipients: ["joel", "mara"] },
  { id: "t100", percent: 100, recipients: ["joel", "mara", "ruth"] },
];

/** October so far: quiet weekends, and a load test on the 9th. */
export const defaultSpendDaily: number[] = [
  158, 171, 122, 118, 176, 182, 169, 174, 312, 131, 124, 181, 188, 179, 192,
  186, 141,
];

/** Saturday 17 October 2026, noon UTC. */
export const defaultSpendNow = Date.UTC(2026, 9, 17, 12, 0);

const DEFAULT_EFFECT =
  "New deployments pause and preview environments scale to zero. Production keeps serving, and nothing is deleted.";

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const defaultFormat = (amount: number) => USD.format(Math.round(amount));

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

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
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Fills are pigment (fixed lightness, both themes); inks are the text tokens. */
const PALETTES: Record<SpendPalette, { fill: string; ink: string }> = {
  cobalt: {
    fill: "oklch(from var(--accent-bright) 0.64 0.15 h)",
    ink: "var(--accent-bright)",
  },
  ember: { fill: "oklch(from var(--warn) 0.76 0.14 h)", ink: "var(--warn)" },
  moss: {
    fill: "oklch(from var(--success) 0.68 0.13 h)",
    ink: "var(--success)",
  },
  mono: { fill: "oklch(from var(--ink-2) 0.7 0.012 h)", ink: "var(--ink)" },
};

type Geo = {
  /** Room above the bar for heads and riding avatars. */
  room: number;
  avatarTop: number;
  avatar: number;
  headTop: number;
  stemTop: number;
};

const GEO: Record<SpendMarkerStyle, Geo> = {
  pin: { room: 54, avatarTop: 2, avatar: 20, headTop: 26, stemTop: 44 },
  flag: { room: 46, avatarTop: 0, avatar: 16, headTop: 19, stemTop: 19 },
  tick: { room: 40, avatarTop: 3, avatar: 8, headTop: 13, stemTop: 29 },
};

const LEADER = 28;
/** The month's days take this share of the strip; the rest is "later". */
const STRIP = 88;
const LATER = 95;

const hueOf = (p: SpendRecipient) => {
  if (p.hue !== undefined) return Math.round(p.hue) % 360;
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

const andList = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

type Model = {
  year: number;
  month: number;
  today: number;
  dim: number;
  elapsed: number;
  cum: number[];
  spent: number;
  pace: number;
  forecast: number;
  axis: number;
};

function spendModel(daily: number[], now: number, budget: number): Model {
  const d = new Date(now);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const dim = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const elapsed = Math.min(daily.length, dim);
  const cum: number[] = [];
  let run = 0;
  for (let i = 0; i < elapsed; i++) {
    run += Math.max(0, daily[i] ?? 0);
    cum.push(Math.round(run * 100) / 100);
  }
  const spent = cum[elapsed - 1] ?? 0;
  const recent = daily.slice(Math.max(0, elapsed - 7), elapsed);
  const pace = recent.length
    ? Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 100) /
      100
    : 0;
  const forecast = Math.round((spent + pace * (dim - elapsed)) * 100) / 100;
  const b = Math.max(1, budget);
  const axis = clamp(Math.ceil((forecast / b) * 10) * 10 + 20, 130, 200);
  const today = d.getUTCDate();
  return { year, month, today, dim, elapsed, cum, spent, pace, forecast, axis };
}

type When = { kind: "passed" | "upcoming" | "later" | "unknown"; day: number };

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

function Avatar({
  person,
  size,
  ring = true,
}: {
  person: SpendRecipient;
  size: number;
  ring?: boolean;
}) {
  const hue = hueOf(person);
  const dot = size < 12;
  return (
    <span
      aria-hidden
      title={person.name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        ring && "ring-2 ring-card",
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.42)),
        backgroundColor: `oklch(0.84 0.07 ${hue})`,
        color: `oklch(0.32 0.08 ${hue})`,
      }}
    >
      {dot ? null : initials(person.name)}
    </span>
  );
}

function AvatarStack({
  people,
  size,
  max = 3,
}: {
  people: SpendRecipient[];
  size: number;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  // Discs overlap like a stack; dots sit apart so each hue reads.
  const overlap = size < 12 ? 2 : -Math.round(size * 0.3);
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <span key={p.id} style={{ marginLeft: i === 0 ? 0 : overlap }}>
          <Avatar person={p} size={size} ring={size >= 12} />
        </span>
      ))}
      {more > 0 ? (
        <span
          className="ml-0.5 font-mono text-[9px] text-ink-3 tabular-nums"
          aria-hidden
        >
          +{more}
        </span>
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The marker                                */
/* ----------------------------------------------------------------------- */

type MarkerProps = {
  id: string;
  kind: "alert" | "limit";
  percent: number;
  min: number;
  max: number;
  axis: number;
  markerStyle: SpendMarkerStyle;
  bh: number;
  people: SpendRecipient[];
  active: boolean;
  passedAt: number | null;
  ariaLabel: string;
  describedBy: string;
  valueText: (percent: number) => string;
  chipText: (percent: number) => string | null;
  pinOf: (percent: number) => number | null;
  whenOf: (percent: number) => When;
  motionSafe: boolean;
  disabled: boolean;
  railRef: React.RefObject<HTMLDivElement | null>;
  register: (id: string, node: HTMLDivElement | null) => void;
  onActivate: () => void;
  onLive: (percent: number | null) => void;
  onCommit: (percent: number, via: "drag" | "key") => void;
};

const toLeft = (p: number, axis: number) => `${r3((p / axis) * 100)}%`;

/**
 * One threshold on the bar: a stem and head that follow the pointer 1:1, the
 * recipients riding above on a spring, and a date pin on the month strip
 * joined to the stem by a leader rebuilt each frame from both positions.
 */
function Marker({
  id,
  kind,
  percent,
  min,
  max,
  axis,
  markerStyle,
  bh,
  people,
  active,
  passedAt,
  ariaLabel,
  describedBy,
  valueText,
  chipText,
  pinOf,
  whenOf,
  motionSafe,
  disabled,
  railRef,
  register,
  onActivate,
  onLive,
  onCommit,
}: MarkerProps) {
  const g = GEO[markerStyle];
  const limit = kind === "limit";
  const pct = useMotionValue(percent);
  const goal = React.useRef(percent);
  const dragging = React.useRef(false);
  const from = React.useRef(percent);
  const ppp = React.useRef(1);
  const liveRef = React.useRef<number | null>(null);
  const headRef = React.useRef<HTMLDivElement | null>(null);
  const [live, setLive] = React.useState<number | null>(null);
  const shown = live ?? percent;

  // A host (or a key) that changes the percent gets the same snap a release does.
  React.useEffect(() => {
    if (dragging.current || goal.current === percent) return;
    goal.current = percent;
    const controls = animate(
      pct,
      percent,
      motionSafe ? springs.snap : { duration: 0 },
    );
    return () => controls.stop();
  }, [percent, pct, motionSafe]);

  const left = useTransform(pct, (p) => toLeft(p, axis));
  // The avatars are carried, not glued: they follow the stem on the snap
  // spring, so a quick drag leaves them a beat behind and they catch up with
  // one crisp overshoot.
  const ride = useSpring(pct, {
    stiffness: springs.snap.stiffness,
    damping: springs.snap.damping,
    mass: springs.snap.mass,
  });
  const rideLeft = useTransform(
    [ride, pct] as MotionValue<number>[],
    ([r = 0, p = 0]: number[]) =>
      `clamp(2rem, ${r3(((motionSafe ? r : p) / axis) * 100)}%, calc(100% - 2rem))`,
  );
  // The date pin trails further, on glide: the date is a consequence of the
  // amount, and the lag lets the eye follow one into the other.
  const pinTarget = useTransform(pct, (p) => pinOf(p) ?? -10);
  const pinSpring = useSpring(pinTarget, {
    stiffness: springs.glide.stiffness,
    damping: springs.glide.damping,
    mass: springs.glide.mass,
  });
  const pinX = useTransform(
    [pinSpring, pinTarget] as MotionValue<number>[],
    ([sp = 0, t = 0]: number[]) => r3(motionSafe ? sp : t),
  );
  const pinLeft = useTransform(pinX, (v) => `${v}%`);
  const chipLeft = useTransform(
    pinX,
    (v) => `clamp(2.5rem, ${v}%, calc(100% - 2.5rem))`,
  );
  const leader = useTransform(
    [pct, pinX] as MotionValue<number>[],
    ([p = 0, q = 0]: number[]) => {
      const mx = r3((p / axis) * 100);
      const px = r3(q);
      const a = r3(LEADER * 0.62);
      const b = r3(LEADER * 0.38);
      return `M ${mx} 0 C ${mx} ${a} ${px} ${b} ${px} ${LEADER}`;
    },
  );

  // Crossing what has already been spent flips the head; a flick says so.
  const headScale = useMotionValue(1);
  const passed = passedAt !== null && shown <= passedAt;
  const wasPassed = React.useRef(passed);
  React.useEffect(() => {
    if (wasPassed.current === passed) return;
    wasPassed.current = passed;
    if (!motionSafe) return;
    headScale.jump(1.16);
    const controls = animate(headScale, 1, springs.flick);
    return () => controls.stop();
  }, [passed, headScale, motionSafe]);

  const setLiveValue = (q: number | null) => {
    if (liveRef.current === q) return;
    liveRef.current = q;
    setLive(q);
    onLive(q);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      from.current = pct.get();
      const w = railRef.current?.getBoundingClientRect().width ?? 0;
      ppp.current = w > 0 ? w / axis : 1;
      onActivate();
    },
    onMove: ({ offset }) => {
      const raw = from.current + offset.x / ppp.current;
      const v = rubberClamp(raw, min, max, 18 / ppp.current);
      pct.set(r3(v));
      setLiveValue(Math.round(clamp(v, min, max)));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const v = velocity.x / ppp.current;
      const q = Math.round(clamp(project(pct.get(), v, 0.99), min, max));
      goal.current = q;
      animate(
        pct,
        q,
        motionSafe ? { ...springs.snap, velocity: v } : { duration: 0 },
      );
      setLiveValue(null);
      onCommit(q, "drag");
    },
    onCancel: () => {
      dragging.current = false;
      goal.current = percent;
      animate(pct, percent, motionSafe ? springs.snap : { duration: 0 });
      setLiveValue(null);
    },
    onTap: () => {
      onActivate();
      headRef.current?.focus();
    },
  });

  const bindHead = React.useCallback(
    (node: HTMLDivElement | null) => {
      headRef.current = node;
      register(id, node);
    },
    [id, register],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 5 : 1;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = percent + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = percent - step;
        break;
      case "PageUp":
        next = percent + 10;
        break;
      case "PageDown":
        next = percent - 10;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    onCommit(clamp(Math.round(next), min, max), "key");
  };

  const when = whenOf(shown);
  const chip = active ? chipText(shown) : null;
  const flip = markerStyle === "flag" && shown / axis > 0.66;
  const filled = passed || limit;
  // Under 32rem the heads drop their unit and the avatars become dots, so
  // markers a few percent apart still sit side by side on a phone.
  const label = limit ? (
    <span className="@max-[32rem]:hidden">Stop</span>
  ) : (
    <span>
      {shown}
      <span className="@max-[32rem]:hidden">%</span>
    </span>
  );
  // Colour is carried by classes, never by a style that changes: motion does
  // not re-apply a changed plain colour on the elements it manages.
  const fillClass = limit
    ? "border-transparent bg-[oklch(from_var(--danger)_0.55_0.2_h)] text-[oklch(0.99_0_0)]"
    : "border-transparent bg-(--sg-fill) text-[oklch(0.2_0.02_258)]";
  const stemClass = limit ? "bg-danger" : "bg-(--sg-ink)";

  const head =
    markerStyle === "pin" ? (
      <span
        className={cn(
          "inline-flex h-[18px] items-center gap-1 rounded-full border px-1.5 font-mono text-[10px] leading-none whitespace-nowrap tabular-nums",
          filled ? fillClass : "border-(--sg-ink) bg-card text-foreground",
        )}
      >
        {limit ? <OctagonX aria-hidden className="size-3" /> : null}
        {label}
      </span>
    ) : markerStyle === "flag" ? (
      <span
        className={cn(
          "inline-flex h-5 items-center gap-1 border px-1.5 font-mono text-[10px] leading-none whitespace-nowrap tabular-nums",
          flip ? "rounded-l-2" : "rounded-r-2",
          filled
            ? fillClass
            : "border-(--sg-ink) bg-[color-mix(in_oklab,var(--sg-ink)_14%,var(--card))] text-foreground",
        )}
      >
        {limit ? <OctagonX aria-hidden className="size-3" /> : null}
        {label}
      </span>
    ) : (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-1 border px-0.5 font-mono text-[10px] leading-3 whitespace-nowrap tabular-nums",
          filled ? fillClass : "border-transparent bg-card text-foreground",
        )}
      >
        {limit ? <OctagonX aria-hidden className="size-3" /> : null}
        {label}
      </span>
    );

  const stemHeight = 6 + (g.room - g.stemTop) + bh;

  return (
    <>
      {/* Riding avatars */}
      {!limit && people.length > 0 ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute z-[2]"
          style={{ left: rideLeft, top: g.avatarTop }}
        >
          <div className="-translate-x-1/2">
            {g.avatar >= 12 ? (
              <span className="@max-[32rem]:hidden">
                <AvatarStack people={people} size={g.avatar} />
              </span>
            ) : null}
            <span
              className={cn(
                "flex justify-center",
                g.avatar >= 12 && "@min-[32rem]:hidden",
              )}
              style={{ paddingTop: Math.max(0, g.avatar - 8) }}
            >
              <AvatarStack people={people} size={8} />
            </span>
          </div>
        </motion.div>
      ) : null}

      {/* Stem and head */}
      <motion.div
        className={cn("absolute top-0", active ? "z-[4]" : "z-[3]")}
        style={{ left }}
      >
        <span
          aria-hidden
          data-sg-stem={id}
          {...drag}
          className={cn(
            "absolute w-4 -translate-x-1/2 touch-pan-y",
            disabled ? "cursor-not-allowed" : "cursor-ew-resize",
          )}
          style={{ top: g.stemTop, height: stemHeight }}
        >
          <span
            className={cn(
              "absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full",
              markerStyle === "tick" ? "w-px" : "w-0.5",
              stemClass,
            )}
          />
        </span>
        <motion.div
          ref={bindHead}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          aria-orientation="horizontal"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={shown}
          aria-valuetext={valueText(shown)}
          aria-disabled={disabled || undefined}
          data-sg-marker={id}
          onKeyDown={onKeyDown}
          onFocus={onActivate}
          {...drag}
          className={cn(
            "absolute touch-pan-y select-none",
            markerStyle === "flag"
              ? flip
                ? "right-0 rounded-l-2"
                : "left-0 rounded-r-2"
              : markerStyle === "pin"
                ? "-translate-x-1/2 rounded-full"
                : "-translate-x-1/2 rounded-1",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
            FOCUS_RING,
          )}
          style={{ top: g.headTop, scale: headScale }}
        >
          {head}
        </motion.div>
      </motion.div>

      {/* Leader from the bar to the date */}
      {when.kind !== "unknown" ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-[1] w-full overflow-visible"
          style={{ top: g.room + bh, height: LEADER }}
          viewBox={`0 0 100 ${LEADER}`}
          preserveAspectRatio="none"
        >
          <motion.path
            d={leader}
            fill="none"
            strokeWidth={active ? 1.5 : 1}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={when.kind === "later" ? "3 3" : undefined}
            className={cn(
              limit ? "stroke-danger" : "stroke-(--sg-ink)",
              active ? "opacity-90" : "opacity-45",
            )}
          />
        </svg>
      ) : null}

      {/* Date pin on the month strip */}
      {when.kind !== "unknown" ? (
        <motion.span
          aria-hidden
          data-sg-pin={id}
          className={cn(
            "pointer-events-none absolute z-[2] -translate-x-1/2 -translate-y-1/2 border-[1.5px]",
            limit
              ? "rounded-[2px] border-danger"
              : "rounded-full border-(--sg-ink)",
            active ? "size-[11px]" : "size-[9px]",
            when.kind === "passed"
              ? limit
                ? "bg-danger"
                : "bg-(--sg-ink)"
              : when.kind === "later"
                ? "border-dashed bg-surface-2"
                : "bg-card",
          )}
          style={{ left: pinLeft, top: g.room + bh + LEADER }}
        />
      ) : null}
      {chip ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute z-[2] -translate-x-1/2 rounded-full border border-hairline bg-popover px-1.5 font-mono text-[10px] leading-4 whitespace-nowrap text-foreground tabular-nums"
          style={{ left: chipLeft, top: g.room + bh + LEADER + 24 }}
        >
          {chip}
        </motion.span>
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                             Recipients menu                              */
/* ----------------------------------------------------------------------- */

function RecipientMenu({
  people,
  chosen,
  alertLabel,
  disabled,
  motionSafe,
  onToggle,
}: {
  people: SpendRecipient[];
  chosen: string[];
  alertLabel: string;
  disabled: boolean;
  motionSafe: boolean;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const menuId = React.useId();
  const wrap = React.useRef<HTMLDivElement | null>(null);
  const button = React.useRef<HTMLButtonElement | null>(null);
  const items = React.useRef(new Map<string, HTMLButtonElement>());

  React.useEffect(() => {
    if (!open) return;
    const first = people[0];
    if (first) items.current.get(first.id)?.focus();
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, people]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const ids = people.map((p) => p.id);
    const at = ids.findIndex(
      (id) => items.current.get(id) === document.activeElement,
    );
    const go = (i: number) => {
      const id = ids[(i + ids.length) % ids.length];
      if (id) items.current.get(id)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(at + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        go(at - 1);
        break;
      case "Home":
        event.preventDefault();
        go(0);
        break;
      case "End":
        event.preventDefault();
        go(ids.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={wrap}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Choose who hears the ${alertLabel}`}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-hairline-strong px-2.5 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
          disabled && "cursor-not-allowed opacity-60",
          FOCUS_RING,
        )}
      >
        <UserPlus aria-hidden className="size-3.5" />
        People
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="menu"
            id={menuId}
            role="menu"
            aria-label={`Who hears the ${alertLabel}`}
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? {
                    y: springs.snap,
                    opacity: { duration: durations.fast, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
            className="absolute inset-x-2 top-full z-30 -mt-1 flex max-w-72 flex-col rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_30px_-8px_color-mix(in_oklab,black_30%,transparent)]"
          >
            {people.map((p) => {
              const on = chosen.includes(p.id);
              return (
                <button
                  key={p.id}
                  ref={(node) => {
                    if (node) items.current.set(p.id, node);
                    else items.current.delete(p.id);
                  }}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  tabIndex={-1}
                  onClick={() => onToggle(p.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-2 px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2",
                    "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  )}
                >
                  <Avatar person={p} size={22} ring={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-foreground">
                      {p.name}
                    </span>
                    {p.role ? (
                      <span className="block truncate text-[11px] text-ink-3">
                        {p.role}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex size-4 shrink-0 items-center justify-center rounded-1 border",
                      on
                        ? "border-transparent bg-(--sg-ink) text-card"
                        : "border-hairline-strong",
                    )}
                  >
                    {on ? <Check className="size-3" /> : null}
                  </span>
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The panel                                 */
/* ----------------------------------------------------------------------- */

type Said = { n: number; text: string };
type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * A budget-alerts panel for a project's cloud spend this month. One spend
 * bar carries the month: what has been spent as a fill, the forecast to the
 * month's end as a hatch, a hairline at the budget, and a marker for every
 * alert threshold with the people it reaches riding on its head. Under the
 * bar a month strip pins each threshold to the day it fired, or the day it
 * will fire at the current pace, joined to its marker by a leader.
 *
 * Dragging a marker follows the pointer 1:1 and rubber-bands past the axis;
 * its avatars follow on springs.snap and its date pin trails on
 * springs.glide, so the date reads as a consequence of the amount. Release
 * snaps to a whole percent on snap with the throw's velocity. Each marker is
 * a slider: arrows move it a percent (Shift five, Page keys ten). An optional
 * hard limit says plainly what stops. Loading, empty and error states keep
 * the bar and its markers.
 */
export function SpendGuard({
  markerStyle = "pin",
  barHeight = 20,
  palette = "cobalt",
  budget = 5000,
  thresholds,
  defaultThresholds,
  onThresholdChange,
  recipients = defaultSpendRecipients,
  onRecipientsChange,
  hardLimit,
  defaultHardLimit = null,
  onHardLimitChange,
  hardLimitEffect = DEFAULT_EFFECT,
  daily = defaultSpendDaily,
  now = defaultSpendNow,
  format,
  onSave,
  status = "ready",
  onRetry,
  project: projectName = "Waylight",
  height = 540,
  disabled = false,
  className,
}: SpendGuardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const limitBodyId = `${uid}-limit`;
  const fmt = format ?? defaultFormat;
  const pal = PALETTES[palette] ?? PALETTES.cobalt;
  const style = GEO[markerStyle] ? markerStyle : "pin";
  const g = GEO[style];
  const bh = Math.round(clamp(barHeight, 8, 48));
  const b = Math.max(1, budget);

  /* ------------------------------ values -------------------------------- */

  const [ownT, setOwnT] = React.useState<SpendThreshold[]>(
    () => defaultThresholds ?? defaultSpendThresholds,
  );
  const list = thresholds ?? ownT;
  const writeT = (next: SpendThreshold[], id: string) => {
    if (thresholds === undefined) setOwnT(next);
    onThresholdChange?.(next, id);
  };

  const [ownLimit, setOwnLimit] = React.useState<number | null>(
    defaultHardLimit,
  );
  const limit = hardLimit !== undefined ? hardLimit : ownLimit;
  const writeLimit = (v: number | null) => {
    if (hardLimit === undefined) setOwnLimit(v);
    onHardLimitChange?.(v);
  };

  const [saved, setSaved] = React.useState<SpendConfig>(() => ({
    thresholds: thresholds ?? defaultThresholds ?? defaultSpendThresholds,
    hardLimit: hardLimit !== undefined ? hardLimit : defaultHardLimit,
  }));

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------- model -------------------------------- */

  const model = React.useMemo(() => spendModel(daily, now, b), [daily, now, b]);
  const hasData = status === "ready" && model.elapsed > 0;
  const spent = status === "ready" ? model.spent : 0;
  const axis = model.axis;
  const pctOfAmount = (amount: number) => (amount / b) * 100;
  const amountOf = (p: number) => Math.round((p / 100) * b);
  const spentPct = r3(pctOfAmount(spent));
  const forecastPct = hasData ? r3(pctOfAmount(model.forecast)) : spentPct;

  const dayOfWeek = (day: number) =>
    new Date(Date.UTC(model.year, model.month, day)).getUTCDay();
  const dateShort = (day: number) =>
    `${day} ${(MONTHS[model.month] ?? "").slice(0, 3)}`;
  const dateLong = (day: number) =>
    `${WEEKDAYS[dayOfWeek(day)] ?? ""} ${day} ${MONTHS[model.month] ?? ""}`;

  const whenAmount = (amount: number): When => {
    if (!hasData) return { kind: "unknown", day: 0 };
    if (amount <= model.spent) {
      const i = model.cum.findIndex((c) => c >= amount);
      return { kind: "passed", day: Math.max(1, i + 1) };
    }
    if (model.pace <= 0) return { kind: "later", day: 0 };
    const day = model.elapsed + Math.ceil((amount - model.spent) / model.pace);
    return day > model.dim ? { kind: "later", day } : { kind: "upcoming", day };
  };
  const whenOf = (p: number) => whenAmount(amountOf(p));
  const pinOfWhen = (w: When) =>
    w.kind === "passed" || w.kind === "upcoming"
      ? r3(((w.day - 0.5) / model.dim) * STRIP)
      : w.kind === "later"
        ? LATER
        : null;
  const pinOf = (p: number) => pinOfWhen(whenOf(p));

  const whenText = (w: When) =>
    w.kind === "passed"
      ? `fired ${dateShort(w.day)}`
      : w.kind === "upcoming"
        ? `fires ${dateShort(w.day)}`
        : w.kind === "later"
          ? "not this month"
          : status === "error"
            ? "date unknown"
            : status === "loading"
              ? "loading date"
              : "dates once spend arrives";
  const chipFor = (w: When) =>
    w.kind === "passed"
      ? `fired ${dateShort(w.day)}`
      : w.kind === "upcoming"
        ? `${(WEEKDAYS[dayOfWeek(w.day)] ?? "").slice(0, 3)} ${dateShort(w.day)}`
        : null;
  const whenSentence = (w: When) =>
    w.kind === "passed"
      ? `Fired on ${dateLong(w.day)}.`
      : w.kind === "upcoming"
        ? `Fires ${dateLong(w.day)} at the current pace.`
        : w.kind === "later"
          ? "Will not fire this month at the current pace."
          : "No date until spend data arrives.";

  const peopleOf = (ids: string[]) =>
    ids
      .map((id) => recipients.find((p) => p.id === id))
      .filter((p): p is SpendRecipient => !!p);

  /* ------------------------------ markers ------------------------------- */

  const railRef = React.useRef<HTMLDivElement | null>(null);
  const heads = React.useRef(new Map<string, HTMLDivElement>());
  const register = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) heads.current.set(id, node);
      else heads.current.delete(id);
    },
    [],
  );
  const focusReq = React.useRef<string | null>(null);
  const [focusTick, setFocusTick] = React.useState(0);
  React.useEffect(() => {
    const key = focusReq.current;
    if (!key) return;
    const node =
      key === "add" ? addRef.current : (heads.current.get(key) ?? null);
    if (node?.isConnected) {
      focusReq.current = null;
      node.focus({ preventScroll: true });
    }
  }, [focusTick, list]);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [live, setLive] = React.useState<{ id: string; p: number } | null>(
    null,
  );
  const livePct = (t: { id: string; percent: number }) =>
    live && live.id === t.id ? live.p : t.percent;

  const minPct = 5;
  const maxPct = axis;
  const limitPct = limit !== null ? clamp(r3(pctOfAmount(limit)), 50, axis) : 0;

  const commitThreshold = (id: string, p: number, via: "drag" | "key") => {
    if (disabled) return;
    const before = list.find((t) => t.id === id);
    if (!before || before.percent === p) return;
    const next = list.map((t) => (t.id === id ? { ...t, percent: p } : t));
    writeT(next, id);
    if (via === "drag") {
      const w = whenOf(p);
      say(
        `${before.percent}% alert moved to ${p}%, ${fmt(amountOf(p))}. ${whenSentence(w)}`,
      );
    }
  };

  const commitLimit = (p: number, via: "drag" | "key") => {
    if (disabled) return;
    const amount = Math.round(amountOf(p) / 50) * 50;
    if (amount === limit) return;
    writeLimit(amount);
    if (via === "drag") say(`Hard limit moved to ${fmt(amount)}.`);
  };

  const toggleRecipient = (t: SpendThreshold, person: string) => {
    if (disabled) return;
    const on = t.recipients.includes(person);
    const ids = on
      ? t.recipients.filter((x) => x !== person)
      : [...t.recipients, person];
    const next = list.map((x) =>
      x.id === t.id ? { ...x, recipients: ids } : x,
    );
    writeT(next, t.id);
    onRecipientsChange?.(t.id, ids);
    const who = recipients.find((p) => p.id === person)?.name ?? person;
    say(
      on
        ? `${who} no longer hears the ${t.percent}% alert.`
        : `${who} now hears the ${t.percent}% alert.`,
    );
  };

  const addRef = React.useRef<HTMLButtonElement | null>(null);
  const counter = React.useRef(0);
  const addAlert = () => {
    if (disabled || list.length >= 5) return;
    const marks = [0, ...list.map((t) => t.percent).sort((a, c) => a - c), 120];
    let best = 50;
    let width = -1;
    for (let i = 1; i < marks.length; i++) {
      const lo = marks[i - 1] ?? 0;
      const hi = marks[i] ?? 0;
      if (hi - lo > width) {
        width = hi - lo;
        best = Math.round((lo + hi) / 2 / 5) * 5;
      }
    }
    counter.current += 1;
    const id = `${idBase}-a${counter.current}`;
    const first = recipients[0]?.id;
    const t: SpendThreshold = {
      id,
      percent: clamp(best, minPct, maxPct),
      recipients: first ? [first] : [],
    };
    writeT([...list, t], id);
    setActiveId(id);
    focusReq.current = id;
    setFocusTick((n) => n + 1);
    say(
      `Added a ${t.percent}% alert, ${fmt(amountOf(t.percent))}. ${whenSentence(whenOf(t.percent))}`,
    );
  };

  const removeAlert = (t: SpendThreshold) => {
    if (disabled) return;
    writeT(
      list.filter((x) => x.id !== t.id),
      t.id,
    );
    if (activeId === t.id) setActiveId(null);
    focusReq.current = "add";
    setFocusTick((n) => n + 1);
    say(`Removed the ${t.percent}% alert.`);
  };

  /* ------------------------------- save --------------------------------- */

  const sameT = (a: SpendThreshold, c: SpendThreshold) =>
    a.percent === c.percent &&
    a.recipients.length === c.recipients.length &&
    a.recipients.every((r) => c.recipients.includes(r));
  const changes =
    list.filter((t) => {
      const was = saved.thresholds.find((x) => x.id === t.id);
      return !was || !sameT(was, t);
    }).length +
    saved.thresholds.filter((x) => !list.some((t) => t.id === x.id)).length +
    (saved.hardLimit === limit ? 0 : 1);

  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const saveTimer = React.useRef(0);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(saveTimer.current);
    };
  }, []);

  const save = () => {
    if (disabled || saveState === "saving") return;
    const config: SpendConfig = { thresholds: list, hardLimit: limit };
    const done = () => {
      if (!alive.current) return;
      setSaved(config);
      setSaveState("saved");
      say(
        `Saved. ${list.length} ${list.length === 1 ? "alert" : "alerts"}${limit !== null ? `, hard limit ${fmt(limit)}` : ", no hard limit"}.`,
      );
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        if (alive.current) setSaveState("idle");
      }, 1800);
    };
    let result: unknown;
    try {
      result = onSave?.(config);
    } catch {
      setSaveState("failed");
      say("Did not save. Try again.");
      return;
    }
    if (result && typeof (result as PromiseLike<void>).then === "function") {
      setSaveState("saving");
      Promise.resolve(result as PromiseLike<void>).then(done, () => {
        if (!alive.current) return;
        setSaveState("failed");
        say("Did not save. Try again.");
      });
    } else {
      done();
    }
  };

  const discard = () => {
    if (disabled) return;
    writeT(saved.thresholds, "");
    writeLimit(saved.hardLimit);
    setSaveState("idle");
    say("Changes discarded.");
  };

  /* ------------------------------ hard limit ---------------------------- */

  const limitOn = limit !== null;
  const toggleLimit = () => {
    if (disabled) return;
    if (limitOn) {
      writeLimit(null);
      say("Hard limit off. Spending will not be stopped.");
    } else {
      const top = Math.max(125, ...list.map((t) => t.percent + 10));
      const amount = Math.round(amountOf(clamp(top, 50, axis)) / 50) * 50;
      writeLimit(amount);
      say(`Hard limit on at ${fmt(amount)}. ${hardLimitEffect}`);
    }
  };
  const stepLimit = (delta: number) => {
    if (disabled || limit === null) return;
    const lo = Math.round(amountOf(50) / 50) * 50;
    const hi = Math.round(amountOf(axis) / 50) * 50;
    const amount = clamp(limit + delta, lo, hi);
    if (amount !== limit) writeLimit(amount);
  };

  // The body is measured, never reserved: it opens to its own height.
  const [limitNode, setLimitNode] = React.useState<HTMLDivElement | null>(null);
  const [limitH, setLimitH] = React.useState(0);
  React.useEffect(() => {
    if (!limitNode) return;
    const ro = new ResizeObserver(() =>
      setLimitH(Math.round(limitNode.getBoundingClientRect().height)),
    );
    ro.observe(limitNode);
    return () => ro.disconnect();
  }, [limitNode]);

  /* ------------------------------ spend fill ---------------------------- */

  const fillMv = useMotionValue(spentPct);
  React.useEffect(() => {
    const controls = animate(
      fillMv,
      spentPct,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [spentPct, fillMv, motionSafe]);
  const fillWidth = useTransform(fillMv, (p) => toLeft(p, axis));
  const hatchLeft = fillWidth;
  const hatchWidth = useTransform(fillMv, (p) =>
    toLeft(Math.max(0, Math.min(axis, forecastPct) - p), axis),
  );

  /* -------------------------------- text -------------------------------- */

  const active =
    activeId === "limit"
      ? "limit"
      : (list.find((t) => t.id === activeId)?.id ?? null);
  const activeT =
    active && active !== "limit"
      ? list.find((t) => t.id === active)
      : undefined;

  const inspector = (() => {
    if (status === "loading") return "Loading this month's spend.";
    if (active === "limit" && limit !== null) {
      const p = live && live.id === "limit" ? live.p : limitPct;
      const amt = Math.round(amountOf(p) / 50) * 50;
      return `Hard limit · ${fmt(amt)} · ${whenText(whenAmount(amt))}`;
    }
    if (activeT) {
      const p = livePct(activeT);
      const ppl = peopleOf(activeT.recipients).map((x) => firstName(x.name));
      return `${p}% · ${fmt(amountOf(p))} · ${whenText(whenOf(p))}${whenOf(p).kind === "upcoming" ? " at this pace" : ""} · ${ppl.length ? andList(ppl) : "nobody yet"}`;
    }
    return "Drag a marker, or focus one and use the arrow keys.";
  })();

  const valueTextFor = (t: SpendThreshold) => (p: number) => {
    const ppl = peopleOf(t.recipients).map((x) => x.name);
    return `${p}% of budget, ${fmt(amountOf(p))}. ${whenSentence(whenOf(p))} ${ppl.length ? `Alerts ${andList(ppl)}.` : "Alerts nobody yet."}`;
  };

  const summary = hasData
    ? `Spent ${fmt(model.spent)} of a ${fmt(b)} budget, ${Math.round(spentPct)}%, on day ${model.elapsed} of ${model.dim}. At ${fmt(model.pace)} a day the month ends near ${fmt(model.forecast)}, ${Math.round(forecastPct)}% of budget.`
    : status === "loading"
      ? "Loading this month's spend."
      : status === "error"
        ? "This month's spend did not load."
        : "No spend recorded yet this month.";

  const over = hasData && model.forecast > b;
  const monthLabel = `${MONTHS[model.month] ?? ""} ${model.year}`;
  const stageH = g.room + bh + LEADER + 46;
  const dayTicks = Array.from({ length: model.dim }, (_, i) => i + 1);
  const labelDays = [1, 10, 20, model.dim];

  const skeleton = (w: string) => (
    <span
      aria-hidden
      className={cn(
        "block h-3 rounded-full bg-surface-2 motion-safe:animate-pulse",
        w,
      )}
    />
  );

  const stat = (
    label: string,
    value: React.ReactNode,
    sub?: React.ReactNode,
    tone?: string,
  ) => (
    <div className="min-w-0">
      <p className="text-[11px] text-ink-3">{label}</p>
      <p className={cn("truncate font-mono text-[13px] tabular-nums", tone)}>
        {status === "loading" ? skeleton("mt-1 w-16") : value}
      </p>
      {sub && status !== "loading" ? (
        <p className="truncate text-[11px] text-ink-3 tabular-nums">{sub}</p>
      ) : null}
    </div>
  );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs transition-colors",
    FOCUS_RING,
  );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container grid w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--sg-fill" as string]: pal.fill,
        ["--sg-ink" as string]: pal.ink,
      }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 basis-40">
          <p id={titleId} className="truncate text-sm font-semibold">
            {projectName} · cloud spend
          </p>
          <p className="truncate text-[11px] text-ink-3 tabular-nums">
            {monthLabel} · budget {fmt(b)}
          </p>
        </div>
        {hasData ? (
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px]",
              over
                ? "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-foreground"
                : "border-hairline bg-surface-2 text-ink-2",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                over ? "bg-warn" : "bg-success",
              )}
            />
            {over ? "Forecast over budget" : "On track"}
          </span>
        ) : null}
      </header>

      <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-4 px-4 pt-3.5 pb-4">
          {/* Readouts */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 @min-[34rem]:grid-cols-4">
            {stat(
              "Spent",
              status === "error" ? "—" : fmt(spent),
              hasData ? `${Math.round(spentPct)}% of budget` : "—",
            )}
            {stat(
              "Forecast",
              hasData ? fmt(model.forecast) : "—",
              hasData ? `${Math.round(forecastPct)}% of budget` : "needs spend",
              over ? "text-warn" : undefined,
            )}
            {stat(
              "Pace",
              hasData ? `${fmt(model.pace)}/day` : "—",
              hasData ? "last 7 days" : undefined,
            )}
            {stat(
              "Day",
              `${model.today} of ${model.dim}`,
              `${model.dim - model.today} left`,
            )}
          </div>

          {status === "error" || status === "empty" ? (
            <div
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-3 border px-3 py-2.5 text-[12px]",
                status === "error"
                  ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))]"
                  : "border-hairline bg-surface-1",
              )}
            >
              {status === "error" ? (
                <TriangleAlert
                  aria-hidden
                  className="size-4 shrink-0 text-danger"
                />
              ) : null}
              <p className="min-w-0 flex-1 basis-48 text-ink-2">
                {status === "error"
                  ? "Spend did not load. Alerts can still be edited; their dates return with the data."
                  : "No spend recorded yet this month. Alerts fire as usage arrives."}
              </p>
              {status === "error" && onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className={cn(
                    button,
                    "border border-hairline text-foreground hover:bg-surface-2",
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          {/* The bar */}
          <div>
            <p
              aria-hidden
              className="line-clamp-2 h-8 text-[12px] leading-4 text-ink-2 tabular-nums"
            >
              {inspector}
            </p>
            <p id={hintId} className="sr-only">
              {summary} Each alert is a slider: arrow keys move it one percent,
              Shift five, Page Up and Page Down ten.
            </p>
            <div className="relative mt-1" style={{ height: stageH }}>
              <div
                ref={railRef}
                className="absolute inset-y-0 right-6 left-6 @min-[34rem]:right-8 @min-[34rem]:left-8"
              >
                {/* Track */}
                <div
                  className={cn(
                    "absolute inset-x-0 overflow-hidden rounded-full",
                    status === "error"
                      ? "border border-dashed border-hairline-strong"
                      : "border border-hairline bg-surface-2",
                    status === "loading" && "motion-safe:animate-pulse",
                  )}
                  style={{ top: g.room, height: bh }}
                >
                  {status === "ready" ? (
                    <>
                      <motion.span
                        aria-hidden
                        className="absolute inset-y-0 left-0"
                        style={{
                          width: fillWidth,
                          backgroundColor: "var(--sg-fill)",
                        }}
                      />
                      <motion.span
                        aria-hidden
                        className="absolute inset-y-0"
                        style={{
                          left: hatchLeft,
                          width: hatchWidth,
                          backgroundColor:
                            "color-mix(in oklab, var(--sg-fill) 16%, transparent)",
                          backgroundImage:
                            "repeating-linear-gradient(135deg, color-mix(in oklab, var(--sg-fill) 55%, transparent) 0 1.5px, transparent 1.5px 6px)",
                        }}
                      />
                    </>
                  ) : null}
                </div>
                {/* Budget line */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute z-[1] w-px bg-foreground/50"
                  style={{
                    left: toLeft(100, axis),
                    top: g.room - 4,
                    height: bh + 8,
                  }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute z-[1] -translate-x-full pr-1 font-mono text-[9px] leading-3 tracking-[0.06em] text-ink-3 uppercase @max-[32rem]:hidden"
                  style={{ left: toLeft(100, axis), top: g.room + bh + 3 }}
                >
                  budget
                </span>

                {/* Month strip */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0"
                  style={{ top: g.room + bh + LEADER }}
                >
                  <span className="absolute inset-x-0 top-0 h-px bg-hairline-strong" />
                  {status === "ready" && model.elapsed > 0 ? (
                    <span
                      className="absolute top-[-3px] left-0 h-[7px] rounded-full bg-[color-mix(in_oklab,var(--sg-fill)_22%,transparent)]"
                      style={{
                        width: `${r3((model.elapsed / model.dim) * STRIP)}%`,
                      }}
                    />
                  ) : null}
                  {dayTicks.map((d) => (
                    <span
                      key={d}
                      className={cn(
                        "absolute top-0 w-px",
                        d === model.elapsed && status === "ready"
                          ? "h-2 bg-foreground"
                          : dayOfWeek(d) === 1
                            ? "h-1.5 bg-ink-3"
                            : "h-1 bg-hairline-strong",
                      )}
                      style={{
                        left: `${r3(((d - 0.5) / model.dim) * STRIP)}%`,
                      }}
                    />
                  ))}
                  {labelDays.map((d) => (
                    <span
                      key={d}
                      className="absolute top-2.5 -translate-x-1/2 font-mono text-[9px] leading-3 text-ink-3 tabular-nums"
                      style={{
                        left: `${r3(((d - 0.5) / model.dim) * STRIP)}%`,
                      }}
                    >
                      {d}
                    </span>
                  ))}
                  <span
                    className="absolute top-2.5 -translate-x-1/2 font-mono text-[9px] leading-3 tracking-[0.06em] text-ink-3 uppercase"
                    style={{ left: `${LATER}%` }}
                  >
                    <span className="@max-[32rem]:hidden">later</span>
                    <ArrowRight
                      aria-hidden
                      className="size-2.5 @min-[32rem]:hidden"
                    />
                  </span>
                </div>

                {/* Markers */}
                {list.map((t, i) => (
                  <Marker
                    key={t.id}
                    id={t.id}
                    kind="alert"
                    percent={t.percent}
                    min={minPct}
                    max={maxPct}
                    axis={axis}
                    markerStyle={style}
                    bh={bh}
                    people={peopleOf(t.recipients)}
                    active={active === t.id}
                    passedAt={hasData ? spentPct : null}
                    ariaLabel={`Alert ${i + 1} of ${list.length}`}
                    describedBy={hintId}
                    valueText={valueTextFor(t)}
                    chipText={(p) => chipFor(whenOf(p))}
                    pinOf={pinOf}
                    whenOf={whenOf}
                    motionSafe={motionSafe}
                    disabled={disabled || status === "loading"}
                    railRef={railRef}
                    register={register}
                    onActivate={() => setActiveId(t.id)}
                    onLive={(p) => setLive(p === null ? null : { id: t.id, p })}
                    onCommit={(p, via) => commitThreshold(t.id, p, via)}
                  />
                ))}
                {limitOn ? (
                  <Marker
                    key="limit"
                    id="limit"
                    kind="limit"
                    percent={Math.round(limitPct)}
                    min={50}
                    max={axis}
                    axis={axis}
                    markerStyle={style}
                    bh={bh}
                    people={[]}
                    active={active === "limit"}
                    passedAt={null}
                    ariaLabel="Hard limit"
                    describedBy={hintId}
                    chipText={(p) =>
                      chipFor(whenAmount(Math.round(amountOf(p) / 50) * 50))
                    }
                    valueText={(p) => {
                      const amt = Math.round(amountOf(p) / 50) * 50;
                      return `${fmt(amt)}, ${p}% of budget. ${whenSentence(whenAmount(amt))} At this amount: ${hardLimitEffect}`;
                    }}
                    pinOf={pinOf}
                    whenOf={whenOf}
                    motionSafe={motionSafe}
                    disabled={disabled || status === "loading"}
                    railRef={railRef}
                    register={register}
                    onActivate={() => setActiveId("limit")}
                    onLive={(p) =>
                      setLive(p === null ? null : { id: "limit", p })
                    }
                    onCommit={commitLimit}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {/* Alert rows */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-foreground">
                Alerts{" "}
                <span className="font-normal text-ink-3 tabular-nums">
                  · {list.length} of 5
                </span>
              </p>
              <button
                ref={addRef}
                type="button"
                onClick={addAlert}
                aria-disabled={disabled || list.length >= 5 || undefined}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline px-2.5 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  (disabled || list.length >= 5) &&
                    "cursor-not-allowed opacity-50",
                  FOCUS_RING,
                )}
              >
                <Plus aria-hidden className="size-3.5" />
                Add alert
              </button>
            </div>
            {list.length === 0 ? (
              <p className="rounded-3 border border-dashed border-hairline-strong px-3 py-3 text-[12px] text-ink-2">
                No alerts yet. Add one to hear before the bill does.
              </p>
            ) : (
              <ul className="grid gap-2 @min-[40rem]:grid-cols-2">
                <AnimatePresence initial={false}>
                  {list.map((t) => {
                    const p = livePct(t);
                    const w = whenOf(p);
                    const people = peopleOf(t.recipients);
                    const isActive = active === t.id;
                    return (
                      <motion.li
                        key={t.id}
                        layout={motionSafe ? "position" : false}
                        initial={{
                          opacity: 0,
                          y: motionSafe ? distances.step : 0,
                        }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? {
                                layout: springs.glide,
                                y: springs.snap,
                                opacity: { duration: durations.base },
                              }
                            : { duration: durations.fast }
                        }
                        className={cn(
                          "relative rounded-3 border bg-surface-1 px-3 py-2.5 transition-colors",
                          isActive
                            ? "border-[color-mix(in_oklab,var(--sg-ink)_45%,transparent)]"
                            : "border-hairline",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <BellRing
                            aria-hidden
                            className="size-3.5 shrink-0"
                            style={{ color: "var(--sg-ink)" }}
                          />
                          <span className="font-mono text-[13px] tabular-nums">
                            {p}%
                          </span>
                          <span className="text-[12px] text-ink-2 tabular-nums">
                            {fmt(amountOf(p))}
                          </span>
                          <span
                            className={cn(
                              "ml-auto inline-flex h-5 items-center rounded-full px-2 text-[11px] whitespace-nowrap tabular-nums",
                              w.kind === "passed"
                                ? "bg-[color-mix(in_oklab,var(--sg-ink)_14%,transparent)] text-foreground"
                                : w.kind === "upcoming"
                                  ? "border border-hairline text-ink-2"
                                  : "text-ink-3",
                            )}
                          >
                            {whenText(w)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove the ${t.percent}% alert`}
                            onClick={() => removeAlert(t)}
                            aria-disabled={disabled || undefined}
                            className={cn(
                              "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                              FOCUS_RING,
                            )}
                          >
                            <X aria-hidden className="size-3.5" />
                          </button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <AnimatePresence initial={false}>
                            {people.map((person) => (
                              <motion.span
                                key={person.id}
                                initial={{
                                  opacity: 0,
                                  scale: motionSafe ? 0.9 : 1,
                                }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{
                                  opacity: 0,
                                  transition: exitFor(durations.fast),
                                }}
                                transition={
                                  motionSafe
                                    ? {
                                        scale: springs.snap,
                                        opacity: { duration: durations.fast },
                                      }
                                    : { duration: durations.fast }
                                }
                                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-card pr-0.5 pl-0.5"
                              >
                                <Avatar
                                  person={person}
                                  size={22}
                                  ring={false}
                                />
                                <span className="text-[12px] text-foreground">
                                  {firstName(person.name)}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Remove ${person.name} from the ${t.percent}% alert`}
                                  onClick={() => toggleRecipient(t, person.id)}
                                  className={cn(
                                    "inline-flex size-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                                    FOCUS_RING,
                                  )}
                                >
                                  <X aria-hidden className="size-3" />
                                </button>
                              </motion.span>
                            ))}
                          </AnimatePresence>
                          {people.length === 0 ? (
                            <span className="text-[11px] text-warn">
                              Reaches nobody yet
                            </span>
                          ) : null}
                          <RecipientMenu
                            people={recipients}
                            chosen={t.recipients}
                            alertLabel={`${t.percent}% alert`}
                            disabled={disabled}
                            motionSafe={motionSafe}
                            onToggle={(id) => toggleRecipient(t, id)}
                          />
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>

          {/* Hard limit */}
          <div
            className={cn(
              "rounded-3 border px-3 py-2.5 transition-colors",
              limitOn
                ? "border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--danger)_5%,var(--card))]"
                : "border-hairline bg-surface-1",
            )}
          >
            <div className="flex items-center gap-3">
              <OctagonX
                aria-hidden
                className={cn(
                  "size-4 shrink-0",
                  limitOn ? "text-danger" : "text-ink-3",
                )}
              />
              <div className="min-w-0 flex-1">
                <p
                  id={`${uid}-limit-label`}
                  className="text-[13px] font-medium"
                >
                  Hard limit
                </p>
                <p className="text-[11px] text-ink-3">
                  {limitOn
                    ? `Stops spending at ${fmt(limit)}`
                    : "Off · alerts only, nothing is stopped"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={limitOn}
                aria-labelledby={`${uid}-limit-label`}
                aria-controls={limitBodyId}
                aria-disabled={disabled || undefined}
                onClick={toggleLimit}
                className={cn(
                  "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors",
                  limitOn
                    ? "border-transparent bg-danger"
                    : "border-hairline-strong bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <motion.span
                  aria-hidden
                  className="absolute top-[3px] left-[3px] size-4 rounded-full bg-card shadow-sm"
                  animate={{ x: limitOn ? 16 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </button>
            </div>
            <motion.div
              id={limitBodyId}
              className="overflow-hidden"
              initial={false}
              animate={{
                height: limitOn ? limitH : 0,
                opacity: limitOn ? 1 : 0,
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: 0 }
              }
              aria-hidden={!limitOn}
              inert={!limitOn}
            >
              <div ref={setLimitNode} className="pt-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex items-center rounded-2 border border-hairline bg-card">
                    <button
                      type="button"
                      aria-label="Lower the hard limit by 250"
                      onClick={() => stepLimit(-250)}
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-l-2 text-ink-2 hover:bg-surface-2",
                        FOCUS_RING,
                      )}
                    >
                      <span aria-hidden className="text-sm leading-none">
                        −
                      </span>
                    </button>
                    <span className="min-w-[5.5rem] px-1 text-center font-mono text-[13px] tabular-nums">
                      {limit !== null ? fmt(limit) : "—"}
                    </span>
                    <button
                      type="button"
                      aria-label="Raise the hard limit by 250"
                      onClick={() => stepLimit(250)}
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-r-2 text-ink-2 hover:bg-surface-2",
                        FOCUS_RING,
                      )}
                    >
                      <Plus aria-hidden className="size-3.5" />
                    </button>
                  </div>
                  <span className="text-[11px] text-ink-3 tabular-nums">
                    {limit !== null
                      ? whenText(whenAmount(limit)).replace(
                          "fires",
                          "would stop",
                        )
                      : ""}
                  </span>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-ink-2">
                  <span className="font-medium text-foreground">
                    At {limit !== null ? fmt(limit) : "the limit"}:
                  </span>{" "}
                  {hardLimitEffect}
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline px-4 py-2.5">
        <p className="min-w-0 text-[12px] text-ink-3 tabular-nums">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : saveState === "failed"
                ? "Did not save"
                : changes > 0
                  ? `${changes} unsaved ${changes === 1 ? "change" : "changes"}`
                  : "All changes saved"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={discard}
            aria-disabled={disabled || changes === 0 || undefined}
            className={cn(
              button,
              "text-ink-2 hover:bg-surface-2 hover:text-foreground",
              (disabled || changes === 0) && "cursor-not-allowed opacity-50",
            )}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            aria-disabled={disabled || undefined}
            aria-busy={saveState === "saving" || undefined}
            className={cn(
              button,
              "relative bg-primary font-medium text-primary-foreground hover:opacity-90",
              disabled && "cursor-not-allowed",
            )}
          >
            <span className="grid">
              <span
                aria-hidden={saveState !== "saved"}
                className={cn(
                  "inline-flex items-center gap-1 transition-opacity [grid-area:1/1]",
                  saveState === "saved" ? "opacity-100" : "opacity-0",
                )}
              >
                <Check aria-hidden className="size-3.5" />
                Saved
              </span>
              <span
                aria-hidden={saveState === "saved"}
                className={cn(
                  "inline-flex items-center justify-center gap-1 transition-opacity [grid-area:1/1]",
                  saveState === "saved" ? "opacity-0" : "opacity-100",
                )}
              >
                {saveState === "failed"
                  ? "Try again"
                  : saveState === "saving"
                    ? "Saving"
                    : "Save"}
              </span>
            </span>
          </button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
