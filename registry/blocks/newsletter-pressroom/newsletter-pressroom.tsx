"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { TraceInput } from "@/registry/ui/trace-input";
import { cn } from "@/registry/lib/utils";

export type PressIssue = {
  number: string;
  title: string;
  standfirst: string;
  readMinutes: number;
};

export type NewsletterPressroomProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  /** The proof: the last issue, shown instead of promised. */
  latest?: PressIssue;
  cadence?: string;
  cta?: string;
  onSubscribe?: (email: string) => void;
  className?: string;
};

const DEFAULT_ISSUE: PressIssue = {
  number: "№ 47",
  title: "The hydration ladder, retired",
  standfirst:
    "Why the test kitchen stopped chasing percentages and started weighing the bowl — and what three months of batch logs say about it.",
  readMinutes: 6,
};

/**
 * A newsletter signup that shows the goods: the latest issue set as a
 * pressroom proof — number, title, standfirst, read time — beside the ask.
 * Subscribing is the library's own field and pressed confirm, and the cadence
 * line is a commitment, not a vibe. If the preview does not earn the address,
 * the section has honestly answered the question.
 */
export function NewsletterPressroom({
  eyebrow = "Ovenword · the letter",
  headline = "Read one before you give an address.",
  copy = "One letter a week on baking as a practice. Every issue looks like this one.",
  latest = DEFAULT_ISSUE,
  cadence = "Weekly, Thursday mornings. Unsubscribe is one click, no survey.",
  cta = "Subscribe",
  onSubscribe,
  className,
}: NewsletterPressroomProps) {
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
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-lg">
            <p className="text-label text-ink-3">{eyebrow}</p>
            <h2
              id={headingId}
              className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {headline}
            </h2>
            <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>

            <form onSubmit={submit} aria-label={cta} className="mt-8 flex items-start gap-2">
              <TraceInput
                label="Email address"
                labelHidden
                type="email"
                name="email"
                placeholder="you@kitchen.example"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setSent(false);
                }}
                autoComplete="email"
                className="flex-1"
              />
              <PressureButton type="submit" className="h-11 shrink-0">
                {sent ? "Sent" : cta}
              </PressureButton>
            </form>
            <p role="status" className="text-ink-3 mt-2 min-h-4 text-xs">
              {sent ? "Confirmed — № 48 arrives Thursday." : ""}
            </p>
            <p className="text-ink-3 mt-4 font-mono text-[11px] tracking-[0.06em] uppercase">
              {cadence}
            </p>
          </div>

          {/* The proof: the latest issue, typeset. */}
          <article className="border-hairline bg-surface-1 rounded-4 border p-6 shadow-raised sm:p-8">
            <div className="border-hairline flex items-baseline justify-between border-b pb-4">
              <span className="text-label text-ink-3">{latest.number}</span>
              <span className="text-label text-ink-3">
                {latest.readMinutes} MIN READ
              </span>
            </div>
            <h3 className="mt-5 text-2xl font-semibold tracking-tight text-balance">
              {latest.title}
            </h3>
            <p className="text-ink-2 mt-3 leading-relaxed">{latest.standfirst}</p>
            <p className="text-ink-3 mt-6 flex items-center gap-1.5 text-sm">
              Continue reading
              <ArrowRight className="size-3.5" aria-hidden />
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
