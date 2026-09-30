"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ThumbWheel } from "@/registry/ui/thumb-wheel";

export const tweaks = defineTweaks({
  knurl: {
    kind: "choice",
    label: "Knurl",
    default: "fine",
    options: ["fine", "coarse", "diamond"],
    names: { fine: "Fine", coarse: "Coarse", diamond: "Diamond" },
  },
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  detents: { kind: "toggle", label: "Detents", default: true },
  range: {
    kind: "range",
    label: "Range",
    default: 1.5,
    min: 0.5,
    max: 3,
    step: 0.25,
    unit: "turns",
  },
});

/**
 * A Fernworks desk lamp's dimmer: roll the wheel on the side of the lamp to
 * set its brightness, and the shade in the header glows with it.
 */
export function ThumbWheelDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [level, setLevel] = React.useState(60);
  const glow = Math.round(Math.min(100, Math.max(0, level)));

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <div className="flex items-center gap-3 rounded-3 border border-hairline bg-card px-4 py-3">
        <span
          aria-hidden
          className="size-7 shrink-0 rounded-full border border-hairline-strong"
          style={{
            background: `color-mix(in oklab, var(--warn) ${glow}%, var(--bg-2))`,
            boxShadow: `0 0 ${Math.round(glow / 6)}px ${Math.round(glow / 25)}px color-mix(in oklab, var(--warn) ${Math.round(glow * 0.6)}%, transparent)`,
          }}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            Desk lamp
          </p>
          <p className="truncate text-xs text-ink-3">
            Fernworks studio, bench 2
          </p>
        </div>
      </div>
      <div className="flex justify-center">
        <ThumbWheel
          label="Brightness"
          unit="%"
          value={level}
          onValueChange={setLevel}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {level <= 0 ? (
            <>
              <span className="text-signal">lamp off</span> · roll up to light
              it
            </>
          ) : (
            <>
              <span className="text-signal">brightness {level}%</span> · roll,
              flick or scroll
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
