"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PaginationRailProps = {
  ref?: React.Ref<HTMLElement>;
  /** Total number of pages. */
  total: number;
  /** Current page, 1-based. */
  page: number;
  onPageChange: (page: number) => void;
  /** Pages kept either side of the current one before an ellipsis. @default 1 */
  siblingCount?: number;
  /** Content for the hover/focus preview over a page. */
  preview?: (page: number) => React.ReactNode;
  /** Accessible name for the nav landmark. @default "Pagination" */
  label?: string;
  className?: string;
};

function buildWindow(
  page: number,
  total: number,
  sibling: number,
): (number | "gap")[] {
  if (total <= 1) return [1];
  const out: (number | "gap")[] = [1];
  const left = Math.max(2, page - sibling);
  const right = Math.min(total - 1, page + sibling);
  if (left > 2) out.push("gap");
  for (let i = left; i <= right; i += 1) out.push(i);
  if (right < total - 1) out.push("gap");
  out.push(total);
  return out;
}

function Arrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d={dir === "prev" ? "M8.5 3 4.5 7 8.5 11" : "M5.5 3 9.5 7 5.5 11"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A pager with a lively active pill. Changing pages slides the filled indicator
 * from the old number to the new one on `snap`, and hovering or focusing any
 * page floats a preview above it. Prev and Next clamp at the ends. Under reduced
 * motion the pill jumps and previews cross-fade without travel.
 */
export function PaginationRail({
  ref,
  total,
  page,
  onPageChange,
  siblingCount = 1,
  preview,
  label = "Pagination",
  className,
}: PaginationRailProps) {
  const motionSafe = useMotionSafe();
  const previewId = React.useId();
  const [hovered, setHovered] = React.useState<number | null>(null);
  const window = buildWindow(page, total, siblingCount);

  const go = (next: number) => {
    const clamped = Math.max(1, Math.min(total, next));
    if (clamped !== page) onPageChange(clamped);
  };

  const indicatorTransition = motionSafe ? springs.snap : { duration: 0 };

  return (
    <nav ref={ref} aria-label={label} className={cn("inline-flex", className)}>
      <ul className="flex items-center gap-1">
        <li>
          <button
            type="button"
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:ring-cobalt-bright/50 grid size-8 place-items-center rounded-2 border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            <Arrow dir="prev" />
          </button>
        </li>

        {window.map((entry, index) => {
          if (entry === "gap") {
            return (
              <li
                key={`gap-${index}`}
                aria-hidden
                className="text-ink-3 grid size-8 place-items-center text-sm"
              >
                …
              </li>
            );
          }
          const isActive = entry === page;
          return (
            <li key={entry} className="relative">
              <button
                type="button"
                onClick={() => go(entry)}
                onMouseEnter={() => setHovered(entry)}
                onMouseLeave={() =>
                  setHovered((cur) => (cur === entry ? null : cur))
                }
                onFocus={() => setHovered(entry)}
                onBlur={() => setHovered((cur) => (cur === entry ? null : cur))}
                aria-current={isActive ? "page" : undefined}
                aria-describedby={hovered === entry ? previewId : undefined}
                className={cn(
                  "focus-visible:ring-cobalt-bright/50 relative grid size-8 place-items-center rounded-2 text-sm font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  isActive
                    ? "text-primary-foreground"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="pagination-rail-active"
                    aria-hidden
                    transition={indicatorTransition}
                    className="bg-primary absolute inset-0 -z-10 rounded-2"
                  />
                )}
                {entry}
              </button>

              <AnimatePresence>
                {hovered === entry && (
                  <motion.span
                    id={previewId}
                    role="tooltip"
                    initial={
                      motionSafe
                        ? { opacity: 0, y: 4, scale: 0.96 }
                        : { opacity: 0 }
                    }
                    animate={
                      motionSafe
                        ? {
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: {
                              duration: durations.fast,
                              ease: easings.enter,
                            },
                          }
                        : { opacity: 1 }
                    }
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    className="bg-popover text-popover-foreground border-border pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-2 border px-2 py-1 text-xs whitespace-nowrap shadow-md"
                  >
                    {preview ? preview(entry) : `Page ${entry}`}
                  </motion.span>
                )}
              </AnimatePresence>
            </li>
          );
        })}

        <li>
          <button
            type="button"
            onClick={() => go(page + 1)}
            disabled={page >= total}
            aria-label="Next page"
            className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:ring-cobalt-bright/50 grid size-8 place-items-center rounded-2 border transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
          >
            <Arrow dir="next" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
