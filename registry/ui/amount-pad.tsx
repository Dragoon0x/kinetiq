"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AmountPadProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled amount in major units. */
  value?: number;
  /** Initial amount for uncontrolled usage. @default 0 */
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Ceiling; a press that would pass it is refused. Omit for no ceiling. */
  limit?: number;
  /** Fires from the refused press, with the amount that was attempted. */
  onLimitReached?: (attempted: number) => void;
  /**
   * Money formatter — the pad never invents a currency. `fractionDigits` is how
   * many cents digits have been typed, so the field is not padded to `.00`
   * before the payer gets there.
   */
  format?: (value: number, fractionDigits: number) => string;
  /** Names the pad and the readout. @default "Amount" */
  label?: string;
  /** A quiet line under the figure — what the money is for. */
  caption?: React.ReactNode;
  className?: string;
};

type Key = { id: string; glyph: string; kind: "digit" | "point" | "back" };

const KEYS: Key[] = [
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => ({
    id: digit,
    glyph: digit,
    kind: "digit" as const,
  })),
  { id: "point", glyph: ".", kind: "point" },
  { id: "0", glyph: "0", kind: "digit" },
  { id: "back", glyph: "", kind: "back" },
];

const COLUMNS = 3;
/** The figure jumps here and `recoil` rings it back — that is the shake. */
const SHAKE_FROM = -10;
/** A typed key stays lit this long; a pressed key stays lit until release. */
const FLASH_MS = 140;
/** How long a refusal holds its danger line before the pad reads normal again. */
const REFUSAL_MS = 2400;
/** Whole digits the field will take, so a long paste cannot overhang the card. */
const MAX_WHOLE = 9;

const KEY_NAMES: Record<string, string> = {
  point: "Decimal point",
  back: "Delete",
};

/** Explicit locale: the server and the first client render must agree. */
const money = new Map<number, Intl.NumberFormat>();
const defaultFormat = (value: number, fractionDigits: number) => {
  let formatter = money.get(fractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    money.set(fractionDigits, formatter);
  }
  return formatter.format(value);
};

type Entry = { whole: string; cents: string; point: boolean; from: number };

const amountOf = (whole: string, cents: string) =>
  Number(`${whole === "" ? "0" : whole}.${cents === "" ? "0" : cents}`);

const seed = (value: number): Entry => {
  const safeValue = Math.max(0, value);
  const [whole = "0", cents = ""] = String(safeValue).split(".");
  const trimmed = cents.slice(0, 2);
  return {
    whole: safeValue === 0 ? "" : whole.slice(0, MAX_WHOLE),
    cents: trimmed,
    point: trimmed.length > 0,
    from: value,
  };
};

type Cell = { key: string; char: string };

/**
 * Splits the printed amount into cells whose identity survives an edit: the
 * prefix keeps its position, digits count from the left so a typed digit is the
 * only cell that mounts, and group separators count among themselves so an
 * inserted comma glides the row over instead of re-mounting it.
 */
function headCells(text: string): Cell[] {
  const firstDigit = text.search(/\d/);
  const cells: Cell[] = [];
  let digits = 0;
  let groups = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (firstDigit < 0 || index < firstDigit) {
      cells.push({ key: `p${index}`, char });
    } else if (char >= "0" && char <= "9") {
      cells.push({ key: `d${digits}`, char });
      digits += 1;
    } else {
      cells.push({ key: `g${groups}`, char });
      groups += 1;
    }
  }
  return cells;
}

/**
 * A keypad for money whose figure is the instrument. A pressed key sinks —
 * `scale` 0.94 and one pixel of `y` on `flick`, ζ0.99, because a press is an
 * acknowledgement and must be over before the finger is — and a digit typed on a
 * keyboard lights the matching key for the same beat.
 *
 * The figure is drawn one cell per character and a new cell arrives from
 * `distances.step` to its right on `snap`, so entry reads as digits sliding in
 * rather than a string being replaced. Cells are keyed by role, so only the
 * typed digit mounts. The decimal point locks the cents: a rule draws under the
 * last two columns, holds their width, and the digit keys report themselves
 * disabled once both are filled.
 *
 * The ceiling is real. A press that would carry the amount past `limit` is
 * refused rather than clamped: the figure jumps to -10px and `recoil` rings it
 * back — ζ0.53, the two bounces that make a shake read — and a danger line names
 * the ceiling. Under reduced motion nothing sinks, slides or shakes; the key
 * takes a fill, the digits appear, and the refusal still turns the figure and
 * raises its line, because entry progress is information.
 */
export function AmountPad({
  ref,
  value,
  defaultValue = 0,
  onValueChange,
  limit,
  onLimitReached,
  format = defaultFormat,
  label = "Amount",
  caption,
  className,
}: AmountPadProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [entry, setEntry] = React.useState<Entry>(() => seed(defaultValue));
  const committed = value ?? entry.from;
  // Re-seeded during render when the committed value moves underneath the
  // typed digits — the pad is honest about a host that owns the number.
  if (entry.from !== committed) setEntry(seed(committed));

  const [heldKey, setHeldKey] = React.useState<string | null>(null);
  const [flashKey, setFlashKey] = React.useState<string | null>(null);
  const [refused, setRefused] = React.useState<number | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const keyRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const shakeX = useMotionValue(0);

  React.useEffect(() => {
    if (!flashKey) return;
    const timer = window.setTimeout(() => setFlashKey(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashKey]);

  React.useEffect(() => {
    if (refused === null) return;
    const timer = window.setTimeout(() => setRefused(null), REFUSAL_MS);
    return () => window.clearTimeout(timer);
  }, [refused]);

  const centsFull = entry.point && entry.cents.length >= 2;
  const nothingTyped = entry.whole === "" && !entry.point;

  const inactiveFor = (key: Key) =>
    key.kind === "digit"
      ? centsFull
      : key.kind === "point"
        ? entry.point
        : nothingTyped;

  const commit = (next: Entry) => {
    const amount = amountOf(next.whole, next.cents);
    if (limit !== undefined && amount > limit) {
      // Refused, not clamped: the readout must never show a figure the payer
      // cannot actually send.
      setRefused(amount);
      if (motionSafe) {
        shakeX.set(SHAKE_FROM);
        animate(shakeX, 0, springs.recoil);
      }
      onLimitReached?.(amount);
      return;
    }
    setRefused(null);
    setEntry({ ...next, from: amount });
    // Placing the point moves no money, so it raises no change event.
    if (amount !== amountOf(entry.whole, entry.cents)) onValueChange?.(amount);
  };

  const press = (key: Key) => {
    if (inactiveFor(key)) return;
    if (key.kind === "point") {
      commit({ ...entry, point: true });
      return;
    }
    if (key.kind === "back") {
      if (entry.cents.length > 0) {
        commit({ ...entry, cents: entry.cents.slice(0, -1) });
      } else if (entry.point) {
        commit({ ...entry, point: false });
      } else {
        commit({ ...entry, whole: entry.whole.slice(0, -1) });
      }
      return;
    }
    if (entry.point) {
      commit({ ...entry, cents: entry.cents + key.glyph });
      return;
    }
    if (entry.whole.length >= MAX_WHOLE) return;
    const whole =
      entry.whole === "" || entry.whole === "0"
        ? key.glyph
        : entry.whole + key.glyph;
    commit({ ...entry, whole });
  };

  const moveFocus = (target: number) => {
    const clamped = Math.min(KEYS.length - 1, Math.max(0, target));
    setFocusIndex(clamped);
    keyRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (key === "Enter" || key === " ") {
      // Enter and Space still click the focused key; this only lends them the
      // same light the pointer and the typed digit get.
      setFlashKey(KEYS[focusIndex]?.id ?? null);
      return;
    }
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      const cell = KEYS.find(
        (item) => item.kind === "digit" && item.id === key,
      );
      if (cell) {
        setFlashKey(cell.id);
        press(cell);
      }
      return;
    }
    if (key === "." || key === ",") {
      event.preventDefault();
      const cell = KEYS.find((item) => item.kind === "point");
      if (cell) {
        setFlashKey(cell.id);
        press(cell);
      }
      return;
    }
    if (key === "Backspace" || key === "Delete") {
      event.preventDefault();
      const cell = KEYS.find((item) => item.kind === "back");
      if (cell) {
        setFlashKey(cell.id);
        press(cell);
      }
      return;
    }
    const moves: Record<string, number> = {
      ArrowRight: focusIndex + 1,
      ArrowLeft: focusIndex - 1,
      ArrowDown: focusIndex + COLUMNS,
      ArrowUp: focusIndex - COLUMNS,
      Home: 0,
      End: KEYS.length - 1,
    };
    const target = moves[key];
    if (target !== undefined) {
      event.preventDefault();
      moveFocus(target);
    }
  };

  const amount = amountOf(entry.whole, entry.cents);
  const fraction = entry.point ? entry.cents.length : 0;
  const printed = format(amount, fraction);

  // The decimal mark comes from the caller's own formatter rather than a
  // hard-coded dot, so a formatter that prints "1,20" still splits correctly.
  const mark = React.useMemo(() => {
    const none = format(1, 0);
    const one = format(1, 1);
    let index = 0;
    while (index < none.length && none[index] === one[index]) index += 1;
    return one[index] ?? ".";
  }, [format]);

  const markAt = entry.point ? printed.lastIndexOf(mark) : -1;
  const head = markAt >= 0 ? printed.slice(0, markAt) : printed;
  const tail = markAt >= 0 ? printed.slice(markAt + mark.length) : "";
  const cellIn = motionSafe
    ? springs.snap
    : { duration: durations.fast, ease: easings.enter };

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      onKeyDown={handleKeyDown}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <span id={labelId} className="text-xs font-medium text-ink-2">
        {label}
      </span>

      <div className="flex flex-col gap-2">
        {/* Only the figure shakes: the line beneath it is the explanation, and
            an explanation that jumps about is harder to read, not clearer. */}
        <motion.div style={{ x: shakeX }} className="flex">
          <output
            className={cn(
              "flex items-baseline font-mono text-3xl leading-none font-semibold tabular-nums transition-colors",
              refused !== null ? "text-danger" : "text-foreground",
            )}
          >
            <span className="sr-only">{format(amount, 2)}</span>
            <span aria-hidden className="flex items-baseline">
              <AnimatePresence initial={false} mode="popLayout">
                {headCells(head).map((cell) => (
                  <motion.span
                    key={cell.key}
                    layout={motionSafe}
                    initial={
                      motionSafe
                        ? { opacity: 0, x: distances.step }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, x: 0 }}
                    exit={{
                      opacity: 0,
                      x: motionSafe ? distances.nudge : 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={cellIn}
                    className="inline-block"
                  >
                    {cell.char}
                  </motion.span>
                ))}
              </AnimatePresence>

              {/* The cents live in their own column pair so the rule that locks
                them has a width to draw under before either digit exists. */}
              {entry.point ? (
                <span className="relative inline-flex">
                  <span className="inline-block">{mark}</span>
                  <span className="relative inline-block w-[2ch] text-left">
                    <AnimatePresence initial={false} mode="popLayout">
                      {tail.split("").map((char, index) => (
                        <motion.span
                          key={`f${index}`}
                          initial={
                            motionSafe
                              ? { opacity: 0, x: distances.step }
                              : { opacity: 0 }
                          }
                          animate={{ opacity: 1, x: 0 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={cellIn}
                          className="inline-block"
                        >
                          {char}
                        </motion.span>
                      ))}
                    </AnimatePresence>
                    <motion.span
                      className={cn(
                        "absolute inset-x-0 -bottom-1 block h-[2px] origin-left rounded-full",
                        refused !== null ? "bg-danger" : "bg-cobalt-bright",
                      )}
                      initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
                      animate={motionSafe ? { scaleX: 1 } : { opacity: 1 }}
                      transition={cellIn}
                    />
                  </span>
                </span>
              ) : null}
            </span>
          </output>
        </motion.div>

        <p
          className={cn(
            "font-mono text-[10px] tracking-[0.08em] uppercase",
            refused !== null ? "text-danger" : "text-ink-3",
          )}
        >
          {refused !== null && limit !== undefined
            ? `Over the ${format(limit, 2)} limit`
            : (caption ??
              (limit !== undefined ? `Limit ${format(limit, 2)}` : null))}
        </p>
        {refused !== null && limit !== undefined ? (
          <p role="alert" className="sr-only">
            {`${format(refused, 2)} is over the ${format(limit, 2)} limit`}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key, index) => {
          const lit = heldKey === key.id || flashKey === key.id;
          const inactive = inactiveFor(key);
          return (
            <motion.button
              key={key.id}
              ref={(node) => {
                keyRefs.current[index] = node;
              }}
              type="button"
              tabIndex={index === focusIndex ? 0 : -1}
              // aria-disabled, not disabled: a disabled key would drop focus
              // mid-entry and take the whole keyboard path with it.
              aria-disabled={inactive || undefined}
              aria-label={KEY_NAMES[key.id]}
              onFocus={() => setFocusIndex(index)}
              onPointerDown={(event) => {
                if (event.button === 0 && !inactive) setHeldKey(key.id);
              }}
              onPointerUp={() => setHeldKey(null)}
              onPointerLeave={() => setHeldKey(null)}
              onPointerCancel={() => setHeldKey(null)}
              onClick={() => press(key)}
              animate={
                motionSafe && lit && !inactive
                  ? { scale: 0.94, y: 1 }
                  : { scale: 1, y: 0 }
              }
              transition={springs.flick}
              className={cn(
                "flex h-12 items-center justify-center rounded-2 border font-mono text-lg tabular-nums transition-colors outline-none select-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                inactive && "cursor-default opacity-40",
                lit && !inactive
                  ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                  : "border-hairline bg-surface-1 text-foreground",
                !inactive && !lit && "hover:bg-surface-2",
              )}
            >
              {key.kind === "back" ? (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="size-4 shrink-0"
                >
                  <path
                    d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7 6-7Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                  <path
                    d="m12 9.5 5 5m0-5-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                key.glyph
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
