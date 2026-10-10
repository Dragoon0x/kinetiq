"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ChimeBell } from "@/registry/ui/chime-bell";

export const tweaks = defineTweaks({
  swing: {
    kind: "range",
    label: "Swing",
    default: 40,
    min: 20,
    max: 48,
    step: 4,
    unit: "°",
  },
  damping: {
    kind: "range",
    label: "Damping",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  strap: {
    kind: "choice",
    label: "Strap",
    default: "belt",
    options: ["belt", "cross", "tape"],
    names: { belt: "Belt", cross: "Cross", tape: "Tape" },
  },
});

/**
 * Watching a Fieldline project: the bell says whether its updates reach you,
 * and how many are waiting.
 */
export function ChimeBellDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [on, setOn] = React.useState(false);
  const [count, setCount] = React.useState(3);

  const row = (
    <div className="flex w-full max-w-sm items-center gap-3 rounded-3 border border-hairline bg-card py-2 pr-2 pl-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · project
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">
          Spring launch
        </p>
        <p className="truncate text-xs text-ink-3">
          Ada, Tomas and four others
        </p>
      </div>
      <ChimeBell
        label="Updates"
        pressed={on}
        onPressedChange={setOn}
        count={count}
        sound={sound}
        className="shrink-0"
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{row}</div>;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {row}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{on ? "ringing" : "muted"}</span>
          {" · "}
          {count === 1 ? "1 update" : `${count} updates`}
        </p>
        <button
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className="inline-flex h-7 items-center rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          New update
        </button>
      </div>
    </div>
  );
}
