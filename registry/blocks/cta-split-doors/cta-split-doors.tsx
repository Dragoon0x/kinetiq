"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { cn } from "@/registry/lib/utils";

export type Door = {
  id: string;
  kicker: string;
  title: string;
  copy: string;
  cta: string;
  onCta?: () => void;
  details: string[];
  primary?: boolean;
};

export type CtaSplitDoorsProps = {
  headline?: string;
  doors?: [Door, Door];
  className?: string;
};

const DEFAULT_DOORS: [Door, Door] = [
  {
    id: "self",
    kicker: "SELF-SERVE",
    title: "Walk in",
    copy: "Open a bench now and find your own way around. Most teams are running before lunch.",
    cta: "Start free",
    details: ["No card, no call", "Import whenever", "Leave with your data"],
    primary: true,
  },
  {
    id: "guided",
    kicker: "GUIDED",
    title: "Be walked through",
    copy: "Thirty minutes with someone from the field team, on your data, with your questions.",
    cta: "Book the half hour",
    details: ["A person, not a demo reel", "Your data, live", "No follow-up sequence"],
  },
];

/**
 * The close as two honest doors: self-serve and guided, given equal floor and
 * equal typography — the primary door earns its weight through the button
 * alone. Each door states its own micro-terms underneath, because the reader
 * choosing a path deserves to know its cost before knocking.
 */
export function CtaSplitDoors({
  headline = "Two ways in. Both real.",
  doors = DEFAULT_DOORS,
  className,
}: CtaSplitDoorsProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
        <h2
          id={headingId}
          className="text-center text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {headline}
        </h2>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {doors.map((door) => (
            <div
              key={door.id}
              className="border-hairline bg-surface-1 rounded-4 flex flex-col border p-6 sm:p-8"
            >
              <p className="text-label text-ink-3">{door.kicker}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">
                {door.title}
              </h3>
              <p className="text-ink-2 mt-3 flex-1 leading-relaxed">{door.copy}</p>

              <div className="mt-6">
                <PressureButton
                  size="lg"
                  variant={door.primary ? "solid" : "outline"}
                  onClick={door.onCta}
                  className="w-full"
                >
                  {door.cta}
                  <ArrowRight className="size-4" aria-hidden />
                </PressureButton>
              </div>

              <ul className="border-hairline text-ink-3 mt-5 flex flex-col gap-1.5 border-t pt-4 font-mono text-[10px] tracking-[0.08em] uppercase">
                {door.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
