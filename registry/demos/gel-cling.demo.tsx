"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GelCling } from "@/registry/ui/gel-cling";

export const tweaks = defineTweaks({
  thickness: {
    kind: "range",
    label: "Thickness",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tack: {
    kind: "range",
    label: "Tack",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "cherry",
    options: ["cherry", "lime", "sky", "honey"],
    names: { cherry: "Cherry", lime: "Lime", sky: "Sky", honey: "Honey" },
  },
});

const HOME: [number, number] = [0.5, 0.5];

type Story =
  | { kind: "stuck"; at: [number, number] }
  | { kind: "peeling"; amount: number }
  | { kind: "lifted" };

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * The Coldbrook Aquarium gift shop's window: a gel star stuck to the glass,
 * to be peeled, carried and stuck down somewhere else.
 */
export function GelClingDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [at, setAt] = React.useState<[number, number]>(HOME);
  const [story, setStory] = React.useState<Story>({ kind: "stuck", at: HOME });

  const pane = (
    <div className="relative w-full">
      <GelCling
        label="Gel star"
        shape="star"
        position={at}
        onPositionChange={setAt}
        onPeel={(amount) =>
          setStory(
            amount > 0 ? { kind: "peeling", amount } : { kind: "stuck", at },
          )
        }
        onLift={() => setStory({ kind: "lifted" })}
        onStick={(where) => setStory({ kind: "stuck", at: where })}
        sound={sound}
        className="h-52 w-full rounded-3 border border-hairline bg-surface-2"
        {...values}
      >
        {/* The glass: two soft reflections and a glazing bar. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(115deg,transparent_18%,color-mix(in_oklab,var(--foreground)_7%,transparent)_18%,color-mix(in_oklab,var(--foreground)_7%,transparent)_27%,transparent_27%,transparent_33%,color-mix(in_oklab,var(--foreground)_4%,transparent)_33%,color-mix(in_oklab,var(--foreground)_4%,transparent)_36%,transparent_36%)]"
        />
        <div
          aria-hidden
          className="absolute inset-y-0 left-[72%] w-1.5 border-x border-hairline bg-surface-1"
        />
      </GelCling>
      <p className="pointer-events-none absolute top-2.5 left-3 z-30 max-w-[calc(100%-1.5rem)] truncate rounded-2 border border-hairline bg-background/85 px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
        Coldbrook Aquarium · window clings
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{pane}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-base font-medium text-foreground">
            Starfish cling
          </p>
          <p className="text-xs text-ink-3">
            Reusable gel, sticks to any glass.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAt(HOME)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-card px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Put it back
        </button>
      </div>
      {pane}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story.kind === "stuck" ? (
          <>
            <span className="text-signal">stuck</span> · {pct(story.at[0])}{" "}
            across, {pct(story.at[1])} down
          </>
        ) : story.kind === "peeling" ? (
          <>
            <span className="text-signal">peeling</span> · {pct(story.amount)}
          </>
        ) : (
          <>
            <span className="text-signal">lifted</span> · drop it anywhere
          </>
        )}
      </p>
    </div>
  );
}
