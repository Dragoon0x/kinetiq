"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TypingPillProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Who is typing, in the order they started. An empty array hides the pill. */
  names: string[];
  /** Names spelled out before "and N others". @default 1 */
  max?: number;
  className?: string;
};

const DOTS = [0, 1, 2];

/** Seconds between one dot's cycle and the next — enough that the three never
 *  reach the top together, which is what makes the row read as typing. */
const PHASE = 0.14;

/** The gap before a dot sets off again; without it the row never breathes. */
const REST = 0.18;

const joinNames = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * The sentence the pill shows and speaks. Exported so a host can mirror the
 * exact wording in its own copy instead of reimplementing the grammar.
 */
export function typingCaption(names: string[], max = 1): string {
  if (names.length === 0) return "";
  const listed = names.slice(0, Math.max(1, Math.floor(max)));
  const rest = names.length - listed.length;
  const who =
    rest > 0
      ? `${joinNames(listed)} and ${rest} ${rest === 1 ? "other" : "others"}`
      : joinNames(listed);
  return `${who} ${names.length === 1 ? "is" : "are"} typing`;
}

/**
 * A typing indicator. The pill lands on `recoil` — ζ0.53, the two visible
 * bounces of something arriving in a conversation — and leaves on the exit
 * ease, because a departure should not celebrate itself.
 *
 * The three dots run one `snap` between two keyframes, reversed and repeated,
 * each started a phase later than the last so they are never at the same height
 * at the same time; a row of dots moving in unison reads as a loading bar, not
 * as someone typing. Under reduced motion the dots pulse their opacity in the
 * same phases and nothing travels.
 *
 * The live region is mounted whether or not anyone is typing and holds only the
 * caption, so each change is announced exactly once — a region that mounts with
 * its own text is announced unreliably, and the animating dots are hidden from
 * assistive technology entirely.
 */
export function TypingPill({
  ref,
  names,
  max = 1,
  className,
}: TypingPillProps) {
  const motionSafe = useMotionSafe();

  const active = names.length > 0;
  const caption = typingCaption(names, max);

  return (
    <div ref={ref} className={cn("flex w-full items-center", className)}>
      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {caption}
      </span>

      <AnimatePresence initial={false}>
        {active ? (
          <motion.div
            key="pill"
            aria-hidden
            className="flex h-8 max-w-full min-w-0 items-center gap-2 rounded-full border border-hairline bg-surface-2 px-3"
            initial={
              motionSafe ? { scale: 0.6, opacity: 0 } : { scale: 1, opacity: 0 }
            }
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.recoil, opacity: { duration: durations.blink } }
                : { duration: durations.fast, ease: easings.enter }
            }
          >
            <span className="flex shrink-0 items-center gap-1">
              {DOTS.map((index) => (
                <motion.span
                  key={index}
                  className="size-1.5 rounded-full bg-ink-2"
                  animate={motionSafe ? { y: [0, -4] } : { opacity: [0.3, 1] }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          repeat: Infinity,
                          repeatType: "reverse",
                          repeatDelay: REST,
                          delay: index * PHASE,
                        }
                      : {
                          duration: durations.base,
                          ease: easings.move,
                          repeat: Infinity,
                          repeatType: "reverse",
                          repeatDelay: REST,
                          delay: index * PHASE,
                        }
                  }
                />
              ))}
            </span>

            <span className="min-w-0 truncate text-xs text-ink-2">
              {caption}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
