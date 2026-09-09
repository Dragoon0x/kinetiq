"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RatingPick = "left" | "tie" | "right";

export type RatingAnswer = {
  id: string;
  /** An invented model name; labels the card. */
  model: string;
  text: string;
};

export type RatingPairProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Left and right answers to the same prompt. */
  answers: [RatingAnswer, RatingAnswer];
  /** The question both answers respond to. */
  prompt: string;
  /** Controlled pick, or null while nothing is chosen. */
  value?: RatingPick | null;
  /** Initial pick for uncontrolled usage. @default null */
  defaultValue?: RatingPick | null;
  /** Fires from the click or key that changed the pick. */
  onValueChange?: (pick: RatingPick) => void;
  /** Names the pair and its pick for assistive technology. */
  label: string;
  className?: string;
};

const STOPS: RatingPick[] = ["left", "tie", "right"];

/** Three degrees lifts a beam end about eight pixels: a lean, not a see-saw. */
const TILT = 3;

/**
 * Two answers to one prompt and a three-way pick beneath them. Choosing a
 * side lifts that card two pixels on `snap` — the one crisp overshoot of a
 * switch — and gives it the strong hairline and raised shadow, while a
 * preference beam under the pair pivots on its centre pin so the chosen end
 * rises, also on `snap`, and a fill grows from the pin toward that end on
 * `glide`, a quantity settling. A tie brings the beam level and drains both
 * halves; neither card lifts.
 *
 * The pick is a radiogroup with a roving tabindex: Left and Right step the
 * three stops without wrapping, Home and End jump to the outer ones, Space
 * and Enter select, and an arrow move selects as a native radio does. Under
 * reduced motion nothing lifts or rotates — the chosen card takes its border
 * and wash on a colour tween and the beam's fill swaps to its length.
 */
export function RatingPair({
  ref,
  answers,
  prompt,
  value,
  defaultValue = null,
  onValueChange,
  label,
  className,
}: RatingPairProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const promptId = `${baseId}-prompt`;

  const [uncontrolled, setUncontrolled] = React.useState<RatingPick | null>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  const stopRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  // The roving stop follows the pick when there is one; before any pick the
  // first stop takes the tab so the group is reachable.
  const focusIndex = current ? STOPS.indexOf(current) : 0;

  const pick = (next: RatingPick) => {
    if (next === current) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const moveTo = (index: number) => {
    const clamped = Math.min(STOPS.length - 1, Math.max(0, index));
    const stop = STOPS[clamped];
    if (!stop) return;
    stopRefs.current[clamped]?.focus();
    pick(stop);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(STOPS.length - 1);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        pick(STOPS[index] ?? "tie");
        break;
      default:
        break;
    }
  };

  const [left, right] = answers;
  const rotate = current === "left" ? -TILT : current === "right" ? TILT : 0;
  const leftFill = current === "left" ? 1 : 0;
  const rightFill = current === "right" ? 1 : 0;

  const stopLabel: Record<RatingPick, string> = {
    left: `Prefer ${left.model}`,
    tie: "Rate the same",
    right: `Prefer ${right.model}`,
  };
  const stopWord: Record<RatingPick, string> = {
    left: "Left",
    tie: "Same",
    right: "Right",
  };

  const announcement =
    current === "tie"
      ? "Rated the same"
      : current === "left"
        ? `Preferred ${left.model}`
        : current === "right"
          ? `Preferred ${right.model}`
          : "";

  const settle = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  const renderCard = (answer: RatingAnswer, side: "left" | "right") => {
    const lifted = current === side;
    const modelId = `${baseId}-${side}`;
    return (
      <motion.article
        aria-labelledby={modelId}
        initial={false}
        animate={{ y: lifted && motionSafe ? -2 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        className={cn(
          "flex min-w-0 flex-col gap-2 rounded-3 border p-3 transition-[border-color,background-color,box-shadow] duration-200",
          lifted
            ? "border-hairline-strong bg-cobalt-wash shadow-raised"
            : "border-hairline bg-surface-1 shadow-none",
        )}
      >
        <span
          id={modelId}
          title={answer.model}
          className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
        >
          {answer.model}
        </span>
        <p className="text-xs leading-relaxed text-foreground">{answer.text}</p>
      </motion.article>
    );
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>

      <p
        id={promptId}
        className="rounded-2 bg-surface-2 px-3 py-2 text-sm leading-snug font-medium text-foreground"
      >
        {prompt}
      </p>

      <div className="grid grid-cols-2 items-start gap-3">
        {renderCard(left, "left")}
        {renderCard(right, "right")}
      </div>

      {/* The beam: a hairline track on a centre pin. Its rotation is about
          the pin, so the chosen end rises and the other dips by the same
          amount. */}
      <div aria-hidden className="flex flex-col items-center gap-1 px-3">
        <motion.div
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong"
          style={{ originX: 0.5, originY: 0.5 }}
          initial={false}
          animate={{ rotate: motionSafe ? rotate : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <motion.span
            className="absolute inset-y-0 left-0 w-1/2 origin-right rounded-l-full bg-cobalt-bright"
            initial={false}
            animate={{ scaleX: leftFill }}
            transition={settle}
          />
          <motion.span
            className="absolute inset-y-0 right-0 w-1/2 origin-left rounded-r-full bg-cobalt-bright"
            initial={false}
            animate={{ scaleX: rightFill }}
            transition={settle}
          />
        </motion.div>
        <span className="size-1.5 rounded-full bg-ink-3" />
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={promptId}
        className="grid grid-cols-3 gap-1 rounded-full border border-hairline bg-surface-2 p-1"
      >
        {STOPS.map((stop, index) => {
          const checked = current === stop;
          return (
            <button
              key={stop}
              ref={(node) => {
                stopRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={stopLabel[stop]}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => pick(stop)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex h-8 items-center justify-center rounded-full text-xs font-medium transition-colors duration-150 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {stopWord[stop]}
            </button>
          );
        })}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
