"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  RakingLight,
  rakingSide,
  type RakingLightReading,
  type RakingLightSubject,
} from "@/registry/ui/raking-light";

export const tweaks = defineTweaks({
  elevation: {
    kind: "range",
    label: "Elevation",
    default: 12,
    min: 2,
    max: 40,
    step: 1,
    unit: "°",
  },
  relief: {
    kind: "range",
    label: "Relief",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const OBJECTS: { id: RakingLightSubject; name: string; plate: string }[] = [
  { id: "canvas", name: "Canvas", plate: "Study 14 · oil on canvas" },
  { id: "paper", name: "Paper", plate: "Proof 3 · blind emboss" },
  { id: "tablet", name: "Tablet", plate: "Tablet 9 · fired clay" },
];

/**
 * The Fieldline Archive's light table: one object under a lamp that lies low
 * at its side, the way a conservator looks for what flat light hides.
 */
export function RakingLightDemo({
  chrome = true,
  // The light table is silent: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [subject, setSubject] = React.useState<RakingLightSubject>("canvas");
  const [azimuth, setAzimuth] = React.useState(290);
  const [light, setLight] = React.useState<RakingLightReading | null>(null);
  const object = OBJECTS.find((o) => o.id === subject) ?? OBJECTS[0]!;
  const elevation = values.elevation ?? tweaks.elevation.default;

  const table = (
    <div className="relative overflow-clip rounded-3 border border-hairline">
      <RakingLight
        subject={subject}
        azimuth={azimuth}
        onAzimuthChange={setAzimuth}
        onLightChange={setLight}
        label={`Lamp over ${object.plate}`}
        className={chrome ? "h-60" : "h-52"}
        {...values}
      />
      <p className="pointer-events-none absolute top-2.5 left-2.5 rounded-2 bg-background/80 px-2 py-1 font-mono text-[10px] leading-none tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
        Fieldline Archive · {object.plate.split(" · ")[0]}
      </p>
    </div>
  );

  if (!chrome) return <div className="w-full">{table}</div>;

  const held = light?.held ?? false;
  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-medium text-foreground">{object.plate}</p>
        <div
          role="group"
          aria-label="Object on the table"
          className="inline-flex h-8 items-center gap-0.5 rounded-2 border border-hairline bg-surface-1 p-0.5"
        >
          {OBJECTS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={subject === o.id}
              onClick={() => setSubject(o.id)}
              className="inline-flex h-full items-center rounded-1 px-2.5 text-xs text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
            >
              {o.name}
            </button>
          ))}
        </div>
      </div>
      {table}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {held && light ? (
          <>
            <span className="text-signal">lamp in hand</span> · from{" "}
            {rakingSide(light.azimuth).replace("the ", "")} · {light.elevation}°
            above the surface
          </>
        ) : (
          <>
            <span className="text-signal">raking light</span> · from{" "}
            {rakingSide(azimuth).replace("the ", "")} · {elevation}° above the
            surface
          </>
        )}
      </p>
    </div>
  );
}
