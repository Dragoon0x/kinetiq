"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HoldingLot = {
  id: string;
  /** An already-formatted day label — the row never reads a clock. */
  date: string;
  quantity: number;
  /** What the lot cost, in the same currency as `price`. */
  cost: number;
};

export type HoldingRowProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The invented ticker, set in mono. */
  symbol: string;
  name: string;
  quantity: number;
  /** Last price. A change flashes the chip and swaps the value. */
  price: number;
  /** Session change in percent; its sign drives the chip. */
  changePercent: number;
  /** Seeded closes, oldest first, for the mini trace. */
  history?: number[];
  lots?: HoldingLot[];
  /** Controlled expansion. */
  open?: boolean;
  /** Initial expansion for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Formats every amount. */
  format?: (value: number) => string;
  className?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const units = new Intl.NumberFormat("en-US");

const defaultFormat = (value: number) => currency.format(value);

const PAD_Y = 8;

const COLUMNS = ["Opened", "Units", "Cost"] as const;

/**
 * A position that opens its history. Pressing the row expands the panel on
 * `glide` to a height a `ResizeObserver` measured on the content, so no room is
 * reserved for a panel that is not showing; inside, the mini trace rises out of
 * its own baseline while the lot rows arrive on a `cascade()`. The chevron
 * turns on `snap`.
 *
 * The row's live edge is the chip. A change in `price` is caught by comparing
 * the incoming prop with the committed one during render — no clock, no timer,
 * nothing that could differ between the server and the client — and each catch
 * remounts a wash behind the chip that starts lit and fades on a tween. The
 * value beside it swaps in its own slot: the old figure leaves upward on the
 * exit ease while the new one arrives from under on `snap`, sized by an
 * invisible copy of itself so the slot is exactly as wide as its content and
 * the row never reflows mid-tick.
 *
 * The header is a real `aria-expanded` button — Enter and Space toggle, Escape
 * closes and returns focus — the panel is a labelled region, the lots are a
 * real table inside their own scroll box, and a polite `role="status"` states
 * the settled price in one sentence rather than announcing every figure. Under
 * reduced motion nothing travels: the panel snaps open, the trace is already
 * drawn, and the chip still flashes, because a price tick is feedback.
 */
export function HoldingRow({
  ref,
  symbol,
  name,
  quantity,
  price,
  changePercent,
  history = [],
  lots = [],
  open,
  defaultOpen = false,
  onOpenChange,
  format = defaultFormat,
  className,
}: HoldingRowProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const panelId = `${baseId}-panel`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = React.useState(0);

  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    // setState lives in the observer callback, never in the effect body.
    const observer = new ResizeObserver((entries) => {
      setContentHeight(entries[0]?.contentRect.height ?? 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The tick is derived from the prop during render — the supported way to
  // notice a changed input without an effect, and the only way to key a flash
  // without reading a clock.
  const [tick, setTick] = React.useState({ price, count: 0, up: true });
  if (tick.price !== price) {
    setTick({ price, count: tick.count + 1, up: price >= tick.price });
  }

  const setOpen = (next: boolean) => {
    if (next === isOpen) return;
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  };

  const rising = changePercent >= 0;
  const tone = rising ? "text-success" : "text-danger";
  const marketValue = format(quantity * price);
  const printedChange = `${rising ? "+" : "-"}${Math.abs(changePercent).toFixed(2)}%`;

  const trace = React.useMemo(() => {
    if (history.length < 2) return null;
    let low = Infinity;
    let high = -Infinity;
    for (const point of history) {
      if (point < low) low = point;
      if (point > high) high = point;
    }
    const span = high - low || 1;
    const innerH = 100 - PAD_Y * 2;
    const nodes = history.map((point, index) => ({
      x: (index / (history.length - 1)) * 100,
      y: 100 - PAD_Y - ((point - low) / span) * innerH,
    }));
    const line = nodes
      .map((node, index) => `${index === 0 ? "M" : "L"}${node.x} ${node.y}`)
      .join(" ");
    return { line, area: `${line} L100 100 L0 100 Z`, low, high };
  }, [history]);

  const stagger = cascade(lots.length);
  const flash = rising ? "bg-success" : "bg-danger";

  return (
    <div
      ref={ref}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }}
      className={cn(
        "w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <motion.span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center text-ink-3"
          initial={false}
          animate={{ rotate: isOpen ? 90 : 0 }}
          // The chevron is an indicator changing position: snap, one overshoot.
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5"
          >
            <path d="m6 3.5 5 4.5-5 4.5" />
          </svg>
        </motion.span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            id={titleId}
            className="font-mono text-[13px] font-medium tracking-[0.06em] text-foreground"
          >
            {symbol}
          </span>
          <span title={name} className="truncate text-[11px] text-ink-3">
            {name}
          </span>
        </span>

        <span aria-hidden className="flex shrink-0 flex-col items-end gap-0.5">
          {/* An invisible copy in flow gives the slot its exact size, so the
              absolutely positioned figures can swap without the row reflowing
              and without a reserved box the content might outgrow. */}
          <span className="relative overflow-hidden">
            <span className="invisible block font-mono text-sm tabular-nums">
              {marketValue}
            </span>
            <AnimatePresence initial={false}>
              <motion.span
                key={marketValue}
                className="absolute inset-0 flex items-center justify-end font-mono text-sm text-foreground tabular-nums"
                initial={motionSafe ? { y: "70%", opacity: 0 } : { opacity: 0 }}
                animate={{ y: "0%", opacity: 1 }}
                exit={{
                  y: motionSafe ? "-70%" : "0%",
                  opacity: 0,
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
              >
                {marketValue}
              </motion.span>
            </AnimatePresence>
          </span>

          <span
            className={cn(
              "relative flex h-5 items-center gap-1 overflow-hidden rounded-full bg-surface-2 px-1.5 font-mono text-[11px] tabular-nums",
              tone,
            )}
          >
            {tick.count > 0 ? (
              <motion.span
                // Remounting on the tick count restarts the wash; a colour that
                // fades is honest under reduced motion too, so it is not gated.
                key={tick.count}
                className={cn("absolute inset-0 rounded-full", flash)}
                initial={{ opacity: 0.24 }}
                animate={{ opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ) : null}
            <motion.svg
              viewBox="0 0 12 12"
              fill="currentColor"
              className="relative size-2.5 shrink-0"
              style={{ originX: 0.5, originY: 0.5 }}
              initial={false}
              animate={{ rotate: rising ? 0 : 180 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <path d="M6 2 10.5 9.5h-9Z" />
            </motion.svg>
            <span className="relative">{printedChange}</span>
          </span>
        </span>
      </button>

      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={titleId}
        aria-hidden={!isOpen}
        className="overflow-hidden"
        initial={false}
        animate={{
          // "auto" only covers the frame before the observer has measured;
          // afterwards the panel animates to a real, measured height.
          height: isOpen ? (contentHeight > 0 ? contentHeight : "auto") : 0,
        }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <div ref={contentRef} className="border-t border-hairline px-3 py-2.5">
          {trace ? (
            <svg
              role="img"
              aria-label={`${symbol} over ${history.length} sessions, low ${format(trace.low)}, high ${format(trace.high)}.`}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="mb-2.5 h-16 w-full"
            >
              {/* The history rises out of its own baseline as the panel opens:
                  one scale on the group, not a dash pattern, because the
                  viewBox is stretched to the row and a non-scaling stroke and
                  a normalised `pathLength` do not agree about how long a path
                  is. `originY: 1` is the baseline the area path closes on. */}
              <motion.g
                className={tone}
                style={{ originX: 0.5, originY: 1 }}
                initial={false}
                animate={{ scaleY: isOpen || !motionSafe ? 1 : 0 }}
                transition={
                  motionSafe
                    ? { duration: durations.page, ease: easings.enter }
                    : { duration: 0 }
                }
              >
                <path d={trace.area} fill="currentColor" fillOpacity={0.12} />
                <path
                  d={trace.line}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </motion.g>
            </svg>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Lots held in {name} ({symbol})
              </caption>
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className={cn(
                        "py-1 font-mono text-[9px] font-normal tracking-[0.08em] text-ink-3 uppercase",
                        column === "Opened" ? "text-left" : "text-right",
                      )}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lots.map((lot, index) => (
                  <motion.tr
                    key={lot.id}
                    className="border-t border-hairline"
                    initial={false}
                    animate={{
                      opacity: isOpen ? 1 : 0,
                      y: motionSafe && !isOpen ? distances.nudge : 0,
                    }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.glide,
                            delay: isOpen ? index * stagger : 0,
                            opacity: {
                              duration: durations.fast,
                              delay: isOpen ? index * stagger : 0,
                            },
                          }
                        : { duration: 0 }
                    }
                  >
                    <td className="py-1.5 pr-2 font-mono text-[11px] whitespace-nowrap text-ink-2">
                      {lot.date}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-[11px] text-ink-2 tabular-nums">
                      {units.format(lot.quantity)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-[11px] text-foreground tabular-nums">
                      {format(lot.cost)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {symbol} {format(price)}, {rising ? "up" : "down"}{" "}
        {Math.abs(changePercent).toFixed(2)} percent, {units.format(quantity)}{" "}
        units worth {marketValue}.
      </span>
    </div>
  );
}
