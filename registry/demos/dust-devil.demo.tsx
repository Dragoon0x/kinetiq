"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DustDevil } from "@/registry/ui/dust-devil";

export const tweaks = defineTweaks({
  turns: {
    kind: "range",
    label: "Turns",
    default: 3.5,
    min: 1,
    max: 6,
    step: 0.5,
  },
  lean: {
    kind: "range",
    label: "Lean",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  threadCount: {
    kind: "range",
    label: "Threads",
    default: 24,
    min: 8,
    max: 48,
    step: 4,
  },
});

/**
 * Fieldline's trail report for the east mesa: a dust devil crossing the
 * flats, walked by hand.
 */
export function DustDevilDemo({
  chrome = true,
  // The whirlwind is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [at, setAt] = React.useState(50);
  const [walking, setWalking] = React.useState(false);
  const [flung, setFlung] = React.useState(0);
  const threads = values.threadCount ?? tweaks.threadCount.default;

  const panel = (
    <div
      className="relative w-full overflow-clip rounded-3 border border-hairline bg-card"
      style={{ height: chrome ? 420 : 500 }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setWalking(true);
      }}
      onPointerLeave={() => setWalking(false)}
    >
      <DustDevil
        value={at}
        onValueChange={setAt}
        onFling={() => setFlung((n) => n + 1)}
        {...values}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-1 p-4">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · trail report
        </p>
        <p className="text-sm leading-snug font-medium text-foreground">
          Dry wind on the east mesa
        </p>
      </div>
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
        {walking ? (
          <>
            <span className="text-signal">walking</span> · the crown follows
          </>
        ) : (
          <>
            <span className="text-signal">standing at {at}%</span> · {threads}{" "}
            threads
            {flung > 0 ? ` · ${flung} ${flung === 1 ? "fling" : "flings"}` : ""}
          </>
        )}
      </p>
    </div>
  );
}
