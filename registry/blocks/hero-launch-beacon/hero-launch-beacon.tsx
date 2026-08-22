"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { RevealStagger } from "@/registry/ui/reveal-stagger";
import { StatusSeal } from "@/registry/ui/status-seal";
import { Wavefield } from "@/registry/ui/wavefield";
import { cn } from "@/registry/lib/utils";

export type BeaconMetric = { value: number; suffix?: string; label: string };

export type HeroLaunchBeaconProps = {
  /** The announcement chip above the headline. */
  notice?: string;
  headline?: [string, string];
  copy?: string;
  primaryCta?: string;
  secondaryCta?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  /** The proof row under the CTAs; up to four. */
  metrics?: BeaconMetric[];
  className?: string;
};

const DEFAULT_METRICS: BeaconMetric[] = [
  { value: 480, suffix: "k", label: "runs a day" },
  { value: 99, suffix: ".98%", label: "delivered" },
  { value: 41, suffix: "ms", label: "median settle" },
];

/**
 * A centered launch hero: one announcement, one claim, one action. The copy
 * stack lands on the cascade over a contour wavefield held at low opacity —
 * atmosphere, not spectacle — and the proof row carry-rolls its numbers in
 * rather than stating them, because a number that arrives reads as measured
 * where a printed one reads as claimed.
 *
 * Reduced motion resolves the stack in place, stills the field, and prints
 * the metrics at value.
 */
export function HeroLaunchBeacon({
  notice = "Relay 2.0 is live",
  headline = ["Ship the moment", "it is ready."],
  copy = "Relay routes every release through checks, approvals, and rollout in one motion — no windows, no waiting on a calendar.",
  primaryCta = "Create a pipeline",
  secondaryCta = "Read the launch note",
  onPrimary,
  onSecondary,
  metrics = DEFAULT_METRICS,
  className,
}: HeroLaunchBeaconProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative overflow-hidden", className)}
    >
      <Wavefield
        variant="contour"
        density={0.4}
        speed={0.35}
        opacity={0.35}
        className="pointer-events-none absolute inset-0"
      />
      {/* Ground the copy against the field without dimming the whole stage. */}
      <div
        aria-hidden
        className="from-surface-0/0 via-surface-0/40 to-surface-0 pointer-events-none absolute inset-0 bg-gradient-to-b"
      />

      <div className="relative mx-auto w-full max-w-7xl px-6 py-24 sm:py-28 lg:py-32">
        <RevealStagger className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <StatusSeal variant="info" live>
            {notice}
          </StatusSeal>
          <h1
            id={headingId}
            className="text-4xl leading-[1.04] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl"
          >
            {headline[0]}
            <br />
            {headline[1]}
          </h1>
          <p className="text-ink-2 max-w-xl text-base leading-relaxed sm:text-lg">
            {copy}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <PressureButton size="lg" onClick={onPrimary}>
              {primaryCta}
              <ArrowRight className="size-4" aria-hidden />
            </PressureButton>
            <PressureButton size="lg" variant="ghost" onClick={onSecondary}>
              {secondaryCta}
            </PressureButton>
          </div>

          <dl className="border-hairline mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 border-t pt-6">
            {metrics.map((metric) => (
              <div key={metric.label} className="flex flex-col items-center gap-1">
                <dd className="text-ink flex items-baseline font-mono text-xl font-semibold">
                  <Readout value={metric.value} size="md" />
                  {metric.suffix && <span>{metric.suffix}</span>}
                </dd>
                <dt className="text-label text-ink-3">{metric.label}</dt>
              </div>
            ))}
          </dl>
        </RevealStagger>
      </div>
    </section>
  );
}
