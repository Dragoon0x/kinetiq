"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LikertScaleProps = {
  /** The statement being rated. Names the group. */
  question: string;
  /** Node count. @default 5 */
  points?: 5 | 7;
  /** Labels at the ends. @default ["Disagree", "Agree"] */
  anchors?: [string, string];
  /** Controlled 1-based choice; `defaultValue` seeds the uncontrolled one. */
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  className?: string;
};

/** How far the far anchor fades: 1 at the near end, 0.6 at the far one. */
const ANCHOR_FADE = 0.4;

/** Arrows wrap, Home and End jump, Space re-picks. Null: not our key. */
function rovingIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp")
    return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === " ") return index;
  return null;
}

/**
 * An agreement scale that answers where you stand. Choosing fills the line up
 * to that node on `glide` and inflates the node on `snap`, and the anchors
 * shift weight with it — the near one firms while the far one fades, so the
 * reading is legible before the number is. Hovering previews the fill at a
 * lower weight without committing to it. It is a radiogroup with a roving
 * tabindex: arrows move and select, Home and End jump to the ends, Space
 * selects. Under reduced motion the fill still fills, on a tween instead of a
 * spring, and the node marks itself by colour rather than by size.
 */
export function LikertScale({
  question,
  points = 5,
  anchors = ["Disagree", "Agree"],
  value,
  defaultValue,
  onValueChange,
  className,
}: LikertScaleProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const questionId = `${baseId}-question`;

  const [uncontrolled, setUncontrolled] = React.useState<number | undefined>(
    () => defaultValue,
  );
  const current = value ?? uncontrolled;
  const selectedIndex =
    current === undefined ? -1 : Math.min(points - 1, Math.max(0, current - 1));

  const [hovered, setHovered] = React.useState<number | null>(null);

  const select = (index: number) => {
    const next = index + 1;
    if (value === undefined) setUncontrolled(next);
    if (next !== current) onValueChange?.(next);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = rovingIndex(event.key, index, points);
    if (next === null) return;
    event.preventDefault();
    select(next);
    document.getElementById(`${baseId}-node-${next}`)?.focus();
  };

  const fraction = selectedIndex < 0 ? 0 : selectedIndex / (points - 1);
  const preview = hovered === null ? fraction : hovered / (points - 1);
  // Weight follows the choice continuously, so the pair reads as a balance
  // rather than as two lamps switching.
  const chosen = selectedIndex >= 0;
  const leftWeight = chosen ? 1 - fraction * ANCHOR_FADE : 1 - ANCHOR_FADE / 2;
  const rightWeight = chosen
    ? 1 - (1 - fraction) * ANCHOR_FADE
    : 1 - ANCHOR_FADE / 2;

  const fillTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };
  const anchorTransition = { duration: durations.base, ease: easings.move };

  const nodeLabel = (index: number) => {
    if (index === 0) return `1, ${anchors[0]}`;
    if (index === points - 1) return `${points}, ${anchors[1]}`;
    return `${index + 1} of ${points}`;
  };

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      <p id={questionId} className="text-sm text-ink">
        {question}
      </p>

      <div className="relative h-11">
        {/* The track spans node centre to node centre, so the fill lands on a
            node rather than short of it — 3.5 is half a node's width. */}
        <div
          aria-hidden
          className="absolute inset-x-3.5 inset-y-0 flex items-center"
        >
          <div className="relative h-0.5 w-full rounded-full bg-hairline-strong">
            <motion.div
              className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-cobalt-bright/35"
              initial={false}
              animate={{ scaleX: preview }}
              transition={fillTransition}
            />
            <motion.div
              className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-cobalt-bright"
              initial={false}
              animate={{ scaleX: fraction }}
              transition={fillTransition}
            />
          </div>
        </div>

        <div
          role="radiogroup"
          aria-labelledby={questionId}
          className="absolute inset-0 flex items-center justify-between"
        >
          {Array.from({ length: points }, (_, index) => {
            const selected = index === selectedIndex;
            const passed = index <= selectedIndex;
            return (
              <button
                key={index}
                type="button"
                role="radio"
                id={`${baseId}-node-${index}`}
                aria-checked={selected}
                aria-label={nodeLabel(index)}
                tabIndex={index === Math.max(selectedIndex, 0) ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onPointerEnter={() => setHovered(index)}
                onPointerLeave={() => setHovered(null)}
                className={cn(
                  "flex h-11 w-7 items-center justify-center rounded-full outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <motion.span
                  aria-hidden
                  initial={false}
                  // Scale, not size: the row's geometry never moves, so the
                  // line under the nodes stays true.
                  animate={{ scale: selected && motionSafe ? 1.55 : 1 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                  className={cn(
                    "block size-3 rounded-full border transition-colors",
                    selected
                      ? "border-cobalt-bright bg-cobalt-bright"
                      : passed
                        ? "border-cobalt-bright bg-cobalt-wash"
                        : "border-hairline-strong bg-surface-2",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs font-medium">
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: leftWeight }}
          transition={anchorTransition}
          className={cn(
            "transition-colors",
            chosen && fraction < 0.5 ? "text-ink" : "text-ink-2",
          )}
        >
          {anchors[0]}
        </motion.span>
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: rightWeight }}
          transition={anchorTransition}
          className={cn(
            "transition-colors",
            chosen && fraction > 0.5 ? "text-ink" : "text-ink-2",
          )}
        >
          {anchors[1]}
        </motion.span>
      </div>
    </div>
  );
}
