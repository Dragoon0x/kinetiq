"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FoldTextProps = {
  /** Visible lines while folded. @default 3 */
  lines?: number;
  /** The text. */
  children: React.ReactNode;
  /** Button copy while folded. @default "Read more" */
  moreLabel?: string;
  /** Button copy while open. @default "Show less" */
  lessLabel?: string;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

type Box = { full: number; line: number };

const UNMEASURED: Box = { full: 0, line: 0 };

/**
 * Read-more done by measurement. The clamp is a height, not a `line-clamp`:
 * the folded box is exactly `lines` line-boxes tall, and opening animates that
 * height to the content's measured height on `glide` — the spring for layout,
 * because this is the paragraph changing size, not a control changing state.
 * The bottom fade lifts on an opacity tween as the height travels, and the
 * chevron snaps over with the label.
 *
 * Nothing is reserved: the folded height comes from the line box, the open
 * height comes from a ResizeObserver, and a passage short enough to fit shows
 * no button at all rather than a control that does nothing.
 *
 * The button is a disclosure — `aria-expanded` and `aria-controls` on a real
 * button, so Enter and Space open the region and every reader is told what
 * moved. Under reduced motion the heights swap and only the fade tweens.
 */
export function FoldText({
  lines = 3,
  children,
  moreLabel = "Read more",
  lessLabel = "Show less",
  open,
  defaultOpen = false,
  onOpenChange,
  className,
}: FoldTextProps) {
  const motionSafe = useMotionSafe();
  const regionId = React.useId();

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<Box>(UNMEASURED);

  // The observer's first callback seeds both numbers, so nothing is measured
  // during render and no state is set synchronously in the effect body. It
  // also re-fires on reflow, which is how the open height stays honest when
  // the column narrows.
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const styles = window.getComputedStyle(node);
      const parsed = Number.parseFloat(styles.lineHeight);
      const line = Number.isFinite(parsed)
        ? parsed
        : Number.parseFloat(styles.fontSize) * 1.5;
      const full = node.offsetHeight;
      setBox((prev) =>
        prev.full === full && prev.line === line ? prev : { full, line },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const measured = box.line > 0;
  const folded = box.line * lines;
  // Half a line of slack: a passage that overruns by a rounding error is not
  // worth a control, and the fade would sit over nothing.
  const foldable = !measured || box.full > folded + box.line * 0.5;

  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  // Before the first measurement the clamp is plain CSS — `1lh` is the line box
  // the text is about to lay out in — so the server's markup and the first
  // paint already show the fold. Motion is only ever handed numbers, because a
  // calc() string is not something a spring can interpolate.
  const height = measured ? (isOpen || !foldable ? box.full : folded) : null;

  // The height lives in a motion value so the handoff from CSS to numbers is
  // explicit. The first measured number is written outright: given its first
  // target after mounting with nothing, motion would treat it as already
  // current and write no style, and the clamp the server painted would fall
  // away at hydration. Every later change animates.
  const heightValue = useMotionValue<number | string>(`calc(${lines} * 1lh)`);
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (height === null) return;
    if (!seeded.current) {
      seeded.current = true;
      heightValue.set(height);
      return;
    }
    const controls = animate(
      heightValue,
      height,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [height, heightValue, motionSafe]);

  return (
    <div className={cn("flex w-full flex-col items-start gap-2", className)}>
      <motion.div
        id={regionId}
        className="relative w-full overflow-hidden text-sm leading-relaxed text-ink-2"
        style={{ height: heightValue }}
      >
        <div ref={innerRef}>{children}</div>
        {foldable && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 block h-8 bg-gradient-to-t from-surface-1 to-transparent"
            initial={false}
            animate={{ opacity: isOpen ? 0 : 1 }}
            transition={{ duration: durations.base, ease: easings.move }}
          />
        )}
      </motion.div>

      {foldable && (
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={regionId}
          onClick={toggle}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 px-2 text-xs font-medium text-cobalt-bright transition-colors outline-none",
            "hover:bg-cobalt-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {isOpen ? lessLabel : moreLabel}
          {/* The rotation rides an HTML wrapper, not the <svg> itself: motion
              rewrites transform-origin on SVG nodes, and a chevron that turns
              about anything but its own centre reads as a wobble. */}
          <motion.span
            aria-hidden
            className="inline-flex shrink-0"
            initial={false}
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <svg viewBox="0 0 16 16" className="size-3.5">
              <path
                d="M4 6.5 8 10.5 12 6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.span>
        </button>
      )}
    </div>
  );
}
