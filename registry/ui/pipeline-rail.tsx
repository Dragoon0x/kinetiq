"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StageStatus =
  "waiting" | "running" | "passed" | "failed" | "skipped";

export type PipelineStage = {
  id: string;
  name: string;
  /** @default "waiting" */
  status?: StageStatus;
  /** Seconds this stage took, or has taken so far. */
  seconds?: number;
  /** 0–1 within a running stage; omit it for a stage that cannot say. */
  progress?: number;
  /** One sentence from the host: why this stage failed. */
  note?: string;
};

export type RailPhase = "waiting" | "running" | "passed" | "failed";

/** `stageId` and the 1-based `index` name the stage in flight, the one that
 *  failed, or the last to land; `seconds` is every stage added up. */
export type RailReading = {
  phase: RailPhase;
  stageId: string | null;
  index: number;
  passed: number;
  seconds: number;
};

export type PipelineRailProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The rail, in run order. */
  stages: PipelineStage[];
  /** Controlled selected stage id; without one the rail follows the stage in
   *  flight until a stage is chosen. */
  selected?: string;
  defaultSelected?: string;
  /** Fires from the press or key that moved the selection. */
  onSelectedChange?: (id: string) => void;
  /** Fires from the press on the rerun control, with the stage it restarts. */
  onRerun?: (id: string) => void;
  /** The whole reading — a state, so it also fires on the first commit. */
  onRailChange?: (reading: RailReading) => void;
  /** Renders every duration on the rail. @default seconds, then m:ss */
  formatSeconds?: (seconds: number) => string;
  /** Verb on the rerun control, before the stage name. @default "Rerun" */
  rerunLabel?: string;
  /** Names the rail. @default "Pipeline" */
  label?: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** Printed figures: seconds under a minute, m:ss above it. */
const defaultFormat = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole} s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** Spoken durations are words: a reader hears "2 minutes 11 seconds", not
 *  "2:11", which a screen reader would read as a time of day. */
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

const STEP_KEYS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

const toneFor = (status: StageStatus): string =>
  status === "passed"
    ? "bg-success"
    : status === "failed"
      ? "bg-danger"
      : status === "running"
        ? "bg-cobalt-bright"
        : "bg-hairline-strong";

const statusOf = (stage: PipelineStage): StageStatus =>
  stage.status ?? "waiting";

/** A stage claims the whole segment once it has landed; a running one fills
 *  only as far as the host can actually measure. */
const shareFor = (stage: PipelineStage): number => {
  const status = statusOf(stage);
  if (status === "waiting") return 0;
  if (status === "running")
    return Math.min(1, Math.max(0, stage.progress ?? 0));
  return 1;
};

/** How a stage names its own state in a sentence. */
const statusPhrase = (stage: PipelineStage): string => {
  const status = statusOf(stage);
  const timed = status === "passed" || status === "failed";
  return timed && stage.seconds !== undefined
    ? `${status} in ${spokenSpan(stage.seconds)}`
    : status;
};

/**
 * A build's stages on one rail, filling in the order they ran. A landed stage's
 * fill scales from its own left origin on `glide` — a quantity settling, not a
 * switch flipping — and the segments arrive in a `cascade()` carried on the
 * list items' opacity, whose target never changes again, so a fill that moves
 * later is never held back by a mount stagger. The stage in flight washes its
 * whole segment rather than claiming a fraction it cannot measure, and pulses
 * between two opacities on a mirrored tween: a spring would drop the middle
 * keyframe, and this is the only ambient loop here.
 *
 * A failed stage stops the rail — everything after it stays dark — and a strip
 * unfolds beneath to a ResizeObserver-measured height with the failure sentence
 * and a rerun control, whose press hands focus back to that stage's own segment
 * before the strip leaves rather than dropping the keyboard on the body.
 *
 * The segments are a roving-tabindex list: Arrow keys step, Home and End jump,
 * selection moves with focus, and each button names itself as one sentence.
 * Every second comes from props, so the rail never reads a clock. Under reduced
 * motion the fills still fill — how far a build got is information — on tweens,
 * with no stagger and no pulse.
 */
export function PipelineRail({
  ref,
  stages,
  selected,
  defaultSelected,
  onSelectedChange,
  onRerun,
  onRailChange,
  formatSeconds = defaultFormat,
  rerunLabel = "Rerun",
  label = "Pipeline",
  className,
}: PipelineRailProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultSelected ?? null,
  );

  const count = stages.length;
  const failedIndex = stages.findIndex((s) => statusOf(s) === "failed");
  const runningIndex = stages.findIndex((s) => statusOf(s) === "running");
  const landed = stages.filter((s) => statusOf(s) === "passed").length;
  const seconds = stages.reduce((sum, s) => sum + (s.seconds ?? 0), 0);

  const phase: RailPhase =
    failedIndex >= 0
      ? "failed"
      : runningIndex >= 0
        ? "running"
        : count > 0 && stages.every((s) => statusOf(s) !== "waiting")
          ? "passed"
          : "waiting";

  const activeIndex =
    failedIndex >= 0
      ? failedIndex
      : runningIndex >= 0
        ? runningIndex
        : phase === "passed"
          ? count - 1
          : Math.max(
              0,
              stages.findIndex((s) => statusOf(s) === "waiting"),
            );
  const activeStage = stages[activeIndex];

  const chosen = selected ?? ownSelected;
  const selectedStage =
    (chosen ? stages.find((s) => s.id === chosen) : undefined) ??
    activeStage ??
    stages[0];
  const selectedId = selectedStage?.id ?? null;
  const selectedIndex = stages.findIndex((s) => s.id === selectedId);

  const failedStage = failedIndex >= 0 ? stages[failedIndex] : undefined;

  // A phase change is a settled event, so the first commit speaks nothing.
  // Setting during render means this pass already reads the NEW freeze rather
  // than the one it is replacing.
  const spokenKey = `${phase}:${activeStage?.id ?? ""}`;
  const [spoken, setSpoken] = React.useState({ key: spokenKey, sentence: "" });
  if (spoken.key !== spokenKey) {
    const at = `stage ${activeIndex + 1} of ${count}`;
    const sentence =
      phase === "failed" && failedStage
        ? `${failedStage.name} failed at stage ${failedIndex + 1} of ${count}.${
            failedStage.note ? ` ${sentenceOf(failedStage.note)}` : ""
          }`
        : phase === "passed"
          ? `Pipeline passed, ${countPhrase(count, "stage")} in ${spokenSpan(seconds)}.`
          : phase === "running" && activeStage
            ? `${activeStage.name} running, ${at}.`
            : "Pipeline waiting to start.";
    setSpoken({ key: spokenKey, sentence });
  }

  const railRef = React.useRef(onRailChange);
  React.useEffect(() => {
    railRef.current = onRailChange;
  });
  // The reading is a state, not an event: a host that mounts mid-run sees the
  // same rail the component does, from the first commit.
  React.useEffect(() => {
    railRef.current?.({
      phase,
      stageId: activeStage?.id ?? null,
      index: count === 0 ? 0 : activeIndex + 1,
      passed: landed,
      seconds,
    });
  }, [phase, activeStage?.id, activeIndex, count, landed, seconds]);

  const select = (id: string) => {
    if (id === selectedId) return;
    if (selected === undefined) setOwnSelected(id);
    onSelectedChange?.(id);
  };

  // Selection moves with the key that moved focus, not from an effect watching
  // focus: one press, one report.
  const moveTo = (index: number) => {
    const stage = stages[Math.min(count - 1, Math.max(0, index))];
    if (!stage) return;
    select(stage.id);
    document.getElementById(`${baseId}-stage-${stage.id}`)?.focus();
  };

  const onStageKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const step = STEP_KEYS[event.key];
    const to =
      step !== undefined
        ? index + step
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? count - 1
            : null;
    if (to === null) return;
    event.preventDefault();
    moveTo(to);
  };

  // Measured, never reserved: the strip's height comes from its own content, so
  // a rail with nothing wrong holds no empty room for a failure.
  const [stripNode, setStripNode] = React.useState<HTMLDivElement | null>(null);
  const [stripHeight, setStripHeight] = React.useState(0);
  React.useEffect(() => {
    if (!stripNode) return;
    const observer = new ResizeObserver(() =>
      setStripHeight(stripNode.offsetHeight),
    );
    observer.observe(stripNode);
    return () => observer.disconnect();
  }, [stripNode]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const stagger = cascade(Math.max(count, 1));
  const inkFor =
    phase === "failed"
      ? "text-danger"
      : phase === "passed"
        ? "text-success"
        : "text-ink-2";
  // Two keyframes, mirrored: a running stage breathes, and only while it runs.
  const pulse = motionSafe
    ? {
        duration: durations.page,
        ease: easings.move,
        repeat: Infinity,
        repeatType: "mirror" as const,
      }
    : fade;
  const riseIn = motionSafe
    ? { opacity: 0, y: distances.nudge }
    : { opacity: 0 };

  const reading = selectedStage
    ? `Stage ${selectedIndex + 1} of ${count} · ${selectedStage.name} · ${statusOf(selectedStage)}${
        selectedStage.seconds === undefined
          ? ""
          : ` · ${formatSeconds(selectedStage.seconds)}`
      }`
    : "No stages in this run.";

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </span>
        <span
          className={cn("shrink-0 font-mono text-[11px] tabular-nums", inkFor)}
        >
          {phase} · {formatSeconds(seconds)}
        </span>
      </div>

      <ol
        role="list"
        aria-label={`${label} stages`}
        className="flex items-end gap-1"
      >
        {stages.map((stage, index) => {
          const status = statusOf(stage);
          const running = status === "running";
          const stopped = failedIndex >= 0 && index > failedIndex;
          const share = shareFor(stage);
          return (
            <motion.li
              key={stage.id}
              aria-posinset={index + 1}
              aria-setsize={count}
              className="min-w-0 flex-1"
              // The cascade rides opacity, whose target never changes again:
              // a fill that moves later is never held back by a mount stagger.
              initial={{ opacity: 0 }}
              animate={{ opacity: stopped ? 0.55 : 1 }}
              transition={
                motionSafe
                  ? { ...fade, delay: index * stagger }
                  : { duration: durations.fast }
              }
            >
              <button
                type="button"
                id={`${baseId}-stage-${stage.id}`}
                tabIndex={stage.id === selectedId ? 0 : -1}
                aria-current={index === activeIndex ? "step" : undefined}
                aria-label={`${stage.name}, stage ${index + 1} of ${count}, ${statusPhrase(stage)}.`}
                onClick={() => select(stage.id)}
                onKeyDown={(event) => onStageKeyDown(event, index)}
                className={cn(
                  "flex w-full flex-col items-stretch gap-1.5 rounded-2 p-1 transition-colors",
                  stage.id === selectedId ? "bg-accent" : "hover:bg-accent",
                  focusRing,
                )}
              >
                <span
                  aria-hidden
                  className="relative block h-1.5 w-full overflow-clip rounded-full bg-hairline [contain:paint]"
                >
                  {running ? (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-cobalt-wash"
                      initial={false}
                      animate={{ opacity: motionSafe ? 0.4 : 1 }}
                      transition={pulse}
                    />
                  ) : null}
                  <motion.span
                    className={cn(
                      "absolute inset-y-0 left-0 w-full origin-left rounded-full",
                      toneFor(status),
                      status === "skipped" && "opacity-40",
                    )}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: Number(share.toFixed(6)) }}
                    transition={settle}
                  />
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "block w-full truncate text-center font-mono text-[10px]",
                    stage.id === selectedId ? "text-ink" : "text-ink-3",
                  )}
                >
                  {stage.name}
                </span>
              </button>
            </motion.li>
          );
        })}
      </ol>

      {/* Both readings share one grid cell and cross-fade rather than swapping
          through mode="wait", so arrowing along the rail never blanks the line. */}
      <div aria-hidden className="grid h-4 items-center">
        <AnimatePresence initial={false}>
          <motion.span
            key={reading}
            className="col-start-1 row-start-1 truncate font-mono text-[11px] text-ink tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            {reading}
          </motion.span>
        </AnimatePresence>
      </div>

      <motion.div
        initial={false}
        animate={{ height: failedStage ? stripHeight : 0 }}
        transition={settle}
        // The negative margin cancels the column's own gap while the strip is
        // shut, so a run with nothing wrong holds no empty room for a failure.
        className="-mt-2 overflow-clip [contain:paint]"
      >
        <div ref={setStripNode} className="pt-2">
          <AnimatePresence initial={false}>
            {failedStage ? (
              <motion.div
                key={failedStage.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2 border border-hairline-strong bg-surface-2 p-2"
                initial={riseIn}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={motionSafe ? springs.snap : fade}
              >
                <span className="min-w-0 flex-1 text-[11px] text-ink-2">
                  {failedStage.note
                    ? sentenceOf(failedStage.note)
                    : `${failedStage.name} failed and stopped the run.`}
                </span>
                {onRerun ? (
                  <button
                    type="button"
                    onClick={() => {
                      // Focus goes back to the segment about to run again while
                      // that button is still mounted: a press that leaves focus
                      // on the body is a dropped keyboard.
                      onRerun(failedStage.id);
                      document
                        .getElementById(`${baseId}-stage-${failedStage.id}`)
                        ?.focus();
                    }}
                    className={cn(
                      "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 font-mono text-[11px] font-medium text-ink transition-colors hover:bg-accent",
                      focusRing,
                    )}
                  >
                    {rerunLabel} from {failedStage.name}
                  </button>
                ) : null}
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
