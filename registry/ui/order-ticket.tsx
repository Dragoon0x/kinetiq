"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OrderSide = "buy" | "sell";

export type SubmittedOrder = {
  side: OrderSide;
  /** Size as a percentage of buying power. */
  percent: number;
  /** That percentage in money. */
  amount: number;
  /** That money in units of the instrument. */
  units: number;
};

export type OrderTicketProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The instrument the ticket is for. @default "BSN/USD" */
  symbol?: string;
  /** The working price the estimate is built from. */
  price: number;
  /** What 100% on the size slider is worth. */
  buyingPower: number;
  /** Controlled side. */
  side?: OrderSide;
  /** Initial side for uncontrolled usage. @default "buy" */
  defaultSide?: OrderSide;
  onSideChange?: (side: OrderSide) => void;
  /** Controlled size, 0–100. */
  sizePercent?: number;
  /** Initial size for uncontrolled usage. @default 25 */
  defaultSizePercent?: number;
  onSizePercentChange?: (percent: number) => void;
  /** Percentages the thumb is drawn to. @default [25, 50, 75, 100] */
  detents?: number[];
  /** How near a detent a release must land, in percent, to be pulled in. @default 6 */
  snapWithin?: number;
  /** Turns money into its printed string. */
  format?: (value: number) => string;
  /** Unit for the estimated quantity. @default "BSN" */
  unitLabel?: string;
  /** Fires once from the gesture or key that completed the submit track. */
  onSubmit?: (order: SubmittedOrder) => void;
  /** Milliseconds the track holds its sent state before re-arming; 0 holds it. @default 2200 */
  submittedFor?: number;
  /** Locks the toggle, the slider and the track. */
  disabled?: boolean;
  className?: string;
};

/** Explicit locale: a server and a client formatting differently would be a
 *  hydration mismatch on the number the trader is about to commit to. */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number) => money.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const DEFAULT_DETENTS = [25, 50, 75, 100];
/** Pointer travel before capture: capturing on pointerdown eats plain clicks. */
const CAPTURE_PX = 4;
/** Past this much of the submit track the gesture has been meant. */
const COMMIT = 0.85;
/** Thumb plus its inset, on both ends of the submit track. */
const SLIDE_INSET = 44;
const STILL = { duration: 0 } as const;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

const sideName = (option: OrderSide) => (option === "buy" ? "Buy" : "Sell");

type Grab = { x: number; from: number; held: boolean };

/**
 * The estimate rolls its columns on `snap` — one crisp overshoot, an indicator
 * taking a new position. Hidden from assistive technology: the slider's
 * `aria-valuetext` already speaks the same figure as a sentence.
 */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a place.
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
              transition={motionSafe ? springs.snap : STILL}
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

/**
 * One drag contract for both tracks: 1:1 with the pointer, with capture taken
 * only after 4px of travel and always inside a try/catch, so a plain click is
 * never swallowed and a synthetic sweep through the ticket cannot throw.
 */
function useDragTrack(config: {
  enabled: boolean;
  at: () => number;
  travel: number;
  span: number;
  onMove: (value: number) => void;
  onDragging: (dragging: boolean) => void;
  onRelease: (dragged: boolean) => void;
  onPress?: (event: React.PointerEvent) => number | null;
}) {
  // The grab record lives inside the hook, so each track owns its own: a press
  // that began on the slider can never be finished by a move that wandered
  // over the submit thumb, and no ref crosses a render boundary.
  const grab = React.useRef<Grab | null>(null);
  const { enabled, travel, span } = config;
  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (!enabled || event.button !== 0) return;
      (event.currentTarget as HTMLElement).focus();
      const pressed = config.onPress?.(event) ?? null;
      if (pressed !== null) config.onMove(pressed);
      grab.current = {
        x: event.clientX,
        from: pressed ?? config.at(),
        held: false,
      };
    },
    onPointerMove: (event: React.PointerEvent) => {
      const from = grab.current;
      if (!from || !enabled) return;
      const dx = event.clientX - from.x;
      if (!from.held) {
        if (Math.abs(dx) < CAPTURE_PX) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A synthetic sweep has no live pointer to capture; tracking is
          // unaffected, so the drag must not throw here.
        }
        from.held = true;
        config.onDragging(true);
      }
      if (travel <= 0) return;
      config.onMove(from.from + (dx / travel) * span);
    },
    onPointerUp: (event: React.PointerEvent) => {
      const from = grab.current;
      if (!from) return;
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Already released — nothing to give back.
      }
      grab.current = null;
      config.onDragging(false);
      config.onRelease(from.held);
    },
    onPointerCancel: () => {
      const from = grab.current;
      grab.current = null;
      config.onDragging(false);
      if (from) config.onRelease(false);
    },
  };
}

/**
 * The ticket you fill before you send. The side toggle's knob crosses half the
 * card on `glide` — a layout-scale move rather than a switch flipping in place,
 * so it settles without overshoot and carries the ticket's accent with it. The
 * size slider tracks the pointer one to one and, on release, is drawn to the
 * nearest detent on `snap`: a detent is a magnet and should feel like one, and
 * it is the only overshoot in the ticket. The estimated cost rolls its digits
 * beneath it on the same spring.
 *
 * Submitting is a track, not a tap. The thumb follows the pointer, the fill
 * follows the thumb in the side's colour, and past 85% of the travel it lands
 * on `flick` and sends; released short of that it returns on `snap`, because
 * the refusal has to be carried by the same physics that brought it.
 *
 * Every gesture has a key: the side is a radio group driven by Left and Right,
 * the slider takes Arrows for one percent and PageUp/PageDown for the next
 * detent, and the track takes ArrowRight, End, then Enter. Both tracks measure
 * their own width with a ResizeObserver, so the thumbs travel correctly at any
 * container size. Under reduced motion the knob swaps and the thumbs move
 * without physics — where a gesture got to is information, not flourish.
 */
export function OrderTicket({
  ref,
  symbol = "BSN/USD",
  price,
  buyingPower,
  side,
  defaultSide = "buy",
  onSideChange,
  sizePercent,
  defaultSizePercent = 25,
  onSizePercentChange,
  detents = DEFAULT_DETENTS,
  snapWithin = 6,
  format = defaultFormat,
  unitLabel = "BSN",
  onSubmit,
  submittedFor = 2200,
  disabled = false,
  className,
}: OrderTicketProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [sideState, setSideState] = React.useState(defaultSide);
  const [percentState, setPercentState] = React.useState(defaultSizePercent);
  const [sizeTravel, setSizeTravel] = React.useState(0);
  const [slideTravel, setSlideTravel] = React.useState(0);
  const [sizeDragging, setSizeDragging] = React.useState(false);
  const [slideDragging, setSlideDragging] = React.useState(false);
  const [slid, setSlid] = React.useState(0);
  const [sent, setSent] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  const sideRefs = React.useRef<Record<OrderSide, HTMLButtonElement | null>>({
    buy: null,
    sell: null,
  });
  const sizeRef = React.useRef<HTMLDivElement | null>(null);
  const slideRef = React.useRef<HTMLDivElement | null>(null);

  const currentSide = side ?? sideState;
  const percent = clamp(sizePercent ?? percentState, 0, 100);
  const amount = (buyingPower * percent) / 100;
  const units = price > 0 ? amount / price : 0;
  const buying = currentSide === "buy";
  const live = !disabled && !sent;
  const unitText = units.toFixed(2);
  const sideLabel = buying ? "Buy" : "Sell";
  const accent = buying ? "text-success" : "text-danger";
  const knobTone = (option: OrderSide) =>
    option === "buy"
      ? "border-success/30 bg-success/14"
      : "border-danger/30 bg-danger/14";

  const sizeMove = motionSafe && !sizeDragging ? springs.snap : STILL;
  const slideMove =
    motionSafe && !slideDragging
      ? sent
        ? springs.flick
        : springs.snap
      : STILL;

  // Both tracks measure themselves, so the thumbs travel correctly at 342px and
  // at 448px. The observer's own callback carries the measurement, so no width
  // is ever read synchronously inside an effect body.
  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (entry.target === sizeRef.current) setSizeTravel(Math.max(0, width));
        if (entry.target === slideRef.current)
          setSlideTravel(Math.max(0, width - SLIDE_INSET));
      }
    });
    if (sizeRef.current) observer.observe(sizeRef.current);
    if (slideRef.current) observer.observe(slideRef.current);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!sent || submittedFor <= 0) return;
    const timer = window.setTimeout(() => {
      setSent(false);
      setSlid(0);
    }, submittedFor);
    return () => window.clearTimeout(timer);
  }, [sent, submittedFor]);

  const pickSide = (next: OrderSide) => {
    if (next === currentSide || disabled) return;
    if (side === undefined) setSideState(next);
    onSideChange?.(next);
    // Roving tabindex: focus follows the selection, or an arrow key would
    // leave focus stranded on a stop that is no longer tabbable.
    sideRefs.current[next]?.focus();
  };

  const setPercent = (next: number) => {
    const rounded = clamp(Math.round(next), 0, 100);
    if (rounded === percent) return;
    if (sizePercent === undefined) setPercentState(rounded);
    onSizePercentChange?.(rounded);
  };

  /** The magnet: a release inside `snapWithin` of a detent is pulled in. */
  const settleSize = () => {
    const near = detents.reduce(
      (best, detent) =>
        Math.abs(detent - percent) < Math.abs(best - percent) ? detent : best,
      detents[0] ?? 0,
    );
    if (Math.abs(near - percent) <= snapWithin) setPercent(near);
  };

  const stepDetent = (direction: 1 | -1) => {
    const ordered = [...detents].sort((a, b) => a - b);
    const next =
      direction > 0
        ? ordered.find((detent) => detent > percent)
        : [...ordered].reverse().find((detent) => detent < percent);
    setPercent(next ?? (direction > 0 ? 100 : 0));
  };

  const send = () => {
    if (!live) return;
    setSent(true);
    setSlid(1);
    setNotice(
      `${sideLabel} order sent: ${unitText} ${unitLabel} for ${format(amount)}`,
    );
    onSubmit?.({ side: currentSide, percent, amount, units });
  };

  const sizeDrag = useDragTrack({
    enabled: !disabled,
    at: () => percent,
    travel: sizeTravel,
    span: 100,
    onMove: setPercent,
    onDragging: setSizeDragging,
    onRelease: () => settleSize(),
    // A press anywhere on the track is a position, not just a handle. The rect
    // is read from the event, never during a render.
    onPress: (event) => {
      const rect = sizeRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return null;
      return clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    },
  });

  const slideDrag = useDragTrack({
    enabled: live,
    at: () => slid,
    travel: slideTravel,
    span: 1,
    onMove: (value) => setSlid(clamp(value, 0, 1)),
    onDragging: setSlideDragging,
    onRelease: (dragged) => {
      if (!dragged) return;
      if (slid >= COMMIT) send();
      else setSlid(0);
    },
  });

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{symbol}</span>
        <span className="shrink-0 font-mono text-xs text-ink-2 tabular-nums">
          {format(price)}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Order side"
        className="grid h-9 grid-cols-2 gap-1 rounded-2 border border-hairline bg-surface-2 p-1"
      >
        {(["buy", "sell"] as const).map((option) => {
          const checked = option === currentSide;
          return (
            <button
              key={option}
              type="button"
              ref={(node) => {
                sideRefs.current[option] = node;
              }}
              role="radio"
              aria-checked={checked}
              disabled={disabled}
              tabIndex={checked ? 0 : -1}
              onClick={() => pickSide(option)}
              onKeyDown={(event) => {
                const forward = ["ArrowRight", "ArrowDown", "End"];
                const back = ["ArrowLeft", "ArrowUp", "Home"];
                if (forward.includes(event.key)) pickSide("sell");
                else if (back.includes(event.key)) pickSide("buy");
                else return;
                event.preventDefault();
              }}
              className={cn(
                "relative flex items-center justify-center rounded-2 text-sm font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? option === "buy"
                    ? "text-success"
                    : "text-danger"
                  : "text-ink-3 hover:text-foreground",
              )}
            >
              {/* One knob with a shared layoutId travels between the stops;
                  without motion it is simply the stop's own background. */}
              {checked ? (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? `${baseId}-knob` : undefined}
                  transition={springs.glide}
                  className={cn(
                    "absolute inset-0 rounded-2 border",
                    knobTone(option),
                  )}
                />
              ) : null}
              <span className="relative">{sideName(option)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span id={`${baseId}-size`} className="text-xs text-ink-2">
            Size
          </span>
          <span className="shrink-0 font-mono text-xs text-ink tabular-nums">
            {Math.round(percent)}%
          </span>
        </div>

        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={`${baseId}-size`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-valuetext={`${Math.round(percent)} percent, ${unitText} ${unitLabel}, ${format(amount)}`}
          aria-disabled={disabled || undefined}
          {...sizeDrag}
          onKeyDown={(event) => {
            if (disabled) return;
            const { key } = event;
            if (key === "ArrowRight" || key === "ArrowUp")
              setPercent(percent + 1);
            else if (key === "ArrowLeft" || key === "ArrowDown")
              setPercent(percent - 1);
            else if (key === "PageUp") stepDetent(1);
            else if (key === "PageDown") stepDetent(-1);
            else if (key === "Home") setPercent(0);
            else if (key === "End") setPercent(100);
            else return;
            event.preventDefault();
          }}
          className={cn(
            "relative flex h-9 touch-none items-center rounded-2 outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
          )}
        >
          <div
            ref={sizeRef}
            className="relative h-1.5 w-full rounded-full border border-hairline bg-surface-2"
          >
            <motion.span
              aria-hidden
              className={cn(
                "absolute inset-0 origin-left rounded-full",
                buying ? "bg-success" : "bg-danger",
              )}
              initial={false}
              animate={{ scaleX: percent / 100 }}
              transition={sizeMove}
            />
            {detents.map((detent) => (
              <span
                key={detent}
                aria-hidden
                style={{ left: `${detent}%` }}
                className="absolute top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-hairline-strong"
              />
            ))}
          </div>
          {/* The thumb is centred by a flex wrapper rather than a translate
              utility, so nothing else competes for its transform. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center"
          >
            <motion.span
              className="block size-5 rounded-full border border-hairline-strong bg-surface-0 shadow-sm"
              style={{ marginLeft: -10 }}
              initial={false}
              animate={{ x: (percent / 100) * sizeTravel }}
              transition={sizeMove}
            />
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {detents.map((detent) => (
            <button
              key={detent}
              type="button"
              disabled={disabled}
              aria-pressed={Math.round(percent) === detent}
              onClick={() => setPercent(detent)}
              className={cn(
                "flex h-7 items-center justify-center rounded-2 border border-hairline font-mono text-[11px] transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                Math.round(percent) === detent
                  ? "bg-surface-2 text-foreground"
                  : "text-ink-3 hover:bg-accent hover:text-foreground",
              )}
            >
              {detent === 100 ? "Max" : `${detent}%`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2 border border-hairline bg-surface-2 px-3 py-2.5">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px] text-ink-2">Estimated cost</span>
          <span className="truncate font-mono text-[11px] text-ink-3 tabular-nums">
            {unitText} {unitLabel}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-lg leading-none font-medium",
            accent,
          )}
        >
          <span className="sr-only">{format(amount)}</span>
          <Rolling text={format(amount)} motionSafe={motionSafe} />
        </span>
      </div>

      <div
        ref={slideRef}
        className="relative h-11 w-full rounded-full border border-hairline bg-surface-2 select-none"
      >
        <motion.span
          aria-hidden
          className={cn(
            "absolute top-0 bottom-0 left-0 rounded-full opacity-20",
            buying ? "bg-success" : "bg-danger",
          )}
          initial={false}
          animate={{ width: slid * slideTravel + SLIDE_INSET }}
          transition={slideMove}
        />
        {/* Only the copy is clipped: overflow-hidden on the track itself would
            cut the thumb's focus ring off at the rail. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden px-12">
          {/* The copy fades under the thumb as the gesture covers it, and the
              sent line arrives in its place once the track has landed. */}
          <motion.span
            className={cn(
              "min-w-0 truncate font-mono text-[11px] tracking-[0.08em] uppercase",
              sent ? accent : "text-ink-3",
            )}
            initial={false}
            animate={{ opacity: sent ? 1 : Math.max(0, 1 - slid * 1.8) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {sent ? "Order sent" : `Slide to ${sideLabel.toLowerCase()}`}
          </motion.span>
        </div>

        <motion.div
          role="slider"
          tabIndex={live ? 0 : -1}
          aria-label={`Submit ${sideLabel.toLowerCase()} order, ${unitText} ${unitLabel}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(slid * 100)}
          aria-valuetext={
            sent ? "Order sent" : `${Math.round(slid * 100)} percent slid`
          }
          aria-disabled={!live || undefined}
          {...slideDrag}
          onKeyDown={(event) => {
            if (!live) return;
            const { key } = event;
            if (key === "ArrowRight" || key === "ArrowUp")
              setSlid(clamp(slid + 0.1, 0, 1));
            else if (key === "ArrowLeft" || key === "ArrowDown")
              setSlid(clamp(slid - 0.1, 0, 1));
            else if (key === "Home" || key === "Escape") setSlid(0);
            else if (key === "End") setSlid(1);
            // Enter lands the order only once the track has actually been slid.
            else if (key === "Enter" || key === " ") {
              if (slid >= COMMIT) send();
            } else return;
            event.preventDefault();
          }}
          initial={false}
          animate={{ x: slid * slideTravel }}
          transition={slideMove}
          className={cn(
            "absolute top-1 left-1 flex size-9 touch-none items-center justify-center rounded-full outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            buying ? "bg-success" : "bg-danger",
            "text-background",
            live ? "cursor-grab active:cursor-grabbing" : "cursor-default",
          )}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0"
          >
            <path d={sent ? "M6 12L10 16L18 8" : "M9 7L14 12L9 17"} />
          </svg>
        </motion.div>
      </div>

      <p className="text-center font-mono text-[10px] text-ink-3 tabular-nums">
        Buying power {format(buyingPower)}
      </p>

      <span aria-live="polite" className="sr-only">
        {notice}
      </span>
    </div>
  );
}
