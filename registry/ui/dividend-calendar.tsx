"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DividendPayout = {
  /** Day of the month, 1-based. */
  day: number;
  /** Instrument that paid. */
  symbol: string;
  amount: number;
};

export type DividendMonth = {
  id: string;
  /** Printed between the month arrows. */
  label: string;
  /** Days in the month. */
  days: number;
  /** Weekday the 1st falls on, 0 = Monday. */
  startWeekday: number;
  payouts: DividendPayout[];
};

export type DividendCalendarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The months the arrows walk, oldest first. */
  months: DividendMonth[];
  /** Controlled month id. */
  value?: string;
  /** Initial month id for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Fires from the pointer, focus or key that changed what is being read. */
  onDayRead?: (day: number | null, payout: DividendPayout | null) => void;
  /** Formats every amount, including the month total. */
  format?: (value: number) => string;
  /** Seven column headers, Monday first. */
  weekdays?: string[];
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another produce different text for the same amount, which is a
 * hydration mismatch on the figures this calendar exists to show.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

const DEFAULT_WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const ICON_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-2 border border-input bg-surface-1 text-ink-2 outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40";

/**
 * The month total, rolling.
 *
 * Each column is a window one face tall holding exactly two faces — the
 * character leaving and the character arriving — and the pair travels half its
 * own height on `snap`. Two faces rather than a ten-digit strip is the point: a
 * strip takes the shortest numeric path, so a total falling from 128 to 118
 * would roll its tens column *upward* while the income went down. A pair can
 * only ever move the way the money moved.
 */
function TotalRoll({
  text,
  previous,
  up,
  generation,
  motionSafe,
}: {
  text: string;
  previous: string;
  up: boolean;
  generation: number;
  motionSafe: boolean;
}) {
  // Aligned from the right, so the units column keeps its identity when the
  // figure gains or loses a place and a new column rolls in from a blank.
  const was =
    previous.length >= text.length
      ? previous.slice(previous.length - text.length)
      : previous.padStart(text.length, " ");

  return (
    <span aria-hidden className="inline-flex h-[1.1em] items-stretch">
      {text.split("").map((char, index) => {
        const key = text.length - index;
        const before = was[index] ?? char;
        if (!motionSafe || before === char || generation === 0) {
          return (
            <span
              key={key}
              className="flex h-full w-[1ch] items-center justify-center"
            >
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative flex h-full w-[1ch] items-center justify-center overflow-hidden"
          >
            {/* Keyed by the month change so each one mounts a fresh pair; the
                strip is two faces tall, which is why one face is 50%. */}
            <motion.span
              key={generation}
              className="absolute inset-x-0 top-0 flex h-[200%] flex-col"
              initial={{ y: up ? "0%" : "-50%" }}
              animate={{ y: up ? "-50%" : "0%" }}
              transition={springs.snap}
            >
              <span className="flex h-1/2 items-center justify-center">
                {up ? before : char}
              </span>
              <span className="flex h-1/2 items-center justify-center">
                {up ? char : before}
              </span>
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/** A struck coin: a milled rim and a raised inner edge, drawn not shipped. */
function Coin() {
  return (
    <svg viewBox="0 0 24 24" className="size-full text-cobalt-bright">
      <circle
        cx="12"
        cy="12"
        r="10.6"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeOpacity="0.8"
        strokeWidth="1.6"
        strokeDasharray="2 1.7"
      />
      <circle
        cx="12"
        cy="12"
        r="7.6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="0.9"
      />
    </svg>
  );
}

/** One glyph, mirrored, so the two month arrows cannot drift apart. */
function Chevron({ back }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", back && "-scale-x-100")}
    >
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

/**
 * A month of payouts, laid out on the days they land. Every paying day carries
 * a coin that drops from a `shift` above its cell and lands on `recoil` —
 * ζ0.53 gives the two visible bounces of metal hitting a table — staggered
 * across the month by `cascade()` so a busy month still finishes inside the
 * choreography budget. The coin is drawn, not shipped: a dashed rim for the
 * milling and an inner edge, sized by its cell so it scales with the grid
 * instead of overhanging it.
 *
 * Reading a day does not open a floating tooltip that can leave the frame. The
 * header's readout cross-fades from the month total to that day's line — symbol,
 * date, amount — while the coin lifts on `snap`, and pressing a day pins that
 * reading until Escape or another press. The total itself rolls between months,
 * upward when the new month pays more.
 *
 * The grid is a real `role="grid"` of buttons: arrows walk the days, Home and
 * End reach the ends of a week, PageUp and PageDown change month keeping the
 * day of the month, and every day is named as a sentence so the coin is never
 * the only carrier. Under reduced motion the coins are simply present and the
 * digits swap in place — which days pay is information, not flourish.
 */
export function DividendCalendar({
  ref,
  months,
  value,
  defaultValue,
  onValueChange,
  onDayRead,
  format = defaultFormat,
  weekdays = DEFAULT_WEEKDAYS,
  label,
  className,
  "aria-label": ariaLabel,
}: DividendCalendarProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? months[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const currentId = isControlled ? value : uncontrolled;

  const index = Math.max(
    0,
    months.findIndex((month) => month.id === currentId),
  );
  const month = months[index];

  const [focusDay, setFocusDay] = React.useState(1);
  const [hovered, setHovered] = React.useState<number | null>(null);
  const [pinned, setPinned] = React.useState<number | null>(null);

  const dayRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  // A month change re-renders the whole grid, so the focus move has to wait for
  // the new buttons. The flag keeps that effect from stealing focus on mount.
  const keyMoved = React.useRef(false);

  const byDay = React.useMemo(() => {
    const map = new Map<number, DividendPayout>();
    for (const payout of month?.payouts ?? []) map.set(payout.day, payout);
    return map;
  }, [month]);

  const total = (month?.payouts ?? []).reduce(
    (sum, payout) => sum + payout.amount,
    0,
  );

  // The committed month, adjusted during render rather than in an effect: the
  // roll needs the figure it is leaving, and an effect would paint the new
  // total once before the pair could be built.
  const [shown, setShown] = React.useState(() => ({
    id: currentId,
    total,
    previous: total,
    generation: 0,
  }));
  if (shown.id !== currentId || shown.total !== total) {
    setShown({
      id: currentId,
      total,
      previous: shown.total,
      generation: shown.generation + 1,
    });
  }

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [bodyHeight, setBodyHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    // Measured, never reserved: a five-week month and a six-week one are
    // different heights and the card glides between them.
    const observer = new ResizeObserver(() => {
      setBodyHeight(node.getBoundingClientRect().height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!keyMoved.current) return;
    keyMoved.current = false;
    dayRefs.current[focusDay]?.focus();
  }, [currentId, focusDay]);

  if (!month) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-4",
          className,
        )}
      >
        {label ? (
          <span className="text-sm font-medium">{label}</span>
        ) : (
          <span className="sr-only">{ariaLabel}</span>
        )}
        <p className="text-xs text-ink-3">No months to show.</p>
      </div>
    );
  }

  const clampDay = (day: number) => Math.min(month.days, Math.max(1, day));
  const focused = clampDay(focusDay);

  const report = (day: number | null) => {
    onDayRead?.(day, day === null ? null : (byDay.get(day) ?? null));
  };

  const goToMonth = (nextIndex: number, day?: number, fromKey?: boolean) => {
    const clamped = Math.min(months.length - 1, Math.max(0, nextIndex));
    const next = months[clamped];
    if (!next || next.id === currentId) return;
    // Armed only once the move is real: a blocked PageUp at the first month
    // must not leave the flag set for some later, unrelated focus change.
    if (fromKey) keyMoved.current = true;
    if (!isControlled) setUncontrolled(next.id);
    setPinned(null);
    setHovered(null);
    setFocusDay(Math.min(next.days, day ?? focused));
    report(null);
    onValueChange?.(next.id);
  };

  const moveFocus = (day: number) => {
    const clamped = clampDay(day);
    setFocusDay(clamped);
    keyMoved.current = true;
  };

  const handleKeyDown = (event: React.KeyboardEvent, day: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        moveFocus(day + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(day - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(day + 7);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(day - 7);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(day - ((month.startWeekday + day - 1) % 7));
        break;
      case "End":
        event.preventDefault();
        moveFocus(day + (6 - ((month.startWeekday + day - 1) % 7)));
        break;
      case "PageUp":
        event.preventDefault();
        goToMonth(index - 1, day, true);
        break;
      case "PageDown":
        event.preventDefault();
        goToMonth(index + 1, day, true);
        break;
      case "Escape":
        if (pinned === null) break;
        event.preventDefault();
        setPinned(null);
        report(hovered);
        break;
      default:
        break;
    }
  };

  const press = (day: number) => {
    const next = pinned === day ? null : day;
    setPinned(next);
    report(hovered ?? next);
  };

  const lead = ((month.startWeekday % 7) + 7) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: month.days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );

  const stagger = cascade(Math.max(month.payouts.length, 1));
  const dropOrder = new Map(
    month.payouts
      .slice()
      .sort((a, b) => a.day - b.day)
      .map((payout, order) => [payout.day, order]),
  );

  const reading = hovered ?? pinned;
  const readPayout = reading === null ? null : (byDay.get(reading) ?? null);
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      {label ? (
        <span id={labelId} className="truncate text-sm font-medium">
          {label}
        </span>
      ) : null}

      <div className="flex items-end justify-between gap-3">
        {/* Both readouts share one grid cell, so the cross-fade never reserves
            a second line or collapses the header between them. */}
        <span className="grid min-w-0 flex-1">
          <motion.span
            aria-hidden={reading !== null}
            className="col-start-1 row-start-1 flex flex-col gap-0.5"
            animate={{ opacity: reading === null ? 1 : 0 }}
            transition={fade}
          >
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {month.payouts.length} payouts
            </span>
            <span className="font-mono text-xl leading-none font-medium tabular-nums">
              <TotalRoll
                text={format(total)}
                previous={format(shown.previous)}
                up={shown.total >= shown.previous}
                generation={shown.generation}
                motionSafe={motionSafe}
              />
              <span className="sr-only">{format(total)}</span>
            </span>
          </motion.span>

          <motion.span
            aria-hidden={reading === null}
            className="col-start-1 row-start-1 flex flex-col gap-0.5"
            animate={{ opacity: reading === null ? 0 : 1 }}
            transition={fade}
          >
            <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {reading} {month.label}
              {readPayout ? ` · ${readPayout.symbol}` : " · no payout"}
            </span>
            <span
              className={cn(
                "font-mono text-xl leading-none font-medium tabular-nums",
                readPayout ? "text-cobalt-bright" : "text-ink-3",
              )}
            >
              {readPayout ? format(readPayout.amount) : "\u2014"}
            </span>
          </motion.span>
        </span>

        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            disabled={index === 0}
            onClick={() => goToMonth(index - 1)}
            className={ICON_BUTTON}
          >
            <Chevron back />
          </button>
          <span className="w-16 text-center font-mono text-[11px] font-medium">
            {month.label}
          </span>
          <button
            type="button"
            aria-label="Next month"
            disabled={index === months.length - 1}
            onClick={() => goToMonth(index + 1)}
            className={ICON_BUTTON}
          >
            <Chevron />
          </button>
        </span>
      </div>

      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: bodyHeight ?? "auto" }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <div ref={bodyRef}>
          <div
            role="grid"
            aria-labelledby={label ? labelId : undefined}
            aria-label={label ? undefined : ariaLabel}
            className="flex flex-col gap-1"
          >
            <div role="row" className="grid grid-cols-7 gap-1">
              {weekdays.map((day, column) => (
                <span
                  key={`${day}-${column}`}
                  role="columnheader"
                  className="flex h-4 items-center justify-center font-mono text-[10px] text-ink-3"
                >
                  {day}
                </span>
              ))}
            </div>

            {/* Keyed by month so a change mounts a fresh set of coins and they
                drop again, rather than a table swapping underneath. A rowgroup
                rather than a bare div: a grid must own its rows. */}
            <div key={month.id} role="rowgroup" className="flex flex-col gap-1">
              {weeks.map((week, row) => (
                <div key={row} role="row" className="grid grid-cols-7 gap-1">
                  {week.map((day, column) => {
                    if (day === null) {
                      return (
                        <span
                          key={`blank-${column}`}
                          role="gridcell"
                          className="aspect-square"
                        />
                      );
                    }
                    const payout = byDay.get(day) ?? null;
                    const isPinned = pinned === day;
                    const isRead = reading === day;
                    const order = dropOrder.get(day) ?? 0;
                    return (
                      <span key={day} role="gridcell" className="min-w-0">
                        <button
                          type="button"
                          ref={(node) => {
                            dayRefs.current[day] = node;
                          }}
                          tabIndex={day === focused ? 0 : -1}
                          aria-pressed={isPinned}
                          aria-label={`${day} ${month.label}, ${
                            payout
                              ? `${payout.symbol}, ${format(payout.amount)}`
                              : "no payout"
                          }`}
                          onFocus={() => {
                            setFocusDay(day);
                            setHovered(day);
                            report(day);
                          }}
                          onBlur={() => {
                            setHovered(null);
                            report(pinned);
                          }}
                          onPointerEnter={() => {
                            setHovered(day);
                            report(day);
                          }}
                          onPointerLeave={() => {
                            setHovered(null);
                            report(pinned);
                          }}
                          onClick={() => press(day)}
                          onKeyDown={(event) => handleKeyDown(event, day)}
                          className={cn(
                            "relative flex aspect-square w-full items-center justify-center rounded-2 border transition-colors outline-none",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            payout
                              ? "border-hairline-strong bg-surface-2"
                              : "border-transparent hover:border-hairline",
                            isPinned && "border-cobalt-bright",
                          )}
                        >
                          {payout ? (
                            <motion.span
                              aria-hidden
                              className="absolute inset-[12%]"
                              initial={
                                motionSafe
                                  ? {
                                      y: -distances.shift,
                                      scale: 0.7,
                                      opacity: 0,
                                    }
                                  : false
                              }
                              animate={{ y: 0, scale: 1, opacity: 1 }}
                              transition={
                                motionSafe
                                  ? {
                                      ...springs.recoil,
                                      delay: order * stagger,
                                      opacity: { duration: durations.blink },
                                    }
                                  : { duration: 0 }
                              }
                            >
                              {/* The lift is its own layer: sharing the drop's
                                  transition would hand a late coin's stagger
                                  delay to every hover for the life of the
                                  month. */}
                              <motion.span
                                className="block size-full"
                                animate={{ y: isRead && motionSafe ? -2 : 0 }}
                                transition={
                                  motionSafe ? springs.snap : { duration: 0 }
                                }
                              >
                                <Coin />
                              </motion.span>
                            </motion.span>
                          ) : null}
                          <span
                            className={cn(
                              "relative font-mono text-[11px] tabular-nums transition-colors",
                              payout
                                ? "font-medium text-cobalt-bright"
                                : "text-ink-3",
                            )}
                          >
                            {day}
                          </span>
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {month.label}, {month.payouts.length} payouts, {format(total)} total
      </span>
    </div>
  );
}
