"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Droplets,
  Minus,
  Plus,
  RotateCcw,
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

export type CreditGaugeStyle = "tank" | "bar" | "ring";
export type CreditDensity = "compact" | "cozy" | "roomy";
export type CreditAccent = "cobalt" | "signal" | "success";
export type CreditStatus = "ready" | "loading" | "error";

/** One refill the host sells, with its price in the surface's currency. */
export type CreditPreset = {
  id: string;
  credits: number;
  price: number;
  /** A short tag under the amount, e.g. "Best value". */
  note?: string;
};

/** One recent spend, newest first. */
export type CreditUsage = {
  id: string;
  /** What used the credits, e.g. "Batch embeddings, 3 files". */
  label: string;
  /** When, already in words: "Today 09:12", "Yesterday". */
  when: string;
  credits: number;
};

/** The refill picked: one of the presets, or an amount typed in. */
export type CreditSelection =
  { kind: "preset"; id: string } | { kind: "custom"; credits: number };

export type CreditAutoRefill = {
  enabled: boolean;
  /** The balance that triggers a refill, in credits. */
  threshold: number;
  /** Most the host may charge in a month, in the currency; 0 is no cap. */
  monthlyCap: number;
};

export type CreditRefillEvent = {
  credits: number;
  price: number;
  selection: CreditSelection;
};

export type CreditRefillProps = {
  /** How the balance is drawn: a tank of liquid, a segmented bar, or a ring. @default "tank" */
  gauge?: CreditGaugeStyle;
  /** Padding, type size and row heights. @default "cozy" */
  density?: CreditDensity;
  /** The liquid's colour, from the theme's tokens. @default "cobalt" */
  accent?: CreditAccent;
  /** Credits in hand. Zero reads as empty. @default defaultCreditBalance */
  balance?: number;
  /** The gauge's top, in credits; the level is the balance against it. @default 5000 */
  capacity?: number;
  /** Credits spent in a typical day, for the forecast. @default 85 */
  burnPerDay?: number;
  /** The refills on offer, in order. @default defaultCreditPresets */
  presets?: CreditPreset[];
  /** Price of one credit when an amount is typed in. @default 0.012 */
  pricePerCredit?: number;
  /** Most credits a typed amount may ask for. @default 10000 */
  customMax?: number;
  /** Controlled selection; null is none. */
  value?: CreditSelection | null;
  /** Initial selection when uncontrolled. @default defaultCreditSelection */
  defaultValue?: CreditSelection | null;
  /** Fires from the press or key that changed the selection, with the credits it adds. */
  onChange?: (value: CreditSelection | null, credits: number) => void;
  /** Controlled auto-refill settings. */
  autoRefill?: CreditAutoRefill;
  /** Initial settings when uncontrolled. @default defaultCreditAutoRefill */
  defaultAutoRefill?: CreditAutoRefill;
  /** The switch, the threshold or the cap changed. */
  onAutoRefillChange?: (autoRefill: CreditAutoRefill) => void;
  /** The refill button was pressed. The host charges and raises `balance`. */
  onRefill?: (refill: CreditRefillEvent) => void;
  /** Recent spends, newest first. @default defaultCreditUsage */
  usage?: CreditUsage[];
  /** Printed before every price. @default "$" */
  currency?: string;
  /** Whether the balance has arrived. @default "ready" */
  status?: CreditStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Credits" */
  title?: string;
  /** The product the credits are spent on, shown under the heading. @default "Coldbrook AI" */
  product?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the controls scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be picked, switched or refilled. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultCreditBalance = 1240;

export const defaultCreditPresets: CreditPreset[] = [
  { id: "p100", credits: 100, price: 1.2 },
  { id: "p500", credits: 500, price: 5.5, note: "Popular" },
  { id: "p2000", credits: 2000, price: 20, note: "Best value" },
];

export const defaultCreditSelection: CreditSelection = {
  kind: "preset",
  id: "p500",
};

export const defaultCreditAutoRefill: CreditAutoRefill = {
  enabled: false,
  threshold: 250,
  monthlyCap: 40,
};

/** A week of Coldbrook AI spend, newest first. */
export const defaultCreditUsage: CreditUsage[] = [
  {
    id: "u1",
    label: "Batch embeddings, 3 files",
    when: "Today 09:12",
    credits: 184,
  },
  { id: "u2", label: "Draft summariser", when: "Today 08:40", credits: 62 },
  { id: "u3", label: "Chat, 14 turns", when: "Today 08:05", credits: 41 },
  { id: "u4", label: "Rerank, search index", when: "Yesterday", credits: 126 },
  {
    id: "u5",
    label: "Image captions, 40 files",
    when: "Yesterday",
    credits: 95,
  },
  { id: "u6", label: "Chat, 9 turns", when: "Yesterday", credits: 28 },
  { id: "u7", label: "Batch embeddings, 1 file", when: "Tuesday", credits: 71 },
  { id: "u8", label: "Draft summariser", when: "Monday", credits: 58 },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<CreditAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

type Density = {
  pad: string;
  py: string;
  gap: string;
  row: string;
  chip: string;
  text: string;
  small: string;
  big: string;
  /** The tank's height and width in the stacked layout, in px. */
  tank: [number, number];
  /** The ring's diameter in the stacked layout, in px. */
  ring: number;
};

const DENSITY: Record<CreditDensity, Density> = {
  compact: {
    pad: "px-3",
    py: "py-2",
    gap: "gap-2",
    row: "h-7",
    chip: "h-10",
    text: "text-[12px]",
    small: "text-[10px]",
    big: "text-[24px]",
    tank: [136, 84],
    ring: 120,
  },
  cozy: {
    pad: "px-4",
    py: "py-3",
    gap: "gap-3",
    row: "h-8",
    chip: "h-11",
    text: "text-[13px]",
    small: "text-[11px]",
    big: "text-[28px]",
    tank: [160, 96],
    ring: 136,
  },
  roomy: {
    pad: "px-5",
    py: "py-4",
    gap: "gap-4",
    row: "h-9",
    chip: "h-12",
    text: "text-[14px]",
    small: "text-[12px]",
    big: "text-[32px]",
    tank: [184, 108],
    ring: 152,
  },
};

const DIGIT_H = 1.25;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const THRESHOLD_STEP = 50;
const CAP_STEP = 10;
const CAP_MAX = 500;
const RING_R = 50;
const RING_C = 60;

const numberFormat = new Intl.NumberFormat("en-US");
const fmtCredits = (n: number) =>
  numberFormat.format(Math.max(0, Math.round(n)));
const fmtMoney = (n: number, currency: string) =>
  `${currency}${(Math.round(n * 100) / 100).toFixed(2)}`;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

const plural = (n: number, one: string, other: string) =>
  n === 1 ? one : other;

/** Credits a selection adds, against the presets on offer. */
export const creditsOf = (
  selection: CreditSelection | null | undefined,
  presets: CreditPreset[],
): number => {
  if (!selection) return 0;
  if (selection.kind === "custom") return Math.max(0, selection.credits);
  return presets.find((p) => p.id === selection.id)?.credits ?? 0;
};

/** What a selection costs: a preset's price, or the typed amount at the unit price. */
export const priceOf = (
  selection: CreditSelection | null | undefined,
  presets: CreditPreset[],
  pricePerCredit: number,
): number => {
  if (!selection) return 0;
  if (selection.kind === "custom") {
    return Math.max(0, selection.credits) * pricePerCredit;
  }
  return presets.find((p) => p.id === selection.id)?.price ?? 0;
};

const daysOf = (credits: number, burnPerDay: number): number | null =>
  burnPerDay > 0 ? Math.floor(credits / burnPerDay) : null;

const forecastWords = (credits: number, burnPerDay: number) => {
  const days = daysOf(credits, burnPerDay);
  if (credits <= 0) return "nothing left";
  if (days === null) return "no usage yet";
  if (days > 999) return "more than 999 days";
  return `about ${days} ${plural(days, "day", "days")}`;
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

/**
 * Rolls every digit of a formatted figure to its new face; separators and
 * the currency sign stay put. Cells are keyed from the right, so the ones
 * place is the same cell before and after a comma appears.
 */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {chars.map((c, i) => {
        const slot = chars.length - 1 - i;
        if (!/\d/.test(c)) {
          return (
            <span key={`s${slot}`} style={{ height: `${DIGIT_H}em` }}>
              {c}
            </span>
          );
        }
        return (
          <span
            key={slot}
            className="relative inline-block overflow-hidden"
            style={{ width: "1ch", height: `${DIGIT_H}em` }}
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: `${-r3(Number(c) * DIGIT_H)}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} style={{ height: `${DIGIT_H}em` }}>
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Gauges                                  */
/* ----------------------------------------------------------------------- */

type GaugeProps = {
  /** The balance as a fraction of the capacity. */
  level: number;
  /** Balance plus the chosen refill, as a fraction. */
  ghost: number;
  /** The auto-refill threshold as a fraction, or null when off. */
  mark: number | null;
  dry: boolean;
  motionSafe: boolean;
};

const pct = (f: number) => `${r3(clamp(f, 0, 1) * 100)}%`;

/**
 * A tank, or a bar: the liquid's height glides to the level, and when it
 * lands the surface of a tank sloshes on recoil. The ghost band sits on top
 * of the liquid and is what the chosen refill would add.
 */
function Tank({
  level,
  ghost,
  mark,
  dry,
  motionSafe,
  variant,
}: GaugeProps & { variant: "tank" | "bar" }) {
  const [wobble, setWobble] = React.useState(0);
  const settled = React.useRef(level);
  const wave = variant === "tank";
  const added = Math.max(0, ghost - level);

  return (
    <div
      aria-hidden
      className={cn(
        "relative h-full w-full overflow-hidden border border-hairline-strong bg-surface-1",
        variant === "tank" ? "rounded-t-3 rounded-b-[18px]" : "rounded-2",
      )}
    >
      {variant === "bar" ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between py-[10%]">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="block h-px w-full bg-card" />
          ))}
        </div>
      ) : null}

      {/* The ghost band: hatched, pinned to the liquid's surface. */}
      <AnimatePresence>
        {added > 0.001 ? (
          <motion.div
            key="ghost"
            className="absolute inset-x-0"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              bottom: pct(level),
              height: pct(added),
            }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? {
                    bottom: springs.glide,
                    height: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : {
                    bottom: { duration: 0 },
                    height: { duration: 0 },
                    opacity: { duration: durations.fast },
                  }
            }
            style={{
              background:
                "repeating-linear-gradient(135deg, color-mix(in oklab, var(--cr-accent) 38%, transparent) 0 3px, color-mix(in oklab, var(--cr-accent) 10%, transparent) 3px 8px)",
              borderTop:
                "1px dashed color-mix(in oklab, var(--cr-accent) 70%, transparent)",
            }}
          />
        ) : null}
      </AnimatePresence>

      {/* The liquid. */}
      <motion.div
        className="absolute inset-x-0 bottom-0"
        initial={false}
        animate={{ height: pct(level) }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        onAnimationComplete={() => {
          if (settled.current === level) return;
          settled.current = level;
          if (motionSafe && wave && level > 0) setWobble((w) => w + 1);
        }}
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in oklab, var(--cr-accent) 82%, white) 0, var(--cr-accent) 18px, color-mix(in oklab, var(--cr-accent) 78%, black) 100%)",
        }}
      >
        {wave && level > 0 ? (
          <div className="absolute inset-x-0 -top-[9px] h-[18px] overflow-hidden">
            <motion.svg
              key={wobble}
              viewBox="0 0 300 12"
              preserveAspectRatio="none"
              className="absolute bottom-0 left-0 h-[12px] w-[300%]"
              style={{ originY: 1 }}
              initial={wobble === 0 ? false : { x: "-66.6%", scaleY: 1.9 }}
              animate={{ x: "-33.3%", scaleY: 1 }}
              transition={springs.recoil}
            >
              <path
                d="M0 6 Q 25 0 50 6 T 100 6 T 150 6 T 200 6 T 250 6 T 300 6 V 12 H 0 Z"
                fill="color-mix(in oklab, var(--cr-accent) 82%, white)"
              />
            </motion.svg>
          </div>
        ) : null}
      </motion.div>

      {/* The auto-refill mark. */}
      <AnimatePresence>
        {mark !== null ? (
          <motion.div
            key="mark"
            className="absolute inset-x-0 z-20 flex items-center"
            initial={{ opacity: 0, bottom: pct(mark) }}
            animate={{ opacity: 1, bottom: pct(mark) }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? {
                    bottom: springs.snap,
                    opacity: { duration: durations.fast },
                  }
                : {
                    bottom: { duration: 0 },
                    opacity: { duration: durations.fast },
                  }
            }
          >
            <span className="block h-0 w-0 border-y-[4px] border-l-[5px] border-y-transparent border-l-warn" />
            <span className="block h-px flex-1 border-t border-dashed border-warn" />
            <span className="block h-0 w-0 border-y-[4px] border-r-[5px] border-y-transparent border-r-warn" />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Dry: a few drops at the bottom and nothing else. */}
      <AnimatePresence>
        {dry ? (
          <motion.div
            key="dry"
            className="absolute inset-x-0 bottom-2 flex justify-center text-warn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            <Droplets className="size-4" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** A ring: the arc draws round to the level on glide; the ghost arc follows. */
function Ring({
  level,
  ghost,
  mark,
  dry,
  motionSafe,
  size,
  children,
}: GaugeProps & { size: number; children: React.ReactNode }) {
  const angle = (f: number) => clamp(f, 0, 1) * Math.PI * 2 - Math.PI / 2;
  const tick = (f: number, inner: number, outer: number) => {
    const a = angle(f);
    return {
      x1: r3(RING_C + Math.cos(a) * inner),
      y1: r3(RING_C + Math.sin(a) * inner),
      x2: r3(RING_C + Math.cos(a) * outer),
      y2: r3(RING_C + Math.sin(a) * outer),
    };
  };
  const t = mark !== null ? tick(mark, RING_R - 9, RING_R + 9) : null;
  const arc = motionSafe ? springs.glide : { duration: 0 };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        aria-hidden
        viewBox="0 0 120 120"
        className="absolute inset-0 h-full w-full -rotate-90"
      >
        <circle
          cx={RING_C}
          cy={RING_C}
          r={RING_R}
          fill="none"
          strokeWidth={10}
          className="stroke-surface-2"
        />
        <motion.circle
          cx={RING_C}
          cy={RING_C}
          r={RING_R}
          fill="none"
          strokeWidth={10}
          strokeLinecap="butt"
          initial={false}
          animate={{
            pathLength: Math.max(0.0001, clamp(ghost, 0, 1)),
            opacity: ghost > level + 0.001 ? 1 : 0,
          }}
          transition={{
            pathLength: arc,
            opacity: { duration: durations.fast },
          }}
          stroke="color-mix(in oklab, var(--cr-accent) 35%, transparent)"
        />
        <motion.circle
          cx={RING_C}
          cy={RING_C}
          r={RING_R}
          fill="none"
          strokeWidth={10}
          strokeLinecap={level > 0.02 && level < 0.98 ? "round" : "butt"}
          initial={false}
          animate={{ pathLength: Math.max(0.0001, clamp(level, 0, 1)) }}
          transition={arc}
          stroke="var(--cr-accent)"
        />
        <AnimatePresence>
          {t ? (
            <motion.line
              key="mark"
              strokeWidth={2}
              strokeLinecap="round"
              className="stroke-warn"
              initial={{ opacity: 0, ...t }}
              animate={{ opacity: 1, ...t }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      x1: springs.snap,
                      y1: springs.snap,
                      x2: springs.snap,
                      y2: springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: 0, opacity: { duration: durations.fast } }
              }
            />
          ) : null}
        </AnimatePresence>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {dry ? (
          <Droplets aria-hidden className="mb-1 size-4 text-warn" />
        ) : null}
        {children}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Controls                                 */
/* ----------------------------------------------------------------------- */

function Switch({
  id,
  checked,
  disabled,
  motionSafe,
  labelledBy,
  describedBy,
  onToggle,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  motionSafe: boolean;
  labelledBy: string;
  describedBy?: string;
  onToggle: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-disabled={disabled || undefined}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors duration-200",
        checked
          ? "border-transparent bg-(--cr-accent)"
          : "border-hairline-strong bg-surface-2",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className={cn(
          "absolute top-[2px] left-[2px] block size-3 rounded-full shadow-[0_1px_2px_color-mix(in_oklab,black_35%,transparent)]",
          checked ? "bg-white" : "bg-ink-2",
        )}
        initial={false}
        animate={{ x: checked ? 14 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
    </button>
  );
}

type SliderProps = {
  labelId: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueText: string;
  disabled: boolean;
  motionSafe: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
};

/** One horizontal slider: drag anywhere on the track, or arrow the thumb. */
function Slider({
  labelId,
  value,
  min,
  max,
  step,
  valueText,
  disabled,
  motionSafe,
  onChange,
  onCommit,
}: SliderProps) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const thumbRef = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<number | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const span = Math.max(1, max - min);
  const frac = clamp((value - min) / span, 0, 1);

  const valueAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return value;
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    return clamp(Math.round((min + x * span) / step) * step, min, max);
  };

  const moveBy = (steps: number) => {
    const next = clamp(
      Math.round((value + steps * step) / step) * step,
      min,
      max,
    );
    if (next !== value) {
      onChange(next);
      onCommit(next);
    }
  };

  const onDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has nothing to capture; the thumb still tracks.
    }
    drag.current = event.pointerId;
    setDragging(true);
    const next = valueAt(event.clientX);
    if (next !== value) onChange(next);
    thumbRef.current?.focus({ preventScroll: true });
  };

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current !== event.pointerId) return;
    // Every move re-renders, so `value` here is the last one committed.
    const next = valueAt(event.clientX);
    if (next !== value) onChange(next);
  };

  const onUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current !== event.pointerId) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Never captured, or nothing to release.
    }
    drag.current = null;
    setDragging(false);
    onCommit(valueAt(event.clientX));
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const big = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        moveBy(big);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        moveBy(-big);
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
        if (value !== min) {
          onChange(min);
          onCommit(min);
        }
        break;
      case "End":
        event.preventDefault();
        if (value !== max) {
          onChange(max);
          onCommit(max);
        }
        break;
      default:
        break;
    }
  };

  const move = dragging || !motionSafe ? { duration: 0 } : springs.snap;

  return (
    <div
      ref={trackRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className={cn(
        "relative h-7 w-full touch-none",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2" />
      <motion.span
        aria-hidden
        className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-(--cr-accent)"
        initial={false}
        animate={{ width: pct(frac) }}
        transition={move}
      />
      <motion.div
        ref={thumbRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKey}
        initial={false}
        animate={{ left: pct(frac) }}
        transition={move}
        className={cn(
          "absolute top-1/2 -mt-2 -ml-2 size-4 rounded-full border-2 bg-card transition-colors",
          dragging ? "border-(--cr-accent)" : "border-ink-2",
          FOCUS_RING,
        )}
      />
    </div>
  );
}

/** A stepper that is one tab stop: arrows change it, the buttons beside it press. */
function Stepper({
  labelId,
  value,
  min,
  max,
  step,
  text,
  valueText,
  disabled,
  motionSafe,
  onChange,
}: {
  labelId: string;
  value: number;
  min: number;
  max: number;
  step: number;
  text: string;
  valueText: string;
  disabled: boolean;
  motionSafe: boolean;
  onChange: (value: number) => void;
}) {
  const go = (next: number) => {
    const v = clamp(Math.round(next / step) * step, min, max);
    if (v !== value && !disabled) onChange(v);
  };
  const onKey = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const big = event.shiftKey ? 5 : 1;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        event.preventDefault();
        go(value + step * big);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        event.preventDefault();
        go(value - step * big);
        break;
      case "PageUp":
        event.preventDefault();
        go(value + step * 5);
        break;
      case "PageDown":
        event.preventDefault();
        go(value - step * 5);
        break;
      case "Home":
        event.preventDefault();
        go(min);
        break;
      case "End":
        event.preventDefault();
        go(max);
        break;
      default:
        break;
    }
  };
  const press = motionSafe ? { scale: 0.92 } : undefined;
  const side =
    "flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

  return (
    <div className="inline-flex h-7 items-center gap-0.5 rounded-2 border border-hairline-strong px-0.5">
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label="Lower the cap"
        aria-disabled={disabled || value <= min || undefined}
        onClick={() => go(value - step)}
        whileTap={press}
        transition={springs.flick}
        className={cn(side, value <= min && "opacity-40")}
      >
        <Minus aria-hidden className="size-3" />
      </motion.button>
      <div
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKey}
        className={cn(
          "flex h-6 min-w-[4.5rem] items-center justify-center rounded-1 px-1 font-mono text-[12px] tabular-nums",
          FOCUS_RING,
        )}
      >
        <Roll text={text} motionSafe={motionSafe} />
      </div>
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label="Raise the cap"
        aria-disabled={disabled || value >= max || undefined}
        onClick={() => go(value + step)}
        whileTap={press}
        transition={springs.flick}
        className={cn(side, value >= max && "opacity-40")}
      >
        <Plus aria-hidden className="size-3" />
      </motion.button>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A credits balance with its refill beneath. The balance stands in a tall
 * tank: its liquid glides to the level on `springs.glide` and, when it
 * lands, the surface sloshes once on `springs.recoil`. Under the tank are
 * the refills: three presets as a radio group and an amount of your own.
 * Picking one pours it in before it is bought — a hatched ghost band rises
 * on glide above the liquid for the part being added, the price rolls on
 * `springs.snap`, and the forecast's days roll with it. The refill button
 * hands the host the amount; when the host raises the balance the ghost
 * becomes liquid and the surface sloshes.
 *
 * An auto-refill switch (snap) reveals a threshold slider and a monthly cap
 * on glide; the threshold is also an amber mark on the tank that follows the
 * thumb on snap. Below, recent usage as rows with a tiny bar each.
 *
 * Keyboard: arrows move between presets and select them, the amount is a
 * text field, Space flips the switch, arrows (Shift for ten) and Home/End
 * work the slider and the cap, and every change is announced in words.
 * Under reduced motion the liquid is placed, the band cross-fades in and
 * nothing sloshes or rolls; every figure still changes.
 */
export function CreditRefill({
  gauge = "tank",
  density = "cozy",
  accent = "cobalt",
  balance = defaultCreditBalance,
  capacity = 5000,
  burnPerDay = 85,
  presets = defaultCreditPresets,
  pricePerCredit = 0.012,
  customMax = 10000,
  value,
  defaultValue = defaultCreditSelection,
  onChange,
  autoRefill,
  defaultAutoRefill = defaultCreditAutoRefill,
  onAutoRefillChange,
  onRefill,
  usage = defaultCreditUsage,
  currency = "$",
  status = "ready",
  onRetry,
  title = "Credits",
  product = "Coldbrook AI",
  label,
  height = 540,
  disabled = false,
  className,
}: CreditRefillProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const presetsId = `${uid}-presets`;
  const customId = `${uid}-custom`;
  const autoId = `${uid}-auto`;
  const autoHintId = `${uid}-auto-hint`;
  const thresholdId = `${uid}-threshold`;
  const capId = `${uid}-cap`;
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [own, setOwn] = React.useState<CreditSelection | null>(defaultValue);
  const selection = value === undefined ? own : value;
  const [ownAuto, setOwnAuto] =
    React.useState<CreditAutoRefill>(defaultAutoRefill);
  const auto = autoRefill ?? ownAuto;
  // Null shows the controlled custom amount; a string is what was typed.
  const [customText, setCustomText] = React.useState<string | null>(null);
  const [activePreset, setActivePreset] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const presetNodes = React.useRef(new Map<string, HTMLButtonElement>());

  const ready = status === "ready";
  const inert = disabled || !ready;
  const D = DENSITY[density];

  /* -------------------------------- data ------------------------------- */

  const safeBalance = Math.max(0, balance);
  const safeCapacity = Math.max(1, capacity);
  const added = creditsOf(selection, presets);
  const price = priceOf(selection, presets, pricePerCredit);
  const after = safeBalance + added;
  const level = safeBalance / safeCapacity;
  const ghost = after / safeCapacity;
  const dry = ready && safeBalance <= 0;
  const forecast = forecastWords(after, burnPerDay);
  const days = daysOf(after, burnPerDay);
  const maxUsage = usage.reduce((m, u) => Math.max(m, u.credits), 0);
  const thresholdMax = Math.max(THRESHOLD_STEP, Math.round(safeCapacity / 2));
  const threshold = clamp(auto.threshold, 0, thresholdMax);
  const mark = auto.enabled ? threshold / safeCapacity : null;

  const selectedPreset = selection?.kind === "preset" ? selection.id : null;
  const customValue =
    customText ??
    (selection?.kind === "custom" ? String(selection.credits) : "");
  const customCredits = clamp(
    Number.parseInt(customValue || "0", 10) || 0,
    0,
    customMax,
  );
  const roving = selectedPreset ?? activePreset ?? presets[0]?.id ?? null;

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: CreditSelection | null) => {
    if (value === undefined) setOwn(next);
    const credits = creditsOf(next, presets);
    onChange?.(next, credits);
    if (!next || credits <= 0) {
      setAnnouncement(
        `Nothing selected. Balance ${fmtCredits(safeBalance)} credits, ${forecastWords(safeBalance, burnPerDay)}.`,
      );
      return;
    }
    const cost = priceOf(next, presets, pricePerCredit);
    const total = safeBalance + credits;
    setAnnouncement(
      `${fmtCredits(credits)} credits for ${fmtMoney(cost, currency)}. Balance would be ${fmtCredits(total)} credits, ${forecastWords(total, burnPerDay)}.`,
    );
  };

  const pickPreset = (id: string) => {
    if (inert) return;
    setActivePreset(id);
    setCustomText("");
    if (selectedPreset === id) return;
    commit({ kind: "preset", id });
  };

  const typeCustom = (text: string) => {
    if (inert) return;
    const digits = text.replace(/[^\d]/g, "").slice(0, 7);
    setCustomText(digits);
    const credits = clamp(
      Number.parseInt(digits || "0", 10) || 0,
      0,
      customMax,
    );
    if (credits > 0) {
      if (selection?.kind === "custom" && selection.credits === credits) return;
      commit({ kind: "custom", credits });
    } else if (selection?.kind === "custom") {
      commit(null);
    }
  };

  const commitAuto = (next: CreditAutoRefill, words: string) => {
    if (autoRefill === undefined) setOwnAuto(next);
    onAutoRefillChange?.(next);
    setAnnouncement(words);
  };

  const capWords = (cap: number) =>
    cap > 0
      ? `up to ${fmtMoney(cap, currency)} a month`
      : "with no monthly cap";

  const toggleAuto = () => {
    if (inert) return;
    const next = { ...auto, threshold, enabled: !auto.enabled };
    commitAuto(
      next,
      next.enabled
        ? `Auto-refill on. Refills when the balance drops below ${fmtCredits(threshold)} credits, ${capWords(next.monthlyCap)}.`
        : "Auto-refill off.",
    );
  };

  const setThreshold = (next: number, announce: boolean) => {
    if (inert) return;
    const t = clamp(next, 0, thresholdMax);
    if (t === auto.threshold && !announce) return;
    const settings = { ...auto, threshold: t };
    if (autoRefill === undefined) setOwnAuto(settings);
    onAutoRefillChange?.(settings);
    if (announce) {
      setAnnouncement(`Refills below ${fmtCredits(t)} credits.`);
    }
  };

  const setCap = (cap: number) => {
    if (inert) return;
    commitAuto(
      { ...auto, threshold, monthlyCap: cap },
      cap > 0 ? `Monthly cap ${fmtMoney(cap, currency)}.` : "No monthly cap.",
    );
  };

  const refill = () => {
    if (inert || !selection || added <= 0) return;
    onRefill?.({ credits: added, price, selection });
    setAnnouncement(
      `Adding ${fmtCredits(added)} credits for ${fmtMoney(price, currency)}.`,
    );
    if (value === undefined) setOwn(null);
    setCustomText("");
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onPresetKey = (event: React.KeyboardEvent, id: string) => {
    const ids = presets.map((p) => p.id);
    const i = ids.indexOf(id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      to = (i + 1) % ids.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      to = (i - 1 + ids.length) % ids.length;
    } else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = ids.length - 1;
    else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      pickPreset(id);
      return;
    } else return;
    event.preventDefault();
    const target = ids[to];
    if (!target) return;
    presetNodes.current.get(target)?.focus();
    pickPreset(target);
  };

  /* ------------------------------- render ------------------------------ */

  const bigNumber = (
    <>
      <span className="sr-only">
        {fmtCredits(safeBalance)} credits
        {added > 0 ? `, ${fmtCredits(after)} after the refill` : ""}
      </span>
      <span
        className={cn(
          "flex items-baseline gap-1.5 font-mono font-medium text-foreground",
          D.big,
        )}
      >
        <Roll text={fmtCredits(safeBalance)} motionSafe={motionSafe} />
        <AnimatePresence initial={false}>
          {added > 0 ? (
            <motion.span
              key="added"
              aria-hidden
              className="inline-flex text-[0.5em] text-(--cr-accent)"
              initial={{ opacity: 0, x: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <Roll text={`+${fmtCredits(added)}`} motionSafe={motionSafe} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
    </>
  );

  const forecastLine = (
    <p className={cn("text-ink-2", D.small)}>
      <span className="sr-only">
        Lasts {forecast} at {fmtCredits(burnPerDay)} credits a day.
      </span>
      <span
        aria-hidden
        className="inline-flex flex-wrap items-baseline gap-x-1"
      >
        {after <= 0 ? (
          <span className="text-warn">Nothing left</span>
        ) : days === null ? (
          <span>No usage yet</span>
        ) : (
          <>
            <span>Lasts about</span>
            <Roll
              text={days > 999 ? "999+" : String(days)}
              motionSafe={motionSafe}
              className="font-mono text-foreground"
            />
            <span>{plural(days, "day", "days")}</span>
          </>
        )}
        {burnPerDay > 0 ? (
          <span className="text-ink-3">
            at {fmtCredits(burnPerDay)}
            <span className="hidden @min-[22rem]:inline"> credits</span>/day
          </span>
        ) : null}
      </span>
    </p>
  );

  const dryNote = (
    <AnimatePresence initial={false}>
      {dry ? (
        <motion.p
          key="dry-note"
          className={cn(
            "flex items-start gap-1.5 rounded-2 border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-2 py-1.5 text-warn",
            D.small,
          )}
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { ...springs.snap, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
        >
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>
            The balance is empty. {product} calls stop until it is refilled.
          </span>
        </motion.p>
      ) : null}
    </AnimatePresence>
  );

  const gaugeStyle = {
    ["--cr-accent" as string]: ACCENTS[accent] ?? ACCENTS.cobalt,
  };

  const figures = (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 @min-[40rem]:items-center @min-[40rem]:text-center">
      <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Balance
      </span>
      {bigNumber}
      {forecastLine}
      <div className="w-full @min-[40rem]:text-left">{dryNote}</div>
    </div>
  );

  const gaugePanel =
    gauge === "ring" ? (
      <div className="flex items-center gap-4 @min-[40rem]:flex-col @min-[40rem]:justify-center">
        <Ring
          level={level}
          ghost={ghost}
          mark={mark}
          dry={dry}
          motionSafe={motionSafe}
          size={D.ring}
        >
          <span className="sr-only">
            {Math.round(level * 100)} percent full
          </span>
          <span
            aria-hidden
            className="font-mono text-[11px] text-ink-2 tabular-nums"
          >
            {Math.round(level * 100)}%
          </span>
        </Ring>
        {figures}
      </div>
    ) : (
      <div className="flex items-stretch gap-4 @min-[40rem]:h-full @min-[40rem]:flex-col @min-[40rem]:items-center">
        <div
          className="shrink-0 @min-[40rem]:min-h-0 @min-[40rem]:flex-1"
          style={{ height: D.tank[0], width: D.tank[1] }}
        >
          <div className="h-full w-full @min-[40rem]:h-full">
            <Tank
              level={level}
              ghost={ghost}
              mark={mark}
              dry={dry}
              motionSafe={motionSafe}
              variant={gauge}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center @min-[40rem]:w-full @min-[40rem]:flex-none">
          {figures}
        </div>
      </div>
    );

  const presetGroup = (
    <div className={cn("flex flex-col", D.gap)}>
      <span
        id={presetsId}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        Refill
      </span>
      <div
        role="radiogroup"
        aria-labelledby={presetsId}
        className="grid grid-cols-3 gap-1.5"
      >
        {presets.map((p) => {
          const checked = selectedPreset === p.id;
          return (
            <button
              key={p.id}
              ref={(node) => {
                if (node) presetNodes.current.set(p.id, node);
                else presetNodes.current.delete(p.id);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${fmtCredits(p.credits)} credits for ${fmtMoney(p.price, currency)}${p.note ? `, ${p.note.toLowerCase()}` : ""}`}
              aria-disabled={inert || undefined}
              tabIndex={roving === p.id ? 0 : -1}
              onFocus={() => setActivePreset(p.id)}
              onClick={() => pickPreset(p.id)}
              onKeyDown={(event) => onPresetKey(event, p.id)}
              className={cn(
                "relative flex min-w-0 flex-col items-start justify-center rounded-2 border px-2 text-left transition-colors duration-200",
                D.chip,
                checked
                  ? "border-[color-mix(in_oklab,var(--cr-accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--cr-accent)_12%,transparent)]"
                  : "border-hairline-strong hover:bg-surface-2",
                inert ? "cursor-not-allowed" : "cursor-pointer",
                FOCUS_RING,
              )}
            >
              <span
                className={cn(
                  "flex w-full items-center gap-1 font-mono tabular-nums",
                  D.text,
                  checked ? "text-foreground" : "text-ink",
                )}
              >
                <span className="truncate">{fmtCredits(p.credits)}</span>
                {checked ? (
                  <svg
                    aria-hidden
                    viewBox="0 0 14 14"
                    className="ml-auto size-3 shrink-0 text-(--cr-accent)"
                  >
                    <motion.path
                      d="M3 7.4 5.8 10 11 4.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={motionSafe && live ? { pathLength: 0 } : false}
                      animate={{ pathLength: 1 }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    />
                  </svg>
                ) : null}
              </span>
              <span
                className={cn(
                  "flex w-full min-w-0 items-baseline gap-1 text-ink-3",
                  D.small,
                )}
              >
                <span className="font-mono tabular-nums">
                  {fmtMoney(p.price, currency)}
                </span>
                {p.note ? (
                  <span className="hidden truncate @min-[24rem]:inline">
                    {p.note}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={customId} className="sr-only">
          Custom amount in credits
        </label>
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded-2 border px-2 transition-colors duration-200",
            D.row,
            selection?.kind === "custom"
              ? "border-[color-mix(in_oklab,var(--cr-accent)_55%,transparent)]"
              : "border-hairline-strong",
          )}
        >
          <input
            id={customId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Custom"
            value={customValue}
            disabled={inert}
            onChange={(event) => typeCustom(event.target.value)}
            onFocus={() => {
              if (customText === null && selection?.kind !== "custom") {
                setCustomText("");
              }
            }}
            className={cn(
              "min-w-0 flex-1 bg-transparent font-mono tabular-nums outline-none placeholder:text-ink-3",
              D.text,
              inert && "cursor-not-allowed",
            )}
          />
          <span className={cn("shrink-0 text-ink-3", D.small)}>credits</span>
        </div>
        <span
          className={cn(
            "shrink-0 font-mono tabular-nums",
            D.small,
            customCredits > 0 ? "text-ink-2" : "text-ink-3",
          )}
        >
          <span className="sr-only">
            {fmtMoney(customCredits * pricePerCredit, currency)}
          </span>
          <Roll
            text={fmtMoney(customCredits * pricePerCredit, currency)}
            motionSafe={motionSafe}
          />
        </span>
      </div>
      <motion.button
        type="button"
        onClick={refill}
        aria-disabled={inert || added <= 0 || undefined}
        whileTap={
          motionSafe && !inert && added > 0 ? { scale: 0.98 } : undefined
        }
        transition={springs.flick}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-2 border transition-colors duration-200",
          D.row,
          D.text,
          !inert && added > 0
            ? "border-transparent bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary)_88%,black)]"
            : "cursor-default border-hairline bg-surface-1 text-ink-3",
          FOCUS_RING,
        )}
      >
        {added > 0 ? (
          <>
            <span className="sr-only">
              Add {fmtCredits(added)} credits for {fmtMoney(price, currency)}
            </span>
            <span aria-hidden className="inline-flex items-baseline gap-1">
              <span>Add</span>
              <Roll
                text={fmtCredits(added)}
                motionSafe={motionSafe}
                className="font-mono"
              />
              <span>credits</span>
            </span>
            <span aria-hidden className="opacity-60">
              ·
            </span>
            <Roll
              text={fmtMoney(price, currency)}
              motionSafe={motionSafe}
              className="font-mono"
            />
          </>
        ) : (
          <span>Pick an amount</span>
        )}
      </motion.button>
    </div>
  );

  const autoPanel = (
    <div className={cn("flex flex-col", D.gap)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span
            id={`${autoId}-label`}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Auto-refill
          </span>
          <span id={autoHintId} className={cn("truncate text-ink-2", D.small)}>
            {auto.enabled
              ? `Below ${fmtCredits(threshold)}, ${capWords(auto.monthlyCap)}`
              : "Top up when the balance runs low"}
          </span>
        </div>
        <Switch
          id={autoId}
          checked={auto.enabled}
          disabled={inert}
          motionSafe={motionSafe}
          labelledBy={`${autoId}-label`}
          describedBy={autoHintId}
          onToggle={toggleAuto}
        />
      </div>
      <AnimatePresence initial={false}>
        {auto.enabled ? (
          <motion.div
            key="auto-body"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: motionSafe
                ? exitFor(durations.base)
                : { height: { duration: 0 }, opacity: exitFor(durations.fast) },
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : {
                    height: { duration: 0 },
                    opacity: { duration: durations.fast },
                  }
            }
          >
            <div className={cn("flex flex-col pt-1", D.gap)}>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span id={thresholdId} className={cn("text-ink-2", D.small)}>
                    Refill below
                  </span>
                  <span
                    className={cn(
                      "font-mono text-foreground tabular-nums",
                      D.small,
                    )}
                  >
                    <span className="sr-only">
                      {fmtCredits(threshold)} credits
                    </span>
                    <Roll
                      text={fmtCredits(threshold)}
                      motionSafe={motionSafe}
                    />{" "}
                    <span aria-hidden className="text-ink-3">
                      credits
                    </span>
                  </span>
                </div>
                <Slider
                  labelId={thresholdId}
                  value={threshold}
                  min={0}
                  max={thresholdMax}
                  step={THRESHOLD_STEP}
                  valueText={`${fmtCredits(threshold)} credits`}
                  disabled={inert}
                  motionSafe={motionSafe}
                  onChange={(v) => setThreshold(v, false)}
                  onCommit={(v) => setThreshold(v, true)}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span id={capId} className={cn("text-ink-2", D.small)}>
                  Monthly cap
                </span>
                <Stepper
                  labelId={capId}
                  value={clamp(auto.monthlyCap, 0, CAP_MAX)}
                  min={0}
                  max={CAP_MAX}
                  step={CAP_STEP}
                  text={
                    auto.monthlyCap > 0
                      ? fmtMoney(auto.monthlyCap, currency)
                      : "none"
                  }
                  valueText={
                    auto.monthlyCap > 0
                      ? `${fmtMoney(auto.monthlyCap, currency)} a month`
                      : "no cap"
                  }
                  disabled={inert}
                  motionSafe={motionSafe}
                  onChange={setCap}
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const step = cascade(Math.min(usage.length, 10));
  const usageList = (
    <div className={cn("flex flex-col", D.gap)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Recent usage
        </span>
        <span className={cn("font-mono text-ink-3 tabular-nums", D.small)}>
          {fmtCredits(usage.reduce((s, u) => s + u.credits, 0))} total
        </span>
      </div>
      {usage.length === 0 ? (
        <p className={cn("text-ink-3", D.small)}>Nothing spent yet.</p>
      ) : (
        <ul role="list" className="flex flex-col gap-1">
          {usage.map((u, i) => {
            const share = maxUsage > 0 ? u.credits / maxUsage : 0;
            return (
              <li
                key={u.id}
                className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-x-2 gap-y-0.5"
              >
                <span
                  className={cn("flex min-w-0 items-baseline gap-1.5", D.small)}
                >
                  <span className="truncate text-foreground">{u.label}</span>
                  <span className="shrink-0 text-ink-3">{u.when}</span>
                </span>
                <span
                  className={cn(
                    "text-right font-mono text-ink-2 tabular-nums",
                    D.small,
                  )}
                >
                  {fmtCredits(u.credits)}
                </span>
                <span
                  aria-hidden
                  className="col-span-2 block h-1 overflow-hidden rounded-full bg-surface-2"
                >
                  <motion.span
                    className="block h-full rounded-full bg-(--cr-accent)"
                    style={{ originX: 0, width: pct(share) }}
                    initial={motionSafe ? { scaleX: 0 } : false}
                    animate={{ scaleX: 1 }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.glide,
                            delay: r3(Math.min(i, 10) * step),
                          }
                        : { duration: 0 }
                    }
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const skeleton = (
    <div aria-hidden className={cn("flex flex-col", D.gap, D.pad, D.py)}>
      <div className="flex items-stretch gap-4">
        <span
          className="shrink-0 rounded-3 bg-surface-2 motion-safe:animate-pulse"
          style={{ height: D.tank[0], width: D.tank[1] }}
        />
        <div className="flex flex-1 flex-col justify-center gap-2">
          <span className="h-3 w-14 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
          <span className="h-7 w-28 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
          <span className="h-3 w-36 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "rounded-2 bg-surface-2 motion-safe:animate-pulse",
              D.chip,
            )}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
      <span
        className={cn(
          "rounded-2 bg-surface-2 motion-safe:animate-pulse",
          D.row,
        )}
      />
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 110}ms` }}
        />
      ))}
    </div>
  );

  const failed = (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <TriangleAlert aria-hidden className="size-5 text-danger" />
      <p className="text-sm text-foreground">The balance didn&apos;t load.</p>
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
  );

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
      style={{ height, ...gaugeStyle }}
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 border-b border-hairline pt-3 pb-2.5",
          D.pad,
        )}
      >
        <div className="flex min-w-0 flex-col">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {product}
          </p>
        </div>
        <AnimatePresence initial={false}>
          {ready && auto.enabled ? (
            <motion.span
              key="auto-badge"
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--success)_40%,transparent)] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] px-2 font-mono text-[10px] tracking-[0.08em] text-success uppercase"
              initial={{ opacity: 0, scale: motionSafe ? 0.9 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <Check aria-hidden className="size-3" />
              Auto
            </motion.span>
          ) : null}
        </AnimatePresence>
      </header>

      {status === "loading" ? (
        skeleton
      ) : status === "error" ? (
        failed
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @min-[40rem]:overflow-hidden">
          <div
            className={cn(
              "sticky top-0 z-10 shrink-0 border-b border-hairline bg-card @min-[40rem]:static @min-[40rem]:flex @min-[40rem]:min-h-0 @min-[40rem]:flex-col @min-[40rem]:border-r @min-[40rem]:border-b-0",
              D.pad,
              D.py,
            )}
          >
            {gaugePanel}
          </div>
          <div
            className={cn(
              "flex flex-col @min-[40rem]:min-h-0 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain",
              D.pad,
              D.py,
              density === "compact"
                ? "gap-4"
                : density === "cozy"
                  ? "gap-5"
                  : "gap-6",
            )}
          >
            {presetGroup}
            <span aria-hidden className="block h-px w-full bg-hairline" />
            {autoPanel}
            <span aria-hidden className="block h-px w-full bg-hairline" />
            {usageList}
          </div>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
