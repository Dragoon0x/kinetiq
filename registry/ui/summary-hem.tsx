"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SummaryLine = {
  label: string;
  value: string;
};

export type SummaryHemProps = {
  ref?: React.Ref<HTMLElement>;
  /** The scrolling element the hem listens to. */
  container: React.RefObject<HTMLElement | null>;
  /** Itemised lines; they are what the condensed bar gives up. */
  lines: SummaryLine[];
  /** Formatted total. Kept in both states. */
  total: string;
  /** The action. Kept in both states. */
  cta: { label: string; onPress: () => void };
  /** Names the region and the disclosure. */
  heading?: string;
  /** Label beside the total. */
  totalLabel?: string;
  /** Fires when the hem condenses or expands, whatever caused it. */
  onCondensedChange?: (condensed: boolean) => void;
  className?: string;
};

/** Travel smaller than this is noise — a trackpad's settle, a rubber band. */
const DEADZONE = 4;

/** Inside this much of the top there is nothing to have scrolled past yet. */
const TOP_REST = 8;

/**
 * A summary that pays for its own space. At rest it is a card — every line, the
 * total, the action; scroll the list down and it condenses to a slim bar that
 * keeps only the total and the action, then opens again the moment you scroll
 * back up or tap it.
 *
 * The condense is one `layout` animation on `glide`: the total and the button
 * are the same elements throughout, so they travel to the bar rather than being
 * replaced by a second copy of themselves, and only the itemised lines
 * cross-fade — the part that is genuinely being given up. Direction, not
 * position, drives it, so the hem reacts to the reader's intent instead of
 * flipping at a hard line.
 *
 * It is a labelled region whose heading holds a disclosure button: Enter or
 * Space expands and collapses it, `aria-expanded` reports the state, and the
 * lines are what `aria-controls` points at. Under reduced motion the two states
 * swap without travel — the total and the action never move, they just change
 * places.
 */
export function SummaryHem({
  ref,
  container,
  lines,
  total,
  cta,
  heading = "Order summary",
  totalLabel = "Total",
  onCondensedChange,
  className,
}: SummaryHemProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const headingId = `${baseId}-heading`;
  const detailsId = `${baseId}-details`;

  const [condensed, setCondensed] = React.useState(false);
  // The scroll handler decides against this ref rather than a state updater:
  // an updater may run twice, and telling the parent from inside one is a
  // cross-component update React refuses.
  const condensedRef = React.useRef(false);
  const changeRef = React.useRef(onCondensedChange);

  React.useEffect(() => {
    changeRef.current = onCondensedChange;
  }, [onCondensedChange]);

  const apply = React.useCallback((next: boolean) => {
    if (condensedRef.current === next) return;
    condensedRef.current = next;
    setCondensed(next);
    changeRef.current?.(next);
  }, []);

  React.useEffect(() => {
    const node = container.current;
    if (!node) return;
    let last = node.scrollTop;
    const onScroll = () => {
      const top = node.scrollTop;
      const delta = top - last;
      if (Math.abs(delta) < DEADZONE) return;
      last = top;
      apply(delta > 0 && top > TOP_REST);
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [container, apply]);

  const glide = motionSafe ? springs.glide : { duration: 0 };

  return (
    <motion.section
      ref={ref}
      layout={motionSafe}
      transition={glide}
      aria-labelledby={headingId}
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 border-t border-hairline-strong bg-surface-1/95 px-3 py-2 backdrop-blur-sm",
        className,
      )}
    >
      <div
        className={cn(
          "flex gap-2",
          condensed ? "flex-row items-center" : "flex-col",
        )}
      >
        <h3
          id={headingId}
          className={cn("m-0 flex min-w-0", condensed ? "flex-1" : "w-full")}
        >
          <motion.button
            layout={motionSafe}
            transition={glide}
            type="button"
            onClick={() => apply(!condensed)}
            aria-expanded={!condensed}
            aria-controls={condensed ? undefined : detailsId}
            className={cn(
              "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-2 text-left text-ink-2 outline-none hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            {/* Rotation lives on an inner element: a layout animation owns the
                outer transform, and the two would overwrite each other. */}
            <motion.span
              aria-hidden
              layout={motionSafe}
              transition={glide}
              className="flex size-4 shrink-0 items-center justify-center"
            >
              <motion.span
                className="flex"
                animate={{ rotate: condensed ? 0 : 180 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <svg
                  viewBox="0 0 16 16"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 10 L8 6 L12 10" />
                </svg>
              </motion.span>
            </motion.span>
            <span
              className={cn(
                "truncate text-sm font-semibold text-foreground",
                condensed && "sr-only",
              )}
            >
              {heading}
            </span>
          </motion.button>
        </h3>

        {/* popLayout takes the leaving lines out of flow, so the hem's own
            layout animation closes the gap in the same frame they fade. */}
        <AnimatePresence initial={false} mode="popLayout">
          {condensed ? null : (
            <motion.dl
              key="lines"
              id={detailsId}
              className="m-0 flex flex-col gap-1 border-b border-hairline pb-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {lines.map((line) => (
                <div
                  key={line.label}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="min-w-0 truncate text-xs text-ink-2">
                    {line.label}
                  </dt>
                  <dd className="m-0 shrink-0 font-mono text-xs text-ink tabular-nums">
                    {line.value}
                  </dd>
                </div>
              ))}
            </motion.dl>
          )}
        </AnimatePresence>

        <motion.div
          layout={motionSafe}
          transition={glide}
          className={cn(
            "flex min-w-0 items-baseline gap-2",
            condensed ? "shrink-0" : "w-full justify-between",
          )}
        >
          <motion.span
            layout={motionSafe ? "position" : false}
            transition={glide}
            className="text-[11px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {totalLabel}
          </motion.span>
          <motion.span
            layout={motionSafe ? "position" : false}
            transition={glide}
            className="font-mono text-sm font-semibold text-foreground tabular-nums"
          >
            {total}
          </motion.span>
        </motion.div>

        <motion.button
          layout={motionSafe}
          transition={glide}
          type="button"
          onClick={cta.onPress}
          style={{ borderRadius: 6 }}
          className={cn(
            "flex h-9 shrink-0 cursor-pointer items-center justify-center bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 active:bg-primary/80",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            condensed ? "w-auto" : "w-full",
          )}
        >
          <motion.span
            layout={motionSafe ? "position" : false}
            transition={glide}
            className="truncate"
          >
            {cta.label}
          </motion.span>
        </motion.button>
      </div>
    </motion.section>
  );
}
