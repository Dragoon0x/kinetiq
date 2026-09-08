"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AllocationSlice = {
  id: string;
  label: string;
};

export type AllocationSliderProps = {
  ref?: React.Ref<HTMLDivElement>;
  slices: AllocationSlice[];
  /** Controlled whole-percent weights, aligned to `slices` by index. */
  value?: number[];
  /** Initial weights for uncontrolled usage. @default an even split */
  defaultValue?: number[];
  onValueChange?: (values: number[]) => void;
  /** Portfolio value; given it, each row prints its cash share. */
  total?: number;
  /** Formats each row's cash share. */
  format?: (value: number) => string;
  /** Percentage points per arrow key; Page keys move five. @default 1 */
  step?: number;
  /** Renders the per-row lock. Locked rows never give. @default true */
  lockable?: boolean;
  /** Visible group heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const defaultFormat = (value: number) => currency.format(value);

/** Pointer travel before a press becomes a drag, so plain clicks survive. */
const SLOP = 4;

/** Steps in `step` units; Home and End are handled apart. */
const KEY_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 5,
  PageDown: -5,
};

/**
 * `mx-2` is the thumb's radius plus a pixel: the thumb is centred on its value,
 * so at 0 and 100 it would otherwise hang over the component's own edge.
 */
const TRACK_CLASS =
  "relative mx-2 h-6 min-w-0 flex-1 touch-none rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const LOCK_CLASS =
  "flex size-7 shrink-0 items-center justify-center rounded-2 border transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * Largest remainder: whole numbers, in proportion, summing to exactly `sum`.
 * Rounding each share on its own leaves a point of dust in the total, which is
 * precisely what this control exists to prevent.
 */
function whole(values: number[], sum: number): number[] {
  const count = values.length;
  if (count === 0) return [];
  const positive = values.map((value) => Math.max(0, value));
  const raw = positive.reduce((a, b) => a + b, 0);
  const scaled = positive.map((value) =>
    raw > 0 ? (value / raw) * sum : sum / count,
  );
  const out = scaled.map((value) => Math.floor(value));
  let left = Math.round(sum - out.reduce((a, b) => a + b, 0));
  const order = scaled
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  for (let cursor = 0; left > 0 && order.length > 0; cursor += 1, left -= 1) {
    const entry = order[cursor % order.length]!;
    out[entry.index] = (out[entry.index] ?? 0) + 1;
  }
  return out;
}

/**
 * Move one row to `next`; the unlocked others give it up, or take it back, in
 * proportion to `base` — the snapshot from the start of the gesture, so a long
 * sweep keeps the untouched ratios steady rather than letting them drift.
 */
function distribute(
  base: number[],
  index: number,
  next: number,
  locked: boolean[],
): number[] {
  const lockedTotal = base.reduce(
    (sum, value, i) => (i !== index && locked[i] ? sum + value : sum),
    0,
  );
  const pool = Math.max(0, 100 - lockedTotal);
  const free = base.map((_, i) => i !== index && !locked[i]);
  const freeCount = free.filter(Boolean).length;
  // With nothing left that can give, the held row simply owns the pool.
  const target = freeCount === 0 ? pool : Math.round(clamp(next, 0, pool));
  const out = base.slice();
  out[index] = target;
  const shares = whole(
    base.filter((_, i) => free[i]),
    pool - target,
  );
  let cursor = 0;
  base.forEach((_, i) => {
    if (!free[i]) return;
    out[i] = shares[cursor] ?? 0;
    cursor += 1;
  });
  return out;
}

/**
 * Move one; the others give. The row under the pointer is exact — its fill and
 * thumb track the finger with `duration: 0`, because direct manipulation must
 * never lag behind the hand — while every other row eases to its new share on
 * `glide`. What you hold is instant; what answers is sprung.
 *
 * Whatever the held row gives up is shared out by largest remainder against a
 * snapshot taken when the gesture began, so the whole numbers on screen sum to
 * exactly 100 on every frame and the untouched rows keep their ratios. A locked
 * row leaves the pool and its `role="switch"` shackle drops shut on `snap`; the
 * held row is clamped to what is left, so a locked mix cannot be broken by
 * pulling harder.
 *
 * Travel under 4px never captures the pointer, so a plain click on a track sets
 * that row instead of being swallowed, and capture and release are both guarded
 * so a synthetic sweep cannot throw. Every track is a real `role="slider"`:
 * arrows step, Page keys move five, Home and End reach the ends of the pool.
 * Under reduced motion nothing springs, but the fills still fill.
 */
export function AllocationSlider({
  ref,
  slices,
  value,
  defaultValue,
  onValueChange,
  total,
  format = defaultFormat,
  step = 1,
  lockable = true,
  label,
  className,
  "aria-label": ariaLabel,
}: AllocationSliderProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const count = slices.length;
  const even = React.useMemo(
    () => whole(new Array<number>(count).fill(1), 100),
    [count],
  );
  // Empty means "never set": the memo below then falls through to the even
  // split, which keeps the default honest if `slices` grows later.
  const [uncontrolled, setUncontrolled] = React.useState<number[]>(() =>
    defaultValue ? whole(defaultValue, 100) : [],
  );
  const isControlled = value !== undefined;
  const incoming = isControlled ? value : uncontrolled;
  const values = React.useMemo(
    () => (incoming.length === count ? whole(incoming, 100) : even),
    [incoming, count, even],
  );

  const [locked, setLocked] = React.useState<boolean[]>([]);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  const gesture = React.useRef<{
    id: number;
    index: number;
    startX: number;
    dragging: boolean;
    rect: DOMRect;
  } | null>(null);
  const snapshot = React.useRef<number[]>(values);

  const lockedFlags = slices.map((_, index) => locked[index] ?? false);
  const lockedCount = lockedFlags.filter(Boolean).length;

  const poolFor = (index: number) =>
    100 -
    values.reduce(
      (sum, weight, i) => (i !== index && lockedFlags[i] ? sum + weight : sum),
      0,
    );

  const commit = (index: number, next: number, base: number[]) => {
    const result = distribute(base, index, next, lockedFlags);
    if (result.every((weight, i) => weight === values[i])) return;
    if (!isControlled) setUncontrolled(result);
    onValueChange?.(result);
  };

  const weightFromClientX = (index: number, clientX: number) => {
    const rect = gesture.current?.rect;
    if (!rect || rect.width === 0) return values[index] ?? 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1) * 100;
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    index: number,
  ) => {
    if (event.button !== 0 || lockedFlags[index]) return;
    gesture.current = {
      id: event.pointerId,
      index,
      startX: event.clientX,
      dragging: false,
      rect: event.currentTarget.getBoundingClientRect(),
    };
    snapshot.current = values;
    setDragIndex(index);
    event.currentTarget.focus();
    commit(index, weightFromClientX(index, event.clientX), values);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      try {
        // Capture only once the press has become a drag — and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    commit(
      active.index,
      weightFromClientX(active.index, event.clientX),
      snapshot.current,
    );
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    setDragIndex(null);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    index: number,
  ) => {
    if (lockedFlags[index]) return;
    const current = values[index] ?? 0;
    const pool = poolFor(index);
    const move = KEY_STEPS[event.key];
    const next =
      move !== undefined
        ? current + move * step
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? pool
            : null;
    if (next === null) return;
    event.preventDefault();
    commit(index, clamp(next, 0, pool), values);
  };

  const spoken = slices
    .map((slice, index) => `${slice.label} ${values[index] ?? 0}`)
    .join(", ");
  // A live region that changed on every frame of a drag would babble, so the
  // announcement holds at the last settled mix and catches up on release.
  const [announced, setAnnounced] = React.useState(spoken);
  if (dragIndex === null && announced !== spoken) setAnnounced(spoken);

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {label ? (
          <span id={labelId} className="text-sm font-semibold text-foreground">
            {label}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {lockedCount > 0 ? <span>{lockedCount} locked</span> : null}
          <span aria-hidden className="size-1 rounded-full bg-success" />
          <span className="tabular-nums">Sum 100%</span>
        </span>
      </div>

      <div
        role="group"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex flex-col gap-3"
      >
        {slices.map((slice, index) => {
          const weight = values[index] ?? 0;
          const isLocked = lockedFlags[index];
          const cash = total === undefined ? null : (total * weight) / 100;
          const rowLabelId = `${baseId}-row-${slice.id}`;
          // The held row is exact; every other row gives on a spring.
          const move =
            !motionSafe || dragIndex === index
              ? { duration: 0 }
              : springs.glide;

          return (
            <div key={slice.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span
                  id={rowLabelId}
                  title={slice.label}
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    isLocked ? "text-ink-2" : "text-foreground",
                  )}
                >
                  {slice.label}
                </span>
                {cash === null ? null : (
                  <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                    {format(cash)}
                  </span>
                )}
                <span className="w-9 shrink-0 text-right font-mono text-[11px] text-foreground tabular-nums">
                  {weight}%
                </span>
              </div>

              <div className="flex items-center">
                <div
                  role="slider"
                  tabIndex={0}
                  aria-labelledby={rowLabelId}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(weight, poolFor(index))}
                  aria-valuenow={weight}
                  aria-valuetext={
                    cash === null
                      ? `${weight} percent`
                      : `${weight} percent, ${format(cash)}`
                  }
                  aria-disabled={isLocked || undefined}
                  onPointerDown={(event) => handlePointerDown(event, index)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endGesture}
                  onPointerCancel={endGesture}
                  onLostPointerCapture={endGesture}
                  onPointerLeave={(event) => {
                    // A press that wanders off before it becomes a drag would
                    // otherwise never see its own pointerup.
                    if (gesture.current?.dragging === false) endGesture(event);
                  }}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  className={cn(
                    TRACK_CLASS,
                    isLocked ? "cursor-not-allowed" : "cursor-pointer",
                  )}
                >
                  <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-hairline">
                    <motion.span
                      className={cn(
                        "absolute inset-y-0 left-0 w-full origin-left rounded-full",
                        isLocked ? "bg-ink-3" : "bg-cobalt-bright",
                      )}
                      initial={false}
                      animate={{ scaleX: weight / 100 }}
                      transition={move}
                    />
                  </span>
                  {/* The thumb sits at a percentage of the track's own width, so
                      it needs no measurement to land on its value and no carrier
                      layer that would hang past the track by the same amount. */}
                  <motion.span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface-0 shadow-sm",
                      isLocked ? "border-ink-3" : "border-cobalt-bright",
                    )}
                    initial={false}
                    animate={{ left: `${weight}%` }}
                    transition={move}
                  />
                </div>

                {lockable ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isLocked}
                    aria-label={`Lock ${slice.label} at ${weight} percent`}
                    onClick={() =>
                      setLocked((current) =>
                        slices.map((_, i) =>
                          i === index
                            ? !(current[i] ?? false)
                            : (current[i] ?? false),
                        ),
                      )
                    }
                    className={cn(
                      LOCK_CLASS,
                      isLocked
                        ? "border-hairline-strong bg-secondary text-foreground"
                        : "border-hairline text-ink-3 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      className="size-3.5 shrink-0"
                    >
                      {/* The shackle lifts off the body when the row opens up,
                          so the state is a shape as well as a fill. */}
                      <motion.path
                        d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7"
                        initial={false}
                        animate={{ y: isLocked ? 0 : -1.5 }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                      <rect
                        x="3.5"
                        y="7"
                        width="9"
                        height="6.5"
                        rx="1.5"
                        fill={isLocked ? "currentColor" : "none"}
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <span role="status" className="sr-only">
        Mix: {announced}. Sum 100 percent.
      </span>
    </div>
  );
}
