"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { NotepadFlip } from "@/registry/ui/notepad-flip";

export const tweaks = defineTweaks({
  binding: {
    kind: "choice",
    label: "Binding",
    default: "spiral",
    options: ["spiral", "wire", "glue"],
    names: { spiral: "Spiral", wire: "Wire", glue: "Glue" },
  },
  flipAngle: {
    kind: "range",
    label: "Flip",
    default: 190,
    min: 150,
    max: 230,
    step: 5,
    unit: "°",
  },
  paperTone: {
    kind: "choice",
    label: "Paper",
    default: "legal",
    options: ["white", "legal", "steno", "kraft"],
    names: { white: "White", legal: "Legal", steno: "Steno", kraft: "Kraft" },
  },
});

const NOTES = [
  "Offline maps for every trail",
  "A full day more battery",
  "Share a route with one tap",
  "Night mode follows sunset",
  "Fixed: the compass drift",
];

/**
 * Waylight 2.4's release notes, jotted down the way the team keeps them: one
 * change per sheet of a reporter's pad.
 */
export function NotepadFlipDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sheet, setSheet] = React.useState(1);
  const last = sheet >= NOTES.length - 1;

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight 2.4 · what changed
      </p>
      <NotepadFlip
        lines={NOTES}
        label="Waylight 2.4 release notes"
        value={sheet}
        onValueChange={setSheet}
        sound={sound}
        className="text-[6.2cqw] @md:text-[min(3.7cqw,1.75rem)]"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {last ? (
            <>
              <span className="text-signal">last sheet</span> · tap to start
              again
            </>
          ) : (
            <>
              <span className="text-signal">
                sheet {sheet + 1} of {NOTES.length}
              </span>{" "}
              · scroll, drag or use the arrow keys
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
