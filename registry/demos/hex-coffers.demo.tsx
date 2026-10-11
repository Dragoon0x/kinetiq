"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { HexCoffers } from "@/registry/ui/hex-coffers";

export const tweaks = defineTweaks({
  cellSize: {
    kind: "range",
    label: "Cell size",
    default: 56,
    min: 24,
    max: 96,
    step: 4,
    unit: "px",
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  lampWarmth: {
    kind: "range",
    label: "Lamp warmth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Lamp = "drift" | "hand" | "low";

/**
 * Coldbrook Library's reading room: a vaulted ceiling over the line, and a
 * lamp the visitor carries across it — lowered, the nearest coffers flare.
 */
export function HexCoffersDemo({
  chrome = true,
  // The vault is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [lamp, setLamp] = React.useState<Lamp>("drift");
  const [inHand, setInHand] = React.useState(false);

  const vault = (
    <div
      className={
        chrome
          ? "h-64 w-full overflow-clip rounded-3 border border-hairline"
          : "h-52 w-full overflow-clip rounded-3 border border-hairline"
      }
    >
      <HexCoffers
        label="Reading room ceiling, carry the lamp"
        onPressChange={(down) => setLamp(down ? "low" : "hand")}
        onCarryChange={setInHand}
        {...values}
      >
        <div className="@container flex size-full flex-col items-center justify-end bg-linear-to-t from-background/75 via-background/25 to-transparent p-5 text-center">
          <p className="font-mono text-[10px] tracking-[0.12em] text-ink-2 uppercase">
            Coldbrook Library
          </p>
          <p
            className="mt-1 font-semibold tracking-tight text-balance text-foreground"
            style={{
              fontSize: "clamp(1.25rem, 5cqw, 2.25rem)",
              lineHeight: 1.1,
            }}
          >
            Read under the dome
          </p>
        </div>
      </HexCoffers>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{vault}</div>;

  const shown: Lamp = lamp === "low" ? "low" : inHand ? "hand" : "drift";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {vault}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {shown === "low" ? (
          <>
            <span className="text-signal">lamp lowered</span> · near cells flare
          </>
        ) : shown === "hand" ? (
          <>
            <span className="text-signal">lamp in hand</span> · the walls swing
            with it
          </>
        ) : (
          <>
            <span className="text-signal">lamp drifting</span> · a slow figure
            of eight
          </>
        )}
      </p>
    </div>
  );
}
