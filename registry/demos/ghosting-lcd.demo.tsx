"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GhostingLcd } from "@/registry/ui/ghosting-lcd";

export const tweaks = defineTweaks({
  response: {
    kind: "range",
    label: "Response",
    default: 600,
    min: 100,
    max: 1500,
    step: 50,
    unit: "ms",
  },
  pixel: {
    kind: "range",
    label: "Pixel",
    default: 6,
    min: 3,
    max: 12,
    step: 1,
    unit: "px",
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "olive",
    options: ["olive", "grey", "teal", "sepia"],
    names: { olive: "Olive", grey: "Grey", teal: "Teal", sepia: "Sepia" },
  },
});

type Mode = "idle" | "drawing" | "wiped";

/**
 * The Fieldline P-2, a pocket pager with a slow reflective screen: draw on
 * it and watch every stroke ghost away.
 */
export function GhostingLcdDemo({
  chrome = true,
  // The screen is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [mode, setMode] = React.useState<Mode>("idle");
  const response = values.response ?? tweaks.response.default;

  const pager = (
    <div
      onPointerDown={() => setMode("drawing")}
      onPointerMove={(event) => {
        if (event.pointerType !== "touch" || event.buttons) setMode("drawing");
      }}
      onKeyDown={(event) => {
        if (event.key.startsWith("Arrow")) setMode("drawing");
      }}
      className="flex w-full flex-col gap-2 rounded-4 border border-hairline-strong bg-surface-2 p-2.5"
    >
      <div className="flex h-4 items-center justify-between gap-3 px-1">
        <span className="font-mono text-[9px] font-medium tracking-[0.14em] text-ink-2 uppercase">
          Fieldline
        </span>
        <span aria-hidden className="flex items-center gap-[3px]">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="h-2.5 w-[3px] rounded-full bg-ink-3/35" />
          ))}
          <span className="ml-2 size-1.5 rounded-full bg-signal" />
        </span>
      </div>
      <GhostingLcd
        label="Fieldline P-2 screen"
        text="P-2 READY"
        onClear={() => setMode("wiped")}
        className="h-40 w-full rounded-2"
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{pager}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="flex w-full max-w-sm self-center">{pager}</div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {mode === "drawing" ? (
          <>
            <span className="text-signal">drawing</span> · ghosts clear in{" "}
            {(response / 1000).toFixed(response % 100 === 0 ? 1 : 2)} s
          </>
        ) : mode === "wiped" ? (
          <>
            <span className="text-signal">wiped</span> · the screen lets go
          </>
        ) : (
          <>
            <span className="text-signal">screen idle</span> · draw on it, press
            to squeeze
          </>
        )}
      </p>
    </div>
  );
}
