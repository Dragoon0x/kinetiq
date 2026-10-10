"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DuneGradient } from "@/registry/ui/dune-gradient";

export const tweaks = defineTweaks({
  layers: {
    kind: "range",
    label: "Layers",
    default: 5,
    min: 2,
    max: 8,
    step: 1,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "amber",
    options: ["amber", "rose", "sage", "cobalt"],
    names: { amber: "Amber", rose: "Rose", sage: "Sage", cobalt: "Cobalt" },
  },
  drift: {
    kind: "range",
    label: "Drift",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
});

type Wind = "still" | "leaning" | "gust";

/**
 * Waylight Crossings' hero: the trip's headline sits in the sky, and the
 * dunes lean with the visitor's hand; a press lifts sand off the crests.
 */
export function DuneGradientDemo({
  chrome = true,
  // The dunes are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [wind, setWind] = React.useState<Wind>("still");
  const [gusts, setGusts] = React.useState(0);
  const near = React.useRef(false);

  // The sand settles a moment after the gust; the line says so then.
  React.useEffect(() => {
    if (wind !== "gust") return;
    const calm = window.setTimeout(
      () => setWind(near.current ? "leaning" : "still"),
      1600,
    );
    return () => window.clearTimeout(calm);
  }, [wind, gusts]);

  const dunes = (
    <DuneGradient
      key={run}
      onGust={() => {
        setGusts((n) => n + 1);
        setWind("gust");
      }}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex flex-col items-start bg-linear-to-b from-background/75 via-background/45 to-transparent p-4 pb-8 sm:p-5 sm:pb-10">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Waylight Crossings
        </p>
        <p className="mt-1 max-w-64 text-lg leading-snug font-semibold text-balance text-foreground sm:text-xl">
          Twelve nights across the erg
        </p>
        {chrome ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              See the route
            </button>
            <span className="text-xs text-ink-2">Departs every new moon</span>
          </div>
        ) : null}
      </div>
    </DuneGradient>
  );

  if (!chrome) return <div className="flex w-full">{dunes}</div>;

  const enter = () => {
    near.current = true;
    setWind((w) => (w === "gust" ? w : "leaning"));
  };
  const leave = () => {
    near.current = false;
    setWind((w) => (w === "gust" ? w : "still"));
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") enter();
        }}
        onPointerLeave={leave}
        onFocus={(event) => {
          if (event.target.matches(":focus-visible")) enter();
        }}
        onBlur={leave}
      >
        {dunes}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {wind === "gust" ? (
            <>
              <span className="text-signal">gust</span> · sand off the crests
            </>
          ) : wind === "leaning" ? (
            <>
              <span className="text-signal">leaning</span> · the dunes follow
              the hand
            </>
          ) : (
            <>
              <span className="text-signal">dunes laid</span> · move to lean,
              press for a gust
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setRun((n) => n + 1);
            setWind(near.current ? "leaning" : "still");
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Lay again
        </button>
      </div>
    </div>
  );
}
