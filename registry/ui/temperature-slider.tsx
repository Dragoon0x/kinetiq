"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TemperatureSample = {
  /** The sentence at this temperature. */
  sentence: string;
  /** Slots showing a variant other than their steadiest. */
  swapped: number;
};

export type TemperatureSliderProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled temperature. */
  value?: number;
  /** Initial temperature for uncontrolled usage. @default 0.7 */
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Fires with the value: the sentence the sample now reads and how many slots swapped. */
  onSampleChange?: (sample: TemperatureSample) => void;
  /** @default 0 */
  min?: number;
  /** @default 2 */
  max?: number;
  /** @default 0.1 */
  step?: number;
  /** Word slots; each slot's variants run steady to wild. */
  sample: string[][];
  /** Names the slider. */
  label: string;
  /** Readout and `aria-valuetext`. @default one decimal */
  format?: (value: number) => string;
  className?: string;
};

/** Pointer travel before a press becomes a drag. */
const SLOP = 4;
/** How long the value must be still before the sample is spoken. */
const SETTLE_MS = 500;

const round3 = (n: number) => Number(n.toFixed(3));
const round6 = (n: number) => Number(n.toFixed(6));

/**
 * Cool to warm through the house tokens: cobalt to warn over the first half,
 * warn to danger over the second. Whole percentages so the string is stable
 * between server and client.
 */
const warmth = (t: number): string => {
  if (t < 0.5) {
    const pct = 100 - Math.round(t * 200);
    return `color-mix(in oklch, var(--accent-bright) ${pct}%, var(--warn))`;
  }
  const pct = 100 - Math.round((t - 0.5) * 200);
  return `color-mix(in oklch, var(--warn) ${pct}%, var(--danger))`;
};

/**
 * Which variant a slot shows. Each slot crosses to its next variant at its
 * own threshold — a fixed phase from its index — so words flip one at a time
 * as the thumb warms rather than all at once; at the coldest every slot is
 * steady and at the hottest every slot is wild.
 */
const variantAt = (slot: string[], t: number, index: number): number => {
  const count = slot.length;
  if (count <= 1) return 0;
  const phase = ((index * 37) % 11) / 11;
  return Math.min(count - 1, Math.max(0, Math.floor(t * (count - 1 + phase))));
};

const zoneOf = (t: number): string =>
  t < 1 / 3 ? "Steady" : t < 2 / 3 ? "Varied" : "Wild";

/** The sentence at a temperature, slot by slot, and how many slots swapped. */
const sampleAt = (slots: string[][], t: number) => {
  const words = slots.map((slot, index) => {
    const variant = variantAt(slot, t, index);
    return { index, variant, word: slot[variant] ?? slot[0] ?? "" };
  });
  return {
    words,
    sentence: words.map((entry) => entry.word).join(" "),
    swapped: words.filter((entry) => entry.variant > 0).length,
  };
};

/**
 * Colder is steadier. The track runs cool cobalt to warm danger through warn
 * — the full gradient sits faint beneath and a clipped copy fills to the
 * thumb, so the colour at the thumb is the temperature, and the thumb's ring
 * and the readout take that same colour. The thumb and fill glide on `glide`
 * when set by a click, a key or a host, and track the pointer 1:1 while
 * dragging (captured only after 4px of travel). Beside it a sample sentence
 * re-renders: each word slot holds variants ordered steady to wild and flips
 * at its own threshold, the new word rising from `distances.nudge` on `snap`
 * under a wash of the track colour that fades as it settles.
 *
 * The thumb is a `role="slider"`: arrows step, PageUp and PageDown step ten,
 * Home and End jump. The sentence is spoken once the value has been still
 * for half a second — never per step. Under reduced motion the thumb and
 * clip tween without travel and words cross-fade by opacity alone.
 */
export function TemperatureSlider({
  ref,
  value,
  defaultValue = 0.7,
  onValueChange,
  onSampleChange,
  min = 0,
  max = 2,
  step = 0.1,
  sample,
  label,
  format,
  className,
}: TemperatureSliderProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const span = Math.max(max - min, Number.EPSILON);
  const stepSafe = step > 0 ? step : 0.1;
  const decimals = Math.min(6, (String(stepSafe).split(".")[1] ?? "").length);
  const fmt = format ?? ((v: number) => v.toFixed(decimals));

  const snapTo = React.useCallback(
    (v: number) =>
      round6(
        Math.min(
          max,
          Math.max(min, min + Math.round((v - min) / stepSafe) * stepSafe),
        ),
      ),
    [min, max, stepSafe],
  );

  const [uncontrolled, setUncontrolled] = React.useState(() =>
    snapTo(defaultValue),
  );
  const current = snapTo(value ?? uncontrolled);
  const t = round6((current - min) / span);
  const pct = round3(t * 100);
  const tone = warmth(t);
  const zone = zoneOf(t);

  const { words, sentence } = sampleAt(sample, t);

  const [dragging, setDragging] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const thumbRef = React.useRef<HTMLSpanElement | null>(null);
  const gesture = React.useRef<{
    id: number;
    startX: number;
    dragging: boolean;
  } | null>(null);

  const commit = (raw: number) => {
    const next = snapTo(raw);
    setTouched(true);
    if (next === current) return;
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
    if (onSampleChange) {
      const { sentence: said, swapped } = sampleAt(sample, (next - min) / span);
      onSampleChange({ sentence: said, swapped });
    }
  };

  // Spoken on settle: the timer restarts on every change and only the last
  // one lands, so a drag reads as one sentence rather than a word per step.
  React.useEffect(() => {
    if (!touched) return;
    const timer = window.setTimeout(
      () => setAnnounce(`Sample: ${sentence}`),
      SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [touched, sentence]);

  const valueFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return current;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return min + frac * span;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dragging: false,
    };
    commit(valueFromClientX(event.clientX));
    thumbRef.current?.focus({ preventScroll: true });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      setDragging(true);
      try {
        // Capture only once the press has become a drag, so a plain click
        // is never swallowed and a synthetic sweep cannot throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    commit(valueFromClientX(event.clientX));
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Nothing to release.
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = current + stepSafe;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = current - stepSafe;
        break;
      case "PageUp":
        next = current + stepSafe * 10;
        break;
      case "PageDown":
        next = current - stepSafe * 10;
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
    commit(next);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  // The fill still fills under reduced motion — it is the reading — but the
  // thumb, a thing that travels, swaps to its place at once.
  const fillSettle = dragging
    ? { duration: 0 }
    : motionSafe
      ? springs.glide
      : { duration: durations.fast, ease: easings.move };
  const thumbSettle = dragging || !motionSafe ? { duration: 0 } : springs.glide;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums">
          <span
            aria-hidden
            className="font-medium transition-colors"
            style={{ color: tone }}
          >
            {fmt(current)}
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={zone}
              aria-hidden
              className="text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {zone}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      {/* The hit area is taller than the track so a finger lands; the
          gradient is drawn once faint and once clipped to the value. */}
      <div
        className="relative flex h-6 cursor-pointer touch-none items-center select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
      >
        <div
          ref={trackRef}
          aria-hidden
          className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <span className="absolute inset-0 rounded-full bg-linear-to-r from-cobalt-bright via-warn to-danger opacity-25" />
          <motion.span
            className="absolute inset-0 rounded-full bg-linear-to-r from-cobalt-bright via-warn to-danger"
            initial={false}
            animate={{ clipPath: `inset(0 ${round3(100 - pct)}% 0 0)` }}
            transition={fillSettle}
          />
        </div>
        <motion.span
          className="absolute top-1/2 left-0"
          initial={false}
          animate={{ left: `${pct}%` }}
          transition={thumbSettle}
        >
          <span
            ref={thumbRef}
            role="slider"
            tabIndex={0}
            aria-labelledby={labelId}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={current}
            aria-valuetext={`${fmt(current)}, ${zone.toLowerCase()}`}
            aria-orientation="horizontal"
            onKeyDown={handleKeyDown}
            style={{ borderColor: tone }}
            className={cn(
              "block size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface-0 shadow-sm transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          />
        </motion.span>
      </div>

      {/* The animated sentence is decorative; the plain one beneath it is
          what assistive technology reads, without two copies of a word
          mid-swap. */}
      <p aria-hidden className="text-sm leading-6 text-foreground">
        {words.map((entry) => (
          <React.Fragment key={entry.index}>
            {entry.index > 0 ? " " : null}
            <span className="relative inline-block">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={entry.variant}
                  className="relative isolate inline-block whitespace-nowrap"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe ? { ...springs.snap, opacity: fade } : fade
                  }
                >
                  {entry.variant > 0 ? (
                    <motion.span
                      aria-hidden
                      className="absolute -inset-x-0.5 inset-y-0 -z-10 rounded-1"
                      style={{ backgroundColor: tone }}
                      initial={{ opacity: 0.35 }}
                      animate={{ opacity: 0 }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.exit,
                      }}
                    />
                  ) : null}
                  {entry.word}
                </motion.span>
              </AnimatePresence>
            </span>
          </React.Fragment>
        ))}
      </p>
      <p className="sr-only">{sentence}</p>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
