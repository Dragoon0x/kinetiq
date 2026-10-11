"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AvatarJar, defaultAvatarJarItems } from "@/registry/ui/avatar-jar";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 28,
    min: 10,
    max: 40,
    step: 2,
    unit: "°",
  },
  pebbleSize: {
    kind: "range",
    label: "Pebble size",
    default: 34,
    min: 26,
    max: 46,
    step: 2,
  },
  glass: {
    kind: "choice",
    label: "Glass",
    default: "clear",
    options: ["clear", "sea", "amber", "smoke"],
    names: { clear: "Clear", sea: "Sea", amber: "Amber", smoke: "Smoke" },
  },
});

/**
 * Fieldline's design team page: everyone on the team in one jar you can tip
 * and rummage through.
 */
export function AvatarJarDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [angle, setAngle] = React.useState(0);
  const [lifted, setLifted] = React.useState<string | null>(null);
  const [pours, setPours] = React.useState(0);
  const person = defaultAvatarJarItems.find((p) => p.id === lifted);

  const jar = (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · Design team
        </p>
        <p className="text-xs text-ink-2">
          {defaultAvatarJarItems.length} people
        </p>
      </div>
      <AvatarJar
        label="Fieldline design team"
        className="h-[23rem] w-full"
        lifted={lifted}
        onLiftedChange={setLifted}
        onAngleChange={setAngle}
        repourKey={pours}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xs">{jar}</div>;

  const a = Math.round(angle);
  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      {jar}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {person ? (
            <>
              <span className="text-signal">lifted</span> · {person.name}
            </>
          ) : (
            <>
              <span className="text-signal">
                {a === 0
                  ? "upright"
                  : `tilted ${Math.abs(a)}° ${a < 0 ? "left" : "right"}`}
              </span>{" "}
              · drag to tilt, click a face
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setLifted(null);
            setPours((n) => n + 1);
          }}
          className="inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Pour again
        </button>
      </div>
    </div>
  );
}
