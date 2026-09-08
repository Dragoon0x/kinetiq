"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BalanceMaskProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The figure behind the mask. */
  amount: number;
  /** What the figure is; sits above it and names the control. */
  label: string;
  /** Renders the figure; the mask is built from its output. */
  format?: (amount: number) => string;
  /** Controlled reveal, for a page-wide "hide balances" switch. */
  revealed?: boolean;
  /** Initial reveal for uncontrolled usage. */
  defaultRevealed?: boolean;
  onRevealedChange?: (revealed: boolean) => void;
  /** False makes the pointer toggle, and fade, instead of hold. @default true */
  holdToReveal?: boolean;
  /** The character every digit becomes. @default "•" */
  maskChar?: string;
  /** One short line under the figure; dims while the figure is shown. */
  hint?: React.ReactNode;
  className?: string;
};

/** Pinned so the server and the client format identically. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const defaultFormat = (amount: number) => currency.format(amount);

/**
 * Both layers use the same four-number inset so the two states interpolate
 * into each other instead of snapping between different shapes.
 */
const OPEN = "inset(0% 0% 0% 0%)";
const CLIPPED_RIGHT = "inset(0% 100% 0% 0%)";
const CLIPPED_LEFT = "inset(0% 0% 0% 100%)";

/**
 * Hidden by default, shown on purpose. The figure sits under a mask of bullets
 * that replaces the digits and keeps the symbol and separators, drawn in the
 * same mono face at the same advance width, so masked and unmasked occupy
 * exactly the same box and nothing shifts when the mask lifts. The two layers
 * share one grid cell and clip against each other: holding drives the boundary
 * across on `glide` — the mask is a surface moving aside — and releasing runs
 * it back on the exit ease, because hiding is an exit and exits accelerate away
 * rather than spring.
 *
 * A release is caught on a window `pointerup` while the hold is live, so
 * letting go anywhere on the page re-masks the number; nothing captures the
 * pointer, so a stray drag across the control cannot leave the balance
 * standing open. Space or Enter toggles instead of holding, and that path
 * cross-fades rather than wipes: no travel where there was no gesture. Escape
 * hides. Under reduced motion every path is that same fade — the balance still
 * shows and still hides, because that is the whole control.
 */
export function BalanceMask({
  ref,
  amount,
  label,
  format = defaultFormat,
  revealed,
  defaultRevealed = false,
  onRevealedChange,
  holdToReveal = true,
  maskChar = "•",
  hint = "Hold to show",
  className,
}: BalanceMaskProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolled, setUncontrolled] = React.useState(defaultRevealed);
  const isControlled = revealed !== undefined;
  const shown = isControlled ? revealed : uncontrolled;

  // Which gesture is driving: a hold wipes, a key fades. The resting state is
  // clip-defined, so the first hold is a wipe rather than a wipe over a fade.
  const [fading, setFading] = React.useState(false);
  const [holding, setHolding] = React.useState(false);

  const set = (next: boolean) => {
    if (next === shown) return;
    if (!isControlled) setUncontrolled(next);
    onRevealedChange?.(next);
  };

  // Kept in a ref so the window listener never goes stale, and so the effect
  // that subscribes contains nothing but the subscription.
  const release = () => {
    setHolding(false);
    set(false);
  };
  const releaseRef = React.useRef(release);
  React.useEffect(() => {
    releaseRef.current = release;
  });

  React.useEffect(() => {
    if (!holding) return;
    const end = () => releaseRef.current();
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [holding]);

  const formatted = format(amount);
  // Only the digits become bullets: the symbol and the separators stay, so the
  // masked figure still reads as money rather than as a row of dots.
  const masked = formatted.replace(/\d/g, maskChar);

  const fadeTransition = { duration: durations.fast, ease: easings.enter };
  // A wipe only happens when a pointer asked for one and motion is welcome.
  const wipes = motionSafe && !fading;
  // Switching from a wipe to a fade leaves the clip somewhere it should not
  // stay, so it catches up over the fade rather than snapping open under it.
  const clipTransition = !motionSafe
    ? { duration: 0 }
    : fading
      ? fadeTransition
      : shown
        ? springs.glide
        : { duration: durations.base, ease: easings.exit };

  const press = () => {
    if (!holdToReveal) {
      setFading(true);
      set(!shown);
      return;
    }
    setFading(false);
    setHolding(true);
    set(true);
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-1", className)}>
      <span className="text-xs text-ink-3">{label}</span>

      <button
        type="button"
        aria-pressed={shown}
        aria-label={`${shown ? "Hide" : "Show"} ${label}`}
        onPointerDown={(event) => {
          if (!event.isPrimary) return;
          press();
        }}
        onClick={(event) => {
          // A tap has already been answered by the hold path, and acting again
          // here would toggle the balance twice. A click with no pointer
          // behind it (detail 0) is assistive technology activating the
          // control, which the hold path never sees, so it is answered here.
          if (holdToReveal && event.detail !== 0) return;
          setFading(true);
          set(!shown);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setFading(true);
            set(false);
            return;
          }
          if (event.key !== " " && event.key !== "Enter") return;
          // preventDefault also suppresses the native click this key would
          // synthesise, so the toggle runs exactly once.
          event.preventDefault();
          if (event.repeat) return;
          setFading(true);
          set(!shown);
        }}
        onBlur={() => {
          if (holding) release();
        }}
        className={cn(
          "-mx-1 flex w-full touch-none items-center gap-3 rounded-2 px-1 py-1 text-left transition-colors outline-none select-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="grid min-w-0 flex-1 font-mono text-2xl leading-tight font-medium tabular-nums">
          <motion.span
            aria-hidden
            className="col-start-1 row-start-1 truncate text-foreground"
            initial={false}
            animate={{
              clipPath: wipes ? (shown ? OPEN : CLIPPED_RIGHT) : OPEN,
              opacity: wipes ? 1 : shown ? 1 : 0,
            }}
            transition={{ clipPath: clipTransition, opacity: fadeTransition }}
          >
            {formatted}
          </motion.span>
          <motion.span
            aria-hidden
            className="col-start-1 row-start-1 truncate text-ink-2"
            initial={false}
            animate={{
              clipPath: wipes ? (shown ? CLIPPED_LEFT : OPEN) : OPEN,
              opacity: wipes ? 1 : shown ? 0 : 1,
            }}
            transition={{ clipPath: clipTransition, opacity: fadeTransition }}
          >
            {masked}
          </motion.span>
        </span>

        <span
          className={cn(
            "shrink-0 transition-colors",
            shown ? "text-cobalt-bright" : "text-ink-3",
          )}
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 10S5.5 5 10 5s7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5Z" />
            <circle cx="10" cy="10" r="2.3" />
            {/* The slash is the acknowledgement, so it draws on flick and is
                simply there under reduced motion rather than absent. */}
            <motion.path
              d="M4.5 15.5 15.5 4.5"
              strokeWidth="1.6"
              pathLength={1}
              initial={false}
              animate={{ pathLength: shown ? 0 : 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        </span>
      </button>

      {hint ? (
        <motion.span
          aria-hidden
          className="text-[11px] text-ink-3"
          initial={false}
          animate={{ opacity: shown ? 0 : 1 }}
          transition={fadeTransition}
        >
          {hint}
        </motion.span>
      ) : null}

      <span role="status" className="sr-only">
        {shown ? `${label} ${formatted}` : `${label} hidden`}
      </span>
    </div>
  );
}
