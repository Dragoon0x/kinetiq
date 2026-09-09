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

export type SelfieRingStatus = "idle" | "checking" | "passed" | "failed";

export type SelfieRingProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The prompts, in order; the ring has one segment per prompt. Prompts that
   *  mention left, right or blink move the face; others centre it. */
  prompts?: string[];
  /** Controlled status. */
  status?: SelfieRingStatus;
  /** Initial status for uncontrolled usage. @default "idle" */
  defaultStatus?: SelfieRingStatus;
  /** Fires from the Start and Try again presses, with `"checking"`. */
  onStatusChange?: (status: SelfieRingStatus) => void;
  /** Index of the prompt being held while checking; earlier prompts count as done. @default 0 */
  step?: number;
  /** Fires from the Start or Try again press; the host runs the camera check. */
  onStart?: () => void;
  /** Visible heading. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const DEFAULT_PROMPTS = [
  "Centre your face",
  "Turn left",
  "Turn right",
  "Blink",
];

/** Ring geometry in the 200-unit stage. */
const R = 88;
const STROKE = 6;

/** Trig reaches an attribute only rounded: Node and the browser can disagree
 *  in the last digits of sin/cos, and a mismatched attribute fails hydration. */
const round = (value: number) => Number(value.toFixed(3));

/** How far the face turns for a left or right prompt, in stage units. */
const TURN = 14;

const reactionOf = (prompt: string) => {
  const text = prompt.toLowerCase();
  if (text.includes("left")) return "left";
  if (text.includes("right")) return "right";
  if (text.includes("blink")) return "blink";
  return "centre";
};

/**
 * A liveness check drawn as a ring around a procedural face. Each prompt slides
 * up into the caption on `snap` while the ring fills one more segment — its
 * `pathLength` gliding from the old share to the new on `glide`, because
 * progress settles rather than switches — and the face answers: features glide
 * left or right, the eyes blink on a three-keyframe tween. Passing the last
 * prompt closes the ring: the arc completes, the ring tightens onto the face on
 * `recoil`, the one landing in the piece, and a check disc stamps at the top.
 * Failure drains the ring back on `glide` with no bounce and offers Try again.
 *
 * The check owns no clock: the host advances `step` and sets `status`. The ring
 * is a `progressbar` whose valuetext names the prompt. Under reduced motion the
 * prompts swap in place, the face holds still (the caption carries the
 * instruction), the ring still fills on a tween, and nothing tightens or bounces.
 */
export function SelfieRing({
  ref,
  prompts = DEFAULT_PROMPTS,
  status,
  defaultStatus = "idle",
  onStatusChange,
  step = 0,
  onStart,
  label,
  className,
  "aria-label": ariaLabel,
}: SelfieRingProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultStatus);
  const isControlled = status !== undefined;
  const phase = isControlled ? status : uncontrolled;

  const count = Math.max(1, prompts.length);
  const index = Math.min(count - 1, Math.max(0, step));
  const done = phase === "passed" ? count : phase === "checking" ? index : 0;
  const share = done / count;
  const prompt = prompts[index] ?? "";
  const reaction = phase === "checking" ? reactionOf(prompt) : "centre";

  const caption =
    phase === "idle"
      ? "Ready when you are"
      : phase === "checking"
        ? prompt
        : phase === "passed"
          ? "All clear"
          : "Face lost";
  const valueText =
    phase === "checking"
      ? `${done} of ${count}, ${prompt.toLowerCase()}`
      : `${done} of ${count}, ${caption.toLowerCase()}`;

  const start = () => {
    if (phase === "checking" || phase === "passed") return;
    if (!isControlled) setUncontrolled("checking");
    onStatusChange?.("checking");
    onStart?.();
  };

  // Segment boundaries cut the ring so one segment per prompt is visible.
  const ticks = Array.from({ length: count }, (_, i) => {
    const angle = (-90 + (360 * i) / count) * (Math.PI / 180);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x1: round(100 + (R - STROKE) * cos),
      y1: round(100 + (R - STROKE) * sin),
      x2: round(100 + (R + STROKE) * cos),
      y2: round(100 + (R + STROKE) * sin),
    };
  });

  const ringTone =
    phase === "failed"
      ? "text-danger"
      : phase === "passed"
        ? "text-success"
        : "text-cobalt-bright";
  const busy = phase === "checking";
  const buttonLabel =
    phase === "idle"
      ? "Start check"
      : busy
        ? "Checking"
        : phase === "passed"
          ? "Passed"
          : "Try again";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col items-center gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex w-full items-center justify-between gap-3">
        <span id={labelId} className="text-sm font-semibold">
          {label ?? <span className="sr-only">{ariaLabel}</span>}
        </span>
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          {done}/{count}
        </span>
      </div>

      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={count}
        aria-valuetext={valueText}
        className="relative aspect-square w-full max-w-56"
      >
        <motion.svg
          viewBox="0 0 200 200"
          aria-hidden
          className="block h-full w-full"
          style={{ originX: 0.5, originY: 0.5 }}
          animate={{ scale: motionSafe && phase === "passed" ? 0.94 : 1 }}
          // The tighten is a landing; letting go again is not, so it glides back.
          transition={phase === "passed" ? springs.recoil : springs.glide}
        >
          <circle cx="100" cy="100" r={R - STROKE} className="fill-surface-2" />

          {/* The face answers the prompt: a turn is a layout move on glide. */}
          <motion.g
            animate={{
              x: reaction === "left" ? -TURN : reaction === "right" ? TURN : 0,
            }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <path
              d="M52 176 C52 140 148 140 148 176 Z"
              className="fill-ink-3/35"
            />
            <ellipse
              cx="100"
              cy="98"
              rx="38"
              ry="48"
              className="fill-surface-0 stroke-ink-3/60"
              strokeWidth="2"
            />
            {[84, 116].map((cx) => (
              <motion.ellipse
                key={`${cx}-${phase}-${index}`}
                cx={cx}
                cy="92"
                rx="4"
                ry="4"
                className="fill-ink"
                style={{ originX: 0.5, originY: 0.5 }}
                initial={{ scaleY: 1 }}
                animate={{
                  scaleY: motionSafe && reaction === "blink" ? [1, 0.1, 1] : 1,
                }}
                transition={{
                  duration: durations.slow,
                  ease: easings.move,
                  delay: 0.3,
                }}
              />
            ))}
            <path
              d="M88 118 Q100 126 112 118"
              fill="none"
              className="stroke-ink-3"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </motion.g>

          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            className="stroke-hairline-strong"
            strokeWidth={STROKE}
          />
          <motion.circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeLinecap="butt"
            pathLength={1}
            strokeDasharray="1 1"
            transform="rotate(-90 100 100)"
            className={cn("transition-colors", ringTone)}
            initial={false}
            animate={{ strokeDashoffset: 1 - share }}
            // Progress is information: it still fills under reduced motion, on a tween.
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.base, ease: easings.enter }
            }
          />
          {ticks.map((tick, i) => (
            <line
              key={i}
              {...tick}
              className="stroke-surface-1"
              strokeWidth="3"
            />
          ))}
        </motion.svg>

        <AnimatePresence>
          {phase === "passed" ? (
            <motion.span
              key="check"
              aria-hidden
              className="absolute top-[6%] left-1/2 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-raised"
              initial={
                motionSafe
                  ? { x: "-50%", y: "-50%", scale: 1.5, opacity: 0 }
                  : { x: "-50%", y: "-50%", opacity: 0 }
              }
              animate={{ x: "-50%", y: "-50%", scale: 1, opacity: 1 }}
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
                className="size-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.path
                  d="M3.5 8.5 6.5 11.5 12.5 4.5"
                  pathLength={1}
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={
                    motionSafe
                      ? { ...springs.flick, delay: 0.12 }
                      : { duration: 0 }
                  }
                />
              </svg>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {/* One grid cell for every caption, so a swap never changes the height. */}
      <div
        role={phase === "failed" ? "alert" : "status"}
        className="grid w-full text-center"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={caption}
            className={cn(
              "col-start-1 row-start-1 text-sm font-medium",
              phase === "failed" ? "text-danger" : "text-foreground",
            )}
            initial={
              motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {caption}
          </motion.span>
        </AnimatePresence>
      </div>

      <button
        type="button"
        aria-busy={busy || undefined}
        aria-disabled={busy || phase === "passed" || undefined}
        onClick={start}
        className={cn(
          "inline-flex h-9 items-center justify-center gap-2 rounded-2 px-4 text-sm font-medium transition-colors outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          busy
            ? "cursor-default bg-cobalt-wash text-foreground"
            : phase === "passed"
              ? "cursor-default border border-hairline-strong bg-transparent text-ink-3"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {busy ? (
          <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0">
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="2"
            />
            <motion.circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="0.28 0.72"
              style={{ originX: 0.5, originY: 0.5 }}
              animate={{ rotate: motionSafe ? 360 : 0 }}
              transition={
                motionSafe
                  ? { duration: 1, ease: easings.linear, repeat: Infinity }
                  : { duration: 0 }
              }
            />
          </svg>
        ) : null}
        {buttonLabel}
      </button>
    </div>
  );
}
