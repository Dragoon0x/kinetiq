"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StakeTerm = {
  /** Lock length in days. */
  days: number;
  /** Annual rate for this term, in percent. */
  apr: number;
};

export type StakeLockProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The sum being staked. */
  amount: number;
  /** Ticker printed after every figure. @default "BSN" */
  symbol?: string;
  /** The detents, ascending by days. */
  terms?: StakeTerm[];
  /** Controlled term, in days. */
  value?: number;
  /** Initial term for uncontrolled usage. @default the second term */
  defaultValue?: number;
  /** Fires from the pointer or key that moved the term. */
  onValueChange?: (days: number) => void;
  /** Controlled lock state. */
  locked?: boolean;
  /** Initial lock state for uncontrolled usage. @default false */
  defaultLocked?: boolean;
  /** Fires from the press that locked or cancelled. */
  onLockedChange?: (locked: boolean) => void;
  /** Formats the stake and the projected yield. */
  format?: (value: number) => string;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

const DEFAULT_TERMS: StakeTerm[] = [
  { days: 30, apr: 3.2 },
  { days: 90, apr: 4.8 },
  { days: 180, apr: 6.4 },
  { days: 365, apr: 8.1 },
];

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A figure whose digits roll to their new value on `snap` — one crisp
 * overshoot, the physics of an indicator changing position. Hidden from
 * assistive technology because the card speaks the same figure in a sentence.
 */
function RollingFigure({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
        const key = value.length - index;
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
              transition={motionSafe ? springs.snap : { duration: 0 }}
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

const pad = (value: number) => String(Math.floor(value)).padStart(2, "0");

/** Milliseconds the cancel stays armed before it forgets it was pressed. */
const ARM_MS = 4000;
/** Pointer travel before a press becomes a drag, so plain clicks survive. */
const SLOP = 4;

const BUTTON_CLASS =
  "flex h-8 shrink-0 items-center justify-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Mounted only while the lock is shut, so a second lock is a second clock
 * rather than a stale one resumed. Elapsed time is measured from a
 * `performance.now()` taken when the interval starts — never a clock read
 * during render — and the interval stops while the tab is hidden, catching the
 * remainder up the moment it comes back.
 */
function LockCountdown({
  termMs,
  onComplete,
}: {
  termMs: number;
  onComplete: () => void;
}) {
  const [elapsed, setElapsed] = React.useState(0);
  const doneRef = React.useRef(false);
  const completeRef = React.useRef(onComplete);
  React.useEffect(() => {
    completeRef.current = onComplete;
  });

  React.useEffect(() => {
    const started = performance.now();
    let timer = 0;
    const read = () => {
      const next = performance.now() - started;
      setElapsed(next);
      if (next >= termMs && !doneRef.current) {
        doneRef.current = true;
        completeRef.current();
      }
    };
    const stop = () => {
      if (timer === 0) return;
      window.clearInterval(timer);
      timer = 0;
    };
    const run = () => {
      if (timer !== 0) return;
      timer = window.setInterval(read, 1000);
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      read();
      run();
    };
    if (!document.hidden) run();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [termMs]);

  const left = Math.max(0, termMs - elapsed) / 1000;
  const text = `${Math.floor(left / 86400)}d ${pad((left % 86400) / 3600)}:${pad((left % 3600) / 60)}:${pad(left % 60)}`;

  return (
    <span
      // A region that spoke every second would babble, so the clock is read on
      // demand and the two transitions are announced instead.
      role="timer"
      aria-live="off"
      aria-label={`Unlocks in ${text}`}
      className="flex h-8 shrink-0 items-center rounded-2 border border-hairline bg-surface-2 px-2.5 font-mono text-xs text-signal tabular-nums"
    >
      {text}
    </span>
  );
}

/**
 * Choose a term, see what it pays, then shut the lock. The rail is a real
 * slider over discrete stops: the knob is exact under the finger while a drag
 * is live, because direct manipulation must never lag behind the hand, and
 * settles onto its detent on `snap` the moment the pointer lifts — one crisp
 * overshoot, so the stops feel like detents rather than a smooth rail. Each
 * stop carries its own rate and the projected yield rolls its digits on `snap`
 * beside it, so a longer term reads as the figure answering.
 *
 * Locking is the second motion: the padlock's shackle drops into its body on
 * `snap`, the physics of a mechanism closing, and the unlock countdown starts.
 * That clock is the only timed thing here — an interval that stops while the
 * tab is hidden and catches up when it returns, so a hidden tab costs nothing
 * and comes back honest. Cancelling early is destructive and never celebrates:
 * the first press arms the button, the second opens the shackle on `flick` with
 * no bounce at all.
 *
 * Under reduced motion nothing springs — the knob jumps between detents, the
 * shackle swaps between open and shut, the digits change in place — but the
 * countdown still ticks and the yield still answers, because a lock's term and
 * its remainder are the whole point of the card.
 */
export function StakeLock({
  ref,
  amount,
  symbol = "BSN",
  terms = DEFAULT_TERMS,
  value,
  defaultValue,
  onValueChange,
  locked,
  defaultLocked = false,
  onLockedChange,
  format = defaultFormat,
  label,
  className,
  "aria-label": ariaLabel,
}: StakeLockProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const termId = `${baseId}-term`;

  const stops = terms.length > 0 ? terms : DEFAULT_TERMS;
  const seed = defaultValue ?? (stops[1] ?? stops[0])?.days ?? 0;
  const [uncontrolledDays, setUncontrolledDays] = React.useState(seed);
  const daysControlled = value !== undefined;
  const days = daysControlled ? value : uncontrolledDays;

  const [uncontrolledLocked, setUncontrolledLocked] =
    React.useState(defaultLocked);
  const lockControlled = locked !== undefined;
  const isLocked = lockControlled ? locked : uncontrolledLocked;

  const index = Math.max(
    0,
    stops.findIndex((term) => term.days === days),
  );
  const term = stops[index] ?? stops[0]!;
  const last = stops.length - 1;
  const detent = last > 0 ? index / last : 0;

  const [drag, setDrag] = React.useState<number | null>(null);
  const [armed, setArmed] = React.useState(false);
  const [matured, setMatured] = React.useState(false);
  const [announced, setAnnounced] = React.useState("");

  const gesture = React.useRef<{
    id: number;
    startX: number;
    dragging: boolean;
    rect: DOMRect;
  } | null>(null);

  React.useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), ARM_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const yieldFor = (stake: StakeTerm) =>
    (amount * stake.apr * stake.days) / (100 * 365);
  const projected = yieldFor(term);

  const commit = (nextIndex: number) => {
    const clamped = Math.min(last, Math.max(0, nextIndex));
    const next = stops[clamped];
    if (!next || next.days === days) return;
    if (!daysControlled) setUncontrolledDays(next.days);
    onValueChange?.(next.days);
  };

  const indexFromClientX = (clientX: number) => {
    const rect = gesture.current?.rect;
    if (!rect || rect.width === 0) return index;
    const fraction = (clientX - rect.left) / rect.width;
    return Math.round(Math.min(1, Math.max(0, fraction)) * last);
  };

  const fractionFromClientX = (clientX: number) => {
    const rect = gesture.current?.rect;
    if (!rect || rect.width === 0) return detent;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isLocked) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dragging: false,
      rect: event.currentTarget.getBoundingClientRect(),
    };
    event.currentTarget.focus();
    commit(indexFromClientX(event.clientX));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      try {
        // Capture only once the press has become a drag — and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    setDrag(fractionFromClientX(event.clientX));
    commit(indexFromClientX(event.clientX));
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    setDrag(null);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isLocked) return;
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 2,
      PageDown: -2,
    };
    const move = moves[event.key];
    const next =
      move !== undefined
        ? index + move
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? last
            : null;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const setLocked = (next: boolean) => {
    if (!lockControlled) setUncontrolledLocked(next);
    onLockedChange?.(next);
  };

  const lock = () => {
    setMatured(false);
    setLocked(true);
    setAnnounced(
      `Locked for ${term.days} days at ${term.apr} percent, earning ${format(projected)} ${symbol}.`,
    );
  };

  const release = () => {
    if (!matured && !armed) {
      setArmed(true);
      setAnnounced(
        "Press again to cancel the lock. The earned yield is forfeit.",
      );
      return;
    }
    setArmed(false);
    setLocked(false);
    setAnnounced(
      matured
        ? `Term complete. ${format(amount + projected)} ${symbol} released.`
        : `Lock cancelled. The earned yield is forfeit and ${format(amount)} ${symbol} is released.`,
    );
    setMatured(false);
  };

  const knobAt = drag ?? detent;
  const knobMove =
    drag !== null || !motionSafe ? { duration: 0 } : springs.snap;
  const cancelLabel = matured
    ? "Unstake"
    : armed
      ? "Confirm cancel"
      : "Cancel lock";

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn("flex w-full flex-col gap-4", className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {label ? (
          <span id={labelId} className="text-sm font-semibold text-foreground">
            {label}
          </span>
        ) : null}
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          {format(amount)} {symbol}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span
            id={termId}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Lock term
          </span>
          <span className="font-mono text-[13px] font-medium text-foreground tabular-nums">
            {term.days} days · {term.apr.toFixed(2)}%
          </span>
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-labelledby={termId}
          aria-valuemin={stops[0]?.days ?? 0}
          aria-valuemax={stops[last]?.days ?? 0}
          aria-valuenow={term.days}
          aria-valuetext={`${term.days} days, ${term.apr} percent, earns ${format(projected)} ${symbol}`}
          aria-disabled={isLocked || undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
          onPointerLeave={(event) => {
            // A press that wanders off before it becomes a drag would otherwise
            // never see its own pointerup.
            if (gesture.current?.dragging === false) endGesture(event);
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "relative mx-2.5 h-6 touch-none rounded-full outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          )}
        >
          <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-hairline">
            <motion.span
              className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-cobalt-bright"
              initial={false}
              animate={{ scaleX: knobAt }}
              transition={knobMove}
            />
          </span>

          {stops.map((stop, position) => (
            <span
              key={stop.days}
              aria-hidden
              style={{ left: `${(position / (last || 1)) * 100}%` }}
              className={cn(
                "pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
                position <= index ? "bg-surface-0" : "bg-hairline-strong",
              )}
            />
          ))}

          {/* The knob sits at a percentage of the track's own width, so it can
              never be pinned to a pixel offset that a narrower card would break. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline-strong bg-surface-0 shadow-raised"
            initial={false}
            animate={{ left: `${knobAt * 100}%` }}
            transition={knobMove}
          />
        </div>

        {/* Each label sits under its own detent, and the two ends anchor to
            the rail's edges instead of centring — a centred end label would
            hang half its width past the track. */}
        <div className="relative mx-2.5 h-4 font-mono text-[10px] text-ink-3 tabular-nums">
          {stops.map((stop, position) => {
            const end = position === 0 || position === last;
            return (
              <span
                key={stop.days}
                style={
                  end
                    ? undefined
                    : { left: `${(position / (last || 1)) * 100}%` }
                }
                className={cn(
                  "absolute top-0",
                  position === 0 && "left-0",
                  position === last && "right-0",
                  !end && "-translate-x-1/2",
                  position === index && "text-foreground",
                )}
              >
                {stop.days}d
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Projected yield
        </span>
        <span className="flex items-baseline gap-1 font-mono text-lg leading-none text-foreground">
          <RollingFigure value={format(projected)} motionSafe={motionSafe} />
          <span className="text-xs text-ink-3">{symbol}</span>
          <span className="sr-only">
            {format(projected)} {symbol}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline transition-colors",
            isLocked
              ? "bg-cobalt-wash text-foreground"
              : "bg-surface-2 text-ink-3",
          )}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0">
            {/* Drawn first so the body paints over the seated legs; lifting the
                shackle is the whole tell that the hasp is open. */}
            <motion.path
              d="M8.5 13V7.5a3.5 3.5 0 1 1 7 0V13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              initial={false}
              animate={{ y: isLocked ? 0 : -3.5 }}
              transition={
                motionSafe
                  ? isLocked
                    ? springs.snap
                    : springs.flick
                  : { duration: 0 }
              }
            />
            <rect
              x="5"
              y="10.5"
              width="14"
              height="9.5"
              rx="2.5"
              fill="currentColor"
            />
          </svg>
        </span>

        {isLocked ? (
          <>
            <LockCountdown
              termMs={term.days * 86400000}
              onComplete={() => setMatured(true)}
            />
            <button
              type="button"
              onClick={release}
              aria-label={
                matured
                  ? "Unstake, the term is complete"
                  : armed
                    ? "Confirm cancel, the earned yield is forfeit"
                    : "Cancel lock early"
              }
              className={cn(
                BUTTON_CLASS,
                armed
                  ? "border-transparent bg-destructive text-destructive-foreground"
                  : "border-input bg-surface-1 text-ink-2 hover:bg-accent hover:text-foreground",
              )}
            >
              {cancelLabel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={lock}
            className={cn(
              BUTTON_CLASS,
              "border-transparent bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            Lock {term.days} days
          </button>
        )}
      </div>

      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
