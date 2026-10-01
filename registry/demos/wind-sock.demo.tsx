"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { WindSock } from "@/registry/ui/wind-sock";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 14,
    min: 0,
    max: 40,
    step: 1,
    unit: "kt",
  },
  direction: {
    kind: "range",
    label: "From",
    default: 250,
    min: 0,
    max: 359,
    step: 1,
    unit: "°",
  },
  gust: {
    kind: "range",
    label: "Gust",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const POINTS = [
  "n",
  "nne",
  "ne",
  "ene",
  "e",
  "ese",
  "se",
  "sse",
  "s",
  "ssw",
  "sw",
  "wsw",
  "w",
  "wnw",
  "nw",
  "nnw",
];
const pointOf = (deg: number) =>
  POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16] ?? "n";
const forceOf = (kt: number) =>
  kt < 1
    ? "calm"
    : kt < 4
      ? "light air"
      : kt < 7
        ? "light breeze"
        : kt < 11
          ? "gentle breeze"
          : kt < 17
            ? "moderate breeze"
            : kt < 22
              ? "fresh breeze"
              : kt < 28
                ? "strong breeze"
                : kt < 34
                  ? "near gale"
                  : "gale";

/**
 * Gaugeworks' field card for Coldbrook Strip: the wind over runway 27, and
 * what the sock would do in another one.
 */
export function WindSockDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [preview, setPreview] = React.useState<number | null>(null);
  const speed = values.speed ?? tweaks.speed.default;
  const direction = values.direction ?? tweaks.direction.default;

  const widget = (
    <WindSock
      label="Wind"
      speed={speed}
      direction={direction}
      value={preview}
      onValueChange={setPreview}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return widget;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex justify-center">{widget}</div>
      <p
        role="status"
        className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {preview === null ? (
          <>
            <span className="text-signal">live</span> · {speed} kt from{" "}
            {pointOf(direction)} {String(direction).padStart(3, "0")}° ·{" "}
            {forceOf(speed)}
          </>
        ) : (
          <>
            <span className="text-signal">preview</span> · from{" "}
            {pointOf(preview)} {String(preview).padStart(3, "0")}° · esc for
            live
          </>
        )}
      </p>
    </div>
  );
}
