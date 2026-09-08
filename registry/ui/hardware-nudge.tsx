"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type NudgeStatus = "idle" | "waiting" | "confirmed" | "expired";

export type HardwareNudgeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled state. */
  status?: NudgeStatus;
  /** Initial state for uncontrolled usage. @default "idle" */
  defaultStatus?: NudgeStatus;
  /** Fires from the press or the timer that changed the state. */
  onStatusChange?: (status: NudgeStatus) => void;
  /** The device being waited on. @default "Fieldline Signer" */
  deviceName?: string;
  /** Amount awaiting confirmation, in major units. */
  amount?: number;
  /** Prints `amount`. */
  format?: (value: number) => string;
  /** Native amount printed with `symbol`. */
  units?: number;
  /** Native symbol printed beside the figure. */
  symbol?: string;
  /** Destination address; shown head and tail in mono. */
  to?: string;
  /** Milliseconds before the request expires; 0 waits forever. @default 30000 */
  timeoutMs?: number;
  /** Fires from the drain's completion when the request times out. */
  onExpire?: () => void;
  /** Fires from the press that sent or re-sent the request. */
  onRetry?: () => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server that formats in one locale and
 * a client that formats in another produce different text for the same number,
 * which is a hydration mismatch on the figure being signed for.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

/** Native quantities are not money, but they still need one fixed locale. */
const quantity = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const TONE: Record<NudgeStatus, { dot: string; ink: string; word: string }> = {
  idle: { dot: "bg-ink-3", ink: "text-ink-3", word: "Idle" },
  waiting: {
    dot: "bg-cobalt-bright",
    ink: "text-cobalt-bright",
    word: "Waiting",
  },
  confirmed: { dot: "bg-success", ink: "text-success", word: "Confirmed" },
  // A timeout is a deadline passing, not a refusal — warn, never destructive.
  expired: { dot: "bg-warn", ink: "text-warn", word: "Timed out" },
};

/** mm:ss holds one width at every value, so a counting readout cannot reflow. */
const clock = (seconds: number): string => {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const shorten = (value: string) =>
  value.length > 16 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;

/** Keeps callbacks out of effect dependencies so a re-render cannot restart the clock. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const subscribeVisibility = (onChange: () => void): (() => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

const getVisible = (): boolean =>
  typeof document === "undefined" || !document.hidden;

/**
 * A prerender has no document to ask, so it reports visible — the same value
 * the first client render must produce for hydration to match.
 */
const getServerVisible = (): boolean => true;

/**
 * A prompt that waits on a physical signer. While the request is out the device
 * outline pulses — a repeating tween, not a spring, because a breath repeats and
 * a spring is a single arrival — and a deadline bar drains linearly from a
 * motion value, so hiding the tab stops the drain and returning resumes it from
 * what is left. The seconds readout is that same motion value read straight into
 * the text, which counts without re-rendering a frame of it.
 *
 * When the confirmation lands the pulse stops, the device's button lights and
 * grows on `flick` and the tick draws in the screen on `flick` — confirmations
 * flick — while the device itself settles on `recoil`, ζ0.53's two bounces,
 * because something has arrived from elsewhere. A timeout does not celebrate: it
 * dims and greys on a colour tween.
 *
 * The device is procedural, never an image. The visible line under it is the
 * live region, so a reader hears one sentence per state rather than a
 * per-second tick, and a single button — send, cancel, or send again — keeps
 * the card the same height in every state.
 */
export function HardwareNudge({
  ref,
  status,
  defaultStatus = "idle",
  onStatusChange,
  deviceName = "Fieldline Signer",
  amount,
  format = defaultFormat,
  units,
  symbol,
  to,
  timeoutMs = 30000,
  onExpire,
  onRetry,
  className,
}: HardwareNudgeProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolled, setUncontrolled] =
    React.useState<NudgeStatus>(defaultStatus);
  const isControlled = status !== undefined;
  const state = isControlled ? status : uncontrolled;

  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const setStatus = (next: NudgeStatus) => {
    if (next === state) return;
    if (!isControlled) setUncontrolled(next);
    onStatusChange?.(next);
  };

  // 1 → 0 across timeoutMs. A motion value, not state: pausing is a stop and a
  // restart from the remainder, with nothing re-rendering in between.
  const remaining = useMotionValue(1);
  const clockText = useTransform(remaining, (value) =>
    clock((value * timeoutMs) / 1000),
  );

  // Declared before the drain, so a fresh request refills the bar before the
  // drain reads how much of it is left.
  const previous = React.useRef(state);
  React.useEffect(() => {
    if (previous.current === state) return;
    previous.current = state;
    if (state === "waiting" || state === "idle") remaining.set(1);
  }, [state, remaining]);

  const latest = useLatest({ isControlled, onStatusChange, onExpire });

  React.useEffect(() => {
    if (state !== "waiting" || timeoutMs <= 0 || !visible) return;
    const controls = animate(remaining, 0, {
      // A deadline is information, not flourish, so it drains at the same
      // linear rate whether or not rich motion is allowed.
      duration: (timeoutMs / 1000) * remaining.get(),
      ease: easings.linear,
      onComplete: () => {
        const handlers = latest.current;
        if (!handlers.isControlled) setUncontrolled("expired");
        handlers.onStatusChange?.("expired");
        handlers.onExpire?.();
      },
    });
    return () => controls.stop();
  }, [state, timeoutMs, visible, remaining, latest]);

  // One landing, from an imperative animate rather than a keyframe array: a
  // spring carries exactly two keyframes, and a third is silently dropped.
  const landing = useMotionValue(1);
  React.useEffect(() => {
    if (state !== "confirmed" || !motionSafe) return;
    landing.set(0.97);
    const controls = animate(landing, 1, springs.recoil);
    return () => controls.stop();
  }, [state, motionSafe, landing]);

  const confirmed = state === "confirmed";
  const expired = state === "expired";
  const waiting = state === "waiting";
  const pulsing = waiting && visible && motionSafe;
  const tone = TONE[state];

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const flick = motionSafe ? springs.flick : { duration: 0 };

  const line = confirmed
    ? `Confirmed on ${deviceName}`
    : expired
      ? "Request timed out"
      : waiting
        ? `Confirm on ${deviceName}`
        : "No request sent";

  const action = waiting
    ? "Cancel"
    : confirmed
      ? "Confirmed"
      : expired
        ? "Send again"
        : "Send request";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">
          {deviceName}
        </span>
        <span
          className={cn(
            "flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
            tone.ink,
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              tone.dot,
            )}
          />
          {tone.word}
        </span>
      </div>

      <motion.div
        aria-hidden
        className="mx-auto w-full max-w-56"
        style={{ scale: landing }}
        initial={false}
        animate={{ opacity: expired ? 0.45 : 1 }}
        transition={{ duration: durations.base, ease: easings.enter }}
      >
        <svg viewBox="0 0 120 76" className="block w-full">
          {/* The pulse is drawn in the device's own coordinates, so it can
              never drift from the outline it belongs to. With rich motion off
              — or the tab hidden — the same ring holds still rather than
              disappearing: the device is still asking. */}
          {pulsing ? (
            <motion.rect
              x={14}
              y={8}
              width={84}
              height={60}
              rx={8}
              fill="none"
              stroke="var(--accent-bright)"
              strokeWidth="1.5"
              initial={{ opacity: 0.55, scale: 1 }}
              animate={{ opacity: 0, scale: 1.09 }}
              transition={{
                duration: durations.page,
                ease: easings.enter,
                repeat: Infinity,
                repeatDelay: 0.15,
              }}
              style={{
                transformBox: "view-box",
                originX: "56px",
                originY: "38px",
              }}
            />
          ) : (
            <rect
              x={14}
              y={8}
              width={84}
              height={60}
              rx={8}
              fill="none"
              stroke="var(--accent-bright)"
              strokeWidth="1.5"
              opacity={waiting ? 0.5 : 0}
            />
          )}

          <rect
            x={14}
            y={8}
            width={84}
            height={60}
            rx={8}
            className={cn(
              "transition-colors",
              confirmed
                ? "text-success"
                : expired
                  ? "text-ink-3"
                  : "text-ink-2",
            )}
            {...STROKE}
            strokeWidth="1.8"
          />
          <rect
            x={22}
            y={16}
            width={68}
            height={32}
            rx={4}
            fill="var(--bg-2)"
            stroke="var(--hairline-strong)"
            strokeWidth="1"
          />

          {/* The screen's two lines of copy and the tick share the screen: one
              fades out exactly as the other draws, so nothing is reserved. */}
          <motion.g
            className="text-ink-3"
            fill="currentColor"
            initial={false}
            animate={{ opacity: confirmed ? 0 : 1 }}
            transition={fade}
          >
            <rect x={29} y={25} width={40} height={3} rx={1.5} />
            <rect x={29} y={33} width={26} height={3} rx={1.5} />
            <rect x={29} y={41} width={33} height={3} rx={1.5} />
          </motion.g>
          <motion.path
            d="M44 33.5 51 40.5 68 23.5"
            className="text-success"
            {...STROKE}
            strokeWidth="3.2"
            pathLength={1}
            initial={false}
            animate={{ pathLength: confirmed ? 1 : 0 }}
            transition={flick}
          />

          <rect
            x={30}
            y={56}
            width={52}
            height={4}
            rx={2}
            fill="var(--hairline-strong)"
          />

          <motion.circle
            cx={103}
            cy={38}
            r={6}
            className={cn(
              "transition-colors",
              confirmed
                ? "text-success"
                : expired
                  ? "text-ink-3"
                  : "text-ink-2",
            )}
            fill="currentColor"
            initial={false}
            animate={{ scale: confirmed ? 1.16 : 1 }}
            transition={flick}
            style={{
              transformBox: "view-box",
              originX: "103px",
              originY: "38px",
            }}
          />
        </svg>
      </motion.div>

      {amount === undefined &&
      units === undefined &&
      to === undefined ? null : (
        <div className="flex flex-col gap-1 rounded-2 border border-hairline bg-surface-0 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="shrink-0 text-[11px] text-ink-3">Amount</span>
            <span className="min-w-0 truncate text-sm font-semibold text-ink tabular-nums">
              {units === undefined
                ? amount === undefined
                  ? "—"
                  : format(amount)
                : `${quantity.format(units)} ${symbol ?? ""}`.trim()}
            </span>
          </div>
          {units !== undefined && amount !== undefined ? (
            <div className="flex items-baseline justify-between gap-2">
              <span className="shrink-0 text-[11px] text-ink-3">Value</span>
              <span className="min-w-0 truncate font-mono text-[11px] text-ink-2 tabular-nums">
                {format(amount)}
              </span>
            </div>
          ) : null}
          {to === undefined ? null : (
            <div className="flex items-baseline justify-between gap-2">
              <span className="shrink-0 text-[11px] text-ink-3">To</span>
              <span
                title={to}
                className="min-w-0 truncate font-mono text-[11px] text-ink-2"
              >
                {shorten(to)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Once a deadline exists it stays in the layout: a bar that appears and
          vanishes with the state moves everything under it, and where the clock
          stopped is worth keeping after the request has landed. */}
      {timeoutMs <= 0 ? null : (
        <motion.div
          aria-hidden
          className="flex items-center gap-2"
          initial={false}
          animate={{ opacity: waiting ? 1 : 0.4 }}
          transition={fade}
        >
          <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-hairline-strong">
            <motion.span
              className={cn(
                "block h-full origin-left rounded-full transition-colors",
                expired
                  ? "bg-warn"
                  : confirmed
                    ? "bg-success"
                    : "bg-cobalt-bright",
              )}
              style={{ scaleX: remaining }}
            />
          </span>
          <motion.span className="min-w-[4ch] shrink-0 text-right font-mono text-[11px] text-ink-2 tabular-nums">
            {clockText}
          </motion.span>
        </motion.div>
      )}

      <div className="flex items-center justify-between gap-2">
        {/* The visible line is the live region: a second sr-only copy would
            make every state change arrive twice. */}
        <span
          role="status"
          title={line}
          className="min-w-0 truncate text-xs text-ink-2"
        >
          {line}
        </span>
        <button
          type="button"
          disabled={confirmed}
          onClick={() => {
            if (waiting) {
              setStatus("idle");
              return;
            }
            setStatus("waiting");
            onRetry?.();
          }}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:pointer-events-none disabled:opacity-50",
            "border-input bg-surface-1 hover:bg-accent",
          )}
        >
          {action}
        </button>
      </div>
    </div>
  );
}
