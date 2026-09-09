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

export type StopSlabStatus = "idle" | "streaming" | "stopped" | "done";

export type StopSlabProps = {
  ref?: React.Ref<HTMLElement>;
  /** The words that have arrived so far. */
  text?: string;
  /** Where the stream is. */
  status?: StopSlabStatus;
  /** Fires from the Stop press, or Escape inside the surface. */
  onStop?: () => void;
  /** Fires from the Regenerate press. */
  onRegenerate?: () => void;
  /** An invented model name for the header chip. */
  model?: string;
  /** Names the surface for assistive technology. */
  label: string;
  className?: string;
};

/** The dot the control is born as, in px. */
const DOT = 10;
/** The slab's height and the round regenerate control's diameter, in px. */
const SLAB = 32;
/** How long the dot is a dot before it grows. */
const DOT_BEAT = 0.18;

/**
 * An answer surface whose stop control grows into being. When streaming
 * starts a dot pops in on `snap` at the surface's foot, and a beat later grows
 * on `glide` into a slab wide enough for a square glyph and the word Stop —
 * its width measured off the label with a ResizeObserver, never reserved. It
 * is one button the whole time. Pressing it fires `onStop`, squashes on
 * `flick`, and the slab shrinks on `glide` to a round control whose arrow
 * draws on `flick`: Regenerate. The words stay, and a cap mark lands after
 * the last one on `snap` to say so. A stream that ends on its own shrinks the
 * slab the same way, without the cap.
 *
 * Escape anywhere inside the surface is Stop while streaming; the button's
 * name follows its job, and a status region announces the stop or the finish.
 * Under reduced motion the control cross-fades between its sizes, nothing
 * squashes, and the arrow appears whole.
 */
export function StopSlab({
  ref,
  text = "",
  status = "idle",
  onStop,
  onRegenerate,
  model,
  label,
  className,
}: StopSlabProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const words = React.useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const streaming = status === "streaming";

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      const next = box ? box.blockSize : node.getBoundingClientRect().height;
      setHeight(Math.ceil(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The slab is as wide as its label, read off the label itself.
  const labelRef = React.useRef<HTMLSpanElement | null>(null);
  const [slabWidth, setSlabWidth] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = labelRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      const next = box ? box.inlineSize : node.getBoundingClientRect().width;
      setSlabWidth(Math.ceil(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [status]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const size = streaming
    ? { width: slabWidth ?? DOT, height: slabWidth ? SLAB : DOT }
    : { width: SLAB, height: SLAB };

  const announcement =
    status === "stopped"
      ? `Stopped, kept ${words.length} words`
      : status === "done"
        ? "Answer complete"
        : "";
  const foot =
    status === "idle"
      ? "Waiting"
      : `${words.length} ${words.length === 1 ? "word" : "words"}`;

  return (
    <section
      ref={ref}
      aria-labelledby={labelId}
      aria-busy={streaming || undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && streaming) {
          event.preventDefault();
          onStop?.();
        }
      }}
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
          {status !== "idle" ? (
            <motion.span
              key={status}
              aria-hidden
              className={cn(
                "font-mono text-[10px] tracking-[0.08em] uppercase",
                streaming
                  ? "text-cobalt-bright"
                  : status === "stopped"
                    ? "text-warn"
                    : "text-ink-3",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {status === "done" ? "complete" : status}
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
            {words.length === 0 ? (
              <span className="text-ink-3">Nothing yet.</span>
            ) : null}
            {words.map((word, index) => (
              <React.Fragment key={index}>
                {index > 0 ? " " : null}
                <motion.span
                  className="inline-block"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={fade}
                >
                  {word}
                </motion.span>
              </React.Fragment>
            ))}
            <AnimatePresence initial={false}>
              {status === "stopped" && words.length > 0 ? (
                <motion.span
                  key="cap"
                  aria-hidden
                  className="ml-1.5 inline-flex items-center gap-1 align-baseline"
                  initial={
                    motionSafe
                      ? { opacity: 0, x: -distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe ? { ...springs.snap, opacity: fade } : fade
                  }
                >
                  <span className="h-[0.9em] w-px bg-warn" />
                  <span className="font-mono text-[10px] tracking-[0.08em] text-warn uppercase">
                    kept
                  </span>
                </motion.span>
              ) : null}
            </AnimatePresence>
          </p>
        </div>
      </motion.div>

      <div className="flex h-11 items-center justify-between gap-3 border-t border-hairline px-3">
        <span
          aria-hidden
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums"
        >
          {foot}
        </span>
        <AnimatePresence initial={false}>
          {status !== "idle" ? (
            <motion.button
              key="control"
              type="button"
              aria-label={streaming ? "Stop generating" : "Regenerate"}
              onClick={() => (streaming ? onStop?.() : onRegenerate?.())}
              initial={
                motionSafe
                  ? { width: DOT, height: DOT, opacity: 0, scale: 0.6 }
                  : { ...size, opacity: 0 }
              }
              animate={{ ...size, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              whileTap={motionSafe ? { scaleX: 1.02, scaleY: 0.94 } : undefined}
              transition={
                motionSafe
                  ? {
                      // The dot is a dot for a beat before it grows; the
                      // pop-in itself is immediate.
                      width: { ...springs.glide, delay: DOT_BEAT },
                      height: { ...springs.glide, delay: DOT_BEAT },
                      scale: springs.snap,
                      scaleX: springs.flick,
                      scaleY: springs.flick,
                      opacity: fade,
                    }
                  : { duration: 0, opacity: fade }
              }
              className={cn(
                "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                streaming
                  ? "bg-primary text-primary-foreground"
                  : "border border-hairline-strong bg-surface-2 text-foreground hover:bg-accent",
              )}
            >
              <motion.span
                ref={labelRef}
                aria-hidden={!streaming}
                className="absolute top-0 left-0 flex h-8 items-center gap-1.5 pr-3 pl-2.5 whitespace-nowrap"
                animate={{ opacity: streaming && slabWidth ? 1 : 0 }}
                transition={
                  motionSafe
                    ? { ...fade, delay: streaming ? DOT_BEAT : 0 }
                    : fade
                }
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="size-3 shrink-0"
                >
                  <rect
                    x="3"
                    y="3"
                    width="10"
                    height="10"
                    rx="1.5"
                    fill="currentColor"
                  />
                </svg>
                <span className="text-xs font-medium">Stop</span>
              </motion.span>
              <motion.svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute size-4"
                animate={{ opacity: streaming ? 0 : 1 }}
                transition={fade}
              >
                {/* The arrow draws when the control becomes Regenerate: the
                    confirmation that the stream is halted, on flick. */}
                <motion.path
                  d="M13 8.5a5 5 0 1 1-1.5-3.6M13 3v2.5h-2.5"
                  pathLength={1}
                  initial={false}
                  animate={{ pathLength: streaming ? 0 : 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </motion.svg>
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </section>
  );
}
