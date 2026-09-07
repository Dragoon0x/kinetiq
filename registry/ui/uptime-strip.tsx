"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type UptimeStatus = "up" | "degraded" | "down" | "none";

export type UptimeDay = {
  /** Day label, already formatted by the caller — e.g. "12 Jun". */
  date: string;
  status: UptimeStatus;
  /** Incident summary; shown in the reading when present. */
  note?: string;
};

export type UptimeStripProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Ninety entries, oldest first. */
  days: UptimeDay[];
  /** Service name. */
  label: string;
  /** Percentage shown in the header. */
  uptime: number;
  /** Formats the header percentage. @default two decimal places */
  format?: (value: number) => string;
  /** Fires with the day under the pointer or the keyboard cursor; null on leave. */
  onReadChange?: (day: UptimeDay | null, index: number) => void;
  className?: string;
};

const STATUS: Record<
  UptimeStatus,
  { bar: string; text: string; word: string }
> = {
  up: { bar: "bg-success", text: "text-success", word: "Operational" },
  degraded: { bar: "bg-warn", text: "text-warn", word: "Degraded" },
  down: { bar: "bg-danger", text: "text-danger", word: "Outage" },
  none: { bar: "bg-hairline-strong", text: "text-ink-3", word: "No data" },
};

const formatPercent = (value: number): string => `${value.toFixed(2)}%`;

const isIncident = (status: UptimeStatus): boolean =>
  status === "degraded" || status === "down";

type RolledNumberProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * A number that rolls to its target on `glide`. The formatted text is a motion
 * value handed to the span as its child, so the roll runs outside React and
 * re-renders nothing; `tabular-nums` pins the cell width so moving digits can
 * never nudge the layout around them.
 */
function RolledNumber({
  value,
  format,
  motionSafe,
  className,
}: RolledNumberProps) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(latest));

  React.useEffect(() => {
    // Reduced motion still reports the number — only the travel is dropped.
    if (!motionSafe) {
      progress.set(value);
      return;
    }
    const controls = animate(progress, value, springs.glide);
    return () => controls.stop();
  }, [motionSafe, progress, value]);

  return (
    <span className={cn("font-mono tabular-nums", className)}>
      <span className="sr-only">{format(value)}</span>
      <motion.span aria-hidden>{text}</motion.span>
    </span>
  );
}

/**
 * Ninety days of service history, one bar each. The bars grow from the baseline
 * in a single cascade on `glide`, and incident days carry a second bar that
 * swells and fades on `drift` — one slow pulse that marks the bad days without
 * anything blinking. The header percentage rolls its digits rather than
 * swapping, so the figure reads as a measurement settling.
 *
 * The strip is a listbox: the pointer reads whichever bar it is over, Left and
 * Right walk the days, Home and End jump to the oldest and today, and the
 * reading follows along the strip on `glide` instead of appearing somewhere
 * else. The reading is positioned inside the strip's own box and clamped to it,
 * so it never leaves the card or shifts a pixel of layout. Under reduced motion
 * the bars simply appear and the pulse is dropped.
 */
export function UptimeStrip({
  ref,
  days,
  label,
  uptime,
  format = formatPercent,
  onReadChange,
  className,
}: UptimeStripProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const [active, setActive] = React.useState<number | null>(null);

  const count = days.length;
  // cascade() floors its interval at 20ms, which ninety bars would stretch to
  // 1.8s. The strip reads as one gesture, so the interval tightens to keep the
  // whole run inside the 600ms choreography budget.
  const step = Math.min(cascade(count), 0.6 / Math.max(count - 1, 1));

  const incidents = days.reduce(
    (total, day) => (isIncident(day.status) ? total + 1 : total),
    0,
  );
  const latest = STATUS[days[count - 1]?.status ?? "none"];
  const reading = active === null ? null : (days[active] ?? null);

  // The reading is measured against the strip, never guessed: its own width and
  // the strip's come from observers, so the clamp holds at every container size.
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const [stripWidth, setStripWidth] = React.useState(0);
  const [readingWidth, setReadingWidth] = React.useState(0);

  React.useEffect(() => {
    const node = stripRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      setStripWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const measureReading = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      setReadingWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const center =
    active === null || count === 0 ? 0 : ((active + 0.5) / count) * stripWidth;
  const readingX = Math.min(
    Math.max(center - readingWidth / 2, 0),
    Math.max(0, stripWidth - readingWidth),
  );

  // The callback fires from the handler, never from inside a state updater —
  // a pointer sweep crosses a bar a frame at a time and each crossing is one
  // report, not one per render.
  const read = (index: number | null) => {
    if (index === active) return;
    setActive(index);
    onReadChange?.(index === null ? null : (days[index] ?? null), index ?? -1);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || count === 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    read(Math.min(count - 1, Math.max(0, Math.floor(ratio * count))));
  };

  const moveBy = (delta: number) => {
    if (count === 0) return;
    const from = active ?? count - 1;
    read(Math.min(count - 1, Math.max(0, from + delta)));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveBy(-1);
        break;
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveBy(1);
        break;
      case "Home":
        event.preventDefault();
        read(0);
        break;
      case "End":
        event.preventDefault();
        read(count - 1);
        break;
      case "Escape":
        if (active !== null) {
          event.preventDefault();
          read(null);
        }
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", latest.bar)}
          />
          <span className="truncate text-sm font-medium text-foreground">
            {label}
          </span>
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <RolledNumber
            value={uptime}
            format={format}
            motionSafe={motionSafe}
            className="text-sm font-medium text-foreground"
          />
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            uptime
          </span>
        </span>
      </div>

      <div ref={stripRef} className="relative">
        <div
          role="listbox"
          tabIndex={0}
          aria-label={`${label} daily status, oldest first`}
          aria-activedescendant={
            active === null ? undefined : `${baseId}-day-${active}`
          }
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (active === null) read(count - 1);
          }}
          onBlur={() => read(null)}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => read(null)}
          className="flex h-10 w-full items-end gap-px outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {days.map((day, index) => {
            const meta = STATUS[day.status];
            const isActive = index === active;
            return (
              <div
                key={`${day.date}-${index}`}
                id={`${baseId}-day-${index}`}
                role="option"
                aria-selected={isActive}
                aria-label={`${day.date}, ${meta.word}${
                  day.note ? `, ${day.note}` : ""
                }`}
                className="relative h-full min-w-0 flex-1"
              >
                <motion.span
                  aria-hidden
                  className={cn(
                    "absolute inset-0 rounded-1",
                    meta.bar,
                    isActive && "ring-1 ring-ink",
                  )}
                  style={{ transformOrigin: "bottom" }}
                  initial={motionSafe ? { scaleY: 0 } : false}
                  animate={{ scaleY: 1, y: isActive ? -2 : 0 }}
                  transition={{
                    scaleY: motionSafe
                      ? { ...springs.glide, delay: index * step }
                      : { duration: 0 },
                    // A 2px lift under a moving pointer has to land before the
                    // pointer reaches the next bar, so it takes `flick`.
                    y: motionSafe ? springs.flick : { duration: 0 },
                  }}
                />
                {isIncident(day.status) && motionSafe ? (
                  <motion.span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute inset-0 rounded-1",
                      meta.bar,
                    )}
                    style={{ transformOrigin: "bottom" }}
                    initial={{ opacity: 0.9, scaleY: 1.22 }}
                    animate={{ opacity: 0, scaleY: 1 }}
                    transition={{ ...springs.drift, delay: index * step }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <AnimatePresence>
          {reading ? (
            <motion.div
              ref={measureReading}
              aria-hidden
              className="pointer-events-none absolute top-full left-0 z-10 mt-1.5 max-w-full rounded-2 border border-hairline bg-popover px-2 py-0.5 text-popover-foreground shadow-sm"
              initial={{ opacity: 0, x: readingX }}
              animate={{ opacity: 1, x: readingX }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                opacity: { duration: durations.fast, ease: easings.enter },
                x: motionSafe ? springs.glide : { duration: 0 },
              }}
            >
              <span className="flex items-baseline gap-1.5 font-mono text-[11px] whitespace-nowrap tabular-nums">
                <span className="text-foreground">{reading.date}</span>
                <span className={STATUS[reading.status].text}>
                  {STATUS[reading.status].word}
                </span>
              </span>
              {reading.note ? (
                <span className="block max-w-56 text-[10px] leading-tight text-ink-3">
                  {reading.note}
                </span>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span>{count} days ago</span>
        <span>
          {incidents} {incidents === 1 ? "incident" : "incidents"}
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}
