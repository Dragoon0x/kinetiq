"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type Signature = { id: string; name: string; note: string };

export type CtaSignatureLineProps = {
  headline?: string;
  copy?: string;
  /** The count of names already on the line. */
  count?: number;
  countLabel?: string;
  /** The most recent signatures, shown as provenance. */
  recent?: Signature[];
  cta?: string;
  onSign?: (name: string) => void;
  className?: string;
};

const DEFAULT_RECENT: Signature[] = [
  { id: "s1", name: "M. Aldana", note: "north basin" },
  { id: "s2", name: "T. Brekke", note: "kettle point" },
  { id: "s3", name: "S. Okonkwo", note: "relay floor" },
];

/**
 * The close as a signature line: a ledger of names instead of an email
 * funnel — the count rolls, the latest signatures sit there as provenance,
 * and signing asks only for a name. For communities and open registries
 * where joining is a public act, and the page's proof is who already did.
 */
export function CtaSignatureLine({
  headline = "Put your name on the line.",
  copy = "The open registry of yards running mornings without the argument. Signing adds your name — nothing else.",
  count = 214,
  countLabel = "names on the line",
  recent = DEFAULT_RECENT,
  cta = "Sign it",
  onSign,
  className,
}: CtaSignatureLineProps) {
  const headingId = React.useId();
  const [name, setName] = React.useState("");
  const [signed, setSigned] = React.useState(false);
  const shown = signed ? count + 1 : count;

  const sign = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || signed) return;
    onSign?.(name.trim());
    setSigned(true);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="border-hairline rounded-4 border p-8 sm:p-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-sm">
              <h2
                id={headingId}
                className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
              >
                {headline}
              </h2>
              <p className="text-ink-2 mt-3 text-sm leading-relaxed">{copy}</p>
            </div>
            <p className="flex flex-col items-end">
              <Readout value={shown} size="lg" />
              <span className="text-label text-ink-3 mt-1">{countLabel}</span>
            </p>
          </div>

          <form onSubmit={sign} aria-label={cta} className="mt-8 flex items-start gap-2">
            <TraceInput
              label="Your name"
              labelHidden
              placeholder="Name, as it should appear"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="flex-1"
              disabled={signed}
            />
            <PressureButton type="submit" className="h-11 shrink-0" disabled={signed}>
              {signed ? "Signed" : cta}
            </PressureButton>
          </form>
          <p role="status" className="text-ink-3 mt-2 min-h-4 text-xs">
            {signed ? `${name.trim()} — on the line.` : ""}
          </p>

          <ul className="border-hairline mt-6 flex flex-wrap gap-x-8 gap-y-2 border-t pt-4">
            {recent.map((signature) => (
              <li key={signature.id} className="flex items-baseline gap-2">
                <span className="text-ink font-mono text-sm italic">
                  {signature.name}
                </span>
                <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">
                  {signature.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
