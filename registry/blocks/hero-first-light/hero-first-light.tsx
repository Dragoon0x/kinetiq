"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { RevealStagger } from "@/registry/ui/reveal-stagger";
import { StatusSeal } from "@/registry/ui/status-seal";
import { TraceInput } from "@/registry/ui/trace-input";
import { Wavefield } from "@/registry/ui/wavefield";
import { cn } from "@/registry/lib/utils";

export type HeroFirstLightProps = {
  notice?: string;
  headline?: [string, string];
  copy?: string;
  cta?: string;
  onSubmit?: (email: string) => void;
  /** The quiet line under the form. */
  footnote?: string;
  /** The three-word promises under the fold. */
  assurances?: string[];
  className?: string;
};

/**
 * An early-access hero: the whole page asks for one thing, and the form is
 * the headline's own punctuation — a traced field and a pressed confirm on
 * the centre line, nothing else competing. A drift wavefield breathes at the
 * floor of the stage, and the assurances sit under the fold in mono, quiet
 * as fine print but readable as promises.
 */
export function HeroFirstLight({
  notice = "First light · invitations rolling out",
  headline = ["Be there when", "the lights come on."],
  copy = "Loamline is opening bench by bench. Leave a work address and yours is next in the row.",
  cta = "Request access",
  onSubmit,
  footnote = "One email when your bench opens. Nothing else, ever.",
  assurances = ["No card", "No install", "Import later"],
  className,
}: HeroFirstLightProps) {
  const headingId = React.useId();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    onSubmit?.(email);
    setSent(true);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative overflow-hidden", className)}
    >
      <Wavefield
        variant="drift"
        density={0.35}
        speed={0.3}
        opacity={0.3}
        className="pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="from-surface-0 via-surface-0/30 to-surface-0/70 pointer-events-none absolute inset-0 bg-gradient-to-b"
      />

      <div className="relative mx-auto w-full max-w-7xl px-6 py-24 sm:py-28 lg:py-32">
        <RevealStagger className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
          <StatusSeal variant="info" live>
            {notice}
          </StatusSeal>
          <h1
            id={headingId}
            className="text-4xl leading-[1.04] font-semibold tracking-tight text-balance sm:text-6xl"
          >
            {headline[0]}
            <br />
            {headline[1]}
          </h1>
          <p className="text-ink-2 max-w-md text-base leading-relaxed sm:text-lg">
            {copy}
          </p>

          <form
            onSubmit={submit}
            aria-label={cta}
            className="mt-2 flex w-full max-w-md items-start gap-2"
          >
            <TraceInput
              label="Work email"
              labelHidden
              type="email"
              name="email"
              placeholder="you@studio.example"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSent(false);
              }}
              autoComplete="email"
              className="flex-1 text-left"
            />
            <PressureButton type="submit" size="lg" className="h-11 shrink-0">
              {sent ? "Requested" : cta}
            </PressureButton>
          </form>
          <p role="status" className="text-ink-3 min-h-4 text-xs">
            {sent ? "In the row — watch that inbox." : footnote}
          </p>

          <ul className="text-ink-3 mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[10px] tracking-[0.08em] uppercase">
            {assurances.map((assurance) => (
              <li key={assurance}>{assurance}</li>
            ))}
          </ul>
        </RevealStagger>
      </div>
    </section>
  );
}
