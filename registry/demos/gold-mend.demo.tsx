"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GoldMend } from "@/registry/ui/gold-mend";

export const tweaks = defineTweaks({
  crackCount: {
    kind: "range",
    label: "Cracks",
    default: 5,
    min: 2,
    max: 9,
    step: 1,
  },
  glaze: {
    kind: "choice",
    label: "Glaze",
    default: "celadon",
    options: ["celadon", "ivory", "indigo", "tenmoku"],
    names: {
      celadon: "Celadon",
      ivory: "Ivory",
      indigo: "Indigo",
      tenmoku: "Tenmoku",
    },
  },
  goldWidth: {
    kind: "range",
    label: "Gold",
    default: 1.5,
    min: 0.5,
    max: 4,
    step: 0.25,
    unit: "px",
  },
});

type Story =
  { kind: "idle" } | { kind: "cracked" } | { kind: "mended"; seams: number };

/**
 * Fieldline Ceramics, a repair studio: their promise set as a glazed
 * headline that every visitor is invited to break, and that comes back
 * richer each time.
 */
export function GoldMendDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>({ kind: "idle" });
  const [round, setRound] = React.useState(0);

  const headline = (
    <div className="@container flex w-full flex-col items-center text-center">
      {chrome ? null : (
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Ceramics · Repair studio
        </p>
      )}
      <GoldMend
        text="Mended in gold"
        resetKey={round}
        sound={sound}
        onBreak={() => setStory({ kind: "cracked" })}
        onMend={(seams) => setStory({ kind: "mended", seams })}
        className="mt-1 max-w-full font-semibold tracking-tight"
        {...values}
      />
      {chrome ? (
        <p className="mt-1 max-w-[34ch] text-sm text-ink-2">
          Every break becomes part of the piece.
        </p>
      ) : null}
    </div>
  );

  if (!chrome) {
    return (
      <div className="flex w-full [&_h2]:text-[clamp(2.25rem,11cqw,4.25rem)] [&_h2]:leading-none">
        {headline}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3 [&_h2]:text-[clamp(2.25rem,11cqw,4.5rem)] [&_h2]:leading-none">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Ceramics · Repair studio
        </p>
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setStory({ kind: "idle" });
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-background px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Start over
        </button>
      </div>
      <div className="rounded-3 border border-hairline bg-card px-4 py-6">
        {headline}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story.kind === "cracked" ? (
          <>
            <span className="text-signal">cracked</span> · gold flowing
          </>
        ) : story.kind === "mended" ? (
          <>
            <span className="text-signal">mended</span> · {story.seams}{" "}
            {story.seams === 1 ? "seam" : "seams"} of gold
          </>
        ) : (
          <>
            <span className="text-signal">click to break</span> · enter for the
            centre
          </>
        )}
      </p>
    </div>
  );
}
