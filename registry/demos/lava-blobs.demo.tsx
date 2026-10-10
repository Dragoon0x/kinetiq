"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { LavaBlobs } from "@/registry/ui/lava-blobs";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Count",
    default: 6,
    min: 3,
    max: 10,
    step: 1,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  colors: {
    kind: "choice",
    label: "Colours",
    default: "amber",
    options: ["amber", "rose", "cobalt", "moss"],
    names: { amber: "Amber", rose: "Rose", cobalt: "Cobalt", moss: "Moss" },
  },
});

type Phase = "rising" | "hand" | "gripped" | "thrown";

const button =
  "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Fernworks' Lumen desk lamp on its product card: the whole card is the lamp,
 * wax rising and falling behind the copy, and your pointer is a hand in it.
 */
export function LavaBlobsDemo({
  chrome = true,
  // The wax is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [phase, setPhase] = React.useState<Phase>("rising");
  const [throws, setThrows] = React.useState(0);
  const count = values.count ?? tweaks.count.default;

  const lamp = (
    <LavaBlobs
      className={cn(
        "w-full rounded-3 border border-hairline bg-card",
        chrome ? "h-[420px]" : "h-[500px]",
      )}
      onGripChange={(gripped) => {
        if (gripped) {
          setPhase("gripped");
        } else {
          setThrows((n) => n + 1);
          setPhase("thrown");
        }
      }}
      {...values}
    >
      <div
        className="flex size-full flex-col justify-between gap-3 p-4"
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return;
          setPhase((p) => (p === "rising" || p === "thrown" ? "hand" : p));
        }}
      >
        <div className="flex flex-col items-start gap-2">
          <p className="rounded-full bg-background/80 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
            Fernworks · Lumen lamp
          </p>
          <p className="max-w-[15rem] rounded-3 bg-background/80 px-3 py-2 text-base leading-snug font-semibold tracking-tight text-balance text-foreground backdrop-blur-sm">
            Warm wax, slow light.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-3 bg-background/80 px-3 py-2.5 backdrop-blur-sm">
          <div className="flex flex-col">
            <p className="font-mono text-sm font-medium text-foreground tabular-nums">
              £84
            </p>
            {chrome ? (
              <p className="text-xs text-ink-2">Ships in two weeks</p>
            ) : null}
          </div>
          <button
            type="button"
            className={cn(
              button,
              "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            Pre-order
          </button>
        </div>
      </div>
    </LavaBlobs>
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{lamp}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      {lamp}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase === "gripped" ? (
          <>
            <span className="text-signal">gripped</span> · release to throw
          </>
        ) : phase === "thrown" ? (
          <>
            <span className="text-signal">thrown</span> · {throws}{" "}
            {throws === 1 ? "throw" : "throws"} so far
          </>
        ) : phase === "hand" ? (
          <>
            <span className="text-signal">hand in the wax</span> · press to grip
          </>
        ) : (
          <>
            <span className="text-signal">wax rising</span> · {count}{" "}
            {count === 1 ? "blob" : "blobs"}
          </>
        )}
      </p>
    </div>
  );
}
