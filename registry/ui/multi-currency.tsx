"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CurrencyBalance = {
  /** Short code shown in the lane's chip. */
  code: string;
  /** Full name of the currency. */
  name: string;
  /** Balance held in that currency's own units. */
  amount: number;
};

export type MultiCurrencyProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** One lane per currency, in their resting order. */
  balances: CurrencyBalance[];
  /** Units of `display` per one unit of each code. A new table pulses the strip. */
  rates: Record<string, number>;
  /** The code every lane converts into. */
  display: string;
  /** Controlled selected code — the lane on top. */
  value?: string;
  /** Initial selected code for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (code: string) => void;
  /** Renders every balance; money never bypasses it. */
  format?: (amount: number, code: string) => string;
  /** Renders the rate in the readout. */
  formatRate?: (rate: number) => string;
  /** Names the wallet; labels the stack. */
  label: string;
  className?: string;
};

/** Pinned so the server and the client format identically. */
const grouped = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const rateFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const defaultFormat = (amount: number, code: string) =>
  `${grouped.format(amount)} ${code}`;
const defaultFormatRate = (rate: number) => rateFormat.format(rate);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits roll to their new value on `snap` — one crisp overshoot, the same
 * physics as any other indicator changing position. The column is ten faces
 * tall, so a `y` of one tenth of its own height moves exactly one digit, and
 * each column is `1ch` of a tabular face wide, so a roll never shifts layout.
 */
function RollingFigure({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit and only the new column mounts.
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
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.15em] items-center justify-center"
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
 * Every currency in its own lane, never merged into one blurred total. Choosing
 * a lane sends it to the top and the rest close the gap beneath it — a `layout`
 * reorder on `glide`, so each lane travels to its new place instead of the list
 * redrawing. The chosen lane opens a conversion strip on an animated height:
 * the rate reads as a sentence and the converted total rolls its digits on
 * `snap` underneath it.
 *
 * A new rate table pulses the strip — a cobalt wash keyed to the rate, fading
 * out on the exit ease — so a refresh is felt without anything jumping, and the
 * converted figure rolls to what it is now worth. The stack is one Tab stop:
 * Up and Down walk the lanes in the order they are drawn, Home and End jump to
 * the ends, and Enter or Space brings the focused lane to the top, so the
 * keyboard drives the same reorder the pointer does. Under reduced motion the
 * lanes swap position without travel and the digits set in place, because the
 * order and the total are the information.
 */
export function MultiCurrency({
  ref,
  balances,
  rates,
  display,
  value,
  defaultValue,
  onValueChange,
  format = defaultFormat,
  formatRate = defaultFormatRate,
  label,
  className,
}: MultiCurrencyProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(
    defaultValue ?? balances[0]?.code ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  const [focusIndex, setFocusIndex] = React.useState(0);
  const laneRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const chosen = balances.find((item) => item.code === current);
  const ordered = chosen
    ? [chosen, ...balances.filter((item) => item.code !== current)]
    : balances;

  const total = balances.reduce(
    (sum, item) => sum + item.amount * (rates[item.code] ?? 0),
    0,
  );

  const select = (code: string) => {
    // The chosen lane is always drawn first, so focus follows it to the top.
    setFocusIndex(0);
    if (code === current) return;
    if (!isControlled) setUncontrolled(code);
    onValueChange?.(code);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(ordered.length - 1, Math.max(0, index));
    setFocusIndex(clamped);
    laneRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(ordered.length - 1);
    }
  };

  const laneLayout = motionSafe ? ("position" as const) : false;
  const laneTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {format(total, display)}
        </span>
      </div>

      <div
        role="listbox"
        aria-labelledby={labelId}
        className="flex flex-col gap-1.5"
      >
        {ordered.map((item, index) => {
          const selected = item.code === current;
          const rate = rates[item.code] ?? 0;
          const converted = item.amount * rate;
          return (
            <motion.div
              key={item.code}
              // Presentational so the listbox owns the options directly, with
              // nothing semantic standing between them.
              role="presentation"
              layout={laneLayout}
              transition={laneTransition}
              className={cn(
                "overflow-hidden rounded-3 border transition-colors",
                selected
                  ? "border-primary bg-surface-2"
                  : "border-hairline bg-surface-1",
              )}
            >
              <button
                type="button"
                role="option"
                aria-selected={selected}
                ref={(node) => {
                  laneRefs.current[index] = node;
                }}
                tabIndex={
                  index === Math.min(focusIndex, ordered.length - 1) ? 0 : -1
                }
                onClick={() => select(item.code)}
                onFocus={() => setFocusIndex(index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 shrink-0 items-center rounded-1 px-1.5 font-mono text-[11px] font-medium transition-colors",
                    selected
                      ? "bg-cobalt-wash text-cobalt-bright"
                      : "bg-surface-2 text-ink-2",
                  )}
                >
                  {item.code}
                </span>
                <span
                  title={item.name}
                  className="min-w-0 flex-1 truncate text-sm"
                >
                  {item.name}
                </span>
                <span className="shrink-0 font-mono text-xs text-ink-2 tabular-nums">
                  {format(item.amount, item.code)}
                </span>
              </button>

              {/* The strip's height is animated from its own content rather
                  than reserved, so a closed lane costs exactly one row. */}
              <AnimatePresence initial={false}>
                {selected ? (
                  <motion.div
                    key="strip"
                    className="overflow-hidden"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0, transition: exitFor() }}
                    transition={laneTransition}
                  >
                    <div className="relative flex items-end justify-between gap-3 border-t border-hairline px-3 py-2.5">
                      {/* Keyed by the rate: a new table remounts the wash, so
                          the refresh is felt without anything moving. */}
                      <AnimatePresence initial={false}>
                        <motion.span
                          key={`${item.code}:${rate}`}
                          aria-hidden
                          className="pointer-events-none absolute inset-0 bg-cobalt-wash"
                          initial={{ opacity: 0.9 }}
                          animate={{ opacity: 0 }}
                          exit={{ opacity: 0, transition: { duration: 0 } }}
                          transition={{
                            duration: durations.slow,
                            ease: easings.exit,
                          }}
                        />
                      </AnimatePresence>

                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                          Rate
                        </span>
                        <span className="truncate font-mono text-xs text-ink-2 tabular-nums">
                          1 {item.code} = {formatRate(rate)} {display}
                        </span>
                      </span>

                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                          In {display}
                        </span>
                        <span className="font-mono text-sm font-medium text-foreground">
                          <RollingFigure
                            text={format(converted, display)}
                            motionSafe={motionSafe}
                          />
                        </span>
                      </span>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* One settled sentence per change — never one per digit. */}
      <span role="status" className="sr-only">
        {chosen
          ? `${chosen.name} on top. ${format(chosen.amount, chosen.code)} is ${format(
              chosen.amount * (rates[chosen.code] ?? 0),
              display,
            )} at ${formatRate(rates[chosen.code] ?? 0)}.`
          : "No lane selected."}
      </span>
    </div>
  );
}
