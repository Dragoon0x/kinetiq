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

export type TranscriptSegment = {
  id: string;
  text: string;
  /** Tentative text firms up when this turns true. */
  final: boolean;
};

export type TranscriptFlowProps = {
  /** The transcript so far, oldest first. */
  segments: TranscriptSegment[];
  /** Shows the pulse at the end of the text. */
  listening?: boolean;
  /** Scroll height in pixels. */
  maxHeight?: number;
  /** Names the log for assistive technology. */
  label?: string;
  className?: string;
};

/** How close to the bottom still counts as following the speaker. */
const STICK_SLACK = 24;

/**
 * A transcript that shows its own confidence. Words arrive tentative in muted
 * ink and firm to foreground on a colour tween when their segment finalises;
 * a word the recogniser revises cross-fades in place — the old copy pops out of
 * flow so the line never doubles in width mid-swap — and new words enter from a
 * `nudge` on `glide`. While the microphone is open a dot breathes at the end of
 * the text on `drift`, the slowest spring in the set, because ambient state
 * should never compete with the words.
 *
 * The view follows the speaker only while the reader is already at the bottom:
 * scroll up and it holds still, with one button to rejoin the live edge. The
 * region is a focusable `log`, so the keyboard can scroll it, and finalised
 * text is announced through a polite status rather than the live edge, which
 * would otherwise read every revision aloud. Under reduced motion the pulse
 * holds still and the colours simply swap.
 */
export function TranscriptFlow({
  segments,
  listening = false,
  maxHeight = 200,
  label = "Transcript",
  className,
}: TranscriptFlowProps) {
  const motionSafe = useMotionSafe();
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const stuckRef = React.useRef(true);
  const [stuck, setStuck] = React.useState(true);

  const lastFinal = React.useMemo(
    () => segments.filter((segment) => segment.final).at(-1)?.text ?? "",
    [segments],
  );

  // A cheap signature of what is on screen: the auto-scroll should run when the
  // words change, not on every parent render.
  const shape = segments
    .map((segment) => `${segment.id}:${segment.text.length}:${segment.final}`)
    .join("|");

  React.useEffect(() => {
    const node = scrollerRef.current;
    if (!node || !stuckRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [shape, listening]);

  const handleScroll = () => {
    const node = scrollerRef.current;
    if (!node) return;
    const atBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight < STICK_SLACK;
    stuckRef.current = atBottom;
    setStuck((previous) => (previous === atBottom ? previous : atBottom));
  };

  const rejoin = () => {
    const node = scrollerRef.current;
    if (!node) return;
    stuckRef.current = true;
    setStuck(true);
    node.scrollTo({
      top: node.scrollHeight,
      behavior: motionSafe ? "smooth" : "auto",
    });
  };

  const wordTransition = motionSafe
    ? {
        y: springs.glide,
        opacity: { duration: durations.fast, ease: easings.enter },
      }
    : { duration: durations.fast };

  const pulse = listening ? (
    <motion.span
      aria-hidden
      className="ml-1 inline-block size-2 shrink-0 rounded-full bg-signal align-middle"
      animate={motionSafe ? { scale: [1, 1.5] } : { scale: 1 }}
      transition={
        motionSafe
          ? { ...springs.drift, repeat: Infinity, repeatType: "mirror" }
          : { duration: durations.fast }
      }
    />
  ) : null;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={scrollerRef}
        role="log"
        aria-label={label}
        /* The live edge rewrites itself constantly; announcing it would read
           every revision aloud, so the polite region below carries the finals. */
        aria-live="off"
        tabIndex={0}
        onScroll={handleScroll}
        style={{ maxHeight }}
        className="overflow-y-auto rounded-3 border border-border bg-surface-1 p-3 text-sm leading-6 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {segments.length === 0 ? (
          <p className="text-ink-3">
            {listening ? "Waiting for speech" : "Nothing yet"}
            {pulse}
          </p>
        ) : (
          segments.map((segment, index) => (
            <p
              key={segment.id}
              className={cn(
                "relative transition-colors",
                segment.final ? "text-foreground" : "text-ink-3",
              )}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {segment.text
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((word, position) => (
                    <motion.span
                      key={`${position}-${word}`}
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.nudge : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={wordTransition}
                      className="mr-1 inline-block"
                    >
                      {word}
                    </motion.span>
                  ))}
              </AnimatePresence>
              {index === segments.length - 1 ? pulse : null}
            </p>
          ))
        )}
      </div>

      <AnimatePresence>
        {stuck ? null : (
          <motion.button
            type="button"
            onClick={rejoin}
            initial={
              motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
            className="absolute right-3 bottom-3 flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-popover px-3 text-xs font-medium text-popover-foreground shadow-raised outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-signal" />
            Latest
          </motion.button>
        )}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {lastFinal}
      </span>
      <span role="status" className="sr-only">
        {listening ? "Listening" : "Not listening"}
      </span>
    </div>
  );
}
