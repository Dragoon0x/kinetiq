"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DisclaimerBarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The disclaimer, one or two short sentences. */
  text: string;
  /** Answers given so far: 0 keeps the bar away, 1 shows it, 2 or more fold it to the dot. @default 0 */
  answers?: number;
  /** Controlled pin: true holds the bar open past its fold, false holds it folded. */
  open?: boolean;
  /** Initial pin for uncontrolled usage; omitted, the bar follows `answers`. */
  defaultOpen?: boolean;
  /** Fires from a press or Escape with the new pin. */
  onOpenChange?: (open: boolean) => void;
  /** Fires as hover or focus peeks the folded bar open and closed. */
  onPeekChange?: (peeking: boolean) => void;
  /** Names the folded dot for assistive technology. @default "Disclaimer" */
  label?: string;
  className?: string;
};

/** The folded bar is a circle one row tall: h-7. */
const DOT = 28;

/**
 * A disclaimer that is said once and then kept out of the way. It arrives
 * with the first answer as a full-width bar and, when the second answer
 * lands, shrinks to a dot at the row's start: one button whose width and
 * height glide from the row's measured size to a 28px circle on `glide`
 * while the text fades on a fast tween, so no half-clipped words show.
 * Hovering or focusing the dot peeks the bar open on `snap` — one crisp
 * overshoot — and leaving folds it again; pressing pins it open, and
 * pressing the open bar folds it. A new answer resets any pin.
 *
 * The text is laid out at the row's width inside the button even while the
 * button is a dot, which is how its wrapped height is known before it opens.
 * The frame around the bar measures its content, so the row occupies nothing
 * before the first answer. Under reduced motion the two sizes swap at once
 * and only the text fades.
 */
export function DisclaimerBar({
  ref,
  text,
  answers = 0,
  open,
  defaultOpen,
  onOpenChange,
  onPeekChange,
  label = "Disclaimer",
  className,
}: DisclaimerBarProps) {
  const motionSafe = useMotionSafe();
  const [override, setOverride] = React.useState<boolean | null>(
    defaultOpen ?? null,
  );
  // A pin belongs to the answer it was made on; the next answer starts the
  // bar's own rule over. Adjusting during render keeps the reset in the same
  // commit as the new answer.
  const [seenAnswers, setSeenAnswers] = React.useState(answers);
  if (seenAnswers !== answers) {
    setSeenAnswers(answers);
    setOverride(null);
  }

  const pinned = open !== undefined ? open : override;
  const baseOpen = pinned ?? answers === 1;
  const present = answers > 0;

  const [hovering, setHovering] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const peeking = !baseOpen && (hovering || focused);
  const shown = baseOpen || peeking;

  // Peeks are reported only when the derived peek actually flips, so a
  // hover over an open bar says nothing — and a press that pins a peeked
  // bar ends the peek, because the bar is now open in its own right.
  const peekWith = (
    nextBaseOpen: boolean,
    nextHover: boolean,
    nextFocus: boolean,
  ) => {
    const next = !nextBaseOpen && (nextHover || nextFocus);
    if (next !== peeking) onPeekChange?.(next);
  };
  const setPin = (next: boolean) => {
    if (open === undefined) setOverride(next);
    onOpenChange?.(next);
    peekWith(next, hovering, focused);
  };
  const hover = (next: boolean) => {
    setHovering(next);
    peekWith(baseOpen, next, focused);
  };
  const focus = (next: boolean) => {
    setFocused(next);
    peekWith(baseOpen, hovering, next);
  };

  const frameInnerRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [frameHeight, setFrameHeight] = React.useState<number | null>(null);
  const [rowWidth, setRowWidth] = React.useState(0);
  const [contentHeight, setContentHeight] = React.useState(0);

  React.useEffect(() => {
    const node = frameInnerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setFrameHeight(node.offsetHeight);
      setRowWidth(node.offsetWidth);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setContentHeight(node.offsetHeight),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [present]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const sizeTransition = motionSafe
    ? shown
      ? springs.snap
      : springs.glide
    : { duration: 0 };

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <motion.div
        initial={false}
        animate={{ height: frameHeight ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={frameInnerRef} className="flex w-full flex-col">
          <AnimatePresence initial={false}>
            {present ? (
              <motion.button
                key="bar"
                type="button"
                aria-expanded={baseOpen}
                aria-label={shown ? undefined : `${label}, folded`}
                onClick={() => setPin(!baseOpen)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && baseOpen) {
                    event.preventDefault();
                    setPin(false);
                  }
                }}
                onPointerEnter={() => hover(true)}
                onPointerLeave={() => hover(false)}
                onFocus={() => focus(true)}
                onBlur={() => focus(false)}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  width: shown ? rowWidth || "100%" : DOT,
                  height: shown ? contentHeight || "auto" : DOT,
                }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  opacity: fade,
                  width: sizeTransition,
                  height: sizeTransition,
                }}
                className={cn(
                  "relative block max-w-full overflow-hidden rounded-full border border-hairline-strong bg-surface-1 text-left transition-colors outline-none hover:bg-accent",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                {/* Laid out at the row's width regardless of the button's,
                    so the wrapped height is known while folded. The dot's
                    centre sits at 14px both ways: the circle's centre. */}
                <div
                  ref={contentRef}
                  style={{ width: rowWidth || undefined }}
                  className="flex items-start gap-2 px-2.5 py-1.5"
                >
                  <span
                    aria-hidden
                    className="mt-1 size-2 shrink-0 rounded-full bg-warn"
                  />
                  <motion.span
                    aria-hidden={!shown}
                    className="min-w-0 text-xs leading-4 text-ink-2"
                    initial={false}
                    animate={{ opacity: shown ? 1 : 0 }}
                    transition={fade}
                  >
                    {text}
                  </motion.span>
                </div>
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {present ? `${label} ${baseOpen ? "shown" : "folded"}` : ""}
      </span>
    </div>
  );
}
