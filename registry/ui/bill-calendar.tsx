"use client";

import * as React from "react";

import { AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Bill = {
  id: string;
  label: string;
  amount: number;
  /** Day of the month it lands on, 1-based. */
  day: number;
};

export type BillCalendarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled bills. */
  bills?: Bill[];
  /** Initial bills for uncontrolled use. */
  defaultBills?: Bill[];
  /** Fires from the drop or the keyboard move that changed a day. */
  onBillsChange?: (bills: Bill[]) => void;
  /** Fires alongside it with the move itself, for an undo line. */
  onBillMove?: (bill: Bill, fromDay: number, toDay: number) => void;
  /** What the account holds before the first of the month. */
  openingBalance: number;
  /** Days in the month. @default 30 */
  days?: number;
  /** Column the 1st sits in, 0 = Monday. @default 0 */
  startWeekday?: number;
  /** Printed in the header and in every day's label. @default "This month" */
  monthLabel?: string;
  /** Balance under this reads danger. @default 0 */
  floor?: number;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Names the grid for assistive technology. @default "Bill calendar" */
  label?: string;
  className?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number): string => MONEY.format(value);

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const NO_BILLS: Bill[] = [];

/** Travel before a press becomes a drag — under this, a tap is still a tap. */
const CAPTURE_PX = 4;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Chip figures are abbreviated: a 42px cell has no room for cents. */
const brief = (amount: number): string =>
  amount >= 1000
    ? `${(amount / 1000).toFixed(1)}k`
    : String(Math.round(amount));

/** The running balance, day by day — a balance is a step function, not a curve. */
function series(bills: Bill[], opening: number, days: number): number[] {
  const out: number[] = [];
  let running = opening;
  for (let day = 1; day <= days; day += 1) {
    for (const bill of bills) {
      if (bill.day === day) running -= bill.amount;
    }
    out.push(running);
  }
  return out;
}

/**
 * A month of bills, each on the day it lands, over a balance line that shows
 * what the account holds on every one of those days. The line is drawn as one
 * column per day — a balance really is piecewise-constant between bills — and
 * each column's height animates on `glide`, so moving a bill re-plots the month
 * with a layout's physics rather than a switch's.
 *
 * Dragging a chip is direct manipulation: the pointer is captured only after
 * 4px of travel, inside try/catch, a carry chip follows it inside the card's
 * own frame while the original stays as a dashed ghost, and the day under the
 * pointer lights as the drop target. On release the bill lands on `recoil` —
 * the two bounces of something dropping onto a date — and every column past
 * that day glides while the low-balance marker slides to the new trough.
 *
 * The month is a `role="grid"` of day buttons with a roving tabindex: arrows
 * walk days, Home and End reach the ends of a week, Enter lifts the bill on the
 * focused day, arrows then choose its new day, Enter drops it and Escape
 * cancels — the whole drag, on the keyboard, narrated through a polite live
 * region. Under reduced motion nothing lifts or bounces, but the line still
 * re-plots, because where the money goes is the reading.
 */
export function BillCalendar({
  ref,
  bills,
  defaultBills = NO_BILLS,
  onBillsChange,
  onBillMove,
  openingBalance,
  days = 30,
  startWeekday = 0,
  monthLabel = "This month",
  floor = 0,
  format = defaultFormat,
  label = "Bill calendar",
  className,
}: BillCalendarProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<Bill[]>(defaultBills);
  const isControlled = bills !== undefined;
  const list = isControlled ? bills : uncontrolled;

  const [readDay, setReadDay] = React.useState(() => list[0]?.day ?? 1);
  const [lifted, setLifted] = React.useState<Bill | null>(null);
  const [pendingDay, setPendingDay] = React.useState<number | null>(null);
  const [dragging, setDragging] = React.useState<Bill | null>(null);
  const [hoverDay, setHoverDay] = React.useState<number | null>(null);
  const [note, setNote] = React.useState("");

  const cellRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const frameBox = React.useRef<DOMRect | null>(null);
  const grab = React.useRef<{ x: number; y: number; bill: Bill } | null>(null);
  const captured = React.useRef(false);

  const carryX = useMotionValue(0);
  const carryY = useMotionValue(0);

  // If the press is released somewhere the cell never hears about — capture
  // refused, the pointer gone — the carry chip must not be left hanging. The
  // cell's own handler runs first, so this only catches strays.
  React.useEffect(() => {
    if (!dragging) return;
    const stray = () => {
      grab.current = null;
      captured.current = false;
      setDragging(null);
      setHoverDay(null);
    };
    window.addEventListener("pointerup", stray);
    window.addEventListener("pointercancel", stray);
    return () => {
      window.removeEventListener("pointerup", stray);
      window.removeEventListener("pointercancel", stray);
    };
  }, [dragging]);

  const rows = Math.ceil((startWeekday + days) / 7);
  const balances = series(list, openingBalance, days);
  const top = balances.reduce((high, at) => Math.max(high, at), openingBalance);
  const bottom = balances.reduce((low, at) => Math.min(low, at), 0);
  const range = top - bottom > 0 ? top - bottom : 1;
  const lowIndex = balances.reduce(
    (at, value, index) => ((balances[at] ?? 0) <= value ? at : index),
    0,
  );

  const billsOn = (day: number) => list.filter((bill) => bill.day === day);
  const dueTotal = list.reduce((sum, bill) => sum + bill.amount, 0);

  const move = (bill: Bill, toDay: number) => {
    const target = clamp(Math.round(toDay), 1, days);
    if (bill.day === target) return;
    const next = list.map((entry) =>
      entry.id === bill.id ? { ...entry, day: target } : entry,
    );
    if (!isControlled) setUncontrolled(next);
    onBillsChange?.(next);
    onBillMove?.(bill, bill.day, target);
    const low = series(next, openingBalance, days).reduce(
      (least, at) => Math.min(least, at),
      openingBalance,
    );
    setNote(
      `${bill.label} moved to ${monthLabel} ${target}. Lowest balance ${format(low)}.`,
    );
  };

  const focusAt = (day: number) => {
    const target = clamp(day, 1, days);
    setReadDay(target);
    cellRefs.current[target]?.focus();
  };

  const drop = () => {
    if (!lifted) return;
    const target = pendingDay ?? lifted.day;
    move(lifted, target);
    setLifted(null);
    setPendingDay(null);
    focusAt(target);
  };

  const cancelLift = () => {
    if (!lifted) return;
    setNote(`Move cancelled. ${lifted.label} stays on ${lifted.day}.`);
    focusAt(lifted.day);
    setLifted(null);
    setPendingDay(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent, day: number) => {
    const step = (delta: number) => {
      event.preventDefault();
      if (lifted) setPendingDay(clamp((pendingDay ?? day) + delta, 1, days));
      else focusAt(day + delta);
    };
    switch (event.key) {
      case "ArrowRight":
        step(1);
        break;
      case "ArrowLeft":
        step(-1);
        break;
      case "ArrowDown":
        step(7);
        break;
      case "ArrowUp":
        step(-7);
        break;
      case "Home":
        event.preventDefault();
        if (!lifted) focusAt(day - ((day + startWeekday - 1) % 7));
        break;
      case "End":
        event.preventDefault();
        if (!lifted) focusAt(day + (6 - ((day + startWeekday - 1) % 7)));
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        if (lifted) {
          drop();
          break;
        }
        const first = billsOn(day)[0];
        if (!first) break;
        setLifted(first);
        setPendingDay(day);
        setNote(
          `${first.label}, ${format(first.amount)}, lifted from ${monthLabel} ${day}. Arrow keys choose a day, Enter drops it, Escape cancels.`,
        );
        break;
      }
      case "Escape":
        if (!lifted) break;
        event.preventDefault();
        cancelLift();
        break;
      default:
        break;
    }
  };

  const dayUnder = (clientX: number, clientY: number): number | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const cell = element?.closest?.("[data-day]");
    const value = cell?.getAttribute("data-day");
    const day = value === null || value === undefined ? NaN : Number(value);
    return Number.isFinite(day) ? day : null;
  };

  const endDrag = (event: React.PointerEvent, commit: boolean) => {
    const from = grab.current;
    grab.current = null;
    const dragged = captured.current;
    captured.current = false;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Already released by the browser, or never captured at all.
    }
    const target = hoverDay;
    setDragging(null);
    setHoverDay(null);
    if (!from || !dragged || !commit || target === null) return;
    move(from.bill, target);
    setReadDay(target);
  };

  const reading = billsOn(readDay);
  const readBalance = balances[readDay - 1] ?? openingBalance;
  const summary = reading.length
    ? `${monthLabel} ${readDay} · ${reading.map((bill) => `${bill.label} ${format(bill.amount)}`).join(" · ")}`
    : `${monthLabel} ${readDay} · no bills`;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {list.length} due · {format(dueTotal)}
        </span>
      </div>

      <div ref={frameRef} className="relative">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((name, index) => (
            <span
              key={`${name}-${index}`}
              aria-hidden
              className="flex h-4 items-center justify-center text-[10px] font-medium text-ink-3"
            >
              {name}
            </span>
          ))}
        </div>

        <div
          role="grid"
          aria-labelledby={labelId}
          className="flex flex-col gap-1"
        >
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} role="row" className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, col) => {
                const day = row * 7 + col + 1 - startWeekday;
                if (day < 1 || day > days) {
                  return (
                    <div
                      key={col}
                      role="gridcell"
                      aria-hidden
                      className="h-11 rounded-2"
                    />
                  );
                }
                const dayBills = billsOn(day);
                const balance = balances[day - 1] ?? openingBalance;
                const short = balance < floor;
                const isTarget =
                  (dragging !== null && hoverDay === day) ||
                  (lifted !== null && pendingDay === day);
                return (
                  <div key={col} role="gridcell" className="min-w-0">
                    <button
                      ref={(node) => {
                        cellRefs.current[day] = node;
                      }}
                      type="button"
                      data-day={day}
                      tabIndex={day === readDay ? 0 : -1}
                      aria-label={`${monthLabel} ${day}${
                        dayBills.length
                          ? `, ${dayBills.map((bill) => `${bill.label} ${format(bill.amount)} due`).join(", ")}`
                          : ", no bills"
                      }, balance ${format(balance)}${short ? ", overdrawn" : ""}`}
                      onFocus={() => setReadDay(day)}
                      onClick={() => setReadDay(day)}
                      onKeyDown={(event) => handleKeyDown(event, day)}
                      onPointerDown={(event) => {
                        const first = dayBills[0];
                        if (!first) return;
                        frameBox.current =
                          frameRef.current?.getBoundingClientRect() ?? null;
                        grab.current = {
                          x: event.clientX,
                          y: event.clientY,
                          bill: first,
                        };
                        captured.current = false;
                      }}
                      onPointerMove={(event) => {
                        const from = grab.current;
                        if (!from) return;
                        const dx = event.clientX - from.x;
                        const dy = event.clientY - from.y;
                        if (!captured.current) {
                          if (Math.hypot(dx, dy) < CAPTURE_PX) return;
                          try {
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                          } catch {
                            // A synthetic sweep has no live pointer to capture.
                          }
                          captured.current = true;
                          setDragging(from.bill);
                        }
                        const box = frameBox.current;
                        if (box) {
                          carryX.set(event.clientX - box.left);
                          carryY.set(event.clientY - box.top);
                        }
                        setHoverDay(dayUnder(event.clientX, event.clientY));
                      }}
                      onPointerUp={(event) => endDrag(event, true)}
                      onPointerCancel={(event) => endDrag(event, false)}
                      className={cn(
                        "flex h-11 w-full cursor-pointer flex-col items-stretch gap-0.5 rounded-2 border p-1 text-left transition-colors outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        isTarget
                          ? "border-cobalt-bright bg-cobalt-wash"
                          : short
                            ? "border-danger/40 bg-surface-2"
                            : "border-hairline bg-surface-2 hover:border-hairline-strong",
                      )}
                    >
                      {/* The day and its overflow count share one line, so a
                          busy day does not need a row the cell has not got. */}
                      <span
                        aria-hidden
                        className="flex items-center justify-center gap-0.5 font-mono text-[9px] leading-none tabular-nums"
                      >
                        <span className={short ? "text-danger" : "text-ink-3"}>
                          {day}
                        </span>
                        {dayBills.length > 1 ? (
                          <span className="text-ink-3">
                            +{dayBills.length - 1}
                          </span>
                        ) : null}
                      </span>
                      {dayBills.slice(0, 1).map((bill) => (
                        <motion.span
                          key={bill.id}
                          aria-hidden
                          className={cn(
                            "flex h-4 items-center justify-center rounded-1 px-1 font-mono text-[9px] leading-none font-medium tabular-nums",
                            lifted?.id === bill.id || dragging?.id === bill.id
                              ? "border border-dashed border-hairline-strong text-ink-3"
                              : "bg-cobalt-wash text-cobalt-bright",
                          )}
                          initial={
                            motionSafe
                              ? { opacity: 0, scale: 1.18 }
                              : { opacity: 0 }
                          }
                          animate={{ opacity: 1, scale: 1 }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.recoil,
                                  opacity: { duration: durations.fast },
                                }
                              : { duration: durations.fast }
                          }
                        >
                          {brief(bill.amount)}
                        </motion.span>
                      ))}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* The carry chip lives inside the card's own frame, never on the page. */}
        <AnimatePresence>
          {dragging ? (
            <motion.div
              aria-hidden
              style={{ x: carryX, y: carryY }}
              className="pointer-events-none absolute top-0 left-0 z-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              <motion.span
                className="flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-2 border border-cobalt-bright bg-popover px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground tabular-nums shadow-raised"
                initial={motionSafe ? { scale: 0.9 } : false}
                animate={{ scale: 1 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
              >
                {format(dragging.amount)}
              </motion.span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Balance line: one column per day, stepping down at every bill. */}
      <div>
        <div aria-hidden className="relative flex h-9 items-end gap-px">
          {balances.map((balance, index) => {
            const share = clamp((balance - bottom) / range, 0, 1);
            const short = balance < floor;
            return (
              <div
                key={index}
                className="relative h-full min-w-0 flex-1 overflow-hidden rounded-1 bg-surface-2"
              >
                <motion.span
                  className={cn(
                    "absolute inset-x-0 bottom-0",
                    short ? "bg-danger/20" : "bg-cobalt-wash",
                  )}
                  initial={{ height: "0%" }}
                  animate={{ height: `${(share * 100).toFixed(2)}%` }}
                  transition={
                    motionSafe
                      ? springs.glide
                      : { duration: durations.base, ease: easings.enter }
                  }
                >
                  <span
                    className={cn(
                      "absolute inset-x-0 top-0 h-0.5",
                      short ? "bg-danger" : "bg-cobalt-bright",
                    )}
                  />
                </motion.span>
              </div>
            );
          })}

          {/* Only drawn when the month actually goes under: a floor line with
              nothing below it is a rule about nothing. */}
          {bottom < floor ? (
            <span
              style={{
                bottom: `${(((floor - bottom) / range) * 100).toFixed(2)}%`,
              }}
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-danger"
            />
          ) : null}
        </div>

        <div className="mt-1 flex items-center justify-between gap-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`${lowIndex}-${balances[lowIndex] ?? 0}`}
              className={cn(
                "font-mono text-[10px] tabular-nums",
                (balances[lowIndex] ?? 0) < floor
                  ? "text-danger"
                  : "text-ink-3",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              Low {format(balances[lowIndex] ?? 0)} on the {lowIndex + 1}
            </motion.span>
          </AnimatePresence>
          <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
            opens {format(openingBalance)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={summary}
            className="min-w-0 flex-1 truncate text-[11px] text-ink-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {summary}
          </motion.span>
        </AnimatePresence>
        <span
          className={cn(
            "shrink-0 font-mono text-[11px] font-medium tabular-nums",
            readBalance < floor ? "text-danger" : "text-foreground",
          )}
        >
          {format(readBalance)}
        </span>
      </div>

      <p aria-live="polite" className="sr-only">
        {note}
      </p>
    </div>
  );
}
