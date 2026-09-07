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

export type GlossWordProps = {
  /** The word as it reads in the sentence. */
  term: string;
  /** The explanation. */
  gloss: React.ReactNode;
  /** Where the gloss appears. @default "inline" */
  mode?: "inline" | "bubble";
  /** Fires when the gloss opens or closes. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

const CARD =
  "block rounded-2 border border-hairline bg-surface-2 px-3 py-2 text-xs leading-normal text-ink-2";

/**
 * A glossary term that explains itself without covering the sentence. Hover,
 * focus or tap unfolds the gloss on the line beneath and pushes the following
 * text down on `glide` — the height is measured by a ResizeObserver, never
 * reserved, so a closed gloss costs the paragraph nothing.
 *
 * The gloss is a full-width float rather than a block, which is the whole
 * trick: a block would split the line at the term and throw the rest of the
 * sentence onto the next line the instant it opened. A float slots in beneath
 * the current line and leaves the words beside the term where they were.
 *
 * `bubble` mode floats the gloss above instead, entering on `snap` from 4px
 * and clamped to its paragraph so it cannot leave the column on a phone.
 *
 * The term is a real button with `aria-expanded` and `aria-controls`; Enter or
 * Space toggles it, Escape closes it, and a pointer leaving closes it too.
 * Under reduced motion the gloss simply appears.
 */
export function GlossWord({
  term,
  gloss,
  mode = "inline",
  onOpenChange,
  className,
}: GlossWordProps) {
  const motionSafe = useMotionSafe();
  const glossId = React.useId();

  const [open, setOpen] = React.useState(false);
  const [height, setHeight] = React.useState(0);
  const [shift, setShift] = React.useState(0);

  const innerRef = React.useRef<HTMLSpanElement | null>(null);
  const bubbleRef = React.useRef<HTMLSpanElement | null>(null);
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);

  const set = (next: boolean) => {
    if (next === open) return;
    setOpen(next);
    onOpenChange?.(next);
  };

  // Measured in the observer's callback, so no state is set synchronously in
  // the effect body and a reflow re-reads the gloss at its new width.
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A bubble anchored to a word near the edge would hang off the column, so it
  // is nudged back inside the block that holds the sentence. The observer
  // fires on mount and on every resize of the bubble.
  React.useEffect(() => {
    const node = bubbleRef.current;
    const anchor = anchorRef.current;
    if (!open || !node || !anchor || typeof ResizeObserver === "undefined")
      return;
    const clamp = () => {
      const bounds = (
        anchor.closest("p, li, blockquote, div") ?? anchor.parentElement
      )?.getBoundingClientRect();
      if (!bounds) return;
      const rect = node.getBoundingClientRect();
      const left = rect.left - shift;
      const right = rect.right - shift;
      const next =
        left < bounds.left + 4
          ? bounds.left + 4 - left
          : right > bounds.right - 4
            ? Math.min(0, bounds.right - 4 - right)
            : 0;
      setShift(next);
    };
    const observer = new ResizeObserver(clamp);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, shift]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    set(false);
  };

  const trigger = (
    <button
      ref={anchorRef}
      type="button"
      aria-expanded={open}
      aria-controls={glossId}
      onClick={() => set(!open)}
      // Touch fires enter before click; without the guard a tap would open on
      // enter and close again on click.
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") set(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") set(false);
      }}
      onFocus={() => set(true)}
      onBlur={() => set(false)}
      onKeyDown={onKeyDown}
      className={cn(
        "inline cursor-help bg-transparent p-0 text-left font-medium text-foreground underline decoration-ink-3 decoration-dotted decoration-2 underline-offset-4 transition-colors outline-none",
        "hover:decoration-cobalt-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        open && "decoration-cobalt-bright",
      )}
    >
      {term}
    </button>
  );

  if (mode === "bubble") {
    return (
      <span className={cn("relative inline", className)}>
        {trigger}
        <AnimatePresence>
          {open && (
            <motion.span
              ref={bubbleRef}
              id={glossId}
              role="region"
              aria-label={term}
              className="absolute bottom-full left-0 z-20 mb-1.5 block w-56 max-w-[80vw] shadow-raised"
              style={{ x: shift }}
              // No scale on the way in: the clamp measures this box while it
              // enters, and a scaled rect would under-report the overhang.
              initial={
                motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              // Exits never spring.
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              <span className={CARD}>{gloss}</span>
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    );
  }

  return (
    <span className={cn("inline", className)}>
      {trigger}
      {/* A float, not a block: it drops beneath the current line and leaves the
          words beside the term in place. `clear-both` keeps two open glosses
          from landing on each other. */}
      <motion.span
        id={glossId}
        role="region"
        aria-label={term}
        aria-hidden={!open}
        className="float-left clear-both block w-full overflow-hidden"
        initial={false}
        animate={{ height: open ? height : 0 }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <span ref={innerRef} className="block pt-1.5 pb-2">
          <motion.span
            className={CARD}
            initial={false}
            animate={{ opacity: open ? 1 : 0 }}
            transition={{ duration: durations.fast, ease: easings.move }}
          >
            {gloss}
          </motion.span>
        </span>
      </motion.span>
    </span>
  );
}
