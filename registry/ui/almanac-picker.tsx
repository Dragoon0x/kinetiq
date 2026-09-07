"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AlmanacValue = Date | [Date, Date | null];

type Cursor = { y: number; m: number };

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Row geometry, so the frame has a correct height on its very first paint. */
const ROW_H = 36;
const ROW_GAP = 4;

/** Sortable day key; comparisons never touch the time of day. */
const dayKey = (d: Date) =>
  d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
const sameDay = (a: Date | null, b: Date | null) =>
  a !== null && b !== null && dayKey(a) === dayKey(b);
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monthOf = (d: Date): Cursor => ({ y: d.getFullYear(), m: d.getMonth() });
const shiftMonth = (c: Cursor, by: number) =>
  monthOf(new Date(c.y, c.m + by, 1));

/**
 * Today, read after hydration rather than during render. The server has no
 * clock the client will agree with, so the first pass reports none and the ring
 * arrives on the re-render — the contract useMotionSafe keeps for the same
 * reason. Cached, because a snapshot that changed identity every call would
 * spin the store.
 */
let todayCache: number | null = null;
const readToday = () => (todayCache ??= dayKey(new Date()));
const noSubscribe = () => () => {};
const useToday = () =>
  React.useSyncExternalStore(noSubscribe, readToday, () => null);

function buildMonth(y: number, m: number): Date[][] {
  const lead = new Date(y, m, 1).getDay();
  const span = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: Math.ceil((lead + span) / 7) }, (_, week) =>
    Array.from(
      { length: 7 },
      (_, day) => new Date(y, m, 1 - lead + week * 7 + day),
    ),
  );
}

export type AlmanacPickerProps = {
  /** One date, or a start and an end. */
  mode?: "single" | "range";
  /** Controlled selection, shaped by `mode`. */
  value?: AlmanacValue;
  /** Initial selection for uncontrolled usage. */
  defaultValue?: AlmanacValue;
  /** Fires on selection; opening a range fires once with a null end. */
  onValueChange?: (value: AlmanacValue) => void;
  /** Bounds; days outside are disabled. */
  min?: Date;
  max?: Date;
  /** Group label. */
  label?: string;
  className?: string;
};

/**
 * A month grid that moves by direction: the next month enters from
 * `distances.shift` on the right while the old one leaves on the exit ease, and
 * the frame's measured height `glide`s so a five-row month never jumps to a
 * six-row one. A chosen day stamps on `recoil`; today wears a ring. In range
 * mode the fill sweeps between the ends on a scaleX tween as the second date is
 * hovered — or arrowed to, so the keyboard sees the same sweep.
 *
 * It is a real grid: arrows move a day, PageUp and PageDown change month, Home
 * and End jump to the ends of the week, Enter or Space selects, and the month
 * name is a live region. Reduced motion cross-fades the months and drops the
 * stamp; the fill still fills.
 */
export function AlmanacPicker({
  mode = "single",
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  label = "Date",
  className,
}: AlmanacPickerProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const today = useToday();

  const [uncontrolled, setUncontrolled] = React.useState<AlmanacValue | null>(
    () => defaultValue ?? null,
  );
  const selection = value ?? uncontrolled;

  const single =
    mode === "single" && selection instanceof Date ? selection : null;
  const range: [Date | null, Date | null] =
    mode === "range" && Array.isArray(selection)
      ? [selection[0] ?? null, selection[1] ?? null]
      : [null, null];
  const anchor = single ?? range[0] ?? min ?? null;

  const [override, setOverride] = React.useState<Cursor | null>(null);
  const cursor: Cursor =
    override ??
    (anchor
      ? monthOf(anchor)
      : today !== null
        ? { y: Math.floor(today / 10000), m: Math.floor(today / 100) % 100 }
        : { y: 2026, m: 0 });

  const [direction, setDirection] = React.useState(1);
  const [focused, setFocused] = React.useState<Date>(
    () => anchor ?? new Date(cursor.y, cursor.m, 1),
  );
  const [hover, setHover] = React.useState<Date | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  const wantFocus = React.useRef(false);

  const cellId = (c: Cursor, d: Date) => `${baseId}-${c.y}-${c.m}-${dayKey(d)}`;

  /**
   * A ref callback with its own cleanup, so each month owns its observer: one
   * shared ref would be nulled by the outgoing month after the incoming one
   * had already claimed it.
   */
  const measure = React.useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return;
    // The observer's first callback carries the measurement, so nothing has to
    // set state synchronously inside an effect to get the opening height.
    const observer = new ResizeObserver(() => {
      setHeight(el.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    // Ids carry the month, so the month on its way out cannot answer first.
    document.getElementById(cellId(cursor, focused))?.focus();
  });

  const outOfBounds = (d: Date) =>
    (min !== undefined && dayKey(d) < dayKey(min)) ||
    (max !== undefined && dayKey(d) > dayKey(max));

  const goMonth = (by: number) => {
    setDirection(by >= 0 ? 1 : -1);
    setOverride(shiftMonth(cursor, by));
  };

  const moveFocus = (next: Date) => {
    wantFocus.current = true;
    setFocused(next);
    const target = monthOf(next);
    if (target.y !== cursor.y || target.m !== cursor.m) {
      setDirection(
        target.y * 12 + target.m > cursor.y * 12 + cursor.m ? 1 : -1,
      );
      setOverride(target);
    }
  };

  const emit = (next: AlmanacValue) => {
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const choose = (day: Date) => {
    if (outOfBounds(day)) return;
    // A trailing or leading day belongs to its own month, so the view follows
    // it there rather than selecting something the grid no longer shows.
    moveFocus(day);
    setHover(null);
    if (mode === "single") {
      emit(day);
      return;
    }
    const [start, end] = range;
    // A finished range — or none yet — opens the next one; otherwise this click
    // closes the pair, in whichever order the two were picked.
    if (start === null || end !== null) {
      emit([day, null]);
      return;
    }
    emit(dayKey(day) < dayKey(start) ? [day, start] : [start, day]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      choose(focused);
      return;
    }
    const day = focused.getDate();
    const moves: Record<string, Date> = {
      ArrowLeft: addDays(focused, -1),
      ArrowRight: addDays(focused, 1),
      ArrowUp: addDays(focused, -7),
      ArrowDown: addDays(focused, 7),
      Home: addDays(focused, -focused.getDay()),
      End: addDays(focused, 6 - focused.getDay()),
      PageUp: new Date(focused.getFullYear(), focused.getMonth() - 1, day),
      PageDown: new Date(focused.getFullYear(), focused.getMonth() + 1, day),
    };
    const next = moves[key];
    if (!next) return;
    event.preventDefault();
    moveFocus(next);
  };

  const pending = mode === "range" && range[0] !== null && range[1] === null;
  // While a range is open the sweep follows the pointer, or the focused day, so
  // arrowing through the month reads exactly like hovering it.
  const paintEnd = pending ? (hover ?? focused) : range[1];
  const band: [number, number] | null =
    range[0] !== null && paintEnd !== null
      ? [
          Math.min(dayKey(range[0]), dayKey(paintEnd)),
          Math.max(dayKey(range[0]), dayKey(paintEnd)),
        ]
      : null;

  const weeks = buildMonth(cursor.y, cursor.m);
  const monthLabel = `${MONTHS[cursor.m]} ${cursor.y}`;
  const slide = motionSafe ? distances.shift : 0;
  const frameHeight =
    height ?? weeks.length * ROW_H + (weeks.length - 1) * ROW_GAP;

  const isSelected = (d: Date) =>
    mode === "single"
      ? sameDay(single, d)
      : sameDay(range[0], d) || sameDay(range[1], d);

  const navButton = (by: -1 | 1) => (
    <button
      type="button"
      aria-label={by < 0 ? "Previous month" : "Next month"}
      onClick={() => goMonth(by)}
      className="flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline bg-surface-1 outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0">
        <path
          d={by < 0 ? "m14.5 5-7 7 7 7" : "m9.5 5 7 7-7 7"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  const months = {
    enter: (d: number) => ({ opacity: 0, x: slide * d }),
    center: { opacity: 1, x: 0 },
    leave: (d: number) => ({
      opacity: 0,
      x: -slide * d,
      transition: { duration: durations.base * 0.6, ease: easings.exit },
    }),
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("flex w-full max-w-[300px] flex-col gap-3", className)}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>

      <div className="flex items-center gap-2">
        {navButton(-1)}
        <div
          aria-live="polite"
          className="flex-1 text-center font-mono text-xs tracking-[0.08em] uppercase"
        >
          {monthLabel}
        </div>
        {navButton(1)}
      </div>

      <div aria-hidden className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day, index) => (
          <span
            key={index}
            className="flex h-5 items-center justify-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {day}
          </span>
        ))}
      </div>

      <motion.div
        className="relative overflow-hidden"
        initial={false}
        animate={{ height: frameHeight }}
        transition={motionSafe ? springs.glide : { duration: durations.fast }}
      >
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={`${cursor.y}-${cursor.m}`}
            ref={measure}
            custom={direction}
            variants={months}
            initial="enter"
            animate="center"
            exit="leave"
            transition={
              motionSafe
                ? { ...springs.glide, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            role="grid"
            aria-label={`${label}, ${monthLabel}`}
            onKeyDown={onKeyDown}
            onPointerLeave={() => setHover(null)}
            className="absolute inset-x-0 top-0 flex flex-col gap-1"
          >
            {weeks.map((week, rowIndex) => {
              const inBand = (d: Date) =>
                band !== null && dayKey(d) >= band[0] && dayKey(d) <= band[1];
              const covered = week.filter(inBand).length;
              const first = covered > 0 ? week.findIndex(inBand) : 0;
              const reach = 7 - first;
              return (
                <div
                  key={rowIndex}
                  role="row"
                  className="relative grid grid-cols-7 gap-1"
                >
                  {band !== null && (
                    // One band per row, anchored at the first covered column and
                    // swept open by scaleX as the second date moves.
                    <motion.span
                      aria-hidden
                      className="absolute inset-y-0 origin-left rounded-2 bg-cobalt-wash"
                      style={{
                        left: `${(first / 7) * 100}%`,
                        width: `${(reach / 7) * 100}%`,
                      }}
                      initial={false}
                      animate={{ scaleX: covered / reach }}
                      transition={{
                        duration: motionSafe ? durations.base : 0,
                        ease: easings.move,
                      }}
                    />
                  )}
                  {week.map((day) => {
                    const outside = day.getMonth() !== cursor.m;
                    const disabled = outOfBounds(day);
                    const selected = isSelected(day);
                    const isToday = today !== null && dayKey(day) === today;
                    const carries = sameDay(day, focused);
                    return (
                      <button
                        key={dayKey(day)}
                        id={cellId(cursor, day)}
                        type="button"
                        role="gridcell"
                        aria-selected={selected}
                        aria-disabled={disabled || undefined}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={`${MONTHS[day.getMonth()]} ${day.getDate()}, ${day.getFullYear()}`}
                        tabIndex={carries ? 0 : -1}
                        onClick={() => choose(day)}
                        onFocus={() => setFocused(day)}
                        onPointerEnter={() => {
                          if (pending) setHover(day);
                        }}
                        className={cn(
                          "relative flex h-9 items-center justify-center rounded-2 font-mono text-xs tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          disabled && "cursor-default opacity-30",
                          selected
                            ? "font-semibold text-primary-foreground"
                            : outside
                              ? "text-ink-3"
                              : "text-foreground",
                          !disabled && !selected && "hover:bg-surface-2",
                          isToday && !selected && "ring-1 ring-primary",
                        )}
                      >
                        {selected && (
                          <motion.span
                            aria-hidden
                            className="absolute inset-0 rounded-2 bg-primary"
                            initial={{ scale: motionSafe ? 0.6 : 1 }}
                            animate={{ scale: 1 }}
                            style={{ originX: 0.5, originY: 0.5 }}
                            transition={
                              motionSafe ? springs.recoil : { duration: 0 }
                            }
                          />
                        )}
                        <span className="relative">{day.getDate()}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
