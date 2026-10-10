"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FuseConfirm } from "@/registry/ui/fuse-confirm";

export const tweaks = defineTweaks({
  time: {
    kind: "range",
    label: "Time",
    default: 4,
    min: 1,
    max: 8,
    step: 0.5,
    unit: "s",
  },
  spark: {
    kind: "range",
    label: "Spark",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "ember",
    options: ["ember", "ruby", "gold", "cobalt"],
    names: { ember: "Ember", ruby: "Ruby", gold: "Gold", cobalt: "Cobalt" },
  },
});

type Status = "armed" | "burning" | "deleted" | "out";

const LINES: Record<Status, [string, string]> = {
  armed: ["armed", " · press to light the fuse"],
  burning: ["burning", " · press again to put it out"],
  deleted: ["deleted", " · 14 boards removed"],
  out: ["put out", " · nothing was deleted"],
};

/**
 * A Basinworks workspace's danger zone: deleting it lights a fuse, and the
 * same button puts it out until the spark gets back round.
 */
export function FuseConfirmDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<Status>("armed");

  const row = (
    <div className="flex w-full max-w-md flex-wrap items-center justify-between gap-x-4 gap-y-3 self-center rounded-3 border border-hairline bg-card px-4 py-3">
      <div className="min-w-0 flex-1 basis-44">
        <p className="text-sm font-medium text-foreground">Delete workspace</p>
        <p className="text-xs text-ink-3">
          Removes 14 boards and their history from Basinworks.
        </p>
      </div>
      <FuseConfirm
        label="Delete"
        firedLabel="Deleted"
        onLitChange={(on) => {
          if (on) setStatus("burning");
        }}
        onConfirm={() => setStatus("deleted")}
        onCancel={() => setStatus("out")}
        sound={sound}
        className="-m-3"
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{row}</div>;
  }

  const [lead, rest] = LINES[status];
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {row}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{lead}</span>
        {rest}
      </p>
    </div>
  );
}
