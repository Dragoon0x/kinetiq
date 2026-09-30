"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { Eyedropper, formatSwatch } from "@/registry/ui/eyedropper";

export const tweaks = defineTweaks({
  zoom: {
    kind: "range",
    label: "Zoom",
    default: 8,
    min: 4,
    max: 16,
    step: 2,
    unit: "×",
  },
  grid: { kind: "toggle", label: "Grid", default: true },
  loupe: {
    kind: "range",
    label: "Loupe",
    default: 112,
    min: 80,
    max: 160,
    step: 8,
    unit: "px",
  },
  format: {
    kind: "choice",
    label: "Format",
    default: "hex",
    options: ["hex", "rgb", "hsl"],
    names: { hex: "Hex", rgb: "RGB", hsl: "HSL" },
  },
});

const CAPACITY = 6;

/**
 * Basinworks builds a palette from a reference photo: point at the picture to
 * read a colour, click to drop it on the shelf, click a swatch to copy it.
 */
export function EyedropperDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [palette, setPalette] = React.useState<string[]>([]);
  const format = values.format ?? tweaks.format.default;
  const last = palette[0];

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {chrome ? (
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-medium text-foreground">
            Basinworks palette
          </span>
          <span className="truncate text-ink-3" title="Coldbrook at dusk">
            Coldbrook at dusk
          </span>
        </div>
      ) : null}
      <Eyedropper
        label="Coldbrook at dusk, reference photo"
        value={palette}
        onValueChange={setPalette}
        max={CAPACITY}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{`${palette.length} of ${CAPACITY} picked`}</span>
          {last
            ? ` · last ${formatSwatch(last, format)}`
            : " · point at the photo"}
        </p>
      ) : null}
    </div>
  );
}
