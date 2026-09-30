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

export type StepStatus =
  "waiting" | "running" | "passed" | "failed" | "skipped";

export type BuildLine = {
  id: string;
  text: string;
  /** @default "info" */
  level?: "info" | "warn" | "error";
};

export type BuildStep = {
  id: string;
  name: string;
  /** @default "waiting" */
  status?: StepStatus;
  /** Seconds this step took, or has taken so far. */
  seconds?: number;
  /** Everything the step has printed, oldest first. @default [] */
  lines?: BuildLine[];
};

/** `queued` is a build with steps still to run and none running: it has not
 *  passed anything yet, so it never stamps a verdict. */
export type BuildPhase = "queued" | "running" | "passed" | "failed";

/** `stepId` and the 1-based `index` name the step in flight or the one that
 *  failed; `seconds` is every step added up. */
export type BuildReading = {
  phase: BuildPhase;
  stepId: string | null;
  index: number;
  passed: number;
  seconds: number;
};

export type BuildLogProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The build, in order. */
  steps: BuildStep[];
  /** Controlled set of open step ids. */
  open?: string[];
  /** Initial open set; without one the log follows the step in flight. */
  defaultOpen?: string[];
  /** Fires from the press or key that folded or unfolded a step. */
  onOpenChange?: (ids: string[]) => void;
  /** The whole reading — a state, so it also fires on the first commit. */
  onBuildChange?: (reading: BuildReading) => void;
  /** How many lines a running step shows. @default 6 */
  tailLines?: number;
  /** What the summary stamps; defaults to the steps added up. */
  totalSeconds?: number;
  /** Renders every duration. @default seconds, then m:ss */
  formatSeconds?: (seconds: number) => string;
  /** Names the log. @default "Build" */
  label?: string;
  className?: string;
};

const NO_LINES: BuildLine[] = [];

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const statusOf = (step: BuildStep): StepStatus => step.status ?? "waiting";

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** Printed figures: seconds under a minute, m:ss above it. */
const defaultFormat = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole} s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** Spoken durations are words: a reader hears "1 minute 9 seconds", not "1:09",
 *  which a screen reader would read as a time of day. */
const spokenSpan = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return countPhrase(whole, "second");
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0
    ? countPhrase(minutes, "minute")
    : `${countPhrase(minutes, "minute")} ${countPhrase(rest, "second")}`;
};

/** Host copy read back as a sentence: capitalised even when the log line was
 *  lowercase, and given one full stop rather than the two it would carry if it
 *  already ended in one. */
const sentenceOf = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
};

const dotFor = (status: StepStatus): string =>
  status === "passed"
    ? "bg-success"
    : status === "failed"
      ? "bg-danger"
      : status === "running"
        ? "bg-cobalt-bright"
        : "bg-hairline-strong";

/**
 * One step of the build: a disclosure header, and a body whose height is
 * measured by its own ResizeObserver rather than reserved. The observer reports
 * every change, so a line landing while the step is open grows the body instead
 * of jumping it, and a folded step costs nothing.
 */
function LogStep({
  step,
  index,
  total,
  open,
  tail,
  motionSafe,
  headId,
  panelId,
  formatSeconds,
  onToggle,
  onKeyDown,
}: {
  step: BuildStep;
  index: number;
  total: number;
  open: boolean;
  tail: number;
  motionSafe: boolean;
  headId: string;
  panelId: string;
  formatSeconds: (seconds: number) => string;
  onToggle: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  const status = statusOf(step);
  const lines = step.lines ?? NO_LINES;
  // A running step tails: only the last few lines stand, so a step that prints
  // for a minute never grows the card without bound.
  const shown = status === "running" ? lines.slice(-Math.max(1, tail)) : lines;

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <li className="flex flex-col">
      <button
        type="button"
        id={headId}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${step.name}, step ${index + 1} of ${total}, ${status}${
          step.seconds === undefined ? "" : ` in ${spokenSpan(step.seconds)}`
        }, ${countPhrase(lines.length, "line")}.`}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={cn(
          // The negative margin puts the caret on the card's own content edge
          // while the hover surface still reaches into the padding.
          "-mx-1.5 flex h-8 items-center gap-2 rounded-2 px-1.5 transition-colors hover:bg-accent",
          focusRing,
        )}
      >
        <motion.span
          aria-hidden
          className="shrink-0 text-ink-3"
          initial={false}
          animate={{ rotate: open ? 90 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
            <path
              d="M6 3.5 10.5 8 6 12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </motion.span>
        <span
          aria-hidden
          className="min-w-0 flex-1 truncate text-left font-mono text-[11px] text-ink"
        >
          {step.name}
        </span>
        <motion.span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", dotFor(status))}
          initial={false}
          // Two keyframes, mirrored: only the step in flight breathes.
          animate={{ opacity: status === "running" && motionSafe ? 0.35 : 1 }}
          transition={
            status === "running" && motionSafe
              ? {
                  duration: durations.page,
                  ease: easings.move,
                  repeat: Infinity,
                  repeatType: "mirror",
                }
              : fade
          }
        />
        <span
          aria-hidden
          className="w-10 shrink-0 text-right font-mono text-[10px] text-ink-3 tabular-nums"
        >
          {step.seconds === undefined ? "—" : formatSeconds(step.seconds)}
        </span>
      </button>

      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={headId}
        aria-hidden={!open}
        inert={!open}
        initial={false}
        animate={{ height: open ? height : 0 }}
        transition={settle}
        className="overflow-clip [contain:paint]"
      >
        <div ref={setNode} className="pt-1 pb-1.5 pl-5">
          {/* Wide lines scroll inside their own box; the card never overflows. */}
          <div className="w-full overflow-x-auto">
            <ol role="list" className="flex w-max min-w-full flex-col gap-0.5">
              {shown.map((line) => (
                <motion.li
                  key={line.id}
                  className="flex items-baseline gap-1.5 font-mono text-[10px] whitespace-pre"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={motionSafe ? springs.glide : fade}
                >
                  {line.level && line.level !== "info" ? (
                    <span
                      className={cn(
                        "shrink-0 tracking-[0.08em] uppercase",
                        line.level === "error" ? "text-danger" : "text-warn",
                      )}
                    >
                      {line.level}
                    </span>
                  ) : null}
                  <span
                    className={
                      line.level === "error" ? "text-ink" : "text-ink-2"
                    }
                  >
                    {line.text}
                  </span>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </motion.div>
    </li>
  );
}

/**
 * A build read the way an engineer reads one: step headers, and only the lines
 * that matter open. The step in flight opens itself and tails — new lines
 * arrive at the bottom from `distances.nudge` on `glide` while the oldest drop
 * out of the tail window, so the body holds one steady height once the window
 * is full — and each body's height comes from a ResizeObserver on its own
 * content rather than a reserve. A step that finishes folds back to its header,
 * unless the reader has pressed one, because a reader's choice outranks the
 * script.
 *
 * When the build settles the summary stamps: a pass lands from 1.2× on
 * `recoil`, two visible bounces, and a failure arrives on `snap` at 1.06 → 1
 * with no bounce at all, because a failed build does not get to celebrate.
 *
 * Every header is a real disclosure button in the tab order, Arrow Up and Down
 * move between headers and Home and End jump; a warn or error line prints its
 * level rather than relying on colour, and wide lines scroll inside their own
 * box. The polite region speaks settled steps only — a tail arriving several
 * lines a second would drown a reader. Every duration comes from props, so the
 * log never reads a clock. Under reduced motion the lines still arrive and the
 * heights still change, on tweens, and the summary appears at full size.
 */
export function BuildLog({
  ref,
  steps,
  open,
  defaultOpen,
  onOpenChange,
  onBuildChange,
  tailLines = 6,
  totalSeconds,
  formatSeconds = defaultFormat,
  label = "Build",
  className,
}: BuildLogProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  // Null means the reader has not chosen yet, so the log follows the script.
  const [own, setOwn] = React.useState<string[] | null>(defaultOpen ?? null);

  const count = steps.length;
  const failedIndex = steps.findIndex((step) => statusOf(step) === "failed");
  const runningIndex = steps.findIndex((step) => statusOf(step) === "running");
  const passed = steps.filter((step) => statusOf(step) === "passed").length;
  const seconds =
    totalSeconds ?? steps.reduce((sum, step) => sum + (step.seconds ?? 0), 0);

  const waitingIndex = steps.findIndex((step) => statusOf(step) === "waiting");
  // A build passes only when every step has: one with steps still waiting and
  // none running is queued, not passed — otherwise a log that has not started
  // would stamp a verdict it has not earned.
  const phase: BuildPhase =
    failedIndex >= 0
      ? "failed"
      : runningIndex >= 0
        ? "running"
        : waitingIndex >= 0
          ? "queued"
          : "passed";
  const settled = count > 0 && (phase === "passed" || phase === "failed");
  const activeIndex =
    failedIndex >= 0
      ? failedIndex
      : runningIndex >= 0
        ? runningIndex
        : waitingIndex >= 0
          ? waitingIndex
          : count - 1;
  const activeStep = steps[activeIndex];

  const following = steps[runningIndex]?.id;
  const openIds = open ?? own ?? (following ? [following] : []);

  const setOpenIds = (next: string[]) => {
    if (open === undefined) setOwn(next);
    onOpenChange?.(next);
  };

  const toggle = (id: string) => {
    setOpenIds(
      openIds.includes(id)
        ? openIds.filter((one) => one !== id)
        : [...openIds, id],
    );
  };

  const moveTo = (index: number) => {
    const step = steps[Math.min(count - 1, Math.max(0, index))];
    if (!step) return;
    document.getElementById(`${baseId}-head-${step.id}`)?.focus();
  };

  const onHeadKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const move =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (move !== 0) {
      event.preventDefault();
      moveTo(index + move);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(count - 1);
    }
  };

  // A step settling is a settled event, so the first commit speaks nothing, and
  // the tail itself is never announced: several lines a second would drown a
  // reader who only needs to know how the step ended.
  const signature = steps
    .map((step) => `${step.id}:${statusOf(step)}`)
    .join(",");
  const [spoken, setSpoken] = React.useState({ key: signature, sentence: "" });
  if (spoken.key !== signature) {
    const before = new Map(
      spoken.key
        .split(",")
        .filter(Boolean)
        .map((entry) => {
          const cut = entry.lastIndexOf(":");
          return [entry.slice(0, cut), entry.slice(cut + 1)] as const;
        }),
    );
    const wasSettled = steps.every((step) => {
      const was = before.get(step.id);
      return was !== undefined && was !== "waiting" && was !== "running";
    });
    const landed = steps.find((step) => {
      const now = statusOf(step);
      return (
        (now === "passed" || now === "failed") && before.get(step.id) !== now
      );
    });
    const failedStep = failedIndex >= 0 ? steps[failedIndex] : undefined;
    const reason = failedStep?.lines?.filter((line) => line.level === "error");
    const note = reason && reason.length > 0 ? reason[reason.length - 1] : null;

    const sentence =
      settled && !wasSettled
        ? `Build ${phase} in ${spokenSpan(seconds)}.${
            phase === "failed" && note ? ` ${sentenceOf(note.text)}` : ""
          }`
        : landed
          ? `${landed.name} ${statusOf(landed)}${
              landed.seconds === undefined
                ? ""
                : ` in ${spokenSpan(landed.seconds)}`
            }.`
          : "";
    setSpoken({ key: signature, sentence });
  }

  const buildRef = React.useRef(onBuildChange);
  React.useEffect(() => {
    buildRef.current = onBuildChange;
  });
  // The reading is a state, not an event: a host that mounts mid-build sees the
  // same log the component does, from the first commit.
  React.useEffect(() => {
    buildRef.current?.({
      phase,
      stepId: activeStep?.id ?? null,
      index: count === 0 ? 0 : activeIndex + 1,
      passed,
      seconds,
    });
  }, [phase, activeStep?.id, activeIndex, count, passed, seconds]);

  const [footNode, setFootNode] = React.useState<HTMLDivElement | null>(null);
  const [footHeight, setFootHeight] = React.useState(0);
  React.useEffect(() => {
    if (!footNode) return;
    const observer = new ResizeObserver(() =>
      setFootHeight(footNode.offsetHeight),
    );
    observer.observe(footNode);
    return () => observer.disconnect();
  }, [footNode]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums">
          {passed} of {count} steps · {formatSeconds(seconds)}
        </span>
      </div>

      <ol role="list" className="flex flex-col">
        {steps.map((step, index) => (
          <LogStep
            key={step.id}
            step={step}
            index={index}
            total={count}
            open={openIds.includes(step.id)}
            tail={tailLines}
            motionSafe={motionSafe}
            headId={`${baseId}-head-${step.id}`}
            panelId={`${baseId}-body-${step.id}`}
            formatSeconds={formatSeconds}
            onToggle={() => toggle(step.id)}
            onKeyDown={(event) => onHeadKeyDown(event, index)}
          />
        ))}
      </ol>

      <motion.div
        initial={false}
        animate={{ height: footHeight }}
        transition={settle}
        // The negative margin cancels the column's own gap while the summary is
        // absent, so a running build holds no empty room for it.
        className="-mt-1.5 overflow-clip [contain:paint]"
      >
        <div ref={setFootNode} className={cn(settled && "pt-1.5")}>
          <AnimatePresence initial={false}>
            {settled ? (
              <motion.div
                // Keyed by phase so a build that fails after passing swaps
                // stamps rather than recolouring one.
                key={phase}
                className={cn(
                  "flex items-center gap-2 rounded-2 border px-2.5 py-2",
                  phase === "failed"
                    ? "border-danger/40 bg-danger/10"
                    : "border-success/40 bg-success/10",
                )}
                initial={
                  motionSafe
                    ? { opacity: 0, scale: phase === "passed" ? 1.2 : 1.06 }
                    : { opacity: 0, scale: 1 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...(phase === "passed" ? springs.recoil : springs.snap),
                        opacity: { duration: durations.blink },
                      }
                    : fade
                }
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono text-[11px] font-medium",
                    phase === "failed" ? "text-danger" : "text-success",
                  )}
                >
                  Build {phase}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink tabular-nums">
                  {formatSeconds(seconds)}
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
