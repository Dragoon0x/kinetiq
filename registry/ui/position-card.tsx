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
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PositionCardProps = {
  ref?: React.Ref<HTMLElement>;
  /** Instrument code shown in the header. */
  symbol: string;
  /** Which way the position profits. @default "long" */
  side?: "long" | "short";
  /** Units held; scales every money figure. */
  size: number;
  /** Average entry price. */
  entry: number;
  /** Mark price. A new value rolls the P&L and flashes the print. */
  price: number;
  /** Take-profit price — the far end of the gain lane. */
  target: number;
  /** Formats every money figure. */
  format?: (value: number) => string;
  /** Formats prices. */
  formatPrice?: (value: number) => string;
  /** Noun printed after the size. @default "units" */
  unitLabel?: string;
  /** Share of the track left of zero — the loss lane. @default 0.28 */
  zeroAt?: number;
  /** Controlled closed state. */
  closed?: boolean;
  /** Initial closed state for uncontrolled usage. @default false */
  defaultClosed?: boolean;
  /** Fires from the gesture or key that crossed the detent. */
  onClose?: (realised: number) => void;
  /** 0–1, fired from the pointer or key that moved the knob. */
  onSlideProgress?: (progress: number) => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another produce different text for the same number, which is a
 * hydration mismatch on the most important string in the card.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const decimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Knob width in px (size-7): its travel is the rail minus its own body. */
const KNOB = 28;
/** Pointer travel before a press becomes a drag, so plain taps still land. */
const DRAG_SLOP = 4;
/** How far along the rail the detent sits. */
const DETENT = 0.98;
/** One arrow press, as a share of the rail. */
const KEY_STEP: Record<string, number> = {
  ArrowRight: 0.2,
  ArrowUp: 0.2,
  ArrowLeft: -0.2,
  ArrowDown: -0.2,
};

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
    // A sweep from the test suite has no capture target; dragging continues.
  }
};

/**
 * The P&L figure. Each digit column is one ten-face strip translated by a
 * percentage of its own height, so a single `y` moves exactly one digit — two
 * keyframes, which is all a spring may carry. Hidden from assistive
 * technology: the card says the amount in a sentence beside it, and no reader
 * should wade through ten faces per column.
 */
function Rolling({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  const chars = value.split("");
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains a digit, and only the new column mounts.
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
            className="relative inline-block h-[1.1em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.1em] items-center justify-center"
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
 * An open position that keeps score. The unrealised P&L rolls its digits on
 * `snap` with each print — one crisp overshoot, the physics of an indicator
 * changing position — while a tint washes behind the figure in the direction
 * of the move and clears itself. Under it a scaled bar runs from a fixed zero
 * anchor: profit grows right toward the target tick, loss grows left down a
 * shorter lane at the same dollars per pixel, so neither side can flatter the
 * other, and both travel on `glide` because a quantity settles rather than
 * snaps.
 *
 * Closing is a slide. The knob rides a motion value, so no frame of the drag
 * costs a render, and as it travels the figure dims while its caption crosses
 * from "Unrealised" to "Realise" — the gesture visibly converting the number.
 * Falling short returns the knob on `snap`, crisp rather than celebratory,
 * because closing a position is not a party. The rail is a `slider`: arrows
 * step, Home releases, End crosses the detent. Under reduced motion the digits
 * swap and the bar still fills, because progress is information.
 */
export function PositionCard({
  ref,
  symbol,
  side = "long",
  size,
  entry,
  price,
  target,
  format = (value) => money.format(value),
  formatPrice = (value) => decimal.format(value),
  unitLabel = "units",
  zeroAt = 0.28,
  closed,
  defaultClosed = false,
  onClose,
  onSlideProgress,
  className,
}: PositionCardProps) {
  const motionSafe = useMotionSafe();
  const titleId = React.useId();

  const live = (price - entry) * size * (side === "long" ? 1 : -1);
  const targetPnl = Math.max(Math.abs((target - entry) * size), 0.01);

  const [uncontrolled, setUncontrolled] = React.useState(defaultClosed);
  const shut = closed ?? uncontrolled;

  // One derived snapshot covers everything a closed card needs: the rail's
  // reported position, the frozen P&L, and the reset when a parent reopens it.
  // Deriving during render (never in an effect) keeps the committed markup and
  // the state describing it from disagreeing for a frame.
  const [slide, setSlide] = React.useState<{
    shut: boolean;
    progress: number;
    realised: number | null;
  }>({ shut, progress: shut ? 1 : 0, realised: shut ? live : null });
  if (slide.shut !== shut) {
    setSlide({ shut, progress: shut ? 1 : 0, realised: shut ? live : null });
  }
  const pnl = shut && slide.realised !== null ? slide.realised : live;

  // The tint that plays belongs to the render that received the price, so the
  // print it marks is derived the same way.
  const [print, setPrint] = React.useState({ price, prev: price, n: 0 });
  if (print.price !== price) {
    setPrint({ price, prev: print.price, n: print.n + 1 });
  }
  const printed = print.price !== print.prev;
  const rose = print.price > print.prev;

  const progress = useMotionValue(shut ? 1 : 0);
  const knobX = useTransform(
    progress,
    (at) => `calc(${(at * 100).toFixed(3)}% - ${(at * KNOB).toFixed(2)}px)`,
  );
  const dimmed = useTransform(progress, [0, 1], [1, 0.5]);
  const holdFade = useTransform(progress, [0, 0.5, 1], [1, 0, 0]);
  const realiseFade = useTransform(progress, [0, 0.5, 1], [0, 0, 1]);

  const railRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    offset: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  // Reopening resets the rail. Only a motion value is touched, never state, so
  // this effect never sets state synchronously in its own body.
  React.useEffect(() => {
    if (!shut) progress.set(0);
  }, [shut, progress]);

  const travel = () =>
    Math.max((railRef.current?.clientWidth ?? KNOB * 2) - KNOB, 1);

  const report = (value: number) => {
    const bucket = Math.round(clamp(value, 0, 1) * 20) / 20;
    setSlide((now) =>
      now.progress === bucket ? now : { ...now, progress: bucket },
    );
    onSlideProgress?.(clamp(value, 0, 1));
  };

  const commit = () => {
    progress.set(1);
    setDragging(false);
    if (closed === undefined) setUncontrolled(true);
    onSlideProgress?.(1);
    onClose?.(live);
  };

  const stepTo = (next: number) => {
    const value = clamp(next, 0, 1);
    if (value >= DETENT) {
      commit();
      return;
    }
    if (motionSafe) animate(progress, value, springs.snap);
    else progress.set(value);
    report(value);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (shut || event.button !== 0 || !rail) return;
    // A delta grab, not an absolute one: pressing empty track right of the knob
    // must not teleport it, or a stray tap would close the position.
    const localX = event.clientX - rail.getBoundingClientRect().left;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      offset: progress.get() * travel() - localX,
      moved: false,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = dragRef.current;
    const rail = railRef.current;
    if (!held || !rail || held.pointerId !== event.pointerId) return;
    if (!held.moved && Math.abs(event.clientX - held.startX) > DRAG_SLOP) {
      held.moved = true;
      // Captured only once the press has become a drag; capturing on
      // pointerdown swallows the click a tap is made of.
      setCapture(event.currentTarget, event.pointerId, true);
    }
    if (!held.moved) return;
    const localX = event.clientX - rail.getBoundingClientRect().left;
    const next = clamp((localX + held.offset) / travel(), 0, 1);
    progress.set(next);
    report(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = dragRef.current;
    if (!held || held.pointerId !== event.pointerId) return;
    setCapture(event.currentTarget, event.pointerId, false);
    dragRef.current = null;
    setDragging(false);
    if (progress.get() >= DETENT) {
      commit();
      return;
    }
    if (motionSafe) animate(progress, 0, springs.snap);
    else progress.set(0);
    report(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (shut) return;
    const at = slide.progress;
    const delta = KEY_STEP[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      stepTo(at + delta);
    } else if (event.key === "Home") {
      event.preventDefault();
      stepTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      commit();
    } else if ((event.key === "Enter" || event.key === " ") && at >= 0.5) {
      event.preventDefault();
      commit();
    }
  };

  const gainRoom = 1 - zeroAt;
  // The loss lane runs at the same dollars per pixel as the gain lane, so the
  // two sides of zero stay honest about each other.
  const lossRoom = targetPnl * (zeroAt / Math.max(gainRoom, 0.01));
  const gainWidth = clamp(pnl / targetPnl, 0, 1) * gainRoom * 100;
  const lossWidth = clamp(-pnl / lossRoom, 0, 1) * zeroAt * 100;
  const reached = pnl >= targetPnl;
  const overrun = -pnl > lossRoom;

  const sign = pnl > 0 ? "+" : pnl < 0 ? "-" : "";
  const figure = `${sign}${format(Math.abs(pnl))}`;
  const basis = Math.abs(entry * size);
  const percentText = `${sign}${Math.abs(
    basis === 0 ? 0 : (pnl / basis) * 100,
  ).toFixed(2)}%`;
  const facts: [string, string][] = [
    ["Entry", formatPrice(entry)],
    ["Size", `${size} ${unitLabel}`],
    ["Value", format(Math.abs(price * size))],
  ];

  // One sentence per threshold that matters — crossing zero, the target, the
  // close — never a line per print.
  const milestone = shut
    ? `Position closed, realised ${figure}`
    : reached
      ? `Target reached, ${figure}`
      : pnl >= 0
        ? "Position in profit"
        : "Position in loss";

  const fill = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        "flex w-full flex-col gap-3.5 rounded-3 border border-hairline bg-card p-3.5 text-card-foreground",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={titleId} className="truncate font-mono text-sm font-semibold">
            {symbol}
          </h3>
          <span
            className={cn(
              "flex h-5 shrink-0 items-center rounded-1 px-1.5 font-mono text-[10px] font-medium tracking-[0.08em] uppercase",
              side === "long"
                ? "bg-cobalt-wash text-cobalt-bright"
                : "bg-muted text-muted-foreground",
            )}
          >
            {side === "long" ? "Long" : "Short"}
          </span>
        </div>
        <span className="shrink-0 font-mono text-xs text-ink-2 tabular-nums">
          Mark {formatPrice(price)}
        </span>
      </header>

      <div className="relative">
        {/* The tint sits behind the figure and is keyed by the print counter,
            so a repeated price still flashes and a re-render never does. */}
        <AnimatePresence initial={false}>
          {printed && !shut ? (
            <motion.span
              key={print.n}
              aria-hidden
              className={cn(
                "pointer-events-none absolute -inset-x-2 -inset-y-1.5 rounded-2",
                rose ? "bg-success/20" : "bg-danger/20",
              )}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0, transition: { duration: 0 } }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          ) : null}
        </AnimatePresence>

        <motion.div
          className="relative flex items-end justify-between gap-3"
          style={{ opacity: shut ? 1 : dimmed }}
        >
          <div className="flex min-w-0 flex-col gap-1">
            {/* Both captions share one grid cell, so the cross-fade cannot
                change the block's height by a pixel. */}
            <span className="grid font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <motion.span
                className="col-start-1 row-start-1"
                style={{ opacity: shut ? 0 : holdFade }}
              >
                Unrealised
              </motion.span>
              <motion.span
                className="col-start-1 row-start-1 font-medium text-ink"
                style={{ opacity: shut ? 1 : realiseFade }}
              >
                {shut ? "Realised" : "Realise"}
              </motion.span>
            </span>
            <span
              className={cn(
                "font-mono text-2xl leading-none font-semibold transition-colors",
                pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : "text-ink",
              )}
            >
              <Rolling value={figure} motionSafe={motionSafe} />
            </span>
            <span className="sr-only">
              {shut ? "Realised" : "Unrealised"} profit and loss {figure},{" "}
              {percentText}
            </span>
          </div>

          <span
            aria-hidden
            className={cn(
              "flex h-6 shrink-0 items-center rounded-2 px-2 font-mono text-xs font-medium tabular-nums transition-colors",
              pnl > 0
                ? "bg-success/12 text-success"
                : pnl < 0
                  ? "bg-danger/12 text-danger"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {percentText}
          </span>
        </motion.div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          aria-hidden
          className="relative h-2 w-full overflow-hidden rounded-full bg-hairline-strong"
        >
          <motion.span
            className="absolute inset-y-0 rounded-l-full bg-danger"
            style={{ right: `${gainRoom * 100}%` }}
            initial={false}
            animate={{ width: `${lossWidth}%` }}
            transition={fill}
          />
          <motion.span
            className={cn(
              "absolute inset-y-0 rounded-r-full transition-colors",
              reached ? "bg-success" : "bg-cobalt-bright",
            )}
            style={{ left: `${zeroAt * 100}%` }}
            initial={false}
            animate={{ width: `${gainWidth}%` }}
            transition={fill}
          />
          <span
            className="absolute inset-y-0 w-px bg-ink-3"
            style={{ left: `${zeroAt * 100}%` }}
          />
          <span
            className={cn(
              "absolute inset-y-0 right-0 w-[3px] rounded-full transition-colors",
              reached ? "bg-success" : "bg-ink-3",
            )}
          />
          {/* The flash lives on the track, not inside the fill, so a later
              re-render of the bar cannot re-trigger it. */}
          <AnimatePresence initial={false}>
            {reached ? (
              <motion.span
                key="target"
                className="absolute inset-y-0 right-0 w-2 rounded-full bg-ink"
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ) : null}
          </AnimatePresence>
          {/* The loss has outgrown its lane; the chevron says the bar is
              clipped rather than letting a capped fill imply a floor. */}
          {overrun ? (
            <span className="absolute inset-y-0 left-0 w-[3px] rounded-full bg-danger" />
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] text-ink-3 tabular-nums">
          <span>-{format(lossRoom)}</span>
          <span>Target {formatPrice(target)}</span>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {facts.map(([term, value]) => (
          <div key={term} className="flex min-w-0 flex-col gap-0.5">
            <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {term}
            </dt>
            <dd className="truncate font-mono text-xs tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {/* Rail and stamp share one 36px row, so closing swaps a control for a
          result without moving anything below it. */}
      <div className="h-9">
        {shut ? (
          <motion.div
            className="flex h-9 items-center justify-center gap-2 rounded-2 border border-dashed border-hairline-strong text-ink-2"
            initial={motionSafe ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 shrink-0 text-success"
            >
              <motion.path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
              />
            </svg>
            <span className="text-xs font-medium">Position closed</span>
          </motion.div>
        ) : (
          <div
            ref={railRef}
            role="slider"
            tabIndex={0}
            aria-label={`Slide to close ${symbol}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(slide.progress * 100)}
            aria-valuetext={`Slide to close, ${Math.round(slide.progress * 100)} percent`}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ touchAction: "pan-y" }}
            className={cn(
              "relative h-9 w-full overflow-hidden rounded-2 border border-hairline-strong bg-surface-2 select-none",
              "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 origin-left bg-cobalt-wash"
              style={{ scaleX: progress }}
            />
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center pr-2 pl-9 text-xs font-medium text-ink-3"
            >
              Slide to close
            </span>
            <motion.span
              aria-hidden
              className="absolute top-1 flex size-7 items-center justify-center rounded-2 border border-hairline-strong bg-surface-0 text-ink shadow-sm"
              style={{ left: knobX }}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5 shrink-0"
              >
                <path d="M6 3.5 10.5 8 6 12.5" />
              </svg>
            </motion.span>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {milestone}
      </p>
    </section>
  );
}
