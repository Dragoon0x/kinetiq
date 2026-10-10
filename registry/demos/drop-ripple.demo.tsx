"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DropRipple } from "@/registry/ui/drop-ripple";

export const tweaks = defineTweaks({
  damping: {
    kind: "range",
    label: "Damping",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  size: {
    kind: "range",
    label: "Drop size",
    default: 16,
    min: 6,
    max: 40,
    step: 2,
    unit: "px",
  },
  rain: {
    kind: "range",
    label: "Rain",
    default: 0,
    min: 0,
    max: 1,
    step: 0.1,
  },
});

/**
 * Basinworks lap pools: the hero is the pool itself, and the visitor's
 * first touch sends a ring down the lane.
 */
export function DropRippleDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [drops, setDrops] = React.useState(0);
  const [settling, setSettling] = React.useState(false);
  const timer = React.useRef(0);
  const surface = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const pool = (
    <div ref={surface} className="w-full">
      <DropRipple
        label="Basinworks pool"
        alt="Calm water over a lap pool's tiles"
        className="h-[200px]"
        sound={sound}
        onDrop={() => {
          setDrops((n) => n + 1);
          setSettling(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setSettling(false), 2400);
        }}
        {...values}
      >
        <div className="flex h-full flex-col justify-end gap-1 p-5">
          <p className="font-mono text-[10px] tracking-[0.08em] text-foreground/80 uppercase">
            Basinworks · lap pools
          </p>
          <p className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-foreground">
            Swim the long water
          </p>
        </div>
      </DropRipple>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{pool}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {pool}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {drops === 0 ? (
            <>
              <span className="text-signal">still water</span> · touch it, or
              tab to it and press Enter
            </>
          ) : (
            <>
              <span className="text-signal">
                {settling ? "rings spreading" : "settled"}
              </span>{" "}
              · {drops} {drops === 1 ? "drop" : "drops"}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            const node =
              surface.current?.querySelector<HTMLElement>("[role=button]");
            node?.focus();
            node?.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Drop
        </button>
      </div>
    </div>
  );
}
