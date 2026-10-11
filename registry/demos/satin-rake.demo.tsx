"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SatinRake } from "@/registry/ui/satin-rake";

export const tweaks = defineTweaks({
  foldCount: {
    kind: "range",
    label: "Folds",
    default: 7,
    min: 3,
    max: 14,
    step: 1,
  },
  sheen: {
    kind: "range",
    label: "Sheen",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "cobalt",
    options: ["cobalt", "ivory", "rose", "jade"],
    names: { cobalt: "Cobalt", ivory: "Ivory", rose: "Rose", jade: "Jade" },
  },
});

/**
 * Fernworks Atelier's evening line: a length of duchess satin under a lamp,
 * with the order plate lying on the cloth.
 */
export function SatinRakeDemo({
  chrome = true,
  // The satin is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [inHand, setInHand] = React.useState(false);
  const [waves, setWaves] = React.useState(0);
  const folds = values.foldCount ?? tweaks.foldCount.default;
  const sheen = values.sheen ?? tweaks.sheen.default;

  const cloth = (
    <SatinRake
      onActiveChange={setInHand}
      onWave={() => setWaves((n) => n + 1)}
      className={chrome ? "h-64" : "h-52"}
      {...values}
    >
      <div className="flex size-full items-end p-4">
        <div className="max-w-60 rounded-3 border border-hairline bg-background/85 px-3.5 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Atelier
          </p>
          <p className="mt-1 text-sm leading-snug font-medium text-balance text-foreground">
            Duchess satin, cut to order
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Fourteen dyes, finished by hand
              </p>
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
    </SatinRake>
  );

  if (!chrome) {
    return (
      <div className="flex w-full overflow-clip rounded-3 border border-hairline">
        {cloth}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="overflow-clip rounded-3 border border-hairline">
        {cloth}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {inHand ? (
          <>
            <span className="text-signal">lamp in hand</span> · rake it across
            the folds
          </>
        ) : (
          <>
            <span className="text-signal">lamp sweeping</span> · {folds} folds,
            sheen {sheen.toFixed(2)}
            {waves > 0
              ? ` · ${waves} ${waves === 1 ? "wave" : "waves"} sent`
              : ""}
          </>
        )}
      </p>
    </div>
  );
}
