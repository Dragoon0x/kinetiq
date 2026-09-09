"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RetryStatus = "failed" | "pending" | "succeeded";

export type RetryAttempt = {
  id: string;
  /** The short time label under the dot ("Now", "+2h"). */
  label: string;
  status: RetryStatus;
};

export type RetryScheduleProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The schedule. The first pending attempt is the next one. */
  attempts: RetryAttempt[];
  /** Seconds until the next attempt; the countdown and the connector run across it. @default 300 */
  waitSeconds?: number;
  /** The amount that failed, in major units. */
  amount?: number;
  /** Turns `amount` into its printed string. */
  format?: (value: number) => string;
  /** The decline line. @default "Card declined" */
  reason?: string;
  /** The method that failed — a quiet caption. */
  method?: string;
  /** Runs the countdown; it also stops while the document is hidden or `busy`. @default true */
  running?: boolean;
  /** The attempt is in flight: the button reads Trying and the countdown holds. @default false */
  busy?: boolean;
  /** Fires from the press on Retry now. */
  onRetryNow?: () => void;
  /** Fires from the interval when the wait reaches zero. */
  onElapse?: () => void;
  /** Fires once a second from the interval with the seconds left. */
  onTick?: (secondsLeft: number) => void;
  /** Names the schedule. @default "Retry schedule" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server that formats in one locale and
 * a client that formats in another produce different text for the same number,
 * which is a hydration mismatch on the figure that matters most.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const pad = (value: number) => String(value).padStart(2, "0");

/** Minutes and seconds while the wait is short; hours once it is not. */
function clockFace(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  if (seconds >= 3600) {
    return `${Math.floor(seconds / 3600)}h ${pad(Math.floor((seconds % 3600) / 60))}m`;
  }
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/** The same wait as a sentence, for a reader who cannot watch the digits. */
function spokenWait(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  if (seconds <= 0) return "now";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (minutes > 0) {
    const rest = seconds % 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"} ${rest} second${rest === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/**
 * One stop on the rail. The landing is imperative because it plays once, on
 * arrival, rather than describing a state the dot stays in — and `[1.15, 1]` is
 * exactly two keyframes, which is all a spring may carry. A success lands on
 * `recoil`; a failure only flicks, because a failure does not celebrate.
 */
function AttemptDot({
  status,
  next,
  motionSafe,
}: {
  status: RetryStatus;
  next: boolean;
  motionSafe: boolean;
}) {
  const nodeRef = React.useRef<HTMLSpanElement | null>(null);
  const previous = React.useRef<RetryStatus | null>(null);

  React.useEffect(() => {
    const was = previous.current;
    previous.current = status;
    const node = nodeRef.current;
    if (!node || !motionSafe || was === null || was === status) return;
    if (status === "succeeded") {
      const controls = animate(node, { scale: [1.15, 1] }, springs.recoil);
      return () => controls.stop();
    }
    if (status === "failed") {
      const controls = animate(node, { scale: [1.12, 1] }, springs.flick);
      return () => controls.stop();
    }
  }, [status, motionSafe]);

  return (
    <span aria-hidden className="relative z-10 block size-4 shrink-0">
      {/* The breath marks the attempt being waited on — the card's only
          ambient motion, and only while there is something to wait for. */}
      <AnimatePresence initial={false}>
        {next && motionSafe ? (
          <motion.span
            key="breath"
            className="absolute -inset-1 rounded-full border border-cobalt-bright"
            initial={{ opacity: 0.5, scale: 1 }}
            animate={{ opacity: 0.05, scale: 1.15 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              ...springs.drift,
              repeat: Infinity,
              repeatType: "mirror",
            }}
          />
        ) : null}
      </AnimatePresence>

      <span
        ref={nodeRef}
        className={cn(
          "relative grid size-4 place-items-center rounded-full border transition-colors",
          status === "failed" && "border-danger bg-danger/15 text-danger",
          status === "succeeded" && "border-success bg-success/15 text-success",
          status === "pending" &&
            (next
              ? "border-cobalt-bright bg-surface-1 text-cobalt-bright"
              : "border-hairline-strong bg-surface-1 text-ink-3"),
        )}
      >
        <svg
          viewBox="0 0 16 16"
          className="size-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            d="m5 5 6 6M11 5l-6 6"
            pathLength={1}
            initial={false}
            animate={{ pathLength: status === "failed" ? 1 : 0 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
          <motion.path
            d="M4.2 8.4 6.8 11 11.8 5.4"
            pathLength={1}
            initial={false}
            // The draw is the acknowledgement: instant under reduced motion,
            // never absent.
            animate={{ pathLength: status === "succeeded" ? 1 : 0 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        </svg>
        {status === "pending" && next ? (
          <span className="absolute size-1.5 rounded-full bg-cobalt-bright" />
        ) : null}
      </span>
    </span>
  );
}

/**
 * A failed charge, and the plan for trying it again.
 *
 * The rail of dots is the schedule: spent attempts are struck, the next one is
 * ringed and breathing on `drift`, the rest are hollow. The connector into the
 * next dot is the countdown made visible — it fills left to right at a linear
 * rate as the wait drains, so the card shows time passing instead of only
 * printing it — while the `mm:ss` beside it ticks from an interval that stops
 * when the tab is hidden, holds while an attempt is in flight, and reports each
 * second through `onTick`. Nothing reads the clock during render.
 *
 * Retry now fires the attempt early from the press. A settled attempt lands: a
 * failure strikes its dot on `flick`, a success draws a tick on `flick` and
 * lands the dot on `recoil` — the one place two bounces are earned. The schedule
 * is an ordered list whose items carry sentences ("Attempt 3, next, in 4
 * minutes"), so the drawn rail can stay decorative, and the countdown sits in an
 * `aria-live="off"` timer that is queried rather than announced every second.
 * Under reduced motion nothing breathes or spins, the tick is already drawn, and
 * the connector still fills, because a countdown is information.
 */
export function RetrySchedule({
  ref,
  attempts,
  waitSeconds = 300,
  amount,
  format = defaultFormat,
  reason = "Card declined",
  method,
  running = true,
  busy = false,
  onRetryNow,
  onElapse,
  onTick,
  label = "Retry schedule",
  className,
}: RetryScheduleProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  // Nothing counts down to an empty room.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Once an attempt has succeeded nothing is next any more: the attempts that
  // were still scheduled behind it stay scheduled, and the clock stops.
  const settled = attempts.some((item) => item.status === "succeeded");
  const nextIndex = settled
    ? -1
    : attempts.findIndex((item) => item.status === "pending");
  const nextId = nextIndex < 0 ? null : (attempts[nextIndex]?.id ?? null);
  const spent = nextIndex < 0 && !settled;
  const span = Math.max(1, waitSeconds);

  const [elapsed, setElapsed] = React.useState(0);
  const [clockKey, setClockKey] = React.useState(nextId);
  // Adjusting state during render is how the wait restarts when the attempt it
  // was counting settles: the committed render already knows it is a new wait,
  // so no effect has to write state after the fact.
  if (clockKey !== nextId) {
    setClockKey(nextId);
    setElapsed(0);
  }

  // The interval reads its running total from a mirror rather than from state,
  // so a re-render between ticks cannot hand it a stale closure.
  const elapsedRef = React.useRef(0);
  React.useEffect(() => {
    elapsedRef.current = elapsed;
  });

  const tickRef = React.useRef(onTick);
  const elapseRef = React.useRef(onElapse);
  React.useEffect(() => {
    tickRef.current = onTick;
    elapseRef.current = onElapse;
  });

  React.useEffect(() => {
    if (!running || busy || !visible || nextId === null) return;
    if (elapsedRef.current >= span) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const next = Math.min(span, elapsedRef.current + (now - last) / 1000);
      last = now;
      elapsedRef.current = next;
      setElapsed(next);
      // Reported from the tick that caused it, never from a state updater.
      tickRef.current?.(Math.max(0, Math.ceil(span - next)));
      if (next >= span) {
        window.clearInterval(timer);
        elapseRef.current?.();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, busy, visible, nextId, span]);

  const left = Math.max(0, span - elapsed);
  const progress = Math.min(1, Math.max(0, elapsed / span));

  const headline = settled ? "Payment charged" : "Payment failed";
  const amountText = amount === undefined ? null : format(amount);

  const announcement = settled
    ? `${label}: payment succeeded.`
    : spent
      ? `${label}: no attempts left.`
      : busy
        ? `${label}: trying now.`
        : `${label}: attempt ${nextIndex + 1} of ${attempts.length}, in ${spokenWait(left)}.`;

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span
            id={labelId}
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {label}
          </span>
          {amountText ? (
            <span className="shrink-0 font-mono text-sm text-foreground tabular-nums">
              {amountText}
            </span>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "grid size-4 shrink-0 place-items-center transition-colors",
                settled ? "text-success" : "text-danger",
              )}
            >
              <svg
                viewBox="0 0 16 16"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="8" cy="8" r="6" />
                <motion.path
                  d="M8 4.8v3.4"
                  animate={{ opacity: settled ? 0 : 1 }}
                  transition={fade}
                />
                <motion.path
                  d="M8 11h.01"
                  animate={{ opacity: settled ? 0 : 1 }}
                  transition={fade}
                />
                <motion.path
                  d="M5.2 8.2 7.2 10.2 10.9 5.9"
                  pathLength={1}
                  initial={false}
                  animate={{ pathLength: settled ? 1 : 0 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </svg>
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {headline}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-3">{reason}</p>
          {method ? (
            <p className="truncate text-[11px] text-ink-3">{method}</p>
          ) : null}
        </div>
      </div>

      <ol aria-labelledby={labelId} className="flex items-start">
        {attempts.map((attempt, index) => {
          const isNext = attempt.id === nextId;
          // The segment into the next dot carries the countdown; segments
          // behind it are done, segments ahead of it have not started.
          const fill =
            index < nextIndex - 1 || (nextIndex < 0 && index < attempts.length)
              ? 1
              : index === nextIndex - 1
                ? progress
                : 0;
          return (
            <li
              key={attempt.id}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5"
            >
              {/* The wait belongs to the timer below, not to four list items
                  that would each carry a number changing every second. */}
              <span className="sr-only">
                {`Attempt ${index + 1}, ${attempt.label}, ${
                  attempt.status === "failed"
                    ? "failed"
                    : attempt.status === "succeeded"
                      ? "succeeded"
                      : isNext
                        ? busy
                          ? "running now"
                          : "next"
                        : "scheduled"
                }`}
              </span>

              {index < attempts.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute top-2 -right-1/2 left-1/2 h-px overflow-hidden bg-hairline-strong"
                >
                  <motion.span
                    className={cn(
                      "block h-full origin-left",
                      settled ? "bg-success" : "bg-cobalt-bright",
                    )}
                    initial={false}
                    animate={{ scaleX: fill }}
                    // A countdown advances at the rate time does: linear, and
                    // one tick long, so it crawls rather than stepping.
                    transition={
                      motionSafe
                        ? { duration: 1, ease: easings.linear }
                        : { duration: 0 }
                    }
                  />
                </span>
              ) : null}

              <AttemptDot
                status={attempt.status}
                next={isNext}
                motionSafe={motionSafe}
              />
              <span
                aria-hidden
                title={attempt.label}
                className="max-w-full truncate font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
              >
                {attempt.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span
          role="timer"
          aria-live="off"
          aria-label={
            settled
              ? "Charged"
              : spent
                ? "No attempts left"
                : busy
                  ? "Trying now"
                  : `Next attempt in ${spokenWait(left)}`
          }
          className="min-w-0 flex-1 truncate text-xs text-ink-2"
        >
          <span aria-hidden>
            {settled ? (
              "Charged"
            ) : spent ? (
              "No attempts left"
            ) : busy ? (
              "Trying now"
            ) : (
              <>
                Next attempt in{" "}
                <span className="font-mono text-signal tabular-nums">
                  {clockFace(left)}
                </span>
              </>
            )}
          </span>
        </span>

        {settled || spent ? null : (
          <button
            type="button"
            onClick={() => {
              // aria-disabled rather than disabled: an attempt that starts must
              // not throw the keyboard back to the top of the card.
              if (busy) return;
              onRetryNow?.();
            }}
            aria-busy={busy || undefined}
            aria-disabled={busy || undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-input bg-surface-2 px-3 text-xs font-medium text-foreground transition-colors outline-none",
              "hover:bg-accent active:bg-cobalt-wash aria-disabled:opacity-70",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <span className="grid size-3.5 shrink-0 place-items-center">
              <motion.svg
                viewBox="0 0 16 16"
                aria-hidden
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                animate={motionSafe && busy ? { rotate: 360 } : { rotate: 0 }}
                transition={
                  motionSafe && busy
                    ? { duration: 0.9, ease: easings.linear, repeat: Infinity }
                    : { duration: durations.fast, ease: easings.enter }
                }
                style={{ originX: 0.5, originY: 0.5 }}
              >
                <path d="M13 8a5 5 0 1 1-1.6-3.7" />
                <path d="M13 2.6V5.2h-2.6" />
              </motion.svg>
            </span>
            {busy ? "Trying" : "Retry now"}
          </button>
        )}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
