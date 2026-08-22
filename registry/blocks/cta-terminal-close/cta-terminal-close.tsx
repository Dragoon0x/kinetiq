"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { CodeLathe } from "@/registry/ui/code-lathe";
import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type CtaTerminalCloseProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  /** The one command that starts everything. */
  command?: string;
  cta?: string;
  onCta?: () => void;
  /** Seals beside the command frame. */
  assurances?: string[];
  className?: string;
};

/**
 * A closing move for tools that live in the terminal: the ask is the install
 * command itself, turned out in the console frame with copy one click away —
 * because for this audience, "get started" means "give me the line". A
 * conventional button stands beside it for everyone else.
 */
export function CtaTerminalClose({
  eyebrow = "Keeper · get started",
  headline = "One line between you and an enforced fleet.",
  copy = "Install the CLI, point it at your fleet, and the first policy is running before the coffee is.",
  command = "curl -fsSL https://get.keeper.example | sh",
  cta = "Read the quickstart",
  onCta,
  assurances = ["mac / linux", "rootless", "uninstalls clean"],
  className,
}: CtaTerminalCloseProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="border-hairline bg-surface-1 rounded-4 mx-auto max-w-3xl border p-6 shadow-raised sm:p-10">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-3 leading-relaxed">{copy}</p>

          <div className="mt-6">
            <CodeLathe code={command} filename="install" copyable />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <ul className="flex flex-wrap items-center gap-2">
              {assurances.map((assurance) => (
                <li key={assurance}>
                  <StatusSeal variant="info" className="text-[10px]">
                    {assurance}
                  </StatusSeal>
                </li>
              ))}
            </ul>
            <PressureButton variant="outline" onClick={onCta}>
              {cta}
              <ArrowRight className="size-4" aria-hidden />
            </PressureButton>
          </div>
        </div>
      </div>
    </section>
  );
}
