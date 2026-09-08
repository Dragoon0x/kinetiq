"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PrintDirection = "up" | "down" | "flat";

export type PriceTickerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The last price. Changing it rolls the digits the way the print moved. */
  price: number;
  /** The basis for the change chip. */
  previousClose: number;
  /** The instrument printed above the figure. @default "BSN/USD" */
  symbol?: string;
  /** A quiet line beside the symbol — the book the print came from. */
  venue?: string;
  /** Turns a price into its printed string. */
  format?: (value: number) => string;
  /** How long the direction wash holds, and the quiet the live region waits for. @default 700 */
  flashMs?: number;
  /** Figure scale; `md` fits the price into a dense row. @default "lg" */
  size?: "md" | "lg";
  /** Fires from the effect that observed the committed print. */
  onPrint?: (price: number, direction: PrintDirection) => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another produce different text for the same number, which is a
 * hydration mismatch on the one figure this component exists to show.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The roll itself. Each column is a window one face tall holding exactly two
 * faces — the character leaving and the character arriving — and the pair
 * travels half its own height on `snap`.
 *
 * Two faces rather than a ten-digit strip is the whole point: a strip carries
 * the shortest numeric path, so a price ticking 24.19 → 24.11 would roll its
 * units digit *upward* through eight faces while the price went down. A pair
 * can only ever move the way the print moved.
 */
function Roll({
  text,
  prev,
  direction,
  generation,
  motionSafe,
}: {
  text: string;
  prev: string;
  direction: PrintDirection;
  generation: number;
  motionSafe: boolean;
}) {
  // Align from the right so the units column keeps its identity when the
  // figure gains or loses a place; a column with no history rolls in blank.
  const was =
    prev.length >= text.length
      ? prev.slice(prev.length - text.length)
      : prev.padStart(text.length, " ");

  return (
    <span aria-hidden className="inline-flex h-[1.15em] items-stretch">
      {text.split("").map((char, index) => {
        const key = text.length - index;
        const before = was[index] ?? char;
        const rolls = motionSafe && direction !== "flat" && before !== char;
        const up = direction === "up";
        if (!rolls) {
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
            {/* Keyed by the print so every print mounts a fresh pair: the strip
                is two faces tall, which is why one face of travel is 50%. */}
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

type Print = {
  price: number;
  previous: number;
  direction: PrintDirection;
  generation: number;
};

/**
 * Each print, in the direction it moved. The figure's digit columns roll one
 * face on `snap` — upward when the print was higher, downward when it was
 * lower — and columns whose digit did not change hold still, so the eye reads
 * the movement rather than a shuffle. A wash flashes success or danger behind
 * the figure and leaves on the exit ease, because colour is a tween and never a
 * spring. The change chip rolls its sign and its percent on the same pair, and
 * its arrow turns over on `snap` when a print crosses the previous close.
 *
 * The component never generates a print: it rolls what `price` is given, and
 * reports each committed one through `onPrint` from the effect that observed
 * it. Announcement is deliberately not per print — a polite `sr-only` sentence
 * is written once `flashMs` of quiet has passed, so a burst of prints announces
 * the settled price once instead of ten times.
 *
 * Under reduced motion the faces swap with no travel and the arrow swaps
 * instead of turning, while the direction wash still appears and still fades:
 * which way the price went is the information, not the flourish.
 */
export function PriceTicker({
  ref,
  price,
  previousClose,
  symbol = "BSN/USD",
  venue,
  format = defaultFormat,
  flashMs = 700,
  size = "lg",
  onPrint,
  className,
}: PriceTickerProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const printRef = useLatest(onPrint);

  const change = price - previousClose;
  const percent = previousClose === 0 ? 0 : (change / previousClose) * 100;
  const rising = change > 0;
  const falling = change < 0;

  const chip = `${change >= 0 ? "+" : "-"}${Math.abs(percent).toFixed(2)}%`;
  const sentence = `${symbol} ${format(price)}, ${
    change > 0 ? "up" : change < 0 ? "down" : "unchanged"
  } ${Math.abs(percent).toFixed(2)} percent on the close`;

  // The committed print, adjusted during render rather than in an effect: the
  // roll needs the face it is leaving, and an effect would paint the new digit
  // once before the pair could be built.
  const [print, setPrint] = React.useState<Print>(() => ({
    price,
    previous: price,
    direction: "flat",
    generation: 0,
  }));
  if (print.price !== price) {
    setPrint({
      price,
      previous: print.price,
      direction: price > print.price ? "up" : "down",
      generation: print.generation + 1,
    });
  }

  const [announced, setAnnounced] = React.useState(sentence);

  React.useEffect(() => {
    if (print.generation === 0) return;
    printRef.current?.(print.price, print.direction);
  }, [print.generation, print.price, print.direction, printRef]);

  React.useEffect(() => {
    // Written from the timer, not the render: a fast tape would otherwise
    // interrupt a screen reader on every print.
    const timer = window.setTimeout(
      () => setAnnounced(sentence),
      Math.max(0, flashMs) + 80,
    );
    return () => window.clearTimeout(timer);
  }, [sentence, flashMs]);

  // The chip's leaving faces come from the price the roll is leaving, so the
  // sign and the percent travel on exactly the same pair as the figure.
  const before = print.generation === 0 ? price : print.previous;
  const beforeChange = before - previousClose;
  const beforePercent =
    previousClose === 0 ? 0 : (beforeChange / previousClose) * 100;
  const previousChip = `${beforeChange >= 0 ? "+" : "-"}${Math.abs(beforePercent).toFixed(2)}%`;

  const tone = rising ? "text-success" : falling ? "text-danger" : "text-ink-2";
  const wash =
    print.direction === "up"
      ? "bg-success/16"
      : print.direction === "down"
        ? "bg-danger/16"
        : "bg-transparent";

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {symbol}
        </span>
        {venue ? (
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {venue}
          </span>
        ) : null}
      </div>

      <div className="relative -mx-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2 px-2 py-1.5">
        {/* Keyed by the print so each one mounts its own wash and fades it out;
            an unkeyed element would need a second animation to reset. */}
        <motion.span
          key={print.generation}
          aria-hidden
          className={cn("absolute inset-0 rounded-2", wash)}
          initial={{ opacity: print.generation === 0 ? 0 : 1 }}
          animate={{ opacity: 0 }}
          transition={{
            duration: motionSafe ? Math.max(0, flashMs) / 1000 : durations.fast,
            ease: easings.exit,
          }}
        />

        <span
          className={cn(
            "relative font-mono leading-none font-medium tabular-nums",
            size === "lg" ? "text-4xl" : "text-2xl",
          )}
        >
          <Roll
            text={format(price)}
            prev={format(before)}
            direction={print.direction}
            generation={print.generation}
            motionSafe={motionSafe}
          />
        </span>

        <span
          aria-hidden
          className={cn(
            "relative inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-mono text-xs font-medium tabular-nums",
            rising
              ? "bg-success/12 text-success"
              : falling
                ? "bg-danger/12 text-danger"
                : "bg-surface-2 text-ink-2",
          )}
        >
          {/* Rotated on a span, not the svg: motion rewrites transform-origin on
              SVG nodes, and an HTML wrapper turns unambiguously about its centre. */}
          <motion.span
            className="flex size-3 shrink-0 items-center justify-center"
            initial={false}
            animate={{ rotate: falling ? 180 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <svg viewBox="0 0 12 12" aria-hidden className="size-3">
              <path d="M6 2.5 10 9H2Z" fill="currentColor" />
            </svg>
          </motion.span>
          <Roll
            text={chip}
            prev={previousChip}
            direction={print.direction}
            generation={print.generation}
            motionSafe={motionSafe}
          />
        </span>
      </div>

      <p aria-hidden className="font-mono text-[11px] text-ink-3 tabular-nums">
        Prev close {format(previousClose)} ·{" "}
        <span className={tone}>
          {change >= 0 ? "+" : "-"}
          {format(Math.abs(change))}
        </span>
      </p>

      <span aria-live="polite" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
