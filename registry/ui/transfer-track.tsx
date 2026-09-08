"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TrackStop = {
  id: string;
  label: string;
};

export type TransferTrackProps = {
  ref?: React.Ref<HTMLElement>;
  /** The three stops, in order. */
  stops?: [TrackStop, TrackStop, TrackStop];
  /** Index of the furthest stop actually reached, 0–2. @default 0 */
  reached?: number;
  /** Formatted times per stop; a new entry stamps in. */
  stamps?: (string | undefined)[];
  /** The hop out of `reached` failed: the segment ahead turns danger. */
  failed?: boolean;
  /** The line shown beside Retry. @default "The hop was refused." */
  failureMessage?: string;
  /** Fires from the Retry press. Omit it and no Retry is offered. */
  onRetry?: () => void;
  /** The sum in flight, printed in the header. */
  amount?: number;
  /** Money formatter — the card never invents a currency. */
  format?: (value: number) => string;
  /** What the transfer is; names the region. */
  label: string;
  /** A quiet mono line under the header — the reference the host issued. */
  reference?: React.ReactNode;
  className?: string;
};

const DEFAULT_STOPS: [TrackStop, TrackStop, TrackStop] = [
  { id: "sent", label: "Sent" },
  { id: "moving", label: "On its way" },
  { id: "landed", label: "Landed" },
];

const NO_STAMPS: (string | undefined)[] = [];

/** Explicit locale: the server and the first client render must agree. */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const defaultFormat = (value: number) => MONEY.format(value);

/** A refused hop is drawn, not merely coloured — hatching survives both themes. */
const HATCH =
  "repeating-linear-gradient(45deg, var(--card) 0 1px, transparent 1px 4px)";

/**
 * Three stops and one payment moving between them. The travelling dot glides
 * from stop to stop on `glide` — ζ0.98, one settle and no bounce, because money
 * arriving is not an occasion to celebrate — and the rail behind it fills to the
 * same point on the same spring, so the line and the dot read as one object. The
 * track's width is measured by a ResizeObserver and the stop centres are derived
 * from it, so the dot lands true on the stop at any column width rather than on
 * a percentage that drifts.
 *
 * Reaching a stop stamps its time: the chip lands from 1.3× on `recoil`, ζ0.53,
 * the two bounces of a stamp hitting paper. Stops already stamped when the card
 * mounts render settled, so a transfer joined halfway does not stamp three times
 * at a viewer who watched nothing. Times arrive from the host as formatted
 * strings; nothing here reads a clock.
 *
 * A failed hop turns the segment ahead `bg-danger` under a hatch, holds the dot
 * at the last stop it truly reached, and offers Retry. The stops are an ordered
 * list carrying `aria-current="step"` and a hidden state word each, so the run
 * never reads by colour or position alone. Under reduced motion the dot jumps
 * and the fill runs on a tween — progress is information — and the stamps arrive
 * without landing.
 */
export function TransferTrack({
  ref,
  stops = DEFAULT_STOPS,
  reached = 0,
  stamps = NO_STAMPS,
  failed = false,
  failureMessage = "The hop was refused.",
  onRetry,
  amount,
  format = defaultFormat,
  label,
  reference,
  className,
}: TransferTrackProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const failureId = `${baseId}-failure`;

  const count = stops.length;
  const at = Math.min(Math.max(reached, 0), count - 1);

  // Measured in the observer's own callback, never during render. The stop
  // centres are the column centres of the label grid below, so the dot and the
  // word under it agree at any width.
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const node = trackRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setWidth(last.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const centre = (index: number) => (width * (index * 2 + 1)) / (count * 2);
  const travel = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  const stateOf = (index: number) => {
    if (index < at) return "reached";
    if (index > at) return "waiting";
    return failed ? "held" : at === count - 1 ? "reached" : "current";
  };

  const sentence = failed
    ? `${stops[at]?.label ?? ""}: the next hop failed`
    : `${stops[at]?.label ?? ""}, stop ${at + 1} of ${count}`;

  return (
    <section
      ref={ref}
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3
          id={labelId}
          className="min-w-0 flex-1 truncate text-sm font-medium"
        >
          {label}
        </h3>
        {amount !== undefined ? (
          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
            {format(amount)}
          </span>
        ) : null}
      </header>

      {reference ? (
        <p className="-mt-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {reference}
        </p>
      ) : null}

      <div ref={trackRef} aria-hidden className="relative h-4 w-full">
        <span className="absolute top-1/2 right-[16.6667%] left-[16.6667%] h-[2px] -translate-y-1/2 rounded-full bg-hairline-strong" />

        {width > 0 ? (
          <motion.span
            className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-cobalt-bright"
            style={{ left: centre(0) }}
            initial={false}
            animate={{ width: Math.max(0, centre(at) - centre(0)) }}
            transition={travel}
          />
        ) : null}

        {/* The refused hop: the segment the payment was crossing, drawn rather
            than merely tinted, so the failure does not depend on colour. */}
        <AnimatePresence initial={false}>
          {failed && width > 0 && at < count - 1 ? (
            <motion.span
              key="refused"
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-danger"
              style={{
                left: centre(at),
                width: centre(at + 1) - centre(at),
                backgroundImage: HATCH,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            />
          ) : null}
        </AnimatePresence>

        {stops.map((stop, index) => (
          <span
            key={stop.id}
            style={{ left: `${((index * 2 + 1) / (count * 2)) * 100}%` }}
            className={cn(
              "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors",
              index <= at
                ? "border-cobalt-bright bg-cobalt-bright"
                : "border-hairline-strong bg-surface-0",
            )}
          />
        ))}

        {width > 0 ? (
          <span className="absolute inset-y-0 left-0 flex items-center">
            <motion.span
              className={cn(
                "block size-4 rounded-full border-2 transition-colors",
                failed
                  ? "border-danger bg-danger/20"
                  : "border-cobalt-bright bg-cobalt-wash",
              )}
              initial={false}
              animate={{ x: centre(at) - 8 }}
              transition={travel}
            />
          </span>
        ) : null}
      </div>

      <ol role="list" className="grid grid-cols-3 gap-1">
        {stops.map((stop, index) => {
          const state = stateOf(index);
          const stamp = stamps[index];
          return (
            <li
              key={stop.id}
              aria-current={index === at ? "step" : undefined}
              className="flex flex-col items-center gap-1 text-center"
            >
              <span
                className={cn(
                  "text-[11px] leading-tight font-medium",
                  index <= at ? "text-foreground" : "text-ink-3",
                )}
              >
                {stop.label}
              </span>
              <span className="sr-only">{state}</span>

              {/* No row is reserved for a stamp that has not happened: the chip
                  simply is not there until its time arrives. */}
              <AnimatePresence initial={false}>
                {stamp ? (
                  <motion.span
                    key={stamp}
                    className={cn(
                      "rounded-1 border border-hairline bg-surface-0 px-1 font-mono text-[10px] text-ink-2 tabular-nums",
                      failed && index === at && "border-danger text-danger",
                    )}
                    initial={
                      motionSafe ? { scale: 1.3, opacity: 0 } : { opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? springs.recoil
                        : { duration: durations.fast, ease: easings.enter }
                    }
                  >
                    {stamp}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>

      <AnimatePresence initial={false}>
        {failed ? (
          <motion.div
            key="retry"
            className="flex items-center gap-2 border-t border-hairline pt-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <p
              id={failureId}
              role="alert"
              className="min-w-0 flex-1 text-xs leading-snug text-danger"
            >
              {failureMessage}
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                aria-describedby={failureId}
                className={cn(
                  "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                Retry
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {sentence}
      </p>
    </section>
  );
}
