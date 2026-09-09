"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LoanSliderProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled loan amount. */
  value?: number;
  /** Initial amount for uncontrolled usage. @default min */
  defaultValue?: number;
  /** Fires from the drag, click or key that moved the amount. */
  onValueChange?: (amount: number) => void;
  /** Smallest amount on offer. @default 1000 */
  min?: number;
  /** Largest amount on offer; also scales the cost rail. @default 25000 */
  max?: number;
  /** Amount per arrow key and drag snap; Page keys move ten. @default 250 */
  step?: number;
  /** Term chips, in months. @default [12, 24, 36, 48, 60] */
  terms?: number[];
  /** Controlled term in months. */
  term?: number;
  /** Initial term for uncontrolled usage. @default the middle chip */
  defaultTerm?: number;
  /** Fires from the click or key that picked a term. */
  onTermChange?: (months: number) => void;
  /** Annual rate in percent; drives the amortised payment. */
  apr: number;
  /** Formats every amount the control prints. */
  format?: (value: number) => string;
  /** Names the slider; printed above it. @default "Loan amount" */
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

const DEFAULT_TERMS = [12, 24, 36, 48, 60];

/** Pointer travel before a press becomes a drag, so plain clicks survive. */
const SLOP = 4;

/** Arrow keys move one step; Page keys move ten. Home and End are apart. */
const KEY_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageUp: 10,
  PageDown: -10,
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

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

type RolledMoneyProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * A figure that counts to its new value on `glide` through a motion value, so
 * the roll runs outside React and re-renders nothing. Hidden from assistive
 * technology: the status sentence already carries every figure, once.
 */
function RolledMoney({
  value,
  format,
  motionSafe,
  className,
}: RolledMoneyProps) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(latest));

  React.useEffect(() => {
    // Reduced motion still reports the figure — only the travel is dropped.
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

/**
 * Borrow more; pay more each month. One slider for the amount and a row of
 * chips for the term, with the cost of the answer printed live beneath them.
 * The thumb tracks a drag with `duration: 0` — direct manipulation must never
 * lag the hand — while a click, a key or a term chip sends it to its new
 * position on `snap`, an indicator taking a position with one crisp overshoot.
 * The monthly payment counts to each new value on `glide` through a motion
 * value, and the cost rail beneath — principal in cobalt, total interest in
 * warn, both scaled against the dearest loan the control can express — grows
 * on `glide` as the amount rises and lengthens its warn share as the term
 * stretches, which is the whole point of the instrument.
 *
 * The track is a `role="slider"`: arrows step, Page keys move ten, Home and End
 * reach the ends. The terms are a radio group with a roving tabindex. Capture is
 * taken only after 4px of travel, so a plain click sets the amount. Under
 * reduced motion nothing springs, but the figures still change and the rail
 * still fills, because what a loan costs is information.
 */
export function LoanSlider({
  ref,
  value,
  defaultValue,
  onValueChange,
  min = 1000,
  max = 25000,
  step = 250,
  terms = DEFAULT_TERMS,
  term,
  defaultTerm,
  onTermChange,
  apr,
  format = defaultFormat,
  label = "Loan amount",
  className,
}: LoanSliderProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const termLabelId = `${baseId}-term-label`;
  const knobId = `${baseId}-knob`;

  const [uncontrolled, setUncontrolled] = React.useState<number>(
    defaultValue ?? min,
  );
  const isControlled = value !== undefined;
  const amount = clamp(isControlled ? value : uncontrolled, min, max);

  const [uncontrolledTerm, setUncontrolledTerm] = React.useState<number>(
    defaultTerm ?? terms[Math.floor(terms.length / 2)] ?? 12,
  );
  const isTermControlled = term !== undefined;
  const months = isTermControlled ? term : uncontrolledTerm;
  const termIndex = Math.max(0, terms.indexOf(months));

  const [dragging, setDragging] = React.useState(false);
  const gesture = React.useRef<{
    id: number;
    startX: number;
    dragging: boolean;
    rect: DOMRect;
  } | null>(null);

  const span = max > min ? max - min : 1;
  const fraction = (amount - min) / span;

  const payment = monthlyPayment(amount, apr, months);
  const interest = Math.max(0, payment * months - amount);
  const total = amount + interest;

  // The rail's full width is the dearest loan on offer, so the same pixel
  // means the same money whichever amount and term are chosen.
  const longest = terms.reduce((best, item) => Math.max(best, item), 1);
  const dearest = monthlyPayment(max, apr, longest) * longest;
  const railSpan = dearest > 0 ? dearest : 1;
  const principalShare = clamp(amount / railSpan, 0, 1);
  const interestShare = clamp(interest / railSpan, 0, 1 - principalShare);

  const snapToStep = (raw: number) =>
    clamp(min + Math.round((raw - min) / step) * step, min, max);

  const commit = (next: number) => {
    const snapped = snapToStep(next);
    if (snapped === amount) return;
    if (!isControlled) setUncontrolled(snapped);
    onValueChange?.(snapped);
  };

  const selectTerm = (next: number) => {
    if (next === months) return;
    if (!isTermControlled) setUncontrolledTerm(next);
    onTermChange?.(next);
  };

  const amountFromClientX = (clientX: number) => {
    const rect = gesture.current?.rect;
    if (!rect || rect.width === 0) return amount;
    return min + clamp((clientX - rect.left) / rect.width, 0, 1) * span;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dragging: false,
      rect: event.currentTarget.getBoundingClientRect(),
    };
    event.currentTarget.focus();
    commit(amountFromClientX(event.clientX));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      setDragging(true);
      try {
        // Capture only once the press has become a drag — and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    commit(amountFromClientX(event.clientX));
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const move = KEY_STEPS[event.key];
    const next =
      move !== undefined
        ? amount + move * step
        : event.key === "Home"
          ? min
          : event.key === "End"
            ? max
            : null;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const focusTerm = (index: number) => {
    const target = terms[clamp(index, 0, terms.length - 1)];
    if (target === undefined) return;
    document.getElementById(`${baseId}-term-${target}`)?.focus();
    selectTerm(target);
  };

  const handleTermKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTerm(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTerm(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTerm(0);
        break;
      case "End":
        event.preventDefault();
        focusTerm(terms.length - 1);
        break;
      case " ":
        event.preventDefault();
        selectTerm(terms[index] ?? months);
        break;
      default:
        break;
    }
  };

  // What you hold is instant; what answers is sprung.
  const thumbMove = dragging || !motionSafe ? { duration: 0 } : springs.snap;
  const railMove = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  const spoken = `${format(amount)} over ${months} months at ${apr} percent: ${format(payment)} a month, ${format(interest)} interest, ${format(total)} repaid`;
  // A live region that changed on every frame of a drag would babble, so the
  // announcement holds at the last settled quote and catches up on release.
  const [announced, setAnnounced] = React.useState(spoken);
  if (!dragging && announced !== spoken) setAnnounced(spoken);

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-4", className)}>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span id={labelId} className="min-w-0 truncate text-sm font-medium">
            {label}
          </span>
          <RolledMoney
            value={amount}
            format={format}
            motionSafe={motionSafe}
            className="shrink-0 text-sm font-semibold text-ink"
          />
        </div>

        {/* The thumb is centred on its value, so the track is inset by the
            thumb's radius: at min and max it reaches the component's edge and
            never past it. */}
        <div className="px-2">
          <div
            role="slider"
            tabIndex={0}
            aria-labelledby={labelId}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={amount}
            aria-valuetext={format(amount)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onLostPointerCapture={endGesture}
            onPointerLeave={(event) => {
              // A press that wanders off before it becomes a drag would
              // otherwise never see its own pointerup.
              if (gesture.current?.dragging === false) endGesture(event);
            }}
            onKeyDown={handleKeyDown}
            className="relative h-6 w-full cursor-pointer touch-none rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-hairline-strong">
              <motion.span
                className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-cobalt-bright"
                initial={false}
                animate={{ scaleX: fraction }}
                transition={thumbMove}
              />
            </span>
            <motion.span
              aria-hidden
              className={cn(
                "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cobalt-bright bg-surface-0 shadow-sm transition-colors",
                dragging && "bg-cobalt-wash",
              )}
              initial={false}
              animate={{ left: `${fraction * 100}%` }}
              transition={thumbMove}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span id={termLabelId} className="text-[11px] text-ink-3">
          Term
        </span>
        <div
          role="radiogroup"
          aria-labelledby={termLabelId}
          className="flex h-9 items-stretch rounded-2 border border-hairline bg-surface-2 p-1"
        >
          {terms.map((item, index) => {
            const checked = index === termIndex;
            return (
              <button
                key={item}
                id={`${baseId}-term-${item}`}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => selectTerm(item)}
                onKeyDown={(event) => handleTermKeyDown(event, index)}
                className={cn(
                  "relative flex min-w-0 flex-1 items-center justify-center rounded-1 px-1 text-xs font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  checked
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {checked ? (
                  <motion.span
                    aria-hidden
                    // Without the layoutId the knob simply appears at its stop.
                    layoutId={motionSafe ? knobId : undefined}
                    transition={springs.snap}
                    className="absolute inset-0 rounded-1 border border-hairline bg-surface-0 shadow-sm"
                  />
                ) : null}
                <span className="relative whitespace-nowrap tabular-nums">
                  {item} mo
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3">
        <div className="flex items-end justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] text-ink-3">Monthly</span>
            <RolledMoney
              value={payment}
              format={format}
              motionSafe={motionSafe}
              className="text-xl leading-none font-semibold text-ink"
            />
          </span>
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-[11px] text-ink-3">Total repaid</span>
            <RolledMoney
              value={total}
              format={format}
              motionSafe={motionSafe}
              className="text-sm leading-none font-medium text-ink-2"
            />
          </span>
        </div>

        <span
          aria-hidden
          className="relative mt-1 block h-2.5 w-full overflow-hidden rounded-full bg-hairline-strong"
        >
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
            initial={false}
            animate={{ width: `${principalShare * 100}%` }}
            transition={railMove}
          />
          <motion.span
            className="absolute inset-y-0 rounded-r-full bg-warn"
            initial={false}
            animate={{
              left: `${principalShare * 100}%`,
              width: `${interestShare * 100}%`,
            }}
            transition={railMove}
          />
        </span>

        <div
          aria-hidden
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-2"
        >
          <span className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full bg-cobalt-bright" />
            Principal
            <span className="font-mono text-ink tabular-nums">
              {format(amount)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full bg-warn" />
            Interest
            <span className="font-mono text-ink tabular-nums">
              {format(interest)}
            </span>
          </span>
        </div>
      </div>

      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
