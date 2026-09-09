"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PaydownStrategy = "smallest" | "rate";

export type PaydownDebt = {
  id: string;
  name: string;
  /** What is owed, in major units. */
  balance: number;
  /** Annual interest rate as a percentage. */
  rate: number;
  /** The minimum monthly payment. */
  minimum: number;
};

export type PaydownDate = { year: number; month: number };

export type PaydownProjection = {
  /** Months until the last debt clears. */
  months: number;
  /** Interest paid across the plan. */
  interest: number;
  /** The month of the final payment. */
  payoff: PaydownDate;
  /** The month each debt clears, by id. */
  clears: Record<string, PaydownDate>;
};

export type PaydownPlanProps = {
  ref?: React.Ref<HTMLDivElement>;
  debts: PaydownDebt[];
  /** Controlled order: smallest balance first, or highest rate first. */
  strategy?: PaydownStrategy;
  /** Initial order for uncontrolled usage. @default "smallest" */
  defaultStrategy?: PaydownStrategy;
  /** Fires from the press that changed the order. */
  onStrategyChange?: (strategy: PaydownStrategy) => void;
  /** Controlled extra monthly payment on top of the minimums. */
  extra?: number;
  /** Initial extra payment for uncontrolled usage. @default 0 */
  defaultExtra?: number;
  /** Fires from the range input's change event. */
  onExtraChange?: (extra: number) => void;
  /** Top of the extra-payment range. @default 500 */
  maxExtra?: number;
  /** Range step. @default 25 */
  step?: number;
  /** The first payment's month (1–12). Explicit, so the render never reads the clock. */
  start: PaydownDate;
  /** Fires from the effect that observed a changed plan. */
  onProjectionChange?: (projection: PaydownProjection) => void;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the plan for assistive technology. */
  label: string;
  className?: string;
};

/**
 * An explicit locale: a server and a client formatting in different locales
 * print different strings for the same figure — a hydration mismatch.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** A plan that never clears stops here rather than looping forever. */
const MAX_MONTHS = 600;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const STRATEGIES: { value: PaydownStrategy; label: string }[] = [
  { value: "smallest", label: "Smallest first" },
  { value: "rate", label: "Highest rate first" },
];

const addMonths = (start: PaydownDate, months: number): PaydownDate => {
  const index = start.month - 1 + months;
  return { year: start.year + Math.floor(index / 12), month: (index % 12) + 1 };
};

const dateLabel = (date: PaydownDate) =>
  `${MONTHS[date.month - 1] ?? ""} ${date.year}`;

export const orderDebts = (
  debts: PaydownDebt[],
  strategy: PaydownStrategy,
): PaydownDebt[] =>
  debts
    .map((debt, index) => ({ debt, index }))
    .sort((a, b) =>
      strategy === "smallest"
        ? a.debt.balance - b.debt.balance || a.index - b.index
        : b.debt.rate - a.debt.rate || a.index - b.index,
    )
    .map((entry) => entry.debt);

/**
 * Month by month: interest accrues, every debt gets its minimum, and the extra
 * — plus any minimum freed by a cleared debt — goes to the first debt still
 * open in the chosen order. That roll-over is the whole argument for an order.
 */
export function projectPaydown(
  debts: PaydownDebt[],
  strategy: PaydownStrategy,
  extra: number,
  start: PaydownDate,
): PaydownProjection {
  const order = orderDebts(debts, strategy);
  const owed = new Map(
    order.map((debt) => [debt.id, Math.max(0, debt.balance)]),
  );
  const clears: Record<string, PaydownDate> = {};
  let interest = 0;
  let months = 0;

  while (months < MAX_MONTHS && [...owed.values()].some((v) => v > 0.005)) {
    let budget = Math.max(0, extra);
    for (const debt of order) {
      const balance = owed.get(debt.id) ?? 0;
      if (balance <= 0.005) {
        budget += debt.minimum;
        continue;
      }
      const accrued = (balance * debt.rate) / 100 / 12;
      interest += accrued;
      const after = balance + accrued;
      const paid = Math.min(after, debt.minimum);
      owed.set(debt.id, after - paid);
    }
    for (const debt of order) {
      if (budget <= 0) break;
      const balance = owed.get(debt.id) ?? 0;
      if (balance <= 0.005) continue;
      const paid = Math.min(balance, budget);
      owed.set(debt.id, balance - paid);
      budget -= paid;
    }
    months += 1;
    for (const debt of order) {
      if ((owed.get(debt.id) ?? 0) <= 0.005 && !clears[debt.id]) {
        clears[debt.id] = addMonths(start, months - 1);
      }
    }
  }

  return {
    months,
    interest,
    payoff: addMonths(start, Math.max(0, months - 1)),
    clears,
  };
}

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Digits that roll to their new value on `snap`; each column is a ten-face
 * strip moved by a percentage of its own height, keyed from the right. Hidden
 * from assistive technology — the status line carries the figure as words.
 */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = text.split("");
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
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
 * A word that fades to its replacement; the old one leaves at once. The
 * presence wrapper skips the first mount, so a server-rendered numeral is
 * never painted invisible while it waits to hydrate.
 */
function Swap({ text, className }: { text: string; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      <motion.span
        key={text}
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: durations.fast, ease: easings.enter }}
      >
        {text}
      </motion.span>
    </AnimatePresence>
  );
}

/**
 * Which debt first. A two-stop control picks the order — smallest balance or
 * highest rate — and the rows reorder with a FLIP `layout` move on `glide`,
 * each debt travelling to its new rank while the rank numerals stay put and
 * cross-fade. A range input sets the extra paid each month; the plan is
 * re-projected and the debt-free date rolls its year on `snap` while its month
 * fades over, the total interest rolling with it. Each row carries its own
 * clearing month, so the reason for the order is visible per debt.
 *
 * The order control is a radio group with a roving tabindex (arrows move and
 * select, Home and End jump, Space selects); the extra is a native range. The
 * debts are an ordered list, so the rank is the reading order. Under reduced
 * motion the rows swap places without travelling and the figures swap in place
 * — the order still changes, because the order is the information.
 */
export function PaydownPlan({
  ref,
  debts,
  strategy,
  defaultStrategy = "smallest",
  onStrategyChange,
  extra,
  defaultExtra = 0,
  onExtraChange,
  maxExtra = 500,
  step = 25,
  start,
  onProjectionChange,
  format = defaultFormat,
  label,
  className,
}: PaydownPlanProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const orderId = `${baseId}-order`;
  const extraId = `${baseId}-extra`;
  const knobId = `${baseId}-knob`;

  const [uncontrolledStrategy, setUncontrolledStrategy] =
    React.useState(defaultStrategy);
  const currentStrategy = strategy ?? uncontrolledStrategy;

  const [uncontrolledExtra, setUncontrolledExtra] =
    React.useState(defaultExtra);
  const currentExtra = extra ?? uncontrolledExtra;

  const { year: startYear, month: startMonth } = start;
  const projection = React.useMemo(
    () =>
      projectPaydown(debts, currentStrategy, currentExtra, {
        year: startYear,
        month: startMonth,
      }),
    [debts, currentStrategy, currentExtra, startYear, startMonth],
  );

  const changeRef = useLatest(onProjectionChange);
  React.useEffect(() => {
    changeRef.current?.(projection);
  }, [projection, changeRef]);

  const setStrategy = (next: PaydownStrategy) => {
    if (next === currentStrategy) return;
    if (strategy === undefined) setUncontrolledStrategy(next);
    onStrategyChange?.(next);
  };

  const setExtra = (next: number) => {
    const clamped = Math.min(maxExtra, Math.max(0, next));
    if (clamped === currentExtra) return;
    if (extra === undefined) setUncontrolledExtra(clamped);
    onExtraChange?.(clamped);
  };

  const strategyIndex = Math.max(
    0,
    STRATEGIES.findIndex((option) => option.value === currentStrategy),
  );

  const focusStrategy = (index: number) => {
    const option =
      STRATEGIES[Math.min(STRATEGIES.length - 1, Math.max(0, index))];
    if (!option) return;
    document.getElementById(`${orderId}-${option.value}`)?.focus();
    setStrategy(option.value);
  };

  const handleStrategyKey = (event: React.KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: STRATEGIES.length - 1,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      focusStrategy(next);
    } else if (event.key === " ") {
      event.preventDefault();
      setStrategy(STRATEGIES[index]?.value ?? currentStrategy);
    }
  };

  const ordered = orderDebts(debts, currentStrategy);
  const payoffMonth = MONTHS[projection.payoff.month - 1] ?? "";
  const stuck = projection.months >= MAX_MONTHS;
  const summary = stuck
    ? "Never clears at these payments"
    : `Debt-free ${dateLabel(projection.payoff)}, ${projection.months} months, ${format(projection.interest)} interest`;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={labelId} className="text-sm font-semibold">
          {label}
        </span>
        <div
          role="radiogroup"
          aria-label="Order"
          className="inline-flex h-8 items-stretch rounded-full border border-hairline bg-surface-2 p-0.5"
        >
          {STRATEGIES.map((option, index) => {
            const checked = option.value === currentStrategy;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                id={`${orderId}-${option.value}`}
                aria-checked={checked}
                tabIndex={index === strategyIndex ? 0 : -1}
                onClick={() => setStrategy(option.value)}
                onKeyDown={(event) => handleStrategyKey(event, index)}
                className={cn(
                  "relative flex items-center justify-center rounded-full px-2.5 text-[11px] font-medium whitespace-nowrap transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  checked
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {checked ? (
                  <motion.span
                    aria-hidden
                    layoutId={motionSafe ? knobId : undefined}
                    transition={springs.snap}
                    className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                  />
                ) : null}
                <span className="relative">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={extraId} className="text-xs text-ink-2">
            Extra each month
          </label>
          <span className="font-mono text-xs font-medium text-ink tabular-nums">
            {format(currentExtra)}
          </span>
        </div>
        <input
          id={extraId}
          type="range"
          min={0}
          max={maxExtra}
          step={step}
          value={currentExtra}
          onChange={(event) => setExtra(Number(event.target.value))}
          className="h-4 w-full cursor-pointer accent-cobalt-bright outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      <ol aria-labelledby={labelId} className="flex flex-col gap-1">
        {ordered.map((debt, rank) => {
          const clear = projection.clears[debt.id];
          const clearLabel = clear ? dateLabel(clear) : "Never";
          return (
            <motion.li
              key={debt.id}
              layout={motionSafe ? "position" : false}
              transition={springs.glide}
              className="flex items-center gap-3 rounded-2 border border-hairline bg-surface-0 px-3 py-2"
            >
              <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-cobalt-wash font-mono text-[11px] font-medium text-cobalt-bright tabular-nums">
                <Swap text={String(rank + 1)} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {debt.name}
                </span>
                <span className="truncate font-mono text-[11px] text-ink-3 tabular-nums">
                  {debt.rate.toFixed(1)}% · min {format(debt.minimum)}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="font-mono text-sm text-ink tabular-nums">
                  {format(debt.balance)}
                </span>
                <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                  <Swap text={clearLabel} />
                </span>
              </span>
            </motion.li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-hairline pt-3">
        <span className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Debt-free
          </span>
          <span
            aria-hidden
            className="flex items-center gap-1.5 font-mono text-xl leading-none font-medium text-ink"
          >
            {stuck ? (
              <Swap text="Never" />
            ) : (
              <>
                <Swap text={payoffMonth} />
                <Rolling
                  text={String(projection.payoff.year)}
                  motionSafe={motionSafe}
                />
              </>
            )}
          </span>
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Interest
          </span>
          <span className="font-mono text-sm leading-none font-medium text-warn">
            <Rolling
              text={format(projection.interest)}
              motionSafe={motionSafe}
            />
          </span>
        </span>
      </div>

      <span role="status" className="sr-only">
        {summary}
      </span>
    </div>
  );
}
