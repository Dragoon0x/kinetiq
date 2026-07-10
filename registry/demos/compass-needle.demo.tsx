"use client";

import * as React from "react";

import { CompassNeedle } from "@/registry/ui/compass-needle";

/** Eight-point rose names, matched to the default detent grid on CompassNeedle. */
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360;
const pad3 = (n: number): string => String(Math.round(n)).padStart(3, "0");

/** "NE &middot; 045&deg;"-style heading label for a settled bearing. */
const headingLabel = (deg: number): string => {
  const wrapped = wrap360(deg);
  const index = Math.round(wrapped / 45) % 8;
  const card = CARDINALS[index] ?? "N";
  return `${card} · ${pad3(wrapped)}°`;
};

/**
 * KQ-147: the compass needle in its bearing-set bezel. Dragging the dial
 * points the needle at the pointer bearing; releasing wobbles it home to
 * the nearest 8-point detent. The HEADING readout mirrors every settle.
 */
export function CompassNeedleDemo() {
  const [heading, setHeading] = React.useState(() => headingLabel(0));

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">BEARING SET &middot; 08 POINTS</p>
          <p className="text-label text-ink-3">KQ-147</p>
        </div>
        <CompassNeedle
          defaultValue={0}
          height={300}
          aria-label="Compass bearing"
          onChange={(deg) => setHeading(headingLabel(deg))}
        />
        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          HEADING &middot; <span className="text-cobalt-bright">{heading}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Drag the dial - the needle wobbles home to the nearest point.
        </p>
      </div>
    </div>
  );
}
