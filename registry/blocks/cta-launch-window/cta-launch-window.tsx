"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { GradientDrift } from "@/registry/ui/gradient-drift";
import { PressureButton } from "@/registry/ui/pressure-button";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type CtaLaunchWindowProps = {
  headline?: [string, string];
  copy?: string;
  cta?: string;
  onSubmit?: (email: string) => void;
  /** The quiet reassurances under the form. */
  notes?: string[];
  className?: string;
};

/**
 * The closing ask as a lit window: one headline, one field, one button,
 * framed in a drifting gradient held bright at the section's heart and dark
 * at its edges. The field and the button are the library's own — the same
 * traced focus and pressed confirm as everywhere else — because the last
 * thing a page asks should feel like the product it sold.
 */
export function CtaLaunchWindow({
  headline = ["Your first bench", "is a minute away."],
  copy = "Start free, import nothing, and keep everything you make. The instruments are already calibrated.",
  cta = "Open a bench",
  onSubmit,
  notes = ["Free for one bench", "No card up front"],
  className,
}: CtaLaunchWindowProps) {
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
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="border-hairline rounded-4 relative overflow-hidden border">
          <GradientDrift
            aria-hidden
            className="pointer-events-none absolute inset-0 !h-full opacity-60"
          />
          <div
            aria-hidden
            className="from-surface-0/70 via-surface-0/20 to-surface-0/70 pointer-events-none absolute inset-0 bg-gradient-to-b"
          />

          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-16 text-center sm:py-20">
            <h2
              id={headingId}
              className="text-3xl leading-[1.06] font-semibold tracking-tight text-balance sm:text-5xl"
            >
              {headline[0]}
              <br />
              {headline[1]}
            </h2>
            <p className="text-ink-2 max-w-md leading-relaxed">{copy}</p>

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
                {sent ? "Sent" : cta}
                {!sent && <ArrowRight className="size-4" aria-hidden />}
              </PressureButton>
            </form>

            <p role="status" className="text-ink-3 min-h-4 text-xs">
              {sent ? "Check your inbox — the bench link is on its way." : ""}
            </p>

            <ul className="text-ink-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[10px] tracking-[0.08em] uppercase">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
