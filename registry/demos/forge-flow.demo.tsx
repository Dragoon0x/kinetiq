"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ForgeFlow } from "@/registry/ui/forge-flow";

export const tweaks = defineTweaks({
  heat: {
    kind: "range",
    label: "Heat",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  crust: {
    kind: "range",
    label: "Crust",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  flow: {
    kind: "range",
    label: "Flow",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
});

/**
 * Basinworks Foundry's hero: the headline sits on the melt, and the crust
 * opens wherever the visitor's hand — or keyboard focus — rests.
 */
export function ForgeFlowDemo({
  chrome = true,
  // The metal is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pour, setPour] = React.useState(0);
  const [set, setSet] = React.useState(false);
  const [hot, setHot] = React.useState(false);

  const metal = (
    <ForgeFlow
      key={pour}
      onIntroEnd={() => setSet(true)}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      contentClassName="flex flex-col justify-end"
      {...values}
    >
      <div className="bg-linear-to-t from-background/85 via-background/45 to-transparent p-4 pt-10 sm:p-5 sm:pt-12">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Basinworks Foundry
        </p>
        <p className="mt-1 max-w-72 text-lg leading-snug font-semibold text-balance text-foreground sm:text-xl">
          Steel, poured to order
        </p>
        {chrome ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Book a pour
            </button>
            <span className="text-xs text-ink-2">
              Small-batch castings, 48-hour pour
            </span>
          </div>
        ) : null}
      </div>
    </ForgeFlow>
  );

  if (!chrome) return <div className="flex w-full">{metal}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setHot(true);
        }}
        onPointerLeave={() => setHot(false)}
        onFocus={(event) => {
          if (event.target.matches(":focus-visible")) setHot(true);
        }}
        onBlur={() => setHot(false)}
      >
        {metal}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {!set ? (
            <>
              <span className="text-signal">pouring</span> · the crust is
              setting
            </>
          ) : hot ? (
            <>
              <span className="text-signal">crust open</span> · the metal runs
              under the hand
            </>
          ) : (
            <>
              <span className="text-signal">crust set</span> · move over the
              metal
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setPour((n) => n + 1);
            setSet(false);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Pour again
        </button>
      </div>
    </div>
  );
}
