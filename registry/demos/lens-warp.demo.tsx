"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LensWarp } from "@/registry/ui/lens-warp";

export const tweaks = defineTweaks({
  radius: {
    kind: "range",
    label: "Radius",
    default: 52,
    min: 24,
    max: 72,
    step: 4,
    unit: "px",
  },
  power: {
    kind: "range",
    label: "Power",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  specular: {
    kind: "range",
    label: "Specular",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Gaugeworks' loupes and lenses: the landing headline sits under a glass
 * bead that the visitor carries across it.
 */
export function LensWarpDemo({
  chrome = true,
  // The glass is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [word, setWord] = React.useState<string | null>(null);

  // The eyebrow sits in a box at the headline's size, so its inset is the
  // same 0.3em the lens keeps around the words.
  const size = "text-[clamp(28px,9cqi,54px)]";
  const headline = (
    <div className="@container flex w-full flex-col">
      <div className={`${size} px-[0.3em] leading-none`}>
        <p className="font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · loupes and lenses
        </p>
      </div>
      <LensWarp
        // A new radius, power or glint makes the pass again, so it is seen.
        key={`${values.radius}:${values.power}:${values.specular}`}
        text="Every detail, a little closer"
        onWordChange={setWord}
        className={`${size} leading-[1.1] font-semibold tracking-[-0.02em] text-balance text-foreground`}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{headline}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {headline}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {word ? (
          <>
            <span className="text-signal">lens on</span> · {word} · arrows walk
            it
          </>
        ) : (
          <>
            <span className="text-signal">resting</span> · move over the words
            or tab in
          </>
        )}
      </p>
    </div>
  );
}
