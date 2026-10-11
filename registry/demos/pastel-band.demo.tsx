"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PastelBand } from "@/registry/ui/pastel-band";

export const tweaks = defineTweaks({
  tooth: {
    kind: "range",
    label: "Tooth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  width: {
    kind: "range",
    label: "Width",
    default: 0.46,
    min: 0.2,
    max: 0.8,
    step: 0.02,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "dusk",
    options: ["dusk", "meadow", "ember", "glacier"],
    names: {
      dusk: "Dusk",
      meadow: "Meadow",
      ember: "Ember",
      glacier: "Glacier",
    },
  },
});

/**
 * Fieldline Art Supply: a hero for their soft pastels, a ribbon of chalk
 * laid across dark paper that bends toward the hand and smudges under it.
 */
export function PastelBandDemo({
  chrome = true,
  // The sheet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [smudges, setSmudges] = React.useState(0);
  const palette = values.palette ?? "dusk";
  const tooth = values.tooth ?? 0.6;

  const sheet = (
    <PastelBand
      onSmudge={() => setSmudges((n) => n + 1)}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      {/* The paper is dark in either theme, so the caption wears the dark theme. */}
      <div className="dark flex size-full items-end p-3 sm:p-4">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/70 px-3 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline · soft pastels
          </p>
          <p className="mt-0.5 text-sm leading-snug font-medium text-balance text-foreground">
            Ninety-six colours, one stick at a time.
          </p>
        </div>
      </div>
    </PastelBand>
  );

  if (!chrome) return <div className="flex w-full">{sheet}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sheet}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{palette}</span> · tooth{" "}
        {tooth.toFixed(2)} ·{" "}
        {smudges === 0
          ? "drag to smudge"
          : smudges === 1
            ? "1 smudge"
            : `${smudges} smudges`}
      </p>
    </div>
  );
}
