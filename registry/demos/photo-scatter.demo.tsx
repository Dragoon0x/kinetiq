"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { PhotoScatter } from "@/registry/ui/photo-scatter";

export const tweaks = defineTweaks({
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 90,
    min: 40,
    max: 200,
    step: 10,
    unit: "px",
  },
  life: {
    kind: "range",
    label: "Life",
    default: 1200,
    min: 400,
    max: 3000,
    step: 100,
    unit: "ms",
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 8,
    min: 0,
    max: 24,
    step: 2,
    unit: "°",
  },
});

/**
 * Roll 14, generated: eight small landscapes painted with layered
 * gradients — the same pictures in either theme, as prints would be.
 */
const ROLL: readonly string[] = [
  // Dusk over still water.
  "radial-gradient(circle at 62% 44%, oklch(0.96 0.05 85) 0 7%, oklch(0.9 0.09 60 / 0.45) 8%, transparent 24%), linear-gradient(180deg, oklch(0.56 0.1 300) 0%, oklch(0.8 0.1 45) 52%, oklch(0.46 0.07 260) 52.5%, oklch(0.3 0.06 255) 100%)",
  // Dunes at noon.
  "radial-gradient(130% 60% at 18% 100%, oklch(0.64 0.11 55) 0 50%, transparent 50.5%), radial-gradient(120% 70% at 88% 108%, oklch(0.74 0.1 68) 0 55%, transparent 55.5%), linear-gradient(180deg, oklch(0.84 0.06 225), oklch(0.94 0.04 85))",
  // A moon over the bay.
  "radial-gradient(circle at 70% 30%, oklch(0.97 0.02 90) 0 9%, transparent 9.5%), radial-gradient(circle at 70% 30%, oklch(0.9 0.03 90 / 0.28) 0 16%, transparent 32%), linear-gradient(180deg, oklch(0.24 0.06 268), oklch(0.4 0.07 252) 68%, oklch(0.2 0.04 250) 68.5%, oklch(0.28 0.05 250))",
  // Fog on the lake.
  "linear-gradient(180deg, oklch(0.9 0.02 210) 0 44%, oklch(0.48 0.04 160) 44% 51%, oklch(0.62 0.03 180) 51% 53%, oklch(0.8 0.025 205) 53% 100%)",
  // The meadow.
  "radial-gradient(circle at 24% 26%, oklch(0.97 0.05 95) 0 6%, transparent 6.5%), linear-gradient(180deg, oklch(0.8 0.08 232) 0 56%, oklch(0.7 0.12 132) 56% 74%, oklch(0.58 0.12 138) 74%)",
  // The lido, lanes and light.
  "radial-gradient(60% 40% at 30% 30%, oklch(0.9 0.06 200 / 0.6), transparent), repeating-linear-gradient(90deg, oklch(0.68 0.1 215) 0 23%, oklch(0.95 0.02 210) 23% 25%)",
  // Hills at last light.
  "radial-gradient(90% 55% at 20% 100%, oklch(0.36 0.06 300) 0 60%, transparent 60.5%), radial-gradient(100% 50% at 80% 100%, oklch(0.46 0.07 320) 0 70%, transparent 70.5%), linear-gradient(180deg, oklch(0.72 0.12 35), oklch(0.86 0.09 75))",
  // Morning on the studio wall.
  "linear-gradient(112deg, transparent 32%, oklch(0.95 0.06 85 / 0.85) 32% 54%, transparent 54%), linear-gradient(180deg, oklch(0.72 0.05 60), oklch(0.56 0.05 48))",
];

const PICTURES = ROLL.map((fill) => (
  <div key={fill} className="size-full" style={{ background: fill }} />
));

/**
 * Coldbrook Film Lab's light table: run the pointer across it and the roll
 * spills out in prints that land, settle and clear away in order.
 */
export function PhotoScatterDemo({
  chrome = true,
  // The prints are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [dropped, setDropped] = React.useState(0);
  const [pinned, setPinned] = React.useState(false);

  const table = (
    <PhotoScatter
      images={PICTURES}
      origin={[0.74, 0.4]}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1",
        chrome ? "h-64" : "h-52",
      )}
      onDrop={({ total, pinned: pin }) => {
        setDropped(total);
        setPinned(pin);
      }}
      {...values}
    >
      <div className="flex size-full flex-col items-start justify-end p-4 sm:p-5">
        <div className="flex max-w-[15rem] flex-col items-start gap-2 rounded-3 bg-background/85 px-3 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Film Lab · roll 14
          </p>
          <p className="text-base leading-snug font-semibold tracking-tight text-balance text-foreground">
            Thirty-six frames of a slow summer.
          </p>
          {chrome ? (
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              See the roll
            </button>
          ) : null}
        </div>
      </div>
    </PhotoScatter>
  );

  if (!chrome) return <div className="flex w-full">{table}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {table}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {pinned ? (
          <>
            <span className="text-signal">pinned</span> · press again to lift it
          </>
        ) : dropped > 0 ? (
          <>
            <span className="text-signal">
              {dropped} {dropped === 1 ? "print" : "prints"} dropped
            </span>{" "}
            · press to pin one
          </>
        ) : (
          <>
            <span className="text-signal">on the table</span> · move across it
            or press Tab
          </>
        )}
      </p>
    </div>
  );
}
