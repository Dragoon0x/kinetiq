"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CurtainLiftProps = {
  /** The stage the curtain conceals. */
  children: React.ReactNode;
  /** Lift straight up, or part to the sides. @default "lift" */
  mode?: "lift" | "part";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Stage height in px. @default 220 */
  height?: number;
  /** Fold strip count. @default 14 */
  folds?: number;
  openLabel?: string;
  closeLabel?: string;
  className?: string;
};

/**
 * A draped curtain of sine-folds over a stage — raising it sends the strips
 * up with a center-out stagger so the hem travels as a wave; in part mode the
 * halves compress toward the wings instead. The folds are gradient strips
 * whose alternating edges read as cloth. One real toggle button runs the
 * rig. Under reduced motion the curtain simply fades.
 */
export function CurtainLift({
  children,
  mode = "lift",
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  height = 220,
  folds = 14,
  openLabel = "Raise",
  closeLabel = "Lower",
  className,
}: CurtainLiftProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolled;

  const count = Math.min(Math.max(folds, 8), 20);
  const step = cascade(count);
  const center = (count - 1) / 2;

  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };

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

      <div
        className="border-hairline bg-surface-0 relative overflow-hidden rounded-3 border"
        style={{ height }}
      >
        {/* the stage */}
        <div aria-hidden={!open} className="absolute inset-0">
          {children}
        </div>

        {/* the curtain */}
        <div aria-hidden className="absolute inset-0 flex">
          {Array.from({ length: count }, (_, i) => {
            const fromCenter = Math.abs(i - center);
            const delay = motionSafe
              ? (open ? fromCenter : center - fromCenter) * step
              : 0;
            const closedPose = { y: "0%", x: "0%", scaleX: 1, opacity: 1 };
            const openPose =
              mode === "lift"
                ? { y: "-102%", x: "0%", scaleX: 1, opacity: 1 }
                : {
                    y: "0%",
                    x: i <= center ? "-160%" : "160%",
                    scaleX: 0.3,
                    opacity: 1,
                  };
            return (
              <motion.span
                // Folds are positional strips; index keys are stable.
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                initial={false}
                animate={
                  motionSafe
                    ? open
                      ? openPose
                      : closedPose
                    : { y: "0%", x: "0%", scaleX: 1, opacity: open ? 0 : 1 }
                }
                transition={
                  motionSafe
                    ? { ...springs.glide, delay }
                    : { duration: durations.fast }
                }
                className="h-full flex-1"
                style={{
                  transformOrigin: i <= center ? "0% 50%" : "100% 50%",
                  background:
                    "linear-gradient(90deg, oklch(0.32 0.04 258) 0%, oklch(0.2 0.03 258) 45%, oklch(0.26 0.035 258) 55%, oklch(0.16 0.02 258) 100%)",
                  boxShadow: "inset -1px 0 0 rgb(0 0 0 / 0.35)",
                }}
              />
            );
          })}
        </div>

        {/* pelmet — the fixed top rail the curtain hangs from */}
        <span
          aria-hidden
          className="bg-surface-2 border-hairline absolute inset-x-0 top-0 h-2 border-b"
        />
      </div>

      <span className="sr-only" aria-live="polite" role="status">
        {open ? "Curtain raised" : "Curtain lowered"}
      </span>
    </div>
  );
}
