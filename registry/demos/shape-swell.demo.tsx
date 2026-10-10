"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ShapeSwell } from "@/registry/ui/shape-swell";

export const tweaks = defineTweaks({
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 28,
    min: 16,
    max: 48,
    step: 4,
    unit: "px",
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.25,
    max: 2.5,
    step: 0.25,
  },
  shapes: {
    kind: "choice",
    label: "Shapes",
    default: "mixed",
    options: ["mixed", "round", "plus", "angular"],
    names: { mixed: "Mixed", round: "Round", plus: "Plus", angular: "Angular" },
  },
  turn: {
    kind: "range",
    label: "Turn",
    default: 90,
    min: 0,
    max: 180,
    step: 15,
    unit: "°",
  },
});

const SET = {
  mixed: "mixed shapes",
  round: "circles",
  plus: "plus signs",
  angular: "squares and triangles",
} as const;

/**
 * Gaugeworks Studio introducing its design language: the hero sits on a field
 * of the studio's four basic forms, swelling past in rows.
 */
export function ShapeSwellDemo({
  chrome = true,
  // The field is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [swelling, setSwelling] = React.useState(false);
  const spacing = values.spacing ?? 28;
  const set = SET[values.shapes ?? "mixed"];

  const field = (
    <ShapeSwell
      onActiveChange={setSwelling}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline bg-card"
          : "h-52 rounded-3 border border-hairline bg-card"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks Studio
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            A grammar of simple forms
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Four shapes, one rhythm, every product
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Read the guide
              </button>
            </>
          ) : null}
        </div>
      </div>
    </ShapeSwell>
  );

  if (!chrome) return <div className="flex w-full">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {swelling ? (
          <>
            <span className="text-signal">swelling</span> · the crest follows
            you
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · {set}, {spacing} px
            apart
          </>
        )}
      </p>
    </div>
  );
}
