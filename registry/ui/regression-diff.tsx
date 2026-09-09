"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RegressionTest = {
  id: string;
  name: string;
  /** The previous run's score. */
  before: number;
  /** The current run's score, once it has landed. */
  after?: number;
};

export type RegressionDiffProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The rows, in the order they should read before the sort. */
  tests: RegressionTest[];
  /** The full-bar score. @default 100 */
  max?: number;
  /** How far current may fall below previous before it counts as a regression. @default 0 */
  threshold?: number;
  /** Names the two runs in the legend and the row sentences. @default ["Previous", "Current"] */
  runLabels?: [string, string];
  /** Fires from the beat's timer when the sorted order lands, with the regression count. */
  onSettle?: (regressions: number) => void;
  /** Names the list for assistive technology. */
  label: string;
  className?: string;
};

const RUN_LABELS: [string, string] = ["Previous", "Current"];

/**
 * The beat between the last bar landing and the sort. Long enough for the
 * last draw to be read as a result, short enough that the list does not
 * look stuck.
 */
const BEAT_MS = 360;

/** Keeps the callback out of the effect's dependencies so a re-render never restarts the beat. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * One row per test, two scores per row. Both draw as horizontal bars — the
 * previous run in a muted ink, the current in cobalt — growing from the
 * left on `glide`, a quantity settling. A current score that falls below the
 * previous by more than `threshold` is a regression: its bar and delta turn
 * danger red on a colour tween, never a bounce. When the last current score
 * lands the list holds a beat and then re-orders — regressions to the top,
 * worst first, everything else in its given order — as a FLIP `layout` move
 * on `glide`, so rows travel rather than blink.
 *
 * It is a list of sentences: each row's `aria-label` reads both scores, the
 * delta and the word "regression", so the verdict is never colour alone.
 * The live region speaks the count once, when the sort lands. Under reduced
 * motion the bars swap to their lengths on a tween and the re-order happens
 * without a layout animation — the order still changes, because the order is
 * the information.
 */
export function RegressionDiff({
  ref,
  tests,
  max = 100,
  threshold = 0,
  runLabels = RUN_LABELS,
  onSettle,
  label,
  className,
}: RegressionDiffProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const onSettleRef = useLatest(onSettle);

  const span = max > 0 ? max : 1;
  const isRegression = (test: RegressionTest) =>
    test.after !== undefined && test.before - test.after > threshold;

  const complete =
    tests.length > 0 && tests.every((test) => test.after !== undefined);
  const regressions = tests.filter(isRegression).length;
  // The run's identity is the set of current scores: a new run changes it,
  // which un-sorts the list without any state to reset.
  const signature = tests
    .map((test) => `${test.id}:${test.after ?? ""}`)
    .join("|");
  const [settledFor, setSettledFor] = React.useState<string | null>(null);
  const sorted = complete && settledFor === signature;

  React.useEffect(() => {
    if (!complete) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        setSettledFor(signature);
        onSettleRef.current?.(regressions);
      }, BEAT_MS);
    };
    // A hidden tab holds the beat where it is and resumes on return.
    const onVisibility = () => {
      window.clearTimeout(timer);
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [complete, signature, regressions, onSettleRef]);

  const ordered = sorted
    ? [...tests]
        .map((test, index) => ({ test, index }))
        .sort((a, b) => {
          const ra = isRegression(a.test);
          const rb = isRegression(b.test);
          if (ra !== rb) return ra ? -1 : 1;
          if (ra && rb) {
            const da = (a.test.after ?? 0) - a.test.before;
            const db = (b.test.after ?? 0) - b.test.before;
            if (da !== db) return da - db;
          }
          return a.index - b.index;
        })
        .map((entry) => entry.test)
    : tests;

  const stagger = cascade(tests.length);
  const draw = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const move = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  const announcement = sorted
    ? regressions > 0
      ? `${regressions} ${regressions === 1 ? "regression" : "regressions"} moved to the top`
      : "No regressions"
    : "";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span
          aria-hidden
          className="flex shrink-0 items-center gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-ink-3" />
            {runLabels[0]}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-cobalt-bright" />
            {runLabels[1]}
          </span>
        </span>
      </div>

      <ol role="list" aria-labelledby={labelId} className="flex flex-col gap-1">
        {ordered.map((test, position) => {
          const landed = test.after !== undefined;
          const regressed = isRegression(test);
          const delta = landed ? (test.after ?? 0) - test.before : 0;
          const beforeFraction = Number(clamp01(test.before / span).toFixed(3));
          const afterFraction = landed
            ? Number(clamp01((test.after ?? 0) / span).toFixed(3))
            : 0;
          const sentence = landed
            ? `${test.name}: ${runLabels[0].toLowerCase()} ${test.before}, ${runLabels[1].toLowerCase()} ${test.after}, ${
                delta < 0
                  ? `down ${-delta}`
                  : delta > 0
                    ? `up ${delta}`
                    : "unchanged"
              }${regressed ? ", regression" : ""}`
            : `${test.name}: ${runLabels[0].toLowerCase()} ${test.before}, ${runLabels[1].toLowerCase()} pending`;
          return (
            <motion.li
              key={test.id}
              aria-label={sentence}
              title={sentence}
              layout={motionSafe ? "position" : false}
              transition={move}
              className={cn(
                "flex items-center gap-2 rounded-2 px-2 py-1.5 transition-colors duration-200",
                regressed && sorted ? "bg-danger/10" : "bg-transparent",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "w-24 shrink-0 truncate text-xs transition-colors duration-200",
                  regressed ? "font-medium text-danger" : "text-foreground",
                )}
              >
                {test.name}
              </span>

              <span aria-hidden className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="h-1.5 overflow-hidden rounded-full bg-hairline-strong">
                  <motion.span
                    className="block h-full origin-left rounded-full bg-ink-3"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: beforeFraction }}
                    transition={{
                      ...draw,
                      delay: motionSafe ? position * stagger : 0,
                    }}
                  />
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-hairline-strong">
                  <motion.span
                    className={cn(
                      "block h-full origin-left rounded-full transition-colors duration-200",
                      regressed ? "bg-danger" : "bg-cobalt-bright",
                    )}
                    initial={false}
                    animate={{ scaleX: afterFraction }}
                    transition={draw}
                  />
                </span>
              </span>

              <span
                aria-hidden
                className={cn(
                  "flex h-6 w-12 shrink-0 items-center justify-center rounded-1 border font-mono text-[11px] tabular-nums transition-colors duration-200",
                  !landed && "border-hairline text-ink-3",
                  landed &&
                    regressed &&
                    "border-danger/40 bg-danger/10 text-danger",
                  landed &&
                    !regressed &&
                    "border-hairline-strong bg-surface-0 text-ink-2",
                )}
              >
                {!landed
                  ? "—"
                  : delta < 0
                    ? `−${-delta}`
                    : delta > 0
                      ? `+${delta}`
                      : "0"}
              </span>
            </motion.li>
          );
        })}
      </ol>

      <div className="flex h-5 items-center justify-between gap-3 border-t border-hairline pt-2 text-[11px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={sorted ? "sorted" : complete ? "settling" : "drawing"}
            className={cn(
              "truncate",
              sorted && regressions > 0 ? "text-danger" : "text-ink-3",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {sorted
              ? regressions > 0
                ? `${regressions} ${regressions === 1 ? "regression" : "regressions"} at the top`
                : "No regressions"
              : complete
                ? "Settling"
                : `${tests.filter((test) => test.after !== undefined).length} of ${tests.length} scored`}
          </motion.span>
        </AnimatePresence>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          out of {max}
        </span>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
