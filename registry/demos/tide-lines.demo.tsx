"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TideLines } from "@/registry/ui/tide-lines";

export const tweaks = defineTweaks({
  lines: {
    kind: "range",
    label: "Lines",
    default: 36,
    min: 12,
    max: 64,
    step: 4,
  },
  height: {
    kind: "range",
    label: "Height",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "cobalt",
    options: ["cobalt", "signal", "ink", "coral"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink", coral: "Coral" },
  },
});

/**
 * The Coldbrook Surf Report: the morning's forecast sits over the water it
 * describes. Press the sea to send in a set.
 */
export function TideLinesDemo({
  chrome = true,
  // The sea is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [windy, setWindy] = React.useState(false);
  const [rolling, setRolling] = React.useState(false);
  const quiet = React.useRef(0);
  const lines = Math.round(values.lines ?? 36);

  React.useEffect(() => () => window.clearTimeout(quiet.current), []);

  // The status names a set while it rolls in, then rests.
  const onSet = () => {
    setRolling(true);
    window.clearTimeout(quiet.current);
    quiet.current = window.setTimeout(() => setRolling(false), 2000);
  };

  const sea = (
    <TideLines
      onActiveChange={setWindy}
      onSet={onSet}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-start p-4 sm:p-5">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Surf Report
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Clean lines all morning
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Swell 1.4 m at 12 s, light offshore
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Read the forecast
              </button>
            </>
          ) : null}
        </div>
      </div>
    </TideLines>
  );

  if (!chrome) return <div className="flex w-full">{sea}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sea}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {rolling ? (
          <>
            <span className="text-signal">a set</span> · rolling in
          </>
        ) : windy ? (
          <>
            <span className="text-signal">wind on the water</span> · the swell
            builds
          </>
        ) : (
          <>
            <span className="text-signal">{lines} lines</span> · swell rolling
          </>
        )}
      </p>
    </div>
  );
}
