"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const LEVELS = [
  "var(--hairline)",
  "oklch(0.86 0.05 262)",
  "oklch(0.77 0.11 262)",
  "oklch(0.67 0.16 262)",
  "oklch(0.6 0.21 262)",
];
const PITCH = 15;
const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

export type HeatDay = {
  /** ISO or display date used in the readout. */
  date: string;
  count: number;
};

export type HeatCalendarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Chronological days, laid out in columns of seven. */
  days: HeatDay[];
  /** Scale ceiling for the four filled levels; defaults to the busiest day. */
  max?: number;
  /** Unit shown in the readout. @default "contributions" */
  unit?: string;
  className?: string;
};

function levelOf(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 1;
  return Math.max(1, Math.min(4, Math.ceil((count / max) * 4)));
}

/**
 * A contribution heatmap. Cells wash in on a short diagonal cascade, and moving
 * across the grid — by pointer or the arrow keys — floats a readout of that
 * day's tally. Roving focus keeps it to a single tab stop. Under reduced motion
 * the cells appear filled with no cascade.
 */
export function HeatCalendar({
  ref,
  days,
  max,
  unit = "contributions",
  className,
}: HeatCalendarProps) {
  const motionSafe = useMotionSafe();
  const ceiling =
    max ?? days.reduce((top, day) => Math.max(top, day.count), 0);
  const weeks = Math.ceil(days.length / 7);
  const cellRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const [keyboard, setKeyboard] = React.useState(false);

  const active = hoverIndex ?? (keyboard ? focusIndex : null);

  const move = (index: number, delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= days.length) return;
    setFocusIndex(next);
    cellRefs.current[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowUp":
        if (index % 7 > 0) {
          event.preventDefault();
          move(index, -1);
        }
        break;
      case "ArrowDown":
        if (index % 7 < 6) {
          event.preventDefault();
          move(index, 1);
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        move(index, -7);
        break;
      case "ArrowRight":
        event.preventDefault();
        move(index, 7);
        break;
      default:
        break;
    }
  };

  const activeDay = active !== null ? days[active] : null;
  const activeCol = active !== null ? Math.floor(active / 7) : 0;
  const activeRow = active !== null ? active % 7 : 0;

  return (
    <div ref={ref} className={cn("flex flex-col gap-3", className)}>
      <div className="flex gap-2">
        <div
          className="text-ink-3 grid shrink-0 pt-[2px] text-[10px]"
          style={{ gridTemplateRows: `repeat(7, ${PITCH}px)` }}
          aria-hidden
        >
          {WEEKDAYS.map((label, i) => (
            <span key={i} className="flex h-[15px] items-center leading-none">
              {label}
            </span>
          ))}
        </div>

        <div className="relative overflow-x-auto pt-[2px] pb-1">
          <div
            role="group"
            aria-label="Contribution calendar"
            className="grid grid-flow-col gap-[3px]"
            style={{
              gridTemplateRows: "repeat(7, 12px)",
              gridTemplateColumns: `repeat(${weeks}, 12px)`,
            }}
          >
            {days.map((day, index) => {
              const level = levelOf(day.count, ceiling);
              const col = Math.floor(index / 7);
              const row = index % 7;
              return (
                <motion.button
                  key={`${day.date}-${index}`}
                  ref={(node) => {
                    cellRefs.current[index] = node;
                  }}
                  type="button"
                  tabIndex={focusIndex === index ? 0 : -1}
                  aria-label={`${day.count} ${unit} on ${day.date}`}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  onFocus={() => {
                    setFocusIndex(index);
                    setKeyboard(true);
                  }}
                  onBlur={() => setKeyboard(false)}
                  onMouseEnter={() => setHoverIndex(index)}
                  onMouseLeave={() => setHoverIndex(null)}
                  initial={
                    motionSafe ? { opacity: 0, scale: 0.6 } : { opacity: 1 }
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  transition={
                    motionSafe
                      ? {
                          delay: Math.min((col + row) * 0.012, 0.5),
                          duration: durations.base,
                          ease: easings.enter,
                        }
                      : { duration: 0 }
                  }
                  whileHover={motionSafe ? { scale: 1.18 } : undefined}
                  className="focus-visible:ring-cobalt-bright/60 focus-visible:ring-offset-surface-0 size-3 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                  style={{ background: LEVELS[level] }}
                />
              );
            })}
          </div>

          {activeDay && (
            <div
              className="border-border bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded-2 border px-2 py-1 text-[11px] whitespace-nowrap shadow-md"
              style={{
                left: activeCol * PITCH + 6,
                top:
                  activeRow <= 3
                    ? activeRow * PITCH + 18
                    : activeRow * PITCH - 2,
                transform:
                  activeRow <= 3
                    ? "translate(-50%, 0)"
                    : "translate(-50%, -100%)",
              }}
              role="status"
            >
              <span className="text-ink font-semibold tabular-nums">
                {activeDay.count}
              </span>{" "}
              <span className="text-ink-3">{unit}</span>
              <span className="text-ink-3"> · {activeDay.date}</span>
            </div>
          )}
        </div>
      </div>

      <div className="text-ink-3 flex items-center gap-1.5 text-[11px]">
        <span>Less</span>
        {LEVELS.map((color, i) => (
          <span
            key={i}
            className="size-3 rounded-[3px]"
            style={{ background: color }}
            aria-hidden
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
