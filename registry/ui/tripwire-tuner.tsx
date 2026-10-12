"use client";

import * as React from "react";

import {
  AnimatePresence,
  LayoutGroup,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionStyle,
} from "motion/react";
import { Activity, Check, RotateCcw, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One reading of the metric, in ms since the epoch. */
export type TripwireSample = { at: number; value: number };

/** An incident on the books: the window the tuner tries to catch. */
export type TripwireIncident = {
  /** Shown in the list, e.g. "INC-2404". */
  id: string;
  title: string;
  /** When it opened, in ms. */
  start: number;
  /** When it was resolved, in ms. */
  end: number;
};

/** The three dials: the line, how long a reading must stay over it, and the quiet time after a fire. */
export type TripwireValue = {
  threshold: number;
  minMinutes: number;
  cooldownMinutes: number;
};

export type TripwireField = keyof TripwireValue;

/** One run of samples above the line, as the tuner counted it. */
export type TripwireFire = {
  /** The index of the run's highest sample. It stays the same while the run is the same mass, so a marker keeps its place as the line moves. */
  id: number;
  /** When the run began, in ms. */
  start: number;
  /** When it fell back under the line, in ms. */
  end: number;
  minutes: number;
  peak: number;
  /** The incident it overlaps, if any. */
  incident: string | null;
  /** Why it did not count: too short for the duration dial, or inside the previous fire's cooldown. */
  dropped: "short" | "cooldown" | null;
};

export type TripwireReport = {
  fires: TripwireFire[];
  /** Fires that count. */
  counted: number;
  /** Counted fires that overlap an incident. */
  real: number;
  /** Counted fires that overlap nothing. */
  noise: number;
  caught: string[];
  missed: string[];
};

export type TripwireCurve = "area" | "line" | "bars";
export type TripwireAccent = "cobalt" | "signal" | "ink";
export type TripwireMarker = "pin" | "flag" | "dot";
export type TripwireStatus = "ready" | "loading" | "error";

export type TripwireTunerProps = {
  /** How the metric is drawn: a filled area, a bare line, or hourly bars. @default "area" */
  curve?: TripwireCurve;
  /** The metric's colour; fires are always amber. @default "cobalt" */
  accent?: TripwireAccent;
  /** What rises at each fire: a pin, a flag, or a dot. @default "pin" */
  markerStyle?: TripwireMarker;
  /** The metric, oldest first, evenly spaced. @default defaultTripwireSeries */
  series?: TripwireSample[];
  /** The incidents the fires are matched against. @default defaultTripwireIncidents */
  incidents?: TripwireIncident[];
  /** Controlled threshold, duration and cooldown. */
  value?: TripwireValue;
  /** Initial dials when uncontrolled. @default defaultTripwireValue */
  defaultValue?: TripwireValue;
  /** Fires from the drag, click, key or chip that changed a dial, with the whole value and which dial moved. */
  onChange?: (value: TripwireValue, field: TripwireField) => void;
  /** The duration chips, in minutes; 0 reads "Any". @default [0, 10, 20, 30, 60] */
  durationOptions?: number[];
  /** The cooldown chips, in minutes; 0 reads "Off". @default [0, 15, 30, 60, 180] */
  cooldownOptions?: number[];
  /** Bottom of the chart and the line's floor. @default 0 */
  min?: number;
  /** Top of the chart and the line's ceiling. Defaults to the data's high, rounded up. */
  max?: number;
  /** Threshold granularity; arrows move one step, Shift+arrows and Page keys ten. @default 10 */
  step?: number;
  /** Printed after the threshold, e.g. "ms". @default "ms" */
  unit?: string;
  /** The metric's name, under the title. @default "Checkout p95 latency" */
  metric?: string;
  /** Turns a value into its printed number. @default thousands with commas */
  format?: (value: number) => string;
  /** Whether the series and incidents have arrived. @default "ready" */
  status?: TripwireStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Tripwire" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the chart takes what the header and dials leave. @default 520 */
  height?: number;
  /** Read only: the line and the chips cannot move. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const SAMPLE_MS = 5 * MIN;
const SAMPLE_COUNT = 14 * 24 * 12;

/** Friday 9 October 2026, 14:40 UTC: the last sample. */
export const defaultTripwireNow = Date.UTC(2026, 9, 9, 14, 40);
const SERIES_START = defaultTripwireNow - (SAMPLE_COUNT - 1) * SAMPLE_MS;

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Bump = {
  at: number;
  samples: number;
  shape: "spike" | "plateau" | "flap";
  excess: number;
};

/** What happened to Gaugeworks Pay's checkout over the fortnight. */
const BUMPS: Bump[] = [
  // The three incidents on the books. The first flaps: it crosses a high
  // line several times, which is what the cooldown dial is for.
  { at: Date.UTC(2026, 8, 27, 9, 20), samples: 19, shape: "flap", excess: 800 },
  {
    at: Date.UTC(2026, 9, 1, 16, 10),
    samples: 10,
    shape: "plateau",
    excess: 560,
  },
  {
    at: Date.UTC(2026, 9, 7, 14, 0),
    samples: 14,
    shape: "plateau",
    excess: 880,
  },
  // Noise: a nightly backup, a lunch rush, three batch retries in a row, a
  // campaign morning, a GC pause that is tall but five minutes long.
  { at: Date.UTC(2026, 8, 26, 3, 10), samples: 1, shape: "spike", excess: 420 },
  {
    at: Date.UTC(2026, 8, 26, 12, 40),
    samples: 3,
    shape: "plateau",
    excess: 360,
  },
  { at: Date.UTC(2026, 8, 28, 22, 5), samples: 1, shape: "spike", excess: 520 },
  {
    at: Date.UTC(2026, 8, 29, 10, 30),
    samples: 4,
    shape: "plateau",
    excess: 300,
  },
  { at: Date.UTC(2026, 9, 2, 2, 0), samples: 2, shape: "plateau", excess: 420 },
  {
    at: Date.UTC(2026, 9, 2, 2, 20),
    samples: 2,
    shape: "plateau",
    excess: 420,
  },
  {
    at: Date.UTC(2026, 9, 2, 2, 40),
    samples: 2,
    shape: "plateau",
    excess: 420,
  },
  {
    at: Date.UTC(2026, 9, 4, 19, 30),
    samples: 2,
    shape: "plateau",
    excess: 470,
  },
  {
    at: Date.UTC(2026, 9, 5, 10, 0),
    samples: 30,
    shape: "plateau",
    excess: 280,
  },
  {
    at: Date.UTC(2026, 9, 6, 8, 15),
    samples: 2,
    shape: "plateau",
    excess: 350,
  },
  { at: Date.UTC(2026, 9, 8, 3, 0), samples: 1, shape: "spike", excess: 700 },
];

/** Fourteen days of checkout p95 latency at five-minute resolution, in ms. */
export const defaultTripwireSeries: TripwireSample[] = (() => {
  const rand = mulberry32(1648);
  const bumps = BUMPS.map((b) => ({
    ...b,
    index: Math.round((b.at - SERIES_START) / SAMPLE_MS),
  }));
  let drift = 0;
  const out: TripwireSample[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const at = SERIES_START + i * SAMPLE_MS;
    const d = new Date(at);
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const daytime =
      hour > 7 && hour < 20 ? Math.sin((Math.PI * (hour - 7)) / 13) : 0;
    drift = drift * 0.82 + (rand() - 0.5) * 44;
    let value =
      290 +
      110 * daytime * (weekend ? 0.55 : 1) +
      drift +
      (rand() < 0.03 ? rand() * 70 : 0);
    for (const b of bumps) {
      const k = i - b.index;
      if (k < 0 || k >= b.samples) continue;
      const shape =
        b.shape === "spike"
          ? Math.exp(-k / Math.max(1, b.samples / 3))
          : b.shape === "flap"
            ? k === 0 || k === b.samples - 1
              ? 0.6
              : 1 + 0.32 * Math.sin(k * 1.7)
            : b.samples >= 4 && k === 0
              ? 0.8
              : b.samples >= 4 && k === b.samples - 1
                ? 0.75
                : 1 + (rand() - 0.5) * 0.12;
      value += b.excess * shape;
    }
    out.push({ at, value: Math.round(value) });
  }
  return out;
})();

export const defaultTripwireIncidents: TripwireIncident[] = [
  {
    id: "INC-2404",
    title: "Ledger pool exhaustion",
    start: Date.UTC(2026, 8, 27, 9, 25),
    end: Date.UTC(2026, 8, 27, 11, 5),
  },
  {
    id: "INC-2409",
    title: "Cache cold start after deploy",
    start: Date.UTC(2026, 9, 1, 16, 15),
    end: Date.UTC(2026, 9, 1, 17, 5),
  },
  {
    id: "INC-2417",
    title: "Checkout latency on Gaugeworks Pay",
    start: Date.UTC(2026, 9, 7, 14, 2),
    end: Date.UTC(2026, 9, 7, 15, 20),
  },
];

export const defaultTripwireValue: TripwireValue = {
  threshold: 600,
  minMinutes: 10,
  cooldownMinutes: 30,
};

export const defaultTripwireDurations = [0, 10, 20, 30, 60];
export const defaultTripwireCooldowns = [0, 15, 30, 60, 180];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<TripwireAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink-2)",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

/** Plot insets: a gutter for the axis on the left, the handle on the right. */
const GUTTER_L = 40;
const GUTTER_R = 72;
const PAD_T = 14;
const PAD_B = 34;
/** The incident bands sit just under the floor, above the day labels. */
const BAND_DY = 6;
const BAND_H = 5;
/** Marker head radius. */
const HEAD_R = 4.5;
/** Tall enough that the clip never needs to know the plot's height. */
const CLIP_H = 4096;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;

const r1 = (v: number) => Number(v.toFixed(1));
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Thousands with commas, the same on the server and in every locale. */
const fmtInt = (value: number) => {
  const n = Math.round(Math.abs(value));
  const digits = String(n);
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    out += digits[i] ?? "";
    if (fromEnd > 1 && fromEnd % 3 === 1) out += ",";
  }
  return value < 0 ? `-${out}` : out;
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** "Sun 27 Sep 09:20", always UTC, so a prerender and the browser agree. */
const fmtWhen = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

/** Chip text: "Any", "10 min", "1 h", "1 h 30 min". */
const minutesShort = (m: number, zero: string) => {
  if (m <= 0) return zero;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
};

/** Spoken: "any length", "10 minutes", "1 hour", "1 hour 30 minutes". */
const minutesWords = (m: number, zero: string) => {
  if (m <= 0) return zero;
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = `${h} hour${h === 1 ? "" : "s"}`;
  return rest ? `${hours} ${rest} minutes` : hours;
};

/** A tick step from 1, 2, 5 × 10^n that gives about four gridlines. */
const niceStep = (range: number) => {
  const raw = Math.max(1e-9, range / 4);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
};

/**
 * Walks the series once: every run of samples above the line is a fire, then
 * the duration dial drops the short ones and the cooldown dial folds any run
 * that starts inside the quiet time after the last fire (a folded run still
 * extends that quiet time, as a flapping alert keeps itself open). Each fire
 * that counts is matched to the incident it overlaps.
 */
export function tuneTripwire(
  series: TripwireSample[],
  incidents: TripwireIncident[],
  value: TripwireValue,
): TripwireReport {
  const n = series.length;
  const first = series[0];
  const last = series[n - 1];
  const interval =
    n > 1 && first && last ? (last.at - first.at) / (n - 1) : SAMPLE_MS;
  const fires: TripwireFire[] = [];
  let quietUntil = -Infinity;
  let i = 0;
  while (i < n) {
    const s = series[i];
    if (!s || s.value <= value.threshold) {
      i += 1;
      continue;
    }
    let j = i;
    let peakIndex = i;
    let peak = s.value;
    while (j + 1 < n) {
      const next = series[j + 1];
      if (!next || next.value <= value.threshold) break;
      j += 1;
      if (next.value > peak) {
        peak = next.value;
        peakIndex = j;
      }
    }
    const start = s.at;
    const end = (series[j]?.at ?? start) + interval;
    const minutes = (end - start) / MIN;
    let dropped: TripwireFire["dropped"] = null;
    if (minutes < value.minMinutes) dropped = "short";
    else if (start < quietUntil) {
      dropped = "cooldown";
      quietUntil = Math.max(quietUntil, end + value.cooldownMinutes * MIN);
    } else quietUntil = end + value.cooldownMinutes * MIN;
    const incident =
      incidents.find((inc) => inc.start < end && inc.end > start)?.id ?? null;
    fires.push({
      id: peakIndex,
      start,
      end,
      minutes,
      peak,
      incident,
      dropped,
    });
    i = j + 1;
  }
  const counting = fires.filter((f) => f.dropped === null);
  const caught = incidents
    .filter((inc) => counting.some((f) => f.incident === inc.id))
    .map((inc) => inc.id);
  return {
    fires,
    counted: counting.length,
    real: counting.filter((f) => f.incident !== null).length,
    noise: counting.filter((f) => f.incident === null).length,
    caught,
    missed: incidents
      .filter((inc) => !caught.includes(inc.id))
      .map((inc) => inc.id),
  };
}

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
/*                                Chip group                                */
/* ----------------------------------------------------------------------- */

type ChipGroupProps = {
  id: string;
  label: string;
  options: number[];
  value: number;
  zero: string;
  disabled: boolean;
  motionSafe: boolean;
  onSelect: (option: number) => void;
};

/** One radio group of chips; the selected pill glides between them. */
function ChipGroup({
  id,
  label,
  options,
  value,
  zero,
  disabled,
  motionSafe,
  onSelect,
}: ChipGroupProps) {
  const nodes = React.useRef(new Map<number, HTMLButtonElement>());
  const selected = options.includes(value) ? value : (options[0] ?? 0);

  const move = (event: React.KeyboardEvent, i: number) => {
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = options.length - 1;
    else return;
    event.preventDefault();
    const target = options[(to + options.length) % options.length];
    if (target === undefined) return;
    nodes.current.get(target)?.focus();
    if (!disabled) onSelect(target);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span
        id={`${id}-label`}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {label}
      </span>
      <LayoutGroup id={id}>
        <div
          role="radiogroup"
          aria-labelledby={`${id}-label`}
          className="-m-[3px] flex flex-wrap gap-1 p-[3px]"
        >
          {options.map((option, i) => {
            const on = option === selected;
            return (
              <button
                key={option}
                ref={(node) => {
                  if (node) nodes.current.set(option, node);
                  else nodes.current.delete(option);
                }}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={disabled || undefined}
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  if (!disabled) onSelect(option);
                }}
                onKeyDown={(event) => move(event, i)}
                className={cn(
                  "relative h-7 rounded-full px-2.5 font-mono text-[11px] whitespace-nowrap transition-colors duration-200",
                  on
                    ? "text-cobalt-bright"
                    : "text-ink-2 hover:text-foreground",
                  disabled ? "cursor-not-allowed" : "cursor-pointer",
                  FOCUS_RING,
                )}
              >
                {on ? (
                  <motion.span
                    aria-hidden
                    layoutId={motionSafe ? `${id}-pill` : undefined}
                    transition={springs.snap}
                    className="absolute inset-0 rounded-full border border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full border border-hairline"
                  />
                )}
                <span className="relative">{minutesShort(option, zero)}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Marker                                  */
/* ----------------------------------------------------------------------- */

type MarkerProps = {
  fire: TripwireFire;
  x: number;
  headY: number;
  floor: number;
  style: TripwireMarker;
  motionSafe: boolean;
};

/**
 * A pin at the run's peak. It rises from the floor on `snap` when the run
 * starts to count, stands down to the floor on `glide` when the cooldown
 * folds it away, and fades when it leaves.
 */
function Marker({ fire, x, headY, floor, style, motionSafe }: MarkerProps) {
  const folded = fire.dropped === "cooldown";
  const real = fire.incident !== null;
  const spring = folded ? springs.glide : springs.snap;
  const tr = motionSafe ? spring : { duration: 0 };
  const lift = folded ? floor - headY : 0;
  const stroke = "var(--tt-fire)";
  const fill = real ? "var(--tt-fire)" : "var(--bg-0)";
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: folded ? 0.45 : 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.fast, ease: easings.enter }}
    >
      <motion.line
        x1={x}
        x2={x}
        y2={floor}
        initial={motionSafe ? { y1: floor } : false}
        animate={{ y1: headY + lift }}
        transition={tr}
        stroke={stroke}
        strokeWidth={1}
        strokeDasharray={folded ? "2 3" : undefined}
        strokeOpacity={0.8}
      />
      <motion.g
        initial={motionSafe ? { y: floor - headY } : false}
        animate={{ y: lift }}
        transition={tr}
      >
        {style === "flag" ? (
          <path
            d={`M${x} ${r1(headY - 1)} v-10 l9 3 l-9 3`}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.25}
            strokeLinejoin="round"
          />
        ) : (
          <circle
            cx={x}
            cy={headY}
            r={style === "dot" ? HEAD_R - 1 : HEAD_R}
            fill={fill}
            stroke={stroke}
            strokeWidth={style === "dot" ? 1.25 : 1.5}
          />
        )}
      </motion.g>
    </motion.g>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Size = { w: number; h: number };

/**
 * An alert-threshold tuner. A fortnight of a metric is drawn under a
 * horizontal tripwire that sits directly under the hand: drag it, click the
 * chart, or move it by key, and every run of readings above it lights up as
 * a fire that would have paged someone. An amber marker rises from the floor
 * on `springs.snap` at each run's peak, the fire count rolls, and each fire
 * is matched against the incidents on the books, so the tuner says plainly
 * how many of its fires were real and how many were noise. Markers for real
 * catches are solid; noise is hollow.
 *
 * Two more dials change which runs count. "For at least" drops runs shorter
 * than the chip, and their markers fade; "Cooldown" folds any run that
 * starts inside the quiet time after a fire, and its marker stands down to
 * the floor on `springs.glide` with a dotted stem. The incident list ticks
 * each catch with a check drawn on `springs.flick` and marks a miss.
 *
 * The handle is a vertical slider: Up and Down move one step, Shift+arrow and
 * the Page keys ten, Home and End go to the floor and the ceiling. The dials
 * are radio groups; arrows choose. Every change is announced with the new
 * count. Under reduced motion the line jumps, markers appear in place and
 * cross-fade, and the digits change without rolling.
 */
export function TripwireTuner({
  curve = "area",
  accent = "cobalt",
  markerStyle = "pin",
  series = defaultTripwireSeries,
  incidents = defaultTripwireIncidents,
  value,
  defaultValue = defaultTripwireValue,
  onChange,
  durationOptions = defaultTripwireDurations,
  cooldownOptions = defaultTripwireCooldowns,
  min = 0,
  max,
  step = 10,
  unit = "ms",
  metric = "Checkout p95 latency",
  format = fmtInt,
  status = "ready",
  onRetry,
  title = "Tripwire",
  label,
  height = 520,
  disabled = false,
  className,
}: TripwireTunerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const clipId = `${uid}-clip`;
  const hintId = `${uid}-hint`;

  const [own, setOwn] = React.useState<TripwireValue>(defaultValue);
  const current = value ?? own;
  const { threshold, minMinutes, cooldownMinutes } = current;
  const ready = status === "ready";
  const empty = ready && series.length === 0;
  const inert = disabled || !ready || empty;

  const [size, setSize] = React.useState<Size>({ w: 0, h: 0 });
  const [dragging, setDragging] = React.useState(false);
  const [hover, setHover] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const plotRef = React.useRef<HTMLDivElement | null>(null);
  const handleRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ pointerId: number; offset: number } | null>(
    null,
  );

  /* -------------------------------- scale ------------------------------ */

  const n = series.length;
  let high = -Infinity;
  for (const s of series) if (s.value > high) high = s.value;
  if (n === 0) high = 1000;
  const rangeMin = min;
  const rangeMax = max ?? Math.ceil((high * 1.1) / 100) * 100;
  const range = rangeMax - rangeMin || 1;
  const safeStep = step > 0 ? step : 1;
  const decimals = Math.max(0, Math.min(6, Math.ceil(-Math.log10(safeStep))));
  const quantize = (raw: number) =>
    Number(
      (
        Math.round(clamp(raw, rangeMin, rangeMax) / safeStep) * safeStep
      ).toFixed(decimals),
    );

  const plotW = Math.max(0, size.w - GUTTER_L - GUTTER_R);
  const innerH = Math.max(0, size.h - PAD_T - PAD_B);
  const floor = r1(PAD_T + innerH);
  const yOf = (v: number) =>
    r1(PAD_T + clamp(1 - (v - rangeMin) / range, 0, 1) * innerH);
  const valueAt = (y: number) =>
    rangeMax - ((y - PAD_T) / Math.max(1, innerH)) * range;
  const xOf = (i: number) =>
    r1(GUTTER_L + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2));
  const startAt = series[0]?.at ?? 0;
  const endAt = series[n - 1]?.at ?? startAt + 1;
  const span = endAt - startAt || 1;
  const xAt = (t: number) =>
    r1(GUTTER_L + clamp((t - startAt) / span, 0, 1) * plotW);

  /* ------------------------------- report ------------------------------ */

  const report = React.useMemo(
    () =>
      tuneTripwire(series, incidents, {
        threshold,
        minMinutes,
        cooldownMinutes,
      }),
    [series, incidents, threshold, minMinutes, cooldownMinutes],
  );
  // Handlers read the latest value here, so a drag's moves never commit on
  // top of a stale closure.
  const currentRef = React.useRef(current);
  React.useEffect(() => {
    currentRef.current = current;
  });

  /* ------------------------------ geometry ----------------------------- */

  const { trace, area, bars } = React.useMemo(() => {
    if (n === 0 || plotW <= 0 || innerH <= 0) {
      return {
        trace: "",
        area: "",
        bars: [] as { x: number; w: number; y: number }[],
      };
    }
    const cols = Math.max(1, Math.floor(plotW));
    const pts: string[] = [];
    const push = (i: number) => {
      const s = series[i];
      if (s) pts.push(`${xOf(i)} ${yOf(s.value)}`);
    };
    if (n <= cols * 2) {
      for (let i = 0; i < n; i += 1) push(i);
    } else {
      // Each pixel column keeps its lowest and highest sample, in order, so
      // the trace is honest at any width without drawing every reading.
      const per = n / cols;
      for (let c = 0; c < cols; c += 1) {
        const lo = Math.floor(c * per);
        const hi = Math.min(n, Math.floor((c + 1) * per));
        if (hi <= lo) continue;
        let a = lo;
        let b = lo;
        for (let i = lo; i < hi; i += 1) {
          const v = series[i]?.value ?? 0;
          if (v < (series[a]?.value ?? 0)) a = i;
          if (v > (series[b]?.value ?? 0)) b = i;
        }
        if (a === b) push(a);
        else if (a < b) {
          push(a);
          push(b);
        } else {
          push(b);
          push(a);
        }
      }
    }
    const first = pts[0];
    const line = first ? `M${first} L${pts.slice(1).join(" L")}` : "";
    const closed = first
      ? `${line} L${xOf(n - 1)} ${floor} L${xOf(0)} ${floor} Z`
      : "";
    const bucket = Math.max(
      1,
      Math.ceil(n / Math.max(1, Math.floor(plotW / 4))),
    );
    const out: { x: number; w: number; y: number }[] = [];
    for (let lo = 0; lo < n; lo += bucket) {
      const hi = Math.min(n, lo + bucket);
      let top = -Infinity;
      for (let i = lo; i < hi; i += 1)
        top = Math.max(top, series[i]?.value ?? 0);
      const x0 = xOf(lo);
      const x1 = hi >= n ? GUTTER_L + plotW : xOf(hi);
      out.push({ x: x0, w: r1(Math.max(1, x1 - x0 - 1)), y: yOf(top) });
    }
    return { trace: line, area: closed, bars: out };
    // Every input of xOf/yOf is listed; the closures themselves are rebuilt
    // each render and must not retrigger the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, n, plotW, innerH, floor, rangeMin, rangeMax]);

  /** The area over a run's samples, closed to the floor; the clip keeps only what is above the line. */
  const runPath = (fire: TripwireFire) => {
    const s = clamp(fire.id, 0, n - 1);
    let a = s;
    let b = s;
    while (a > 0 && (series[a - 1]?.value ?? -Infinity) > threshold) a -= 1;
    while (b < n - 1 && (series[b + 1]?.value ?? -Infinity) > threshold) b += 1;
    const lo = Math.max(0, a - 1);
    const hi = Math.min(n - 1, b + 1);
    const pts: string[] = [];
    for (let i = lo; i <= hi; i += 1) {
      const v = series[i]?.value ?? 0;
      pts.push(`L${xOf(i)} ${yOf(v)}`);
    }
    return `M${xOf(lo)} ${floor} ${pts.join(" ")} L${xOf(hi)} ${floor} Z`;
  };

  const yStep = niceStep(range);
  const yTicks: number[] = [];
  for (let v = Math.ceil(rangeMin / yStep) * yStep; v <= rangeMax; v += yStep)
    yTicks.push(Number(v.toFixed(6)));

  const dayPx = (plotW * DAY) / span;
  const every = Math.max(1, Math.ceil(46 / Math.max(1, dayPx)));
  const xTicks: { t: number; label: string | null }[] = [];
  if (n > 1) {
    let k = 0;
    for (let t = Math.ceil(startAt / DAY) * DAY; t <= endAt; t += DAY) {
      const d = new Date(t);
      xTicks.push({
        t,
        label:
          k % every === 0
            ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`
            : null,
      });
      k += 1;
    }
  }

  /* ------------------------------ measuring ---------------------------- */

  React.useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const next = { w: node.clientWidth, h: node.clientHeight };
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [status, empty]);

  /* -------------------------------- line ------------------------------- */

  // The line is a motion value: a drag writes it straight, with no render in
  // between, and a keyed move animates it on snap.
  const lineY = useMotionValue(yOf(threshold));
  const clipY = useTransform(lineY, (y) => y - CLIP_H);
  const targetY = yOf(threshold);
  React.useEffect(() => {
    if (dragRef.current) {
      lineY.set(targetY);
      return;
    }
    const controls = animate(
      lineY,
      targetY,
      motionSafe ? springs.snap : { duration: 0 },
    );
    return () => controls.stop();
  }, [targetY, lineY, motionSafe]);

  /* ------------------------------- changes ----------------------------- */

  const words = (next: TripwireValue, field: TripwireField) => {
    const r = tuneTripwire(series, incidents, next);
    const lead =
      field === "threshold"
        ? `Threshold ${format(next.threshold)} ${unit}.`
        : field === "minMinutes"
          ? `For at least ${minutesWords(next.minMinutes, "any length")}.`
          : `Cooldown ${minutesWords(next.cooldownMinutes, "off")}.`;
    return `${lead} Would have fired ${r.counted} ${r.counted === 1 ? "time" : "times"}: ${r.real} real, ${r.noise} noise. ${r.caught.length} of ${incidents.length} incidents caught.`;
  };

  const commit = (
    patch: Partial<TripwireValue>,
    field: TripwireField,
    announce: boolean,
  ) => {
    if (inert) return;
    const base = currentRef.current;
    const next = { ...base, ...patch };
    if (
      next.threshold === base.threshold &&
      next.minMinutes === base.minMinutes &&
      next.cooldownMinutes === base.cooldownMinutes
    )
      return;
    currentRef.current = next;
    if (value === undefined) setOwn(next);
    onChange?.(next, field);
    if (announce) setAnnouncement(words(next, field));
  };

  const setThreshold = (raw: number, announce: boolean) =>
    commit({ threshold: quantize(raw) }, "threshold", announce);

  const thresholdFromY = (y: number, announce: boolean) =>
    setThreshold(valueAt(y), announce);

  const moveBy = (steps: number) =>
    setThreshold(currentRef.current.threshold + steps * safeStep, true);

  const onSliderKey = (event: React.KeyboardEvent) => {
    if (inert) return;
    const ten = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        event.preventDefault();
        moveBy(ten);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        event.preventDefault();
        moveBy(-ten);
        break;
      case "PageUp":
        event.preventDefault();
        moveBy(10);
        break;
      case "PageDown":
        event.preventDefault();
        moveBy(-10);
        break;
      case "Home":
        event.preventDefault();
        setThreshold(rangeMin, true);
        break;
      case "End":
        event.preventDefault();
        setThreshold(rangeMax, true);
        break;
      default:
        break;
    }
  };

  /* ------------------------------- pointer ----------------------------- */

  const plotTop = () => plotRef.current?.getBoundingClientRect().top ?? 0;

  const onGripDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (inert || event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has nothing to capture; the line still tracks.
    }
    dragRef.current = {
      pointerId: event.pointerId,
      offset: event.clientY - plotTop() - lineY.get(),
    };
    setDragging(true);
    setHover(null);
    handleRef.current?.focus({ preventScroll: true });
  };

  const onGripMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const grab = dragRef.current;
    if (!grab || grab.pointerId !== event.pointerId) return;
    const y = clamp(event.clientY - plotTop() - grab.offset, PAD_T, floor);
    // Written directly as well as committed, so the line never waits a frame.
    lineY.set(yOf(quantize(valueAt(y))));
    thresholdFromY(y, false);
  };

  const onGripUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const grab = dragRef.current;
    if (!grab || grab.pointerId !== event.pointerId) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Never captured, or nothing to release.
    }
    dragRef.current = null;
    setDragging(false);
    setAnnouncement(words(currentRef.current, "threshold"));
  };

  const onPlotClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (inert) return;
    const y = event.clientY - plotTop();
    if (y < PAD_T - 6 || y > floor + 6) return;
    thresholdFromY(clamp(y, PAD_T, floor), true);
    handleRef.current?.focus({ preventScroll: true });
  };

  const onPlotHover = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || dragRef.current || n === 0) return;
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    if (x < GUTTER_L || x > GUTTER_L + plotW) {
      setHover(null);
      return;
    }
    const i = Math.round(((x - GUTTER_L) / Math.max(1, plotW)) * (n - 1));
    setHover((prev) => (prev === i ? prev : i));
  };

  /* ------------------------------- render ------------------------------ */

  const counted = report.counted;
  const summary = `Would have fired ${counted} ${counted === 1 ? "time" : "times"}: ${report.real} real, ${report.noise} noise. ${report.caught.length} of ${incidents.length} incidents caught.`;
  const valueText = `${format(threshold)} ${unit}, fires ${counted} ${counted === 1 ? "time" : "times"}, ${report.real} real, ${report.noise} noise`;

  const hovered = hover !== null ? series[hover] : undefined;
  const fillOpacity = (fire: TripwireFire) =>
    fire.dropped === "cooldown" ? 0.1 : 0.3;
  const shownFires = report.fires.filter((f) => f.dropped !== "short");
  const stepDelay = cascade(Math.min(incidents.length, 6));

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--tt-accent" as string]: ACCENTS[accent] ?? ACCENTS.cobalt,
        ["--tt-fire" as string]: "var(--warn)",
      }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move the line one step, Shift and arrow ten, Home and End go
        to the floor and the ceiling. Click the chart to put the line there.
      </p>

      <header className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {metric}
          </p>
        </div>
        {ready && !empty ? (
          <div className="flex items-baseline gap-x-3 gap-y-1 text-[12px] text-ink-2">
            <span className="sr-only">{summary}</span>
            <span aria-hidden className="flex items-baseline gap-1">
              <Roll
                value={counted}
                motionSafe={motionSafe}
                className="font-mono text-[15px] text-foreground"
              />
              fires
            </span>
            <span aria-hidden className="flex items-baseline gap-1">
              <Roll
                value={report.real}
                motionSafe={motionSafe}
                className="font-mono text-[15px] text-warn"
              />
              real
            </span>
            <span aria-hidden className="flex items-baseline gap-1">
              <Roll
                value={report.noise}
                motionSafe={motionSafe}
                className="font-mono text-[15px] text-ink-3"
              />
              noise
            </span>
          </div>
        ) : null}
      </header>

      {/* ------------------------------ plot ----------------------------- */}

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The series didn&apos;t load.
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
        <div aria-hidden className="flex min-h-0 flex-1 flex-col px-3 pb-2">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-3 bg-surface-1">
            <div className="absolute inset-x-10 bottom-8 flex h-2/3 items-end gap-[3px]">
              {Array.from({ length: 28 }, (_, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    height: `${30 + ((i * 37) % 55)}%`,
                    animationDelay: `${i * 40}ms`,
                  }}
                />
              ))}
            </div>
            <span className="absolute inset-x-10 top-1/3 border-t border-dashed border-hairline-strong" />
          </div>
        </div>
      ) : empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <Activity aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">No samples yet.</p>
          <p className="max-w-[28ch] text-[12px] text-ink-3">
            The tripwire needs a few hours of {metric.toLowerCase()} before it
            can be tuned.
          </p>
        </div>
      ) : (
        <div
          ref={plotRef}
          onClick={onPlotClick}
          onPointerMove={onPlotHover}
          onPointerLeave={() => setHover(null)}
          className={cn(
            "relative min-h-0 flex-1 select-none",
            !inert && "cursor-crosshair",
          )}
        >
          <svg
            aria-hidden
            width={size.w}
            height={size.h}
            className="absolute inset-0 overflow-visible"
          >
            <defs>
              <clipPath id={clipId}>
                <motion.rect
                  x={0}
                  width={Math.max(0, size.w)}
                  height={CLIP_H}
                  // `attrY` is rendered as the rect's `y` attribute (not a
                  // transform), which is what a clipPath child needs; the
                  // style type does not list it.
                  style={{ attrY: clipY } as unknown as MotionStyle}
                />
              </clipPath>
            </defs>

            {/* Grid and axis. */}
            {yTicks.map((v) => (
              <g key={v}>
                <line
                  x1={GUTTER_L}
                  x2={GUTTER_L + plotW}
                  y1={yOf(v)}
                  y2={yOf(v)}
                  stroke="var(--hairline)"
                />
                <text
                  x={GUTTER_L - 6}
                  y={yOf(v) + 3}
                  textAnchor="end"
                  className="font-mono text-[9px] tabular-nums"
                  fill="var(--ink-3)"
                >
                  {format(v)}
                </text>
              </g>
            ))}
            {xTicks.map((tick) => (
              <g key={tick.t}>
                <line
                  x1={xAt(tick.t)}
                  x2={xAt(tick.t)}
                  y1={floor}
                  y2={floor + 3}
                  stroke="var(--hairline-strong)"
                />
                {tick.label ? (
                  <text
                    x={xAt(tick.t)}
                    y={size.h - 5}
                    textAnchor="middle"
                    className="font-mono text-[9px]"
                    fill="var(--ink-3)"
                  >
                    {tick.label}
                  </text>
                ) : null}
              </g>
            ))}
            <line
              x1={GUTTER_L}
              x2={GUTTER_L + plotW}
              y1={floor}
              y2={floor}
              stroke="var(--hairline-strong)"
            />

            {/* The metric. */}
            {curve === "bars" ? (
              <g fill="var(--tt-accent)" fillOpacity={0.5}>
                {bars.map((bar) => (
                  <rect
                    key={bar.x}
                    x={bar.x}
                    y={bar.y}
                    width={bar.w}
                    height={Math.max(0, r1(floor - bar.y))}
                  />
                ))}
              </g>
            ) : (
              <>
                {curve === "area" && area ? (
                  <path d={area} fill="var(--tt-accent)" fillOpacity={0.14} />
                ) : null}
                {trace ? (
                  <path
                    d={trace}
                    fill="none"
                    stroke="var(--tt-accent)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                ) : null}
              </>
            )}

            {/* What is above the line, lit per run. */}
            <g clipPath={`url(#${clipId})`}>
              <AnimatePresence initial={false}>
                {shownFires.map((fire) => (
                  <motion.path
                    key={fire.id}
                    d={runPath(fire)}
                    fill="var(--tt-fire)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: fillOpacity(fire) }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                    }}
                  />
                ))}
              </AnimatePresence>
            </g>

            {/* Incident bands under the floor: green once caught, red while missed. */}
            {incidents.map((inc) => {
              const caught = report.caught.includes(inc.id);
              const x0 = xAt(inc.start);
              const x1 = Math.max(x0 + 2, xAt(inc.end));
              return (
                <rect
                  key={inc.id}
                  x={x0}
                  y={floor + BAND_DY}
                  width={r1(x1 - x0)}
                  height={BAND_H}
                  rx={1}
                  fill={caught ? "var(--success)" : "var(--danger)"}
                  fillOpacity={caught ? 0.85 : 0.6}
                  className="transition-[fill] duration-200"
                />
              );
            })}

            {/* Hover hairline. */}
            {hovered && hover !== null && !dragging ? (
              <g>
                <line
                  x1={xOf(hover)}
                  x2={xOf(hover)}
                  y1={PAD_T}
                  y2={floor}
                  stroke="var(--ink-3)"
                  strokeOpacity={0.5}
                  strokeDasharray="2 3"
                />
                <circle
                  cx={xOf(hover)}
                  cy={yOf(hovered.value)}
                  r={3}
                  fill="var(--bg-0)"
                  stroke="var(--tt-accent)"
                  strokeWidth={1.5}
                />
              </g>
            ) : null}

            {/* Markers. They mount once the plot has a size, so the first
                paint is the rise, not a jump from a zero-width plot. */}
            <AnimatePresence>
              {shownFires.map((fire) => {
                const peak = series[fire.id];
                if (!peak || plotW <= 0) return null;
                return (
                  <Marker
                    key={fire.id}
                    fire={fire}
                    x={xOf(fire.id)}
                    headY={yOf(peak.value) - 2}
                    floor={floor}
                    style={markerStyle}
                    motionSafe={motionSafe}
                  />
                );
              })}
            </AnimatePresence>
          </svg>

          {/* The hover readout. */}
          <AnimatePresence>
            {hovered && !dragging ? (
              <motion.p
                key="readout"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
                className="pointer-events-none absolute top-1 left-10 rounded-2 border border-hairline bg-popover px-1.5 py-0.5 font-mono text-[10px] text-ink-2 tabular-nums"
              >
                {fmtWhen(hovered.at)} ·{" "}
                <span className="text-foreground">
                  {format(hovered.value)} {unit}
                </span>
              </motion.p>
            ) : null}
          </AnimatePresence>

          {/* The tripwire. */}
          <motion.div
            aria-hidden
            style={{ y: lineY, left: GUTTER_L, right: GUTTER_R }}
            className={cn(
              "pointer-events-none absolute top-0 h-0 border-t transition-colors duration-200",
              dragging ? "border-solid" : "border-dashed",
            )}
          >
            <span
              className="absolute inset-x-0 -top-px block h-px"
              style={{ background: "var(--tt-fire)" }}
            />
          </motion.div>

          {/* The grip: the whole line and its handle are one drag surface. */}
          <motion.div
            style={{ y: lineY, left: GUTTER_L }}
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "absolute top-0 right-0 h-7 -translate-y-1/2 touch-none",
              inert ? "cursor-not-allowed" : "cursor-ns-resize",
            )}
          >
            <div
              ref={handleRef}
              role="slider"
              tabIndex={inert ? -1 : 0}
              aria-labelledby={titleId}
              aria-describedby={hintId}
              aria-orientation="vertical"
              aria-valuemin={quantize(rangeMin)}
              aria-valuemax={quantize(rangeMax)}
              aria-valuenow={threshold}
              aria-valuetext={valueText}
              aria-disabled={inert || undefined}
              onKeyDown={onSliderKey}
              className={cn(
                "absolute top-1/2 right-1.5 flex h-6 -translate-y-1/2 items-center gap-1 rounded-2 border bg-popover pr-2 pl-1.5 font-mono text-[11px] whitespace-nowrap tabular-nums shadow-[0_6px_16px_-10px_color-mix(in_oklab,black_50%,transparent)] transition-colors duration-200",
                dragging
                  ? "border-[color-mix(in_oklab,var(--tt-fire)_70%,transparent)] text-foreground"
                  : "border-hairline-strong text-ink",
                FOCUS_RING,
              )}
            >
              <span
                aria-hidden
                className="flex h-3 w-1.5 flex-col justify-between"
              >
                <span className="block h-px w-full bg-ink-3" />
                <span className="block h-px w-full bg-ink-3" />
                <span className="block h-px w-full bg-ink-3" />
              </span>
              {format(threshold)}
              <span className="text-ink-3">{unit}</span>
            </div>
          </motion.div>
        </div>
      )}

      {/* ----------------------------- dials ----------------------------- */}

      <div className="flex shrink-0 flex-col gap-3 border-t border-hairline px-4 pt-3 pb-3 @min-[40rem]:flex-row @min-[40rem]:gap-6">
        {status === "loading" ? (
          <>
            {[0, 1].map((g) => (
              <div key={g} aria-hidden className="flex flex-col gap-1.5">
                <span className="h-2.5 w-16 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                <span className="flex gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className="h-7 w-12 rounded-full bg-surface-2 motion-safe:animate-pulse"
                      style={{ animationDelay: `${(g * 5 + i) * 60}ms` }}
                    />
                  ))}
                </span>
              </div>
            ))}
          </>
        ) : (
          <>
            <ChipGroup
              id={`${uid}-dur`}
              label="For at least"
              options={durationOptions}
              value={minMinutes}
              zero="Any"
              disabled={inert}
              motionSafe={motionSafe}
              onSelect={(m) => commit({ minMinutes: m }, "minMinutes", true)}
            />
            <ChipGroup
              id={`${uid}-cool`}
              label="Cooldown"
              options={cooldownOptions}
              value={cooldownMinutes}
              zero="Off"
              disabled={inert}
              motionSafe={motionSafe}
              onSelect={(m) =>
                commit({ cooldownMinutes: m }, "cooldownMinutes", true)
              }
            />
          </>
        )}
      </div>

      {/* --------------------------- incidents --------------------------- */}

      {ready && !empty && incidents.length > 0 ? (
        <ul
          role="list"
          aria-label="Incidents"
          className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline px-4 py-2.5"
        >
          {incidents.map((inc, i) => {
            const caught = report.caught.includes(inc.id);
            return (
              <li
                key={inc.id}
                className="flex min-w-0 items-center gap-1.5 text-[12px]"
              >
                <span className="relative flex size-4 shrink-0 items-center justify-center">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={caught ? "caught" : "missed"}
                      initial={
                        motionSafe ? { opacity: 0, scale: 0.6 } : { opacity: 0 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.flick,
                              delay: r3(i * stepDelay),
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                      className={cn(
                        "flex size-4 items-center justify-center rounded-full",
                        caught
                          ? "bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-success"
                          : "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger",
                      )}
                    >
                      {caught ? (
                        <svg aria-hidden viewBox="0 0 14 14" className="size-3">
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
                              motionSafe
                                ? { ...springs.flick, delay: r3(i * stepDelay) }
                                : { duration: 0 }
                            }
                          />
                        </svg>
                      ) : (
                        <X aria-hidden className="size-2.5" strokeWidth={2.2} />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                  {inc.id}
                </span>
                <span className="hidden min-w-0 truncate text-ink-2 @min-[30rem]:inline">
                  {inc.title}
                </span>
                <span className="sr-only">{caught ? "caught" : "missed"}</span>
              </li>
            );
          })}
          <li className="ml-auto flex items-center gap-1 text-[11px] text-ink-3">
            <Check aria-hidden className="size-3 text-success" />
            {report.caught.length} of {incidents.length} caught
          </li>
        </ul>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
