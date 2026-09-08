"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CardPinProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Digits to reveal; non-digits are stripped. @default "4182" */
  pin?: string;
  /** Milliseconds the reveal may stay open. @default 8000 */
  holdFor?: number;
  /** Names the group. @default "Card PIN" */
  label?: string;
  /** Control copy while hidden. @default "Hold to show" */
  holdLabel?: string;
  /** Control copy while the PIN is showing. @default "Showing" */
  shownLabel?: string;
  /** Locks the control. */
  disabled?: boolean;
  /** Fires from the pointer, key or timeout that changed the reveal. */
  onRevealChange?: (revealed: boolean) => void;
  /** Fires from the ring's completion, when the window runs out. */
  onTimeout?: () => void;
  className?: string;
};

/** How the reveal was opened, which decides what closes it. */
type RevealMode = "hold" | "latch";

/** Keeps callbacks out of effect deps, so a re-render never restarts the ring. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Four digits, shown one at a time. Each cell is a two-face column — a bullet
 * above its digit — that rolls `y` from 0 to -50% of its own height, exactly
 * two keyframes on `snap`, staggered by `cascade(4)` so the four land inside
 * 200ms. Release and they roll back in reverse, last cell first, so the reveal
 * is never left half-open.
 *
 * A ring inside the control drains linearly across `holdFor` and says how long
 * the reveal will stay. The drain lives in a motion value animated by
 * `animate()`, so nothing re-renders while it runs and the seconds are read off
 * its own change event rather than a second interval — `Date.now()` is never
 * touched at render. When the ring empties the reveal ends on its own, even if
 * the control is still held, and hiding the document ends it outright: a PIN
 * must not sit uncovered on a tab nobody is watching.
 *
 * Two keyboard paths, because not everyone can hold a key: Space held reveals
 * while held, Enter latches the reveal for the whole window, and Enter again or
 * Escape closes it early. Under reduced motion the columns swap face instantly
 * and the ring still drains at the same linear rate, because a countdown and a
 * revealed digit are both information.
 */
export function CardPin({
  ref,
  pin = "4182",
  holdFor = 8000,
  label = "Card PIN",
  holdLabel = "Hold to show",
  shownLabel = "Showing",
  disabled = false,
  onRevealChange,
  onTimeout,
  className,
}: CardPinProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;

  // Capped so a longer code still lays out in one row instead of squeezing.
  const digits = React.useMemo(
    () => (pin.replace(/\D/g, "").slice(0, 8) || "0000").split(""),
    [pin],
  );

  const [mode, setMode] = React.useState<RevealMode | null>(null);
  const revealed = mode !== null;
  const seconds = Math.ceil(holdFor / 1000);
  const [left, setLeft] = React.useState(seconds);

  const changeRef = useLatest(onRevealChange);
  const timeoutRef = useLatest(onTimeout);

  const remaining = useMotionValue(1);
  const ringOffset = useTransform(remaining, (value) => 1 - value);

  // Whole seconds only, read off the drain itself: one re-render a second, and
  // no timer of its own to keep in step with the ring.
  useMotionValueEvent(remaining, "change", (value) => {
    const next = Math.max(0, Math.ceil((value * holdFor) / 1000));
    setLeft((previous) => (previous === next ? previous : next));
  });

  React.useEffect(() => {
    if (!revealed) return;
    // Two keyframes rather than a set-then-animate: seeding the value by hand
    // would push a state update out of an effect body on every close.
    const controls = animate(remaining, [1, 0], {
      // A countdown is information, so it drains at the same linear rate
      // whether or not rich motion is welcome.
      duration: holdFor / 1000,
      ease: easings.linear,
      onComplete: () => {
        setMode(null);
        changeRef.current?.(false);
        timeoutRef.current?.();
      },
    });
    return () => controls.stop();
  }, [revealed, holdFor, remaining, changeRef, timeoutRef]);

  React.useEffect(() => {
    if (!revealed) return;
    const onVisibility = () => {
      if (!document.hidden) return;
      setMode(null);
      changeRef.current?.(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [revealed, changeRef]);

  const show = (next: RevealMode) => {
    if (disabled || revealed) return;
    setMode(next);
    onRevealChange?.(true);
  };

  const hide = (only?: RevealMode) => {
    if (!revealed || (only && mode !== only)) return;
    setMode(null);
    onRevealChange?.(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.repeat) return;
    if (event.key === " ") {
      // Suppressing the default also suppresses the click the browser would
      // synthesise on key-up, so a hold never toggles twice.
      event.preventDefault();
      show("hold");
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (revealed) hide();
      else show("latch");
    } else if (event.key === "Escape") {
      event.preventDefault();
      hide();
    }
  };

  const step = motionSafe ? cascade(digits.length) : 0;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase">
          {revealed ? `${left}s left` : `${seconds}s window`}
        </span>
      </div>

      <div
        aria-hidden
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${digits.length}, minmax(0, 1fr))`,
        }}
      >
        {digits.map((digit, index) => {
          // Forwards on reveal, backwards on hide: the display shuts from the
          // far end, so the last thing you see is the first digit going.
          const order = revealed ? index : digits.length - 1 - index;
          return (
            <span
              key={index}
              className="relative h-14 overflow-hidden rounded-2 border border-hairline-strong bg-surface-1"
            >
              <motion.span
                className="absolute inset-x-0 top-0 flex h-[200%] flex-col"
                initial={false}
                animate={{ y: revealed ? "-50%" : "0%" }}
                transition={
                  motionSafe
                    ? { ...springs.snap, delay: order * step }
                    : { duration: 0 }
                }
              >
                <span className="flex h-1/2 items-center justify-center text-2xl text-ink-3">
                  •
                </span>
                <span className="flex h-1/2 items-center justify-center font-mono text-2xl tabular-nums">
                  {digit}
                </span>
              </motion.span>
            </span>
          );
        })}
      </div>

      <button
        type="button"
        disabled={disabled}
        aria-pressed={revealed}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (event.key === " ") hide("hold");
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          show("hold");
        }}
        onPointerUp={() => hide("hold")}
        onPointerLeave={() => hide("hold")}
        onPointerCancel={() => hide("hold")}
        onBlur={() => hide("hold")}
        className={cn(
          "flex h-9 w-full items-center justify-center gap-2 rounded-2 border border-hairline-strong px-3 text-sm font-medium transition-colors outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:bg-accent active:bg-cobalt-wash",
        )}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="2.5"
          />
          <motion.circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            className="text-cobalt-bright"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            transform="rotate(-90 12 12)"
            style={{ strokeDashoffset: ringOffset }}
            initial={false}
            animate={{ opacity: revealed ? 1 : 0 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          />
        </svg>
        <span>{revealed ? shownLabel : holdLabel}</span>
      </button>

      <span id={hintId} className="sr-only">
        Hold Space to show the PIN while held, or press Enter to keep it showing
        until the countdown ends. Enter again or Escape hides it.
      </span>
      <span role="status" className="sr-only">
        {revealed ? `PIN ${digits.join(" ")}` : "PIN hidden"}
      </span>
    </div>
  );
}
