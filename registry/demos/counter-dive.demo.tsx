"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CounterDive, type CounterDivePhase } from "@/registry/ui/counter-dive";

export const tweaks = defineTweaks({
  weight: {
    kind: "range",
    label: "Weight",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  zoom: {
    kind: "range",
    label: "Zoom",
    default: 90,
    min: 40,
    max: 200,
    step: 10,
  },
  range: {
    kind: "range",
    label: "Range",
    default: 900,
    min: 400,
    max: 1600,
    step: 100,
    unit: "px",
  },
});

const SAYS: Record<CounterDivePhase, string> = {
  word: "scroll to dive into the O",
  diving: "through the hole",
  through: "in the picture",
};

/**
 * Coldbrook, a lodge at the head of the valley: the landing page dives
 * through the O of BROOK into the valley at dusk.
 */
export function CounterDiveDemo({
  chrome = true,
  // The dive is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = React.useState<CounterDivePhase>("word");
  const [progress, setProgress] = React.useState(0);
  const box = chrome ? 480 : 540;

  const page = (
    <div
      ref={boxRef}
      tabIndex={0}
      role="region"
      aria-label="Coldbrook"
      className="w-full overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-background outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      style={{ height: box }}
    >
      <div className="flex flex-col gap-1.5 px-6 pt-6 pb-4">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook · A lodge at the head of the valley
        </p>
        <p className="max-w-prose text-sm text-ink-2">
          Twelve rooms, one fire, and the brook under the window. Scroll down.
        </p>
      </div>
      <CounterDive
        word="BROOK"
        height={box - 2}
        onPhaseChange={setPhase}
        onProgressChange={setProgress}
        {...values}
      >
        <p className="font-mono text-[10px] tracking-[0.08em] text-[oklch(0.96_0.02_85)] uppercase opacity-85">
          Coldbrook · October
        </p>
        <p className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance text-[oklch(0.99_0.01_85)]">
          The valley, at the hour the brook catches the sun.
        </p>
      </CounterDive>
      <div className="flex flex-col gap-3 px-6 pt-6 pb-10 text-sm text-ink-2">
        <p className="max-w-prose">
          Rooms open from April to November. Breakfast is served by the fire
          from seven; the path down to the water starts at the back door.
        </p>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{page}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {page}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{phase}</span>
          {phase === "diving" ? ` · ${Math.round(progress * 100)}%` : ""} ·{" "}
          {SAYS[phase]}
        </p>
        <button
          type="button"
          onClick={() =>
            boxRef.current?.scrollTo({
              top: 0,
              behavior: motionSafe ? "smooth" : "auto",
            })
          }
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Back to top
        </button>
      </div>
    </div>
  );
}
