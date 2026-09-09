"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AnswerSettleProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The answer arrived so far; a blank line separates paragraphs. Append-only. */
  text: string;
  /** The stream is open: the last paragraph stays provisional. @default false */
  streaming?: boolean;
  /** Fires when the final wash has finished crossing the answer. */
  onSettled?: () => void;
  /** Names the answer region for assistive technology. */
  label: string;
  /** The model's name for the header chip. */
  model?: string;
  className?: string;
};

/** A word boundary: the seam between a non-space and the space that follows it. */
const WORDS = /(?<=\S)(?=\s)/;
const PARAGRAPHS = /\n{2,}/;

/**
 * Streaming text that shows its own certainty. The paragraph still being
 * written is provisional — lighter ink, raised two pixels — and the moment
 * the next paragraph begins, or the stream closes, it settles: the ink deepens
 * on a `durations.slow` colour tween while the paragraph drops those two
 * pixels on `glide`, no overshoot, because settling is a surface coming to
 * rest. Words inside the provisional paragraph mount with a `durations.fast`
 * fade and no travel.
 *
 * When the stream closes a final wash runs over the whole answer: a
 * translucent band, sized by the article, travels from above the first line
 * to below the last over `durations.page` on the move ease, then leaves.
 * `onSettled` fires from its completion, so a host can mark the answer final
 * only once the reader has seen it become so.
 *
 * Every paragraph is a real `<p>`, and the live region carries a paragraph
 * once as it settles — never a word. Under reduced motion provisional text is
 * lighter ink only, a settle is a colour swap, and the wash blinks in place
 * instead of travelling — it still fires `onSettled`, because the settle is
 * information.
 */
export function AnswerSettle({
  ref,
  text,
  streaming = false,
  onSettled,
  label,
  model,
  className,
}: AnswerSettleProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const parts = text.split(PARAGRAPHS);
  const paragraphs = parts
    .map((body, index) => ({
      body,
      index,
      // A paragraph is final once the next has begun or the stream has closed.
      complete: !streaming || index < parts.length - 1,
    }))
    .filter((paragraph) => paragraph.body.length > 0);

  const total = paragraphs.length;
  const settledCount = paragraphs.filter((p) => p.complete).length;
  const settledAll = !streaming && total > 0;

  // The wash runs once per completion. Holding the flag it was armed by in
  // state means a replay (stream reopens, text resets) disarms it during
  // render, and the next close arms a fresh one — no effect, no timer.
  const [wash, setWash] = React.useState({ armed: settledAll, done: false });
  if (wash.armed !== settledAll) {
    setWash({ armed: settledAll, done: false });
  }
  const washing = settledAll && !wash.done;

  const lastSettled = paragraphs.filter((p) => p.complete).at(-1)?.body ?? "";
  const announcement = settledAll
    ? `${lastSettled} Answer complete, ${total} ${total === 1 ? "paragraph" : "paragraphs"}.`
    : lastSettled;

  const state = streaming
    ? "streaming"
    : washing
      ? "settling"
      : settledAll
        ? "settled"
        : "ready";

  return (
    <div
      ref={ref}
      role="region"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex h-7 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              streaming ? "bg-cobalt-bright" : "bg-ink-3",
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

      <div className="relative overflow-hidden rounded-2">
        <div className="flex min-w-0 flex-col gap-3">
          {total === 0 ? (
            <p className="text-sm leading-relaxed text-ink-3">
              {streaming ? "Waiting for the first word." : "No answer yet."}
            </p>
          ) : null}
          {paragraphs.map((paragraph) => (
            <motion.p
              key={paragraph.index}
              initial={false}
              animate={{ y: paragraph.complete || !motionSafe ? 0 : -2 }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
              style={{
                transitionDuration: `${(motionSafe ? durations.slow : durations.fast) * 1000}ms`,
              }}
              className={cn(
                "min-w-0 text-sm leading-relaxed whitespace-pre-wrap transition-colors",
                paragraph.complete ? "text-foreground" : "text-ink-3",
              )}
            >
              {paragraph.body.split(WORDS).map((word, index) => (
                <motion.span
                  key={index}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                >
                  {word}
                </motion.span>
              ))}
            </motion.p>
          ))}
        </div>

        {/* The band stays mounted and parks above the article between runs,
            so completion is the only animation that can report — an exit
            would report too, and fire onSettled a second time. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-cobalt-wash to-transparent"
          initial={false}
          animate={
            washing
              ? motionSafe
                ? { y: "100%", opacity: 1 }
                : { y: "0%", opacity: [0, 0.8, 0] }
              : { y: motionSafe ? "-100%" : "0%", opacity: 0 }
          }
          transition={
            !washing
              ? { duration: 0 }
              : motionSafe
                ? { duration: durations.page, ease: easings.move }
                : {
                    y: { duration: 0 },
                    opacity: {
                      duration: durations.slow,
                      ease: "easeInOut",
                      times: [0, 0.5, 1],
                    },
                  }
          }
          onAnimationComplete={() => {
            // The park-back after a run completes too; only a crossing counts.
            if (!washing) return;
            setWash((prev) => ({ ...prev, done: true }));
            onSettled?.();
          }}
        />
      </div>

      <div
        aria-hidden
        className="flex items-center justify-between gap-3 border-t border-hairline pt-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        <span className="tabular-nums">
          {settledCount} of {total} settled
        </span>
        <span>{streaming ? "provisional" : settledAll ? "final" : ""}</span>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
