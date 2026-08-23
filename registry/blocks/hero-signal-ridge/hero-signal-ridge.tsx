"use client";

import * as React from "react";

import { ArrowRight, Activity } from "lucide-react";

import { FlowField } from "@/registry/ui/flow-field";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { RevealStagger } from "@/registry/ui/reveal-stagger";
import { SparkChart } from "@/registry/ui/spark-chart";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type RidgeMetric = { value: number; suffix?: string; label: string };

export type HeroSignalRidgeProps = {
  eyebrow?: string;
  headline?: [string, string];
  copy?: string;
  primaryCta?: string;
  secondaryCta?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  /** The vignette's series and headline metrics. */
  series?: number[];
  seriesLabel?: string;
  metrics?: RidgeMetric[];
  className?: string;
};

/** Fixed series — the ridge draws identically on server and client. */
const DEFAULT_SERIES = [31, 34, 33, 38, 41, 39, 46, 44, 52, 57, 55, 63, 61, 70];

const DEFAULT_METRICS: RidgeMetric[] = [
  { value: 63, suffix: "k", label: "signals an hour" },
  { value: 140, suffix: "ms", label: "ingest to chart" },
];

/**
 * A hero for products that live and die by a line going the right way: copy
 * holds the left, and the vignette is the product's own chart — the spark
 * instrument drawing a fixed series with its crosshair ready, headline
 * numbers rolling in beside it. A flow field combs quietly underneath, the
 * signal made ambient. Nothing in the vignette is an illustration; it is the
 * instrument the page is selling, already running.
 */
export function HeroSignalRidge({
  eyebrow = "Gaugeworks · live telemetry",
  headline = ["See the signal", "before the story."],
  copy = "Gaugeworks turns raw instrument feeds into charts your whole floor reads the same way — ingested, deduplicated, and drawn in the same breath.",
  primaryCta = "Start streaming",
  secondaryCta = "Watch a feed",
  onPrimary,
  onSecondary,
  series = DEFAULT_SERIES,
  seriesLabel = "Signals per minute",
  metrics = DEFAULT_METRICS,
  className,
}: HeroSignalRidgeProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative overflow-hidden", className)}
    >
      <FlowField
        aria-hidden
        className="pointer-events-none absolute inset-0 !h-full opacity-25"
      />
      <div
        aria-hidden
        className="from-surface-0/60 via-surface-0/20 to-surface-0 pointer-events-none absolute inset-0 bg-gradient-to-b"
      />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:py-28">
        <RevealStagger className="flex max-w-xl flex-col items-start gap-5">
          <p className="text-label text-ink-3 flex items-center gap-2">
            <Activity className="size-3.5" aria-hidden />
            {eyebrow}
          </p>
          <h1
            id={headingId}
            className="text-4xl leading-[1.06] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            {headline[0]}
            <br />
            {headline[1]}
          </h1>
          <p className="text-ink-2 max-w-md text-base leading-relaxed sm:text-lg">
            {copy}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <PressureButton size="lg" onClick={onPrimary}>
              {primaryCta}
              <ArrowRight className="size-4" aria-hidden />
            </PressureButton>
            <PressureButton size="lg" variant="outline" onClick={onSecondary}>
              {secondaryCta}
            </PressureButton>
          </div>
        </RevealStagger>

        <div className="border-hairline bg-surface-1 rounded-4 w-full border p-5 shadow-raised">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-label text-ink-3">{seriesLabel}</p>
            <StatusSeal variant="success" live>
              streaming
            </StatusSeal>
          </div>
          <div className="mt-4">
            <SparkChart
              data={series}
              variant="area"
              height={160}
              label={seriesLabel}
              format={(y) => `${Math.round(y)}/min`}
            />
          </div>
          <dl className="border-hairline mt-5 flex flex-wrap items-center gap-x-10 gap-y-3 border-t pt-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="flex items-baseline gap-2">
                <dd className="text-ink flex items-baseline font-mono text-lg font-semibold">
                  <Readout value={metric.value} size="md" />
                  {metric.suffix && <span>{metric.suffix}</span>}
                </dd>
                <dt className="text-label text-ink-3">{metric.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
