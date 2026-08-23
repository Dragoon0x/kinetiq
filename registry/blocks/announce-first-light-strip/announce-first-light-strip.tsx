"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { GradientDrift } from "@/registry/ui/gradient-drift";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type AnnounceFirstLightStripProps = {
  seal?: string;
  headline?: string;
  copy?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

/**
 * A launch moment, not a notice: a full-bleed strip between sections where
 * the announcement gets cinematic room — a drifting gradient behind one
 * sealed line, one sentence, one arrow. Deliberately not dismissible and
 * deliberately not sticky; the inline bar with a close belongs to the alert
 * instrument. This is the page pausing to say something once.
 */
export function AnnounceFirstLightStrip({
  seal = "Launch day",
  headline = "Meridian is out of first light.",
  copy = "Every yard on the waitlist opens this week — invitations land in the order the row formed.",
  actionLabel = "Read the launch note",
  onAction,
  className,
}: AnnounceFirstLightStripProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("border-hairline relative overflow-hidden border-y", className)}
    >
      <GradientDrift
        aria-hidden
        className="pointer-events-none absolute inset-0 !h-full opacity-50"
      />
      <div
        aria-hidden
        className="from-surface-0/80 via-surface-0/30 to-surface-0/80 pointer-events-none absolute inset-0 bg-gradient-to-r"
      />

      <div className="relative mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-10 sm:py-12">
        <div className="flex min-w-0 flex-col gap-3">
          <StatusSeal variant="info" live className="self-start">
            {seal}
          </StatusSeal>
          <h2
            id={headingId}
            className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 max-w-xl text-sm leading-relaxed sm:text-base">
            {copy}
          </p>
        </div>
        <button
          type="button"
          onClick={onAction}
          className="text-ink hover:text-cobalt-bright inline-flex shrink-0 items-center gap-2 font-medium transition-colors"
        >
          {actionLabel}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}
