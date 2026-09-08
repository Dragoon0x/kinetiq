"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TradeConfirmProps = {
  /** Controlled visibility. */
  open?: boolean;
  /** Initial visibility for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, key or confirm that changed it. */
  onOpenChange?: (open: boolean) => void;
  /** Order side; colours the header chip. @default "buy" */
  side?: "buy" | "sell";
  /** Instrument code. */
  symbol: string;
  /** Units on the order. */
  size: number;
  /** The held quote. A new value rolls the digits and restarts the hold. */
  price: number;
  /** Added to the total. @default 0 */
  fee?: number;
  /** Milliseconds the quote holds before it expires. @default 12000 */
  holdMs?: number;
  /** Formats money. */
  format?: (value: number) => string;
  /** Formats the quote. */
  formatPrice?: (value: number) => string;
  /** Noun after the size. @default "units" */
  unitLabel?: string;
  /** Fires from the press that confirmed. */
  onConfirm?: (price: number) => void;
  /** Fires from the press that asked for a new quote. */
  onRefresh?: () => void;
  /** Fires from the ring's completion. */
  onExpire?: () => void;
  className?: string;
};

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
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** How long the placed stamp stays legible before the sheet leaves. */
const PLACED_HOLD_MS = 800;

const BUTTON =
  "flex h-9 items-center justify-center gap-2 rounded-2 px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none";

/**
 * Each digit column is a ten-face strip moved by a percentage of its own
 * height, so one `y` is exactly one digit — two keyframes, all a spring may
 * carry. Hidden from assistive technology; the sheet says the quote in a
 * sentence of its own.
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

type PanelProps = Omit<
  TradeConfirmProps,
  "open" | "defaultOpen" | "onOpenChange" | "className"
> & { onClose: () => void };

/**
 * The panel is its own component so that opening mounts a fresh hold: a second
 * review is a second panel, never a stale one carrying the last countdown.
 */
function ConfirmPanel({
  side = "buy",
  symbol,
  size,
  price,
  fee = 0,
  holdMs = 12000,
  format = (value) => money.format(value),
  formatPrice = (value) => decimal.format(value),
  unitLabel = "units",
  onConfirm,
  onRefresh,
  onExpire,
  onClose,
}: PanelProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const totalId = `${baseId}-total`;

  const panelRef = React.useRef<HTMLDivElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const expireRef = React.useRef(onExpire);
  React.useEffect(() => {
    expireRef.current = onExpire;
  });

  // A new quote resets the hold. Derived during render, so the markup and the
  // state describing it never disagree for a frame.
  const [hold, setHold] = React.useState({ price, expired: false });
  if (hold.price !== price) setHold({ price, expired: false });
  const expired = hold.expired;

  const [paused, setPaused] = React.useState(false);
  const [placed, setPlaced] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(
    Math.ceil(holdMs / 1000),
  );

  // 1 → 0 across the hold. Holding the remainder in a motion value is what
  // makes pausing free: stop it, resume from what is left, no render between.
  const remaining = useMotionValue(1);
  const ringOffset = useTransform(remaining, (value) => 1 - value);

  useMotionValueEvent(remaining, "change", (value) => {
    const left = Math.max(0, Math.ceil((value * holdMs) / 1000));
    setSecondsLeft((current) => (current === left ? current : left));
  });

  // Declared before the ticker so a refreshed quote refills the ring before the
  // ticker reads what is left of it.
  React.useEffect(() => {
    remaining.set(1);
  }, [price, remaining]);

  React.useEffect(() => {
    if (expired || paused || placed || holdMs <= 0) return;
    const controls = animate(remaining, 0, {
      // A countdown is information, not flourish, so it drains at the same
      // linear rate whether or not rich motion is welcome.
      duration: (holdMs / 1000) * remaining.get(),
      ease: easings.linear,
      onComplete: () => {
        setHold((current) => ({ ...current, expired: true }));
        expireRef.current?.();
      },
    });
    return () => controls.stop();
  }, [expired, paused, placed, holdMs, remaining]);

  // A quote must not run out on a screen nobody is watching.
  React.useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!placed) return;
    const timer = window.setTimeout(onClose, PLACED_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [placed, onClose]);

  // Focus enters on the confirm button and returns to whatever opened the
  // sheet when it leaves — the cleanup runs on close as well as unmount.
  React.useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => confirmRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const stops = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((node) => node.tabIndex >= 0);
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const total = price * size + fee;
  const notice = placed
    ? "Order placed"
    : expired
      ? "Quote expired"
      : secondsLeft <= 3
        ? "Quote expires in under three seconds"
        : secondsLeft <= 10 && holdMs > 10000
          ? "Quote expires in under ten seconds"
          : "";

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={totalId}
      onKeyDown={handleKeyDown}
      initial={
        motionSafe ? { opacity: 0, y: distances.shift } : { opacity: 0, y: 0 }
      }
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 0, transition: exitFor() }}
      transition={
        motionSafe
          ? { ...springs.glide, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
      className="pointer-events-auto absolute inset-x-3 bottom-3 flex flex-col gap-3 rounded-3 border border-hairline-strong bg-popover p-3 text-popover-foreground shadow-raised"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="min-w-0 truncate text-sm font-semibold">
          Confirm order
        </h2>
        <span
          className={cn(
            "flex h-5 shrink-0 items-center rounded-1 px-1.5 font-mono text-[10px] font-medium tracking-[0.08em] uppercase",
            side === "buy"
              ? "bg-cobalt-wash text-cobalt-bright"
              : "bg-danger/14 text-danger",
          )}
        >
          {side} {symbol}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <svg viewBox="0 0 24 24" aria-hidden className="size-9 shrink-0">
          <circle
            cx="12"
            cy="12"
            r="9.5"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.18"
            strokeWidth="2.5"
          />
          <motion.circle
            cx="12"
            cy="12"
            r="9.5"
            fill="none"
            className={expired ? "text-danger" : "text-cobalt-bright"}
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            transform="rotate(-90 12 12)"
            style={{ strokeDashoffset: ringOffset }}
          />
        </svg>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Quote
          </span>
          <span
            className={cn(
              "font-mono text-xl leading-none font-semibold transition-colors",
              expired ? "text-ink-3" : "text-ink",
            )}
          >
            <Rolling value={formatPrice(price)} motionSafe={motionSafe} />
          </span>
        </div>

        <div className="shrink-0 text-right">
          <span className="block font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Size
          </span>
          <span className="block font-mono text-xs tabular-nums">
            {size} {unitLabel}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 border-t border-hairline pt-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fee
          </dt>
          <dd className="truncate font-mono text-xs tabular-nums">
            {format(fee)}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 text-right">
          <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Total
          </dt>
          <dd
            id={totalId}
            className={cn(
              "truncate font-mono text-sm font-semibold tabular-nums transition-colors",
              expired ? "text-ink-3" : "text-ink",
            )}
          >
            {format(total)}
          </dd>
        </div>
      </dl>

      {/* The hold line always carries text, so the refresh control joining it
          on expiry changes nothing about the sheet's height. */}
      <div className="flex h-8 items-center justify-between gap-2">
        <span
          aria-hidden
          className={cn(
            "min-w-0 truncate font-mono text-[11px] tabular-nums",
            expired ? "text-danger" : "text-ink-3",
          )}
        >
          {placed
            ? "Sending to Basinworks"
            : expired
              ? "Quote expired"
              : `Quote holds ${secondsLeft}s`}
        </span>
        <AnimatePresence initial={false}>
          {expired && !placed ? (
            <motion.button
              key="refresh"
              type="button"
              onClick={onRefresh}
              initial={
                motionSafe
                  ? { opacity: 0, x: distances.step }
                  : { opacity: 0, x: 0 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
              className={cn(
                BUTTON,
                "h-8 shrink-0 border border-hairline-strong hover:bg-accent",
              )}
            >
              Refresh quote
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={placed}
          className={cn(
            BUTTON,
            "border border-hairline-strong hover:bg-accent disabled:opacity-50",
          )}
        >
          Cancel
        </button>
        <button
          ref={confirmRef}
          type="button"
          disabled={expired || placed}
          onClick={() => {
            setPlaced(true);
            onConfirm?.(price);
          }}
          className={cn(
            BUTTON,
            "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40",
          )}
        >
          {placed ? (
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 shrink-0"
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
          ) : null}
          {placed ? "Placed" : "Confirm"}
        </button>
      </div>

      <p className="sr-only">
        {side} {size} {unitLabel} of {symbol} at {formatPrice(price)}, fee{" "}
        {format(fee)}, total {format(total)}
      </p>
      {/* One sentence per threshold, never a line per second. */}
      <p role="status" className="sr-only">
        {notice}
      </p>
    </motion.div>
  );
}

/**
 * The last look at the number. The sheet rises inside its own frame on
 * `glide` — the spring for a surface arriving, never a bounce, because there
 * is nothing to celebrate until the order is placed — and a ring beside the
 * quote drains linearly across the hold from a motion value, so pausing costs
 * no render and the seconds reach state only when the whole second turns.
 * Hiding the tab stops the drain: a quote must not expire on a screen nobody
 * is watching.
 *
 * When the ring empties the sheet expires in place — quote and total dim, the
 * confirm button disables rather than disappearing so the tab order never
 * shifts under a keyboard user, and a refresh control slides into the hold
 * line, which already carries text and so reserves no height. A new `price`
 * rolls the digits on `snap` and refills the ring. It is a real modal: focus
 * enters on Confirm, Tab cycles inside, Escape cancels, and focus returns to
 * whatever opened it. Renders absolutely inside the nearest positioned
 * ancestor — give the surface it belongs to `relative`.
 */
export function TradeConfirm({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
  ...panel
}: TradeConfirmProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  const close = React.useCallback(() => {
    if (controlledOpen === undefined) setUncontrolledOpen(false);
    onOpenChange?.(false);
  }, [controlledOpen, onOpenChange]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-30 overflow-hidden",
        className,
      )}
    >
      <AnimatePresence>
        {open ? (
          <motion.button
            key="scrim"
            type="button"
            // Out of the tab order: the panel's own trap is the only way
            // around the sheet, and Cancel is already a stop inside it.
            tabIndex={-1}
            aria-label="Cancel order"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
            className="pointer-events-auto absolute inset-0 cursor-default bg-background/65"
          />
        ) : null}
        {open ? <ConfirmPanel key="panel" {...panel} onClose={close} /> : null}
      </AnimatePresence>
    </div>
  );
}
