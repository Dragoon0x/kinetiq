"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One resting price level. */
export type BookLevel = { price: number; size: number };

/** What the hovered or focused level reports back. */
export type LevelReading = {
  side: "bid" | "ask";
  price: number;
  size: number;
  /** Size resting between the touch and this level, inclusive. */
  cumulativeSize: number;
  /** That size priced at each level it sits on. */
  cumulativeValue: number;
};

export type OrderBookProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Buy levels, best (highest) first. */
  bids: BookLevel[];
  /** Sell levels, best (lowest) first. */
  asks: BookLevel[];
  /** Rows drawn per side. @default 6 */
  depth?: number;
  /** The pair the ladder is for. @default "BSN/USD" */
  symbol?: string;
  /** Unit printed after sizes. @default "BSN" */
  sizeUnit?: string;
  /** Turns money into its printed string. */
  format?: (value: number) => string;
  /** Turns a size into its printed string. */
  formatSize?: (size: number) => string;
  /** Fires from the pointer or focus event that changed the read level. */
  onLevelRead?: (reading: LevelReading | null) => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another produce different text for the same number, which is a
 * hydration mismatch on the figures the whole widget exists to show.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const sizes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const defaultFormat = (value: number) => money.format(value);
const defaultFormatSize = (size: number) => sizes.format(size);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * The side totals roll their columns on `snap` — an indicator taking a new
 * position, one crisp overshoot. Hidden from assistive technology because the
 * footer sentence beside it already carries the figure in words.
 */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // number gains or loses a place and only the new column mounts.
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

type Rung = LevelReading & { key: string; ratio: number };

/** Cumulates a side outward from the touch; the ratio is set by the caller. */
function ladder(levels: BookLevel[], side: "bid" | "ask", depth: number) {
  const rungs: Rung[] = [];
  let cumulativeSize = 0;
  let cumulativeValue = 0;
  for (const level of levels.slice(0, Math.max(1, depth))) {
    cumulativeSize += Math.max(0, level.size);
    cumulativeValue += Math.max(0, level.size) * level.price;
    rungs.push({
      key: `${side}-${level.price}`,
      side,
      price: level.price,
      size: level.size,
      cumulativeSize,
      cumulativeValue,
      ratio: 0,
    });
  }
  return rungs;
}

const ROW =
  "relative grid h-7 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center overflow-hidden rounded-1 px-1.5 text-[11px] outline-none";

/**
 * Bids and asks, meeting in the middle. Asks stack above the spread band and
 * bids below it, each row laid over a depth bar scaled to the deeper of the two
 * sides so the halves stay comparable. A new price level slides in from the
 * ladder's outer edge by a `step` on `snap` — an order arriving is an indicator
 * taking a position — while a filled level drains toward the touch on `glide`,
 * because a quantity settling is a layout move and must not overshoot. A level
 * that empties collapses out on the exit ease; exits never spring.
 *
 * The spread band breathes on a slow mirrored tween, the only ambient motion
 * here, and it stops while the document is hidden. Hovering or focusing a level
 * lifts its row and reads the depth resting between the touch and that price,
 * in units and in money.
 *
 * It is a real `role="grid"`: every row is focusable through a roving tabindex,
 * ArrowUp and ArrowDown walk the whole ladder across the spread, Home and End
 * jump to the ends, and each row's label speaks the same sentence the hover
 * reading shows. Under reduced motion levels appear and resize in place, the
 * band stops breathing, and the depths still read.
 */
export function OrderBook({
  ref,
  bids,
  asks,
  depth = 6,
  symbol = "BSN/USD",
  sizeUnit = "BSN",
  format = defaultFormat,
  formatSize = defaultFormatSize,
  onLevelRead,
  className,
}: OrderBookProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  // Nothing breathes at an empty room: the band holds still while hidden.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const [focusIndex, setFocusIndex] = React.useState(0);
  const [reading, setReading] = React.useState<LevelReading | null>(null);
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  const askRungs = ladder(asks, "ask", depth);
  const bidRungs = ladder(bids, "bid", depth);
  const deepest = Math.max(
    1,
    askRungs[askRungs.length - 1]?.cumulativeSize ?? 0,
    bidRungs[bidRungs.length - 1]?.cumulativeSize ?? 0,
  );
  const scaled = (rungs: Rung[]) =>
    rungs.map((rung) => ({ ...rung, ratio: rung.cumulativeSize / deepest }));

  // Asks print worst price first so the best ask sits against the spread.
  const askRows = scaled(askRungs).reverse();
  const bidRows = scaled(bidRungs);

  const bestAsk = askRungs[0]?.price ?? 0;
  const bestBid = bidRungs[0]?.price ?? 0;
  const spread = Math.max(0, bestAsk - bestBid);
  const mid = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : 0;
  const bps = mid > 0 ? (spread / mid) * 10000 : 0;

  // One flat walk of everything focusable, top to bottom, with the spread band
  // sitting between the two sides exactly as it is drawn.
  const spreadIndex = askRows.length;
  const lastIndex = askRows.length + bidRows.length;
  const active = Math.min(focusIndex, lastIndex);

  const read = (rung: LevelReading | null) => {
    setReading(rung);
    onLevelRead?.(rung);
  };

  const moveTo = (next: number) => {
    const clamped = Math.min(lastIndex, Math.max(0, next));
    setFocusIndex(clamped);
    rowRefs.current[clamped]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowDown") moveTo(index + 1);
    else if (event.key === "ArrowUp") moveTo(index - 1);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(lastIndex);
    else return;
    event.preventDefault();
  };

  const sentence = (rung: LevelReading) =>
    `${rung.side === "ask" ? "Ask" : "Bid"} ${format(rung.price)}, size ${formatSize(rung.size)} ${sizeUnit}, ${formatSize(rung.cumulativeSize)} ${sizeUnit} cumulative, ${format(rung.cumulativeValue)} resting`;

  const askTotal = askRungs[askRungs.length - 1]?.cumulativeSize ?? 0;
  const bidTotal = bidRungs[bidRungs.length - 1]?.cumulativeSize ?? 0;

  const renderRow = (rung: Rung, index: number) => {
    const isAsk = rung.side === "ask";
    const held = reading?.price === rung.price && reading.side === rung.side;
    return (
      <motion.div
        key={rung.key}
        ref={(node) => {
          rowRefs.current[index] = node;
        }}
        role="row"
        tabIndex={index === active ? 0 : -1}
        aria-label={sentence(rung)}
        layout={motionSafe}
        initial={
          motionSafe ? { opacity: 0, x: distances.step } : { opacity: 0 }
        }
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, height: 0, transition: exitFor() }}
        transition={
          motionSafe
            ? springs.snap
            : { duration: durations.fast, ease: easings.enter }
        }
        onPointerEnter={() => read(rung)}
        onFocus={() => {
          setFocusIndex(index);
          read(rung);
        }}
        onKeyDown={(event) => onKeyDown(event, index)}
        className={cn(
          ROW,
          "cursor-default transition-colors",
          held ? "bg-surface-2" : "hover:bg-surface-2/60",
          "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
        )}
      >
        {/* The bar is the drain: cumulative depth scaled from the outer edge,
            gliding rather than snapping because a size settling is a layout
            move, not a switch. */}
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-y-0.5 right-0 left-0 origin-right rounded-1",
            isAsk ? "bg-danger/12" : "bg-success/12",
          )}
          initial={false}
          animate={{ scaleX: rung.ratio }}
          transition={
            motionSafe
              ? springs.glide
              : { duration: durations.fast, ease: easings.enter }
          }
        />
        <span
          role="gridcell"
          className={cn(
            "relative font-mono tabular-nums",
            isAsk ? "text-danger" : "text-success",
          )}
        >
          {format(rung.price)}
        </span>
        <span
          role="gridcell"
          className="relative text-right font-mono text-ink tabular-nums"
        >
          {formatSize(rung.size)}
        </span>
        <span
          role="gridcell"
          className="relative text-right font-mono text-ink-3 tabular-nums"
        >
          {formatSize(rung.cumulativeSize)}
        </span>
      </motion.div>
    );
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {symbol}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Book
        </span>
      </div>

      {/* Clearing on the grid rather than on each row: stepping from one level
          to the next would otherwise fire a null reading between every pair,
          and flash the band's readout back to the mid on every arrow key. */}
      <div
        role="grid"
        aria-labelledby={labelId}
        onPointerLeave={() => read(null)}
        onBlurCapture={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          read(null);
        }}
        className="flex flex-col"
      >
        <div role="rowgroup">
          <div
            role="row"
            className={cn(ROW, "h-5 tracking-[0.08em] text-ink-3 uppercase")}
          >
            <span role="columnheader" className="font-mono text-[10px]">
              Price
            </span>
            <span
              role="columnheader"
              className="text-right font-mono text-[10px]"
            >
              Size
            </span>
            <span
              role="columnheader"
              className="text-right font-mono text-[10px]"
            >
              Total
            </span>
          </div>
        </div>

        <div role="rowgroup" className="flex flex-col">
          <AnimatePresence initial={false}>
            {askRows.map((rung, index) => renderRow(rung, index))}
          </AnimatePresence>
        </div>

        <div role="rowgroup">
          <div
            role="row"
            ref={(node) => {
              rowRefs.current[spreadIndex] = node;
            }}
            tabIndex={active === spreadIndex ? 0 : -1}
            aria-label={`Spread ${format(spread)}, ${Math.round(bps)} basis points, mid ${format(mid)}`}
            onFocus={() => {
              setFocusIndex(spreadIndex);
              read(null);
            }}
            onKeyDown={(event) => onKeyDown(event, spreadIndex)}
            className={cn(
              ROW,
              "my-1 h-8 grid-cols-[auto_minmax(0,1fr)] border-y border-hairline",
              "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
            )}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 bg-cobalt-wash"
              animate={
                motionSafe && visible
                  ? { opacity: [0.45, 1] }
                  : { opacity: 0.7 }
              }
              transition={
                motionSafe && visible
                  ? {
                      duration: 2.4,
                      ease: easings.move,
                      repeat: Infinity,
                      repeatType: "mirror",
                    }
                  : { duration: durations.fast }
              }
            />
            <span
              role="gridcell"
              className="relative pr-2 font-mono text-[11px] text-ink tabular-nums"
            >
              {format(spread)}
              <span className="text-ink-3"> · {Math.round(bps)} bp</span>
            </span>
            {/* Spans the size and total columns so the band still adds up to
                the ladder's three, and stays out of the accessibility tree —
                each row's own label already speaks this sentence, and a live
                region here would fire on every arrow key. */}
            <span
              role="gridcell"
              aria-colspan={2}
              aria-hidden
              className="relative min-w-0 text-right"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={reading ? `${reading.side}-${reading.price}` : "mid"}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                  className="block truncate font-mono text-[10px] text-ink-2 tabular-nums"
                >
                  {reading
                    ? `${formatSize(reading.cumulativeSize)} ${sizeUnit} · ${format(reading.cumulativeValue)}`
                    : `Mid ${format(mid)}`}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
        </div>

        <div role="rowgroup" className="flex flex-col">
          <AnimatePresence initial={false}>
            {bidRows.map((rung, index) =>
              renderRow(rung, spreadIndex + 1 + index),
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-hairline px-1.5 pt-2 text-[10px]">
        <span className="flex items-center gap-1 font-mono text-ink-3">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-success"
          />
          <span className="sr-only">{`Bids resting ${formatSize(bidTotal)} ${sizeUnit}`}</span>
          <Rolling text={formatSize(bidTotal)} motionSafe={motionSafe} />
          <span aria-hidden>{sizeUnit}</span>
        </span>
        <span className="flex items-center gap-1 font-mono text-ink-3">
          <span className="sr-only">{`Asks resting ${formatSize(askTotal)} ${sizeUnit}`}</span>
          <Rolling text={formatSize(askTotal)} motionSafe={motionSafe} />
          <span aria-hidden>{sizeUnit}</span>
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-danger"
          />
        </span>
      </div>
    </div>
  );
}
