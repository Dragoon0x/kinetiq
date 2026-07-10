"use client";

import * as React from "react";

import { motion, useTransform, type MotionValue } from "motion/react";
import { useSpring } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { mapRange, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type FoldOutProps = {
  /** Up to four panels, unfolding top to bottom. */
  panels: React.ReactNode[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Height of each panel in px. @default 88 */
  panelHeight?: number;
  /** Labels for the toggle. */
  openLabel?: string;
  closeLabel?: string;
  className?: string;
};

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/**
 * An origami strip that unfolds in staged hinges — one progress spring drives
 * every crease, each panel's own hinge mapped to a later slice of the travel
 * so the sheet opens stage by stage, shading lifting as each fold flattens.
 * The kinematics come free from DOM nesting: every panel hangs from the one
 * above. Under reduced motion the strip simply appears and disappears.
 */
export function FoldOut({
  panels,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  panelHeight = 88,
  openLabel = "Unfold",
  closeLabel = "Fold",
  className,
}: FoldOutProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolled;
  const list = panels.slice(0, 4);
  const count = list.length;

  // One master progress value; each hinge consumes its own slice of it.
  const progress = useSpring(open ? 1 : 0, GLIDE);
  React.useEffect(() => {
    progress.set(open ? 1 : 0);
  }, [open, progress]);

  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };

  const containerHeight = useTransform(progress, (p) => {
    // First panel is always visible; the rest contribute as they unfold.
    let total = count > 0 ? panelHeight : 0;
    for (let k = 1; k < count; k += 1) {
      total += stageProgress(p, k, count) * panelHeight;
    }
    return total;
  });

  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="border-hairline bg-surface-2 text-ink-2 hover:text-ink focus-visible:ring-cobalt-bright/50 mb-2 rounded-2 border px-3 py-1 font-mono text-[10px] tracking-wide outline-none focus-visible:ring-2"
      >
        {open ? closeLabel : openLabel}
      </button>

      {motionSafe ? (
        <motion.div
          style={{
            height: containerHeight,
            perspective: perspectives.base,
          }}
          className="relative overflow-visible"
        >
          {count > 0 ? (
            <FoldPanel
              node={list[0]}
              index={0}
              count={count}
              progress={progress}
              panelHeight={panelHeight}
              rest={list.slice(1)}
            />
          ) : null}
        </motion.div>
      ) : (
        <div className="space-y-1">
          {(open ? list : list.slice(0, 1)).map((node, i) => (
            <motion.div
              // Panels are positional; index keys are stable.
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.fast }}
              style={{ height: panelHeight }}
              className="border-hairline bg-surface-1 overflow-hidden rounded-2 border"
            >
              {node}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The slice of master progress that drives hinge `k` (1-based folds). */
function stageProgress(p: number, k: number, count: number): number {
  if (count <= 1) return p;
  const span = 1 / (count - 1);
  return mapRange(p, (k - 1) * span, k * span, 0, 1);
}

function FoldPanel({
  node,
  index,
  count,
  progress,
  panelHeight,
  rest,
}: {
  node: React.ReactNode;
  index: number;
  count: number;
  progress: MotionValue<number>;
  panelHeight: number;
  rest: React.ReactNode[];
}) {
  // Panel 0 is the fixed spine; each subsequent panel hinges from the one
  // above, consuming its slice of the master progress.
  const stage = useTransform(progress, (p) =>
    index === 0 ? 1 : stageProgress(p, index, count),
  );
  const rotateX = useTransform(stage, (s) => (index === 0 ? 0 : -86 + s * 86));
  const shade = useTransform(stage, (s) => (index === 0 ? 0 : (1 - s) * 0.45));
  const next = rest[0];

  return (
    <motion.div
      style={{
        height: panelHeight,
        rotateX,
        transformOrigin: "50% 0%",
      }}
      className="relative"
    >
      <div
        className="border-hairline bg-surface-1 relative h-full overflow-hidden rounded-2 border"
        style={{ height: panelHeight }}
      >
        {node}
        {/* crease shading — lifts as the fold flattens */}
        <motion.span
          aria-hidden
          style={{ opacity: shade }}
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 to-transparent"
        />
      </div>
      {next !== undefined ? (
        <div className="absolute inset-x-0 top-full pt-1">
          <FoldPanel
            node={next}
            index={index + 1}
            count={count}
            progress={progress}
            panelHeight={panelHeight}
            rest={rest.slice(1)}
          />
        </div>
      ) : null}
    </motion.div>
  );
}
