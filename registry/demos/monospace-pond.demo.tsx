"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MonospacePond } from "@/registry/ui/monospace-pond";

export const tweaks = defineTweaks({
  damping: {
    kind: "range",
    label: "Damping",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  ramp: {
    kind: "choice",
    label: "Ramp",
    default: "ascii",
    options: ["ascii", "blocks", "dots", "marks"],
    names: { ascii: "ASCII", blocks: "Blocks", dots: "Dots", marks: "Marks" },
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * A Coldbrook Reservoir field note, written at first light and set in mono
 * on a card; the paragraph is the water it describes.
 */
export function MonospacePondDemo({
  chrome = true,
  // The pond is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [still, setStill] = React.useState(true);
  const [stones, setStones] = React.useState(0);

  const note = (
    <div className="@container w-full overflow-clip rounded-3 border border-hairline bg-card">
      <p className="px-4 pt-3 font-mono text-[10px] leading-none tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook Reservoir · 06:10
      </p>
      <MonospacePond
        onCalmChange={setStill}
        onStone={() => setStones((n) => n + 1)}
        className="rounded-none px-4 pt-2.5 pb-3.5 text-[11px] leading-[1.7] @[30rem]:text-[13px] @[30rem]:leading-[1.75] @[44rem]:text-[15px]"
        {...values}
      />
    </div>
  );

  if (!chrome) return note;

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      {note}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {still ? (
          <>
            <span className="text-signal">still water</span> · move to stir,
            click to drop a stone
          </>
        ) : (
          <>
            <span className="text-signal">stirring</span>
            {stones > 0
              ? ` · ${stones} ${stones === 1 ? "stone" : "stones"} dropped`
              : " · the text will settle back"}
          </>
        )}
      </p>
    </div>
  );
}
