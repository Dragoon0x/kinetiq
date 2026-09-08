"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TaxMode = "inclusive" | "exclusive";

export type TaxSplitProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The entered amount in major units. */
  amount: number;
  /** Tax rate as a fraction: 0.2 is twenty percent. */
  rate: number;
  /** Controlled mode. */
  mode?: TaxMode;
  /** Initial mode for uncontrolled usage. @default "exclusive" */
  defaultMode?: TaxMode;
  /** Fires from the press or key that switched the mode. */
  onModeChange?: (mode: TaxMode) => void;
  /** Formats every figure. */
  format?: (value: number) => string;
  /** Names the control. @default "Tax" */
  label?: string;
  /** @default "Net" */
  netLabel?: string;
  /** @default "Tax" */
  taxLabel?: string;
  /** @default "Total" */
  totalLabel?: string;
  className?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const MODES: { value: TaxMode; label: string }[] = [
  { value: "inclusive", label: "Inclusive" },
  { value: "exclusive", label: "Exclusive" },
];

const DIGITS = "0123456789";

/**
 * Splits an amount in whole cents so net + tax is always exactly the total.
 * Exclusive treats the amount as the net and adds tax; inclusive treats it as
 * the total and carves the tax out.
 */
export function splitTax(
  amount: number,
  rate: number,
  mode: TaxMode,
): { net: number; tax: number; total: number } {
  const cents = Math.round(amount * 100);
  if (mode === "inclusive") {
    const net = Math.round(cents / (1 + rate));
    return { net: net / 100, tax: (cents - net) / 100, total: cents / 100 };
  }
  const tax = Math.round(cents * rate);
  return { net: cents / 100, tax: tax / 100, total: (cents + tax) / 100 };
}

/**
 * A figure whose digit columns roll on `glide` — a quantity settling — with a
 * right-first cascade so the small wheels stop first. Columns are keyed from
 * the right and each is exactly `1ch` wide, so a change never shifts layout.
 * Hidden from assistive technology: the printed value sits beside it.
 */
function RollingAmount({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  const chars = text.split("");
  const stagger = cascade(chars.length);
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = DIGITS.indexOf(char);
        const key = chars.length - index;
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
              transition={
                motionSafe
                  ? {
                      ...springs.glide,
                      delay: (chars.length - 1 - index) * stagger,
                    }
                  : { duration: 0 }
              }
            >
              {DIGITS.split("").map((face) => (
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
 * One stacked bar answers whether the tax is inside the amount or on top of
 * it. A fixed marker on the track stands for the amount you entered: in
 * exclusive mode the net runs up to it and the tax continues past it, so the
 * bar overshoots what you typed; inclusive slides the bar's end back to the
 * marker and the tax inside, taking its share from the net. Both segments
 * travel on `glide` — a quantity settling, no overshoot — and the figures
 * beneath roll their digits on `glide` without ever shifting layout. The mode
 * switch is a two-stop radio group whose knob rides a shared `layoutId` on
 * `snap`.
 *
 * Arithmetic is done in cents so net plus tax always equals the total. The bar
 * is an image with a spoken sentence; the switch is a real radio group where
 * Left and Right step, Home and End jump, Space selects; a status line reports
 * each switch. Under reduced motion the widths tween and the digits swap.
 */
export function TaxSplit({
  ref,
  amount,
  rate,
  mode,
  defaultMode = "exclusive",
  onModeChange,
  format = defaultFormat,
  label = "Tax",
  netLabel = "Net",
  taxLabel = "Tax",
  totalLabel = "Total",
  className,
}: TaxSplitProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const knobId = `${baseId}-knob`;

  const [ownMode, setOwnMode] = React.useState<TaxMode>(defaultMode);
  const current = mode ?? ownMode;
  const currentIndex = Math.max(
    0,
    MODES.findIndex((option) => option.value === current),
  );

  const select = (next: TaxMode) => {
    if (next === current) return;
    if (mode === undefined) setOwnMode(next);
    onModeChange?.(next);
  };

  const focusAt = (index: number) => {
    const option = MODES[Math.min(MODES.length - 1, Math.max(0, index))];
    if (!option) return;
    document.getElementById(`${baseId}-${option.value}`)?.focus();
    select(option.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(MODES.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      select(MODES[index]?.value ?? current);
    }
  };

  const { net, tax, total } = splitTax(amount, rate, current);

  // The track spans the exclusive total — the widest the bar can be — so the
  // amount marker holds still while the segments re-proportion around it.
  const span = Math.max(1, splitTax(amount, rate, "exclusive").total);
  const netWidth = (net / span) * 100;
  const taxWidth = (tax / span) * 100;
  const marker = (Math.max(0, amount) / span) * 100;

  const percent = `${Math.round(rate * 1000) / 10}%`;
  const sentence = `${netLabel} ${format(net)}, ${taxLabel} ${format(tax)}, ${totalLabel} ${format(total)}`;

  const segment = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  const figures = [
    { term: netLabel, value: net, dot: "bg-cobalt-bright" },
    { term: taxLabel, value: tax, dot: "bg-ink-2" },
    { term: totalLabel, value: total, dot: null },
  ];

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-4 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      {/* The mode switch wraps under the label in a narrow card rather than
          squeezing the plan's name down to its first three letters. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="flex min-w-0 flex-auto basis-32 items-center gap-2">
          <span
            id={labelId}
            className="truncate text-sm font-medium text-foreground"
          >
            {label}
          </span>
          <span className="shrink-0 rounded-full border border-hairline bg-surface-2 px-1.5 font-mono text-[10px] text-ink-3 tabular-nums">
            {percent}
          </span>
        </span>

        <div
          role="radiogroup"
          aria-label={`${label} mode`}
          className="inline-flex h-8 shrink-0 items-stretch rounded-full border border-hairline bg-surface-2 p-0.5"
        >
          {MODES.map((option, index) => {
            const checked = option.value === current;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                id={`${baseId}-${option.value}`}
                tabIndex={index === currentIndex ? 0 : -1}
                onClick={() => select(option.value)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "relative flex items-center justify-center rounded-full px-2.5 text-xs font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  checked
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {checked &&
                  (motionSafe ? (
                    <motion.span
                      aria-hidden
                      layoutId={knobId}
                      transition={springs.snap}
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                    />
                  ))}
                <span className="relative">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="img"
        aria-label={`${label}: ${sentence}`}
        className="relative pb-5"
      >
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-hairline">
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-l-full bg-cobalt-bright"
            initial={false}
            animate={{ width: `${netWidth}%` }}
            transition={segment}
          />
          <motion.span
            aria-hidden
            className="absolute inset-y-0 bg-ink-2"
            initial={false}
            animate={{ left: `${netWidth}%`, width: `${taxWidth}%` }}
            transition={segment}
          />
        </div>

        {/* The marker is the amount you typed. It never moves; the bar does. */}
        <span
          aria-hidden
          className="absolute top-0 -mt-1 h-5 w-0.5 -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${marker}%` }}
        />
        <span
          aria-hidden
          className="absolute top-full -mt-4 -translate-x-full pr-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          style={{ left: `${marker}%` }}
        >
          Amount
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {figures.map((figure) => (
          <div key={figure.term} className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {figure.dot ? (
                <span
                  aria-hidden
                  className={cn("size-1.5 shrink-0 rounded-full", figure.dot)}
                />
              ) : null}
              <span className="truncate">{figure.term}</span>
            </dt>
            <dd
              className={cn(
                "font-mono text-sm tabular-nums",
                figure.dot ? "text-ink-2" : "font-medium text-ink",
              )}
            >
              <RollingAmount
                text={format(figure.value)}
                motionSafe={motionSafe}
              />
              <span className="sr-only">{format(figure.value)}</span>
            </dd>
          </div>
        ))}
      </dl>

      <span role="status" className="sr-only">
        {`${label} ${current}: ${sentence}`}
      </span>
    </div>
  );
}
