"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type NewsletterLedgerNoteProps = {
  headline?: string;
  copy?: string;
  /** The honest circulation count, rolling. */
  readers?: number;
  readersLabel?: string;
  cta?: string;
  onSubscribe?: (email: string) => void;
  className?: string;
};

/**
 * A newsletter note for between sections: one line of pitch, the field, and
 * the circulation count rolling beside it — because "join 4,180 readers" is
 * only worth saying when the number is real enough to print. Compact by
 * design; the full pressroom treatment belongs to its own section.
 */
export function NewsletterLedgerNote({
  headline = "The field notes, monthly.",
  copy = "What broke, what held, and the one change worth stealing.",
  readers = 4_180,
  readersLabel = "readers on the ledger",
  cta = "Join them",
  onSubscribe,
  className,
}: NewsletterLedgerNoteProps) {
  const headingId = React.useId();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    onSubscribe?.(email);
    setSent(true);
    setEmail("");
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("border-hairline bg-surface-1 border-y", className)}
    >
      <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-6 py-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
        <div>
          <h2 id={headingId} className="text-xl font-semibold tracking-tight">
            {headline}
          </h2>
          <p className="text-ink-2 mt-1.5 text-sm leading-relaxed">{copy}</p>
          <p className="mt-3 flex items-baseline gap-2">
            <Readout
              value={readers}
              size="sm"
              format={(v) => v.toLocaleString("en-US")}
            />
            <span className="text-label text-ink-3">{readersLabel}</span>
          </p>
        </div>

        <form
          onSubmit={submit}
          aria-label={cta}
          className="flex w-full items-start gap-2 lg:justify-self-end lg:max-w-md"
        >
          <TraceInput
            label="Email address"
            labelHidden
            type="email"
            name="email"
            placeholder="you@field.example"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setSent(false);
            }}
            autoComplete="email"
            className="flex-1"
          />
          <PressureButton type="submit" className="h-11 shrink-0">
            {sent ? "Joined" : cta}
          </PressureButton>
        </form>
      </div>
    </section>
  );
}
