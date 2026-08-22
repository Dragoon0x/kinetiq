"use client";

import * as React from "react";

import { FileCheck2, KeyRound, ServerCog, ShieldCheck } from "lucide-react";

import { SparkChart } from "@/registry/ui/spark-chart";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type VaultMark = { id: string; label: string; state: string };
export type VaultSafeguard = {
  id: string;
  icon?: React.ReactNode;
  title: string;
  copy: string;
};

export type TrustVaultBriefProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  marks?: VaultMark[];
  safeguards?: VaultSafeguard[];
  /** Ninety days of uptime, most recent last, as percentages. */
  uptime?: number[];
  uptimeLabel?: string;
  className?: string;
};

const DEFAULT_MARKS: VaultMark[] = [
  { id: "soc2", label: "SOC 2 Type II", state: "audited annually" },
  { id: "iso", label: "ISO 27001", state: "certified" },
  { id: "gdpr", label: "GDPR", state: "EU data residency" },
  { id: "pentest", label: "Pen test", state: "twice yearly" },
];

const DEFAULT_SAFEGUARDS: VaultSafeguard[] = [
  {
    id: "rest",
    icon: <KeyRound className="size-4" aria-hidden />,
    title: "Encrypted at rest and in motion",
    copy: "Every row, every export, every backup — keys rotated on a schedule the audit can read.",
  },
  {
    id: "access",
    icon: <FileCheck2 className="size-4" aria-hidden />,
    title: "Access with a paper trail",
    copy: "Support can only see what you show them, and every look is logged where you can see it.",
  },
  {
    id: "blast",
    icon: <ServerCog className="size-4" aria-hidden />,
    title: "Small blast radius by design",
    copy: "Tenants are isolated to their own keys; one customer's bad day cannot become yours.",
  },
];

/** Ninety points, all above 99.9 — deterministic, no clock, no randomness. */
const DEFAULT_UPTIME = Array.from({ length: 90 }, (_, i) =>
  99.9 + 0.1 * Math.abs(Math.sin(i * 1.7)),
);

/**
 * Trust stated calmly, in full: the compliance marks as seals with their
 * cadence attached, three safeguards in plain language, and ninety days of
 * uptime drawn by the spark instrument rather than claimed in a sentence.
 * Nothing pulses, nothing looms — a security page that fidgets reads as
 * nervous.
 */
export function TrustVaultBrief({
  eyebrow = "Keeper · trust",
  headline = "Boring, on purpose, in writing.",
  copy = "Security is a set of checkable claims. Here are ours, with who verifies them and how often.",
  marks = DEFAULT_MARKS,
  safeguards = DEFAULT_SAFEGUARDS,
  uptime = DEFAULT_UPTIME,
  uptimeLabel = "Uptime, last 90 days",
  className,
}: TrustVaultBriefProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3 flex items-center gap-2">
            <ShieldCheck className="size-3.5" aria-hidden />
            {eyebrow}
          </p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <dl className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {marks.map((mark) => (
            <div
              key={mark.id}
              className="border-hairline bg-surface-1 rounded-3 flex items-center justify-between gap-3 border px-4 py-3.5"
            >
              <dt className="text-ink text-sm font-medium">{mark.label}</dt>
              <dd>
                <StatusSeal variant="success" className="text-[10px]">
                  {mark.state}
                </StatusSeal>
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
          <ul className="flex flex-col gap-6">
            {safeguards.map((safeguard) => (
              <li key={safeguard.id} className="flex gap-4">
                <span
                  aria-hidden
                  className="border-hairline text-ink-3 rounded-2 flex size-9 shrink-0 items-center justify-center border"
                >
                  {safeguard.icon}
                </span>
                <div>
                  <p className="text-ink font-medium">{safeguard.title}</p>
                  <p className="text-ink-2 mt-1 text-sm leading-relaxed">
                    {safeguard.copy}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-hairline bg-surface-1 rounded-4 border p-5">
            <p className="text-label text-ink-3">{uptimeLabel}</p>
            <div className="mt-4">
              <SparkChart
                data={uptime}
                variant="line"
                height={90}
                label={uptimeLabel}
                format={(y) => `${y.toFixed(3)}%`}
              />
            </div>
            <p className="text-ink-3 mt-3 text-xs">
              Measured from outside the network, one probe a minute, published
              unedited.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
