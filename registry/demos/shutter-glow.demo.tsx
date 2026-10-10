"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ShutterGlow, type ShutterGlowFace } from "@/registry/ui/shutter-glow";

export const tweaks = defineTweaks({
  blinds: {
    kind: "range",
    label: "Blinds",
    default: 14,
    min: 4,
    max: 32,
    step: 1,
  },
  angle: {
    kind: "range",
    label: "Angle",
    default: 24,
    min: 0,
    max: 70,
    step: 2,
    unit: "°",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "dawn",
    options: ["dawn", "harbor", "cobalt", "moss"],
    names: { dawn: "Dawn", harbor: "Harbor", cobalt: "Cobalt", moss: "Moss" },
  },
});

/**
 * Fernworks Interiors makes blinds to measure: its hero is a wall of them,
 * turning from one gradient to the other in the light.
 */
export function ShutterGlowDemo({
  chrome = true,
  // The blinds are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [parting, setParting] = React.useState(false);
  const [turning, setTurning] = React.useState<ShutterGlowFace | null>(null);
  const turnTimer = React.useRef<number | null>(null);
  const palette = values.palette ?? "dawn";
  const blinds = values.blinds ?? 14;
  const angle = values.angle ?? 24;

  const onTurn = React.useCallback((face: ShutterGlowFace) => {
    setTurning(face);
    if (turnTimer.current !== null) window.clearTimeout(turnTimer.current);
    turnTimer.current = window.setTimeout(() => {
      turnTimer.current = null;
      setTurning(null);
    }, 1100);
  }, []);

  React.useEffect(
    () => () => {
      if (turnTimer.current !== null) window.clearTimeout(turnTimer.current);
    },
    [],
  );

  const wall = (
    <ShutterGlow
      onActiveChange={setParting}
      onTurn={onTurn}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Interiors
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Light, by the slat
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Measured, cut and hung in a week
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Book a fitting
              </button>
            </>
          ) : null}
        </div>
      </div>
    </ShutterGlow>
  );

  if (!chrome) return <div className="flex w-full">{wall}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {wall}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {turning ? (
          <>
            <span className="text-signal">turning</span> · to the {turning} face
          </>
        ) : parting ? (
          <>
            <span className="text-signal">parting</span> · blinds around your
            hand
          </>
        ) : (
          <>
            <span className="text-signal">{palette}</span> · {blinds} blinds ·{" "}
            {angle}°
          </>
        )}
      </p>
    </div>
  );
}
