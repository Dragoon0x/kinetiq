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

export type SeedRevealProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The phrase, in order. Twelve or twenty-four — the grid takes any length. */
  words: string[];
  /** Milliseconds between words while the control is held. @default 120 */
  revealMs?: number;
  /** Visible heading for the card. @default "Recovery phrase" */
  label?: React.ReactNode;
  /** Copy on the hold control. @default "Hold to reveal" */
  holdLabel?: string;
  /** Fires from the tick that uncovers a word never seen before. */
  onSeenChange?: (seen: number, total: number) => void;
  /** Fires from the tick that uncovers the last word. */
  onRevealComplete?: () => void;
  /** Fires from the copy press once the clipboard has answered. */
  onCopy?: (ok: boolean) => void;
  className?: string;
};

/** A redaction plate, drawn rather than tinted, so it survives both themes. */
const HATCH =
  "repeating-linear-gradient(45deg, var(--hairline-strong) 0 1px, transparent 1px 5px)";

/** How long the copied stamp stays over the control before it lifts. */
const STAMP_MS = 1300;

/**
 * A recovery phrase you have to look at. Words sit under hatched plates until
 * the control is held; holding walks a timer down the grid so plates lift one
 * at a time on `snap` — one crisp overshoot each, the physics of an indicator
 * changing position — while the word beneath arrives from a `nudge`. Letting
 * go re-covers the whole grid at once on the exit ease, because a secret
 * closes faster than it opens.
 *
 * The walk is measured, not decorative: the furthest word reached is kept as
 * "seen", drawn as a meter, and the copy control stays shut until every word
 * has been uncovered at least once. Pointer release, pointer leave, blur,
 * Escape and the tab going hidden all end the hold — a phrase is never left
 * standing on an unattended screen.
 *
 * Covered words are not in the accessibility tree; each slot reads "Word 3,
 * hidden" until it has been revealed, and the hold control is a real button
 * that Space or Enter can hold down. Under reduced motion the plates swap
 * instead of lifting, but the walk still steps and the meter still fills —
 * how far the reveal got is information.
 */
export function SeedReveal({
  ref,
  words,
  revealMs = 120,
  label = "Recovery phrase",
  holdLabel = "Hold to reveal",
  onSeenChange,
  onRevealComplete,
  onCopy,
  className,
}: SeedRevealProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const meterId = `${baseId}-meter`;
  const gateId = `${baseId}-gate`;

  const total = words.length;

  const [holding, setHolding] = React.useState(false);
  const [revealed, setRevealed] = React.useState(0);
  const [seen, setSeen] = React.useState(0);
  const [copy, setCopy] = React.useState<"idle" | "done" | "failed">("idle");

  // Mirrors of the counters the interval advances. The tick needs the current
  // values without the effect re-subscribing on every step, and the parent
  // callbacks must fire from the tick rather than from a state updater.
  const revealedRef = React.useRef(0);
  const seenRef = React.useRef(0);
  // Latest callbacks, kept out of the timer effect's deps so a re-render
  // never restarts the walk mid-hold.
  const handlers = React.useRef({ onSeenChange, onRevealComplete });
  React.useEffect(() => {
    handlers.current = { onSeenChange, onRevealComplete };
  });

  const stop = React.useCallback(() => {
    revealedRef.current = 0;
    setRevealed(0);
    setHolding(false);
  }, []);

  React.useEffect(() => {
    if (!holding || total === 0) return;
    const timer = window.setInterval(
      () => {
        if (revealedRef.current >= total) return;
        const next = revealedRef.current + 1;
        revealedRef.current = next;
        setRevealed(next);
        if (next > seenRef.current) {
          seenRef.current = next;
          setSeen(next);
          handlers.current.onSeenChange?.(next, total);
          if (next === total) handlers.current.onRevealComplete?.();
        }
      },
      Math.max(16, revealMs),
    );
    return () => window.clearInterval(timer);
  }, [holding, revealMs, total]);

  // A hidden tab cannot be watched over, but it also cannot be trusted: end the
  // hold rather than leaving a phrase uncovered behind a switched-away window.
  React.useEffect(() => {
    if (!holding) return;
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [holding, stop]);

  React.useEffect(() => {
    if (copy === "idle") return;
    const timer = window.setTimeout(() => setCopy("idle"), STAMP_MS);
    return () => window.clearTimeout(timer);
  }, [copy]);

  const armed = total > 0 && seen >= total;

  const runCopy = () => {
    if (!armed) return;
    const clipboard =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) {
      setCopy("failed");
      onCopy?.(false);
      return;
    }
    clipboard.writeText(words.join(" ")).then(
      () => {
        setCopy("done");
        onCopy?.(true);
      },
      () => {
        setCopy("failed");
        onCopy?.(false);
      },
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      stop();
      return;
    }
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    // Auto-repeat would restart the walk from the top on every repeat tick.
    if (event.repeat) return;
    setHolding(true);
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    stop();
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const plateTransition = motionSafe
    ? { ...springs.snap, opacity: fade }
    : { duration: 0 };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
        <span
          id={meterId}
          className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
        >
          {seen} / {total} seen
        </span>
      </div>

      <span
        aria-hidden
        className="h-1 w-full overflow-hidden rounded-full bg-hairline-strong"
      >
        <motion.span
          className="block h-full origin-left rounded-full bg-cobalt-bright"
          initial={false}
          animate={{ scaleX: total === 0 ? 0 : seen / total }}
          transition={
            motionSafe
              ? springs.glide
              : { duration: durations.fast, ease: easings.enter }
          }
        />
      </span>

      <ol className="grid grid-cols-2 gap-1.5">
        {words.map((word, index) => {
          const open = index < revealed;
          return (
            <li
              key={`${index}-${word}`}
              className="flex h-8 items-center gap-2 rounded-2 border border-hairline bg-surface-2 pr-2 pl-1.5"
            >
              <span
                aria-hidden
                className="w-4 shrink-0 text-right font-mono text-[10px] text-ink-3 tabular-nums"
              >
                {index + 1}
              </span>
              {/* The word enters the accessibility tree only while its plate
                  is off, so what is spoken matches what is on screen. */}
              <span className="sr-only">
                {open ? `${index + 1}. ${word}` : `Word ${index + 1}, hidden`}
              </span>
              <span
                aria-hidden
                className="relative min-w-0 flex-1 overflow-hidden"
              >
                <motion.span
                  title={open ? word : undefined}
                  className="block truncate font-mono text-[11px] text-foreground"
                  initial={false}
                  animate={{
                    opacity: open ? 1 : 0,
                    y: motionSafe && !open ? distances.nudge : 0,
                  }}
                  transition={plateTransition}
                >
                  {word}
                </motion.span>
                {/* The plate lifts out of the slot rather than dissolving:
                    a cover that slides away reads as one being removed. */}
                <motion.span
                  className="absolute inset-0 rounded-1 bg-surface-0"
                  style={{ backgroundImage: HATCH }}
                  initial={false}
                  animate={{
                    opacity: open ? 0 : 1,
                    y: motionSafe && open ? "-100%" : "0%",
                  }}
                  transition={plateTransition}
                />
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-describedby={meterId}
          onPointerDown={() => setHolding(true)}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={stop}
          className={cn(
            "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-2 border px-3 text-xs font-medium transition-colors outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            holding
              ? "border-cobalt-bright bg-cobalt-wash text-foreground"
              : "border-input bg-surface-1 text-foreground hover:bg-accent",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0"
          >
            <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4Z" />
            <circle cx="8" cy="8" r="1.9" />
          </svg>
          {holdLabel}
        </button>

        <span className="relative flex-1">
          <button
            type="button"
            disabled={!armed}
            aria-label="Copy recovery phrase"
            aria-describedby={armed ? undefined : gateId}
            onClick={runCopy}
            className={cn(
              "flex h-8 w-full items-center justify-center gap-1.5 rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none",
              "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              className="size-4 shrink-0"
            >
              <rect x="5.25" y="5.25" width="8" height="8" rx="1.6" />
              <path d="M10.75 2.75h-8v8" strokeLinecap="round" />
            </svg>
            Copy phrase
          </button>

          {/* The stamp covers the control it belongs to, so nothing in the
              row moves and no sibling is overlapped. */}
          <AnimatePresence>
            {copy === "idle" ? null : (
              <motion.span
                key={copy}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 rounded-2 border bg-surface-0 text-xs font-medium",
                  copy === "done"
                    ? "border-success text-success"
                    : "border-warn text-warn",
                )}
                initial={
                  motionSafe
                    ? { scale: 1.25, rotate: -6, opacity: 0 }
                    : { opacity: 0 }
                }
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        opacity: { duration: durations.blink },
                      }
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
                    d={
                      copy === "done"
                        ? "M3.5 8.5 6.5 11.5 12.5 4.5"
                        : "M8 4v5M8 11.6v.4"
                    }
                    initial={{ pathLength: motionSafe ? 0 : 1 }}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </svg>
                {copy === "done" ? "Copied" : "Blocked"}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>

      <p id={gateId} className="text-[11px] text-ink-3">
        {armed
          ? "Every word has been seen. Write them down before you copy."
          : "Hold the control until all words have shown to unlock copy."}
      </p>

      <span role="status" className="sr-only">
        {copy === "done"
          ? "Recovery phrase copied."
          : copy === "failed"
            ? "Copy blocked. Write the words down instead."
            : armed
              ? `All ${total} words seen. Copy is available.`
              : ""}
      </span>
    </div>
  );
}
