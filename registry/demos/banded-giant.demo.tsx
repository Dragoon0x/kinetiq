"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BandedGiant } from "@/registry/ui/banded-giant";

export const tweaks = defineTweaks({
  bandSpeed: {
    kind: "range",
    label: "Bands",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  ringTilt: {
    kind: "range",
    label: "Ring tilt",
    default: 22,
    min: 0,
    max: 40,
    step: 2,
    unit: "°",
  },
  charSet: {
    kind: "choice",
    label: "Glyphs",
    default: "classic",
    options: ["classic", "blocks", "dots"],
    names: { classic: "Classic", blocks: "Blocks", dots: "Dots" },
  },
});

/** A handful of fixed stars, as background art: the same on server and client. */
const STARS = [
  [6, 14, 1],
  [14, 78, 1.5],
  [22, 40, 1],
  [31, 88, 1],
  [44, 8, 1.5],
  [58, 92, 1],
  [67, 22, 1],
  [76, 70, 1.5],
  [84, 12, 1],
  [91, 52, 1],
  [12, 58, 1],
  [52, 64, 1],
] as const;

const SKY = {
  backgroundColor: "oklch(0.17 0.02 262)",
  backgroundImage: STARS.map(
    ([x, y, r]) =>
      `radial-gradient(circle at ${x}% ${y}%, oklch(0.98 0.01 90 / 0.55) ${r}px, transparent ${r + 0.5}px)`,
  ).join(", "),
};

/**
 * Fieldline Observatory, tonight's sky: the giant at opposition in the
 * eyepiece, its ring open, a moon now and then crossing in front.
 */
export function BandedGiantDemo({
  chrome = true,
  // The planet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [transits, setTransits] = React.useState(0);
  const [crossing, setCrossing] = React.useState(false);
  const timer = React.useRef(0);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const sky = (
    <div
      className="w-full overflow-clip rounded-3 border border-hairline"
      style={SKY}
    >
      <BandedGiant
        label="The giant in tonight's sky"
        onTransit={() => {
          setTransits((n) => n + 1);
          setCrossing(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCrossing(false), 2200);
        }}
        className={chrome ? "h-60 w-full" : "h-52 w-full"}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full">{sky}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline Observatory
          </p>
          <p className="text-base font-medium text-foreground">
            Tonight · the giant at opposition
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Book the telescope
        </button>
      </div>
      {sky}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {crossing ? (
          <>
            <span className="text-signal">transit</span> · the moon is crossing
          </>
        ) : (
          <>
            <span className="text-signal">bands shearing</span> ·{" "}
            {transits === 0
              ? "drag to spin and tip"
              : `${transits} ${transits === 1 ? "transit" : "transits"} tonight`}
          </>
        )}
      </p>
    </div>
  );
}
