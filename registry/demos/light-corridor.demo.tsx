"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LightCorridor } from "@/registry/ui/light-corridor";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "var(--foreground)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "var(--foreground)": "Pearl",
    },
  },
});

type Look = "lighting" | "still" | "looking" | "rushing";

/**
 * Gaugeworks' release hero: the headline stands at the mouth of a corridor
 * of light that turns to look where the visitor points, and rushes forward
 * while a press is held.
 */
export function LightCorridorDemo({
  chrome = true,
  // The corridor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [look, setLook] = React.useState<Look>("lighting");
  const near = React.useRef(false);

  const corridor = (
    <LightCorridor
      key={run}
      vanish={[0.7, 0.48]}
      onIntroEnd={() => setLook(near.current ? "looking" : "still")}
      onRushChange={(rushing) =>
        setLook(rushing ? "rushing" : near.current ? "looking" : "still")
      }
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex h-full flex-col justify-center bg-linear-to-r from-background/85 via-background/50 to-transparent p-4 pr-6 sm:w-3/5 sm:p-6">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Gaugeworks 4.0
        </p>
        <p className="mt-1 max-w-52 text-lg leading-snug font-semibold text-balance text-foreground sm:max-w-64 sm:text-xl">
          The way through is lit
        </p>
        {chrome ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Read the notes
            </button>
            <span className="text-xs text-ink-2">Ships Thursday</span>
          </div>
        ) : null}
      </div>
    </LightCorridor>
  );

  if (!chrome) return <div className="flex w-full">{corridor}</div>;

  const enter = () => {
    near.current = true;
    setLook((l) => (l === "still" ? "looking" : l));
  };
  const leave = () => {
    near.current = false;
    setLook((l) => (l === "looking" ? "still" : l));
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
        {corridor}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {look === "lighting" ? (
            <>
              <span className="text-signal">lights coming on</span> · near to
              far
            </>
          ) : look === "rushing" ? (
            <>
              <span className="text-signal">rushing</span> · hold to keep going
            </>
          ) : look === "looking" ? (
            <>
              <span className="text-signal">looking</span> · the corridor turns
              with the hand
            </>
          ) : (
            <>
              <span className="text-signal">lights on</span> · move to look
              around, hold to rush
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setRun((n) => n + 1);
            setLook("lighting");
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Lights again
        </button>
      </div>
    </div>
  );
}
