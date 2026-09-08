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

/** One waiting transaction. `mine` marks the row the reader can bump. */
export type MempoolEntry = {
  id: string;
  address: string;
  fee: number;
  size?: number;
  mine?: boolean;
};

export type MempoolQueueProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Pending transactions in any order; the queue sorts them by fee. */
  entries: MempoolEntry[];
  /** Rows that make the next block. The cut line sits under them. @default 3 */
  blockSlots?: number;
  /** Rows drawn; the rest are counted in the footer. @default 7 */
  capacity?: number;
  /** Added to your fee by one press of the bump button. @default 2 */
  step?: number;
  /** Fee unit printed after every figure. @default "gu" */
  unit?: string;
  /** Formats every fee on the list. @default one decimal place */
  format?: (value: number) => string;
  /** Fires from the press; re-sort by writing `entries`. */
  onBump?: (id: string, nextFee: number) => void;
  /** Copy on the bump button. @default "Bump" */
  bumpLabel?: string;
  /** Names the list for assistive technology. @default "Pending queue" */
  label?: string;
  /** Shown when the queue is empty. @default "Nothing waiting." */
  emptyLabel?: string;
  className?: string;
};

const FEE = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const defaultFormat = (value: number): string => FEE.format(value);

/**
 * The waiting room, ordered by what each transaction pays. Rows sort by fee and
 * carry `layout` on `glide`, so a reorder is the list rearranging itself and
 * every row travels to its new place instead of blinking out of one and into
 * another. An arrival drops in from a `step` above on `snap`; a mined
 * transaction leaves on the exit ease, which accelerates away rather than
 * springing. The cut line travels with the rows, so which rows make the next
 * block is always readable.
 *
 * One row is yours. Bumping raises the offer, the host re-sorts, and the row
 * climbs on the same glide; an improvement flashes a wash that fades on a tween,
 * keyed to the new rank so it fires once per climb and never on a slide
 * backwards — a row losing ground must not celebrate. Each row's fill is its fee
 * as a share of the top fee, extended on `glide`.
 *
 * The list is an `<ol>` whose rows carry a sentence apiece, so position and
 * whether a row makes the next block never rest on colour. The only control is
 * the bump button, which sits in the tab order and says what fee it would offer.
 * Under reduced motion rows take their new places instantly — the order is the
 * information and it still changes — and the improvement flash still plays,
 * because feedback is not flourish.
 */
export function MempoolQueue({
  ref,
  entries,
  blockSlots = 3,
  capacity = 7,
  step = 2,
  unit = "gu",
  format = defaultFormat,
  onBump,
  bumpLabel = "Bump",
  label = "Pending queue",
  emptyLabel = "Nothing waiting.",
  className,
}: MempoolQueueProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const slots = Math.max(1, Math.trunc(blockSlots));
  const rows = Math.max(1, Math.trunc(capacity));

  // Never sort props in place, and tie-break on id so equal fees keep a stable
  // order instead of shuffling on every render.
  const ordered = [...entries].sort(
    (a, b) => b.fee - a.fee || a.id.localeCompare(b.id),
  );
  const shown = ordered.slice(0, rows);
  const overflow = ordered.length - shown.length;
  const top = ordered[0]?.fee ?? 1;

  const mineIndex = ordered.findIndex((entry) => entry.mine);
  const mine = mineIndex < 0 ? null : ordered[mineIndex];
  const rank = mineIndex < 0 ? 0 : mineIndex + 1;
  const inBlock = rank > 0 && rank <= slots;

  // Derived state, committed during render the way the house does it: the
  // previous rank has to survive a re-render to know a climb from a slide, and
  // a ref read during render would be the wrong tool.
  const [anchor, setAnchor] = React.useState({ rank, climbed: false });
  if (anchor.rank !== rank) {
    setAnchor({
      rank,
      climbed: rank > 0 && anchor.rank > 0 && rank < anchor.rank,
    });
  }

  const bump = () => {
    if (!mine) return;
    onBump?.(mine.id, Number((mine.fee + step).toFixed(4)));
  };

  const share = (fee: number) =>
    Math.min(1, Math.max(0.04, fee / Math.max(top, 1e-9)));

  const rowTransition = motionSafe
    ? { ...springs.snap, layout: springs.glide }
    : { duration: durations.fast, ease: easings.enter };

  const status =
    rank === 0
      ? `${ordered.length} waiting.`
      : inBlock
        ? `Your transaction is number ${rank} of ${ordered.length} and makes the next block.`
        : `Your transaction is number ${rank} of ${ordered.length}, ${
            rank - slots
          } ${rank - slots === 1 ? "place" : "places"} short of the next block.`;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-card p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          id={labelId}
          className="min-w-0 truncate text-[11px] font-medium text-ink-2"
        >
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {ordered.length} waiting
        </span>
      </div>

      {ordered.length === 0 ? (
        <p className="py-2 text-center text-xs text-ink-3">{emptyLabel}</p>
      ) : (
        <ol aria-labelledby={labelId} className="flex flex-col gap-1">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.flatMap((entry, index) => {
              const place = index + 1;
              const isMine = Boolean(entry.mine);
              const makes = place <= slots;
              const row = (
                <motion.li
                  key={entry.id}
                  layout={motionSafe ? "position" : false}
                  initial={
                    motionSafe
                      ? { y: -distances.step, opacity: 0 }
                      : { opacity: 0 }
                  }
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={rowTransition}
                >
                  {/* The sentence rather than an aria-label on the list item:
                      a name on a listitem is unevenly honoured, and the row's
                      own button must stay in the tree. */}
                  <span className="sr-only">
                    {`Position ${place} of ${ordered.length}, ${entry.address}, ${format(
                      entry.fee,
                    )} ${unit}, ${makes ? "in the next block" : "waiting"}.${
                      isMine ? " Your transaction." : ""
                    }`}
                  </span>
                  <div
                    className={cn(
                      "relative flex h-9 items-center gap-2 rounded-2 border px-2",
                      isMine
                        ? "border-cobalt-bright ring-1 ring-cobalt-bright/40"
                        : "border-hairline-strong",
                    )}
                  >
                    {/* The fill lives in its own clipped box so the bump
                        button's focus ring is never cut off by it. */}
                    <span
                      aria-hidden
                      className="absolute inset-0 overflow-hidden rounded-2 bg-surface-1"
                    >
                      <motion.span
                        className={cn(
                          "absolute inset-y-0 left-0 w-full origin-left",
                          isMine ? "bg-cobalt-wash" : "bg-surface-2",
                        )}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: share(entry.fee) }}
                        transition={
                          motionSafe
                            ? springs.glide
                            : { duration: durations.base, ease: easings.enter }
                        }
                      />
                      {/* Keyed to the rank: one flash per climb, and none at
                          all when the row slides backwards. */}
                      {isMine && anchor.climbed ? (
                        <motion.span
                          key={`climb-${anchor.rank}`}
                          className="absolute inset-0 bg-cobalt-bright"
                          initial={{ opacity: 0.35 }}
                          animate={{ opacity: 0 }}
                          transition={{
                            duration: durations.slow,
                            ease: easings.exit,
                          }}
                        />
                      ) : null}
                    </span>

                    <motion.span
                      key={`place-${place}`}
                      aria-hidden
                      className={cn(
                        "relative w-4 shrink-0 text-center font-mono text-[11px] tabular-nums",
                        makes ? "text-cobalt-bright" : "text-ink-3",
                      )}
                      initial={
                        motionSafe
                          ? { y: -distances.nudge, opacity: 0 }
                          : { opacity: 0 }
                      }
                      animate={{ y: 0, opacity: 1 }}
                      transition={
                        motionSafe
                          ? springs.snap
                          : { duration: durations.fast, ease: easings.enter }
                      }
                    >
                      {place}
                    </motion.span>

                    <span
                      aria-hidden
                      className="relative min-w-0 flex-1 truncate font-mono text-[11px] text-ink"
                      title={entry.address}
                    >
                      {entry.address}
                    </span>

                    {isMine ? (
                      <span
                        aria-hidden
                        className="relative shrink-0 rounded-full border border-cobalt-bright/50 bg-cobalt-wash px-1.5 py-px text-[9px] font-medium tracking-[0.06em] text-cobalt-bright uppercase"
                      >
                        Yours
                      </span>
                    ) : null}

                    <span
                      aria-hidden
                      className="relative flex shrink-0 items-baseline gap-0.5 font-mono text-[11px] font-medium text-ink-2 tabular-nums"
                    >
                      {format(entry.fee)}
                      <span className="text-[9px] font-normal text-ink-3">
                        {unit}
                      </span>
                    </span>

                    {isMine ? (
                      <motion.button
                        type="button"
                        onClick={bump}
                        aria-label={`${bumpLabel} your fee to ${format(
                          entry.fee + step,
                        )} ${unit}`}
                        whileTap={motionSafe ? { scale: 0.96 } : undefined}
                        transition={
                          motionSafe
                            ? springs.flick
                            : { duration: durations.blink }
                        }
                        className={cn(
                          "relative flex h-6 shrink-0 items-center rounded-2 border border-hairline-strong bg-surface-2 px-2 text-[11px] font-medium transition-colors outline-none hover:bg-accent active:bg-cobalt-wash",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        )}
                      >
                        {bumpLabel}
                      </motion.button>
                    ) : null}
                  </div>
                </motion.li>
              );

              return place === slots && shown.length > slots
                ? [
                    row,
                    <motion.li
                      key="cut"
                      aria-hidden
                      layout={motionSafe ? "position" : false}
                      className="flex items-center gap-2 py-0.5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={rowTransition}
                    >
                      <span className="h-px flex-1 bg-hairline-strong" />
                      <span className="shrink-0 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                        Next block cut
                      </span>
                      <span className="h-px flex-1 bg-hairline-strong" />
                    </motion.li>,
                  ]
                : [row];
            })}
          </AnimatePresence>
        </ol>
      )}

      {overflow > 0 ? (
        <p className="font-mono text-[10px] text-ink-3">
          {overflow} more waiting
        </p>
      ) : null}

      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  );
}
