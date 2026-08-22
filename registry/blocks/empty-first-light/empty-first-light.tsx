"use client";

import * as React from "react";

import { motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FirstAction = {
  id: string;
  title: string;
  detail: string;
  onPick?: () => void;
};

export type EmptyFirstLightProps = {
  /** What this empty place will become. */
  headline?: string;
  copy?: string;
  actions?: FirstAction[];
  primaryCta?: string;
  onPrimary?: () => void;
  className?: string;
};

const DEFAULT_ACTIONS: FirstAction[] = [
  {
    id: "import",
    title: "Bring a recipe over",
    detail: "Paste any recipe file — lineage starts from the import.",
  },
  {
    id: "blank",
    title: "Start from a blank sheet",
    detail: "An empty recipe with the calibration set already loaded.",
  },
  {
    id: "sample",
    title: "Open the worked example",
    detail: "A finished bench to poke at before you commit to your own.",
  },
];

/**
 * The first minute of a product, treated as a moment rather than an apology:
 * a dashed intake frame where the work will soon live, three concrete first
 * moves arriving on the cascade, and one primary action. No sad illustration,
 * no "nothing here yet" — the empty state is a runway, and it says which way
 * to take off.
 */
export function EmptyFirstLight({
  headline = "This bench is waiting for its first recipe.",
  copy = "Everything on this page will fill itself in as the bench works — runs, lineage, and the journal. Pick a first move.",
  actions = DEFAULT_ACTIONS,
  primaryCta = "Create a recipe",
  onPrimary,
  className,
}: EmptyFirstLightProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(actions.length);

  return (
    <section
      aria-label="Getting started"
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="border-hairline-strong rounded-4 border-2 border-dashed px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {headline}
          </h2>
          <p className="text-ink-2 mx-auto mt-3 max-w-md leading-relaxed">
            {copy}
          </p>

          <div className="mt-10 grid gap-3 text-left sm:grid-cols-3">
            {actions.map((action, index) => (
              <motion.button
                key={action.id}
                type="button"
                onClick={action.onPick}
                initial={{
                  opacity: motionSafe ? 0 : 1,
                  y: motionSafe ? distances.step : 0,
                }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={
                  motionSafe
                    ? {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: index * step,
                      }
                    : { duration: 0 }
                }
                className="border-hairline bg-surface-1 hover:border-hairline-strong rounded-3 border p-4 text-left transition-colors"
              >
                <span className="text-ink block text-sm font-medium">
                  {action.title}
                </span>
                <span className="text-ink-3 mt-1 block text-xs leading-relaxed">
                  {action.detail}
                </span>
              </motion.button>
            ))}
          </div>

          <div className="mt-10">
            <PressureButton size="lg" onClick={onPrimary}>
              {primaryCta}
            </PressureButton>
          </div>
        </div>
      </div>
    </section>
  );
}
