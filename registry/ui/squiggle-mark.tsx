"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SquiggleIssue = {
  /** The flagged word, exactly as it appears in `text`. */
  word: string;
  /** What Accept puts in its place. */
  suggestion: string;
};

export type SquiggleMarkProps = {
  /** The sentence to mark up. */
  text: string;
  /** Flagged words and their fixes, in the order they appear in the text. */
  issues: SquiggleIssue[];
  /** Fires on accept (with the replacement) or ignore (with null). */
  onFix?: (word: string, replacement: string | null) => void;
  className?: string;
};

/** Bubble width before clamping, and the headroom a bubble needs above a word. */
const BUBBLE_WIDTH = 208;
const BUBBLE_HEIGHT = 72;
/** Milliseconds the bubble survives the pointer crossing the gap to reach it. */
const CLOSE_DELAY = 140;
/** Wave units per period; a word is drawn one wave per character. */
const PERIOD = 6;

/** A quadratic wave, so the squiggle keeps its wavelength at any word width. */
function squigglePath(chars: number) {
  const waves = Math.max(2, chars);
  let d = "M 0 2";
  for (let index = 0; index < waves; index += 1) {
    d += " q 1.5 -2.4 3 0 q 1.5 2.4 3 0";
  }
  return { d, width: waves * PERIOD };
}

type Piece = { text: string; issue?: undefined } | { issue: number };

/** Walks the text once, claiming each flagged word at its first free position. */
function readPieces(text: string, issues: SquiggleIssue[]): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0;
  issues.forEach((issue, index) => {
    const at = text.indexOf(issue.word, cursor);
    if (at < 0) return;
    if (at > cursor) pieces.push({ text: text.slice(cursor, at) });
    pieces.push({ issue: index });
    cursor = at + issue.word.length;
  });
  if (cursor < text.length) pieces.push({ text: text.slice(cursor) });
  return pieces;
}

type Resolution =
  { status: "fixed"; replacement: string } | { status: "ignored" };

/**
 * Spellcheck marks that behave like a proofreader. A wavy path draws under each
 * flagged word with `pathLength` on `flick` — the fastest spring in the set,
 * because a mark is a note, not an event — staggered by `cascade` so a
 * paragraph's worth arrives inside the choreography budget. Hovering or
 * focusing a word raises the suggestion; Accept swaps the word (the old copy
 * fades, the new one enters from a `nudge`) and retracts the squiggle back
 * along its own path, while Ignore leaves the word alone and dissolves the mark.
 *
 * Each flagged word is a button described by its suggestion, so the fix is
 * reachable by Tab alone: Tab into the word, Tab again into Accept and Ignore,
 * Escape closes the bubble. Resolving one moves focus to the next open word, so
 * a run of fixes never drops the reader back at the top of the document. The
 * bubble is measured against the text block and clamped to it, so it stays on
 * screen at any width. Under reduced motion the squiggles are simply there.
 */
export function SquiggleMark({
  text,
  issues,
  onFix,
  className,
}: SquiggleMarkProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const hostRef = React.useRef<HTMLParagraphElement>(null);
  const wordRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const closeRef = React.useRef<number | null>(null);

  const [resolved, setResolved] = React.useState<Record<number, Resolution>>(
    {},
  );
  const [bubble, setBubble] = React.useState<{
    index: number;
    left: number;
    offset: number;
    width: number;
    below: boolean;
  } | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const pieces = React.useMemo(() => readPieces(text, issues), [text, issues]);

  React.useEffect(
    () => () => {
      if (closeRef.current !== null) window.clearTimeout(closeRef.current);
    },
    [],
  );

  const cancelClose = () => {
    if (closeRef.current === null) return;
    window.clearTimeout(closeRef.current);
    closeRef.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeRef.current = window.setTimeout(() => setBubble(null), CLOSE_DELAY);
  };

  // Measured in the event that opens the bubble — never during render — and
  // clamped to the text block, so a word at either margin still gets a bubble
  // that sits inside the column.
  const openBubble = (index: number, node: HTMLElement) => {
    const host = hostRef.current;
    if (!host) return;
    const word = node.getBoundingClientRect();
    const box = host.getBoundingClientRect();
    const width = Math.min(BUBBLE_WIDTH, box.width);
    const centred = word.left - box.left + word.width / 2 - width / 2;
    const top = word.top - box.top;
    const roomAbove = top;
    const roomBelow = box.height - (word.bottom - box.top);
    // A word on the first line has no room above it, so its bubble drops —
    // but a word on the last line rises even when the block is short, or the
    // bubble would hang below everything.
    const below = roomAbove < BUBBLE_HEIGHT && roomBelow >= roomAbove;
    setBubble({
      index,
      width,
      left: Math.max(0, Math.min(box.width - width, centred)),
      below,
      offset: below ? word.bottom - box.top + 6 : box.height - top + 6,
    });
  };

  const resolve = (index: number, next: Resolution) => {
    const issue = issues[index];
    if (!issue) return;
    cancelClose();
    setBubble(null);
    setResolved((prev) => ({ ...prev, [index]: next }));
    setAnnounce(
      next.status === "fixed"
        ? `${issue.word} replaced with ${next.replacement}`
        : `${issue.word} ignored`,
    );
    onFix?.(issue.word, next.status === "fixed" ? next.replacement : null);
    // The button that had focus is about to leave; hand focus on rather than
    // dropping the reader back to the top of the page.
    const stillOpen = issues
      .map((_, other) => other)
      .filter((other) => other !== index && !resolved[other]);
    const target =
      stillOpen.find((other) => other > index) ??
      stillOpen[stillOpen.length - 1];
    if (target !== undefined) wordRefs.current[target]?.focus();
  };

  const stagger = cascade(issues.length);

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <p ref={hostRef} className="relative text-sm leading-7 text-foreground">
        {pieces.map((piece, position) => {
          if (piece.issue === undefined) {
            return <span key={`run-${position}`}>{piece.text}</span>;
          }
          const index = piece.issue;
          const issue = issues[index];
          if (!issue) return null;
          const state = resolved[index];
          const display =
            state?.status === "fixed" ? state.replacement : issue.word;
          const swapped = display !== issue.word;
          const descId = `${baseId}-fix-${index}`;
          const wave = squigglePath(issue.word.length);
          const shown = bubble?.index === index;
          const bubbleId = `${baseId}-bubble-${index}`;

          return (
            <React.Fragment key={`issue-${index}`}>
              {/* The invisible copy sizes the box; both the live word and the
                  one it replaces sit on top of it, so the swap never collapses
                  the line to zero width mid-cross-fade. */}
              <span className="relative inline-block align-baseline leading-none">
                <span className="invisible">{display}</span>
                <AnimatePresence initial={false}>
                  {state ? (
                    <motion.span
                      key="resolved"
                      initial={
                        swapped && motionSafe
                          ? { opacity: 0, y: distances.nudge }
                          : false
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? springs.glide
                          : { duration: durations.fast }
                      }
                      className="absolute top-0 left-0 whitespace-pre"
                    >
                      {display}
                    </motion.span>
                  ) : (
                    <motion.button
                      key="open"
                      ref={(node) => {
                        wordRefs.current[index] = node;
                      }}
                      type="button"
                      aria-describedby={descId}
                      aria-expanded={shown}
                      aria-controls={shown ? bubbleId : undefined}
                      exit={{
                        opacity: 0,
                        transition: motionSafe
                          ? exitFor(durations.fast)
                          : { duration: 0 },
                      }}
                      onPointerEnter={(event) => {
                        cancelClose();
                        openBubble(index, event.currentTarget);
                      }}
                      onPointerLeave={scheduleClose}
                      onFocus={(event) => {
                        cancelClose();
                        openBubble(index, event.currentTarget);
                      }}
                      onClick={(event) =>
                        openBubble(index, event.currentTarget)
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        setBubble(null);
                      }}
                      className="absolute top-0 left-0 cursor-pointer rounded-1 whitespace-pre text-foreground underline-offset-4 outline-none hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {display}
                    </motion.button>
                  )}
                </AnimatePresence>

                <svg
                  aria-hidden
                  viewBox={`0 0 ${wave.width} 4`}
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute -bottom-1 left-0 h-1 w-full overflow-visible text-danger"
                >
                  <motion.path
                    d={wave.d}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.2}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    pathLength={1}
                    initial={motionSafe ? { pathLength: 0, opacity: 1 } : false}
                    animate={{
                      // Accept retracts the mark along its own path; ignore
                      // dissolves it where it lies.
                      pathLength: state?.status === "fixed" ? 0 : 1,
                      opacity: state?.status === "ignored" ? 0 : 1,
                    }}
                    transition={
                      !motionSafe
                        ? { duration: state ? durations.fast : 0 }
                        : state
                          ? exitFor(durations.base)
                          : { ...springs.flick, delay: index * stagger }
                    }
                  />
                </svg>
              </span>
              <span id={descId} className="sr-only">
                Suggested: {issue.suggestion}
              </span>

              <AnimatePresence>
                {shown && bubble ? (
                  <motion.span
                    id={bubbleId}
                    role="group"
                    aria-label={`Suggestion for ${issue.word}`}
                    initial={
                      motionSafe
                        ? {
                            opacity: 0,
                            y: bubble.below
                              ? -distances.nudge
                              : distances.nudge,
                          }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe ? springs.snap : { duration: durations.fast }
                    }
                    style={{
                      left: bubble.left,
                      width: bubble.width,
                      [bubble.below ? "top" : "bottom"]: bubble.offset,
                    }}
                    onPointerEnter={cancelClose}
                    onPointerLeave={scheduleClose}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") return;
                      event.preventDefault();
                      setBubble(null);
                      wordRefs.current[index]?.focus();
                    }}
                    className="absolute z-20 flex flex-col gap-2 rounded-3 border border-hairline bg-popover p-2 text-popover-foreground shadow-raised"
                  >
                    <span
                      title={issue.suggestion}
                      className="truncate px-1 text-sm font-semibold"
                    >
                      {issue.suggestion}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Replace ${issue.word} with ${issue.suggestion}`}
                        onClick={() =>
                          resolve(index, {
                            status: "fixed",
                            replacement: issue.suggestion,
                          })
                        }
                        className="flex h-7 flex-1 cursor-pointer items-center justify-center rounded-2 bg-primary px-2 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        aria-label={`Ignore ${issue.word}`}
                        onClick={() => resolve(index, { status: "ignored" })}
                        className="flex h-7 flex-1 cursor-pointer items-center justify-center rounded-2 border border-hairline px-2 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        Ignore
                      </button>
                    </span>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </React.Fragment>
          );
        })}
      </p>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
