"use client";

import * as React from "react";

import { GlossWord } from "@/registry/ui/gloss-word";

export function GlossWordDemo() {
  const [term, setTerm] = React.useState<string | null>(null);

  const track = (name: string) => (open: boolean) =>
    setTerm((prev) => (open ? name : prev === name ? null : prev));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {/* flow-root so the paragraph contains the gloss floats it opens. */}
      <p className="flow-root text-sm leading-relaxed text-ink-2">
        Coldbrook meters report on a{" "}
        <GlossWord
          term="duty cycle"
          gloss="The share of each hour a pump actually runs. Reported as a percentage of the sampling window."
          onOpenChange={track("duty cycle")}
        />{" "}
        rather than a raw total, so a site that pumps hard for ten minutes reads
        the same as one that trickles all hour. Readings arrive with a{" "}
        <GlossWord
          term="settling window"
          gloss="Ninety seconds after a valve moves, during which pressure is ignored."
          onOpenChange={track("settling window")}
        />{" "}
        attached, and anything logged inside it is held back until the line is{" "}
        <GlossWord
          term="quiet"
          gloss="Less than 2 kPa of variation across three consecutive samples."
          onOpenChange={track("quiet")}
        />
        . The dashboard totals them nightly against the{" "}
        <GlossWord
          mode="bubble"
          term="baseline"
          gloss="The median of the last fourteen quiet nights, recomputed each Sunday."
          onOpenChange={track("baseline")}
        />{" "}
        held for the site.
      </p>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {term ? (
          <>
            Gloss <span className="text-signal">{term}</span>
          </>
        ) : (
          "No gloss open"
        )}
      </p>
    </div>
  );
}
