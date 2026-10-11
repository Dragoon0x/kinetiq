"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BladeType } from "@/registry/ui/blade-type";

export const tweaks = defineTweaks({
  gravity: {
    kind: "range",
    label: "Gravity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  healDelay: {
    kind: "range",
    label: "Heal after",
    default: 900,
    min: 200,
    max: 3000,
    step: 100,
    unit: "ms",
  },
  thickness: {
    kind: "range",
    label: "Card",
    default: 2,
    min: 0,
    max: 4,
    step: 0.5,
    unit: "px",
  },
});

type State =
  { kind: "whole" } | { kind: "cut"; letters: number } | { kind: "mended" };

/**
 * Coldbrook Paper Co.'s heaviest board: the headline is cut from it, takes
 * a blade and mends.
 */
export function BladeTypeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<State>({ kind: "whole" });
  // A new gravity or heal delay shows itself at once: the blade cuts again.
  const replayKey = `${values.gravity ?? ""}|${values.healDelay ?? ""}`;

  const card = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook Paper Co. · 600gsm board
      </p>
      <BladeType
        as="h2"
        text="Cut clean, mended clean"
        sound={sound}
        replayKey={replayKey}
        onCut={(letters) => setState({ kind: "cut", letters })}
        onHeal={() => setState({ kind: "mended" })}
        {...values}
        className="text-[clamp(1.75rem,7.6cqi,3.5rem)] leading-[1.1] font-bold tracking-[-0.02em] text-foreground"
      />
      <p className="text-sm text-ink-2">
        Heavy board for the boxes, sleeves and covers that have to last.
      </p>
    </div>
  );

  if (!chrome) {
    return <div className="@container flex w-full max-w-2xl">{card}</div>;
  }

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {state.kind === "cut" ? (
          <>
            <span className="text-signal">cut</span> · {state.letters}{" "}
            {state.letters === 1 ? "letter" : "letters"} split · mending
          </>
        ) : state.kind === "mended" ? (
          <>
            <span className="text-signal">mended</span> · press Enter for a
            diagonal cut
          </>
        ) : (
          <>
            <span className="text-signal">whole</span> · drag across the
            headline to cut it
          </>
        )}
      </p>
    </div>
  );
}
