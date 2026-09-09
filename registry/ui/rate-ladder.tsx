"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Rung = {
  /** The term in months. */
  months: number;
  /** The rate in percent per year. */
  rate: number;
};

export type RateLadderProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Term deposits, ascending by months. */
  rungs: Rung[];
  /** Controlled term in months. */
  value?: number;
  /** Initial term in months for uncontrolled usage. @default the middle rung */
  defaultValue?: number;
  /** Fires from the press or key that picked a rung. */
  onValueChange?: (months: number) => void;
  /** Principal; given it, the interest at maturity is shown. */
  amount?: number;
  /** The deposit date as `YYYY-MM-DD`; the timeline starts here. */
  start: string;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Formats the maturity date. */
  formatDate?: (date: Date) => string;
  /** Names the ladder; heading and radiogroup label. */
  label: string;
  className?: string;
};

/**
 * Explicit locales and UTC, not the visitor's: a server and a client in
 * different zones or locales would otherwise print different text for the
 * same deposit, and that is a hydration mismatch on the figures shown.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const defaultFormat = (value: number): string => MONEY.format(value);
const defaultFormatDate = (date: Date): string => DAY.format(date);

/** Start plus a term, in UTC; a day past the target month's end clamps to it. */
function maturityOf(start: string, months: number): Date {
  const [y = 2026, m = 1, d = 1] = start.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last)));
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits that roll to their new value on `snap`, on the beat the rung lifts.
 * Hidden from assistive technology: the status sentence carries the figures.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
        const key = value.length - index;
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
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.2em] items-center justify-center"
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
 * A ladder of term deposits: two stiles with a rung per term, the shortest at
 * the bottom and the longest at the top, so higher rungs pay more. Picking a
 * rung lifts it off the stiles on `snap` — two pixels up, a raised surface and
 * a cobalt edge, one crisp overshoot — while the rung it replaces settles back,
 * and on the same beat the headline rate rolls its digits and, given a
 * principal, the interest at maturity rolls beside it. Beneath the ladder a
 * timeline runs from the deposit date to the longest term: a marker and its
 * date flag slide on `glide` to the chosen maturity while the elapsed track
 * fills to it, and the flag is clamped inside the axis against measured widths
 * so it can never leave the card.
 *
 * The ladder is a radio group with a roving tabindex: Up and Right step to a
 * longer term, Down and Left to a shorter one, Home and End reach the ends,
 * and arrows select as they move. The readout is a status line reading the
 * same sentence as the chosen rung, so a pick is announced once. Under
 * reduced motion the rung changes colour and edge only, the digits swap in
 * place, and the marker jumps on a tween.
 */
export function RateLadder({
  ref,
  rungs,
  value,
  defaultValue,
  onValueChange,
  amount,
  start,
  format = defaultFormat,
  formatDate = defaultFormatDate,
  label,
  className,
}: RateLadderProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<number>(
    () =>
      defaultValue ?? rungs[Math.floor((rungs.length - 1) / 2)]?.months ?? 0,
  );
  const current = value ?? uncontrolled;
  const index = Math.max(
    0,
    rungs.findIndex((rung) => rung.months === current),
  );
  const chosen = rungs[index];
  const longest = rungs[rungs.length - 1]?.months ?? 1;

  const months = chosen?.months ?? 0;
  const rate = chosen?.rate ?? 0;
  const maturity = maturityOf(start, months);
  const interest =
    amount !== undefined ? (amount * (rate / 100) * months) / 12 : null;
  const fraction = longest > 0 ? Math.min(1, months / longest) : 0;

  const sentenceFor = (rung: Rung) =>
    `${rung.months} months, ${rung.rate.toFixed(2)} percent, matures ${formatDate(
      maturityOf(start, rung.months),
    )}`;
  const sentence = chosen
    ? `${sentenceFor(chosen)}${interest !== null ? `, earns ${format(interest)}` : ""}`
    : "No terms";

  const select = (next: number) => {
    if (next === current) return;
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const focusAt = (at: number) => {
    const rung = rungs[Math.min(rungs.length - 1, Math.max(0, at))];
    if (!rung) return;
    document.getElementById(`${baseId}-rung-${rung.months}`)?.focus();
    select(rung.months);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(rungs.length - 1);
    }
  };

  // The flag's date label is clamped against real widths, never assumed: the
  // observer's own callback reports both, so no layout is read during render.
  const axisRef = React.useRef<HTMLDivElement | null>(null);
  const flagRef = React.useRef<HTMLDivElement | null>(null);
  const [widths, setWidths] = React.useState<{
    axis: number;
    flag: number;
  } | null>(null);
  React.useEffect(() => {
    const axis = axisRef.current;
    const flag = flagRef.current;
    if (!axis || !flag || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setWidths({ axis: axis.offsetWidth, flag: flag.offsetWidth }),
    );
    observer.observe(axis);
    observer.observe(flag);
    return () => observer.disconnect();
  }, []);
  const flagLeft = widths
    ? Math.min(
        Math.max(0, fraction * widths.axis - widths.flag / 2),
        Math.max(0, widths.axis - widths.flag),
      )
    : 0;

  const move = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="text-[11px] text-ink-3">
            {amount !== undefined
              ? `On ${format(amount)}, paid at maturity`
              : "Paid at maturity"}
          </span>
        </div>
        <div role="status" className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="sr-only">{sentence}</span>
          <span
            aria-hidden
            className="flex items-baseline font-mono text-2xl leading-none font-medium text-ink"
          >
            <RollingNumber value={rate.toFixed(2)} motionSafe={motionSafe} />
            <span className="text-base text-ink-2">%</span>
          </span>
          {interest !== null ? (
            <span
              aria-hidden
              className="flex items-baseline gap-1 font-mono text-[11px] text-ink-3"
            >
              <span>Earns</span>
              <RollingNumber value={format(interest)} motionSafe={motionSafe} />
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative px-2 py-1">
        {/* The stiles run behind the rungs and show only in the gaps, which is
            what makes the stack read as a ladder rather than a list. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-3 w-0.5 rounded-full bg-hairline-strong"
        />
        <span
          aria-hidden
          className="absolute inset-y-0 right-3 w-0.5 rounded-full bg-hairline-strong"
        />
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className="relative flex flex-col gap-2"
        >
          {[...rungs].reverse().map((rung) => {
            const checked = rung.months === months;
            return (
              <motion.button
                key={rung.months}
                type="button"
                role="radio"
                id={`${baseId}-rung-${rung.months}`}
                aria-checked={checked}
                aria-label={sentenceFor(rung)}
                tabIndex={checked ? 0 : -1}
                onClick={() => select(rung.months)}
                onKeyDown={handleKeyDown}
                initial={false}
                animate={{ y: checked && motionSafe ? -2 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className={cn(
                  "flex h-9 w-full items-center justify-between gap-3 rounded-2 border px-3 text-sm transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  checked
                    ? "border-cobalt-bright bg-surface-0 font-medium text-ink shadow-raised"
                    : "border-hairline bg-surface-2 text-ink-2 hover:bg-accent hover:text-ink",
                )}
              >
                <span className="tabular-nums">{rung.months} months</span>
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    checked ? "text-cobalt-bright" : "text-ink-3",
                  )}
                >
                  {rung.rate.toFixed(2)}%
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div
        aria-hidden
        className="flex flex-col gap-1 border-t border-hairline pt-3"
      >
        <div ref={axisRef} className="relative">
          <div className="relative h-5">
            <motion.div
              ref={flagRef}
              className="absolute top-0 left-0 flex h-5 items-center rounded-1 bg-primary px-1.5 font-mono text-[10px] font-medium whitespace-nowrap text-primary-foreground tabular-nums"
              initial={false}
              animate={{ x: flagLeft, opacity: widths ? 1 : 0 }}
              transition={move}
            >
              {formatDate(maturity)}
            </motion.div>
          </div>
          <div className="relative mt-1.5 h-1.5 rounded-full bg-hairline-strong">
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
              initial={false}
              animate={{ width: `${Number((fraction * 100).toFixed(3))}%` }}
              transition={move}
            />
            <motion.span
              className="absolute top-1/2 size-0"
              initial={false}
              animate={{ left: `${Number((fraction * 100).toFixed(3))}%` }}
              transition={move}
            >
              <span className="absolute -top-1.5 -left-1.5 block size-3 rounded-full border-2 border-surface-1 bg-cobalt-bright" />
            </motion.span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums">
          <span>{formatDate(maturityOf(start, 0))}</span>
          <span>{longest} months</span>
        </div>
      </div>
    </div>
  );
}
