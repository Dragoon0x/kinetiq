"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BokehOrbit, defaultBokehOrbitItems } from "@/registry/ui/bokeh-orbit";

export const tweaks = defineTweaks({
  aperture: {
    kind: "range",
    label: "Aperture",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  radius: {
    kind: "range",
    label: "Radius",
    default: 0.85,
    min: 0.5,
    max: 1,
    step: 0.05,
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 6,
    min: 0,
    max: 20,
    step: 1,
    unit: "°/s",
  },
});

/** The focus scale's metres, as the orbit's own scale reads them. */
const distance = (f: number) => {
  if (f < 0.04) return "infinity";
  const m = 0.7 * Math.pow(12 / 0.7, 1 - f);
  return m >= 10 ? `${Math.round(m)} m` : `${m.toFixed(1)} m`;
};

/**
 * Coldbrook Gallery's night opening: nine prints on a slow orbit, and the
 * visitor's hand pulls the focus through them.
 */
export function BokehOrbitDemo({
  chrome = true,
  // The orbit is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [focus, setFocus] = React.useState(0.5);

  const orbit = (
    <div className="h-full w-full overflow-clip rounded-3 border border-hairline bg-surface-2">
      <BokehOrbit
        items={defaultBokehOrbitItems}
        focus={focus}
        onFocusChange={setFocus}
        label="Coldbrook Gallery, night opening"
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 520 }}>
        {orbit}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook Gallery · night opening
        </p>
        <p className="text-sm font-medium text-foreground">
          Nine prints, in focus where you point
        </p>
      </div>
      <div className="w-full" style={{ height: 420 }}>
        {orbit}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">focus {distance(focus)}</span> · click to
        spin the orbit open
      </p>
    </div>
  );
}
