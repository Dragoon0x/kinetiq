"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ChoiceCardsBilling = "monthly" | "yearly";

export type ChoiceCardOption = {
  value: string;
  title: string;
  price: { monthly: number; yearly: number };
  blurb: string;
  badge?: string;
};

export type ChoiceCardsProps = {
  /** The plans, in the order they are offered. */
  options: ChoiceCardOption[];
  /** Controlled chosen plan; `defaultValue` seeds the uncontrolled one. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Controlled billing period. @default "monthly" */
  billing?: ChoiceCardsBilling;
  defaultBilling?: ChoiceCardsBilling;
  onBillingChange?: (billing: ChoiceCardsBilling) => void;
  /** Prefix for every price. @default "$" */
  currency?: string;
  /** Visible group label, shown beside the billing toggle. @default "Plan" */
  label?: string;
  className?: string;
};

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const BILLING: { value: ChoiceCardsBilling; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/**
 * The radiogroup key contract, shared by the cards and the billing rail: arrows
 * wrap, Home and End jump, Space re-picks. Null means the key belongs to the page.
 */
function rovingIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp")
    return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === " ") return index;
  return null;
}

/**
 * Each digit is a window over a 0–9 strip. Columns are keyed from the right so
 * 9 → 120 grows at the left edge rather than re-keying every column.
 */
function RollingPrice({
  amount,
  motionSafe,
}: {
  amount: number;
  motionSafe: boolean;
}) {
  const chars = Array.from(String(Math.round(amount)));
  const step = cascade(chars.length);

  return (
    <span aria-hidden className="inline-flex leading-none tabular-nums">
      {chars.map((char, index) => {
        const order = chars.length - index;
        return (
          <span
            key={`d${order}`}
            className="relative inline-block h-[1em] overflow-hidden"
          >
            <motion.span
              className="flex flex-col"
              initial={false}
              animate={{ y: `${-Number(char)}em` }}
              transition={
                motionSafe
                  ? { ...springs.glide, delay: (order - 1) * step }
                  : { duration: 0 }
              }
            >
              {DIGITS.map((digit) => (
                <span key={digit} className="block h-[1em]">
                  {digit}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

function BillingRail({
  billing,
  onSelect,
  baseId,
  motionSafe,
}: {
  billing: ChoiceCardsBilling;
  onSelect: (next: ChoiceCardsBilling) => void;
  baseId: string;
  motionSafe: boolean;
}) {
  const activeIndex = Math.max(
    BILLING.findIndex((entry) => entry.value === billing),
    0,
  );

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = rovingIndex(event.key, index, BILLING.length);
    const entry = next === null ? undefined : BILLING[next];
    if (!entry) return;
    event.preventDefault();
    onSelect(entry.value);
    document.getElementById(`${baseId}-billing-${next}`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex h-8 items-stretch rounded-full border border-hairline bg-surface-2 p-0.5"
    >
      {BILLING.map((entry, index) => {
        const active = entry.value === billing;
        return (
          <button
            key={entry.value}
            type="button"
            role="radio"
            aria-checked={active}
            id={`${baseId}-billing-${index}`}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => onSelect(entry.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "relative flex items-center justify-center rounded-full px-3 text-xs font-medium transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {active && (
              // No layoutId under reduced motion: the knob swaps, never slides.
              <motion.span
                aria-hidden
                layoutId={motionSafe ? `${baseId}-billing-knob` : undefined}
                transition={springs.snap}
                className="absolute inset-0 rounded-full border border-hairline bg-surface-0"
              />
            )}
            <span className="relative">{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function PlanCard({
  option,
  billing,
  currency,
  selected,
  focusable,
  id,
  motionSafe,
  onSelect,
  onKeyDown,
}: {
  option: ChoiceCardOption;
  billing: ChoiceCardsBilling;
  currency: string;
  selected: boolean;
  focusable: boolean;
  id: string;
  motionSafe: boolean;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const amount = option.price[billing];

  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      id={id}
      tabIndex={focusable ? 0 : -1}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-price ${id}-blurb`}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      initial={false}
      // Only the chosen card leaves the surface; stepping back is tone, so CSS
      // owns the dim and the card needs no hover state of its own.
      animate={{ y: selected && motionSafe ? -2 : 0 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className={cn(
        "relative flex flex-col items-start gap-2 rounded-3 border p-3 text-left transition-[opacity,border-color] duration-150 outline-none",
        "focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? "border-hairline-strong bg-surface-2 opacity-100 shadow-raised"
          : "border-hairline bg-surface-1 opacity-85 hover:border-hairline-strong hover:opacity-100",
      )}
    >
      {/*
        No viewBox: one user unit is one CSS pixel, so rx stays a true 9px arc
        at any width where a percentage viewBox would shear the corners.
      */}
      <svg
        aria-hidden
        // An absolutely positioned SVG keeps its intrinsic 300x150 unless it is
        // given a size, so it is sized to the card explicitly.
        className="pointer-events-none absolute inset-px h-[calc(100%-2px)] w-[calc(100%-2px)] overflow-visible text-cobalt-bright"
      >
        <motion.rect
          width="100%"
          height="100%"
          rx={9}
          ry={9}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          pathLength={1}
          strokeDasharray="1 1"
          initial={false}
          animate={{ strokeDashoffset: selected ? 0 : 1 }}
          transition={
            selected && motionSafe
              ? springs.glide
              : { duration: motionSafe ? durations.fast : 0 }
          }
        />
      </svg>

      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-6">
        <span id={`${id}-title`} className="text-sm font-semibold text-ink">
          {option.title}
        </span>
        {option.badge && (
          <span className="rounded-full bg-cobalt-wash px-1.5 py-0.5 text-[10px] font-medium tracking-[0.08em] text-cobalt-bright uppercase">
            {option.badge}
          </span>
        )}
      </span>

      <span className="flex items-center gap-1 text-ink">
        <span className="text-sm text-ink-3">{currency}</span>
        <span className="text-xl font-semibold">
          <RollingPrice amount={amount} motionSafe={motionSafe} />
        </span>
        <span className="text-xs text-ink-3">
          /{billing === "monthly" ? "mo" : "yr"}
        </span>
        <span id={`${id}-price`} className="sr-only">
          {currency}
          {amount} per {billing === "monthly" ? "month" : "year"}
        </span>
      </span>

      <span id={`${id}-blurb`} className="text-xs leading-relaxed text-ink-2">
        {option.blurb}
      </span>

      <motion.span
        aria-hidden
        initial={false}
        animate={{ scale: selected ? 1 : 0, opacity: selected ? 1 : 0 }}
        transition={
          // The one place allowed to celebrate — and never on the way out.
          selected && motionSafe
            ? springs.recoil
            : {
                duration: durations.fast,
                ease: selected ? easings.enter : easings.exit,
              }
        }
        className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
          <path
            d="M4 8.4 6.8 11 12 5.4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </motion.span>
    </motion.button>
  );
}

/**
 * A plan picker that answers the click. The chosen card rises 2px on `glide`
 * while a ring draws around its perimeter, and a check stamps into the corner
 * on `recoil` — the one place in the widget allowed to celebrate. Unchosen
 * cards hold their plane and step back in tone. Switching the billing period
 * re-rolls every price digit by digit on `glide`, carrying from the ones
 * column outward. Arrow keys move between cards and Space selects; reduced
 * motion keeps the ring and the check and drops the lift.
 */
export function ChoiceCards({
  options,
  value,
  defaultValue,
  onValueChange,
  billing,
  defaultBilling = "monthly",
  onBillingChange,
  currency = "$",
  label = "Plan",
  className,
}: ChoiceCardsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    () => defaultValue ?? options[0]?.value ?? "",
  );
  const currentValue = value === undefined ? uncontrolledValue : value;

  const [uncontrolledBilling, setUncontrolledBilling] =
    React.useState<ChoiceCardsBilling>(defaultBilling);
  const currentBilling = billing === undefined ? uncontrolledBilling : billing;

  const selectedIndex = options.findIndex(
    (option) => option.value === currentValue,
  );

  const select = (next: string) => {
    if (value === undefined) setUncontrolledValue(next);
    if (next !== currentValue) onValueChange?.(next);
  };

  const selectBilling = (next: ChoiceCardsBilling) => {
    if (billing === undefined) setUncontrolledBilling(next);
    if (next !== currentBilling) onBillingChange?.(next);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = rovingIndex(event.key, index, options.length);
    const option = next === null ? undefined : options[next];
    if (!option) return;
    event.preventDefault();
    select(option.value);
    document.getElementById(`${baseId}-card-${next}`)?.focus();
  };

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span id={labelId} className="text-sm font-semibold text-ink">
          {label}
        </span>
        <BillingRail
          billing={currentBilling}
          onSelect={selectBilling}
          baseId={baseId}
          motionSafe={motionSafe}
        />
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        // One column on a phone; from sm up the cards flow across as equal
        // implicit columns, so any number of plans stays even without a
        // hard-coded track count.
        className="grid grid-cols-1 gap-3 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none"
      >
        {options.map((option, index) => (
          <PlanCard
            key={option.value}
            option={option}
            billing={currentBilling}
            currency={currency}
            selected={index === selectedIndex}
            focusable={index === Math.max(selectedIndex, 0)}
            id={`${baseId}-card-${index}`}
            motionSafe={motionSafe}
            onSelect={() => select(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          />
        ))}
      </div>
    </div>
  );
}
