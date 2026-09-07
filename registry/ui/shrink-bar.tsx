"use client";

import * as React from "react";

import { motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type ShrinkBarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The scrolling element the bar reads. */
  container: React.RefObject<HTMLElement | null>;
  /** The heading. One element in both states, so it is one heading. */
  title: string;
  /** Second line; it folds away as the bar compacts. */
  subtitle?: string;
  /** Scroll pixels over which the bar compacts. */
  range?: number;
  /** Right-side controls. */
  actions?: React.ReactNode;
  /** Fires with the compaction percent, in fives, when it changes. */
  onCompactionChange?: (percent: number) => void;
  className?: string;
};

/**
 * The bar's two heights. Exported because the scrolling container has to offset
 * its content by the tall one — the bar sits above the scroller, not inside it,
 * so shrinking it can never shove the content it is reading.
 */
export const SHRINK_BAR_HEIGHT = { rest: 88, compact: 52 } as const;

/** The compact title is 0.78 of the large one: 18px reads as 14px. */
const COMPACT_SCALE = 0.78;

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/**
 * A header that spends its height as you scroll. The compaction is scroll-linked
 * and nothing else: one progress value, read straight off the container's
 * scrollTop over the first `range` pixels, drives the bar's height, the title's
 * scale and the subtitle's fold. There is no spring anywhere in it — a spring
 * would keep moving after your finger stopped, and a header that drifts under a
 * scroll reads as lag rather than as physics.
 *
 * The title is a single element throughout: it scales toward its left edge and
 * travels up as the bar closes around it, so assistive technology sees one
 * heading and never a large copy handing over to a small one. The hairline and
 * its shadow fade in over the same progress, so the bar only claims an edge once
 * there is something underneath it.
 *
 * The bar is positioned over the container rather than inside it, which is what
 * keeps the compaction honest: a header that shrinks in flow shortens the
 * document under the reader's own scroll. Under reduced motion the progress
 * snaps at the halfway mark, so the bar switches between two states instead of
 * tracking the scroll.
 */
export function ShrinkBar({
  ref,
  container,
  title,
  subtitle,
  range = 80,
  actions,
  onCompactionChange,
  className,
}: ShrinkBarProps) {
  const motionSafe = useMotionSafe();

  const progress = useMotionValue(0);
  const changeRef = React.useRef(onCompactionChange);
  const reportedRef = React.useRef(-1);

  React.useEffect(() => {
    changeRef.current = onCompactionChange;
  }, [onCompactionChange]);

  React.useEffect(() => {
    const node = container.current;
    if (!node) return;
    const span = Math.max(range, 1);
    const read = () => {
      const raw = clamp(node.scrollTop / span, 0, 1);
      // Reduced motion has no in-between: the bar is either tall or compact.
      const value = motionSafe ? raw : raw >= 0.5 ? 1 : 0;
      progress.set(value);
      // Reported in fives so a host can narrate the state without re-rendering
      // on every frame of a fling.
      const percent = Math.round((value * 100) / 5) * 5;
      if (percent === reportedRef.current) return;
      reportedRef.current = percent;
      changeRef.current?.(percent);
    };
    read();
    node.addEventListener("scroll", read, { passive: true });
    return () => node.removeEventListener("scroll", read);
  }, [container, range, motionSafe, progress]);

  const height = useTransform(
    progress,
    [0, 1],
    [SHRINK_BAR_HEIGHT.rest, SHRINK_BAR_HEIGHT.compact],
  );
  const titleScale = useTransform(progress, [0, 1], [1, COMPACT_SCALE]);
  // The subtitle gives up its line before it finishes fading, so the title has
  // somewhere to travel to rather than sliding over a ghost.
  const subtitleHeight = useTransform(progress, [0, 0.75], [16, 0]);
  const subtitleOpacity = useTransform(progress, [0, 0.45], [1, 0]);
  const chrome = useTransform(progress, [0.05, 0.6], [0, 1]);

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-10",
        className,
      )}
    >
      <motion.header
        style={{ height }}
        className="pointer-events-auto relative flex items-center gap-3 overflow-hidden bg-surface-1/90 px-4 backdrop-blur-sm"
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <motion.h2
            style={{ scale: titleScale, transformOrigin: "left center" }}
            className="truncate text-lg leading-6 font-semibold text-foreground"
          >
            {title}
          </motion.h2>
          {subtitle ? (
            <motion.p
              style={{ height: subtitleHeight, opacity: subtitleOpacity }}
              className="truncate overflow-hidden text-xs leading-4 text-ink-2"
            >
              {subtitle}
            </motion.p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}

        <motion.span
          aria-hidden
          style={{ opacity: chrome }}
          className="pointer-events-none absolute inset-0 border-b border-hairline-strong shadow-raised"
        />
      </motion.header>

      {/* In flow under the bar, so it follows the animated height without a
          second transform — and reads as a shadow in both themes. */}
      <motion.span
        aria-hidden
        style={{ opacity: chrome }}
        className="block h-2 w-full bg-linear-to-b from-hairline to-transparent"
      />
    </div>
  );
}
