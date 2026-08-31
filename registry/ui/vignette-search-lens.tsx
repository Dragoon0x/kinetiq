"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LensResult = { id: string; label: string; hint: string };

export type VignetteSearchLensProps = {
  /** The query that types itself. */
  query?: string;
  results?: LensResult[];
  /** Seconds the settled scene rests before looping. @default 5 */
  restSeconds?: number;
  className?: string;
};

const DEFAULT_RESULTS: LensResult[] = [
  { id: "r1", label: "Morning board — north basin", hint: "board" },
  { id: "r2", label: "Crane 2 hold, entered 01:07", hint: "hold" },
  { id: "r3", label: "Crew B roster", hint: "crew" },
];

/**
 * A search moment: the field focuses, the query types itself, three results
 * settle in, the scene rests, then it clears and runs again. A vignette of
 * finding — fixed beats, nothing interactive, one image to assistive tech —
 * for heroes about products where the answer is a search away. The working
 * palette is command-deck; this is its portrait.
 *
 * Reduced motion: the finished scene prints at rest and stays.
 */
export function VignetteSearchLens({
  query = "crane 2",
  results = DEFAULT_RESULTS,
  restSeconds = 5,
  className,
}: VignetteSearchLensProps) {
  const motionSafe = useMotionSafe();
  const [typed, setTyped] = React.useState(motionSafe ? 0 : query.length);
  const settled = typed >= query.length;

  // Mode or query changed: reset during render, never inside the effect.
  const [loopKey, setLoopKey] = React.useState(`${motionSafe}:${query}`);
  if (loopKey !== `${motionSafe}:${query}`) {
    setLoopKey(`${motionSafe}:${query}`);
    setTyped(motionSafe ? 0 : query.length);
  }

  React.useEffect(() => {
    if (!motionSafe) return;
    let cancelled = false;
    let timer: number;
    const type = (count: number) => {
      if (cancelled) return;
      if (count < query.length) {
        timer = window.setTimeout(() => {
          setTyped(count + 1);
          type(count + 1);
        }, 110);
      } else {
        timer = window.setTimeout(() => {
          setTyped(0);
          type(0);
        }, restSeconds * 1000);
      }
    };
    timer = window.setTimeout(() => type(0), 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [motionSafe, query, restSeconds]);

  return (
    <div
      role="img"
      aria-label={`Search for "${query}": ${results.map((r) => r.label).join(", ")}`}
      className={cn("w-full max-w-xs", className)}
    >
      <div
        aria-hidden
        className="rounded-4 border border-hairline bg-surface-1 p-2 shadow-raised"
      >
        <div className="flex items-center gap-2 rounded-3 border border-hairline bg-surface-0 px-3 py-2">
          <svg
            viewBox="0 0 16 16"
            className="size-3.5 fill-none stroke-current text-ink-3"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m13.5 13.5-3-3" />
          </svg>
          <span className="min-h-5 text-sm text-ink">
            {query.slice(0, typed)}
            <motion.span
              className="ml-px inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-primary"
              animate={motionSafe ? { opacity: [1, 0, 1] } : { opacity: 0.5 }}
              transition={
                motionSafe
                  ? { duration: 1, repeat: Infinity, ease: "linear" }
                  : { duration: 0 }
              }
            />
          </span>
        </div>

        <div className="min-h-28 pt-1.5">
          <AnimatePresence>
            {settled &&
              results.map((result, index) => (
                <motion.div
                  key={result.id}
                  initial={{
                    opacity: motionSafe ? 0 : 1,
                    y: motionSafe ? distances.nudge : 0,
                  }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: durations.fast },
                  }}
                  transition={
                    motionSafe
                      ? {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: index * 0.09,
                        }
                      : { duration: 0 }
                  }
                  className={cn(
                    "flex items-baseline justify-between gap-3 rounded-2 px-2.5 py-1.5",
                    index === 0 && "bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "min-w-0 truncate text-sm",
                      index === 0 ? "font-medium text-ink" : "text-ink-2",
                    )}
                  >
                    {result.label}
                  </span>
                  <span className="shrink-0 rounded-full border border-hairline px-1.5 py-px font-mono text-[9px] tracking-[0.06em] text-ink-3">
                    {result.hint}
                  </span>
                </motion.div>
              ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
