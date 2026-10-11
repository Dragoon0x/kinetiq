"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MicaDrift } from "@/registry/ui/mica-drift";

export const tweaks = defineTweaks({
  flakeCount: {
    kind: "range",
    label: "Flakes",
    default: 1200,
    min: 200,
    max: 2400,
    step: 100,
  },
  lightAngle: {
    kind: "range",
    label: "Light",
    default: 135,
    min: 0,
    max: 345,
    step: 15,
    unit: "°",
  },
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Story =
  | { kind: "rest" }
  | { kind: "turned"; angle: number; from: number }
  | { kind: "following" }
  | { kind: "stirred" };

/**
 * Basinworks Mineral Bath: the hero is the bath itself, mica turning in the
 * dark and flashing where the light finds it.
 */
export function MicaDriftDemo({
  chrome = true,
  // The liquid is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const base = values.lightAngle ?? 135;
  const [story, setStory] = React.useState<Story>({ kind: "rest" });
  // A key turn holds until the light tweak itself moves.
  const shownAngle =
    story.kind === "turned" && story.from === base ? story.angle : base;

  const hero = (
    <div
      className="w-full"
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setStory({ kind: "following" });
      }}
      onPointerLeave={() => setStory({ kind: "rest" })}
      onPointerDown={() => setStory({ kind: "stirred" })}
    >
      <MicaDrift
        label="Basinworks mineral bath"
        onLightAngleChange={(angle) =>
          setStory({ kind: "turned", angle, from: base })
        }
        className="h-52 w-full rounded-3"
        {...values}
      >
        <div className="flex size-full flex-col justify-end gap-1 p-5">
          <p className="font-mono text-[10px] tracking-[0.08em] text-primary-foreground/70 uppercase">
            Basinworks · mineral bath
          </p>
          <p className="text-2xl leading-tight font-semibold tracking-tight text-balance text-primary-foreground">
            Mica, suspended.
          </p>
          <p className="max-w-[32ch] text-sm text-balance text-primary-foreground/75">
            Fine mineral flakes that catch the light as they turn.
          </p>
        </div>
      </MicaDrift>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{hero}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {hero}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story.kind === "rest" || story.kind === "turned" ? (
          <>
            <span className="text-signal">light from {shownAngle}°</span> · move
            over the bath to carry it
          </>
        ) : story.kind === "following" ? (
          <>
            <span className="text-signal">the light follows you</span> · click
            to stir
          </>
        ) : (
          <>
            <span className="text-signal">stirred</span> · the flakes are
            settling
          </>
        )}
      </p>
    </div>
  );
}
