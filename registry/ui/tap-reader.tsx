"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TapReaderStatus = "ready" | "reading" | "approved" | "declined";

export type TapReaderProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled; the outcome comes from the host. */
  status: TapReaderStatus;
  /** The sale, in major units. */
  amount: number;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the reader. @default "Card reader" */
  label?: string;
  /** A sale reference shown top right. */
  reference?: string;
  /** Overrides the state line copy. */
  messages?: Partial<Record<TapReaderStatus, string>>;
  /** Fires from the press while ready. */
  onTap?: () => void;
  /** Fires from the press after an outcome. */
  onReset?: () => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's, so server and client print the same
 * string for the same number and the amount never hydrates against itself.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const MESSAGES: Record<TapReaderStatus, string> = {
  ready: "Hold your card to the reader",
  reading: "Reading, keep the card still",
  approved: "Approved, take your card",
  declined: "Declined, try another card",
};

const CAPTIONS: Record<TapReaderStatus, string> = {
  ready: "Tap",
  reading: "Reading",
  approved: "New sale",
  declined: "Try again",
};

const TONES: Record<TapReaderStatus, string> = {
  ready: "text-cobalt-bright",
  reading: "text-cobalt-bright",
  approved: "text-success",
  declined: "text-danger",
};

/** Arc lengths as a share of the ring: the waiting stub, the spinner, the still reading arc, and closed. */
const ARC = { stub: 0.18, spinner: 0.28, still: 0.75, closed: 1 } as const;

/** One turn of the spinner. */
const SPIN_SECONDS = 1.1;

/**
 * A card reader's display: the amount above, a ring in the middle, one line of
 * state below. Ready, a short arc at the top breathes on a mirrored opacity
 * tween. The ring is the tap target — a real button that squashes on `flick` —
 * and the host answers the tap by moving `status` to `reading`, which sets the
 * arc spinning on a linear repeating tween. On `approved` the spinner finishes
 * its turn to the top and grows into a full ring on `glide` (a settle, no
 * overshoot) while a check draws inside it on `flick`; on `declined` the ring
 * turns danger, shakes on a five-keyframe tween and a cross draws. The reader
 * never times anything itself.
 *
 * The button's accessible name carries the state and the amount, it is busy
 * while reading, and the line beneath is a status region so an outcome is
 * announced once. Under reduced motion nothing breathes, spins, shakes or
 * squashes: reading shows a still three-quarter arc, and each outcome shows its
 * ring and glyph at once, by colour and opacity alone.
 */
export function TapReader({
  ref,
  status,
  amount,
  format = defaultFormat,
  label = "Card reader",
  reference,
  messages,
  onTap,
  onReset,
  className,
}: TapReaderProps) {
  const motionSafe = useMotionSafe();
  const [pressed, setPressed] = React.useState(false);
  const keyHeld = React.useRef(false);

  const reading = status === "reading";
  const printed = format(amount);

  // The spinner's angle lives in a motion value so leaving the reading state
  // can finish the turn to the top on glide instead of jumping there: the
  // closing ring then grows from twelve o'clock, where the stub waited.
  const spin = useMotionValue(0);
  React.useEffect(() => {
    if (!motionSafe) {
      spin.set(0);
      return;
    }
    if (status === "reading") {
      const from = spin.get();
      const controls = animate(spin, [from, from + 360], {
        duration: SPIN_SECONDS,
        ease: easings.linear,
        repeat: Infinity,
      });
      return () => controls.stop();
    }
    const controls = animate(
      spin,
      Math.ceil(spin.get() / 360) * 360,
      springs.glide,
    );
    return () => controls.stop();
  }, [status, motionSafe, spin]);

  // The waiting stub breathes from an effect for the same reason: a loop
  // declared in `animate` under `initial={false}` may never start on mount.
  const breath = useMotionValue(1);
  React.useEffect(() => {
    if (!motionSafe || status !== "ready") {
      breath.set(1);
      return;
    }
    const controls = animate(breath, [0.35, 1], {
      duration: 0.9,
      repeat: Infinity,
      repeatType: "mirror",
      ease: "easeInOut",
    });
    return () => controls.stop();
  }, [status, motionSafe, breath]);

  const arc = !motionSafe
    ? status === "ready"
      ? ARC.stub
      : status === "reading"
        ? ARC.still
        : ARC.closed
    : status === "ready"
      ? ARC.stub
      : status === "reading"
        ? ARC.spinner
        : ARC.closed;

  const name =
    status === "ready"
      ? `Tap to pay ${printed}`
      : status === "reading"
        ? "Reading"
        : status === "approved"
          ? "Approved, new sale"
          : "Declined, try again";

  const press = () => {
    if (status === "ready") onTap?.();
    else if (status !== "reading") onReset?.();
  };

  const draw = motionSafe ? springs.flick : { duration: 0 };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col items-center gap-4 rounded-3 border border-hairline bg-surface-1 px-4 py-4",
        className,
      )}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[11px] font-medium text-ink-3">
          {label}
        </span>
        {reference ? (
          <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            {reference}
          </span>
        ) : null}
      </div>

      <span className="font-mono text-2xl font-semibold tabular-nums">
        {printed}
      </span>

      <motion.button
        type="button"
        aria-label={name}
        aria-disabled={reading || undefined}
        aria-busy={reading || undefined}
        onClick={press}
        onPointerDown={(event) => {
          if (event.button === 0 && !reading) setPressed(true);
        }}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onKeyDown={(event) => {
          if (
            (event.key === " " || event.key === "Enter") &&
            !keyHeld.current
          ) {
            keyHeld.current = true;
            if (!reading) setPressed(true);
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            keyHeld.current = false;
            setPressed(false);
          }
        }}
        animate={{ scale: motionSafe && pressed ? 0.95 : 1 }}
        transition={springs.flick}
        className={cn(
          "relative flex aspect-square w-32 items-center justify-center rounded-full outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
          reading ? "cursor-default" : "cursor-pointer",
        )}
      >
        {/* The shake and the spin are HTML transforms on wrappers sized by the
            button, so no SVG origin has to be measured and nothing overhangs. */}
        <motion.span
          aria-hidden
          className="absolute inset-0"
          initial={false}
          animate={
            motionSafe && status === "declined"
              ? { x: [0, -6, 6, -4, 0] }
              : { x: 0 }
          }
          transition={{ duration: durations.slow, ease: easings.move }}
        >
          <motion.span className="absolute inset-0" style={{ rotate: spin }}>
            <svg
              viewBox="0 0 100 100"
              className={cn(
                "size-full transition-colors duration-200",
                TONES[status],
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            >
              <circle cx="50" cy="50" r="44" strokeOpacity="0.15" />
              <motion.circle
                cx="50"
                cy="50"
                r="44"
                pathLength={1}
                transform="rotate(-90 50 50)"
                style={{ opacity: breath }}
                initial={false}
                animate={{ pathLength: arc }}
                transition={
                  motionSafe
                    ? status === "reading"
                      ? { duration: durations.fast, ease: easings.enter }
                      : springs.glide
                    : { duration: 0 }
                }
              />
            </svg>
          </motion.span>
        </motion.span>

        <span
          aria-hidden
          className={cn(
            "relative flex flex-col items-center gap-1 transition-colors duration-200",
            TONES[status],
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-8 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {status === "approved" ? (
              <motion.path
                key="check"
                d="M5.5 12.5 10 17 18.5 7.5"
                pathLength={1}
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={draw}
              />
            ) : status === "declined" ? (
              <React.Fragment key="cross">
                <motion.path
                  d="M7 7l10 10"
                  pathLength={1}
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={draw}
                />
                <motion.path
                  d="M17 7 7 17"
                  pathLength={1}
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? { ...draw, delay: 0.08 } : draw}
                />
              </React.Fragment>
            ) : (
              <motion.g
                key="waves"
                initial={false}
                animate={{ opacity: reading ? 0.45 : 1 }}
                transition={{ duration: durations.fast }}
              >
                <path d="M8 9.5a4 4 0 0 1 0 5" />
                <path d="M11.5 7a8 8 0 0 1 0 10" />
                <path d="M15 4.5a12 12 0 0 1 0 15" />
              </motion.g>
            )}
          </svg>
          <span className="text-[11px] font-medium text-foreground">
            {CAPTIONS[status]}
          </span>
        </span>
      </motion.button>

      <p role="status" className="text-center text-xs text-ink-2">
        {messages?.[status] ?? MESSAGES[status]}
      </p>
    </div>
  );
}
