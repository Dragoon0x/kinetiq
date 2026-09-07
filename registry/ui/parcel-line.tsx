"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type Point = { x: number; y: number };

export type ParcelStop = {
  id: string;
  label: string;
  /** Optional time under the stop — a clock reading, not a duration. */
  time?: string;
};

export type ParcelLineProps = {
  /** Ordered stops, first to last. */
  stops: ParcelStop[];
  /** Index of the stop the parcel is at. */
  current: number;
  /** Formatted arrival, shown in the header and announced when it changes. */
  eta: string;
  /** Shipment name. */
  label: string;
  className?: string;
};

const samePoints = (a: Point[], b: Point[]) =>
  a.length === b.length &&
  a.every((point, i) => point.x === b[i]?.x && point.y === b[i]?.y);

/**
 * A delivery that shows its own progress. The parcel glides between stops on
 * `glide` — ζ0.98, one settle, no bounce, because a van arriving is not a
 * celebration — and it is placed from measured dot centres rather than a
 * percentage, so it lands true on the row the stops actually wrapped onto.
 * The stop it sits on breathes on `drift`, a reversing two-keyframe spring
 * that is the slowest thing on the page; passed stops fill in order on `flick`
 * through a `cascade` that keeps the whole run inside the 600ms budget.
 *
 * The stops are an ordered list with `aria-current="step"` on the one in hand
 * and a hidden word of state on each of the others, so the run reads in
 * sequence. The ETA rolls when it changes and is announced politely. Under
 * reduced motion the parcel jumps to its stop and nothing breathes — the fills
 * and the ETA still change, because that is the information.
 */
export function ParcelLine({
  stops,
  current,
  eta,
  label,
  className,
}: ParcelLineProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const dotRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const [dots, setDots] = React.useState<Point[]>([]);

  const count = stops.length;
  const at = Math.min(Math.max(current, 0), Math.max(count - 1, 0));
  const stagger = cascade(count);
  // A stable key: callers rebuild the stops array freely, and re-observing on
  // every render would thrash the observer.
  const stopKey = stops.map((stop) => stop.id).join("|");

  // Measured in the observer's own callback — never during render — and the
  // list is what is observed, because wrapping to a second row changes its
  // height even when its width has not moved.
  React.useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const base = track.getBoundingClientRect();
      const next = dotRefs.current.slice(0, count).map((node) => {
        if (!node) return { x: 0, y: 0 };
        const rect = node.getBoundingClientRect();
        return {
          x: rect.left - base.left + rect.width / 2,
          y: rect.top - base.top + rect.height / 2,
        };
      });
      setDots((prev) => (samePoints(prev, next) ? prev : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [stopKey, count]);

  const parcelAt = dots[at];
  const currentStop = stops[at];

  return (
    <section
      aria-labelledby={`${uid}-label`}
      className={cn(
        "flex w-full flex-col gap-4 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h3
          id={`${uid}-label`}
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
        >
          {label}
        </h3>

        {/* One box, both readings stacked inside it: the row keeps its height
            and its width while the ETA rolls over. */}
        <div className="relative h-5 w-28 shrink-0 overflow-hidden">
          <AnimatePresence initial={false}>
            <motion.span
              key={eta}
              aria-hidden
              initial={{ opacity: 0, y: motionSafe ? 10 : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe ? -10 : 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
              className="absolute inset-0 flex items-center justify-end font-mono text-xs text-ink-2 tabular-nums"
            >
              {eta}
            </motion.span>
          </AnimatePresence>
        </div>
      </header>

      {/* The parcel is a sibling of the list, not a child of it: an ordered
          list may only hold list items, and the wrapper is what gets measured. */}
      <div ref={trackRef} className="relative">
        <ol className="flex flex-wrap gap-y-4">
          {stops.map((stop, index) => {
            const passed = index < at;
            const isCurrent = index === at;
            const filled = passed || isCurrent;
            return (
              <li
                key={stop.id}
                aria-current={isCurrent ? "step" : undefined}
                className="flex min-w-24 flex-1 flex-col items-center gap-2"
              >
                <span className="relative block h-5 w-full">
                  {index > 0 && (
                    <span
                      aria-hidden
                      style={{ transitionDelay: `${index * stagger}s` }}
                      className={cn(
                        "absolute top-1/2 left-0 h-px w-1/2 -translate-y-1/2 transition-colors duration-300",
                        passed || isCurrent
                          ? "bg-cobalt-bright"
                          : "bg-hairline-strong",
                      )}
                    />
                  )}
                  {index < count - 1 && (
                    <span
                      aria-hidden
                      style={{ transitionDelay: `${index * stagger}s` }}
                      className={cn(
                        "absolute top-1/2 left-1/2 h-px w-1/2 -translate-y-1/2 transition-colors duration-300",
                        passed ? "bg-cobalt-bright" : "bg-hairline-strong",
                      )}
                    />
                  )}

                  <span
                    ref={(node) => {
                      dotRefs.current[index] = node;
                    }}
                    className="absolute top-1/2 left-1/2 block size-3.5 -translate-x-1/2 -translate-y-1/2"
                  >
                    {isCurrent &&
                      (motionSafe ? (
                        <motion.span
                          aria-hidden
                          initial={{ scale: 1.25, opacity: 0.5 }}
                          animate={{ scale: 1.85, opacity: 0.2 }}
                          transition={{
                            ...springs.drift,
                            repeat: Infinity,
                            repeatType: "reverse",
                          }}
                          className="absolute inset-0 rounded-full bg-cobalt-bright"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="absolute inset-0 scale-150 rounded-full bg-cobalt-bright/25"
                        />
                      ))}

                    <span className="relative flex size-full items-center justify-center rounded-full border border-hairline-strong bg-surface-0">
                      <motion.span
                        aria-hidden
                        initial={{ scale: 0 }}
                        animate={{ scale: filled ? 1 : 0 }}
                        transition={
                          motionSafe
                            ? { ...springs.flick, delay: index * stagger }
                            : { duration: durations.blink }
                        }
                        className="block size-2 rounded-full bg-cobalt-bright"
                      />
                    </span>
                  </span>
                </span>

                <span className="flex min-w-0 flex-col items-center gap-0.5 px-1 text-center">
                  <span
                    className={cn(
                      "text-[11px] leading-tight transition-colors duration-300",
                      filled ? "text-foreground" : "text-ink-3",
                    )}
                  >
                    {stop.label}
                  </span>
                  {stop.time && (
                    <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                      {stop.time}
                    </span>
                  )}
                  <span className="sr-only">
                    {passed ? "Passed" : isCurrent ? "Current stop" : "To come"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {/* The parcel rides the line itself, so a wrapped second row carries it
            without a special case. */}
        {parcelAt ? (
          <motion.span
            aria-hidden
            initial={false}
            animate={{ x: parcelAt.x, y: parcelAt.y }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            className="pointer-events-none absolute top-0 left-0 z-10 -mt-2.5 -ml-2.5 flex size-5 items-center justify-center rounded-1 border border-cobalt-bright bg-surface-0 text-cobalt-bright shadow-raised"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
              className="size-3 shrink-0"
            >
              <path d="M2.5 5.5 8 3l5.5 2.5v5L8 13l-5.5-2.5z" />
              <path d="M2.5 5.5 8 8l5.5-2.5M8 8v5" />
            </svg>
          </motion.span>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {currentStop
          ? `${label}: stop ${at + 1} of ${count}, ${currentStop.label}. Arrival ${eta}.`
          : `${label}. Arrival ${eta}.`}
      </p>
    </section>
  );
}
