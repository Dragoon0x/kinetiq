"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StreamRetryProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The answer arrived so far. Append-only across a retry. */
  text: string;
  /** The stream is open and words are arriving. @default false */
  streaming?: boolean;
  /** The stream dropped: the tail frays and Retry shows. @default false */
  failed?: boolean;
  /** The short line beside the Retry control. @default "Connection dropped" */
  error?: string;
  /** Fires from the Retry control. The host resumes from the seam. */
  onRetry?: () => void;
  /** Copy on the Retry control. @default "Retry" */
  retryLabel?: string;
  /** Names the answer region for assistive technology. */
  label: string;
  /** The model's name for the header chip. */
  model?: string;
  className?: string;
};

/** A word boundary: the seam between a non-space and the space that follows it. */
const WORDS = /(?<=\S)(?=\s)/;
/** Characters before the seam that fray. */
const FRAY = 6;
const DOTS = 5;

const countWords = (value: string): number =>
  value.trim().split(/\s+/).filter(Boolean).length;

/**
 * A stream that can fail mid-answer and pick itself back up. Words mount with
 * a `durations.fast` fade. When the host marks the stream `failed` the
 * component records the seam — the character count at that moment — and the
 * tail frays: the last six characters step down in opacity on a
 * `durations.base` tween, five dots cascade in after them, spaced wider as
 * they go, and an inline Retry control arrives from `distances.step` on
 * `snap`. Nothing bounces; a failure is not an event to celebrate.
 *
 * Retry fires `onRetry`. When the host reopens the stream the seam heals: the
 * frayed characters return to full ink, the dots and the control leave on the
 * exit ease, and a hairline under the seam brightens in `cobalt-bright` and
 * fades over `durations.slow`, so the reader can see exactly where the answer
 * was joined. A faint dotted underline stays at the seam afterwards.
 *
 * The text is one real paragraph whose frayed characters keep their content;
 * the live region reports the drop, the resume and the close as sentences,
 * never a word. Under reduced motion the fray is applied at once, the dots
 * and the control appear without cascade or travel, and the heal is an
 * opacity swap.
 */
export function StreamRetry({
  ref,
  text,
  streaming = false,
  failed = false,
  error = "Connection dropped",
  onRetry,
  retryLabel = "Retry",
  label,
  model,
  className,
}: StreamRetryProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const frameRef = React.useRef<HTMLDivElement | null>(null);

  // The seam is where the text stood when the drop was reported. It is decided
  // during render from the committed flag, so no effect runs behind the paint;
  // a text that shrank under it (a replay) clears it.
  const [seam, setSeam] = React.useState({ failed, at: -1, count: 0 });
  const stale = seam.at > text.length;
  if (seam.failed !== failed || stale) {
    setSeam(
      failed
        ? { failed: true, at: text.length, count: stale ? 1 : seam.count + 1 }
        : {
            failed: false,
            at: stale ? -1 : seam.at,
            count: stale ? 0 : seam.count,
          },
    );
  }

  const at = seam.at;
  const hasSeam = at >= 0 && at <= text.length;
  const frayStart = hasSeam ? Math.max(0, at - FRAY) : text.length;
  const before = text.slice(0, frayStart);
  const frayed = hasSeam ? text.slice(frayStart, at) : "";
  const after = hasSeam ? text.slice(at) : "";
  const healed = hasSeam && !failed;

  const words = countWords(text);
  const seamWord = hasSeam ? countWords(text.slice(0, at)) : 0;
  const done = !streaming && !failed && text.length > 0;
  const announcement = failed
    ? `Stream interrupted after ${words} ${words === 1 ? "word" : "words"}. Retry available.`
    : done
      ? `Response complete, ${words} words.`
      : healed && streaming
        ? `Resumed from word ${seamWord}.`
        : "";

  const state = failed
    ? "dropped"
    : streaming
      ? "streaming"
      : done
        ? "complete"
        : "ready";

  const wordFade = { duration: durations.fast, ease: easings.enter } as const;
  const stagger = cascade(DOTS);

  const wordsOf = (body: string, prefix: string) =>
    body.length === 0
      ? null
      : body.split(WORDS).map((word, index) => (
          <motion.span
            key={`${prefix}-${index}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={wordFade}
          >
            {word}
          </motion.span>
        ));

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
              failed
                ? "bg-danger"
                : streaming
                  ? "bg-cobalt-bright"
                  : "bg-ink-3",
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
        <span
          aria-hidden
          className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {state}
        </span>
      </div>

      <p className="min-w-0 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
        {text.length === 0 ? (
          <span className="text-ink-3">
            {streaming ? "Waiting for the first word." : "No answer yet."}
          </span>
        ) : null}
        {wordsOf(before, "b")}
        {hasSeam ? (
          <span
            className={cn(
              "relative",
              healed && "border-b border-dotted border-hairline-strong",
            )}
          >
            {frayed.split("").map((char, index) => (
              <motion.span
                key={index}
                initial={{ opacity: 1 }}
                animate={{
                  opacity: failed
                    ? Number(
                        (
                          0.85 -
                          (0.7 * index) / Math.max(1, frayed.length - 1)
                        ).toFixed(3),
                      )
                    : 1,
                }}
                transition={{
                  duration: motionSafe ? durations.base : durations.fast,
                  ease: easings.move,
                }}
              >
                {char}
              </motion.span>
            ))}
            {healed ? (
              <motion.span
                key={`heal-${seam.count}`}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-cobalt-bright"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ) : null}
          </span>
        ) : null}
        <AnimatePresence initial={false}>
          {failed
            ? Array.from({ length: DOTS }, (_, index) => (
                <motion.span
                  key={`dot-${index}`}
                  aria-hidden
                  style={{ marginLeft: 3 + index * 2 }}
                  className="inline-block size-[3px] rounded-full bg-ink-3 align-middle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: Number((1 - index * 0.15).toFixed(3)) }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    duration: durations.fast,
                    ease: easings.enter,
                    delay: motionSafe ? index * stagger : 0,
                  }}
                />
              ))
            : null}
          {failed ? (
            <motion.span
              key="retry"
              className="ml-2 inline-flex items-center gap-2 align-middle"
              initial={
                motionSafe ? { opacity: 0, x: distances.step } : { opacity: 0 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <span className="text-xs text-danger">{error}</span>
              <button
                type="button"
                onClick={() => {
                  // The control leaves with the heal; parking focus on the
                  // region keeps the reader inside the answer.
                  frameRef.current?.focus();
                  onRetry?.();
                }}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-full border border-hairline-strong bg-surface-0 px-2 text-[11px] font-medium text-foreground transition-colors outline-none hover:bg-accent",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="size-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 8a5 5 0 1 1-1.5-3.6" />
                  <path d="M13 3v3h-3" />
                </svg>
                {retryLabel}
              </button>
            </motion.span>
          ) : null}
        </AnimatePresence>
        {wordsOf(after, "a")}
      </p>

      <div
        aria-hidden
        className="flex items-center justify-between gap-3 border-t border-hairline pt-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        <span className="tabular-nums">{words} words</span>
        <span className="tabular-nums">
          {seam.count === 0
            ? "no retries"
            : `${seam.count} ${seam.count === 1 ? "retry" : "retries"}`}
        </span>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
