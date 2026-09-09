"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WatchlistRowProps = {
  ref?: React.Ref<HTMLLIElement>;
  /** Identifies the row in `onRemoved`. */
  id: string;
  /** The ticker printed first, e.g. "BSN". */
  symbol: string;
  /** The asset's name, printed under the symbol. */
  name: string;
  /** The last print. Changing it rolls the digits. */
  price: number;
  /** Basis for the change chip. */
  previousClose: number;
  /** Controlled star state. */
  watched?: boolean;
  /** Initial star state for uncontrolled usage. @default true */
  defaultWatched?: boolean;
  /** Fires from the press that toggled the star. */
  onWatchedChange?: (watched: boolean) => void;
  /** Fires once the row has slid out and collapsed; drop it from the list here. */
  onRemoved?: (id: string) => void;
  /** Turns a price into its printed string. */
  format?: (value: number) => string;
  /** The beat between unstarring and the slide-out, so the empty star is read. @default 500 */
  leaveDelayMs?: number;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another print different text for the same price, which is a
 * hydration mismatch on the one figure the row exists to show.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** A five-point star in a 16px box; the same path draws the outline and the fill. */
const STAR =
  "M8 1.6l1.9 4.1 4.5.5-3.3 3.1.9 4.5L8 11.6l-4 2.2.9-4.5L1.6 6.2l4.5-.5z";

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * A figure whose digit columns roll to their new face on `snap` — one crisp
 * overshoot, the physics of an indicator changing position. Each column is a
 * strip ten faces tall, so a `y` percentage of its own height moves exactly
 * one face. Hidden from assistive technology: the row already carries the
 * price in words, and nobody should wade through ten faces per column.
 */
function RollingPrice({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a place, and only the new column mounts.
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
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.25em] items-center justify-center"
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
 * One row of a watchlist. The star is a switch: watching fills it — the fill
 * scales up from the star's centre on `recoil`, whose ζ0.53 gives the two
 * bounces of a stamp landing — while the outline stays put. The price rolls to
 * each print on `snap` and the change chip re-tones with it. Unstarring drains
 * the fill on a fast tween, holds the row for `leaveDelayMs` so the empty star
 * is read, then slides the row out: the content travels a `shift` to the left
 * and fades on the exit ease, and the row's measured height collapses behind it
 * so the rows beneath close the gap. `onRemoved` fires from the collapse's
 * completion, never from a render; re-starring during the beat cancels the
 * leave. Renders as an `<li>` — put it inside a `<ul>` or `<ol>`.
 *
 * Tab reaches the star, Space and Enter toggle it, and a polite status inside
 * the row says what happened. Under reduced motion the fill appears, the digits
 * swap, and the row still leaves — a removed row is information — but it fades
 * and collapses without the sideways travel.
 */
export function WatchlistRow({
  ref,
  id,
  symbol,
  name,
  price,
  previousClose,
  watched,
  defaultWatched = true,
  onWatchedChange,
  onRemoved,
  format = defaultFormat,
  leaveDelayMs = 500,
  className,
}: WatchlistRowProps) {
  const motionSafe = useMotionSafe();
  const removedRef = useLatest(onRemoved);

  const [uncontrolled, setUncontrolled] = React.useState(defaultWatched);
  const isControlled = watched !== undefined;
  const current = isControlled ? watched : uncontrolled;

  const [notice, setNotice] = React.useState("");
  const [leaving, setLeaving] = React.useState(false);
  // A row re-starred from outside during its leave comes back: the flag is
  // cleared during render so no stale leave survives a controlled flip.
  if (leaving && current) setLeaving(false);

  React.useEffect(() => {
    if (current) return;
    const timer = window.setTimeout(
      () => setLeaving(true),
      Math.max(0, leaveDelayMs),
    );
    return () => window.clearTimeout(timer);
  }, [current, leaveDelayMs]);

  // The content's own height, read in the observer callback so the collapse
  // has a real number to leave from and nothing reserves room for the row.
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = React.useState(0);
  React.useEffect(() => {
    const node = contentRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = node.offsetHeight;
      setContentHeight((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    const next = !current;
    if (!isControlled) setUncontrolled(next);
    setNotice(next ? `Watching ${symbol}` : `${symbol} leaves the watchlist`);
    onWatchedChange?.(next);
  };

  const change = price - previousClose;
  const percent = previousClose === 0 ? 0 : (change / previousClose) * 100;
  const rising = change > 0;
  const falling = change < 0;
  const tone = rising ? "text-success" : falling ? "text-danger" : "text-ink-2";
  const words = `${rising ? "up" : falling ? "down" : "unchanged"} ${Math.abs(
    percent,
  ).toFixed(2)} percent`;

  const slide = exitFor(durations.base);
  const isLeaving = leaving && !current;

  return (
    <motion.li
      ref={ref}
      initial={false}
      animate={{ height: isLeaving ? 0 : contentHeight || "auto" }}
      // The collapse waits for the slide, so the row is seen to leave before
      // the gap closes; coming back glides open with no overshoot.
      transition={
        isLeaving
          ? { ...slide, delay: slide.duration ?? 0 }
          : motionSafe
            ? springs.glide
            : { duration: durations.fast }
      }
      onAnimationComplete={(definition) => {
        const target = definition as { height?: number | string };
        if (target.height === 0) removedRef.current?.(id);
      }}
      aria-hidden={isLeaving || undefined}
      className={cn("list-none overflow-hidden", className)}
    >
      <motion.div
        ref={contentRef}
        initial={false}
        animate={{
          x: isLeaving && motionSafe ? -distances.shift : 0,
          opacity: isLeaving ? 0 : 1,
        }}
        transition={
          isLeaving
            ? slide
            : motionSafe
              ? { ...springs.glide, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
        }
        className="flex items-center gap-3 py-2"
      >
        <button
          type="button"
          role="switch"
          aria-checked={current}
          aria-label={`Watch ${symbol}`}
          onClick={toggle}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-2 transition-colors outline-none hover:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            current ? "text-warn" : "text-ink-3 hover:text-ink",
          )}
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0">
            <path
              d={STAR}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            {/* Only origin keys survive motion's transform-origin rewrite on
                SVG nodes, so the fill grows from the star's centre. */}
            <motion.path
              d={STAR}
              fill="currentColor"
              style={{ originX: 0.5, originY: 0.5 }}
              initial={false}
              animate={{
                scale: current || !motionSafe ? 1 : 0,
                opacity: current ? 1 : 0,
              }}
              transition={
                current && motionSafe
                  ? {
                      ...springs.recoil,
                      opacity: { duration: durations.blink },
                    }
                  : { duration: durations.fast, ease: easings.exit }
              }
            />
          </svg>
        </button>

        {/* The sentence at the end of the row speaks symbol, name, price and
            change once; the visible pieces stay out of the tree so nothing
            is read twice. */}
        <span aria-hidden className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm leading-tight font-medium">{symbol}</span>
          <span
            title={name}
            className="truncate text-[11px] leading-tight text-ink-3"
          >
            {name}
          </span>
        </span>

        <span className="shrink-0 font-mono text-sm font-medium text-ink">
          <RollingPrice text={format(price)} motionSafe={motionSafe} />
        </span>

        <span
          aria-hidden
          className={cn(
            "inline-flex h-6 w-[7.5ch] shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2 font-mono text-[11px] font-medium tabular-nums transition-colors",
            tone,
          )}
        >
          {change >= 0 ? "+" : "-"}
          {Math.abs(percent).toFixed(2)}%
        </span>

        <span className="sr-only">
          {name} {symbol}, {format(price)}, {words}
        </span>
        <span role="status" className="sr-only">
          {notice}
        </span>
      </motion.div>
    </motion.li>
  );
}
