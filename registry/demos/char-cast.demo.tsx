"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CharCast } from "@/registry/ui/char-cast";

export const tweaks = defineTweaks({
  cell: {
    kind: "range",
    label: "Cell",
    default: 6,
    min: 4,
    max: 12,
    step: 1,
    unit: "px",
  },
  ramp: {
    kind: "choice",
    label: "Ramp",
    default: "short",
    options: ["fine", "short", "blocks", "dots"],
    names: { fine: "Fine", short: "Short", blocks: "Blocks", dots: "Dots" },
  },
  light: {
    kind: "range",
    label: "Light",
    default: 72,
    min: 0,
    max: 160,
    step: 8,
    unit: "px",
  },
});

/**
 * The Gaugeworks signal desk: the page's headline is set in characters, and
 * the pointer reads the true letters wherever it goes.
 */
export function CharCastDemo({
  chrome = true,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [cast, setCast] = React.useState(false);

  const hero = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Gaugeworks · signal desk
      </p>
      <CharCast
        key={run}
        as="h2"
        text="Signal, not noise"
        onComplete={() => setCast(true)}
        {...values}
        className="text-[clamp(3.25rem,14cqi,5.5rem)] leading-none font-black tracking-[-0.03em] text-balance text-foreground"
      />
    </div>
  );

  if (!chrome) {
    return <div className="@container flex w-full max-w-2xl">{hero}</div>;
  }

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      {hero}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{cast ? "cast" : "casting"}</span> ·
          move the pointer to read the letters
        </p>
        <button
          type="button"
          onClick={() => {
            setCast(false);
            setRun((n) => n + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Recast
        </button>
      </div>
    </div>
  );
}
