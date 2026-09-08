"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SplitPerson = {
  id: string;
  name: string;
  /** Any CSS colour — pass a theme token so both themes read. */
  tint: string;
};

export type SplitBillProps = {
  ref?: React.Ref<HTMLElement>;
  /** The bill in major units. */
  total: number;
  /** Who is splitting it. Faces are initials on a disc — no images. */
  people: SplitPerson[];
  /** Controlled shares as fractions, in `people` order. Normalised to sum to 1. */
  value?: number[];
  /** Initial shares for uncontrolled usage. Defaults to an even split. */
  defaultValue?: number[];
  onValueChange?: (shares: number[]) => void;
  /** Money formatter — the card never invents a currency. */
  format?: (value: number) => string;
  /** Share one arrow key moves; Page Up and Page Down move five. @default 0.01 */
  step?: number;
  /** Names the card for assistive technology. @default "Split" */
  label?: string;
  /** A quiet line under the header — the venue and the date. */
  caption?: React.ReactNode;
  className?: string;
};

/** Travel before the pointer is captured, so a plain tap is still a tap. */
const CAPTURE_PX = 4;
/** How long the equalise cascade owns the rows before they glide again. */
const CASCADE_MS = 700;

/** Explicit locale: the server and the first client render must agree. */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const defaultFormat = (value: number) => MONEY.format(value);

/** Two initials at most; a one-word name keeps one. */
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const evenShares = (count: number) =>
  Array.from({ length: count }, () => 1 / Math.max(count, 1));

const normalise = (raw: number[] | undefined, count: number): number[] => {
  if (!raw || raw.length !== count) return evenShares(count);
  const clean = raw.map((share) =>
    Number.isFinite(share) ? Math.max(0, share) : 0,
  );
  const sum = clean.reduce((a, b) => a + b, 0);
  if (sum <= 0) return evenShares(count);
  return clean.map((share) => share / sum);
};

/**
 * Moves one share and gives the slack to the others in proportion to what they
 * already hold, so the four always sum to one. When the others hold nothing
 * there is no proportion to keep, and the slack is split evenly instead.
 */
const reshape = (shares: number[], index: number, next: number): number[] => {
  const taken = clamp01(next);
  const rest = 1 - taken;
  const others = shares.reduce(
    (sum, share, at) => (at === index ? sum : sum + share),
    0,
  );
  const spare = Math.max(shares.length - 1, 1);
  return shares.map((share, at) => {
    if (at === index) return taken;
    return others > 0 ? (share / others) * rest : rest / spare;
  });
};

/**
 * Rounds every share to the cent and hands the rounding remainder to the
 * largest, so the printed amounts add up to the printed total exactly.
 */
const amountsOf = (total: number, shares: number[]): number[] => {
  const totalCents = Math.round(total * 100);
  const cents = shares.map((share) => Math.round(share * totalCents));
  if (cents.length === 0) return [];
  const drift = totalCents - cents.reduce((a, b) => a + b, 0);
  let largest = 0;
  for (let index = 1; index < cents.length; index += 1) {
    if ((cents[index] ?? 0) > (cents[largest] ?? 0)) largest = index;
  }
  cents[largest] = (cents[largest] ?? 0) + drift;
  return cents.map((value) => value / 100);
};

/**
 * One bill, several faces, and a total that cannot drift. Dragging a row's track
 * reshapes every other share so the shares always sum to one, and the rows that
 * moved because of you follow on `glide` — ζ0.98, a settle rather than a bounce,
 * because a bill re-proportioning is a layout change. The track under the finger
 * is deliberately not sprung: it tracks the pointer exactly, since a value that
 * lags behind the hand is a value you cannot set.
 *
 * Amounts are honest to the cent. Every share is rounded and the rounding
 * remainder handed to the largest, so the printed shares add up to the printed
 * total and the footer's remainder really is zero. Equalise snaps all shares to
 * an even split on `snap` through a `cascade()`, top row first, so the reset
 * reads as one sweep instead of simultaneous jumps.
 *
 * Each track is a real `role="slider"` carrying its share as money as well as a
 * percentage: arrows move by `step`, Page Up and Page Down by five, Home and End
 * go to nothing and everything, and each of those reshapes the others exactly as
 * a drag does. The pointer is captured only after 4px of travel, so a tap still
 * lands where it was aimed. Under reduced motion the fills move on a short tween
 * and the cascade goes: the widths still change, because the split is the
 * information.
 */
export function SplitBill({
  ref,
  total,
  people,
  value,
  defaultValue,
  onValueChange,
  format = defaultFormat,
  step = 0.01,
  label = "Split",
  caption,
  className,
}: SplitBillProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const count = people.length;
  const [own, setOwn] = React.useState<number[]>(() =>
    normalise(defaultValue, count),
  );
  const shares = value ? normalise(value, count) : normalise(own, count);
  const amounts = amountsOf(total, shares);

  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [cascading, setCascading] = React.useState(false);
  const grab = React.useRef<{
    index: number;
    pointerId: number;
    startX: number;
    startY: number;
    left: number;
    width: number;
    captured: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (!cascading) return;
    const timer = window.setTimeout(() => setCascading(false), CASCADE_MS);
    return () => window.clearTimeout(timer);
  }, [cascading]);

  const emit = (next: number[]) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const setShare = (index: number, next: number) => {
    emit(reshape(shares, index, next));
  };

  const beginDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    index: number,
  ) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    grab.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      width: rect.width,
      captured: false,
    };
    setDragIndex(index);
    setShare(index, (event.clientX - rect.left) / rect.width);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = grab.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const travelled = Math.hypot(
      event.clientX - state.startX,
      event.clientY - state.startY,
    );
    if (!state.captured && travelled >= CAPTURE_PX) {
      // Captured only after real travel — capturing on pointerdown swallows
      // the plain click that a tap on the track is meant to be.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
        state.captured = true;
      } catch {
        state.captured = false;
      }
    }
    setShare(state.index, (event.clientX - state.left) / state.width);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = grab.current;
    if (!state || state.pointerId !== event.pointerId) return;
    grab.current = null;
    setDragIndex(null);
    if (!state.captured) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // A synthetic sweep can end on a pointer the element never captured.
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    index: number,
  ) => {
    const current = shares[index] ?? 0;
    const moves: Record<string, number> = {
      ArrowRight: current + step,
      ArrowUp: current + step,
      ArrowLeft: current - step,
      ArrowDown: current - step,
      PageUp: current + step * 5,
      PageDown: current - step * 5,
      Home: 0,
      End: 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setShare(index, next);
  };

  const even = evenShares(count);
  const isEven = shares.every(
    (share, index) => Math.abs(share - (even[index] ?? 0)) < 0.005,
  );
  const stagger = cascade(count);

  const equalise = () => {
    if (isEven) return;
    setCascading(true);
    emit(even);
  };

  const fillTransition = (index: number) => {
    if (dragIndex === index) return { duration: 0 };
    if (!motionSafe) return { duration: durations.fast, ease: easings.enter };
    if (cascading) return { ...springs.snap, delay: index * stagger };
    return springs.glide;
  };

  const paid = amounts.reduce((a, b) => a + b, 0);
  const remainder = Math.round((total - paid) * 100) / 100;
  const lead = amounts.reduce(
    (best, amount, index) => (amount > (amounts[best] ?? 0) ? index : best),
    0,
  );

  return (
    <section
      ref={ref}
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3
          id={labelId}
          className="min-w-0 flex-1 truncate text-sm font-medium"
        >
          {label}
        </h3>
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
          {format(total)}
        </span>
      </header>

      {caption ? (
        <p className="-mt-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {caption}
        </p>
      ) : null}

      <ul role="list" className="flex flex-col gap-3">
        {people.map((person, index) => {
          const share = shares[index] ?? 0;
          const amount = amounts[index] ?? 0;
          const percent = Math.round(share * 100);
          return (
            <li key={person.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{
                    color: person.tint,
                    // Opaque, so a face reads as a disc on any surface.
                    backgroundColor: `color-mix(in oklab, ${person.tint} 20%, var(--card))`,
                  }}
                >
                  {initialsOf(person.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {person.name}
                </span>
                <span className="shrink-0 font-mono text-sm font-medium tabular-nums">
                  {format(amount)}
                </span>
              </div>

              <div
                role="slider"
                tabIndex={0}
                aria-label={person.name}
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={`${percent} percent, ${format(amount)}`}
                onPointerDown={(event) => beginDrag(event, index)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "relative h-2 w-full cursor-ew-resize touch-none rounded-full bg-hairline-strong outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: person.tint }}
                  initial={false}
                  animate={{ width: `${share * 100}%` }}
                  transition={fillTransition(index)}
                >
                  <span
                    className="absolute top-1/2 right-0 size-3.5 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
                    style={{ backgroundColor: person.tint }}
                  />
                </motion.span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 border-t border-hairline pt-3">
        <span className="min-w-0 flex-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {count} ways · remainder {format(Math.abs(remainder))}
        </span>
        <button
          type="button"
          onClick={equalise}
          disabled={isEven}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            isEven ? "cursor-not-allowed text-ink-3" : "hover:bg-accent",
          )}
        >
          Equalise
        </button>
      </div>

      {/* Silent while a share is under the finger: a live region that re-reads
          the whole split on every frame of a drag is noise, not help. */}
      <p role="status" className="sr-only">
        {dragIndex === null
          ? `${people[lead]?.name ?? "No one"} has the largest share, ${format(
              amounts[lead] ?? 0,
            )} of ${format(total)}, across ${count} people`
          : ""}
      </p>
    </section>
  );
}
