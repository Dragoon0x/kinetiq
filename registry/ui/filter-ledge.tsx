"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FilterChip = {
  id: string;
  label: string;
  /** Optional match count, shown after the label. */
  count?: number;
};

export type FilterLedgeProps = {
  /** The chips, in the order they sit on the ledge. */
  filters: FilterChip[];
  /** Controlled active ids; `defaultValue` seeds the uncontrolled list. */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (ids: string[]) => void;
  /** The number the readout rolls to. The owner derives it from the filters. */
  resultCount: number;
  /** Fires after the sweep clears every chip. */
  onClear?: () => void;
  /** Accessible name for the chip group. @default "Filters" */
  label?: string;
  className?: string;
};

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Room the fade eats at each end of the scroller, in pixels. */
const FADE = 20;

/** How long the clear-all sweep is allowed to run before delays reset. */
const SWEEP_MS = 700;

/**
 * Each digit is a window over a 0–9 strip. Columns are keyed from the right so
 * 9 → 120 grows at the left edge rather than re-keying every column.
 */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const chars = Array.from(String(Math.max(0, Math.round(value))));
  const step = cascade(chars.length);

  return (
    <span aria-hidden className="inline-flex leading-none tabular-nums">
      {chars.map((char, index) => {
        const order = chars.length - index;
        return (
          <span
            key={`d${order}`}
            className="relative inline-block h-[1em] overflow-hidden"
          >
            <motion.span
              className="flex flex-col"
              initial={false}
              animate={{ y: `${-Number(char)}em` }}
              transition={
                motionSafe
                  ? { ...springs.glide, delay: (order - 1) * step }
                  : { duration: 0 }
              }
            >
              {DIGITS.map((digit) => (
                <span key={digit} className="block h-[1em]">
                  {digit}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A ledge of filter chips that keeps its arithmetic honest. Toggling a chip
 * blooms its fill from the centre on `snap` while a check draws itself in on
 * `flick` and widens a slot to sit in, and the result count beneath rolls its
 * digits to the new number on `glide`. Clear all sweeps the fills off in a
 * `cascade`, left to right, so the row empties as one gesture instead of
 * blinking. The chips are toggle buttons carrying `aria-pressed`, each its own
 * tab stop; at phone width the row scrolls sideways and the ends fade only
 * while there is something past them. Under reduced motion the fills swap and
 * the count updates instantly — a filtered total is information, not flourish.
 */
export function FilterLedge({
  filters,
  value,
  defaultValue,
  onValueChange,
  resultCount,
  onClear,
  label = "Filters",
  className,
}: FilterLedgeProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    () => defaultValue ?? [],
  );
  const active = value ?? uncontrolled;

  const [sweeping, setSweeping] = React.useState(false);
  const [edges, setEdges] = React.useState({ start: false, end: false });
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const rowRef = React.useRef<HTMLDivElement | null>(null);

  // Fade an end only while something is actually hidden past it, and watch the
  // row as well as the viewport: a chip growing a check slot changes the reach.
  React.useEffect(() => {
    const box = scrollRef.current;
    const row = rowRef.current;
    if (!box || !row) return;
    const read = () => {
      const start = box.scrollLeft > 1;
      const end = box.scrollLeft + box.clientWidth < box.scrollWidth - 1;
      setEdges((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end },
      );
    };
    read();
    box.addEventListener("scroll", read, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(box);
    observer.observe(row);
    return () => {
      box.removeEventListener("scroll", read);
      observer.disconnect();
    };
  }, []);

  // The sweep is a one-shot choreography, not a mode: its delays expire on
  // their own so the next toggle answers immediately.
  React.useEffect(() => {
    if (!sweeping) return;
    const timer = window.setTimeout(() => setSweeping(false), SWEEP_MS);
    return () => window.clearTimeout(timer);
  }, [sweeping]);

  const commit = (next: string[]) => {
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const toggle = (id: string) => {
    setSweeping(false);
    commit(
      active.includes(id)
        ? active.filter((entry) => entry !== id)
        : [...active, id],
    );
  };

  const clearAll = () => {
    if (active.length === 0) return;
    setSweeping(true);
    commit([]);
    onClear?.();
  };

  const step = cascade(filters.length);
  const mask = `linear-gradient(to right, transparent 0, black ${
    edges.start ? FADE : 0
  }px, black calc(100% - ${edges.end ? FADE : 0}px), transparent 100%)`;

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div
        ref={scrollRef}
        className="-mx-1 [scrollbar-width:none] overflow-x-auto px-1 py-1 [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        <div
          ref={rowRef}
          role="group"
          aria-label={label}
          className="flex w-max items-center gap-2"
        >
          {filters.map((filter, index) => {
            const on = active.includes(filter.id);
            // A cascade is choreography, so reduced motion gets none of it.
            const delay = sweeping && motionSafe ? index * step : 0;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(filter.id)}
                // The label waits for its fill: during a sweep the outline
                // palette returns only once the chip's own fill has left.
                style={{ transitionDelay: `${delay}s` }}
                className={cn(
                  "relative flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  on
                    ? "border-primary text-primary-foreground"
                    : "border-hairline bg-surface-1 text-ink-2 hover:border-hairline-strong hover:text-ink",
                )}
              >
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ scale: on ? 1 : 0.6, opacity: on ? 1 : 0 }}
                  transition={
                    motionSafe
                      ? on
                        ? springs.snap
                        : {
                            duration: durations.fast,
                            ease: easings.exit,
                            delay,
                          }
                      : { duration: 0 }
                  }
                  className="absolute inset-0 rounded-full bg-primary"
                />

                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ width: on ? 18 : 0 }}
                  transition={
                    motionSafe
                      ? {
                          duration: durations.fast,
                          ease: on ? easings.enter : easings.exit,
                          delay: on ? 0 : delay,
                        }
                      : { duration: 0 }
                  }
                  className="relative flex shrink-0 items-center overflow-hidden"
                >
                  <svg viewBox="0 0 16 16" className="size-3.5 shrink-0">
                    <motion.path
                      d="M3.5 8.4 6.5 11.2 12.5 4.8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      strokeDasharray="1 1"
                      initial={false}
                      animate={{ strokeDashoffset: on ? 0 : 1 }}
                      transition={
                        motionSafe
                          ? on
                            ? springs.flick
                            : {
                                duration: durations.blink,
                                ease: easings.exit,
                                delay,
                              }
                          : { duration: 0 }
                      }
                    />
                  </svg>
                </motion.span>

                <span className="relative whitespace-nowrap">
                  {filter.label}
                </span>
                {filter.count !== undefined && (
                  <span
                    className={cn(
                      "relative ml-1.5 tabular-nums",
                      on ? "opacity-70" : "text-ink-3",
                    )}
                  >
                    {filter.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1 font-mono text-xs text-ink-2">
          <span className="text-ink">
            <RollingCount value={resultCount} motionSafe={motionSafe} />
          </span>
          <span>{resultCount === 1 ? "result" : "results"}</span>
          <span aria-live="polite" className="sr-only">
            {resultCount} {resultCount === 1 ? "result" : "results"},{" "}
            {active.length} {active.length === 1 ? "filter" : "filters"} active
          </span>
        </p>

        <button
          type="button"
          onClick={clearAll}
          disabled={active.length === 0}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-full border border-hairline px-3 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "text-ink-2 hover:border-hairline-strong hover:text-ink",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
