"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CostBasisProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Instrument code, printed under the lane. */
  symbol: string;
  /** Units held; divides both totals for the per-share view. */
  shares: number;
  /** Average price paid. */
  costPerShare: number;
  /** Current mark. A new value re-fills the lane on `glide`. */
  price: number;
  /** Controlled state of the per-share toggle. */
  perShare?: boolean;
  /** Initial state for uncontrolled usage. @default false */
  defaultPerShare?: boolean;
  onPerShareChange?: (perShare: boolean) => void;
  /** Formats the position totals. */
  format?: (value: number) => string;
  /** Formats the per-share figures. */
  formatPrice?: (value: number) => string;
  /** Slack past the larger figure, so a full lane never touches the edge. @default 0.12 */
  headroom?: number;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * Explicit locales, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same amount, which is a
 * hydration mismatch on the two figures this card exists to compare.
 */
const totals = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const perUnit = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => totals.format(value);
const defaultFormatPrice = (value: number) => perUnit.format(value);

/** The two-face roll, shared by both figures on the card. */
function Roll({
  text,
  previous,
  up,
  generation,
  motionSafe,
}: {
  text: string;
  previous: string;
  up: boolean;
  generation: number;
  motionSafe: boolean;
}) {
  // Aligned from the right, so the units column keeps its identity when the
  // figure gains or loses a place and a new column rolls in from a blank.
  const was =
    previous.length >= text.length
      ? previous.slice(previous.length - text.length)
      : previous.padStart(text.length, " ");

  return (
    <span aria-hidden className="inline-flex h-[1.1em] items-stretch">
      {text.split("").map((char, index) => {
        const key = text.length - index;
        const before = was[index] ?? char;
        if (!motionSafe || before === char || generation === 0) {
          return (
            <span
              key={key}
              className="flex h-full w-[1ch] items-center justify-center"
            >
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative flex h-full w-[1ch] items-center justify-center overflow-hidden"
          >
            {/* Keyed by the change so each one mounts a fresh pair; the strip is
                two faces tall, which is why one face of travel is 50%. */}
            <motion.span
              key={generation}
              className="absolute inset-x-0 top-0 flex h-[200%] flex-col"
              initial={{ y: up ? "0%" : "-50%" }}
              animate={{ y: up ? "-50%" : "0%" }}
              transition={springs.snap}
            >
              <span className="flex h-1/2 items-center justify-center">
                {up ? before : char}
              </span>
              <span className="flex h-1/2 items-center justify-center">
                {up ? char : before}
              </span>
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/** Holds the face a figure is leaving, so the pair can travel the right way. */
function useRoll(value: number, text: string) {
  const [shown, setShown] = React.useState(() => ({
    value,
    text,
    previous: text,
    up: true,
    generation: 0,
  }));
  if (shown.value !== value) {
    setShown({
      value,
      text,
      previous: shown.text,
      up: value > shown.value,
      generation: shown.generation + 1,
    });
  }
  return shown;
}

/**
 * What you paid, against what it is worth. Two figures sit over one lane: a
 * neutral base fill runs from the lane's origin to the paid mark, then a
 * coloured extension fills from that mark toward worth — right in success when
 * the position is up, left in danger when it is down — so the extension always
 * reads as the distance between the two numbers. Both fills are transforms, `x`
 * and `scaleX` from a pinned left origin rather than an animated `width`, and
 * both settle on `glide`: a valuation arriving somewhere new is a layout
 * settling, not a switch flipping.
 *
 * The toggle swaps both figures between the position totals and the per-share
 * values, and the digits roll to get there on `snap`. Deliberately, the lane
 * does not move while it happens: dividing both numbers by the same share count
 * leaves the ratio identical, and animating the geometry anyway would invent a
 * change the position never made. The lane's scale is always read from the
 * totals for exactly that reason.
 *
 * The toggle is a real `role="switch"`, the lane is a `role="img"` with a spoken
 * sentence, and the share count and both prices stay printed underneath so the
 * arithmetic is checkable without flipping anything. Under reduced motion the
 * characters swap in place and the fills jump — the gap between paid and worth
 * is the whole point of the card, so it is never withheld.
 */
export function CostBasis({
  ref,
  symbol,
  shares,
  costPerShare,
  price,
  perShare,
  defaultPerShare = false,
  onPerShareChange,
  format = defaultFormat,
  formatPrice = defaultFormatPrice,
  headroom = 0.12,
  label,
  className,
  "aria-label": ariaLabel,
}: CostBasisProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultPerShare);
  const isControlled = perShare !== undefined;
  const showPerShare = isControlled ? perShare : uncontrolled;

  const paid = shares * costPerShare;
  const worth = shares * price;
  const gain = worth - paid;
  const percent = paid === 0 ? 0 : (gain / paid) * 100;
  const up = gain > 0;
  const down = gain < 0;

  // The lane is always scaled from the totals, never from what is displayed:
  // the per-share view divides both numbers by the same count, so its geometry
  // is identical and the bar must not twitch when the toggle flips.
  const span = Math.max(paid, worth) * (1 + Math.max(0, headroom));
  const paidShare = span === 0 ? 0 : paid / span;
  const worthShare = span === 0 ? 0 : worth / span;
  const start = Math.min(paidShare, worthShare);
  const reach = Math.abs(worthShare - paidShare);

  const paidValue = showPerShare ? costPerShare : paid;
  const worthValue = showPerShare ? price : worth;
  const print = showPerShare ? formatPrice : format;

  const paidRoll = useRoll(paidValue, print(paidValue));
  const worthRoll = useRoll(worthValue, print(worthValue));

  const toggle = () => {
    const next = !showPerShare;
    if (!isControlled) setUncontrolled(next);
    onPerShareChange?.(next);
  };

  const sentence = `Paid ${format(paid)}, worth ${format(worth)}, ${
    up ? "up" : down ? "down" : "level at"
  } ${format(Math.abs(gain))}, ${Math.abs(percent).toFixed(1)} percent`;

  const fill = motionSafe ? springs.glide : { duration: 0 };
  const caption = showPerShare ? " / share" : "";

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {label ? (
          <span
            id={labelId}
            className="min-w-0 flex-1 truncate text-sm font-medium"
          >
            {label}
          </span>
        ) : null}

        <button
          type="button"
          role="switch"
          aria-checked={showPerShare}
          onClick={toggle}
          className={cn(
            "ml-auto flex h-8 shrink-0 items-center gap-2 rounded-full border border-input bg-surface-1 pr-1.5 pl-2.5 transition-colors outline-none hover:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="text-[11px] font-medium whitespace-nowrap">
            Per share
          </span>
          <span
            aria-hidden
            className={cn(
              "relative h-4 w-7 shrink-0 rounded-full border border-hairline transition-colors",
              showPerShare ? "bg-cobalt-wash" : "bg-surface-2",
            )}
          >
            {/* Centred through the animation, not a -translate-y class: motion
                writes the whole transform, so a Tailwind translate on the same
                element would simply be overwritten. */}
            <motion.span
              className={cn(
                "absolute top-1/2 left-0 size-3 rounded-full transition-colors",
                showPerShare ? "bg-cobalt-bright" : "bg-ink-3",
              )}
              initial={false}
              animate={{ x: showPerShare ? 12 : 2, y: "-50%" }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 items-end gap-3">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Paid{caption}
          </span>
          <span className="font-mono text-xl leading-none font-medium text-ink-2 tabular-nums">
            <Roll
              text={paidRoll.text}
              previous={paidRoll.previous}
              up={paidRoll.up}
              generation={paidRoll.generation}
              motionSafe={motionSafe}
            />
            <span className="sr-only">Paid {print(paidValue)}</span>
          </span>
        </span>

        <span className="flex min-w-0 flex-col items-end gap-1">
          <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Worth{caption}
          </span>
          <span
            className={cn(
              "font-mono text-xl leading-none font-medium tabular-nums transition-colors",
              up ? "text-success" : down ? "text-danger" : "text-foreground",
            )}
          >
            <Roll
              text={worthRoll.text}
              previous={worthRoll.previous}
              up={worthRoll.up}
              generation={worthRoll.generation}
              motionSafe={motionSafe}
            />
            <span className="sr-only">Worth {print(worthValue)}</span>
          </span>
        </span>
      </div>

      <div
        role="img"
        aria-label={sentence}
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-hairline-strong"
          initial={motionSafe ? { scaleX: 0 } : false}
          animate={{ scaleX: paidShare }}
          transition={fill}
        />
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-full origin-left rounded-full",
            up ? "bg-success" : down ? "bg-danger" : "bg-ink-3",
          )}
          initial={motionSafe ? { scaleX: 0, x: `${start * 100}%` } : false}
          animate={{ scaleX: reach, x: `${start * 100}%` }}
          transition={fill}
        />
        {/* The mark the extension is measured from. `left` rather than a
            percentage `x`: a one-pixel element translated by a percentage moves
            by a percentage of *itself*, which is nothing. It rides the same
            scale as the fills, so a rescaled lane moves the mark and the fill
            as one body rather than sliding them apart. */}
        <motion.span
          aria-hidden
          className="absolute inset-y-0 w-px bg-ink"
          initial={false}
          animate={{ left: `${paidShare * 100}%` }}
          transition={fill}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          {symbol} · {shares} shares · {formatPrice(costPerShare)} →{" "}
          {formatPrice(price)}
        </span>
        <span
          aria-hidden
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 font-mono text-[11px] font-medium tabular-nums transition-colors",
            up
              ? "bg-success/12 text-success"
              : down
                ? "bg-danger/12 text-danger"
                : "bg-surface-2 text-ink-2",
          )}
        >
          <span>
            {gain >= 0 ? "+" : "-"}
            {format(Math.abs(gain))}
          </span>
          <span className="text-ink-3">·</span>
          <span>
            {percent >= 0 ? "+" : "-"}
            {Math.abs(percent).toFixed(1)}%
          </span>
        </span>
      </div>

      <span role="status" className="sr-only">
        {sentence}
      </span>
    </div>
  );
}
