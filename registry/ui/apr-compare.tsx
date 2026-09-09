"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AprOffer = {
  id: string;
  /** Who is lending; truncates with a title when the card is narrow. */
  lender: string;
  /** Annual rate in percent. */
  apr: number;
  /** Term in months. */
  term: number;
  /** A one-off fee added to the total. @default 0 */
  fee?: number;
};

export type AprCompareProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The two offers, left and right. */
  offers: [AprOffer, AprOffer];
  /** The principal both offers are costed against. */
  amount: number;
  /** Controlled picked offer id. */
  value?: string;
  /** Initial pick for uncontrolled usage; nothing picked when omitted. */
  defaultValue?: string;
  /** Fires from the click or key that picked an offer. */
  onValueChange?: (id: string) => void;
  /** Formats every amount the cards print. */
  format?: (value: number) => string;
  /** Names the group; printed above the cards. @default "Offers" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another produce different text for the same number, which is a
 * hydration mismatch on the figure the reader came for.
 */
const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

/** A share as a CSS percentage, rounded so the server and the browser hand
 *  motion the same string. */
const pct = (share: number) => `${Number((share * 100).toFixed(3))}%`;

const DIGITS = "0123456789";

/** Standard amortised payment; a zero rate is a plain division. */
const monthlyPayment = (
  principal: number,
  apr: number,
  months: number,
): number => {
  const n = Math.max(1, months);
  const r = apr / 1200;
  if (r <= 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
};

/**
 * A figure whose digit columns are ten-face strips translated by a percentage
 * of their own height, so a single `y` moves exactly one face and the cascade
 * runs from the units column leftwards the way an odometer's small wheels stop
 * first. Hidden from assistive technology: each card's label already carries
 * the figure, and no reader should wade through ten faces a column.
 */
function RollingFigure({
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
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit and only the new column mounts.
        const key = chars.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        const fromRight = chars.length - 1 - index;
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
                  ? { ...springs.snap, delay: fromRight * stagger }
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
 * The total counts to its new value on `glide` through a motion value, so the
 * roll runs outside React and re-renders nothing.
 */
function RolledMoney({
  value,
  format,
  motionSafe,
  className,
}: {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
}) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(latest));

  React.useEffect(() => {
    if (!motionSafe) {
      progress.set(value);
      return;
    }
    const controls = animate(progress, value, springs.glide);
    return () => controls.stop();
  }, [motionSafe, progress, value]);

  return (
    <motion.span
      aria-hidden
      className={cn("font-mono tabular-nums", className)}
    >
      {text}
    </motion.span>
  );
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * Two offers, side by side. Each card reads its lender, its APR, the monthly
 * payment it implies for the amount being borrowed, and a cost bar. The APR and
 * monthly figures are odometer columns that roll to a new value on `snap` when
 * the amount or the quotes change; each cost bar is principal in cobalt plus
 * interest in warn, both scaled against the dearer offer's total so the two
 * bars are honestly comparable, settling on `glide`; the total counts on the
 * same spring, and the cheaper card says "Lower cost" in words. Picking an
 * offer lifts it — a `nudge` of travel on `snap` with a raised shadow and a
 * cobalt border — and dims the other by opacity, so the choice reads as one
 * card coming forward rather than the other disappearing.
 *
 * The row is a radio group: each card is a `role="radio"` button with a roving
 * tabindex where the arrows move the pick without wrapping, Home and End jump,
 * and Space or Enter picks. Under reduced motion the digits swap in place, the
 * bars set on a short tween, and the pick changes the border and dims the other
 * card with no lift.
 */
export function AprCompare({
  ref,
  offers,
  amount,
  value,
  defaultValue,
  onValueChange,
  format = defaultFormat,
  label = "Offers",
  className,
}: AprCompareProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string | undefined>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  const select = (id: string) => {
    if (id === current) return;
    if (!isControlled) setUncontrolled(id);
    onValueChange?.(id);
  };

  const principal = Math.max(0, amount);
  const costed = offers.map((offer) => {
    const payment = monthlyPayment(principal, offer.apr, offer.term);
    const interest = Math.max(0, payment * offer.term - principal);
    const fee = Math.max(0, offer.fee ?? 0);
    return { offer, payment, interest, fee, total: principal + interest + fee };
  });
  const scale = Math.max(1, ...costed.map((item) => item.total));
  const cheapest =
    costed[0]!.total === costed[1]!.total
      ? null
      : costed[0]!.total < costed[1]!.total
        ? costed[0]!.offer.id
        : costed[1]!.offer.id;

  const pickedIndex = costed.findIndex((item) => item.offer.id === current);
  const anchor = pickedIndex >= 0 ? pickedIndex : 0;

  const focusAt = (index: number) => {
    const target = costed[clamp(index, 0, costed.length - 1)];
    if (!target) return;
    document.getElementById(`${baseId}-offer-${target.offer.id}`)?.focus();
    select(target.offer.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(costed.length - 1);
        break;
      default:
        break;
    }
  };

  const picked = pickedIndex >= 0 ? costed[pickedIndex] : null;
  const other = pickedIndex >= 0 ? costed[1 - pickedIndex] : null;
  const difference = picked && other ? other.total - picked.total : 0;
  const spoken = picked
    ? `${picked.offer.lender} picked: ${format(picked.payment)} a month, ${format(picked.total)} in total, ${
        difference === 0
          ? "the same cost as"
          : difference > 0
            ? `${format(difference)} less than`
            : `${format(-difference)} more than`
      } ${other?.offer.lender}`
    : "";

  const fade = { duration: durations.base, ease: easings.enter } as const;
  const sizing = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      className={cn("@container flex w-full flex-col gap-3", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          Borrowing {format(principal)}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid grid-cols-1 gap-3 @[20rem]:grid-cols-2"
      >
        {costed.map(({ offer, payment, interest, fee, total }, index) => {
          const isPicked = offer.id === current;
          const dimmed = current !== undefined && !isPicked;
          const lower = offer.id === cheapest;
          const principalShare = principal / scale;
          const interestShare = interest / scale;
          const feeShare = fee / scale;
          return (
            <motion.button
              key={offer.id}
              id={`${baseId}-offer-${offer.id}`}
              type="button"
              role="radio"
              aria-checked={isPicked}
              aria-label={`${offer.lender}, ${offer.apr} percent APR over ${offer.term} months, ${format(payment)} a month, ${format(total)} total${lower ? ", lower cost" : ""}`}
              tabIndex={index === anchor ? 0 : -1}
              onClick={() => select(offer.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              initial={false}
              animate={{
                y: isPicked && motionSafe ? -distances.nudge : 0,
                opacity: dimmed ? 0.6 : 1,
              }}
              transition={{
                y: motionSafe ? springs.snap : { duration: 0 },
                opacity: fade,
              }}
              className={cn(
                "flex min-w-0 cursor-pointer flex-col gap-2 rounded-3 border p-3 text-left transition-[border-color,box-shadow,background-color] outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isPicked
                  ? "border-cobalt-bright bg-surface-0 shadow-raised"
                  : "border-hairline bg-surface-1 hover:border-hairline-strong",
              )}
            >
              <span
                title={offer.lender}
                className="block min-w-0 truncate text-xs font-medium text-ink"
              >
                {offer.lender}
              </span>

              <span className="flex items-baseline gap-1">
                <span className="font-mono text-2xl leading-none font-semibold text-ink">
                  <RollingFigure
                    text={offer.apr.toFixed(1)}
                    motionSafe={motionSafe}
                  />
                </span>
                <span aria-hidden className="text-[11px] text-ink-3">
                  % APR
                </span>
              </span>

              <span className="flex flex-col gap-0.5">
                <span className="flex items-baseline gap-1">
                  <span className="font-mono text-sm font-medium text-ink">
                    <RollingFigure
                      text={format(payment)}
                      motionSafe={motionSafe}
                    />
                  </span>
                  <span aria-hidden className="text-[11px] text-ink-3">
                    /mo
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-[11px] text-ink-3 tabular-nums"
                >
                  {offer.term} months
                </span>
              </span>

              <span
                aria-hidden
                className="relative block h-2 w-full overflow-hidden rounded-full bg-hairline-strong"
              >
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
                  initial={false}
                  animate={{ width: pct(principalShare) }}
                  transition={sizing}
                />
                <motion.span
                  className="absolute inset-y-0 bg-warn"
                  initial={false}
                  animate={{
                    left: pct(principalShare),
                    width: pct(interestShare),
                  }}
                  transition={sizing}
                />
                <motion.span
                  className="absolute inset-y-0 rounded-r-full bg-ink-3"
                  initial={false}
                  animate={{
                    left: pct(principalShare + interestShare),
                    width: pct(feeShare),
                  }}
                  transition={sizing}
                />
              </span>

              {/* The cheaper card says so where the total is read, in words,
                  so the tag never competes with the lender's name for width. */}
              <span className="flex items-baseline justify-between gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "text-[11px] whitespace-nowrap",
                    lower ? "font-medium text-success" : "text-ink-3",
                  )}
                >
                  {lower ? "Lower cost" : "Total"}
                </span>
                <RolledMoney
                  value={total}
                  format={format}
                  motionSafe={motionSafe}
                  className="text-xs font-medium text-ink"
                />
              </span>
            </motion.button>
          );
        })}
      </div>

      <div
        aria-hidden
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-2"
      >
        <span className="flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full bg-cobalt-bright" />
          Principal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-full bg-warn" />
          Interest
        </span>
        {costed.some((item) => item.fee > 0) ? (
          <span className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full bg-ink-3" />
            Fee
          </span>
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
