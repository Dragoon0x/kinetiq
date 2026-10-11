"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CrateDig, defaultCrateAlbums } from "@/registry/ui/crate-dig";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 48,
    min: 24,
    max: 64,
    step: 4,
    unit: "°",
  },
  crateDepth: {
    kind: "range",
    label: "Crate depth",
    default: 200,
    min: 140,
    max: 320,
    step: 20,
    unit: "px",
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 33,
    min: 0,
    max: 78,
    step: 3,
    unit: "rpm",
  },
});

/**
 * The used bin by the door at Coldbrook Records: twelve records, flicked
 * through with one finger, one pulled out to check the label.
 */
export function CrateDigDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [revealed, setRevealed] = React.useState(0);
  const [pulled, setPulled] = React.useState(false);
  const album = defaultCrateAlbums[revealed];
  // A still record (reduced motion) has no speed to report.
  const rpm = useMotionSafe() ? (values.spin ?? tweaks.spin.default) : 0;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook Records · used bin
      </p>
      <CrateDig
        label="Used records"
        onValueChange={setRevealed}
        pulled={pulled}
        onPulledChange={setPulled}
        sound={sound}
        height={chrome ? 440 : 520}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{pulled ? "pulled" : "flipping"}</span>{" "}
          · {revealed + 1} of {defaultCrateAlbums.length} ·{" "}
          {album ? `${album.title} — ${album.artist}`.toLowerCase() : ""}
          {pulled && rpm > 0 ? ` · ${rpm} rpm` : ""}
        </p>
      ) : null}
    </div>
  );
}
