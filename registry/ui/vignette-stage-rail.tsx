"use client";

import * as React from "react";

import {
  Activity,
  Database,
  Gauge,
  PenLine,
  Route,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RailStage = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

export type VignetteStageRailProps = {
  stages?: RailStage[];
  /**
   * "row" marches a roving highlight along icon tiles with the label
   * captioned above; "column" rolls the stages through a lit focus band.
   */
  orient?: "row" | "column";
  /** Seconds each stage holds the light. @default 1.6 */
  holdSeconds?: number;
  className?: string;
};

const DEFAULT_STAGES: RailStage[] = [
  { id: "s1", label: "Signals in", icon: <Database /> },
  { id: "s2", label: "Shaping", icon: <PenLine /> },
  { id: "s3", label: "Tools", icon: <Wrench /> },
  { id: "s4", label: "Reasoning", icon: <Route /> },
  { id: "s5", label: "Checks", icon: <ShieldCheck /> },
  { id: "s6", label: "Evals", icon: <Gauge /> },
  { id: "s7", label: "Watch", icon: <Activity /> },
];

/**
 * A pipeline as a scene: the same stages either as a row of icon tiles with
 * one light roving along them and the caption naming whoever holds it, or as
 * a column rolling through a lit focus band — each stage sliding to its next
 * seat rather than the list scrolling past a window, so the edges wrap
 * instead of jumping. Presentational and marked as one image; hovering rests
 * the march.
 *
 * Reduced motion: the march stops on the middle stage with every label
 * legible.
 */
export function VignetteStageRail({
  stages = DEFAULT_STAGES,
  orient = "row",
  holdSeconds = 1.6,
  className,
}: VignetteStageRailProps) {
  const motionSafe = useMotionSafe();
  const [resting, setResting] = React.useState(false);
  const restIndex = Math.floor(stages.length / 2);
  const [active, setActive] = React.useState(restIndex);

  React.useEffect(() => {
    if (!motionSafe || resting) return;
    const id = window.setInterval(
      () => setActive((a) => (a + 1) % stages.length),
      Math.max(0.8, holdSeconds) * 1000,
    );
    return () => window.clearInterval(id);
  }, [motionSafe, resting, stages.length, holdSeconds]);

  const shown = motionSafe ? active : restIndex;
  const label = stages[shown]?.label ?? "";

  const rowPitch = 44;
  const band = 2; // rows fully lit within this circular distance

  return (
    <div
      role="img"
      aria-label={`Pipeline stages: ${stages.map((s) => s.label).join(", ")}`}
      className={cn("w-full max-w-sm", className)}
      onMouseEnter={() => setResting(true)}
      onMouseLeave={() => setResting(false)}
    >
      {orient === "row" ? (
        <div aria-hidden className="flex flex-col items-center gap-4">
          {/* The caption is the active stage speaking, rolled like a reading. */}
          <span className="relative grid h-5 place-items-center overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={label}
                initial={motionSafe ? { y: "110%", opacity: 0 } : false}
                animate={{ y: "0%", opacity: 1 }}
                exit={{
                  y: "-110%",
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className="block text-label text-ink-2"
              >
                {label}
              </motion.span>
            </AnimatePresence>
          </span>

          <div className="flex items-center gap-2">
            {stages.map((stage, index) => {
              const on = index === shown;
              return (
                <motion.span
                  key={stage.id}
                  animate={{ scale: on ? 1.12 : 1, y: on ? -3 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                  className={cn(
                    "grid size-9 place-items-center rounded-3 border [&_svg]:size-4",
                    on
                      ? "border-hairline-strong bg-primary/10 text-ink"
                      : "border-hairline bg-surface-1 text-ink-3",
                  )}
                >
                  {stage.icon}
                </motion.span>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          aria-hidden
          className="relative mx-auto h-[220px] w-full max-w-[240px]"
        >
          {/* The focus band the stages roll through. */}
          <span
            className="absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 rounded-3 border border-hairline-strong bg-surface-2"
            style={{ opacity: 0.9 }}
          />
          {stages.map((stage, index) => {
            const n = stages.length;
            // Circular offset from the active stage, in [-n/2, n/2).
            const off =
              ((index - shown + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
            const dist = Math.abs(off);
            return (
              <motion.span
                key={stage.id}
                animate={{
                  y: off * rowPitch,
                  opacity: dist > band + 1 ? 0 : 1 - dist * 0.32,
                  scale: 1 - dist * 0.04,
                }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
                className={cn(
                  "absolute inset-x-2 top-1/2 flex h-10 -translate-y-1/2 items-center gap-2.5 px-3 [&_svg]:size-4",
                  off === 0 ? "text-ink" : "text-ink-3",
                )}
              >
                {stage.icon}
                <span className="text-sm">{stage.label}</span>
                {off === 0 && (
                  <span className="ml-auto size-1.5 rounded-full bg-[var(--success,var(--primary))]" />
                )}
              </motion.span>
            );
          })}
        </div>
      )}
    </div>
  );
}
