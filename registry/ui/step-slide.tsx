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

export type Step = {
  id: string;
  title: string;
  content: React.ReactNode;
};

export type StepSlideProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Ordered steps. Each one is a panel titled by its own heading. */
  steps: Step[];
  /** Controlled index. */
  value?: number;
  /** Initial index for uncontrolled usage. */
  defaultValue?: number;
  onValueChange?: (index: number) => void;
  /** Fires when Next is pressed on the last step. */
  onFinish?: () => void;
  /** Label on the last step's forward button. */
  finishLabel?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * Direction is the only thing the panels need to know: the leaving step goes
 * the way you came from, the arriving one comes from the way you are headed.
 */
const PANEL = {
  enter: (direction: number) => ({
    x: direction * distances.shift,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: -direction * distances.shift,
    opacity: 0,
    transition: exitFor(durations.base),
  }),
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/**
 * A wizard whose frame fits the step it is showing. Next takes the current
 * panel out to the left on the exit ease while the next arrives from a `shift`
 * to the right on `snap`; Back reverses both, so the sequence always reads as a
 * position in a line rather than a set of unrelated screens.
 *
 * The frame's height is measured, never reserved: a ResizeObserver on the live
 * panel reports the real height and the frame glides to it, so a short step is
 * short and a tall one is not clipped. The dots fill in order and the current
 * one stretches into a pill — a `layout` move on `snap`, one crisp overshoot,
 * because the pill is the same mark travelling and not a second mark lighting
 * up.
 *
 * Back and Next are ordinary buttons, Back disabled at the first step and Next
 * reading Finish at the last; every move is announced politely as its step
 * number and title. Under reduced motion the panels cross-fade in place and the
 * frame's height swaps — the step still changes, it just does not travel.
 */
export function StepSlide({
  ref,
  steps,
  value,
  defaultValue,
  onValueChange,
  onFinish,
  finishLabel = "Finish",
  className,
  "aria-label": ariaLabel,
}: StepSlideProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const liveId = `${baseId}-live`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? 0);
  const isControlled = value !== undefined;
  const last = Math.max(0, steps.length - 1);
  const index = clamp(isControlled ? value : uncontrolled, 0, last);
  const [direction, setDirection] = React.useState(1);

  const step = steps[index];
  const titleId = `${baseId}-title-${step?.id ?? index}`;

  // The frame animates its height; this inner node keeps the real one. The
  // leaving panel is taken out of flow by popLayout, so what is measured here
  // is always the panel that is arriving.
  const measureRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);

  React.useEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    // ResizeObserver fires once on observe, so the first height lands without
    // reading layout during render — and it fires before paint, so the frame
    // starts gliding in the same frame the panel swaps.
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const go = (to: number) => {
    const next = clamp(to, 0, last);
    if (next === index) return;
    setDirection(next > index ? 1 : -1);
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const onNext = () => {
    if (index === last) {
      onFinish?.();
      return;
    }
    go(index + 1);
  };

  const enter = motionSafe
    ? {
        ...springs.snap,
        opacity: { duration: durations.fast, ease: easings.enter },
      }
    : { duration: durations.fast, ease: easings.enter };

  if (!step) return null;

  return (
    <div
      ref={ref}
      aria-label={ariaLabel}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Step {index + 1} of {steps.length}
        </span>
        <ol aria-hidden className="m-0 flex items-center gap-1.5 p-0">
          {steps.map((entry, at) => (
            <li key={entry.id} className="flex">
              <motion.span
                layout={motionSafe}
                transition={springs.snap}
                style={{ borderRadius: 999 }}
                className={cn(
                  "block h-1.5",
                  at === index
                    ? "w-5 bg-primary"
                    : at < index
                      ? "w-1.5 bg-primary/50"
                      : "w-1.5 bg-hairline-strong",
                )}
              />
            </li>
          ))}
        </ol>
      </div>

      <motion.div
        // `auto` until the first measurement, so nothing is reserved and
        // nothing collapses before the observer has spoken.
        initial={false}
        animate={{ height: measured === 0 ? "auto" : measured }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="relative overflow-hidden"
      >
        <div ref={measureRef} className="relative">
          <AnimatePresence
            initial={false}
            mode="popLayout"
            custom={motionSafe ? direction : 0}
          >
            <motion.section
              key={step.id}
              custom={motionSafe ? direction : 0}
              variants={PANEL}
              initial="enter"
              animate="center"
              exit="exit"
              transition={enter}
              role="group"
              aria-labelledby={titleId}
              className="flex w-full flex-col gap-2"
            >
              <h3
                id={titleId}
                className="text-sm font-semibold text-foreground"
              >
                {step.title}
              </h3>
              <div className="text-sm text-ink-2">{step.content}</div>
            </motion.section>
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className={cn(
            "flex h-9 flex-1 cursor-pointer items-center justify-center rounded-2 border border-hairline-strong bg-surface-2 px-4 text-sm font-medium text-foreground outline-none hover:bg-surface-0",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:cursor-not-allowed disabled:opacity-45",
          )}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className={cn(
            "flex h-9 flex-1 cursor-pointer items-center justify-center rounded-2 bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 active:bg-primary/80",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {index === last ? finishLabel : "Next"}
        </button>
      </div>

      <span id={liveId} aria-live="polite" className="sr-only">
        Step {index + 1} of {steps.length}: {step.title}
      </span>
    </div>
  );
}
