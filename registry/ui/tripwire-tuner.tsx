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
  LoaderCircle,
  RotateCcw,
  Save,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations as tween,
  easings,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type TripwireSample = {
  /** When the reading was taken, ms since the epoch. */
  t: number;
  /** The reading, or null where the feed has no data. */
  v: number | null;
};

export type TripwireComparison = "above" | "below";

export type TripwireRule = {
  /** The line the reading must cross, in the metric's unit. */
  threshold: number;
  /** Which side of the line counts as a breach. */
  comparison: TripwireComparison;
  /** Minutes the reading must stay past the line before it fires; 0 fires at once. */
  duration: number;
  /** The id of the channel that is notified. */
  channel: string;
};

export type TripwireChannel = { id: string; label: string };
export type TripwireStatus = "ready" | "loading" | "error";
export type TripwireChartStyle = "area" | "line" | "bars";
export type TripwireMarkerShape = "pin" | "dot" | "diamond";

export type TripwireTunerProps = {
  /** How the series is drawn: a line over a soft fill, the line alone, or one bar per two hours (their peak). @default "area" */
  chartStyle?: TripwireChartStyle;
  /** The shape of each would-have-fired marker on the timeline. @default "pin" */
  markerShape?: TripwireMarkerShape;
  /** The threshold line, the breach colour, the markers and Save, any CSS colour. @default "var(--warn)" */
  accent?: string;
  /** Readings oldest first, evenly spaced. @default defaultTripwireSeries (7 days, every 15 minutes) */
  series?: TripwireSample[];
  /** The newest moment the chart covers, ms. Never read from the clock. @default defaultTripwireNow */
  now?: number;
  /** Controlled rule. Changes are reported through `onRuleChange`. */
  rule?: TripwireRule;
  /** Initial rule when uncontrolled. @default defaultTripwireRule */
  defaultRule?: TripwireRule;
  /** Fires from the drag, key, click or field that changed the rule, with the whole rule. */
  onRuleChange?: (rule: TripwireRule) => void;
  /** Save was pressed. Return a promise to show saving; a rejection keeps the draft and says so. */
  onSave?: (rule: TripwireRule) => void | Promise<unknown>;
  /** Whether the series has arrived. Loading keeps the axes; error keeps the draft under a Retry banner. @default "ready" */
  status?: TripwireStatus;
  /** Retry was pressed after the series failed to load. */
  onRetry?: () => void;
  /** The metric's unit, printed after every value. @default "°C" */
  unit?: string;
  /** The y axis, low to high; the threshold stays inside it. @default [0, 10] */
  domain?: [number, number];
  /** The threshold's step: one arrow press, and what a drag lands on. Shift moves ten. @default 0.1 */
  step?: number;
  /** The duration choices, in minutes. @default [0, 15, 30, 60] */
  durations?: number[];
  /** Where an alert can go. @default defaultTripwireChannels */
  channels?: TripwireChannel[];
  /** The rule's name, in the header. @default "Cold room 3 too warm" */
  title?: string;
  /** The feed the rule watches, under the name. @default "Fieldline · cold-room-3 · temperature" */
  source?: string;
  /** Height of the editor, px; its body scrolls inside it. @default 540 */
  height?: number;
  /** Nothing can be dragged, typed or saved; the editor dims. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MINUTE = 60_000;
const SAMPLE_MS = 15 * MINUTE;
const DAY_MS = 86_400_000;

/** Monday 12 October 2026, 09:00 UTC: the newest reading in the default feed. */
export const defaultTripwireNow = Date.UTC(2026, 9, 12, 9, 0);

export const defaultTripwireChannels: TripwireChannel[] = [
  { id: "cold-chain", label: "#cold-chain" },
  { id: "facilities", label: "Facilities pager" },
  { id: "night-desk", label: "Night desk (SMS)" },
  { id: "email", label: "Email the duty manager" },
];

export const defaultTripwireRule: TripwireRule = {
  threshold: 6,
  comparison: "above",
  duration: 15,
  channel: "cold-chain",
};

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far into each nightly defrost the coil is, per 15-minute sample. */
const DEFROST = [0.5, 1, 0.88, 0.42];
/** Each night's defrost runs a little hotter or cooler. */
const DEFROST_AMP = [3.5, 3, 3.8, 3.3, 2.7, 3.6, 3.2, 3.4];
/** The compressor fault on Thursday afternoon, rising and recovering. */
const FAULT = [
  0.6, 1.4, 2.4, 3.3, 4.1, 4.8, 5.3, 5.6, 5.7, 5.4, 4.6, 3.4, 2.1, 1,
];

/**
 * Cold room 3 over the past week, every 15 minutes: a steady 3 °C with a
 * shallow day cycle, door openings in working hours, a defrost every night
 * at 02:00 that brushes 6–7 °C, one real compressor fault on Thursday
 * afternoon, a door left open on Saturday morning, and two sensor dropouts.
 * The defrosts are what make a naive rule noisy. No trigonometry, so the
 * server and the browser agree to the last digit.
 */
function makeSeries(): TripwireSample[] {
  const rand = mulberry32(1648);
  const n = 7 * 96;
  const out: TripwireSample[] = [];
  let drift = 0;
  for (let i = 0; i < n; i += 1) {
    const t = defaultTripwireNow - (n - 1 - i) * SAMPLE_MS;
    const d = new Date(t);
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    const weekday = d.getUTCDay();
    const dayIndex = Math.floor(
      (t - (defaultTripwireNow - 7 * DAY_MS)) / DAY_MS,
    );
    drift = drift * 0.8 + (rand() - 0.5) * 0.24;
    // A triangle wave for the day cycle: warmest mid-afternoon.
    const cycle = 1 - Math.abs(((hour + 9) % 24) - 12) / 6;
    let v = 3.05 + drift + cycle * 0.22;
    const door = rand();
    if (weekday >= 1 && weekday <= 5 && hour >= 7 && hour < 19 && door < 0.18) {
      v += 0.5 + rand() * 1.1;
    }
    const defrost = Math.round((hour - 2) * 4);
    if (defrost >= 0 && defrost < DEFROST.length) {
      const amp = DEFROST_AMP[(dayIndex + 8) % DEFROST_AMP.length] ?? 3;
      v += (DEFROST[defrost] ?? 0) * amp;
    }
    if (d.getUTCDate() === 8) {
      const k = Math.round((hour - 13) * 4);
      if (k >= 0 && k < FAULT.length) v += FAULT[k] ?? 0;
    }
    if (d.getUTCDate() === 10 && hour >= 11 && hour < 11.8) v += 3.25;
    const gap =
      (d.getUTCDate() === 6 && hour >= 14 && hour < 17) ||
      (d.getUTCDate() === 11 && hour >= 20 && hour < 21);
    out.push({ t, v: gap ? null : Math.round(v * 100) / 100 });
  }
  return out;
}

/** Seven days of cold room 3, every 15 minutes, ending at defaultTripwireNow. */
export const defaultTripwireSeries: TripwireSample[] = makeSeries();

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** A filled shape in the accent: its hue and chroma at a fixed lightness, so it reads in both themes. */
const PIGMENT = "oklch(from var(--tt-accent) 0.8 c h)";
const ON_PIGMENT = "oklch(0.24 0.02 258)";

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const decimalsOf = (step: number) => (String(step).split(".")[1] ?? "").length;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()}`;
};
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const durationShort = (minutes: number) =>
  minutes === 0
    ? "Now"
    : minutes % 60 === 0
      ? `${minutes / 60}h`
      : `${minutes}m`;
const durationLong = (minutes: number) =>
  minutes === 0
    ? "at once"
    : minutes % 60 === 0
      ? `for ${minutes / 60} h`
      : `for ${minutes} min`;
const minutesText = (minutes: number) =>
  minutes >= 60 && minutes % 60 === 0
    ? `${minutes / 60} h`
    : minutes > 60
      ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
      : `${minutes} min`;

export type TripwireFire = {
  /** Stable while the line moves: the breach's most extreme reading. */
  key: string;
  /** Fraction across the window where the alert would have fired. */
  x: number;
  at: number;
  /** How long the reading stayed past the line, minutes. */
  minutes: number;
  peak: number;
};

/**
 * Every alert a rule would have sent over the series. A breach is a run of
 * readings past the line; it fires once, `duration` minutes after it starts,
 * if it is still past the line then. A gap in the data ends a run. Fires are
 * keyed by the run's most extreme reading, so the same excursion keeps its
 * marker while the line moves through it.
 */
export function findTripwireFires(
  series: TripwireSample[],
  rule: TripwireRule,
): TripwireFire[] {
  const fires: TripwireFire[] = [];
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last || last.t <= first.t) return fires;
  const span = last.t - first.t;
  const sampleMinutes =
    series.length > 1 ? span / (series.length - 1) / MINUTE : 15;
  const past = (v: number) =>
    rule.comparison === "above" ? v > rule.threshold : v < rule.threshold;
  let start = -1;
  let peak = -1;
  const close = (end: number) => {
    if (start < 0) return;
    const a = series[start];
    const b = series[end - 1];
    const p = series[peak];
    if (a && b && p && p.v !== null && b.t - a.t >= rule.duration * MINUTE) {
      const at = a.t + rule.duration * MINUTE;
      fires.push({
        key: `${rule.comparison}-${peak}`,
        x: r3((at - first.t) / span),
        at,
        minutes: Math.round((end - start) * sampleMinutes),
        peak: p.v,
      });
    }
    start = -1;
    peak = -1;
  };
  for (let i = 0; i < series.length; i += 1) {
    const v = series[i]?.v ?? null;
    if (v !== null && past(v)) {
      if (start < 0) {
        start = i;
        peak = i;
      } else {
        const pv = series[peak]?.v ?? v;
        if (rule.comparison === "above" ? v > pv : v < pv) peak = i;
      }
    } else {
      close(i);
    }
  }
  close(series.length);
  return fires;
}

type Verdict = { label: string; tone: string };
/** Per week: one or two alerts is a rule doing its job; five is a pager nobody reads. */
const verdictOf = (count: number): Verdict =>
  count <= 2
    ? {
        label: "Quiet",
        tone: "text-success bg-[color-mix(in_oklab,var(--success)_12%,transparent)]",
      }
    : count <= 4
      ? { label: "Steady", tone: "text-ink-2 bg-surface-2" }
      : {
          label: "Noisy",
          tone: "text-danger bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]",
        };

const sameRule = (a: TripwireRule, b: TripwireRule) =>
  a.threshold === b.threshold &&
  a.comparison === b.comparison &&
  a.duration === b.duration &&
  a.channel === b.channel;

/* ----------------------------------------------------------------------- */
/*                               Rolling count                             */
/* ----------------------------------------------------------------------- */

/**
 * A count that runs to its new figure on a base tween. The figure lives in a
 * motion value rendered as text, so a roll costs no React render per frame
 * and the server prints the settled number.
 */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => String(Math.round(v)));
  React.useEffect(() => {
    if (!motionSafe) {
      mv.jump(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: tween.base,
      ease: easings.enter,
    });
    return () => controls.stop();
  }, [motionSafe, mv, value]);
  return <motion.span>{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                              Segmented radio                            */
/* ----------------------------------------------------------------------- */

function Segmented<T extends string | number>({
  id,
  label,
  options,
  value,
  onChange,
  motionSafe,
  disabled,
}: {
  id: string;
  label: string;
  options: { value: T; label: string; name: string }[];
  value: T;
  onChange: (value: T) => void;
  motionSafe: boolean;
  disabled: boolean;
}) {
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const at = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const go = (index: number) => {
    const next = options[(index + options.length) % options.length];
    if (!next) return;
    if (!disabled) onChange(next.value);
    refs.current.get(String(next.value))?.focus();
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-[11px] font-medium text-ink-3">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-disabled={disabled || undefined}
        className="grid h-8 auto-cols-fr grid-flow-col rounded-2 bg-surface-2 p-0.5"
      >
        {options.map((o, index) => {
          const checked = index === at;
          return (
            <button
              key={String(o.value)}
              ref={(node) => {
                if (node) refs.current.set(String(o.value), node);
                else refs.current.delete(String(o.value));
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={o.name}
              tabIndex={checked ? 0 : -1}
              onClick={() => {
                if (!disabled) onChange(o.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  go(index + 1);
                } else if (
                  event.key === "ArrowLeft" ||
                  event.key === "ArrowUp"
                ) {
                  event.preventDefault();
                  go(index - 1);
                }
              }}
              className={cn(
                "relative isolate flex items-center justify-center rounded-[6px] text-[12px] transition-colors",
                FOCUS_RING,
                checked ? "font-medium text-foreground" : "text-ink-3",
                !disabled && !checked && "hover:text-ink-2",
                disabled ? "cursor-not-allowed" : "cursor-pointer",
              )}
            >
              {checked ? (
                <motion.span
                  layoutId={`${id}-pill`}
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-[6px] bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_12%,transparent)] ring-1 ring-hairline"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Markers                                 */
/* ----------------------------------------------------------------------- */

function MarkerGlyph({
  shape,
  active,
}: {
  shape: TripwireMarkerShape;
  active: boolean;
}) {
  if (shape === "dot") {
    return (
      <span
        className={cn(
          "absolute top-[18px] left-1/2 size-2 -translate-x-1/2 rounded-full bg-(--tt-accent) ring-2 ring-card transition-transform",
          active && "scale-125",
        )}
      />
    );
  }
  if (shape === "diamond") {
    return (
      <span
        className={cn(
          "absolute top-[18.5px] left-1/2 size-[7px] -translate-x-1/2 rotate-45 rounded-[1.5px] bg-(--tt-accent) ring-2 ring-card transition-transform",
          active && "scale-125",
        )}
      />
    );
  }
  return (
    <>
      <span className="absolute top-[11px] left-1/2 h-[11px] w-[1.5px] -translate-x-1/2 rounded-full bg-(--tt-accent)" />
      <span
        className={cn(
          "absolute top-[5px] left-1/2 size-[7px] -translate-x-1/2 rounded-full bg-(--tt-accent) ring-2 ring-card transition-transform",
          active && "scale-125",
        )}
      />
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

/**
 * An alert rule editor that shows its own history. Seven days of a sensor
 * feed sit under a threshold line; the line follows the finger 1:1 and
 * rubber-bands past the axis, and in the same frame the part of the series
 * past it recolours (the series is drawn twice, the accent copy clipped by a
 * rect that reads the line's motion value). Each time the stepped value under
 * the finger changes, the rule is replayed over the week: alerts it would now
 * have sent drop onto the timeline on `springs.recoil` in time order, alerts
 * it no longer sends lift away on the exit ease, and survivors slide to their
 * new time on `springs.glide`, while the would-have-alerted count rolls and
 * its verdict changes. Released, the line lands on its step on `springs.snap`
 * with the throw's velocity.
 *
 * The handle is a `role="slider"`: arrows nudge a step, Shift or the Page
 * keys ten, Home and End the axis ends. The rest of the rule is a number
 * field, two radiogroups and a select. Gaps in the feed are hatched; loading
 * keeps the axes; a failed load keeps the draft. Under reduced motion the
 * line and markers move without travel, but every count and colour still
 * changes.
 */
export function TripwireTuner({
  chartStyle = "area",
  markerShape = "pin",
  accent = "var(--warn)",
  series = defaultTripwireSeries,
  now = defaultTripwireNow,
  rule,
  defaultRule = defaultTripwireRule,
  onRuleChange,
  onSave,
  status = "ready",
  onRetry,
  unit = "°C",
  domain = [0, 10],
  step = 0.1,
  durations = [0, 15, 30, 60],
  channels = defaultTripwireChannels,
  title = "Cold room 3 too warm",
  source = "Fieldline · cold-room-3 · temperature",
  height = 540,
  disabled = false,
  className,
}: TripwireTunerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${safeId}-title`;
  const clipId = `${safeId}-clip`;
  const ready = status === "ready";

  const [dMin, dMax] = domain[1] > domain[0] ? domain : ([0, 10] as const);
  const span = dMax - dMin;
  const decimals = decimalsOf(step);
  const snapTo = React.useCallback(
    (v: number) =>
      clamp(
        Number((Math.round(v / step) * step).toFixed(decimals)),
        dMin,
        dMax,
      ),
    [decimals, dMax, dMin, step],
  );
  const fmt = (v: number) => v.toFixed(decimals);

  const [own, setOwn] = React.useState<TripwireRule>(defaultRule);
  const current = rule ?? own;
  const [baseline, setBaseline] = React.useState<TripwireRule>(
    rule ?? defaultRule,
  );
  const dirty = !sameRule(current, baseline);

  /* ------------------------- the threshold value ------------------------ */

  const level = useMotionValue(current.threshold);
  const levelPct = useTransform(level, (v) => r3(((dMax - v) / span) * 100));
  const handleTop = useTransform(levelPct, (p) => `${p}%`);
  const belowHeight = useTransform(levelPct, (p) => r3(100 - p));
  // The clip reaches past the plot's top and bottom so a stroke on the edge
  // keeps its full width.
  const aboveClip = useTransform(levelPct, (p) => r3(p + 50));
  const belowClip = useTransform(levelPct, (p) => r3(150 - p));
  const handleText = useTransform(
    level,
    (v) => `${snapTo(v).toFixed(decimals)} ${unit}`,
  );

  const [live, setLive] = React.useState<number | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const draggingRef = React.useRef(false);
  const justDragged = React.useRef(false);
  const dragFrom = React.useRef(0);
  const plotH = React.useRef(188);
  const pendingVelocity = React.useRef(0);
  const [settleTick, setSettleTick] = React.useState(0);

  const shownThreshold = live ?? current.threshold;
  const shownRule = React.useMemo(
    () => ({ ...current, threshold: shownThreshold }),
    [current, shownThreshold],
  );

  // The host's threshold is the truth: after every commit attempt the line
  // springs to it — a refused change in controlled mode springs back.
  React.useEffect(() => {
    if (draggingRef.current) return;
    const to = current.threshold;
    const velocity = pendingVelocity.current;
    pendingVelocity.current = 0;
    if (!motionSafe) {
      level.jump(to);
      return;
    }
    const controls = animate(level, to, { ...springs.snap, velocity });
    return () => controls.stop();
  }, [current.threshold, settleTick, motionSafe, level]);

  /* -------------------------------- fires ------------------------------- */

  const fires = React.useMemo(
    () => (ready ? findTripwireFires(series, shownRule) : []),
    [ready, series, shownRule],
  );
  const count = fires.length;
  const verdict = verdictOf(count);

  // Markers that arrive together drop in time order inside one cascade. The
  // delays are worked out in the render that sees the new set (state from the
  // previous render, the documented pattern), so they are in place before any
  // new marker mounts.
  const fireKeys = fires.map((f) => f.key).join("|");
  const [arrival, setArrival] = React.useState<{
    keys: string;
    delays: Record<string, number>;
  }>({ keys: fireKeys, delays: {} });
  if (arrival.keys !== fireKeys) {
    const before = new Set(arrival.keys.split("|"));
    const fresh = fires.filter((f) => !before.has(f.key));
    const gap = cascade(Math.max(2, fresh.length));
    const delays: Record<string, number> = {};
    fresh.forEach((f, i) => {
      delays[f.key] = r3(i * gap);
    });
    setArrival({ keys: fireKeys, delays });
  }

  const [inspect, setInspect] = React.useState<string | null>(null);
  const inspected = fires.find((f) => f.key === inspect) ?? null;
  const [markerFocus, setMarkerFocus] = React.useState<string | null>(null);
  const markerRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const rovingMarker =
    markerFocus && fires.some((f) => f.key === markerFocus)
      ? markerFocus
      : (fires[0]?.key ?? null);

  /* ------------------------------ geometry ------------------------------ */

  const first = series[0];
  const last = series[series.length - 1];
  const t0 = first?.t ?? now - 7 * DAY_MS;
  const t1 = last && last.t > t0 ? last.t : now;
  const n = series.length;
  const yOf = React.useCallback(
    (v: number) => r3(((dMax - clamp(v, dMin, dMax)) / span) * 100),
    [dMax, dMin, span],
  );

  const paths = React.useMemo(() => {
    let line = "";
    let area = "";
    let bars = "";
    if (n < 2) return { line, area, bars };
    const xOf = (i: number) => r3((i / (n - 1)) * 1000);
    let open = false;
    let segStart = 0;
    let segEnd = 0;
    const closeArea = () => {
      if (!open) return;
      area += `L${xOf(segEnd)} 100L${xOf(segStart)} 100Z`;
    };
    for (let i = 0; i < n; i += 1) {
      const v = series[i]?.v ?? null;
      if (v === null) {
        closeArea();
        open = false;
        continue;
      }
      const x = xOf(i);
      const y = yOf(v);
      if (!open) {
        line += `M${x} ${y}`;
        area += `M${x} ${y}`;
        segStart = i;
        open = true;
      } else {
        line += `L${x} ${y}`;
        area += `L${x} ${y}`;
      }
      segEnd = i;
    }
    closeArea();
    // Bars: the peak of each two-hour bucket, one path, crisp edges.
    const per = 8;
    const buckets = Math.ceil(n / per);
    const width = 1000 / buckets;
    const gap = width * 0.3;
    for (let b = 0; b < buckets; b += 1) {
      let peak: number | null = null;
      for (let i = b * per; i < Math.min(n, (b + 1) * per); i += 1) {
        const v = series[i]?.v ?? null;
        if (v === null) continue;
        peak = peak === null ? v : Math.max(peak, v);
      }
      if (peak === null) continue;
      const x0 = r3(b * width + gap / 2);
      const x1 = r3((b + 1) * width - gap / 2);
      bars += `M${x0} 100V${yOf(peak)}H${x1}V100Z`;
    }
    return { line, area, bars };
  }, [n, series, yOf]);

  const gaps = React.useMemo(() => {
    const out: { from: number; to: number; label: string }[] = [];
    if (n < 2) return out;
    let start = -1;
    for (let i = 0; i <= n; i += 1) {
      const isGap = i < n && (series[i]?.v ?? null) === null;
      if (isGap && start < 0) start = i;
      if (!isGap && start >= 0) {
        const a = series[start];
        const b = series[i - 1];
        out.push({
          from: r3(Math.max(0, (start - 0.5) / (n - 1)) * 100),
          to: r3(Math.min(1, (i - 0.5) / (n - 1)) * 100),
          label:
            a && b
              ? `No data ${dayLabel(a.t)}, ${clock(a.t)} to ${clock(b.t + SAMPLE_MS)}`
              : "No data",
        });
        start = -1;
      }
    }
    return out;
  }, [n, series]);

  // Day boundaries as ticks, and each day's name centred in its own span;
  // a partial day too narrow for its name keeps only its tick.
  const days = React.useMemo(() => {
    const ticksAt: number[] = [];
    for (let m = Math.ceil(t0 / DAY_MS) * DAY_MS; m <= t1; m += DAY_MS) {
      ticksAt.push(r3(((m - t0) / (t1 - t0)) * 100));
    }
    const edges = [0, ...ticksAt, 100];
    const spans: { from: number; to: number; label: string; short: string }[] =
      [];
    for (let i = 0; i < edges.length - 1; i += 1) {
      const from = edges[i] ?? 0;
      const to = edges[i + 1] ?? 100;
      const mid = t0 + (((from + to) / 2) * (t1 - t0)) / 100;
      const d = new Date(mid);
      spans.push({
        from,
        to,
        label: dayLabel(mid),
        short: (WEEKDAYS[d.getUTCDay()] ?? "").slice(0, 1),
      });
    }
    return { ticksAt, spans };
  }, [t0, t1]);

  const ticks = React.useMemo(() => {
    const raw = span / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const unitStep = raw / mag >= 5 ? 5 * mag : raw / mag >= 2 ? 2 * mag : mag;
    const out: number[] = [];
    for (
      let v = Math.ceil(dMin / unitStep) * unitStep;
      v <= dMax + 1e-9;
      v += unitStep
    ) {
      out.push(Number(v.toFixed(6)));
    }
    return out;
  }, [dMax, dMin, span]);

  const [plotW, setPlotW] = React.useState(420);
  const plotRef = React.useRef<HTMLDivElement | null>(null);
  const roRef = React.useRef<ResizeObserver | null>(null);
  const bindPlot = React.useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    plotRef.current = node;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setPlotW(Math.round(entry.contentRect.width));
      plotH.current = entry.contentRect.height || plotH.current;
    });
    ro.observe(node);
    roRef.current = ro;
  }, []);
  React.useEffect(() => () => roRef.current?.disconnect(), []);

  const [hover, setHover] = React.useState<number | null>(null);

  /* ------------------------------- changes ------------------------------ */

  const [announcement, setAnnouncement] = React.useState("");
  const sentence = (next: TripwireRule) => {
    const total = ready ? findTripwireFires(series, next).length : null;
    return `${fmt(next.threshold)} ${unit} ${next.comparison}, ${durationLong(next.duration)}.${
      total === null
        ? ""
        : ` Would have alerted ${plural(total, "time", "times")} in 7 days.`
    }`;
  };

  const commit = (patch: Partial<TripwireRule>, velocity = 0) => {
    const next = { ...current, ...patch };
    pendingVelocity.current = velocity;
    setSettleTick((t) => t + 1);
    if (sameRule(next, current)) return;
    if (rule === undefined) setOwn(next);
    onRuleChange?.(next);
    setAnnouncement(sentence(next));
    setSaveState((s) => (s === "failed" || s === "saved" ? "idle" : s));
  };

  const nudge = (delta: number) => {
    if (disabled) return;
    commit({ threshold: snapTo(current.threshold + delta) });
  };

  const valueAt = (clientY: number) => {
    const node = plotRef.current;
    if (!node) return current.threshold;
    const rect = node.getBoundingClientRect();
    return dMax - ((clientY - rect.top) / Math.max(1, rect.height)) * span;
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: () => {
      draggingRef.current = true;
      setDragging(true);
      dragFrom.current = level.get();
      level.stop();
      const node = plotRef.current;
      if (node) plotH.current = node.getBoundingClientRect().height || 188;
    },
    onMove: ({ offset }) => {
      const raw = dragFrom.current - (offset.y / plotH.current) * span;
      const room = span * 0.08;
      const v =
        raw < dMin
          ? dMin + rubberband(raw - dMin, room)
          : raw > dMax
            ? dMax + rubberband(raw - dMax, room)
            : raw;
      level.set(r3(v));
      const stepped = snapTo(v);
      setLive((prev) => (prev === stepped ? prev : stepped));
    },
    onEnd: ({ velocity }) => {
      draggingRef.current = false;
      justDragged.current = true;
      setDragging(false);
      const perSecond = -(velocity.y / plotH.current) * span;
      const landing = snapTo(project(level.get(), perSecond, 0.99));
      setLive(null);
      commit({ threshold: landing }, perSecond);
    },
    onCancel: () => {
      draggingRef.current = false;
      setDragging(false);
      setLive(null);
      commit({}, 0);
    },
  });

  /* -------------------------------- saving ------------------------------ */

  const [saveState, setSaveState] = React.useState<
    "idle" | "saving" | "saved" | "failed"
  >("idle");
  const saveTimer = React.useRef<number | null>(null);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const save = () => {
    if (disabled || saveState === "saving") return;
    const snapshot = current;
    const done = () => {
      if (!alive.current) return;
      setBaseline(snapshot);
      setSaveState("saved");
      setAnnouncement("Rule saved.");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        setSaveState((s) => (s === "saved" ? "idle" : s));
      }, 1600);
    };
    let result: void | Promise<unknown>;
    try {
      result = onSave?.(snapshot);
    } catch {
      setSaveState("failed");
      setAnnouncement("The rule did not save. Your draft is kept.");
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSaveState("saving");
      (result as Promise<unknown>).then(done, () => {
        if (!alive.current) return;
        setSaveState("failed");
        setAnnouncement("The rule did not save. Your draft is kept.");
      });
    } else {
      done();
    }
  };

  /* -------------------------------- fields ------------------------------ */

  const [text, setText] = React.useState(fmt(current.threshold));
  const editing = React.useRef(false);
  React.useEffect(() => {
    if (!editing.current) setText(shownThreshold.toFixed(decimals));
  }, [shownThreshold, decimals]);

  const channel = channels.find((c) => c.id === current.channel) ?? channels[0];
  const durationOptions = durations.map((m) => ({
    value: m,
    label: durationShort(m),
    name: m === 0 ? "At once" : durationLong(m).replace("for ", ""),
  }));

  const sliderText = `${fmt(shownThreshold)} ${unit}${
    ready
      ? `, would have alerted ${plural(count, "time", "times")} in 7 days`
      : ""
  }`;

  const button = cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS_RING,
  );

  const onMarkerKey = (event: React.KeyboardEvent, key: string) => {
    const at = fires.findIndex((f) => f.key === key);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = at + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = at - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = fires.length - 1;
    else if (event.key === "Escape" && inspect) {
      event.preventDefault();
      setInspect(null);
      return;
    }
    if (to < 0 && event.key !== "Home") return;
    event.preventDefault();
    const target = fires[clamp(to, 0, fires.length - 1)];
    if (!target) return;
    setMarkerFocus(target.key);
    markerRefs.current.get(target.key)?.focus();
  };

  const hovered =
    hover !== null && ready ? (series[clamp(hover, 0, n - 1)] ?? null) : null;
  const cardW = 176;
  const cardLeft = inspected
    ? clamp(inspected.x * plotW - cardW / 2, 0, Math.max(0, plotW - cardW))
    : 0;

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--tt-accent" as string]: accent }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
          <div className="min-w-36 flex-1">
            <p id={titleId} className="truncate text-sm font-semibold">
              {title}
            </p>
            <p className="truncate text-[11px] text-ink-3" title={source}>
              {source}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline px-2 text-[11px] text-ink-2">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  dirty ? "bg-warn" : "bg-success",
                )}
              />
              {dirty ? "Unsaved" : "Live"}
            </span>
            <button
              type="button"
              onClick={save}
              aria-disabled={disabled || saveState === "saving" || undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-[filter] hover:brightness-105",
                FOCUS_RING,
                (disabled || saveState === "saving") && "cursor-not-allowed",
              )}
              style={{ backgroundColor: PIGMENT, color: ON_PIGMENT }}
            >
              <span aria-hidden className="relative flex size-3.5">
                <AnimatePresence initial={false}>
                  {saveState === "saving" ? (
                    <motion.span
                      key="saving"
                      className="absolute inset-0 flex"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{
                        opacity: 0,
                        transition: { duration: tween.blink },
                      }}
                    >
                      <LoaderCircle className="size-3.5 motion-safe:animate-spin" />
                    </motion.span>
                  ) : saveState === "saved" ? (
                    <motion.span
                      key="saved"
                      className="absolute inset-0 flex"
                      initial={{ opacity: 0, scale: motionSafe ? 0.4 : 1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        transition: { duration: tween.blink },
                      }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="dot"
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{
                        opacity: 0,
                        transition: { duration: tween.blink },
                      }}
                    >
                      <Save className="size-3.5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="grid">
                {["Save rule", "Saving", "Saved"].map((label) => (
                  <span
                    key={label}
                    aria-hidden={
                      label !==
                      (saveState === "saving"
                        ? "Saving"
                        : saveState === "saved"
                          ? "Saved"
                          : "Save rule")
                    }
                    className={cn(
                      "col-start-1 row-start-1 text-left",
                      label ===
                        (saveState === "saving"
                          ? "Saving"
                          : saveState === "saved"
                            ? "Saved"
                            : "Save rule")
                        ? "visible"
                        : "invisible",
                    )}
                  >
                    {label}
                  </span>
                ))}
              </span>
            </button>
          </div>
        </header>

        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-1 @min-[34rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[60rem]:grid-cols-[minmax(0,1fr)_17rem]">
            <section
              aria-label="Past 7 days"
              className="flex min-w-0 flex-col gap-3 p-4"
            >
              {status === "error" ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2 border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,transparent)] px-3 py-2"
                >
                  <TriangleAlert
                    aria-hidden
                    className="size-4 shrink-0 text-danger"
                  />
                  <p className="min-w-0 flex-1 text-xs text-ink-2">
                    The last 7 days did not load. Your draft is kept.
                  </p>
                  {onRetry ? (
                    <button
                      type="button"
                      onClick={onRetry}
                      className={cn(button, "h-7 px-2.5")}
                    >
                      <RotateCcw aria-hidden className="size-3.5" />
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-[12px] text-ink-3">
                  Would have alerted
                </span>
                <span className="font-mono text-[22px] leading-none font-medium text-foreground tabular-nums">
                  {ready ? (
                    <Rolling value={count} motionSafe={motionSafe} />
                  ) : (
                    "–"
                  )}
                </span>
                <span className="text-[12px] text-ink-3">
                  {ready
                    ? `${count === 1 ? "time" : "times"} in 7 days`
                    : status === "loading"
                      ? "loading the last 7 days"
                      : "no data to replay"}
                </span>
                {ready ? (
                  <span className="relative inline-grid self-center">
                    <AnimatePresence initial={false}>
                      <motion.span
                        key={verdict.label}
                        className={cn(
                          "col-start-1 row-start-1 inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
                          verdict.tone,
                        )}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: {
                            duration: tween.fast,
                            ease: easings.exit,
                          },
                        }}
                        transition={{ duration: tween.base }}
                      >
                        {verdict.label}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                ) : null}
              </div>

              <div
                ref={bindPlot}
                data-dragging={dragging || undefined}
                className={cn(
                  "relative ml-7 h-[150px] @min-[34rem]:h-[208px]",
                  !disabled && "cursor-crosshair",
                )}
                onPointerMove={(event) => {
                  if (!ready || n < 2) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const f =
                    (event.clientX - rect.left) / Math.max(1, rect.width);
                  const i = Math.round(clamp(f, 0, 1) * (n - 1));
                  setHover((prev) => (prev === i ? prev : i));
                }}
                onPointerLeave={() => setHover(null)}
                onPointerDownCapture={() => {
                  justDragged.current = false;
                }}
                onClick={(event) => {
                  if (justDragged.current) {
                    justDragged.current = false;
                    return;
                  }
                  if (disabled) return;
                  const target = event.target as HTMLElement;
                  if (target.closest("[data-tt-handle],[data-tt-card]")) return;
                  commit({ threshold: snapTo(valueAt(event.clientY)) });
                }}
              >
                {ticks.map((v) => (
                  <span
                    key={v}
                    aria-hidden
                    className="absolute -left-7 w-5 -translate-y-1/2 text-right font-mono text-[9.5px] leading-none text-ink-3 tabular-nums"
                    style={{ top: `${yOf(v)}%` }}
                  >
                    {v}
                  </span>
                ))}

                <svg
                  aria-hidden
                  viewBox="0 0 1000 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 size-full overflow-visible"
                >
                  <defs>
                    <clipPath id={clipId}>
                      {current.comparison === "above" ? (
                        <motion.rect
                          x={-10}
                          y={-50}
                          width={1020}
                          height={aboveClip}
                        />
                      ) : (
                        <motion.rect
                          x={-10}
                          y={levelPct}
                          width={1020}
                          height={belowClip}
                        />
                      )}
                    </clipPath>
                  </defs>
                  {ticks.map((v) => (
                    <line
                      key={v}
                      x1={0}
                      x2={1000}
                      y1={yOf(v)}
                      y2={yOf(v)}
                      vectorEffect="non-scaling-stroke"
                      className={
                        v === dMin
                          ? "stroke-hairline-strong"
                          : "stroke-hairline"
                      }
                      strokeWidth={1}
                    />
                  ))}
                  <motion.rect
                    x={0}
                    width={1000}
                    y={current.comparison === "above" ? 0 : levelPct}
                    height={
                      current.comparison === "above" ? levelPct : belowHeight
                    }
                    className="fill-(--tt-accent)"
                    opacity={0.07}
                  />
                  {ready ? (
                    <>
                      {chartStyle === "bars" ? (
                        <path
                          d={paths.bars}
                          className="fill-ink-3/45"
                          shapeRendering="crispEdges"
                        />
                      ) : (
                        <>
                          {chartStyle === "area" ? (
                            <path d={paths.area} className="fill-ink-3/12" />
                          ) : null}
                          <path
                            d={paths.line}
                            fill="none"
                            className="stroke-ink-3"
                            strokeWidth={1.5}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        </>
                      )}
                      <g clipPath={`url(#${clipId})`}>
                        {chartStyle === "bars" ? (
                          <path
                            d={paths.bars}
                            className="fill-(--tt-accent)"
                            shapeRendering="crispEdges"
                          />
                        ) : (
                          <>
                            {chartStyle === "area" ? (
                              <path
                                d={paths.area}
                                className="fill-(--tt-accent)"
                                opacity={0.22}
                              />
                            ) : null}
                            <path
                              d={paths.line}
                              fill="none"
                              className="stroke-(--tt-accent)"
                              strokeWidth={2}
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              vectorEffect="non-scaling-stroke"
                            />
                          </>
                        )}
                      </g>
                    </>
                  ) : null}
                </svg>

                {ready
                  ? gaps.map((g) => (
                      <span
                        key={`${g.from}-${g.to}`}
                        title={g.label}
                        className="absolute inset-y-0 border-x border-hairline bg-[repeating-linear-gradient(135deg,var(--hairline-strong)_0_1px,transparent_1px_5px)]"
                        style={{
                          left: `${g.from}%`,
                          width: `${r3(g.to - g.from)}%`,
                        }}
                      >
                        <span className="sr-only">{g.label}</span>
                      </span>
                    ))
                  : null}

                {status === "loading" ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-[38%] h-[30%] rounded-2 bg-surface-2/70 motion-safe:animate-pulse"
                  />
                ) : null}

                {hovered ? (
                  <>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 w-px bg-ink-3/40"
                      style={{
                        left: `${r3(((hover ?? 0) / Math.max(1, n - 1)) * 100)}%`,
                      }}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute top-1 left-1 rounded-1 bg-card/90 px-1.5 py-0.5 font-mono text-[10px] text-ink-2 tabular-nums ring-1 ring-hairline"
                    >
                      {dayLabel(hovered.t)} {clock(hovered.t)} ·{" "}
                      {hovered.v === null
                        ? "no data"
                        : `${hovered.v.toFixed(1)} ${unit}`}
                    </span>
                  </>
                ) : null}

                {inspected ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 w-px bg-(--tt-accent)"
                    style={{ left: `${r3(inspected.x * 100)}%` }}
                  />
                ) : null}

                <motion.div
                  className="absolute inset-x-0 z-10 h-0"
                  style={{ top: handleTop }}
                >
                  <div
                    data-tt-handle=""
                    {...drag}
                    className={cn(
                      "group/tripwire-tuner absolute inset-x-0 -top-2.5 h-5 touch-pan-x",
                      disabled
                        ? "cursor-not-allowed"
                        : dragging
                          ? "cursor-grabbing"
                          : "cursor-ns-resize",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-x-0 top-[9px] h-[2px] bg-(--tt-accent) transition-shadow",
                        dragging
                          ? "shadow-[0_0_0_3px_color-mix(in_oklab,var(--tt-accent)_22%,transparent)]"
                          : "group-hover/tripwire-tuner:shadow-[0_0_0_2px_color-mix(in_oklab,var(--tt-accent)_16%,transparent)]",
                      )}
                    />
                    <motion.div
                      role="slider"
                      tabIndex={disabled ? -1 : 0}
                      aria-label="Threshold"
                      aria-valuemin={dMin}
                      aria-valuemax={dMax}
                      aria-valuenow={shownThreshold}
                      aria-valuetext={sliderText}
                      aria-orientation="vertical"
                      aria-disabled={disabled || undefined}
                      onKeyDown={(event) => {
                        const big = event.shiftKey ? 10 : 1;
                        switch (event.key) {
                          case "ArrowUp":
                          case "ArrowRight":
                            event.preventDefault();
                            nudge(step * big);
                            break;
                          case "ArrowDown":
                          case "ArrowLeft":
                            event.preventDefault();
                            nudge(-step * big);
                            break;
                          case "PageUp":
                            event.preventDefault();
                            nudge(step * 10);
                            break;
                          case "PageDown":
                            event.preventDefault();
                            nudge(-step * 10);
                            break;
                          case "Home":
                            event.preventDefault();
                            if (!disabled) commit({ threshold: dMin });
                            break;
                          case "End":
                            event.preventDefault();
                            if (!disabled) commit({ threshold: dMax });
                            break;
                          default:
                            break;
                        }
                      }}
                      className={cn(
                        "absolute top-0.5 right-1 inline-flex h-4 items-center rounded-full px-1.5 font-mono text-[10px] font-medium whitespace-nowrap tabular-nums shadow-[0_1px_3px_color-mix(in_oklab,black_18%,transparent)]",
                        FOCUS_RING,
                      )}
                      style={{ backgroundColor: PIGMENT, color: ON_PIGMENT }}
                    >
                      <motion.span>{handleText}</motion.span>
                    </motion.div>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {inspected ? (
                    <motion.div
                      key="card"
                      data-tt-card=""
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        const key = inspected.key;
                        setInspect(null);
                        markerRefs.current.get(key)?.focus();
                      }}
                      className="absolute top-2 z-20 flex flex-col gap-0.5 rounded-2 border border-hairline-strong bg-popover px-3 py-2 shadow-[0_8px_24px_color-mix(in_oklab,black_16%,transparent)]"
                      style={{ left: cardLeft, width: cardW }}
                      initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: tween.fast,
                          ease: easings.exit,
                        },
                      }}
                      transition={{
                        y: motionSafe ? springs.snap : { duration: 0 },
                        opacity: { duration: tween.fast },
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-foreground">
                          {dayLabel(inspected.at)} · {clock(inspected.at)}
                        </span>
                        <button
                          type="button"
                          aria-label="Close"
                          onClick={() => setInspect(null)}
                          className={cn(
                            "inline-flex size-5 items-center justify-center rounded-1 text-ink-3 hover:text-foreground",
                            FOCUS_RING,
                          )}
                        >
                          <X aria-hidden className="size-3" />
                        </button>
                      </div>
                      <span className="text-[11px] text-ink-3">
                        Peak {inspected.peak.toFixed(1)} {unit} ·{" "}
                        {minutesText(inspected.minutes)} {current.comparison}
                      </span>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="relative ml-7 h-11">
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-[22px] h-px bg-hairline-strong"
                />
                {days.ticksAt.map((x) => (
                  <span
                    key={x}
                    aria-hidden
                    className="absolute top-[18px] h-[9px] w-px bg-hairline-strong"
                    style={{ left: `${x}%` }}
                  />
                ))}
                {days.spans.map((d) => {
                  const room = ((d.to - d.from) / 100) * plotW;
                  if (room < 14) return null;
                  return (
                    <span
                      key={d.from}
                      aria-hidden
                      className="absolute top-[31px] -translate-x-1/2 font-mono text-[9.5px] leading-none whitespace-nowrap text-ink-3"
                      style={{ left: `${r3((d.from + d.to) / 2)}%` }}
                    >
                      {room >= 46 ? d.label : d.short}
                    </span>
                  );
                })}
                <div
                  role="group"
                  aria-label={
                    ready
                      ? `Alerts this rule would have sent: ${count}`
                      : "Alerts this rule would have sent"
                  }
                  className="absolute inset-x-0 top-0 h-7"
                >
                  <AnimatePresence initial={false}>
                    {fires.map((f) => {
                      const delay = arrival.delays[f.key] ?? 0;
                      const left = `${r3(f.x * 100)}%`;
                      const active = inspect === f.key;
                      return (
                        <motion.button
                          key={f.key}
                          ref={(node: HTMLButtonElement | null) => {
                            if (node) markerRefs.current.set(f.key, node);
                            else markerRefs.current.delete(f.key);
                          }}
                          type="button"
                          aria-pressed={active}
                          aria-label={`Would have fired ${dayLabel(f.at)} at ${clock(f.at)}, peak ${f.peak.toFixed(1)} ${unit}, ${minutesText(f.minutes)} ${current.comparison}`}
                          tabIndex={f.key === rovingMarker ? 0 : -1}
                          onFocus={() => setMarkerFocus(f.key)}
                          onKeyDown={(event) => onMarkerKey(event, f.key)}
                          onClick={() =>
                            setInspect((prev) =>
                              prev === f.key ? null : f.key,
                            )
                          }
                          className={cn(
                            "absolute top-0 h-7 w-4 -translate-x-1/2 cursor-pointer rounded-1",
                            FOCUS_RING,
                          )}
                          initial={{
                            left,
                            y: motionSafe ? -14 : 0,
                            opacity: 0,
                          }}
                          animate={{ left, y: 0, opacity: 1 }}
                          exit={{
                            y: motionSafe ? -10 : 0,
                            opacity: 0,
                            transition: {
                              duration: tween.fast,
                              ease: easings.exit,
                            },
                          }}
                          transition={{
                            y: motionSafe
                              ? { ...springs.recoil, delay }
                              : { duration: 0 },
                            opacity: { duration: tween.fast, delay },
                            left: motionSafe ? springs.glide : { duration: 0 },
                          }}
                        >
                          <MarkerGlyph shape={markerShape} active={active} />
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
              <ul
                aria-hidden
                className="ml-7 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-3"
              >
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-[2px] w-3 rounded-full bg-(--tt-accent)" />
                  Past the line
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-(--tt-accent)" />
                  Would have fired
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-3 border-x border-hairline bg-[repeating-linear-gradient(135deg,var(--hairline-strong)_0_1px,transparent_1px_4px)]" />
                  No data
                </li>
              </ul>
            </section>

            <div
              role="group"
              aria-label="Rule"
              className="flex min-w-0 flex-col gap-4 border-t border-hairline p-4 @min-[34rem]:border-t-0 @min-[34rem]:border-l"
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${safeId}-threshold`}
                  className="text-[11px] font-medium text-ink-3"
                >
                  Threshold
                </label>
                <div className="relative">
                  <input
                    id={`${safeId}-threshold`}
                    type="number"
                    inputMode="decimal"
                    min={dMin}
                    max={dMax}
                    step={step}
                    value={text}
                    disabled={disabled}
                    onFocus={() => {
                      editing.current = true;
                    }}
                    onBlur={() => {
                      editing.current = false;
                      setText(current.threshold.toFixed(decimals));
                    }}
                    onChange={(event) => {
                      const raw = event.currentTarget.value;
                      setText(raw);
                      const v = Number(raw);
                      if (
                        raw.trim() !== "" &&
                        Number.isFinite(v) &&
                        v >= dMin &&
                        v <= dMax
                      ) {
                        commit({ threshold: snapTo(v) });
                      }
                    }}
                    className={cn(
                      "h-8 w-full rounded-2 border border-input bg-surface-1 pr-9 pl-2.5 font-mono text-[13px] text-foreground tabular-nums disabled:opacity-60",
                      FOCUS_RING,
                    )}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[12px] text-ink-3"
                  >
                    {unit}
                  </span>
                </div>
              </div>

              <Segmented
                id={`${safeId}-cmp`}
                label="Fires when the reading is"
                options={[
                  { value: "above" as const, label: "Above", name: "Above" },
                  { value: "below" as const, label: "Below", name: "Below" },
                ]}
                value={current.comparison}
                onChange={(v) => commit({ comparison: v })}
                motionSafe={motionSafe}
                disabled={disabled}
              />

              <Segmented
                id={`${safeId}-dur`}
                label="For at least"
                options={durationOptions}
                value={current.duration}
                onChange={(v) => commit({ duration: v })}
                motionSafe={motionSafe}
                disabled={disabled}
              />

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${safeId}-channel`}
                  className="text-[11px] font-medium text-ink-3"
                >
                  Notify
                </label>
                <select
                  id={`${safeId}-channel`}
                  value={channel?.id ?? ""}
                  disabled={disabled}
                  onChange={(event) => {
                    const id = event.currentTarget.value;
                    commit({ channel: id });
                  }}
                  className={cn(
                    "h-8 w-full rounded-2 border border-input bg-surface-1 px-2 text-[13px] text-foreground disabled:opacity-60",
                    FOCUS_RING,
                  )}
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="rounded-2 bg-surface-1 px-3 py-2 text-[12px] leading-relaxed text-ink-2 ring-1 ring-hairline">
                Notify{" "}
                <span className="font-medium text-foreground">
                  {channel?.label ?? "nobody"}
                </span>{" "}
                when the reading is {current.comparison}{" "}
                <span className="font-mono font-medium text-foreground tabular-nums">
                  {fmt(shownThreshold)} {unit}
                </span>{" "}
                {durationLong(current.duration)}.
              </p>

              {saveState === "failed" ? (
                <p
                  role="alert"
                  className="flex items-start gap-1.5 text-[12px] text-danger"
                >
                  <TriangleAlert
                    aria-hidden
                    className="mt-px size-3.5 shrink-0"
                  />
                  The rule did not save. Your draft is kept.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
