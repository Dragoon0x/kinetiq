"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SeedConfirmProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The word numbers being checked, in ask order. */
  positions: number[];
  /** The correct word for each position; same length as `positions`. */
  answers: string[];
  /** The tray, in display order — the answers plus decoys. Must be distinct. */
  options: string[];
  /** Controlled placements, shortest first: `["harbour"]` fills slot one. */
  value?: string[];
  /** Initial placements for uncontrolled usage. */
  defaultValue?: string[];
  onValueChange?: (placed: string[]) => void;
  /** Fires from the pick that put the wrong word in the active slot. */
  onMistake?: (position: number, word: string) => void;
  /** Fires from the pick that filled the last slot. */
  onComplete?: () => void;
  /** Visible heading. @default "Confirm your phrase" */
  label?: React.ReactNode;
  className?: string;
};

const NO_WORDS: string[] = [];

/** Long enough to read a refusal, short enough not to block the next pick. */
const REJECT_MS = 460;

/** A spring may only hold two keyframes, so the refusal is a tween by construction. */
const SHAKE_LEFT = [0, -6, 6, -4, 0];
const SHAKE_RIGHT = [0, 6, -6, 4, 0];

/**
 * The check that follows a backup. Numbered slots ask for three of the phrase's
 * words; the tray beneath holds them shuffled among decoys. A right pick flies
 * the chip out of the tray and into its slot — a shared `layoutId` move on
 * `glide`, so one chip travels rather than blinking out of one place and into
 * another — while the tray closes the gap behind it on the same spring.
 *
 * A wrong pick never moves. The chip shakes on a four-keyframe tween, the
 * active slot tints danger, and the miss is counted; nothing is placed, so
 * there is nothing to take back. Backspace lifts the last placed word out of
 * its slot and back to the tray along the same path. Filling the last slot
 * stamps: the seal lands from 1.25× on `recoil`, whose ζ0.53 gives the two
 * bounces of a stamp hitting paper.
 *
 * The tray is a `role="group"` with a roving tabindex — Arrow keys step, Home
 * and End jump, Enter or Space picks, Backspace undoes — and every outcome is
 * spoken by a polite status region rather than by colour. Under reduced motion
 * chips swap into their slots and a refusal tints instead of shaking, but the
 * count and the miss tally still move, because the score of the check is the
 * information.
 */
export function SeedConfirm({
  ref,
  positions,
  answers,
  options,
  value,
  defaultValue,
  onValueChange,
  onMistake,
  onComplete,
  label = "Confirm your phrase",
  className,
}: SeedConfirmProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    defaultValue ?? NO_WORDS,
  );
  const isControlled = value !== undefined;
  const placed = isControlled ? value : uncontrolled;

  const [misses, setMisses] = React.useState(0);
  const [reject, setReject] = React.useState<{
    word: string;
    id: number;
  } | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [focusSeq, setFocusSeq] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  // Keyed by word, not by position: motion memoises the ref it forwards, so a
  // chip's callback runs at mount only, and a tray that shrinks would leave
  // every surviving chip parked at its mount-time index.
  const chipRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const focusWord = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (reject === null) return;
    const timer = window.setTimeout(() => setReject(null), REJECT_MS);
    return () => window.clearTimeout(timer);
  }, [reject]);

  // The tray shrinks under the keyboard as chips leave it, so focus is put back
  // after the commit that removed one — never during render.
  React.useEffect(() => {
    if (focusSeq === 0) return;
    const word = focusWord.current;
    if (word) chipRefs.current.get(word)?.focus();
  }, [focusSeq]);

  const total = positions.length;
  const activeIndex = Math.min(placed.length, total - 1);
  const complete = placed.length >= total && total > 0;
  const remaining = options.filter((word) => !placed.includes(word));

  const commit = (next: string[]) => {
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const pick = (word: string, index: number, fromKey: boolean) => {
    if (complete) return;
    const position = positions[activeIndex];
    if (position === undefined) return;
    if (answers[activeIndex] !== word) {
      setReject((prev) => ({ word, id: (prev?.id ?? 0) + 1 }));
      setMisses((count) => count + 1);
      setAnnouncement(`${word} is not word ${position}`);
      onMistake?.(position, word);
      return;
    }
    const next = [...placed, word];
    commit(next);
    setAnnouncement(
      next.length >= total
        ? "Phrase confirmed"
        : `${word} placed at word ${position}`,
    );
    if (fromKey) {
      const left = remaining.filter((other) => other !== word);
      const at = Math.max(0, Math.min(index, left.length - 1));
      focusWord.current = left[at] ?? null;
      setFocusIndex(at);
      setFocusSeq((seq) => seq + 1);
    }
    if (next.length >= total) onComplete?.();
  };

  const undo = (fromKey: boolean) => {
    const word = placed[placed.length - 1];
    if (word === undefined) return;
    const next = placed.slice(0, -1);
    commit(next);
    setAnnouncement(`${word} returned to the tray`);
    if (fromKey) {
      const back = options.filter(
        (other) => other === word || !next.includes(other),
      );
      focusWord.current = word;
      setFocusIndex(Math.max(0, back.indexOf(word)));
      setFocusSeq((seq) => seq + 1);
    }
  };

  const moveFocus = (index: number) => {
    const clamped = Math.min(remaining.length - 1, Math.max(0, index));
    setFocusIndex(clamped);
    const word = remaining[clamped];
    if (word) chipRefs.current.get(word)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveFocus(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveFocus(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(0);
        break;
      case "End":
        event.preventDefault();
        moveFocus(remaining.length - 1);
        break;
      case "Backspace":
      case "Delete":
        event.preventDefault();
        undo(true);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const word = remaining[index];
        if (word !== undefined) pick(word, index, true);
        break;
      }
      default:
        break;
    }
  };

  const chipTransition = motionSafe ? springs.glide : { duration: 0 };
  // Alternating the shake's direction guarantees a fresh keyframe array, so a
  // second refusal on the same chip re-runs instead of matching the last one.
  const shakeKeys = (reject?.id ?? 0) % 2 === 0 ? SHAKE_LEFT : SHAKE_RIGHT;
  const chipClass =
    "flex h-8 items-center rounded-2 border px-2.5 font-mono text-[11px] transition-colors";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {placed.length} / {total}
          {misses > 0 ? ` · ${misses} miss${misses === 1 ? "" : "es"}` : ""}
        </span>
      </div>

      <ol aria-labelledby={labelId} className="flex flex-col gap-1.5">
        {positions.map((position, index) => {
          const word = placed[index];
          const isActive = !complete && index === activeIndex;
          const isWrong = reject !== null && isActive;
          return (
            <li
              key={position}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "flex h-11 items-center gap-2 rounded-2 border px-2 transition-colors",
                isWrong
                  ? "border-danger bg-surface-2"
                  : word
                    ? "border-hairline bg-surface-2"
                    : isActive
                      ? "border-cobalt-bright bg-cobalt-wash"
                      : "border-hairline bg-surface-2",
              )}
            >
              <span className="sr-only">
                {word ? `Word ${position}, ${word}` : `Word ${position}, empty`}
              </span>
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-hairline-strong font-mono text-[10px] text-ink-3 tabular-nums"
              >
                {position}
              </span>
              {word ? (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? `${baseId}-chip-${word}` : undefined}
                  transition={chipTransition}
                  className={cn(
                    chipClass,
                    "border-hairline-strong bg-surface-0 text-foreground",
                  )}
                >
                  {word}
                </motion.span>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "h-8 flex-1 rounded-2 border border-dashed",
                    isActive
                      ? "border-cobalt-bright"
                      : "border-hairline-strong",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between gap-2">
        <span id={hintId} className="min-w-0 truncate text-[11px] text-ink-3">
          {complete
            ? "Every position filled."
            : `Pick the word for position ${positions[activeIndex]}.`}
        </span>
        <button
          type="button"
          disabled={placed.length === 0}
          onClick={() => undo(false)}
          className="flex h-7 shrink-0 items-center rounded-2 border border-input px-2.5 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Undo
        </button>
      </div>

      {/* One box holds either the tray or the seal, and animates its own height
          between them — nothing reserves room for a state that is not there. */}
      <motion.div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        layout={motionSafe ? "size" : false}
        transition={chipTransition}
        className="rounded-2 border border-hairline bg-surface-0 p-2"
      >
        {complete ? (
          <motion.p
            className="flex h-8 items-center justify-center gap-1.5 rounded-2 border border-success text-xs font-medium text-success"
            initial={
              motionSafe
                ? { scale: 1.25, rotate: -4, opacity: 0 }
                : { opacity: 0 }
            }
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={
              motionSafe
                ? { ...springs.recoil, opacity: { duration: durations.blink } }
                : { duration: durations.fast }
            }
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 shrink-0"
            >
              <motion.path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                initial={{ pathLength: motionSafe ? 0 : 1 }}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </svg>
            Phrase confirmed
          </motion.p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {remaining.map((word, index) => {
              const shaking = reject?.word === word;
              return (
                <motion.li
                  key={word}
                  layout={motionSafe ? "position" : false}
                  transition={chipTransition}
                >
                  <motion.button
                    ref={(node) => {
                      if (node) chipRefs.current.set(word, node);
                      else chipRefs.current.delete(word);
                    }}
                    type="button"
                    tabIndex={
                      index === Math.min(focusIndex, remaining.length - 1)
                        ? 0
                        : -1
                    }
                    onFocus={() => setFocusIndex(index)}
                    onClick={() => pick(word, index, false)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                    className="group rounded-2 outline-none"
                    animate={{ x: shaking && motionSafe ? shakeKeys : 0 }}
                    transition={{
                      duration: durations.base,
                      ease: easings.move,
                    }}
                  >
                    <motion.span
                      layoutId={
                        motionSafe ? `${baseId}-chip-${word}` : undefined
                      }
                      transition={chipTransition}
                      className={cn(
                        chipClass,
                        "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring",
                        shaking
                          ? "border-danger bg-surface-1 text-danger"
                          : "border-hairline-strong bg-surface-1 text-foreground group-hover:border-cobalt-bright group-hover:bg-cobalt-wash",
                      )}
                    >
                      {word}
                    </motion.span>
                  </motion.button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
