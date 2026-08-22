"use client";

import * as React from "react";

import { ArrowRight, CalendarCheck2, Users2 } from "lucide-react";

import { GradientDrift } from "@/registry/ui/gradient-drift";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { RevealStagger } from "@/registry/ui/reveal-stagger";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type LedgerRow = {
  id: string;
  label: string;
  meta: string;
  state: "done" | "live" | "queued";
};

export type HeroSplitLedgerProps = {
  eyebrow?: string;
  /** Two lines of headline; each renders on its own line. */
  headline?: [string, string];
  copy?: string;
  primaryCta?: string;
  secondaryCta?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  /** The vignette's schedule. Replace to make the panel yours. */
  rows?: LedgerRow[];
  /** Vignette panel heading + rolling total. */
  panelTitle?: string;
  panelMetric?: { label: string; value: number };
  className?: string;
};

const DEFAULT_ROWS: LedgerRow[] = [
  { id: "r1", label: "Frame inspection — Dock 2", meta: "07:30 · Crew A", state: "done" },
  { id: "r2", label: "Hull coating, second pass", meta: "10:15 · Crew C", state: "live" },
  { id: "r3", label: "Rig load test", meta: "13:00 · Crew A", state: "queued" },
  { id: "r4", label: "Handover walkthrough", meta: "16:30 · All crews", state: "queued" },
];

const STATE_SEAL: Record<"done" | "live", { variant: "success" | "info"; label: string }> = {
  done: { variant: "success", label: "Done" },
  live: { variant: "info", label: "Live" },
};

/**
 * An editorial split hero: the argument on the left, the product already at
 * work on the right. The copy column arrives on the cascade; the vignette is
 * a live day-ledger whose total carry-rolls and whose rows carry real status
 * seals — proof rendered with the same instruments the product ships.
 *
 * The backdrop is a gradient drift held behind everything and faded low, so
 * it never competes with the reading line. Reduced motion resolves the copy
 * in place and holds the drift still — the composed instruments each carry
 * their own fallback.
 */
export function HeroSplitLedger({
  eyebrow = "Waylight · crew planning",
  headline = ["The day, already", "in order."],
  copy = "Waylight turns a yard's worth of moving work into one legible day — every crew, every slot, every handoff accounted for before the gate opens.",
  primaryCta = "Start planning",
  secondaryCta = "See a live yard",
  onPrimary,
  onSecondary,
  rows = DEFAULT_ROWS,
  panelTitle = "Today · North yard",
  panelMetric = { label: "hours scheduled", value: 62 },
  className,
}: HeroSplitLedgerProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative overflow-hidden", className)}
    >
      <GradientDrift
        aria-hidden
        className="pointer-events-none absolute inset-0 !h-full opacity-40"
      />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-6 py-20 sm:py-24 lg:grid-cols-2 lg:gap-16 lg:py-28">
        <RevealStagger className="flex max-w-xl flex-col items-start gap-5">
          <p className="text-label text-ink-3 flex items-center gap-2">
            <CalendarCheck2 className="size-3.5" aria-hidden />
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
          <p className="text-ink-3 flex items-center gap-2 text-sm">
            <Users2 className="size-4" aria-hidden />
            Runs 214 yards on the morning shift
          </p>
        </RevealStagger>

        {/* The vignette: a working panel, not a screenshot. */}
        <div className="border-hairline bg-surface-1 rounded-4 relative w-full max-w-lg justify-self-center border p-5 shadow-raised lg:justify-self-end">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-label text-ink-3">{panelTitle}</p>
            <p className="flex items-baseline gap-2">
              <Readout value={panelMetric.value} size="sm" />
              <span className="text-label text-ink-3">{panelMetric.label}</span>
            </p>
          </div>
          <ul className="mt-4 flex flex-col gap-2">
            {rows.map((row) => {
              const seal = row.state === "queued" ? null : STATE_SEAL[row.state];
              return (
                <li
                  key={row.id}
                  className="border-hairline bg-surface-0 rounded-2 flex items-center justify-between gap-3 border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-ink truncate text-sm font-medium">
                      {row.label}
                    </p>
                    <p className="text-ink-3 mt-0.5 font-mono text-[10px] tracking-[0.08em] uppercase">
                      {row.meta}
                    </p>
                  </div>
                  {seal ? (
                    <StatusSeal
                      variant={seal.variant}
                      live={row.state === "live"}
                      className="shrink-0"
                    >
                      {seal.label}
                    </StatusSeal>
                  ) : (
                    <span className="text-ink-3 shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase">
                      Queued
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
