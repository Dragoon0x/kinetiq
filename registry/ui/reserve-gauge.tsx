"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ReserveHold = {
  id: string;
  /** Amount the bank is sitting on, in the same unit as `total`. */
  amount: number;
  /** Why it is held — one short line, shown when the segment is read. */
  reason: string;
  /** When it lifts, in words ("clears Thursday"). No dates are computed here. */
  clears?: string;
};

export type ReserveGaugeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Cleared balance, holds included. */
  total: number;
  /** Holds against the balance, drawn left to right in this order. */
  holds?: ReserveHold[];
  /** Names the account. */
  label: string;
  /** Renders every amount; money never bypasses it. */
  format?: (amount: number) => string;
  /** Controlled pinned hold — the one whose reason stays open. */
  activeHoldId?: string | null;
  /** Initial pinned hold for uncontrolled usage. */
  defaultActiveHoldId?: string | null;
  onActiveHoldChange?: (id: string | null) => void;
  /** Fires when hover or focus changes which reason is showing. */
  onHoldReveal?: (id: string | null) => void;
  className?: string;
};

const NO_HOLDS: ReserveHold[] = [];

/** Pinned so the server and the client format identically. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const defaultFormat = (amount: number) => currency.format(amount);

/** Held funds are drawn, not merely dimmed — hatching survives both themes. */
const HATCH =
  "repeating-linear-gradient(45deg, var(--ink-3) 0 1px, transparent 1px 5px)";
const HATCH_ACTIVE =
  "repeating-linear-gradient(45deg, var(--accent-bright) 0 1px, transparent 1px 5px)";

/** A hold this small is still worth a visible sliver of the bar. */
const MIN_SHARE = 0.02;
/** Holds never squeeze the available run out of the bar entirely. */
const MAX_HELD_SHARE = 0.92;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits roll to their new value on `snap` — one crisp overshoot, the same
 * physics as any other indicator changing position. The column is ten faces
 * tall, so a `y` of one tenth of its own height moves exactly one digit, and
 * the width is fixed at `1ch` of a tabular face so a roll never shifts layout.
 */
function RollingFigure({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit and only the new column mounts.
        const key = text.length - index;
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
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.15em] items-center justify-center"
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
 * How much of a balance is actually yours. One bar carries the cleared total:
 * the solid run on the left is spendable, and every hold takes its own hatched
 * segment sized by its share, so the split is drawn to scale rather than
 * asserted in a caption. Dropping a hold shrinks its segment away on the exit
 * ease — a hold leaving is an exit, so it accelerates rather than springs —
 * while the available run glides wider on `glide` and the figure above rolls
 * its digits on `snap`.
 *
 * Pointing at a segment, or tabbing to it, slides a reader caret to its middle
 * on `snap` and swaps the caption to that hold's reason; pressing pins the
 * reason open so touch and keyboard get what hover gives, and Escape unpins.
 * The holds are one Tab stop with a roving tabindex — Left and Right step,
 * Home and End jump. Under reduced motion the widths still redraw, on a tween
 * instead of a spring, because the split is the information.
 */
export function ReserveGauge({
  ref,
  total,
  holds = NO_HOLDS,
  label,
  format = defaultFormat,
  activeHoldId,
  defaultActiveHoldId = null,
  onActiveHoldChange,
  onHoldReveal,
  className,
}: ReserveGaugeProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolledPin, setUncontrolledPin] = React.useState<string | null>(
    defaultActiveHoldId,
  );
  const isControlled = activeHoldId !== undefined;
  const pinnedId = isControlled ? activeHoldId : uncontrolledPin;

  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  // Keyed by id, not by index: a hold that is on its way out still renders
  // while its segment shrinks, and an array would let it answer to the index
  // its neighbour has just inherited.
  const buttonRefs = React.useRef(new Map<string, HTMLButtonElement>());

  // Reported from the event that caused the change rather than from an effect,
  // so a host never sees a reveal announced a frame after it happened.
  const revealedRef = React.useRef<string | null>(null);
  const report = (next: string | null) => {
    if (revealedRef.current === next) return;
    revealedRef.current = next;
    onHoldReveal?.(next);
  };

  const held = holds.reduce((sum, hold) => sum + Math.max(0, hold.amount), 0);
  const span = total > 0 ? total : 1;
  const available = Math.max(0, total - held);

  // Every hold keeps a floor of the bar so a small one stays hittable; the set
  // is then scaled so the available run can never be pushed off the end.
  const rawShares = holds.map((hold) =>
    Math.max(MIN_SHARE, Math.max(0, hold.amount) / span),
  );
  const rawTotal = rawShares.reduce((sum, share) => sum + share, 0);
  const scale = rawTotal > MAX_HELD_SHARE ? MAX_HELD_SHARE / rawTotal : 1;
  const shares = rawShares.map((share) => share * scale);
  const heldShare = shares.reduce((sum, share) => sum + share, 0);
  const availableShare = Math.max(0, 1 - heldShare);

  const revealedId = pinnedId ?? hoverId ?? focusId;
  const revealedIndex = holds.findIndex((hold) => hold.id === revealedId);
  const revealed = revealedIndex >= 0 ? holds[revealedIndex] : undefined;

  // The caret points at the middle of the segment being read.
  const caretPercent =
    revealedIndex >= 0
      ? (availableShare +
          shares.slice(0, revealedIndex).reduce((sum, s) => sum + s, 0) +
          (shares[revealedIndex] ?? 0) / 2) *
        100
      : 50;

  const widthTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  const pin = (id: string | null) => {
    if (!isControlled) setUncontrolledPin(id);
    onActiveHoldChange?.(id);
    report(id ?? hoverId ?? focusId);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(holds.length - 1, Math.max(0, index));
    const target = holds[clamped];
    if (!target) return;
    setFocusIndex(clamped);
    buttonRefs.current.get(target.id)?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(holds.length - 1);
    } else if (event.key === "Escape" && pinnedId) {
      event.preventDefault();
      pin(null);
    }
  };

  const summary =
    holds.length === 0
      ? "No holds — everything is available"
      : `${holds.length} ${holds.length === 1 ? "hold" : "holds"} · ${format(held)} held`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          of {format(total)}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl leading-none font-medium text-foreground">
          <RollingFigure text={format(available)} motionSafe={motionSafe} />
        </span>
        <span className="text-xs text-ink-3">available</span>
      </div>

      <div className="relative pb-2.5">
        <div
          role="group"
          aria-labelledby={labelId}
          className="flex h-5 w-full overflow-hidden rounded-2 border border-hairline bg-surface-2"
        >
          {/* The available run carries no label of its own: the figure above
              and the group's status line already say what it is worth. */}
          <motion.span
            aria-hidden
            className="h-full bg-cobalt-bright"
            initial={false}
            animate={{ width: `${availableShare * 100}%` }}
            transition={widthTransition}
          />

          <AnimatePresence initial={false}>
            {holds.map((hold, index) => {
              const isPinned = pinnedId === hold.id;
              const isRead = revealedId === hold.id;
              return (
                <motion.span
                  key={hold.id}
                  className="h-full shrink-0 overflow-hidden"
                  initial={{ width: 0 }}
                  animate={{ width: `${(shares[index] ?? 0) * 100}%` }}
                  exit={{ width: 0, transition: exitFor() }}
                  transition={widthTransition}
                >
                  <button
                    type="button"
                    ref={(node) => {
                      if (node) buttonRefs.current.set(hold.id, node);
                      else buttonRefs.current.delete(hold.id);
                    }}
                    tabIndex={
                      index === Math.min(focusIndex, holds.length - 1) ? 0 : -1
                    }
                    aria-pressed={isPinned}
                    aria-label={`${hold.reason}. ${format(hold.amount)} held${
                      hold.clears ? `, ${hold.clears}` : ""
                    }.`}
                    onClick={() => pin(isPinned ? null : hold.id)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                    onPointerEnter={() => {
                      setHoverId(hold.id);
                      report(pinnedId ?? hold.id);
                    }}
                    onPointerLeave={() => {
                      setHoverId(null);
                      report(pinnedId ?? focusId);
                    }}
                    onFocus={() => {
                      setFocusIndex(index);
                      setFocusId(hold.id);
                      report(pinnedId ?? hoverId ?? hold.id);
                    }}
                    onBlur={() => {
                      setFocusId(null);
                      report(pinnedId ?? hoverId);
                    }}
                    style={{
                      backgroundImage: isRead ? HATCH_ACTIVE : HATCH,
                    }}
                    // The focus ring draws inside: the track clips its
                    // children, so an outward offset would be cut off.
                    className={cn(
                      "h-full w-full border-l border-hairline-strong transition-colors outline-none",
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      isRead ? "bg-cobalt-wash" : "bg-surface-2",
                    )}
                  />
                </motion.span>
              );
            })}
          </AnimatePresence>
        </div>

        {/* The caret occupies the wrapper's own padding, so it never lands on
            top of the caption underneath it. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute bottom-0"
          initial={false}
          animate={{
            left: `${caretPercent}%`,
            opacity: revealed ? 1 : 0,
          }}
          transition={{
            left: motionSafe ? springs.snap : { duration: 0 },
            opacity: fade,
          }}
        >
          <span className="block size-1.5 -translate-x-1/2 rotate-45 rounded-1 bg-cobalt-bright" />
        </motion.span>
      </div>

      {/* Both captions share one grid cell, so the block is as tall as a line
          and never reserves room for the state it is not showing. */}
      <div className="grid">
        <motion.p
          aria-hidden={revealed !== undefined}
          className="col-start-1 row-start-1 min-w-0 truncate text-xs text-ink-3"
          animate={{ opacity: revealed ? 0 : 1 }}
          transition={fade}
        >
          {summary}
        </motion.p>
        <motion.p
          aria-hidden={revealed === undefined}
          title={revealed?.reason}
          className="col-start-1 row-start-1 min-w-0 truncate text-xs"
          animate={{ opacity: revealed ? 1 : 0 }}
          transition={fade}
        >
          <span className="font-medium text-foreground">
            {revealed ? format(revealed.amount) : ""}
          </span>{" "}
          <span className="text-ink-3">
            {revealed?.reason}
            {revealed?.clears ? ` · ${revealed.clears}` : ""}
          </span>
        </motion.p>
      </div>

      <span role="status" className="sr-only">
        {format(available)} available of {format(total)}, {format(held)} held
      </span>
    </div>
  );
}
