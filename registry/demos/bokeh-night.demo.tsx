"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { BokehNight } from "@/registry/ui/bokeh-night";

export const tweaks = defineTweaks({
  aperture: {
    kind: "choice",
    label: "Aperture",
    default: "round",
    options: ["round", "hex"],
    names: { round: "Round", hex: "Hexagon" },
  },
  density: {
    kind: "range",
    label: "Density",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** The focus in bands, so the status speaks only when it crosses one. */
const BANDS = [2, 2.5, 3, 4, 6, 8, 12, 20, 40] as const;
const band = (focus: number) => {
  if (focus >= 0.97) return "infinity";
  const metres = 2 / (1 - focus);
  // The nearest band as a lens scale reads it: by ratio, not difference.
  let near: number = BANDS[0];
  for (const b of BANDS) {
    if (Math.abs(Math.log(metres / b)) < Math.abs(Math.log(metres / near))) {
      near = b;
    }
  }
  return `${near} m`;
};

/**
 * Waylight's late-service page: the night street behind the notice, and
 * whatever the visitor points at comes into focus.
 */
export function BokehNightDemo({
  chrome = true,
  // The street is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [focus, setFocus] = React.useState(0.75);
  const shape = values.aperture ?? tweaks.aperture.default;
  const where = band(focus);
  const sharp =
    focus >= 0.9
      ? "far lights sharp"
      : focus <= 0.35
        ? "near lights sharp"
        : "mid-street sharp";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <BokehNight
        value={focus}
        onValueChange={setFocus}
        className={cn("w-full rounded-3", chrome ? "h-60" : "h-52")}
        {...values}
      >
        <div
          className="flex h-full flex-col justify-end gap-1 p-5 pr-14 sm:p-6 sm:pr-16"
          // A low veil of the night itself, so the words read even with a
          // bright lamp ballooning right behind them.
          style={{
            backgroundImage:
              "linear-gradient(to top, oklch(from var(--accent) 0.14 0.04 h / 0.72), oklch(from var(--accent) 0.14 0.04 h / 0) 70%)",
          }}
        >
          <p className="font-mono text-[10px] tracking-[0.08em] uppercase opacity-75">
            Waylight
          </p>
          <p className="text-2xl leading-tight font-medium">
            Home after midnight
          </p>
          <p className="text-sm opacity-85">
            Trains every 12 minutes until 2:00
          </p>
        </div>
      </BokehNight>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {where === "infinity" ? "focus at infinity" : `focus ${where}`}
          </span>{" "}
          · {sharp} · {shape === "hex" ? "hex" : "round"} aperture
        </p>
      ) : null}
    </div>
  );
}
