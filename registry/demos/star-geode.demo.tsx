"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StarGeode } from "@/registry/ui/star-geode";

export const tweaks = defineTweaks({
  detail: {
    kind: "range",
    label: "Detail",
    default: 2,
    min: 1,
    max: 4,
    step: 1,
  },
  explode: {
    kind: "range",
    label: "Explode",
    default: 0.45,
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  twinkle: {
    kind: "range",
    label: "Twinkle",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Gaugeworks Observatory's public night: the sky as a shell of stars that
 * cracks open to show the crystal inside.
 */
export function StarGeodeDemo({
  chrome = true,
  // The geode is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const detail = values.detail ?? tweaks.detail.default;
  const facets = 20 * detail * detail;

  const panel = (
    <div
      className="relative w-full overflow-clip rounded-3 border border-hairline bg-card"
      style={{ height: chrome ? 288 : 208 }}
    >
      <StarGeode open={open} onOpenChange={setOpen} {...values} />
      <p className="pointer-events-none absolute top-3 left-4 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Gaugeworks · observatory
      </p>
      {chrome ? (
        <p className="pointer-events-none absolute bottom-3 left-4 text-sm font-medium text-foreground">
          Night sky, cracked open
        </p>
      ) : null}
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{panel}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <>
            <span className="text-signal">open</span> · {facets} facets adrift
          </>
        ) : (
          <>
            <span className="text-signal">closed</span> · {facets} facets, press
            to crack it
          </>
        )}
      </p>
    </div>
  );
}
