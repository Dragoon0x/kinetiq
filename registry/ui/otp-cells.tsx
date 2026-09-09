"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OtpCellsStatus = "idle" | "verifying" | "verified" | "failed";

export type OtpCellsProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Number of cells. @default 6 */
  length?: number;
  /** Controlled code, digits only; longer input is truncated. */
  value?: string;
  /** Initial code for uncontrolled usage. */
  defaultValue?: string;
  /** Fires from typing, paste and the clear after a failure. */
  onValueChange?: (code: string) => void;
  /** Fires once from a timer after the last digit lands; re-arms when the code shrinks. */
  onComplete?: (code: string) => void;
  /** Set by the host once `onComplete` has fired. @default "idle" */
  status?: OtpCellsStatus;
  /** Shown under the row while `status` is failed. @default "That code did not match." */
  errorMessage?: string;
  /** Group name for assistive technology. */
  label: string;
  /** Visible line under the label, e.g. where the code was sent. */
  hint?: string;
  className?: string;
};

/** Codes are digits only, capped at the cell count. */
const sanitize = (raw: string, count: number) =>
  raw.replace(/\D/g, "").slice(0, count);

/** The failure shake: symmetric, no spring, no bounce. */
const SHAKE = [0, -6, 6, -4, 4, 0];

/** Milliseconds after the last cell's pop before verification is asked for. */
const LANDING_MS = 200;

type Arrivals = {
  code: string;
  /** Per-cell mount stamp: a new stamp replays the pop. */
  stamps: number[];
  /** The first cell of the latest batch; the cascade counts from it. */
  from: number;
  /** The stamp shared by the latest batch. */
  gen: number;
};

/**
 * Six real inputs, one digit each, that behave as one field. A paste — from the
 * clipboard or from a `value` that arrives several digits at a time — lands the
 * digits in a cascade: each new cell's digit pops in from 1.3× on `snap`,
 * staggered by `cascade()` so the row settles inside the 600ms budget. The last
 * digit triggers verification: `onComplete` fires from a timer once the cascade
 * has landed, and while the host holds `verifying` a dash runs around the last
 * cell at a constant rate. `verified` stamps a tick badge onto the last cell on
 * `recoil` and turns the row success; `failed` shakes the row on a symmetric
 * tween with no spring, clears it, and returns focus to the first cell.
 *
 * Tab enters the row at the first empty cell (a roving tabindex); Left and
 * Right move, Home and End jump, Backspace clears and steps back, Delete clears
 * in place. Under reduced motion digits appear in place, the dash holds still
 * and the words carry the state, the badge appears at rest, and nothing shakes.
 */
export function OtpCells({
  ref,
  length = 6,
  value,
  defaultValue = "",
  onValueChange,
  onComplete,
  status = "idle",
  errorMessage = "That code did not match.",
  label,
  hint,
  className,
}: OtpCellsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;

  const [uncontrolled, setUncontrolled] = React.useState(() =>
    sanitize(defaultValue, length),
  );
  const isControlled = value !== undefined;
  const code = sanitize(isControlled ? value : uncontrolled, length);
  const isFull = code.length === length;
  const locked = status === "verifying" || status === "verified";

  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const [focused, setFocused] = React.useState<number | null>(null);
  // Tab lands on the first empty cell — the one the next digit belongs in.
  const anchor = focused ?? Math.min(code.length, length - 1);

  // Which cells just gained a digit, and where the batch began. Derived during
  // render against the last committed code, so a paste and a typed digit are
  // told apart by how many cells changed at once.
  const [arrivals, setArrivals] = React.useState<Arrivals>({
    code,
    stamps: [],
    from: 0,
    gen: 0,
  });
  if (arrivals.code !== code) {
    const gen = arrivals.gen + 1;
    const stamps = Array.from({ length }, (_, i) =>
      code[i] !== undefined && code[i] !== arrivals.code[i]
        ? gen
        : (arrivals.stamps[i] ?? 0),
    );
    const first = stamps.indexOf(gen);
    setArrivals({
      code,
      stamps,
      from: first === -1 ? arrivals.from : first,
      gen,
    });
  }
  const stagger = cascade(length);
  const delayFor = (i: number) =>
    arrivals.stamps[i] === arrivals.gen
      ? Math.max(0, i - arrivals.from) * stagger
      : 0;

  const changeRef = React.useRef(onValueChange);
  const completeRef = React.useRef(onComplete);
  React.useEffect(() => {
    changeRef.current = onValueChange;
    completeRef.current = onComplete;
  }, [onValueChange, onComplete]);

  const commit = React.useCallback(
    (next: string) => {
      if (!isControlled) setUncontrolled(next);
      changeRef.current?.(next);
    },
    [isControlled],
  );

  const focusCell = (i: number) => {
    const clamped = Math.min(length - 1, Math.max(0, i));
    setFocused(clamped);
    inputRefs.current[clamped]?.focus();
  };

  // Verification is asked for once the last digit has landed, not the instant
  // it is typed — that beat is what lets the cascade finish before the ring.
  const firedFor = React.useRef("");
  const lastDelay = delayFor(length - 1);
  React.useEffect(() => {
    if (!isFull) {
      firedFor.current = "";
      return;
    }
    if (firedFor.current === code) return;
    const timer = window.setTimeout(
      () => {
        firedFor.current = code;
        completeRef.current?.(code);
      },
      motionSafe ? lastDelay * 1000 + LANDING_MS : 0,
    );
    return () => window.clearTimeout(timer);
  }, [code, isFull, motionSafe, lastDelay]);

  // A failure shakes, then clears and hands focus back to the first cell.
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (status !== "failed") return;
    const node = rowRef.current;
    const controls =
      motionSafe && node
        ? animate(
            node,
            { x: SHAKE },
            { duration: durations.slow, ease: easings.move },
          )
        : null;
    const timer = window.setTimeout(
      () => {
        commit("");
        inputRefs.current[0]?.focus();
      },
      motionSafe ? durations.slow * 1000 : 0,
    );
    return () => {
      controls?.stop();
      window.clearTimeout(timer);
    };
  }, [status, motionSafe, commit]);

  // Digits land at the cell they were aimed at and overwrite from there, so a
  // retyped middle digit never wipes the tail; the code stays contiguous
  // because a cell past the fill simply writes at the fill.
  const write = (i: number, digits: string) => {
    const at = Math.min(i, code.length);
    const next = (
      code.slice(0, at) +
      digits +
      code.slice(at + digits.length)
    ).slice(0, length);
    commit(next);
    focusCell(at + digits.length);
  };

  const handleChange = (i: number, raw: string) => {
    if (locked) return;
    const old = code[i] ?? "";
    const typed = sanitize(raw, length);
    // Typing over a filled cell yields old+new or new+old; the new digit is
    // whichever one the old value does not account for.
    const digits = typed.length > 1 && old ? typed.replace(old, "") : typed;
    if (digits) write(i, digits);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    i: number,
  ) => {
    const last = Math.min(code.length, length - 1);
    switch (event.key) {
      case "Backspace": {
        event.preventDefault();
        if (locked) return;
        // A filled cell clears itself; an empty one clears the cell before it.
        const at = Math.max(0, i < code.length ? i : i - 1);
        commit(code.slice(0, at) + code.slice(at + 1));
        focusCell(at);
        break;
      }
      case "Delete":
        event.preventDefault();
        if (!locked) commit(code.slice(0, i) + code.slice(i + 1));
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusCell(i - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        focusCell(Math.min(last, i + 1));
        break;
      case "Home":
        event.preventDefault();
        focusCell(0);
        break;
      case "End":
        event.preventDefault();
        focusCell(last);
        break;
      default:
        break;
    }
  };

  const handlePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    i: number,
  ) => {
    event.preventDefault();
    if (locked) return;
    const digits = sanitize(event.clipboardData.getData("text"), length);
    if (digits) write(i, digits);
  };

  const tone =
    status === "verified"
      ? "border-success"
      : status === "failed"
        ? "border-danger"
        : status === "verifying"
          ? "border-cobalt-bright/60"
          : "border-input focus-within:border-ring";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex flex-col gap-0.5">
        <span id={labelId} className="text-sm font-semibold">
          {label}
        </span>
        {hint ? (
          <span id={hintId} className="text-xs text-ink-3">
            {hint}
          </span>
        ) : null}
      </div>

      <div
        ref={rowRef}
        role="group"
        aria-labelledby={labelId}
        aria-describedby={
          cn(hint && hintId, status === "failed" && errorId) || undefined
        }
        aria-busy={status === "verifying" || undefined}
        className="flex items-center gap-2"
      >
        {Array.from({ length }, (_, i) => {
          const digit = code[i] ?? "";
          const isLast = i === length - 1;
          return (
            <span
              key={i}
              className={cn(
                "relative h-11 max-w-10 min-w-0 flex-[1_1_2.5rem] rounded-2 border bg-surface-1 transition-colors",
                tone,
                status === "verifying" && isLast && "border-transparent",
              )}
            >
              <input
                ref={(node) => {
                  inputRefs.current[i] = node;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${i + 1} of ${length}`}
                aria-invalid={status === "failed" || undefined}
                value={digit}
                readOnly={locked}
                tabIndex={i === anchor ? 0 : -1}
                onChange={(event) => handleChange(i, event.target.value)}
                onKeyDown={(event) => handleKeyDown(event, i)}
                onPaste={(event) => handlePaste(event, i)}
                onFocus={(event) => {
                  setFocused(i);
                  event.target.select();
                }}
                onBlur={() => setFocused(null)}
                // The input keeps the real value for the caret and assistive
                // technology; the visible digit is the animated span above it.
                className="absolute inset-0 size-full rounded-2 bg-transparent text-center font-mono text-lg text-transparent caret-transparent outline-none selection:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-lg font-medium text-foreground tabular-nums"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {digit ? (
                    <motion.span
                      key={`${i}-${arrivals.stamps[i] ?? 0}`}
                      initial={
                        motionSafe ? { scale: 1.3, opacity: 0 } : { opacity: 0 }
                      }
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.snap,
                              delay: delayFor(i),
                              opacity: {
                                duration: durations.blink,
                                delay: delayFor(i),
                              },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      {digit}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
              {!digit && i === anchor && !locked ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-3 bottom-2 h-0.5 rounded-full bg-ink-3/50"
                />
              ) : null}

              {isLast && status === "verifying" ? (
                <svg
                  viewBox="0 0 40 44"
                  aria-hidden
                  className="pointer-events-none absolute inset-0 size-full text-cobalt-bright"
                >
                  <rect
                    x="1"
                    y="1"
                    width="38"
                    height="42"
                    rx="6"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="2"
                  />
                  <motion.rect
                    x="1"
                    y="1"
                    width="38"
                    height="42"
                    rx="6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray="0.3 0.7"
                    initial={{ strokeDashoffset: 0 }}
                    animate={{ strokeDashoffset: motionSafe ? -1 : 0 }}
                    // A wait runs at a constant rate; reduced motion holds it still.
                    transition={
                      motionSafe
                        ? {
                            duration: 1.1,
                            ease: easings.linear,
                            repeat: Infinity,
                          }
                        : { duration: 0 }
                    }
                  />
                </svg>
              ) : null}

              <AnimatePresence>
                {isLast && status === "verified" ? (
                  <motion.span
                    key="badge"
                    aria-hidden
                    className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-raised"
                    initial={
                      motionSafe ? { scale: 1.6, opacity: 0 } : { opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor() }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.recoil,
                            opacity: { duration: durations.blink },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className="size-3 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                    </svg>
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </span>
          );
        })}
      </div>

      {/* One grid cell for every line, so a swap never changes the height. */}
      <div className="grid">
        <AnimatePresence initial={false}>
          <motion.p
            key={status}
            id={status === "failed" ? errorId : undefined}
            role={status === "failed" ? "alert" : undefined}
            className={cn(
              "col-start-1 row-start-1 text-xs",
              status === "failed" && "font-medium text-danger",
              status === "verified" && "font-medium text-success",
              (status === "idle" || status === "verifying") && "text-ink-3",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {status === "failed"
              ? errorMessage
              : status === "verifying"
                ? "Verifying"
                : status === "verified"
                  ? "Verified"
                  : `${code.length} of ${length}`}
          </motion.p>
        </AnimatePresence>
      </div>

      <span role="status" className="sr-only">
        {status === "verifying"
          ? "Verifying"
          : status === "verified"
            ? "Verified"
            : ""}
      </span>
    </div>
  );
}
