"use client";

import * as React from "react";

import { Gauge, GitBranch, ShieldCheck, Timer } from "lucide-react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { SparkChart } from "@/registry/ui/spark-chart";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/**
 * A grid cell that carries its own entrance. The span classes must live on
 * the grid item itself, so each cell is its own motion element rather than a
 * child of a shared stagger wrapper.
 */
function Cell({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  const motionSafe = useMotionSafe();
  return (
    <motion.div
      initial={{ opacity: motionSafe ? 0 : 1, y: motionSafe ? distances.shift : 0 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={
        motionSafe
          ? { duration: durations.base, ease: easings.enter, delay: index * cascade(5) }
          : { duration: 0 }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

export type FeaturesBentoFieldProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  className?: string;
};

/** Fixed series — the chart draws the same line every render, SSR included. */
const THROUGHPUT = [42, 48, 45, 61, 58, 72, 69, 84, 80, 96, 91, 108];

/**
 * A bento field: one working cell anchors the grid and the rest state their
 * case at a glance. The anchor cell is a live throughput chart — drawn by the
 * library's own spark instrument, not an illustration of one — and the
 * smaller cells carry a rolling metric, a sealed guarantee, and two plain
 * statements. Cells arrive on the cascade, largest first.
 *
 * Everything in the grid is the real instrument set, so the section inherits
 * every reduced-motion fallback it needs.
 */
export function FeaturesBentoField({
  eyebrow = "Ferrite · build infrastructure",
  headline = "The parts that make the pipeline fast.",
  copy = "Ferrite caches what it can prove, parallelises what it can't, and shows its work either way.",
  className,
}: FeaturesBentoFieldProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 text-base leading-relaxed sm:text-lg">
            {copy}
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Anchor — the working cell. */}
          <Cell index={0} className="border-hairline bg-surface-1 rounded-4 border p-6 sm:col-span-2 lg:row-span-2">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 font-medium">
                <Gauge className="text-ink-3 size-4" aria-hidden />
                Throughput, this quarter
              </p>
              <StatusSeal variant="success">+157%</StatusSeal>
            </div>
            <p className="text-ink-3 mt-1.5 text-sm">
              Builds per hour across the fleet — cache hits excluded, so the
              line only moves when real work gets faster.
            </p>
            <div className="mt-6">
              <SparkChart
                data={THROUGHPUT}
                variant="area"
                height={180}
                label="Builds per hour"
                format={(y) => `${Math.round(y)}/hr`}
              />
            </div>
          </Cell>

          <Cell index={1} className="border-hairline bg-surface-1 rounded-4 border p-6">
            <p className="flex items-center gap-2 font-medium">
              <Timer className="text-ink-3 size-4" aria-hidden />
              Median wait
            </p>
            <p className="mt-4 flex items-baseline gap-1.5">
              <Readout value={38} size="lg" />
              <span className="text-ink-3 font-mono text-sm">seconds</span>
            </p>
            <p className="text-ink-3 mt-2 text-sm">
              From push to first log line, p50 across every queue.
            </p>
          </Cell>

          <Cell index={2} className="border-hairline bg-surface-1 rounded-4 border p-6">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="text-ink-3 size-4" aria-hidden />
              Proven caching
            </p>
            <p className="text-ink-3 mt-2 text-sm leading-relaxed">
              A step is only skipped when its inputs hash identical — never on
              a guess, never on a clock.
            </p>
            <StatusSeal variant="info" className="mt-4">
              content-addressed
            </StatusSeal>
          </Cell>

          <Cell index={3} className="border-hairline bg-surface-1 rounded-4 border p-6 sm:col-span-2">
            <p className="flex items-center gap-2 font-medium">
              <GitBranch className="text-ink-3 size-4" aria-hidden />
              Every branch, first-class
            </p>
            <p className="text-ink-3 mt-2 text-sm leading-relaxed">
              Preview environments per branch with the same cache lineage as
              main — a fork costs a pointer, not a rebuild. Merges inherit
              everything the branch already proved.
            </p>
          </Cell>
        </div>
      </div>
    </section>
  );
}
