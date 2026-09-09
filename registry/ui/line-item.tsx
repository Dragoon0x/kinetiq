"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LineItemProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The item. */
  name: string;
  /** A variant or detail under the name. */
  note?: string;
  /** Price per unit, in major units. */
  unitPrice: number;
  /** Controlled quantity. */
  quantity?: number;
  /** Initial quantity for uncontrolled usage. @default 1 */
  defaultQuantity?: number;
  /** Fires from the press or key that changed it. */
  onQuantityChange?: (quantity: number) => void;
  /** @default 1 */
  min?: number;
  /** @default 99 */
  max?: number;
  /** At the minimum, minus becomes remove. @default true */
  removable?: boolean;
  /** Fires when the collapse completes, so the host can drop the item without a jump. */
  onRemove?: () => void;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's, so server and client print the same
 * string for the same number and the line total never hydrates against itself.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const toCents = (value: number) => Math.round(value * 100) / 100;

const STEP_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-35";

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Digit columns that roll on `snap`. Each column is a ten-face strip moved by a
 * percentage of its own height, so one `y` step is exactly one face. Hidden
 * from assistive technology: the spinbutton and the sr-only total already
 * carry the numbers.
 */
function Digits({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains a digit and only the new column mounts.
        const key = text.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
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
 * One basket row. The stepper is a pill with minus, a rolling quantity and
 * plus: each press ticks the quantity and its digit rolls on `snap` while the
 * pressed button squashes on `flick`, and the line total rolls in the same beat
 * because the total moves only because the quantity did. At the minimum the
 * minus cross-fades into a bin; pressing it collapses the row — its measured
 * height tweens to zero on the exit ease with the content fading — and only
 * when the collapse completes does `onRemove` fire, so the host drops the item
 * without a jump.
 *
 * The quantity is a spinbutton: Up and Down step, Home and End jump to the
 * limits, and the buttons are named Decrease, Increase or Remove. The total is
 * read as one string beside the hidden digits, and a status line announces the
 * quantity with its total, or Removed. Under reduced motion the digits swap in
 * place, nothing squashes, and removal fades the row before it collapses.
 */
export function LineItem({
  ref,
  name,
  note,
  unitPrice,
  quantity,
  defaultQuantity = 1,
  onQuantityChange,
  min = 1,
  max = 99,
  removable = true,
  onRemove,
  format = defaultFormat,
  className,
}: LineItemProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const totalId = `${baseId}-total`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultQuantity);
  const isControlled = quantity !== undefined;
  const current = Math.min(
    max,
    Math.max(min, isControlled ? quantity : uncontrolled),
  );
  const total = toCents(unitPrice * current);

  // "fade" fades and collapses together; under reduced motion it only fades,
  // and "collapse" then closes the height in one tween.
  const [removal, setRemoval] = React.useState<"none" | "fade" | "collapse">(
    "none",
  );
  const removing = removal !== "none";
  const onRemoveRef = useLatest(onRemove);

  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = React.useState(0);

  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    // setState lives in the observer callback, never in the effect body. The
    // border box, not the content rect: the row's padding is part of the
    // height the wrapper has to open to, or the next row eats its detail line.
    const observer = new ResizeObserver(() => {
      setContentHeight(node.offsetHeight);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const setQuantity = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped === current || removing) return;
    if (!isControlled) setUncontrolled(clamped);
    onQuantityChange?.(clamped);
  };

  const atMin = current <= min;
  const atMax = current >= max;
  const showRemove = removable && atMin;

  const decrease = () => {
    if (removing) return;
    if (showRemove) {
      setRemoval("fade");
      return;
    }
    setQuantity(current - 1);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        setQuantity(current + 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        setQuantity(current - 1);
        break;
      case "Home":
        event.preventDefault();
        setQuantity(min);
        break;
      case "End":
        event.preventDefault();
        setQuantity(max);
        break;
      default:
        break;
    }
  };

  const squash = motionSafe ? { scale: 0.86 } : undefined;
  const exit = { duration: durations.base, ease: easings.exit } as const;

  // Width is reserved for the largest figure the line can reach, so a rolling
  // column mounting never shifts the row.
  const quantityWidth = `${String(max).length + 1}ch`;
  const totalWidth = `${format(toCents(unitPrice * max)).length}ch`;

  return (
    <motion.div
      ref={ref}
      className={cn("overflow-hidden", className)}
      initial={false}
      animate={
        removal === "none"
          ? { height: contentHeight > 0 ? contentHeight : "auto", opacity: 1 }
          : removal === "fade" && !motionSafe
            ? { opacity: 0 }
            : { height: 0, opacity: 0 }
      }
      transition={
        removal === "none"
          ? motionSafe
            ? springs.glide
            : { duration: 0 }
          : removal === "fade" && !motionSafe
            ? { duration: durations.fast, ease: easings.exit }
            : exit
      }
      onAnimationComplete={() => {
        if (removal === "fade" && !motionSafe) {
          setRemoval("collapse");
        } else if (removal !== "none") {
          onRemoveRef.current?.();
        }
      }}
    >
      <div
        ref={contentRef}
        className="flex items-center gap-3 py-2"
        aria-hidden={removing || undefined}
      >
        <div className="min-w-0 flex-1">
          <p title={name} className="truncate text-sm font-medium">
            {name}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {note ? `${note} · ` : ""}
            <span className="font-mono tabular-nums">
              {format(unitPrice)}
            </span>{" "}
            each
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="inline-flex h-8 items-center rounded-full border border-hairline-strong bg-surface-2">
            <motion.button
              type="button"
              aria-label={showRemove ? `Remove ${name}` : "Decrease"}
              disabled={removing || (atMin && !removable)}
              onClick={decrease}
              whileTap={squash}
              transition={springs.flick}
              className={cn(STEP_BUTTON, showRemove && "hover:text-danger")}
            >
              {/* Both glyphs share one cell and cross-fade, so the button never
                  changes size when minus becomes the bin. */}
              <span className="grid size-4 shrink-0 place-items-center">
                <motion.svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="col-start-1 row-start-1 size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  initial={false}
                  animate={{ opacity: showRemove ? 0 : 1 }}
                  transition={{ duration: durations.fast }}
                >
                  <path d="M4 8h8" />
                </motion.svg>
                <motion.svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="col-start-1 row-start-1 size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ opacity: showRemove ? 1 : 0 }}
                  transition={{ duration: durations.fast }}
                >
                  <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
                  <path d="M6.75 7v4M9.25 7v4" />
                </motion.svg>
              </span>
            </motion.button>

            <span
              role="spinbutton"
              tabIndex={removing ? -1 : 0}
              aria-label={`${name} quantity`}
              aria-valuenow={current}
              aria-valuemin={min}
              aria-valuemax={max}
              onKeyDown={handleKeyDown}
              style={{ minWidth: quantityWidth }}
              className={cn(
                "flex h-8 items-center justify-center rounded-full font-mono text-sm font-medium tabular-nums outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
              )}
            >
              <Digits text={String(current)} motionSafe={motionSafe} />
            </span>

            <motion.button
              type="button"
              aria-label="Increase"
              disabled={removing || atMax}
              onClick={() => setQuantity(current + 1)}
              whileTap={squash}
              transition={springs.flick}
              className={STEP_BUTTON}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                className="size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              >
                <path d="M8 4v8M4 8h8" />
              </svg>
            </motion.button>
          </div>

          <span
            id={totalId}
            className="flex items-center justify-end font-mono text-sm font-semibold"
            style={{ minWidth: totalWidth }}
          >
            <span className="sr-only">{format(total)}</span>
            <Digits text={format(total)} motionSafe={motionSafe} />
          </span>
        </div>
      </div>

      <span role="status" className="sr-only">
        {removing ? "Removed" : `Quantity ${current}, ${format(total)}`}
      </span>
    </motion.div>
  );
}
