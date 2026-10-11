"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultSandPortraits,
  SandPortrait,
  type SandPortraitState,
} from "@/registry/ui/sand-portrait";

export const tweaks = defineTweaks({
  grains: {
    kind: "range",
    label: "Grains",
    default: 3200,
    min: 800,
    max: 6400,
    step: 200,
  },
  sweep: {
    kind: "range",
    label: "Sweep",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  reform: {
    kind: "range",
    label: "Reform",
    default: 1,
    min: 0.25,
    max: 2.5,
    step: 0.25,
  },
});

/**
 * Fernworks Sand Prints: four prints poured in coloured sand. Sweep one and
 * it pours itself back; tap for the next print.
 */
export function SandPortraitDemo({
  chrome = true,
  // The sand is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [print, setPrint] = React.useState(0);
  const [state, setState] = React.useState<SandPortraitState>("still");
  const caption = (defaultSandPortraits[print]?.caption ?? "").toLowerCase();

  if (!chrome) {
    return (
      <div className="flex w-full">
        <SandPortrait
          label="Sand prints"
          value={print}
          onValueChange={setPrint}
          height={232}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks Sand Prints
        </p>
        <p className="text-base font-medium text-foreground">
          Four prints, poured by hand
        </p>
      </div>
      <SandPortrait
        label="Sand prints"
        value={print}
        onValueChange={setPrint}
        onStateChange={setState}
        height={280}
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {state === "swirling" ? (
          <>
            <span className="text-signal">swirling</span> · into {caption}
          </>
        ) : state === "sweeping" ? (
          <>
            <span className="text-signal">sweeping</span> · let go and it
            settles
          </>
        ) : state === "settling" ? (
          <>
            <span className="text-signal">settling</span> · back into {caption}
          </>
        ) : (
          <>
            <span className="text-signal">{caption}</span> · {print + 1} of{" "}
            {defaultSandPortraits.length} · sweep it, or tap for the next
          </>
        )}
      </p>
    </div>
  );
}
