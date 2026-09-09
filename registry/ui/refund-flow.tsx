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
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RefundFlowProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The original charge; the slider cannot pass it. */
  original: number;
  /** Controlled refund amount. */
  value?: number;
  /** Initial amount for uncontrolled usage. @default the original */
  defaultValue?: number;
  /** Fires from the drag, click or key that moved the amount. */
  onValueChange?: (amount: number) => void;
  /** Fires when the refund lands on the card. */
  onRefund?: (amount: number) => void;
  /** Keyboard step and drag snap; Page keys move ten. @default 1 */
  step?: number;
  /** The payee the money leaves. @default "Merchant" */
  merchant?: string;
  /** The customer's card, as it should print. @default "•• 4182" */
  cardLabel?: string;
  /** Formats every amount the card prints. */
  format?: (value: number) => string;
  className?: string;
};

type Phase = "idle" | "travel" | "landed";

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another print different text for the same figure, which is a
 * hydration mismatch on the number going back.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number) => money.format(value);

/** Pointer travel before a press becomes a drag, so plain clicks survive. */
const SLOP = 4;
/** The pill's glide settles in ~450ms; the stamp lands a beat after it arrives. */
const TRAVEL_MS = 600;
/** Under reduced motion the pill only fades in, so the landing follows sooner. */
const REDUCED_TRAVEL_MS = 240;

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
const round2 = (value: number) => Math.round(value * 100) / 100;

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab never paints, so the refund waits where nobody is watching. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

/** Keeps a callback out of effect dependencies so a re-render never restarts the timer. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Money going back. A slider chooses how much of one charge returns and cannot
 * pass the original — the track ends where the charge does. Pressing Refund
 * sends the amount back along the route beneath: the line fills from the
 * merchant's side and a pill carrying the figure travels its length on
 * `glide`, a surface moving with no overshoot, and when it arrives a REFUNDED
 * stamp lands on the card on `recoil` — ζ0.53, the two bounces of rubber on
 * paper — as `onRefund` fires from the timer that landed it.
 *
 * The slider is a `role="slider"`: arrows step, Page keys move ten, Home and
 * End reach zero and the whole charge; capture is taken only after 4px so a
 * click sets the amount. The timer runs only while the document is visible.
 * Under reduced motion the pill appears at the card instead of travelling and
 * the stamp fades in without bouncing — the refund still lands.
 */
export function RefundFlow({
  ref,
  original,
  value,
  defaultValue,
  onValueChange,
  onRefund,
  step = 1,
  merchant = "Merchant",
  cardLabel = "•• 4182",
  format = defaultFormat,
  className,
}: RefundFlowProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<number>(
    defaultValue ?? original,
  );
  const isControlled = value !== undefined;
  const amount = clamp(isControlled ? value : uncontrolled, 0, original);

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [sent, setSent] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const gesture = React.useRef<{
    id: number;
    startX: number;
    dragging: boolean;
    rect: DOMRect;
  } | null>(null);
  const onRefundRef = useLatest(onRefund);

  const span = original > 0 ? original : 1;
  // Both reach the DOM — one as a transform, one as a percentage string — so
  // each is rounded to what motion re-serialises, or the server's paint and
  // the browser's would disagree in the last digits.
  const fraction = Number((amount / span).toFixed(6));
  const percent = Number(((amount / span) * 100).toFixed(3));
  const locked = phase !== "idle";
  const isFull = amount >= original && original > 0;

  const snap = (raw: number) =>
    clamp(round2(Math.round(raw / step) * step), 0, original);

  const commit = (next: number) => {
    if (locked) return;
    const snapped = snap(next);
    if (snapped === amount) return;
    if (!isControlled) setUncontrolled(snapped);
    onValueChange?.(snapped);
  };

  const amountFromClientX = (clientX: number) => {
    const rect = gesture.current?.rect;
    if (!rect || rect.width === 0) return amount;
    return clamp((clientX - rect.left) / rect.width, 0, 1) * original;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || locked) return;
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
          ? 0
          : event.key === "End"
            ? original
            : null;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const refund = () => {
    if (locked || amount <= 0) return;
    setSent(amount);
    setPhase("travel");
  };

  // The pill's journey lives in one motion value: the line fills to it and the
  // pill slides to it, so both arrive together.
  const progress = useMotionValue(0);
  const pillX = useTransform(progress, (p) => `${-p * 100}%`);
  const pillLeft = useTransform(progress, (p) => `${p * 100}%`);

  // Keyed on leaving idle rather than on the phase itself, so the landing
  // cannot stop the glide a frame short of the card.
  React.useEffect(() => {
    if (!locked) return;
    if (!motionSafe) {
      progress.set(1);
      return;
    }
    const controls = animate(progress, 1, springs.glide);
    return () => controls.stop();
  }, [locked, motionSafe, progress]);

  // The landing waits out the travel — and waits altogether while the tab is
  // hidden, so the stamp never lands on a page nobody saw it cross.
  React.useEffect(() => {
    if (phase !== "travel" || !visible) return;
    const timer = window.setTimeout(
      () => {
        setPhase("landed");
        onRefundRef.current?.(sent);
      },
      motionSafe ? TRAVEL_MS : REDUCED_TRAVEL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, visible, motionSafe, sent, onRefundRef]);

  const thumbMove = dragging || !motionSafe ? { duration: 0 } : springs.snap;
  const fade = { duration: durations.fast, ease: easings.enter };
  const caption = isFull
    ? "Full refund"
    : amount > 0
      ? "Partial refund"
      : "Nothing back";

  const spoken =
    phase === "landed"
      ? `Refunded ${format(sent)} to ${cardLabel}`
      : phase === "travel"
        ? `Refunding ${format(sent)}`
        : `Refund ${format(amount)} of ${format(original)}, ${caption.toLowerCase()}`;
  // A live region that changed on every frame of a drag would babble, so the
  // announcement holds at the last settled amount and catches up on release.
  const [announced, setAnnounced] = React.useState(spoken);
  if (!dragging && announced !== spoken) setAnnounced(spoken);

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-4 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium">{merchant}</span>
        <span className="shrink-0 font-mono text-xs text-ink-3 tabular-nums">
          Charged {format(original)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span id={labelId} className="text-[11px] text-ink-3">
            Refund amount
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={caption}
              className={cn(
                "text-[11px] font-medium",
                isFull ? "text-cobalt-bright" : "text-ink-2",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {caption}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* The thumb is centred on its value, so the track is inset by the
            thumb's radius: at zero and at the original it reaches the card's
            edge and never past it. */}
        <div className="px-2">
          <div
            role="slider"
            tabIndex={locked ? -1 : 0}
            aria-labelledby={labelId}
            aria-valuemin={0}
            aria-valuemax={original}
            aria-valuenow={amount}
            aria-valuetext={format(amount)}
            aria-disabled={locked || undefined}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            onLostPointerCapture={endGesture}
            onPointerLeave={(event) => {
              if (gesture.current?.dragging === false) endGesture(event);
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              "relative h-6 w-full touch-none rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              locked ? "cursor-default opacity-60" : "cursor-pointer",
            )}
          >
            <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-hairline-strong">
              <motion.span
                className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-cobalt-bright"
                initial={false}
                animate={{ scaleX: fraction }}
                transition={thumbMove}
              />
            </span>
            {/* The cap is drawn: a stop at the original the thumb meets. */}
            <span
              aria-hidden
              className="absolute top-1/2 right-0 h-3 w-0.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-3"
            />
            <motion.span
              aria-hidden
              className={cn(
                "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cobalt-bright bg-surface-0 shadow-sm transition-colors",
                dragging && "bg-cobalt-wash",
              )}
              initial={false}
              animate={{ left: `${percent}%` }}
              transition={thumbMove}
            />
          </div>
        </div>

        <div
          aria-hidden
          className="flex items-center justify-between font-mono text-[11px] text-ink-3 tabular-nums"
        >
          <span>{format(0)}</span>
          <span>{format(original)}</span>
        </div>
      </div>

      <div className="relative flex items-center gap-2">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-2 border border-hairline-strong bg-surface-2 text-sm font-semibold text-ink"
        >
          {merchant.slice(0, 1).toUpperCase()}
        </span>

        <div className="relative h-8 min-w-0 flex-1">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-hairline-strong" />
          <motion.span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-0.5 origin-left -translate-y-1/2 rounded-full bg-cobalt-bright"
            style={{ scaleX: progress }}
          />
          <AnimatePresence>
            {phase !== "idle" ? (
              <motion.span
                key="pill"
                aria-hidden
                className="absolute top-1/2 flex h-6 -translate-y-1/2 items-center rounded-full border border-cobalt-bright bg-surface-0 px-2 font-mono text-[11px] font-medium text-ink tabular-nums shadow-sm"
                style={{ left: pillLeft, x: pillX }}
                initial={{ opacity: 0 }}
                animate={{ opacity: phase === "landed" ? 0 : 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
              >
                {format(sent)}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <span
          aria-hidden
          className="flex h-10 w-14 shrink-0 flex-col justify-between overflow-hidden rounded-2 border border-hairline-strong bg-surface-2 py-1.5"
        >
          <span className="h-1.5 w-full bg-ink/70" />
          <span className="px-1.5 font-mono text-[9px] leading-none text-ink-2 tabular-nums">
            {cardLabel}
          </span>
        </span>

        {/* Anchored to the card's edge and sized by its own text, so the
            stamp can never overhang the frame. */}
        <AnimatePresence>
          {phase === "landed" ? (
            <motion.span
              key="stamp"
              aria-hidden
              className="absolute top-1/2 right-0 rounded-1 border-2 border-success bg-surface-1/90 px-1.5 py-0.5 text-[10px] leading-none font-semibold tracking-[0.12em] text-success uppercase"
              style={{ originX: 0.5, originY: 0.5 }}
              initial={
                motionSafe
                  ? { opacity: 0, scale: 1.6, rotate: -14, y: "-50%" }
                  : { opacity: 0, rotate: -8, y: "-50%" }
              }
              animate={{ opacity: 1, scale: 1, rotate: -8, y: "-50%" }}
              transition={
                motionSafe
                  ? {
                      ...springs.recoil,
                      opacity: { duration: durations.blink },
                    }
                  : fade
              }
            >
              Refunded
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <button
        type="button"
        disabled={locked || amount <= 0}
        aria-busy={phase === "travel" || undefined}
        onClick={refund}
        className={cn(
          "flex h-9 w-full items-center justify-center rounded-2 px-4 text-sm font-medium transition-colors outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          phase === "landed"
            ? "border border-hairline-strong bg-surface-2 text-ink-2"
            : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60",
        )}
      >
        {phase === "landed"
          ? `Refunded ${format(sent)}`
          : phase === "travel"
            ? "Sending back"
            : `Refund ${format(amount)}`}
      </button>

      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
