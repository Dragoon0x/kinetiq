"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StripShred, type StripShredPhase } from "@/registry/ui/strip-shred";

export const tweaks = defineTweaks({
  strips: {
    kind: "range",
    label: "Strips",
    default: 10,
    min: 4,
    max: 16,
    step: 1,
  },
  undo: {
    kind: "range",
    label: "Undo",
    default: 5000,
    min: 0,
    max: 10000,
    step: 500,
    unit: "ms",
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
  },
});

const STATUS: Record<StripShredPhase, [string, string]> = {
  idle: ["draft kept", " · press delete"],
  armed: ["armed", " · press again to shred"],
  shredding: ["shredding", " · undo is open"],
  undo: ["shredded", " · undo is open"],
  deleting: ["deleting", " · waiting on the server"],
  deleted: ["deleted", " · reset to restore"],
  restoring: ["restoring", " · feeding it back"],
};

/**
 * A Fieldline draft with a shredder for a delete button: the draft is fed
 * through the cutters, and the server is only asked once the undo window has
 * closed.
 */
export function StripShredDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [deleted, setDeleted] = React.useState(false);
  const [phase, setPhase] = React.useState<StripShredPhase>("idle");

  const shredder = (
    <StripShred
      deleted={deleted}
      onDeletedChange={setDeleted}
      onPhaseChange={setPhase}
      onDelete={() => new Promise((resolve) => window.setTimeout(resolve, 700))}
      sound={sound}
      className="self-center"
      {...values}
    >
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · draft
        </p>
        <p className="text-sm font-medium text-foreground">Launch notes</p>
        <p className="text-xs leading-relaxed text-ink-2">
          v2 ships Tuesday. Brief support before the post goes out.
        </p>
      </div>
    </StripShred>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{shredder}</div>;
  }

  const [lead, rest] = STATUS[phase];
  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {shredder}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{lead}</span>
          {rest}
        </p>
        {/* Always present, so pressing it never drops focus to the page. */}
        <button
          type="button"
          aria-disabled={!deleted}
          onClick={() => {
            if (deleted) setDeleted(false);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-card"
        >
          <RotateCcw aria-hidden className="size-3.5 shrink-0" />
          Reset
        </button>
      </div>
    </div>
  );
}
