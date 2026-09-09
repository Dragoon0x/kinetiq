"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RenderQueueProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Jobs ahead of this one plus one; 0 means it is rendering. */
  position: number;
  /** Seconds until the job starts; rolls as the host updates it. */
  estimateSeconds: number;
  /** 0..1 of the render while `position` is 0. @default 0 */
  progress?: number;
  /** The render finished. @default false */
  done?: boolean;
  /** What is being rendered. */
  title: string;
  /** The invented model's name under the title. */
  model?: string;
  /** Fires from the Leave control while waiting. */
  onCancel?: () => void;
  /** Names the row for assistive technology. */
  label: string;
  /** Copy on the waiting control. @default "Leave" */
  cancelLabel?: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const WORDS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th. */
function suffixOf(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return "th";
  const ones = n % 10;
  return ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
}

const ordinalWord = (n: number): string => WORDS[n - 1] ?? `${n}${suffixOf(n)}`;

/**
 * A number whose digits roll to their value on `snap`. Ten faces tall, so a
 * `y` percentage of its own height moves exactly one face. Hidden from
 * assistive technology; the live region and the bar carry the numbers.
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
        const key = value.length - index;
        if (digit < 0) return <span key={key}>{char}</span>;
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
 * Yours is third. One row for a job waiting its turn: a badge shows the
 * ordinal and, as the host lowers `position`, its digit rolls down on `snap`
 * while the suffix cross-fades; the estimate's seconds roll on the same
 * spring, so waiting reads as counting rather than spinning. At position 0
 * the row expands into the progress view — the inner content is measured
 * with a ResizeObserver and the wrapper's height glides to it on `glide` —
 * the badge cross-fades into a ring that fills to `progress`, and a bar runs
 * the width of the row. `done` closes the ring, draws a tick on `flick`, and
 * the word lands on Done. Leave is the only focusable part and goes with the
 * wait: it leaves on the exit ease once rendering starts.
 *
 * The live region speaks once per position change and once when rendering
 * starts and ends, never per percent. Under reduced motion digits and the
 * suffix swap in place, the height and fills still change on tweens, and the
 * tick appears whole.
 */
export function RenderQueue({
  ref,
  position,
  estimateSeconds,
  progress = 0,
  done = false,
  title,
  model,
  onCancel,
  label,
  cancelLabel = "Leave",
  className,
}: RenderQueueProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const waiting = position > 0 && !done;
  const rendering = position <= 0 && !done;
  const seconds = Math.max(0, Math.round(estimateSeconds));
  const fraction = done
    ? 1
    : Math.round(Math.min(1, Math.max(0, progress)) * 1000) / 1000;
  const percent = Math.round(fraction * 100);
  const phase = done ? "done" : rendering ? "rendering" : "waiting";

  // The waiting line is captured as each position lands, so a ticking
  // estimate never re-announces the same place in line.
  const waitingText = `${ordinalWord(position)} in line, about ${seconds} seconds`;
  const [spoken, setSpoken] = React.useState({ position, text: waitingText });
  if (spoken.position !== position) setSpoken({ position, text: waitingText });
  const announcement = done
    ? "Done"
    : rendering
      ? "Rendering started"
      : spoken.text;

  const [panel, attachPanel] = React.useState<HTMLElement | null>(null);
  const [panelHeight, setPanelHeight] = React.useState(0);
  React.useEffect(() => {
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setPanelHeight(panel.offsetHeight),
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panel]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const layout = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const showPanel = !waiting;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {/* The ordinal and the ring share one cell, so the badge never
            changes size as one gives way to the other. */}
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-2 bg-surface-2"
        >
          <motion.span
            className="col-start-1 row-start-1 flex items-baseline font-mono text-foreground"
            initial={false}
            animate={{ opacity: waiting ? 1 : 0 }}
            transition={fade}
          >
            <span className="text-lg font-semibold">
              <RollingNumber
                value={String(Math.max(0, position))}
                motionSafe={motionSafe}
              />
            </span>
            <span className="grid text-[10px] text-ink-3">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={suffixOf(Math.max(1, position))}
                  className="col-start-1 row-start-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={fade}
                >
                  {suffixOf(Math.max(1, position))}
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.span>
          <motion.svg
            viewBox="0 0 40 40"
            className="col-start-1 row-start-1 size-7"
            initial={false}
            animate={{ opacity: waiting ? 0 : 1 }}
            transition={fade}
          >
            <circle
              cx="20"
              cy="20"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="3"
            />
            <motion.circle
              cx="20"
              cy="20"
              r="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              transform="rotate(-90 20 20)"
              className={done ? "text-success" : "text-cobalt-bright"}
              initial={false}
              animate={{ strokeDashoffset: Number((1 - fraction).toFixed(3)) }}
              transition={layout}
            />
            {done ? (
              <motion.path
                d="M13 20.5 18 25.5 27.5 14.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-success"
                initial={motionSafe ? { pathLength: 0 } : { opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
              />
            ) : null}
          </motion.svg>
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            id={titleId}
            className="truncate text-sm font-medium text-foreground"
          >
            {title}
          </span>
          <span className="flex h-4 items-center gap-1.5 text-xs text-ink-3">
            {model ? (
              <>
                <span className="min-w-0 truncate" title={model}>
                  {model}
                </span>
                <span aria-hidden className="shrink-0">
                  ·
                </span>
              </>
            ) : null}
            <span className="grid shrink-0">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={phase}
                  className="col-start-1 row-start-1 flex items-center whitespace-nowrap"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={fade}
                >
                  {phase === "waiting" ? (
                    <>
                      about&nbsp;
                      <RollingNumber
                        value={String(seconds)}
                        motionSafe={motionSafe}
                      />
                      <span className="sr-only">{seconds}</span>
                      &nbsp;s
                    </>
                  ) : phase === "rendering" ? (
                    "rendering"
                  ) : (
                    "done"
                  )}
                </motion.span>
              </AnimatePresence>
            </span>
          </span>
        </span>

        <AnimatePresence initial={false}>
          {waiting ? (
            <motion.button
              key="leave"
              type="button"
              onClick={() => onCancel?.()}
              initial={
                motionSafe ? { opacity: 0, x: distances.nudge } : { opacity: 0 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: fade }
                  : { duration: durations.fast }
              }
              className={cn(
                "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              {cancelLabel}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Nothing is reserved for the progress view: the wrapper sits at zero
          while waiting and glides to whatever the bar needs once the job
          starts. */}
      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: showPanel ? panelHeight : 0 }}
        transition={layout}
      >
        <div ref={attachPanel} className="flex flex-col gap-1.5 pt-3">
          <div
            aria-hidden
            className="flex items-center justify-between font-mono text-[11px] text-ink-3"
          >
            <span className="tracking-[0.08em] uppercase">
              {done ? "Done" : "Rendering"}
            </span>
            <span className="flex items-center tabular-nums">
              <RollingNumber value={String(percent)} motionSafe={motionSafe} />%
            </span>
          </div>
          <div
            role="progressbar"
            aria-labelledby={titleId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={done ? "Done" : `Rendering, ${percent} percent`}
            aria-hidden={waiting || undefined}
            className="h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong"
          >
            <motion.span
              className={cn(
                "block h-full origin-left rounded-full transition-colors duration-300",
                done ? "bg-success" : "bg-cobalt-bright",
              )}
              initial={false}
              animate={{ scaleX: fraction }}
              transition={layout}
            />
          </div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
