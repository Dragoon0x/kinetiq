"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SlotDay = {
  id: string;
  label: string;
};

export type SlotGridProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Column headers, left to right. */
  days: SlotDay[];
  /** Row labels, top to bottom. */
  times: string[];
  /** `"dayId:time"` keys that are unavailable. */
  taken?: string[];
  /** Controlled `"dayId:time"` key. */
  value?: string;
  /** Initial `"dayId:time"` key for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (key: string) => void;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const NO_KEYS: string[] = [];

/** Column widths in px; the grid's min-width is built from them so narrow
 *  viewports scroll instead of crushing the columns. */
const TIME_COL = 56;
const DAY_COL = 72;

/** Unavailable is drawn, not merely dimmed — hatching survives both themes
 *  and does not rely on colour alone. */
const HATCH =
  "repeating-linear-gradient(45deg, var(--hairline-strong) 0 1px, transparent 1px 6px)";

const keyOf = (dayId: string, time: string) => `${dayId}:${time}`;

/**
 * A week of appointment slots. Free slots sit under a soft hairline and lift a
 * single pixel on hover — `glide`, because a hover is a surface shifting, not a
 * switch. Picking stamps the slot: the mark lands from 1.3× on `recoil`, whose
 * ζ0.53 gives the two bounces of a stamp hitting paper, and the summary beneath
 * cross-fades to the new time.
 *
 * It is a real grid: arrow keys walk the cells, Home and End jump to the ends
 * of a row, Enter and Space pick. Taken slots stay focusable but inert so the
 * keyboard can read the whole week. Under reduced motion the stamp simply
 * appears and the summary swaps.
 */
export function SlotGrid({
  ref,
  days,
  times,
  taken = NO_KEYS,
  value,
  defaultValue,
  onValueChange,
  label,
  className,
  "aria-label": ariaLabel,
}: SlotGridProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  const unavailable = React.useMemo(() => new Set(taken), [taken]);
  const cellRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [focused, setFocused] = React.useState(0);

  const columns = days.length;
  const at = (row: number, col: number) => row * columns + col;

  const pick = (nextKey: string) => {
    if (unavailable.has(nextKey) || nextKey === current) return;
    if (!isControlled) setUncontrolled(nextKey);
    onValueChange?.(nextKey);
  };

  const moveTo = (row: number, col: number) => {
    const clampedRow = Math.min(times.length - 1, Math.max(0, row));
    const clampedCol = Math.min(columns - 1, Math.max(0, col));
    const index = at(clampedRow, clampedCol);
    setFocused(index);
    cellRefs.current[index]?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    row: number,
    col: number,
    cellKey: string,
  ) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        moveTo(row, col + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveTo(row, col - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveTo(row + 1, col);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(row - 1, col);
        break;
      case "Home":
        event.preventDefault();
        moveTo(row, 0);
        break;
      case "End":
        event.preventDefault();
        moveTo(row, columns - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(cellKey);
        break;
      default:
        break;
    }
  };

  // Edge fades only appear where there is more grid to reach. Measuring in a
  // ResizeObserver (which fires once on observe) keeps the first paint honest
  // without reading layout during render.
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const measure = () => {
      const overflow = node.scrollWidth - node.clientWidth;
      setEdges({
        start: node.scrollLeft > 1,
        end: node.scrollLeft < overflow - 1,
      });
    };
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  const chosenDay = days.find((day) => current.startsWith(`${day.id}:`));
  const chosenTime = current.slice(current.indexOf(":") + 1);
  const summary = chosenDay
    ? `${chosenDay.label} · ${chosenTime}`
    : "No slot held";

  const rowTemplate = {
    gridTemplateColumns: `${TIME_COL}px repeat(${columns}, minmax(${DAY_COL}px, 1fr))`,
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      {label ? (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      ) : null}

      <div className="relative">
        <div ref={scrollerRef} className="overflow-x-auto">
          <div
            role="grid"
            aria-labelledby={label ? labelId : undefined}
            aria-label={label ? undefined : ariaLabel}
            className="flex flex-col gap-1.5"
            style={{ minWidth: TIME_COL + columns * DAY_COL }}
          >
            <div role="row" className="grid gap-1.5" style={rowTemplate}>
              <div
                role="columnheader"
                className="sticky left-0 z-10 flex h-6 items-center bg-surface-1"
              >
                <span className="sr-only">Time</span>
              </div>
              {days.map((day) => (
                <div
                  key={day.id}
                  role="columnheader"
                  className="flex h-6 items-center justify-center text-[11px] font-medium text-ink-3"
                >
                  {day.label}
                </div>
              ))}
            </div>

            {times.map((time, row) => (
              <div
                key={time}
                role="row"
                className="grid gap-1.5"
                style={rowTemplate}
              >
                <div
                  role="rowheader"
                  className="sticky left-0 z-10 flex h-9 items-center bg-surface-1 pr-2 font-mono text-[11px] text-ink-3 tabular-nums"
                >
                  {time}
                </div>

                {days.map((day, col) => {
                  const cellKey = keyOf(day.id, time);
                  const isTaken = unavailable.has(cellKey);
                  const isChosen = cellKey === current;
                  const index = at(row, col);
                  return (
                    <div
                      key={day.id}
                      role="gridcell"
                      aria-selected={isChosen}
                      className="min-w-0"
                    >
                      <motion.button
                        ref={(node) => {
                          cellRefs.current[index] = node;
                        }}
                        type="button"
                        tabIndex={focused === index ? 0 : -1}
                        aria-disabled={isTaken || undefined}
                        aria-label={`${day.label} ${time}${
                          isTaken ? ", unavailable" : ""
                        }`}
                        onFocus={() => setFocused(index)}
                        onClick={() => pick(cellKey)}
                        onKeyDown={(event) =>
                          handleKeyDown(event, row, col, cellKey)
                        }
                        whileHover={
                          motionSafe && !isTaken && !isChosen
                            ? { y: -1 }
                            : undefined
                        }
                        transition={springs.glide}
                        className={cn(
                          "relative flex h-9 w-full items-center justify-center rounded-2 border outline-none",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          isTaken
                            ? "cursor-not-allowed border-hairline"
                            : "cursor-pointer border-hairline-strong bg-surface-2 hover:border-cobalt-bright/60",
                        )}
                        style={{
                          backgroundImage: isTaken ? HATCH : undefined,
                        }}
                      >
                        {isChosen ? (
                          <motion.span
                            key={cellKey}
                            aria-hidden
                            className="absolute inset-0 flex items-center justify-center rounded-2 bg-primary text-primary-foreground"
                            initial={
                              motionSafe
                                ? { scale: 1.3, opacity: 0 }
                                : { scale: 1, opacity: 1 }
                            }
                            animate={{ scale: 1, opacity: 1 }}
                            transition={
                              motionSafe
                                ? {
                                    ...springs.recoil,
                                    opacity: { duration: durations.blink },
                                  }
                                : { duration: 0 }
                            }
                          >
                            <svg
                              viewBox="0 0 16 16"
                              className="size-3.5 shrink-0"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" />
                            </svg>
                          </motion.span>
                        ) : !isTaken ? (
                          <span
                            aria-hidden
                            className="h-px w-3 bg-hairline-strong"
                          />
                        ) : null}
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {edges.start ? (
          /* Offset past the sticky time column so the fade veils the
             scrolling days, never the labels that stay put. */
          <span
            aria-hidden
            style={{ left: TIME_COL }}
            className="pointer-events-none absolute inset-y-0 w-6 bg-linear-to-r from-surface-1 to-surface-1/0"
          />
        ) : null}
        {edges.end ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-surface-1 to-surface-1/0"
          />
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-hairline pt-3">
        <span className="text-[11px] text-ink-3">Holding</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={summary}
            className="font-mono text-xs font-medium text-foreground tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {summary}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
