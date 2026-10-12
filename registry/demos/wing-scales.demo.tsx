"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { WingScales } from "@/registry/ui/wing-scales";

export const tweaks = defineTweaks({
  zoom: {
    kind: "range",
    label: "Zoom",
    default: 1,
    min: 1,
    max: 90,
    step: 1,
  },
  iridescence: {
    kind: "range",
    label: "Iridescence",
    default: 0.75,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const levelOf = (z: number) =>
  z < 3
    ? "whole wing"
    : z < 20
      ? "rows of scales"
      : z < 55
        ? "one scale"
        : "ridges";

/**
 * Fernworks Collection, specimen 14: a Coldbrook azure under the lens, from
 * the whole insect down to the ridges that make its blue.
 */
export function WingScalesDemo({
  chrome = true,
  // The specimen is silent: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const asked = values.zoom ?? tweaks.zoom.default;
  const [seen, setSeen] = React.useState(asked);
  const [zoom, setZoom] = React.useState(asked);
  // A new tweak value is a new magnification to glide to.
  if (seen !== asked) {
    setSeen(asked);
    setZoom(asked);
  }

  const wing = (
    <WingScales
      {...values}
      zoom={zoom}
      onZoomChange={setZoom}
      label="Coldbrook azure, specimen 14"
      className={
        chrome
          ? "h-60 w-full rounded-3 border border-hairline bg-card"
          : "h-[212px] w-full rounded-3 border border-hairline bg-card"
      }
    />
  );

  if (!chrome) return <div className="flex w-full">{wing}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">Coldbrook azure</p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks Collection · No. 14
        </p>
      </div>
      {wing}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            ×{zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)}
          </span>
          {` · ${levelOf(zoom)}`}
        </p>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Whole wing
        </button>
      </div>
    </div>
  );
}
