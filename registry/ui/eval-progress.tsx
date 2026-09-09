"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type EvalStatus = "pending" | "pass" | "fail";

export type EvalCase = {
  id: string;
  name: string;
  status: EvalStatus;
};

export type EvalProgressProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The cases in order; a case lands when its status leaves `pending`. */
  results: EvalCase[];
  /** The run is live: sets `aria-busy` and the Running word. */
  playing?: boolean;
  /** Names the bar for assistive technology. */
  label: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits that roll to their new value on `snap`. Ten faces tall, so a `y`
 * of one tenth is exactly one digit; hidden from assistive technology
 * because the bar's `aria-valuetext` already carries the figures.
 */
function RollingNumber({
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
        // Keyed from the right so the units column keeps its identity when
        // the rate gains or loses a digit.
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
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.25em] items-center justify-center"
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
 * A progress bar built from one segment per case. As a case lands its
 * segment fills from the left on `glide` — a green wash for a pass, a red
 * one for a fail — so the bar's length is cases done and its colour is the
 * verdict. A pass then ticks: the check draws on `flick`, the acknowledgement
 * physics. A fail stamps: the cross lands from 1.3× on `glide`, no bounce,
 * because a failure never celebrates. The pass rate in the header rolls its
 * digits on `snap`, the count reads done of total, and a word says Waiting,
 * Running or Done.
 *
 * It is a `role="progressbar"` whose value is cases done and whose text
 * carries passed and failed; the live region speaks each fail as it lands
 * and the final rate once, never a passing case. Under reduced motion the
 * segments fill on a tween, the tick appears whole, the cross fades in, and
 * the digits swap in place.
 */
export function EvalProgress({
  ref,
  results,
  playing = false,
  label,
  className,
}: EvalProgressProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const total = results.length;
  const done = results.filter((item) => item.status !== "pending").length;
  const passed = results.filter((item) => item.status === "pass").length;
  const failed = done - passed;
  const complete = total > 0 && done === total;
  const rate = done > 0 ? Math.round((passed / done) * 100) : 0;

  const word = complete ? "Done" : playing || done > 0 ? "Running" : "Waiting";
  const valueText = `${done} of ${total} cases, ${passed} passed, ${failed} failed`;

  // Cases land in order, so the last failed case is the newest fail; the
  // live region changes only when that changes, and once more at the end.
  const lastFail = [...results]
    .reverse()
    .find((item) => item.status === "fail");
  const announcement = complete
    ? `Done, ${passed} of ${total} passed, ${rate} percent`
    : lastFail
      ? `Case ${lastFail.name} failed`
      : "";

  const fill = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const blink = { duration: durations.blink } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex h-7 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span id={labelId} className="min-w-0 truncate text-sm font-medium">
            {label}
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={word}
              className={cn(
                "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
                complete
                  ? failed > 0
                    ? "text-warn"
                    : "text-success"
                  : "text-ink-3",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {word}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="flex shrink-0 items-baseline gap-2 font-mono">
          <span className="text-[11px] text-ink-3 tabular-nums">
            {done} / {total}
          </span>
          <span
            className={cn(
              "text-sm font-medium transition-colors duration-200",
              failed > 0 ? "text-warn" : "text-foreground",
            )}
          >
            <RollingNumber value={String(rate)} motionSafe={motionSafe} />%
          </span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={valueText}
        aria-busy={playing && !complete ? true : undefined}
        className="grid h-6 gap-0.5"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, total)}, minmax(0, 1fr))`,
        }}
      >
        {results.map((item) => {
          const landed = item.status !== "pending";
          const pass = item.status === "pass";
          return (
            <span
              key={item.id}
              aria-hidden
              title={`${item.name}: ${landed ? item.status : "pending"}`}
              className="relative min-w-0 overflow-hidden rounded-1 bg-hairline-strong"
            >
              <motion.span
                className={cn(
                  "absolute inset-0 origin-left",
                  pass ? "bg-success/20" : "bg-danger/20",
                )}
                initial={false}
                animate={{ scaleX: landed ? 1 : 0 }}
                transition={fill}
              />
              <motion.span
                className={cn(
                  "absolute inset-x-0 bottom-0 h-0.5 origin-left",
                  pass ? "bg-success" : "bg-danger",
                )}
                initial={false}
                animate={{ scaleX: landed ? 1 : 0 }}
                transition={fill}
              />
              {landed ? (
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center",
                    pass ? "text-success" : "text-danger",
                  )}
                >
                  {pass ? (
                    <svg
                      viewBox="0 0 16 16"
                      className="size-2.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {/* The tick is the acknowledgement: it draws on flick
                          once the wash has begun, whole under reduced motion. */}
                      <motion.path
                        d="M3.2 8.6 6.4 11.6 12.8 4.6"
                        pathLength={1}
                        initial={motionSafe ? { pathLength: 0 } : false}
                        animate={{ pathLength: 1 }}
                        transition={
                          motionSafe
                            ? { ...springs.flick, delay: durations.fast }
                            : { duration: 0 }
                        }
                      />
                    </svg>
                  ) : (
                    <motion.svg
                      viewBox="0 0 16 16"
                      className="size-2.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      style={{ originX: 0.5, originY: 0.5 }}
                      initial={
                        motionSafe ? { scale: 1.3, opacity: 0 } : { opacity: 0 }
                      }
                      animate={{ scale: 1, opacity: 1 }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.glide,
                              delay: durations.fast,
                              opacity: { ...blink, delay: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6" />
                    </motion.svg>
                  )}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
