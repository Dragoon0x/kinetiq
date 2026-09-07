"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type KaraokeWord = {
  text: string;
  /** Seconds from the start of the line. */
  start: number;
  end: number;
};

export type KaraokeLineProps = {
  /** The line, in timing order. */
  words: KaraokeWord[];
  /** Controlled playhead in seconds. Omit it to use the internal clock. */
  time?: number;
  /** Runs the clock. Never starts on mount. */
  playing?: boolean;
  /** Fires when a word is clicked or activated from the keyboard. */
  onSeek?: (time: number) => void;
  /** Fires on every tick of the clock, so a controlled parent can follow it. */
  onTimeChange?: (time: number) => void;
  /** Names the line for assistive technology. */
  label?: string;
  className?: string;
};

/** 20 ticks a second: fine enough that a sweep reads as continuous. */
const TICK = 0.05;

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * A line that lights in time. Each word fills with colour as its window passes
 * — a clip sweeping across the glyphs on a linear tween, scaled to that word's
 * own duration, because a fill is a measurement and measurements do not ease.
 * The word being sung inflates 4% on `snap`, one crisp overshoot and no more,
 * and a soft caret glides ahead on `glide`: it rides the trailing edge of the
 * live word and slips to the leading edge of the next one through a gap, so the
 * eye always knows where the line is going.
 *
 * The clock is either yours (`time`) or the component's (`playing`), and it only
 * ever runs from a prop — nothing starts on mount. Words are buttons in a roving
 * tabindex: Left and Right walk the line, Home and End jump to its ends, Enter
 * or Space seeks to that word. Under reduced motion the words switch colour at
 * their moment with no inflate and no travelling caret; the timing, which is the
 * information, still reads.
 */
export function KaraokeLine({
  words,
  time,
  playing = false,
  onSeek,
  onTimeChange,
  label = "Lyric line",
  className,
}: KaraokeLineProps) {
  const motionSafe = useMotionSafe();
  const caretId = React.useId();

  const controlled = time !== undefined;
  const [innerTime, setInnerTime] = React.useState(0);
  const head = controlled ? time : innerTime;
  const endTime = words.at(-1)?.end ?? 0;

  const [focusIndex, setFocusIndex] = React.useState(0);
  const wordRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // The clock advances against a ref rather than a state updater: reporting to
  // the parent from inside an updater would be a cross-component render.
  const headRef = React.useRef(head);
  React.useEffect(() => {
    headRef.current = head;
  }, [head]);
  const changeRef = React.useRef(onTimeChange);
  React.useEffect(() => {
    changeRef.current = onTimeChange;
  });

  React.useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const next = Math.min(endTime, round(headRef.current + TICK));
      if (next === headRef.current) return;
      headRef.current = next;
      if (!controlled) setInnerTime(next);
      changeRef.current?.(next);
    }, TICK * 1000);
    return () => window.clearInterval(timer);
  }, [playing, controlled, endTime]);

  const seek = (to: number) => {
    headRef.current = to;
    if (!controlled) setInnerTime(to);
    onSeek?.(to);
  };

  /** The word being sung, or -1 in a gap or past the end. */
  const singing = words.findIndex(
    (word) => head >= word.start && head < word.end,
  );
  /** Where the caret waits: on the live word, else on the one coming up. */
  const upcoming = words.findIndex((word) => word.start > head);
  const caretIndex = singing >= 0 ? singing : upcoming;

  const move = (to: number) => {
    const clamped = Math.min(words.length - 1, Math.max(0, to));
    setFocusIndex(clamped);
    wordRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(index - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(words.length - 1);
        break;
      default:
        break;
    }
  };

  const anchor = Math.min(focusIndex, Math.max(words.length - 1, 0));
  const fillTransition = motionSafe
    ? { duration: TICK, ease: easings.linear }
    : { duration: durations.fast, ease: easings.move };

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("w-full text-lg leading-9 font-medium", className)}
    >
      {words.map((word, index) => {
        const span = Math.max(word.end - word.start, 0.001);
        const passed = Math.min(1, Math.max(0, (head - word.start) / span));
        // Reduced motion keeps the information — which words have gone — and
        // drops the sweep that carries it.
        const fill = motionSafe ? passed : passed > 0 ? 1 : 0;
        const isSinging = index === singing;
        const carriesCaret = index === caretIndex;

        return (
          <React.Fragment key={`${index}-${word.text}`}>
            {index > 0 ? " " : null}
            <button
              ref={(node) => {
                wordRefs.current[index] = node;
              }}
              type="button"
              tabIndex={index === anchor ? 0 : -1}
              aria-current={isSinging ? "true" : undefined}
              aria-label={`${word.text}, at ${word.start.toFixed(1)} seconds`}
              onClick={() => {
                setFocusIndex(index);
                seek(word.start);
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className="relative inline-block cursor-pointer rounded-1 align-baseline leading-none outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              {/* The inflate sits inside the button so the caret, which is the
                  button's own child, never inherits the scale. */}
              <motion.span
                className="relative inline-block"
                animate={{ scale: isSinging && motionSafe ? 1.04 : 1 }}
                transition={
                  motionSafe ? springs.snap : { duration: durations.fast }
                }
              >
                <span className="text-ink-3">{word.text}</span>
                <motion.span
                  aria-hidden
                  className="absolute top-0 left-0 h-full overflow-hidden"
                  initial={false}
                  animate={{ width: `${fill * 100}%` }}
                  transition={fillTransition}
                >
                  <span className="block w-max whitespace-pre text-cobalt-bright">
                    {word.text}
                  </span>
                </motion.span>
              </motion.span>

              {carriesCaret ? (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? `${caretId}-caret` : undefined}
                  transition={springs.glide}
                  className={cn(
                    "absolute inset-y-0 w-0.5 rounded-full bg-cobalt-bright/70",
                    isSinging ? "-right-0.5" : "-left-0.5",
                  )}
                />
              ) : null}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
