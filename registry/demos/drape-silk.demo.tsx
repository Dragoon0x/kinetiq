"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DrapeSilk } from "@/registry/ui/drape-silk";

export const tweaks = defineTweaks({
  folds: {
    kind: "range",
    label: "Folds",
    default: 5,
    min: 2,
    max: 10,
    step: 1,
  },
  sheen: {
    kind: "range",
    label: "Sheen",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "var(--accent)",
    options: [
      "var(--accent)",
      "oklch(0.85 0.045 82)",
      "oklch(0.6 0.1 18)",
      "oklch(0.62 0.06 155)",
    ],
    names: {
      "var(--accent)": "Cobalt",
      "oklch(0.85 0.045 82)": "Ivory",
      "oklch(0.6 0.1 18)": "Rose",
      "oklch(0.62 0.06 155)": "Sage",
    },
  },
});

const DYES: Record<string, string> = {
  "var(--accent)": "cobalt",
  "oklch(0.85 0.045 82)": "ivory",
  "oklch(0.6 0.1 18)": "rose",
  "oklch(0.62 0.06 155)": "sage",
};

type Cloth = "rest" | "near" | "lifted" | "settling";

/**
 * Fieldline Atelier's silk line: the swatch is the page, and a press takes
 * the cloth up and lets it fall into new folds.
 */
export function DrapeSilkDemo({
  chrome = true,
  // The silk is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [near, setNear] = React.useState(false);
  const [cloth, setCloth] = React.useState<Exclude<Cloth, "near">>("rest");
  const dye = DYES[values.color ?? "var(--accent)"] ?? "cobalt";

  const silk = (
    <DrapeSilk
      onActiveChange={setNear}
      onLiftChange={(lifted) => setCloth(lifted ? "lifted" : "settling")}
      onSettle={() => setCloth("rest")}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="@container size-full">
        <div className="flex size-full items-center p-4 @lg:p-6">
          <div className="max-w-60 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fieldline Atelier
            </p>
            <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
              Silk that remembers the hand
            </p>
            {chrome ? (
              <>
                <p className="mt-1 text-xs text-ink-2">Charmeuse, 19 momme</p>
                <button
                  type="button"
                  className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                >
                  Order a swatch
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </DrapeSilk>
  );

  if (!chrome) return <div className="flex w-full">{silk}</div>;

  const shown: Cloth = cloth === "rest" && near ? "near" : cloth;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {silk}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {shown === "lifted" ? (
          <>
            <span className="text-signal">lifted</span> · it falls when you let
            go
          </>
        ) : shown === "settling" ? (
          <>
            <span className="text-signal">dropped</span> · settling into folds
          </>
        ) : shown === "near" ? (
          <>
            <span className="text-signal">lifted a little</span> · the cloth
            follows your hand
          </>
        ) : (
          <>
            <span className="text-signal">folds at rest</span> · {dye} silk
          </>
        )}
      </p>
    </div>
  );
}
