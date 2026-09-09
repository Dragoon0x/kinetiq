"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TokenBudgetProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled cap in tokens. */
  value?: number;
  /** Initial cap for uncontrolled usage. @default 1024 */
  defaultValue?: number;
  /** Fires from a drag, a track press or an arrow key. */
  onValueChange?: (value: number) => void;
  /** Fires once the cap has been still for half a second. */
  onSettle?: (value: number) => void;
  /** Tokens the host expects the reply to need; shaded inside the cap, hatched past it. @default 0 */
  estimate?: number;
  /** @default 64 */
  min?: number;
  /** The track's full length. @default 4096 */
  max?: number;
  /** Arrow-key step; drags snap to it. @default 64 */
  step?: number;
  /** Names the slider. */
  label: string;
  /** Readout and `aria-valuetext`. @default en-US grouping */
  format?: (tokens: number) => string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
/** Pointer travel before a press becomes a drag. */
const SLOP = 4;
/** How long the cap must be still before it is spoken. */
const SETTLE_MS = 500;
const grouped = new Intl.NumberFormat("en-US");
const defaultFormat = (tokens: number) => grouped.format(tokens);
const round3 = (n: number) => Number(n.toFixed(3));

/** Truncation is drawn as a warn hatch, so it survives both themes and colour blindness. */
const HATCH =
  "repeating-linear-gradient(-45deg, var(--warn) 0 2px, transparent 2px 5px)";

/** Digits that roll on `snap`; hidden because the slider's value text carries the number. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity.
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A max-tokens control whose bar tells the truth about how much of the cap
 * will be spent. The bar is the slider's track: a thumb sets the cap, and
 * inside the track a pale fill reaches the cap while a solid fill reaches the
 * host's estimate of the reply — the portion likely used. Both fills settle
 * on `glide`, a quantity coming to rest; the thumb tracks a drag directly and
 * travels on `snap` for a key step or a track press. When the estimate passes
 * the cap the overflow is hatched warn from the thumb to the estimate and a
 * "cut" chip lands on `flick`, so truncation reads in words and texture, not
 * colour alone. The cap and the estimate roll their digits on `snap`.
 *
 * The thumb is a slider: arrows step, Page keys move four steps, Home and End
 * jump; a press on the track jumps there and a drag captures the pointer
 * only after four pixels of travel. The status region speaks the cap and the
 * estimate once they have been still for half a second, never per key.
 * Under reduced motion fills and thumb tween, digits swap, the chip fades.
 */
export function TokenBudget({
  ref,
  value,
  defaultValue = 1024,
  onValueChange,
  onSettle,
  estimate = 0,
  min = 64,
  max = 4096,
  step = 64,
  label,
  format = defaultFormat,
  className,
}: TokenBudgetProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const thumbRef = React.useRef<HTMLButtonElement | null>(null);
  const drag = React.useRef<{
    id: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  const span = Math.max(1, max);
  const clamp = (n: number) => {
    const snapped = Math.round((n - min) / step) * step + min;
    return Math.min(max, Math.max(min, snapped));
  };

  const [uncontrolled, setUncontrolled] = React.useState(() =>
    clamp(defaultValue),
  );
  const current = clamp(value ?? uncontrolled);
  const [dragging, setDragging] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const likely = Math.max(0, Math.round(estimate));
  const cut = likely > current;
  const capPct = round3((current / span) * 100);
  const usedPct = round3((Math.min(likely, current) / span) * 100);
  const overPct = round3(
    (Math.max(0, Math.min(likely, span) - current) / span) * 100,
  );
  const usedShare =
    likely === 0 || current <= 0
      ? 0
      : Math.min(100, Math.round((likely / current) * 100));

  const valueText =
    likely === 0
      ? `${format(current)} tokens`
      : cut
        ? `${format(current)} tokens, reply cut at ${format(current)}`
        : `${format(current)} tokens, about ${format(likely)} likely used`;

  const commit = (next: number) => {
    const clamped = clamp(next);
    if (clamped === current) return;
    if (value === undefined) setUncontrolled(clamped);
    onValueChange?.(clamped);
  };

  // The settle timer restarts on every change and fires only when the cap
  // and the estimate have held still; the ref remembers what was last seen so
  // a re-render with nothing new never speaks.
  const onSettleRef = React.useRef(onSettle);
  React.useEffect(() => {
    onSettleRef.current = onSettle;
  });
  const seen = React.useRef({ value: current, estimate: likely });
  React.useEffect(() => {
    const prev = seen.current;
    if (prev.value === current && prev.estimate === likely) return;
    seen.current = { value: current, estimate: likely };
    const timer = window.setTimeout(() => {
      setAnnouncement(valueText);
      onSettleRef.current?.(current);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [current, likely, valueText]);

  const valueAt = (clientX: number) => {
    const node = trackRef.current;
    if (!node) return current;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0) return current;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * span;
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // A synthetic pointer may never have been captured.
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.moved) {
      const travel = Math.hypot(
        event.clientX - active.x,
        event.clientY - active.y,
      );
      if (travel < SLOP) return;
      active.moved = true;
      setDragging(true);
      // Capture only once the press has become a drag, so a plain press
      // still reaches the thumb as a click and a focus.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic sweeps may not support capture; tracking still works.
      }
    }
    commit(valueAt(event.clientX));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.moved) commit(valueAt(event.clientX));
    endDrag(event);
    thumbRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const page = step * 4;
    const moves: Record<string, number | undefined> = {
      ArrowRight: current + step,
      ArrowUp: current + step,
      ArrowLeft: current - step,
      ArrowDown: current - step,
      PageUp: current + page,
      PageDown: current - page,
      Home: min,
      End: max,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    commit(next);
  };

  const fillTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };
  const thumbTransition = dragging
    ? { duration: 0 }
    : motionSafe
      ? springs.snap
      : { duration: durations.fast, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-xs">
          <span className="font-medium text-foreground">
            <RollingNumber value={format(current)} motionSafe={motionSafe} />
          </span>
          <span className="text-ink-3">tokens</span>
        </span>
      </div>

      <div
        className="relative flex h-9 touch-none items-center"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={endDrag}
      >
        <div
          ref={trackRef}
          aria-hidden
          className="relative h-2 w-full rounded-full bg-hairline-strong"
        >
          <motion.span
            className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-cobalt-bright/30"
            initial={false}
            animate={{ scaleX: round3(capPct / 100) }}
            transition={fillTransition}
          />
          <motion.span
            className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-cobalt-bright"
            initial={false}
            animate={{ scaleX: round3(usedPct / 100) }}
            transition={fillTransition}
          />
          <motion.span
            style={{ backgroundImage: HATCH }}
            className="absolute inset-y-0 rounded-r-full"
            initial={false}
            animate={{
              left: `${capPct}%`,
              width: `${overPct}%`,
              opacity: overPct > 0 ? 1 : 0,
            }}
            transition={{ ...fillTransition, opacity: fade }}
          />
        </div>

        <motion.button
          ref={thumbRef}
          type="button"
          role="slider"
          aria-labelledby={labelId}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={current}
          aria-valuetext={valueText}
          aria-orientation="horizontal"
          onKeyDown={handleKeyDown}
          initial={false}
          animate={{ left: `${capPct}%` }}
          transition={thumbTransition}
          className={cn(
            "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface-0 shadow-sm transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            cut ? "border-warn" : "border-cobalt-bright",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
        />
      </div>

      <div className="flex h-5 items-center justify-between gap-3 font-mono text-[11px]">
        <span aria-hidden className="flex items-center gap-1 text-ink-3">
          <span
            className={cn(
              "font-medium transition-colors",
              cut ? "text-warn" : "text-foreground",
            )}
          >
            <RollingNumber value={format(likely)} motionSafe={motionSafe} />
          </span>
          likely
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span aria-hidden className="flex items-center text-ink-3">
            <RollingNumber value={String(usedShare)} motionSafe={motionSafe} />%
            of cap
          </span>
          <AnimatePresence initial={false}>
            {cut ? (
              <motion.span
                key="cut"
                aria-hidden
                className="inline-flex h-5 items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-1.5 text-[10px] tracking-[0.08em] text-warn uppercase"
                initial={
                  motionSafe ? { opacity: 0, scale: 0.8 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? { ...springs.flick, opacity: fade } : fade
                }
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="size-3 shrink-0"
                >
                  <path d="M3 4h10M3 8h7M3 12h4" />
                </svg>
                Cut at {format(current)}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
