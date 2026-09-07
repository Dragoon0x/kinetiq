"use client";

import * as React from "react";

import { MorphIcon, type MorphPairName } from "@/registry/ui/morph-icon";

const TOGGLES: { pair: MorphPairName; labels: [string, string] }[] = [
  { pair: "play-pause", labels: ["Play", "Pause"] },
  { pair: "menu-close", labels: ["Open menu", "Close menu"] },
  { pair: "plus-cross", labels: ["Add", "Cancel"] },
  { pair: "heart", labels: ["Save", "Saved"] },
  { pair: "sun-moon", labels: ["Light", "Dark"] },
];

export function MorphIconDemo() {
  const [on, setOn] = React.useState<Partial<Record<MorphPairName, boolean>>>({
    heart: true,
  });

  const pressed = TOGGLES.filter((toggle) => on[toggle.pair]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight deck controls
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {TOGGLES.map((toggle) => (
            <MorphIcon
              key={toggle.pair}
              pair={toggle.pair}
              labels={toggle.labels}
              pressed={on[toggle.pair] ?? false}
              onPressedChange={(next) =>
                setOn((prev) => ({ ...prev, [toggle.pair]: next }))
              }
            />
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Both shapes in a pair carry the same commands and the same point
          count, so one walks into the other instead of blinking.
        </p>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Pressed{" "}
        <span className="text-signal tabular-nums">{pressed.length}</span> of{" "}
        <span className="tabular-nums">{TOGGLES.length}</span>
        {pressed.length > 0 ? (
          <>
            {" — "}
            <span className="text-signal">
              {pressed.map((toggle) => toggle.labels[1]).join(", ")}
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}
