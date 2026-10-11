"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RatioLoop } from "@/registry/ui/ratio-loop";

export const tweaks = defineTweaks({
  ratio: {
    kind: "choice",
    label: "Ratio",
    default: "3:2",
    options: ["2:1", "3:2", "4:3", "5:4"],
    names: { "2:1": "2 : 1", "3:2": "3 : 2", "4:3": "4 : 3", "5:4": "5 : 4" },
  },
  width: {
    kind: "range",
    label: "Width",
    default: 10,
    min: 2,
    max: 24,
    step: 1,
    unit: "px",
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 3,
    min: 0,
    max: 12,
    step: 1,
    unit: "rpm",
  },
});

/**
 * Gaugeworks Signal Lab's resonance card: two oscillators drawn as one
 * ribbon, retied whenever the ratio between them changes.
 */
export function RatioLoopDemo({
  chrome = true,
  // The ribbon is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [ratio, setRatio] = React.useState<string>(values.ratio ?? "3:2");
  const [tweaked, setTweaked] = React.useState(values.ratio);
  const [from, setFrom] = React.useState<string | null>(null);
  const [orbiting, setOrbiting] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  // A new ratio from the panel retunes the figure like a chip would.
  if (values.ratio !== tweaked) {
    setTweaked(values.ratio);
    if (values.ratio) setRatio(values.ratio);
  }

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onRatioChange = (next: string) => {
    setFrom(ratio);
    setRatio(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setFrom(null);
    }, 700);
  };

  const loop = (
    <RatioLoop
      {...values}
      ratio={ratio}
      onRatioChange={onRatioChange}
      onOrbitChange={setOrbiting}
      label="Resonance figure"
      className={chrome ? "h-72 w-full" : "h-52 w-full"}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-xs">{loop}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · resonance
        </p>
        <p className="font-mono text-[10px] text-ink-3 tabular-nums">f₁ : f₂</p>
      </div>
      <div className="w-full max-w-xs self-center">{loop}</div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {orbiting ? (
          <>
            <span className="text-signal">orbiting</span> · {ratio}
          </>
        ) : from ? (
          <>
            <span className="text-signal">retying</span> · {from} → {ratio}
          </>
        ) : (
          <>
            <span className="text-signal">{ratio}</span> · tied
          </>
        )}
      </p>
    </div>
  );
}
