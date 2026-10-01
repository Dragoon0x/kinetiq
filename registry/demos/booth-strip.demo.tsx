"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BoothStrip, type BoothStripPhase } from "@/registry/ui/booth-strip";

export const tweaks = defineTweaks({
  frames: {
    kind: "range",
    label: "Frames",
    default: 4,
    min: 3,
    max: 4,
    step: 1,
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "bw",
    options: ["bw", "sepia", "colour"],
    names: { bw: "Black and white", sepia: "Sepia", colour: "Colour" },
  },
  flash: { kind: "toggle", label: "Flash", default: true },
});

/**
 * The photo booth in the corner of the Fernworks studio party: take a strip,
 * shake it dry, pick the good one.
 */
export function BoothStripDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [shot, setShot] = React.useState<number | null>(null);
  const [phase, setPhase] = React.useState<BoothStripPhase>("dry");
  const [strips, setStrips] = React.useState(1);
  const frames = values.frames ?? 4;

  return (
    <div className="flex w-full max-w-80 flex-col items-center gap-3">
      <BoothStrip
        label="Fernworks party booth"
        caption="Fernworks 01.10.26"
        value={shot}
        onValueChange={setShot}
        onPhaseChange={setPhase}
        onPrint={() => setStrips((n) => n + 1)}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {shot !== null ? (
            <>
              <span className="text-signal">viewing shot {shot + 1}</span> · of{" "}
              {frames}
            </>
          ) : phase === "shooting" ? (
            <>
              <span className="text-signal">shooting</span> · {frames} shots
            </>
          ) : phase === "wet" ? (
            <>
              <span className="text-signal">printed</span> · shake to dry
            </>
          ) : (
            <>
              <span className="text-signal">ready</span> · strip № {strips} dry
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
