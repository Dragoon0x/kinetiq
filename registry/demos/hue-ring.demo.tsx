"use client";

import * as React from "react";

import { HueRing, type HueRingValue } from "@/registry/ui/hue-ring";

/** Mirrors the ring's own conversion so the sample starts on the right colour. */
function toHex({ h, l }: HueRingValue): string {
  const light = l / 100;
  const a = 0.82 * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(
      255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
    )
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

const START: HueRingValue = { h: 262, l: 58 };

export function HueRingDemo() {
  const [accent, setAccent] = React.useState<HueRingValue>(START);
  const [hex, setHex] = React.useState(() => toHex(START));

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-wrap items-center justify-center gap-5">
        <HueRing
          size={160}
          label="Fernworks accent"
          value={accent}
          onValueChange={(next, nextHex) => {
            setAccent(next);
            setHex(nextHex);
          }}
        />
        <div className="flex min-w-[136px] flex-1 flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            Sample
          </span>
          <button
            type="button"
            className="flex h-9 items-center justify-center rounded-2 px-4 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{
              backgroundColor: hex,
              color: `hsl(${accent.h} 30% ${accent.l > 58 ? 12 : 96}%)`,
            }}
          >
            Publish board
          </button>
          <p className="text-xs text-muted-foreground">
            Arrows step 1°, Shift+Arrow 10°.
          </p>
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Fernworks accent <span className="text-cobalt-bright">{hex}</span> ·{" "}
        {accent.h}° · {accent.l}% light
      </p>
    </div>
  );
}
