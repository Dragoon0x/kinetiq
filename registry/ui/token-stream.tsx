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

export type TokenStreamProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Tokens that have arrived so far, in order, carrying their own leading spaces. Append-only. */
  chunks: string[];
  /** The stream is open: the caret breathes and the Stop control shows. @default false */
  streaming?: boolean;
  /** The reader cut the stream: the caret becomes a full stop. @default false */
  stopped?: boolean;
  /** Fires from the Stop control. The host closes the stream and sets `stopped`. */
  onStop?: () => void;
  /** Names the response region for assistive technology. */
  label: string;
  /** The model's name for the header chip. */
  model?: string;
  /** Copy on the Stop control. @default "Stop" */
  stopLabel?: string;
  className?: string;
};

const ENDS_SENTENCE = /[.!?]["')\]]?\s*$/;
const SENTENCES = /[^.!?]+[.!?]+["')\]]?/g;

/** One past the last chunk that closes a sentence. */
function sentenceCut(chunks: string[]): number {
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    if (ENDS_SENTENCE.test(chunks[index] ?? "")) return index + 1;
  }
  return 0;
}

/** The caret's two shapes, in px so one spring can morph between them. */
const BAR = { width: 2, height: 14, borderRadius: 1, y: 2 };
const STOP = { width: 5, height: 5, borderRadius: 3, y: 0 };

/**
 * A response surface where the words arrive, not the answer. The host feeds
 * the tokens so far and whether the stream is open; the component keeps no
 * clock. Each token mounts with a `durations.fast` fade and no travel — a word
 * landing is information, not a thing moving — and the caret rides the inline
 * flow, so it is always exactly where the next token will land without a
 * measurement. While the stream is open the caret breathes, an ease-in-out
 * loop at the ambient tempo of `drift`.
 *
 * Stop arrives in the header on `snap` while streaming. When the host marks the
 * stream `stopped` the caret morphs into a full stop on the same spring: the
 * bar shrinks to a dot and drops to the baseline, so the cut reads as
 * punctuation rather than failure. A stream that ends naturally lets the caret
 * fade on the exit ease.
 *
 * The text is a real paragraph and the live region carries one completed
 * sentence at a time, never a token. Under reduced motion the component
 * appends in sentences: tokens are held until one closes a sentence, then the
 * sentence appears at once, and the caret holds still at mid opacity.
 */
export function TokenStream({
  ref,
  chunks,
  streaming = false,
  stopped = false,
  onStop,
  label,
  model,
  stopLabel = "Stop",
  className,
}: TokenStreamProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const frameRef = React.useRef<HTMLDivElement | null>(null);

  const open = streaming && !stopped;
  // Reduced motion reads in sentences: a closed stream shows everything, an
  // open one shows up to the last full stop.
  const shown =
    motionSafe || !open ? chunks : chunks.slice(0, sentenceCut(chunks));
  const text = shown.join("");
  const done = chunks.length > 0 && !open && !stopped;

  const sentences = text.match(SENTENCES) ?? [];
  const tail = text.slice(sentences.join("").length).trim();
  const lastSentence = sentences[sentences.length - 1]?.trim() ?? "";
  const announcement = stopped
    ? "Stopped."
    : done && tail
      ? tail
      : lastSentence;

  const state = open
    ? "streaming"
    : stopped
      ? "stopped"
      : done
        ? "complete"
        : "ready";

  const breath = {
    duration: 0.9,
    ease: "easeInOut" as const,
    repeat: Infinity,
    repeatType: "reverse" as const,
  };

  return (
    <div
      ref={(node) => {
        frameRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      role="region"
      aria-labelledby={labelId}
      tabIndex={-1}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4 outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <div className="flex h-7 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              open ? "bg-cobalt-bright" : "bg-ink-3",
            )}
          />
          <span id={labelId} className="sr-only">
            {label}
          </span>
          <span
            aria-hidden
            className="truncate text-xs font-medium text-ink-2"
            title={model ?? label}
          >
            {model ?? label}
          </span>
        </span>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.button
              key="stop"
              type="button"
              onClick={() => {
                // The control leaves with the stream; parking focus on the
                // region keeps the reader inside the answer rather than on
                // the document body.
                frameRef.current?.focus();
                onStop?.();
              }}
              initial={
                motionSafe ? { opacity: 0, x: distances.nudge } : { opacity: 0 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-0 px-2.5 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <svg viewBox="0 0 16 16" aria-hidden className="size-3 shrink-0">
                <rect
                  x="3.5"
                  y="3.5"
                  width="9"
                  height="9"
                  rx="1.5"
                  fill="currentColor"
                />
              </svg>
              {stopLabel}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <p className="min-w-0 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
        {shown.map((chunk, index) => (
          <motion.span
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {chunk}
          </motion.span>
        ))}
        <AnimatePresence initial={false}>
          {!done ? (
            <motion.span
              key="caret"
              aria-hidden
              style={{ originY: 1 }}
              className="ml-px inline-block bg-cobalt-bright align-baseline"
              initial={false}
              animate={
                stopped
                  ? { ...STOP, opacity: 1, scaleY: 1 }
                  : open && motionSafe
                    ? { ...BAR, opacity: [1, 0.3], scaleY: [1, 0.85] }
                    : { ...BAR, opacity: open ? 0.6 : 1, scaleY: 1 }
              }
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                !motionSafe
                  ? { duration: 0 }
                  : open && !stopped
                    ? { ...springs.snap, opacity: breath, scaleY: breath }
                    : {
                        ...springs.snap,
                        opacity: { duration: durations.fast },
                      }
              }
            />
          ) : null}
        </AnimatePresence>
      </p>

      <div
        aria-hidden
        className="flex items-center justify-between gap-3 border-t border-hairline pt-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        <span className="tabular-nums">{chunks.length} tokens</span>
        <span>{state}</span>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
