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

export type Vote = 1 | 0 | -1;

export type VotePairProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled vote. */
  value?: Vote;
  /** Initial vote for uncontrolled usage. @default 0 */
  defaultValue?: Vote;
  /** The tally before the reader's own vote is added. */
  score: number;
  onVote?: (value: Vote) => void;
  /** @default "md" */
  size?: "sm" | "md";
  /** Names what is being voted on, for the two buttons. @default "answer" */
  subject?: string;
  className?: string;
};

const SIZES = {
  sm: { control: "size-8", icon: "size-4", tally: "h-8 min-w-8 text-xs" },
  md: { control: "size-9", icon: "size-5", tally: "h-9 min-w-9 text-sm" },
} as const;

/** The thumb leans into its own direction; 8° is a lean, not a cartwheel. */
const TILT = 8;

/**
 * Up and down, with the tally between them. The chosen thumb pops from 0.78 on
 * `recoil` — ζ0.53, the two bounces of something struck — and holds an 8° tilt
 * toward its own direction on `snap`. The tally rolls in the direction it moved
 * and travels further when a side switch moves it by two, because a two-point
 * swing should not read the same as a one-point nudge.
 *
 * Both halves are toggle buttons carrying `aria-pressed`, so pressing the side
 * already chosen withdraws the vote, and the tally sits in a live region that
 * announces the new number. Under reduced motion nothing pops or tilts: the
 * colours swap and the tally still updates, because the count is information.
 */
export function VotePair({
  ref,
  value,
  defaultValue = 0,
  score,
  onVote,
  size = "md",
  subject = "answer",
  className,
}: VotePairProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState<Vote>(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const dimensions = SIZES[size];

  // The tally's roll direction and reach come from the vote that caused it,
  // captured in the handler so no layout is read during render.
  const [delta, setDelta] = React.useState(0);
  const total = score + current;

  const cast = (next: Vote) => {
    const settled: Vote = next === current ? 0 : next;
    if (settled === current) return;
    setDelta(settled - current);
    if (!isControlled) setUncontrolled(settled);
    onVote?.(settled);
  };

  const rollFrom =
    (delta < 0 ? -1 : 1) *
    (Math.abs(delta) > 1 ? distances.shift : distances.step);

  const renderSide = (side: 1 | -1) => {
    const active = current === side;
    const up = side === 1;
    return (
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${up ? "Upvote" : "Downvote"} this ${subject}`}
        onClick={() => cast(side)}
        className={cn(
          // 150ms is durations.fast — the colour swap is a tween, never a spring.
          "flex shrink-0 items-center justify-center rounded-full border transition-colors duration-150 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          dimensions.control,
          active && up && "border-success/40 bg-success/10 text-success",
          active && !up && "border-danger/40 bg-danger/10 text-danger",
          !active &&
            "border-hairline text-ink-3 hover:border-hairline-strong hover:text-foreground",
        )}
      >
        <motion.span
          className="block"
          style={{ originX: 0.5, originY: 0.5 }}
          animate={{ rotate: active && motionSafe ? (up ? -TILT : TILT) : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <motion.span
            key={active ? "cast" : "clear"}
            className="block"
            style={{ originX: 0.5, originY: 0.5 }}
            initial={motionSafe && active ? { scale: 0.78 } : false}
            animate={{ scale: 1 }}
            transition={motionSafe ? springs.recoil : { duration: 0 }}
          >
            <ThumbGlyph down={!up} className={dimensions.icon} />
          </motion.span>
        </motion.span>
      </button>
    );
  };

  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-1 p-1",
        className,
      )}
    >
      {renderSide(1)}

      <span
        role="status"
        className={cn(
          "relative flex items-center justify-center overflow-hidden px-1 font-mono font-medium tabular-nums transition-colors duration-150",
          dimensions.tally,
          current === 1 && "text-success",
          current === -1 && "text-danger",
          current === 0 && "text-foreground",
        )}
      >
        <span className="sr-only">Score</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={total}
            aria-hidden
            initial={motionSafe ? { y: rollFrom, opacity: 0 } : { opacity: 1 }}
            animate={{ y: 0, opacity: 1 }}
            exit={
              motionSafe
                ? {
                    y: -rollFrom,
                    opacity: 0,
                    transition: exitFor(durations.fast),
                  }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={
              motionSafe
                ? {
                    ...springs.snap,
                    opacity: { duration: durations.fast, ease: easings.enter },
                  }
                : { duration: 0 }
            }
          >
            {total}
          </motion.span>
        </AnimatePresence>
        <span className="sr-only">{total}</span>
      </span>

      {renderSide(-1)}
    </div>
  );
}

/**
 * Procedural thumb: one path, flipped on its horizontal axis for the down
 * side so the cuff stays where the hand would be rather than mirroring twice.
 */
function ThumbGlyph({
  down,
  className,
}: {
  down: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("block", className)}
      fill="currentColor"
      aria-hidden
    >
      <g transform={down ? "translate(0 24) scale(1 -1)" : undefined}>
        <path d="M6.6 21.4H4.2A2.2 2.2 0 0 1 2 19.2v-6.4a2.2 2.2 0 0 1 2.2-2.2h2.4v10.8Z" />
        <path d="M8.4 10.2 12.3 3.4A1.9 1.9 0 0 1 15.8 4.9l-.8 4.5h4.3A2.2 2.2 0 0 1 21.4 12l-1.5 7.2a2.6 2.6 0 0 1-2.5 2.2H8.4V10.2Z" />
      </g>
    </svg>
  );
}
