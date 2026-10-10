"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PollenFlow } from "@/registry/ui/pollen-flow";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Specks",
    default: 1600,
    min: 200,
    max: 4000,
    step: 200,
  },
  trail: {
    kind: "range",
    label: "Trail",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  colors: {
    kind: "choice",
    label: "Colors",
    default: "pollen",
    options: ["pollen", "dusk", "sea", "ink"],
    names: { pollen: "Pollen", dusk: "Dusk", sea: "Sea", ink: "Ink" },
  },
});

/**
 * Fernworks Seed Co. sells wildflower mixes; the hero air carries their
 * pollen past the opening line.
 */
export function PollenFlowDemo({
  chrome = true,
  // The current is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [eddying, setEddying] = React.useState(false);
  const [shaken, setShaken] = React.useState(false);
  const shakeTimer = React.useRef<number | null>(null);
  const count = values.count ?? 1600;
  const trail = values.trail ?? 0.5;
  const colors = values.colors ?? "pollen";

  const onShake = React.useCallback(() => {
    setShaken(true);
    if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => {
      shakeTimer.current = null;
      setShaken(false);
    }, 1600);
  }, []);

  React.useEffect(
    () => () => {
      if (shakeTimer.current !== null) window.clearTimeout(shakeTimer.current);
    },
    [],
  );

  const field = (
    <PollenFlow
      onActiveChange={setEddying}
      onShake={onShake}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/90 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Seed Co.
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Spring sowing has started
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Wildflower mixes for a sunny bank
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Shop seeds
              </button>
            </>
          ) : null}
        </div>
      </div>
    </PollenFlow>
  );

  if (!chrome) return <div className="flex w-full">{field}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {field}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {shaken ? (
          <>
            <span className="text-signal">shaken</span> · pollen loose on the
            breeze
          </>
        ) : eddying ? (
          <>
            <span className="text-signal">eddy</span> · the air turns round your
            hand
          </>
        ) : (
          <>
            <span className="text-signal">{colors}</span> · {count} specks ·
            trails {trail.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
