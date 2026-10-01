"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MuteCone } from "@/registry/ui/mute-cone";

export const tweaks = defineTweaks({
  waves: {
    kind: "range",
    label: "Waves",
    default: 4,
    min: 1,
    max: 4,
    step: 1,
  },
  level: {
    kind: "range",
    label: "Level",
    default: 60,
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
  },
  slash: {
    kind: "choice",
    label: "Mark",
    default: "line",
    options: ["line", "cross", "none"],
    names: { line: "Slash", cross: "Cross", none: "None" },
  },
});

const PEOPLE = ["AO", "RK", "TS"];

/**
 * The call bar of a Fernworks design review: mute yourself with a press, or
 * hold and drag the button to set how loud the call plays.
 */
export function MuteConeDemo({
  chrome = true,
  sound,
  level = tweaks.level.default,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The tweak sets the starting volume; from then on the visitor owns it.
  const [seed, setSeed] = React.useState(level);
  const [volume, setVolume] = React.useState(level);
  const [muted, setMuted] = React.useState(level === 0);
  if (seed !== level) {
    setSeed(level);
    setVolume(level);
    setMuted(level === 0);
  }

  return (
    <div className="@container flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center gap-3 rounded-3 border border-hairline bg-card py-3 pr-3 pl-4">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-foreground"
            title="Design review"
          >
            Design review
          </p>
          <p
            className="truncate text-xs text-ink-3"
            title="Fernworks · 4 in the call"
          >
            Fernworks · 4 in the call
          </p>
        </div>
        <div aria-hidden className="hidden shrink-0 -space-x-1.5 @[26rem]:flex">
          {PEOPLE.map((p) => (
            <span
              key={p}
              className="flex size-6 items-center justify-center rounded-full border-2 border-card bg-surface-2 font-mono text-[9px] text-ink-2"
            >
              {p}
            </span>
          ))}
        </div>
        <MuteCone
          name="Mute call audio"
          sound={sound}
          {...values}
          pressed={muted}
          onPressedChange={setMuted}
          level={volume}
          onLevelChange={setVolume}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{muted ? "muted" : "sound on"}</span>
          {" · "}
          {muted && volume > 0
            ? `volume kept at ${volume}%`
            : `volume ${volume}%`}
        </p>
      ) : null}
    </div>
  );
}
