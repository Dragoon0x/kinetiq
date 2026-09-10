"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One resting order level. */
export type DepthLevel = { price: number; size: number };

/** What the crosshair is standing on. */
export type DepthReading = {
  side: "bid" | "ask";
  price: number;
  size: number;
  cumulative: number;
};

export type DepthMoundProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Bid levels, best first, descending price. */
  bids: DepthLevel[];
  /** Ask levels, best first, ascending price. */
  asks: DepthLevel[];
  /** Plot height in px; the width is fluid. @default 160 */
  height?: number;
  /** Formats money in the accessible reading. */
  format?: (value: number) => string;
  /** Formats prices. */
  formatPrice?: (value: number) => string;
  /** Formats sizes. */
  formatSize?: (value: number) => string;
  /** Instrument code beside the mid. */
  symbol?: string;
  /** Accessible name for the plot. @default "Depth" */
  label?: string;
  /** Fires from the pointer or key that moved the crosshair. */
  onActiveChange?: (reading: DepthReading | null) => void;
  className?: string;
};

const decimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Pointer travel before a press becomes a scrub, so plain taps still land. */
const DRAG_SLOP = 4;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** Capture throws on a synthetic pointer id; the gesture works without it. */
const setCapture = (element: Element, pointerId: number, on: boolean) => {
  try {
    if (on) element.setPointerCapture(pointerId);
    else if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // A sweep from the test suite has no capture target; scrubbing continues.
  }
};

type Column = DepthReading & { rank: number; centre: number };

/**
 * Liquidity as terrain. Bids pile up leftward from an anchored mid line and
 * asks rightward, each column as tall as the cumulative size out to its price,
 * and both mounds share the larger side's scale so the landscape cannot
 * flatter the thin side. A new book re-grows the columns on `glide` — the
 * spring for a quantity settling — delayed by `cascade()` outward from the
 * mid, because the levels nearest the touch are the ones that move first, and
 * every column whose size actually changed flashes once so an arrival reads
 * even when it barely changes the shape.
 *
 * The mid line never moves. It is the reference the mounds breathe around, and
 * the spread is measured against it. The plate is a `slider` over the levels:
 * a pointer snaps the crosshair to the nearest column, Left and Right step one
 * level, Home and End jump to the deepest bid and ask, Escape clears it, and
 * the cumulative figure eases on `flick` from a motion value — ζ0.99, so the
 * reading lands where you pointed without a wobble. The whole book is also a
 * visually hidden table, so the chart means something with no pointer at all.
 */
export function DepthMound({
  ref,
  bids,
  asks,
  height = 160,
  format = (value) => money.format(value),
  formatPrice = (value) => decimal.format(value),
  formatSize = (value) => whole.format(value),
  symbol,
  label = "Depth",
  onActiveChange,
  className,
}: DepthMoundProps) {
  const motionSafe = useMotionSafe();
  const titleId = React.useId();

  const columns = React.useMemo<Column[]>(() => {
    const build = (levels: DepthLevel[], side: "bid" | "ask") => {
      let running = 0;
      return levels.map((level, rank) => {
        running += level.size;
        return { ...level, side, rank, cumulative: running, centre: 0 };
      });
    };
    const bidRows = build(bids, "bid");
    const askRows = build(asks, "ask");
    const nb = Math.max(bidRows.length, 1);
    const na = Math.max(askRows.length, 1);
    // Each side owns exactly half the plate, so the mid sits at 50% however
    // many levels a side happens to carry.
    const left = bidRows
      .map((row) => ({
        ...row,
        centre: ((bidRows.length - 1 - row.rank + 0.5) / nb) * 50,
      }))
      .reverse();
    const right = askRows.map((row) => ({
      ...row,
      centre: 50 + ((row.rank + 0.5) / na) * 50,
    }));
    return [...left, ...right];
  }, [bids, asks]);

  const deepest = Math.max(
    columns.reduce((top, column) => Math.max(top, column.cumulative), 0),
    1,
  );
  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const mid = bids.length && asks.length ? (bestBid + bestAsk) / 2 : 0;
  const spread = bids.length && asks.length ? bestAsk - bestBid : 0;
  const bidIndex = Math.max(bids.length - 1, 0);
  const count = columns.length;
  const stagger = cascade(Math.max(bids.length, asks.length));

  const [active, setActive] = React.useState<number | null>(null);
  const activeRef = React.useRef<number | null>(null);
  const changeRef = React.useRef(onActiveChange);
  React.useEffect(() => {
    changeRef.current = onActiveChange;
  });

  // The parent hears about a move from the handler that caused it, never from
  // inside an updater React is free to run twice.
  const setActiveIndex = React.useCallback(
    (next: number | null, list: Column[]) => {
      if (activeRef.current === next) return;
      activeRef.current = next;
      setActive(next);
      const column = next === null ? null : list[next];
      changeRef.current?.(
        column
          ? {
              side: column.side,
              price: column.price,
              size: column.size,
              cumulative: column.cumulative,
            }
          : null,
      );
    },
    [],
  );

  const reading = active === null ? undefined : columns[active];

  // The cumulative figure eases; the price does not, because a crosshair that
  // slides between prices lies about which level you are standing on.
  const cumulative = useMotionValue(reading?.cumulative ?? 0);
  const cumulativeText = useTransform(cumulative, (at) => formatSize(at));
  React.useEffect(() => {
    const target = reading?.cumulative;
    if (target === undefined) return;
    if (!motionSafe) {
      cumulative.set(target);
      return;
    }
    const controls = animate(cumulative, target, springs.flick);
    return () => controls.stop();
  }, [reading, motionSafe, cumulative]);

  const plateRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ pointerId: number; startX: number } | null>(
    null,
  );

  const indexAt = (clientX: number) => {
    const plate = plateRef.current;
    if (!plate || count === 0) return null;
    const rect = plate.getBoundingClientRect();
    const at = (clamp(clientX - rect.left, 0, rect.width) / rect.width) * 100;
    let best = 0;
    let bestGap = Infinity;
    columns.forEach((column, index) => {
      const gap = Math.abs(column.centre - at);
      if (gap < bestGap) {
        bestGap = gap;
        best = index;
      }
    });
    return best;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || count === 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX };
    setActiveIndex(indexAt(event.clientX), columns);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = dragRef.current;
    if (
      held &&
      held.pointerId === event.pointerId &&
      Math.abs(event.clientX - held.startX) > DRAG_SLOP
    ) {
      // Captured only once the press has become a scrub; capturing on
      // pointerdown swallows the click a tap is made of.
      setCapture(event.currentTarget, event.pointerId, true);
    }
    setActiveIndex(indexAt(event.clientX), columns);
  };

  const endScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    setCapture(event.currentTarget, event.pointerId, false);
    dragRef.current = null;
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const from = active ?? bidIndex;
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = Math.min(count - 1, from + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = Math.max(0, from - 1);
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = count - 1;
    } else if (event.key === "Escape" && active !== null) {
      event.preventDefault();
      setActiveIndex(null, columns);
      return;
    } else {
      return;
    }
    event.preventDefault();
    setActiveIndex(next, columns);
  };

  const grow = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  const summary =
    count === 0
      ? `${label}: no book`
      : `Mid ${formatPrice(mid)}, spread ${formatPrice(spread)}`;
  const valueText = reading
    ? `${reading.side === "bid" ? "Bid" : "Ask"} ${formatPrice(reading.price)}, size ${formatSize(
        reading.size,
      )}, ${formatSize(reading.cumulative)} cumulative, ${format(
        reading.price * reading.cumulative,
      )}`
    : summary;

  const renderColumn = (column: Column, index: number) => {
    const bid = column.side === "bid";
    const tall = (column.cumulative / deepest) * 100;
    return (
      <span
        key={`${column.side}-${column.rank}`}
        className="relative h-full min-w-0 flex-1"
      >
        <motion.span
          className={cn(
            "absolute inset-x-0 bottom-0 border-t-2",
            bid ? "border-success bg-success/16" : "border-danger bg-danger/16",
            active === index && (bid ? "bg-success/32" : "bg-danger/32"),
          )}
          initial={{ height: 0 }}
          animate={{ height: `${tall}%` }}
          transition={
            motionSafe ? { ...grow, delay: column.rank * stagger } : grow
          }
        />
        {/* Keyed by the size itself, so only a level that actually changed
            mounts a new flash. */}
        <AnimatePresence initial={false}>
          <motion.span
            key={column.size}
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0",
              bid ? "bg-success" : "bg-danger",
            )}
            style={{ height: `${tall}%` }}
            initial={{ opacity: 0.45 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        </AnimatePresence>
      </span>
    );
  };

  return (
    <div
      ref={ref}
      className={cn("flex w-full min-w-0 flex-col gap-2", className)}
    >
      {/* The reading lives in a row that is always present, so a crosshair
          never has to push a floating box around inside the plot. */}
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={titleId} className="shrink-0 font-mono text-sm font-semibold">
          {symbol ?? label}
        </h3>
        <p
          aria-hidden
          className="min-w-0 truncate font-mono text-[11px] text-ink-2 tabular-nums"
        >
          {reading ? (
            <>
              <span
                className={
                  reading.side === "bid" ? "text-success" : "text-danger"
                }
              >
                {reading.side === "bid" ? "Bid" : "Ask"}
              </span>{" "}
              {formatPrice(reading.price)} · {formatSize(reading.size)} ·{" "}
              <motion.span className="text-ink">{cumulativeText}</motion.span>{" "}
              cum
            </>
          ) : (
            <>
              Mid <span className="text-ink">{formatPrice(mid)}</span> · spread{" "}
              {formatPrice(spread)}
            </>
          )}
        </p>
      </div>

      <div
        ref={plateRef}
        role="slider"
        tabIndex={0}
        aria-labelledby={titleId}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.max(count - 1, 0)}
        aria-valuenow={active ?? bidIndex}
        aria-valuetext={valueText}
        aria-disabled={count === 0 || undefined}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (activeRef.current === null && count > 0) {
            setActiveIndex(bidIndex, columns);
          }
        }}
        onBlur={() => setActiveIndex(null, columns)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onPointerLeave={() => {
          if (!dragRef.current) setActiveIndex(null, columns);
        }}
        style={{ height, touchAction: "pan-y" }}
        className={cn(
          "relative w-full overflow-hidden rounded-3 border border-hairline bg-surface-1 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {/* Two halves, each taking exactly half the plate, so the mid sits at
            50% however many levels a side happens to carry — and every
            column's centre matches the percentage the crosshair is placed at. */}
        <div aria-hidden className="absolute inset-0 flex">
          <div className="flex min-w-0 flex-1 items-end gap-px">
            {columns
              .slice(0, bids.length)
              .map((column, index) => renderColumn(column, index))}
          </div>
          <div className="flex min-w-0 flex-1 items-end gap-px">
            {columns
              .slice(bids.length)
              .map((column, index) =>
                renderColumn(column, index + bids.length),
              )}
          </div>
        </div>

        {/* Anchored: the mounds move around this line, never the other way. */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink-3/60"
        />

        {reading ? (
          <motion.span
            aria-hidden
            className="absolute inset-y-0 w-px bg-ink"
            initial={false}
            animate={{ left: `${reading.centre}%` }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums">
        <span>{formatPrice(bids[bids.length - 1]?.price ?? 0)}</span>
        <span className="text-ink-2">{formatPrice(mid)}</span>
        <span>{formatPrice(asks[asks.length - 1]?.price ?? 0)}</span>
      </div>

      {/* The book in words, for anyone who cannot see the terrain. The wrapper
          carries the hiding, not the table: a table ignores a 1px width and
          lays itself out at its content's size, so `sr-only` on the table
          leaves a real box that can take the page sideways with it. */}
      <div className="sr-only">
        <table>
          <caption>{`${symbol ?? label} order book, ${summary}`}</caption>
          <thead>
            <tr>
              <th scope="col">Side</th>
              <th scope="col">Price</th>
              <th scope="col">Size</th>
              <th scope="col">Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={`${column.side}-${column.rank}`}>
                <td>{column.side === "bid" ? "Bid" : "Ask"}</td>
                <td>{formatPrice(column.price)}</td>
                <td>{formatSize(column.size)}</td>
                <td>{formatSize(column.cumulative)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
