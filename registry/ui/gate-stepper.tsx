"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { clamp, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Scale shed per slot of distance ahead of the camera. */
const SCALE_STEP = 0.16;
/** Deepest scale an upcoming gate may recede to. */
const SCALE_FLOOR = 0.2;
/** px each upcoming gate lifts per slot — the visible run of arch tops. */
const LIFT_STEP = 10;
/** Opacity shed per slot of distance ahead. */
const FADE_STEP = 0.3;
/** Opacity floor for the farthest visible gate. */
const FADE_FLOOR = 0.15;
/** Scale a passed gate swells to as it sweeps past the camera. */
const EXIT_SCALE = 1.35;
/** Stage padding above the plates so the farthest arch top stays in frame. */
const HEADROOM_PAD = 6;

export type GateStep = {
  /** Stable id — keys the gate across index changes. */
  id: string;
  /** Gate label; also names the active group and the rail announcements. */
  title: string;
  /** The gate's surface. Interactive only while this gate is active. */
  content: React.ReactNode;
};

export type GateStepperProps = {
  /** The gates, in passing order. 2–5. */
  steps: GateStep[];
  /** Controlled active gate index. */
  index?: number;
  /** Initial gate when uncontrolled. */
  defaultIndex?: number;
  /** Fires whenever travel lands on a different gate. */
  onIndexChange?: (index: number) => void;
  /**
   * Gate check run before Next (the last gate's Done included). Returning
   * false refuses the advance: a headshake and a polite announcement.
   */
  canAdvance?: (index: number) => boolean;
  nextLabel?: string;
  backLabel?: string;
  /** Next's label on the last gate. */
  doneLabel?: string;
  /** Fires when Done is pressed on the last gate (after `canAdvance`). */
  onComplete?: () => void;
  /** Stage height in px. */
  height?: number;
  className?: string;
};

/**
 * A wizard as gates you pass through in Z — progress is distance traveled,
 * and the gates ahead stay visible as a receding run of arch tops. Inside a
 * `perspective(perspectives.far)` stage (independent flat transforms, no
 * preserve-3d) the active gate plate — a double-hairline arch frame — sits
 * front-and-center; every upcoming gate stacks behind it at
 * `scale(1 − k·0.16) translateY(−k·10px)` from a top-center origin, dimming
 * toward an opacity floor. Advancing sweeps the active gate past the camera:
 * it swells to ×1.35 and fades on `exitFor` while every gate ahead glides up
 * one slot on `glide` under a `cascade` stagger — the travel-forward feel.
 * Back reverses it, returning the passed gate from beyond the lens on
 * `glide`. A mono rail above the stage counts GATE N OF M and slides a
 * traveler dot to the active tick on `snap`. When `canAdvance` refuses, the
 * active gate headshakes — x set to −4, released to rest on `recoil` — and
 * nothing advances.
 *
 * Semantics: the active gate's content lives in a labeled region
 * (`role="group"`, "Gate N of M: title"); passed and upcoming gates are
 * aria-hidden and inert. Back/Next are real buttons — Back disables at the
 * first gate, Next relabels to `doneLabel` on the last and fires
 * `onComplete` — and Next persists across advances so focus stays put. An
 * sr-only polite region announces gate changes and refusals.
 *
 * Reduced motion: a flat stepper — no perspective or recession, upcoming
 * gates hidden entirely, content swaps on a fast fade, the rail dot jumps,
 * and a refusal is announcement-only.
 */
export function GateStepper({
  steps,
  index: controlledIndex,
  defaultIndex = 0,
  onIndexChange,
  canAdvance,
  nextLabel = "Next",
  backLabel = "Back",
  doneLabel = "Done",
  onComplete,
  height = 280,
  className,
}: GateStepperProps) {
  const motionSafe = useMotionSafe();

  const count = steps.length;
  const lastIndex = Math.max(0, count - 1);

  const [uncontrolledIndex, setUncontrolledIndex] =
    React.useState(defaultIndex);
  const resolvedIndex = clamp(
    controlledIndex !== undefined ? controlledIndex : uncontrolledIndex,
    0,
    lastIndex,
  );
  const activeStep = steps[resolvedIndex];
  const isLast = resolvedIndex === lastIndex;

  /** Refusal count since the last gate change — feeds the live region. */
  const [refusals, setRefusals] = React.useState(0);

  // Adjust-on-change during render (not an effect): arriving at a new gate
  // clears any standing refusal, controlled travel included.
  const [prevIndex, setPrevIndex] = React.useState(resolvedIndex);
  if (prevIndex !== resolvedIndex) {
    setPrevIndex(resolvedIndex);
    setRefusals(0);
  }

  /** Refuse headshake — set to −nudge, released to rest (two keyframes). */
  const shakeX = useMotionValue(0);
  const shakeControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );

  // A headshake in flight must not outlive the component.
  React.useEffect(() => () => shakeControlsRef.current?.stop(), []);

  const commit = (next: number) => {
    const target = clamp(next, 0, lastIndex);
    if (target === resolvedIndex) return;
    shakeControlsRef.current?.stop();
    shakeX.jump(0);
    if (controlledIndex === undefined) setUncontrolledIndex(target);
    onIndexChange?.(target);
  };

  const handleNext = () => {
    if (count === 0) return;
    if (canAdvance && !canAdvance(resolvedIndex)) {
      // The gate refuses — announce, and headshake only when motion may play.
      setRefusals((r) => r + 1);
      if (motionSafe) {
        shakeControlsRef.current?.stop();
        shakeX.set(-distances.nudge);
        shakeControlsRef.current = animate(shakeX, 0, springs.recoil);
      }
      return;
    }
    if (isLast) {
      onComplete?.();
      return;
    }
    commit(resolvedIndex + 1);
  };

  const handleBack = () => commit(resolvedIndex - 1);

  /** Headroom above the plates for the receding arch tops. */
  const headroom = lastIndex * LIFT_STEP + HEADROOM_PAD;
  const cascadeStep = cascade(count);
  const railPct = (i: number) => (lastIndex > 0 ? (i / lastIndex) * 100 : 0);

  // Refusals alternate an invisible \u00A0 suffix so a repeated refusal re-announces.
  const announcement =
    count === 0
      ? ""
      : refusals > 0
        ? `Cannot advance yet${refusals % 2 === 0 ? "\u00A0" : ""}`
        : `Gate ${resolvedIndex + 1} of ${count}: ${activeStep?.title ?? ""}`;

  return (
    <div className={cn("w-full", className)}>
      {/* Progress rail — distance traveled along the run of gates. */}
      <div className="mb-3 flex items-center gap-3">
        <span className="text-label whitespace-nowrap text-ink-3 tabular-nums">
          GATE {count === 0 ? 0 : resolvedIndex + 1} OF {count}
        </span>
        <div aria-hidden className="relative h-3 flex-1">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-hairline-strong" />
          {steps.map((step, i) => (
            <span
              key={step.id}
              className={cn(
                "absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2",
                i <= resolvedIndex ? "bg-cobalt" : "bg-hairline-strong",
              )}
              style={{ left: `${railPct(i)}%` }}
            />
          ))}
          {/* The traveler — glides tick to tick; jumps under reduced motion. */}
          <motion.span
            initial={false}
            animate={{ left: `${railPct(resolvedIndex)}%` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
            className="absolute top-1/2 size-1.5 rounded-full bg-cobalt"
            style={{ x: "-50%", y: "-50%" }}
          />
        </div>
      </div>

      {/* The stage — gates recede ahead and sweep past the camera on advance. */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          height,
          perspective: motionSafe ? perspectives.far : undefined,
        }}
      >
        {steps.map((step, i) => {
          const k = i - resolvedIndex;
          const isActive = k === 0;

          const pose = motionSafe
            ? k < 0
              ? { y: 0, scale: EXIT_SCALE, opacity: 0 }
              : {
                  y: -k * LIFT_STEP,
                  scale: clamp(1 - k * SCALE_STEP, SCALE_FLOOR, 1),
                  opacity: clamp(1 - k * FADE_STEP, FADE_FLOOR, 1),
                }
            : { y: 0, scale: 1, opacity: isActive ? 1 : 0 };

          // Passing gates exit on a tween — exits never spring; travel is a
          // glide, staggered so the wave runs front to back.
          const transition = motionSafe
            ? k < 0
              ? exitFor(durations.base)
              : { ...springs.glide, delay: k * cascadeStep }
            : { duration: durations.fast };

          return (
            <motion.div
              key={step.id}
              role={isActive ? "group" : undefined}
              aria-label={
                isActive
                  ? `Gate ${i + 1} of ${count}: ${step.title}`
                  : undefined
              }
              aria-hidden={!isActive || undefined}
              inert={!isActive ? true : undefined}
              initial={false}
              animate={pose}
              transition={transition}
              className={cn(
                "absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-4 border border-hairline bg-surface-1",
                !isActive && "pointer-events-none",
              )}
              style={{
                top: motionSafe ? headroom : 0,
                display: !motionSafe && !isActive ? "none" : undefined,
                zIndex: count - k,
                x: isActive ? shakeX : 0,
                transformOrigin: "50% 0%",
                willChange: "transform",
              }}
            >
              {/* Double-hairline inset, arched at the top — the portal read. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-1.5 rounded-t-[22px] rounded-b-[10px] border border-hairline"
              />
              {/* Active tell — a cobalt hairline on the left edge. */}
              <span
                aria-hidden
                className={cn(
                  "absolute top-8 bottom-8 left-0 w-0.5 rounded-full bg-cobalt transition-opacity",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />

              <div className="flex shrink-0 items-center gap-2 px-5 pt-4">
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] tracking-[0.08em] tabular-nums",
                    isActive ? "text-cobalt" : "text-ink-3",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 truncate text-label text-ink-2">
                  {step.title}
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-5 pt-3 pb-5">
                {step.content}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Footer — real buttons carry the keyboard; Next persists for focus. */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          disabled={resolvedIndex === 0}
          className={cn(
            "cursor-pointer rounded-2 border border-hairline bg-surface-1 px-3.5 py-1.5 text-label text-ink-2 transition-colors",
            "outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-2",
          )}
        >
          {backLabel}
        </button>
        <button
          type="button"
          onClick={handleNext}
          className={cn(
            "cursor-pointer rounded-2 border border-cobalt/50 bg-cobalt-wash px-3.5 py-1.5 text-label text-cobalt transition-colors",
            "outline-none hover:border-cobalt focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {isLast ? doneLabel : nextLabel}
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
