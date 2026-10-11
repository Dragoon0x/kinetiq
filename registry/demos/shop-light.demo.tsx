"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ShopLight } from "@/registry/ui/shop-light";

export const tweaks = defineTweaks({
  flicker: {
    kind: "range",
    label: "Flicker",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  falloff: {
    kind: "range",
    label: "Falloff",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  surface: {
    kind: "choice",
    label: "Wall",
    default: "pegboard",
    options: ["pegboard", "plaster", "slats"],
    names: { pegboard: "Pegboard", plaster: "Plaster", slats: "Slats" },
  },
});

type Phase = "cold" | "striking" | "lit" | "off";

/** The light's colour temperature as a shop would print it: "3,900 K". */
const kelvin = (warmth: number) => {
  const k = Math.round((6500 - warmth * 3800) / 100) * 100;
  return `${Math.floor(k / 1000)},${String(k % 1000).padStart(3, "0")} K`;
};

/** A No. 4 bench plane, side on: a tote, a knob, the iron at its bed. */
function PlaneArt() {
  return (
    <svg aria-hidden viewBox="0 0 64 44" className="h-11 w-16 shrink-0">
      <path d="M4 34 L58 34 L60 38 L2 38 Z" fill="oklch(0.42 0.03 250)" />
      <path d="M10 34 L12 26 L50 26 L54 34 Z" fill="oklch(0.55 0.03 250)" />
      <path
        d="M18 26 C 16 18, 22 12, 28 12 L 31 12 C 29 16, 28 20, 30 26 Z"
        fill="oklch(0.55 0.11 40)"
      />
      <path d="M30 26 L36 8 L39 9 L35 26 Z" fill="oklch(0.7 0.01 250)" />
      <ellipse cx="47" cy="22" rx="4" ry="5" fill="oklch(0.55 0.11 40)" />
      <path d="M2 38 L60 38" stroke="oklch(0.3 0.02 250)" strokeWidth="1" />
    </svg>
  );
}

/**
 * Fieldline Workshop after hours: a bench plane on the pegboard, and a
 * strip light that has to warm up before you can see it.
 */
export function ShopLightDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [on, setOn] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("cold");

  const room = (
    <ShopLight
      lit={on}
      onLitChange={(next) => {
        setOn(next);
        setPhase(next ? "striking" : "off");
      }}
      onSettle={() => setPhase("lit")}
      label="Workshop light"
      sound={sound}
      className="h-[208px] w-full"
      {...values}
    >
      <div className="flex w-full max-w-[18.5rem] items-center gap-3 rounded-3 border border-hairline bg-card p-3 text-left">
        <PlaneArt />
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline Workshop
          </p>
          <p className="text-sm font-medium text-foreground">
            Bench plane No. 4
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="font-mono text-xs text-ink-2 tabular-nums">
              €148
            </span>
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Add to bench
            </button>
          </div>
        </div>
      </div>
    </ShopLight>
  );

  if (!chrome) return <div className="w-full">{room}</div>;

  const warmth = values.warmth ?? tweaks.warmth.default;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Workshop · after hours
        </p>
        <button
          type="button"
          onClick={() => {
            setOn((v) => !v);
            setPhase(on ? "off" : "striking");
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-background px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {on ? "Switch off" : "Switch on"}
        </button>
      </div>
      {room}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase === "cold" ? (
          <>
            <span className="text-signal">tube cold</span> · pull the cord
          </>
        ) : phase === "striking" ? (
          <>
            <span className="text-signal">striking</span> · the tube is catching
          </>
        ) : phase === "lit" ? (
          <>
            <span className="text-signal">lit</span> · {kelvin(warmth)}
          </>
        ) : (
          <>
            <span className="text-signal">off</span> · pull to strike again
          </>
        )}
      </p>
    </div>
  );
}
