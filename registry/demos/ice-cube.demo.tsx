"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { IceCube } from "@/registry/ui/ice-cube";

export const tweaks = defineTweaks({
  melt: {
    kind: "range",
    label: "Melt",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  facets: {
    kind: "range",
    label: "Facets",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  trail: {
    kind: "range",
    label: "Trail",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Story =
  | { kind: "fresh"; count: number; left: number }
  | { kind: "melted"; count: number };

/**
 * Coldbrook's iced menu: the hero sits on a picnic gingham and a clear cube
 * slides across it, bending the checks as it goes.
 */
export function IceCubeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>({
    kind: "fresh",
    count: 1,
    left: 1,
  });
  const [parked, setParked] = React.useState<string | null>(null);
  const [ordered, setOrdered] = React.useState(false);

  const park = (name: string) => (event: React.FocusEvent<HTMLElement>) => {
    if (event.currentTarget.matches(":focus-visible")) setParked(name);
  };

  const hero = (
    <IceCube
      sound={sound}
      onDrop={(count) => setStory({ kind: "fresh", count, left: 1 })}
      onMelt={(left) =>
        setStory((s) =>
          s.kind === "fresh" && s.left !== left ? { ...s, left } : s,
        )
      }
      onMelted={() => setStory((s) => ({ kind: "melted", count: s.count }))}
      className={cn("@container w-full rounded-3", chrome ? "h-64" : "h-52")}
      {...values}
    >
      <div className="flex h-full max-w-[62%] flex-col justify-center gap-2 px-5 @[30rem]:max-w-[52%] @[30rem]:gap-3 @[30rem]:px-8">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Coldbrook · Iced
        </p>
        <h3 className="text-lg leading-tight font-semibold tracking-tight text-balance text-foreground @[30rem]:text-2xl">
          Cold brew, poured slow.
        </h3>
        <p className="hidden text-sm text-ink-2 @[30rem]:block">
          Steeped eighteen hours, served over clear ice.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onFocus={park("order iced")}
            onBlur={() => setParked(null)}
            onClick={() => setOrdered(true)}
            className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {ordered ? "Added" : "Order iced"}
          </button>
          <button
            type="button"
            onFocus={park("see the menu")}
            onBlur={() => setParked(null)}
            className="hidden h-8 items-center rounded-full border border-hairline-strong bg-card/80 px-3.5 text-xs font-medium text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid @[24rem]:inline-flex"
          >
            See the menu
          </button>
        </div>
      </div>
    </IceCube>
  );

  if (!chrome) return <div className="flex w-full">{hero}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {hero}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {parked ? (
          <>
            <span className="text-signal">parked</span> · on {parked}
          </>
        ) : story.kind === "melted" ? (
          <>
            <span className="text-signal">melted</span> · click for a fresh cube
          </>
        ) : story.left < 1 ? (
          <>
            <span className="text-signal">cube {story.count}</span> · melting ·{" "}
            {Math.round(story.left * 100)}% left
          </>
        ) : (
          <>
            <span className="text-signal">cube {story.count}</span> · slide it,
            click to drop another
          </>
        )}
      </p>
    </div>
  );
}
