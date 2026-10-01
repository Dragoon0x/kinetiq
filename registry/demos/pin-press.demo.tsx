"use client";

import * as React from "react";

import { NotebookText } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PinPress } from "@/registry/ui/pin-press";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  wobble: {
    kind: "range",
    label: "Wobble",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tag: { kind: "toggle", label: "Tag", default: true },
});

/**
 * A note in the Basinworks field notebook: pin it and it stays at the top of
 * the list, whatever is edited after it.
 */
export function PinPressDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pinned, setPinned] = React.useState(false);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center gap-3 rounded-3 border border-hairline bg-card py-3 pr-3 pl-4">
        <NotebookText aria-hidden className="size-4 shrink-0 text-ink-3" />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-foreground"
            title="Q4 field schedule"
          >
            Q4 field schedule
          </p>
          <p
            className="truncate text-xs text-ink-3"
            title="Edited 2h ago · Coldbrook site"
          >
            Edited 2h ago · Coldbrook site
          </p>
        </div>
        <PinPress
          name="Pin Q4 field schedule"
          pressed={pinned}
          onPressedChange={setPinned}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {pinned ? "pinned" : "not pinned"}
          </span>
          {pinned ? " · stays at the top of notes" : " · sorted by last edit"}
        </p>
      ) : null}
    </div>
  );
}
