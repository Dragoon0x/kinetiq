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

export type CursorLeadProps = {
  ref?: React.Ref<HTMLElement>;
  /** The full answer. Words are split on whitespace. */
  text: string;
  /** How many words have arrived. Clamped to the word count. */
  landed?: number;
  /** Whether the stream is live; keeps the caret on the surface until the last word. */
  playing?: boolean;
  /** An invented model name for the header chip. */
  model?: string;
  /** Names the surface for assistive technology. */
  label: string;
  className?: string;
};

/** A word closes a sentence when it ends in terminal punctuation, quotes allowed. */
const endsSentence = (word: string): boolean => /[.!?]["')\]]*$/.test(word);

/**
 * A caret that leads. Instead of trailing the last letter, it steps ahead into
 * the next word's slot — an invisible copy of the coming word, sized exactly
 * like it — and waits there. The move is a `layout` animation on `snap`, one
 * crisp overshoot, because the caret is an indicator changing position; the
 * slot's underline draws in on `flick` as the caret arrives, and when the word
 * lands it fades up with a 4px nudge while its underline shrinks toward the
 * right edge, consumed by the letters.
 *
 * The surface is height-measured rather than reserved: a ResizeObserver on the
 * paragraph drives the outer box on `glide`, so a new line grows the surface
 * instead of jumping it. Assistive technology hears one sentence at a time —
 * the status region announces each sentence as its final word lands, and
 * "Answer complete" on settle — never a word or a token. Under reduced motion
 * the caret swaps position, words fade without the nudge, and the underline
 * fades instead of shrinking.
 */
export function CursorLead({
  ref,
  text,
  landed = 0,
  playing = false,
  model,
  label,
  className,
}: CursorLeadProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const words = React.useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const total = words.length;
  const shown = Math.max(0, Math.min(total, Math.floor(landed)));
  const settled = shown >= total && !playing;
  const nextWord = shown < total ? words[shown] : "";

  // The announcement is derived, never accumulated: the last sentence whose
  // final word has landed. Re-rendering with the same sentence leaves the
  // live region's text unchanged, so nothing is re-read.
  let sentenceEnd = -1;
  for (let i = shown - 1; i >= 0; i -= 1) {
    if (endsSentence(words[i] ?? "")) {
      sentenceEnd = i;
      break;
    }
  }
  let sentenceStart = 0;
  for (let i = sentenceEnd - 1; i >= 0; i -= 1) {
    if (endsSentence(words[i] ?? "")) {
      sentenceStart = i + 1;
      break;
    }
  }
  const sentence =
    sentenceEnd >= 0
      ? words.slice(sentenceStart, sentenceEnd + 1).join(" ")
      : "";
  const announcement = settled
    ? [sentence, "Answer complete."].filter(Boolean).join(" ")
    : sentence;

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      const next = box ? box.blockSize : node.getBoundingClientRect().height;
      // Ceil, not round: a fraction of a pixel lost clips the last line's
      // descenders under overflow-hidden.
      setHeight(Math.ceil(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const state = playing ? "streaming" : settled ? "complete" : "";

  return (
    <section
      ref={ref}
      aria-labelledby={labelId}
      aria-busy={playing || undefined}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-10 items-center justify-between gap-3 border-b border-hairline px-3">
        <span className="flex min-w-0 items-center gap-2">
          <span id={labelId} className="sr-only">
            {label}
          </span>
          {model ? (
            <span className="inline-flex h-6 items-center rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
              {model}
            </span>
          ) : null}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          {state ? (
            <motion.span
              key={state}
              aria-hidden
              className={cn(
                "font-mono text-[10px] tracking-[0.08em] uppercase",
                state === "streaming" ? "text-cobalt-bright" : "text-ink-3",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {state}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
      >
        <div ref={innerRef} className="px-3 py-3">
          <p className="text-sm leading-relaxed text-foreground">
            {words.slice(0, shown).map((word, index) => (
              <React.Fragment key={index}>
                {index > 0 ? " " : null}
                <motion.span
                  className="relative inline-block"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe ? { ...springs.flick, opacity: fade } : fade
                  }
                >
                  {word}
                  {/* The slot's underline, handed to the word: it starts full
                      where the slot drew it and is consumed from the left as
                      the letters take the space. */}
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-cobalt-bright/60"
                    style={{ originX: 1 }}
                    initial={motionSafe ? { scaleX: 1 } : { opacity: 1 }}
                    animate={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
                    transition={motionSafe ? springs.flick : fade}
                  />
                </motion.span>
              </React.Fragment>
            ))}

            {/* One slot for the life of the stream: the same element moves in
                the flow as words land before it, so the caret's `layout` move
                is a travel, not a remount. Only its exit is presence-managed.
                The space sits outside the slot: a leading space inside an
                inline-block collapses. */}
            {shown > 0 && !settled ? " " : null}
            <AnimatePresence initial={false}>
              {!settled ? (
                <motion.span
                  key="slot"
                  aria-hidden
                  className="relative inline-block whitespace-nowrap"
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                >
                  <span className="invisible">{nextWord}</span>
                  {nextWord ? (
                    <motion.span
                      key={`slot-${shown}`}
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-cobalt-bright/60"
                      style={{ originX: 0 }}
                      initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
                      animate={motionSafe ? { scaleX: 1 } : { opacity: 1 }}
                      transition={motionSafe ? springs.flick : fade}
                    />
                  ) : null}
                  <motion.span
                    layout={motionSafe ? "position" : false}
                    transition={springs.snap}
                    className="pointer-events-none absolute top-[0.15em] bottom-[0.15em] left-0 w-0.5 rounded-full bg-cobalt-bright"
                  />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </p>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </section>
  );
}
