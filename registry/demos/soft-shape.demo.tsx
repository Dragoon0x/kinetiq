"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { SoftShape } from "@/registry/ui/soft-shape";

export const tweaks = defineTweaks({
  softness: {
    kind: "range",
    label: "Softness",
    default: 28,
    min: 0,
    max: 60,
    step: 4,
    unit: "px",
  },
  shapes: {
    kind: "choice",
    label: "Shapes",
    default: "mixed",
    options: ["mixed", "circles", "squares", "triangles"],
    names: {
      mixed: "Mixed",
      circles: "Circles",
      squares: "Squares",
      triangles: "Triangles",
    },
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "dusk", "ember", "moss"],
    names: { cobalt: "Cobalt", dusk: "Dusk", ember: "Ember", moss: "Moss" },
  },
});

type Phase = "resting" | "near" | "gathered" | "scattered";

/**
 * Fernworks' identity kit: a hero panel of soft pigment shapes that drift
 * together under the pointer and gather into one mass while you hold.
 */
export function SoftShapeDemo({
  chrome = true,
  // The shapes are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [phase, setPhase] = React.useState<Phase>("resting");
  const [gathers, setGathers] = React.useState(0);

  const field = (
    <SoftShape
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1",
        chrome ? "h-64" : "h-52",
      )}
      onGatherChange={(gathered) => {
        if (gathered) {
          setGathers((n) => n + 1);
          setPhase("gathered");
        } else {
          setPhase("scattered");
        }
      }}
      {...values}
    >
      <div
        className="flex size-full flex-col items-start justify-between gap-3 p-4 sm:p-5"
        onPointerEnter={() => setPhase((p) => (p === "resting" ? "near" : p))}
      >
        <p className="rounded-full bg-background/80 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
          Fernworks · identity kit
        </p>
        <div className="flex max-w-[17rem] flex-col items-start gap-2 rounded-3 bg-background/80 px-3 py-2.5 backdrop-blur-sm">
          <p className="text-base leading-snug font-semibold tracking-tight text-balance text-foreground">
            Soft edges, firm ideas.
          </p>
          {chrome ? (
            <>
              <p className="text-xs text-ink-2">
                Shapes, colour and motion for brands that move.
              </p>
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the kit
              </button>
            </>
          ) : null}
        </div>
      </div>
    </SoftShape>
  );

  if (!chrome) return <div className="flex w-full">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase === "gathered" ? (
          <>
            <span className="text-signal">gathered</span> · release to scatter
          </>
        ) : phase === "scattered" ? (
          <>
            <span className="text-signal">scattered</span> · {gathers}{" "}
            {gathers === 1 ? "gather" : "gathers"} so far
          </>
        ) : phase === "near" ? (
          <>
            <span className="text-signal">drawing in</span> · hold to gather
          </>
        ) : (
          <>
            <span className="text-signal">resting</span> · point at the shapes
            or press Tab
          </>
        )}
      </p>
    </div>
  );
}
