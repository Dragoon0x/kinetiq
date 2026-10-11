"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LeafDapple } from "@/registry/ui/leaf-dapple";

export const tweaks = defineTweaks({
  wind: {
    kind: "range",
    label: "Wind",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  leafDensity: {
    kind: "range",
    label: "Leaves",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  eclipse: {
    kind: "range",
    label: "Eclipse",
    default: 0,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight Inn, the garden room: a limewashed wall under the lime trees,
 * the hero of the inn's page, with the afternoon moving across it.
 */
export function LeafDappleDemo({
  chrome = true,
  // The wall is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [gust, setGust] = React.useState(false);
  const calm = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (calm.current !== null) window.clearTimeout(calm.current);
    },
    [],
  );

  const stirred = () => {
    setGust(true);
    if (calm.current !== null) window.clearTimeout(calm.current);
    calm.current = window.setTimeout(() => setGust(false), 1600);
  };

  const wall = (
    <div
      className="h-52 w-full overflow-clip rounded-3 border border-hairline"
      onPointerMove={stirred}
    >
      <LeafDapple {...values}>
        <div className="@container flex size-full flex-col justify-end bg-linear-to-t from-background/70 via-background/20 to-transparent p-5">
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Waylight Inn · The garden room
          </p>
          <p
            className="mt-1 max-w-[20ch] font-semibold tracking-tight text-balance text-foreground"
            style={{
              fontSize: "clamp(1.375rem, 6cqw, 2.375rem)",
              lineHeight: 1.08,
            }}
          >
            Long afternoons, slow light.
          </p>
        </div>
      </LeafDapple>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{wall}</div>;

  const eclipse = values.eclipse ?? 0;
  const wind = values.wind ?? 0.4;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {wall}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {eclipse >= 0.98 ? (
          <>
            <span className="text-signal">annular</span> · every dapple a ring
            of light
          </>
        ) : eclipse > 0 ? (
          <>
            <span className="text-signal">
              eclipse {Math.round(eclipse * 100)}%
            </span>{" "}
            · every dapple a crescent
          </>
        ) : gust ? (
          <>
            <span className="text-signal">gust</span> · the leaves stirring
          </>
        ) : wind === 0 ? (
          <>
            <span className="text-signal">still air</span> · a held afternoon
          </>
        ) : (
          <>
            <span className="text-signal">breeze</span> · move across the wall
            to stir the leaves
          </>
        )}
      </p>
    </div>
  );
}
